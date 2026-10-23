// Espace admin › Annonces : publier un message, un sondage ou une question (à tous ou à une seule personne) et lire les réponses.
import { db } from './firebase-config.js';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getUser } from './auth.js';
import { esc, toast, vibrate } from './ui.js';
import { toMs } from './track.js';
import { TYPE_LABEL, STYLES, styleOf } from './announcements.js';

const fmt = (ms) => (ms ? new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

const cell = (v) => { let t = String(v ?? ''); if (/^[=+\-@]/.test(t)) t = "'" + t; return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const iso = (ms) => (ms ? new Date(ms).toISOString().slice(0, 19).replace('T', ' ') : '');
function download(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const slug = (t) => String(t || 'annonce').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'annonce';

export async function mountAnnouncementsAdmin(host, { touch = () => {} } = {}) {
  let items = [], users = [], form = { type: 'message', target: 'all', style: 'info', mode: 'sheet' }, dead = false;
  const nameOf = (uid) => users.find((u) => u.uid === uid)?.email || `compte ${String(uid).slice(0, 6)}…`;

  async function load() {
    const [a, u] = await Promise.all([getDocs(collection(db, 'announcements')), getDocs(collection(db, 'users'))]);
    users = u.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((x) => x.email).sort((p, q) => p.email.localeCompare(q.email));
    items = a.docs.map((d) => ({ id: d.id, ...d.data() })).sort((p, q) => (q.createdAt || 0) - (p.createdAt || 0)).slice(0, 40);
    await Promise.all(items.map(async (x) => {
      try { x.res = (await getDocs(collection(db, 'announcements', x.id, 'responses'))).docs.map((d) => ({ uid: d.id, ...d.data() })); }
      catch (e) { console.warn(e); x.res = []; }
    }));
  }

  const resultHTML = (x) => {
    if (x.display === 'banner') return '<small class="muted">Bandeau affiché en haut de l\'appli tant que l\'annonce est ouverte.</small>';
    const n = x.res.length;
    if (x.type === 'poll') {
      const opts = x.options || [], counts = opts.map((_, i) => x.res.filter((r) => (r.choice || []).includes(i)).length);
      return `<div class="stack">${opts.map((o, i) => `
        <div class="ann-res"><div class="ann-res-t"><span>${esc(o)}</span><b>${counts[i]}</b></div>
        <div class="ann-bar"><i style="width:${n ? Math.round(counts[i] / n * 100) : 0}%"></i></div></div>`).join('')}
        <small class="muted">${n} vote${n > 1 ? 's' : ''}</small></div>`;
    }
    if (x.type === 'question') {
      return n ? `<div class="stack">${[...x.res].sort((a, b) => (b.at || 0) - (a.at || 0)).map((r) => `
        <div class="ann-ans"><small class="muted">${esc(nameOf(r.uid))} · ${esc(fmt(r.at))}</small><p style="white-space:pre-wrap;margin:2px 0 0">${esc(r.text || '')}</p></div>`).join('')}</div>` : '<small class="muted">Pas encore de réponse.</small>';
    }
    return `<small class="muted">Lu par ${n} personne${n > 1 ? 's' : ''}</small>`;
  };

  /** CSV (séparateur ; + BOM, s'ouvre direct dans Excel FR) : 1 ligne = 1 réponse. */
  const rowsOf = (x) => [...x.res].sort((a, b) => (a.at || 0) - (b.at || 0)).map((r) => [
    x.title, TYPE_LABEL[x.type] || 'Annonce', nameOf(r.uid), iso(r.at),
    (r.choice || []).map((i) => (x.options || [])[i]).filter(Boolean).join(' | '), r.text || (r.read ? 'lu' : '')]);
  const HEAD = ['annonce', 'type', 'compte', 'date', 'choix', 'reponse'];
  const toCSV = (rows) => '\ufeff' + [HEAD, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
  function exportOne(x, kind) {
    if (!x.res.length) { toast('Aucune réponse à exporter'); return; }
    const base = `annonce-${slug(x.title)}-${new Date().toISOString().slice(0, 10)}`;
    if (kind === 'json') {
      download(base + '.json', JSON.stringify({ titre: x.title, type: x.type, options: x.options || undefined, creee: iso(x.createdAt),
        reponses: x.res.map((r) => ({ compte: nameOf(r.uid), date: iso(r.at), choix: (r.choice || []).map((i) => (x.options || [])[i]), texte: r.text, lu: r.read })) }, null, 2), 'application/json');
    } else {
      let csv = toCSV(rowsOf(x));
      if (x.type === 'poll') csv += '\r\n\r\n' + [['option', 'votes'], ...(x.options || []).map((o, i) => [o, x.res.filter((r) => (r.choice || []).includes(i)).length])].map((r) => r.map(cell).join(';')).join('\r\n');
      download(base + '.csv', csv, 'text/csv;charset=utf-8');
    }
    toast('Export téléchargé');
  }
  function exportAll() {
    const rows = items.flatMap(rowsOf);
    if (!rows.length) { toast('Aucune réponse à exporter'); return; }
    download(`annonces-reponses-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
    toast('Export téléchargé');
  }

  const modeLabel = (x) => (x.display === 'banner' ? 'Bandeau en haut' : x.lock ? 'Verrou' : x.force ? 'Bloquant' : 'Feuille en bas');
  const cardHTML = (x) => `
    <div class="card stack" data-id="${esc(x.id)}">
      <div class="row between"><div><span class="badge ${x.active === false ? '' : 'accent'}">${STYLES[styleOf(x)].ico} ${esc(TYPE_LABEL[x.type] || 'Annonce')}</span>
        <span class="badge">${esc(modeLabel(x))}</span>
        <span class="badge">${x.target === 'user' ? esc('→ ' + nameOf(x.targetUid)) : 'Tous les comptes'}</span></div>
        <small class="muted">${esc(fmt(x.createdAt))}${x.active === false ? ' · fermée' : ''}${x.expiresAt ? ` · jusqu'au ${esc(fmt(x.expiresAt))}` : ''}</small></div>
      <h4 style="margin:0">${esc(x.title || '')}</h4>
      ${x.body ? `<p class="muted" style="white-space:pre-wrap;margin:0">${esc(x.body)}</p>` : ''}
      ${resultHTML(x)}
      ${x.display !== 'banner' && x.res.length ? `<div class="ann-exp"><button type="button" class="btn ghost" data-a="csv">⬇ CSV</button><button type="button" class="btn ghost" data-a="json">⬇ JSON</button></div>` : ''}
      <div class="grid-2"><button type="button" class="btn ghost block" data-a="toggle">${x.active === false ? 'Rouvrir' : 'Fermer'}</button>
        <button type="button" class="btn ghost block danger-t" data-a="del">Supprimer</button></div>
    </div>`;

  const formHTML = () => `
    <form class="card stack" id="annForm">
      <h3>Nouvelle annonce</h3>
      <div class="seg seg3" role="group" aria-label="Type">
        ${['message', 'poll', 'question'].map((t) => `<button type="button" data-type="${t}" aria-pressed="${form.type === t}">${t === 'message' ? 'Message' : t === 'poll' ? 'Sondage' : 'Question'}</button>`).join('')}
      </div>
      <input class="input" name="title" maxlength="80" required placeholder="${form.type === 'poll' ? 'Ex. Quelle fonction ajouter en premier ?' : form.type === 'question' ? 'Ex. Qu\'est-ce qui te manque dans l\'appli ?' : 'Titre de l\'annonce'}" value="${esc(form.title || '')}">
      <textarea class="input" name="body" rows="3" maxlength="1000" placeholder="Détails (facultatif)">${esc(form.body || '')}</textarea>
      ${form.type === 'poll' ? `
        <textarea class="input" name="options" rows="4" placeholder="Une option par ligne (2 à 8)">${esc(form.options || '')}</textarea>
        <label class="switch-row"><span>Choix multiple<small>Chacun peut cocher plusieurs options</small></span><span class="switch"><input type="checkbox" name="multi" ${form.multi ? 'checked' : ''}><i></i></span></label>` : ''}
      <div class="stack"><small class="muted">Situation</small>
        <div class="ann-pick">${Object.entries(STYLES).map(([k, v]) => `<button type="button" data-style="${k}" aria-pressed="${form.style === k}">${v.ico} ${esc(v.label)}</button>`).join('')}</div></div>
      ${form.type === 'message' ? `<div class="stack"><small class="muted">Affichage</small>
        <div class="seg seg2" role="group" aria-label="Affichage">
          <button type="button" data-mode="sheet" aria-pressed="${form.mode === 'sheet'}">Feuille en bas</button>
          <button type="button" data-mode="banner" aria-pressed="${form.mode === 'banner'}">Bandeau en haut</button></div></div>` : ''}
      ${form.mode === 'banner' && form.type === 'message' ? `
        <label class="switch-row"><span>Fermable<small>L'utilisateur peut le masquer jusqu'au prochain lancement</small></span><span class="switch"><input type="checkbox" name="dismissible" ${form.dismissible ? 'checked' : ''}><i></i></span></label>` : `
        <label class="switch-row"><span>Obligatoire<small>Écran plein, l'appli est inutilisable tant que ce n'est pas validé</small></span><span class="switch"><input type="checkbox" name="force" ${form.force ? 'checked' : ''}><i></i></span></label>
        ${form.type === 'message' && form.force ? `<label class="switch-row"><span>Verrou (sans bouton OK)<small>Reste affiché tant que l'annonce est ouverte. Toi, admin, n'es jamais verrouillé</small></span><span class="switch"><input type="checkbox" name="lock" ${form.lock ? 'checked' : ''}><i></i></span></label>` : ''}`}
      <div class="seg seg2" role="group" aria-label="Destinataire">
        <button type="button" data-target="all" aria-pressed="${form.target === 'all'}">Tous les comptes</button>
        <button type="button" data-target="user" aria-pressed="${form.target === 'user'}">Une personne</button>
      </div>
      ${form.target === 'user' ? `<input class="input" name="who" list="annUsers" autocomplete="off" placeholder="E-mail du compte" value="${esc(form.who || '')}"><datalist id="annUsers">${users.map((u) => `<option value="${esc(u.email)}"></option>`).join('')}</datalist>` : ''}
      <label class="field"><span>Visible pendant</span>
        <select class="input" name="days"><option value="0">Sans limite</option><option value="7">7 jours</option><option value="30">30 jours</option></select></label>
      <button class="btn block" type="submit">Publier</button>
    </form>`;

  const draw = () => {
    if (dead) return;
    host.innerHTML = `<div class="stack">
      <p class="muted">Publie un message, un sondage ou une question pour améliorer l'appli. Les utilisateurs le voient à leur prochaine ouverture et répondent une seule fois.</p>
      ${formHTML()}
      <div class="row between"><h3>Annonces publiées</h3>${items.some((x) => x.res?.length) ? '<button type="button" class="btn ghost" id="annExpAll">⬇ Tout exporter (CSV)</button>' : ''}</div>
      ${items.length ? items.map(cardHTML).join('') : '<p class="muted">Aucune annonce pour l\'instant.</p>'}
    </div>`;
  };

  const keep = () => { const f = host.querySelector('#annForm'); if (!f) return; const fd = new FormData(f); form = { ...form, title: fd.get('title') || '', body: fd.get('body') || '', options: fd.get('options') ?? form.options, multi: fd.has('multi') || (form.type === 'poll' && form.multi && !f.querySelector('[name=multi]')), who: fd.get('who') ?? form.who, force: f.querySelector('[name=force]') ? fd.has('force') : form.force, lock: f.querySelector('[name=lock]') ? fd.has('lock') : form.lock, dismissible: f.querySelector('[name=dismissible]') ? fd.has('dismissible') : form.dismissible }; if (f.querySelector('[name=multi]')) form.multi = fd.has('multi'); };

  host.onclick = async (e) => {
    touch();
    const t = e.target.closest('[data-type]'); if (t) { keep(); form.type = t.dataset.type; draw(); return; }
    const sy = e.target.closest('[data-style]'); if (sy) { keep(); form.style = sy.dataset.style; draw(); return; }
    const md = e.target.closest('[data-mode]'); if (md) { keep(); form.mode = md.dataset.mode; draw(); return; }
    if (e.target.closest('[name=force]')) { setTimeout(() => { keep(); draw(); }, 0); return; }
    if (e.target.closest('#annExpAll')) { exportAll(); return; }
    const g = e.target.closest('[data-target]'); if (g) { keep(); form.target = g.dataset.target; draw(); return; }
    const b = e.target.closest('[data-a]'); if (!b) return;
    const id = b.closest('[data-id]')?.dataset.id, x = items.find((i) => i.id === id); if (!x) return;
    try {
      if (b.dataset.a === 'csv' || b.dataset.a === 'json') { exportOne(x, b.dataset.a); return; }
      if (b.dataset.a === 'toggle') { await updateDoc(doc(db, 'announcements', id), { active: x.active === false }); x.active = x.active === false; toast(x.active ? 'Annonce rouverte' : 'Annonce fermée'); }
      else if (b.dataset.a === 'del') {
        if (!confirm('Supprimer cette annonce et toutes ses réponses ?')) return;
        for (const r of x.res) await deleteDoc(doc(db, 'announcements', id, 'responses', r.uid)).catch(() => {});
        await deleteDoc(doc(db, 'announcements', id)); items = items.filter((i) => i.id !== id); toast('Annonce supprimée');
      }
      vibrate(10); draw();
    } catch (err) { console.error(err); toast('Action refusée'); }
  };

  host.onsubmit = async (e) => {
    e.preventDefault(); touch();
    const fd = new FormData(e.target), type = form.type;
    const data = { type, title: String(fd.get('title') || '').trim().slice(0, 80), body: String(fd.get('body') || '').trim().slice(0, 1000), target: form.target, active: true, createdAt: Date.now(), createdBy: getUser().uid };
    if (!data.title) { toast('Ajoute un titre'); return; }
    if (type === 'poll') {
      data.options = String(fd.get('options') || '').split('\n').map((s) => s.trim().slice(0, 80)).filter(Boolean).slice(0, 8);
      if (data.options.length < 2) { toast('Un sondage demande au moins 2 options'); return; }
      data.multi = fd.has('multi');
    }
    if (form.target === 'user') {
      const u = users.find((x) => x.email.toLowerCase() === String(fd.get('who') || '').trim().toLowerCase());
      if (!u) { toast('Compte introuvable : choisis une adresse de la liste'); return; }
      data.targetUid = u.uid;
    }
    data.style = form.style in STYLES ? form.style : 'info';
    if (type === 'message' && form.mode === 'banner') { data.display = 'banner'; data.dismissible = fd.has('dismissible'); }
    else {
      data.display = 'sheet'; data.force = fd.has('force');
      if (data.force && type === 'message' && fd.has('lock')) data.lock = true;
    }
    const days = Number(fd.get('days')); if (days) data.expiresAt = Date.now() + days * 86400000;
    const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const ref = await addDoc(collection(db, 'announcements'), data);
      items.unshift({ id: ref.id, ...data, res: [] }); form = { type, target: 'all', style: 'info', mode: 'sheet' };
      toast('Annonce publiée'); vibrate(14); draw();
    } catch (err) { console.error(err); toast(`Publication refusée : ${err.code || 'erreur'}`); btn.disabled = false; }
  };

  host.innerHTML = '<p class="muted">Chargement…</p>';
  try { await load(); } catch (e) { console.error(e); host.innerHTML = `<div class="card"><b>Lecture impossible</b><p class="muted">${esc(e.code || '')} ${esc(e.message || '')}</p><p class="muted">As-tu publié les nouvelles règles Firestore (bloc 1 de FIREBASE-A-COLLER.txt) ?</p></div>`; return { unmount() {} }; }
  draw();
  return { unmount() { dead = true; host.onclick = host.onsubmit = null; } };
}
