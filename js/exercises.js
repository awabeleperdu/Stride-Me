import { db, storage } from './firebase-config.js';
import {
  collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { getUser } from './auth.js';
import { esc, toast, icon, emptyState } from './ui.js';
import { openCatalogPicker, toExerciseDoc, loadCatalog, toLibEntry, norm } from './catalog.js';
import { sheet } from './sharecode.js';
import { openExerciseDetail } from './detail.js';

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
  let q = '', grp = '';

  const cardsHtml = () => {
    const nq = norm(q);
    const rows = list.filter((ex) => (!grp || ex.muscleGroup === grp) && (!nq || norm(ex.name).includes(nq)));
    const n = rows.length;
    return `<p class="muted" id="exCount">${n} exercice${n > 1 ? 's' : ''}${grp || q ? ' trouvé' + (n > 1 ? 's' : '') : ''}</p>` + (rows.map((ex) => `
        <div class="card row ex-card" data-ex="${esc(ex.id)}" tabindex="0" role="button" aria-label="Détail de ${esc(ex.name)}">
          ${ex.imageUrl ? `<img class="ex-thumb" src="${esc(ex.imageUrl)}" alt="" loading="lazy">` : '<div class="ex-thumb"></div>'}
          <div><h3>${esc(ex.name)}</h3><span class="badge">${esc(ex.muscleGroup)}</span>
          ${ex.instructions ? `<p class="muted">${esc(ex.instructions)}</p>` : ''}</div>
        </div>`).join('') || (list.length ? '<p class="muted">Aucun exercice ne correspond. Essaie un autre mot ou un autre muscle.</p>' : emptyState('Ta bibliothèque est vide', 'Ajoute ton premier exercice avec « + Ajouter » : il apparaîtra dans tes séances.')));
  };
  const groups = [...new Set(list.map((x) => x.muscleGroup).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  root.innerHTML = `
    <div class="stack">
      <h2>Exercices</h2>
      <div class="ex-bar">
        <input class="input" type="search" id="exQ" placeholder="Rechercher dans ma bibliothèque" autocomplete="off" aria-label="Rechercher un exercice">
        <button class="btn" id="exAdd" type="button">${icon('plus')} Ajouter</button>
      </div>
      ${groups.length > 1 ? `<div><div class="ex-chips" id="exChips" role="group" aria-label="Muscle">${['', ...groups].map((g) => `<button type="button" class="chip${g === grp ? ' on' : ''}" data-g="${esc(g)}">${g ? esc(g) : 'Tous'}</button>`).join('')}</div></div>` : ''}
      <div class="stack" id="exList">${cardsHtml()}</div>
    </div>`;

  const paintList = () => { root.querySelector('#exList').innerHTML = cardsHtml(); };
  const catP = loadCatalog().catch(() => []);

  root.querySelector('#exQ').addEventListener('input', (e) => { q = e.target.value; paintList(); });
  root.querySelector('#exChips')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    grp = b.dataset.g;
    root.querySelectorAll('#exChips .chip').forEach((c) => c.classList.toggle('on', c === b));
    paintList();
  });
  root.addEventListener('click', async (ev) => {
    const card = ev.target.closest('.ex-card'); if (!card) return;
    const ex = list.find((x) => x.id === card.dataset.ex); if (!ex) return;
    const ce = ex.catalogId ? (await catP).find((c) => c.id === ex.catalogId) : null;
    openExerciseDetail(ce ? { ...toLibEntry(ce), ...(ex.imageUrl && ex.imageUrl !== ce.img ? { images: [ex.imageUrl, ...toLibEntry(ce).images] } : {}) } : { ...ex, images: ex.imageUrl ? [ex.imageUrl] : [] });
  });

  /* Un seul bouton « Ajouter » : catalogue ou exercice perso */
  const pickFromCatalog = () => openCatalogPicker({
    onPick: async (e) => {
      if (list.some((x) => x.name.toLowerCase() === e.n.toLowerCase())) { toast('Déjà dans ta bibliothèque'); return; }
      try { await addDoc(collection(db, 'exercises'), { ownerId: getUser().uid, ...toExerciseDoc(e), createdAt: serverTimestamp() }); toast('Ajouté à ta bibliothèque'); exercisesView(root); }
      catch (err) { console.error(err); toast('Erreur lors de l\'ajout'); }
    }
  });
  const customForm = () => {
    const sh = sheet('Mon exercice', `
      <form class="stack" id="exForm">
        <input class="input" name="name" placeholder="Nom (ex. Presse inclinée)" required maxlength="80">
        <select class="input" name="group">${GROUPS.map((g) => `<option>${g}</option>`).join('')}</select>
        <textarea class="input" name="instructions" placeholder="Consignes / réglages (facultatif)" maxlength="1000"></textarea>
        <label class="btn ghost block">${icon('camera')} Photo (facultatif)
          <input type="file" name="photo" accept="image/*" hidden>
        </label>
        <button class="btn block" type="submit">${icon('plus')} Ajouter</button>
      </form>`);
    sh.el.querySelector('#exForm').addEventListener('submit', async (e) => {
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
        sh.close();
        toast('Exercice ajouté');
        exercisesView(root);
      } catch (err) {
        console.error(err);
        toast('Erreur lors de l\'ajout : ' + (err && err.message ? err.message : 'inconnue'));
        btn.disabled = false;
      }
    });
  };
  root.querySelector('#exAdd').addEventListener('click', () => {
    const sh = sheet('Ajouter un exercice', `
      <button type="button" class="btn block" data-add="cat">${icon('dumbbell')} Parcourir le catalogue</button>
      <p class="muted" style="margin:-4px 2px 6px">Plus de 600 exercices avec photos et consignes.</p>
      <button type="button" class="btn ghost block" data-add="own">${icon('plus')} Créer mon propre exercice</button>`);
    sh.el.addEventListener('click', (e) => {
      const k = e.target.closest('[data-add]')?.dataset.add; if (!k) return;
      sh.close();
      k === 'cat' ? pickFromCatalog() : customForm();
    });
  });
}
