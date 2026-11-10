// ============================================================
//  Registro de partida: contadores + una foto por oleada.
//  Sirve para analizar partidas y equilibrar la dificultad.
// ============================================================
import { enemyStats } from '../config';
import type { Counters, GameState, Stats, WaveLog } from './types';

function emptyCounters(): Counters {
  return {
    earned: { ground: 0, table: 0, dog: 0, peon: 0 },
    spent: {},
    kills: { sword: 0, bow: 0, archer: 0, cannon: 0, dog: 0 },
    baseDamage: 0,
    spawned: 0,
    spawnedKind: {},
  };
}

export function emptyStats(): Stats {
  return { ...emptyCounters(), waves: [], last: emptyCounters(), lastT: 0 };
}

const snapshot = (c: Counters): Counters => JSON.parse(JSON.stringify({
  earned: c.earned, spent: c.spent, kills: c.kills, baseDamage: c.baseDamage, spawned: c.spawned,
  spawnedKind: c.spawnedKind,
}));

function diffRecord<K extends string>(now: Partial<Record<K, number>>, before: Partial<Record<K, number>>) {
  const out = {} as Record<K, number>;
  for (const k of Object.keys(now) as K[]) {
    const d = (now[k] ?? 0) - (before[k] ?? 0);
    if (d) out[k] = d;
  }
  return out;
}

/** Guarda la foto de la oleada actual (se llama al empezar la siguiente o al perder). */
export function logWave(G: GameState) {
  const s = G.stats, l = s.last;
  const normal = enemyStats(G.wave, false);
  const log: WaveLog = {
    wave: G.wave,
    t: Math.round(G.t),
    duration: Math.round(G.t - s.lastT),
    baseHp: Math.ceil(G.base.hp), baseMax: G.base.max,
    coinsHeld: G.player.coins,
    tablesLoot: G.buildings.reduce((a, b) => a + b.table, 0),
    groundCoins: G.drops.reduce((a, c) => a + c.worth, 0),
    enemiesAlive: G.enemies.length,
    enemyHp: normal.maxHp,
    enemyValue: normal.value,
    earned: diffRecord(s.earned, l.earned) as Counters['earned'],
    spent: diffRecord(s.spent, l.spent),
    kills: diffRecord(s.kills, l.kills) as Counters['kills'],
    baseDamage: s.baseDamage - l.baseDamage,
    spawned: s.spawned - l.spawned,
    spawnedKind: diffRecord(s.spawnedKind, l.spawnedKind),
    towers: G.buildings.map(b => (b.type === 'archer' ? 'A' : 'C') + b.level).join(' '),
    towerMult: +G.towerMult.toFixed(2),
    helpers: {
      dog: G.helpers.filter(h => h.kind === 'dog').length,
      peon: G.helpers.filter(h => h.kind === 'peon').length,
    },
    player: { sword: +(G.player.swordDmg * G.towerMult).toFixed(1), bow: +(G.player.bowDmg * G.towerMult).toFixed(1) },
    pads: G.pads.filter(p => p.repeat && p.type !== 'upgrade' && p.level > 0).map(p => `${p.type}${p.level}`).join(' '),
  };
  s.waves.push(log);
  s.last = snapshot(s);
  s.lastT = G.t;
}
