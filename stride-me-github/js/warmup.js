/* ---------------------------------------------------------
   Échauffement
   - « Chauffer le muscle » : montée en charge sur le 1er exercice (40 / 60 / 80 % de ta dernière charge)
   - « Mon échauffement » : bloc perso (par défaut tractions, pompes, dips × 3), entièrement réglable
   Réglages : settings.warm = { on, ramp, custom:[{n, s}] }
   --------------------------------------------------------- */

export const WARM_DEFAULT = {
  on: true,
  ramp: true,
  custom: [{ n: 'Tractions', s: 3 }, { n: 'Pompes', s: 3 }, { n: 'Dips', s: 3 }]
};

export function sanitizeWarm(o) {
  const w = { on: true, ramp: true, custom: WARM_DEFAULT.custom.map((x) => ({ ...x })) };
  if (!o || typeof o !== 'object') return w;
  w.on = o.on !== false;
  w.ramp = o.ramp !== false;
  if (Array.isArray(o.custom)) {
    w.custom = o.custom.slice(0, 8).map((x) => ({
      n: String(x?.n ?? '').slice(0, 40),
      s: Math.min(6, Math.max(1, Math.round(Number(x?.s)) || 3))
    }));
  }
  return w;
}

const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const nice = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
const escA = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const round25 = (x) => Math.round(x / 2.5) * 2.5;

/** Montée en charge à partir de la charge de travail (null si pas de charge connue). */
export function rampFor(top) {
  if (!(top >= 10)) return null;
  const out = [];
  [[0.4, 10], [0.6, 6], [0.8, 3]].forEach(([p, reps]) => {
    const weight = Math.max(2.5, round25(top * p));
    if (!out.some((r) => r.weight === weight) && weight < top) out.push({ weight: String(weight), reps: String(reps), done: false });
  });
  return out.length ? out : null;
}

/** Bloc d'échauffement d'une séance (null si désactivé). `top` = charge max de la dernière séance du 1er exercice. */
export function buildWarm(cfg, top) {
  if (!cfg?.on) return null;
  const custom = cfg.custom.filter((c) => c.n.trim()).map((c) => ({
    name: c.n.trim(),
    sets: Array.from({ length: c.s }, () => ({ reps: '', done: false }))
  }));
  const ramp = cfg.ramp ? rampFor(top) : null;
  if (!cfg.ramp && !custom.length) return null;
  return { hidden: false, useRamp: !!cfg.ramp, ramp, custom };
}

/** Dernières répétitions faites sur chaque exercice du bloc perso : { nom: [reps,...] } */
export function lastWarmReps(history) {
  const out = {};
  for (const w of history) for (const c of w.warmup?.custom || []) if (!out[c.name]) out[c.name] = c.sets.map((s) => s.reps);
  return out;
}

/** Ce qu'on enregistre avec la séance (séries validées seulement), ou null. */
export function warmPayload(w) {
  if (!w) return null;
  const ramp = (w.ramp || []).filter((r) => r.done).map((r) => ({ weight: num(r.weight), reps: num(r.reps) }));
  const custom = w.custom
    .map((c) => ({ name: c.name, sets: c.sets.filter((s) => s.done && s.reps !== '').map((s) => ({ reps: num(s.reps) })) }))
    .filter((c) => c.sets.length);
  return ramp.length || custom.length ? { ramp, custom } : null;
}

/* ---------- Carte dans la séance ---------- */
export function warmCardHtml(w, { esc, firstName, lastReps = {} }) {
  if (!w) return '';
  const done = w.custom.reduce((t, c) => t + c.sets.filter((s) => s.done).length, 0) + (w.ramp || []).filter((r) => r.done).length;
  const total = w.custom.reduce((t, c) => t + c.sets.length, 0) + (w.ramp || []).length;
  const head = `<div class="w-head"><div><b>Échauffement</b><small>${total ? `${done}/${total} séries` : 'à ton rythme'}</small></div>
      <button type="button" class="btn ghost sm" data-w="toggle">${w.hidden ? 'Afficher' : 'Masquer'}</button></div>`;
  if (w.hidden) return `<div class="card warm-card">${head}</div>`;

  const stepper = (kind, d, label, val, ph, unit, wb, wj) => `
    <div class="stp"><button type="button" class="stp-b" data-w="step" data-f="${kind}" data-d="${-d}" aria-label="Moins">−</button>
      <label class="stp-in"><input inputmode="${kind === 'weight' ? 'decimal' : 'numeric'}" placeholder="${ph}" value="${esc(val)}" data-wf="${kind}" data-wb="${wb}" data-wj="${wj}" aria-label="${label}"><small>${unit}</small></label>
      <button type="button" class="stp-b" data-w="step" data-f="${kind}" data-d="${d}" aria-label="Plus">+</button></div>`;

  let html = '';
  if (w.useRamp) {
    html += `<div class="w-block"><h4>Chauffer le muscle <span class="muted">· ${esc(firstName || 'premier exercice')}</span></h4>`;
    if (w.ramp) {
      html += w.ramp.map((r, j) => `
        <div class="set-row w-row ${r.done ? 'done' : ''}" data-wrow data-wb="ramp" data-wj="${j}">
          <span class="num">${j + 1}</span>
          ${stepper('weight', 2.5, 'Charge', r.weight, '0', 'kg', 'ramp', j)}
          ${stepper('reps', 1, 'Répétitions', r.reps, '0', 'reps', 'ramp', j)}
          <button type="button" class="set-check" data-w="check" aria-label="Valider">✓</button>
        </div>`).join('');
    } else {
      html += '<p class="muted w-tip">Pas encore de charge connue : fais 1 à 2 séries légères de 10 à 12 reps, sans aller près de l\'échec.</p>';
    }
    html += '</div>';
  }
  w.custom.forEach((c, i) => {
    html += `<div class="w-block"><h4>${esc(c.name)}</h4>`;
    html += c.sets.map((s, j) => `
      <div class="set-row w-row w-one ${s.done ? 'done' : ''}" data-wrow data-wb="${i}" data-wj="${j}">
        <span class="num">${j + 1}</span>
        ${stepper('reps', 1, 'Répétitions', s.reps, lastReps[c.name]?.[j] ?? lastReps[c.name]?.at(-1) ?? '0', 'reps', i, j)}
        <button type="button" class="set-check" data-w="check" aria-label="Valider">✓</button>
      </div>`).join('');
    html += '</div>';
  });
  return `<div class="card warm-card">${head}${html}</div>`;
}

const target = (w, el) => {
  const row = el.closest('[data-wrow]');
  if (!row) return null;
  const b = row.dataset.wb, j = Number(row.dataset.wj);
  return b === 'ramp' ? w.ramp?.[j] : w.custom[Number(b)]?.sets[j];
};

/** Clics dans la carte. Renvoie true si traité. */
export function warmClick(e, w, { save, redraw, vibrate, lastReps = {} }) {
  const a = e.target.closest('[data-w]');
  if (!a || !w) return false;
  const act = a.dataset.w;
  if (act === 'toggle') { w.hidden = !w.hidden; save(); redraw(); return true; }
  const s = target(w, a);
  if (!s) return true;
  if (act === 'step') {
    const f = a.dataset.f, d = Number(a.dataset.d), row = a.closest('[data-wrow]');
    const ph = f === 'reps' && row.dataset.wb !== 'ramp' ? lastReps[w.custom[Number(row.dataset.wb)].name]?.[Number(row.dataset.wj)] : '';
    const base = s[f] === '' ? num(ph) : num(s[f]);
    const v = Math.max(0, base + d);
    s[f] = f === 'weight' ? nice(v).replace(',', '.') : String(Math.round(v));
    const inp = row.querySelector(`[data-wf="${f}"]`);
    if (inp) inp.value = s[f];
    save(); vibrate?.(6); return true;
  }
  if (act === 'check') {
    s.done = !s.done;
    const row = a.closest('[data-wrow]');
    if (s.done && s.reps === '' && row.dataset.wb !== 'ramp') {         // champ vide : on valide avec la dernière valeur
      const p = lastReps[w.custom[Number(row.dataset.wb)].name]?.[Number(row.dataset.wj)];
      if (p != null) s.reps = String(p);
    }
    save(); redraw(); if (s.done) vibrate?.(10);
    return true;
  }
  return true;
}

export function warmInput(e, w, save) {
  const f = e.target.dataset?.wf;
  if (!f || !w) return false;
  const s = target(w, e.target);
  if (s) { s[f] = e.target.value; save(); }
  return true;
}

/* ---------- Réglages (Profil) ---------- */
export function mountWarmSettings(host, getW, setW) {
  const render = () => {
    const w = getW();
    host.innerHTML = `
      <label class="switch-row">
        <span>Échauffement dans la séance<small>Une carte « Échauffement » en haut de chaque séance</small></span>
        <span class="switch"><input type="checkbox" data-wset="on" ${w.on ? 'checked' : ''}><i></i></span>
      </label>
      <div class="warm-opts ${w.on ? '' : 'off'}">
        <label class="switch-row">
          <span>Chauffer le muscle<small>Montée en charge sur le 1er exercice : 40, 60 puis 80 % de ta dernière charge</small></span>
          <span class="switch"><input type="checkbox" data-wset="ramp" ${w.ramp ? 'checked' : ''}><i></i></span>
        </label>
        <div class="field">
          <span>Mon échauffement</span>
          <small class="muted">Les exercices que tu fais à chaque séance, avec leur nombre de séries.</small>
          <div class="wc-list">
            ${w.custom.map((c, i) => `
              <div class="wc-row" data-wi="${i}">
                <input class="input" data-wname placeholder="Exercice (ex. Tractions)" maxlength="40" value="${escA(c.n)}" aria-label="Nom de l'exercice">
                <div class="wc-n"><button type="button" data-wd="-1" aria-label="Moins de séries">−</button><b>${c.s}</b><small>séries</small><button type="button" data-wd="1" aria-label="Plus de séries">+</button></div>
                <button type="button" class="wc-x" data-wdel aria-label="Retirer">×</button>
              </div>`).join('')}
          </div>
          <button type="button" class="btn ghost block" data-wadd ${w.custom.length >= 8 ? 'disabled' : ''}>+ Ajouter un exercice</button>
        </div>
      </div>`;
  };
  host.addEventListener('change', (e) => {
    const k = e.target.dataset?.wset;
    if (k) { setW({ ...getW(), [k]: e.target.checked }); render(); }
  });
  host.addEventListener('input', (e) => {
    if (!('wname' in (e.target.dataset || {}))) return;
    const i = Number(e.target.closest('[data-wi]').dataset.wi), w = getW();
    w.custom[i] = { ...w.custom[i], n: e.target.value };
    setW({ ...w });
  });
  host.addEventListener('click', (e) => {
    const w = getW();
    const row = e.target.closest('[data-wi]'), i = row ? Number(row.dataset.wi) : -1;
    const d = e.target.closest('[data-wd]');
    if (d && i >= 0) { w.custom[i] = { ...w.custom[i], s: Math.min(6, Math.max(1, w.custom[i].s + Number(d.dataset.wd))) }; setW({ ...w }); render(); }
    else if (e.target.closest('[data-wdel]') && i >= 0) { w.custom.splice(i, 1); setW({ ...w }); render(); }
    else if (e.target.closest('[data-wadd]')) {
      w.custom.push({ n: '', s: 3 }); setW({ ...w }); render();
      host.querySelectorAll('[data-wname]')[w.custom.length - 1]?.focus();
    }
  });
  render();
  return render;
}
