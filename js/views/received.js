/* Payee: everything that came in.

   Read-only by design - the database only lets the payer write these rows.
   The point of the screen is transparency: every payment, what it cleared,
   and the pocket money that sits outside the bill ledger entirely.
*/

import { fetchLedger, counterpartName } from '../store.js';
import { go } from '../router.js';
import { icon } from '../icons.js';
import {
  skeleton, errorBox, empty, tiles, tile, sectionHead, paymentRow, pocketRow, btn,
} from '../ui.js';
import { fmtMoney, relativeDays, escapeHtml, todayISO, downloadCsv } from '../util.js';

const $main = () => document.getElementById('main-content');

export async function renderReceived() {
  const root = $main();
  root.innerHTML = skeleton(3);

  let ledger;
  try {
    ledger = await fetchLedger({ to: todayISO() });
  } catch (err) {
    root.innerHTML = errorBox(err.message);
    return;
  }

  const who = counterpartName();
  const { totals } = ledger;
  const payments = ledger.paymentsNewestFirst;
  const pocket = ledger.pocketMoney;
  const totalIn = totals.paid + totals.pocket;
  const last = ledger.lastPayment;

  root.innerHTML = `
    <div class="card">
      <p class="hero__label">Total received from ${escapeHtml(who)}</p>
      <p class="hero__value" style="color:var(--good-ink)">${fmtMoney(totalIn)}</p>
      <p class="hero__note">
        ${fmtMoney(totals.paid)} settling bills · ${fmtMoney(totals.pocket)} pocket money
      </p>
    </div>

    ${tiles([
      tile({
        label: 'Bill payments',
        swatch: 's3',
        value: fmtMoney(totals.paid),
        foot: `${payments.length} payment${payments.length === 1 ? '' : 's'}`,
      }),
      tile({
        label: 'Pocket money',
        swatch: 's2',
        value: fmtMoney(totals.pocket),
        foot: `${pocket.length} entr${pocket.length === 1 ? 'y' : 'ies'}`,
      }),
    ])}

    ${totals.outstanding > 0 ? `
      <div class="card" style="border-left:3px solid var(--warn)">
        <div class="row" style="align-items:flex-start">
          <span style="color:var(--warn-ink)">${icon('clock', { size: 18 })}</span>
          <div class="grow">
            <p class="card__title">${fmtMoney(totals.outstanding)} still owed to you</p>
            <p style="font-size:13px;color:var(--text-2);margin-top:3px">
              ${last ? `Last payment ${relativeDays(last.date)}.` : 'No payments received yet.'}
              Across ${ledger.openBillCount} open bill${ledger.openBillCount === 1 ? '' : 's'}.
            </p>
            <div class="actions">${btn('See open bills', { variant: 'chip', size: 'sm', id: 'goto-open' })}</div>
          </div>
        </div>
      </div>` : `
      <div class="card" style="border-left:3px solid var(--good)">
        <div class="row">
          <span style="color:var(--good)">${icon('checkCircle', { size: 18 })}</span>
          <div class="grow">
            <p class="card__title">Everything you submitted has been paid</p>
            <p style="font-size:13px;color:var(--text-2);margin-top:3px">Nothing outstanding right now.</p>
          </div>
        </div>
      </div>`}

    ${sectionHead('Payments towards bills', payments.length
      ? `<button class="link-btn" id="export-received">Export CSV</button>` : '')}
    ${payments.length
      ? `<div class="list">${payments.map(p => paymentRow(p)).join('')}</div>`
      : empty({
          icon: 'handCoins',
          title: 'No payments yet',
          body: `When ${who} settles up, each payment will appear here with the bills it cleared.`,
        })}

    ${sectionHead('Pocket money')}
    ${pocket.length
      ? `<div class="list">${pocket.map(p => pocketRow(p)).join('')}</div>`
      : empty({
          icon: 'wallet',
          title: 'No pocket money logged',
          body: 'Pocket money is tracked separately from bills - there is nothing to settle on it.',
        })}
  `;

  root.querySelector('#goto-open')?.addEventListener('click', () => go('bills', { filters: { status: 'unpaid' } }));
  root.querySelector('#export-received')?.addEventListener('click', () => {
    downloadCsv(
      `received_${todayISO()}.csv`,
      ['Date', 'Amount', 'Note', 'Bills cleared'],
      payments.map(p => [
        p.date, p.amount, p.note || '',
        p.covers.map(c => `${c.description} (${c.amount.toFixed(2)})`).join('; '),
      ])
    );
  });
}
