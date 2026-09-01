const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "bazaar_jwt_secure_secret_2026";
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://...";
const PORT = process.env.PORT || 8080;

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"]
});

// --- MONGOOSE SCHEMAS ---
const UserSchema = new mongoose.Schema({
  uid: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  name: { type: String, default: "Trader" },
  role: { type: String, enum: ["student", "admin"], default: "student" },
  startingBalance: { type: Number, default: 1000000 },
  cashBalance: { type: Number, default: 1000000 },
  isFrozen: { type: Boolean, default: false },
  holdings: [{
    ticker: String,
    positionType: { type: String, enum: ["long", "short"] },
    quantity: Number,
    avgPrice: Number
  }],
  wishlists: [{
    id: Number,
    name: String,
    tickers: [String]
  }],
  createdAt: { type: Number, default: Date.now }
});

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true },
  uid: String,
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
  timestamp: { type: Number, default: Date.now }
});

const IPOSchema = new mongoose.Schema({
  ipoId: { type: String, unique: true },
  name: String,
  ticker: String,
  price: Number,
  lotSize: Number,
  totalLots: Number,
  listingPremiumPct: Number,
  sector: { type: String, default: "Upcoming" },
  allotmentType: { type: String, default: "lottery" },
  status: { type: String, default: "upcoming" },
  totalSubscribedLots: { type: Number, default: 0 },
  totalSubscribedShares: { type: Number, default: 0 },
  subscriptionCount: { type: Number, default: 0 },
  subscriptionRate: { type: Number, default: 0 },
  openTime: Number,
  closeTime: Number,
  listTime: Number,
  triggerAllotment: Boolean,
  triggerListing: Boolean,
  allotmentCompletedAt: Number,
  subscriptions: [{
    subId: String,
    uid: String,
    requestedShares: Number,
    requestedLots: Number,
    allocatedLots: { type: Number, default: 0 },
    allocatedShares: { type: Number, default: 0 },
    investedAmount: Number,
    refundedAmount: { type: Number, default: 0 },
    status: { type: String, default: "pending" },
    timestamp: { type: Number, default: Date.now },
    allotmentTimestamp: Number
  }]
});

const NewsEventSchema = new mongoose.Schema({
  eventId: { type: String, unique: true },
  headline: String,
  stockImpacts: { type: Object, default: {} },
  durationMinutes: { type: Number, default: 15 },
  status: { type: String, default: "draft" },
  startTime: { type: Number, default: 0 },
  firedAt: { type: Number, default: 0 },
  createdAt: { type: Number, default: Date.now },
  targetTickers: [String],
  impactDirection: String
});

const SystemStateSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  marketStatus: { type: String, default: "CLOSED" },
  livePrices: { type: Object, default: {} },
  priceHistory: { type: Object, default: {} },
  marketInfluence: { type: Object, default: {} },
  totalTaxCollected: { type: Number, default: 0 },
  lastTradeTax: { type: Number, default: 0 },
  rankings: { type: Array, default: [] }
});

const AdminLogSchema = new mongoose.Schema({
  timestamp: { type: Number, default: Date.now },
  adminEmail: String,
  action: String,
  details: Object
});

const User = mongoose.model("User", UserSchema);
const Order = mongoose.model("Order", OrderSchema);
const IPO = mongoose.model("IPO", IPOSchema);
const NewsEvent = mongoose.model("NewsEvent", NewsEventSchema);
const SystemState = mongoose.model("SystemState", SystemStateSchema);
const AdminLog = mongoose.model("AdminLog", AdminLogSchema);

// In-memory runtime cache for microsecond execution
let currentMarketStatus = "CLOSED";
let cachedLivePrices = {};
let cachedInfluences = {};
let cachedPriceHistory = {};
let totalTaxCollected = 0;
let lastTradeTax = 0;
let cachedRankings = [];
let tickCount = 0;
let forceBasePriceReset = false;

// Connect to MongoDB
mongoose.connect(MONGO_URI).then(async () => {
  console.log(" Connected to MongoDB Atlas");
  const sys = await SystemState.findOneAndUpdate(
    { key: "main" },
    {},
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  currentMarketStatus = sys.marketStatus || "CLOSED";
  cachedLivePrices = sys.livePrices || {};
  cachedPriceHistory = sys.priceHistory || {};
  cachedInfluences = sys.marketInfluence || {};
  totalTaxCollected = sys.totalTaxCollected || 0;
  cachedRankings = sys.rankings || [];

  // Default Admin Check
  const admin = await User.findOne({ role: "admin" });
  if (!admin) {
    const hashed = await bcrypt.hash("admin@123", 10);
    await User.create({
      uid: "admin_master",
      email: "admin@bazaar.com",
      password: hashed,
      name: "Master Admin",
      role: "admin"
    });
    console.log(" Default Admin generated: admin@bazaar.com / admin@123");
  }

  startSimulationEngines();
}).catch(err => {
  console.error("❌ MongoDB connection error:", err.message);
});

// --- SIMULATION ENGINES ---
function startSimulationEngines() {
  // 1. AUTO-IPO ENGINE (2s tick)
  setInterval(async () => {
    try {
      const now = Date.now();
      const ipos = await IPO.find({ status: { $in: ["upcoming", "open", "closed", "allotted"] } });

      for (const ipo of ipos) {
        // Auto-open
        if (ipo.status === "upcoming" && ipo.openTime && now >= ipo.openTime) {
          ipo.status = "open";
          await ipo.save();
          const evtId = "news_" + Date.now();
          await NewsEvent.create({
            eventId: evtId,
            headline: ` New IPO Open: ${ipo.ticker} (${ipo.name || ipo.ticker}) is now OPEN for bidding at ${ipo.price}!`,
            status: "active",
            startTime: now,
            createdAt: now,
            durationMinutes: 60,
            targetTickers: [ipo.ticker],
            impactDirection: "positive"
          });
          io.emit("newsUpdate", { type: "new", ipo: ipo.ticker });
        }

        // Live subscription rates
        if (["upcoming", "open", "closed"].includes(ipo.status)) {
          let liveLots = 0;
          let liveShares = 0;
          const lotSize = Number(ipo.lotSize) || 1;
          ipo.subscriptions.forEach(s => {
            const rl = Number(s.requestedLots) || Math.max(1, Math.floor((Number(s.requestedShares) || 1) / lotSize));
            liveLots += rl;
            liveShares += (rl * lotSize);
          });
          const totalOffered = Number(ipo.totalLots) || 1;
          const liveRate = Number((liveLots / totalOffered).toFixed(2));
          const liveCount = ipo.subscriptions.length;

          if (ipo.totalSubscribedLots !== liveLots || ipo.subscriptionRate !== liveRate || ipo.subscriptionCount !== liveCount) {
            ipo.totalSubscribedLots = liveLots;
            ipo.totalSubscribedShares = liveShares;
            ipo.subscriptionCount = liveCount;
            ipo.subscriptionRate = liveRate;
            await ipo.save();
          }
        }

        // Lottery Allotment Trigger
        const shouldAllot = ipo.triggerAllotment || 
          ((ipo.status === "open" || ipo.status === "closed") && ipo.closeTime && now >= ipo.closeTime);

        if (shouldAllot && ipo.status !== "allotted" && ipo.status !== "listed") {
          const availableLots = Number(ipo.totalLots) || 1;
          const lotSize = Number(ipo.lotSize) || 1;
          const pricePerShare = Number(ipo.price) || 0;

          if (ipo.subscriptions.length === 0) {
            ipo.status = "allotted";
            ipo.triggerAllotment = false;
            ipo.totalSubscribedLots = 0;
            ipo.subscriptionRate = 0;
            await ipo.save();
            continue;
          }

          let totalReqLots = 0;
          const applicants = ipo.subscriptions.map((sub, index) => {
            const reqLots = Number(sub.requestedLots) || Math.max(1, Math.floor((Number(sub.requestedShares) || 1) / lotSize));
            totalReqLots += reqLots;
            return {
              subIndex: index,
              uid: sub.uid,
              requestedLots: reqLots,
              investedAmount: Number(sub.investedAmount) || (reqLots * lotSize * pricePerShare)
            };
          });

          const subRate = Number((totalReqLots / availableLots).toFixed(2));
          let lotteryPool = [];
          applicants.forEach(app => {
            for (let i = 0; i < app.requestedLots; i++) {
              lotteryPool.push({ subIndex: app.subIndex, uid: app.uid });
            }
          });

          // Multi-pass cryptographic shuffle
          for (let pass = 0; pass < 3; pass++) {
            for (let i = lotteryPool.length - 1; i > 0; i--) {
              const j = crypto.randomInt(0, i + 1);
              [lotteryPool[i], lotteryPool[j]] = [lotteryPool[j], lotteryPool[i]];
            }
          }

          let lotsToAward;
          if (totalReqLots > availableLots) {
            lotsToAward = availableLots;
          } else {
            const randomRatio = 0.40 + (crypto.randomInt(0, 50) / 100);
            lotsToAward = Math.max(1, Math.min(totalReqLots, Math.round(totalReqLots * randomRatio)));
          }

          const winningTickets = lotteryPool.slice(0, lotsToAward);
          const winCounts = {};
          winningTickets.forEach(ticket => {
            winCounts[ticket.subIndex] = (winCounts[ticket.subIndex] || 0) + 1;
          });

          for (let i = 0; i < ipo.subscriptions.length; i++) {
            const sub = ipo.subscriptions[i];
            const wonLots = winCounts[i] || 0;
            const allocatedShares = wonLots * lotSize;
            const costBlocked = sub.investedAmount;
            const costUsed = allocatedShares * pricePerShare;
            const refundAmount = Math.max(0, costBlocked - costUsed);

            sub.allocatedLots = wonLots;
            sub.allocatedShares = allocatedShares;
            sub.status = wonLots > 0 ? "won" : "lost";
            sub.refundedAmount = refundAmount;
            sub.allotmentTimestamp = now;

            const u = await User.findOne({ uid: sub.uid });
            if (u) {
              if (refundAmount > 0) u.cashBalance += refundAmount;
              if (allocatedShares > 0) {
                const existing = u.holdings.find(h => h.ticker === ipo.ticker && h.positionType === "long");
                if (existing) {
                  existing.quantity += allocatedShares;
                } else {
                  u.holdings.push({ ticker: ipo.ticker, positionType: "long", quantity: allocatedShares, avgPrice: pricePerShare });
                }
              }
              await u.save();
              io.emit(`userUpdate:${sub.uid}`, { cashBalance: u.cashBalance, holdings: u.holdings });
            }
          }

          ipo.status = "allotted";
          ipo.triggerAllotment = false;
          ipo.totalSubscribedLots = totalReqLots;
          ipo.subscriptionRate = subRate;
          ipo.allotmentCompletedAt = now;
          await ipo.save();

          await NewsEvent.create({
            eventId: "news_" + Date.now(),
            headline: ` IPO Allotment Out: ${ipo.ticker} (${ipo.name || ipo.ticker}) was subscribed ${subRate}x! Lottery draw complete—shares & refunds credited.`,
            status: "active",
            startTime: now,
            createdAt: now,
            durationMinutes: 60,
            targetTickers: [ipo.ticker],
            impactDirection: "positive"
          });
          io.emit("newsUpdate", { type: "allotted", ipo: ipo.ticker });
        }

        // Listing Trigger
        if ((ipo.status === "allotted" && ipo.listTime && now >= ipo.listTime) || ipo.triggerListing) {
          const listingPrice = Number(ipo.price) * (1 + ((Number(ipo.listingPremiumPct) || 0) / 100));
          ipo.status = "listed";
          ipo.triggerListing = false;
          await ipo.save();

          cachedLivePrices[ipo.ticker] = {
            ticker: ipo.ticker,
            name: ipo.name || ipo.ticker,
            sector: ipo.sector || "IPO",
            price: Number(listingPrice.toFixed(2)),
            basePrice: Number(listingPrice.toFixed(2)),
            volatility: 0.008,
            isIPO: true,
            timestamp: now
          };

          await NewsEvent.create({
            eventId: "news_" + Date.now(),
            headline: ` IPO Listed: ${ipo.ticker} (${ipo.name || ipo.ticker}) listed at ${listingPrice.toFixed(2)} and is now LIVE for trading!`,
            status: "active",
            startTime: now,
            createdAt: now,
            durationMinutes: 60,
            targetTickers: [ipo.ticker],
            impactDirection: "positive"
          });
          io.emit("newsUpdate", { type: "listed", ipo: ipo.ticker });
        }
      }
    } catch (e) {
      console.error("Auto-IPO Engine Error:", e.message);
    }
  }, 2000);

  // 2. LEADERBOARD ENGINE (3s tick)
  setInterval(async () => {
    try {
      const users = await User.find({ role: "student" }).lean();
      const leaderboard = [];

      for (const user of users) {
        let longValue = 0, shortLiability = 0;
        (user.holdings || []).forEach(holding => {
          const currentPrice = cachedLivePrices[holding.ticker]?.price || holding.avgPrice;
          if (holding.positionType === "long") longValue += holding.quantity * currentPrice;
          else if (holding.positionType === "short") shortLiability += holding.quantity * currentPrice;
        });
        const startingCapital = Number(user.startingBalance) || 1000000;
        const totalValue = (Number(user.cashBalance) || 0) + longValue - shortLiability;
        const retPct = Number((((totalValue - startingCapital) / startingCapital) * 100).toFixed(2));
        const pnlAmount = Number((totalValue - startingCapital).toFixed(2));

        leaderboard.push({
          uid: user.uid,
          displayName: user.name || (user.email ? user.email.split("@")[0] : "Trader"),
          portfolioValue: Number(totalValue.toFixed(2)),
          returnPct: retPct,
          pnl: retPct,
          pnlAmount: pnlAmount
        });
      }

      leaderboard.sort((a, b) => b.portfolioValue - a.portfolioValue);
      cachedRankings = leaderboard.map((entry, index) => ({ ...entry, rank: index + 1 }));
      io.emit("leaderboard", cachedRankings);
    } catch (e) {}
  }, 3000);

  // 3. ULTRA-FAST MARKET SIMULATION ENGINE (500ms tick)
  let lastBasePriceReset = Date.now();
  const TICK_INTERVAL_MS = 500;

  setInterval(async () => {
    try {
      if (currentMarketStatus !== "OPEN") return;
      tickCount++;
      const now = Date.now();
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

      for (const ticker of Object.keys(cachedLivePrices)) {
        const stockData = cachedLivePrices[ticker];
        let engineBase = stockData.engineBasePrice || stockData.basePrice || stockData.price;

        if (shouldResetBase) {
          engineBase = stockData.price;
        }

        let eventBias = 0, currentTargetMultiplier = 1;
        for (const [eventId, inf] of Object.entries(cachedInfluences)) {
          if (inf.status === "active" && inf.impacts && inf.impacts[ticker] !== undefined) {
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

        cachedLivePrices[ticker] = {
          ...stockData,
          engineBasePrice: engineBase,
          price: Number(newPrice.toFixed(2)),
          high: Number(currHigh.toFixed(2)),
          low: Number(currLow.toFixed(2)),
          timestamp: now
        };

        if (!cachedPriceHistory[ticker]) cachedPriceHistory[ticker] = {};
        if (tickCount % 6 === 0) cachedPriceHistory[ticker][now] = Number(newPrice.toFixed(2));
      }

      for (const eventId of finishedEvents) {
        delete cachedInfluences[eventId];
        await NewsEvent.updateOne({ eventId }, { status: "completed" });
      }

      // Live broadcast to all connected web clients
      io.emit("livePrices", { prices: cachedLivePrices, marketStatus: currentMarketStatus });
    } catch (e) {}
  }, TICK_INTERVAL_MS);

  // Background Database Sync (Every 10 seconds)
  setInterval(async () => {
    try {
      await SystemState.updateOne(
        { key: "main" },
        {
          marketStatus: currentMarketStatus,
          livePrices: cachedLivePrices,
          priceHistory: cachedPriceHistory,
          marketInfluence: cachedInfluences,
          totalTaxCollected,
          lastTradeTax,
          rankings: cachedRankings
        }
      );
    } catch (e) {}
  }, 10000);
}

// --- AUTH & CONTEXT MIDDLEWARE ---
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: { message: "Unauthenticated" } });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findOne({ uid: decoded.uid }).lean();
    if (!req.user) return res.status(401).json({ error: { message: "User not found" } });
    next();
  } catch (err) {
    res.status(401).json({ error: { message: "Invalid session token" } });
  }
};

const verifyAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: { message: "Administrator privileges required" } });
  }
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

// --- AUTH REST ENDPOINTS ---
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body.data || req.body;
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ error: { message: "Invalid email address or password." } });
  }
  const token = jwt.sign({ uid: user.uid, role: user.role }, JWT_SECRET, { expiresIn: "30d" });
  res.json({
    data: {
      token,
      user: {
        uid: user.uid,
        email: user.email,
        name: user.name,
        role: user.role,
        cashBalance: user.cashBalance,
        startingBalance: user.startingBalance,
        isFrozen: user.isFrozen
      }
    }
  });
});

app.post('/api/register', handleCallable(async (data) => {
  const { email, password, name } = data;
  const existing = await User.findOne({ email });
  if (existing) throw new Error("Email already in use");
  const hashed = await bcrypt.hash(password, 10);
  const uid = "user_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
  await User.create({
    uid, email, password: hashed, name,
    role: "student", startingBalance: 1000000, cashBalance: 1000000
  });
  return { success: true };
}));

app.post('/api/resetPassword', handleCallable(async (data) => {
  return { success: true, message: "Password reset instructions sent" };
}));

app.post('/api/updatePassword', authMiddleware, handleCallable(async (data, context) => {
  const hashed = await bcrypt.hash(data.newPassword, 10);
  await User.updateOne({ uid: context.auth.uid }, { password: hashed });
  return { success: true };
}));

app.post('/api/updateUserProfile', authMiddleware, handleCallable(async (data, context) => {
  await User.updateOne({ uid: context.auth.uid }, { $set: data.updates });
  return { success: true };
}));

app.get("/api/me", authMiddleware, async (req, res) => {
  const u = await User.findOne({ uid: req.user.uid }).lean();
  res.json({ data: u });
});

app.get('/api/users/:uid', authMiddleware, async (req, res) => {
  const u = await User.findOne({ uid: req.params.uid }).lean();
  if (!u) return res.status(404).json({ error: { message: "User not found" } });
  res.json({ data: u });
});

// --- CLIENT STATE ENDPOINTS ---
app.get("/api/state", (req, res) => {
  res.json({
    data: {
      marketStatus: currentMarketStatus,
      livePrices: cachedLivePrices,
      priceHistory: cachedPriceHistory,
      leaderboard: cachedRankings
    }
  });
});

app.get("/api/leaderboard", (req, res) => {
  res.json({ data: { rankings: cachedRankings } });
});

app.get("/api/history/:ticker", authMiddleware, (req, res) => {
  const ticker = req.params.ticker;
  res.json({ data: cachedPriceHistory[ticker] || {} });
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
  const user = await User.findOne({ uid: req.user.uid }).lean();
  res.json({ data: { wishlists: user.wishlists || [] } });
});

app.post("/api/wishlists/sync", authMiddleware, handleCallable(async (data, context) => {
  if (!context.auth) throw new Error("User not logged in");
  await User.updateOne({ uid: context.auth.uid }, { wishlists: data.wishlists });
  return { success: true };
}));

// --- ADMIN READ ENDPOINTS ---
app.get('/api/admin/users', authMiddleware, verifyAdmin, async (req, res) => {
  const users = await User.find().lean();
  res.json({ data: users });
});

app.get('/api/admin/orders', authMiddleware, verifyAdmin, async (req, res) => {
  const orders = await Order.find().sort({ timestamp: -1 }).limit(50).lean();
  res.json({ data: orders });
});

app.get("/api/adminLogs", authMiddleware, verifyAdmin, async (req, res) => {
  const logs = await AdminLog.find().sort({ timestamp: -1 }).limit(100).lean();
  res.json({ data: logs });
});

// --- CORE TRADING ENGINE ---
app.post('/api/executeTrade', authMiddleware, handleCallable(async (data, context) => {
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
  if (user.isFrozen) throw new Error("Account is frozen");

  let cashBalance = user.cashBalance;
  let longData = user.holdings.find(h => h.ticker === ticker && h.positionType === "long") || { ticker, positionType: "long", quantity: 0, avgPrice: 0 };
  let shortData = user.holdings.find(h => h.ticker === ticker && h.positionType === "short") || { ticker, positionType: "short", quantity: 0, avgPrice: 0 };

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
      const existingIdx = user.holdings.findIndex(h => h.ticker === ticker && h.positionType === "long");
      const newQty = longData.quantity + qty;
      const newAvg = ((longData.quantity * longData.avgPrice) + grossCost) / newQty;
      if (existingIdx >= 0) {
        user.holdings[existingIdx].quantity = newQty;
        user.holdings[existingIdx].avgPrice = newAvg;
      } else {
        user.holdings.push({ ticker, positionType: "long", quantity: newQty, avgPrice: newAvg });
      }
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
      if (longData.quantity - qty === 0) {
        user.holdings = user.holdings.filter(h => !(h.ticker === ticker && h.positionType === "long"));
      } else {
        const existing = user.holdings.find(h => h.ticker === ticker && h.positionType === "long");
        existing.quantity -= qty;
      }
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
      const existingIdx = user.holdings.findIndex(h => h.ticker === ticker && h.positionType === "short");
      const newQty = shortData.quantity + qty;
      const newAvg = ((shortData.quantity * shortData.avgPrice) + marginRequired) / newQty;
      if (existingIdx >= 0) {
        user.holdings[existingIdx].quantity = newQty;
        user.holdings[existingIdx].avgPrice = newAvg;
      } else {
        user.holdings.push({ ticker, positionType: "short", quantity: newQty, avgPrice: newAvg });
      }
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
        if (shortData.quantity - qty === 0) {
          user.holdings = user.holdings.filter(h => !(h.ticker === ticker && h.positionType === "short"));
        } else {
          const existing = user.holdings.find(h => h.ticker === ticker && h.positionType === "short");
          existing.quantity -= qty;
        }
        orderStatus = "completed";
      }
    }
  }

  const latencyMs = 1;

  if (orderStatus === "completed") {
    totalTaxCollected += taxDeducted;
    lastTradeTax = taxDeducted;
    user.cashBalance = cashBalance;
    await user.save();
    io.emit(`userUpdate:${uid}`, { cashBalance: user.cashBalance, holdings: user.holdings });
  }

  const orderDoc = await Order.create({
    orderId: "ord_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    uid,
    ticker,
    side: action,
    quantity: qty,
    priceAtExecution: execPrice,
    timestamp: Date.now(),
    status: orderStatus,
    reason: rejectReason,
    executionLatencyMs: latencyMs,
    realizedPnL,
    pnlPct,
    taxDeducted
  });

  return {
    status: orderStatus,
    reason: rejectReason,
    executionPrice: execPrice,
    latencyMs,
    realizedPnL,
    pnlPct,
    taxDeducted
  };
}));

// --- IPO BIDDING & ALLOTMENT ---
app.post('/api/subscribeIPO', authMiddleware, handleCallable(async (data, context) => {
  if (!context.auth) throw new Error("User not logged in");
  const uid = context.auth.uid;
  const qty = parseInt(data.requestedShares, 10);
  if (isNaN(qty) || qty <= 0) throw new Error("Quantity must be positive");

  const ipo = await IPO.findOne({ ipoId: data.ipoId });
  if (!ipo) throw new Error("IPO not found");
  if (ipo.status !== "open") throw new Error(`IPO is currently ${ipo.status}. Bids are only accepted while open.`);

  const cost = qty * Number(ipo.price);
  const user = await User.findOne({ uid });
  if (user.cashBalance < cost) throw new Error("Insufficient cash");

  const lotsToAdd = parseInt(data.requestedLots, 10) || Math.max(1, Math.floor(qty / (Number(ipo.lotSize) || 1)));
  user.cashBalance -= cost;
  await user.save();

  const existingSub = ipo.subscriptions.find(s => s.uid === uid);
  if (existingSub) {
    existingSub.requestedShares += qty;
    existingSub.requestedLots = (existingSub.requestedLots || 0) + lotsToAdd;
    existingSub.investedAmount = (existingSub.investedAmount || 0) + cost;
    existingSub.timestamp = Date.now();
  } else {
    ipo.subscriptions.push({
      subId: "sub_" + Date.now(),
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

  const currentSubLots = Number(ipo.totalSubscribedLots) || 0;
  const currentSubShares = Number(ipo.totalSubscribedShares) || 0;
  const currentSubCount = Number(ipo.subscriptionCount) || 0;

  ipo.totalSubscribedLots = currentSubLots + lotsToAdd;
  ipo.totalSubscribedShares = currentSubShares + qty;
  ipo.subscriptionCount = existingSub ? currentSubCount : (currentSubCount + 1);
  ipo.subscriptionRate = Number((ipo.totalSubscribedLots / (Number(ipo.totalLots) || 1)).toFixed(2));
  await ipo.save();

  io.emit(`userUpdate:${uid}`, { cashBalance: user.cashBalance });
  return {
    success: true,
    totalSubscribedLots: ipo.totalSubscribedLots,
    subscriptionRate: ipo.subscriptionRate
  };
}));

app.post('/api/processAllotment', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  await IPO.updateOne({ ipoId: data.ipoId }, { triggerAllotment: true });
  return { success: true };
}));

app.post('/api/listIPO', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  await IPO.updateOne({ ipoId: data.ipoId }, { triggerListing: true });
  return { success: true };
}));

// --- ADMIN SYSTEM & MATRIX CONTROLLERS ---
app.post('/api/adminAdjustCash', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  await User.updateOne({ uid: data.uid }, { cashBalance: data.amount });
  io.emit(`userUpdate:${data.uid}`, { cashBalance: data.amount });
  return { success: true };
}));

app.post('/api/adminSendPasswordResets', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  return { success: true };
}));

app.post('/api/adminCreateIPO', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  await IPO.create({
    ipoId: "ipo_" + Date.now(),
    name: data.name,
    ticker: data.ticker,
    price: data.price,
    lotSize: data.lotSize,
    totalLots: data.totalLots,
    listingPremiumPct: data.listingPremiumPct,
    status: "upcoming",
    openTime: data.openTime,
    closeTime: data.closeTime,
    listTime: data.listTime
  });
  return { success: true };
}));

app.post('/api/adminCloseIPO', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  await IPO.updateOne({ ipoId: data.ipoId }, { status: "closed" });
  return { success: true };
}));

app.post('/api/adminUpdateIPOGMP', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const newGmp = Number(data.listingPremiumPct) || 0;
  await IPO.updateOne({ ipoId: data.ipoId }, { listingPremiumPct: newGmp });
  return { success: true, listingPremiumPct: newGmp };
}));

app.post('/api/adminSetMarketStatus', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  currentMarketStatus = typeof data === "string" ? data.trim().toUpperCase() : data.status;
  io.emit("livePrices", { prices: cachedLivePrices, marketStatus: currentMarketStatus });
  return { success: true };
}));

app.post('/api/adminForceStockPrice', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  if (cachedLivePrices[data.ticker]) {
    cachedLivePrices[data.ticker].price = Number(data.price);
    cachedLivePrices[data.ticker].timestamp = Date.now();
  }
  return { success: true };
}));

app.post('/api/adminToggleUserFreeze', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  await User.updateOne({ uid: data.uid }, { isFrozen: data.isFrozen });
  io.emit(`userUpdate:${data.uid}`, { isFrozen: data.isFrozen });
  return { success: true };
}));

app.post('/api/adminImportStocks', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  data.stocks.forEach(s => {
    cachedLivePrices[s.ticker] = {
      name: s.name || s.ticker,
      sector: s.sector || "General",
      price: Number(s.basePrice),
      basePrice: Number(s.basePrice),
      volatility: Number(s.volatility || 0.005),
      isIPO: false,
      timestamp: Date.now()
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
        email: u.email,
        password: hashed,
        name: u.name,
        role: "student",
        startingBalance: Number(u.startingBalance || 1000000),
        cashBalance: Number(u.startingBalance || 1000000),
        isFrozen: false,
        holdings: [],
        wishlists: []
      });
    }
  }
  return { success: true };
}));

app.post('/api/adminImportNews', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const events = data.events || [];
  for (const ev of events) {
    const evtId = "news_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
    await NewsEvent.create({
      eventId: evtId,
      headline: ev.headline,
      stockImpacts: ev.stockImpacts || {},
      durationMinutes: Number(ev.durationMinutes) || 15,
      status: "draft",
      startTime: 0,
      createdAt: Date.now()
    });
  }
  return { success: true, count: events.length };
}));

app.post('/api/adminReleaseNewsEvent', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const now = Date.now();
  await NewsEvent.updateOne(
    { eventId: data.eventId },
    { status: "active", startTime: now, firedAt: now, durationMinutes: data.durationMinutes || 15 }
  );
  cachedInfluences[data.eventId] = {
    id: data.eventId,
    headline: data.adminData?.headline || "Breaking Market News",
    impacts: data.adminData?.stockImpacts || {},
    durationMinutes: data.durationMinutes || 15,
    startTime: now,
    status: "active"
  };
  forceBasePriceReset = true;
  io.emit("newsUpdate", { type: "breaking", headline: data.adminData?.headline });
  return { success: true };
}));

app.post('/api/adminPauseNews', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  await NewsEvent.updateOne({ eventId: data.eventId }, { status: "paused" });
  if (cachedInfluences[data.eventId]) cachedInfluences[data.eventId].status = "paused";
  return { success: true };
}));

app.post('/api/adminCancelNewsEvent', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  await NewsEvent.updateOne({ eventId: data.eventId }, { status: "cancelled" });
  delete cachedInfluences[data.eventId];
  return { success: true };
}));

app.post('/api/adminCreateNewsEvent', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  if (!data.headline) throw new Error("Headline is required.");
  const evtId = "news_" + Date.now();
  await NewsEvent.create({
    eventId: evtId,
    headline: data.headline,
    stockImpacts: data.stockImpacts || {},
    durationMinutes: Number(data.durationMinutes) || 15,
    status: "draft",
    startTime: 0,
    createdAt: Date.now()
  });
  return { success: true, eventId: evtId };
}));

app.post('/api/adminDeleteSingleNews', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  if (!data.eventId) throw new Error("eventId is required.");
  await NewsEvent.deleteOne({ eventId: data.eventId });
  delete cachedInfluences[data.eventId];
  forceBasePriceReset = true;
  return { success: true };
}));

app.post('/api/adminTriggerNextNews', authMiddleware, verifyAdmin, handleCallable(async () => {
  const event = await NewsEvent.findOne({ status: "draft" }).sort({ createdAt: 1 });
  if (!event) throw new Error("No draft news events in queue to trigger.");

  const now = Date.now();
  const duration = event.durationMinutes || 15;
  event.status = "active";
  event.startTime = now;
  event.firedAt = now;
  await event.save();

  cachedInfluences[event.eventId] = {
    id: event.eventId,
    headline: event.headline || "Breaking Market News",
    impacts: event.stockImpacts || {},
    durationMinutes: duration,
    startTime: now,
    status: "active"
  };
  forceBasePriceReset = true;
  io.emit("newsUpdate", { type: "breaking", headline: event.headline });
  return { success: true, eventId: event.eventId, headline: event.headline };
}));

app.post('/api/adminTriggerAllNews', authMiddleware, verifyAdmin, handleCallable(async () => {
  const drafts = await NewsEvent.find({ status: "draft" });
  if (drafts.length === 0) throw new Error("No draft news events in queue to trigger.");

  const now = Date.now();
  for (const event of drafts) {
    const duration = event.durationMinutes || 15;
    event.status = "active";
    event.startTime = now;
    event.firedAt = now;
    await event.save();

    cachedInfluences[event.eventId] = {
      id: event.eventId,
      headline: event.headline || "Breaking Market News",
      impacts: event.stockImpacts || {},
      durationMinutes: duration,
      startTime: now,
      status: "active"
    };
  }
  forceBasePriceReset = true;
  io.emit("newsUpdate", { type: "bulk_breaking", count: drafts.length });
  return { success: true, count: drafts.length };
}));

app.post('/api/adminDeleteAllNews', authMiddleware, verifyAdmin, handleCallable(async () => {
  const count = await NewsEvent.countDocuments();
  await NewsEvent.deleteMany({});
  cachedInfluences = {};
  forceBasePriceReset = true;
  return { success: true, deletedCount: count };
}));

app.post('/api/adminResetSystem', authMiddleware, verifyAdmin, handleCallable(async () => {
  await Order.deleteMany({});
  await IPO.deleteMany({});
  await NewsEvent.deleteMany({});
  await User.deleteMany({ role: "student" });
  cachedLivePrices = {};
  cachedPriceHistory = {};
  cachedInfluences = {};
  totalTaxCollected = 0;
  lastTradeTax = 0;
  cachedRankings = [];
  currentMarketStatus = "CLOSED";
  return { success: true };
}));

// System Audit Logger helper
app.post('/api/logAdminAction', authMiddleware, verifyAdmin, async (req, res) => {
  const { action, details } = req.body.data || req.body;
  await AdminLog.create({
    timestamp: Date.now(),
    adminEmail: req.user.email,
    action,
    details
  });
  res.json({ data: { success: true } });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(` MarketSim Native MongoDB + Socket.io Server running on port ${PORT}`);
});