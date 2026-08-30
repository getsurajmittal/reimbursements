/* The dashboard, for both roles.

   Payer and payee see the *same ledger* from opposite sides, so this is one
   view with two sets of copy rather than two screens that can drift apart.
   The payee side answers, in order: how much am I owed, how much of what I
   submitted has been cleared, which bills are still open, what was the last
   payment and what did it cover.
*/

import { state, isPayer, fetchLedger, counterpartName } from '../store.js';
import { go } from '../router.js';
import { monthlySeries, balanceSeries, monthTotals } from '../ledger.js';
import { monthlyChart, monthlyLegend, balanceChart } from '../charts.js';
import { icon } from '../icons.js';
import {
  skeleton, errorBox, hero, tile, tiles, sectionHead, empty, billRow, statusPill,
} from '../ui.js';
import {
  fmtMoney, fmtDate, fmtMoneyShort, escapeHtml, monthKey, monthLabel,
  relativeDays, todayISO, on, monthName,
} from '../util.js';

const $main = () => document.getElementById('main-content');

const COPY = {
  payer: {
    heroLabel: (who) => `You owe ${who}`,
    heroSettled: 'All settled up',
    heroSettledNote: (who) => `Nothing outstanding with ${who} right now.`,
    submitted: 'Bills submitted',
    paidBack: 'Paid back',
    pocket: 'Pocket money given',
    balanceTitle: 'What you owe, over time',
    meterDone: 'Paid off',
    meterLeft: 'Still owed',
    openHint: (n, days) => `${n} bill${n === 1 ? '' : 's'} still open · oldest waiting ${days} day${days === 1 ? '' : 's'}`,
    lastPayment: 'Your last payment',
    ctaLabel: (amt) => `Settle up - ${amt} owed`,
    creditNote: (amt) => `You're ${amt} ahead - that's credit against future bills.`,
  },
  brother: {
    heroLabel: () => "You're owed",
    heroSettled: "You're fully paid up",
    heroSettledNote: (who) => `${who} has cleared every bill you've submitted.`,
    submitted: 'You submitted',
    paidBack: 'Received back',
    pocket: 'Pocket money received',
    balanceTitle: "What you're owed, over time",
    meterDone: 'Received',
    meterLeft: 'Still owed to you',
    openHint: (n, days) => `${n} bill${n === 1 ? '' : 's'} awaiting payment · oldest submitted ${days} day${days === 1 ? '' : 's'} ago`,
    lastPayment: 'Last payment received',
    ctaLabel: () => 'See what you submitted',
    creditNote: (amt) => `You've been paid ${amt} more than you've billed - it counts against your next bills.`,
  },
};

export async function renderHome() {
  const root = $main();
  root.innerHTML = skeleton(4);

  let ledger;
  try {
    ledger = await fetchLedger({ asOf: state.asOf });
  } catch (err) {
    root.innerHTML = errorBox(err.message);
    return;
  }

  const payer = isPayer();
  const copy = payer ? COPY.payer : COPY.brother;
  const who = counterpartName();
  const { totals, counts } = ledger;
  const thisMonth = monthTotals(ledger, monthKey(state.asOf));
  const settled = totals.outstanding <= 0;
  const historical = state.asOf !== todayISO();

  root.innerHTML = [
    historical ? asOfBanner() : '',
    heroCard({ ledger, copy, who, settled, payer }),
    payer && !settled ? primaryCta(copy, totals) : '',
    statTiles({ ledger, copy, thisMonth, payer }),
    billBreakdown({ counts, ledger, payer }),
    oldestOpenCard({ ledger, payer, who }),
    lastPaymentCard({ ledger, copy, payer }),
    balanceCard(copy),
    monthlyCard(),
    recentBillsCard({ ledger, payer }),
    asOfCard(),
  ].filter(Boolean).join('');

  wireUp(ledger, payer);
  drawCharts(ledger);
}

/* ------------------------------------------------------------- sections --- */

function asOfBanner() {
  return `<div class="notice notice--info">
    ${icon('calendar', { size: 14 })} Showing the ledger as it stood on
    <b>${fmtDate(state.asOf)}</b>. <button class="link-btn" id="reset-asof">Back to today</button>
  </div>`;
}

function heroCard({ ledger, copy, who, settled, payer }) {
  const { totals } = ledger;

  if (settled) {
    const note = totals.credit > 0
      ? copy.creditNote(fmtMoney(totals.credit))
      : copy.heroSettledNote(who);
    return hero({
      label: copy.heroSettled,
      value: totals.credit > 0 ? `+${fmtMoney(totals.credit)}` : fmtMoney(0),
      tone: 'settled',
      note: escapeHtml(note),
      meter: totals.billed > 0
        ? { done: totals.billed, total: totals.billed, doneLabel: copy.meterDone, leftLabel: copy.meterLeft }
        : null,
    });
  }

  const note = ledger.openBillCount
    ? copy.openHint(ledger.openBillCount, ledger.oldestOpenAgeDays)
    : '';

  return hero({
    label: copy.heroLabel(who),
    value: fmtMoney(totals.outstanding),
    tone: 'owed',
    note: escapeHtml(note),
    meter: {
      done: Math.min(totals.paid, totals.billed),
      total: totals.billed,
      doneLabel: copy.meterDone,
      leftLabel: copy.meterLeft,
    },
  });
}

function primaryCta(copy, totals) {
  return `<button type="button" class="btn btn--block" id="cta-settle">
    ${icon('handCoins', { size: 17 })}${escapeHtml(copy.ctaLabel(fmtMoney(totals.outstanding)))}
  </button>`;
}

function statTiles({ ledger, copy, thisMonth, payer }) {
  const { totals, counts, bills } = ledger;
  const month = monthName(monthKey(state.asOf));

  return tiles([
    tile({
      label: copy.submitted,
      swatch: 's1',
      value: fmtMoney(totals.billed),
      foot: `${bills.length} bill${bills.length === 1 ? '' : 's'} all time`,
    }),
    tile({
      label: copy.paidBack,
      swatch: 's3',
      value: fmtMoney(totals.paid),
      foot: `${counts.paid} bill${counts.paid === 1 ? '' : 's'} fully cleared`,
    }),
    tile({
      label: copy.pocket,
      swatch: 's2',
      value: fmtMoney(totals.pocket),
      foot: 'Separate from bills',
    }),
    tile({
      label: `${month} bills`,
      value: fmtMoney(thisMonth.bills),
      foot: `${thisMonth.billCount} this month · ${fmtMoneyShort(thisMonth.paid)} paid back`,
    }),
  ]);
}

/** The direct answer to "which of my bills are paid?" - counts you can tap. */
function billBreakdown({ counts, ledger, payer }) {
  if (!ledger.bills.length) return '';

  const rows = [
    { key: 'paid', n: counts.paid, label: 'Fully paid' },
    { key: 'partial', n: counts.partial, label: 'Partly paid' },
    { key: 'unpaid', n: counts.unpaid, label: payer ? 'Not yet paid' : 'Awaiting payment' },
  ];

  return `
    <div class="card">
      <div class="card__head">
        <div>
          <p class="card__title">Bill status</p>
          <p class="card__sub">Payments are applied oldest bill first</p>
        </div>
        <button class="link-btn" data-goto-bills="">See all${icon('arrowRight', { size: 12 })}</button>
      </div>
      <div class="stack-s">
        ${rows.map(r => `
          <button type="button" class="row row--between" data-status-filter="${r.key}"
            style="width:100%;background:none;border:none;padding:6px 2px;cursor:pointer;text-align:left">
            <span class="row" style="gap:8px">${statusPill(r.key)}<span style="font-size:13px;color:var(--text-2)">${r.label}</span></span>
            <span class="row" style="gap:6px">
              <b class="money" style="font-size:15px">${r.n}</b>
              ${icon('arrowRight', { size: 13 })}
            </span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function oldestOpenCard({ ledger, payer, who }) {
  const bill = ledger.oldestOpen;
  if (!bill) return '';
  const days = ledger.oldestOpenAgeDays;
  if (days < 7) return '';

  const text = payer
    ? `${escapeHtml(bill.description)} has been waiting ${days} days. It's the next thing your payment will clear.`
    : `${escapeHtml(bill.description)} has been open ${days} days - it's first in line for ${escapeHtml(who)}'s next payment.`;

  return `
    <div class="card" style="border-left:3px solid var(--warn)">
      <div class="row" style="align-items:flex-start;gap:10px">
        <span style="color:var(--warn-ink);flex:0 0 auto">${icon('clock', { size: 18 })}</span>
        <div class="grow">
          <p class="card__title">Oldest open bill</p>
          <p style="font-size:13px;color:var(--text-2);margin-top:4px">${text}</p>
          <p class="item__meta">${fmtDate(bill.date)} · ${fmtMoney(bill.remaining)} outstanding</p>
        </div>
      </div>
    </div>
  `;
}

function lastPaymentCard({ ledger, copy, payer }) {
  const pay = ledger.lastPayment;
  if (!pay) return '';

  const covered = pay.covers.length;
  const detail = covered
    ? `It cleared ${covered} bill${covered === 1 ? '' : 's'}${pay.unapplied > 0 ? `, with ${fmtMoney(pay.unapplied)} left as credit` : ''}.`
    : 'It was held as credit against future bills.';

  return `
    <div class="card">
      <div class="card__head">
        <p class="card__title">${escapeHtml(copy.lastPayment)}</p>
        <button class="link-btn" data-goto-payments="">All payments${icon('arrowRight', { size: 12 })}</button>
      </div>
      <div class="row row--between">
        <div>
          <p class="hero__value" style="font-size:24px;color:var(--good-ink)">${fmtMoney(pay.amount)}</p>
          <p class="item__meta">${fmtDate(pay.date)} · ${relativeDays(pay.date)}${pay.note ? ` · ${escapeHtml(pay.note)}` : ''}</p>
        </div>
        <span style="color:var(--good)">${icon('checkCircle', { size: 26 })}</span>
      </div>
      <p style="font-size:12.5px;color:var(--text-2);margin-top:8px">${detail}</p>
      ${covered ? `<ul class="covers" style="border-top:1px solid var(--border);list-style:none;padding:8px 0 0;margin:8px 0 0">
        ${pay.covers.slice(0, 4).map(c => `
          <li class="row row--between" style="padding:2px 0">
            <span class="truncate" style="max-width:70%">${escapeHtml(c.description)}</span>
            <span class="money">${fmtMoney(c.amount)}</span>
          </li>`).join('')}
        ${covered > 4 ? `<li style="color:var(--text-muted);padding-top:3px">+${covered - 4} more</li>` : ''}
      </ul>` : ''}
    </div>
  `;
}

function balanceCard(copy) {
  return `
    <div class="card">
      <div class="card__head">
        <div>
          <p class="card__title">${escapeHtml(copy.balanceTitle)}</p>
          <p class="card__sub">Balance at each month's close, last 6 months</p>
        </div>
      </div>
      <div class="chart-wrap"><canvas id="balance-chart"></canvas></div>
    </div>
  `;
}

function monthlyCard() {
  return `
    <div class="card">
      <div class="card__head">
        <div>
          <p class="card__title">Month by month</p>
          <p class="card__sub">Last 6 months, side by side</p>
        </div>
        <button class="link-btn" id="toggle-table">Show numbers</button>
      </div>
      <div class="chart-wrap"><canvas id="monthly-chart"></canvas></div>
      ${monthlyLegend()}
      <div id="monthly-table" hidden></div>
    </div>
  `;
}

function recentBillsCard({ ledger, payer }) {
  const recent = ledger.billsNewestFirst.slice(0, 3);
  if (!recent.length) {
    return empty({
      icon: 'receipt',
      title: payer ? 'No bills submitted yet' : 'You have not submitted a bill yet',
      body: payer
        ? 'Bills your brother submits will show up here with their payment status.'
        : 'Add your first bill and you will see exactly what has been paid and what is still owed.',
      action: payer ? '' : `<button type="button" class="btn btn--sm" data-goto-add="">Add a bill</button>`,
    });
  }

  return `
    ${sectionHead('Recent bills', `<button class="link-btn" data-goto-bills="">See all${icon('arrowRight', { size: 12 })}</button>`)}
    <div class="list">
      ${recent.map(b => billRow(b, { showCovers: false })).join('')}
    </div>
  `;
}

function asOfCard() {
  return `
    <details class="card card--quiet">
      <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--text-2)">
        Time travel - view the ledger as of a past date
      </summary>
      <div style="margin-top:10px">
        <input type="date" id="as-of-input" value="${state.asOf}" max="${todayISO()}" />
        <p class="field__hint">Every figure above is recalculated as if today were that date.</p>
      </div>
    </details>
  `;
}

/* --------------------------------------------------------------- wiring --- */

function wireUp(ledger, payer) {
  const root = $main();

  document.getElementById('cta-settle')?.addEventListener('click', () => go('settle'));
  document.getElementById('reset-asof')?.addEventListener('click', () => {
    state.asOf = todayISO();
    renderHome();
  });
  document.getElementById('as-of-input')?.addEventListener('change', (e) => {
    state.asOf = e.target.value || todayISO();
    renderHome();
  });

  on(root, '[data-goto-bills]', 'click', () => go('bills', { filters: { status: '' } }));
  on(root, '[data-goto-add]', 'click', () => go('add'));
  on(root, '[data-goto-payments]', 'click', () => go(payer ? 'settle' : 'received'));
  on(root, '[data-status-filter]', 'click', (e) => {
    const status = e.currentTarget.dataset.statusFilter;
    go('bills', { filters: { status } });
  });

  const toggle = document.getElementById('toggle-table');
  toggle?.addEventListener('click', () => {
    const table = document.getElementById('monthly-table');
    const showing = !table.hidden;
    table.hidden = showing;
    toggle.textContent = showing ? 'Show numbers' : 'Hide numbers';
  });
}

function drawCharts(ledger) {
  const series = monthlySeries(ledger, 6);
  monthlyChart('monthly-chart', series);
  balanceChart('balance-chart', series.keys, balanceSeries(ledger, 6));

  // The table view is the text relief for the chart's lower-contrast series.
  const table = document.getElementById('monthly-table');
  if (table) table.innerHTML = monthlyTable(series);
}

function monthlyTable(series) {
  return `
    <div class="table-scroll">
      <table class="datatable">
        <thead>
          <tr><th>Month</th><th>Bills</th><th>Pocket money</th><th>Paid back</th></tr>
        </thead>
        <tbody>
          ${series.keys.map((k, i) => `
            <tr>
              <td>${monthLabel(k)}</td>
              <td>${fmtMoney(series.bills[i])}</td>
              <td>${fmtMoney(series.pocket[i])}</td>
              <td>${fmtMoney(series.paid[i])}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
