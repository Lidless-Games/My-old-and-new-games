# Ivy Nightshade – architecture contract (M1: playable castle)

Read this whole file before writing code.
Game: gothic, deadpan, kid-friendly stealth platformer. Heroine Ivy Nightshade (never smiles, black dress, white collar,
two long black braids, carries a candle) wakes in her family castle during holidays; her two-headed crow is missing.
She must sneak down 4 castle floors (M1) to reach a magic scroll in the dungeon (later milestones) without waking anyone.
Getting caught is never scary: a short funny scene, then Ivy runs back to the last hiding spot (checkpoint). No lives.
Traps move to the beat of a cello waltz; stepping on the beat masks Ivy's noise.

## Build & runtime
- Plain browser JS, no frameworks, no modules/imports, no external assets (no images, fonts, audio files).
  All graphics drawn with Canvas 2D paths; all audio generated with WebAudio.
- Every `src/*.js` file is a plain script. They are concatenated by `python3 build.py` in this order:
  `config.js, core.js, i18n.js, rhythm.js, art.js, player.js, stealth.js, traps.js, levels.js, ui.js, game.js, main.js`
  into `dist/ivy-nightshade.html` (single self-contained file).
- Global namespace: `window.G` (created in core.js). Every file starts with `(function(){ const G = window.G; ... })();`
  and attaches its exports to `G`. Never create other globals. Read config only via `G.CFG`.
- Files may only reference other modules' symbols at call time (inside functions), not at load time,
  except `G.CFG`, `G.util`, `G.events`, which exist before everything else.
- Screenshot / test tool: `python3 tools/shot.py <html> <out.png> [--wait ms] [--keys "Right:1500,Space:100"] [--query "?test=..."]`
  (headless Chrome, 960x540). Use it and LOOK at the PNG to verify visual work.

## File ownership (edit only your own files; never touch others)
| File | Owner |
|---|---|
| ARCHITECTURE.md, config.js, core.js, game.js, main.js, build.py, tools/ | lead |
| player.js | player agent |
| stealth.js, traps.js | stealth agent |
| rhythm.js | audio agent |
| art.js | art agent |
| i18n.js, ui.js | ui agent |
| levels.js | levels agent (wave 2) |
Test pages you create go to `tests/<yourmodule>_*.html` (may inline stubs). Need a config value that is missing?
Use a local default `G.CFG.X ?? fallback` and mention it in your report.

## Coordinates
- Logical view: `CFG.VIEW_W`=960 × `CFG.VIEW_H`=540 px; canvas is scaled to fit the window (letterboxed).
- `CFG.TILE` = 36 px. World px = tile * TILE. y grows downward.
- Entity positions in level data are in TILES; at runtime in PX. Convention: an entity `x,y` in px means
  **bottom-centre** (feet) unless stated. Level entity tile coords `(tx,ty)` → px `x = (tx+0.5)*TILE`, `y = (ty+1)*TILE`
  (i.e. standing on top of row ty+1).

## Level data (levels.js → `G.LEVELS` = array of level objects)
```js
{
  id: 'floor1', nameKey: 'lvl_floor1', theme: 'bedroom'|'greenhouse'|'lab'|'hall',
  grid: [ '########...', ... ],          // rows of equal length; height any (>=15)
  start: {tx, ty},                        // Ivy spawn (also first checkpoint)
  exit:  {tx, ty},                        // stairs down; touching it finishes level
  entities: [
    {type:'sleeper', tx, ty, who:'parents'|'grandma'|'uncle', radius: 5},      // radius in tiles
    {type:'walker',  tx, ty, who:'butler', from: tx1, to: tx2, speed: 40},    // sleepwalker patrol (px/s)
    {type:'hide',    tx, ty, kind:'wardrobe'|'armor'|'fireplace'|'curtain'},  // hiding spot = checkpoint
    {type:'trap',    tx, ty, kind:'chandelier'|'spark'|'plant'|'flask', offset: 0},  // offset in beats
    {type:'deco',    tx, ty, kind: <see art deco kinds>},
    {type:'creak',   tx, ty, len: 3},       // marks len tiles of floor (row ty) as creaky (alternative to '~')
  ],
  introKey: 'intro_floor1'                // i18n key shown on level start card
}
```
Grid chars: `' '` or `.` empty · `#` stone (solid) · `=` wooden floor (solid) · `~` creaky wooden floor (solid, noisy)
· `-` one-way platform (solid only from above, can jump up through, Down+Jump drops through) · `H` ladder (non-solid, climbable).
Level edges outside grid count as solid.

## Core (core.js, lead) — available to everyone
- `G.CFG` constants (config.js). `G.util`: `clamp, lerp, rand(a,b), randInt(a,b), choice(arr), overlap(a,b)` (rects {x,y,w,h}), `dist(ax,ay,bx,by)`, `easeOutCubic`.
- `G.events`: `on(name, fn)`, `off(name, fn)`, `emit(name, data)`; `clear()` (called by game between levels — re-subscribe in constructors).
- `G.input`: `down(action)` held, `pressed(action)` this frame, `released(action)`. Actions: `left right up down jump sneak action pause confirm back`.
  Keys: arrows/WASD, Space/W/Up = jump (up also climbs ladders), Shift = sneak, E/Enter = action, Esc/P = pause,
  Enter/Space = confirm, Esc/Backspace = back. `G.input.anyPressed()`; `G.input.virtual` object (mobile, later).
- `G.World` class: `new G.World(level)`; fields `cols, rows, wpx, hpx, level`. Methods:
  `tile(tx,ty)` char ('#' outside), `isSolid(tx,ty)` (# = ~), `isOneWay(tx,ty)` (-), `isLadder(tx,ty)` (H),
  `isCreaky(tx,ty)` ('~' or creak entity), `toTile(px)` = floor(px/TILE), `entPos(ent)` → {x,y} px bottom-centre.
- `G.camera` {x,y} top-left of view in world px; game.js sets it. `G.time` total seconds; `G.dt` frame dt (fixed 1/60).
- `G.save`: `get(key, def)`, `set(key, val)` (localStorage, try/catch). Keys: `lang`, `music`, `progress` (highest level index unlocked).
- `G.scenes.set(sceneObj)`; scene objects have `enter()`, `update(dt)`, `draw(ctx)`, optional `exit()`.
  `G.ctx` is the 960×540 logical context (already scaled). `G.canvas`.

## Player (player.js) → `G.Player`
```js
const p = new G.Player(world, x, y);   // px, bottom-centre
p.x, p.y (bottom-centre px), p.w = 18, p.h = 50, p.vx, p.vy, p.facing (1|-1), p.onGround, p.onLadder
p.state: 'idle'|'sneak'|'walk'|'jump'|'fall'|'climb'|'hidden'|'frozen'
p.noise          // noise emitted THIS frame, 0..1 continuous loudness (see rules) – read by stealth
p.control = true // game sets false during cutscenes/caught sequence (then no input is read)
p.update(dt)     // reads G.input when control && state!=='hidden'
p.rect()         // {x,y,w,h} top-left AABB
p.setPos(x,y)    // teleport, zero velocity
p.hide(spot) / p.unhide()   // spot = runtime hide object {x,y}; hidden: invisible, no movement, noise 0
p.draw(ctx)      // calls G.art.drawIvy(ctx, p.x, p.y, {state, facing, t, speed})
```
Movement: walk speed `CFG.WALK_SPEED`, sneak (Shift held) `CFG.SNEAK_SPEED`, gravity `CFG.GRAVITY`, jump `CFG.JUMP_V`,
coyote time 0.1 s, jump buffer 0.1 s, variable jump height (release early = lower). Ladders: Up/Down when overlapping `H`
→ climb at `CFG.CLIMB_SPEED`, no gravity; jump off ladder allowed. One-way `-`: land from above; Down+Jump drops through.
Noise rules (per frame value): idle 0 · sneak moving `CFG.NOISE_SNEAK` · walk `CFG.NOISE_WALK` · on creaky tile ×`CFG.CREAK_MULT` (cap 1)
· landing: spike = clamp(fallSpeed/CFG.LAND_NOISE_DIV, 0.3, 1) for that frame · climbing `CFG.NOISE_CLIMB`.
Events emitted: `'step' {x,y,creaky,sneak}` at each footfall (stride timer), `'jump' {x,y}`, `'land' {x,y,noise}`.

## Rhythm & audio (rhythm.js) → `G.rhythm`, `G.sfx`
```js
G.rhythm.unlock()        // call from first user gesture; creates AudioContext (safe to call repeatedly)
G.rhythm.startMusic(name) // 'castle' | 'menu' ; G.rhythm.stopMusic()
G.rhythm.setMusicEnabled(bool)  // music volume 0 but clock keeps running
G.rhythm.beat()          // float beats since clock start (runs even with music off / audio locked; uses performance.now if needed)
G.rhythm.beatPhase()     // 0..1 position within current beat
G.rhythm.barBeat()       // 0,1,2 index within the 3/4 bar
G.rhythm.nearBeat(win?)  // true if within win seconds (default CFG.BEAT_WINDOW) of a beat
G.sfx.play(name, opts?)  // opts {vol}. Names: step, creak, land, jump, snore, stir, wake, door, slippers, hide,
                         // checkpoint, caught, spark, chandelier, plant, flask, crow, ui_move, ui_ok, win, whoosh
```
BPM `CFG.BPM` (3/4 waltz). Music: generated minor-key cello waltz (bowed bass on beat 1, pizzicato on 2 & 3, sparse melody).
Clock must be sample-accurate when audio runs (AudioContext.currentTime) so traps line up with the music.

## Art (art.js) → `G.art` (pure drawing; never mutates game state)
Style: hand-drawn gothic storybook (DESIGN.md §5): soft curved shapes, muted gothic palette (deep plum #241f2e, bordeaux #6b2e3e,
moonlight blue #c9cfe0, cream skin #f2ece4, ink #141018, candle amber #f3a03a). No pixel look. Use `G.CFG.PAL` colours.
All world functions get ctx already translated by camera; x,y = bottom-centre px unless stated.
```js
G.art.drawBackground(ctx, cam, theme, t)         // SCREEN space, full 960x540, parallax walls/arches/moon windows
G.art.drawTiles(ctx, world, cam, theme)          // WORLD space, only visible tiles; stone, wood, creaky (slightly different planks), one-way ledge, ladder
G.art.drawIvy(ctx, x, y, {state, facing, t, speed}) // ~50px tall; braids, white collar, black dress, holds candle; animations per state
G.art.drawSleeper(ctx, x, y, {who, state:'sleep'|'stir'|'awake', alert:0..1, t})
      // parents: big four-poster bed with two sleepers (~4 tiles wide); grandma: armchair; uncle: slumped over lab desk
G.art.drawWalker(ctx, x, y, {who:'butler', facing, t, alert})  // sleepwalking butler, arms forward, nightcap
G.art.drawZzz(ctx, x, y, {t, alert})             // floating Z's; faster/shakier with alert; '!' when alert>0.8
G.art.drawHideSpot(ctx, x, y, {kind, occupied, t})  // wardrobe, armor, fireplace, curtain (~1.5-2 tiles wide, ~2.5 tall); occupied: door ajar + two eyes
G.art.drawTrap(ctx, x, y, {kind, phase, danger, t}) // phase 0..1 cycle position, danger bool
      // chandelier: x,y = ceiling anchor (TOP centre), swinging pendulum; spark: pair of tesla coils, arc when danger
      // plant: snapping carnivorous plant (bottom-centre); flask: bubbling flask that puffs green smoke when danger
G.art.drawDeco(ctx, x, y, {kind, t})  // kinds: window, portrait, candelabra, bookshelf, cobweb (top-left anchor), plantpot, labbench,
      // rug, clock, banner, armorstand, bed_ivy (Ivy's own bed), stairs_down (exit door/archway), perch (empty crow perch)
G.art.drawCrow(ctx, x, y, {t, heads:2|3, scale, flap})
G.art.drawLight(ctx, sx, sy, t, strength)  // SCREEN space darkness overlay with warm candle light around (sx,sy)
G.art.drawBubble(ctx, x, y, text, {who:'ivy'|'npc'|'ghost'})  // speech bubble with tail pointing to (x,y); wraps text ~260px
G.art.drawCard(ctx, title, subtitle, alpha)  // SCREEN space level title card
```

## Stealth (stealth.js) → `G.Stealth`;  Traps (traps.js) → `G.Traps`
```js
const s = new G.Stealth(world, player, level);   // builds sleepers, walkers, hide spots from level.entities
s.sleepers[] {x,y,who,radius(px),alert,state}; s.walkers[] {x,y,who,from,to,speed,facing,alert}; s.hides[] {x,y,kind,occupied, w,h}
s.checkpoint {x,y}       // last used hide spot (starts at level start)
s.update(dt)             // alert dynamics, walker patrol, hide/unhide input (Down or E near spot → hide; any move/jump key → unhide)
s.draw(ctx)              // hides, sleepers (+zzz), walkers — via G.art
s.resetAlerts()          // after caught: all alert=0, walkers back to start
s.nearestHide()          // spot player overlaps or null (for HUD hint)
s.maxAlert()             // 0..1 for HUD meter
```
Alert: player in radius (distance centre→centre) and not hidden → `alert += noise * CFG.ALERT_GAIN * mult * dt`,
mult = `CFG.BEAT_BONUS` (<1) if `G.rhythm.nearBeat()` else 1; noise further scaled by (1 - d/radius*0.5).
Otherwise `alert -= CFG.ALERT_DECAY * dt`. state: alert>`CFG.STIR_AT` → 'stir' (emit `'stir'` once), ≥1 → 'awake' → emit `'caught' {by:'sleeper', who, x, y}`.
Walker (sleepwalker): patrols from..to; if its rect overlaps non-hidden player → `'caught' {by:'walker', who, x,y}`. Also hears noise (alert like sleeper, radius 4 tiles; at 1 → caught).
Hiding in a spot emits `'hide'` and `'checkpoint' {x,y}` when it is a new spot.
```js
const tr = new G.Traps(world, player, level);  // from entities type 'trap'
tr.update(dt)   // phase driven by G.rhythm.beat() + offset; danger windows per kind; if danger hitbox overlaps player → emit 'caught' {by:'trap', kind, x, y}
tr.draw(ctx)
```
Trap timing (cycle in beats): chandelier 6 beats pendulum (danger when bob hitbox overlaps), spark 3 beats (danger on beat 1 for 0.5 beat),
plant 3 beats (snaps on beat 3), flask 6 beats (puff on beat 6, 1 beat long). Must be readable/telegraphed one beat before danger.
Emit sfx via `G.sfx.play` at danger start.

## UI (ui.js) & i18n (i18n.js)
```js
G.i18n.lang ('hu'|'en'); G.i18n.setLang(l) (saves); G.t(key, vars?) → string, '{name}' placeholders; missing key → key
G.STRINGS = {hu:{...}, en:{...}}
G.ui.MenuScene    // scene object: title art (Ivy + 2-headed crow, castle silhouette), items: Új játék/New game, Folytatás/Continue (if progress>0),
                  // Nyelv: Magyar/English (left/right toggles), Zene: be/ki, Irányítás/Controls (shows key help). Calls G.game.start(levelIndex).
G.ui.drawHUD(ctx, {alert, hint, levelName})  // SCREEN space: alert meter (eye icon filling), hint text near bottom, level name top-left
G.ui.PauseOverlay // {draw(ctx), update(dt) → 'resume'|'menu'|null}
```

## Game (game.js, lead) → `G.game`
`G.game.start(i)`, level flow, camera, caught sequence, intro/end cards, `G.game.nextLevel()`.
Events used by game: `caught`, `checkpoint`, `stir`. Draw order: background → tiles → deco → traps → stealth → player → light → HUD.

# M2 addendum – the dungeon (levels 5–6, theme 'crypt')
Levels 5 and 6 continue right after floor 4 in `G.LEVELS` (indices 4, 5). New theme `'crypt'`.
Ghosts (all levels): besides seeing, a ghost HEARS Ivy behind it: if she is within `CFG.GHOST_HEAR_RADIUS ?? 3.5` tiles
of a ghost, not hidden, and her current noise > `CFG.NOISE_SNEAK*1.5` (i.e. not sneaking / not standing still),
the ghost turns around towards her (and then its normal view rules apply). Sneaking behind a ghost is safe.

## New level entities (dungeon.js reads them; levels.js places them)
```js
{type:'skeletons', tx, ty, width: 4, offset: 0}  // a pair of dancing skeletons waltzing back and forth over `width` tiles
                                                  // on the beat (6-beat loop). Touching one = spotted: emit 'caught' {by:'skeleton', who:'skeleton', x, y}
{type:'rockfall', tx, ty, offset: 0}              // ceiling stone above (tx, ceiling) falling on beat (6-beat loop):
                                                  // dust trickles 1 beat before (warn), stone falls (danger), lies 1 beat, resets.
                                                  // Hit = death: emit 'caught' {by:'trap', kind:'rock', x, y}
{type:'web', tx, ty, len: 3}                      // sticky cobweb patch on the floor (row ty) of len tiles: Ivy moves at
                                                  // CFG.WEB_SLOW ?? 0.45 speed; walking through rips it → emits 'noise' {x,y,radius:6 tiles}
                                                  // (ghosts within radius turn towards it); sneaking through is quiet
{type:'dark', tx, ty, w: 12, h: 8}                // dark zone (tile rect): while Ivy is inside, the light overlay strength is
                                                  // CFG.DARK_STRENGTH ?? 0.93 (only her candle circle visible) unless the zone is lit
{type:'torch', tx, ty, zone: 0}                   // wall torch (index of the dark zone it belongs to in level order of 'dark' entities);
                                                  // Ivy presses action (E/↓) next to an unlit torch → it lights; when all torches of a
                                                  // zone are lit the zone becomes lit (normal light strength). Lighting is silent.
{type:'candles', tx, ty}                          // the 4-candle puzzle row (4 candles 1.5 tiles apart starting at tx, on row ty)
{type:'door', tx, ty}                             // crypt door (2 tiles wide, 3 tall, bottom at row ty+1); solid while closed
{type:'scroll', tx, ty}                           // magic scroll on a pedestal behind the door; touching it = level/milestone end
{type:'ghostspawn', tx, ty}                       // allowed spawn points for puzzle ghosts (never on a hide spot / at the door)
```
Candle puzzle rules: on level start 3 of the 4 candles are randomly chosen as "right". Ivy lights a candle with action next to it
(max 3 lit; lighting a 4th puts out the earliest lit one). When exactly 3 are lit:
right set → the 4th lights by itself, door opens (emit 'door_open'); wrong set → all 4 go out with a puff, and a ghost appears
at a random 'ghostspawn' point not within 2 tiles of Ivy (emit 'ghost_summoned'); if the level would then have 4 ghosts, the
oldest summoned (else oldest) ghost vanishes, so at most 3 at once. `G.Ghosts` must offer `add(x, y, opts)` and `remove(ghost)`.

## Module ownership (M2)
- `src/dungeon.js` (new, build order after ghosts.js) → `G.Dungeon` class: `new G.Dungeon(world, player, level, ghosts)`;
  `update(dt)`, `draw(ctx)` (world space, after traps), `paused`, `reset()` (after caught: skeletons/rocks restart; webs/torches/
  candles keep state), `lightStrength(base)` → light overlay strength for the current frame, `nearestAction()` → hint key or null
  ('hint_torch' | 'hint_candle'), `isSolid(tx,ty)` extra solidity (closed door) – the lead wires this into World.isSolid via
  `world.extraSolid = (tx,ty) => …`, `speedMul()` → current movement multiplier (web), `scrollReached` bool.
  Owner: mechanics agent (also owns ghosts.js changes).
- `src/art.js` additions (owner: art agent): theme 'crypt' for drawBackground/drawTiles; deco kinds tomb, coffin, skulls, bones,
  urn, archway, chains; `drawSkeleton(ctx,x,y,{t, phase, facing, partner})`, `drawRock(ctx,x,y,{state:'warn'|'fall'|'rest', k, t})`,
  `drawWeb(ctx,x,y,{len, torn, t})` (x,y = left end on floor), `drawTorch(ctx,x,y,{lit,t})`, `drawPuzzleCandle(ctx,x,y,{lit,t,puff})`,
  `drawDoor(ctx,x,y,{open:0..1,t})` (x,y bottom-centre), `drawScroll(ctx,x,y,{t, glow})`, `drawVortex(ctx,x,y,{k,t})` (teleport swirl, k 0..1).
- `src/levels.js` levels 5–6 + i18n strings (wave 2, levels agent). `src/game.js` (lead): integration, light strength, ending scene.
