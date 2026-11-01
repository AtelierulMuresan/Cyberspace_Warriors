import { neon, toon, PALETTE } from '../render.js';
import { createBuilder, addBaseLights } from './builder.js';

// Aim lab: a dark box with a gridded target wall. The drill logic lives in aimtrainer.js.
export function buildAimLab(scene) {
  const B = createBuilder(scene);
  const { world, deco, sign, lamp, panelWall } = B;
  world.bounds = { x1: -16, z1: -16, x2: 16, z2: 12 };
  world.spawn.set(0, 0, 6);
  world.aimlab = true;

  B.floor(-17, -17, 17, 13, 'grid');
  const H = 10;
  panelWall(-17, -17, -16, 13, H);
  panelWall(16, -17, 17, 13, H);
  panelWall(-17, -17, 17, -16, H);
  panelWall(-17, 12, 17, 13, H);
  // target-wall frame
  for (const y of [0.3, 6.4]) deco(0, y, -15.95, 22, 0.06, 0.05, neon(PALETTE.cyan, 1.4));
  for (const x of [-11, 11]) deco(x, 0.3, -15.95, 0.06, 6.1, 0.05, neon(PALETTE.cyan, 1.4));
  // firing line under the player
  deco(0, 0.005, 7.4, 4, 0.02, 0.08, neon(PALETTE.amber, 1.4));
  sign('AIM LAB', 'HELIX TRAINING CELL 3', '#38e8ff', 0, 8, -15.9, 8, 2);

  addBaseLights(scene);
  lamp(0, 7, -8, PALETTE.violet, 40, 26);
  lamp(0, 5, 6, PALETTE.cyan, 20, 14);
  world.callouts = [{ name: 'AIM LAB', x1: -16, z1: -16, x2: 16, z2: 12 }];
  world.targets = [];
  return world;
}
