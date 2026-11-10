// ============================================================
//  Sonido con WebAudio: golpes grabados (Kenney Impact Sounds) más
//  tonos sintetizados, pasos del caballero y música de fondo.
//  Escucha los eventos de la simulación y los convierte en efectos.
// ============================================================
import { BASE, WORLD } from './config';
import type { EnemyKind, GameEvent, GameState, SfxName } from './game/types';
import { Music } from './music';

/** Grupos de muestras en public/sounds (5 variantes de cada uno: nombre_0..4.mp3). */
const SAMPLES = [
  'impactPunch_heavy', 'impactSoft_medium',
  'impactWood_heavy', 'impactPlank_medium', 'impactMining', 'impactPlate_heavy',
  'impactBell_heavy', 'footstep_grass', 'footstep_concrete',
] as const;
type Sample = typeof SAMPLES[number];
const STEP_EVERY = 0.27;         // segundos entre pasos al correr

type Wave = OscillatorType;

/** Tiempo mínimo entre dos reproducciones del mismo sonido (evita saturar con 30 torres). */
const MIN_GAP: Partial<Record<SfxName, number>> = {
  sword: 0.08, bow: 0.08, arrow: 0.07, cannon: 0.12, boom: 0.1, die: 0.05, dieBones: 0.05, dieBat: 0.05, heal: 0.3, bite: 0.1,
  coin: 0.06, pay: 0.07, baseHit: 0.25,
};
/** Sonido de muerte de cada tipo de enemigo. */
const DIE_SOUND: Record<EnemyKind, SfxName> = { zombie: 'die', shaman: 'die', runner: 'dieBones', bat: 'dieBat' };
const MAX_VOICES = 14;           // sonidos simultáneos como mucho
const HEAR_RANGE = 14;           // a partir de esta distancia al jugador no se oye

const STORAGE_KEY = 'sg-muted';

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private out!: GainNode;
  private sfxVolume = 1;
  private noise!: AudioBuffer;
  private buffers = new Map<Sample, AudioBuffer[]>();
  private stepT = 0;
  readonly music = new Music();
  private last = new Map<SfxName, number>();
  private voices = 0;
  private coinPitch = 0;          // las monedas seguidas suben de tono
  private coinPitchT = 0;
  muted = false;
  onMuteChange: (muted: boolean) => void = () => {};

  constructor() {
    try { this.muted = localStorage.getItem(STORAGE_KEY) === '1'; } catch { /* sin almacenamiento */ }
    // Los navegadores solo dejan arrancar el audio tras una interacción del usuario.
    const unlock = () => { this.init(); if (this.ctx?.state === 'suspended') this.ctx.resume(); };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { passive: true });
    // en segundo plano, se suspende (ahorra batería en el móvil)
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
    });
  }

  private init() {
    if (this.ctx) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    // compresor final: evita que muchos sonidos juntos saturen
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    comp.connect(ctx.destination);
    // out: volumen general (silencio con M); master: solo los efectos (la música va directa a out)
    this.out = ctx.createGain();
    this.out.gain.value = this.muted ? 0 : 0.5;
    this.out.connect(comp);
    this.master = ctx.createGain();
    this.master.gain.value = this.sfxVolume;
    this.master.connect(this.out);
    this.music.attach(ctx, this.out);
    this.loadSamples();
    const len = ctx.sampleRate * 0.5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0'); } catch { /* nada */ }
    if (this.ctx) this.out.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    this.onMuteChange(this.muted);
  }

  /** Volumen de los efectos (0..1), aparte de la música. */
  setSfxVolume(v: number) {
    this.sfxVolume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Reproduce un efecto suelto a todo volumen (botonera del menú de desarrollo). */
  test(name: SfxName) {
    this.init();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    if (!this.ctx || this.muted) return;
    this.last.delete(name);
    this.play(name, 1);
  }

  /** Descarga y decodifica las muestras; mientras no estén, se usan los tonos sintetizados. */
  private loadSamples() {
    const ctx = this.ctx!;
    for (const name of SAMPLES) {
      Promise.all([0, 1, 2, 3, 4].map(i =>
        fetch(`${import.meta.env.BASE_URL}sounds/${name}_${i}.mp3`)
          .then(r => r.arrayBuffer())
          .then(b => new Promise<AudioBuffer>((ok, ko) => ctx.decodeAudioData(b, ok, ko))),
      )).then(list => this.buffers.set(name, list)).catch(() => { /* sin muestra: se sintetiza */ });
    }
  }

  /** Procesa los eventos de un frame (se llama antes de que la vista los vacíe). */
  handle(G: GameState, events: GameEvent[]) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    this.footsteps(G);
    for (const ev of events) {
      switch (ev.type) {
        case 'sfx': this.play(ev.name, this.volAt(G, ev.x, ev.y)); break;
        case 'boom': this.play('boom', this.volAt(G, ev.x, ev.y)); break;
        case 'enemyDied': this.play(ev.boss ? 'bossDie' : DIE_SOUND[ev.kind], this.volAt(G, ev.x, ev.y)); break;
        case 'built': this.play('build', 1); break;
        case 'towerUpgraded': case 'padUpgraded': this.play('upgrade', 1); break;
        case 'baseHit': this.play('baseHit', 0.8); break;
      }
    }
  }

  /** Pasos del caballero: tierra en la explanada, hierba fuera. */
  private footsteps(G: GameState) {
    const now = this.ctx!.currentTime;
    if (!G.player.moving || G.over) { this.stepT = now; return; }
    if (now - this.stepT < STEP_EVERY) return;
    this.stepT = now;
    const onDirt = Math.hypot(G.player.x - BASE.x, G.player.y - BASE.y) < WORLD.clearingRadius;
    this.sample(onDirt ? 'footstep_concrete' : 'footstep_grass', onDirt ? 0.16 : 0.22, 0.95 + Math.random() * 0.1);
  }

  /** Reproduce una variante al azar de una muestra. Devuelve false si aún no está cargada. */
  private sample(name: Sample, vol: number, rate = 1, t = this.ctx!.currentTime) {
    const list = this.buffers.get(name);
    if (!list || this.voices >= MAX_VOICES) return false;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = rate;
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start(t);
    this.voice(src.buffer.duration / rate);
    return true;
  }

  private volAt(G: GameState, x?: number, y?: number) {
    if (x === undefined || y === undefined) return 1;
    const d = Math.hypot(x - G.player.x, y - G.player.y);
    return Math.max(0, 1 - d / HEAR_RANGE) * 0.8 + 0.2 * (d < HEAR_RANGE ? 1 : 0);
  }

  private play(name: SfxName, vol: number) {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    if (vol <= 0.02 || this.voices >= MAX_VOICES) return;
    const gap = MIN_GAP[name] ?? 0;
    if (now - (this.last.get(name) ?? -1) < gap) return;
    this.last.set(name, now);
    const r = 0.94 + Math.random() * 0.12;   // ligera variación para que no suene repetitivo

    switch (name) {
      case 'sword':
        // tajo: silbido de la hoja cortando el aire + golpe sordo y carnoso al impactar
        this.swish(now, 0.13, 0.22 * vol, r);
        if (!this.sample('impactPunch_heavy', 0.3 * vol, 1.25 * r, now + 0.06)) this.noiseHit(now + 0.06, 0.08, 500, 'lowpass', 0.2 * vol);
        break;
      case 'bow': this.tone(now, 'triangle', 420 * r, 180, 0.09, 0.18 * vol); this.noiseHit(now, 0.05, 4000, 'highpass', 0.08 * vol); break;
      case 'arrow': this.noiseHit(now, 0.06, 3200 * r, 'bandpass', 0.12 * vol, 3); break;
      case 'cannon': this.tone(now, 'sine', 120 * r, 45, 0.25, 0.45 * vol); this.noiseHit(now, 0.15, 900, 'lowpass', 0.25 * vol); break;
      case 'boom':
        this.noiseHit(now, 0.35, 600 * r, 'lowpass', 0.35 * vol); this.tone(now, 'sine', 80, 35, 0.3, 0.3 * vol);
        this.sample('impactWood_heavy', 0.45 * vol, 0.7 * r);
        break;
      case 'die':
        // gruñido ronco del zombi que se apaga + el cuerpo cayendo al suelo
        this.groan(now, 0.32 * r, 0.11 * vol, 150 * r);
        if (!this.sample('impactSoft_medium', 0.45 * vol, 0.7 * r, now + 0.22)) this.noiseHit(now + 0.22, 0.12, 300, 'lowpass', 0.25 * vol);
        break;
      case 'dieBones':
        // esqueleto: huesos que se desmoronan (tablones agudos encadenados)
        for (let i = 0; i < 3; i++) {
          const t = now + i * 0.06 + Math.random() * 0.02;
          if (!this.sample('impactPlank_medium', (0.32 - i * 0.07) * vol, (1.9 + i * 0.25) * r, t)) this.noiseHit(t, 0.04, 2500, 'bandpass', 0.12 * vol, 4);
        }
        break;
      case 'dieBat':
        // murciélago: chillido agudo que cae + golpecito al caer
        this.tone(now, 'sine', 2600 * r, 1300 * r, 0.12, 0.07 * vol);
        this.tone(now + 0.05, 'triangle', 2100 * r, 900 * r, 0.1, 0.05 * vol);
        if (!this.sample('impactSoft_medium', 0.3 * vol, 1.5 * r, now + 0.18)) this.noiseHit(now + 0.18, 0.06, 900, 'lowpass', 0.12 * vol);
        break;
      case 'heal':
        // hechizo de curación del mago: brillo suave ascendente
        this.arp(now, [880 * r, 1109 * r, 1319 * r, 1760 * r], 0.05, 'sine', 0.06 * vol);
        break;
      case 'bossDie':
        this.tone(now, 'sawtooth', 300, 40, 0.8, 0.2 * vol);
        this.noiseHit(now, 0.6, 500, 'lowpass', 0.4 * vol);
        this.sample('impactPunch_heavy', 0.9 * vol, 0.75);
        break;
      case 'bite':
        if (!this.sample('impactSoft_medium', 0.6 * vol, 1.3 * r)) { this.noiseHit(now, 0.05, 1800 * r, 'bandpass', 0.18 * vol, 5); this.tone(now, 'square', 300 * r, 200, 0.04, 0.05 * vol); }
        break;
      case 'coin': {
        // las monedas encadenadas suben de tono, como un "ding ding ding"
        if (now - this.coinPitchT > 0.4) this.coinPitch = 0;
        this.coinPitchT = now;
        const f = 1300 * Math.pow(2, Math.min(this.coinPitch, 12) / 24);
        this.coinPitch++;
        this.tone(now, 'square', f, f, 0.05, 0.05 * vol);
        this.tone(now + 0.04, 'square', f * 1.5, f * 1.5, 0.08, 0.04 * vol);
        break;
      }
      case 'pay': this.tone(now, 'triangle', 700 * r, 900 * r, 0.05, 0.08 * vol); break;
      case 'build':
        // tablones y martillazo
        this.sample('impactPlank_medium', 0.6, 1);
        this.sample('impactWood_heavy', 0.5, 1.05, now + 0.14);
        this.arp(now + 0.1, [392, 523, 659, 784], 0.07, 'triangle', 0.12);
        break;
      case 'upgrade':
        this.sample('impactMining', 0.55, 1.1);
        this.arp(now + 0.05, [523, 659, 784, 1047], 0.06, 'square', 0.05);
        break;
      case 'baseHit':
        if (!this.sample('impactPlate_heavy', 0.6 * vol, 0.8 * r)) { this.tone(now, 'sine', 90, 60, 0.2, 0.4 * vol); this.noiseHit(now, 0.12, 300, 'lowpass', 0.3 * vol); }
        break;
      case 'wave':
        // tambores de guerra + cuerno grave de dos notas (larga y luego una quinta arriba)
        this.warDrum(now, 0.5); this.warDrum(now + 0.28, 0.35); this.warDrum(now + 0.56, 0.55);
        this.warHorn(now + 0.1, 110, 0.9, 0.16);
        this.warHorn(now + 1.0, 165, 0.75, 0.13);
        break;
      case 'boss':
        this.sample('impactBell_heavy', 0.7, 0.6);
        this.sample('impactBell_heavy', 0.6, 0.6, now + 0.5);
        this.horn(now, [110, 104, 98], 0.9); this.tone(now, 'sine', 55, 40, 1.2, 0.4);
        break;
      case 'waveClear': this.arp(now, [523, 659, 784, 1047, 1319], 0.08, 'triangle', 0.15); break;
      case 'gameOver': this.arp(now, [392, 330, 262, 196], 0.25, 'sawtooth', 0.12); break;
    }
  }

  // ------------------------------------------------------------
  //  Piezas básicas de síntesis
  // ------------------------------------------------------------
  private voice(dur: number) {
    this.voices++;
    setTimeout(() => this.voices--, dur * 1000 + 50);
  }

  /** Tono con barrido de frecuencia y envolvente rápida. */
  private tone(t: number, type: Wave, f0: number, f1: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
    this.voice(dur);
  }

  /** Golpe de ruido filtrado (impactos, explosiones, silbidos). */
  private noiseHit(t: number, dur: number, freq: number, filter: BiquadFilterType, vol: number, q = 1) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise;
    f.type = filter; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.2); s.stop(t + dur + 0.02);
    this.voice(dur);
  }

  /** Arpegio de notas cortas. */
  private arp(t: number, notes: number[], step: number, type: Wave, vol: number) {
    notes.forEach((f, i) => this.tone(t + i * step, type, f, f, step * 2.2, vol));
  }

  /** Silbido de una hoja: ruido en banda que sube de tono muy deprisa. */
  private swish(t: number, dur: number, vol: number, r: number) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise;
    f.type = 'bandpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(700 * r, t);
    f.frequency.exponentialRampToValueAtTime(3200 * r, t + dur * 0.7);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.2); s.stop(t + dur + 0.02);
    this.voice(dur);
  }

  /** Gruñido gutural: diente de sierra grave que cae, filtrado como una garganta. */
  private groan(t: number, dur: number, vol: number, f0: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain();
    const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + dur);
    // dos "formantes" de vocal oscura (una «o» ronca) que se cierran al final
    f1.type = 'bandpass'; f1.Q.value = 4; f1.frequency.setValueAtTime(550, t); f1.frequency.linearRampToValueAtTime(380, t + dur);
    f2.type = 'lowpass'; f2.frequency.value = 1100;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f1).connect(f2).connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
    this.voice(dur);
  }

  /** Tambor de guerra grave (tipo timbal de piel). */
  private warDrum(t: number, vol: number) {
    this.tone(t, 'sine', 95, 48, 0.45, vol);
    this.noiseHit(t, 0.12, 350, 'lowpass', vol * 0.5);
  }

  /** Cuerno de guerra de verdad: varias sierras desafinadas, entrada lenta, formante de metal y vibrato. */
  private warHorn(t: number, f: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain(), bp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter();
    bp.type = 'peaking'; bp.frequency.value = 650; bp.Q.value = 1.2; bp.gain.value = 8;
    lp.type = 'lowpass';
    // el timbre se abre al soplar y se cierra al final, como un cuerno real
    lp.frequency.setValueAtTime(350, t);
    lp.frequency.linearRampToValueAtTime(1500, t + 0.25);
    lp.frequency.setValueAtTime(1500, t + dur * 0.75);
    lp.frequency.linearRampToValueAtTime(400, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.2);
    g.gain.setValueAtTime(vol, t + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 4.8; lg.gain.value = f * 0.006;
    lfo.connect(lg);
    for (const det of [-8, 0, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      o.frequency.setValueAtTime(f * 0.94, t);           // entra un poco bajo y sube (el labio)
      o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
      lg.connect(o.frequency);
      o.connect(bp);
      o.start(t); o.stop(t + dur + 0.02);
    }
    bp.connect(lp).connect(g).connect(this.master);
    lfo.start(t); lfo.stop(t + dur + 0.02);
    this.voice(dur);
  }

  /** Cuerno sencillo (llegada del jefe). */
  private horn(t: number, notes: number[], dur: number) {
    const ctx = this.ctx!;
    for (const f of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.97, t);
      o.frequency.linearRampToValueAtTime(f, t + 0.15);
      lp.type = 'lowpass'; lp.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.12);
      g.gain.setValueAtTime(0.12, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp).connect(g).connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
      this.voice(dur);
    }
  }
}
