import * as THREE from 'three';
import { UTIL, THROW, MOVE } from './config.js';
import { toon, neon, outlinedBox, PALETTE } from './render.js';
import { glowTex } from './fx.js';
import { PARTS } from './targets.js';

const R = 0.08; // grenade radius
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
// fire bypasses armour and multipliers; `dot` keeps hit markers quiet
const FIRE_DEF = { damage: UTIL.fire.damage, multipliers: { head: 1, chest: 1, legs: 1 }, rangeMod: 1, armorPen: 1, reward: 300, dot: true, short: 'FIRE' };

const puffGeo = new THREE.IcosahedronGeometry(1, 1);
const puffMat = toon(0x6a5f8c);
const puffOutline = new THREE.MeshBasicMaterial({ color: 0x0a0614, side: THREE.BackSide });

// distance from point c to segment ab
function segDist(a, b, c) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / len2));
  return Math.hypot(a.x + abx * t - c.x, a.y + aby * t - c.y, a.z + abz * t - c.z);
}

// A thrown grenade: gravity, bounces off map boxes, detonates per its kind's rule.
class Projectile {
  constructor(sys, owner, kind, pos, vel) {
    this.owner = owner; this.kind = kind; this.age = 0;
    this.pos = pos.clone(); this.vel = vel.clone();
    this.grounded = false; this.hitGround = false;
    const u = UTIL[kind];
    this.mesh = new THREE.Group();
    this.mesh.add(outlinedBox(0.12, 0.16, 0.12, toon(0x2a2236), 0.01));
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.13), neon(u.color, 2.2));
    this.mesh.add(band);
    this.mesh.position.copy(this.pos);
    sys.scene.add(this.mesh);
  }

  step(dt, boxes, sfx, spatial) {
    this.age += dt;
    const v = this.vel, p = this.pos;
    v.y -= THROW.gravity * dt;
    p.addScaledVector(v, dt);
    this.grounded = false;
    for (const b of boxes) {
      if (p.x + R <= b.min.x || p.x - R >= b.max.x || p.y + R <= b.min.y || p.y - R >= b.max.y || p.z + R <= b.min.z || p.z - R >= b.max.z) continue;
      // push out along the axis of least penetration and bounce
      const pen = [
        ['x', Math.min(p.x + R - b.min.x, b.max.x - (p.x - R)), p.x < (b.min.x + b.max.x) / 2 ? b.min.x - R : b.max.x + R],
        ['y', Math.min(p.y + R - b.min.y, b.max.y - (p.y - R)), p.y < (b.min.y + b.max.y) / 2 ? b.min.y - R : b.max.y + R],
        ['z', Math.min(p.z + R - b.min.z, b.max.z - (p.z - R)), p.z < (b.min.z + b.max.z) / 2 ? b.min.z - R : b.max.z + R],
      ].sort((a, c) => a[1] - c[1])[0];
      const [ax, , to] = pen;
      const speed = Math.abs(v[ax]);
      p[ax] = to;
      v[ax] *= -0.42;
      if (ax === 'y' && to > b.min.y) { // landed on a top face
        this.grounded = true;
        this.hitGround = true;
        v.x *= 0.7; v.z *= 0.7;
      }
      if (speed > 2) sfx.tone(1400 + Math.random() * 400, 0.04, 'triangle', 0.08, 0, 900, spatial(p, 30));
    }
    this.mesh.position.copy(p);
    this.mesh.rotation.x += v.length() * dt * 3;
  }

  get resting() { return this.grounded && this.vel.length() < 0.6; }
}

// Holo-decoy: a fake attacker hologram that fires fake shots. Enemy bots see it, chase it and shoot it.
class Decoy {
  constructor(sys, owner, pos) {
    this.sys = sys;
    this.isDecoy = true;
    this.name = 'DECOY';
    this.team = owner.team;
    this.owner = owner;
    this.alive = true;
    this.hSpeed = 0;
    this.pos = new THREE.Vector3(pos.x, pos.y, pos.z);
    this.until = sys.match.now + UTIL.decoy.duration;
    this.nextFake = sys.match.now + 0.4;
    const colour = owner.side === 'attack' ? 0xff3fb4 : 0x4a8ee8;
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).multiplyScalar(1.3), transparent: true, opacity: 0.55, depthWrite: false });
    this.group = new THREE.Group();
    this.parts = [];
    for (const [w, h, d, px, py, pz, zone] of PARTS) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(px, py, pz);
      m.userData.part = zone;
      this.group.add(m);
      this.parts.push(m);
    }
    this.group.position.copy(this.pos);
    this.group.rotation.y = Math.random() * Math.PI * 2;
    sys.scene.add(this.group);
    this.group.updateMatrixWorld(true);
  }
  headPoint(out) { return out.set(this.pos.x, this.pos.y + 1.66, this.pos.z); }
  chestPoint(out) { return out.set(this.pos.x, this.pos.y + 1.15, this.pos.z); }
  rayHit(raycaster) {
    const h = raycaster.intersectObjects(this.parts, false)[0];
    return h ? { distance: h.distance, zone: h.object.userData.part, point: h.point } : null;
  }
  update(now) {
    this.group.children.forEach((m, i) => { m.visible = Math.sin(now * 40 + i) > -0.9; }); // hologram flicker
    if (now >= this.until) return this.destroy();
    if (now >= this.nextFake) { // fake gunfire: sound, radar ping, alerts the enemy
      this.nextFake = now + 0.5 + Math.random() * 0.8;
      const m = this.sys.match;
      m.sfx.shot(m.spatial(this.pos, 120), 'rifle');
      this.firedUntil = now + 0.6;
      m.noise(this.pos, this.team, 45);
      m.fx.spark(tmp.set(this.pos.x, this.pos.y + 1.3, this.pos.z), 0xffc070, 0.3);
    }
  }
  destroy() {
    if (!this.alive) return;
    this.alive = false;
    this.group.removeFromParent();
    this.sys.match.fx.spark(tmp.set(this.pos.x, this.pos.y + 1, this.pos.z), 0xff3fb4, 1.2);
    this.sys.removeDecoy(this);
  }
}

export class Utilities {
  constructor(match) {
    this.match = match;
    this.scene = match.scene;
    this.projectiles = [];
    this.smokes = [];
    this.fires = [];
    this.decoys = [];
  }

  clear() {
    for (const p of this.projectiles) p.mesh.removeFromParent();
    for (const s of this.smokes) s.group.removeFromParent();
    for (const f of this.fires) f.group.removeFromParent();
    for (const d of [...this.decoys]) d.destroy();
    this.projectiles = []; this.smokes = []; this.fires = [];
  }

  // ---------- throwing ----------
  launch(owner, kind, origin, vel) {
    this.projectiles.push(new Projectile(this, owner, kind, origin, vel));
    this.match.sfx.burst(0.12, 1800, 400, 0.12, 0, this.match.spatial(origin, 25));
  }

  // the player throws along the view: LMB far, RMB near; inherits some movement
  throwHuman(h, shot) {
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(shot.pitch, shot.yaw, 0, 'YXZ'));
    const origin = h.headPoint(new THREE.Vector3()).addScaledVector(dir, 0.4);
    const vel = dir.multiplyScalar(shot.throw === 'far' ? THROW.far : THROW.near);
    vel.y += 2;
    vel.addScaledVector(h.body.vel, 0.5);
    this.launch(h, shot.kind, origin, vel);
  }

  // bots lob at a point on a 34° arc
  throwAt(bot, kind, target) {
    const o = bot.headPoint(new THREE.Vector3());
    const dx = target.x - o.x, dz = target.z - o.z, d = Math.hypot(dx, dz) || 1, th = 0.6;
    const v = Math.min(24, Math.max(5, Math.sqrt((THROW.gravity * d) / Math.sin(2 * th))));
    this.launch(bot, kind, o, new THREE.Vector3((dx / d) * v * Math.cos(th), v * Math.sin(th), (dz / d) * v * Math.cos(th)));
  }

  // ---------- per tick ----------
  update(dt, now) {
    const boxes = this.match.world.boxes, sfx = this.match.sfx, spatial = this.match.spatial;
    for (const p of [...this.projectiles]) {
      p.step(dt / 2, boxes, sfx, spatial); // two substeps keep fast throws out of walls
      p.step(dt / 2, boxes, sfx, spatial);
      const u = UTIL[p.kind];
      let go = p.age >= u.fuse;
      if (p.kind === 'smoke' || p.kind === 'decoy') go ||= p.resting && p.age > 0.4;
      if (p.kind === 'fire') go ||= p.hitGround && p.age > 0.15;
      if (go) this.detonate(p, now);
    }
    for (const s of [...this.smokes]) this.updateSmoke(s, now);
    for (const f of [...this.fires]) this.updateFire(f, dt, now);
    for (const d of [...this.decoys]) d.update(now);
  }

  detonate(p, now) {
    p.mesh.removeFromParent();
    this.projectiles.splice(this.projectiles.indexOf(p), 1);
    ({ emp: this.emp, smoke: this.smoke, fire: this.fire, decoy: this.decoy })[p.kind].call(this, p, now);
  }

  // airburst: blinds enemies who can see it, longer when looking straight at it
  emp(p, now) {
    const m = this.match, u = UTIL.emp;
    m.fx.spark(p.pos, u.color, 7);
    m.hooks.shake?.(p.pos, 0.6);
    m.sfx.tone(2400, 0.35, 'sawtooth', 0.25, 0, 300, m.spatial(p.pos, 60));
    m.sfx.burst(0.3, 8000, 2000, 0.2, 0, m.spatial(p.pos, 60));
    for (const c of m.enemies[p.owner.team]) {
      if (!c.alive || c.isDecoy) continue;
      const eye = c.headPoint(tmp);
      const d = eye.distanceTo(p.pos);
      if (d > u.radius || !m.los(p.pos, eye)) continue;
      const yaw = c.isHuman ? c.body.yaw : c.aimYaw, pitch = c.isHuman ? c.body.pitch : c.aimPitch;
      const fwd = tmp2.set(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
      const facing = fwd.dot(p.pos.clone().sub(eye).normalize());
      const dur = (facing > 0.5 ? 3.2 : facing > 0 ? 1.8 : 0.6) * (1 - 0.5 * d / u.radius);
      if (c.isHuman) m.hooks.emp?.(dur);
      else c.blindUntil = Math.max(c.blindUntil ?? 0, now + dur);
    }
  }

  smoke(p, now) {
    const u = UTIL.smoke, g = new THREE.Group();
    g.position.set(p.pos.x, p.pos.y - R, p.pos.z);
    const puffs = [];
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * u.radius * 0.7;
      const puff = new THREE.Mesh(puffGeo, puffMat);
      puff.position.set(Math.cos(a) * r, 0.6 + Math.random() * 2.8, Math.sin(a) * r);
      puff.userData.size = 1.1 + Math.random() * 0.9;
      const line = new THREE.Mesh(puffGeo, puffOutline);
      line.scale.setScalar(1.06);
      puff.add(line);
      puff.scale.setScalar(0.01);
      g.add(puff);
      puffs.push(puff);
    }
    this.scene.add(g);
    this.smokes.push({ group: g, puffs, pos: g.position.clone(), born: now, until: now + u.duration, grow: 0 });
    this.match.sfx.burst(1.2, 900, 200, 0.25, 0, this.match.spatial(g.position, 40));
    // smoke puts out fires it covers
    for (const f of [...this.fires]) if (Math.hypot(f.pos.x - g.position.x, f.pos.z - g.position.z) < u.radius + 1) this.endFire(f);
  }

  updateSmoke(s, now) {
    const life = now - s.born, left = s.until - now;
    s.grow = Math.min(1, life / 1.2) * Math.min(1, left / 1.5);
    for (const puff of s.puffs) puff.scale.setScalar(Math.max(0.01, puff.userData.size * s.grow));
    s.group.rotation.y += 0.002;
    if (left <= 0) { s.group.removeFromParent(); this.smokes.splice(this.smokes.indexOf(s), 1); }
  }

  fire(p, now) {
    const u = UTIL.fire, ground = this.groundBelow(p.pos);
    const g = new THREE.Group();
    g.position.set(p.pos.x, ground + 0.02, p.pos.z);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(u.radius, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a2a).multiplyScalar(1.4), transparent: true, opacity: 0.45, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    g.add(disc);
    const flames = [];
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: new THREE.Color(i % 3 ? 0xff7a3d : 0xff3fb4).multiplyScalar(2.2),
        blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      }));
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * u.radius;
      s.position.set(Math.cos(a) * r, 0.3, Math.sin(a) * r);
      s.userData.phase = Math.random() * 6;
      g.add(s);
      flames.push(s);
    }
    this.scene.add(g);
    this.fires.push({ group: g, flames, pos: g.position.clone(), owner: p.owner, until: now + u.duration, nextTick: now });
    this.match.sfx.burst(0.9, 3000, 300, 0.35, 0, this.match.spatial(g.position, 40));
  }

  updateFire(f, dt, now) {
    const u = UTIL.fire, m = this.match;
    for (const s of f.flames) {
      const k = 0.6 + 0.4 * Math.sin(now * 9 + s.userData.phase);
      s.scale.setScalar(0.5 + k * 0.7);
      s.position.y = 0.25 + k * 0.35;
    }
    if (now >= f.nextTick) {
      f.nextTick = now + u.tick;
      for (const c of m.enemies[f.owner.team]) {
        if (!c.alive || c.isDecoy || Math.abs(c.pos.y - f.pos.y) > 1.2) continue;
        if (Math.hypot(c.pos.x - f.pos.x, c.pos.z - f.pos.z) > u.radius) continue;
        m.applyDamage(f.owner, c, FIRE_DEF, 'chest', 0, tmp.set(c.pos.x, c.pos.y + 1, c.pos.z));
      }
    }
    if (now >= f.until) this.endFire(f);
  }

  endFire(f) {
    f.group.removeFromParent();
    const i = this.fires.indexOf(f);
    if (i >= 0) this.fires.splice(i, 1);
  }

  decoy(p) {
    const d = new Decoy(this, p.owner, { x: p.pos.x, y: this.groundBelow(p.pos), z: p.pos.z });
    this.decoys.push(d);
    for (let t = 0; t < 2; t++) if (t !== d.team) this.match.enemies[t].push(d);
  }

  removeDecoy(d) {
    this.decoys.splice(this.decoys.indexOf(d), 1);
    for (const list of this.match.enemies) { const i = list.indexOf(d); if (i >= 0) list.splice(i, 1); }
  }

  // ---------- queries ----------
  groundBelow(pos) {
    let y = 0;
    for (const b of this.match.world.boxes) {
      if (pos.x >= b.min.x && pos.x <= b.max.x && pos.z >= b.min.z && pos.z <= b.max.z && b.max.y <= pos.y + 0.3) y = Math.max(y, b.max.y);
    }
    return y;
  }

  // a deployed smoke blocks sight through its two stacked spheres
  blocksLos(a, b) {
    for (const s of this.smokes) {
      if (s.grow < 0.3) continue;
      const r = UTIL.smoke.radius * s.grow;
      if (segDist(a, b, tmp.set(s.pos.x, s.pos.y + 1.1, s.pos.z)) < r) return true;
      if (segDist(a, b, tmp.set(s.pos.x, s.pos.y + 2.8, s.pos.z)) < r) return true;
    }
    return false;
  }

  fireAt(pos) {
    return this.fires.find(f => Math.abs(pos.y - f.pos.y) < 1.2 && Math.hypot(pos.x - f.pos.x, pos.z - f.pos.z) < UTIL.fire.radius + 0.4);
  }

  radarDots(team) {
    const dots = [];
    for (const s of this.smokes) dots.push({ x: s.pos.x, z: s.pos.z, color: '#9a8cc8', r: UTIL.smoke.radius * s.grow });
    for (const f of this.fires) dots.push({ x: f.pos.x, z: f.pos.z, color: '#ff7a3d', r: UTIL.fire.radius });
    return dots;
  }
}
