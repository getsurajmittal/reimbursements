/* Payer: settle up.

   The form previews, live as you type, exactly which bills the amount you're
   entering will clear - so a partial payment stops being an abstract number
   off a total and becomes "this pays off the textbooks and half the groceries".
*/

import {
  state, fetchLedger, counterpartName,
  addPayment, updatePayment, deletePayment,
} from '../store.js';
import { icon } from '../icons.js';
import {
  skeleton, errorBox, empty, hero, field, amountField, btn, paymentRow, sectionHead,
} from '../ui.js';
import {
  fmtMoney, fmtDate, escapeHtml, todayISO, showToast, downloadCsv, on,
} from '../util.js';

const $main = () => document.getElementById('main-content');

export async function renderSettle() {
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
  const owed = totals.outstanding;
  const payments = ledger.paymentsNewestFirst;

  root.innerHTML = `
    ${hero({
      label: owed > 0 ? `You owe ${who}` : 'All settled up',
      value: fmtMoney(owed),
      tone: owed > 0 ? 'owed' : 'settled',
      note: owed > 0
        ? escapeHtml(`Across ${ledger.openBillCount} open bill${ledger.openBillCount === 1 ? '' : 's'}`)
        : escapeHtml(`Every bill ${who} submitted has been paid.`),
      meter: totals.billed > 0
        ? { done: Math.min(totals.paid, totals.billed), total: totals.billed, doneLabel: 'Paid off', leftLabel: 'Still owed' }
        : null,
    })}

    ${owed > 0 ? payForm(ledger, owed) : ''}

    ${sectionHead('Payment history', payments.length
      ? `<button class="link-btn" id="export-payments">Export CSV</button>` : '')}

    ${payments.length
      ? `<div class="list">${payments.map(p => paymentRow(p, { actions: actionsFor(p) })).join('')}</div>`
      : empty({
          icon: 'handCoins',
          title: 'No payments recorded yet',
          body: 'Once you record one, it will show here along with the bills it cleared.',
        })}
  `;

  wire(root, ledger, owed);
}

/* ---------------------------------------------------------------- form --- */

function payForm(ledger, owed) {
  const oldest = ledger.oldestOpen;
  const chips = [
    { label: `Pay all - ${fmtMoney(owed)}`, value: owed.toFixed(2) },
    oldest ? { label: `Oldest bill - ${fmtMoney(oldest.remaining)}`, value: oldest.remaining.toFixed(2) } : null,
    { label: `Half - ${fmtMoney(owed / 2)}`, value: (owed / 2).toFixed(2) },
  ].filter(Boolean);

  return `
    <div class="card">
      <div class="card__head">
        <div>
          <p class="card__title">Record a payment</p>
          <p class="card__sub">Full or partial - it comes off the oldest bills first</p>
        </div>
      </div>
      <form id="pay-form" class="stack">
        ${field({ label: 'Amount', input: amountField({ name: 'amount', value: owed.toFixed(2), max: owed }) })}
        <div class="chip-row">
          ${chips.map(c => `<button type="button" class="chip" data-amount="${c.value}">${escapeHtml(c.label)}</button>`).join('')}
        </div>

        <div id="pay-preview"></div>

        ${field({ label: 'Date', input: `<input type="date" name="date" required value="${todayISO()}" max="${todayISO()}" />` })}
        ${field({ label: 'Note (optional)', input: `<input type="text" name="note" maxlength="200" placeholder="e.g. Paid via UPI" />` })}
        <button type="submit" class="btn btn--block">${icon('handCoins', { size: 17 })}Record payment</button>
      </form>
    </div>
  `;
}

/**
 * What `amount` would clear, using the same oldest-first rule the ledger uses.
 * Pure display - the real allocation is always recomputed from stored rows.
 */
function previewAllocation(ledger, amount) {
  const open = ledger.bills.filter(b => b.remaining > 0.005);
  let left = Number(amount) || 0;
  const cleared = [];
  let partial = null;

  for (const bill of open) {
    if (left <= 0.005) break;
    if (left >= bill.remaining - 0.005) {
      left -= bill.remaining;
      cleared.push(bill);
    } else {
      partial = { bill, amount: left };
      left = 0;
    }
  }
  return { cleared, partial, leftover: Math.max(0, left) };
}

function previewHtml(ledger, amount) {
  if (!amount || amount <= 0) return '';
  const { cleared, partial, leftover } = previewAllocation(ledger, amount);

  const lines = [];
  if (cleared.length) {
    lines.push(`<li>${icon('checkCircle', { size: 13 })} Fully clears <b>${cleared.length}</b> bill${cleared.length === 1 ? '' : 's'}${
      cleared.length <= 3 ? `: ${cleared.map(b => escapeHtml(b.description)).join(', ')}` : ''}</li>`);
  }
  if (partial) {
    lines.push(`<li>${icon('halfCircle', { size: 13 })} Part-pays <b>${escapeHtml(partial.bill.description)}</b> by ${fmtMoney(partial.amount)}
      (${fmtMoney(partial.bill.remaining - partial.amount)} would remain)</li>`);
  }
  if (leftover > 0.005) {
    lines.push(`<li>${icon('sparkles', { size: 13 })} ${fmtMoney(leftover)} left over, held as credit</li>`);
  }
  if (!lines.length) return '';

  return `
    <div class="card card--quiet" style="padding:11px 12px">
      <p class="field__label" style="margin-bottom:6px">This payment will</p>
      <ul style="list-style:none;padding:0;margin:0;font-size:13px;color:var(--text-2);display:flex;flex-direction:column;gap:5px">
        ${lines.join('')}
      </ul>
    </div>
  `;
}

function actionsFor(payment) {
  if (state.editing.payment === payment.id) {
    return `
      <div class="stack" style="margin-top:10px">
        <div class="amount-input"><span>₹</span>
          <input type="number" step="0.01" min="0.01" class="edit-amount" value="${payment.amount}" /></div>
        <input type="date" class="edit-date" value="${payment.date}" max="${todayISO()}" />
        <input type="text" class="edit-note" maxlength="200" placeholder="Note (optional)" value="${escapeHtml(payment.note || '')}" />
        <div class="actions">
          ${btn('Save', { size: 'sm', icon: 'check', cls: 'save-payment' })}
          ${btn('Cancel', { variant: 'chip', size: 'sm', cls: 'cancel-payment' })}
        </div>
      </div>`;
  }
  return `
    <div class="actions">
      ${btn('Edit', { variant: 'chip', size: 'sm', icon: 'pencil', cls: 'edit-payment' })}
      ${btn('Delete', { variant: 'danger', size: 'sm', icon: 'trash', cls: 'delete-payment' })}
    </div>
  `;
}

/* -------------------------------------------------------------- wiring --- */

function wire(root, ledger, owed) {
  const form = root.querySelector('#pay-form');

  if (form) {
    const amountInput = form.querySelector('input[name=amount]');
    const preview = root.querySelector('#pay-preview');
    const paint = () => { preview.innerHTML = previewHtml(ledger, parseFloat(amountInput.value)); };

    amountInput.addEventListener('input', paint);
    on(root, '[data-amount]', 'click', (e) => {
      amountInput.value = e.currentTarget.dataset.amount;
      root.querySelectorAll('[data-amount]').forEach(c => c.classList.remove('is-on'));
      e.currentTarget.classList.add('is-on');
      paint();
    });
    paint();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const amount = parseFloat(fd.get('amount'));
      const date = fd.get('date');
      const note = String(fd.get('note') || '').trim() || null;

      if (!amount || amount <= 0) return showToast('Enter a valid amount', true);
      if (amount > owed + 0.005) {
        return showToast(`That's more than the ${fmtMoney(owed)} outstanding`, true);
      }

      const submit = form.querySelector('button[type=submit]');
      submit.disabled = true;
      try {
        await addPayment({ amount, date, note });
        showToast(amount >= owed - 0.005 ? 'Settled in full' : 'Partial payment recorded');
        renderSettle();
      } catch (err) {
        showToast(err.message, true);
        submit.disabled = false;
      }
    });
  }

  root.querySelector('#export-payments')?.addEventListener('click', () => {
    downloadCsv(
      `payments_${todayISO()}.csv`,
      ['Date', 'Amount', 'Note', 'Bills cleared', 'Held as credit'],
      ledger.paymentsNewestFirst.map(p => [
        p.date, p.amount, p.note || '',
        p.covers.map(c => `${c.description} (${c.amount.toFixed(2)})`).join('; '),
        p.unapplied.toFixed(2),
      ])
    );
  });

  on(root, '.edit-payment', 'click', (e) => {
    state.editing.payment = Number(e.currentTarget.closest('[data-id]').dataset.id);
    renderSettle();
  });
  on(root, '.cancel-payment', 'click', () => {
    state.editing.payment = null;
    renderSettle();
  });

  on(root, '.save-payment', 'click', async (e) => {
    const card = e.currentTarget.closest('[data-id]');
    const amount = parseFloat(card.querySelector('.edit-amount').value);
    const date = card.querySelector('.edit-date').value;
    const note = card.querySelector('.edit-note').value.trim() || null;
    if (!amount || amount <= 0) return showToast('Enter a valid amount', true);

    try {
      await updatePayment(card.dataset.id, { amount, date, note });
      state.editing.payment = null;
      showToast('Payment updated');
      renderSettle();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  on(root, '.delete-payment', 'click', async (e) => {
    const card = e.currentTarget.closest('[data-id]');
    const pay = ledger.payments.find(p => String(p.id) === card.dataset.id);
    const msg = pay
      ? `Delete this ${fmtMoney(pay.amount)} payment from ${fmtDate(pay.date)}? That amount goes back to being owed.`
      : 'Delete this payment record?';
    if (!confirm(msg)) return;

    try {
      await deletePayment(card.dataset.id);
      showToast('Deleted');
      renderSettle();
    } catch (err) {
      showToast(err.message, true);
    }
  });
}
