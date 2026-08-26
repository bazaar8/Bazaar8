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
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists || userSnap.data().role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Administrator privileges required");
  }
};

// ==========================================
// 1. STOCKS & USERS IMPORTERS
// ==========================================
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

// ==========================================
// 2. FACTORY RESET SYSTEM
// ==========================================
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
    
    const listUsersResult = await admin.auth().listUsers(1000);
    const uidsToDelete = [];
    for (const userRecord of listUsersResult.users) {
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

// ==========================================
// 3. TRADING & IPO ENGINE
// ==========================================
exports.executeTrade = functions.runWith({ minInstances: 1 }).https.onCall(async (data, context) => {
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
    const startingBalance = userData.startingBalance || 1000000;
    
    // ANTI-WHALE: Max 25% of starting capital in a single stock
    const maxPositionValue = startingBalance * 0.25;

    const longHoldingRef = userRef.collection("holdings").doc(`${ticker}_long`);
    const shortHoldingRef = userRef.collection("holdings").doc(`${ticker}_short`);
    
    const longSnap = await transaction.get(longHoldingRef);
    const shortSnap = await transaction.get(shortHoldingRef);

    const longData = longSnap.exists ? longSnap.data() : { ticker, positionType: "long", quantity: 0, avgPrice: 0 };
    const shortData = shortSnap.exists ? shortSnap.data() : { ticker, positionType: "short", quantity: 0, avgPrice: 0 };

    let orderStatus = "pending", rejectReason = "";

    if (action === "BUY") {
      const cost = qty * execPrice;
      const currentPositionValue = longData.quantity * execPrice;
      
      if (currentPositionValue + cost > maxPositionValue) {
        orderStatus = "rejected"; 
        rejectReason = `Position limit exceeded (Max 25% or ₹${maxPositionValue.toLocaleString()})`;
      } else if (cashBalance < cost) { 
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
      if (longData.quantity < qty) { orderStatus = "rejected"; rejectReason = "Insufficient long quantity"; } 
      else {
        cashBalance += qty * execPrice;
        const newQty = longData.quantity - qty;
        if (newQty === 0) transaction.delete(longHoldingRef); else transaction.update(longHoldingRef, { quantity: newQty });
        orderStatus = "completed";
      }
    } else if (action === "SHORT") {
      const marginRequired = qty * execPrice;
      const currentPositionValue = shortData.quantity * execPrice;
      
      if (currentPositionValue + marginRequired > maxPositionValue) {
        orderStatus = "rejected"; 
        rejectReason = `Position limit exceeded (Max 25% or ₹${maxPositionValue.toLocaleString()})`;
      } else if (cashBalance < marginRequired) { 
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
      if (shortData.quantity < qty) { orderStatus = "rejected"; rejectReason = "Insufficient short quantity"; } 
      else {
        const coverCost = qty * execPrice;
        if (cashBalance < coverCost) { orderStatus = "rejected"; rejectReason = "Insufficient cash to cover"; }
        else {
          cashBalance -= coverCost; 
          const newQty = shortData.quantity - qty;
          if (newQty === 0) transaction.delete(shortHoldingRef); else transaction.update(shortHoldingRef, { quantity: newQty });
          orderStatus = "completed";
        }
      }
    }

    const orderRef = db.collection("orders").doc();
    transaction.set(orderRef, { uid, ticker, side: action, quantity: qty, priceAtExecution: execPrice, timestamp: FieldValue.serverTimestamp(), status: orderStatus, reason: rejectReason });
    
    if (orderStatus === "completed") transaction.update(userRef, { cashBalance });

    return { status: orderStatus, reason: rejectReason, executionPrice: execPrice };
  });
});

exports.subscribeIPO = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "User not logged in");
  const { ipoId, requestedShares } = data;
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
    
    // ANTI-BLACK HOLE FIX: Add to existing subscription instead of overwriting
    if (subSnap.exists) {
      const existingSub = subSnap.data();
      transaction.update(subRef, {
        requestedShares: existingSub.requestedShares + qty,
        investedAmount: existingSub.investedAmount + cost,
        timestamp: Date.now()
      });
    } else {
      transaction.set(subRef, { uid, requestedShares: qty, allocatedShares: 0, investedAmount: cost, timestamp: Date.now(), status: "pending" });
    }
    
    return { success: true };
  });
});

exports.processAllotment = functions.https.onCall(async (data, context) => {
  await verifyAdmin(context.auth.uid);
  const ipoRef = db.collection("ipos").doc(data.ipoId);
  const ipoSnap = await ipoRef.get();
  const ipoData = ipoSnap.data();
  const subsSnap = await ipoRef.collection("subscriptions").get();
  const subscriptions = subsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  
  let availableShares = Number(ipoData.totalShares) || 0;
  const totalDemanded = subscriptions.reduce((sum, sub) => sum + (Number(sub.requestedShares) || 0), 0);
  const batch = db.batch();
  
  if (ipoData.allotmentType === "fcfs") {
    subscriptions.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    for (const sub of subscriptions) {
      let allocated = 0;
      const requested = Number(sub.requestedShares) || 0;
      if (availableShares >= requested) { allocated = requested; } 
      else if (availableShares > 0) { allocated = availableShares; }
      availableShares -= allocated;
      
      const refund = (requested - allocated) * Number(ipoData.price || 0);
      batch.update(ipoRef.collection("subscriptions").doc(sub.id), { allocatedShares: allocated, status: allocated > 0 ? "success" : "refunded" });
      if (refund > 0) batch.update(db.collection("users").doc(sub.uid), { cashBalance: FieldValue.increment(refund) });
      if (allocated > 0) batch.set(db.collection("users").doc(sub.uid).collection("holdings").doc(`${ipoData.ticker}_long`), { ticker: ipoData.ticker, positionType: "long", quantity: FieldValue.increment(allocated), avgPrice: Number(ipoData.price || 0) }, { merge: true });
    }
  } else {
    const ratio = totalDemanded > availableShares ? availableShares / totalDemanded : 1;
    for (const sub of subscriptions) {
      const req = Number(sub.requestedShares) || 0;
      const alloc = totalDemanded > availableShares ? Math.floor(req * ratio) : req;
      const refund = (req - alloc) * Number(ipoData.price || 0);
      batch.update(ipoRef.collection("subscriptions").doc(sub.id), { allocatedShares: alloc, status: alloc > 0 ? "success" : "refunded" });
      if (refund > 0) batch.update(db.collection("users").doc(sub.uid), { cashBalance: FieldValue.increment(refund) });
      if (alloc > 0) batch.set(db.collection("users").doc(sub.uid).collection("holdings").doc(`${ipoData.ticker}_long`), { ticker: ipoData.ticker, positionType: "long", quantity: FieldValue.increment(alloc), avgPrice: Number(ipoData.price || 0) }, { merge: true });
    }
  }
  batch.update(ipoRef, { status: "allotted" });
  await batch.commit();
  return { success: true };
});

exports.listIPO = functions.https.onCall(async (data, context) => {
  await verifyAdmin(context.auth.uid);
  const ipoRef = db.collection("ipos").doc(data.ipoId);
  const ipoData = (await ipoRef.get()).data();
  const listingPrice = Number(ipoData.price) * (1 + ((Number(ipoData.listingPremiumPct) || 0) / 100));
  
  await ipoRef.update({ status: "listed" });
  await rtdb.ref(`livePrices/${ipoData.ticker}`).set({ 
    price: Number(listingPrice.toFixed(2)), 
    timestamp: Date.now(), 
    isIPO: true, 
    basePrice: Number(listingPrice.toFixed(2)), 
    volatility: 0.008 
  });
  return { success: true };
});

// ==========================================
// 4. ADMIN UTILITIES
// ==========================================
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
  await db.collection("newsEvents").doc(eventId).update({ status: "active", startTime: now, durationMinutes: durationMinutes || 15 });
  await rtdb.ref(`newsFeed/${eventId}`).set({ id: eventId, headline: adminData.headline, startTime: now });
  await rtdb.ref(`marketInfluence/${eventId}`).set({ id: eventId, impacts: adminData.stockImpacts, durationMinutes: durationMinutes || 15, startTime: now, status: "active" });
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
  await rtdb.ref(`newsFeed/${data.eventId}`).remove();
  await rtdb.ref(`marketInfluence/${data.eventId}`).remove();
  return { success: true };
});