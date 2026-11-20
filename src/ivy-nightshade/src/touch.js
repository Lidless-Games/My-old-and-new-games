// Touch controls for phones and tablets: a floating joystick (left thumb) and buttons (right thumb).
// Drives G.input.virtual; shown only while touch is being used, hidden again after a key press.
(function () {
  const G = window.G;
  const V = () => G.input.virtual;
  let sneakOn = false, wasPlay = false;
  const ICON_IVY = '<svg viewBox="5 4 30 34" width="66%" height="66%" style="overflow:hidden"><path d="M9 20c0-8 5-13 11-13s11 5 11 13v12h-4V22H13v10H9z" fill="#15101c"/><ellipse cx="20" cy="22" rx="8" ry="9" fill="#efe6d8"/><path d="M12 19c1-6 4-8 8-8s7 2 8 8c-3-2-5-2-8-2s-5 0-8 2z" fill="#15101c"/><circle cx="16.8" cy="23" r="1.3" fill="#2a1c30"/><circle cx="23.2" cy="23" r="1.3" fill="#2a1c30"/><path d="M18 28h4" stroke="#8e4256" stroke-width="1.2" stroke-linecap="round"/><path d="M10 26l-2 9M30 26l2 9" stroke="#15101c" stroke-width="3" stroke-linecap="round"/></svg>', ICON_HOOD = '<svg viewBox="3 4 34 34" width="70%" height="70%" style="overflow:hidden"><path d="M5 36c1-16 6-29 15-29s14 13 15 29z" fill="#3a1d3a"/><path d="M8 36c1-12 5-22 12-22s11 10 12 22z" fill="#1c0f1e"/><ellipse cx="20" cy="25" rx="7" ry="8" fill="#e6dccd"/><path d="M13.5 22c1-4 3.5-5.5 6.5-5.5s5.5 1.5 6.5 5.5c-2.5-1.3-4.3-1.6-6.5-1.6s-4 .3-6.5 1.6z" fill="#15101c"/><path d="M15 25.5h3.4M21.6 25.5H25" stroke="#2a1c30" stroke-width="1.6" stroke-linecap="round"/><path d="M18.3 30.5h3.4" stroke="#8e4256" stroke-width="1.1" stroke-linecap="round"/></svg>', ICON_SWAP = '<svg viewBox="0 0 40 40" width="62%" height="62%" fill="none" stroke="rgba(239,230,208,.9)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 14h22M24 8l6 6-6 6M32 26H10M16 20l-6 6 6 6"/></svg>';
  const COARSE = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  let root, stick, knob, btns = {}, rotate, active = false, fsTried = false;
  const st = { id: null, ox: 0, oy: 0 };
  const DEAD = 12, WALK = 46, VERT = 34;

  function css() {
    const s = document.createElement('style');
    s.textContent = `
#touch{position:fixed;inset:0;pointer-events:none;z-index:5;display:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
#touch.on{display:block}
#touch .zone{position:absolute;left:0;top:18%;width:45%;bottom:0;}
#touch.flip .zone{left:auto;right:0}
#touch .zone{pointer-events:auto;touch-action:none}
#touch .stick{position:absolute;width:var(--sz);height:var(--sz);margin:calc(var(--sz)/-2) 0 0 calc(var(--sz)/-2);border-radius:50%;
 border:2px solid rgba(239,230,208,.35);background:rgba(20,14,28,.25);display:none}
#touch .knob{position:absolute;left:50%;top:50%;width:44%;height:44%;margin:-22% 0 0 -22%;border-radius:50%;background:rgba(239,230,208,.45)}
#touch .b{position:absolute;pointer-events:auto;touch-action:none;border-radius:50%;display:flex;align-items:center;justify-content:center;
 font:600 calc(var(--b)*.32) Georgia,serif;color:rgba(239,230,208,.85);background:rgba(60,26,40,.38);border:2px solid rgba(239,230,208,.35)}
#touch .b.down{background:rgba(212,160,90,.5)}
#touch .b.sneak.down{background:rgba(120,70,140,.6);border-color:rgba(243,200,115,.9);box-shadow:0 0 14px rgba(243,200,115,.45)}
#touch .b svg{pointer-events:none}
#touch .b.small{font-size:calc(var(--b)*.22)}
#rot{position:fixed;inset:0;z-index:9;display:none;align-items:center;justify-content:center;flex-direction:column;background:#120d18;color:#efe6d0;
 font:22px Georgia,serif;text-align:center;padding:20px}
#rot .ph{font-size:64px;margin-bottom:14px;display:inline-block;animation:rot 2s ease-in-out infinite}
@keyframes rot{0%,30%{transform:rotate(0)}60%,100%{transform:rotate(-90deg)}}
body,canvas{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}`;
    document.head.appendChild(s);
  }

  function button(name, label, acts, cls) {
    const b = document.createElement('div');
    b.className = 'b' + (cls ? ' ' + cls : ''); b.textContent = label; root.appendChild(b);
    let pid = null, downAt = 0;
    const on = (v) => { acts.forEach((a) => { V()[a] = v; }); b.classList.toggle('down', v); };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); pid = e.pointerId; b.setPointerCapture(pid); downAt = performance.now(); on(true); });
    const up = (e) => {
      if (e.pointerId !== pid) return; pid = null;
      // a quick tap must last at least two game ticks or it is never seen
      const wait = Math.max(0, 40 - (performance.now() - downAt));
      setTimeout(() => on(false), wait);
    };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    btns[name] = b; return b;
  }

  function layout() {
    const w = innerWidth, h = innerHeight, m = Math.min(w, h);
    const big = Math.max(64, Math.min(124, m * 0.22)), sm = Math.max(42, Math.min(70, m * 0.13));
    root.style.setProperty('--sz', Math.round(big * 1.5) + 'px');
    const flip = G.save.get('lefty', false) === true; root.classList.toggle('flip', flip);
    const place = (b, size, right, bottom, top) => {
      b.style.setProperty('--b', size + 'px'); b.style.width = b.style.height = size + 'px';
      if (flip) { b.style.left = right + 'px'; b.style.right = ''; } else { b.style.right = right + 'px'; b.style.left = ''; } if (top != null) { b.style.top = top + 'px'; b.style.bottom = ''; } else { b.style.bottom = bottom + 'px'; b.style.top = ''; }
    };
    const pad = Math.max(14, m * 0.04);
    const bb = big * 0.9; // the two thumb buttons are the same size
    place(btns.sneak, bb, pad, pad * 0.6);
    place(btns.action, bb, pad, pad * 0.6 + bb + pad * 0.6);
    place(btns.pause, sm, pad, 0, pad);
    place(btns.map, sm, pad + sm * 1.25, 0, pad);
    place(btns.swap, sm, pad, 0, pad + sm * 1.25);
    const portrait = h > w * 1.05;
    rotate.style.display = active && portrait ? 'flex' : 'none';
  }

  function setStick(dx, dy) {
    const v = V(), ax = Math.abs(dx), ay = Math.abs(dy);
    const downward = dy > VERT && ay > ax * 1.2; // pulling straight down (hide, door) does not walk
    v.left = !downward && dx < -DEAD; v.right = !downward && dx > DEAD;
    v.sneak = sneakOn; // only the toggle sneaks, so a thumb slip can never drop out of it
    v.up = v.jump = dy < -VERT && ay > ax * 0.5; // up jumps (and climbs ladders), diagonals jump sideways
    v.down = dy > VERT && ay > ax * 0.8;
  }

  function scene() { return G.scenes && G.scenes.current; }
  function tick() {
    const s = scene();
    const play = active && s && s.player && !s.paused;
    root.classList.toggle('on', !!play);
    if (btns.map) btns.map.style.display = play && s.school ? 'flex' : 'none';
    if (!play && st.id !== null) { st.id = null; stick.style.display = 'none'; setStick(0, 0); }
    if (!play && wasPlay) ['left', 'right', 'up', 'down', 'sneak', 'jump', 'action', 'pause', 'back', 'map'].forEach((a) => { V()[a] = false; });
    wasPlay = !!play;
    if (play && st.id === null) V().sneak = sneakOn;
    if (G.touchFlip !== G.save.get('lefty', false)) { G.touchFlip = G.save.get('lefty', false); layout(); }
    requestAnimationFrame(tick);
  }

  function goTouchQuiet() { active = true; G.touchMode = true; }
  function goTouch() {
    if (!active) { active = true; G.touchMode = true; layout(); }
    if (!fsTried) {
      fsTried = true;
      const d = document.documentElement;
      try { const r = d.requestFullscreen && d.requestFullscreen({ navigationUI: 'hide' }); if (r && r.then) r.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {}); } catch (e) {}
    }
  }

  function init() {
    if (!G.input || !G.input.virtual) return;
    css();
    root = document.createElement('div'); root.id = 'touch'; document.body.appendChild(root);
    const zone = document.createElement('div'); zone.className = 'zone'; root.appendChild(zone);
    stick = document.createElement('div'); stick.className = 'stick'; root.appendChild(stick);
    knob = document.createElement('div'); knob.className = 'knob'; stick.appendChild(knob);
    button('action', 'E', ['action']);
    { // sneak is a toggle: tap on, tap off (the joystick's small push sneaks too)
      const b = document.createElement('div'); b.className = 'b sneak'; b.innerHTML = ICON_IVY; root.appendChild(b); btns.sneak = b;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); sneakOn = !sneakOn; b.classList.toggle('down', sneakOn); b.innerHTML = sneakOn ? ICON_HOOD : ICON_IVY; });
    }
    { // swap sides
      const b = document.createElement('div'); b.className = 'b small'; b.innerHTML = ICON_SWAP; root.appendChild(b); btns.swap = b;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); G.save.set('lefty', G.save.get('lefty', false) !== true); });
    }
    button('pause', '❚❚', ['pause', 'back'], 'small');
    button('map', '▦', ['map'], 'small');
    rotate = document.createElement('div'); rotate.id = 'rot';
    rotate.innerHTML = '<span class="ph">📱</span><div class="t"></div>'; document.body.appendChild(rotate);
    const rotText = () => { rotate.querySelector('.t').textContent = (G.i18n && G.i18n.lang === 'en') ? 'Turn your device sideways' : 'Fordítsd el a készüléket'; };
    rotText();

    zone.addEventListener('pointerdown', (e) => {
      if (st.id !== null) return;
      e.preventDefault(); st.id = e.pointerId; zone.setPointerCapture(st.id);
      st.ox = e.clientX; st.oy = e.clientY;
      stick.style.left = st.ox + 'px'; stick.style.top = st.oy + 'px'; stick.style.display = 'block';
      knob.style.transform = '';
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== st.id) return;
      let dx = e.clientX - st.ox, dy = e.clientY - st.oy;
      const R = parseFloat(getComputedStyle(root).getPropertyValue('--sz')) / 2 || 70;
      const d = Math.hypot(dx, dy);
      if (d > R) { // the base follows the thumb so it never runs out of travel
        st.ox += dx * (1 - R / d); st.oy += dy * (1 - R / d); dx = e.clientX - st.ox; dy = e.clientY - st.oy;
        stick.style.left = st.ox + 'px'; stick.style.top = st.oy + 'px';
      }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      setStick(dx * 70 / R, dy * 70 / R);
    });
    const end = (e) => { if (e.pointerId !== st.id) return; st.id = null; stick.style.display = 'none'; setStick(0, 0); };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);

    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { goTouch(); rotText(); } }, { capture: true, passive: true });
    // story cards and the end screen: a tap on the picture moves on
    const cv = document.getElementById('game');
    if (cv) cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      const s = scene(); if (!s || s.player || s === G.ui.MenuScene) return;
      V().confirm = true; setTimeout(() => { V().confirm = false; }, 60);
    });
    window.addEventListener('touchstart', () => goTouch(), { capture: true, passive: true });
    window.addEventListener('keydown', () => { if (active && !COARSE) { active = false; G.touchMode = false; root.classList.remove('on'); rotate.style.display = 'none'; } });
    window.addEventListener('resize', () => { if (active) layout(); });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    const stopZoom = (e) => { if (e.target.closest && (e.target.closest('#touch') || e.target.id === 'game')) e.preventDefault(); };
    document.addEventListener('touchend', stopZoom, { passive: false });
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
    if (COARSE) goTouchQuiet();
    layout(); requestAnimationFrame(tick);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
