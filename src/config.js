// Single source of truth for tuning. Units: metres, seconds, radians unless noted.

export const TICK = 1 / 64; // fixed simulation step (64 Hz)

export const MOVE = {
  runSpeed: 6.0,
  walkSpeed: 3.1,
  crouchSpeed: 2.4,
  groundAccel: 10,
  airAccel: 10,
  airSpeedCap: 0.8,      // air-strafe wish-speed cap (Quake/Source style)
  friction: 6.5,
  stopSpeed: 2.0,
  jumpVelocity: 5.6,     // ~0.98 m clearance; crouch-jump adds 0.6 m
  gravity: 16,
  radius: 0.35,
  standHeight: 1.8,
  crouchHeight: 1.2,
  standEye: 1.64,
  crouchEye: 1.08,
  stepHeight: 0.45,
  accurateFraction: 0.34, // below 34% of run speed you shoot with full accuracy
  adsSpeed: 0.6,          // move-speed multiplier while aiming down sights
  adsTime: 0.15,          // seconds to raise sights fully
};

// Cumulative spray offsets in degrees, [right, up] per shot index.
function lancerPattern() {
  const p = [];
  let x = 0, y = 0;
  const climb = [0, 0.35, 0.5, 0.6, 0.65, 0.65, 0.6, 0.55, 0.5, 0.45];
  const jitter = [0, 0.02, -0.03, 0.05, -0.02, 0.06, 0.08, -0.04, 0.05, 0.07];
  for (let i = 0; i < 30; i++) {
    if (i < 10) { y += climb[i]; x += jitter[i]; }
    else if (i < 18) { y += 0.12; x -= 0.32; }   // drifts left
    else if (i < 25) { y += 0.06; x += 0.42; }   // swings right
    else { y += 0.03; x -= 0.25; }               // settles back left
    p.push([x, y]);
  }
  return p;
}

// Pistol: small climb with a little sideways wander.
function voxPattern() {
  const p = [];
  let x = 0, y = 0;
  for (let i = 0; i < 12; i++) {
    if (i) { y += 1.1 - i * 0.04; x += (i % 3 === 0 ? -0.25 : 0.15); }
    p.push([x, y]);
  }
  return p;
}

// Generic climb with sideways wobble, for weapons without a hand-made pattern.
function climbPattern(n, climb, sway) {
  const p = [];
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) {
    if (i) { y += climb * Math.max(0.25, 1 - i / n); x += Math.sin(i * 0.9) * sway; }
    p.push([x, y]);
  }
  return p;
}

const STILL = { stand: 0, crouch: 0, move: 0, air: 0, perShot: 0, maxBloom: 0, bloomRecover: 1 };
const NO_RECOIL = { pattern: [[0, 0]], viewFraction: 0, recoverDelay: 0, recoverRate: 1 };

// slot: 'primary' | 'secondary' | 'melee' | 'utility'   model: viewmodel shape   auto: full-auto when held
// armorPen: fraction of damage that passes armour   price / reward in credits
// speed: move-speed multiplier while held   adsSpread: spread multiplier at full ADS (default 0.55)
// pellets / pelletSpread: shotgun   scope: ADS shows a scope overlay and unscopes after each shot
export const WEAPONS = {
  vox9: {
    short: 'VOX-9',
    name: 'VOX-9',
    slot: 'secondary',
    model: 'pistol',
    auto: false,
    speed: 1,
    adsZoom: 1.15,
    price: 0,
    reward: 300,
    armorPen: 0.6,
    damage: 30,
    rpm: 400,
    mag: 12,
    reserve: 48,
    reloadTime: 2.2,
    range: 200,
    rangeMod: 0.97,
    multipliers: { head: 4, chest: 1, legs: 0.75 },
    spread: { stand: 0.004, crouch: 0.003, move: 0.035, air: 0.1, perShot: 0.012, maxBloom: 0.04, bloomRecover: 0.08 },
    recoil: { pattern: voxPattern(), viewFraction: 0.5, recoverDelay: 0.08, recoverRate: 12 },
  },
  razor: {
    short: 'RAZOR',
    name: 'RAZOR SMG',
    slot: 'primary',
    model: 'smg',
    auto: true,
    speed: 1,
    adsZoom: 1.25,
    price: 1250,
    reward: 600,
    armorPen: 0.65,
    damage: 26,
    rpm: 857,
    mag: 25,
    reserve: 100,
    reloadTime: 2.1,
    range: 150,
    rangeMod: 0.87,
    multipliers: { head: 4, chest: 1, legs: 0.75 },
    spread: { stand: 0.004, crouch: 0.003, move: 0.022, air: 0.1, perShot: 0.0035, maxBloom: 0.03, bloomRecover: 0.07 },
    recoil: { pattern: climbPattern(25, 0.42, 0.22), viewFraction: 0.45, recoverDelay: 0.1, recoverRate: 26 },
  },
  breaker: {
    short: 'BREAKER',
    name: 'BREAKER-12',
    slot: 'primary',
    model: 'shotgun',
    auto: false,
    speed: 0.92,
    adsZoom: 1.1,
    price: 1050,
    reward: 900,
    armorPen: 0.75,
    damage: 22,          // per pellet
    pellets: 9,
    pelletSpread: 0.055,
    rpm: 70,
    mag: 7,
    reserve: 28,
    reloadTime: 2.8,
    range: 60,
    rangeMod: 0.55,
    multipliers: { head: 2, chest: 1, legs: 0.75 },
    spread: { stand: 0.002, crouch: 0.002, move: 0.02, air: 0.06, perShot: 0.01, maxBloom: 0.02, bloomRecover: 0.05 },
    recoil: { pattern: climbPattern(7, 3.2, 0.3), viewFraction: 0.6, recoverDelay: 0.2, recoverRate: 3 },
  },
  mantis: {
    short: 'MANTIS',
    name: 'MANTIS DMR',
    slot: 'primary',
    model: 'marksman',
    auto: false,
    scope: true,
    speed: 0.85,
    adsZoom: 4,
    adsSpread: 0.005,    // scoped and still: pin-point; unscoped: a wide cone
    price: 4750,
    reward: 100,
    armorPen: 0.97,
    damage: 110,
    rpm: 41,
    mag: 5,
    reserve: 25,
    reloadTime: 3.4,
    range: 300,
    rangeMod: 0.99,
    multipliers: { head: 4, chest: 1.25, legs: 0.75 },
    spread: { stand: 0.07, crouch: 0.06, move: 0.2, air: 0.3, perShot: 0, maxBloom: 0, bloomRecover: 1 },
    recoil: { pattern: climbPattern(5, 4, 0), viewFraction: 0.6, recoverDelay: 0.3, recoverRate: 2 },
  },
  knife: {
    short: 'MONOWIRE',
    name: 'MONOWIRE',
    slot: 'melee',
    model: 'knife',
    melee: true,
    auto: true,
    speed: 1.08,
    price: 0,
    reward: 1500,
    light: { damage: 35, time: 0.45 },
    heavy: { damage: 65, time: 1.0 },
    backstab: 2.6,       // multiplier from behind: light 91, heavy one-shots
    reach: 1.9,
    range: 1.9,
    spread: STILL,
    recoil: NO_RECOIL,
  },
  lancer: {
    short: 'K-77',
    name: 'K-77 LANCER',
    slot: 'primary',
    model: 'rifle',
    auto: true,
    speed: 0.92,
    adsZoom: 1.4,
    price: 2700,
    reward: 300,
    armorPen: 0.775,
    damage: 36,
    rpm: 600,
    mag: 30,
    reserve: 90,
    reloadTime: 2.4,
    range: 250,
    rangeMod: 0.985, // damage multiplier per 10 m
    multipliers: { head: 4, chest: 1, legs: 0.75 },
    spread: {
      stand: 0.0018,
      crouch: 0.0012,
      move: 0.06,
      air: 0.15,
      perShot: 0.0028,
      maxBloom: 0.03,
      bloomRecover: 0.05,
    },
    recoil: {
      pattern: lancerPattern(),
      viewFraction: 0.45, // how much of the punch the camera shows; bullets get all of it
      recoverDelay: 0.12,
      recoverRate: 22,    // pattern steps recovered per second
    },
  },
};

// Throwables. Damage from fire bypasses armour; EMP and fire only affect the thrower's enemies.
export const UTIL = {
  emp: { name: 'EMP GRENADE', color: 0x38e8ff, max: 2, fuse: 1.6, radius: 22 },
  smoke: { name: 'SMOKE DRONE', color: 0x9a8cc8, max: 1, fuse: 3, radius: 4.6, duration: 15 },
  fire: { name: 'INCENDIARY', color: 0xff7a3d, max: 1, fuse: 2.5, radius: 3.6, duration: 7, tick: 0.25, damage: 8.5 },
  decoy: { name: 'HOLO-DECOY', color: 0xff3fb4, max: 1, fuse: 3, duration: 9 },
};
export const UTIL_MAX = 4;   // total throwables carried
export const THROW = { far: 17, near: 8, gravity: 14 };

// held throwables reuse the Weapon class with these defs
for (const [kind, u] of Object.entries(UTIL)) {
  WEAPONS['util_' + kind] = {
    name: u.name, slot: 'utility', model: 'grenade', throwable: true, kind, color: u.color,
    auto: false, speed: 1, range: 0, spread: STILL, recoil: NO_RECOIL,
  };
}

export const TARGET = { hp: 100, armor: 0.78, respawn: 1.8 };

// Bot difficulty. Angles in radians, times in seconds.
//   reaction: delay from first sight to first shot      aimSpeed: flick rate (higher = faster)
//   aimError: initial miss offset at 30 m, settles over `settle`   track: extra error per m/s of target speed
//   headBias: chance to aim for the head   fireTol: how settled the aim must be before firing
//   spray: fraction of recoil compensated   strafe: ADAD between bursts   seek: hunt last known position
//   coverHp: retreat out of sight below this HP (0 = never)   pause: base gap between bursts
//   sniper: chance to buy the Mantis when rich   utility: chance to throw utility when a trigger comes up
export const BOT_SKILL = {
  easy: { reaction: 0.75, aimSpeed: 4, aimError: 0.1, settle: 1.0, track: 0.008, headBias: 0.05, fireTol: 0.1, fov: 100, spray: 0.2, strafe: false, seek: false, coverHp: 0, pause: 0.7, sniper: 0, utility: 0.3 },
  normal: { reaction: 0.4, aimSpeed: 7, aimError: 0.05, settle: 0.6, track: 0.005, headBias: 0.25, fireTol: 0.05, fov: 120, spray: 0.55, strafe: true, seek: true, coverHp: 45, pause: 0.3, sniper: 0.15, utility: 0.6 },
  hard: { reaction: 0.27, aimSpeed: 11, aimError: 0.03, settle: 0.4, track: 0.003, headBias: 0.4, fireTol: 0.035, fov: 140, spray: 0.8, strafe: true, seek: true, coverHp: 50, pause: 0.22, sniper: 0.3, utility: 0.85 },
};

export const BOT = { maxCount: 5, hearShot: 45, hearStep: 14, sight: 90 };

// ---------- match rules ----------
export const ROUND = {
  buy: 12,          // freeze + buy at round start
  buyWindow: 20,    // buying stays open this long into the live round, inside spawn
  live: 105,        // round clock
  post: 5,          // pause after a round ends
  halftimePost: 7,
  fuse: 40,         // spike timer after plant
  plantTime: 3.2,
  purgeTime: 7,
  useRange: 1.6,    // purge distance from the spike
  blastRadius: 14,
};

export const MATCH_LENGTH = {
  short: { win: 5, half: 4 },
  full: { win: 13, half: 12 },
};

export const ECON = {
  start: 800, max: 16000,
  win: { elim: 3250, spike: 3500, purge: 3500, time: 3250 },
  lossBase: 1400, lossStep: 500, lossMax: 3400,
  plant: 300,       // planter's bonus
  plantLoss: 800,   // attackers' bonus when they lose after planting
};

// B menu: key → item. type: weapon (id = WEAPONS key) | armor | util (id = UTIL key)
export const SHOP = [
  { key: '1', type: 'weapon', id: 'razor', label: 'Razor SMG', price: 1250 },
  { key: '2', type: 'weapon', id: 'breaker', label: 'Breaker-12 shotgun', price: 1050 },
  { key: '3', type: 'weapon', id: 'lancer', label: 'K-77 Lancer rifle', price: 2700 },
  { key: '4', type: 'weapon', id: 'mantis', label: 'Mantis DMR (scoped)', price: 4750 },
  { key: '5', type: 'armor', id: 'vest', label: 'Armour vest', price: 650 },
  { key: '6', type: 'armor', id: 'vesthelm', label: 'Vest + helmet', price: 1000 },
  { key: '7', type: 'util', id: 'emp', label: 'EMP grenade', price: 300 },
  { key: '8', type: 'util', id: 'smoke', label: 'Smoke drone', price: 300 },
  { key: '9', type: 'util', id: 'fire', label: 'Incendiary', price: 500 },
  { key: '0', type: 'util', id: 'decoy', label: 'Holo-decoy', price: 200 },
];
