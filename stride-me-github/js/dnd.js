// Glisser-déposer tactile + souris (sans dépendance).
//  - mode 'reorder' : l'élément se déplace dans sa liste (les voisins s'écartent en douceur)
//  - mode 'swap'    : on dépose sur une cible (calendrier) → onDrop(source, cible)
// Tactile : appui long (~320 ms) n'importe où sur l'élément, ou toucher direct sur la poignée.
// Souris : directement sur la poignée (ou l'élément en mode swap). Clavier : flèches sur la poignée (géré par l'appelant).
import { vibrate } from './ui.js';

let active = false;
let lastEnd = 0;
export const dndBusy = () => active || Date.now() - lastEnd < 350;
export const dndActive = () => active;

const INTERACTIVE = 'input,select,textarea,a,[data-nodrag]';

export function enableDnd(container, o) {
  const { item, handle = null, mode = 'reorder', hold = 320, canDrag = () => true, canDrop = () => true, onSort, onDrop } = o;
  let st = null; // état d'un geste en cours

  const reduced = () => document.documentElement.dataset.motion === 'off';

  function arm(e) {
    if (e.button > 0 || active) return;
    const el = e.target.closest(item);
    if (!el || !container.contains(el)) return;
    const onHandle = handle ? !!e.target.closest(handle) : false;
    if (e.target.closest(INTERACTIVE)) return;
    if (e.target.closest('button') && !onHandle && mode === 'reorder') return;
    if (!canDrag(el)) return;
    const touch = e.pointerType !== 'mouse';
    // Souris : immédiat sur la poignée (reorder) ; en mode swap, dès que ça bouge.
    if (!touch && mode === 'reorder' && !onHandle) return;
    st = { el, x: e.clientX, y: e.clientY, id: e.pointerId, on: false, immediate: onHandle || !touch, timer: 0, ghost: null, raf: 0, vy: 0 };
    if (touch && !onHandle) st.timer = setTimeout(() => start(), hold);
    if (onHandle && touch) start();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  function start() {
    if (!st || st.on) return;
    clearTimeout(st.timer);
    const { el } = st;
    const r = el.getBoundingClientRect();
    st.rect = r;
    const g = el.cloneNode(true);
    g.classList.add('dnd-ghost');
    g.removeAttribute('data-day'); g.removeAttribute('data-i'); g.removeAttribute('data-ex');
    Object.assign(g.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', margin: '0', zIndex: 200, pointerEvents: 'none' });
    document.body.appendChild(g);
    st.ghost = g;
    el.classList.add('dnd-src');
    document.body.classList.add('dnd-active');
    st.on = true; active = true;
    vibrate(18);
    document.addEventListener('touchmove', stopScroll, { passive: false });
    document.addEventListener('contextmenu', stopCtx, true);
    place(st.x, st.y);
    loop();
  }

  const stopScroll = (e) => { if (st?.on) e.preventDefault(); };
  const stopCtx = (e) => { if (st?.on) e.preventDefault(); };

  function place(cx, cy) {
    const { ghost, rect } = st;
    const dx = mode === 'swap' ? cx - st.x : 0;
    const dy = cy - st.y;
    ghost.style.transform = `translate(${dx}px, ${dy}px) scale(1.04)`;
    st.cx = cx; st.cy = cy;
    if (mode === 'reorder') reorder(rect.top + dy + rect.height / 2);
    else hover(cx, cy);
  }

  function reorder(centerY) {
    const el = st.el, parent = el.parentElement;
    const sibs = [...parent.children].filter((n) => n !== el && n.matches(item));
    const before = sibs.find((n) => { const b = n.getBoundingClientRect(); return b.top + b.height / 2 > centerY; });
    if (!sibs.length) return;
    const goal = before || sibs[sibs.length - 1].nextElementSibling;
    if (goal === el.nextElementSibling) return;
    // FLIP : on mémorise les positions, on déplace, puis on anime l'écart
    const first = new Map(sibs.map((n) => [n, n.getBoundingClientRect().top]));
    parent.insertBefore(el, goal);
    if (reduced()) return;
    sibs.forEach((n) => {
      const d = first.get(n) - n.getBoundingClientRect().top;
      if (!d) return;
      n.style.transition = 'none'; n.style.transform = `translateY(${d}px)`;
      requestAnimationFrame(() => { n.style.transition = 'transform .2s ease'; n.style.transform = ''; });
    });
    vibrate(6);
  }

  function hover(cx, cy) {
    st.ghost.style.visibility = 'hidden';
    const t = document.elementFromPoint(cx, cy)?.closest(item);
    st.ghost.style.visibility = '';
    const ok = t && container.contains(t) && t !== st.el && canDrop(t, st.el) ? t : null;
    if (ok !== st.over) {
      st.over?.classList.remove('dnd-over');
      st.over = ok;
      if (ok) { ok.classList.add('dnd-over'); vibrate(6); }
    }
  }

  // Défilement automatique près des bords de l'écran
  function loop() {
    if (!st?.on) return;
    const h = window.innerHeight, y = st.cy ?? st.y;
    let v = 0;
    if (y < 90) v = -Math.ceil((90 - y) / 8);
    else if (y > h - 110) v = Math.ceil((y - (h - 110)) / 8);
    if (v) {
      window.scrollBy(0, v);
      place(st.cx, st.cy);
    }
    st.raf = requestAnimationFrame(loop);
  }

  function move(e) {
    if (!st || e.pointerId !== st.id) return;
    if (!st.on) {
      const dist = Math.hypot(e.clientX - st.x, e.clientY - st.y);
      if (st.immediate && dist > 4 && !(handle && e.pointerType !== 'mouse')) { start(); }
      else if (dist > 8) { cancel(); return; }          // le doigt bouge avant l'appui long : c'est un défilement / un swipe
      if (!st?.on) return;
    }
    e.preventDefault();
    place(e.clientX, e.clientY);
  }

  function cancel() {
    if (!st) return;
    clearTimeout(st.timer);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    st = null;
  }

  function end(e) {
    if (!st || e.pointerId !== st.id) return;
    const s = st;
    if (!s.on) { cancel(); return; }
    cancelAnimationFrame(s.raf);
    document.removeEventListener('touchmove', stopScroll);
    document.removeEventListener('contextmenu', stopCtx, true);
    const parent = s.el.parentElement;
    const ok = e.type !== 'pointercancel';
    const finish = () => {
      s.ghost.remove();
      s.el.classList.remove('dnd-src');
      s.over?.classList.remove('dnd-over');
      document.body.classList.remove('dnd-active');
      active = false; lastEnd = Date.now();
    };
    // Le fantôme « se pose » à sa place avant de disparaître
    let target = null;
    if (mode === 'reorder') target = s.el.getBoundingClientRect();
    else if (s.over && ok) target = s.over.getBoundingClientRect();
    if (target && !reduced() && ok) {
      const g = s.ghost, r = s.rect;
      g.style.transition = 'transform .16s ease, box-shadow .16s ease';
      g.style.transform = `translate(${target.left - r.left}px, ${target.top - r.top}px) scale(1)`;
      setTimeout(finish, 170);
    } else finish();

    const over = s.over, el = s.el;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    st = null;
    if (!ok) return;
    vibrate(10);
    if (mode === 'reorder') onSort?.([...parent.children].filter((n) => n.matches(item)), el);
    else if (over) onDrop?.(el, over);
  }

  const onDown = (e) => arm(e);
  const onClick = (e) => { if (dndBusy()) { e.preventDefault(); e.stopPropagation(); } };
  container.addEventListener('pointerdown', onDown);
  container.addEventListener('click', onClick, true);
  return { destroy() { container.removeEventListener('pointerdown', onDown); container.removeEventListener('click', onClick, true); cancel(); } };
}
