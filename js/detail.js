// Fiche « Détail de l'exercice » : images départ/arrivée, muscles sollicités (schéma), niveau, étapes en français.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const MUSCLE_FR = { chest: 'Pectoraux', lats: 'Grand dorsal', 'middle back': 'Milieu du dos', 'lower back': 'Lombaires', traps: 'Trapèzes', shoulders: 'Épaules', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Avant-bras', quadriceps: 'Quadriceps', hamstrings: 'Ischio-jambiers', glutes: 'Fessiers', calves: 'Mollets', abdominals: 'Abdominaux', adductors: 'Adducteurs', abductors: 'Abducteurs', neck: 'Cou' };
const LEVEL_FR = { d: 'Débutant', i: 'Intermédiaire', e: 'Expert' };

// Schéma anatomique : dessins réalistes (face / dos) dans js/anatomy.js. Chaque muscle du catalogue (free-exercise-db)
// correspond à une ou plusieurs zones du dessin.
import { BODY } from './anatomy.js';
const FRONT = {
  chest: ['chest'], shoulders: ['deltoids'], biceps: ['biceps'], triceps: ['triceps'], forearms: ['forearm'], traps: ['trapezius'],
  abdominals: ['abs', 'obliques'], quadriceps: ['quadriceps'], adductors: ['adductors'], calves: ['calves', 'tibialis'], neck: ['neck']
};
const BACK = {
  traps: ['trapezius'], neck: ['neck'], shoulders: ['deltoids'], lats: ['upper-back'], 'middle back': ['upper-back'], 'lower back': ['lower-back'],
  triceps: ['triceps'], forearms: ['forearm'], glutes: ['gluteal'], abductors: ['gluteal'], hamstrings: ['hamstring'], adductors: ['adductors'], calves: ['calves']
};
function view(side, map, prim, sec) {
  const shapes = BODY[side];
  const zone = (names) => new Set(names.flatMap((m) => map[m] || []));
  const P = zone(prim), S = zone(sec);
  const items = Object.entries(shapes).flatMap(([z, list]) => {
    const k = P.has(z) ? 2 : S.has(z) ? 1 : 0;
    const cls = z === 'head' || z === 'hair' ? 'bd-head' : ['bd-base', 'bd-sec', 'bd-pri'][k];
    return list.map((d) => ({ k, h: `<path class="${cls}" d="${d}"/>` }));
  }).sort((x, y) => x.k - y.k);                 // zones colorées en dernier : leur contour passe au-dessus
  const vb = side === 'front' ? '0 0 724 1448' : '724 0 724 1448';
  return `<svg viewBox="${vb}" role="img" aria-hidden="true">${items.map((i) => i.h).join('')}<path class="bd-line" d="${BODY[side === 'front' ? 'borderFront' : 'borderBack']}"/></svg>`;
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

let open = null;
export function openExerciseDetail(ex) {
  open?.remove();
  const imgs = (ex.images || [ex.imageUrl]).filter(Boolean);
  const steps = ex.steps && ex.steps.length ? ex.steps : String(ex.instructions || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const prim = ex.primary || [], sec = ex.secondary || [];
  const names = (a) => a.map((m) => MUSCLE_FR[m] || m).join(', ');
  const el = document.createElement('div');
  el.className = 'det-root';
  el.innerHTML = `<div class="det-backdrop"></div>
    <section class="det" role="dialog" aria-modal="true" aria-label="${esc(ex.name)}">
      <div class="det-head"><div><p class="muted">Détail de l'exercice</p><h3>${esc(ex.name)}</h3></div><button class="sheet-x" aria-label="Fermer">✕</button></div>
      <div class="det-body">
        ${imgs.length ? `<div class="det-imgs">${imgs.map((u, i) => `<figure><img src="${esc(u)}" alt="${esc(ex.name)}${imgs.length > 1 ? (i ? ' — arrivée' : ' — départ') : ''}" draggable="false">${imgs.length > 1 ? `<figcaption>${i ? 'Arrivée' : 'Départ'}</figcaption>` : ''}</figure>`).join('')}</div>` : ''}
        <div class="det-chips">
          ${ex.muscleGroup ? `<span class="badge accent">${esc(ex.muscleGroup)}</span>` : ''}
          ${ex.equipment && ex.equipment !== 'Autre' ? `<span class="badge">${esc(ex.equipment)}</span>` : ''}
          ${LEVEL_FR[ex.level] ? `<span class="badge">${LEVEL_FR[ex.level]}</span>` : ''}
        </div>
        ${prim.length ? `<h4>Muscles sollicités</h4>${bodyDiagram(prim, sec)}
          <ul class="bd-legend"><li><i class="pri"></i><b>Principal</b> · ${esc(names(prim))}</li>${sec.length ? `<li><i class="sec"></i><b>Secondaire</b> · ${esc(names(sec))}</li>` : ''}</ul>` : ''}
        ${steps.length ? `<h4>Comment faire</h4><ol class="det-steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : '<p class="muted">Pas encore de consignes pour cet exercice.</p>'}
      </div>
    </section>`;
  document.body.appendChild(el);
  open = el;
  const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 220); document.removeEventListener('keydown', onKey); open = null; };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  el.querySelectorAll('.det-imgs img').forEach((im, i) => { im.style.cursor = 'zoom-in'; im.addEventListener('click', () => openLightbox(imgs, i, ex.name)); });
  el.querySelector('.det-backdrop').onclick = close;
  el.querySelector('.sheet-x').onclick = close;
  requestAnimationFrame(() => el.classList.add('on'));
}
