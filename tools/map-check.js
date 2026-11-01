// Paste into the browser console on any match map (?map=docks), or run through a test harness.
// Checks that every spawn, post and route is reachable, then plays bot-only rounds and reports stuck bots.
// Returns a summary object; problems: [] and stuck: {} mean the map is healthy.
window.mapCheck = async function mapCheck(rounds = 16) {
  const G = window.neonStatic, m = G.match, w = G.world, nav = m.nav, problems = [];
  const reach = (from, to, label) => { if (!nav.findPath(from.x, from.z, to.x, to.z)) problems.push(`no path: ${label}`); };
  const walk = (p, label) => { if (!nav.walkableAt(p.x, p.z)) problems.push(`blocked: ${label} (${p.x}, ${p.z})`); };
  const home = w.spawns.defend[0], start = w.spawns.attack[0];
  for (const [i, s] of w.spawns.attack.entries()) { walk(s, `attack spawn ${i}`); reach(s, home, `attack spawn ${i} to defenders`); }
  for (const [i, s] of w.spawns.defend.entries()) walk(s, `defend spawn ${i}`);
  for (const [i, h] of w.holds.entries()) { walk(h, `hold ${i}`); reach(home, h, `defend spawn to hold ${i}`); }
  for (const site of w.sites) {
    const plant = { x: site.plantX, z: site.plantZ };
    walk(plant, `site ${site.name} plant`);
    if (!m.siteAt(plant)) problems.push(`site ${site.name}: plant spot is outside the zone`);
    for (const [i, p] of site.post.entries()) { walk(p, `site ${site.name} post ${i}`); reach(home, p, `defenders to ${site.name} post ${i}`); }
    for (const [ri, route] of w.routes[site.name].entries()) {
      let at = start;
      route.forEach(([x, z], i) => { walk({ x, z }, `route ${site.name}${ri} point ${i}`); reach(at, { x, z }, `route ${site.name}${ri} leg ${i}`); at = { x, z }; });
      reach(at, plant, `route ${site.name}${ri} to plant`);
    }
  }

  const res = { attack: 0, defend: 0 }, reasons = {}, stuck = {}, still = new Map();
  let plants = 0, ticks = 0, err = null;
  const end = m.endRound.bind(m), plant = m.plant.bind(m);
  m.endRound = (t, r) => { if (m.phase === 'live') { res[m.sideOf[t]]++; reasons[r] = (reasons[r] || 0) + 1; } end(t, r); };
  m.plant = (c, n) => { plants++; plant(c, n); };
  try {
    while (res.attack + res.defend < rounds && ticks < 64 * 60 * 60) {
      if (m.phase === 'live' && G.human.alive) m.kill(null, G.human, false, null);
      if (m.over) { m.over = false; m.score = [0, 0]; m.phase = 'post'; m.phaseEnd = m.now; }
      G.tick(); ticks++;
      if (m.phase !== 'live' || ticks % 32) continue;
      for (const b of m.bots) {
        if (!b.alive || b.state === 'engage' || b.task?.type === 'hold' || b.task?.type === 'use') { still.delete(b); continue; }
        const p = still.get(b);
        if (p && Math.hypot(p.x - b.pos.x, p.z - b.pos.z) < 0.5) {
          if (++p.n === 6) { const k = `${b.state}/${b.task?.type}@${b.pos.x.toFixed(0)},${b.pos.z.toFixed(0)}`; stuck[k] = (stuck[k] || 0) + 1; }
        } else still.set(b, { x: b.pos.x, z: b.pos.z, n: 0 });
      }
    }
  } catch (e) { err = e.stack.split('\n').slice(0, 4).join(' | '); }
  return { problems, ...res, reasons, plants, stuck, err, minutes: +(ticks / 3840).toFixed(1) };
};
