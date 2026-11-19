(function () {
  const G = window.G;
  const CFG = G.CFG;
  const T = CFG.TILE;

  // ---- tuning ----
  const J_VIEW = 6, J_ANG = 25 * Math.PI / 180, J_EYE = 40, J_NOTICE = 0.4;
  const J_INVEST_MUL = 1.7, J_SEARCH = 5, J_TURN = 1.4, J_HEAR_WALK = 3 * T, J_PAUSE = 1.0;
  const TW_RANGE = 7 * T, TW_COOLDOWN = 2, TW_FIRST = 0.7, BALLOON_G = 900;
  const TA_FETCH_T = 2.5, TA_VISIT_T = 9;
  const TA_VIEW = 5, TA_ANG = 28 * Math.PI / 180, TA_RUN = 150, TA_PATROL = 50, TA_COOLDOWN = 6;
  const CAT_HOME = 3 * T, CAT_STARTLE_R = 2.5 * T, CAT_VASE_R = 4 * T, CAT_COOLDOWN = 6, CAT_SPEED = 24;
  const BRIBE_R = 1.3 * T, TA_ASK = 3, ASK_R = 6 * T, BEAT_LOOPS = 2;

  function sfx(name, opts) { if (G.sfx && G.sfx.play) G.sfx.play(name, opts); }
  function art(name, ctx, x, y, o) { const A = G.art; if (A && A[name]) { A[name](ctx, x, y, o); return true; } return false; }
  function sgn(v) { return v >= 0 ? 1 : -1; }

  // walkable segment [l, r] (px, tile centres) around x on the floor at feet-y `y`
  function segment(world, x, y) {
    const row = world.toTile(y - 8), row2 = world.toTile(y - 40);
    const ok = (c) => !world.isSolid(c, row) && !world.isSolid(c, row2) && (world.isSolid(c, row + 1) || world.isOneWay(c, row + 1));
    const c0 = world.toTile(x);
    let l = c0, r = c0;
    while (c0 - l < 80 && ok(l - 1)) l--;
    while (r - c0 < 80 && ok(r + 1)) r++;
    return { l: (l + 0.5) * T, r: (r + 0.5) * T };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  class Npcs {
    constructor(world, player, level, school) {
      this.world = world; this.player = player; this.level = level; this.school = school || null;
      this.paused = false; this.t = 0;
      this.janitors = []; this.twins = []; this.tattles = []; this.cats = []; this.vases = []; this.balloons = [];
      this._caught = false;
      G.inv = G.inv || { keys: {}, candy: 0 };

      this._entsDone = false;
      (level.entities || []).forEach((e) => {
        const p = world.entPos(e);
        const a = e.from == null ? e.tx : e.from, b = e.to == null ? e.tx : e.to;
        const from = (Math.min(a, b) + 0.5) * T, to = (Math.max(a, b) + 0.5) * T;
        if (e.type === 'janitor') {
          this.janitors.push({
            x: p.x, y: p.y, from, to, speed: e.speed || 45, startX: p.x, startFacing: b >= e.tx ? 1 : -1,
            facing: b >= e.tx ? 1 : -1, dir: b >= e.tx ? 1 : -1, state: 'patrol', timer: 0, notice: 0, alert: 0,
            target: p.x, seg: segment(world, p.x, p.y), walkT: 0, flip: 0,
          });
      if (this.school && this.janitors.length > 1) { // the school has one caretaker (Grandpa): extra janitor spots become his rounds
        const J = this.janitors[0];
        J.beats = this.janitors.map((q) => ({ y: q.y, from: q.from, to: q.to, seg: q.seg }));
        // plus the ground floor of a few more rooms he looks into on his rounds
        for (const id of ['dining', 'library', 'biology']) {
          const r = (this.school.rooms || []).find((q) => q.id === id); if (!r) continue;
          let best = null;
          for (const d of this.school.portals) {
            const tx = d.x / T, ty = d.y / T - 0.5;
            if (tx < r.tx || tx >= r.tx + r.w || ty < r.ty || ty >= r.ty + r.h) continue;
            const sg = segment(world, d.x, d.y);
            if (!best || sg.r - sg.l > best.seg.r - best.seg.l) best = { y: d.y, seg: sg };
          }
          if (best && best.seg.r - best.seg.l > 4 * T) J.beats.push({ y: best.y, seg: best.seg, from: best.seg.l + T, to: best.seg.r - T });
        }
        J.beatI = 0; J.loops = 0;
        this.janitors = [J];
      }
          { const j = this.janitors[this.janitors.length - 1]; j.home = { y: j.y, from: j.from, to: j.to, seg: j.seg }; }
        } else if (e.type === 'twins') {
          const seg = segment(world, p.x, p.y);
          let hideX = p.x; // they duck under the nearest long table in their room
          (level.entities || []).forEach((d) => { if (d.type === 'deco' && d.kind === 'long_table') { const q = world.entPos(d); if (Math.abs(q.y - p.y) < T && q.x >= seg.l && q.x <= seg.r && (hideX === p.x || Math.abs(q.x - p.x) < Math.abs(hideX - p.x))) hideX = q.x; } });
          this.twins.push({ x: p.x, y: p.y, homeX: p.x, hideX, seg, facing: b >= e.tx ? 1 : -1, homeFacing: b >= e.tx ? 1 : -1, cd: TW_FIRST, throwK: 0, mode: 'play', clearT: 0, walkT: 0 });
        } else if (e.type === 'tattle') {
          this.tattles.push({
            x: p.x, y: p.y, from, to, startX: p.x, startFacing: b >= e.tx ? 1 : -1, facing: b >= e.tx ? 1 : -1, dir: b >= e.tx ? 1 : -1,
            state: 'walk', timer: 0, cool: 0, seg: segment(world, p.x, p.y), homeY: p.y, bribed: false, target: null, walkT: 0, route: null,
          });
        } else if (e.type === 'cat') {
          this.cats.push({
            x: p.x, y: p.y, homeX: p.x, facing: 1, state: 'sit', timer: 1 + Math.random() * 2, goal: p.x, cool: 0, hop: 0,
            seg: segment(world, p.x, p.y), walkT: 0, startX: p.x,
          });
        } else if (e.type === 'vase') {
          this.vases.push({ x: p.x, y: p.y, broken: false, brokeT: 0 });
        }
      });

      this._noise = (d) => this.hearNoise(d);
      G.events.on('noise', this._noise);
      this.reset();
    }

    destroy() { G.events.off('noise', this._noise); }

    // ------------------------------------------------------------ helpers
    _hidden() { const p = this.player; return !p || p.state === 'hidden' || p.control === false; }

    _walking() {
      const p = this.player;
      return p && p.state !== 'hidden' && p.onGround !== false && Math.abs(p.vx || 0) > CFG.SNEAK_SPEED * 1.3;
    }

    _coneLen(n, eyeY, view) {
      const w = this.world, full = view * T;
      for (let d = 6; d <= full; d += 6) if (w.isSolid(w.toTile(n.x + n.facing * d), w.toTile(eyeY))) return d - 6;
      return full;
    }

    // is any of Ivy's body points inside the cone and in line of sight?
    _inCone(n, eyeY, view, ang) {
      const p = this.player, w = this.world;
      if (this._hidden()) return false;
      const ex = n.x, L = view * T;
      // touching the NPC itself
      if (Math.abs(p.x - n.x) < 0.55 * T && Math.abs(p.y - n.y) < 1.2 * T) return true;
      const pts = [p.y - 8, p.y - 25, p.y - 44];
      for (const py of pts) {
        const dx = (p.x - ex) * n.facing, dy = py - eyeY;
        if (dx <= 0 || dx > L) continue;
        if (Math.abs(Math.atan2(dy, dx)) > ang) continue;
        const nn = Math.ceil(Math.hypot(dx, dy) / 6);
        let clear = true;
        for (let i = 1; i < nn; i++) {
          const k = i / nn;
          if (w.isSolid(w.toTile(ex + (p.x - ex) * k), w.toTile(eyeY + (py - eyeY) * k))) { clear = false; break; }
        }
        if (clear) return true;
      }
      return false;
    }

    // step n towards x (clamped to its segment); returns true when arrived
    _walkTo(n, x, speed, dt) {
      const tx = clamp(x, n.seg.l, n.seg.r), d = tx - n.x, step = speed * dt;
      if (Math.abs(d) <= step) { n.x = tx; return true; }
      n.x += sgn(d) * step; n.facing = sgn(d); n.walkT += dt;
      return false;
    }

    // doors on the floor segment `seg` at feet-y `y`
    _doorsIn(seg, y) {
      return (this.school && this.school.portals || []).filter((d) => Math.abs(d.y - y) < 1.5 * T && d.x >= seg.l - T && d.x <= seg.r + T);
    }
    _partner(d) { return this.school.portals.find((q) => q.id === d.to); }
    // breadth-first search over doors: the list of doors to walk through from (x,y) until goal(seg, y) holds
    _route(x, y, goal) {
      const w = this.world, start = { seg: segment(w, x, y), y, path: [] };
      const key = (n) => Math.round(n.seg.l) + ':' + Math.round(n.y / T);
      const seen = new Set([key(start)]), q = [start];
      while (q.length) {
        const n = q.shift();
        if (goal(n.seg, n.y)) return n.path;
        for (const d of this._doorsIn(n.seg, n.y)) {
          const o = this._partner(d); if (!o) continue;
          const m = { seg: segment(w, o.x, o.y), y: o.y, path: n.path.concat([d]) };
          if (seen.has(key(m))) continue; seen.add(key(m)); q.push(m);
        }
      }
      return null;
    }
    // walk along n.route through the doors; true when the last door has been passed
    _travel(n, dt, speed) {
      if (!n.route || !n.route.length) return true;
      const d = n.route[0];
      if (this._walkTo(n, d.x, speed, dt) || Math.abs(d.x - n.x) < 0.3 * T) {
        const o = this._partner(d);
        n.x = o.x; n.y = o.y; n.seg = segment(this.world, o.x, o.y); n.route.shift(); n.lastDoor = o;
        sfx('door', { vol: 0.45 });
        return !n.route.length;
      }
      return false;
    }
    _freeJanitorIn(seg, y) {
      return this.janitors.find((j) => !j.visit && j.state !== 'caught' && Math.abs(j.y - y) < 1.5 * T && j.x >= seg.l - T && j.x <= seg.r + T);
    }

    // ------------------------------------------------------------ noise
    hearNoise(d) {
      if (!d || this.paused) return;
      for (const j of this.janitors) {
        if (j.state === 'notice' || j.state === 'caught' || j.state === 'travel') continue;
        const here = Math.abs(d.y - j.y) < 1.5 * T && d.x >= j.seg.l - T && d.x <= j.seg.r + T;
        if (!here) { // a noise in a room next door: he walks over through the door to have a look
          if (j.visit || d.radius < 8 * T) continue;
          const r = this._route(j.x, j.y, (seg, y) => Math.abs(y - d.y) < 1.5 * T && d.x >= seg.l - T && d.x <= seg.r + T);
          if (!r || !r.length || r.length > 1) continue;
          j.route = r; j.visit = { phase: 'go', t: 0, seenX: d.x }; j.state = 'travel';
          continue;
        }
        if (Math.hypot(d.x - j.x, d.y - j.y) > d.radius) continue;
        j.state = 'investigate'; j.target = d.x; j.timer = 0; j.flip = 0;
        j.facing = d.x >= j.x ? 1 : -1;
      }
    }

    // ------------------------------------------------------------ reset
    reset() {
      this._caught = false; this.balloons = [];
      for (const j of this.janitors) {
        if (j.beats) { const B = j.beats[0]; j.beatI = 0; j.loops = 0; j.home = { y: B.y, from: B.from, to: B.to, seg: B.seg }; }
        if (j.home) { j.y = j.home.y; j.from = j.home.from; j.to = j.home.to; j.seg = j.home.seg; }
        j.visit = null; j.route = null;
        j.x = j.startX; j.facing = j.startFacing; j.dir = j.startFacing; j.state = 'patrol'; j.timer = 0; j.notice = 0; j.alert = 0;
      }
      for (const tw of this.twins) { tw.cd = TW_FIRST; tw.throwK = 0; tw.mode = 'play'; tw.x = tw.homeX; tw.facing = tw.homeFacing; tw.clearT = 0; }
      for (const ta of this.tattles) {
        ta.y = ta.homeY; ta.seg = segment(this.world, ta.startX, ta.homeY); ta.route = null; ta.fetching = false;
        ta.x = ta.startX; ta.facing = ta.startFacing; ta.dir = ta.startFacing; ta.timer = 0; ta.cool = 0; ta.target = null; ta.away = false; ta.door = null;
        ta.state = ta.bribed ? 'eat' : 'walk';
      }
      for (const c of this.cats) { c.x = c.startX; c.state = 'sit'; c.timer = 1.5; c.cool = 0; c.hop = 0; }
      for (const v of this.vases) { v.broken = false; v.brokeT = 0; }
    }

    // ------------------------------------------------------------ update
    update(dt) {
      this.t += dt;
      for (const b of this.balloons) if (b.splash > 0) b.splash += dt;
      this.balloons = this.balloons.filter((b) => !(b.splash > 0 && b.splash > 0.5));
      if (this.paused) return;
      const p = this.player;
      for (const j of this.janitors) this._janitor(j, dt, p);
      for (const tw of this.twins) this._twins(tw, dt, p);
      for (const ta of this.tattles) this._tattle(ta, dt, p);
      for (const c of this.cats) this._cat(c, dt, p);
      this._balloons(dt, p);
      this._bribe(p);
    }

    _janitor(j, dt, p) {
      j.alert = Math.max(0, j.alert - dt * 2);
      if (j.state === 'caught') return;
      const eyeY = j.y - J_EYE;
      const sees = this._inCone(j, eyeY, J_VIEW, J_ANG);
      if (sees && !this._caught) {
        if (j.state !== 'notice') { j.state = 'notice'; j.notice = 0; sfx('stir', { vol: 0.6 }); }
        j.notice += dt; j.alert = Math.min(1, j.notice / J_NOTICE);
        j.facing = p.x >= j.x ? 1 : -1;
        if (j.notice >= J_NOTICE) {
          j.state = 'caught'; this._caught = true; j.alert = 1;
          G.events.emit('caught', { by: 'janitor', who: 'janitor', x: j.x, y: j.y });
        }
        return;
      }
      if (j.state === 'notice') { j.state = 'return'; j.notice = 0; }
      if (j.visit && this._visitStep(j, dt)) return;

      // heard Ivy walking close by
      if (this._walking() && Math.abs(p.x - j.x) <= J_HEAR_WALK && Math.abs(p.y - j.y) < 2 * T && (j.state === 'patrol' || j.state === 'pause' || j.state === 'return' || j.state === 'search' || j.state === 'turn')) {
        if (j.state !== 'turn') j.state = 'turn';
        j.timer = J_TURN; j.facing = p.x >= j.x ? 1 : -1;
      }

      if (j.state === 'turn') {
        j.timer -= dt;
        if (j.timer <= 0) j.state = 'return';
      } else if (j.state === 'investigate') {
        if (this._walkTo(j, j.target, j.speed * J_INVEST_MUL, dt)) { j.state = 'search'; j.timer = 0; j.flip = 0; }
      } else if (j.state === 'search') {
        j.timer += dt; j.flip += dt;
        if (j.flip > 1.2) { j.flip = 0; j.facing = -j.facing; }
        if (j.timer >= J_SEARCH) { j.state = 'return'; }
      } else if (j.state === 'return') {
        const goal = clamp(j.x, j.from, j.to);
        if (j.x >= j.from && j.x <= j.to) { j.state = 'patrol'; j.dir = j.facing; }
        else if (this._walkTo(j, goal, j.speed, dt)) { j.state = 'patrol'; j.dir = j.facing; }
      } else if (j.state === 'patrol') {
        const target = j.dir > 0 ? j.to : j.from, step = j.speed * dt;
        if (j.from === j.to || Math.abs(target - j.x) <= step) {
          j.x = target; j.state = 'pause'; j.timer = 0; j.facing = j.dir;
        } else { j.x += j.dir * step; j.facing = j.dir; j.walkT += dt; }
      } else if (j.state === 'pause') {
        j.timer += dt;
        if (j.timer >= J_PAUSE) {
          j.dir = -j.dir; j.facing = j.dir; j.state = 'patrol';
          j.loops = (j.loops || 0) + 1;
          if (j.beats && j.beats.length > 1 && j.loops >= BEAT_LOOPS && !j.visit) this._nextBeat(j);
        }
      }
    }

    // the one caretaker makes his rounds: after a few lengths of a room he walks through the doors to the next one
    _nextBeat(j) {
      let n = j.beatI; while (n === j.beatI) n = Math.floor(Math.random() * j.beats.length);
      j.beatI = n;
      const B = j.beats[j.beatI];
      const r = this._route(j.x, j.y, (seg, y) => Math.abs(y - B.y) < 1.5 * T && Math.abs(seg.l - B.seg.l) < T);
      if (!r) return;
      j.route = r; j.visit = { phase: 'beat' }; j.state = 'travel'; j.loops = 0;
    }

    _twins(tw, dt, p) {
      tw.throwK = Math.max(0, tw.throwK - dt * 2.5);
      tw.cd -= dt;
      // the janitor is in their room: run and duck under the table, come out when he has gone
      const jIn = this.janitors.some((j) => !j.away && Math.abs(j.y - tw.y) < T && j.x >= tw.seg.l - T && j.x <= tw.seg.r + T);
      if (jIn && (tw.mode === 'play' || tw.mode === 'back')) { tw.mode = 'run'; tw.throwK = 0; G.events.emit('twins_hide', { x: tw.x, y: tw.y }); }
      if (tw.mode === 'run' || tw.mode === 'back') {
        const gx = tw.mode === 'run' ? tw.hideX : tw.homeX, sp = tw.mode === 'run' ? 150 : 60;
        tw.facing = gx >= tw.x ? 1 : -1; tw.walkT += dt;
        if (Math.abs(gx - tw.x) <= sp * dt) {
          tw.x = gx;
          if (tw.mode === 'run') { tw.mode = 'hid'; tw.clearT = 0; } else { tw.mode = 'play'; tw.facing = tw.homeFacing; tw.cd = Math.max(tw.cd, 1.2); }
        } else tw.x += tw.facing * sp * dt;
        return;
      }
      if (tw.mode === 'hid') {
        tw.clearT = jIn ? 0 : tw.clearT + dt;
        if (tw.clearT > 2) { tw.mode = 'back'; G.events.emit('twins_out', { x: tw.x, y: tw.y }); }
        return;
      }
      if (this._hidden()) return;
      // they turn towards Ivy when she is on their floor, on either side
      if (Math.abs(p.y - tw.y) <= 2 * T && Math.abs(p.x - tw.x) <= TW_RANGE && p.x >= tw.seg.l - T && p.x <= tw.seg.r + T) tw.facing = p.x >= tw.x ? 1 : -1;
      const dx = (p.x - tw.x) * tw.facing;
      if (dx <= 0 || dx > TW_RANGE || Math.abs(p.y - tw.y) > 2 * T) return;
      const ex = tw.x, ey = tw.y - 44;
      // line of sight to Ivy's chest
      const cy = p.y - 25, n = Math.ceil(Math.hypot(p.x - ex, cy - ey) / 6);
      for (let i = 1; i < n; i++) {
        const k = i / n;
        if (this.world.isSolid(this.world.toTile(ex + (p.x - ex) * k), this.world.toTile(ey + (cy - ey) * k))) return;
      }
      if (!tw.greeted) { tw.greeted = true; tw.cd = Math.max(tw.cd, 2.4); G.events.emit('twins_greet', { x: tw.x, y: tw.y }); return; }
      if (tw.cd > 0) return;
      tw.cd = TW_COOLDOWN; tw.throwK = 1;
      tw.shout = ((tw.shout || 0) % 2) + 1;
      G.events.emit('twins_throw', { x: tw.x, y: tw.y, n: tw.shout });
      // ballistic arc to her current position
      const sx = tw.x + tw.facing * 14, sy = tw.y - 46, tx = p.x, ty = p.y - 25;
      const flight = clamp(Math.hypot(tx - sx, ty - sy) / 330, 0.45, 1.1);
      this.balloons.push({
        x: sx, y: sy, vx: (tx - sx) / flight, vy: (ty - sy - 0.5 * BALLOON_G * flight * flight) / flight,
        splash: 0, age: 0,
      });
    }

    _balloons(dt, p) {
      const w = this.world;
      for (const b of this.balloons) {
        if (b.splash > 0) continue;
        b.age += dt;
        b.vy += BALLOON_G * dt; b.x += b.vx * dt; b.y += b.vy * dt;
        let hit = w.isSolid(w.toTile(b.x), w.toTile(b.y)) || b.age > 4;
        if (!hit && p && p.state !== 'hidden') {
          if (Math.abs(b.x - p.x) < 14 && b.y > p.y - 54 && b.y < p.y) hit = true;
        }
        if (hit) {
          b.splash = 0.001;
          sfx('flask', { vol: 0.8 });
          G.events.emit('noise', { x: b.x, y: Math.min(b.y, this._floorBelow(b.x, b.y)), radius: 10 * T, src: 'splash' });
        }
      }
    }

    // the tattle has reached a caretaker: he walks through the doors to where Ivy was seen, searches, then walks home
    _summon(j, ta) {
      const sx = ta.seenX, sy = ta.seenY;
      j.route = this._route(j.x, j.y, (seg, y) => Math.abs(y - sy) < 1.5 * T && sx >= seg.l - T && sx <= seg.r + T) || [];
      j.visit = { phase: 'go', t: 0, seenX: sx };
      j.state = 'travel'; j.alert = 0.5;
    }
    _visitStep(j, dt) { // true while the visit controls him
      const v = j.visit;
      if (v.phase === 'go') {
        if (this._travel(j, dt, j.speed * 2)) {
          v.phase = 'search'; v.t = 0;
          j.from = j.seg.l + T; j.to = j.seg.r - T;
          j.state = 'investigate'; j.target = clamp(v.seenX, j.seg.l + T / 2, j.seg.r - T / 2); j.facing = j.target >= j.x ? 1 : -1;
          G.events.emit('janitor_enter', { x: j.x, y: j.y });
        }
        return true;
      }
      if (v.phase === 'beat') {
        if (this._travel(j, dt, j.speed * 1.2)) {
          const B = j.beats[j.beatI];
          j.home = { y: B.y, from: B.from, to: B.to, seg: B.seg };
          j.y = B.y; j.from = B.from; j.to = B.to; j.seg = B.seg; j.visit = null; j.state = 'return';
        }
        return true;
      }
      if (v.phase === 'search') {
        v.t += dt;
        if (v.t < TA_VISIT_T || j.state === 'investigate' || j.state === 'search' || j.state === 'notice' || j.state === 'turn') return false;
        const H = j.home;
        j.route = this._route(j.x, j.y, (seg, y) => Math.abs(y - H.y) < 1.5 * T && Math.abs(seg.l - H.seg.l) < T) || [];
        v.phase = 'home'; j.state = 'travel';
        return true;
      }
      if (this._travel(j, dt, j.speed * 1.3)) { // home: back to his own patrol
        j.y = j.home.y; j.from = j.home.from; j.to = j.home.to; j.seg = j.home.seg; j.visit = null; j.state = 'return';
      }
      return true;
    }

    _floorBelow(x, y) {
      const w = this.world; let r = w.toTile(y);
      while (r < w.rows && !w.isSolid(w.toTile(x), r)) r++;
      return r * T;
    }

    _tattle(ta, dt, p) {
      if (ta.state === 'eat') return;
      ta.cool = Math.max(0, ta.cool - dt);
      const eyeY = ta.y - 38;
      if (ta.state === 'walk') {
        const target = ta.dir > 0 ? ta.to : ta.from, step = TA_PATROL * dt;
        if (ta.from === ta.to || Math.abs(target - ta.x) <= step) { ta.x = target; ta.dir = -ta.dir; ta.facing = ta.dir; }
        else { ta.x += ta.dir * step; ta.facing = ta.dir; ta.walkT += dt; }
        if (ta.cool <= 0 && this._inCone(ta, eyeY, TA_VIEW, TA_ANG)) { // standing still does not fool her
          ta.state = 'ask'; ta.timer = 0; ta.facing = p.x >= ta.x ? 1 : -1;
          G.events.emit('tattle_ask', { x: ta.x, y: ta.y });
          sfx('stir', { vol: 0.5 });
        }
      } else if (ta.state === 'ask') { // she stops: "A ghost?" – a moment to hand her a sweet
        ta.timer += dt;
        if (p.state === 'hidden') { ta.state = 'walk'; ta.cool = 2; G.events.emit('tattle_doubt', { x: ta.x, y: ta.y }); return; }
        ta.facing = p.x >= ta.x ? 1 : -1;
        if (ta.timer >= TA_ASK) {
          ta.state = 'run'; ta.timer = 0;
          G.events.emit('tattle_run', { x: ta.x, y: ta.y });
          sfx('stir', { vol: 0.7 });
        }
      } else if (ta.state === 'run') {
        ta.timer += dt;
        if (ta.seenX == null) { ta.seenX = p.x; ta.seenY = p.y; }
        const jn = this._freeJanitorIn(ta.seg, ta.y); // a caretaker in the room she is in right now
        if (jn && !(ta.route && ta.route.length)) {
          const arrived = this._walkTo(ta, jn.x, TA_RUN, dt) || Math.abs(jn.x - ta.x) < 0.8 * T;
          if (arrived) {
            if (!ta.fetching) { // he is right here: he hears her and comes over
              G.events.emit('noise', { x: p.x, y: p.y, radius: 30 * T, src: 'tattle' });
              ta.state = 'back'; ta.cool = TA_COOLDOWN; ta.seenX = null;
            } else { // she fetched him from another room: both walk back through the doors
              G.events.emit('tattle_call', { x: ta.x, y: ta.y });
              this._summon(jn, ta);
              const hy = ta.homeY, hx = ta.startX;
              ta.route = this._route(ta.x, ta.y, (seg, y) => Math.abs(y - hy) < 1.5 * T && hx >= seg.l - T && hx <= seg.r + T) || [];
              ta.state = 'return'; ta.fetching = false; ta.seenX = null;
            }
          }
        } else if (ta.route && ta.route.length) {
          this._travel(ta, dt, TA_RUN);
        } else {
          ta.route = this._route(ta.x, ta.y, (seg, y) => !!this._freeJanitorIn(seg, y));
          if (ta.route && ta.route.length) ta.fetching = true;
          else { ta.state = 'back'; ta.cool = TA_COOLDOWN; ta.route = null; ta.seenX = null; }
        }
      } else if (ta.state === 'return') { // leading the caretaker back, a little ahead of him
        if (this._travel(ta, dt, TA_RUN * 0.65)) { ta.state = 'back'; ta.cool = TA_COOLDOWN; ta.route = null; }
      } else if (ta.state === 'back') {
        ta.shouted = false;
        if (ta.x >= ta.from && ta.x <= ta.to) { ta.state = 'walk'; ta.dir = ta.facing; }
        else if (this._walkTo(ta, clamp(ta.x, ta.from, ta.to), TA_PATROL * 1.6, dt)) { ta.state = 'walk'; ta.dir = ta.facing; }
      }
    }

    _cat(c, dt, p) {
      c.cool = Math.max(0, c.cool - dt);
      if (c.state === 'startle') {
        c.timer += dt; c.hop = Math.sin(Math.min(1, c.timer / 0.6) * Math.PI) * 34;
        if (c.timer >= 0.6) { c.state = 'sit'; c.timer = 2; c.hop = 0; }
        return;
      }
      if (this._walking() && c.cool <= 0 && Math.abs(p.x - c.x) <= CAT_STARTLE_R && Math.abs(p.y - c.y) < 1.5 * T) {
        c.state = 'startle'; c.timer = 0; c.cool = CAT_COOLDOWN; c.facing = p.x >= c.x ? -1 : 1;
        let v = null, bd = 1e9;
        for (const vs of this.vases) {
          if (vs.broken) continue;
          const d = Math.hypot(vs.x - c.x, vs.y - c.y);
          if (d <= CAT_VASE_R && d < bd) { bd = d; v = vs; }
        }
        if (v) {
          v.broken = true; v.brokeT = 0;
          sfx('land', { vol: 0.9 });
          G.events.emit('noise', { x: v.x, y: v.y, radius: 10 * T, src: 'crash' });
        }
        return;
      }
      if (c.state === 'sit') {
        c.timer -= dt;
        if (c.timer <= 0) {
          c.goal = clamp(c.homeX + (Math.random() * 2 - 1) * CAT_HOME, c.seg.l, c.seg.r);
          c.state = 'walk';
        }
      } else if (c.state === 'walk') {
        if (this._walkTo(c, c.goal, CAT_SPEED, dt)) { c.state = 'sit'; c.timer = 1.5 + Math.random() * 3; }
      }
    }

    _bribe(p) {
      if (!p || p.state === 'hidden') return;
      const asking = this._askTarget();
      if (!(G.input.pressed('action') || (asking && G.input.pressed('down')))) return;
      const ta = asking || this._bribeTarget();
      if (!ta) return;
      G.inv.candy--; ta.bribed = true; ta.state = 'eat';
      sfx('checkpoint', { vol: 0.6 });
      G.events.emit('bribed', { x: ta.x, y: ta.y, who: 'tattle' });
    }

    _bribeTarget() {
      const p = this.player;
      if (!p || p.state === 'hidden' || !G.inv || !(G.inv.candy > 0)) return null;
      let best = null, bd = 1e9;
      for (const ta of this.tattles) {
        if (ta.bribed) continue;
        const d = Math.abs(ta.x - p.x);
        if (d <= BRIBE_R && Math.abs(ta.y - p.y) < 1.2 * T && d < bd) { bd = d; best = ta; }
      }
      return best;
    }

    _askTarget() {
      const p = this.player;
      if (!p || p.state === 'hidden' || !G.inv || !(G.inv.candy > 0)) return null;
      return this.tattles.find((ta) => ta.state === 'ask' && !ta.bribed && Math.abs(ta.x - p.x) <= ASK_R && Math.abs(ta.y - p.y) < 2 * T) || null;
    }
    // shown above everything else while a tattle is asking
    askPrompt() {
      const p = this.player;
      const ta = this.tattles.find((q) => q.state === 'ask' && Math.abs(q.x - p.x) <= ASK_R && Math.abs(q.y - p.y) < 2 * T);
      if (!ta) return null;
      return G.inv && G.inv.candy > 0 ? 'hint_candy_ask' : 'hint_candy_none';
    }
    nearestAction() { return this._bribeTarget() ? 'hint_candy_give' : null; }

    // ------------------------------------------------------------ draw
    draw(ctx) {
      const t = this.t;
      for (const v of this.vases) {
        if (v.broken) v.brokeT += 1 / 60;
        if (!art('drawVase', ctx, v.x, v.y, { broken: v.broken })) {
          ctx.fillStyle = v.broken ? '#6b2e3e' : '#8e4256';
          if (v.broken) ctx.fillRect(v.x - 12, v.y - 6, 24, 6); else { ctx.beginPath(); ctx.ellipse(v.x, v.y - 14, 10, 14, 0, 0, 7); ctx.fill(); }
        }
      }
      for (const c of this.cats) {
        if (!art('drawCat', ctx, c.x, c.y - c.hop, { facing: c.facing, t: t + c.walkT, state: c.state === 'startle' ? 'startle' : c.state === 'walk' ? 'walk' : 'sit' })) {
          ctx.fillStyle = '#141018'; ctx.beginPath(); ctx.ellipse(c.x, c.y - 9 - c.hop, 12, 9, 0, 0, 7); ctx.fill();
          ctx.beginPath(); ctx.arc(c.x + c.facing * 10, c.y - 17 - c.hop, 6, 0, 7); ctx.fill();
        }
      }
      for (const ta of this.tattles) {
        if (ta.away) continue;
        const st = ta.state === 'eat' ? 'eat' : ta.state === 'run' ? 'run' : 'walk';
        if (!art('drawTattle', ctx, ta.x, ta.y, { facing: ta.facing, t: t + ta.walkT, state: st })) {
          ctx.fillStyle = st === 'run' ? '#f3a03a' : '#c9cfe0'; ctx.fillRect(ta.x - 8, ta.y - 40, 16, 40);
        }
      }
      for (const tw of this.twins) {
        if (tw.mode === 'hid') { // two pairs of eyes peeking from under the table
          const blink = Math.sin(t * 2.3 + tw.x) > 0.96;
          ctx.fillStyle = '#efe6d0';
          if (!blink) for (const ox of [-13, -6, 5, 12]) { ctx.beginPath(); ctx.arc(tw.x + ox, tw.y - 9, 1.6, 0, 7); ctx.fill(); }
          continue;
        }
        if (!art('drawTwins', ctx, tw.x, tw.y, { t, throwK: tw.throwK, facing: tw.facing, moving: tw.mode === 'run' || tw.mode === 'back', walk: tw.walkT })) {
          ctx.fillStyle = '#6b2e3e'; ctx.fillRect(tw.x - 14, tw.y - 38, 12, 38); ctx.fillRect(tw.x + 2, tw.y - 38, 12, 38);
        }
      }
      for (const j of this.janitors) {
        const ex = j.x + j.facing * 10, ey = j.y - J_EYE + 4;
        {
          const len = this._coneLen(j, j.y - J_EYE, J_VIEW);
          if (!art('drawFlashlight', ctx, ex, ey, { facing: j.facing, len, ang: J_ANG, t, origin: true })) {
            ctx.save(); ctx.fillStyle = 'rgba(247,200,115,0.22)'; ctx.beginPath(); ctx.moveTo(ex, ey);
            ctx.lineTo(ex + j.facing * len, ey - Math.tan(J_ANG) * len); ctx.lineTo(ex + j.facing * len, ey + Math.tan(J_ANG) * len);
            ctx.closePath(); ctx.fill(); ctx.restore();
          }
        }
        const st = (j.state === 'patrol' || j.state === 'return') ? 'walk' : j.state === 'investigate' ? 'investigate' : j.state === 'notice' || j.state === 'caught' ? 'alert' : 'look';
        if (!art('drawJanitor', ctx, j.x, j.y, { facing: j.facing, t: t + j.walkT, state: st, alert: j.alert })) {
          ctx.fillStyle = '#3b5230'; ctx.fillRect(j.x - 10, j.y - 52, 20, 52);
          ctx.fillStyle = '#f2ece4'; ctx.beginPath(); ctx.arc(j.x, j.y - 56, 8, 0, 7); ctx.fill();
        }
      }
      for (const b of this.balloons) {
        if (!art('drawBalloon', ctx, b.x, b.y, { t, splash: b.splash > 0 ? Math.min(1, b.splash / 0.5) : 0 })) {
          ctx.fillStyle = b.splash > 0 ? 'rgba(140,190,230,0.6)' : '#7fb7e6';
          ctx.beginPath(); ctx.arc(b.x, b.y, b.splash > 0 ? 18 : 7, 0, 7); ctx.fill();
        }
      }
    }
  }

  G.Npcs = Npcs;
})();
