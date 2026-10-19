// Admin : exercices et machines partagés (collection `shared_exercises`) visibles par tous les comptes.
import { db, storage } from './firebase-config.js';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { getUser } from './auth.js';
import { compressImage } from './exercises.js';
import { MUSCLES, EQUIPMENT, resetCatalog } from './catalog.js';
import { esc, toast, vibrate, icon } from './ui.js';

const EQ = ['Machine', ...EQUIPMENT.filter((e) => e !== 'Machine'), 'Autre'];

export async function mountShared(host, { touch = () => {} } = {}) {
  let items = [], form = null;     // form : null | { id|null, ...champs }

  const load = async () => {
    const snap = await getDocs(collection(db, 'shared_exercises'));
    items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  };

  const listHTML = () => items.length ? items.map((x) => `
    <div class="card row sh-row" data-id="${esc(x.id)}">
      ${x.imageUrl ? `<img class="ex-thumb" src="${esc(x.imageUrl)}" alt="" loading="lazy">` : `<div class="ex-thumb sh-ph">${icon('dumbbell')}</div>`}
      <div class="sh-main"><b>${esc(x.name)}</b><small class="muted">${esc(x.muscleGroup || '')} · ${esc(x.equipment || '')}</small></div>
      <button class="btn ghost sm" data-a="edit">Modifier</button>
      <button class="btn ghost sm danger-t" data-a="del" aria-label="Supprimer ${esc(x.name)}">✕</button>
    </div>`).join('') : '<p class="muted">Aucun exercice partagé pour l\'instant.</p>';

  const formHTML = () => `
    <form class="card stack" id="shForm">
      <h3>${form.id ? 'Modifier' : 'Nouvel exercice ou machine'}</h3>
      <input class="input" name="name" placeholder="Nom (ex. Presse à cuisses inclinée)" required maxlength="80" value="${esc(form.name || '')}">
      <div class="grid-2">
        <select class="input" name="group" aria-label="Muscle">${[...MUSCLES, 'Autre'].map((g) => `<option ${g === (form.muscleGroup || 'Pectoraux') ? 'selected' : ''}>${g}</option>`).join('')}</select>
        <select class="input" name="equipment" aria-label="Matériel">${EQ.map((g) => `<option ${g === (form.equipment || 'Machine') ? 'selected' : ''}>${g}</option>`).join('')}</select>
      </div>
      <textarea class="input" name="steps" rows="5" placeholder="Consignes, une étape par ligne" maxlength="2000">${esc((form.steps || []).join('\n'))}</textarea>
      <label class="btn ghost block">${icon('camera')} ${form.imageUrl ? 'Changer la photo' : 'Photo'}<input type="file" name="photo" accept="image/*" hidden></label>
      <div class="grid-2"><button type="button" class="btn ghost block" data-a="cancel">Annuler</button><button class="btn block" type="submit">Enregistrer</button></div>
    </form>`;

  const draw = () => {
    host.innerHTML = `
      <div class="stack">
        <p class="muted">Ces exercices et machines apparaissent dans le catalogue de <b>tous</b> les comptes.</p>
        ${form ? formHTML() : `<button class="btn block" data-a="new">${icon('plus')} Ajouter un exercice / une machine</button>`}
        <div class="stack" id="shList">${listHTML()}</div>
      </div>`;
  };

  host.onclick = async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    touch();
    const a = b.dataset.a, id = b.closest('[data-id]')?.dataset.id;
    if (a === 'new') { form = { id: null }; draw(); }
    else if (a === 'cancel') { form = null; draw(); }
    else if (a === 'edit') { form = { ...items.find((x) => x.id === id) }; draw(); host.querySelector('[name=name]')?.focus(); }
    else if (a === 'del') {
      const x = items.find((i) => i.id === id);
      try { await deleteDoc(doc(db, 'shared_exercises', id)); resetCatalog(); toast(`« ${x.name} » supprimé`); vibrate(12); await load(); draw(); }
      catch (err) { console.error(err); toast('Suppression refusée'); }
    }
  };
  host.onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, fd = new FormData(f), btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    const data = {
      name: fd.get('name').trim(), muscleGroup: fd.get('group'), equipment: fd.get('equipment'),
      steps: fd.get('steps').split('\n').map((s) => s.trim()).filter(Boolean)
    };
    try {
      let id = form.id;
      if (id) await updateDoc(doc(db, 'shared_exercises', id), data);
      else id = (await addDoc(collection(db, 'shared_exercises'), { ...data, imageUrl: null, createdBy: getUser().uid, createdAt: serverTimestamp() })).id;
      const file = fd.get('photo');
      if (file && file.size) {
        const r = ref(storage, `shared/${id}.jpg`);
        await uploadBytes(r, await compressImage(file), { contentType: 'image/jpeg' });
        await updateDoc(doc(db, 'shared_exercises', id), { imageUrl: await getDownloadURL(r) });
      }
      resetCatalog(); toast('Ajouté au catalogue de tous'); vibrate(12);
      form = null; await load(); draw();
    } catch (err) { console.error(err); toast('Enregistrement refusé (droits admin ?)'); btn.disabled = false; }
  };

  await load(); draw();
  return { unmount() { host.onclick = host.onsubmit = null; } };
}
