// Catalogue d'exercices intégré (≈620 exercices + 2 images chacun, base libre free-exercise-db, domaine public).
// Données : assets/catalog/catalog.json — images : assets/catalog/<id>-0.webp / -1.webp (hébergées dans le repo GitHub, 0 octet en base Firestore).
import { db } from './firebase-config.js';
import { zoneOfEntry, ZONES } from './zones.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const BASE = 'assets/catalog/';
const CDN = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const imgUrl = (id, i) => (typeof window !== 'undefined' && (window.__CATALOG__ || window.__CDN__)) ? `${CDN}${id}/${i}.jpg` : `${BASE}${id}-${i}.webp`;
let cache = null;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export async function loadCatalog() {
  if (cache) return cache;
  let list = (typeof window !== 'undefined' && window.__CATALOG__) || null;
  if (!list) { try { list = await (await fetch(BASE + 'catalog.json')).json(); } catch { list = []; } }
  const base = list.map(e => ({ ...e, key: norm(e.n + ' ' + e.en + ' ' + e.m + ' ' + e.eq), img: imgUrl(e.id, 0), img2: e.i > 1 ? imgUrl(e.id, 1) : null }));
  // Exercices et machines ajoutés par l'admin : visibles par tous, affichés en premier
  let shared = [];
  try {
    const snap = await getDocs(collection(db, 'shared_exercises'));
    shared = snap.docs.map((d) => { const x = d.data(); return { id: 'shared-' + d.id, n: x.name, en: x.name, m: x.muscleGroup || 'Autre', eq: x.equipment || 'Autre', i: x.imageUrl ? 1 : 0, t: x.steps || [], p: [], s: [], lv: '', shared: true, key: norm(`${x.name} ${x.muscleGroup} ${x.equipment}`), img: x.imageUrl || null, img2: null }; })
      .sort((a, b) => a.n.localeCompare(b.n));
  } catch { /* hors ligne ou droits : on garde le catalogue de base */ }
  cache = [...shared, ...base];
  return cache;
}
export const resetCatalog = () => { cache = null; };
export const MUSCLES = ['Pectoraux', 'Dos', 'Épaules', 'Biceps', 'Triceps', 'Avant-bras', 'Abdos', 'Lombaires', 'Jambes', 'Fessiers', 'Mollets'];
export const EQUIPMENT = ['Barre', 'Haltères', 'Poulie', 'Machine', 'Poids du corps', 'Kettlebell', 'Élastique', 'Barre EZ'];

export function searchCatalog(list, q = '', { muscle = '', eq = '' } = {}) {
  const words = norm(q).split(' ').filter(Boolean);
  return list.filter(e => (!muscle || e.m === muscle) && (!eq || e.eq === eq) && words.every(w => e.key.includes(w)));
}
// Retrouve l'entrée du catalogue qui correspond à un nom d'exercice saisi (pour afficher automatiquement l'image).
export function matchByName(list, name) {
  const n = norm(name);
  return list.find(e => norm(e.n) === n || norm(e.en) === n) || null;
}
// Convertit une entrée en document `exercises` (aucune image uploadée : imageUrl pointe vers le dossier du repo).
// Noms courants (suggestions du planning) → exercice du catalogue, pour afficher l'image sans rien configurer.
export const ALIASES = { 'développé couché': 'Barbell Bench Press - Medium Grip', 'développé incliné haltères': 'Incline Dumbbell Press', 'développé militaire': 'Standing Military Press', 'élévations latérales': 'Side Lateral Raise', 'dips': 'Dips - Chest Version', 'pompes': 'Pushups', 'tractions': 'Pullups', 'rowing barre': 'Bent Over Barbell Row', 'tirage horizontal': 'Seated Cable Rows', 'tirage vertical': 'Wide-Grip Lat Pulldown', 'curl biceps': 'Barbell Curl', 'curl marteau': 'Hammer Curls', 'triceps poulie': 'Triceps Pushdown', 'barre au front': 'EZ-Bar Skullcrusher', 'squat': 'Barbell Squat', 'presse à cuisses': 'Leg Press', 'fentes': 'Dumbbell Lunges', 'leg curl': 'Lying Leg Curls', 'leg extension': 'Leg Extensions', 'soulevé de terre roumain': 'Romanian Deadlift', 'mollets debout': 'Standing Calf Raises', 'gainage': 'Plank', 'crunch': 'Crunches',
  // Programme intégré (code 2008)
  'développé incliné': 'Incline Dumbbell Press', 'pec deck': 'Butterfly', 'extension triceps corde': 'Triceps Pushdown - Rope Attachment', 'extension triceps au-dessus de la tête': 'Cable Rope Overhead Triceps Extension', 'rowing assis': 'Seated Cable Rows', 'face pull': 'Face Pull', 'curl incliné': 'Incline Dumbbell Curl', 'flexions des poignets': 'Palms-Up Dumbbell Wrist Curl Over A Bench', 'crunch poulie': 'Cable Crunch', 'shrugs': 'Dumbbell Shrug' };
export const keyOf = (s) => String(s || '').trim().toLowerCase();
export const toLibEntry = (e) => ({ name: e.n, muscleGroup: e.m, equipment: e.eq, instructions: (e.t || []).join('\n'), steps: e.t || [], primary: e.p || [], secondary: e.s || [], level: e.lv || '', images: [e.img, e.img2].filter(Boolean), imageUrl: e.img, catalogId: e.id });
export const toExerciseDoc = e => ({ name: e.n, muscleGroup: e.m, equipment: e.eq, instructions: (e.t || []).join('\n'), imageUrl: e.img, catalogId: e.id });

// Sélecteur plein écran : openCatalogPicker({ onPick(entry) }) — recherche + filtres muscle/matériel + vignettes.
export async function openCatalogPicker({ onPick, title = 'Catalogue d\'exercices' } = {}) {
  const list = await loadCatalog();
  const el = document.createElement('div');
  el.className = 'cat-picker';
  el.innerHTML = `<div class="cat-sheet" role="dialog" aria-label="${esc(title)}">
    <div class="cat-head"><strong>${esc(title)}</strong><button class="cat-x" aria-label="Fermer">✕</button></div>
    <input class="cat-q" type="search" placeholder="Rechercher (ex. développé, curl, presse…)" autocomplete="off">
    <div class="cat-chips" data-k="zone"></div><div class="cat-chips" data-k="muscle"></div><div class="cat-chips" data-k="eq"></div>
    <div class="cat-count"></div><div class="cat-list"></div></div>`;
  document.body.appendChild(el);
  const st = { q: '', zone: '', muscle: '', eq: '', shown: 40 };
  const $ = s => el.querySelector(s);
  const chips = (k, arr) => { const h = $(`[data-k=${k}]`); h.innerHTML = ['', ...arr].map(v => `<button class="cat-chip${st[k] === v ? ' on' : ''}" data-v="${esc(v)}">${v || (k === 'zone' ? 'Toutes zones' : k === 'muscle' ? 'Tous muscles' : 'Tout matériel')}</button>`).join(''); };
  const render = () => {
    chips('zone', ZONES.map(z => z.label)); chips('muscle', MUSCLES); chips('eq', EQUIPMENT);
    const zid = ZONES.find(z => z.label === st.zone)?.id;
    const res = searchCatalog(list, st.q, st).filter(e => !zid || zoneOfEntry(e) === zid);
    $('.cat-count').textContent = `${res.length} exercice${res.length > 1 ? 's' : ''}`;
    $('.cat-list').innerHTML = res.slice(0, st.shown).map(e => `<button class="cat-row" data-id="${esc(e.id)}">
      ${e.img ? `<img src="${esc(e.img)}" alt="" loading="lazy" width="64" height="64">` : '<i class="cat-ph"></i>'}<span><b>${esc(e.n)}</b><small>${e.shared ? '★ Partagé · ' : ''}${esc(e.m)} · ${esc(e.eq)}</small></span></button>`).join('')
      + (res.length > st.shown ? '<button class="cat-more">Voir plus</button>' : '');
  };
  const close = () => el.remove();
  el.addEventListener('click', ev => {
    const t = ev.target;
    if (t === el || t.closest('.cat-x')) return close();
    const chip = t.closest('.cat-chip'); if (chip) { const k = chip.parentElement.dataset.k; st[k] = chip.dataset.v; st.shown = 40; return render(); }
    if (t.closest('.cat-more')) { st.shown += 40; return render(); }
    const row = t.closest('.cat-row'); if (row) { const e = list.find(x => x.id === row.dataset.id); close(); onPick && onPick(e); }
  });
  $('.cat-q').addEventListener('input', ev => { st.q = ev.target.value; st.shown = 40; render(); });
  render(); $('.cat-q').focus();
}
