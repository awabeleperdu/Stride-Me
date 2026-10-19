// Onglet Planning : créer/éditer ses séances, ordonner le cycle, planifier les prochains jours.
import { db } from './firebase-config.js';
import {
  collection, query, where, getDocs, addDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getUser } from './auth.js';
import { getRotation, saveRotation, sessionForDate, placeSession, repeatNear, healFrom, adaptMessage, backToBack, backToBackPlace, askBackToBack } from './workout.js';
import { mountCalendar, sessionColor } from './calendar.js';
import { esc, toast, icon, dayKey } from './ui.js';
import { enableDnd } from './dnd.js';
import { enableSwipe } from './swipe.js';
import { zonesOfNames, zoneLabel, openZoneBuilder } from './zones.js';
import { shareSession, openShareSheet, openImportSheet, toCycleSession } from './sharecode.js';
import { loadCatalog, openCatalogPicker, matchByName, ALIASES } from './catalog.js';

const SUGGESTIONS = [
  'Développé couché', 'Développé incliné haltères', 'Développé militaire', 'Élévations latérales', 'Dips', 'Pompes',
  'Tractions', 'Rowing barre', 'Tirage horizontal', 'Tirage vertical', 'Curl biceps', 'Curl marteau',
  'Triceps poulie', 'Barre au front', 'Squat', 'Presse à cuisses', 'Fentes', 'Leg curl', 'Leg extension',
  'Soulevé de terre roumain', 'Mollets debout', 'Gainage', 'Crunch'
];

async function loadLibrary() {
  const q = query(collection(db, 'exercises'), where('ownerId', '==', getUser().uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data().name);
}

const move = (arr, i, d) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return true;
};
const GRIP = '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';

let planTab = 'cal';   // onglet affiché : calendrier ou séances (conservé pendant la visite)

export async function planningView(root) {
  let rot = await getRotation();
  rot.planned = rot.planned || {};
  const lib = await loadLibrary();
  const cat = await loadCatalog().catch(() => []);
  let editing = null; // { id|null, name, exercises:[] }
  let cal = null;

  const allNames = () => [...new Set([...lib, ...SUGGESTIONS, ...cat.map((e) => e.n)])].sort((a, b) => a.localeCompare(b));

  /* ---------- Vue principale : calendrier ou liste des séances ---------- */
  const sessionsHTML = () => `
    <div class="card stack">
      <div>
        <h3>Mes séances</h3>
        <p class="muted">L'ordre de cette liste est ton roulement : après la dernière, on reprend la première.</p>
      </div>
      <div class="sortlist" id="cycleList">
      ${rot.cycle.map((s, i) => `
        <div class="sw plan-item" data-i="${i}">
          <div class="sw-bg"><span class="sw-l">Archiver</span><span class="sw-r">Supprimer</span></div>
          <div class="sw-fg">
            <div class="row between">
              <h3 class="plan-name"><i class="dot-c" style="--c:${sessionColor(s.id)}"></i>${i + 1}. ${esc(s.name)}</h3>
              <div class="row" style="gap:6px">
                <button class="btn ghost sm" data-act="share" aria-label="Partager « ${esc(s.name)} »">Partager</button>
                <button class="btn ghost sm" data-act="edit">Modifier</button>
                <button class="grip" data-grip aria-label="Réordonner « ${esc(s.name)} » (maintiens et glisse, ou flèches haut/bas)">${GRIP}</button>
              </div>
            </div>
            <div class="z-tags">${zonesOfNames(s.exercises, cat).slice(0, 4).map(([z]) => `<span class="z-tag">${esc(zoneLabel(z))}</span>`).join('')}</div>
            <p class="muted">${s.exercises.length ? s.exercises.map(esc).join(' · ') : 'Aucun exercice'}</p>
          </div>
        </div>`).join('')}
      </div>
      <p class="muted hint-line">Maintiens une séance et glisse pour changer l'ordre · balaie ← pour supprimer, → pour archiver.</p>
      <button class="btn block" data-act="new">${icon('plus')} Nouvelle séance</button>
      ${rot.cycle.length ? '<button class="btn ghost block danger-t" data-act="delall">Tout supprimer</button>' : '<p class="muted">Aucune séance pour l\'instant. Crée-en une ou importe un code.</p>'}
      <button class="btn ghost block" data-act="zones">Créer par zones musculaires</button>
      <button class="btn ghost block" data-act="import">Code de séance · importer</button>
      ${(rot.archived || []).length ? `
        <details class="archived"><summary>Archivées (${rot.archived.length})</summary>
          ${rot.archived.map((s, i) => `<div class="row between arch-row" data-a="${i}"><span>${esc(s.name)}<small class="muted"> · ${s.exercises.length} exercices</small></span><button class="btn ghost sm" data-act="restore">Restaurer</button></div>`).join('')}
        </details>` : ''}
    </div>`;

  const mainHTML = () => `
    <div class="stack">
      <h2>Planning</h2>
      <div class="seg" role="group" aria-label="Section">
        <button type="button" data-tab="cal" aria-pressed="${planTab === 'cal'}">Calendrier</button>
        <button type="button" data-tab="sessions" aria-pressed="${planTab === 'sessions'}">Séances</button>
      </div>
      ${planTab === 'cal' ? '<div id="calHost"></div>' : sessionsHTML()}
    </div>`;

  /* ---------- Éditeur de séance ---------- */
  const editorHTML = () => `
    <div class="stack">
      <h2>${editing.id ? 'Modifier la séance' : 'Nouvelle séance'}</h2>
      <div class="card stack">
        <input class="input" id="sName" placeholder="Nom (ex. Haut du corps)" maxlength="40" value="${esc(editing.name)}">
        <h3>Exercices</h3>
        ${editing.exercises.length ? `<div class="sortlist" id="exList">${editing.exercises.map((ex, i) => `
          <div class="plan-item ex-item" data-ex="${i}">
            <div class="row between">
              <span>${i + 1}. ${esc(ex)}</span>
              <div class="row" style="gap:6px">
                <button class="btn ghost sm" data-act="exdel" aria-label="Retirer">✕</button>
                <button class="grip" data-grip aria-label="Réordonner « ${esc(ex)} » (glisse, ou flèches haut/bas)">${GRIP}</button>
              </div>
            </div>
          </div>`).join('')}</div>` : '<p class="muted">Ajoute ton premier exercice ci-dessous.</p>'}
        <div class="row">
          <input class="input" id="newEx" list="exlib" placeholder="Choisis ou écris un exercice" maxlength="60" autocomplete="off">
          <button class="btn" data-act="exadd">${icon('plus')}</button>
        </div>
        <button class="btn ghost block" data-act="catalog">${icon('dumbbell')} Parcourir le catalogue (${cat.length} exercices)</button>
        <datalist id="exlib">${allNames().map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        <p class="muted">Les nouveaux exercices sont ajoutés à ta bibliothèque (onglet Exercices).</p>
      </div>
      <button class="btn block" data-act="save">Enregistrer la séance</button>
      <button class="btn ghost block" data-act="cancel">Annuler</button>
      ${editing.id ? `<div class="grid-2"><button class="btn ghost block" data-act="archive">Archiver</button><button class="btn ghost block danger-t" data-act="del">Supprimer</button></div>` : ''}
    </div>`;

  const draw = () => {
    cal?.destroy(); cal = null;
    root.innerHTML = editing ? editorHTML() : mainHTML();
    if (!editing && planTab === 'cal') cal = mountCalendar(root.querySelector('#calHost'), { rot, onSetDay: setDay, onSwapDays: swapDays });
  };
  draw();

  // Changement depuis la fiche d'un jour du calendrier : 'auto' | 'rest' | id de séance
  async function setDay(key, v) {
    rot.anchors = rot.anchors || {};
    if (v === 'rest' || v === 'auto') {
      rot.restDates = rot.restDates.filter((d) => d !== key);
      delete rot.planned[key]; delete rot.anchors[key];
      if (v === 'rest') rot.restDates.push(key);
      healFrom(rot, key);
      await persist('Planning adapté');
    } else {
      if (backToBackPlace(rot, key, v) && !askBackToBack(rot.cycle.find((c) => c.id === v)?.name || 'Cette séance')) return false;
      const info = placeSession(rot, key, v);
      await persist(adaptMessage(rot, v, info));
    }
    return true;
  }

  const persist = async (msg) => {
    try { await saveRotation(rot); if (msg) toast(msg); }
    catch (e) { console.error(e); toast('Erreur d\'enregistrement'); }
  };

  const addExercise = () => {
    const input = root.querySelector('#newEx');
    const v = input.value.trim();
    if (!v) return;
    if (!editing.exercises.includes(v)) editing.exercises.push(v);
    draw();
    root.querySelector('#newEx')?.focus();
  };

  // Supprimer / archiver (balayage ou bouton) avec « Annuler » : zéro confirmation bloquante
  async function removeSession(i, kind) {
    const [gone] = rot.cycle.splice(i, 1);
    if (kind === 'archive') { rot.archived = rot.archived || []; rot.archived.push(gone); }
    await persist(); draw();
    toast(kind === 'archive' ? `« ${gone.name} » archivée` : `« ${gone.name} » supprimée`, {
      action: 'Annuler',
      onAction: async () => {
        if (kind === 'archive') rot.archived = rot.archived.filter((x) => x.id !== gone.id);
        rot.cycle.splice(Math.min(i, rot.cycle.length), 0, gone);
        await persist('Rétabli'); if (!editing) draw();
      }
    });
  }

  // Glisser-déposer : ordre des séances / des exercices
  const reorderBy = (arr, nodes, attr) => nodes.map((n) => arr[Number(n.dataset[attr])]);
  const dnd = enableDnd(root, {
    item: '.plan-item', handle: '[data-grip]',
    onSort: async (nodes) => {
      if (editing) { editing.exercises = reorderBy(editing.exercises, nodes, 'ex'); draw(); return; }
      rot.cycle = reorderBy(rot.cycle, nodes, 'i');
      await persist('Ordre enregistré'); draw();
    }
  });
  const swipe = enableSwipe(root, {
    row: '.sw',
    onLeft: (el) => removeSession(Number(el.dataset.i), 'delete'),
    onRight: (el) => removeSession(Number(el.dataset.i), 'archive')
  });

  const addDays1 = (k, n) => new Date(Date.UTC(...k.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x)))) + n * 86400000).toISOString().slice(0, 10);

  // Échange de deux jours (glisser une séance sur un autre jour du calendrier)
  async function swapDays(a, b) {
    const sa = sessionForDate(rot, a), sb = sessionForDate(rot, b);
    const test = { ...rot, planned: { ...rot.planned, [a]: sb ? sb.id : 'off', [b]: sa ? sa.id : 'off' } };
    const b2b = backToBack(test, [a, b]);
    if (b2b && !askBackToBack(b2b.name)) return false;
    rot.planned = test.planned;
    const before = rot.restDates.length;
    healFrom(rot, addDays1(a < b ? a : b, -1));
    const added = rot.restDates.length - before;
    const bad = repeatNear(rot, [a, b]);
    await persist((sb ? 'Séances échangées' : 'Séance déplacée') + (added ? ` · ${added} repos ajouté${added > 1 ? 's' : ''} pour la suite` : '') + (bad ? ' · attention : deux séances identiques rapprochées' : ''));
    return true;
  }

  root.onclick = async (e) => {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) { planTab = tabBtn.dataset.tab; draw(); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const i = Number(btn.closest('[data-i]')?.dataset.i);
    const x = Number(btn.closest('[data-ex]')?.dataset.ex);

    if (act === 'share') {
      const s = rot.cycle[i];
      try {
        const code = await shareSession(s);
        if (s.shareCode !== code) { s.shareCode = code; await persist(); }
        openShareSheet(code, s.name);
      } catch (err) { console.error(err); toast('Partage impossible pour l\'instant'); }
    } else if (act === 'delall') {
      if (!confirm(`Supprimer les ${rot.cycle.length} séances du menu ?`)) return;
      const backup = rot.cycle; rot.cycle = [];
      await persist(); draw();
      toast('Toutes les séances supprimées', { action: 'Annuler', onAction: async () => { rot.cycle = backup; await persist('Rétabli'); if (!editing) draw(); } });
    } else if (act === 'zones') {
      openZoneBuilder({ cat, onBuild: ({ name, exercises }) => { editing = { id: null, name, exercises }; draw(); } });
    } else if (act === 'import') {
      openImportSheet({
        onImport: async (found) => {
          found.sessions.forEach((x) => rot.cycle.push(toCycleSession(x, rot.cycle)));
          await persist(found.sessions.length > 1 ? `${found.sessions.length} séances ajoutées` : 'Séance ajoutée');
          planTab = 'sessions'; draw();
        }
      });
    } else if (act === 'edit') {
      const s = rot.cycle[i];
      editing = { id: s.id, name: s.name, exercises: [...s.exercises] };
      draw();
    } else if (act === 'new') {
      editing = { id: null, name: '', exercises: [] };
      draw();
    } else if (act === 'del') {
      const idx = editing ? rot.cycle.findIndex((c) => c.id === editing.id) : i;
      if (idx >= 0) { editing = null; await removeSession(idx, 'delete'); }
    } else if (act === 'archive') {
      const idx = rot.cycle.findIndex((c) => c.id === editing.id);
      if (idx >= 0) { editing = null; await removeSession(idx, 'archive'); }
    } else if (act === 'restore') {
      const k = Number(btn.closest('[data-a]').dataset.a);
      const [back] = rot.archived.splice(k, 1);
      rot.cycle.push(back);
      await persist(`« ${back.name} » restaurée`); draw();
    } else if (act === 'exdel') {
      editing.exercises.splice(x, 1); draw();
    } else if (act === 'exadd') {
      addExercise();
    } else if (act === 'catalog') {
      openCatalogPicker({ onPick: (e) => { if (!editing.exercises.includes(e.n)) editing.exercises.push(e.n); draw(); } });
    } else if (act === 'cancel') {
      editing = null; draw();
    } else if (act === 'save') {
      const name = editing.name.trim();
      if (!name) { toast('Donne un nom à la séance'); return; }
      if (!editing.exercises.length) { toast('Ajoute au moins un exercice'); return; }
      if (editing.id) {
        const s = rot.cycle.find((c) => c.id === editing.id);
        s.name = name; s.exercises = editing.exercises;
      } else {
        rot.cycle.push({ id: 's' + Date.now().toString(36), name, exercises: editing.exercises });
      }
      // Ajoute à la bibliothèque les exercices qui n'y sont pas encore
      for (const n of editing.exercises) {
        if (!lib.includes(n) && !matchByName(cat, n) && !ALIASES[n.trim().toLowerCase()]) {
          lib.push(n);
          addDoc(collection(db, 'exercises'), {
            ownerId: getUser().uid, name: n, muscleGroup: 'Autre', instructions: '', imageUrl: null, createdAt: serverTimestamp()
          }).catch(console.error);
        }
      }
      editing = null;
      await persist('Séance enregistrée'); draw();
    }
  };

  root.oninput = (e) => { if (e.target.id === 'sName' && editing) editing.name = e.target.value; };

  root.onkeydown = async (e) => {
    const grip = e.target.closest?.('[data-grip]');
    if (grip && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const it = grip.closest('.plan-item'), d = e.key === 'ArrowUp' ? -1 : 1;
      if (editing) { const x = Number(it.dataset.ex); if (move(editing.exercises, x, d)) { draw(); root.querySelectorAll('[data-grip]')[x + d]?.focus(); } }
      else { const i = Number(it.dataset.i); if (move(rot.cycle, i, d)) { await persist('Ordre enregistré'); draw(); root.querySelectorAll('[data-grip]')[i + d]?.focus(); } }
      return;
    }
    if (e.key === 'Enter' && e.target.id === 'newEx') { e.preventDefault(); addExercise(); }
  };

  return { unmount() { cal?.destroy(); dnd.destroy(); swipe.destroy(); root.onclick = root.oninput = root.onkeydown = null; } };
}
