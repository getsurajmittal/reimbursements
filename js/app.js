/* Vanilla-JS SPA talking directly to Supabase (Auth + Postgres + Storage).
   No server of our own - GitHub Pages just serves these static files. */

const state = {
  user: null,       // { id, email }
  profile: null,    // { id, role, display_name }
  currencySymbol: '₹',
  activeTab: null,
  editingBillId: null,
  editingPmId: null,
  editingSettlementId: null,
};

const $main = document.getElementById('main-content');
const $tabBar = document.getElementById('tab-bar');

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtMoney(n) {
  const num = Number(n || 0);
  return `${state.currencySymbol}${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d.length === 10 ? `${d}T00:00:00` : d);
  return dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function showToast(msg, isError) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `fixed left-1/2 -translate-x-1/2 bottom-24 px-4 py-2 rounded-lg text-sm text-white shadow-lg z-50 transition-opacity ${isError ? 'bg-red-600' : 'bg-slate-800'}`;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2200);
}

function openLightbox(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox').classList.remove('hidden');
  document.getElementById('lightbox').classList.add('flex');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

/* ---------------- Auth / bootstrap ---------------- */

async function loadProfile(userId) {
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (session && session.user) {
    try {
      state.user = session.user;
      state.profile = await loadProfile(session.user.id);
      showApp();
      return;
    } catch (err) {
      console.error('Could not load profile - is the profiles row set up for this account?', err);
    }
  }
  showLogin();
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-name').textContent =
    `${state.profile.display_name} (${state.profile.role === 'payer' ? 'Payer' : 'Uploader'})`;
  buildTabBar();
  const defaultTab = state.profile.role === 'payer' ? 'dashboard' : 'upload';
  switchTab(defaultTab);
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = error.message;
    errEl.classList.remove('hidden');
    return;
  }
  try {
    state.user = data.user;
    state.profile = await loadProfile(data.user.id);
    showApp();
  } catch (err) {
    errEl.textContent = 'Logged in, but no profile row exists for this account yet. See the README (Step 3).';
    errEl.classList.remove('hidden');
    await sb.auth.signOut();
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await sb.auth.signOut();
  state.user = null;
  state.profile = null;
  document.getElementById('login-form').reset();
  showLogin();
});

/* ---------------- Tab bar ---------------- */

function buildTabBar() {
  const tabs = state.profile.role === 'payer'
    ? [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'history', label: 'Bills' },
        { id: 'owe', label: 'What I Owe' },
        { id: 'pocket', label: 'Pocket Money' },
      ]
    : [
        { id: 'upload', label: 'Add Bill' },
        { id: 'history', label: 'My Bills' },
      ];

  $tabBar.innerHTML = tabs.map(t =>
    `<button class="tab-btn" data-tab="${t.id}">${t.label}</button>`
  ).join('');

  $tabBar.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;
  $tabBar.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  if (tabId === 'dashboard') renderDashboard();
  else if (tabId === 'history') renderHistory();
  else if (tabId === 'owe') renderOwe();
  else if (tabId === 'pocket') renderPocketMoney();
  else if (tabId === 'upload') renderUploadForm();
}

/* ---------------- Payer: Dashboard ---------------- */

async function renderDashboard() {
  $main.innerHTML = `<p class="text-slate-400 text-sm">Loading...</p>`;
  const asOf = state.dashAsOf || todayISO();

  const { data, error } = await sb.rpc('get_summary', { as_of: asOf });
  if (error) {
    $main.innerHTML = `<p class="text-red-600">${escapeHtml(error.message)}</p>`;
    return;
  }
  const summary = data[0];

  $main.innerHTML = `
    <div class="card">
      <label class="block text-xs font-medium text-slate-500 mb-1">Show totals as of</label>
      <input type="date" id="as-of-input" value="${asOf}" max="${todayISO()}"
        class="w-full rounded-lg border border-slate-300 px-3 py-2" />
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div class="card">
        <p class="text-xs text-slate-500">Pocket money given</p>
        <p class="text-xl font-semibold mt-1">${fmtMoney(summary.pocket_money_total)}</p>
      </div>
      <div class="card">
        <p class="text-xs text-slate-500">You owe him</p>
        <p class="text-xl font-semibold mt-1 text-amber-600">${fmtMoney(summary.amount_owed)}</p>
      </div>
      <div class="card">
        <p class="text-xs text-slate-500">Paid back so far</p>
        <p class="text-xl font-semibold mt-1 text-green-600">${fmtMoney(summary.settlement_total)}</p>
      </div>
      <div class="card">
        <p class="text-xs text-slate-500">All bills submitted</p>
        <p class="text-xl font-semibold mt-1">${fmtMoney(summary.reimbursement_total)}</p>
      </div>
    </div>

    ${summary.amount_owed > 0 ? `
      <button id="go-to-owe-btn" class="w-full bg-indigo-600 text-white rounded-lg py-3 font-medium active:bg-indigo-700">
        Settle up (${fmtMoney(summary.amount_owed)} owed)
      </button>
    ` : ''}
  `;

  document.getElementById('as-of-input').addEventListener('change', (e) => {
    state.dashAsOf = e.target.value;
    renderDashboard();
  });

  const goToOweBtn = document.getElementById('go-to-owe-btn');
  if (goToOweBtn) {
    goToOweBtn.addEventListener('click', () => switchTab('owe'));
  }
}

/* ---------------- Brother: Upload form ---------------- */

function renderUploadForm() {
  $main.innerHTML = `
    <div class="card">
      <h2 class="font-semibold mb-3">Submit a bill / receipt</h2>
      <form id="upload-form" class="space-y-3">
        <div>
          <label class="block text-sm font-medium mb-1">Amount</label>
          <input type="number" step="0.01" min="0.01" name="amount" required
            class="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="0.00" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">What was it for?</label>
          <input type="text" name="description" required maxlength="200"
            class="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="e.g. Textbooks, groceries..." />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Date</label>
          <input type="date" name="date" required value="${todayISO()}" max="${todayISO()}"
            class="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Screenshot / photo (optional)</label>
          <input type="file" name="image" accept="image/*" capture="environment" class="w-full text-sm" />
        </div>
        <button type="submit" class="w-full bg-indigo-600 text-white rounded-lg py-3 font-medium active:bg-indigo-700">
          Submit
        </button>
      </form>
    </div>
  `;

  document.getElementById('upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const amount = parseFloat(fd.get('amount'));
    const description = fd.get('description').trim();
    const date = fd.get('date');
    const file = form.querySelector('input[type=file]').files[0];

    const submitBtn = form.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
      let imagePath = null;
      if (file) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        imagePath = `${state.user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await sb.storage.from('receipts').upload(imagePath, file);
        if (upErr) throw upErr;
      }

      const { error: insErr } = await sb.from('reimbursements').insert({
        amount, description, date,
        image_path: imagePath,
        uploaded_by: state.user.id,
      });
      if (insErr) throw insErr;

      showToast('Bill submitted');
      form.reset();
      form.querySelector('input[name=date]').value = todayISO();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit';
    }
  });
}

/* ---------------- History (reimbursements list, shared by both roles) ---------------- */

function billEditFormHtml(item) {
  return `
    <div class="flex-1 min-w-0 space-y-2">
      <input type="number" step="0.01" min="0.01" class="edit-amount w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value="${item.amount}" />
      <input type="text" class="edit-description w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value="${escapeHtml(item.description)}" maxlength="200" />
      <input type="date" class="edit-date w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value="${item.date}" max="${todayISO()}" />
      <div class="flex gap-2">
        <button class="save-bill-btn text-xs bg-indigo-600 text-white px-3 py-1 rounded-full">Save</button>
        <button class="cancel-bill-btn text-xs bg-slate-200 text-slate-700 px-3 py-1 rounded-full">Cancel</button>
      </div>
    </div>
  `;
}

async function renderHistory() {
  $main.innerHTML = `<p class="text-slate-400 text-sm">Loading...</p>`;

  const { data: items, error } = await sb.from('reimbursements').select('*')
    .order('date', { ascending: false }).order('id', { ascending: false });
  if (error) {
    $main.innerHTML = `<p class="text-red-600">${escapeHtml(error.message)}</p>`;
    return;
  }

  const isPayer = state.profile.role === 'payer';

  // Look up display names (small table - just fetch once and map in JS).
  const { data: profiles } = await sb.from('profiles').select('id, display_name');
  const nameById = Object.fromEntries((profiles || []).map(p => [p.id, p.display_name]));

  // Generate short-lived signed URLs for any receipt photos.
  const withImagePaths = items.filter(i => i.image_path);
  const signedUrlByPath = {};
  if (withImagePaths.length) {
    await Promise.all(withImagePaths.map(async (item) => {
      const { data } = await sb.storage.from('receipts').createSignedUrl(item.image_path, 3600);
      if (data) signedUrlByPath[item.image_path] = data.signedUrl;
    }));
  }

  const total = items.reduce((sum, i) => sum + Number(i.amount), 0);

  const list = items.length ? items.map(item => {
    const canEdit = isPayer || item.uploaded_by === state.user.id;
    const isEditing = state.editingBillId === item.id;

    return `
    <div class="card flex gap-3" data-id="${item.id}">
      ${!isEditing && item.image_path && signedUrlByPath[item.image_path] ? `
        <img src="${signedUrlByPath[item.image_path]}" class="w-16 h-16 rounded-lg object-cover flex-shrink-0 cursor-pointer thumb" />
      ` : !isEditing ? `<div class="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center text-slate-300 flex-shrink-0">-</div>` : ''}

      ${isEditing ? billEditFormHtml(item) : `
        <div class="flex-1 min-w-0">
          <p class="font-medium truncate">${escapeHtml(item.description)}</p>
          <p class="text-sm text-slate-500">${fmtDate(item.date)}${isPayer ? ` · ${escapeHtml(nameById[item.uploaded_by] || '')}` : ''}</p>
          <p class="font-semibold mt-1">${fmtMoney(item.amount)}</p>
          <div class="flex gap-2 mt-2">
            ${canEdit ? `<button class="edit-bill-btn text-xs bg-slate-200 text-slate-700 px-3 py-1 rounded-full">Edit</button>` : ''}
            ${canEdit ? `<button class="delete-bill-btn text-xs bg-red-50 text-red-600 px-3 py-1 rounded-full">Delete</button>` : ''}
          </div>
        </div>
      `}
    </div>
  `;
  }).join('') : `<p class="text-slate-400 text-sm text-center py-8">No bills here yet.</p>`;

  $main.innerHTML = `
    <div class="card flex items-center justify-between">
      <p class="text-sm text-slate-500">${items.length} bill${items.length === 1 ? '' : 's'} total</p>
      <p class="font-semibold">${fmtMoney(total)}</p>
    </div>
    <div class="space-y-3">${list}</div>
  `;

  $main.querySelectorAll('.thumb').forEach(img => {
    img.addEventListener('click', () => openLightbox(img.src));
  });

  $main.querySelectorAll('.edit-bill-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      state.editingBillId = Number(e.target.closest('[data-id]').dataset.id);
      renderHistory();
    });
  });

  $main.querySelectorAll('.cancel-bill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.editingBillId = null;
      renderHistory();
    });
  });

  $main.querySelectorAll('.save-bill-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const card = e.target.closest('[data-id]');
      const id = card.dataset.id;
      const amount = parseFloat(card.querySelector('.edit-amount').value);
      const description = card.querySelector('.edit-description').value.trim();
      const date = card.querySelector('.edit-date').value;

      if (!amount || amount <= 0) { showToast('Enter a valid amount', true); return; }
      if (!description) { showToast('Description cannot be empty', true); return; }

      const { error } = await sb.from('reimbursements').update({ amount, description, date }).eq('id', id);
      if (error) { showToast(error.message, true); return; }
      showToast('Bill updated');
      state.editingBillId = null;
      renderHistory();
    });
  });

  $main.querySelectorAll('.delete-bill-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (!confirm('Delete this bill? This cannot be undone.')) return;
      const id = e.target.closest('[data-id]').dataset.id;
      const { error } = await sb.from('reimbursements').delete().eq('id', id);
      if (error) { showToast(error.message, true); return; }
      showToast('Deleted');
      renderHistory();
    });
  });
}

/* ---------------- Payer: What I Owe (settle in full or in part) ---------------- */

function settlementEditFormHtml(item) {
  return `
    <div class="flex-1 min-w-0 space-y-2">
      <input type="number" step="0.01" min="0.01" class="edit-settlement-amount w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value="${item.amount}" />
      <input type="date" class="edit-settlement-date w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value="${item.date}" max="${todayISO()}" />
      <input type="text" class="edit-settlement-note w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value="${escapeHtml(item.note || '')}" placeholder="Note (optional)" maxlength="200" />
      <div class="flex gap-2">
        <button class="save-settlement-btn text-xs bg-indigo-600 text-white px-3 py-1 rounded-full">Save</button>
        <button class="cancel-settlement-btn text-xs bg-slate-200 text-slate-700 px-3 py-1 rounded-full">Cancel</button>
      </div>
    </div>
  `;
}

async function renderOwe() {
  $main.innerHTML = `<p class="text-slate-400 text-sm">Loading...</p>`;

  const [{ data: summaryRows, error: summaryErr }, { data: settlements, error: settleErr }, { data: profiles }] = await Promise.all([
    sb.rpc('get_summary', { as_of: todayISO() }),
    sb.from('settlements').select('*').order('date', { ascending: false }).order('id', { ascending: false }),
    sb.from('profiles').select('id, display_name'),
  ]);

  if (summaryErr || settleErr) {
    $main.innerHTML = `<p class="text-red-600">${escapeHtml((summaryErr || settleErr).message)}</p>`;
    return;
  }

  const owed = summaryRows[0].amount_owed;
  const nameById = Object.fromEntries((profiles || []).map(p => [p.id, p.display_name]));

  const settlementsList = settlements.length ? settlements.map(s => {
    const isEditing = state.editingSettlementId === s.id;
    return `
    <div class="card flex gap-3" data-id="${s.id}">
      ${isEditing ? settlementEditFormHtml(s) : `
        <div class="flex-1 min-w-0">
          <p class="font-semibold">${fmtMoney(s.amount)}</p>
          <p class="text-sm text-slate-500">${fmtDate(s.date)}${s.note ? ` · ${escapeHtml(s.note)}` : ''}</p>
          <div class="flex gap-2 mt-2">
            <button class="edit-settlement-btn text-xs bg-slate-200 text-slate-700 px-3 py-1 rounded-full">Edit</button>
            <button class="delete-settlement-btn text-xs bg-red-50 text-red-600 px-3 py-1 rounded-full">Delete</button>
          </div>
        </div>
      `}
    </div>
  `;
  }).join('') : `<p class="text-slate-400 text-sm text-center py-6">No payments recorded yet.</p>`;

  $main.innerHTML = `
    <div class="card">
      <p class="text-xs text-slate-500">You currently owe him</p>
      <p class="text-2xl font-semibold mt-1 text-amber-600">${fmtMoney(owed)}</p>
    </div>

    ${owed > 0 ? `
      <div class="card">
        <h2 class="font-semibold mb-3">Record a payment</h2>
        <p class="text-xs text-slate-500 mb-3">Pay it off in full, or enter a smaller amount for a partial payment.</p>
        <form id="settle-form" class="space-y-3">
          <div>
            <label class="block text-sm font-medium mb-1">Amount</label>
            <input type="number" step="0.01" min="0.01" max="${owed}" name="amount" required value="${owed}"
              class="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Date</label>
            <input type="date" name="date" required value="${todayISO()}" max="${todayISO()}"
              class="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Note (optional)</label>
            <input type="text" name="note" maxlength="200" placeholder="e.g. Paid via UPI"
              class="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </div>
          <button type="submit" class="w-full bg-indigo-600 text-white rounded-lg py-3 font-medium active:bg-indigo-700">
            Record payment
          </button>
        </form>
      </div>
    ` : `<p class="text-sm text-slate-400 text-center">Nothing outstanding right now.</p>`}

    <div>
      <h2 class="font-semibold mb-2 px-1">Payment history</h2>
      <div class="space-y-3">${settlementsList}</div>
    </div>
  `;

  const settleForm = document.getElementById('settle-form');
  if (settleForm) {
    settleForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(settleForm);
      const amount = parseFloat(fd.get('amount'));
      const date = fd.get('date');
      const note = fd.get('note').trim() || null;

      if (!amount || amount <= 0) { showToast('Enter a valid amount', true); return; }
      if (amount > owed + 0.001) { showToast(`Amount can't exceed what's owed (${fmtMoney(owed)})`, true); return; }

      const { error } = await sb.from('settlements').insert({ amount, date, note, created_by: state.user.id });
      if (error) { showToast(error.message, true); return; }
      showToast(amount >= owed ? 'Fully settled' : 'Partial payment recorded');
      renderOwe();
    });
  }

  $main.querySelectorAll('.edit-settlement-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      state.editingSettlementId = Number(e.target.closest('[data-id]').dataset.id);
      renderOwe();
    });
  });
  $main.querySelectorAll('.cancel-settlement-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.editingSettlementId = null;
      renderOwe();
    });
  });
  $main.querySelectorAll('.save-settlement-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const card = e.target.closest('[data-id]');
      const id = card.dataset.id;
      const amount = parseFloat(card.querySelector('.edit-settlement-amount').value);
      const date = card.querySelector('.edit-settlement-date').value;
      const note = card.querySelector('.edit-settlement-note').value.trim() || null;

      if (!amount || amount <= 0) { showToast('Enter a valid amount', true); return; }

      const { error } = await sb.from('settlements').update({ amount, date, note }).eq('id', id);
      if (error) { showToast(error.message, true); return; }
      showToast('Payment updated');
      state.editingSettlementId = null;
      renderOwe();
    });
  });
  $main.querySelectorAll('.delete-settlement-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (!confirm('Delete this payment record? The amount will go back to being owed.')) return;
      const id = e.target.closest('[data-id]').dataset.id;
      const { error } = await sb.from('settlements').delete().eq('id', id);
      if (error) { showToast(error.message, true); return; }
      showToast('Deleted');
      renderOwe();
    });
  });
}

/* ---------------- Payer: Pocket money ---------------- */

function pmEditFormHtml(pm) {
  return `
    <div class="flex-1 min-w-0 space-y-2">
      <input type="number" step="0.01" min="0.01" class="edit-pm-amount w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value="${pm.amount}" />
      <input type="date" class="edit-pm-date w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value="${pm.date}" max="${todayISO()}" />
      <input type="text" class="edit-pm-note w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value="${escapeHtml(pm.note || '')}" placeholder="Note (optional)" maxlength="200" />
      <div class="flex gap-2">
        <button class="save-pm-btn text-xs bg-indigo-600 text-white px-3 py-1 rounded-full">Save</button>
        <button class="cancel-pm-btn text-xs bg-slate-200 text-slate-700 px-3 py-1 rounded-full">Cancel</button>
      </div>
    </div>
  `;
}

async function renderPocketMoney() {
  $main.innerHTML = `<p class="text-slate-400 text-sm">Loading...</p>`;

  const { data: items, error } = await sb.from('pocket_money').select('*').order('date', { ascending: false }).order('id', { ascending: false });
  if (error) {
    $main.innerHTML = `<p class="text-red-600">${escapeHtml(error.message)}</p>`;
    return;
  }

  const list = items.length ? items.map(pm => {
    const isEditing = state.editingPmId === pm.id;
    return `
    <div class="card flex items-center justify-between" data-id="${pm.id}">
      ${isEditing ? pmEditFormHtml(pm) : `
        <div>
          <p class="font-medium">${fmtMoney(pm.amount)}</p>
          <p class="text-sm text-slate-500">${fmtDate(pm.date)}${pm.note ? ` · ${escapeHtml(pm.note)}` : ''}</p>
        </div>
        <div class="flex gap-2">
          <button class="edit-pm-btn text-xs bg-slate-200 text-slate-700 px-3 py-1 rounded-full">Edit</button>
          <button class="pm-delete-btn text-xs bg-red-50 text-red-600 px-3 py-1 rounded-full">Delete</button>
        </div>
      `}
    </div>
  `;
  }).join('') : `<p class="text-slate-400 text-sm text-center py-8">No pocket money logged yet.</p>`;

  $main.innerHTML = `
    <div class="card">
      <h2 class="font-semibold mb-3">Log pocket money given</h2>
      <form id="pm-form" class="space-y-3">
        <div>
          <label class="block text-sm font-medium mb-1">Amount</label>
          <input type="number" step="0.01" min="0.01" name="amount" required
            class="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="0.00" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Date</label>
          <input type="date" name="date" required value="${todayISO()}" max="${todayISO()}"
            class="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Note (optional)</label>
          <input type="text" name="note" maxlength="200"
            class="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="e.g. Monthly allowance" />
        </div>
        <button type="submit" class="w-full bg-indigo-600 text-white rounded-lg py-3 font-medium active:bg-indigo-700">
          Add
        </button>
      </form>
    </div>
    <div class="space-y-3">${list}</div>
  `;

  document.getElementById('pm-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const amount = parseFloat(fd.get('amount'));
    const date = fd.get('date');
    const note = fd.get('note').trim() || null;

    const { error } = await sb.from('pocket_money').insert({ amount, date, note, created_by: state.user.id });
    if (error) { showToast(error.message, true); return; }
    showToast('Logged');
    renderPocketMoney();
  });

  $main.querySelectorAll('.edit-pm-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      state.editingPmId = Number(e.target.closest('[data-id]').dataset.id);
      renderPocketMoney();
    });
  });
  $main.querySelectorAll('.cancel-pm-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.editingPmId = null;
      renderPocketMoney();
    });
  });
  $main.querySelectorAll('.save-pm-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const card = e.target.closest('[data-id]');
      const id = card.dataset.id;
      const amount = parseFloat(card.querySelector('.edit-pm-amount').value);
      const date = card.querySelector('.edit-pm-date').value;
      const note = card.querySelector('.edit-pm-note').value.trim() || null;

      if (!amount || amount <= 0) { showToast('Enter a valid amount', true); return; }

      const { error } = await sb.from('pocket_money').update({ amount, date, note }).eq('id', id);
      if (error) { showToast(error.message, true); return; }
      showToast('Updated');
      state.editingPmId = null;
      renderPocketMoney();
    });
  });
  $main.querySelectorAll('.pm-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (!confirm('Delete this entry?')) return;
      const id = e.target.closest('[data-id]').dataset.id;
      const { error } = await sb.from('pocket_money').delete().eq('id', id);
      if (error) { showToast(error.message, true); return; }
      showToast('Deleted');
      renderPocketMoney();
    });
  });
}

init();
