import { autopilotDir, showcase, showcaseTick } from './game/cheats';
import { createGame, step } from './game/sim';
import type { Difficulty, GameState, Vec } from './game/types';
import { DIFFICULTIES, DIFFICULTY } from './config';
import { cleanName, leaderboardEnabled, rankOf, savedName, submitScore, topScores, type Score } from './leaderboard';
import { Sound } from './audio';
import { DevLog } from './devlog';
import { Telemetry } from './telemetry';
import { Input, isTyping, preventBrowserZoom } from './input';
import { loadAssets } from './render/assets';
import { CAM_ELEVATION_SIN, View, fmt } from './render/view';

const $ = (id: string) => document.getElementById(id)!;

// sin zoom del navegador en el móvil (doble toque o pellizco): el juego ocupa la pantalla entera
preventBrowserZoom();

// --- carga de modelos 3D (antes de crear la escena)
const loading = $('loading');
await loadAssets(k => { loading.textContent = `Cargando… ${Math.round(k * 100)}%`; });
loading.remove();

const view = new View($('app'));
const input = new Input(document.body, $('joy'), $('joy-knob'));
const devlog = new DevLog();
const telemetry = new Telemetry();   // estadísticas anónimas de la versión publicada (para equilibrar)

// --- pantalla de título: de fondo, una partida de exhibición (torres, lobos, zombis) con la cámara girando
let G: GameState = createGame();
showcase(G);
view.reset(G);
let inTitle = true;
document.body.classList.add('title-mode');
$('title').classList.remove('hidden');
view.orbit = Math.PI / 4;
view.setZoom(0.85);

// --- dificultad (se recuerda entre partidas)
let difficulty: Difficulty = (() => {
  try { const d = localStorage.getItem('sg-diff') as Difficulty; return DIFFICULTIES.includes(d) ? d : 'normal'; } catch { return 'normal'; }
})();
/** Que los clics en botones no muevan el joystick ni empiecen la partida. */
const guard = (el: HTMLElement) => el.addEventListener('pointerdown', e => e.stopPropagation());
const diffBox = $('diff');
for (const d of DIFFICULTIES) {
  const b = document.createElement('button');
  b.className = 'menu-btn'; b.textContent = DIFFICULTY[d].name; b.dataset.d = d;
  b.setAttribute('role', 'radio');
  guard(b);
  b.addEventListener('click', () => {
    difficulty = d;
    try { localStorage.setItem('sg-diff', d); } catch { /* sin almacenamiento */ }
    showDifficulty();
    if (!$('board').classList.contains('hidden')) void showBoard();
  });
  diffBox.appendChild(b);
}
function showDifficulty() {
  for (const b of diffBox.children as HTMLCollectionOf<HTMLElement>) {
    b.classList.toggle('on', b.dataset.d === difficulty);
    b.setAttribute('aria-checked', String(b.dataset.d === difficulty));
  }
}
showDifficulty();

// --- clasificación global
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
/** Pinta una lista de puntuaciones (con textContent: los nombres los escribe la gente). */
function fillList(list: HTMLElement, scores: Score[], me?: Score, myRank?: number) {
  list.replaceChildren();
  const item = (pos: string, who: string, score: string, mine: boolean) => {
    const li = document.createElement('li');
    if (mine) li.className = 'me';
    for (const [cls, t] of [['pos', pos], ['who', who], ['score', score]]) {
      const sp = document.createElement('span'); sp.className = cls; sp.textContent = t; li.appendChild(sp);
    }
    list.appendChild(li);
  };
  let shown = false;
  scores.forEach((s, i) => {
    const mine = !!me && !shown && myRank === i + 1 && s.name === me.name && s.wave === me.wave && s.seconds === me.seconds;
    if (mine) shown = true;
    item(`${i + 1}.`, s.name, `Oleada ${s.wave} · ${fmtTime(s.seconds)}`, mine);
  });
  if (me && myRank && !shown) item(`${myRank}.`, me.name, `Oleada ${me.wave} · ${fmtTime(me.seconds)}`, true);
  if (!scores.length && !me) boardMessage(list, 'Todavía no hay récords. ¡Sé el primero!');
}
function boardMessage(list: HTMLElement, text: string) {
  const li = document.createElement('li'); li.className = 'empty'; li.textContent = text; list.replaceChildren(li);
}
async function showBoard() {
  const list = $('board-list');
  $('board').classList.remove('hidden');
  $('board-diff').textContent = DIFFICULTY[difficulty].name;
  boardMessage(list, 'Cargando…');
  try { fillList(list, await topScores(difficulty)); } catch { boardMessage(list, 'No se pudo cargar la clasificación.'); }
}
for (const id of ['show-board', 'board-close', 'board']) guard($(id));
$('show-board').addEventListener('click', () => void showBoard());
$('board-close').addEventListener('click', () => $('board').classList.add('hidden'));
if (!leaderboardEnabled) $('show-board').classList.add('hidden');

/** Sale de la pantalla de título y empieza la partida de verdad. */
function startGame() {
  if (!inTitle) return;
  inTitle = false;
  const title = $('title');
  title.classList.add('leaving');
  setTimeout(() => title.classList.add('hidden'), 450);
  document.body.classList.remove('title-mode');
  view.orbit = null;
  view.setZoom(1);
  restart();
}

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
  G = createGame(difficulty);
  view.reset(G);
  devlog.start();
  telemetry.start(G);
  $('gameover').classList.add('hidden');
}

/** Vuelve a la portada (para cambiar de dificultad o ver la clasificación). */
function backToTitle() {
  G = createGame();
  showcase(G);
  view.reset(G);
  inTitle = true;
  document.body.classList.add('title-mode');
  $('title').classList.remove('hidden', 'leaving');
  $('board').classList.add('hidden');
  $('gameover').classList.add('hidden');
  view.orbit = Math.PI / 4;
  view.setZoom(0.85);
}
input.onAny = () => { if (inTitle) startGame(); };

// --- fin de partida: guardar el récord con tu nombre y ver la clasificación
guard($('gameover'));
$('go-again').addEventListener('click', () => restart());
$('go-menu').addEventListener('click', () => backToTitle());
// Intro o espacio también reintentan (si no estás escribiendo el nombre)
window.addEventListener('keydown', e => {
  if (!G.over || inTitle || isTyping(e) || e.repeat) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); restart(); }
});
let finalScore: Score | null = null;
async function onGameOver() {
  const form = $('go-form'), msg = $('go-msg'), list = $('go-list');
  list.replaceChildren(); msg.textContent = '';
  const score: Score = { name: '', wave: G.wave, seconds: Math.round(G.t), difficulty: G.difficulty };
  finalScore = score;
  $('go-text').textContent = `${DIFFICULTY[G.difficulty].name} · Oleada ${G.wave} · ${fmtTime(score.seconds)} · ${G.buildings.length} torres`;
  const canSubmit = leaderboardEnabled && !G.cheated && G.wave >= 1;
  form.classList.toggle('hidden', !canSubmit);
  if (!leaderboardEnabled) return;
  if (G.cheated) msg.textContent = 'Partida con trucos: no cuenta para la clasificación.';
  try {
    const [top, rank] = await Promise.all([topScores(score.difficulty), rankOf(score)]);
    if (finalScore !== score) return;   // ya ha empezado otra partida
    fillList(list, top);
    if (!canSubmit) return;
    msg.textContent = rank <= 10 ? `¡Entrarías en el puesto ${rank}! Escribe tu nombre.` : `Quedarías en el puesto ${rank}.`;
    const name = $('go-name') as HTMLInputElement;
    name.value = savedName();
    if (!matchMedia('(pointer: coarse)').matches) name.focus();
  } catch { msg.textContent = 'No se pudo conectar con la clasificación.'; }
}
$('go-form').addEventListener('submit', async e => {
  e.preventDefault();
  const field = $('go-name') as HTMLInputElement, send = $('go-send') as HTMLButtonElement, msg = $('go-msg');
  const name = cleanName(field.value);
  if (!finalScore || !name) { msg.textContent = 'Escribe un nombre.'; field.focus(); return; }
  send.disabled = true; msg.textContent = 'Guardando…';
  try {
    const me = { ...finalScore, name };
    await submitScore(me);
    finalScore = null;   // una sola vez por partida
    const [top, rank] = await Promise.all([topScores(me.difficulty), rankOf(me)]);
    fillList($('go-list'), top, me, rank);
    msg.textContent = `¡Guardado! Puesto ${rank} en ${DIFFICULTY[me.difficulty].name}.`;
    $('go-form').classList.add('hidden');
    field.blur();
  } catch { msg.textContent = 'No se pudo guardar. Inténtalo otra vez.'; }
  send.disabled = false;
});

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
    $('gameover').classList.remove('hidden');
    void onGameOver();
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
// El umbral tiene mucho margen (10 ms, no 16,7): con uno ajustado, un fotograma que llegaba una
// pizca antes de tiempo se saltaba entero y el juego daba tirones a 30 fps (se notaba en iPhone).
// A 120 Hz se pinta uno de cada dos (60 fps); a 60 Hz, todos; a 90 Hz, todos.
const FIXED = 1 / 60;
const MIN_FRAME_MS = 10;
let acc = 0, last = performance.now();
let fps = 60, fpsFrames = 0, fpsT = performance.now();
let simMs = 0;   // tiempo de simulación por fotograma (media suave), para el menú de desarrollo
function frame(now: number) {
  requestAnimationFrame(frame);
  if (now - last < MIN_FRAME_MS) return;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fpsFrames++;
  if (now - fpsT >= 500) { fps = fpsFrames * 1000 / (now - fpsT); fpsFrames = 0; fpsT = now; }
  if (inTitle) {
    // portada: la escena de exhibición sigue viva (sin sonido, sin HUD y sin registro)
    view.orbit = (view.orbit ?? 0) + dt * 0.1;
    acc += dt;
    while (acc >= FIXED) { step(G, FIXED, { x: 0, y: 0 }); showcaseTick(G); acc -= FIXED; }
    view.render(G, dt);
    return;
  }
  const dir = screenToWorld(input.screenDir());
  let simDt = dt * time.scale;
  if (time.turboTo > 0) turbo();
  else if (time.paused) {
    simDt = 0;
    if (time.stepOnce) { step(G, FIXED, dir); simDt = FIXED; time.stepOnce = false; }
    acc = 0;
  } else {
    const t0 = performance.now();
    acc += simDt;
    while (acc >= FIXED) { step(G, FIXED, dir); acc -= FIXED; }
    simMs += (performance.now() - t0 - simMs) * 0.1;
  }
  sound.handle(G, G.events);
  view.render(G, simDt);
  updateHud();
  devlog.update(G);
  telemetry.update(G);
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
    telemetry.update(G);
  },
});

// --- menú de desarrollador (solo con `npm run dev`; F1 o º, o tres toques en el contador de oleada)
if (import.meta.env.DEV) {
  import('./dev/panel').then(m => m.initDevPanel({
    game: () => G, view, sound, devlog, time, restart: () => (inTitle ? startGame() : restart()), fps: () => fps, simMs: () => simMs,
  }));
}
