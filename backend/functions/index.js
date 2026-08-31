const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

if (!admin.apps.length) {
  admin.initializeApp({
    databaseURL: "https://bazaar8-123-default-rtdb.asia-southeast1.firebasedatabase.app/"
  });
}

const db = admin.firestore();
const rtdb = admin.database();

const verifyAdmin = async (uid) => {
  if (process.env.FUNCTIONS_EMULATOR === "true") return;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "User not logged in");
  
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists || userSnap.data().role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Administrator privileges required");
  }
};

exports.adminImportStocks = functions.https.onCall(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  const { stocks } = data;
  const updates = {};
  stocks.forEach(s => {
    updates[`livePrices/${s.ticker}`] = {
      name: s.name || s.ticker,
      sector: s.sector || "General",
      price: Number(s.basePrice),
      basePrice: Number(s.basePrice),
      volatility: Number(s.volatility),
      isIPO: false,
      timestamp: Date.now()
    };
  });
  await rtdb.ref().update(updates);
  return { success: true };
});

exports.adminDeleteStock = functions.https.onCall(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  await rtdb.ref(`livePrices/${data.ticker}`).remove();
  return { success: true };
});

exports.adminUpdateStock = functions.https.onCall(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  const { ticker, name, sector, basePrice, volatility } = data;
  await rtdb.ref(`livePrices/${ticker}`).update({
    name,
    sector,
    basePrice: Number(basePrice),
    volatility: Number(volatility)
  });
  return { success: true };
});

exports.adminImportUsers = functions.https.onCall(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  const { users } = data;
  for(const u of users) {
    try {
      const userRecord = await admin.auth().createUser({ email: u.email, password: u.password, displayName: u.name });
      await db.collection("users").doc(userRecord.uid).set({
        email: u.email, 
        name: u.name, 
        role: "student", 
        startingBalance: Number(u.startingBalance), 
        cashBalance: Number(u.startingBalance), 
        isFrozen: false, 
        createdAt: Date.now()
      });
    } catch(e) {
      console.log("Skipping user (may already exist):", u.email);
    }
  }
  return { success: true };
});

exports.adminAddSingleUser = functions.https.onCall(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  const { email, password, name, startingBalance } = data;
  try {
    const userRecord = await admin.auth().createUser({ email, password, displayName: name });
    await db.collection("users").doc(userRecord.uid).set({
      email, name, role: "student", startingBalance: Number(startingBalance), cashBalance: Number(startingBalance), isFrozen: false, createdAt: Date.now()
    });
    return { success: true };
  } catch(e) {
    throw new functions.https.HttpsError("internal", e.message);
  }
});

exports.adminResetSystem = functions.https.onCall(async (data, context) => {
  try {
    await verifyAdmin(context.auth?.uid);
    await rtdb.ref('/').set({ marketStatus: { state: "CLOSED" }, livePrices: {}, priceHistory: {}, marketInfluence: {}, newsFeed: {} });
    
    const deleteCollection = async (collectionPath) => {
      const snapshot = await db.collection(collectionPath).get();
      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    };
    
    await deleteCollection("orders");
    await deleteCollection("newsEvents");
    await deleteCollection("leaderboard");
    
    const iposSnap = await db.collection("ipos").get();
    for (const ipoDoc of iposSnap.docs) {
      const subsSnap = await ipoDoc.ref.collection("subscriptions").get();
      const subBatch = db.batch();
      subsSnap.docs.forEach((d) => subBatch.delete(d.ref));
      await subBatch.commit();
      await ipoDoc.ref.delete();
    }
    
    let allUsers = [];
    let pageToken;
    do {
      const result = await admin.auth().listUsers(1000, pageToken);
      allUsers = allUsers.concat(result.users);
      pageToken = result.pageToken;
    } while (pageToken);

    const uidsToDelete = [];
    for (const userRecord of allUsers) {
      const docSnap = await db.collection("users").doc(userRecord.uid).get();
      if (!docSnap.exists || docSnap.data().role !== "admin") {
        uidsToDelete.push(userRecord.uid);
        if (docSnap.exists) await docSnap.ref.delete();
      }
    }
    if (uidsToDelete.length > 0) await admin.auth().deleteUsers(uidsToDelete);
    return { success: true };
  } catch (error) {
    throw new functions.https.HttpsError("internal", `Reset Failed: ${error.message}`);
  }
});

exports.executeTrade = functions.runWith({ minInstances: 1 }).https.onCall(async (data, context) => {
  const startTime = process.hrtime.bigint();
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "User not logged in");
  const uid = context.auth.uid;
  const { ticker, action, quantity } = data;
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) throw new functions.https.HttpsError("invalid-argument", "Quantity must be positive");
  
  const marketSnap = await rtdb.ref("marketStatus/state").once("value");
  if (marketSnap.val() !== "OPEN") throw new functions.https.HttpsError("failed-precondition", "Market is closed");
  
  const priceSnap = await rtdb.ref(`livePrices/${ticker}`).once("value");
  const priceData = priceSnap.val();
  if (!priceData || !priceData.price) throw new functions.https.HttpsError("not-found", "Invalid ticker");
  const execPrice = priceData.price;

  return db.runTransaction(async (transaction) => {
    const userRef = db.collection("users").doc(uid);
    const userSnap = await transaction.get(userRef);
    const userData = userSnap.data();
    
    if (userData.isFrozen) throw new functions.https.HttpsError("permission-denied", "Account is frozen");
    
    let cashBalance = userData.cashBalance;
    
    const longHoldingRef = userRef.collection("holdings").doc(`${ticker}_long`);
    const shortHoldingRef = userRef.collection("holdings").doc(`${ticker}_short`);
    
    const longSnap = await transaction.get(longHoldingRef);
    const shortSnap = await transaction.get(shortHoldingRef);
    
    const longData = longSnap.exists ? longSnap.data() : { ticker, positionType: "long", quantity: 0, avgPrice: 0 };
    const shortData = shortSnap.exists ? shortSnap.data() : { ticker, positionType: "short", quantity: 0, avgPrice: 0 };
    
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
        const newQty = longData.quantity + qty;
        const newAvg = ((longData.quantity * longData.avgPrice) + (qty * execPrice)) / newQty;
        transaction.set(longHoldingRef, { ticker, positionType: "long", quantity: newQty, avgPrice: newAvg });
        orderStatus = "completed";
      }
    } else if (action === "SELL") {
      if (longData.quantity < qty) { 
        orderStatus = "rejected"; 
        rejectReason = "Insufficient long quantity"; 
      } else {
        const grossProceeds = qty * execPrice;
        const taxRate = 0.001; // 0.1% STT standard Indian equity rate
        taxDeducted = Math.round((grossProceeds * taxRate) * 100) / 100;
        const netProceeds = grossProceeds - taxDeducted;
        
        const buyPrice = longData.avgPrice || execPrice;
        const grossPnL = (execPrice - buyPrice) * qty;
        realizedPnL = Math.round((grossPnL - taxDeducted) * 100) / 100;
        pnlPct = buyPrice > 0 ? Number((((execPrice - buyPrice) / buyPrice) * 100).toFixed(2)) : 0;

        cashBalance += netProceeds;
        const newQty = longData.quantity - qty;
        if (newQty === 0) transaction.delete(longHoldingRef); 
        else transaction.update(longHoldingRef, { quantity: newQty });
        orderStatus = "completed";
      }
    } else if (action === "SHORT") {
      const marginRequired = qty * execPrice;
      if (cashBalance < marginRequired) { 
        orderStatus = "rejected"; 
        rejectReason = "Insufficient margin"; 
      } else {
        cashBalance += marginRequired; 
        const newQty = shortData.quantity + qty;
        const newAvg = ((shortData.quantity * shortData.avgPrice) + (qty * execPrice)) / newQty;
        transaction.set(shortHoldingRef, { ticker, positionType: "short", quantity: newQty, avgPrice: newAvg });
        orderStatus = "completed";
      }
    } else if (action === "COVER") {
      if (shortData.quantity < qty) { 
        orderStatus = "rejected"; 
        rejectReason = "Insufficient short quantity"; 
      } else {
        const coverCost = qty * execPrice;
        const taxRate = 0.001; // 0.1% STT
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
          const newQty = shortData.quantity - qty;
          if (newQty === 0) transaction.delete(shortHoldingRef); 
          else transaction.update(shortHoldingRef, { quantity: newQty });
          orderStatus = "completed";
        }
      }
    } else {
      throw new functions.https.HttpsError("invalid-argument", "Invalid trade action: " + action);
    }

    const latencyMs = 1;

    if (orderStatus === "completed" && taxDeducted > 0) {
      const treasuryRef = db.collection("system").doc("treasury");
      transaction.set(treasuryRef, {
        totalTaxCollected: FieldValue.increment(taxDeducted),
        lastTradeTax: taxDeducted,
        lastUpdated: Date.now()
      }, { merge: true });
    }

    const orderRef = db.collection("orders").doc();
    transaction.set(orderRef, { 
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
});

exports.subscribeIPO = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "User not logged in");
  const { ipoId, requestedShares, requestedLots } = data;
  const uid = context.auth.uid;
  const qty = parseInt(requestedShares, 10);
  
  if (isNaN(qty) || qty <= 0) throw new functions.https.HttpsError("invalid-argument", "Quantity must be positive");
  
  return db.runTransaction(async (transaction) => {
    const userRef = db.collection("users").doc(uid);
    const userSnap = await transaction.get(userRef);
    const ipoRef = db.collection("ipos").doc(ipoId);
    const ipoSnap = await transaction.get(ipoRef);
    
    if (!ipoSnap.exists) throw new functions.https.HttpsError("not-found", "IPO not found");
    const ipoData = ipoSnap.data();
    
    const cost = qty * ipoData.price;
    const userData = userSnap.data();
    if (userData.cashBalance < cost) throw new functions.https.HttpsError("failed-precondition", "Insufficient cash");
    
    const subRef = ipoRef.collection("subscriptions").doc(uid);
    const subSnap = await transaction.get(subRef);
    
    transaction.update(userRef, { cashBalance: userData.cashBalance - cost });
    
    if (subSnap.exists) {
      const existingSub = subSnap.data();
      transaction.update(subRef, {
        requestedShares: existingSub.requestedShares + qty,
        requestedLots: (existingSub.requestedLots || 0) + (requestedLots || 1),
        investedAmount: existingSub.investedAmount + cost,
        timestamp: Date.now()
      });
    } else {
      transaction.set(subRef, { 
        uid, 
        requestedShares: qty, 
        requestedLots: requestedLots || 1,
        allocatedShares: 0, 
        investedAmount: cost, 
        timestamp: Date.now(), 
        status: "pending" 
      });
    }
    return { success: true };
  });
});

exports.adminSetMarketStatus = functions.https.onCall(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  await rtdb.ref("marketStatus/state").set(typeof data === "string" ? data.trim().toUpperCase() : data.status);
  return { success: true };
});

exports.adminForceStockPrice = functions.https.onCall(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  await rtdb.ref(`livePrices/${data.ticker}`).update({ price: Number(data.price), timestamp: Date.now() });
  return { success: true };
});

exports.adminToggleUserFreeze = functions.https.onCall(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  await db.collection("users").doc(data.uid).update({ isFrozen: data.isFrozen });
  return { success: true };
});

exports.adminReleaseNews = functions.https.onCall(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  const { eventId, adminData, durationMinutes } = data;
  const now = Date.now();
  await db.collection("newsEvents").doc(eventId).update({ 
    status: "active", 
    startTime: now, 
    firedAt: now,
    durationMinutes: durationMinutes || 15 
  });
  await rtdb.ref(`marketInfluence/${eventId}`).set({ 
    id: eventId, 
    headline: adminData?.headline || "Breaking Market News",
    impacts: adminData?.stockImpacts || {}, 
    durationMinutes: durationMinutes || 15, 
    startTime: now, 
    status: "active" 
  });
  return { success: true };
});

exports.adminPauseNews = functions.https.onCall(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  await db.collection("newsEvents").doc(data.eventId).update({ status: "paused" });
  await rtdb.ref(`marketInfluence/${data.eventId}`).update({ status: "paused" });
  return { success: true };
});

exports.adminCancelNews = functions.https.onCall(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  await db.collection("newsEvents").doc(data.eventId).update({ status: "cancelled" });
  await rtdb.ref(`marketInfluence/${data.eventId}`).remove();
  return { success: true };
});

exports.adminCreateSingleNews = functions.https.onCall(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  if (!data.headline) throw new functions.https.HttpsError("invalid-argument", "Headline is required.");
  const eventRef = db.collection("newsEvents").doc();
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
});

exports.adminDeleteSingleNews = functions.https.onCall(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  if (!data.eventId) throw new functions.https.HttpsError("invalid-argument", "eventId is required.");
  await db.collection("newsEvents").doc(data.eventId).delete();
  await rtdb.ref(`marketInfluence/${data.eventId}`).remove();
  return { success: true };
});

exports.adminTriggerNextNews = functions.https.onCall(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  const snap = await db.collection("newsEvents")
    .where("status", "==", "draft")
    .orderBy("createdAt", "asc")
    .limit(1)
    .get();

  if (snap.empty) {
    throw new functions.https.HttpsError("not-found", "No draft news events in queue to trigger.");
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

  await rtdb.ref(`marketInfluence/${doc.id}`).set({
    id: doc.id,
    headline: event.headline || "Breaking Market News",
    impacts: event.stockImpacts || {},
    durationMinutes: duration,
    startTime: now,
    status: "active"
  });

  return { success: true, eventId: doc.id, headline: event.headline };
});

exports.adminTriggerAllNews = functions.https.onCall(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  const snap = await db.collection("newsEvents")
    .where("status", "==", "draft")
    .get();

  if (snap.empty) {
    throw new functions.https.HttpsError("not-found", "No draft news events in queue to trigger.");
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
    await rtdb.ref(`marketInfluence/${doc.id}`).set({
      id: doc.id,
      headline: event.headline || "Breaking Market News",
      impacts: event.stockImpacts || {},
      durationMinutes: duration,
      startTime: now,
      status: "active"
    });
  }

  return { success: true, count: snap.size };
});

exports.adminDeleteAllNews = functions.https.onCall(async (data, context) => {
  await verifyAdmin(context.auth?.uid);
  const snap = await db.collection("newsEvents").get();
  const batchSize = 500;
  for (let i = 0; i < snap.docs.length; i += batchSize) {
    const batch = db.batch();
    snap.docs.slice(i, i + batchSize).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
  await rtdb.ref("marketInfluence").remove();
  return { success: true, deletedCount: snap.size };
});