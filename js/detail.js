// Fiche « Détail de l'exercice » : images départ/arrivée, muscles sollicités (schéma), niveau, étapes en français.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const MUSCLE_FR = { chest: 'Pectoraux', lats: 'Grand dorsal', 'middle back': 'Milieu du dos', 'lower back': 'Lombaires', traps: 'Trapèzes', shoulders: 'Épaules', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Avant-bras', quadriceps: 'Quadriceps', hamstrings: 'Ischio-jambiers', glutes: 'Fessiers', calves: 'Mollets', abdominals: 'Abdominaux', adductors: 'Adducteurs', abductors: 'Abducteurs', neck: 'Cou' };
const LEVEL_FR = { d: 'Débutant', i: 'Intermédiaire', e: 'Expert' };

// Schéma anatomique : corps réaliste (face / dos) dans js/anatomy.js. Chaque muscle du catalogue (free-exercise-db)
// correspond à une ou plusieurs zones du dessin.
import { ANAT } from './anatomy.js';
import { fetchHistory } from './statistics.js';
const FRONT = {
  chest: ['chest'], shoulders: ['deltoids'], biceps: ['biceps'], triceps: ['triceps'], forearms: ['forearm'],
  abdominals: ['abs', 'obliques'], quadriceps: ['quadriceps'], adductors: ['adductors'], calves: ['calves', 'tibialis'], neck: ['neck'], traps: ['trapezius']
};
const BACK = {
  traps: ['trapezius'], shoulders: ['deltoids'], lats: ['upper-back'], 'middle back': ['upper-back'], 'lower back': ['lower-back'],
  triceps: ['triceps'], forearms: ['forearm'], glutes: ['gluteal'], abductors: ['gluteal'], hamstrings: ['hamstring'], adductors: ['adductors'], calves: ['calves']
};
const DEFS = (id) => `<defs>
  <radialGradient id="${id}B" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#C5CCD2"/><stop offset=".6" stop-color="#8D97A1"/><stop offset="1" stop-color="#5C6670"/></radialGradient>
  <radialGradient id="${id}P" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#FF8A66"/><stop offset=".55" stop-color="#E4411F"/><stop offset="1" stop-color="#9E220F"/></radialGradient>
  <radialGradient id="${id}S" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#FFD39B"/><stop offset=".55" stop-color="#F2A04A"/><stop offset="1" stop-color="#C46E1F"/></radialGradient></defs>`;
let uid = 0;
function view(side, map, prim, sec) {
  const d = ANAT[side], id = 'bd' + (uid++);
  const zone = (names) => new Set(names.flatMap((m) => map[m] || []));
  const P = zone(prim), S = zone(sec);
  const items = Object.entries(d.m).map(([z, list]) => ({ z, list, k: P.has(z) ? 2 : S.has(z) ? 1 : 0 })).sort((x, y) => x.k - y.k);   // zones colorées en dernier
  const paths = items.map(({ z, list, k }) => list.map((p) => `<path class="${['bd-base', 'bd-sec', 'bd-pri'][k]}" d="${p}"${z === 'hair' ? ' style="fill:#2a323a"' : ` style="fill:url(#${id}${'BSP'[k]})"`}/>`).join('')).join('');
  return `<svg viewBox="${d.vb}" role="img" aria-hidden="true">${DEFS(id)}<path class="bd-sil" d="${d.border}"/>${paths}</svg>`;
}
export function bodyDiagram(prim = [], sec = []) {
  const s = sec.filter((m) => !prim.includes(m));
  return `<div class="bd"><figure>${view('front', FRONT, prim, s)}<figcaption>Face</figcaption></figure><figure>${view('back', BACK, prim, s)}<figcaption>Dos</figcaption></figure></div>`;
}

/** Photos en grand : toutes les images l'une sous l'autre (départ puis arrivée), pleine largeur, à faire défiler.
    Toucher une image = zoom x2 (on la fait glisser pour se déplacer), retoucher = retour. ✕ ou Échap pour fermer. */
function openLightbox(imgs, start, name) {
  const lb = document.createElement('div');
  lb.className = 'lb';
  lb.innerHTML = `<div class="lb-top"><b>${esc(name)}</b><button class="lb-x" aria-label="Fermer">✕</button></div>
    <div class="lb-scroll">${imgs.map((u, k) => `<figure class="lb-fig"><div class="lb-pan"><img src="${esc(u)}" alt="${esc(name)}${imgs.length > 1 ? (k ? ' — arrivée' : ' — départ') : ''}" draggable="false"></div>${imgs.length > 1 ? `<figcaption>${k ? 'Arrivée' : 'Départ'}</figcaption>` : ''}</figure>`).join('')}
      <p class="lb-hint">Touche une photo pour zoomer</p></div>`;
  document.body.appendChild(lb);
  const close = () => { lb.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  lb.querySelector('.lb-x').onclick = close;
  lb.querySelectorAll('.lb-pan img').forEach((im) => { im.onclick = () => im.closest('.lb-pan').classList.toggle('z'); });
  lb.querySelectorAll('.lb-fig')[start]?.scrollIntoView({ block: 'center' });
}

/* ---------- Tes performances sur cet exercice (record, dernière fois, courbe) ---------- */
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const fmtKg = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
const fmtDay = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const setTxt = (x) => (num(x.weight) > 0 ? `${fmtKg(num(x.weight))} × ${num(x.reps)}` : `${num(x.reps)} reps`);

function perfHtml(name, hist) {
  const key = String(name || '').trim().toLowerCase();
  const rows = [];                                     // une entrée par séance, de la plus ancienne à la plus récente
  for (const w of [...hist].sort((a, b) => a.date.localeCompare(b.date))) {
    const ex = (w.exercises || []).find((e) => String(e.name || '').trim().toLowerCase() === key);
    const sets = (ex?.sets || []).filter((x) => num(x.reps) > 0);
    if (sets.length) rows.push({ date: w.date, sets, top: Math.max(...sets.map((x) => num(x.weight))) });
  }
  if (!rows.length) return '<div class="det-perf empty"><b>Pas encore de séance</b><small>Ton record et ta progression apparaîtront ici dès que tu auras fait cet exercice.</small></div>';
  let best = null;
  for (const r of rows) for (const x of r.sets) if (!best || num(x.weight) > num(best.weight) || (num(x.weight) === num(best.weight) && num(x.reps) > num(best.reps))) best = x;
  const last = rows[rows.length - 1];
  const pts = rows.slice(-12).map((r) => r.top);
  let spark = '';
  if (pts.length >= 2) {
    const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
    const xy = pts.map((v, i) => `${(i / (pts.length - 1) * 100).toFixed(1)},${(26 - ((v - lo) / span) * 22).toFixed(1)}`);
    spark = `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${xy.join(' ')}"/></svg>
      <small class="spark-cap">${pts.length} dernières séances</small>`;
  }
  const gain = pts.length >= 2 ? pts[pts.length - 1] - pts[0] : 0;
  return `<div class="det-perf">
    <div class="perf-stats">
      <div><small>Record</small><b>${esc(setTxt(best))}</b></div>
      <div><small>Séances</small><b>${rows.length}</b></div>
      ${pts.length >= 2 ? `<div><small>Évolution</small><b class="${gain >= 0 ? 'up' : 'down'}">${gain >= 0 ? '+' : ''}${fmtKg(gain)} kg</b></div>` : ''}
    </div>
    ${spark}
    <p class="perf-last"><small>Dernière fois · ${esc(fmtDay(last.date))}</small><span>${last.sets.slice(0, 8).map((x) => `<i>${esc(setTxt(x))}</i>`).join('')}</span></p>
  </div>`;
}

let open = null;
export function openExerciseDetail(ex) {
  open?.remove();
  const imgs = (ex.images || [ex.imageUrl]).filter(Boolean);
  const steps = ex.steps && ex.steps.length ? ex.steps : String(ex.instructions || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const prim = ex.primary || [], sec = ex.secondary || [];
  const names = (a) => a.map((m) => MUSCLE_FR[m] || m).join(', ');
  const cardio = /^cardio/i.test(String(ex.name || '').trim());
  const el = document.createElement('div');
  el.className = 'det-root';
  el.innerHTML = `<div class="det-backdrop"></div>
    <section class="det" role="dialog" aria-modal="true" aria-label="${esc(ex.name)}">
      <div class="det-grab" aria-hidden="true"></div>
      <div class="det-head"><div><p class="muted">Détail de l'exercice</p><h3>${esc(ex.name)}</h3></div><button class="sheet-x" aria-label="Fermer">✕</button></div>
      <div class="det-body">
        ${imgs.length ? `<div class="det-gal"><div class="det-imgs">${imgs.map((u, i) => `<figure><img src="${esc(u)}" alt="${esc(ex.name)}${imgs.length > 1 ? (i ? ' — arrivée' : ' — départ') : ''}" draggable="false">${imgs.length > 1 ? `<figcaption>${i ? 'Arrivée' : 'Départ'}</figcaption>` : ''}</figure>`).join('')}</div>
          ${imgs.length > 1 ? `<div class="det-dots" aria-hidden="true">${imgs.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}</div>` : ''}
        <div class="det-chips">
          ${ex.muscleGroup ? `<span class="badge accent">${esc(ex.muscleGroup)}</span>` : ''}
          ${ex.equipment && ex.equipment !== 'Autre' ? `<span class="badge">${esc(ex.equipment)}</span>` : ''}
          ${LEVEL_FR[ex.level] ? `<span class="badge">${LEVEL_FR[ex.level]}</span>` : ''}
        </div>
        ${cardio ? '' : `<section class="det-card"><h4>Tes performances</h4><div id="detPerf"><div class="sk sk-line w40"></div><div class="sk sk-card"></div></div></section>`}
        ${prim.length ? `<section class="det-card"><h4>Muscles sollicités</h4>${bodyDiagram(prim, sec)}
          <ul class="bd-legend"><li><i class="pri"></i><b>Principal</b> · ${esc(names(prim))}</li>${sec.length ? `<li><i class="sec"></i><b>Secondaire</b> · ${esc(names(sec))}</li>` : ''}</ul></section>` : ''}
        ${steps.length ? `<section class="det-card"><h4>Comment faire</h4><ol class="det-steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></section>` : '<p class="muted">Pas encore de consignes pour cet exercice.</p>'}
      </div>
    </section>`;
  document.body.appendChild(el);
  open = el;
  const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 220); document.removeEventListener('keydown', onKey); open = null; };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  el.querySelectorAll('.det-imgs img').forEach((im, i) => { im.style.cursor = 'zoom-in'; im.addEventListener('click', () => openLightbox(imgs, i, ex.name)); });
  const strip = el.querySelector('.det-imgs');
  if (strip && imgs.length > 1) strip.addEventListener('scroll', () => {
    const i = Math.round(strip.scrollLeft / (strip.scrollWidth / imgs.length));
    el.querySelectorAll('.det-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
  }, { passive: true });
  el.querySelector('.det-backdrop').onclick = close;
  el.querySelector('.sheet-x').onclick = close;
  requestAnimationFrame(() => el.classList.add('on'));
  const host = el.querySelector('#detPerf');
  if (host) fetchHistory(200).then((h) => { host.innerHTML = perfHtml(ex.name, h); }).catch(() => { host.innerHTML = '<p class="muted">Tes performances ne sont pas disponibles pour le moment.</p>'; });
}
