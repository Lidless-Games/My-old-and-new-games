(function () {
  const G = window.G;
  const CFG = G.CFG;
  const T = CFG.TILE;
  const EPS = 1e-4;

  const COYOTE = 0.1, JUMP_BUF = 0.1;
  const STRIDE_WALK = 0.32, STRIDE_SNEAK = 0.5;
  const CUT_V = 0.35;           // jump cut factor (fraction of JUMP_V kept when released early)
  const LAND_MIN_SPEED = 150;   // below this impact speed no 'land' event/noise
  const GROUND_ACCEL = 2600, GROUND_DECEL = 3200, AIR_ACCEL = 1600;

  function approach(v, target, d) {
    if (v < target) return Math.min(target, v + d);
    if (v > target) return Math.max(target, v - d);
    return v;
  }

  class Player {
    constructor(world, x, y) {
      this.world = world;
      this.w = 18; this.h = 50; this.crouched = false;
      this.x = x; this.y = y;
      this.vx = 0; this.vy = 0;
      this.facing = 1;
      this.onGround = false; this.onLadder = false;
      this.state = 'idle';
      this.noise = 0;
      this.control = true;
      this.t = 0;
      this.speed = 0;
      this.hiddenIn = null;
      this._coyote = 0; this._buf = 0; this._drop = 0; this._grabCd = 0;
      this._jumping = false;
      this._stride = STRIDE_WALK * 0.6;
      this._ladCol = 0;
      this._impact = 0;
      this.stillTime = 0; this.faded = false; this.fadeAlpha = 1;
    }

    rect() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }

    setPos(x, y) {
      this.x = x; this.y = y; this.vx = 0; this.vy = 0;
      this.onLadder = false; this.onGround = false;
      this._coyote = 0; this._buf = 0; this._drop = 0; this._jumping = false;
      this.noise = 0;
      if (this.state !== 'hidden') this.state = 'idle';
    }

    hide(spot) {
      this.state = 'hidden'; this.hiddenIn = spot || null;
      if (spot && typeof spot.x === 'number') this.x = spot.x;
      this.vx = 0; this.vy = 0; this.noise = 0; this.onLadder = false; this._jumping = false;
    }

    unhide() {
      if (this.state !== 'hidden') return;
      this.hiddenIn = null; this.state = 'idle'; this.vx = 0; this.vy = 0; this._buf = 0;
      this.stillTime = 0; this.faded = false; this.fadeAlpha = 1;
    }

    // ---------- tile helpers ----------
    _ladderish(c, r) {
      const w = this.world;
      return w.isLadder(c, r) || (w.isOneWay(c, r) && w.isLadder(c, r + 1));
    }
    _ladderTop(c, r) { return this._ladderish(c, r) && !this._ladderish(c, r - 1); }

    // column containing a ladder-ish tile within row span, preferring centre
    _findLadderCol(r0, r1) {
      const cols = [this.world.toTile(this.x), this.world.toTile(this.x - 8), this.world.toTile(this.x + 8)];
      for (const c of cols) for (let r = r0; r <= r1; r++) if (this._ladderish(c, r)) return c;
      return null;
    }
    _bodyLadderCol() {
      return this._findLadderCol(this.world.toTile(this.y - this.h + 1), this.world.toTile(this.y - 1));
    }
    _belowLadderCol() {
      const r = this.world.toTile(this.y + 1);
      const cols = [this.world.toTile(this.x), this.world.toTile(this.x - 8), this.world.toTile(this.x + 8)];
      for (const c of cols) if (this._ladderish(c, r)) return c;
      return null;
    }
    _roomToStand(standH, crouchH) {
      const w = this.world, cs = this._cols();
      const r0 = w.toTile(this.y - standH + EPS), r1 = w.toTile(this.y - crouchH - EPS);
      for (let c = cs[0]; c <= cs[1]; c++) for (let r = r0; r <= r1; r++) if (w.isSolid(c, r)) return false;
      return true;
    }
    _supportRow() { return this.world.toTile(this.y + 1); }
    _cols() { return [this.world.toTile(this.x - this.w / 2 + EPS), this.world.toTile(this.x + this.w / 2 - EPS)]; }
    _onSolidGround() {
      const w = this.world, r = this._supportRow(), cs = this._cols();
      for (let c = cs[0]; c <= cs[1]; c++) if (w.isSolid(c, r)) return true;
      return false;
    }
    _onPassable() { // standing on a one-way / ladder top only (no solid)
      const w = this.world, r = this._supportRow(), cs = this._cols();
      let one = false;
      for (let c = cs[0]; c <= cs[1]; c++) {
        if (w.isSolid(c, r)) return false;
        if (w.isOneWay(c, r) || this._ladderTop(c, r)) one = true;
      }
      return one;
    }

    // ---------- collision moves ----------
    _moveX(dx) {
      if (!dx) return;
      const w = this.world;
      this.x += dx;
      const r0 = w.toTile(this.y - this.h + EPS), r1 = w.toTile(this.y - EPS);
      if (dx > 0) {
        const c = w.toTile(this.x + this.w / 2 - EPS);
        for (let r = r0; r <= r1; r++) if (w.isSolid(c, r)) { this.x = c * T - this.w / 2; this.vx = 0; break; }
      } else {
        const c = w.toTile(this.x - this.w / 2);
        for (let r = r0; r <= r1; r++) if (w.isSolid(c, r)) { this.x = (c + 1) * T + this.w / 2; this.vx = 0; break; }
      }
    }

    _moveY(dy, climbing) {
      if (!dy) return;
      const w = this.world;
      const prevY = this.y;
      this.y += dy;
      const cs = this._cols();
      if (dy > 0) {
        const r = w.toTile(this.y - EPS);
        let land = false;
        for (let c = cs[0]; c <= cs[1] && !land; c++) {
          if (w.isSolid(c, r)) land = true;
          else if (!climbing && this._drop <= 0 && prevY <= r * T + 1e-3 &&
                   (w.isOneWay(c, r) || this._ladderTop(c, r))) land = true;
        }
        if (land) {
          this.y = r * T;
          this._impact = Math.max(this._impact, this.vy);
          this.vy = 0; this.onGround = true;
        }
      } else {
        const r = w.toTile(this.y - this.h);
        for (let c = cs[0]; c <= cs[1]; c++) {
          if (w.isSolid(c, r)) { this.y = (r + 1) * T + this.h; this.vy = 0; break; }
        }
      }
    }

    _physics(dt, climbing) {
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(this.vx), Math.abs(this.vy)) * dt / 10));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        this._moveX(this.vx * h);
        const vy0 = this.vy;
        this._moveY(vy0 * h, climbing);
        if (this.vy === 0 && vy0 > 0) { /* landed; stop remaining sub-steps of downward motion */ }
      }
    }

    _emitJump() {
      G.events.emit('jump', { x: this.x, y: this.y });
      if (G.sfx) G.sfx.play('jump');
    }

    // ---------- main update ----------
    update(dt) {
      this.t += dt;
      this.noise = 0;
      if (this.state === 'hidden') { this.vx = 0; this.vy = 0; this.speed = 0; this.stillTime = 0; this.faded = false; this.fadeAlpha = 1; return; }

      const ctl = this.control, inp = G.input;
      const left = ctl && inp.down('left'), right = ctl && inp.down('right');
      const up = ctl && inp.down('up'), down = ctl && inp.down('down');
      const sneakHeld = ctl && inp.down('sneak');
      const jumpHeld = ctl && inp.down('jump');
      const jumpPressed = ctl && inp.pressed('jump');
      const dir = (right ? 1 : 0) - (left ? 1 : 0);
      if (dir) this.facing = dir;

      // crouch: sneaking on the ground shrinks the hitbox (bottom fixed); stay crouched while a ceiling is overhead
      const STAND_H = 50, CROUCH_H = CFG.CROUCH_H ?? 32;
      if (sneakHeld && this.onGround && !this.onLadder) this.crouched = true;
      else if (this.crouched && this._roomToStand(STAND_H, CROUCH_H)) this.crouched = false;
      this.h = this.crouched ? CROUCH_H : STAND_H;
      const sneakEff = sneakHeld || this.crouched;

      this._drop -= dt; this._grabCd -= dt;
      this._impact = 0;
      const wasGround = this.onGround;
      const wasClimb = this.onLadder;
      let jumpedNow = false;

      if (this.onLadder) {
        this._updateClimb(dt, { left, right, up, down, jumpPressed, dir });
      } else {
        // timers
        if (jumpPressed) this._buf = JUMP_BUF; else this._buf -= dt;
        if (wasGround) this._coyote = COYOTE; else this._coyote -= dt;

        // drop through one-way
        let dropped = false;
        if (jumpPressed && down && wasGround && this._onPassable()) {
          this._drop = 0.15; this.vy = 120; this.onGround = false; this._coyote = 0; this._buf = 0; dropped = true;
        }

        // grab ladder
        if (!dropped && this._grabCd <= 0 && (up || down)) {
          let col = null;
          if (up) col = this._bodyLadderCol();
          if (col === null && down && wasGround) col = this._belowLadderCol();
          if (col !== null) {
            this.onLadder = true; this._ladCol = col; this.vx = 0; this.vy = 0;
            this._buf = 0; this._coyote = 0; this._jumping = false; this.onGround = false;
          }
        }

        if (this.onLadder) {
          this._updateClimb(dt, { left, right, up, down, jumpPressed: false, dir });
        } else {
          // horizontal
          const maxV = (sneakEff && wasGround) ? CFG.SNEAK_SPEED : CFG.WALK_SPEED; // full air control: sneak-jumps clear creaky boards
          const target = dir * maxV;
          const grounded = wasGround;
          const acc = dir === 0 ? GROUND_DECEL : (grounded ? GROUND_ACCEL : AIR_ACCEL);
          this.vx = approach(this.vx, target, (grounded ? acc : (dir ? AIR_ACCEL : 600)) * dt);

          // jump
          if (!dropped && this._buf > 0 && this._coyote > 0) {
            this.vy = -CFG.JUMP_V; this._jumping = true; this._buf = 0; this._coyote = 0;
            this.onGround = false; jumpedNow = true; this._emitJump();
          }
          // variable jump height
          if (this._jumping) {
            if (this.vy >= 0) this._jumping = false;
            else if (!jumpHeld) { this.vy = Math.max(this.vy, -CFG.JUMP_V * CUT_V); this._jumping = false; }
          }

          this.vy = Math.min(this.vy + CFG.GRAVITY * dt, CFG.MAX_FALL);
          this.onGround = false;
          this._physics(dt, false);
          if (this.onGround) this._jumping = false;
        }
      }

      // landing
      let landNoise = 0;
      if (this.onGround && !wasGround && !wasClimb && !jumpedNow && this._impact >= LAND_MIN_SPEED) {
        landNoise = G.util.clamp(this._impact / CFG.LAND_NOISE_DIV, 0.3, 1);
        G.events.emit('land', { x: this.x, y: this.y, noise: landNoise });
        if (G.sfx) G.sfx.play('land');
      }

      // state
      const moving = this.onGround && !this.onLadder && dir !== 0 && Math.abs(this.vx) > 20;
      if (!ctl) this.state = 'frozen';
      else if (this.onLadder) this.state = 'climb';
      else if (!this.onGround) this.state = this.vy < 0 ? 'jump' : 'fall';
      else if (sneakEff) this.state = 'sneak';
      else this.state = moving ? 'walk' : 'idle';
      this.speed = this.onLadder ? Math.abs(this.vy) : Math.abs(this.vx);

      // noise + footsteps
      let creaky = false;
      if (this.onGround && !this.onLadder) creaky = this.world.isCreaky(this.world.toTile(this.x), this._supportRow());
      let n = 0;
      if (this.onLadder) {
        if (this.vy !== 0) n = CFG.NOISE_CLIMB;
      } else if (moving) {
        n = sneakEff ? CFG.NOISE_SNEAK : CFG.NOISE_WALK;
        if (creaky) n = Math.min(1, n * CFG.CREAK_MULT);
      }
      this.noise = Math.max(n, landNoise);

      // stillness: motionless on ground/ladder with no movement input -> fades (ghosts cannot see her)
      const keyMove = left || right || up || down || jumpPressed || jumpHeld;
      const still = ctl && !keyMove && (this.onGround || this.onLadder) && Math.abs(this.vx) < 1 && Math.abs(this.vy) < 1 && !jumpedNow;
      this.stillTime = still ? this.stillTime + dt : 0;
      this.faded = this.stillTime >= (CFG.STILL_FADE ?? 0.5);
      this.fadeAlpha = approach(this.fadeAlpha, this.faded ? 0.4 : 1, dt * 2.4);

      const interval = sneakEff ? STRIDE_SNEAK : STRIDE_WALK;
      if (moving) {
        this._stride += dt;
        if (this._stride >= interval) {
          this._stride -= interval;
          G.events.emit('step', { x: this.x, y: this.y, creaky, sneak: !!sneakEff });
          if (G.sfx) G.sfx.play(creaky ? 'creak' : 'step', sneakEff ? { vol: 0.5 } : undefined);
        }
      } else {
        this._stride = interval * 0.6;
      }
    }

    _updateClimb(dt, k) {
      const w = this.world;
      this.vx = 0;
      let vdir = (k.down ? 1 : 0) - (k.up ? 1 : 0);
      this.vy = vdir * CFG.CLIMB_SPEED;
      this.onGround = false;

      // jump off
      if (k.jumpPressed && !k.up) {
        this.onLadder = false; this._grabCd = 0.25;
        this.vy = -CFG.JUMP_V * 0.75; this.vx = k.dir * CFG.WALK_SPEED * 0.8;
        this._jumping = true; this._coyote = 0; this._buf = 0;
        this._emitJump();
        return;
      }

      // snap to ladder centre
      const cx = (this._ladCol + 0.5) * T;
      const sx = G.util.clamp(cx - this.x, -260 * dt, 260 * dt);
      this._moveX(sx);

      this._physics(dt, true);
      if (this.onGround) { // reached solid floor going down
        this.onLadder = false; this.vy = 0; this._grabCd = 0.15;
        return;
      }

      // step off sideways when at a landing handled above; otherwise check ladder continuity
      const c = this._ladCol;
      const r0 = w.toTile(this.y - this.h + 1), r1 = w.toTile(this.y - 1);
      let stay = false;
      for (let r = r0; r <= r1; r++) if (this._ladderish(c, r)) { stay = true; break; }
      if (!stay && this._ladderish(c, w.toTile(this.y + 1))) stay = true;

      if (this.vy < 0 && !this._ladderish(c, w.toTile(this.y - 1))) {
        // climbed past the top: stand on top if a ladder tile is right below
        const rb = w.toTile(this.y + 18);
        if (this._ladderish(c, rb) && !this._ladderish(c, rb - 1)) {
          this.y = rb * T; this.vy = 0; this.onGround = true; this.onLadder = false; this._grabCd = 0.15;
          return;
        }
      }
      if (!stay) { this.onLadder = false; this.vy = 0; this._grabCd = 0.15; }
    }

    draw(ctx) {
      if (this.state === 'hidden') return;
      if (G.art && G.art.drawIvy) {
        ctx.save();
        ctx.globalAlpha *= this.fadeAlpha;
        G.art.drawIvy(ctx, this.x, this.y, { state: this.state, facing: this.facing, t: this.t, speed: this.speed });
        ctx.restore();
        return;
      }
      // placeholder
      const x = this.x - this.w / 2, y = this.y - this.h, w = this.w, h = this.h;
      ctx.save();
      ctx.fillStyle = '#141018';
      const r = 6;
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.fill();
      ctx.fillStyle = '#f2ece4';
      ctx.beginPath(); ctx.ellipse(this.x + this.facing * 2, y + 12, 6, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f3a03a';
      ctx.fillRect(this.x + this.facing * 10 - 2, y + 24, 4, 4);
      ctx.restore();
    }
  }

  G.Player = Player;
})();
