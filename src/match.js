import * as THREE from 'three';
import { ROUND, ECON, MATCH_LENGTH, WEAPONS, BOT, BOT_SKILL, SHOP, MOVE, UTIL, UTIL_MAX } from './config.js';
import { Bot } from './bots.js';
import { Utilities } from './utility.js';
import { neon, toon, outlinedBox, PALETTE } from './render.js';
import { buildGun } from './character.js';

export const SQUAD_NAMES = [['VEX', 'RIN', 'KADE', 'ONO', 'TAO'], ['NULL', 'HEX', 'SABLE', 'DRAX', 'MIRA']];
const PRICES = Object.fromEntries(SHOP.map(i => [i.id, i.price]));
const REASON = {
  elim: { attack: 'Defenders eliminated', defend: 'Attackers eliminated' },
  spike: { attack: 'Spike detonated' },
  purge: { defend: 'Spike purged' },
  time: { defend: 'Time expired' },
};
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), normal = new THREE.Vector3();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function buildSpikeMesh(scene) {
  const g = new THREE.Group();
  const body = outlinedBox(0.36, 0.16, 0.26, toon(0x2a2236), 0.012);
  body.position.y = 0.08;
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.2), neon(PALETTE.magenta, 2.5));
  light.position.y = 0.17;
  g.add(body, light);
  g.visible = false;
  scene.add(g);
  return { mesh: g, light };
}

// a primary lying on the ground
export function dropMesh(scene, def, x, y, z, ry) {
  const mesh = buildGun(def.model);
  mesh.position.set(x, y, z);
  mesh.rotation.set(0, ry, Math.PI / 2);
  scene.add(mesh);
  return mesh;
}

/*
  Round-based spike match between two squads. `human` is the player at this screen; `humans` is every
  player in the match (online: on the host). Bots fill the remaining slots of each squad.
  Sides swap at halftime: attackers wear Ghostwire colours and carry the spike, defenders wear Helix.
  Phases: buy (frozen) -> live -> post -> next round | over
*/
export class Match {
  constructor(o) {
    // o: { scene, world, nav, human, humans?, online?, sfx, fx, spatial, los, humanMuzzle, settings, hooks }
    // hooks.to(combatant) returns that player's feedback calls (banner, hit, hurt, ...)
    Object.assign(this, o);
    this.humans = o.humans ?? [this.human];
    if (!o.humans) this.human.team = 0;
    const onTeam = t => this.humans.filter(h => h.team === t).length;
    const size = THREE.MathUtils.clamp(Math.max(parseInt(o.settings.teamSize, 10) || 5, onTeam(0), onTeam(1)), 1, BOT.maxCount);
    const skill = BOT_SKILL[o.settings.diff] ?? BOT_SKILL.normal;
    this.len = MATCH_LENGTH[o.settings.length] ?? MATCH_LENGTH.short;
    this.ray = new THREE.Raycaster();

    this.botCtx = {
      world: this.world, sfx: this.sfx, spatial: this.spatial, los: this.los, match: this,
      enemiesOf: team => this.enemies[team],
      onShot: (bot, shot) => this.resolveShot(bot, shot),
      findCover: (bot, from) => this.findCover(bot, from),
      noise: (c, radius) => this.noise(c.pos, c.team, radius),
    };

    this.combatants = [...this.humans];
    for (let t = 0; t < 2; t++) {
      for (let i = onTeam(t); i < size; i++) {
        const b = new Bot(this.scene, this.nav, SQUAD_NAMES[t][i - onTeam(t)], t, skill, this.botCtx);
        b.isMate = t === this.human.team;
        if (b.isMate) b.setLabel(b.name);
        this.combatants.push(b);
      }
    }
    this.bots = this.combatants.filter(c => !c.isHuman);
    this.others = this.combatants.filter(c => c !== this.human);
    this.hist = [];
    this.enemies = [0, 1].map(t => this.combatants.filter(c => c.team !== t));
    this.teams = [0, 1].map(t => this.combatants.filter(c => c.team === t));

    this.sideOf = ['attack', 'defend']; // team index -> side
    this.score = [0, 0];
    this.lossStreak = [0, 0];
    this.round = 0;
    this.over = false;
    this.halftime = false;
    this.spike = { state: 'none', carrier: null, planter: null, pos: new THREE.Vector3(), plantedAt: 0, nextBeep: 0, ver: 0 };
    this.util = new Utilities(this);
    this.drops = [];
    this.now = 0;
    ({ mesh: this.spikeMesh, light: this.spikeLight } = buildSpikeMesh(this.scene));
    this.startRound(0, true);
  }

  get frozen() { return this.phase === 'buy'; }
  teamOn(side) { return this.sideOf.indexOf(side); }
  alive(team) { return this.teams[team].filter(c => c.alive).length; }

  to(c) { return this.hooks.to(c); }
  shakeAll(pos, intensity) { for (const h of this.humans) this.to(h).shake(pos, intensity); }

  // ---------- rounds ----------
  startRound(now, reset) {
    this.round++;
    this.dmgLog = new Map();
    this.util.clear();
    for (const d of this.drops) d.mesh.removeFromParent();
    this.drops = [];
    const sp = this.world.spawns, slot = [0, 0];
    for (const c of this.combatants) {
      const side = this.sideOf[c.team];
      if (reset) c.credits = ECON.start;
      if (reset || !c.alive) c.resetLoadout(now);
      c.side = side;
      const s = sp[side][slot[c.team]++], yaw = side === 'attack' ? sp.attackYaw : sp.defendYaw;
      if (c.left) { // disconnected: stays down
        Object.assign(c, { hp: 0, alive: false, using: null });
      } else if (c.isHuman) {
        c.body.spawnAt(tmp.set(s.x, 0, s.z), yaw);
        Object.assign(c, { hp: 100, alive: true, using: null, useT: 0 });
        c.primary?.refill();
        c.secondary.refill();
        c.avatar?.setSide(side);
        this.to(c).spawn(s.x, s.z, yaw);
      } else {
        c.setSide(side);
        c.spawnAt(s.x, s.z, yaw);
        c.weapon.refill();
      }
    }

    // plan: attackers split across the target site's routes, defenders take posts in order
    const sites = this.world.sites;
    this.targetSite = sites[(Math.random() * sites.length) | 0];
    this.plantedSite = null;
    this.alarmSite = null;
    this.rotator = null;
    this.intelVer = (this.intelVer ?? 0) + 1;
    const routes = this.world.routes[this.targetSite.name];
    let ai = (Math.random() * 2) | 0, di = 0, pi = 0;
    for (const b of this.bots) {
      b.postIdx = pi++;
      if (b.side === 'attack') b.route = routes[ai++ % routes.length];
      else {
        b.hold = this.world.holds[di++ % this.world.holds.length];
        b.holdsMid = !!b.hold.mid; // the mid post stays put on rotations
      }
      b.buy(PRICES);
    }

    const atk = this.teams[this.teamOn('attack')];
    const able = atk.filter(c => c.alive), carrier = able[(Math.random() * able.length) | 0] ?? atk[0];
    Object.assign(this.spike, { state: 'carried', carrier, planter: null });
    this.spike.ver++;
    this.spikeMesh.visible = false;

    this.phase = 'buy';
    this.phaseEnd = now + ROUND.buy;
    this.buyUntil = now + ROUND.buy + ROUND.buyWindow;
    for (const h of this.humans) {
      this.to(h).banner(`ROUND ${this.round}`, this.sideOf[h.team] === 'attack'
        ? `Attacking as Ghostwire${carrier === h ? ' · You carry the spike' : ` · ${carrier.name} carries the spike`}`
        : 'Defending as Helix · Stop the spike', 3);
    }
  }

  endRound(winner, reason) {
    if (this.phase !== 'live') return;
    const now = this.now, loser = 1 - winner;
    this.phase = 'post';
    this.phaseEnd = now + ROUND.post;
    this.score[winner]++;

    const lossBonus = Math.min(ECON.lossMax, ECON.lossBase + ECON.lossStep * this.lossStreak[loser]);
    const plantedLoss = this.sideOf[loser] === 'attack' && this.spike.planter ? ECON.plantLoss : 0;
    for (const c of this.teams[winner]) c.credits = Math.min(ECON.max, c.credits + ECON.win[reason]);
    for (const c of this.teams[loser]) c.credits = Math.min(ECON.max, c.credits + lossBonus + plantedLoss);
    this.lossStreak[winner] = 0;
    this.lossStreak[loser]++;

    const reasonText = REASON[reason][this.sideOf[winner]];
    this.over = this.score[winner] >= this.len.win;
    this.halftime = !this.over && this.round === this.len.half;
    if (this.halftime) this.phaseEnd = now + ROUND.halftimePost;
    for (const h of this.humans) {
      const mine = winner === h.team;
      let title = mine ? 'ROUND WON' : 'ROUND LOST', sub = reasonText;
      if (this.over) {
        title = mine ? 'MATCH WON' : 'MATCH LOST';
        sub = `${this.score[h.team]} – ${this.score[1 - h.team]} · Press Enter for a new match`;
      } else if (this.halftime) sub += ' · Halftime: switching sides';
      this.to(h).banner(title, sub, this.over ? 0 : ROUND.post);
      this.to(h).roundEnd(mine);
    }
  }

  checkWin(now) {
    const a = this.teamOn('attack'), d = 1 - a, planted = this.spike.state === 'planted';
    if (this.alive(d) === 0) return this.endRound(a, 'elim');
    if (this.alive(a) === 0 && !planted) return this.endRound(d, 'elim');
    if (!planted && now >= this.phaseEnd) return this.endRound(d, 'time');
  }

  tick(dt, now) {
    this.now = now;
    if (this.phase === 'buy' && now >= this.phaseEnd) {
      this.phase = 'live';
      this.phaseEnd = now + ROUND.live;
    }
    for (const h of this.humans) if (h.isRemote) h.netTick(this, dt, now);
    for (const b of this.bots) b.tick(dt, now, this.botCtx);
    if (this.online) { // lag compensation history, about 0.4 s
      this.hist.push(this.combatants.map(c => [c.pos.x, c.pos.y, c.pos.z]));
      if (this.hist.length > 26) this.hist.shift();
    }
    this.util.update(dt, now);
    for (const b of this.bots) if (b.alive && b.weapon.def.slot !== 'primary') this.tryPickup(b, false);
    if (this.phase === 'live' || this.phase === 'post') {
      this.updateUse(dt, now);
      this.updateSpike(now);
    }
    if (this.phase === 'live') this.checkWin(now);
    else if (this.phase === 'post' && now >= this.phaseEnd) {
      if (this.over) this.phase = 'over';
      else if (this.halftime) {
        this.halftime = false;
        this.sideOf.reverse();
        this.lossStreak = [0, 0];
        this.startRound(now, true);
      } else this.startRound(now, false);
    }
  }

  // ---------- spike ----------
  siteAt(pos) { return this.world.sites.find(s => pos.x >= s.x1 && pos.x <= s.x2 && pos.z >= s.z1 && pos.z <= s.z2); }
  siteFor() { return this.plantedSite ?? this.targetSite; }

  dropSpike(at) {
    const sp = this.spike;
    sp.state = 'dropped';
    sp.carrier = null;
    sp.pos.set(at.x, 0, at.z);
    sp.ver++;
    this.spikeMesh.position.copy(sp.pos);
    this.spikeMesh.visible = true;
  }

  updateUse(dt, now) {
    const sp = this.spike;
    for (const c of this.combatants) {
      if (!c.alive || !c.using) { c.useT = 0; continue; }
      const still = c.hSpeed < 0.6 && c.body.onGround;
      const ok = c.using === 'plant'
        ? this.phase === 'live' && sp.state === 'carried' && sp.carrier === c && still && !!this.siteAt(c.pos)
        : c.side === 'defend' && sp.state === 'planted' && still && flat(c.pos, sp.pos) < ROUND.useRange;
      if (!ok) { c.useT = 0; continue; }
      c.useT += dt;
      if (c.using === 'plant' && c.useT >= ROUND.plantTime) this.plant(c, now);
      else if (c.using === 'purge' && c.useT >= ROUND.purgeTime) this.purge(c);
    }
  }

  plant(c, now) {
    const sp = this.spike;
    Object.assign(sp, { state: 'planted', carrier: null, planter: c, plantedAt: now, nextBeep: now });
    sp.pos.set(c.pos.x, 0, c.pos.z);
    sp.ver++;
    this.plantedSite = this.siteAt(c.pos);
    c.credits = Math.min(ECON.max, c.credits + ECON.plant);
    c.using = null;
    c.useT = 0;
    this.spikeMesh.position.copy(sp.pos);
    this.spikeMesh.visible = true;
    for (const h of this.humans) this.to(h).banner('SPIKE PLANTED', `Site ${this.plantedSite.name} · ${ROUND.fuse} s fuse`, 2.5);
    this.sfx.tone(880, 0.25, 'square', 0.15);
  }

  purge(c) {
    this.spike.state = 'purged';
    this.spike.ver++;
    c.using = null;
    this.spikeMesh.visible = false;
    this.endRound(this.teamOn('defend'), 'purge');
  }

  updateSpike(now) {
    const sp = this.spike;
    if (sp.state === 'dropped') {
      for (const c of this.teams[this.teamOn('attack')]) {
        if (c.alive && flat(c.pos, sp.pos) < 1.2) {
          Object.assign(sp, { state: 'carried', carrier: c });
          sp.ver++;
          this.spikeMesh.visible = false;
          if (c.isHuman) this.to(c).banner('SPIKE PICKED UP', 'Plant it inside a site: hold E', 2);
          break;
        }
      }
    } else if (sp.state === 'planted') {
      const left = sp.plantedAt + ROUND.fuse - now;
      if (now >= sp.nextBeep) { // beeps speed up as the fuse burns
        sp.nextBeep = now + 0.12 + 0.9 * Math.max(0, left) / ROUND.fuse;
        this.sfx.tone(1600, 0.06, 'square', 0.25, 0, 1600, this.spatial(sp.pos, 45));
        this.spikeLight.material.color.setScalar(4);
      } else this.spikeLight.material.color.lerp(new THREE.Color(PALETTE.magenta).multiplyScalar(1.2), 0.15);
      if (left <= 0) this.detonate();
    }
  }

  detonate() {
    const sp = this.spike;
    sp.state = 'detonated';
    sp.ver++;
    this.spikeMesh.visible = false;
    this.fx.spark(tmp.set(sp.pos.x, 1.5, sp.pos.z), 0xff6ad5, 30);
    this.shakeAll(sp.pos, 2.5);
    this.sfx.explosion();
    for (const c of this.combatants) if (c.alive && flat(c.pos, sp.pos) < ROUND.blastRadius) this.kill(null, c, false, null);
    this.endRound(this.teamOn('attack'), 'spike');
  }

  // ---------- combat ----------
  eyeOf(c, out) { return c.isHuman ? out.set(c.pos.x, c.pos.y + c.body.eye, c.pos.z) : c.eyeWorld(out); }

  // one ray per bullet (or per shotgun pellet): first wall or enemy along it
  traceRay(shooter, origin, yaw, pitch, far) {
    euler.set(pitch, yaw, 0);
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(euler), ray = this.ray;
    ray.set(origin, dir);
    ray.far = far;
    const wall = ray.intersectObjects(this.world.meshes, false)[0];
    let best = wall ? wall.distance : Infinity, hit = null;
    for (const c of this.enemies[shooter.team]) {
      if (!c.alive) continue;
      const h = c.rayHit(ray);
      if (h && h.distance < best) { best = h.distance; hit = { c, ...h }; }
    }
    return { dir, wall, hit, dist: best };
  }

  // run fn with everyone moved back `ticks` steps, so a laggy shooter hits what they saw on screen
  rewound(ticks, fn) {
    const frame = ticks && this.hist[Math.max(0, this.hist.length - 1 - ticks)];
    if (!frame) return fn();
    const saved = this.combatants.map(c => c.pos.clone());
    this.combatants.forEach((c, i) => { c.pos.set(...frame[i]); c.syncTransform?.(); });
    try { return fn(); } finally {
      this.combatants.forEach((c, i) => { c.pos.copy(saved[i]); c.syncTransform?.(); });
    }
  }

  // a player's gun, knife or throw went off
  humanShot(h, shot) {
    if (shot.throw) { this.util.throwHuman(h, shot); h.thrown(shot.kind, this.now); }
    else if (shot.melee) this.resolveMelee(h, shot);
    else this.resolveShot(h, shot);
  }

  resolveShot(shooter, shot) {
    const def = shooter.weapon.def, origin = this.eyeOf(shooter, tmp2.clone());
    const muzzle = shooter.isHuman ? this.humanMuzzle(shooter) : shooter.muzzleWorld(new THREE.Vector3());
    // the local player's gun already sounded; online everyone else still needs to hear it
    if (shooter !== this.human || this.online) this.sfx.shot(this.spatial(shooter.pos, 120, shooter.peer), def.model);
    shooter.firedUntil = this.now + 0.6; // shows on the enemy radar
    this.noise(shooter.pos, shooter.team, BOT.hearShot);

    const rays = shot.pellets ?? [shot];
    const whizzed = new Set();
    this.rewound(shooter.rewindTicks, () => rays.forEach((r, i) => {
      const { dir, wall, hit, dist } = this.traceRay(shooter, origin, r.yaw, r.pitch, def.range);
      const len = Number.isFinite(dist) ? dist : 80;
      if (i < 3) this.fx.tracer(muzzle, origin.clone().addScaledVector(dir, len));
      if (hit?.c.isDecoy) hit.c.destroy();
      else if (hit) this.applyDamage(shooter, hit.c, def, hit.zone, hit.distance, hit.point);
      else if (wall && (i < 4 || Math.random() < 0.4)) {
        normal.copy(wall.face.normal).transformDirection(wall.object.matrixWorld);
        this.fx.decal(wall.point, normal);
        this.fx.spark(wall.point, 0xffd08a, 0.18);
        if (i < 2) this.sfx.ricochet(this.spatial(wall.point, 30));
        if (i < 3) this.fx.debris(wall.point, normal, 0x8a7aa8, 4);
      }
      // a bullet that passes close to a player's head without hitting: whizz
      for (const h of this.humans) {
        if (whizzed.has(h) || !h.alive || shooter.team === h.team || hit?.c === h) continue;
        const head = h.headPoint(tmp), t = head.clone().sub(origin).dot(dir);
        const near = origin.clone().addScaledVector(dir, t);
        if (t > 2 && t < len && head.distanceTo(near) < 1.1) {
          whizzed.add(h);
          this.to(h).whiz(near);
        }
      }
    }));
  }

  // knife: short ray; from behind it multiplies (a heavy backstab always kills)
  resolveMelee(attacker, shot) {
    const def = attacker.weapon.def, origin = this.eyeOf(attacker, tmp2.clone());
    const { hit } = this.rewound(attacker.rewindTicks, () => this.traceRay(attacker, origin, shot.yaw, shot.pitch, def.reach));
    if (!hit) return false;
    if (hit.c.isDecoy) { hit.c.destroy(); return true; }
    const v = hit.c, vyaw = v.isHuman ? v.body.yaw : v.aimYaw;
    // victim facing vs direction to attacker: negative = attacker is behind
    const toA = Math.atan2(-(attacker.pos.x - v.pos.x), -(attacker.pos.z - v.pos.z));
    const behind = Math.cos(toA - vyaw) < -0.3;
    const dmg = (shot.heavy ? def.heavy.damage : def.light.damage) * (behind ? def.backstab : 1);
    const mdef = { damage: dmg, multipliers: { head: 1, chest: 1, legs: 1 }, rangeMod: 1, armorPen: 0.85, reward: def.reward, short: def.short };
    this.applyDamage(attacker, v, mdef, hit.zone, 0, hit.point);
    this.sfx.tone(300, 0.08, 'square', 0.2, 0, 120, attacker === this.human && !this.online ? null : this.spatial(attacker.pos, 30));
    return true;
  }

  applyDamage(attacker, victim, def, zone, dist, point) {
    let dmg = def.damage * def.multipliers[zone] * Math.pow(def.rangeMod, dist / 10);
    const armored = victim.armor > 0 && (zone === 'chest' || (zone === 'head' && victim.helmet));
    if (armored) {
      const through = dmg * def.armorPen;
      victim.armor = Math.max(0, victim.armor - Math.round((dmg - through) * 0.5));
      dmg = through;
    }
    dmg = Math.round(dmg);
    // damage log for the death report and ADR: only HP actually taken counts
    const real = Math.min(dmg, Math.max(0, victim.hp));
    if (attacker) {
      attacker.damage = (attacker.damage ?? 0) + real;
      const key = attacker.name + '>' + victim.name, e = this.dmgLog.get(key) ?? { dmg: 0, hits: 0 };
      e.dmg += real; e.hits++;
      this.dmgLog.set(key, e);
    }
    victim.hp -= dmg;
    if (!victim.isHuman) { victim.flash = 1; victim.onHurt(attacker, this.now); }
    const killed = victim.hp <= 0;
    if (killed) this.kill(attacker, victim, zone === 'head', def); // game state first, feedback after
    const head = zone === 'head';
    if (!def.dot) { // burning shows no impact sparks or hit markers
      this.fx.spark(point, head ? 0x38e8ff : 0xff3fb4, head ? 0.45 : 0.3);
      this.fx.debris(point, { x: 0, y: 1, z: 0 }, head ? 0x38e8ff : 0xff3fb4, 4);
    }
    if (attacker?.isHuman) this.to(attacker).hit(dmg, head, killed, point, head && victim.helmet, !!def.dot);
    if (victim.isHuman) this.to(victim).hurt(attacker.pos, !def.dot);
  }

  kill(attacker, victim, head, def) {
    victim.alive = false;
    victim.hp = 0;
    victim.deaths++;
    victim.using = null;
    if (!victim.isHuman) victim.die();
    if (attacker && attacker !== victim) {
      attacker.kills++;
      if (head) attacker.hsKills = (attacker.hsKills ?? 0) + 1;
      attacker.credits = Math.min(ECON.max, attacker.credits + def.reward);
    }
    if (this.spike.state === 'carried' && this.spike.carrier === victim) this.dropSpike(victim.pos);
    this.dropWeapon(victim, victim.pos);
    for (const h of this.humans) {
      this.to(h).feed({
        by: attacker ? attacker.name : null, victim: victim.name, head,
        weapon: attacker ? (def.short ?? def.name) : 'SPIKE', mine: attacker?.team === h.team, victimMine: victim.team === h.team,
      }, victim.team === h.team ? 'bad' : 'good');
    }
    if (victim.isHuman) this.to(victim).death(`ELIMINATED BY ${attacker ? attacker.name : 'THE SPIKE'}`, this.report(victim));
  }

  // a defender calls out attackers near a site; teammates elsewhere rotate there
  // one spare defender (the closest one posted away from that site) rotates in to help
  spotted(bot, enemy) {
    if (bot.side !== 'defend' || this.spike.state === 'planted' || this.phase !== 'live') return;
    const site = this.world.sites.find(s => Math.hypot(enemy.pos.x - s.x, enemy.pos.z - s.z) < 32);
    if (!site || site === this.alarmSite) return;
    this.alarmSite = site;
    let best = null, bd = Infinity;
    for (const b of this.teams[bot.team]) {
      if (b.isHuman || !b.alive || b.holdsMid || Math.hypot(b.hold.x - site.x, b.hold.z - site.z) < 25) continue;
      const d = Math.hypot(b.pos.x - site.x, b.pos.z - site.z);
      if (d < bd) { bd = d; best = b; }
    }
    this.rotator = best;
    this.intelVer++;
    for (const h of this.teams[bot.team]) if (h.isHuman) this.to(h).feed(`${bot.name}: contact ${site.name}${best ? `, ${best.name} rotating` : ''}`, 'good');
  }
  heardNear() {}

  noise(pos, team, radius) {
    for (const b of this.bots) if (b.team !== team && b.alive && flat(b.pos, pos) < radius) b.hear(pos, this.now, this.botCtx);
  }

  findCover(bot, from) {
    const eye = from.headPoint(tmp), bp = bot.pos;
    const away = Math.atan2(bp.z - from.pos.z, bp.x - from.pos.x);
    let best = null, bestD = Infinity;
    for (let i = 0; i < 90; i++) {
      const a = away + (Math.random() - 0.5) * (i < 60 ? Math.PI * 1.2 : Math.PI * 2), r = 2 + Math.random() * 14;
      const x = bp.x + Math.cos(a) * r, z = bp.z + Math.sin(a) * r;
      if (r >= bestD || !this.nav.walkableAt(x, z) || this.los(eye, tmp2.set(x, 1.7, z))) continue;
      best = [x, z]; bestD = r;
    }
    return best;
  }

  // closest attacker bot goes for a dropped spike; closest defender bot purges
  closestBot(team, side, pos) {
    let best = null, bd = Infinity;
    for (const b of this.teams[team]) {
      if (b.isHuman || !b.alive || b.side !== side) continue;
      const d = flat(b.pos, pos);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  fetcher(team) { return this.closestBot(team, 'attack', this.spike.pos); }
  purger(team) { return this.closestBot(team, 'defend', this.spike.pos); }

  postSpot(bot, site, side) {
    const s = site.post[bot.postIdx % site.post.length], w = side === 'attack' ? site.watchDefend : site.watchAttack;
    return { x: s.x, z: s.z, lx: w.x, lz: w.z };
  }

  // ---------- dropped weapons ----------
  // a primary lies where its owner died (or was tossed); walk over it with no primary, or press F to swap
  dropWeapon(c, at, ammo = null) {
    let item = ammo;
    if (!item) {
      if (c.isHuman) item = c.takePrimary(this.now);
      else if (c.weapon.def.slot === 'primary') item = { def: c.weapon.def, mag: c.weapon.mag, reserve: c.weapon.reserve };
    }
    if (!item) return;
    const y = this.util.groundBelow(tmp.set(at.x, at.y + 0.5, at.z)) + 0.05;
    const mesh = dropMesh(this.scene, item.def, at.x + (Math.random() - 0.5) * 0.6, y, at.z + (Math.random() - 0.5) * 0.6, Math.random() * Math.PI * 2);
    this.dropId = (this.dropId ?? 0) + 1;
    this.drops.push({ ...item, id: this.dropId, mesh, pos: mesh.position, ry: mesh.rotation.y });
  }

  nearestDrop(pos, range) {
    let best = null, bd = range;
    for (const d of this.drops) {
      const dist = Math.hypot(d.pos.x - pos.x, d.pos.z - pos.z);
      if (dist < bd && Math.abs(d.pos.y - pos.y) < 1.5) { bd = dist; best = d; }
    }
    return best;
  }

  // swap: true when the player presses F (drops what they hold)
  tryPickup(c, swap) {
    const d = this.nearestDrop(c.pos, swap ? 1.8 : 1.1);
    if (!d) return false;
    this.drops.splice(this.drops.indexOf(d), 1);
    d.mesh.removeFromParent();
    if (c.isHuman) {
      if (c.primary) this.dropWeapon(c, c.pos);
      c.give(d.def, this.now, d);
    } else c.setWeapon(d.def, d);
    return true;
  }

  // ---------- buying ----------
  canBuy(c) {
    if (!c.alive || this.now > this.buyUntil) return false;
    const sp = this.world.spawns[c.side][0];
    return Math.hypot(c.pos.x - sp.x, c.pos.z - sp.z) < 14;
  }

  buy(c, id) {
    const item = SHOP.find(i => i.id === id);
    if (!item) return null;
    if (!this.canBuy(c)) return 'Buying is closed';
    let price = item.price;
    if (item.type === 'weapon' && c.primary?.def === WEAPONS[id]) return 'Already owned';
    if (id === 'vest' && c.armor >= 100) return 'Already owned';
    if (id === 'vesthelm') {
      if (c.armor >= 100 && c.helmet) return 'Already owned';
      if (c.armor >= 100) price = 350; // helmet only
    }
    if (item.type === 'util') {
      if (c.util[id] >= UTIL[id].max) return `Carrying the maximum ${UTIL[id].name.toLowerCase()}s`;
      if (c.utilCount >= UTIL_MAX) return `Carrying ${UTIL_MAX} throwables already`;
    }
    if (c.credits < price) return 'Not enough credits';
    c.credits -= price;
    if (item.type === 'weapon') {
      if (c.primary) this.dropWeapon(c, c.pos); // the old one lands at your feet
      c.give(WEAPONS[id], this.now);
    } else if (item.type === 'util') c.util[id]++;
    else { c.armor = 100; if (id === 'vesthelm') c.helmet = true; }
    return `Bought ${item.label}`;
  }

  purging() { return this.combatants.some(c => c.alive && c.using === 'purge' && c.useT > 0); }

  // ---------- views for the HUD ----------
  view() {
    const sp = this.spike, now = this.now;
    let time;
    if (this.phase === 'buy') time = this.phaseEnd - now;
    else if (sp.state === 'planted' && this.phase === 'live') time = sp.plantedAt + ROUND.fuse - now;
    else if (this.phase === 'live') time = this.phaseEnd - now;
    else time = 0;
    const mine = this.human.team, theirs = 1 - mine;
    return {
      round: this.round, score: [this.score[mine], this.score[theirs]], mySide: this.sideOf[mine],
      phase: this.phase, planted: sp.state === 'planted', time: Math.max(0, time),
      alive: [this.teams[mine].map(c => c.alive), this.teams[theirs].map(c => c.alive)],
      carrying: sp.state === 'carried' && sp.carrier === this.human,
    };
  }

  radarDots() {
    const dots = [], now = this.now;
    const mine = this.human.team;
    for (const c of this.others) {
      if (!c.alive) continue;
      if (c.team === mine) dots.push({ x: c.pos.x, z: c.pos.z, color: '#38e8ff' });
      else if (c.spottedUntil > now || c.firedUntil > now) dots.push({ x: c.pos.x, z: c.pos.z, color: '#ff3fb4' });
    }
    for (const d of this.util.decoys) if (d.team !== mine && d.firedUntil > now) dots.push({ x: d.pos.x, z: d.pos.z, color: '#ff3fb4' });
    dots.unshift(...this.util.radarDots());
    const sp = this.spike;
    if (sp.state === 'dropped' || sp.state === 'planted') dots.push({ x: sp.pos.x, z: sp.pos.z, color: '#ffb347', square: true });
    else if (sp.state === 'carried' && sp.carrier.team === mine && sp.carrier !== this.human) {
      dots.push({ x: sp.carrier.pos.x, z: sp.carrier.pos.z, color: '#ffb347', square: true });
    }
    return dots;
  }

  // teammates first; once the squad is down, anyone still alive
  spectatePool() {
    const alive = this.others.filter(c => c.alive), mates = alive.filter(c => c.team === this.human.team);
    return mates.length ? mates : alive;
  }

  // team 0 in the rows means "the viewer's squad"
  scoreboard(viewer = this.human) {
    const rounds = Math.max(1, this.round - (this.phase === 'buy' || this.phase === 'live' ? 1 : 0));
    return this.combatants.map(c => ({
      name: c.name, team: c.team === viewer.team ? 0 : 1, alive: c.alive, k: c.kills, d: c.deaths,
      adr: Math.round((c.damage ?? 0) / rounds),
      hs: c.kills ? Math.round(((c.hsKills ?? 0) / c.kills) * 100) : 0,
      credits: c.team === viewer.team ? c.credits : null, me: c === viewer,
    }));
  }

  // who hurt whom this round, from one combatant's point of view
  report(c) {
    const dealt = [], taken = [];
    for (const [key, e] of this.dmgLog) {
      const [a, v] = key.split('>');
      if (a === c.name) dealt.push({ name: v, ...e });
      if (v === c.name) taken.push({ name: a, ...e });
    }
    return { dealt, taken };
  }

  // best player of the match: kills first, damage breaks ties
  mvp() {
    return [...this.combatants].sort((a, b) => b.kills - a.kills || (b.damage ?? 0) - (a.damage ?? 0))[0];
  }
}
