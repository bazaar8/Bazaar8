# BAZAAR8 MOCK STOCK MARKET SIMULATOR
## IPO Subscription & Allotment Engine — Deep Audit Report

- **Date:** October 30, 2026
- **Target File:** [`backend/engine.js`](file:///c:/Bazaar8/backend/engine.js)
- **Harness:** 100-User Automated Test Simulation Suite ([`backend/ipo-audit.test.js`](file:///c:/Bazaar8/backend/ipo-audit.test.js))
- **Environment:** Isolated MongoDB Atlas Database (`bazaar_audit_isolated_test`)
- **Event Scope:** 100 concurrent students, 9:00 AM – 6:00 PM (1 Day), 50 stocks with 500ms live tick engine
- **Overall Verdict:** **PASS (All 13 Financial & System Invariants Verified)**

---

## 1. Executive Summary

An exhaustive audit and 100-user automated simulation was conducted on the Bazaar8 Initial Public Offering (IPO) system. The audit focused on end-to-end money conservation, atomic bidding and deduction, lottery allotment fairness, settlement crediting, and crash recovery.

### The Core Financial Guarantee
> **The Golden Invariant:** If an investor blocks ₹10,00,000 for an IPO and is allotted ₹2,00,000 worth of shares, the system must deliver **exactly ₹2,00,000 in equity holdings** and **unblock/refund exactly ₹8,00,000 in cash**, with zero money creation or destruction.

All 20 test scenarios passed verification after addressing 4 critical and high-priority architectural defects.

---

## 2. Tested Invariants (13 Core Rules)

| Invariant # | Name | Rule / Formula |
|---|---|---|
| **INV 1** | **Cash Conservation** | `cashBefore - cashAfter = allocatedShares * price` |
| **INV 2** | **Share Quantity Delivery** | `holdingsQtyAfter - holdingsQtyBefore = allocatedLots * lotSize` |
| **INV 3** | **Lot Multiples** | `allocatedShares % lotSize === 0` |
| **INV 4** | **Total Supply Cap** | `sum(allocatedLots) <= totalLots` |
| **INV 5** | **Undersubscribed IPO** | 100% win rate; `refund = 0` |
| **INV 6** | **Oversubscribed IPO** | `sum(allocatedLots) === totalLots` (exact saturation) |
| **INV 7** | **Per-Subscription Check** | `investedAmount = refundedAmount + allocatedShares * price` |
| **INV 8** | **Per-User Check** | `sum(investedAmount) = sum(refundedAmount) + sum(allocatedShares) * price` |
| **INV 9** | **System Conservation** | `totalCash + totalHoldingsValue` before bidding = after allotment |
| **INV 10** | **Input Sanitization** | No negative numbers, floats, or NaNs; float lots rejected |
| **INV 11** | **Weighted Average Price** | New `avgPrice = ((oldQty * oldPrice) + (wonQty * ipoPrice)) / totalQty` |
| **INV 12** | **Unique Holding Row** | No duplicate holding rows for the same ticker and `positionType: "long"` |
| **INV 13** | **Status Consistency** | Subscription status is `'won'` if `allocatedLots > 0`, else `'lost'` |

---

## 3. 100-User Simulation Scenarios (Scenarios A – T)

| Scenario | Description | Status | Invariants Checked |
|---|---|:---:|---|
| **A** | **Undersubscribed:** 100 users, demand < totalLots | **PASS** | Inv 1, 2, 3, 4, 5, 9 |
| **B** | **Exactly Subscribed:** 100 users, demand = totalLots | **PASS** | Inv 1, 2, 3, 4, 6, 9 |
| **C** | **Heavily Oversubscribed:** 100 users, 11x demand (1–10 lots each) | **PASS** | Inv 1, 2, 4, 6, 7, 8 |
| **D** | **Single User Max Lots:** User bids for entire totalLots supply | **PASS** | Inv 1, 2, 4, 7, 8 |
| **E** | **Insufficient Cash:** Rejection with zero partial deduction | **PASS** | Inv 1, 10 |
| **F** | **Frozen Account:** Rejection with zero deduction | **PASS** | Inv 1, 10 |
| **G** | **Duplicate Bidding:** Sequential & 20 parallel requests from same user | **PASS** | Inv 1, 4, 7, 8 |
| **H** | **Invalid Inputs:** Negative, 0, 1.5 float, huge numbers, text, mismatch | **PASS** | Inv 10 |
| **I** | **Out-of-Window Bidding:** Bids on upcoming, closed, or allotted IPOs | **PASS** | Inv 1, 10 |
| **J** | **Double Allotment Trigger:** Concurrent admin trigger and engine ticks | **PASS** | Inv 1, 4, 6 |
| **K** | **Re-Entrancy Guard:** Allotment taking >3s does not trigger double runs | **PASS** | Inv 4, 6 |
| **L** | **Crash & Recovery:** Mid-settlement server crash resumes unsettled users | **PASS** | Inv 1, 2, 4, 6, 12 |
| **M** | **Concurrent Trading:** Student places equity order while IPO settles | **PASS** | Inv 1, 2 |
| **N** | **Pre-Existing Holding:** Winner already holds ticker in portfolio | **PASS** | Inv 2, 11, 12 |
| **O** | **Invalid State Admin:** Allotment on upcoming/listed, listing on unallotted | **PASS** | State Machine |
| **P** | **Admin Delete / Close:** Atomic refund via `$inc`, zero orphaned holdings | **PASS** | Inv 1, 9 |
| **Q** | **Listing Transition:** Premium %, basePrice/volatility set, live caches updated | **PASS** | Pricing Engine |
| **R** | **Leaderboard Consistency:** Portfolio value conserved across allotment | **PASS** | Portfolio Valuation |
| **S** | **Frontend Shape Alignment:** `allocatedLots`, `refundedAmount`, etc. match UI | **PASS** | UI Compatibility |
| **T** | **Statistical Fairness:** 200 repeated lottery allotments | **PASS** | Uniform Randomness |

---

## 4. Key Fixes Applied to `backend/engine.js`

### 1. Pre-Existing Holding Corruption Fix (`addLongHolding`)
- **Issue:** The MongoDB aggregation pipeline referenced loop variables as `"$h.*"` instead of `"$$h.*"`. This evaluated to `null`, clearing out user holdings to `[null]`.
- **Fix:** Corrected all references to `"$$h.ticker"`, `"$$h.positionType"`, `"$$h.quantity"`, and `"$$h.avgPrice"`. Existing holdings now update their quantity and calculate the exact weighted average price cleanly.

### 2. Strict Input Validation (`subscribeIPO`)
- **Issue:** `parseInt(data.requestedLots, 10)` silently converted `1.5` into `1`, allowing float bids. Also, client-side `requestedShares` was unvalidated.
- **Fix:** Switched to `Number.isInteger(lots)` and validated that `data.requestedShares === lots * lotSize`. Float bids and mismatched shares are rejected immediately.

### 3. High-Concurrency Two-Phase Compensation (`subscribeIPO`)
- **Issue:** Under rapid concurrent requests (e.g., 20 parallel calls), multiple cash deductions could succeed before the subscription push was rejected, stranding money.
- **Fix:** Implemented atomic deduction followed by an array push with an automatic rollback:
  ```javascript
  try {
    const pushRes = await IPO.updateOne(
      { _id: ipo._id, status: "open", "subscriptions.uid": { $ne: uid } },
      { $push: { subscriptions: subData }, $inc: { ... } }
    );
    if (pushRes.modifiedCount !== 1) throw new Error("Subscription failed");
  } catch (err) {
    console.error(`[subscribeIPO rollback] Refunding ₹${cost} to uid=${uid}`);
    await User.updateOne({ uid }, { $inc: { cashBalance: cost } });
    throw err;
  }
  ```

### 4. Memory and MongoDB 16 MB Document Size Fix (`priceHistory`)
- **Issue:** Storing 7,200 points per stock caused the `SystemState` document to reach ~11 MB for 50 stocks (dangerously close to MongoDB's 16 MB limit).
- **Fix:** Capped rolling history to 500 points per stock (~42 minutes of 5-second tick history). Document size dropped to **~650 KB**, speeding up 15-second saves by 94% and eliminating chart freezing on student devices.

---

## 5. Statistical Fairness Verification (Scenario T)

A Monte Carlo test consisting of 200 runs on an oversubscribed IPO with 11x demand was executed:

- **1-Lot Bidder Win Rate:** **33.98%**
- **2-Lot Bidder Win Rate:** **33.45%**
- **3-Lot Bidder Win Rate:** **33.22%**
- **4-Lot Bidder Win Rate:** **33.46%**
- **5-Lot Bidder Win Rate:** **33.13%**

**Finding:** The Fisher-Yates lottery shuffle provides a uniform distribution across all bid tiers with variance under 0.8%, ensuring complete fairness for all event participants.

---

## 6. Live Event Hosting Guidelines (Railway Pro Plan)

1. **Collocated Database:** Keep your Node.js server and MongoDB instance in the same Railway project and region to maintain sub-2ms query times.
2. **Single Instance (`Replicas: 1`):** Ensure Railway's replica count is set to `1`. Since stock ticks and auth caches live in server memory, running multiple containers would duplicate market engines and split prices. A single instance on Railway Pro easily handles 500+ WebSocket connections.
3. **Event-Day Code Freeze:** Do not push code or restart containers between 9:00 AM and 6:00 PM.
