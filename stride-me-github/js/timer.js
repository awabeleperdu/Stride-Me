// Minuteur de repos GLOBAL : survit à la navigation et au rechargement (basé sur une heure de fin),
// pastille flottante sur toutes les pages, mode plein écran, sonnerie de fin réglable.
import { toast, vibrate } from './ui.js';
import { getSettings } from './settings.js';

const KEY = 'restTimer';
const R = 52, C = 2 * Math.PI * R;
let st = null;            // { end, total, paused: msRestantes|null, done: ms|null, label }
let chip = null, full = null, tick = 0, doneTimer = 0, ctx = null;

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const save = () => { try { st ? localStorage.setItem(KEY, JSON.stringify(st)) : localStorage.removeItem(KEY); } catch {} };
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/* ---------- Sonneries (WebAudio, aucun fichier) ---------- */
export const TONES = [{ id: 'beep', label: 'Bip' }, { id: 'bell', label: 'Cloche' }, { id: 'gong', label: 'Gong' }];
export function unlockAudio() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {}
}
function note(freq, t0, dur, { type = 'sine', gain = 0.35, decay = true } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ctx.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + t0 + 0.02);
  if (decay) g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t0 + dur);
  else { g.gain.setValueAtTime(gain, ctx.currentTime + t0 + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t0 + dur); }
  o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + dur + 0.05);
}
export function playTone(id = getSettings().tone) {
  unlockAudio(); if (!ctx) return;
  if (id === 'bell') { [0, 0.55].forEach((t) => { note(1318, t, 1.4, { gain: 0.3 }); note(1976, t, 0.9, { gain: 0.12 }); note(2637, t, 0.5, { gain: 0.06 }); }); }
  else if (id === 'gong') { note(196, 0, 3, { gain: 0.45 }); note(392, 0, 2.2, { gain: 0.2 }); note(588, 0, 1.6, { gain: 0.1 }); note(247, 0.02, 2.6, { gain: 0.15 }); }
  else { [0, 0.28, 0.56].forEach((t) => note(988, t, 0.2, { type: 'square', gain: 0.18, decay: false })); }
}

/* ---------- État ---------- */
export const restState = () => {
  if (!st) return null;
  if (st.done) return { phase: 'done', left: 0, total: st.total, label: st.label };
  const left = st.paused != null ? Math.ceil(st.paused / 1000) : Math.max(0, Math.ceil((st.end - Date.now()) / 1000));
  return { phase: st.paused != null ? 'paused' : 'run', left, total: st.total, label: st.label };
};
export function startRest(sec, label = '') {
  unlockAudio();
  st = { end: Date.now() + sec * 1000, total: sec, paused: null, done: null, label };
  save(); paint(); loop();
}
export function addRest(sec) {
  if (!st || st.done) return;
  if (st.paused != null) st.paused = Math.max(1000, st.paused + sec * 1000); else st.end += sec * 1000;
  st.total = Math.max(st.total, restState().left); save(); paint();
}
export function pauseRest() { if (st && !st.done && st.paused == null) { st.paused = Math.max(0, st.end - Date.now()); save(); paint(); } }
export function resumeRest() { if (st && st.paused != null) { st.end = Date.now() + st.paused; st.paused = null; save(); paint(); loop(); } }
export function stopRest() { st = null; save(); clearInterval(tick); clearTimeout(doneTimer); closeFull(); paint(); }

function finish() {
  if (!st || st.done) return;
  st.done = Date.now(); save();
  if (getSettings().sound) playTone();
  if (getSettings().vibrate) navigator.vibrate?.([250, 120, 250, 120, 400]);
  toast('Repos terminé 💪');
  paint();
  doneTimer = setTimeout(() => { if (full) return; stopRest(); }, 8000);
}
function loop() {
  clearInterval(tick);
  tick = setInterval(() => {
    if (!st) return clearInterval(tick);
    if (!st.done && st.paused == null && Date.now() >= st.end) finish();
    paint();
  }, 250);
}

/* ---------- Interface ---------- */
function ring(frac, cls) {
  return `<svg viewBox="0 0 120 120" class="rt-ring ${cls}" aria-hidden="true"><circle cx="60" cy="60" r="${R}" class="rt-bg"/><circle cx="60" cy="60" r="${R}" class="rt-fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}" transform="rotate(-90 60 60)"/></svg>`;
}
function build() {
  chip = document.createElement('button');
  chip.id = 'rtChip'; chip.type = 'button'; chip.hidden = true;
  chip.setAttribute('aria-label', 'Minuteur de repos : ouvrir en plein écran');
  chip.addEventListener('click', openFull);
  document.body.appendChild(chip);
  addEventListener('pointerdown', unlockAudio, { once: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (st && !st.done && st.paused == null && Date.now() >= st.end) finish(); paint(); } });
}
function paint() {
  if (!chip) return;
  const s = restState();
  const auth = document.getElementById('app-shell')?.classList.contains('auth-mode');
  chip.hidden = !s || auth;
  document.body.classList.toggle('has-rest', !!s && !auth);
  if (s) {
    const frac = s.total ? Math.max(0, Math.min(1, s.left / s.total)) : 0;
    const phase = s.phase === 'done' ? 'done' : s.left <= 10 ? 'warn' : '';
    chip.className = `rt-${s.phase} ${phase}`; chip.id = 'rtChip';
    chip.innerHTML = `${ring(frac, phase)}<span class="rt-t">${s.phase === 'done' ? 'Go !' : fmt(s.left)}</span>`;
  }
  paintFull(s);
}
function paintFull(s = restState()) {
  if (!full) return;
  if (!s) return closeFull();
  const frac = s.total ? Math.max(0, Math.min(1, s.left / s.total)) : 0;
  const phase = s.phase === 'done' ? 'done' : s.left <= 10 ? 'warn' : s.phase === 'paused' ? 'paused' : '';
  full.className = `rt-full on ${phase}`;
  full.querySelector('.rt-big').innerHTML = ring(frac, phase);
  full.querySelector('.rt-num').textContent = s.phase === 'done' ? '✓' : fmt(s.left);
  full.querySelector('.rt-cap').textContent = s.phase === 'done' ? 'C\'est reparti !' : s.phase === 'paused' ? 'En pause' : (s.label || 'Repos');
  full.querySelector('[data-r=pause]').textContent = s.phase === 'paused' ? 'Reprendre' : 'Pause';
  full.querySelector('[data-r=pause]').hidden = s.phase === 'done';
  full.querySelector('[data-r=m15]').hidden = full.querySelector('[data-r=p15]').hidden = s.phase === 'done';
  full.querySelector('[data-r=stop]').textContent = s.phase === 'done' ? 'Continuer la séance' : 'Passer le repos';
}
function openFull() {
  if (full || !st) return;
  full = document.createElement('div');
  full.className = 'rt-full';
  full.setAttribute('role', 'dialog'); full.setAttribute('aria-modal', 'true'); full.setAttribute('aria-label', 'Minuteur de repos');
  full.innerHTML = `
    <button type="button" class="rt-min" data-r="min" aria-label="Réduire le minuteur">⌄</button>
    <div class="rt-center"><div class="rt-wrap"><div class="rt-big"></div><div class="rt-num"></div></div><p class="rt-cap"></p></div>
    <div class="rt-actions">
      <button type="button" class="rt-btn" data-r="m15">− 15 s</button>
      <button type="button" class="rt-btn main" data-r="pause">Pause</button>
      <button type="button" class="rt-btn" data-r="p15">+ 15 s</button>
    </div>
    <button type="button" class="rt-stop" data-r="stop">Passer le repos</button>`;
  full.addEventListener('click', (e) => {
    const r = e.target.closest('[data-r]')?.dataset.r; if (!r) return; vibrate(10);
    if (r === 'min') closeFull();
    else if (r === 'm15') addRest(-15);
    else if (r === 'p15') addRest(15);
    else if (r === 'pause') (restState().phase === 'paused' ? resumeRest() : pauseRest());
    else if (r === 'stop') stopRest();
  });
  document.body.appendChild(full);
  document.addEventListener('keydown', onKey);
  paintFull();
  requestAnimationFrame(() => full?.classList.add('on'));
}
const onKey = (e) => { if (e.key === 'Escape') closeFull(); };
function closeFull() {
  if (!full) return;
  const el = full; full = null; el.classList.remove('on'); setTimeout(() => el.remove(), 220);
  document.removeEventListener('keydown', onKey);
}

/** À appeler une fois au démarrage (après connexion). */
export function initTimer() {
  if (!chip) build();
  st = read();
  if (st && st.done && Date.now() - st.done > 8000) st = null;
  if (st && !st.done && st.paused == null && Date.now() >= st.end + 60000) st = null;   // périmé (app fermée longtemps)
  save();
  if (st) { if (!st.done && st.paused == null && Date.now() >= st.end) finish(); loop(); }
  paint();
}
export const refreshTimer = () => paint();
