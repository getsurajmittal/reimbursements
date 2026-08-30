/* Reporting periods: the presets, and the label shown for a chosen range.

   Everything here works in local dates (never toISOString, which would shift
   a day backwards in IST) and never returns a `to` in the future, since no
   bill can be dated later than today. */

import { todayISO, parseDate, fmtDate, monthName } from './util.js';

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const firstOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const lastOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

/** Never let a range run past today. */
const clampToday = (iso) => (iso > todayISO() ? todayISO() : iso);

export const PRESETS = [
  {
    key: 'this-month',
    label: 'This month',
    range: () => {
      const now = new Date();
      return { from: isoOf(firstOfMonth(now)), to: todayISO() };
    },
  },
  {
    key: 'last-month',
    label: 'Last month',
    range: () => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - 1);
      return { from: isoOf(firstOfMonth(d)), to: clampToday(isoOf(lastOfMonth(d))) };
    },
  },
  {
    key: '3-months',
    label: '3 months',
    range: () => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - 2);
      return { from: isoOf(firstOfMonth(d)), to: todayISO() };
    },
  },
  {
    key: 'this-year',
    label: 'This year',
    range: () => {
      const now = new Date();
      return { from: `${now.getFullYear()}-01-01`, to: todayISO() };
    },
  },
  {
    key: 'all',
    label: 'All time',
    range: () => ({ from: null, to: todayISO() }),
  },
];

/** The app opens on the current month. */
export function defaultPeriod() {
  const { from, to } = PRESETS[0].range();
  return { key: 'this-month', from, to };
}

/** Which preset (if any) a raw range corresponds to - drives the chip highlight. */
export function matchPreset(from, to) {
  const hit = PRESETS.find(p => {
    const r = p.range();
    return (r.from || null) === (from || null) && r.to === to;
  });
  return hit ? hit.key : 'custom';
}

export function periodFromPreset(key) {
  const preset = PRESETS.find(p => p.key === key) || PRESETS[0];
  return { key: preset.key, ...preset.range() };
}

/**
 * A short human label: "August", "August 2025", "1 Aug - 12 Sep 2026",
 * "Everything so far".
 */
export function periodLabel({ from, to }) {
  if (!from) return 'Everything so far';

  const a = parseDate(from), b = parseDate(to);
  const sameYear = a.getFullYear() === b.getFullYear();
  const thisYear = b.getFullYear() === new Date().getFullYear();
  const key = `${a.getFullYear()}-${pad(a.getMonth() + 1)}`;

  // A whole calendar month reads best as just the month's name.
  const isWholeMonth =
    a.getDate() === 1 &&
    a.getMonth() === b.getMonth() &&
    sameYear &&
    (b.getTime() === lastOfMonth(b).getTime() || to === todayISO());

  if (isWholeMonth) return thisYear ? monthName(key) : `${monthName(key)} ${a.getFullYear()}`;

  const short = (d, withYear) => d.toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}),
  });
  return `${short(a, !sameYear)} - ${short(b, true)}`;
}

/** "as at 31 Aug 2026" - used wherever a cumulative figure is shown. */
export function asAtLabel(to) {
  return to === todayISO() ? 'today' : fmtDate(to);
}
