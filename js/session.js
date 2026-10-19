// Aperçu d'une séance : carrousel plein écran des machines (swipe, zoom/parallaxe), puis "Commencer".
import { db } from './firebase-config.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getUser } from './auth.js';
import { getRotation, sessionForDate, startWorkout } from './workout.js';
import { navigate } from './router.js';
import { esc, icon, dayKey } from './ui.js';
import { loadCatalog, keyOf, ALIASES, toLibEntry } from './catalog.js';
import { openExerciseDetail } from './detail.js';

const norm = (s) => String(s || '').trim().toLowerCase();

export async function loadLibrary() {
  const q = query(collection(db, 'exercises'), where('ownerId', '==', getUser().uid));
  const snap = await getDocs(q);
  const map = new Map();
  const cat = await loadCatalog().catch(() => []);
  cat.forEach((e) => {
    const v = toLibEntry(e);
    map.set(keyOf(e.n), v); if (!map.has(keyOf(e.en))) map.set(keyOf(e.en), v);
  });
  const byEn = new Map(cat.map((e) => [e.en, e]));
  Object.entries(ALIASES).forEach(([k, en]) => {
    const e = byEn.get(en); if (e && !map.has(k)) map.set(k, toLibEntry(e));
  });
  snap.docs.forEach((d) => {
    const u = d.data(), base = map.get(norm(u.name)) || {};
    map.set(norm(u.name), { ...base, ...u, images: u.imageUrl ? [u.imageUrl, ...((base.images || []).filter((x) => x !== u.imageUrl))] : (base.images || []), imageUrl: u.imageUrl || base.imageUrl || null, instructions: u.instructions || base.instructions || '', muscleGroup: (u.muscleGroup && u.muscleGroup !== 'Autre') ? u.muscleGroup : (base.muscleGroup || u.muscleGroup) });
  });
  return map;
}

const dateParam = () => new URLSearchParams(location.hash.split('?')[1] || '').get('d');

export async function sessionView(root) {
  const key = dateParam() || dayKey();
  const [rot, lib] = await Promise.all([getRotation(), loadLibrary()]);
  const session = sessionForDate(rot, key);

  if (!session) {
    root.innerHTML = `<div class="card stack"><h3>Repos</h3><p class="muted">Pas de séance ce jour-là.</p><a class="btn ghost block" href="#/">Retour</a></div>`;
    return;
  }

  const slides = session.exercises.map((name) => {
    const ex = lib.get(norm(name)) || {};
    return { name, group: ex.muscleGroup || '', img: ex.imageUrl || '', ex: { ...ex, name: ex.name || name } };
  });
  const isToday = key === dayKey();
  const dateLabel = new Date(key + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  root.innerHTML = `
    <div class="session-preview">
      <div class="sp-bg" id="spBg"></div>
      <div class="sp-head">
        <a href="#/" class="sp-back" aria-label="Retour">‹</a>
        <div>
          <p class="muted" style="text-transform:capitalize">${esc(dateLabel)}</p>
          <h2 style="margin:0">${esc(session.name)}</h2>
        </div>
        <span class="badge" id="spCount">1 / ${slides.length}</span>
      </div>

      <div class="carousel" id="car" tabindex="0" aria-label="Exercices de la séance">
        ${slides.map((s, i) => `
          <section class="slide" data-i="${i}">
            <div class="slide-media">
              ${s.img
                ? `<img class="slide-img" src="${esc(s.img)}" alt="${esc(s.name)}" draggable="false">`
                : `<div class="slide-fallback">${icon('dumbbell')}<span>${esc(s.group || 'Exercice')}</span></div>`}
              <span class="slide-num">${String(i + 1).padStart(2, '0')}</span>
            </div>
            <div class="slide-foot">
              <h3>${esc(s.name)}</h3>
              ${s.group ? `<span class="badge accent">${esc(s.group)}</span>` : ''}
              <button type="button" class="btn ghost block" data-detail="${i}">Détail de l'exercice</button>
            </div>
          </section>`).join('')}
      </div>

      <div class="sp-dots" id="dots">${slides.map((_, i) => `<button class="dot" data-go="${i}" aria-label="Exercice ${i + 1}"></button>`).join('')}</div>

      ${isToday
        ? `<button class="btn block" id="go">${icon('play')} Commencer la séance</button>`
        : '<p class="muted" style="text-align:center">Aperçu — la séance se lance le jour même.</p>'}
    </div>`;

  const car = root.querySelector('#car');
  const bg = root.querySelector('#spBg');
  const dots = [...root.querySelectorAll('.dot')];
  const cards = [...root.querySelectorAll('.slide')];
  const count = root.querySelector('#spCount');
  let active = -1;

  const update = () => {
    const mid = car.scrollLeft + car.clientWidth / 2;
    let best = 0, bestD = Infinity;
    cards.forEach((el, i) => {
      const c = el.offsetLeft + el.offsetWidth / 2;
      const d = (c - mid) / el.offsetWidth;            // -1 .. 1 autour du centre
      const a = Math.min(Math.abs(d), 1);
      el.style.transform = `scale(${1 - a * 0.1})`;
      el.style.opacity = String(1 - a * 0.5);
      const media = el.firstElementChild.querySelector('.slide-img, .slide-fallback');
      if (media) media.style.transform = `translateX(${(-d * 28).toFixed(1)}px) scale(1.15)`;   // parallaxe
      if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = i; }
    });
    if (best !== active) {
      active = best;
      dots.forEach((dEl, i) => dEl.classList.toggle('on', i === best));
      count.textContent = `${best + 1} / ${slides.length}`;
      bg.style.backgroundImage = slides[best].img ? `url("${slides[best].img.replace(/"/g, '%22')}")` : 'none';
      bg.classList.toggle('has-img', !!slides[best].img);
    }
  };

  let raf = 0;
  car.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }, { passive: true });
  const goTo = (i) => {
    const el = cards[Math.max(0, Math.min(cards.length - 1, i))];
    car.scrollTo({ left: el.offsetLeft - (car.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
  };
  car.addEventListener('click', (e) => { const b = e.target.closest('[data-detail]'); if (b) openExerciseDetail(slides[Number(b.dataset.detail)].ex); });
  root.querySelector('#dots').addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]'); if (b) goTo(Number(b.dataset.go));
  });
  const onKey = (e) => {
    if (e.key === 'ArrowRight') goTo(active + 1);
    if (e.key === 'ArrowLeft') goTo(active - 1);
  };
  window.addEventListener('keydown', onKey);

  // Souris (desktop) : glisser pour faire défiler
  let drag = null;
  car.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    drag = { x: e.clientX, left: car.scrollLeft };
    car.classList.add('dragging');
  });
  window.addEventListener('pointermove', (e) => { if (drag) car.scrollLeft = drag.left - (e.clientX - drag.x); });
  const endDrag = () => { if (!drag) return; drag = null; car.classList.remove('dragging'); goTo(active); };
  window.addEventListener('pointerup', endDrag);

  root.querySelector('#go')?.addEventListener('click', () => {
    if (!localStorage.getItem('workoutDraft')) startWorkout(session);
    navigate('/workout');
  });

  update();

  return {
    unmount() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerup', endDrag);
    }
  };
}
