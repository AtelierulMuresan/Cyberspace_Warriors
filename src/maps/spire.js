import { toon, neon, PALETTE } from '../render.js';
import { createBuilder, addBaseLights } from './builder.js';

/*
  Spire Plaza: compact and fast, fights start early. 80 x 90 m. North is -Z.
  A central tower splits a plaza; two side alleys link to it through a crossway.

         x: -40    -22 -14        14 22      40
  z -45  +-----------+---+--------+---+-------+
         |  A SITE   |    HELIX COURT  | B SITE|
  z -16  +--      ---+    +-gap-+      +--   --+
         |  W  |block|    PLAZA        |block| E
  z   5  | ALLEY  = crossway == SPIRE == crossway
  z   9  |     |block|    (centre)     |block|
  z  30  +-----+-----+-----------------+-----+-+
         |            GHOSTWIRE SPAWN          |
  z  45  +-------------------------------------+
*/
export function buildSpire(scene) {
  const B = createBuilder(scene);
  const { world, rect, solid, deco, sign, floorLabel, lamp, facade, floorFrame } = B;
  const { metal, metalDark, crate } = B.mats;
  world.bounds = { x1: -40, z1: -45, x2: 40, z2: 45 };
  world.spawn.set(0, 0, 38);
  const planter = toon(0x2b5a4a);

  B.floor(-42, -47, 42, 47);
  const PH = 15;
  facade(-44, -49, -40, 49, PH);
  facade(40, -49, 44, 49, PH);
  facade(-44, -49, 44, -45, PH);
  facade(-44, 45, 44, 49, PH);

  // ---------- city blocks ----------
  facade(-22, -16, -14, 5, 13);
  facade(-22, 9, -14, 30, 11);
  facade(14, -16, 22, 5, 12);
  facade(14, 9, 22, 30, 14);
  facade(-12, -45, -10, -26, 9);
  facade(10, -45, 12, -26, 9);
  facade(-30, 34, -18, 45, 8);
  facade(18, 34, 30, 45, 8);

  // ---------- the spire: a tower wrapped in light ----------
  rect(-5, -4, 5, 6, 26, metalDark);
  for (const h of [4, 9, 14, 19, 24]) {
    deco(0, h, -4.04, 10.1, 0.12, 0.06, neon(PALETTE.cyan, 1.6));
    deco(0, h, 6.04, 10.1, 0.12, 0.06, neon(PALETTE.cyan, 1.6));
    deco(-5.04, h, 1, 0.06, 0.12, 10.1, neon(PALETTE.magenta, 1.6));
    deco(5.04, h, 1, 0.06, 0.12, 10.1, neon(PALETTE.magenta, 1.6));
  }
  sign('尖塔', null, '#38e8ff', 0, 15, 6.1, 1.6, 6.4, 0, true);

  // ---------- plaza ----------
  rect(-11, 13, -8, 16, 0.9, planter);
  rect(8, 18, 11, 21, 0.9, planter);
  rect(-11, -12, -8, -9, 0.9, planter);
  rect(8, -14, 11, -11, 0.9, planter);
  solid(-12, 0, 26, 1.2, 1.2, 1.2, crate);
  solid(8, 0, 27, 1.2, 1.2, 1.2, crate);
  rect(-2, 20, 2, 22, 1.2, metal);
  rect(-2, -14, 2, -12, 1.2, metal);
  sign('SPIRE PLAZA', 'LEVEL 0 // PUBLIC', '#ffb347', 0, 8.5, 30, 10, 2.5);

  // ---------- alleys and crossways ----------
  solid(-34, 0, 22, 1.2, 1.2, 1.2, crate);
  solid(-26, 0, 12, 1.2, 1.2, 1.2, crate);
  solid(-26, 1.2, 12, 1.2, 1.2, 1.2, crate);
  rect(-37, -6, -33, -4, 1.3, metal);
  solid(34, 0, 18, 1.2, 1.2, 1.2, crate);
  solid(26, 0, 2, 1.2, 1.2, 1.2, crate);
  rect(33, -8, 37, -6, 1.3, metal);
  sign('ラーメン', null, '#ff3fb4', -22.05, 6, 20, 1.2, 4.8, -Math.PI / 2, true);
  sign('義体', null, '#38e8ff', 22.05, 6, 20, 1.2, 3.2, Math.PI / 2, true);
  for (const x of [-18, 18]) deco(x, 5.5, 7, 0.1, 0.1, 4, neon(PALETTE.amber, 1.5)); // crossway lights
  for (const x of [-31, 31]) for (const z of [-12, 4, 20]) deco(x, 7, z, 18, 0.03, 0.03, metalDark); // overhead cables

  // ---------- sites ----------
  const site = (name, x, z, color, hex, extra) => {
    solid(x, 0, z, 2, 2.4, 2, metalDark);
    deco(x, 1.15, z, 2.12, 0.12, 2.12, neon(color, 1.8));
    deco(x, 2.4, z, 0.3, 2.5, 0.3, neon(color, 1.2));
    floorFrame(x - 6, z - 6, x + 6, z + 6, color);
    floorLabel(name, x, z + 4.2, hex, 6);
    world.sites.push({ name, x, z, x1: x - 6, z1: z - 6, x2: x + 6, z2: z + 6, ...extra });
  };
  site('A', -26, -33, PALETTE.magenta, '#ff3fb4', {
    plantX: -23, plantZ: -29,
    post: [{ x: -35, z: -22 }, { x: -20, z: -40 }, { x: -34, z: -40 }, { x: -16, z: -22 }],
    watchDefend: { x: -11, z: -22 }, watchAttack: { x: -30, z: -14 },
  });
  site('B', 26, -33, PALETTE.cyan, '#38e8ff', {
    plantX: 23, plantZ: -29,
    post: [{ x: 35, z: -22 }, { x: 20, z: -40 }, { x: 34, z: -40 }, { x: 16, z: -22 }],
    watchDefend: { x: 11, z: -22 }, watchAttack: { x: 30, z: -14 },
  });
  rect(-37, -30, -34, -27, 1.4, metal);
  rect(-18, -38, -15, -35, 2.4, metalDark);
  solid(-28, 0, -21, 1.2, 1.2, 1.2, crate);
  rect(34, -30, 37, -27, 1.4, metal);
  rect(15, -38, 18, -35, 2.4, metalDark);
  solid(28, 0, -21, 1.2, 1.2, 1.2, crate);
  sign('SITE A', 'NODE 1 // HELIX DATA', '#ff3fb4', -26, 7, -44.9, 8, 2);
  sign('SITE B', 'NODE 2 // HELIX DATA', '#38e8ff', 26, 7, -44.9, 8, 2);

  // ---------- Helix court ----------
  rect(-7, -31, -3, -29, 1.5, metal);
  rect(3, -31, 7, -29, 1.5, metal);
  sign('HELIX SECURITY', 'COURT // RESPONSE TEAM', '#ffb347', 0, 6.5, -44.9, 10, 2.5);

  addBaseLights(scene);
  lamp(0, 6, 38, PALETTE.amber);
  lamp(-31, 6, 8, PALETTE.magenta);
  lamp(31, 6, 8, PALETTE.cyan);
  lamp(0, 7, 14, PALETTE.cyan, 40, 22);
  lamp(0, 7, -14, PALETTE.violet, 40, 22);
  lamp(-26, 7, -30, PALETTE.magenta);
  lamp(26, 7, -30, PALETTE.cyan);
  lamp(0, 7, -36, PALETTE.amber);
  B.skyline(41, 54);

  world.callouts = [
    { name: 'A SITE', x1: -40, z1: -45, x2: -12, z2: -16 },
    { name: 'B SITE', x1: 12, z1: -45, x2: 40, z2: -16 },
    { name: 'HELIX COURT', x1: -12, z1: -45, x2: 12, z2: -26 },
    { name: 'WEST CROSSWAY', x1: -22, z1: 5, x2: -14, z2: 9 },
    { name: 'EAST CROSSWAY', x1: 14, z1: 5, x2: 22, z2: 9 },
    { name: 'WEST ALLEY', x1: -40, z1: -16, x2: -22, z2: 32 },
    { name: 'EAST ALLEY', x1: 22, z1: -16, x2: 40, z2: 32 },
    { name: 'PLAZA', x1: -14, z1: -26, x2: 14, z2: 30 },
    { name: 'T SPAWN', x1: -40, z1: 30, x2: 40, z2: 45 },
  ];
  world.spawns = {
    attack: [{ x: 0, z: 38 }, { x: -2, z: 39.5 }, { x: 2, z: 39.5 }, { x: -4, z: 37 }, { x: 4, z: 37 }],
    defend: [{ x: 0, z: -40 }, { x: -2, z: -41.5 }, { x: 2, z: -41.5 }, { x: -4, z: -39 }, { x: 4, z: -39 }],
    attackYaw: 0, defendYaw: Math.PI,
  };
  world.routes = {
    A: [
      [[-30, 30], [-30, 10], [-30, -12], [-27, -20]],                     // west alley
      [[-9, 24], [-9, 7], [-18, 7], [-30, 3], [-30, -12], [-27, -20]],    // plaza, then the west crossway
    ],
    B: [
      [[30, 30], [30, 10], [30, -12], [27, -20]],                         // east alley
      [[9, 24], [9, 7], [18, 7], [30, 3], [30, -12], [27, -20]],          // plaza, then the east crossway
    ],
  };
  world.holds = [
    { x: -19, z: -24, lx: -30, lz: -12 },         // A, watching the alley mouth
    { x: 19, z: -24, lx: 30, lz: -12 },           // B, watching the alley mouth
    { x: 0, z: -22, lx: 0, lz: -6, mid: true },   // plaza north
    { x: -34, z: -36, lx: -18, lz: -18 },         // A deep
    { x: 34, z: -36, lx: 18, lz: -18 },           // B deep
    { x: -8, z: -24, lx: -8, lz: 10 },            // plaza, west of the spire
    { x: 8, z: -24, lx: 8, lz: 10 },              // plaza, east of the spire
    { x: 0, z: -35, lx: 0, lz: -14 },             // court
  ];
  world.targets = [];
  return world;
}
