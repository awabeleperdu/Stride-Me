// Profil enrichi : stats (rang, série, records, semaine), page « Moi » et exports.
import { db } from './firebase-config.js';
import { collection, query, where, limit } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getUser } from './auth.js';
import { readDocs } from './offline.js';
import { fetchHistory, volumeOf } from './statistics.js';
import { esc, toast, vibrate } from './ui.js';
import { getSettings, saveSettings, GOALS, LEVELS } from './settings.js';

export const RANKS = [
  { min: 0, name: 'Recrue', c: '#9AA4B2' }, { min: 5, name: 'Bronze', c: '#CD7F32' }, { min: 15, name: 'Argent', c: '#C0C7D1' },
  { min: 40, name: 'Or', c: '#FFC83D' }, { min: 80, name: 'Platine', c: '#5EEAD4' }, { min: 150, name: 'Diamant', c: '#60A5FA' }
];
export const rankOf = (n) => {
  let i = 0; RANKS.forEach((r, k) => { if (n >= r.min) i = k; });
  const nx = RANKS[i + 1];
  return { ...RANKS[i], next: nx || null, pct: nx ? Math.round(((n - RANKS[i].min) / (nx.min - RANKS[i].min)) * 100) : 100 };
};

const dk = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const f1 = (x) => (Math.round(x * 10) / 10).toLocaleString('fr-FR');

/** Série de jours d'entraînement consécutifs (aujourd'hui pas encore fait : on compte à partir d'hier). */
function streakOf(dates) {
  const set = new Set(dates);
  const d = new Date(); d.setHours(12);
  if (!set.has(dk(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(dk(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export async function loadMeasurements() {
  try {
    const snap = await readDocs(query(collection(db, 'measurements'), where('userId', '==', getUser().uid), limit(400)));
    return snap.docs.map((d) => d.data()).filter((r) => r.weight).sort((a, b) => a.date.localeCompare(b.date));
  } catch { return []; }
}

export async function profileStats() {
  const [history, meas] = await Promise.all([fetchHistory(5000), loadMeasurements()]);
  const dates = [...new Set(history.map((w) => w.date))];
  const mon = new Date(); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - (getSettings().weekStart === 'sun' ? mon.getDay() : (mon.getDay() + 6) % 7));
  const weekN = dates.filter((d) => d >= dk(mon)).length;
  const best = new Map();
  for (const w of history) for (const ex of w.exercises) for (const s of ex.sets) {
    const wt = Number(s.weight) || 0, rp = Number(s.reps) || 0;
    if (!rp) continue;
    const b = best.get(ex.name) || { name: ex.name, wt: 0, reps: 0 };
    if (wt > b.wt || (wt === b.wt && rp > b.reps)) { b.wt = wt; b.reps = rp; }
    best.set(ex.name, b);
  }
  const records = [...best.values()].sort((a, b) => b.wt - a.wt || b.reps - a.reps).slice(0, 3);
  const oldest = history.length ? history[history.length - 1].date : '';
  return {
    total: history.length, streak: streakOf(dates), weekN, records, history,
    since: oldest, weight: meas.at(-1)?.weight || 0, startWeight: meas[0]?.weight || 0, measHeight: [...meas].reverse().find((r) => r.height)?.height || 0
  };
}

export const memberSince = (st) => {
  const u = getUser(); const t = Date.parse(u?.metadata?.creationTime || '') || getSettings().since || Date.parse(st.since || '');
  if (!t) return '';
  const d = Math.max(0, Math.floor((Date.now() - t) / 86400000));
  return d < 1 ? 'Nouveau ici' : `Membre depuis ${d} jour${d > 1 ? 's' : ''}`;
};

export const avatarHTML = (s, size = '') => (s.avatar ? `<div class="pro-av ${size}"><img src="${s.avatar}" alt=""></div>` : `<div class="pro-av ${size}">${esc((s.pseudo || 'T')[0].toUpperCase())}</div>`);

/** Réduit une photo en JPEG 160 px (≈ 6 Ko) : assez léger pour être synchronisé avec le compte. */
function shrink(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const S = 160, c = document.createElement('canvas'); c.width = c.height = S;
      const m = Math.min(img.width, img.height), sx = (img.width - m) / 2, sy = (img.height - m) / 2;
      c.getContext('2d').drawImage(img, sx, sy, m, m, 0, 0, S, S);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Image illisible')); };
    img.src = url;
  });
}

/** Page « Moi » : infos perso qui servent aux stats. */
export function mountMe(body, onChange) {
  const s = getSettings();
  const opts = (list, v) => list.map((o) => `<option value="${o.id}"${o.id === v ? ' selected' : ''}>${o.label}</option>`).join('');
  body.innerHTML = `
    <div class="card stack">
      <h3>Photo</h3>
      <div class="me-photo">${avatarHTML(s, 'big')}
        <div class="stack" style="gap:8px">
          <label class="btn ghost sm" for="mePhoto">Choisir une photo</label>
          <input type="file" id="mePhoto" accept="image/*" hidden>
          ${s.avatar ? '<button type="button" class="btn ghost sm" id="mePhotoDel">Retirer</button>' : ''}
        </div>
      </div>
    </div>
    <div class="card stack">
      <h3>Mon objectif</h3>
      <label class="field"><span>Objectif</span><select class="input" id="meGoal">${opts(GOALS, s.goal)}</select></label>
      <label class="field"><span>Niveau</span><select class="input" id="meLevel">${opts(LEVELS, s.level)}</select></label>
      <div class="field"><span>Séances par semaine visées</span>
        <div class="ex-chips" id="meWeek">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<button type="button" class="chip${n === s.week ? ' on' : ''}" data-w="${n}">${n}</button>`).join('')}</div>
      </div>
    </div>
    <div class="card stack">
      <h3>Mon corps</h3>
      <div class="grid-2">
        <label class="field"><span>Taille (cm)</span><input class="input" id="meH" inputmode="numeric" placeholder="178" value="${s.height || ''}"></label>
        <label class="field"><span>Année de naissance</span><input class="input" id="meB" inputmode="numeric" placeholder="2006" value="${s.birth || ''}"></label>
      </div>
      <label class="field"><span>Poids cible (kg)</span><input class="input" id="meT" inputmode="decimal" placeholder="80" value="${s.target || ''}"></label>
      <button type="button" class="btn block" id="meSave">Enregistrer</button>
    </div>`;
  body.querySelector('#mePhoto').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { saveSettings({ avatar: await shrink(f) }); toast('Photo mise à jour'); onChange(); }
    catch (err) { console.error(err); toast('Photo impossible : ' + err.message); }
  });
  body.querySelector('#mePhotoDel')?.addEventListener('click', () => { saveSettings({ avatar: '' }); onChange(); });
  body.querySelector('#meGoal').addEventListener('change', (e) => { saveSettings({ goal: e.target.value }); toast('Objectif enregistré'); });
  body.querySelector('#meLevel').addEventListener('change', (e) => { saveSettings({ level: e.target.value }); toast('Niveau enregistré'); });
  body.querySelector('#meWeek').addEventListener('click', (e) => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    saveSettings({ week: Number(b.dataset.w) }); vibrate(8);
    body.querySelectorAll('#meWeek .chip').forEach((c) => c.classList.toggle('on', c === b));
  });
  body.querySelector('#meSave').addEventListener('click', () => {
    const num = (id) => parseFloat(body.querySelector(id).value.replace(',', '.')) || 0;
    const n = saveSettings({ height: num('#meH'), birth: num('#meB'), target: num('#meT') });
    const bad = [];
    if (body.querySelector('#meH').value && !n.height) bad.push('taille');
    if (body.querySelector('#meB').value && !n.birth) bad.push('année');
    if (body.querySelector('#meT').value && !n.target) bad.push('poids cible');
    toast(bad.length ? `Valeur invalide : ${bad.join(', ')}` : 'Enregistré');
  });
}
