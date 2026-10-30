// Point d'entrée : réglages → config Firebase → auth → routes
import { isConfigured, db } from './firebase-config.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { initAuth, getUser, signInWithGoogle, logout, signOutQuiet } from './auth.js';
import { showLogin } from './login.js';
import { register, setNotFound, startRouter } from './router.js';
import { workoutView } from './workout.js';
import { homeView } from './home.js';
import { sessionView } from './session.js';
import { statsView } from './statistics.js';
import { exercisesView } from './exercises.js';
import { planningView } from './planning.js';
import { exportCSV } from './export.js';
import { adminView } from './admin.js';
import { mountDevices } from './devices.js';
import { trackUsage, isBlocked, isAdmin } from './track.js';
import { initOffline } from './offline.js';
import { mountDemoSeed, demoView } from './demoseed.js';
import { showAnnouncements, mountAnnouncementsCard, startBanners } from './announcements.js';
import { applySettings, getSettings, saveSettings, loadRemoteSettings, mountAppearance, THEMES } from './settings.js';
import { needsIntro, showIntro } from './intro.js';
import { esc, toast } from './ui.js';
import { initTimer } from './timer.js';
import { initPip } from './pip.js';

// Réglages locaux appliqués tout de suite (thème, police, taille…) ; ceux du compte arrivent après connexion.
applySettings(getSettings());

/* ---------- Profil : un menu par catégories, chaque catégorie a sa sous-page ---------- */
const IC = {
  look:  '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>',
  sess:  '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  data:  '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/>',
  acc:   '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  admin: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'
};
let profilePop = null;
const restLabel = (r) => (r >= 120 ? `${r / 60} min` : `${r} s`);

async function profileView(root) {
  const user = getUser();
  let admin = false;

  const row = (key, color, icon, title, hint, val, href) => `
    <${href ? `a href="${href}"` : `button type="button" data-sub="${key}"`} class="prow">
      <span class="prow-ic" style="background:${color}22;color:${color}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg></span>
      <span class="prow-tx"><b>${title}</b><small>${hint}</small></span>
      <span class="prow-val">${val}</span><span class="prow-go" aria-hidden="true">›</span>
    </${href ? 'a' : 'button'}>`;

  const hub = () => {
    const s = getSettings();
    const name = s.pseudo || 'Toi';
    const theme = THEMES.find((t) => t.id === s.theme);
    root.innerHTML = `
      <div class="stack">
        <div class="pro-head">
          <div class="pro-av">${esc(name[0].toUpperCase())}</div>
          <div><h2>${esc(s.pseudo || 'Profil')}</h2><small class="muted">${user.isAnonymous ? 'Session anonyme' : esc(user.email || '')}</small></div>
        </div>
        <div class="psec">Personnalisation</div>
        <div class="plist">
          ${row('look', '#22D3EE', IC.look, 'Apparence', 'Thème, police, confort', esc(theme ? theme.label : ''))}
          ${row('sess', '#FFB347', IC.sess, 'Séance', 'Repos, sonnerie, échauffement', restLabel(s.rest))}
        </div>
        <div class="psec">Données et compte</div>
        <div class="plist">
          ${row('data', '#4C8DFF', IC.data, 'Données', 'Export de l\'historique', '')}
          ${row('acc', '#C084FC', IC.acc, 'Compte', 'Pseudo, appareils, annonces', user.isAnonymous ? 'Anonyme' : 'Google')}
          <span id="adminRow"></span>
        </div>
        <small class="muted" style="text-align:center">Stride Me</small>
      </div>`;
    if (admin) root.querySelector('#adminRow').outerHTML = row('admin', '#FF6B4A', IC.admin, 'Espace administrateur', 'Comptes, activité, appareils', '', '#/admin');
    window.scrollTo(0, 0);
  };

  const sub = (key) => {
    const titles = { look: 'Apparence', sess: 'Séance', data: 'Données', acc: 'Compte' };
    root.innerHTML = `
      <div class="stack">
        <button type="button" class="pback" id="pBack">‹ Profil</button>
        <h2>${titles[key]}</h2>
        <div class="stack" id="pBody"></div>
      </div>`;
    const body = root.querySelector('#pBody');
    if (key === 'look') {
      mountAppearance(body, ['theme', 'font', 'comfort']);
    } else if (key === 'sess') {
      mountAppearance(body, ['session', 'warm']);
    } else if (key === 'data') {
      body.innerHTML = `
        <div class="card stack"><h3>Historique</h3><button class="btn ghost block" id="csv">Exporter l'historique (CSV)</button></div>
        <div id="demoSeed"></div>`;
      body.querySelector('#csv').addEventListener('click', exportCSV);
      mountDemoSeed(body.querySelector('#demoSeed'));
    } else {
      body.innerHTML = `
        <div class="card stack">
          <h3>Ton pseudo</h3>
          <p class="muted">Il s'affiche sur l'accueil.</p>
          <div style="display:flex;gap:8px">
            <input class="input" id="pseudo" maxlength="24" autocomplete="nickname" placeholder="Ton prénom ou pseudo" value="${esc(getSettings().pseudo)}" style="flex:1">
            <button class="btn" id="pseudoSave">Enregistrer</button>
          </div>
        </div>
        <div id="devices"></div>
        <div id="annCard"></div>
        <div class="card stack">
          <h3>Connexion</h3>
          <p class="muted">${user.isAnonymous ? 'Session anonyme — lie un compte Google pour retrouver tes données ailleurs.' : esc(user.email || '')}</p>
          ${user.isAnonymous ? '<button class="btn block" id="google">Se connecter avec Google</button>' : ''}
          <button class="btn ghost block" id="logout">Se déconnecter</button>
        </div>`;
      mountDevices(body.querySelector('#devices')).catch(console.warn);
      mountAnnouncementsCard(body.querySelector('#annCard'));
      body.querySelector('#pseudoSave').addEventListener('click', () => {
        const s = saveSettings({ pseudo: body.querySelector('#pseudo').value });
        toast(s.pseudo ? `Enchanté, ${s.pseudo} !` : 'Pseudo effacé');
      });
      body.querySelector('#google')?.addEventListener('click', async () => {
        try { await signInWithGoogle(); toast('Compte lié'); profileView(root); }
        catch (err) { console.error(err); toast('Connexion annulée'); }
      });
      body.querySelector('#logout').addEventListener('click', logout);
    }
    root.querySelector('#pBack').addEventListener('click', () => history.back());
    window.scrollTo(0, 0);
  };

  // Le bouton « retour » du téléphone revient au menu du Profil au lieu de quitter la page.
  const paint = () => { const k = history.state && history.state.psub; k ? sub(k) : hub(); };
  if (profilePop) window.removeEventListener('popstate', profilePop);     // un seul écouteur, même si on revient sur le Profil
  profilePop = () => { if (!root.querySelector('.pro-head, #pBack')) return; paint(); };
  window.addEventListener('popstate', profilePop);
  root.onclick = (e) => {
    const b = e.target.closest('[data-sub]');
    if (b) { history.pushState({ psub: b.dataset.sub }, ''); paint(); }
  };

  paint();
  // Lien visible uniquement pour les administrateurs (document admins/<uid>).
  isAdmin(user).then((ok) => { if (ok && root.querySelector('#adminRow')) { admin = true; hub(); } }).catch(() => {});
}

/* ---------- Démarrage ---------- */
const setupView = () => `
  <div class="card stack">
    <h3>Configuration Firebase requise</h3>
    <p class="muted">Renseigne tes clés dans <code>js/firebase-config.js</code>, active Authentication (E-mail/Mot de passe),
    Firestore et Storage, puis recharge la page.</p>
  </div>`;

async function boot() {
  setNotFound(() => '<p class="muted">Page introuvable.</p>');

  if (!isConfigured) {
    ['/', '/planning', '/exercises', '/stats', '/profile', '/workout', '/session'].forEach((p) => register(p, setupView));
    await startRouter(); return hideSplash();
  }

  try {
    // Session mémorisée ("Se souvenir de moi") → on entre directement, sinon écran de connexion.
    const user = await initAuth();
    if (!user) { hideSplash(); await showLogin(); }
  } catch (e) {
    console.error(e);
    register('/', () => '<div class="card"><h3>Connexion impossible</h3><p class="muted">Vérifie la configuration Firebase (clés dans firebase-config.js, Authentication activée).</p></div>');
    await startRouter(); return hideSplash();
  }

  // Compte bloqué par l'administrateur : on referme la session et on l'explique.
  const me = getUser();
  if (me && await Promise.race([isBlocked(me), new Promise((r) => setTimeout(() => r(false), 3000))])) {
    await signOutQuiet();
    document.getElementById('app-shell').classList.add('auth-mode');
    document.getElementById('view').innerHTML = '<div class="card stack auth-wrap"><h3>Compte désactivé</h3><p class="muted">Ton accès a été désactivé par l\'administrateur. Contacte-le pour le réactiver.</p></div>';
    return hideSplash();
  }
  if (me) trackUsage(me);       // dernière activité + appareil (voir Profil › Mes appareils)

  await loadRemoteSettings();   // retrouve ses réglages d'un autre appareil
  if (me && needsIntro()) { hideSplash(); await showIntro(); }   // 1re ouverture : pseudo, thème, repos
  initPip(toast);               // bulle flottante du minuteur (si le téléphone sait faire)
  initTimer();                  // minuteur de repos global (reprend après navigation ou rechargement)

  register('/', homeView);
  register('/workout', workoutView);
  register('/session', sessionView);
  register('/planning', planningView);
  register('/exercises', exercisesView);
  register('/stats', statsView);
  register('/profile', profileView);
  register('/admin', adminView);
  register('/demo', demoView);

  await startRouter();
  initOffline();
  if (me) { startBanners(); showAnnouncements({ auto: true }); }     // annonces / sondages de l'administrateur
  hideSplash();
}

// Écran d'attente : n'apparaît que si le démarrage dure plus de ~0,4 s, et disparaît dès que c'est prêt (aucun délai artificiel).
function hideSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  el.classList.add('out'); setTimeout(() => el.remove(), 250);
}

boot().catch((e) => { console.error(e); hideSplash(); });
