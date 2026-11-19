(function () {
  const G = window.G;

  // ---------------------------------------------------------------- authoring helpers
  // Grid builder: border of stone, floor row F of wood, stone below, ceiling rows 0..(ceil-1).
  function make(W, H, F, ceil) {
    const g = [];
    for (let r = 0; r < H; r++) g.push(new Array(W).fill(' '));
    const L = {
      W, H, F, g, ents: [],
      set(x, y, ch) { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = ch; return L; },
      rect(x1, x2, y1, y2, ch) { for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) L.set(x, y, ch); return L; },
      row(x1, x2, y, ch) { return L.rect(x1, x2, y, y, ch); },
      creak(x1, x2) { return L.row(x1, x2, F, '~'); },
      shelf(x1, x2, y) { return L.row(x1, x2, y, '-'); },
      ladder(x, y1, y2) { return L.rect(x, x, y1, y2, 'H'); },
      // lowered ceiling with two stepped shoulders on each side; bottom = last solid row
      low(x1, x2, bottom) {
        L.rect(x1, x2, 0, bottom, '#');
        L.rect(x1 - 2, x1 - 1, 0, bottom - 2, '#'); L.rect(x2 + 1, x2 + 2, 0, bottom - 2, '#');
        L.rect(x1 - 4, x1 - 3, 0, bottom - 4, '#'); L.rect(x2 + 3, x2 + 4, 0, bottom - 4, '#');
        return L;
      },
      hide(tx, kind, ty) { L.ents.push({ type: 'hide', tx, ty: ty === undefined ? F - 1 : ty, kind }); return L; },
      sleeper(tx, who, radius) { L.ents.push({ type: 'sleeper', tx, ty: F - 1, who, radius }); return L; },
      ghost(from, to, view, speed) { L.ents.push({ type: 'ghost', tx: from, ty: F - 1, from, to, view: view || 5, speed: speed || 45 }); return L; },
      walker(tx, from, to, speed) { L.ents.push({ type: 'walker', tx, ty: F - 1, who: 'butler', from, to, speed }); return L; },
      trap(tx, kind, offset, ty) { L.ents.push({ type: 'trap', tx, ty: ty === undefined ? F - 1 : ty, kind, offset: offset || 0 }); return L; },
      chandelier(tx, anchorRow, offset) { L.ents.push({ type: 'trap', tx, ty: anchorRow, kind: 'chandelier', offset: offset || 0 }); return L; },
      deco(tx, kind, ty) { L.ents.push({ type: 'deco', tx, ty: ty === undefined ? F - 1 : ty, kind }); return L; },
      wall(tx, kind, up) { return L.deco(tx, kind, F - up); }, // wall decoration, `up` rows above ground row
      web(tx, ty) { L.ents.push({ type: 'deco', tx, ty, kind: 'cobweb' }); return L; },
    };
    L.rect(0, W - 1, 0, H - 1, '#');
    L.rect(1, W - 2, ceil, F - 1, ' ');
    L.row(1, W - 2, F, '=');
    return L;
  }
  function finish(L, meta) {
    return Object.assign({
      grid: L.g.map((r) => r.join('')),
      entities: L.ents,
    }, meta);
  }

  // ================================================================ 1. Bedrooms
  function floor1() {
    const F = 13, L = make(70, 15, F, 2);
    // Ivy's room
    L.deco(3, 'bed_ivy').deco(9, 'perch').deco(7, 'rug').deco(14, 'candelabra').web(1, 2);
    L.hide(12, 'wardrobe');
    // gallery: creaky teaching floor, portraits, then a low arch with one chandelier
    L.creak(16, 17);
    L.wall(15, 'portrait', 4).wall(17, 'portrait', 4);
    L.low(25, 33, 5).chandelier(29, 6, 0);
    L.hide(20, 'curtain');
    L.wall(38, 'portrait', 4).wall(40, 'portrait', 4);
    // parents' bedroom
    L.sleeper(55, 'parents', 6);
    L.creak(50, 51).creak(58, 59);
    L.ghost(38, 44, 4.5).hide(42, 'wardrobe').deco(45, 'clock').deco(51, 'candelabra').deco(59, 'candelabra');
    L.ladder(47, 8, 12).shelf(48, 62, 8).ladder(63, 8, 12);
    L.hide(65, 'curtain');
    return finish(L, {
      id: 'floor1', nameKey: 'lvl_floor1', theme: 'bedroom', introKey: 'intro_floor1',
      start: { tx: 6, ty: F - 1 }, exit: { tx: 67, ty: F - 1 },
    });
  }

  // ================================================================ 2. Greenhouse
  function floor2() {
    const F = 17, L = make(84, 19, F, 3);
    // raised terrace on the right
    L.rect(47, 82, 11, 11, '=').rect(47, 82, 12, 17, '#');
    L.ladder(46, 11, 16);
    // entrance
    L.deco(5, 'plantpot').deco(11, 'plantpot').deco(23, 'plantpot').web(1, 3);
    L.hide(8, 'curtain');
    // first plant wave (offsets 0,1,2) with a shelf bypass over the middle one
    L.trap(13, 'plant', 0).trap(17, 'plant', 1).trap(21, 'plant', 2);
    L.shelf(15, 19, 15);
    L;
    L.hide(25, 'wardrobe');
    // grandma's armchair
    L.sleeper(35, 'grandma', 6);
    L.creak(30, 31).creak(38, 39);
    L.deco(30, 'plantpot').deco(41, 'plantpot').deco(45, 'plantpot');
    L.hide(43, 'curtain');
    // terrace
    L.hide(50, 'wardrobe', 10);
    L.trap(55, 'plant', 0, 10).trap(60, 'plant', 1, 10).trap(65, 'plant', 2, 10).trap(70, 'plant', 1, 10);
    L.shelf(56, 61, 9);
    L.deco(52, 'plantpot', 10).deco(57, 'plantpot', 10).deco(73, 'plantpot', 10).web(48, 3);
    L.hide(63, 'wardrobe', 10).hide(75, 'curtain', 10);
    L.ents.push({ type: 'ghost', tx: 75, ty: 10, from: 75, to: 79, view: 4, speed: 40 });
    L.deco(78, 'candelabra', 10);
    return finish(L, {
      id: 'floor2', nameKey: 'lvl_floor2', theme: 'greenhouse', introKey: 'intro_floor2',
      start: { tx: 3, ty: F - 1 }, exit: { tx: 80, ty: 10 },
    });
  }

  // ================================================================ 3. Laboratory
  function floor3() {
    const F = 15, L = make(92, 17, F, 2);
    L.deco(5, 'bookshelf');
    L.deco(7, 'labbench').web(1, 2);
    L.hide(14, 'wardrobe').ghost(9, 13, 4, 40);
    L.trap(19, 'spark', 0);
    L.hide(25, 'wardrobe');
    L.trap(29, 'flask', 0).trap(34, 'flask', 3);
    L.deco(31, 'labbench');
    L.hide(40, 'wardrobe');
    L.deco(44, 'bookshelf');
    L.hide(46, 'armor').ghost(41, 47, 4, 45);
    // uncle
    L.sleeper(56, 'uncle', 6);
    L.creak(52, 53).creak(59, 60);
    L.ladder(49, 10, 14).shelf(50, 62, 10).ladder(63, 10, 14);
    L.deco(52, 'candelabra').deco(61, 'bookshelf').web(48, 2);
    L.hide(67, 'wardrobe');
    L.trap(72, 'spark', 1).trap(80, 'spark', 2);
    L.deco(76, 'labbench');
    L.hide(85, 'armor');
    L.deco(87, 'candelabra');
    return finish(L, {
      id: 'floor3', nameKey: 'lvl_floor3', theme: 'lab', introKey: 'intro_floor3',
      start: { tx: 3, ty: F - 1 }, exit: { tx: 89, ty: F - 1 },
    });
  }

  // ================================================================ 4. Great hall & kitchen
  function floor4() {
    const F = 15, L = make(112, 17, F, 2);
    // great hall entrance
    L.wall(7, 'banner', 3).wall(12, 'banner', 3).deco(18, 'clock').web(1, 2).deco(3, 'candelabra');
    L.hide(9, 'armor').hide(15, 'fireplace').ghost(16, 21, 4, 42);
    // servants' passage (low ceiling, butler patrols)
    L.low(31, 49, 11);
    L.hide(26, 'armor');
    L.walker(34, 34, 46, 48);
    L.hide(40, 'fireplace');
    L.deco(36, 'candelabra').deco(44, 'bookshelf');
    L.hide(54, 'armor');
    // great hall: three vaulted bays, each with a hanging chandelier (staggered by 2 beats)
    L.low(60, 68, 7).low(74, 82, 7).low(88, 96, 7);
    L.chandelier(64, 8, 0).chandelier(78, 8, 2).chandelier(92, 8, 4);
    L.hide(71, 'armor').hide(85, 'armor');
    L.hide(102, 'fireplace').ghost(103, 107, 4, 40);
    L.wall(105, 'banner', 3).deco(106, 'candelabra').deco(98, 'clock');
    return finish(L, {
      id: 'floor4', nameKey: 'lvl_floor4', theme: 'hall', introKey: 'intro_floor4',
      start: { tx: 5, ty: F - 1 }, exit: { tx: 109, ty: F - 1 },
    });
  }

  // ---------------------------------------------------------------- dungeon authoring helpers
  function dg(L) {
    const F1 = L.F - 1;
    L.skel = (tx, width, offset) => { L.ents.push({ type: 'skeletons', tx, ty: F1, width, offset: offset || 0 }); return L; };
    L.rock = (tx, offset) => { L.ents.push({ type: 'rockfall', tx, ty: F1, offset: offset || 0 }); return L; };
    L.cweb = (tx, len) => { L.ents.push({ type: 'web', tx, ty: F1, len }); return L; };
    L.dark = (tx, w) => { L.ents.push({ type: 'dark', tx, ty: 0, w, h: L.H }); return L; };
    L.torch = (tx, zone) => { L.ents.push({ type: 'torch', tx, ty: F1, zone }); return L; };
    L.spawn = (tx) => { L.ents.push({ type: 'ghostspawn', tx, ty: F1 }); return L; };
    L.chain = (tx) => L.deco(tx, 'chains', 1);
    L.cobweb = (tx) => L.deco(tx, 'cobweb', 1);
    return L;
  }

  // ================================================================ 5. The crypt (dungeon, part 1)
  function crypt1() {
    const F = 13, L = dg(make(105, 15, F, 2));
    // arrival
    L.deco(3, 'archway').chain(8).cobweb(1).deco(7, 'urn').hide(10, 'armor');
    // 1. dancing skeletons: wait for a gap or jump over them
    L.deco(13, 'bones').skel(16, 6, 0).chain(19).deco(24, 'skulls').hide(26, 'curtain');
    // 2. rockfall under a low vault (watch the dust)
    L.low(31, 37, 5).rock(34, 0).deco(30, 'tomb').chain(33).chain(36);
    L.hide(42, 'armor').deco(45, 'urn');
    // 3. cobweb passage, then a ghost on patrol
    L.cweb(48, 3).cobweb(47).chain(50).deco(53, 'bones').ghost(52, 55, 3.5, 35); // tearing the web turns this ghost
    L.hide(55, 'curtain').ghost(59, 63, 4, 40).deco(65, 'coffin').chain(60);
    L.hide(69, 'armor');
    // 4. dark zone with two torches
    L.dark(72, 18).torch(74, 0).torch(86, 0).deco(79, 'tomb').deco(83, 'skulls').chain(81).cobweb(73);
    L.hide(91, 'curtain');
    // 5. final waltz
    L.skel(94, 5, 3).deco(93, 'urn').chain(97).deco(101, 'candelabra').deco(100, 'banner', F - 3);
    return finish(L, {
      id: 'crypt1', nameKey: 'lvl_crypt1', theme: 'crypt', introKey: 'intro_crypt1',
      start: { tx: 6, ty: F - 1 }, exit: { tx: 102, ty: F - 1 },
    });
  }

  // ================================================================ 6. The scroll chamber (dungeon, part 2)
  function crypt2() {
    const W = 122, F = 13, L = dg(make(W, 15, F, 2));
    L.deco(3, 'archway').chain(8).cobweb(1).deco(7, 'urn').hide(10, 'armor');
    // skeleton ballroom: two pairs, out of step
    L.deco(12, 'bones').skel(14, 5, 0).chain(17).hide(22, 'curtain').deco(24, 'skulls');
    L.skel(26, 6, 3).chain(29).deco(33, 'bones').hide(34, 'armor');
    // two stones under a low vault
    L.low(38, 46, 5).rock(40, 0).rock(44, 2).chain(42).deco(49, 'urn').hide(52, 'curtain');
    // webs with a ghost between them
    L.cweb(56, 3).cobweb(55).ghost(62, 66, 4, 40).hide(60, 'armor').deco(68, 'coffin').hide(70, 'curtain');
    L.cweb(73, 3).chain(74).deco(76, 'skulls').ghost(78, 82, 3.5, 35); // tearing the web turns this ghost
    // dark zone: web, stone, two torches
    L.hide(77, 'armor').dark(79, 19).torch(81, 0).torch(96, 0).deco(84, 'tomb').cobweb(80);
    L.cweb(87, 2).low(89, 93, 5).rock(91, 4).chain(90).deco(94, 'bones');
    L.hide(99, 'curtain');
    // candle room
    L.deco(101, 'bones').chain(103).chain(108).deco(115, 'banner', F - 3).hide(110, 'curtain');
    L.ents.push({ type: 'candles', tx: 103, ty: F - 1 });
    L.ents.push({ type: 'door', tx: 113, ty: F - 1 });
    L.ents.push({ type: 'scroll', tx: 117, ty: F - 1 });
    [20, 32, 48, 67, 83, 95, 102, 107].forEach((x) => L.spawn(x));
    L.deco(100, 'candelabra').deco(119, 'candelabra');
    return finish(L, {
      id: 'crypt2', nameKey: 'lvl_crypt2', theme: 'crypt', introKey: 'intro_crypt2',
      start: { tx: 6, ty: F - 1 }, exit: { tx: W + 8, ty: F - 1 }, // unreachable: the level ends at the scroll
    });
  }

  G.LEVELS = [floor1(), floor2(), floor3(), floor4(), crypt1(), crypt2()];
})();
