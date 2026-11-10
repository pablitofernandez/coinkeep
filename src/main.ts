import { autopilotDir } from './game/cheats';
import { createGame, step } from './game/sim';
import type { GameState, Vec } from './game/types';
import { Sound } from './audio';
import { DevLog } from './devlog';
import { Input, isTyping } from './input';
import { loadAssets } from './render/assets';
import { CAM_ELEVATION_SIN, View, fmt } from './render/view';

const $ = (id: string) => document.getElementById(id)!;

// --- carga de modelos 3D (antes de crear la escena)
const loading = $('loading');
await loadAssets(k => { loading.textContent = `Cargando… ${Math.round(k * 100)}%`; });
loading.remove();

const view = new View($('app'));
const input = new Input(document.body, $('joy'), $('joy-knob'));
let G: GameState = createGame();
view.reset(G);
const devlog = new DevLog();
devlog.start();

// --- sonido (botón 🔊 o tecla M)
const sound = new Sound();
const muteBtn = $('mute');
const showMute = (m: boolean) => { muteBtn.textContent = m ? '🔇' : '🔊'; };
showMute(sound.muted);
sound.onMuteChange = showMute;
muteBtn.addEventListener('pointerdown', e => e.stopPropagation());   // que no mueva el joystick
muteBtn.addEventListener('click', () => sound.toggleMute());
window.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'm' && !e.repeat && !isTyping(e)) sound.toggleMute(); });

// --- música (botón o tecla N)
const musicBtn = $('music');
const showMusic = (on: boolean) => musicBtn.classList.toggle('off', !on);
showMusic(sound.music.enabled);
sound.music.onChange = showMusic;
musicBtn.addEventListener('pointerdown', e => e.stopPropagation());
musicBtn.addEventListener('click', () => sound.music.toggle());
window.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'n' && !e.repeat && !isTyping(e)) sound.music.toggle(); });

window.addEventListener('resize', () => view.resize());

function restart() {
  G = createGame();
  view.reset(G);
  devlog.start();
  $('gameover').classList.add('hidden');
}
input.onAny = () => { if (G.over) restart(); };

/**
 * Convierte la dirección de pantalla en dirección de suelo.
 * Con la cámara en (+x, +y, +z): derecha de pantalla = (1, -1)/√2 y
 * abajo = (1, 1)/√2, este último acortado por la inclinación de la cámara.
 */
function screenToWorld(s: Vec): Vec {
  const mag = Math.hypot(s.x, s.y);
  if (mag === 0) return { x: 0, y: 0 };
  const sy = s.y / CAM_ELEVATION_SIN;
  const wx = (s.x + sy) / Math.SQRT2, wy = (sy - s.x) / Math.SQRT2;
  const wm = Math.hypot(wx, wy);
  return { x: wx / wm * mag, y: wy / wm * mag };
}

// --- HUD (solo se toca el DOM cuando cambia algo: tocarlo cada frame calienta el móvil)
const hud = { coins: $('hud-coins'), wave: $('hud-wave'), sub: $('hud-sub'), hp: $('hud-hp'), hpText: $('hud-hp-text'), help: $('help') };
const cache = new Map<HTMLElement, string>();
const setText = (el: HTMLElement, v: string) => { if (cache.get(el) !== v) { cache.set(el, v); el.textContent = v; } };
const setStyle = (el: HTMLElement, prop: 'width' | 'opacity', v: string) => {
  const k = prop + v; if (cache.get(el) !== k) { cache.set(el, k); el.style[prop] = v; }
};
let lastOver = false;
function updateHud() {
  setText(hud.coins, fmt(G.player.coins));
  setText(hud.wave, G.wave ? 'Oleada ' + G.wave : 'Preparados…');
  setText(hud.sub, `Siguiente en ${Math.ceil(G.waveTimer)}s · Enemigos: ${G.enemies.length}`);
  setStyle(hud.hp, 'width', Math.round(G.base.hp / G.base.max * 100) + '%');
  setText(hud.hpText, `🏰 ${Math.ceil(G.base.hp)}/${G.base.max}`);
  setStyle(hud.help, 'opacity', Math.max(0, Math.min(1, (10 - G.t) / 2)).toFixed(2));
  if (G.over && !lastOver) {
    $('go-text').textContent = `Has llegado a la oleada ${G.wave} con ${G.buildings.length} torres`;
    $('gameover').classList.remove('hidden');
  }
  lastOver = G.over;
}

// --- control del tiempo (lo usa el menú de desarrollo)
export interface TimeControl {
  scale: number;          // velocidad del juego (1 = normal)
  paused: boolean;
  stepOnce: boolean;      // avanzar un solo paso estando en pausa
  turboTo: number;        // > 0: simular a toda máquina (con piloto automático) hasta esta oleada
  turboNote: string;      // resultado de la última simulación rápida
}
const time: TimeControl = { scale: 1, paused: false, stepOnce: false, turboTo: 0, turboNote: '' };

// --- bucle principal (paso fijo para que la simulación sea estable)
// Se limita a ~60 fps: en pantallas de 120 Hz el navegador pediría el doble de frames.
const FIXED = 1 / 60;
const MIN_FRAME_MS = 1000 / 61;
let acc = 0, last = performance.now();
let fps = 60, fpsFrames = 0, fpsT = performance.now();
function frame(now: number) {
  requestAnimationFrame(frame);
  if (now - last < MIN_FRAME_MS) return;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fpsFrames++;
  if (now - fpsT >= 500) { fps = fpsFrames * 1000 / (now - fpsT); fpsFrames = 0; fpsT = now; }
  const dir = screenToWorld(input.screenDir());
  let simDt = dt * time.scale;
  if (time.turboTo > 0) turbo();
  else if (time.paused) {
    simDt = 0;
    if (time.stepOnce) { step(G, FIXED, dir); simDt = FIXED; time.stepOnce = false; }
    acc = 0;
  } else {
    acc += simDt;
    while (acc >= FIXED) { step(G, FIXED, dir); acc -= FIXED; }
  }
  sound.handle(G, G.events);
  view.render(G, simDt);
  updateHud();
  devlog.update(G);
}
requestAnimationFrame(frame);

/**
 * Simulación rápida: pasos a toda velocidad (~25 ms por fotograma para no congelar la pantalla),
 * con el piloto automático comprando, hasta llegar a la oleada pedida o perder.
 */
function turbo() {
  const prevAuto = G.dev.autoplay;
  G.dev.autoplay = true;
  G.cheated = true;
  const t0 = performance.now();
  while (performance.now() - t0 < 25 && G.wave < time.turboTo && !G.over) {
    for (let k = 0; k < 60; k++) step(G, FIXED, autopilotDir(G));
    // sin esto se amontonarían miles de textos flotantes y sonidos
    G.events.length = 0;
  }
  G.dev.autoplay = prevAuto;
  if (G.wave >= time.turboTo || G.over) {
    time.turboNote = G.over ? `Perdida en la oleada ${G.wave} (${Math.round(G.t)} s de juego)` : `Llegó a la oleada ${G.wave} (${Math.round(G.t)} s de juego)`;
    time.turboTo = 0;
  }
}

// para depurar desde la consola
Object.assign(window, {
  game: () => G,
  view,
  sound,
  /** Avanza la simulación N segundos de golpe (útil para pruebas desde la consola). */
  advance: (seconds: number, dir: Vec = { x: 0, y: 0 }) => {
    for (let t = 0; t < seconds; t += FIXED) step(G, FIXED, dir);
    sound.handle(G, G.events);
    view.render(G, FIXED);
    devlog.update(G);
  },
});

// --- menú de desarrollador (solo con `npm run dev`; F1 o º, o tres toques en el contador de oleada)
if (import.meta.env.DEV) {
  import('./dev/panel').then(m => m.initDevPanel({
    game: () => G, view, sound, devlog, time, restart, fps: () => fps,
  }));
}
