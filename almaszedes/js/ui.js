// AS.UI – DOM-rétegek a vászon fölött: menü, súgó, HUD, szünet, játék vége, ranglista. Magyar felület.
(function (root) {
  const AS = (root.AS = root.AS || {});
  const CFG = AS.CFG;

  const DIFFS = [['easy', 'Könnyű'], ['normal', 'Közepes'], ['hard', 'Nehéz']];
  const DIFF_NAME = { easy: 'Könnyű', normal: 'Közepes', hard: 'Nehéz' };
  const SET_KEY = 'almaszedes.settings.v1';
  const SCORE_KEY = 'almaszedes.scores.v1';
  const MAX_ROWS = 10;

  // ---------------------------------------------------------------- tárolás (localStorage dobhat hibát)
  const mem = {};
  const store = {
    get(k) { try { const v = root.localStorage.getItem(k); if (v !== null) return v; } catch (e) { /* ignore */ } return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    set(k, v) { mem[k] = v; try { root.localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  const DEFAULTS = { difficulty: 'normal', graphics: 'cartoon', birdMode: 'shoot', music: true, sfx: true, name: '', padSide: 'left', padSpeed: 'mid', touchMode: 'drag' };
  let settings = Object.assign({}, DEFAULTS);
  // érintős pad: állandó sebesség (a billentyűzetes teljes sebesség hányada)
  const PAD_SPEED = { slow: 0.4, mid: 0.55, fast: 0.75 };

  function loadSettings() {
    try {
      const o = JSON.parse(store.get(SET_KEY) || 'null');
      if (o && typeof o === 'object') {
        if (DIFF_NAME[o.difficulty]) settings.difficulty = o.difficulty;
        settings.graphics = 'cartoon';
        if (o.birdMode === 'shoot' || o.birdMode === 'shoo') settings.birdMode = o.birdMode;
        if (typeof o.music === 'boolean') settings.music = o.music;
        if (typeof o.sfx === 'boolean') settings.sfx = o.sfx;
        if (typeof o.name === 'string') settings.name = o.name.slice(0, 14);
        if (o.padSide === 'left' || o.padSide === 'right') settings.padSide = o.padSide;
        if (PAD_SPEED[o.padSpeed]) settings.padSpeed = o.padSpeed;
        if (o.touchMode === 'drag' || o.touchMode === 'pad') settings.touchMode = o.touchMode;
      }
    } catch (e) { /* alapértékek */ }
  }
  function saveSettings() { store.set(SET_KEY, JSON.stringify(settings)); }

  function loadScores() {
    let o = null;
    try { o = JSON.parse(store.get(SCORE_KEY) || 'null'); } catch (e) { o = null; }
    const out = { easy: [], normal: [], hard: [] };
    if (o && typeof o === 'object') {
      for (const d in out) {
        if (!Array.isArray(o[d])) continue;
        out[d] = o[d].filter((r) => r && typeof r.score === 'number').map((r) => ({
          name: String(r.name || 'Névtelen').slice(0, 14), score: r.score | 0, level: r.level | 0, date: +r.date || 0,
        }));
      }
    }
    return out;
  }
  // visszaadja a helyezést (0-tól) vagy -1-et, ha kiesett a top 10-ből
  function addScore(diff, entry) {
    const all = loadScores();
    const list = all[diff] || (all[diff] = []);
    let idx = list.findIndex((r) => r.score < entry.score || (r.score === entry.score && r.level < entry.level));
    if (idx < 0) idx = list.length;
    list.splice(idx, 0, entry);
    if (list.length > MAX_ROWS) list.length = MAX_ROWS;
    store.set(SCORE_KEY, JSON.stringify(all));
    return idx < MAX_ROWS ? idx : -1;
  }

  // ---------------------------------------------------------------- DOM segédek
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids) {
      if (c === null || c === undefined || c === false) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  const SVG_SPK = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M15.5 8.5a5 5 0 010 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18 5.5a9 9 0 010 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const SVG_SPK_OFF = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M15 9l6 6M21 9l-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
  const SVG_NOTE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 17V6l11-2v11" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="6.5" cy="17.5" r="3"/><circle cx="17.5" cy="15.5" r="3"/></svg>';
  const SVG_NOTE_OFF = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 17V6l11-2v11" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="6.5" cy="17.5" r="3"/><circle cx="17.5" cy="15.5" r="3"/><path d="M3 3l18 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
  const SVG_FS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';

  // ---------------------------------------------------------------- állapot
  let H = {};            // kezelők, amiket a main.js ad (onStart, onResume, onMenu, onSettings)
  let layer = null;      // minden UI elem szülője
  const screens = {};
  let current = null;
  let uiPx = 14;
  let boardDiff = 'normal';
  let hud = null;        // HUD elemei
  let tipClosed = false;
  let fsBtn = null;
  let overCtx = null;

  function style() { return settings.graphics; }

  function icon(kind, px) {
    let c = null;
    try { c = AS.Render.icon(kind, px, style()); } catch (e) { c = null; }
    if (!c) { c = document.createElement('canvas'); c.width = c.height = px; }
    c.style.width = px + 'px'; c.style.height = px + 'px';
    return c;
  }

  // ---------------------------------------------------------------- méretezés
  function layout() {
    const vw = root.innerWidth || document.documentElement.clientWidth;
    const vh = root.innerHeight || document.documentElement.clientHeight;
    const portrait = vh > vw * 1.05;
    const touch = !!(AS.Input && AS.Input.isTouch && AS.Input.isTouch()) && settings.touchMode === 'pad';
    document.body.classList.toggle('padmode', settings.touchMode === 'pad');
    const right = settings.padSide === 'right';
    const padSize = Math.round(Math.max(96, Math.min(180, Math.min(vw, vh) * (portrait ? 0.34 : 0.3))));
    const m = Math.max(8, Math.round(Math.min(vw, vh) * 0.03));       // margó a pad körül
    const swapH = Math.max(40, Math.round(padSize * 0.36));            // oldalcserélő gomb magassága
    // érintős eszközön a pad a játéktéren KÍVÜL kap helyet: fekvő módban oldalsáv, állóban sáv alul
    const stripW = touch && !portrait ? padSize + 2 * m : 0;
    const stripH = touch && portrait ? padSize + 2 * m : 0;
    const availW = vw - stripW, availH = vh - stripH;
    const s = Math.min(availW / CFG.W, availH / CFG.H);
    const w = Math.floor(CFG.W * s), hh = Math.floor(CFG.H * s);
    let left = Math.round((availW - w) / 2), top = Math.round((availH - hh) / 2);
    if (stripW && !right) left += stripW;
    let ui = portrait ? Math.max(12, Math.min(22, vw / 29)) : Math.max(12, Math.min(26, 14 * Math.min(vw / 1366, vh / 768)));
    ui = Math.round(ui * 10) / 10;
    const st = document.documentElement.style;
    const px = (n) => n + 'px';
    st.setProperty('--ui', px(ui));
    st.setProperty('--stage-l', px(left)); st.setProperty('--stage-t', px(top));
    st.setProperty('--stage-w', px(w)); st.setProperty('--stage-h', px(hh));
    let padL, padB;
    if (portrait) {
      // HUD a vászon fölött, a letterbox sávban; pad a vászon alatt
      st.setProperty('--hud-l', '0px'); st.setProperty('--hud-t', '0px');
      st.setProperty('--hud-w', px(vw)); st.setProperty('--hud-h', px(Math.max(0, top)));
      padL = right ? vw - m - padSize : m;
      padB = m;
    } else {
      st.setProperty('--hud-l', px(left)); st.setProperty('--hud-t', px(top));
      st.setProperty('--hud-w', px(w)); st.setProperty('--hud-h', 'auto');
      padL = right ? vw - stripW + m : m;
      padB = Math.max(m, Math.round((vh - padSize - swapH - m) * 0.25));
    }
    st.setProperty('--pad-l', px(padL)); st.setProperty('--pad-b', px(padB));
    st.setProperty('--swap-w', px(padSize)); st.setProperty('--swap-h', px(swapH));
    // a csere gomb fekvő módban a pad fölött, állóban a pad mellett
    // a ↔ gomb messze a padtól, hogy ne lehessen véletlenül megnyomni: fekvőben a sáv tetején, állóban közvetlenül a játéktér alatt
    st.setProperty('--swap-l', px(padL));
    if (portrait) st.setProperty('--swap-b', px(Math.max(padB + padSize + m, vh - (top + hh) - m - swapH)));
    else st.setProperty('--swap-b', px(vh - m - swapH));
    st.setProperty('--pad-size', px(padSize));
    document.body.classList.toggle('portrait', portrait);
    document.body.classList.toggle('wide', !portrait && vw / vh > 1.15);
    if (uiPx !== ui) { uiPx = ui; if (current === 'help') buildHelp(); }
    uiPx = ui;
  }

  // ---------------------------------------------------------------- képernyők
  function addScreen(name, card, cls) {
    const el = h('div', { class: 'screen', id: 'scr-' + name, role: 'dialog', 'aria-modal': 'true' }, card);
    if (cls) el.classList.add(cls);
    layer.appendChild(el);
    screens[name] = el;
    el.addEventListener('keydown', screenKeys);
    return el;
  }

  function focusables(el) {
    return Array.prototype.filter.call(el.querySelectorAll('button, input'), (b) => !b.disabled && b.offsetParent !== null);
  }
  function screenKeys(e) {
    const k = e.key;
    const scr = e.currentTarget;
    if (k === 'Escape' && (current === 'help' || current === 'board')) { e.preventDefault(); sfxClick(); showMenu(); return; }
    if (e.target.tagName === 'INPUT' && k !== 'ArrowDown' && k !== 'ArrowUp') return;
    if (k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'ArrowLeft' && k !== 'ArrowRight') return;
    const seg = e.target.closest && e.target.closest('.seg');
    if (seg && (k === 'ArrowLeft' || k === 'ArrowRight')) {
      const bs = Array.prototype.slice.call(seg.querySelectorAll('button'));
      const i = bs.indexOf(e.target);
      const n = bs[Math.max(0, Math.min(bs.length - 1, i + (k === 'ArrowRight' ? 1 : -1)))];
      if (n && n !== e.target) { n.focus(); n.click(); }
      e.preventDefault();
      return;
    }
    const list = focusables(scr);
    const i = list.indexOf(e.target);
    if (i < 0 || !list.length) return;
    const fwd = k === 'ArrowDown' || k === 'ArrowRight';
    list[(i + (fwd ? 1 : -1) + list.length) % list.length].focus();
    e.preventDefault();
  }

  function show(name) {
    current = name;
    for (const n in screens) screens[n].classList.toggle('on', n === name);
    const loading = document.getElementById('loading');
    if (loading) loading.classList.remove('on');
    if (name) {
      const sc = screens[name];
      const f = sc.querySelector('[data-autofocus]') || focusables(sc)[0];
      if (f) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }
    } else if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  }
  function hideAll() { show(null); }
  function sfxClick() { try { AS.Audio.play('click'); } catch (e) { /* ignore */ } }

  // ---- főmenü
  let menuRefs = {};
  function seg(label, key, opts) {
    const wrap = h('div', { class: 'field' }, h('span', { class: 'lab', text: label }));
    const box = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
    const btns = {};
    opts.forEach(([val, text]) => {
      const b = h('button', {
        type: 'button', role: 'radio', 'data-val': val, text,
        onclick: () => { settings[key] = val; saveSettings(); refreshMenu(); sfxClick(); if (key === 'touchMode') layout(); if (H.onSettings) H.onSettings(settings); },
      });
      btns[val] = b; box.appendChild(b);
    });
    wrap.appendChild(box);
    menuRefs[key] = btns;
    return wrap;
  }
  function toggle(key, label, on, off) {
    const b = h('button', {
      type: 'button', class: 'btn ghost',
      onclick: () => { settings[key] = !settings[key]; saveSettings(); refreshMenu(); refreshHudSound(); if (H.onSettings) H.onSettings(settings); sfxClick(); },
    });
    b._on = on; b._off = off; b._label = label;
    menuRefs[key] = b;
    return b;
  }
  function refreshMenu() {
    for (const key of ['difficulty', 'graphics', 'birdMode', 'touchMode', 'padSpeed']) {
      const btns = menuRefs[key];
      for (const v in btns) { btns[v].setAttribute('aria-checked', String(settings[key] === v)); btns[v].tabIndex = settings[key] === v ? 0 : -1; }
    }
    for (const key of ['music', 'sfx']) {
      const b = menuRefs[key];
      b.setAttribute('aria-pressed', String(settings[key]));
      b.innerHTML = settings[key] ? b._on : b._off;
      b.appendChild(document.createTextNode(b._label + ': ' + (settings[key] ? 'Be' : 'Ki')));
    }
    if (menuRefs.titleIcon) { clear(menuRefs.titleIcon); menuRefs.titleIcon.appendChild(icon('red', Math.round(uiPx * 3.6))); }
  }

  function buildMenu() {
    menuRefs = {};
    const titleIcon = h('span', { style: 'display:flex' });
    menuRefs.titleIcon = titleIcon;
    const left = h('div', { class: 'menu-left' },
      h('div', { class: 'title-row' }, titleIcon, h('h1', { class: 'title', text: 'Almaszedés' })),
      h('p', { class: 'tagline', text: 'Kapd el a lavórral a fáról hulló almákat!' }),
      h('button', { type: 'button', class: 'btn red big', 'data-autofocus': true, text: 'Játék indítása', onclick: () => { sfxClick(); if (H.onStart) H.onStart(Object.assign({}, settings)); } }),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn ghost', text: 'Súgó', onclick: () => { sfxClick(); showHelp(); } }),
        h('button', { type: 'button', class: 'btn ghost', text: 'Ranglista', onclick: () => { sfxClick(); showBoard(); } })),
    );
    fsBtn = h('button', { type: 'button', class: 'btn ghost', onclick: toggleFullscreen });
    const toggles = h('div', { class: 'toggles' }, toggle('music', 'Zene', SVG_NOTE, SVG_NOTE_OFF), toggle('sfx', 'Hangok', SVG_SPK, SVG_SPK_OFF));
    if (fullscreenSupported()) toggles.appendChild(fsBtn);
    const right = h('div', { class: 'settings' },
      seg('Nehézség', 'difficulty', DIFFS),
      seg('Madár', 'birdMode', [['shoot', 'Lelövés'], ['shoo', 'Elhessegetés']]),
      h('div', { class: 'touch-row touch-only' },
        seg('Irányítás', 'touchMode', [['drag', 'Húzás'], ['pad', 'Folt']]),
        seg('Lavór sebessége', 'padSpeed', [['slow', 'Lassú'], ['mid', 'Közepes'], ['fast', 'Gyors']])),
      toggles,
    );
    const tip = h('div', { class: 'tip' + (tipClosed ? '' : ' on'), role: 'note' },
      h('span', { text: 'Tipp: fordítsd fekvő helyzetbe a készüléket, így nagyobb a játéktér.' }),
      h('button', { type: 'button', class: 'x', 'aria-label': 'Tipp bezárása', text: '×', onclick: () => { tipClosed = true; tip.classList.remove('on'); } }));
    const card = h('div', { class: 'card wide' }, h('div', { class: 'menu-grid' }, left, right), tip);
    card.lastChild.style.marginTop = '.9em';
    addScreen('menu', card);
    updateFsLabel();
  }

  function fullscreenSupported() {
    const d = document.documentElement;
    return !!(d.requestFullscreen || d.webkitRequestFullscreen);
  }
  function toggleFullscreen() {
    try {
      sfxClick();
      const d = document.documentElement;
      const inFs = document.fullscreenElement || document.webkitFullscreenElement;
      let p;
      if (inFs) p = (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else p = (d.requestFullscreen || d.webkitRequestFullscreen).call(d);
      if (p && p.catch) p.catch(() => toast('A teljes képernyő itt nem érhető el.'));
    } catch (e) { toast('A teljes képernyő itt nem érhető el.'); }
  }
  function updateFsLabel() {
    if (!fsBtn) return;
    const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const label = inFs ? 'Kilépés a teljes képernyőből' : 'Teljes képernyő';
    fsBtn.innerHTML = SVG_FS;
    fsBtn.setAttribute('aria-label', label); fsBtn.title = label;
    fsBtn.appendChild(h('span', { class: 'fsl', text: label }));
  }

  function showMenu() { refreshMenu(); show('menu'); }

  // ---- súgó
  function row(ic, name, desc, pts, neg) {
    const b = h('b', null, name);
    if (pts) b.appendChild(h('span', { class: 'pts' + (neg ? ' neg' : ''), text: pts }));
    return h('div', { class: 'row' }, h('div', { class: 'ic', style: 'width:' + Math.round(uiPx * 3.4) + 'px' }, ic), h('div', null, b, h('span', { class: 'd', text: desc })));
  }
  function buildHelp() {
    if (!screens.help) {
      const card = h('div', { class: 'card wide scroll', id: 'helpcard' });
      addScreen('help', card);
    }
    const card = screens.help.firstChild;
    clear(card);
    const px = Math.round(uiPx * 3.1);
    const ic = (k) => icon(k, px);
    const P = CFG.POINTS;
    const shoot = settings.birdMode === 'shoot';
    const rows = h('div', { class: 'rows' },
      row(ic('red'), 'Piros alma', 'Egyszerű alma, a leggyakoribb.', '+' + P.red + ' pont'),
      row(ic('green'), 'Zöld alma', 'Ritkább, értékesebb.', '+' + P.green + ' pont'),
      row(ic('gold'), 'Arany alma', 'Nagyon ritka, nagyon értékes.', '+' + P.gold + ' pont'),
      row(ic('worm'), 'Kukacos alma', 'Ne kapd el! Elveszi a pontokat és megszakítja a sorozatot. Ha leesik, nem baj.', '−' + CFG.WORM_PENALTY + ' pont', true),
      row(ic('bonus_wide'), 'Széles lavór', CFG.BONUS_WIDE_T + ' másodpercig szélesebb a lavór.'),
      row(ic('bonus_slow'), 'Lassítás', CFG.BONUS_SLOW_T + ' másodpercig lassabban hullanak az almák.'),
      row(ic('bonus_life'), 'Extra élet', 'Egy élettel többed lesz.', '+1 élet'),
      row(ic('bird'), 'Madár', 'Ha almával elrepül, életet veszítesz. Kattints vagy koppints rá: ' + (shoot ? 'lelövöd' : 'elhessegeted') + ', az alma tovább esik.', '+' + CFG.BIRD_HIT_POINTS + ' pont'),
      row(ic('hedgehog'), 'Sün', 'Csak díszlet: elcipeli a földre esett almát, de nem számít bele a játékba.'),
      row(ic('wind'), 'Szél', 'A ' + CFG.WIND_FROM_LEVEL + '. szinttől a széllökések oldalra sodorják az almákat.'),
      row(h('span', { class: 'badge', text: '×' + CFG.COMBO_MAX_MULT }), 'Sorozat', 'Minden ' + CFG.COMBO_STEP + ' egymás utáni elkapás eggyel növeli a szorzót, legfeljebb ×' + CFG.COMBO_MAX_MULT + '-ig.'),
      row(ic('basin'), 'Telt lavór', 'Ha megtelik (' + CFG.BASIN_CAPACITY + ' alma), kiürül: következő szint és bónuszpontok járnak érte.'),
      row(ic('heart'), 'Élet', 'Ha egy jó alma leesik a földre, elvesztesz egy életet. Ha elfogy, vége a játéknak.', '−1 élet', true),
    );
    const ctl = h('ul', { class: 'ctl' },
      h('li', null, h('b', null, 'Lavór mozgatása: '), h('kbd', { text: 'A' }), ' ', h('kbd', { text: 'D' }), ' vagy ', h('kbd', { text: '←' }), ' ', h('kbd', { text: '→' }), ' oldalra, ', h('kbd', { text: 'W' }), ' ', h('kbd', { text: 'S' }), ' vagy ', h('kbd', { text: '↑' }), ' ', h('kbd', { text: '↓' }), ' távolabb és közelebb. Az alma árnyéka mutatja, hová esik!'),
      h('li', null, h('b', null, 'Érintőképernyőn: '), settings.touchMode === 'pad' ? 'húzd az irányítófoltot abba az irányba, amerre a lavórt vinnéd (a ↔ gombbal áthelyezheted a másik oldalra); a madárra koppints.' : 'húzd az ujjad bárhol a képernyőn abba az irányba, amerre a lavórt vinnéd; amíg nyomva tartod, arra megy, elengedve megáll. A madárra koppints.'),
      h('li', null, h('b', null, 'Egér: '), 'csak kattintásra jó (' + (shoot ? 'lövés' : 'hessegetés') + '), a lavórt nem követi.'),
      h('li', null, h('b', null, 'Szünet: '), h('kbd', { text: 'P' }), ' vagy ', h('kbd', { text: 'Esc' }), '.'),
    );
    card.appendChild(h('div', { class: 'help-head' }, h('h2', { text: 'Súgó' }), h('button', { type: 'button', class: 'btn ghost small', text: 'Vissza', onclick: () => { sfxClick(); showMenu(); } })));
    card.appendChild(h('div', { class: 'body' }, h('h3', { text: 'Irányítás' }), ctl, h('h3', { text: 'Mi micsoda?' }), rows));
    card.appendChild(h('button', { type: 'button', class: 'btn red', 'data-autofocus': true, text: 'Értem, vissza a menübe', onclick: () => { sfxClick(); showMenu(); } }));
    if (current === 'help') { const f = card.querySelector('[data-autofocus]'); if (f) f.focus({ preventScroll: true }); }
  }
  function showHelp() { buildHelp(); show('help'); }

  // ---- ranglista
  function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = (n) => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate()) + '.';
  }
  function boardTable(diff, hl) {
    const list = loadScores()[diff] || [];
    if (!list.length) return h('div', { class: 'empty', text: 'Még nincs bejegyzés ezen a nehézségen. Légy te az első!' });
    const t = h('table', { class: 'board' },
      h('thead', null, h('tr', null, h('th', { text: '#' }), h('th', { text: 'Név' }), h('th', { class: 'n', text: 'Pont' }), h('th', { class: 'n', text: 'Szint' }), h('th', { text: 'Dátum' }))));
    const tb = h('tbody');
    list.forEach((r, i) => {
      tb.appendChild(h('tr', { class: i === hl ? 'me' : '' },
        h('td', { text: String(i + 1) + '.' }), h('td', { class: 'name', text: r.name }),
        h('td', { class: 'n', text: String(r.score) }), h('td', { class: 'n', text: String(r.level) }), h('td', { text: fmtDate(r.date) })));
    });
    t.appendChild(tb);
    return t;
  }
  function buildBoard() {
    if (!screens.board) addScreen('board', h('div', { class: 'card scroll' }));
    const card = screens.board.firstChild;
    clear(card);
    const tabs = h('div', { class: 'seg tabs', role: 'radiogroup', 'aria-label': 'Nehézség' });
    DIFFS.forEach(([val, text]) => {
      tabs.appendChild(h('button', {
        type: 'button', role: 'radio', text, 'aria-checked': String(boardDiff === val), tabindex: boardDiff === val ? '0' : '-1',
        onclick: () => { boardDiff = val; sfxClick(); buildBoard(); const t = screens.board.querySelector('.tabs [aria-checked="true"]'); if (t) t.focus(); },
      }));
    });
    card.appendChild(h('div', { class: 'card-head' }, h('h2', { text: 'Ranglista' }), h('button', { type: 'button', class: 'btn ghost small', text: 'Vissza', onclick: () => { sfxClick(); showMenu(); } })));
    card.appendChild(tabs);
    card.appendChild(h('div', { class: 'body' }, boardTable(boardDiff, -1)));
  }
  function showBoard() { boardDiff = settings.difficulty; buildBoard(); show('board'); const t = screens.board.querySelector('.tabs [aria-checked="true"]'); if (t) t.focus(); }

  // ---- szünet
  function buildPause() {
    addScreen('pause', h('div', { class: 'card pause-card' },
      h('h2', { text: 'Szünet' }),
      h('button', { type: 'button', class: 'btn big', 'data-autofocus': true, text: 'Folytatás', onclick: () => { sfxClick(); if (H.onResume) H.onResume(); } }),
      h('button', { type: 'button', class: 'btn ghost', text: 'Főmenü', onclick: () => { sfxClick(); if (H.onMenu) H.onMenu(); } })));
  }
  function showPause() { show('pause'); }

  // ---- játék vége
  function buildOver() {
    addScreen('over', h('div', { class: 'card over-card', id: 'overcard' }));
  }
  function showGameOver(state) {
    const card = screens.over.firstChild;
    clear(card);
    const diff = (state.opts && state.opts.difficulty) || settings.difficulty;
    overCtx = { diff, score: state.score | 0, level: state.level | 0, saved: false };
    const input = h('input', { type: 'text', id: 'nameIn', maxlength: '14', autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', placeholder: 'Írd be a neved', 'aria-label': 'Neved a ranglistához', 'data-autofocus': true });
    input.value = settings.name || '';
    const result = h('div');
    const nameRow = h('div', { class: 'name-row' }, input, h('button', { type: 'button', class: 'btn red', text: 'Mentés', onclick: save }));
    function save() {
      if (overCtx.saved) return;
      overCtx.saved = true;
      const name = (input.value || '').trim().slice(0, 14) || 'Névtelen';
      settings.name = input.value.trim().slice(0, 14);
      saveSettings();
      const rank = addScore(diff, { name, score: overCtx.score, level: overCtx.level, date: Date.now() });
      sfxClick();
      nameField.style.display = 'none';
      clear(result);
      result.appendChild(h('p', { class: 'msg', text: rank >= 0 ? 'Mentve! ' + (rank + 1) + '. helyezett a(z) ' + DIFF_NAME[diff] + ' ranglistán.' : 'Mentve, de nem került be a legjobb ' + MAX_ROWS + ' közé.' }));
      result.appendChild(h('div', { class: 'scroller' }, boardTable(diff, rank)));
      const again = card.querySelector('[data-again]');
      if (again) again.focus({ preventScroll: true });
      const me = card.querySelector('tr.me');
      if (me && me.scrollIntoView) me.scrollIntoView({ block: 'nearest' });
    }
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    card.appendChild(h('h2', { text: 'Vége a játéknak!' }));
    card.appendChild(h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('small', { text: 'Pontszám' }), h('strong', { text: String(overCtx.score) })),
      h('div', { class: 'stat sm' }, h('small', { text: 'Szint' }), h('strong', { text: String(overCtx.level) })),
      h('div', { class: 'stat sm diff' }, h('small', { text: 'Nehézség' }), h('strong', { style: 'font-size:1.25em;padding-top:.35em', text: DIFF_NAME[diff] }))));
    const nameField = h('div', { class: 'field' }, h('span', { class: 'lab', text: 'Neved a ranglistához' }), nameRow);
    card.appendChild(nameField);
    card.appendChild(result);
    card.appendChild(h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn', 'data-again': true, text: 'Új játék', onclick: () => { sfxClick(); if (H.onStart) H.onStart(Object.assign({}, settings)); } }),
      h('button', { type: 'button', class: 'btn ghost', text: 'Főmenü', onclick: () => { sfxClick(); if (H.onMenu) H.onMenu(); } })));
    show('over');
  }

  // ---------------------------------------------------------------- HUD
  const hudCache = {};
  function buildHud() {
    const R = {};
    const mk = (tag, cls, txt) => h(tag, { class: cls, text: txt });
    R.score = mk('span', 'big', '0');
    R.scorePill = h('div', { class: 'pill' }, h('small', { text: 'Pont' }), R.score);
    R.level = mk('span', '', 'Szint 1');
    R.levelPill = h('div', { class: 'pill' }, R.level);
    R.fillBar = h('i'); R.fillTxt = h('span', { text: '0/' + CFG.BASIN_CAPACITY });
    R.fillPill = h('div', { class: 'pill', title: 'Lavór' }, h('div', { class: 'meter', role: 'progressbar', 'aria-label': 'Lavór telítettsége' }, R.fillBar, R.fillTxt));
    R.heartBox = h('span', { style: 'display:flex' });
    R.lives = mk('span', '', '0');
    R.livesPill = h('div', { class: 'pill', 'aria-label': 'Életek' }, R.heartBox, R.lives);
    R.comboTxt = mk('span', '', '');
    R.comboPill = h('div', { class: 'pill combo', style: 'display:none' }, h('small', { text: 'Sorozat' }), R.comboTxt);
    R.wideIc = h('span', { style: 'display:flex' }); R.wideTxt = mk('span', '', '');
    R.widePill = h('div', { class: 'pill bonus', style: 'display:none' }, R.wideIc, R.wideTxt);
    R.slowIc = h('span', { style: 'display:flex' }); R.slowTxt = mk('span', '', '');
    R.slowPill = h('div', { class: 'pill bonus', style: 'display:none' }, R.slowIc, R.slowTxt);
    R.windIc = h('span', { style: 'display:flex' }); R.windTxt = mk('span', '', '');
    R.windPill = h('div', { class: 'pill wind', style: 'display:none' }, R.windIc, R.windTxt);
    R.pause = h('button', { type: 'button', class: 'hbtn', 'aria-label': 'Szünet', title: 'Szünet (P)', onclick: (e) => { e.currentTarget.blur(); sfxClick(); if (H.onPauseRequest) H.onPauseRequest(); } }, h('span', { class: 'bars' }, h('i'), h('i')));
    R.snd = h('button', { type: 'button', class: 'hbtn', 'aria-label': 'Hang be/ki', title: 'Hang be/ki', onclick: (e) => {
      e.currentTarget.blur();
      const on = !(settings.music || settings.sfx);
      settings.music = on; settings.sfx = on; saveSettings(); refreshMenu(); refreshHudSound();
      if (H.onSettings) H.onSettings(settings);
      if (on) sfxClick();
    } });
    hud = R;
    R.root = h('div', { id: 'hud' },
      h('div', { class: 'grp' }, R.scorePill, R.levelPill, R.fillPill, R.livesPill, R.comboPill),
      h('div', { class: 'grp r' }, R.widePill, R.slowPill, R.windPill, R.snd, R.pause));
    layer.appendChild(R.root);
    refreshHudSound();
  }
  function refreshHudSound() {
    if (!hud) return;
    hud.snd.innerHTML = (settings.music || settings.sfx) ? SVG_SPK : SVG_SPK_OFF;
  }
  function setT(el, key, txt) { if (hudCache[key] !== txt) { hudCache[key] = txt; el.textContent = txt; return true; } return false; }
  function setShow(el, key, on) { if (hudCache[key] !== on) { hudCache[key] = on; el.style.display = on ? 'flex' : 'none'; } }
  function pulse(el) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }

  function hudIcons() {
    const key = style() + ':' + uiPx;
    if (hudCache.iconKey === key) return;
    hudCache.iconKey = key;
    const px = Math.round(uiPx * 1.9);
    const put = (box, kind) => { clear(box); box.appendChild(icon(kind, px)); };
    put(hud.heartBox, 'heart'); put(hud.wideIc, 'bonus_wide'); put(hud.slowIc, 'bonus_slow'); put(hud.windIc, 'wind');
  }

  function updateHUD(s) {
    if (!hud || !s) return;
    hudIcons();
    if (setT(hud.score, 'score', String(s.score))) pulse(hud.score);
    setT(hud.level, 'level', 'Szint ' + s.level);
    const cap = CFG.BASIN_CAPACITY;
    const caught = Math.min(cap, s.basin.caught | 0);
    const pct = Math.round(Math.max(0, Math.min(1, s.basin.fill)) * 100);
    if (hudCache.fill !== pct) { hudCache.fill = pct; hud.fillBar.style.width = pct + '%'; }
    setT(hud.fillTxt, 'fillTxt', caught + '/' + cap);
    if (setT(hud.lives, 'lives', String(s.lives))) { if (hudCache.livesSeen !== undefined) pulse(hud.livesPill); hudCache.livesSeen = true; }
    const cm = s.comboMult | 0, cb = s.combo | 0;
    setShow(hud.comboPill, 'comboShow', cb >= 2);
    setT(hud.comboTxt, 'comboTxt', cb >= 2 ? cb + ' db' + (cm > 1 ? ' · ×' + cm : '') : '');
    const wt = s.basin.wideT > 0 ? Math.ceil(s.basin.wideT) : 0;
    setShow(hud.widePill, 'wideShow', wt > 0); setT(hud.wideTxt, 'wideTxt', wt + ' mp');
    const st = s.slowT > 0 ? Math.ceil(s.slowT) : 0;
    setShow(hud.slowPill, 'slowShow', st > 0); setT(hud.slowTxt, 'slowTxt', st + ' mp');
    const wa = !!(s.wind && s.wind.active);
    setShow(hud.windPill, 'windShow', wa);
    if (wa) setT(hud.windTxt, 'windTxt', s.wind.dir > 0 ? 'Szél →' : '← Szél');
  }
  function resetHUD() { for (const k in hudCache) delete hudCache[k]; }
  function showHUD(on) { if (hud) hud.root.classList.toggle('on', !!on); }

  // ---------------------------------------------------------------- egyéb
  let toastTimer = 0;
  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = h('div', { id: 'toast', role: 'status' }); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
  }

  function setLoading(p, txt, retry) {
    const bar = document.getElementById('loadbar'), t = document.getElementById('loadtxt');
    if (bar) bar.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%';
    if (t && txt) t.textContent = txt;
    const card = document.querySelector('#loading .card');
    let b = document.getElementById('loadretry');
    if (retry && card && !b) {
      b = h('button', { type: 'button', class: 'btn red', id: 'loadretry', text: 'Újrapróbálom', onclick: retry });
      card.appendChild(b);
    } else if (!retry && b) b.remove();
  }

  function swapPadSide() {
    settings.padSide = settings.padSide === 'right' ? 'left' : 'right';
    saveSettings();
    layout();
  }

  function init(handlers) {
    H = handlers || {};
    loadSettings();
    layer = h('div', { id: 'layer' });
    document.body.appendChild(layer);
    buildMenu(); buildPause(); buildOver(); buildHud();
    buildHelp(); buildBoard();
    refreshMenu();
    layout();
    root.addEventListener('resize', layout);
    root.addEventListener('as-touch', layout);
    const sw = document.getElementById('padswap');
    if (sw) sw.addEventListener('click', (e) => { e.preventDefault(); swapPadSide(); });
    root.addEventListener('orientationchange', () => setTimeout(layout, 120));
    if (root.visualViewport) root.visualViewport.addEventListener('resize', layout);
    document.addEventListener('fullscreenchange', () => { updateFsLabel(); layout(); });
    refreshMenu();
    if (H.onSettings) H.onSettings(settings);
  }

  AS.UI = {
    init, layout, show, hideAll, showMenu, showHelp, showBoard, showPause, showGameOver,
    showHUD, updateHUD, resetHUD, toast, setLoading,
    getSettings: () => settings,
    padSpeed: () => PAD_SPEED[settings.padSpeed] || PAD_SPEED.mid,
    current: () => current,
    _addScore: addScore, _loadScores: loadScores,
  };
})(typeof window !== 'undefined' ? window : globalThis);
