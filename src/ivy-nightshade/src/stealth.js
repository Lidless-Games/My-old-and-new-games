(function () {
  const G = window.G;
  const CFG = G.CFG;
  const TILE = CFG.TILE;

  const HIDE_W = 1.6 * TILE, HIDE_H = 2.5 * TILE;
  const WALKER_W = 22, WALKER_H = 54;
  const SNORE_RANGE = 10 * TILE;

  function sfx(name, opts) { if (G.sfx && G.sfx.play) G.sfx.play(name, opts); }
  function nearBeatMult() {
    return (G.rhythm && G.rhythm.nearBeat && G.rhythm.nearBeat()) ? CFG.BEAT_BONUS : 1;
  }
  function beatSec() { return 60 / CFG.BPM; }

  class Stealth {
    constructor(world, player, level) {
      this.world = world; this.player = player; this.level = level;
      this.paused = false;
      this.sleepers = []; this.walkers = []; this.hides = [];
      const start = level.start || { tx: 1, ty: 1 };
      this.checkpoint = { x: (start.tx + 0.5) * TILE, y: (start.ty + 1) * TILE };
      this.hiddenIn = null;
      this.t = 0;
      (level.entities || []).forEach((e) => {
        const p = world.entPos(e);
        if (e.type === 'sleeper') {
          this.sleepers.push({
            x: p.x, y: p.y, who: e.who, radius: (e.radius || 5) * TILE,
            alert: 0, state: 'sleep', stirred: false, caught: false,
            snoreT: Math.random() * 3 * beatSec(),
          });
        } else if (e.type === 'walker') {
          const from = (e.from + 0.5) * TILE, to = (e.to + 0.5) * TILE;
          this.walkers.push({
            x: p.x, y: p.y, who: e.who || 'butler', from: Math.min(from, to), to: Math.max(from, to),
            speed: e.speed || 40, facing: to >= p.x ? 1 : -1, alert: 0, state: 'walk',
            startX: p.x, startFacing: to >= p.x ? 1 : -1, pause: 0, caught: false, stirred: false,
            slipT: Math.random() * 1.5,
          });
        } else if (e.type === 'hide') {
          this.hides.push({ x: p.x, y: p.y, kind: e.kind, occupied: false, w: HIDE_W, h: HIDE_H });
        }
      });
    }

    hideRect(h) { return { x: h.x - h.w / 2, y: h.y - h.h, w: h.w, h: h.h }; }
    walkerRect(w) { return { x: w.x - WALKER_W / 2, y: w.y - WALKER_H, w: WALKER_W, h: WALKER_H }; }
    playerHidden() { return this.player.state === 'hidden'; }

    nearestHide() {
      const pr = this.player.rect();
      for (const h of this.hides) if (G.util.overlap(pr, this.hideRect(h))) return h;
      return null;
    }

    maxAlert() {
      let m = 0;
      for (const s of this.sleepers) if (s.alert > m) m = s.alert;
      for (const w of this.walkers) if (w.alert > m) m = w.alert;
      return m;
    }

    resetAlerts() {
      for (const s of this.sleepers) { s.alert = 0; s.state = 'sleep'; s.stirred = false; s.caught = false; }
      for (const w of this.walkers) {
        w.alert = 0; w.state = 'walk'; w.x = w.startX; w.facing = w.startFacing; w.pause = 0;
        w.caught = false; w.stirred = false;
      }
      if (this.hiddenIn) { this.hiddenIn.occupied = false; this.hiddenIn = null; }
    }

    _unhide() {
      if (this.hiddenIn) this.hiddenIn.occupied = false;
      this.hiddenIn = null;
      if (this.player.state === 'hidden' && this.player.unhide) this.player.unhide();
    }

    _handleHide() {
      const p = this.player, inp = G.input;
      if (this.hiddenIn && p.state !== 'hidden') this.hiddenIn.occupied = false, this.hiddenIn = null;
      if (p.state === 'hidden') {
        if (inp.pressed('left') || inp.pressed('right') || inp.pressed('jump') || inp.pressed('up')) this._unhide();
        return;
      }
      if (p.control === false) return;
      if (!(inp.pressed('down') || inp.pressed('action')) || !p.onGround) return;
      const spot = this.nearestHide();
      if (!spot || spot.occupied) return;
      spot.occupied = true; this.hiddenIn = spot;
      p.hide(spot);
      p.setPos(spot.x, p.y);
      if (p.state !== 'hidden') p.state = 'hidden';
      G.events.emit('hide', { x: spot.x, y: spot.y });
      sfx('hide');
      if (spot.x !== this.checkpoint.x || spot.y !== this.checkpoint.y) {
        this.checkpoint = { x: spot.x, y: spot.y };
        G.events.emit('checkpoint', { x: spot.x, y: spot.y });
        sfx('checkpoint');
      }
    }

    // shared alert dynamics; returns true if just reached 1
    _alert(o, dist, radius, noise, hidden, dt) {
      if (o.state === 'awake') return false;
      if (!hidden && dist <= radius && noise > 0) {
        o.alert += noise * CFG.ALERT_GAIN * nearBeatMult() * G.util.clamp(1.15 - dist / radius, 0.2, 1.15) * dt;
      }
      o.alert -= CFG.ALERT_DECAY * dt; // always settles back when Ivy is quiet
      o.alert = G.util.clamp(o.alert, 0, 1);
      if (o.alert > CFG.STIR_AT) {
        if (!o.stirred) { o.stirred = true; G.events.emit('stir', { who: o.who, x: o.x, y: o.y }); sfx('stir'); }
        o.state = o.state === 'walk' ? 'walk' : 'stir';
      } else {
        if (o.alert < CFG.STIR_AT * 0.5) o.stirred = false;
        if (o.state === 'stir') o.state = 'sleep';
      }
      if (o.alert >= 1) { o.alert = 1; return true; }
      return false;
    }

    update(dt) {
      if (this.paused) return;
      this.t += dt;
      const p = this.player;
      this._handleHide();
      const hidden = this.playerHidden();
      const noise = hidden ? 0 : (p.noise || 0);
      const pcx = p.x, pcy = p.y - p.h / 2;

      // hard rules: near a sleeper Ivy may only sneak; touching a creaky board nearby wakes them at once
      const walking = !hidden && p.onGround && !p.crouched && !p.onLadder && Math.abs(p.vx) > CFG.SNEAK_SPEED * 1.3;
      const onCreak = !hidden && p.onGround && this.world.isCreaky(this.world.toTile(p.x), this.world.toTile(p.y + 1));
      if (onCreak && !this._creakSfx) { sfx('creak'); }
      this._creakSfx = onCreak;

      // sleepers
      for (const s of this.sleepers) {
        const d = G.util.dist(pcx, pcy, s.x, s.y - TILE * 0.8);
        if (!s.caught && s.state !== 'awake') {
          if (onCreak && d <= s.radius * CFG.CREAK_WAKE_MULT) s.alert = 1.5;
          else if (walking && d <= s.radius) s.alert += CFG.WALK_WAKE_RATE * dt;
        }
        if ((this._alert(s, d, s.radius, noise, hidden, dt) || (s.alert >= 1 && s.state !== 'awake')) && !s.caught) {
          s.state = 'awake'; s.caught = true;
          G.events.emit('caught', { by: 'sleeper', who: s.who, x: s.x, y: s.y });
        }
        // snoring: every ~3 beats, only when near
        s.snoreT -= dt;
        if (s.snoreT <= 0) {
          s.snoreT += 3 * beatSec();
          if (s.state !== 'awake' && d < SNORE_RANGE) {
            sfx('snore', { vol: G.util.clamp(1 - d / SNORE_RANGE, 0.1, 1) * 0.8 });
          }
        }
      }

      // walkers
      const pr = p.rect();
      for (const w of this.walkers) {
        if (w.state !== 'awake') {
          if (w.pause > 0) w.pause -= dt;
          else {
            w.x += w.facing * w.speed * dt;
            if (w.x >= w.to) { w.x = w.to; w.facing = -1; w.pause = 0.8; }
            else if (w.x <= w.from) { w.x = w.from; w.facing = 1; w.pause = 0.8; }
          }
          w.slipT -= dt;
          if (w.slipT <= 0) {
            w.slipT = G.util.rand(1.2, 2.2);
            const d = G.util.dist(pcx, pcy, w.x, w.y);
            if (d < SNORE_RANGE * 1.2 && w.pause <= 0) sfx('slippers', { vol: G.util.clamp(1 - d / (SNORE_RANGE * 1.2), 0.1, 1) });
          }
        }
        const d = G.util.dist(pcx, pcy, w.x, w.y - TILE * 0.8);
        const reached = this._alert(w, d, CFG.WALKER_HEAR_RADIUS * TILE, noise, hidden, dt);
        let hit = false;
        if (!hidden && !w.caught && G.util.overlap(pr, this.walkerRect(w))) hit = true;
        if ((reached || hit) && !w.caught) {
          w.caught = true; w.state = 'awake'; if (reached) w.alert = 1;
          G.events.emit('caught', { by: 'walker', who: w.who, x: w.x, y: w.y });
        }
      }
    }

    draw(ctx) {
      const art = G.art, t = G.time;
      for (const h of this.hides) {
        if (art && art.drawHideSpot) art.drawHideSpot(ctx, h.x, h.y, { kind: h.kind, occupied: h.occupied, t });
        else {
          ctx.fillStyle = h.occupied ? '#6b2e3e' : '#5a3b2e';
          ctx.fillRect(h.x - h.w / 2, h.y - h.h, h.w, h.h);
          if (h.occupied) { ctx.fillStyle = '#f2ece4'; ctx.fillRect(h.x - 8, h.y - h.h + 30, 4, 4); ctx.fillRect(h.x + 4, h.y - h.h + 30, 4, 4); }
        }
      }
      for (const s of this.sleepers) {
        if (art && art.drawSleeper) art.drawSleeper(ctx, s.x, s.y, { who: s.who, state: s.state, alert: s.alert, t });
        else {
          ctx.fillStyle = s.state === 'awake' ? '#a3203a' : s.state === 'stir' ? '#f3a03a' : '#3a3247';
          ctx.fillRect(s.x - 2 * TILE, s.y - TILE, 4 * TILE, TILE);
        }
        if (art && art.drawZzz) art.drawZzz(ctx, s.x, s.y - 2 * TILE, { t, alert: s.alert });
        else if (s.state !== 'awake') { ctx.fillStyle = '#c9cfe0'; ctx.font = '16px serif'; ctx.fillText('Zzz', s.x, s.y - 1.5 * TILE - s.alert * 10); }
      }
      for (const w of this.walkers) {
        if (art && art.drawWalker) art.drawWalker(ctx, w.x, w.y, { who: w.who, facing: w.facing, t, alert: w.alert });
        else {
          ctx.fillStyle = '#efe6d0';
          ctx.fillRect(w.x - WALKER_W / 2, w.y - WALKER_H, WALKER_W, WALKER_H);
          ctx.fillStyle = '#a3203a'; ctx.fillRect(w.x + w.facing * 8 - 3, w.y - WALKER_H + 12, 6, 4);
        }
        if (w.alert > 0.8 && art && art.drawZzz) art.drawZzz(ctx, w.x, w.y - WALKER_H - 10, { t, alert: w.alert });
      }
    }
  }

  G.Stealth = Stealth;
})();
