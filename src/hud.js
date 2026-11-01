import { SHOP } from './config.js';
import { applyCrosshair } from './menu.js';

const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// DOM HUD. Every setter caches its last value so per-frame calls are cheap.
export class Hud {
  constructor() {
    const $ = id => document.getElementById(id);
    this.el = {
      xhair: $('xhair'), hit: $('hitmarker'), fps: $('fps'), mag: $('mag'), res: $('res'), wname: $('wname'),
      spd: $('spd'), spdbar: $('spdbar'), mstate: $('mstate'), stop: $('stop'), feed: $('feed'),
      dmg: $('dmg'), shots: $('sShots'), hits: $('sHits'), acc: $('sAcc'), hs: $('sHs'), kills: $('sKills'),
      ammo: $('ammo'), deaths: $('sDeaths'), hp: $('hpv'), ar: $('arv'), helm: $('helm'), vitals: $('vitals'),
      hurt: $('hurt'), dmgdir: $('dmgdir'), death: $('death'), deathText: $('deathText'), deathSub: $('deathSub'),
      scMine: $('scMine'), scEnemy: $('scEnemy'), sideMine: $('sideMine'), sideEnemy: $('sideEnemy'),
      rtime: $('rtime'), rphase: $('rphase'), pipsMine: $('pipsMine'), pipsEnemy: $('pipsEnemy'),
      credits: $('credits'), carry: $('carry'), banner: $('banner'), bTitle: $('bTitle'), bSub: $('bSub'),
      use: $('usebar'), useFill: $('useFill'), useLabel: $('useLabel'),
      buy: $('buymenu'), buyList: $('buyList'), buyCredits: $('buyCredits'), buyMsg: $('buyMsg'),
      spectate: $('spectate'), board: $('scoreboard'),
      scope: $('scope'), emp: $('emp'), slots: $('slots'), prompt: $('prompt'),
    };
    this.cache = {};
    this.bannerUntil = 0;
    this.el.buyList.innerHTML = SHOP.map(i => `<li><kbd>${i.key}</kbd><span>${i.label}</span><b>${i.price}</b></li>`).join('');
  }

  set(key, el, prop, value) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    if (prop === 'text') el.textContent = value;
    else if (prop === 'html') el.innerHTML = value;
    else el.style.setProperty(prop, value);
  }

  // spreadPx: current inaccuracy cone on screen; a dynamic crosshair opens up to it
  crosshair(spreadPx) {
    const x = this.xh, gap = x ? (x.dynamic ? Math.max(x.gap, spreadPx) : x.gap) : spreadPx;
    this.set('gap', this.el.xhair, '--gap', gap.toFixed(1) + 'px');
  }
  crosshairStyle(xh) { this.xh = xh; applyCrosshair(this.el.xhair, xh); }
  crosshairHidden(h) { this.el.xhair.style.opacity = h ? '0' : ''; }
  scope(on) { this.el.scope.hidden = !on; }
  emp(level) { this.set('emp', this.el.emp, 'opacity', level.toFixed(2)); }
  prompt(text) { this.el.prompt.hidden = !text; this.set('prompt', this.el.prompt, 'text', text); }

  // 1 primary · 2 pistol · 3 knife · 4 utility, active one highlighted
  slots(v) {
    this.el.slots.hidden = !v;
    if (!v) return;
    const row = (key, slot, label) => `<li class="${v.active === slot ? 'on' : ''}${label ? '' : ' empty'}"><kbd>${key}</kbd>${label || '—'}</li>`;
    this.set('slots', this.el.slots, 'html',
      row(1, 'primary', v.primary) + row(2, 'secondary', v.secondary) + row(3, 'melee', 'MONOWIRE') + row(4, 'utility', v.util.join(' · ')));
  }

  hitmarker(kind) {
    const el = this.el.hit; // an <svg>: className is read-only there, so use setAttribute
    el.setAttribute('class', '');
    void el.getBoundingClientRect(); // restart animation
    el.setAttribute('class', 'show ' + kind);
  }

  ammo(mag, reserve, reloading, name) {
    this.set('mag', this.el.mag, 'text', reloading ? '··' : String(mag));
    this.set('res', this.el.res, 'text', String(reserve));
    this.set('wname', this.el.wname, 'text', name);
    this.el.ammo.classList.toggle('low', !reloading && mag <= 3);
  }

  speed(v, frac, state, stopMs) {
    this.set('spd', this.el.spd, 'text', v.toFixed(1));
    this.set('bar', this.el.spdbar, 'width', Math.min(100, frac * 100).toFixed(0) + '%');
    this.set('mstate', this.el.mstate, 'text', state);
    this.el.mstate.dataset.state = state;
    this.set('stop', this.el.stop, 'text', stopMs ? `${Math.round(stopMs)} ms` : '—');
  }

  stats(s) {
    this.el.shots.textContent = s.shots;
    this.el.hits.textContent = s.hits;
    this.el.acc.textContent = s.shots ? Math.round((s.hits / s.shots) * 100) + '%' : '—';
    this.el.hs.textContent = s.hits ? Math.round((s.heads / s.hits) * 100) + '%' : '—';
    this.el.kills.textContent = s.kills;
    this.el.deaths.textContent = s.deaths;
  }

  vitals(hp, armor, helmet) {
    this.set('hp', this.el.hp, 'text', String(hp));
    this.set('ar', this.el.ar, 'text', String(armor));
    this.el.helm.hidden = !helmet;
    this.el.vitals.classList.toggle('low', hp <= 25);
  }

  // angle: direction of the attacker on screen, 0 = straight ahead, clockwise positive
  hurt(angle) {
    for (const el of [this.el.hurt, this.el.dmgdir]) { el.className = ''; void el.offsetWidth; el.className = 'show'; }
    this.el.dmgdir.style.setProperty('--a', angle + 'rad');
  }

  // report: { dealt: [{name, dmg, hits}], taken: [...] } for this round
  death(text, report) {
    this.el.death.hidden = !text;
    if (!text) return;
    this.el.deathText.textContent = text;
    const rows = [];
    for (const t of report?.taken ?? []) rows.push(`<div class="from"><span>${t.name} → you</span><span>${t.dmg} in ${t.hits} hit${t.hits > 1 ? 's' : ''}</span></div>`);
    for (const d of report?.dealt ?? []) rows.push(`<div class="to"><span>You → ${d.name}</span><span>${d.dmg} in ${d.hits} hit${d.hits > 1 ? 's' : ''}</span></div>`);
    document.getElementById('deathReport').innerHTML = rows.join('');
    document.getElementById('deathReport').hidden = !rows.length;
  }

  damage(x, y, amount, head) {
    const d = document.createElement('div');
    d.className = 'dn' + (head ? ' head' : '');
    d.textContent = amount;
    d.style.left = x + (Math.random() * 20 - 10) + 'px';
    d.style.top = y + 'px';
    d.addEventListener('animationend', () => d.remove());
    this.el.dmg.appendChild(d);
  }

  // entry: plain text, or { by, victim, weapon, head, mine, victimMine } for a kill
  feed(entry, cls = '') {
    const row = document.createElement('div');
    row.className = 'kill ' + cls;
    if (typeof entry === 'string') row.textContent = entry;
    else {
      const name = (n, mine) => { const b = document.createElement('b'); b.className = mine ? 'mine' : 'theirs'; b.textContent = n; return b; };
      if (entry.by) row.append(name(entry.by, entry.mine));
      const w = document.createElement('span');
      w.className = 'w';
      w.textContent = `[${entry.weapon}]`;
      row.append(w, name(entry.victim, entry.victimMine));
      if (entry.head) { const h = document.createElement('span'); h.className = 'hs'; h.textContent = '◆'; row.append(h); }
    }
    this.el.feed.prepend(row);
    while (this.el.feed.children.length > 6) this.el.feed.lastChild.remove();
    setTimeout(() => row.remove(), 6000);
  }

  fps(v) { this.set('fps', this.el.fps, 'text', `${v} FPS`); }

  // ---------- match ----------
  round(v, credits) {
    const atk = v.mySide === 'attack';
    this.set('scM', this.el.scMine, 'text', String(v.score[0]));
    this.set('scE', this.el.scEnemy, 'text', String(v.score[1]));
    this.set('sdM', this.el.sideMine, 'text', atk ? 'GHOSTWIRE' : 'HELIX');
    this.set('sdE', this.el.sideEnemy, 'text', atk ? 'HELIX' : 'GHOSTWIRE');
    document.body.dataset.side = v.mySide;
    const planted = v.planted && v.phase === 'live';
    this.set('rt', this.el.rtime, 'text', planted ? 'SPIKE' : mmss(Math.ceil(v.time)));
    this.el.rtime.classList.toggle('planted', planted);
    const phase = { buy: `BUY · ROUND ${v.round}`, live: `ROUND ${v.round}`, post: 'ROUND OVER', over: 'MATCH OVER' }[v.phase];
    this.set('rp', this.el.rphase, 'text', phase);
    const pips = a => a.map(alive => `<i class="${alive ? 'on' : ''}"></i>`).join('');
    this.set('pM', this.el.pipsMine, 'html', pips(v.alive[0]));
    this.set('pE', this.el.pipsEnemy, 'html', pips(v.alive[1]));
    this.set('cr', this.el.credits, 'text', `CR ${credits.toLocaleString('en-US')}`);
    this.el.carry.hidden = !v.carrying;
    if (this.bannerUntil && performance.now() > this.bannerUntil) { this.el.banner.hidden = true; this.bannerUntil = 0; }
  }

  // seconds 0 keeps the banner up until the next one
  banner(title, sub, seconds) {
    this.el.bTitle.textContent = title;
    this.el.bSub.textContent = sub;
    this.el.banner.hidden = false;
    this.bannerUntil = seconds ? performance.now() + seconds * 1000 : 0;
  }

  use(frac, label) {
    this.el.use.hidden = frac <= 0;
    if (frac > 0) {
      this.set('uf', this.el.useFill, 'width', Math.min(100, frac * 100).toFixed(1) + '%');
      this.set('ul', this.el.useLabel, 'text', label);
    }
  }

  buyMenu(open, credits, msg) {
    this.el.buy.hidden = !open;
    if (!open) return;
    this.set('bc', this.el.buyCredits, 'text', `CR ${credits.toLocaleString('en-US')}`);
    this.set('bm', this.el.buyMsg, 'text', msg);
  }

  spectate(name) {
    this.el.spectate.hidden = !name;
    if (name) this.set('spec', this.el.spectate, 'text', `SPECTATING ${name} · click to switch`);
  }

  // mvp: a name shown above the table at match end
  scoreboard(rows, mvp = null) {
    this.el.board.hidden = !rows;
    if (!rows) return;
    const team = t => rows.filter(r => r.team === t).sort((a, b) => b.k - a.k || b.adr - a.adr).map(r =>
      `<tr class="${r.alive || mvp ? '' : 'dead'}${r.me ? ' me' : ''}"><td>${r.name}</td><td>${r.k}</td><td>${r.d}</td><td>${r.adr}</td><td>${r.hs}%</td><td>${r.credits ?? ''}</td></tr>`).join('');
    const head = label => `<thead><tr><th>${label}</th><th>K</th><th>D</th><th>ADR</th><th>HS</th><th>${label === 'Your squad' ? 'CR' : ''}</th></tr></thead>`;
    this.set('board', this.el.board, 'html',
      (mvp ? `<p class="mvp">MATCH MVP · ${mvp}</p>` : '') +
      `<table>${head('Your squad')}<tbody>${team(0)}</tbody>${head('Enemy squad')}<tbody>${team(1)}</tbody></table>`);
  }

  // aim-trainer bar: drill, time, score
  drill(v) {
    const extra = v.tracking ? `<span>On target</span><b>${v.score}%</b>`
      : `<span>Score</span><b>${v.score}</b><span>Hits</span><b>${v.hits}</b><span>Acc</span><b>${v.acc}%</b>${v.avgMs != null ? `<span>Avg</span><b>${v.avgMs} ms</b>` : ''}`;
    this.set('drill', document.getElementById('drillbar'), 'html', `<span>${v.name}</span><b>${Math.ceil(v.left)}s</b>${extra}`);
  }

  // ---------- radar ----------
  // North-up: static layout pre-drawn once; player arrow and dots drawn per frame.
  initMinimap(world) {
    const c = document.getElementById('minimap'), S = c.width, b = world.bounds;
    const k = (S - 12) / Math.max(b.x2 - b.x1, b.z2 - b.z1);
    const ox = (S - (b.x2 - b.x1) * k) / 2, oz = (S - (b.z2 - b.z1) * k) / 2;
    const map = (x, z) => [ox + (x - b.x1) * k, oz + (z - b.z1) * k];

    const base = document.createElement('canvas');
    base.width = base.height = S;
    const g = base.getContext('2d');
    g.fillStyle = 'rgba(10, 6, 20, 0.78)'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#1d1530';
    g.fillRect(...map(b.x1, b.z1), (b.x2 - b.x1) * k, (b.z2 - b.z1) * k);
    for (const box of world.boxes) {
      if (box.max.y <= 0.05 || box.min.y >= 3) continue; // floor, roofs, lintels
      const x1 = Math.max(box.min.x, b.x1), z1 = Math.max(box.min.z, b.z1);
      const x2 = Math.min(box.max.x, b.x2), z2 = Math.min(box.max.z, b.z2);
      if (x2 <= x1 || z2 <= z1) continue;
      g.fillStyle = box.max.y - box.min.y >= 2.5 ? '#4b3b72' : '#30264a';
      g.fillRect(...map(x1, z1), (x2 - x1) * k, (z2 - z1) * k);
    }
    g.font = '700 16px "Chakra Petch", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const s of world.sites) {
      g.strokeStyle = s.name === 'A' ? '#ff3fb4' : '#38e8ff';
      g.fillStyle = g.strokeStyle;
      const [x1, z1] = map(s.x1, s.z1);
      g.strokeRect(x1, z1, (s.x2 - s.x1) * k, (s.z2 - s.z1) * k);
      g.fillText(s.name, ...map(s.x, s.z));
    }
    this.mm = { ctx: c.getContext('2d'), base, map, k, callouts: world.callouts };
    this.el.callout = document.getElementById('callout');
  }

  minimap(x, z, yaw, dots = []) {
    const m = this.mm;
    if (!m) return;
    const g = m.ctx;
    g.drawImage(m.base, 0, 0);
    for (const d of dots) {
      const [dx, dz] = m.map(d.x, d.z);
      g.fillStyle = d.color;
      if (d.r) { // an area (smoke, fire)
        g.globalAlpha = 0.45;
        g.beginPath(); g.arc(dx, dz, Math.max(2, d.r * m.k), 0, 7); g.fill();
        g.globalAlpha = 1;
      } else if (d.square) g.fillRect(dx - 3.5, dz - 3.5, 7, 7);
      else { g.beginPath(); g.arc(dx, dz, 3.5, 0, 7); g.fill(); }
    }
    const [px, pz] = m.map(x, z);
    g.save();
    g.translate(px, pz);
    g.rotate(-yaw); // yaw 0 faces north (up)
    g.fillStyle = '#ffb347';
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.closePath(); g.fill();
    g.restore();
    const area = m.callouts.find(c => x >= c.x1 && x <= c.x2 && z >= c.z1 && z <= c.z2);
    this.set('callout', this.el.callout, 'text', area ? area.name : '');
  }
}
