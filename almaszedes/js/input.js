// AS.Input – billentyűzet (WASD + nyilak), egér (csak kattintás), érintés (analóg pad + koppintás).
(function (root) {
  const AS = (root.AS = root.AS || {});
  const CFG = AS.CFG;

  const keys = Object.create(null);
  let canvas = null, pad = null, knob = null;
  let active = false;
  let click = null;
  let padX = 0, padY = 0, padId = null;
  let pauseCb = null;
  let touchSeen = false;

  const LEFT = ['KeyA', 'ArrowLeft'], RIGHT = ['KeyD', 'ArrowRight'];
  const UP = ['KeyW', 'ArrowUp'], DOWN = ['KeyS', 'ArrowDown'];
  const GAME_KEYS = LEFT.concat(RIGHT, UP, DOWN, ['Space']);
  const KEYNAME = { a: 'KeyA', d: 'KeyD', w: 'KeyW', s: 'KeyS', p: 'KeyP', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown', escape: 'Escape', ' ': 'Space' };

  function codeOf(e) { return e.code || KEYNAME[String(e.key || '').toLowerCase()] || ''; }
  function isTyping(e) { const t = e.target; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }
  function any(list) { for (let i = 0; i < list.length; i++) if (keys[list[i]]) return true; return false; }

  function onKeyDown(e) {
    if (isTyping(e)) return;
    const c = codeOf(e);
    if (c === 'KeyP' || c === 'Escape') {
      if (!e.repeat && pauseCb) { try { pauseCb(); } catch (err) { console.error(err); } }
      return;
    }
    if (GAME_KEYS.indexOf(c) >= 0 && active) {
      keys[c] = true;
      e.preventDefault(); // nyilak/szóköz ne görgessen
    }
  }
  function onKeyUp(e) { const c = codeOf(e); if (keys[c]) keys[c] = false; }

  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: (e.clientX - r.left) / r.width * CFG.W, y: (e.clientY - r.top) / r.height * CFG.H };
  }

  function onCanvasDown(e) {
    if (e.pointerType === 'touch' && !touchSeen) markTouch();
    if (!active) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = toLogical(e);
    if (p) click = p;
    e.preventDefault();
  }

  function markTouch() {
    const first = !touchSeen;
    touchSeen = true;
    document.body.classList.add('touch');
    if (first) { try { root.dispatchEvent(new Event('as-touch')); } catch (e) { /* ignore */ } }
  }

  // ---- húzás bárhol: a lavór a legutóbbi húzás IRÁNYÁBA megy állandó sebességgel ----
  // A kiindulópont (horgony) legfeljebb DRAG_R távolságra lemarad az ujj mögött, így irányt váltani
  // egy kis mozdulattal lehet, nem kell visszahúzni egy rögzített középpontig.
  let dragId = null, ax = 0, ay = 0, dragX = 0, dragY = 0;
  function dragMode() { return !(AS.UI && AS.UI.getSettings && AS.UI.getSettings().touchMode === 'pad'); }
  function dragR() { return Math.max(18, Math.min(40, Math.min(root.innerWidth, root.innerHeight) * 0.05)); }
  function onDragDown(e) {
    if (!active || e.pointerType !== 'touch' || dragId !== null || !dragMode()) return;
    const tg = e.target;
    if (tg && tg.closest && tg.closest('button, a, input, #pad, .screen')) return;
    dragId = e.pointerId; ax = e.clientX; ay = e.clientY; dragX = 0; dragY = 0;
  }
  function onDragMove(e) {
    if (e.pointerId !== dragId) return;
    const R = dragR();
    let vx = e.clientX - ax, vy = e.clientY - ay;
    const len = Math.hypot(vx, vy);
    if (len > R) { ax = e.clientX - vx / len * R; ay = e.clientY - vy / len * R; vx = vx / len * R; vy = vy / len * R; }
    if (len < R * 0.45) return;                       // kis remegés: marad az eddigi irány
    let ux = vx / Math.hypot(vx, vy), uy = vy / Math.hypot(vx, vy);
    const SNAP = Math.sin(22 * Math.PI / 180);       // tengely közelében tisztán vízszintes / függőleges
    if (Math.abs(uy) < SNAP) { ux = Math.sign(ux); uy = 0; }
    else if (Math.abs(ux) < SNAP) { uy = Math.sign(uy); ux = 0; }
    const f = (AS.UI && AS.UI.padSpeed) ? AS.UI.padSpeed() : 0.55;
    dragX = ux * f; dragY = uy * f;
    e.preventDefault();
  }
  function onDragUp(e) { if (e.pointerId === dragId) releaseDrag(); }
  function releaseDrag() { dragId = null; dragX = 0; dragY = 0; }

  // ---- virtuális pad ----
  function updatePad(e) {
    const r = pad.getBoundingClientRect();
    const R = r.width / 2;
    const travel = R * 0.58;
    let dx = (e.clientX - (r.left + R)) / travel;
    let dy = (e.clientY - (r.top + R)) / travel;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    const l = Math.min(1, len);
    const dz = 0.22;
    if (l < dz) { padX = 0; padY = 0; }
    else {
      // nincs gyorsulás: a húzás csak az IRÁNYT adja, a sebesség állandó (menüben állítható)
      let ux = dx / l, uy = dy / l;
      const SNAP = Math.sin(22 * Math.PI / 180);   // tengely közelében tisztán vízszintes / függőleges
      if (Math.abs(uy) < SNAP) { ux = Math.sign(ux); uy = 0; }
      else if (Math.abs(ux) < SNAP) { uy = Math.sign(uy); ux = 0; }
      const f = (AS.UI && AS.UI.padSpeed) ? AS.UI.padSpeed() : 0.55;
      padX = ux * f; padY = uy * f;
    }
    if (knob) knob.style.transform = 'translate(' + (dx * travel).toFixed(1) + 'px,' + (dy * travel).toFixed(1) + 'px)';
  }
  function releasePad() {
    padId = null; padX = 0; padY = 0;
    if (knob) knob.style.transform = '';
  }
  function onPadDown(e) {
    if (padId !== null) return;
    padId = e.pointerId;
    try { pad.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    updatePad(e);
    e.preventDefault();
  }
  function onPadMove(e) { if (e.pointerId === padId) { updatePad(e); e.preventDefault(); } }
  function onPadUp(e) { if (e.pointerId === padId) releasePad(); }

  function init(cv) {
    canvas = cv;
    pad = document.getElementById('pad');
    knob = document.getElementById('knob');
    const touchCapable = ('ontouchstart' in root) || (navigator.maxTouchPoints > 0);
    if (touchCapable) markTouch();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    root.addEventListener('blur', reset);

    canvas.addEventListener('pointerdown', onCanvasDown);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    if (pad) {
      pad.addEventListener('pointerdown', onPadDown);
      pad.addEventListener('pointermove', onPadMove);
      pad.addEventListener('pointerup', onPadUp);
      pad.addEventListener('pointercancel', onPadUp);
      pad.addEventListener('lostpointercapture', onPadUp);
      pad.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    document.addEventListener('pointerdown', onDragDown, true);
    document.addEventListener('pointermove', onDragMove, { capture: true, passive: false });
    document.addEventListener('pointerup', onDragUp, true);
    document.addEventListener('pointercancel', onDragUp, true);
    // biztonsági elengedés: egyes böngészők (pl. alkalmazásba épített böngészők) nem küldik a pad saját felengedés-eseményét
    document.addEventListener('pointerup', (e) => { if (e.pointerId === padId) releasePad(); }, true);
    document.addEventListener('pointercancel', (e) => { if (e.pointerId === padId) releasePad(); }, true);
    const touchGone = (e) => { if (!e.touches || e.touches.length === 0) { if (padId !== null) releasePad(); if (dragId !== null) releaseDrag(); } };
    document.addEventListener('touchend', touchGone, true);
    document.addEventListener('touchcancel', touchGone, true);
    root.addEventListener('pagehide', reset);

    // görgetés / nagyítás / húzás tiltása játék közben
    document.addEventListener('touchmove', (e) => { if (active) e.preventDefault(); }, { passive: false });
    document.addEventListener('wheel', (e) => { if (active) e.preventDefault(); }, { passive: false });
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => document.addEventListener(n, (e) => e.preventDefault()));
    document.addEventListener('dblclick', (e) => { if (active) e.preventDefault(); });
    document.addEventListener('dragstart', (e) => e.preventDefault());
  }

  function reset() {
    for (const k in keys) keys[k] = false;
    click = null;
    releasePad();
    releaseDrag();
  }

  function setActive(on) {
    on = !!on;
    if (on === active) return;
    active = on;
    reset();
  }

  function read() {
    let mx = (any(RIGHT) ? 1 : 0) - (any(LEFT) ? 1 : 0);
    let my = (any(DOWN) ? 1 : 0) - (any(UP) ? 1 : 0);
    mx += padX + dragX; my += padY + dragY;
    mx = Math.max(-1, Math.min(1, mx));
    my = Math.max(-1, Math.min(1, my));
    const c = click;
    click = null;
    return { moveX: mx, moveY: my, click: c };
  }

  AS.Input = {
    init, read, setActive, reset,
    onPause(cb) { pauseCb = cb; },
    isTouch: () => touchSeen,
  };
})(typeof window !== 'undefined' ? window : globalThis);
