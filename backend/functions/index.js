const functions = require("firebase-functions");
const admin = require("firebase-admin");
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();
const rtdb = admin.database();

const verifyAdmin = async (uid) => {
  // 1. THIS IS THE BYPASS: Automatically approve if running locally
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    console.log("Local emulator detected: Bypassing auth check");
    return; 
  }

  // 2. Normal strict security for production servers
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists || userSnap.data().role !== "admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Administrator privileges required",
    );
  }
};

exports.executeTrade = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User not logged in",
    );
  }

  const uid = context.auth.uid;
  const {ticker, action, quantity} = data;
  const qty = parseInt(quantity, 10);

  if (isNaN(qty) || qty <= 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Quantity must be a positive integer",
    );
  }

  const validActions = ["BUY", "SELL", "SHORT", "COVER"];
  if (!validActions.includes(action)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Invalid action",
    );
  }

  const marketSnap = await rtdb.ref("marketStatus/state").once("value");
  const marketState = marketSnap.val();
  if (marketState !== "OPEN") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Market is not OPEN",
    );
  }

  const priceSnap = await rtdb.ref(`livePrices/${ticker}`).once("value");
  const priceData = priceSnap.val();
  if (!priceData || !priceData.price) {
    throw new functions.https.HttpsError("not-found", "Invalid ticker");
  }
  const execPrice = priceData.price;

  return db.runTransaction(async (transaction) => {
    const userRef = db.collection("users").doc(uid);
    const userSnap = await transaction.get(userRef);

    if (!userSnap.exists) {
      throw new functions.https.HttpsError("not-found", "User not found");
    }

    const userData = userSnap.data();
    let cashBalance = userData.cashBalance;

    const longHoldingRef = db.collection("users").doc(uid)
      .collection("holdings").doc(`${ticker}_long`);
    const shortHoldingRef = db.collection("users").doc(uid)
      .collection("holdings").doc(`${ticker}_short`);

    const longSnap = await transaction.get(longHoldingRef);
    const shortSnap = await transaction.get(shortHoldingRef);

    const longData = longSnap.exists
      ? longSnap.data()
      : {ticker, positionType: "long", quantity: 0, avgPrice: 0};
    const shortData = shortSnap.exists
      ? shortSnap.data()
      : {ticker, positionType: "short", quantity: 0, avgPrice: 0};

    let orderStatus = "pending";
    let rejectReason = "";

    if (action === "BUY") {
      const cost = qty * execPrice;
      if (cashBalance < cost) {
        orderStatus = "rejected";
        rejectReason = "Insufficient cash";
      } else {
        cashBalance -= cost;
        const oldQty = longData.quantity;
        const oldAvg = longData.avgPrice;
        const newQty = oldQty + qty;
        const newAvg = ((oldQty * oldAvg) + (qty * execPrice)) / newQty;

        transaction.set(longHoldingRef, {
          ticker,
          positionType: "long",
          quantity: newQty,
          avgPrice: newAvg,
        });
        orderStatus = "completed";
      }
    } else if (action === "SELL") {
      if (longData.quantity < qty) {
        orderStatus = "rejected";
        rejectReason = "Insufficient long quantity";
      } else {
        const proceeds = qty * execPrice;
        cashBalance += proceeds;
        const newQty = longData.quantity - qty;

        if (newQty === 0) {
          transaction.delete(longHoldingRef);
        } else {
          transaction.update(longHoldingRef, {quantity: newQty});
        }
        orderStatus = "completed";
      }
    } else if (action === "SHORT") {
      const proceeds = qty * execPrice;
      cashBalance += proceeds;
      const oldQty = shortData.quantity;
      const oldAvg = shortData.avgPrice;
      const newQty = oldQty + qty;
      const newAvg = ((oldQty * oldAvg) + (qty * execPrice)) / newQty;

      transaction.set(shortHoldingRef, {
        ticker,
        positionType: "short",
        quantity: newQty,
        avgPrice: newAvg,
      });
      orderStatus = "completed";
    } else if (action === "COVER") {
      if (shortData.quantity < qty) {
        orderStatus = "rejected";
        rejectReason = "Insufficient short quantity";
      } else {
        const cost = qty * execPrice;
        cashBalance -= cost;
        const newQty = shortData.quantity - qty;

        if (newQty === 0) {
          transaction.delete(shortHoldingRef);
        } else {
          transaction.update(shortHoldingRef, {quantity: newQty});
        }
        orderStatus = "completed";
      }
    }

    const orderRef = db.collection("orders").doc();
    transaction.set(orderRef, {
      uid,
      ticker,
      side: action,
      quantity: qty,
      priceAtExecution: execPrice,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: orderStatus,
      reason: rejectReason,
    });

    if (orderStatus === "completed") {
      transaction.update(userRef, {cashBalance});
    }

    return {
      status: orderStatus,
      reason: rejectReason,
      executionPrice: execPrice,
    };
  });
});

exports.subscribeIPO = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Unauthorized",
    );
  }

  const {ipoId, requestedShares} = data;
  const uid = context.auth.uid;
  const qty = parseInt(requestedShares, 10);

  if (isNaN(qty) || qty <= 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Invalid quantity",
    );
  }

  return db.runTransaction(async (transaction) => {
    const ipoRef = db.collection("ipos").doc(ipoId);
    const ipoSnap = await transaction.get(ipoRef);
    if (!ipoSnap.exists) {
      throw new functions.https.HttpsError("not-found", "IPO not found");
    }

    const ipoData = ipoSnap.data();
    if (ipoData.status !== "open") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "IPO is not open",
      );
    }

    const userRef = db.collection("users").doc(uid);
    const userSnap = await transaction.get(userRef);
    const userData = userSnap.data();

    const cost = qty * ipoData.price;
    if (userData.cashBalance < cost) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Insufficient cash",
      );
    }

    const subRef = db.collection("ipos").doc(ipoId)
      .collection("subscriptions").doc(uid);
    const subSnap = await transaction.get(subRef);
    if (subSnap.exists) {
      throw new functions.https.HttpsError(
        "already-exists",
        "Already subscribed",
      );
    }

    transaction.update(userRef, {cashBalance: userData.cashBalance - cost});
    transaction.set(subRef, {
      uid,
      requestedShares: qty,
      allocatedShares: 0,
      investedAmount: cost,
      timestamp: Date.now(),
      status: "pending",
    });

    return {success: true};
  });
});

exports.processAllotment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Unauthorized",
    );
  }

  const adminRef = await db.collection("users").doc(context.auth.uid).get();
  if (adminRef.data().role !== "admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Admin only",
    );
  }

  const {ipoId} = data;
  const ipoRef = db.collection("ipos").doc(ipoId);
  const ipoSnap = await ipoRef.get();
  const ipoData = ipoSnap.data();

  if (ipoData.status !== "closed") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "IPO must be closed",
    );
  }

  const subsSnap = await db.collection("ipos").doc(ipoId)
    .collection("subscriptions").get();
  const subscriptions = subsSnap.docs.map((d) => ({id: d.id, ...d.data()}));

  let availableShares = ipoData.totalShares;
  const totalDemanded = subscriptions.reduce(
    (sum, sub) => sum + sub.requestedShares,
    0,
  );

  const batch = db.batch();

  if (ipoData.allotmentType === "fcfs") {
    subscriptions.sort((a, b) => a.timestamp - b.timestamp);
    for (const sub of subscriptions) {
      let allocated = 0;
      if (availableShares >= sub.requestedShares) {
        allocated = sub.requestedShares;
      } else if (availableShares > 0) {
        allocated = availableShares;
      }
      availableShares -= allocated;

      const refund = (sub.requestedShares - allocated) * ipoData.price;
      const subRef = db.collection("ipos").doc(ipoId)
        .collection("subscriptions").doc(sub.id);
      batch.update(subRef, {
        allocatedShares: allocated,
        status: allocated > 0 ? "success" : "refunded",
      });

      const userRef = db.collection("users").doc(sub.uid);
      batch.update(userRef, {
        cashBalance: admin.firestore.FieldValue.increment(refund),
      });

      if (allocated > 0) {
        const holdingRef = db.collection("users").doc(sub.uid)
          .collection("holdings").doc(`${ipoData.ticker}_long`);
        batch.set(holdingRef, {
          ticker: ipoData.ticker,
          positionType: "long",
          quantity: admin.firestore.FieldValue.increment(allocated),
          avgPrice: ipoData.price,
        }, {merge: true});
      }
    }
  } else if (ipoData.allotmentType === "pro-rata") {
    const ratio = totalDemanded > availableShares
      ? availableShares / totalDemanded
      : 1;
    for (const sub of subscriptions) {
      const allocated = totalDemanded > availableShares
        ? Math.floor(sub.requestedShares * ratio)
        : sub.requestedShares;

      const refund = (sub.requestedShares - allocated) * ipoData.price;
      const subRef = db.collection("ipos").doc(ipoId)
        .collection("subscriptions").doc(sub.id);
      batch.update(subRef, {
        allocatedShares: allocated,
        status: allocated > 0 ? "success" : "refunded",
      });

      const userRef = db.collection("users").doc(sub.uid);
      batch.update(userRef, {
        cashBalance: admin.firestore.FieldValue.increment(refund),
      });

      if (allocated > 0) {
        const holdingRef = db.collection("users").doc(sub.uid)
          .collection("holdings").doc(`${ipoData.ticker}_long`);
        batch.set(holdingRef, {
          ticker: ipoData.ticker,
          positionType: "long",
          quantity: admin.firestore.FieldValue.increment(allocated),
          avgPrice: ipoData.price,
        }, {merge: true});
      }
    }
  }

  batch.update(ipoRef, {status: "allotted"});
  await batch.commit();
  return {success: true};
});

exports.listIPO = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Unauthorized",
    );
  }

  const adminRef = await db.collection("users").doc(context.auth.uid).get();
  if (adminRef.data().role !== "admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Admin only",
    );
  }

  const {ipoId} = data;
  const ipoRef = db.collection("ipos").doc(ipoId);
  const ipoSnap = await ipoRef.get();
  const ipoData = ipoSnap.data();

  if (ipoData.status !== "allotted") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Must be allotted first",
    );
  }

  await ipoRef.update({status: "listed"});

  await rtdb.ref(`livePrices/${ipoData.ticker}`).set({
    price: ipoData.price,
    timestamp: Date.now(),
    isIPO: true,
    basePrice: ipoData.price,
    volatility: 0.005,
  });

  return {success: true};
});

exports.adminSetMarketStatus = functions.https.onCall(
  async (data, context) => {
    if (process.env.FUNCTIONS_EMULATOR !== "true" && !context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Unauthorized");
    }
    await verifyAdmin(context.auth ? context.auth.uid : "local-bypass");

    // EXTRACTOR: Gracefully handle whether 'data' is a string or an object
    let statusValue = data;
    if (typeof data === "object" && data !== null) {
      statusValue = data.status || data.marketStatus || data.state;
    }

    // Force it to an uppercase string just in case
    if (typeof statusValue === "string") {
      statusValue = statusValue.trim().toUpperCase();
    }

    if (!["OPEN", "PAUSED", "CLOSED"].includes(statusValue)) {
      throw new functions.https.HttpsError("invalid-argument", `Invalid market status state received: ${JSON.stringify(data)}`);
    }

    await rtdb.ref("marketStatus/state").set(statusValue);
    return { success: true };
  },
);

exports.adminForceStockPrice = functions.https.onCall(async (data, context) => {
    if (process.env.FUNCTIONS_EMULATOR !== "true" && !context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Unauthorized");
    }
    await verifyAdmin(context.auth ? context.auth.uid : "local-bypass");
    
    const {ticker, price} = data;
    if (typeof ticker !== "string" || !/^[A-Z0-9]+$/.test(ticker)) {
      throw new functions.https.HttpsError("invalid-argument", "Invalid ticker");
    }
    
    await rtdb.ref(`livePrices/${ticker}`).update({
      price: Number(price),
      timestamp: Date.now(),
    });
    return {success: true};
});

exports.adminToggleUserFreeze = functions.https.onCall(async (data, context) => {
    if (process.env.FUNCTIONS_EMULATOR !== "true" && !context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Unauthorized");
    }
    await verifyAdmin(context.auth ? context.auth.uid : "local-bypass");
    
    await db.collection("users").doc(data.uid).update({
      isFrozen: data.isFrozen,
    });
    return {success: true};
});

exports.adminReleaseNews = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Unauthorized",
    );
  }
  await verifyAdmin(context.auth.uid);
  const {eventId, adminData} = data;
  const now = Date.now();

  const publicData = {
    id: eventId,
    headline: adminData.headline,
    description: adminData.description,
    targetTickers: adminData.targetTickers,
    affectedSectors: adminData.affectedSectors,
    startTime: now,
  };

  const influenceData = {
    id: eventId,
    targetTickers: adminData.targetTickers,
    impactDirection: adminData.impactDirection,
    impactStrength: adminData.impactStrength,
    durationMinutes: adminData.durationMinutes,
    startTime: now,
    status: "active",
  };

  await db.collection("newsEvents").doc(eventId).update({
    status: "active",
    startTime: now,
  });
  await rtdb.ref(`newsFeed/${eventId}`).set(publicData);
  await rtdb.ref(`marketInfluence/${eventId}`).set(influenceData);

  return {success: true};
});

exports.adminPauseNews = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Unauthorized",
    );
  }
  await verifyAdmin(context.auth.uid);
  const {eventId} = data;
  await db.collection("newsEvents").doc(eventId).update({
    status: "paused",
  });
  await rtdb.ref(`marketInfluence/${eventId}`).update({status: "paused"});
  return {success: true};
});

exports.adminCancelNews = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Unauthorized",
    );
  }
  await verifyAdmin(context.auth.uid);
  const {eventId} = data;
  await db.collection("newsEvents").doc(eventId).update({
    status: "cancelled",
  });
  await rtdb.ref(`newsFeed/${eventId}`).remove();
  await rtdb.ref(`marketInfluence/${eventId}`).remove();
  return {success: true};
});