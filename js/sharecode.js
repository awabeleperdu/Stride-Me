/* ---------------------------------------------------------
   Codes de séance : partager une séance (code à 6 caractères) ou importer celle d'un autre.
   - Les codes des utilisateurs sont stockés dans Firestore `shared_sessions/{CODE}` (quelques centaines d'octets chacun).
   - Les programmes intégrés (ex. « 2008 ») sont dans l'appli : ils marchent sans réseau, même en démo.
   Une séance = { name, exercises:[nom,…], plan:{ nom:{ s:séries, r:reps, t:note, alt:alternative, m:matériel } } }
   --------------------------------------------------------- */
import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getUser } from './auth.js';
import { esc, toast } from './ui.js';

const X = (s, r, t, alt, m) => ({ s, r, ...(t ? { t } : {}), ...(alt ? { alt } : {}), ...(m ? { m } : {}) });

/** Programmes intégrés : code → { title, sessions } */
export const PROGRAMS = {
  2008: {
    title: 'Programme complet : Pull / Push / Legs / Épaules / Cardio',
    note: 'Échauffement conseillé avant chaque séance : 3 cycles de 5 tractions, 10 pompes et 10 dips.',
    sessions: [
      {
        name: 'Jour 1 · Pull : Dos / Biceps / Avant-bras',
        exercises: ['Tirage vertical', 'Rowing assis', 'Curl marteau', 'Curl incliné', 'Flexions des poignets'],
        plan: {
          'Tirage vertical': X(3, '6–8', 'Lourd · grand dorsal (largeur du dos)', 'Tractions à la barre fixe (avec ou sans élastique)', 'Machine de tirage vertical (lat pulldown)'),
          'Rowing assis': X(3, '6–8', 'Lourd · épaisseur du dos et trapèzes moyens/inférieurs', 'Rowing buste penché à la barre libre ou avec deux haltères', 'Rowing assis avec appui sternal (chest-supported row)'),
          'Curl marteau': X(3, '10–12', 'Isolation · brachial (comble le biceps court)', 'Curl marteau à la poulie basse avec corde', 'Haltères en prise neutre (paumes face à face)'),
          'Curl incliné': X(3, '10–12', 'Isolation · étirement et pic du biceps', 'Curl au pupitre (preacher curl) ou machine à biceps assise', 'Banc réglé à 45° avec haltères'),
          'Flexions des poignets': X(3, '12–15', 'Isolation · avant-bras et force de poigne', 'Flexions à la poulie basse', 'Barre droite légère ou haltères')
        }
      },
      {
        name: 'Jour 2 · Push : Pectoraux / Triceps',
        exercises: ['Développé incliné', 'Développé couché', 'Pec deck', 'Extension triceps corde', 'Extension triceps au-dessus de la tête'],
        plan: {
          'Développé incliné': X(3, '6–8', 'Lourd · haut des pectoraux', 'Machine convergente pectoraux inclinée (incline chest press)', 'Banc réglable à 30–45° avec haltères ou barre'),
          'Développé couché': X(3, '6–8', 'Lourd · masse globale des pectoraux', 'Machine à développé couché assis (chest press)', 'Banc plat avec barre ou haltères'),
          'Pec deck': X(3, '12–15', 'Isolation · pectoraux (étirement)', 'Écartés aux poulies vis-à-vis (position moyenne)', 'Machine pec deck (papillon)'),
          'Extension triceps corde': X(3, '10–12', 'Isolation · chef latéral et médial', 'Extension triceps à la machine assise ou aux haltères', 'Poulie haute avec corde'),
          'Extension triceps au-dessus de la tête': X(3, '10–12', 'Isolation · longue portion (volume du bras)', 'Extension avec un haltère tenu à deux mains derrière la tête', 'Poulie basse avec corde')
        }
      },
      {
        name: 'Jour 3 · Legs : Jambes',
        exercises: ['Presse à cuisses', 'Leg curl', 'Leg extension', 'Mollets debout'],
        plan: {
          'Presse à cuisses': X(4, '6–8', 'Lourd · quadriceps et fessiers', 'Squat au rack ou hack squat', 'Presse à cuisses à 45°'),
          'Leg curl': X(3, '10–12', 'Isolation · ischio-jambiers', 'Soulevé de terre roumain avec haltères ou barre', 'Leg curl assis ou allongé'),
          'Leg extension': X(3, '12–15', 'Isolation · quadriceps', 'Fentes marchées avec haltères', 'Machine à leg extension'),
          'Mollets debout': X(4, '15', 'Isolation · mollets', 'Élévations de mollets un pied après l\'autre sur une marche, avec un haltère', 'Machine à mollets (calf raise) ou directement sur la presse')
        }
      },
      {
        name: 'Jour 4 · Épaules / Trapèzes / Abdos',
        exercises: ['Élévations latérales', 'Face pull', 'Shrugs', 'Gainage', 'Crunch poulie'],
        plan: {
          'Élévations latérales': X(4, '12–15', 'Priorité absolue · faisceau latéral (carrure)', 'Machine à élévations latérales ou poulie basse', 'Paire d\'haltères'),
          'Face pull': X(4, '15', 'Posture · arrière d\'épaule, fixateurs d\'omoplate', 'Élévations latérales buste penché (oiseau) aux haltères', 'Poulie haute avec corde'),
          'Shrugs': X(3, '10–12', 'Trapèzes supérieurs', 'Shrugs à la poulie basse', 'Haltères lourds le long du corps ou barre guidée (Smith)'),
          'Gainage': X(3, '45 s', 'Planche + vacuum · transverse, soutien lombaire', '', 'Tapis de sol'),
          'Crunch poulie': X(3, '12–15', 'Grand droit des abdominaux', 'Relevé de genoux ou de jambes suspendu (chaise romaine ou barre fixe)', 'Poulie haute avec corde, à genoux')
        }
      },
      {
        name: 'Jour 5 · Cardio',
        exercises: ['Cardio'],
        plan: { Cardio: X(1, '30–45 min', 'Allure modérée', '', 'Tapis de course, vélo elliptique ou rameur') }
      }
    ]
  },
  2000: {
    title: 'Programme sur mesure : Push / Pull / Épaules-Abdos / Legs / Cardio',
    note: 'Rotation de 5 séances : machines Hammer Strength et Gym80, séance d\'épaules pensée pour la posture, module abdos express (10-12 min).',
    sessions: [
      {
        name: 'Séance 1 · Push : Pectoraux / Triceps',
        exercises: ['Développé couché', 'Iso-lateral incline press', 'Chest press', 'Pec fly', 'Barre au front', 'Extension poulie au-dessus de la tête', 'Extension triceps corde'],
        plan: {
          'Développé couché': X(3, '6–8', 'Lourd · force et masse globale', 'Haltères sur banc plat', 'Barre ou haltères'),
          'Iso-lateral incline press': X(3, '8–10', 'Haut des pectoraux (remplissage sous les clavicules)', 'Développé incliné aux haltères', 'Machine Hammer Strength'),
          'Chest press': X(3, '8–10', 'Épaisseur globale · milieu et bas des pectoraux', 'Développé couché guidé', 'Machine Gym80'),
          'Pec fly': X(3, '10–12', 'Isolation · étirement et finition', 'Écartés aux poulies vis-à-vis', 'Pec deck ou poulies'),
          'Barre au front': X(3, '6–8', 'Tension mécanique lourde · masse globale des triceps', 'Extension couchée aux haltères', 'Barre EZ sur banc (skull crusher)'),
          'Extension poulie au-dessus de la tête': X(3, '10–12', 'Étirement · longue portion du triceps', '', 'Poulie haute de dos avec corde'),
          'Extension triceps corde': X(3, '10–12', 'Isolation et finition · chefs latéral et médial', '', 'Poulie haute avec corde, ouverture des poignets en bas')
        }
      },
      {
        name: 'Séance 2 · Pull : Dos / Biceps / Avant-bras',
        exercises: ['Tirage vertical', 'Rowing assis', 'Curl marteau', 'Curl au pupitre', 'Curl à la barre', 'Flexions des poignets'],
        plan: {
          'Tirage vertical': X(3, '6–8', 'Largeur du dos', 'Tractions', 'Lat pulldown'),
          'Rowing assis': X(3, '6–8', 'Épaisseur du dos', 'Rowing buste penché', 'Machine ou poulie basse'),
          'Curl marteau': X(3, '6–8', 'Lourd · brachial antérieur (épaisseur du bras)', '', 'Haltères'),
          'Curl au pupitre': X(3, '8–10', 'Isolation et masse globale du biceps', '', 'Barre EZ'),
          'Curl à la barre': X(3, '8–10', 'Force globale du biceps', '', 'Barre droite ou EZ'),
          'Flexions des poignets': X(3, '12–15', 'Renforcement des avant-bras', '', 'Barre EZ, prise en pronation')
        }
      },
      {
        name: 'Séance 3 · Épaules / Trapèzes / Abdos',
        exercises: ['Développé assis', 'Élévations latérales', 'Face pull', 'Shrugs', 'Relevé de jambes suspendu', 'Crunch banc décliné', 'Gainage'],
        plan: {
          'Développé assis': X(3, '6–8', 'Masse globale des deltoïdes (faisceau antérieur)', 'Machine à développé épaules', 'Haltères, dossier à 75–80°'),
          'Élévations latérales': X(4, '10–15', 'Deltoïde latéral · largeur de la carrure', 'Poulie basse', 'Haltères'),
          'Face pull': X(4, '12–15', 'Deltoïde postérieur et posture · fixateurs de l\'omoplate', '', 'Poulie haute, tirage vers le visage / le front'),
          'Shrugs': X(3, '10–12', 'Trapèzes supérieurs', '', 'Haltères'),
          'Relevé de jambes suspendu': X(3, '10–12', 'Abdos · enrouler le bassin (pubis vers nombril) · repos 45–60 s', 'Relevé de genoux suspendu', 'Barre fixe'),
          'Crunch banc décliné': X(3, '10–12', 'Abdos · enroulement strict de la colonne · repos 45–60 s', '', 'Banc décliné, disque de 5 à 10 kg contre la poitrine'),
          'Gainage': X(2, '30–45 s', 'Superset : gainage latéral droit, latéral gauche, puis ventral, sans pause entre les positions · 1 min de repos entre les tours', '', 'Tapis de sol')
        }
      },
      {
        name: 'Séance 4 · Jambes',
        exercises: ['Presse à cuisses', 'Leg curl', 'Leg extension', 'Mollets debout'],
        plan: {
          'Presse à cuisses': X(4, '6–8', 'Quadriceps et fessiers · mouvement de force', 'Squat', 'Presse inclinée'),
          'Leg curl': X(3, '10–12', 'Ischio-jambiers', '', 'Machine'),
          'Leg extension': X(3, '12–15', 'Isolation des quadriceps', '', 'Machine'),
          'Mollets debout': X(4, '15', 'Triceps sural (mollets)', 'Mollets à la presse', 'Machine debout')
        }
      },
      {
        name: 'Séance 5 · Cardio',
        exercises: ['Cardio'],
        plan: { Cardio: X(1, '30–45 min', 'Intensité modérée · récupération active et santé cardiovasculaire', '', 'Tapis incliné, vélo elliptique ou rameur') }
      }
    ]
  }
};

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sans 0/O/1/I
const norm = (c) => String(c || '').trim().toUpperCase().replace(/\s+/g, '');
const randCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHA[b % ALPHA.length]).join('');
const clean = (s) => ({ name: String(s.name || 'Séance').slice(0, 60), exercises: (s.exercises || []).map(String).slice(0, 30), plan: s.plan || {} });

/** Cherche un code : programme intégré ou séance partagée. Renvoie { title, sessions, note? } ou null. */
export async function resolveCode(raw) {
  const code = norm(raw);
  if (!code) return null;
  if (PROGRAMS[code]) { const p = PROGRAMS[code]; return { code, title: p.title, note: p.note, sessions: p.sessions.map(clean) }; }
  const snap = await getDoc(doc(db, 'shared_sessions', code));
  if (!snap.exists()) return null;
  const d = snap.data();
  return { code, title: d.name, sessions: [clean(d)], by: d.ownerName || '' };
}

/** Publie (ou met à jour) une séance et renvoie son code. */
export async function shareSession(session) {
  const u = getUser();
  let code = session.shareCode;
  if (!code) {
    for (let i = 0; i < 6; i++) {
      const c = randCode();
      if (!PROGRAMS[c] && !(await getDoc(doc(db, 'shared_sessions', c))).exists()) { code = c; break; }
    }
    if (!code) throw new Error('code');
  }
  await setDoc(doc(db, 'shared_sessions', code), {
    code, ownerId: u.uid, ownerName: (u.displayName || u.email || '').split('@')[0].slice(0, 30),
    name: session.name, exercises: session.exercises, plan: session.plan || {}, createdAt: serverTimestamp()
  });
  return code;
}

/** Copie d'une séance importée pour le roulement de l'utilisateur (nouvel identifiant, nom unique). */
export function toCycleSession(s, existing) {
  let name = s.name, k = 2;
  while (existing.some((c) => c.name === name)) name = `${s.name} (${k++})`;
  return { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, exercises: [...s.exercises], plan: s.plan };
}

/* ---------- Fenêtres ---------- */
export function sheet(title, html) {
  const el = document.createElement('div');
  el.className = 'sheet-root';
  el.innerHTML = `<div class="sheet-backdrop"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grab"></div>
      <div class="sheet-head"><h3>${esc(title)}</h3><button type="button" class="sheet-x" aria-label="Fermer">✕</button></div>
      <div class="stack sc-body">${html}</div>
    </section>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));
  const close = () => { el.classList.remove('open'); setTimeout(() => el.remove(), 250); };
  el.querySelector('.sheet-backdrop').onclick = close;
  el.querySelector('.sheet-x').onclick = close;
  return { el, close, body: el.querySelector('.sc-body') };
}

export function openShareSheet(code, name) {
  const s = sheet('Partager la séance', `
    <p class="muted">Envoie ce code. La personne le saisit dans <b>Planning → Séances → Code de séance</b> pour récupérer « ${esc(name)} ».</p>
    <div class="sc-code" aria-label="Code de séance">${esc(code)}</div>
    <div class="grid-2"><button class="btn" data-sc="copy">Copier le code</button>${navigator.share ? '<button class="btn ghost" data-sc="send">Envoyer…</button>' : '<button class="btn ghost" data-sc="close">Fermer</button>'}</div>`);
  s.el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-sc]')?.dataset.sc;
    if (a === 'copy') { try { await navigator.clipboard.writeText(code); toast('Code copié'); } catch { toast(`Code : ${code}`); } }
    else if (a === 'send') { try { await navigator.share({ text: `Ma séance « ${name} » sur Stride Me : code ${code}` }); } catch { /* annulé */ } }
    else if (a === 'close') s.close();
  });
}

export function openImportSheet({ onImport }) {
  const s = sheet('Code de séance', `
    <p class="muted">Saisis le code qu'on t'a donné pour ajouter la séance (ou le programme) à ton planning.</p>
    <input class="input sc-input" id="scIn" placeholder="Code" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text">
    <button class="btn block" data-sc="find">Chercher</button>
    <div id="scRes"></div>`);
  const $ = (q) => s.el.querySelector(q);
  let found = null;
  const find = async () => {
    const res = $('#scRes'); res.innerHTML = '<p class="muted">Recherche…</p>';
    try { found = await resolveCode($('#scIn').value); } catch (e) { console.error(e); found = null; res.innerHTML = '<p class="muted">Impossible de joindre la base pour l\'instant.</p>'; return; }
    if (!found) { res.innerHTML = '<p class="sc-err">Code introuvable. Vérifie les caractères.</p>'; return; }
    res.innerHTML = `
      <div class="card stack sc-found">
        <h3>${esc(found.title)}</h3>
        ${found.by ? `<small class="muted">Partagé par ${esc(found.by)}</small>` : ''}
        ${found.sessions.map((x) => `<div><b>${esc(x.name)}</b><p class="muted">${x.exercises.map(esc).join(' · ')}</p></div>`).join('')}
        ${found.note ? `<p class="muted">${esc(found.note)}</p>` : ''}
        <button class="btn block" data-sc="add">Ajouter ${found.sessions.length > 1 ? `les ${found.sessions.length} séances` : 'la séance'} à mon planning</button>
      </div>`;
  };
  s.el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-sc]')?.dataset.sc;
    if (a === 'find') find();
    else if (a === 'add' && found) { s.close(); await onImport(found); }
  });
  $('#scIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); find(); } });
  setTimeout(() => $('#scIn')?.focus(), 300);
}
