import * as THREE from 'three';
import { toon, outlinedBox, neon, PALETTE } from './render.js';

// Inverted-hull outline for rounded parts: pushes vertices out along their normals.
const OUTLINE = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * 0.014, 1.0); }',
  fragmentShader: 'void main() { gl_FragColor = vec4(0.016, 0.008, 0.03, 1.0); }',
});

const cache = new Map();
const cached = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

function add(parent, geo, mat, x = 0, y = 0, z = 0, outline = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (outline) m.add(new THREE.Mesh(geo, OUTLINE));
  parent.add(m);
  return m;
}

// a tapered limb hanging down from its joint
const limbGeo = (top, bottom, len) => cached(`limb${top}/${bottom}/${len}`, () => {
  const g = new THREE.CylinderGeometry(top, bottom, len, 8);
  g.translate(0, -len / 2, 0);
  return g;
});
const ball = r => cached(`ball${r}`, () => new THREE.IcosahedronGeometry(r, 1));
const box = (w, h, d) => cached(`box${w}/${h}/${d}`, () => new THREE.BoxGeometry(w, h, d));
const drum = (top, bottom, h) => cached(`drum${top}/${bottom}/${h}`, () => new THREE.CylinderGeometry(top, bottom, h, 8));

function joint(parent, x, y, z) {
  const j = new THREE.Group();
  j.position.set(x, y, z);
  parent.add(j);
  return j;
}

/*
  A jointed player body, facing +Z, feet at y = 0. Sizes match the hit boxes in targets.js.
  mats: { body, head, dark, visor, strip } are per-player so side colours and hit flashes stay separate.
  Returns the joints that Avatar.pose() animates.
*/
export function buildCharacter(mats) {
  const { body, head, dark, visor, strip } = mats;
  const root = new THREE.Group();
  const hips = joint(root, 0, 0.92, 0);
  add(hips, drum(0.15, 0.17, 0.16), dark, 0, -0.02, 0);

  const leg = side => {
    const hip = joint(hips, side * 0.1, -0.06, 0);
    add(hip, limbGeo(0.085, 0.065, 0.4), body);
    const knee = joint(hip, 0, -0.4, 0);
    add(knee, box(0.09, 0.1, 0.05), dark, 0, 0, 0.055); // knee guard
    add(knee, limbGeo(0.065, 0.05, 0.38), dark);
    const foot = joint(knee, 0, -0.38, 0);
    add(foot, box(0.1, 0.08, 0.24), dark, 0, -0.03, 0.05);
    return { hip, knee };
  };
  const L = leg(-1), R = leg(1);

  const spine = joint(hips, 0, 0.06, 0);
  add(spine, drum(0.235, 0.17, 0.42), body, 0, 0.22, 0);                 // torso
  add(spine, box(0.36, 0.26, 0.06), dark, 0, 0.3, 0.17);                 // chest plate
  const stripMesh = add(spine, box(0.26, 0.022, 0.012), strip, 0, 0.34, 0.205, false);
  add(spine, box(0.28, 0.32, 0.12), dark, 0, 0.28, -0.2);                // back unit
  add(spine, box(0.2, 0.02, 0.012), strip, 0, 0.3, -0.262, false);
  add(spine, drum(0.05, 0.065, 0.08), dark, 0, 0.49, 0);                 // neck

  // heads differ by side: Helix wears a closed helmet, Ghostwire a hood and mask
  const headJoint = joint(spine, 0, 0.66, 0);
  const helmet = new THREE.Group(), hood = new THREE.Group();
  headJoint.add(helmet, hood);
  const skull = add(helmet, ball(0.135), head);
  skull.scale.set(0.95, 1, 1.05);
  add(helmet, box(0.2, 0.05, 0.03), visor, 0, 0.015, 0.125, false);
  add(helmet, box(0.03, 0.09, 0.15), dark, 0.13, 0.03, -0.02);
  const pad = s => add(spine, box(0.13, 0.08, 0.17), dark, s * 0.27, 0.45, 0);
  const pads = [pad(-1), pad(1)];                                        // Helix shoulder armour

  const cowl = add(hood, ball(0.15), body);
  cowl.scale.set(1, 1.05, 1.08);
  add(hood, box(0.15, 0.08, 0.04), head, 0, -0.045, 0.125);              // mask
  add(hood, box(0.16, 0.022, 0.02), visor, 0, 0.02, 0.135, false);       // eye slit
  const coat = add(spine, box(0.34, 0.5, 0.05), body, 0, -0.26, -0.17);  // Ghostwire coat tail
  coat.rotation.x = 0.12;

  const arm = side => {
    const shoulder = joint(spine, side * 0.27, 0.4, 0);
    add(shoulder, limbGeo(0.06, 0.05, 0.28), body);
    const elbow = joint(shoulder, 0, -0.28, 0);
    add(elbow, limbGeo(0.05, 0.04, 0.26), dark);
    add(elbow, box(0.07, 0.08, 0.09), head, 0, -0.29, 0);                // glove
    return { shoulder, elbow };
  };
  const armL = arm(-1), armR = arm(1);
  const gunMount = joint(spine, 0.12, 0.24, 0.24);

  return { root, hips, spine, head: headJoint, helmet, hood, pads, coat, L, R, armL, armR, gunMount, stripMesh };
}

// ---------- guns held by players and lying on the ground ----------
const GUN_DARK = toon(0x332e45), GUN_MID = toon(0x584a80);

// A gun pointing along +Z with its grip near the origin. userData.muzzleZ is where the flash goes.
export function buildGun(model) {
  const g = new THREE.Group();
  const p = (w, h, d, x, y, z, mat = GUN_DARK, rx = 0) => {
    const m = outlinedBox(w, h, d, mat, 0.008);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
  };
  const glow = (w, h, d, x, y, z, c = PALETTE.cyan) => {
    const m = new THREE.Mesh(box(w, h, d), neon(c, 1.4));
    m.position.set(x, y, z);
    g.add(m);
  };
  let muzzleZ = 0.6;
  switch (model) {
    case 'pistol':
      p(0.04, 0.05, 0.2, 0, 0.04, 0.08);
      p(0.035, 0.1, 0.05, 0, -0.03, 0, GUN_MID, 0.25);
      glow(0.042, 0.006, 0.08, 0, 0.066, 0.08);
      muzzleZ = 0.2;
      break;
    case 'smg':
      p(0.055, 0.075, 0.3, 0, 0.03, 0.12);
      p(0.025, 0.025, 0.1, 0, 0.04, 0.32);
      p(0.035, 0.19, 0.045, 0, -0.08, 0.14, GUN_MID, -0.12);
      p(0.035, 0.09, 0.045, 0, -0.04, 0, GUN_DARK, 0.3);
      p(0.04, 0.05, 0.14, 0, 0.03, -0.1, GUN_MID);
      glow(0.057, 0.005, 0.1, 0, 0.07, 0.14, PALETTE.magenta);
      muzzleZ = 0.38;
      break;
    case 'shotgun':
      p(0.06, 0.085, 0.3, 0, 0.03, 0.1);
      p(0.035, 0.035, 0.42, 0, 0.05, 0.44);
      p(0.03, 0.03, 0.34, 0, 0.012, 0.42, GUN_MID);
      p(0.06, 0.05, 0.13, 0, 0.012, 0.4, GUN_MID);
      p(0.05, 0.1, 0.2, 0, 0.0, -0.14);
      glow(0.062, 0.005, 0.16, 0, 0.075, 0.1, PALETTE.amber);
      muzzleZ = 0.66;
      break;
    case 'marksman':
      p(0.06, 0.08, 0.44, 0, 0.03, 0.16);
      p(0.024, 0.024, 0.4, 0, 0.04, 0.58);
      p(0.04, 0.04, 0.06, 0, 0.04, 0.8, GUN_MID);                         // muzzle brake
      p(0.05, 0.11, 0.07, 0, -0.06, 0.18, GUN_MID, -0.15);
      p(0.055, 0.11, 0.22, 0, 0.0, -0.14);
      p(0.042, 0.042, 0.26, 0, 0.12, 0.14, GUN_MID);                      // scope
      p(0.056, 0.056, 0.04, 0, 0.12, 0.28, GUN_MID);
      glow(0.04, 0.04, 0.005, 0, 0.12, 0.302);
      muzzleZ = 0.84;
      break;
    case 'knife':
      p(0.025, 0.03, 0.1, 0, 0, 0);
      p(0.045, 0.012, 0.018, 0, 0, 0.06, GUN_MID);
      glow(0.004, 0.026, 0.22, 0, 0.002, 0.18);
      muzzleZ = 0.3;
      break;
    case 'grenade':
      p(0.06, 0.08, 0.06, 0, 0, 0.02, GUN_MID);
      glow(0.064, 0.012, 0.064, 0, 0.01, 0.02, PALETTE.cyan);
      muzzleZ = 0.1;
      break;
    default: // rifle
      p(0.06, 0.08, 0.38, 0, 0.03, 0.14);
      p(0.065, 0.06, 0.18, 0, 0.025, 0.36, GUN_MID);
      p(0.026, 0.026, 0.2, 0, 0.04, 0.52);
      p(0.04, 0.15, 0.07, 0, -0.08, 0.14, GUN_MID, -0.2);
      p(0.035, 0.09, 0.045, 0, -0.04, 0, GUN_DARK, 0.3);
      p(0.05, 0.09, 0.18, 0, 0.01, -0.13);
      p(0.03, 0.03, 0.08, 0, 0.09, 0.14, GUN_MID);
      glow(0.062, 0.005, 0.12, 0, 0.072, 0.3);
      muzzleZ = 0.63;
  }
  g.userData.muzzleZ = muzzleZ;
  return g;
}
