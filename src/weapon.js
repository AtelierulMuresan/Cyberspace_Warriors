import * as THREE from 'three';
import { toon, neon, outlinedBox, PALETTE } from './render.js';
import { glowTex } from './fx.js';
import { MOVE, TICK } from './config.js';

const DEG = Math.PI / 180;
const DRAW_TIME = 0.45;

// Hip and ADS viewmodel positions per model (camera space, metres).
const VM_POSE = {
  pistol: { hip: [0.17, -0.16, -0.36], ads: [0, -0.031, -0.3] },
  rifle: { hip: [0.2, -0.21, -0.42], ads: [0, -0.077, -0.3] },
  smg: { hip: [0.19, -0.19, -0.38], ads: [0, -0.066, -0.28] },
  shotgun: { hip: [0.2, -0.2, -0.44], ads: [0, -0.06, -0.32] },
  marksman: { hip: [0.2, -0.21, -0.44], ads: [0, -0.1, -0.3] },
  knife: { hip: [0.2, -0.2, -0.36], ads: [0.2, -0.2, -0.36] },
  grenade: { hip: [0.18, -0.2, -0.34], ads: [0.18, -0.2, -0.34] },
};

export class Weapon {
  constructor(def, vmScene) {
    this.def = def;
    this.mag = def.mag ?? 0;
    this.reserve = def.reserve ?? 0;
    this.nextFire = 0;
    this.reloading = false;
    this.reloadStart = 0;
    this.reloadEnd = 0;
    this.heat = 0;      // position along the spray pattern
    this.bloom = 0;
    this.lastShot = -1;
    this.drawStart = -10;
    this.swingT = -10;  // melee / throw animation start
    this.swingHeavy = false;
    this.viewPunch = new THREE.Vector2(); // x = yaw, y = pitch (rad)
    this.kick = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.bobT = 0;
    this.flashT = 0;
    this.adsT = 0;      // 0 = hip, 1 = fully aimed down sights
    this.vm = null;
    if (vmScene) this.buildViewmodel(vmScene); // bots carry guns without a viewmodel
  }

  refill() {
    this.mag = this.def.mag ?? 0;
    this.reserve = this.def.reserve ?? 0;
    this.reloading = false;
    this.heat = 0;
    this.bloom = 0;
  }

  drawing(now) { return now - this.drawStart < DRAW_TIME; }

  // switching to this weapon: short delay before it can fire
  draw(now) {
    this.reloading = false;
    this.adsT = 0;
    this.drawStart = now;
    this.nextFire = Math.max(this.nextFire, now + DRAW_TIME);
  }

  dispose() { this.vm?.removeFromParent(); }

  // eased ADS amount, used for zoom and viewmodel placement
  get ads() { const t = this.adsT; return t * t * (3 - 2 * t); }

  patternAt(h) {
    const p = this.def.recoil.pattern;
    if (h <= 0) return [0, 0];
    const i = Math.floor(h), f = h - i;
    const a = p[Math.min(i, p.length - 1)], b = p[Math.min(i + 1, p.length - 1)];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }

  // aiming tightens the standing/crouching cone only; moving and jumping stay inaccurate
  spread(player) {
    const sp = this.def.spread, adsMul = 1 - (1 - (this.def.adsSpread ?? 0.55)) * this.adsT;
    let s = (player.crouching && player.onGround ? sp.crouch : sp.stand) * adsMul;
    if (!player.onGround) s += sp.air;
    else {
      const f = player.hSpeed / MOVE.runSpeed, acc = MOVE.accurateFraction;
      if (f > acc) s += sp.move * Math.min(1, (f - acc) / (1 - acc));
    }
    return s + this.bloom;
  }

  startReload(now, sfx) {
    if (this.def.melee || this.def.throwable) return;
    if (this.reloading || this.mag === this.def.mag || this.reserve === 0) return;
    this.reloading = true;
    this.reloadStart = now;
    this.reloadEnd = now + this.def.reloadTime;
    this.adsT = 0;
    sfx.reload();
  }

  // Runs at the fixed sim rate. Returns the shot (angles, pellets, melee or throw), or null.
  tick(dt, now, input, player, sfx) {
    const d = this.def;

    if (d.melee) { // LMB light slash (held repeats), RMB heavy stab
      const heavy = input.consume('Mouse2'), light = input.consume('Mouse0') || input.mouseDown;
      if (now < this.nextFire || (!light && !heavy)) return null;
      const m = heavy ? d.heavy : d.light;
      this.nextFire = now + m.time;
      this.swingT = now;
      this.swingHeavy = heavy;
      sfx.swish?.();
      return { melee: true, heavy, yaw: player.yaw, pitch: player.pitch };
    }
    if (d.throwable) { // LMB long throw, RMB short lob
      const far = input.consume('Mouse0'), near = input.consume('Mouse2');
      if (now < this.nextFire || (!far && !near)) return null;
      this.nextFire = now + 0.6;
      this.swingT = now;
      return { throw: far ? 'far' : 'near', kind: d.kind, yaw: player.yaw, pitch: player.pitch };
    }

    this.bloom = Math.max(0, this.bloom - d.spread.bloomRecover * dt);
    if (now - this.lastShot > d.recoil.recoverDelay) this.heat = Math.max(0, this.heat - d.recoil.recoverRate * dt);

    if (this.reloading && now >= this.reloadEnd) {
      const n = Math.min(d.mag - this.mag, this.reserve);
      this.mag += n;
      this.reserve -= n;
      this.reloading = false;
    }
    if (input.consume('KeyR')) this.startReload(now, sfx);

    const pressed = input.consume('Mouse0');
    if (!input.mouseDown || this.reloading || now < this.nextFire) return null;
    if (!d.auto && !pressed) return null; // semi-auto: one shot per click
    if (this.mag <= 0) {
      if (pressed) { sfx.click(); this.startReload(now, sfx); }
      return null;
    }

    if (this.nextFire < now - TICK) this.nextFire = now;
    this.nextFire += 60 / d.rpm;

    const [px, py] = this.patternAt(this.heat);
    const s = this.spread(player);
    const r = s * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
    const yaw = player.yaw - px * DEG + Math.cos(a) * r;
    const pitch = player.pitch + py * DEG + Math.sin(a) * r;
    const shot = { yaw, pitch };
    if (d.pellets) { // shotgun: a fixed cone around the aimed direction
      shot.pellets = [];
      for (let i = 0; i < d.pellets; i++) {
        const pr = d.pelletSpread * Math.sqrt(Math.random()), pa = Math.random() * Math.PI * 2;
        shot.pellets.push({ yaw: yaw + Math.cos(pa) * pr, pitch: pitch + Math.sin(pa) * pr });
      }
    }

    this.heat += 1;
    this.bloom = Math.min(d.spread.maxBloom, this.bloom + d.spread.perShot);
    this.mag--;
    this.lastShot = now;
    this.kick = Math.min(this.kick + (d.pellets || d.scope ? 2 : 1), 2.6);
    this.flashT = 0.05;
    if (d.scope) this.adsT = 0; // bolt cycle drops the scope
    sfx.shot(null, d.model);
    return shot;
  }

  // Camera shows part of the recoil punch; smoothed per render frame.
  updateView(dt) {
    const [px, py] = this.patternAt(this.heat);
    const vf = this.def.recoil.viewFraction;
    const t = 1 - Math.exp(-dt * 30);
    this.viewPunch.x += (-px * DEG * vf - this.viewPunch.x) * t;
    this.viewPunch.y += (py * DEG * vf - this.viewPunch.y) * t;
  }

  buildViewmodel(vmScene) {
    const body = toon(0x3d3752), accent = toon(0x5e4d8a), glove = toon(0x2a2236);
    const g = new THREE.Group();
    const part = (w, h, d, x, y, z, mat, rx = 0) => {
      const m = outlinedBox(w, h, d, mat, 0.006);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      g.add(m);
      return m;
    };
    const glow = (w, h, d, x, y, z, color = PALETTE.cyan, boost = 1.1) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), neon(color, boost));
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    const sightDot = (x, y, z) => glow(0.004, 0.004, 0.004, x, y, z, PALETTE.magenta, 1.6);
    const holoSight = (y, z) => { // open frame with a floating dot; the dot sits at height y
      part(0.034, 0.012, 0.07, 0, y - 0.026, z + 0.02, accent);
      for (const x of [-0.018, 0.018]) part(0.004, 0.04, 0.004, x, y, z, accent);
      part(0.04, 0.004, 0.004, 0, y + 0.022, z, accent);
      sightDot(0, y, z);
    };
    const hands = (front, back) => {
      if (front) part(0.085, 0.06, 0.11, 0, front[0], front[1], glove);
      if (back) part(0.08, 0.07, 0.09, 0, back[0], back[1], glove);
    };

    let muzzleZ = -0.5, flashSize = 0.2;
    switch (this.def.model) {
      case 'pistol':
        part(0.045, 0.05, 0.2, 0, 0, -0.02, body);
        part(0.04, 0.035, 0.17, 0, -0.035, -0.01, accent);
        part(0.038, 0.1, 0.05, 0, -0.08, 0.06, body, -0.25);
        part(0.07, 0.07, 0.09, 0, -0.1, 0.08, glove);
        glow(0.047, 0.006, 0.1, 0, 0.026, -0.04, PALETTE.cyan, 0.5);
        sightDot(0, 0.031, -0.11);
        muzzleZ = -0.14; flashSize = 0.14;
        break;
      case 'smg':
        part(0.06, 0.08, 0.32, 0, 0, 0, body);
        part(0.026, 0.026, 0.12, 0, 0.012, -0.22, body);
        part(0.04, 0.2, 0.05, 0, -0.14, -0.02, accent, 0.1);   // long mag
        part(0.04, 0.09, 0.05, 0, -0.08, 0.1, body, -0.3);
        part(0.05, 0.05, 0.14, 0, 0, 0.21, accent);            // folding stock
        glow(0.062, 0.004, 0.1, 0, 0.041, 0.02, PALETTE.cyan, 0.5);
        holoSight(0.066, -0.06);
        hands([-0.05, -0.12], [-0.09, 0.12]);
        muzzleZ = -0.3; flashSize = 0.16;
        break;
      case 'shotgun':
        part(0.07, 0.09, 0.36, 0, 0, 0.02, body);
        part(0.04, 0.04, 0.44, 0, 0.02, -0.3, body);           // barrel
        part(0.035, 0.03, 0.4, 0, -0.02, -0.28, accent);        // tube mag
        part(0.07, 0.06, 0.13, 0, -0.025, -0.24, accent);       // pump
        part(0.06, 0.11, 0.2, 0, -0.03, 0.27, body);            // stock
        part(0.04, 0.1, 0.05, 0, -0.09, 0.13, body, -0.3);
        glow(0.072, 0.006, 0.2, 0, 0.046, -0.02, PALETTE.amber);
        sightDot(0, 0.06, -0.48);
        hands([-0.06, -0.24], [-0.1, 0.15]);
        muzzleZ = -0.53; flashSize = 0.3;
        break;
      case 'marksman':
        part(0.07, 0.09, 0.46, 0, 0, 0, body);
        part(0.028, 0.028, 0.4, 0, 0.012, -0.42, body);         // long barrel
        part(0.05, 0.11, 0.07, 0, -0.1, 0.02, accent, 0.15);
        part(0.065, 0.12, 0.22, 0, -0.02, 0.3, body);
        part(0.04, 0.1, 0.05, 0, -0.09, 0.14, body, -0.3);
        part(0.045, 0.045, 0.26, 0, 0.1, -0.04, accent);        // scope tube
        part(0.06, 0.06, 0.04, 0, 0.1, -0.18, accent);
        part(0.056, 0.056, 0.04, 0, 0.1, 0.1, accent);
        glow(0.046, 0.046, 0.005, 0, 0.1, -0.2, PALETTE.cyan, 1.6); // lens glint
        hands([-0.055, -0.22], [-0.1, 0.16]);
        muzzleZ = -0.64; flashSize = 0.26;
        break;
      case 'knife':
        part(0.03, 0.035, 0.11, 0, 0, 0.04, body);              // handle
        part(0.05, 0.012, 0.02, 0, 0, -0.02, accent);           // guard
        glow(0.004, 0.03, 0.24, 0, 0.004, -0.15, PALETTE.cyan, 2); // monowire blade
        part(0.07, 0.07, 0.09, 0, -0.01, 0.06, glove);
        break;
      case 'grenade': {
        const shell = outlinedBox(0.06, 0.08, 0.06, toon(0x2a2236), 0.006);
        g.add(shell);
        glow(0.064, 0.012, 0.064, 0, 0.01, 0, this.def.color, 2);
        glow(0.012, 0.02, 0.012, 0, 0.05, 0, this.def.color, 2);
        part(0.08, 0.08, 0.09, 0, -0.045, 0.03, glove);
        break;
      }
      default: // rifle
        part(0.07, 0.09, 0.42, 0, 0, 0, body);
        part(0.075, 0.07, 0.2, 0, -0.005, -0.2, accent);
        part(0.03, 0.03, 0.22, 0, 0.015, -0.4, body);
        part(0.05, 0.16, 0.08, 0, -0.12, 0.02, accent, 0.2);
        part(0.06, 0.1, 0.18, 0, -0.02, 0.28, body);
        part(0.04, 0.1, 0.05, 0, -0.09, 0.13, body, -0.3);
        holoSight(0.077, -0.05);
        hands([-0.055, -0.2], [-0.1, 0.15]);
        glow(0.074, 0.006, 0.14, 0, 0.025, -0.2);
        muzzleZ = -0.53;
    }
    const pose = VM_POSE[this.def.model] ?? VM_POSE.rifle;
    this.vmBase = pose.hip;
    this.vmAds = pose.ads;

    const flashMat = new THREE.SpriteMaterial({
      map: glowTex, color: new THREE.Color(0xffc070).multiplyScalar(3),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    this.flash = new THREE.Sprite(flashMat);
    this.flash.position.set(0, 0.015, muzzleZ);
    this.flash.scale.setScalar(flashSize);
    this.flash.visible = false;
    g.add(this.flash);
    vmScene.add(g);
    this.vm = g;
  }

  animate(dt, now, player, input) {
    this.kick *= Math.exp(-dt * 16);
    const clamp = THREE.MathUtils.clamp;
    const tx = clamp(-input.lookDX * 0.00035, -0.04, 0.04);
    const ty = clamp(input.lookDY * 0.00035, -0.04, 0.04);
    const sm = Math.min(1, dt * 10);
    this.swayX += (tx - this.swayX) * sm;
    this.swayY += (ty - this.swayY) * sm;

    const hs = player.onGround ? player.hSpeed : 0;
    this.bobT += dt * hs * 1.9;
    const bob = Math.min(1, hs / MOVE.runSpeed);
    let rp = 0;
    if (this.reloading) rp = Math.sin(Math.min(1, (now - this.reloadStart) / this.def.reloadTime) * Math.PI);
    const drawDip = Math.max(0, 1 - (now - this.drawStart) / DRAW_TIME); // rises into view

    // melee slash / throw: a quick arc across the screen
    const swingLen = this.def.melee ? (this.swingHeavy ? 0.5 : 0.3) : 0.35;
    const sw = now - this.swingT < swingLen ? Math.sin(((now - this.swingT) / swingLen) * Math.PI) : 0;

    // blend hip -> sights; aiming steadies sway and bob
    const a = this.ads, steady = 1 - 0.75 * a, L = (h, s) => h + (s - h) * a;
    const bx = L(this.vmBase[0], this.vmAds[0]), by = L(this.vmBase[1], this.vmAds[1]), bz = L(this.vmBase[2], this.vmAds[2]);
    this.vm.position.set(
      bx + (this.swayX + Math.sin(this.bobT) * 0.012 * bob) * steady - sw * 0.14,
      by + (this.swayY - Math.abs(Math.cos(this.bobT)) * 0.01 * bob) * steady - rp * 0.07 - drawDip * 0.18 + (player.onGround ? 0 : 0.015 * steady) + sw * 0.05,
      bz + this.kick * (0.035 - 0.015 * a) - sw * (this.swingHeavy ? 0.12 : 0.05),
    );
    this.vm.rotation.set(
      this.kick * 0.05 * steady - rp * 0.9 - drawDip * 0.6 - sw * (this.def.throwable ? 1.2 : 0.3),
      this.swayX * 1.5 * steady + rp * 0.4 + sw * (this.def.melee ? 0.9 : 0),
      rp * 0.5 + sw * (this.def.melee ? 0.8 : 0),
    );

    this.flashT -= dt;
    const on = this.flashT > 0;
    this.flash.visible = on;
    if (on) this.flash.material.rotation = Math.random() * Math.PI;
  }
}
