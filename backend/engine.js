const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getDatabase } = require("firebase-admin/database");

const serviceAccount = require("./serviceAccountKey.json");

// 1. MODULAR INITIALIZATION FIX
initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://bazaar8-123-default-rtdb.asia-southeast1.firebasedatabase.app/" // <-- DO NOT FORGET TO REPLACE THIS WITH YOUR REAL URL
});

const db = getDatabase();
const dbFirestore = getFirestore();

const sampleStocks = {
  "TECH": { basePrice: 150.00, volatility: 0.003 },
  "BANK": { basePrice: 85.50, volatility: 0.0015 },
  "AUTO": { basePrice: 42.00, volatility: 0.004 }
};

let tickCount = 0;

async function runLeaderboardEngine() {
  const usersState = new Map();
  const holdingsState = new Map();

  dbFirestore.collection('users').onSnapshot(snap => {
    snap.docs.forEach(doc => {
      usersState.set(doc.id, doc.data());
    });
  });

  dbFirestore.collectionGroup('holdings').onSnapshot(snap => {
    snap.docs.forEach(doc => {
      const uid = doc.ref.parent.parent.id;
      if (!holdingsState.has(uid)) {
        holdingsState.set(uid, new Map());
      }
      holdingsState.get(uid).set(doc.id, doc.data());
    });
  });

  setInterval(async () => {
    const pricesSnap = await db.ref('livePrices').once('value');
    const livePrices = pricesSnap.val() || {};

    const leaderboard = [];

    for (const [uid, user] of usersState.entries()) {
      if (user.role === 'admin') continue;

      let longValue = 0;
      let shortLiability = 0;

      const userHoldings = holdingsState.get(uid);
      if (userHoldings) {
        for (const holding of userHoldings.values()) {
          const currentPrice = livePrices[holding.ticker]?.price || holding.avgPrice;
          
          if (holding.positionType === 'long') {
            longValue += holding.quantity * currentPrice;
          } else if (holding.positionType === 'short') {
            shortLiability += holding.quantity * currentPrice;
          }
        }
      }

      const startingCapital = user.startingBalance || user.startingCapital || 1000000;
      const cash = user.cashBalance || user.cash || 0;
      const totalValue = cash + longValue - shortLiability;
      const returnPct = ((totalValue - startingCapital) / startingCapital) * 100;

      leaderboard.push({
        uid,
        displayName: user.name || user.displayName || user.email.split('@')[0],
        portfolioValue: Number(totalValue.toFixed(2)),
        returnPct: Number(returnPct.toFixed(2))
      });
    }

    leaderboard.sort((a, b) => b.portfolioValue - a.portfolioValue);

    const rankedLeaderboard = leaderboard.map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));

    // 2. FIELDVALUE FIX
    await dbFirestore.collection('leaderboard').doc('main').set({
      lastUpdated: FieldValue.serverTimestamp(),
      rankings: rankedLeaderboard
    });

  }, 10000);
}

runLeaderboardEngine();

async function runMarketEngine() {
  const statusRef = db.ref("marketStatus/state");
  const livePricesRef = db.ref("livePrices");
  const historyRef = db.ref("priceHistory");
  const influenceRef = db.ref("marketInfluence");

  setInterval(async () => {
    const statusSnap = await statusRef.once("value");
    const status = statusSnap.val() || "CLOSED";

    if (status === "OPEN") {
      tickCount++;
      const now = Date.now();
      
      const currentPricesSnap = await livePricesRef.once("value");
      const currentPrices = currentPricesSnap.val() || {};
      
      const influenceSnap = await influenceRef.once("value");
      const influences = influenceSnap.val() || {};
      
      const newPricesUpdate = {};
      const historyUpdate = {};

      for (const [ticker, config] of Object.entries(sampleStocks)) {
        let oldPrice = currentPrices[ticker] ? currentPrices[ticker].price : config.basePrice;
        let eventBias = 0;

        for (const [eventId, inf] of Object.entries(influences)) {
          if (inf.status === 'active' && inf.targetTickers.includes(ticker)) {
            const elapsedMs = now - inf.startTime;
            const durationMs = inf.durationMinutes * 60 * 1000;

            if (elapsedMs > 0 && elapsedMs <= durationMs) {
              const progress = elapsedMs / durationMs;
              const curve = Math.sin(progress * Math.PI);
              const dirMultiplier = inf.impactDirection === 'positive' ? 1 : (inf.impactDirection === 'negative' ? -1 : 0);
              eventBias += dirMultiplier * inf.impactStrength * curve;
            } else if (elapsedMs > durationMs) {
              await influenceRef.child(eventId).remove();
              await dbFirestore.collection('newsEvents').doc(eventId).update({ status: 'completed' });
            }
          }
        }
        
        const randomWalk = (Math.random() - 0.5) * config.volatility;
        const totalChangePercent = randomWalk + eventBias;
        
        let newPrice = oldPrice * (1 + totalChangePercent);
        
        if (newPrice < 0.01) {
          newPrice = 0.01;
        }

        newPricesUpdate[ticker] = {
          price: Number(newPrice.toFixed(2)),
          timestamp: now
        };

        if (tickCount % 10 === 0) {
          historyUpdate[`${ticker}/${now}`] = Number(newPrice.toFixed(2));
        }
      }

      await livePricesRef.update(newPricesUpdate);
      
      if (tickCount % 10 === 0) {
        await historyRef.update(historyUpdate);
      }
    }
  }, 1200);
}

runMarketEngine();