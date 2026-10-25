import { db } from './firebase-config.js';
import { collection, query, where, limit } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getUser } from './auth.js';
import { readDocs } from './offline.js';
import { esc, emptyState, skeleton } from './ui.js';
import { mountBody } from './body.js';

export async function fetchHistory(max = 200) {
  const q = query(collection(db, 'workouts'), where('userId', '==', getUser().uid), limit(max));
  const snap = await readDocs(q);
  // Tri côté client : évite l'index composite (userId + date) au démarrage.
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.date.localeCompare(a.date));
}

export const volumeOf = (w) =>
  w.exercises.reduce((t, ex) => t + ex.sets.reduce((s, x) => s + x.weight * x.reps, 0), 0);

const e1rm = (w, r) => (r > 0 ? w * (1 + r / 30) : w);   // formule d'Epley
const fmtD = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const n0 = (x) => Math.round(x).toLocaleString('fr-FR');

/** Séries validées d'un exercice, séance par séance (date croissante). */
function progressOf(history, name) {
  const out = [];
  for (const w of [...history].reverse()) {
    const ex = w.exercises.find((e) => e.name === name);
    if (!ex) continue;
    const sets = ex.sets.filter((s) => Number(s.weight) > 0 && Number(s.reps) > 0);
    if (!sets.length) continue;
    out.push({
      date: w.date,
      max: Math.max(...sets.map((s) => Number(s.weight))),
      reps: Math.max(...sets.map((s) => Number(s.reps))),
      rm: Math.max(...sets.map((s) => e1rm(Number(s.weight), Number(s.reps)))),
      best: sets.reduce((b, s) => (s.weight > b.weight ? s : b), sets[0])
    });
  }
  return out;
}

/** Courbe SVG lissée avec dégradé, points sélectionnables et repères min/max. */
export function lineChart(pts, unit) {
  const W = 320, H = 180, P = { l: 38, r: 14, t: 16, b: 26 };
  const vals = pts.map((p) => p.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi === lo) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.18; lo = Math.max(0, lo - pad); hi += pad;
  const x = (i) => P.l + (pts.length === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (pts.length - 1));
  const y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const xy = pts.map((p, i) => [x(i), y(p.v)]);
  let d = `M${xy[0][0]},${xy[0][1]}`;
  for (let i = 1; i < xy.length; i++) { const [x0, y0] = xy[i - 1], [x1, y1] = xy[i], cx = (x0 + x1) / 2; d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`; }
  const area = `${d} L${xy[xy.length - 1][0]},${H - P.b} L${xy[0][0]},${H - P.b} Z`;
  const ticks = [0, 0.5, 1].map((t) => lo + (hi - lo) * t);
  const best = vals.indexOf(Math.max(...vals));
  return `<svg class="lc" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution, ${pts.length} séances">
    <defs><linearGradient id="lcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".45"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" class="lc-grid"/><text x="${P.l - 6}" y="${y(t) + 4}" class="lc-t" text-anchor="end">${n0(t)}</text>`).join('')}
    <path d="${area}" fill="url(#lcg)"/><path d="${d}" class="lc-line"/>
    ${xy.map(([px, py], i) => `<g class="lc-pt${i === best ? ' pr' : ''}" data-i="${i}" tabindex="0" role="button" aria-label="${fmtD(pts[i].date)} : ${n0(pts[i].v)} ${unit}"><circle cx="${px}" cy="${py}" r="14" class="hit"/><circle cx="${px}" cy="${py}" r="${i === best ? 5.5 : 4}" class="dot"/></g>`).join('')}
    <text x="${P.l}" y="${H - 6}" class="lc-t">${fmtD(pts[0].date)}</text>
    ${pts.length > 1 ? `<text x="${W - P.r}" y="${H - 6}" class="lc-t" text-anchor="end">${fmtD(pts[pts.length - 1].date)}</text>` : ''}
  </svg>`;
}

const METRICS = [
  { id: 'max', label: 'Charge max', unit: 'kg' },
  { id: 'rm', label: '1RM estimé', unit: 'kg' },
  { id: 'reps', label: 'Répétitions', unit: 'reps' }
];
let pickedEx = '', metric = 'max';

let statsTab = 'ex';
export async function statsView(root) {
  let body = null, inner = null;
  const shell = `<div class="stack"><h2 style="margin:0">Historique</h2><div class="seg" role="group" aria-label="Section"><button type="button" data-st="ex">Progression</button><button type="button" data-st="body">Corps</button></div><div id="stHost"></div></div>`;
  root.innerHTML = shell;
  const host = root.querySelector('#stHost');
  const paintTabs = () => root.querySelectorAll('[data-st]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.st === statsTab)));
  const show = async () => {
    paintTabs(); body?.unmount?.(); body = null; host.onclick = null;
    if (statsTab === 'body') { host.innerHTML = skeleton('/stats'); body = await mountBody(host); }
    else await progressView(host);
  };
  root.addEventListener('click', (e) => { const t = e.target.closest('[data-st]'); if (t && t.dataset.st !== statsTab) { statsTab = t.dataset.st; show(); } });
  await show();
  return { unmount() { body?.unmount?.(); host.onclick = null; } };
}

async function progressView(root) {
  root.innerHTML = skeleton('/stats');
  const history = await fetchHistory();

  if (!history.length) {
    root.innerHTML = emptyState('Aucune séance pour l\'instant', 'Termine ta première séance pour voir ton historique et ta progression.');
    return;
  }

  const monthKey = new Date().toISOString().slice(0, 7);
  const thisMonth = history.filter((w) => w.date.startsWith(monthKey)).length;
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const sets30 = history.filter((w) => w.date >= since).reduce((t, w) => t + w.exercises.reduce((s, e) => s + e.sets.length, 0), 0);

  // Exercices les plus pratiqués d'abord
  const count = new Map();
  history.forEach((w) => w.exercises.forEach((e) => { if (e.sets.some((s) => Number(s.weight) > 0)) count.set(e.name, (count.get(e.name) || 0) + 1); }));
  const names = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  if (!names.includes(pickedEx)) pickedEx = names[0] || '';


  const draw = () => {
    const prog = pickedEx ? progressOf(history, pickedEx) : [];
    const m = METRICS.find((x) => x.id === metric);
    const pts = prog.map((p) => ({ date: p.date, v: p[metric] }));
    const first = pts[0]?.v, last = pts[pts.length - 1]?.v;
    const delta = pts.length > 1 && first > 0 ? ((last - first) / first) * 100 : null;
    const pr = pts.length ? Math.max(...pts.map((p) => p.v)) : 0;

    root.innerHTML = `
      <div class="stack stats">
        <div class="kpis">
          <div class="card kpi"><span>Séances</span><b>${history.length}</b><small>${thisMonth} ce mois-ci</small></div>
          <div class="card kpi"><span>Séries 30 j</span><b>${sets30}</b><small>validées</small></div>
          <div class="card kpi"><span>Exercices suivis</span><b>${names.length}</b><small>avec charge</small></div>
        </div>

        <div class="card stack">
          <div class="row between"><h3>Ma progression</h3>${delta !== null ? `<span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1).replace('.', ',')} %</span>` : ''}</div>
          ${names.length ? `
            <div class="ex-chips" role="group" aria-label="Exercice">${names.map((n) => `<button type="button" class="chip${n === pickedEx ? ' on' : ''}" data-ex="${esc(n)}">${esc(n)}</button>`).join('')}</div>
            <div class="seg seg3" role="group" aria-label="Mesure">${METRICS.map((x) => `<button type="button" data-m="${x.id}" aria-pressed="${x.id === metric}">${x.label}</button>`).join('')}</div>
            ${pts.length ? `
              <div class="lc-read" id="lcRead"><b>${n0(last)} ${m.unit}</b><span>${fmtD(pts[pts.length - 1].date)}${pts.length > 1 ? ` · record ${n0(pr)} ${m.unit}` : ''}</span></div>
              ${lineChart(pts, m.unit)}
              ${pts.length < 2 ? '<p class="muted">Refais cet exercice pour voir la courbe évoluer.</p>' : ''}` : '<p class="muted">Pas encore de séries avec charge pour cet exercice.</p>'}`
          : '<p class="muted">Enregistre des séries avec une charge pour suivre ta progression exercice par exercice.</p>'}
        </div>

        <div class="card stack">
          <h3>Séances récentes</h3>
          ${history.slice(0, 15).map((w) => `
            <details class="hist"><summary><span>${fmtD(w.date)} · ${esc(w.sessionName)}</span><span class="muted">${w.exercises.reduce((t, e) => t + e.sets.length, 0)} séries</span></summary>
              <ul>${w.exercises.map((e) => `<li><b>${esc(e.name)}</b> <span class="muted">${e.sets.map((s) => `${s.weight}×${s.reps}`).join(' · ')}</span></li>`).join('')}</ul>
            </details>`).join('')}
        </div>
      </div>`;
  };
  draw();

  root.onclick = (e) => {
    const c = e.target.closest('[data-ex]'); if (c) { pickedEx = c.dataset.ex; draw(); return; }
    const mm = e.target.closest('[data-m]'); if (mm) { metric = mm.dataset.m; draw(); return; }
    const pt = e.target.closest('.lc-pt'); if (pt) {
      const svg = pt.closest('svg'), chart = svg.closest('.card');
      const read = chart.querySelector('#lcRead'); if (!read) return;
      const isProg = !!read;
      const prog = progressOf(history, pickedEx);
      const p = prog[Number(pt.dataset.i)]; if (!p) return;
      const m = METRICS.find((x) => x.id === metric);
      read.innerHTML = `<b>${n0(p[metric])} ${m.unit}</b><span>${fmtD(p.date)} · meilleure série ${p.best.weight} kg × ${p.best.reps}</span>`;
      chart.querySelectorAll('.lc-pt').forEach((g) => g.classList.toggle('sel', g === pt));
    }
  };
}
