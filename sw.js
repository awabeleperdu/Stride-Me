// Service worker minimal : Android l'exige pour proposer « Installer l'application » avec la vraie icône.
// Il ne met RIEN en cache : le site se met toujours à jour tout de suite après un envoi sur GitHub.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
