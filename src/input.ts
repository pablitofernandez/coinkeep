// ============================================================
//  Input: keyboard (arrows/WASD) + virtual touch/mouse joystick.
//  Returns the direction in SCREEN coordinates (x right, y down).
// ============================================================
const JOY_RADIUS = 50;

/**
 * Stop the mobile browser from zooming the page. Safari on iPhone ignores the viewport's `user-scalable=no`
 * (since iOS 10), so the gestures have to be blocked by hand:
 *  - pinch: `gesture*` events (Safari only) and any movement with two or more fingers;
 *  - double tap: if a tap ends very shortly after the previous one, its default action is cancelled.
 * Buttons and inputs are left alone (they'd lose the second click); they have `touch-action: manipulation` in the CSS,
 * which already removes double-tap zoom for them.
 */
export function preventBrowserZoom() {
  const stop = (e: Event) => e.preventDefault();
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, stop, { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', stop, { passive: false });
  let lastEnd = 0;
  document.addEventListener('touchend', e => {
    const now = e.timeStamp;
    const control = (e.target as HTMLElement | null)?.closest?.('button, input, select, textarea, summary');
    if (!control && now - lastEnd < 350) e.preventDefault();
    lastEnd = now;
  }, { passive: false });
}

/** Is the key going to a text field? (then it's not for the game) */
export const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
};

export class Input {
  private keys: Record<string, boolean> = {};
  private joy = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };
  /** Called on any key press/tap (to restart after game over). */
  onAny: () => void = () => {};

  constructor(surface: HTMLElement, private joyEl: HTMLElement, private knobEl: HTMLElement) {
    window.addEventListener('keydown', e => {
      if (isTyping(e)) return;   // typing in a developer menu field
      this.keys[e.key.toLowerCase()] = true;
      if (e.key.startsWith('Arrow')) e.preventDefault();
      this.onAny();
    });
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });

    surface.addEventListener('pointerdown', e => {
      this.onAny();
      const j = this.joy;
      j.active = true; j.id = e.pointerId; j.ox = e.clientX; j.oy = e.clientY; j.dx = j.dy = 0;
      surface.setPointerCapture(e.pointerId);
      this.drawJoy();
    });
    surface.addEventListener('pointermove', e => {
      const j = this.joy;
      if (!j.active || e.pointerId !== j.id) return;
      let dx = e.clientX - j.ox, dy = e.clientY - j.oy;
      const d = Math.hypot(dx, dy);
      // the joystick "chases" the finger if it leaves the radius
      if (d > JOY_RADIUS) {
        j.ox += dx * (1 - JOY_RADIUS / d); j.oy += dy * (1 - JOY_RADIUS / d);
        dx = e.clientX - j.ox; dy = e.clientY - j.oy;
      }
      j.dx = dx / JOY_RADIUS; j.dy = dy / JOY_RADIUS;
      this.drawJoy();
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joy.id) return;
      this.joy.active = false; this.joy.dx = this.joy.dy = 0;
      this.drawJoy();
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
  }

  private drawJoy() {
    const j = this.joy;
    this.joyEl.style.display = j.active ? 'block' : 'none';
    this.joyEl.style.transform = `translate(${j.ox - JOY_RADIUS}px, ${j.oy - JOY_RADIUS}px)`;
    this.knobEl.style.transform = `translate(${j.dx * JOY_RADIUS}px, ${j.dy * JOY_RADIUS}px)`;
  }

  /** Screen direction, magnitude 0..1 */
  screenDir(): { x: number; y: number } {
    const k = this.keys;
    let x = 0, y = 0;
    if (k['arrowleft'] || k['a']) x -= 1;
    if (k['arrowright'] || k['d']) x += 1;
    if (k['arrowup'] || k['w']) y -= 1;
    if (k['arrowdown'] || k['s']) y += 1;
    if (this.joy.active) { x += this.joy.dx; y += this.joy.dy; }
    const m = Math.hypot(x, y);
    if (m < 0.15) return { x: 0, y: 0 };
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }
}
