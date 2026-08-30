/* Formatting, DOM helpers, CSV export - no app logic lives here. */

export const CURRENCY = '₹';

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtMoney(n, { compact = false } = {}) {
  const num = Number(n || 0);
  if (compact && Math.abs(num) >= 100000) {
    return `${CURRENCY}${(num / 100000).toFixed(num % 100000 === 0 ? 0 : 1)}L`;
  }
  if (compact && Math.abs(num) >= 1000) {
    return `${CURRENCY}${(num / 1000).toFixed(num % 1000 === 0 ? 0 : 1)}k`;
  }
  return CURRENCY + num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Whole rupees - for chart axes and other places decimals are just noise. */
export function fmtMoneyShort(n) {
  return fmtMoney(n, { compact: true }).replace(/\.00$/, '');
}

export function parseDate(d) {
  if (!d) return null;
  return new Date(d.length === 10 ? `${d}T00:00:00` : d);
}

export function fmtDate(d) {
  const dt = parseDate(d);
  if (!dt) return '-';
  return dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateShort(d) {
  const dt = parseDate(d);
  if (!dt) return '-';
  return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function fmtDateTime(ts) {
  return new Date(ts).toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function daysBetween(from, to = todayISO()) {
  const a = parseDate(from), b = parseDate(to);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}

/** "today" / "yesterday" / "5 days ago" / "3 weeks ago" - for relative recency. */
export function relativeDays(dateStr) {
  const days = daysBetween(dateStr);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 21) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

export function monthKey(dateStr) {
  return String(dateStr).slice(0, 7);
}

/** "Mar '26" - the apostrophe stops it reading as the 26th of March. */
export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return `${d.toLocaleDateString(undefined, { month: 'short' })} '${String(y).slice(2)}`;
}

/** "August" - for prose and labels where the year is already obvious. */
export function monthName(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long' });
}

/** The last `count` month keys ending with the month containing `endISO`, oldest first. */
export function recentMonthKeys(count, endISO = todayISO()) {
  const end = parseDate(endISO);
  const keys = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

export function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sum(rows, key = 'amount') {
  return (rows || []).reduce((t, r) => t + Number(r[key] || 0), 0);
}

export function pct(part, whole) {
  if (!whole) return 0;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

/* ----------------------------------------------------------- feedback --- */

export function showToast(message, isError = false) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = `toast${isError ? ' toast--error' : ''}`;
  el.textContent = message;
  el.setAttribute('role', 'status');
  // Force a reflow so the transition replays on back-to-back toasts.
  void el.offsetWidth;
  el.classList.add('is-on');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('is-on'), 2600);
}

export function openLightbox(src) {
  const box = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = src;
  box.classList.add('is-visible');
}

/* ------------------------------------------------------------ exports --- */

function csvEscape(val) {
  const s = val == null ? '' : String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename, headers, rows) {
  const lines = [headers.join(',')].concat(rows.map(r => r.map(csvEscape).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------ DOM shorthand --- */

export function on(root, selector, event, handler) {
  root.querySelectorAll(selector).forEach(el => el.addEventListener(event, handler));
}

export function closestId(el) {
  const holder = el.closest('[data-id]');
  return holder ? holder.dataset.id : null;
}
