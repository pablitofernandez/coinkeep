// ============================================================
//  Datos de diseño / equilibrio. Todo lo "tocable" vive aquí.
// ============================================================
import type { PadType, TowerType } from './game/types';

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

export function enemyStats(wave: number, boss: boolean) {
  // +15% de vida por oleada hasta la 25; a partir de ahí crece algo más despacio (+12%)
  const late = Math.max(0, wave - 25);
  const baseHp = Math.ceil(3 * Math.pow(1.15, Math.min(wave, 25) - 1) * Math.pow(1.12, late));
  const hp = baseHp * (boss ? 8 : 1);
  // la recompensa crece con la vida (no linealmente con la oleada)
  const baseValue = Math.max(2, Math.round(Math.pow(baseHp, 0.8)));
  return {
    hp,
    maxHp: hp,
    speed: (0.9 + Math.min(0.7, wave * 0.035)) * (boss ? 0.6 : 0.9 + Math.random() * 0.25),
    value: baseValue * (boss ? 10 : 1),
    dmg: boss ? 3 : 1,                // daño por golpe a la base
    atkRate: boss ? 1.5 : 2.0,        // segundos entre golpes
    r: boss ? 0.55 : 0.3,
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
