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
import { applySettings, getSettings, loadRemoteSettings, mountAppearance } from './settings.js';
import { esc, toast } from './ui.js';
import { initTimer } from './timer.js';

// Réglages locaux appliqués tout de suite (thème, police, taille…) ; ceux du compte arrivent après connexion.
applySettings(getSettings());

/* ---------- Profil ---------- */
async function profileView(root) {
  const user = getUser();
  const ref = doc(db, 'users', user.uid);
  const data = (await getDoc(ref)).data() || {};

  root.innerHTML = `
    <div class="stack">
      <h2>Profil</h2>
      <div id="adminLink"></div>
      <div id="demoSeed"></div>
      <div id="annCard"></div>
      <form class="card stack" id="metrics">
        <h3>Mesures actuelles</h3>
        <div class="grid-2">
          <input class="input" name="weight" inputmode="decimal" placeholder="Poids (kg)" aria-label="Poids en kilogrammes" value="${esc(data.metrics?.weight ?? '')}">
          <input class="input" name="height" inputmode="numeric" placeholder="Taille (cm)" aria-label="Taille en centimètres" value="${esc(data.metrics?.height ?? '')}">
        </div>
        <button class="btn block" type="submit">Enregistrer</button>
      </form>

      <h2 class="section-title">Apparence et réglages</h2>
      <div class="stack" id="appearance"></div>

      <div id="devices"></div>
      <div class="card stack">
        <h3>Données</h3>
        <button class="btn ghost block" id="csv">Exporter l'historique (CSV)</button>
      </div>
      <div class="card stack">
        <h3>Compte</h3>
        <p class="muted">${user.isAnonymous ? 'Session anonyme — lie un compte Google pour retrouver tes données ailleurs.' : esc(user.email || '')}</p>
        ${user.isAnonymous ? '<button class="btn block" id="google">Se connecter avec Google</button>' : ''}
        <button class="btn ghost block" id="logout">Se déconnecter</button>
      </div>
    </div>`;

  mountAppearance(root.querySelector('#appearance'));
  mountDevices(root.querySelector('#devices')).catch(console.warn);
  mountDemoSeed(root.querySelector('#demoSeed'));
  mountAnnouncementsCard(root.querySelector('#annCard'));
  // Lien visible uniquement pour les administrateurs (document admins/<uid>) ; les autres ne voient rien.
  isAdmin(user).then((ok) => {
    if (ok) root.querySelector('#adminLink').innerHTML = '<a class="card adm-link" href="#/admin"><span><b>Espace administrateur</b><small class="muted">Comptes, activité, appareils</small></span><span aria-hidden="true">›</span></a>';
  });

  root.querySelector('#metrics').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const num = (v) => (v === '' ? null : Number(String(v).replace(',', '.')) || null);
    await queued(setDoc(ref, { metrics: { weight: num(fd.get('weight')), height: num(fd.get('height')) } }, { merge: true }));
    toast('Mesures enregistrées');
  });
  root.querySelector('#csv').addEventListener('click', exportCSV);
  root.querySelector('#google')?.addEventListener('click', async () => {
    try { await signInWithGoogle(); toast('Compte lié'); profileView(root); }
    catch (err) { console.error(err); toast('Connexion annulée'); }
  });
  root.querySelector('#logout').addEventListener('click', logout);
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
