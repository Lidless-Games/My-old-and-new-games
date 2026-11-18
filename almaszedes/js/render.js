// Almaszedés – jelenet kirajzolása (fotós és rajzfilmes stílus). A játékállapotot csak OLVASSA.
(function (root) {
  const AS = (root.AS = root.AS || {});
  const CFG = AS.CFG;
  const Art = AS.Art;
  const W = CFG.W, H = CFG.H;
  const TAU = Math.PI * 2;
  const IMG_BASE = 'assets/img/';

  let photo = null, cartoon = null, loadPromise = null;

  // ---------------------------------------------------------------- segédek
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (t) => {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };
  function pick(style) {
    if (style === 'photo' && photo) return photo;
    return cartoon;
  }

  // ---------------------------------------------------------------- betöltés
  function buildPhoto(imgs) {
    const need = ['bg.jpg', 'bg_flash.jpg', 'apple_red.png', 'apple_green.png', 'apple_gold.png', 'shadow.png'];
    for (let i = 0; i < 4; i++) need.push('basin' + i + '.png');
    for (const n of need) if (!imgs[n]) return null;
    const P = Art.buildPhotoExtras(imgs['apple_red.png']);
    P.bg = imgs['bg.jpg'];
    P.flash = imgs['bg_flash.jpg'];
    P.shadow = imgs['shadow.png'];
    // fotós almák: a test középpontja kerül az (x,y)-ra, a méretet úgy skálázzuk, hogy a testek egyformák legyenek
    P.apple.red = { c: imgs['apple_red.png'], ax: 0.5, ay: 0.56, k: 1 };
    P.apple.green = { c: imgs['apple_green.png'], ax: 0.5, ay: 0.56, k: 1 };
    P.apple.gold = { c: imgs['apple_gold.png'], ax: 0.5, ay: 0.56, k: 1 };
    P.basin = [0, 1, 2, 3].map((i) => imgs['basin' + i + '.png']);
    P.bird = cartoon ? cartoon.bird : Art.buildCartoon().bird; // the bird stays drawn in photo mode too
    return P;
  }

  function load(onProgress) {
    if (loadPromise) return loadPromise;
    // photo mode: AI-generated photos (own assets); the bird is the drawn one
    const names = []; // photo mode switched off on main until the foto-mod branch is ready
    const total = names.length + 1;
    let done = 0;
    const imgs = {};
    const step = () => {
      done++;
      if (onProgress) {
        try {
          onProgress(Math.min(1, done / total));
        } catch (e) {}
      }
    };
    const ps = names.map(
      (n) =>
        new Promise((res) => {
          const im = new Image();
          im.onload = () => {
            imgs[n] = im;
            step();
            res();
          };
          im.onerror = () => {
            if (root.console) console.warn('Kép nem tölthető be: ' + n);
            step();
            res();
          };
          im.src = IMG_BASE + n;
        })
    );
    loadPromise = Promise.all(ps)
      .then(() => new Promise((res) => setTimeout(res, 0)))
      .then(() => {
        cartoon = Art.buildCartoon();
        photo = buildPhoto(imgs);
        if (onProgress) {
          try {
            onProgress(1);
          } catch (e) {}
        }
      });
    return loadPromise;
  }

  // ---------------------------------------------------------------- háttér, árnyékok
  function drawBg(ctx, P, style, flashT) {
    ctx.drawImage(P.bg, 0, 0, W, H);
    if (flashT > 0) {
      const a = clamp((flashT / CFG.FLASH_T) * 1.3, 0, 1);
      if (P === photo && P.flash) {
        ctx.globalAlpha = a;
        ctx.drawImage(P.flash, 0, 0, W, H);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = 'rgba(255,246,190,' + (0.8 * a).toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  function drawShadow(ctx, P, x, y, w, alpha) {
    if (alpha <= 0.01) return;
    const h = (w * 168) / 432;
    ctx.globalAlpha = alpha;
    ctx.drawImage(P.shadow, x - w / 2, y - h / 2, w, h);
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- almák
  function appleAlpha(a) {
    if (a.state === 'landed') {
      const left = CFG.LANDED_FADE_T - (a.t || 0);
      return clamp(left / 1.5, 0, 1);
    }
    return 1;
  }

  function drawAppleSprite(ctx, P, kind, x, y, s, rot, alpha, pulse) {
    const spr = P.apple[kind] || P.apple.red;
    const size = CFG.APPLE_SIZE * s * spr.k * (pulse || 1);
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(spr.c, -spr.ax * size, -spr.ay * size, size, size);
    ctx.restore();
  }

  function appleRot(a) {
    const id = a.id || 0;
    if (a.state === 'landed') return Math.sin(id * 2.3) * 0.6;
    return Math.sin(id * 1.9 + a.y * 0.012) * 0.28;
  }

  function drawOneApple(ctx, P, a, now) {
    const s = CFG.scale(a.depth);
    const bonus = a.kind.charCodeAt(0) === 98; // 'b'onus_*
    drawAppleSprite(ctx, P, a.kind, a.x, a.y, s, bonus ? 0 : appleRot(a), appleAlpha(a), bonus ? 1 + 0.05 * Math.sin(now * 6 + (a.id || 0)) : 1);
  }

  function appleShadow(ctx, P, a) {
    if (a.state === 'taken') return;
    const s = CFG.scale(a.depth), gy = CFG.groundY(a.depth);
    const base = CFG.APPLE_SIZE * s * 1.5;
    if (a.state === 'landed') {
      drawShadow(ctx, P, a.x, gy + 18 * s, base * 0.95, 0.6 * appleAlpha(a));
      return;
    }
    const prox = clamp(1 - Math.max(0, gy - a.y) / 420, 0, 1);
    drawShadow(ctx, P, a.x, gy + 18 * s, base * (0.75 + 0.35 * prox), 0.45 + 0.45 * prox);
  }

  // ---------------------------------------------------------------- lavór
  function drawBasinSprite(ctx, img, bx, gy, s, wf, ang, dir) {
    const size = CFG.BASIN_SIZE * s;
    const cy = gy + CFG.BASIN_BOX_OFFSET_Y * s;
    ctx.save();
    ctx.translate(bx, cy);
    if (ang) {
      const px = dir * 0.43 * size * wf, py = 0.49 * size;
      ctx.translate(px, py);
      ctx.rotate(ang * dir);
      ctx.translate(-px, -py);
    }
    ctx.drawImage(img, (-size * wf) / 2, -size / 2, size * wf, size);
    ctx.restore();
  }

  const PARTS = ['red', 'red', 'green', 'red', 'gold', 'red', 'red', 'green', 'red', 'red', 'gold', 'red'];
  const TILT_MAX = (72 * Math.PI) / 180;
  function tiltAt(p) {
    if (p < 0.12) return 0;
    if (p < 0.4) return smooth((p - 0.12) / 0.28);
    if (p < 0.62) return 1;
    if (p < 0.88) return 1 - smooth((p - 0.62) / 0.26);
    return 0;
  }

  function drawLevelUp(ctx, P, state, wf) {
    const b = state.basin;
    const s = CFG.scale(b.depth), gy = CFG.groundY(b.depth);
    const p = clamp(1 - state.levelT / CFG.LEVELUP_T, 0, 1);
    const dir = b.x < W / 2 ? 1 : -1;
    const size = CFG.BASIN_SIZE * s;
    const ang = tiltAt(p) * TILT_MAX;
    const pivotX = b.x + dir * 0.43 * size * wf;
    const cK = 1.5 * s;
    const crateCx = pivotX + dir * 185 * s;
    const crateBase = gy + 62 * s;
    const alpha = smooth((p - 0.02) / 0.1) * (1 - smooth((p - 0.82) / 0.16));
    // ideiglenes láda
    if (alpha > 0.01) {
      ctx.globalAlpha = alpha;
      const spr = P.crate;
      ctx.drawImage(spr.c, crateCx - spr.ax * spr.w * cK, crateBase - spr.ay * spr.h * cK, spr.w * cK, spr.h * cK);
      ctx.globalAlpha = 1;
    }
    // lavór
    const ph = p < 0.3 ? 3 : p < 0.38 ? 2 : p < 0.46 ? 1 : 0;
    drawBasinSprite(ctx, P.basin[ph], b.x, gy, s, wf, ang, dir);
    // kiömlő almák
    const cyBox = gy + CFG.BASIN_BOX_OFFSET_Y * s;
    const pxl = dir * 0.43 * size * wf, pyl = 0.49 * size;
    const n = CFG.BASIN_CAPACITY;
    ctx.globalAlpha = Math.max(alpha, 0);
    for (let i = 0; i < n; i++) {
      const p0 = 0.28 + i * 0.02, dur = 0.22;
      if (p < p0) continue;
      const a0 = tiltAt(p0) * TILT_MAX * dir;
      const ox = dir * (0.43 - 0.05 * (i % 4)) * size * wf - pxl;
      const oy = -0.03 * size - pyl;
      const sx = b.x + pxl + ox * Math.cos(a0) - oy * Math.sin(a0);
      const sy = cyBox + pyl + ox * Math.sin(a0) + oy * Math.cos(a0);
      const lx = 40 + (i % 4) * 40, ly = 56 - Math.floor(i / 4) * 14;
      const ex = crateCx + dir * (lx - 100) * cK;
      const ey = crateBase - (165 - ly) * cK;
      const u = clamp((p - p0) / dur, 0, 1);
      const x = sx + (ex - sx) * u;
      const y = sy + (ey - sy) * u * u;
      drawAppleSprite(ctx, P, PARTS[i % PARTS.length], x, y, s * 0.72, u * 5 + i, 1, 1);
    }
    ctx.globalAlpha = 1;
    return p;
  }

  // ---------------------------------------------------------------- láda-sor a kiürített lavórokhoz
  const CRATE_CAP = 6;
  const CRATE_POS = [[1812, 0], [1682, 0], [1552, 0], [1747, 1], [1617, 1], [1682, 2]];
  function drawCrates(ctx, P, state, now) {
    let n = state.crates | 0;
    let lastA = 1;
    if (state.mode === 'levelup' && n > 0) {
      const p = clamp(1 - state.levelT / CFG.LEVELUP_T, 0, 1);
      lastA = smooth((p - 0.84) / 0.16);
    }
    if (n <= 0) return;
    const shown = Math.min(n, CRATE_CAP);
    const cs = 0.7, spr = P.crateFull;
    const w = spr.w * cs, h = spr.h * cs;
    for (let i = 0; i < shown; i++) {
      const pos = CRATE_POS[i];
      const x = pos[0], y = 840 - pos[1] * 70;
      const isLast = i === n - 1;
      const a = isLast ? lastA : 1;
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      if (pos[1] === 0) drawShadow(ctx, P, x, y + 2, w * 1.25, 0.5 * a);
      ctx.globalAlpha = a;
      ctx.drawImage(spr.c, x - spr.ax * w, y - spr.ay * h, w, h);
    }
    ctx.globalAlpha = 1;
    if (n > CRATE_CAP) {
      ctx.font = 'bold 40px "Trebuchet MS","Segoe UI",Arial,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(40,20,0,0.85)';
      ctx.fillStyle = '#ffe27a';
      ctx.strokeText('×' + n, 1682, 566);
      ctx.fillText('×' + n, 1682, 566);
    }
  }

  // ---------------------------------------------------------------- sün, madár
  function drawHedgehog(ctx, P, hh, s) {
    const spr = P.hedgehog;
    const wd = 300 * s, k = wd / spr.w;
    ctx.save();
    ctx.translate(hh.x, hh.y);
    ctx.scale((hh.dir < 0 ? -1 : 1) * k, k);
    ctx.drawImage(spr.c, -spr.ax * spr.w, -spr.ay * spr.h);
    ctx.restore();
  }

  function drawBird(ctx, P, b) {
    const size = CFG.BIRD_SIZE * b.scale;
    const img = P.bird[((b.frame | 0) % 9 + 9) % 9];
    ctx.save();
    ctx.translate(b.x, b.y);
    if (b.angle) ctx.rotate((b.angle * Math.PI) / 180);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  // ---------------------------------------------------------------- szél
  const WSEED = [];
  (function () {
    let a = 12345;
    const r = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 18; i++) WSEED.push({ ph: r(), y: 230 + r() * 560, len: 140 + r() * 200, sp: 0.35 + r() * 0.5, wob: r() * 6, th: 2 + r() * 2.5 });
    for (let i = 0; i < 14; i++) WSEED.push({ leaf: true, ph: r(), y: 220 + r() * 560, sp: 0.3 + r() * 0.45, wob: r() * 6, sz: 9 + r() * 9, rot: r() * 6 });
  })();

  function drawWind(ctx, wind, now) {
    const dir = wind.dir < 0 ? -1 : 1;
    const t = wind.t == null ? 1 : wind.t;
    const env = Math.min(1, t / 0.5, Math.max(0, (CFG.WIND_T - t) / 0.4 + 0.15));
    const k = clamp(env, 0, 1);
    if (k <= 0.01) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const w of WSEED) {
      let u = (w.ph + now * w.sp * (dir > 0 ? 1 : -1)) % 1;
      if (u < 0) u += 1;
      const x = -250 + u * (W + 500);
      const y = w.y + Math.sin(now * 2.2 + w.wob) * 22;
      if (w.leaf) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(w.rot + now * 3 * dir);
        ctx.globalAlpha = 0.9 * k;
        ctx.beginPath();
        ctx.ellipse(0, 0, w.sz, w.sz * 0.45, 0, 0, TAU);
        ctx.fillStyle = '#7ccf45';
        ctx.fill();
        ctx.strokeStyle = '#2d7a25';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-w.sz, 0);
        ctx.lineTo(w.sz, 0);
        ctx.stroke();
        ctx.restore();
      } else {
        const x0 = x - dir * w.len;
        ctx.globalAlpha = 0.6 * k;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = w.th;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.bezierCurveTo(x0 + dir * w.len * 0.4, y - 14, x - dir * w.len * 0.3, y + 14, x, y);
        ctx.bezierCurveTo(x + dir * 22, y - 8, x + dir * 30, y - 28, x + dir * 12, y - 30);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- effektek (szövegek, burst, tollak)
  const easeOut = (u) => 1 - (1 - u) * (1 - u);

  function drawText(ctx, e) {
    const u = clamp((e.t || 0) / (e.life || 1), 0, 1);
    const a = u < 0.65 ? 1 : (1 - u) / 0.35;
    const y = e.y - 90 * (1 - (1 - u) * (1 - u));
    const size = e.size > 0 ? e.size : 1;
    const pop = size * (1 + 0.35 * (1 - Math.min(1, (e.t || 0) / 0.15)));
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.translate(e.x, y);
    if (size > 1) ctx.rotate(-0.09 + 0.03 * Math.sin((e.t || 0) * 18)); // a nagy felirat kicsit billeg
    ctx.scale(pop, pop);
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(20,10,0,0.8)';
    ctx.strokeText(e.text, 0, 0);
    ctx.fillStyle = e.color || '#fff';
    ctx.fillText(e.text, 0, 0);
    ctx.restore();
  }

  // csillagpoly: n csúcs, külső/belső sugár
  function starPath(ctx, n, ro, ri, rot) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? ri : ro;
      const an = rot + (i * Math.PI) / n;
      if (i === 0) ctx.moveTo(Math.cos(an) * r, Math.sin(an) * r);
      else ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r);
    }
    ctx.closePath();
  }

  // képregény-szerű kirobbanás: táguló csillag-puff, sugárzó szikrák, pár kis csillag
  function drawBurst(ctx, e, cartoon) {
    const u = clamp((e.t || 0) / (e.life || 1), 0, 1);
    const r = 30 + 170 * easeOut(u);
    const al = Math.pow(1 - u, 1.3);
    if (al <= 0.01) return;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // puff
    ctx.globalAlpha = al * (cartoon ? 1 : 0.85);
    starPath(ctx, 11, r, r * 0.58, 0.4 + u * 0.5);
    ctx.fillStyle = cartoon ? '#ffd23f' : '#ffe27a';
    ctx.fill();
    ctx.lineWidth = cartoon ? 8 : 5;
    ctx.strokeStyle = cartoon ? '#e8651a' : 'rgba(150,60,0,0.75)'; // a lombozat előtt is kiváljon
    ctx.stroke();
    starPath(ctx, 11, r * 0.62, r * 0.36, 0.4 + u * 0.5 + 0.2);
    ctx.fillStyle = cartoon ? '#fff7c2' : 'rgba(255,248,214,0.9)';
    ctx.fill();
    // sugárzó szikrák
    ctx.strokeStyle = cartoon ? '#ff8a1f' : 'rgba(255,255,255,0.95)';
    ctx.lineWidth = cartoon ? 7 : 5;
    for (let i = 0; i < 10; i++) {
      const an = (i / 10) * TAU + 0.15;
      const r0 = r * 1.08 + 10, r1 = r * 1.08 + 28 + 44 * (1 - u);
      ctx.beginPath();
      ctx.moveTo(Math.cos(an) * r0, Math.sin(an) * r0);
      ctx.lineTo(Math.cos(an) * r1, Math.sin(an) * r1);
      ctx.stroke();
    }
    // kis csillagok
    for (let i = 0; i < 5; i++) {
      const an = (i / 5) * TAU + 0.7 + u * 1.2;
      const rr = r * 1.25 + 40 + 30 * easeOut(u);
      ctx.save();
      ctx.translate(Math.cos(an) * rr, Math.sin(an) * rr * 0.85);
      starPath(ctx, 5, 17 * (1 - 0.4 * u), 7 * (1 - 0.4 * u), u * 4 + i);
      ctx.fillStyle = i % 2 ? '#ffffff' : '#fff27a';
      ctx.fill();
      if (cartoon) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#e8651a';
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // kék madártoll (a madárhoz illő), forgatva, az élet végén elhalványul
  function drawFeather(ctx, e, cartoon) {
    const u = clamp((e.t || 0) / (e.life || 1), 0, 1);
    const al = u < 0.7 ? 1 : (1 - u) / 0.3;
    if (al <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = clamp(al, 0, 1) * (cartoon ? 1 : 0.9);
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rot || 0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.bezierCurveTo(19, -20, 17, 14, 0, 34);
    ctx.bezierCurveTo(-17, 14, -19, -20, 0, -30);
    ctx.fillStyle = cartoon ? '#4f9be8' : '#5d8fc4';
    ctx.fill();
    if (cartoon) {
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#1f4f8f';
      ctx.stroke();
    }
    // világosabb belső sáv + tollgerinc
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.bezierCurveTo(10, -12, 9, 10, 0, 26);
    ctx.bezierCurveTo(-4, 8, -4, -10, 0, -22);
    ctx.fillStyle = cartoon ? '#9bd0ff' : 'rgba(170,205,240,0.75)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(0, 40);
    ctx.lineWidth = cartoon ? 3 : 2;
    ctx.strokeStyle = cartoon ? '#1f4f8f' : '#3a5f8c';
    ctx.stroke();
    ctx.restore();
  }

  function drawEffects(ctx, effects, cartoon, behind) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.font = 'bold 46px "Trebuchet MS","Segoe UI",Arial,sans-serif';
    for (const e of effects) {
      if (!e) continue;
      if (behind) { // a madár mögé: puff és tollak
        if (e.type === 'burst') drawBurst(ctx, e, cartoon);
        else if (e.type === 'feather') drawFeather(ctx, e, cartoon);
        continue;
      }
      if (e.type === 'text') drawText(ctx, e);
      // ismeretlen típus: figyelmen kívül marad
    }
    ctx.restore();
  }

  // megrémült madár: sebesség-csíkok mögötte és izzadságcseppek / sokkjelek körülötte (az első ~0,6 s-ban)
  function drawScaredMarks(ctx, b, cartoon) {
    const t = b._st || 0;
    if (!b.scared || t > 0.6) return;
    const u = t / 0.6;
    const al = u < 0.6 ? 1 : (1 - u) / 0.4;
    const size = CFG.BIRD_SIZE * b.scale;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.globalAlpha = clamp(al, 0, 1) * (cartoon ? 1 : 0.8);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // sokkjelek: rövid sugarak a fej fölött
    ctx.strokeStyle = cartoon ? '#2b1a0a' : 'rgba(40,25,10,0.8)';
    ctx.lineWidth = cartoon ? 7 : 5;
    for (let i = 0; i < 5; i++) {
      const an = -Math.PI / 2 + (i - 2) * 0.42;
      const r0 = size * 0.36, r1 = size * 0.36 + 34 + 12 * Math.sin(t * 40 + i);
      ctx.beginPath();
      ctx.moveTo(Math.cos(an) * r0, Math.sin(an) * r0 - size * 0.04);
      ctx.lineTo(Math.cos(an) * r1, Math.sin(an) * r1 - size * 0.04);
      ctx.stroke();
    }
    // sebesség-csíkok hátul-lent (a madár felfelé-jobbra menekül)
    ctx.strokeStyle = cartoon ? '#ffffff' : 'rgba(255,255,255,0.85)';
    ctx.lineWidth = cartoon ? 6 : 4;
    for (let i = 0; i < 4; i++) {
      const ox = -size * 0.36 - i * 14, oy = size * 0.14 + i * size * 0.08;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox - 56 - 12 * i, oy + 40 + 6 * i);
      ctx.stroke();
    }
    // izzadságcseppek
    for (let i = 0; i < 3; i++) {
      const dx = (i === 1 ? 1 : -1) * (size * 0.3 + 18 * i), dy = -size * 0.22 - 14 * i + u * 26;
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(i === 1 ? 0.5 : -0.5);
      ctx.beginPath();
      ctx.moveTo(0, -17);
      ctx.bezierCurveTo(12, -2, 12, 12, 0, 12);
      ctx.bezierCurveTo(-12, 12, -12, -2, 0, -17);
      ctx.fillStyle = cartoon ? '#8fe0ff' : 'rgba(170,225,250,0.9)';
      ctx.fill();
      if (cartoon) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#2a7fb8';
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- fő rajzolás
  const items = [];
  function insert(item) {
    let i = items.length;
    items.push(item);
    while (i > 0 && items[i - 1].k > item.k) {
      items[i] = items[i - 1];
      i--;
    }
    items[i] = item;
  }

  function draw(ctx, state, style, now) {
    const P = pick(style);
    if (!P) {
      ctx.fillStyle = '#3d8a3a';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    now = now || 0;
    ctx.globalAlpha = 1;
    drawBg(ctx, P, style, state.flashT || 0);
    if (state.crates > 0) drawCrates(ctx, P, state, now);

    const b = state.basin;
    const wf = b && b.wideT > 0 ? CFG.BONUS_WIDE_FACTOR : 1;
    const apples = state.apples || [];
    const hh = state.hedgehog;

    // árnyékok
    for (let i = 0; i < apples.length; i++) appleShadow(ctx, P, apples[i]);
    if (b) {
      const s = CFG.scale(b.depth), gy = CFG.groundY(b.depth);
      drawShadow(ctx, P, b.x, gy + 56 * s, 360 * s * wf, 0.8);
    }
    if (hh) {
      const s = CFG.scale(hh.depth);
      drawShadow(ctx, P, hh.x, hh.y - 6 * s, 250 * s, 0.7);
    }

    // mélység szerinti sorrend
    items.length = 0;
    for (let i = 0; i < apples.length; i++) {
      const a = apples[i];
      if (a.state === 'carried' || a.state === 'taken') continue;
      insert({ k: CFG.groundY(a.depth), t: 0, ref: a });
    }
    if (b) insert({ k: CFG.groundY(b.depth) - 0.5, t: 1, ref: b });
    if (hh) insert({ k: CFG.groundY(hh.depth) + 0.4, t: 2, ref: hh });
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.t === 0) drawOneApple(ctx, P, it.ref, now);
      else if (it.t === 1) {
        if (state.mode === 'levelup') drawLevelUp(ctx, P, state, wf);
        else drawBasinSprite(ctx, P.basin[clamp(b.phase | 0, 0, 3)], b.x, CFG.groundY(b.depth), CFG.scale(b.depth), wf, 0, 1);
      } else {
        const s = CFG.scale(hh.depth);
        drawHedgehog(ctx, P, hh, s);
        const spr = P.hedgehog;
        for (let j = 0; j < apples.length; j++) {
          const a = apples[j];
          if (a.state !== 'taken') continue;
          const hd = (spr.h * 300 * s) / spr.w;
          const dirv = hh.dir < 0 ? -1 : 1;
          drawAppleSprite(ctx, P, a.kind, hh.x - dirv * 0.06 * 300 * s, hh.y - 0.66 * hd, s, 0.3 * dirv, 1, 1);
        }
      }
    }
    // madár vitte almák, majd a madár
    for (let i = 0; i < apples.length; i++) {
      if (apples[i].state === 'carried') drawOneApple(ctx, P, apples[i], now);
      else if (apples[i].state === 'taken' && !hh) drawOneApple(ctx, P, apples[i], now);
    }
    if (state.effects && state.effects.length) drawEffects(ctx, state.effects, P === cartoon, true);
    if (state.bird) {
      drawBird(ctx, P, state.bird);
      if (state.bird.scared) drawScaredMarks(ctx, state.bird, P === cartoon);
    }

    if (state.wind && state.wind.active) drawWind(ctx, state.wind, now);
    if (state.effects && state.effects.length) drawEffects(ctx, state.effects, P === cartoon);

    if (state.slowT > 0) {
      const k = clamp(state.slowT / 0.6, 0, 1);
      ctx.fillStyle = 'rgba(70,130,255,' + (0.2 * k + 0.02 * Math.sin(now * 3) * k).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------------------------------------------------------------- menü mögötti háttér
  const idleState = {
    mode: 'playing', time: 0, score: 0, lives: 5, level: 1, crates: 0, levelT: 0, slowT: 0, flashT: 0,
    basin: { x: 950, depth: 0.55, caught: 0, fill: 0.5, phase: 2, wideT: 0 },
    apples: [], bird: null, hedgehog: null, wind: { active: false, dir: 1, speed: 0, t: 0 }, effects: [],
  };
  const IDLE_KINDS = ['red', 'green', 'red', 'gold', 'red', 'green'];
  for (let i = 0; i < 6; i++) idleState.apples.push({ id: i + 1, x: 0, y: 0, depth: 0, kind: IDLE_KINDS[i], state: 'falling', vy: 0, t: 0 });
  const idleBird = { x: 0, y: 0, scale: 0.9, frame: 0, angle: 0, state: 'approach', targetId: 0 };

  function drawIdle(ctx, style, now) {
    now = now || 0;
    const st = idleState;
    st.basin.x = 950 + Math.sin(now * 0.45) * 420;
    st.basin.depth = 0.55 + Math.sin(now * 0.3) * 0.2;
    for (let i = 0; i < st.apples.length; i++) {
      const a = st.apples[i];
      const per = 5 + i * 0.9;
      const u = ((now + i * 1.7) / per) % 1;
      const cyc = Math.floor((now + i * 1.7) / per);
      a.depth = ((i * 0.37 + cyc * 0.23) % 1);
      a.x = 260 + (((i * 311 + cyc * 197) % 1380));
      const gy = CFG.groundY(a.depth);
      const fall = Math.min(1, u / 0.7);
      a.y = CFG.SPAWN_Y + (gy - CFG.SPAWN_Y) * fall * fall;
      if (u > 0.7) {
        a.state = 'landed';
        a.y = gy;
        a.t = (u - 0.7) * per * 1.6;
      } else a.state = 'falling';
    }
    const cyc = (now % 22);
    if (cyc < 9) {
      st.bird = idleBird;
      idleBird.x = -150 + (cyc / 9) * 2200;
      idleBird.y = 140 + Math.sin(now * 1.4) * 40;
      idleBird.frame = Math.floor(now / CFG.BIRD_FRAME_T) % 9;
    } else st.bird = null;
    draw(ctx, st, style, now);
  }

  // ---------------------------------------------------------------- ikonok
  const CROP = {
    photo: {
      red: [14, 8, 112, 118], green: [0, 0, 120, 120], gold: [10, 0, 106, 122], worm: [14, 0, 120, 126],
      bonus: [4, 4, 126, 126], basin: [10, 100, 332, 252], bird: [10, 60, 300, 230], hedgehog: [0, 20, 280, 156],
    },
    cartoon: {
      red: [10, 0, 114, 132], green: [10, 0, 114, 132], gold: [10, 0, 114, 132], worm: [10, 0, 124, 132],
      bonus: [4, 4, 126, 126], basin: [10, 100, 332, 252], bird: [10, 14, 300, 232], hedgehog: [0, 20, 280, 156],
    },
  };

  function icon(kind, sizePx, style) {
    const size = Math.max(4, Math.round(sizePx || 48));
    const c = Art.mk(size, size);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    if (kind === 'heart') {
      Art.drawHeart(g, size / 2, size * 0.53, size * 0.36);
      return c;
    }
    if (kind === 'wind') {
      Art.drawWindIcon(g, size);
      return c;
    }
    const P = pick(style);
    const crops = CROP[P === photo && photo ? 'photo' : 'cartoon'];
    let src = null, crop = null;
    if (P) {
      if (P.apple[kind]) {
        src = P.apple[kind].c;
        crop = kind.indexOf('bonus') === 0 ? crops.bonus : crops[kind];
      } else if (kind === 'basin') {
        src = P.basin[3];
        crop = crops.basin;
      } else if (kind === 'bird') {
        src = P.bird[2];
        crop = crops.bird;
      } else if (kind === 'hedgehog') {
        src = P.hedgehog.c;
        crop = crops.hedgehog;
      }
    } else if (kind === 'red' || kind === 'green' || kind === 'gold' || kind === 'worm') {
      Art.drawApple(g, kind, size / 2, size * 0.58, size * 0.36);
      return c;
    } else if (kind.indexOf('bonus') === 0) {
      Art.drawBonus(g, kind, size / 2, size / 2, size * 0.42);
      return c;
    }
    if (!src || !crop) return c;
    const m = 0.94;
    const sc = Math.min((size * m) / crop[2], (size * m) / crop[3]);
    const dw = crop[2] * sc, dh = crop[3] * sc;
    g.drawImage(src, crop[0], crop[1], crop[2], crop[3], (size - dw) / 2, (size - dh) / 2, dw, dh);
    return c;
  }

  AS.Render = { load: load, draw: draw, drawIdle: drawIdle, icon: icon };
})(typeof window !== 'undefined' ? window : globalThis);
