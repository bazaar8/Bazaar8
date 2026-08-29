const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getDatabase } = require("firebase-admin/database");
const serviceAccount = require("./serviceAccountKey.json");
const serviceAccount = process.env.SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.SERVICE_ACCOUNT_JSON)
  : require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://bazaar8-123-default-rtdb.asia-southeast1.firebasedatabase.app/"
});

const db = getDatabase();
const dbFirestore = getFirestore();
let tickCount = 0;

async function runIPOAutomator() {
  console.log("🚀 Auto-IPO Engine active. Monitoring schedules and admin triggers...");
  
  setInterval(async () => {
    try {
      const now = Date.now();
      const iposSnap = await dbFirestore.collection('ipos').get();
      
      for (const doc of iposSnap.docs) {
        const ipo = { id: doc.id, ...doc.data() };
        
        if (ipo.status === "upcoming" && ipo.openTime && now >= ipo.openTime) {
          await dbFirestore.collection("ipos").doc(ipo.id).update({ status: "open" });
        }
        
        if (
          (ipo.status === "open" && ipo.closeTime && now >= ipo.closeTime) || 
          (ipo.triggerAllotment)
        ) {
          console.log(`🔴 Running Lottery Allotment for: ${ipo.ticker}`);
          
          const subsSnap = await dbFirestore.collection("ipos").doc(ipo.id).collection("subscriptions").get();
          const availableLots = Number(ipo.totalLots) || 0;
          const lotSize = Number(ipo.lotSize) || 1;
          const pricePerShare = Number(ipo.price) || 0;
          const pricePerLot = lotSize * pricePerShare;
          
          let lotteryPool = [];
          subsSnap.docs.forEach(subDoc => {
            const sub = subDoc.data();
            const reqLots = sub.requestedLots || Math.max(1, Math.floor((sub.requestedShares || 1) / lotSize));
            for (let i = 0; i < reqLots; i++) {
              lotteryPool.push({ subId: subDoc.id, uid: sub.uid });
            }
          });

          for (let i = lotteryPool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [lotteryPool[i], lotteryPool[j]] = [lotteryPool[j], lotteryPool[i]];
          }

          const winningTickets = lotteryPool.slice(0, availableLots);
          const winCountsBySub = {};
          winningTickets.forEach(ticket => {
            winCountsBySub[ticket.subId] = (winCountsBySub[ticket.subId] || 0) + 1;
          });

          const batch = dbFirestore.batch();
          
          for (const subDoc of subsSnap.docs) {
            const sub = subDoc.data();
            const reqLots = sub.requestedLots || Math.max(1, Math.floor((sub.requestedShares || 1) / lotSize));
            const costBlocked = sub.investedAmount || (reqLots * pricePerLot);
            
            const wonLots = winCountsBySub[subDoc.id] || 0;
            const allocatedShares = wonLots * lotSize;
            const actualCost = allocatedShares * pricePerShare;
            const refundAmount = costBlocked - actualCost;

            batch.update(subDoc.ref, { 
              allocatedLots: wonLots, 
              allocatedShares: allocatedShares, 
              status: wonLots > 0 ? "won" : "lost",
              refundedAmount: refundAmount
            });

            if (refundAmount > 0) {
              batch.update(dbFirestore.collection("users").doc(sub.uid), { 
                cashBalance: FieldValue.increment(refundAmount) 
              });
            }

            if (allocatedShares > 0) {
              batch.set(dbFirestore.collection("users").doc(sub.uid).collection("holdings").doc(`${ipo.ticker}_long`), { 
                ticker: ipo.ticker, 
                positionType: "long", 
                quantity: FieldValue.increment(allocatedShares), 
                avgPrice: pricePerShare 
              }, { merge: true });
            }
          }
          
          batch.update(dbFirestore.collection("ipos").doc(ipo.id), { 
            status: "allotted",
            triggerAllotment: FieldValue.delete() 
          });
          await batch.commit();
          console.log(`✅ Allotment finished for ${ipo.ticker}.`);
        }
        
        if (
          (ipo.status === "allotted" && ipo.listTime && now >= ipo.listTime) || 
          (ipo.triggerListing)
        ) {
          console.log(`🚀 Listing ${ipo.ticker} on Secondary Market`);
          const listingPrice = Number(ipo.price) * (1 + ((Number(ipo.listingPremiumPct) || 0) / 100));
          
          await dbFirestore.collection("ipos").doc(ipo.id).update({ 
            status: "listed",
            triggerListing: FieldValue.delete() 
          });
          
          await db.ref(`livePrices/${ipo.ticker}`).set({ 
            price: Number(listingPrice.toFixed(2)), 
            basePrice: Number(listingPrice.toFixed(2)), 
            name: ipo.name || ipo.ticker,
            sector: ipo.sector || "IPO",
            volatility: 0.008,
            isIPO: true,
            timestamp: now
          });
        }
      }
    } catch (e) {
      console.error("IPO Engine Error:", e);
    }
  }, 5000);
}

async function runLeaderboardEngine() {
  const usersState = new Map();
  const holdingsState = new Map();

  dbFirestore.collection('users').onSnapshot(snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'removed') {
        usersState.delete(change.doc.id);
      } else {
        usersState.set(change.doc.id, change.doc.data());
      }
    });
  });

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
    try {
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
          displayName: user.name || (user.email ? user.email.split('@')[0] : 'Trader'),
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
    } catch (e) {
      console.error("Leaderboard Engine Error:", e);
    }
  }, 10000);
}

async function runMarketEngine() {
  const statusRef = db.ref("marketStatus/state");
  const livePricesRef = db.ref("livePrices");
  const historyRef = db.ref("priceHistory");
  const influenceRef = db.ref("marketInfluence");
  const tickIntervalMs = 1200;

  setInterval(async () => {
    try {
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
      
      const finishedEvents = new Set();
      
      for (const ticker of allTickers) {
        const stockData = currentPrices[ticker];
        let oldPrice = stockData.price;
        const frontendBasePrice = stockData.basePrice || oldPrice;
        let engineBase = stockData.engineBasePrice || frontendBasePrice;
        
        const volatility = stockData.volatility || 0.005;
        
        let eventBias = 0;
        let currentTargetMultiplier = 1;
        let isNewsActive = false;
        
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
              
              const cumulativeImpactRatio = (1 - Math.cos(progress * Math.PI)) / 2;
              currentTargetMultiplier += (targetImpactPct * cumulativeImpactRatio);
              
              if (targetImpactPct !== 0) isNewsActive = true;
              
            } else if (elapsedMs > durationMs) {
              engineBase = engineBase * (1 + targetImpactPct);
              finishedEvents.add(eventId); 
            }
          }
        }
        
        const dynamicBasePrice = engineBase * currentTargetMultiplier;
        const maxPrice = dynamicBasePrice * 1.03; 
        const minPrice = dynamicBasePrice * 0.97; 
        
        let randomWalk = (Math.random() - 0.5) * volatility;
        if (randomWalk > 0.02) randomWalk = 0.02; 
        if (randomWalk < -0.02) randomWalk = -0.02;
        
        let newPrice = oldPrice * (1 + randomWalk + eventBias);
        
        if (newPrice > maxPrice) newPrice = maxPrice;
        if (newPrice < minPrice) newPrice = minPrice;
        if (newPrice < 0.01) newPrice = 0.01;
        
        newPricesUpdate[ticker] = {
          ...stockData,
          basePrice: frontendBasePrice,
          engineBasePrice: engineBase,
          price: Number(newPrice.toFixed(2)),
          timestamp: now
        };
        
        if (tickCount % 10 === 0) {
          historyUpdate[`${ticker}/${now}`] = Number(newPrice.toFixed(2));
        }
      }
      
      await livePricesRef.update(newPricesUpdate);
      if (tickCount % 10 === 0) await historyRef.update(historyUpdate);
      
      for (const eventId of finishedEvents) {
        await influenceRef.child(eventId).remove();
        await dbFirestore.collection('newsEvents').doc(eventId).update({ status: 'completed' });
      }
    } catch (e) {
      console.error("Market Engine Error:", e);
    }
  }, tickIntervalMs);
}

runIPOAutomator();
runLeaderboardEngine();
runMarketEngine();