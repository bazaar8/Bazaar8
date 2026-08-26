const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getDatabase } = require("firebase-admin/database");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://bazaar8-123-default-rtdb.asia-southeast1.firebasedatabase.app/"
});

const db = getDatabase();
const dbFirestore = getFirestore();
let tickCount = 0;

async function runIPOAutomator() {
  setInterval(async () => {
    try {
      const now = Date.now();
      const iposSnap = await dbFirestore.collection('ipos').get();
      for (const doc of iposSnap.docs) {
        const ipo = doc.data();
        if (ipo.status === 'upcoming' && now >= ipo.openTime) {
          await dbFirestore.collection('ipos').doc(doc.id).update({ status: 'open' });
        } else if (ipo.status === 'open' && now >= ipo.closeTime) {
          await dbFirestore.collection('ipos').doc(doc.id).update({ status: 'closed' });
        }
      }
    } catch (e) {}
  }, 5000);
}

async function runLeaderboardEngine() {
  const usersState = new Map();
  const holdingsState = new Map();

  // 1. Listen for User updates and removals
  dbFirestore.collection('users').onSnapshot(snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'removed') {
        usersState.delete(change.doc.id);
      } else {
        usersState.set(change.doc.id, change.doc.data());
      }
    });
  });

  // 2. Listen for Holding updates and REMOVE sold stocks from memory
  dbFirestore.collectionGroup('holdings').onSnapshot(snap => {
    snap.docChanges().forEach(change => {
      const doc = change.doc;
      const uid = doc.ref.parent.parent.id;
      
      if (!holdingsState.has(uid)) holdingsState.set(uid, new Map());
      
      if (change.type === 'removed') {
        holdingsState.get(uid).delete(doc.id);
      } else {
        holdingsState.get(uid).set(doc.id, doc.data());
      }
    });
  });

  setInterval(async () => {
    const pricesSnap = await db.ref('livePrices').once('value');
    const livePrices = pricesSnap.val() || {};
    const leaderboard = [];

    for (const [uid, user] of usersState.entries()) {
      if (user.role === 'admin') continue;
      
      let longValue = 0, shortLiability = 0;
      const userHoldings = holdingsState.get(uid);
      
      if (userHoldings) {
        for (const holding of userHoldings.values()) {
          const currentPrice = livePrices[holding.ticker]?.price || holding.avgPrice;
          if (holding.positionType === 'long') longValue += holding.quantity * currentPrice;
          else if (holding.positionType === 'short') shortLiability += holding.quantity * currentPrice;
        }
      }
      
      const startingCapital = user.startingBalance || 1000000;
      const cash = user.cashBalance || 0;
      const totalValue = cash + longValue - shortLiability;
      const returnPct = ((totalValue - startingCapital) / startingCapital) * 100;
      
      leaderboard.push({
        uid,
        displayName: user.name || user.email.split('@')[0],
        portfolioValue: Number(totalValue.toFixed(2)),
        returnPct: Number(returnPct.toFixed(2))
      });
    }
    
    leaderboard.sort((a, b) => b.portfolioValue - a.portfolioValue);
    const rankedLeaderboard = leaderboard.map((entry, index) => ({ ...entry, rank: index + 1 }));
    
    await dbFirestore.collection('leaderboard').doc('main').set({
      lastUpdated: FieldValue.serverTimestamp(),
      rankings: rankedLeaderboard
    });
  }, 10000);
}

async function runMarketEngine() {
  const statusRef = db.ref("marketStatus/state");
  const livePricesRef = db.ref("livePrices");
  const historyRef = db.ref("priceHistory");
  const influenceRef = db.ref("marketInfluence");
  const tickIntervalMs = 1200;

  setInterval(async () => {
    const statusSnap = await statusRef.once("value");
    if ((statusSnap.val() || "CLOSED") !== "OPEN") return;
    
    tickCount++;
    const now = Date.now();
    const currentPricesSnap = await livePricesRef.once("value");
    const currentPrices = currentPricesSnap.val() || {};
    const influenceSnap = await influenceRef.once("value");
    const influences = influenceSnap.val() || {};
    
    const newPricesUpdate = {};
    const historyUpdate = {};
    const allTickers = Object.keys(currentPrices);
    
    if (allTickers.length === 0) return;
    
    for (const ticker of allTickers) {
      const stockData = currentPrices[ticker];
      let oldPrice = stockData.price;
      const volatility = stockData.volatility || 0.005;
      let eventBias = 0;
      
      for (const [eventId, inf] of Object.entries(influences)) {
        if (inf.status === 'active' && inf.impacts && inf.impacts[ticker] !== undefined) {
          const targetImpactPct = inf.impacts[ticker] / 100;
          const elapsedMs = now - inf.startTime;
          const durationMs = inf.durationMinutes * 60 * 1000;
          
          if (elapsedMs > 0 && elapsedMs <= durationMs) {
            const progress = elapsedMs / durationMs;
            const curve = Math.sin(progress * Math.PI);
            const totalTicks = durationMs / tickIntervalMs;
            const baseImpactPerTick = targetImpactPct / totalTicks;
            eventBias += baseImpactPerTick * (Math.PI / 2) * curve;
          } else if (elapsedMs > durationMs) {
            await influenceRef.child(eventId).remove();
            await dbFirestore.collection('newsEvents').doc(eventId).update({ status: 'completed' });
          }
        }
      }
      
      // GENERATE BASE RANDOM WALK
      let randomWalk = (Math.random() - 0.5) * volatility;
      
      // NEW LOGIC: Cap standard random fluctuation to +/- 2%
      if (randomWalk > 0.02) randomWalk = 0.02;
      if (randomWalk < -0.02) randomWalk = -0.02;
      
      // APPLY TOTAL MOVEMENT (News bias ignores the 2% cap!)
      let newPrice = oldPrice * (1 + randomWalk + eventBias);
      
      if (newPrice < 0.01) newPrice = 0.01;
      
      newPricesUpdate[ticker] = {
        ...stockData,
        price: Number(newPrice.toFixed(2)),
        timestamp: now
      };
      
      if (tickCount % 10 === 0) {
        historyUpdate[`${ticker}/${now}`] = Number(newPrice.toFixed(2));
      }
    }
    
    await livePricesRef.update(newPricesUpdate);
    if (tickCount % 10 === 0) await historyRef.update(historyUpdate);
    
  }, tickIntervalMs);
}

runIPOAutomator();
runLeaderboardEngine();
runMarketEngine();