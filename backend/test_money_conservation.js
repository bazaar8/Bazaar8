const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('c:/Bazaar8/backend/node_modules/mongoose');
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://bnbbazaar80_db_user:IITivbVAqjrFs3Hi@cluster0.ywyxh6r.mongodb.net/bazaar?retryWrites=true&w=majority";

const UserSchema = new mongoose.Schema({
  uid: { type: String, unique: true },
  cashBalance: Number,
  holdings: [{
    ticker: String,
    positionType: { type: String, enum: ["long", "short"] },
    quantity: Number,
    avgPrice: Number
  }]
});
const User = mongoose.models.TestUser_MC || mongoose.model('TestUser_MC', UserSchema);

const IPOSchema = new mongoose.Schema({
  ipoId: String, ticker: String, price: Number, lotSize: Number, totalLots: Number,
  status: String, hasAllotted: { type: Boolean, default: false },
  subscriptions: [{
    subId: String, uid: String, requestedShares: Number, requestedLots: Number,
    allocatedLots: { type: Number, default: 0 }, allocatedShares: { type: Number, default: 0 },
    investedAmount: Number, refundedAmount: { type: Number, default: 0 },
    status: { type: String, default: "pending" },
    timestamp: { type: Number, default: Date.now },
    settled: { type: Boolean, default: false }
  }]
});
const IPO = mongoose.models.TestIPO_MC || mongoose.model('TestIPO_MC', IPOSchema);

// Exact helper code from engine.js
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
}

async function runTests() {
  await mongoose.connect(MONGO_URI);
  console.log("=== RUNNING MONEY CONSERVATION & SETTLEMENT SUITE ===");

  const testId = Date.now();
  const uidA = `user_mc_a_${testId}`;
  const uidB = `user_mc_b_${testId}`;
  const uidC = `user_mc_c_${testId}`;

  // Starting balances
  // User A starts with 1,000,000, subscribes 10,000 (100 shares @ ₹100, lotSize=50, 2 lots)
  // User B starts with 1,000,000, has 2 subscriptions: 2 lots (10,000) and 3 lots (15,000) = 25,000 total
  // User C starts with 1,000,000, subscribes 1 lot (5,000)
  await User.create([
    { uid: uidA, cashBalance: 990000, holdings: [] },
    { uid: uidB, cashBalance: 975000, holdings: [{ ticker: "MCTICKER", positionType: "long", quantity: 20, avgPrice: 80 }] },
    { uid: uidC, cashBalance: 995000, holdings: [] }
  ]);

  const ipo = await IPO.create({
    ipoId: `ipo_mc_${testId}`,
    ticker: "MCTICKER",
    price: 100,
    lotSize: 50,
    totalLots: 10,
    status: "allotted",
    hasAllotted: true,
    subscriptions: [
      { subId: "sub_a1", uid: uidA, requestedLots: 2, requestedShares: 100, investedAmount: 10000, settled: false },
      { subId: "sub_b1", uid: uidB, requestedLots: 2, requestedShares: 100, investedAmount: 10000, settled: false },
      { subId: "sub_b2", uid: uidB, requestedLots: 3, requestedShares: 150, investedAmount: 15000, settled: false },
      { subId: "sub_c1", uid: uidC, requestedLots: 1, requestedShares: 50, investedAmount: 5000, settled: false }
    ]
  });

  // Allotment distribution:
  // User A won 1 lot out of 2 requested
  // User B won 3 lots out of 5 requested (spread across 2 subs)
  // User C won 0 lots out of 1 requested
  await settleUid(ipo, uidA, 1);
  await settleUid(ipo, uidB, 3);
  await settleUid(ipo, uidC, 0);

  // Re-read IPO and Users
  const updatedIpo = await IPO.findById(ipo._id).lean();
  const userA = await User.findOne({ uid: uidA }).lean();
  const userB = await User.findOne({ uid: uidB }).lean();
  const userC = await User.findOne({ uid: uidC }).lean();

  let allChecksPassed = true;

  console.log("\n--- Checking Money Conservation PER SUBSCRIPTION ---");
  for (const s of updatedIpo.subscriptions) {
    const expected = s.investedAmount;
    const actual = Number((s.refundedAmount + (s.allocatedShares * updatedIpo.price)).toFixed(2));
    const pass = Math.abs(expected - actual) < 0.0001;
    console.log(`Sub [${s.subId}] (UID: ${s.uid}): Invested=₹${expected}, Refund=₹${s.refundedAmount}, AllocatedShares=${s.allocatedShares} (@ ₹${updatedIpo.price}) => Total=₹${actual} | Status: ${pass ? "PASS" : "FAIL"}`);
    if (!pass) allChecksPassed = false;
  }

  console.log("\n--- Checking Money Conservation PER UID ---");
  const usersToCheck = [
    { u: userA, expectedCash: 990000 + 5000, expectedShares: 50, expectedAvgPrice: 100, name: "User A (Partial Win)" },
    { u: userB, expectedCash: 975000 + 10000, expectedShares: 20 + 150, expectedAvgPrice: Math.round(((20*80 + 150*100)/(170))*100)/100, name: "User B (Multi-sub + Existing Holding)" },
    { u: userC, expectedCash: 995000 + 5000, expectedShares: 0, expectedAvgPrice: 0, name: "User C (Zero Win / 100% Refund)" }
  ];

  for (const item of usersToCheck) {
    const cashPass = Math.abs(item.u.cashBalance - item.expectedCash) < 0.001;
    const holding = (item.u.holdings || []).find(h => h.ticker === "MCTICKER" && h.positionType === "long");
    const shares = holding ? holding.quantity : 0;
    const avgPrice = holding ? holding.avgPrice : 0;
    const sharesPass = shares === item.expectedShares;
    const avgPricePass = item.expectedShares === 0 ? true : Math.abs(avgPrice - item.expectedAvgPrice) < 0.01;

    console.log(`${item.name} (${item.u.uid}):`);
    console.log(`  Cash: Expected=₹${item.expectedCash}, Actual=₹${item.u.cashBalance} | ${cashPass ? "PASS" : "FAIL"}`);
    console.log(`  Shares: Expected=${item.expectedShares}, Actual=${shares} | ${sharesPass ? "PASS" : "FAIL"}`);
    if (item.expectedShares > 0) {
      console.log(`  AvgPrice: Expected=₹${item.expectedAvgPrice}, Actual=₹${avgPrice} | ${avgPricePass ? "PASS" : "FAIL"}`);
    }

    if (!cashPass || !sharesPass || !avgPricePass) allChecksPassed = false;
  }

  // Cleanup test docs
  await User.deleteMany({ uid: { $in: [uidA, uidB, uidC] } });
  await IPO.deleteOne({ _id: ipo._id });
  await mongoose.disconnect();

  console.log("\n=================================");
  console.log("Money conservation verdict: " + (allChecksPassed ? "PASS" : "FAIL"));
  console.log("=================================");

  if (!allChecksPassed) process.exit(1);
}

runTests().catch(e => {
  console.error("Test failed with error:", e);
  process.exit(1);
});
