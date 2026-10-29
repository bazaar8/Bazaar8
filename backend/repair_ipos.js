/**
 * One-time IPO Settlement Audit & Repair Script
 *
 * Usage:
 *   Dry-run (default): node backend/repair_ipos.js
 *   Apply repairs:     node backend/repair_ipos.js --apply
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://bnbbazaar80_db_user:IITivbVAqjrFs3Hi@cluster0.ywyxh6r.mongodb.net/bazaar?retryWrites=true&w=majority";

const IPOSchema = new mongoose.Schema({
  ipoId: String, ticker: String, name: String, price: Number, lotSize: Number, totalLots: Number,
  status: String, hasAllotted: Boolean,
  subscriptions: [{
    subId: String, uid: String, requestedShares: Number, requestedLots: Number,
    allocatedLots: Number, allocatedShares: Number,
    investedAmount: Number, refundedAmount: Number,
    status: String, timestamp: Number, settled: Boolean
  }]
});

const UserSchema = new mongoose.Schema({
  uid: String, email: String, name: String, cashBalance: Number,
  holdings: [{
    ticker: String,
    positionType: { type: String, enum: ["long", "short"] },
    quantity: Number,
    avgPrice: Number
  }]
});

const AdminLogSchema = new mongoose.Schema({
  timestamp: { type: Number, default: Date.now, index: -1 },
  adminEmail: String, action: String, details: Object
});

const IPO = mongoose.models.IPO || mongoose.model("IPO", IPOSchema);
const User = mongoose.models.User || mongoose.model("User", UserSchema);
const AdminLog = mongoose.models.AdminLog || mongoose.model("AdminLog", AdminLogSchema);

async function run() {
  const isApply = process.argv.includes('--apply');
  console.log("==============================================================");
  console.log(` IPO REPAIR & AUDIT UTILITY [MODE: ${isApply ? "APPLY (WRITING TO DB)" : "DRY-RUN (READ-ONLY)"}]`);
  console.log("==============================================================\n");

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB Atlas.\n");

  const ipos = await IPO.find({ status: { $in: ["allotted", "listed"] } }).lean();
  console.log(`Found ${ipos.length} IPO(s) with status 'allotted' or 'listed'.\n`);

  let totalDiscrepancies = 0;
  let totalHoldingsIssues = 0;
  const cashCorrections = [];

  for (const ipo of ipos) {
    const lotSize = Number(ipo.lotSize) || 1;
    const price = Number(ipo.price) || 0;
    console.log(`--------------------------------------------------------------`);
    console.log(`Auditing IPO: ${ipo.ticker} (${ipo.name || ipo.ticker}) | Price: ₹${price} | Status: ${ipo.status}`);
    console.log(`--------------------------------------------------------------`);

    // Group subscriptions by UID
    const subsByUid = {};
    for (const sub of (ipo.subscriptions || [])) {
      if (!subsByUid[sub.uid]) subsByUid[sub.uid] = [];
      subsByUid[sub.uid].push(sub);
    }

    const uids = Object.keys(subsByUid);
    if (uids.length === 0) {
      console.log("  No subscriptions found for this IPO.\n");
      continue;
    }

    for (const uid of uids) {
      const subs = subsByUid[uid];
      const sumInvested = subs.reduce((sum, s) => {
        const fallbackCost = (Number(s.requestedShares) || (Number(s.requestedLots) * lotSize)) * price;
        return sum + (Number(s.investedAmount) > 0 ? Number(s.investedAmount) : fallbackCost);
      }, 0);

      const sumRefunded = subs.reduce((sum, s) => sum + (Number(s.refundedAmount) || 0), 0);
      const sumAllocatedShares = subs.reduce((sum, s) => sum + (Number(s.allocatedShares) || 0), 0);

      const expected = Number(sumInvested.toFixed(2));
      const actual = Number((sumRefunded + sumAllocatedShares * price).toFixed(2));
      const diff = Number((expected - actual).toFixed(2));

      // Inspect User
      const user = await User.findOne({ uid }).lean();
      const userEmail = user?.email || uid;

      // Check money conservation
      if (Math.abs(diff) > 0.01) {
        totalDiscrepancies++;
        console.log(`  [MONEY MISMATCH] UID: ${uid} (${userEmail})`);
        console.log(`    Expected (Invested): ₹${expected.toFixed(2)}`);
        console.log(`    Actual (Refund + Shares*Price): ₹${actual.toFixed(2)} (Refund: ₹${sumRefunded.toFixed(2)}, Shares: ${sumAllocatedShares})`);
        console.log(`    Discrepancy (Expected - Actual): ₹${diff.toFixed(2)} [${diff > 0 ? "Under-refunded" : "Over-credited"}]`);

        cashCorrections.push({
          uid,
          userEmail,
          ticker: ipo.ticker,
          ipoId: ipo.ipoId,
          expected,
          actual,
          diff
        });
      } else {
        console.log(`  [PASS] UID: ${uid} | Invested: ₹${expected.toFixed(2)} == Refund: ₹${sumRefunded.toFixed(2)} + SharesVal: ₹${(sumAllocatedShares * price).toFixed(2)}`);
      }

      // Check Holdings anomalies
      if (user && user.holdings) {
        const longHoldingsForTicker = user.holdings.filter(h => h.ticker === ipo.ticker && h.positionType === "long");
        
        // 1. Duplicate holding objects in array
        if (longHoldingsForTicker.length > 1) {
          totalHoldingsIssues++;
          console.log(`  [HOLDING DUPLICATE] UID: ${uid} has ${longHoldingsForTicker.length} duplicate long entries for ticker ${ipo.ticker}!`);
        }

        // 2. Shares in holdings vs allocatedShares
        const totalHoldingQty = longHoldingsForTicker.reduce((sum, h) => sum + (Number(h.quantity) || 0), 0);
        if (ipo.status === "allotted" && totalHoldingQty > sumAllocatedShares) {
          // If the IPO is only allotted and not listed, user could not have bought more on secondary market yet!
          totalHoldingsIssues++;
          console.log(`  [HOLDING EXCESS] UID: ${uid} holds ${totalHoldingQty} shares of ${ipo.ticker}, but was only allotted ${sumAllocatedShares} shares!`);
        }
      }
    }
    console.log();
  }

  console.log("==============================================================");
  console.log(" AUDIT SUMMARY");
  console.log("==============================================================");
  console.log(`Total Money Conservation Discrepancies: ${totalDiscrepancies}`);
  console.log(`Total Holdings Structure Anomalies:     ${totalHoldingsIssues}`);

  if (cashCorrections.length > 0) {
    console.log(`\nDiscrepancies to correct (${cashCorrections.length}):`);
    cashCorrections.forEach((c, idx) => {
      console.log(`  ${idx + 1}. UID: ${c.uid} (${c.userEmail}) | Ticker: ${c.ticker} | Adjustment: ₹${c.diff.toFixed(2)}`);
    });

    if (isApply) {
      console.log("\n--- Applying Cash Corrections with $inc ---");
      for (const c of cashCorrections) {
        await User.updateOne({ uid: c.uid }, { $inc: { cashBalance: c.diff } });
        await AdminLog.create({
          timestamp: Date.now(),
          adminEmail: "system_repair_script",
          action: "IPO_CASH_CORRECTION",
          details: {
            uid: c.uid,
            userEmail: c.userEmail,
            ticker: c.ticker,
            ipoId: c.ipoId,
            expected: c.expected,
            actual: c.actual,
            adjustment: c.diff
          }
        });
        console.log(`  Applied adjustment of ₹${c.diff.toFixed(2)} to ${c.uid} and logged to AdminLog.`);
      }
      console.log("\nAll adjustments successfully applied!");
    } else {
      console.log("\n[DRY-RUN] No changes were written to the database. Run with --apply to apply corrections.");
    }
  } else {
    console.log("\nNo money discrepancies found across any allotted or listed IPOs! All subscriptions satisfy money conservation.");
  }

  await mongoose.disconnect();
  console.log("\nDone.");
}

run().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
