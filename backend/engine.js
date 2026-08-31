const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getDatabase } = require("firebase-admin/database");
const { getAuth } = require("firebase-admin/auth");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const fs = require("fs");
const path = require("path");

function getServiceAccount() {
  if (process.env.SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.SERVICE_ACCOUNT_JSON);
    } catch (e) {
      try {
        const decoded = Buffer.from(process.env.SERVICE_ACCOUNT_JSON, "base64").toString("utf8");
        return JSON.parse(decoded);
      } catch (err) {
        console.error("❌ Failed to parse SERVICE_ACCOUNT_JSON env var:", err.message);
      }
    }
  }

  const candidatePaths = [
    process.env.SERVICE_ACCOUNT_KEY_PATH,
    "/etc/secrets/serviceAccountKey.json",
    path.join(__dirname, "serviceAccountKey.json"),
    path.join(process.cwd(), "serviceAccountKey.json"),
    path.join(__dirname, "../serviceAccountKey.json"),
    path.join(process.cwd(), "../serviceAccountKey.json")
  ].filter(Boolean);

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      try {
        const data = fs.readFileSync(candidate, "utf8");
        console.log(`✅ Loaded Firebase service account from: ${candidate}`);
        return JSON.parse(data);
      } catch (err) {
        console.error(`❌ Found ${candidate} but failed to parse:`, err.message);
      }
    }
  }

  if (fs.existsSync("/etc/secrets")) {
    try {
      const files = fs.readdirSync("/etc/secrets");
      for (const file of files) {
        if (file.endsWith(".json")) {
          const fullPath = path.join("/etc/secrets", file);
          const data = fs.readFileSync(fullPath, "utf8");
          console.log(`✅ Loaded Firebase service account from: ${fullPath}`);
          return JSON.parse(data);
        }
      }
    } catch (e) {}
  }

  return null;
}

const serviceAccount = getServiceAccount();

if (!serviceAccount) {
  console.error("=================================================================");
  console.error("❌ CRITICAL ERROR: Firebase service account credentials not found!");
  console.error("To fix this in Render dashboard:");
  console.error("Option A (Environment Variable): Add 'SERVICE_ACCOUNT_JSON' with your serviceAccount JSON");
  console.error("Option B (Secret File): Add secret file 'serviceAccountKey.json' with your serviceAccount JSON");
  console.error("=================================================================");
  process.exit(1);
}

initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://bazaar8-123-default-rtdb.asia-southeast1.firebasedatabase.app/"
});

const dbFirestore = getFirestore();
const dbRTDB = getDatabase();
const authAdmin = getAuth();
let tickCount = 0;
let forceBasePriceReset = false;

// In-memory zero-latency cache
let currentMarketStatus = "CLOSED";
let cachedLivePrices = {};
let cachedInfluences = {};

dbRTDB.ref("marketStatus/state").on("value", (snap) => {
  currentMarketStatus = snap.val() || "CLOSED";
});

dbRTDB.ref("livePrices").on("value", (snap) => {
  if (snap.exists()) {
    cachedLivePrices = snap.val() || {};
  }
});

dbRTDB.ref("marketInfluence").on("value", (snap) => {
  if (snap.exists()) {
    cachedInfluences = snap.val() || {};
  } else {
    cachedInfluences = {};
  }
});

async function runIPOAutomator() {
  console.log("🚀 Auto-IPO Engine active (Randomized Lottery & Real-time Subscription Tracking)...");
  setInterval(async () => {
    try {
      const now = Date.now();
      const iposSnap = await dbFirestore.collection('ipos').get();
      for (const doc of iposSnap.docs) {
        const ipo = { id: doc.id, ...doc.data() };

        // 1. Auto-open upcoming IPOs when openTime arrives
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

        // 2. Real-time Subscription Sync (Tracks exact lots, shares, and X.XXx rate)
        if (ipo.status === "upcoming" || ipo.status === "open" || ipo.status === "closed") {
          try {
            const subsSnap = await dbFirestore.collection("ipos").doc(ipo.id).collection("subscriptions").get();
            let liveLots = 0;
            let liveShares = 0;
            const lotSize = Number(ipo.lotSize) || 1;
            subsSnap.docs.forEach(s => {
              const d = s.data();
              const rl = Number(d.requestedLots) || Math.max(1, Math.floor((Number(d.requestedShares) || 1) / lotSize));
              liveLots += rl;
              liveShares += (rl * lotSize);
            });
            const totalOffered = Number(ipo.totalLots) || 1;
            const liveRate = Number((liveLots / totalOffered).toFixed(2));
            const liveCount = subsSnap.docs.length;

            if (ipo.totalSubscribedLots !== liveLots || ipo.subscriptionRate !== liveRate || ipo.subscriptionCount !== liveCount) {
              await dbFirestore.collection("ipos").doc(ipo.id).update({
                totalSubscribedLots: liveLots,
                totalSubscribedShares: liveShares,
                subscriptionCount: liveCount,
                subscriptionRate: liveRate
              });
            }
          } catch (err) {}
        }

        // 3. True Randomized Lottery Allotment Trigger
        const shouldAllot = ipo.triggerAllotment || 
          ((ipo.status === "open" || ipo.status === "closed") && ipo.closeTime && now >= ipo.closeTime);

        if (shouldAllot && ipo.status !== "allotted" && ipo.status !== "listed") {
          const subsSnap = await dbFirestore.collection("ipos").doc(ipo.id).collection("subscriptions").get();
          const availableLots = Number(ipo.totalLots) || 1;
          const lotSize = Number(ipo.lotSize) || 1;
          const pricePerShare = Number(ipo.price) || 0;

          if (subsSnap.empty) {
            await dbFirestore.collection("ipos").doc(ipo.id).update({
              status: "allotted",
              triggerAllotment: FieldValue.delete(),
              totalSubscribedLots: 0,
              subscriptionRate: 0
            });
            continue;
          }

          const applicants = [];
          let totalReqLots = 0;
          subsSnap.docs.forEach(subDoc => {
            const sub = subDoc.data();
            const reqLots = Number(sub.requestedLots) || Math.max(1, Math.floor((Number(sub.requestedShares) || 1) / lotSize));
            totalReqLots += reqLots;
            applicants.push({
              subId: subDoc.id,
              docRef: subDoc.ref,
              uid: sub.uid,
              requestedLots: reqLots,
              investedAmount: Number(sub.investedAmount) || (reqLots * lotSize * pricePerShare)
            });
          });

          const subRate = Number((totalReqLots / availableLots).toFixed(2));

          // BUILD CRYPTO-RANDOMIZED LOTTERY TICKET POOL (1 ticket per requested lot)
          let lotteryPool = [];
          applicants.forEach(app => {
            for (let i = 0; i < app.requestedLots; i++) {
              lotteryPool.push({ subId: app.subId, uid: app.uid });
            }
          });

          // Multi-pass cryptographic shuffle (guarantees non-deterministic lottery)
          for (let pass = 0; pass < 3; pass++) {
            for (let i = lotteryPool.length - 1; i > 0; i--) {
              const j = crypto.randomInt(0, i + 1);
              [lotteryPool[i], lotteryPool[j]] = [lotteryPool[j], lotteryPool[i]];
            }
          }

          // Determine winning lots to award:
          // In over-subscription: award exactly availableLots
          // In under-subscription or testing: randomize allotment so any bidder can get any number of lots (not fixed 100%)
          let lotsToAward;
          if (totalReqLots > availableLots) {
            lotsToAward = availableLots;
          } else {
            const randomRatio = 0.40 + (crypto.randomInt(0, 50) / 100); // 40% to 89%
            lotsToAward = Math.max(1, Math.min(totalReqLots, Math.round(totalReqLots * randomRatio)));
          }

          const winningTickets = lotteryPool.slice(0, lotsToAward);
          const winCounts = {};
          winningTickets.forEach(ticket => {
            winCounts[ticket.subId] = (winCounts[ticket.subId] || 0) + 1;
          });

          const batch = dbFirestore.batch();
          for (const app of applicants) {
            const wonLots = winCounts[app.subId] || 0;
            const allocatedShares = wonLots * lotSize;
            const costBlocked = app.investedAmount;
            const costUsed = allocatedShares * pricePerShare;
            const refundAmount = Math.max(0, costBlocked - costUsed);

            batch.update(app.docRef, {
              allocatedLots: wonLots,
              allocatedShares: allocatedShares,
              status: wonLots > 0 ? "won" : "lost",
              refundedAmount: refundAmount,
              allotmentTimestamp: now
            });

            if (refundAmount > 0) {
              batch.update(dbFirestore.collection("users").doc(app.uid), {
                cashBalance: FieldValue.increment(refundAmount)
              });
            }

            if (allocatedShares > 0) {
              batch.set(
                dbFirestore.collection("users").doc(app.uid).collection("holdings").doc(`${ipo.ticker}_long`),
                {
                  ticker: ipo.ticker,
                  positionType: "long",
                  quantity: FieldValue.increment(allocatedShares),
                  avgPrice: pricePerShare
                },
                { merge: true }
              );
            }
          }

          batch.update(dbFirestore.collection("ipos").doc(ipo.id), {
            status: "allotted",
            triggerAllotment: FieldValue.delete(),
            totalSubscribedLots: totalReqLots,
            subscriptionRate: subRate,
            allotmentCompletedAt: now
          });

          await batch.commit();

          await dbFirestore.collection("newsEvents").add({
            headline: `🎉 IPO Allotment Out: ${ipo.ticker} (${ipo.name || ipo.ticker}) was subscribed ${subRate}x! Lottery draw complete—shares & refunds credited.`,
            status: "active",
            startTime: now,
            createdAt: now,
            durationMinutes: 60,
            targetTickers: [ipo.ticker],
            impactDirection: "positive"
          });
        }

        // 4. Listing trigger
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
    } catch (e) {
      console.error("Auto-IPO Engine Error:", e.message);
    }
  }, 2000);
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
      const livePrices = cachedLivePrices;
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
        const startingCapital = Number(user.startingBalance) || 1000000;
        const totalValue = (Number(user.cashBalance) || 0) + longValue - shortLiability;
        const retPct = Number((((totalValue - startingCapital) / startingCapital) * 100).toFixed(2));
        const pnlAmount = Number((totalValue - startingCapital).toFixed(2));
        leaderboard.push({
          uid,
          displayName: user.name || (user.email ? user.email.split('@')[0] : 'Trader'),
          portfolioValue: Number(totalValue.toFixed(2)),
          returnPct: retPct,
          pnl: retPct,
          pnlAmount: pnlAmount
        });
      }
      leaderboard.sort((a, b) => b.portfolioValue - a.portfolioValue);
      await dbFirestore.collection('leaderboard').doc('main').set({ lastUpdated: FieldValue.serverTimestamp(), rankings: leaderboard.map((entry, index) => ({ ...entry, rank: index + 1 })) });
    } catch (e) { }
  }, 3000);
}

async function runMarketEngine() {
  const livePricesRef = dbRTDB.ref("livePrices");
  const historyRef = dbRTDB.ref("priceHistory");
  const influenceRef = dbRTDB.ref("marketInfluence");

  let lastBasePriceReset = Date.now();
  const TICK_INTERVAL_MS = 500; // Ultra-fast 500ms market updates

  setInterval(async () => {
    try {
      if (currentMarketStatus !== "OPEN") return;
      tickCount++;
      const now = Date.now();
      const currentPrices = cachedLivePrices;
      const influences = cachedInfluences;
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
              eventBias += (targetImpactPct / (durationMs / TICK_INTERVAL_MS)) * (Math.PI / 2) * Math.sin(progress * Math.PI);
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
        if (tickCount % 6 === 0) historyUpdate[`${ticker}/${now}`] = Number(newPrice.toFixed(2));
      }
      await livePricesRef.update(newPricesUpdate);
      if (tickCount % 6 === 0) await historyRef.update(historyUpdate);
      for (const eventId of finishedEvents) {
        await influenceRef.child(eventId).remove();
        await dbFirestore.collection('newsEvents').doc(eventId).update({ status: 'completed' });
      }
    } catch (e) { }
  }, 500);
}

runIPOAutomator();
runLeaderboardEngine();
runMarketEngine();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({ status: "online", message: "MarketSim Engine & API is running" });
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy", timestamp: Date.now() });
});

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

  if (currentMarketStatus !== "OPEN") throw new Error("Market is closed");
  const priceData = cachedLivePrices[ticker] || (await dbRTDB.ref(`livePrices/${ticker}`).once("value")).val();
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
      const grossCost = qty * execPrice;
      taxDeducted = Math.round(grossCost * 0.001 * 100) / 100;
      const totalDebit = grossCost + taxDeducted;
      if (cashBalance < totalDebit) {
        orderStatus = "rejected";
        rejectReason = "Insufficient cash (including 0.1% STT)";
      } else {
        cashBalance -= totalDebit;
        transaction.set(longHoldingRef, { ticker, positionType: "long", quantity: longData.quantity + qty, avgPrice: ((longData.quantity * longData.avgPrice) + grossCost) / (longData.quantity + qty) });
        orderStatus = "completed";
      }
    } else if (action === "SELL") {
      if (longData.quantity < qty) {
        orderStatus = "rejected";
        rejectReason = "Insufficient long quantity";
      } else {
        const grossProceeds = qty * execPrice;
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
      taxDeducted = Math.round(marginRequired * 0.001 * 100) / 100;
      if (cashBalance < marginRequired) {
        orderStatus = "rejected";
        rejectReason = "Insufficient margin";
      } else {
        cashBalance += (marginRequired - taxDeducted);
        transaction.set(shortHoldingRef, { ticker, positionType: "short", quantity: shortData.quantity + qty, avgPrice: ((shortData.quantity * shortData.avgPrice) + marginRequired) / (shortData.quantity + qty) });
        orderStatus = "completed";
      }
    } else if (action === "COVER") {
      if (shortData.quantity < qty) {
        orderStatus = "rejected";
        rejectReason = "Insufficient short quantity";
      } else {
        const coverCost = qty * execPrice;
        taxDeducted = Math.round(coverCost * 0.001 * 100) / 100;
        const totalDebit = coverCost + taxDeducted;

        const shortPrice = shortData.avgPrice || execPrice;
        const grossPnL = (shortPrice - execPrice) * qty;
        realizedPnL = Math.round((grossPnL - taxDeducted) * 100) / 100;
        pnlPct = shortPrice > 0 ? Number((((shortPrice - execPrice) / shortPrice) * 100).toFixed(2)) : 0;

        if (cashBalance < totalDebit) {
          orderStatus = "rejected";
          rejectReason = "Insufficient cash to cover (including 0.1% STT)";
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
    const ipoData = ipoSnap.data();

    if (ipoData.status !== "open") {
      throw new Error(`IPO is currently ${ipoData.status}. Bids are only accepted while open.`);
    }

    const cost = qty * Number(ipoData.price);
    const userData = (await transaction.get(userRef)).data();
    if (userData.cashBalance < cost) throw new Error("Insufficient cash");

    const subRef = ipoRef.collection("subscriptions").doc(uid);
    const existingSubSnap = await transaction.get(subRef);
    const existingSub = existingSubSnap.data();

    const lotsToAdd = parseInt(data.requestedLots, 10) || Math.max(1, Math.floor(qty / (Number(ipoData.lotSize) || 1)));

    transaction.update(userRef, { cashBalance: userData.cashBalance - cost });
    if (existingSub) {
      transaction.update(subRef, {
        requestedShares: existingSub.requestedShares + qty,
        requestedLots: (existingSub.requestedLots || 0) + lotsToAdd,
        investedAmount: (existingSub.investedAmount || 0) + cost,
        timestamp: Date.now()
      });
    } else {
      transaction.set(subRef, {
        uid,
        requestedShares: qty,
        requestedLots: lotsToAdd,
        allocatedShares: 0,
        allocatedLots: 0,
        investedAmount: cost,
        timestamp: Date.now(),
        status: "pending"
      });
    }

    // Atomically update live subscription metrics on IPO
    const currentSubLots = Number(ipoData.totalSubscribedLots) || 0;
    const currentSubShares = Number(ipoData.totalSubscribedShares) || 0;
    const currentSubCount = Number(ipoData.subscriptionCount) || 0;

    const newSubLots = currentSubLots + lotsToAdd;
    const newSubShares = currentSubShares + qty;
    const newSubCount = existingSub ? currentSubCount : (currentSubCount + 1);
    const totalOfferedLots = Number(ipoData.totalLots) || 1;
    const newSubRate = Number((newSubLots / totalOfferedLots).toFixed(2));

    transaction.update(ipoRef, {
      totalSubscribedLots: newSubLots,
      totalSubscribedShares: newSubShares,
      subscriptionCount: newSubCount,
      subscriptionRate: newSubRate
    });

    return { 
      success: true, 
      totalSubscribedLots: newSubLots, 
      subscriptionRate: newSubRate 
    };
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

app.post('/api/adminUpdateIPOGMP', handleCallable(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  const newGmp = Number(data.listingPremiumPct) || 0;
  await dbFirestore.collection("ipos").doc(data.ipoId).update({ listingPremiumPct: newGmp });
  return { success: true, listingPremiumPct: newGmp };
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
  await dbFirestore.collection("newsEvents").doc(data.eventId).update({ 
    status: "active", 
    startTime: now, 
    firedAt: now,
    durationMinutes: data.durationMinutes || 15 
  });
  await dbRTDB.ref(`marketInfluence/${data.eventId}`).set({ 
    id: data.eventId, 
    headline: data.adminData?.headline || "Breaking Market News",
    impacts: data.adminData?.stockImpacts || {}, 
    durationMinutes: data.durationMinutes || 15, 
    startTime: now, 
    status: "active" 
  });

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

app.post('/api/adminCreateSingleNews', handleCallable(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  if (!data.headline) throw new Error("Headline is required.");
  const eventRef = dbFirestore.collection("newsEvents").doc();
  const eventData = {
    id: eventRef.id,
    headline: data.headline,
    stockImpacts: data.stockImpacts || {},
    durationMinutes: Number(data.durationMinutes) || 15,
    status: "draft",
    startTime: 0,
    createdAt: Date.now()
  };
  await eventRef.set(eventData);
  return { success: true, eventId: eventRef.id };
}));

app.post('/api/adminDeleteSingleNews', handleCallable(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  if (!data.eventId) throw new Error("eventId is required.");
  await dbFirestore.collection("newsEvents").doc(data.eventId).delete();
  await dbRTDB.ref(`marketInfluence/${data.eventId}`).remove();
  forceBasePriceReset = true;
  return { success: true };
}));

app.post('/api/adminTriggerNextNews', handleCallable(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  const snap = await dbFirestore.collection("newsEvents")
    .where("status", "==", "draft")
    .orderBy("createdAt", "asc")
    .limit(1)
    .get();

  if (snap.empty) {
    throw new Error("No draft news events in queue to trigger.");
  }

  const doc = snap.docs[0];
  const event = doc.data();
  const now = Date.now();
  const duration = event.durationMinutes || 15;

  await doc.ref.update({
    status: "active",
    startTime: now,
    firedAt: now,
    durationMinutes: duration
  });

  await dbRTDB.ref(`marketInfluence/${doc.id}`).set({
    id: doc.id,
    headline: event.headline || "Breaking Market News",
    impacts: event.stockImpacts || {},
    durationMinutes: duration,
    startTime: now,
    status: "active"
  });

  forceBasePriceReset = true;
  return { success: true, eventId: doc.id, headline: event.headline };
}));

app.post('/api/adminTriggerAllNews', handleCallable(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  const snap = await dbFirestore.collection("newsEvents")
    .where("status", "==", "draft")
    .get();

  if (snap.empty) {
    throw new Error("No draft news events in queue to trigger.");
  }

  const now = Date.now();
  for (const doc of snap.docs) {
    const event = doc.data();
    const duration = event.durationMinutes || 15;
    await doc.ref.update({
      status: "active",
      startTime: now,
      firedAt: now,
      durationMinutes: duration
    });
    await dbRTDB.ref(`marketInfluence/${doc.id}`).set({
      id: doc.id,
      headline: event.headline || "Breaking Market News",
      impacts: event.stockImpacts || {},
      durationMinutes: duration,
      startTime: now,
      status: "active"
    });
  }

  forceBasePriceReset = true;
  return { success: true, count: snap.size };
}));

app.post('/api/adminDeleteAllNews', handleCallable(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  const snap = await dbFirestore.collection("newsEvents").get();
  const batchSize = 500;
  for (let i = 0; i < snap.docs.length; i += batchSize) {
    const batch = dbFirestore.batch();
    snap.docs.slice(i, i + batchSize).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
  await dbRTDB.ref("marketInfluence").remove();
  forceBasePriceReset = true;
  return { success: true, deletedCount: snap.size };
}));

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 MarketSim Engine & API running on port ${PORT}`));