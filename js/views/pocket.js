/* Payer: pocket money.

   A separate track from bills - nothing here is ever "settled", it's just a
   record of allowance handed over. Kept on its own tab so it can never be
   confused with the reimbursement balance.
*/

import {
  state, fetchLedger, counterpartName,
  addPocketMoney, updatePocketMoney, deletePocketMoney,
} from '../store.js';
import { icon } from '../icons.js';
import {
  skeleton, errorBox, empty, tiles, tile, field, amountField, btn, pocketRow, sectionHead,
} from '../ui.js';
import {
  fmtMoney, escapeHtml, todayISO, monthKey, monthName, showToast, downloadCsv, on, sum,
} from '../util.js';

const $main = () => document.getElementById('main-content');

export async function renderPocket() {
  const root = $main();
  root.innerHTML = skeleton(3);

  let ledger;
  try {
    ledger = await fetchLedger({ asOf: todayISO() });
  } catch (err) {
    root.innerHTML = errorBox(err.message);
    return;
  }

  const who = counterpartName();
  const entries = ledger.pocketMoney;                 // newest first
  const thisMonthKey = monthKey(todayISO());
  const thisMonth = sum(entries.filter(e => monthKey(e.date) === thisMonthKey));
  const last = entries[0];

  root.innerHTML = `
    <div class="notice notice--info">
      ${icon('wallet', { size: 14 })} Pocket money is tracked separately from bills -
      it never counts towards what you owe ${escapeHtml(who)}.
    </div>

    ${tiles([
      tile({
        label: 'Given all time',
        swatch: 's2',
        value: fmtMoney(ledger.totals.pocket),
        foot: `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`,
      }),
      tile({
        label: `${monthName(thisMonthKey)} so far`,
        value: fmtMoney(thisMonth),
        foot: last ? `Last: ${fmtMoney(last.amount)}` : 'Nothing logged yet',
      }),
    ])}

    <div class="card">
      <div class="card__head"><p class="card__title">Log pocket money given</p></div>
      <form id="pocket-form" class="stack">
        ${field({ label: 'Amount', input: amountField({ name: 'amount' }) })}
        ${field({ label: 'Date', input: `<input type="date" name="date" required value="${todayISO()}" max="${todayISO()}" />` })}
        ${field({ label: 'Note (optional)', input: `<input type="text" name="note" maxlength="200" placeholder="e.g. Monthly allowance" />` })}
        <button type="submit" class="btn btn--block">${icon('plus', { size: 17 })}Add entry</button>
      </form>
    </div>

    ${sectionHead('History', entries.length
      ? `<button class="link-btn" id="export-pocket">Export CSV</button>` : '')}
    ${entries.length
      ? `<div class="list">${entries.map(e => pocketRow(e, { actions: actionsFor(e) })).join('')}</div>`
      : empty({
          icon: 'wallet',
          title: 'No pocket money logged yet',
          body: 'Add an entry each time you hand over allowance.',
        })}
  `;

  wire(root, entries);
}

function actionsFor(entry) {
  if (state.editing.pocket === entry.id) {
    return `
      <div class="stack" style="margin-top:10px">
        <div class="amount-input"><span>₹</span>
          <input type="number" step="0.01" min="0.01" class="edit-amount" value="${entry.amount}" /></div>
        <input type="date" class="edit-date" value="${entry.date}" max="${todayISO()}" />
        <input type="text" class="edit-note" maxlength="200" placeholder="Note (optional)" value="${escapeHtml(entry.note || '')}" />
        <div class="actions">
          ${btn('Save', { size: 'sm', icon: 'check', cls: 'save-pocket' })}
          ${btn('Cancel', { variant: 'chip', size: 'sm', cls: 'cancel-pocket' })}
        </div>
      </div>`;
  }
  return `
    <div class="actions">
      ${btn('Edit', { variant: 'chip', size: 'sm', icon: 'pencil', cls: 'edit-pocket' })}
      ${btn('Delete', { variant: 'danger', size: 'sm', icon: 'trash', cls: 'delete-pocket' })}
    </div>
  `;
}

function wire(root, entries) {
  root.querySelector('#pocket-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const amount = parseFloat(fd.get('amount'));
    const date = fd.get('date');
    const note = String(fd.get('note') || '').trim() || null;
    if (!amount || amount <= 0) return showToast('Enter a valid amount', true);

    try {
      await addPocketMoney({ amount, date, note });
      showToast('Logged');
      renderPocket();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  root.querySelector('#export-pocket')?.addEventListener('click', () => {
    downloadCsv(`pocket_money_${todayISO()}.csv`, ['Date', 'Amount', 'Note'],
      entries.map(e => [e.date, e.amount, e.note || '']));
  });

  on(root, '.edit-pocket', 'click', (e) => {
    state.editing.pocket = Number(e.currentTarget.closest('[data-id]').dataset.id);
    renderPocket();
  });
  on(root, '.cancel-pocket', 'click', () => {
    state.editing.pocket = null;
    renderPocket();
  });

  on(root, '.save-pocket', 'click', async (e) => {
    const card = e.currentTarget.closest('[data-id]');
    const amount = parseFloat(card.querySelector('.edit-amount').value);
    const date = card.querySelector('.edit-date').value;
    const note = card.querySelector('.edit-note').value.trim() || null;
    if (!amount || amount <= 0) return showToast('Enter a valid amount', true);

    try {
      await updatePocketMoney(card.dataset.id, { amount, date, note });
      state.editing.pocket = null;
      showToast('Updated');
      renderPocket();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  on(root, '.delete-pocket', 'click', async (e) => {
    if (!confirm('Delete this pocket money entry?')) return;
    const card = e.currentTarget.closest('[data-id]');
    try {
      await deletePocketMoney(card.dataset.id);
      showToast('Deleted');
      renderPocket();
    } catch (err) {
      showToast(err.message, true);
    }
  });
}
