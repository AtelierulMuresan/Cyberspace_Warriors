import * as THREE from 'three';
import { MOVE } from './config.js';

const EPS = 0.001;

// Source-style kinematic player: ground friction + acceleration, air strafing,
// crouch-jumping, step-up, and axis-separated AABB collision against world boxes.
export class Player {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.height = MOVE.standHeight;
    this.eye = MOVE.standEye;
    this.prevEye = this.eye;
    this.crouching = false;
    this.onGround = false;
    this.jumpBuffer = 0;
    this.stepTimer = 0;
    this.stopStart = -1;   // counter-strafe timer
    this.lastStopMs = 0;
    this.walking = false;
    this.speedScale = 1; // < 1 while aiming down sights
    this.landDip = 0;
    this.spawn();
  }

  spawn() { this.spawnAt(this.world.spawn, this.world.spawnYaw); }

  spawnAt(pos, yaw) {
    this.pos.copy(pos);
    this.prevPos.copy(pos);
    this.vel.set(0, 0, 0);
    this.onGround = true;
    this.yaw = yaw;
    this.pitch = 0;
    this.stand();
    this.eye = this.prevEye = MOVE.standEye;
  }

  get hSpeed() { return Math.hypot(this.vel.x, this.vel.z); }

  overlaps(px, py, pz, h) {
    const r = MOVE.radius;
    for (const b of this.world.boxes) {
      if (px + r > b.min.x + EPS && px - r < b.max.x - EPS &&
          py + h > b.min.y + EPS && py < b.max.y - EPS &&
          pz + r > b.min.z + EPS && pz - r < b.max.z - EPS) return b;
    }
    return null;
  }

  tick(dt, now, input, sfx) {
    this.prevPos.copy(this.pos);
    this.prevEye = this.eye;
    const k = c => input.keys.has(c);

    // wish direction from yaw
    const fwd = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0);
    const side = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    let wx = -s * fwd + c * side, wz = -c * fwd - s * side;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }

    // counter-strafe timer starts from the speed at the start of this tick
    const hs0 = this.hSpeed;
    const pushing = wl > 0 && (this.vel.x * wx + this.vel.z * wz) > 0.1 * hs0;
    if (this.stopStart < 0 && hs0 / MOVE.runSpeed > 0.85 && !pushing && this.onGround) this.stopStart = now - dt;

    this.updateCrouch(k('KeyC') || k('ControlLeft'));

    if (input.consume('Space') || input.consume('Wheel')) this.jumpBuffer = 0.1;
    else this.jumpBuffer -= dt;

    this.walking = k('ShiftLeft') || k('ShiftRight');
    const maxSpeed = (this.crouching ? MOVE.crouchSpeed : this.walking ? MOVE.walkSpeed : MOVE.runSpeed) * this.speedScale;
    const wasGround = this.onGround;
    let jumped = false;

    if (this.onGround && this.jumpBuffer > 0) {
      this.vel.y = MOVE.jumpVelocity;
      this.onGround = false;
      this.jumpBuffer = 0;
      jumped = true;
    }

    if (this.onGround) {
      this.friction(dt);
      this.accelerate(wx, wz, wl > 0 ? maxSpeed : 0, MOVE.groundAccel, dt, maxSpeed);
    } else {
      this.accelerate(wx, wz, wl > 0 ? Math.min(maxSpeed, MOVE.airSpeedCap) : 0, MOVE.airAccel, dt, maxSpeed);
    }

    this.vel.y -= MOVE.gravity * dt;
    const fallSpeed = this.vel.y;
    this.onGround = false;
    const canStep = wasGround && !jumped;
    this.moveAxis('x', this.vel.x * dt, canStep);
    this.moveAxis('z', this.vel.z * dt, canStep);
    this.moveAxis('y', this.vel.y * dt, false);

    const eyeTarget = this.crouching ? MOVE.crouchEye : MOVE.standEye;
    this.eye += (eyeTarget - this.eye) * Math.min(1, dt * 14);

    // sounds
    if (!wasGround && this.onGround && fallSpeed < -5) sfx.land();
    if (!wasGround && this.onGround) this.landDip = Math.min(0.14, -fallSpeed * 0.016); // camera dips on landing
    const hs = this.hSpeed;
    if (this.onGround && !this.crouching && !this.walking && hs > 3.4) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) { sfx.step(); this.stepTimer = 0.36; }
    } else this.stepTimer = Math.min(this.stepTimer, 0.1);

    // ...and ends when speed drops into the accurate band
    const frac = hs / MOVE.runSpeed;
    if (this.stopStart >= 0) {
      if (pushing || !this.onGround) this.stopStart = -1;
      else if (frac <= MOVE.accurateFraction) {
        this.lastStopMs = (now - this.stopStart) * 1000;
        this.stopStart = -1;
      }
    }

    if (this.pos.y < -20) this.spawn();
  }

  updateCrouch(want) {
    const diff = MOVE.standHeight - MOVE.crouchHeight;
    if (want && !this.crouching) {
      this.crouching = true;
      this.height = MOVE.crouchHeight;
      // crouch-jump: tuck legs up while airborne
      if (!this.onGround && !this.overlaps(this.pos.x, this.pos.y + diff, this.pos.z, this.height)) {
        this.pos.y += diff;
        this.eye -= diff;
      }
    } else if (!want && this.crouching) {
      if (this.onGround) {
        if (!this.overlaps(this.pos.x, this.pos.y, this.pos.z, MOVE.standHeight)) this.stand();
      } else if (!this.overlaps(this.pos.x, this.pos.y - diff, this.pos.z, MOVE.standHeight)) {
        this.pos.y -= diff;
        this.eye += diff;
        this.stand();
      } else if (!this.overlaps(this.pos.x, this.pos.y, this.pos.z, MOVE.standHeight)) {
        this.stand();
      }
    }
  }

  stand() { this.crouching = false; this.height = MOVE.standHeight; }

  accelerate(wx, wz, wishSpeed, accel, dt, accelBase) {
    if (wishSpeed <= 0) return;
    const cur = this.vel.x * wx + this.vel.z * wz;
    const add = wishSpeed - cur;
    if (add <= 0) return;
    const a = Math.min(accel * accelBase * dt, add);
    this.vel.x += a * wx;
    this.vel.z += a * wz;
  }

  friction(dt) {
    const sp = this.hSpeed;
    if (sp < 0.01) { this.vel.x = this.vel.z = 0; return; }
    const drop = Math.max(sp, MOVE.stopSpeed) * MOVE.friction * dt;
    const ns = Math.max(0, sp - drop) / sp;
    this.vel.x *= ns;
    this.vel.z *= ns;
  }

  moveAxis(axis, d, canStep) {
    if (d === 0) return;
    const p = this.pos;
    p[axis] += d;
    for (let iter = 0; iter < 4; iter++) {
      const b = this.overlaps(p.x, p.y, p.z, this.height);
      if (!b) return;
      if (axis === 'y') {
        if (d < 0) { p.y = b.max.y; this.onGround = true; }
        else p.y = b.min.y - this.height;
        this.vel.y = 0;
      } else {
        const rise = b.max.y - p.y;
        if (canStep && rise > 0 && rise <= MOVE.stepHeight && !this.overlaps(p.x, b.max.y, p.z, this.height)) {
          p.y = b.max.y;
          this.eye -= rise; // keep the camera smooth on stairs
          continue;
        }
        p[axis] = d > 0 ? b.min[axis] - MOVE.radius : b.max[axis] + MOVE.radius;
        this.vel[axis] = 0;
      }
    }
  }
}
