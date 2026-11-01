// All sounds are synthesised with WebAudio, so there are no asset files.
// Buses: effects (with a short street echo), ambient (rain, city hum, sirens) and ui, all into master.
// Positional methods take an optional { gain, pan } from main's spatial().
export class Sfx {
  constructor() {
    this.ctx = null;
    this.levels = { master: 0.6, ambient: 0.5, ui: 0.6 };
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.effects = c.createGain();
    this.effects.connect(this.master);
    this.ambient = c.createGain();
    this.ambient.connect(this.master);
    this.ui = c.createGain();
    this.ui.connect(this.master);
    for (const [k, v] of Object.entries(this.levels)) this.setLevel(k, v);

    // street echo: a short filtered feedback delay on the effects bus
    const delay = c.createDelay(0.5), fb = c.createGain(), lp = c.createBiquadFilter(), wet = c.createGain();
    delay.delayTime.value = 0.13;
    fb.gain.value = 0.24;
    lp.type = 'lowpass'; lp.frequency.value = 2400;
    wet.gain.value = 0.2;
    this.effects.connect(delay);
    delay.connect(lp).connect(fb).connect(delay);
    lp.connect(wet).connect(this.master);

    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  setLevel(bus, v) {
    this.levels[bus] = v;
    const node = { master: this.master, ambient: this.ambient, ui: this.ui }[bus];
    if (node) node.gain.value = v;
  }
  setVolume(v) { this.setLevel('master', v); }

  // rain bed, low city hum and the occasional distant siren
  startAmbience() {
    const c = this.ctx;
    const rain = c.createBufferSource();
    rain.buffer = this.noise;
    rain.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.4;
    const rg = c.createGain();
    rg.gain.value = 0.32;
    rain.connect(bp).connect(rg).connect(this.ambient);
    rain.start();
    for (const [f, g] of [[48, 0.05], [72, 0.03]]) {
      const o = c.createOscillator(), og = c.createGain(), lp = c.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = f;
      lp.type = 'lowpass'; lp.frequency.value = 180;
      og.gain.value = g;
      o.connect(lp).connect(og).connect(this.ambient);
      o.start();
    }
    const siren = () => {
      const t = c.currentTime, o = c.createOscillator(), g = c.createGain(), p = c.createStereoPanner();
      o.type = 'sine';
      for (let i = 0; i < 6; i++) {
        o.frequency.setValueAtTime(650, t + i);
        o.frequency.linearRampToValueAtTime(920, t + i + 0.5);
        o.frequency.linearRampToValueAtTime(650, t + i + 1);
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.025, t + 1.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
      p.pan.value = Math.random() * 1.6 - 0.8;
      o.connect(g).connect(p).connect(this.ambient);
      o.start(t);
      o.stop(t + 6.1);
      setTimeout(siren, 25000 + Math.random() * 35000);
    };
    setTimeout(siren, 8000);
  }

  out(at, bus) {
    const dest = bus ?? this.effects;
    if (!at) return dest;
    const g = this.ctx.createGain();
    g.gain.value = at.gain;
    const p = this.ctx.createStereoPanner();
    p.pan.value = at.pan;
    g.connect(p).connect(dest);
    return g;
  }

  burst(dur, freqFrom, freqTo, vol, delay = 0, at = null, bus = null, type = 'lowpass') {
    if (!this.ctx || (at && at.gain < 0.01)) return;
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freqFrom, t);
    f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out(at, bus));
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  tone(freq, dur, type = 'sine', vol = 0.3, delay = 0, endFreq = freq, at = null, bus = null) {
    if (!this.ctx || (at && at.gain < 0.01)) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq !== freq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out(at, bus));
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // each weapon model gets its own report: [noise length, crack Hz, thump Hz, volume]
  shot(at = null, model = 'rifle') {
    const [len, crack, thump, vol] = {
      pistol: [0.12, 5000, 200, 0.4], smg: [0.1, 7000, 190, 0.38], shotgun: [0.32, 3500, 90, 0.7],
      marksman: [0.45, 9000, 70, 0.75], rifle: [0.16, 6000, 160, 0.5],
    }[model] ?? [0.16, 6000, 160, 0.5];
    const muffle = at ? 0.3 + 0.7 * at.gain : 1; // distant shots lose their crack
    this.burst(len, crack * muffle, 600, vol, 0, at);
    this.tone(thump, len * 0.8, 'triangle', vol * 1.2, 0, 40, at);
  }
  // a bullet passing close by: a fast band-passed zip
  whiz(pan) { this.burst(0.13, 4200, 900, 0.22, 0, { gain: 1, pan }, null, 'bandpass'); }
  swish() { this.burst(0.12, 6000, 1500, 0.12); }
  hit() { this.tone(1900, 0.03, 'square', 0.06); }
  head() { this.tone(2400, 0.12, 'sine', 0.25); this.tone(3600, 0.09, 'sine', 0.12, 0.01); }
  helmet() { this.tone(2900, 0.18, 'triangle', 0.22); this.tone(4300, 0.14, 'triangle', 0.12, 0.005); } // armour ping
  kill() { this.tone(220, 0.18, 'sawtooth', 0.12, 0, 110); this.tone(1200, 0.15, 'sine', 0.15, 0.03); }
  hurt() { this.tone(120, 0.16, 'square', 0.18, 0, 70); }
  click() { this.tone(900, 0.02, 'square', 0.08); }
  reload() {
    this.tone(700, 0.03, 'square', 0.1, 0.5);
    this.tone(500, 0.04, 'square', 0.12, 1.2);
    this.tone(1100, 0.03, 'square', 0.1, 2.1);
  }
  equip() { this.tone(600, 0.03, 'square', 0.07); this.tone(900, 0.03, 'square', 0.06, 0.08); }
  step(at = null) { this.burst(0.07, 420, 120, 0.18, 0, at); }
  land(at = null) { this.burst(0.12, 500, 90, 0.35, 0, at); }

  // interface sounds go to the ui bus
  uiClick() { this.tone(1300, 0.025, 'square', 0.05, 0, 1300, null, this.ui); }
  uiOk() { this.tone(880, 0.06, 'triangle', 0.12, 0, 880, null, this.ui); this.tone(1320, 0.08, 'triangle', 0.1, 0.05, 1320, null, this.ui); }
  uiNo() { this.tone(180, 0.12, 'square', 0.08, 0, 140, null, this.ui); }
}
