// Almaszedés – közös állandók. EZT A FÁJLT CSAK A VEZETŐ (lead) SZERKESZTI.
// Minden modul innen olvassa a számokat: (window|globalThis).AS.CFG
(function (root) {
  const AS = (root.AS = root.AS || {});

  AS.CFG = {
    W: 1900, H: 850,                 // logikai vászon; minden koordináta ebben értendő

    // --- mélység (d: 0 = távol/kicsi, 1 = közel/nagy) ---
    groundY: (d) => 470 + 300 * d,   // az alma KÖZÉPPONTJA itt ér földet
    scale: (d) => 0.2 + 0.5 * d,     // sprite-méretszorzó adott mélységben

    // --- sprite alapméretek (px, scale = 1 mellett) ---
    APPLE_SIZE: 134,
    BASIN_SIZE: 350,                 // négyzetes doboz; a tál a doboz alsó felében van
    BIRD_SIZE: 320,
    BASIN_BOX_OFFSET_Y: -114,        // doboz közepe = groundY(d) + ez * scale(d)
    CATCH_RIM_OFFSET_Y: -100,        // a tál pereme = groundY(d) + ez * scale(d)

    // --- alma ---
    SPAWN_Y: 200,
    SPAWN_X: [260, 1640],
    APPLE_VY: [95, 190],             // px/s, sebességszorzó előtt
    SPAWN_DELAY: [0.5, 1.6],         // új alma születési késleltetése (s)
    APPLES_EVERY_LEVELS: 3,          // ennyi szintenként +1 alma a levegőben
    APPLES_EXTRA_MAX: 2,
    APPLE_X_CLAMP: [220, 1680],          // ide szorul vissza a szél által sodort és a madárról leejtett alma is
    KIND_WEIGHTS: { red: 70, green: 20, gold: 10 },
    POINTS: { red: 1, green: 2, gold: 5 },
    WORM_PENALTY: 3,
    WORM_CHANCE: (level) => (level < 2 ? 0 : Math.min(0.16, 0.06 + 0.02 * (level - 2))),
    BONUS_CHANCE: 0.045,             // jó alma helyett bónusztárgy esik
    BONUS_KINDS: ['bonus_wide', 'bonus_slow', 'bonus_life'],
    BONUS_WIDE_T: 10, BONUS_WIDE_FACTOR: 1.6,
    BONUS_SLOW_T: 8, BONUS_SLOW_FACTOR: 0.5,
    LANDED_FADE_T: 6,                // földön fekvő alma ennyi idő után eltűnik

    // --- lavór ---
    BASIN_X: [180, 1720],             // szélesebb, mint az almák sávja: minden alma elérhető
    BASIN_SPEED_X: 720,              // px/s
    BASIN_SPEED_D: 1.4,              // mélység/s
    BASIN_START: { x: 950, depth: 0.6 },
    CATCH_HALF_W: 205,               // * scale(basin.depth) * (széles bónusz), de legalább CATCH_MIN_HALF_W
    CATCH_MIN_HALF_W: 68,
    BASIN_CAPACITY: 12,              // ennyi jó alma tölti meg -> szintlépés
    FILL_PHASES: [0.2, 0.5, 0.8],    // fill < 0.2 -> 0. fázis, < 0.5 -> 1, < 0.8 -> 2, különben 3
    LEVELUP_T: 1.8,                  // a kiürítés animációjának hossza (s)
    LEVELUP_BONUS: (level) => 10 * level,

    // --- sorozat (kombó) ---
    COMBO_STEP: 5, COMBO_MAX_MULT: 5, // szorzó = min(5, 1 + floor(combo / 5))

    // --- nehézség ---
    DIFF: {
      easy:   { lives: 15, apples: 2, speed: 0.7,  speedPerLevel: 0.03, depthTol: 0.265, birdEvery: 40 },
      normal: { lives: 12, apples: 2, speed: 0.82, speedPerLevel: 0.04, depthTol: 0.24,  birdEvery: 34 },
      hard:   { lives: 10, apples: 2, speed: 0.95, speedPerLevel: 0.06, depthTol: 0.215, birdEvery: 28 },
    },
    SPEED_CAP: 2.2,
    MAX_LIVES_BONUS: 3,              // bónusz élettel legfeljebb ennyivel lehet a kezdő fölé menni

    // --- madár ---
    BIRD_FIRST: 15,                  // az első madár ennyi mp után jön
    BIRD_START: { x: -120, y: 100 },
    BIRD_APPROACH_SPEED: 600, BIRD_CARRY_SPEED: 300, BIRD_LEAVE_SPEED: 420,
    BIRD_FRAME_T: 0.1,               // szárnyfázis-váltás (9 fázis, 0..8)
    BIRD_HIT_RADIUS: 95,             // kattintási sugár (px), a madár középpontjától, legalább ennyi
    BIRD_HIT_POINTS: 3,
    FLASH_T: 0.45,                   // lövés utáni villanás (csak 'shoot' módban)

    // --- szél ---
    WIND_FROM_LEVEL: 2,
    WIND_GAP: [12, 20], WIND_T: 3, WIND_SPEED: [60, 140],

    // --- sün (csak látvány) ---
    HEDGEHOG_SPEED: 250,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AS;
})(typeof window !== 'undefined' ? window : globalThis);
