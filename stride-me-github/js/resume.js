// Bandeau « séance en cours » : visible partout (au-dessus des onglets) tant qu'une séance est commencée.
import { esc, toast, vibrate } from './ui.js';

const KEY = 'workoutDraft';
let el = null, tick = 0;
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };

const MINI = 'resumeMini';
const isMini = () => { try { return localStorage.getItem(MINI) === '1'; } catch { return false; } };
const setMini = (v) => { try { v ? localStorage.setItem(MINI, '1') : localStorage.removeItem(MINI); } catch {} el?.classList.toggle('mini', v); vibrate(8); };

function abandon() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return;
  localStorage.removeItem(KEY);
  update();
  toast('Séance abandonnée', { action: 'Annuler', onAction: () => { localStorage.setItem(KEY, raw); update(); } });
}

function build() {
  el = document.createElement('div');
  el.id = 'resume'; el.hidden = true;
  el.innerHTML = `
    <button type="button" class="rs-go" id="rsGo">
      <span class="rs-dot" aria-hidden="true"></span>
      <span class="rs-txt"><b id="rsName"></b><small id="rsInfo"></small></span>
      <span class="rs-cta">Reprendre ›</span>
    </button>
    <button type="button" class="rs-x" id="rsX" aria-label="Abandonner la séance en cours">✕</button>
    <div class="rs-mini" role="group" aria-label="Séance en cours">
      <button type="button" class="rs-open" id="rsOpen" aria-label="Agrandir le bandeau">‹</button>
      <button type="button" class="rs-m-go" id="rsMGo">Reprendre</button>
      <button type="button" class="rs-m-x" id="rsMX">Annuler</button>
    </div>`;
  document.body.appendChild(el);
  el.classList.toggle('mini', isMini());
  const go = () => { vibrate(10); location.hash = '#/workout'; };
  el.querySelector('#rsGo').addEventListener('click', () => { if (!swiped) go(); });
  el.querySelector('#rsMGo').addEventListener('click', go);
  el.querySelector('#rsX').addEventListener('click', abandon);
  el.querySelector('#rsMX').addEventListener('click', abandon);
  el.querySelector('#rsOpen').addEventListener('click', () => setMini(false));

  // Balayage horizontal : réduit le bandeau (vers la gauche ou la droite) / le rouvre
  let sx = 0, sy = 0, down = false, swiped = false;
  el.addEventListener('pointerdown', (e) => { down = true; swiped = false; sx = e.clientX; sy = e.clientY; });
  el.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      down = false; swiped = true; setTimeout(() => { swiped = false; }, 350);
      if (!el.classList.contains('mini')) setMini(true);
      else if (dx < 0) setMini(false);      // balayer le mini vers la gauche le rouvre
    }
  });
  const end = () => { down = false; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}

/** À appeler après chaque changement de page ou de brouillon. */
export function update() {
  if (!el) build();
  const d = read();
  const route = (location.hash.slice(1) || '/').split('?')[0];
  const auth = document.getElementById('app-shell')?.classList.contains('auth-mode');
  const show = !!(d && d.exercises && route !== '/workout' && !auth);
  el.hidden = !show;
  document.body.classList.toggle('has-draft', show);
  clearInterval(tick);
  if (!show) return;
  const sets = d.exercises.flatMap((e) => e.sets);
  const done = sets.filter((s) => s.done).length;
  const min = Math.max(1, Math.round((Date.now() - d.startedAt) / 60000));
  el.querySelector('#rsName').textContent = `${d.sessionName} en cours`;
  el.querySelector('#rsInfo').textContent = `${done}/${sets.length} séries · ${min} min`;
  tick = setInterval(update, 30000);
}
