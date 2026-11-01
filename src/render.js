import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const PALETTE = {
  sky: 0x120a24,
  outline: 0x040208,
  magenta: 0xff3fb4,
  cyan: 0x38e8ff,
  amber: 0xffb347,
  violet: 0x8a5cff,
};

// 3-band toon ramp: shadow / mid / lit
const ramp = new Uint8Array([70, 150, 255]);
export const GRADIENT = new THREE.DataTexture(ramp, ramp.length, 1, THREE.RedFormat);
GRADIENT.minFilter = GRADIENT.magFilter = THREE.NearestFilter;
GRADIENT.needsUpdate = true;

export const toon = (color, extra = {}) =>
  new THREE.MeshToonMaterial({ color, gradientMap: GRADIENT, ...extra });

// Unlit colour pushed above 1.0 so the bloom pass picks it up.
export function neon(color, boost = 2.2) {
  const m = new THREE.MeshBasicMaterial({ color });
  m.color.multiplyScalar(boost);
  return m;
}

const OUTLINE = new THREE.MeshBasicMaterial({ color: PALETTE.outline, side: THREE.BackSide });

// Inverted-hull outline: a slightly larger back-face box drawn behind the real one.
export function outlinedBox(w, h, d, mat, t = 0.03) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  if (t > 0) mesh.add(new THREE.Mesh(new THREE.BoxGeometry(w + 2 * t, h + 2 * t, d + 2 * t), OUTLINE));
  return mesh;
}

export function canvasTexture(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, powerPreference: 'high-performance' });
  const pr = Math.min(window.devicePixelRatio, 1.5);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.FogExp2(PALETTE.sky, 0.017);

  const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.05, 400);
  camera.rotation.order = 'YXZ';

  // Viewmodel lives in its own scene so the gun never clips into walls.
  const vmScene = new THREE.Scene();
  const vmCamera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);
  vmScene.add(new THREE.HemisphereLight(0x8c78d8, 0x1a1030, 1.8));
  const vmKey = new THREE.DirectionalLight(0xb9c9ff, 1.6);
  vmKey.position.set(1, 2, 1);
  vmScene.add(vmKey);

  const rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const vmPass = new RenderPass(vmScene, vmCamera);
  vmPass.clear = false;
  vmPass.clearDepth = true;
  composer.addPass(vmPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.5, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // render scale multiplies the device pixel ratio; bloom can be switched off for speed
  function setQuality(scale, bloomOn) {
    const ratio = Math.min(window.devicePixelRatio, 1.5) * scale;
    renderer.setPixelRatio(ratio);
    composer.setPixelRatio(ratio);
    renderer.setSize(innerWidth, innerHeight, false);
    composer.setSize(innerWidth, innerHeight);
    bloom.enabled = bloomOn;
  }

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight, false);
    composer.setSize(innerWidth, innerHeight);
    camera.aspect = vmCamera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    vmCamera.updateProjectionMatrix();
  });

  return { renderer, scene, camera, vmScene, vmCamera, composer, setQuality };
}

export class Rain {
  constructor(scene, count = 2600) {
    this.count = count;
    this.area = { x: 34, y: 24, z: 34 };
    this.drops = new Float32Array(count * 3);
    this.speed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.drops[i * 3] = (Math.random() - 0.5) * this.area.x;
      this.drops[i * 3 + 1] = Math.random() * this.area.y;
      this.drops[i * 3 + 2] = (Math.random() - 0.5) * this.area.z;
      this.speed[i] = 18 + Math.random() * 8;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x9fb6ff, transparent: true, opacity: 0.28 });
    this.mesh = new THREE.LineSegments(this.geo, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  // fraction of drops drawn: 1 heavy, 0.35 light, 0 off
  setDensity(f) {
    this.active = Math.round(this.count * f);
    this.geo.setDrawRange(0, this.active * 2);
    this.mesh.visible = this.active > 0;
  }

  update(dt, center) {
    if (this.active === 0) return;
    const d = this.drops, a = this.area, out = this.geo.attributes.position.array;
    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      d[j] += 1.6 * dt;
      d[j + 1] -= this.speed[i] * dt;
      if (d[j + 1] < -1) d[j + 1] += a.y;
      // wrap horizontally around the camera
      let dx = d[j] - center.x, dz = d[j + 2] - center.z;
      if (dx > a.x / 2) d[j] -= a.x; else if (dx < -a.x / 2) d[j] += a.x;
      if (dz > a.z / 2) d[j + 2] -= a.z; else if (dz < -a.z / 2) d[j + 2] += a.z;
      const k = i * 6;
      out[k] = d[j]; out[k + 1] = d[j + 1]; out[k + 2] = d[j + 2];
      out[k + 3] = d[j] - 0.05; out[k + 4] = d[j + 1] + 0.55; out[k + 5] = d[j + 2];
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
