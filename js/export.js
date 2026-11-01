import { fetchHistory } from './statistics.js';
import { toast } from './ui.js';

/* Options communes : { days: 0 = tout | nb de jours, unit: 'kg' | 'lb' } */
const LB = 2.20462;
const stamp = () => new Date().toISOString().slice(0, 10);
const htm = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s;           // neutralise l'injection de formules Excel
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function load(o = {}) {
  let history = await fetchHistory(5000);
  const days = Number(o.days) || 0;
  if (days) {
    const d = new Date(); d.setDate(d.getDate() - days);
    const from = d.toISOString().slice(0, 10);
    history = history.filter((w) => w.date >= from);
  }
  if (!history.length) throw new Error(days ? `aucune séance sur les ${days} derniers jours` : 'rien à exporter');
  const unit = o.unit === 'lb' ? 'lb' : 'kg';
  const k = unit === 'lb' ? LB : 1;
  const wt = (v) => Math.round((Number(v) || 0) * k * 10) / 10;
  return { history, unit, wt };
}

function save(content, type, name) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Export téléchargé');
}

/** 1 ligne = 1 série, du plus ancien au plus récent. */
function lines({ history, wt }) {
  const out = [];
  for (const w of [...history].reverse()) for (const ex of w.exercises) ex.sets.forEach((s, i) =>
    out.push({ w, ex, n: i + 1, kg: wt(s.weight), reps: s.reps, vol: wt(s.weight * s.reps) }));
  return out;
}

/** CSV : séparateur ; + BOM pour Excel FR. */
export async function exportCSV(o) {
  const d = await load(o);
  const rows = [['date', 'seance', 'exercice', 'serie', `poids_${d.unit}`, 'reps', `volume_${d.unit}`, 'ressenti', 'duree_s']];
  for (const r of lines(d)) rows.push([r.w.date, r.w.sessionName, r.ex.name, r.n, r.kg, r.reps, r.vol, r.w.feeling ?? '', r.w.durationSec ?? '']);
  save('﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n'), 'text/csv;charset=utf-8', `stride-me-${stamp()}.csv`);
}

/** Sauvegarde complète (JSON) : historique + réglages. Toujours en kg (données d'origine). */
export async function exportJSON(o) {
  const d = await load({ ...o, unit: 'kg' });
  const { getSettings } = await import('./settings.js');
  const { avatar, ...settings } = getSettings();
  save(JSON.stringify({ app: 'Stride Me', exportedAt: new Date().toISOString(), settings, workouts: d.history }, null, 2), 'application/json', `stride-me-${stamp()}.json`);
}

/** Excel / LibreOffice (.xls HTML) : s'ouvre directement avec mise en forme. */
export async function exportXLS(o) {
  const d = await load(o);
  const head = ['Date', 'Séance', 'Exercice', 'Série', `Poids (${d.unit})`, 'Reps', `Volume (${d.unit})`, 'Ressenti', 'Durée (min)'];
  const rows = lines(d).map((r) => [r.w.date, r.w.sessionName, r.ex.name, r.n, r.kg, r.reps, r.vol, r.w.feeling ?? '', r.w.durationSec ? Math.round(r.w.durationSec / 60) : '']);
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><tr>${head.map((h) => `<th style="background:#222;color:#fff">${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((v) => `<td>${htm(v)}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
  save('﻿' + html, 'application/vnd.ms-excel', `stride-me-${stamp()}.xls`);
}

const setsTxt = (ex, wt, unit) => ex.sets.map((s) => `${wt(s.weight)}${unit === 'lb' ? ' lb' : ''}×${s.reps}`).join(' / ');

/** Résumé lisible (.txt). */
export async function exportTXT(o) {
  const d = await load(o);
  const out = [`STRIDE ME · ${d.history.length} séances · export du ${stamp()}`, ''];
  for (const w of d.history) {
    out.push(`${w.date} · ${w.sessionName}${w.durationSec ? ` · ${Math.round(w.durationSec / 60)} min` : ''}`);
    for (const ex of w.exercises) out.push(`  ${ex.name} : ${setsTxt(ex, d.wt, d.unit)}`);
    out.push('');
  }
  save(out.join('\n'), 'text/plain;charset=utf-8', `stride-me-${stamp()}.txt`);
}

/** Markdown : titres par séance + tableau, se colle tel quel dans Notion / Obsidian. */
export async function exportMD(o) {
  const d = await load(o);
  const out = [`# Stride Me — historique`, '', `${d.history.length} séances · export du ${stamp()} · poids en ${d.unit}`, ''];
  for (const w of d.history) {
    out.push(`## ${w.date} · ${w.sessionName}${w.durationSec ? ` (${Math.round(w.durationSec / 60)} min)` : ''}`, '', '| Exercice | Séries |', '| --- | --- |');
    for (const ex of w.exercises) out.push(`| ${String(ex.name).replace(/\|/g, '/')} | ${setsTxt(ex, d.wt, '')} |`);
    out.push('');
  }
  save(out.join('\n'), 'text/markdown;charset=utf-8', `stride-me-${stamp()}.md`);
}

/** PDF : rapport imprimable. On ouvre la boîte d'impression : « Enregistrer au format PDF ». */
export async function exportPDF(o) {
  const d = await load(o);
  const vol = (w) => w.exercises.reduce((t, ex) => t + ex.sets.reduce((s, x) => s + d.wt(x.weight * x.reps), 0), 0);
  const blocks = d.history.map((w) => `
    <section><h2>${htm(w.date)} · ${htm(w.sessionName)}<small>${w.durationSec ? Math.round(w.durationSec / 60) + ' min · ' : ''}${Math.round(vol(w)).toLocaleString('fr-FR')} ${d.unit}</small></h2>
    <table>${w.exercises.map((ex) => `<tr><td>${htm(ex.name)}</td><td>${htm(setsTxt(ex, d.wt, ''))}</td></tr>`).join('')}</table></section>`).join('');
  const doc = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Stride Me — ${stamp()}</title>
    <style>body{font:13px/1.4 system-ui,sans-serif;color:#111;margin:18mm 14mm}h1{margin:0 0 2px}p{color:#555;margin:0 0 14px}
    section{break-inside:avoid;margin-bottom:12px}h2{font-size:14px;margin:0 0 4px;border-bottom:2px solid #111;padding-bottom:2px;display:flex;justify-content:space-between}
    h2 small{font-weight:400;color:#555}table{width:100%;border-collapse:collapse}td{padding:3px 4px;border-bottom:1px solid #ddd}td:first-child{width:38%;font-weight:600}</style></head>
    <body><h1>Stride Me</h1><p>${d.history.length} séances · poids en ${d.unit} · export du ${stamp()}</p>${blocks}</body></html>`;
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0';
  f.srcdoc = doc;
  document.body.append(f);
  await new Promise((res) => { f.onload = res; setTimeout(res, 1500); });
  try { f.contentWindow.focus(); f.contentWindow.print(); }
  catch (err) { f.remove(); throw new Error('impression bloquée par le navigateur'); }
  setTimeout(() => f.remove(), 60000);
}
