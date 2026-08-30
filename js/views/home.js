/* The dashboard, for both roles.

   Payer and payee see the *same ledger* from opposite sides, so this is one
   view with two sets of copy rather than two screens that can drift apart.
   The payee side answers, in order: how much am I owed, how much of what I
   submitted has been cleared, which bills are still open, what was the last
   payment and what did it cover.

   The page opens on the current month. The period bar at the top rescopes the
   FLOW figures (bills submitted, paid back, pocket money, the bill breakdown,
   the charts). The balance card does NOT rescope - it's a running total, so it
   stays cumulative and is labelled "as at" the end of the period instead. See
   the header comment in js/ledger.js for why that distinction matters.
*/

import { state, isPayer, fetchLedger, counterpartName, signReceipts } from '../store.js';
import { go } from '../router.js';
import { rangeSeries } from '../ledger.js';
import { PRESETS, periodFromPreset, matchPreset, periodLabel } from '../period.js';
import { flowChart, flowLegend, balanceChart } from '../charts.js';
import { icon } from '../icons.js';
import {
  skeleton, errorBox, hero, tile, tiles, sectionHead, empty, billRow, statusPill, fillThumbs,
} from '../ui.js';
import {
  fmtMoney, fmtDate, fmtMoneyShort, escapeHtml, relativeDays, todayISO, on,
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
    netUp: 'added to what you owe',
    netDown: 'paid down',
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
    netUp: 'added to what you are owed',
    netDown: 'cleared',
  },
};

export async function renderHome() {
  const root = $main();
  root.innerHTML = skeleton(4);

  let ledger;
  try {
    ledger = await fetchLedger({ from: state.period.from, to: state.period.to });
  } catch (err) {
    root.innerHTML = errorBox(err.message);
    return;
  }

  const payer = isPayer();
  const copy = payer ? COPY.payer : COPY.brother;
  const who = counterpartName();
  const settled = ledger.totals.outstanding <= 0;
  const label = periodLabel(state.period);
  const recent = ledger.periodBillsNewestFirst.slice(0, 3);

  root.innerHTML = [
    periodBar(),
    heroCard({ ledger, copy, who, settled }),
    payer && !settled ? primaryCta(copy, ledger.totals) : '',
    periodTiles({ ledger, copy, label }),
    billBreakdown({ ledger, payer, label }),
    oldestOpenCard({ ledger, payer, who }),
    lastPaymentCard({ ledger, copy }),
    balanceCard(copy),
    flowCard(label),
    recentBillsCard({ ledger, payer, label, recent }),
  ].filter(Boolean).join('');

  wireUp(payer);
  drawCharts(ledger);
  hydrateReceipts(root, recent);
}

/** Receipt photos need short-lived signed URLs, so they arrive after paint. */
async function hydrateReceipts(root, bills) {
  const withPhotos = bills.filter(b => b.image_path);
  if (!withPhotos.length) return;
  try {
    const urls = await signReceipts(withPhotos.map(b => b.image_path));
    fillThumbs(root, withPhotos, urls);
  } catch {
    // A photo that won't load is not worth breaking the dashboard over -
    // the placeholder stays and the bill is still fully readable.
  }
}

/* ---------------------------------------------------------- period bar --- */

function periodBar() {
  const { from, to } = state.period;
  const active = matchPreset(from, to);

  return `
    <div class="card period">
      <div class="row row--between">
        <div class="grow">
          <p class="period__label">Showing</p>
          <p class="period__value">${escapeHtml(periodLabel(state.period))}</p>
        </div>
        <span class="period__icon">${icon('calendar', { size: 18 })}</span>
      </div>

      <div class="chip-row" style="margin-top:12px">
        ${PRESETS.map(p => `
          <button type="button" class="chip ${active === p.key ? 'is-on' : ''}" data-preset="${p.key}">
            ${escapeHtml(p.label)}
          </button>`).join('')}
      </div>

      <div class="row" style="margin-top:10px">
        <label class="grow">
          <span class="field__label">Start</span>
          <input type="date" id="period-from" value="${from || ''}" max="${to}" />
        </label>
        <label class="grow">
          <span class="field__label">End</span>
          <input type="date" id="period-to" value="${to}" max="${todayISO()}" />
        </label>
      </div>
      ${active === 'custom'
        ? `<button class="link-btn" id="period-reset" style="margin-top:10px">Back to this month</button>`
        : ''}
    </div>
  `;
}

/* ----------------------------------------------------------- sections --- */

/** The balance is a running total, so it is never scoped to the period. */
function heroCard({ ledger, copy, who, settled }) {
  const { totals } = ledger;
  const asAt = state.period.to === todayISO() ? '' : ` as at ${fmtDate(state.period.to)}`;

  if (settled) {
    const note = totals.credit > 0
      ? copy.creditNote(fmtMoney(totals.credit))
      : copy.heroSettledNote(who);
    return hero({
      label: copy.heroSettled + asAt,
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
    label: copy.heroLabel(who) + asAt,
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

/** Flow figures - these DO belong to the period. */
function periodTiles({ ledger, copy, label }) {
  const p = ledger.periodTotals;
  const net = p.net;
  const netFoot = Math.abs(net) < 0.005
    ? 'No change in this period'
    : net > 0
      ? `${fmtMoneyShort(net)} ${copy.netUp}`
      : `${fmtMoneyShort(Math.abs(net))} ${copy.netDown}`;

  return `
    ${sectionHead(label)}
    ${tiles([
      tile({
        label: copy.submitted,
        swatch: 's1',
        value: fmtMoney(p.billed),
        foot: `${p.billCount} bill${p.billCount === 1 ? '' : 's'} in this period`,
      }),
      tile({
        label: copy.paidBack,
        swatch: 's3',
        value: fmtMoney(p.paid),
        foot: `${p.paymentCount} payment${p.paymentCount === 1 ? '' : 's'}`,
      }),
      tile({
        label: copy.pocket,
        swatch: 's2',
        value: fmtMoney(p.pocket),
        foot: 'Separate from bills',
      }),
      tile({
        label: 'Net change',
        value: `${net > 0 ? '+' : net < 0 ? '-' : ''}${fmtMoney(Math.abs(net))}`,
        foot: netFoot,
        tone: net > 0 ? 'warn-ink' : net < 0 ? 'good-ink' : '',
      }),
    ])}
  `;
}

/** The direct answer to "which of these bills are paid?" - counts you can tap. */
function billBreakdown({ ledger, payer, label }) {
  if (!ledger.periodBills.length) return '';
  const c = ledger.periodCounts;
  const title = state.period.from ? `Bills in ${label}` : 'All bills';

  const rows = [
    { key: 'paid', n: c.paid, label: 'Fully paid' },
    { key: 'partial', n: c.partial, label: 'Partly paid' },
    { key: 'unpaid', n: c.unpaid, label: payer ? 'Not yet paid' : 'Awaiting payment' },
  ];

  return `
    <div class="card">
      <div class="card__head">
        <div>
          <p class="card__title">${escapeHtml(title)}</p>
          <p class="card__sub">Payments are applied oldest bill first</p>
        </div>
        <button class="link-btn" data-goto-bills="">See all${icon('arrowRight', { size: 12 })}</button>
      </div>
      <div class="stack-s">
        ${rows.map(r => `
          <button type="button" class="row row--between breakdown-row" data-status-filter="${r.key}">
            <span class="row" style="gap:8px">${statusPill(r.key)}<span style="font-size:13px;color:var(--text-2)">${r.label}</span></span>
            <span class="row" style="gap:6px">
              <b class="money" style="font-size:15px">${r.n}</b>
              ${icon('arrowRight', { size: 13 })}
            </span>
          </button>`).join('')}
      </div>
      ${ledger.periodTotals.stillOpen > 0.005 ? `
        <p class="card__sub" style="margin-top:10px">
          ${fmtMoney(ledger.periodTotals.stillOpen)} of these is still outstanding.
        </p>` : ''}
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
    <div class="card card--flag" style="--flag:var(--warn)">
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

function lastPaymentCard({ ledger, copy }) {
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
      ${covered ? `<ul class="covers" style="list-style:none;padding:8px 0 0;margin:8px 0 0">
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
          <p class="card__sub" id="balance-sub">Running balance across the period</p>
        </div>
      </div>
      <div class="chart-wrap"><canvas id="balance-chart"></canvas></div>
    </div>
  `;
}

function flowCard(label) {
  return `
    <div class="card">
      <div class="card__head">
        <div>
          <p class="card__title">Broken down</p>
          <p class="card__sub" id="flow-sub">${escapeHtml(label)}</p>
        </div>
        <button class="link-btn" id="toggle-table">Show numbers</button>
      </div>
      <div class="chart-wrap"><canvas id="flow-chart"></canvas></div>
      ${flowLegend()}
      <div id="flow-table" hidden></div>
    </div>
  `;
}

function recentBillsCard({ ledger, payer, label, recent }) {
  if (!recent.length) {
    const anyEver = ledger.bills.length > 0;
    return empty({
      icon: 'receipt',
      title: anyEver
        ? `No bills in ${label}`
        : (payer ? 'No bills submitted yet' : 'You have not submitted a bill yet'),
      body: anyEver
        ? 'Try a wider period, or All time, to see earlier bills.'
        : (payer
            ? 'Bills your brother submits will show up here with their payment status.'
            : 'Add your first bill and you will see exactly what has been paid and what is still owed.'),
      action: anyEver
        ? `<button type="button" class="btn btn--sm btn--chip" data-preset="all">Show all time</button>`
        : (payer ? '' : `<button type="button" class="btn btn--sm" data-goto-add="">Add a bill</button>`),
    });
  }

  return `
    ${sectionHead('Latest bills', `<button class="link-btn" data-goto-bills="">See all${icon('arrowRight', { size: 12 })}</button>`)}
    <div class="list">
      ${recent.map(b => billRow(b, { showCovers: false })).join('')}
    </div>
  `;
}

/* --------------------------------------------------------------- wiring --- */

function setPeriod(next) {
  state.period = next;
  // Keep the Bills tab in step, so a count here and the list there always agree.
  state.filters = { ...state.filters, from: next.from || '', to: next.to };
  renderHome();
}

function wireUp(payer) {
  const root = $main();

  on(root, '[data-preset]', 'click', (e) => setPeriod(periodFromPreset(e.currentTarget.dataset.preset)));
  root.querySelector('#period-reset')?.addEventListener('click', () => setPeriod(periodFromPreset('this-month')));

  const fromEl = root.querySelector('#period-from');
  const toEl = root.querySelector('#period-to');
  const applyDates = () => {
    const from = fromEl.value || null;
    let to = toEl.value || todayISO();
    if (from && to < from) to = from; // a backwards range would silently show nothing
    setPeriod({ key: 'custom', from, to });
  };
  fromEl?.addEventListener('change', applyDates);
  toEl?.addEventListener('change', applyDates);

  document.getElementById('cta-settle')?.addEventListener('click', () => go('settle'));

  on(root, '[data-goto-bills]', 'click', () => go('bills', { filters: { status: '' } }));
  on(root, '[data-goto-add]', 'click', () => go('add'));
  on(root, '[data-goto-payments]', 'click', () => go(payer ? 'settle' : 'received'));
  on(root, '[data-status-filter]', 'click', (e) => {
    go('bills', { filters: { status: e.currentTarget.dataset.statusFilter } });
  });

  const toggle = root.querySelector('#toggle-table');
  toggle?.addEventListener('click', () => {
    const table = root.querySelector('#flow-table');
    const showing = !table.hidden;
    table.hidden = showing;
    toggle.textContent = showing ? 'Show numbers' : 'Hide numbers';
  });
}

const GRAIN_WORD = { week: 'week', month: 'month', quarter: 'quarter' };

function drawCharts(ledger) {
  const series = rangeSeries(ledger);
  flowChart('flow-chart', series);
  balanceChart('balance-chart', series.labels, series.balance);

  const grain = GRAIN_WORD[series.granularity] || 'period';
  const flowSub = document.getElementById('flow-sub');
  if (flowSub) flowSub.textContent = `By ${grain}, across the selected period`;
  const balanceSub = document.getElementById('balance-sub');
  if (balanceSub) balanceSub.textContent = `Outstanding at the close of each ${grain}`;

  // The table view is the text relief for the chart's lower-contrast series.
  const table = document.getElementById('flow-table');
  if (table) table.innerHTML = flowTable(series, grain);
}

function flowTable(series, grain) {
  return `
    <div class="table-scroll">
      <table class="datatable">
        <thead>
          <tr>
            <th>${grain.charAt(0).toUpperCase() + grain.slice(1)}</th>
            <th>Bills</th><th>Pocket money</th><th>Paid back</th><th>Balance</th>
          </tr>
        </thead>
        <tbody>
          ${series.labels.map((l, i) => `
            <tr>
              <td>${escapeHtml(l)}</td>
              <td>${fmtMoney(series.bills[i])}</td>
              <td>${fmtMoney(series.pocket[i])}</td>
              <td>${fmtMoney(series.paid[i])}</td>
              <td>${fmtMoney(series.balance[i])}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}
