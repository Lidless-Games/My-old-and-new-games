// Almaszedés – rajzolt (vektoros) grafika: rajzfilmes stílus teljes egészében, fotós stílushoz a hiányzó elemek.
// Minden rajzoló függvény a saját "dobozának" koordinátáiban dolgozik; a hívó translate/scale-lel helyezi el.
// Doboz-méretek: alma 134², lavór 350², madár 320², sün 280×180, láda 200×170, bónusz 134².
(function (root) {
  const AS = (root.AS = root.AS || {});
  const CFG = AS.CFG;
  const TAU = Math.PI * 2;

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w);
    c.height = Math.ceil(h);
    return c;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function ell(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
  }
  function lwOf(o, base) {
    return base * (o && o.lw != null ? o.lw : 1);
  }

  // ---------------------------------------------------------------- alma
  const APPLE_PAL = {
    red: { hi: '#ff9484', mid: '#e3252b', lo: '#a30f1e', line: '#560914' },
    green: { hi: '#e2ff92', mid: '#80d22f', lo: '#3f8f1d', line: '#1c4a10' },
    gold: { hi: '#fffbb0', mid: '#ffc81c', lo: '#d17a00', line: '#6a3c00' },
  };

  function applePath(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 0.66 * r);
    ctx.bezierCurveTo(cx + 0.3 * r, cy - 1.02 * r, cx + 1.02 * r, cy - 0.92 * r, cx + 1.0 * r, cy - 0.08 * r);
    ctx.bezierCurveTo(cx + 1.0 * r, cy + 0.58 * r, cx + 0.5 * r, cy + 1.0 * r, cx, cy + 0.92 * r);
    ctx.bezierCurveTo(cx - 0.5 * r, cy + 1.0 * r, cx - 1.0 * r, cy + 0.58 * r, cx - 1.0 * r, cy - 0.08 * r);
    ctx.bezierCurveTo(cx - 1.02 * r, cy - 0.92 * r, cx - 0.3 * r, cy - 1.02 * r, cx, cy - 0.66 * r);
    ctx.closePath();
  }

  function drawWorm(ctx, cx, cy, r, o) {
    const lw = Math.max(1.5, lwOf(o, r * 0.1));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // barnás rothadt folt a lyuk körül
    const bg = ctx.createRadialGradient(cx + 0.36 * r, cy + 0.12 * r, 0, cx + 0.36 * r, cy + 0.12 * r, 0.6 * r);
    bg.addColorStop(0, 'rgba(92,48,16,0.95)');
    bg.addColorStop(0.7, 'rgba(110,56,20,0.6)');
    bg.addColorStop(1, 'rgba(110,56,20,0)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(cx + 0.36 * r, cy + 0.12 * r, 0.6 * r, 0, TAU);
    ctx.fill();
    // lyuk
    ell(ctx, cx + 0.36 * r, cy + 0.14 * r, 0.24 * r, 0.19 * r, -0.2);
    ctx.fillStyle = '#240c04';
    ctx.fill();
    ctx.strokeStyle = '#6d3512';
    ctx.lineWidth = lw * 0.9;
    ctx.stroke();
    // kukac: a lyukból kikunkorodva
    const pts = [
      [cx + 0.36 * r, cy + 0.1 * r],
      [cx + 0.55 * r, cy - 0.2 * r],
      [cx + 0.86 * r, cy - 0.36 * r],
      [cx + 1.1 * r, cy - 0.7 * r],
    ];
    function body(w, col) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.bezierCurveTo(pts[1][0], pts[1][1] - 0.1 * r, pts[2][0] - 0.1 * r, pts[2][1] + 0.1 * r, pts[2][0], pts[2][1]);
      ctx.bezierCurveTo(pts[2][0] + 0.2 * r, pts[2][1] - 0.15 * r, pts[3][0] - 0.2 * r, pts[3][1] + 0.1 * r, pts[3][0], pts[3][1]);
      ctx.stroke();
    }
    body(0.42 * r + lw * 1.4, '#1d4a12');
    body(0.42 * r, '#8fdc3c');
    // gyűrűk
    ctx.strokeStyle = 'rgba(40,110,20,0.55)';
    ctx.lineWidth = Math.max(1, r * 0.04);
    for (const q of [[0.62, -0.26], [0.78, -0.36], [0.94, -0.46]]) {
      ctx.beginPath();
      ctx.arc(cx + q[0] * r, cy + q[1] * r, 0.17 * r, -2.4, 0.9);
      ctx.stroke();
    }
    // fej
    const hx = pts[3][0], hy = pts[3][1];
    ctx.beginPath();
    ctx.arc(hx, hy, 0.27 * r, 0, TAU);
    ctx.fillStyle = '#a6ec4a';
    ctx.fill();
    ctx.strokeStyle = '#1d4a12';
    ctx.lineWidth = lw;
    ctx.stroke();
    // szemek
    for (const dx of [-0.1, 0.1]) {
      ctx.beginPath();
      ctx.arc(hx + dx * r, hy - 0.05 * r, 0.085 * r, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hx + dx * r + 0.01 * r, hy - 0.04 * r, 0.04 * r, 0, TAU);
      ctx.fillStyle = '#111';
      ctx.fill();
    }
    ctx.strokeStyle = '#1d4a12';
    ctx.lineWidth = Math.max(1, r * 0.035);
    ctx.beginPath();
    ctx.arc(hx, hy + 0.04 * r, 0.1 * r, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.restore();
  }

  function drawApple(ctx, kind, cx, cy, r, o) {
    o = o || {};
    const pal = APPLE_PAL[kind === 'worm' ? 'red' : kind] || APPLE_PAL.red;
    const lw = Math.max(1.4, lwOf(o, r * 0.12));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // szár
    const stem = function () {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 0.5 * r);
      ctx.quadraticCurveTo(cx - 0.02 * r, cy - 1.0 * r, cx + 0.2 * r, cy - 1.3 * r);
    };
    ctx.strokeStyle = '#3d2210';
    ctx.lineWidth = r * 0.17 + lw * 1.6;
    stem();
    ctx.stroke();
    ctx.strokeStyle = '#8a5428';
    ctx.lineWidth = r * 0.17;
    stem();
    ctx.stroke();
    // levél
    if (!o.noLeaf) {
    ctx.save();
    ctx.translate(cx + 0.28 * r, cy - 1.08 * r);
    ctx.rotate(-0.45);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(0.2 * r, -0.36 * r, 0.7 * r, -0.36 * r, 0.9 * r, -0.04 * r);
    ctx.bezierCurveTo(0.65 * r, 0.26 * r, 0.2 * r, 0.22 * r, 0, 0);
    ctx.fillStyle = '#5ecb3c';
    ctx.fill();
    ctx.strokeStyle = '#1d6420';
    ctx.lineWidth = lw * 0.85;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0.05 * r, 0);
    ctx.lineTo(0.72 * r, -0.04 * r);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = Math.max(1, r * 0.04);
    ctx.stroke();
    ctx.restore();
    }
    // test
    applePath(ctx, cx, cy, r);
    const g = ctx.createRadialGradient(cx - 0.38 * r, cy - 0.42 * r, r * 0.08, cx + 0.05 * r, cy + 0.05 * r, r * 1.25);
    g.addColorStop(0, pal.hi);
    g.addColorStop(0.42, pal.mid);
    g.addColorStop(1, pal.lo);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = lw;
    ctx.stroke();
    // csillogás
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ell(ctx, cx - 0.52 * r, cy - 0.42 * r, 0.17 * r, 0.3 * r, 0.55);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - 0.3 * r, cy - 0.7 * r, 0.07 * r, 0, TAU);
    ctx.fill();
    if (kind === 'gold') {
      // kis csillagok
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = pal.line;
      ctx.lineWidth = Math.max(1, lw * 0.5);
      star(ctx, cx + 0.5 * r, cy + 0.38 * r, r * 0.2, true);
    }
    if (kind === 'worm') drawWorm(ctx, cx, cy, r, o);
    ctx.restore();
  }

  function star(ctx, x, y, s, stroke) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      const rr = i % 2 === 0 ? s : s * 0.3;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    if (stroke) ctx.stroke();
  }

  // ---------------------------------------------------------------- lavór (doboz 350², tál: x 16–334, y 157–349, perem-ellipszis közepe y=185)
  const PILE = [
    // [fázis, x, y, r, fajta]
    [1, 108, 200, 33, 'red'], [1, 172, 204, 34, 'red'], [1, 236, 200, 33, 'green'], [1, 288, 197, 27, 'red'],
    [2, 74, 178, 33, 'red'], [2, 140, 170, 35, 'gold'], [2, 206, 172, 35, 'red'], [2, 266, 176, 33, 'red'],
    [3, 106, 146, 34, 'green'], [3, 172, 138, 37, 'red'], [3, 238, 146, 34, 'red'], [3, 140, 112, 31, 'red'],
    [3, 204, 108, 31, 'gold'],
  ];

  function drawBasin(ctx, phase, o) {
    o = o || {};
    const lw = lwOf(o, 8);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const CX = 175, CY = 185, RX = 159, RY = 29;
    // test
    ctx.beginPath();
    ctx.moveTo(16, CY);
    ctx.bezierCurveTo(20, 262, 46, 346, 118, 347);
    ctx.lineTo(232, 347);
    ctx.bezierCurveTo(304, 346, 330, 262, 334, CY);
    ctx.ellipse(CX, CY, RX, RY, 0, 0, Math.PI, false);
    ctx.closePath();
    const g = ctx.createLinearGradient(16, 0, 334, 0);
    g.addColorStop(0, '#1a49c4');
    g.addColorStop(0.28, '#4a97ff');
    g.addColorStop(0.55, '#2f78f0');
    g.addColorStop(1, '#1639a8');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#0d2a78';
    ctx.lineWidth = lw;
    ctx.stroke();
    // oldalcsillogás + csíkok
    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    ctx.lineWidth = lwOf(o, 12);
    ctx.beginPath();
    ctx.moveTo(52, 240);
    ctx.quadraticCurveTo(66, 305, 100, 330);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(10,30,110,0.25)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(34, 262);
    ctx.quadraticCurveTo(175, 300, 316, 262);
    ctx.stroke();
    // perem
    ell(ctx, CX, CY, RX, RY);
    const rg = ctx.createLinearGradient(0, CY - RY, 0, CY + RY);
    rg.addColorStop(0, '#9fcdff');
    rg.addColorStop(1, '#5aa4ff');
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.strokeStyle = '#0d2a78';
    ctx.lineWidth = lw;
    ctx.stroke();
    // belső (üres tál)
    ell(ctx, CX, CY + 2, RX - 14, RY - 8);
    const ig = ctx.createLinearGradient(0, CY - 20, 0, CY + 24);
    ig.addColorStop(0, '#173a9a');
    ig.addColorStop(1, '#2860d8');
    ctx.fillStyle = ig;
    ctx.fill();
    ctx.strokeStyle = 'rgba(8,26,100,0.7)';
    ctx.lineWidth = lwOf(o, 4);
    ctx.stroke();
    // alma-halom, levágva az első perem mögé
    if (phase > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, 350, CY + 2);
      ctx.ellipse(CX, CY + 2, RX - 14, RY - 8, 0, 0, Math.PI);
      ctx.clip();
      const items = PILE.filter((p) => p[0] <= phase).sort((a, b) => a[2] - b[2]);
      for (const p of items) drawApple(ctx, p[4], p[1], p[2] + 4, p[3], { lw: (o.lw == null ? 1 : o.lw) * 0.8, noLeaf: true });
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- madár (doboz 320², jobbra néz)
  function wing(ctx, sx, sy, psi, L, far, lw) {
    let dx = -0.25 * Math.sin(psi), dy = -Math.cos(psi);
    const ln = Math.hypot(dx, dy);
    dx /= ln;
    dy /= ln;
    const nx = -dy, ny = dx;
    const P = (a, b) => [sx + dx * a + nx * b, sy + dy * a + ny * b];
    const p0 = P(0, -30), t1 = P(L * 0.35, -52), t2 = P(L * 0.8, -40), tip = P(L, -8),
      f1 = P(L * 1.02, 14), f2 = P(L * 0.85, 30), b1 = P(L * 0.45, 56), b0 = P(0, 32);
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.bezierCurveTo(t1[0], t1[1], t2[0], t2[1], tip[0], tip[1]);
    ctx.quadraticCurveTo(f1[0], f1[1], f2[0], f2[1]);
    ctx.quadraticCurveTo(P(L * 0.78, 40)[0], P(L * 0.78, 40)[1], P(L * 0.6, 44)[0], P(L * 0.6, 44)[1]);
    ctx.bezierCurveTo(b1[0], b1[1], b1[0], b1[1], b0[0], b0[1]);
    ctx.closePath();
    const e = P(L, 0);
    const g = ctx.createLinearGradient(sx, sy, e[0], e[1]);
    g.addColorStop(0, far ? '#222a8a' : '#3a50d6');
    g.addColorStop(1, far ? '#151a64' : '#1f2584');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#10154f';
    ctx.lineWidth = lw;
    ctx.stroke();
    if (!far) {
      ctx.strokeStyle = 'rgba(150,175,255,0.65)';
      ctx.lineWidth = 3;
      for (const k of [-16, 0, 16]) {
        const a = P(L * 0.35, k), b = P(L * 0.88, k * 0.7 + 4);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
    }
  }

  function drawBird(ctx, frame, o) {
    o = o || {};
    const lw = lwOf(o, 6);
    const sw = Math.cos((TAU * frame) / 9); // 1 = fent
    const psi = ((12 + ((1 - sw) / 2) * 140) * Math.PI) / 180;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const OUT = '#10154f';
    wing(ctx, 142, 138, psi * 0.9 + 0.12, 108, true, lw);
    // farok
    ctx.beginPath();
    ctx.moveTo(100, 148);
    ctx.bezierCurveTo(70, 150, 40, 168, 14, 188);
    ctx.lineTo(24, 196);
    ctx.bezierCurveTo(56, 190, 86, 186, 112, 180);
    ctx.closePath();
    ctx.fillStyle = '#2c3fb8';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.strokeStyle = '#6f86ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(96, 160);
    ctx.lineTo(34, 188);
    ctx.stroke();
    // test
    ctx.save();
    ctx.translate(158, 164);
    ctx.rotate(-0.12);
    ell(ctx, 0, 0, 92, 42);
    const bg = ctx.createLinearGradient(0, -42, 0, 42);
    bg.addColorStop(0, '#5a98ff');
    bg.addColorStop(0.55, '#3566e6');
    bg.addColorStop(1, '#28459f');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = lw;
    ctx.stroke();
    // has
    ctx.save();
    ell(ctx, 0, 0, 92, 42);
    ctx.clip();
    ell(ctx, 8, 38, 80, 26);
    ctx.fillStyle = '#a5dcff';
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // fej
    ctx.beginPath();
    ctx.arc(232, 128, 38, 0, TAU);
    const hg = ctx.createRadialGradient(222, 112, 4, 232, 128, 42);
    hg.addColorStop(0, '#76acff');
    hg.addColorStop(1, '#3461df');
    ctx.fillStyle = hg;
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = lw;
    ctx.stroke();
    ell(ctx, 241, 132, 19, 15, 0.1);
    ctx.fillStyle = '#e3f6ff';
    ctx.fill();
    // szem
    ctx.beginPath();
    ctx.arc(243, 121, 11, 0, TAU);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(246, 122, 5.5, 0, TAU);
    ctx.fillStyle = '#0a0a22';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(248, 119.5, 1.8, 0, TAU);
    ctx.fillStyle = '#fff';
    ctx.fill();
    // csőr
    ctx.beginPath();
    ctx.moveTo(262, 112);
    ctx.bezierCurveTo(286, 112, 300, 128, 296, 148);
    ctx.bezierCurveTo(288, 140, 272, 142, 262, 148);
    ctx.closePath();
    ctx.fillStyle = '#ffb521';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = lw * 0.85;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(264, 140);
    ctx.quadraticCurveTo(280, 134, 294, 142);
    ctx.strokeStyle = '#b86d00';
    ctx.lineWidth = 3;
    ctx.stroke();
    // lábak / karmok
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 5;
    for (const fx of [150, 176]) {
      ctx.beginPath();
      ctx.moveTo(fx, 196);
      ctx.lineTo(fx - 2, 214);
      ctx.moveTo(fx - 2, 214);
      ctx.lineTo(fx - 12, 222);
      ctx.moveTo(fx - 2, 214);
      ctx.lineTo(fx + 8, 224);
      ctx.stroke();
    }
    // közelebbi szárny
    wing(ctx, 160, 140, psi, 124, false, lw);
    ctx.restore();
  }

  // ---------------------------------------------------------------- sün (doboz 280×180, jobbra néz, talp y≈172)
  function drawHedgehog(ctx, o) {
    o = o || {};
    const lw = lwOf(o, 6);
    const OUT = '#3a2010';
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // lábak
    for (const fx of [96, 186]) {
      ell(ctx, fx, 163, 22, 11);
      ctx.fillStyle = '#e9bd8c';
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = lw * 0.8;
      ctx.stroke();
    }
    // tüskés test
    const cx = 128, cy = 108, rx = 108, ry = 66;
    function spikes(scale, off, fill, stroke, n, h) {
      ctx.beginPath();
      const a0 = (155 * Math.PI) / 180, a1 = (388 * Math.PI) / 180;
      for (let i = 0; i <= n * 2; i++) {
        const t = i / (n * 2);
        const a = a0 + (a1 - a0) * t;
        const k = i % 2 === 0 ? 1.0 : 1 + h;
        const px = cx + off + Math.cos(a) * rx * scale * k;
        const py = cy + Math.sin(a) * ry * scale * k * (a > Math.PI * 1.9 ? 0.95 : 1);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.lineTo(cx + off + 70, 162);
      ctx.lineTo(cx + off - 90, 162);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lw;
        ctx.stroke();
      }
    }
    spikes(1, 0, '#6a4024', OUT, 15, 0.2);
    const g = ctx.createLinearGradient(0, 40, 0, 160);
    g.addColorStop(0, '#b58450');
    g.addColorStop(1, '#6a4024');
    spikes(0.8, -4, g, null, 12, 0.18);
    ctx.strokeStyle = 'rgba(255,225,170,0.5)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      const a = (200 + i * 19) * (Math.PI / 180);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * rx * 0.55, cy + Math.sin(a) * ry * 0.55);
      ctx.lineTo(cx + Math.cos(a) * rx * 0.82, cy + Math.sin(a) * ry * 0.82);
      ctx.stroke();
    }
    // arc
    ctx.beginPath();
    ctx.moveTo(180, 66);
    ctx.bezierCurveTo(222, 62, 252, 92, 276, 116);
    ctx.bezierCurveTo(264, 138, 238, 152, 204, 154);
    ctx.lineTo(160, 154);
    ctx.closePath();
    ctx.fillStyle = '#f6d6a8';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = lw;
    ctx.stroke();
    // fül
    ctx.beginPath();
    ctx.arc(194, 76, 15, 0, TAU);
    ctx.fillStyle = '#d99a72';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(194, 77, 7, 0, TAU);
    ctx.fillStyle = '#f2a0a0';
    ctx.fill();
    // arcpír
    ctx.beginPath();
    ctx.arc(232, 128, 12, 0, TAU);
    ctx.fillStyle = 'rgba(255,120,120,0.5)';
    ctx.fill();
    // szem
    ctx.beginPath();
    ctx.arc(231, 103, 8.5, 0, TAU);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(233.5, 100.5, 2.8, 0, TAU);
    ctx.fillStyle = '#fff';
    ctx.fill();
    // orr
    ctx.beginPath();
    ctx.arc(272, 118, 9, 0, TAU);
    ctx.fillStyle = '#18100c';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(269, 115, 2.5, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
    // száj
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(250, 130, 12, 0.3, 1.5);
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- láda (doboz 200×170, talp y≈165)
  function drawCrate(ctx, full, o) {
    o = o || {};
    const lw = lwOf(o, 6);
    const OUT = '#4a2a10';
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // belső (hátsó fal)
    ctx.beginPath();
    ctx.moveTo(20, 58);
    ctx.lineTo(180, 58);
    ctx.lineTo(188, 78);
    ctx.lineTo(12, 78);
    ctx.closePath();
    ctx.fillStyle = '#6b4020';
    ctx.fill();
    if (full) {
      const ap = [
        [40, 56, 30, 'red'], [88, 52, 32, 'green'], [136, 56, 30, 'red'], [164, 60, 24, 'gold'],
        [64, 40, 28, 'red'], [112, 36, 30, 'gold'], [150, 42, 26, 'red'],
      ];
      for (const a of ap) drawApple(ctx, a[3], a[0], a[1] + 6, a[2], { lw: (o.lw == null ? 1 : o.lw) * 0.8, noLeaf: true });
    }
    // első deszkák
    const planks = [[78, 108], [108, 138], [138, 166]];
    const y0 = 76;
    ctx.beginPath();
    ctx.rect(10, y0, 180, 90);
    const g = ctx.createLinearGradient(0, y0, 0, 166);
    g.addColorStop(0, '#f0b868');
    g.addColorStop(1, '#c47a30');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.lineWidth = lw * 0.7;
    for (const y of [106, 136]) {
      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(190, y);
      ctx.stroke();
    }
    // erezet
    ctx.strokeStyle = 'rgba(120,60,10,0.35)';
    ctx.lineWidth = 2;
    for (const p of [[40, 92, 100], [130, 96, 170], [30, 122, 80], [120, 124, 176], [50, 152, 120], [150, 150, 176]]) {
      ctx.beginPath();
      ctx.moveTo(p[1] > 100 ? p[0] : p[0], p[1]);
      ctx.lineTo(p[2], p[1] + 2);
      ctx.stroke();
    }
    // szegélyléc / oszlopok
    ctx.fillStyle = '#9a5a22';
    ctx.strokeStyle = OUT;
    ctx.lineWidth = lw * 0.9;
    for (const x of [10, 160]) {
      ctx.beginPath();
      ctx.rect(x, y0 - 4, 30, 94);
      ctx.fill();
      ctx.stroke();
    }
    // szegecsek
    ctx.fillStyle = '#ffe2a8';
    for (const x of [25, 175]) for (const y of [90, 121, 151]) {
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- szív, bónuszok, szél
  function heartPath(ctx, cx, cy, s) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + 0.9 * s);
    ctx.bezierCurveTo(cx - 1.35 * s, cy - 0.05 * s, cx - 0.9 * s, cy - 1.0 * s, cx, cy - 0.38 * s);
    ctx.bezierCurveTo(cx + 0.9 * s, cy - 1.0 * s, cx + 1.35 * s, cy - 0.05 * s, cx, cy + 0.9 * s);
    ctx.closePath();
  }
  function drawHeart(ctx, cx, cy, s, o) {
    o = o || {};
    ctx.save();
    ctx.lineJoin = 'round';
    heartPath(ctx, cx, cy, s);
    const g = ctx.createRadialGradient(cx - 0.4 * s, cy - 0.45 * s, s * 0.1, cx, cy, s * 1.3);
    g.addColorStop(0, '#ff8aa0');
    g.addColorStop(0.45, '#f0224f');
    g.addColorStop(1, '#a30c33');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#5a0618';
    ctx.lineWidth = Math.max(1.5, lwOf(o, s * 0.2));
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ell(ctx, cx - 0.55 * s, cy - 0.42 * s, 0.17 * s, 0.3 * s, 0.7);
    ctx.fill();
    ctx.restore();
  }

  const TOKEN = {
    bonus_wide: ['#ffe39a', '#ffa21f', '#b45f00'],
    bonus_slow: ['#c8f0ff', '#33a2ff', '#1859b8'],
    bonus_life: ['#fff0f6', '#ffadc4', '#e0587f'],
  };
  function drawBonus(ctx, kind, cx, cy, r, o) {
    o = o || {};
    const pal = TOKEN[kind] || TOKEN.bonus_wide;
    const k = r / 52;
    const lw = Math.max(1.5, lwOf(o, 7 * k));
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    const g = ctx.createRadialGradient(cx - 0.35 * r, cy - 0.4 * r, r * 0.1, cx, cy, r * 1.1);
    g.addColorStop(0, pal[0]);
    g.addColorStop(0.6, pal[1]);
    g.addColorStop(1, pal[2]);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#3a2600';
    ctx.lineWidth = lw * 1.5;
    ctx.stroke();
    // arany gyűrű
    ctx.beginPath();
    ctx.arc(cx, cy, r - lw * 0.9, 0, TAU);
    ctx.strokeStyle = '#ffe566';
    ctx.lineWidth = lw * 0.7;
    ctx.stroke();
    // fény
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.8, Math.PI * 1.05, Math.PI * 1.45);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = lw * 0.8;
    ctx.stroke();
    const S = 5 * k;
    ctx.strokeStyle = '#3a2000';
    ctx.lineWidth = S;
    if (kind === 'bonus_wide') {
      ctx.beginPath();
      const pts = [[-36, 0], [-15, -19], [-15, -7.5], [15, -7.5], [15, -19], [36, 0], [15, 19], [15, 7.5], [-15, 7.5], [-15, 19]];
      pts.forEach((p, i) => (i ? ctx.lineTo(cx + p[0] * k, cy + p[1] * k) : ctx.moveTo(cx + p[0] * k, cy + p[1] * k)));
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.stroke();
    } else if (kind === 'bonus_slow') {
      ctx.beginPath();
      ctx.arc(cx, cy + 2 * k, 28 * k, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.stroke();
      // csengők
      ctx.fillStyle = '#ffd34d';
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + sx * 20 * k, cy - 22 * k, 8 * k, Math.PI, TAU);
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = S * 0.7;
        ctx.stroke();
      }
      ctx.lineWidth = S * 0.6;
      ctx.strokeStyle = '#3a2000';
      for (let i = 0; i < 12; i++) {
        const a = (i * TAU) / 12;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 22 * k, cy + 2 * k + Math.sin(a) * 22 * k);
        ctx.lineTo(cx + Math.cos(a) * 25 * k, cy + 2 * k + Math.sin(a) * 25 * k);
        ctx.stroke();
      }
      ctx.lineWidth = S * 0.9;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 2 * k);
      ctx.lineTo(cx, cy - 16 * k);
      ctx.moveTo(cx, cy + 2 * k);
      ctx.lineTo(cx + 11 * k, cy + 9 * k);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy + 2 * k, 3 * k, 0, TAU);
      ctx.fillStyle = '#3a2000';
      ctx.fill();
    } else if (kind === 'bonus_life') {
      drawHeart(ctx, cx, cy + 2 * k, 26 * k, { lw: 0.9 });
    }
    // csillag-szikrák
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#a56a00';
    ctx.lineWidth = Math.max(1, 1.5 * k);
    star(ctx, cx + 0.72 * r, cy - 0.7 * r, 10 * k, true);
    star(ctx, cx - 0.78 * r, cy + 0.55 * r, 6 * k, true);
    ctx.restore();
  }

  function drawWindIcon(ctx, size) {
    const s = size / 100;
    ctx.save();
    ctx.scale(s, s);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(50, 50, 46, 0, TAU);
    const g = ctx.createRadialGradient(36, 34, 6, 50, 50, 52);
    g.addColorStop(0, '#d4f1ff');
    g.addColorStop(1, '#58b4f0');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#124a82';
    ctx.lineWidth = 6;
    ctx.stroke();
    const lines = [
      [[18, 36], [58, 36], [72, 36, 72, 24, 62, 22]],
      [[14, 52], [74, 52], [88, 52, 88, 66, 76, 66]],
      [[26, 68], [50, 68], [62, 68, 62, 78, 54, 79]],
    ];
    for (const l of lines) {
      ctx.beginPath();
      ctx.moveTo(l[0][0], l[0][1]);
      ctx.lineTo(l[1][0], l[1][1]);
      ctx.bezierCurveTo(l[2][0], l[2][1], l[2][2], l[2][3], l[2][4], l[2][5]);
      ctx.strokeStyle = '#124a82';
      ctx.lineWidth = 11;
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 5.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- árnyék
  function makeShadow() {
    const c = mk(432, 168), g = c.getContext('2d');
    g.translate(216, 84);
    g.scale(1, 168 / 432);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, 210);
    rg.addColorStop(0, 'rgba(10,25,0,0.95)');
    rg.addColorStop(0.45, 'rgba(10,25,0,0.6)');
    rg.addColorStop(1, 'rgba(10,25,0,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(0, 0, 210, 0, TAU);
    g.fill();
    return c;
  }

  // ---------------------------------------------------------------- rajzfilmes háttér (1900×850)
  function cloud(g, x, y, s) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = 'rgba(255,255,255,0.96)';
    g.beginPath();
    for (const c of [[0, 0, 34], [38, -16, 40], [84, -4, 34], [118, 6, 26], [40, 10, 34], [78, 12, 32]]) {
      g.moveTo(c[0] + c[2], c[1]);
      g.arc(c[0], c[1], c[2], 0, TAU);
    }
    g.fill();
    g.fillStyle = 'rgba(160,205,240,0.4)';
    g.beginPath();
    g.ellipse(58, 34, 70, 8, 0, 0, TAU);
    g.fill();
    g.restore();
  }

  function trunk(g, x, yTop, yBot, wTop, wBot, flare) {
    g.save();
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(x - wTop / 2, yTop);
    g.lineTo(x - wBot / 2, yBot - flare);
    g.quadraticCurveTo(x - wBot / 2 - flare, yBot, x - wBot / 2 - flare * 1.6, yBot + 2);
    g.lineTo(x + wBot / 2 + flare * 1.6, yBot + 2);
    g.quadraticCurveTo(x + wBot / 2 + flare, yBot, x + wBot / 2, yBot - flare);
    g.lineTo(x + wTop / 2, yTop);
    g.closePath();
    const gr = g.createLinearGradient(x - wBot / 2, 0, x + wBot / 2, 0);
    gr.addColorStop(0, '#7a4724');
    gr.addColorStop(0.35, '#b57a45');
    gr.addColorStop(1, '#6a3a1a');
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = '#3a200e';
    g.lineWidth = Math.max(4, wBot * 0.06);
    g.stroke();
    // kéreg
    g.strokeStyle = 'rgba(60,30,10,0.45)';
    g.lineWidth = Math.max(2, wBot * 0.025);
    const R = rng(Math.floor(x));
    for (let i = 0; i < 9; i++) {
      const bx = x + (R() - 0.5) * wBot * 0.6;
      const by = yTop + (yBot - yTop) * (0.15 + R() * 0.7);
      g.beginPath();
      g.moveTo(bx, by);
      g.quadraticCurveTo(bx + 6, by + 22, bx - 3, by + 46 + wBot * 0.1);
      g.stroke();
    }
    g.restore();
  }

  function makeBackground(W, H) {
    const c = mk(W, H), g = c.getContext('2d');
    const R = rng(20241);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    // ég
    let gr = g.createLinearGradient(0, 0, 0, 470);
    gr.addColorStop(0, '#4fb8ff');
    gr.addColorStop(1, '#dff7ff');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, 520);
    // nap
    gr = g.createRadialGradient(1230, 330, 10, 1230, 330, 260);
    gr.addColorStop(0, 'rgba(255,250,190,0.95)');
    gr.addColorStop(1, 'rgba(255,250,190,0)');
    g.fillStyle = gr;
    g.fillRect(900, 60, 700, 560);
    g.fillStyle = '#fff6a8';
    g.beginPath();
    g.arc(1230, 330, 52, 0, TAU);
    g.fill();
    g.strokeStyle = '#ffd84a';
    g.lineWidth = 6;
    g.stroke();
    cloud(g, 380, 330, 1.3);
    cloud(g, 1520, 300, 1.1);
    cloud(g, 740, 380, 0.8);
    // dombok
    function hill(base, amp, f, ph, fill, line) {
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 20) g.lineTo(x, base + Math.sin(x * f + ph) * amp + Math.sin(x * f * 2.3 + ph * 2) * amp * 0.3);
      g.lineTo(W, H);
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      g.strokeStyle = line;
      g.lineWidth = 5;
      g.stroke();
    }
    hill(392, 30, 0.0042, 1.0, '#9ad98a', '#5aa650');
    hill(424, 22, 0.0058, 3.2, '#7ccd62', '#3f9a3a');
    // távoli fák sora
    for (let x = -20; x < W + 40; x += 92 + R() * 30) {
      const tr = 22 + R() * 14, ty = 446 + R() * 6;
      g.fillStyle = '#7a4a24';
      g.strokeStyle = '#3a200e';
      g.lineWidth = 4;
      g.fillRect(x - 5, ty - 6, 10, 26);
      g.strokeRect(x - 5, ty - 6, 10, 26);
      g.beginPath();
      g.arc(x, ty - 22, tr, 0, TAU);
      g.fillStyle = '#4fb04a';
      g.fill();
      g.strokeStyle = '#1f6a2a';
      g.lineWidth = 5;
      g.stroke();
      g.beginPath();
      g.arc(x - tr * 0.3, ty - 22 - tr * 0.3, tr * 0.5, 0, TAU);
      g.fillStyle = '#73cf62';
      g.fill();
      g.fillStyle = '#e53a35';
      g.beginPath();
      g.arc(x + tr * 0.4, ty - 14, 4, 0, TAU);
      g.arc(x - tr * 0.5, ty - 6, 4, 0, TAU);
      g.fill();
    }
    // rét
    gr = g.createLinearGradient(0, 440, 0, H);
    gr.addColorStop(0, '#8fe060');
    gr.addColorStop(0.5, '#5cc245');
    gr.addColorStop(1, '#3da23a');
    g.fillStyle = gr;
    g.fillRect(0, 452, W, H - 452);
    g.strokeStyle = '#3f9a3a';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, 452);
    g.lineTo(W, 452);
    g.stroke();
    // perspektivikus nyírási csíkok
    let y = 452, h = 12, i = 0;
    while (y < H) {
      if (i % 2) {
        g.fillStyle = 'rgba(255,255,255,0.07)';
        g.fillRect(0, y, W, h);
      }
      y += h;
      h *= 1.22;
      i++;
    }
    // fák árnyéka
    g.fillStyle = 'rgba(10,70,20,0.16)';
    for (const s of [[960, 600, 330, 52], [380, 520, 220, 34], [1540, 530, 240, 36]]) {
      g.beginPath();
      g.ellipse(s[0], s[1], s[2], s[3], 0, 0, TAU);
      g.fill();
    }
    // törzsek: távoli, középső, közeli
    trunk(g, 560, 220, 462, 50, 56, 8);
    trunk(g, 1360, 220, 462, 50, 56, 8);
    trunk(g, 950, 200, 470, 74, 84, 10);
    // fűcsomók
    for (let n = 0; n < 340; n++) {
      const t = Math.pow(R(), 0.8);
      const yy = 462 + t * (H - 470), xx = R() * W;
      const s = 5 + (yy - 440) / 24;
      g.strokeStyle = R() < 0.5 ? '#2f9a34' : '#4fbc3c';
      g.lineWidth = 2 + s * 0.16;
      g.beginPath();
      g.moveTo(xx, yy);
      g.lineTo(xx - s * 0.6, yy - s * 1.5);
      g.moveTo(xx, yy);
      g.lineTo(xx + 0.05 * s, yy - s * 1.9);
      g.moveTo(xx, yy);
      g.lineTo(xx + s * 0.6, yy - s * 1.5);
      g.stroke();
    }
    // virágok
    const fc = ['#ffffff', '#ffe14d', '#ff9ac8'];
    for (let n = 0; n < 46; n++) {
      const yy = 480 + Math.pow(R(), 0.9) * (H - 500), xx = R() * W, rr = 3 + (yy - 450) / 60;
      g.fillStyle = fc[n % 3];
      for (let p = 0; p < 5; p++) {
        g.beginPath();
        g.arc(xx + Math.cos((p * TAU) / 5) * rr, yy + Math.sin((p * TAU) / 5) * rr * 0.7, rr * 0.7, 0, TAU);
        g.fill();
      }
      g.fillStyle = '#e8a000';
      g.beginPath();
      g.arc(xx, yy, rr * 0.55, 0, TAU);
      g.fill();
    }
    // közeli törzsek ágakkal
    trunk(g, 100, 180, 842, 120, 170, 40);
    trunk(g, 1805, 180, 842, 120, 170, 40);
    g.strokeStyle = '#3a200e';
    g.lineWidth = 46;
    function limb(pts) {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
      g.stroke();
    }
    g.strokeStyle = '#3a200e';
    limb([[130, 330], [320, 290], [470, 200]]);
    limb([[1775, 330], [1580, 290], [1430, 200]]);
    g.lineWidth = 34;
    g.strokeStyle = '#9a6030';
    limb([[130, 330], [320, 290], [470, 200]]);
    limb([[1775, 330], [1580, 290], [1430, 200]]);
    // lombkorona – felső sáv, az alsó széle kb. y=250
    const circ = [];
    for (let x = -50; x < W + 80; x += 78) {
      circ.push([x + (R() - 0.5) * 20, 150 + (R() - 0.5) * 26, 80 + R() * 18]);
      circ.push([x + 39 + (R() - 0.5) * 20, 64 + (R() - 0.5) * 30, 82 + R() * 18]);
      circ.push([x + 20 + (R() - 0.5) * 20, -6 + R() * 20, 90]);
    }
    g.strokeStyle = '#1b5a24';
    g.lineWidth = 12;
    for (const q of circ) {
      g.beginPath();
      g.arc(q[0], q[1], q[2], 0, TAU);
      g.stroke();
    }
    for (const q of circ) {
      g.beginPath();
      g.arc(q[0], q[1], q[2], 0, TAU);
      g.fillStyle = '#2f9a3c';
      g.fill();
    }
    for (const q of circ) {
      g.beginPath();
      g.arc(q[0] - q[2] * 0.1, q[1] - q[2] * 0.18, q[2] * 0.78, 0, TAU);
      g.fillStyle = '#46b947';
      g.fill();
    }
    for (const q of circ) {
      g.beginPath();
      g.arc(q[0] - q[2] * 0.22, q[1] - q[2] * 0.3, q[2] * 0.46, 0, TAU);
      g.fillStyle = '#6fd25a';
      g.fill();
    }
    // sötét alsó árnyék a lombkorona alján
    g.save();
    for (const q of circ) {
      if (q[1] < 120) continue;
      g.save();
      g.beginPath();
      g.arc(q[0], q[1], q[2] - 2, 0, TAU);
      g.clip();
      g.beginPath();
      g.ellipse(q[0], q[1] + q[2] * 0.9, q[2] * 1.05, q[2] * 0.55, 0, 0, TAU);
      g.fillStyle = 'rgba(14,80,30,0.45)';
      g.fill();
      g.restore();
    }
    g.restore();
    // levélcsíkok
    g.strokeStyle = 'rgba(25,100,35,0.5)';
    g.lineWidth = 3;
    for (let n = 0; n < 110; n++) {
      const lx = R() * W, ly = 10 + R() * 220;
      g.beginPath();
      g.arc(lx, ly, 10 + R() * 12, 0.2, 2.2);
      g.stroke();
    }
    // almák a lombban
    const ac = ['#e53a35', '#e53a35', '#e53a35', '#9ddc3a', '#ffc81c'];
    for (let n = 0; n < 62; n++) {
      const ax = R() * W, ay = 30 + R() * 205, ar = 13 + R() * 6;
      drawApple(g, n % 9 === 0 ? 'green' : n % 14 === 0 ? 'gold' : 'red', ax, ay, ar, { lw: 0.8 });
    }
    void ac;
    return c;
  }

  // ---------------------------------------------------------------- sprite-készlet építése (rajzfilmes)
  // Visszaad: { apple:{kind:{c,ax,ay,k}}, basin:[4], bird:[9], hedgehog:{c,ax,ay}, crate:{c}, crateFull:{c}, shadow, bg }
  const APPLE_BOX = 134, APPLE_CX = 67, APPLE_CY = 83, APPLE_R = 45;

  function shadeCanvas(c) {
    const g = c.getContext('2d');
    g.save();
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, 0, 0, c.height);
    gr.addColorStop(0, 'rgba(255,255,255,0.22)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
    g.restore();
    return c;
  }

  function appleSprite(kind, o) {
    const c = mk(APPLE_BOX, APPLE_BOX);
    drawApple(c.getContext('2d'), kind, APPLE_CX, APPLE_CY, APPLE_R, o);
    return { c: c, ax: APPLE_CX / APPLE_BOX, ay: APPLE_CY / APPLE_BOX, k: 1 };
  }
  function bonusSprite(kind, o) {
    const c = mk(APPLE_BOX, APPLE_BOX);
    drawBonus(c.getContext('2d'), kind, 67, 67, 52, o);
    if (o && o.rich) shadeCanvas(c);
    return { c: c, ax: 0.5, ay: 0.5, k: 1 };
  }
  function hedgehogSprite(o) {
    const c = mk(280, 180);
    drawHedgehog(c.getContext('2d'), o);
    if (o && o.rich) shadeCanvas(c);
    return { c: c, ax: 0.5, ay: 172 / 180, w: 280, h: 180 };
  }
  function crateSprite(full, o) {
    const c = mk(200, 170);
    drawCrate(c.getContext('2d'), full, o);
    return { c: c, ax: 0.5, ay: 165 / 170, w: 200, h: 170 };
  }

  function buildCartoon() {
    const S = { apple: {}, basin: [], bird: [] };
    for (const k of ['red', 'green', 'gold', 'worm']) S.apple[k] = appleSprite(k);
    for (const k of CFG.BONUS_KINDS) S.apple[k] = bonusSprite(k);
    for (let p = 0; p < 4; p++) {
      const c = mk(350, 350);
      drawBasin(c.getContext('2d'), p);
      S.basin.push(c);
    }
    for (let f = 0; f < 9; f++) {
      const c = mk(320, 320);
      drawBird(c.getContext('2d'), f);
      S.bird.push(c);
    }
    S.hedgehog = hedgehogSprite();
    S.crate = crateSprite(false);
    S.crateFull = crateSprite(true);
    S.shadow = makeShadow();
    S.bg = makeBackground(CFG.W, CFG.H);
    return S;
  }

  // a fotós stílus saját rajzolású kiegészítői (kicsit plasztikusabb: vékonyabb kontúr + árnyalás)
  const RICH = { lw: 0.5, rich: true };
  function buildPhotoExtras(redImg) {
    const S = { apple: {} };
    for (const k of CFG.BONUS_KINDS) S.apple[k] = bonusSprite(k, RICH);
    // kukacos alma: a fotós piros alma + rárajzolt kukac
    const c = mk(APPLE_BOX, APPLE_BOX);
    const g = c.getContext('2d');
    if (redImg) g.drawImage(redImg, 0, 0);
    drawWorm(g, 69, 77, 44, { lw: 0.7 });
    S.apple.worm = { c: c, ax: 70 / 134, ay: 76 / 134, k: 1 };
    S.hedgehog = hedgehogSprite(RICH);
    S.crate = crateSprite(false, RICH);
    S.crateFull = crateSprite(true, RICH);
    return S;
  }

  AS.Art = {
    drawApple: drawApple,
    drawWorm: drawWorm,
    drawBasin: drawBasin,
    drawBird: drawBird,
    drawHedgehog: drawHedgehog,
    drawCrate: drawCrate,
    drawBonus: drawBonus,
    drawHeart: drawHeart,
    drawWindIcon: drawWindIcon,
    makeShadow: makeShadow,
    makeBackground: makeBackground,
    buildCartoon: buildCartoon,
    buildPhotoExtras: buildPhotoExtras,
    mk: mk,
    APPLE_BOX: APPLE_BOX,
  };
})(typeof window !== 'undefined' ? window : globalThis);
