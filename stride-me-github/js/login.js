// Écran de connexion / création de compte. Résout avec l'utilisateur une fois connecté.
import { signIn, signUp, resetPassword, signInWithGoogle } from './auth.js';
import { esc } from './ui.js';

const MESSAGES = {
  'auth/invalid-email': 'Adresse e-mail invalide.',
  'auth/missing-email': 'Saisis ton adresse e-mail.',
  'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
  'auth/wrong-password': 'E-mail ou mot de passe incorrect.',
  'auth/user-not-found': 'E-mail ou mot de passe incorrect.',
  'auth/email-already-in-use': 'Un compte existe déjà avec cet e-mail. Connecte-toi.',
  'auth/weak-password': 'Mot de passe trop faible (8 caractères minimum).',
  'auth/user-disabled': 'Ce compte a été désactivé par l\'administrateur.',
  'auth/too-many-requests': 'Trop de tentatives. Réessaie dans quelques minutes.',
  'auth/network-request-failed': 'Pas de connexion réseau.',
  'auth/operation-not-allowed': 'Connexion par e-mail non activée dans Firebase (Authentication → Sign-in method).',
  'auth/popup-closed-by-user': 'Connexion annulée.',
  'auth/cancelled-popup-request': 'Connexion annulée.',
  'auth/unauthorized-domain': 'Domaine non autorisé dans Firebase (Authentication → Paramètres → Domaines autorisés).'
};
const errMsg = (e) => MESSAGES[e?.code] || 'Une erreur est survenue. Réessaie.';

export function showLogin() {
  return new Promise((resolve) => {
    const root = document.getElementById('view');
    const shell = document.getElementById('app-shell');
    shell.classList.add('auth-mode');
    let mode = 'in';            // 'in' | 'up'
    let email = '';

    const done = (user) => { shell.classList.remove('auth-mode'); resolve(user); };

    const draw = (note = '', noteType = 'error') => {
      const up = mode === 'up';
      root.innerHTML = `
        <div class="auth-wrap">
          <div class="auth-head">
            <img class="auth-logo" src="assets/mark.webp" alt="" width="96" height="82">
            <img class="auth-title" src="assets/title.webp" alt="Stride Me" width="160" height="42">
            <h2>${up ? 'Créer un compte' : 'Connexion'}</h2>
            <p class="muted">${up ? 'Tes séances sont rattachées à ton compte, personne d\'autre ne les voit.' : 'Retrouve tes séances et ton planning.'}</p>
          </div>
          <div class="seg" role="tablist">
            <button type="button" class="${up ? '' : 'on'}" data-mode="in" role="tab">Connexion</button>
            <button type="button" class="${up ? 'on' : ''}" data-mode="up" role="tab">Créer un compte</button>
          </div>
          <form class="card stack" id="authForm" novalidate>
            <label class="field"><span>E-mail</span>
              <input class="input" id="aEmail" type="email" inputmode="email" autocomplete="${up ? 'email' : 'username'}" autocapitalize="off" spellcheck="false" placeholder="toi@exemple.fr" value="${esc(email)}" required>
            </label>
            <label class="field"><span>Mot de passe</span>
              <span class="pw-wrap">
                <input class="input" id="aPw" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" placeholder="${up ? '8 caractères minimum' : '••••••••'}" minlength="${up ? 8 : 1}" required>
                <button type="button" class="pw-toggle" id="pwToggle" aria-label="Afficher le mot de passe">Voir</button>
              </span>
            </label>
            <label class="check"><input type="checkbox" id="aRemember" checked><span>Se souvenir de moi<small>Décoche sur un appareil partagé : tu seras déconnecté en fermant l'onglet.</small></span></label>
            ${note ? `<p class="form-${noteType === 'ok' ? 'ok' : 'error'}" role="alert">${esc(note)}</p>` : ''}
            <button class="btn block" type="submit" id="aSubmit">${up ? 'Créer mon compte' : 'Se connecter'}</button>
            ${up ? '' : '<button class="link-btn" type="button" id="aForgot">Mot de passe oublié ?</button>'}
          </form>
          <div class="divider-or"><span>ou</span></div>
          <button class="btn ghost block" type="button" id="aGoogle">Continuer avec Google</button>
        </div>`;
      bind();
    };

    const val = () => ({
      email: root.querySelector('#aEmail').value.trim(),
      pw: root.querySelector('#aPw').value,
      remember: root.querySelector('#aRemember').checked
    });

    const busy = (on) => root.querySelectorAll('button').forEach((b) => { b.disabled = on; });

    function bind() {
      root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
        email = root.querySelector('#aEmail').value.trim();
        mode = b.dataset.mode; draw();
      }));

      root.querySelector('#pwToggle').addEventListener('click', (e) => {
        const i = root.querySelector('#aPw');
        const show = i.type === 'password';
        i.type = show ? 'text' : 'password';
        e.currentTarget.textContent = show ? 'Cacher' : 'Voir';
      });

      root.querySelector('#authForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const { email: em, pw, remember } = val();
        email = em;
        if (!em) return draw('Saisis ton adresse e-mail.');
        if (!pw) return draw('Saisis ton mot de passe.');
        if (mode === 'up' && pw.length < 8) return draw('Mot de passe trop court (8 caractères minimum).');
        busy(true);
        try {
          const user = mode === 'up' ? await signUp(em, pw, remember) : await signIn(em, pw, remember);
          done(user);
        } catch (err) {
          console.error(err);
          draw(errMsg(err));
        }
      });

      root.querySelector('#aForgot')?.addEventListener('click', async () => {
        const em = root.querySelector('#aEmail').value.trim();
        email = em;
        if (!em) return draw('Saisis ton e-mail ci-dessus, puis clique sur « Mot de passe oublié ».');
        busy(true);
        try { await resetPassword(em); draw('Si un compte existe, un e-mail de réinitialisation vient d\'être envoyé.', 'ok'); }
        catch (err) { console.error(err); draw(errMsg(err)); }
      });

      root.querySelector('#aGoogle').addEventListener('click', async () => {
        const remember = root.querySelector('#aRemember').checked;
        busy(true);
        try { done(await signInWithGoogle(remember)); }
        catch (err) { console.error(err); draw(errMsg(err)); }
      });
    }

    draw();
  });
}
