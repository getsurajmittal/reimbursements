/* Payer: the audit log.

   Rows are written by database triggers, not by app code, so this is a record
   of what actually happened to the data - including changes made from the
   Supabase dashboard.
*/

import { fetchAuditLog, nameOf } from '../store.js';
import { icon } from '../icons.js';
import { skeleton, errorBox, empty, pill } from '../ui.js';
import { fmtMoney, fmtDate, fmtDateTime, escapeHtml, on } from '../util.js';

const $main = () => document.getElementById('main-content');

const TABLE_LABELS = {
  reimbursements: 'Bill',
  pocket_money: 'Pocket money',
  settlements: 'Payment',
};

const FIELD_LABELS = {
  amount: 'Amount',
  description: 'Description',
  date: 'Date',
  note: 'Note',
  image_path: 'Receipt photo',
};

const IGNORED_FIELDS = new Set(['id', 'created_at', 'uploaded_by', 'created_by']);

const ACTIONS = {
  insert: { label: 'Added', variant: 'paid', icon: 'plus' },
  update: { label: 'Edited', variant: 'partial', icon: 'pencil' },
  delete: { label: 'Deleted', variant: 'danger', icon: 'trash' },
};

const FILTERS = [
  { key: '', label: 'Everything' },
  { key: 'reimbursements', label: 'Bills' },
  { key: 'settlements', label: 'Payments' },
  { key: 'pocket_money', label: 'Pocket money' },
];

let tableFilter = '';

export async function renderActivity() {
  const root = $main();
  root.innerHTML = skeleton(4);

  let rows;
  try {
    rows = await fetchAuditLog(200);
  } catch (err) {
    root.innerHTML = errorBox(err.message);
    return;
  }

  const shown = tableFilter ? rows.filter(r => r.table_name === tableFilter) : rows;

  root.innerHTML = `
    <div class="card card--quiet">
      <p style="font-size:13px;color:var(--text-2)">
        Every add, edit and delete across bills, pocket money and payments - newest first.
        Recorded by the database itself, so nothing can slip past it.
      </p>
      <div class="chip-row" style="margin-top:10px">
        ${FILTERS.map(f => `<button type="button" class="chip ${tableFilter === f.key ? 'is-on' : ''}"
          data-table="${f.key}">${escapeHtml(f.label)}</button>`).join('')}
      </div>
    </div>

    ${shown.length
      ? `<div class="list">${shown.map(entryCard).join('')}</div>`
      : empty({
          icon: 'activity',
          title: tableFilter ? 'Nothing recorded for that yet' : 'No activity recorded yet',
          body: 'Changes made from now on will show up here.',
        })}

    ${rows.length === 200 ? `<p style="font-size:12px;color:var(--text-muted);text-align:center">
      Showing the most recent 200 changes.</p>` : ''}
  `;

  on(root, '[data-table]', 'click', (e) => {
    tableFilter = e.currentTarget.dataset.table;
    renderActivity();
  });
}

function entryCard(row) {
  const action = ACTIONS[row.action] || { label: row.action, variant: 'info', icon: 'activity' };
  const table = TABLE_LABELS[row.table_name] || row.table_name;

  let detail;
  if (row.action === 'insert') {
    detail = `<p style="font-size:13px;color:var(--text-2);margin-top:6px">${escapeHtml(summarize(row.new_data))}</p>`;
  } else if (row.action === 'delete') {
    detail = `<p style="font-size:13px;color:var(--text-2);margin-top:6px">${escapeHtml(summarize(row.old_data))}</p>`;
  } else {
    const changes = diff(row.old_data, row.new_data);
    detail = changes.length
      ? `<div class="stack-s" style="margin-top:6px">${changes.map(c => `
          <p style="font-size:13px;color:var(--text-2)">
            <span style="color:var(--text-muted)">${escapeHtml(FIELD_LABELS[c.field] || c.field)}:</span>
            <s style="color:var(--text-muted)">${escapeHtml(fmtValue(c.field, c.from))}</s>
            ${icon('arrowRight', { size: 11 })}
            <b>${escapeHtml(fmtValue(c.field, c.to))}</b>
          </p>`).join('')}</div>`
      : `<p style="font-size:13px;color:var(--text-muted);margin-top:6px">No field changes recorded</p>`;
  }

  return `
    <article class="item">
      <div class="grow">
        <div class="row row--between">
          ${pill(`${action.label} · ${table}`, action.variant, action.icon)}
          <span class="timeline__when">${fmtDateTime(row.changed_at)}</span>
        </div>
        <p class="item__meta" style="margin-top:5px">by ${escapeHtml(nameOf(row.changed_by))}</p>
        ${detail}
      </div>
    </article>
  `;
}

function summarize(data) {
  if (!data) return '';
  const bits = [];
  if (data.amount != null) bits.push(fmtMoney(data.amount));
  if (data.description) bits.push(data.description);
  else if (data.note) bits.push(data.note);
  if (data.date) bits.push(fmtDate(data.date));
  return bits.join(' · ');
}

function diff(oldData, newData) {
  const fields = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);
  const changes = [];
  fields.forEach(field => {
    if (IGNORED_FIELDS.has(field)) return;
    const from = oldData ? oldData[field] : undefined;
    const to = newData ? newData[field] : undefined;
    if (String(from ?? '') !== String(to ?? '')) changes.push({ field, from, to });
  });
  return changes;
}

function fmtValue(field, val) {
  if (val == null || val === '') return '-';
  if (field === 'amount') return fmtMoney(val);
  if (field === 'date') return fmtDate(val);
  if (field === 'image_path') return 'attached';
  return String(val);
}
