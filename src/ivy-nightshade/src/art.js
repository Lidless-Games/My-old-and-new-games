(function () {
  const G = window.G;
  const CFG = G.CFG;
  const P = CFG.PAL;
  const TAU = Math.PI * 2;
  const TILE = CFG.TILE;
  const VW = CFG.VIEW_W, VH = CFG.VIEW_H;
  const FONT = 'Georgia, "Times New Roman", serif';
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI;

  // ---------------------------------------------------------------- helpers
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function ink(a) { return 'rgba(20,16,24,' + a + ')'; }
  function hh(a, b) { // deterministic hash 0..1
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function ell(c, x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function fs(c, fill, lw, sa) { // fill + soft ink outline of current path
    if (fill) { c.fillStyle = fill; c.fill(); }
    c.strokeStyle = ink(sa == null ? 0.55 : sa); c.lineWidth = lw == null ? 1.2 : lw;
    c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
  }
  function rr(c, x, y, w, h, r) { // rounded rect path
    r = min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }
  function limb(c, x1, y1, x2, y2, w, col, cx, cy) { // outlined round stroke (optionally bent)
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (let k = 0; k < 2; k++) {
      c.beginPath(); c.moveTo(x1, y1);
      if (cx != null) c.quadraticCurveTo(cx, cy, x2, y2); else c.lineTo(x2, y2);
      c.lineWidth = k === 0 ? w + 1.5 : w; c.strokeStyle = k === 0 ? ink(0.5) : col; c.stroke();
    }
  }
  function line(c, x1, y1, x2, y2, col, w) {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = col; c.lineWidth = w || 1; c.lineCap = 'round'; c.stroke();
  }

  // cached soft glow sprites (radial gradient baked once)
  const glowCache = {};
  function glowSprite(key, r, g, b) {
    let s = glowCache[key];
    if (!s) {
      s = document.createElement('canvas'); s.width = s.height = 64;
      const c = s.getContext('2d');
      const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',1)');
      gr.addColorStop(0.35, 'rgba(' + r + ',' + g + ',' + b + ',0.4)');
      gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
      c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
      glowCache[key] = s;
    }
    return s;
  }
  function glow(c, x, y, rad, alpha, kind) {
    const k = kind || 'amber';
    const s = k === 'amber' ? glowSprite('amber', 243, 170, 70) : k === 'green' ? glowSprite('green', 155, 211, 90)
      : k === 'blue' ? glowSprite('blue', 190, 210, 255) : k === 'red' ? glowSprite('red', 200, 60, 80) : glowSprite('moon', 201, 207, 224);
    const pa = c.globalAlpha; c.globalAlpha = pa * alpha;
    c.drawImage(s, x - rad, y - rad, rad * 2, rad * 2);
    c.globalAlpha = pa;
  }

  function flame(c, x, y, s, t, seed) { // y = base of flame, grows upward
    seed = seed || 0;
    const fl = 1 + 0.14 * sin(t * 13 + seed) + 0.08 * sin(t * 31 + seed * 2.3);
    const sx = sin(t * 9 + seed * 1.7) * 0.7 * s;
    const h = 7 * s * fl, w = 2.6 * s;
    c.beginPath();
    c.moveTo(x, y);
    c.bezierCurveTo(x - w * 1.5, y - h * 0.3, x - w * 0.6, y - h * 0.7, x + sx, y - h);
    c.bezierCurveTo(x + w * 0.6, y - h * 0.7, x + w * 1.5, y - h * 0.3, x, y);
    c.fillStyle = 'rgba(243,160,58,0.95)'; c.fill();
    c.beginPath();
    c.moveTo(x, y - 0.3 * s);
    c.bezierCurveTo(x - w * 0.8, y - h * 0.25, x - w * 0.3, y - h * 0.5, x + sx * 0.5, y - h * 0.68);
    c.bezierCurveTo(x + w * 0.3, y - h * 0.5, x + w * 0.8, y - h * 0.25, x, y - 0.3 * s);
    c.fillStyle = P.amberLight; c.fill();
  }

  // ---------------------------------------------------------------- IVY
  function blink(t) { const m = t % 4.3; return m > 4.1 ? 1 - abs((m - 4.2) / 0.1) : 0; }

  function braid(c, ax, ay, side, o) {
    // chain of links hanging from (ax,ay). o: {t, sway, lift, ph}
    const n = 6, L = 3.9;
    let px = ax, py = ay;
    const pts = [[px, py]];
    for (let i = 0; i < n; i++) {
      const k = (i + 1) / n;
      const sw = o.sway * sin(o.t * o.sf - i * 0.55 + o.phase) * k;
      const ang = PI / 2 - side * (0.1 + o.lift * k * k) + sw;
      px += cos(ang) * L; py += sin(ang) * L;
      pts.push([px, py]);
    }
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[i + 1];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const k = i / n;
      ell(c, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, L * 0.78, 2.75 - k * 0.7, ang);
      fs(c, '#100c15', 0.8, 0.5);
      // braid sheen
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
      c.strokeStyle = 'rgba(120,110,150,0.32)'; c.lineWidth = 0.8; c.stroke();
    }
    // ribbon bow
    const e = pts[n], pa = pts[n - 1];
    const ea = Math.atan2(e[1] - pa[1], e[0] - pa[0]);
    c.save(); c.translate(e[0], e[1]); c.rotate(ea - PI / 2);
    ell(c, -2.6, 0.6, 2.8, 1.7, -0.5); fs(c, P.bordeauxLight, 0.7, 0.5);
    ell(c, 2.6, 0.6, 2.8, 1.7, 0.5); fs(c, P.bordeauxLight, 0.7, 0.5);
    ell(c, 0, 0.5, 1.3, 1.3); fs(c, P.bordeaux, 0.6, 0.5);
    // little hair tip
    c.beginPath(); c.moveTo(-0.8, 1.6); c.quadraticCurveTo(0, 5.5, 0.8, 1.6);
    c.fillStyle = '#100c15'; c.fill();
    c.restore();
  }

  function candle(c, hx, hy, t, lit) {
    // holder dish + candle with flame, hx/hy = hand position. lit 0..1 (undefined = 1)
    if (lit == null) lit = 1;
    if (lit > 0.02) glow(c, hx, hy - 9, 22 * (0.4 + 0.6 * lit), (0.30 + 0.05 * sin(t * 11)) * lit, 'amber');
    rr(c, hx - 1.6, hy - 7, 3.2, 7.2, 1); fs(c, P.cream, 0.7, 0.5);
    c.beginPath(); c.moveTo(hx - 0.9, hy - 7); c.quadraticCurveTo(hx - 1.2, hy - 5, hx - 0.4, hy - 4.6);
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.7; c.stroke();
    ell(c, hx, hy + 0.6, 4, 1.4); fs(c, '#8a6a3a', 0.7, 0.5);
    line(c, hx, hy - 7, hx, hy - 7.8, '#2a1f26', 0.8);
    if (lit > 0.02) flame(c, hx, hy - 7.6, lit * (1 + 0.45 * (1 - lit)), t, 0.5);
  }

  function smokeWisp(c, x, y, t, a) { // tiny curl of smoke rising from (x,y) (never rotated)
    if (a <= 0.01) return;
    c.save(); c.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      c.beginPath();
      for (let i = 0; i <= 10; i++) {
        const u = i / 10, ph = t * 1.8 - u * 3 + k * 1.7;
        const px = x + sin(ph * 1.6) * (1 + u * 3.2) + k * 1.4, py = y - u * 15 - k * 2;
        if (i) c.lineTo(px, py); else c.moveTo(px, py);
      }
      c.strokeStyle = 'rgba(190,185,205,' + (a * (k ? 0.28 : 0.5)) + ')'; c.lineWidth = 1.5 - k * 0.5; c.stroke();
    }
    c.restore();
  }

  function drawIvy(c, x, y, o) {
    o = o || {};
    const st = o.state || 'idle';
    if (st === 'hidden') return;
    if (st === 'down') return ivyDown(c, x, y, o);
    if (st === 'getup') return ivyGetup(c, x, y, o);
    if (st === 'front') return ivyFront(c, x, y, o);
    const f = o.facing < 0 ? -1 : 1, t = o.t || 0;
    const climbing = st === 'climb';
    let ph = 0, crouch = 0, lean = 0, bob = 0, amp = 1, tuck = 0, braidLift = 0, braidSway = 0.05, sf = 1.8;
    let swing = 0;
    if (st === 'walk' || st === 'sneak') {
      const base = st === 'walk' ? CFG.WALK_SPEED : CFG.SNEAK_SPEED;
      amp = o.speed == null ? 1 : (st === 'sneak' && o.speed < 3 ? 0 : clamp(o.speed / base, 0.25, 1.15));
    }
    if (st === 'walk') { ph = t * 10.5; swing = sin(ph); bob = -abs(sin(ph)) * 1.7 * amp; lean = 1.4; braidSway = 0.22 * amp + 0.05; sf = 10.5; }
    else if (st === 'sneak') { ph = t * 6.2; swing = sin(ph); crouch = 0; lean = 4.5; bob = sin(ph * 2) * 0.5 * amp + sin(t * 2.1) * 0.3 * (1 - amp); braidSway = 0.1 + 0.05 * (1 - amp); sf = 6.2; }
    else if (st === 'jump') { tuck = 1; braidLift = 0.15; braidSway = 0.1; sf = 8; lean = 1; }
    else if (st === 'fall') { tuck = 0.5; braidLift = 1.15; braidSway = 0.18; sf = 12; }
    else if (climbing) { ph = t * 7; bob = -abs(sin(ph)) * 0.8; braidSway = 0.1; sf = 7; }
    else { bob = sin(t * 2.1) * 0.6; braidSway = 0.05; sf = 1.8; }

    c.save();
    c.translate(x, y); c.scale(f, 1);
    // ground shadow
    c.fillStyle = 'rgba(10,6,16,0.28)'; ell(c, 0, 0.5, 11 - crouch * 0.2, 2.4); c.fill();

    const sneaking = st === 'sneak';
    const SN_ROT = 1.0, SN_SC = 0.86; // deep forward crouch: whole upper body folds over the bent knees
    const hipY = sneaking ? -9 : -15 + crouch * 0.5;
    const hemY = sneaking ? -7.5 : -12.5 + crouch * 0.5;
    const waistY = sneaking ? hipY - 12 + bob : -27 + crouch * 0.9 + bob;
    const shY = sneaking ? hipY - 21 + bob : -36 + crouch * 0.9 + bob;
    const headY = shY - 7.6;
    const dsw = (st === 'walk' ? sin(ph) * 1.6 * amp : st === 'sneak' ? sin(ph) * 1.0 : sin(t * 1.4) * 0.4) + (st === 'fall' ? 0 : 0);

    // ---- legs
    for (let i = -1; i <= 1; i += 2) {
      const hx = i * 2.7;
      let fx = hx, fy = 0, kx = hx + 1, ky = (hipY + 0) * 0.5;
      const pp = ph + (i > 0 ? 0 : PI);
      if (st === 'walk') { fx = hx + sin(pp) * 6 * amp; fy = -max(0, cos(pp)) * 3.6 * amp; kx = (hx + fx) / 2 + 1.2; }
      else if (st === 'sneak') { fx = hx + i * 0.8 + sin(pp) * 4 * amp + 2.5; fy = -max(0, cos(pp)) * 3 * amp; kx = (hx + fx) / 2 + 6.5; ky = (hipY + fy) / 2 + 0.5; }
      else if (st === 'jump') { fx = hx + i * 2.5; fy = -6; kx = hx + i * 4 + 2; ky = -9; }
      else if (st === 'fall') { fx = hx + i * 5.5; fy = -2.5; kx = hx + i * 4; ky = -8; }
      else if (climbing) { fx = hx; fy = -max(0, sin(pp)) * 4 - 1; kx = hx + (i > 0 ? 2 : -2); ky = -8 - max(0, sin(pp)) * 2; }
      const col = '#1a1620';
      limb(c, hx, hipY, fx, fy - 1.8, 3.4, col, kx, ky);
      // boot
      ell(c, fx + 1.2, fy - 1.3, 3.9, 2.2, 0.0); fs(c, '#2c2030', 0.8, 0.55);
      c.beginPath(); c.moveTo(fx - 1, fy - 2.6); c.quadraticCurveTo(fx + 1.5, fy - 3.4, fx + 3.5, fy - 2.4);
      c.strokeStyle = 'rgba(200,190,220,0.22)'; c.lineWidth = 0.7; c.stroke();
    }

    // ---- upper body (leans around the hip)
    c.save();
    c.translate(0, hipY); c.rotate(sneaking ? SN_ROT : lean * 0.022); if (sneaking) c.scale(SN_SC, SN_SC); c.translate(0, -hipY);

    const back = climbing;
    const sideLift = braidLift;
    const bo = { t, sway: braidSway, lift: sideLift, sf, phase: 0 };
    // far braid (left)
    if (!back) { bo.phase = 0; braid(c, -7.4, headY + 2.8, -1, bo); }

    // back arm
    let bhx = -7.2 - swing * 1.8, bhy = waistY + 4 + bob * 0.2;
    if (st === 'jump') { bhx = -10; bhy = shY - 2; } else if (st === 'fall') { bhx = -10; bhy = shY - 7; }
    if (st === 'sneak') { bhx = -3; bhy = waistY + 8; }
    let fhx = 10.5 + swing * 1.2, fhy = waistY + 1 + bob * 0.2;
    if (st === 'sneak') { fhx = 11; fhy = waistY + 7; }
    if (st === 'jump') { fhx = 11; fhy = shY + 2; } else if (st === 'fall') { fhx = 11; fhy = shY - 3; }
    if (climbing) {
      const a = sin(ph), b = -a;
      bhx = -5.5; bhy = shY - 11 - a * 5;
      fhx = 5.5; fhy = shY - 11 - b * 5;
    }
    limb(c, -4.6, shY + 1.8, bhx, bhy, 3.5, '#211b2b', (-4.6 + bhx) / 2 - 1.5, (shY + bhy) / 2 + 1);
    ell(c, bhx, bhy, 2.1, 2.1); fs(c, P.skin, 0.6, 0.5);

    // dress
    const d = dsw;
    c.beginPath();
    c.moveTo(-5.4, shY);
    c.quadraticCurveTo(-6.2, waistY - 3, -4.4, waistY);
    c.bezierCurveTo(-8, waistY + 3, -11 + d * 0.5, hemY - 5, -12.2 + d, hemY);
    c.quadraticCurveTo(-6 + d, hemY + 2.4, 0 + d, hemY + 0.5);
    c.quadraticCurveTo(6 + d, hemY + 2.4, 12.2 + d, hemY);
    c.bezierCurveTo(11 + d * 0.5, hemY - 5, 8, waistY + 3, 4.4, waistY);
    c.quadraticCurveTo(6.2, waistY - 3, 5.4, shY);
    c.quadraticCurveTo(0, shY - 2.4, -5.4, shY);
    fs(c, '#231c2d', 1.2, 0.6);
    // folds & sheen
    c.strokeStyle = 'rgba(140,125,175,0.22)'; c.lineWidth = 0.8; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-3.5 + d * 0.2, waistY + 3); c.quadraticCurveTo(-6 + d * 0.5, (waistY + hemY) / 2, -7 + d, hemY - 1); c.stroke();
    c.beginPath(); c.moveTo(3.5 + d * 0.2, waistY + 3); c.quadraticCurveTo(6 + d * 0.5, (waistY + hemY) / 2, 7.5 + d, hemY - 1); c.stroke();
    c.beginPath(); c.moveTo(0, waistY + 3); c.quadraticCurveTo(0.5 + d * 0.3, (waistY + hemY) / 2, d * 0.8, hemY - 0.5); c.stroke();
    c.beginPath(); c.moveTo(-4.2, shY + 1.5); c.quadraticCurveTo(-5.2, shY + 5, -3.8, waistY - 1); c.stroke();
    // belt
    c.beginPath(); c.moveTo(-4.6, waistY - 0.4); c.quadraticCurveTo(0, waistY + 1.4, 4.6, waistY - 0.4);
    c.strokeStyle = P.bordeaux; c.lineWidth = 1.7; c.stroke();
    // hem trim
    c.beginPath(); c.moveTo(-12 + d, hemY - 0.6); c.quadraticCurveTo(-6 + d, hemY + 1.6, 0 + d, hemY - 0.1); c.quadraticCurveTo(6 + d, hemY + 1.6, 12 + d, hemY - 0.6);
    c.strokeStyle = 'rgba(142,66,86,0.55)'; c.lineWidth = 0.9; c.stroke();

    // neck
    if (!back) { rr(c, -2, shY - 3.5, 4, 5, 1.5); fs(c, '#e6dccf', 0.6, 0.4); }

    // collar (white pointed)
    if (!back) {
      c.beginPath(); c.moveTo(0.4, shY + 0.8); c.quadraticCurveTo(-3.4, shY - 2.2, -6.4, shY - 1.2);
      c.quadraticCurveTo(-6.2, shY + 2.5, -5.2, shY + 5.8); c.quadraticCurveTo(-2, shY + 3.6, 0.4, shY + 0.8);
      fs(c, '#f7f2ea', 0.9, 0.55);
      c.beginPath(); c.moveTo(-0.4, shY + 0.8); c.quadraticCurveTo(3.4, shY - 2.2, 6.4, shY - 1.2);
      c.quadraticCurveTo(6.2, shY + 2.5, 5.2, shY + 5.8); c.quadraticCurveTo(2, shY + 3.6, -0.4, shY + 0.8);
      fs(c, '#fbf7f0', 0.9, 0.55);
      // brooch
      ell(c, 0, shY + 1.6, 1.3, 1.3); fs(c, P.bordeauxLight, 0.5, 0.5);
    } else {
      c.beginPath(); c.moveTo(-5.4, shY - 0.4); c.quadraticCurveTo(0, shY + 3.4, 5.4, shY - 0.4); c.quadraticCurveTo(0, shY + 0.4, -5.4, shY - 0.4);
      fs(c, '#f1ece2', 0.7, 0.45);
    }

    // front arm + candle
    limb(c, 4.6, shY + 1.8, fhx, fhy, 3.5, '#2a2236', (4.6 + fhx) / 2 + 1.5, (shY + fhy) / 2 + 1.5);
    if (!climbing) {
      if (sneaking) { c.save(); c.translate(fhx, fhy); c.rotate(-SN_ROT); candle(c, 0, 0, t); c.restore(); }
      else candle(c, fhx, fhy, t);
      ell(c, fhx, fhy, 2.2, 2.2); fs(c, P.skin, 0.6, 0.5);
    } else {
      ell(c, fhx, fhy, 2.2, 2.2); fs(c, P.skin, 0.6, 0.5);
      ell(c, bhx, bhy, 2.2, 2.2); fs(c, P.skin, 0.6, 0.5);
      // candle tucked at the hip
      candle(c, 9, waistY + 6, t);
    }

    // near braid(s)
    if (!back) { bo.phase = 1.3; braid(c, 7.4, headY + 2.8, 1, bo); }
    else { bo.phase = 0; braid(c, -2.6, headY + 5, -1, bo); bo.phase = 1.3; braid(c, 2.6, headY + 5, 1, bo); }

    // ---- head
    if (sneaking) { c.save(); c.translate(0, headY); c.rotate(-0.75); c.translate(0, -headY); }
    ell(c, 0, headY, 8.2, 8.7); fs(c, back ? '#17121d' : P.skin, 1.1, 0.6);
    if (!back) {
      // ear hint & cheeks
      const fx = 1.5;
      // hair: cap + bangs
      c.beginPath();
      c.moveTo(-8.7, headY + 3.4);
      c.bezierCurveTo(-10, headY - 7, -5, headY - 11.2, 0, headY - 10.6);
      c.bezierCurveTo(6, headY - 11.2, 10, headY - 6, 8.7, headY + 3.4);
      c.bezierCurveTo(8.6, headY - 0.2, 7.6, headY - 2.4, 6.2, headY - 3.4);
      c.bezierCurveTo(3.6, headY - 3.4, 1, headY - 4.8, -1.6, headY - 5.4);
      c.bezierCurveTo(-4, headY - 4, -7.4, headY - 2.6, -8.7, headY + 3.4);
      fs(c, '#17121d', 1, 0.6);
      c.beginPath(); c.moveTo(-5.5, headY - 8); c.quadraticCurveTo(-1, headY - 10.6, 4, headY - 9.2);
      c.strokeStyle = 'rgba(150,140,190,0.4)'; c.lineWidth = 1.1; c.stroke();
      // face
      const bl = blink(t);
      for (let i = -1; i <= 1; i += 2) {
        const ex = i * 3.5 + fx, ey = headY + 0.4;
        // under-eye shadow
        c.beginPath(); c.arc(ex, ey + 1.4, 2.3, 0.2, PI - 0.2); c.strokeStyle = 'rgba(110,80,120,0.2)'; c.lineWidth = 0.8; c.stroke();
        // eye: small white with pupil, covered by a flat heavy lid (half-lidded, deadpan)
        const eh = 2.3 * (1 - bl * 0.85);
        ell(c, ex, ey, 2.4, 2.3); c.fillStyle = '#fbf8f2'; c.fill();
        c.beginPath(); c.arc(ex + fx * 0.25, ey + 0.5, 1.35, 0, TAU); c.fillStyle = '#2a1c2c'; c.fill();
        c.beginPath(); c.arc(ex + fx * 0.25 + 0.5, ey + 0.1, 0.45, 0, TAU); c.fillStyle = '#fff'; c.fill();
        // lid (skin) over the upper half
        c.save(); c.beginPath(); c.ellipse(ex, ey, 2.5, 2.4, 0, 0, TAU); c.clip();
        c.fillStyle = '#f0e8de'; c.fillRect(ex - 3, ey - 3, 6, 3 + 0.2 + (bl * 2.6));
        c.restore();
        c.beginPath(); c.moveTo(ex - 2.7, ey + 0.2 + bl * 2.4); c.lineTo(ex + 2.7, ey + 0.2 + bl * 2.4);
        c.strokeStyle = ink(0.85); c.lineWidth = 1.1; c.stroke();
        // brow, flat & slightly sceptical
        c.beginPath(); c.moveTo(ex - 2.4, ey - 3.0); c.lineTo(ex + 2.4, ey - 3.5 + (i > 0 ? 0.3 : 0));
        c.strokeStyle = 'rgba(30,22,36,0.55)'; c.lineWidth = 0.7; c.stroke();
        // cheek
        ell(c, ex + i * 1.2, ey + 3.6, 1.8, 1.0); c.fillStyle = 'rgba(176,86,100,0.16)'; c.fill();
      }
      // flat mouth
      c.beginPath(); c.moveTo(fx - 1.9, headY + 5.2); c.lineTo(fx + 1.9, headY + 5.2);
      c.strokeStyle = 'rgba(70,40,55,0.85)'; c.lineWidth = 0.95; c.stroke();
      // nose dot
      c.beginPath(); c.arc(fx + 0.4, headY + 3.0, 0.45, 0, TAU); c.fillStyle = 'rgba(150,110,110,0.5)'; c.fill();
    } else {
      c.beginPath(); c.moveTo(-5.5, headY - 8); c.quadraticCurveTo(-1, headY - 10.4, 4, headY - 9);
      c.strokeStyle = 'rgba(150,140,190,0.4)'; c.lineWidth = 1.1; c.stroke();
      line(c, 0, headY - 7, 0, headY + 1, 'rgba(0,0,0,0.5)', 0.8);
    }
    if (sneaking) c.restore();
    c.restore(); // lean
    c.restore();
  }

  // ---------------------------------------------------------------- IVY: lying / getting up (posed figure)
  const ss = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const lerp = (a, b, u) => a + (b - a) * u;
  function rot2(a, x, y) { const s = sin(a), k = cos(a); return [x * k - y * s, x * s + y * k]; }

  // world-space braid chain with gravity + floor clamp (frame: y=0 floor)
  function braidW(c, ax, ay, a0, o) {
    const n = 6, L = 3.9, pts = [[ax, ay]];
    let px = ax, py = ay;
    for (let i = 0; i < n; i++) {
      const k = (i + 1) / n;
      const a = a0 + o.sway * sin(o.t * o.sf - i * 0.55 + o.phase) * k + (o.curl || 0) * k;
      px += cos(a) * L; py += sin(a) * L;
      if (py > -2.2) py = -2.2;
      pts.push([px, py]);
    }
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[i + 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      ell(c, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, L * 0.78, 2.75 - (i / n) * 0.7, ang);
      fs(c, '#100c15', 0.8, 0.5);
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
      c.strokeStyle = 'rgba(120,110,150,0.32)'; c.lineWidth = 0.8; c.stroke();
    }
    const e = pts[n], pa = pts[n - 1];
    c.save(); c.translate(e[0], e[1]); c.rotate(Math.atan2(e[1] - pa[1], e[0] - pa[0]) - PI / 2);
    ell(c, -2.6, 0.6, 2.8, 1.7, -0.5); fs(c, P.bordeauxLight, 0.7, 0.5);
    ell(c, 2.6, 0.6, 2.8, 1.7, 0.5); fs(c, P.bordeauxLight, 0.7, 0.5);
    ell(c, 0, 0.5, 1.3, 1.3); fs(c, P.bordeaux, 0.6, 0.5);
    c.beginPath(); c.moveTo(-0.8, 1.6); c.quadraticCurveTo(0, 5.5, 0.8, 1.6); c.fillStyle = '#100c15'; c.fill();
    c.restore();
  }

  function legIK(c, hx, hy, fx, fy, w) {
    const S = 7.7;
    let dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy);
    if (d > 2 * S - 0.2) { fx = hx + dx / d * (2 * S - 0.2); fy = hy + dy / d * (2 * S - 0.2); dx = fx - hx; dy = fy - hy; d = 2 * S - 0.2; }
    const hgt = Math.max(0.9, Math.sqrt(Math.max(0, S * S - d * d / 4)));
    let nx = -dy / d, ny = dx / d;
    if (nx * 0.5 - ny < 0) { nx = -nx; ny = -ny; } // knee bends forward/up
    const kx = (hx + fx) / 2 + nx * hgt, ky = (hy + fy) / 2 + ny * hgt;
    limb(c, hx, hy, fx, fy, w, '#1a1620', kx, ky);
    // quadratic control -> actual curve passes about halfway to control; fine for a cartoon
    ell(c, fx + 1.2, fy - 0.4, 3.9, 2.2, 0); fs(c, '#2c2030', 0.8, 0.55);
    c.beginPath(); c.moveTo(fx - 1, fy - 1.7); c.quadraticCurveTo(fx + 1.5, fy - 2.5, fx + 3.5, fy - 1.5);
    c.strokeStyle = 'rgba(200,190,220,0.22)'; c.lineWidth = 0.7; c.stroke();
  }

  function faceHead(c, headY, t, lid, fx) { // head at (0,headY) in current frame; lid 1 = closed
    ell(c, 0, headY, 8.2, 8.7); fs(c, P.skin, 1.1, 0.6);
    c.beginPath();
    c.moveTo(-8.7, headY + 3.4);
    c.bezierCurveTo(-10, headY - 7, -5, headY - 11.2, 0, headY - 10.6);
    c.bezierCurveTo(6, headY - 11.2, 10, headY - 6, 8.7, headY + 3.4);
    c.bezierCurveTo(8.6, headY - 0.2, 7.6, headY - 2.4, 6.2, headY - 3.4);
    c.bezierCurveTo(3.6, headY - 3.4, 1, headY - 4.8, -1.6, headY - 5.4);
    c.bezierCurveTo(-4, headY - 4, -7.4, headY - 2.6, -8.7, headY + 3.4);
    fs(c, '#17121d', 1, 0.6);
    c.beginPath(); c.moveTo(-5.5, headY - 8); c.quadraticCurveTo(-1, headY - 10.6, 4, headY - 9.2);
    c.strokeStyle = 'rgba(150,140,190,0.4)'; c.lineWidth = 1.1; c.stroke();
    const bl = max(lid, blink(t) * (1 - lid));
    for (let i = -1; i <= 1; i += 2) {
      const ex = i * 3.5 + fx, ey = headY + 0.4;
      c.beginPath(); c.arc(ex, ey + 1.4, 2.3, 0.2, PI - 0.2); c.strokeStyle = 'rgba(110,80,120,0.2)'; c.lineWidth = 0.8; c.stroke();
      if (bl < 0.97) {
        ell(c, ex, ey, 2.4, 2.3); c.fillStyle = '#fbf8f2'; c.fill();
        c.beginPath(); c.arc(ex + fx * 0.25, ey + 0.5, 1.35, 0, TAU); c.fillStyle = '#2a1c2c'; c.fill();
        c.save(); c.beginPath(); c.ellipse(ex, ey, 2.5, 2.4, 0, 0, TAU); c.clip();
        c.fillStyle = '#f0e8de'; c.fillRect(ex - 3, ey - 3, 6, 3.2 + bl * 2.6);
        c.restore();
      }
      c.beginPath(); c.moveTo(ex - 2.7, ey + 0.2 + bl * 2.4); c.lineTo(ex + 2.7, ey + 0.2 + bl * 2.4);
      c.strokeStyle = ink(0.85); c.lineWidth = 1.1; c.stroke();
      c.beginPath(); c.moveTo(ex - 2.4, ey - 3.0 + bl * 0.6); c.lineTo(ex + 2.4, ey - 3.5 + (i > 0 ? 0.3 : 0) + bl * 0.6);
      c.strokeStyle = 'rgba(30,22,36,0.55)'; c.lineWidth = 0.7; c.stroke();
      ell(c, ex + i * 1.2, ey + 3.6, 1.8, 1.0); c.fillStyle = 'rgba(176,86,100,0.16)'; c.fill();
    }
    c.beginPath(); c.moveTo(fx - 1.9, headY + 5.2); c.lineTo(fx + 1.9, headY + 5.2);
    c.strokeStyle = 'rgba(70,40,55,0.85)'; c.lineWidth = 0.95; c.stroke();
    c.beginPath(); c.arc(fx + 0.4, headY + 3.0, 0.45, 0, TAU); c.fillStyle = 'rgba(150,110,110,0.5)'; c.fill();
  }

  // p: {t, hx, hy, ang, sq, headRel, lid, feet:[[x,y],[x,y]], reach, candle:{x,y}, hold, lit, trail, wob, dust}
  function ivyFigure(c, p) {
    const t = p.t, ang = p.ang, sq = p.sq;
    const shY = -21, waistY = -12, hemY = 2.5, headY = -28.6;
    const W = (x, y) => { const r = rot2(ang, x, y); return [p.hx + r[0], p.hy + r[1]]; };           // torso-local -> frame
    const Lc = (x, y) => { const dx = x - p.hx, dy = y - p.hy, k = cos(ang), s = sin(ang); return [dx * k + dy * s, -dx * s + dy * k]; };
    const lying = clamp(-ang / 1.2, 0, 1);

    // floor shadow
    c.fillStyle = 'rgba(10,6,16,0.28)'; ell(c, p.hx + (p.feet[0][0] - p.hx) * 0.3 - 4 * lying, 0.5, 11 + 14 * lying, 2.4); c.fill();

    // dust (drag)
    if (p.dust) {
      for (let i = 0; i < 4; i++) {
        const u = ((p.t * 1.6 + i / 4) % 1), fx = p.feet[0][0] + 3 + u * 9 + i * 1.5;
        ell(c, fx, -1.5 - u * 5 - i * 0.6, 1.7 + u * 3, 1.3 + u * 2.2);
        c.fillStyle = 'rgba(210,200,190,' + (0.38 * (1 - u)) + ')'; c.fill();
      }
    }

    // far braid
    const hd = W(0, headY);
    const spread = p.trail ? 0.1 : 0;
    const bo = { t, sway: 0.06 + (p.trail ? 0.14 : 0) + 0.12 * (1 - lying), sf: p.trail ? 9 : 2.5, phase: 0, curl: 0 };
    const aStandFar = PI / 2 + ang * 0.9 + 0.1, aStandNear = PI / 2 + ang * 0.9 - 0.1;
    const aFar = p.trail ? 0.18 : lerp(aStandFar, PI - 0.22, lying), aNear = p.trail ? 0.38 : lerp(aStandNear, 0.42, lying);
    { const a = W(-7.4, headY + 2.8); braidW(c, a[0], a[1], aFar, bo); }

    // legs (behind dress)
    for (let i = -1; i <= 1; i += 2) {
      const o = W(i * 2.7 * sq, 0), fo = p.feet[i > 0 ? 0 : 1];
      legIK(c, o[0], o[1], fo[0], fo[1], 3.4);
    }

    // torso frame
    c.save(); c.translate(p.hx, p.hy); c.rotate(ang);
    // back arm
    {
      const bx = -8.5 * (0.4 + 0.6 * sq), by = waistY + 5 + (p.wob || 0);
      limb(c, -4.6 * sq, shY + 1.8, bx, by, 3.5, '#211b2b', (-4.6 * sq + bx) / 2 - 1, (shY + by) / 2 + 1);
      ell(c, bx, by, 2.1, 2.1); fs(c, P.skin, 0.6, 0.5);
    }
    // dress (squashed sideways while lying so it stays low)
    c.save(); c.scale(sq, 1);
    const d = p.trail ? 3 : 0;
    c.beginPath();
    c.moveTo(-5.4, shY);
    c.quadraticCurveTo(-6.2, waistY - 3, -4.4, waistY);
    c.bezierCurveTo(-8, waistY + 3, -11, hemY - 5, -12.2 + d, hemY);
    c.quadraticCurveTo(-6 + d, hemY + 2.4, 0 + d, hemY + 0.5);
    c.quadraticCurveTo(6 + d, hemY + 2.4, 12.2 + d, hemY);
    c.bezierCurveTo(11, hemY - 5, 8, waistY + 3, 4.4, waistY);
    c.quadraticCurveTo(6.2, waistY - 3, 5.4, shY);
    c.quadraticCurveTo(0, shY - 2.4, -5.4, shY);
    fs(c, '#231c2d', 1.2 / max(sq, 0.5), 0.6);
    c.strokeStyle = 'rgba(140,125,175,0.22)'; c.lineWidth = 0.8; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-3.5, waistY + 3); c.quadraticCurveTo(-6, (waistY + hemY) / 2, -7 + d, hemY - 1); c.stroke();
    c.beginPath(); c.moveTo(3.5, waistY + 3); c.quadraticCurveTo(6, (waistY + hemY) / 2, 7.5 + d, hemY - 1); c.stroke();
    c.beginPath(); c.moveTo(0, waistY + 3); c.quadraticCurveTo(0.5, (waistY + hemY) / 2, d * 0.8, hemY - 0.5); c.stroke();
    c.beginPath(); c.moveTo(-4.6, waistY - 0.4); c.quadraticCurveTo(0, waistY + 1.4, 4.6, waistY - 0.4);
    c.strokeStyle = P.bordeaux; c.lineWidth = 1.7; c.stroke();
    c.beginPath(); c.moveTo(-12 + d, hemY - 0.6); c.quadraticCurveTo(-6 + d, hemY + 1.6, d, hemY - 0.1); c.quadraticCurveTo(6 + d, hemY + 1.6, 12 + d, hemY - 0.6);
    c.strokeStyle = 'rgba(142,66,86,0.55)'; c.lineWidth = 0.9; c.stroke();
    rr(c, -2, shY - 3.5, 4, 5, 1.5); fs(c, '#e6dccf', 0.6, 0.4);
    c.beginPath(); c.moveTo(0.4, shY + 0.8); c.quadraticCurveTo(-3.4, shY - 2.2, -6.4, shY - 1.2);
    c.quadraticCurveTo(-6.2, shY + 2.5, -5.2, shY + 5.8); c.quadraticCurveTo(-2, shY + 3.6, 0.4, shY + 0.8);
    fs(c, '#f7f2ea', 0.9, 0.55);
    c.beginPath(); c.moveTo(-0.4, shY + 0.8); c.quadraticCurveTo(3.4, shY - 2.2, 6.4, shY - 1.2);
    c.quadraticCurveTo(6.2, shY + 2.5, 5.2, shY + 5.8); c.quadraticCurveTo(2, shY + 3.6, -0.4, shY + 0.8);
    fs(c, '#fbf7f0', 0.9, 0.55);
    ell(c, 0, shY + 1.6, 1.3, 1.3); fs(c, P.bordeauxLight, 0.5, 0.5);
    c.restore();

    // front arm (+ reach to the candle)
    const rest = [8.8 * (0.4 + 0.6 * sq) + (1 - sq) * 2, waistY + 3];
    let hand = rest, candW = null;
    const cd = p.candle;
    if (cd) {
      const holdL = [10.5, waistY + 1];
      const holdW = W(holdL[0], holdL[1]);
      const hold = ss(p.hold || 0);
      candW = [lerp(cd.x, holdW[0], hold), lerp(cd.y, holdW[1], hold)];
      const rl = Lc(candW[0], candW[1]);
      hand = [lerp(rest[0], rl[0], ss(p.reach || 0)), lerp(rest[1], rl[1], ss(p.reach || 0))];
    }
    limb(c, 4.6 * sq, shY + 1.8, hand[0], hand[1], 3.5, '#2a2236', (4.6 * sq + hand[0]) / 2 + 1, (shY + hand[1]) / 2 + 1.5);
    c.restore(); // torso frame

    // head (frame coords, so the face can tilt on its own)
    const near = W(7.4, headY + 2.8);
    c.save(); c.translate(hd[0], hd[1]); c.rotate(ang + (p.headRel || 0)); c.translate(0, -headY);
    // (head drawn at its own origin: translate trick keeps headY centre at hd)
    faceHead(c, headY, t, p.lid, 1.5 * (1 - lying));
    c.restore();

    // near braid over the dress
    bo.phase = 1.3;
    braidW(c, near[0], near[1], aNear, bo);

    // candle (upright when held, lying on the floor otherwise)
    if (cd) {
      const hold = ss(p.hold || 0), lit = p.lit || 0;
      const a = lerp(PI / 2, ang * 0, hold);
      c.save(); c.translate(candW[0], candW[1]); c.rotate(a);
      candle(c, 0, 1.5 * (1 - hold), t, lit);
      c.restore();
      if (lit < 0.99) { const tip = rot2(a, 0, -8.6 + 1.5 * (1 - hold)); smokeWisp(c, candW[0] + tip[0], candW[1] + tip[1], t, (1 - lit) * (1 - 0.7 * hold) * (p.smoke == null ? 1 : p.smoke)); }
      // hand over the candle holder
      const hw = W(hand[0], hand[1]);
      if (hold > 0.02 || (p.reach || 0) > 0.5) { ell(c, hw[0], hw[1], 2.2, 2.2); fs(c, P.skin, 0.6, 0.5); }
    }
    if (!cd || (p.reach || 0) <= 0.5 && (p.hold || 0) <= 0.02) { const hw = W(hand[0], hand[1]); ell(c, hw[0], hw[1], 2.2, 2.2); fs(c, P.skin, 0.6, 0.5); }
  }

  function ivyDown(c, x, y, o) {
    const f = o.facing < 0 ? -1 : 1, t = o.t || 0, drag = !!o.drag;
    c.save(); c.translate(x, y); c.scale(f, 1);
    const wob = drag ? sin(t * 14) * 0.6 : 0;
    ivyFigure(c, {
      t, hx: 4 + (drag ? 1 : 0), hy: -6 + wob * 0.3, ang: -PI / 2 + 0.1, sq: 0.5, headRel: 0.9, lid: 1,
      feet: [[23, drag ? -4.5 + wob : -3], [20.5, drag ? -7 : -6.5]], candle: { x: 14, y: -3.5 }, reach: 0, hold: 0, lit: 0,
      trail: drag, dust: drag, wob: 0
    });
    c.restore();
  }

  function ivyGetup(c, x, y, o) {
    const f = o.facing < 0 ? -1 : 1, t = o.t || 0;
    const k = clamp(o.k == null ? 0 : o.k, 0, 1);
    const s1 = ss(k / 0.5), s2 = ss((k - 0.5) / 0.5);
    const hold = ss((k - 0.58) / 0.28);
    // slow, grumpy yawn-sag between sitting and rising
    const sag = sin(clamp((k - 0.35) / 0.3, 0, 1) * PI) * 0.12;
    const ang = (k < 0.5 ? lerp(-PI / 2 + 0.1, 0.22, s1) : lerp(0.22, 0.0, s2)) + sag * (k < 0.5 ? 1 : 0) + (k > 0.5 ? 0.05 * sin(s2 * PI) : 0);
    const hx = k < 0.5 ? lerp(4, -1, s1) : lerp(-1, 0, s2);
    const hy = k < 0.5 ? lerp(-6, -3.5, s1) : lerp(-3.5, -15, s2);
    const feetL = [[23, -3], [20.5, -6.5]], feetS = [[21, -1.5], [17.5, -4]], feetU = [[2.7, 0], [-2.7, 0]];
    const feet = [0, 1].map(i => {
      if (k < 0.5) return [lerp(feetL[i][0], feetS[i][0], s1), lerp(feetL[i][1], feetS[i][1], s1)];
      // feet slide in, with a small lift
      const lift = sin(s2 * PI) * 2.2 * (i ? 1 : 0.6);
      return [lerp(feetS[i][0], feetU[i][0], s2), lerp(feetS[i][1], feetU[i][1], s2) - lift];
    });
    c.save(); c.translate(x, y); c.scale(f, 1);
    ivyFigure(c, {
      t, hx, hy, ang, sq: lerp(0.5, 1, s1), headRel: lerp(0.9, 0.12, s1) * (1 - s2) + (k > 0.5 ? 0 : 0), lid: 1 - ss((k - 0.12) / 0.32),
      feet, candle: { x: 14, y: -3.5 }, reach: ss((k - 0.42) / 0.16) * (1 - hold), hold,
      lit: ss((k - 0.86) / 0.1), smoke: 1, wob: 0
    });
    c.restore();
  }

  // ---------------------------------------------------------------- Ivy's spider companion + silk thread
  function drawThread(c, x1, y1, x2, y2, o) {
    o = o || {};
    const t = o.t || 0, len = Math.hypot(x2 - x1, y2 - y1);
    const sag = o.taut ? 0.6 * sin(t * 30) : min(26, len * 0.14) + sin(t * 1.6) * 1.2;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + sag * 1.9;
    c.save(); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(mx, my, x2, y2);
    c.strokeStyle = 'rgba(190,200,230,0.18)'; c.lineWidth = 3.2; c.stroke();
    c.strokeStyle = 'rgba(232,236,248,0.9)'; c.lineWidth = 1.05; c.stroke();
    // a travelling glint
    const u = (t * 0.5) % 1, v = 1 - u;
    const gx = v * v * x1 + 2 * u * v * mx + u * u * x2, gy = v * v * y1 + 2 * u * v * my + u * u * y2;
    c.beginPath(); c.arc(gx, gy, 1.3, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.85)'; c.fill();
    c.restore();
  }

  function drawSpider(c, x, y, o) {
    o = o || {};
    const t = o.t || 0, mode = o.mode || 'hang', f = o.facing < 0 ? -1 : 1, sc = o.scale || 1;
    let ph = t * 12, bob = 0, tilt = 0, eyeLook = 0.5 * f;
    if (mode === 'hang') { bob = sin(t * 2.2) * 0.8; tilt = sin(t * 1.3) * 0.05; }
    else if (mode === 'walk') { bob = -abs(sin(ph)) * 1.0; tilt = sin(ph) * 0.04; }
    else { tilt = f * 0.38; bob = sin(t * 20) * 0.25; eyeLook = -f * 0.8; } // pull: leaning back, looking at the thread
    c.save(); c.translate(x, y + bob); c.scale(sc, sc); c.rotate(tilt);
    // legs
    const KDX = [7, 9.5, 9.5, 7.5], KDY = [-8, -4.5, -0.5, 2.5], FDX = [11, 14, 14, 11], FDY = [-1, 4.5, 8, 10.5];
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (let s = -1; s <= 1; s += 2) {
      for (let j = 0; j < 4; j++) {
        const bx = s * 3.5, by = -1.5 + j * 1.6;
        let kx = s * KDX[j], ky = KDY[j], fx = s * FDX[j], fy = FDY[j];
        const pp = ph + j * 1.6 + (s > 0 ? 0 : PI);
        if (mode === 'hang') {
          const w = sin(t * 3 + j * 0.9 + (s > 0 ? 0 : 1.3));
          fx += s * w * 1.0; fy += cos(t * 3 + j * 0.9) * 1.8; ky += w * 0.8;
        } else if (mode === 'walk') {
          fx += sin(pp) * 3.2; fy = FDY[j] - max(0, cos(pp)) * 3.2 + 1.5; kx += sin(pp) * 1.6; ky += -max(0, cos(pp)) * 2.2 + 0.5;
        } else {
          fx = s * (FDX[j] + 2.5); fy = FDY[j] + 2.5; kx = s * (KDX[j] + 1.5); ky = KDY[j] + 1;
          if (s === -f && j === 0) { fx = -f * 15; fy = -9 + sin(t * 20) * 0.8; kx = -f * 9; ky = -9; } // front leg hauling the silk
          if (s === -f && j === 1) { fx = -f * 15; fy = -2; kx = -f * 10; ky = -6; }
        }
        for (let k = 0; k < 2; k++) {
          c.beginPath(); c.moveTo(bx, by); c.lineTo(kx, ky); c.lineTo(fx, fy);
          c.strokeStyle = k === 0 ? ink(0.5) : '#1d1726'; c.lineWidth = k === 0 ? 2.4 : 1.2; c.stroke();
        }
        ell(c, kx, ky, 0.9, 0.9); c.fillStyle = '#2d2438'; c.fill();
      }
    }
    // body: abdomen (round) + head bump
    ell(c, 0, 1.2, 7.2, 6.6); fs(c, '#17121d', 1, 0.6);
    c.beginPath(); c.ellipse(-2.2, -1.6, 3.4, 2.4, -0.5, 0, TAU); c.fillStyle = 'rgba(150,140,190,0.28)'; c.fill();
    c.beginPath(); c.moveTo(-3.4, 5.2); c.quadraticCurveTo(0, 7, 3.4, 5.2); c.strokeStyle = 'rgba(142,66,86,0.55)'; c.lineWidth = 1; c.stroke();
    // eyes: big, glossy, amber-lit
    const bl = blink(t + 1.1);
    for (let s = -1; s <= 1; s += 2) {
      const ex = s * 2.9 + eyeLook, ey = -0.6, r = 2.9;
      ell(c, ex, ey, r, r * (1 - bl * 0.85)); c.fillStyle = '#07050a'; c.fill();
      c.beginPath(); c.arc(ex + eyeLook * 0.3, ey + 0.4, r * 0.62, 0, TAU);
      const g = c.createRadialGradient(ex + eyeLook * 0.3, ey + 0.6, 0.2, ex + eyeLook * 0.3, ey + 0.4, r * 0.7);
      g.addColorStop(0, P.amberLight); g.addColorStop(1, 'rgba(243,160,58,0.15)'); c.fillStyle = g;
      if (bl < 0.5) c.fill();
      c.beginPath(); c.arc(ex - 0.9, ey - 1.0, 0.85, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.95)'; if (bl < 0.5) c.fill();
      c.beginPath(); c.arc(ex + 1.0, ey + 1.1, 0.4, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.7)'; if (bl < 0.5) c.fill();
    }
    // tiny smile
    c.beginPath(); c.moveTo(-1.3 + eyeLook * 0.4, 3.3); c.quadraticCurveTo(eyeLook * 0.4, 4.5, 1.3 + eyeLook * 0.4, 3.3);
    c.strokeStyle = 'rgba(243,160,58,0.7)'; c.lineWidth = 0.7; c.stroke();
    // bordeaux bow on the top-left
    c.save(); c.translate(-3.8, -6.2); c.rotate(-0.5);
    ell(c, -2.4, 0, 2.5, 1.6, -0.4); fs(c, P.bordeauxLight, 0.6, 0.5);
    ell(c, 2.4, 0, 2.5, 1.6, 0.4); fs(c, P.bordeauxLight, 0.6, 0.5);
    ell(c, 0, 0, 1.1, 1.1); fs(c, P.bordeaux, 0.5, 0.5);
    c.restore();
    c.restore();
  }

  // ---------------------------------------------------------------- faces helpers
  function closedEye(c, x, y, w, col) {
    c.beginPath(); c.moveTo(x - w, y - 0.3); c.quadraticCurveTo(x, y + w * 0.9, x + w, y - 0.3);
    c.strokeStyle = col || ink(0.85); c.lineWidth = 1.1; c.lineCap = 'round'; c.stroke();
  }
  function wideEye(c, x, y, r, look) {
    ell(c, x, y, r, r * 1.1); fs(c, '#fffdf6', 0.8, 0.6);
    c.beginPath(); c.arc(x + (look || 0), y, r * 0.42, 0, TAU); c.fillStyle = '#1b1420'; c.fill();
    c.beginPath(); c.arc(x + (look || 0) + r * 0.2, y - r * 0.25, r * 0.15, 0, TAU); c.fillStyle = '#fff'; c.fill();
  }
  function nightcap(c, x, y, dir, t, wob) { // cap sitting on a head at (x,y)=top-of-head centre, tip falls toward dir
    c.save(); c.translate(x, y);
    const sw = sin(t * 1.6) * 1.2 + (wob || 0);
    c.beginPath();
    c.moveTo(-9, 2); c.bezierCurveTo(-9, -8, -2, -12, dir * 4, -12);
    c.bezierCurveTo(dir * 11 + sw, -12, dir * 17 + sw, -4, dir * 19 + sw, 5 + sw * 0.3);
    c.bezierCurveTo(dir * 12, 0, 6, -2, 9, 2);
    c.quadraticCurveTo(0, 5, -9, 2);
    fs(c, P.cream, 1, 0.5);
    c.beginPath(); c.moveTo(-8.4, 0.2); c.quadraticCurveTo(0, 3.6, 8.6, 0.2);
    c.strokeStyle = P.bordeaux; c.lineWidth = 2.2; c.stroke();
    ell(c, dir * 19 + sw, 6 + sw * 0.3, 3.2, 3.2); fs(c, '#f6efdd', 0.8, 0.5);
    c.restore();
  }

  // ---------------------------------------------------------------- sleepers
  function bedPerson(c, px, kind, st, t, a, idx) {
    // px = centre x ; head at pillow. kind 'mum' | 'dad'
    const awake = st === 'awake', stir = st === 'stir';
    const breath = sin(t * 1.5 + idx * 1.1) * 0.9;
    const wob = stir ? sin(t * 7 + idx) * (0.06 + a * 0.08) : 0;
    const headY = awake ? -74 : -55 + breath * 0.3;
    // pillow
    rr(c, px - 22, -66, 44, 22, 9); fs(c, '#e9e0cf', 1.1, 0.5);
    c.beginPath(); c.moveTo(px - 17, -60); c.quadraticCurveTo(px, -64, px + 17, -60); c.strokeStyle = 'rgba(120,100,100,0.25)'; c.lineWidth = 1; c.stroke();
    // awake torso (nightshirt)
    if (awake) {
      ell(c, px, -50, 15, 21); fs(c, '#e3dccd', 1.1, 0.5);
      line(c, px, -60, px, -38, 'rgba(100,90,100,0.25)', 1);
    }
    c.save(); c.translate(px, headY); c.rotate(wob + (awake ? sin(t * 9) * 0.03 : 0));
    // hair behind (mum: long wavy)
    if (kind === 'mum') {
      c.beginPath(); c.moveTo(-12, -2); c.bezierCurveTo(-18, 6, -15, 16, -10, 18); c.lineTo(10, 18); c.bezierCurveTo(15, 16, 18, 6, 12, -2); c.bezierCurveTo(8, -12, -8, -12, -12, -2);
      fs(c, '#4a3544', 1, 0.5);
    }
    ell(c, 0, 0, 11, 10.5); fs(c, P.skin, 1.1, 0.6);
    // cap
    nightcap(c, 0, -8, kind === 'mum' ? -1 : 1, t + idx, wob * 6);
    // cheeks
    ell(c, -6.5, 3.5, 2.6, 1.5); c.fillStyle = 'rgba(176,86,100,0.2)'; c.fill();
    ell(c, 6.5, 3.5, 2.6, 1.5); c.fillStyle = 'rgba(176,86,100,0.2)'; c.fill();
    if (awake) {
      wideEye(c, -4.2, -0.5, 3, 0); wideEye(c, 4.2, -0.5, 3, 0);
      c.beginPath(); c.moveTo(-7.5, -5); c.quadraticCurveTo(-4.2, -7.2, -1.5, -5.4); c.moveTo(7.5, -5); c.quadraticCurveTo(4.2, -7.2, 1.5, -5.4);
      c.strokeStyle = ink(0.6); c.lineWidth = 1; c.stroke();
      ell(c, 0, 6.4, 2, 2.6); fs(c, '#6b2e3e', 0.6, 0.5);
    } else {
      closedEye(c, -4.2, -0.8, 2.6); closedEye(c, 4.2, -0.8, 2.6);
      if (stir) { c.beginPath(); c.moveTo(-7, -4.6); c.lineTo(-2, -3.4); c.moveTo(7, -4.6); c.lineTo(2, -3.4); c.strokeStyle = ink(0.55); c.lineWidth = 0.9; c.stroke(); }
      // mouth, slightly open when snoring
      const mo = 0.8 + (sin(t * 1.5 + idx * 1.1) + 1) * 0.9;
      ell(c, 0, 6.2, 2, mo); fs(c, '#6b2e3e', 0.5, 0.4);
    }
    c.beginPath(); c.arc(0, 2.4, 0.6, 0, TAU); c.fillStyle = 'rgba(150,100,100,0.5)'; c.fill();
    if (kind === 'dad') { // moustache
      c.beginPath(); c.moveTo(-6, 4.4); c.quadraticCurveTo(-3, 2.4, 0, 4); c.quadraticCurveTo(3, 2.4, 6, 4.4); c.quadraticCurveTo(3, 6.2, 0, 4.8); c.quadraticCurveTo(-3, 6.2, -6, 4.4);
      fs(c, '#4d4048', 0.6, 0.4);
    }
    c.restore();
  }

  function drawParents(c, o) {
    const t = o.t || 0, st = o.state || 'sleep', a = o.alert || 0;
    const stir = st === 'stir', awake = st === 'awake';
    c.save();
    c.fillStyle = 'rgba(10,6,16,0.3)'; ell(c, 0, 1, 78, 5); c.fill();
    // headboard
    c.beginPath(); c.moveTo(-66, -26); c.lineTo(-66, -88); c.quadraticCurveTo(-66, -100, -54, -100); c.lineTo(54, -100); c.quadraticCurveTo(66, -100, 66, -88); c.lineTo(66, -26); c.closePath();
    fs(c, P.woodDark, 1.4, 0.6);
    rr(c, -58, -92, 116, 58, 10); fs(c, '#4a3126', 1, 0.4);
    c.beginPath(); c.moveTo(-52, -86); c.quadraticCurveTo(0, -92, 52, -86); c.strokeStyle = 'rgba(200,160,130,0.18)'; c.lineWidth = 1.2; c.stroke();
    // far drapes behind
    // posts
    for (const sx of [-1, 1]) {
      rr(c, sx * 69 - 5, -118, 10, 118, 4); fs(c, P.wood, 1.3, 0.6);
      c.beginPath(); c.moveTo(sx * 69 - 2, -112); c.lineTo(sx * 69 - 2, -6); c.strokeStyle = 'rgba(255,220,190,0.13)'; c.lineWidth = 1.5; c.stroke();
      ell(c, sx * 69, -122, 6.5, 6.5); fs(c, P.woodLight, 1, 0.55);
      ell(c, sx * 69, -36, 7, 4); fs(c, P.woodLight, 0.8, 0.45);
    }
    // sleepers
    c.save();
    const sh = stir ? sin(t * 6) * (1 + a * 2) : 0;
    c.translate(sh * 0.3, 0);
    bedPerson(c, -34, 'mum', st, t, a, 0);
    bedPerson(c, 32, 'dad', st, t, a, 1);
    c.restore();
    // blanket with two lumps
    const br = sin(t * 1.5) * 0.9, br2 = sin(t * 1.5 + 1.1) * 0.9;
    const lift = awake ? 10 : 0;
    c.beginPath();
    c.moveTo(-64, -14);
    c.lineTo(-62, -34 + lift * 0.3);
    c.bezierCurveTo(-58, -46 - br + lift, -44, -48 - br + lift, -34, -45 - br + lift);
    c.bezierCurveTo(-22, -46 - br + lift, -14, -40, -2, -35);
    c.bezierCurveTo(10, -40, 18, -46 - br2 + lift, 32, -45 - br2 + lift);
    c.bezierCurveTo(46, -46 - br2 + lift, 58, -42 + lift, 62, -34 + lift * 0.3);
    c.lineTo(64, -14); c.quadraticCurveTo(0, -8, -64, -14);
    fs(c, P.bordeaux, 1.4, 0.6);
    // folded sheet edge (cream)
    c.beginPath();
    c.moveTo(-61, -34 + lift * 0.3);
    c.bezierCurveTo(-58, -46 - br + lift, -44, -48 - br + lift, -34, -45 - br + lift);
    c.bezierCurveTo(-22, -46 - br + lift, -14, -40, -2, -35);
    c.bezierCurveTo(10, -40, 18, -46 - br2 + lift, 32, -45 - br2 + lift);
    c.bezierCurveTo(46, -46 - br2 + lift, 58, -42 + lift, 61, -34 + lift * 0.3);
    c.lineTo(61, -29 + lift * 0.3); c.bezierCurveTo(50, -37 + lift, 44, -41 + lift, 32, -39 - br2 + lift);
    c.bezierCurveTo(18, -40, 10, -33, -2, -28); c.bezierCurveTo(-14, -33, -22, -40, -34, -39 - br + lift);
    c.bezierCurveTo(-44, -42 + lift, -52, -37 + lift, -61, -29 + lift * 0.3); c.closePath();
    fs(c, '#e9e0cf', 1, 0.5);
    // quilt stitching
    c.strokeStyle = 'rgba(30,10,20,0.28)'; c.lineWidth = 1;
    for (let i = -3; i <= 3; i++) {
      c.beginPath(); c.moveTo(i * 17 - 2, -22); c.quadraticCurveTo(i * 17 + 4, -17, i * 17 - 2, -12); c.stroke();
    }
    c.beginPath(); c.moveTo(-60, -21); c.quadraticCurveTo(0, -17, 60, -21); c.stroke();
    // bed frame front
    rr(c, -70, -18, 140, 14, 5); fs(c, P.wood, 1.3, 0.6);
    rr(c, -66, -5, 12, 7, 2); fs(c, P.woodDark, 1, 0.5); rr(c, 54, -5, 12, 7, 2); fs(c, P.woodDark, 1, 0.5);
    // canopy
    c.beginPath(); c.moveTo(-82, -112); c.bezierCurveTo(-60, -142, 60, -142, 82, -112); c.lineTo(82, -108); c.lineTo(-82, -108); c.closePath();
    fs(c, P.bordeaux, 1.4, 0.6);
    c.beginPath(); c.moveTo(-60, -130); c.bezierCurveTo(-20, -142, 20, -142, 60, -130); c.strokeStyle = 'rgba(255,200,210,0.2)'; c.lineWidth = 2; c.stroke();
    // valance scallops
    c.beginPath(); c.moveTo(-82, -110);
    for (let i = 0; i < 9; i++) { const x0 = -82 + i * 18.2; c.quadraticCurveTo(x0 + 9.1, -92, x0 + 18.2, -110); }
    c.closePath(); fs(c, P.bordeauxLight, 1.2, 0.55);
    c.beginPath(); c.moveTo(-82, -108);
    for (let i = 0; i < 9; i++) { const x0 = -82 + i * 18.2; c.quadraticCurveTo(x0 + 9.1, -97, x0 + 18.2, -108); }
    c.strokeStyle = 'rgba(243,200,115,0.5)'; c.lineWidth = 1.2; c.stroke();
    for (let i = 0; i < 9; i++) { const x0 = -82 + i * 18.2 + 9.1; ell(c, x0, -95, 1.6, 1.6); c.fillStyle = P.amberLight; c.fill(); }
    // side drapes tied back
    for (const sx of [-1, 1]) {
      c.beginPath(); c.moveTo(sx * 80, -108);
      c.bezierCurveTo(sx * 84, -82, sx * 70, -66, sx * 71, -58);
      c.bezierCurveTo(sx * 77, -42, sx * 82, -22, sx * 79, -6);
      c.lineTo(sx * 72, -6); c.bezierCurveTo(sx * 70, -30, sx * 62, -44, sx * 63, -58);
      c.bezierCurveTo(sx * 62, -72, sx * 66, -86, sx * 64, -108); c.closePath();
      fs(c, '#7a3547', 1.2, 0.55);
      c.beginPath(); c.moveTo(sx * 72, -100); c.quadraticCurveTo(sx * 77, -76, sx * 70, -60); c.strokeStyle = 'rgba(30,8,18,0.35)'; c.lineWidth = 1; c.stroke();
      c.beginPath(); c.moveTo(sx * 68, -58.5); c.quadraticCurveTo(sx * 71, -61, sx * 75, -58); c.strokeStyle = P.amberLight; c.lineWidth = 2; c.stroke();
    }
    c.restore();
  }

  function drawGrandma(c, o) {
    const t = o.t || 0, st = o.state || 'sleep', a = o.alert || 0;
    const awake = st === 'awake', stir = st === 'stir';
    c.save();
    c.fillStyle = 'rgba(10,6,16,0.3)'; ell(c, 0, 1, 40, 4); c.fill();
    // chair back + wings
    c.beginPath(); c.moveTo(-30, -26); c.bezierCurveTo(-38, -60, -36, -92, -22, -100); c.bezierCurveTo(-10, -106, 10, -106, 22, -100);
    c.bezierCurveTo(36, -92, 38, -60, 30, -26); c.closePath();
    fs(c, '#355045', 1.4, 0.6);
    ell(c, 0, -62, 21, 32); fs(c, '#40604f', 1, 0.45);
    // tufting
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) { const bx = (k - 1) * 11 + (r % 2) * 0, by = -84 + r * 10; ell(c, bx, by, 1.3, 1.3); c.fillStyle = P.greenDark; c.fill(); }
    // seat & arms
    rr(c, -34, -30, 68, 14, 6); fs(c, '#40604f', 1.3, 0.6);
    for (const sx of [-1, 1]) { rr(c, sx * 33 - 7, -50, 14, 30, 7); fs(c, '#355045', 1.3, 0.6); ell(c, sx * 33, -50, 8, 4); fs(c, '#4d7260', 1, 0.5); }
    // feet
    rr(c, -30, -6, 7, 8, 2); fs(c, P.woodDark, 1, 0.5); rr(c, 23, -6, 7, 8, 2); fs(c, P.woodDark, 1, 0.5);
    rr(c, -34, -18, 68, 12, 4); fs(c, '#355045', 1.2, 0.55);
    // grandma body
    const br = sin(t * 1.3) * 0.7;
    const jolt = stir ? sin(t * 8) * (1.2 + a * 1.5) : 0;
    c.save(); c.translate(jolt * 0.4, awake ? -3 : 0);
    c.beginPath(); c.moveTo(-15, -30); c.bezierCurveTo(-18, -52, -14, -62 - br, -8, -66 - br); c.lineTo(8, -66 - br); c.bezierCurveTo(14, -62 - br, 18, -52, 15, -30); c.closePath();
    fs(c, '#6e6585', 1.2, 0.55);
    // lap
    ell(c, 0, -28, 18, 8); fs(c, '#6e6585', 1.2, 0.55);
    // shawl
    c.beginPath(); c.moveTo(-17, -62); c.bezierCurveTo(-12, -72 - br, 12, -72 - br, 17, -62); c.bezierCurveTo(20, -50, 14, -40, 0, -34); c.bezierCurveTo(-14, -40, -20, -50, -17, -62);
    fs(c, '#8a4a5a', 1.2, 0.55);
    c.strokeStyle = 'rgba(40,10,20,0.28)'; c.lineWidth = 1;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-14 + i * 4, -62); c.quadraticCurveTo(-8 + i * 4, -50, 0, -37); c.stroke(); }
    // fringe
    c.strokeStyle = '#a65d6e'; c.lineWidth = 1;
    for (let i = 0; i < 7; i++) { const u = i / 6, fx = -13 + u * 26, fy = -45 + (1 - abs(u - 0.5) * 2) * 9 - 3; c.beginPath(); c.moveTo(fx * 0.9, fy * 0.95 - 2); c.lineTo(fx * 0.95, fy + 3); c.stroke(); }
    // head
    const tilt = awake ? 0 : (stir ? 0.12 + sin(t * 6) * 0.1 : 0.22 + sin(t * 1.3) * 0.03);
    c.save(); c.translate(0, -72 - br); c.rotate(tilt);
    // bun
    ell(c, 0, -13, 6.5, 5.5); fs(c, '#d9d6e2', 1, 0.5); ell(c, 0, -13, 2.5, 2); c.fillStyle = '#b9b5c6'; c.fill();
    ell(c, 0, 0, 10, 10.5); fs(c, '#efe3d6', 1.2, 0.6);
    // hair
    c.beginPath(); c.moveTo(-10, 1); c.bezierCurveTo(-12, -10, -4, -12, 0, -11); c.bezierCurveTo(5, -12, 12, -10, 10, 1); c.bezierCurveTo(8, -5, 4, -6, 0, -6); c.bezierCurveTo(-4, -6, -8, -5, -10, 1);
    fs(c, '#d9d6e2', 0.9, 0.45);
    if (awake) { wideEye(c, -4, 0, 3, 0); wideEye(c, 4, 0, 3, 0); ell(c, 0, 6.8, 2, 2.6); fs(c, '#6b2e3e', 0.6, 0.5); }
    else { closedEye(c, -4, 0, 2.6); closedEye(c, 4, 0, 2.6); c.beginPath(); c.moveTo(-2.4, 6.4); c.quadraticCurveTo(0, 7.6, 2.4, 6.4); c.strokeStyle = ink(0.6); c.lineWidth = 1; c.stroke(); }
    // glasses
    c.strokeStyle = 'rgba(70,55,40,0.9)'; c.lineWidth = 1;
    c.beginPath(); c.arc(-4, awake ? 0 : 0.8, 4.2, 0, TAU); c.stroke(); c.beginPath(); c.arc(4, awake ? 0 : 0.8, 4.2, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(-0.2, 0.4); c.lineTo(0.2, 0.4); c.stroke();
    ell(c, -6.8, 4.6, 2.3, 1.3); c.fillStyle = 'rgba(176,86,100,0.22)'; c.fill(); ell(c, 6.8, 4.6, 2.3, 1.3); c.fill();
    c.restore();
    // knitting in lap
    const kn = awake ? -6 : (stir ? sin(t * 10) * 2 : sin(t * 1.3) * 0.5);
    c.beginPath(); c.moveTo(-9, -30); c.lineTo(9, -30); c.lineTo(7, -14); c.quadraticCurveTo(0, -11 + kn * 0.3, -7, -14); c.closePath();
    fs(c, '#c98f4a', 1, 0.5);
    c.strokeStyle = 'rgba(90,50,20,0.35)'; c.lineWidth = 1; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-8 + i * 0.6, -28 + i * 4); c.lineTo(8 - i * 0.6, -28 + i * 4); c.stroke(); }
    // needles
    const na = awake ? -0.5 : 0.1;
    line(c, -8, -30, -16 + kn, -48 + (awake ? -8 : 0), '#d6c7a8', 1.6); line(c, 8, -30, 16 - kn, -48 + (awake ? -8 : 0), '#d6c7a8', 1.6);
    ell(c, -16 + kn, -48 + (awake ? -8 : 0), 1.7, 1.7); fs(c, '#a65d6e', 0.6, 0.4); ell(c, 16 - kn, -48 + (awake ? -8 : 0), 1.7, 1.7); fs(c, '#a65d6e', 0.6, 0.4);
    // hands
    ell(c, -8, -31, 3.2, 2.6); fs(c, '#efe3d6', 0.8, 0.5); ell(c, 8, -31, 3.2, 2.6); fs(c, '#efe3d6', 0.8, 0.5);
    c.restore();
    // yarn ball on floor with thread
    ell(c, 42, -6, 7, 6.5); fs(c, '#c98f4a', 1, 0.55);
    c.strokeStyle = 'rgba(90,50,20,0.4)'; c.lineWidth = 0.8;
    c.beginPath(); c.arc(42, -6, 4.5, 0.5, 2.5); c.stroke(); c.beginPath(); c.arc(42, -6, 3, 3.5, 5.5); c.stroke();
    c.beginPath(); c.moveTo(35, -4); c.bezierCurveTo(28, 0, 22, -10, 18, -22); c.strokeStyle = '#c98f4a'; c.lineWidth = 1; c.stroke();
    c.restore();
  }

  function drawUncle(c, o) {
    const t = o.t || 0, st = o.state || 'sleep', a = o.alert || 0;
    const awake = st === 'awake', stir = st === 'stir';
    c.save();
    c.fillStyle = 'rgba(10,6,16,0.3)'; ell(c, 0, 1, 58, 4); c.fill();
    // chair back
    rr(c, -20, -74, 40, 44, 10); fs(c, P.woodDark, 1.2, 0.55);
    // body (white coat)
    const br = sin(t * 1.4) * 0.8;
    const jolt = stir ? sin(t * 8) * (1 + a * 1.5) : 0;
    const up = awake ? 28 : (stir ? 6 : 0);
    c.save(); c.translate(jolt * 0.4, 0);
    c.beginPath(); c.moveTo(-22, -30); c.bezierCurveTo(-26, -52 - up * 0.6, -18, -66 - br - up * 0.9, -6, -68 - br - up); c.lineTo(10, -66 - br - up * 0.9);
    c.bezierCurveTo(22, -60 - up * 0.6, 26, -46, 22, -30); c.closePath();
    fs(c, '#d9d6e2', 1.3, 0.55);
    line(c, -2, -64 - up, -2, -34, 'rgba(90,80,110,0.3)', 1);
    // head
    const hy = -52 - up * 1.05 + (awake ? 0 : sin(t * 1.4) * 0.6);
    const hx = awake ? 0 : -4 + (stir ? sin(t * 6) * 3 : 0);
    c.save(); c.translate(hx, hy); c.rotate(awake ? 0 : -0.3 + (stir ? sin(t * 6) * 0.1 : 0));
    // wild hair
    const spread = awake ? 1.25 : 1;
    for (let i = 0; i < 11; i++) {
      const an = -PI * 1.05 + i * (PI * 1.1 / 10), rad = (13 + hh(i, 7) * 6) * spread;
      ell(c, cos(an) * rad * 0.9, sin(an) * rad * 0.9 - 2, 7 + hh(i, 3) * 3, 6 + hh(i, 5) * 3, an);
      fs(c, i % 2 ? '#f4f1f6' : '#e4e1ec', 0.8, 0.4);
    }
    // sideburn tufts
    ell(c, -13, 6, 5, 7); fs(c, '#e8e5ef', 0.8, 0.4); ell(c, 13, 6, 5, 7); fs(c, '#e8e5ef', 0.8, 0.4);
    ell(c, 0, 0, 11, 11.5); fs(c, '#f0dfd0', 1.2, 0.6);
    // goggles
    const gy = awake ? 0 : -9;
    c.save(); c.translate(0, gy);
    c.beginPath(); c.moveTo(-14, 0); c.lineTo(14, 0); c.strokeStyle = '#3a2a22'; c.lineWidth = 3; c.stroke();
    for (const s2 of [-1, 1]) { ell(c, s2 * 5.2, 0, 5.2, 5.2); fs(c, '#a9b3c9', 1.4, 0.6); ell(c, s2 * 5.2, 0, 5.2, 5.2); c.strokeStyle = '#a07a3a'; c.lineWidth = 2; c.stroke();
      c.beginPath(); c.arc(s2 * 5.2 - 1.5, -1.5, 1.6, 3.6, 5.2); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1; c.stroke(); }
    c.restore();
    if (awake) {
      wideEye(c, -5.2, 0, 3.6, 0); wideEye(c, 5.2, 0, 3.6, 0); ell(c, 0, 8, 3, 3.6); fs(c, '#6b2e3e', 0.6, 0.5);
      // restore goggles over eyes tinted
    } else {
      closedEye(c, -5, 1.2, 2.6); closedEye(c, 5, 1.2, 2.6);
      c.beginPath(); c.moveTo(-2.4, 8); c.quadraticCurveTo(0, 9.6, 2.4, 8); c.strokeStyle = ink(0.6); c.lineWidth = 1; c.stroke();
    }
    // bushy brows & moustache
    c.beginPath(); c.moveTo(-9, awake ? -6.6 : -2.6); c.quadraticCurveTo(-5, awake ? -9.6 : -4.4, -1.6, awake ? -6 : -2.8); c.moveTo(9, awake ? -6.6 : -2.6); c.quadraticCurveTo(5, awake ? -9.6 : -4.4, 1.6, awake ? -6 : -2.8);
    c.strokeStyle = '#d4d0de'; c.lineWidth = 2.4; c.stroke();
    c.beginPath(); c.moveTo(-7, 5.4); c.quadraticCurveTo(-3, 3.2, 0, 5); c.quadraticCurveTo(3, 3.2, 7, 5.4); c.quadraticCurveTo(3, 8, 0, 6); c.quadraticCurveTo(-3, 8, -7, 5.4);
    fs(c, '#f4f1f6', 0.7, 0.4);
    // snore bubble
    if (!awake) {
      const bp = (sin(t * 1.4) + 1) / 2; const r = 1.5 + bp * 4.5;
      ell(c, 11 + r * 0.6, 4.5 + r * 0.2, r, r); c.fillStyle = 'rgba(200,215,255,0.35)'; c.fill(); c.strokeStyle = 'rgba(220,230,255,0.7)'; c.lineWidth = 0.8; c.stroke();
    }
    c.restore();
    c.restore();
    // arms folded on desk
    if (!awake) { ell(c, -8, -34, 22, 8); fs(c, '#d9d6e2', 1.2, 0.55); ell(c, 14, -33, 14, 6); fs(c, '#cfcbda', 1.2, 0.55); ell(c, 26, -34, 4, 3.4); fs(c, '#f0dfd0', 0.8, 0.5); }
    else { ell(c, -22, -40, 6, 12, -0.3); fs(c, '#d9d6e2', 1.2, 0.55); ell(c, 24, -40, 6, 12, 0.3); fs(c, '#d9d6e2', 1.2, 0.55); }
    // desk
    rr(c, -52, -34 + 0, 104, 6, 2); fs(c, P.woodLight, 1.3, 0.6);
    rr(c, -48, -29, 96, 29, 3); fs(c, P.wood, 1.3, 0.6);
    rr(c, -44, -25, 40, 20, 2); fs(c, '#4a3126', 1, 0.45); rr(c, 4, -25, 40, 20, 2); fs(c, '#4a3126', 1, 0.45);
    ell(c, -24, -17, 2.2, 1.6); fs(c, P.amberLight, 0.6, 0.5); ell(c, 24, -17, 2.2, 1.6); fs(c, P.amberLight, 0.6, 0.5);
    // desk props: flask, papers, ink pot
    ell(c, 40, -41, 6.5, 6.5); fs(c, 'rgba(155,211,90,0.8)', 1, 0.55);
    rr(c, 38, -55, 4, 9, 1.5); fs(c, 'rgba(200,215,230,0.7)', 0.8, 0.5);
    for (let i = 0; i < 2; i++) { const bp = (t * 0.7 + i * 0.5) % 1; c.beginPath(); c.arc(40 + sin(bp * 9 + i) * 2, -38 - bp * 6, 0.9, 0, TAU); c.fillStyle = 'rgba(220,255,160,' + (1 - bp) + ')'; c.fill(); }
    rr(c, -48, -39, 18, 5, 1.5); fs(c, '#d8cfb6', 0.8, 0.5); rr(c, -46, -43, 16, 5, 1.5); fs(c, '#c7bda2', 0.8, 0.5);
    c.restore();
  }

  function drawSleeper(c, x, y, o) {
    o = o || {};
    c.save(); c.translate(x, y);
    const w = o.who || 'parents';
    if (w === 'grandma') drawGrandma(c, o); else if (w === 'uncle') drawUncle(c, o); else drawParents(c, o);
    c.restore();
  }

  // ---------------------------------------------------------------- walker (butler)
  function drawWalker(c, x, y, o) {
    o = o || {};
    const f = o.facing < 0 ? -1 : 1, t = o.t || 0, a = o.alert || 0;
    c.save(); c.translate(x, y); c.scale(f, 1);
    c.fillStyle = 'rgba(10,6,16,0.28)'; ell(c, 0, 0.5, 13, 2.6); c.fill();
    const ph = t * 4.2, sw = sin(ph), bob = abs(sin(ph)) * -0.9;
    const dream = sin(t * 1.3) * 1.2; // swaying
    // legs (shuffle, feet barely lift)
    for (let i = -1; i <= 1; i += 2) {
      const p2 = ph + (i > 0 ? 0 : PI);
      const fx = sin(p2) * 4.5 + 1, fy = -max(0, cos(p2)) * 1.5;
      limb(c, i * 2.2, -24, fx, fy - 1.5, 3.2, '#17131e', i * 2.2 + 1, -12);
      ell(c, fx + 2, fy - 1, 4.8, 2.2); fs(c, '#201a26', 0.8, 0.55);
    }
    c.save(); c.translate(0, bob); c.rotate(0.03 + dream * 0.01);
    // tails behind
    c.beginPath(); c.moveTo(-5, -32); c.bezierCurveTo(-11, -28, -13, -20, -12, -13); c.lineTo(-6, -17); c.lineTo(-2, -13); c.lineTo(0, -28); c.closePath();
    fs(c, '#1c1724', 1, 0.55);
    // torso
    c.beginPath(); c.moveTo(-5.5, -48); c.bezierCurveTo(-8, -40, -7, -30, -6, -24); c.lineTo(6, -24); c.bezierCurveTo(7, -32, 7, -40, 5.5, -48); c.quadraticCurveTo(0, -50.5, -5.5, -48);
    fs(c, '#201a29', 1.2, 0.6);
    // shirt front + waistcoat
    c.beginPath(); c.moveTo(-1.5, -48); c.lineTo(5, -48); c.lineTo(5.6, -30); c.lineTo(1, -27); c.closePath(); fs(c, '#f2ece4', 0.8, 0.45);
    for (let i = 0; i < 3; i++) { ell(c, 3, -42 + i * 5, 0.8, 0.8); c.fillStyle = '#6b2e3e'; c.fill(); }
    // neck
    rr(c, -1.8, -53, 3.6, 6, 1.5); fs(c, '#e6dccf', 0.6, 0.4);
    // bow tie
    c.beginPath(); c.moveTo(2, -49); c.lineTo(-1.6, -51.4); c.lineTo(-1.6, -46.6); c.closePath(); fs(c, P.bordeaux, 0.6, 0.5);
    c.beginPath(); c.moveTo(2, -49); c.lineTo(5.6, -51.4); c.lineTo(5.6, -46.6); c.closePath(); fs(c, P.bordeaux, 0.6, 0.5);
    // arms outstretched forward (sleepwalker)
    const as = sin(ph * 0.5) * 1.2;
    for (let k = 0; k < 2; k++) {
      const ay = -45 + k * 2.4 + as * (k ? -1 : 1) * 0.5, ax = 3 + k;
      limb(c, ax, ay, 21, ay - 1 + as * 0.3, 3.4, k ? '#2a2234' : '#201a29', 12, ay - 2);
      ell(c, 21.5, ay - 1 + as * 0.3, 3, 2.4); fs(c, '#f2ece4', 0.7, 0.5); // gloves
    }
    // head
    const hy = -59;
    c.save(); c.translate(1.5, hy); c.rotate(0.1 + dream * 0.012);
    // nightcap tail behind
    c.beginPath(); c.moveTo(-6, -3); c.bezierCurveTo(-8, -12, -2, -17, 5, -15); c.bezierCurveTo(10, -14, 15, -9, 13, -4); c.bezierCurveTo(8, -7, 0, -7, -6, -3);
    // draw cap after head for proper overlay
    ell(c, 0, 0, 5.8, 7.2); fs(c, '#efe3d6', 1.1, 0.6);
    // sideburns
    ell(c, -4.8, 1.5, 1.6, 3.4); c.fillStyle = '#cfcbd9'; c.fill(); ell(c, 4.8, 1.5, 1.6, 3.4); c.fill();
    // long nose
    c.beginPath(); c.moveTo(2.6, 0); c.quadraticCurveTo(7.6, 2.2, 3.6, 3.8); fs(c, '#efe3d6', 0.9, 0.55);
    // closed eyes
    closedEye(c, -2.2, -0.2, 1.7); closedEye(c, 2.4, -0.2, 1.7);
    c.beginPath(); c.moveTo(-4.2, -2.6 + (a > 0.4 ? 0.8 : 0)); c.lineTo(-0.8, -3.3); c.moveTo(4.6, -2.6 + (a > 0.4 ? 0.8 : 0)); c.lineTo(1, -3.3);
    c.strokeStyle = '#8d93a8'; c.lineWidth = 1; c.stroke();
    // moustache
    c.beginPath(); c.moveTo(-3, 5); c.quadraticCurveTo(0, 3.6, 3, 5); c.quadraticCurveTo(0, 6.4, -3, 5); fs(c, '#cfcbd9', 0.6, 0.4);
    // mouth
    c.beginPath(); c.moveTo(-1.2, 6.8); c.quadraticCurveTo(0.4, 7.6, 1.8, 6.8); c.strokeStyle = ink(0.5); c.lineWidth = 0.8; c.stroke();
    // nightcap
    c.save(); c.translate(0, -5.5); nightcapB(c, t, a); c.restore();
    c.restore();
    c.restore();
    c.restore();
  }
  function nightcapB(c, t, a) {
    const sw = sin(t * 2.4) * (1.5 + a * 2);
    c.beginPath(); c.moveTo(-6.4, 3); c.bezierCurveTo(-7, -6, -1, -9, 4, -8);
    c.bezierCurveTo(10 + sw, -8, 16 + sw, -3, 17 + sw, 7);
    c.bezierCurveTo(11, 3, 6, 2, 6.4, 3); c.quadraticCurveTo(0, 5, -6.4, 3);
    fs(c, P.cream, 1, 0.5);
    c.beginPath(); c.moveTo(-6, 1.4); c.quadraticCurveTo(0, 4.2, 6, 1.6); c.strokeStyle = P.bordeaux; c.lineWidth = 2; c.stroke();
    ell(c, 17 + sw, 8, 2.8, 2.8); fs(c, '#f6efdd', 0.7, 0.5);
  }

  // ---------------------------------------------------------------- Zzz
  function drawZzz(c, x, y, o) {
    o = o || {};
    const t = o.t || 0, a = clamp(o.alert || 0, 0, 1);
    const sp = 1 + a * 2.4;
    c.save(); c.translate(x, y);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) {
      const u = (t * 0.3 * sp + i / 3) % 1;
      const sz = 9 + u * 9;
      const shake = a * 1.6 * sin(t * 38 + i * 2);
      const px = i * 5 + sin(t * 1.8 * sp + i * 1.9) * 3.5 + u * 8 + shake;
      const py = -u * 38 + shake * 0.4;
      const al = sin(u * PI) * 0.95;
      c.save(); c.globalAlpha = al; c.translate(px, py); c.rotate(-0.15 + sin(t * 2 + i) * 0.08);
      c.font = 'italic bold ' + sz.toFixed(1) + 'px ' + FONT;
      c.lineWidth = 2.6; c.strokeStyle = ink(0.55); c.lineJoin = 'round'; c.strokeText('Z', 0, 0);
      c.fillStyle = a > 0.5 ? '#f3e1c2' : P.cream; c.fillText('Z', 0, 0);
      c.restore();
    }
    if (a > 0.8) {
      const bx = 20, by = -26 + sin(t * 14) * 1.8;
      ell(c, bx, by, 8.5, 8.5); fs(c, P.cream, 1.2, 0.6);
      c.font = 'bold 15px ' + FONT; c.fillStyle = P.bordeaux; c.fillText('!', bx, by + 0.8);
      c.beginPath(); c.moveTo(bx - 3, by + 7); c.lineTo(bx - 6, by + 12); c.lineTo(bx + 1, by + 8); c.fillStyle = P.cream; c.fill();
    }
    c.restore();
  }

  // ---------------------------------------------------------------- hide spots
  function peekEyes(c, x, y, t, sp, sc) {
    sc = sc || 1;
    const bl = (t % 3.4) > 3.25 ? 0.15 : 1;
    glow(c, x, y, 16 * sc, 0.35, 'amber');
    for (const s of [-1, 1]) {
      ell(c, x + s * sp, y, 2.2 * sc, 2.8 * sc * bl); c.fillStyle = '#fbf0c8'; c.fill();
      ell(c, x + s * sp + 0.5 * sc, y + 0.5, 1.0 * sc, 1.5 * sc * bl); c.fillStyle = '#2a1c2c'; c.fill();
    }
  }

  function drawWardrobe(c, o) {
    const t = o.t || 0, occ = o.occupied;
    c.fillStyle = 'rgba(10,6,16,0.3)'; ell(c, 0, 1, 34, 3.5); c.fill();
    // feet
    rr(c, -28, -7, 8, 8, 2); fs(c, P.woodDark, 1, 0.55); rr(c, 20, -7, 8, 8, 2); fs(c, P.woodDark, 1, 0.55);
    // body
    rr(c, -29, -86, 58, 80, 4); fs(c, P.wood, 1.4, 0.65);
    // cornice
    rr(c, -33, -94, 66, 10, 3); fs(c, P.woodLight, 1.3, 0.6);
    c.beginPath(); c.moveTo(-30, -88); c.quadraticCurveTo(0, -84, 30, -88); c.strokeStyle = 'rgba(40,20,10,0.35)'; c.lineWidth = 1; c.stroke();
    // plinth
    rr(c, -31, -12, 62, 7, 2); fs(c, P.woodLight, 1.1, 0.55);
    // interior gap for occupied
    const ox = occ ? 7 : 0;
    // left door
    rr(c, -26, -80, 24 - (occ ? 0 : 0), 64, 3); fs(c, '#6a4636', 1.2, 0.6);
    rr(c, -22, -75, 16, 22, 4); fs(c, null, 1, 0.3); rr(c, -22, -47, 16, 27, 4); fs(c, null, 1, 0.3);
    // right door
    if (occ) {
      // dark gap + door swung open (narrower, skewed)
      rr(c, -1, -80, 27, 64, 2); fs(c, '#0d0912', 1.2, 0.6);
      c.beginPath(); c.moveTo(14, -80); c.lineTo(26, -83); c.lineTo(26, -13); c.lineTo(14, -16); c.closePath(); fs(c, '#6a4636', 1.2, 0.6);
      c.beginPath(); c.moveTo(17, -72); c.lineTo(23, -74); c.lineTo(23, -52); c.lineTo(17, -50); c.closePath(); c.strokeStyle = ink(0.3); c.lineWidth = 1; c.stroke();
      peekEyes(c, 5, -52, t, 3.4, 1);
      c.beginPath(); c.moveTo(0, -80); c.lineTo(0, -16); c.strokeStyle = ink(0.45); c.lineWidth = 1; c.stroke();
    } else {
      rr(c, -1, -80, 27, 64, 3); fs(c, '#6a4636', 1.2, 0.6);
      rr(c, 3, -75, 19, 22, 4); fs(c, null, 1, 0.3); rr(c, 3, -47, 19, 27, 4); fs(c, null, 1, 0.3);
      ell(c, 3, -48, 1.8, 1.8); fs(c, P.amberLight, 0.6, 0.5);
    }
    ell(c, -4, -48, 1.8, 1.8); fs(c, P.amberLight, 0.6, 0.5);
    c.beginPath(); c.moveTo(-26, -76); c.lineTo(-26, -20); c.strokeStyle = 'rgba(255,220,190,0.12)'; c.lineWidth = 1.5; c.stroke();
  }

  function drawArmor(c, o, hide) {
    const t = o.t || 0, occ = hide && o.occupied;
    c.fillStyle = 'rgba(10,6,16,0.3)'; ell(c, 0, 1, 26, 3); c.fill();
    const metal = '#8d93a8', metalD = '#6a6f84', metalL = '#c9cfe0';
    // plinth
    rr(c, -22, -7, 44, 8, 2); fs(c, P.woodDark, 1.1, 0.55);
    // legs
    for (const s of [-1, 1]) { rr(c, s * 8 - 5, -34, 10, 28, 4); fs(c, metal, 1.2, 0.6); ell(c, s * 8, -32, 6.5, 4.5); fs(c, metalL, 1, 0.5); rr(c, s * 8 - 6, -9, 13, 4, 2); fs(c, metalD, 1, 0.5); }
    // tasset skirt
    c.beginPath(); c.moveTo(-14, -42); c.lineTo(14, -42); c.lineTo(16, -28); c.quadraticCurveTo(0, -24, -16, -28); c.closePath(); fs(c, metalD, 1.2, 0.6);
    for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 8, -41); c.lineTo(i * 8, -27); c.strokeStyle = ink(0.3); c.lineWidth = 1; c.stroke(); }
    // arms
    for (const s of [-1, 1]) { limb(c, s * 14, -62, s * 20, -42, 7, metal); ell(c, s * 14.5, -64, 8, 6); fs(c, metalL, 1.2, 0.6); ell(c, s * 20, -40, 4, 4); fs(c, metalD, 1, 0.5); }
    // sword held in front, point down
    line(c, 0, -52, 0, -12, '#c9cfe0', 3.2); line(c, -6, -46, 6, -46, '#a07a3a', 2.6);
    // breastplate
    c.beginPath(); c.moveTo(-14, -66); c.bezierCurveTo(-18, -56, -14, -46, -11, -42); c.lineTo(11, -42); c.bezierCurveTo(14, -46, 18, -56, 14, -66); c.quadraticCurveTo(0, -72, -14, -66);
    fs(c, metal, 1.4, 0.6);
    c.beginPath(); c.moveTo(-9, -64); c.quadraticCurveTo(-11, -54, -7, -46); c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2; c.stroke();
    c.beginPath(); c.moveTo(0, -68); c.lineTo(0, -44); c.strokeStyle = ink(0.3); c.lineWidth = 1; c.stroke();
    // helmet
    const lift = occ ? 3 : 0;
    ell(c, 0, -76, 10.5, 11); fs(c, metal, 1.4, 0.6);
    c.beginPath(); c.moveTo(-6, -84); c.quadraticCurveTo(-4, -88, 2, -87); c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 2; c.stroke();
    // visor slit
    rr(c, -8, -78 - lift, 16, 5 + lift, 2); fs(c, '#0d0912', 1, 0.6);
    c.beginPath(); c.moveTo(-9.5, -80 - lift); c.quadraticCurveTo(0, -83 - lift, 9.5, -80 - lift); c.strokeStyle = metalL; c.lineWidth = 1.5; c.stroke();
    for (let i = 0; i < 4; i++) line(c, -5 + i * 3.3, -71, -5 + i * 3.3, -68, ink(0.5), 1);
    if (occ) peekEyes(c, 0, -75, t, 3.2, 0.9);
    // plume
    c.beginPath(); c.moveTo(0, -86); c.bezierCurveTo(-10 + sin(t * 1.4) * 2, -100, 6, -104, 14 + sin(t * 1.4) * 2, -94); c.bezierCurveTo(8, -94, 4, -90, 0, -86);
    fs(c, P.bordeaux, 1, 0.55);
  }

  function drawFireplace(c, o) {
    const t = o.t || 0, occ = o.occupied;
    c.fillStyle = 'rgba(10,6,16,0.3)'; ell(c, 0, 1, 42, 3.5); c.fill();
    // surround stone
    rr(c, -38, -72, 76, 72, 5); fs(c, P.stoneLight, 1.4, 0.65);
    // stone joints
    c.strokeStyle = ink(0.3); c.lineWidth = 1;
    for (let r = 0; r < 4; r++) { const yy = -64 + r * 17; c.beginPath(); c.moveTo(-38, yy); c.lineTo(-24, yy); c.moveTo(24, yy); c.lineTo(38, yy); c.stroke(); }
    // mantel
    rr(c, -44, -82, 88, 11, 3); fs(c, P.woodLight, 1.3, 0.6);
    rr(c, -40, -85, 80, 5, 2); fs(c, P.wood, 1, 0.5);
    // opening
    c.beginPath(); c.moveTo(-24, 0); c.lineTo(-24, -34); c.quadraticCurveTo(-24, -58, 0, -58); c.quadraticCurveTo(24, -58, 24, -34); c.lineTo(24, 0); c.closePath();
    fs(c, '#0f0a12', 1.4, 0.7);
    // ember glow
    glow(c, 0, -8, 46, 0.55 + sin(t * 3) * 0.05, 'amber');
    // logs
    ell(c, -6, -6, 15, 5, 0.12); fs(c, '#3a2418', 1, 0.6); ell(c, 8, -9, 14, 4.6, -0.2); fs(c, '#4a2e20', 1, 0.6);
    ell(c, 0, -3, 12, 4); fs(c, '#2f1c14', 1, 0.6);
    // embers
    for (let i = 0; i < 9; i++) {
      const fl = 0.55 + 0.45 * sin(t * (2 + hh(i, 1) * 3) + i * 1.7);
      ell(c, -14 + i * 3.6 + hh(i, 4) * 2, -5 - hh(i, 2) * 6, 1.5 + hh(i, 3), 1.2 + hh(i, 3) * 0.6);
      c.fillStyle = 'rgba(' + (230 + fl * 25 | 0) + ',' + (110 + fl * 80 | 0) + ',40,' + (0.5 + fl * 0.5) + ')'; c.fill();
    }
    // tiny flame lick
    c.save(); c.globalAlpha = 0.85; flame(c, -2, -9, 1.5, t, 2); flame(c, 8, -9, 1.0, t + 1, 4); c.restore();
    // rising sparks
    for (let i = 0; i < 3; i++) { const u = (t * 0.5 + i / 3) % 1; c.beginPath(); c.arc(-6 + i * 6 + sin(u * 8 + i) * 3, -14 - u * 34, 0.9, 0, TAU); c.fillStyle = 'rgba(247,200,115,' + (1 - u) + ')'; c.fill(); }
    if (occ) peekEyes(c, 2, -36, t, 4, 1);
    // hearth stone
    rr(c, -42, -4, 84, 6, 2); fs(c, P.stone, 1.1, 0.55);
  }

  function drawCurtain(c, o) {
    const t = o.t || 0, occ = o.occupied;
    c.fillStyle = 'rgba(10,6,16,0.25)'; ell(c, 0, 1, 30, 3); c.fill();
    const sw = sin(t * 1.1) * 0.8;
    // rod
    line(c, -32, -102, 32, -102, '#8a6a3a', 3.2);
    for (const s of [-1, 1]) { ell(c, s * 33, -102, 3.8, 3.8); fs(c, P.amberLight, 0.9, 0.55); }
    // two curtain halves
    const gap = occ ? 7 : 0.5;
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * 30, -100);
      c.lineTo(s * gap, -100);
      c.bezierCurveTo(s * (gap + 3) + sw, -66, s * (gap - 1), -34, s * (gap + 5) + sw * 0.5, -2);
      c.lineTo(s * 33, -2 + 0);
      c.bezierCurveTo(s * 35 + sw, -40, s * 32, -70, s * 30, -100); c.closePath();
      fs(c, s < 0 ? P.bordeaux : '#7a3547', 1.3, 0.6);
      c.strokeStyle = 'rgba(30,8,18,0.35)'; c.lineWidth = 1.2;
      for (let i = 1; i < 4; i++) { const xx = s * (gap + i * (30 - gap) / 4); c.beginPath(); c.moveTo(xx, -98); c.bezierCurveTo(xx + sw, -60, xx - 1, -30, xx + s * 2 + sw * 0.5, -2); c.stroke(); }
      c.strokeStyle = 'rgba(255,190,200,0.15)'; c.lineWidth = 1.4;
      const xx = s * (gap + 5); c.beginPath(); c.moveTo(xx, -96); c.bezierCurveTo(xx + sw, -60, xx, -30, xx + s * 2, -4); c.stroke();
      // hem band
      c.beginPath(); c.moveTo(s * (gap + 5), -3); c.lineTo(s * 33, -3); c.strokeStyle = P.amberLight; c.lineWidth = 1.2; c.globalAlpha = 0.5; c.stroke(); c.globalAlpha = 1;
    }
    if (occ) {
      // dark gap fill behind (drawn after halves, thin strip)
      c.beginPath(); c.moveTo(-gap + 0.6, -98); c.bezierCurveTo(-gap + 2, -66, -gap, -34, -gap + 1, -4); c.lineTo(gap - 1, -4); c.bezierCurveTo(gap, -34, gap - 2, -66, gap - 0.6, -98); c.closePath();
      c.fillStyle = '#0d0912'; c.fill();
      peekEyes(c, 0, -52, t, 2.6, 1);
    } else {
      c.beginPath(); c.moveTo(0, -98); c.bezierCurveTo(sw, -60, -1, -30, 0, -3); c.strokeStyle = ink(0.4); c.lineWidth = 1; c.stroke();
    }
    c.beginPath(); c.moveTo(-30, -62); c.quadraticCurveTo(-34, -56, -30, -50); c.strokeStyle = P.amberLight; c.lineWidth = 1.6; c.stroke();
  }

  function drawHideSpot(c, x, y, o) {
    o = o || {};
    c.save(); c.translate(x, y);
    const k = o.kind || 'wardrobe';
    if (k === 'armor') drawArmor(c, o, true); else if (k === 'fireplace') drawFireplace(c, o);
    else if (k === 'curtain') drawCurtain(c, o); else drawWardrobe(c, o);
    c.restore();
  }

  // ---------------------------------------------------------------- traps
  function jag(c, x1, y1, x2, y2, seed, amp, n) {
    c.beginPath(); c.moveTo(x1, y1);
    for (let i = 1; i < n; i++) {
      const u = i / n;
      c.lineTo(x1 + (x2 - x1) * u + (hh(seed, i) - 0.5) * amp, y1 + (y2 - y1) * u + (hh(seed + 7, i) - 0.5) * amp * 1.4);
    }
    c.lineTo(x2, y2);
  }

  function drawChandelier(c, x, y, o) {
    const t = o.t || 0, ang = (o.angle != null) ? o.angle : sin((o.phase || 0) * TAU) * 70 * PI / 180;
    const L = o.rope != null ? o.rope : 3 * TILE;
    c.save(); c.translate(x, y);
    // ceiling mount
    rr(c, -9, -4, 18, 8, 3); fs(c, '#2c2536', 1.2, 0.6);
    ell(c, 0, 4, 4, 3); fs(c, '#8a6a3a', 1, 0.55);
    // chain from the anchor to the bob; bob = anchor + (sin a * L, cos a * L)
    c.save(); c.rotate(-ang);
    const n = Math.max(4, Math.round((L - 14) / 7.5));
    for (let i = 0; i < n; i++) {
      const yy = 4 + (i + 0.5) * (L - 14) / n;
      ell(c, 0, yy, i % 2 ? 1.2 : 2.3, 3.2); c.strokeStyle = ink(0.55); c.lineWidth = 2.3; c.stroke();
      ell(c, 0, yy, i % 2 ? 1.2 : 2.3, 3.2); c.strokeStyle = '#a58a58'; c.lineWidth = 1.1; c.stroke();
    }
    c.restore();
    const bx = sin(ang) * L, by = cos(ang) * L;
    c.translate(bx, by);
    if (o.danger || o.warn) glow(c, 0, 0, o.danger ? 52 : 44, 0.28 + 0.1 * sin(t * 16), 'red');
    glow(c, 0, -2, 50, 0.14, 'amber');
    // body ~44 x 22, centred on the bob (hangs from the chain: tilts only a little)
    const tilt = -ang * 0.45;
    c.rotate(tilt); c.scale(0.7, 0.7); c.translate(0, -3);
    // hook down to body
    line(c, 0, -2, 0, 0, '#a58a58', 1.4);
    ell(c, 0, -2, 4.5, 4.5); fs(c, '#8a6a3a', 1.1, 0.6);
    c.beginPath(); c.moveTo(-5, 0); c.bezierCurveTo(-18, 6, -30, 6, -31, -2); c.moveTo(5, 0); c.bezierCurveTo(18, 6, 30, 6, 31, -2);
    c.moveTo(-3, 0); c.bezierCurveTo(-8, 10, -16, 12, -17, 5); c.moveTo(3, 0); c.bezierCurveTo(8, 10, 16, 12, 17, 5); c.moveTo(0, 2); c.lineTo(0, 12);
    c.strokeStyle = ink(0.7); c.lineWidth = 5.4; c.lineCap = 'round'; c.stroke();
    c.strokeStyle = '#6a5a4a'; c.lineWidth = 3.6; c.stroke();
    const cand = [[-31, -2], [31, -2], [-17, 5], [17, 5], [0, -3]];
    for (let i = 0; i < 5; i++) {
      const cx = cand[i][0], cy = cand[i][1];
      ell(c, cx, cy + 1, 4.4, 1.6); fs(c, '#8a6a3a', 0.9, 0.5);
      rr(c, cx - 1.9, cy - 8, 3.8, 8.5, 1); fs(c, P.cream, 0.9, 0.5);
      c.save(); c.translate(cx, cy - 8); c.rotate(-tilt);
      flame(c, 0, 0, (o.warn ? 1.25 : 1) * 1.3, t, i * 1.3);
      glow(c, 0, -5, 16, 0.3, 'amber');
      c.restore();
    }
    for (let i = -2; i <= 2; i++) {
      const cx = i * 9, cy = 8 + (abs(i) === 1 ? 4 : abs(i) === 2 ? 0 : 7);
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + 1.8, cy + 4); c.lineTo(cx, cy + 7 + sin(t * 3 + i) * 0.4); c.lineTo(cx - 1.8, cy + 4); c.closePath();
      fs(c, 'rgba(201,207,224,0.8)', 0.8, 0.5);
    }
    c.restore();
  }

  function drawSpark(c, x, y, o) {
    const t = o.t || 0, span = o.span || 3 * TILE, danger = o.danger, warn = o.warn;
    const H = 58, tx = [-span / 2, span / 2];
    c.save(); c.translate(x, y);
    c.fillStyle = 'rgba(10,6,16,0.28)'; for (const px of tx) { ell(c, px, 1, 14, 2.6); c.fill(); }
    for (let k = 0; k < 2; k++) {
      const px = tx[k];
      // base
      rr(c, px - 11, -10, 22, 11, 3); fs(c, '#3f4553', 1.3, 0.6);
      ell(c, px - 6, -5, 1.2, 1.2); c.fillStyle = '#8d93a8'; c.fill(); ell(c, px + 6, -5, 1.2, 1.2); c.fill();
      // coil rings narrowing upward
      c.beginPath(); c.moveTo(px - 7, -10); c.lineTo(px + 7, -10); c.lineTo(px + 3.6, -H + 8); c.lineTo(px - 3.6, -H + 8); c.closePath(); fs(c, '#6b4a35', 1.2, 0.6);
      for (let i = 0; i < 6; i++) {
        const u = i / 5, yy = -14 - u * (H - 28), w = 7 - u * 3.4;
        c.beginPath(); c.moveTo(px - w, yy); c.quadraticCurveTo(px, yy + 3, px + w, yy); c.strokeStyle = '#d29b5e'; c.lineWidth = 2.2; c.stroke();
        c.beginPath(); c.moveTo(px - w + 1, yy - 0.8); c.quadraticCurveTo(px, yy + 1.6, px + w - 1, yy - 0.8); c.strokeStyle = 'rgba(255,230,190,0.4)'; c.lineWidth = 0.8; c.stroke();
      }
      // top orb
      const on = danger ? 1 : warn ? 0.6 + 0.4 * sin(t * 30) : 0.25 + 0.1 * sin(t * 3 + k);
      glow(c, px, -H + 2, danger ? 34 : 20, 0.3 + on * 0.5, 'blue');
      ell(c, px, -H + 2, 7, 7); fs(c, '#a07a3a', 1.2, 0.6);
      ell(c, px - 2, -H, 2.4, 2); c.fillStyle = 'rgba(255,240,200,0.7)'; c.fill();
    }
    const ax1 = tx[0], ax2 = tx[1], ay = -H + 2;
    const seed = Math.floor(t * 22);
    if (danger) {
      for (let k = 0; k < 3; k++) {
        const s2 = seed * 3 + k;
        jag(c, ax1 + 6, ay, ax2 - 6, ay, s2, 22, 14);
        c.strokeStyle = 'rgba(160,190,255,' + (k ? 0.25 : 0.4) + ')'; c.lineWidth = k ? 4 : 7; c.lineJoin = 'round'; c.stroke();
        jag(c, ax1 + 6, ay, ax2 - 6, ay, s2, 22, 14);
        c.strokeStyle = k ? 'rgba(220,235,255,0.7)' : '#fff'; c.lineWidth = k ? 1 : 1.8; c.stroke();
      }
      glow(c, 0, ay, span * 0.55, 0.18, 'blue');
    } else if (warn) {
      for (let k = 0; k < 2; k++) {
        const px = tx[k], dir = k ? -1 : 1;
        for (let i = 0; i < 3; i++) {
          if (hh(seed, i + k * 5) < 0.45) continue;
          const an = -PI / 2 + dir * (0.4 + hh(seed + 3, i) * 1.2);
          const l = 9 + hh(seed + 5, i) * 11;
          jag(c, px, ay, px + cos(an) * l, ay + sin(an) * l, seed + i * 11 + k, 7, 4);
          c.strokeStyle = 'rgba(210,225,255,0.9)'; c.lineWidth = 1.2; c.stroke();
        }
      }
    }
    c.restore();
  }

  function drawPlant(c, x, y, o) {
    const t = o.t || 0, danger = o.danger, warn = o.warn;
    c.save(); c.translate(x, y);
    c.fillStyle = 'rgba(10,6,16,0.28)'; ell(c, 0, 1, 20, 3); c.fill();
    const sway = sin(t * 1.6) * 1.5;
    // pot
    c.beginPath(); c.moveTo(-13, -16); c.lineTo(13, -16); c.lineTo(10, 0); c.lineTo(-10, 0); c.closePath(); fs(c, '#8a4a3a', 1.3, 0.6);
    rr(c, -15, -20, 30, 6, 2.5); fs(c, '#a65d4a', 1.2, 0.6);
    c.beginPath(); c.moveTo(-8, -12); c.lineTo(-6.5, -3); c.strokeStyle = 'rgba(255,200,170,0.25)'; c.lineWidth = 1.6; c.stroke();
    // leaves at base
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 3, -20); c.bezierCurveTo(s * 18, -24, s * 26, -14, s * 22, -8); c.bezierCurveTo(s * 14, -14, s * 8, -16, s * 3, -20); fs(c, P.green, 1, 0.55); }
    // stem
    c.beginPath(); c.moveTo(0, -20); c.bezierCurveTo(-4 + sway, -30, 4 + sway, -34, sway, -40);
    c.strokeStyle = ink(0.55); c.lineWidth = 5.4; c.lineCap = 'round'; c.stroke(); c.strokeStyle = P.green; c.lineWidth = 3.6; c.stroke();
    // head: two lobes hinged at bottom
    const open = danger ? 0.05 : warn ? 1.0 : 0.5 + sin(t * 2) * 0.05;
    const hx = sway, hy = -40;
    c.save(); c.translate(hx, hy);
    if (danger) c.scale(1 + 0.05 * sin(t * 40), 1);
    for (const s of [-1, 1]) {
      c.save(); c.rotate(s * (open + 0.05));
      const Lh = 30, W = 15;
      c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(s * -2, -8, s * W * 0.2, -Lh * 0.7, s * W * 0.6, -Lh); c.bezierCurveTo(s * W * 1.5, -Lh * 0.8, s * W * 1.6, -Lh * 0.2, 0, 0);
      c.closePath();
      // outer is green, inner is bordeaux when open (draw inner first as same path)
      fs(c, open > 0.3 ? '#a63a52' : P.green, 1.4, 0.6);
      // teeth along outer edge
      if (open > 0.3) {
        c.save(); c.clip();
        c.fillStyle = 'rgba(255,120,150,0.28)'; ell(c, s * 8, -14, 5, 11, s * 0.1); c.fill();
        c.restore();
      }
      const teeth = 6;
      for (let i = 0; i < teeth; i++) {
        const u = (i + 0.5) / teeth; const px = s * W * (0.6 + 0.95 * Math.sin(u * PI) * 0.0) , py = -u * Lh;
        const bx = s * (W * 1.5 * Math.sin(u * PI * 0.8) * 0.82 + 1.5), by = -Lh * (0.12 + u * 0.82);
        c.beginPath(); c.moveTo(bx, by - 2); c.lineTo(bx - s * 4.2, by); c.lineTo(bx, by + 2); c.closePath(); fs(c, '#f4eedd', 0.6, 0.5);
      }
      c.strokeStyle = 'rgba(30,50,25,0.45)'; c.lineWidth = 1; c.beginPath(); c.moveTo(s * 1, -3); c.quadraticCurveTo(s * 5, -Lh * 0.5, s * 9, -Lh * 0.9); c.stroke();
      c.restore();
    }
    // spots when closed / eyes? tiny glinting mean eyes when warn
    if (warn) { ell(c, 0, -12, 1.4, 1.4); c.fillStyle = P.amberLight; c.fill(); }
    c.restore();
    if (danger) { // chomp marks
      c.strokeStyle = 'rgba(239,230,208,0.85)'; c.lineWidth = 1.4;
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 18, -66); c.lineTo(s * 25, -72); c.moveTo(s * 20, -58); c.lineTo(s * 28, -60); c.stroke(); }
    }
    c.restore();
  }

  function drawFlask(c, x, y, o) {
    const t = o.t || 0, danger = o.danger, warn = o.warn;
    c.save(); c.translate(x, y);
    c.fillStyle = 'rgba(10,6,16,0.28)'; ell(c, 0, 1, 16, 2.6); c.fill();
    // stand: tripod
    for (const s of [-1, 1]) line(c, s * 12, -1, s * 7, -9, '#3f4553', 2.4);
    rr(c, -13, -11, 26, 3, 1.5); fs(c, '#6a6f84', 1, 0.55);
    const wob = warn ? sin(t * 40) * 0.6 : 0;
    c.save(); c.translate(wob, 0);
    // glass flask
    c.beginPath(); c.moveTo(-3.6, -44); c.lineTo(-3.6, -32); c.bezierCurveTo(-5, -26, -14, -22, -14, -17); c.bezierCurveTo(-14, -9, -8, -8, 0, -8); c.bezierCurveTo(8, -8, 14, -9, 14, -17); c.bezierCurveTo(14, -22, 5, -26, 3.6, -32); c.lineTo(3.6, -44); c.closePath();
    fs(c, 'rgba(201,207,224,0.28)', 1.4, 0.6);
    // liquid
    c.save(); c.clip();
    c.beginPath(); c.moveTo(-16, -22 + sin(t * 3) * 0.8); c.quadraticCurveTo(-7, -25 + sin(t * 3 + 1) * 1, 0, -22); c.quadraticCurveTo(7, -19 + sin(t * 3) * 1, 16, -22 + sin(t * 3 + 2) * 0.8); c.lineTo(16, -6); c.lineTo(-16, -6); c.closePath();
    c.fillStyle = 'rgba(120,185,70,0.88)'; c.fill();
    glow(c, 0, -14, 22, danger ? 0.5 : warn ? 0.4 : 0.25, 'green');
    c.restore();
    // bubbles
    const nb = warn || danger ? 6 : 3;
    for (let i = 0; i < nb; i++) {
      const u = (t * (warn ? 1.3 : 0.6) + hh(i, 9)) % 1;
      c.beginPath(); c.arc(-6 + hh(i, 1) * 12 + sin(u * 8 + i) * 1.2, -10 - u * 12, 0.9 + hh(i, 2) * 1.3, 0, TAU);
      c.strokeStyle = 'rgba(225,255,190,0.85)'; c.lineWidth = 0.8; c.stroke();
    }
    // highlight
    c.beginPath(); c.moveTo(-9, -20); c.quadraticCurveTo(-11, -15, -8, -12); c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1.6; c.stroke();
    // cork
    if (!danger) { rr(c, -4.4, -49 + (warn ? sin(t * 40) * 0.8 : 0), 8.8, 7, 2); fs(c, '#b08a5a', 1, 0.55); }
    c.restore();
    // puff
    if (danger) {
      for (let i = 0; i < 6; i++) {
        const u = ((t * 1.6) + i / 6) % 1;
        const r = 5 + u * 14 + hh(i, 3) * 4;
        ell(c, sin(i * 2.3) * 6 * u + sin(t * 3 + i) * 2, -46 - u * 40, r, r * 0.85);
        c.fillStyle = 'rgba(' + (126 + (i % 2) * 20) + ',' + (190 + (i % 3) * 10) + ',70,' + (0.55 * (1 - u * 0.8)) + ')'; c.fill();
        c.strokeStyle = 'rgba(40,70,25,' + 0.25 * (1 - u) + ')'; c.lineWidth = 1; c.stroke();
      }
    }
    c.restore();
  }

  function drawTrap(c, x, y, o) {
    o = o || {};
    const k = o.kind;
    if (k === 'chandelier') drawChandelier(c, x, y, o);
    else if (k === 'spark') drawSpark(c, x, y, o);
    else if (k === 'plant') drawPlant(c, x, y, o);
    else if (k === 'flask') drawFlask(c, x, y, o);
  }

  // ---------------------------------------------------------------- tiles
  const THEMES = {
    bedroom: { stone: ['#4a4256', '#524a5f', '#433b4f'], mortar: '#1f1a27', hi: '#6a6078', accent: '#6b2e3e' },
    greenhouse: { stone: ['#3f4a4a', '#465251', '#394443'], mortar: '#171f1d', hi: '#617068', accent: '#5e7d4a' },
    lab: { stone: ['#3e4558', '#454d61', '#383f50'], mortar: '#141823', hi: '#6a7690', accent: '#4aa0a0' },
    hall: { stone: ['#4f4752', '#58505b', '#48404b'], mortar: '#201a22', hi: '#756a7c', accent: '#8e4256' },
  };
  const SCALE = 2;
  const tileCache = {};
  function mk(w, h) { const s = document.createElement('canvas'); s.width = w * SCALE; s.height = h * SCALE; const c = s.getContext('2d'); c.scale(SCALE, SCALE); return [s, c]; }

  function block(c, x0, y0, x1, y1, seed, col, hi, top) {
    const j = (i) => (hh(seed, i) - 0.5);
    const r = 3.2;
    c.beginPath();
    c.moveTo(x0 + r + j(1), y0 + 0.2 + j(2) * 0.8);
    c.quadraticCurveTo((x0 + x1) / 2, y0 + j(3) * 1.6, x1 - r + j(4), y0 + j(5) * 0.8);
    c.quadraticCurveTo(x1 + j(6) * 0.8, y0 + j(7) * 0.8, x1 + j(8) * 0.6, y0 + r + j(9));
    c.quadraticCurveTo(x1 + j(10) * 1.6, (y0 + y1) / 2, x1 + j(11) * 0.6, y1 - r + j(12));
    c.quadraticCurveTo(x1 + j(13) * 0.8, y1 + j(14) * 0.8, x1 - r + j(15), y1 + j(16) * 0.6);
    c.quadraticCurveTo((x0 + x1) / 2, y1 + j(17) * 1.6, x0 + r + j(18), y1 + j(19) * 0.6);
    c.quadraticCurveTo(x0 + j(20) * 0.8, y1 + j(21) * 0.8, x0 + j(22) * 0.6, y1 - r + j(23));
    c.quadraticCurveTo(x0 + j(24) * 1.6, (y0 + y1) / 2, x0 + j(25) * 0.6, y0 + r + j(26));
    c.quadraticCurveTo(x0 + j(27) * 0.8, y0 + j(28) * 0.8, x0 + r + j(1), y0 + 0.2 + j(2) * 0.8);
    c.closePath();
    c.fillStyle = col; c.fill();
    c.save(); c.clip();
    // highlight band on top, shade at bottom
    c.fillStyle = top ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'; c.fillRect(x0 - 2, y0 - 1, x1 - x0 + 4, 3.5);
    c.fillStyle = 'rgba(10,6,16,0.2)'; c.fillRect(x0 - 2, y1 - 3, x1 - x0 + 4, 4);
    // speckles
    for (let i = 0; i < 4; i++) { c.fillStyle = hh(seed, 40 + i) > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(10,6,16,0.12)'; c.beginPath(); c.arc(x0 + 3 + hh(seed, 50 + i) * (x1 - x0 - 6), y0 + 3 + hh(seed, 60 + i) * (y1 - y0 - 6), 0.8 + hh(seed, 70 + i) * 1.2, 0, TAU); c.fill(); }
    c.restore();
    c.strokeStyle = 'rgba(15,10,22,0.5)'; c.lineWidth = 0.9; c.stroke();
    c.strokeStyle = hi; c.globalAlpha = 0.25; c.lineWidth = 0.9; c.beginPath(); c.moveTo(x0 + r + 0.5, y0 + 1.2); c.quadraticCurveTo((x0 + x1) / 2, y0 + 0.9, x1 - r, y0 + 1.2); c.stroke(); c.globalAlpha = 1;
  }

  function stoneSprite(theme, v, top) {
    const key = 's' + theme + v + (top ? 't' : '');
    if (tileCache[key]) return tileCache[key];
    const th = THEMES[theme] || THEMES.bedroom;
    const [s, c] = mk(TILE, TILE);
    c.fillStyle = th.mortar; c.fillRect(0, 0, TILE, TILE);
    const a = 10 + hh(v, 1) * 16, b = 10 + hh(v, 2) * 16;
    const g = 0.9;
    block(c, g, g, a - g, 18 - g, v * 10 + 1, th.stone[(v) % 3], th.hi, top);
    block(c, a + g, g, TILE - g, 18 - g, v * 10 + 2, th.stone[(v + 1) % 3], th.hi, top);
    block(c, g, 18 + g, b - g, TILE - g, v * 10 + 3, th.stone[(v + 2) % 3], th.hi, false);
    block(c, b + g, 18 + g, TILE - g, TILE - g, v * 10 + 4, th.stone[(v + 1) % 3], th.hi, false);
    if (hh(v, 9) > 0.6) { c.beginPath(); const cx = 4 + hh(v, 10) * 28; c.moveTo(cx, 18 + 4); c.lineTo(cx + 3, 18 + 9); c.lineTo(cx + 1, 18 + 13); c.strokeStyle = 'rgba(10,6,16,0.35)'; c.lineWidth = 0.8; c.stroke(); }
    if (top) {
      if (theme === 'greenhouse') { // moss + tufts
        for (let i = 0; i < 4; i++) { const mx = 3 + hh(v, 20 + i) * 30; c.beginPath(); c.ellipse(mx, 1.5, 3 + hh(v, 30 + i) * 3.5, 1.9, 0, 0, TAU); c.fillStyle = i % 2 ? '#5e7d4a' : '#6f8f55'; c.fill(); }
        c.beginPath(); c.moveTo(6, 2); c.quadraticCurveTo(7, -3, 9, 2); c.moveTo(22, 2); c.quadraticCurveTo(24, -2.5, 26, 2); c.strokeStyle = '#7da35e'; c.lineWidth = 1.1; c.stroke();
      } else if (theme === 'lab') { c.fillStyle = th.accent; c.globalAlpha = 0.5; c.fillRect(3, 1.4, 2, 1); c.fillRect(31, 1.4, 2, 1); c.globalAlpha = 1; }
      else if (theme === 'hall') { c.beginPath(); c.moveTo(1, 1.8); c.lineTo(TILE - 1, 1.8); c.strokeStyle = 'rgba(142,66,86,0.45)'; c.lineWidth = 1.2; c.stroke(); }
    }
    tileCache[key] = s; return s;
  }

  function plankLines(c, seed, y0, y1, col) {
    c.strokeStyle = col; c.lineWidth = 0.8;
    for (let i = 0; i < 3; i++) {
      const yy = y0 + (y1 - y0) * (i + 0.5) / 3 + (hh(seed, i) - 0.5) * 2;
      c.beginPath(); c.moveTo(1, yy); c.bezierCurveTo(10, yy + (hh(seed, i + 5) - 0.5) * 3, 26, yy + (hh(seed, i + 9) - 0.5) * 3, 35, yy); c.stroke();
    }
  }
  function woodSprite(v, creaky, top) {
    const key = (creaky ? 'c' : 'w') + v + (top ? 't' : '');
    if (tileCache[key]) return tileCache[key];
    const [s, c] = mk(TILE, TILE);
    const base = creaky ? '#7a5240' : P.wood, dark = creaky ? '#5f3f31' : P.woodDark, light = creaky ? '#a07156' : P.woodLight;
    c.fillStyle = dark; c.fillRect(0, 0, TILE, TILE);
    // beam
    rr(c, 0.5, 9, TILE - 1, TILE - 10.5, 3); c.fillStyle = base; c.fill();
    plankLines(c, v + (creaky ? 50 : 0), 11, TILE - 3, 'rgba(20,10,8,0.35)');
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, TILE - 7, TILE, 7);
    // top board
    const warp = creaky ? 1.4 : 0;
    c.beginPath();
    c.moveTo(0, 9);
    c.lineTo(0, 3 + warp);
    if (creaky) c.bezierCurveTo(8, 1.5 - 1.2, 14, 6 + 0.5, 22, 2.5 - 0.6); else c.lineTo(8, 3);
    if (creaky) c.bezierCurveTo(28, 1.2, 32, 3.6, TILE, 3 + warp); else c.lineTo(TILE, 3);
    c.lineTo(TILE, 9); c.closePath();
    c.fillStyle = light; c.fill(); c.strokeStyle = ink(0.55); c.lineWidth = 1.1; c.stroke();
    c.strokeStyle = 'rgba(255,235,210,0.35)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(1.5, 4.8 + warp); c.lineTo(TILE - 1.5, 4.8 + warp * 0.5); c.stroke();
    // board joint & nails
    const jx = 8 + hh(v, 3) * 20;
    c.strokeStyle = 'rgba(20,10,8,0.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(jx, 3.5); c.lineTo(jx + 0.5, 9); c.stroke();
    for (const nx of [jx - 4, jx + 4]) { c.beginPath(); c.arc(nx, 6.4, 0.55, 0, TAU); c.fillStyle = 'rgba(30,20,16,0.55)'; c.fill(); }
    if (creaky) {
      // gap, crack, bigger nail
      c.strokeStyle = 'rgba(10,6,10,0.8)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(jx - 8, 9.6); c.quadraticCurveTo(jx, 11.2, jx + 10, 9.6); c.stroke();
      c.beginPath(); c.moveTo(jx + 8, 4); c.lineTo(jx + 10.5, 6); c.lineTo(jx + 9.5, 8.2); c.strokeStyle = 'rgba(20,10,8,0.55)'; c.lineWidth = 0.8; c.stroke();
      c.beginPath(); c.arc(jx - 8, 6.4, 1.5, 0, TAU); c.fillStyle = '#c9cfe0'; c.fill(); c.strokeStyle = ink(0.7); c.lineWidth = 0.8; c.stroke();
      c.beginPath(); c.arc(jx - 8.5, 5.9, 0.5, 0, TAU); c.fillStyle = '#fff'; c.fill();
    }
    tileCache[key] = s; return s;
  }
  function ledgeSprite() {
    if (tileCache.ledge) return tileCache.ledge;
    const [s, c] = mk(TILE, TILE);
    // brackets
    for (const bx of [4, 26]) { c.beginPath(); c.moveTo(bx, 7); c.lineTo(bx + 6, 7); c.lineTo(bx + 6, 9); c.quadraticCurveTo(bx + 5, 15, bx, 17); c.closePath(); fs(c, P.woodDark, 1, 0.55); }
    rr(c, 0, 1.5, TILE, 7, 2.5); fs(c, P.woodLight, 1.2, 0.6);
    c.beginPath(); c.moveTo(2, 3.6); c.lineTo(TILE - 2, 3.6); c.strokeStyle = 'rgba(255,235,210,0.35)'; c.lineWidth = 1; c.stroke();
    c.beginPath(); c.moveTo(0, 8); c.lineTo(TILE, 8); c.strokeStyle = 'rgba(20,10,8,0.35)'; c.lineWidth = 1; c.stroke();
    for (const nx of [6, 30]) { c.beginPath(); c.arc(nx, 5, 0.8, 0, TAU); c.fillStyle = '#2a1f1b'; c.fill(); }
    tileCache.ledge = s; return s;
  }
  function ladderSprite(v) {
    const key = 'lad' + (v % 2);
    if (tileCache[key]) return tileCache[key];
    const [s, c] = mk(TILE, TILE);
    for (const rx of [7, 29]) { rr(c, rx - 2.4, -1, 4.8, TILE + 2, 2); fs(c, P.wood, 1.1, 0.6); c.beginPath(); c.moveTo(rx - 0.8, 0); c.lineTo(rx - 0.8, TILE); c.strokeStyle = 'rgba(255,225,200,0.2)'; c.lineWidth = 1; c.stroke(); }
    for (let i = 0; i < 4; i++) { const yy = 4 + i * 9 + (v % 2) * 0; rr(c, 5, yy - 1.8, 26, 3.6, 1.8); fs(c, P.woodLight, 1, 0.55); }
    tileCache[key] = s; return s;
  }

  function drawTiles(c, world, cam, theme) {
    const cx = cam ? cam.x : 0, cy = cam ? (cam.y || 0) : 0;
    const x0 = max(0, Math.floor(cx / TILE) - 1), x1 = min(world.cols - 1, Math.ceil((cx + VW) / TILE));
    const y0 = max(0, Math.floor(cy / TILE) - 1), y1 = min(world.rows - 1, Math.ceil((cy + VH) / TILE));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const ch = world.tile(tx, ty);
        if (ch === ' ' || ch === '.') {
          if (world.isCreaky && world.isCreaky(tx, ty)) { /* creak marker on empty char: ignore */ }
          continue;
        }
        const v = Math.floor(hh(tx, ty) * 6);
        const topOpen = !world.isSolid(tx, ty - 1);
        let sp;
        const cr = theme === 'crypt';
        if (theme === 'school') { sp = schoolTile(world, ch, tx, ty, v, topOpen); if (sp) c.drawImage(sp, tx * TILE, ty * TILE, TILE, TILE); continue; }
        if (ch === '#') sp = cr ? cryptStoneSprite(v, topOpen) : stoneSprite(theme, v, topOpen);
        else if (ch === '=' || ch === '~') sp = cr ? cryptWoodSprite(v, world.isCreaky(tx, ty), topOpen) : woodSprite(v, world.isCreaky(tx, ty), topOpen);
        else if (ch === '-') sp = cr ? cryptLedgeSprite() : ledgeSprite();
        else if (ch === 'H') sp = cr ? cryptLadderSprite(ty) : ladderSprite(ty);
        else continue;
        c.drawImage(sp, tx * TILE, ty * TILE, TILE, TILE);
      }
    }
  }

  // ---------------------------------------------------------------- background
  const BGW = 480, BGH = 600;
  const bgCache = {};
  const BGTH = {
    bedroom: { top: '#1d1826', bot: '#2c2236', pat: 'rgba(142,66,86,0.16)', glass: ['#2d3a63', '#16183a'], wain: '#2a1f2b', trim: '#4a3126' },
    greenhouse: { top: '#14201f', bot: '#1f2e2a', pat: 'rgba(94,125,74,0.14)', glass: ['#2f5a55', '#10231f'], wain: '#1a2622', trim: '#3b5230' },
    lab: { top: '#121722', bot: '#1d2433', pat: 'rgba(74,160,160,0.10)', glass: ['#2a5470', '#0e1a2c'], wain: '#161c28', trim: '#3f4553' },
    hall: { top: '#1c1722', bot: '#2a2030', pat: 'rgba(201,207,224,0.07)', glass: ['#3a4472', '#1a1c3c'], wain: '#241c26', trim: '#4a4256' },
  };

  function archPath(c, x, y, w, h) { // x,y = top-left; arched top
    c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + w / 2); c.quadraticCurveTo(x, y, x + w / 2, y); c.quadraticCurveTo(x + w, y, x + w, y + w / 2); c.lineTo(x + w, y + h); c.closePath();
  }
  function bgWindow(c, cx, y, w, h, th, moon, theme) {
    const x = cx - w / 2;
    // soft moonlight beam on the wall
    c.save(); c.globalAlpha = 0.07; c.fillStyle = '#c9cfe0';
    c.beginPath(); c.moveTo(x + 6, y + h); c.lineTo(x + w - 6, y + h); c.lineTo(x + w + 90, y + h + 260); c.lineTo(x - 40, y + h + 260); c.closePath(); c.fill(); c.restore();
    archPath(c, x - 5, y - 5, w + 10, h + 10); fs(c, '#4a4256', 2, 0.6);
    archPath(c, x, y, w, h);
    const gr = c.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, th.glass[0]); gr.addColorStop(1, th.glass[1]);
    c.fillStyle = gr; c.fill();
    c.save(); archPath(c, x, y, w, h); c.clip();
    if (moon) {
      glow(c, x + w * 0.62, y + h * 0.3, 60, 0.5, 'moon');
      ell(c, x + w * 0.62, y + h * 0.3, 13, 13); c.fillStyle = '#e8ecf6'; c.fill();
      ell(c, x + w * 0.62 + 4, y + h * 0.3 - 2, 11, 11); c.fillStyle = 'rgba(40,50,90,0.3)'; c.fill();
      // cloud
      ell(c, x + w * 0.3, y + h * 0.45, 22, 5); c.fillStyle = 'rgba(30,35,70,0.6)'; c.fill();
    }
    for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(x + 6 + hh(i, 71) * (w - 12), y + 10 + hh(i, 72) * h * 0.6, 0.7 + hh(i, 73), 0, TAU); c.fillStyle = 'rgba(230,235,255,0.6)'; c.fill(); }
    // distant spire silhouette
    c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + h - 22); c.lineTo(x + 10, y + h - 22); c.lineTo(x + 14, y + h - 40); c.lineTo(x + 18, y + h - 22); c.lineTo(x + w * 0.5, y + h - 16); c.lineTo(x + w, y + h - 30); c.lineTo(x + w, y + h); c.closePath();
    c.fillStyle = 'rgba(10,8,20,0.75)'; c.fill();
    c.restore();
    // mullions
    c.strokeStyle = '#2c2536'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx, y); c.lineTo(cx, y + h); c.moveTo(x, y + h * 0.5); c.lineTo(x + w, y + h * 0.5); c.stroke();
    archPath(c, x, y, w, h); c.strokeStyle = '#4a4256'; c.lineWidth = 2.5; c.stroke();
    // sill
    rr(c, x - 9, y + h, w + 18, 7, 2.5); fs(c, '#4a4256', 1.2, 0.6);
  }
  function bgFrame(c, cx, y, w, h, seed) {
    // hanging portrait silhouette
    line(c, cx - w * 0.3, y - 22, cx, y - 6, 'rgba(180,150,90,0.5)', 1); line(c, cx + w * 0.3, y - 22, cx, y - 6, 'rgba(180,150,90,0.5)', 1);
    rr(c, cx - w / 2, y, w, h, 4); fs(c, '#3a2c24', 2, 0.55);
    rr(c, cx - w / 2 + 4, y + 4, w - 8, h - 8, 2); c.fillStyle = '#1a1520'; c.fill();
    ell(c, cx, y + h * 0.42, w * 0.2, w * 0.24); c.fillStyle = 'rgba(200,190,180,0.55)'; c.fill();
    c.beginPath(); c.moveTo(cx - w * 0.34, y + h - 4); c.quadraticCurveTo(cx - w * 0.3, y + h * 0.62, cx, y + h * 0.62); c.quadraticCurveTo(cx + w * 0.3, y + h * 0.62, cx + w * 0.34, y + h - 4); c.closePath(); c.fillStyle = 'rgba(10,8,14,0.9)'; c.fill();
  }

  function buildBG(theme) {
    const th = BGTH[theme] || BGTH.bedroom;
    const s = document.createElement('canvas'); s.width = BGW; s.height = BGH;
    const c = s.getContext('2d');
    const gr = c.createLinearGradient(0, 0, 0, BGH); gr.addColorStop(0, th.top); gr.addColorStop(1, th.bot);
    c.fillStyle = gr; c.fillRect(0, 0, BGW, BGH);
    // damask pattern
    c.strokeStyle = th.pat; c.fillStyle = th.pat; c.lineWidth = 1.4;
    for (let r = 0; r < 12; r++) for (let q = 0; q < 12; q++) {
      const px = q * 40 + (r % 2) * 20 + 20, py = r * 50 + 25;
      c.beginPath(); c.moveTo(px, py - 14); c.bezierCurveTo(px + 9, py - 6, px + 9, py + 6, px, py + 14); c.bezierCurveTo(px - 9, py + 6, px - 9, py - 6, px, py - 14); c.stroke();
      ell(c, px, py, 2.4, 2.4); c.fill();
      c.beginPath(); c.moveTo(px - 12, py); c.quadraticCurveTo(px - 6, py - 7, px - 1, py - 1); c.moveTo(px + 12, py); c.quadraticCurveTo(px + 6, py + 7, px + 1, py + 1); c.stroke();
    }
    // wainscot
    const wy = 440;
    c.fillStyle = th.wain; c.fillRect(0, wy, BGW, BGH - wy);
    for (let i = 0; i < 6; i++) { rr(c, i * 80 + 8, wy + 22, 64, 110, 5); fs(c, 'rgba(255,255,255,0.03)', 1.4, 0.35); }
    c.fillStyle = th.trim; c.fillRect(0, wy, BGW, 9); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(0, wy, BGW, 2);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, wy + 9, BGW, 3);
    // crown shadow at top
    const cg = c.createLinearGradient(0, 0, 0, 80); cg.addColorStop(0, 'rgba(8,5,14,0.5)'); cg.addColorStop(1, 'rgba(8,5,14,0)'); c.fillStyle = cg; c.fillRect(0, 0, BGW, 80);

    // windows (period 480: two)
    bgWindow(c, 120, 90, 74, 190, th, false, theme); // no moon in the repeating back wall (it looked like many moons)
    if (theme !== 'lab') bgWindow(c, 360, 110, 62, 160, th, false, theme);

    if (theme === 'bedroom') {
      bgFrame(c, 240, 150, 54, 70, 1); bgFrame(c, 8, 170, 40, 52, 2); bgFrame(c, 472, 170, 40, 52, 3);
      // wall sconces
      for (const sx of [190, 290]) { line(c, sx, 290, sx, 300, '#8a6a3a', 3); rr(c, sx - 5, 296, 10, 4, 1.5); fs(c, '#8a6a3a', 0.8, 0.5); rr(c, sx - 1.5, 284, 3, 12, 1); fs(c, P.cream, 0.6, 0.4); }
      // little hanging bats on cord? ribbon garland
      c.beginPath(); c.moveTo(0, 60); c.quadraticCurveTo(120, 100, 240, 60); c.quadraticCurveTo(360, 100, 480, 60); c.strokeStyle = 'rgba(107,46,62,0.6)'; c.lineWidth = 3; c.stroke();
    } else if (theme === 'greenhouse') {
      // iron glass roof ribs and hanging plants
      c.strokeStyle = 'rgba(30,45,40,0.8)'; c.lineWidth = 3;
      for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(i * 120, 0); c.quadraticCurveTo(i * 120 + 60, 60, i * 120 + 120, 0); c.stroke(); }
      for (const px of [240, 20, 460]) {
        line(c, px - 10, 0, px - 6, 78, 'rgba(120,100,70,0.6)', 1.2); line(c, px + 10, 0, px + 6, 78, 'rgba(120,100,70,0.6)', 1.2);
        c.beginPath(); c.moveTo(px - 14, 78); c.lineTo(px + 14, 78); c.lineTo(px + 9, 96); c.lineTo(px - 9, 96); c.closePath(); fs(c, '#3a2a24', 1, 0.5);
        for (let i = 0; i < 7; i++) { const a = -0.3 + i * 0.5; c.beginPath(); c.moveTo(px + (i - 3) * 3, 80); c.quadraticCurveTo(px + (i - 3) * 9, 100 + i % 3 * 8, px + (i - 3) * 12, 112 + hh(i, 5) * 40); c.strokeStyle = 'rgba(70,110,60,0.65)'; c.lineWidth = 2; c.stroke(); ell(c, px + (i - 3) * 12, 114 + hh(i, 5) * 40, 4, 2.2, 1); c.fillStyle = 'rgba(80,125,70,0.7)'; c.fill(); }
      }
      // ferns on the ground
      for (let i = 0; i < 6; i++) { const fx = 30 + i * 80; for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(fx, 440); c.quadraticCurveTo(fx + (k - 2) * 14, 400 - k % 2 * 10, fx + (k - 2) * 24, 408 + hh(i, k) * 14); c.strokeStyle = 'rgba(60,100,55,0.55)'; c.lineWidth = 3; c.stroke(); } }
    } else if (theme === 'lab') {
      // windows replaced: big shelf with flasks & pipes
      bgWindow(c, 360, 110, 62, 160, th, false, theme);
      c.strokeStyle = 'rgba(60,70,90,0.9)'; c.lineWidth = 9; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, 40); c.lineTo(480, 40); c.stroke(); c.strokeStyle = 'rgba(120,135,160,0.25)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 38); c.lineTo(480, 38); c.stroke();
      for (const px of [60, 220, 420]) { rr(c, px - 7, 34, 14, 12, 3); fs(c, '#3f4553', 1, 0.5); }
      c.strokeStyle = 'rgba(60,70,90,0.9)'; c.lineWidth = 6; c.beginPath(); c.moveTo(220, 46); c.lineTo(220, 120); c.quadraticCurveTo(220, 134, 234, 134); c.lineTo(260, 134); c.stroke();
      // shelf
      rr(c, 220, 300, 110, 6, 2); fs(c, '#2c2f3c', 1, 0.5); rr(c, 220, 230, 110, 6, 2); fs(c, '#2c2f3c', 1, 0.5);
      const cols = ['rgba(110,170,200,0.45)', 'rgba(155,211,90,0.4)', 'rgba(200,110,150,0.4)'];
      for (let i = 0; i < 6; i++) { const fx = 232 + i * 17; const fy = i < 3 ? 300 : 230; const cc = cols[i % 3]; ell(c, fx, fy - 9, 6, 6); c.fillStyle = cc; c.fill(); c.strokeStyle = ink(0.5); c.lineWidth = 1; c.stroke(); rr(c, fx - 2, fy - 22, 4, 8, 1.5); fs(c, 'rgba(180,200,220,0.3)', 0.8, 0.4); }
      // gears
      for (const [gx, gy, gr2] of [[40, 220, 24], [74, 262, 15]]) { c.save(); c.translate(gx, gy); c.beginPath(); for (let i = 0; i < 12; i++) { const a0 = i / 12 * TAU, r1 = gr2, r2 = gr2 * 0.82; c.lineTo(cos(a0) * r1, sin(a0) * r1); c.lineTo(cos(a0 + 0.14) * r1, sin(a0 + 0.14) * r1); c.lineTo(cos(a0 + 0.26) * r2, sin(a0 + 0.26) * r2); c.lineTo(cos(a0 + 0.4) * r2, sin(a0 + 0.4) * r2); } c.closePath(); fs(c, 'rgba(60,70,90,0.8)', 1.4, 0.5); ell(c, 0, 0, gr2 * 0.3, gr2 * 0.3); fs(c, '#1d2433', 1, 0.5); c.restore(); }
      // glass tube with glow
      rr(c, 440, 120, 22, 220, 11); fs(c, 'rgba(120,180,200,0.12)', 1.6, 0.5);
      rr(c, 444, 200, 14, 136, 7); c.fillStyle = 'rgba(100,220,160,0.25)'; c.fill();
      glow(c, 451, 270, 60, 0.18, 'green');
    } else { // hall
      // arches & banners & armor silhouettes
      for (const bx of [240]) {
        c.beginPath(); c.moveTo(bx - 17, 60); c.lineTo(bx + 17, 60); c.lineTo(bx + 17, 190); c.lineTo(bx, 172); c.lineTo(bx - 17, 190); c.closePath(); fs(c, 'rgba(107,46,62,0.8)', 1.4, 0.5);
        line(c, bx - 22, 60, bx + 22, 60, '#8a6a3a', 3);
        ell(c, bx, 112, 7, 9); fs(c, 'rgba(243,200,115,0.45)', 1, 0.4);
      }
      // armor silhouette
      c.save(); c.translate(430, 440); c.globalAlpha = 0.5;
      ell(c, 0, -100, 9, 10); fs(c, '#4a4256', 1, 0.5); rr(c, -11, -90, 22, 32, 8); fs(c, '#4a4256', 1, 0.5); rr(c, -9, -60, 7, 40, 3); fs(c, '#4a4256', 1, 0.5); rr(c, 2, -60, 7, 40, 3); fs(c, '#4a4256', 1, 0.5); line(c, 18, -104, 18, -16, '#4a4256', 3);
      c.restore();
      // chandelier silhouette
      line(c, 240, 0, 240, 14, 'rgba(120,100,70,0.5)', 1.5); c.beginPath(); c.moveTo(214, 22); c.quadraticCurveTo(240, 36, 266, 22); c.strokeStyle = 'rgba(138,106,58,0.55)'; c.lineWidth = 3; c.stroke();
      for (const fx of [-24, -12, 0, 12, 24]) { rr(c, 240 + fx - 1.5, 14, 3, 8, 1); c.fillStyle = 'rgba(239,230,208,0.5)'; c.fill(); ell(c, 240 + fx, 11, 1.6, 2.6); c.fillStyle = 'rgba(247,180,80,0.7)'; c.fill(); }
      glow(c, 240, 14, 60, 0.15, 'amber');
    }
    // floor shadow gradient
    const fg = c.createLinearGradient(0, BGH - 100, 0, BGH); fg.addColorStop(0, 'rgba(8,5,14,0)'); fg.addColorStop(1, 'rgba(8,5,14,0.5)'); c.fillStyle = fg; c.fillRect(0, BGH - 100, BGW, 100);
    return s;
  }
  let vignette = null;
  const motes = [];
  for (let i = 0; i < 14; i++) motes.push([hh(i, 1) * VW, hh(i, 2) * VH, 0.5 + hh(i, 3) * 1.4, hh(i, 4) * 6]);

  function drawBackground(c, cam, theme, t) {
    t = t || 0;
    let bg = bgCache[theme]; if (!bg) bg = bgCache[theme] = theme === 'crypt' ? buildCryptBG() : (theme && theme.indexOf('school') === 0) ? buildSchoolBG(theme) : buildBG(theme);
    const cx = cam ? cam.x : 0, cy = cam ? (cam.y || 0) : 0;
    let off = -((cx * 0.3) % BGW); if (off > 0) off -= BGW;
    const dy = -clamp(cy * 0.08, 0, BGH - VH);
    for (let x = off; x < VW; x += BGW) c.drawImage(bg, Math.round(x), dy);
    // drifting dust motes
    c.fillStyle = 'rgba(230,225,255,0.22)';
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      const px = ((m[0] + t * (3 + m[2] * 2) - cx * 0.15) % VW + VW) % VW, py = ((m[1] - t * 2 * m[2] + sin(t * 0.7 + m[3]) * 8) % VH + VH) % VH;
      c.beginPath(); c.arc(px, py, m[2] * 0.9, 0, TAU); c.fill();
    }
    // vignette
    if (!vignette) {
      vignette = document.createElement('canvas'); vignette.width = VW; vignette.height = VH;
      const v = vignette.getContext('2d');
      const g = v.createRadialGradient(VW / 2, VH / 2, VH * 0.4, VW / 2, VH / 2, VW * 0.62);
      g.addColorStop(0, 'rgba(10,6,18,0)'); g.addColorStop(1, 'rgba(10,6,18,0.5)');
      v.fillStyle = g; v.fillRect(0, 0, VW, VH);
    }
    // (the aula clock now lives in the room's foreground deco)
    c.drawImage(vignette, 0, 0);
  }

  // ---------------------------------------------------------------- deco
  function bookRow(c, x0, x1, yb, seed) {
    const cols = ['#6b2e3e', '#3b5230', '#4a4256', '#7a5240', '#2d3a63', '#8e4256', '#5a3b2e'];
    let x = x0, i = 0;
    while (x < x1 - 4) {
      const w = 5 + hh(seed, i) * 5, h = 16 + hh(seed, i + 20) * 10;
      if (hh(seed, i + 40) > 0.88 && x + 16 < x1) { // leaning book
        c.save(); c.translate(x + 2, yb); c.rotate(0.3); rr(c, 0, -h, w, h, 1); fs(c, cols[(i * 3) % cols.length], 0.8, 0.5); c.restore(); x += w + 8; i++; continue;
      }
      rr(c, x, yb - h, w, h, 1.2); fs(c, cols[(i * 5 + seed) % cols.length], 0.8, 0.5);
      c.beginPath(); c.moveTo(x + 1, yb - h + 4); c.lineTo(x + w - 1, yb - h + 4); c.strokeStyle = 'rgba(243,200,115,0.5)'; c.lineWidth = 0.8; c.stroke();
      x += w + 0.4; i++;
    }
  }

  function drawDeco(c, x, y, o) {
    o = o || {};
    const k = o.kind, t = o.t || 0;
    c.save(); c.translate(x, y);
    if (cryptDeco(c, k, t) || schoolDeco(c, k, t, o)) { c.restore(); return; }
    switch (k) {
      case 'window': {
        const w = 62, h = 100, th = BGTH.bedroom;
        archPath(c, -w / 2 - 5, -h - 5, w + 10, h + 10); fs(c, '#4a4256', 2, 0.6);
        archPath(c, -w / 2, -h, w, h);
        const gr = c.createLinearGradient(0, -h, 0, 0); gr.addColorStop(0, '#34457a'); gr.addColorStop(1, '#171a3c'); c.fillStyle = gr; c.fill();
        c.save(); archPath(c, -w / 2, -h, w, h); c.clip();
        { // one moon in the sky: a fixed point on screen, seen only through the window that is in front of it
          const cam = G.camera || { x: 0, y: 0 }, MX = 700, MY = 150;
          const mx = MX - (x - cam.x), my = MY - (y - cam.y);
          if (mx > -w / 2 - 12 && mx < w / 2 + 12 && my > -h - 12 && my < 12) {
            glow(c, mx, my, 46, 0.45, 'moon'); ell(c, mx, my, 10, 10); c.fillStyle = '#eef1fa'; c.fill();
          }
        }
        for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(-w / 2 + 6 + hh(i, 11) * (w - 12), -h + 12 + hh(i, 12) * 40, 0.8, 0, TAU); c.fillStyle = 'rgba(230,235,255,0.7)'; c.fill(); }
        ell(c, -12, -h * 0.5, 16, 4); c.fillStyle = 'rgba(25,28,60,0.6)'; c.fill();
        c.restore();
        c.strokeStyle = '#2c2536'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -h); c.lineTo(0, 0); c.moveTo(-w / 2, -h * 0.45); c.lineTo(w / 2, -h * 0.45); c.stroke();
        rr(c, -w / 2 - 9, 0, w + 18, 7, 2.5); fs(c, '#4a4256', 1.2, 0.6);
        glow(c, 0, -h * 0.5, 80, 0.08, 'moon');
        break;
      }
      case 'portrait': {
        const w = 46, h = 58;
        line(c, -w * 0.3, -h - 16, 0, -h - 2, '#a07a3a', 1.2); line(c, w * 0.3, -h - 16, 0, -h - 2, '#a07a3a', 1.2); ell(c, 0, -h - 3, 2, 2); fs(c, '#a07a3a', 0.6, 0.5);
        rr(c, -w / 2, -h, w, h, 4); fs(c, '#8a6a3a', 1.6, 0.65);
        rr(c, -w / 2 + 4, -h + 4, w - 8, h - 8, 2); fs(c, '#2a2432', 1, 0.6);
        // ancestor: pale deadpan face, white wig, dark high-collar coat
        c.beginPath(); c.moveTo(-14, -6); c.quadraticCurveTo(-15, -22, 0, -23); c.quadraticCurveTo(15, -22, 14, -6); c.closePath(); fs(c, '#16121c', 0.8, 0.5);
        ell(c, 0, -34, 11, 12.5); fs(c, '#d9d2c8', 0.8, 0.55);
        c.beginPath(); c.moveTo(-12, -34); c.bezierCurveTo(-14, -50, 14, -50, 12, -34); c.bezierCurveTo(8, -42, -8, -42, -12, -34); fs(c, '#e8e5ef', 0.8, 0.5);
        ell(c, -12.5, -30, 3.4, 6); fs(c, '#e8e5ef', 0.6, 0.45); ell(c, 12.5, -30, 3.4, 6); fs(c, '#e8e5ef', 0.6, 0.45);
        for (const s of [-1, 1]) { ell(c, s * 4.2, -34, 2.4, 1.9); c.fillStyle = '#fff'; c.fill(); c.beginPath(); c.arc(s * 4.2, -33.5, 1.1, 0, TAU); c.fillStyle = '#1b1420'; c.fill(); c.beginPath(); c.moveTo(s * 4.2 - 3, -34.3); c.lineTo(s * 4.2 + 3, -34.3); c.strokeStyle = ink(0.8); c.lineWidth = 1; c.stroke(); }
        c.beginPath(); c.moveTo(-3, -26.5); c.lineTo(3, -26.5); c.strokeStyle = 'rgba(70,40,55,0.8)'; c.lineWidth = 1; c.stroke();
        c.beginPath(); c.moveTo(-3, -22); c.lineTo(0, -17); c.lineTo(3, -22); c.closePath(); fs(c, '#f2ece4', 0.6, 0.5);
        rr(c, -8, -2.5, 16, 3, 1); fs(c, '#a07a3a', 0.5, 0.5);
        break;
      }
      case 'candelabra': {
        glow(c, 0, -52, 52, 0.28 + 0.04 * sin(t * 9), 'amber');
        ell(c, 0, -2, 12, 3.4); fs(c, '#8a6a3a', 1.1, 0.6);
        rr(c, -2.4, -34, 4.8, 32, 2); fs(c, '#a07a3a', 1, 0.6);
        ell(c, 0, -16, 5, 3.6); fs(c, '#8a6a3a', 0.9, 0.55);
        c.beginPath(); c.moveTo(0, -30); c.bezierCurveTo(-8, -30, -16, -32, -16, -42); c.moveTo(0, -30); c.bezierCurveTo(8, -30, 16, -32, 16, -42); c.moveTo(0, -30); c.lineTo(0, -44);
        c.strokeStyle = ink(0.6); c.lineWidth = 4; c.lineCap = 'round'; c.stroke(); c.strokeStyle = '#a07a3a'; c.lineWidth = 2.4; c.stroke();
        for (const [cx2, cy2, sd] of [[-16, -42, 1], [0, -44, 2], [16, -42, 3]]) {
          ell(c, cx2, cy2, 4, 1.6); fs(c, '#8a6a3a', 0.8, 0.5);
          rr(c, cx2 - 2, cy2 - 11, 4, 11, 1.2); fs(c, P.cream, 0.7, 0.5);
          flame(c, cx2, cy2 - 11, 1.1, t, sd);
        }
        break;
      }
      case 'bookshelf': {
        const w = 72, h = 108;
        rr(c, -w / 2, -h, w, h, 4); fs(c, P.woodDark, 1.5, 0.65);
        rr(c, -w / 2 - 3, -h - 5, w + 6, 8, 3); fs(c, P.woodLight, 1.3, 0.6);
        for (let i = 0; i < 3; i++) {
          const yb = -h + 34 + i * 33;
          c.fillStyle = '#1a1218'; c.fillRect(-w / 2 + 4, yb - 30, w - 8, 30);
          bookRow(c, -w / 2 + 6, w / 2 - 6, yb, 3 + i * 7);
          rr(c, -w / 2 + 2, yb, w - 4, 4, 1.5); fs(c, P.wood, 0.9, 0.55);
        }
        // skull on top? tiny
        ell(c, 18, -h - 9, 5.5, 5); fs(c, '#e8e0d0', 0.8, 0.5); ell(c, 16.5, -h - 9.5, 1.2, 1.4); c.fillStyle = ink(0.8); c.fill(); ell(c, 20, -h - 9.5, 1.2, 1.4); c.fill();
        break;
      }
      case 'cobweb': { // top-left anchor
        const S = 54;
        c.strokeStyle = 'rgba(225,225,240,0.55)'; c.lineWidth = 0.9; c.lineCap = 'round';
        const rays = [0, 0.25, 0.5, 0.75, 1];
        for (const u of rays) { c.beginPath(); c.moveTo(0, 0); c.lineTo(S * u * 1, S * (1 - u) * 1 * 0 + S * (u < 1 ? 1 - u * 0 : 1) * 0); c.stroke(); }
        // rays as lines to the arc
        for (let i = 0; i <= 4; i++) { const a = i / 4 * PI / 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(cos(a) * S, sin(a) * S); c.stroke(); }
        for (let r = 1; r <= 4; r++) {
          const rad = S * r / 4;
          c.beginPath();
          for (let i = 0; i <= 4; i++) { const a = i / 4 * PI / 2; const px = cos(a) * rad, py = sin(a) * rad; if (i === 0) c.moveTo(px, py); else c.quadraticCurveTo(cos(a - PI / 8) * rad * 0.86, sin(a - PI / 8) * rad * 0.86, px, py); }
          c.stroke();
        }
        // dangling spider
        const sy = 30 + sin(t * 1.4) * 4;
        line(c, 24, 14, 24, sy, 'rgba(225,225,240,0.5)', 0.8);
        ell(c, 24, sy + 3, 3.2, 2.6); fs(c, '#17131e', 0.6, 0.5);
        for (let i = -1; i <= 1; i += 2) for (let j = 0; j < 3; j++) { c.beginPath(); c.moveTo(24, sy + 3); c.quadraticCurveTo(24 + i * 5, sy + j * 1.5, 24 + i * 6, sy + 4 + j * 1.5); c.strokeStyle = '#17131e'; c.lineWidth = 0.7; c.stroke(); }
        break;
      }
      case 'plantpot': {
        const sw = sin(t * 1.2) * 1.2;
        c.beginPath(); c.moveTo(-12, -28); c.lineTo(12, -28); c.lineTo(9, 0); c.lineTo(-9, 0); c.closePath(); fs(c, '#8a4a3a', 1.3, 0.6);
        rr(c, -14, -32, 28, 7, 3); fs(c, '#a65d4a', 1.2, 0.6);
        for (let i = 0; i < 7; i++) {
          const a = -PI / 2 + (i - 3) * 0.42, L = 30 + hh(i, 2) * 14;
          const ex = cos(a) * L + sw * 0.4, ey = -32 + sin(a) * L;
          c.beginPath(); c.moveTo(0, -32); c.quadraticCurveTo(cos(a) * L * 0.5, -32 + sin(a) * L * 0.5 - 6, ex, ey);
          c.strokeStyle = ink(0.4); c.lineWidth = 2.6; c.stroke(); c.strokeStyle = P.greenDark; c.lineWidth = 1.4; c.stroke();
          ell(c, ex, ey, 9, 4.8, a + PI / 2 - 0.3 + sw * 0.01); fs(c, i % 2 ? P.green : '#6f8f55', 1, 0.5);
        }
        ell(c, 6, -64, 3.4, 3.4); fs(c, P.bordeauxLight, 0.7, 0.5); ell(c, 6, -64, 1, 1); c.fillStyle = P.amberLight; c.fill();
        break;
      }
      case 'labbench': {
        const w = 108;
        for (const s of [-1, 1]) rr(c, s * 44 - 4, -26, 8, 26, 2); // legs placeholder path
        for (const s of [-1, 1]) { rr(c, s * 44 - 4, -26, 8, 26, 2); fs(c, P.woodDark, 1, 0.55); }
        rr(c, -w / 2, -32, w, 8, 3); fs(c, P.woodLight, 1.3, 0.6);
        rr(c, -w / 2 + 6, -26, w - 12, 8, 2); fs(c, P.wood, 1, 0.5);
        // flasks
        const liq = ['rgba(120,185,70,0.85)', 'rgba(110,170,220,0.85)', 'rgba(200,110,150,0.85)'];
        for (let i = 0; i < 3; i++) {
          const fx = -36 + i * 18, fh = 24 - i * 3;
          c.beginPath(); c.moveTo(fx - 2.4, -32 - fh); c.lineTo(fx - 2.4, -32 - fh * 0.6); c.bezierCurveTo(fx - 10, -32 - fh * 0.4, fx - 9, -32, fx, -32); c.bezierCurveTo(fx + 9, -32, fx + 10, -32 - fh * 0.4, fx + 2.4, -32 - fh * 0.6); c.lineTo(fx + 2.4, -32 - fh); c.closePath();
          fs(c, 'rgba(201,207,224,0.25)', 1, 0.55);
          c.beginPath(); c.moveTo(fx - 8, -32 - fh * 0.3); c.quadraticCurveTo(fx, -32 - fh * 0.38 + sin(t * 2 + i), fx + 8, -32 - fh * 0.3); c.bezierCurveTo(fx + 8, -32, fx - 8, -32, fx - 8, -32 - fh * 0.3); c.fillStyle = liq[i]; c.fill();
          const bp = (t * 0.7 + i * 0.33) % 1; c.beginPath(); c.arc(fx + sin(bp * 9) * 2, -34 - bp * 12, 1.2, 0, TAU); c.strokeStyle = 'rgba(230,255,200,0.8)'; c.lineWidth = 0.8; c.stroke();
        }
        // burner + beaker
        rr(c, 20, -38, 10, 6, 2); fs(c, '#3f4553', 0.9, 0.55); flame(c, 25, -38, 1, t, 4); glow(c, 25, -42, 16, 0.2, 'amber');
        rr(c, 36, -46, 14, 14, 3); fs(c, 'rgba(201,207,224,0.25)', 1, 0.55); rr(c, 37, -38, 12, 6, 2); c.fillStyle = 'rgba(155,211,90,0.8)'; c.fill();
        // book
        rr(c, -50, -39, 14, 7, 1.5); fs(c, P.bordeaux, 0.8, 0.5);
        break;
      }
      case 'rug': {
        const w = 108;
        c.beginPath(); c.ellipse(0, -3.5, w / 2, 4.2, 0, 0, TAU); fs(c, P.bordeaux, 1.3, 0.55);
        c.beginPath(); c.ellipse(0, -3.5, w / 2 - 6, 2.6, 0, 0, TAU); c.strokeStyle = P.amberLight; c.globalAlpha = 0.65; c.lineWidth = 1.1; c.stroke(); c.globalAlpha = 1;
        for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 12 - 3, -3.5); c.lineTo(i * 12, -5); c.lineTo(i * 12 + 3, -3.5); c.lineTo(i * 12, -2); c.closePath(); c.fillStyle = 'rgba(243,200,115,0.7)'; c.fill(); }
        for (const s of [-1, 1]) for (let i = 0; i < 4; i++) line(c, s * (w / 2 - 1), -3.5 + (i - 1.5) * 1.1, s * (w / 2 + 3), -3.5 + (i - 1.5) * 1.5, '#d9c9a0', 0.9);
        break;
      }
      case 'clock': {
        const w = 36, h = 96;
        rr(c, -w / 2, -h + 14, w, h - 14, 4); fs(c, P.wood, 1.5, 0.65);
        c.beginPath(); c.moveTo(-w / 2 - 3, -h + 16); c.lineTo(-w / 2 - 3, -h + 8); c.quadraticCurveTo(0, -h - 10, w / 2 + 3, -h + 8); c.lineTo(w / 2 + 3, -h + 16); c.closePath(); fs(c, P.woodLight, 1.4, 0.6);
        rr(c, -w / 2 - 3, -8, w + 6, 8, 2); fs(c, P.woodLight, 1.2, 0.6);
        ell(c, 0, -h + 22, 12, 12); fs(c, P.cream, 1.3, 0.65);
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; line(c, cos(a) * 9, -h + 22 + sin(a) * 9, cos(a) * 10.6, -h + 22 + sin(a) * 10.6, ink(0.7), 1); }
        const ha = t * 0.1; line(c, 0, -h + 22, cos(ha) * 8, -h + 22 + sin(ha) * 8, ink(0.9), 1.3); line(c, 0, -h + 22, cos(ha * 12) * 6, -h + 22 + sin(ha * 12) * 6, ink(0.9), 1);
        rr(c, -10, -h + 40, 20, 46, 3); fs(c, '#1a1218', 1, 0.5);
        const pa = sin(t * 3.3) * 0.28;
        c.save(); c.translate(0, -h + 42); c.rotate(pa); line(c, 0, 0, 0, 32, '#a07a3a', 1.4); ell(c, 0, 33, 5.2, 5.2); fs(c, '#c8a050', 1, 0.55); c.restore();
        break;
      }
      case 'banner': {
        const w = 32, h = 78;
        line(c, -w / 2 - 4, -h, w / 2 + 4, -h, '#8a6a3a', 3); ell(c, -w / 2 - 5, -h, 2.6, 2.6); fs(c, P.amberLight, 0.8, 0.5); ell(c, w / 2 + 5, -h, 2.6, 2.6); fs(c, P.amberLight, 0.8, 0.5);
        const sw = sin(t * 1.2) * 1.5;
        c.beginPath(); c.moveTo(-w / 2, -h + 2); c.lineTo(w / 2, -h + 2); c.lineTo(w / 2 + sw * 0.3, -6); c.lineTo(sw, -16); c.lineTo(-w / 2 + sw * 0.3, -6); c.closePath(); fs(c, P.bordeaux, 1.4, 0.6);
        c.strokeStyle = P.amberLight; c.globalAlpha = 0.6; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-w / 2 + 3, -h + 7); c.lineTo(w / 2 - 3, -h + 7); c.stroke(); c.globalAlpha = 1;
        // crest: crescent + tiny crow silhouette
        c.beginPath(); c.arc(0, -h + 30, 9, 0.7, 5.6); c.arc(3.5, -h + 30, 7.5, 5.4, 0.9, true); c.closePath(); fs(c, P.amberLight, 0.8, 0.45);
        ell(c, 0, -h + 50, 4, 3); c.fillStyle = '#17131e'; c.fill(); ell(c, 3.6, -h + 48, 2, 2); c.fill();
        break;
      }
      case 'armorstand': drawArmor(c, { t }, false); break;
      case 'bed_ivy': {
        const w = 100;
        c.fillStyle = 'rgba(10,6,16,0.3)'; ell(c, 0, 1, 52, 4); c.fill();
        // posts
        for (const s of [-1, 1]) { rr(c, s * 46 - 3, -86, 6, 86, 2.5); fs(c, '#2c2230', 1.2, 0.6); ell(c, s * 46, -88, 4, 4); fs(c, '#8a6a3a', 0.8, 0.5); }
        // canopy
        c.beginPath(); c.moveTo(-54, -84); c.bezierCurveTo(-30, -102, 30, -102, 54, -84); c.lineTo(54, -80); c.lineTo(-54, -80); c.closePath(); fs(c, '#201a29', 1.3, 0.6);
        c.beginPath(); c.moveTo(-54, -80); for (let i = 0; i < 7; i++) { const x0 = -54 + i * 15.4; c.quadraticCurveTo(x0 + 7.7, -68, x0 + 15.4, -80); } c.closePath(); fs(c, '#2c2236', 1.1, 0.55);
        c.beginPath(); c.moveTo(-54, -80); for (let i = 0; i < 7; i++) { const x0 = -54 + i * 15.4; c.quadraticCurveTo(x0 + 7.7, -70, x0 + 15.4, -80); } c.strokeStyle = P.bordeauxLight; c.lineWidth = 1.2; c.stroke();
        // curtains drawn open
        for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 52, -80); c.bezierCurveTo(s * 56, -60, s * 44, -44, s * 46, -30); c.lineTo(s * 40, -30); c.bezierCurveTo(s * 40, -50, s * 46, -64, s * 42, -80); c.closePath(); fs(c, '#1c1724', 1.1, 0.55); }
        // headboard
        rr(c, -44, -56, 88, 30, 6); fs(c, '#2c2230', 1.2, 0.55);
        // pillow & blanket
        rr(c, -38, -40, 34, 14, 7); fs(c, '#cfc7d6', 1.1, 0.55);
        c.beginPath(); c.moveTo(-42, -22); c.quadraticCurveTo(-30, -34, -10, -28); c.quadraticCurveTo(20, -32, 42, -24); c.lineTo(42, -12); c.lineTo(-42, -12); c.closePath(); fs(c, '#3a3247', 1.2, 0.55);
        c.beginPath(); c.moveTo(-42, -22); c.quadraticCurveTo(-30, -34, -10, -28); c.quadraticCurveTo(20, -32, 42, -24); c.strokeStyle = P.bordeauxLight; c.lineWidth = 1.6; c.stroke();
        // frame
        rr(c, -50, -16, 100, 12, 4); fs(c, '#2c2230', 1.2, 0.6); rr(c, -46, -6, 8, 7, 2); fs(c, '#201a29', 1, 0.5); rr(c, 38, -6, 8, 7, 2); fs(c, '#201a29', 1, 0.5);
        // plush spider
        ell(c, 14, -33, 4, 3.4); fs(c, '#17131e', 0.6, 0.5);
        for (let i = -1; i <= 1; i += 2) for (let j = 0; j < 2; j++) line(c, 14 + i * 3, -33, 14 + i * 7, -32 + j * 3, '#17131e', 1);
        ell(c, 12.8, -33.4, 0.7, 0.7); c.fillStyle = P.amberLight; c.fill(); ell(c, 15.4, -33.4, 0.7, 0.7); c.fill();
        break;
      }
      case 'stairs_down': {
        const w = 52, h = 78;
        // glow from below
        glow(c, 6, -24, 46, 0.35 + 0.06 * sin(t * 2), 'amber');
        c.beginPath(); c.moveTo(-w / 2 - 5, 0); c.lineTo(-w / 2 - 5, -h + w / 2); c.quadraticCurveTo(-w / 2 - 5, -h - 6, 0, -h - 6); c.quadraticCurveTo(w / 2 + 5, -h - 6, w / 2 + 5, -h + w / 2); c.lineTo(w / 2 + 5, 0); c.closePath();
        fs(c, '#4a4256', 2, 0.6);
        archPath(c, -w / 2, -h, w, h); c.fillStyle = '#0d0912'; c.fill();
        c.save(); archPath(c, -w / 2, -h, w, h); c.clip();
        // steps going down to the right
        for (let i = 0; i < 6; i++) {
          const sx = -w / 2 + i * 8, sy = -h + 40 + i * 9;
          c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 8, sy); c.lineTo(sx + 8, sy + 60); c.lineTo(sx, sy + 60); c.closePath();
          c.fillStyle = 'rgb(' + (92 - i * 6) + ',' + (80 - i * 6) + ',' + (104 - i * 6) + ')'; c.fill();
          c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 8, sy); c.strokeStyle = 'rgba(243,200,115,' + (0.5 - i * 0.05) + ')'; c.lineWidth = 1.4; c.stroke();
        }
        glow(c, 10, -10, 40, 0.3, 'amber');
        c.restore();
        archPath(c, -w / 2, -h, w, h); c.strokeStyle = ink(0.5); c.lineWidth = 1.2; c.stroke();
        // keystone
        c.beginPath(); c.moveTo(-5, -h - 6); c.lineTo(5, -h - 6); c.lineTo(3.5, -h + 3); c.lineTo(-3.5, -h + 3); c.closePath(); fs(c, '#5d5469', 1, 0.5);
        // bobbing arrow
        const ay = -h - 16 + sin(t * 3) * 2.5;
        c.beginPath(); c.moveTo(-6, ay - 4); c.lineTo(0, ay + 3); c.lineTo(6, ay - 4); c.strokeStyle = ink(0.5); c.lineWidth = 4; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
        c.strokeStyle = P.cream; c.lineWidth = 2.4; c.stroke();
        break;
      }
      case 'perch': {
        rr(c, -12, -4, 24, 5, 2); fs(c, P.woodDark, 1.1, 0.55);
        rr(c, -2.4, -52, 4.8, 48, 2); fs(c, P.wood, 1.1, 0.55);
        c.beginPath(); c.moveTo(-20, -50); c.quadraticCurveTo(0, -54, 22, -49); c.strokeStyle = ink(0.6); c.lineWidth = 6; c.lineCap = 'round'; c.stroke(); c.strokeStyle = P.woodLight; c.lineWidth = 4; c.stroke();
        // feather on perch
        c.save(); c.translate(12, -54); c.rotate(-0.4);
        c.beginPath(); c.moveTo(-9, 0); c.bezierCurveTo(-4, -4, 5, -4, 9, 0); c.bezierCurveTo(5, 3, -4, 3, -9, 0); fs(c, '#1d1a2a', 0.8, 0.5);
        c.beginPath(); c.moveTo(-9, 0); c.lineTo(9, 0); c.strokeStyle = 'rgba(120,150,230,0.5)'; c.lineWidth = 0.8; c.stroke(); c.restore();
        // feather on floor
        c.save(); c.translate(-18, -2); c.rotate(0.15);
        c.beginPath(); c.moveTo(-7, 0); c.bezierCurveTo(-3, -3, 4, -3, 7, 0); c.bezierCurveTo(4, 2, -3, 2, -7, 0); fs(c, '#1d1a2a', 0.8, 0.5); c.restore();
        // tiny ring
        ell(c, -2, -40, 3, 3); c.strokeStyle = '#a07a3a'; c.lineWidth = 1.2; c.stroke();
        break;
      }
    }
    c.restore();
  }

  // ---------------------------------------------------------------- crow
  function drawCrow(c, x, y, o) {
    o = o || {};
    const t = o.t || 0, heads = o.heads === 3 ? 3 : o.heads === 1 ? 1 : 2, sc = o.scale || 1;
    const flap = o.flap ? (typeof o.flap === 'number' ? o.flap : 1) : 0;
    c.save(); c.translate(x, y); c.scale(sc, sc);
    const fy = flap ? -12 - abs(sin(t * 12 * flap)) * 4 : 0;
    if (!flap) { c.fillStyle = 'rgba(10,6,16,0.28)'; ell(c, 0, 0.5, 13, 2.4); c.fill(); }
    c.translate(0, fy);
    const body = '#1d1a2a', sheen = 'rgba(130,160,240,0.45)';
    // legs
    if (!flap) { for (const s of [-1, 1]) { line(c, s * 3.5, -8, s * 3.5, -0.5 - fy, '#8a6a3a', 1.6); line(c, s * 3.5, -0.5 - fy, s * 3.5 + 3, -0.5 - fy, '#8a6a3a', 1.6); line(c, s * 3.5, -0.5 - fy, s * 3.5 - 2, 0 - fy, '#8a6a3a', 1.4); } }
    else { for (const s of [-1, 1]) line(c, s * 3, -8, s * 4 + 1, -4, '#8a6a3a', 1.4); }
    // tail
    c.save(); c.translate(-9, -11); c.rotate(flap ? 0.5 + sin(t * 12 * flap) * 0.1 : 0.35);
    for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-6, i * 2.4 - 3, -11, i * 3, -14, i * 4); c.bezierCurveTo(-10, i * 4 + 3, -5, i * 2.4 + 3, 0, 3); c.closePath(); fs(c, body, 0.9, 0.55); }
    c.restore();
    // back wing (far)
    const wa = flap ? sin(t * 12 * flap) : 0;
    c.save(); c.translate(-1, -17); c.rotate(flap ? 0.7 + wa * 0.9 : 0.05);
    c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-6, -8, -18, -12, -26, -8); c.bezierCurveTo(-22, -4, -24, 0, -20, 3); c.bezierCurveTo(-16, 3, -8, 4, 0, 4); c.closePath(); fs(c, '#15131f', 1, 0.55);
    c.restore();
    // body
    ell(c, 0, -13, 13, 9.5, -0.15); fs(c, body, 1.3, 0.6);
    ell(c, 3, -9, 8, 5, -0.1); c.fillStyle = 'rgba(70,75,110,0.35)'; c.fill();
    c.beginPath(); c.moveTo(-6, -20); c.quadraticCurveTo(2, -23, 9, -18); c.strokeStyle = sheen; c.lineWidth = 1.5; c.stroke();
    // necks + heads
    const hd = heads === 3 ? [[-6, -36, -0.25], [3, -42, 0], [12, -34, 0.25]] : heads === 1 ? [[6, -38, 0.05]] : [[-1, -40, -0.15], [11, -35, 0.2]];
    for (let i = 0; i < hd.length; i++) {
      const bobx = sin(t * 2.1 + i * 2) * 1.3, boby = sin(t * 2.6 + i * 1.7) * 1.1;
      const hx = hd[i][0] + bobx, hy = hd[i][1] + boby;
      const bx0 = 2 + i * 3, by0 = -19;
      c.beginPath(); c.moveTo(bx0 - 3, by0); c.quadraticCurveTo(hx - 5, (by0 + hy) / 2 + 2, hx - 2, hy + 4); c.lineTo(hx + 2.4, hy + 4); c.quadraticCurveTo(hx + 4, (by0 + hy) / 2, bx0 + 4, by0);
      fs(c, body, 1.1, 0.55);
      // head
      c.save(); c.translate(hx, hy); c.rotate(hd[i][2] + sin(t * 1.7 + i * 2.4) * 0.12);
      ell(c, 0, 0, 5.8, 5.2); fs(c, body, 1.2, 0.6);
      c.beginPath(); c.moveTo(-3, -3.4); c.quadraticCurveTo(0, -5.2, 3, -3.6); c.strokeStyle = sheen; c.lineWidth = 1.1; c.stroke();
      // beak
      c.beginPath(); c.moveTo(4.2, -1.8); c.quadraticCurveTo(10.8, -0.8, 12.2, 1.6); c.quadraticCurveTo(8, 1.2, 4.4, 1); c.closePath(); fs(c, '#6a5a4a', 0.9, 0.55);
      c.beginPath(); c.moveTo(4.4, 1); c.quadraticCurveTo(8, 1.6, 10, 2.8); c.quadraticCurveTo(7, 3.6, 4, 2.6); c.closePath(); fs(c, '#574a3d', 0.8, 0.5);
      // eye
      ell(c, 1.2, -1.2, 1.9, 2.0); c.fillStyle = P.amberLight; c.fill(); c.strokeStyle = ink(0.5); c.lineWidth = 0.6; c.stroke();
      c.beginPath(); c.arc(1.5, -1.1, 0.85, 0, TAU); c.fillStyle = '#1b1420'; c.fill();
      c.beginPath(); c.arc(0.9, -1.9, 0.45, 0, TAU); c.fillStyle = '#fff'; c.fill();
      c.restore();
    }
    // front wing
    c.save(); c.translate(2, -16); c.rotate(flap ? 0.9 + wa * 1.0 : 0.1);
    c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-4, -9, -17, -14, -26, -9); c.bezierCurveTo(-22, -5, -25, -1, -19, 3); c.bezierCurveTo(-18, 6, -10, 7, 0, 6); c.closePath(); fs(c, body, 1.2, 0.6);
    c.beginPath(); c.moveTo(-3, -4); c.quadraticCurveTo(-12, -9, -21, -7); c.strokeStyle = sheen; c.lineWidth = 1.2; c.stroke();
    c.strokeStyle = 'rgba(10,8,18,0.5)'; c.lineWidth = 0.8; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-8 - i * 4, 1 - i); c.lineTo(-17 - i * 2, 2.6 - i * 0.6); c.stroke(); }
    c.restore();
    c.restore();
  }

  // ---------------------------------------------------------------- light
  let lightCv = null, lightCx = null;
  function drawLight(c, sx, sy, t, strength) {
    strength = strength == null ? 1 : strength;
    if (strength <= 0) return;
    if (!lightCv) { lightCv = document.createElement('canvas'); lightCv.width = VW; lightCv.height = VH; lightCx = lightCv.getContext('2d'); }
    const l = lightCx;
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, VW, VH);
    l.fillStyle = 'rgba(12,8,22,' + (0.94 * strength).toFixed(3) + ')';
    l.fillRect(0, 0, VW, VH);
    const fl = 1 + 0.03 * sin(t * 9) + 0.02 * sin(t * 17.3) + 0.012 * sin(t * 29);
    const r = 205 * fl;
    l.globalCompositeOperation = 'destination-out';
    const g = l.createRadialGradient(sx, sy, 4, sx, sy, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.35, 'rgba(0,0,0,0.9)'); g.addColorStop(0.65, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    l.fillStyle = g; l.fillRect(sx - r, sy - r, r * 2, r * 2);
    l.globalCompositeOperation = 'source-over';
    c.drawImage(lightCv, 0, 0);
    c.save(); c.globalCompositeOperation = 'lighter';
    glow(c, sx, sy, r * 0.85, 0.16 * strength + 0.02, 'amber');
    c.restore();
  }

  // ---------------------------------------------------------------- speech bubble
  const wrapCache = new Map();
  function wrapText(c, text, maxW) {
    const key = text + '|' + maxW;
    let r = wrapCache.get(key); if (r) return r;
    const words = String(text).split(/\s+/); const lines = []; let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (c.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    let mw = 0; for (const ln of lines) mw = max(mw, c.measureText(ln).width);
    r = { lines, w: mw };
    if (wrapCache.size > 80) wrapCache.clear();
    wrapCache.set(key, r); return r;
  }
  function drawBubble(c, x, y, text, o) {
    o = o || {};
    const who = o.who || 'ivy';
    c.save();
    c.font = '15px ' + FONT;
    const wr = wrapText(c, text, 260), lines = wr.lines;
    const lh = 19, px = 12, py = 9;
    const w = max(34, Math.ceil(wr.w) + px * 2), h = lines.length * lh + py * 2;
    const bx = Math.round(x - w / 2), by = Math.round(y - 24 - h);
    let fill = '#efe6d0', stroke = 'rgba(20,16,24,0.7)', tcol = ink(0.92);
    if (who === 'npc') fill = '#dde2ee';
    const ghost = who === 'ghost';
    if (ghost) { fill = 'rgba(226,238,255,0.9)'; stroke = 'rgba(150,175,220,0.85)'; tcol = '#33406a'; }
    const gt = G.time || 0;
    const wob = (i) => ghost ? sin(gt * 3 + i * 1.3) * 1.5 : 0;
    // body path
    const r = 12;
    const tipx = x, tipy = y - 3;
    const tx0 = clamp(x - 6, bx + r, bx + w - r - 12);
    c.beginPath();
    c.moveTo(bx + r, by + wob(0));
    c.quadraticCurveTo(bx + w / 2, by - 1 + wob(1), bx + w - r, by + wob(2));
    c.quadraticCurveTo(bx + w + wob(3), by, bx + w + wob(3), by + r);
    c.lineTo(bx + w + wob(4), by + h - r);
    c.quadraticCurveTo(bx + w, by + h, bx + w - r, by + h + wob(5));
    c.lineTo(tx0 + 12, by + h);
    c.quadraticCurveTo(tx0 + 8, by + h + 8, tipx, tipy);
    c.quadraticCurveTo(tx0 + 2, by + h + 6, tx0, by + h);
    c.lineTo(bx + r, by + h + wob(6));
    c.quadraticCurveTo(bx, by + h, bx + wob(7), by + h - r);
    c.lineTo(bx + wob(8), by + r);
    c.quadraticCurveTo(bx, by, bx + r, by + wob(0));
    c.closePath();
    c.fillStyle = 'rgba(10,6,16,0.25)'; c.save(); c.translate(1.5, 2.5); c.fill(); c.restore();
    c.fillStyle = fill; c.fill();
    c.strokeStyle = stroke; c.lineWidth = 1.5; c.lineJoin = 'round'; c.stroke();
    if (!ghost) { // inner hairline for the storybook feel
      c.save(); c.globalAlpha = 0.18; c.strokeStyle = P.bordeaux; c.lineWidth = 1; rr(c, bx + 3, by + 3, w - 6, h - 6, r - 3); c.stroke(); c.restore();
    }
    c.fillStyle = tcol; c.textAlign = 'left'; c.textBaseline = 'middle';
    for (let i = 0; i < lines.length; i++) c.fillText(lines[i], bx + px, by + py + lh * (i + 0.5) + 0.5 + (ghost ? sin(gt * 3 + i) * 0.8 : 0));
    c.restore();
  }

  // ---------------------------------------------------------------- title card
  function drawCard(c, title, subtitle, alpha) {
    alpha = alpha == null ? 1 : alpha;
    if (alpha <= 0) return;
    c.save();
    c.globalAlpha = clamp(alpha, 0, 1);
    c.fillStyle = 'rgba(20,15,28,0.93)'; c.fillRect(0, 0, VW, VH);
    // vignette
    const g = c.createRadialGradient(VW / 2, VH / 2, 120, VW / 2, VH / 2, 560); g.addColorStop(0, 'rgba(60,40,70,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    const cx = VW / 2, cy = VH / 2;
    // border frame with corner curls
    c.strokeStyle = 'rgba(201,207,224,0.35)'; c.lineWidth = 1.4; rr(c, 34, 34, VW - 68, VH - 68, 10); c.stroke();
    c.strokeStyle = 'rgba(142,66,86,0.5)'; c.lineWidth = 1; rr(c, 42, 42, VW - 84, VH - 84, 8); c.stroke();
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      c.save(); c.translate(sx > 0 ? 42 : VW - 42, sy > 0 ? 42 : VH - 42); c.scale(sx, sy);
      c.beginPath(); c.moveTo(6, 30); c.bezierCurveTo(6, 12, 12, 6, 30, 6); c.moveTo(14, 14); c.bezierCurveTo(14, 24, 24, 24, 24, 16); c.strokeStyle = 'rgba(243,200,115,0.55)'; c.lineWidth = 1.4; c.stroke(); c.restore();
    }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'italic 46px ' + FONT; c.lineJoin = 'round';
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillText(title, cx + 2, cy - 22 + 3);
    c.fillStyle = P.cream; c.fillText(title, cx, cy - 22);
    // ornamental line
    const ly = cy + 22, w = min(360, 80 + String(title).length * 18);
    c.strokeStyle = P.amberLight; c.lineWidth = 1.3; c.globalAlpha *= 0.85;
    c.beginPath(); c.moveTo(cx - w, ly); c.bezierCurveTo(cx - w * 0.6, ly - 6, cx - w * 0.35, ly + 6, cx - 16, ly); c.stroke();
    c.beginPath(); c.moveTo(cx + w, ly); c.bezierCurveTo(cx + w * 0.6, ly - 6, cx + w * 0.35, ly + 6, cx + 16, ly); c.stroke();
    c.beginPath(); c.moveTo(cx - w, ly); c.bezierCurveTo(cx - w - 14, ly - 8, cx - w - 22, ly + 8, cx - w - 8, ly + 6); c.stroke();
    c.beginPath(); c.moveTo(cx + w, ly); c.bezierCurveTo(cx + w + 14, ly - 8, cx + w + 22, ly + 8, cx + w + 8, ly + 6); c.stroke();
    c.beginPath(); c.moveTo(cx, ly - 7); c.lineTo(cx + 6, ly); c.lineTo(cx, ly + 7); c.lineTo(cx - 6, ly); c.closePath(); c.fillStyle = P.bordeauxLight; c.fill(); c.stroke();
    c.globalAlpha /= 0.85;
    if (subtitle) { c.font = '19px ' + FONT; c.fillStyle = P.moonDim; c.fillText(subtitle, cx, ly + 38); }
    c.restore();
  }

  // ---------------------------------------------------------------- ghosts (gossipy aunt ghost)
  // x,y = bottom-centre of the tail tip (floating); o: {facing, state:'patrol'|'look'|'notice'|'point', t, alert 0..1}
  function drawGhost(c, x, y, o) {
    o = o || {};
    const f = o.facing < 0 ? -1 : 1, t = o.t || 0, st = o.state || 'patrol';
    const alert = o.alert || 0;
    const point = st === 'point';
    c.save();
    c.translate(x, y); c.scale(f, 1);
    const sway = sin(t * 2.2) * 1.5;
    // soft glow
    const gl = c.createRadialGradient(0, -28, 4, 0, -28, 46);
    gl.addColorStop(0, 'rgba(190,210,255,0.22)'); gl.addColorStop(1, 'rgba(190,210,255,0)');
    c.fillStyle = gl; c.fillRect(-48, -76, 96, 96);
    // body: dome head, flowing sides, wavy tail
    const wv = (i) => sin(t * 4 + i * 1.7) * 2.2;
    const body = () => {
      c.beginPath();
      c.moveTo(-17, -12);
      c.bezierCurveTo(-21, -34, -17, -54, 0 + sway * 0.3, -54);
      c.bezierCurveTo(17, -54, 21 + sway * 0.4, -34, 17, -12);
      c.bezierCurveTo(19, -6 + wv(0), 13, 2 + wv(1), 9, -3);
      c.bezierCurveTo(7, 3 + wv(2), 2, 3 + wv(3), 0, -3);
      c.bezierCurveTo(-2, 3 + wv(4), -7, 3 + wv(5), -9, -3);
      c.bezierCurveTo(-13, 2 + wv(6), -19, -6 + wv(7), -17, -12);
      c.closePath();
    };
    body();
    const g = c.createLinearGradient(0, -54, 0, 4);
    g.addColorStop(0, 'rgba(238,244,255,0.86)'); g.addColorStop(1, 'rgba(160,182,232,0.5)');
    c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(120,145,205,0.75)'; c.lineWidth = 1.3; c.lineJoin = 'round'; c.stroke();
    // arms (tiny stubs; one points forward when spotting)
    c.strokeStyle = 'rgba(120,145,205,0.75)'; c.fillStyle = 'rgba(232,240,255,0.9)'; c.lineWidth = 1.2;
    c.beginPath(); c.ellipse(-15, -22 + sin(t * 2.6) * 1, 4, 6, 0.5, 0, TAU); c.fill(); c.stroke();
    if (point) {
      const wag = sin(t * 14) * 1.5;
      c.beginPath(); c.moveTo(12, -24); c.quadraticCurveTo(24, -28 + wag, 34, -29 + wag);
      c.lineWidth = 6; c.lineCap = 'round'; c.strokeStyle = 'rgba(232,240,255,0.92)'; c.stroke();
      c.lineWidth = 1.1; c.strokeStyle = 'rgba(120,145,205,0.8)';
      c.beginPath(); c.arc(35, -29 + wag, 3.4, 0, TAU); c.fillStyle = 'rgba(238,244,255,0.95)'; c.fill(); c.stroke();
    } else {
      c.beginPath(); c.ellipse(13, -21 + sin(t * 2.6 + 1) * 1, 4, 6, -0.5, 0, TAU); c.fill(); c.stroke();
    }
    // lace collar
    c.fillStyle = 'rgba(250,246,238,0.95)'; c.strokeStyle = 'rgba(150,140,170,0.8)'; c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const cx = -15 + i * 6, r = 3.4;
      c.moveTo(cx + r, -18); c.arc(cx, -18, r, 0, PI);
    }
    c.fill(); c.stroke();
    c.beginPath(); c.ellipse(0, -19, 15, 3, 0, 0, TAU); c.fillStyle = 'rgba(250,246,238,0.95)'; c.fill();
    // bonnet with ruffle and bow
    c.fillStyle = 'rgba(238,226,240,0.97)'; c.strokeStyle = 'rgba(140,110,150,0.8)'; c.lineWidth = 1.1;
    c.beginPath(); c.ellipse(-2, -52, 13, 6, -0.1, PI, TAU); c.closePath(); c.fill(); c.stroke();
    c.beginPath();
    for (let i = 0; i < 5; i++) { const bx = -13 + i * 5.5; c.moveTo(bx + 3, -51); c.arc(bx, -51, 3, 0, PI); }
    c.fill(); c.stroke();
    c.fillStyle = P.bordeauxLight;
    c.beginPath(); c.moveTo(-2, -57); c.lineTo(-8, -61); c.lineTo(-8, -53); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-2, -57); c.lineTo(4, -61); c.lineTo(4, -53); c.closePath(); c.fill();
    c.beginPath(); c.arc(-2, -57, 2, 0, TAU); c.fill();
    // face: big curious round eyes
    const ex = [2, 12], ey = -37;
    const look = st === 'look' ? sin(t * 5) * 1.5 : 0;
    for (let i = 0; i < 2; i++) {
      c.beginPath(); c.arc(ex[i], ey, 5.4, 0, TAU); c.fillStyle = '#fff'; c.fill();
      c.strokeStyle = 'rgba(60,70,110,0.7)'; c.lineWidth = 1; c.stroke();
      c.beginPath(); c.arc(ex[i] + 1.8 + look * 0.5, ey + 0.4, 2.6 + alert * 0.8, 0, TAU); c.fillStyle = '#1c2240'; c.fill();
      c.beginPath(); c.arc(ex[i] + 2.6 + look * 0.5, ey - 0.8, 0.9, 0, TAU); c.fillStyle = '#fff'; c.fill();
    }
    // cheeks
    c.fillStyle = 'rgba(245,160,180,0.4)';
    ell(c, -4, -29, 3.4, 2.2); c.fill(); ell(c, 14, -29, 3.4, 2.2); c.fill();
    // mouth
    c.strokeStyle = 'rgba(60,50,90,0.8)'; c.lineWidth = 1.3; c.lineCap = 'round';
    if (point || st === 'notice' && alert > 0.7) {
      ell(c, 7, -27, 3, 3.8); c.fillStyle = '#4a2a4e'; c.fill(); c.stroke();
    } else {
      c.beginPath(); c.arc(7, -29.5, 3.2, 0.2, PI - 0.2); c.stroke();
    }
    c.restore();
    // '?' / '!' bubble (not mirrored)
    if (st === 'notice' || point) {
      const bang = point || alert > 0.55;
      const by = y - 74 - (point ? sin(t * 12) * 1.5 : 0);
      c.save();
      c.translate(x, by);
      const sc = bang ? 1 + (point ? 0.12 : 0) : 0.95;
      c.scale(sc, sc);
      c.beginPath(); c.arc(0, 0, 11, 0, TAU);
      c.fillStyle = bang ? 'rgba(255,236,160,0.97)' : 'rgba(240,244,255,0.95)'; c.fill();
      c.strokeStyle = bang ? 'rgba(190,60,70,0.9)' : 'rgba(120,145,205,0.9)'; c.lineWidth = 1.6; c.stroke();
      c.font = 'bold 16px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = bang ? '#a3203a' : '#33406a';
      c.fillText(bang ? '!' : '?', 0, 1);
      c.restore();
    }
  }

  // faint light cone so players can read the vision area. x,y = ghost eye; length px.
  function drawGhostCone(c, x, y, o) {
    o = o || {};
    const f = o.facing < 0 ? -1 : 1, L = o.length == null ? 6 * TILE : o.length, t = o.t || 0;
    const alert = o.alert || 0;
    const h0 = 0.6 * TILE, h1 = 1.6 * TILE;
    const full = o.full || L, hAt = h0 + (h1 - h0) * (L / full);
    if (L < 8) return;
    c.save();
    c.translate(x, y); c.scale(f, 1);
    const a = 0.085 + alert * 0.1 + sin(t * 2) * 0.012;
    const g = c.createLinearGradient(0, 0, L, 0);
    const col = alert > 0.5 ? '255,226,190' : '200,220,255';
    g.addColorStop(0, 'rgba(' + col + ',' + a + ')'); g.addColorStop(1, 'rgba(' + col + ',0)');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(0, -h0); c.lineTo(L, -hAt); c.lineTo(L, hAt); c.lineTo(0, h0); c.closePath(); c.fill();
    c.restore();
  }

  // ================================================================ M2: THE CRYPT
  const BONE = '#e8e1cd', BONE_D = '#c9c0a8', BONE_SH = '#8f8a78';
  const STONE_C = '#3b4350';

  // cartoon skull centred at (x,y), radius r (cranium), facing +x when look>0
  function skull(c, x, y, r, o) {
    o = o || {};
    c.save(); c.translate(x, y); if (o.rot) c.rotate(o.rot);
    const lk = (o.look || 0) * r * 0.14;
    c.beginPath(); c.moveTo(-r * 0.85, r * 0.35);
    c.bezierCurveTo(-r * 1.2, -r * 0.5, -r * 0.55, -r * 1.12, 0, -r * 1.1);
    c.bezierCurveTo(r * 0.55, -r * 1.12, r * 1.2, -r * 0.5, r * 0.85, r * 0.35);
    c.quadraticCurveTo(r * 0.72, r * 0.8, r * 0.44, r * 0.86);
    c.lineTo(-r * 0.44, r * 0.86); c.quadraticCurveTo(-r * 0.72, r * 0.8, -r * 0.85, r * 0.35); c.closePath();
    fs(c, o.col || BONE, max(0.9, r * 0.1), 0.65);
    c.save(); c.clip();
    c.fillStyle = 'rgba(70,60,50,0.18)'; ell(c, r * 0.5, r * 0.5, r * 0.9, r * 0.8); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)'; ell(c, -r * 0.35, -r * 0.6, r * 0.4, r * 0.2, -0.5); c.fill();
    c.restore();
    for (const sx of [-1, 1]) { // big eye holes
      const ex = sx * r * 0.42 + lk;
      ell(c, ex, -r * 0.02, r * 0.3, r * 0.36, sx * 0.12); c.fillStyle = '#150f1c'; c.fill();
      ell(c, ex + lk * 0.6 - r * 0.07, -r * 0.12, r * 0.09, r * 0.09); c.fillStyle = 'rgba(255,240,200,0.7)'; c.fill();
    }
    c.beginPath(); c.moveTo(lk * 0.8, r * 0.3); c.lineTo(lk * 0.8 - r * 0.11, r * 0.5); c.lineTo(lk * 0.8 + r * 0.11, r * 0.5); c.closePath(); c.fillStyle = '#150f1c'; c.fill();
    // teeth
    const ty = r * 0.62, th = r * 0.24, tw = r * 0.76;
    rr(c, lk * 0.5 - tw / 2, ty, tw, th, r * 0.08); c.fillStyle = BONE_D; c.fill(); c.strokeStyle = ink(0.55); c.lineWidth = max(0.7, r * 0.07); c.stroke();
    c.beginPath(); for (let i = 1; i < 4; i++) { const tx = lk * 0.5 - tw / 2 + tw * i / 4; c.moveTo(tx, ty); c.lineTo(tx, ty + th); } c.stroke();
    c.restore();
  }
  function bone(c, x1, y1, x2, y2, w) { // long bone with two knobs on each end
    limb(c, x1, y1, x2, y2, w, BONE, null);
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L * w * 0.55, ny = dx / L * w * 0.55;
    for (const [px, py] of [[x1, y1], [x2, y2]]) for (const s of [-1, 1]) { ell(c, px + nx * s, py + ny * s, w * 0.62, w * 0.62); fs(c, BONE, 0.9, 0.55); }
  }
  function cobwebCorner(c, x, y, sx, sy, r, a) { // web fan in a corner; (sx,sy) = direction into the room
    c.save(); c.translate(x, y); c.scale(sx, sy);
    c.strokeStyle = 'rgba(215,225,240,' + a + ')'; c.lineWidth = 0.9; c.lineCap = 'round';
    const n = 5;
    for (let i = 0; i <= n; i++) { const an = i / n * PI / 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(cos(an) * r, sin(an) * r); c.stroke(); }
    for (let k = 1; k <= 4; k++) {
      const rr2 = r * k / 4; c.beginPath();
      for (let i = 0; i <= n; i++) { const an = i / n * PI / 2, an2 = (i - 0.5) / n * PI / 2, rm = rr2 * 0.86;
        if (i === 0) c.moveTo(cos(an) * rr2, sin(an) * rr2); else c.quadraticCurveTo(cos(an2) * rm, sin(an2) * rm, cos(an) * rr2, sin(an) * rr2); }
      c.stroke();
    }
    c.restore();
  }

  // ---- crypt tiles
  THEMES.crypt = { stone: ['#3b4350', '#434b59', '#363d4a'], mortar: '#10141c', hi: '#7a8ca0', accent: '#4d6b4a' };
  function mossTop(c, v) {
    for (let i = 0; i < 5; i++) { const mx = 2 + hh(v, 20 + i) * 32; c.beginPath(); c.ellipse(mx, 1.4, 3 + hh(v, 30 + i) * 4, 2, 0, 0, TAU); c.fillStyle = i % 2 ? '#4a6a47' : '#5b7b50'; c.fill(); }
    for (let i = 0; i < 3; i++) { const mx = 5 + hh(v, 40 + i) * 26; c.beginPath(); c.ellipse(mx, 4.5, 1.2, 2.2 + hh(v, 50 + i) * 2, 0, 0, TAU); c.fillStyle = '#4a6a47'; c.fill(); }
    c.strokeStyle = 'rgba(160,210,140,0.35)'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(4, 0.4); c.quadraticCurveTo(14, -0.4, 26, 0.6); c.stroke();
  }
  function cryptStoneSprite(v, top) {
    const key = 'cs' + v + (top ? 't' : '');
    if (tileCache[key]) return tileCache[key];
    const base = stoneSprite('crypt', v, false);
    const [s, c] = mk(TILE, TILE);
    c.drawImage(base, 0, 0, TILE, TILE);
    // cold tint + a rough chip
    c.fillStyle = 'rgba(70,130,150,0.07)'; c.fillRect(0, 0, TILE, TILE);
    if (hh(v, 12) > 0.45) { // moss patch low on the side
      const mx = hh(v, 13) > 0.5 ? 3 : TILE - 3, my = 22 + hh(v, 14) * 8;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(mx + (i - 1) * 0.6, my + i * 2.5, 3.2, 2.2, 0, 0, TAU); c.fillStyle = i % 2 ? '#3f5c3f' : '#4a6a47'; c.fill(); }
    }
    if (top) { mossTop(c, v); c.strokeStyle = 'rgba(150,175,200,0.28)'; c.lineWidth = 1; c.beginPath(); c.moveTo(1, 3.2); c.lineTo(TILE - 1, 3.2); c.stroke(); }
    tileCache[key] = s; return s;
  }
  function cryptWoodSprite(v, creaky, top) {
    const key = 'cw' + (creaky ? 'c' : 'w') + v + (top ? 't' : '');
    if (tileCache[key]) return tileCache[key];
    const base = woodSprite(v, creaky, top);
    const [s, c] = mk(TILE, TILE);
    c.drawImage(base, 0, 0, TILE, TILE);
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = 'rgba(40,60,80,0.30)'; c.fillRect(0, 0, TILE, TILE);
    c.globalCompositeOperation = 'source-over';
    // pale weathered streaks and a bit of moss
    c.strokeStyle = 'rgba(190,200,210,0.16)'; c.lineWidth = 0.8;
    for (let i = 0; i < 2; i++) { const yy = 13 + i * 8 + hh(v, i + 60) * 3; c.beginPath(); c.moveTo(3, yy); c.quadraticCurveTo(14, yy + 1.2, 18 + hh(v, i + 70) * 14, yy - 0.4); c.stroke(); }
    if (top) for (let i = 0; i < 2; i++) { const mx = 4 + hh(v, 80 + i) * 28; c.beginPath(); c.ellipse(mx, 3.4, 2.6, 1.3, 0, 0, TAU); c.fillStyle = '#4a6a47'; c.fill(); }
    tileCache[key] = s; return s;
  }
  function cryptLedgeSprite() {
    if (tileCache.cledge) return tileCache.cledge;
    const [s, c] = mk(TILE, TILE);
    for (const bx of [3, 26]) { c.beginPath(); c.moveTo(bx, 8); c.lineTo(bx + 7, 8); c.quadraticCurveTo(bx + 6, 15, bx + 3, 19); c.lineTo(bx + 1, 19); c.quadraticCurveTo(bx, 14, bx, 8); c.closePath(); fs(c, '#2f3642', 1, 0.55); }
    rr(c, 0, 1.2, TILE, 7.6, 2.6); fs(c, '#4b5565', 1.2, 0.6);
    c.beginPath(); c.moveTo(2, 3.4); c.lineTo(TILE - 2, 3.4); c.strokeStyle = 'rgba(190,210,230,0.3)'; c.lineWidth = 1; c.stroke();
    c.beginPath(); c.moveTo(12, 1.5); c.lineTo(12.6, 8.6); c.moveTo(25, 1.5); c.lineTo(24.4, 8.6); c.strokeStyle = 'rgba(10,6,16,0.4)'; c.lineWidth = 0.9; c.stroke();
    for (const mx of [6, 19, 30]) { c.beginPath(); c.ellipse(mx, 1.4, 3, 1.6, 0, 0, TAU); c.fillStyle = '#4a6a47'; c.fill(); }
    tileCache.cledge = s; return s;
  }
  function cryptLadderSprite(v) {
    const key = 'clad' + (v % 2);
    if (tileCache[key]) return tileCache[key];
    const [s, c] = mk(TILE, TILE);
    for (const rx of [8, 28]) { // twisted ropes
      c.strokeStyle = ink(0.55); c.lineWidth = 4.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(rx, -1); c.lineTo(rx, TILE + 1); c.stroke();
      c.strokeStyle = '#a58a62'; c.lineWidth = 3.4; c.beginPath(); c.moveTo(rx, -1); c.lineTo(rx, TILE + 1); c.stroke();
      c.strokeStyle = 'rgba(70,50,30,0.55)'; c.lineWidth = 0.9;
      for (let y = -2; y < TILE + 2; y += 4.5) { c.beginPath(); c.moveTo(rx - 1.7, y); c.lineTo(rx + 1.7, y + 2.6); c.stroke(); }
    }
    for (let i = 0; i < 4; i++) { const yy = 4 + i * 9; rr(c, 5, yy - 1.8, 26, 3.8, 1.8); fs(c, '#6b4c3a', 1, 0.55); c.beginPath(); c.moveTo(7, yy - 0.6); c.lineTo(29, yy - 0.6); c.strokeStyle = 'rgba(255,225,200,0.18)'; c.lineWidth = 0.8; c.stroke();
      for (const rx of [8, 28]) { ell(c, rx, yy, 2.5, 2.5); fs(c, '#8a7048', 0.8, 0.5); } }
    tileCache[key] = s; return s;
  }

  // ---- crypt background (tile 480 wide, seamless): vaults, pillars, niches, chains, webs, cold tint
  function pointedArch(c, x0, x1, yb, yt) { // from (x0,yb) up to apex and down to (x1,yb)
    const m = (x0 + x1) / 2;
    c.beginPath(); c.moveTo(x0, yb);
    c.bezierCurveTo(x0, yb - (yb - yt) * 0.55, m - (x1 - x0) * 0.28, yt + (yb - yt) * 0.12, m, yt);
    c.bezierCurveTo(m + (x1 - x0) * 0.28, yt + (yb - yt) * 0.12, x1, yb - (yb - yt) * 0.55, x1, yb);
  }
  function buildCryptBG() {
    const s = document.createElement('canvas'); s.width = BGW; s.height = BGH;
    const c = s.getContext('2d');
    const gr = c.createLinearGradient(0, 0, 0, BGH); gr.addColorStop(0, '#0b1016'); gr.addColorStop(0.5, '#16202a'); gr.addColorStop(1, '#0f171d');
    c.fillStyle = gr; c.fillRect(0, 0, BGW, BGH);
    // old brickwork courses
    for (let r = 0; r < 20; r++) {
      const by = r * 30, off = (r % 2) * 30;
      for (let q = -1; q < 9; q++) {
        const bx = q * 60 + off, sd = r * 31 + ((q + 8) % 8);
        const a = hh(sd, 3);
        c.fillStyle = 'rgba(130,165,185,' + (0.012 + a * 0.04) + ')'; c.fillRect(bx + 1, by + 1, 58, 28);
        c.strokeStyle = 'rgba(2,4,8,0.38)'; c.lineWidth = 1.2; c.strokeRect(bx + 0.5, by + 0.5, 60, 30);
        if (a > 0.82) { c.beginPath(); c.moveTo(bx + 14, by + 8); c.lineTo(bx + 19, by + 15); c.lineTo(bx + 16, by + 22); c.strokeStyle = 'rgba(2,4,8,0.35)'; c.lineWidth = 0.8; c.stroke(); }
        if (a < 0.1) { ell(c, bx + 30, by + 26, 14, 4); c.fillStyle = 'rgba(70,110,80,0.10)'; c.fill(); }
      }
    }
    // vault arches between pillars (period 240)
    for (let i = 0; i < 2; i++) {
      const x0 = i * 240 + 15, x1 = i * 240 + 225;
      pointedArch(c, x0, x1, 175, 30); c.closePath(); c.fillStyle = 'rgba(3,6,10,0.42)'; c.fill();
      pointedArch(c, x0, x1, 175, 30); c.strokeStyle = ink(0.7); c.lineWidth = 17; c.lineCap = 'butt'; c.stroke();
      pointedArch(c, x0, x1, 175, 30); c.strokeStyle = '#28323d'; c.lineWidth = 14; c.stroke();
      pointedArch(c, x0, x1, 175, 30); c.strokeStyle = 'rgba(150,185,205,0.17)'; c.lineWidth = 1.6; c.translate(0, -5); c.stroke(); c.translate(0, 5);
      // voussoir ticks
      c.strokeStyle = 'rgba(2,4,8,0.5)'; c.lineWidth = 1;
      for (let k = 1; k < 8; k++) { const u = k / 8, m = (x0 + x1) / 2; const ax = u < 0.5 ? x0 + (m - x0) * (u * 2) : m + (x1 - m) * ((u - 0.5) * 2); const ay = 175 - (175 - 30) * (1 - Math.pow(abs(u - 0.5) * 2, 1.6)); c.beginPath(); c.moveTo(ax - 6 * Math.sign(u - 0.5 || 1) * 0.0, ay - 7); c.lineTo(ax, ay + 7); c.stroke(); }
      // keystone
      c.beginPath(); c.moveTo(i * 240 + 112, 22); c.lineTo(i * 240 + 128, 22); c.lineTo(i * 240 + 125, 44); c.lineTo(i * 240 + 115, 44); c.closePath(); fs(c, '#3a4553', 1, 0.6);
    }
    // pillars at x = 0, 240, 480 (half-clipped at the seam)
    for (const px of [0, 240, 480]) {
      const pg = c.createLinearGradient(px - 15, 0, px + 15, 0); pg.addColorStop(0, '#1d2630'); pg.addColorStop(0.35, '#33404c'); pg.addColorStop(1, '#161e27');
      c.fillStyle = pg; c.fillRect(px - 15, 0, 30, BGH);
      c.strokeStyle = ink(0.6); c.lineWidth = 1.4; c.beginPath(); c.moveTo(px - 15, 0); c.lineTo(px - 15, BGH); c.moveTo(px + 15, 0); c.lineTo(px + 15, BGH); c.stroke();
      for (let y = 220; y < BGH; y += 46) { c.beginPath(); c.moveTo(px - 15, y); c.lineTo(px + 15, y + (hh(px, y) - 0.5) * 3); c.strokeStyle = 'rgba(2,4,8,0.4)'; c.lineWidth = 1; c.stroke(); }
      rr(c, px - 22, 168, 44, 14, 3); fs(c, '#3a4553', 1.2, 0.6); rr(c, px - 19, 182, 38, 8, 3); fs(c, '#2c3540', 1, 0.55);
      ell(c, px - 7, 330 + (px % 480) * 0, 5, 14); c.fillStyle = 'rgba(70,110,80,0.10)'; c.fill();
    }
    // niches with candles / skull
    for (const [nx, kind] of [[120, 'candle'], [360, 'skull']]) {
      archPath(c, nx - 24, 262, 48, 86); fs(c, '#2f3a46', 2.2, 0.65);
      archPath(c, nx - 19, 267, 38, 81); c.fillStyle = '#04070a'; c.fill();
      c.save(); archPath(c, nx - 19, 267, 38, 81); c.clip();
      glow(c, nx, 330, 50, 0.45, 'amber');
      rr(c, nx - 24, 340, 48, 10, 2); c.fillStyle = '#313c48'; c.fill();
      c.restore();
      archPath(c, nx - 19, 267, 38, 81); c.strokeStyle = ink(0.6); c.lineWidth = 1.2; c.stroke();
      if (kind === 'candle') {
        for (const [dx, h] of [[-7, 12], [3, 20], [11, 9]]) { rr(c, nx + dx - 2.5, 341 - h, 5, h, 1.2); fs(c, P.cream, 0.7, 0.45); flame(c, nx + dx, 341 - h, 1.1, 0.4 + dx, dx); }
      } else {
        skull(c, nx - 4, 332, 8.5, { rot: -0.1, look: 1 });
        rr(c, nx + 7, 331, 5, 10, 1.2); fs(c, P.cream, 0.7, 0.45); flame(c, nx + 9.5, 331, 1.1, 0.7, 2);
      }
      glow(c, nx, 316, 120, 0.12, 'amber');
    }
    // hanging chains
    for (const [cx, len] of [[70, 96], [186, 60], [300, 126], [430, 74]]) {
      for (let y = 0, i = 0; y < len; y += 7, i++) { const wide = i % 2; ell(c, cx, y + 4, wide ? 4 : 2.2, wide ? 2.2 : 4); c.strokeStyle = ink(0.6); c.lineWidth = 3; c.stroke(); c.strokeStyle = '#5c6a76'; c.lineWidth = 1.6; c.stroke(); }
      c.beginPath(); c.arc(cx, len + 7, 5, 0.3, PI - 0.3 + 0.1); c.strokeStyle = ink(0.6); c.lineWidth = 3.4; c.stroke(); c.strokeStyle = '#5c6a76'; c.lineWidth = 2; c.stroke();
    }
    // cobwebs in the top corners next to the pillars
    cobwebCorner(c, 15, 0, 1, 1, 60, 0.26); cobwebCorner(c, 465, 0, -1, 1, 60, 0.26); cobwebCorner(c, 225, 0, -1, 1, 44, 0.2); cobwebCorner(c, 255, 0, 1, 1, 44, 0.2);
    // cold green-blue tint + mist at the bottom
    c.fillStyle = 'rgba(40,100,110,0.09)'; c.fillRect(0, 0, BGW, BGH);
    const mg = c.createLinearGradient(0, 380, 0, BGH); mg.addColorStop(0, 'rgba(70,130,140,0)'); mg.addColorStop(1, 'rgba(70,130,140,0.10)'); c.fillStyle = mg; c.fillRect(0, 380, BGW, BGH - 380);
    const cg = c.createLinearGradient(0, 0, 0, 90); cg.addColorStop(0, 'rgba(4,6,10,0.55)'); cg.addColorStop(1, 'rgba(4,6,10,0)'); c.fillStyle = cg; c.fillRect(0, 0, BGW, 90);
    const fg = c.createLinearGradient(0, BGH - 100, 0, BGH); fg.addColorStop(0, 'rgba(4,6,10,0)'); fg.addColorStop(1, 'rgba(4,6,10,0.5)'); c.fillStyle = fg; c.fillRect(0, BGH - 100, BGW, 100);
    return s;
  }

  // ---- crypt deco kinds (c already translated to x,y = bottom centre; 'chains' = top anchor)
  function cryptDeco(c, k, t) {
    switch (k) {
      case 'tomb': { // stone sarcophagus with a slightly shifted lid
        rr(c, -54, -4, 108, 6, 2.5); fs(c, '#2f3642', 1.1, 0.6);
        rr(c, -49, -30, 98, 27, 4); fs(c, '#465060', 1.3, 0.65);
        c.fillStyle = 'rgba(0,0,0,0.18)'; rr(c, -49, -10, 98, 7, 3); c.fill();
        // carved cross in a small panel + side lines
        rr(c, -14, -25, 28, 17, 5); fs(c, '#3d4756', 1, 0.5);
        c.beginPath(); c.moveTo(0, -23); c.lineTo(0, -10); c.moveTo(-5, -18); c.lineTo(5, -18); c.strokeStyle = 'rgba(190,205,225,0.55)'; c.lineWidth = 1.8; c.lineCap = 'round'; c.stroke();
        for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 24, -22); c.lineTo(sx * 40, -22); c.moveTo(sx * 24, -15); c.lineTo(sx * 40, -15); c.strokeStyle = 'rgba(10,6,16,0.35)'; c.lineWidth = 1.2; c.stroke(); }
        // dark gap (lid ajar on the right) and the lid
        c.beginPath(); c.moveTo(-28, -30); c.lineTo(52, -30); c.lineTo(52, -33); c.lineTo(-28, -33); c.closePath(); c.fillStyle = '#05080c'; c.fill();
        c.beginPath(); c.moveTo(-56, -33); c.lineTo(-52, -45); c.quadraticCurveTo(-4, -50, 40, -45); c.lineTo(46, -33); c.quadraticCurveTo(-4, -31, -56, -33); c.closePath(); fs(c, '#566176', 1.3, 0.65);
        c.beginPath(); c.moveTo(-48, -42); c.quadraticCurveTo(-4, -47, 36, -42); c.strokeStyle = 'rgba(200,220,240,0.3)'; c.lineWidth = 1.2; c.stroke();
        for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(-44 + i * 7, -44.4 + i * 0.4, 4, 1.8, 0, 0, TAU); c.fillStyle = i % 2 ? '#4a6a47' : '#5b7b50'; c.fill(); }
        cobwebCorner(c, 52, -30, -1, -1, 18, 0.35);
        break;
      }
      case 'coffin': { // upright, ajar, empty and dark
        const hex = (s) => { c.beginPath(); c.moveTo(-12 * s, -88); c.lineTo(12 * s, -88); c.lineTo(20 * s, -62); c.lineTo(14 * s, 0); c.lineTo(-14 * s, 0); c.lineTo(-20 * s, -62); c.closePath(); };
        hex(1); fs(c, '#04060a', 1.6, 0.7);
        // lid hinged on the right, swung open a little
        c.save(); c.translate(17, 0); c.scale(0.8, 1); c.translate(-17, 0);
        hex(1); fs(c, '#4a3a42', 1.6, 0.7);
        c.fillStyle = 'rgba(0,0,0,0.2)'; c.fill();
        hex(0.72); c.translate(0, 0); c.strokeStyle = 'rgba(210,190,170,0.22)'; c.lineWidth = 1.1; c.stroke();
        c.beginPath(); c.moveTo(0, -78); c.lineTo(0, -52); c.moveTo(-6, -70); c.lineTo(6, -70); c.strokeStyle = 'rgba(220,205,180,0.5)'; c.lineWidth = 2; c.lineCap = 'round'; c.stroke();
        for (const hy of [-58, -30]) { ell(c, 12, hy, 1.8, 1.8); fs(c, '#9a8a6a', 0.7, 0.5); }
        c.restore();
        rr(c, -18, -3, 36, 5, 2); fs(c, '#2f3642', 1, 0.55);
        cobwebCorner(c, -19, -62, 1, 1, 13, 0.3);
        break;
      }
      case 'skulls': { // small cheerful pile (one has a stub candle)
        const sp = [[-15, -8, 8, 0.15, 1], [0, -7, 8.4, -0.1, -1], [15, -8, 7.8, 0.2, 1], [-7, -20, 8, -0.2, 1], [8, -20, 8.2, 0.12, -1], [0, -32, 7.6, 0.05, 1]];
        for (const q of sp) skull(c, q[0], q[1], q[2], { rot: q[3], look: q[4] });
        rr(c, -2.5, -50, 5, 8, 1.2); fs(c, P.cream, 0.7, 0.45);
        c.beginPath(); c.moveTo(-2.5, -46); c.quadraticCurveTo(-4, -43, -3, -41); c.strokeStyle = 'rgba(239,230,208,0.7)'; c.lineWidth = 1.2; c.stroke();
        c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 0, -52, 36, 0.4, 'amber'); c.restore();
        flame(c, 0, -50, 1.3, t, 1);
        break;
      }
      case 'bones': {
        bone(c, -22, -3, 4, -9, 3.2); bone(c, -14, -10, 14, -3, 3.2);
        // rib
        c.beginPath(); c.moveTo(20, -2); c.quadraticCurveTo(30, -16, 42, -4); c.strokeStyle = ink(0.55); c.lineWidth = 4.6; c.lineCap = 'round'; c.stroke(); c.strokeStyle = BONE; c.lineWidth = 3; c.stroke();
        c.beginPath(); c.moveTo(24, -2); c.quadraticCurveTo(32, -11, 38, -3); c.strokeStyle = BONE_D; c.lineWidth = 2; c.stroke();
        for (const [vx, vy] of [[-30, -3], [-37, -2]]) { rr(c, vx - 3, vy - 3.4, 6, 5, 2); fs(c, BONE_D, 0.8, 0.5); }
        break;
      }
      case 'urn': {
        c.beginPath(); c.moveTo(-8, -37); c.bezierCurveTo(-8, -33, -17, -30, -16, -18); c.bezierCurveTo(-15, -8, -10, -4, -9, 0); c.lineTo(9, 0); c.bezierCurveTo(10, -4, 15, -8, 16, -18); c.bezierCurveTo(17, -30, 8, -33, 8, -37); c.closePath();
        fs(c, '#5b3445', 1.3, 0.65);
        c.save(); c.clip(); c.fillStyle = 'rgba(255,255,255,0.12)'; ell(c, -8, -20, 4, 12); c.fill(); c.fillStyle = 'rgba(0,0,0,0.22)'; ell(c, 12, -14, 7, 16); c.fill();
        c.beginPath(); c.moveTo(-17, -22); for (let i = 0; i < 8; i++) c.lineTo(-17 + (i + 1) * 4.4, -22 + (i % 2 ? -4 : 4)); c.strokeStyle = 'rgba(239,230,208,0.75)'; c.lineWidth = 1.6; c.stroke();
        c.restore();
        rr(c, -10, -41, 20, 6, 2.5); fs(c, '#6e4056', 1.1, 0.6);
        for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 14, -26); c.bezierCurveTo(sx * 25, -28, sx * 24, -12, sx * 14, -11); c.strokeStyle = ink(0.55); c.lineWidth = 4.2; c.lineCap = 'round'; c.stroke(); c.strokeStyle = '#5b3445'; c.lineWidth = 2.8; c.stroke(); }
        ell(c, 0, -29, 3.4, 3.4); fs(c, P.cream, 0.7, 0.45); ell(c, 0, -26.5, 1.2, 1.2); c.fillStyle = '#150f1c'; c.fill(); ell(c, 3.3, -26.5, 1.2, 1.2); c.fill(); ell(c, -3.3, -26.5, 1.2, 1.2); c.fill();
        cobwebCorner(c, 8, -37, -1, 1, 11, 0.35);
        break;
      }
      case 'archway': {
        const w = 64, h = 100;
        archPath(c, -w / 2 - 9, -h - 9, w + 18, h + 9); fs(c, '#3a4553', 2, 0.65);
        // voussoir lines
        c.strokeStyle = 'rgba(2,4,8,0.5)'; c.lineWidth = 1;
        for (let i = 0; i <= 8; i++) { const a = PI + i / 8 * PI, cxx = cos(a), cyy = sin(a); c.beginPath(); c.moveTo(cxx * (w / 2), -h + w / 2 + cyy * (w / 2)); c.lineTo(cxx * (w / 2 + 9), -h + w / 2 + cyy * (w / 2 + 9)); c.stroke(); }
        archPath(c, -w / 2, -h, w, h);
        const ig = c.createLinearGradient(0, -h, 0, 0); ig.addColorStop(0, '#04070a'); ig.addColorStop(1, '#0d171d'); c.fillStyle = ig; c.fill();
        c.save(); archPath(c, -w / 2, -h, w, h); c.clip();
        ell(c, 0, -26, 20, 14); c.fillStyle = 'rgba(80,140,160,0.10)'; c.fill();
        rr(c, -w / 2, -6, w, 8, 1); c.fillStyle = 'rgba(0,0,0,0.5)'; c.fill();
        c.restore();
        archPath(c, -w / 2, -h, w, h); c.strokeStyle = ink(0.6); c.lineWidth = 1.2; c.stroke();
        c.beginPath(); c.moveTo(-6, -h - 9); c.lineTo(6, -h - 9); c.lineTo(4, -h + 5); c.lineTo(-4, -h + 5); c.closePath(); fs(c, '#4b5565', 1, 0.6);
        rr(c, -w / 2 - 12, -5, w + 24, 6, 2); fs(c, '#2f3642', 1, 0.55);
        cobwebCorner(c, -w / 2, -h + w / 2 - 6, 1, 1, 20, 0.3);
        break;
      }
      case 'chains': { // hangs down from the ceiling anchor (0,0)
        const chain = (cx, len, hook) => {
          rr(c, cx - 6, -3, 12, 6, 2); fs(c, '#3a4553', 1, 0.6);
          let px = cx, py = 3;
          for (let i = 0, y = 3; y < len; y += 7, i++) {
            const u = y / len, sx = cx + sin(t * 1.1 + cx * 0.3) * 3.4 * u * u + sin(t * 2.3 + cx) * 0.8 * u;
            const wide = i % 2; ell(c, sx, y + 3.6, wide ? 3.8 : 2.1, wide ? 2.1 : 3.8); c.strokeStyle = ink(0.6); c.lineWidth = 3; c.stroke(); c.strokeStyle = '#6a7886'; c.lineWidth = 1.6; c.stroke();
            px = sx; py = y + 7;
          }
          if (hook) { // open iron cuff
            c.beginPath(); c.arc(px, py + 7, 6.5, -0.5, PI + 0.5, true); c.strokeStyle = ink(0.6); c.lineWidth = 4; c.lineCap = 'round'; c.stroke(); c.strokeStyle = '#6a7886'; c.lineWidth = 2.4; c.stroke();
          } else { c.beginPath(); c.arc(px, py + 3, 4, 0.4, PI - 0.4, false); c.strokeStyle = ink(0.6); c.lineWidth = 3.4; c.stroke(); c.strokeStyle = '#6a7886'; c.lineWidth = 2; c.stroke(); }
        };
        chain(-8, 96, true); chain(9, 62, false);
        break;
      }
      default: return false;
    }
    return true;
  }

  // ================================================================ skeleton
  // Friendly cartoon skeleton ~55px tall, x,y = feet centre. phase 0..1 = one waltz bar. facing +-1.
  // partner:true draws the mirrored second dancer (reaches toward the first one, caller places it ~26px away).
  function drawSkeleton(c, x, y, o) {
    o = o || {};
    const ph = o.phase || 0, t = o.t || 0, w = ph * TAU;
    let f = o.facing === -1 ? -1 : 1; if (o.partner) f = -f;
    const sw = sin(w), bob = -1.7 * (0.5 - 0.5 * cos(w * 2)), step = sin(w * 2);
    c.save(); c.translate(x, y);
    ell(c, 0, 0.5, 13, 3); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fill();
    c.translate(0, bob); c.scale(f, 1);
    const lx = sw * 3 * f, tilt = sw * 0.07 * f;
    // legs
    const hipx = lx, hipy = -23;
    const legs = [[-1, max(0, step)], [1, max(0, -step)]];
    for (const [s, lift] of legs) {
      const fx = s * 5 + lx * 0.35 + (lift > 0 ? 2.5 * lift : 0), fy = -lift * 4.5;
      limb(c, hipx + s * 3, hipy, fx, fy - 1.5, 2.8, BONE, (hipx + s * 3 + fx) / 2 + 2.5, -12 - lift * 2);
      ell(c, (hipx + s * 3 + fx) / 2 + 1.2, -12.5 - lift * 2, 2.1, 2.1); fs(c, BONE, 0.8, 0.5);
      ell(c, fx + 2, fy - 1.3, 4.2, 2.4); fs(c, BONE, 1, 0.6);
    }
    // body group (sways + tilts about the hip)
    c.save(); c.translate(lx, hipy); c.rotate(tilt);
    // back arm (waltz pose: elbow out, hand up)
    limb(c, -6, -18, -13.5, -16, 2.5, BONE, null); limb(c, -13.5, -16, -11, -26, 2.5, BONE, null); ell(c, -11, -27, 2.2, 2.2); fs(c, BONE, 0.8, 0.5);
    // pelvis + spine
    ell(c, 0, 0.5, 6.8, 3.6); fs(c, BONE, 1.1, 0.6);
    limb(c, 0, 0, 0, -14, 2.6, BONE, null);
    // ribcage
    c.beginPath(); c.moveTo(-7.4, -16); c.quadraticCurveTo(-8.6, -8, -4, -3); c.quadraticCurveTo(0, -1, 4, -3); c.quadraticCurveTo(8.6, -8, 7.4, -16); c.quadraticCurveTo(0, -20, -7.4, -16); c.closePath();
    c.fillStyle = '#231b2b'; c.fill(); c.strokeStyle = ink(0.5); c.lineWidth = 1; c.stroke();
    for (let i = 0; i < 3; i++) {
      const ry = -13.5 + i * 3.6, rw = 7 - i * 0.7;
      c.beginPath(); c.moveTo(-rw, ry - 1.5); c.quadraticCurveTo(0, ry + 3.5, rw, ry - 1.5); c.strokeStyle = ink(0.55); c.lineWidth = 3.2; c.lineCap = 'round'; c.stroke(); c.strokeStyle = BONE; c.lineWidth = 1.9; c.stroke();
    }
    limb(c, 0, -17, 0, -4, 2.2, BONE, null);
    limb(c, -7.5, -17.5, 7.5, -17.5, 2.3, BONE, null);
    // bow tie / bow
    const bx = 0, by = -19.5;
    c.beginPath(); c.moveTo(bx, by); c.lineTo(bx - 4.6, by - 2.6); c.lineTo(bx - 4.6, by + 2.6); c.closePath(); c.moveTo(bx, by); c.lineTo(bx + 4.6, by - 2.6); c.lineTo(bx + 4.6, by + 2.6); c.closePath(); fs(c, o.partner ? '#d4708a' : P.bordeauxLight, 0.8, 0.55);
    // front arm: reaches toward the partner, hand raised
    limb(c, 6.5, -18, 10.5, -10.5, 2.5, BONE, null); limb(c, 10.5, -10.5, 13 - lx * 0, -17.5, 2.5, BONE, null); ell(c, 13, -18, 2.3, 2.3); fs(c, BONE, 0.8, 0.5);
    // skull
    c.save(); c.translate(0, -24); c.rotate(-tilt * 0.6 + sw * 0.05 * f);
    skull(c, 0, -6.5, 8.6, { look: 1 });
    if (o.partner) { // little bow on the skull
      c.translate(-5.6, -13.4); c.rotate(-0.35);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(-5, -3); c.lineTo(-5, 3); c.closePath(); c.moveTo(0, 0); c.lineTo(5, -3); c.lineTo(5, 3); c.closePath(); fs(c, '#d4708a', 0.8, 0.55);
    }
    c.restore();
    c.restore();
    c.restore();
  }

  // ================================================================ rock
  function rockBlob(c, r, seed) {
    const n = 9, p = [];
    for (let i = 0; i < n; i++) { const a = i / n * TAU, rad = r * (0.84 + 0.22 * hh(seed, i)); p.push([cos(a) * rad, sin(a) * rad * 0.92]); }
    c.beginPath(); c.moveTo((p[n - 1][0] + p[0][0]) / 2, (p[n - 1][1] + p[0][1]) / 2);
    for (let i = 0; i < n; i++) { const q = p[(i + 1) % n]; c.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + q[0]) / 2, (p[i][1] + q[1]) / 2); }
    c.closePath();
  }
  function rockBody(c, r, seed) { // chunky rounded stone at the origin
    rockBlob(c, r, seed); fs(c, '#4e5767', 1.5, 0.7);
    c.save(); rockBlob(c, r, seed); c.clip();
    c.fillStyle = 'rgba(255,255,255,0.14)'; ell(c, -r * 0.3, -r * 0.45, r * 0.6, r * 0.3, -0.4); c.fill();
    c.fillStyle = 'rgba(8,6,16,0.28)'; ell(c, r * 0.4, r * 0.5, r * 0.8, r * 0.55, -0.4); c.fill();
    c.strokeStyle = 'rgba(10,6,16,0.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-r * 0.1, -r * 0.5); c.lineTo(r * 0.05, -r * 0.1); c.lineTo(-r * 0.25, r * 0.2); c.lineTo(-r * 0.2, r * 0.55); c.stroke();
    c.fillStyle = '#4a6a47'; ell(c, -r * 0.5, -r * 0.6, r * 0.3, r * 0.12, -0.5); c.fill();
    c.restore();
    rockBlob(c, r, seed); c.strokeStyle = ink(0.65); c.lineWidth = 1.5; c.stroke();
  }
  // drawRock: 'warn' => x,y = CEILING anchor (top centre; a stone bulges out of the ceiling, dust trickles).
  // 'fall' / 'rest' => x,y = the rock's CENTRE (caller computes the current centre y); rock radius ~15px, rests on floor at y+15.
  function drawRock(c, x, y, o) {
    o = o || {};
    const st = o.state || 'warn', t = o.t || 0, k = clamp(o.k || 0, 0, 1);
    c.save(); c.translate(x, y);
    if (st === 'warn') {
      const j = sin(t * 38) * 0.7;
      c.save(); c.translate(j, 0);
      c.beginPath(); c.moveTo(-14, -1); c.quadraticCurveTo(-13, 9, -2, 10.5); c.quadraticCurveTo(10, 11, 14, -1); c.closePath();
      fs(c, '#4e5767', 1.3, 0.65);
      c.fillStyle = 'rgba(255,255,255,0.14)'; ell(c, -4, 3, 5, 2, -0.3); c.fill();
      c.restore();
      c.strokeStyle = 'rgba(8,6,16,0.75)'; c.lineWidth = 1.3; c.lineCap = 'round'; c.lineJoin = 'round';
      for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 17, -1); c.lineTo(sx * 19.5, 4); c.lineTo(sx * 17.5, 7.5); c.lineTo(sx * 20, 12); c.stroke(); }
      c.beginPath(); c.moveTo(-2, 10.5); c.lineTo(0, 7); c.lineTo(-1.5, 4); c.stroke();
      for (let i = 0; i < 7; i++) { // trickling dust
        const u = (t * (0.9 + hh(i, 5) * 0.5) + hh(i, 6)) % 1, dx = (hh(i, 7) - 0.5) * 30;
        c.fillStyle = 'rgba(200,195,185,' + (0.85 * (1 - u)).toFixed(2) + ')'; c.beginPath(); c.arc(dx, 8 + u * 34, 0.9 + hh(i, 8) * 0.9, 0, TAU); c.fill();
      }
      c.fillStyle = 'rgba(190,185,175,0.18)'; ell(c, 0, 12, 12 + sin(t * 5) * 1.5, 3.4); c.fill();
    } else if (st === 'fall') {
      for (let i = 0; i < 4; i++) { const lx = (i - 1.5) * 8; c.strokeStyle = 'rgba(210,215,230,' + (0.22 - i * 0.02) + ')'; c.lineWidth = 1.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(lx, -20 - hh(i, 3) * 6); c.lineTo(lx, -44 - hh(i, 4) * 22); c.stroke(); }
      for (let i = 0; i < 3; i++) { c.fillStyle = '#5a6475'; c.beginPath(); c.arc((i - 1) * 13, -26 - i * 7 + (i % 2) * 5, 1.6, 0, TAU); c.fill(); }
      c.save(); c.rotate(k * 2.4 + 0.2 * sin(t * 11)); rockBody(c, 15, 3); c.restore();
    } else { // rest
      ell(c, 0, 15, 19, 3.6); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill();
      for (const [px, py, pr] of [[-24, 13, 2.6], [21, 14, 2], [27, 13.5, 1.5], [-19, 14.5, 1.4]]) { ell(c, px, py, pr, pr * 0.8); fs(c, '#4e5767', 0.8, 0.55); }
      c.save(); c.rotate(0.18); rockBody(c, 15, 3); c.restore();
      for (let i = 0; i < 4; i++) { const u = (t * 0.7 + i * 0.25) % 1, sx = i % 2 ? 1 : -1; c.fillStyle = 'rgba(195,190,180,' + (0.3 * (1 - u)).toFixed(2) + ')'; c.beginPath(); c.arc(sx * (14 + u * 14 + i), 13 - u * 12, 3 + u * 5, 0, TAU); c.fill(); }
    }
    c.restore();
  }

  // ================================================================ web
  // x,y = left end of the patch on the floor; spans len tiles; ~1.2 tiles high.
  function drawWeb(c, x, y, o) {
    o = o || {};
    const len = o.len || 3, torn = !!o.torn, t = o.t || 0, N = len * 2, SP = TILE / 2, H = TILE * 1.2;
    c.save(); c.translate(x, y);
    const top = (j) => ({ x: j * SP + sin(t * 1.4 + j * 1.3) * 0.8, y: -H * (0.78 + 0.22 * (j % 2 ? 0 : 1)) + sin(t * 1.7 + j) * 0.9 });
    const gap0 = Math.floor(N * 0.3), gap1 = Math.ceil(N * 0.7);
    const gone = (j) => torn && j > gap0 && j < gap1;
    if (!torn) { // faint milky fill
      c.beginPath(); c.moveTo(0, 0); for (let j = 0; j <= N; j++) { const p = top(j); c.lineTo(p.x, p.y); } c.lineTo(N * SP, 0); c.closePath(); c.fillStyle = 'rgba(205,220,240,0.09)'; c.fill();
    }
    c.lineCap = 'round'; c.lineJoin = 'round';
    const strand = (a, b, al) => { c.strokeStyle = 'rgba(225,235,248,' + al + ')'; c.lineWidth = 1; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); };
    for (let j = 0; j <= N; j++) { // floor anchors
      const p = top(j); if (gone(j) && gone(j - 1) && gone(j + 1)) continue;
      strand([j * SP, 0], [p.x, p.y], 0.55);
      if (j < N && !(gone(j) && gone(j + 1))) { const q = top(j + 1); strand([j * SP, 0], [q.x, q.y], 0.5); strand([(j + 1) * SP, 0], [p.x, p.y], 0.5); }
    }
    for (const lvl of [0.4, 0.7, 1]) { // drooping rings
      c.strokeStyle = 'rgba(225,235,248,' + (0.7 - lvl * 0.15) + ')'; c.lineWidth = 1.05;
      for (let j = 0; j < N; j++) {
        if (gone(j) || gone(j + 1)) continue;
        const a = top(j), b = top(j + 1), ax = a.x, ay = a.y * lvl, bx = b.x, by = b.y * lvl;
        c.beginPath(); c.moveTo(ax, ay); c.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + 4 + lvl * 2, bx, by); c.stroke();
      }
    }
    c.beginPath(); c.moveTo(0, -1); c.lineTo(N * SP, -1); c.strokeStyle = 'rgba(225,235,248,0.5)'; c.lineWidth = 1.2; c.stroke();
    if (torn) { // ripped strands hanging from both sides of the hole, plus rags on the floor
      for (const [j0, dir] of [[gap0, 1], [gap1, -1]]) {
        const p = top(j0);
        for (let i = 0; i < 4; i++) {
          const ln = 14 + hh(j0, i) * 22, sw2 = sin(t * 1.6 + i * 1.7 + j0) * 3;
          c.beginPath(); c.moveTo(p.x + dir * i * 2, p.y * (0.5 + i * 0.18)); c.bezierCurveTo(p.x + dir * (6 + i * 5) + sw2, p.y * 0.4 + ln * 0.4, p.x + dir * (3 + i * 3) - sw2, p.y * 0.3 + ln * 0.8, p.x + dir * (8 + i * 6) + sw2 * 1.4, p.y * (0.5 + i * 0.18) + ln);
          c.strokeStyle = 'rgba(225,235,248,' + (0.7 - i * 0.1) + ')'; c.lineWidth = 1; c.stroke();
        }
      }
      for (let i = 0; i < 3; i++) { const fx = (gap0 + 1 + i * (gap1 - gap0 - 2) / 2) * SP; c.beginPath(); c.moveTo(fx - 8, -1); c.quadraticCurveTo(fx, -6 - i % 2 * 3, fx + 9, -1); c.strokeStyle = 'rgba(225,235,248,0.5)'; c.lineWidth = 1; c.stroke(); }
    }
    for (let i = 0; i < len * 2; i++) { // dew sparkles
      const j = 1 + Math.floor(hh(i, 91) * (N - 1)); if (gone(j)) continue; const p = top(j), tw = 0.5 + 0.5 * sin(t * 2.5 + i * 2);
      c.fillStyle = 'rgba(255,255,255,' + (0.35 + tw * 0.5).toFixed(2) + ')'; c.beginPath(); c.arc(p.x, p.y * (0.4 + hh(i, 92) * 0.5) + 2, 1 + tw * 0.5, 0, TAU); c.fill();
    }
    c.restore();
  }

  // ================================================================ torch / candle
  // x,y = bottom centre of the iron bracket (the bracket is the lowest part); stick + flame rise above it.
  function drawTorch(c, x, y, o) {
    o = o || {};
    const lit = !!o.lit, t = o.t || 0;
    c.save(); c.translate(x, y);
    if (lit) {
      c.save(); c.globalCompositeOperation = 'lighter';
      const fl = 1 + 0.08 * sin(t * 11) + 0.05 * sin(t * 23);
      glow(c, 0, -36, 92 * fl, 0.6, 'amber'); glow(c, 0, -34, 40, 0.5, 'amber');
      c.restore();
    }
    // wall plate + curled bracket
    rr(c, -6, -8, 12, 8, 2.5); fs(c, '#2f3642', 1.1, 0.6);
    c.beginPath(); c.moveTo(-9, -5); c.bezierCurveTo(-9, -14, -3, -13, -2, -10); c.moveTo(9, -5); c.bezierCurveTo(9, -14, 3, -13, 2, -10); c.strokeStyle = ink(0.6); c.lineWidth = 3.4; c.lineCap = 'round'; c.stroke(); c.strokeStyle = '#4b5565'; c.lineWidth = 2; c.stroke();
    // wooden stick
    c.beginPath(); c.moveTo(-3, -8); c.lineTo(-2.4, -28); c.lineTo(2.4, -28); c.lineTo(3, -8); c.closePath(); fs(c, '#6a4a38', 1, 0.6);
    // iron cup + wrapped head
    c.beginPath(); c.moveTo(-6.4, -36); c.lineTo(-3.2, -26); c.lineTo(3.2, -26); c.lineTo(6.4, -36); c.closePath(); fs(c, '#3a4553', 1.1, 0.65);
    c.beginPath(); c.moveTo(-5.4, -34); c.quadraticCurveTo(0, -31, 5.4, -34); c.strokeStyle = 'rgba(190,210,230,0.3)'; c.lineWidth = 1; c.stroke();
    ell(c, 0, -36.5, 5.6, 3); fs(c, lit ? '#2a1d18' : '#2b2530', 1, 0.6);
    if (lit) flame(c, 0, -37, 2.5, t, 3);
    else { // dark, with a faint cold ember so it reads as "light me"
      const e = 0.35 + 0.25 * sin(t * 3);
      c.fillStyle = 'rgba(243,160,58,' + e.toFixed(2) + ')'; c.beginPath(); c.arc(1, -37.4, 1.2, 0, TAU); c.fill();
      smokeWisp(c, 0, -38, t, 0.35);
    }
    c.restore();
  }

  // ~1.2 tiles tall candle on a small stone stand (x,y = bottom centre). puff 0..1 = smoke puff after it went out.
  function drawPuzzleCandle(c, x, y, o) {
    o = o || {};
    const lit = !!o.lit, t = o.t || 0, puff = clamp(o.puff || 0, 0, 1);
    c.save(); c.translate(x, y);
    if (lit) { c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 0, -46, 62 * (1 + 0.04 * sin(t * 12)), 0.55, 'amber'); c.restore(); }
    // stand
    c.beginPath(); c.moveTo(-11, 0); c.lineTo(-9, -4); c.lineTo(-5, -5); c.quadraticCurveTo(-4.5, -11, -7, -14); c.lineTo(7, -14); c.quadraticCurveTo(4.5, -11, 5, -5); c.lineTo(9, -4); c.lineTo(11, 0); c.closePath(); fs(c, '#465060', 1.2, 0.65);
    rr(c, -9.5, -17, 19, 4.4, 2); fs(c, '#566176', 1.1, 0.6);
    c.beginPath(); c.moveTo(-3, -10); c.lineTo(0, -7); c.lineTo(3, -10); c.strokeStyle = 'rgba(190,205,225,0.4)'; c.lineWidth = 1.1; c.stroke();
    // candle
    c.beginPath(); c.moveTo(-4.4, -17); c.lineTo(-4.2, -38); c.quadraticCurveTo(0, -40.4, 4.2, -38); c.lineTo(4.4, -17); c.closePath(); fs(c, P.cream, 1, 0.6);
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(1.2, -38, 3, 21);
    c.beginPath(); c.moveTo(-4.3, -37); c.quadraticCurveTo(-5.4, -33, -4.6, -31.5); c.quadraticCurveTo(-3.3, -32, -3, -35); c.closePath(); c.fillStyle = '#f7efe0'; c.fill();
    c.beginPath(); c.moveTo(0, -39); c.lineTo(0, -41.2); c.strokeStyle = '#2a1d18'; c.lineWidth = 1.2; c.stroke();
    if (lit) flame(c, 0, -41, 1.75, t, 5);
    else {
      if (puff > 0 && puff < 1) {
        for (let i = 0; i < 4; i++) {
          const u = clamp(puff * 1.1 - i * 0.07, 0, 1), px = (i - 1.5) * 2.4 * (1 + u * 2) + sin(puff * 6 + i) * 3, py = -43 - u * 26 - i * 1.5, r = 2.6 + u * 7;
          c.fillStyle = 'rgba(190,195,210,' + (0.55 * (1 - puff) * (1 - u * 0.4)).toFixed(2) + ')'; c.beginPath(); c.arc(px, py, r, 0, TAU); c.fill();
        }
      } else smokeWisp(c, 0, -42, t, 0.3);
    }
    c.restore();
  }

  // ================================================================ door
  // x,y = bottom centre; 2 tiles wide x 3 tall (plus frame). open 0..1 swings the leaf open on its left hinge.
  function drawDoor(c, x, y, o) {
    o = o || {};
    const op = clamp(o.open || 0, 0, 1), t = o.t || 0, W = TILE * 2, H = TILE * 3, e = ss(op);
    c.save(); c.translate(x, y);
    // stone frame
    archPath(c, -W / 2 - 7, -H - 7, W + 14, H + 7); fs(c, '#3a4553', 2, 0.65);
    c.strokeStyle = 'rgba(2,4,8,0.5)'; c.lineWidth = 1;
    for (let i = 0; i <= 10; i++) { const a = PI + i / 10 * PI; c.beginPath(); c.moveTo(cos(a) * (W / 2), -H + W / 2 + sin(a) * (W / 2)); c.lineTo(cos(a) * (W / 2 + 7), -H + W / 2 + sin(a) * (W / 2 + 7)); c.stroke(); }
    // interior
    archPath(c, -W / 2, -H, W, H); c.fillStyle = '#07090d'; c.fill();
    c.save(); archPath(c, -W / 2, -H, W, H); c.clip();
    if (e > 0) {
      const ig = c.createLinearGradient(0, -H, 0, 0); ig.addColorStop(0, 'rgb(' + (60 + 80 * e | 0) + ',' + (40 + 60 * e | 0) + ',' + (30 + 20 * e | 0) + ')'); ig.addColorStop(1, 'rgb(' + (120 + 110 * e | 0) + ',' + (84 + 90 * e | 0) + ',' + (40 + 30 * e | 0) + ')');
      c.globalAlpha = e; c.fillStyle = ig; c.fillRect(-W / 2, -H, W, H);
      c.globalCompositeOperation = 'lighter'; glow(c, 0, -H * 0.4, 70, 0.9, 'amber');
      c.globalAlpha = e * 0.35; c.fillStyle = '#f7c873';
      for (const [ax, bw] of [[-14, 8], [2, 12], [18, 7]]) { c.beginPath(); c.moveTo(ax, -H); c.lineTo(ax + bw, -H); c.lineTo(ax + bw * 2.4, 0); c.lineTo(ax - bw * 0.6, 0); c.closePath(); c.fill(); }
      c.globalAlpha = e; c.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 7; i++) { const u = (t * 0.2 + hh(i, 1)) % 1; c.fillStyle = 'rgba(255,235,180,' + (0.8 * (1 - u)).toFixed(2) + ')'; c.beginPath(); c.arc((hh(i, 2) - 0.5) * W * 0.8, -u * H * 0.8 - 6, 1.2 + hh(i, 3), 0, TAU); c.fill(); }
      c.globalAlpha = 1;
    }
    c.restore();
    // leaf: hinged on the left edge, narrowing as it swings
    const sx = cos(e * 1.28), lx = -W / 2;
    c.save(); c.translate(lx, 0); c.scale(max(sx, 0.05), 1); c.translate(-lx, 0);
    archPath(c, -W / 2, -H, W, H); fs(c, '#4a3a42', 1.6 / max(sx, 0.4), 0.7);
    c.save(); archPath(c, -W / 2, -H, W, H); c.clip();
    for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo(-W / 2 + i * W / 5, -H); c.lineTo(-W / 2 + i * W / 5, 0); c.strokeStyle = 'rgba(10,6,12,0.5)'; c.lineWidth = 1.2; c.stroke(); }
    c.fillStyle = 'rgba(210,190,170,0.07)'; for (let i = 0; i < 5; i += 2) c.fillRect(-W / 2 + i * W / 5 + 2, -H, 3, H);
    for (const by of [-H + 24, -H * 0.5, -22]) { rr(c, -W / 2, by - 4, W, 8, 2); fs(c, '#2f3642', 1, 0.6); for (let i = 0; i < 4; i++) { ell(c, -W / 2 + 8 + i * 18.7, by, 1.5, 1.5); c.fillStyle = '#6a7886'; c.fill(); } }
    c.restore();
    // handle ring + carved skull plate
    ell(c, 15, -H * 0.42, 5.5, 5.5); c.strokeStyle = ink(0.6); c.lineWidth = 3.6; c.stroke(); c.strokeStyle = '#8a7a58'; c.lineWidth = 2.2; c.stroke();
    ell(c, 15, -H * 0.42 - 8, 3.2, 3.2); fs(c, '#8a7a58', 0.8, 0.55);
    skull(c, 0, -H + 36, 6.5, { col: '#8d93a8' });
    c.restore();
    if (e > 0.1) { c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 0, -H * 0.4, 110, 0.3 * e, 'amber'); c.restore(); }
    // stone step
    rr(c, -W / 2 - 10, -4, W + 20, 6, 2); fs(c, '#2f3642', 1, 0.55);
    c.restore();
  }

  // ================================================================ scroll
  // x,y = bottom centre of a little pedestal; the scroll floats above it.
  function drawScroll(c, x, y, o) {
    o = o || {};
    const t = o.t || 0, g = clamp(o.glow == null ? 0.4 : o.glow, 0, 1), bob = sin(t * 1.9) * 3;
    c.save(); c.translate(x, y);
    // glow
    c.save(); c.globalCompositeOperation = 'lighter';
    glow(c, 0, -48 + bob, 34 + g * 44, 0.28 + g * 0.5, 'amber'); c.restore();
    // pedestal
    c.beginPath(); c.moveTo(-13, 0); c.lineTo(-10, -4); c.lineTo(-6, -6); c.lineTo(-6, -18); c.lineTo(-10, -20); c.lineTo(10, -20); c.lineTo(6, -18); c.lineTo(6, -6); c.lineTo(10, -4); c.lineTo(13, 0); c.closePath(); fs(c, '#465060', 1.2, 0.65);
    rr(c, -12, -23, 24, 5, 2); fs(c, '#566176', 1.1, 0.6);
    c.save(); c.globalCompositeOperation = 'lighter'; ell(c, 0, -23, 9, 2); c.fillStyle = 'rgba(243,200,115,' + (0.25 + g * 0.4).toFixed(2) + ')'; c.fill(); c.restore();
    // floating scroll
    c.save(); c.translate(0, -48 + bob); c.rotate(sin(t * 1.3) * 0.05);
    c.beginPath(); c.moveTo(-10, -14); c.lineTo(10, -14); c.lineTo(10.6, 14); c.quadraticCurveTo(5, 16.5, 0, 14.5); c.quadraticCurveTo(-5, 12.5, -10.6, 14); c.closePath(); fs(c, '#efe3c3', 1.1, 0.6);
    c.fillStyle = 'rgba(160,110,50,0.14)'; c.fillRect(2, -14, 8, 28);
    const ra = 0.55 + g * 0.45; c.strokeStyle = 'rgba(214,150,30,' + ra.toFixed(2) + ')'; c.lineWidth = 1.2; c.lineCap = 'round'; c.lineJoin = 'round';
    for (let i = 0; i < 4; i++) { // golden runes
      const ry = -8.5 + i * 5.6;
      for (let j = 0; j < 3; j++) {
        const rx = -6.2 + j * 5.6, kind = Math.floor(hh(i * 3 + j, 17) * 4); c.beginPath();
        if (kind === 0) { c.moveTo(rx - 1.6, ry + 2); c.lineTo(rx, ry - 2); c.lineTo(rx + 1.6, ry + 2); } else if (kind === 1) { c.moveTo(rx, ry - 2); c.lineTo(rx, ry + 2); c.moveTo(rx - 1.8, ry); c.lineTo(rx + 1.8, ry); } else if (kind === 2) { c.arc(rx, ry, 1.7, 0, TAU); } else { c.moveTo(rx - 1.6, ry - 2); c.lineTo(rx + 1.6, ry); c.lineTo(rx - 1.6, ry + 2); }
        c.stroke();
      }
    }
    for (const ry of [-14, 14]) { // rolled ends
      rr(c, -13, ry - 3.2, 26, 6.4, 3.2); fs(c, '#e2d1a8', 1.1, 0.6);
      ell(c, -13, ry, 2.2, 3.2); fs(c, '#c9b284', 0.9, 0.55); ell(c, 13, ry, 2.2, 3.2); fs(c, '#c9b284', 0.9, 0.55);
    }
    c.restore();
    // sparkles
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3 + Math.round(g * 5); i++) {
      const u = (t * 0.45 + hh(i, 2)) % 1, a = hh(i, 3) * TAU + t * 0.8, rr2 = 14 + hh(i, 4) * 16;
      c.fillStyle = 'rgba(255,225,150,' + (0.9 * sin(u * PI)).toFixed(2) + ')'; c.beginPath(); c.arc(cos(a) * rr2, -48 - u * 18 + sin(a) * rr2 * 0.6, 1.1 + hh(i, 5), 0, TAU); c.fill();
    }
    c.restore();
    c.restore();
  }

  // ================================================================ vortex
  // Teleport swirl centred on (x,y); radius grows to ~120px with k 0..1.
  function drawVortex(c, x, y, o) {
    o = o || {};
    const k = clamp(o.k || 0, 0, 1), t = o.t || 0;
    if (k <= 0.001) return;
    const R = 120 * k, al = clamp(k * 3, 0, 1);
    c.save(); c.translate(x, y); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    const pg = glowSprite('purple', 150, 90, 230);
    c.globalAlpha = 0.65 * al; c.drawImage(pg, -R * 1.3, -R * 1.3, R * 2.6, R * 2.6);
    c.globalAlpha = 1;
    const SEG = 26, ARMS = 4;
    for (let a = 0; a < ARMS; a++) {
      const col = a % 2 ? '243,170,70' : '176,110,255';
      for (let s = 0; s < SEG; s++) {
        const u0 = s / SEG, u1 = (s + 1) / SEG, an = (u) => a * TAU / ARMS + t * 2.6 - u * 4.4;
        c.beginPath(); c.moveTo(cos(an(u0)) * R * u0, sin(an(u0)) * R * u0 * 0.96); c.lineTo(cos(an(u1)) * R * u1, sin(an(u1)) * R * u1 * 0.96);
        c.strokeStyle = 'rgba(' + col + ',' + (0.8 * al * Math.pow(sin((u0 + 0.02) * PI * 0.98 + 0.05), 0.7)).toFixed(3) + ')';
        c.lineWidth = (1.5 + u0 * 7 * (0.4 + k * 0.6)) ; c.stroke();
      }
    }
    c.strokeStyle = 'rgba(200,160,255,' + (0.3 * al).toFixed(2) + ')'; c.lineWidth = 1.4; c.setLineDash([6, 8]); c.lineDashOffset = -t * 20; ell(c, 0, 0, R * 0.96, R * 0.92); c.stroke(); c.setLineDash([]);
    const cg = c.createRadialGradient(0, 0, 0, 0, 0, R * 0.2 + 2); cg.addColorStop(0, 'rgba(255,250,225,' + al + ')'); cg.addColorStop(0.5, 'rgba(250,190,100,' + (0.7 * al) + ')'); cg.addColorStop(1, 'rgba(200,120,255,0)');
    c.fillStyle = cg; c.beginPath(); c.arc(0, 0, R * 0.2 + 2, 0, TAU); c.fill();
    for (let i = 0; i < 18; i++) { // spiralling sparkles
      const u = ((hh(i, 1) - t * (0.12 + hh(i, 2) * 0.18)) % 1 + 1) % 1, r = R * (0.1 + u * 0.95), an = hh(i, 3) * TAU + t * 1.6 - u * 5, sz = (1.4 + hh(i, 4) * 2.6) * (0.5 + k * 0.7);
      const px = cos(an) * r, py = sin(an) * r * 0.96, wh = hh(i, 5) > 0.5;
      c.fillStyle = (wh ? 'rgba(255,225,150,' : 'rgba(225,190,255,') + (al * sin(u * PI)).toFixed(2) + ')';
      c.beginPath(); c.moveTo(px, py - sz * 2); c.lineTo(px + sz * 0.5, py - sz * 0.5); c.lineTo(px + sz * 2, py); c.lineTo(px + sz * 0.5, py + sz * 0.5); c.lineTo(px, py + sz * 2); c.lineTo(px - sz * 0.5, py + sz * 0.5); c.lineTo(px - sz * 2, py); c.lineTo(px - sz * 0.5, py - sz * 0.5); c.closePath(); c.fill();
    }
    c.restore();
  }


  // ================================================================ portcullis (replaces the falling rock)
  // x = centre of the gate column, ceilY = underside of the vault, bottomY = current lower edge (spike tips).
  // o.warn: chains rattle + dust; the gate shakes a little.
  function drawPortcullis(c, x, ceilY, bottomY, o) {
    o = o || {};
    const t = o.t || 0, W = 40, half = W / 2;
    const shake = o.warn ? Math.sin(t * 45) * 1.2 : 0;
    c.save();
    c.translate(shake, 0);
    // stone slot in the vault
    c.fillStyle = '#2a2433'; c.fillRect(x - half - 4, ceilY - 6, W + 8, 8);
    c.strokeStyle = 'rgba(10,6,16,0.6)'; c.lineWidth = 1; c.strokeRect(x - half - 4, ceilY - 6, W + 8, 8);
    // chains on both sides
    const chainLen = Math.max(0, bottomY - ceilY);
    for (const sx of [-1, 1]) {
      const cx = x + sx * (half + 2);
      for (let yy = ceilY; yy < ceilY + Math.min(chainLen, 60); yy += 6) {
        c.strokeStyle = '#8a8f9c'; c.lineWidth = 1.4;
        c.beginPath(); c.ellipse(cx, yy + 3, 1.8, 3, 0, 0, Math.PI * 2); c.stroke();
      }
    }
    const top = Math.min(ceilY, bottomY - 8);
    const h = bottomY - top;
    if (h > 2) {
      c.save();
      c.beginPath(); c.rect(x - half - 2, ceilY - 2, W + 4, bottomY - ceilY + 14); c.clip();
      // vertical bars with spikes
      for (let i = 0; i < 5; i++) {
        const bx = x - half + 3 + i * ((W - 6) / 4);
        c.fillStyle = '#5c5868'; c.fillRect(bx - 2, top, 4, h - 6);
        c.fillStyle = 'rgba(200,205,220,0.25)'; c.fillRect(bx - 2, top, 1.2, h - 6);
        c.fillStyle = '#6d6979';
        c.beginPath(); c.moveTo(bx - 3, bottomY - 7); c.lineTo(bx + 3, bottomY - 7); c.lineTo(bx, bottomY + 1); c.closePath(); c.fill();
      }
      // horizontal bars
      for (let yy = bottomY - 16; yy > top; yy -= 20) {
        c.fillStyle = '#56525f'; c.fillRect(x - half, yy - 2.5, W, 5);
        c.fillStyle = 'rgba(200,205,220,0.2)'; c.fillRect(x - half, yy - 2, W, 1);
        for (let i = 0; i < 5; i++) { // rivets
          const bx = x - half + 3 + i * ((W - 6) / 4);
          c.fillStyle = '#6a6773'; c.beginPath(); c.arc(bx, yy, 1.4, 0, Math.PI * 2); c.fill();
        }
      }
      c.restore();
    }
    if (o.warn) { // dust trickling from the slot
      for (let i = 0; i < 6; i++) {
        const u = (t * 1.1 + i / 6) % 1, dx = Math.sin(i * 7.3) * half;
        c.fillStyle = 'rgba(200,195,185,' + (0.8 * (1 - u)).toFixed(2) + ')';
        c.beginPath(); c.arc(x + dx, ceilY + 4 + u * 30, 1.1, 0, Math.PI * 2); c.fill();
      }
    }
    c.restore();
  }

  // ==== M3 BEGIN
  // ================================================================ M3: THE BOARDING SCHOOL
  // ---- school tiles: polished wood floors, panelled walls, stone for cellar/tower rooms
  THEMES.cellar = { stone: ['#3a414c', '#424a57', '#353c47'], mortar: '#0d1117', hi: '#7a8ca0', accent: '#8e4256' };
  THEMES.tower = { stone: ['#4a4952', '#53525c', '#43424b'], mortar: '#12111a', hi: '#8a8a9c', accent: '#8e4256' };
  const roomRectCache = new WeakMap();
  function schoolStoneKind(world, tx, ty) { // 'cellar' | 'tower' | null, from the level's room entities (if any)
    const lv = world && world.level; if (!lv || !lv.entities) return null;
    let rooms = roomRectCache.get(lv);
    if (!rooms) { rooms = lv.entities.filter(e => e.type === 'room' && (e.theme === 'cellar' || e.theme === 'tower')); roomRectCache.set(lv, rooms); }
    for (const r of rooms) if (tx >= r.tx - 1 && tx <= r.tx + r.w && ty >= r.ty - 1 && ty <= r.ty + r.h) return r.theme;
    return null;
  }
  function schoolWall(v, top) {
    const key = 'sw' + v + (top ? 't' : '');
    if (tileCache[key]) return tileCache[key];
    const [s, c] = mk(TILE, TILE);
    c.fillStyle = '#271a1b'; c.fillRect(0, 0, TILE, TILE);
    const tint = ['#4a312c', '#46302d', '#4d332d', '#43302e', '#4a3430', '#45302b'][v % 6];
    // raised panel
    const y0 = top ? 7 : 3.5;
    rr(c, 3, y0, 30, TILE - y0 - 2.5, 4); fs(c, tint, 1.1, 0.6);
    rr(c, 7, y0 + 4, 22, TILE - y0 - 10.5, 3); fs(c, 'rgba(20,10,12,0.35)', 0.9, 0.4);
    c.strokeStyle = 'rgba(255,220,190,0.16)'; c.lineWidth = 1; c.beginPath(); c.moveTo(5, y0 + 2.6); c.lineTo(5, TILE - 5); c.moveTo(7.5, y0 + 4.5); c.lineTo(28, y0 + 4.5); c.stroke();
    c.strokeStyle = 'rgba(10,5,6,0.4)'; c.beginPath(); c.moveTo(31, y0 + 5); c.lineTo(31, TILE - 5); c.moveTo(8, TILE - 6.2); c.lineTo(30, TILE - 6.2); c.stroke();
    // wood grain
    c.strokeStyle = 'rgba(25,12,10,0.3)'; c.lineWidth = 0.7;
    for (let i = 0; i < 2; i++) { const gx = 11 + i * 9 + hh(v, i) * 4; c.beginPath(); c.moveTo(gx, y0 + 6); c.bezierCurveTo(gx + 2, y0 + 12, gx - 2, y0 + 18, gx + 1, TILE - 9); c.stroke(); }
    if (v % 5 === 0) { ell(c, 18, y0 + 14, 1.6, 1.6); fs(c, '#c8a050', 0.5, 0.5); }
    if (top) { // cap moulding
      rr(c, 0, 0, TILE, 7, 2.5); fs(c, '#6a4636', 1.2, 0.65);
      c.beginPath(); c.moveTo(1.5, 2.4); c.lineTo(TILE - 1.5, 2.4); c.strokeStyle = 'rgba(255,225,200,0.4)'; c.lineWidth = 1; c.stroke();
      c.beginPath(); c.moveTo(0, 7.4); c.lineTo(TILE, 7.4); c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1.2; c.stroke();
    }
    tileCache[key] = s; return s;
  }
  function parquet(c, v, top, rough) {
    // body: dark subfloor with herringbone strips
    c.fillStyle = '#2b1b17'; c.fillRect(0, 0, TILE, TILE);
    for (let r = 0; r < 3; r++) for (let q = 0; q < 6; q++) {
      const x0 = q * 6, y0 = 10 + r * 9, flip = (q + r) % 2;
      c.beginPath();
      if (flip) { c.moveTo(x0, y0 + 1); c.lineTo(x0 + 6, y0); c.lineTo(x0 + 6, y0 + 8); c.lineTo(x0, y0 + 9); }
      else { c.moveTo(x0, y0); c.lineTo(x0 + 6, y0 + 1); c.lineTo(x0 + 6, y0 + 9); c.lineTo(x0, y0 + 8); }
      c.closePath();
      const sh = hh(v * 7 + r, q);
      c.fillStyle = sh > 0.66 ? '#5c3b2c' : sh > 0.33 ? '#523427' : '#493024'; c.fill();
      c.strokeStyle = 'rgba(15,8,6,0.55)'; c.lineWidth = 0.7; c.stroke();
    }
    c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(0, TILE - 7, TILE, 7);
    // polished top board
    rr(c, 0, 0, TILE, 9.5, 2); fs(c, rough ? '#7b533d' : '#8c6044', 1.1, 0.6);
    c.beginPath(); c.moveTo(1.5, 3.2); c.lineTo(TILE - 1.5, 3.2); c.strokeStyle = 'rgba(255,238,215,0.5)'; c.lineWidth = 1.2; c.stroke(); // polish glare
    c.beginPath(); c.moveTo(6, 6); c.lineTo(15, 6); c.moveTo(22, 5.4); c.lineTo(28, 5.4); c.strokeStyle = 'rgba(255,238,215,0.2)'; c.lineWidth = 0.8; c.stroke();
    for (const jx of [10 + hh(v, 3) * 5, 24 + hh(v, 4) * 6]) { c.beginPath(); c.moveTo(jx, 0.8); c.lineTo(jx + 0.4, 9.4); c.strokeStyle = 'rgba(25,12,8,0.55)'; c.lineWidth = 0.9; c.stroke(); }
  }
  function schoolFloor(v, top) {
    const key = 'sf' + v + (top ? 't' : '');
    if (tileCache[key]) return tileCache[key];
    const [s, c] = mk(TILE, TILE); parquet(c, v, top, false);
    tileCache[key] = s; return s;
  }
  function schoolCreaky(v, top) {
    const key = 'sc' + v + (top ? 't' : '');
    if (tileCache[key]) return tileCache[key];
    const [s, c] = mk(TILE, TILE); parquet(c, v, top, true);
    // one bowed, lighter board with a dark gap, bright nails, and a little crack
    const jx = 8 + hh(v, 3) * 10;
    c.beginPath(); c.moveTo(jx, 1.4); c.quadraticCurveTo(jx + 10, -0.8, jx + 20, 1.6); c.lineTo(jx + 20, 9); c.lineTo(jx, 9); c.closePath(); fs(c, '#a37452', 1, 0.6);
    c.strokeStyle = 'rgba(255,238,215,0.4)'; c.lineWidth = 1; c.beginPath(); c.moveTo(jx + 2, 3.4); c.quadraticCurveTo(jx + 10, 1.8, jx + 18, 3.6); c.stroke();
    c.strokeStyle = 'rgba(8,4,4,0.85)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(jx - 0.4, 2); c.lineTo(jx + 0.4, 9.8); c.moveTo(jx + 20.2, 2); c.lineTo(jx + 19.6, 9.8); c.stroke();
    for (const nx of [jx + 4, jx + 16]) { ell(c, nx, 6.2, 1.5, 1.5); fs(c, '#d6dbe8', 0.7, 0.7); ell(c, nx - 0.4, 5.7, 0.5, 0.5); c.fillStyle = '#fff'; c.fill(); }
    c.beginPath(); c.moveTo(jx + 8, 3.4); c.lineTo(jx + 10.4, 5.4); c.lineTo(jx + 9.4, 7.8); c.strokeStyle = 'rgba(25,12,8,0.6)'; c.lineWidth = 0.8; c.stroke();
    tileCache[key] = s; return s;
  }
  function schoolLedge() {
    if (tileCache.sledge) return tileCache.sledge;
    const [s, c] = mk(TILE, TILE);
    for (const bx of [3, 25]) { c.beginPath(); c.moveTo(bx, 8); c.lineTo(bx + 8, 8); c.quadraticCurveTo(bx + 7, 15, bx + 3, 19); c.quadraticCurveTo(bx + 1, 18, bx, 12); c.closePath(); fs(c, '#4a2f25', 1, 0.55); ell(c, bx + 3.4, 11.5, 1.3, 1.3); c.fillStyle = 'rgba(255,225,190,0.2)'; c.fill(); }
    rr(c, 0, 1, TILE, 7.8, 2.6); fs(c, '#8a5d43', 1.2, 0.62);
    c.beginPath(); c.moveTo(2, 3.4); c.lineTo(TILE - 2, 3.4); c.strokeStyle = 'rgba(255,238,215,0.45)'; c.lineWidth = 1.1; c.stroke();
    c.beginPath(); c.moveTo(0, 6.6); c.lineTo(TILE, 6.6); c.strokeStyle = 'rgba(30,14,10,0.35)'; c.lineWidth = 1; c.stroke();
    // brass edge studs
    for (const nx of [5, 18, 31]) { ell(c, nx, 5, 0.9, 0.9); c.fillStyle = '#d4ad5a'; c.fill(); }
    tileCache.sledge = s; return s;
  }
  function schoolLadder(v) {
    const key = 'sl' + (v % 2);
    if (tileCache[key]) return tileCache[key];
    const [s, c] = mk(TILE, TILE);
    for (const rx of [7, 29]) { rr(c, rx - 2.6, -1, 5.2, TILE + 2, 2); fs(c, '#6a4636', 1.1, 0.62); c.beginPath(); c.moveTo(rx - 0.9, 0); c.lineTo(rx - 0.9, TILE); c.strokeStyle = 'rgba(255,225,200,0.25)'; c.lineWidth = 1; c.stroke(); }
    for (let i = 0; i < 4; i++) { const yy = 4 + i * 9 + (v % 2) * 0; rr(c, 4, yy - 1.9, 28, 3.8, 1.9); fs(c, '#9a6c4c', 1, 0.55); c.beginPath(); c.moveTo(7, yy - 0.7); c.lineTo(29, yy - 0.7); c.strokeStyle = 'rgba(255,235,210,0.28)'; c.lineWidth = 0.8; c.stroke(); for (const rx of [7, 29]) { ell(c, rx, yy, 1, 1); c.fillStyle = '#d4ad5a'; c.fill(); } }
    tileCache[key] = s; return s;
  }
  function schoolTile(world, ch, tx, ty, v, topOpen) {
    const sk = (ch === '#' || ch === '=' || ch === '~') ? schoolStoneKind(world, tx, ty) : null;
    if (ch === '#') return sk ? stoneSprite(sk, v, topOpen) : schoolWall(v, topOpen);
    if (ch === '=') return sk ? stoneSprite(sk, v, topOpen) : schoolFloor(v, topOpen);
    if (ch === '~') return schoolCreaky(v, topOpen);
    if (ch === '-') return schoolLedge();
    if (ch === 'H') return schoolLadder(ty);
    return null;
  }

  // ---- school backgrounds (480x600 cached tiles; one per room theme)
  const SBG = {
    school_aula: { top: '#1c1727', bot: '#2d2335', pat: 'rgba(160,80,100,0.12)', wain: '#2b1c1f', trim: '#5a3a2e', glass: ['#34457a', '#171a3c'] },
    school_classroom: { top: '#182024', bot: '#26302f', pat: 'rgba(150,190,170,0.07)', wain: '#1f2b2a', trim: '#4a3a2e', glass: ['#2f4f6b', '#122033'] },
    school_dining: { top: '#2a1520', bot: '#3a1d28', pat: 'rgba(243,200,115,0.10)', wain: '#2a1519', trim: '#5a3a2e', glass: ['#34457a', '#171a3c'] },
    school_library: { top: '#241a14', bot: '#33241a', pat: 'rgba(243,200,115,0.05)', wain: '#2a1d16', trim: '#5a3d2c', glass: ['#34457a', '#171a3c'] },
    school_cellar: { top: '#0d1219', bot: '#161e28', pat: 'rgba(120,150,180,0.05)', wain: '#10151c', trim: '#2f3844', glass: ['#26365a', '#0d1426'] },
    school_tower: { top: '#15161f', bot: '#22232e', pat: 'rgba(160,170,200,0.05)', wain: '#171822', trim: '#3a3c4a', glass: ['#34457a', '#171a3c'] },
  };
  function sWallpaper(c, th, stripe) {
    const gr = c.createLinearGradient(0, 0, 0, BGH); gr.addColorStop(0, th.top); gr.addColorStop(1, th.bot);
    c.fillStyle = gr; c.fillRect(0, 0, BGW, BGH);
    if (stripe) { c.fillStyle = th.pat; for (let x = 0; x < BGW; x += 30) { c.fillRect(x, 0, 11, BGH); c.fillRect(x + 11, 0, 1.2, BGH); } }
    else {
      c.strokeStyle = th.pat; c.fillStyle = th.pat; c.lineWidth = 1.3;
      for (let r = 0; r < 12; r++) for (let q = 0; q < 12; q++) {
        const px = q * 40 + (r % 2) * 20 + 20, py = r * 50 + 25;
        c.beginPath(); c.moveTo(px, py - 12); c.bezierCurveTo(px + 8, py - 5, px + 8, py + 5, px, py + 12); c.bezierCurveTo(px - 8, py + 5, px - 8, py - 5, px, py - 12); c.stroke(); ell(c, px, py, 2, 2); c.fill();
      }
    }
  }
  function sWainscot(c, th, wy) {
    c.fillStyle = th.wain; c.fillRect(0, wy, BGW, BGH - wy);
    for (let i = 0; i < 6; i++) { rr(c, i * 80 + 8, wy + 22, 64, 110, 5); fs(c, 'rgba(255,255,255,0.035)', 1.4, 0.35); }
    c.fillStyle = th.trim; c.fillRect(0, wy, BGW, 9); c.fillStyle = 'rgba(255,255,255,0.09)'; c.fillRect(0, wy, BGW, 2);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, wy + 9, BGW, 3);
  }
  function sFinish(c, a, b) {
    const cg = c.createLinearGradient(0, 0, 0, 80); cg.addColorStop(0, 'rgba(8,5,14,' + (a || 0.5) + ')'); cg.addColorStop(1, 'rgba(8,5,14,0)'); c.fillStyle = cg; c.fillRect(0, 0, BGW, 80);
    const fg = c.createLinearGradient(0, BGH - 100, 0, BGH); fg.addColorStop(0, 'rgba(8,5,14,0)'); fg.addColorStop(1, 'rgba(8,5,14,' + (b || 0.5) + ')'); c.fillStyle = fg; c.fillRect(0, BGH - 100, BGW, 100);
  }
  function sCurtain(c, x, y, h, side, col) { // drape hanging at one side of a window, x = wall-edge side
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + side * 26, y + 2); c.bezierCurveTo(x + side * 30, y + h * 0.4, x + side * 14, y + h * 0.7, x + side * 22, y + h); c.lineTo(x, y + h); c.closePath(); fs(c, col, 1.2, 0.55);
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x + side * i * 6, y + 4); c.quadraticCurveTo(x + side * (i * 6 + 3), y + h * 0.5, x + side * (i * 5 + 2), y + h - 2); c.stroke(); }
    ell(c, x + side * 14, y + h * 0.62, 2.6, 5); fs(c, '#d4ad5a', 0.8, 0.5); // tassel
  }
  function sPlate(c, x, y, r, rim) { ell(c, x, y, r, r); fs(c, '#e9e4dc', 0.9, 0.5); ell(c, x, y, r * 0.72, r * 0.72); c.strokeStyle = rim; c.lineWidth = 1.2; c.stroke(); ell(c, x - r * 0.3, y - r * 0.3, r * 0.2, r * 0.12, -0.7); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fill(); }
  const CLOCK_C = [360, 132, 50];

  function buildSchoolBG(theme) {
    const th = SBG[theme] || SBG.school_classroom;
    const s = document.createElement('canvas'); s.width = BGW; s.height = BGH;
    const c = s.getContext('2d');
    // aula / classrooms / dining: a quiet wall only – windows, clocks, maps etc. come from the room's own (foreground) deco,
    // otherwise the parallax wall and the deco overlap and the room looks doubled
    if (theme === 'school_aula' || theme === 'school_classroom' || theme === 'school_dining') {
      sWallpaper(c, th, theme === 'school_aula'); sWainscot(c, th, 440);
      if (theme === 'school_dining') { rr(c, 0, 312, BGW, 6, 2); fs(c, '#5a3a2e', 1, 0.55); }
      sFinish(c, 0.55, 0.55);
      return s;
    }
    if (theme === 'school_aula') {
      sWallpaper(c, th, true); sWainscot(c, th, 440);
      // two-storey: upper windows
      bgWindow(c, 120, 62, 76, 150, th, false, theme);
      bgWindow(c, 120, 300, 60, 120, th, false, theme);
      // big clock (face only; hands drawn live)
      { const [cx, cy, r] = CLOCK_C;
        c.beginPath(); c.moveTo(cx - r - 14, 224); c.lineTo(cx - r - 14, cy); c.arc(cx, cy, r + 14, PI, 0); c.lineTo(cx + r + 14, 224); c.closePath(); fs(c, '#4a3126', 2, 0.6);
        glow(c, cx, cy, r + 36, 0.16, 'amber');
        ell(c, cx, cy, r + 5, r + 5); fs(c, '#a07a3a', 2, 0.6); ell(c, cx, cy, r, r); fs(c, '#efe6d0', 1.6, 0.65);
        ell(c, cx, cy, r - 5, r - 5); c.strokeStyle = 'rgba(100,80,50,0.35)'; c.lineWidth = 1; c.stroke();
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU - PI / 2, big = i % 3 === 0; line(c, cx + cos(a) * (r - 9), cy + sin(a) * (r - 9), cx + cos(a) * (r - (big ? 17 : 13)), cy + sin(a) * (r - (big ? 17 : 13)), ink(0.8), big ? 3 : 1.6); }
        ell(c, cx, cy + 24, 8, 6); c.fillStyle = 'rgba(70,40,55,0.08)'; c.fill(); }
      // lower double doors
      c.beginPath(); c.moveTo(322, 440); c.lineTo(322, 340); c.quadraticCurveTo(322, 302, 360, 300); c.quadraticCurveTo(398, 302, 398, 340); c.lineTo(398, 440); c.closePath(); fs(c, '#4a3126', 2, 0.6);
      c.beginPath(); c.moveTo(328, 440); c.lineTo(328, 342); c.quadraticCurveTo(328, 310, 360, 308); c.quadraticCurveTo(392, 310, 392, 342); c.lineTo(392, 440); c.closePath(); c.fillStyle = '#1a0f12'; c.fill();
      line(c, 360, 308, 360, 440, ink(0.6), 1.6); ell(c, 354, 380, 2.4, 2.4); c.fillStyle = '#d4ad5a'; c.fill(); ell(c, 366, 380, 2.4, 2.4); c.fill();
      // banners
      for (const bx of [240]) {
        line(c, bx - 24, 72, bx + 24, 72, '#8a6a3a', 3.4); ell(c, bx - 26, 72, 3, 3); fs(c, P.amberLight, 0.8, 0.5); ell(c, bx + 26, 72, 3, 3); fs(c, P.amberLight, 0.8, 0.5);
        c.beginPath(); c.moveTo(bx - 20, 74); c.lineTo(bx + 20, 74); c.lineTo(bx + 20, 190); c.lineTo(bx, 172); c.lineTo(bx - 20, 190); c.closePath(); fs(c, 'rgba(122,48,66,0.95)', 1.4, 0.55);
        c.beginPath(); c.arc(bx, 108, 9, 0.7, 5.6); c.arc(bx + 3.5, 108, 7.5, 5.4, 0.9, true); c.closePath(); fs(c, P.amberLight, 0.8, 0.45);
        ell(c, bx, 134, 5, 3.6); c.fillStyle = '#17131e'; c.fill(); ell(c, bx + 4.5, 131.5, 2.6, 2.4); c.fill(); ell(c, bx - 2.6, 131, 2.6, 2.4); c.fill();
        // lower banner under the gallery
        line(c, bx - 24, 292, bx + 24, 292, '#8a6a3a', 3.4);
        c.beginPath(); c.moveTo(bx - 20, 294); c.lineTo(bx + 20, 294); c.lineTo(bx + 20, 410); c.lineTo(bx, 392); c.lineTo(bx - 20, 410); c.closePath(); fs(c, 'rgba(60,40,80,0.95)', 1.4, 0.55);
        ell(c, bx, 330, 6, 8); fs(c, 'rgba(243,200,115,0.5)', 1, 0.4);
      }
      // gallery slab + balustrade (full width)
      c.fillStyle = 'rgba(8,5,14,0.25)'; c.fillRect(0, 276, BGW, 14);
      for (let x = 4; x < BGW; x += 16) { c.beginPath(); c.moveTo(x - 2.4, 222); c.lineTo(x + 2.4, 222); c.quadraticCurveTo(x + 4.6, 236, x + 2.6, 244); c.quadraticCurveTo(x + 4.2, 252, x + 2.6, 258); c.lineTo(x - 2.6, 258); c.quadraticCurveTo(x - 4.2, 252, x - 2.6, 244); c.quadraticCurveTo(x - 4.6, 236, x - 2.4, 222); c.closePath(); fs(c, '#4a2f25', 0.9, 0.5); }
      rr(c, 0, 212, BGW, 11, 4); fs(c, '#7a5240', 1.3, 0.6); c.beginPath(); c.moveTo(2, 215); c.lineTo(BGW - 2, 215); c.strokeStyle = 'rgba(255,230,200,0.3)'; c.lineWidth = 1; c.stroke();
      rr(c, 0, 256, BGW, 22, 3); fs(c, '#5a3a2e', 1.3, 0.6); c.beginPath(); c.moveTo(0, 262); c.lineTo(BGW, 262); c.strokeStyle = 'rgba(255,230,200,0.18)'; c.lineWidth = 1; c.stroke();
      for (let x = 20; x < BGW; x += 60) { c.beginPath(); c.moveTo(x - 9, 278); c.lineTo(x + 9, 278); c.quadraticCurveTo(x + 7, 292, x + 2, 296); c.lineTo(x - 2, 296); c.quadraticCurveTo(x - 7, 292, x - 9, 278); c.closePath(); fs(c, '#4a2f25', 1, 0.55); }
      for (let x = 0; x <= 480; x += 120) { rr(c, x - 6, 205, 12, 55, 3); fs(c, '#6a4636', 1.1, 0.6); ell(c, x, 202, 5, 5); fs(c, '#d4ad5a', 0.8, 0.5); }
      // chandelier
      line(c, 240, 0, 240, 14, 'rgba(120,100,70,0.5)', 1.5); c.beginPath(); c.moveTo(210, 24); c.quadraticCurveTo(240, 40, 270, 24); c.strokeStyle = 'rgba(138,106,58,0.6)'; c.lineWidth = 3; c.stroke();
      for (const fx of [-28, -14, 0, 14, 28]) { rr(c, 240 + fx - 1.5, 15, 3, 9, 1); c.fillStyle = 'rgba(239,230,208,0.55)'; c.fill(); ell(c, 240 + fx, 12, 1.6, 2.6); c.fillStyle = 'rgba(247,180,80,0.7)'; c.fill(); }
      glow(c, 240, 16, 70, 0.14, 'amber');
      sFinish(c, 0.55, 0.55);
    } else if (theme === 'school_classroom') {
      sWallpaper(c, th, false); sWainscot(c, th, 440);
      // alphabet frieze
      c.font = 'bold 15px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
      const L = 'ABCDEFGHIJKLMNOPQRSTUVWX';
      for (let i = 0; i < 24; i++) { const x = 10 + i * 20, cols = ['#8e4256', '#5e7d4a', '#8a6a3a', '#3b6a8a']; rr(c, x - 8, 30, 17, 19, 3); fs(c, 'rgba(240,230,210,0.12)', 0.8, 0.3); c.fillStyle = cols[i % 4]; c.globalAlpha = 0.55; c.fillText(L[i], x + 0.5, 40.5); c.globalAlpha = 1; }
      bgWindow(c, 100, 84, 64, 190, th, false, theme); bgWindow(c, 380, 84, 64, 190, th, false, theme);
      // rolled-down world map
      line(c, 190, 76, 290, 76, '#6a4636', 4); ell(c, 186, 76, 3, 3); fs(c, '#d4ad5a', 0.8, 0.5); ell(c, 294, 76, 3, 3); fs(c, '#d4ad5a', 0.8, 0.5);
      rr(c, 194, 78, 92, 110, 2); fs(c, '#a99568', 1.2, 0.5); rr(c, 194, 186, 92, 5, 2); fs(c, '#6a4636', 1, 0.5);
      c.fillStyle = 'rgba(80,100,70,0.55)';
      c.beginPath(); c.moveTo(206, 100); c.quadraticCurveTo(220, 90, 238, 98); c.quadraticCurveTo(234, 116, 222, 126); c.quadraticCurveTo(214, 118, 206, 100); c.fill();
      c.beginPath(); c.moveTo(248, 96); c.quadraticCurveTo(268, 92, 278, 108); c.quadraticCurveTo(272, 128, 262, 140); c.quadraticCurveTo(252, 124, 248, 96); c.fill();
      c.beginPath(); c.moveTo(214, 142); c.quadraticCurveTo(228, 140, 232, 158); c.quadraticCurveTo(224, 172, 216, 160); c.fill();
      c.strokeStyle = 'rgba(100,60,40,0.5)'; c.lineWidth = 1; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(210, 170); c.quadraticCurveTo(240, 150, 270, 168); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.moveTo(264, 164); c.lineTo(272, 172); c.moveTo(272, 164); c.lineTo(264, 172); c.strokeStyle = '#8e2a3a'; c.lineWidth = 1.6; c.stroke();
      // wall clock
      ell(c, 240, 230, 20, 20); fs(c, '#efe6d0', 1.6, 0.6); ell(c, 240, 230, 22.5, 22.5); c.strokeStyle = '#4a3126'; c.lineWidth = 3; c.stroke();
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; line(c, 240 + cos(a) * 15, 230 + sin(a) * 15, 240 + cos(a) * 18, 230 + sin(a) * 18, ink(0.7), 1.2); }
      line(c, 240, 230, 240 + 9, 230 - 8, ink(0.9), 1.8); line(c, 240, 230, 240 - 2, 230 - 14, ink(0.9), 1.3);
      bgFrame(c, 8, 150, 38, 50, 2); bgFrame(c, 472, 150, 38, 50, 3);
      sFinish(c, 0.5, 0.5);
    } else if (theme === 'school_dining') {
      sWallpaper(c, th, false); sWainscot(c, th, 440);
      for (const wx of [120, 360]) { bgWindow(c, wx, 70, 70, 210, th, false, theme); sCurtain(c, wx - 40, 56, 230, -1, '#6b2e3e'); sCurtain(c, wx + 40, 56, 230, 1, '#6b2e3e'); line(c, wx - 60, 56, wx + 60, 56, '#8a6a3a', 3.4); ell(c, wx - 62, 56, 3, 3); fs(c, P.amberLight, 0.8, 0.5); ell(c, wx + 62, 56, 3, 3); fs(c, P.amberLight, 0.8, 0.5); }
      bgFrame(c, 240, 140, 74, 96, 7);
      // plate rail
      rr(c, 0, 312, BGW, 6, 2); fs(c, '#5a3a2e', 1, 0.55);
      for (let x = 20; x < BGW; x += 40) sPlate(c, x, 302, 13, x % 80 === 20 ? '#2d3a63' : '#8e4256');
      // chandelier silhouette
      line(c, 240, 0, 240, 14, 'rgba(120,100,70,0.5)', 1.5); c.beginPath(); c.moveTo(206, 26); c.quadraticCurveTo(240, 44, 274, 26); c.strokeStyle = 'rgba(138,106,58,0.6)'; c.lineWidth = 3.4; c.stroke();
      for (const fx of [-30, -15, 0, 15, 30]) { rr(c, 240 + fx - 1.5, 15, 3, 10, 1); c.fillStyle = 'rgba(239,230,208,0.55)'; c.fill(); ell(c, 240 + fx, 12, 1.6, 2.6); c.fillStyle = 'rgba(247,180,80,0.7)'; c.fill(); }
      glow(c, 240, 18, 80, 0.15, 'amber');
      sFinish(c, 0.5, 0.5);
    } else if (theme === 'school_library') {
      const g0 = c.createLinearGradient(0, 0, 0, BGH); g0.addColorStop(0, th.top); g0.addColorStop(1, th.bot); c.fillStyle = g0; c.fillRect(0, 0, BGW, BGH);
      for (let sh = 0; sh < 6; sh++) {
        const yb = 100 + sh * 64;
        c.fillStyle = '#150e0b'; c.fillRect(0, yb - 54, BGW, 54);
        bookRow(c, 0, BGW, yb, 11 + sh * 5);
        rr(c, -2, yb, BGW + 4, 6, 2); fs(c, '#6a4636', 1, 0.55);
      }
      rr(c, -2, 28, BGW + 4, 14, 3); fs(c, '#5a3a2e', 1.2, 0.6);
      // pilasters
      for (const px of [0, 160, 320, 480]) { rr(c, px - 8, 28, 16, 600 - 28, 3); fs(c, '#4a2f25', 1.3, 0.6); c.beginPath(); c.moveTo(px - 3, 50); c.lineTo(px - 3, BGH); c.moveTo(px + 3, 50); c.lineTo(px + 3, BGH); c.strokeStyle = 'rgba(255,225,200,0.1)'; c.lineWidth = 1; c.stroke(); }
      // round window
      ell(c, 240, 160, 44, 44); fs(c, '#4a2f25', 2, 0.6);
      ell(c, 240, 160, 36, 36); const gg = c.createLinearGradient(0, 124, 0, 196); gg.addColorStop(0, th.glass[0]); gg.addColorStop(1, th.glass[1]); c.fillStyle = gg; c.fill();
      ell(c, 252, 148, 9, 9); c.fillStyle = '#e8ecf6'; c.fill(); glow(c, 252, 148, 40, 0.5, 'moon');
      c.strokeStyle = '#2c2536'; c.lineWidth = 3; c.beginPath(); c.moveTo(240, 124); c.lineTo(240, 196); c.moveTo(204, 160); c.lineTo(276, 160); c.stroke();
      // brass ladder rail
      line(c, 0, 62, BGW, 62, '#8a6a3a', 3); c.strokeStyle = 'rgba(255,230,160,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 60.8); c.lineTo(BGW, 60.8); c.stroke();
      // warm dim
      c.fillStyle = 'rgba(14,8,10,0.30)'; c.fillRect(0, 0, BGW, BGH);
      sWainscot(c, { wain: '#2a1d16', trim: '#5a3d2c' }, 440);
      sFinish(c, 0.5, 0.55);
    } else if (theme === 'school_cellar') {
      sWallpaper(c, th, false); c.clearRect(0, 0, 0, 0);
      const gr = c.createLinearGradient(0, 0, 0, BGH); gr.addColorStop(0, th.top); gr.addColorStop(1, th.bot); c.fillStyle = gr; c.fillRect(0, 0, BGW, BGH);
      for (let r = 0; r < 24; r++) {
        const by = r * 26, off = (r % 2) * 24;
        for (let q = -1; q < 11; q++) {
          const bx = q * 48 + off, a = hh(r * 13 + q + 20, 5);
          c.fillStyle = 'rgba(150,170,200,' + (0.01 + a * 0.04) + ')'; c.fillRect(bx + 1, by + 1, 46, 24);
          c.strokeStyle = 'rgba(2,4,8,0.4)'; c.lineWidth = 1.2; c.strokeRect(bx + 0.5, by + 0.5, 48, 26);
          if (a < 0.08) { ell(c, bx + 24, by + 22, 11, 3.4); c.fillStyle = 'rgba(70,110,80,0.10)'; c.fill(); }
        }
      }
      // brick arches
      for (let i = 0; i < 2; i++) { const x0 = i * 240 + 22, x1 = i * 240 + 218; c.beginPath(); c.moveTo(x0, 330); c.lineTo(x0, 230); c.quadraticCurveTo((x0 + x1) / 2, 120, x1, 230); c.lineTo(x1, 330); c.strokeStyle = ink(0.6); c.lineWidth = 14; c.stroke(); c.strokeStyle = '#2a323d'; c.lineWidth = 11; c.stroke(); }
      // horizontal pipes with joints and drips
      const pipe = (y, w2, col) => { c.strokeStyle = ink(0.7); c.lineWidth = w2 + 3; c.lineCap = 'butt'; c.beginPath(); c.moveTo(0, y); c.lineTo(BGW, y); c.stroke(); c.strokeStyle = col; c.lineWidth = w2; c.stroke(); c.strokeStyle = 'rgba(200,215,235,0.22)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, y - w2 * 0.28); c.lineTo(BGW, y - w2 * 0.28); c.stroke(); for (const jx of [70, 190, 310, 420]) { rr(c, jx - 4, y - w2 / 2 - 2.5, 8, w2 + 5, 2); fs(c, '#3a4553', 0.9, 0.55); } };
      pipe(34, 12, '#4b5565'); pipe(66, 8, '#5c4a40');
      c.strokeStyle = ink(0.7); c.lineWidth = 11; c.beginPath(); c.moveTo(310, 34); c.lineTo(310, 250); c.quadraticCurveTo(310, 262, 322, 262); c.lineTo(BGW, 262); c.stroke(); c.strokeStyle = '#4b5565'; c.lineWidth = 8; c.stroke();
      c.strokeStyle = ink(0.7); c.lineWidth = 9; c.beginPath(); c.moveTo(60, 66); c.lineTo(60, 440); c.stroke(); c.strokeStyle = '#5c4a40'; c.lineWidth = 6; c.stroke();
      for (const [vx, vy] of [[60, 200], [310, 150]]) { ell(c, vx, vy, 9, 9); fs(c, '#6a2e2e', 1, 0.6); line(c, vx - 9, vy, vx + 9, vy, ink(0.6), 2); line(c, vx, vy - 9, vx, vy + 9, ink(0.6), 2); }
      // barred window with moonbeam
      c.save(); c.globalAlpha = 0.08; c.fillStyle = '#c9cfe0'; c.beginPath(); c.moveTo(166, 120); c.lineTo(226, 120); c.lineTo(260, 380); c.lineTo(120, 380); c.closePath(); c.fill(); c.restore();
      rr(c, 164, 92, 64, 32, 5); fs(c, '#2f3844', 2, 0.6); rr(c, 170, 98, 52, 20, 3); c.fillStyle = '#3a4a78'; c.fill();
      for (let i = 0; i < 4; i++) line(c, 179 + i * 13, 96, 179 + i * 13, 120, '#14181f', 2.4);
      // boiler glow, warm from the bottom right
      glow(c, 400, 420, 170, 0.5, 'amber'); glow(c, 400, 440, 90, 0.35, 'red');
      // crates silhouettes
      for (const [kx, ky, kw] of [[110, 440, 40], [150, 440, 30], [136, 410, 28]]) { rr(c, kx - kw / 2, ky - kw * 0.8, kw, kw * 0.8, 2); fs(c, '#251c1a', 1.1, 0.5); line(c, kx - kw / 2, ky - kw * 0.4, kx + kw / 2, ky - kw * 0.4, 'rgba(0,0,0,0.4)', 1); }
      cobwebCorner(c, 0, 0, 1, 1, 60, 0.22); cobwebCorner(c, 480, 0, -1, 1, 60, 0.22);
      c.fillStyle = 'rgba(8,14,26,0.18)'; c.fillRect(0, 0, BGW, BGH);
      sFinish(c, 0.6, 0.6);
    } else { // tower
      const gr = c.createLinearGradient(0, 0, 0, BGH); gr.addColorStop(0, th.top); gr.addColorStop(1, th.bot); c.fillStyle = gr; c.fillRect(0, 0, BGW, BGH);
      for (let r = 0; r < 16; r++) {
        const by = r * 38, off = (r % 2) * 40;
        for (let q = -1; q < 7; q++) {
          const bx = q * 80 + off, a = hh(r * 7 + q + 40, 9);
          c.fillStyle = 'rgba(170,175,205,' + (0.012 + a * 0.045) + ')'; c.fillRect(bx + 1, by + 1, 78, 36);
          c.strokeStyle = 'rgba(4,4,10,0.42)'; c.lineWidth = 1.4; c.strokeRect(bx + 0.5, by + 0.5, 80, 38);
          if (a > 0.85) { c.beginPath(); c.moveTo(bx + 20, by + 8); c.lineTo(bx + 26, by + 18); c.lineTo(bx + 22, by + 30); c.strokeStyle = 'rgba(4,4,10,0.35)'; c.lineWidth = 0.9; c.stroke(); }
        }
      }
      // arrow slits with moon rays
      for (const [sx, sy] of [[120, 170], [360, 330]]) {
        c.save(); c.globalAlpha = 0.10; c.fillStyle = '#c9cfe0'; c.beginPath(); c.moveTo(sx - 6, sy + 60); c.lineTo(sx + 6, sy + 60); c.lineTo(sx + 90, sy + 260); c.lineTo(sx - 70, sy + 260); c.closePath(); c.fill(); c.restore();
        archPath(c, sx - 14, sy - 6, 28, 76); fs(c, '#2c2d3a', 2.6, 0.65); archPath(c, sx - 8, sy, 16, 64); const g2 = c.createLinearGradient(0, sy, 0, sy + 64); g2.addColorStop(0, '#4a5a9a'); g2.addColorStop(1, '#1c2144'); c.fillStyle = g2; c.fill();
        ell(c, sx + 2, sy + 16, 3.4, 3.4); c.fillStyle = '#eef1fa'; c.fill();
      }
      // wooden beams across
      for (const by of [0, 236]) { rr(c, -2, by, BGW + 4, 20, 3); fs(c, '#4a2f25', 1.4, 0.6); for (let x = 20; x < BGW; x += 70) { ell(c, x, by + 10, 1.6, 1.6); c.fillStyle = '#c8a050'; c.fill(); } c.beginPath(); c.moveTo(0, by + 4); c.lineTo(BGW, by + 4); c.strokeStyle = 'rgba(255,225,200,0.15)'; c.lineWidth = 1; c.stroke(); }
      // hanging ropes with knots
      for (const rx of [212, 268, 440]) {
        c.strokeStyle = ink(0.55); c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(rx, 18); c.lineTo(rx, BGH); c.stroke(); c.strokeStyle = '#a58a62'; c.lineWidth = 4.4; c.stroke();
        c.strokeStyle = 'rgba(70,50,30,0.5)'; c.lineWidth = 1; for (let y = 18; y < BGH; y += 6) { c.beginPath(); c.moveTo(rx - 2, y); c.lineTo(rx + 2, y + 3); c.stroke(); }
        for (const ky of [150, 300, 440]) { ell(c, rx, ky + hh(rx, ky) * 20, 5.6, 4); fs(c, '#a58a62', 1, 0.55); }
      }
      // cobwebs + cold tint
      cobwebCorner(c, 0, 20, 1, 1, 56, 0.2); cobwebCorner(c, 480, 20, -1, 1, 56, 0.2);
      c.fillStyle = 'rgba(50,70,130,0.08)'; c.fillRect(0, 0, BGW, BGH);
      sFinish(c, 0.6, 0.55);
    }
    return s;
  }
  function schoolClockHands(c, off, dy, t) { // live hands for the aula's big clock
    const [cx, cy, r] = CLOCK_C;
    const mn = 11.97 / 12 * TAU + t * 0.003, hr = 11.97 / 12 * TAU - PI / 2 * 0, sec = Math.floor(t * 2) / 2 * (TAU / 60) + 0.05 * Math.max(0, 1 - ((t * 2) % 1) * 6) * 0;
    for (let x = off; x < VW; x += BGW) {
      const X = Math.round(x) + cx, Y = dy + cy;
      if (X < -r - 20 || X > VW + r + 20) continue;
      const hand = (a, L, w, col) => { c.beginPath(); c.moveTo(X - cos(a - PI / 2) * 5, Y - sin(a - PI / 2) * 5); c.lineTo(X + cos(a - PI / 2) * L, Y + sin(a - PI / 2) * L); c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.stroke(); };
      hand(hr, r * 0.5, 4, ink(0.9)); hand(mn, r * 0.78, 3, ink(0.9)); hand(sec, r * 0.84, 1.2, '#8e2a3a');
      ell(c, X, Y, 3.4, 3.4); c.fillStyle = '#a07a3a'; c.fill();
    }
  }

  // ---- school deco kinds (c already translated to x,y = bottom centre unless noted)
  const SW = { dark: '#3f281f', mid: '#5a3b2e', light: '#7a5240', pale: '#9a6c4c', brass: '#c8a050', brassD: '#8a6a3a' };
  function chalk(c) { c.strokeStyle = 'rgba(238,236,224,0.78)'; c.lineWidth = 1.5; c.lineCap = 'round'; c.lineJoin = 'round'; }
  function glassRect(c, x, y, w, h, r) { rr(c, x, y, w, h, r); fs(c, 'rgba(180,205,225,0.13)', 1.1, 0.5); c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 3, y + h - 4); c.lineTo(x + 3, y + 5); c.stroke(); }
  function schoolDeco(c, k, t, o) {
    const W2 = (o && o.w) || 0;
    switch (k) {
      case 'desk': {
        c.fillStyle = 'rgba(10,6,16,0.25)'; ell(c, 0, 1, 28, 3); c.fill();
        // bench seat + legs
        for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 19 - 2, -34); c.lineTo(s * 19 + 2, -34); c.lineTo(s * 17 + 3, -4); c.quadraticCurveTo(s * 17 + 4, 0, s * 17 + 8 * s, 0); c.lineTo(s * 17 - 3, 0); c.closePath(); fs(c, '#2c2230', 1, 0.6); }
        rr(c, -22, -17, 44, 4, 2); fs(c, SW.mid, 1, 0.55);
        // slanted lid
        c.beginPath(); c.moveTo(-23, -30); c.lineTo(23, -37); c.lineTo(25, -33); c.lineTo(-23, -26); c.closePath(); fs(c, SW.pale, 1.2, 0.6);
        c.beginPath(); c.moveTo(-21, -29.4); c.lineTo(22, -35.6); c.strokeStyle = 'rgba(255,238,215,0.45)'; c.lineWidth = 1; c.stroke();
        rr(c, -21, -26, 44, 6, 2); fs(c, SW.light, 1, 0.55);
        // inkwell, book, pencil, carved heart
        ell(c, 14, -37.2, 2.6, 1.6); fs(c, '#17131e', 0.7, 0.6); ell(c, 14, -37.6, 1.2, 0.8); c.fillStyle = '#2d3a63'; c.fill();
        c.save(); c.translate(-8, -33); c.rotate(-0.12); rr(c, -9, -4, 18, 5, 1); fs(c, '#6b2e3e', 0.8, 0.5); line(c, -8, -3, 8, -3, 'rgba(243,200,115,0.5)', 0.8); c.restore();
        line(c, 2, -33, 9, -34.6, '#d4ad5a', 1.6); c.beginPath(); c.arc(-15, -31, 1.6, PI, 0); c.arc(-12, -31, 1.6, PI, 0); c.lineTo(-13.5, -28.6); c.closePath(); c.fillStyle = 'rgba(20,10,8,0.5)'; c.fill();
        break;
      }
      case 'blackboard': {
        rr(c, -77, -104, 154, 88, 5); fs(c, SW.light, 1.6, 0.65);
        rr(c, -70, -97, 140, 74, 3); fs(c, '#1b2924', 1.2, 0.7);
        c.fillStyle = 'rgba(220,225,215,0.05)'; ell(c, -20, -60, 44, 22, -0.2); c.fill(); ell(c, 30, -48, 30, 14, 0.3); c.fill();
        chalk(c);
        c.font = 'italic 17px ' + FONT; c.fillStyle = 'rgba(238,236,224,0.82)'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
        c.fillText('2 + 2 = 5', -62, -74);
        c.beginPath(); c.moveTo(-62, -69); c.quadraticCurveTo(-40, -66, -16, -70); c.stroke();
        // graph
        c.beginPath(); c.moveTo(-60, -34); c.lineTo(-60, -60); c.moveTo(-60, -34); c.lineTo(-28, -34); c.stroke();
        c.beginPath(); c.moveTo(-58, -36); c.quadraticCurveTo(-48, -56, -40, -42); c.quadraticCurveTo(-34, -32, -28, -52); c.lineWidth = 1.1; c.stroke(); c.lineWidth = 1.5;
        // spider
        ell(c, 40, -58, 4.6, 3.6); c.stroke(); ell(c, 40, -63, 2.6, 2.4); c.stroke();
        for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { c.beginPath(); c.moveTo(40 + s * 3, -59 + i * 1.2); c.quadraticCurveTo(40 + s * 11, -66 + i * 4, 40 + s * (13 + i), -56 + i * 3.6); c.stroke(); }
        c.beginPath(); c.arc(38.6, -63, 0.4, 0, TAU); c.arc(41.4, -63, 0.4, 0, TAU); c.stroke();
        c.font = 'italic 11px ' + FONT; c.fillText('Silence!', 8, -34);
        // ledge with chalk and eraser
        rr(c, -77, -17, 154, 5, 2); fs(c, SW.mid, 1, 0.55);
        rr(c, -50, -21, 7, 4, 1); c.fillStyle = '#efe6d0'; c.fill(); rr(c, -40, -20.4, 5, 3.4, 1); c.fill(); rr(c, 20, -22.4, 16, 5.4, 1.4); fs(c, '#6b2e3e', 0.8, 0.5); rr(c, 20, -22.4, 16, 2.4, 1); c.fillStyle = '#c9c0a8'; c.fill();
        break;
      }
      case 'lockers': {
        c.fillStyle = 'rgba(10,6,16,0.25)'; ell(c, 0, 1, 56, 3); c.fill();
        for (let i = 0; i < 3; i++) {
          const x0 = -54 + i * 36, open = i === 2;
          rr(c, x0, -106, 36, 104, 2); fs(c, i % 2 ? '#3d5a5a' : '#46636a', 1.3, 0.65);
          if (open) { c.beginPath(); c.moveTo(x0 + 2, -104); c.lineTo(x0 + 34, -104); c.lineTo(x0 + 34, -4); c.lineTo(x0 + 2, -4); c.closePath(); c.fillStyle = '#0d0a10'; c.fill(); }
          else {
            rr(c, x0 + 4, -98, 28, 7, 2); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill(); for (let j = 0; j < 3; j++) line(c, x0 + 7, -96.4 + j * 2.2, x0 + 29, -96.4 + j * 2.2, 'rgba(180,210,215,0.3)', 0.9);
            rr(c, x0 + 4, -22, 28, 5, 2); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill();
            rr(c, x0 + 26, -64, 4, 11, 2); fs(c, '#d4ad5a', 0.7, 0.5);
            c.beginPath(); c.moveTo(x0 + 3, -104); c.lineTo(x0 + 3, -5); c.strokeStyle = 'rgba(255,255,255,0.16)'; c.lineWidth = 1.2; c.stroke();
          }
        }
        // open door swung out + a sock peeking out of locker 2, a name tag
        c.beginPath(); c.moveTo(18, -104); c.lineTo(36, -100); c.lineTo(36, -8); c.lineTo(18, -4); c.closePath(); fs(c, '#3a5258', 1.2, 0.6);
        c.beginPath(); c.moveTo(-14, -52); c.quadraticCurveTo(-11, -44, -13, -38); c.quadraticCurveTo(-8, -35, -9, -42); c.quadraticCurveTo(-8, -48, -10, -52); c.closePath(); fs(c, '#8e4256', 0.8, 0.5);
        rr(c, -52, -78, 12, 7, 1); fs(c, '#efe6d0', 0.6, 0.4);
        break;
      }
      case 'bookshelf_tall': {
        const w = 76, h = 152;
        rr(c, -w / 2, -h, w, h, 4); fs(c, SW.dark, 1.6, 0.66);
        rr(c, -w / 2 - 3, -h - 6, w + 6, 8, 3); fs(c, SW.light, 1.3, 0.6);
        for (let i = 0; i < 5; i++) {
          const yb = -h + 36 + i * 29;
          c.fillStyle = '#150e0b'; c.fillRect(-w / 2 + 4, yb - 26, w - 8, 26);
          bookRow(c, -w / 2 + 6, w / 2 - 6, yb, 5 + i * 9);
          rr(c, -w / 2 + 2, yb, w - 4, 4, 1.5); fs(c, SW.mid, 0.9, 0.55);
        }
        cobwebCorner(c, -w / 2 + 3, -h + 2, 1, 1, 22, 0.35);
        break;
      }
      case 'rolling_ladder': {
        const a = sin(t * 0.5) * 0.0;
        // rail at the top
        line(c, -34, -128, 34, -128, SW.brassD, 3.4); line(c, -34, -128, 34, -128, 'rgba(255,230,160,0.4)', 1);
        ell(c, -30, -128, 3.6, 3.6); fs(c, '#4a4a56', 0.9, 0.55); ell(c, 30, -128, 3.6, 3.6); fs(c, '#4a4a56', 0.9, 0.55);
        // ladder leaning out slightly
        const x0 = -10, x1 = 8;
        for (const rx of [-1, 1]) { c.beginPath(); c.moveTo(rx * 11 - 4 + 6, -126); c.lineTo(rx * 11 - 4 - 1, 0); c.strokeStyle = ink(0.55); c.lineWidth = 6; c.lineCap = 'round'; c.stroke(); c.strokeStyle = '#9a6c4c'; c.lineWidth = 4.2; c.stroke(); }
        for (let i = 0; i < 8; i++) { const u = i / 7, yy = -116 + u * 108, wx = 11 - 3 * (1 - u) * 0 - 0.8 * (1 - u); rr(c, -wx - 6 + (1 - u) * 5.4, yy - 1.8, wx * 2 + 1, 3.6, 1.8); fs(c, '#b78358', 0.9, 0.55); }
        for (const s of [-1, 1]) { ell(c, s * 11 - 5, -1, 3, 3); fs(c, '#2c2230', 0.8, 0.6); }
        break;
      }
      case 'piano': {
        c.fillStyle = 'rgba(10,6,16,0.28)'; ell(c, 0, 1, 56, 3.4); c.fill();
        rr(c, -52, -74, 104, 70, 5); fs(c, '#1d1824', 1.6, 0.7);
        c.beginPath(); c.moveTo(-48, -72); c.quadraticCurveTo(0, -77, 48, -72); c.strokeStyle = 'rgba(201,207,224,0.4)'; c.lineWidth = 1.6; c.stroke();
        rr(c, -42, -60, 84, 20, 3); fs(c, '#2c2736', 1, 0.6);
        // sheet music & candle
        rr(c, -12, -70, 22, 14, 1); fs(c, '#efe6d0', 0.7, 0.45); for (let i = 0; i < 3; i++) line(c, -9, -66 + i * 3.4, 7, -66 + i * 3.4, 'rgba(20,16,24,0.5)', 0.6);
        for (const [dx, dy] of [[-4, -65], [1, -62.4], [-1, -60]]) { ell(c, -10 + dx + 8, dy, 0.8, 0.8); c.fillStyle = ink(0.8); c.fill(); }
        rr(c, 30, -80, 5, 10, 1.2); fs(c, P.cream, 0.7, 0.5); flame(c, 32.5, -80, 1.1, t, 1); glow(c, 32.5, -84, 26, 0.3 + 0.04 * sin(t * 9), 'amber');
        // keys
        rr(c, -43, -41, 86, 9, 2); fs(c, '#efe6d0', 1, 0.6);
        for (let i = 1; i < 14; i++) line(c, -43 + i * 86 / 14, -41, -43 + i * 86 / 14, -32, ink(0.5), 0.7);
        for (const i of [1, 2, 4, 5, 6, 8, 9, 11, 12]) rr(c, -43 + i * 86 / 14 - 2.6, -41, 5, 5.6, 1), c.fillStyle = '#17131e', c.fill();
        rr(c, -48, -32, 96, 5, 2); fs(c, '#2c2736', 0.9, 0.55);
        // pedals + legs
        for (const s of [-1, 1]) { rr(c, s * 42 - 4, -27, 8, 24, 2); fs(c, '#1d1824', 1, 0.6); }
        ell(c, -5, -4, 3, 2); fs(c, '#a07a3a', 0.6, 0.5); ell(c, 5, -4, 3, 2); fs(c, '#a07a3a', 0.6, 0.5);
        break;
      }
      case 'skeleton_model': {
        c.fillStyle = 'rgba(10,6,16,0.25)'; ell(c, 0, 1, 24, 3); c.fill();
        // stand
        for (const s of [-1, 1]) { line(c, 0, -10, s * 20, -3, '#3a3340', 3.2); ell(c, s * 20, -1.8, 2.6, 2.6); fs(c, '#2c2230', 0.8, 0.6); }
        line(c, 0, -10, 0, -90, '#3a3340', 2.6); c.beginPath(); c.moveTo(0, -90); c.quadraticCurveTo(0, -104, 12, -102); c.strokeStyle = '#3a3340'; c.lineWidth = 2.6; c.stroke();
        const sw = sin(t * 1.3) * 1.6;
        c.save(); c.translate(0, -2);
        // legs
        for (const s of [-1, 1]) { bone(c, s * 5, -50, s * 6 + sw * 0.2, -26, 2.8); bone(c, s * 6 + sw * 0.2, -26, s * 6, -6, 2.4); ell(c, s * 8, -4, 4.4, 2.2); fs(c, BONE, 0.8, 0.5); }
        ell(c, 0, -52, 8, 4.2); fs(c, BONE, 1, 0.6);
        limb(c, 0, -52, 0, -76, 2.6, BONE, null);
        c.beginPath(); c.moveTo(-9, -80); c.quadraticCurveTo(-10, -66, -4, -58); c.quadraticCurveTo(0, -56, 4, -58); c.quadraticCurveTo(10, -66, 9, -80); c.quadraticCurveTo(0, -84, -9, -80); c.closePath(); c.fillStyle = '#231b2b'; c.fill(); c.strokeStyle = ink(0.5); c.lineWidth = 1; c.stroke();
        for (let i = 0; i < 4; i++) { const ry = -76 + i * 4.6, rw = 8.4 - i * 0.8; c.beginPath(); c.moveTo(-rw, ry - 1.5); c.quadraticCurveTo(0, ry + 3.5, rw, ry - 1.5); c.strokeStyle = ink(0.55); c.lineWidth = 3.2; c.stroke(); c.strokeStyle = BONE; c.lineWidth = 1.9; c.stroke(); }
        // arms: one holding a pointer, other waving
        bone(c, -9, -80, -17, -66, 2.4); bone(c, -17, -66, -19, -52, 2.2);
        bone(c, 9, -80, 18, -72, 2.4); bone(c, 18, -72, 24 + sw, -86 - sw * 0.6, 2.2);
        line(c, -19, -52, -34, -84, '#a07a3a', 1.4);
        // head with school cap & little glasses
        skull(c, 0, -92, 9.4, { look: 1, rot: sw * 0.02 });
        c.beginPath(); c.moveTo(-10, -98); c.quadraticCurveTo(0, -112, 10, -98); c.lineTo(10, -96); c.lineTo(-10, -96); c.closePath(); fs(c, P.bordeaux, 1, 0.55); rr(c, 4, -97, 11, 3, 1.5); fs(c, '#4a1d2a', 0.8, 0.5);
        for (const s of [-1, 1]) { ell(c, s * 3.9 + 0.8, -92, 3.4, 3.4); c.strokeStyle = '#8a6a3a'; c.lineWidth = 0.9; c.stroke(); } line(c, -0.4, -92, 1.6, -92, '#8a6a3a', 0.9);
        c.restore();
        break;
      }
      case 'flasks_shelf': {
        const w = 98, h = 108;
        rr(c, -w / 2, -h, w, h, 4); fs(c, '#2c2f3c', 1.6, 0.66);
        for (let i = 0; i < 3; i++) {
          const yb = -h + 36 + i * 34;
          c.fillStyle = '#0f111a'; c.fillRect(-w / 2 + 4, yb - 31, w - 8, 31);
          const cols = [['rgba(155,211,90,0.9)', 'green'], ['rgba(110,170,220,0.9)', 'blue'], ['rgba(200,110,150,0.9)', 'red'], ['rgba(243,200,115,0.9)', 'amber']];
          for (let j = 0; j < 4; j++) {
            const fx = -w / 2 + 16 + j * 22, cc = cols[(i + j) % 4], fh = 17 + (j % 2) * 4, bw = 6.4 + ((i + j) % 3);
            c.beginPath(); c.moveTo(fx - 2.4, yb - fh - 7); c.lineTo(fx - 2.4, yb - fh); c.bezierCurveTo(fx - bw - 1, yb - fh * 0.6, fx - bw, yb - 0.5, fx, yb - 0.5); c.bezierCurveTo(fx + bw, yb - 0.5, fx + bw + 1, yb - fh * 0.6, fx + 2.4, yb - fh); c.lineTo(fx + 2.4, yb - fh - 7); c.closePath(); fs(c, 'rgba(201,207,224,0.22)', 1, 0.55);
            c.beginPath(); c.moveTo(fx - bw + 1, yb - fh * 0.42); c.quadraticCurveTo(fx, yb - fh * 0.5 + sin(t * 2 + i * 3 + j) * 0.8, fx + bw - 1, yb - fh * 0.42); c.bezierCurveTo(fx + bw, yb - 0.8, fx - bw, yb - 0.8, fx - bw + 1, yb - fh * 0.42); c.fillStyle = cc[0]; c.fill();
            const bp = (t * 0.6 + j * 0.27 + i * 0.13) % 1; c.beginPath(); c.arc(fx + sin(bp * 8 + j) * 1.6, yb - fh * 0.5 - bp * (fh * 0.5), 1, 0, TAU); c.strokeStyle = 'rgba(230,255,200,0.75)'; c.lineWidth = 0.7; c.stroke();
          }
          rr(c, -w / 2 + 2, yb, w - 4, 4, 1.5); fs(c, '#3f4553', 0.9, 0.55);
        }
        glow(c, 0, -60, 70, 0.14, 'green');
        // skull label
        ell(c, 0, -h - 6, 5.4, 4.6); fs(c, '#e8e0d0', 0.8, 0.5); ell(c, -1.7, -h - 6.4, 1.1, 1.3); c.fillStyle = ink(0.8); c.fill(); ell(c, 1.7, -h - 6.4, 1.1, 1.3); c.fill();
        break;
      }
      case 'long_table': {
        const w = W2 || 216, hw = w / 2;
        c.fillStyle = 'rgba(10,6,16,0.3)'; ell(c, 0, 1, hw + 6, 3.4); c.fill();
        for (const s of [-1, 1]) { rr(c, s * (hw - 14) - 5, -28, 10, 27, 3); fs(c, SW.dark, 1.1, 0.6); }
        rr(c, -hw, -38, w, 7, 3); fs(c, SW.light, 1.3, 0.62);
        // tablecloth with scalloped hem
        c.beginPath(); c.moveTo(-hw + 4, -40); c.lineTo(hw - 4, -40); c.lineTo(hw - 4, -24); const n = Math.round(w / 18); for (let i = 0; i < n; i++) { const xa = hw - 4 - i * (w - 8) / n, xb = hw - 4 - (i + 1) * (w - 8) / n; c.quadraticCurveTo((xa + xb) / 2, -17, xb, -24); } c.closePath(); fs(c, '#e8e0d4', 1.2, 0.5);
        c.beginPath(); c.moveTo(-hw + 4, -24); for (let i = 0; i < n; i++) { const xa = -hw + 4 + i * (w - 8) / n, xb = -hw + 4 + (i + 1) * (w - 8) / n; c.quadraticCurveTo((xa + xb) / 2, -17, xb, -24); } c.strokeStyle = P.bordeauxLight; c.lineWidth = 1.2; c.stroke();
        rr(c, -hw + 4, -43, w - 8, 5, 2.5); fs(c, '#f4eee4', 1, 0.45);
        for (let i = 0; i < Math.round(w / 12); i++) { const x = -hw + 10 + i * 12; if (i % 3 === 0) continue; ell(c, x, -42.4, 4.6, 1.6); c.fillStyle = '#dcd6cb'; c.fill(); ell(c, x, -43, 3, 1); c.strokeStyle = 'rgba(80,90,120,0.5)'; c.lineWidth = 0.7; c.stroke(); }
        // candelabras + goblets + a covered dish
        for (const cx of [-w * 0.3, w * 0.3]) { rr(c, cx - 1.6, -62, 3.2, 20, 1.4); fs(c, SW.brass, 0.8, 0.5); ell(c, cx, -43, 6, 1.8); fs(c, SW.brassD, 0.7, 0.5); for (const dx of [-7, 0, 7]) { rr(c, cx + dx - 1.4, -72 + (dx ? 4 : 0), 2.8, 9, 1); fs(c, P.cream, 0.6, 0.45); flame(c, cx + dx, -72 + (dx ? 4 : 0), 0.8, t, dx + cx); } glow(c, cx, -72, 36, 0.3 + 0.04 * sin(t * 9 + cx), 'amber'); }
        c.beginPath(); c.arc(0, -44, 11, PI, 0); c.closePath(); fs(c, '#a9b0c0', 1, 0.55); ell(c, 0, -56, 2, 2); fs(c, '#a9b0c0', 0.6, 0.5);
        for (const gx of [-w * 0.15, w * 0.12, -w * 0.42, w * 0.42]) { c.beginPath(); c.moveTo(gx - 3.4, -56); c.lineTo(gx + 3.4, -56); c.quadraticCurveTo(gx + 3, -48, gx + 0.6, -47); c.lineTo(gx + 0.6, -44); c.lineTo(gx - 0.6, -44); c.lineTo(gx - 0.6, -47); c.quadraticCurveTo(gx - 3, -48, gx - 3.4, -56); c.closePath(); fs(c, 'rgba(201,207,224,0.3)', 0.8, 0.5); }
        break;
      }
      case 'benches': {
        const w = W2 || 216, hw = w / 2;
        c.fillStyle = 'rgba(10,6,16,0.25)'; ell(c, 0, 1, hw + 4, 3); c.fill();
        for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * (hw - 18) - 4, -19); c.lineTo(s * (hw - 18) + 4, -19); c.lineTo(s * (hw - 18) + 6, 0); c.lineTo(s * (hw - 18) - 6, 0); c.closePath(); fs(c, SW.dark, 1, 0.6); }
        rr(c, -hw, -24, w, 7, 3); fs(c, SW.pale, 1.2, 0.62); c.beginPath(); c.moveTo(-hw + 3, -21.6); c.lineTo(hw - 3, -21.6); c.strokeStyle = 'rgba(255,238,215,0.4)'; c.lineWidth = 1; c.stroke();
        for (let x = -hw + 30; x < hw - 20; x += 46) { c.beginPath(); c.moveTo(x, -24); c.lineTo(x + 0.6, -17); c.strokeStyle = 'rgba(25,12,8,0.5)'; c.lineWidth = 0.9; c.stroke(); }
        break;
      }
      case 'boiler': {
        c.fillStyle = 'rgba(10,6,16,0.3)'; ell(c, 0, 1, 50, 3.4); c.fill();
        glow(c, 0, -34, 100, 0.28 + 0.05 * sin(t * 7), 'amber');
        for (const s of [-1, 1]) { rr(c, s * 34 - 6, -14, 12, 14, 2); fs(c, '#2c2f3c', 1, 0.6); }
        rr(c, -40, -86, 80, 76, 14); fs(c, '#4a4256', 1.6, 0.68);
        c.beginPath(); c.moveTo(-38, -60); c.quadraticCurveTo(0, -56, 38, -60); c.moveTo(-38, -36); c.quadraticCurveTo(0, -32, 38, -36); c.strokeStyle = 'rgba(15,10,22,0.5)'; c.lineWidth = 3; c.stroke();
        c.beginPath(); c.moveTo(-36, -80); c.quadraticCurveTo(-30, -84, -10, -84); c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 3; c.stroke();
        for (let i = 0; i < 6; i++) { ell(c, -34 + i * 13.6, -60, 1.3, 1.3); c.fillStyle = '#8a8aa0'; c.fill(); ell(c, -34 + i * 13.6, -36, 1.3, 1.3); c.fill(); }
        // fire door
        c.beginPath(); c.arc(0, -26, 15, PI, 0); c.lineTo(15, -10); c.lineTo(-15, -10); c.closePath(); fs(c, '#17131e', 1.4, 0.7);
        c.save(); c.beginPath(); c.arc(0, -26, 12, PI, 0); c.lineTo(12, -12); c.lineTo(-12, -12); c.closePath(); c.clip();
        const fg = c.createRadialGradient(0, -14, 1, 0, -18, 16); fg.addColorStop(0, '#fff2b0'); fg.addColorStop(0.4, '#f3a03a'); fg.addColorStop(1, '#7a2a1a'); c.fillStyle = fg; c.fillRect(-14, -42, 28, 32);
        for (let i = 0; i < 3; i++) flame(c, -7 + i * 7, -11, 1.7 + (i % 2) * 0.5, t, i * 2.1);
        c.restore();
        line(c, -12, -22, 12, -22, ink(0.8), 1.6); rr(c, 11, -26, 3.4, 8, 1.4); fs(c, SW.brass, 0.7, 0.5);
        // gauge & chimney pipe
        ell(c, 0, -68, 8, 8); fs(c, '#efe6d0', 1.2, 0.6); ell(c, 0, -68, 8, 8); c.strokeStyle = SW.brassD; c.lineWidth = 2; c.stroke(); line(c, 0, -68, 4 + sin(t * 1.4) * 1.4, -72, ink(0.85), 1.1); ell(c, 0, -68, 1, 1); c.fillStyle = ink(0.9); c.fill();
        rr(c, -8, -108, 16, 24, 3); fs(c, '#3a3340', 1.2, 0.62); rr(c, -11, -112, 22, 6, 2); fs(c, '#4a4256', 1, 0.6);
        for (let i = 0; i < 4; i++) { const u = ((t * 0.35 + i / 4) % 1); c.beginPath(); c.arc(sin(u * 5 + i) * 3, -114 - u * 30, 3 + u * 6, 0, TAU); c.fillStyle = 'rgba(200,205,220,' + (0.28 * (1 - u)).toFixed(2) + ')'; c.fill(); }
        break;
      }
      case 'pipes': {
        const w = W2 || 108, hw = w / 2;
        for (const [py, pw, col] of [[-66, 9, '#4b5565'], [-52, 6, '#5c4a40']]) { c.strokeStyle = ink(0.65); c.lineWidth = pw + 3; c.lineCap = 'butt'; c.beginPath(); c.moveTo(-hw, py); c.lineTo(hw, py); c.stroke(); c.strokeStyle = col; c.lineWidth = pw; c.stroke(); c.strokeStyle = 'rgba(200,215,235,0.25)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-hw, py - pw * 0.28); c.lineTo(hw, py - pw * 0.28); c.stroke(); for (let jx = -hw + 16; jx < hw; jx += 34) { rr(c, jx - 3.5, py - pw / 2 - 2.2, 7, pw + 4.4, 2); fs(c, '#3a4553', 0.8, 0.55); } }
        // vertical pipe to the floor with valve
        const vx = -hw + 22;
        c.strokeStyle = ink(0.65); c.lineWidth = 11; c.beginPath(); c.moveTo(vx, -66); c.lineTo(vx, 0); c.stroke(); c.strokeStyle = '#4b5565'; c.lineWidth = 8; c.stroke(); c.strokeStyle = 'rgba(200,215,235,0.25)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(vx - 2.2, -64); c.lineTo(vx - 2.2, 0); c.stroke();
        rr(c, vx - 8, -4, 16, 5, 2); fs(c, '#3a4553', 0.9, 0.55); ell(c, vx, -34, 8, 8); fs(c, '#6a2e2e', 1, 0.6); line(c, vx - 8, -34, vx + 8, -34, ink(0.6), 2); line(c, vx, -42, vx, -26, ink(0.6), 2);
        // drips
        const dp = (t * 0.9) % 1; c.beginPath(); c.moveTo(hw - 24, -48); c.quadraticCurveTo(hw - 22, -43 + dp * 40, hw - 24, -40 + dp * 40); c.quadraticCurveTo(hw - 26, -43 + dp * 40, hw - 24, -48 + dp * 0); c.fillStyle = 'rgba(160,200,230,' + (0.7 * (1 - dp * 0.6)).toFixed(2) + ')'; c.fill();
        ell(c, hw - 24, -1, 6 + dp * 2, 1.6); c.fillStyle = 'rgba(120,160,200,0.2)'; c.fill();
        break;
      }
      case 'bell': { // x,y = bottom centre of the bell's lip; rope hangs below it
        const sw = sin(t * 0.9) * 0.035;
        // yoke beam fixed
        rr(c, -50, -156, 100, 12, 3); fs(c, SW.dark, 1.3, 0.62); for (const s of [-1, 1]) { rr(c, s * 44 - 4, -150, 8, 52, 2); fs(c, SW.mid, 1, 0.55); }
        c.save(); c.translate(0, -140); c.rotate(sw);
        rr(c, -34, -4, 68, 8, 3); fs(c, SW.mid, 1.2, 0.6); line(c, -20, 4, -16, 18, '#2c2f3c', 3); line(c, 20, 4, 16, 18, '#2c2f3c', 3);
        // bell body
        c.beginPath(); c.moveTo(-11, 16); c.bezierCurveTo(-13, 38, -22, 60, -34, 134); c.quadraticCurveTo(0, 146, 34, 134); c.bezierCurveTo(22, 60, 13, 38, 11, 16); c.quadraticCurveTo(0, 10, -11, 16); c.closePath(); fs(c, '#a37a36', 1.6, 0.66);
        c.beginPath(); c.moveTo(-8, 34); c.bezierCurveTo(-12, 60, -20, 90, -28, 124); c.strokeStyle = 'rgba(255,240,180,0.4)'; c.lineWidth = 3; c.stroke();
        c.beginPath(); c.moveTo(-24, 100); c.quadraticCurveTo(0, 108, 24, 100); c.moveTo(-30, 120); c.quadraticCurveTo(0, 130, 30, 120); c.strokeStyle = 'rgba(70,45,15,0.5)'; c.lineWidth = 1.6; c.stroke();
        c.beginPath(); c.moveTo(-34, 134); c.quadraticCurveTo(0, 146, 34, 134); c.lineTo(36, 138); c.quadraticCurveTo(0, 152, -36, 138); c.closePath(); fs(c, '#8a6a2a', 1.2, 0.6);
        ell(c, 0, 144, 5, 5); fs(c, '#3a3340', 0.9, 0.6);
        c.restore();
        // rope
        c.beginPath(); c.moveTo(0, 6 - 0); c.quadraticCurveTo(sin(t * 0.9 + 1) * 3, 34, 2, 62); c.strokeStyle = ink(0.55); c.lineWidth = 5; c.lineCap = 'round'; c.stroke(); c.strokeStyle = '#a58a62'; c.lineWidth = 3.4; c.stroke(); ell(c, 2, 64, 4.6, 3.2); fs(c, '#a58a62', 0.9, 0.55);
        break;
      }
      case 'clock': {
        if (!(o && o.wall)) return false;
        ell(c, 0, -22, 22, 22); fs(c, '#4a3126', 2, 0.6); ell(c, 0, -22, 18.5, 18.5); fs(c, P.cream, 1.2, 0.6);
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; line(c, cos(a) * 14, -22 + sin(a) * 14, cos(a) * 17, -22 + sin(a) * 17, ink(0.7), 1.2); }
        const ha = t * 0.1 - 1.2; line(c, 0, -22, cos(ha) * 9, -22 + sin(ha) * 9, ink(0.9), 1.8); line(c, 0, -22, cos(ha * 12) * 14, -22 + sin(ha * 12) * 14, ink(0.9), 1.2);
        break;
      }
      case 'trophy_case': {
        const w = 84, h = 92;
        c.fillStyle = 'rgba(10,6,16,0.25)'; ell(c, 0, 1, 46, 3); c.fill();
        for (const s of [-1, 1]) { rr(c, s * 34 - 4, -20, 8, 20, 2); fs(c, SW.dark, 1, 0.6); }
        rr(c, -w / 2, -h, w, h - 16, 4); fs(c, SW.mid, 1.6, 0.66);
        rr(c, -w / 2 + 5, -h + 5, w - 10, h - 26, 2); fs(c, '#0f0b12', 1, 0.6);
        for (let i = 0; i < 2; i++) { const yb = -h + 36 + i * 28; rr(c, -w / 2 + 5, yb, w - 10, 3.4, 1); fs(c, SW.light, 0.8, 0.5); }
        // cups, medals, tiny crow
        const cup = (cx, yb, s) => { c.beginPath(); c.moveTo(cx - 6 * s, yb - 16 * s); c.quadraticCurveTo(cx - 6 * s, yb - 8 * s, cx - 1 * s, yb - 7 * s); c.lineTo(cx - 1 * s, yb - 3 * s); c.lineTo(cx - 4 * s, yb - 3 * s); c.lineTo(cx - 4 * s, yb); c.lineTo(cx + 4 * s, yb); c.lineTo(cx + 4 * s, yb - 3 * s); c.lineTo(cx + 1 * s, yb - 3 * s); c.lineTo(cx + 1 * s, yb - 7 * s); c.quadraticCurveTo(cx + 6 * s, yb - 8 * s, cx + 6 * s, yb - 16 * s); c.closePath(); fs(c, '#d4ad5a', 0.9, 0.55); c.beginPath(); c.arc(cx - 6.4 * s, yb - 12 * s, 3 * s, PI / 2, PI * 1.5); c.moveTo(cx + 6.4 * s, yb - 9 * s); c.arc(cx + 6.4 * s, yb - 12 * s, 3 * s, -PI / 2, PI / 2); c.strokeStyle = '#d4ad5a'; c.lineWidth = 1.2; c.stroke(); };
        cup(-18, -h + 36, 1); cup(14, -h + 36, 1.3); cup(-8, -h + 64, 1.1);
        for (let i = 0; i < 3; i++) { line(c, 16 + i * 8, -h + 44, 16 + i * 8, -h + 50, ['#8e4256', '#2d3a63', '#5e7d4a'][i], 3); ell(c, 16 + i * 8, -h + 53, 2.6, 2.6); fs(c, '#d4ad5a', 0.6, 0.5); }
        ell(c, 24, -h + 60, 5, 3.2); c.fillStyle = '#17131e'; c.fill(); ell(c, 28.4, -h + 57.6, 2.6, 2.4); c.fill(); ell(c, 21, -h + 58, 2.4, 2.2); c.fill();
        c.beginPath(); c.moveTo(-w / 2 + 6, -h + 6); c.lineTo(-w / 2 + 6, -h + 50); c.strokeStyle = 'rgba(255,255,255,0.16)'; c.lineWidth = 1.4; c.stroke();
        glow(c, 0, -52, 60, 0.07, 'amber');
        break;
      }
      case 'vase': drawVase(c, 0, 0, o || {}, true); break;
      default: return false;
    }
    return true;
  }
  // x,y = bottom centre. broken: shards + spilled water + a flower on the floor.
  function drawVase(c, x, y, o, inner) {
    o = o || {};
    if (!inner) { c.save(); c.translate(x, y); }
    if (!o.broken) {
      c.fillStyle = 'rgba(10,6,16,0.25)'; ell(c, 0, 1, 14, 2.6); c.fill();
      // dried flowers
      for (const [dx, dy, a, col] of [[-5, -50, -0.5, '#8e4256'], [4, -56, 0.1, '#c8a050'], [9, -48, 0.6, '#c9cfe0']]) { c.beginPath(); c.moveTo(0, -34); c.quadraticCurveTo(dx * 0.4, (dy - 34) * 0.5 - 34, dx, dy); c.strokeStyle = '#3b5230'; c.lineWidth = 1.2; c.stroke(); ell(c, dx, dy - 1, 3.4, 3); fs(c, col, 0.7, 0.5); ell(c, dx, dy - 1, 1, 1); c.fillStyle = P.amberLight; c.fill(); }
      c.beginPath(); c.moveTo(-5, -38); c.bezierCurveTo(-5, -34, -14, -30, -14, -18); c.bezierCurveTo(-14, -6, -8, -2, -7, 0); c.lineTo(7, 0); c.bezierCurveTo(8, -2, 14, -6, 14, -18); c.bezierCurveTo(14, -30, 5, -34, 5, -38); c.closePath(); fs(c, '#e4e8f0', 1.3, 0.6);
      c.save(); c.clip(); c.fillStyle = 'rgba(70,90,150,0.22)'; c.fillRect(2, -40, 14, 42); c.restore();
      c.beginPath(); c.moveTo(-12, -22); c.quadraticCurveTo(0, -16, 12, -22); c.moveTo(-9, -10); c.quadraticCurveTo(0, -5, 9, -10); c.strokeStyle = '#3a52a0'; c.lineWidth = 1.6; c.stroke();
      c.beginPath(); c.moveTo(-3, -28); c.quadraticCurveTo(0, -24, 3, -28); c.moveTo(0, -27); c.lineTo(0, -21); c.strokeStyle = '#3a52a0'; c.lineWidth = 1; c.stroke();
      rr(c, -7, -41, 14, 5, 2.5); fs(c, '#e4e8f0', 1, 0.55);
      c.beginPath(); c.moveTo(-9, -28); c.quadraticCurveTo(-12, -22, -10, -12); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1.6; c.stroke();
    } else {
      ell(c, 3, -0.5, 20, 3.4); c.fillStyle = 'rgba(110,160,210,0.28)'; c.fill(); ell(c, -2, -1, 8, 1.4); c.fillStyle = 'rgba(220,240,255,0.35)'; c.fill();
      // flowers lying
      for (const [dx, col, r] of [[16, '#8e4256', 0.3], [24, '#c8a050', -0.2]]) { c.beginPath(); c.moveTo(dx - 12, -2); c.quadraticCurveTo(dx - 4, -4, dx, -2.6); c.strokeStyle = '#3b5230'; c.lineWidth = 1.2; c.stroke(); ell(c, dx + 1, -2.8, 3.2, 2.8); fs(c, col, 0.6, 0.5); }
      // shards
      for (const [dx, dy, a, sc] of [[-14, -3, 0.2, 1], [-6, -2.4, -0.5, 0.8], [6, -4, 0.9, 1.2], [-20, -1.6, -0.1, 0.7], [11, -2, -0.7, 0.8]]) { c.save(); c.translate(dx, dy); c.rotate(a); c.beginPath(); c.moveTo(-6 * sc, 2); c.lineTo(-2 * sc, -5 * sc); c.lineTo(5 * sc, -3 * sc); c.lineTo(6 * sc, 2); c.closePath(); fs(c, '#e4e8f0', 0.9, 0.55); c.beginPath(); c.moveTo(-3 * sc, 0); c.quadraticCurveTo(0, -2.4 * sc, 3 * sc, 0); c.strokeStyle = '#3a52a0'; c.lineWidth = 1; c.stroke(); c.restore(); }
      // neck ring stub
      c.beginPath(); c.moveTo(-8, 0); c.quadraticCurveTo(-10, -9, -7, -13); c.lineTo(-3, -9); c.lineTo(-1, 0); c.closePath(); fs(c, '#e4e8f0', 1, 0.6);
    }
    if (!inner) c.restore();
  }

  // ================================================================ portals / items
  const LOCKC = { red: ['#c0364c', '#e0687a', '#7a1a2c'], blue: ['#3f7fd0', '#79b0f0', '#1f4a8a'], green: ['#4fa05a', '#86d08e', '#2a6a34'] };
  function padlock(c, x, y, col, t, sc) { // centre of the lock body
    const L = LOCKC[col] || LOCKC.red; sc = sc || 1;
    c.save(); c.translate(x, y); c.scale(sc, sc);
    const sw = sin(t * 2.2) * 0.04; c.rotate(sw);
    c.beginPath(); c.moveTo(-5.4, -3); c.lineTo(-5.4, -10); c.bezierCurveTo(-5.4, -17, 5.4, -17, 5.4, -10); c.lineTo(5.4, -3); c.strokeStyle = ink(0.6); c.lineWidth = 4; c.lineCap = 'round'; c.stroke(); c.strokeStyle = '#b9bfcf'; c.lineWidth = 2.4; c.stroke();
    rr(c, -8.4, -4, 16.8, 13.6, 3.4); fs(c, L[0], 1.3, 0.65);
    c.beginPath(); c.moveTo(-6.4, -1); c.lineTo(-6.4, 4); c.strokeStyle = L[1]; c.lineWidth = 1.8; c.stroke();
    ell(c, 0, 2.4, 2.2, 2.2); c.fillStyle = L[2]; c.fill(); c.beginPath(); c.moveTo(0, 3); c.lineTo(0, 6.4); c.strokeStyle = L[2]; c.lineWidth = 1.8; c.stroke();
    c.restore();
  }
  function chainSeg(c, x1, y1, x2, y2, sag, t) {
    const n = Math.max(3, Math.round(Math.hypot(x2 - x1, y2 - y1) / 6));
    for (let i = 0; i <= n; i++) {
      const u = i / n, px = x1 + (x2 - x1) * u, py = y1 + (y2 - y1) * u + sin(u * PI) * sag;
      c.save(); c.translate(px, py); c.rotate(i % 2 ? 0.6 : 0); ell(c, 0, 0, i % 2 ? 3.4 : 2, i % 2 ? 1.8 : 3); c.strokeStyle = ink(0.6); c.lineWidth = 2.8; c.stroke(); c.strokeStyle = '#8a92a4'; c.lineWidth = 1.5; c.stroke(); c.restore();
    }
  }
  // x,y = bottom centre. Door/arch/stairs ~ 56 x 86; trapdoor ~ 64 x 14 lying on the floor.
  function drawPortal(c, x, y, o) {
    o = o || {};
    const st = o.style || 'door', t = o.t || 0, op = clamp(o.open || 0, 0, 1), lk = o.lock || null, col = lk || o.color || 'red';
    const w = 52, h = 80;
    c.save(); c.translate(x, y);
    c.fillStyle = 'rgba(10,6,16,0.25)'; ell(c, 0, 1, 34, 3); c.fill();
    if (st === 'trapdoor') {
      const lift = op * 5;
      glow(c, 0, -3, 40 + op * 12, 0.0 + op * 0.45, 'amber');
      rr(c, -36, -9, 72, 11, 3); fs(c, SW.dark, 1.2, 0.62);
      c.save(); c.translate(0, 0);
      rr(c, -31, -8 - lift * 0.6, 62, 8, 2.4); fs(c, SW.pale, 1.2, 0.62);
      for (const bx of [-14, 0, 14]) { c.beginPath(); c.moveTo(bx, -7.4 - lift * 0.6); c.lineTo(bx + 0.4, -0.6 - lift * 0.6); c.strokeStyle = 'rgba(25,12,8,0.5)'; c.lineWidth = 0.9; c.stroke(); }
      c.beginPath(); c.moveTo(-31, -6 - lift * 0.6); c.lineTo(31, -6 - lift * 0.6); c.strokeStyle = 'rgba(255,238,215,0.35)'; c.lineWidth = 1; c.stroke();
      for (const bx of [-24, 24]) { rr(c, bx - 5, -7.4 - lift * 0.6, 10, 2.6, 1); fs(c, '#2c2f3c', 0.7, 0.55); }
      // ring handle
      c.beginPath(); c.arc(10, -4 - lift * 0.6, 4, 0, TAU); c.strokeStyle = ink(0.6); c.lineWidth = 3; c.stroke(); c.strokeStyle = '#b9a060'; c.lineWidth = 1.6; c.stroke();
      c.restore();
      if (lk) { rr(c, -4, -9.4, 8, 5, 1); fs(c, '#4a4256', 0.7, 0.55); padlock(c, 0, -10, col, t, 0.75); }
      c.restore(); return;
    }
    // frame backdrop
    if (st === 'door') {
      // wooden frame with arched top
      glow(c, 0, -h * 0.5, 54, op * 0.22, 'amber');
      archPath(c, -w / 2 - 6, -h - 6, w + 12, h + 6); fs(c, SW.dark, 1.8, 0.62);
      archPath(c, -w / 2, -h, w, h); c.fillStyle = '#d8a050'; c.fill();
      // warm glow behind the leaf (only visible as the leaf swings a bit)
      const gap = op * 0.2;
      c.save(); archPath(c, -w / 2, -h, w, h); c.clip();
      glow(c, w * 0.2, -h * 0.45, 56, 0.2 + op * 0.8, 'amber');
      c.fillStyle = 'rgba(255,230,160,' + (0.5 * op).toFixed(2) + ')'; c.fillRect(-w / 2 + w * (1 - gap), -h, w * gap, h);
      c.restore();
      c.save(); archPath(c, -w / 2, -h, w, h); c.clip();
      c.beginPath(); c.moveTo(-w / 2, -h - 4); c.lineTo(-w / 2 + w * (1 - gap), -h - 4); c.quadraticCurveTo(-w / 2 + w * (1 - gap) * 1.02, -h / 2, -w / 2 + w * (1 - gap), 0); c.lineTo(-w / 2, 0); c.closePath(); fs(c, SW.light, 1.3, 0.6);
      const lw = w * (1 - gap);
      c.strokeStyle = 'rgba(25,12,8,0.5)'; c.lineWidth = 1; for (let i = 1; i < 4; i++) { const px = -w / 2 + lw * i / 4; c.beginPath(); c.moveTo(px, -h); c.lineTo(px, 0); c.stroke(); }
      c.strokeStyle = 'rgba(255,225,200,0.16)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-w / 2 + 2, -h + 6); c.lineTo(-w / 2 + 2, -2); c.stroke();
      // panels
      for (const [py, ph] of [[-h + 10, 26], [-h + 42, 30]]) { rr(c, -w / 2 + 6, py, lw - 12, ph, 3); fs(c, 'rgba(20,10,8,0.28)', 0.9, 0.35); }
      // hinges + handle
      for (const hy of [-h + 12, -14]) { rr(c, -w / 2, hy, 9, 5, 1.5); fs(c, '#2c2f3c', 0.7, 0.55); }
      ell(c, -w / 2 + lw - 8, -h * 0.42, 3, 3); fs(c, '#d4ad5a', 0.8, 0.55);
      rr(c, -w / 2 + lw - 11, -h * 0.42 + 4, 6, 3, 1); fs(c, '#a9893a', 0.6, 0.5);
      c.restore();
      archPath(c, -w / 2, -h, w, h); c.strokeStyle = ink(0.5); c.lineWidth = 1.2; c.stroke();
      // threshold
      rr(c, -w / 2 - 9, -4, w + 18, 5, 2); fs(c, SW.mid, 1, 0.55);
      // keyhole-like number plate
      rr(c, -8, -h - 2, 16, 8, 2); fs(c, '#d4ad5a', 0.7, 0.5);
      if (lk) { rr(c, -w / 2 + lw - 15, -h * 0.42 - 2, 10, 6, 2); fs(c, '#4a4256', 0.7, 0.55); padlock(c, -w / 2 + lw - 10, -h * 0.42 + 6, col, t, 0.95); }
    } else if (st === 'arch') {
      glow(c, 0, -h * 0.5, 60, op * 0.35, 'amber');
      c.beginPath(); c.moveTo(-w / 2 - 8, 0); c.lineTo(-w / 2 - 8, -h + w / 2); c.quadraticCurveTo(-w / 2 - 8, -h - 8, 0, -h - 8); c.quadraticCurveTo(w / 2 + 8, -h - 8, w / 2 + 8, -h + w / 2); c.lineTo(w / 2 + 8, 0); c.closePath(); fs(c, '#5d4a40', 2, 0.62);
      c.strokeStyle = 'rgba(15,8,8,0.5)'; c.lineWidth = 1; for (let i = 0; i <= 9; i++) { const a = PI + i / 9 * PI; c.beginPath(); c.moveTo(cos(a) * (w / 2), -h + w / 2 + sin(a) * (w / 2)); c.lineTo(cos(a) * (w / 2 + 8), -h + w / 2 + sin(a) * (w / 2 + 8)); c.stroke(); }
      archPath(c, -w / 2, -h, w, h); c.fillStyle = '#100a0e'; c.fill();
      c.save(); archPath(c, -w / 2, -h, w, h); c.clip();
      const ig = c.createLinearGradient(0, -h, 0, 0); ig.addColorStop(0, 'rgba(60,40,50,0)'); ig.addColorStop(1, 'rgba(140,90,50,' + (0.3 + op * 0.4).toFixed(2) + ')'); c.fillStyle = ig; c.fillRect(-w / 2, -h, w, h);
      // far doorway & floor glimpse
      glow(c, 0, -22, 36, 0.25 + op * 0.6, 'amber');
      c.beginPath(); c.moveTo(-14, 0); c.lineTo(-10, -34); c.lineTo(10, -34); c.lineTo(14, 0); c.closePath(); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
      c.restore();
      archPath(c, -w / 2, -h, w, h); c.strokeStyle = ink(0.6); c.lineWidth = 1.2; c.stroke();
      rr(c, -5, -h - 9, 10, 14, 2); fs(c, '#7a6558', 1, 0.55);
      rr(c, -w / 2 - 12, -5, w + 24, 6, 2); fs(c, '#4a3a34', 1, 0.55);
      // lantern beside it
      line(c, w / 2 + 14, -62, w / 2 + 14, -54, '#2c2f3c', 1.4); rr(c, w / 2 + 10, -54, 8, 11, 2); fs(c, 'rgba(255,215,130,0.55)', 0.9, 0.55); glow(c, w / 2 + 14, -49, 20, 0.4 + 0.05 * sin(t * 8), 'amber'); flame(c, w / 2 + 14, -44, 0.7, t, 2);
      if (lk) { chainSeg(c, -w / 2 - 2, -34, w / 2 + 2, -34, 6, t); padlock(c, 0, -26, col, t, 1); }
    } else if (st === 'stairs_up' || st === 'stairs_down') {
      const up = st === 'stairs_up';
      glow(c, 0, -h * 0.4, 56, up ? 0.15 + op * 0.5 : 0.22 + op * 0.5, up ? 'moon' : 'amber');
      archPath(c, -w / 2 - 5, -h - 6, w + 10, h + 6); fs(c, '#4a4256', 2, 0.62);
      archPath(c, -w / 2, -h, w, h); c.fillStyle = up ? '#171320' : '#0b0810'; c.fill();
      c.save(); archPath(c, -w / 2, -h, w, h); c.clip();
      if (up) {
        const sg = c.createLinearGradient(0, -h, 0, -h * 0.4); sg.addColorStop(0, 'rgba(150,165,220,' + (0.3 + op * 0.3).toFixed(2) + ')'); sg.addColorStop(1, 'rgba(150,165,220,0)'); c.fillStyle = sg; c.fillRect(-w / 2, -h, w, h * 0.6);
        for (let i = 0; i < 7; i++) { const sx = w / 2 - 6 - i * 7.4, sy = -6 - i * 9.4; c.beginPath(); c.moveTo(sx - 8, sy); c.lineTo(sx + 14, sy); c.lineTo(sx + 14, 0); c.lineTo(sx - 8, 0); c.closePath(); const sh = 100 + i * 12; c.fillStyle = 'rgb(' + (sh - 10) + ',' + (sh - 24) + ',' + (sh + 10) + ')'; c.fill(); c.beginPath(); c.moveTo(sx - 8, sy); c.lineTo(sx + 14, sy); c.strokeStyle = 'rgba(255,230,190,0.5)'; c.lineWidth = 1.4; c.stroke(); }
        // banister
        c.beginPath(); c.moveTo(w / 2 + 2, -34); c.lineTo(-w / 2 + 6, -h + 22); c.strokeStyle = ink(0.6); c.lineWidth = 4; c.stroke(); c.strokeStyle = '#9a6c4c'; c.lineWidth = 2.6; c.stroke();
      } else {
        for (let i = 0; i < 6; i++) { const sx = -w / 2 + i * 8, sy = -h + 40 + i * 9; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 8, sy); c.lineTo(sx + 8, sy + 60); c.lineTo(sx, sy + 60); c.closePath(); c.fillStyle = 'rgb(' + (92 - i * 7) + ',' + (80 - i * 7) + ',' + (104 - i * 7) + ')'; c.fill(); c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 8, sy); c.strokeStyle = 'rgba(243,200,115,' + (0.5 - i * 0.05) + ')'; c.lineWidth = 1.4; c.stroke(); }
        glow(c, 10, -8, 40, 0.3 + op * 0.4, 'amber');
        c.beginPath(); c.moveTo(-w / 2 + 2, -h + 36); c.lineTo(w / 2, 0); c.strokeStyle = ink(0.6); c.lineWidth = 4; c.stroke(); c.strokeStyle = '#7a5240'; c.lineWidth = 2.6; c.stroke();
      }
      c.restore();
      archPath(c, -w / 2, -h, w, h); c.strokeStyle = ink(0.5); c.lineWidth = 1.2; c.stroke();
      c.beginPath(); c.moveTo(-5, -h - 6); c.lineTo(5, -h - 6); c.lineTo(3.5, -h + 3); c.lineTo(-3.5, -h + 3); c.closePath(); fs(c, '#5d5469', 1, 0.5);
      rr(c, -w / 2 - 9, -4, w + 18, 5, 2); fs(c, '#3a3340', 1, 0.55);
      // bobbing arrow (up / down)
      const ay = -h - 18 + sin(t * 3) * 2.5, dir = up ? -1 : 1;
      c.beginPath(); c.moveTo(-6, ay - 3 * dir); c.lineTo(0, ay + 3 * dir); c.lineTo(6, ay - 3 * dir); c.strokeStyle = ink(0.5); c.lineWidth = 4; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); c.strokeStyle = P.cream; c.lineWidth = 2.4; c.stroke();
      if (lk) { // wooden gate with chain
        for (let i = 0; i < 4; i++) rr(c, -w / 2 + 3 + i * 12.5, -50, 6, 50, 2), fs(c, SW.mid, 0.9, 0.55);
        rr(c, -w / 2, -34, w, 5, 2); fs(c, SW.light, 1, 0.55); chainSeg(c, -w / 2 + 2, -26, w / 2 - 2, -26, 5, t); padlock(c, 0, -22, col, t, 1);
      }
    }
    c.restore();
  }

  // x,y = bottom centre of the key's bobbing spot (floats ~16 px above)
  function drawKey(c, x, y, o) {
    o = o || {};
    const t = o.t || 0, L = LOCKC[o.color] || LOCKC.red, bob = sin(t * 2.4) * 2.2;
    c.save(); c.translate(x, y - 16 + bob);
    c.fillStyle = 'rgba(10,6,16,0.22)'; ell(c, 0, 16 - bob, 7 - bob * 0.3, 1.6); c.fill();
    c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 0, 0, 24, 0.32 + 0.08 * sin(t * 4), o.color === 'blue' ? 'blue' : o.color === 'green' ? 'green' : 'red'); c.restore();
    c.rotate(-0.7 + sin(t * 1.6) * 0.1);
    // shaft along +x
    const sx = 4;
    rr(c, sx, -1.8, 17, 3.6, 1.6); fs(c, '#d4ad5a', 1, 0.62);
    c.beginPath(); c.moveTo(sx + 11, 1.6); c.lineTo(sx + 11, 6); c.lineTo(sx + 14, 6); c.lineTo(sx + 14, 1.6); c.moveTo(sx + 16, 1.6); c.lineTo(sx + 16, 4.4); c.lineTo(sx + 19, 4.4); c.lineTo(sx + 19, 1.6); fs(c, '#d4ad5a', 1, 0.62);
    // ornate bow: trefoil with a gem
    for (const [dx, dy] of [[-4.6, -4], [-4.6, 4], [-9, 0]]) { ell(c, dx, dy, 3.6, 3.6); fs(c, '#d4ad5a', 1, 0.62); ell(c, dx, dy, 1.5, 1.5); c.fillStyle = 'rgba(30,20,10,0.55)'; c.fill(); }
    ell(c, -4.6, 0, 3.6, 3.6); fs(c, L[0], 1, 0.65); ell(c, -5.4, -0.8, 1.1, 1.1); c.fillStyle = L[1]; c.fill();
    rr(c, 2, -2.6, 3, 5.2, 1.2); fs(c, '#b8923f', 0.7, 0.55);
    c.restore();
    // sparkle
    const sp = (t * 0.8) % 1; if (sp < 0.5) { const k = sin(sp * 2 * PI) , px = x + 6, py = y - 24 + bob; c.strokeStyle = 'rgba(255,248,220,' + (0.9 * k).toFixed(2) + ')'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(px - 3 * k, py); c.lineTo(px + 3 * k, py); c.moveTo(px, py - 3 * k); c.lineTo(px, py + 3 * k); c.stroke(); }
  }

  function drawCandy(c, x, y, o) {
    o = o || {};
    const t = o.t || 0, bob = sin(t * 2.6 + 1) * 1.6;
    c.save(); c.translate(x, y - 11 + bob);
    c.fillStyle = 'rgba(10,6,16,0.2)'; ell(c, 0, 11 - bob, 7, 1.6); c.fill();
    c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 0, 0, 20, 0.22, 'amber'); c.restore();
    c.rotate(sin(t * 1.5) * 0.12);
    // twisted wrapper ends
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 7, 0); c.quadraticCurveTo(s * 11, -2, s * 13, -6); c.lineTo(s * 14.6, -1); c.lineTo(s * 14.6, 1.4); c.lineTo(s * 13, 6); c.quadraticCurveTo(s * 11, 2, s * 7, 0); c.closePath(); fs(c, '#e86a9a', 0.9, 0.55); c.beginPath(); c.moveTo(s * 9.6, -1.4); c.lineTo(s * 12.6, -0.6); c.moveTo(s * 9.6, 1.4); c.lineTo(s * 12.6, 0.8); c.strokeStyle = 'rgba(120,20,60,0.4)'; c.lineWidth = 0.7; c.stroke(); }
    ell(c, 0, 0, 8.6, 6.6); fs(c, '#f4a8c4', 1.1, 0.6);
    c.save(); ell(c, 0, 0, 8.6, 6.6); c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 2.2; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 4.6 - 3, -8); c.lineTo(i * 4.6 + 3, 8); c.stroke(); }
    c.restore();
    ell(c, -3, -2.6, 2.2, 1.1, -0.5); c.fillStyle = 'rgba(255,255,255,0.8)'; c.fill();
    c.restore();
  }

  // Ivy's small black cloth bundle (x,y = bottom centre)
  function drawBag(c, x, y, o) {
    o = o || {};
    const t = o.t || 0;
    c.save(); c.translate(x, y);
    c.fillStyle = 'rgba(10,6,16,0.3)'; ell(c, 0, 0.6, 13, 2.6); c.fill();
    const br = 1 + sin(t * 1.6) * 0.015;
    c.save(); c.scale(1, br);
    c.beginPath(); c.moveTo(-12, 0); c.bezierCurveTo(-15, -8, -10, -17, -4, -19); c.lineTo(4, -19); c.bezierCurveTo(10, -17, 15, -8, 12, 0); c.quadraticCurveTo(0, 3, -12, 0); c.closePath(); fs(c, '#201b2b', 1.3, 0.65);
    c.strokeStyle = 'rgba(140,125,175,0.25)'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-8, -3); c.quadraticCurveTo(-10, -10, -5, -16); c.moveTo(7, -3); c.quadraticCurveTo(9, -10, 5, -16); c.moveTo(0, -2); c.quadraticCurveTo(1, -9, 0, -15); c.stroke();
    c.restore();
    // gathered neck + string + bordeaux bow + frills
    c.beginPath(); c.moveTo(-5, -19.4); c.quadraticCurveTo(-8, -26, -4, -28); c.quadraticCurveTo(0, -24, 4, -28); c.quadraticCurveTo(8, -26, 5, -19.4); c.closePath(); fs(c, '#201b2b', 1.1, 0.6);
    c.beginPath(); c.moveTo(-5.4, -20.6); c.quadraticCurveTo(0, -18.4, 5.4, -20.6); c.strokeStyle = P.bordeauxLight; c.lineWidth = 1.8; c.stroke();
    ell(c, -3.4, -19.6, 3, 1.8, -0.5); fs(c, P.bordeauxLight, 0.7, 0.5); ell(c, 3.4, -19.6, 3, 1.8, 0.5); fs(c, P.bordeauxLight, 0.7, 0.5); ell(c, 0, -20, 1.3, 1.3); fs(c, P.bordeaux, 0.6, 0.5);
    // a key tip and a sweet peeking out, tiny glimmer
    const gl = 0.5 + 0.5 * sin(t * 2.4);
    c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 0, -14, 22, 0.1 + gl * 0.12, 'amber'); c.restore();
    c.strokeStyle = 'rgba(255,240,200,' + (0.4 + gl * 0.5).toFixed(2) + ')'; c.lineWidth = 1.1; const px = 8, py = -22; c.beginPath(); c.moveTo(px - 3, py); c.lineTo(px + 3, py); c.moveTo(px, py - 3); c.lineTo(px, py + 3); c.stroke();
    c.restore();
  }

  // black crow feather, drifting gently (x,y = bottom centre of its float spot)
  function drawFeather(c, x, y, o) {
    o = o || {};
    const t = o.t || 0, bob = sin(t * 1.7) * 3, rot = -0.55 + sin(t * 1.2) * 0.22;
    c.save(); c.translate(x, y);
    c.fillStyle = 'rgba(10,6,16,0.2)'; ell(c, 0, 0.6, 7 - bob * 0.3, 1.6); c.fill();
    c.translate(0, -20 + bob);
    c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 0, 0, 26, 0.18 + 0.05 * sin(t * 2.5), 'blue'); c.restore();
    c.rotate(rot);
    // vane
    c.beginPath(); c.moveTo(-17, 0); c.bezierCurveTo(-11, -7.2, 7, -8.6, 15, -1.4); c.bezierCurveTo(11, 0.6, 12, 3, 14, 6); c.bezierCurveTo(5, 7.8, -9, 6.6, -17, 0); c.closePath(); fs(c, '#1d1a2a', 1.1, 0.62);
    c.save(); c.clip();
    c.strokeStyle = 'rgba(120,150,230,0.5)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-12, -2.6); c.quadraticCurveTo(0, -6.6, 11, -2.6); c.stroke();
    c.strokeStyle = 'rgba(10,8,20,0.7)'; c.lineWidth = 0.7; for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(-12 + i * 4, 0.4); c.lineTo(-8 + i * 4, i % 2 ? 6 : -6); c.stroke(); }
    c.restore();
    // quill
    c.beginPath(); c.moveTo(-23, 2.4); c.lineTo(15, -0.6); c.strokeStyle = ink(0.6); c.lineWidth = 2.2; c.stroke(); c.strokeStyle = '#c9cfe0'; c.lineWidth = 1; c.stroke();
    c.restore();
    // twinkle
    const sp = (t * 0.7) % 1; if (sp < 0.4) { const k = sin(sp / 0.4 * PI), px = x - 10, py = y - 34 + bob; c.strokeStyle = 'rgba(200,215,255,' + (0.9 * k).toFixed(2) + ')'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(px - 3 * k, py); c.lineTo(px + 3 * k, py); c.moveTo(px, py - 3 * k); c.lineTo(px, py + 3 * k); c.stroke(); }
  }

  // ---- crow family nest (x,y = bottom centre of the nest, sitting on a short beam stub)
  function twigRim(c, front, seed) {
    for (let i = 0; i < 16; i++) {
      const u = i / 15, a = (front ? 0.1 : PI + 0.1) + u * (PI - 0.2), rx = 46, ry = front ? 11 : 9;
      const px = cos(a) * rx, py = sin(a) * ry * (front ? 1 : 1) - 12 + (front ? 6 : 0);
      c.save(); c.translate(px, py); c.rotate((hh(seed, i) - 0.5) * 1.6 + (front ? 0.2 : -0.2) * (u - 0.5) * 4); const L = 12 + hh(seed, i + 30) * 10;
      c.beginPath(); c.moveTo(-L / 2, 0); c.quadraticCurveTo(0, (hh(seed, i + 60) - 0.5) * 4, L / 2, 0); c.strokeStyle = ink(0.6); c.lineWidth = 3.2; c.lineCap = 'round'; c.stroke(); c.strokeStyle = ['#6a4a34', '#7d5a40', '#58402e'][i % 3]; c.lineWidth = 2; c.stroke(); c.restore();
    }
  }
  function chick(c, t) { // tiny three-headed fluffy chick at the origin (feet), ~20px tall
    c.save();
    const bob = sin(t * 3.1) * 0.8;
    c.translate(0, bob * 0.4);
    ell(c, 0, -6, 9.6, 7.6); fs(c, '#2a2638', 1.1, 0.6);
    for (let i = 0; i < 6; i++) { const a = -PI + i * 0.5; c.beginPath(); c.moveTo(cos(a) * 8.6, -6 + sin(a) * 6.8); c.lineTo(cos(a) * 11.4, -6 + sin(a) * 9.4); c.lineTo(cos(a + 0.2) * 8.6, -6 + sin(a + 0.2) * 6.8); c.fillStyle = '#2a2638'; c.fill(); }
    c.fillStyle = 'rgba(120,130,190,0.25)'; ell(c, 2, -4, 5.6, 3.6); c.fill();
    const hd = [[-6.4, -18.6, -0.3], [0, -22, 0], [6.4, -18.6, 0.3]];
    for (let i = 0; i < 3; i++) {
      const hx = hd[i][0] + sin(t * 2.6 + i * 2.1) * 1.1, hy = hd[i][1] + sin(t * 3.2 + i * 1.3) * 0.9, open = max(0, sin(t * 4 + i * 2.2)) * 0.9;
      c.beginPath(); c.moveTo(hx * 0.4 - 2, -10); c.quadraticCurveTo(hx - 1, (hy - 10) / 2 - 8, hx - 1.4, hy + 2); c.lineTo(hx + 1.4, hy + 2); c.quadraticCurveTo(hx + 1, (hy - 10) / 2 - 8, hx * 0.4 + 2, -10); fs(c, '#2a2638', 0.9, 0.55);
      c.save(); c.translate(hx, hy); c.rotate(hd[i][2]);
      ell(c, 0, 0, 5.2, 4.8); fs(c, '#2a2638', 1, 0.6);
      c.beginPath(); c.moveTo(-1.8, -4.6); c.quadraticCurveTo(0, -7.6, 1.8, -4.6); c.strokeStyle = '#2a2638'; c.lineWidth = 1.4; c.stroke();
      // beak open
      c.beginPath(); c.moveTo(3.2, -1.2); c.lineTo(8.6, -1.8 - open * 1.2); c.lineTo(3.6, 0.6); c.closePath(); fs(c, '#f0b04a', 0.7, 0.55);
      c.beginPath(); c.moveTo(3.2, 0.8); c.lineTo(8, 1.4 + open * 2.2); c.lineTo(3.2, 2.4); c.closePath(); fs(c, '#e09a3a', 0.7, 0.55);
      ell(c, 0.8, -1, 1.9, 2.1); c.fillStyle = '#fff'; c.fill(); c.beginPath(); c.arc(1.2, -0.8, 1, 0, TAU); c.fillStyle = '#1b1420'; c.fill(); c.beginPath(); c.arc(0.7, -1.4, 0.4, 0, TAU); c.fillStyle = '#fff'; c.fill();
      c.restore();
    }
    for (const s of [-1, 1]) { line(c, s * 3, -0.5, s * 3.4, 1.6, '#c98a3a', 1.2); }
    c.restore();
  }
  function drawNest(c, x, y, o) {
    o = o || {};
    const t = o.t || 0, fam = o.family !== false;
    c.save(); c.translate(x, y);
    // beam stub
    rr(c, -62, -2, 124, 12, 3); fs(c, SW.dark, 1.3, 0.62); c.beginPath(); c.moveTo(-60, 2); c.lineTo(60, 2); c.strokeStyle = 'rgba(255,225,200,0.16)'; c.lineWidth = 1; c.stroke();
    // warm little glow when the family is home
    if (fam) glow(c, 0, -22, 70, 0.12, 'amber');
    twigRim(c, false, 3);
    c.beginPath(); c.ellipse(0, -9, 44, 10, 0, 0, PI); c.lineTo(44, -12); c.ellipse(0, -12, 44, 10, 0, PI, 0, true); c.closePath(); c.fillStyle = '#3a2a1e'; c.fill();
    if (fam) {
      // mate (one head, bordeaux ribbon), adult two-headed crow, chick
      c.save(); c.translate(29, -4); drawCrow(c, 0, 0, { t: t + 1.3, heads: 1, scale: 0.6 }); c.restore();
      c.save(); c.translate(-24, -4); drawCrow(c, 0, 0, { t, heads: 2, scale: 0.7 }); c.restore();
      c.save(); c.translate(3, -4); c.scale(1.05, 1.05); chick(c, t); c.restore();
      // mate's ribbon
      c.save(); c.translate(36, -29 + sin(t * 2.2 + 1) * 0.5); ell(c, -2.4, 0, 2.6, 1.6, -0.5); fs(c, P.bordeauxLight, 0.6, 0.5); ell(c, 2.4, 0, 2.6, 1.6, 0.5); fs(c, P.bordeauxLight, 0.6, 0.5); c.restore();
      // tiny heart when chick peeps
      const hp = (t * 0.4) % 1; if (hp < 0.5) { const hx = 3 + sin(hp * 8) * 2, hy = -34 - hp * 20; c.globalAlpha = 1 - hp * 2; c.beginPath(); c.moveTo(hx, hy + 2); c.bezierCurveTo(hx - 4, hy - 1, hx - 2, hy - 4, hx, hy - 2); c.bezierCurveTo(hx + 2, hy - 4, hx + 4, hy - 1, hx, hy + 2); c.fillStyle = '#d4708a'; c.fill(); c.globalAlpha = 1; }
    } else {
      c.save(); c.translate(-8, -9); for (let i = 0; i < 2; i++) { ell(c, i * 14, 0, 5, 6.4, i ? 0.3 : -0.2); fs(c, i ? '#b9d0c4' : '#c4d6cc', 0.8, 0.5); } c.restore();
    }
    // front rim twigs over the lower birds
    c.beginPath(); c.ellipse(0, -6, 45, 9.5, 0, 0, PI); c.lineTo(45, -8); c.ellipse(0, -8, 45, 9.5, 0, PI, 0, true); c.closePath(); c.fillStyle = '#4a3624'; c.fill();
    twigRim(c, true, 8);
    // a few loose twigs sticking out
    for (const [dx, dy, a] of [[-46, -12, -0.9], [47, -10, 0.7], [-38, 1, 0.2]]) { c.save(); c.translate(dx, dy); c.rotate(a); line(c, 0, 0, 12, 0, ink(0.6), 3); line(c, 0, 0, 12, 0, '#7d5a40', 1.8); c.restore(); }
    c.restore();
  }

  // ---- Ivy facing the viewer, deadpan, holding her candle
  function ivyFront(c, x, y, o) {
    const t = o.t || 0;
    c.save(); c.translate(x, y);
    c.fillStyle = 'rgba(10,6,16,0.28)'; ell(c, 0, 0.5, 12, 2.6); c.fill();
    const bob = sin(t * 2.1) * 0.5, shY = -36 + bob, waistY = -27 + bob, hemY = -12.5, headY = shY - 7.6;
    const bo = { t, sway: 0.05, lift: 0, sf: 1.8, phase: 0 };
    // legs and boots
    for (const s of [-1, 1]) {
      limb(c, s * 3, -15, s * 3.8, -2.4, 3.4, '#1a1620', null);
      ell(c, s * 4.8, -1.6, 3.6, 2.2); fs(c, '#2c2030', 0.8, 0.55);
      c.beginPath(); c.moveTo(s * 2.4, -3); c.quadraticCurveTo(s * 4.6, -3.8, s * 6.6, -2.4); c.strokeStyle = 'rgba(200,190,220,0.22)'; c.lineWidth = 0.7; c.stroke();
    }
    // left arm (screen left) hanging
    limb(c, -4.8, shY + 2, -8.4, waistY + 6, 3.5, '#211b2b', -7.4, (shY + waistY) / 2 + 2);
    ell(c, -8.4, waistY + 6.4, 2.1, 2.1); fs(c, P.skin, 0.6, 0.5);
    // dress
    c.beginPath();
    c.moveTo(-5.4, shY); c.quadraticCurveTo(-6.2, waistY - 3, -4.4, waistY);
    c.bezierCurveTo(-8, waistY + 3, -11, hemY - 5, -12.2, hemY);
    c.quadraticCurveTo(-6, hemY + 2.4, 0, hemY + 0.5); c.quadraticCurveTo(6, hemY + 2.4, 12.2, hemY);
    c.bezierCurveTo(11, hemY - 5, 8, waistY + 3, 4.4, waistY); c.quadraticCurveTo(6.2, waistY - 3, 5.4, shY); c.quadraticCurveTo(0, shY - 2.4, -5.4, shY);
    fs(c, '#231c2d', 1.2, 0.6);
    c.strokeStyle = 'rgba(140,125,175,0.22)'; c.lineWidth = 0.8; c.lineCap = 'round';
    for (const fx of [-6, -2.5, 2.5, 6]) { c.beginPath(); c.moveTo(fx * 0.6, waistY + 3); c.quadraticCurveTo(fx * 1.1, (waistY + hemY) / 2, fx * 1.5, hemY - 1); c.stroke(); }
    c.beginPath(); c.moveTo(-4.6, waistY - 0.4); c.quadraticCurveTo(0, waistY + 1.4, 4.6, waistY - 0.4); c.strokeStyle = P.bordeaux; c.lineWidth = 1.7; c.stroke();
    c.beginPath(); c.moveTo(-12, hemY - 0.6); c.quadraticCurveTo(-6, hemY + 1.6, 0, hemY - 0.1); c.quadraticCurveTo(6, hemY + 1.6, 12, hemY - 0.6); c.strokeStyle = 'rgba(142,66,86,0.55)'; c.lineWidth = 0.9; c.stroke();
    rr(c, -2, shY - 3.5, 4, 5, 1.5); fs(c, '#e6dccf', 0.6, 0.4);
    c.beginPath(); c.moveTo(0.4, shY + 0.8); c.quadraticCurveTo(-3.4, shY - 2.2, -6.4, shY - 1.2); c.quadraticCurveTo(-6.2, shY + 2.5, -5.2, shY + 5.8); c.quadraticCurveTo(-2, shY + 3.6, 0.4, shY + 0.8); fs(c, '#f7f2ea', 0.9, 0.55);
    c.beginPath(); c.moveTo(-0.4, shY + 0.8); c.quadraticCurveTo(3.4, shY - 2.2, 6.4, shY - 1.2); c.quadraticCurveTo(6.2, shY + 2.5, 5.2, shY + 5.8); c.quadraticCurveTo(2, shY + 3.6, -0.4, shY + 0.8); fs(c, '#fbf7f0', 0.9, 0.55);
    ell(c, 0, shY + 1.6, 1.3, 1.3); fs(c, P.bordeauxLight, 0.5, 0.5);
    // braids fall in front of the shoulders
    bo.phase = 0; braid(c, -6.6, headY + 7, -1, bo);
    bo.phase = 1.3; braid(c, 6.6, headY + 7, 1, bo);
    // right arm bent up, candle held in front
    const hx = 9.6, hy = waistY - 1.6;
    limb(c, 4.8, shY + 2, hx, hy, 3.5, '#2a2236', 10.4, shY + 8);
    candle(c, hx, hy, t);
    ell(c, hx, hy, 2.2, 2.2); fs(c, P.skin, 0.6, 0.5);
    // head, face front-on
    faceHead(c, headY, t, 0, 0);
    c.restore();
  }

  // ================================================================ characters
  const JT = { dx: 27, dy: -43 }; // janitor's flashlight lens relative to his feet (facing +1)
  function janitorTorch(x, y, facing) { return { x: x + (facing < 0 ? -1 : 1) * JT.dx, y: y + JT.dy }; }

  // old tall janitor ~78px, feet at x,y. state: 'walk' | 'idle' | 'look' | 'alert' | 'run'; alert 0..1 raises brows/torch.
  function drawJanitor(c, x, y, o) {
    o = o || {};
    const f = o.facing < 0 ? -1 : 1, t = o.t || 0, st = o.state || 'walk', al = clamp(o.alert || 0, 0, 1) || (st === 'alert' ? 1 : 0);
    const moving = st === 'walk' || st === 'run';
    const spd = st === 'run' ? 2 : 1, ph = t * 5.6 * spd, sw = moving ? sin(ph) : 0, bob = moving ? -abs(sin(ph)) * 1.4 : sin(t * 1.5) * 0.5;
    const lean = st === 'run' ? 0.1 : 0.04;
    c.save(); c.translate(x, y); c.scale(f, 1);
    c.fillStyle = 'rgba(10,6,16,0.3)'; ell(c, 0, 0.5, 15, 3); c.fill();
    const hipY = -34 + bob;
    const cloth = '#3d4a5c', clothD = '#2f3a4a', skinC = '#e3cdb8';
    // legs
    for (const s of [-1, 1]) {
      const pp = s > 0 ? sw : -sw, fx = s * 3 + pp * 8 * spd * 0.8, fy = moving ? -max(0, -pp) * 4 : 0, kx = (s * 3 + fx) / 2 + 3;
      limb(c, s * 3, hipY, fx, fy - 4, 5.4, s > 0 ? cloth : clothD, kx, (hipY + fy) / 2);
      // boot
      c.beginPath(); c.moveTo(fx - 3, fy - 8); c.lineTo(fx + 3, fy - 8); c.lineTo(fx + 3.4, fy - 4); c.quadraticCurveTo(fx + 11, fy - 3.6, fx + 11, fy); c.lineTo(fx - 4, fy); c.closePath(); fs(c, '#2a2226', 1, 0.62);
      c.beginPath(); c.moveTo(fx - 4, fy - 1); c.lineTo(fx + 10.6, fy - 1); c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1; c.stroke();
    }
    // upper body (stooped)
    c.save(); c.translate(0, hipY); c.rotate(lean + (moving ? sin(ph) * 0.012 : 0)); c.translate(0, -hipY);
    // back arm
    const bax = -2 - sw * 5, bay = hipY - 8;
    limb(c, -1, hipY - 28, bax, bay, 4.6, clothD, -5, hipY - 18); ell(c, bax, bay + 1, 3, 3); fs(c, skinC, 0.7, 0.5);
    // coat / overalls
    c.beginPath(); c.moveTo(-8, hipY - 31); c.quadraticCurveTo(-11, hipY - 12, -9, hipY + 4); c.quadraticCurveTo(0, hipY + 7, 9, hipY + 4); c.quadraticCurveTo(11, hipY - 12, 8, hipY - 31); c.quadraticCurveTo(0, hipY - 35, -8, hipY - 31); c.closePath(); fs(c, cloth, 1.3, 0.62);
    c.strokeStyle = 'rgba(15,20,30,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, hipY - 30); c.lineTo(0.6, hipY + 5); c.stroke();
    // bib pocket + buttons + patch
    rr(c, -5, hipY - 22, 10, 9, 1.4); fs(c, clothD, 0.8, 0.5); line(c, -5, hipY - 21, 5, hipY - 21, 'rgba(255,255,255,0.15)', 0.8);
    ell(c, -3, hipY - 28, 1.2, 1.2); c.fillStyle = '#c8a050'; c.fill(); ell(c, 3.4, hipY - 28, 1.2, 1.2); c.fill();
    rr(c, 3, hipY - 8, 5, 5, 1); fs(c, '#6b4a3a', 0.6, 0.5); c.strokeStyle = 'rgba(255,255,255,0.3)'; c.setLineDash([1.5, 1.5]); c.lineWidth = 0.6; c.strokeRect(3.2, hipY - 7.8, 4.6, 4.6); c.setLineDash([]);
    // belt + keys ring (jingles)
    c.beginPath(); c.moveTo(-9.6, hipY - 2); c.quadraticCurveTo(0, hipY + 1.6, 9.6, hipY - 2); c.strokeStyle = '#2a2226'; c.lineWidth = 3; c.stroke();
    rr(c, -2.4, hipY - 4.2, 4.8, 4.4, 1); fs(c, '#c8a050', 0.7, 0.55);
    const ks = (moving ? sin(ph * 2 + 1) * 0.35 : sin(t * 1.4) * 0.05) + (al > 0.5 ? sin(t * 22) * 0.2 : 0);
    c.save(); c.translate(-6, hipY - 1); c.rotate(ks);
    line(c, 0, 0, 0, 5, '#8a8a96', 1.2); c.beginPath(); c.arc(0, 9, 4.6, 0, TAU); c.strokeStyle = ink(0.6); c.lineWidth = 2.6; c.stroke(); c.strokeStyle = '#b9bfcf'; c.lineWidth = 1.4; c.stroke();
    for (let i = 0; i < 4; i++) { c.save(); c.translate(0, 12); c.rotate(-0.9 + i * 0.6 + ks * 0.8); line(c, 0, 0, 0, 7.6, ink(0.55), 2.4); line(c, 0, 0, 0, 7.6, i % 2 ? '#d4ad5a' : '#9aa0b0', 1.2); ell(c, 0, 8.6, 1.9, 1.9); fs(c, i % 2 ? '#d4ad5a' : '#9aa0b0', 0.6, 0.5); c.restore(); }
    c.restore();
    // front arm with flashlight, forward
    const sx = 3, sy = hipY - 29;
    const raise = al * 7 + (st === 'look' ? sin(t * 1.2) * 1 : 0);
    const hx = 17, hy = hipY - 9 - raise * 0.4 - 4;
    limb(c, sx, sy, hx, hy, 4.8, cloth, 12, sy + 10); // slightly bent
    // torch body
    c.save(); c.translate(hx + 2, hy); c.rotate(-0.02 - raise * 0.012);
    rr(c, -4, -3.2, 15, 6.4, 2); fs(c, '#38384a', 1, 0.62); rr(c, 8, -4.6, 6, 9.2, 2); fs(c, '#8a8a9c', 0.9, 0.58); ell(c, 14.4, 0, 1.6, 3.6); c.fillStyle = '#fff6c0'; c.fill(); rr(c, -1, -1.2, 5, 2.4, 1); c.fillStyle = '#c8a050'; c.fill();
    c.restore();
    ell(c, hx, hy, 3.2, 3.2); fs(c, skinC, 0.7, 0.5);
    // neck + head (long face)
    const hy0 = hipY - 40 + (st === 'look' ? sin(t * 1.3) * 0 : 0);
    rr(c, -2.6, hipY - 38, 5.2, 8, 2); fs(c, skinC, 0.7, 0.5);
    c.save(); c.translate(1, hy0 - 6 + 0); c.rotate(st === 'look' ? sin(t * 1.1) * 0.12 : (st === 'idle' ? sin(t * 0.9) * 0.04 : 0));
    // ear
    ell(c, -5.6, 0.6, 2.4, 3.2); fs(c, skinC, 0.7, 0.5);
    // long grumpy face
    c.beginPath(); c.moveTo(-6, -6); c.bezierCurveTo(-8.4, 2, -6, 11, 0, 12.4); c.bezierCurveTo(5, 12, 8.4, 6, 8, -1); c.bezierCurveTo(7.6, -8, -3, -10, -6, -6); c.closePath(); fs(c, skinC, 1.2, 0.6);
    // big nose
    c.beginPath(); c.moveTo(6.4, -1); c.bezierCurveTo(11.4, 0.6, 12.6, 4.6, 8.8, 5.6); c.bezierCurveTo(7.4, 5.6, 6.4, 4.6, 6.6, 3.6); c.closePath(); fs(c, '#e8b8a0', 0.9, 0.55);
    ell(c, 10.2, 4.5, 1.1, 0.7); c.fillStyle = 'rgba(100,50,50,0.5)'; c.fill();
    // eye: half-lidded, brows bushy
    const bl = blink(t + 1.3);
    ell(c, 4, -2, 2.1, 2.3 * (1 - bl * 0.8)); c.fillStyle = '#fbf8f2'; c.fill();
    c.beginPath(); c.arc(4.8, -1.8, 1, 0, TAU); c.fillStyle = '#2a1c2c'; c.fill();
    if (al < 0.4) { c.save(); c.beginPath(); c.ellipse(4, -2, 2.3, 2.4, 0, 0, TAU); c.clip(); c.fillStyle = '#d6bda6'; c.fillRect(1, -5, 6, 3.4 + bl * 2); c.restore(); }
    c.beginPath(); c.moveTo(1.6, -2 + bl * 2); c.lineTo(6.4, -2 + bl * 2); c.strokeStyle = ink(0.85); c.lineWidth = 1; c.stroke();
    // bushy brow (angry slant, raised when alert)
    c.beginPath(); c.moveTo(0.4, -5.6 - al * 2.4); c.quadraticCurveTo(3.6, -6.8 - al * 3, 7, -4.2 - al * 3.2); c.strokeStyle = '#cfcfd8'; c.lineWidth = 3; c.lineCap = 'round'; c.stroke(); c.strokeStyle = 'rgba(20,16,24,0.5)'; c.lineWidth = 0.8; c.stroke();
    // cheek wrinkle
    c.beginPath(); c.moveTo(-1, 2.6); c.quadraticCurveTo(1, 5.4, 4, 5.4); c.strokeStyle = 'rgba(100,70,70,0.45)'; c.lineWidth = 0.8; c.stroke();
    // moustache: big drooping grey walrus with upturned tips
    c.beginPath(); c.moveTo(3, 6.6); c.bezierCurveTo(8, 4.4, 12.4, 6.4, 13.6, 10.4); c.bezierCurveTo(10, 9.2, 8.4, 11.6, 4.4, 10.4); c.bezierCurveTo(1, 12.6, -4, 11.4, -5.6, 8.4); c.bezierCurveTo(-3, 8, 0, 8.4, 3, 6.6); c.closePath(); fs(c, '#d6d6de', 1.1, 0.62);
    c.strokeStyle = 'rgba(80,80,100,0.4)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(3.6, 7.6); c.quadraticCurveTo(8, 8, 12, 10); c.moveTo(2, 8.4); c.quadraticCurveTo(-1, 10, -3.6, 9.2); c.stroke();
    // grumpy mouth peeking under (opens when alert)
    if (al > 0.5) { ell(c, 3.6, 13, 2, 1.2 + al); c.fillStyle = '#4a1d2a'; c.fill(); } else { c.beginPath(); c.moveTo(1, 12.4); c.quadraticCurveTo(3.4, 11.4, 6, 12.6); c.strokeStyle = 'rgba(70,40,55,0.7)'; c.lineWidth = 1; c.stroke(); }
    // flat cap
    c.beginPath(); c.moveTo(-8, -4); c.bezierCurveTo(-9.4, -12, -3, -14.6, 5, -13.6); c.bezierCurveTo(11, -12.6, 12.4, -8, 12, -5.4); c.quadraticCurveTo(4, -7.6, -8, -4); c.closePath(); fs(c, '#6a5a50', 1.3, 0.62);
    c.beginPath(); c.moveTo(7, -6.4); c.quadraticCurveTo(14.6, -7.6, 15.6, -4.6); c.quadraticCurveTo(10, -4.4, 6, -4.8); c.closePath(); fs(c, '#4a3d36', 1, 0.6);
    c.beginPath(); c.moveTo(-5, -9); c.quadraticCurveTo(2, -13.6, 8, -11.6); c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1.2; c.stroke();
    ell(c, 0.6, -13.4, 1.5, 1.2); fs(c, '#4a3d36', 0.6, 0.5);
    c.restore();
    c.restore(); // body lean
    c.restore();
    if (al > 0.55) { // "!" above his head
      c.save(); c.translate(x + f * 2, y - 100 + sin(t * 12) * 0.8); const sc = 0.8 + 0.3 * al; c.scale(sc, sc);
      c.beginPath(); c.arc(0, 0, 8.4, 0, TAU); fs(c, P.bordeauxLight, 1.4, 0.6); rr(c, -1.4, -5.4, 2.8, 6.8, 1.2); c.fillStyle = '#fff'; c.fill(); ell(c, 0, 5, 1.5, 1.5); c.fill();
      c.restore();
    }
  }

  // soft yellow beam. x,y = janitor's feet (the lens is at janitorTorch()); with o.origin = true x,y IS the lens.
  function drawFlashlight(c, x, y, o) {
    o = o || {};
    const f = o.facing < 0 ? -1 : 1, t = o.t || 0, len = o.len == null ? 216 : o.len, ang = o.ang == null ? 0.44 : o.ang;
    const ox = o.origin ? x : x + f * JT.dx, oy = o.origin ? y : y + JT.dy;
    c.save(); c.translate(ox, oy); c.scale(f, 1);
    c.globalCompositeOperation = 'lighter';
    const fl = 1 + 0.02 * sin(t * 17);
    for (let k = 0; k < 3; k++) {
      const a = ang * (1 - k * 0.28), L = len * fl * (1 - k * 0.06);
      const g = c.createRadialGradient(0, 0, 2, 0, 0, L); g.addColorStop(0, 'rgba(255,244,176,' + (0.34 - k * 0.04) + ')'); g.addColorStop(0.55, 'rgba(255,238,160,' + (0.16 - k * 0.02) + ')'); g.addColorStop(1, 'rgba(255,232,150,0)');
      c.beginPath(); c.moveTo(0, 0); c.lineTo(L * cos(-a), L * sin(-a)); c.arc(0, 0, L, -a, a); c.closePath(); c.fillStyle = g; c.fill();
    }
    // bright pool at the end and lens glow
    const g2 = c.createRadialGradient(len * 0.9, 0, 2, len * 0.9, 0, len * sin(ang) * 0.9 + 12); g2.addColorStop(0, 'rgba(255,246,190,0.22)'); g2.addColorStop(1, 'rgba(255,246,190,0)');
    c.fillStyle = g2; c.beginPath(); c.ellipse(len * 0.9, 0, len * 0.2 + 10, len * sin(ang) * 0.9 + 12, 0, 0, TAU); c.fill();
    glow(c, 0, 0, 16, 0.7, 'amber');
    // dust motes drifting in the beam
    c.fillStyle = 'rgba(255,250,215,0.7)';
    for (let i = 0; i < 9; i++) { const u = (hh(i, 7) + t * 0.05 * (0.5 + hh(i, 8))) % 1, px = len * (0.1 + 0.8 * u), py = (hh(i, 9) - 0.5) * 2 * px * Math.tan(ang) * 0.8 + sin(t * 0.8 + i * 3) * 3; c.beginPath(); c.arc(px, py, 0.8 + hh(i, 10) * 0.9, 0, TAU); c.fill(); }
    c.restore();
  }

  // ---- kids
  function kidHead(c, x, y, r, o) {
    o = o || {};
    c.save(); c.translate(x, y);
    // hair back
    ell(c, 0, -r * 0.2, r * 1.08, r * 1.0); fs(c, o.hair || '#c8763a', 1, 0.55);
    ell(c, 0, 0, r, r * 0.96); fs(c, P.skin, 1.1, 0.6);
    // fringe
    c.beginPath(); c.moveTo(-r * 1.02, -r * 0.05); c.bezierCurveTo(-r * 1.2, -r * 1.2, r * 0.4, -r * 1.4, r * 1.02, -r * 0.2); c.bezierCurveTo(r * 0.6, -r * 0.5, r * 0.1, -r * 0.3, -r * 0.2, -r * 0.7); c.bezierCurveTo(-r * 0.4, -r * 0.35, -r * 0.8, -r * 0.2, -r * 1.02, -r * 0.05); c.closePath(); fs(c, o.hair || '#c8763a', 1, 0.55);
    if (o.cowlick) { c.beginPath(); c.moveTo(-r * 0.1, -r * 1.05); c.quadraticCurveTo(r * 0.1, -r * 1.7, r * 0.5, -r * 1.5); c.strokeStyle = ink(0.5); c.lineWidth = 2.4; c.lineCap = 'round'; c.stroke(); c.strokeStyle = o.hair || '#c8763a'; c.lineWidth = 1.4; c.stroke(); }
    const lk = (o.look || 0) * r * 0.1, bl = o.blink || 0;
    for (const s of [-1, 1]) {
      const ex = s * r * 0.38 + lk, ey = r * 0.1;
      if (o.eyesClosed) { c.beginPath(); c.arc(ex, ey, r * 0.2, 0.15, PI - 0.15); c.strokeStyle = ink(0.8); c.lineWidth = 1.1; c.stroke(); continue; }
      ell(c, ex, ey, r * 0.22, r * 0.26 * (1 - bl * 0.85)); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = ink(0.5); c.lineWidth = 0.7; c.stroke();
      c.beginPath(); c.arc(ex + lk * 0.5, ey + 0.4, r * 0.13, 0, TAU); c.fillStyle = '#2a1c2c'; c.fill(); c.beginPath(); c.arc(ex + lk * 0.5 + 0.5, ey - 0.2, r * 0.05, 0, TAU); c.fillStyle = '#fff'; c.fill();
      ell(c, ex + s * r * 0.12, ey + r * 0.42, r * 0.2, r * 0.11); c.fillStyle = 'rgba(220,100,110,0.3)'; c.fill();
    }
    if (o.mouth === 'grin') { c.beginPath(); c.moveTo(lk - r * 0.34, r * 0.5); c.quadraticCurveTo(lk, r * 0.92, lk + r * 0.34, r * 0.5); c.closePath(); c.fillStyle = '#7a2a3a'; c.fill(); c.strokeStyle = ink(0.7); c.lineWidth = 0.9; c.stroke(); rr(c, lk - r * 0.26, r * 0.5, r * 0.52, r * 0.12, 1); c.fillStyle = '#fff'; c.fill(); }
    else if (o.mouth === 'munch') { const m = abs(sin((o.t || 0) * 9)) * 0.14; ell(c, lk, r * 0.58, r * 0.2, r * (0.1 + m)); c.fillStyle = '#7a2a3a'; c.fill(); c.strokeStyle = ink(0.6); c.lineWidth = 0.7; c.stroke(); ell(c, -r * 0.62, r * 0.4, r * 0.2, r * 0.2); c.fillStyle = 'rgba(220,100,110,0.35)'; c.fill(); }
    else if (o.mouth === 'prim') { c.beginPath(); c.moveTo(lk - r * 0.22, r * 0.55); c.quadraticCurveTo(lk, r * 0.5, lk + r * 0.22, r * 0.58); c.strokeStyle = ink(0.8); c.lineWidth = 1; c.stroke(); }
    else if (o.mouth === 'open') { ell(c, lk, r * 0.58, r * 0.2, r * 0.22); c.fillStyle = '#7a2a3a'; c.fill(); c.strokeStyle = ink(0.7); c.lineWidth = 0.8; c.stroke(); }
    else { c.beginPath(); c.moveTo(lk - r * 0.2, r * 0.55); c.lineTo(lk + r * 0.2, r * 0.55); c.strokeStyle = ink(0.8); c.lineWidth = 1; c.stroke(); }
    c.beginPath(); c.arc(lk * 0.5, r * 0.3, 0.5, 0, TAU); c.fillStyle = 'rgba(150,110,110,0.5)'; c.fill();
    c.restore();
  }
  function waterBalloon(c, x, y, rot, sc, pink, t) {
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(sc, sc);
    const A = pink ? ['#ee8ab0', '#ffc0d6', '#b8527a'] : ['#5a9ee0', '#a8d0ff', '#2f66a8'];
    const sl = sin((t || 0) * 5) * 0.8;
    c.beginPath(); c.moveTo(0, 8.4); c.bezierCurveTo(-8 - sl, 7, -9.6, -3, -4, -8); c.bezierCurveTo(-1.4, -10.2, 1.4, -10.2, 4, -8); c.bezierCurveTo(9.6, -3, 8 + sl, 7, 0, 8.4); c.closePath(); fs(c, A[0], 1.1, 0.55);
    c.save(); c.clip(); c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(-12, -12, 24, 12); c.fillStyle = 'rgba(20,40,100,0.18)'; c.beginPath(); c.moveTo(-12, 2 + sl * 0.6); c.quadraticCurveTo(0, -1 - sl, 12, 2 + sl * 0.6); c.lineTo(12, 12); c.lineTo(-12, 12); c.fill(); c.restore();
    ell(c, -3.6, -3.4, 2.2, 3.6, 0.5); c.fillStyle = A[1]; c.globalAlpha = 0.85; c.fill(); c.globalAlpha = 1;
    c.beginPath(); c.moveTo(-1.8, 8.2); c.lineTo(0, 11); c.lineTo(1.8, 8.2); c.closePath(); fs(c, A[2], 0.8, 0.55);
    c.restore();
  }
  // projectile / pickup balloon, x,y = centre. splash 0..1 (or true) = bursting into droplets.
  function drawBalloon(c, x, y, o) {
    o = o || {};
    const t = o.t || 0, pink = o.pink || o.color === 'pink', sp = o.splash === true ? 0.4 : clamp(+o.splash || 0, 0, 1);
    c.save(); c.translate(x, y);
    if (sp <= 0) { waterBalloon(c, 0, 0, sin(t * 7) * 0.25, 1, pink, t); c.restore(); return; }
    const col = pink ? '238,138,176' : '90,158,224';
    // shockwave puddle + droplets + shreds
    ell(c, 0, 8, 6 + sp * 24, 2 + sp * 4); c.fillStyle = 'rgba(' + col + ',' + (0.35 * (1 - sp)).toFixed(2) + ')'; c.fill();
    for (let i = 0; i < 14; i++) {
      const a = -PI * (0.05 + 0.9 * hh(i, 3)), v = 18 + hh(i, 4) * 30, px = cos(a) * v * sp * 1.4, py = sin(a) * v * sp * 1.1 + 44 * sp * sp * (0.6 + hh(i, 5)), r = (2.6 - sp * 1.4) * (0.6 + hh(i, 6) * 0.7);
      c.beginPath(); c.moveTo(px, py - r * 1.6); c.quadraticCurveTo(px + r * 1.1, py, px, py + r); c.quadraticCurveTo(px - r * 1.1, py, px, py - r * 1.6); c.fillStyle = 'rgba(' + col + ',' + (0.85 * (1 - sp * 0.8)).toFixed(2) + ')'; c.fill();
      ell(c, px - r * 0.3, py - r * 0.3, r * 0.3, r * 0.3); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fill();
    }
    for (let i = 0; i < 4; i++) { const a = -PI * (0.2 + i * 0.2), v = 10 + sp * 16; c.save(); c.translate(cos(a) * v * sp * 1.6, sin(a) * v * sp * 1.4 + 20 * sp * sp); c.rotate(sp * 6 + i); c.beginPath(); c.moveTo(-3, 0); c.quadraticCurveTo(0, -3, 3, 0); c.quadraticCurveTo(0, 1.4, -3, 0); c.globalAlpha = 1 - sp; fs(c, pink ? '#ee8ab0' : '#5a9ee0', 0.6, 0.4); c.globalAlpha = 1; c.restore(); }
    c.restore();
  }

  // two identical kids in pyjamas, feet at x,y (the pair is ~46 px wide). throwK 0..1: 0 holding, .5 wound up, 1 thrown. o.facing default 1.
  function drawTwins(c, x, y, o) {
    o = o || {};
    const t = o.t || 0, k = clamp(o.throwK || 0, 0, 1), f = o.facing < 0 ? -1 : 1;
    c.save(); c.translate(x, y); c.scale(f, 1);
    c.fillStyle = 'rgba(10,6,16,0.28)'; ell(c, 0, 0.5, 26, 3.2); c.fill();
    const kid = (kx, ky, who) => {
      const thrower = who === 1, ph = who * 1.7;
      const mv = o.moving ? 1 : 0, wph = (o.walk || 0) * 11 + ph, fo = mv * sin(wph) * 4;
      const bob = mv ? -abs(sin(wph)) * 2.2 : sin(t * 5 + ph) * 0.35, wind = thrower ? ss(k / 0.55) * (1 - ss((k - 0.55) / 0.25)) : 0, fling = thrower ? ss((k - 0.5) / 0.3) : 0;
      c.save(); c.translate(kx, ky + bob);
      const sh = -27, hip = -13, pj = '#9bb4e0', pjD = '#7f9ad0';
      // legs
      for (const s of [-1, 1]) { const fx = s * 3 + s * fo; limb(c, s * 2.6, hip, fx, -3 - bob, 4, pjD, null); ell(c, fx + s * 0.6, -1.6 - bob, 4.4, 2.6); fs(c, '#d4708a', 0.8, 0.55); for (let j = -1; j <= 1; j++) { ell(c, fx + s * 0.6 + j * 2, -3.2 - bob, 0.7, 0.7); c.fillStyle = '#f0c0d0'; c.fill(); } }
      // back arm
      limb(c, -3.4, sh + 2, -7, hip - 4 + sin(t * 3 + ph) * 0.8, 3.4, pjD, null); ell(c, -7, hip - 3.4, 1.9, 1.9); fs(c, P.skin, 0.6, 0.5);
      // body nightshirt
      c.beginPath(); c.moveTo(-5.4, sh); c.quadraticCurveTo(-7.6, hip - 4, -7.4, hip + 3); c.quadraticCurveTo(0, hip + 5.6, 7.4, hip + 3); c.quadraticCurveTo(7.6, hip - 4, 5.4, sh); c.quadraticCurveTo(0, sh - 2, -5.4, sh); c.closePath(); fs(c, pj, 1.2, 0.58);
      c.save(); c.clip(); c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1.4; for (let j = -2; j <= 2; j++) { c.beginPath(); c.moveTo(-8, hip + j * 4 - 2); c.lineTo(8, hip + j * 4 - 2); c.stroke(); }
      c.fillStyle = 'rgba(255,238,160,0.85)'; c.beginPath(); c.arc(-1.4, sh + 7, 2.3, 0.7, 5.6); c.arc(-0.4, sh + 7, 1.8, 5.4, 0.9, true); c.fill(); c.restore();
      // front arm: hold balloon / wind-up / fling
      const rest = [7.4, sh + 11], up = [-6, sh - 5], out = [14, sh - 2];
      let hx = lerp(rest[0], up[0], wind), hy = lerp(rest[1], up[1], wind);
      hx = lerp(hx, out[0], fling); hy = lerp(hy, out[1], fling);
      if (!thrower) { hx = 8 + sin(t * 4) * 0.6; hy = sh + 10 - ss(k) * 3; }
      limb(c, 4, sh + 2, hx, hy, 3.4, pj, (4 + hx) / 2 + 1, (sh + hy) / 2 + 3);
      // head
      kidHead(c, 0.6, sh - 8.4, 8.2, { hair: thrower ? '#c8763a' : '#c8763a', cowlick: true, mouth: 'grin', t, blink: blink(t + who), look: 0.7 + (thrower ? k * 0.8 : 0) });
      // sleeping cap tassel? small nightcap pom-pom
      ell(c, -7.4, sh - 17, 2.2, 2.2); fs(c, '#d4708a', 0.6, 0.5);
      // balloon
      const showBal = !(thrower && k > 0.82);
      if (showBal) { const by = wind > 0.05 || fling > 0.05 ? hy - 6.8 : hy - 1.6; if (thrower) waterBalloon(c, hx + 1.4, by, -0.1, 0.95, false, t); else waterBalloon(c, hx + 1.2, hy - 1.6, 0.12, 0.95, true, t); }
      ell(c, hx, hy, 2, 2); fs(c, P.skin, 0.6, 0.5);
      c.restore();
    };
    kid(-12, 0, 0);
    kid(12, 0, 1);
    c.restore();
  }

  // small prim kid with glasses + notebook. state 'walk' | 'run' | 'eat' (sitting, munching candy). ~42px tall.
  function drawTattle(c, x, y, o) {
    o = o || {};
    const f = o.facing < 0 ? -1 : 1, t = o.t || 0, st = o.state || 'walk';
    c.save(); c.translate(x, y); c.scale(f, 1);
    c.fillStyle = 'rgba(10,6,16,0.28)'; ell(c, 0, 0.5, st === 'eat' ? 14 : 11, 2.6); c.fill();
    const navy = '#2d3350', navyD = '#222742';
    if (st === 'eat') {
      // sitting on the floor, legs forward, munching
      const ch = sin(t * 9) * 0.6;
      c.save(); c.translate(0, 0);
      for (const s of [0, 1]) { limb(c, 0, -7, 11 - s * 2, -3 - s * 0.6, 4.2, s ? navyD : navy, null); ell(c, 13.4 - s * 2, -2.2 - s * 0.6, 3.6, 2.4); fs(c, '#2a2226', 0.8, 0.55); }
      // torso
      c.beginPath(); c.moveTo(-6, -8); c.quadraticCurveTo(-7.6, -20, -4, -26); c.quadraticCurveTo(0, -28, 4.6, -26); c.quadraticCurveTo(7.4, -20, 6, -8); c.quadraticCurveTo(0, -5, -6, -8); c.closePath(); fs(c, navy, 1.2, 0.58);
      c.beginPath(); c.moveTo(-3.2, -26.4); c.lineTo(0, -21); c.lineTo(3.2, -26.4); c.closePath(); fs(c, '#f7f2ea', 0.7, 0.5); // collar
      ell(c, 0, -21, 1.8, 1.4); fs(c, P.bordeauxLight, 0.6, 0.5); // bow tie
      // notebook on the lap
      c.save(); c.translate(7, -9); c.rotate(-0.3); rr(c, -6, -4, 12, 8, 1); fs(c, '#8e4256', 0.8, 0.5); line(c, -4, -2, 4, -2, 'rgba(243,200,115,0.7)', 0.8); c.restore();
      // arm to mouth with candy
      const mx = 8.6, my = -29 + ch * 0.2;
      limb(c, 2, -23, mx, my + 2, 3, navy, 6, -22); ell(c, mx, my + 1.6, 1.9, 1.9); fs(c, P.skin, 0.6, 0.5);
      c.save(); c.translate(mx + 3.6, my - 1); c.rotate(0.3); ell(c, 0, 0, 3.6, 2.8); fs(c, '#f4a8c4', 0.7, 0.55); for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 3.4, 0); c.lineTo(s * 6.4, -2.4); c.lineTo(s * 6.4, 2.4); c.closePath(); fs(c, '#e86a9a', 0.6, 0.5); } c.restore();
      kidHead(c, 0.4, -34, 7.6, { hair: '#5a3b2e', mouth: 'munch', t, eyesClosed: true, look: 0.3 });
      // glasses
      for (const s of [-1, 1]) { ell(c, s * 3.1 + 1.2, -33.4, 3.4, 3.4); c.strokeStyle = '#3a3340'; c.lineWidth = 1.1; c.stroke(); ell(c, s * 3.1 + 0.4, -34.4, 1, 0.6); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fill(); } line(c, -0.4, -33.6, 0.6, -33.6, '#3a3340', 1);
      // crumbs + hearts
      for (let i = 0; i < 3; i++) { const u = (t * 0.8 + i / 3) % 1; ell(c, 8 + i * 2 + u * 3, -24 + u * 20, 0.8, 0.8); c.fillStyle = 'rgba(244,168,196,' + (1 - u).toFixed(2) + ')'; c.fill(); }
      const hp = (t * 0.5) % 1; c.globalAlpha = 1 - hp; const hx = -8 + sin(hp * 6) * 2, hy = -44 - hp * 12; c.beginPath(); c.moveTo(hx, hy + 2); c.bezierCurveTo(hx - 4, hy - 1, hx - 2, hy - 4, hx, hy - 2); c.bezierCurveTo(hx + 2, hy - 4, hx + 4, hy - 1, hx, hy + 2); c.fillStyle = '#d4708a'; c.fill(); c.globalAlpha = 1;
      c.restore(); c.restore(); return;
    }
    const run = st === 'run', ph = t * (run ? 15 : 9), sw = sin(ph), bob = -abs(sin(ph)) * (run ? 2 : 1.1), lean = run ? 0.16 : 0.03;
    const sh = -28 + bob, hip = -14 + bob * 0.5;
    for (const s of [-1, 1]) { const pp = s > 0 ? sw : -sw, fx = s * 1 + pp * (run ? 8 : 4.6), fy = -max(0, -pp) * (run ? 5 : 2.6); limb(c, 0, hip, fx, fy - 3, 3.8, s > 0 ? navy : navyD, (fx) / 2 + 1.6, (hip + fy) / 2); ell(c, fx + 1.6, fy - 1.4, 4, 2.4); fs(c, '#2a2226', 0.8, 0.55); c.beginPath(); c.moveTo(fx - 2, fy - 4.8); c.lineTo(fx + 2, fy - 4.8); c.strokeStyle = '#efe6d0'; c.lineWidth = 1.6; c.stroke(); }
    c.save(); c.translate(0, hip); c.rotate(lean); c.translate(0, -hip);
    // back arm swing
    limb(c, -2, sh + 3, -4 - sw * (run ? 5 : 2), hip - 2 + (run ? -3 : 0), 3.2, navyD, null);
    c.beginPath(); c.moveTo(-5.6, sh); c.quadraticCurveTo(-7.8, hip - 3, -7, hip + 3); c.quadraticCurveTo(0, hip + 5.6, 7, hip + 3); c.quadraticCurveTo(7.8, hip - 3, 5.6, sh); c.quadraticCurveTo(0, sh - 2, -5.6, sh); c.closePath(); fs(c, navy, 1.2, 0.58);
    c.beginPath(); c.moveTo(0, sh); c.lineTo(0.4, hip + 4); c.strokeStyle = 'rgba(243,200,115,0.5)'; c.lineWidth = 0.9; c.stroke(); ell(c, 1.6, sh + 7, 0.9, 0.9); c.fillStyle = '#c8a050'; c.fill(); ell(c, 1.6, sh + 11.6, 0.9, 0.9); c.fill();
    c.beginPath(); c.moveTo(-3.4, sh + 0.4); c.lineTo(0, sh + 6); c.lineTo(3.4, sh + 0.4); c.closePath(); fs(c, '#f7f2ea', 0.7, 0.5);
    ell(c, 0, sh + 5.4, 2, 1.5); fs(c, P.bordeauxLight, 0.6, 0.5);
    // notebook clutched to the chest, pencil
    const nb = run ? sin(ph * 2) * 1.4 : 0;
    c.save(); c.translate(7.2, sh + 12 + nb); c.rotate(run ? -0.3 + nb * 0.05 : -0.1); rr(c, -6.4, -5, 12.8, 10, 1.2); fs(c, '#8e4256', 1, 0.55); rr(c, -6.4, -5, 2.6, 10, 1); c.fillStyle = '#5a1f2e'; c.fill(); rr(c, -1.4, -3.4, 6, 4, 0.8); c.fillStyle = '#efe6d0'; c.fill(); line(c, -3, 3, 5, -2, '#d4ad5a', 1.4); c.restore();
    limb(c, 3, sh + 3, 6.4, sh + 13 + nb, 3.2, navy, 8, sh + 6); ell(c, 6.4, sh + 13.6 + nb, 1.9, 1.9); fs(c, P.skin, 0.6, 0.5);
    // head: neat side-part, big round glasses
    kidHead(c, 0.8, sh - 9, 8, { hair: '#4a3328', mouth: 'prim', t, blink: blink(t + 2), look: 0.8 });
    c.beginPath(); c.moveTo(-3, sh - 16.4); c.quadraticCurveTo(0, sh - 13.6, 4.6, sh - 15.6); c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1; c.stroke();
    for (const s of [-1, 1]) { ell(c, s * 3.3 + 1.6, sh - 8.4, 3.7, 3.7); c.strokeStyle = '#3a3340'; c.lineWidth = 1.2; c.stroke(); c.fillStyle = 'rgba(190,215,235,0.18)'; c.fill(); ell(c, s * 3.3 + 0.8, sh - 9.6, 1, 0.6); c.fillStyle = 'rgba(255,255,255,0.8)'; c.fill(); }
    line(c, -0.2, sh - 8.6, 1.2, sh - 8.6, '#3a3340', 1.1); line(c, 8.6, sh - 8.6, 9.6, sh - 7.6, '#3a3340', 1);
    c.restore(); c.restore();
  }

  // black round cat ~26 px long. state 'walk' | 'sit' | 'startle' (fur poofed). o.k 0..1 optional hop progress for 'startle'.
  function drawCat(c, x, y, o) {
    o = o || {};
    const f = o.facing < 0 ? -1 : 1, t = o.t || 0, st = o.state || 'walk';
    const hop = st === 'startle' ? sin(clamp(o.k == null ? 0.5 : o.k, 0, 1) * PI) * 12 : 0;
    c.save(); c.translate(x, y); c.scale(f, 1);
    c.fillStyle = 'rgba(10,6,16,0.3)'; ell(c, 0, 0.5, 12 - hop * 0.3, 2.4); c.fill();
    c.translate(0, -hop);
    const fur = '#1b1823', furL = '#2d2a3a', pk = '#d4708a';
    const poof = st === 'startle' ? 1 : 0;
    if (st === 'sit') {
      const br = sin(t * 2) * 0.5;
      // tail curled around front
      c.beginPath(); c.moveTo(-8, -2); c.quadraticCurveTo(-14, -4, -10, 1); c.quadraticCurveTo(0, 4.6, 11, 0.6); c.quadraticCurveTo(14, -1, 12, -3); c.strokeStyle = ink(0.6); c.lineWidth = 6.4; c.lineCap = 'round'; c.stroke(); c.strokeStyle = fur; c.lineWidth = 4.8; c.stroke();
      // body pear-shaped
      c.beginPath(); c.moveTo(-9, 0); c.bezierCurveTo(-13, -5, -9, -17, 0, -19 + br); c.bezierCurveTo(8, -17, 11, -5, 8, 0); c.quadraticCurveTo(0, 2.4, -9, 0); c.closePath(); fs(c, fur, 1.2, 0.62);
      ell(c, 3, -7, 4.4, 6.4); c.fillStyle = furL; c.globalAlpha = 0.5; c.fill(); c.globalAlpha = 1;
      // front paws
      for (const s of [0, 1]) { ell(c, 5 + s * 4.4, -1.2, 2.6, 2); fs(c, fur, 0.8, 0.55); }
      // head
      const hy = -22 + br, tw = max(0, sin(t * 0.9)) > 0.97 ? 1 : 0;
      c.save(); c.translate(2, hy); c.rotate(sin(t * 0.7) * 0.05);
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 2.4, -4.4); c.lineTo(s * 7, -12 - (s > 0 ? tw * 1.4 : 0)); c.lineTo(s * 8.2, -2.4); c.closePath(); fs(c, fur, 1, 0.6); c.beginPath(); c.moveTo(s * 3.8, -5.6); c.lineTo(s * 6.6, -9.8); c.lineTo(s * 7, -4); c.closePath(); c.fillStyle = pk; c.globalAlpha = 0.7; c.fill(); c.globalAlpha = 1; }
      ell(c, 0, 0, 9.6, 8.2); fs(c, fur, 1.2, 0.62);
      catFace(c, t, 0, 'calm');
      c.restore();
      c.restore(); return;
    }
    // walking / startled four-legged
    const ph = t * 7, sw = st === 'walk' ? sin(ph) : 0, bob = st === 'walk' ? -abs(sin(ph)) * 0.9 : 0;
    const arch = poof ? 5 : 0;
    // tail
    const tl = poof ? 1 : 0;
    c.save(); c.translate(-9, -9 + bob);
    c.beginPath(); c.moveTo(0, 2);
    if (poof) { c.bezierCurveTo(-8, -4, -6, -16, -2, -20); } else c.bezierCurveTo(-8, 0, -12 + sin(t * 2.2) * 2, -8, -8 + sin(t * 2.6) * 3, -17 + sin(t * 1.7) * 1.4);
    c.strokeStyle = ink(0.6); c.lineWidth = (poof ? 9 : 5.8); c.lineCap = 'round'; c.stroke(); c.strokeStyle = fur; c.lineWidth = poof ? 7.6 : 4.4; c.stroke();
    if (poof) for (let i = 0; i < 6; i++) { const u = i / 5; const px = -8 * u * 0.7 - 1, py = -4 - u * 14; line(c, px, py, px - 4 - (i % 2) * 2, py - 2, fur, 1.4); line(c, px + 2, py, px + 5, py - 2.4, fur, 1.4); }
    c.restore();
    // legs
    for (const [lx, ph2] of [[-6, 0], [-3, PI], [5, PI], [8, 0]]) { const l = st === 'walk' ? sin(ph + ph2) * 3.2 : 0, lf = st === 'walk' ? max(0, cos(ph + ph2)) * 2 : 0, sp = poof ? (lx < 0 ? -2 : 2) : 0; limb(c, lx, -8 + bob, lx + l + sp, -1.4 - lf, 3.4, fur, null); ell(c, lx + l + 0.8 + sp, -1.2 - lf, 2.8, 1.8); fs(c, fur, 0.7, 0.55); }
    // body (round)
    ell(c, 0, -10 + bob - arch * 0.4, 11.6 + poof * 1, 8.4 + arch * 0.5); fs(c, fur, 1.2, 0.62);
    ell(c, 1, -7 + bob, 6.6, 4); c.fillStyle = furL; c.globalAlpha = 0.45; c.fill(); c.globalAlpha = 1;
    if (poof) for (let i = 0; i < 11; i++) { const a = -PI + 0.15 + i * 0.27; const rx = 12.6, ry = 10.2; const bx = cos(a) * rx * 0.96, by = -10 - arch * 0.4 + sin(a) * ry * 0.96; c.beginPath(); c.moveTo(bx - 1.6, by + 1); c.lineTo(cos(a) * (rx + 4.4), -10 - arch * 0.4 + sin(a) * (ry + 4.4)); c.lineTo(bx + 1.6, by - 1); c.closePath(); fs(c, fur, 0.8, 0.5); }
    // head
    c.save(); c.translate(10, -14 + bob - poof * 1); c.rotate(poof ? -0.2 : sin(ph) * 0.03);
    for (const s of [-1, 1]) { const ex = s * 5.4 + (s < 0 ? -1 : 1); c.beginPath(); c.moveTo(s * 2, -4.6); c.lineTo(s * 6.6, -12.4 - poof * 1.4); c.lineTo(s * 8, -2.6); c.closePath(); fs(c, fur, 1, 0.6); c.beginPath(); c.moveTo(s * 3.6, -5.6); c.lineTo(s * 6.4, -9.8); c.lineTo(s * 6.8, -4); c.closePath(); c.fillStyle = pk; c.globalAlpha = 0.7; c.fill(); c.globalAlpha = 1; }
    ell(c, 0, 0, 9.4, 8); fs(c, fur, 1.2, 0.62);
    catFace(c, t, poof, poof ? 'hiss' : 'calm');
    c.restore();
    c.restore();
  }
  function catFace(c, t, poof, mood) {
    const bl = poof ? 0 : (t % 4.7 > 4.55 ? 1 : 0), er = poof ? 3.6 : 3.1;
    for (const s of [-1, 1]) {
      const ex = s * 3.8;
      if (bl) { c.beginPath(); c.arc(ex, 0.4, 2.2, 0.1, PI - 0.1); c.strokeStyle = '#d6d86a'; c.lineWidth = 1.2; c.stroke(); continue; }
      ell(c, ex, 0, er, er * 1.06); fs(c, '#e3e26a', 0.7, 0.55); ell(c, ex, 0, er * (poof ? 0.34 : 0.4), er * (poof ? 0.9 : 0.95)); c.fillStyle = '#100c15'; c.fill();
      ell(c, ex - 0.7, -1, 0.9, 0.9); c.fillStyle = '#fff'; c.fill();
    }
    c.beginPath(); c.moveTo(-1, 3); c.lineTo(1, 3); c.lineTo(0, 4.2); c.closePath(); c.fillStyle = '#d4708a'; c.fill();
    if (mood === 'hiss') { c.beginPath(); c.moveTo(-3.6, 5.2); c.quadraticCurveTo(0, 8.2, 3.6, 5.2); c.quadraticCurveTo(0, 6, -3.6, 5.2); c.fillStyle = '#7a2a3a'; c.fill(); c.strokeStyle = '#efe6d0'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-2.4, 5.6); c.lineTo(-2.2, 7); c.moveTo(2.4, 5.6); c.lineTo(2.2, 7); c.stroke(); }
    else { c.beginPath(); c.moveTo(0, 4.2); c.quadraticCurveTo(-1.6, 5.8, -3, 4.8); c.moveTo(0, 4.2); c.quadraticCurveTo(1.6, 5.8, 3, 4.8); c.strokeStyle = 'rgba(210,200,220,0.7)'; c.lineWidth = 0.8; c.stroke(); }
    c.strokeStyle = 'rgba(220,215,235,0.55)'; c.lineWidth = 0.7; for (const s of [-1, 1]) for (let i = 0; i < 2; i++) { c.beginPath(); c.moveTo(s * 4.6, 3.4 + i * 1.2); c.lineTo(s * 11, 2.4 + i * 2.4 + (poof ? -1 : 0)); c.stroke(); }
  }
  // ==== M3 END

  G.art = { drawPortal, drawKey, drawCandy, drawBag, drawFeather, drawNest, drawJanitor, drawFlashlight, janitorTorch, drawTwins, drawBalloon, drawTattle, drawCat, drawVase, drawPortcullis, drawSkeleton, drawRock, drawWeb, drawTorch, drawPuzzleCandle, drawDoor, drawScroll, drawVortex, drawGhost, drawGhostCone, drawBackground, drawTiles, drawIvy, drawSleeper, drawWalker, drawZzz, drawHideSpot, drawTrap, drawDeco, drawCrow, drawSpider, drawThread, drawLight, drawBubble, drawCard };
})();
