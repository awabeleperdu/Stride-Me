// Chrono cycle : une suite d'étapes chronométrées (ex. abdos 45 s → obliques 45 s → gainage 45 s), répétée en tours.
// Un signal sonore (et une vibration) à chaque changement d'étape, compte à rebours 3-2-1, pause, passer, arrêter.
// Le temps est calculé à partir de l'heure réelle : si l'écran se verrouille un instant, le cycle reste à la bonne étape.
import { esc, icon, vibrate } from './ui.js';

const KEY = 'cycleCfg';
const PRESETS = [
  { id: 'abs', label: 'Abdos', cfg: { steps: [{ n: 'Abdos', s: 45 }, { n: 'Obliques', s: 45 }, { n: 'Gainage', s: 45 }], rest: 10, rounds: 3, prep: 5 } },
  { id: 'tabata', label: 'Tabata', cfg: { steps: [{ n: 'Effort', s: 20 }], rest: 10, rounds: 8, prep: 5 } },
  { id: 'circuit', label: 'Circuit 30/30', cfg: { steps: [{ n: 'Pompes', s: 30 }, { n: 'Squats', s: 30 }, { n: 'Gainage', s: 30 }], rest: 30, rounds: 3, prep: 5 } }
];
const DEFAULT_CFG = PRESETS[0].cfg;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function sanitize(c) {
  const o = c && typeof c === 'object' ? c : {};
  const steps = (Array.isArray(o.steps) ? o.steps : []).slice(0, 12)
    .map((x) => ({ n: String((x && x.n) || '').replace(/\s+/g, ' ').trim().slice(0, 30) || 'Étape', s: clamp(Math.round(Number(x && x.s) / 5) * 5 || 30, 5, 600) }));
  return {
    steps: steps.length ? steps : structuredClone(DEFAULT_CFG.steps),
    rest: clamp(Math.round(Number(o.rest) / 5) * 5 || 0, 0, 120),
    rounds: clamp(Math.round(Number(o.rounds)) || 1, 1, 30),
    prep: [0, 3, 5, 10].includes(Number(o.prep)) ? Number(o.prep) : 5
  };
}
const load = () => { try { const raw = localStorage.getItem(KEY); return sanitize(raw ? JSON.parse(raw) : DEFAULT_CFG); } catch { return sanitize(DEFAULT_CFG); } };
const save = (c) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* stockage indisponible : le réglage reste pour cette ouverture */ } };

/** Découpe le cycle en segments : compte à rebours, étapes de travail, repos entre étapes et entre tours. */
export function buildTimeline(c) {
  const out = [];
  if (c.prep) out.push({ k: 'prep', n: 'Prêt ?', s: c.prep, r: 1 });
  for (let r = 1; r <= c.rounds; r++) {
    c.steps.forEach((st, i) => {
      out.push({ k: 'work', n: st.n, s: st.s, r });
      const last = r === c.rounds && i === c.steps.length - 1;
      if (c.rest && !last) out.push({ k: 'rest', n: 'Repos', s: c.rest, r });
    });
  }
  return out;
}
const total = (tl) => tl.reduce((t, x) => t + x.s, 0);
export const fmt = (s) => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m ? `${m} min${s % 60 ? ' ' + String(s % 60).padStart(2, '0') : ''}` : `${s} s`; };
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.ceil(s)) % 60).padStart(2, '0')}`;

/* ---------- Sons (WebAudio, créés au tap sur « Démarrer ») ---------- */
let actx = null;
const unlock = () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch { /* pas de son */ } };
function beep(freq, t0, dur, gain = 0.3, type = 'sine') {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + t0;
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.05);
}
const sound = {
  tick: () => beep(880, 0, 0.09, 0.22),
  work: () => { beep(1320, 0, 0.18, 0.32); beep(1760, 0.2, 0.3, 0.32); },     // début d'un effort : deux notes aiguës
  rest: () => beep(660, 0, 0.45, 0.3),                                         // début d'un repos : une note grave
  end: () => { [0, 0.22, 0.44].forEach((t) => beep(1320, t, 0.18, 0.3)); beep(196, 0.7, 2.2, 0.4); beep(392, 0.7, 1.6, 0.18); }
};

export function openCycle() {
  let cfg = load();
  const ov = document.createElement('div');
  ov.className = 'cyc';
  ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Chrono cycle');
  document.body.appendChild(ov);
  let run = null, timer = null, lock = null;

  const close = () => { stop(); ov.classList.add('out'); setTimeout(() => ov.remove(), 200); };
  const stop = () => { clearInterval(timer); timer = null; run = null; try { lock && lock.release(); } catch { /* déjà libéré */ } lock = null; };

  /* ----- Réglages ----- */
  const summary = () => { const tl = buildTimeline(cfg); return `${cfg.steps.length} étape${cfg.steps.length > 1 ? 's' : ''} × ${cfg.rounds} tour${cfg.rounds > 1 ? 's' : ''} · ≈ ${fmt(total(tl))}`; };
  function drawConfig() {
    ov.className = 'cyc';
    ov.innerHTML = `
      <div class="cyc-head"><button type="button" class="cyc-x" data-a="close" aria-label="Fermer">✕</button><h2>Chrono cycle</h2></div>
      <div class="cyc-body">
        <p class="muted">Enchaîne des étapes chronométrées. Un signal sonne à chaque changement.</p>
        <div class="cyc-presets" role="group" aria-label="Modèles">${PRESETS.map((p) => `<button type="button" class="chip" data-preset="${p.id}">${esc(p.label)}</button>`).join('')}</div>
        <div class="cyc-steps" id="cycSteps">
          ${cfg.steps.map((st, i) => `
            <div class="cyc-row" data-i="${i}">
              <span class="cyc-n">${i + 1}</span>
              <input class="input" data-f="n" value="${esc(st.n)}" maxlength="30" aria-label="Nom de l'étape ${i + 1}">
              <div class="cyc-dur"><button type="button" data-d="-5" aria-label="Moins 5 secondes">−</button><b>${fmt(st.s)}</b><button type="button" data-d="5" aria-label="Plus 5 secondes">+</button></div>
              <button type="button" class="cyc-del" data-a="del" aria-label="Supprimer l'étape ${i + 1}" ${cfg.steps.length < 2 ? 'disabled' : ''}>✕</button>
            </div>`).join('')}
        </div>
        <button type="button" class="btn ghost block" data-a="add" ${cfg.steps.length >= 12 ? 'disabled' : ''}>${icon('plus')} Ajouter une étape</button>
        <div class="cyc-opts">
          <div class="cyc-opt"><span>Repos entre les étapes</span><div class="cyc-dur"><button type="button" data-o="rest" data-d="-5" aria-label="Moins">−</button><b>${cfg.rest ? fmt(cfg.rest) : 'aucun'}</b><button type="button" data-o="rest" data-d="5" aria-label="Plus">+</button></div></div>
          <div class="cyc-opt"><span>Nombre de tours</span><div class="cyc-dur"><button type="button" data-o="rounds" data-d="-1" aria-label="Moins">−</button><b>${cfg.rounds}</b><button type="button" data-o="rounds" data-d="1" aria-label="Plus">+</button></div></div>
          <div class="cyc-opt"><span>Compte à rebours de départ</span><div class="seg seg4" role="group" aria-label="Compte à rebours">${[0, 3, 5, 10].map((p) => `<button type="button" data-prep="${p}" aria-pressed="${cfg.prep === p}">${p ? p + ' s' : 'Non'}</button>`).join('')}</div></div>
        </div>
      </div>
      <div class="cyc-foot"><p class="muted" id="cycSum">${summary()}</p><button type="button" class="btn block" data-a="start">Démarrer le cycle</button></div>`;
  }
  const refreshSum = () => { const s = ov.querySelector('#cycSum'); if (s) s.textContent = summary(); };

  /* ----- Lancement ----- */
  function start() {
    cfg = sanitize(cfg); save(cfg);
    unlock();
    run = { tl: buildTimeline(cfg), t0: Date.now(), pausedAt: null, paused: 0, idx: -1, lastTick: null };
    try { navigator.wakeLock && navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {}); } catch { /* facultatif */ }
    drawRun(); timer = setInterval(tick, 200); tick();
  }
  const elapsed = () => ((run.pausedAt ?? Date.now()) - run.t0 - run.paused) / 1000;
  function where() {   // segment courant + temps restant dans ce segment
    let acc = 0; const e = elapsed();
    for (let i = 0; i < run.tl.length; i++) { if (e < acc + run.tl[i].s) return { i, left: acc + run.tl[i].s - e, seg: run.tl[i] }; acc += run.tl[i].s; }
    return { i: run.tl.length, left: 0, seg: null };
  }
  function tick() {
    if (!run) return;
    const w = where();
    if (w.i >= run.tl.length) { finish(); return; }
    if (w.i !== run.idx) { run.idx = w.i; run.lastTick = null; paintStep(w); (w.seg.k === 'rest' ? sound.rest : sound.work)(); vibrate(w.seg.k === 'rest' ? 20 : [30, 40, 30]); }
    const sec = Math.ceil(w.left);
    if (sec <= 3 && sec >= 1 && sec !== run.lastTick && run.pausedAt == null && w.seg.s > 3) { run.lastTick = sec; sound.tick(); vibrate(8); }
    paintTime(w);
  }
  function finish() {
    const t = total(run.tl);
    stop(); sound.end(); vibrate([60, 60, 60, 60, 200]);
    ov.className = 'cyc cyc-done';
    ov.innerHTML = `
      <div class="cyc-center">
        <div class="cyc-check" aria-hidden="true">✓</div>
        <h2>Cycle terminé</h2>
        <p class="muted">${cfg.steps.length} étape${cfg.steps.length > 1 ? 's' : ''} × ${cfg.rounds} tour${cfg.rounds > 1 ? 's' : ''} · ${fmt(t)}</p>
      </div>
      <div class="cyc-foot"><button type="button" class="btn block" data-a="start">Refaire</button><button type="button" class="btn ghost block" data-a="config">Modifier le cycle</button><button type="button" class="linkbtn" data-a="close">Fermer</button></div>`;
  }

  /* ----- Écran de chrono ----- */
  const R = 120, CIRC = 2 * Math.PI * R;
  function drawRun() {
    ov.className = 'cyc cyc-run';
    ov.innerHTML = `
      <div class="cyc-head"><button type="button" class="cyc-x" data-a="stop" aria-label="Arrêter le cycle">✕</button><span class="cyc-round" id="cycRound"></span></div>
      <div class="cyc-center" role="status" aria-live="polite">
        <div class="cyc-ring"><svg viewBox="0 0 280 280" aria-hidden="true"><circle class="cyc-bg" cx="140" cy="140" r="${R}"/><circle class="cyc-fg" id="cycFg" cx="140" cy="140" r="${R}" stroke-dasharray="${CIRC}" stroke-dashoffset="0"/></svg><div class="cyc-time" id="cycTime">0</div></div>
        <h2 id="cycName"></h2>
        <p class="muted" id="cycNext"></p>
      </div>
      <div class="cyc-prog"><i id="cycProg"></i></div>
      <div class="cyc-foot cyc-ctrl"><button type="button" class="btn ghost" data-a="skip">Passer ›</button><button type="button" class="btn" data-a="pause" id="cycPause">Pause</button></div>`;
  }
  function paintStep(w) {
    ov.dataset.kind = w.seg.k;
    ov.querySelector('#cycName').textContent = w.seg.n;
    const nxt = run.tl[w.i + 1];
    ov.querySelector('#cycNext').textContent = nxt ? `Ensuite : ${nxt.n}${nxt.k === 'prep' ? '' : ' · ' + fmt(nxt.s)}` : 'Dernière étape';
    const r = ov.querySelector('#cycRound'); r.textContent = w.seg.k === 'prep' ? 'Prépare-toi' : `Tour ${w.seg.r} / ${cfg.rounds}`;
  }
  function paintTime(w) {
    ov.querySelector('#cycTime').textContent = clock(w.left);
    ov.querySelector('#cycFg').style.strokeDashoffset = String(CIRC * (1 - w.left / w.seg.s));
    ov.querySelector('#cycProg').style.width = `${Math.min(100, (elapsed() / total(run.tl)) * 100)}%`;
  }

  /* ----- Interactions ----- */
  ov.addEventListener('click', (e) => {
    const t = e.target;
    const a = t.closest('[data-a]')?.dataset.a;
    if (a === 'close') return close();
    if (a === 'start') return start();
    if (a === 'config') { drawConfig(); return; }
    if (a === 'stop') { stop(); drawConfig(); return; }
    if (a === 'pause' && run) {
      if (run.pausedAt == null) { run.pausedAt = Date.now(); t.closest('[data-a]').textContent = 'Reprendre'; ov.classList.add('cyc-paused'); }
      else { run.paused += Date.now() - run.pausedAt; run.pausedAt = null; t.closest('[data-a]').textContent = 'Pause'; ov.classList.remove('cyc-paused'); }
      return;
    }
    if (a === 'skip' && run) { const w = where(); run.paused -= w.left * 1000; tick(); return; }
    if (a === 'add') { syncNames(); cfg.steps.push({ n: `Étape ${cfg.steps.length + 1}`, s: 45 }); drawConfig(); return; }
    if (a === 'del') { syncNames(); cfg.steps.splice(Number(t.closest('[data-i]').dataset.i), 1); drawConfig(); return; }
    const pre = t.closest('[data-preset]');
    if (pre) { cfg = sanitize(PRESETS.find((p) => p.id === pre.dataset.preset).cfg); drawConfig(); return; }
    const pp = t.closest('[data-prep]');
    if (pp) { cfg.prep = Number(pp.dataset.prep); drawConfig(); return; }
    const d = t.closest('[data-d]');
    if (d) {
      syncNames();
      const n = Number(d.dataset.d), o = d.dataset.o;
      if (o === 'rest') cfg.rest = clamp(cfg.rest + n, 0, 120);
      else if (o === 'rounds') cfg.rounds = clamp(cfg.rounds + n, 1, 30);
      else { const st = cfg.steps[Number(d.closest('[data-i]').dataset.i)]; st.s = clamp(st.s + n, 5, 600); }
      drawConfig();
    }
  });
  function syncNames() { ov.querySelectorAll('.cyc-row').forEach((row) => { const st = cfg.steps[Number(row.dataset.i)]; if (st) st.n = row.querySelector('[data-f="n"]').value; }); }
  ov.addEventListener('input', (e) => { if (e.target.dataset.f === 'n') syncNames(); });
  ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  drawConfig();
}
