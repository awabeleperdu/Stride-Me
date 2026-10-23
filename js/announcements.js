// Annonces de l'administrateur côté utilisateur : message, sondage ou question (à tous ou à une personne).
// Données : announcements/{id} (écrit par l'admin) + announcements/{id}/responses/{uid} (écrit par l'utilisateur, une seule fois).
import { db } from './firebase-config.js';
import { collection, query, where, getDocs, getDoc, setDoc, doc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getUser } from './auth.js';
import { esc, toast, vibrate } from './ui.js';
import { sheet } from './sharecode.js';
import { isAdmin } from './track.js';

export const TYPE_LABEL = { message: 'Annonce', poll: 'Sondage', question: 'Question' };
/** Situations : look du message (icône + couleur). Choisies par l'admin. */
export const STYLES = {
  info: { label: 'Information', ico: '💬' },
  prevention: { label: 'Prévention', ico: '🛡️' },
  warning: { label: 'Avertissement', ico: '⚠️' },
  ban: { label: 'Bannissement', ico: '🚫' }
};
export const styleOf = (a) => STYLES[a.style] ? a.style : 'info';
const LATER = new Set();            // « plus tard » : ne pas reproposer pendant cette session

const live = (a) => a.active !== false && !(a.expiresAt && a.expiresAt < Date.now());

/** Annonces actives visibles par l'utilisateur (à tous ou à lui), de la plus récente à la plus ancienne. */
async function visibleAnnouncements() {
  const u = getUser(); if (!u) return [];
  const col = collection(db, 'announcements');
  const [all, mine] = await Promise.all([
    getDocs(query(col, where('target', '==', 'all'))),
    getDocs(query(col, where('targetUid', '==', u.uid)))
  ]);
  const seen = new Map();
  for (const d of [...all.docs, ...mine.docs]) seen.set(d.id, { id: d.id, ...d.data() });
  return [...seen.values()].filter(live).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 20);
}

/** Annonces à traiter (hors bandeaux) : pas encore de réponse. Les obligatoires passent en premier. */
export async function pendingAnnouncements() {
  const u = getUser(); if (!u) return [];
  const list = (await visibleAnnouncements()).filter((a) => a.display !== 'banner');
  const done = await Promise.all(list.map((a) => getDoc(doc(db, 'announcements', a.id, 'responses', u.uid)).then((s) => s.exists()).catch(() => true)));
  return list.filter((_, i) => !done[i]).sort((a, b) => (b.force ? 1 : 0) - (a.force ? 1 : 0));
}

async function respond(a, data) {
  const u = getUser();
  const w = setDoc(doc(db, 'announcements', a.id, 'responses', u.uid), { uid: u.uid, at: Date.now(), ...data });
  // hors ligne, l'écriture reste en file d'attente : on ne bloque pas l'utilisateur plus de 8 s
  await Promise.race([w, new Promise((r) => setTimeout(r, 8000))]);
}

/** Ouvre les annonces en attente, une par une. `auto` : au démarrage (respecte « plus tard »). */
export async function showAnnouncements({ auto = false } = {}) {
  let list = [];
  try { list = await pendingAnnouncements(); } catch (e) { console.warn('[annonces]', e.code || '', e.message || e); return 0; }
  const admin = await isAdmin(getUser()).catch(() => false);
  list = list.filter((a) => !(a.lock && admin));                    // l'admin n'est jamais verrouillé hors de son propre espace
  if (auto) list = list.filter((a) => a.force || !LATER.has(a.id));
  if (!list.length) { if (!auto) toast('Aucune annonce en attente'); return 0; }
  if (auto && !list[0].force) await new Promise((r) => setTimeout(r, 1200));   // les annonces simples attendent que l'appli soit affichée
  const next = (i) => {
    if (i >= list.length) return;
    const a = list[i];
    const s = a.force ? blocker(a) : sheet(TYPE_LABEL[a.type] || 'Annonce', body(a));
    let answered = false;
    const finish = (msg) => { answered = true; toast(msg); vibrate(12); s.close(); setTimeout(() => next(i + 1), 350); };
    const fail = (e) => {
      console.error(e);
      if (e.code === 'permission-denied' && a.force) { LATER.add(a.id); finish('Compte en lecture seule : annonce ignorée'); return; }   // compte démo : ne jamais piéger le visiteur
      toast(e.code === 'permission-denied' ? 'Réponse refusée (compte en lecture seule ?)' : 'Envoi impossible, réessaie');
    };
    if (!a.force) new MutationObserver((_, ob) => { if (!document.body.contains(s.el)) { ob.disconnect(); if (!answered) list.slice(i).forEach((x) => { if (!x.force) LATER.add(x.id); }); } }).observe(document.body, { childList: true });
    const $ = (q) => s.body.querySelector(q);
    if (a.lock) return;                                              // verrou : aucun bouton, reste affiché tant que l'annonce est active
    if (a.type === 'poll') {
      const btn = $('[data-send]'), upd = () => { btn.disabled = !s.body.querySelector('input:checked'); };
      s.body.addEventListener('change', upd); upd();
      btn.onclick = async () => { btn.disabled = true; try { await respond(a, { choice: [...s.body.querySelectorAll('input:checked')].map((x) => Number(x.value)) }); finish('Merci pour ton vote !'); } catch (e) { fail(e); btn.disabled = false; } };
    } else if (a.type === 'question') {
      const btn = $('[data-send]'), ta = $('textarea'), upd = () => { btn.disabled = !ta.value.trim(); };
      ta.addEventListener('input', upd); upd();
      btn.onclick = async () => { btn.disabled = true; try { await respond(a, { text: ta.value.trim().slice(0, 1000) }); finish('Merci pour ta réponse !'); } catch (e) { fail(e); btn.disabled = false; } };
    } else {
      const btn = $('[data-send]');
      btn.onclick = async () => { btn.disabled = true; try { await respond(a, { read: true }); finish('Annonce lue'); } catch (e) { fail(e); btn.disabled = false; } };
    }
  };
  next(0);
  return list.length;
}

/** Écran bloquant : couvre toute l'appli, aucune fermeture possible (ni ✕, ni toucher à côté, ni Échap). */
function blocker(a) {
  const el = document.createElement('div');
  el.className = 'ann-block';
  el.dataset.style = styleOf(a);
  el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', a.title || 'Annonce');
  el.innerHTML = `<div class="ann-block-card stack">${body(a)}</div>`;
  document.body.appendChild(el);
  const shell = document.getElementById('app-shell');
  shell?.setAttribute('inert', '');
  requestAnimationFrame(() => el.classList.add('open'));
  const stop = (e) => { if (e.key === 'Escape') e.preventDefault(); };
  document.addEventListener('keydown', stop, true);
  const close = () => { document.removeEventListener('keydown', stop, true); shell?.removeAttribute('inert'); el.classList.remove('open'); setTimeout(() => el.remove(), 250); };
  return { el, close, body: el.querySelector('.ann-block-card') };
}

function body(a) {
  const personal = a.target === 'user' || a.targetUid;
  const st = STYLES[styleOf(a)];
  const head = `<div class="ann-kind" data-style="${styleOf(a)}"><span class="ann-ico" aria-hidden="true">${st.ico}</span><span>${esc(st.label)}</span>${personal ? '<span class="badge accent">Pour toi</span>' : ''}</div>
    <h3 style="margin:6px 0 0">${esc(a.title || '')}</h3>
    ${a.body ? `<p style="white-space:pre-wrap;margin:6px 0 0">${esc(a.body)}</p>` : ''}`;
  if (a.type === 'poll') {
    const multi = !!a.multi;
    return `${head}<div class="stack ann-opts">${(a.options || []).map((o, i) => `
      <label class="ann-opt"><input type="${multi ? 'checkbox' : 'radio'}" name="annc" value="${i}"><span>${esc(o)}</span></label>`).join('')}</div>
      ${multi ? '<small class="muted">Plusieurs choix possibles.</small>' : ''}
      <button type="button" class="btn block" data-send>Voter</button>`;
  }
  if (a.type === 'question') {
    return `${head}<textarea class="input" rows="4" maxlength="1000" placeholder="Ta réponse…" aria-label="Ta réponse"></textarea>
      <button type="button" class="btn block" data-send>Envoyer</button>`;
  }
  if (a.lock) return `${head}<small class="muted">Cet accès reste suspendu tant que l'administrateur n'a pas levé la mesure.</small>`;
  return `${head}<button type="button" class="btn block" data-send>OK, compris</button>`;
}

/** Carte dans Profil : n'apparaît que s'il y a des annonces en attente. */
export async function mountAnnouncementsCard(host) {
  if (!host) return;
  try {
    const n = (await pendingAnnouncements()).length;
    if (!n || !host.isConnected) return;
    host.innerHTML = `<button type="button" class="card adm-link" id="annOpen" style="width:100%;text-align:left"><span><b>📣 ${n} annonce${n > 1 ? 's' : ''} en attente</b><small class="muted">Message, sondage ou question de l'administrateur</small></span><span aria-hidden="true">›</span></button>`;
    host.querySelector('#annOpen').onclick = async () => { LATER.clear(); await showAnnouncements(); host.innerHTML = ''; mountAnnouncementsCard(host); };
  } catch (e) { console.warn('[annonces]', e.code || '', e.message || e); }
}

/* ---------- Bandeau permanent en haut ---------- */
const HIDDEN = new Set();           // bandeaux masqués pour cette session (si l'admin les a rendus fermables)
let bannerTimer = 0;

export async function refreshBanners() {
  const top = document.querySelector('.topbar'); if (!top || !getUser()) return;
  let host = document.getElementById('annBanners');
  if (!host) { host = document.createElement('div'); host.id = 'annBanners'; host.className = 'ann-banners'; top.appendChild(host); }
  let list = [];
  try { list = (await visibleAnnouncements()).filter((a) => a.display === 'banner' && !HIDDEN.has(a.id)); }
  catch (e) { console.warn('[bandeaux]', e.code || '', e.message || e); return; }
  host.innerHTML = list.map((a) => { const st = STYLES[styleOf(a)]; return `
    <div class="ann-banner" data-style="${styleOf(a)}" data-id="${esc(a.id)}" role="status">
      <span class="ann-ico" aria-hidden="true">${st.ico}</span>
      <button type="button" class="ann-banner-t" aria-expanded="false"><b>${esc(a.title || '')}</b>${a.body ? `<span>${esc(a.body)}</span>` : ''}</button>
      ${a.dismissible ? '<button type="button" class="ann-banner-x" aria-label="Masquer">✕</button>' : ''}
    </div>`; }).join('');
  host.onclick = (e) => {
    const row = e.target.closest('.ann-banner'); if (!row) return;
    if (e.target.closest('.ann-banner-x')) { HIDDEN.add(row.dataset.id); row.remove(); return; }
    const t = row.querySelector('.ann-banner-t'); t.setAttribute('aria-expanded', t.getAttribute('aria-expanded') !== 'true');
  };
}

/** Affiche les bandeaux et les rafraîchit toutes les 5 min et au retour sur l'appli. */
export function startBanners() {
  refreshBanners();
  if (bannerTimer) return;
  bannerTimer = setInterval(refreshBanners, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshBanners(); });
}
