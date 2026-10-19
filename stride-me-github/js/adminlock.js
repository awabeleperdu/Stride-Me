// Verrou de l'espace admin : code personnel demandé à chaque ouverture (déverrouillage de 5 min d'inactivité).
// Le code n'est jamais stocké en clair : seul son empreinte PBKDF2 (sel aléatoire, 200 000 itérations) est enregistrée
// dans admin_secrets/{uid}, lisible uniquement par l'administrateur lui-même (voir firestore.rules).
// NB : c'est un verrou d'application (protège un téléphone ou une session laissés ouverts). La barrière « serveur »
// reste le rôle admin dans les règles Firestore — voir ADMIN.md pour renforcer avec une Cloud Function.
import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { esc } from './ui.js';

const IDLE_MS = 5 * 60 * 1000, ITER = 200000, MIN_LEN = 6;
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hashCode(code, salt, iter = ITER) {
  if (!globalThis.crypto?.subtle) {          // contexte non sécurisé (ex. fichier ouvert sans HTTPS) : empreinte de secours, démo uniquement
    let h = 2166136261; const s = salt + code;
    for (let r = 0; r < 20000; r++) for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) + r; h = Math.imul(h, 16777619) >>> 0; }
    return String(h);
  }
  const key = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(salt), iterations: iter, hash: 'SHA-256' }, key, 256));
}
const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));
const same = (a, b) => a.length === b.length && [...a].reduce((d, c, i) => d | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

/* ----- état de déverrouillage (mémoire de l'onglet uniquement) ----- */
let until = 0;
export const isUnlocked = () => Date.now() < until;
export const touch = () => { if (isUnlocked()) until = Date.now() + IDLE_MS; };
export const lock = () => { until = 0; };

/* ----- limitation des essais (5 erreurs → attente croissante) ----- */
const failsKey = 'adminFails';
const getFails = () => { try { return JSON.parse(localStorage.getItem(failsKey)) || { n: 0, until: 0 }; } catch { return { n: 0, until: 0 }; } };
const setFails = (f) => { try { localStorage.setItem(failsKey, JSON.stringify(f)); } catch { /* ignoré */ } };

async function readSecret(uid) { return (await getDoc(doc(db, 'admin_secrets', uid))).data() || null; }

async function verify(uid, code) {
  const f = getFails(), now = Date.now();
  if (f.until > now) return { ok: false, wait: Math.ceil((f.until - now) / 1000) };
  const s = await readSecret(uid);
  if (!s) return { ok: false, none: true };
  const ok = same(await hashCode(code, s.salt, s.iter || ITER), s.hash);
  if (ok) { setFails({ n: 0, until: 0 }); return { ok: true }; }
  const n = f.n + 1;
  const wait = n >= 5 ? Math.min(900, 30 * 2 ** (n - 5)) : 0;   // 30 s, 1 min, 2 min… (max 15 min)
  setFails({ n, until: wait ? now + wait * 1000 : 0 });
  return { ok: false, left: Math.max(0, 5 - n), wait };
}

/**
 * Affiche l'écran de code dans `root` et résout (true) quand l'admin est déverrouillé.
 * mode : 'auto' (création si aucun code, sinon saisie) | 'change' (changer le code)
 */
export function lockScreen(root, user, mode = 'auto') {
  return new Promise(async (resolve) => {
    const secret = await readSecret(user.uid).catch(() => null);
    const setup = mode === 'change' || !secret;
    const fields = setup
      ? `${mode === 'change' ? '<label class="field"><span>Code actuel</span><input class="input" id="lkOld" type="password" autocomplete="off"></label>' : ''}
         <label class="field"><span>${mode === 'change' ? 'Nouveau code' : 'Choisis ton code'}</span><input class="input" id="lkNew" type="password" autocomplete="new-password" minlength="${MIN_LEN}" placeholder="${MIN_LEN} caractères minimum"></label>
         <label class="field"><span>Confirme le code</span><input class="input" id="lkNew2" type="password" autocomplete="new-password"></label>`
      : '<label class="field"><span>Code administrateur</span><input class="input" id="lkCode" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text" placeholder="Ton code"></label>';
    root.innerHTML = `
      <div class="lock-wrap">
        <div class="lock-ico" aria-hidden="true">🔒</div>
        <h2>${setup ? (mode === 'change' ? 'Changer le code' : 'Crée ton code admin') : 'Espace verrouillé'}</h2>
        <p class="muted">${setup ? 'Ce code sera demandé à chaque ouverture de l\'espace administrateur. Il n\'est jamais stocké en clair, et ne peut pas être récupéré : note-le.' : 'Entre ton code pour accéder à l\'administration.'}</p>
        <form class="card stack" id="lkForm" novalidate>
          ${fields}
          <p class="form-error" id="lkErr" role="alert" hidden></p>
          <button class="btn block" type="submit" id="lkGo">${setup ? 'Enregistrer le code' : 'Déverrouiller'}</button>
          ${mode === 'change' ? '<button class="link-btn" type="button" id="lkCancel">Annuler</button>' : '<a class="link-btn" href="#/profile">Retour au profil</a>'}
          ${!setup && globalThis.__DEMO__ ? '<button class="link-btn" type="button" id="lkReset">Code oublié ? Réinitialiser (démo)</button>' : ''}
        </form>
      </div>`;
    const err = (m) => { const e = root.querySelector('#lkErr'); e.textContent = m; e.hidden = !m; root.querySelector('.lock-wrap').classList.remove('shake'); void root.offsetWidth; if (m) root.querySelector('.lock-wrap').classList.add('shake'); };
    root.querySelector('input')?.focus();
    root.querySelector('#lkCancel')?.addEventListener('click', () => resolve(false));
    root.querySelector('#lkReset')?.addEventListener('click', async () => {
      await deleteDoc(doc(db, 'admin_secrets', user.uid)).catch(console.error);
      setFails({ n: 0, until: 0 });
      resolve(await lockScreen(root, user, mode));
    });
    root.querySelector('#lkForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = root.querySelector('#lkGo'); btn.disabled = true;
      try {
        if (setup) {
          const a = root.querySelector('#lkNew').value, c = root.querySelector('#lkNew2').value;
          if (a.length < MIN_LEN) return err(`Le code doit faire au moins ${MIN_LEN} caractères.`);
          if (a !== c) return err('Les deux codes ne correspondent pas.');
          if (mode === 'change') { const r = await verify(user.uid, root.querySelector('#lkOld').value); if (!r.ok) return err(r.wait ? `Trop d'essais. Réessaie dans ${r.wait} s.` : 'Code actuel incorrect.'); }
          const salt = newSalt();
          await setDoc(doc(db, 'admin_secrets', user.uid), { salt, hash: await hashCode(a, salt), iter: ITER, updatedAt: Date.now() });
          until = Date.now() + IDLE_MS; return resolve(true);
        }
        const r = await verify(user.uid, root.querySelector('#lkCode').value);
        if (r.ok) { until = Date.now() + IDLE_MS; return resolve(true); }
        err(r.wait ? `Trop d'essais. Réessaie dans ${r.wait} s.` : `Code incorrect.${r.left ? ` ${r.left} essai${r.left > 1 ? 's' : ''} avant blocage temporaire.` : ''}`);
        root.querySelector('#lkCode').value = '';
      } catch (ex) { console.error(ex); err('Vérification impossible (connexion ou navigateur non compatible).'); }
      finally { btn.disabled = false; }
    });
  });
}
