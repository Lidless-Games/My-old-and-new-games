(function () {
  const G = window.G;
  const CFG = G.CFG;
  const PAL = CFG.PAL;
  const W = CFG.VIEW_W, H = CFG.VIEW_H;
  const FONT = 'Georgia, serif';

  function T(k, v) { return G.t(k, v); }
  function sfx(name) { if (G.sfx && G.sfx.play) { try { G.sfx.play(name); } catch (e) {} } }
  function hasArt(fn) { return !!(G.art && typeof G.art[fn] === 'function'); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function musicOn() { return G.save.get('music', true) !== false; }
  function setMusic(on) {
    G.save.set('music', !!on);
    if (G.rhythm && G.rhythm.setMusicEnabled) G.rhythm.setMusicEnabled(!!on);
  }
  function startGame(i) { if (G.game && G.game.start) G.game.start(i); }
  function toLogical(e) {
    const r = G.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- title / main menu ----------
  const MAIN_Y0 = 270, MAIN_STEP = 50;
  let page = 'main';   // 'main' | 'controls'
  let sel = 0;
  let rects = [];      // hit rects of the last drawn frame: {x,y,w,h,index}

  function items() {
    if (page === 'controls') return [{ id: 'back' }];
    const list = [{ id: 'new' }];
    if (G.save.get('progress', 0) > 0) list.push({ id: 'continue' });
    list.push({ id: 'lang' }, { id: 'music' }, { id: 'controls' });
    return list;
  }
  function label(id) {
    switch (id) {
      case 'new': return T('menu_new');
      case 'continue': return T('menu_continue');
      case 'lang': return T('menu_lang') + ': ' + T('lang_name');
      case 'music': return T('menu_music') + ': ' + T(musicOn() ? 'on' : 'off');
      case 'controls': return T('menu_controls');
      case 'back': return T('menu_back');
    }
    return id;
  }
  function activate(id) {
    switch (id) {
      case 'new': sfx('ui_ok'); startGame(0); break;
      case 'continue': sfx('ui_ok'); startGame(G.save.get('progress', 0)); break;
      case 'lang': sfx('ui_ok'); G.i18n.setLang(G.i18n.lang === 'hu' ? 'en' : 'hu'); break;
      case 'music': sfx('ui_ok'); setMusic(!musicOn()); break;
      case 'controls': sfx('ui_ok'); page = 'controls'; sel = 0; break;
      case 'back': {
        sfx('ui_ok');
        page = 'main';
        const idx = items().findIndex((it) => it.id === 'controls');
        sel = idx < 0 ? 0 : idx;
        break;
      }
    }
  }

  function onPointerDown(e) {
    const p = toLogical(e);
    if (page === 'controls') { activate('back'); return; }
    const hit = rects.find((r) => inRect(p, r));
    if (!hit) return;
    sel = hit.index;
    activate(items()[hit.index].id);
  }
  function onPointerMove(e) {
    const p = toLogical(e);
    const hit = rects.find((r) => inRect(p, r));
    if (hit && page === 'main') sel = hit.index;
  }

  function drawDecor(ctx) {
    if (hasArt('drawIvy')) {
      ctx.save();
      ctx.translate(165, 500);
      ctx.scale(1.8, 1.8);
      G.art.drawIvy(ctx, 0, 0, { state: 'idle', facing: 1, t: G.time, speed: 0 });
      ctx.restore();
    }
    if (hasArt('drawCrow')) {
      G.art.drawCrow(ctx, 800, 300, { t: G.time, heads: 2, scale: 1.5 });
    }
  }

  const MenuScene = {
    enter() {
      rects = [];
      sel = 0;
      page = 'main';
      if (G.canvas) {
        G.canvas.addEventListener('pointerdown', onPointerDown);
        G.canvas.addEventListener('pointermove', onPointerMove);
      }
      if (G.rhythm) {
        if (G.rhythm.setMusicEnabled) G.rhythm.setMusicEnabled(musicOn());
        if (G.rhythm.startMusic) G.rhythm.startMusic('menu');
      }
    },
    exit() {
      if (G.canvas) {
        G.canvas.removeEventListener('pointerdown', onPointerDown);
        G.canvas.removeEventListener('pointermove', onPointerMove);
      }
    },
    update() {
      const list = items();
      if (sel >= list.length) sel = list.length - 1;
      if (sel < 0) sel = 0;
      const n = list.length;
      if (G.input.pressed('up')) { sel = (sel + n - 1) % n; sfx('ui_move'); }
      if (G.input.pressed('down')) { sel = (sel + 1) % n; sfx('ui_move'); }
      const id = list[sel].id;
      if (page === 'controls') {
        if (G.input.pressed('confirm') || G.input.pressed('action') || G.input.pressed('back')) activate('back');
        return;
      }
      if ((G.input.pressed('left') || G.input.pressed('right')) && (id === 'lang' || id === 'music')) {
        activate(id);
      } else if (G.input.pressed('confirm') || G.input.pressed('action')) {
        activate(id);
      }
    },
    draw(ctx) {
      ctx.fillStyle = PAL.plum;
      ctx.fillRect(0, 0, W, H);
      if (hasArt('drawBackground')) {
        G.art.drawBackground(ctx, { x: 0, y: 0 }, 'hall', G.time);
      } else {
        const g = ctx.createRadialGradient(W * 0.75, 110, 20, W * 0.5, H * 0.5, W * 0.7);
        g.addColorStop(0, PAL.plumLight);
        g.addColorStop(1, PAL.plumDeep);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.fillStyle = 'rgba(23,19,30,0.55)';
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';

      if (page === 'main') drawDecor(ctx);

      // title
      ctx.shadowColor = PAL.bordeaux;
      ctx.shadowBlur = 14;
      ctx.font = 'bold 64px ' + FONT;
      ctx.fillStyle = PAL.cream;
      ctx.fillText(T('title'), W / 2, 150);
      ctx.shadowBlur = 0;
      ctx.font = 'italic 24px ' + FONT;
      ctx.fillStyle = PAL.moon;
      ctx.fillText(T('subtitle'), W / 2, 192);
      ctx.save();
      ctx.font = '13px ' + FONT; ctx.fillStyle = PAL.moonDim; ctx.globalAlpha = 0.8;
      ctx.fillText('© 2026 Lidless · CC BY-NC 4.0', W / 2, 528);
      ctx.restore();

      rects = [];
      if (page === 'controls') {
        ctx.font = '20px ' + FONT;
        ctx.fillStyle = PAL.cream;
        for (let i = 1; i <= 6; i++) {
          ctx.fillText(T('controls_' + i), W / 2, 248 + (i - 1) * 36);
        }
      }

      const list = items();
      const y0 = page === 'controls' ? 470 : MAIN_Y0;
      list.forEach((it, i) => {
        const y = y0 + i * MAIN_STEP;
        const r = { x: W / 2 - 200, y: y - 30, w: 400, h: 42, index: i };
        rects.push(r);
        const isSel = i === sel;
        if (isSel) {
          ctx.fillStyle = 'rgba(107,46,62,0.7)';
          roundRect(ctx, r.x, r.y, r.w, r.h, 10);
          ctx.fill();
        }
        ctx.font = (isSel ? 'bold ' : '') + '26px ' + FONT;
        ctx.fillStyle = isSel ? PAL.amberLight : PAL.cream;
        ctx.fillText((isSel ? '› ' : '') + label(it.id) + (isSel ? ' ‹' : ''), W / 2, y);
      });
      ctx.restore();
    }
  };
  G.ui = G.ui || {};
  G.ui.MenuScene = MenuScene;

  // ---------- HUD (screen space) ----------
  function drawEye(ctx, cx, cy, a) {
    const hw = 22, hh = 12;
    ctx.beginPath();
    ctx.moveTo(cx - hw, cy);
    ctx.quadraticCurveTo(cx, cy - hh * 2, cx + hw, cy);
    ctx.quadraticCurveTo(cx, cy + hh * 2, cx - hw, cy);
    ctx.closePath();
    ctx.fillStyle = 'rgba(23,19,30,0.72)';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = a > 0.6 ? PAL.bordeauxLight : PAL.moon;
    ctx.beginPath();
    ctx.arc(cx, cy, 3 + a * 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fillStyle = PAL.ink;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - hw, cy);
    ctx.quadraticCurveTo(cx, cy - hh * 2, cx + hw, cy);
    ctx.quadraticCurveTo(cx, cy + hh * 2, cx - hw, cy);
    ctx.closePath();
    ctx.strokeStyle = PAL.moonDim;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  G.ui.drawHUD = function (ctx, opts) {
    opts = opts || {};
    ctx.save();
    ctx.textBaseline = 'middle';
    if (opts.levelName) {
      ctx.textAlign = 'left';
      ctx.font = '16px ' + FONT;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = PAL.cream;
      ctx.fillText(T(opts.levelName), 20, 26);
      ctx.shadowBlur = 0;
    }
    drawEye(ctx, W - 40, 30, clamp(opts.alert || 0, 0, 1));
    if (opts.hint) {
      const text = T(opts.hint);
      ctx.font = '18px ' + FONT;
      const pw = ctx.measureText(text).width + 32, ph = 34;
      const px = (W - pw) / 2, py = H - 22 - ph;
      ctx.fillStyle = 'rgba(23,19,30,0.72)';
      roundRect(ctx, px, py, pw, ph, 12);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = PAL.cream;
      ctx.fillText(text, W / 2, py + ph / 2 + 1);
    }
    ctx.restore();
  };

  // ---------- pause overlay ----------
  const PAUSE_RECTS_Y = [280, 350];
  const PauseOverlay = {
    sel: 0,
    active: false,   // pointer clicks count only while active (set by reset())
    _click: -1,
    _rects: [],
    _listening: false,

    // Call when the pause opens.
    reset() { this.sel = 0; this.active = true; this._click = -1; },

    _ensureListeners() {
      if (this._listening || !G.canvas) return;
      this._listening = true;
      G.canvas.addEventListener('pointerdown', (e) => {
        if (!PauseOverlay.active) return;
        const p = toLogical(e);
        const hit = PauseOverlay._rects.find((r) => inRect(p, r));
        if (hit) { PauseOverlay._click = hit.index; PauseOverlay.sel = hit.index; }
      });
      G.canvas.addEventListener('pointermove', (e) => {
        if (!PauseOverlay.active) return;
        const p = toLogical(e);
        const hit = PauseOverlay._rects.find((r) => inRect(p, r));
        if (hit) PauseOverlay.sel = hit.index;
      });
    },

    _finish(result) { this.active = false; this._click = -1; return result; },

    update(dt) {
      this._ensureListeners();
      if (G.input.pressed('pause') || G.input.pressed('back')) return this._finish('resume');
      if (G.input.pressed('up')) { this.sel = (this.sel + 1) % 2; sfx('ui_move'); }
      if (G.input.pressed('down')) { this.sel = (this.sel + 1) % 2; sfx('ui_move'); }
      let choice = -1;
      if (this._click >= 0) { choice = this._click; this._click = -1; }
      else if (G.input.pressed('confirm') || G.input.pressed('action')) choice = this.sel;
      if (choice === 0) { sfx('ui_ok'); return this._finish('resume'); }
      if (choice === 1) { sfx('ui_ok'); return this._finish('menu'); }
      return null;
    },

    draw(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(14,11,18,0.72)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 44px ' + FONT;
      ctx.fillStyle = PAL.cream;
      ctx.fillText(T('pause_title'), W / 2, 190);
      const keys = ['pause_resume', 'pause_menu'];
      this._rects = [];
      keys.forEach((k, i) => {
        const y = PAUSE_RECTS_Y[i];
        const r = { x: W / 2 - 170, y: y - 28, w: 340, h: 56, index: i };
        this._rects.push(r);
        const isSel = i === this.sel;
        if (isSel) {
          ctx.fillStyle = 'rgba(107,46,62,0.8)';
          roundRect(ctx, r.x, r.y, r.w, r.h, 10);
          ctx.fill();
        }
        ctx.font = (isSel ? 'bold ' : '') + '28px ' + FONT;
        ctx.fillStyle = isSel ? PAL.amberLight : PAL.cream;
        ctx.fillText((isSel ? '› ' : '') + T(k) + (isSel ? ' ‹' : ''), W / 2, y);
      });
      ctx.restore();
    }
  };
  G.ui.PauseOverlay = PauseOverlay;
})();
