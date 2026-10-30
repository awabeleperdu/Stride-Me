// Première ouverture : pseudo → ambiance (thème) → temps de repos, en 3 étapes (on peut tout passer).
import { THEMES, RESTS, getSettings, saveSettings } from './settings.js';
import { esc } from './ui.js';

const KEY = 'introDone';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return '1'; } };
const lsSet = (k) => { try { localStorage.setItem(k, '1'); } catch (e) { console.warn('stockage local indisponible', e); } };

/** Vrai uniquement pour un tout nouvel utilisateur (jamais vu l'intro, pas de pseudo, pas déjà invité à en choisir un). */
export const needsIntro = () => !lsGet(KEY) && !getSettings().pseudo && !lsGet('pseudoAsked');

const restLabel = (r) => (r >= 120 ? `${r / 60} min` : `${r} s`);
const BOLT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"/></svg>';

export function showIntro() {
  return new Promise((resolve) => {
    let step = 0;               // 0 accueil · 1 pseudo · 2 thème · 3 repos · 4 récap
    let pseudo = '';
    const LAST = 4;
    const ov = document.createElement('div');
    ov.className = 'intro';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Bienvenue');
    document.body.appendChild(ov);

    const finish = () => {
      lsSet(KEY); lsSet('pseudoAsked');
      ov.classList.add('out');
      setTimeout(() => ov.remove(), 250);
      resolve();
    };
    const savePseudo = () => { const p = pseudo.trim(); if (p) saveSettings({ pseudo: p }); };

    const body = () => {
      const s = getSettings();
      if (step === 0) return `
        <div class="intro-hero">
          <div class="intro-logo">${BOLT}</div>
          <h1>Stride Me</h1>
          <p class="muted">Ton carnet de muscu. Simple, rapide, fait pour la salle.</p>
          <ul class="intro-perks">
            <li><i>⚡</i>Tes charges se pré-remplissent</li>
            <li><i>⏱</i>Minuteur de repos intégré</li>
            <li><i>📈</i>Tu vois ta progression</li>
          </ul>
        </div>`;
      if (step === 1) return `
        <h1>Comment on t'appelle ?</h1>
        <p class="muted">Un pseudo suffit. Tu pourras le changer dans Profil.</p>
        <input class="input intro-in" id="inPseudo" maxlength="24" autocomplete="nickname" placeholder="Ton pseudo" value="${esc(pseudo)}">
        <div class="intro-prev"><div class="intro-av" id="pvAv">?</div><div><small class="muted">Aperçu</small><b id="pvTx">Salut 👋</b></div></div>`;
      if (step === 2) return `
        <h1>Ton ambiance</h1>
        <p class="muted">L'appli change tout de suite. Rien n'est définitif.</p>
        <div class="intro-themes">
          ${THEMES.map((t) => `
            <button type="button" class="intro-th" data-th="${t.id}" aria-pressed="${s.theme === t.id}">
              <span class="tile-prev" style="background:${t.bg};border-color:${t.text}22"><i style="background:${t.card};border-color:${t.text}22"></i><b style="background:${t.accent}"></b></span>
              <span>${esc(t.label)}</span>
            </button>`).join('')}
        </div>`;
      if (step === 3) return `
        <h1>Ton temps de repos</h1>
        <p class="muted">Entre deux séries. Le minuteur se lance tout seul quand tu valides.</p>
        <div class="intro-rests">
          ${RESTS.map((r) => `<button type="button" class="intro-rest" data-rest="${r}" aria-pressed="${s.rest === r}">${restLabel(r)}</button>`).join('')}
        </div>`;
      const th = THEMES.find((t) => t.id === s.theme);
      return `
        <div class="intro-hero">
          <div class="intro-check" aria-hidden="true">✓</div>
          <h1>C'est prêt${pseudo.trim() ? `, ${esc(pseudo.trim())}` : ''} !</h1>
          <p class="muted">Voilà ce que j'ai préparé pour toi :</p>
          <div class="intro-chips"><span>Thème ${esc(th ? th.label : '')}</span><span>Repos ${restLabel(s.rest)}</span></div>
        </div>`;
    };

    const render = () => {
      const nextLabel = ['Commencer', 'Continuer', 'Continuer', 'Terminer', "Lancer l'appli"][step];
      ov.innerHTML = `
        <div class="intro-head">
          <button type="button" class="intro-bk ${step === 0 || step === LAST ? 'off' : ''}" data-a="back" aria-label="Retour">‹</button>
          <div class="intro-bar"><i style="width:${(step / LAST) * 100}%"></i></div>
          <small>${step > 0 && step < LAST ? `${step}/3` : ''}</small>
        </div>
        <div class="intro-step" id="introStep">${body()}</div>
        <div class="intro-foot">
          <button type="button" class="btn block" data-a="next" ${step === 1 && !pseudo.trim() ? 'disabled' : ''}>${nextLabel}</button>
          ${step === LAST ? '' : '<button type="button" class="linkbtn" data-a="skip">Passer l\'intro</button>'}
        </div>`;
      if (step === 1) setTimeout(() => ov.querySelector('#inPseudo')?.focus(), 200);
    };

    ov.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'next') { if (step === 1) savePseudo(); step < LAST ? (step++, render()) : finish(); }
      else if (a === 'back' && step > 0) { step--; render(); }
      else if (a === 'skip') { savePseudo(); finish(); }
      const th = e.target.closest("[data-th]");
      if (th) { saveSettings({ theme: th.dataset.th }); render(); }
      const rs = e.target.closest('[data-rest]');
      if (rs) { saveSettings({ rest: Number(rs.dataset.rest) }); render(); }
    });
    ov.addEventListener('input', (e) => {
      if (e.target.id !== 'inPseudo') return;
      pseudo = e.target.value;
      const v = pseudo.trim();
      ov.querySelector('#pvAv').textContent = v ? v[0].toUpperCase() : '?';
      ov.querySelector('#pvTx').textContent = v ? `Salut ${v} 👋` : 'Salut 👋';
      ov.querySelector('[data-a="next"]').disabled = !v;
    });
    ov.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.id === 'inPseudo' && pseudo.trim()) { savePseudo(); step++; render(); }
    });
    render();
  });
}
