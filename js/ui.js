/* Presentational building blocks. Every one returns an HTML string, so views
   stay declarative and both dashboards are assembled from the same pieces. */

import { icon } from './icons.js';
import { escapeHtml, fmtMoney, fmtDate, fmtDateShort, pct, openLightbox } from './util.js';
import { STATUS } from './ledger.js';

export function skeleton(rows = 3) {
  return `<div class="skeleton">${'<i></i>'.repeat(rows)}</div>`;
}

export function errorBox(message) {
  return `<div class="notice">${escapeHtml(message)}</div>`;
}

export function empty({ icon: name = 'inbox', title, body = '', action = '' }) {
  return `
    <div class="empty">
      ${icon(name)}
      <p class="empty__title">${escapeHtml(title)}</p>
      ${body ? `<p>${escapeHtml(body)}</p>` : ''}
      ${action}
    </div>
  `;
}

export function sectionHead(title, right = '') {
  return `<div class="section-head"><h2>${escapeHtml(title)}</h2>${right}</div>`;
}

/**
 * The headline number. One figure, stated plainly - a chart here would be
 * eight colours in service of a single value.
 */
export function hero({ label, value, tone = '', note = '', meter = null }) {
  const toneCls = tone ? ` hero__value--${tone}` : '';
  return `
    <div class="hero">
      <p class="hero__label">${escapeHtml(label)}</p>
      <p class="hero__value${toneCls}">${escapeHtml(value)}</p>
      ${note ? `<p class="hero__note">${note}</p>` : ''}
      ${meter ? progressMeter(meter) : ''}
    </div>
  `;
}

/**
 * Cleared-vs-outstanding as a single filled bar. Both ends are labelled in
 * text, so the bar is a summary of numbers that are already readable.
 */
export function progressMeter({ done, total, doneLabel = 'Cleared', leftLabel = 'Still open' }) {
  const percent = pct(done, total);
  const left = Math.max(0, total - done);
  return `
    <div class="meter" role="img"
      aria-label="${Math.round(percent)}% cleared - ${fmtMoney(done)} of ${fmtMoney(total)}">
      <div class="meter__fill" style="--meter-pct:${percent.toFixed(1)}%"></div>
    </div>
    <div class="meter__legend">
      <span>${escapeHtml(doneLabel)} <b>${fmtMoney(done)}</b></span>
      <span>${escapeHtml(leftLabel)} <b>${fmtMoney(left)}</b></span>
    </div>
  `;
}

export function tile({ label, value, foot = '', swatch = '', tone = '' }) {
  const color = tone ? ` style="color:var(--${tone})"` : '';
  return `
    <div class="tile">
      <p class="tile__label">${swatch ? `<i class="swatch swatch--${swatch}"></i>` : ''}${escapeHtml(label)}</p>
      <p class="tile__value"${color}>${escapeHtml(value)}</p>
      ${foot ? `<p class="tile__foot">${foot}</p>` : ''}
    </div>
  `;
}

export function tiles(items) {
  return `<div class="tiles">${items.join('')}</div>`;
}

/** Status is carried by icon + word together - never by the colour alone. */
export function statusPill(statusKey) {
  const s = STATUS[statusKey] || STATUS.unpaid;
  return `<span class="pill ${s.cls}">${icon(s.icon, { size: 12 })}${s.label}</span>`;
}

export function pill(text, variant = 'info', iconName = null) {
  return `<span class="pill pill--${variant}">${iconName ? icon(iconName, { size: 12 }) : ''}${escapeHtml(text)}</span>`;
}

export function btn(label, { variant = '', size = '', icon: name = null, id = '', cls = '', attrs = '' } = {}) {
  const classes = ['btn', variant && `btn--${variant}`, size && `btn--${size}`, cls].filter(Boolean).join(' ');
  return `<button type="button" class="${classes}"${id ? ` id="${id}"` : ''} ${attrs}>
    ${name ? icon(name, { size: size === 'sm' ? 13 : 17 }) : ''}${escapeHtml(label)}
  </button>`;
}

export function field({ label, input, hint = '' }) {
  return `
    <label class="field">
      <span class="field__label">${escapeHtml(label)}</span>
      ${input}
      ${hint ? `<span class="field__hint">${escapeHtml(hint)}</span>` : ''}
    </label>
  `;
}

export function amountField({ name, value = '', max = null, required = true, symbol = '₹' }) {
  return `
    <div class="amount-input">
      <span>${symbol}</span>
      <input type="number" step="0.01" min="0.01" name="${name}" inputmode="decimal"
        placeholder="0.00" value="${value}" ${max != null ? `max="${max}"` : ''} ${required ? 'required' : ''} />
    </div>
  `;
}

export function receiptThumb(item, signedUrls) {
  const url = item.image_path && signedUrls[item.image_path];
  if (url) {
    return `<img class="thumb" src="${url}" alt="Receipt for ${escapeHtml(item.description)}" loading="lazy" />`;
  }
  return `<div class="thumb thumb--empty" aria-hidden="true">${icon('image')}</div>`;
}

/**
 * Swap the placeholder thumbs for real receipt photos once their signed URLs
 * arrive. Lets a screen paint immediately and fill the images in afterwards,
 * rather than holding the whole render behind a round-trip per photo.
 */
export function fillThumbs(root, bills, signedUrls) {
  bills.forEach(bill => {
    const url = bill.image_path && signedUrls[bill.image_path];
    if (!url) return;
    const placeholder = root.querySelector(`[data-id="${bill.id}"] .thumb--empty`);
    if (!placeholder) return;

    const img = document.createElement('img');
    img.className = 'thumb';
    img.src = url;
    img.alt = `Receipt for ${bill.description}`;
    img.loading = 'lazy';
    img.addEventListener('click', () => openLightbox(img.src));
    placeholder.replaceWith(img);
  });
}

/**
 * One bill, with its payment state shown three ways at once: a labelled pill,
 * a fill bar, and the remaining figure in words. Used by both roles.
 */
export function billRow(bill, { signedUrls = {}, uploaderName = '', actions = '', showCovers = true } = {}) {
  const paidPct = pct(bill.paidAmount, bill.amount);
  const meta = [fmtDate(bill.date), uploaderName].filter(Boolean).join(' · ');

  let statusLine = '';
  if (bill.status === 'paid') {
    statusLine = `<p class="item__meta">Cleared on ${fmtDate(bill.clearedOn)}</p>`;
  } else if (bill.status === 'partial') {
    statusLine = `<p class="item__meta">${fmtMoney(bill.paidAmount)} received · ${fmtMoney(bill.remaining)} still open</p>`;
  }

  const covers = showCovers && bill.payments.length > 1 ? `
    <details class="covers">
      <summary>Paid across ${bill.payments.length} payments</summary>
      <ul>${bill.payments.map(p =>
        `<li>${fmtDateShort(p.date)} - ${fmtMoney(p.amount)}</li>`).join('')}</ul>
    </details>
  ` : '';

  return `
    <article class="item" data-id="${bill.id}">
      ${receiptThumb(bill, signedUrls)}
      <div class="grow">
        <div class="row row--between">
          <p class="item__title truncate">${escapeHtml(bill.description)}</p>
          <p class="item__amount">${fmtMoney(bill.amount)}</p>
        </div>
        <p class="item__meta">${escapeHtml(meta)}</p>
        <div class="row" style="margin-top:7px">${statusPill(bill.status)}</div>
        ${bill.status !== 'unpaid' ? `<div class="item__progress"><i style="width:${paidPct.toFixed(1)}%"></i></div>` : ''}
        ${statusLine}
        ${covers}
        ${actions}
      </div>
    </article>
  `;
}

/** A payment, with the bills it actually cleared spelled out underneath. */
export function paymentRow(payment, { actions = '', showCovers = true } = {}) {
  const coveredCount = payment.covers.length;
  const summary = coveredCount === 0
    ? 'Held as credit against future bills'
    : `Cleared ${coveredCount} bill${coveredCount === 1 ? '' : 's'}`;

  const coversHtml = showCovers && coveredCount ? `
    <details class="covers">
      <summary>${escapeHtml(summary)}</summary>
      <ul>${payment.covers.map(c => `
        <li>${escapeHtml(c.description)} <span class="money">(${fmtMoney(c.amount)})</span></li>
      `).join('')}</ul>
      ${payment.unapplied > 0 ? `<li style="list-style:none;margin-top:4px">
        ${fmtMoney(payment.unapplied)} left over as credit</li>` : ''}
    </details>
  ` : `<p class="item__meta">${escapeHtml(summary)}</p>`;

  return `
    <article class="item" data-id="${payment.id}">
      <div class="grow">
        <div class="row row--between">
          <p class="item__title">${fmtMoney(payment.amount)}</p>
          <span class="pill pill--paid">${icon('check', { size: 12 })}Payment</span>
        </div>
        <p class="item__meta">${fmtDate(payment.date)}${payment.note ? ` · ${escapeHtml(payment.note)}` : ''}</p>
        ${coversHtml}
        ${actions}
      </div>
    </article>
  `;
}

export function pocketRow(entry, { actions = '' } = {}) {
  return `
    <article class="item" data-id="${entry.id}">
      <div class="grow">
        <div class="row row--between">
          <p class="item__title">${fmtMoney(entry.amount)}</p>
          <span class="pill pill--info">${icon('wallet', { size: 12 })}Pocket money</span>
        </div>
        <p class="item__meta">${fmtDate(entry.date)}${entry.note ? ` · ${escapeHtml(entry.note)}` : ''}</p>
        ${actions}
      </div>
    </article>
  `;
}

export function timeline(entries) {
  return `<div class="timeline">${entries.map(e => `
    <div class="timeline__item">
      <span class="timeline__dot" style="--dot:${e.color || 'var(--border-strong)'}"></span>
      <p class="timeline__when">${escapeHtml(e.when)}</p>
      <p style="font-size:13.5px">${e.text}</p>
    </div>
  `).join('')}</div>`;
}
