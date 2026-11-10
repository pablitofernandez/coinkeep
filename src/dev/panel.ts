// ============================================================
//  Menú de desarrollador. Solo se carga con `npm run dev`.
//  Se abre con F1 o con la tecla º (a la izquierda del 1), y en el
//  móvil tocando tres veces el contador de oleada.
//  Cualquier truco marca la partida como «con trampas» en el registro.
// ============================================================
import type { Sound } from '../audio';
import type { DevLog } from '../devlog';
import * as cheat from '../game/cheats';
import { ENEMY_KINDS } from '../config';
import type { DevFlags, EnemyKind, GameState, PadType, SfxName } from '../game/types';
import type { TimeControl } from '../main';
import type { View } from '../render/view';

export interface DevContext {
  game: () => GameState;
  view: View;
  sound: Sound;
  devlog: DevLog;
  time: TimeControl;
  restart: () => void;
  fps: () => number;
  simMs: () => number;
}

const SFX: [SfxName, string][] = [
  ['sword', 'Espada'], ['bow', 'Ballesta'], ['arrow', 'Flecha torre'], ['cannon', 'Cañón'], ['boom', 'Explosión'],
  ['die', 'Muerte zombi'], ['dieBones', 'Muerte esqueleto'], ['dieBat', 'Muerte murciélago'], ['heal', 'Curación del mago'], ['bossDie', 'Muerte jefe'], ['bite', 'Mordisco'], ['coin', 'Moneda'], ['pay', 'Pagar'],
  ['build', 'Construir'], ['upgrade', 'Mejorar'], ['baseHit', 'Golpe castillo'], ['wave', 'Oleada'], ['boss', 'Jefe'],
  ['waveClear', 'Oleada superada'], ['gameOver', 'Derrota'],
];

/** Nombres en español de las claves del registro. */
const NAMES: Record<string, string> = {
  ground: 'suelo', table: 'mesas', dog: 'lobos', peon: 'peones',
  sword: 'espada', bow: 'ballesta', archer: 'arqueras', cannon: 'cañones',
  power: 'fuerza', repair: 'reparar', forge: 'forja', kennel: 'lobos', upgrade: 'mejoras',
  zombie: 'zombis', runner: 'esqueletos', bat: 'murciélagos', shaman: 'magos', boss: 'jefes',
};

const REPEATABLE: [PadType, string][] = [
  ['power', '💪 Fuerza'], ['forge', '🔨 Forja'], ['kennel', '🐺 Lobos'], ['peon', '🧔 Peones'], ['repair', '🏰 Reparar'],
];

export function initDevPanel(ctx: DevContext) {
  const G = () => ctx.game();
  const refreshers: (() => void)[] = [];
  const onRefresh = (f: () => void) => { refreshers.push(f); };

  // ---------- estructura ----------
  const root = el('div', 'dev-panel hidden');
  root.id = 'dev';
  // que tocar el menú no mueva el joystick ni reinicie la partida
  for (const ev of ['pointerdown', 'touchstart', 'mousedown'] as const) root.addEventListener(ev, e => e.stopPropagation());
  document.body.appendChild(root);

  const head = el('div', 'dev-head');
  const title = el('div', 'dev-title', '🛠 Desarrollo');
  const close = el('button', 'dev-close', '✕');
  close.addEventListener('click', () => toggle(false));
  head.append(title, close);
  const stats = el('div', 'dev-stats');
  const cheatBadge = el('div', 'dev-badge', '');
  root.append(head, stats, cheatBadge);
  const body = el('div', 'dev-body');
  root.appendChild(body);

  /** Ejecuta un truco y refresca el menú. */
  const act = (f: () => void) => () => { f(); G().cheated = true; refresh(); };

  // ---------- piezas de interfaz ----------
  function section(name: string, open = false) {
    const d = el('details', 'dev-sec') as HTMLDetailsElement;
    d.open = open;
    d.appendChild(el('summary', '', name));
    body.appendChild(d);
    return d;
  }
  function row(parent: HTMLElement, label?: string) {
    const r = el('div', 'dev-row');
    if (label) r.appendChild(el('span', 'dev-label', label));
    parent.appendChild(r);
    return r;
  }
  function button(parent: HTMLElement, text: string, f: () => void, cls = '') {
    const b = el('button', 'dev-btn ' + cls, text);
    b.addEventListener('click', act(f));
    parent.appendChild(b);
    return b;
  }
  /** Interruptor ligado a un truco de G.dev (se relee en cada refresco: la partida nueva los apaga). */
  function flag(parent: HTMLElement, text: string, key: { [K in keyof DevFlags]: DevFlags[K] extends boolean ? K : never }[keyof DevFlags]) {
    const b = el('button', 'dev-btn dev-toggle', text);
    b.addEventListener('click', act(() => { G().dev[key] = !G().dev[key]; }));
    parent.appendChild(b);
    onRefresh(() => b.classList.toggle('on', G().dev[key]));
    return b;
  }
  /** Botones de opción excluyentes (multiplicadores). */
  function choices(parent: HTMLElement, values: number[], get: () => number, set: (v: number) => void, fmt = (v: number) => '×' + v) {
    const bs = values.map(v => {
      const b = el('button', 'dev-btn dev-choice', fmt(v));
      b.addEventListener('click', act(() => set(v)));
      parent.appendChild(b);
      return b;
    });
    onRefresh(() => bs.forEach((b, i) => b.classList.toggle('on', Math.abs(get() - values[i]) < 1e-6)));
  }
  function numberInput(parent: HTMLElement, value: number, min = 1) {
    const i = el('input', 'dev-num') as HTMLInputElement;
    i.type = 'number'; i.min = String(min); i.value = String(value);
    parent.appendChild(i);
    return i;
  }
  function info(parent: HTMLElement, f: () => string) {
    const s = el('span', 'dev-info');
    parent.appendChild(s);
    onRefresh(() => { const t = f(); if (s.textContent !== t) s.textContent = t; });
    return s;
  }

  // ======================================================
  //  🧟 Enemigos y oleadas
  // ======================================================
  {
    const s = section('🧟 Enemigos y oleadas', true);
    let r = row(s, 'Tipo');
    const kindSel = el('select', 'dev-select') as HTMLSelectElement;
    for (const [v, t] of [['', 'Mezcla de la oleada'], ...Object.entries(ENEMY_KINDS).map(([k, d]) => [k, d.name])]) {
      const o = document.createElement('option'); o.value = v; o.textContent = t; kindSel.appendChild(o);
    }
    r.appendChild(kindSel);
    const kind = () => (kindSel.value || undefined) as EnemyKind | undefined;
    r = row(s, 'Del bosque');
    for (const n of [1, 10, 50, 200]) button(r, '+' + n, () => cheat.spawnMany(G(), n, 'forest', false, kind()));
    r = row(s, 'Cerca de ti');
    for (const n of [1, 10, 50, 200]) button(r, '+' + n, () => cheat.spawnMany(G(), n, 'near', false, kind()));
    r = row(s, 'Jefe');
    button(r, 'En el bosque', () => cheat.spawnMany(G(), 1, 'forest', true));
    button(r, 'Cerca de ti', () => cheat.spawnMany(G(), 1, 'near', true));
    r = row(s, 'Saltar a oleada');
    const waveIn = numberInput(r, 10);
    button(r, 'Ir', () => cheat.jumpToWave(G(), +waveIn.value || 1));
    r = row(s);
    button(r, 'Siguiente oleada ya', () => cheat.nextWaveNow(G()));
    flag(r, 'Pausar contador', 'pauseWaves');
    r = row(s);
    button(r, 'Matar a todos', () => cheat.killAll(G(), false));
    button(r, 'Matar (sueltan monedas)', () => cheat.killAll(G(), true));
    flag(r, 'Congelar', 'freeze');
    r = row(s, 'Vida de los nuevos');
    choices(r, [0.25, 0.5, 1, 2, 5, 10], () => G().dev.enemyHp, v => { G().dev.enemyHp = v; });
    r = row(s, 'Velocidad');
    choices(r, [0.5, 1, 2, 3], () => G().dev.enemySpeed, v => { G().dev.enemySpeed = v; });
  }

  // ======================================================
  //  🏰 Castillo y jugador
  // ======================================================
  {
    const s = section('🏰 Castillo y jugador');
    let r = row(s, 'Vida del castillo');
    button(r, 'Llenar', () => cheat.setBaseHp(G(), G().base.max));
    button(r, 'A 1', () => cheat.setBaseHp(G(), 1));
    flag(r, 'Invulnerable', 'godCastle');
    info(r, () => `${Math.ceil(G().base.hp)}/${G().base.max}`);
    r = row(s, 'Nivel del castillo');
    button(r, '−', () => cheat.setCastleLevel(G(), G().castleLevel - 1));
    info(r, () => `Nv ${G().castleLevel}`);
    button(r, '+', () => cheat.setCastleLevel(G(), G().castleLevel + 1));
    r = row(s, 'Daño del pícaro');
    choices(r, [0, 1, 10, 100], () => G().dev.playerDmg, v => { G().dev.playerDmg = v; });
    r = row(s, 'Velocidad del pícaro');
    choices(r, [1, 2, 3], () => G().dev.playerSpeed, v => { G().dev.playerSpeed = v; });
    r = row(s, 'Teletransporte');
    button(r, 'Al castillo', () => cheat.teleport(G(), cheat.castleFront()));
    const sel = el('select', 'dev-select') as HTMLSelectElement;
    r.appendChild(sel);
    sel.addEventListener('change', () => {
      const pad = G().pads.find(p => String(p.id) === sel.value);
      if (pad) { cheat.teleport(G(), { x: pad.x, y: pad.y + 1.1 }); refresh(); }
      sel.value = '';
    });
    onRefresh(() => {
      const pads = G().pads.filter(p => p.active);
      const key = pads.map(p => p.id).join(',');
      if (sel.dataset.key === key) return;
      sel.dataset.key = key;
      sel.innerHTML = '<option value="">A una parcela…</option>' +
        pads.map(p => `<option value="${p.id}">${padName(p.type)} (${p.cost})</option>`).join('');
    });
  }

  // ======================================================
  //  💰 Economía
  // ======================================================
  {
    const s = section('💰 Economía');
    let r = row(s, 'Monedas');
    for (const n of [100, 1000, 10000]) button(r, '+' + n.toLocaleString('es'), () => cheat.addCoins(G(), n));
    r = row(s);
    flag(r, 'Dinero infinito', 'infiniteMoney');
    flag(r, 'Construir gratis', 'freeBuild');
    r = row(s);
    button(r, 'Mostrar todas las parcelas', () => cheat.unlockAllPads(G()));
    flag(r, '🤖 Piloto automático', 'autoplay');
    s.appendChild(el('p', 'dev-note', 'Piloto automático: recoge al instante todo el dinero y compra la parcela más barata que pueda pagar.'));
  }

  // ======================================================
  //  🏗️ Construcción
  // ======================================================
  {
    const s = section('🏗️ Construcción');
    let r = row(s, 'Torres');
    button(r, 'Construir las visibles', () => cheat.buildAllTowers(G()));
    button(r, 'Construir TODAS', () => cheat.buildAllTowers(G(), true));
    button(r, 'Todas a nivel máximo', () => cheat.maxAllTowers(G()));
    for (const [type, name] of REPEATABLE) {
      r = row(s, name);
      info(r, () => `Nv ${cheat.padLevel(G(), type)}`);
      button(r, '+1', () => cheat.levelUp(G(), type, 1));
      button(r, '+5', () => cheat.levelUp(G(), type, 5));
    }
  }

  // ======================================================
  //  ⏱️ Tiempo
  // ======================================================
  {
    const s = section('⏱️ Tiempo');
    let r = row(s, 'Velocidad');
    choices(r, [0.25, 0.5, 1, 2, 4, 8], () => ctx.time.scale, v => { ctx.time.scale = v; ctx.time.paused = false; });
    r = row(s);
    const pause = button(r, '⏸ Pausa', () => { ctx.time.paused = !ctx.time.paused; }, 'dev-toggle');
    onRefresh(() => { pause.classList.toggle('on', ctx.time.paused); pause.textContent = ctx.time.paused ? '▶ Seguir' : '⏸ Pausa'; });
    button(r, '⏭ Un paso', () => { ctx.time.paused = true; ctx.time.stepOnce = true; });
    r = row(s, 'Simular hasta oleada');
    const simIn = numberInput(r, 20);
    const simBtn = button(r, 'Simular', () => {
      if (ctx.time.turboTo > 0) { ctx.time.turboTo = 0; ctx.time.turboNote = 'Simulación parada'; return; }
      ctx.time.turboNote = '';
      ctx.time.turboTo = Math.max(G().wave + 1, +simIn.value || 1);
    });
    onRefresh(() => { simBtn.textContent = ctx.time.turboTo > 0 ? `Parar (oleada ${G().wave})` : 'Simular'; });
    r = row(s);
    info(r, () => ctx.time.turboNote);
    s.appendChild(el('p', 'dev-note', 'Simula a toda velocidad con el piloto automático comprando, sin que tú muevas al pícaro. Útil para ver cómo escala la economía.'));
    r = row(s);
    button(r, '🔄 Nueva partida', () => { ctx.restart(); ctx.time.turboTo = 0; });
  }

  // ======================================================
  //  👁️ Visualización
  // ======================================================
  {
    const s = section('👁️ Visualización');
    let r = row(s, 'Dibujar');
    const dbg = ctx.view.debug.opts;
    for (const [key, name] of [['colliders', 'Colisiones'], ['ranges', 'Alcances'], ['paths', 'Caminos ayudantes']] as const) {
      const b = el('button', 'dev-btn dev-toggle', name);
      b.addEventListener('click', () => { dbg[key] = !dbg[key]; refresh(); });
      r.appendChild(b);
      onRefresh(() => b.classList.toggle('on', dbg[key]));
    }
    r = row(s, 'Zoom de cámara');
    const zoom = el('input', 'dev-range') as HTMLInputElement;
    zoom.type = 'range'; zoom.min = '0.3'; zoom.max = '2.5'; zoom.step = '0.05'; zoom.value = '1';
    zoom.addEventListener('input', () => ctx.view.setZoom(+zoom.value));
    r.appendChild(zoom);
    const zr = el('button', 'dev-btn', 'Normal');
    zr.addEventListener('click', () => { zoom.value = '1'; ctx.view.setZoom(1); });
    r.appendChild(zr);
    r = row(s);
    button(r, '🌲 Regenerar decorado', () => cheat.regenProps(G()));
    s.appendChild(el('p', 'dev-note', 'Rojo: obstáculos · Rosa: castillo · Verde: pícaro · Naranja: zombis · Azul: ayudantes. Alcances: blanco espada, celeste ballesta, amarillo arqueras, naranja cañones.'));
  }

  // ======================================================
  //  🔊 Audio
  // ======================================================
  {
    const s = section('🔊 Audio');
    const grid = el('div', 'dev-grid');
    s.appendChild(grid);
    for (const [name, label] of SFX) {
      const b = el('button', 'dev-btn', label);
      b.addEventListener('click', () => ctx.sound.test(name));   // escuchar no cuenta como trampa
      grid.appendChild(b);
    }
    for (const [label, set, get] of [
      ['Efectos', (v: number) => ctx.sound.setSfxVolume(v), () => 1],
      ['Música', (v: number) => ctx.sound.music.setVolume(v), () => ctx.sound.music.volume],
    ] as const) {
      const r = row(s, label);
      const sl = el('input', 'dev-range') as HTMLInputElement;
      sl.type = 'range'; sl.min = '0'; sl.max = '1.5'; sl.step = '0.05'; sl.value = String(get());
      sl.addEventListener('input', () => set(+sl.value));
      r.appendChild(sl);
    }
    s.appendChild(el('p', 'dev-note', 'Si no suena nada, haz clic primero en el juego (el navegador no deja sonar audio sin un clic).'));
  }

  // ======================================================
  //  📊 Datos
  // ======================================================
  {
    const s = section('📊 Datos de la partida');
    const table = el('div', 'dev-data');
    s.appendChild(table);
    onRefresh(() => {
      if (!(s as HTMLDetailsElement).open) return;
      const g = G(), w = cheat.liveWave(g), st = g.stats;
      const kv = (o: Record<string, number>) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${NAMES[k] ?? k} ${v}`).join(' · ') || '—';
      const html =
        `<b>Oleada ${g.wave} en curso</b> (${w.seconds} s)<br>` +
        `Ganado: ${kv(w.earned)}<br>Gastado: ${kv(w.spent)}<br>Muertes: ${kv(w.kills)}<br>` +
        `Daño al castillo: ${w.baseDamage} · Enemigos salidos: ${w.spawned} (${kv(w.spawnedKind)})<br><br>` +
        `<b>Total</b> (${Math.round(g.t)} s)<br>` +
        `Ganado: ${kv(st.earned)}<br>Gastado: ${kv(st.spent as Record<string, number>)}<br>Muertes: ${kv(st.kills)}<br>` +
        `Torres: ${g.buildings.map(b => (b.type === 'archer' ? 'A' : 'C') + b.level).join(' ') || '—'}<br>` +
        `Forja ×${g.towerMult.toFixed(2)} · Espada ${(g.player.swordDmg * g.towerMult).toFixed(1)} · Ballesta ${(g.player.bowDmg * g.towerMult).toFixed(1)}<br>` +
        `Monedas: en mano ${g.player.coins} · suelo ${g.drops.reduce((a, c) => a + c.worth, 0)} · mesas ${g.buildings.reduce((a, b) => a + b.table, 0)}`;
      if (table.innerHTML !== html) table.innerHTML = html;
    });
    const r = row(s);
    const send = el('button', 'dev-btn', '📤 Enviar registro ahora');
    send.addEventListener('click', () => { ctx.devlog.sendNow(G()); setTimeout(refresh, 400); });
    r.appendChild(send);
    info(r, () => {
      const n = ctx.devlog.pendingCount();
      return [ctx.devlog.status, n ? `${n} registro(s) esperando en el navegador` : ''].filter(Boolean).join(' · ');
    });
  }

  // ---------- refresco periódico (solo con el menú abierto) ----------
  const view = ctx.view;
  function refresh() {
    const g = G();
    const info = view.renderer.info.render;
    const t = ctx.view.timing;
    stats.textContent =
      `${Math.round(ctx.fps())} FPS · ms por fotograma: simulación ${ctx.simMs().toFixed(1)} · 3D ${t.gl.toFixed(1)} · etiquetas ${t.labels.toFixed(1)} · ` +
      `${info.calls} llamadas · ${(info.triangles / 1000).toFixed(0)}k triángulos · ` +
      `${g.enemies.length} enemigos · ${g.shots.length} disparos · ${g.drops.length} monedas · ${g.helpers.length} ayudantes`;
    cheatBadge.textContent = g.cheated ? '⚠ Partida con trampas: el registro irá marcado' : '';
    for (const f of refreshers) f();
  }
  let timer = 0;
  function toggle(open = root.classList.contains('hidden')) {
    root.classList.toggle('hidden', !open);
    clearInterval(timer);
    if (open) { refresh(); timer = window.setInterval(refresh, 250); }
  }

  // ---------- apertura ----------
  // en fase de captura y cortando la propagación: que la tecla no llegue al juego (reiniciaría tras perder)
  window.addEventListener('keydown', e => {
    if (e.key === 'F1' || e.code === 'Backquote' || e.key === 'º') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) toggle();
    }
  }, true);
  // móvil: tres toques seguidos en el contador de oleada
  const waveEl = document.querySelector('.hud-center') as HTMLElement | null;
  if (waveEl) {
    waveEl.style.pointerEvents = 'auto';
    let taps: number[] = [];
    waveEl.addEventListener('pointerdown', e => {
      e.stopPropagation();
      const now = performance.now();
      taps = taps.filter(t => now - t < 700);
      taps.push(now);
      if (taps.length >= 3) { taps = []; toggle(); }
    });
  }
}

// ------------------------------------------------------------
function el(tag: string, cls = '', text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function padName(t: PadType) {
  return ({ archer: '🏹 Arquera', cannon: '💣 Cañón', power: '💪 Fuerza', repair: '🏰 Reparar', forge: '🔨 Forja', kennel: '🐺 Lobo', peon: '🧔 Peón', upgrade: '⬆ Mejora torre' } as Record<PadType, string>)[t];
}
