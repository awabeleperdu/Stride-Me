// Calendrier du planning : vue mois / semaine façon agenda, pastilles colorées par séance, fiche du jour.
import { sessionForDate } from './workout.js';
import { fetchHistory } from './statistics.js';
import { loadLibrary } from './session.js';
import { navigate } from './router.js';
import { esc, icon, dayKey } from './ui.js';
import { enableDnd, dndBusy } from './dnd.js';

/* ---------- Couleurs : une couleur stable par séance ---------- */
const PALETTE = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#EF4444', '#84CC16'];
const FIXED = { push: 0, pull: 1, legs: 2 };
export function sessionColor(id) {
  const key = String(id ?? '');
  if (Object.prototype.hasOwnProperty.call(FIXED, key)) return PALETTE[FIXED[key]];
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[3 + (h % (PALETTE.length - 3))];
}

/* ---------- Dates ---------- */
const D = (key) => new Date(key + 'T12:00:00');
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const fmt = (d, o) => d.toLocaleDateString('fr-FR', o);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const norm = (s) => String(s || '').trim().toLowerCase();
const DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

let savedMode = 'week';   // la vue choisie est conservée pendant la visite

/**
 * Monte le calendrier dans `host`.
 *  rot      : objet de roulement (partagé, modifié par onSetDay)
 *  onSetDay : async (key, 'auto' | 'rest' | idSéance) → enregistre le changement
 *  onSwapDays : async (a, b) → échange les séances de deux jours (glisser-déposer)
 * Renvoie { destroy } pour nettoyer la fiche et les écouteurs.
 */
export function mountCalendar(host, { rot, onSetDay, onSwapDays }) {
  const todayKey = dayKey();
  let mode = savedMode;
  let cursor = new Date(); cursor.setHours(12, 0, 0, 0);
  let history = [];
  let lib = new Map();
  let sheetEl = null;
  let dead = false;

  /* ----- Ce qu'il y a un jour donné ----- */
  function infoFor(key) {
    const ws = history.filter((w) => w.date === key);
    if (key < todayKey) {
      if (!ws.length) return { type: 'none' };
      const w = ws[0];
      return { type: 'done', ws, name: w.sessionName, color: sessionColor(w.sessionId), count: w.exercises.length };
    }
    const s = sessionForDate(rot, key);
    if (!s) return { type: 'rest' };
    return { type: 'plan', s, ws, done: ws.length > 0, name: s.name, color: sessionColor(s.id), count: s.exercises.length };
  }

  const pill = (i) => {
    if (i.type === 'rest') return '<span class="cal-pill rest">Repos</span>';
    if (i.type === 'none') return '';
    const done = i.type === 'done' || i.done;
    return `<span class="cal-pill ${done ? 'done' : ''}" style="--c:${i.color}">${done ? '✓ ' : ''}${esc(i.name)}</span>`;
  };
  const labelOf = (i) => (i.type === 'rest' ? ', repos' : i.type === 'none' ? ', aucune séance' : `, ${i.name}${i.type === 'done' || i.done ? ' (terminée)' : ''}`);

  /* ----- Rendu ----- */
  function monthBody() {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
    const gridStart = startOfWeek(first);
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const rows = Math.ceil(((first.getDay() + 6) % 7 + daysInMonth) / 7);
    const cells = Array.from({ length: rows * 7 }, (_, n) => {
      const d = addDays(gridStart, n);
      const key = dayKey(d);
      const i = infoFor(key);
      const inMonth = d.getMonth() === cursor.getMonth();
      return `<button type="button" class="cal-cell ${inMonth ? '' : 'out'} ${key === todayKey ? 'today' : ''}" data-day="${key}"
        aria-label="${esc(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }) + labelOf(i))}">
        <span class="cal-num">${d.getDate()}</span>${pill(i)}</button>`;
    }).join('');
    return `<div class="cal-grid">${DOW.map((x) => `<span class="cal-dow">${x}</span>`).join('')}${cells}</div>`;
  }

  function weekBody() {
    const ws = startOfWeek(cursor);
    return `<div class="wk-list">${Array.from({ length: 7 }, (_, n) => {
      const d = addDays(ws, n);
      const key = dayKey(d);
      const i = infoFor(key);
      let card;
      if (i.type === 'rest') card = '<span class="wk-card rest"><strong>Repos</strong><small>Récupération</small></span>';
      else if (i.type === 'none') card = '<span class="wk-card none"><small>Aucune séance enregistrée</small></span>';
      else {
        const done = i.type === 'done' || i.done;
        const names = i.type === 'done' ? i.ws[0].exercises.map((e) => e.name) : i.s.exercises;
        card = `<span class="wk-card" style="--c:${i.color}">
          ${done ? '<em class="wk-done" aria-hidden="true">✓</em>' : ''}
          <strong>${esc(i.name)}</strong>
          <small>${i.count} exercices${done ? ' · terminée' : ''}</small>
          <span class="wk-ex">${names.slice(0, 4).map((x) => `<span>${esc(x)}</span>`).join('')}${names.length > 4 ? `<span>+${names.length - 4}</span>` : ''}</span>
        </span>`;
      }
      return `<button type="button" class="wk-row ${key === todayKey ? 'today' : ''}" data-day="${key}"
        aria-label="${esc(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }) + labelOf(i))}">
        <span class="wk-date"><small>${esc(fmt(d, { weekday: 'short' }).replace('.', ''))}</small><b>${d.getDate()}</b></span>${card}</button>`;
    }).join('')}</div>`;
  }

  function render(dir = '') {
    const title = mode === 'month'
      ? cap(fmt(cursor, { month: 'long', year: 'numeric' }))
      : (() => { const a = startOfWeek(cursor); const b = addDays(a, 6); return `${fmt(a, { day: 'numeric', month: 'short' })} – ${fmt(b, { day: 'numeric', month: 'short' })}`; })();

    const now = new Date(); now.setHours(12, 0, 0, 0);
    const away = mode === 'month'
      ? (cursor.getFullYear() !== now.getFullYear() || cursor.getMonth() !== now.getMonth())
      : dayKey(startOfWeek(cursor)) !== dayKey(startOfWeek(now));
    host.innerHTML = `
      <div class="cal">
        <div class="cal-bar">
          <div class="cal-nav">
            <button type="button" data-cal="prev" aria-label="${mode === 'month' ? 'Mois précédent' : 'Semaine précédente'}">‹</button>
            <div class="cal-title" aria-live="polite">${esc(title)}</div>
            <button type="button" data-cal="next" aria-label="${mode === 'month' ? 'Mois suivant' : 'Semaine suivante'}">›</button>
          </div>
          <div class="seg cal-mode" role="group" aria-label="Affichage">
            <button type="button" data-cal-mode="week" aria-pressed="${mode === 'week'}">Semaine</button>
            <button type="button" data-cal-mode="month" aria-pressed="${mode === 'month'}">Mois</button>
          </div>
        </div>
        ${away ? '<button type="button" class="cal-today" data-cal="today">↺ Revenir à aujourd\'hui</button>' : ''}
        <div class="cal-legend" aria-label="Légende">
          ${rot.cycle.map((s) => `<span class="lg" style="--c:${sessionColor(s.id)}"><i></i>${esc(s.name)}</span>`).join('')}
          <span class="lg rest"><i></i>Repos</span>
        </div>
        <div class="cal-body ${dir ? 'in-' + dir : ''}">${mode === 'month' ? monthBody() : weekBody()}</div>
      </div>`;
  }

  const go = (n) => {
    cursor = mode === 'month'
      ? new Date(cursor.getFullYear(), cursor.getMonth() + n, 1, 12)
      : addDays(cursor, 7 * n);
    render(n > 0 ? 'l' : 'r');
  };

  /* ----- Fiche du jour ----- */
  function closeSheet() {
    if (!sheetEl) return;
    const el = sheetEl; sheetEl = null;
    el.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => el.remove(), 350);
  }
  const onKey = (e) => { if (e.key === 'Escape') closeSheet(); };

  function summary(w) {
    const dur = w.durationSec ? `${Math.max(1, Math.round(w.durationSec / 60))} min` : '';
    const meta = [dur, `${w.exercises.reduce((t, e) => t + e.sets.length, 0)} séries`, w.feeling ? `ressenti ${w.feeling}/5` : ''].filter(Boolean).join(' · ');
    return `
      <div class="sheet-session" style="--c:${sessionColor(w.sessionId)}">
        <div><strong>${esc(w.sessionName)}</strong><small>${esc(meta)}</small></div>
      </div>
      <ul class="sheet-ex">
        ${w.exercises.map((ex) => {
          const max = Math.max(0, ...ex.sets.map((s) => s.weight));
          return `<li><span class="ex-dot"></span><span>${esc(ex.name)}<small>${ex.sets.length} séries · max ${max} kg</small></span></li>`;
        }).join('')}
      </ul>`;
  }

  function openSheet(key) {
    closeSheet();
    const i = infoFor(key);
    const d = D(key);
    const past = key < todayKey;
    const thumb = (name) => {
      const ex = lib.get(norm(name));
      return ex?.imageUrl ? `<img class="dc-thumb" src="${esc(ex.imageUrl)}" alt="" draggable="false">` : `<span class="dc-thumb ph">${icon('dumbbell')}</span>`;
    };

    let body = '';
    if (past) {
      body = i.type === 'done' ? i.ws.map(summary).join('') : '<p class="muted">Aucune séance enregistrée ce jour-là.</p>';
    } else {
      const anc = rot.anchors?.[key];
      const cur = i.type === 'rest' ? 'rest' : (anc && rot.cycle.some((s) => s.id === anc) ? anc : (rot.planned?.[key] && rot.cycle.some((s) => s.id === rot.planned[key]) ? rot.planned[key] : 'auto'));
      const autoAnchors = { ...(rot.anchors || {}) }; delete autoAnchors[key];
      const autoS = sessionForDate({ ...rot, planned: {}, anchors: autoAnchors, restDates: rot.restDates.filter((x) => x !== key) }, key);
      body = `
        ${i.type === 'rest'
          ? '<div class="sheet-session rest"><div><strong>Jour de repos</strong><small>Le roulement continue après ce jour.</small></div></div>'
          : `<div class="sheet-session" style="--c:${i.color}"><div><strong>${esc(i.name)}</strong><small>${i.count} exercices${i.done ? ' · terminée ✓' : ''}</small></div></div>
             <ul class="sheet-ex">${i.s.exercises.map((n) => `<li>${thumb(n)}<span>${esc(n)}</span></li>`).join('')}</ul>`}
        ${i.type === 'plan' && i.done ? i.ws.map(summary).join('') : ''}
        <label class="field"><span>Séance ce jour-là</span>
          <select class="input" id="shSel">
            <option value="auto" ${cur === 'auto' ? 'selected' : ''}>Auto · ${autoS ? esc(autoS.name) : '—'}</option>
            ${rot.cycle.map((s) => `<option value="${esc(s.id)}" ${cur === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
            <option value="rest" ${cur === 'rest' ? 'selected' : ''}>Repos</option>
          </select>
          <small class="muted">Ton choix est toujours appliqué. Le roulement repart de cette séance et l'app ajoute des jours de repos si besoin pour garder 2 jours entre deux séances identiques.</small>
        </label>
        ${i.type === 'plan' ? `<button type="button" class="btn block" data-sheet="machines">${icon('dumbbell')} Voir les exercices</button>` : ''}`;
    }

    const el = document.createElement('div');
    el.className = 'sheet-root';
    el.innerHTML = `
      <div class="sheet-backdrop"></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }))}">
        <div class="sheet-grab"></div>
        <div class="sheet-head">
          <div>
            <p class="muted">${key === todayKey ? "Aujourd'hui" : past ? 'Passé' : 'À venir'}</p>
            <h3>${esc(cap(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })))}</h3>
          </div>
          <button type="button" class="sheet-x" aria-label="Fermer">✕</button>
        </div>
        <div class="stack">${body}</div>
      </section>`;
    document.body.appendChild(el);
    sheetEl = el;
    requestAnimationFrame(() => el.classList.add('open'));
    document.addEventListener('keydown', onKey);
    el.querySelector('.sheet-x').focus();

    el.querySelector('.sheet-backdrop').addEventListener('click', closeSheet);
    el.querySelector('.sheet-x').addEventListener('click', closeSheet);
    el.querySelector('[data-sheet=machines]')?.addEventListener('click', () => {
      closeSheet();
      navigate(key === todayKey ? '/session' : `/session?d=${key}`);
    });
    el.querySelector('#shSel')?.addEventListener('change', async (e) => {
      await onSetDay(key, e.target.value);
      closeSheet();
      if (!dead) render();
    });
  }

  /* ----- Événements ----- */
  host.addEventListener('click', (e) => {
    if (dndBusy()) return;
    const nav = e.target.closest('[data-cal]');
    const m = e.target.closest('[data-cal-mode]');
    const day = e.target.closest('[data-day]');
    if (nav) {
      if (nav.dataset.cal === 'today') { const t = new Date(); t.setHours(12, 0, 0, 0); const dir = t > cursor ? 'l' : 'r'; cursor = t; render(dir); }
      else go(nav.dataset.cal === 'next' ? 1 : -1);
    } else if (m) {
      mode = savedMode = m.dataset.calMode; render();
    } else if (day) {
      openSheet(day.dataset.day);
    }
  });

  // Glisser à gauche / droite pour changer de mois ou de semaine
  let tx = 0, ty = 0;
  host.addEventListener('touchstart', (e) => { const t = e.touches[0]; tx = t.clientX; ty = t.clientY; }, { passive: true });
  host.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - tx, dy = t.clientY - ty;
    if (dndBusy()) return;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 45) go(dx < 0 ? 1 : -1);
  }, { passive: true });

  render();

  // Glisser une séance à venir sur un autre jour : les deux jours s'échangent (ou la séance se déplace sur un repos)
  const dnd = onSwapDays && enableDnd(host, {
    item: '[data-day]', mode: 'swap',
    canDrag: (el) => el.dataset.day >= todayKey && infoFor(el.dataset.day).type === 'plan',
    canDrop: (t) => t.dataset.day >= todayKey,
    onDrop: async (a, b) => { await onSwapDays(a.dataset.day, b.dataset.day); if (!dead) render(); }
  });

  // L'historique et les photos arrivent ensuite : on redessine sans animation.
  Promise.all([fetchHistory(600), loadLibrary()])
    .then(([h, l]) => { if (dead) return; history = h; lib = l; render(); })
    .catch((err) => console.warn('Calendrier : historique indisponible', err));

  return { destroy() { dead = true; dnd?.destroy(); closeSheet(); } };
}
