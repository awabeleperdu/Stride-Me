// Accueil interactif : bande de jours, cartes de séances à swiper, menu flottant animé.
import { getRotation, sessionForDate, saveRotation, startWorkout, insertRestDay, discard, placeSession, adaptMessage, backToBackPlace, askBackToBack } from './workout.js';
import { loadLibrary } from './session.js';
import { navigate } from './router.js';
import { esc, icon, toast, dayKey, vibrate } from './ui.js';

const norm = (s) => String(s || '').trim().toLowerCase();
const fmt = (key, opts) => new Date(key + 'T12:00:00').toLocaleDateString('fr-FR', opts);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const readDraft = () => { try { return JSON.parse(localStorage.getItem('workoutDraft')); } catch { return null; } };

export async function homeView(root) {
  const lib = await loadLibrary();
  let teardown = () => {};

  async function render() {
    teardown();
    const rot = await getRotation();
    rot.planned = rot.planned || {};
    if (!rot.cycle.length) {              // plus aucune séance : on propose d'en créer ou d'importer
      root.innerHTML = `<div class="home"><div class="card stack" style="text-align:center;margin-top:24px">
        <h2>Aucune séance</h2>
        <p class="muted">Crée ta première séance, ou saisis un code de séance (par exemple le programme complet) pour la récupérer.</p>
        <a class="btn block" href="#/planning">Ouvrir le planning</a></div></div>`;
      teardown = () => {};
      return;
    }

    const todayKey = dayKey();
    const keys = Array.from({ length: 7 }, (_, i) => dayKey(new Date(Date.now() + i * 86400000)));
    const sessions = keys.map((k) => sessionForDate(rot, k));
    const draft = readDraft();
    const rel = (i) => (i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : cap(fmt(keys[i], { weekday: 'long', day: 'numeric' })));

    const thumb = (name) => {
      const ex = lib.get(norm(name));
      return ex?.imageUrl
        ? `<img class="dc-thumb" src="${esc(ex.imageUrl)}" alt="" draggable="false">`
        : `<span class="dc-thumb ph">${icon('dumbbell')}</span>`;
    };

    const cardHTML = (i) => {
      const s = sessions[i];
      if (!s) {
        const j = sessions.findIndex((x, n) => n > i && x);
        return `
          <article class="day-card rest" data-i="${i}">
            <div class="dc-top"><span class="badge">${i === 0 ? 'Repos' : esc(rel(i))}</span></div>
            <h3 class="dc-name">Jour de repos</h3>
            <p class="muted">${j >= 0 ? `Prochaine séance : ${esc(sessions[j].name)} (${esc(rel(j).toLowerCase())}).` : 'Récupère bien.'}</p>
            <div class="dc-rest-art">${icon('timer')}</div>
          </article>`;
      }
      const same = draft && draft.sessionId === s.id;
      return `
        <article class="day-card ${i === 0 ? 'today' : ''}" data-i="${i}">
          <div class="dc-top">
            <span class="badge ${i === 0 ? 'accent' : ''}">${i === 0 ? 'Séance du jour' : esc(rel(i))}</span>
            <span class="muted">${s.exercises.length} exercices</span>
          </div>
          <h3 class="dc-name">${esc(s.name)}</h3>
          <ol class="dc-ex">${s.exercises.map((n, j) => `<li style="--d:${j}">${thumb(n)}<span>${esc(n)}</span></li>`).join('')}</ol>
          <div class="dc-actions">
            ${i === 0
              ? `<button class="btn block" data-act="start">${icon('play')} ${same ? 'Reprendre la séance' : 'Commencer la séance'}</button>
                 <button class="btn ghost block" data-act="machines" data-i="${i}">${icon('dumbbell')} Voir les exercices</button>`
              : `<button class="btn block" data-act="machines" data-i="${i}">${icon('dumbbell')} Voir les exercices</button>
                 <button class="btn ghost block" data-act="swap" data-i="${i}">Faire cette séance aujourd'hui</button>`}
          </div>
        </article>`;
    };

    root.innerHTML = `
      <div class="home">
        <div class="home-head">
          <div><p class="muted" id="hDate"></p><h2 id="hTitle"></h2></div>
          <a class="hist-link" href="#/stats" aria-label="Historique et stats">${icon('chart')}<span>Historique</span></a>
        </div>
        <div class="daystrip" id="strip">
          <span class="strip-pill" id="pill"></span>
          ${keys.map((k, i) => `
            <button class="chip" data-go="${i}" aria-label="${esc(rel(i))}">
              <small>${esc(fmt(k, { weekday: 'short' }).replace('.', ''))}</small>
              <b>${new Date(k + 'T12:00:00').getDate()}</b>
              <i class="${sessions[i] ? 'has' : ''}"></i>
            </button>`).join('')}
        </div>
        <div class="pager" id="pager" tabindex="0" aria-label="Séances de la semaine">
          ${keys.map((_, i) => cardHTML(i)).join('')}
        </div>
        <p class="swipe-hint muted">← Glisse pour changer de séance →</p>
      </div>`;

    /* ---------- Pager ---------- */
    const pager = root.querySelector('#pager');
    const cards = [...root.querySelectorAll('.day-card')];
    const chips = [...root.querySelectorAll('.chip')];
    const pill = root.querySelector('#pill');
    const hDate = root.querySelector('#hDate');
    const hTitle = root.querySelector('#hTitle');
    let active = -1;

    const setActive = (i) => {
      active = i;
      cards.forEach((c, n) => c.classList.toggle('active', n === i));
      chips.forEach((c, n) => c.classList.toggle('on', n === i));
      const c = chips[i];
      pill.style.width = c.offsetWidth + 'px';
      pill.style.transform = `translateX(${c.offsetLeft}px)`;
      hDate.textContent = cap(fmt(keys[i], { weekday: 'long', day: 'numeric', month: 'long' }));
      hTitle.textContent = rel(i);
      hTitle.classList.remove('pop'); void hTitle.offsetWidth; hTitle.classList.add('pop');
    };

    const update = () => {
      const mid = pager.scrollLeft + pager.clientWidth / 2;
      let best = 0, bd = Infinity;
      cards.forEach((el, i) => {
        const d = (el.offsetLeft + el.offsetWidth / 2 - mid) / el.offsetWidth;
        const a = Math.min(Math.abs(d), 1);
        el.style.transform = `scale(${1 - a * 0.08})`;
        el.style.opacity = String(1 - a * 0.5);
        if (Math.abs(d) < bd) { bd = Math.abs(d); best = i; }
      });
      if (best !== active) setActive(best);
    };

    let raf = 0;
    pager.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }, { passive: true });

    const goTo = (i) => {
      const el = cards[Math.max(0, Math.min(cards.length - 1, i))];
      pager.scrollTo({ left: el.offsetLeft - (pager.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
    };
    root.querySelector('#strip').addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]'); if (b) goTo(Number(b.dataset.go));
    });

    const onKey = (e) => {
      if (e.key === 'ArrowRight') goTo(active + 1);
      else if (e.key === 'ArrowLeft') goTo(active - 1);
      else if (e.key === 'Escape') closeFab();
    };
    window.addEventListener('keydown', onKey);

    // Glisser à la souris (desktop)
    let drag = null;
    pager.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.target.closest('button')) return;
      drag = { x: e.clientX, left: pager.scrollLeft }; pager.classList.add('dragging');
    });
    const onMove = (e) => { if (drag) pager.scrollLeft = drag.left - (e.clientX - drag.x); };
    const onUp = () => { if (!drag) return; drag = null; pager.classList.remove('dragging'); goTo(active); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    /* ---------- Actions ---------- */
    const confirmReplaceDraft = (s) => {
      const d = readDraft();
      if (d && d.sessionId !== s.id) {
        if (!confirm('Une séance est déjà en cours. La remplacer ?')) return false;
        discard();
      }
      return true;
    };

    const run = async (act, i) => {
      closeFab();
      if (act === 'start') {
        const s = sessions[0];
        if (!s) { toast('Pas de séance aujourd\'hui'); return; }
        if (!confirmReplaceDraft(s)) return;
        if (!readDraft()) startWorkout(s);
        navigate('/workout');
      } else if (act === 'machines') {
        const n = Number.isInteger(i) ? i : active;
        if (!sessions[n]) { toast('Pas de séance ce jour-là'); return; }
        navigate(n === 0 ? '/session' : `/session?d=${keys[n]}`);
      } else if (act === 'swap') {
        const s = sessions[i];
        if (!s || !confirmReplaceDraft(s)) return;
        if (backToBackPlace(rot, todayKey, s.id) && !askBackToBack(s.name)) return;
        const info = placeSession(rot, todayKey, s.id);
        try { await saveRotation(rot); toast(`Aujourd'hui : ${s.name} · ${adaptMessage(rot, s.id, info).toLowerCase()}`); } catch (e) { console.error(e); toast('Erreur d\'enregistrement'); return; }
        await render();
      } else if (act === 'rest') {
        try { await insertRestDay(todayKey); toast('Jour de repos ajouté'); } catch (e) { console.error(e); toast('Erreur'); return; }
        await render();
      } else if (act === 'plan') {
        navigate('/planning');
      }
    };

    pager.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) run(b.dataset.act, b.dataset.i !== undefined ? Number(b.dataset.i) : undefined);
    });

    /* ---------- Menu flottant ---------- */
    const fab = document.createElement('div');
    fab.className = 'fab-root';
    const items = [
      { act: 'machines', label: 'Voir les exercices', ico: 'dumbbell' },
      sessions[0] && { act: 'rest', label: 'Repos aujourd\'hui', ico: 'timer' },
      { act: 'plan', label: 'Modifier le planning', ico: 'calendar' }
    ].filter(Boolean);
    const resume = !!draft;
    const main = sessions[0]
      ? { act: 'start', label: 'Démarrer', sub: sessions[0].name, ico: 'play' }
      : { act: 'plan', label: 'Planning', sub: 'Jour de repos', ico: 'calendar' };
    fab.innerHTML = `
      <div class="fab-backdrop"></div>
      <div class="fab-menu">
        ${items.map((it, n) => `<button class="fab-item" style="--i:${n}" data-fab="${it.act}"><span>${esc(it.label)}</span><em>${icon(it.ico)}</em></button>`).join('')}
      </div>
      <div class="fab-row">
        ${resume ? '' : `<button class="fab-go" data-fab="${main.act}" aria-label="${esc(main.label + ' — ' + main.sub)}">
          <em>${icon(main.ico)}</em><span><b>${esc(main.label)}</b><small>${esc(main.sub)}</small></span>
        </button>`}
        <button class="fab-btn" aria-label="Plus d'actions" aria-expanded="false">${icon('plus')}</button>
      </div>`;
    document.body.appendChild(fab);

    const fabBtn = fab.querySelector('.fab-btn');
    function closeFab() { fab.classList.remove('open'); fabBtn.setAttribute('aria-expanded', 'false'); }
    fabBtn.addEventListener('click', () => {
      const open = fab.classList.toggle('open');
      fabBtn.setAttribute('aria-expanded', String(open));
    });
    fab.querySelector('.fab-backdrop').addEventListener('click', closeFab);
    fab.addEventListener('click', (e) => {
      const b = e.target.closest('[data-fab]'); if (b) { vibrate(12); run(b.dataset.fab); }
    });

    teardown = () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      fab.remove();
    };

    setTimeout(update, 30); // laisse le premier rendu se peindre : l'animation d'entrée se joue
  }

  await render();
  return { unmount() { teardown(); } };
}
