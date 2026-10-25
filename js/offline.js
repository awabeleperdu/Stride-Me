// Mode hors ligne : en salle, pas de réseau. Firestore garde déjà les écritures dans son cache local et les envoie
// tout seul à la reconnexion, mais ses promesses ne se terminent QU'APRÈS réponse du serveur : sans ce garde-fou,
// « Terminer la séance » resterait bloqué sans réseau. Ici on ne bloque jamais l'utilisateur plus de quelques secondes.
import { db } from './firebase-config.js';
import { waitForPendingWrites } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { toast } from './ui.js';

export const QUEUED = Symbol('queued');

/** Attend l'écriture, mais rend la main après `ms` : la donnée est alors en file d'attente locale (partira à la reconnexion). */
export function queued(p, ms = 3000) {
  let timer;
  const t = new Promise((r) => { timer = setTimeout(() => r(QUEUED), navigator.onLine === false ? 250 : ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

let chip = null;
const ensureChip = () => {
  if (chip) return chip;
  chip = document.createElement('div');
  chip.id = 'offChip'; chip.setAttribute('role', 'status');
  document.body.appendChild(chip);
  return chip;
};

const syncNow = async () => {
  try {
    await Promise.race([waitForPendingWrites(db), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))]);
    return true;
  } catch { return false; }
};

function show(on, text) { const c = ensureChip(); c.textContent = text || ''; c.classList.toggle('on', on); }

/** À appeler une fois au démarrage : pastille « Hors ligne » + message à la resynchronisation. */
export function initOffline() {
  const off = () => show(true, '📡 Hors ligne · tes séances sont gardées et envoyées à la reconnexion');
  const on = async () => {
    show(true, '🔄 Reconnexion, synchronisation…');
    if (await syncNow()) { show(false); toast('Données synchronisées ✓'); }
    else show(false);
  };
  window.addEventListener('offline', off);
  window.addEventListener('online', on);
  if (navigator.onLine === false) off();
}
