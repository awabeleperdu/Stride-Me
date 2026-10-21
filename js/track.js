// Suivi d'usage minimal, visible par l'utilisateur dans Profil › Mes appareils et par l'administrateur :
// dernière activité, nombre d'ouvertures, appareil (navigateur + système). Aucune donnée d'entraînement n'est envoyée ici.
import { db } from './firebase-config.js';
import { doc, getDoc, getDocFromServer, setDoc, increment, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const ID_KEY = 'deviceId';

export function deviceId() {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) { id = (crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2)).replace(/-/g, '').slice(0, 20); localStorage.setItem(ID_KEY, id); }
    return id;
  } catch { return 'inconnu'; }
}

/** Nom lisible déduit du navigateur (le web ne donne pas le vrai nom de l'appareil). */
export function deviceInfo() {
  const ua = navigator.userAgent || '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
  const platform = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux|X11/.test(ua) ? 'Linux' : 'Inconnu';
  const mobile = /Mobi|Android|iPhone|iPad/.test(ua);
  const model = platform === 'Android' ? (ua.match(/Android [\d.]+; ([^;)]+)/)?.[1] || '').trim() : platform === 'iOS' ? (/iPad/.test(ua) ? 'iPad' : 'iPhone') : '';
  const name = `${browser} · ${model && model !== 'K' ? model : platform}`;
  return { name, platform, mobile };
}

/** À appeler une fois connecté. Compte une « ouverture » par session de navigateur. Ne bloque jamais l'appli. */
export async function trackUsage(user) {
  try {
    const first = sessionStorage.getItem('tracked') !== user.uid;
    const uref = doc(db, 'users', user.uid);
    const snap = await getDoc(uref);
    const data = { email: user.email || null, lastSeenAt: serverTimestamp() };
    if (!snap.exists() || !snap.data().createdAt) data.createdAt = serverTimestamp();
    if (first) data.loginCount = increment(1);
    await setDoc(uref, data, { merge: true });

    const dref = doc(db, 'users', user.uid, 'devices', deviceId());
    const dsnap = await getDoc(dref);
    const info = deviceInfo();
    const d = { ...info, lastSeenAt: serverTimestamp() };
    if (!dsnap.exists()) { d.firstSeenAt = serverTimestamp(); d.label = ''; }
    if (first) d.openCount = increment(1);
    await setDoc(dref, d, { merge: true });
    sessionStorage.setItem('tracked', user.uid);
  } catch (e) { console.warn('Suivi d\'usage indisponible', e); }
}

/** Compte bloqué par l'administrateur ? */
export async function isBlocked(user) {
  try { return (await getDoc(doc(db, 'users', user.uid))).data()?.disabled === true; } catch { return false; }
}

/** Lit un document en privilégiant le serveur (évite qu'un vieux cache hors-ligne réponde « n'existe pas »). */
async function readDoc(ref) {
  try { return await getDocFromServer(ref); }
  catch (e) { if (e?.code === 'unavailable' || /offline/i.test(e?.message || '')) return getDoc(ref); throw e; }
}

/** Administrateur = un document admins/<uid> existe (création manuelle dans la console Firebase). */
export async function isAdmin(user) {
  try { return (await readDoc(doc(db, 'admins', user.uid))).exists(); }
  catch (e) { console.warn(`[admin] lecture de admins/${user.uid} impossible :`, e.code || '', e.message || e); return false; }
}

/** Temps écoulé en français : « il y a 3 h », « il y a 12 j ». */
export const ago = (ms) => {
  if (!ms) return 'jamais';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  if (s < 86400 * 60) return `il y a ${Math.round(s / 86400)} j`;
  return `il y a ${Math.round(s / (86400 * 30))} mois`;
};
export const toMs = (v) => (v == null ? 0 : typeof v === 'number' ? v : v.toMillis ? v.toMillis() : v.seconds ? v.seconds * 1000 : 0);
