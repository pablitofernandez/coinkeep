// ============================================================
//  Música de fantasía medieval sintetizada en tiempo real.
//  Misma composición que la versión chiptune (re menor, 16 compases),
//  pero orquestada con instrumentos «de verdad»:
//    - flauta (melodía): senoidal + triangular, soplido y vibrato
//    - arpa (arpegio): cuerda pulsada Karplus-Strong precalculada
//    - cuerdas (colchón): sierras desafinadas con entrada lenta
//    - chelo (bajo): sierra muy filtrada
//    - tambores de piel graves y pandereta suave
//  Todo pasa por una reverberación de sala de castillo.
// ============================================================

const TEMPO = 88;                         // negras por minuto
const EIGHTH = 60 / TEMPO / 2;            // duración de una corchea (s)
const BAR = EIGHTH * 8;
const LOOKAHEAD = 0.25;                   // se programa con este margen
const VOLUME = 0.42;                      // relativo al volumen general
const STORAGE_KEY = 'sg-music';

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// --- acordes: nota del bajo y tríada del arpegio
const CH = {
  Dm: { bass: 38, arp: [62, 65, 69] },
  Bb: { bass: 34, arp: [58, 62, 65] },
  C:  { bass: 36, arp: [60, 64, 67] },
  F:  { bass: 41, arp: [65, 69, 72] },
  A:  { bass: 33, arp: [61, 64, 69] },
  Gm: { bass: 43, arp: [62, 67, 70] },
};
type Chord = keyof typeof CH;

// --- melodía: [nota MIDI (-1 = silencio), duración en corcheas]; cada compás suma 8
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
/** En la primera vuelta de la parte A la flauta descansa y solo suenan arpa y cuerdas (intro). */
const INTRO_BARS = 4;

/** Arpegio del arpa en corcheas: índices sobre [tríada..., tónica una octava arriba]. */
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
    try { this.enabled = localStorage.getItem(STORAGE_KEY) !== '0'; } catch { /* sin almacenamiento */ }
  }

  attach(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.enabled ? VOLUME : 0;
    // reverberación de sala: respuesta al impulso generada (ruido que se apaga en ~2,4 s)
    const rev = ctx.createConvolver(), wet = ctx.createGain();
    rev.buffer = this.makeImpulse(2.4);
    wet.gain.value = 0.35;
    this.out.connect(dest);
    this.out.connect(rev).connect(wet).connect(dest);

    const len = ctx.sampleRate * 0.4;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // cuerdas del arpa: una por cada nota que se va a usar
    for (const c of Object.values(CH)) for (const n of [...c.arp, c.arp[0] + 12]) {
      if (!this.strings.has(n)) this.strings.set(n, this.pluck(hz(n)));
    }

    this.nextBarT = ctx.currentTime + 0.3;
    this.timer = window.setInterval(() => this.schedule(), 80);
  }

  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem(STORAGE_KEY, this.enabled ? '1' : '0'); } catch { /* nada */ }
    if (this.ctx) this.out.gain.setTargetAtTime(this.enabled ? VOLUME * this.volume : 0, this.ctx.currentTime, 0.1);
    this.onChange(this.enabled);
  }

  /** Volumen de la música (0..1) relativo a su volumen normal. */
  volume = 1;
  setVolume(v: number) {
    this.volume = v;
    if (this.ctx && this.enabled) this.out.gain.setTargetAtTime(VOLUME * v, this.ctx.currentTime, 0.1);
  }

  dispose() { clearInterval(this.timer); }

  /** Programa los compases que empiezan dentro del margen de anticipación. */
  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    // si la pestaña estuvo parada y nos quedamos atrás, se retoma desde ahora
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

    // flauta
    if (!intro) {
      let t = t0;
      for (const [n, len] of bar.notes) {
        if (n >= 0) this.flute(t, hz(n), len * EIGHTH * 0.95, 0.075);
        t += len * EIGHTH;
      }
    }
    // arpa
    const harp = [...ch.arp, ch.arp[0] + 12];
    for (let i = 0; i < 8; i++) {
      const accent = i === 0 || i === 4 ? 1 : 0.7;
      this.harp(t0 + i * EIGHTH, harp[HARP_PATTERN[i]], 0.16 * accent);
    }
    // cuerdas: el acorde entero, una octava abajo, durante todo el compás
    for (const n of ch.arp) this.pad(t0, hz(n - 12), BAR, 0.022);
    // chelo: blancas sobre la tónica (y la quinta en la segunda mitad)
    this.cello(t0, hz(ch.bass), EIGHTH * 4, 0.1);
    this.cello(t0 + EIGHTH * 4, hz(ch.bass + 7), EIGHTH * 4, 0.08);
    // percusión: tambor grave en 1, más suave en 3 y repique al final; pandereta en 2 y 4
    if (!intro) {
      this.drum(t0, 0.3);
      this.drum(t0 + EIGHTH * 4, 0.18);
      if (index % 4 === 3) this.drum(t0 + EIGHTH * 7, 0.14);
      this.shaker(t0 + EIGHTH * 2, 0.025);
      this.shaker(t0 + EIGHTH * 6, 0.025);
    }
  }

  // ------------------------------------------------------------
  //  Instrumentos
  // ------------------------------------------------------------

  /** Flauta: entrada suave con un poco de soplido, vibrato que llega tarde en las notas largas. */
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
    // soplido al atacar la nota
    const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), sg = ctx.createGain();
    s.buffer = this.noise;
    bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 3;
    sg.gain.setValueAtTime(vol * 0.5, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    s.connect(bp).connect(sg).connect(this.out);
    s.start(t, Math.random() * 0.2); s.stop(t + 0.1);
  }

  /** Arpa: reproduce la cuerda pulsada precalculada. */
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

  /** Colchón de cuerdas: dos sierras desafinadas, filtradas, que entran y salen despacio. */
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

  /** Chelo: sierra con filtro muy cerrado, arco suave. */
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

  /** Tambor de piel grave (tipo bodhrán / timbal). */
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
    // golpe de la mano sobre la piel
    const s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), sg = ctx.createGain();
    s.buffer = this.noise;
    lp.type = 'lowpass'; lp.frequency.value = 600;
    sg.gain.setValueAtTime(vol * 0.4, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    s.connect(lp).connect(sg).connect(this.out);
    s.start(t, Math.random() * 0.2); s.stop(t + 0.08);
  }

  /** Pandereta muy suave. */
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
  //  Precálculo
  // ------------------------------------------------------------

  /** Cuerda pulsada (Karplus-Strong). La afinación exacta se corrige con playbackRate. */
  private pluck(f: number) {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const N = Math.max(2, Math.round(sr / f));
    const len = Math.floor(sr * 1.8);
    const buf = ctx.createBuffer(1, len, sr);
    const y = buf.getChannelData(0);
    // excitación: ruido suavizado (pulsación con la yema, no con púa)
    let prev = 0;
    for (let i = 0; i < N; i++) { prev = prev * 0.5 + (Math.random() * 2 - 1) * 0.5; y[i] = prev; }
    const decay = 0.996;
    for (let i = N; i < len; i++) y[i] = decay * 0.5 * (y[i - N] + y[Math.max(0, i - N - 1)]);
    // normaliza y apaga suavemente el final
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(y[i]));
    const fade = Math.floor(sr * 0.2);
    for (let i = 0; i < len; i++) {
      y[i] /= peak || 1;
      if (i > len - fade) y[i] *= (len - i) / fade;
    }
    // el bucle de N+0,5 muestras suena a sr/(N+0,5)
    return { buf, rate: f * (N + 0.5) / sr };
  }

  /** Respuesta al impulso estéreo para la reverberación. */
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
