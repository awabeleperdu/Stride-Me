// Service worker minimal : Android l'exige pour proposer « Installer l'application » avec la vraie icône.
// Il ne met RIEN en cache et force le navigateur à revérifier chaque fichier : après un envoi sur GitHub,
// la nouvelle version s'affiche tout de suite (plus de vieux fichiers JS en cache).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(fetch(r, { cache: 'no-cache' }).catch(() => fetch(r)));
});
