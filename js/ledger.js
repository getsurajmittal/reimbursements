/* ===========================================================================
   The ledger engine.

   The database deliberately does NOT tie a payment to a bill - what's owed is
   just (all bills - all payments), so you can pay off any chunk at any time.
   That's flexible to record but useless to look at: neither side can tell
   which bills a payment actually cleared.

   This module derives that answer, oldest-bill-first (FIFO): every payment,
   in date order, is applied to the oldest bill that still has a balance. It's
   the same rule a shopkeeper's ledger uses, it's stable (adding a new bill
   never re-opens an old one), and it needs no schema change - both roles can
   compute it from rows they're already allowed to read.

   ---------------------------------------------------------------------------
   Reporting periods
   ---------------------------------------------------------------------------
   A period (`from`..`to`) narrows what is REPORTED, never what is COMPUTED.
   The allocation always runs over the full history up to `to`, because a
   bill's paid/unpaid state depends on every payment that came before it - if
   we fed only the window's rows into the FIFO, a January bill part-paid in
   February would wrongly show as untouched inside a March window.

   So there are two families of number here, and they behave differently:

     * FLOWS  - bills submitted, paid back, pocket money given. These belong
                to a period and are summed over `from`..`to`.
     * STOCK  - the outstanding balance. This is a running total with no
                monthly version; "you owed X in March" is meaningless. It is
                always cumulative and reported *as at* `to`.

   Mixing those two up is the easiest way to build a period view that shows
   confidently wrong numbers, so they are kept apart deliberately.
   =========================================================================== */

import { sum, todayISO, parseDate, monthLabel, daysBetween } from './util.js';

/** Money compares need a tolerance: numeric(12,2) round-trips through floats. */
const EPS = 0.005;

const byDateAsc = (a, b) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : Number(a.id) - Number(b.id);

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const STATUS = {
  paid:    { key: 'paid',    label: 'Paid',         icon: 'checkCircle', cls: 'pill--paid' },
  partial: { key: 'partial', label: 'Part paid',    icon: 'halfCircle',  cls: 'pill--partial' },
  unpaid:  { key: 'unpaid',  label: 'Awaiting pay', icon: 'clock',       cls: 'pill--unpaid' },
};

/**
 * @param {object} input
 * @param {Array}  input.bills        rows from `reimbursements`
 * @param {Array}  input.settlements  rows from `settlements`
 * @param {Array}  input.pocketMoney  rows from `pocket_money`
 * @param {string} [input.to]         ISO date; rows dated after it are ignored entirely
 * @param {string} [input.from]       ISO date; narrows the *reported* period only
 */
export function buildLedger({
  bills = [], settlements = [], pocketMoney = [],
  to = todayISO(), from = null,
}) {
  const upTo = (rows) => rows.filter(r => r.date <= to);

  const billRows = upTo(bills).map(b => ({
    ...b,
    amount: Number(b.amount),
    paidAmount: 0,
    remaining: Number(b.amount),
    status: 'unpaid',
    clearedOn: null,
    payments: [],           // which settlements chipped away at this bill
  })).sort(byDateAsc);

  const payRows = upTo(settlements).map(s => ({
    ...s,
    amount: Number(s.amount),
    applied: 0,
    unapplied: 0,
    covers: [],             // which bills this payment went towards
  })).sort(byDateAsc);

  // --- FIFO allocation, over the FULL history up to `to` ------------------
  let cursor = 0; // oldest bill that still has a balance
  for (const pay of payRows) {
    let left = pay.amount;
    while (left > EPS && cursor < billRows.length) {
      const bill = billRows[cursor];
      const need = bill.amount - bill.paidAmount;
      if (need <= EPS) { cursor++; continue; }

      const take = Math.min(need, left);
      bill.paidAmount += take;
      bill.remaining = Math.max(0, bill.amount - bill.paidAmount);
      left -= take;
      pay.applied += take;

      bill.payments.push({ paymentId: pay.id, date: pay.date, amount: take, note: pay.note });
      pay.covers.push({ billId: bill.id, description: bill.description, date: bill.date, amount: take });

      if (bill.remaining <= EPS) {
        bill.remaining = 0;
        bill.clearedOn = pay.date;
        cursor++;
      }
    }
    // Money left over once every bill is square - an advance against future bills.
    pay.unapplied = Math.max(0, left);
  }

  for (const bill of billRows) {
    bill.status = bill.paidAmount <= EPS ? 'unpaid'
      : bill.remaining <= EPS ? 'paid'
      : 'partial';
  }

  const pocketRows = upTo(pocketMoney).map(p => ({ ...p, amount: Number(p.amount) })).sort(byDateAsc);

  // --- Cumulative position, as at `to` (STOCK) ----------------------------
  const billed = sum(billRows);
  const paid = sum(payRows);
  const outstanding = Math.max(0, billed - paid);
  const credit = Math.max(0, paid - billed);

  const openBills = billRows.filter(b => b.status !== 'paid');
  const oldestOpen = openBills[0] || null;

  // --- The reporting window (FLOWS) ---------------------------------------
  const inPeriod = (r) => (!from || r.date >= from);
  const periodBills = billRows.filter(inPeriod);
  const periodPayments = payRows.filter(inPeriod);
  const periodPocket = pocketRows.filter(inPeriod);

  const periodCounts = { paid: 0, partial: 0, unpaid: 0 };
  periodBills.forEach(b => { periodCounts[b.status]++; });

  const allCounts = { paid: 0, partial: 0, unpaid: 0 };
  billRows.forEach(b => { allCounts[b.status]++; });

  const periodBilled = sum(periodBills);
  const periodPaid = sum(periodPayments);

  return {
    period: { from, to, isAllTime: !from },

    // Full history (needed by the allocation and by anything cumulative).
    bills: billRows,                              // oldest first
    billsNewestFirst: [...billRows].reverse(),
    payments: payRows,
    paymentsNewestFirst: [...payRows].reverse(),
    pocketMoney: [...pocketRows].reverse(),       // newest first, as displayed

    // Just the window.
    periodBills,
    periodBillsNewestFirst: [...periodBills].reverse(),
    periodPayments,
    periodPaymentsNewestFirst: [...periodPayments].reverse(),
    periodPocketMoney: [...periodPocket].reverse(),

    totals: {
      // STOCK - cumulative, as at `to`. Never scoped to the window.
      billed,
      paid,
      outstanding,
      credit,
      pocket: sum(pocketRows),
      clearedPct: billed > 0 ? Math.min(100, (Math.min(paid, billed) / billed) * 100) : 0,
    },

    periodTotals: {
      // FLOWS - what happened inside the window.
      billed: periodBilled,
      paid: periodPaid,
      pocket: sum(periodPocket),
      billCount: periodBills.length,
      paymentCount: periodPayments.length,
      // How much the amount owed moved over the window (+ owed more, - owed less).
      net: periodBilled - periodPaid,
      stillOpen: periodBills.reduce((t, b) => t + b.remaining, 0),
    },

    counts: allCounts,
    periodCounts,
    openBillCount: openBills.length,
    oldestOpen,
    oldestOpenAgeDays: oldestOpen ? daysBetween(oldestOpen.date, to) : 0,
    lastPayment: payRows.length ? payRows[payRows.length - 1] : null,
    lastBill: billRows.length ? billRows[billRows.length - 1] : null,
    earliestDate: earliestOf([billRows, payRows, pocketRows]),
  };
}

function earliestOf(groups) {
  let earliest = null;
  groups.forEach(rows => {
    if (rows.length && (!earliest || rows[0].date < earliest)) earliest = rows[0].date;
  });
  return earliest;
}

/* ===========================================================================
   Chart buckets.

   The bucket size follows the length of the range, so a one-month view shows
   weeks rather than a single lonely bar, and a multi-year view doesn't try to
   draw ninety of them.
   =========================================================================== */

export function bucketsFor(from, to) {
  const start = from || to;
  const spanDays = Math.max(0, daysBetween(start, to));

  if (spanDays <= 45) return { granularity: 'week', buckets: weekBuckets(start, to) };

  const months = monthBuckets(start, to);
  if (months.length <= 14) return { granularity: 'month', buckets: months };
  return { granularity: 'quarter', buckets: quarterBuckets(start, to) };
}

function weekBuckets(from, to) {
  const end = parseDate(to);
  const out = [];
  const cur = parseDate(from);
  while (cur <= end && out.length < 60) {
    const s = new Date(cur);
    const e = new Date(cur);
    e.setDate(e.getDate() + 6);
    out.push({
      start: isoOf(s),
      end: isoOf(e > end ? end : e),
      label: `${s.getDate()} ${s.toLocaleDateString(undefined, { month: 'short' })}`,
    });
    cur.setDate(cur.getDate() + 7);
  }
  return out;
}

function monthBuckets(from, to) {
  const start = parseDate(from), end = parseDate(to);
  const out = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end && out.length < 120) {
    const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const last = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    out.push({
      start: isoOf(first < start ? start : first),
      end: isoOf(last > end ? end : last),
      label: monthLabel(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}`),
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

function quarterBuckets(from, to) {
  const start = parseDate(from), end = parseDate(to);
  const out = [];
  const cur = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1);
  while (cur <= end && out.length < 60) {
    const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const last = new Date(cur.getFullYear(), cur.getMonth() + 3, 0);
    out.push({
      start: isoOf(first < start ? start : first),
      end: isoOf(last > end ? end : last),
      label: `Q${Math.floor(cur.getMonth() / 3) + 1} '${String(cur.getFullYear()).slice(2)}`,
    });
    cur.setMonth(cur.getMonth() + 3);
  }
  return out;
}

/**
 * Flow series (bills / pocket money / paid back) bucketed across the period,
 * plus the outstanding balance at the close of each bucket.
 *
 * The balance is deliberately computed from the FULL history, not the window -
 * it's a running total, so it has to count everything that came before.
 */
export function rangeSeries(ledger) {
  const { from, to } = ledger.period;
  const start = from || ledger.earliestDate || to;
  const { granularity, buckets } = bucketsFor(start, to);

  const within = (rows, b) => rows.filter(r => r.date >= b.start && r.date <= b.end);
  const upToEnd = (rows, b) => rows.reduce((t, r) => (r.date <= b.end ? t + Number(r.amount) : t), 0);

  return {
    granularity,
    labels: buckets.map(b => b.label),
    bills: buckets.map(b => sum(within(ledger.bills, b))),
    paid: buckets.map(b => sum(within(ledger.payments, b))),
    pocket: buckets.map(b => sum(within(ledger.pocketMoney, b))),
    balance: buckets.map(b => Math.max(0, upToEnd(ledger.bills, b) - upToEnd(ledger.payments, b))),
  };
}
