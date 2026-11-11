// ============================================================
//  Limpieza de la telemetría descargada de Supabase (la usa pull-logs.mjs).
//
//  Cualquiera con la clave pública puede insertar filas en game_logs, así que lo
//  que llega de la tabla es dato de TERCEROS: se reconstruye cada registro solo
//  con las claves que manda el juego (src/telemetry.ts, src/game/stats.ts) y con
//  el tipo y formato esperados. Lo que no encaja se descarta. Así ningún texto
//  libre llega a logs/remote/ (ni a quien los lea, persona o asistente de IA).
// ============================================================

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const TOWERS = /^([AC]\d{1,3}( [AC]\d{1,3})*)?$/;
const PADS = /^((archer|cannon|power|repair|forge|kennel|peon|upgrade)\d{1,3}( (archer|cannon|power|repair|forge|kennel|peon|upgrade)\d{1,3})*)?$/;
const VERSION = /^([0-9a-f]{7,40}|dev)$/;
const SCREEN = /^\d{1,5}x\d{1,5}@\d{1,2}(\.\d{1,2})?$/;
const PLATFORMS = ['iPhone', 'iPad', 'Android', 'Windows', 'Mac', 'Linux', 'Otro'];
const DIFFICULTIES = ['normal', 'hard', 'nightmare'];
const EVENTS = ['wave', 'over', 'left'];

/** Un objeto plano de clave corta (solo minúsculas) → número. Si algo no encaja, null. */
function counters(o, allowed) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (!/^[a-z]{1,12}$/.test(k) || (allowed && !allowed.includes(k)) || !isNum(v)) return null;
    out[k] = v;
  }
  return out;
}

const pickNums = (o, keys) => {
  const out = {};
  for (const k of keys) { if (!isNum(o[k])) return null; out[k] = o[k]; }
  return out;
};

const WAVE_NUMS = ['wave', 't', 'duration', 'baseHp', 'baseMax', 'coinsHeld', 'tablesLoot', 'groundCoins',
  'enemiesAlive', 'enemyHp', 'enemyValue', 'baseDamage', 'spawned', 'towerMult'];

/** Una oleada (WaveLog) limpia, o null si no tiene la forma esperada. */
export function cleanWave(w) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return null;
  const nums = pickNums(w, WAVE_NUMS);
  if (!nums || !Number.isInteger(w.wave) || w.wave < 0 || w.wave > 5000) return null;
  const earned = counters(w.earned), spent = counters(w.spent), kills = counters(w.kills);
  const spawnedKind = counters(w.spawnedKind ?? {});
  const helpers = counters(w.helpers, ['dog', 'peon']);
  const player = counters(w.player, ['sword', 'bow']);
  if (!earned || !spent || !kills || !spawnedKind || !helpers || !player) return null;
  if (typeof w.towers !== 'string' || !TOWERS.test(w.towers)) return null;
  if (typeof w.pads !== 'string' || !PADS.test(w.pads)) return null;
  return { ...nums, earned, spent, kills, spawnedKind, towers: w.towers, helpers, player, pads: w.pads };
}

/** La foto «now» de una fila, o undefined. */
function cleanNow(n) {
  if (!n || typeof n !== 'object') return undefined;
  const nums = pickNums(n, ['baseHp', 'baseMax', 'coins', 'towerMult', 'enemiesAlive', 'built']);
  const helpers = counters(n.helpers, ['dog', 'peon']);
  if (!nums || !helpers || typeof n.towers !== 'string' || !TOWERS.test(n.towers)) return undefined;
  return { ...nums, towers: n.towers, helpers };
}

/** Los totales de una fila, o undefined. */
function cleanTotals(t) {
  if (!t || typeof t !== 'object') return undefined;
  const nums = pickNums(t, ['baseDamage', 'spawned']);
  const earned = counters(t.earned), spent = counters(t.spent), kills = counters(t.kills);
  const spawnedKind = counters(t.spawnedKind ?? {});
  if (!nums || !earned || !spent || !kills || !spawnedKind) return undefined;
  return { earned, spent, kills, ...nums, spawnedKind };
}

/**
 * Una fila de game_logs limpia, o null si las columnas no tienen el formato del juego.
 * Las oleadas que no encajan se descartan una a una (y se cuentan en `badWaves`).
 */
export function cleanRow(row) {
  if (!row || typeof row !== 'object') return null;
  const ok =
    isNum(row.id) && UUID.test(row.session ?? '') && UUID.test(row.player ?? '') &&
    typeof row.created_at === 'string' && ISO.test(row.created_at) &&
    Number.isInteger(row.seq) && EVENTS.includes(row.event) &&
    typeof row.version === 'string' && VERSION.test(row.version) &&
    DIFFICULTIES.includes(row.difficulty) &&
    Number.isInteger(row.wave) && Number.isInteger(row.seconds) &&
    typeof row.mobile === 'boolean' && typeof row.cheats === 'boolean' &&
    typeof row.screen === 'string' && SCREEN.test(row.screen) &&
    PLATFORMS.includes(row.platform) &&
    row.data && typeof row.data === 'object' && !Array.isArray(row.data);
  if (!ok) return null;
  const rawWaves = Array.isArray(row.data.waves) ? row.data.waves : [];
  const waves = rawWaves.map(cleanWave).filter(Boolean);
  return {
    id: row.id, session: row.session, player: row.player, created_at: row.created_at,
    seq: row.seq, event: row.event, version: row.version, difficulty: row.difficulty,
    wave: row.wave, seconds: row.seconds, mobile: row.mobile, cheats: row.cheats,
    screen: row.screen, platform: row.platform,
    data: { waves, now: cleanNow(row.data.now), totals: cleanTotals(row.data.totals) },
    badWaves: rawWaves.length - waves.length,
  };
}
