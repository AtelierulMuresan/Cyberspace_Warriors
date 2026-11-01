import { toon, neon, PALETTE } from '../render.js';
import { createBuilder, addBaseLights } from './builder.js';

/*
  Rainline Market: 3-lane defuse-style map, 104 x 120 m. North is -Z.

        x: -52        -24 -20      20 24          52
  z -60  +-----------+---+--------+---+-----------+
         |  A SITE   |   |CT SPAWN|   |  B SITE   |
  z -26  +---+-------+---+  +--+  +---+-------+---+
         | A |  W block  |MID |  E block    | B |
         | L |-catwalk---|    |             | T |
         | O |           |    |---alley-----| U |
         | N |  W block  |    |  E block    | N |
  z  42  +---+-----------+----+-------------+---+
         |              T SPAWN                 |
  z  60  +--------------------------------------+
*/
export function buildMarket(scene) {
  const B = createBuilder(scene);
  const { world, rect, solid, deco, sign, floorLabel, lamp, facade, floorFrame } = B;
  const { metal, metalDark, crate } = B.mats;
  world.bounds = { x1: -52, z1: -60, x2: 52, z2: 60 };
  world.spawn.set(0, 0, 54);
  world.spawnYaw = 0;

  const car = toon(0x2e4a7a), carDark = toon(0x1b2440);
  const stall = toon(0x4a3326);
  const awningM = toon(0xb0326e), awningC = toon(0x1f7f96);

  B.floor(-54, -62, 54, 62);

  // ---------- perimeter ----------
  const PH = 16;
  facade(-56, -64, -52, 64, PH);
  facade(52, -64, 56, 64, PH);
  facade(-56, -64, 56, -60, PH);
  facade(-56, 60, 56, 64, PH);

  // ---------- lane blocks ----------
  facade(-38, -26, -6, -14, 12);  // W north
  facade(-38, -8, -6, 42, 14);    // W south  (gap z -14..-8 = catwalk)
  facade(6, -26, 38, 10, 13);     // E north
  facade(6, 16, 38, 42, 12);      // E south  (gap z 10..16 = alley)
  facade(-24, -60, -20, -34, 10); // A / CT divider (gap z -34..-26 = A short)
  facade(20, -60, 24, -34, 10);   // B / CT divider (gap z -34..-26 = B short)
  facade(-30, 50, -14, 60, 9);    // T spawn buildings
  facade(14, 50, 30, 60, 9);

  // ---------- T spawn ----------
  solid(-6, 0, 46, 1.2, 1.2, 1.2, crate);
  solid(-4.8, 0, 46, 1.2, 1.2, 1.2, crate);
  solid(-5.4, 1.2, 46, 1.2, 1.2, 1.2, crate);
  solid(8, 0, 47, 1.2, 1.2, 1.2, crate);
  rect(-44, 47, -40, 49, 1.4, metal);
  rect(40, 46, 44, 48, 1.4, metal);
  sign('GHOSTWIRE', 'CELL 9 // STAGING', '#ff3fb4', 0, 7, 59.9, 10, 2.5, Math.PI);

  // ---------- A long ----------
  rect(-52, 19, -47, 21, 6, metalDark);          // long doors
  rect(-43, 19, -38, 21, 6, metalDark);
  rect(-47, 19, -43, 21, 2.5, metalDark, 3.5);   // lintel
  deco(-45, 3.4, 18.95, 4, 0.08, 0.06, neon(PALETTE.magenta));
  rect(-46.5, 2, -44, 6.5, 1.3, car);            // parked hover-car
  rect(-46.2, 3, -44.3, 5.2, 0.6, carDark, 1.3);
  deco(-45.25, 0.05, 4.25, 2.3, 0.04, 4.3, neon(PALETTE.cyan, 1.4));
  solid(-50, 0, -6, 1.2, 1.2, 1.2, crate);
  solid(-40.5, 0, -20, 1.2, 1.2, 1.2, crate);
  solid(-40.5, 1.2, -20, 1.2, 1.2, 1.2, crate);
  sign('A LONG', null, '#ff3fb4', -45, 5.2, 21.05, 4, 1);
  sign('ラーメン', null, '#ff3fb4', -38.05, 6, 30, 1.2, 4.8, -Math.PI / 2, true);
  sign('牛丼', null, '#ffb347', -38.05, 6, 8, 1.2, 3.2, -Math.PI / 2, true);

  // ---------- catwalk (A long <-> mid) ----------
  solid(-22, 0, -11, 1.2, 1.2, 1.2, crate);
  solid(-14, 0, -12.5, 1.2, 1.2, 1.2, crate);
  deco(-22, 7, -11, 32, 0.12, 0.12, neon(PALETTE.violet, 1.6));
  sign('CATWALK', null, '#8a5cff', -6.05, 5, -11, 3, 0.75, Math.PI / 2);

  // ---------- mid ----------
  rect(-6, 24, -3.5, 30, 1.1, stall);            // market stalls
  deco(-4.75, 2.6, 27, 3, 0.08, 6.4, awningM);
  rect(3.5, 14, 6, 20, 1.1, stall);
  deco(4.75, 2.6, 17, 3, 0.08, 6.4, awningC);
  rect(-6, -1, -2, 1, 7, metalDark);             // mid doors
  rect(2, -1, 6, 1, 7, metalDark);
  rect(-2, -1, 2, 1, 2.5, metalDark, 4.5);
  deco(0, 4.4, 1.05, 4, 0.08, 0.06, neon(PALETTE.cyan));
  rect(-1.5, -21, 1.5, -19, 1.6, metal);         // top-mid cover
  for (let z = -18; z <= 38; z += 8) {           // overhead cables + lanterns
    deco(0, 8, z, 12, 0.03, 0.03, metalDark);
    deco(-2.5, 7.4, z, 0.35, 0.5, 0.35, neon(z % 16 ? PALETTE.magenta : PALETTE.amber, 1.5));
    deco(2.5, 7.4, z + 4, 0.35, 0.5, 0.35, neon(PALETTE.cyan, 1.5));
  }
  sign('雨線市場', null, '#38e8ff', -5.95, 7, 34, 1.2, 4.8, Math.PI / 2, true);
  sign('CYBERDOC', null, '#ff3fb4', 5.95, 6, 4, 1.2, 4.8, -Math.PI / 2, true);
  sign('RAINLINE MARKET', 'MID // EST. 2087', '#38e8ff', 0, 9.5, 42, 10, 2.5);

  // ---------- alley (mid <-> B) ----------
  solid(22, 0, 13, 1.2, 1.2, 1.2, crate);
  solid(30, 0, 11.5, 1.2, 1.2, 1.2, crate);
  sign('ALLEY', null, '#38e8ff', 6.05, 5, 13, 2.5, 0.65, -Math.PI / 2);

  // ---------- B tunnel ----------
  rect(38, 0, 52, 30, 1.2, metalDark, 4.5);      // roof
  rect(44, 14, 46, 16, 4.5, metal);              // centre pillar
  deco(45, 4.38, 15, 0.2, 0.08, 29.5, neon(PALETTE.cyan, 1.6));
  deco(39, 4.38, 15, 0.08, 0.08, 29.5, neon(PALETTE.violet, 1.6));
  deco(51, 4.38, 15, 0.08, 0.08, 29.5, neon(PALETTE.violet, 1.6));
  sign('B TUNNEL', null, '#38e8ff', 45, 5.1, 30.05, 4, 1);
  solid(40, 0, -6, 1.2, 1.2, 1.2, crate);
  solid(49.5, 0, -16, 1.2, 1.2, 1.2, crate);
  solid(49.5, 1.2, -16, 1.2, 1.2, 1.2, crate);

  // ---------- spike sites ----------
  // plant: where bots plant; post: post-plant / retake spots;
  // watchDefend / watchAttack: the entrance each side covers from those spots
  const site = (name, x, z, color, hex, extra) => {
    solid(x, 0, z, 2, 2.4, 2, metalDark);          // server core
    deco(x, 1.15, z, 2.12, 0.12, 2.12, neon(color, 1.8));
    deco(x, 2.4, z, 0.3, 2.5, 0.3, neon(color, 1.2));
    floorFrame(x - 6, z - 6, x + 6, z + 6, color);
    floorLabel(name, x, z + 4.2, hex, 6);
    world.sites.push({ name, x, z, x1: x - 6, z1: z - 6, x2: x + 6, z2: z + 6, ...extra });
  };
  site('A', -40, -46, PALETTE.magenta, '#ff3fb4', {
    plantX: -37, plantZ: -42,
    post: [{ x: -46, z: -36 }, { x: -34, z: -50 }, { x: -44, z: -50 }, { x: -32, z: -37 }],
    watchDefend: { x: -22, z: -30 }, watchAttack: { x: -45, z: -24 },
  });
  site('B', 40, -46, PALETTE.cyan, '#38e8ff', {
    plantX: 37, plantZ: -42,
    post: [{ x: 48, z: -41 }, { x: 34, z: -50 }, { x: 44, z: -50 }, { x: 33, z: -36 }],
    watchDefend: { x: 22, z: -30 }, watchAttack: { x: 45, z: -24 },
  });

  // A site cover
  rect(-50, -40, -47, -37, 1.4, metal);
  rect(-34, -56, -30, -52, 2.4, metalDark);
  rect(-46, -32, -43, -30, 1.2, metal);
  solid(-30, 0, -40, 1.2, 1.2, 1.2, crate);
  solid(-28.8, 0, -40, 1.2, 1.2, 1.2, crate);
  sign('SITE A', 'CORE 01 // HELIX DATA', '#ff3fb4', -40, 7, -59.9, 8, 2);

  // B site cover
  rect(28, -40, 31, -37, 1.4, metal);
  rect(46, -56, 50, -52, 2.4, metalDark);
  rect(34, -32, 37, -30, 1.2, metal);
  rect(44, -38, 46.5, -33.5, 1.3, car);
  rect(44.3, -37, 46.2, -34.8, 0.6, carDark, 1.3);
  sign('SITE B', 'CORE 02 // HELIX DATA', '#38e8ff', 40, 7, -59.9, 8, 2);

  // ---------- CT spawn ----------
  rect(-12, -44, -8, -40, 1.5, metal);
  rect(8, -44, 12, -40, 1.5, metal);
  rect(-1.5, -41.5, 1.5, -38.5, 1, metalDark);     // holo plinth
  deco(0, 1, -40, 0.8, 3.2, 0.8, neon(PALETTE.amber, 1.1));
  rect(-4, -30, -1, -28, 1.2, metal);
  sign('HELIX SECURITY', 'RESPONSE TEAM // STAGING', '#ffb347', 0, 7, -59.9, 10, 2.5);

  // ---------- lighting ----------
  addBaseLights(scene);
  lamp(0, 6, 52, PALETTE.amber);
  lamp(-45, 6, 10, PALETTE.magenta);
  lamp(0, 7, 10, PALETTE.cyan);
  lamp(45, 3.8, 22, PALETTE.violet, 45, 16);
  lamp(45, 3.8, 6, PALETTE.cyan, 45, 16);
  lamp(-38, 7, -44, PALETTE.magenta);
  lamp(38, 7, -44, PALETTE.cyan);
  lamp(0, 7, -48, PALETTE.amber);
  B.skyline(13, 60);
  sign('GHOSTWIRE', 'WE ARE ALREADY INSIDE', '#ff3fb4', -60, 34, -110, 26, 6.5, 0.4);

  // first match wins, so narrow areas come before the broad ones around them
  world.callouts = [
    { name: 'A SHORT', x1: -24, z1: -34, x2: -20, z2: -26 },
    { name: 'B SHORT', x1: 20, z1: -34, x2: 24, z2: -26 },
    { name: 'A SITE', x1: -52, z1: -60, x2: -24, z2: -26 },
    { name: 'B SITE', x1: 24, z1: -60, x2: 52, z2: -26 },
    { name: 'CT SPAWN', x1: -20, z1: -60, x2: 20, z2: -26 },
    { name: 'CATWALK', x1: -38, z1: -14, x2: -6, z2: -8 },
    { name: 'ALLEY', x1: 6, z1: 10, x2: 38, z2: 16 },
    { name: 'A LONG', x1: -52, z1: -26, x2: -38, z2: 42 },
    { name: 'B TUNNEL', x1: 38, z1: 0, x2: 52, z2: 30 },
    { name: 'B LANE', x1: 38, z1: -26, x2: 52, z2: 42 },
    { name: 'TOP MID', x1: -6, z1: -26, x2: 6, z2: -1 },
    { name: 'MID', x1: -6, z1: -1, x2: 6, z2: 42 },
    { name: 'T SPAWN', x1: -52, z1: 42, x2: 52, z2: 60 },
  ];

  // match spawns: 5 per side, slot 0 is the player's
  world.spawns = {
    attack: [{ x: 0, z: 54 }, { x: -2, z: 55.5 }, { x: 2, z: 55.5 }, { x: -4, z: 53 }, { x: 4, z: 53 }],
    defend: [{ x: 0, z: -55 }, { x: -2, z: -56.5 }, { x: 2, z: -56.5 }, { x: -4, z: -54 }, { x: 4, z: -54 }],
    attackYaw: 0, defendYaw: Math.PI,
  };
  // attacker lanes per target site: waypoints walked in order
  world.routes = {
    A: [
      [[-45, 40], [-45, 20], [-45, -18], [-42, -32]],                              // A Long
      [[0, 38], [0, 0], [-3, -11], [-30, -11], [-44, -22], [-42, -32]],            // Mid -> Catwalk
    ],
    B: [
      [[45, 40], [45, 22], [45, -12], [42, -32]],                                  // B Tunnel
      [[0, 38], [0, 20], [3, 13], [30, 13], [45, 2], [42, -32]],                   // Mid -> Alley
    ],
  };

  // defender posts, in fill order: position + the point they watch
  world.holds = [
    { x: -34, z: -36, lx: -45, lz: -24 }, // A site, watching A Long exit
    { x: 34, z: -36, lx: 45, lz: -24 },   // B site, watching B Lane exit
    { x: 0, z: -34, lx: 0, lz: 0, mid: true }, // top mid, down mid
    { x: -48, z: -54, lx: -30, lz: -30 }, // A deep corner
    { x: 44, z: -56, lx: 30, lz: -30 },   // B deep corner
    { x: -30, z: -44, lx: -22, lz: -30 }, // A short
    { x: 30, z: -44, lx: 22, lz: -30 },   // B short
    { x: -8, z: -46, lx: -22, lz: -30 },  // CT
  ];

  // mannequins holding common defender angles (face south by default)
  const E = Math.PI / 2;
  world.targets = [
    [-36, 0, -34], [-48, 0, -52],                    // A site
    [32, 0, -36], [47, 0, -50],                      // B site
    [0, 0, -33, { type: 'adad', amp: 3, speed: 5 }], // top mid
    [-45, 0, -23],                                   // end of A long
    [45, 0, -9],                                     // B tunnel exit
    [-30, 0, -11, null, E],                          // catwalk, facing mid
    [26, 0, 13, null, -E],                           // alley, facing mid
    [10, 0, -46, { type: 'peek', out: -3, speed: 6 }], // CT cover
  ];
  return world;
}
