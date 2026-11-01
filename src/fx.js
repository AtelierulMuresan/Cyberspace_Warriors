import * as THREE from 'three';

export const glowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

const TRACER_LIFE = 0.06, SPARK_LIFE = 0.14;

// Spent casings flicked out of the viewmodel (camera space, drawn with the gun).
export class Casings {
  constructor(vmScene) {
    this.pool = [];
    const geo = new THREE.BoxGeometry(0.008, 0.008, 0.022);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffb347 }));
      m.visible = false;
      vmScene.add(m);
      this.pool.push({ m, v: new THREE.Vector3(), life: 0 });
    }
    this.i = 0;
  }

  // from: the gun's ejection port in camera space; shells are red, brass is amber
  eject(from, shell = false) {
    const c = this.pool[this.i++ % this.pool.length];
    c.m.position.copy(from);
    c.m.material.color.set(shell ? 0xff3f5a : 0xffb347);
    c.m.scale.setScalar(shell ? 1.8 : 1);
    c.v.set(0.9 + Math.random() * 0.5, 1 + Math.random() * 0.5, 0.15 + Math.random() * 0.2);
    c.life = 0.55;
    c.m.visible = true;
  }

  update(dt) {
    for (const c of this.pool) {
      if (!c.m.visible) continue;
      c.life -= dt;
      if (c.life <= 0) { c.m.visible = false; continue; }
      c.v.y -= 6 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += dt * 20;
      c.m.rotation.y += dt * 14;
    }
  }
}

// Pooled tracers, bullet holes and impact sparks.
export class Fx {
  constructor(scene) {
    this.tracers = [];
    for (let i = 0; i < 12; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(0xfff1b0).multiplyScalar(2), transparent: true });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }

    const dGeo = new THREE.PlaneGeometry(0.07, 0.07);
    const dMat = new THREE.MeshBasicMaterial({
      color: 0x050308, transparent: true, opacity: 0.85, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4,
    });
    this.decals = [];
    for (let i = 0; i < 64; i++) {
      const m = new THREE.Mesh(dGeo, dMat);
      m.visible = false;
      scene.add(m);
      this.decals.push(m);
    }

    this.sparks = [];
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      }));
      s.visible = false;
      scene.add(s);
      this.sparks.push({ s, life: 0, size: 0 });
    }
    // debris: small chips that fly off impacts and fall
    this.chips = [];
    const chipGeo = new THREE.BoxGeometry(0.025, 0.025, 0.025);
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(chipGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.visible = false;
      scene.add(m);
      this.chips.push({ m, v: new THREE.Vector3(), life: 0 });
    }
    this.ti = this.di = this.si = this.ci = 0;
    this._look = new THREE.Vector3();
  }

  debris(point, normal, color, n = 5) {
    for (let i = 0; i < n; i++) {
      const c = this.chips[this.ci++ % this.chips.length];
      c.m.position.copy(point);
      c.m.material.color.set(color);
      c.v.copy(normal).multiplyScalar(1.5 + Math.random() * 2.5);
      c.v.x += (Math.random() - 0.5) * 3; c.v.y += Math.random() * 2.5; c.v.z += (Math.random() - 0.5) * 3;
      c.life = 0.35 + Math.random() * 0.25;
      c.m.visible = true;
    }
  }

  tracer(from, to) {
    const t = this.tracers[this.ti++ % this.tracers.length];
    const a = t.line.geometry.attributes.position;
    a.setXYZ(0, from.x, from.y, from.z);
    a.setXYZ(1, to.x, to.y, to.z);
    a.needsUpdate = true;
    t.life = TRACER_LIFE;
    t.line.visible = true;
  }

  decal(point, normal) {
    const m = this.decals[this.di++ % this.decals.length];
    m.position.copy(point).addScaledVector(normal, 0.005);
    m.lookAt(this._look.copy(point).add(normal));
    m.rotation.z = Math.random() * Math.PI;
    m.visible = true;
  }

  spark(point, color, size) {
    const p = this.sparks[this.si++ % this.sparks.length];
    p.s.position.copy(point);
    p.s.material.color.set(color).multiplyScalar(2.5);
    p.size = size;
    p.life = SPARK_LIFE;
    p.s.visible = true;
  }

  update(dt) {
    for (const t of this.tracers) {
      if (!t.line.visible) continue;
      t.life -= dt;
      if (t.life <= 0) t.line.visible = false;
      else t.line.material.opacity = t.life / TRACER_LIFE;
    }
    for (const c of this.chips) {
      if (!c.m.visible) continue;
      c.life -= dt;
      if (c.life <= 0) { c.m.visible = false; continue; }
      c.v.y -= 12 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += dt * 12;
    }
    for (const p of this.sparks) {
      if (!p.s.visible) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const k = p.life / SPARK_LIFE;
      p.s.material.opacity = k;
      p.s.scale.setScalar(p.size * (1.6 - k * 0.6));
    }
  }
}
