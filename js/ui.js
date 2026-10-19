// Petits utilitaires UI partagés
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
/** toast(msg) ou toast(msg, { action:'Annuler', onAction }) — avec action, reste 5 s. */
export function toast(msg, opt) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  if (opt?.action) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-act'; b.textContent = opt.action;
    b.onclick = () => { el.classList.remove('show'); opt.onAction?.(); };
    el.appendChild(b);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), opt?.action ? 5000 : 2200);
}

/** Retour haptique léger (mobile) — respecte l'option « vibration » des réglages. */
export function vibrate(ms = 12) {
  try {
    const s = JSON.parse(localStorage.getItem('settings') || 'null') || {};
    if (s.vibrate === false) return;
    navigator.vibrate?.(ms);
  } catch { /* ignoré */ }
}

/** Écran vide illustré (fond Stride Me). */
export const emptyState = (title, text, action = '') => `
  <div class="empty">
    <div class="empty-art" aria-hidden="true"></div>
    <h3>${esc(title)}</h3>
    <p class="muted">${esc(text)}</p>
    ${action}
  </div>`;

/** Squelettes de chargement (remplacent les spinners). */
export function skeleton(path = '/') {
  const row = '<div class="sk sk-row"></div>';
  const card = '<div class="sk sk-card"></div>';
  if (path === '/') return `<div class="skel"><div class="sk sk-line w40"></div><div class="sk sk-title"></div><div class="sk-strip">${'<div class="sk sk-chip"></div>'.repeat(7)}</div><div class="sk sk-hero"></div></div>`;
  if (path === '/planning') return `<div class="skel"><div class="sk sk-title"></div><div class="sk sk-seg"></div><div class="sk-grid">${'<div class="sk sk-cell"></div>'.repeat(35)}</div></div>`;
  if (path === '/exercises') return `<div class="skel"><div class="sk sk-title"></div>${row.repeat(5)}</div>`;
  return `<div class="skel"><div class="sk sk-title"></div>${card.repeat(3)}</div>`;
}

export const icon = (name) => `<svg class="icon"><use href="#i-${name}"/></svg>`;

export const dayKey = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
