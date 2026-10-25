// Suivi du corps : poids, IMC et mensurations (courbes d'évolution). Collection `measurements` (1 doc par relevé).
import { db } from './firebase-config.js';
import { collection, query, where, getDocs, setDoc, deleteDoc, doc, serverTimestamp, limit } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getUser } from './auth.js';
import { esc, toast, vibrate, dayKey } from './ui.js';
import { queued } from './offline.js';
import { lineChart } from './statistics.js';

export const FIELDS = [
  { id: 'weight', label: 'Poids', unit: 'kg', step: 0.1 },
  { id: 'shoulders', label: 'Épaules', unit: 'cm' },
  { id: 'chest', label: 'Poitrine', unit: 'cm' },
  { id: 'waist', label: 'Taille', unit: 'cm' },
  { id: 'hips', label: 'Hanches', unit: 'cm' },
  { id: 'biceps', label: 'Bras', unit: 'cm' },
  { id: 'thigh', label: 'Cuisse', unit: 'cm' },
  { id: 'calf', label: 'Mollet', unit: 'cm' }
];
const METRICS = [{ id: 'weight', label: 'Poids', unit: 'kg' }, { id: 'bmi', label: 'IMC', unit: '' }, ...FIELDS.slice(1)];

export const bmiOf = (w, h) => (w > 0 && h > 0 ? w / ((h / 100) ** 2) : 0);
export function bmiClass(b) {
  if (b < 18.5) return { label: 'Insuffisance pondérale', k: 'low' };
  if (b < 25) return { label: 'Corpulence normale', k: 'ok' };
  if (b < 30) return { label: 'Surpoids', k: 'mid' };
  return { label: 'Obésité', k: 'high' };
}
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
const f1 = (x) => (Math.round(x * 10) / 10).toLocaleString('fr-FR');
const fmtD = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

let metric = 'weight';

export async function mountBody(host) {
  const snap = await getDocs(query(collection(db, 'measurements'), where('userId', '==', getUser().uid), limit(400)));
  let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.date.localeCompare(b.date));
  let height = [...rows].reverse().find((r) => r.height)?.height || '';

  const draw = () => {
    const last = rows.at(-1);
    const h = num(height) || [...rows].reverse().find((r) => r.height)?.height || 0;
    const bmi = last?.weight && h ? bmiOf(last.weight, h) : 0;
    const cls = bmi ? bmiClass(bmi) : null;
    const m = METRICS.find((x) => x.id === metric) || METRICS[0];
    const pts = rows.map((r) => ({ date: r.date, v: m.id === 'bmi' ? bmiOf(r.weight, r.height || h) : r[m.id] })).filter((p) => p.v > 0);
    const first = pts[0]?.v, cur = pts.at(-1)?.v;
    const diff = pts.length > 1 ? cur - first : null;
    const gauge = bmi ? Math.max(0, Math.min(100, ((bmi - 15) / 25) * 100)) : 0;

    host.innerHTML = `
      <div class="stack body">
        <div class="card stack bmi-card">
          <div class="row between"><h3>IMC</h3>${cls ? `<span class="bmi-tag ${cls.k}">${cls.label}</span>` : ''}</div>
          ${bmi ? `<div class="bmi-val"><b>${f1(bmi)}</b><span>${f1(last.weight)} kg · ${h} cm</span></div>
            <div class="bmi-bar" aria-hidden="true"><i style="left:${gauge}%"></i></div>
            <div class="bmi-scale"><small>15</small><small>18,5</small><small>25</small><small>30</small><small>40</small></div>
            <p class="muted">L'IMC ne distingue pas muscle et graisse : il peut surestimer la corpulence d'une personne très musclée.</p>`
          : '<p class="muted">Ajoute ton poids et ta taille pour calculer ton IMC.</p>'}
        </div>

        <div class="card stack">
          <h3>Nouveau relevé</h3>
          <form id="bodyForm" class="stack" novalidate>
            <div class="grid-2">
              <label class="field"><span>Date</span><input class="input" type="date" name="date" value="${dayKey()}" max="${dayKey()}" required></label>
              <label class="field"><span>Taille (cm)</span><input class="input" inputmode="decimal" name="height" placeholder="178" value="${esc(h || '')}"></label>
            </div>
            <div class="m-grid">
              ${FIELDS.map((f) => `<label class="m-in"><span>${f.label}</span><div><input inputmode="decimal" name="${f.id}" placeholder="${last?.[f.id] ?? '—'}" aria-label="${f.label} (${f.unit})"><small>${f.unit}</small></div></label>`).join('')}
            </div>
            <button class="btn block" type="submit">Enregistrer le relevé</button>
            <p class="muted">Remplis seulement ce que tu as mesuré : les autres champs restent vides.</p>
          </form>
        </div>

        <div class="card stack">
          <div class="row between"><h3>Évolution</h3>${diff !== null ? `<span class="delta ${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : '−'}${f1(Math.abs(diff))} ${m.unit}</span>` : ''}</div>
          <div class="ex-chips" role="group" aria-label="Mesure">${METRICS.map((x) => `<button type="button" class="chip${x.id === metric ? ' on' : ''}" data-metric="${x.id}">${x.label}</button>`).join('')}</div>
          ${pts.length ? `<div class="lc-read" id="lcRead"><b>${f1(cur)} ${m.unit}</b><span>${fmtD(pts.at(-1).date)}${pts.length > 1 ? ` · départ ${f1(first)} ${m.unit}` : ''}</span></div>${lineChart(pts, m.unit)}${pts.length < 2 ? '<p class="muted">Un deuxième relevé et la courbe apparaît.</p>' : ''}`
            : '<p class="muted">Aucun relevé pour cette mesure.</p>'}
        </div>

        ${rows.length ? `<div class="card stack"><h3>Relevés</h3>${[...rows].reverse().slice(0, 20).map((r) => `
          <div class="row between m-row" data-id="${esc(r.id)}">
            <div><b>${fmtD(r.date)}</b><div class="muted">${FIELDS.filter((f) => r[f.id]).map((f) => `${f.label} ${f1(r[f.id])} ${f.unit}`).join(' · ') || '—'}</div></div>
            <button class="btn ghost sm" data-del aria-label="Supprimer ce relevé">✕</button>
          </div>`).join('')}</div>` : ''}
      </div>`;
  };
  draw();

  host.onclick = async (e) => {
    const c = e.target.closest('[data-metric]'); if (c) { metric = c.dataset.metric; draw(); return; }
    const d = e.target.closest('[data-del]');
    if (d) {
      const id = d.closest('[data-id]').dataset.id, r = rows.find((x) => x.id === id);
      try { await deleteDoc(doc(db, 'measurements', id)); rows = rows.filter((x) => x.id !== id); draw(); toast('Relevé supprimé'); vibrate(10); } catch (err) { console.error(err); toast('Erreur'); }
    }
  };
  host.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target), data = { userId: getUser().uid, date: fd.get('date') || dayKey(), createdAt: serverTimestamp() };
    let any = false;
    for (const f of FIELDS) { const v = num(fd.get(f.id)); if (v) { data[f.id] = v; any = true; } }
    const hh = num(fd.get('height')); if (hh) data.height = hh;
    if (!any) { toast('Renseigne au moins une mesure'); return; }
    if (data.weight && (data.weight < 25 || data.weight > 350)) { toast('Poids invalide'); return; }
    try {
      const ref = doc(collection(db, 'measurements'));
      await queued(setDoc(ref, data));
      rows.push({ id: ref.id, ...data }); rows.sort((a, b) => a.date.localeCompare(b.date));
      toast('Relevé enregistré'); vibrate(12); draw();
    } catch (err) { console.error(err); toast('Enregistrement impossible'); }
  };
  return { unmount() { host.onclick = host.onsubmit = null; } };
}
