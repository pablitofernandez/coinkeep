// ============================================================
//  Trucos del menú de desarrollador. Funciones puras sobre el
//  GameState (sin Three.js ni DOM), igual que la simulación.
//  Cualquier truco marca la partida como «con trampas».
// ============================================================
import { BASE, CASTLE_HALF, PLAYER, TOWER_UPGRADE } from '../config';
import { completePad, killEnemy, placeProps, spawnEnemy } from './sim';
import type { GameState, Pad, PadType, Vec } from './types';

export const mark = (G: GameState) => { G.cheated = true; };

// ------------------------------------------------------------
//  Enemigos y oleadas
// ------------------------------------------------------------

/** Saca `n` enemigos: desde el bosque (repartidos) o en un anillo cerca del jugador. */
export function spawnMany(G: GameState, n: number, where: 'forest' | 'near', boss = false) {
  mark(G);
  const p = G.player;
  for (let i = 0; i < n; i++) {
    if (where === 'forest') { spawnEnemy(G, boss); continue; }
    const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 2.5;
    let at: Vec = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
    // que no aparezcan dentro del castillo
    if (Math.max(Math.abs(at.x - BASE.x), Math.abs(at.y - BASE.y)) < CASTLE_HALF + 0.5) at = { x: BASE.x + Math.cos(a) * 4, y: BASE.y + Math.sin(a) * 4 };
    spawnEnemy(G, boss, at);
  }
}

/** Salta a la oleada N: empieza ya, con la cantidad y dureza de esa oleada. */
export function jumpToWave(G: GameState, n: number) {
  mark(G);
  G.wave = Math.max(0, Math.floor(n) - 1);
  G.spawnLeft = 0;
  G.waveTimer = 0;
}

export function nextWaveNow(G: GameState) { mark(G); G.waveTimer = 0; }

/** Mata a todos los enemigos (sueltan sus monedas, como si los hubiera matado el jugador). */
export function killAll(G: GameState, withCoins: boolean) {
  mark(G);
  if (withCoins) for (const e of G.enemies) killEnemy(G, e, null, 'sword');
  else for (const e of G.enemies) { e.dead = true; G.events.push({ type: 'enemyDied', x: e.x, y: e.y, boss: e.boss }); }
  G.enemies = G.enemies.filter(e => !e.dead);
  G.spawnLeft = 0;
}

// ------------------------------------------------------------
//  Castillo y jugador
// ------------------------------------------------------------
export function setBaseHp(G: GameState, hp: number) { mark(G); G.base.hp = Math.max(1, Math.min(G.base.max, hp)); }

export function setCastleLevel(G: GameState, level: number) { mark(G); G.castleLevel = Math.max(1, Math.min(5, level)); }

export function teleport(G: GameState, to: Vec) {
  mark(G);
  G.player.x = to.x; G.player.y = to.y;
  G.padDwellId = -1; G.padDwell = 0;
}

/** Punto delante de la puerta del castillo. */
export const castleFront = (): Vec => ({ x: PLAYER.start.x, y: PLAYER.start.y });

// ------------------------------------------------------------
//  Economía
// ------------------------------------------------------------
export function addCoins(G: GameState, n: number) { mark(G); G.player.coins += n; }

/** Hace visibles todas las parcelas que aún no han salido. */
export function unlockAllPads(G: GameState) {
  mark(G);
  for (const pad of G.pads) if (!pad.done) pad.active = true;
}

// ------------------------------------------------------------
//  Construcción
// ------------------------------------------------------------

/** Completa una parcela gratis (no cuenta como gasto en el registro). */
function finish(G: GameState, pad: Pad) {
  pad.active = true;
  pad.paid = pad.cost;
  pad.cool = 0;
  completePad(G, pad);
}

/** Construye todas las torres cuyas parcelas están a la vista (con `all`, también las aún ocultas). */
export function buildAllTowers(G: GameState, all = false) {
  mark(G);
  for (const pad of [...G.pads]) {
    if ((pad.type === 'archer' || pad.type === 'cannon') && !pad.done && (all || pad.active)) finish(G, pad);
  }
}

/** Sube todas las torres construidas al nivel máximo. */
export function maxAllTowers(G: GameState) {
  mark(G);
  for (const pad of G.pads) {
    if (pad.type !== 'upgrade' || pad.done) continue;
    const b = G.buildings.find(x => x.id === pad.buildingId);
    if (!b) continue;
    while (b.level < TOWER_UPGRADE.maxLevel && !pad.done) finish(G, pad);
  }
}

/** Sube N niveles una parcela repetible (fuerza, forja, lobos, peones, reparar). */
export function levelUp(G: GameState, type: PadType, times = 1) {
  mark(G);
  const pad = G.pads.find(p => p.type === type);
  if (!pad) return;
  for (let i = 0; i < times; i++) finish(G, pad);
}

/** Nivel actual de una parcela repetible. */
export const padLevel = (G: GameState, type: PadType) => G.pads.find(p => p.type === type)?.level ?? 0;

// ------------------------------------------------------------
//  Mundo
// ------------------------------------------------------------
export function regenProps(G: GameState) {
  mark(G);
  G.props = []; G.solids = [];
  placeProps(G);
}

/**
 * Movimiento del piloto automático (para la simulación rápida): va a por el enemigo más cercano
 * al castillo hasta tenerlo a tiro de ballesta; si no hay enemigos, vuelve a la puerta.
 */
export function autopilotDir(G: GameState): Vec {
  const p = G.player;
  let best = null as Vec | null, bd = Infinity;
  for (const e of G.enemies) {
    const d = Math.hypot(e.x - BASE.x, e.y - BASE.y);
    if (d < bd) { bd = d; best = e; }
  }
  const goal = best ?? castleFront();
  const dx = goal.x - p.x, dy = goal.y - p.y, d = Math.hypot(dx, dy);
  const stop = best ? PLAYER.sword.range * 0.8 : 0.3;
  if (d < stop) return { x: 0, y: 0 };
  return { x: dx / d, y: dy / d };
}

/** Datos de la oleada en curso (lo que se enviará al registro al acabarla). */
export function liveWave(G: GameState) {
  const s = G.stats, l = s.last;
  const sub = (a: Record<string, number>, b: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const k of Object.keys(a)) { const d = (a[k] ?? 0) - (b[k] ?? 0); if (d) out[k] = d; }
    return out;
  };
  return {
    earned: sub(s.earned, l.earned),
    spent: sub(s.spent as Record<string, number>, l.spent as Record<string, number>),
    kills: sub(s.kills, l.kills),
    baseDamage: s.baseDamage - l.baseDamage,
    spawned: s.spawned - l.spawned,
    seconds: Math.round(G.t - s.lastT),
  };
}
