import { db } from './firebase-config.js';
import {
  doc, getDoc, setDoc, addDoc, collection, serverTimestamp, updateDoc, arrayUnion, increment
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getUser } from './auth.js';
import { navigate } from './router.js';
import { esc, toast, icon, dayKey, vibrate } from './ui.js';
import { getSettings, RESTS } from './settings.js';
import { startRest, stopRest } from './timer.js';
import { fetchHistory } from './statistics.js';
import { loadLibrary } from './session.js';
import { openExerciseDetail } from './detail.js';
import { buildWarm, lastWarmReps, warmCardHtml, warmClick, warmInput, warmPayload } from './warmup.js';

/* ---------------------------------------------------------
   Roulement (collection schedule_rotation, 1 doc par utilisateur)
   { cycle:[{id,name,exercises:[nom,...]}], startDate:'YYYY-MM-DD', restDates:[...] }
   --------------------------------------------------------- */
const DEFAULT_CYCLE = [
  { id: 'push', name: 'Push', exercises: ['Développé couché', 'Développé militaire', 'Dips', 'Élévations latérales'] },
  { id: 'pull', name: 'Pull', exercises: ['Tractions', 'Rowing barre', 'Tirage horizontal', 'Curl biceps'] },
  { id: 'legs', name: 'Legs', exercises: ['Squat', 'Presse à cuisses', 'Leg curl', 'Mollets debout'] }
];

export async function getRotation() {
  const uid = getUser().uid;
  const ref = doc(db, 'schedule_rotation', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  const fresh = { userId: uid, cycle: DEFAULT_CYCLE, startDate: dayKey(), restDates: [], planned: {}, anchors: {} };
  await setDoc(ref, fresh);
  return fresh;
}

const toUTC = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);

/** Séance d'une date, ou null si jour de repos. Chaque repos inséré décale la suite du cycle. */
export async function saveRotation(rot) {
  await setDoc(doc(db, 'schedule_rotation', getUser().uid), { ...rot, userId: getUser().uid });
}

/* Roulement : le cycle tourne dans l'ordre. Quand on place une séance X un jour donné (« ancre »),
   le cycle repart de X : les jours suivants enchaînent X+1, X+2… Chaque repos inséré décale la suite. */
export const MIN_REST = 2;   // jours minimum entre deux séances identiques
const addDays = (key, n) => { const d = new Date(toUTC(key) + n * 86400000); return d.toISOString().slice(0, 10); };

export function sessionForDate(rotation, key = dayKey()) {
  if (!rotation.cycle.length) return null;   // aucune séance : tous les jours sont libres
  const forced = rotation.planned?.[key];
  if (forced === 'off') return null;   // repos ponctuel (glisser-déposer) : ne décale pas le roulement
  if (forced) { const s = rotation.cycle.find((c) => c.id === forced); if (s) return s; }
  if (rotation.restDates.includes(key)) return null;
  // Point de départ : dernière ancre valide ≤ date, sinon le début du roulement
  let baseKey = rotation.startDate, baseIdx = 0;
  for (const [k, id] of Object.entries(rotation.anchors || {})) {
    const idx = rotation.cycle.findIndex((c) => c.id === id);
    if (idx >= 0 && k <= key && k >= baseKey) { baseKey = k; baseIdx = idx; }
  }
  const elapsed = Math.max(0, daysBetween(baseKey, key));
  const restBefore = rotation.restDates.filter((r) => r > baseKey && r < key).length;
  const n = Math.max(0, elapsed - restBefore);
  return rotation.cycle[(baseIdx + n) % rotation.cycle.length];
}

/** Copie du roulement avec la séance `id` placée le jour `key` (le cycle repart de là). */
export function withSession(rot, key, id) {
  const c = { ...rot, anchors: { ...(rot.anchors || {}) }, planned: { ...(rot.planned || {}) }, restDates: rot.restDates.filter((d) => d !== key) };
  delete c.planned[key];
  c.anchors[key] = id;
  return c;
}

/** Une même séance trop proche d'une autre ? Renvoie { key, offset } du jour fautif, sinon null. */
export function repeatNear(rot, keys) {
  if (rot.cycle.length <= MIN_REST) return null;
  for (const key of keys) {
    const s = sessionForDate(rot, key);
    if (!s) continue;
    for (let d = -MIN_REST; d <= MIN_REST; d++) {
      if (!d) continue;
      const o = sessionForDate(rot, addDays(key, d));
      if (o && o.id === s.id) return { key: addDays(key, d), offset: d };
    }
  }
  return null;
}
export const gapConflict = (rot, key, id) => repeatNear(withSession(rot, key, id), [key]);
export function gapMessage(rot, id, c) {
  const n = rot.cycle.find((s) => s.id === id)?.name || 'Cette séance';
  const j = Math.abs(c.offset);
  return `${n} est déjà prévue ${c.offset < 0 ? 'il y a' : 'dans'} ${j} jour${j > 1 ? 's' : ''} : garde ${MIN_REST} jours de repos minimum entre deux séances identiques.`;
}

const HORIZON = 28;   // jours recalculés vers l'avant
const fmtDay = (k) => new Date(k + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

/** Répare le calendrier vers l'avant : si une même séance retombe trop tôt, on insère un jour de repos
    (le roulement décale la suite). Les jours forcés à la main ne sont jamais modifiés. Renvoie les repos ajoutés. */
const realSession = (rot, k) => (k < rot.startDate ? null : sessionForDate(rot, k));   // avant le début du roulement : rien

export function healFrom(rot, from) {
  const added = [];
  for (let n = 1; n <= HORIZON && added.length < 40; n++) {
    const d = addDays(from, n);
    if (rot.planned?.[d]) continue;
    const s = sessionForDate(rot, d);
    if (!s) continue;
    let clash = false;
    for (let k = 1; k <= MIN_REST && !clash; k++) { const o = realSession(rot, addDays(d, -k)); clash = !!o && o.id === s.id; }
    if (clash) { rot.restDates.push(d); added.push(d); }
  }
  return added;
}

/** Même séance deux jours d'affilée ? (jour d'à côté identique) -> renvoie le jour fautif, sinon null. À confirmer par l'utilisateur. */
export function backToBack(rot, keys) {
  for (const key of keys) {
    const s = realSession(rot, key);
    if (!s) continue;
    for (const d of [-1, 1]) { const o = realSession(rot, addDays(key, d)); if (o && o.id === s.id) return { key, other: addDays(key, d), name: s.name }; }
  }
  return null;
}
export const backToBackPlace = (rot, key, id) => { const o = realSession(rot, addDays(key, -1)); return o && o.id === id ? o : null; };
export const askBackToBack = (name) => confirm(`${name} serait deux jours d'affilée. Il faut normalement 2 jours de repos entre deux séances identiques.\n\nValider quand même ?`);

/** Place la séance `id` ce jour-là, TOUJOURS, et réadapte tout ce qui suit.
    Renvoie { added:[repos ajoutés], past:{offset}|null (même séance faite trop récemment, non modifiable) }. */
export function placeSession(rot, key, id) {
  const next = withSession(rot, key, id);
  rot.anchors = Object.fromEntries(Object.entries(next.anchors).filter(([k]) => k <= key));   // les repères futurs sont recalculés
  rot.planned = Object.fromEntries(Object.entries(next.planned).filter(([k, v]) => k <= key || v === 'off'));
  rot.restDates = next.restDates;
  const added = healFrom(rot, key).filter((d) => d <= addDays(key, 14));   // on n'annonce que les 2 prochaines semaines
  let past = null;
  for (let k = 1; k <= MIN_REST && !past; k++) { const o = realSession(rot, addDays(key, -k)); if (o && o.id === id) past = { offset: -k }; }
  return { added, past };
}

/** Texte de confirmation après un déplacement. */
export function adaptMessage(rot, id, info) {
  const n = rot.cycle.find((x) => x.id === id)?.name || 'Séance';
  let m = 'Calendrier adapté';
  if (info.added.length) m += ` · ${info.added.length} repos ajouté${info.added.length > 1 ? 's' : ''} (${info.added.slice(0, 2).map(fmtDay).join(', ')}${info.added.length > 2 ? '…' : ''})`;
  if (info.past) m += ` · ${n} déjà faite il y a ${Math.abs(info.past.offset)} j`;
  return m;
}

export async function insertRestDay(key = dayKey()) {
  await updateDoc(doc(db, 'schedule_rotation', getUser().uid), { restDates: arrayUnion(key) });
}

/* ---------------------------------------------------------
   Moteur de séance (brouillon en localStorage → résiste au rechargement)
   --------------------------------------------------------- */
let state = null;

function loadDraft() {
  try { return JSON.parse(localStorage.getItem('workoutDraft')); } catch { return null; }
}
const saveDraft = () => localStorage.setItem('workoutDraft', JSON.stringify(state));

export function startWorkout(session) {
  state = {
    sessionId: session.id,
    sessionName: session.name,
    startedAt: Date.now(),
    restSeconds: getSettings().rest,
    exercises: session.exercises.map((name) => {
      const plan = session.plan?.[name] || null;       // séance importée : séries / reps / alternative prévues
      const n = plan ? Math.min(8, Math.max(1, Number(plan.s) || 1)) : 1;
      return { name, plan, sets: Array.from({ length: n }, () => ({ reps: '', weight: '', done: false })) };
    })
  };
  saveDraft();
}

const fmtShort = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const nice = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

/** Dernière séance de chaque exercice : { nom: { date, sets:[{weight,reps}] } } */
async function lastPerformances(names) {
  const out = {}; let warm = {};
  try {
    const hist = await fetchHistory(80);   // du plus récent au plus ancien
    for (const w of hist) for (const ex of w.exercises) if (names.includes(ex.name) && !out[ex.name] && ex.sets.length) out[ex.name] = { date: w.date, sets: ex.sets };
    warm = lastWarmReps(hist);
  } catch (e) { console.warn(e); }
  return { perf: out, warm };
}

export async function workoutView(root) {
  state = state || loadDraft();
  if (!state) { navigate('/'); return; }

  // Mémoire des charges : dernière séance de chaque exercice (conservée dans le brouillon)
  if (!state.last) {
    const lp = await lastPerformances(state.exercises.map((e) => e.name));
    state.last = lp.perf; state.lastWarm = lp.warm;
    state.exercises.forEach((ex) => {      // autant de séries que la dernière fois
      const l = state.last[ex.name];
      if (l && ex.sets.length === 1 && !ex.sets[0].done && ex.sets[0].weight === '' && ex.sets[0].reps === '') {
        ex.sets = l.sets.slice(0, 6).map(() => ({ reps: '', weight: '', done: false }));
      }
    });
    saveDraft();
  }
  if (state.warm === undefined) {            // échauffement de cette séance (réglages du Profil)
    const first = state.exercises[0], top = Math.max(0, ...(state.last?.[first?.name]?.sets || []).map((x) => num(x.weight)));
    state.warm = buildWarm(getSettings().warm, top);
    saveDraft();
  }
  const lib = await loadLibrary().catch(() => new Map());
  const libOf = (name) => lib.get(name.trim().toLowerCase()) || {};

  const draw = () => {
    const scroll = window.scrollY;
    root.innerHTML = `
      <div class="stack wk">
        <div class="row between"><h2 style="margin:0">${esc(state.sessionName)}</h2><span class="badge" id="elapsed"></span></div>

        <div class="card rest-set">
          <div class="rs-head"><b>Temps de repos</b><span class="muted">entre chaque série</span></div>
          <div class="seg seg4" role="group" aria-label="Temps de repos">
            ${RESTS.map((r) => `<button type="button" data-rest="${r}" aria-pressed="${state.restSeconds === r}">${r >= 120 ? `${r / 60} min` : `${r} s`}</button>`).join('')}
          </div>
          <button type="button" class="btn ghost block" data-act="rest-now">${icon('timer')} Lancer le repos maintenant</button>
        </div>

        ${warmCardHtml(state.warm, { esc, firstName: state.exercises[0]?.name, lastReps: state.lastWarm || {} })}

        ${state.exercises.map((ex, i) => {
          const L = state.last?.[ex.name], meta = libOf(ex.name);
          return `
          <div class="card ex-card-w" data-ex="${i}">
            <div class="ex-head">
              ${meta.imageUrl ? `<img class="ex-thumb" src="${esc(meta.imageUrl)}" alt="" draggable="false">` : `<span class="ex-thumb ph">${icon('dumbbell')}</span>`}
              <div class="ex-title"><h3>${esc(ex.name)}</h3>${meta.muscleGroup ? `<small class="muted">${esc(meta.muscleGroup)}</small>` : ''}</div>
              <button class="btn ghost sm" data-act="detail">Détail</button>
            </div>
            ${ex.plan ? `<div class="plan-line"><b>${esc(ex.plan.s)} × ${esc(ex.plan.r)}</b>${ex.plan.t ? ` · ${esc(ex.plan.t)}` : ''}${ex.plan.m ? `<small>${esc(ex.plan.m)}</small>` : ''}${ex.plan.alt ? `<small>Alternative : ${esc(ex.plan.alt)}</small>` : ''}</div>` : ''}
            ${L ? `
              <div class="last-box">
                <div class="lb-head"><span>Dernière fois · ${esc(fmtShort(L.date))}</span><button type="button" class="lb-use" data-act="usel">Reprendre</button></div>
                <div class="lb-sets">${L.sets.map((s, j) => `<span class="lb-chip"><i>${j + 1}</i>${nice(s.weight)} kg × ${s.reps}</span>`).join('')}</div>
              </div>` : '<p class="muted first-time">Première fois sur cet exercice : tes charges seront retenues pour la prochaine séance.</p>'}
            ${ex.sets.map((s, j) => {
              const p = L?.sets[Math.min(j, L.sets.length - 1)];
              return `
              <div class="set-row ${s.done ? 'done' : ''}" data-set="${j}">
                <span class="num">${j + 1}</span>
                <div class="stp"><button type="button" class="stp-b" data-step="weight" data-d="-2.5" aria-label="Moins 2,5 kg">−</button>
                  <label class="stp-in"><input inputmode="decimal" placeholder="${p ? nice(p.weight) : '0'}" value="${esc(s.weight)}" data-f="weight" aria-label="Charge série ${j + 1}"><small>kg</small></label>
                  <button type="button" class="stp-b" data-step="weight" data-d="2.5" aria-label="Plus 2,5 kg">+</button></div>
                <div class="stp"><button type="button" class="stp-b" data-step="reps" data-d="-1" aria-label="Moins une répétition">−</button>
                  <label class="stp-in"><input inputmode="numeric" placeholder="${p ? p.reps : '0'}" value="${esc(s.reps)}" data-f="reps" aria-label="Répétitions série ${j + 1}"><small>reps</small></label>
                  <button type="button" class="stp-b" data-step="reps" data-d="1" aria-label="Plus une répétition">+</button></div>
                <button class="set-check" aria-label="Valider la série">✓</button>
              </div>`; }).join('')}
            <button class="btn ghost block add-set" style="margin-top:12px">${icon('plus')} Série</button>
          </div>`; }).join('')}

        <div class="card stack">
          <label class="muted" for="feel">Ressenti</label>
          <select class="input" id="feel">
            <option value="">—</option><option value="1">1 · Très dur</option><option value="2">2 · Dur</option>
            <option value="3">3 · Correct</option><option value="4">4 · Bien</option><option value="5">5 · Excellent</option>
          </select>
          <button class="btn block" id="finish">Terminer et enregistrer</button>
          <button class="btn danger block" id="cancel">Abandonner</button>
        </div>
      </div>`;
    updateElapsed();
    window.scrollTo(0, scroll);
  };

  const updateElapsed = () => {
    const el = root.querySelector('#elapsed');
    if (!el) return;
    const m = Math.floor((Date.now() - state.startedAt) / 60000);
    el.textContent = `${m} min`;
  };
  const elapsedTimer = setInterval(updateElapsed, 30000);

  draw();

  const setVal = (exIdx, j, f, v) => {
    state.exercises[exIdx].sets[j][f] = v;
    saveDraft();
    const inp = root.querySelector(`[data-ex="${exIdx}"] [data-set="${j}"] [data-f="${f}"]`);
    if (inp) inp.value = v;
  };

  root.onclick = (e) => {
    if (e.target.closest('.warm-card')) { warmClick(e, state.warm, { save: saveDraft, redraw: draw, vibrate, lastReps: state.lastWarm || {} }); return; }
    const exEl = e.target.closest('[data-ex]');
    const exIdx = exEl ? Number(exEl.dataset.ex) : null;
    const rowEl = e.target.closest('[data-set]');
    const j = rowEl ? Number(rowEl.dataset.set) : null;

    const restBtn = e.target.closest('[data-rest]');
    if (restBtn) { state.restSeconds = Number(restBtn.dataset.rest); saveDraft(); root.querySelectorAll('[data-rest]').forEach((b) => b.setAttribute('aria-pressed', String(b === restBtn))); vibrate(8); return; }
    if (e.target.closest('[data-act="rest-now"]')) { startRest(state.restSeconds, 'Repos'); vibrate(10); return; }

    const stp = e.target.closest('[data-step]');
    if (stp && rowEl) {
      const f = stp.dataset.step, d = Number(stp.dataset.d);
      const L = state.last?.[state.exercises[exIdx].name];
      const cur = state.exercises[exIdx].sets[j][f];
      const fallback = cur === '' ? (L ? (L.sets[Math.min(j, L.sets.length - 1)] || {})[f] : 0) : cur;
      const v = Math.max(0, num(fallback) + d);
      setVal(exIdx, j, f, f === 'weight' ? nice(v).replace(',', '.') : String(Math.round(v)));
      vibrate(6);
      return;
    }

    if (e.target.closest('[data-act="detail"]')) {
      const name = state.exercises[exIdx].name, m = libOf(name);
      openExerciseDetail({ ...m, name, images: m.images || (m.imageUrl ? [m.imageUrl] : []) });
      return;
    }
    if (e.target.closest('[data-act="usel"]')) {       // reprendre les charges de la dernière séance
      const ex = state.exercises[exIdx], L = state.last[ex.name];
      ex.sets = L.sets.slice(0, 8).map((s, k) => ({ weight: String(s.weight), reps: String(s.reps), done: ex.sets[k]?.done || false }));
      saveDraft(); draw(); toast('Charges de la dernière séance reprises'); return;
    }
    if (e.target.closest('.set-check')) {
      const s = state.exercises[exIdx].sets[j];
      s.done = !s.done;
      if (s.done) {                                     // champs vides : on valide avec les valeurs de la dernière fois
        const L = state.last?.[state.exercises[exIdx].name], p = L?.sets[Math.min(j, L.sets.length - 1)];
        if (s.weight === '' && p) s.weight = String(p.weight);
        if (s.reps === '' && p) s.reps = String(p.reps);
      }
      saveDraft();
      draw();
      if (s.done) {
        root.querySelector(`[data-ex="${exIdx}"] [data-set="${j}"]`)?.classList.add('pop'); vibrate(12);
        startRest(state.restSeconds, state.exercises[exIdx].name);
      }
    } else if (e.target.closest('.add-set')) {
      const last = state.exercises[exIdx].sets.at(-1);
      state.exercises[exIdx].sets.push({ reps: last.reps, weight: last.weight, done: false });
      saveDraft(); draw();
    } else if (e.target.id === 'finish') {
      finishWorkout(root.querySelector('#feel').value);
    } else if (e.target.id === 'cancel') {
      if (confirm('Abandonner la séance en cours ?')) { discard(); navigate('/'); }
    }
  };

  root.oninput = (e) => {
    if (warmInput(e, state.warm, saveDraft)) return;
    const row = e.target.closest('[data-set]');
    if (!row || !e.target.dataset.f) return;
    const i = Number(e.target.closest('[data-ex]').dataset.ex);
    state.exercises[i].sets[Number(row.dataset.set)][e.target.dataset.f] = e.target.value;
    saveDraft();
  };

  return { unmount() { clearInterval(elapsedTimer); root.onclick = null; root.oninput = null; } };
}

export function discard() {
  localStorage.removeItem('workoutDraft');
  stopRest();
  state = null;
}

async function finishWorkout(feeling) {
  const exercises = state.exercises
    .map((ex) => ({
      name: ex.name,
      sets: ex.sets
        .filter((s) => s.done && (s.reps !== '' || s.weight !== ''))
        .map((s) => ({ reps: Number(s.reps) || 0, weight: Number(String(s.weight).replace(',', '.')) || 0 }))
    }))
    .filter((ex) => ex.sets.length);

  if (!exercises.length) { toast('Valide au moins une série'); return; }
  const warmup = warmPayload(state.warm);

  try {
    await addDoc(collection(db, 'workouts'), {
      userId: getUser().uid,
      sessionId: state.sessionId,
      sessionName: state.sessionName,
      date: dayKey(),
      startedAt: state.startedAt,
      durationSec: Math.round((Date.now() - state.startedAt) / 1000),
      feeling: feeling ? Number(feeling) : null,
      exercises,
      ...(warmup ? { warmup } : {}),
      createdAt: serverTimestamp()
    });
    setDoc(doc(db, 'users', getUser().uid), { workoutCount: increment(1), lastWorkoutAt: serverTimestamp() }, { merge: true }).catch(() => {});
    discard();
    toast('Séance enregistrée');
    navigate('/stats');
  } catch (e) {
    console.error(e);
    toast('Erreur d\'enregistrement (brouillon conservé)');
  }
}
