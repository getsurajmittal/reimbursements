/* Inline SVG icons (Lucide-style 24x24 stroke paths).
   Icons carry meaning next to status colour, so they are never decorative. */

const paths = {
  home:      '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/>',
  receipt:   '<path d="M5 3v18l2.5-1.5L10 21l2-1.5L14 21l2.5-1.5L19 21V3z"/><path d="M9 8h6"/><path d="M9 12h6"/>',
  plus:      '<path d="M12 5v14"/><path d="M5 12h14"/>',
  wallet:    '<path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2"/><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M21 10h-4a2 2 0 0 0 0 4h4z"/>',
  handCoins: '<path d="M11 15h2a2 2 0 0 0 0-4H9.5L7 13"/><path d="m3 15 4-2 5 4 6-4 3 2-8 6z"/><circle cx="16" cy="6" r="3"/>',
  activity:  '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  inbox:     '<path d="M4 13h4l2 3h4l2-3h4"/><path d="M5.4 5.5 3 13v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5l-2.4-7.5A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.9 1.5z"/>',
  check:     '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  halfCircle:  '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/>',
  clock:     '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert:     '<path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/>',
  camera:    '<path d="M5 7h3l1.5-2h5L16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="3.5"/>',
  image:     '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-5-5-9 9"/>',
  download:  '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
  pencil:    '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/>',
  trash:     '<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7"/>',
  search:    '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  logout:    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 16 5-4-5-4"/><path d="M21 12H9"/>',
  sun:       '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:      '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  arrowRight:'<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  arrowUp:   '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
  trending:  '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  chart:     '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
  calendar:  '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
  filter:    '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  scale:     '<path d="M12 4v16"/><path d="M6 8h12"/><path d="m6 8-3 6h6z"/><path d="m18 8-3 6h6z"/>',
  sparkles:  '<path d="m12 4 1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z"/><path d="M18 15.5 18.8 18l2.2.8-2.2.8L18 22l-.8-2.4-2.2-.8 2.2-.8z"/>',
};

/**
 * @param {string} name  key from `paths`
 * @param {object} opts  { size, stroke, cls }
 */
export function icon(name, { size = 24, stroke = 1.8, cls = '' } = {}) {
  const d = paths[name];
  if (!d) return '';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}"
    stroke-linecap="round" stroke-linejoin="round" width="${size}" height="${size}"
    class="${cls}" aria-hidden="true" focusable="false">${d}</svg>`;
}
