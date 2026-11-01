import * as THREE from 'three';
import { TICK, MOVE, WEAPONS, TARGET, BOT, SHOP, ROUND } from './config.js';
import { createRenderer, Rain } from './render.js';
import { MAPS, DEFAULT_MAP } from './maps/index.js';
import { spawnTargets } from './targets.js';
import { Player } from './player.js';
import { Human } from './human.js';
import { Weapon } from './weapon.js';
import { Fx, Casings } from './fx.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';
import { NavGrid } from './navgrid.js';
import { Match } from './match.js';
import { AimTrainer } from './aimtrainer.js';
import { initMenu, XH_DEFAULT, bestText } from './menu.js';
import { HostSession, ClientSession, ClientMatch, cleanName } from './netgame.js';
import { initLobby } from './lobby.js';
import { Directory } from './directory.js';

const DEG = Math.PI / 180;
const FROZEN = { keys: new Set(), consume: () => false };
const UP = new THREE.Vector3(0, 1, 0);
const FX_NET = new Set(['tracer', 'decal', 'spark', 'debris']), SFX_NET = new Set(['shot', 'tone', 'burst', 'step', 'land', 'ricochet', 'explosion']);

// --- settings (per-browser)
const SETTINGS_KEY = 'neon-static.settings';
const settings = {
  sens: 1.5, adsSens: 1, fov: 74, ads: 'hold',
  vol: 0.6, volAmb: 0.5, volUi: 0.6,
  scale: 1, bloom: 'on', rain: 'high', showFps: true, showStats: true, showSpeed: true,
  teamSize: '5', diff: 'normal', length: 'short',
};
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { /* storage blocked */ }
settings.xh = { ...XH_DEFAULT, ...(settings.xcol ? { color: settings.xcol } : {}), ...settings.xh }; // older saves kept only a colour
delete settings.xcol;
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ } };

// --- world
const canvas = document.getElementById('game');
const gfx = createRenderer(canvas);
const params = new URLSearchParams(location.search);
const mapId = MAPS[params.get('map')] ? params.get('map') : DEFAULT_MAP;
const world = MAPS[mapId].build(gfx.scene);
gfx.scene.updateMatrixWorld(true); // static geometry: raycasts must not wait for the first render
const isMatch = !!world.spawns;    // maps with spawns run a 5v5 match; others are practice ranges
const isAim = !!world.aimlab;      // the aim lab runs drills
const roomParam = (params.get('room') ?? '').toUpperCase();
const room = isMatch && /^[A-Z0-9]{4,8}$/.test(roomParam) ? roomParam : null; // ?room=CODE: an online match
let net = null; // the HostSession or ClientSession
const dedicated = !!room && params.has('dedicated'); // a server page: runs the match, nobody plays on it, nothing is drawn
let match = null; // assigned below; los() reads it for smoke

const player = new Player(world);
const human = new Human(player, gfx.vmScene);
const input = new Input();
const sfx = new Sfx();
const hud = new Hud();
const fx = new Fx(gfx.scene);
const rain = new Rain(gfx.scene);
const flashLight = new THREE.PointLight(0xffc27a, 0, 9, 1.5);
gfx.scene.add(flashLight);
const casings = new Casings(gfx.vmScene);
const stats = { shots: 0, hits: 0, heads: 0, kills: 0, deaths: 0 };
let simTime = 0, empUntil = 0, shake = 0;

// --- helpers shared with the match
const losRay = new THREE.Raycaster();
const losDir = new THREE.Vector3();
function los(a, b) {
  losDir.subVectors(b, a);
  const d = losDir.length();
  losRay.set(a, losDir.divideScalar(d));
  losRay.far = d;
  if (match?.util.blocksLos(a, b)) return false; // smoke hides you from bots
  return losRay.intersectObjects(world.meshes, false).length === 0;
}

// `from` marks whose sound it is, so that player doesn't hear their own gun twice online
function spatial(pos, range, from) {
  const c = gfx.camera.position, dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz);
  const gain = Math.max(0, 1 - d / range) ** 1.5;
  const yaw = gfx.camera.rotation.y;
  const pan = d > 0.1 ? THREE.MathUtils.clamp((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d, -1, 1) * 0.8 : 0;
  return room ? { gain, pan, range, from, pos: { x: pos.x, y: pos.y, z: pos.z } } : { gain, pan };
}

function humanMuzzle(h = human) { // tracer start: at the gun, not the eye
  const b = h.body, y = b.yaw;
  return new THREE.Vector3(
    b.pos.x + Math.cos(y) * 0.16 - Math.sin(y) * 0.6,
    b.pos.y + b.eye - 0.12,
    b.pos.z - Math.sin(y) * 0.16 - Math.cos(y) * 0.6,
  );
}

function angleTo(pos) { // screen angle to a world point: 0 = ahead, clockwise positive
  const dx = pos.x - player.pos.x, dz = pos.z - player.pos.z;
  const ahead = -dx * Math.sin(player.yaw) - dz * Math.cos(player.yaw);
  const side = dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw);
  return Math.atan2(side, ahead);
}

const tmp = new THREE.Vector3();
function hitFeedback(dmg, head, killed, point, distance, name) {
  stats.hits++;
  if (head) stats.heads++;
  tmp.copy(point).project(gfx.camera);
  hud.damage((tmp.x + 1) / 2 * innerWidth, (1 - tmp.y) / 2 * innerHeight - 20, dmg, head);
  if (killed) {
    stats.kills++;
    sfx.kill();
    if (head) sfx.head();
    hud.hitmarker('kill');
    if (!isMatch) hud.feed(`YOU ▸ ${name}  ${Math.round(distance)} m${head ? '  ◆ HEADSHOT' : ''}`, 'good');
  } else if (head) { (helmetHit ? sfx.helmet() : sfx.head()); hud.hitmarker('head'); }
  else { sfx.hit(); hud.hitmarker('hit'); }
}
let helmetHit = false; // set by the match hit hook just before hitFeedback

// shake: intensity falls off over 25 m from the source
function shakeFrom(pos, intensity) {
  shake = Math.max(shake, intensity * Math.max(0, 1 - player.pos.distanceTo(pos) / 25));
}

// What one player is told about the match. Online, the host sends these calls to each client,
// where they run on this same object; the method names are listed in netgame.js.
const feedback = {
  banner: (t, sub, sec) => hud.banner(t, sub, sec),
  feed: (entry, cls) => hud.feed(entry, cls),
  hit(dmg, head, killed, point, helmet, dot) {
    if (dot) { // burning: no hit markers unless it finishes them
      if (killed) { stats.kills++; hud.hitmarker('kill'); }
    } else {
      helmetHit = helmet;
      hitFeedback(dmg, head, killed, point, 0, '');
    }
    hud.stats(stats);
  },
  hurt(from, jolt) {
    sfx.hurt();
    hud.hurt(angleTo(from));
    if (jolt) shake = Math.max(shake, 0.25);
  },
  emp(dur) { empUntil = Math.max(empUntil, simTime + dur); sfx.tone(3200, dur * 0.6, 'sine', 0.12, 0, 3000); },
  whiz(near) { sfx.whiz(Math.sin(angleTo(near))); },
  shake: shakeFrom,
  death(text, report) {
    stats.deaths++;
    hud.stats(stats);
    deathAt = performance.now();
    hud.death(text, report);
  },
  roundEnd(won) {
    const notes = won ? [523, 659, 784] : [392, 330, 262];
    notes.forEach((f, i) => sfx.tone(f, 0.22, 'triangle', 0.18, i * 0.14));
  },
  spawn(x, z, yaw) {
    player.spawnAt(tmp.set(x, 0, z), yaw);
    if (match?.isClient) { match.history = []; human.alive = true; }
  },
  buyMsg(m) {
    buyMsg = m;
    m.startsWith('Bought') ? sfx.uiOk() : sfx.uiNo();
  },
};

function makeMatch(extra = {}) {
  return new Match({
    scene: gfx.scene, world, nav: new NavGrid(world), human, sfx, fx, spatial, los, humanMuzzle, settings,
    hooks: { to: c => (c === human ? feedback : c.fb), util: extra.util },
    ...extra,
  });
}

// --- mode setup
let targets = [], practiceHittables = [], trainer = null;
if (isMatch) {
  if (!room) match = makeMatch();
} else if (isAim) {
  human.give(WEAPONS.lancer, 0);
  trainer = new AimTrainer(gfx.scene, params.get('drill'), {
    banner: (t, s, sec) => hud.banner(t, s, sec),
    done(r, record, prev) {
      hud.banner(record ? 'NEW BEST' : 'DRILL COMPLETE',
        `${bestText(trainer.id, r).replace('Best: ', '')}${prev && !record ? ` · best ${prev.score}` : ''} · Enter to go again`, 0);
      record ? sfx.uiOk() : sfx.uiClick();
    },
  });
} else {
  targets = spawnTargets(gfx.scene, world.targets);
  practiceHittables = [...world.meshes, ...targets.flatMap(t => t.parts)];
  human.give(WEAPONS.lancer, 0);
}
window.neonStatic = { player, human, world, get match() { return match; }, get net() { return net; }, targets, trainer, stats, input, tick: () => tick() }; // debugging handle

const playerSfx = {
  step() { sfx.step(); footfall('step'); },
  land() { sfx.land(); footfall('land'); },
};

function footfall(kind) { // bots hear it; online, other players do too
  match?.noise(player.pos, human.team, BOT.hearStep);
  if (net?.match && !match.isClient) match.sfx[kind](spatial(player.pos, 22, 'host'));
}

// --- settings UI
function bindSetting(id, key, fmt, apply) {
  const el = document.getElementById(id), out = document.getElementById(id + 'Out');
  const check = el.type === 'checkbox';
  if (check) el.checked = !!settings[key]; else el.value = settings[key];
  const update = (save = true) => {
    settings[key] = check ? el.checked : el.type === 'range' ? parseFloat(el.value) : el.value;
    if (out) out.textContent = fmt(settings[key]);
    apply(settings[key]);
    if (save) saveSettings();
  };
  el.addEventListener(check ? 'change' : 'input', () => update());
  update(false);
}
const pct = v => `${Math.round(v * 100)}%`;
const quality = () => gfx.setQuality(settings.scale, settings.bloom === 'on');
bindSetting('sens', 'sens', v => v.toFixed(2), () => {});
bindSetting('adsSens', 'adsSens', v => `×${v.toFixed(2)}`, () => {});
bindSetting('fov', 'fov', v => `${v}°`, () => {}); // applied per frame, with ADS zoom on top
bindSetting('ads', 'ads', v => v, () => { adsToggled = false; });
bindSetting('scale', 'scale', pct, quality);
bindSetting('bloom', 'bloom', v => v, quality);
bindSetting('rain', 'rain', v => v, v => rain.setDensity(isAim ? 0 : { high: 1, low: 0.35, off: 0 }[v])); // the aim lab is indoors
bindSetting('showFps', 'showFps', v => v, v => document.body.classList.toggle('no-fps', !v));
bindSetting('showStats', 'showStats', v => v, v => document.body.classList.toggle('no-stats', !v));
bindSetting('showSpeed', 'showSpeed', v => v, v => document.body.classList.toggle('no-speed', !v));
bindSetting('vol', 'vol', pct, v => sfx.setLevel('master', v));
bindSetting('volAmb', 'volAmb', pct, v => sfx.setLevel('ambient', v));
bindSetting('volUi', 'volUi', pct, v => sfx.setLevel('ui', v));
initMenu({ settings, save: saveSettings, sfx, onCrosshair: xh => hud.crosshairStyle(xh), startTab: isAim ? 'aim' : room ? 'online' : undefined });
try { settings.lastTab = localStorage.getItem('neon-static.tab'); } catch { /* storage blocked */ }
for (const id of ['teamSize', 'diff', 'length']) { // match settings restart the match
  const el = document.getElementById(id);
  el.value = settings[id];
  el.addEventListener('change', () => { settings[id] = el.value; saveSettings(); location.reload(); });
}
document.getElementById('resetStats').addEventListener('click', resetStats);

// --- online: lobby, then the host builds the match and each client mirrors it
const lobby = initLobby({
  settings, save: saveSettings, room, create: params.has('create') || dedicated, mapId, isMatch, sfx,
  onEnter(name, isHost) {
    human.name = cleanName(name);
    const ui = {
      lobby: (players, you, ready, auto) => lobby.show(players, you, ready, isHost, auto),
      error(text) {
        lobby.error(text);
        if (dedicated) setTimeout(() => location.reload(), 5000); // e.g. our old room id hasn't been released yet
      },
      hostLeft: () => { hud.banner('HOST LEFT', 'The match has ended. Reload to rejoin.', 0); lobby.error('The host left. Reload this page to rejoin if they start again.'); },
      start: isHost ? null : msg => startClient(msg),
    };
    net = isHost ? new HostSession(room, dedicated ? 'Server' : name, ui, dedicated) : new ClientSession(room, name, ui);
    if (isHost) human.peer = 'host';
    if (isHost && (dedicated || params.has('public'))) { // list this match publicly until it's over
      const dir = new Directory(() => {});
      const tell = () => dir.announce(net.listing(mapId));
      tell();
      setInterval(tell, 2000);
    }
    if (dedicated) runServer();
  },
  onStart: () => startHost(),
  onSwitch() {
    const team = 1 - lobby.team;
    if (net instanceof HostSession) net.setTeam(net.me, team);
    else net?.setTeam(team);
  },
});

// A dedicated page starts 30 s after the first player joins (at once when full), and reopens after each match.
function runServer() {
  let startAt = null, overAt = null;
  setInterval(() => {
    if (!match) {
      const n = net.players.length;
      startAt = n ? startAt ?? performance.now() + 30000 : null;
      net.auto = startAt ? Math.max(0, Math.ceil((startAt - performance.now()) / 1000)) : null;
      net.pushLobby();
      if (n && (n >= 10 || net.auto === 0)) startHost();
      return;
    }
    if (match.phase === 'over') overAt ??= performance.now();
    if (!net.players.length || (overAt && performance.now() - overAt > 15000)) location.reload();
  }, 1000);
}

function startHost() {
  if (net.started) return;
  human.name = net.me.name;
  human.team = net.me.team;
  const remotes = net.remotes(gfx.scene, world);
  if (dedicated) human.alive = false;
  match = makeMatch({
    humans: dedicated ? remotes : [human, ...remotes], online: true,
    fx: net.proxy(fx, FX_NET, 'fx'), sfx: net.proxy(sfx, SFX_NET, 'sfx'),
    util: (...a) => net.sendUtil(...a),
  });
  net.begin(match);
  afterOnlineStart();
  if (!dedicated) capturePointer(); // this click is the gesture pointer lock needs
}

function startClient(msg) {
  match = new ClientMatch({ scene: gfx.scene, world, human, player, session: net, msg });
  Object.assign(net, { match, feedback, fx, sfx, spatial });
  afterOnlineStart();
}

function afterOnlineStart() {
  document.getElementById('deploy').hidden = false;
  lobby.started();
  // a covered or hidden tab stops animation frames, but the match must not stop with it (a host's alt-tab would freeze everyone)
  const beat = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 16)'], { type: 'text/javascript' })));
  beat.onmessage = advance;
}

const mapSelect = document.getElementById('map');
for (const [id, m] of Object.entries(MAPS)) mapSelect.add(new Option(m.name, id, false, id === mapId));
mapSelect.addEventListener('change', () => { location.search = `?map=${mapSelect.value}`; });
document.getElementById('eyebrow').textContent = `${MAPS[mapId].name} · ${isMatch ? 'Match' : isAim ? 'Aim trainer' : 'Practice'} · Build 0.8`;
document.body.classList.toggle('practice', !isMatch);
document.body.classList.toggle('aimlab', isAim);
if (room) document.getElementById('modeLede').textContent = `Online match on ${MAPS[mapId].name}, room ${room}. Set a username in the Online tab.`;
else if (isAim) document.getElementById('modeLede').textContent = `${trainer.drill.name}: ${trainer.drill.desc} Press Deploy to start.`;
else if (!isMatch) document.getElementById('modeLede').textContent = 'Test Range 07: static targets at 10–45 m, a strafe yard with peekers, and jump boxes. No match, no bots.';
hud.initMinimap(world);
document.getElementById('deploy').hidden = !!room; // online: only once the match starts

function resetStats() {
  Object.assign(stats, { shots: 0, hits: 0, heads: 0, kills: 0, deaths: 0 });
  hud.stats(stats);
}
hud.stats(stats);

// --- pointer lock / pause
const overlay = document.getElementById('overlay');
const deploy = document.getElementById('deploy');
const note = document.getElementById('note');
let state = 'menu', acc = 0;

deploy.addEventListener('click', capturePointer);
function capturePointer() {
  sfx.init();
  note.hidden = true;
  const p = canvas.requestPointerLock({ unadjustedMovement: true });
  if (p?.catch) p.catch(() => canvas.requestPointerLock()?.catch?.(() => showNote()));
}
function showNote() {
  note.textContent = 'The browser refused mouse capture. Wait a second, then click Resume again.';
  note.hidden = false;
}
document.addEventListener('pointerlockerror', showNote);
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  input.enabled = locked;
  if (locked) {
    state = 'playing';
    overlay.hidden = true;
    acc = 0;
    if (trainer?.state === 'idle') trainer.start(simTime);
  } else {
    state = 'paused';
    overlay.hidden = false;
    input.reset();
    deploy.textContent = 'RESUME';
  }
});

document.addEventListener('mousemove', e => {
  if (!input.enabled || !human.alive) return;
  // Source-engine yaw scale; zoomed views slow down by the zoom ratio so aim feels the same
  const zoomScale = Math.tan(gfx.camera.fov * DEG / 2) / Math.tan(settings.fov * DEG / 2);
  const adsMul = human.weapon.adsT > 0.5 ? settings.adsSens : 1;
  const k = settings.sens * 0.022 * DEG * zoomScale * adsMul;
  player.yaw -= e.movementX * k;
  player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * k, -89 * DEG, 89 * DEG);
  input.lookDX += e.movementX;
  input.lookDY += e.movementY;
});

// --- practice range shots (mannequins only)
const ray = new THREE.Raycaster(), euler = new THREE.Euler(0, 0, 0, 'YXZ');
const dir = new THREE.Vector3(), origin = new THREE.Vector3(), normal = new THREE.Vector3();
function practiceShot(shot) {
  for (const [i, r] of (shot.pellets ?? [shot]).entries()) practiceRay(r, i < 3, shot);
}
function practiceRay(r, tracer, shot) {
  const def = human.weapon.def;
  origin.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
  euler.set(r.pitch, r.yaw, 0);
  dir.set(0, 0, -1).applyEuler(euler);
  ray.set(origin, dir);
  ray.far = def.melee ? def.reach : def.range;
  let hit = null;
  for (const h of ray.intersectObjects(practiceHittables, false)) {
    if (h.object.userData.dummy && !h.object.userData.dummy.alive) continue;
    hit = h;
    break;
  }
  if (tracer && !def.melee) fx.tracer(humanMuzzle(), hit ? hit.point : tmp.copy(origin).addScaledVector(dir, 80));
  if (!hit) return;
  const dm = hit.object.userData.dummy;
  if (!dm) {
    if (def.melee) return;
    normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    fx.decal(hit.point, normal);
    fx.spark(hit.point, 0xffd08a, 0.18);
    return;
  }
  const part = hit.object.userData.part, head = part === 'head';
  let dmg;
  if (def.melee) dmg = shot.heavy ? def.heavy.damage : def.light.damage;
  else {
    dmg = def.damage * def.multipliers[part] * Math.pow(def.rangeMod, hit.distance / 10);
    if (part !== 'legs') dmg *= TARGET.armor;
  }
  dmg = Math.round(dmg);
  const killed = dm.damage(dmg);
  fx.spark(hit.point, head ? 0x38e8ff : 0xff3fb4, head ? 0.45 : 0.3);
  hitFeedback(dmg, head, killed, hit.point, hit.distance, dm.name);
}

// --- aim down sights: off / hold RMB / toggle RMB
var adsToggled = false; // var: the settings binding above can reset it before this line runs
function updateAds() {
  const w = human.weapon, aimable = !w.def.melee && !w.def.throwable; // RMB is heavy stab / lob there
  if (aimable && settings.ads === 'toggle' && input.consume('Mouse2')) adsToggled = !adsToggled;
  const rechambering = w.def.scope && simTime < w.nextFire; // bolt cycling after a Mantis shot
  const blocked = !aimable || settings.ads === 'off' || !human.alive || buyOpen || w.reloading || w.drawing(simTime) || rechambering || match?.frozen;
  if (blocked) adsToggled = false;
  const want = !blocked && (settings.ads === 'hold' ? input.keys.has('Mouse2') : adsToggled);
  w.adsT = THREE.MathUtils.clamp(w.adsT + (want ? 1 : -1) * TICK / MOVE.adsTime, 0, 1);
  player.speedScale = (w.def.speed ?? 1) * (w.adsT > 0.5 ? MOVE.adsSpeed : 1);
}

// --- spectator: first-person view through a teammate, with their gun as a viewmodel
const specGuns = {}; // one display-only viewmodel per weapon, built on first use
const STILL_INPUT = { lookDX: 0, lookDY: 0 };
let specLastShot = -1, deathAt = 0;
function animateSpecGun(spec, dt) {
  if (spec) specGuns[spec.weapon.def.name] ??= new Weapon(spec.weapon.def, gfx.vmScene);
  for (const g of Object.values(specGuns)) {
    g.vm.visible = !!spec && spec.weapon.def === g.def;
    if (!g.vm.visible) continue;
    const bw = spec.weapon;
    g.reloading = bw.reloading;
    g.reloadStart = bw.reloadStart;
    if (bw.lastShot !== specLastShot) { specLastShot = bw.lastShot; g.kick = Math.min(g.kick + 1, 2.2); g.flashT = 0.05; }
    g.animate(dt, simTime, spec.body, STILL_INPUT);
  }
}

// --- buy menu, weapon slots, pickups
let buyOpen = false, buyMsg = '', specIdx = 0;
const SLOT_KEYS = { Digit1: 'primary', Digit2: 'secondary', Digit3: 'melee', Digit4: 'utility' };
function handleKeys() {
  if (input.consume('KeyB') && match) buyOpen = !buyOpen && match.canBuy(human);
  if (buyOpen && !match.canBuy(human)) buyOpen = false;
  if (buyOpen) {
    for (const item of SHOP) {
      if (!input.consume('Digit' + item.key)) continue;
      const m = match.buy(human, item.id);
      if (m != null) feedback.buyMsg(m);
    }
  } else {
    for (const [code, slot] of Object.entries(SLOT_KEYS)) {
      if (!input.consume(code)) continue;
      const before = human.weapon;
      human.select(slot, simTime);
      if (human.weapon !== before) sfx.equip();
      match?.noteSelect?.(slot);
    }
  }
  if (match && human.alive) {
    if (input.consume('KeyF')) match.tryPickup(human, true);
    else if (!human.primary) match.tryPickup(human, false); // walk over a gun with no primary: take it
    if (input.consume('KeyG') && human.primary) { // toss the primary for a teammate
      const fwd = tmp.set(-Math.sin(player.yaw) * 1.4, 0, -Math.cos(player.yaw) * 1.4).add(player.pos);
      match.dropWeapon(human, fwd);
    }
  }
}

// teammates first; once the whole squad is down, anyone still alive
function spectateTarget() {
  if (!match || human.alive) return null;
  const pool = match.spectatePool();
  return pool.length ? pool[specIdx % pool.length] : null;
}

// bodies don't overlap: push players out of anyone alive (the host decides this for clients too)
function separate() {
  if (!match || match.isClient) return;
  for (const h of match.humans) {
    if (!h.alive) continue;
    const p = h.body;
    for (const b of match.combatants) {
      if (b === h || !b.alive) continue;
      const bp = b.pos, dx = p.pos.x - bp.x, dz = p.pos.z - bp.z, d = Math.hypot(dx, dz);
      if (d >= 0.7 || d < 1e-4 || Math.abs(p.pos.y - bp.y) > 1.5) continue;
      const push = 0.7 - d, nx = p.pos.x + (dx / d) * push, nz = p.pos.z + (dz / d) * push;
      if (!p.overlaps(nx, p.pos.y, nz, p.height)) { p.pos.x = nx; p.pos.z = nz; }
    }
  }
}

// --- loop: fixed 64 Hz simulation, interpolated rendering
let last = performance.now(), lastSim = last, fpsT = 0, fpsN = 0, lastRound = 0;

function tick() {
  simTime += TICK;
  if (input.consume('Backspace')) resetStats();
  handleKeys();
  updateAds();
  if (match?.isClient) match.capture(input, human.weapon.adsT);
  if (human.alive) {
    const frozen = match?.frozen;
    player.tick(TICK, simTime, frozen || isAim ? FROZEN : input, playerSfx); // the aim lab is shot from a fixed spot
    if (!frozen && !buyOpen) {
      const shot = human.weapon.tick(TICK, simTime, input, player, sfx);
      if (shot?.throw || shot?.melee) {
        if (match) match.humanShot(human, shot);
        else if (shot.melee) practiceShot(shot);
      } else if (shot) {
        stats.shots++;
        ejectCasing(human.weapon);
        if (match) match.humanShot(human, shot);
        else if (trainer) trainerShot(shot);
        else practiceShot(shot);
        hud.stats(stats);
      }
    } else input.consume('Mouse0');
    human.using = match && !frozen && input.keys.has('KeyE') ? (human.side === 'attack' ? 'plant' : 'purge') : null;
  } else {
    player.prevPos.copy(player.pos);
    player.prevEye = player.eye;
    player.eye += (0.35 - player.eye) * 0.08; // death cam sinks
    if (input.consume('Mouse0')) specIdx++;
  }
  match?.tick(TICK, simTime);
  if (match && match.round !== lastRound) { // new round: clear death screen, close shop
    lastRound = match.round;
    hud.death(null);
    buyOpen = false;
    buyMsg = '';
    adsToggled = false;
    human.weapon.adsT = 0;
    empUntil = 0;
  }
  separate();
  if (net?.match && !match.isClient) net.afterTick(simTime);
  if (match?.phase === 'over' && input.consume('Enter')) location.reload();
  if (trainer) {
    viewDir.set(0, 0, -1).applyEuler(euler.set(player.pitch, player.yaw, 0));
    trainer.tick(TICK, simTime, viewDir);
    if (trainer.state === 'done' && input.consume('Enter')) { hud.banner('', '', 0.01); trainer.start(simTime); }
  }
  input.endTick();
}

// --- aim lab shots: no ammo limit; hits get the normal hit feedback
const viewDir = new THREE.Vector3();
function trainerShot(shot) {
  const w = human.weapon;
  w.reserve = w.def.reserve;
  if (w.mag === 0) w.startReload(simTime, sfx);
  origin.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
  dir.set(0, 0, -1).applyEuler(euler.set(shot.pitch, shot.yaw, 0));
  const hit = trainer.shot(origin, dir);
  fx.tracer(humanMuzzle(), hit ?? tmp.copy(origin).addScaledVector(dir, 30));
  if (!hit) return;
  fx.spark(hit, 0xff3fb4, 0.4);
  fx.debris(hit, UP, 0xff3fb4, 6);
  stats.hits++;
  sfx.kill();
  hud.hitmarker('kill');
}

// brass flicks out of the ejection port; the shotgun and Mantis eject on the pump / bolt
function ejectCasing(w) {
  if (!w.vm || w.def.melee || w.def.throwable) return;
  const port = w.vm.position.clone().add(tmp.set(0.04, 0.04, -0.02));
  if (w.def.pellets || w.def.scope) setTimeout(() => casings.eject(w.vm.position.clone().add(tmp.set(0.04, 0.03, 0)), !!w.def.pellets), 350);
  else casings.eject(port);
}

// advance the simulation by real time; an online match keeps running behind the menu
const simulating = () => (room ? !!match : state === 'playing');
function advance() {
  const now = performance.now(), dt = Math.min(0.1, (now - lastSim) / 1000);
  lastSim = now;
  if (!simulating()) return;
  acc += dt;
  let n = 0;
  while (acc >= TICK && n++ < 10) { tick(); acc -= TICK; }
  if (acc > TICK) acc = 0;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  advance();
  if (dedicated) return; // a server draws nothing
  if (state === 'playing') for (const t of targets) t.update(dt);
  const running = simulating();
  const a = running ? acc / TICK : 1;
  const w = human.weapon;

  const cam = gfx.camera, spec = spectateTarget();
  if (match) for (const b of match.others) b.spectated = b === spec;
  let fov = settings.fov;
  if (spec) {
    cam.position.lerpVectors(spec.body.prevPos, spec.body.pos, a);
    cam.position.y += MOVE.standEye;
    const [yaw, pitch] = spec.viewAngles(a);
    cam.rotation.set(pitch, yaw, 0);
  } else {
    cam.position.lerpVectors(player.prevPos, player.pos, a);
    cam.position.y += player.prevEye + (player.eye - player.prevEye) * a - player.landDip;
    w.updateView(dt);
    cam.rotation.set(player.pitch + w.viewPunch.y, player.yaw + w.viewPunch.x, 0);
    if (human.alive) fov = settings.fov / (1 + ((w.def.adsZoom ?? 1) - 1) * w.ads);
  }
  player.landDip *= Math.exp(-dt * 9);
  if (shake > 0.002) { // explosions and hits jolt the view, decaying quickly
    cam.position.x += (Math.random() - 0.5) * shake * 0.08;
    cam.position.y += (Math.random() - 0.5) * shake * 0.08;
    cam.rotation.z += (Math.random() - 0.5) * shake * 0.03;
    shake *= Math.exp(-dt * 7);
  }
  if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }

  if (match) for (const b of match.others) b.render(a, running ? dt : 0);
  const scoped = !spec && human.alive && w.def.scope && w.adsT > 0.85;
  human.syncViewmodels(scoped); // the scope overlay replaces the gun
  w.animate(dt, simTime, player, input);
  animateSpecGun(spec, running ? dt : 0);
  if (!human.alive && deathAt && performance.now() - deathAt > 2500) { hud.death(null); deathAt = 0; }
  fx.update(dt);
  casings.update(dt);
  rain.update(dt, cam.position);
  flashLight.position.copy(cam.position);
  flashLight.intensity = human.alive && w.flashT > 0 ? 30 : 0;

  // HUD
  const focal = (innerHeight / 2) / Math.tan(cam.fov * DEG / 2);
  // while spectating, the HUD shows the spectated player's numbers
  const view = spec ?? human, vw = view.weapon, body = view.body;
  hud.crosshair(Math.max(3, Math.tan(vw.spread(body)) * focal));
  hud.crosshairHidden(!spec && w.adsT > 0.6); // the sight dot takes over
  hud.scope(scoped);
  hud.emp(spec ? 0 : Math.min(1, Math.max(0, empUntil - simTime))); // full white, fading over the last second
  hud.slots(spec ? null : human.slotView());
  const drop = match && human.alive && !spec ? match.nearestDrop(player.pos, 1.8) : null;
  hud.prompt(drop ? `F · ${human.primary ? 'swap for' : 'pick up'} ${drop.def.name}` : '');
  const frac = body.hSpeed / MOVE.runSpeed;
  const moveState = !body.onGround ? 'AIRBORNE' : frac <= MOVE.accurateFraction ? 'ACCURATE' : 'MOVING';
  hud.speed(body.hSpeed, frac, moveState, spec ? 0 : player.lastStopMs);
  if (vw.def.melee || vw.def.throwable) hud.ammo('—', vw.def.throwable ? `×${human.util[vw.def.kind]}` : '', false, vw.def.name);
  else hud.ammo(vw.mag, vw.reserve, vw.reloading, vw.def.name);
  hud.vitals(Math.max(0, view.hp), view.armor, view.helmet);
  hud.minimap(cam.position.x, cam.position.z, spec ? spec.aimYaw : player.yaw, match ? match.radarDots() : []);
  if (match) {
    const v = match.view();
    hud.round(v, human.credits);
    hud.use(human.using && human.useT > 0 ? human.useT / (human.using === 'plant' ? ROUND.plantTime : ROUND.purgeTime) : 0,
      human.using === 'plant' ? 'PLANTING SPIKE' : 'PURGING SPIKE');
    hud.buyMenu(buyOpen, human.credits, buyMsg);
    hud.spectate(spec ? spec.name : null);
    if (match.phase === 'over') hud.scoreboard(match.scoreboard(), match.mvp().name); // match summary stays up
    else hud.scoreboard(input.keys.has('Tab') ? match.scoreboard() : null);
  }
  if (trainer) hud.drill(trainer.view());
  fpsT += dt; fpsN++;
  if (fpsT >= 0.5) { hud.fps(Math.round(fpsN / fpsT)); fpsT = fpsN = 0; }

  gfx.composer.render();
  input.lookDX = input.lookDY = 0;
}
requestAnimationFrame(frame);
