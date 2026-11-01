import * as THREE from 'three';
import { Player } from './player.js';
import { Weapon } from './weapon.js';
import { toon, neon, outlinedBox, PALETTE } from './render.js';
import { glowTex } from './fx.js';
import { PARTS } from './targets.js';
import { MOVE, WEAPONS, BOT } from './config.js';

const DEG = Math.PI / 180;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const yawTo = (dx, dz) => Math.atan2(-dx, -dz); // yaw 0 faces -Z
const NO_SFX = { shot() {}, reload() {}, click() {}, step() {}, land() {} };
const NO_INPUT = { keys: new Set(), consume: () => false };
const tmp = new THREE.Vector3(), eyeV = new THREE.Vector3(), headV = new THREE.Vector3(), chestV = new THREE.Vector3();

// Side colours: attackers wear Ghostwire magenta, defenders Helix blue.
const LOOK = {
  attack: { body: 0xc0487a, head: 0x4a3f6a, visor: PALETTE.cyan, strip: PALETTE.magenta },
  defend: { body: 0x4a8ee8, head: 0x2c3f66, visor: PALETTE.amber, strip: PALETTE.cyan },
};

class BotInput {
  constructor() { this.keys = new Set(); this.pressed = new Set(); this.mouseDown = false; }
  consume(c) { return this.pressed.delete(c); }
}

// A visible player body: used by bots, by other players on the host, and by every player on a client.
export class Avatar {
  constructor(scene) {
    this.walkT = 0;
    this.flash = 0;
    this.flashT = 0;
    this.spectated = false;
    this.isMate = false;
    this.buildModel(scene);
  }

  buildModel(scene) {
    const g = this.group = new THREE.Group();
    g.rotation.order = 'YXZ';
    this.mat = toon(0xffffff);
    this.headMat = toon(0xffffff);
    this.parts = [];
    this.legs = [];
    for (const [w, h, d, px, py, pz, zone] of PARTS) {
      const m = outlinedBox(w, h, d, zone === 'head' ? this.headMat : this.mat, 0.018);
      m.userData.dummy = this;
      m.userData.part = zone;
      this.parts.push(m);
      if (zone === 'legs') { // pivot at the hip so legs can swing
        const hip = new THREE.Group();
        hip.position.set(px, 0.86, pz);
        m.position.set(0, py - 0.86, 0);
        hip.add(m);
        g.add(hip);
        this.legs.push(hip);
      } else {
        m.position.set(px, py, pz);
        g.add(m);
      }
    }
    this.visorMat = neon(0xffffff, 2);
    this.stripMat = neon(0xffffff, 2);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.02), this.visorMat);
    visor.position.set(0, 1.66, 0.135);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.02), this.stripMat);
    strip.position.set(0, 1.32, 0.145);
    this.gunMesh = outlinedBox(0.07, 0.09, 0.55, toon(0x2a2638), 0.012);
    this.gunMesh.position.set(0.16, 1.28, 0.32);
    this.muzzleFlash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: new THREE.Color(0xffc070).multiplyScalar(3),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    this.muzzleFlash.position.set(0.16, 1.3, 0.64);
    this.muzzleFlash.scale.setScalar(0.4);
    this.muzzleFlash.visible = false;
    // teammate marker: floating diamond, only shown on the player's squad
    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), neon(PALETTE.cyan, 1.2));
    this.marker.position.set(0, 2.15, 0);
    this.marker.visible = false;
    g.add(visor, strip, this.gunMesh, this.muzzleFlash, this.marker);
    scene.add(g);
  }

  setSide(side) {
    this.side = side;
    const l = LOOK[side];
    this.mat.color.set(l.body);
    this.headMat.color.set(l.head);
    this.visorMat.color.set(l.visor).multiplyScalar(2);
    this.stripMat.color.set(l.strip).multiplyScalar(2);
  }

  setGun(def) { this.gunMesh.scale.z = { pistol: 0.5, smg: 0.7, shotgun: 1.05, marksman: 1.3 }[def.model] ?? 1; }

  // teammates get their name over their head
  setLabel(name) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 48;
    const g = c.getContext('2d');
    g.font = '700 30px Consolas, monospace'; g.textAlign = 'center'; g.fillStyle = '#7ff2ff';
    g.fillText(name, 128, 34);
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    this.label.scale.set(1.3, 0.25, 1);
    this.label.position.y = 2.4;
    this.label.visible = false;
    this.group.add(this.label);
  }

  // set group.position first
  pose(yaw, speed, alive, crouching, dt) {
    const g = this.group;
    g.rotation.y = yaw + Math.PI; // model faces +Z
    g.rotation.x = alive ? 0 : Math.max(-Math.PI / 2, g.rotation.x - dt * 7);
    g.scale.y = crouching ? 0.72 : 1;
    const sp = alive ? speed : 0;
    this.walkT += dt * sp * 2.2;
    const swing = Math.sin(this.walkT) * 0.5 * Math.min(1, sp / MOVE.runSpeed);
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.mat.emissive.setScalar(this.flash * 0.8);
    this.headMat.emissive.setScalar(this.flash * 0.8);
    this.flashT -= dt;
    this.muzzleFlash.visible = this.flashT > 0;
    this.marker.visible = alive && this.isMate;
    if (this.label) this.label.visible = alive && this.isMate;
    g.visible = !this.spectated; // the spectator camera sits inside this head
    g.updateMatrixWorld();
  }

  muzzleWorld(out) { return this.muzzleFlash.getWorldPosition(out); }
}

/*
  A squad bot. Drives the same Player physics and Weapon as the human through a fake input.
  Combat states (interrupt everything):  engage -> seek (hunt) / cover (break sight)
  Otherwise it runs a task chosen by objective() from its side and the spike's state:
    route  walk a lane via waypoints     goto  walk to a spot
    hold   watch an angle                use   stand still and plant / purge (match runs the timer)
*/
export class Bot extends Avatar {
  constructor(scene, nav, name, team, skill, ctx) {
    super(scene);
    this.isHuman = false;
    this.name = name;
    this.team = team;
    this.sk = skill;
    this.nav = nav;
    this.body = new Player(ctx.world);
    this.input = new BotInput();
    this.weapon = new Weapon(WEAPONS.vox9, null);
    this.stepSfx = {
      step: () => { ctx.sfx.step(ctx.spatial(this.body.pos, 22)); ctx.noise(this, BOT.hearStep); },
      land() {},
    };
    this.hp = 100; this.armor = 0; this.helmet = false; this.credits = 0;
    this.kills = 0; this.deaths = 0;
    this.alive = true;
    this.using = null; this.useT = 0;
    this.lastKnown = new THREE.Vector3();
    this.alertPos = new THREE.Vector3();
    this.phase = Math.random() * 6;
    this.spottedUntil = 0;
  }

  get pos() { return this.body.pos; }
  get hSpeed() { return this.body.hSpeed; }
  headPoint(out) { const p = this.body.pos; return out.set(p.x, p.y + 1.66, p.z); }
  chestPoint(out) { const p = this.body.pos; return out.set(p.x, p.y + 1.15, p.z); }
  rayHit(raycaster) {
    const h = raycaster.intersectObjects(this.parts, false)[0];
    return h ? { distance: h.distance, zone: h.object.userData.part, point: h.point } : null;
  }

  spawnAt(x, z, yaw) {
    this.body.spawnAt(tmp.set(x, 0, z), yaw);
    this.aimYaw = this.prevAimYaw = yaw;
    this.aimPitch = this.prevAimPitch = 0;
    this.hp = 100;
    this.alive = true;
    this.using = null; this.useT = 0;
    this.state = 'task';
    this.task = null;
    this.path = null;
    this.target = null;
    this.alertUntil = 0;
    this.lastSeen = -10;
    this.nextSense = 0;
    this.coverUsed = false;
    this.syncTransform();
  }

  setWeapon(def, ammo) {
    this.weapon = new Weapon(def, null);
    if (ammo) { this.weapon.mag = ammo.mag; this.weapon.reserve = ammo.reserve; }
    this.setGun(def);
    this.body.speedScale = def.speed ?? 1;
  }

  resetLoadout() {
    this.setWeapon(WEAPONS.vox9);
    this.armor = 0;
    this.helmet = false;
    this.util = { emp: 0, smoke: 0, fire: 0, decoy: 0 };
  }

  // economy: full buy (rifle, sometimes the Mantis) when it leaves armour money,
  // a force buy (SMG / shotgun) on a mid budget, otherwise save; utility with what's left
  buy(prices) {
    const W = WEAPONS, take = id => { this.credits -= prices[id]; this.setWeapon(W[id]); };
    if (this.weapon.def.slot !== 'primary') {
      if (this.sk.sniper && this.credits >= prices.mantis + 1000 && Math.random() < this.sk.sniper) take('mantis');
      else if (this.credits >= prices.lancer + prices.vest) take('lancer');
      else if (this.credits >= prices.razor + prices.vest && this.credits < 3600) take(Math.random() < 0.25 ? 'breaker' : 'razor');
    }
    const armed = this.weapon.def.slot === 'primary';
    if (this.armor < 50 && this.credits >= prices.vesthelm + (armed ? 0 : 2000)) {
      this.credits -= prices.vesthelm; this.armor = 100; this.helmet = true;
    } else if (this.armor < 50 && this.credits >= prices.vest + 500) {
      this.credits -= prices.vest; this.armor = 100;
    }
    const want = this.side === 'attack' ? ['smoke', 'emp', 'fire'] : ['fire', 'emp', 'smoke'];
    for (const k of want) {
      if (armed && this.credits >= prices[k] + 300 && !this.util[k]) { this.credits -= prices[k]; this.util[k] = 1; }
    }
    this.weapon.refill();
  }

  // throw utility if carried and the skill roll passes
  tryThrow(kind, target, now, ctx, chance = this.sk.utility) {
    if (!this.util?.[kind] || now < (this.nextThrow ?? 0) || Math.random() > chance) return false;
    this.util[kind]--;
    this.nextThrow = now + 1.5;
    ctx.match.util.throwAt(this, kind, target);
    return true;
  }

  die() {
    this.alive = false;
    this.using = null;
    this.state = 'dead';
  }

  onHurt(attacker, now) {
    if (!this.alive) return;
    this.alertPos.copy(attacker.pos);
    this.alertUntil = now + 4;
    this.alertAt = now - 2; // investigate sooner than for a sound
  }

  hear(pos, now, ctx) {
    if (!this.alive) return;
    ctx?.match.heardNear(this, pos);
    if (this.state === 'engage') return;
    this.alertPos.copy(pos);
    this.alertUntil = now + 4;
    this.alertAt = now;
  }

  // ---------- navigation ----------
  setPath(x, z) {
    const p = this.body.pos;
    this.path = this.nav.findPath(p.x, p.z, x, z);
    this.pi = 0;
    this.stuckT = 0;
  }
  arrived() { return !this.path || this.pi >= this.path.length; }

  follow(dt) {
    const p = this.path;
    if (!p || this.pi >= p.length) return null;
    const b = this.body.pos;
    let dx, dz, d;
    for (;;) {
      dx = p[this.pi][0] - b.x; dz = p[this.pi][1] - b.z; d = Math.hypot(dx, dz);
      if (d >= 0.6) break;
      if (++this.pi >= p.length) return null;
    }
    this.press(dx, dz, d);
    if (this.body.hSpeed < 0.5) {
      this.stuckT += dt;
      if (this.stuckT > 1) { const end = p[p.length - 1]; this.setPath(end[0], end[1]); }
    } else this.stuckT = 0;
    return [yawTo(dx, dz), 0];
  }

  // WASD relative to where the bot is looking
  press(dx, dz, d) {
    const y = this.aimYaw, k = this.input.keys;
    const f = (-dx * Math.sin(y) - dz * Math.cos(y)) / d;
    const s = (dx * Math.cos(y) - dz * Math.sin(y)) / d;
    if (f > 0.38) k.add('KeyW'); else if (f < -0.38) k.add('KeyS');
    if (s > 0.38) k.add('KeyD'); else if (s < -0.38) k.add('KeyA');
  }

  lookAt(v) {
    const b = this.body.pos, dx = v.x - b.x, dz = v.z - b.z;
    return [yawTo(dx, dz), Math.atan2(v.y - (b.y + MOVE.standEye), Math.hypot(dx, dz))];
  }
  lookFlat(x, z) { const b = this.body.pos; return [yawTo(x - b.x, z - b.z), 0]; }

  aimToward(yaw, pitch, dt, rate) {
    const t = 1 - Math.exp(-dt * rate);
    this.aimYaw = wrap(this.aimYaw + wrap(yaw - this.aimYaw) * t);
    this.aimPitch += (pitch - this.aimPitch) * t;
  }

  // ---------- objectives ----------
  objective(now, ctx) {
    const m = ctx.match, sp = m.spike;
    this.spikeVer = sp.ver;
    this.intelVer = m.intelVer;
    this.using = null;
    const site = m.siteFor(this);
    if (this.side === 'attack') {
      if (sp.state === 'carried' && sp.carrier === this) {
        this.task = { type: 'route', pts: [...this.route, [site.plantX, site.plantZ]], i: 0, then: { type: 'use', what: 'plant' } };
      } else if (sp.state === 'dropped' && m.fetcher(this.team) === this) {
        this.task = { type: 'goto', x: sp.pos.x, z: sp.pos.z, then: null };
      } else if (sp.state === 'planted') {
        const s = m.postSpot(this, site, 'attack');
        this.task = { type: 'goto', x: s.x, z: s.z, then: { type: 'hold', ...s } };
      } else {
        const s = m.postSpot(this, site, 'attack');
        this.task = { type: 'route', pts: [...this.route], i: 0, then: { type: 'goto', x: s.x, z: s.z, then: { type: 'hold', ...s } } };
      }
    } else if (sp.state === 'planted') {
      if (m.purger(this.team) === this) {
        this.task = { type: 'goto', x: sp.pos.x, z: sp.pos.z, near: 0.9, then: { type: 'use', what: 'purge' } };
      } else {
        const s = m.postSpot(this, site, 'defend');
        this.task = { type: 'goto', x: s.x, z: s.z, then: { type: 'hold', ...s } };
      }
    } else {
      const h = this.hold, alarm = m.alarmSite;
      if (alarm && m.rotator === this) { // rotate to help
        const s = m.postSpot(this, alarm, 'defend');
        this.task = { type: 'goto', x: s.x, z: s.z, then: { type: 'hold', ...s } };
      } else this.task = { type: 'goto', x: h.x, z: h.z, then: { type: 'hold', ...h } };
    }
    this.startTask();
  }

  // re-plan when the spike changes hands or (defenders) a site is called out
  stale(m) { return !this.task || this.spikeVer !== m.spike.ver || (this.side === 'defend' && this.intelVer !== m.intelVer); }

  startTask() {
    const t = this.task;
    if (!t) return;
    if (t.type === 'route') this.setPath(...t.pts[t.i]);
    else if (t.type === 'goto') this.setPath(t.x, t.z);
    else this.path = null;
  }

  next() { this.task = this.task?.then ?? null; this.startTask(); }

  // after a fight: keep the current task unless the spike situation changed
  resume(now, ctx) {
    if (this.stale(ctx.match)) this.objective(now, ctx);
    else this.startTask();
    this.state = 'task';
  }

  runTask(dt, now, ctx) {
    if (this.stale(ctx.match)) this.objective(now, ctx);
    const t = this.task;
    if (!t) return this.lookFlat(this.body.pos.x, this.body.pos.z - 1);
    switch (t.type) {
      case 'route': {
        const look = this.follow(dt);
        if (this.arrived()) {
          if (++t.i < t.pts.length) {
            this.setPath(...t.pts[t.i]);
            // entering the site: smoke off the defenders' entrance, pop an EMP over the site
            if (t.i === t.pts.length - 1 && this.side === 'attack') {
              const site = ctx.match.siteFor(this);
              if (!this.tryThrow('smoke', site.watchDefend, now, ctx)) this.tryThrow('emp', tmp.set(site.x, 3, site.z), now, ctx);
            }
          } else this.next();
        }
        return look;
      }
      case 'goto': {
        const look = this.follow(dt);
        const near = t.near ?? 0.6, b = this.body.pos;
        if (this.arrived() || Math.hypot(t.x - b.x, t.z - b.z) < near) this.next();
        return look;
      }
      case 'hold': {
        if (this.weapon.mag < this.weapon.def.mag * 0.5 && !this.weapon.reloading) this.input.pressed.add('KeyR');
        // post-plant: someone is purging the spike, burn them off it
        const sp = ctx.match.spike;
        if (this.side === 'attack' && sp.state === 'planted' && ctx.match.purging()) this.tryThrow('fire', sp.pos, now, ctx, 1);
        if (this.alertUntil > now) return this.lookAt(tmp.set(this.alertPos.x, this.alertPos.y + 1.2, this.alertPos.z));
        const base = this.lookFlat(t.lx, t.lz);
        return [base[0] + Math.sin(now * 0.5 + this.phase) * 0.3, 0];
      }
      case 'use': {
        this.using = t.what;
        const sp = ctx.match.spike;
        return t.what === 'purge' ? this.lookAt(tmp.set(sp.pos.x, 0, sp.pos.z)) : [this.aimYaw, -0.6];
      }
    }
    return null;
  }

  goSeek(pos, now) {
    this.state = 'seek';
    this.setPath(pos.x, pos.z);
    this.seekUntil = now + 8;
    this.seekDoneAt = 0;
  }

  // ---------- perception (10 Hz) ----------
  sense(now, ctx) {
    if (now < (this.blindUntil ?? 0)) return; // EMP'd: sees nothing
    const b = this.body.pos;
    eyeV.set(b.x, b.y + MOVE.standEye, b.z);
    const enemies = ctx.enemiesOf(this.team);
    const engaged = this.state === 'engage' ? this.target : null;
    let best = null, bestD = Infinity, bestHead = false, bestChest = false;
    // the current target first: keep it unless another visible enemy is much closer
    const order = engaged ? [engaged, ...enemies.filter(e => e !== engaged)] : enemies;
    for (const e of order) {
      if (!e.alive) continue;
      const dx = e.pos.x - b.x, dz = e.pos.z - b.z, d = Math.hypot(dx, dz);
      const threshold = best === engaged && engaged ? bestD * 0.6 : bestD;
      if (d > BOT.sight || (e !== engaged && d >= threshold)) continue;
      if (e !== engaged) {
        const cos = (-dx * Math.sin(this.aimYaw) - dz * Math.cos(this.aimYaw)) / (d || 1);
        const fov = this.alertUntil > now || engaged ? 160 : this.sk.fov;
        if (cos < Math.cos((fov / 2) * DEG)) continue;
      }
      const head = ctx.los(eyeV, e.headPoint(headV)), chest = ctx.los(eyeV, e.chestPoint(chestV));
      if (!head && !chest) continue;
      best = e; bestD = d; bestHead = head; bestChest = chest;
    }
    if (best && engaged && best !== engaged) { // new threat: re-acquire with a short reaction
      this.fireReadyAt = now + this.sk.reaction * 0.3;
      this.errYaw = (Math.random() - 0.5) * this.sk.aimError;
    }
    if (!best) return;
    best.spottedUntil = now + 1;
    ctx.match.spotted(this, best);
    this.lastSeen = now;
    this.lastKnown.copy(best.pos);
    this.visHead = bestHead;
    this.visChest = bestChest;
    if (best.hSpeed > 1 && this.state === 'engage') this.errYaw += (Math.random() - 0.5) * 2 * this.sk.track * best.hSpeed;
    if (this.state !== 'engage') this.startEngage(now, bestD);
    this.target = best;
  }

  startEngage(now, dist) {
    const sk = this.sk;
    this.state = 'engage';
    this.using = null;
    this.sub = 'shoot';
    // holding a still, pre-aimed angle: faster trigger and the crosshair is already close
    const holding = this.state === 'task' && this.task?.type === 'hold' && this.body.hSpeed < 0.5;
    this.fireReadyAt = now + sk.reaction * (0.8 + Math.random() * 0.4) * (this.alertUntil > now ? 0.75 : 1) * (holding ? 0.65 : 1);
    const e = sk.aimError * (1 + dist / 30) * (holding ? 0.5 : 1), a = Math.random() * Math.PI * 2;
    this.errYaw = Math.cos(a) * e;
    this.errPitch = Math.sin(a) * e * 0.6;
    this.aimHead = Math.random() < sk.headBias;
    this.burstLeft = this.pickBurst(dist);
    // defenders slow a push with fire or an EMP at range
    if (this.side === 'defend' && dist > 12 && this.ctxRef) {
      const at = this.lastKnown;
      if (!this.tryThrow('fire', at, now, this.ctxRef, sk.utility * 0.5)) this.tryThrow('emp', tmp.set(at.x, at.y + 2.5, at.z), now, this.ctxRef, sk.utility * 0.4);
    }
  }

  pickBurst(d) {
    const model = this.weapon.def.model;
    if (model === 'shotgun' || model === 'marksman') return 1;
    if (model === 'smg') return d > 20 ? 3 + ((Math.random() * 3) | 0) : 8 + ((Math.random() * 7) | 0);
    if (this.weapon.def.slot === 'secondary') return 1 + ((Math.random() * 3) | 0);
    if (d > 25) return 1 + ((Math.random() * 2) | 0); // taps
    if (d > 12) return 3 + ((Math.random() * 3) | 0); // bursts
    return 6 + ((Math.random() * 6) | 0);             // spray
  }

  engage(dt, now, ctx) {
    const sk = this.sk, b = this.body, w = this.weapon, tgt = this.target;
    if (!tgt || !tgt.alive || now - this.lastSeen > 0.6) {
      // attackers hunt a lost target; defenders re-hold their angle, watching where it went
      const urgent = ctx.match.spike.state === 'planted' || ctx.match.spike.carrier === this;
      if (sk.seek && !urgent && tgt && tgt.alive && this.side === 'attack') this.goSeek(this.lastKnown, now);
      else {
        if (tgt && tgt.alive) { this.alertPos.copy(this.lastKnown); this.alertUntil = now + 3; this.alertAt = now; }
        this.resume(now, ctx);
      }
      return null;
    }
    if (sk.coverHp && this.hp < sk.coverHp && !this.coverUsed) {
      this.coverUsed = true;
      const spot = ctx.findCover(this, tgt);
      if (spot) { this.state = 'cover'; this.coverUntil = 0; this.setPath(spot[0], spot[1]); return null; }
    }

    const visible = now - this.lastSeen < 0.15;
    const target = !visible ? tmp.set(this.lastKnown.x, this.lastKnown.y + 1.2, this.lastKnown.z)
      : (this.aimHead && this.visHead) || !this.visChest ? tgt.headPoint(tmp) : tgt.chestPoint(tmp);
    const decay = Math.exp(-dt / sk.settle);
    this.errYaw *= decay;
    this.errPitch *= decay;
    const [ty, tp] = this.lookAt(target);
    const wantYaw = ty + this.errYaw, wantPitch = tp + this.errPitch;
    const off = Math.hypot(wrap(wantYaw - this.aimYaw), wantPitch - this.aimPitch);

    if (w.mag === 0) this.input.pressed.add('KeyR');
    if (this.sub === 'shoot') {
      const frac = b.hSpeed / MOVE.runSpeed;
      if (frac > MOVE.accurateFraction && sk.strafe) { // counter-strafe to stop
        const side = b.vel.x * Math.cos(this.aimYaw) - b.vel.z * Math.sin(this.aimYaw);
        if (side > 1) this.input.keys.add('KeyA'); else if (side < -1) this.input.keys.add('KeyD');
      }
      const tol = w.def.scope ? sk.fireTol * 0.5 : sk.fireTol; // the Mantis waits for a settled aim
      const blind = now < (this.blindUntil ?? 0);
      if (visible && !blind && now >= this.fireReadyAt && off < tol && frac <= MOVE.accurateFraction && w.mag > 0 && !w.reloading) {
        this.input.mouseDown = true;
        this.input.pressed.add('Mouse0'); // semi-auto pistols need a fresh click
      }
      if (this.burstLeft <= 0) {
        this.sub = sk.strafe ? 'strafe' : 'pause';
        this.subUntil = now + sk.pause * (1 + Math.random() * 1.4);
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
    } else {
      if (this.sub === 'strafe') this.input.keys.add(this.strafeDir > 0 ? 'KeyD' : 'KeyA');
      if (now >= this.subUntil) {
        this.sub = 'shoot';
        this.burstLeft = this.pickBurst(Math.hypot(tgt.pos.x - b.pos.x, tgt.pos.z - b.pos.z));
      }
    }
    return [wantYaw, wantPitch];
  }

  // ---------- main tick (64 Hz) ----------
  tick(dt, now, ctx) {
    if (!this.alive) return;
    this.prevAimYaw = this.aimYaw; // for smooth spectating
    this.prevAimPitch = this.aimPitch;
    const inp = this.input;
    inp.keys.clear();
    inp.mouseDown = false;

    if (ctx.match.frozen) { // buy phase: stand still, look ahead
      this.body.tick(dt, now, NO_INPUT, NO_SFX);
      this.syncTransform();
      return;
    }
    this.ctxRef = ctx;
    if (now >= this.nextSense) { this.nextSense = now + 0.1; this.sense(now, ctx); }

    let look = null;
    const fire = ctx.match.util.fireAt(this.body.pos);
    if (fire) { // standing in fire: step straight out, away from its centre
      const dx = this.body.pos.x - fire.pos.x, dz = this.body.pos.z - fire.pos.z, d = Math.hypot(dx, dz) || 1;
      this.press(dx, dz, d);
    } else switch (this.state) {
      case 'engage': look = this.engage(dt, now, ctx); break;
      case 'seek':
        look = this.follow(dt);
        if (this.arrived()) {
          look = [this.aimYaw + 2.5 * dt, 0]; // look around
          this.seekDoneAt ||= now + 1.5;
          if (now > this.seekDoneAt) this.resume(now, ctx);
        }
        if (now > this.seekUntil) this.resume(now, ctx);
        break;
      case 'cover':
        look = this.follow(dt) ?? this.lookAt(tmp.set(this.lastKnown.x, this.lastKnown.y + 1.2, this.lastKnown.z));
        if (this.arrived()) {
          this.coverUntil ||= now + 1.5 + Math.random();
          if (this.weapon.mag < this.weapon.def.mag * 0.7) inp.pressed.add('KeyR');
          if (now > this.coverUntil && !this.weapon.reloading) { this.coverUsed = false; this.goSeek(this.lastKnown, now); }
        }
        break;
      default:
        look = this.runTask(dt, now, ctx);
    }
    if (look) this.aimToward(look[0], look[1], dt, this.state === 'engage' ? this.sk.aimSpeed : 6);

    const b = this.body;
    b.yaw = this.aimYaw;
    b.pitch = this.aimPitch;
    if (this.using) inp.keys.clear(); // planting / purging means standing still
    b.tick(dt, now, inp, this.stepSfx);

    // the Mantis: bots scope in whenever they stand still
    if (this.weapon.def.scope) this.weapon.adsT = b.hSpeed < 1 ? 1 : 0;
    // aim against the spray pattern by the skill's compensation factor
    const [px, py] = this.weapon.patternAt(this.weapon.heat), c = this.sk.spray;
    const shooter = {
      yaw: this.aimYaw + px * DEG * c, pitch: this.aimPitch - py * DEG * c,
      crouching: false, onGround: b.onGround, hSpeed: b.hSpeed,
    };
    const shot = this.weapon.tick(dt, now, inp, shooter, NO_SFX);
    inp.pressed.clear();
    this.syncTransform();
    if (shot) {
      this.flashT = 0.05;
      this.burstLeft--;
      ctx.onShot(this, shot);
    }
  }

  // hitboxes follow the simulated position (render interpolates on top)
  syncTransform() {
    this.group.position.copy(this.body.pos);
    this.group.rotation.y = this.aimYaw + Math.PI; // model faces +Z
    this.group.updateMatrixWorld();
  }

  render(alpha, dt) {
    this.group.position.lerpVectors(this.body.prevPos, this.body.pos, alpha);
    this.pose(this.aimYaw, this.body.hSpeed, this.alive, false, dt);
  }

  // interpolated view for the spectator camera
  viewAngles(alpha) {
    const dy = Math.atan2(Math.sin(this.aimYaw - this.prevAimYaw), Math.cos(this.aimYaw - this.prevAimYaw));
    return [this.prevAimYaw + dy * alpha, this.prevAimPitch + (this.aimPitch - this.prevAimPitch) * alpha];
  }

  eyeWorld(out) { const p = this.body.pos; return out.set(p.x, p.y + MOVE.standEye, p.z); }
}
