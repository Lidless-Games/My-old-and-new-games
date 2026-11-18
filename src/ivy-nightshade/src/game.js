(function () {
  const G = window.G;
  const CFG = G.CFG, T = CFG.TILE;
  const U = G.util;
  const t = (k, v) => (G.t ? G.t(k, v) : k);
  const sfx = (n, o) => { if (G.sfx) G.sfx.play(n, o); };

  function screenText(ctx, lines, y0, size, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = CFG.PAL.cream; ctx.textAlign = 'center';
    ctx.font = size + 'px Georgia, serif';
    lines.forEach((l, i) => ctx.fillText(l, CFG.VIEW_W / 2, y0 + i * size * 1.5));
    ctx.restore();
  }

  // ---------------- Story (opening) ----------------
  class StoryScene {
    constructor(onDone) { this.onDone = onDone; this.page = 0; this.tt = 0; }
    enter() { if (G.rhythm) G.rhythm.startMusic('menu'); }
    update(dt) {
      this.tt += dt;
      if (this.tt > 0.4 && (G.input.pressed('confirm') || G.input.pressed('action') || G.input.pressed('jump'))) {
        sfx('ui_ok'); this.page++; this.tt = 0;
        if (this.page >= 5) this.onDone();
      }
      if (G.input.pressed('back')) this.onDone();
    }
    draw(ctx) {
      const cam = { x: 0, y: 0 };
      if (G.art) G.art.drawBackground(ctx, cam, 'bedroom', G.time);
      const floorY = 430;
      ctx.fillStyle = CFG.PAL.woodDark; ctx.fillRect(0, floorY, CFG.VIEW_W, CFG.VIEW_H - floorY);
      if (G.art) {
        G.art.drawDeco(ctx, 230, floorY, { kind: 'bed_ivy', t: G.time });
        G.art.drawDeco(ctx, 650, floorY, { kind: 'perch', t: G.time });
        G.art.drawDeco(ctx, 480, floorY - 150, { kind: 'window', t: G.time });
        G.art.drawIvy(ctx, 560, floorY, { state: 'idle', facing: 1, t: G.time, speed: 0 });
        if (this.page < 5) G.art.drawBubble(ctx, 560, floorY - 58, t('story_' + (this.page + 1)), { who: 'ivy' });
        G.art.drawLight(ctx, 566, floorY - 40, G.time, 0.55);
      }
      screenText(ctx, [t('press_any')], 515, 14, 0.5 + 0.3 * Math.sin(G.time * 3));
    }
  }

  // ---------------- End of M1 ----------------
  class EndScene {
    constructor() { this.tt = 0; }
    enter() { sfx('win'); }
    update(dt) {
      this.tt += dt;
      if (this.tt > 1.5 && (G.input.pressed('confirm') || G.input.pressed('action') || G.input.pressed('back'))) G.scenes.set(G.ui.MenuScene);
    }
    draw(ctx) {
      if (G.art) G.art.drawBackground(ctx, { x: 0, y: 0 }, 'hall', G.time);
      const floorY = 440;
      ctx.fillStyle = CFG.PAL.stoneDark; ctx.fillRect(0, floorY, CFG.VIEW_W, 100);
      if (G.art) {
        G.art.drawDeco(ctx, 620, floorY, { kind: 'stairs_down', t: G.time });
        G.art.drawIvy(ctx, 520, floorY, { state: 'idle', facing: 1, t: G.time, speed: 0 });
        G.art.drawLight(ctx, 526, floorY - 40, G.time, 0.6);
      }
      const a = U.clamp(this.tt / 1.5, 0, 1);
      screenText(ctx, [t('m1_end_1')], 120, 22, a);
      screenText(ctx, [t('m1_end_2')], 175, 30, U.clamp((this.tt - 1.5) / 1.2, 0, 1));
      if (this.tt > 2.5) screenText(ctx, [t('m1_end_3')], 515, 14, 0.5 + 0.3 * Math.sin(G.time * 3));
    }
  }

  // ---------------- Play ----------------
  class PlayScene {
    constructor(index) { this.index = index; this.level = G.LEVELS[index]; }
    enter() {
      G.events.clear();
      const L = this.level;
      this.world = new G.World(L);
      const sp = this.world.entPos(L.start);
      this.player = new G.Player(this.world, sp.x, sp.y);
      this.stealth = new G.Stealth(this.world, this.player, L);
      this.traps = new G.Traps(this.world, this.player, L);
      this.ghosts = G.Ghosts ? new G.Ghosts(this.world, this.player, L) : null;
      this.deco = (L.entities || []).filter((e) => e.type === 'deco').map((e) => {
        const p = this.world.entPos(e);
        if (e.kind === 'cobweb') { p.x = e.tx * T; p.y = e.ty * T; }
        return { kind: e.kind, x: p.x, y: p.y };
      });
      const ex = this.world.entPos(L.exit);
      this.door = { x: ex.x, y: ex.y, rect: { x: ex.x - T * 0.6, y: ex.y - T * 2.2, w: T * 1.2, h: T * 2.2 } };
      this.mode = 'intro'; this.tt = 0; this.levelT = 0; this.playStart = null; this.bubbles = []; this.toast = null; this.paused = null;
      this.elapsed = 0;
      this.player.control = false;
      G.events.on('caught', (d) => this.beginCaught(d));
      G.events.on('checkpoint', (d) => { this.toast = { text: t('checkpoint'), tt: 2 }; this.trail = [{ x: d.x, y: d.y, st: 'idle' }]; });
      this.trail = [{ x: sp.x, y: sp.y, st: 'idle' }];
      G.camera.x = U.clamp(sp.x - CFG.VIEW_W / 2, 0, Math.max(0, this.world.wpx - CFG.VIEW_W));
      G.camera.y = U.clamp(sp.y - CFG.VIEW_H * 0.6, 0, Math.max(0, this.world.hpx - CFG.VIEW_H));
      if (G.rhythm) G.rhythm.startMusic('castle');
      window.__game = this;
    }
    say(x, y, text, who, dur) { this.bubbles = [{ x, y, text, who, tt: dur || 2.5 }]; }

    // Caught sequence: npc line -> Ivy falls flat -> spider descends -> drags her to the checkpoint
    // -> spider climbs away while Ivy gets up, bored -> one deadpan line, play resumes.
    beginCaught(d) {
      if (this.mode !== 'play') return;
      this.caughtCount = (this.caughtCount || 0) + 1;
      this.mode = 'caught'; this.tt = 0;
      this.stealth.paused = true; this.traps.paused = d.by !== 'trap'; if (this.ghosts) this.ghosts.paused = true;
      const p = this.player;
      p.control = false;
      sfx('caught');
      const isTrap = d.by === 'trap';
      if (!isTrap) {
        sfx('wake'); setTimeout(() => sfx('door'), 450); setTimeout(() => sfx('slippers'), 800);
        this.say(d.x, d.y - 70, t('caught_' + (d.by === 'walker' ? (d.who || 'butler') : d.who)), 'npc', CFG.CAUGHT_FREEZE);
      } else this.bubbles = [];
      const cp = this.stealth.checkpoint;
      const dir = cp.x >= p.x ? 1 : -1;
      const dist = Math.abs(cp.x - p.x) + Math.abs(cp.y - p.y);
      // trap = "death": lie down, spider drags her back. Spotted = just run back to the hiding spot.
      this.cs = {
        kind: isTrap ? 'death' : 'run',
        line: isTrap ? t('caught_trap_' + d.kind) : t('ivy_caught_' + U.randInt(1, 8)),
        t1: isTrap ? 0.35 : CFG.CAUGHT_FREEZE,            // end of npc phase
        from: { x: p.x, y: p.y }, cp: { x: cp.x, y: cp.y }, dir,
      };
      this.buildPath(this.cs, p, cp);
      this.cs.drag = U.clamp(this.cs.len / CFG.DRAG_SPEED, 1.2, CFG.DRAG_MAX);
      this.cs.run = U.clamp(this.cs.len / CFG.RUN_BACK_SPEED, 1.2, 8);
      const c = this.cs;
      if (c.kind === 'run') { c.t4 = c.t1 + c.run; c.t5 = c.t4; }
      else {
        c.t2 = c.t1 + CFG.CAUGHT_FALL;          // fallen
        c.t3 = c.t2 + CFG.SPIDER_DESCEND;       // spider arrived
        c.t4 = c.t3 + c.drag;                   // dragged to checkpoint
        c.t5 = c.t4 + CFG.GETUP_TIME;           // up again
      }
      c.ivy = { x: p.x, y: p.y, state: 'frozen', k: 0, drag: false, facing: p.facing };
      c.spider = null;
    }

    updateCaught(dt) {
      this.tt += dt;
      const p = this.player, c = this.cs, tt = this.tt, ivy = c.ivy;
      const headX = () => ivy.x + c.dir * 24;
      if (!this.traps.paused) { // after a trap death the trap finishes its move, then switches off
        if (tt < CFG.TRAP_OFF_DELAY) this.traps.update(dt); else this.traps.paused = true;
      }
      if (tt < c.t1) { ivy.state = 'frozen'; p.state = 'frozen'; return; }
      if (c.kind === 'run' && tt < c.t4) { // comic dash back to the hiding spot
        if (!c.dragStarted) { c.dragStarted = true; sfx('whoosh'); this.toast = { text: t('run_back'), tt: c.run }; }
        const k = (tt - c.t1) / c.run, e = k * k * (3 - 2 * k);
        const q = this.samplePath(c, e * c.len);
        const air = q.st === 'jump' || q.st === 'fall', climb = q.st === 'climb';
        ivy.x = q.x; ivy.y = q.y - (air || climb || q.st === 'sneak' ? 0 : Math.abs(Math.sin(tt * 9)) * 6);
        ivy.state = climb ? 'climb' : q.st === 'sneak' ? 'sneak' : q.st === 'jump' ? 'fall' : q.st === 'fall' ? 'jump' : 'walk';
        if (q.dir) ivy.facing = q.dir;
        p.setPos(ivy.x, ivy.y); p.facing = ivy.facing; p.state = ivy.state;
        if (p.t !== undefined) p.t += dt * 2.5;
        return;
      }
      if (tt < c.t2) {
        if (ivy.state !== 'down') { sfx('land'); ivy.state = 'down'; ivy.facing = -c.dir; }
        return;
      }
      if (tt < c.t3) { // spider descends on its thread from above the screen to Ivy's head
        const k = U.easeOutCubic((tt - c.t2) / (c.t3 - c.t2));
        const top = G.camera.y - 20;
        c.spider = { x: headX() + c.dir * 10, y: U.lerp(top, ivy.y - 10, k), mode: 'hang', anchorY: top };
        return;
      }
      if (tt < c.t4) { // drag along the floor
        if (!c.dragStarted) { c.dragStarted = true; sfx('whoosh', { vol: 0.5 }); this.toast = { text: t('run_back'), tt: c.drag }; }
        const k = (tt - c.t3) / (c.t4 - c.t3);
        const e = k * k * (3 - 2 * k);
        const q = this.samplePath(c, e * c.len);
        ivy.x = q.x; ivy.y = q.y;
        if (q.dir) { c.dir = q.dir; ivy.facing = -q.dir; }
        ivy.drag = true;
        c.spider = { x: headX() + c.dir * 30, y: ivy.y - 7, mode: 'pull', anchorY: null };
        p.setPos(ivy.x, ivy.y);
        return;
      }
      if (!c.arrived) {
        c.arrived = true; ivy.drag = false; ivy.x = c.cp.x; ivy.y = c.cp.y; p.setPos(c.cp.x, c.cp.y);
        this.stealth.resetAlerts(); if (this.traps.reset) this.traps.reset(); if (this.ghosts && this.ghosts.reset) this.ghosts.reset();
        sfx('checkpoint', { vol: 0.5 });
      }
      if (c.kind === 'death' && tt < c.t5) { // spider climbs up and away, Ivy gets up slowly
        const k = (tt - c.t4) / (c.t5 - c.t4);
        ivy.state = 'getup'; ivy.k = U.clamp(k * 1.15, 0, 1);
        const top = G.camera.y - 30;
        c.spider = { x: headX() + c.dir * 18, y: U.lerp(ivy.y - 8, top, U.easeOutCubic(k)), mode: 'hang', anchorY: top, climbing: true };
        return;
      }
      // done
      c.spider = null;
      p.facing = ivy.facing || p.facing;
      p.state = 'idle'; p.control = true;
      this.stealth.paused = false; this.traps.paused = false; if (this.ghosts) this.ghosts.paused = false;
      this.mode = 'play';
      this.say(p.x, p.y - 56, c.line, 'ivy', 2.6);
      this.cs = null;
    }

    // first ghost in sight: Ivy reminds the player that ghosts can't see her while she stands still
    ghostTip(p) {
      if (G.game._ghostTipDone || this.mode !== 'play' || !this.ghosts || !this.ghosts.ghosts) return;
      if (this.ghosts.ghosts.some((g) => Math.abs(g.x - p.x) < ((g.view || 6) + 4) * T && Math.abs(g.y - p.y) < 3 * T)) {
        G.game._ghostTipDone = true;
        this.say(p.x, p.y - 56, t('ivy_ghost_tip'), 'ivy', 4.5); this.bubbles[0].follow = true;
      }
    }

    // path back to the checkpoint = breadcrumb trail reversed (falls back to a straight line)
    buildPath(c, p, cp) {
      const raw = [{ x: p.x, y: p.y, st: 'walk' }].concat(this.trail.slice().reverse());
      // remove loops: whenever the route passes a spot it also passes later (closer to the checkpoint), skip ahead
      const CELL = 18, key = (q) => Math.floor(q.x / CELL) + ',' + Math.floor(q.y / CELL), lastIdx = new Map();
      raw.forEach((q, i) => lastIdx.set(key(q), i));
      const pts = []; let i = 0;
      while (i < raw.length) {
        pts.push(raw[i]);
        const cx = Math.floor(raw[i].x / CELL), cy = Math.floor(raw[i].y / CELL);
        let j = i;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const v = lastIdx.get((cx + dx) + ',' + (cy + dy)); if (v > j) j = v; }
        i = j > i ? j : i + 1;
      }
      const last = pts[pts.length - 1];
      if (Math.abs(last.x - cp.x) + Math.abs(last.y - cp.y) > 8) pts.push({ x: cp.x, y: cp.y, st: 'walk' });
      if (c.kind === 'death') { // the spider drags her along the floor: ignore jump arcs
        const air = (q) => q.st === 'jump' || q.st === 'fall';
        for (let a = 0; a < pts.length; a++) {
          if (!air(pts[a])) continue;
          let b = a; while (b < pts.length && air(pts[b])) b++;
          const y0 = a > 0 ? pts[a - 1].y : pts[a].y, y1 = b < pts.length ? pts[b].y : y0;
          const x0 = a > 0 ? pts[a - 1].x : pts[a].x, x1 = b < pts.length ? pts[b].x : x0;
          for (let k = a; k < b; k++) {
            const f = Math.abs(x1 - x0) > 1 ? (pts[k].x - x0) / (x1 - x0) : (k - a + 1) / (b - a + 1);
            pts[k] = { x: pts[k].x, y: U.lerp(y0, y1, U.clamp(f, 0, 1)), st: 'walk' };
          }
          a = b;
        }
      }
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      c.path = pts; c.cum = cum; c.len = Math.max(1, cum[cum.length - 1]); c.seg = 1;
    }
    samplePath(c, s) {
      const P = c.path, C = c.cum;
      while (c.seg < P.length - 1 && C[c.seg] < s) c.seg++;
      const i = c.seg, a = P[i - 1], b = P[i];
      const k = C[i] > C[i - 1] ? U.clamp((s - C[i - 1]) / (C[i] - C[i - 1]), 0, 1) : 1;
      // look a little ahead for a stable facing
      let dir = 0;
      for (let j = i; j < Math.min(P.length, i + 6); j++) { const dx = P[j].x - P[i - 1].x; if (Math.abs(dx) > 2) { dir = Math.sign(dx); break; } }
      return { x: U.lerp(a.x, b.x, k), y: U.lerp(a.y, b.y, k), st: b.st, dir };
    }

    drawCreakMarks(ctx, cam) { // make creaky boards readable: lighter warped planks + little creak lines
      const w = this.world;
      if (!this._creaks) {
        this._creaks = [];
        for (let y = 0; y < w.rows; y++) for (let x = 0; x < w.cols; x++) if (w.isCreaky(x, y)) this._creaks.push([x, y]);
      }
      ctx.save();
      for (const [x, y] of this._creaks) {
        const px = x * T, py = y * T;
        if (px < cam.x - T || px > cam.x + CFG.VIEW_W) continue;
        ctx.fillStyle = 'rgba(247,200,115,0.32)'; ctx.fillRect(px + 1, py, T - 2, 9);
        ctx.strokeStyle = 'rgba(247,200,115,0.95)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        const wob = Math.sin(G.time * 3 + x) * 1.5;
        ctx.beginPath();
        ctx.moveTo(px + 6, py - 4 + wob); ctx.lineTo(px + 11, py - 12 + wob);
        ctx.moveTo(px + 18, py - 5 - wob); ctx.lineTo(px + 18, py - 14 - wob);
        ctx.moveTo(px + 30, py - 4 + wob); ctx.lineTo(px + 25, py - 12 + wob);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawCaught(ctx) {
      const c = this.cs; if (!c) return false;
      const ivy = c.ivy, A = G.art;
      if (ivy.state === 'frozen' || c.kind === 'run') return false; // normal player draw
      const opts = { state: ivy.state, facing: ivy.facing, t: G.time, speed: 0, k: ivy.k, drag: ivy.drag };
      A.drawIvy(ctx, ivy.x, ivy.y, opts);
      const s = c.spider;
      if (s && A.drawSpider) {
        if (s.mode === 'pull') A.drawThread(ctx, s.x, s.y, ivy.x + c.dir * 24, ivy.y - 6, { t: G.time, taut: true });
        else if (s.anchorY != null) A.drawThread(ctx, s.x, s.anchorY, s.x, s.y - 6, { t: G.time, taut: true });
        A.drawSpider(ctx, s.x, s.y, { t: G.time, mode: s.mode, facing: c.dir, scale: 1.7 });
      }
      return true;
    }


    update(dt) {
      if (this.paused) {
        const r = this.paused.update(dt);
        if (r === 'resume') this.paused = null;
        else if (r === 'menu') { this.paused = null; G.scenes.set(G.ui.MenuScene); }
        return;
      }
      if (G.input.pressed('pause') && this.mode === 'play' && G.ui.PauseOverlay) {
        this.paused = (typeof G.ui.PauseOverlay === 'function') ? new G.ui.PauseOverlay() : G.ui.PauseOverlay;
        if (this.paused.enter) this.paused.enter();
        if (this.paused.reset) this.paused.reset();
        return;
      }
      this.tt += dt; this.levelT += dt;
      const p = this.player;
      this.bubbles.forEach((b) => { if (b.follow) { b.x = p.x; b.y = p.y - 56; } });
      this.ghostTip(p);
      if (this.playStart != null && !this._introSaid && this.levelT > this.playStart + 0.45) { // Ivy's opening line, after the title card
        this._introSaid = true;
        this.say(p.x, p.y - 56, t(this.level.introKey), 'ivy', 5); this.bubbles[0].follow = true;
      }
      if (this.mode === 'intro') {
        p.update(dt);
        if (this.tt > 2.2 || (this.tt > 0.6 && G.input.anyPressed())) { this.mode = 'play'; p.control = true; this.playStart = this.levelT; }
      } else if (this.mode === 'play') {
        this.elapsed += dt;
        p.update(dt);
        if (p.state !== 'hidden') { // breadcrumb trail since the last hiding spot: run-backs retrace it
          const last = this.trail[this.trail.length - 1];
          if (Math.abs(last.x - p.x) + Math.abs(last.y - p.y) > 5) { this.trail.push({ x: p.x, y: p.y, st: p.onLadder ? 'climb' : (p.crouched ? 'sneak' : p.state) }); if (this.trail.length > 6000) this.trail.splice(1, 1000); }
        }
        this.stealth.update(dt);
        this.traps.update(dt);
        if (this.ghosts) this.ghosts.update(dt);
        if (p.y > this.world.hpx + 200) this.beginCaught({ by: 'trap', kind: 'chandelier', x: p.x, y: p.y });
        if (p.state !== 'hidden' && U.overlap(p.rect(), this.door.rect)) {
          this.mode = 'done'; this.tt = 0; p.control = false; sfx('win');
          G.save.set('progress', Math.max(G.save.get('progress', 0), Math.min(this.index + 1, G.LEVELS.length - 1)));
        }
      } else if (this.mode === 'caught') {
        this.updateCaught(dt);
      } else if (this.mode === 'done') {
        p.update(dt);
        if (this.tt > 2.0) G.game.nextLevel(this.index);
      }
      this.stealthTick = (this.stealthTick || 0) + dt;
      this.bubbles.forEach((b) => (b.tt -= dt)); this.bubbles = this.bubbles.filter((b) => b.tt > 0);
      if (this.toast) { this.toast.tt -= dt; if (this.toast.tt <= 0) this.toast = null; }
      this.updateCamera(dt);
    }

    updateCamera(dt) {
      const p = this.player, cam = G.camera;
      const tx = U.clamp(p.x - CFG.VIEW_W / 2 + p.facing * 60, 0, Math.max(0, this.world.wpx - CFG.VIEW_W));
      const ty = U.clamp(p.y - CFG.VIEW_H * 0.62, 0, Math.max(0, this.world.hpx - CFG.VIEW_H));
      const k = this.mode === 'caught' ? 6 : 5;
      cam.x += (tx - cam.x) * Math.min(1, k * dt);
      cam.y += (ty - cam.y) * Math.min(1, k * dt);
    }

    hint() {
      const p = this.player;
      if (this.mode !== 'play') return '';
      if (p.state === 'hidden') return t('hint_unhide');
      if (this.stealth.nearestHide()) return t('hint_hide');
      if (U.dist(p.x, p.y, this.door.x, this.door.y) < T * 3) return t('hint_exit');
      const w = this.world, fy = w.toTile(p.y + 1);
      for (let k = 0; k <= 3; k++) if (w.isCreaky(w.toTile(p.x + p.facing * k * T), fy)) return t('hint_creak');
      if (this.ghosts && this.ghosts.ghosts && !p.faded && this.ghosts.ghosts.some((g) => Math.abs(g.x - p.x) < ((g.view || 6) + 2) * T && Math.abs(g.y - p.y) < 2 * T && (p.x - g.x) * g.facing > 0)) return t('hint_ghost');
      if (!p.crouched && this.traps.traps && this.traps.traps.some((tr) => tr.kind === 'chandelier' && (tr.x - p.x) * p.facing > -T && Math.abs(tr.x - p.x) < 5 * T && tr.y < p.y)) return t('hint_chandelier');
      if (!p.crouched && this.stealth.sleepers.some((s) => U.dist(p.x, p.y, s.x, s.y) < s.radius * 1.5)) return t('hint_sleeper');
      if (this.index === 0 && this.elapsed < 7) return t('hint_sneak');
      return '';
    }

    draw(ctx) {
      const cam = { x: Math.round(G.camera.x), y: Math.round(G.camera.y) };
      const theme = this.level.theme;
      G.art.drawBackground(ctx, cam, theme, G.time);
      ctx.save();
      ctx.translate(-cam.x, -cam.y);
      G.art.drawTiles(ctx, this.world, cam, theme);
      this.drawCreakMarks(ctx, cam);
      this.deco.forEach((d) => {
        if (d.x < cam.x - 300 || d.x > cam.x + CFG.VIEW_W + 300) return;
        G.art.drawDeco(ctx, d.x, d.y, { kind: d.kind, t: G.time });
      });
      G.art.drawDeco(ctx, this.door.x, this.door.y, { kind: 'stairs_down', t: G.time });
      this.traps.draw(ctx);
      this.stealth.draw(ctx);
      if (this.ghosts) this.ghosts.draw(ctx);
      if (!(this.mode === 'caught' && this.drawCaught(ctx)) && this.player.state !== 'hidden') this.player.draw(ctx);
      ctx.restore();
      const p = this.player;
      const strength = { bedroom: 0.72, greenhouse: 0.6, lab: 0.68, hall: 0.7 }[theme] ?? 0.7;
      G.art.drawLight(ctx, p.x - cam.x, p.y - 40 - cam.y, G.time, p.state === 'hidden' ? strength + 0.1 : strength);
      // bubbles above the light
      ctx.save(); ctx.translate(-cam.x, -cam.y);
      this.bubbles.forEach((b) => G.art.drawBubble(ctx, b.x, b.y, b.text, { who: b.who }));
      ctx.restore();
      G.ui.drawHUD(ctx, { alert: this.stealth.maxAlert(), hint: this.hint(), levelName: t(this.level.nameKey) });
      if (this.toast) screenText(ctx, [this.toast.text], 90, 18, U.clamp(this.toast.tt * 2, 0, 1));
      const cardEnd = this.playStart == null ? 99 : this.playStart + 0.4; // the title card fades once play starts
      if ((this.mode === 'intro' || this.mode === 'play') && this.levelT < cardEnd) {
        const a = Math.min(U.clamp(this.levelT * 3, 0, 1), this.playStart == null ? 1 : U.clamp((cardEnd - this.levelT) / 0.4, 0, 1));
        if (a > 0) G.art.drawCard(ctx, t(this.level.nameKey), '', a);
      }
      if (this.mode === 'done') G.art.drawCard(ctx, t('level_done'), t(this.level.nameKey), U.clamp(this.tt * 2, 0, 1));
      if (this.paused) this.paused.draw(ctx);
    }
  }

  G.game = {
    PlayScene, StoryScene, EndScene,
    start(i, opts) {
      i = U.clamp(i | 0, 0, G.LEVELS.length - 1);
      const go = () => G.scenes.set(new PlayScene(i));
      if (i === 0 && !(opts && opts.skipStory)) G.scenes.set(new StoryScene(go));
      else go();
    },
    nextLevel(i) {
      if (i + 1 < G.LEVELS.length) G.scenes.set(new PlayScene(i + 1));
      else G.scenes.set(new EndScene());
    },
  };
})();
