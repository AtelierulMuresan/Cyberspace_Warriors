import { neon, PALETTE } from '../render.js';
import { createBuilder, addBaseLights } from './builder.js';

// Test Range 07: the Milestone 1 tuning space.
export function buildRange(scene) {
  const B = createBuilder(scene);
  const { world, solid, deco, sign, floorLabel, lamp, panelWall } = B;
  const { metal, metalDark, crate } = B.mats;
  world.bounds = { x1: -24, z1: -56, x2: 24, z2: 16 };
  world.spawn.set(0, 0, 8);

  // shell
  B.floor(-25, -57, 25, 17, 'grid');
  const H = 9;
  panelWall(-25, -57, -24, 17, H);
  panelWall(24, -57, 25, 17, H);
  panelWall(-25, -57, 25, -56, H);
  panelWall(-25, 16, 25, 17, H);
  deco(-23.95, 8.5, -20, 0.06, 0.14, 72, neon(PALETTE.magenta));
  deco(23.95, 8.5, -20, 0.06, 0.14, 72, neon(PALETTE.cyan));
  deco(0, 8.5, -55.95, 48, 0.14, 0.06, neon(PALETTE.amber));
  deco(0, 8.5, 15.95, 48, 0.14, 0.06, neon(PALETTE.magenta));
  deco(0, 0.25, -55.95, 48, 0.06, 0.06, neon(PALETTE.cyan, 1.6));

  // range lane (left): bench at z=4, targets at 10/20/30/45 m
  solid(-14, 0, 4, 16, 0.9, 0.6, metal);
  solid(-5.5, 0, -22, 0.4, 1.0, 52, metalDark);
  deco(-5.5, 1.0, -22, 0.06, 0.03, 52, neon(PALETTE.amber, 1.15));
  [['10 M', -6], ['20 M', -16], ['30 M', -26], ['45 M', -41]].forEach(([t, z]) => floorLabel(t, -7.6, z));
  sign('RANGE 07', 'STATIC TARGETS // 10-20-30-45 M', '#ff3fb4', -14, 6, -55.9, 8, 2);

  // strafe yard (right)
  sign('STRAFE YARD', 'ADAD // PEEKERS // HIGH GROUND', '#38e8ff', 14, 6, -55.9, 8, 2);
  deco(14, 0.005, -8, 10, 0.02, 0.08, neon(PALETTE.cyan, 1.4));
  deco(14, 0.005, -22, 12, 0.02, 0.08, neon(PALETTE.cyan, 1.4));
  solid(9, 0, -32, 4, 2.4, 0.8, metal);
  solid(19, 0, -32, 4, 2.4, 0.8, metal);
  solid(17.5, 0, -45.7, 9, 2.7, 8.6, metalDark);
  deco(17.5, 2.7, -41.38, 9, 0.05, 0.05, neon(PALETTE.magenta));
  for (let i = 0; i < 9; i++) solid(14.5, 0, -36.3 - 0.6 * i, 2, 0.3 * (i + 1), 0.6, metal, 0.02);

  // centre
  solid(-2, 0, -6, 1.2, 1.2, 1.2, crate);
  solid(1.6, 0, -12, 1.2, 1.2, 1.2, crate);
  solid(1.6, 1.2, -12, 1.2, 1.2, 1.2, crate);
  solid(0, 0, -20, 6, 1.0, 0.5, metal);
  for (const x of [-3.5, 3.5]) {
    solid(x, 0, -28, 1, 7, 1, metalDark);
    deco(x, 0, -27.48, 0.12, 7, 0.04, neon(x < 0 ? PALETTE.magenta : PALETTE.cyan));
  }
  solid(-1, 0, -38, 2.4, 2.6, 3, metalDark);
  deco(-1, 2.2, -36.48, 2.4, 0.08, 0.04, neon(PALETTE.amber));

  // movement test: jump boxes behind spawn
  [[0.6, 'JUMP'], [0.9, 'JUMP'], [1.2, 'CROUCH-JUMP'], [1.4, 'CROUCH-JUMP']].forEach(([h, label], i) => {
    const x = 7 + i * 2.5;
    solid(x, 0, 12.5, 1.8, h, 1.8, crate, 0.025);
    floorLabel(`${h} M ${label}`, x, 10.6, '#38e8ff', 2.2);
  });

  sign('九龍-9', 'HELIX SECURITY // TEST FACILITY', '#ffb347', 0, 6.5, -55.9, 9, 2.25);

  addBaseLights(scene);
  lamp(-14, 6, -52, PALETTE.magenta);
  lamp(14, 6, -52, PALETTE.cyan);
  lamp(0, 6, -52, PALETTE.amber);
  lamp(-20, 4, 4, PALETTE.magenta);
  lamp(20, 4, 4, PALETTE.cyan);
  lamp(0, 5, -28, PALETTE.violet);
  B.skyline(7, 46);
  sign('GHOSTWIRE', 'WE ARE ALREADY INSIDE', '#ff3fb4', -30, 26, -78, 24, 6, 0.35);

  world.callouts = [
    { name: 'RANGE 07', x1: -24, z1: -56, x2: -5.5, z2: 4 },
    { name: 'STRAFE YARD', x1: 5, z1: -56, x2: 24, z2: 0 },
    { name: 'JUMP BOXES', x1: 5, z1: 9, x2: 24, z2: 16 },
    { name: 'SPAWN', x1: -24, z1: -56, x2: 24, z2: 16 },
  ];

  world.botSpawn = { x: 0, z: -50 };
  world.holds = [
    { x: 14, z: -14, lx: 0, lz: 8 },
    { x: 0, z: -24, lx: 0, lz: 8 },
    { x: 9, z: -36, lx: 0, lz: 8 },
    { x: -9, z: -46, lx: 0, lz: 8 },
    { x: 4, z: -46, lx: 0, lz: 8 },
  ];

  world.targets = [
    [-14, 0, -6], [-10, 0, -16], [-18, 0, -26], [-14, 0, -41],
    [14, 0, -8, { type: 'adad', amp: 4, speed: 5.2 }],
    [14, 0, -22, { type: 'adad', amp: 5, speed: 6.2 }],
    [9, 0, -33.2, { type: 'peek', out: 3, speed: 7 }],
    [19, 0, -33.2, { type: 'peek', out: -3, speed: 7 }],
    [19, 2.7, -46],
    [0, 0, -20.8],
    [-1, 0, -40.2, { type: 'peek', out: 2.2, speed: 6 }],
  ];
  return world;
}
