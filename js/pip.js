// Bulle flottante du minuteur (image dans l'image) : le chrono reste visible par-dessus les autres applis.
// Aucun son en arrière-plan : on dessine simplement le minuteur dans une vidéo muette que le téléphone sait afficher en bulle.
// Ce module ne touche pas au minuteur : il lit la pastille #rtChip (temps, état, anneau) et la recopie.

const W = 240, H = 240;          // carré : la fenêtre flottante est petite et ronde à l'œil
const COLORS = { run: null, warn: '#FF8C42', done: '#10B981' };

export function initPip(notify = () => {}) {
  const ok = typeof document.pictureInPictureEnabled !== 'undefined'
    && document.pictureInPictureEnabled
    && typeof HTMLVideoElement !== 'undefined'
    && 'requestPictureInPicture' in HTMLVideoElement.prototype;
  if (!ok) return;

  let canvas = null, ctx = null, video = null, loop = 0, hiddenSince = 0;

  const chip = () => document.getElementById('rtChip');
  const live = () => { const c = chip(); return c && !c.hidden ? c : null; };

  function read() {
    const c = live(); if (!c) return null;
    const fg = c.querySelector('.rt-fg');
    const dash = fg ? parseFloat(fg.getAttribute('stroke-dasharray')) : 0;
    const off = fg ? parseFloat(fg.getAttribute('stroke-dashoffset')) : 0;
    const frac = dash > 0 ? Math.max(0, Math.min(1, 1 - off / dash)) : 0;
    return {
      time: (c.querySelector('.rt-t')?.textContent || '').trim() || '0:00',
      state: c.classList.contains('done') ? 'done' : c.classList.contains('warn') ? 'warn' : 'run',
      paused: c.classList.contains('rt-paused'), frac
    };
  }

  function accent() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    return v || '#2DE2E6';
  }

  function draw() {
    const s = read();
    if (!s || !ctx) return;
    const col = COLORS[s.state] || accent();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#070B12'; ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, 150);
    g.addColorStop(0, col + '55'); g.addColorStop(1, '#070B1200');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, r = 100;
    ctx.lineWidth = 13; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    if (s.frac > 0.002) {
      ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.frac); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = s.paused ? 'rgba(255,255,255,.55)' : '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 54px system-ui, -apple-system, Roboto, sans-serif';
    ctx.fillText(s.time, cx, cy - 6);
    ctx.fillStyle = col; ctx.font = '800 13px system-ui, sans-serif';
    const label = s.state === 'done' ? 'GO !' : s.paused ? 'PAUSE' : 'REPOS';
    ctx.fillText(label.split('').join(' '), cx, cy + 34);
  }

  function ensure() {
    if (video) return;
    canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d');
    video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.setAttribute('playsinline', '');
    video.style.cssText = 'position:fixed;left:-9999px;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(video);
    window.__stridePip = { canvas };
    video.addEventListener('leavepictureinpicture', () => { clearInterval(loop); loop = 0; });
  }

  async function open() {
    try {
      if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return; }
      if (!live()) { notify('Lance un repos pour afficher la bulle'); return; }
      ensure(); draw();
      if (!video.srcObject) video.srcObject = canvas.captureStream(10);
      await video.play();
      await video.requestPictureInPicture();
      clearInterval(loop);
      loop = setInterval(() => {                         // setInterval : continue même quand la page passe en arrière-plan
        if (!live()) {
          hiddenSince = hiddenSince || Date.now();
          if (Date.now() - hiddenSince > 1500) { hiddenSince = 0; document.pictureInPictureElement && document.exitPictureInPicture().catch(() => {}); }
          return;
        }
        hiddenSince = 0; draw();
      }, 250);
    } catch (e) {
      console.warn('[bulle]', e);
      notify(e && e.name === 'NotAllowedError' ? 'La bulle est refusée par le téléphone' : 'Bulle indisponible sur ce navigateur');
    }
  }

  // Bouton « bulle » dans le minuteur plein écran
  const addBtn = () => {
    const full = document.querySelector('.rt-full');
    if (!full || full.querySelector('.rt-pip')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'rt-pip'; b.setAttribute('aria-label', 'Afficher le minuteur dans une bulle flottante');
    b.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><rect x="12" y="11" width="7" height="5" rx="1.2" fill="currentColor" stroke="none"/></svg>';
    b.addEventListener('click', (e) => { e.stopPropagation(); open(); });
    full.appendChild(b);
  };
  new MutationObserver(addBtn).observe(document.body, { childList: true });
  addBtn();

  // Quand tu quittes l'appli pendant un repos : on tente la bulle (accepté seulement si le téléphone l'autorise)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && live() && !document.pictureInPictureElement) {
      ensure(); draw();
      if (!video.srcObject) video.srcObject = canvas.captureStream(10);
      video.play().then(() => video.requestPictureInPicture()).then(() => open_loop()).catch(() => {});
    }
  });
  function open_loop() {
    clearInterval(loop);
    loop = setInterval(() => { if (live()) draw(); else if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {}); }, 250);
  }

  // Sur les navigateurs qui le prévoient : entrée automatique dans la bulle quand on quitte l'appli
  try { navigator.mediaSession?.setActionHandler('enterpictureinpicture', () => { open(); }); } catch {}
}
