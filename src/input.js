// Keyboard/mouse state. `pressed` holds edge events until the next sim tick consumes them.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDown = false;
    this.lookDX = 0;
    this.lookDY = 0;
    this.enabled = false;

    const block = new Set(['Space', 'Tab', 'Backspace', 'KeyC', 'ControlLeft']);
    addEventListener('keydown', e => {
      if (!this.enabled) return;
      if (block.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('mousedown', e => {
      if (!this.enabled) return;
      if (e.button === 0) { this.mouseDown = true; this.pressed.add('Mouse0'); }
      if (e.button === 2) { this.keys.add('Mouse2'); this.pressed.add('Mouse2'); }
    });
    addEventListener('mouseup', e => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.keys.delete('Mouse2');
    });
    addEventListener('contextmenu', e => { if (this.enabled) e.preventDefault(); });
    addEventListener('wheel', e => { if (this.enabled && e.deltaY > 0) this.pressed.add('Wheel'); }, { passive: true });
    addEventListener('blur', () => this.reset());
  }

  consume(code) { return this.pressed.delete(code); }
  endTick() { this.pressed.clear(); }
  reset() { this.keys.clear(); this.pressed.clear(); this.mouseDown = false; }
}
