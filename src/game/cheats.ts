// ============================================================
//  Developer menu cheats. Pure functions over the GameState
//  (no Three.js or DOM), just like the simulation.
//  Any cheat marks the game as "cheated".
// ============================================================
import { BASE, CASTLE_HALF, PLAYER, TOWER_UPGRADE } from '../config';
import { completePad, killEnemy, pickCard, placeProps, spawnEnemy } from './sim';
import { CARD_IDS, drawHand, type CardId } from './cards';
import type { EnemyKind, GameState, Pad, PadType, Vec } from './types';

export const mark = (G: GameState) => { G.cheated = true; };

// ------------------------------------------------------------
//  Enemies and waves
// ------------------------------------------------------------

/** Spawns `n` enemies: from the forest (spread out) or in a ring near the player. */
export function spawnMany(G: GameState, n: number, where: 'forest' | 'near', boss = false, kind?: EnemyKind) {
  mark(G);
  const p = G.player;
  for (let i = 0; i < n; i++) {
    if (where === 'forest') { spawnEnemy(G, boss, undefined, kind); continue; }
    const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 2.5;
    let at: Vec = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
    // don't let them appear inside the castle
    if (Math.max(Math.abs(at.x - BASE.x), Math.abs(at.y - BASE.y)) < CASTLE_HALF + 0.5) at = { x: BASE.x + Math.cos(a) * 4, y: BASE.y + Math.sin(a) * 4 };
    spawnEnemy(G, boss, at, kind);
  }
}

/** Jumps to wave N: starts right now, with that wave's size and toughness. */
export function jumpToWave(G: GameState, n: number) {
  mark(G);
  G.wave = Math.max(0, Math.floor(n) - 1);
  G.spawnLeft = 0;
  G.waveTimer = 0;
}

export function nextWaveNow(G: GameState) { mark(G); G.waveTimer = 0; }

/** Kills every enemy (they drop their coins, as if the player had killed them). */
export function killAll(G: GameState, withCoins: boolean) {
  mark(G);
  if (withCoins) for (const e of G.enemies) killEnemy(G, e, null, 'sword');
  else for (const e of G.enemies) { e.dead = true; G.events.push({ type: 'enemyDied', x: e.x, y: e.y, boss: e.boss, kind: e.kind }); }
  G.enemies = G.enemies.filter(e => !e.dead);
  G.spawnLeft = 0;
}

// ------------------------------------------------------------
//  Castle and player
// ------------------------------------------------------------
export function setBaseHp(G: GameState, hp: number) { mark(G); G.base.hp = Math.max(1, Math.min(G.base.max, hp)); }

export function setCastleLevel(G: GameState, level: number) { mark(G); G.castleLevel = Math.max(1, Math.min(5, level)); }

export function teleport(G: GameState, to: Vec) {
  mark(G);
  G.player.x = to.x; G.player.y = to.y;
  G.padDwellId = -1; G.padDwell = 0;
}

/** Point in front of the castle gate. */
export const castleFront = (): Vec => ({ x: PLAYER.start.x, y: PLAYER.start.y });

// ------------------------------------------------------------
//  Economy
// ------------------------------------------------------------
export function addCoins(G: GameState, n: number) { mark(G); G.player.coins += n; }

/** Reveals every pad that hasn't appeared yet. */
export function unlockAllPads(G: GameState) {
  mark(G);
  for (const pad of G.pads) if (!pad.done) pad.active = true;
}

// ------------------------------------------------------------
//  Building
// ------------------------------------------------------------

/** Completes a pad for free (doesn't count as spending in the log). */
function finish(G: GameState, pad: Pad) {
  pad.active = true;
  pad.paid = pad.cost;
  pad.cool = 0;
  completePad(G, pad);
}

/** Builds every tower whose pad is visible (with `all`, also the still hidden ones). */
export function buildAllTowers(G: GameState, all = false) {
  mark(G);
  for (const pad of [...G.pads]) {
    if ((pad.type === 'archer' || pad.type === 'cannon') && !pad.done && (all || pad.active)) finish(G, pad);
  }
}

/** Raises every built tower to the max level. */
export function maxAllTowers(G: GameState) {
  mark(G);
  for (const pad of G.pads) {
    if (pad.type !== 'upgrade' || pad.done) continue;
    const b = G.buildings.find(x => x.id === pad.buildingId);
    if (!b) continue;
    while (b.level < TOWER_UPGRADE.maxLevel && !pad.done) finish(G, pad);
  }
}

/** Levels up a repeatable pad N times (power, forge, wolves, peons, repair). */
export function levelUp(G: GameState, type: PadType, times = 1) {
  mark(G);
  const pad = G.pads.find(p => p.type === type);
  if (!pad) return;
  for (let i = 0; i < times; i++) finish(G, pad);
}

/** Current level of a repeatable pad. */
export const padLevel = (G: GameState, type: PadType) => G.pads.find(p => p.type === type)?.level ?? 0;

// ------------------------------------------------------------
//  World
// ------------------------------------------------------------
export function regenProps(G: GameState) {
  mark(G);
  G.props = []; G.solids = [];
  placeProps(G);
}

/**
 * Title screen scene: castle level 4, the four nearest towers already upgraded,
 * two wolves and a rogue with some coins. The castle is invulnerable and no pads are shown.
 * `showcaseTick` keeps the zombies coming.
 */
export function showcase(G: GameState) {
  G.cardsOn = false;                                  // no card offers on the title screen
  G.dev.godCastle = true;
  G.dev.pauseWaves = true;
  G.wave = 4;
  G.castleLevel = 4;
  for (const pad of [...G.pads]) if ((pad.type === 'archer' || pad.type === 'cannon') && pad.unlock <= 3) finish(G, pad);
  for (const pad of G.pads) if (pad.type === 'upgrade') { finish(G, pad); if (Math.random() < 0.6) finish(G, pad); }
  levelUp(G, 'kennel', 2);
  for (const pad of G.pads) pad.active = false;      // no pad signs
  G.player.coins = 24;
  G.events.length = 0;                                // no floating "Tower!" texts
}

/** Keeps a few zombies walking up to the castle on the title screen. */
export function showcaseTick(G: GameState) {
  if (G.enemies.length < 9 && Math.random() < 0.03) spawnEnemy(G, Math.random() < 0.06);
  G.player.coins = Math.min(G.player.coins, 40);      // keep the coin stack from growing sky-high
  for (const pad of G.pads) pad.active = false;
  G.events = G.events.filter(e => e.type !== 'text');
}

/**
 * Autopilot movement (for the fast simulation): goes after the enemy closest to the castle
 * until it's within crossbow range; with no enemies, it returns to the gate.
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

/** Data for the current wave (what will be sent to the log when it ends). */
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
    spawnedKind: sub(s.spawnedKind, l.spawnedKind),
    seconds: Math.round(G.t - s.lastT),
  };
}

// ------------------------------------------------------------
//  Cards (dev menu)
// ------------------------------------------------------------
/** Take a card right now (one-off effects included), even past its max. */
export function giveCard(G: GameState, id: CardId) {
  mark(G);
  G.offer = { ids: [id], rerolls: 0 };
  pickCard(G, id);
}

/** Offer a random hand now, as if a wave had just ended. */
export function offerCardsNow(G: GameState) {
  mark(G);
  const ids = drawHand(G);
  if (ids.length) G.offer = { ids, rerolls: 0 };
}

/** Show cards [from, from+3) on the real card screen without applying anything. */
export function previewCards(G: GameState, from: number) {
  G.offer = { ids: CARD_IDS.slice(from, from + 3), rerolls: 0, preview: true };
}
