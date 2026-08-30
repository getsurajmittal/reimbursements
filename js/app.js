/* Bootstrap: auth, theme, the tab bar, and the route table.
   All rendering lives in js/views/*; this file only decides what to show. */

import { sb } from './supabaseClient.js';
import { state, loadProfile, loadNames, isPayer } from './store.js';
import { defineRoute, go, onRouteChange } from './router.js';
import { icon } from './icons.js';
import { escapeHtml, showToast } from './util.js';
import { destroyCharts } from './charts.js';

import { renderHome } from './views/home.js';
import { renderBills } from './views/bills.js';
import { renderAddBill } from './views/addBill.js';
import { renderSettle } from './views/settle.js';
import { renderPocket } from './views/pocket.js';
import { renderReceived } from './views/received.js';
import { renderActivity } from './views/activity.js';

const $ = (id) => document.getElementById(id);

/* ---------------------------------------------------------------- theme --- */

const THEME_KEY = 'reimb-theme';

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  const btn = $('theme-btn');
  if (btn) {
    const dark = resolvedTheme() === 'dark';
    btn.innerHTML = icon(dark ? 'sun' : 'moon');
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }
}

function resolvedTheme() {
  const stored = document.documentElement.getAttribute('data-theme');
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initTheme() {
  let stored = null;
  try { stored = localStorage.getItem(THEME_KEY); } catch { /* private mode */ }
  applyTheme(stored);
}

function toggleTheme() {
  const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode */ }
  applyTheme(next);
  // Charts bake their colours in at draw time, so redraw the current tab.
  destroyCharts();
  const route = state.activeTab;
  if (route) go(route);
}

/* --------------------------------------------------------------- routes --- */

const ROUTES = {
  payer: [
    { id: 'home',     label: 'Home',    icon: 'home',      render: renderHome },
    { id: 'bills',    label: 'Bills',   icon: 'receipt',   render: renderBills },
    { id: 'settle',   label: 'Settle',  icon: 'handCoins', render: renderSettle },
    { id: 'pocket',   label: 'Pocket',  icon: 'wallet',    render: renderPocket },
    { id: 'activity', label: 'Activity',icon: 'activity',  render: renderActivity },
  ],
  brother: [
    { id: 'home',     label: 'Home',    icon: 'home',      render: renderHome },
    { id: 'add',      label: 'Add bill',icon: 'plus',      render: renderAddBill },
    { id: 'bills',    label: 'My bills',icon: 'receipt',   render: renderBills },
    { id: 'received', label: 'Received',icon: 'handCoins', render: renderReceived },
  ],
};

function buildTabBar() {
  const tabs = ROUTES[state.profile.role] || ROUTES.brother;
  tabs.forEach(t => defineRoute(t.id, { render: t.render }));

  $('tab-bar').innerHTML = tabs.map(t => `
    <button type="button" class="tab-btn" data-tab="${t.id}" aria-label="${escapeHtml(t.label)}">
      ${icon(t.icon)}<span>${escapeHtml(t.label)}</span>
    </button>
  `).join('');

  $('tab-bar').querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => go(btn.dataset.tab));
  });

  onRouteChange((tabId) => {
    destroyCharts();
    $('tab-bar').querySelectorAll('.tab-btn').forEach(btn => {
      const active = btn.dataset.tab === tabId;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-current', active ? 'page' : 'false');
    });
  });

  return tabs[0].id;
}

/* ----------------------------------------------------------------- auth --- */

function showLogin() {
  $('login-screen').classList.add('is-visible');
  $('app').classList.remove('is-visible');
}

async function showApp() {
  $('login-screen').classList.remove('is-visible');
  $('app').classList.add('is-visible');

  await loadNames();

  const name = state.profile.display_name;
  $('user-name').textContent = name;
  $('user-role').textContent = isPayer() ? 'Paying it back' : 'Submitting bills';
  $('avatar').textContent = (name || '?').trim().charAt(0).toUpperCase();

  const firstTab = buildTabBar();
  go(firstTab);
}

async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  state.user = data.user;
  state.profile = await loadProfile(data.user.id);
}

async function init() {
  initTheme();

  $('theme-btn').addEventListener('click', toggleTheme);

  $('lightbox').addEventListener('click', () => {
    $('lightbox').classList.remove('is-visible');
  });

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('login-error');
    const submit = e.target.querySelector('button[type=submit]');
    errEl.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Signing in...';

    try {
      await signIn($('email').value.trim(), $('password').value);
      await showApp();
    } catch (err) {
      const noProfile = /row|single|multiple|PGRST116/i.test(err.message || '');
      errEl.textContent = noProfile
        ? 'Signed in, but this account has no profile row yet. See README step 3.'
        : err.message;
      errEl.hidden = false;
      if (noProfile) await sb.auth.signOut();
    } finally {
      submit.disabled = false;
      submit.textContent = 'Log in';
    }
  });

  $('logout-btn').addEventListener('click', async () => {
    await sb.auth.signOut();
    destroyCharts();
    state.user = null;
    state.profile = null;
    state.cache = null;
    $('login-form').reset();
    showLogin();
  });

  // Resume an existing session if there is one.
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    try {
      state.user = session.user;
      state.profile = await loadProfile(session.user.id);
      await showApp();
      return;
    } catch (err) {
      console.error('Could not load the profile row for this account.', err);
      showToast('Signed in, but no profile row exists for this account.', true);
    }
  }
  showLogin();
}

init();
