const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "bazaar_jwt_secure_secret_2026";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/bazaar";
const PORT = process.env.PORT || 8080;

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "2mb" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
  pingInterval: 10000,
  pingTimeout: 5000
});

// --- MONGOOSE SCHEMAS ---
const UserSchema = new mongoose.Schema({
  uid: { type: String, unique: true, required: true, index: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  name: { type: String, default: "Trader" },
  role: { type: String, enum: ["student", "admin"], default: "student", index: true },
  startingBalance: { type: Number, default: 1000000 },
  cashBalance: { type: Number, default: 1000000 },
  isFrozen: { type: Boolean, default: false },
  holdings: [{
    ticker: String,
    positionType: { type: String, enum: ["long", "short"] },
    quantity: Number,
    avgPrice: Number
  }],
  wishlists: [{ id: Number, name: String, tickers: [String] }],
  createdAt: { type: Number, default: Date.now }
});

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true, index: true },
  uid: { type: String, index: true },
  ticker: String,
  side: { type: String, enum: ["BUY", "SELL", "SHORT", "COVER"] },
  quantity: Number,
  priceAtExecution: Number,
  status: { type: String, enum: ["completed", "rejected", "pending"] },
  reason: String,
  executionLatencyMs: Number,
  realizedPnL: Number,
  pnlPct: Number,
  taxDeducted: Number,
  timestamp: { type: Number, default: Date.now, index: -1 }
});

const IPOSchema = new mongoose.Schema({
  ipoId: { type: String, unique: true, index: true },
  name: String, ticker: String, price: Number, lotSize: Number, totalLots: Number,
  listingPremiumPct: Number, sector: { type: String, default: "Upcoming" },
  status: { type: String, default: "upcoming", index: true },
  totalSubscribedLots: { type: Number, default: 0 },
  totalSubscribedShares: { type: Number, default: 0 },
  subscriptionCount: { type: Number, default: 0 },
  subscriptionRate: { type: Number, default: 0 },
  openTime: Number, closeTime: Number, listTime: Number,
  triggerAllotment: Boolean, triggerListing: Boolean,
  hasAllotted: { type: Boolean, default: false }, // NEW STRICT LOCK FLAG
  allotmentResult: { type: Object, default: null },
  subscriptions: [{
    subId: String, uid: String, requestedShares: Number, requestedLots: Number,
    allocatedLots: { type: Number, default: 0 }, allocatedShares: { type: Number, default: 0 },
    investedAmount: Number, refundedAmount: { type: Number, default: 0 },
    status: { type: String, default: "pending" },
    timestamp: { type: Number, default: Date.now },
    settled: { type: Boolean, default: false }
  }]
});

const NewsEventSchema = new mongoose.Schema({
  eventId: { type: String, unique: true, index: true },
  headline: String, stockImpacts: { type: Object, default: {} },
  durationMinutes: { type: Number, default: 15 },
  status: { type: String, default: "draft", index: true },
  startTime: { type: Number, default: 0 },
  createdAt: { type: Number, default: Date.now },
  targetTickers: [String], impactDirection: String
});

const SystemStateSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  marketStatus: { type: String, default: "CLOSED" },
  livePrices: { type: Object, default: {} },
  marketInfluence: { type: Object, default: {} },
  totalTaxCollected: { type: Number, default: 0 },
  lastTradeTax: { type: Number, default: 0 },
  priceHistory: { type: Object, default: {} }
});

const AdminLogSchema = new mongoose.Schema({
  timestamp: { type: Number, default: Date.now, index: -1 },
  adminEmail: String, action: String, details: Object
});

const User = mongoose.model("User", UserSchema);
const Order = mongoose.model("Order", OrderSchema);
const IPO = mongoose.model("IPO", IPOSchema);
const NewsEvent = mongoose.model("NewsEvent", NewsEventSchema);
const SystemState = mongoose.model("SystemState", SystemStateSchema);
const AdminLog = mongoose.model("AdminLog", AdminLogSchema);

// In-memory runtime state
let currentMarketStatus = "CLOSED";
let cachedLivePrices = {};
let cachedInfluences = {};
let cachedPriceHistory = {}; 
let pseudoBasePrices = {};
let totalTaxCollected = 0;
let lastTradeTax = 0;
let cachedRankings = [];
let tickCount = 0;

// 1. FAST MEMORY-CACHED AUTH
const authCache = new Map(); 

mongoose.connect(MONGO_URI, { maxPoolSize: 20, serverSelectionTimeoutMS: 5000 }).then(async () => {
  console.log("Connected to MongoDB Atlas");
  const sys = await SystemState.findOneAndUpdate(
    { key: "main" }, {}, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  currentMarketStatus = sys.marketStatus || "CLOSED";
  cachedLivePrices = sys.livePrices || {};
  cachedInfluences = sys.marketInfluence || {};
  totalTaxCollected = sys.totalTaxCollected || 0;
  cachedPriceHistory = sys.priceHistory || {};

  const admin = await User.findOne({ role: "admin" });
  if (!admin) {
    const hashed = await bcrypt.hash("admin@123", 10);
    await User.create({ uid: "admin_master", email: "admin@bazaar.com", password: hashed, name: "Master Admin", role: "admin" });
  }
  startSimulationEngines();
}).catch(err => console.error("MongoDB error:", err.message));

// --- IPO ALLOTMENT HELPERS ---
async function addLongHolding(uid, ticker, quantity, price) {
  if (quantity <= 0) return;
  const res = await User.updateOne(
    {
      uid,
      holdings: { $elemMatch: { ticker, positionType: "long" } }
    },
    [
      {
        $set: {
          holdings: {
            $map: {
              input: "$holdings",
              as: "h",
              in: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$$h.ticker", ticker] },
                      { $eq: ["$$h.positionType", "long"] }
                    ]
                  },
                  {
                    ticker: "$$h.ticker",
                    positionType: "$$h.positionType",
                    quantity: { $add: ["$$h.quantity", quantity] },
                    avgPrice: {
                      $round: [
                        {
                          $divide: [
                            {
                              $add: [
                                { $multiply: ["$$h.quantity", "$$h.avgPrice"] },
                                quantity * price
                              ]
                            },
                            { $add: ["$$h.quantity", quantity] }
                          ]
                        },
                        2
                      ]
                    }
                  },
                  "$$h"
                ]
              }
            }
          }
        }
      }
    ],
    { updatePipeline: true }
  );

  if (res.matchedCount === 0) {
    await User.updateOne(
      {
        uid,
        holdings: { $not: { $elemMatch: { ticker, positionType: "long" } } }
      },
      {
        $push: {
          holdings: {
            ticker,
            positionType: "long",
            quantity,
            avgPrice: price
          }
        }
      }
    );
  }
}

async function settleUid(ipo, uid, wonLots) {
  const userSubs = (ipo.subscriptions || []).filter(s => s.uid === uid && !s.settled);
  if (!userSubs.length) return;

  const lotSize = Number(ipo.lotSize) || 1;
  const price = Number(ipo.price) || 0;
  let wonLotsRemaining = wonLots;

  const updates = [];
  let totalUserRefund = 0;
  let totalAllocatedShares = 0;

  for (const sub of userSubs) {
    const reqLots = Number(sub.requestedLots) || Math.max(1, Math.floor((Number(sub.requestedShares) || 1) / lotSize));
    const subAllocLots = Math.min(reqLots, wonLotsRemaining);
    wonLotsRemaining -= subAllocLots;

    const subAllocShares = subAllocLots * lotSize;
    const fallbackCost = (Number(sub.requestedShares) || (reqLots * lotSize)) * price;
    const invested = Number(sub.investedAmount) > 0 ? Number(sub.investedAmount) : fallbackCost;
    const costUsed = subAllocShares * price;
    const subRefund = Number(Math.max(0, invested - costUsed).toFixed(2));
    const subStatus = subAllocLots > 0 ? "won" : "lost";

    totalUserRefund += subRefund;
    totalAllocatedShares += subAllocShares;

    updates.push({
      subId: sub.subId,
      _id: sub._id,
      allocatedLots: subAllocLots,
      allocatedShares: subAllocShares,
      refundedAmount: subRefund,
      status: subStatus
    });
  }

  const setObj = {};
  const arrayFilters = [];
  updates.forEach((u, idx) => {
    setObj[`subscriptions.$[elem${idx}].settled`] = true;
    setObj[`subscriptions.$[elem${idx}].allocatedLots`] = u.allocatedLots;
    setObj[`subscriptions.$[elem${idx}].allocatedShares`] = u.allocatedShares;
    setObj[`subscriptions.$[elem${idx}].refundedAmount`] = u.refundedAmount;
    setObj[`subscriptions.$[elem${idx}].status`] = u.status;

    const filter = { [`elem${idx}.uid`]: uid, [`elem${idx}.settled`]: { $ne: true } };
    if (u.subId) {
      filter[`elem${idx}.subId`] = u.subId;
    } else if (u._id) {
      filter[`elem${idx}._id`] = u._id;
    }
    arrayFilters.push(filter);
  });

  const claim = await IPO.updateOne(
    {
      _id: ipo._id,
      subscriptions: { $elemMatch: { uid: uid, settled: { $ne: true } } }
    },
    { $set: setObj },
    { arrayFilters }
  );

  if (claim.modifiedCount === 0) return;

  totalUserRefund = Number(totalUserRefund.toFixed(2));
  if (totalUserRefund > 0) {
    await User.updateOne({ uid }, { $inc: { cashBalance: totalUserRefund } });
  }

  if (totalAllocatedShares > 0) {
    await addLongHolding(uid, ipo.ticker, totalAllocatedShares, price);
  }

  const updatedUser = await User.findOne({ uid }, "cashBalance holdings").lean();
  io.emit(`userUpdate:${uid}`, { cashBalance: updatedUser?.cashBalance, holdings: updatedUser?.holdings });
}

async function runAllotment(ipo) {
  if (!ipo) return;

  const availableLots = Number(ipo.totalLots) || 1;
  const lotSize = Number(ipo.lotSize) || 1;

  let winCounts = ipo.allotmentResult || null;

  if (!winCounts) {
    const uidLots = {};
    for (const sub of (ipo.subscriptions || [])) {
      const reqLots = Number(sub.requestedLots) || Math.max(1, Math.floor((Number(sub.requestedShares) || 1) / lotSize));
      uidLots[sub.uid] = (uidLots[sub.uid] || 0) + reqLots;
    }

    let lotteryPool = [];
    for (const [uid, lots] of Object.entries(uidLots)) {
      for (let i = 0; i < lots; i++) {
        lotteryPool.push(uid);
      }
    }

    if (lotteryPool.length > availableLots) {
      for (let i = lotteryPool.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [lotteryPool[i], lotteryPool[j]] = [lotteryPool[j], lotteryPool[i]];
      }
    }

    const lotsToAward = Math.min(lotteryPool.length, availableLots);
    winCounts = {};
    lotteryPool.slice(0, lotsToAward).forEach(winnerUID => {
      winCounts[winnerUID] = (winCounts[winnerUID] || 0) + 1;
    });
  }

  let activeIpo = ipo;
  if (!ipo.hasAllotted) {
    const claimed = await IPO.findOneAndUpdate(
      { _id: ipo._id, hasAllotted: { $ne: true } },
      {
        $set: {
          hasAllotted: true,
          status: "allotted",
          triggerAllotment: false,
          allotmentResult: winCounts
        }
      },
      { returnDocument: 'after' }
    );

    if (claimed) {
      activeIpo = claimed;
      io.emit("newsUpdate", { type: "allotted", ipo: activeIpo.ticker });
    } else {
      const reloaded = await IPO.findById(ipo._id).lean();
      if (!reloaded) return;
      activeIpo = reloaded;
      winCounts = activeIpo.allotmentResult || winCounts;
    }
  }

  const unsettledUids = [
    ...new Set(
      (activeIpo.subscriptions || [])
        .filter(s => !s.settled)
        .map(s => s.uid)
    )
  ];

  for (const uid of unsettledUids) {
    await settleUid(activeIpo, uid, winCounts[uid] || 0);
  }
}

// --- SIMULATION ENGINES ---
function startSimulationEngines() {
  
  // 1. AUTO-IPO ENGINE
  let ipoEngineRunning = false;
  setInterval(async () => {
    if (ipoEngineRunning) return;
    ipoEngineRunning = true;
    try {
      const now = Date.now();
      const ipos = await IPO.find({ status: { $in: ["upcoming", "open", "closed", "allotted"] } });

      for (const ipo of ipos) {
        if (ipo.status === "upcoming" && ipo.openTime && now >= ipo.openTime) {
          const opened = await IPO.updateOne({ _id: ipo._id, status: "upcoming" }, { $set: { status: "open" } });
          if (opened.modifiedCount > 0) {
            await NewsEvent.create({
              eventId: "news_" + Date.now(), headline: `🚀 New IPO Open: ${ipo.ticker} is now OPEN for bidding at ₹${ipo.price}!`,
              status: "active", startTime: now, createdAt: now, durationMinutes: 60, targetTickers: [ipo.ticker], impactDirection: "positive"
            });
            io.emit("newsUpdate", { type: "new", ipo: ipo.ticker });
          }
        }

        const shouldAllot = (ipo.status === "open" || ipo.status === "closed") && (ipo.triggerAllotment || (ipo.closeTime && now >= ipo.closeTime));

        if (shouldAllot) {
          await runAllotment(ipo);
        } else if (ipo.status === "allotted" && (ipo.subscriptions || []).some(s => !s.settled)) {
          await runAllotment(ipo);
        }

        if (ipo.status === "allotted" && ((ipo.listTime && now >= ipo.listTime) || ipo.triggerListing)) {
          const claimedListing = await IPO.findOneAndUpdate(
            { _id: ipo._id, status: "allotted" },
            { $set: { status: "listed", triggerListing: false } },
            { returnDocument: 'after' }
          );

          if (claimedListing) {
            const rawListingPrice = Number(claimedListing.price) * (1 + ((Number(claimedListing.listingPremiumPct) || 0) / 100));
            const listingPrice = Math.max(0.01, Number(rawListingPrice.toFixed(2)));

            if (!cachedLivePrices[claimedListing.ticker]) {
              cachedLivePrices[claimedListing.ticker] = {
                ticker: claimedListing.ticker, name: claimedListing.name || claimedListing.ticker, sector: claimedListing.sector || "IPO",
                price: listingPrice, basePrice: listingPrice, high: listingPrice, low: listingPrice, volatility: 0.008, isIPO: true, timestamp: now
              };
            }
            await SystemState.updateOne({}, { livePrices: cachedLivePrices });

            await NewsEvent.create({
              eventId: "news_" + Date.now(),
              headline: `🚀 IPO Listed: ${claimedListing.ticker} (${claimedListing.name || claimedListing.ticker}) listed at ₹${listingPrice.toFixed(2)} and is now LIVE for trading!`,
              status: "active", startTime: now, createdAt: now, durationMinutes: 60, targetTickers: [claimedListing.ticker],
              impactDirection: listingPrice >= Number(claimedListing.price) ? "positive" : "negative"
            });

            io.emit("ipoUpdate", { ipoId: claimedListing.ipoId, status: "listed" });
            io.emit("newsUpdate", { type: "listed", ipo: claimedListing.ticker });
            io.emit("livePrices", { prices: cachedLivePrices, marketStatus: currentMarketStatus });
          }
        }
      }
    } catch (e) {
      console.error("Auto-IPO Engine Error:", e.message);
    } finally {
      ipoEngineRunning = false;
    }
  }, 3000);

  setInterval(async () => {
    try {
      const users = await User.find({ role: "student" }, "uid name email cashBalance startingBalance holdings").lean();
      const activeIpos = await IPO.find({ status: { $in: ["upcoming", "open", "closed"] } }).lean();
      const leaderboard = [];

      for (const user of users) {
        let longValue = 0; let shortPnL = 0; let blockedIpoFunds = 0;

        (user.holdings || []).forEach(holding => {
          const currentPrice = cachedLivePrices[holding.ticker]?.price || holding.avgPrice;
          if (holding.positionType === "long") {
            longValue += holding.quantity * currentPrice;
          } else if (holding.positionType === "short") {
            const initialMargin = holding.avgPrice * holding.quantity;
            const activePnL = (holding.avgPrice - currentPrice) * holding.quantity;
            shortPnL += (initialMargin + activePnL);
          }
        });

        activeIpos.forEach(ipo => {
          const userSubs = (ipo.subscriptions || []).filter(s => s.uid === user.uid && !s.settled && !['won', 'lost', 'success', 'refunded'].includes(s.status));
          userSubs.forEach(mySub => {
            const price = Number(ipo.price) || 0; const lotSize = Number(ipo.lotSize) || 1;
            const reqLots = Number(mySub.requestedLots) || Math.max(1, Math.floor((Number(mySub.requestedShares) || 1) / lotSize));
            blockedIpoFunds += (reqLots * lotSize * price);
          });
        });

        const startingCapital = Number(user.startingBalance) || 1000000;
        const totalValue = (Number(user.cashBalance) || 0) + longValue + shortPnL + blockedIpoFunds;
        const retPct = Number((((totalValue - startingCapital) / startingCapital) * 100).toFixed(2));

        leaderboard.push({
          uid: user.uid, displayName: user.name || (user.email ? user.email.split("@")[0] : "Trader"),
          portfolioValue: Number(totalValue.toFixed(2)), returnPct: retPct, pnl: retPct, pnlAmount: Number((totalValue - startingCapital).toFixed(2))
        });
      }

      leaderboard.sort((a, b) => b.portfolioValue - a.portfolioValue);
      cachedRankings = leaderboard.map((entry, index) => ({ ...entry, rank: index + 1 }));
      io.emit("leaderboard", cachedRankings);
    } catch (e) {
      console.error("Leaderboard calculation error:", e.message);
    }
  }, 6000);

  const TICK_INTERVAL_MS = 500;

  setInterval(async () => {
    try {
      if (currentMarketStatus !== "OPEN") return;
      tickCount++;
      const now = Date.now();
      const finishedEvents = new Set();

      for (const [eventId, inf] of Object.entries(cachedInfluences)) {
        if (inf.status === "active") {
          const elapsedMs = now - Number(inf.startTime || 0);
          const durationMs = (Number(inf.durationMinutes) || 15) * 60 * 1000;
          if (elapsedMs > durationMs) finishedEvents.add(eventId);
        }
      }

      // Generate Shared Sector Biases per tick
      const sectorBiases = {};
      Object.values(cachedLivePrices).forEach(stock => {
         const sector = stock.sector || "General";
         if (sectorBiases[sector] === undefined) sectorBiases[sector] = (Math.random() - 0.5); 
      });

      // Update Pseudo Base Prices every 30 seconds (60 ticks of 500ms)
      if (tickCount % 60 === 0) {
        for (const tkr of Object.keys(cachedLivePrices)) {
          pseudoBasePrices[tkr] = cachedLivePrices[tkr].price;
        }
      }

      for (const ticker of Object.keys(cachedLivePrices)) {
        const stockData = cachedLivePrices[ticker];
        
        // Initialize pseudo base if missing
        if (!pseudoBasePrices[ticker]) pseudoBasePrices[ticker] = Number(stockData.basePrice) || Number(stockData.price);
        const currentPseudoBase = pseudoBasePrices[ticker];
        
        let eventBias = 0;
        let hasActiveNews = false;

        for (const [eventId, inf] of Object.entries(cachedInfluences)) {
          if (inf.status === "active" && inf.impacts && inf.impacts[ticker] !== undefined) {
            hasActiveNews = true;
            const targetImpactPct = inf.impacts[ticker] / 100;
            const elapsedMs = now - inf.startTime;
            const durationMs = (inf.durationMinutes || 15) * 60 * 1000;
            if (elapsedMs > 0 && elapsedMs <= durationMs) {
              const progress = elapsedMs / durationMs;
              // Apply sine wave momentum for this specific tick
              eventBias += (targetImpactPct / (durationMs / TICK_INTERVAL_MS)) * (Math.PI / 2) * Math.sin(progress * Math.PI);
            }
          }
        }

        let newPrice = stockData.price;

        if (hasActiveNews) {
          // 1. News Mode: Let the news drive the price, pause the random walk
          newPrice = stockData.price * (1 + eventBias);
          // Lock the pseudo base to the news price so it doesn't crash back when news ends
          pseudoBasePrices[ticker] = newPrice;
        } else {
          // 2. Normal Mode: +/- 2% Random Walk around the pseudo base
          const deviation = (stockData.price - currentPseudoBase) / currentPseudoBase;
          const meanReversion = -deviation * 0.05; // Snap back to pseudo base
          
          const sector = stockData.sector || "General";
          const individualRandomness = (Math.random() - 0.5);
          const blendedRandomness = (sectorBiases[sector] * 0.7) + (individualRandomness * 0.3);
          const randomStep = blendedRandomness * (stockData.volatility || 0.005);

          newPrice = stockData.price * (1 + randomStep + meanReversion);

          // Lock rigidly to a maximum +/- 2% drift from the 30-second pseudo base
          const absoluteMin = Math.max(0.01, currentPseudoBase * 0.98);
          const absoluteMax = currentPseudoBase * 1.02;
          newPrice = Math.max(absoluteMin, Math.min(absoluteMax, newPrice));
        }

        const currHigh = Math.max(Number(stockData.high || newPrice), Number(newPrice));
        const currLow = Math.min(Number(stockData.low || newPrice), Number(newPrice));

        cachedLivePrices[ticker] = {
          ...stockData, price: Number(newPrice.toFixed(2)),
          high: Number(currHigh.toFixed(2)), low: Number(currLow.toFixed(2)), timestamp: now
        };

        if (!cachedPriceHistory[ticker]) cachedPriceHistory[ticker] = {};
        if (tickCount % 10 === 0) { 
          cachedPriceHistory[ticker][now] = Number(newPrice.toFixed(2));
          const keys = Object.keys(cachedPriceHistory[ticker]);
          if (keys.length > 500) delete cachedPriceHistory[ticker][keys[0]]; 
        }
      }

      for (const eventId of finishedEvents) {
        delete cachedInfluences[eventId];
        const query = mongoose.isValidObjectId(eventId) ? { $or: [{ eventId }, { _id: eventId }] } : { eventId };
        await NewsEvent.updateOne(query, { status: "completed" });
      }

      io.emit("livePrices", { prices: cachedLivePrices, marketStatus: currentMarketStatus });
    } catch (e) {}
  }, TICK_INTERVAL_MS);

  setInterval(async () => {
    try {
      await SystemState.updateOne({ key: "main" }, { 
        marketStatus: currentMarketStatus, 
        livePrices: cachedLivePrices, 
        marketInfluence: cachedInfluences, 
        totalTaxCollected, 
        lastTradeTax,
        priceHistory: cachedPriceHistory // <--- ADD THIS LINE
      });
    } catch (e) {}
  }, 15000);
}

// --- FAST MEMORY-CACHED AUTH MIDDLEWARE ---
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: { message: "Unauthenticated" } });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const now = Date.now();
    let cached = authCache.get(decoded.uid);
    
    if (cached && (now - cached.ts < 15000)) {
      req.user = cached.user;
      return next();
    }
    
    req.user = await User.findOne({ uid: decoded.uid }, "uid email role name isFrozen").lean();
    if (!req.user) return res.status(401).json({ error: { message: "User not found" } });
    
    authCache.set(decoded.uid, { user: req.user, ts: now });
    next();
  } catch (err) {
    res.status(401).json({ error: { message: "Invalid session token" } });
  }
};

const verifyAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") return res.status(403).json({ error: { message: "Administrator privileges required" } });
  next();
};

const handleCallable = (handler) => async (req, res) => {
  try {
    const context = { auth: req.user ? { uid: req.user.uid } : null };
    const data = req.body.data || {};
    const result = await handler(data, context);
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
};

// --- AUTH & USER ENDPOINTS ---
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body.data || req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: { message: "Invalid email address or password." } });
    }
    const token = jwt.sign({ uid: user.uid, role: user.role }, JWT_SECRET, { expiresIn: "30d" });
    res.json({
      data: {
        token, user: { uid: user.uid, email: user.email, name: user.name, role: user.role, cashBalance: user.cashBalance, startingBalance: user.startingBalance, isFrozen: user.isFrozen }
      }
    });
  } catch (e) { res.status(500).json({ error: { message: e.message } }); }
});

app.post('/api/register', handleCallable(async (data) => {
  const { email, password, name } = data;
  const existing = await User.findOne({ email });
  if (existing) throw new Error("Email already in use");
  const hashed = await bcrypt.hash(password, 10);
  const uid = "user_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
  await User.create({ uid, email, password: hashed, name, role: "student", startingBalance: 1000000, cashBalance: 1000000 });
  return { success: true };
}));

app.get("/api/me", authMiddleware, async (req, res) => {
  const u = await User.findOne({ uid: req.user.uid }).lean();
  res.json({ data: u });
});

app.get("/api/state", (req, res) => {
  res.json({ data: { marketStatus: currentMarketStatus, livePrices: cachedLivePrices, priceHistory: cachedPriceHistory, leaderboard: cachedRankings, totalTaxCollected, lastTradeTax } });
});

app.get("/api/leaderboard", (req, res) => {
  res.json({ data: { rankings: cachedRankings } });
});

app.get("/api/history/:ticker", authMiddleware, (req, res) => {
  const ticker = req.params.ticker?.toUpperCase();
  const limit = Math.min(parseInt(req.query.limit, 10) || 500, 500);
  const historyObj = cachedPriceHistory[ticker] || {};
  const sortedTimestamps = Object.keys(historyObj).sort((a, b) => Number(a) - Number(b));
  const slicedTimestamps = sortedTimestamps.slice(-limit);
  const result = {};
  slicedTimestamps.forEach(ts => { result[ts] = historyObj[ts]; });
  res.json({ data: result });
});

app.get("/api/orders", authMiddleware, async (req, res) => {
  const orders = await Order.find({ uid: req.user.uid }).sort({ timestamp: -1 }).limit(100).lean();
  res.json({ data: orders });
});

app.get("/api/ipos", authMiddleware, async (req, res) => {
  const ipos = await IPO.find().lean();
  res.json({ data: ipos });
});

app.get("/api/news", authMiddleware, async (req, res) => {
  const news = await NewsEvent.find().sort({ createdAt: -1 }).lean();
  res.json({ data: news });
});

app.get("/api/wishlists", authMiddleware, async (req, res) => {
  const user = await User.findOne({ uid: req.user.uid }, "wishlists").lean();
  res.json({ data: { wishlists: user?.wishlists || [] } });
});

app.post("/api/wishlists/sync", authMiddleware, handleCallable(async (data, context) => {
  await User.updateOne({ uid: context.auth.uid }, { wishlists: data.wishlists });
  return { success: true };
}));

// --- CORE NON-BLOCKING TRADING ENGINE ---
app.post('/api/executeTrade', authMiddleware, handleCallable(async (data, context) => {
  const execStart = Date.now();
  if (!context.auth) throw new Error("User not logged in");
  const uid = context.auth.uid;
  const { ticker, action, quantity } = data;
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) throw new Error("Quantity must be positive");

  if (currentMarketStatus !== "OPEN") throw new Error("Market is closed");
  const priceData = cachedLivePrices[ticker];
  if (!priceData || !priceData.price) throw new Error("Invalid ticker");
  const execPrice = priceData.price;

  const user = await User.findOne({ uid });
  if (!user) throw new Error("User not found");
  if (user.isFrozen) throw new Error("Account is frozen");

  let cashBalance = user.cashBalance;
  let longData = user.holdings.find(h => h.ticker === ticker && h.positionType === "long") || { ticker, positionType: "long", quantity: 0, avgPrice: 0 };
  let shortData = user.holdings.find(h => h.ticker === ticker && h.positionType === "short") || { ticker, positionType: "short", quantity: 0, avgPrice: 0 };

  let orderStatus = "pending", rejectReason = "";
  let realizedPnL = 0; let pnlPct = 0; let taxDeducted = 0;

  if (action === "BUY") {
    const grossCost = qty * execPrice;
    taxDeducted = Math.round(grossCost * 0.001 * 100) / 100;
    const totalDebit = grossCost + taxDeducted;
    if (cashBalance < totalDebit) { orderStatus = "rejected"; rejectReason = "Insufficient cash (including 0.1% STT)"; }
    else {
      cashBalance -= totalDebit;
      const existingIdx = user.holdings.findIndex(h => h.ticker === ticker && h.positionType === "long");
      const newQty = longData.quantity + qty;
      const newAvg = ((longData.quantity * longData.avgPrice) + grossCost) / newQty;
      if (existingIdx >= 0) { user.holdings[existingIdx].quantity = newQty; user.holdings[existingIdx].avgPrice = newAvg; }
      else { user.holdings.push({ ticker, positionType: "long", quantity: newQty, avgPrice: newAvg }); }
      orderStatus = "completed";
    }
  } else if (action === "SELL") {
    if (longData.quantity < qty) { orderStatus = "rejected"; rejectReason = "Insufficient long quantity"; }
    else {
      const grossProceeds = qty * execPrice;
      taxDeducted = Math.round(grossProceeds * 0.001 * 100) / 100;
      const netProceeds = grossProceeds - taxDeducted;
      const buyPrice = longData.avgPrice || execPrice;
      realizedPnL = Math.round(((execPrice - buyPrice) * qty - taxDeducted) * 100) / 100;
      pnlPct = buyPrice > 0 ? Number((((execPrice - buyPrice) / buyPrice) * 100).toFixed(2)) : 0;
      cashBalance += netProceeds;
      if (longData.quantity - qty === 0) user.holdings = user.holdings.filter(h => !(h.ticker === ticker && h.positionType === "long"));
      else user.holdings.find(h => h.ticker === ticker && h.positionType === "long").quantity -= qty;
      orderStatus = "completed";
    }
  } else if (action === "SHORT") {
    const marginRequired = qty * execPrice;
    taxDeducted = Math.round(marginRequired * 0.001 * 100) / 100;
    if (cashBalance < marginRequired + taxDeducted) { orderStatus = "rejected"; rejectReason = "Insufficient cash balance for margin requirement"; }
    else {
      cashBalance -= (marginRequired + taxDeducted);
      const existingIdx = user.holdings.findIndex(h => h.ticker === ticker && h.positionType === "short");
      const newQty = shortData.quantity + qty;
      const newAvg = ((shortData.quantity * shortData.avgPrice) + marginRequired) / newQty;
      if (existingIdx >= 0) { user.holdings[existingIdx].quantity = newQty; user.holdings[existingIdx].avgPrice = newAvg; }
      else { user.holdings.push({ ticker, positionType: "short", quantity: newQty, avgPrice: newAvg }); }
      orderStatus = "completed";
    }
  } else if (action === "COVER") {
    if (shortData.quantity < qty) { orderStatus = "rejected"; rejectReason = "Insufficient short quantity"; }
    else {
      const coverCost = qty * execPrice;
      taxDeducted = Math.round(coverCost * 0.001 * 100) / 100;
      const shortPrice = shortData.avgPrice || execPrice;
      realizedPnL = Math.round(((shortPrice - execPrice) * qty - taxDeducted) * 100) / 100;
      pnlPct = shortPrice > 0 ? Number((((shortPrice - execPrice) / shortPrice) * 100).toFixed(2)) : 0;
      const initialMargin = qty * shortPrice;
      
      if (cashBalance + initialMargin + realizedPnL < 0) { orderStatus = "rejected"; rejectReason = "Insufficient cash to absorb short trade loss"; }
      else {
        cashBalance += (initialMargin + realizedPnL);
        if (shortData.quantity - qty === 0) user.holdings = user.holdings.filter(h => !(h.ticker === ticker && h.positionType === "short"));
        else user.holdings.find(h => h.ticker === ticker && h.positionType === "short").quantity -= qty;
        orderStatus = "completed";
      }
    }
  }

  if (orderStatus === "completed") {
    totalTaxCollected += taxDeducted;
    lastTradeTax = taxDeducted;
    user.cashBalance = Math.max(0, cashBalance);
    await user.save(); 
    io.emit(`userUpdate:${uid}`, { cashBalance: user.cashBalance, holdings: user.holdings });
  }

  const executionLatencyMs = Date.now() - execStart;

  // 2. ASYNC LEDGER WRITE (Decoupled from HTTP Response to drop execution time below 0.5s)
  Order.create({
    orderId: "ord_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    uid, ticker, side: action, quantity: qty, priceAtExecution: execPrice, status: orderStatus, 
    reason: rejectReason, realizedPnL, pnlPct, taxDeducted, executionLatencyMs
  }).catch(err => console.error("Async Order Write Error:", err));

  return { status: orderStatus, reason: rejectReason, executionPrice: execPrice, realizedPnL, pnlPct, taxDeducted, executionLatencyMs };
}));

// --- IPO BIDDING ---
app.post('/api/subscribeIPO', authMiddleware, handleCallable(async (data, context) => {
  if (!context.auth) throw new Error("User not logged in");
  const uid = context.auth.uid;

  const ipoQuery = mongoose.isValidObjectId(data.ipoId) ? { $or: [{ ipoId: data.ipoId }, { _id: data.ipoId }] } : { ipoId: data.ipoId };
  const ipo = await IPO.findOne(ipoQuery);
  if (!ipo || ipo.status !== "open") throw new Error("IPO is not open for bidding");

  const lotSize = Number(ipo.lotSize) || 1;
  const totalLots = Number(ipo.totalLots) || 1;
  const price = Number(ipo.price) || 0;

  const lots = Number(data.requestedLots);
  if (!Number.isInteger(lots) || lots < 1 || lots > totalLots) {
    throw new Error("Invalid lots");
  }

  const requestedShares = lots * lotSize;
  if (data.requestedShares !== undefined && Number(data.requestedShares) !== requestedShares) {
    throw new Error(`Requested shares must match requested lots * lot size (${requestedShares})`);
  }
  const cost = requestedShares * price;

  const userCheck = await User.findOne({ uid }, "isFrozen cashBalance").lean();
  if (!userCheck) throw new Error("User not found");
  if (userCheck.isFrozen) throw new Error("Account is frozen. Bidding disabled.");
  if ((Number(userCheck.cashBalance) || 0) < cost) {
    throw new Error(`Insufficient balance: You need ₹${cost.toLocaleString("en-IN")}, but your available cash is ₹${(Number(userCheck.cashBalance) || 0).toLocaleString("en-IN")}`);
  }

  // 1. Atomic cash deduction
  const deductRes = await User.updateOne(
    { uid, cashBalance: { $gte: cost }, isFrozen: { $ne: true } },
    { $inc: { cashBalance: -cost } }
  );
  if (deductRes.modifiedCount !== 1) {
    throw new Error("Insufficient funds or frozen");
  }

  const subData = {
    subId: "sub_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    uid,
    requestedShares,
    requestedLots: lots,
    allocatedShares: 0,
    allocatedLots: 0,
    investedAmount: cost,
    refundedAmount: 0,
    status: "pending",
    timestamp: Date.now(),
    settled: false
  };

  // 2. Push subscription & increment totals
  try {
    const pushRes = await IPO.updateOne(
      { _id: ipo._id, status: "open", "subscriptions.uid": { $ne: uid } },
      {
        $push: { subscriptions: subData },
        $inc: {
          totalSubscribedLots: lots,
          totalSubscribedShares: requestedShares,
          subscriptionCount: 1
        }
      }
    );

    if (pushRes.modifiedCount !== 1) {
      throw new Error("Subscription failed: IPO is no longer open or you have already subscribed");
    }
  } catch (err) {
    console.error(`[subscribeIPO rollback] Refunding ₹${cost} to uid=${uid} due to: ${err.message}`);
    await User.updateOne({ uid }, { $inc: { cashBalance: cost } });
    throw err;
  }

  const updatedIpo = await IPO.findById(ipo._id, "totalSubscribedLots totalLots").lean();
  if (updatedIpo) {
    const subRate = Number(((Number(updatedIpo.totalSubscribedLots) || 0) / (Number(updatedIpo.totalLots) || 1)).toFixed(2));
    await IPO.updateOne({ _id: ipo._id }, { $set: { subscriptionRate: subRate } });
  }

  const updatedUser = await User.findOne({ uid }, "cashBalance").lean();
  io.emit(`userUpdate:${uid}`, { cashBalance: updatedUser?.cashBalance });
  return { success: true };
}));

// --- ADMIN SYSTEM CONTROLLERS ---
app.get('/api/admin/users', authMiddleware, verifyAdmin, async (req, res) => { res.json({ data: await User.find().lean() }); });
app.get('/api/admin/orders', authMiddleware, verifyAdmin, async (req, res) => { res.json({ data: await Order.find().sort({ timestamp: -1 }).limit(50).lean() }); });
app.get("/api/adminLogs", authMiddleware, verifyAdmin, async (req, res) => { res.json({ data: await AdminLog.find().sort({ timestamp: -1 }).limit(100).lean() }); });

app.post('/api/adminChangePassword', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const { uid, newPassword } = data;
  if (!newPassword || newPassword.length < 6) throw new Error("Password must be at least 6 characters.");
  const hashed = await bcrypt.hash(newPassword, 10);
  await User.updateOne({ uid }, { password: hashed });
  return { success: true };
}));

app.post('/api/adminAdjustCash', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  await User.updateOne({ uid: data.uid }, { cashBalance: data.amount });
  io.emit(`userUpdate:${data.uid}`, { cashBalance: data.amount });
  return { success: true };
}));

app.post('/api/adminSetMarketStatus', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  currentMarketStatus = typeof data === "string" ? data.trim().toUpperCase() : data.status;
  io.emit("livePrices", { prices: cachedLivePrices, marketStatus: currentMarketStatus });
  return { success: true };
}));

app.post('/api/adminForceStockPrice', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const ticker = data.ticker?.toUpperCase();
  const targetPrice = Number(data.price);
  if (cachedLivePrices[ticker] && !isNaN(targetPrice)) {
    cachedLivePrices[ticker].price = targetPrice;
    cachedLivePrices[ticker].basePrice = targetPrice; 
    cachedLivePrices[ticker].high = Math.max(cachedLivePrices[ticker].high || targetPrice, targetPrice);
    cachedLivePrices[ticker].low = Math.min(cachedLivePrices[ticker].low || targetPrice, targetPrice);
    cachedLivePrices[ticker].timestamp = Date.now();
    io.emit("livePrices", { prices: cachedLivePrices, marketStatus: currentMarketStatus });
  }
  return { success: true };
}));

app.post('/api/adminToggleUserFreeze', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  await User.updateOne({ uid: data.uid }, { isFrozen: data.isFrozen });
  authCache.delete(data.uid); 
  io.emit(`userUpdate:${data.uid}`, { isFrozen: data.isFrozen });
  return { success: true };
}));

app.post('/api/adminImportStocks', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  data.stocks.forEach(s => {
    cachedLivePrices[s.ticker] = {
      name: s.name || s.ticker, sector: s.sector || "General", price: Number(s.basePrice),
      basePrice: Number(s.basePrice), volatility: Number(s.volatility || 0.005), isIPO: false, timestamp: Date.now()
    };
  });
  return { success: true };
}));

app.post('/api/adminDeleteStock', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  delete cachedLivePrices[data.ticker];
  return { success: true };
}));

app.post('/api/adminUpdateStock', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  if (cachedLivePrices[data.ticker]) {
    cachedLivePrices[data.ticker].name = data.name;
    cachedLivePrices[data.ticker].sector = data.sector;
    cachedLivePrices[data.ticker].basePrice = Number(data.basePrice);
    cachedLivePrices[data.ticker].volatility = Number(data.volatility);
  }
  return { success: true };
}));

app.post('/api/adminImportUsers', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  for (const u of data.users) {
    const existing = await User.findOne({ email: u.email });
    if (!existing) {
      const hashed = await bcrypt.hash(u.password, 10);
      await User.create({
        uid: "user_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
        email: u.email, password: hashed, name: u.name, role: "student",
        startingBalance: Number(u.startingBalance || 1000000), cashBalance: Number(u.startingBalance || 1000000),
        isFrozen: false, holdings: [], wishlists: []
      });
    }
  }
  return { success: true };
}));

app.post('/api/adminImportNews', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const events = data.events || [];
  for (const ev of events) {
    await NewsEvent.create({
      eventId: "news_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      headline: ev.headline, stockImpacts: ev.stockImpacts || {},
      durationMinutes: Number(ev.durationMinutes) || 15, status: "draft", startTime: 0, createdAt: Date.now()
    });
  }
  return { success: true, count: events.length };
}));

app.post('/api/adminCreateIPO', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const ticker = data.ticker?.trim().toUpperCase();
  if (!ticker) throw new Error("Ticker is required");

  const existingIPO = await IPO.findOne({ ticker });
  if (existingIPO) throw new Error("An IPO with this ticker already exists");
  if (cachedLivePrices[ticker]) throw new Error("A stock with this ticker already exists in the market");

  const price = Number(data.price);
  const lotSize = parseInt(data.lotSize, 10);
  const totalLots = parseInt(data.totalLots, 10);
  if (isNaN(price) || price <= 0) throw new Error("Price must be a positive number");
  if (isNaN(lotSize) || lotSize < 1) throw new Error("Lot size must be a positive integer");
  if (isNaN(totalLots) || totalLots < 1) throw new Error("Total lots must be a positive integer");

  const openTime = Number(data.openTime);
  const closeTime = Number(data.closeTime);
  const listTime = Number(data.listTime);
  if (!openTime || !closeTime || !listTime || !(openTime < closeTime && closeTime < listTime)) {
    throw new Error("Invalid schedule: openTime must be before closeTime, and closeTime before listTime");
  }

  await IPO.create({
    ipoId: "ipo_" + Date.now(), name: data.name || ticker, ticker, price, lotSize,
    totalLots, listingPremiumPct: Number(data.listingPremiumPct) || 0, sector: data.sector || "Upcoming",
    status: "upcoming", openTime, closeTime, listTime
  });
  return { success: true };
}));

app.post('/api/adminCloseIPO', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const query = mongoose.isValidObjectId(data.ipoId) ? { $or: [{ ipoId: data.ipoId }, { _id: data.ipoId }] } : { ipoId: data.ipoId };
  const res = await IPO.updateOne({ ...query, status: "open" }, { $set: { status: "closed" } });
  if (res.matchedCount === 0) throw new Error("IPO not found or not in open status");
  return { success: true };
}));

app.post('/api/adminDeleteIPO', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const query = mongoose.isValidObjectId(data.ipoId) ? { $or: [{ ipoId: data.ipoId }, { _id: data.ipoId }] } : { ipoId: data.ipoId };
  const ipo = await IPO.findOne(query);
  if (!ipo) throw new Error("IPO not found");

  if (['allotted', 'listed'].includes(ipo.status)) {
    throw new Error("Cannot delete an IPO that is already allotted or listed");
  }

  if (ipo.subscriptions && ipo.subscriptions.length > 0) {
    const userRefunds = {};
    for (const sub of ipo.subscriptions) {
      if (!['won', 'lost', 'refunded', 'success'].includes(sub.status) && !sub.settled) {
        const fallbackCost = (Number(sub.requestedShares) || (Number(sub.requestedLots) * (Number(ipo.lotSize) || 1))) * (Number(ipo.price) || 0);
        const refund = Number(sub.investedAmount) > 0 ? Number(sub.investedAmount) : fallbackCost;
        if (refund > 0) {
          userRefunds[sub.uid] = (userRefunds[sub.uid] || 0) + refund;
        }
      }
    }

    for (const [uid, refund] of Object.entries(userRefunds)) {
      const roundedRefund = Number(refund.toFixed(2));
      await User.updateOne({ uid }, { $inc: { cashBalance: roundedRefund } });
      const u = await User.findOne({ uid }, "cashBalance holdings").lean();
      io.emit(`userUpdate:${uid}`, { cashBalance: u?.cashBalance, holdings: u?.holdings });
    }
  }

  await IPO.deleteOne(query);
  return { success: true };
}));

app.post('/api/adminUpdateIPOGMP', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const query = mongoose.isValidObjectId(data.ipoId) ? { $or: [{ ipoId: data.ipoId }, { _id: data.ipoId }] } : { ipoId: data.ipoId };
  const ipo = await IPO.findOne(query);
  if (!ipo) throw new Error("IPO not found");
  if (ipo.status === "listed") throw new Error("Cannot update GMP of a listed IPO");

  await IPO.updateOne(query, { $set: { listingPremiumPct: Number(data.listingPremiumPct) || 0 } });
  return { success: true };
}));

app.post('/api/processAllotment', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const query = mongoose.isValidObjectId(data.ipoId) ? { $or: [{ ipoId: data.ipoId }, { _id: data.ipoId }] } : { ipoId: data.ipoId };
  const res = await IPO.updateOne({ ...query, status: { $in: ["open", "closed"] } }, { $set: { triggerAllotment: true } });
  if (res.matchedCount === 0) throw new Error("IPO not found or not in open/closed status for allotment");
  return { success: true };
}));

app.post('/api/listIPO', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const query = mongoose.isValidObjectId(data.ipoId) ? { $or: [{ ipoId: data.ipoId }, { _id: data.ipoId }] } : { ipoId: data.ipoId };
  const ipo = await IPO.findOneAndUpdate(
    { ...query, status: "allotted" },
    { $set: { status: "listed", triggerListing: false } },
    { returnDocument: 'after' }
  );
  if (!ipo) throw new Error("IPO not found or not in allotted status");

  const now = Date.now();
  const rawListingPrice = Number(ipo.price) * (1 + ((Number(ipo.listingPremiumPct) || 0) / 100));
  const listingPrice = Math.max(0.01, Number(rawListingPrice.toFixed(2)));

  if (!cachedLivePrices[ipo.ticker]) {
    cachedLivePrices[ipo.ticker] = {
      ticker: ipo.ticker, name: ipo.name || ipo.ticker, sector: ipo.sector || "IPO",
      price: listingPrice, basePrice: listingPrice, high: listingPrice, low: listingPrice, volatility: 0.008, isIPO: true, timestamp: now
    };
  }
  await SystemState.updateOne({}, { livePrices: cachedLivePrices });

  await NewsEvent.create({
    eventId: "news_" + Date.now(),
    headline: `🚀 IPO Listed: ${ipo.ticker} (${ipo.name || ipo.ticker}) listed at ₹${listingPrice.toFixed(2)} and is now LIVE for trading!`,
    status: "active", startTime: now, createdAt: now, durationMinutes: 60, targetTickers: [ipo.ticker],
    impactDirection: listingPrice >= Number(ipo.price) ? "positive" : "negative"
  });

  io.emit("ipoUpdate", { ipoId: ipo.ipoId, status: "listed" });
  io.emit("newsUpdate", { type: "listed", ipo: ipo.ticker });
  io.emit("livePrices", { prices: cachedLivePrices, marketStatus: currentMarketStatus });

  return { success: true, ticker: ipo.ticker, price: listingPrice };
}));

app.post('/api/adminCreateNewsEvent', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  if (!data.headline) throw new Error("Headline is required.");
  const evtId = "news_" + Date.now();
  await NewsEvent.create({
    eventId: evtId, headline: data.headline, stockImpacts: data.stockImpacts || {},
    durationMinutes: Number(data.durationMinutes) || 15, status: "draft", createdAt: Date.now()
  });
  return { success: true, eventId: evtId };
}));

app.post('/api/adminReleaseNewsEvent', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const targetId = data.eventId || data.event?.id || data.event?.eventId;
  const now = Date.now();
  const query = mongoose.isValidObjectId(targetId) ? { $or: [{ eventId: targetId }, { _id: targetId }] } : { eventId: targetId };

  await NewsEvent.updateOne(query, { status: "active", startTime: now, firedAt: now, durationMinutes: data.durationMinutes || 15 });
  cachedInfluences[targetId] = {
    id: targetId, headline: data.event?.headline || "Breaking Market News",
    impacts: data.event?.stockImpacts || {}, durationMinutes: data.durationMinutes || 15, startTime: now, status: "active"
  };
  io.emit("newsUpdate", { type: "breaking", headline: data.event?.headline });
  return { success: true };
}));

app.post('/api/adminCancelNewsEvent', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const targetId = data.eventId;
  const query = mongoose.isValidObjectId(targetId) ? { $or: [{ eventId: targetId }, { _id: targetId }] } : { eventId: targetId };
  await NewsEvent.updateOne(query, { status: "cancelled" });
  delete cachedInfluences[targetId];
  return { success: true };
}));

app.post('/api/adminDeleteSingleNews', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const targetId = data.eventId;
  const query = mongoose.isValidObjectId(targetId) ? { $or: [{ eventId: targetId }, { _id: targetId }] } : { eventId: targetId };
  await NewsEvent.deleteOne(query);
  delete cachedInfluences[targetId];
  return { success: true };
}));

app.post('/api/adminDeleteAllNews', authMiddleware, verifyAdmin, handleCallable(async () => {
  await NewsEvent.deleteMany({});
  cachedInfluences = {}; 
  return { success: true };
}));

app.post('/api/adminTriggerNextNews', authMiddleware, verifyAdmin, handleCallable(async () => {
  const event = await NewsEvent.findOne({ status: "draft" }).sort({ createdAt: 1 });
  if (!event) throw new Error("No draft news in queue.");
  const now = Date.now();
  event.status = "active"; event.startTime = now; event.firedAt = now; await event.save();
  cachedInfluences[event.eventId] = { id: event.eventId, headline: event.headline, impacts: event.stockImpacts || {}, durationMinutes: event.durationMinutes || 15, startTime: now, status: "active" };
  io.emit("newsUpdate", { type: "breaking", headline: event.headline });
  return { success: true, headline: event.headline };
}));

app.post('/api/adminTriggerAllNews', authMiddleware, verifyAdmin, handleCallable(async () => {
  const drafts = await NewsEvent.find({ status: "draft" });
  if (drafts.length === 0) throw new Error("No draft news in queue.");
  const now = Date.now();
  for (const event of drafts) {
    event.status = "active"; event.startTime = now; event.firedAt = now; await event.save();
    cachedInfluences[event.eventId] = { id: event.eventId, headline: event.headline, impacts: event.stockImpacts || {}, durationMinutes: event.durationMinutes || 15, startTime: now, status: "active" };
  }
  io.emit("newsUpdate", { type: "bulk_breaking", count: drafts.length });
  return { success: true, count: drafts.length };
}));

app.post('/api/adminResetSystem', authMiddleware, verifyAdmin, handleCallable(async () => {
  await Order.deleteMany({}); await IPO.deleteMany({}); await NewsEvent.deleteMany({}); await User.deleteMany({ role: "student" });
  cachedLivePrices = {}; cachedPriceHistory = {}; cachedInfluences = {}; totalTaxCollected = 0; lastTradeTax = 0; cachedRankings = []; currentMarketStatus = "CLOSED"; authCache.clear();
  return { success: true };
}));

app.post('/api/logAdminAction', authMiddleware, verifyAdmin, async (req, res) => {
  const { action, details } = req.body.data || req.body;
  await AdminLog.create({ timestamp: Date.now(), adminEmail: req.user.email, action, details });
  res.json({ data: { success: true } });
});

process.on("uncaughtException", (err) => console.error("Uncaught Exception:", err.message));
process.on("unhandledRejection", (reason) => console.error("Unhandled Rejection:", reason));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`MarketSim Engine running on port ${PORT}`);
});