// Annonces de l'administrateur côté utilisateur : message, sondage ou question (à tous ou à une personne).
// Données : announcements/{id} (écrit par l'admin) + announcements/{id}/responses/{uid} (écrit par l'utilisateur, une seule fois).
import { db } from './firebase-config.js';
import { collection, query, where, getDocs, getDoc, setDoc, doc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getUser } from './auth.js';
import { esc, toast, vibrate } from './ui.js';
import { sheet } from './sharecode.js';

export const TYPE_LABEL = { message: 'Annonce', poll: 'Sondage', question: 'Question' };
const LATER = new Set();            // « plus tard » : ne pas reproposer pendant cette session

const live = (a) => a.active !== false && !(a.expiresAt && a.expiresAt < Date.now());

/** Annonces visibles par l'utilisateur et pas encore traitées, de la plus récente à la plus ancienne. */
export async function pendingAnnouncements() {
  const u = getUser(); if (!u) return [];
  const col = collection(db, 'announcements');
  const [all, mine] = await Promise.all([
    getDocs(query(col, where('target', '==', 'all'))),
    getDocs(query(col, where('targetUid', '==', u.uid)))
  ]);
  const seen = new Map();
  for (const d of [...all.docs, ...mine.docs]) seen.set(d.id, { id: d.id, ...d.data() });
  const list = [...seen.values()].filter(live).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 20);
  const done = await Promise.all(list.map((a) => getDoc(doc(db, 'announcements', a.id, 'responses', u.uid)).then((s) => s.exists()).catch(() => true)));
  return list.filter((_, i) => !done[i]);
}

async function respond(a, data) {
  const u = getUser();
  await setDoc(doc(db, 'announcements', a.id, 'responses', u.uid), { uid: u.uid, at: Date.now(), ...data });
}

/** Ouvre les annonces en attente, une par une. `auto` : au démarrage (respecte « plus tard »). */
export async function showAnnouncements({ auto = false } = {}) {
  let list = [];
  try { list = await pendingAnnouncements(); } catch (e) { console.warn('[annonces]', e.code || '', e.message || e); return 0; }
  if (auto) list = list.filter((a) => !LATER.has(a.id));
  if (!list.length) { if (!auto) toast('Aucune annonce en attente'); return 0; }
  const next = (i) => {
    if (i >= list.length) return;
    const a = list[i];
    const s = sheet(TYPE_LABEL[a.type] || 'Annonce', body(a));
    let answered = false;
    const finish = (msg) => { answered = true; toast(msg); vibrate(12); s.close(); setTimeout(() => next(i + 1), 350); };
    const fail = (e) => { console.error(e); toast(e.code === 'permission-denied' ? 'Réponse refusée (compte en lecture seule ?)' : 'Envoi impossible, réessaie'); };
    new MutationObserver((_, ob) => { if (!document.body.contains(s.el)) { ob.disconnect(); if (!answered) list.slice(i).forEach((x) => LATER.add(x.id)); } }).observe(document.body, { childList: true });
    const $ = (q) => s.body.querySelector(q);
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

function body(a) {
  const personal = a.target === 'user' || a.targetUid;
  const head = `${personal ? '<span class="badge accent">Message pour toi</span>' : ''}
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
