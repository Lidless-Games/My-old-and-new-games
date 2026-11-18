(function () {
  const G = window.G;
  const CFG = G.CFG;

  // ---------- util ----------
  G.util = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    choice: (arr) => arr[Math.floor(Math.random() * arr.length)],
    overlap: (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y,
    dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  };

  // ---------- events ----------
  const handlers = {};
  G.events = {
    on(n, fn) { (handlers[n] = handlers[n] || []).push(fn); },
    off(n, fn) { if (handlers[n]) handlers[n] = handlers[n].filter((f) => f !== fn); },
    emit(n, d) { (handlers[n] || []).slice().forEach((fn) => { try { fn(d); } catch (e) { console.error(e); } }); },
    clear() { for (const k in handlers) delete handlers[k]; },
  };

  // ---------- save ----------
  G.save = {
    get(k, def) { try { const v = localStorage.getItem('ivy_' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem('ivy_' + k, JSON.stringify(v)); } catch (e) {} },
  };

  // ---------- input ----------
  const KEYMAP = {
    ArrowLeft: ['left'], KeyA: ['left'], ArrowRight: ['right'], KeyD: ['right'],
    ArrowUp: ['up', 'jump'], KeyW: ['up', 'jump'], ArrowDown: ['down'], KeyS: ['down'],
    Space: ['jump', 'confirm'], ShiftLeft: ['sneak'], ShiftRight: ['sneak'],
    KeyE: ['action'], Enter: ['action', 'confirm'], NumpadEnter: ['action', 'confirm'],
    Escape: ['pause', 'back'], KeyP: ['pause'], Backspace: ['back'],
  };
  const held = {}, prevHeld = {}, keyCount = {};
  let anyPress = false, anyPressFrame = false;
  const virtual = {}; // mobile buttons set virtual[action] = true/false
  function setKey(code, on) {
    const acts = KEYMAP[code]; if (!acts) return false;
    acts.forEach((a) => { keyCount[a] = (keyCount[a] || 0) + (on ? 1 : -1); if (keyCount[a] < 0) keyCount[a] = 0; });
    return true;
  }
  const physical = {};
  window.addEventListener('keydown', (e) => {
    if (e.repeat) { if (KEYMAP[e.code]) e.preventDefault(); return; }
    if (!physical[e.code]) { physical[e.code] = true; if (setKey(e.code, true)) e.preventDefault(); }
    anyPress = true;
    if (G.rhythm && G.rhythm.unlock) G.rhythm.unlock();
  });
  window.addEventListener('keyup', (e) => { if (physical[e.code]) { physical[e.code] = false; setKey(e.code, false); } });
  window.addEventListener('blur', () => { for (const k in physical) physical[k] = false; for (const a in keyCount) keyCount[a] = 0; });
  ['pointerdown', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => { anyPress = true; if (G.rhythm && G.rhythm.unlock) G.rhythm.unlock(); }, { passive: true }));

  const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'sneak', 'action', 'pause', 'confirm', 'back'];
  G.input = {
    virtual,
    down: (a) => !!held[a],
    pressed: (a) => !!held[a] && !prevHeld[a],
    released: (a) => !held[a] && !!prevHeld[a],
    anyPressed: () => anyPressFrame,
    _tick() { // called once per fixed update, before scene update
      ACTIONS.forEach((a) => { prevHeld[a] = held[a]; held[a] = (keyCount[a] || 0) > 0 || !!virtual[a]; });
      anyPressFrame = anyPress; anyPress = false;
    },
  };

  // ---------- world ----------
  class World {
    constructor(level) {
      this.level = level;
      this.grid = level.grid.map((r) => r.replace(/\./g, ' '));
      this.rows = this.grid.length;
      this.cols = Math.max(...this.grid.map((r) => r.length));
      this.wpx = this.cols * CFG.TILE; this.hpx = this.rows * CFG.TILE;
      this.creak = new Set();
      (level.entities || []).forEach((e) => {
        if (e.type === 'creak') for (let i = 0; i < (e.len || 1); i++) this.creak.add((e.tx + i) + ',' + e.ty);
      });
    }
    tile(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return '#';
      return this.grid[ty][tx] || ' ';
    }
    isSolid(tx, ty) { const c = this.tile(tx, ty); return c === '#' || c === '=' || c === '~'; }
    isOneWay(tx, ty) { return this.tile(tx, ty) === '-'; }
    isLadder(tx, ty) { return this.tile(tx, ty) === 'H'; }
    isCreaky(tx, ty) { return this.tile(tx, ty) === '~' || this.creak.has(tx + ',' + ty); }
    toTile(px) { return Math.floor(px / CFG.TILE); }
    entPos(e) { return { x: (e.tx + 0.5) * CFG.TILE, y: (e.ty + 1) * CFG.TILE }; }
  }
  G.World = World;

  // ---------- scenes ----------
  G.scenes = {
    current: null,
    set(s) { if (this.current && typeof this.current.exit === 'function') this.current.exit(); this.current = s; if (s && s.enter) s.enter(); },
  };
  G.camera = { x: 0, y: 0 };
  G.time = 0; G.dt = 1 / 60;

  // ---------- canvas & loop ----------
  G.initCanvas = function () {
    const c = document.getElementById('game');
    G.canvas = c; G.ctx = c.getContext('2d');
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const s = Math.min(window.innerWidth / CFG.VIEW_W, window.innerHeight / CFG.VIEW_H);
      c.style.width = Math.floor(CFG.VIEW_W * s) + 'px';
      c.style.height = Math.floor(CFG.VIEW_H * s) + 'px';
      c.width = Math.floor(CFG.VIEW_W * s * dpr); c.height = Math.floor(CFG.VIEW_H * s * dpr);
      G.scale = (c.width / CFG.VIEW_W);
    }
    window.addEventListener('resize', resize); resize();
  };
  G.startLoop = function () {
    let last = performance.now(), acc = 0;
    function frame(now) {
      acc += Math.min(0.1, (now - last) / 1000); last = now;
      while (acc >= G.dt) {
        G.input._tick();
        G.time += G.dt;
        if (G.scenes.current) G.scenes.current.update(G.dt);
        acc -= G.dt;
      }
      const ctx = G.ctx;
      ctx.setTransform(G.scale, 0, 0, G.scale, 0, 0);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
      if (G.scenes.current) { ctx.save(); G.scenes.current.draw(ctx); ctx.restore(); }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };
})();
