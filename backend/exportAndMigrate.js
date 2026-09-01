const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getDatabase } = require("firebase-admin/database");
const { getAuth } = require("firebase-admin/auth");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

// 1. Connect Firebase (reads from serviceAccountKey.json or SERVICE_ACCOUNT_JSON env)
const serviceAccount = process.env.SERVICE_ACCOUNT_JSON 
  ? JSON.parse(process.env.SERVICE_ACCOUNT_JSON)
  : require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://bazaar8-123-default-rtdb.asia-southeast1.firebasedatabase.app/"
});

const fbDb = getFirestore();
const fbRTDB = getDatabase();
const fbAuth = getAuth();

// 2. Connect MongoDB
const MONGO_URI = process.env.MONGO_URI || "mongodb://bnbbazaar80_db_user:IITivbVAqjrFs3Hi@ac-wbxf7o7-shard-00-00.ywyxh6r.mongodb.net:27017,ac-wbxf7o7-shard-00-01.ywyxh6r.mongodb.net:27017,ac-wbxf7o7-shard-00-02.ywyxh6r.mongodb.net:27017/?ssl=true&replicaSet=atlas-980gau-shard-0&authSource=admin&appName=Cluster0";

async function runMigration() {
  console.log("Connecting to MongoDB Atlas...");
  await mongoose.connect(MONGO_URI);
  console.log(" Connected to MongoDB.");

  const db = mongoose.connection.db;

  // --- A. MIGRATE USERS & SUB-COLLECTIONS ---
  console.log(" Migrating Users & Holdings...");
  const usersSnap = await fbDb.collection("users").get();
  for (const userDoc of usersSnap.docs) {
    const uData = userDoc.data();
    const uid = userDoc.id;

    // Fetch subcollection holdings
    const holdingsSnap = await userDoc.ref.collection("holdings").get();
    const holdings = holdingsSnap.docs.map(h => ({
      ticker: h.data().ticker,
      positionType: h.data().positionType || "long",
      quantity: Number(h.data().quantity) || 0,
      avgPrice: Number(h.data().avgPrice) || 0
    }));

    // Fetch subcollection watchlists / settings
    const settingsSnap = await userDoc.ref.collection("settings").doc("watchlists_v2").get();
    const wishlists = settingsSnap.exists ? settingsSnap.data().wishlists || [] : [];

    await db.collection("users").updateOne(
      { uid: uid },
      {
        $set: {
          uid: uid,
          email: uData.email,
          name: uData.name || (uData.email ? uData.email.split("@")[0] : "Trader"),
          role: uData.role || "student",
          startingBalance: Number(uData.startingBalance || uData.startingCapital) || 1000000,
          cashBalance: Number(uData.cashBalance ?? uData.cash) || 1000000,
          isFrozen: Boolean(uData.isFrozen),
          holdings: holdings,
          wishlists: wishlists,
          password: "$2a$10$defaultPlaceholderHashChangeMe123456", // Default bcrypt hash
          createdAt: uData.createdAt || Date.now()
        }
      },
      { upsert: true }
    );
  }
  console.log(` Migrated ${usersSnap.size} users.`);

  // --- B. MIGRATE ORDERS ---
  console.log(" Migrating Execution Orders...");
  const ordersSnap = await fbDb.collection("orders").get();
  const orders = ordersSnap.docs.map(doc => {
    const o = doc.data();
    return {
      orderId: doc.id,
      uid: o.uid,
      ticker: o.ticker,
      side: o.side,
      quantity: Number(o.quantity) || 0,
      priceAtExecution: Number(o.priceAtExecution) || 0,
      status: o.status || "completed",
      reason: o.reason || "",
      executionLatencyMs: o.executionLatencyMs || 1,
      realizedPnL: Number(o.realizedPnL) || 0,
      pnlPct: Number(o.pnlPct) || 0,
      taxDeducted: Number(o.taxDeducted) || 0,
      timestamp: o.timestamp?.toMillis ? o.timestamp.toMillis() : (Number(o.timestamp) || Date.now())
    };
  });
  if (orders.length > 0) {
    await db.collection("orders").deleteMany({});
    await db.collection("orders").insertMany(orders);
  }
  console.log(` Migrated ${orders.length} orders.`);

  // --- C. MIGRATE IPOS & SUBSCRIPTIONS ---
  console.log(" Migrating IPOs & Bids...");
  const iposSnap = await fbDb.collection("ipos").get();
  for (const ipoDoc of iposSnap.docs) {
    const ipoData = ipoDoc.data();
    const subsSnap = await ipoDoc.ref.collection("subscriptions").get();
    const subscriptions = subsSnap.docs.map(s => ({
      subId: s.id,
      uid: s.data().uid || s.id,
      requestedShares: Number(s.data().requestedShares) || 0,
      requestedLots: Number(s.data().requestedLots) || 1,
      allocatedLots: Number(s.data().allocatedLots) || 0,
      allocatedShares: Number(s.data().allocatedShares) || 0,
      investedAmount: Number(s.data().investedAmount) || 0,
      refundedAmount: Number(s.data().refundedAmount) || 0,
      status: s.data().status || "pending",
      timestamp: Number(s.data().timestamp) || Date.now()
    }));

    await db.collection("ipos").updateOne(
      { ipoId: ipoDoc.id },
      {
        $set: {
          ipoId: ipoDoc.id,
          name: ipoData.name,
          ticker: ipoData.ticker,
          price: Number(ipoData.price) || 0,
          lotSize: Number(ipoData.lotSize) || 1,
          totalLots: Number(ipoData.totalLots) || 1,
          listingPremiumPct: Number(ipoData.listingPremiumPct) || 0,
          sector: ipoData.sector || "Upcoming",
          status: ipoData.status || "upcoming",
          totalSubscribedLots: Number(ipoData.totalSubscribedLots) || 0,
          totalSubscribedShares: Number(ipoData.totalSubscribedShares) || 0,
          subscriptionCount: Number(ipoData.subscriptionCount) || 0,
          subscriptionRate: Number(ipoData.subscriptionRate) || 0,
          openTime: Number(ipoData.openTime) || 0,
          closeTime: Number(ipoData.closeTime) || 0,
          listTime: Number(ipoData.listTime) || 0,
          subscriptions: subscriptions
        }
      },
      { upsert: true }
    );
  }
  console.log(` Migrated ${iposSnap.size} IPO offerings.`);

  // --- D. MIGRATE NEWS EVENTS ---
  console.log(" Migrating News Matrix Wire...");
  const newsSnap = await fbDb.collection("newsEvents").get();
  const newsEvents = newsSnap.docs.map(d => ({
    eventId: d.id,
    ...d.data(),
    createdAt: d.data().createdAt || Date.now()
  }));
  if (newsEvents.length > 0) {
    await db.collection("newsevents").deleteMany({});
    await db.collection("newsevents").insertMany(newsEvents);
  }
  console.log(` Migrated ${newsEvents.length} news events.`);

  // --- E. MIGRATE SYSTEM TREASURY & LIVE PRICES ---
  console.log(" Migrating System State & RTDB Ticks...");
  const treasurySnap = await fbDb.collection("system").doc("treasury").get();
  const treasuryData = treasurySnap.exists ? treasurySnap.data() : { totalTaxCollected: 0 };

  const rtdbPricesSnap = await fbRTDB.ref("livePrices").once("value");
  const rtdbPrices = rtdbPricesSnap.val() || {};

  const rtdbHistorySnap = await fbRTDB.ref("priceHistory").once("value");
  const rtdbHistory = rtdbHistorySnap.val() || {};

  const rtdbStatusSnap = await fbRTDB.ref("marketStatus/state").once("value");
  const rtdbStatus = rtdbStatusSnap.val() || "CLOSED";

  await db.collection("systemstates").updateOne(
    { key: "main" },
    {
      $set: {
        key: "main",
        marketStatus: rtdbStatus,
        livePrices: rtdbPrices,
        priceHistory: rtdbHistory,
        totalTaxCollected: Number(treasuryData.totalTaxCollected) || 0
      }
    },
    { upsert: true }
  );

  console.log(" ALL DATA MIGRATION COMPLETE! Ready to run native MongoDB engine.");
  process.exit(0);
}

runMigration().catch(err => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});