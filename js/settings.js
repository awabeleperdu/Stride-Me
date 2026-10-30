// Réglages d'apparence et de séance (thème, police, taille, espacement, accent, contraste, animations, repos).
// Stockés dans localStorage (appliqués avant le premier rendu) et synchronisés sur users/{uid}.settings.
import { db, isConfigured } from './firebase-config.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getUser } from './auth.js';
import { esc, toast } from './ui.js';
import { playTone, TONES } from './timer.js';
import { WARM_DEFAULT, sanitizeWarm, mountWarmSettings } from './warmup.js';

export const THEMES = [
  { id: 'pro',     label: 'Pro',    bg: '#F3F5F9', card: '#FFFFFF', text: '#0F1B2D', accent: '#1F4FD8' },
  { id: 'aurora',  label: 'Aurora', bg: '#070B14', card: '#1A2236', text: '#F3F6FB', accent: '#2DE2E6' },
  { id: 'classic', label: 'Clair',  bg: '#F6F8F9', card: '#FFFFFF', text: '#1A1A1A', accent: '#0A8F9C' },
  { id: 'dark',    label: 'Dark',   bg: '#11161B', card: '#1B222A', text: '#E0E0E0', accent: '#22D3D3' },
  { id: 'gym',     label: 'Salle',  bg: '#0A0A0A', card: '#141414', text: '#FFFFFF', accent: '#FF1E1E' },
  { id: 'stride', label: 'Stride', bg: '#0B0F14', card: '#121922', text: '#F2F6FA', accent: '#22D3EE' }
];

export const FONTS = [
  { id: 'default',  label: 'Par défaut',            note: 'Police du système' },
  { id: 'lexend',   label: 'Lexend',                note: 'Conçue pour faciliter la lecture' },
  { id: 'atkinson', label: 'Atkinson Hyperlegible', note: 'Lettres très distinctes, lisible en basse vision' },
  { id: 'dyslexic', label: 'OpenDyslexic',          note: 'Pensée pour les personnes dyslexiques' }
];

export const SPACINGS = [
  { id: 'normal', label: 'Normal' },
  { id: 'wide',   label: 'Aéré' },
  { id: 'xwide',  label: 'Très aéré' }
];

export const ACCENTS = [
  { v: '',        label: 'Selon le thème' },
  { v: '#007AFF', label: 'Bleu' },
  { v: '#06B6D4', label: 'Cyan' },
  { v: '#10B981', label: 'Vert' },
  { v: '#F59E0B', label: 'Orange' },
  { v: '#FF1E1E', label: 'Rouge' },
  { v: '#EC4899', label: 'Rose' },
  { v: '#8B5CF6', label: 'Violet' }
];

export const RESTS = [60, 90, 120, 180];

export const DEFAULTS = {
  theme: 'aurora', font: 'default', size: 100, spacing: 'normal',
  pseudo: '', accent: '', contrast: false, motion: false, splash: true, sound: true, tone: 'beep', rest: 90, autoRest: true, vibrate: true, warm: WARM_DEFAULT,
  at: 0                       // date de dernière modification (sert à départager local et compte)
};

const KEY = 'settings';
const has = (list, v, k = 'id') => list.some((x) => x[k] === v);

/** Valide chaque champ : une valeur inconnue ou corrompue retombe sur la valeur par défaut. */
function sanitize(o = {}) {
  const s = { ...DEFAULTS };
  if (has(THEMES, o.theme)) s.theme = o.theme;
  if (has(FONTS, o.font)) s.font = o.font;
  if (has(SPACINGS, o.spacing)) s.spacing = o.spacing;
  const size = Number(o.size);
  if (Number.isFinite(size)) s.size = Math.min(140, Math.max(85, Math.round(size / 5) * 5));
  if (typeof o.accent === 'string' && (o.accent === '' || /^#[0-9a-f]{6}$/i.test(o.accent))) s.accent = o.accent.toUpperCase();
  s.pseudo = typeof o.pseudo === 'string' ? o.pseudo.replace(/\s+/g, ' ').trim().slice(0, 24) : '';
  s.contrast = o.contrast === true;
  s.motion = o.motion === true;
  s.splash = o.splash !== false;
  s.sound = o.sound !== false;
  if (['beep', 'bell', 'gong'].includes(o.tone)) s.tone = o.tone;
  s.vibrate = o.vibrate !== false;
  s.autoRest = o.autoRest !== false;
  if (RESTS.includes(Number(o.rest))) s.rest = Number(o.rest);
  s.warm = sanitizeWarm(o.warm);
  const at = Number(o.at);
  s.at = Number.isFinite(at) && at > 0 ? at : 0;
  return s;
}

function readLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
    const legacy = localStorage.getItem('theme');          // ancienne clé : on la respecte si rien d'autre
    return sanitize({ ...(legacy ? { theme: legacy } : {}), ...raw });
  } catch { return { ...DEFAULTS }; }
}

let cur = readLocal();
export const getSettings = () => cur;

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Applique les réglages au document (attributs data-* + variables CSS). */
export function applySettings(s = cur) {
  const h = document.documentElement;
  h.setAttribute('data-theme', s.theme);
  h.dataset.font = s.font;
  h.dataset.spacing = s.spacing;
  h.dataset.contrast = s.contrast ? 'high' : 'normal';
  h.dataset.motion = s.motion ? 'off' : 'on';
  h.dataset.splash = s.splash ? 'on' : 'off';
  h.style.setProperty('--fs', String(s.size / 100));

  if (s.accent) {
    h.style.setProperty('--accent', s.accent);
    h.style.setProperty('--accent-contrast', lum(s.accent) > 0.45 ? '#111111' : '#FFFFFF');
    if (s.theme === 'gym' || s.theme === 'aurora') h.style.setProperty('--accent-glow', `0 0 15px color-mix(in srgb, ${s.accent} 40%, transparent)`);
    else h.style.removeProperty('--accent-glow');
  } else {
    ['--accent', '--accent-contrast', '--accent-glow'].forEach((p) => h.style.removeProperty(p));
  }
  const t = THEMES.find((x) => x.id === s.theme);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.bg);
}

let syncTimer = 0;
let pending = false;

async function pushRemote() {
  clearTimeout(syncTimer);
  if (!pending) return;
  pending = false;
  if (!isConfigured || !getUser()) return;
  try { await setDoc(doc(db, 'users', getUser().uid), { settings: cur, theme: cur.theme }, { merge: true }); }
  catch (e) { pending = true; console.warn('Synchronisation des réglages impossible', e); }
}

function syncRemote() {
  pending = true;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushRemote, 400);
}
// On quitte l'onglet avant la fin du délai : on envoie tout de suite.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pushRemote(); });
window.addEventListener('pagehide', pushRemote);

const persistLocal = () => { try { localStorage.setItem(KEY, JSON.stringify(cur)); localStorage.setItem('theme', cur.theme); } catch {} };

export function saveSettings(patch) {
  cur = sanitize({ ...cur, ...patch, at: Date.now() });
  persistLocal();
  applySettings(cur);
  syncRemote();
  return cur;
}

/** Après connexion : récupère les réglages du compte (retrouvés sur un autre appareil). Le plus récent gagne. */
export async function loadRemoteSettings() {
  if (!isConfigured || !getUser()) return;
  try {
    const data = (await getDoc(doc(db, 'users', getUser().uid))).data() || {};
    const remote = data.settings || (data.theme ? { theme: data.theme } : null);
    if (!remote) { if (cur.at) syncRemote(); return; }            // compte sans réglages : on envoie ceux de cet appareil
    const r = sanitize({ ...DEFAULTS, ...remote });
    if (cur.at > r.at) { syncRemote(); return; }                  // les réglages locaux sont plus récents
    cur = r;
    persistLocal();
    applySettings(cur);
  } catch (e) { console.warn('Réglages distants indisponibles', e); }
}

/* ---------------------------------------------------------
   Interface : cartes « Apparence » et « Séance » du Profil
   --------------------------------------------------------- */
export function mountAppearance(el, parts) {
  const s = () => cur;

  el.innerHTML = `
    <div class="card stack" data-part="theme">
      <h3>Thème</h3>
      <div class="theme-tiles" role="group" aria-label="Thème">
        ${THEMES.map((t) => `
          <button type="button" class="theme-tile" data-set="theme" data-val="${t.id}" aria-pressed="false">
            <span class="tile-prev" style="background:${t.bg};border-color:${t.text}22">
              <i style="background:${t.card};border-color:${t.text}22"></i><b style="background:${t.accent}"></b>
            </span>
            <span>${esc(t.label)}</span>
          </button>`).join('')}
      </div>
      <div class="field">
        <span>Couleur d'accent</span>
        <div class="swatches" role="group" aria-label="Couleur d'accent">
          ${ACCENTS.map((a) => `
            <button type="button" class="swatch ${a.v ? '' : 'auto'}" data-set="accent" data-val="${a.v}" aria-pressed="false"
              aria-label="${esc(a.label)}" title="${esc(a.label)}" ${a.v ? `style="--sw:${a.v}"` : ''}>${a.v ? '' : 'A'}</button>`).join('')}
        </div>
      </div>
    </div>

    <div class="card stack" data-part="font">
      <h3>Police</h3>
      <div class="font-list" role="group" aria-label="Police">
        ${FONTS.map((f) => `
          <button type="button" class="font-opt" data-set="font" data-val="${f.id}" aria-pressed="false">
            <span class="fo-top"><strong>${esc(f.label)}</strong><span class="fo-sample">Aa 123</span></span>
            <small>${esc(f.note)}</small>
          </button>`).join('')}
      </div>

      <div class="field">
        <span class="row between"><span>Taille du texte</span><b id="sizeVal"></b></span>
        <input type="range" id="sizeRange" min="85" max="140" step="5" aria-label="Taille du texte">
        <span class="range-scale"><small>A</small><small style="font-size:1.2em">A</small></span>
      </div>

      <div class="field">
        <span>Espacement du texte</span>
        <div class="seg seg3" role="group" aria-label="Espacement">
          ${SPACINGS.map((o) => `<button type="button" data-set="spacing" data-val="${o.id}" aria-pressed="false">${esc(o.label)}</button>`).join('')}
        </div>
      </div>

      <p class="preview" aria-label="Aperçu">Développé couché · 4 séries × 8 reps<br><span class="muted">Charge 70 kg — repos 90 s</span></p>
    </div>

    <div class="card stack" data-part="comfort">
      <h3>Confort</h3>
      <label class="switch-row">
        <span>Contraste élevé<small>Textes et bordures plus marqués</small></span>
        <span class="switch"><input type="checkbox" data-bool="contrast"><i></i></span>
      </label>
      <label class="switch-row">
        <span>Animation de démarrage<small>Écran d'accueil animé au lancement</small></span>
        <span class="switch"><input type="checkbox" data-bool="splash"><i></i></span>
      </label>
      <label class="switch-row">
        <span>Réduire les animations<small>Moins de mouvements à l'écran</small></span>
        <span class="switch"><input type="checkbox" data-bool="motion"><i></i></span>
      </label>
    </div>

    <div class="card stack" data-part="warm">
      <h3>Échauffement</h3>
      <div id="warmHost" class="stack"></div>
    </div>

    <div class="card stack" data-part="session">
      <h3>Séance</h3>
      <div class="field">
        <span>Temps de repos par défaut</span>
        <div class="seg seg4" role="group" aria-label="Temps de repos">
          ${RESTS.map((r) => `<button type="button" data-set="rest" data-val="${r}" aria-pressed="false">${r >= 120 ? `${r / 60} min` : `${r} s`}</button>`).join('')}
        </div>
      </div>
      <label class="switch-row">
        <span>Lancer le repos automatiquement<small>Le minuteur démarre quand tu valides une série. Désactivé : tu le lances toi-même avec « Lancer le repos maintenant »</small></span>
        <span class="switch"><input type="checkbox" data-bool="autoRest"><i></i></span>
      </label>
      <label class="switch-row">
        <span>Sonnerie en fin de repos<small>Un son quand le minuteur se termine</small></span>
        <span class="switch"><input type="checkbox" data-bool="sound"><i></i></span>
      </label>
      <div class="field">
        <span>Sonnerie</span>
        <div class="seg seg3" role="group" aria-label="Sonnerie">
          ${TONES.map((t) => `<button type="button" data-set="tone" data-val="${t.id}" aria-pressed="false">${esc(t.label)}</button>`).join('')}
        </div>
        <button type="button" class="btn ghost block" id="soundTest" style="margin-top:8px">▶ Écouter</button>
      </div>
      <label class="switch-row">
        <span>Vibration en fin de repos<small>Sur les téléphones compatibles</small></span>
        <span class="switch"><input type="checkbox" data-bool="vibrate"><i></i></span>
      </label>
      <button type="button" class="btn ghost block" id="resetSettings">Réinitialiser les réglages</button>
    </div>`;

  // `parts` : n'affiche que certaines cartes (sous-pages du Profil) ; sans argument, tout s'affiche comme avant.
  if (Array.isArray(parts)) el.querySelectorAll('[data-part]').forEach((c) => { if (!parts.includes(c.dataset.part)) c.remove(); });

  const warmHost = el.querySelector('#warmHost');
  const repaintWarm = warmHost ? mountWarmSettings(warmHost, () => s().warm, (warm) => saveSettings({ warm })) : () => {};

  const paint = () => {
    const v = s();
    el.querySelectorAll('[data-set]').forEach((b) => {
      b.setAttribute('aria-pressed', String(String(v[b.dataset.set]) === b.dataset.val));
    });
    el.querySelectorAll('[data-bool]').forEach((i) => { i.checked = !!v[i.dataset.bool]; });
    const range = el.querySelector('#sizeRange'), val = el.querySelector('#sizeVal');
    if (range) range.value = v.size;
    if (val) val.textContent = `${v.size} %`;
  };

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-set]');
    if (b) {
      const k = b.dataset.set;
      const val = k === 'rest' ? Number(b.dataset.val) : b.dataset.val;
      saveSettings({ [k]: val });
      paint();
      if (k === 'tone') playTone(val);
    } else if (e.target.closest('#soundTest')) {
      playTone(s().tone);
    } else if (e.target.closest('#resetSettings')) {
      saveSettings({ ...DEFAULTS, pseudo: s().pseudo });
      paint(); repaintWarm();
      toast('Réglages réinitialisés');
    }
  });
  el.addEventListener('change', (e) => {
    const i = e.target.closest('[data-bool]');
    if (i) { saveSettings({ [i.dataset.bool]: i.checked }); paint(); }
  });
  el.addEventListener('input', (e) => {
    if (e.target.id === 'sizeRange') { saveSettings({ size: Number(e.target.value) }); const sv = el.querySelector('#sizeVal'); if (sv) sv.textContent = `${s().size} %`; }
  });

  paint();
}
