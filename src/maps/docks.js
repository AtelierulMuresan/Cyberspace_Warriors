import { toon, neon, PALETTE } from '../render.js';
import { createBuilder, addBaseLights } from './builder.js';

/*
  Kowloon Docks: long sightlines outside, a tight warehouse in the middle. 100 x 110 m. North is -Z.

         x: -50          -12      12          50
  z -55  +---------------------------------------+
         |  A SITE     HELIX YARD       B SITE   |
  z -30  |         +-----gate-----+              |
         |  WEST   | WAREHOUSE    |   EAST       |
         |  DOCKS  =door      door=   QUAY       |
         |  long   |  (roofed)    |   containers |
  z  10  |  lane   +-----gate-----+              |
         |                                       |
  z  40  +---------------------------------------+
         |              GHOSTWIRE STAGING        |
  z  55  +---------------------------------------+
*/
export function buildDocks(scene) {
  const B = createBuilder(scene);
  const { world, rect, solid, deco, sign, floorLabel, lamp, facade, floorFrame } = B;
  const { metal, metalDark, crate } = B.mats;
  world.bounds = { x1: -50, z1: -55, x2: 50, z2: 55 };
  world.spawn.set(0, 0, 49);

  const red = toon(0x8a3045), blue = toon(0x27507e), teal = toon(0x1f6f73), rust = toon(0x6e4a2e);
  // a shipping container: body, plus ribs on the long sides
  const box = (x, z, long = 'z', mat = red, y = 0) => {
    const [w, d] = long === 'z' ? [2.6, 6.2] : [6.2, 2.6];
    solid(x, y, z, w, 2.6, d, mat, 0.04);
    deco(x, y + 2.6, z, w * 0.8, 0.04, d * 0.8, metalDark);
  };

  B.floor(-52, -57, 52, 57);
  const PH = 14;
  facade(-54, -59, -50, 59, PH);
  facade(50, -59, 54, 59, PH);
  facade(-54, -59, 54, -55, PH);
  facade(-54, 55, 54, 59, PH);

  // ---------- warehouse: four walls with doors, a roof, and crates inside ----------
  const WH = 7;
  B.panelWall(-12, -30, -10, -12, WH);  // west wall, door z -12..-8
  B.panelWall(-12, -8, -10, 10, WH);
  B.panelWall(10, -30, 12, -22, WH);    // east wall, door z -22..-18
  B.panelWall(10, -18, 12, 10, WH);
  B.panelWall(-12, -30, -2, -28, WH);   // north wall, gate x -2..2
  B.panelWall(2, -30, 12, -28, WH);
  B.panelWall(-12, 8, -2, 10, WH);      // south wall, gate x -2..2
  B.panelWall(2, 8, 12, 10, WH);
  rect(-12, -30, 12, 10, 0.6, metalDark, 6);
  rect(-2, -30, 2, -28, 2, metalDark, 4.2); // lintels
  rect(-2, 8, 2, 10, 2, metalDark, 4.2);
  for (const z of [-22, -10, 2]) deco(0, 5.9, z, 18, 0.08, 0.2, neon(PALETTE.amber, 1.5));
  solid(-5, 0, -2, 1.2, 1.2, 1.2, crate);
  solid(-3.8, 0, -2, 1.2, 1.2, 1.2, crate);
  solid(-4.4, 1.2, -2, 1.2, 1.2, 1.2, crate);
  solid(5, 0, -6, 1.2, 1.2, 1.2, crate);
  solid(5, 0, -14, 1.2, 1.2, 1.2, crate);
  rect(-7, -22, -3, -20, 1.4, metal);
  rect(3, 1, 7, 3, 1.4, metal);
  sign('WAREHOUSE 9', null, '#ffb347', 0, 5.2, 10.05, 4, 1);
  sign('WAREHOUSE 9', null, '#ffb347', 0, 5.2, -30.05, 4, 1, Math.PI);

  // ---------- west docks: one long lane with few places to hide ----------
  box(-44, 28, 'z', red);
  box(-22, 22, 'z', blue);
  box(-40, 6, 'x', teal);
  box(-20, -6, 'z', red);
  box(-44, -18, 'z', blue);
  solid(-30, 0, 14, 1.2, 1.2, 1.2, crate);
  solid(-27, 0, -14, 1.2, 1.2, 1.2, crate);
  solid(-27, 1.2, -14, 1.2, 1.2, 1.2, crate);
  sign('WEST DOCKS', null, '#ff3fb4', -49.95, 6, 10, 8, 2, Math.PI / 2);
  for (let z = -20; z <= 36; z += 14) { // quay bollards with lights
    solid(-48.6, 0, z, 0.8, 0.9, 0.8, metalDark, 0.02);
    deco(-48.6, 0.9, z, 0.3, 0.3, 0.3, neon(PALETTE.magenta, 1.4));
  }

  // ---------- east quay: a stacked container maze ----------
  box(20, 30, 'z', teal);
  box(30, 22, 'x', red);
  box(30, 22, 'x', blue, 2.6);
  box(44, 24, 'z', rust);
  box(22, 8, 'x', blue);
  box(38, 8, 'z', red);
  box(38, 8, 'z', teal, 2.6);
  box(24, -8, 'z', rust);
  box(45, -6, 'x', teal);
  box(34, -14, 'x', red);
  sign('EAST QUAY', null, '#38e8ff', 49.95, 6, 8, 8, 2, -Math.PI / 2);
  deco(30, 8, 8, 0.4, 0.4, 0.4, neon(PALETTE.cyan, 1.4));

  // ---------- staging ----------
  rect(-20, 44, -16, 46, 1.4, metal);
  rect(16, 44, 20, 46, 1.4, metal);
  box(-34, 46, 'x', rust);
  box(34, 47, 'x', blue);
  sign('GHOSTWIRE', 'CELL 4 // STAGING', '#ff3fb4', 0, 7, 54.9, 10, 2.5, Math.PI);

  // ---------- sites ----------
  const site = (name, x, z, color, hex, extra) => {
    solid(x, 0, z, 2, 2.4, 2, metalDark);
    deco(x, 1.15, z, 2.12, 0.12, 2.12, neon(color, 1.8));
    deco(x, 2.4, z, 0.3, 2.5, 0.3, neon(color, 1.2));
    floorFrame(x - 6, z - 6, x + 6, z + 6, color);
    floorLabel(name, x, z + 4.2, hex, 6);
    world.sites.push({ name, x, z, x1: x - 6, z1: z - 6, x2: x + 6, z2: z + 6, ...extra });
  };
  site('A', -32, -42, PALETTE.magenta, '#ff3fb4', {
    plantX: -29, plantZ: -38,
    post: [{ x: -42, z: -32 }, { x: -26, z: -48 }, { x: -40, z: -49 }, { x: -22, z: -36 }],
    watchDefend: { x: -14, z: -42 }, watchAttack: { x: -32, z: -24 },
  });
  site('B', 32, -38, PALETTE.cyan, '#38e8ff', {
    plantX: 29, plantZ: -34,
    post: [{ x: 42, z: -30 }, { x: 26, z: -46 }, { x: 40, z: -46 }, { x: 22, z: -32 }],
    watchDefend: { x: 14, z: -42 }, watchAttack: { x: 32, z: -20 },
  });
  box(-44, -36, 'z', blue);
  rect(-25, -32, -22, -30, 1.3, metal);
  solid(-36, 0, -30, 1.2, 1.2, 1.2, crate);
  box(44, -44, 'z', red);
  rect(22, -26, 25, -24, 1.3, metal);
  solid(36, 0, -26, 1.2, 1.2, 1.2, crate);
  sign('SITE A', 'CRANE 1 // HELIX DATA', '#ff3fb4', -32, 7, -54.9, 8, 2);
  sign('SITE B', 'CRANE 2 // HELIX DATA', '#38e8ff', 32, 7, -54.9, 8, 2);

  // gantry crane over each site, purely for the skyline
  for (const x of [-32, 32]) {
    for (const d of [-9, 9]) deco(x + d, 0, -54, 0.5, 13, 0.5, metalDark);
    deco(x, 13, -54, 19, 0.6, 0.6, rust);
    deco(x, 12.8, -54, 18, 0.08, 0.08, neon(PALETTE.amber, 1.4));
  }

  // ---------- Helix yard ----------
  rect(-8, -44, -4, -42, 1.5, metal);
  rect(4, -44, 8, -42, 1.5, metal);
  rect(-1.5, -38, 1.5, -35, 1, metalDark);
  sign('HELIX SECURITY', 'PORT AUTHORITY', '#ffb347', 0, 7, -54.9, 10, 2.5);

  addBaseLights(scene);
  lamp(0, 6, 48, PALETTE.amber);
  lamp(-36, 7, 10, PALETTE.magenta);
  lamp(36, 7, 12, PALETTE.cyan);
  lamp(0, 5.2, -4, PALETTE.amber, 45, 18);
  lamp(0, 5.2, -22, PALETTE.violet, 30, 14);
  lamp(-32, 8, -40, PALETTE.magenta);
  lamp(32, 8, -38, PALETTE.cyan);
  lamp(0, 7, -44, PALETTE.amber);
  B.skyline(29, 54);

  world.callouts = [
    { name: 'A SITE', x1: -50, z1: -55, x2: -16, z2: -26 },
    { name: 'B SITE', x1: 16, z1: -55, x2: 50, z2: -24 },
    { name: 'HELIX YARD', x1: -16, z1: -55, x2: 16, z2: -30 },
    { name: 'WAREHOUSE', x1: -12, z1: -30, x2: 12, z2: 10 },
    { name: 'WEST DOCKS', x1: -50, z1: -26, x2: -12, z2: 42 },
    { name: 'EAST QUAY', x1: 12, z1: -24, x2: 50, z2: 42 },
    { name: 'FRONT YARD', x1: -12, z1: 10, x2: 12, z2: 42 },
    { name: 'T SPAWN', x1: -50, z1: 42, x2: 50, z2: 55 },
  ];
  world.spawns = {
    attack: [{ x: 0, z: 49 }, { x: -2, z: 50.5 }, { x: 2, z: 50.5 }, { x: -4, z: 48 }, { x: 4, z: 48 }],
    defend: [{ x: 0, z: -50 }, { x: -2, z: -51.5 }, { x: 2, z: -51.5 }, { x: -4, z: -49 }, { x: 4, z: -49 }],
    attackYaw: 0, defendYaw: Math.PI,
  };
  world.routes = {
    A: [
      [[-30, 38], [-32, 0], [-32, -20], [-31, -28]],                       // west docks
      [[0, 30], [0, 12], [0, 4], [-8, -10], [-16, -10], [-30, -18], [-31, -28]], // warehouse, west door
    ],
    B: [
      [[30, 38], [30, 14], [30, -3], [30, -20]],                           // east quay
      [[0, 30], [0, 12], [0, 4], [8, -20], [16, -20], [30, -20]],          // warehouse, east door
    ],
  };
  world.holds = [
    { x: -24, z: -40, lx: -32, lz: -22 },         // A, watching the docks
    { x: 24, z: -36, lx: 32, lz: -18 },           // B, watching the quay
    { x: 0, z: -33, lx: 0, lz: -26, mid: true },  // north gate of the warehouse
    { x: -42, z: -46, lx: -24, lz: -28 },         // A deep
    { x: 42, z: -33, lx: 26, lz: -18 },           // B deep
    { x: -20, z: -30, lx: -14, lz: -10 },         // A, watching the west door side
    { x: 20, z: -30, lx: 14, lz: -20 },           // B, watching the east door
    { x: -8, z: -46, lx: -24, lz: -36 },          // yard
  ];
  world.targets = [];
  return world;
}
