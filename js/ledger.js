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

   Everything downstream - status pills, progress bars, "this payment cleared
   3 bills", the oldest-unpaid warning - reads off this one function.
   =========================================================================== */

import { sum, todayISO, monthKey, recentMonthKeys, daysBetween } from './util.js';

/** Money compares need a tolerance: numeric(12,2) round-trips through floats. */
const EPS = 0.005;

const byDateAsc = (a, b) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : Number(a.id) - Number(b.id);

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
 * @param {string} [input.asOf]       ISO date; rows dated after it are ignored
 */
export function buildLedger({ bills = [], settlements = [], pocketMoney = [], asOf = todayISO() }) {
  const upTo = (rows) => rows.filter(r => r.date <= asOf);

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

  // --- FIFO allocation ----------------------------------------------------
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

  // --- Totals -------------------------------------------------------------
  const pocketRows = upTo(pocketMoney).map(p => ({ ...p, amount: Number(p.amount) }));
  const billed = sum(billRows);
  const paid = sum(payRows);
  const outstanding = Math.max(0, billed - paid);
  const credit = Math.max(0, paid - billed);

  const counts = { paid: 0, partial: 0, unpaid: 0 };
  billRows.forEach(b => { counts[b.status]++; });

  const openBills = billRows.filter(b => b.status !== 'paid');
  const oldestOpen = openBills[0] || null;

  return {
    asOf,
    bills: billRows,                              // oldest first
    billsNewestFirst: [...billRows].reverse(),
    payments: payRows,                            // oldest first
    paymentsNewestFirst: [...payRows].reverse(),
    pocketMoney: [...pocketRows].sort(byDateAsc).reverse(),
    totals: {
      billed,
      paid,
      outstanding,
      credit,
      pocket: sum(pocketRows),
      clearedPct: billed > 0 ? Math.min(100, (Math.min(paid, billed) / billed) * 100) : 0,
    },
    counts,
    openBillCount: openBills.length,
    oldestOpen,
    oldestOpenAgeDays: oldestOpen ? daysBetween(oldestOpen.date, asOf) : 0,
    lastPayment: payRows.length ? payRows[payRows.length - 1] : null,
    lastBill: billRows.length ? billRows[billRows.length - 1] : null,
  };
}

/**
 * Per-month totals for the grouped bar chart, oldest month first.
 * Returns { keys, bills, paid, pocket }.
 */
export function monthlySeries(ledger, months = 6) {
  const keys = recentMonthKeys(months, ledger.asOf);
  const bucket = (rows) => {
    const totals = Object.fromEntries(keys.map(k => [k, 0]));
    rows.forEach(r => {
      const k = monthKey(r.date);
      if (k in totals) totals[k] += Number(r.amount);
    });
    return keys.map(k => totals[k]);
  };
  return {
    keys,
    bills: bucket(ledger.bills),
    paid: bucket(ledger.payments),
    pocket: bucket(ledger.pocketMoney),
  };
}

/**
 * Outstanding balance at the close of each of the last `months` months -
 * a single series, so the balance line needs no legend.
 */
export function balanceSeries(ledger, months = 6) {
  const keys = recentMonthKeys(months, ledger.asOf);
  return keys.map(key => {
    const monthEnd = endOfMonth(key);
    const billed = sumUpTo(ledger.bills, monthEnd);
    const paid = sumUpTo(ledger.payments, monthEnd);
    return Math.max(0, billed - paid);
  });
}

function endOfMonth(key) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m, 0); // day 0 of next month = last day of this one
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sumUpTo(rows, dateISO) {
  return rows.reduce((t, r) => (r.date <= dateISO ? t + Number(r.amount) : t), 0);
}

/** Totals for a single calendar month, used by the "this month" tile. */
export function monthTotals(ledger, key) {
  const inMonth = (rows) => rows.filter(r => monthKey(r.date) === key);
  return {
    bills: sum(inMonth(ledger.bills)),
    paid: sum(inMonth(ledger.payments)),
    pocket: sum(inMonth(ledger.pocketMoney)),
    billCount: inMonth(ledger.bills).length,
  };
}
