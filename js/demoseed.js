// Compte de démonstration : remplit SON PROPRE compte avec ~20 semaines de séances et de mesures cohérentes.
// Le bouton n'apparaît que pour l'e-mail ci-dessous (aucun autre utilisateur ne le voit) et n'écrit que sous son propre uid.
import { db } from './firebase-config.js';
import { collection, query, where, getDocs, addDoc, setDoc, deleteDoc, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getUser } from './auth.js';
import { PROGRAMS } from './sharecode.js';
import { esc, toast, dayKey } from './ui.js';

export const DEMO_EMAILS = ['demo@stride-me.app', 'demo@ironlog.app'];
export const isDemoAccount = (u) => !!u?.email && DEMO_EMAILS.includes(u.email.toLowerCase());

const WEEKS = 20;

/* Charge de départ (kg) et gain par semaine, par exercice. Gainage : secondes. Cardio : minutes. */
const LOAD = {
  'Tirage vertical': [55, 1], 'Rowing assis': [50, 1], 'Curl marteau': [14, 0.25], 'Curl incliné': [10, 0.25], 'Flexions des poignets': [25, 0.5],
  'Développé incliné': [50, 1], 'Développé couché': [70, 1.25], 'Pec deck': [40, 0.75], 'Extension triceps corde': [30, 0.75], 'Extension triceps au-dessus de la tête': [22.5, 0.5],
  'Presse à cuisses': [140, 3], 'Leg curl': [45, 1], 'Leg extension': [50, 1], 'Mollets debout': [80, 1.5],
  'Élévations latérales': [8, 0.2], 'Face pull': [25, 0.5], Shrugs: [60, 1.5], Gainage: [0, 0], 'Crunch poulie': [35, 0.75], Cardio: [0, 0]
};

const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const dow = (key) => new Date(key + 'T12:00:00Z').getUTCDay();   // 0 = dimanche
const r05 = (x) => Math.max(0, Math.round(x * 2) / 2);

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** Construit tout le jeu de données (pur, sans réseau). */
export function buildDemo(today = dayKey()) {
  const rand = rng(2008);
  let start = addDays(today, -WEEKS * 7);
  while (dow(start) !== 1) start = addDays(start, 1);                          // un lundi
  const prog = PROGRAMS[2008];
  const cycle = prog.sessions.map((s, i) => ({ id: 'demo-' + (i + 1), name: s.name, exercises: [...s.exercises], plan: s.plan }));

  // Repos : week-ends + 3 petites pauses (vacances, maladie…)
  const holidays = new Set([addDays(start, 5 * 7 + 1), addDays(start, 5 * 7 + 2), addDays(start, 5 * 7 + 3), addDays(start, 5 * 7 + 4),
    addDays(start, 11 * 7 + 2), addDays(start, 11 * 7 + 3), addDays(start, 15 * 7), addDays(start, 15 * 7 + 1), addDays(start, 15 * 7 + 2)]);
  const restDates = [];
  const lastKey = addDays(today, 90);
  for (let k = start; k <= lastKey; k = addDays(k, 1)) if (dow(k) === 0 || dow(k) === 6 || holidays.has(k)) restDates.push(k);
  const rotation = { cycle, startDate: start, restDates, planned: {}, anchors: {} };

  // Séances passées (hier au plus tard : aujourd'hui reste libre pour la démo en direct)
  const workouts = [];
  let n = 0;
  for (let k = start; k < today; k = addDays(k, 1)) {
    if (restDates.includes(k)) continue;
    const s = cycle[n % cycle.length]; n++;
    const week = Math.floor((new Date(k) - new Date(start)) / (7 * 86400000));
    const deload = week % 6 === 5 ? 0.9 : 1;                                    // semaine allégée toutes les 6 semaines
    const exercises = s.exercises.map((name) => {
      const [base, gain] = LOAD[name] || [20, 0.5];
      const pl = s.plan[name] || {};
      const nSets = pl.s || 3;
      const [lo, hi] = String(pl.r || '10').replace(/[^\d–-]/g, '').split(/[–-]/).map(Number);
      const high = hi || lo || 10, low = lo || high;
      const sets = [];
      for (let i = 0; i < nSets; i++) {
        let reps, weight;
        if (name === 'Cardio') { reps = Math.round(30 + week * 0.75 + rand() * 4); weight = 0; }
        else if (name === 'Gainage') { reps = Math.round(45 + week * 1.4 - i * 3 + rand() * 4); weight = 0; }
        else {
          weight = r05((base + gain * week) * deload);
          reps = Math.max(low, Math.min(high, Math.round(high - rand() * (high - low + 1) - (i > 0 ? i * 0.6 : 0))));
        }
        sets.push({ reps, weight });
      }
      return { name, sets };
    });
    const strength = s.id !== 'demo-5';
    const startedAt = new Date(k + 'T17:' + String(10 + Math.floor(rand() * 40)).padStart(2, '0') + ':00').getTime();
    const w = {
      sessionId: s.id, sessionName: s.name, date: k, startedAt,
      durationSec: Math.round((strength ? 3300 + rand() * 1500 : 2100 + rand() * 900)),
      feeling: 3 + Math.round(rand() * 2 - (deload < 1 ? 0 : rand() * 0.8)),
      exercises
    };
    if (strength) {
      const top = exercises[0].sets[0].weight;
      w.warmup = {
        ramp: [0.4, 0.6, 0.8].map((p, i) => ({ weight: r05(top * p), reps: [10, 6, 3][i] })),
        custom: [
          { name: 'Tractions', sets: [0, 1, 2].map((i) => ({ reps: Math.round(5 + week * 0.25 - i * 0.7 + rand()) })) },
          { name: 'Pompes', sets: [0, 1, 2].map((i) => ({ reps: Math.round(14 + week * 0.4 - i + rand() * 2) })) },
          { name: 'Dips', sets: [0, 1, 2].map((i) => ({ reps: Math.round(7 + week * 0.3 - i * 0.6 + rand()) })) }
        ]
      };
    }
    workouts.push(w);
  }

  // Mesures : un relevé tous les 10 jours (légère prise de masse)
  const measurements = [];
  const T = [['weight', 76.4, 79.6], ['shoulders', 111, 115.5], ['chest', 98, 102.5], ['waist', 82, 81.2], ['hips', 96, 97], ['biceps', 33.8, 36.2], ['thigh', 55.5, 58.8], ['calf', 36.5, 38]];
  const nM = Math.floor((WEEKS * 7) / 10);
  for (let i = 0; i <= nM; i++) {
    const date = addDays(start, i * 10);
    if (date >= today) break;
    const t = i / nM, m = { date };
    for (const [f, a, b] of T) m[f] = Math.round((a + (b - a) * t + (rand() - 0.5) * (f === 'weight' ? 0.5 : 0.3)) * 10) / 10;
    if (i === 0) m.height = 178;
    measurements.push(m);
  }
  return { rotation, workouts, measurements, start };
}

async function eachChunk(items, size, fn, onStep) {
  for (let i = 0; i < items.length; i += size) { await Promise.all(items.slice(i, i + size).map(fn)); onStep?.(Math.min(items.length, i + size)); }
}

export async function seedDemo(say = () => {}) {
  const u = getUser(), uid = u.uid;
  if (!isDemoAccount(u)) throw new Error('Réservé au compte de démonstration');
  const { rotation, workouts, measurements } = buildDemo();

  say('Nettoyage de l\'ancien contenu…');
  for (const col of ['workouts', 'measurements']) {
    const snap = await getDocs(query(collection(db, col), where('userId', '==', uid)));
    await eachChunk(snap.docs, 10, (d) => deleteDoc(doc(db, col, d.id)));
  }
  say('Planning…');
  await setDoc(doc(db, 'schedule_rotation', uid), { ...rotation, userId: uid });
  await eachChunk(workouts, 8, (w) => addDoc(collection(db, 'workouts'), { ...w, userId: uid, createdAt: serverTimestamp() }), (n) => say(`Séances ${n}/${workouts.length}…`));
  await eachChunk(measurements, 8, (m) => addDoc(collection(db, 'measurements'), { ...m, userId: uid, createdAt: serverTimestamp() }));
  await setDoc(doc(db, 'users', uid), { workoutCount: workouts.length, lastWorkoutAt: serverTimestamp() }, { merge: true });
  return { workouts: workouts.length, measurements: measurements.length };
}

/** Carte dans Profil (rien du tout si ce n'est pas le compte démo). */
export function mountDemoSeed(host) {
  if (!host || !isDemoAccount(getUser())) return;
  host.innerHTML = `<div class="card stack"><h3>Compte de démonstration</h3>
    <p class="muted">Remplit ce compte avec ${WEEKS} semaines de séances, d'échauffements et de mesures. Remplace tout le contenu actuel de CE compte. Le compte est en lecture seule pour les visiteurs : il faut le déverrouiller dans Firestore (document config/demo_unlock) pour le remplir.</p>
    <button class="btn block" id="demoSeedBtn" type="button">Remplir avec des données de démo</button>
    <small class="muted" id="demoSeedMsg" role="status"></small></div>`;
  const btn = host.querySelector('#demoSeedBtn'), msg = host.querySelector('#demoSeedMsg');
  btn.addEventListener('click', async () => {
    if (!confirm('Remplacer toutes les séances et mesures de ce compte par des données de démo ?')) return;
    btn.disabled = true;
    try {
      const r = await seedDemo((t) => { msg.textContent = t; });
      msg.textContent = `Terminé : ${r.workouts} séances et ${r.measurements} relevés. Recharge la page.`;
      toast('Données de démo ajoutées');
    } catch (e) {
      console.error(e);
      msg.textContent = e.code === 'permission-denied'
        ? 'Ce compte est verrouillé (lecture seule), c\'est voulu. Pour le remplir : crée le document config/demo_unlock dans Firestore, réessaie, puis supprime ce document.'
        : `Échec : ${e.code || ''} ${e.message || e}`;     // la cause est affichée à l'écran
      btn.disabled = false;
    }
  });
}

/** Page #/demo : montre l'e-mail vu par l'appli et le bouton si c'est le compte démo (sert aussi à diagnostiquer). */
export function demoView(root) {
  const u = getUser();
  root.innerHTML = `<div class="stack"><h2>Compte de démo</h2>
    <div class="card stack"><small class="muted">Connecté en tant que</small><b>${esc(u?.email || '(aucun e-mail : compte anonyme ou Google sans e-mail)')}</b></div>
    <div id="demoSeed"></div></div>`;
  if (isDemoAccount(u)) mountDemoSeed(root.querySelector('#demoSeed'));
  else root.querySelector('#demoSeed').innerHTML = `<div class="card stack"><b>Ce n'est pas le compte démo.</b><p class="muted">Le bouton n'apparaît que pour : ${DEMO_EMAILS.map(esc).join(' ou ')}. Déconnecte-toi (Profil) puis connecte-toi avec cette adresse.</p></div>`;
}
