// Walkable ground grid generated from the map's collision boxes, with A* + string pulling.
// Bots stay on ground level; anything between 0.05 m and 1.8 m high blocks a cell.

const CLEARANCE = 0.45;      // cell walkability: slightly wider than the player radius
const LINE_CLEARANCE = 0.42; // straight-line shortcuts must keep this distance from walls
const SQRT2 = Math.SQRT2;

class Heap {
  constructor() { this.k = []; this.f = []; }
  get size() { return this.k.length; }
  push(k, f) {
    const K = this.k, F = this.f;
    let i = K.length;
    K.push(k); F.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (F[p] <= f) break;
      K[i] = K[p]; F[i] = F[p]; i = p;
    }
    K[i] = k; F[i] = f;
  }
  pop() {
    const K = this.k, F = this.f, top = K[0];
    const k = K.pop(), f = F.pop();
    if (K.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= K.length) break;
        if (c + 1 < K.length && F[c + 1] < F[c]) c++;
        if (F[c] >= f) break;
        K[i] = K[c]; F[i] = F[c]; i = c;
      }
      K[i] = k; F[i] = f;
    }
    return top;
  }
}

export class NavGrid {
  constructor(world, cell = 1) {
    const b = world.bounds;
    this.cell = cell;
    this.x0 = b.x1; this.z0 = b.z1;
    this.nx = Math.ceil((b.x2 - b.x1) / cell);
    this.nz = Math.ceil((b.z2 - b.z1) / cell);
    this.boxes = world.boxes.filter(o => o.max.y > 0.05 && o.min.y < 1.8);
    const N = this.nx * this.nz;
    this.walk = new Uint8Array(N);
    for (let k = 0; k < N; k++) {
      const [x, z] = this.center(k);
      this.walk[k] = this.blocked(x, z) ? 0 : 1;
    }
    // fine clearance grid (0.25 m) for straight-line checks, so smoothed paths can't clip corners
    this.fc = 0.25;
    this.fnx = Math.ceil((b.x2 - b.x1) / this.fc);
    this.fnz = Math.ceil((b.z2 - b.z1) / this.fc);
    this.fine = new Uint8Array(this.fnx * this.fnz);
    for (let j = 0; j < this.fnz; j++) for (let i = 0; i < this.fnx; i++) {
      this.fine[j * this.fnx + i] = this.blocked(this.x0 + (i + 0.5) * this.fc, this.z0 + (j + 0.5) * this.fc, LINE_CLEARANCE) ? 0 : 1;
    }
    this.g = new Float32Array(N);
    this.parent = new Int32Array(N);
    this.seen = new Uint32Array(N);
    this.closed = new Uint32Array(N);
    this.gen = 0;
  }

  blocked(x, z, r = CLEARANCE) {
    for (const o of this.boxes) {
      if (x + r > o.min.x && x - r < o.max.x && z + r > o.min.z && z - r < o.max.z) return true;
    }
    return false;
  }

  fineClear(x, z) {
    const i = Math.floor((x - this.x0) / this.fc), j = Math.floor((z - this.z0) / this.fc);
    return i >= 0 && j >= 0 && i < this.fnx && j < this.fnz && this.fine[j * this.fnx + i] === 1;
  }

  idx(x, z) {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? -1 : j * this.nx + i;
  }

  center(k) {
    return [this.x0 + ((k % this.nx) + 0.5) * this.cell, this.z0 + (Math.floor(k / this.nx) + 0.5) * this.cell];
  }

  walkableAt(x, z) {
    const k = this.idx(x, z);
    return k >= 0 && this.walk[k] === 1;
  }

  nearest(x, z) {
    const k = this.idx(x, z);
    if (k >= 0 && this.walk[k]) return k;
    for (let r = 1; r <= 6; r++) {
      let best = -1, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const c = this.idx(x + di * this.cell, z + dj * this.cell);
        if (c < 0 || !this.walk[c]) continue;
        const [cx, cz] = this.center(c), d = (cx - x) ** 2 + (cz - z) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  clearLine(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.15);
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      if (!this.fineClear(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  // Returns [[x, z], ...] waypoints (excluding the start), or null if unreachable.
  findPath(ax, az, bx, bz) {
    const s = this.nearest(ax, az), goal = this.nearest(bx, bz);
    if (s < 0 || goal < 0) return null;
    const { nx, g, parent, seen, closed } = this;
    const gen = ++this.gen;
    const gi = goal % nx, gj = Math.floor(goal / nx);
    const h = k => {
      const dx = Math.abs((k % nx) - gi), dz = Math.abs(Math.floor(k / nx) - gj);
      return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
    };
    const open = new Heap();
    g[s] = 0; parent[s] = -1; seen[s] = gen;
    open.push(s, h(s));
    let found = false;
    while (open.size) {
      const k = open.pop();
      if (closed[k] === gen) continue;
      closed[k] = gen;
      if (k === goal) { found = true; break; }
      const i = k % nx, j = Math.floor(k / nx);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di, c = j + dj;
        if (a < 0 || c < 0 || a >= nx || c >= this.nz) continue;
        const n = c * nx + a;
        if (!this.walk[n] || closed[n] === gen) continue;
        if (di && dj && (!this.walk[j * nx + a] || !this.walk[c * nx + i])) continue; // no corner cutting
        const ng = g[k] + (di && dj ? SQRT2 : 1);
        if (seen[n] === gen && ng >= g[n]) continue;
        seen[n] = gen; g[n] = ng; parent[n] = k;
        open.push(n, ng + h(n));
      }
    }
    if (!found) return null;

    const cells = [];
    for (let k = goal; k !== -1 && k !== s; k = parent[k]) cells.push(this.center(k));
    cells.reverse();
    if (this.walkableAt(bx, bz) && cells.length) cells[cells.length - 1] = [bx, bz];

    // string pulling: skip waypoints that are in straight walkable sight
    const pts = [[ax, az], ...cells], out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.clearLine(pts[i][0], pts[i][1], pts[j][0], pts[j][1])) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }
}
