import { DRILLS, loadBest } from './aimtrainer.js';

// len / thick / gap in px; dynamic: the gap opens with the current weapon's inaccuracy
export const XH_DEFAULT = { color: '#38e8ff', len: 7, thick: 2, gap: 4, dot: false, outline: true, dynamic: true };
const XH_PRESETS = {
  Classic: { len: 7, thick: 2, gap: 4, dot: false, outline: true, dynamic: true },
  Tight: { len: 5, thick: 2, gap: 2, dot: false, outline: true, dynamic: false },
  Dot: { len: 0, thick: 3, gap: 0, dot: true, outline: true, dynamic: false },
  Wide: { len: 10, thick: 1, gap: 8, dot: true, outline: false, dynamic: true },
};

// share codes: NS1- + base64 of the values in a fixed order
const encode = x => 'NS1-' + btoa(JSON.stringify([x.color, x.len, x.thick, x.gap, +x.dot, +x.outline, +x.dynamic]));
function decode(code) {
  const a = JSON.parse(atob(code.trim().replace(/^NS1-/, '')));
  if (!Array.isArray(a) || a.length !== 7 || !/^#[0-9a-f]{6}$/i.test(a[0])) throw new Error('bad code');
  const n = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));
  return { color: a[0], len: n(a[1], 0, 20), thick: n(a[2], 1, 6), gap: n(a[3], 0, 20), dot: !!a[4], outline: !!a[5], dynamic: !!a[6] };
}

export function applyCrosshair(el, xh) {
  el.style.setProperty('--xhair', xh.color);
  el.style.setProperty('--len', xh.len + 'px');
  el.style.setProperty('--th', xh.thick + 'px');
  el.classList.toggle('withdot', xh.dot);
  el.classList.toggle('nooutline', !xh.outline);
}

function bestText(id, b) {
  if (!b) return 'No best score yet';
  if (id === 'tracking') return `Best: ${b.score}% on target`;
  if (id === 'flick') return `Best: ${b.score} pts · ${b.hits} hits · ${b.avgMs ?? '—'} ms average`;
  return `Best: ${b.score} pts · ${b.hits} hits · ${b.acc}% accuracy`;
}

export function initMenu({ settings, save, sfx, onCrosshair, startTab }) {
  // ---------- tabs ----------
  const tabs = [...document.querySelectorAll('.tabs [data-tab]')];
  const panels = [...document.querySelectorAll('.tabpanel')];
  const show = id => {
    for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.tab === id));
    for (const p of panels) p.hidden = p.dataset.panel !== id;
    try { localStorage.setItem('neon-static.tab', id); } catch { /* storage blocked */ }
  };
  for (const t of tabs) t.addEventListener('click', () => { sfx.uiClick(); show(t.dataset.tab); });
  let first = startTab;
  try { first ??= localStorage.getItem('neon-static.tab'); } catch { /* storage blocked */ }
  show(tabs.some(t => t.dataset.tab === first) ? first : 'play');

  // ---------- crosshair editor ----------
  const xh = settings.xh, $ = id => document.getElementById(id);
  const preview = $('xhPreview'), code = $('xhCode'), msg = $('xhMsg');
  const ranges = { xhLen: 'len', xhThick: 'thick', xhGap: 'gap' };
  const checks = { xhDot: 'dot', xhOutline: 'outline', xhDynamic: 'dynamic' };
  const sync = (persist = true) => {
    for (const [id, k] of Object.entries(ranges)) { $(id).value = xh[k]; $(id + 'Out').textContent = `${xh[k]} px`; }
    for (const [id, k] of Object.entries(checks)) $(id).checked = xh[k];
    $('xhColor').value = xh.color;
    code.value = encode(xh);
    preview.style.setProperty('--gap', xh.gap + 'px');
    applyCrosshair(preview, xh);
    onCrosshair(xh);
    if (persist) save();
  };
  for (const [id, k] of Object.entries(ranges)) $(id).addEventListener('input', e => { xh[k] = Number(e.target.value); sync(); });
  for (const [id, k] of Object.entries(checks)) $(id).addEventListener('change', e => { xh[k] = e.target.checked; sync(); });
  $('xhColor').addEventListener('input', e => { xh.color = e.target.value; sync(); });

  $('xhPresets').innerHTML = Object.keys(XH_PRESETS).map(n => `<button type="button" class="ghost" data-preset="${n}">${n}</button>`).join('');
  for (const b of $('xhPresets').querySelectorAll('[data-preset]')) {
    b.addEventListener('click', () => { Object.assign(xh, XH_PRESETS[b.dataset.preset]); sfx.uiClick(); sync(); msg.textContent = `${b.dataset.preset} preset applied.`; });
  }
  $('xhCopy').addEventListener('click', () => {
    navigator.clipboard.writeText(code.value)
      .then(() => { msg.textContent = 'Code copied.'; })
      .catch(() => { code.select(); msg.textContent = 'Copy was blocked. The code is selected: press Ctrl+C.'; });
  });
  $('xhApply').addEventListener('click', () => {
    try { Object.assign(xh, decode(code.value)); sync(); msg.textContent = 'Crosshair code applied.'; sfx.uiOk(); }
    catch { msg.textContent = 'That code is not valid. Codes start with NS1-.'; sfx.uiNo(); }
  });
  sync(false);

  // ---------- aim trainer ----------
  const best = loadBest();
  $('drillList').innerHTML = Object.entries(DRILLS).map(([id, d]) => `
    <div class="drill">
      <h2>${d.name}</h2>
      <p>${d.desc} ${d.time} seconds.</p>
      <p class="best">${bestText(id, best[id])}</p>
      <button type="button" class="ghost" data-drill="${id}">Load ${d.name.toLowerCase()}</button>
    </div>`).join('');
  for (const b of $('drillList').querySelectorAll('[data-drill]')) {
    b.addEventListener('click', () => { location.search = `?map=aimlab&drill=${b.dataset.drill}`; });
  }
}

export { bestText };
