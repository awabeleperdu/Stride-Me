// Mode hors ligne : en salle, pas de réseau. Firestore garde déjà les écritures dans son cache local et les envoie
// tout seul à la reconnexion, mais ses promesses ne se terminent QU'APRÈS réponse du serveur : sans ce garde-fou,
// « Terminer la séance » resterait bloqué sans réseau. Ici on ne bloque jamais l'utilisateur plus de quelques secondes.
import { db } from './firebase-config.js';
import { waitForPendingWrites, getDocs, getDoc, getDocsFromCache, getDocFromCache } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { toast } from './ui.js';

export const QUEUED = Symbol('queued');

/** Attend l'écriture, mais rend la main après `ms` : la donnée est alors en file d'attente locale (partira à la reconnexion). */
export function queued(p, ms = 3000) {
  let timer;
  const t = new Promise((r) => { timer = setTimeout(() => r(QUEUED), navigator.onLine === false ? 250 : ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

/* ---------- Lectures rapides ----------
   Sans réseau (ou réseau très lent), Firestore peut attendre plusieurs secondes avant de répondre avec son cache.
   Ici : si le serveur ne répond pas vite, on lit directement la copie gardée sur le téléphone. */
const FAST = () => (navigator.onLine === false ? 120 : 2500);
const settle = (p) => p.then((v) => ({ v }), (e) => ({ e }));
const gone = () => new Promise((r) => setTimeout(() => r(null), FAST()));

export async function readDocs(q) {
  const p = getDocs(q); p.catch(() => {});
  const first = await Promise.race([settle(p), gone()]);
  if (first) { if (first.e) throw first.e; return first.v; }
  try { const c = await getDocsFromCache(q); if (!c.empty || navigator.onLine === false) return c; } catch { /* pas en cache */ }
  return p;
}

export async function readDoc(ref) {
  const p = getDoc(ref); p.catch(() => {});
  const first = await Promise.race([settle(p), gone()]);
  if (first) { if (first.e) throw first.e; return first.v; }
  try { const c = await getDocFromCache(ref); if (c.exists()) return c; } catch { /* pas en cache */ }
  return p;
}

/* ---------- Photos des séances disponibles hors ligne ----------
   Quand l'appli a du réseau, elle garde sur le téléphone les photos des exercices de tes séances. */
const IMG_CACHE = 'img-stride';
let warmed = new Set();
export async function warmImages(urls) {
  try {
    if (!('caches' in window) || navigator.onLine === false) return;
    const todo = [...new Set((urls || []).filter((u) => u && !String(u).startsWith('data:')))].filter((u) => !warmed.has(u)).slice(0, 160);
    if (!todo.length) return;
    todo.forEach((u) => warmed.add(u));
    const c = await caches.open(IMG_CACHE);
    const one = async (u) => {
      const abs = new URL(u, location.href).href;
      if (await c.match(abs)) return;
      const same = new URL(abs).origin === location.origin;
      try { const r = await fetch(abs, same ? {} : { mode: 'no-cors' }); if (r.ok || r.type === 'opaque') await c.put(abs, r); } catch { warmed.delete(u); }
    };
    for (let i = 0; i < todo.length; i += 4) await Promise.all(todo.slice(i, i + 4).map(one));
  } catch { /* le cache de photos est un bonus : jamais d'erreur visible */ }
}

/* ---------- Petit point d'état (coin haut droit) ---------- */
let chip = null, pop = null, closeT = 0;
const ensureChip = () => {
  if (chip) return chip;
  chip = document.createElement('button');
  chip.id = 'offChip'; chip.type = 'button'; chip.setAttribute('aria-label', 'État de la connexion');
  chip.innerHTML = '<i></i><b class="off-pop" role="status"></b>';
  pop = chip.querySelector('.off-pop');
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !chip.classList.contains('open');
    chip.classList.toggle('open', open);
    clearTimeout(closeT);
    if (open) closeT = setTimeout(() => chip.classList.remove('open'), 8000);
  });
  document.addEventListener('click', () => chip && chip.classList.remove('open'));
  document.body.appendChild(chip);
  return chip;
};

const syncNow = async () => {
  try {
    await Promise.race([waitForPendingWrites(db), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))]);
    return true;
  } catch { return false; }
};

/** state : 'off' (point jaune) · 'sync' (point vert qui bat) · 'ok' (point vert fixe) · null (caché) */
function show(state, text) {
  const c = ensureChip();
  c.classList.toggle('on', !!state);
  c.classList.remove('off', 'sync', 'ok'); if (state) c.classList.add(state);
  c.classList.remove('open');
  pop.textContent = text || '';
}

/** À appeler une fois au démarrage : point d'état « Hors ligne » + resynchronisation à la reconnexion. */
export function initOffline() {
  const off = () => show('off', 'Hors ligne. Tes séances sont gardées sur ton téléphone et seront envoyées dès que le réseau revient.');
  let hideT = 0;
  const on = async () => {
    clearTimeout(hideT);
    show('sync', 'Réseau revenu. Synchronisation de tes données…');
    if (await syncNow()) { show('ok', 'Tout est synchronisé ✓'); hideT = setTimeout(() => show(null), 3500); }
    else show(null);
  };
  window.addEventListener('offline', off);
  window.addEventListener('online', on);
  if (navigator.onLine === false) off();
}
