// ============================================================
//  Cards: a reward for killing a boss. The game pauses and offers 3 cards (at
//  least one rare or better); the player keeps one. Few cards per game, so each
//  one is strong. Coins in hand can pay for a new hand ("reroll"), dearer each time.
//
//  Pure module (no DOM, no Three.js). The effects are read by the simulation
//  through `G.mods` (recomputed with `computeMods` whenever a card is taken);
//  one-off effects (castle health, free peon, discounts) are applied in
//  `pickCard` in sim.ts. Names and descriptions live in src/i18n.ts
//  (`card.<id>.name` / `card.<id>.desc`).
// ============================================================
import type { GameState } from './types';

export type Rarity = 'common' | 'rare' | 'epic';

export type CardId =
  // towers
  | 'sharpArrows' | 'tautString' | 'blackPowder' | 'siegeShot' | 'hawkEye' | 'arrowRain' | 'foundations'
  // hero
  | 'temperedBlade' | 'lightBoots' | 'magnet' | 'piercingBolt' | 'whirlwind'
  // castle
  | 'reinforcedWalls' | 'mortar' | 'boilingOil' | 'moat'
  // economy
  | 'discount' | 'tithe' | 'interest' | 'cart'
  // helpers
  | 'pack' | 'apprentice' | 'bossBone'
  // against specific enemies
  | 'batHunter' | 'silence' | 'giantSlayer'
  // risk and reward
  | 'bloodPact' | 'goldFever';

export interface CardDef {
  icon: string;
  rarity: Rarity;
  max: number;                          // how many times it can be taken in one game
  when?: (G: GameState) => boolean;     // only offered when it makes sense
}

const hasCannon = (G: GameState) => G.buildings.some(b => b.type === 'cannon') || G.pads.some(p => p.type === 'cannon' && p.active);
const hasWolves = (G: GameState) => G.helperLevels.dog > 0;

export const CARDS: Record<CardId, CardDef> = {
  sharpArrows:     { icon: '🏹', rarity: 'common', max: 3 },
  tautString:      { icon: '🎯', rarity: 'common', max: 3 },
  blackPowder:     { icon: '💥', rarity: 'common', max: 2, when: hasCannon },
  siegeShot:       { icon: '💣', rarity: 'rare',   max: 2, when: hasCannon },
  hawkEye:         { icon: '🦅', rarity: 'rare',   max: 2 },
  arrowRain:       { icon: '🌧️', rarity: 'epic',   max: 1, when: G => G.buildings.some(b => b.type === 'archer') },
  foundations:     { icon: '🧱', rarity: 'common', max: 2, when: G => G.pads.some(p => p.active && p.type === 'upgrade') },

  temperedBlade:   { icon: '🗡️', rarity: 'common', max: 3 },
  lightBoots:      { icon: '👢', rarity: 'common', max: 2 },
  magnet:          { icon: '🧲', rarity: 'common', max: 2 },
  piercingBolt:    { icon: '➶',  rarity: 'rare',   max: 2 },
  whirlwind:       { icon: '🌀', rarity: 'epic',   max: 1 },

  reinforcedWalls: { icon: '🛡️', rarity: 'common', max: 2 },
  mortar:          { icon: '🪣', rarity: 'rare',   max: 2 },
  boilingOil:      { icon: '🔥', rarity: 'rare',   max: 2 },
  moat:            { icon: '🌊', rarity: 'rare',   max: 2 },

  discount:        { icon: '🏷️', rarity: 'common', max: 2, when: G => G.pads.some(p => p.active && !p.done && !p.small) },
  tithe:           { icon: '🪙', rarity: 'rare',   max: 2 },
  interest:        { icon: '🏦', rarity: 'rare',   max: 2 },
  cart:            { icon: '🛒', rarity: 'rare',   max: 2, when: G => G.buildings.length > 0 },

  pack:            { icon: '🐺', rarity: 'rare',   max: 2, when: hasWolves },
  apprentice:      { icon: '🧑‍🌾', rarity: 'epic',  max: 2 },
  bossBone:        { icon: '🦴', rarity: 'common', max: 2, when: hasWolves },

  batHunter:       { icon: '🦇', rarity: 'common', max: 2 },
  silence:         { icon: '🤫', rarity: 'common', max: 2 },
  giantSlayer:     { icon: '⚔️', rarity: 'rare',   max: 2 },

  bloodPact:       { icon: '🩸', rarity: 'epic',   max: 2, when: G => G.base.max > 40 },
  goldFever:       { icon: '💰', rarity: 'epic',   max: 2 },
};

export const CARD_IDS = Object.keys(CARDS) as CardId[];

/** How rarities are drawn (weights). */
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 55, rare: 35, epic: 10 };

/** Card offers (one per boss killed): how many cards, and what a new hand costs. */
export const CARD_RULES = {
  hand: 3,
  rerollBase: 5,               // first reroll: rerollBase + wave
  rerollMult: 1.5,             // each extra reroll in the same offer costs ×1.5
};

/** Everything the cards change, as numbers the simulation reads. 1 = no change (0 for counts). */
export interface CardMods {
  archerDmg: number; archerRate: number; cannonSplash: number; cannonBoss: number; towerRange: number; arrowRain: number;
  swordDmg: number; moveSpeed: number; magnet: number; pierce: number; whirlwind: number;
  clearHeal: number; oil: number; moatSlow: number;
  loot: number; interest: number; cart: number;
  wolfDmg: number; wolfBoss: number;
  flyDmg: number; mageHeal: number; bossDmg: number; allDmg: number; enemyCount: number;
}

export const NO_MODS: CardMods = {
  archerDmg: 1, archerRate: 1, cannonSplash: 1, cannonBoss: 1, towerRange: 1, arrowRain: 0,
  swordDmg: 1, moveSpeed: 1, magnet: 1, pierce: 0, whirlwind: 0,
  clearHeal: 0, oil: 0, moatSlow: 1,
  loot: 1, interest: 0, cart: 0,
  wolfDmg: 1, wolfBoss: 1,
  flyDmg: 1, mageHeal: 1, bossDmg: 1, allDmg: 1, enemyCount: 1,
};

/** Recompute G.mods from the cards held. */
export function computeMods(G: GameState): CardMods {
  const n = (id: CardId) => G.cards[id] ?? 0;
  return {
    archerDmg: 1 + 0.2 * n('sharpArrows'),
    archerRate: 1 + 0.2 * n('tautString'),             // shots per second ×
    cannonSplash: 1 + 0.5 * n('blackPowder'),
    cannonBoss: 1 + n('siegeShot'),                     // ×2, ×3
    towerRange: 1 + 0.2 * n('hawkEye'),
    arrowRain: n('arrowRain'),
    swordDmg: 1 + 0.3 * n('temperedBlade'),
    moveSpeed: 1 + 0.2 * n('lightBoots'),
    magnet: 1 + n('magnet'),
    pierce: 2 * n('piercingBolt'),                      // extra enemies each bolt hits
    whirlwind: n('whirlwind'),
    clearHeal: 0.15 * n('mortar'),                      // added to the difficulty's clearHeal
    oil: 0.2 * n('boilingOil'),                         // burn per second, as a fraction of a warrior's health
    moatSlow: Math.pow(0.7, n('moat')),
    loot: (1 + 0.1 * n('tithe')) * (1 + 0.25 * n('goldFever')),
    interest: 0.05 * n('interest'),
    cart: Math.min(1, 0.3 * n('cart')),
    wolfDmg: 1 + 0.6 * n('pack'),
    wolfBoss: 1 + 2 * n('bossBone'),                    // ×3, ×5
    flyDmg: 1 + 0.6 * n('batHunter'),
    mageHeal: Math.pow(0.4, n('silence')),
    bossDmg: 1 + 0.5 * n('giantSlayer'),
    allDmg: 1 + 0.35 * n('bloodPact'),
    enemyCount: 1 + 0.25 * n('goldFever'),
  };
}

/** Cards that can still be offered right now. */
function pool(G: GameState): CardId[] {
  return CARD_IDS.filter(id => (G.cards[id] ?? 0) < CARDS[id].max && (CARDS[id].when?.(G) ?? true));
}

/** Draw a hand: at least one card is rare or better. `avoid`: cards just shown (a reroll shows new ones if it can). */
export function drawHand(G: GameState, avoid: CardId[] = []): CardId[] {
  let left = pool(G);
  const fresh = left.filter(id => !avoid.includes(id));
  if (fresh.length >= CARD_RULES.hand) left = fresh;
  const hand: CardId[] = [];
  while (hand.length < CARD_RULES.hand && left.length) {
    const needRare = hand.length === CARD_RULES.hand - 1 && hand.every(id => CARDS[id].rarity === 'common');
    const options = needRare && left.some(id => CARDS[id].rarity !== 'common') ? left.filter(id => CARDS[id].rarity !== 'common') : left;
    const total = options.reduce((a, id) => a + RARITY_WEIGHT[CARDS[id].rarity], 0);
    let r = Math.random() * total;
    let pick = options[options.length - 1];
    for (const id of options) { r -= RARITY_WEIGHT[CARDS[id].rarity]; if (r <= 0) { pick = id; break; } }
    hand.push(pick);
    left = left.filter(id => id !== pick);
  }
  return hand;
}

/** Price of the next reroll for the current offer. */
export function rerollCost(G: GameState): number {
  const rolls = G.offer?.rerolls ?? 0;
  return Math.round((CARD_RULES.rerollBase + G.wave) * Math.pow(CARD_RULES.rerollMult, rolls));
}

/** Cards held, compact (for the logs): "sharpArrows2 tithe1". */
export function cardsSummary(G: GameState): string {
  return CARD_IDS.filter(id => G.cards[id]).map(id => id + G.cards[id]).join(' ');
}
