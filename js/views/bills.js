/* The bills list - shared by both roles.

   Every row now carries its derived payment status, so "which bills are paid"
   is answerable by scrolling rather than by arithmetic. The status chips at
   the top are also the landing target for the dashboard's breakdown card.
*/

import {
  state, isPayer, fetchLedger, signReceipts, nameOf,
  updateBill, deleteBill,
} from '../store.js';
import { STATUS } from '../ledger.js';
import { icon } from '../icons.js';
import { skeleton, errorBox, empty, billRow, tiles, tile, btn } from '../ui.js';
import {
  fmtMoney, escapeHtml, todayISO, downloadCsv, showToast, on, openLightbox, sum,
} from '../util.js';

const $main = () => document.getElementById('main-content');

const STATUS_CHIPS = [
  { key: '', label: 'All' },
  { key: 'unpaid', label: 'Awaiting' },
  { key: 'partial', label: 'Part paid' },
  { key: 'paid', label: 'Paid' },
];

export async function renderBills() {
  const root = $main();
  root.innerHTML = skeleton(4);

  let ledger;
  try {
    ledger = await fetchLedger({ asOf: todayISO() });
  } catch (err) {
    root.innerHTML = errorBox(err.message);
    return;
  }

  const payer = isPayer();
  const f = state.filters;
  const all = ledger.billsNewestFirst;
  const items = all.filter(bill => matches(bill, f));
  const signedUrls = await signReceipts(items.map(i => i.image_path));

  const filtersActive = Boolean(f.search || f.from || f.to || f.uploader || f.status);
  const shownTotal = sum(items);
  const shownOutstanding = items.reduce((t, b) => t + b.remaining, 0);

  root.innerHTML = `
    ${filterCard(f, payer, filtersActive)}
    ${summaryCard({ items, shownTotal, shownOutstanding, filtersActive })}
    ${items.length
      ? `<div class="list">${items.map(b => billRow(b, {
          signedUrls,
          uploaderName: payer ? nameOf(b.uploaded_by) : '',
          actions: actionsFor(b, payer),
        })).join('')}</div>`
      : empty({
          icon: filtersActive ? 'search' : 'receipt',
          title: filtersActive ? 'Nothing matches those filters' : 'No bills yet',
          body: filtersActive
            ? 'Try widening the date range or clearing the search.'
            : (payer ? 'Bills your brother submits will appear here.' : 'Bills you submit will appear here.'),
        })}
  `;

  wire(root, ledger, items, payer);
}

/* --------------------------------------------------------------- pieces --- */

function matches(bill, f) {
  if (f.search && !bill.description.toLowerCase().includes(f.search.toLowerCase())) return false;
  if (f.from && bill.date < f.from) return false;
  if (f.to && bill.date > f.to) return false;
  if (f.uploader && bill.uploaded_by !== f.uploader) return false;
  if (f.status && bill.status !== f.status) return false;
  return true;
}

function filterCard(f, payer, filtersActive) {
  const uploaderOptions = payer
    ? Object.entries(state.names).map(([id, name]) =>
        `<option value="${id}" ${f.uploader === id ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')
    : '';

  return `
    <div class="card stack">
      <div class="chip-row">
        ${STATUS_CHIPS.map(c => `
          <button type="button" class="chip ${f.status === c.key ? 'is-on' : ''}" data-status="${c.key}">
            ${c.key ? icon(STATUS[c.key].icon, { size: 12 }) : ''} ${escapeHtml(c.label)}
          </button>
        `).join('')}
      </div>
      <input type="search" id="filter-search" placeholder="Search description..."
        value="${escapeHtml(f.search)}" />
      <div class="row">
        <label class="grow"><span class="field__label">From</span>
          <input type="date" id="filter-from" value="${f.from}" max="${todayISO()}" /></label>
        <label class="grow"><span class="field__label">To</span>
          <input type="date" id="filter-to" value="${f.to}" max="${todayISO()}" /></label>
      </div>
      ${payer ? `<label><span class="field__label">Submitted by</span>
        <select id="filter-uploader"><option value="">Everyone</option>${uploaderOptions}</select></label>` : ''}
      ${filtersActive ? `<button class="link-btn" id="clear-filters">Clear all filters</button>` : ''}
    </div>
  `;
}

function summaryCard({ items, shownTotal, shownOutstanding, filtersActive }) {
  return `
    ${tiles([
      tile({
        label: filtersActive ? 'Matching bills' : 'All bills',
        value: String(items.length),
        foot: fmtMoney(shownTotal) + ' in total',
      }),
      tile({
        label: 'Still outstanding',
        value: fmtMoney(shownOutstanding),
        foot: shownOutstanding > 0 ? 'Across the bills shown' : 'Everything shown is paid',
      }),
    ])}
    <div class="row row--between" style="padding:0 2px">
      <span style="font-size:12px;color:var(--text-muted)">Newest first</span>
      ${btn('Export CSV', { variant: 'chip', size: 'sm', icon: 'download', id: 'export-bills' })}
    </div>
  `;
}

function actionsFor(bill, payer) {
  const canEdit = payer || bill.uploaded_by === state.user.id;
  if (!canEdit) return '';
  if (state.editing.bill === bill.id) return editForm(bill);
  return `
    <div class="actions">
      ${btn('Edit', { variant: 'chip', size: 'sm', icon: 'pencil', cls: 'edit-bill' })}
      ${btn('Delete', { variant: 'danger', size: 'sm', icon: 'trash', cls: 'delete-bill' })}
    </div>
  `;
}

function editForm(bill) {
  return `
    <div class="stack" style="margin-top:10px">
      <div class="amount-input"><span>₹</span>
        <input type="number" step="0.01" min="0.01" class="edit-amount" value="${bill.amount}" /></div>
      <input type="text" class="edit-description" maxlength="200" value="${escapeHtml(bill.description)}" />
      <input type="date" class="edit-date" value="${bill.date}" max="${todayISO()}" />
      <div class="actions">
        ${btn('Save', { size: 'sm', icon: 'check', cls: 'save-bill' })}
        ${btn('Cancel', { variant: 'chip', size: 'sm', cls: 'cancel-bill' })}
      </div>
    </div>
  `;
}

/* --------------------------------------------------------------- wiring --- */

function wire(root, ledger, items, payer) {
  const setFilter = (patch) => {
    state.filters = { ...state.filters, ...patch };
    renderBills();
  };

  on(root, '[data-status]', 'click', (e) => setFilter({ status: e.currentTarget.dataset.status }));
  root.querySelector('#filter-search')?.addEventListener('change', e => setFilter({ search: e.target.value.trim() }));
  root.querySelector('#filter-from')?.addEventListener('change', e => setFilter({ from: e.target.value }));
  root.querySelector('#filter-to')?.addEventListener('change', e => setFilter({ to: e.target.value }));
  root.querySelector('#filter-uploader')?.addEventListener('change', e => setFilter({ uploader: e.target.value }));
  root.querySelector('#clear-filters')?.addEventListener('click', () =>
    setFilter({ search: '', from: '', to: '', uploader: '', status: '' }));

  root.querySelector('#export-bills')?.addEventListener('click', () => {
    downloadCsv(
      `bills_${todayISO()}.csv`,
      ['Date', 'Description', 'Amount', 'Paid', 'Outstanding', 'Status', 'Cleared on', 'Submitted by'],
      items.map(b => [
        b.date, b.description, b.amount, b.paidAmount.toFixed(2), b.remaining.toFixed(2),
        STATUS[b.status].label, b.clearedOn || '', nameOf(b.uploaded_by),
      ])
    );
  });

  on(root, '.thumb', 'click', (e) => {
    if (e.currentTarget.tagName === 'IMG') openLightbox(e.currentTarget.src);
  });

  on(root, '.edit-bill', 'click', (e) => {
    state.editing.bill = Number(e.currentTarget.closest('[data-id]').dataset.id);
    renderBills();
  });
  on(root, '.cancel-bill', 'click', () => {
    state.editing.bill = null;
    renderBills();
  });

  on(root, '.save-bill', 'click', async (e) => {
    const card = e.currentTarget.closest('[data-id]');
    const amount = parseFloat(card.querySelector('.edit-amount').value);
    const description = card.querySelector('.edit-description').value.trim();
    const date = card.querySelector('.edit-date').value;

    if (!amount || amount <= 0) return showToast('Enter a valid amount', true);
    if (!description) return showToast('Description cannot be empty', true);

    try {
      await updateBill(card.dataset.id, { amount, description, date });
      state.editing.bill = null;
      showToast('Bill updated');
      renderBills();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  on(root, '.delete-bill', 'click', async (e) => {
    const card = e.currentTarget.closest('[data-id]');
    const bill = items.find(b => String(b.id) === card.dataset.id);
    const warning = bill && bill.paidAmount > 0
      ? `This bill already has ${fmtMoney(bill.paidAmount)} paid against it. Deleting it will re-apply that money to other bills. Continue?`
      : 'Delete this bill? This cannot be undone.';
    if (!confirm(warning)) return;

    try {
      await deleteBill(card.dataset.id);
      showToast('Deleted');
      renderBills();
    } catch (err) {
      showToast(err.message, true);
    }
  });
}
