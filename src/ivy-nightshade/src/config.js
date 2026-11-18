window.G = window.G || {};
window.G.CFG = {
  VIEW_W: 960, VIEW_H: 540, TILE: 36,
  // player
  WALK_SPEED: 170, SNEAK_SPEED: 70, CLIMB_SPEED: 110,
  GRAVITY: 1500, JUMP_V: 560, MAX_FALL: 900,
  // noise
  NOISE_WALK: 0.55, NOISE_SNEAK: 0.07, NOISE_CLIMB: 0.2, CREAK_MULT: 3, LAND_NOISE_DIV: 700,
  // alert
  ALERT_GAIN: 2.4, ALERT_DECAY: 0.45, STIR_AT: 0.4, BEAT_BONUS: 0.35, WALKER_HEAR_RADIUS: 4, WALK_WAKE_RATE: 4, CREAK_WAKE_MULT: 1.6,
  // rhythm
  BPM: 108, BEAT_WINDOW: 0.08, MUSIC_VOL: 0.5, SFX_VOL: 0.7,
  // chandelier / crouch
  CROUCH_H: 32, CHANDELIER_AMP_DEG: 22, CHANDELIER_CLEAR: 36,
  // caught sequence (seconds)
  CAUGHT_FREEZE: 3.5, CAUGHT_FALL: 0.8, SPIDER_DESCEND: 1.4, DRAG_SPEED: 110, DRAG_MAX: 5, GETUP_TIME: 2.4, TRAP_OFF_DELAY: 0.7, DEATH_FX_T: 1.1, RUN_BACK_SPEED: 210,
  PAL: {
    plum: '#241f2e', plumDeep: '#17131e', plumLight: '#3a3247', bordeaux: '#6b2e3e', bordeauxLight: '#8e4256',
    moon: '#c9cfe0', moonDim: '#8d93a8', skin: '#f2ece4', ink: '#141018', amber: '#f3a03a', amberLight: '#f7c873',
    stone: '#4a4256', stoneDark: '#352f40', stoneLight: '#5d5469', wood: '#5a3b2e', woodDark: '#3f281f', woodLight: '#7a5240',
    green: '#5e7d4a', greenDark: '#3b5230', poison: '#9bd35a', cream: '#efe6d0', red: '#a3203a'
  }
};
