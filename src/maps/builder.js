import * as THREE from 'three';
import { toon, neon, outlinedBox, canvasTexture } from '../render.js';

// Seeded RNG so generated details are identical every run.
export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- textures (1 texture tile = the metres noted) ----------

const gridTex = canvasTexture(256, 256, (g, w, h) => { // 4 m
  g.fillStyle = '#17121f'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#251d35'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke();
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke();
  }
  g.strokeStyle = '#3a2c55'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
});

const asphaltTex = (() => { // 8 m
  const r = rng(3);
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#16111d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = r() < 0.5 ? '#1d1726' : '#110d17';
      g.fillRect(r() * w, r() * h, 2, 2);
    }
    g.fillStyle = 'rgba(70, 60, 130, 0.12)'; // wet patches
    for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(r() * w, r() * h, 20 + r() * 40, 10 + r() * 20, r() * 3, 0, 7); g.fill(); }
    g.strokeStyle = '#231b30'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
  });
})();

const wallTex = canvasTexture(256, 256, (g, w, h) => { // 4 m
  g.fillStyle = '#1d1729'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2c2340';
  g.fillRect(0, 0, 3, h); g.fillRect(128, 0, 3, h); g.fillRect(0, 128, w, 3);
  g.fillStyle = '#3d3159';
  for (const [x, y] of [[12, 12], [116, 12], [140, 12], [244, 12], [12, 140], [116, 140], [140, 140], [244, 140]]) g.fillRect(x - 3, y - 3, 6, 6);
});

const crateTex = canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#2b2140'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#3a2d58'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
  g.strokeStyle = '#4a3a6e'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = '#f2a541'; g.font = '700 16px Consolas, monospace'; g.textAlign = 'center';
  g.fillText('HLX-07', w / 2, h / 2 + 6);
}, false);

const skyWindowsTex = (() => { // 8 x 16 m
  const r = rng(11);
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#0c0918'; g.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 16) for (let x = 3; x < w; x += 16) {
      const v = r();
      g.fillStyle = v < 0.08 ? '#ffb35c' : v < 0.13 ? '#55e6ff' : v < 0.16 ? '#ff4fc8' : '#151026';
      g.fillRect(x, y, 10, 8);
    }
  });
})();

// Street facade, 8 x 16 m: shutters on the ground floor, windows above.
// Two maps from one layout: colour, and an emissive map where only lit windows glow.
const [facadeTex, facadeGlow] = (() => {
  const r = rng(21);
  const lit = [];
  for (let i = 0; i < 64; i++) { const v = r(); lit.push(v < 0.07 ? '#c98a4a' : v < 0.11 ? '#3fa9bd' : v < 0.13 ? '#c0458f' : null); }
  const draw = glow => (g, w, h) => {
    g.fillStyle = glow ? '#000' : '#2a2238'; g.fillRect(0, 0, w, h);
    if (!glow) {
      g.fillStyle = '#2a2238'; g.fillRect(0, h - 96, w, 96); // shutters, bottom 3 m
      g.fillStyle = '#1a1424';
      for (let y = h - 92; y < h; y += 6) g.fillRect(0, y, w, 2);
      g.fillStyle = '#342a4a';
      for (let y = 0; y < h - 96; y += 96) g.fillRect(0, y + 90, w, 6); // floor ledges
    }
    let i = 0;
    for (let y = 22; y < h - 110; y += 48) for (let x = 12; x < w; x += 64) {
      const c = lit[i++ % lit.length];
      g.fillStyle = c ?? (glow ? '#000' : '#181324');
      g.fillRect(x + 6, y + 4, 28, 18);
    }
  };
  return [canvasTexture(256, 512, draw(false)), canvasTexture(256, 512, draw(true))];
})();

function tiled(tex, rx, ry) {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

export function signMesh(text, sub, color, w, h, vertical = false) {
  const [cw, ch] = vertical ? [128, 512] : [512, 128];
  const tex = canvasTexture(cw, ch, (g, W, H) => {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 18; g.fillStyle = color;
    if (vertical) {
      const chars = [...text], step = H / (chars.length + 0.5);
      g.font = `700 ${Math.min(96, step * 0.85)}px "Chakra Petch", "Segoe UI", sans-serif`;
      chars.forEach((c, i) => g.fillText(c, W / 2, step * (i + 0.75)));
      g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(6, 6, W - 12, H - 12);
      return;
    }
    g.font = '700 64px "Chakra Petch", "Segoe UI", sans-serif';
    g.fillText(text, W / 2, sub ? H * 0.4 : H / 2);
    if (sub) { g.font = '600 24px Consolas, monospace'; g.fillText(sub, W / 2, H * 0.82); }
  }, false);
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  m.color.setScalar(1.7);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

// ---------- builder ----------

export function createBuilder(scene) {
  const world = {
    boxes: [], meshes: [],
    spawn: new THREE.Vector3(), spawnYaw: 0,
    targets: [], callouts: [], sites: [], bounds: null,
  };

  // centre x/z, bottom y; registers collision + hitscan geometry
  const solid = (x, y, z, w, h, d, mat, outline = 0.03) => {
    const m = outlinedBox(w, h, d, mat, outline);
    m.position.set(x, y + h / 2, z);
    scene.add(m);
    world.boxes.push({
      min: new THREE.Vector3(x - w / 2, y, z - d / 2),
      max: new THREE.Vector3(x + w / 2, y + h, z + d / 2),
    });
    world.meshes.push(m);
    return m;
  };
  // corner form: x1..x2, z1..z2
  const rect = (x1, z1, x2, z2, h, mat, y = 0, outline) =>
    solid((x1 + x2) / 2, y, (z1 + z2) / 2, x2 - x1, h, z2 - z1, mat, outline);

  const deco = (x, y, z, w, h, d, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    scene.add(m);
    return m;
  };

  const sign = (text, sub, color, x, y, z, w, h, ry = 0, vertical = false) => {
    const m = signMesh(text, sub, color, w, h, vertical);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
    return m;
  };

  const floorLabel = (text, x, z, color = '#ffb347', size = 2, ry = 0) => {
    const m = signMesh(text, null, color, size, size / 4);
    m.position.set(x, 0.02, z);
    m.rotation.set(-Math.PI / 2, ry, 0, 'YXZ'); // lay flat, then turn about world Y
    scene.add(m);
  };

  const lamp = (x, y, z, color, intensity = 30, distance = 18) => {
    const l = new THREE.PointLight(color, intensity, distance, 1.6);
    l.position.set(x, y, z);
    scene.add(l);
  };

  const facade = (x1, z1, x2, z2, h, y = 0) => {
    const span = Math.max(x2 - x1, z2 - z1);
    const mat = toon(0xffffff, {
      map: tiled(facadeTex, span / 8, h / 16),
      emissiveMap: tiled(facadeGlow, span / 8, h / 16),
      emissive: 0xffffff, emissiveIntensity: 0.55,
    });
    return rect(x1, z1, x2, z2, h, mat, y);
  };

  const panelWall = (x1, z1, x2, z2, h, y = 0) => {
    const span = Math.max(x2 - x1, z2 - z1);
    return rect(x1, z1, x2, z2, h, toon(0xffffff, { map: tiled(wallTex, span / 4, h / 4) }), y);
  };

  const floor = (x1, z1, x2, z2, kind = 'asphalt') => {
    const tex = kind === 'grid'
      ? tiled(gridTex, (x2 - x1) / 4, (z2 - z1) / 4)
      : tiled(asphaltTex, (x2 - x1) / 8, (z2 - z1) / 8);
    rect(x1, z1, x2, z2, 1, toon(0xffffff, { map: tex }), -1, 0);
  };

  // neon rectangle painted on the floor
  const floorFrame = (x1, z1, x2, z2, color) => {
    const m = neon(color, 1.6), t = 0.12;
    deco((x1 + x2) / 2, 0.01, z1, x2 - x1, 0.02, t, m);
    deco((x1 + x2) / 2, 0.01, z2, x2 - x1, 0.02, t, m);
    deco(x1, 0.01, (z1 + z2) / 2, t, 0.02, z2 - z1, m);
    deco(x2, 0.01, (z1 + z2) / 2, t, 0.02, z2 - z1, m);
  };

  const skyline = (seed, count = 50) => {
    const r = rng(seed), b = world.bounds;
    const cx = (b.x1 + b.x2) / 2, cz = (b.z1 + b.z2) / 2;
    const rx = (b.x2 - b.x1) / 2, rz = (b.z2 - b.z1) / 2;
    for (let i = 0; i < count; i++) {
      const ang = r() * Math.PI * 2, dist = 1.15 + r() * 0.9;
      const x = cx + Math.cos(ang) * rx * dist * 1.3, z = cz + Math.sin(ang) * rz * dist * 1.3;
      if (x > b.x1 - 10 && x < b.x2 + 10 && z > b.z1 - 10 && z < b.z2 + 10) continue;
      const w = 6 + r() * 14, d = 6 + r() * 14, h = 20 + r() * 60;
      deco(x, 0, z, w, h, d, new THREE.MeshBasicMaterial({ map: tiled(skyWindowsTex, w / 8, h / 16) }));
      if (r() < 0.35) deco(x, h, z, w * 0.9, 0.12, 0.12, neon([0xff3fb4, 0x38e8ff, 0xffb347][i % 3], 1.8));
    }
  };

  const mats = {
    metal: toon(0x3a3150),
    metalDark: toon(0x251f36),
    crate: toon(0xffffff, { map: crateTex }),
  };

  return { world, solid, rect, deco, sign, floorLabel, lamp, facade, panelWall, floor, floorFrame, skyline, mats };
}

export function addBaseLights(scene) {
  scene.add(new THREE.HemisphereLight(0x7a5fc0, 0x1a1030, 2.2));
  const moon = new THREE.DirectionalLight(0xa9c1ff, 1.6);
  moon.position.set(-20, 40, 10);
  scene.add(moon);
}
