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
import { exportCSV, exportJSON, exportXLS, exportTXT, exportPDF, exportMD } from './export.js';
import { profileStats, mountMe, rankOf, memberSince, avatarHTML } from './profile.js';
import { adminView } from './admin.js';
import { mountDevices } from './devices.js';
import { trackUsage, isBlocked, isAdmin } from './track.js';
import { initOffline } from './offline.js';
import { mountDemoSeed, demoView } from './demoseed.js';
import { showAnnouncements, mountAnnouncementsCard, startBanners } from './announcements.js';
import { applySettings, getSettings, saveSettings, loadRemoteSettings, mountAppearance, THEMES, GOALS, LEVELS, restTxt } from './settings.js';
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
  me:    '<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/>',
  acc:   '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  admin: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'
};
let profilePop = null;
const restLabel = restTxt;

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
        <div class="pro-card">
          <div class="pro-top">
            ${avatarHTML(s)}
            <div style="min-width:0"><h2>${esc(s.pseudo || 'Profil')}</h2><small class="muted">${user.isAnonymous ? 'Session anonyme' : esc(user.email || '')}</small>
              <div class="pro-tags" id="pTags">${[GOALS.find((g) => g.id === s.goal), LEVELS.find((l) => l.id === s.level)].filter((x) => x && x.id).map((x) => `<span class="pro-tag">${x.label}</span>`).join('')}</div>
            </div>
          </div>
          <div id="pStats"><div class="pro-line"><span>Chargement…</span></div></div>
        </div>
        <div class="psec">Mon profil</div>
        <div><div class="plist">
          ${row('me', '#34D399', IC.me, 'Moi', 'Photo, objectif, niveau, taille', s.week + ' séances/sem.')}
        </div></div>
        <div class="psec">Personnalisation</div>
        <div><div class="plist">
          ${row('look', '#22D3EE', IC.look, 'Apparence', 'Thème, police, confort', esc(theme ? theme.label : ''))}
          ${row('sess', '#FFB347', IC.sess, 'Séance', 'Repos, sonnerie, échauffement', restLabel(s.rest))}
        </div></div>
        <div class="psec">Données et compte</div>
        <div class="plist">
          ${row('data', '#4C8DFF', IC.data, 'Données', 'Export CSV, Excel, PDF, JSON…', '')}
          ${row('acc', '#C084FC', IC.acc, 'Compte', 'Pseudo, appareils, annonces', user.isAnonymous ? 'Anonyme' : 'Google')}
          <span id="adminRow"></span>
        </div>
        <small class="muted" style="text-align:center">Stride Me</small>
      </div>`;
    if (admin) root.querySelector('#adminRow').outerHTML = row('admin', '#FF6B4A', IC.admin, 'Espace administrateur', 'Comptes, activité, appareils', '', '#/admin');
    window.scrollTo(0, 0);
    fillStats(s);
  };

  const fillStats = async (s) => {
    try {
      const st = await profileStats();
      const host = root.querySelector('#pStats'); if (!host) return;
      const rk = rankOf(st.total);
      const wk = Math.min(100, Math.round((st.weekN / s.week) * 100));
      const w = st.weight;
      const goalW = s.target && w ? `<div class="pro-line"><span>Poids</span><b>${w.toLocaleString('fr-FR')} → ${s.target.toLocaleString('fr-FR')} kg</b></div>` : '';
      host.innerHTML = `
        <div class="stack" style="gap:12px">
          <div class="pro-stats">
            <div class="pro-stat"><b>${st.total}</b><small>séances</small></div>
            <div class="pro-stat"><b>${st.streak}</b><small>jour${st.streak > 1 ? 's' : ''} d'affilée</small></div>
            <div class="pro-stat"><b style="color:${rk.c}">${rk.name}</b><small>rang</small></div>
          </div>
          <div class="stack" style="gap:6px"><div class="pro-line"><span>Rang${rk.next ? ' · prochain : ' + rk.next.name : ' maximum'}</span><b>${rk.next ? (rk.next.min - st.total) + ' séance' + (rk.next.min - st.total > 1 ? 's' : '') : '★'}</b></div><div class="pro-bar"><i style="width:${rk.pct}%;background:${rk.c}"></i></div></div>
          <div class="stack" style="gap:6px"><div class="pro-line"><span>Cette semaine</span><b>${st.weekN} / ${s.week}</b></div><div class="pro-bar"><i style="width:${wk}%"></i></div></div>
          ${goalW}
          ${st.records.length ? `<div class="stack" style="gap:6px"><div class="pro-line"><span>Mes records</span></div><div class="pro-rec">${st.records.map((r) => `<div><b>${esc(r.name)}</b><span>${r.wt ? r.wt.toLocaleString('fr-FR') + ' kg × ' + r.reps : r.reps + ' reps'}</span></div>`).join('')}</div></div>` : ''}
          <div class="pro-line"><span>${esc(memberSince(st))}</span></div>
        </div>`;
    } catch (err) { console.error(err); const h = root.querySelector('#pStats'); if (h) h.innerHTML = `<div class="pro-line"><span>Stats indisponibles : ${esc(err.message || err)}</span></div>`; }
  };

  const sub = (key) => {
    const titles = { me: 'Moi', look: 'Apparence', sess: 'Séance', data: 'Données', acc: 'Compte' };
    root.innerHTML = `
      <div class="stack">
        <button type="button" class="pback" id="pBack">‹ Profil</button>
        <h2>${titles[key]}</h2>
        <div class="stack" id="pBody"></div>
      </div>`;
    const body = root.querySelector('#pBody');
    if (key === 'me') {
      mountMe(body, () => sub('me'));
    } else if (key === 'look') {
      mountAppearance(body, ['theme', 'font', 'comfort']);
    } else if (key === 'sess') {
      mountAppearance(body, ['session', 'warm']);
    } else if (key === 'data') {
      body.innerHTML = `
        <div class="card stack"><h3>Exporter l'historique</h3>
          <div class="field"><span>Période</span>
            <div class="seg seg4" role="group" aria-label="Période" id="expPer">
              <button type="button" data-per="0">Tout</button><button type="button" data-per="30">30 j</button><button type="button" data-per="90">90 j</button><button type="button" data-per="365">1 an</button>
            </div></div>
          <div class="field"><span>Unité de poids</span>
            <div class="seg" role="group" aria-label="Unité" id="expUnit">
              <button type="button" data-unit="kg">Kilos (kg)</button><button type="button" data-unit="lb">Livres (lb)</button>
            </div></div>
          <p class="muted">Choisis le format selon ce que tu veux en faire.</p>
          <div class="exp-row">
            <button class="btn ghost" id="pdf">PDF<br><small>rapport à imprimer</small></button>
            <button class="btn ghost" id="xls">Excel<br><small>.xls mis en forme</small></button>
            <button class="btn ghost" id="csv">CSV<br><small>tableur, Sheets</small></button>
            <button class="btn ghost" id="json">JSON<br><small>sauvegarde complète</small></button>
            <button class="btn ghost" id="md">Markdown<br><small>Notion, Obsidian</small></button>
            <button class="btn ghost" id="txt">Texte<br><small>résumé lisible</small></button>
          </div></div>
        <div id="demoSeed"></div>`;
      let per = 0; try { per = Number(localStorage.getItem('expPer')) || 0; } catch { /* stockage indisponible */ }
      const opts = () => ({ days: per, unit: getSettings().unit });
      const paintOpts = () => {
        body.querySelectorAll('#expPer [data-per]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.per) === per)));
        body.querySelectorAll('#expUnit [data-unit]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.unit === getSettings().unit)));
      };
      body.querySelector('#expPer').addEventListener('click', (e) => { const b = e.target.closest('[data-per]'); if (!b) return; per = Number(b.dataset.per); try { localStorage.setItem('expPer', String(per)); } catch { /* ignoré */ } paintOpts(); });
      body.querySelector('#expUnit').addEventListener('click', (e) => { const b = e.target.closest('[data-unit]'); if (!b) return; saveSettings({ unit: b.dataset.unit }); paintOpts(); });
      paintOpts();
      const guard = (fn) => async () => { try { await fn(opts()); } catch (err) { console.error(err); toast('Export impossible : ' + (err.message || err)); } };
      body.querySelector('#csv').addEventListener('click', guard(exportCSV));
      body.querySelector('#xls').addEventListener('click', guard(exportXLS));
      body.querySelector('#json').addEventListener('click', guard(exportJSON));
      body.querySelector('#txt').addEventListener('click', guard(exportTXT));
      body.querySelector('#pdf').addEventListener('click', guard(exportPDF));
      body.querySelector('#md').addEventListener('click', guard(exportMD));
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
