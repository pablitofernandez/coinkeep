// ============================================================
//  Medieval fantasy music synthesized in real time.
//  Same composition as the chiptune version (D minor, 16 bars),
//  but orchestrated with "real" instruments:
//    - flute (melody): sine + triangle, breath and vibrato
//    - harp (arpeggio): precomputed Karplus-Strong plucked string
//    - strings (pad): detuned saws with a slow attack
//    - cello (bass): heavily filtered saw
//    - deep skin drums and a soft tambourine
//  Everything goes through a castle-hall reverb.
// ============================================================

const TEMPO = 88;                         // quarter notes per minute
const EIGHTH = 60 / TEMPO / 2;            // length of an eighth note (s)
const BAR = EIGHTH * 8;
const LOOKAHEAD = 0.25;                   // scheduled this far ahead
const VOLUME = 0.42;                      // relative to the overall volume
const STORAGE_KEY = 'sg-music';

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// --- chords: bass note and arpeggio triad
const CH = {
  Dm: { bass: 38, arp: [62, 65, 69] },
  Bb: { bass: 34, arp: [58, 62, 65] },
  C:  { bass: 36, arp: [60, 64, 67] },
  F:  { bass: 41, arp: [65, 69, 72] },
  A:  { bass: 33, arp: [61, 64, 69] },
  Gm: { bass: 43, arp: [62, 67, 70] },
};
type Chord = keyof typeof CH;

// --- melody: [MIDI note (-1 = rest), length in eighths]; each bar adds up to 8
type Bar = { chord: Chord; notes: [number, number][] };
const A: Bar[] = [
  { chord: 'Dm', notes: [[69, 2], [74, 2], [76, 1], [77, 1], [76, 2]] },
  { chord: 'Bb', notes: [[74, 2], [70, 2], [72, 1], [74, 1], [77, 2]] },
  { chord: 'C',  notes: [[76, 3], [72, 1], [67, 2], [72, 2]] },
  { chord: 'Dm', notes: [[74, 4], [69, 2], [-1, 2]] },
];
const B: Bar[] = [
  { chord: 'F',  notes: [[77, 2], [81, 2], [79, 1], [77, 1], [76, 2]] },
  { chord: 'Gm', notes: [[74, 2], [79, 2], [77, 1], [74, 1], [70, 2]] },
  { chord: 'C',  notes: [[76, 2], [79, 2], [77, 1], [76, 1], [74, 1], [72, 1]] },
  { chord: 'A',  notes: [[73, 4], [76, 2], [69, 2]] },
];
const A2: Bar[] = [A[0], A[1], A[2], { chord: 'Dm', notes: [[74, 6], [-1, 2]] }];
const SONG: Bar[] = [...A, ...B, ...A, ...A2];
/** On the first pass of part A the flute rests and only harp and strings play (intro). */
const INTRO_BARS = 4;

/** Harp arpeggio in eighths: indices into [triad..., tonic an octave up]. */
const HARP_PATTERN = [0, 1, 2, 3, 2, 1, 2, 1];

export class Music {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private noise!: AudioBuffer;
  private strings = new Map<number, { buf: AudioBuffer; rate: number }>();
  private bar = 0;
  private loops = 0;
  private nextBarT = 0;
  private timer = 0;
  enabled = true;
  onChange: (on: boolean) => void = () => {};

  constructor() {
    try { this.enabled = localStorage.getItem(STORAGE_KEY) !== '0'; } catch { /* no storage */ }
  }

  attach(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.enabled ? VOLUME : 0;
    // hall reverb: generated impulse response (noise that fades out in ~2.4 s)
    const rev = ctx.createConvolver(), wet = ctx.createGain();
    rev.buffer = this.makeImpulse(2.4);
    wet.gain.value = 0.35;
    this.out.connect(dest);
    this.out.connect(rev).connect(wet).connect(dest);

    const len = ctx.sampleRate * 0.4;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // harp strings: one for each note that will be used
    for (const c of Object.values(CH)) for (const n of [...c.arp, c.arp[0] + 12]) {
      if (!this.strings.has(n)) this.strings.set(n, this.pluck(hz(n)));
    }

    this.nextBarT = ctx.currentTime + 0.3;
    this.timer = window.setInterval(() => this.schedule(), 80);
  }

  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem(STORAGE_KEY, this.enabled ? '1' : '0'); } catch { /* nothing */ }
    if (this.ctx) this.out.gain.setTargetAtTime(this.enabled ? VOLUME * this.volume : 0, this.ctx.currentTime, 0.1);
    this.onChange(this.enabled);
  }

  /** Music volume (0..1) relative to its normal volume. */
  volume = 1;
  setVolume(v: number) {
    this.volume = v;
    if (this.ctx && this.enabled) this.out.gain.setTargetAtTime(VOLUME * v, this.ctx.currentTime, 0.1);
  }

  dispose() { clearInterval(this.timer); }

  /** Schedule the bars that start within the lookahead window. */
  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    // if the tab was paused and we fell behind, resume from now
    if (this.nextBarT < ctx.currentTime - 0.1) this.nextBarT = ctx.currentTime + 0.05;
    while (this.nextBarT < ctx.currentTime + LOOKAHEAD) {
      if (this.enabled) this.playBar(this.bar, this.nextBarT);
      this.bar = (this.bar + 1) % SONG.length;
      if (this.bar === 0) this.loops++;
      this.nextBarT += BAR;
    }
  }

  private playBar(index: number, t0: number) {
    const bar = SONG[index];
    const ch = CH[bar.chord];
    const intro = this.loops === 0 && index < INTRO_BARS;

    // flute
    if (!intro) {
      let t = t0;
      for (const [n, len] of bar.notes) {
        if (n >= 0) this.flute(t, hz(n), len * EIGHTH * 0.95, 0.075);
        t += len * EIGHTH;
      }
    }
    // harp
    const harp = [...ch.arp, ch.arp[0] + 12];
    for (let i = 0; i < 8; i++) {
      const accent = i === 0 || i === 4 ? 1 : 0.7;
      this.harp(t0 + i * EIGHTH, harp[HARP_PATTERN[i]], 0.16 * accent);
    }
    // strings: the whole chord, an octave down, for the entire bar
    for (const n of ch.arp) this.pad(t0, hz(n - 12), BAR, 0.022);
    // cello: half notes on the tonic (and the fifth in the second half)
    this.cello(t0, hz(ch.bass), EIGHTH * 4, 0.1);
    this.cello(t0 + EIGHTH * 4, hz(ch.bass + 7), EIGHTH * 4, 0.08);
    // percussion: deep drum on 1, softer on 3 and a fill at the end; tambourine on 2 and 4
    if (!intro) {
      this.drum(t0, 0.3);
      this.drum(t0 + EIGHTH * 4, 0.18);
      if (index % 4 === 3) this.drum(t0 + EIGHTH * 7, 0.14);
      this.shaker(t0 + EIGHTH * 2, 0.025);
      this.shaker(t0 + EIGHTH * 6, 0.025);
    }
  }

  // ------------------------------------------------------------
  //  Instruments
  // ------------------------------------------------------------

  /** Flute: soft attack with a little breath, vibrato that comes in late on long notes. */
  private flute(t: number, f: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3200;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o1.type = 'sine'; o1.frequency.value = f;
    o2.type = 'triangle'; o2.frequency.value = f; g2.gain.value = 0.35;
    if (dur > EIGHTH * 1.5) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.2;
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(0, t + dur * 0.35);
      lg.gain.linearRampToValueAtTime(f * 0.008, t + dur);
      lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.1);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
    g.gain.setValueAtTime(vol, t + Math.max(0.05, dur - 0.08));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    o1.connect(g); o2.connect(g2).connect(g);
    g.connect(lp).connect(this.out);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
    // breath at the start of the note
    const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), sg = ctx.createGain();
    s.buffer = this.noise;
    bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 3;
    sg.gain.setValueAtTime(vol * 0.5, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    s.connect(bp).connect(sg).connect(this.out);
    s.start(t, Math.random() * 0.2); s.stop(t + 0.1);
  }

  /** Harp: plays the precomputed plucked string. */
  private harp(t: number, midi: number, vol: number) {
    const str = this.strings.get(midi);
    if (!str) return;
    const ctx = this.ctx!;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = str.buf;
    s.playbackRate.value = str.rate;
    g.gain.value = vol;
    s.connect(g).connect(this.out);
    s.start(t);
  }

  /** String pad: two detuned, filtered saws that fade in and out slowly. */
  private pad(t: number, f: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.setValueAtTime(vol, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
    for (const det of [-7, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      o.connect(lp);
      o.start(t); o.stop(t + dur + 0.3);
    }
    lp.connect(g).connect(this.out);
  }

  /** Cello: saw with a very closed filter, gentle bowing. */
  private cello(t: number, f: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.value = 450; lp.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.08);
    g.gain.setValueAtTime(vol * 0.8, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(this.out);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /** Deep skin drum (bodhrán / kettledrum style). */
  private drum(t: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.25);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(this.out);
    o.start(t); o.stop(t + 0.37);
    // the hand striking the skin
    const s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), sg = ctx.createGain();
    s.buffer = this.noise;
    lp.type = 'lowpass'; lp.frequency.value = 600;
    sg.gain.setValueAtTime(vol * 0.4, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    s.connect(lp).connect(sg).connect(this.out);
    s.start(t, Math.random() * 0.2); s.stop(t + 0.08);
  }

  /** Very soft tambourine. */
  private shaker(t: number, vol: number) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise;
    hp.type = 'highpass'; hp.frequency.value = 6500;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    s.connect(hp).connect(g).connect(this.out);
    s.start(t, Math.random() * 0.2); s.stop(t + 0.14);
  }

  // ------------------------------------------------------------
  //  Precomputation
  // ------------------------------------------------------------

  /** Plucked string (Karplus-Strong). Exact tuning is corrected with playbackRate. */
  private pluck(f: number) {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const N = Math.max(2, Math.round(sr / f));
    const len = Math.floor(sr * 1.8);
    const buf = ctx.createBuffer(1, len, sr);
    const y = buf.getChannelData(0);
    // excitation: smoothed noise (plucked with a fingertip, not a pick)
    let prev = 0;
    for (let i = 0; i < N; i++) { prev = prev * 0.5 + (Math.random() * 2 - 1) * 0.5; y[i] = prev; }
    const decay = 0.996;
    for (let i = N; i < len; i++) y[i] = decay * 0.5 * (y[i - N] + y[Math.max(0, i - N - 1)]);
    // normalize and gently fade out the end
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(y[i]));
    const fade = Math.floor(sr * 0.2);
    for (let i = 0; i < len; i++) {
      y[i] /= peak || 1;
      if (i > len - fade) y[i] *= (len - i) / fade;
    }
    // the N+0.5-sample loop sounds at sr/(N+0.5)
    return { buf, rate: f * (N + 0.5) / sr };
  }

  /** Stereo impulse response for the reverb. */
  private makeImpulse(seconds: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }
}
