// Espace administrateur : comptes, activité, appareils, blocage et suppression.
// Sécurité : l'accès réel est imposé par les règles Firestore (collection `admins`, voir firestore.rules)
// et par les Cloud Functions (functions/index.js). Ce qui est caché ici n'est qu'un confort d'affichage.
import { db, functions } from './firebase-config.js';
import {
  collection, getDocs, doc, getDoc, setDoc, deleteDoc, query, where
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { getUser } from './auth.js';
import { isAdmin, ago, toMs } from './track.js';
import { esc, toast, vibrate, emptyState } from './ui.js';
import { lockScreen, isUnlocked, touch, lock } from './adminlock.js';
import { mountShared } from './admincatalog.js';

const DAY = 86400000;
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/** Etat d'un compte d'après sa dernière activité. */
function status(u) {
  if (u.disabled) return { k: 'off', label: 'Bloqué' };
  const last = toMs(u.lastSeenAt);
  if (!last) return { k: 'never', label: 'Jamais ouvert' };
  const age = Date.now() - last;
  if (age < 7 * DAY) return { k: 'on', label: 'Actif' };
  if (age < 30 * DAY) return { k: 'idle', label: 'Peu actif' };
  return { k: 'dead', label: 'Inactif' };
}

/** Point d'entrée : rôle admin → code → panneau. Reverrouille après 5 min d'inactivité. */
export async function adminView(root) {
  const me = getUser();
  if (!(await isAdmin(me))) {
    root.innerHTML = '<div class="card stack"><h3>Accès refusé</h3><p class="muted">Cet espace est réservé aux administrateurs.</p><a class="btn block" href="#/profile">Retour</a></div>';
    return;
  }
  let inner = null, gone = false;
  const open = async (mode = 'auto') => {
    inner?.unmount?.(); inner = null;
    if (mode === 'change' || !isUnlocked()) {
      const ok = await lockScreen(root, me, mode);
      if (gone) return;
      if (!ok && mode === 'change') mode = 'auto';       // annulé : retour au panneau
      else if (!ok) return;
    }
    inner = await panel(root, me, { relock: () => { lock(); open(); }, change: () => open('change') });
  };
  await open();
  return { unmount() { gone = true; inner?.unmount?.(); } };
}

async function panel(root, me, { relock, change }) {

  let users = [], filter = 'all', q = '', sheet = null, dead = false, tab = 'users', shared = null;

  async function load() {
    const snap = await getDocs(collection(db, 'users'));
    users = snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
      .sort((a, b) => toMs(b.lastSeenAt) - toMs(a.lastSeenAt));
  }

  const counts = () => ({
    total: users.length,
    active: users.filter((u) => status(u).k === 'on').length,
    quiet: users.filter((u) => ['dead', 'never'].includes(status(u).k)).length
  });

  function listHTML() {
    const rows = users.filter((u) => {
      const k = status(u).k;
      if (filter === 'active' && k !== 'on') return false;
      if (filter === 'inactive' && !['dead', 'never', 'idle'].includes(k)) return false;
      return !q || (u.email || u.uid).toLowerCase().includes(q.toLowerCase());
    });
    if (!rows.length) return '<p class="muted adm-empty">Aucun compte ne correspond.</p>';
    return rows.map((u) => {
      const st = status(u), name = u.email || u.uid;
      return `
        <button type="button" class="adm-row" data-uid="${esc(u.uid)}">
          <span class="adm-av st-${st.k}" aria-hidden="true">${esc(name.charAt(0).toUpperCase())}</span>
          <span class="adm-main">
            <b>${esc(name)}${u.uid === me.uid ? ' <em class="dev-me">toi</em>' : ''}</b>
            <small><i class="adm-dot st-${st.k}"></i>${esc(st.label)} · ${esc(ago(toMs(u.lastSeenAt)))}</small>
            <small>${u.loginCount || 0} ouverture${(u.loginCount || 0) > 1 ? 's' : ''} · ${u.workoutCount || 0} séance${(u.workoutCount || 0) > 1 ? 's' : ''}</small>
          </span>
          <span class="adm-chev" aria-hidden="true">›</span>
        </button>`;
    }).join('');
  }

  function draw() {
    shared?.unmount?.(); shared = null;
    const c = counts();
    root.innerHTML = `
      <div class="stack">
        <div class="row between"><a class="back-link" href="#/profile">‹ Profil</a>
          <span class="row" style="gap:6px"><button class="btn ghost sm" id="admChange">Changer le code</button><button class="btn ghost sm" id="admLock">🔒 Verrouiller</button></span></div>
        <h2>Administration</h2>
        <div class="seg" role="group" aria-label="Section">
          <button type="button" data-admtab="users" aria-pressed="${tab === 'users'}">Comptes</button>
          <button type="button" data-admtab="shared" aria-pressed="${tab === 'shared'}">Catalogue</button>
        </div>
        ${tab === 'shared' ? '<div id="admShared"></div>' : `
        <div class="adm-tiles">
          <div class="card"><small>Comptes</small><b>${c.total}</b></div>
          <div class="card"><small>Actifs 7 j</small><b>${c.active}</b></div>
          <div class="card"><small>Inactifs</small><b>${c.quiet}</b></div>
        </div>
        <input class="input" id="admQ" type="search" placeholder="Rechercher un e-mail" aria-label="Rechercher un compte" value="${esc(q)}">
        <div class="seg seg3" role="group" aria-label="Filtre">
          <button type="button" data-f="all" aria-pressed="${filter === 'all'}">Tous</button>
          <button type="button" data-f="active" aria-pressed="${filter === 'active'}">Actifs</button>
          <button type="button" data-f="inactive" aria-pressed="${filter === 'inactive'}">Inactifs</button>
        </div>
        <div class="adm-list" id="admList">${listHTML()}</div>
        <p class="muted hint-line">« Actif » : ouvert dans les 7 derniers jours · « Inactif » : plus de 30 jours ou jamais ouvert.</p>
        `}
      </div>`;
    if (tab === 'shared') mountShared(root.querySelector('#admShared'), { touch }).then((m) => { if (dead || tab !== 'shared') m.unmount(); else shared = m; });
  }

  /* ---------- Fiche d'un compte ---------- */
  async function openSheet(uid, confirmDelete = false) {
    closeSheet();
    const u = users.find((x) => x.uid === uid); if (!u) return;
    const st = status(u), self = uid === me.uid, name = u.email || u.uid;
    let devices = [];
    try { devices = (await getDocs(collection(db, 'users', uid, 'devices'))).docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => toMs(b.lastSeenAt) - toMs(a.lastSeenAt)); } catch (e) { console.warn(e); }

    const el = document.createElement('div');
    el.className = 'sheet-root';
    el.innerHTML = `
      <div class="sheet-backdrop"></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="Compte ${esc(name)}">
        <div class="sheet-grab"></div>
        <div class="sheet-head">
          <div><p class="muted"><i class="adm-dot st-${st.k}"></i>${esc(st.label)}</p><h3>${esc(name)}</h3></div>
          <button type="button" class="sheet-x" aria-label="Fermer">✕</button>
        </div>
        <div class="stack">
          <div class="adm-stats">
            <div><small>Créé le</small><b>${esc(fmtDate(toMs(u.createdAt)))}</b></div>
            <div><small>Dernière activité</small><b>${esc(ago(toMs(u.lastSeenAt)))}</b></div>
            <div><small>Ouvertures</small><b>${u.loginCount || 0}</b></div>
            <div><small>Séances</small><b>${u.workoutCount || 0}</b></div>
            <div><small>Dernière séance</small><b>${u.lastWorkoutAt ? esc(ago(toMs(u.lastWorkoutAt))) : '—'}</b></div>
            <div><small>Appareils</small><b>${devices.length}</b></div>
          </div>
          <h4 class="adm-h">Appareils</h4>
          ${devices.length ? devices.map((d) => `
            <div class="dev-row">
              <div class="dev-ico" aria-hidden="true">${d.mobile ? '📱' : '💻'}</div>
              <div class="dev-txt"><b>${esc(d.label || d.name)}</b>
                <small>${esc(d.name)} · vu ${esc(ago(toMs(d.lastSeenAt)))} · ${d.openCount || 0} ouv. · depuis ${esc(fmtDate(toMs(d.firstSeenAt)))}</small></div>
            </div>`).join('') : '<p class="muted">Aucun appareil enregistré.</p>'}
          ${self ? '<p class="muted">C\'est ton compte administrateur : il ne peut être ni bloqué ni supprimé ici.</p>' : confirmDelete ? `
            <div class="adm-danger stack">
              <h4>Supprimer définitivement ce compte ?</h4>
              <p class="muted">Toutes ses séances, exercices, planning et appareils seront effacés. Action irréversible. Tape <b>${esc(name)}</b> pour confirmer.</p>
              <input class="input" id="admConfirm" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(name)}" aria-label="Confirmer en tapant l'e-mail">
              <div class="grid-2">
                <button class="btn ghost block" data-a="cancel">Annuler</button>
                <button class="btn danger block" data-a="delete-go" disabled>Supprimer</button>
              </div>
            </div>` : `
            <div class="grid-2">
              <button class="btn ghost block" data-a="toggle">${u.disabled ? 'Débloquer l\'accès' : 'Bloquer l\'accès'}</button>
              <button class="btn ghost block danger-t" data-a="delete">Supprimer…</button>
            </div>`}
        </div>
      </section>`;
    document.body.appendChild(el); sheet = el;
    requestAnimationFrame(() => el.classList.add('open'));
    el.querySelector('.sheet-x').focus();
    el.querySelector('.sheet-backdrop').addEventListener('click', closeSheet);
    el.querySelector('.sheet-x').addEventListener('click', closeSheet);
    const conf = el.querySelector('#admConfirm');
    conf?.addEventListener('input', () => { el.querySelector('[data-a=delete-go]').disabled = conf.value.trim().toLowerCase() !== name.toLowerCase(); });
    el.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      if (!isUnlocked()) { closeSheet(); return relock(); }
      touch();
      if (a === 'delete') openSheet(uid, true);
      else if (a === 'cancel') openSheet(uid, false);
      else if (a === 'toggle') { await setBlocked(u, !u.disabled); closeSheet(); await refresh(); }
      else if (a === 'delete-go') { e.target.disabled = true; await removeAccount(u); closeSheet(); await refresh(); }
    });
  }

  function closeSheet() {
    if (!sheet) return;
    const el = sheet; sheet = null; el.classList.remove('open'); setTimeout(() => el.remove(), 350);
  }

  /* ---------- Actions (Cloud Function si déployée, sinon repli côté client) ---------- */
  async function callFn(name, data) {
    return httpsCallable(functions, name)(data);
  }
  const noFn = (e) => ['functions/not-found', 'functions/internal', 'functions/unavailable', 'functions/failed-precondition'].includes(e?.code) || /not-found|CORS|Failed to fetch/i.test(String(e?.message));

  async function setBlocked(u, disabled) {
    try { await callFn('adminSetDisabled', { uid: u.uid, disabled }); toast(disabled ? 'Compte bloqué' : 'Compte débloqué'); }
    catch (e) {
      if (!noFn(e)) { console.error(e); toast('Action refusée'); return; }
      await setDoc(doc(db, 'users', u.uid), { disabled, disabledAt: disabled ? Date.now() : null }, { merge: true });
      toast(disabled ? 'Compte bloqué (à la prochaine ouverture)' : 'Compte débloqué');
    }
    vibrate(12);
  }

  async function removeAccount(u) {
    try { await callFn('adminDeleteUser', { uid: u.uid }); toast('Compte supprimé'); vibrate(14); return; }
    catch (e) { if (!noFn(e)) { console.error(e); toast('Suppression refusée'); return; } }
    // Repli sans Cloud Function : on efface toutes ses données et on le bloque.
    // Son identifiant de connexion existe encore dans Firebase → à retirer dans la console (Authentication).
    try {
      for (const [col, field] of [['workouts', 'userId'], ['exercises', 'ownerId'], ['measurements', 'userId']]) {
        const s = await getDocs(query(collection(db, col), where(field, '==', u.uid)));
        for (const d of s.docs) await deleteDoc(d.ref || doc(db, col, d.id));
      }
      const dv = await getDocs(collection(db, 'users', u.uid, 'devices'));
      for (const d of dv.docs) await deleteDoc(doc(db, 'users', u.uid, 'devices', d.id));
      await deleteDoc(doc(db, 'schedule_rotation', u.uid)).catch(() => {});
      await setDoc(doc(db, 'users', u.uid), { disabled: true, deletedAt: Date.now() }, { merge: true });
      toast('Données effacées et compte bloqué — retire-le aussi dans la console Firebase', undefined);
    } catch (e) { console.error(e); toast('Suppression impossible'); }
  }

  async function refresh() { await load(); if (!dead) draw(); }

  await refresh();

  root.onclick = (e) => {
    if (!isUnlocked()) return relock();          // inactivité > 5 min : le code est redemandé
    touch();
    if (e.target.closest('#admLock')) return relock();
    if (e.target.closest('#admChange')) return change();
    const tb = e.target.closest('[data-admtab]'); if (tb) { tab = tb.dataset.admtab; draw(); return; }
    const f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; draw(); return; }
    const r = e.target.closest('.adm-row'); if (r) openSheet(r.dataset.uid);
  };
  root.oninput = (e) => {
    if (e.target.id !== 'admQ') return;
    touch();
    q = e.target.value;
    root.querySelector('#admList').innerHTML = listHTML();
  };
  if (!users.length) root.innerHTML += emptyState('Aucun compte', 'Les comptes apparaissent ici après leur première connexion.');

  // Verrouillage automatique : après 5 min sans action le code est redemandé
  const idle = setInterval(() => { if (!isUnlocked() && !dead) { clearInterval(idle); relock(); } }, 15000);
  const bump = () => touch();
  root.addEventListener('pointerdown', bump); root.addEventListener('keydown', bump);
  return { unmount() { dead = true; shared?.unmount?.(); clearInterval(idle); root.removeEventListener('pointerdown', bump); root.removeEventListener('keydown', bump); closeSheet(); root.onclick = root.oninput = null; } };
}
