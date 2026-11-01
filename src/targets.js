import * as THREE from 'three';
import { toon, neon, outlinedBox, PALETTE } from './render.js';
import { TARGET } from './config.js';

// [w, h, d, x, y, z, hit zone] — every box is also its own hitbox
export const PARTS = [
  [0.17, 0.86, 0.22, -0.1, 0.43, 0, 'legs'],
  [0.17, 0.86, 0.22, 0.1, 0.43, 0, 'legs'],
  [0.48, 0.62, 0.28, 0, 1.18, 0, 'chest'],
  [0.12, 0.58, 0.14, -0.31, 1.17, 0, 'chest'],
  [0.12, 0.58, 0.14, 0.31, 1.17, 0, 'chest'],
  [0.24, 0.26, 0.26, 0, 1.64, 0, 'head'],
];

// Ghostwire training mannequin. Movers: 'adad' (random strafes) or 'peek' (swings out from cover),
// both along world X unless mover.axis is 'z'. ry turns the mannequin (0 = facing +Z / south).
export class Dummy {
  constructor(scene, x, y, z, mover = null, ry = 0) {
    this.group = new THREE.Group();
    this.base = new THREE.Vector3(x, y, z);
    this.group.position.copy(this.base);
    this.group.rotation.order = 'YXZ'; // death fall is local to the facing
    this.group.rotation.y = ry;
    this.mat = toon(0xc0487a);
    this.headMat = toon(0x4a3f6a);
    this.parts = [];
    for (const [w, h, d, px, py, pz, zone] of PARTS) {
      const m = outlinedBox(w, h, d, zone === 'head' ? this.headMat : this.mat, 0.018);
      m.position.set(px, py, pz);
      m.userData.dummy = this;
      m.userData.part = zone;
      this.group.add(m);
      this.parts.push(m);
    }
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.02), neon(PALETTE.cyan, 2));
    visor.position.set(0, 1.66, 0.135);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.02), neon(PALETTE.magenta, 2));
    chest.position.set(0, 1.32, 0.145);
    this.group.add(visor, chest);
    scene.add(this.group);

    this.name = 'MANNEQUIN';
    this.hp = TARGET.hp;
    this.alive = true;
    this.deadT = 0;
    this.flash = 0;
    this.offset = 0;
    this.mover = mover && { ...mover, target: 0, wait: 0.5, state: 'hidden', t: 1 + Math.random() * 2 };
  }

  // Returns true when this hit kills.
  damage(amount) {
    this.hp -= amount;
    this.flash = 1;
    if (this.hp <= 0 && this.alive) { this.alive = false; this.deadT = 0; return true; }
    return false;
  }

  update(dt) {
    if (!this.alive) {
      this.deadT += dt;
      this.group.rotation.x = Math.max(-Math.PI / 2, this.group.rotation.x - dt * 7);
      if (this.deadT > TARGET.respawn) this.respawn();
    } else if (this.mover) this.move(dt);

    if (this.mover?.axis === 'z') this.group.position.z = this.base.z + this.offset;
    else this.group.position.x = this.base.x + this.offset;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.mat.emissive.setScalar(this.flash * 0.8);
    this.headMat.emissive.setScalar(this.flash * 0.8);
  }

  move(dt) {
    const m = this.mover;
    const toward = (goal, speed) => {
      const d = goal - this.offset, step = speed * dt;
      this.offset = Math.abs(d) <= step ? goal : this.offset + Math.sign(d) * step;
      return Math.abs(d) <= step;
    };
    if (m.type === 'adad') {
      if (m.wait > 0) { m.wait -= dt; return; }
      if (toward(m.target, m.speed)) {
        m.wait = 0.08 + Math.random() * 0.35;
        let nt;
        do nt = (Math.random() * 2 - 1) * m.amp; while (Math.abs(nt - this.offset) < 1.2);
        m.target = nt;
      }
    } else if (m.type === 'peek') {
      toward(m.state === 'out' ? m.out : 0, m.speed);
      m.t -= dt;
      if (m.t <= 0) {
        if (m.state === 'hidden') { m.state = 'out'; m.t = 0.7 + Math.random() * 0.6; }
        else { m.state = 'hidden'; m.t = 1.2 + Math.random() * 2.5; }
      }
    }
  }

  respawn() {
    this.alive = true;
    this.hp = TARGET.hp;
    this.group.rotation.x = 0;
    if (this.mover?.type === 'peek') { this.offset = 0; this.mover.state = 'hidden'; this.mover.t = 1 + Math.random() * 2; }
  }
}

// list entries: [x, y, z, mover?, ry?] as defined by each map
export function spawnTargets(scene, list) {
  return list.map(([x, y, z, mover, ry]) => new Dummy(scene, x, y, z, mover, ry));
}
