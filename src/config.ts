// ============================================================
//  Design / balance data. Everything "tweakable" lives here.
// ============================================================
import type { Difficulty, EnemyKind, PadType, TowerType } from './game/types';

// World: a huge forest with a playable clearing around the base.
export const WORLD = {
  size: 120,              // ground side length (the edge is never visible)
  playRadius: 17,         // the player can't leave this circle
  spawnRadius: 19.5,      // enemies come out of the trees at this distance
  forestRadius: 18.5,     // dense forest from here on
  clearingRadius: 6.2,    // dirt clearing around the base
};
export const BASE = { x: 60, y: 60 };        // base centre (world centre)
export const BASE_HALF = 1.1;                // base half-side (tiles); for placing pads and tower range
/** Half-side of the ground footprint of the drawn castle (walls + turrets, measured from the model). */
export const CASTLE_HALF = 1.46;
export const PLAYER_RADIUS = 0.25;
const SPREAD = 1.4;                           // spacing of the pads from the base
const at = (dx: number, dy: number) => ({ x: BASE.x + dx * SPREAD, y: BASE.y + dy * SPREAD });

export const PLAYER = {
  start: { x: BASE.x, y: BASE.y + 3.9 },
  speed: 4.4,
  // The player picks a weapon automatically: sword if someone is in melee range, otherwise bow.
  sword: { dmg: 2,   range: 1.5, cd: 0.35 },
  bow:   { dmg: 1,   range: 5.0, cd: 0.55, speed: 13 },
  powerMult: 1.4,         // each "Power" level multiplies damage (grows at the enemies' pace)
  magnetRange: 1.8,
  pickupRange: 0.35,
  padDelay: 0.4,          // seconds standing on a pad before it starts charging
};

export const BASE_HP = 60;

export const WAVES = {
  firstDelay: 5,          // seconds until the first wave
  interval: 40,           // max seconds between waves (if you don't clear the previous one)
  breakTime: 8,           // pause after wiping out a whole wave
  bossEvery: 5,
  bossHp: 6,              // boss health = this × the wave's warrior
  count: (wave: number) => 4 + wave * 2,
  spawnWindow: 13,        // seconds over which the wave is spread
};

/**
 * Enemy types. The values multiply those of that wave's zombie.
 *  - from: first wave it appears in; share: proportion of the wave (rises up to `max`).
 *  - fly: flight height (flyers pass over trees and rocks; the cannon can't hit them).
 */
export const ENEMY_KINDS: Record<EnemyKind, {
  name: string; hp: number; speed: number; value: number; r: number; dmg: number;
  from: number; share: number; grow: number; max: number; fly: number;
}> = {
  zombie: { name: 'Warrior',     hp: 1,    speed: 1,    value: 1,   r: 0.3,  dmg: 1, from: 1, share: 1,    grow: 0,     max: 1,    fly: 0 },
  runner: { name: 'Minion',      hp: 0.5,  speed: 1.75, value: 0.8, r: 0.27, dmg: 1, from: 3, share: 0.2,  grow: 0.01,  max: 0.35, fly: 0 },
  bat:    { name: 'Bat',         hp: 0.55, speed: 1.3,  value: 1,   r: 0.28, dmg: 1, from: 6, share: 0.15, grow: 0.01,  max: 0.25, fly: 0.95 },
  shaman: { name: 'Mage',        hp: 2.2,  speed: 0.8,  value: 3,   r: 0.3,  dmg: 1, from: 8, share: 0.05, grow: 0.004, max: 0.1,  fly: 0 },
};

/** Mage healing: every `every` s heals `pct` of max health to enemies within `range` (itself included). */
export const SHAMAN = { every: 3.2, pct: 0.18, range: 2.8, firstCast: 1.5 };

/** Randomly picks the type of a normal enemy in wave `wave`. */
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
 * Difficulty (chosen on the title screen). Enemy health grows by `grow` per wave up to wave 15,
 * then by `mid` up to 30 and by `late` after that. Loot does NOT follow that curve: it comes from a fixed curve
 * (`lootHp`, the one from the first versions) times `loot`. So more health = harder, not more money.
 * Careful: money is what decides difficulty the most (with more loot, towers grow faster than enemies).
 * `count` multiplies the enemies per wave.
 */
// clearHeal: wiping out a whole wave heals the castle by this fraction of its max health
export const DIFFICULTY: Record<Difficulty, { grow: number; mid: number; late: number; count: number; loot: number; clearHeal: number }> = {
  normal:    { grow: 1.21, mid: 1.2,  late: 1.22, count: 1.4,  loot: 0.9,  clearHeal: 0.12 },
  hard:      { grow: 1.22, mid: 1.21, late: 1.23, count: 1.45, loot: 0.85, clearHeal: 0.08 },
  nightmare: { grow: 1.24, mid: 1.23, late: 1.25, count: 1.6,  loot: 0.8,  clearHeal: 0.04 },
};
export const DIFFICULTIES = Object.keys(DIFFICULTY) as Difficulty[];

/** Base health of a zombie in wave `wave` at that difficulty. */
export function waveHp(wave: number, diff: Difficulty) {
  const d = DIFFICULTY[diff];
  return 3 * Math.pow(d.grow, Math.min(wave, 15) - 1) * Math.pow(d.mid, Math.max(0, Math.min(wave, 30) - 15)) * Math.pow(d.late, Math.max(0, wave - 30));
}

/** Fixed curve the loot comes from: +15% per wave up to 25 and +12% after that. */
const lootHp = (wave: number) => 3 * Math.pow(1.15, Math.min(wave, 25) - 1) * Math.pow(1.12, Math.max(0, wave - 25));

/** Enemies in the wave (not counting the boss). */
export const waveCount = (wave: number, diff: Difficulty) => Math.round(WAVES.count(wave) * DIFFICULTY[diff].count);

export function enemyStats(wave: number, boss: boolean, kind: EnemyKind = 'zombie', diff: Difficulty = 'normal') {
  const baseHp = Math.ceil(waveHp(wave, diff));
  const hp = baseHp * (boss ? WAVES.bossHp : 1);
  // the reward grows with the fixed loot curve (not linearly with the wave)
  const baseValue = Math.max(2, Math.round(Math.pow(lootHp(wave), 0.8) * DIFFICULTY[diff].loot));
  const k = ENEMY_KINDS[boss ? 'zombie' : kind];
  const khp = Math.max(1, Math.round(hp * k.hp));
  return {
    hp: khp,
    maxHp: khp,
    speed: (0.9 + Math.min(0.7, wave * 0.035)) * (boss ? 0.6 : 0.9 + Math.random() * 0.25) * k.speed,
    value: boss ? baseValue * 10 : Math.max(1, Math.round(baseValue * k.value)),
    dmg: boss ? 3 : k.dmg,            // damage per hit to the base
    atkRate: boss ? 1.5 : 2.0,        // seconds between hits
    r: boss ? 0.55 : k.r,
  };
}

export interface PadDef { type: PadType; x: number; y: number; cost: number; unlock: number; repeat?: boolean }

// unlock = number of builds needed for the pad to appear
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
  // outer ring
  { type: 'cannon', ...at(8, 3.3),    cost: 850,  unlock: 13 },
  { type: 'archer', ...at(-8, -3.3),  cost: 1000, unlock: 14 },
  { type: 'archer', ...at(3.3, 8),    cost: 1200, unlock: 15 },
  { type: 'cannon', ...at(-3.3, -8),  cost: 1400, unlock: 16 },
  { type: 'archer', ...at(8, -3.3),   cost: 1650, unlock: 17 },
  { type: 'cannon', ...at(-8, 3.3),   cost: 1900, unlock: 18 },
  { type: 'cannon', ...at(3.3, -8),   cost: 2200, unlock: 19 },
  { type: 'archer', ...at(-3.3, 8),   cost: 2600, unlock: 20 },
];

// Every tower reaches at least the enemies attacking the castle (+ this margin)
export const TOWER_CASTLE_MARGIN = 1.5;

export const PAD_INFO: Record<PadType, { icon: string }> = {
  archer: { icon: '🏹' },
  cannon: { icon: '💣' },
  power:  { icon: '⚔️' },
  repair: { icon: '🔧' },
  forge:  { icon: '🔨' },
  kennel: { icon: '🐺' },
  peon:   { icon: '🧑‍🌾' },
  upgrade: { icon: '⬆️' },
};

// Individual upgrade for each tower: a small pad appears next to it when it's built.
export const TOWER_UPGRADE = {
  maxLevel: 7,
  // Expensive towers start already upgraded: middle ring at level 2, outer ring at level 3.
  startLevel: (towerCost: number) => towerCost >= 850 ? 3 : towerCost >= 120 ? 2 : 1,
  // `step` = how many upgrades that tower already has (0 = the first one)
  cost: (towerCost: number, step: number) => Math.ceil(Math.max(15, towerCost * 0.6) * Math.pow(1.6, step)),
  dmgMult: 1.35,       // damage multiplier per level
  rangeAdd: 0.3,       // extra range per level
  cdMult: 0.92,        // fire rate: the time between shots is multiplied by this
};

// ------------------------------------------------------------
//  Solid scenery in the clearing (trees, rocks, stumps and logs).
//  The simulation places it at the start of each game and nobody can pass through it.
//  `solid`: circles at scale 1, measured from each model's base (for trees, only the trunk,
//  so you can walk under the canopy). With `half` it's a capsule along the model's z axis
//  (fallen logs): with several circles in a row, zombies got stuck head-on.
// ------------------------------------------------------------
export interface PropKind { models: string[]; count: number; r0: number; r1: number; s0: number; s1: number; tilt?: number }
export const PROP_KINDS: PropKind[] = [
  // scattered trees, far from the base
  { models: ['tree_default', 'tree_oak', 'tree_fat', 'tree_cone'], count: 22, r0: 12.5, r1: WORLD.forestRadius - 1, s0: 1.0, s1: 1.4 },
  // rocks and "little hills" (the Nature Kit's large rocks are low mounds with grass on top)
  { models: ['rock_largeA', 'stone_largeA', 'rock_largeB', 'stone_largeC', 'rock_largeC', 'rock_smallA', 'rock_smallC'], count: 26, r0: WORLD.clearingRadius + 1.5, r1: WORLD.forestRadius - 0.5, s0: 0.9, s1: 1.8 },
  { models: ['stump_round', 'log'], count: 14, r0: WORLD.clearingRadius + 3, r1: WORLD.forestRadius - 0.5, s0: 1.2, s1: 1.7 },
];
export const PROP_SOLID: Record<string, { r: number; half?: number }[]> = {
  tree_default: [{ r: 0.15 }], tree_oak: [{ r: 0.2 }], tree_fat: [{ r: 0.36 }], tree_cone: [{ r: 0.12 }],
  rock_largeA: [{ r: 0.46 }], stone_largeA: [{ r: 0.46 }], rock_largeB: [{ r: 0.46 }],
  stone_largeC: [{ r: 0.52 }], rock_largeC: [{ r: 0.52 }],
  rock_smallA: [{ r: 0.18 }],                       // rock_smallC is a flat pebble: you walk over it
  stump_round: [{ r: 0.18 }],
  log: [{ r: 0.12, half: 0.23 }],
};

// Helpers: unlocked on their pad and upgraded by paying for it again.
//  - dog: picks up coins from the ground and brings them to you (and follows you when there's no work)
//  - peon: empties the towers' tables and brings you the loot (waits at its hut)
export const HELPERS = {
  // Each level adds one more unit (up to maxCount) and improves all of them.
  dog: {
    pad: 'kennel' as const,
    homeOffset: { x: 1.1, y: 0 },          // the kennel is built next to its pad
    count: (level: number) => Math.min(level, 6),
    speed: (level: number) => 4.8 + (level - 1) * 0.3,
    capacity: (level: number) => 6 + (level - 1) * 3,
    dmg: (level: number) => 1.5 * Math.pow(1.4, level - 1),  // bite (+40% per level)
    atkCd: 0.6,
    aggroRange: 3.5,                        // attacks enemies this close to it
    huntRange: 9,                           // with no coins to pick up, goes after enemies near the player
    idle: 'follow' as const,
  },
  peon: {
    pad: 'peon' as const,
    homeOffset: { x: -1.1, y: 0 },
    count: (level: number) => Math.min(level, 8),
    speed: (level: number) => 4.4 + (level - 1) * 0.3,
    capacity: (level: number) => Math.round(15 * level * (1 + 0.15 * (level - 1))),  // 15, 35, 59 … 157 (lv 6), 288 (lv 8)
    tableRate: (level: number) => 25 + (level - 1) * 10,   // coins/second it takes from a table
    idle: 'home' as const,
  },
  radius: { dog: 0.22, peon: 0.24 },       // size for collisions between them
  pickupRange: 0.3,
  tableRange: 0.6,
  deliverRange: 0.7,
  followDist: 1.4,
};

export const REPEAT_COST_MULT = 1.7;
// Some repeatable pads get more expensive more slowly
export const REPEAT_COST_MULT_BY: Partial<Record<PadType, number>> = { forge: 1.5 };
// The forge multiplies the damage of towers, player and dogs
export const FORGE_MULT = 1.25;

export const TOWER_STATS: Record<TowerType, { range: number; cd: number; dmg: number; speed: number; splash: number; muzzle: number }> = {
  archer: { range: 4.6, cd: 0.7,  dmg: 1.6, speed: 12, splash: 0,   muzzle: 2.0 },
  cannon: { range: 3.8, cd: 2.0,  dmg: 6,   speed: 7,  splash: 1.3, muzzle: 1.0 },
};
