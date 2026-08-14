/* Vanilla-JS SPA talking directly to Supabase (Auth + Postgres + Storage).
   No server of our own - GitHub Pages just serves these static files. */

const state = {
  user: null,       // { id, email }
  profile: null,    // { id, role, display_name }
  currencySymbol: '₹',
  activeTab: null,
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

function statusBadge(status) {
  if (status === 'settled') {
    return `<span class="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Settled</span>`;
  }
  return `<span class="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pending</span>`;
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
        <p class="text-xl font-semibold mt-1 text-amber-600">${fmtMoney(summary.reimbursement_pending)}</p>
        <p class="text-xs text-slate-400 mt-0.5">${summary.pending_count} bill${summary.pending_count === 1 ? '' : 's'} pending</p>
      </div>
      <div class="card">
        <p class="text-xs text-slate-500">Already settled</p>
        <p class="text-xl font-semibold mt-1 text-green-600">${fmtMoney(summary.reimbursement_settled)}</p>
      </div>
      <div class="card">
        <p class="text-xs text-slate-500">All bills submitted</p>
        <p class="text-xl font-semibold mt-1">${fmtMoney(summary.reimbursement_total)}</p>
      </div>
    </div>

    ${summary.reimbursement_pending > 0 ? `
      <button id="settle-all-btn" class="w-full bg-indigo-600 text-white rounded-lg py-3 font-medium active:bg-indigo-700">
        Settle all pending (${fmtMoney(summary.reimbursement_pending)})
      </button>
    ` : ''}
  `;

  document.getElementById('as-of-input').addEventListener('change', (e) => {
    state.dashAsOf = e.target.value;
    renderDashboard();
  });

  const settleAllBtn = document.getElementById('settle-all-btn');
  if (settleAllBtn) {
    settleAllBtn.addEventListener('click', async () => {
      if (!confirm('Mark all pending bills as settled?')) return;
      const { error: updErr, count } = await sb.from('reimbursements')
        .update({ status: 'settled', settled_at: new Date().toISOString(), settled_by: state.user.id }, { count: 'exact' })
        .eq('status', 'pending');
      if (updErr) { showToast(updErr.message, true); return; }
      showToast(`Settled ${count ?? 'all'} bill(s)`);
      renderDashboard();
    });
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

async function renderHistory() {
  const filter = state.historyFilter || 'all';
  $main.innerHTML = `<p class="text-slate-400 text-sm">Loading...</p>`;

  let query = sb.from('reimbursements').select('*').order('date', { ascending: false }).order('id', { ascending: false });
  if (filter !== 'all') query = query.eq('status', filter);

  const { data: items, error } = await query;
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

  const filterBar = `
    <div class="flex gap-2 text-sm">
      ${['all', 'pending', 'settled'].map(f => `
        <button data-filter="${f}"
          class="filter-btn px-3 py-1.5 rounded-full border ${filter === f ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300 text-slate-600'}">
          ${f[0].toUpperCase()}${f.slice(1)}
        </button>
      `).join('')}
    </div>
  `;

  const list = items.length ? items.map(item => `
    <div class="card flex gap-3" data-id="${item.id}">
      ${item.image_path && signedUrlByPath[item.image_path] ? `
        <img src="${signedUrlByPath[item.image_path]}" class="w-16 h-16 rounded-lg object-cover flex-shrink-0 cursor-pointer thumb" />
      ` : `<div class="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center text-slate-300 flex-shrink-0">-</div>`}
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between gap-2">
          <p class="font-medium truncate">${escapeHtml(item.description)}</p>
          ${statusBadge(item.status)}
        </div>
        <p class="text-sm text-slate-500">${fmtDate(item.date)}${isPayer ? ` · ${escapeHtml(nameById[item.uploaded_by] || '')}` : ''}</p>
        <p class="font-semibold mt-1">${fmtMoney(item.amount)}</p>
        ${item.status === 'settled' ? `<p class="text-xs text-slate-400 mt-0.5">Settled ${fmtDate(item.settled_at)}${item.settled_by && nameById[item.settled_by] ? ` by ${escapeHtml(nameById[item.settled_by])}` : ''}</p>` : ''}
        <div class="flex gap-2 mt-2">
          ${isPayer && item.status === 'pending' ? `<button class="settle-btn text-xs bg-indigo-600 text-white px-3 py-1 rounded-full">Settle</button>` : ''}
          ${isPayer && item.status === 'settled' ? `<button class="unsettle-btn text-xs bg-slate-200 text-slate-700 px-3 py-1 rounded-full">Undo</button>` : ''}
          ${item.status === 'pending' ? `<button class="delete-btn text-xs bg-red-50 text-red-600 px-3 py-1 rounded-full">Delete</button>` : ''}
        </div>
      </div>
    </div>
  `).join('') : `<p class="text-slate-400 text-sm text-center py-8">No bills here yet.</p>`;

  $main.innerHTML = `${filterBar}<div class="space-y-3">${list}</div>`;

  $main.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => { state.historyFilter = btn.dataset.filter; renderHistory(); });
  });
  $main.querySelectorAll('.thumb').forEach(img => {
    img.addEventListener('click', () => openLightbox(img.src));
  });
  $main.querySelectorAll('.settle-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('[data-id]').dataset.id;
      const { error } = await sb.from('reimbursements')
        .update({ status: 'settled', settled_at: new Date().toISOString(), settled_by: state.user.id })
        .eq('id', id);
      if (error) { showToast(error.message, true); return; }
      showToast('Marked settled');
      renderHistory();
    });
  });
  $main.querySelectorAll('.unsettle-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('[data-id]').dataset.id;
      const { error } = await sb.from('reimbursements')
        .update({ status: 'pending', settled_at: null, settled_by: null })
        .eq('id', id);
      if (error) { showToast(error.message, true); return; }
      showToast('Reverted to pending');
      renderHistory();
    });
  });
  $main.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (!confirm('Delete this bill?')) return;
      const id = e.target.closest('[data-id]').dataset.id;
      const { error } = await sb.from('reimbursements').delete().eq('id', id);
      if (error) { showToast(error.message, true); return; }
      showToast('Deleted');
      renderHistory();
    });
  });
}

/* ---------------- Payer: Pocket money ---------------- */

async function renderPocketMoney() {
  $main.innerHTML = `<p class="text-slate-400 text-sm">Loading...</p>`;

  const { data: items, error } = await sb.from('pocket_money').select('*').order('date', { ascending: false }).order('id', { ascending: false });
  if (error) {
    $main.innerHTML = `<p class="text-red-600">${escapeHtml(error.message)}</p>`;
    return;
  }

  const list = items.length ? items.map(pm => `
    <div class="card flex items-center justify-between" data-id="${pm.id}">
      <div>
        <p class="font-medium">${fmtMoney(pm.amount)}</p>
        <p class="text-sm text-slate-500">${fmtDate(pm.date)}${pm.note ? ` · ${escapeHtml(pm.note)}` : ''}</p>
      </div>
      <button class="pm-delete-btn text-xs bg-red-50 text-red-600 px-3 py-1 rounded-full">Delete</button>
    </div>
  `).join('') : `<p class="text-slate-400 text-sm text-center py-8">No pocket money logged yet.</p>`;

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
