import { db, storage } from './firebase-config.js';
import {
  collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { getUser } from './auth.js';
import { esc, toast, icon, emptyState } from './ui.js';
import { openCatalogPicker, toExerciseDoc, loadCatalog, toLibEntry } from './catalog.js';
import { openExerciseDetail } from './detail.js';
import { startRest, stopRest, restState } from './timer.js';

const GROUPS = ['Pectoraux', 'Dos', 'Épaules', 'Biceps', 'Triceps', 'Jambes', 'Abdos', 'Autre'];

/** Compression côté client : redimensionne (max 1280px) puis JPEG ~80 %. */
export async function compressImage(file, maxSize = 1280, quality = 0.8) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('compression'))), 'image/jpeg', quality));
}

async function loadExercises() {
  const q = query(collection(db, 'exercises'), where('ownerId', '==', getUser().uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function exercisesView(root) {
  const list = await loadExercises();

  root.innerHTML = `
    <div class="stack">
      <h2>Exercices</h2>
      <p class="muted">Ta bibliothèque (avec photos). Pour composer tes séances, va dans l'onglet <a href="#/planning">Planning</a>.</p>
      <div class="card stack" id="exTimer">
        <div class="row between"><h3>Minuteur de repos</h3><span class="muted" id="exTimerState"></span></div>
        <div class="seg seg4" role="group" aria-label="Lancer un minuteur">${[60, 90, 120, 180].map((r) => `<button type="button" data-rt="${r}">${r >= 120 ? `${r / 60} min` : `${r} s`}</button>`).join('')}</div>
        <p class="muted">Il reste affiché sur toutes les pages (touche-le pour l'agrandir) et sonne à la fin.</p>
      </div>
      <button class="btn block" id="openCat">${icon('dumbbell')} Parcourir le catalogue (620 exercices avec images)</button>
      <form class="card stack" id="exForm">
        <h3>Nouvel exercice</h3>
        <input class="input" name="name" placeholder="Nom (ex. Presse inclinée)" required maxlength="80">
        <select class="input" name="group">${GROUPS.map((g) => `<option>${g}</option>`).join('')}</select>
        <textarea class="input" name="instructions" placeholder="Consignes / réglages" maxlength="1000"></textarea>
        <label class="btn ghost block">${icon('camera')} Photo de l'exercice
          <input type="file" name="photo" accept="image/*" hidden>
        </label>
        <button class="btn block" type="submit">${icon('plus')} Ajouter</button>
      </form>
      ${list.map((ex) => `
        <div class="card row ex-card" data-ex="${esc(ex.id)}" tabindex="0" role="button" aria-label="Détail de ${esc(ex.name)}">
          ${ex.imageUrl ? `<img class="ex-thumb" src="${esc(ex.imageUrl)}" alt="" loading="lazy">` : '<div class="ex-thumb"></div>'}
          <div><h3>${esc(ex.name)}</h3><span class="badge">${esc(ex.muscleGroup)}</span>
          ${ex.instructions ? `<p class="muted">${esc(ex.instructions)}</p>` : ''}</div>
        </div>`).join('') || emptyState('Ta bibliothèque est vide', 'Ajoute ton premier exercice avec une photo : elle apparaîtra dans tes séances.')}
    </div>`;

  const tState = () => { const s = restState(), el = root.querySelector('#exTimerState'); if (el) el.textContent = s ? (s.phase === 'done' ? 'Terminé' : 'En cours…') : ''; };
  tState();
  root.querySelector('#exTimer')?.addEventListener('click', (e) => { const b = e.target.closest('[data-rt]'); if (b) { startRest(Number(b.dataset.rt), 'Repos'); tState(); } });
  const catP = loadCatalog().catch(() => []);
  root.addEventListener('click', async (ev) => {
    const card = ev.target.closest('.ex-card'); if (!card) return;
    const ex = list.find((x) => x.id === card.dataset.ex); if (!ex) return;
    const ce = ex.catalogId ? (await catP).find((c) => c.id === ex.catalogId) : null;
    openExerciseDetail(ce ? { ...toLibEntry(ce), ...(ex.imageUrl && ex.imageUrl !== ce.img ? { images: [ex.imageUrl, ...toLibEntry(ce).images] } : {}) } : { ...ex, images: ex.imageUrl ? [ex.imageUrl] : [] });
  });
  root.querySelector('#openCat').addEventListener('click', () => openCatalogPicker({
    onPick: async (e) => {
      if (list.some((x) => x.name.toLowerCase() === e.n.toLowerCase())) { toast('Déjà dans ta bibliothèque'); return; }
      try { await addDoc(collection(db, 'exercises'), { ownerId: getUser().uid, ...toExerciseDoc(e), createdAt: serverTimestamp() }); toast('Ajouté à ta bibliothèque'); exercisesView(root); }
      catch (err) { console.error(err); toast('Erreur lors de l\'ajout'); }
    }
  }));
  root.querySelector('#exForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const docRef = await addDoc(collection(db, 'exercises'), {
        ownerId: getUser().uid,
        name: fd.get('name').trim(),
        muscleGroup: fd.get('group'),
        instructions: fd.get('instructions').trim(),
        imageUrl: null,
        createdAt: serverTimestamp()
      });
      const file = fd.get('photo');
      if (file && file.size) {
        const blob = await compressImage(file);
        const r = ref(storage, `exercises/${getUser().uid}/${docRef.id}.jpg`);
        await uploadBytes(r, blob, { contentType: 'image/jpeg' });
        await updateDoc(doc(db, 'exercises', docRef.id), { imageUrl: await getDownloadURL(r) });
      }
      toast('Exercice ajouté');
      exercisesView(root);
    } catch (err) {
      console.error(err);
      toast('Erreur lors de l\'ajout');
      btn.disabled = false;
    }
  });
}
