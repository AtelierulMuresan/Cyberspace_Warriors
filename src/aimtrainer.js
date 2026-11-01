import * as THREE from 'three';
import { toon } from './render.js';

export const DRILLS = {
  gridshot: { name: 'GRIDSHOT', time: 60, desc: 'Three targets on a 5 × 4 grid. Clear them as fast and cleanly as you can.' },
  flick: { name: 'FLICK', time: 60, desc: 'One small target at a time, anywhere in a wide arc. Scores hits and reaction time.' },
  tracking: { name: 'TRACKING', time: 45, desc: 'Keep your crosshair on a target that strafes like a player. Scores time on target.' },
};

const BEST_KEY = 'neon-static.best';
export function loadBest() { try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch { return {}; } }
function saveBest(b) { try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch { /* storage blocked */ } }

const sphere = new THREE.IcosahedronGeometry(1, 2);
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x040208, side: THREE.BackSide });
const COUNTDOWN = 3;

/*
  Drill runner for the aim lab. States: idle -> countdown -> live -> done.
  The player stands still (movement is locked in main); score rules per drill:
    gridshot  100 per hit, accuracy shown separately
    flick     100 per hit minus reaction ms / 10, so faster hits score more
    tracking  % of live time with the crosshair on the target, × 100
*/
export class AimTrainer {
  constructor(scene, drillId, hooks) {
    this.scene = scene;
    this.id = DRILLS[drillId] ? drillId : 'gridshot';
    this.drill = DRILLS[this.id];
    this.hooks = hooks;
    this.mat = toon(0xff3fb4);
    this.mat.emissive.set(0x40102a);
    this.targets = [];
    this.ray = new THREE.Raycaster();
    this.state = 'idle';
    this.eye = new THREE.Vector3(0, 1.64, 6);
  }

  makeTarget(pos, r) {
    const m = new THREE.Mesh(sphere, this.mat);
    m.scale.setScalar(r);
    m.position.copy(pos);
    const line = new THREE.Mesh(sphere, outlineMat);
    line.scale.setScalar(1.08);
    m.add(line);
    m.userData.born = this.now;
    this.scene.add(m);
    m.updateMatrixWorld();
    this.targets.push(m);
    return m;
  }

  clearTargets() { for (const t of this.targets) t.removeFromParent(); this.targets = []; }

  start(now) {
    this.clearTargets();
    Object.assign(this, { state: 'countdown', liveAt: now + COUNTDOWN, now, shots: 0, hits: 0, score: 0, reactions: [], onTarget: 0, liveTime: 0, nextFlick: 0 });
    this.hooks.banner(this.drill.name, 'Get ready', COUNTDOWN);
  }

  // ---------- spawning ----------
  gridCell() { // a free cell on the 5 × 4 wall grid, 10 m out
    for (;;) {
      const x = -4 + ((Math.random() * 5) | 0) * 2, y = 1 + ((Math.random() * 4) | 0) * 1.1;
      if (!this.targets.some(t => Math.abs(t.position.x - x) < 0.1 && Math.abs(t.position.y - y) < 0.1)) return new THREE.Vector3(x, y, -4);
    }
  }

  flickSpot() { // anywhere in a ±55° by -8..+25° arc, 12 m out
    const yaw = (Math.random() * 2 - 1) * 0.96, pitch = -0.14 + Math.random() * 0.58;
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    return this.eye.clone().addScaledVector(dir, 12);
  }

  // ---------- per tick ----------
  tick(dt, now, viewDir) {
    this.now = now;
    if (this.state === 'countdown' && now >= this.liveAt) {
      this.state = 'live';
      this.endAt = now + this.drill.time;
      if (this.id === 'gridshot') for (let i = 0; i < 3; i++) this.makeTarget(this.gridCell(), 0.4);
      if (this.id === 'tracking') {
        this.track = this.makeTarget(new THREE.Vector3(0, 1.6, -6), 0.45);
        Object.assign(this, { vx: 5, turnAt: now + 0.6 });
      }
    }
    if (this.state !== 'live') return;
    if (now >= this.endAt) return this.finish();

    if (this.id === 'flick' && !this.targets.length && now >= this.nextFlick) this.makeTarget(this.flickSpot(), 0.28);

    if (this.id === 'tracking') { // ADAD-like strafes with random turns
      const t = this.track;
      if (now >= this.turnAt || Math.abs(t.position.x) > 6) {
        this.vx = (t.position.x > 4 ? -1 : t.position.x < -4 ? 1 : Math.sign(Math.random() - 0.5)) * (3.5 + Math.random() * 3);
        this.turnAt = now + 0.3 + Math.random() * 0.9;
      }
      t.position.x += this.vx * dt;
      t.position.y = 1.6 + Math.sin(now * 1.7) * 0.4;
      t.updateMatrixWorld();
      this.ray.set(this.eye, viewDir);
      this.liveTime += dt;
      if (this.ray.intersectObject(t, false).length) this.onTarget += dt;
      this.score = Math.round((this.onTarget / this.liveTime) * 100 * 100) / 100;
    }
  }

  // a fired shot; returns the hit point or null
  shot(origin, dir) {
    if (this.state !== 'live' || this.id === 'tracking') return null;
    this.shots++;
    this.ray.set(origin, dir);
    const h = this.ray.intersectObjects(this.targets, false)[0];
    if (!h) return null;
    const t = h.object;
    this.hits++;
    this.targets.splice(this.targets.indexOf(t), 1);
    t.removeFromParent();
    if (this.id === 'gridshot') { this.score += 100; this.makeTarget(this.gridCell(), 0.4); }
    else { // flick
      const ms = (this.now - t.userData.born) * 1000;
      this.reactions.push(ms);
      this.score += Math.max(10, Math.round(100 - ms / 10));
      this.nextFlick = this.now + 0.25;
    }
    return h.point;
  }

  finish() {
    this.state = 'done';
    this.clearTargets();
    const r = this.result(), best = loadBest(), prev = best[this.id];
    const record = !prev || r.score > prev.score;
    if (record) { best[this.id] = r; saveBest(best); }
    this.hooks.done(r, record, prev);
  }

  result() {
    const acc = this.shots ? Math.round((this.hits / this.shots) * 100) : 0;
    const avgMs = this.reactions?.length ? Math.round(this.reactions.reduce((a, b) => a + b, 0) / this.reactions.length) : null;
    return { score: Math.round(this.score), hits: this.hits, acc, avgMs, onTarget: this.id === 'tracking' ? Math.round(this.score) : null };
  }

  view() {
    const left = this.state === 'live' ? Math.max(0, this.endAt - this.now) : this.state === 'countdown' ? this.drill.time : 0;
    return { name: this.drill.name, left, ...this.result(), tracking: this.id === 'tracking', state: this.state };
  }
}
