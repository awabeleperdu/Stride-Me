import { skeleton } from './ui.js';
import { update as updateResume } from './resume.js';
import { refreshTimer } from './timer.js';
// Routeur hash minimaliste : #/ , #/exercises , #/stats , #/profile , #/workout
const routes = new Map();
let notFound = () => '<p class="muted">Page introuvable.</p>';
let current = null;

export function register(path, view) { routes.set(path, view); }
export function setNotFound(view) { notFound = view; }
export function navigate(path) { location.hash = '#' + path; }

async function render() {
  const path = (location.hash.slice(1) || '/').split('?')[0];
  const view = routes.get(path) || notFound;
  const root = document.getElementById('view');

  if (current?.unmount) { try { current.unmount(); } catch (e) { console.error(e); } }

  document.body.dataset.route = path === '/' ? 'home' : 'sub';
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.route === ({ '/workout': '/', '/session': '/' }[path] || path)));

  // Squelette léger si la page met plus de 90 ms à arriver (jamais de spinner bloquant)
  const auth = document.getElementById('app-shell')?.classList.contains('auth-mode');
  root.replaceChildren();
  const sk = auth ? 0 : setTimeout(() => { if (!root.firstElementChild) root.innerHTML = skeleton(path); }, 90);
  try {
    current = await view(root);
    clearTimeout(sk);           // une vue reçoit le conteneur et peut renvoyer { unmount }
    if (typeof current === 'string') { root.innerHTML = current; current = null; }
  } catch (err) {
    clearTimeout(sk);
    console.error(err);
    root.innerHTML = '<div class="card"><h3>Erreur</h3><p class="muted">Impossible d\'afficher cette page.</p></div>';
    current = null;
  }
  updateResume();
  refreshTimer();
  root.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  return render();
}
