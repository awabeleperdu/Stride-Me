import { fetchHistory } from './statistics.js';
import { toast } from './ui.js';

const cell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s;           // neutralise l'injection de formules Excel
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Exporte tout l'historique : 1 ligne = 1 série. Séparateur ; + BOM pour Excel FR. */
export async function exportCSV() {
  const history = await fetchHistory(5000);
  if (!history.length) { toast('Rien à exporter'); return; }

  const rows = [['date', 'seance', 'exercice', 'serie', 'poids_kg', 'reps', 'volume_kg', 'ressenti', 'duree_s']];
  for (const w of [...history].reverse()) {
    for (const ex of w.exercises) {
      ex.sets.forEach((s, i) =>
        rows.push([w.date, w.sessionName, ex.name, i + 1, s.weight, s.reps, s.weight * s.reps, w.feeling ?? '', w.durationSec ?? '']));
    }
  }

  const csv = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `ironlog-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Export téléchargé');
}
