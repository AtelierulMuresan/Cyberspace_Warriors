import * as THREE from 'three';
import { Weapon } from './weapon.js';
import { WEAPONS, UTIL } from './config.js';

const hitPoint = new THREE.Vector3();
const UTIL_ORDER = ['emp', 'smoke', 'fire', 'decoy'];

// The player as a combatant. Shares its interface with Bot so the match treats both alike:
// name, team, side, alive, hp, armor, helmet, credits, pos, hSpeed, headPoint, chestPoint, rayHit.
// Slots: 1 primary, 2 secondary (pistol), 3 melee (knife), 4 utility (cycles through carried throwables).
export class Human {
  constructor(player, vmScene) {
    this.isHuman = true;
    this.name = 'YOU';
    this.body = player;
    this.vmScene = vmScene;
    this.team = 0;
    this.side = 'attack';
    this.hp = 100;
    this.armor = 0;
    this.helmet = false;
    this.alive = true;
    this.credits = 0;
    this.kills = 0;
    this.deaths = 0;
    this.using = null;
    this.useT = 0;
    this.primary = null;
    this.secondary = new Weapon(WEAPONS.vox9, vmScene);
    this.knife = new Weapon(WEAPONS.knife, vmScene);
    this.util = { emp: 0, smoke: 0, fire: 0, decoy: 0 };
    this.utilWeapons = {};
    this.weapon = this.secondary;
    this.boxes = { head: new THREE.Box3(), chest: new THREE.Box3(), legs: new THREE.Box3() };
  }

  get pos() { return this.body.pos; }
  get hSpeed() { return this.body.hSpeed; }
  get utilCount() { return UTIL_ORDER.reduce((n, k) => n + this.util[k], 0); }

  headPoint(out) { const p = this.body.pos; return out.set(p.x, p.y + this.body.eye + 0.02, p.z); }
  chestPoint(out) { const p = this.body.pos; return out.set(p.x, p.y + (this.body.crouching ? 0.8 : 1.15), p.z); }

  rayHit(raycaster) {
    const p = this.body.pos, b = this.boxes;
    const headY = p.y + this.body.eye + 0.02, chestLow = p.y + (this.body.crouching ? 0.55 : 0.85);
    b.head.min.set(p.x - 0.13, headY - 0.13, p.z - 0.13);
    b.head.max.set(p.x + 0.13, headY + 0.13, p.z + 0.13);
    b.chest.min.set(p.x - 0.26, chestLow, p.z - 0.16);
    b.chest.max.set(p.x + 0.26, headY - 0.13, p.z + 0.16);
    b.legs.min.set(p.x - 0.18, p.y, p.z - 0.13);
    b.legs.max.set(p.x + 0.18, chestLow, p.z + 0.13);
    let best = null;
    for (const [zone, box] of Object.entries(b)) {
      if (!raycaster.ray.intersectBox(box, hitPoint)) continue;
      const distance = hitPoint.distanceTo(raycaster.ray.origin);
      if (distance <= raycaster.far && (!best || distance < best.distance)) best = { distance, zone, point: hitPoint.clone() };
    }
    return best;
  }

  equip(w, now) {
    if (!w || w === this.weapon) return;
    if (this.weapon.def.slot !== 'utility') this.lastGun = this.weapon;
    this.weapon = w;
    w.draw(now);
  }

  select(slot, now) {
    if (slot === 'primary') this.equip(this.primary, now);
    else if (slot === 'secondary') this.equip(this.secondary, now);
    else if (slot === 'melee') this.equip(this.knife, now);
    else if (slot === 'utility') { // cycle to the next carried kind
      const cur = this.weapon.def.kind;
      const start = cur ? UTIL_ORDER.indexOf(cur) + 1 : 0;
      for (let i = 0; i < 4; i++) {
        const k = UTIL_ORDER[(start + i) % 4];
        if (this.util[k] > 0) return this.equip(this.utilWeapon(k), now);
      }
    }
  }

  utilWeapon(kind) { return (this.utilWeapons[kind] ??= new Weapon(WEAPONS['util_' + kind], this.vmScene)); }

  // after a throw: next of the same kind, else back to the last gun
  thrown(kind, now) {
    this.util[kind]--;
    if (this.util[kind] <= 0) this.equip(this.lastGun ?? this.primary ?? this.secondary, now);
  }

  // weapon = a def plus optional ammo state (from a pickup)
  give(def, now, ammo) {
    if (def.slot !== 'primary') return;
    this.primary?.dispose();
    this.primary = new Weapon(def, this.vmScene);
    if (ammo) { this.primary.mag = ammo.mag; this.primary.reserve = ammo.reserve; }
    this.weapon = this.primary;
    this.primary.draw(now);
  }

  // hands over the primary as {def, mag, reserve} and drops it from the loadout
  takePrimary(now) {
    const w = this.primary;
    if (!w) return null;
    const out = { def: w.def, mag: w.mag, reserve: w.reserve };
    w.dispose();
    this.primary = null;
    if (this.weapon === w) this.equip(this.secondary, now);
    if (this.lastGun === w) this.lastGun = this.secondary;
    return out;
  }

  // dead players (and everyone at halftime) start the next round with a pistol and knife only
  resetLoadout(now) {
    this.primary?.dispose();
    this.primary = null;
    this.secondary.refill();
    this.weapon = this.secondary;
    this.lastGun = this.secondary;
    this.secondary.draw(now);
    this.armor = 0;
    this.helmet = false;
    for (const k of UTIL_ORDER) this.util[k] = 0;
  }

  syncViewmodels(hideAll = false) {
    const all = [this.primary, this.secondary, this.knife, ...Object.values(this.utilWeapons)];
    for (const w of all) if (w?.vm) w.vm.visible = !hideAll && this.alive && w === this.weapon;
  }

  slotView() {
    return {
      active: this.weapon.def.slot,
      primary: this.primary?.def.name ?? null,
      secondary: this.secondary.def.name,
      util: UTIL_ORDER.filter(k => this.util[k] > 0).map(k => `${UTIL[k].name.split(' ')[0]}${this.util[k] > 1 ? '×' + this.util[k] : ''}`),
      utilActive: this.weapon.def.kind ?? null,
    };
  }
}
