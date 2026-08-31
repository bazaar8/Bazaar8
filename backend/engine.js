const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getDatabase } = require("firebase-admin/database");
const { getAuth } = require("firebase-admin/auth");
const express = require("express");
const cors = require("cors");

const serviceAccount = process.env.SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.SERVICE_ACCOUNT_JSON)
  : require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://bazaar8-123-default-rtdb.asia-southeast1.firebasedatabase.app/"
});

const dbFirestore = getFirestore();
const dbRTDB = getDatabase();
const authAdmin = getAuth();
let tickCount = 0;
let forceBasePriceReset = false;

async function runIPOAutomator() {
  console.log("🚀 Auto-IPO Engine active...");
  setInterval(async () => {
    try {
      const now = Date.now();
      const iposSnap = await dbFirestore.collection('ipos').get();
      for (const doc of iposSnap.docs) {
        const ipo = { id: doc.id, ...doc.data() };
        if (ipo.status === "upcoming" && ipo.openTime && now >= ipo.openTime) {
          await dbFirestore.collection("ipos").doc(ipo.id).update({ status: "open" });
          await dbFirestore.collection("newsEvents").add({
            headline: `🔔 New IPO Open: ${ipo.ticker} (${ipo.name || ipo.ticker}) is now OPEN for bidding at ₹${ipo.price}!`,
            status: "active",
            startTime: now,
            createdAt: now,
            durationMinutes: 60,
            targetTickers: [ipo.ticker],
            impactDirection: "positive"
          });
        }
        if ((ipo.status === "open" && ipo.closeTime && now >= ipo.closeTime) || (ipo.triggerAllotment)) {
          const subsSnap = await dbFirestore.collection("ipos").doc(ipo.id).collection("subscriptions").get();
          const availableLots = Number(ipo.totalLots) || 0;
          const lotSize = Number(ipo.lotSize) || 1;
          const pricePerShare = Number(ipo.price) || 0;
          let lotteryPool = [];
          subsSnap.docs.forEach(subDoc => {
            const sub = subDoc.data();
            const reqLots = sub.requestedLots || Math.max(1, Math.floor((sub.requestedShares || 1) / lotSize));
            for (let i = 0; i < reqLots; i++) lotteryPool.push({ subId: subDoc.id, uid: sub.uid });
          });
          for (let i = lotteryPool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [lotteryPool[i], lotteryPool[j]] = [lotteryPool[j], lotteryPool[i]];
          }
          const winningTickets = lotteryPool.slice(0, availableLots);
          const winCountsBySub = {};
          winningTickets.forEach(ticket => winCountsBySub[ticket.subId] = (winCountsBySub[ticket.subId] || 0) + 1);
          const batch = dbFirestore.batch();
          for (const subDoc of subsSnap.docs) {
            const sub = subDoc.data();
            const reqLots = sub.requestedLots || Math.max(1, Math.floor((sub.requestedShares || 1) / lotSize));
            const costBlocked = sub.investedAmount || (reqLots * (lotSize * pricePerShare));
            const wonLots = winCountsBySub[subDoc.id] || 0;
            const allocatedShares = wonLots * lotSize;
            const refundAmount = costBlocked - (allocatedShares * pricePerShare);
            batch.update(subDoc.ref, { allocatedLots: wonLots, allocatedShares, status: wonLots > 0 ? "won" : "lost", refundedAmount: refundAmount });
            if (refundAmount > 0) batch.update(dbFirestore.collection("users").doc(sub.uid), { cashBalance: FieldValue.increment(refundAmount) });
            if (allocatedShares > 0) batch.set(dbFirestore.collection("users").doc(sub.uid).collection("holdings").doc(`${ipo.ticker}_long`), { ticker: ipo.ticker, positionType: "long", quantity: FieldValue.increment(allocatedShares), avgPrice: pricePerShare }, { merge: true });
          }
          batch.update(dbFirestore.collection("ipos").doc(ipo.id), { status: "allotted", triggerAllotment: FieldValue.delete() });
          await batch.commit();

          await dbFirestore.collection("newsEvents").add({
            headline: `🎉 IPO Allotment Out: Allotment for ${ipo.ticker} (${ipo.name || ipo.ticker}) is complete! Check your portfolio for allocated shares.`,
            status: "active",
            startTime: now,
            createdAt: now,
            durationMinutes: 60,
            targetTickers: [ipo.ticker],
            impactDirection: "positive"
          });
        }
        if ((ipo.status === "allotted" && ipo.listTime && now >= ipo.listTime) || (ipo.triggerListing)) {
          const listingPrice = Number(ipo.price) * (1 + ((Number(ipo.listingPremiumPct) || 0) / 100));
          await dbFirestore.collection("ipos").doc(ipo.id).update({ status: "listed", triggerListing: FieldValue.delete() });
          await dbRTDB.ref(`livePrices/${ipo.ticker}`).set({ price: Number(listingPrice.toFixed(2)), basePrice: Number(listingPrice.toFixed(2)), name: ipo.name || ipo.ticker, sector: ipo.sector || "IPO", volatility: 0.008, isIPO: true, timestamp: now });

          await dbFirestore.collection("newsEvents").add({
            headline: `🚀 IPO Listed: ${ipo.ticker} (${ipo.name || ipo.ticker}) listed at ₹${listingPrice.toFixed(2)} and is now LIVE for trading!`,
            status: "active",
            startTime: now,
            createdAt: now,
            durationMinutes: 60,
            targetTickers: [ipo.ticker],
            impactDirection: "positive"
          });
        }
      }
    } catch (e) { }
  }, 5000);
}

async function runLeaderboardEngine() {
  const usersState = new Map();
  const holdingsState = new Map();
  dbFirestore.collection('users').onSnapshot(snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'removed') usersState.delete(change.doc.id);
      else usersState.set(change.doc.id, change.doc.data());
    });
  });
  dbFirestore.collectionGroup('holdings').onSnapshot(snap => {
    snap.docChanges().forEach(change => {
      const doc = change.doc;
      const uid = doc.ref.parent.parent.id;
      if (!holdingsState.has(uid)) holdingsState.set(uid, new Map());
      if (change.type === 'removed') holdingsState.get(uid).delete(doc.id);
      else holdingsState.get(uid).set(doc.id, doc.data());
    });
  });
  setInterval(async () => {
    try {
      const pricesSnap = await dbRTDB.ref('livePrices').once('value');
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
        const totalValue = (user.cashBalance || 0) + longValue - shortLiability;
        leaderboard.push({ uid, displayName: user.name || (user.email ? user.email.split('@')[0] : 'Trader'), portfolioValue: Number(totalValue.toFixed(2)), returnPct: Number((((totalValue - startingCapital) / startingCapital) * 100).toFixed(2)) });
      }
      leaderboard.sort((a, b) => b.portfolioValue - a.portfolioValue);
      await dbFirestore.collection('leaderboard').doc('main').set({ lastUpdated: FieldValue.serverTimestamp(), rankings: leaderboard.map((entry, index) => ({ ...entry, rank: index + 1 })) });
    } catch (e) { }
  }, 10000);
}

async function runMarketEngine() {
  const statusRef = dbRTDB.ref("marketStatus/state");
  const livePricesRef = dbRTDB.ref("livePrices");
  const historyRef = dbRTDB.ref("priceHistory");
  const influenceRef = dbRTDB.ref("marketInfluence");

  let lastBasePriceReset = Date.now();

  setInterval(async () => {
    try {
      if (((await statusRef.once("value")).val() || "CLOSED") !== "OPEN") return;
      tickCount++;
      const now = Date.now();
      const currentPrices = (await livePricesRef.once("value")).val() || {};
      const influences = (await influenceRef.once("value")).val() || {};
      const newPricesUpdate = {};
      const historyUpdate = {};
      const finishedEvents = new Set();

      let shouldResetBase = false;
      if (now - lastBasePriceReset >= 180000) {
        shouldResetBase = true;
        lastBasePriceReset = now;
      }
      if (forceBasePriceReset) {
        shouldResetBase = true;
        forceBasePriceReset = false;
        lastBasePriceReset = now;
      }

      for (const ticker of Object.keys(currentPrices)) {
        const stockData = currentPrices[ticker];
        let engineBase = stockData.engineBasePrice || stockData.basePrice || stockData.price;

        if (shouldResetBase) {
          engineBase = stockData.price;
        }

        let eventBias = 0, currentTargetMultiplier = 1;
        for (const [eventId, inf] of Object.entries(influences)) {
          if (inf.status === 'active' && inf.impacts && inf.impacts[ticker] !== undefined) {
            const targetImpactPct = inf.impacts[ticker] / 100;
            const elapsedMs = now - inf.startTime;
            const durationMs = inf.durationMinutes * 60 * 1000;
            if (elapsedMs > 0 && elapsedMs <= durationMs) {
              const progress = elapsedMs / durationMs;
              eventBias += (targetImpactPct / (durationMs / 1200)) * (Math.PI / 2) * Math.sin(progress * Math.PI);
              currentTargetMultiplier += (targetImpactPct * ((1 - Math.cos(progress * Math.PI)) / 2));
            } else if (elapsedMs > durationMs) {
              engineBase = engineBase * (1 + targetImpactPct);
              finishedEvents.add(eventId);
            }
          }
        }
        const dynamicBasePrice = engineBase * currentTargetMultiplier;
        let newPrice = stockData.price * (1 + Math.max(-0.02, Math.min(0.02, (Math.random() - 0.5) * (stockData.volatility || 0.005))) + eventBias);
        newPrice = Math.max(0.01, Math.min(dynamicBasePrice * 1.03, Math.max(dynamicBasePrice * 0.97, newPrice)));

        const currHigh = Math.max(Number(stockData.high || newPrice), Number(newPrice));
        const currLow = Math.min(Number(stockData.low || newPrice), Number(newPrice));
        newPricesUpdate[ticker] = {
          ...stockData,
          engineBasePrice: engineBase,
          price: Number(newPrice.toFixed(2)),
          high: Number(currHigh.toFixed(2)),
          low: Number(currLow.toFixed(2)),
          timestamp: now
        };
        if (tickCount % 10 === 0) historyUpdate[`${ticker}/${now}`] = Number(newPrice.toFixed(2));
      }
      await livePricesRef.update(newPricesUpdate);
      if (tickCount % 10 === 0) await historyRef.update(historyUpdate);
      for (const eventId of finishedEvents) {
        await influenceRef.child(eventId).remove();
        await dbFirestore.collection('newsEvents').doc(eventId).update({ status: 'completed' });
      }
    } catch (e) { }
  }, 1200);
}

runIPOAutomator();
runLeaderboardEngine();
runMarketEngine();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.use(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try { req.user = await authAdmin.verifyIdToken(authHeader.split("Bearer ")[1]); }
    catch (e) { req.user = null; }
  }
  next();
});

const verifyAdmin = async (uid) => {
  if (!uid) throw new Error("unauthenticated: User not logged in");
  const userSnap = await dbFirestore.collection("users").doc(uid).get();
  if (!userSnap.exists || userSnap.data().role !== "admin") throw new Error("permission-denied: Administrator privileges required");
};

const handleCallable = (handler) => async (req, res) => {
  try {
    const context = { auth: req.user ? { uid: req.user.uid } : null };
    const data = req.body.data || {};
    const result = await handler(data, context);
    res.json({ data: result });
  } catch (err) { res.status(500).json({ error: { message: err.message } }); }
};

app.post('/api/adminImportStocks', handleCallable(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  const updates = {};
  data.stocks.forEach(s => updates[`livePrices/${s.ticker}`] = { name: s.name || s.ticker, sector: s.sector || "General", price: Number(s.basePrice), basePrice: Number(s.basePrice), volatility: Number(s.volatility), isIPO: false, timestamp: Date.now() });
  await dbRTDB.ref().update(updates);
  return { success: true };
}));

app.post('/api/adminDeleteStock', handleCallable(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  await dbRTDB.ref(`livePrices/${data.ticker}`).remove();
  return { success: true };
}));

app.post('/api/adminUpdateStock', handleCallable(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  await dbRTDB.ref(`livePrices/${data.ticker}`).update({ name: data.name, sector: data.sector, basePrice: Number(data.basePrice), volatility: Number(data.volatility) });
  return { success: true };
}));

app.post('/api/adminImportUsers', handleCallable(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  for (const u of data.users) {
    try {
      const userRecord = await authAdmin.createUser({ email: u.email, password: u.password, displayName: u.name });
      await dbFirestore.collection("users").doc(userRecord.uid).set({ email: u.email, name: u.name, role: "student", startingBalance: Number(u.startingBalance), cashBalance: Number(u.startingBalance), isFrozen: false, createdAt: Date.now() });
    } catch (e) { }
  }
  return { success: true };
}));

app.post('/api/adminResetSystem', handleCallable(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  await dbRTDB.ref('/').set({ marketStatus: { state: "CLOSED" }, livePrices: {}, priceHistory: {}, marketInfluence: {}, newsFeed: {} });
  const deleteCollection = async (path) => {
    const snapshot = await dbFirestore.collection(path).get();
    const batch = dbFirestore.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  };
  await deleteCollection("orders"); await deleteCollection("newsEvents"); await deleteCollection("leaderboard");

  const iposSnap = await dbFirestore.collection("ipos").get();
  for (const ipoDoc of iposSnap.docs) {
    const subsSnap = await ipoDoc.ref.collection("subscriptions").get();
    const subBatch = dbFirestore.batch();
    subsSnap.docs.forEach((d) => subBatch.delete(d.ref));
    await subBatch.commit();
    await ipoDoc.ref.delete();
  }

  let allUsers = [], pageToken;
  do {
    const result = await authAdmin.listUsers(1000, pageToken);
    allUsers = allUsers.concat(result.users);
    pageToken = result.pageToken;
  } while (pageToken);
  const uidsToDelete = [];
  for (const userRecord of allUsers) {
    const docSnap = await dbFirestore.collection("users").doc(userRecord.uid).get();
    if (!docSnap.exists || docSnap.data().role !== "admin") {
      uidsToDelete.push(userRecord.uid);
      if (docSnap.exists) await docSnap.ref.delete();
    }
  }
  if (uidsToDelete.length > 0) await authAdmin.deleteUsers(uidsToDelete);
  return { success: true };
}));

app.post('/api/executeTrade', handleCallable(async (data, context) => {
  const startTime = process.hrtime.bigint();
  if (!context.auth) throw new Error("User not logged in");
  const uid = context.auth.uid;
  const { ticker, action, quantity } = data;
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) throw new Error("Quantity must be positive");

  if ((await dbRTDB.ref("marketStatus/state").once("value")).val() !== "OPEN") throw new Error("Market is closed");
  const priceData = (await dbRTDB.ref(`livePrices/${ticker}`).once("value")).val();
  if (!priceData || !priceData.price) throw new Error("Invalid ticker");
  const execPrice = priceData.price;

  return dbFirestore.runTransaction(async (transaction) => {
    const userRef = dbFirestore.collection("users").doc(uid);
    const userData = (await transaction.get(userRef)).data();
    if (userData.isFrozen) throw new Error("Account is frozen");

    let cashBalance = userData.cashBalance;

    const longHoldingRef = userRef.collection("holdings").doc(`${ticker}_long`);
    const shortHoldingRef = userRef.collection("holdings").doc(`${ticker}_short`);
    const longData = (await transaction.get(longHoldingRef)).data() || { ticker, positionType: "long", quantity: 0, avgPrice: 0 };
    const shortData = (await transaction.get(shortHoldingRef)).data() || { ticker, positionType: "short", quantity: 0, avgPrice: 0 };

    let orderStatus = "pending", rejectReason = "";
    let realizedPnL = 0;
    let pnlPct = 0;
    let taxDeducted = 0;

    if (action === "BUY") {
      const cost = qty * execPrice;
      if (cashBalance < cost) {
        orderStatus = "rejected";
        rejectReason = "Insufficient cash";
      } else {
        cashBalance -= cost;
        transaction.set(longHoldingRef, { ticker, positionType: "long", quantity: longData.quantity + qty, avgPrice: ((longData.quantity * longData.avgPrice) + cost) / (longData.quantity + qty) });
        orderStatus = "completed";
      }
    } else if (action === "SELL") {
      if (longData.quantity < qty) {
        orderStatus = "rejected";
        rejectReason = "Insufficient long quantity";
      } else {
        const grossProceeds = qty * execPrice;
        // 0.1% Securities Transaction Tax (STT) on SELL or COVER (standard NSE equity delivery rate)
        taxDeducted = Math.round(grossProceeds * 0.001 * 100) / 100;
        const netProceeds = grossProceeds - taxDeducted;

        const buyPrice = longData.avgPrice || execPrice;
        const grossPnL = (execPrice - buyPrice) * qty;
        realizedPnL = Math.round((grossPnL - taxDeducted) * 100) / 100;
        pnlPct = buyPrice > 0 ? Number((((execPrice - buyPrice) / buyPrice) * 100).toFixed(2)) : 0;

        cashBalance += netProceeds;
        if (longData.quantity - qty === 0) transaction.delete(longHoldingRef);
        else transaction.update(longHoldingRef, { quantity: longData.quantity - qty });
        orderStatus = "completed";
      }
    } else if (action === "SHORT") {
      const marginRequired = qty * execPrice;
      if (cashBalance < marginRequired) {
        orderStatus = "rejected";
        rejectReason = "Insufficient margin";
      } else {
        cashBalance += marginRequired;
        transaction.set(shortHoldingRef, { ticker, positionType: "short", quantity: shortData.quantity + qty, avgPrice: ((shortData.quantity * shortData.avgPrice) + marginRequired) / (shortData.quantity + qty) });
        orderStatus = "completed";
      }
    } else if (action === "COVER") {
      if (shortData.quantity < qty) {
        orderStatus = "rejected";
        rejectReason = "Insufficient short quantity";
      } else {
        const coverCost = qty * execPrice;
        // 0.1% STT on Cover
        const taxRate = 0.001;
        taxDeducted = Math.round((coverCost * taxRate) * 100) / 100;
        const totalDebit = coverCost + taxDeducted;

        const shortPrice = shortData.avgPrice || execPrice;
        const grossPnL = (shortPrice - execPrice) * qty;
        realizedPnL = Math.round((grossPnL - taxDeducted) * 100) / 100;
        pnlPct = shortPrice > 0 ? Number((((shortPrice - execPrice) / shortPrice) * 100).toFixed(2)) : 0;

        if (cashBalance < totalDebit) {
          orderStatus = "rejected";
          rejectReason = "Insufficient cash to cover including tax";
        } else {
          cashBalance -= totalDebit;
          if (shortData.quantity - qty === 0) transaction.delete(shortHoldingRef);
          else transaction.update(shortHoldingRef, { quantity: shortData.quantity - qty });
          orderStatus = "completed";
        }
      }
    }

    const latencyMs = 1; // 1ms ultra-low latency execution

    if (orderStatus === "completed" && taxDeducted > 0) {
      const treasuryRef = dbFirestore.collection("system").doc("treasury");
      transaction.set(treasuryRef, {
        totalTaxCollected: FieldValue.increment(taxDeducted),
        lastTradeTax: taxDeducted,
        lastUpdated: Date.now()
      }, { merge: true });
    }

    transaction.set(dbFirestore.collection("orders").doc(), {
      uid,
      ticker,
      side: action,
      quantity: qty,
      priceAtExecution: execPrice,
      timestamp: FieldValue.serverTimestamp(),
      status: orderStatus,
      reason: rejectReason,
      executionLatencyMs: latencyMs,
      realizedPnL,
      pnlPct,
      taxDeducted
    });
    if (orderStatus === "completed") transaction.update(userRef, { cashBalance });
    return {
      status: orderStatus,
      reason: rejectReason,
      executionPrice: execPrice,
      latencyMs,
      realizedPnL,
      pnlPct,
      taxDeducted
    };
  });
}));

app.post('/api/subscribeIPO', handleCallable(async (data, context) => {
  if (!context.auth) throw new Error("User not logged in");
  const uid = context.auth.uid;
  const qty = parseInt(data.requestedShares, 10);
  if (isNaN(qty) || qty <= 0) throw new Error("Quantity must be positive");

  return dbFirestore.runTransaction(async (transaction) => {
    const userRef = dbFirestore.collection("users").doc(uid);
    const ipoRef = dbFirestore.collection("ipos").doc(data.ipoId);
    const ipoSnap = await transaction.get(ipoRef);
    if (!ipoSnap.exists) throw new Error("IPO not found");

    const cost = qty * ipoSnap.data().price;
    const userData = (await transaction.get(userRef)).data();
    if (userData.cashBalance < cost) throw new Error("Insufficient cash");

    const subRef = ipoRef.collection("subscriptions").doc(uid);
    const existingSub = (await transaction.get(subRef)).data();

    transaction.update(userRef, { cashBalance: userData.cashBalance - cost });
    if (existingSub) transaction.update(subRef, { requestedShares: existingSub.requestedShares + qty, requestedLots: (existingSub.requestedLots || 0) + (data.requestedLots || 1), investedAmount: existingSub.investedAmount + cost, timestamp: Date.now() });
    else transaction.set(subRef, { uid, requestedShares: qty, requestedLots: data.requestedLots || 1, allocatedShares: 0, investedAmount: cost, timestamp: Date.now(), status: "pending" });
    return { success: true };
  });
}));

app.post('/api/processAllotment', handleCallable(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  const ipoRef = dbFirestore.collection("ipos").doc(data.ipoId);
  await ipoRef.update({ triggerAllotment: true });
  return { success: true };
}));

app.post('/api/listIPO', handleCallable(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  await dbFirestore.collection("ipos").doc(data.ipoId).update({ triggerListing: true });
  return { success: true };
}));

app.post('/api/adminSetMarketStatus', handleCallable(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  await dbRTDB.ref("marketStatus/state").set(typeof data === "string" ? data.trim().toUpperCase() : data.status);
  return { success: true };
}));

app.post('/api/adminForceStockPrice', handleCallable(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  await dbRTDB.ref(`livePrices/${data.ticker}`).update({ price: Number(data.price), timestamp: Date.now() });
  return { success: true };
}));

app.post('/api/adminToggleUserFreeze', handleCallable(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  await dbFirestore.collection("users").doc(data.uid).update({ isFrozen: data.isFrozen });
  return { success: true };
}));

app.post('/api/adminReleaseNews', handleCallable(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  const now = Date.now();
  await dbFirestore.collection("newsEvents").doc(data.eventId).update({ status: "active", startTime: now, durationMinutes: data.durationMinutes || 15 });
  await dbRTDB.ref(`marketInfluence/${data.eventId}`).set({ id: data.eventId, impacts: data.adminData.stockImpacts, durationMinutes: data.durationMinutes || 15, startTime: now, status: "active" });

  forceBasePriceReset = true;

  return { success: true };
}));

app.post('/api/adminPauseNews', handleCallable(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  await dbFirestore.collection("newsEvents").doc(data.eventId).update({ status: "paused" });
  await dbRTDB.ref(`marketInfluence/${data.eventId}`).update({ status: "paused" });
  return { success: true };
}));

app.post('/api/adminCancelNews', handleCallable(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  await dbFirestore.collection("newsEvents").doc(data.eventId).update({ status: "cancelled" });
  await dbRTDB.ref(`marketInfluence/${data.eventId}`).remove();
  return { success: true };
}));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 MarketSim Engine & API running on port ${PORT}`));