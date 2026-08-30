/* Submit a bill. Deliberately the simplest screen in the app - one card, no
   distractions - but it closes the loop by telling you what you're now owed. */

import { state, uploadReceipt, addBill, fetchLedger, counterpartName } from '../store.js';
import { go } from '../router.js';
import { icon } from '../icons.js';
import { field, amountField, btn } from '../ui.js';
import { fmtMoney, todayISO, showToast, escapeHtml } from '../util.js';

const $main = () => document.getElementById('main-content');

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  // Built from local parts, not toISOString - UTC would land a day early in IST.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function renderAddBill() {
  const root = $main();
  const who = counterpartName();

  root.innerHTML = `
    <div class="card">
      <div class="card__head">
        <div>
          <p class="card__title">Submit a bill</p>
          <p class="card__sub">It gets added to what ${escapeHtml(who)} owes you straight away</p>
        </div>
      </div>

      <form id="bill-form" class="stack">
        ${field({ label: 'Amount', input: amountField({ name: 'amount' }) })}
        ${field({
          label: 'What was it for?',
          input: `<input type="text" name="description" maxlength="200" required
                   placeholder="e.g. Textbooks, groceries, bus pass" />`,
        })}
        ${field({
          label: 'Date',
          input: `
            <input type="date" name="date" required value="${todayISO()}" max="${todayISO()}" />
            <div class="chip-row" style="margin-top:8px">
              <button type="button" class="chip" data-date="${todayISO()}">Today</button>
              <button type="button" class="chip" data-date="${yesterdayISO()}">Yesterday</button>
            </div>`,
        })}

        <div>
          <span class="field__label">Receipt photo (optional)</span>
          <label class="file-drop" id="file-drop">
            ${icon('camera')}
            <span id="file-label">Tap to attach a photo of the receipt</span>
            <input type="file" name="image" accept="image/*" />
          </label>
          <div id="file-preview"></div>
        </div>

        <button type="submit" class="btn btn--block">${icon('plus', { size: 17 })}Submit bill</button>
      </form>
    </div>

    <div id="after-submit"></div>
  `;

  wire(root);
}

function wire(root) {
  const form = root.querySelector('#bill-form');
  const fileInput = form.querySelector('input[type=file]');

  root.querySelectorAll('[data-date]').forEach(chip => {
    chip.addEventListener('click', () => {
      form.querySelector('input[name=date]').value = chip.dataset.date;
      root.querySelectorAll('[data-date]').forEach(c => c.classList.remove('is-on'));
      chip.classList.add('is-on');
    });
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    const preview = root.querySelector('#file-preview');
    const label = root.querySelector('#file-label');
    if (!file) {
      preview.innerHTML = '';
      label.textContent = 'Tap to attach a photo of the receipt';
      return;
    }
    label.textContent = file.name;
    const url = URL.createObjectURL(file);
    preview.innerHTML = `
      <div class="file-preview">
        <img src="${url}" alt="Attached receipt preview" />
        <button type="button" class="link-btn" id="clear-file">Remove</button>
      </div>`;
    preview.querySelector('#clear-file').addEventListener('click', () => {
      fileInput.value = '';
      URL.revokeObjectURL(url);
      fileInput.dispatchEvent(new Event('change'));
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const amount = parseFloat(fd.get('amount'));
    const description = String(fd.get('description') || '').trim();
    const date = fd.get('date');
    const file = fileInput.files[0];

    if (!amount || amount <= 0) return showToast('Enter a valid amount', true);
    if (!description) return showToast('Add a short description', true);

    const submit = form.querySelector('button[type=submit]');
    submit.disabled = true;
    submit.textContent = file ? 'Uploading photo...' : 'Submitting...';

    try {
      const imagePath = file ? await uploadReceipt(file) : null;
      await addBill({ amount, description, date, imagePath });

      form.reset();
      root.querySelector('#file-preview').innerHTML = '';
      root.querySelector('#file-label').textContent = 'Tap to attach a photo of the receipt';
      form.querySelector('input[name=date]').value = todayISO();
      root.querySelectorAll('[data-date]').forEach(c => c.classList.remove('is-on'));

      showToast('Bill submitted');
      await showOutcome(root, amount);
    } catch (err) {
      showToast(err.message, true);
    } finally {
      submit.disabled = false;
      submit.innerHTML = `${icon('plus', { size: 17 })}Submit bill`;
    }
  });
}

/** Confirm the bill landed, and say what it did to the running total. */
async function showOutcome(root, amount) {
  const slot = root.querySelector('#after-submit');
  try {
    const ledger = await fetchLedger({ to: todayISO() });
    slot.innerHTML = `
      <div class="card" style="border-left:3px solid var(--good)">
        <div class="row" style="align-items:flex-start">
          <span style="color:var(--good)">${icon('checkCircle', { size: 20 })}</span>
          <div class="grow">
            <p class="card__title">Added ${fmtMoney(amount)}</p>
            <p style="font-size:13px;color:var(--text-2);margin-top:4px">
              You're now owed <b>${fmtMoney(ledger.totals.outstanding)}</b> across
              ${ledger.openBillCount} open bill${ledger.openBillCount === 1 ? '' : 's'}.
            </p>
            <div class="actions">
              ${btn('View my bills', { variant: 'chip', size: 'sm', id: 'goto-bills' })}
              ${btn('Back to home', { variant: 'chip', size: 'sm', id: 'goto-home' })}
            </div>
          </div>
        </div>
      </div>`;
    slot.querySelector('#goto-bills').addEventListener('click', () => go('bills'));
    slot.querySelector('#goto-home').addEventListener('click', () => go('home'));
  } catch {
    slot.innerHTML = '';
  }
}
