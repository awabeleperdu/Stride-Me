// Service worker : l'appli démarre et s'utilise SANS réseau (salle de sport), les données partent à la reconnexion (Firestore).
// - Fichiers de l'appli (même origine) : réseau d'abord pour avoir toujours la dernière version ; si le réseau est absent
//   ou lent (> 3 s), on sert la copie gardée. Chaque fichier chargé est gardé automatiquement.
// - SDK Firebase (gstatic) et images du catalogue (GitHub) : copie gardée d'abord (ils ne changent pas).
const VERSION = '20261028-seance';
const CACHE = 'stride-' + VERSION;
const PRECACHE = ["./", "index.html", "manifest.webmanifest", "css/aurora.css", "css/brand.css", "css/calendar.css", "css/catalog.css", "css/components.css", "css/fonts.css", "css/gym.css", "css/main.css", "css/pro.css", "css/settings.css", "css/stride.css", "css/themes.css", "css/timer.css", "js/admin.js", "js/adminann.js", "js/admincatalog.js", "js/adminlock.js", "js/anatomy.js", "js/announce.js", "js/announcements.js", "js/auth.js", "js/body.js", "js/calendar.js", "js/catalog.js", "js/demoseed.js", "js/detail.js", "js/devices.js", "js/dnd.js", "js/exercises.js", "js/export.js", "js/firebase-config.js", "js/home.js", "js/login.js", "js/main.js", "js/offline.js", "js/pip.js", "js/planning.js", "js/resume.js", "js/router.js", "js/session.js", "js/settings.js", "js/sharecode.js", "js/statistics.js", "js/swipe.js", "js/timer.js", "js/track.js", "js/ui.js", "js/warmup.js", "js/workout.js", "js/zones.js", "assets/apple-touch-icon.png", "assets/decor.webp", "assets/favicon.png", "assets/icon-192.png", "assets/icon-512.png", "assets/icon-maskable-512.png", "assets/mark.webp", "assets/title.webp", "assets/catalog/catalog.json", "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js", "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js", "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js", "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js", "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js"];
const IMMUTABLE = (u) => (u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/')) || u.hostname === 'raw.githubusercontent.com';
const SLOW = 3000;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('stride-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const keep = async (req, res) => {
  if (res && (res.ok || res.type === 'opaque')) { try { (await caches.open(CACHE)).put(req, res.clone()); } catch { /* quota */ } }
  return res;
};

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
  const same = u.origin === self.location.origin;
  if (!same && !IMMUTABLE(u)) return;                                  // Firestore, Auth, Storage : jamais touchés

  e.respondWith((async () => {
    const cached = await caches.match(r, { ignoreVary: true });
    const catImg = same && /\/assets\/catalog\/[^/]+\.webp$/.test(u.pathname);  // photos d'exercices : jamais modifiées
    if (!same || catImg) {                                              // copie d'abord
      if (cached) return cached;
      return keep(r, await fetch(r));
    }
    const net = fetch(r, { cache: 'no-cache' }).then((res) => keep(r, res));
    if (!cached) {
      try { return await net; }
      catch { return (r.mode === 'navigate' && (await caches.match('index.html'))) || (await caches.match('./')) || Response.error(); }
    }
    net.catch(() => {});                                                // la mise à jour se fait en arrière-plan
    if (self.navigator.onLine === false) return cached;                 // hors ligne : copie tout de suite, sans attendre
    return Promise.race([net, new Promise((res) => setTimeout(() => res(cached), SLOW))]).catch(() => cached);
  })());
});
