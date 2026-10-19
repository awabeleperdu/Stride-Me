// Balayage horizontal sur une ligne : gauche = action « supprimer », droite = « archiver ».
// Structure attendue : <div class="sw" data-i> <div class="sw-bg">…</div> <div class="sw-fg">contenu</div> </div>
import { vibrate } from './ui.js';
import { dndActive } from './dnd.js';

export function enableSwipe(container, { row = '.sw', onLeft, onRight, threshold = 96 }) {
  let g = null;

  function down(e) {
    if (e.button > 0 || dndActive()) return;
    const fg = e.target.closest('.sw-fg');
    if (!fg || e.target.closest('input,select,textarea,[data-grip]')) return;
    const el = fg.closest(row);
    if (!el || !container.contains(el)) return;
    g = { el, fg, x: e.clientX, y: e.clientY, id: e.pointerId, on: false, passed: false, w: el.offsetWidth };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function move(e) {
    if (!g || e.pointerId !== g.id) return;
    if (dndActive()) return stop(true);
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return stop(true);   // défilement vertical
      if (Math.abs(dx) < 10) return;
      if (dx > 0 && !onRight) return;
      if (dx < 0 && !onLeft) return;
      g.on = true; g.el.classList.add('swiping');
    }
    const lim = g.w * 0.9;
    const x = Math.max(-lim, Math.min(lim, dx));
    g.fg.style.transform = `translateX(${x}px)`;
    g.el.dataset.dir = x < 0 ? 'left' : 'right';
    const pass = Math.abs(x) > threshold;
    if (pass !== g.passed) { g.passed = pass; g.el.classList.toggle('armed', pass); vibrate(10); }
  }

  function stop(reset) {
    if (!g) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (reset) { g.fg.style.transform = ''; g.el.classList.remove('swiping', 'armed'); }
    g = null;
  }

  function up(e) {
    if (!g || e.pointerId !== g.id) return;
    const { el, fg, on, passed } = g;
    const dir = el.dataset.dir;
    if (!on) return stop(false);
    stop(false);
    // évite le clic fantôme qui suit un balayage
    const eat = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', eat, true), 60);
    if (passed) {
      el.classList.add('leaving');
      fg.style.transform = `translateX(${dir === 'left' ? '-110%' : '110%'})`;
      vibrate(14);
      setTimeout(() => { (dir === 'left' ? onLeft : onRight)(el); }, 200);
    } else {
      fg.style.transform = '';
      el.classList.remove('swiping', 'armed');
    }
  }

  container.addEventListener('pointerdown', down);
  return { destroy() { container.removeEventListener('pointerdown', down); stop(true); } };
}
