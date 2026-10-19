// Profil › « Mes appareils » : l'utilisateur voit (et peut renommer / retirer) les appareils liés à son compte.
import { db } from './firebase-config.js';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getUser } from './auth.js';
import { deviceId, ago, toMs } from './track.js';
import { esc, toast } from './ui.js';

export async function mountDevices(host) {
  const uid = getUser().uid, me = deviceId();
  async function draw() {
    const snap = await getDocs(collection(db, 'users', uid, 'devices'));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => toMs(b.lastSeenAt) - toMs(a.lastSeenAt));
    host.innerHTML = `
      <div class="card stack">
        <h3>Mes appareils</h3>
        <p class="muted">Navigateurs où ton compte a été ouvert. L'administrateur voit cette liste et ta dernière activité (jamais le contenu de tes séances).</p>
        ${list.length ? list.map((d) => `
          <div class="dev-row" data-id="${esc(d.id)}">
            <div class="dev-ico" aria-hidden="true">${d.mobile ? '📱' : '💻'}</div>
            <div class="dev-txt">
              <b>${esc(d.label || d.name)}${d.id === me ? ' <em class="dev-me">cet appareil</em>' : ''}</b>
              <small>${esc(d.name)} · ${esc(ago(toMs(d.lastSeenAt)))} · ${d.openCount || 0} ouverture${(d.openCount || 0) > 1 ? 's' : ''}</small>
            </div>
            <div class="dev-act">
              <button class="btn ghost sm" data-ren>Renommer</button>
              ${d.id === me ? '' : '<button class="btn ghost sm danger-t" data-del aria-label="Retirer cet appareil">✕</button>'}
            </div>
          </div>`).join('') : '<p class="muted">Aucun appareil enregistré pour le moment.</p>'}
      </div>`;
  }
  host.addEventListener('click', async (e) => {
    const row = e.target.closest('.dev-row'); if (!row) return;
    const id = row.dataset.id, ref = doc(db, 'users', uid, 'devices', id);
    if (e.target.closest('[data-ren]')) {
      const name = prompt('Nom de cet appareil (ex. « Mon iPhone »)', row.querySelector('b').firstChild.textContent.trim());
      if (name === null) return;
      await setDoc(ref, { label: name.trim().slice(0, 40) }, { merge: true }); toast('Appareil renommé'); draw();
    } else if (e.target.closest('[data-del]')) {
      await deleteDoc(ref); toast('Appareil retiré'); draw();
    }
  });
  await draw();
}
