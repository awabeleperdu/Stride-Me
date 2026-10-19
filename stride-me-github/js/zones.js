/* ---------------------------------------------------------
   Zones musculaires : haut du corps / bas du corps / sangle abdominale.
   Sert à filtrer le catalogue, étiqueter les séances et composer une séance en choisissant 1 à 3 zones.
   Les clés `keys` sont les muscles principaux du catalogue (free-exercise-db).
   --------------------------------------------------------- */
import { ALIASES, matchByName } from './catalog.js';
import { esc } from './ui.js';
import { sheet } from './sharecode.js';

export const ZONES = [
  { id: 'bras', label: 'Bras', group: 'Haut du corps', muscles: ['Biceps', 'Triceps'], keys: ['biceps', 'triceps', 'forearms'] },
  { id: 'epaules', label: 'Épaules & cou', group: 'Haut du corps', muscles: ['Deltoïdes', 'Trapèzes'], keys: ['shoulders', 'traps', 'neck'] },
  { id: 'buste', label: 'Buste & dos', group: 'Haut du corps', muscles: ['Pectoraux', 'Grand dorsal'], keys: ['chest', 'lats', 'middle back'] },
  { id: 'cuisses', label: 'Cuisses', group: 'Bas du corps', muscles: ['Quadriceps', 'Ischio-jambiers'], keys: ['quadriceps', 'hamstrings'] },
  { id: 'hanches', label: 'Hanches & fessiers', group: 'Bas du corps', muscles: ['Grand fessier', 'Moyen / petit fessier'], keys: ['glutes', 'abductors'] },
  { id: 'jambe', label: 'Bas de jambe', group: 'Bas du corps', muscles: ['Mollets', 'Adducteurs'], keys: ['calves', 'adductors'] },
  { id: 'core', label: 'Abdos & lombaires', group: 'Sangle abdominale', muscles: ['Grand droit', 'Lombaires'], keys: ['abdominals', 'lower back'] }
];
export const GROUPS = ['Haut du corps', 'Bas du corps', 'Sangle abdominale'];
const ZONE_OF_KEY = Object.fromEntries(ZONES.flatMap((z) => z.keys.map((k) => [k, z.id])));
const ZONE_OF_FR = { Pectoraux: 'buste', Dos: 'buste', 'Épaules': 'epaules', Biceps: 'bras', Triceps: 'bras', 'Avant-bras': 'bras', Abdos: 'core', Lombaires: 'core', Jambes: 'cuisses', Fessiers: 'hanches', Mollets: 'jambe' };
export const zoneLabel = (id) => ZONES.find((z) => z.id === id)?.label || id;

/** Zone principale d'une entrée du catalogue. */
export function zoneOfEntry(e) {
  const k = (e.p || [])[0];
  return (k && ZONE_OF_KEY[k]) || ZONE_OF_FR[e.m] || null;
}

/** Zones travaillées par une liste de noms d'exercices : [[zoneId, nombre], …] du plus au moins sollicité. */
export function zonesOfNames(names, cat) {
  const cnt = new Map();
  for (const n of names) {
    const en = ALIASES[String(n).trim().toLowerCase()];
    const e = matchByName(cat, n) || (en && cat.find((x) => x.en === en));
    const z = e && zoneOfEntry(e);
    if (z) cnt.set(z, (cnt.get(z) || 0) + 1);
  }
  return [...cnt.entries()].sort((a, b) => b[1] - a[1]);
}

// Nombre d'exercices choisis par muscle (0 = ignoré sauf s'il n'y a rien d'autre)
const PICKS = { biceps: 2, triceps: 2, shoulders: 3, traps: 1, chest: 2, lats: 2, 'middle back': 1, quadriceps: 2, hamstrings: 2, glutes: 2, calves: 1, abdominals: 2, 'lower back': 1, forearms: 0, neck: 0, abductors: 0, adductors: 0 };
const EQ_RANK = { Barre: 0, Machine: 1, Haltères: 1, Poulie: 2, 'Barre EZ': 2, 'Poids du corps': 3 };

/** Compose une séance à partir de zones : exercices courants d'abord (alias), puis barre / machine / haltères / poulie. */
export function buildByZones(zoneIds, cat) {
  const common = new Set(Object.values(ALIASES));
  const out = [];
  for (const id of zoneIds) {
    const z = ZONES.find((x) => x.id === id);
    for (const key of z.keys) {
      const want = PICKS[key] ?? 1;
      if (!want) continue;
      const c = cat.filter((e) => !String(e.id).startsWith('shared-') && (e.p || [])[0] === key && e.eq in EQ_RANK && e.lv !== 'e')
        .sort((a, b) => (common.has(b.en) - common.has(a.en)) || (EQ_RANK[a.eq] - EQ_RANK[b.eq]) || a.n.localeCompare(b.n));
      for (const e of c.slice(0, want)) if (!out.includes(e.n)) out.push(e.n);
    }
  }
  return out.slice(0, 10);
}

/** Fenêtre « Créer par zones » : onBuild({ name, exercises }) */
export function openZoneBuilder({ cat, onBuild }) {
  const picked = [];
  const s = sheet('Créer une séance par zones', `
    <p class="muted">Choisis 1 à 3 zones : l'app propose des exercices que tu pourras modifier ensuite.</p>
    ${GROUPS.map((g) => `<div class="zb-group"><h4>${esc(g)}</h4><div class="zb-row">${ZONES.filter((z) => z.group === g).map((z) => `
      <button type="button" class="zb-chip" data-z="${z.id}" aria-pressed="false"><b>${esc(z.label)}</b><small>${z.muscles.map(esc).join(' · ')}</small></button>`).join('')}</div></div>`).join('')}
    <button class="btn block" data-zb="go" disabled>Choisis une zone</button>`);
  const go = s.el.querySelector('[data-zb=go]');
  s.el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-z]');
    if (c) {
      const id = c.dataset.z, i = picked.indexOf(id);
      if (i >= 0) picked.splice(i, 1); else if (picked.length < 3) picked.push(id);
      s.el.querySelectorAll('[data-z]').forEach((b) => b.setAttribute('aria-pressed', String(picked.includes(b.dataset.z))));
      go.disabled = !picked.length;
      go.textContent = picked.length ? `Composer : ${picked.map(zoneLabel).join(' + ')}` : 'Choisis une zone';
    } else if (e.target.closest('[data-zb=go]') && picked.length) {
      s.close();
      onBuild({ name: picked.map(zoneLabel).join(' / '), exercises: buildByZones(picked, cat) });
    }
  });
}
