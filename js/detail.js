// Fiche « Détail de l'exercice » : images départ/arrivée, muscles sollicités (schéma), niveau, étapes en français.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const MUSCLE_FR = { chest: 'Pectoraux', lats: 'Grand dorsal', 'middle back': 'Milieu du dos', 'lower back': 'Lombaires', traps: 'Trapèzes', shoulders: 'Épaules', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Avant-bras', quadriceps: 'Quadriceps', hamstrings: 'Ischio-jambiers', glutes: 'Fessiers', calves: 'Mollets', abdominals: 'Abdominaux', adductors: 'Adducteurs', abductors: 'Abducteurs', neck: 'Cou' };
const LEVEL_FR = { d: 'Débutant', i: 'Intermédiaire', e: 'Expert' };

// Formes (viewBox 100×210) par muscle : face / dos
const F = {
  neck: ['<rect x="45" y="30" width="10" height="9" rx="3"/>'],
  shoulders: ['<circle cx="31" cy="50" r="8.5"/>', '<circle cx="69" cy="50" r="8.5"/>'],
  chest: ['<rect x="36" y="54" width="13" height="16" rx="6"/>', '<rect x="51" y="54" width="13" height="16" rx="6"/>'],
  biceps: ['<ellipse cx="23" cy="72" rx="5" ry="11"/>', '<ellipse cx="77" cy="72" rx="5" ry="11"/>'],
  forearms: ['<ellipse cx="20" cy="99" rx="4.5" ry="12"/>', '<ellipse cx="80" cy="99" rx="4.5" ry="12"/>'],
  abdominals: ['<rect x="41" y="73" width="18" height="32" rx="7"/>'],
  quadriceps: ['<ellipse cx="41" cy="136" rx="8" ry="22"/>', '<ellipse cx="59" cy="136" rx="8" ry="22"/>'],
  adductors: ['<ellipse cx="48" cy="124" rx="2.6" ry="12"/>', '<ellipse cx="52" cy="124" rx="2.6" ry="12"/>'],
  abductors: ['<ellipse cx="32" cy="122" rx="3" ry="11"/>', '<ellipse cx="68" cy="122" rx="3" ry="11"/>'],
  calves: ['<ellipse cx="40" cy="178" rx="5.5" ry="15"/>', '<ellipse cx="60" cy="178" rx="5.5" ry="15"/>']
};
const B = {
  neck: F.neck,
  traps: ['<polygon points="50,38 36,52 50,64 64,52"/>'],
  shoulders: F.shoulders,
  lats: ['<ellipse cx="38" cy="76" rx="7" ry="15"/>', '<ellipse cx="62" cy="76" rx="7" ry="15"/>'],
  'middle back': ['<rect x="43" y="62" width="14" height="16" rx="5"/>'],
  'lower back': ['<rect x="42" y="80" width="16" height="17" rx="6"/>'],
  triceps: ['<ellipse cx="23" cy="72" rx="5" ry="11"/>', '<ellipse cx="77" cy="72" rx="5" ry="11"/>'],
  forearms: F.forearms,
  glutes: ['<ellipse cx="41" cy="112" rx="9.5" ry="9"/>', '<ellipse cx="59" cy="112" rx="9.5" ry="9"/>'],
  hamstrings: ['<ellipse cx="41" cy="145" rx="8" ry="19"/>', '<ellipse cx="59" cy="145" rx="8" ry="19"/>'],
  abductors: F.abductors,
  calves: F.calves
};
const BASE = '<circle cx="50" cy="19" r="10"/><rect x="34" y="42" width="32" height="64" rx="12"/><rect x="14" y="48" width="14" height="66" rx="7"/><rect x="72" y="48" width="14" height="66" rx="7"/><rect x="34" y="100" width="15" height="92" rx="7"/><rect x="51" y="100" width="15" height="92" rx="7"/>';

function view(shapes, prim, sec) {
  const layer = (keys, cls) => keys.filter((k) => shapes[k]).map((k) => `<g class="${cls}">${shapes[k].join('')}</g>`).join('');
  return `<svg viewBox="0 0 100 200" role="img" aria-hidden="true"><g class="bd-base">${BASE}</g>${layer(sec, 'bd-sec')}${layer(prim, 'bd-pri')}</svg>`;
}
export function bodyDiagram(prim = [], sec = []) {
  const s = sec.filter((m) => !prim.includes(m));
  return `<div class="bd"><figure>${view(F, prim, s)}<figcaption>Face</figcaption></figure><figure>${view(B, prim, s)}<figcaption>Dos</figcaption></figure></div>`;
}

/** Image plein écran : toucher l'image pour zoomer / dézoomer, flèches pour passer départ ↔ arrivée, ✕ ou Échap pour fermer. */
function openLightbox(imgs, start, name) {
  let i = start, zoom = false;
  const lb = document.createElement('div');
  lb.className = 'lb';
  lb.innerHTML = `<button class="lb-x" aria-label="Fermer">✕</button>
    ${imgs.length > 1 ? '<button class="lb-nav lb-prev" aria-label="Précédente">‹</button><button class="lb-nav lb-next" aria-label="Suivante">›</button>' : ''}
    <div class="lb-stage"><img alt="" draggable="false"></div>
    <p class="lb-cap"></p>`;
  document.body.appendChild(lb);
  const stage = lb.querySelector('.lb-stage'), img = lb.querySelector('img'), cap = lb.querySelector('.lb-cap');
  const paint = () => {
    img.src = imgs[i]; img.alt = name; zoom = false; img.classList.remove('z'); stage.scrollTo(0, 0);
    cap.textContent = imgs.length > 1 ? `${name} · ${i ? 'Arrivée' : 'Départ'} (${i + 1}/${imgs.length}) · touche l'image pour zoomer` : `${name} · touche l'image pour zoomer`;
  };
  const close = () => { lb.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'ArrowRight') { i = (i + 1) % imgs.length; paint(); }
    else if (e.key === 'ArrowLeft') { i = (i - 1 + imgs.length) % imgs.length; paint(); }
  };
  document.addEventListener('keydown', onKey, true);
  lb.querySelector('.lb-x').onclick = close;
  lb.querySelector('.lb-prev')?.addEventListener('click', () => { i = (i - 1 + imgs.length) % imgs.length; paint(); });
  lb.querySelector('.lb-next')?.addEventListener('click', () => { i = (i + 1) % imgs.length; paint(); });
  img.onclick = () => { zoom = !zoom; img.classList.toggle('z', zoom); };
  stage.onclick = (e) => { if (e.target === stage && !zoom) close(); };
  paint();
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
