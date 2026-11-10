// ============================================================
//  Datos de diseño / equilibrio. Todo lo "tocable" vive aquí.
// ============================================================
import type { Difficulty, EnemyKind, PadType, TowerType } from './game/types';

// Mundo: un bosque enorme con un claro jugable alrededor de la base.
export const WORLD = {
  size: 120,              // lado del suelo (nunca se ve el borde)
  playRadius: 17,         // el jugador no puede salir de este círculo
  spawnRadius: 19.5,      // los enemigos salen de entre los árboles a esta distancia
  forestRadius: 18.5,     // a partir de aquí, bosque denso
  clearingRadius: 6.2,    // explanada de tierra alrededor de la base
};
export const BASE = { x: 60, y: 60 };        // centro de la base (centro del mundo)
export const BASE_HALF = 1.1;                // medio lado de la base (tiles); para colocar parcelas y alcance de torres
/** Medio lado de lo que ocupa el castillo dibujado en el suelo (murallas + torreones, medido del modelo). */
export const CASTLE_HALF = 1.46;
export const PLAYER_RADIUS = 0.25;
const SPREAD = 1.4;                           // separación de las parcelas respecto a la base
const at = (dx: number, dy: number) => ({ x: BASE.x + dx * SPREAD, y: BASE.y + dy * SPREAD });

export const PLAYER = {
  start: { x: BASE.x, y: BASE.y + 3.9 },
  speed: 4.4,
  // El jugador elige arma solo: espada si hay alguien cuerpo a cuerpo, si no, arco.
  sword: { dmg: 2,   range: 1.5, cd: 0.35 },
  bow:   { dmg: 1,   range: 5.0, cd: 0.55, speed: 13 },
  powerMult: 1.4,         // cada nivel de "Fuerza" multiplica el daño (crece al ritmo de los enemigos)
  magnetRange: 1.8,
  pickupRange: 0.35,
  padDelay: 0.4,          // segundos encima de una parcela antes de empezar a pagar
};

export const BASE_HP = 60;

export const WAVES = {
  firstDelay: 5,          // segundos hasta la primera oleada
  interval: 40,           // máximo de segundos entre oleadas (si no limpias la anterior)
  breakTime: 8,           // pausa tras eliminar una oleada entera
  bossEvery: 5,
  count: (wave: number) => 4 + wave * 2,
  spawnWindow: 13,        // segundos en los que se reparte la oleada
};

/**
 * Tipos de enemigo. Los valores multiplican los del zombi de esa oleada.
 *  - from: primera oleada en la que aparece; share: proporción de la oleada (va subiendo hasta `max`).
 *  - fly: altura de vuelo (los voladores pasan por encima de árboles y rocas; el cañón no les acierta).
 */
export const ENEMY_KINDS: Record<EnemyKind, {
  name: string; hp: number; speed: number; value: number; r: number; dmg: number;
  from: number; share: number; grow: number; max: number; fly: number;
}> = {
  zombie: { name: 'Guerrero',     hp: 1,    speed: 1,    value: 1,   r: 0.3,  dmg: 1, from: 1, share: 1,    grow: 0,     max: 1,    fly: 0 },
  runner: { name: 'Esbirro',     hp: 0.5,  speed: 1.75, value: 0.8, r: 0.27, dmg: 1, from: 3, share: 0.2,  grow: 0.01,  max: 0.35, fly: 0 },
  bat:    { name: 'Murciélago',  hp: 0.55, speed: 1.3,  value: 1,   r: 0.28, dmg: 1, from: 6, share: 0.15, grow: 0.01,  max: 0.25, fly: 0.95 },
  shaman: { name: 'Mago',        hp: 2.2,  speed: 0.8,  value: 3,   r: 0.3,  dmg: 1, from: 8, share: 0.05, grow: 0.004, max: 0.1,  fly: 0 },
};

/** Curación del mago: cada `every` s cura un `pct` de la vida máxima a los enemigos a menos de `range` (también a sí mismo). */
export const SHAMAN = { every: 3.2, pct: 0.18, range: 2.8, firstCast: 1.5 };

/** Elige al azar el tipo de un enemigo normal de la oleada `wave`. */
export function pickEnemyKind(wave: number): EnemyKind {
  let roll = Math.random();
  for (const k of ['shaman', 'bat', 'runner'] as const) {
    const d = ENEMY_KINDS[k];
    if (wave < d.from) continue;
    const share = Math.min(d.max, d.share + d.grow * (wave - d.from));
    if (roll < share) return k;
    roll -= share;
  }
  return 'zombie';
}

/**
 * Dificultad (se elige en la portada). La vida de los enemigos crece un `grow` por oleada hasta la 15,
 * luego `mid` hasta la 30 y `late` a partir de ahí. El botín NO sigue esa curva: sale de una curva fija
 * (`lootHp`, la de las primeras versiones) por `loot`. Así más vida = más duro, no más dinero.
 * Ojo: el dinero es lo que más decide la dificultad (con más botín, las torres crecen más rápido que los enemigos).
 * `count` multiplica los enemigos por oleada.
 */
export const DIFFICULTY: Record<Difficulty, { name: string; grow: number; mid: number; late: number; count: number; loot: number }> = {
  normal:    { name: 'Normal',    grow: 1.21, mid: 1.2,  late: 1.16, count: 1.4,  loot: 0.9 },
  hard:      { name: 'Difícil',   grow: 1.22, mid: 1.21, late: 1.17, count: 1.45, loot: 0.85 },
  nightmare: { name: 'Pesadilla', grow: 1.24, mid: 1.23, late: 1.19, count: 1.6,  loot: 0.8 },
};
export const DIFFICULTIES = Object.keys(DIFFICULTY) as Difficulty[];

/** Vida base de un zombi en la oleada `wave` con esa dificultad. */
export function waveHp(wave: number, diff: Difficulty) {
  const d = DIFFICULTY[diff];
  return 3 * Math.pow(d.grow, Math.min(wave, 15) - 1) * Math.pow(d.mid, Math.max(0, Math.min(wave, 30) - 15)) * Math.pow(d.late, Math.max(0, wave - 30));
}

/** Curva fija de la que sale el botín: +15 % por oleada hasta la 25 y +12 % después. */
const lootHp = (wave: number) => 3 * Math.pow(1.15, Math.min(wave, 25) - 1) * Math.pow(1.12, Math.max(0, wave - 25));

/** Enemigos de la oleada (sin contar al jefe). */
export const waveCount = (wave: number, diff: Difficulty) => Math.round(WAVES.count(wave) * DIFFICULTY[diff].count);

export function enemyStats(wave: number, boss: boolean, kind: EnemyKind = 'zombie', diff: Difficulty = 'normal') {
  const baseHp = Math.ceil(waveHp(wave, diff));
  const hp = baseHp * (boss ? 8 : 1);
  // la recompensa crece con la curva fija de botín (no linealmente con la oleada)
  const baseValue = Math.max(2, Math.round(Math.pow(lootHp(wave), 0.8) * DIFFICULTY[diff].loot));
  const k = ENEMY_KINDS[boss ? 'zombie' : kind];
  const khp = Math.max(1, Math.round(hp * k.hp));
  return {
    hp: khp,
    maxHp: khp,
    speed: (0.9 + Math.min(0.7, wave * 0.035)) * (boss ? 0.6 : 0.9 + Math.random() * 0.25) * k.speed,
    value: boss ? baseValue * 10 : Math.max(1, Math.round(baseValue * k.value)),
    dmg: boss ? 3 : k.dmg,            // daño por golpe a la base
    atkRate: boss ? 1.5 : 2.0,        // segundos entre golpes
    r: boss ? 0.55 : k.r,
  };
}

export interface PadDef { type: PadType; x: number; y: number; cost: number; unlock: number; repeat?: boolean }

// unlock = nº de construcciones necesarias para que la parcela aparezca
export const PAD_DEFS: PadDef[] = [
  { type: 'archer', ...at(-3, 0),   cost: 10,  unlock: 0 },
  { type: 'power',  ...at(2.6, 2.6), cost: 15,  unlock: 1, repeat: true },
  { type: 'archer', ...at(3, 0),   cost: 25,  unlock: 1 },
  { type: 'archer', ...at(0, -3),   cost: 40,  unlock: 2 },
  { type: 'kennel', ...at(4.4, 2.8), cost: 30,  unlock: 2, repeat: true },
  { type: 'peon',   ...at(-4.4, -2.4), cost: 150, unlock: 3, repeat: true },
  { type: 'repair', ...at(-2.6, 2.6), cost: 20,  unlock: 2, repeat: true },
  { type: 'forge',  ...at(2.6, -2.6), cost: 50,  unlock: 3, repeat: true },
  { type: 'cannon', ...at(0, 3.4), cost: 80,  unlock: 3 },
  { type: 'archer', ...at(-3, -3),   cost: 90,  unlock: 4 },
  { type: 'cannon', ...at(-5.5, 0),   cost: 120, unlock: 5 },
  { type: 'archer', ...at(5.5, 0),   cost: 150, unlock: 6 },
  { type: 'cannon', ...at(0, -5.5),  cost: 220, unlock: 7 },
  { type: 'archer', ...at(0, 6),   cost: 280, unlock: 8 },
  { type: 'cannon', ...at(5.5, 5.5), cost: 380, unlock: 9 },
  { type: 'archer', ...at(-5.5, -5.5),  cost: 450, unlock: 10 },
  { type: 'cannon', ...at(5.5, -5.5),  cost: 600, unlock: 11 },
  { type: 'archer', ...at(-5.5, 5.5), cost: 700, unlock: 12 },
  // anillo exterior
  { type: 'cannon', ...at(8, 3.3),    cost: 850,  unlock: 13 },
  { type: 'archer', ...at(-8, -3.3),  cost: 1000, unlock: 14 },
  { type: 'archer', ...at(3.3, 8),    cost: 1200, unlock: 15 },
  { type: 'cannon', ...at(-3.3, -8),  cost: 1400, unlock: 16 },
  { type: 'archer', ...at(8, -3.3),   cost: 1650, unlock: 17 },
  { type: 'cannon', ...at(-8, 3.3),   cost: 1900, unlock: 18 },
  { type: 'cannon', ...at(3.3, -8),   cost: 2200, unlock: 19 },
  { type: 'archer', ...at(-3.3, 8),   cost: 2600, unlock: 20 },
];

// Toda torre alcanza, como mínimo, a los enemigos que atacan el castillo (+ este margen)
export const TOWER_CASTLE_MARGIN = 1.5;

export const PAD_INFO: Record<PadType, { label: string; icon: string }> = {
  archer: { label: 'Torre arquera', icon: '🏹' },
  cannon: { label: 'Cañón',         icon: '💣' },
  power:  { label: 'Fuerza +40%',     icon: '⚔️' },
  repair: { label: 'Reparar base',  icon: '🔧' },
  forge:  { label: 'Forja: daño +25%',   icon: '🔨' },
  kennel: { label: 'Lobo',          icon: '🐺' },
  peon:   { label: 'Peón',          icon: '🧑‍🌾' },
  upgrade: { label: 'Mejorar torre', icon: '⬆️' },
};

// Mejora individual de cada torre: aparece una parcela pequeña al lado al construirla.
export const TOWER_UPGRADE = {
  maxLevel: 7,
  // Las torres caras nacen ya mejoradas: anillo medio en nivel 2, anillo exterior en nivel 3.
  startLevel: (towerCost: number) => towerCost >= 850 ? 3 : towerCost >= 120 ? 2 : 1,
  // `step` = cuántas mejoras lleva ya esa torre (0 = la primera)
  cost: (towerCost: number, step: number) => Math.ceil(Math.max(15, towerCost * 0.6) * Math.pow(1.6, step)),
  dmgMult: 1.35,       // multiplicador de daño por nivel
  rangeAdd: 0.3,       // alcance extra por nivel
  cdMult: 0.92,        // cadencia: el tiempo entre disparos se multiplica por esto
};

// ------------------------------------------------------------
//  Decorado sólido del claro (árboles, rocas, tocones y troncos).
//  Lo coloca la simulación al empezar cada partida y nadie lo puede atravesar.
//  `solid`: círculos a escala 1, medidos de la base de cada modelo (en los árboles, solo el tronco,
//  para poder pasar bajo la copa). Con `half` es una cápsula a lo largo del eje z del modelo
//  (troncos caídos): con varios círculos en fila los zombis se quedaban atascados de frente.
// ------------------------------------------------------------
export interface PropKind { models: string[]; count: number; r0: number; r1: number; s0: number; s1: number; tilt?: number }
export const PROP_KINDS: PropKind[] = [
  // árboles sueltos, lejos de la base
  { models: ['tree_default', 'tree_oak', 'tree_fat', 'tree_cone'], count: 22, r0: 12.5, r1: WORLD.forestRadius - 1, s0: 1.0, s1: 1.4 },
  // rocas y «montañitas» (las rocas grandes del Nature Kit son lomas bajas con hierba encima)
  { models: ['rock_largeA', 'stone_largeA', 'rock_largeB', 'stone_largeC', 'rock_largeC', 'rock_smallA', 'rock_smallC'], count: 26, r0: WORLD.clearingRadius + 1.5, r1: WORLD.forestRadius - 0.5, s0: 0.9, s1: 1.8 },
  { models: ['stump_round', 'log'], count: 14, r0: WORLD.clearingRadius + 3, r1: WORLD.forestRadius - 0.5, s0: 1.2, s1: 1.7 },
];
export const PROP_SOLID: Record<string, { r: number; half?: number }[]> = {
  tree_default: [{ r: 0.15 }], tree_oak: [{ r: 0.2 }], tree_fat: [{ r: 0.36 }], tree_cone: [{ r: 0.12 }],
  rock_largeA: [{ r: 0.46 }], stone_largeA: [{ r: 0.46 }], rock_largeB: [{ r: 0.46 }],
  stone_largeC: [{ r: 0.52 }], rock_largeC: [{ r: 0.52 }],
  rock_smallA: [{ r: 0.18 }],                       // rock_smallC es una piedrecita plana: se pisa
  stump_round: [{ r: 0.18 }],
  log: [{ r: 0.12, half: 0.23 }],
};

// Ayudantes: se desbloquean en su parcela y se mejoran pagándola otra vez.
//  - perro: recoge monedas del suelo y te las trae (y te sigue cuando no hay trabajo)
//  - peón: vacía las mesas de las torres y te trae el botín (espera en su cabaña)
export const HELPERS = {
  // Cada nivel añade una unidad más (hasta maxCount) y mejora a todas.
  dog: {
    pad: 'kennel' as const,
    name: 'Lobos',
    homeOffset: { x: 1.1, y: 0 },          // la caseta se construye al lado de su parcela
    count: (level: number) => Math.min(level, 6),
    speed: (level: number) => 4.8 + (level - 1) * 0.3,
    capacity: (level: number) => 6 + (level - 1) * 3,
    dmg: (level: number) => 1.5 * Math.pow(1.4, level - 1),  // mordisco (+40% por nivel)
    atkCd: 0.6,
    aggroRange: 3.5,                        // ataca a enemigos así de cerca de él
    huntRange: 9,                           // sin monedas que recoger, va a por enemigos cerca del jugador
    idle: 'follow' as const,
  },
  peon: {
    pad: 'peon' as const,
    name: 'Peones',
    homeOffset: { x: -1.1, y: 0 },
    count: (level: number) => Math.min(level, 8),
    speed: (level: number) => 4.4 + (level - 1) * 0.3,
    capacity: (level: number) => Math.round(15 * level * (1 + 0.15 * (level - 1))),  // 15, 35, 59 … 157 (nv 6), 288 (nv 8)
    tableRate: (level: number) => 25 + (level - 1) * 10,   // monedas/segundo que coge de una mesa
    idle: 'home' as const,
  },
  radius: { dog: 0.22, peon: 0.24 },       // tamaño para las colisiones entre ellos
  pickupRange: 0.3,
  tableRange: 0.6,
  deliverRange: 0.7,
  followDist: 1.4,
};

export const REPEAT_COST_MULT = 1.7;
// Algunas parcelas repetibles encarecen más despacio
export const REPEAT_COST_MULT_BY: Partial<Record<PadType, number>> = { forge: 1.5 };
// La forja multiplica el daño de torres, jugador y perros
export const FORGE_MULT = 1.25;

export const TOWER_STATS: Record<TowerType, { range: number; cd: number; dmg: number; speed: number; splash: number; muzzle: number }> = {
  archer: { range: 4.6, cd: 0.7,  dmg: 1.6, speed: 12, splash: 0,   muzzle: 2.0 },
  cannon: { range: 3.8, cd: 2.0,  dmg: 6,   speed: 7,  splash: 1.3, muzzle: 1.0 },
};
