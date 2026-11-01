import * as THREE from 'three';
import { WEAPONS, MOVE, TICK, BOT } from './config.js';
import { Human } from './human.js';
import { Player } from './player.js';
import { Avatar } from './bots.js';
import { Weapon } from './weapon.js';
import { Utilities } from './utility.js';
import { buildSpikeMesh, dropMesh, SQUAD_NAMES } from './match.js';

/*
  Peer-to-peer multiplayer. The host's browser runs the real Match; everyone else (a client) sends inputs
  and draws what the host reports. Two channels per client:
    rel   reliable: lobby, per-player feedback (hit, death, banner...), throwables, scoreboard
    fast  lossy, for data that a newer packet replaces: inputs, snapshots, sound and spark effects
  Clients predict their own movement and correct it from snapshots; others are drawn 100 ms in the past.
*/
const PREFIX = 'cyberspace-warriors-';
const MAX_PER_SQUAD = BOT.maxCount;
const INTERP = 0.1;                 // how far in the past clients draw other players (s)
const SNAPSHOT_TICKS = 3;           // about 21 per second
const KEYBITS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'ShiftLeft', 'KeyE', 'Mouse2'];
const FIRE_BIT = 1 << KEYBITS.length;
const WKEYS = Object.keys(WEAPONS);
const wIdx = def => WKEYS.findIndex(k => WEAPONS[k] === def);
const UTIL_ORDER = ['emp', 'smoke', 'fire', 'decoy'];
const FX_METHODS = new Set(['tracer', 'decal', 'spark', 'debris']);
const SFX_METHODS = new Set(['shot', 'tone', 'burst', 'step', 'land']);
const FEEDBACK = new Set(['banner', 'feed', 'hit', 'hurt', 'emp', 'whiz', 'shake', 'death', 'roundEnd', 'spawn', 'buyMsg']);
const SLOTS = new Set(['primary', 'secondary', 'melee', 'utility']);
const NO_SFX = { shot() {}, reload() {}, click() {}, step() {}, land() {}, swish() {} };
const FROZEN = { keys: new Set(), consume: () => false };
const r2 = v => Math.round(v * 100) / 100, r4 = v => Math.round(v * 10000) / 10000;

export function cleanName(raw) { return String(raw ?? '').replace(/[^\w \-]/g, '').trim().slice(0, 16) || 'Player'; }

export function makeRoomCode() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', out = crypto.getRandomValues(new Uint8Array(5));
  return [...out].map(b => abc[b % abc.length]).join('');
}

const open = c => c?.open;
const peerError = e => ({
  'unavailable-id': 'That room code is already in use. Reload to try again, or create a new match.',
  'peer-unavailable': 'No match found at this link. The host may have left.',
  network: 'Could not reach the connection service. Check your internet and reload.',
  'server-error': 'The connection service is not responding. Try again in a minute.',
  'browser-incompatible': 'This browser does not support peer-to-peer connections.',
}[e.type] ?? `Connection problem (${e.type}).`);

// ---------- the host's copy of a remote player ----------
class RemoteHuman extends Human {
  constructor(scene, world, link, name, team) {
    super(new Player(world), null);
    this.isRemote = true;
    this.link = link;
    this.peer = link.id;
    this.name = name;
    this.team = team;
    this.avatar = new Avatar(scene);
    this.avatar.isMate = false;
    this.input = { keys: new Set(), pressed: new Set(), mouseDown: false, consume(c) { return this.pressed.delete(c); } };
    this.queue = [];
    this.lastSeq = -1;
    this.edges = [0, 0, 0, 0];
    this.ads = 0;
    this.rewindTicks = 0;
    this.fb = new Proxy({}, { get: (_, m) => (...a) => link.sendRel({ k: 'fb', m, a }) });
  }

  // trust boundary: everything here comes from another player's browser
  pushInput(a) {
    if (!Array.isArray(a) || a.length !== 9 || !a.every(Number.isFinite)) return;
    if (a[0] <= this.lastSeq) return;
    this.queue.push(a);
    if (this.queue.length > 3) this.queue.shift(); // one input per tick, so a flood can't speed anyone up, and lag can't build
  }

  applyInput() {
    const a = this.queue.shift();
    if (!a) return; // nothing new: keep the last input (a lost packet)
    const [seq, mask, yaw, pitch, ads, j, f, alt, r] = a, inp = this.input;
    this.lastSeq = seq;
    inp.keys.clear();
    KEYBITS.forEach((k, i) => { if (mask & (1 << i)) inp.keys.add(k); });
    inp.mouseDown = !!(mask & FIRE_BIT);
    this.body.yaw = yaw;
    this.body.pitch = THREE.MathUtils.clamp(pitch, -1.56, 1.56);
    this.ads = THREE.MathUtils.clamp(ads, 0, 1);
    [['Space', j], ['Mouse0', f], ['Mouse2', alt], ['KeyR', r]].forEach(([code, n], i) => {
      if (n !== this.edges[i]) { inp.pressed.add(code); this.edges[i] = n; }
    });
  }

  netTick(match, dt, now) {
    this.applyInput();
    const body = this.body, inp = this.input;
    if (!this.alive) { body.prevPos.copy(body.pos); inp.pressed.clear(); return; }
    const frozen = match.frozen, w = this.weapon, aimable = !w.def.melee && !w.def.throwable;
    w.adsT = aimable && !w.reloading ? this.ads : 0;
    body.speedScale = (w.def.speed ?? 1) * (w.adsT > 0.5 ? MOVE.adsSpeed : 1);
    body.tick(dt, now, frozen ? FROZEN : inp, this.sounds(match));
    if (!frozen) {
      const shot = w.tick(dt, now, inp, body, NO_SFX);
      if (shot) match.humanShot(this, shot);
      if (!this.primary) match.tryPickup(this, false);
    }
    this.using = !frozen && inp.keys.has('KeyE') ? (this.side === 'attack' ? 'plant' : 'purge') : null;
    inp.pressed.clear();
  }

  sounds(match) {
    return this.stepSfx ??= {
      step: () => { match.sfx.step(match.spatial(this.pos, 22, this.peer)); match.noise(this.pos, this.team, BOT.hearStep); },
      land: () => { match.sfx.land(match.spatial(this.pos, 22, this.peer)); match.noise(this.pos, this.team, BOT.hearStep); },
    };
  }

  render(alpha, dt) {
    const a = this.avatar;
    a.spectated = this.spectated;
    a.group.position.lerpVectors(this.body.prevPos, this.body.pos, alpha);
    a.setGun(this.weapon.def);
    if (this.weapon.lastShot !== this.seenShot) { this.seenShot = this.weapon.lastShot; a.flashT = 0.05; }
    a.pose(this.body.yaw, this.body.hSpeed, this.alive, this.body.crouching, dt);
  }
}

// ---------- host ----------
export class HostSession {
  // ui: { lobby(players, meId), error(text) }
  constructor(code, name, ui) {
    this.code = code;
    this.ui = ui;
    this.id = 'host';
    this.me = { id: 'host', name: cleanName(name), team: 0, host: true };
    this.players = [this.me];
    this.links = new Map();
    this.started = false;
    this.tickN = 0;
    this.fastQueue = [];
    this.peer = new Peer(PREFIX + code);
    this.peer.on('open', () => this.pushLobby());
    this.peer.on('error', e => ui.error(peerError(e)));
    this.peer.on('disconnected', () => { if (!this.peer.destroyed) this.peer.reconnect(); });
    this.peer.on('connection', conn => this.onConnection(conn));
  }

  onConnection(conn) {
    const id = conn.peer;
    let link = this.links.get(id);
    if (!link) {
      link = { id, pending: [], ready: false };
      link.sendRel = m => { if (!link.ready) link.pending.push(m); else if (open(link.rel)) link.rel.send(m); };
      this.links.set(id, link);
    }
    link[conn.label] = conn;
    conn.on('data', d => this.onData(link, conn.label, d));
    conn.on('close', () => this.onClose(link));
  }

  uniqueName(raw) {
    const taken = new Set([...this.players.map(p => p.name), ...SQUAD_NAMES.flat(), 'YOU', 'SPIKE']);
    const base = cleanName(raw);
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base.slice(0, 13)}-${n}`;
    return name;
  }

  smallerSquad() {
    const n = t => this.players.filter(p => p.team === t).length;
    return n(1) < n(0) ? 1 : 0;
  }

  onData(link, label, d) {
    if (label === 'fast') {
      if (Array.isArray(d)) link.remote?.pushInput(d);
      else if (d?.k === 'pon' && Number.isFinite(d.t) && link.remote) { // round trip: rewind half of it plus the client's view delay
        link.rtt = performance.now() - d.t;
        link.remote.rewindTicks = Math.min(24, Math.round((link.rtt / 2000 + INTERP) / TICK));
      }
      return;
    }
    if (!d || typeof d !== 'object') return;
    if (d.k === 'hello') {
      if (link.player) return;
      if (this.started) return link.rel.send({ k: 'reject', why: 'This match has already started.' });
      if (this.players.length >= MAX_PER_SQUAD * 2) return link.rel.send({ k: 'reject', why: 'This match is full.' });
      link.player = { id: link.id, name: this.uniqueName(d.name), team: this.smallerSquad() };
      this.players.push(link.player);
      link.ready = true;
      this.pushLobby();
    } else if (d.k === 'team' && link.player && !this.started) this.setTeam(link.player, d.team);
    else if (d.k === 'a' && link.remote) this.onAction(link.remote, d);
  }

  onAction(r, d) {
    const m = this.match;
    if (!r.alive) return;
    if (d.a === 'buy' && typeof d.id === 'string') r.fb.buyMsg(m.buy(r, d.id) ?? '');
    else if (d.a === 'sel' && SLOTS.has(d.slot)) r.select(d.slot, m.now);
    else if (d.a === 'pick') m.tryPickup(r, true);
    else if (d.a === 'drop' && r.primary) m.dropWeapon(r, r.pos);
  }

  setTeam(p, team) {
    if ((team !== 0 && team !== 1) || p.team === team) return;
    if (this.players.filter(x => x.team === team).length >= MAX_PER_SQUAD) return;
    p.team = team;
    this.pushLobby();
  }

  pushLobby() {
    const players = this.players.map(({ name, team, host }) => ({ name, team, host: !!host }));
    this.ui.lobby(players, this.me.name, this.peer.open);
    for (const l of this.links.values()) if (l.player && open(l.rel)) l.rel.send({ k: 'lobby', players, you: l.player.name });
  }

  onClose(link) {
    if (link.gone) return;
    link.gone = true;
    this.links.delete(link.id);
    this.players = this.players.filter(p => p !== link.player);
    if (!this.started) return this.pushLobby();
    const r = link.remote;
    if (!r) return;
    // shortcut: a leaver just goes down and stays down, upgrade by handing their slot to a bot
    r.left = true;
    r.avatar.group.visible = false;
    if (r.alive) this.match.kill(null, r, false, null);
    for (const h of this.match.humans) if (!h.left) this.match.to(h).feed(`${r.name} left the match`, 'bad');
  }

  remotes(scene, world) {
    return [...this.links.values()].filter(l => l.player).map(l => {
      l.ready = false; // what the match says while it builds waits for the 'start' message
      return (l.remote = new RemoteHuman(scene, world, l, l.player.name, l.player.team));
    });
  }

  // effects and sounds go to everyone over the lossy channel, and still play here
  proxy(target, methods, kind) {
    return new Proxy(target, {
      get: (t, m) => (typeof t[m] !== 'function' ? t[m] : (...a) => {
        const at = a.find(v => v && v.range !== undefined);
        if (!(at && at.from === this.id)) t[m](...a);
        if (methods.has(m)) this.fastQueue.push([kind, m, a.map(v => (v && v.range !== undefined ? { pos: v.pos, range: v.range, from: v.from } : v))]);
      }),
    });
  }

  // the match is built; tell everyone who is who
  begin(match) {
    this.match = match;
    this.started = true;
    const roster = match.combatants.map(c => ({ name: c.name, team: c.team }));
    for (const l of this.links.values()) {
      if (!l.remote) continue;
      l.rel.send({ k: 'start', roster, you: match.combatants.indexOf(l.remote), code: this.code });
      l.ready = true;
      for (const m of l.pending) l.rel.send(m);
      l.pending = [];
    }
    for (const r of match.humans) if (r.isRemote) { r.avatar.isMate = r.team === match.human.team; if (r.avatar.isMate) r.avatar.setLabel(r.name); r.avatar.setSide(r.side); }
  }

  sendUtil(...a) {
    for (const l of this.links.values()) if (l.remote) l.sendRel({ k: 'u', a });
  }

  afterTick(now) {
    const m = this.match, links = [...this.links.values()].filter(l => l.remote && open(l.fast));
    this.tickN++;
    if (this.fastQueue.length) {
      for (const l of links) l.fast.send({ k: 'b', l: this.fastQueue });
      this.fastQueue = [];
    }
    if (this.tickN % 64 === 0) { // about once a second: latency probe and scoreboard
      for (const l of links) {
        l.fast.send({ k: 'png', t: performance.now() });
        l.sendRel({ k: 'sb', rows: m.scoreboard(l.remote), mvp: m.mvp().name });
      }
    }
    if (this.tickN % SNAPSHOT_TICKS) return;
    const rows = m.combatants.map(c => {
      const b = c.body, w = c.weapon;
      const flags = (c.alive ? 1 : 0) | (b.onGround ? 2 : 0) | (b.crouching ? 4 : 0) | (c.helmet ? 8 : 0) | (w.reloading ? 16 : 0)
        | (c.spottedUntil > now || c.firedUntil > now ? 32 : 0);
      return [r2(c.pos.x), r2(c.pos.y), r2(c.pos.z), r4(c.aimYaw), r4(c.aimPitch), r2(b.hSpeed), flags, Math.max(0, Math.round(c.hp)), Math.round(c.armor), wIdx(w.def), w.mag, w.reserve, r2(w.lastShot)];
    });
    const sp = m.spike, v = m.view();
    const base = {
      k: 's', t: r4(now), ph: m.phase, r: m.round, sc: m.score, si: m.sideOf, tm: r2(v.time), rows,
      sp: [sp.state, r2(sp.pos.x), r2(sp.pos.z), m.combatants.indexOf(sp.carrier)],
      d: m.drops.map(d => [d.id, wIdx(d.def), r2(d.pos.x), r2(d.pos.y), r2(d.pos.z), r2(d.ry)]),
    };
    for (const l of links) {
      if (l.fast.bufferSize > 8) continue; // a congested link skips a snapshot rather than falling behind
      const r = l.remote;
      l.fast.send({ ...base, me: {
        q: r.lastSeq, v: [r2(r.body.vel.x), r2(r.body.vel.y), r2(r.body.vel.z)], cr: r.credits, u: UTIL_ORDER.map(k => r.util[k]),
        p: r.primary ? wIdx(r.primary.def) : -1, pm: r.primary?.mag ?? 0, pr: r.primary?.reserve ?? 0,
        sm: r.secondary.mag, sr: r.secondary.reserve, cb: m.canBuy(r), ut: r2(r.useT),
      } });
    }
  }
}

// ---------- client ----------
export class ClientSession {
  // ui: { lobby(players, meName, connected), error(text), start(msg), hostLeft() }
  constructor(code, name, ui) {
    this.code = code;
    this.ui = ui;
    this.peer = new Peer();
    this.timer = setTimeout(() => ui.error('Could not connect to the host. One of the networks may be blocking direct connections.'), 20000);
    this.peer.on('error', e => { clearTimeout(this.timer); ui.error(peerError(e)); });
    this.peer.on('open', id => {
      this.id = id;
      this.rel = this.peer.connect(PREFIX + code, { label: 'rel', reliable: true, serialization: 'json' });
      this.fast = this.peer.connect(PREFIX + code, { label: 'fast', reliable: false, serialization: 'json' });
      this.rel.on('open', () => { clearTimeout(this.timer); this.rel.send({ k: 'hello', name }); });
      this.rel.on('data', d => this.onRel(d));
      this.rel.on('close', () => { if (!this.closing) ui.hostLeft(); });
      this.fast.on('data', d => this.onFast(d));
    });
  }

  setTeam(team) { if (open(this.rel)) this.rel.send({ k: 'team', team }); }
  act(m) { if (open(this.rel)) this.rel.send({ k: 'a', ...m }); }

  onRel(d) {
    if (!d || typeof d !== 'object') return;
    if (d.k === 'lobby') this.ui.lobby(d.players, d.you, true);
    else if (d.k === 'reject') { this.closing = true; this.ui.error(d.why); }
    else if (d.k === 'start') this.ui.start(d);
    else if (d.k === 'fb' && FEEDBACK.has(d.m)) this.feedback?.[d.m](...d.a);
    else if (d.k === 'u') this.match?.onUtil(d.a);
    else if (d.k === 'sb') this.match?.onBoard(d);
  }

  onFast(d) {
    if (!d || typeof d !== 'object') return;
    if (d.k === 's') this.match?.onSnapshot(d);
    else if (d.k === 'png') this.fast.send({ k: 'pon', t: d.t });
    else if (d.k === 'b' && Array.isArray(d.l)) for (const e of d.l) this.playEffect(e);
  }

  playEffect([kind, m, a]) {
    if (kind === 'fx' && FX_METHODS.has(m)) this.fx[m](...a);
    else if (kind === 'sfx' && SFX_METHODS.has(m)) {
      const at = a.find(v => v && v.range !== undefined);
      if (at?.from === this.id) return; // our own gun and steps already played locally
      this.sfx[m](...a.map(v => (v && v.range !== undefined ? this.spatial(v.pos, v.range) : v)));
    }
  }

  sendInput(a) { if (open(this.fast)) this.fast.send(a); }
}

// another player as a client sees them: snapshots played back slightly in the past
class Ghost extends Avatar {
  constructor(scene, info, match) {
    super(scene);
    this.match = match;
    this.name = info.name;
    this.team = info.team;
    this.alive = true;
    this.hp = 100; this.armor = 0; this.helmet = false;
    this.aimYaw = 0; this.aimPitch = 0;
    this.body = { pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), hSpeed: 0, onGround: true, crouching: false };
    this.buf = [];
    this.weapon = new Weapon(WEAPONS.vox9, null);
    this.isMate = info.team === match.human.team;
    if (this.isMate) this.setLabel(info.name);
  }
  get pos() { return this.body.pos; }

  push(t, row) {
    const [x, y, z, yaw, pitch, speed, flags, hp, armor, w, mag, reserve, shot] = row, b = this.body;
    this.buf.push([t, x, y, z, yaw, pitch]);
    if (this.buf.length > 16) this.buf.shift();
    this.alive = !!(flags & 1); b.hSpeed = speed; b.onGround = !!(flags & 2); b.crouching = !!(flags & 4);
    this.helmet = !!(flags & 8); this.seen = !!(flags & 32);
    this.hp = hp; this.armor = armor;
    const def = WEAPONS[WKEYS[w]] ?? WEAPONS.vox9;
    if (this.weapon.def !== def) { this.weapon = new Weapon(def, null); this.setGun(def); }
    const wp = this.weapon, reloading = !!(flags & 16);
    if (reloading && !wp.reloading) wp.reloadStart = this.match.now;
    wp.reloading = reloading; wp.mag = mag; wp.reserve = reserve;
    if (shot !== wp.lastShot) { wp.lastShot = shot; this.flashT = 0.05; }
  }

  render(alpha, dt) {
    const t = this.match.renderTime(), b = this.buf, p = this.body.pos;
    let i = b.length - 1;
    while (i > 0 && b[i - 1][0] > t) i--;
    if (b.length) {
      const hi = b[i], lo = b[Math.max(0, i - 1)], f = hi[0] > lo[0] ? THREE.MathUtils.clamp((t - lo[0]) / (hi[0] - lo[0]), 0, 1) : 1;
      p.set(lo[1] + (hi[1] - lo[1]) * f, lo[2] + (hi[2] - lo[2]) * f, lo[3] + (hi[3] - lo[3]) * f);
      const dy = Math.atan2(Math.sin(hi[4] - lo[4]), Math.cos(hi[4] - lo[4]));
      this.aimYaw = lo[4] + dy * f;
      this.aimPitch = lo[5] + (hi[5] - lo[5]) * f;
    }
    this.body.prevPos.copy(p);
    this.group.position.copy(p);
    this.pose(this.aimYaw, this.body.hSpeed, this.alive, this.body.crouching, dt);
  }

  viewAngles() { return [this.aimYaw, this.aimPitch]; }
}

const SILENT = new Proxy({}, { get: () => () => {} });

// Stands in for Match on a client: same interface for the main loop and HUD, filled from snapshots.
export class ClientMatch {
  constructor({ scene, world, human, player, session, msg }) {
    Object.assign(this, { scene, world, human, player, session });
    this.isClient = true;
    this.you = msg.you;
    this.roster = msg.roster;
    human.name = msg.roster[msg.you].name;
    human.team = msg.roster[msg.you].team;
    this.phase = 'buy'; this.round = 0; this.score = [0, 0]; this.sideOf = ['attack', 'defend']; this.time = 0;
    this.now = 0; this.lastT = -1; this.offset = null;
    this.ghosts = msg.roster.map((info, i) => (i === msg.you ? null : new Ghost(scene, info, this)));
    this.others = this.ghosts.filter(Boolean);
    this.spike = { state: 'none', x: 0, z: 0, carrier: -1 };
    ({ mesh: this.spikeMesh } = buildSpikeMesh(scene));
    this.drops = new Map();
    this.board = [];
    this.cb = false;
    this.seq = 0; this.edges = [0, 0, 0, 0]; this.history = []; this.lastSelect = -1;
    // the util system only draws here; the host's sounds and sparks arrive as effects
    const stub = { scene, world, sfx: SILENT, fx: SILENT, spatial: () => ({ gain: 0, pan: 0 }), hooks: {}, enemies: [[], []], noise() {}, los: () => true, shakeAll() {}, now: 0 };
    this.stub = stub;
    this.util = new Utilities(stub, true);
  }

  get frozen() { return this.phase === 'buy'; }
  renderTime() { return performance.now() / 1000 + (this.offset ?? 0) - INTERP; }
  noise() {}

  // called once per client tick, before local movement runs
  capture(input, adsT) {
    const p = this.player, keys = new Set(), frozen = this.frozen || !this.human.alive;
    let mask = input.mouseDown ? FIRE_BIT : 0;
    KEYBITS.forEach((k, i) => {
      if (input.keys.has(k) || (k === 'ShiftLeft' && input.keys.has('ShiftRight')) || (k === 'KeyC' && input.keys.has('ControlLeft'))) { mask |= 1 << i; keys.add(k); }
    });
    const jump = input.pressed.has('Space') || input.pressed.has('Wheel');
    const e = this.edges;
    if (jump) e[0]++;
    if (input.pressed.has('Mouse0')) e[1]++;
    if (input.pressed.has('Mouse2')) e[2]++;
    if (input.pressed.has('KeyR')) e[3]++;
    const seq = ++this.seq;
    this.history.push({ seq, yaw: p.yaw, pitch: p.pitch, speedScale: p.speedScale, input: { keys: frozen ? new Set() : keys, jump: jump && !frozen, consume(c) { return c === 'Space' && this.jump && !(this.jump = false); } } });
    if (this.history.length > 128) this.history.shift();
    this.session.sendInput([seq, mask, r4(p.yaw), r4(p.pitch), r2(adsT), e[0], e[1], e[2], e[3]]);
  }

  tick(dt, now) {
    this.now = now;
    this.stub.now = now;
    this.util.update(dt, now);
  }

  onSnapshot(s) {
    if (s.t <= this.lastT) return; // lossy channel: late packets are simply stale
    this.lastT = s.t;
    const off = s.t - performance.now() / 1000;
    this.offset = this.offset === null || Math.abs(off - this.offset) > 1 ? off : this.offset + (off - this.offset) * 0.05;
    if (s.r !== this.round) {
      this.round = s.r;
      this.util.clear();
    }
    this.phase = s.ph; this.score = s.sc; this.sideOf = s.si; this.time = s.tm;
    this.human.side = s.si[this.human.team];
    s.rows.forEach((row, i) => {
      const g = this.ghosts[i];
      if (g) { if (g.side !== s.si[g.team]) { g.side = s.si[g.team]; g.setSide(g.side); } g.push(s.t, row); }
    });
    const [state, x, z, carrier] = s.sp;
    this.spike = { state, x, z, carrier };
    this.spikeMesh.visible = state === 'dropped' || state === 'planted';
    this.spikeMesh.position.set(x, 0, z);
    this.syncDrops(s.d);
    this.applySelf(s.rows[this.you], s.me);
  }

  syncDrops(list) {
    const seen = new Set();
    for (const [id, w, x, y, z, ry] of list) {
      seen.add(id);
      if (this.drops.has(id)) continue;
      const def = WEAPONS[WKEYS[w]];
      if (def) this.drops.set(id, { def, pos: new THREE.Vector3(x, y, z), mesh: dropMesh(this.scene, def, x, y, z, ry) });
    }
    for (const [id, d] of this.drops) if (!seen.has(id)) { d.mesh.removeFromParent(); this.drops.delete(id); }
  }

  applySelf(row, me) {
    const h = this.human, now = this.now, flags = row[6];
    h.alive = !!(flags & 1); h.hp = row[7]; h.armor = row[8]; h.helmet = !!(flags & 8);
    h.credits = me.cr; h.useT = me.ut; this.cb = me.cb;
    UTIL_ORDER.forEach((k, i) => { h.util[k] = me.u[i]; });

    const wantP = me.p >= 0 ? WEAPONS[WKEYS[me.p]] : null;
    if (h.primary?.def !== wantP) {
      if (wantP) h.give(wantP, now, { mag: me.pm, reserve: me.pr });
      else h.takePrimary(now);
    }
    // ammo: trust the host unless we are mid-burst or mid-reload, when local prediction is fresher
    for (const [w, mag, res] of [[h.primary, me.pm, me.pr], [h.secondary, me.sm, me.sr]]) {
      if (w && !w.reloading && now - w.lastShot > 0.3) { w.mag = mag; w.reserve = res; }
    }
    if (now - this.lastSelect > 0.5) { // the host decides what is in hand, after giving our last switch time to arrive
      const want = WEAPONS[WKEYS[row[9]]];
      if (want && h.weapon.def !== want) {
        const w = want === h.primary?.def ? h.primary : want === h.secondary.def ? h.secondary : want === h.knife.def ? h.knife : want.kind ? h.utilWeapon(want.kind) : null;
        if (w) h.equip(w, now);
      }
    }
    if (h.alive) this.reconcile(row, me);
    else this.history = [];
  }

  // replay unacknowledged inputs on top of the host's state; small differences are left alone
  reconcile(row, me) {
    const p = this.player, saved = p.saveState();
    this.history = this.history.filter(h => h.seq > me.q);
    p.pos.set(row[0], row[1], row[2]);
    p.vel.set(me.v[0], me.v[1], me.v[2]);
    p.onGround = !!(row[6] & 2);
    if (!!(row[6] & 4) !== p.crouching) { p.crouching = !p.crouching; p.height = p.crouching ? MOVE.crouchHeight : MOVE.standHeight; }
    p.jumpBuffer = 0;
    for (const h of this.history) {
      p.yaw = h.yaw; p.pitch = h.pitch; p.speedScale = h.speedScale;
      const consumed = h.input.jump;
      p.tick(TICK, this.now, h.input, NO_SFX);
      h.input.jump = consumed; // may replay again next snapshot
    }
    const corrected = p.pos.clone(), err = corrected.distanceTo(saved.pos), vel = p.vel.clone(), ground = p.onGround, crouch = p.crouching, height = p.height;
    p.restoreState(saved);
    if (err < 0.06) return;
    p.pos.copy(err > 1.5 ? corrected : saved.pos.clone().lerp(corrected, 0.35));
    if (err > 1.5) p.prevPos.copy(p.pos);
    p.vel.copy(vel); p.onGround = ground; p.crouching = crouch; p.height = height;
  }

  onUtil([what, ...a]) {
    const v = o => new THREE.Vector3(o.x, o.y, o.z);
    if (what === 'launch') { const [id, team, side, kind, origin, vel] = a; this.util.launch({ team, side }, kind, v(origin), v(vel), id); }
    else if (what === 'det') this.util.applyDet(a[0], a[1], this.now);
    else if (what === 'decoyEnd') this.util.decoys.find(d => d.id === a[0])?.destroy();
  }

  onBoard({ rows, mvp }) { this.board = rows; this.mvpName = mvp; }

  // ---------- what the main loop asks of a match ----------
  view() {
    const mine = this.human.team, theirs = 1 - mine, teamAlive = t => this.roster.map((r, i) => (r.team === t ? (this.ghosts[i]?.alive ?? this.human.alive) : null)).filter(v => v !== null);
    return {
      round: this.round, score: [this.score[mine], this.score[theirs]], mySide: this.sideOf[mine],
      phase: this.phase, planted: this.spike.state === 'planted', time: this.time,
      alive: [teamAlive(mine), teamAlive(theirs)], carrying: this.spike.state === 'carried' && this.spike.carrier === this.you,
    };
  }

  radarDots() {
    const dots = [...this.util.radarDots()], sp = this.spike;
    for (const g of this.others) {
      if (!g.alive) continue;
      if (g.team === this.human.team) dots.push({ x: g.pos.x, z: g.pos.z, color: '#38e8ff' });
      else if (g.seen) dots.push({ x: g.pos.x, z: g.pos.z, color: '#ff3fb4' });
    }
    if (sp.state === 'dropped' || sp.state === 'planted') dots.push({ x: sp.x, z: sp.z, color: '#ffb347', square: true });
    else if (sp.state === 'carried' && this.ghosts[sp.carrier]?.team === this.human.team) {
      const g = this.ghosts[sp.carrier];
      dots.push({ x: g.pos.x, z: g.pos.z, color: '#ffb347', square: true });
    }
    return dots;
  }

  spectatePool() {
    const alive = this.others.filter(c => c.alive), mates = alive.filter(c => c.team === this.human.team);
    return mates.length ? mates : alive;
  }

  scoreboard() { return this.board; }
  mvp() { return { name: this.mvpName ?? '—' }; }
  canBuy() { return this.cb && this.human.alive; }

  nearestDrop(pos, range) {
    let best = null, bd = range;
    for (const d of this.drops.values()) {
      const dist = Math.hypot(d.pos.x - pos.x, d.pos.z - pos.z);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  // actions the host carries out; the result comes back in the next snapshot
  buy(_, id) { this.session.act({ a: 'buy', id }); return null; }
  noteSelect(slot) { this.lastSelect = this.now; this.session.act({ a: 'sel', slot }); }
  tryPickup(_, swap) { if (swap) this.session.act({ a: 'pick' }); }
  dropWeapon() { this.session.act({ a: 'drop' }); }
  humanShot(h, shot) { if (shot.throw) h.thrown(shot.kind, this.now); }
}
