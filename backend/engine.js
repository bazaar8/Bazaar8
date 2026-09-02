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
  wishlists: [{
    id: Number,
    name: String,
    tickers: [String]
  }],
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
  name: String,
  ticker: String,
  price: Number,
  lotSize: Number,
  totalLots: Number,
  listingPremiumPct: Number,
  sector: { type: String, default: "Upcoming" },
  allotmentType: { type: String, default: "lottery" },
  status: { type: String, default: "upcoming", index: true },
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
  eventId: { type: String, unique: true, index: true },
  headline: String,
  stockImpacts: { type: Object, default: {} },
  durationMinutes: { type: Number, default: 15 },
  status: { type: String, default: "draft", index: true },
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
  marketInfluence: { type: Object, default: {} },
  totalTaxCollected: { type: Number, default: 0 },
  lastTradeTax: { type: Number, default: 0 }
});

const AdminLogSchema = new mongoose.Schema({
  timestamp: { type: Number, default: Date.now, index: -1 },
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

// In-memory runtime state
let currentMarketStatus = "CLOSED";
let cachedLivePrices = {};
let cachedInfluences = {};
let cachedPriceHistory = {}; // Bounded to 60 data points per ticker
let totalTaxCollected = 0;
let lastTradeTax = 0;
let cachedRankings = [];
let tickCount = 0;
let forceBasePriceReset = false;

// Connect to MongoDB
mongoose.connect(MONGO_URI, {
  maxPoolSize: 20,
  serverSelectionTimeoutMS: 5000
}).then(async () => {
  console.log(" Connected to MongoDB Atlas");
  const sys = await SystemState.findOneAndUpdate(
    { key: "main" },
    {},
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  currentMarketStatus = sys.marketStatus || "CLOSED";
  cachedLivePrices = sys.livePrices || {};
  cachedInfluences = sys.marketInfluence || {};
  totalTaxCollected = sys.totalTaxCollected || 0;

  // Ensure Master Admin exists
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

// Pre-seed 30 historical minutes so charts have 30+ candles immediately
function seedHistoricalCandles() {
  const now = Date.now();
  Object.keys(cachedLivePrices).forEach(ticker => {
    if (!cachedPriceHistory[ticker] || Object.keys(cachedPriceHistory[ticker]).length < 10) {
      cachedPriceHistory[ticker] = {};
      const base = cachedLivePrices[ticker].basePrice || cachedLivePrices[ticker].price || 1000;
      let p = base;
      for (let i = 30; i >= 1; i--) {
        const timeKey = now - (i * 60 * 1000); // 1-minute historical increments
        p = p * (1 + (Math.random() - 0.5) * 0.008);
        cachedPriceHistory[ticker][timeKey] = Number(p.toFixed(2));
      }
    }
  });
}

// --- SIMULATION ENGINES ---
function startSimulationEngines() {
  // 1. AUTO-IPO ENGINE (Every 3 seconds)
  setInterval(async () => {
    try {
      const now = Date.now();
      const ipos = await IPO.find({ status: { $in: ["upcoming", "open", "closed", "allotted"] } });

      for (const ipo of ipos) {
        if (ipo.status === "upcoming" && ipo.openTime && now >= ipo.openTime) {
          ipo.status = "open";
          await ipo.save();
          const evtId = "news_" + Date.now();
          await NewsEvent.create({
            eventId: evtId,
            headline: ` New IPO Open: ${ipo.ticker} (${ipo.name || ipo.ticker}) is now OPEN for bidding at ₹${ipo.price}!`,
            status: "active",
            startTime: now,
            createdAt: now,
            durationMinutes: 60,
            targetTickers: [ipo.ticker],
            impactDirection: "positive"
          });
          io.emit("newsUpdate", { type: "new", ipo: ipo.ticker });
        }

        // Trigger Allotment
        const shouldAllot = ipo.triggerAllotment || 
          ((ipo.status === "open" || ipo.status === "closed") && ipo.closeTime && now >= ipo.closeTime);

        if (shouldAllot && ipo.status !== "allotted" && ipo.status !== "listed") {
          const availableLots = Number(ipo.totalLots) || 1;
          const lotSize = Number(ipo.lotSize) || 1;
          const pricePerShare = Number(ipo.price) || 0;

          if (ipo.subscriptions.length === 0) {
            ipo.status = "allotted";
            ipo.triggerAllotment = false;
            await ipo.save();
            continue;
          }

          let lotteryPool = [];
          ipo.subscriptions.forEach((sub, index) => {
            const reqLots = Number(sub.requestedLots) || Math.max(1, Math.floor((Number(sub.requestedShares) || 1) / lotSize));
            for (let i = 0; i < reqLots; i++) {
              lotteryPool.push({ subIndex: index, uid: sub.uid });
            }
          });

          // Cryptographic Lottery Shuffle
          for (let i = lotteryPool.length - 1; i > 0; i--) {
            const j = crypto.randomInt(0, i + 1);
            [lotteryPool[i], lotteryPool[j]] = [lotteryPool[j], lotteryPool[i]];
          }

          const lotsToAward = Math.min(lotteryPool.length, availableLots);
          const winCounts = {};
          lotteryPool.slice(0, lotsToAward).forEach(ticket => {
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

            if (refundAmount > 0 || allocatedShares > 0) {
              const u = await User.findOne({ uid: sub.uid });
              if (u) {
                if (refundAmount > 0) u.cashBalance += refundAmount;
                if (allocatedShares > 0) {
                  const existing = u.holdings.find(h => h.ticker === ipo.ticker && h.positionType === "long");
                  if (existing) existing.quantity += allocatedShares;
                  else u.holdings.push({ ticker: ipo.ticker, positionType: "long", quantity: allocatedShares, avgPrice: pricePerShare });
                }
                await u.save();
                io.emit(`userUpdate:${sub.uid}`, { cashBalance: u.cashBalance, holdings: u.holdings });
              }
            }
          }

          ipo.status = "allotted";
          ipo.triggerAllotment = false;
          ipo.allotmentCompletedAt = now;
          await ipo.save();
          io.emit("newsUpdate", { type: "allotted", ipo: ipo.ticker });
        }

        // Trigger Listing
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

          io.emit("newsUpdate", { type: "listed", ipo: ipo.ticker });
          io.emit("livePrices", { prices: cachedLivePrices, marketStatus: currentMarketStatus });
        }
      }
    } catch (e) {
      console.error("Auto-IPO Engine Error:", e.message);
    }
  }, 3000);

  // 2. LEADERBOARD ENGINE (Every 6 seconds - True Net Worth)
  setInterval(async () => {
    try {
      const users = await User.find({ role: "student" }, "uid name email cashBalance startingBalance holdings").lean();
      const activeIpos = await IPO.find({ status: { $in: ["upcoming", "open", "closed"] } }).lean();
      const leaderboard = [];

      for (const user of users) {
        let longValue = 0;
        let shortPnL = 0;
        let blockedIpoFunds = 0;

        // Long asset valuation & Short unrealized P&L
        (user.holdings || []).forEach(holding => {
          const currentPrice = cachedLivePrices[holding.ticker]?.price || holding.avgPrice;
          if (holding.positionType === "long") {
            longValue += holding.quantity * currentPrice;
          } else if (holding.positionType === "short") {
            shortPnL += (holding.avgPrice - currentPrice) * holding.quantity;
          }
        });

        // Blocked IPO funds preservation
        activeIpos.forEach(ipo => {
          const mySub = (ipo.subscriptions || []).find(s => s.uid === user.uid);
          if (mySub && !['won', 'lost', 'success', 'refunded'].includes(mySub.status)) {
            const price = Number(ipo.price) || 0;
            const lotSize = Number(ipo.lotSize) || 1;
            const reqLots = Number(mySub.requestedLots) || Math.max(1, Math.floor((Number(mySub.requestedShares) || 1) / lotSize));
            blockedIpoFunds += (reqLots * lotSize * price);
          }
        });

        const startingCapital = Number(user.startingBalance) || 1000000;
        const totalValue = (Number(user.cashBalance) || 0) + longValue + shortPnL + blockedIpoFunds;
        const retPct = Number((((totalValue - startingCapital) / startingCapital) * 100).toFixed(2));

        leaderboard.push({
          uid: user.uid,
          displayName: user.name || (user.email ? user.email.split("@")[0] : "Trader"),
          portfolioValue: Number(totalValue.toFixed(2)),
          returnPct: retPct,
          pnl: retPct,
          pnlAmount: Number((totalValue - startingCapital).toFixed(2))
        });
      }

      leaderboard.sort((a, b) => b.portfolioValue - a.portfolioValue);
      cachedRankings = leaderboard.map((entry, index) => ({ ...entry, rank: index + 1 }));
      io.emit("leaderboard", cachedRankings);
    } catch (e) {
      console.error("Leaderboard calculation error:", e.message);
    }
  }, 6000);

  // 3. ULTRA-FAST MARKET SIMULATION & NEWS ENGINE (500ms tick)
  let lastBasePriceReset = Date.now();
  const TICK_INTERVAL_MS = 500;

  setInterval(async () => {
    try {
      if (currentMarketStatus !== "OPEN") return;
      tickCount++;
      const now = Date.now();
      const finishedEvents = new Set();

      // Top-level news expiration (Evaluates macro and ticker-specific news equally)
      for (const [eventId, inf] of Object.entries(cachedInfluences)) {
        if (inf.status === "active") {
          const elapsedMs = now - Number(inf.startTime || 0);
          const durationMs = (Number(inf.durationMinutes) || 15) * 60 * 1000;
          if (elapsedMs > durationMs) {
            finishedEvents.add(eventId);
            if (inf.impacts) {
              for (const [t, pct] of Object.entries(inf.impacts)) {
                if (cachedLivePrices[t]) {
                  const targetImpactPct = pct / 100;
                  cachedLivePrices[t].engineBasePrice = (cachedLivePrices[t].engineBasePrice || cachedLivePrices[t].price) * (1 + targetImpactPct);
                }
              }
            }
          }
        }
      }

      let shouldResetBase = false;
      if (now - lastBasePriceReset >= 180000 || forceBasePriceReset) {
        shouldResetBase = true;
        forceBasePriceReset = false;
        lastBasePriceReset = now;
      }

      for (const ticker of Object.keys(cachedLivePrices)) {
        const stockData = cachedLivePrices[ticker];
        let engineBase = stockData.engineBasePrice || stockData.basePrice || stockData.price;
        if (shouldResetBase) engineBase = stockData.price;

        let eventBias = 0, currentTargetMultiplier = 1;
        for (const [eventId, inf] of Object.entries(cachedInfluences)) {
          if (inf.status === "active" && inf.impacts && inf.impacts[ticker] !== undefined) {
            const targetImpactPct = inf.impacts[ticker] / 100;
            const elapsedMs = now - inf.startTime;
            const durationMs = (inf.durationMinutes || 15) * 60 * 1000;
            if (elapsedMs > 0 && elapsedMs <= durationMs) {
              const progress = elapsedMs / durationMs;
              eventBias += (targetImpactPct / (durationMs / TICK_INTERVAL_MS)) * (Math.PI / 2) * Math.sin(progress * Math.PI);
              currentTargetMultiplier += (targetImpactPct * ((1 - Math.cos(progress * Math.PI)) / 2));
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

        // Bounded memory buffer: 360 points * 5s = 30 minutes of real-time history
        if (!cachedPriceHistory[ticker]) cachedPriceHistory[ticker] = {};
        if (tickCount % 10 === 0) { // Every 5 seconds
          cachedPriceHistory[ticker][now] = Number(newPrice.toFixed(2));
          const keys = Object.keys(cachedPriceHistory[ticker]);
          if (keys.length > 360) delete cachedPriceHistory[ticker][keys[0]]; // Keep last 30 mins
        }
      }

      // Mark expired news as completed
      for (const eventId of finishedEvents) {
        delete cachedInfluences[eventId];
        const query = mongoose.isValidObjectId(eventId) ? { $or: [{ eventId }, { _id: eventId }] } : { eventId };
        await NewsEvent.updateOne(query, { status: "completed" });
      }

      io.emit("livePrices", { prices: cachedLivePrices, marketStatus: currentMarketStatus });
    } catch (e) {}
  }, TICK_INTERVAL_MS);

  // Background Database Sync (Every 15s)
  setInterval(async () => {
    try {
      await SystemState.updateOne(
        { key: "main" },
        {
          marketStatus: currentMarketStatus,
          livePrices: cachedLivePrices,
          marketInfluence: cachedInfluences,
          totalTaxCollected,
          lastTradeTax
        }
      );
    } catch (e) {}
  }, 15000);
}

// --- AUTH & CONTEXT MIDDLEWARE ---
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: { message: "Unauthenticated" } });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findOne({ uid: decoded.uid }, "uid email role name isFrozen").lean();
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

// --- AUTH & CLIENT ENDPOINTS ---
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
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
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

app.get("/api/me", authMiddleware, async (req, res) => {
  const u = await User.findOne({ uid: req.user.uid }).lean();
  res.json({ data: u });
});

app.get("/api/state", (req, res) => {
  res.json({
    data: {
      marketStatus: currentMarketStatus,
      livePrices: cachedLivePrices,
      priceHistory: cachedPriceHistory,
      leaderboard: cachedRankings,
      totalTaxCollected,
      lastTradeTax
    }
  });
});

app.get("/api/leaderboard", (req, res) => {
  res.json({ data: { rankings: cachedRankings } });
});

app.get("/api/history/:ticker", authMiddleware, (req, res) => {
  res.json({ data: cachedPriceHistory[req.params.ticker] || {} });
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
  if (!context.auth) throw new Error("User not logged in");
  await User.updateOne({ uid: context.auth.uid }, { wishlists: data.wishlists });
  return { success: true };
}));

// --- CORE TRADING ENGINE (Zero Fake Cash Injection) ---
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
  if (!user) throw new Error("User not found");
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
      realizedPnL = Math.round(((execPrice - buyPrice) * qty - taxDeducted) * 100) / 100;
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
    // Requires 100% Margin Collateral. Cash is NOT increased; only 0.1% STT is deducted.
    const marginRequired = qty * execPrice;
    taxDeducted = Math.round(marginRequired * 0.001 * 100) / 100;
    if (cashBalance < marginRequired + taxDeducted) {
      orderStatus = "rejected";
      rejectReason = "Insufficient cash balance for margin requirement";
    } else {
      cashBalance -= taxDeducted;
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
      const shortPrice = shortData.avgPrice || execPrice;

      realizedPnL = Math.round(((shortPrice - execPrice) * qty - taxDeducted) * 100) / 100;
      pnlPct = shortPrice > 0 ? Number((((shortPrice - execPrice) / shortPrice) * 100).toFixed(2)) : 0;

      if (cashBalance + realizedPnL < 0) {
        orderStatus = "rejected";
        rejectReason = "Insufficient cash to absorb short trade loss";
      } else {
        cashBalance += realizedPnL;
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

  if (orderStatus === "completed") {
    totalTaxCollected += taxDeducted;
    lastTradeTax = taxDeducted;
    user.cashBalance = Math.max(0, cashBalance);
    await user.save();
    io.emit(`userUpdate:${uid}`, { cashBalance: user.cashBalance, holdings: user.holdings });
  }

  await Order.create({
    orderId: "ord_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    uid, ticker, side: action, quantity: qty,
    priceAtExecution: execPrice, status: orderStatus, reason: rejectReason,
    realizedPnL, pnlPct, taxDeducted
  });

  return { status: orderStatus, reason: rejectReason, executionPrice: execPrice, realizedPnL, pnlPct, taxDeducted };
}));

// --- IPO BIDDING ---
app.post('/api/subscribeIPO', authMiddleware, handleCallable(async (data, context) => {
  if (!context.auth) throw new Error("User not logged in");
  const uid = context.auth.uid;
  const qty = parseInt(data.requestedShares, 10);
  if (isNaN(qty) || qty <= 0) throw new Error("Quantity must be positive");

  const ipo = await IPO.findOne({ ipoId: data.ipoId });
  if (!ipo || ipo.status !== "open") throw new Error("IPO is not open for bidding");

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
  } else {
    ipo.subscriptions.push({
      subId: "sub_" + Date.now(),
      uid, requestedShares: qty, requestedLots: lotsToAdd,
      allocatedShares: 0, allocatedLots: 0, investedAmount: cost
    });
  }

  ipo.totalSubscribedLots = (ipo.totalSubscribedLots || 0) + lotsToAdd;
  ipo.totalSubscribedShares = (ipo.totalSubscribedShares || 0) + qty;
  ipo.subscriptionCount = ipo.subscriptions.length;
  ipo.subscriptionRate = Number((ipo.totalSubscribedLots / (Number(ipo.totalLots) || 1)).toFixed(2));
  await ipo.save();

  io.emit(`userUpdate:${uid}`, { cashBalance: user.cashBalance });
  return { success: true };
}));

// --- ADMIN SYSTEM & MATRIX CONTROLLERS ---
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
    cachedLivePrices[ticker].engineBasePrice = targetPrice;
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
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error("No valid news events found to import.");
  }

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

app.post('/api/adminCreateIPO', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  await IPO.create({
    ipoId: "ipo_" + Date.now(),
    name: data.name,
    ticker: data.ticker,
    price: data.price,
    lotSize: data.lotSize,
    totalLots: data.totalLots,
    listingPremiumPct: data.listingPremiumPct,
    sector: data.sector || "Upcoming",
    status: "upcoming",
    openTime: data.openTime,
    closeTime: data.closeTime,
    listTime: data.listTime
  });
  return { success: true };
}));

app.post('/api/adminCloseIPO', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const query = mongoose.isValidObjectId(data.ipoId) 
    ? { $or: [{ ipoId: data.ipoId }, { _id: data.ipoId }] }
    : { ipoId: data.ipoId };
  await IPO.updateOne(query, { status: "closed" });
  return { success: true };
}));

app.post('/api/adminUpdateIPOGMP', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const newGmp = Number(data.listingPremiumPct) || 0;
  await IPO.updateOne({ ipoId: data.ipoId }, { listingPremiumPct: newGmp });
  return { success: true };
}));

app.post('/api/processAllotment', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const query = mongoose.isValidObjectId(data.ipoId) 
    ? { $or: [{ ipoId: data.ipoId }, { _id: data.ipoId }] }
    : { ipoId: data.ipoId };
  await IPO.updateOne(query, { triggerAllotment: true });
  return { success: true };
}));

app.post('/api/listIPO', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const query = mongoose.isValidObjectId(data.ipoId) 
    ? { $or: [{ ipoId: data.ipoId }, { _id: data.ipoId }] }
    : { ipoId: data.ipoId };

  const ipo = await IPO.findOne(query);
  if (!ipo) throw new Error("IPO not found");

  const now = Date.now();
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
    headline: `🚀 IPO Listed: ${ipo.ticker} (${ipo.name || ipo.ticker}) listed at ₹${listingPrice.toFixed(2)} and is now LIVE for trading!`,
    status: "active",
    startTime: now,
    createdAt: now,
    durationMinutes: 60,
    targetTickers: [ipo.ticker],
    impactDirection: "positive"
  });

  io.emit("newsUpdate", { type: "listed", ipo: ipo.ticker });
  io.emit("livePrices", { prices: cachedLivePrices, marketStatus: currentMarketStatus });

  return { success: true, ticker: ipo.ticker, price: listingPrice };
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
    createdAt: Date.now()
  });
  return { success: true, eventId: evtId };
}));

app.post('/api/adminReleaseNewsEvent', authMiddleware, verifyAdmin, handleCallable(async (data) => {
  const targetId = data.eventId || data.event?.id || data.event?.eventId;
  const now = Date.now();
  const query = mongoose.isValidObjectId(targetId) ? { $or: [{ eventId: targetId }, { _id: targetId }] } : { eventId: targetId };

  await NewsEvent.updateOne(
    query,
    { status: "active", startTime: now, firedAt: now, durationMinutes: data.durationMinutes || 15 }
  );
  cachedInfluences[targetId] = {
    id: targetId,
    headline: data.event?.headline || "Breaking Market News",
    impacts: data.event?.stockImpacts || {},
    durationMinutes: data.durationMinutes || 15,
    startTime: now,
    status: "active"
  };
  forceBasePriceReset = true;
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
  forceBasePriceReset = true;
  return { success: true };
}));

app.post('/api/adminDeleteAllNews', authMiddleware, verifyAdmin, handleCallable(async () => {
  await NewsEvent.deleteMany({});
  cachedInfluences = {};
  forceBasePriceReset = true;
  return { success: true };
}));

app.post('/api/adminTriggerNextNews', authMiddleware, verifyAdmin, handleCallable(async () => {
  const event = await NewsEvent.findOne({ status: "draft" }).sort({ createdAt: 1 });
  if (!event) throw new Error("No draft news in queue.");
  const now = Date.now();
  event.status = "active";
  event.startTime = now;
  event.firedAt = now;
  await event.save();
  cachedInfluences[event.eventId] = {
    id: event.eventId,
    headline: event.headline,
    impacts: event.stockImpacts || {},
    durationMinutes: event.durationMinutes || 15,
    startTime: now,
    status: "active"
  };
  forceBasePriceReset = true;
  io.emit("newsUpdate", { type: "breaking", headline: event.headline });
  return { success: true, headline: event.headline };
}));

app.post('/api/adminTriggerAllNews', authMiddleware, verifyAdmin, handleCallable(async () => {
  const drafts = await NewsEvent.find({ status: "draft" });
  if (drafts.length === 0) throw new Error("No draft news in queue.");
  const now = Date.now();
  for (const event of drafts) {
    event.status = "active";
    event.startTime = now;
    event.firedAt = now;
    await event.save();
    cachedInfluences[event.eventId] = {
      id: event.eventId,
      headline: event.headline,
      impacts: event.stockImpacts || {},
      durationMinutes: event.durationMinutes || 15,
      startTime: now,
      status: "active"
    };
  }
  forceBasePriceReset = true;
  io.emit("newsUpdate", { type: "bulk_breaking", count: drafts.length });
  return { success: true, count: drafts.length };
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

// Crash Prevention Hooks
process.on("uncaughtException", (err) => console.error("Uncaught Exception:", err.message));
process.on("unhandledRejection", (reason) => console.error("Unhandled Rejection:", reason));

server.listen(PORT, "0.0.0.0", () => {
  console.log(` MarketSim Native MongoDB + Socket.io Server running on port ${PORT}`);
});

app.get("/api/history/:ticker", authMiddleware, (req, res) => {
  const ticker = req.params.ticker?.toUpperCase();
  const limit = Math.min(parseInt(req.query.limit, 10) || 120, 1440); // Allows loading up to 1440 candles
  
  const historyObj = cachedPriceHistory[ticker] || {};
  const sortedTimestamps = Object.keys(historyObj).sort((a, b) => Number(a) - Number(b));
  
  // Return the exact slice of historical data requested by the client's zoom level
  const slicedTimestamps = sortedTimestamps.slice(-limit);
  const result = {};
  slicedTimestamps.forEach(ts => {
    result[ts] = historyObj[ts];
  });

  res.json({ data: result });
});