// ============================================================
//  Pure simulation: knows nothing about Three.js or the DOM.
//  The renderer reads the state and consumes G.events.
// ============================================================
import { t } from '../i18n';
import {
  BASE, BASE_HALF, BASE_HP, CASTLE_HALF, DIFFICULTY, PLAYER_RADIUS, FORGE_MULT, HELPERS, PAD_DEFS, PLAYER, PROP_KINDS, PROP_SOLID,
  REPEAT_COST_MULT, REPEAT_COST_MULT_BY,
  TOWER_CASTLE_MARGIN, TOWER_STATS, TOWER_UPGRADE, WAVES, WORLD, enemyStats, ENEMY_KINDS, SHAMAN, pickEnemyKind, waveCount, waveHp,
} from '../config';
import type { Building, Difficulty, Drop, Enemy, EnemyKind, GameState, Helper, HelperKind, KillSource, Pad, Prop, SfxName, Solid, Vec } from './types';
import { emptyStats, logWave } from './stats';
import { CARDS, NO_MODS, computeMods, drawHand, rerollCost, type CardId } from './cards';

let nextId = 1;
const uid = () => nextId++;
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function createGame(difficulty: Difficulty = 'normal'): GameState {
  const G: GameState = {
    t: 0, difficulty, over: false, built: 0,
    player: {
      x: PLAYER.start.x, y: PLAYER.start.y, coins: 0,
      swordDmg: PLAYER.sword.dmg, bowDmg: PLAYER.bow.dmg, speed: PLAYER.speed,
      cd: 0, moving: false, faceX: 0, faceY: 1, weapon: 'sword', attackT: 0, target: null,
    },
    base: { hp: BASE_HP, max: BASE_HP },
    enemies: [], drops: [], shots: [], buildings: [],
    pads: PAD_DEFS.map(d => ({
      id: uid(), type: d.type, x: d.x, y: d.y, cost: d.cost, paid: 0, unlock: d.unlock,
      repeat: !!d.repeat, active: false, done: false, level: 0, cool: 0, buildingId: null, small: false,
    })),
    props: [], solids: [],
    wave: 0, waveTimer: WAVES.firstDelay, spawnLeft: 0, spawnTimer: 0,
    towerMult: 1, transferAcc: 0, events: [], helpers: [], padDwellId: -1, padDwell: 0,
    castleLevel: 1, helperLevels: { dog: 0, peon: 0 },
    stats: emptyStats(),
    dev: {
      pauseWaves: false, godCastle: false, freeze: false, enemyHp: 1, enemySpeed: 1,
      playerDmg: 1, playerSpeed: 1, freeBuild: false, infiniteMoney: false, autoplay: false,
    },
    cheated: false,
    cardsOn: true, cards: {}, mods: { ...NO_MODS }, offer: null, cardsPending: 0,
  };
  updateUnlocks(G);
  placeProps(G);
  return G;
}

// ------------------------------------------------------------
//  Solid scenery: trees, rocks, stumps and logs
// ------------------------------------------------------------
export function placeProps(G: GameState) {
  // reserved areas: pads, and around towers their tables and upgrade pads; kennels/huts; player start
  const keep: Solid[] = [{ x: PLAYER.start.x, y: PLAYER.start.y, r: 1.2 }];
  for (const d of PAD_DEFS) {
    keep.push({ x: d.x, y: d.y, r: d.type === 'archer' || d.type === 'cannon' ? 3.1 : 1.5 });
    if (d.type === 'kennel') keep.push({ x: d.x + HELPERS.dog.homeOffset.x, y: d.y + HELPERS.dog.homeOffset.y, r: 1.4 });
    if (d.type === 'peon') keep.push({ x: d.x + HELPERS.peon.homeOffset.x, y: d.y + HELPERS.peon.homeOffset.y, r: 1.5 });
  }
  for (const kind of PROP_KINDS) {
    for (let n = 0; n < kind.count; n++) {
      // a few attempts per item; if there's no room, it's skipped
      for (let tries = 0; tries < 20; tries++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(kind.r0 * kind.r0 + Math.random() * (kind.r1 * kind.r1 - kind.r0 * kind.r0));
        const prop: Prop = {
          model: kind.models[n % kind.models.length],
          x: BASE.x + Math.cos(a) * r, y: BASE.y + Math.sin(a) * r,
          rot: Math.random() * Math.PI * 2, scale: rand(kind.s0, kind.s1),
        };
        const parts = propSolids(prop);
        const reach = Math.max(0.3, ...parts.map(s => s.r + Math.hypot(s.hx ?? 0, s.hy ?? 0)));
        if (keep.some(k => Math.hypot(k.x - prop.x, k.y - prop.y) < k.r + reach)) continue;
        // leave a gap between obstacles to walk through (at least one fat zombie's body)
        if (G.solids.some(s => parts.some(p => solidGap(s, p) < 0.75))) continue;
        G.props.push(prop);
        G.solids.push(...parts);
        break;
      }
    }
  }
}

/** Solid circles of a scenery item, already rotated and scaled. */
function propSolids(p: Prop): Solid[] {
  // the model is rotated `rot` around the vertical axis: its local z axis points to (sin rot, cos rot) on the plane
  const sx = Math.sin(p.rot), sy = Math.cos(p.rot);
  return (PROP_SOLID[p.model] ?? []).map(c => c.half
    ? { x: p.x, y: p.y, r: c.r * p.scale, hx: sx * c.half * p.scale, hy: sy * c.half * p.scale }
    : { x: p.x, y: p.y, r: c.r * p.scale });
}

/** Point on a solid's axis closest to p (the centre if it's a circle; a point on the segment if it's a capsule). */
function solidCore(s: Solid, p: Vec): Vec {
  if (!s.hx && !s.hy) return s;
  const hx = s.hx ?? 0, hy = s.hy ?? 0;
  const t = Math.max(-1, Math.min(1, ((p.x - s.x) * hx + (p.y - s.y) * hy) / (hx * hx + hy * hy)));
  return { x: s.x + hx * t, y: s.y + hy * t };
}

/** Distance between two solids (edge to edge; approximate for capsules). */
function solidGap(a: Solid, b: Solid) {
  const pa = solidCore(a, b), pb = solidCore(b, pa);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y) - a.r - b.r;
}

/**
 * Pushes someone out of obstacles. If they were heading into one (in unit direction dir, moving `step` this tick),
 * it also slides them sideways so they go around it instead of getting stuck.
 * `side` (+1 / -1) picks the side when heading straight into it.
 */
function avoidSolids(G: GameState, e: Vec, r: number, dirX = 0, dirY = 0, step = 0, side = 1) {
  for (const s of G.solids) {
    // quick rejection with the solid's bounding box
    const ext = s.r + r + Math.abs(s.hx ?? 0) + Math.abs(s.hy ?? 0);
    if (Math.abs(e.x - s.x) >= ext || Math.abs(e.y - s.y) >= ext) continue;
    // on a capsule, push from the nearest point on its axis: that way you slide along the log
    const q = solidCore(s, e);
    const dx = e.x - q.x, dy = e.y - q.y, min = s.r + r;
    const d = Math.hypot(dx, dy);
    if (d >= min) continue;
    const nx = d > 1e-4 ? dx / d : 1, ny = d > 1e-4 ? dy / d : 0;
    e.x = q.x + nx * min; e.y = q.y + ny * min;
    // if the obstacle blocks the way, go around: sidestep perpendicular to the normal
    const into = -(dirX * nx + dirY * ny);
    if (into > 0.2) {
      let tx = -ny, ty = nx;
      const along = dirX * tx + dirY * ty;
      if (Math.abs(along) > 0.05) { if (along < 0) { tx = -tx; ty = -ty; } }
      else { tx *= side; ty *= side; }
      e.x += tx * into * step; e.y += ty * into * step;
    }
  }
}

function text(G: GameState, x: number, y: number, t: string, color = '#fff', size = 16) {
  G.events.push({ type: 'text', x, y, text: t, color, size });
}
const sfx = (G: GameState, name: SfxName, x?: number, y?: number) => G.events.push({ type: 'sfx', name, x, y });

function updateUnlocks(G: GameState) {
  for (const pad of G.pads) {
    if (!pad.active && !pad.done && pad.unlock <= G.built) {
      pad.active = true;
      if (G.t > 0) text(G, pad.x, pad.y, t('float.new'), '#7ff');
    }
  }
}

// ------------------------------------------------------------
//  Waves
// ------------------------------------------------------------
/** Spawns an enemy. By default it comes out of the forest, at a random point on the circle around the play area. */
export function spawnEnemy(G: GameState, boss: boolean, at?: Vec, kind?: EnemyKind) {
  G.stats.spawned++;
  const k: EnemyKind = boss ? 'zombie' : kind ?? pickEnemyKind(Math.max(1, G.wave));
  const tag = boss ? 'boss' : k;
  G.stats.spawnedKind[tag] = (G.stats.spawnedKind[tag] ?? 0) + 1;
  const a = Math.random() * Math.PI * 2;
  const x = at ? at.x : BASE.x + Math.cos(a) * WORLD.spawnRadius, y = at ? at.y : BASE.y + Math.sin(a) * WORLD.spawnRadius;
  const st = enemyStats(Math.max(1, G.wave), boss, k, G.difficulty);
  st.hp = st.maxHp = Math.max(1, Math.round(st.hp * G.dev.enemyHp));
  st.value = Math.max(1, Math.round(st.value * G.mods.loot));   // "Tithe" / "Gold fever" cards
  G.enemies.push({
    id: uid(), x, y, ...st, boss, kind: k, fly: ENEMY_KINDS[k].fly, cast: SHAMAN.firstCast, healed: 0,
    atk: 0.5, dead: false, attacking: false, lunge: 0, hit: 0,
  });
}

function updateWaves(G: GameState, dt: number) {
  if (!G.dev.pauseWaves) G.waveTimer -= dt;
  // wave fully cleared -> short pause before the next one
  if (G.wave > 0 && G.spawnLeft === 0 && G.enemies.length === 0 && G.waveTimer > WAVES.breakTime) {
    G.waveTimer = WAVES.breakTime;
    text(G, G.player.x, G.player.y, t('float.waveCleared'), '#7f7', 20);
    // reward for clearing the wave: the castle patches itself up a little
    const heal = Math.min(Math.round(G.base.max * (DIFFICULTY[G.difficulty].clearHeal + G.mods.clearHeal)), Math.ceil(G.base.max - G.base.hp));
    if (heal > 0) {
      G.base.hp = Math.min(G.base.max, G.base.hp + heal);
      text(G, BASE.x, BASE.y, t('float.castleHeal', { n: heal }), '#7f7', 18);
    }
    sfx(G, 'waveClear');
  }
  if (G.waveTimer <= 0) {
    if (G.wave > 0) { waveEndBonuses(G); logWave(G); }   // summary of the wave that's ending
    G.wave++;
    G.spawnLeft = Math.round(waveCount(G.wave, G.difficulty) * G.mods.enemyCount);
    G.spawnTimer = 0;
    G.waveTimer = WAVES.interval;
    sfx(G, G.wave % WAVES.bossEvery === 0 ? 'boss' : 'wave');
    if (G.wave % WAVES.bossEvery === 0) { spawnEnemy(G, true); text(G, G.player.x, G.player.y, t('float.boss'), '#f55', 26); }
    else text(G, G.player.x, G.player.y, t('float.wave', { n: G.wave }), '#ffd34d', 22);
  }
  if (G.spawnLeft > 0) {
    G.spawnTimer -= dt;
    if (G.spawnTimer <= 0) {
      spawnEnemy(G, false);
      G.spawnLeft--;
      G.spawnTimer = Math.max(0.25, WAVES.spawnWindow / (waveCount(G.wave, G.difficulty) * G.mods.enemyCount));
    }
  }
}

/** "Interest" and "Cart" cards: paid out when a wave ends. */
function waveEndBonuses(G: GameState) {
  const p = G.player, m = G.mods;
  if (m.interest > 0) {
    const gain = Math.min((G.cards.interest ?? 0) * 50, Math.floor(p.coins * m.interest));
    if (gain > 0) { p.coins += gain; G.stats.earned.bonus += gain; text(G, p.x, p.y, t('float.interest', { n: gain }), '#ffd34d', 18); }
  }
  if (m.cart > 0) {
    for (const b of G.buildings) {
      const n = Math.floor(b.table * m.cart);
      if (n <= 0) continue;
      b.table -= n; p.coins += n; G.stats.earned.table += n;
      G.events.push({ type: 'coinFly', from: { x: b.tx, y: b.ty, z: 0.6 }, to: 'player' });
    }
  }
}

// ------------------------------------------------------------
//  Cards: pick one of the hand, or pay for a new hand
// ------------------------------------------------------------
export function pickCard(G: GameState, id: CardId) {
  if (!G.offer || !G.offer.ids.includes(id)) return;
  if (G.offer.preview) { G.offer = null; return; }
  G.offer = null;
  G.cards[id] = (G.cards[id] ?? 0) + 1;
  G.mods = computeMods(G);
  const p = G.player;
  // one-off effects
  if (id === 'reinforcedWalls') { G.base.max += 25; G.base.hp = Math.min(G.base.max, G.base.hp + 25 + Math.round(G.base.max * 0.2)); }
  if (id === 'bloodPact') { G.base.max = Math.max(20, G.base.max - 20); G.base.hp = Math.min(G.base.hp, G.base.max); }
  if (id === 'discount' || id === 'foundations') {
    const cut = id === 'discount' ? 0.6 : 0.5;
    for (const pad of G.pads) {
      if (!pad.active || pad.done || (id === 'discount' ? pad.small : pad.type !== 'upgrade')) continue;
      pad.cost = Math.max(pad.paid + 1, Math.ceil(pad.cost * cut));
    }
  }
  if (id === 'apprentice') {
    const pad = G.pads.find(x => x.type === 'peon');
    if (pad) { pad.active = true; pad.paid = pad.cost; completePad(G, pad); }
  }
  sfx(G, 'upgrade');
  text(G, p.x, p.y, `${CARDS[id].icon} ${t(`card.${id}.name`)}`, '#ffd34d', 20);
}

/** Pay for a new hand (coins in hand). Returns false if there isn't enough. */
export function rerollCards(G: GameState): boolean {
  if (!G.offer || G.offer.preview) return false;
  const cost = rerollCost(G);
  if (G.player.coins < cost) return false;
  G.player.coins -= cost;
  G.stats.spent.reroll = (G.stats.spent.reroll ?? 0) + cost;
  G.offer = { ids: drawHand(G, G.offer.ids), rerolls: G.offer.rerolls + 1 };
  sfx(G, 'pay');
  return true;
}

// ------------------------------------------------------------
//  Enemies
// ------------------------------------------------------------
export function killEnemy(G: GameState, e: Enemy, byTower: Building | null, source: KillSource) {
  e.dead = true;
  if (e.boss && G.cardsOn) G.cardsPending++;   // a boss killed earns a card
  G.stats.kills[source]++;
  G.events.push({ type: 'enemyDied', x: e.x, y: e.y, boss: e.boss, kind: e.kind });
  if (byTower) {
    byTower.table += e.value;
    G.events.push({ type: 'coinFly', from: { x: e.x, y: e.y, z: 0.4 }, to: { x: byTower.tx, y: byTower.ty, z: 0.5 } });
  } else {
    const n = Math.min(e.value, 6);
    let remaining = e.value;
    for (let i = 0; i < n; i++) {
      const worth = i === n - 1 ? remaining : Math.floor(e.value / n);
      remaining -= worth;
      const a = rand(0, Math.PI * 2), s = rand(0.8, 2);
      G.drops.push({ id: uid(), x: e.x, y: e.y, z: 0.4, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(3, 5), worth, age: 0, taken: false });
    }
  }
}

/** Card multipliers on a hit, by who hits (source) and who gets hit. */
function cardDamage(G: GameState, e: Enemy, dmg: number, source: KillSource) {
  const m = G.mods;
  let k = m.allDmg;
  if (source === 'archer') k *= m.archerDmg;
  if (source === 'sword') k *= m.swordDmg;
  if (source === 'dog') {
    k *= m.wolfDmg;
    if (m.wolfDmg > 1) k *= 1 + 0.03 * G.wave;     // "Pack": wolves also grow with the wave
    if (e.boss) k *= m.wolfBoss;
  }
  if (source === 'cannon' && e.boss) k *= m.cannonBoss;
  if (e.fly) k *= m.flyDmg;
  if (e.boss) k *= m.bossDmg;
  return dmg * k;
}

function damageEnemy(G: GameState, e: Enemy, dmg: number, tower: Building | null, source: KillSource) {
  if (e.dead) return;
  e.hp -= cardDamage(G, e, dmg, source);
  e.hit = 0.12;
  if (e.hp <= 0) killEnemy(G, e, tower, source);
}

/** Mage: every few seconds heals the enemies near it (and itself). */
function shamanCast(G: GameState, e: Enemy, dt: number) {
  e.cast -= dt;
  if (e.cast > 0) return;
  e.cast = SHAMAN.every;
  let any = false;
  for (const o of G.enemies) {
    if (o.dead || o.hp >= o.maxHp || dist(o, e) > SHAMAN.range) continue;
    o.hp = Math.min(o.maxHp, o.hp + Math.ceil(o.maxHp * SHAMAN.pct * G.mods.mageHeal));
    o.healed = 0.45;
    any = true;
  }
  if (any) { e.healed = 0.45; e.lunge = 0.6; sfx(G, 'heal', e.x, e.y); }
}

function updateEnemies(G: GameState, dt: number) {
  const speedMult = G.dev.enemySpeed;
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.hit = Math.max(0, e.hit - dt);
    e.lunge = Math.max(0, e.lunge - dt);
    e.healed = Math.max(0, e.healed - dt);
    if (G.dev.freeze) { e.attacking = false; continue; }
    if (e.kind === 'shaman') shamanCast(G, e, dt);
    const dx = BASE.x - e.x, dy = BASE.y - e.y, d = Math.hypot(dx, dy);
    const box = Math.max(Math.abs(dx), Math.abs(dy));
    if (box < CASTLE_HALF + e.r + 0.05) {
      e.attacking = true;
      // "Boiling oil": whoever attacks the castle burns (a fraction of a warrior's health per second)
      if (G.mods.oil > 0) {
        e.hp -= G.mods.oil * waveHp(Math.max(1, G.wave), G.difficulty) * dt;
        if (e.hp <= 0) { killEnemy(G, e, null, 'castle'); continue; }
      }
      e.atk -= dt;
      if (e.atk <= 0) {
        e.atk = e.atkRate;
        e.lunge = 0.25;
        if (!G.dev.godCastle) G.base.hp -= e.dmg;
        G.stats.baseDamage += e.dmg;
        G.events.push({ type: 'baseHit' });
        text(G, e.x, e.y, '-' + e.dmg, '#f55', 13);
        if (G.base.hp <= 0) { G.base.hp = 0; G.over = true; logWave(G); sfx(G, 'gameOver'); }
      }
      continue;
    }
    e.attacking = false;
    // "Moat": slower close to the castle
    const sp = e.speed * speedMult * (box < CASTLE_HALF + 1.8 ? G.mods.moatSlow : 1);
    e.x += dx / d * sp * dt;
    e.y += dy / d * sp * dt;
    // trees and rocks: they go around them (each on its preferred side, so they don't pile up); flyers pass over
    if (!e.fly) avoidSolids(G, e, e.r * 0.8, dx / d, dy / d, sp * dt, e.id % 2 ? 1 : -1);
  }
  // simple separation
  const es = G.enemies;
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
    const a = es[i], b = es[j];
    if (!a.fly !== !b.fly) continue;   // flyers don't collide with ground enemies
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
    if (d > 0 && d < min) {
      const push = (min - d) / 2;
      a.x -= dx / d * push; a.y -= dy / d * push;
      b.x += dx / d * push; b.y += dy / d * push;
    }
  }
  // make sure nobody gets pushed inside the base or an obstacle
  for (const e of es) {
    if (!e.fly) avoidSolids(G, e, e.r * 0.8);
    const ex = e.x - BASE.x, ey = e.y - BASE.y, lim = CASTLE_HALF + e.r;
    if (Math.abs(ex) < lim && Math.abs(ey) < lim) {
      if (Math.abs(ex) > Math.abs(ey)) e.x = BASE.x + Math.sign(ex || 1) * lim;
      else e.y = BASE.y + Math.sign(ey || 1) * lim;
    }
  }
  G.enemies = G.enemies.filter(e => !e.dead);
}

// ------------------------------------------------------------
//  Player
// ------------------------------------------------------------
function updatePlayer(G: GameState, dt: number, dir: Vec) {
  const p = G.player;
  const speed = p.speed * G.dev.playerSpeed * G.mods.moveSpeed;
  p.x += dir.x * speed * dt;
  p.y += dir.y * speed * dt;
  p.moving = Math.hypot(dir.x, dir.y) > 0.1;
  if (p.moving) { const m = Math.hypot(dir.x, dir.y); p.faceX = dir.x / m; p.faceY = dir.y / m; }

  // collisions with the castle: it's square and the corner turrets stick out,
  // so a box is used (with a circle the player got inside the turrets)
  pushOutOfCastle(p, CASTLE_SOLID);
  // and with the buildings
  const solids = G.buildings.map(b => ({ x: b.x, y: b.y, r: 0.5 }));
  for (const h of G.helpers) solids.push({ x: h.home.x, y: h.home.y, r: h.kind === 'dog' ? 0.4 : 0.55 });
  for (const s of solids) {
    const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy), min = s.r + 0.3;
    if (d < min && d > 0) { p.x = s.x + dx / d * min; p.y = s.y + dy / d * min; }
  }
  // trees, rocks, stumps and logs (if you walk straight into one, you slide to one side)
  const m = Math.hypot(dir.x, dir.y);
  if (m > 0.1) avoidSolids(G, p, PLAYER_RADIUS, dir.x / m, dir.y / m, speed * m * dt);
  else avoidSolids(G, p, PLAYER_RADIUS);
  // don't leave the clearing
  const fx = p.x - BASE.x, fy = p.y - BASE.y, fd = Math.hypot(fx, fy);
  if (fd > WORLD.playRadius) { p.x = BASE.x + fx / fd * WORLD.playRadius; p.y = BASE.y + fy / fd * WORLD.playRadius; }

  // automatic attack
  p.cd -= dt;
  p.attackT = Math.max(0, p.attackT - dt);
  if (p.cd <= 0) {
    // nearest enemy (distance to the edge of its body)
    let best: Enemy | null = null, bd = Infinity;
    for (const e of G.enemies) { const d = dist(p, e) - e.r; if (d < bd) { bd = d; best = e; } }
    if (best && bd < PLAYER.sword.range) {
      // sword: melee, instant and strong hit
      const swordDmg = p.swordDmg * G.towerMult * G.dev.playerDmg;
      damageEnemy(G, best, swordDmg, null, 'sword');
      // "Whirlwind": the slash also hits everyone else within reach
      if (G.mods.whirlwind > 0) for (const e of G.enemies) if (e !== best && dist(p, e) - e.r < PLAYER.sword.range + 0.3) damageEnemy(G, e, swordDmg, null, 'sword');
      p.weapon = 'sword';
      p.cd = PLAYER.sword.cd;
      p.attackT = 0.18;
      sfx(G, 'sword');
      p.target = { x: best.x, y: best.y };
    } else if (best && bd < PLAYER.bow.range) {
      // bow: fires an arrow (projectile), weaker but long-range
      const d = dist(p, best);
      G.shots.push({
        id: uid(), type: 'archer', x: p.x, y: p.y, z: 0.75, z0: 0.75, dist0: d,
        target: best, tx: best.x, ty: best.y, tz: 0.4 + best.fly,
        speed: PLAYER.bow.speed, dmg: p.bowDmg * G.towerMult * G.dev.playerDmg, splash: 0, from: null, done: false,
      });
      p.weapon = 'bow';
      p.cd = PLAYER.bow.cd;
      p.attackT = 0.3;
      sfx(G, 'bow');
      p.target = { x: best.x, y: best.y };
    }
  }

  // ground coins (magnet)
  for (const c of G.drops) {
    if (c.z > 0.05 || c.age < 0.25) continue;
    const d = dist(p, c);
    if (d < PLAYER.magnetRange * G.mods.magnet) {
      const k = Math.min(1, dt * 10 / Math.max(d, 0.2));
      c.x += (p.x - c.x) * k; c.y += (p.y - c.y) * k;
    }
    if (d < PLAYER.pickupRange) { c.taken = true; p.coins += c.worth; G.stats.earned.ground += c.worth; sfx(G, 'coin'); }
  }
  G.drops = G.drops.filter(c => !c.taken);

  // tables and pads
  let onTable: Building | null = null;
  for (const b of G.buildings) if (b.table > 0 && Math.hypot(p.x - b.tx, p.y - b.ty) < 0.9) onTable = b;
  let onPad: Pad | null = null;
  let padD = Infinity;
  for (const pad of G.pads) {
    if (!pad.active) continue;
    const d = Math.hypot(p.x - pad.x, p.y - pad.y);
    if (d < (pad.small ? 0.6 : 0.85) && d < padD) { padD = d; onPad = pad; }
  }
  // you have to stand on it for a moment before paying starts (avoids spending when just passing by)
  if (onPad && onPad.id === G.padDwellId) G.padDwell += dt;
  else { G.padDwellId = onPad ? onPad.id : -1; G.padDwell = 0; }
  if (onPad && G.padDwell < PLAYER.padDelay) onPad = null;

  // "free build" cheat: the pad completes when stepped on, without paying
  if (G.dev.freeBuild && onPad && onPad.cool <= 0) {
    onPad.paid = onPad.cost;
    completePad(G, onPad);
    onPad = null;
  }

  if (onTable) {
    G.transferAcc += dt * Math.max(20, onTable.table * 2.5);
    const n = Math.min(Math.floor(G.transferAcc), onTable.table);
    G.transferAcc -= Math.floor(G.transferAcc);
    if (n > 0) {
      onTable.table -= n;
      p.coins += n;
      G.stats.earned.table += n;
      G.events.push({ type: 'coinFly', from: { x: onTable.tx, y: onTable.ty, z: 0.6 }, to: 'player' });
      sfx(G, 'coin');
    }
  } else if (onPad && p.coins > 0 && onPad.cool <= 0) {
    const left = onPad.cost - onPad.paid;
    G.transferAcc += dt * Math.max(15, left * 1.6);
    const n = Math.min(Math.floor(G.transferAcc), p.coins, left);
    G.transferAcc -= Math.floor(G.transferAcc);
    if (n > 0) {
      p.coins -= n;
      onPad.paid += n;
      G.stats.spent[onPad.type] = (G.stats.spent[onPad.type] ?? 0) + n;
      G.events.push({ type: 'coinFly', from: { x: p.x, y: p.y, z: 1.6 }, to: { x: onPad.x, y: onPad.y, z: 0 } });
      sfx(G, 'pay');
      if (onPad.paid >= onPad.cost) completePad(G, onPad);
    }
  } else {
    G.transferAcc = 0;
  }
  for (const pad of G.pads) pad.cool = Math.max(0, pad.cool - dt);
}

export function completePad(G: GameState, pad: Pad) {
  if (pad.type === 'archer' || pad.type === 'cannon') {
    pad.active = false;
    pad.done = true;
    const start = TOWER_UPGRADE.startLevel(pad.cost);
    const b: Building = {
      id: uid(), type: pad.type, x: pad.x, y: pad.y, tx: pad.x + 0.05, ty: pad.y + 1.05,
      cd: 0.8, table: 0, aimX: 0, aimY: 1, level: start, startLevel: start, baseCost: pad.cost, volley: 0,
    };
    G.buildings.push(b);
    G.built++;
    G.events.push({ type: 'built', id: b.id });
    text(G, pad.x, pad.y, start > 1 ? t('float.builtLevel', { name: t(`pad.${pad.type}`), n: start }) : t('float.built', { name: t(`pad.${pad.type}`) }), '#7f7', 20);
    addUpgradePad(G, b);
    updateUnlocks(G);
    return;
  }
  if (pad.type === 'upgrade') {
    const b = G.buildings.find(x => x.id === pad.buildingId);
    if (!b) return;
    b.level++;
    G.events.push({ type: 'towerUpgraded', id: b.id });
    text(G, b.x, b.y, t('float.tower', { n: b.level }), '#7f7', 20);
    pad.paid = 0;
    pad.level++;
    pad.cool = 1.0;
    if (b.level >= TOWER_UPGRADE.maxLevel) { pad.active = false; pad.done = true; }
    else { pad.cost = TOWER_UPGRADE.cost(b.baseCost, b.level - b.startLevel); G.events.push({ type: 'padUpgraded', id: pad.id }); }
    return;
  }
  pad.level++;
  if (pad.type === 'power') {
    G.player.swordDmg *= PLAYER.powerMult;
    G.player.bowDmg *= PLAYER.powerMult;
    text(G, pad.x, pad.y, t('float.power', { sword: (G.player.swordDmg * G.towerMult).toFixed(1), bow: (G.player.bowDmg * G.towerMult).toFixed(1) }), '#7f7', 18);
  }
  if (pad.type === 'repair') {
    G.base.max += 5; G.base.hp = G.base.max;
    G.castleLevel = Math.min(5, 1 + pad.level);
    text(G, pad.x, pad.y, t('float.repaired'), '#7f7', 20);
  }
  if (pad.type === 'kennel' || pad.type === 'peon') {
    const kind: HelperKind = pad.type === 'kennel' ? 'dog' : 'peon';
    const cfg = HELPERS[kind];
    const level = pad.level;
    const home = { x: pad.x + cfg.homeOffset.x, y: pad.y + cfg.homeOffset.y };
    const group = G.helpers.filter(x => x.kind === kind);
    for (const h of group) h.level = level;
    // each level brings one more unit
    for (let i = group.length; i < cfg.count(level); i++) {
      G.helpers.push({
        id: uid(), kind, x: home.x + (i % 2 ? 0.4 : -0.4), y: home.y + 0.7, level, carry: 0, mode: 'idle', moving: false,
        faceX: 0, faceY: 1, home, acc: 0, targetId: -1, atkCd: 0, attackT: 0, slot: i,
      });
    }
    G.helperLevels[kind] = level;
    if (level === 1) text(G, pad.x, pad.y, t(kind === 'dog' ? 'float.wolf' : 'float.peon'), '#7f7', 20);
    else text(G, pad.x, pad.y, t('float.helpers', { name: t(`helper.${kind}`), n: level, count: cfg.count(level) }), '#7f7', 18);
  }
  if (pad.type === 'forge') { G.towerMult *= FORGE_MULT; text(G, pad.x, pad.y, t('float.damage', { n: G.towerMult.toFixed(2) }), '#7f7', 20); }
  pad.paid = 0;
  pad.cost = Math.ceil(pad.cost * (REPEAT_COST_MULT_BY[pad.type] ?? REPEAT_COST_MULT));
  pad.cool = 1.2;
  G.events.push({ type: 'padUpgraded', id: pad.id });
  if (pad.level === 1) { G.built++; updateUnlocks(G); }
}

// ------------------------------------------------------------
//  Upgrade pad for each tower: looks for a free spot next to it
// ------------------------------------------------------------
function addUpgradePad(G: GameState, b: Building) {
  const occupied: { x: number; y: number; r: number }[] = [];
  for (const d of PAD_DEFS) {
    occupied.push({ x: d.x, y: d.y, r: 1.25 });                                   // pads (and future towers)
    if (d.type === 'archer' || d.type === 'cannon') occupied.push({ x: d.x + 0.05, y: d.y + 1.05, r: 0.95 }); // their tables
    if (d.type === 'kennel') occupied.push({ x: d.x + HELPERS.dog.homeOffset.x, y: d.y + HELPERS.dog.homeOffset.y, r: 1.1 });
    if (d.type === 'peon') occupied.push({ x: d.x + HELPERS.peon.homeOffset.x, y: d.y + HELPERS.peon.homeOffset.y, r: 1.2 });
  }
  for (const p of G.pads) if (p.small) occupied.push({ x: p.x, y: p.y, r: 1.05 });

  const free = (x: number, y: number) =>
    Math.hypot(x - BASE.x, y - BASE.y) < WORLD.playRadius - 1 &&
    Math.max(Math.abs(x - BASE.x), Math.abs(y - BASE.y)) > BASE_HALF + 0.75 &&
    occupied.every(o => Math.hypot(x - o.x, y - o.y) >= o.r);

  // try positions around the tower, nearest first
  let spot: Vec | null = null;
  for (const r of [1.15, 1.4, 1.7]) {
    for (let k = 0; k < 16 && !spot; k++) {
      const a = (k / 16) * Math.PI * 2 + Math.PI * 0.75;
      const x = b.x + Math.cos(a) * r, y = b.y + Math.sin(a) * r;
      if (free(x, y)) spot = { x, y };
    }
    if (spot) break;
  }
  if (!spot) spot = { x: b.x - 1.15, y: b.y + 0.6 };

  G.pads.push({
    id: uid(), type: 'upgrade', x: spot.x, y: spot.y, cost: TOWER_UPGRADE.cost(b.baseCost, 0), paid: 0, unlock: 0,
    repeat: true, active: true, done: false, level: 0, cool: 1.5, buildingId: b.id, small: true,
  });
}

/** Effective stats of a tower given its level, the global upgrade and the cards. */
export function towerStats(G: GameState, b: Building) {
  const st = TOWER_STATS[b.type], lv = b.level - 1, m = G.mods;
  return {
    ...st,
    dmg: st.dmg * Math.pow(TOWER_UPGRADE.dmgMult, lv) * G.towerMult,
    range: (st.range + TOWER_UPGRADE.rangeAdd * lv) * m.towerRange,
    cd: st.cd * Math.pow(TOWER_UPGRADE.cdMult, lv) / (b.type === 'archer' ? m.archerRate : 1),
    splash: st.splash * (b.type === 'cannon' ? m.cannonSplash : 1),
  };
}

// ------------------------------------------------------------
//  Towers and projectiles
// ------------------------------------------------------------
function updateBuildings(G: GameState, dt: number) {
  for (const b of G.buildings) {
    const st = towerStats(G, b);
    b.cd -= dt;
    if (b.cd > 0) continue;
    // 1) enemy within its normal range, the one closest to the base
    // 2) if there's none, any enemy attacking the castle (every tower reaches the castle)
    const castleReach = Math.hypot(b.x - BASE.x, b.y - BASE.y) + BASE_HALF + TOWER_CASTLE_MARGIN;
    let best: Enemy | null = null, bd = Infinity;
    let backup: Enemy | null = null, bk = Infinity;
    for (const e of G.enemies) {
      if (e.fly && b.type === 'cannon') continue;   // cannonballs can't reach flyers
      const d = dist(b, e), db = Math.hypot(e.x - BASE.x, e.y - BASE.y);
      if (d < st.range) { if (db < bd) { bd = db; best = e; } }
      else if (e.attacking && d < castleReach && db < bk) { bk = db; backup = e; }
    }
    best = best ?? backup;
    if (!best) continue;
    b.cd = st.cd;
    const ax = best.x - b.x, ay = best.y - b.y, am = Math.hypot(ax, ay) || 1;
    b.aimX = ax / am; b.aimY = ay / am;
    sfx(G, b.type === 'archer' ? 'arrow' : 'cannon', b.x, b.y);
    const fire = (e: Enemy) => G.shots.push({
      id: uid(), type: b.type, x: b.x, y: b.y, z: st.muzzle, z0: st.muzzle, dist0: dist(b, e),
      target: e, tx: e.x, ty: e.y, tz: 0.4 + e.fly,
      speed: st.speed, dmg: st.dmg, splash: st.splash, from: b, done: false,
    });
    fire(best);
    // "Arrow rain": every 4th archer shot also fires at two more enemies in range (or the same one)
    b.volley++;
    if (b.type === 'archer' && G.mods.arrowRain > 0 && b.volley % 4 === 0) {
      const others = G.enemies.filter(e => e !== best && dist(b, e) < st.range).sort((a, c) => dist(b, a) - dist(b, c));
      fire(others[0] ?? best);
      fire(others[1] ?? best);
    }
  }
}

function updateShots(G: GameState, dt: number) {
  for (const s of G.shots) {
    if (s.target && !s.target.dead) { s.tx = s.target.x; s.ty = s.target.y; s.tz = 0.4 + s.target.fly; }
    const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy);
    const step = s.speed * dt;
    // height: interpolation + parabolic arc (cannon shots go higher)
    const k = 1 - Math.min(1, d / Math.max(s.dist0, 0.01));
    const arc = s.type === 'cannon' ? 1.6 : 0.4;
    s.z = s.z0 + (s.tz - s.z0) * k + Math.sin(k * Math.PI) * arc;
    if (d <= step) {
      s.done = true;
      if (s.splash > 0) {
        G.events.push({ type: 'boom', x: s.tx, y: s.ty, r: s.splash });
        for (const e of G.enemies) if (!e.fly && Math.hypot(e.x - s.tx, e.y - s.ty) < s.splash) damageEnemy(G, e, s.dmg, s.from, s.from ? s.from.type : 'bow');
      } else if (s.target && !s.target.dead) {
        const hitTarget = s.target;
        damageEnemy(G, hitTarget, s.dmg, s.from, s.from ? s.from.type : 'bow');
        // "Piercing bolt": the player's bolt goes through to the next enemies nearby
        if (!s.from && G.mods.pierce > 0) {
          const next = G.enemies.filter(e => !e.dead && e !== hitTarget && Math.hypot(e.x - s.tx, e.y - s.ty) < 1.4)
            .sort((a, c) => Math.hypot(a.x - s.tx, a.y - s.ty) - Math.hypot(c.x - s.tx, c.y - s.ty)).slice(0, G.mods.pierce);
          for (const e of next) damageEnemy(G, e, s.dmg, null, 'bow');
        }
      }
    } else {
      s.x += dx / d * step;
      s.y += dy / d * step;
    }
  }
  G.shots = G.shots.filter(s => !s.done);
}

function updateDrops(G: GameState, dt: number) {
  for (const c of G.drops) {
    c.age += dt;
    if (c.z > 0 || c.vz > 0) {
      c.vz -= 18 * dt;
      c.z += c.vz * dt;
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.z <= 0) {
        c.z = 0; c.vz = 0; c.vx = c.vy = 0;
        // if it lands inside the castle or a rock, it rolls out (otherwise nobody could pick it up)
        pushOutOfCastle(c, CASTLE_HALF + 0.2);
        avoidSolids(G, c, 0.15);
      }
    }
  }
}

/** Half-side of the castle's solid box for the player: wall + turrets + the player's own body. */
const CASTLE_SOLID = CASTLE_HALF + PLAYER_RADIUS;

/** Pushes a point out of the castle square (through the nearest side). */
function pushOutOfCastle(p: Vec, lim: number) {
  const ex = p.x - BASE.x, ey = p.y - BASE.y;
  if (Math.abs(ex) < lim && Math.abs(ey) < lim) {
    if (Math.abs(ex) > Math.abs(ey)) p.x = BASE.x + Math.sign(ex || 1) * lim;
    else p.y = BASE.y + Math.sign(ey || 1) * lim;
  }
}

// ------------------------------------------------------------
//  Helpers (dogs and peons)
// ------------------------------------------------------------
// Navigation: if the straight path crosses the castle, go around via the most convenient corner.
const CASTLE_BLOCK = CASTLE_HALF + 0.15;   // box that can't be crossed
const CASTLE_CORNER = CASTLE_HALF + 0.55;   // corners used to go around

/** Does segment a→b cross the castle square? (Liang–Barsky) */
function crossesCastle(ax: number, ay: number, bx: number, by: number): boolean {
  const minX = BASE.x - CASTLE_BLOCK, maxX = BASE.x + CASTLE_BLOCK, minY = BASE.y - CASTLE_BLOCK, maxY = BASE.y + CASTLE_BLOCK;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const clip = (p: number, q: number) => {
    if (p === 0) return q > 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, ax - minX) && clip(dx, maxX - ax) && clip(-dy, ay - minY) && clip(dy, maxY - ay) && t0 < t1;
}

function waypoint(from: Vec, goal: Vec): Vec {
  if (!crossesCastle(from.x, from.y, goal.x, goal.y)) return goal;
  // visible corner (other than where it already is) with the shortest path;
  // if the goal still isn't visible from that corner, it's penalised (another corner will be needed later)
  let best: Vec | null = null, bd = Infinity;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const c = { x: BASE.x + sx * CASTLE_CORNER, y: BASE.y + sy * CASTLE_CORNER };
    if (dist(from, c) < 0.15 || crossesCastle(from.x, from.y, c.x, c.y)) continue;
    const d = dist(from, c) + dist(c, goal) + (crossesCastle(c.x, c.y, goal.x, goal.y) ? 2 * CASTLE_CORNER : 0);
    if (d < bd) { bd = d; best = c; }
  }
  return best ?? goal;
}

function moveTowards(G: GameState, h: Helper, target: Vec, speed: number, stopAt: number, dt: number) {
  h.moving = false;
  h.goal = null;
  // a goal touching or inside the castle is replaced by the nearest reachable point
  const goal = { x: target.x, y: target.y };
  pushOutOfCastle(goal, CASTLE_HALF + 0.25);
  const realD = dist(h, goal);
  if (realD <= stopAt || realD < 0.01) return;
  const wp = waypoint(h, goal);
  const dx = wp.x - h.x, dy = wp.y - h.y, d = Math.hypot(dx, dy);
  if (d < 0.01) return;
  const stepLen = Math.min(d, speed * dt);
  h.x += dx / d * stepLen; h.y += dy / d * stepLen;
  h.faceX = dx / d; h.faceY = dy / d;
  h.moving = true;
  h.goal = wp;
  pushOutOfCastle(h, CASTLE_HALF + 0.2);   // safety net: never inside the castle
  avoidSolids(G, h, HELPERS.radius[h.kind], dx / d, dy / d, stepLen, h.id % 2 ? 1 : -1);
}

function deliver(G: GameState, h: Helper) {
  const p = G.player;
  p.coins += h.carry;
  G.stats.earned[h.kind] += h.carry;
  const flies = Math.min(h.carry, 10);
  for (let i = 0; i < flies; i++) G.events.push({ type: 'coinFly', from: { x: h.x, y: h.y, z: 0.6 }, to: 'player' });
  h.carry = 0;
}

function goDeliver(G: GameState, h: Helper, speed: number, dt: number) {
  h.mode = 'deliver';
  h.targetId = -1;
  moveTowards(G, h, G.player, speed, HELPERS.deliverRange * 0.6, dt);
  if (dist(h, G.player) < HELPERS.deliverRange) { deliver(G, h); h.mode = 'idle'; }
}

function attack(G: GameState, h: Helper, e: Enemy, speed: number, dt: number) {
  const cfg = HELPERS.dog;
  h.mode = 'attack';
  h.targetId = e.id;
  const reach = e.r + 0.35;
  moveTowards(G, h, e, speed, reach, dt);
  if (dist(h, e) <= reach + 0.05) {
    h.faceX = (e.x - h.x) / (dist(h, e) || 1); h.faceY = (e.y - h.y) / (dist(h, e) || 1);
    if (h.atkCd <= 0) {
      damageEnemy(G, e, cfg.dmg(h.level) * G.towerMult, null, 'dog');   // what a dog kills drops on the ground
      h.atkCd = cfg.atkCd;
      h.attackT = 0.2;
      sfx(G, 'bite', h.x, h.y);
    }
  }
}

function updateDog(G: GameState, h: Helper, dt: number, reservedDrops: Set<number>, dogsOn: Map<number, number>) {
  const p = G.player, cfg = HELPERS.dog;
  const cap = cfg.capacity(h.level), speed = cfg.speed(h.level);
  if (h.carry >= cap) return goDeliver(G, h, speed, dt);

  // 1) enemy very close: bite it
  // at most 2 dogs per enemy (otherwise they get in each other's way); the one already chasing always counts as free
  const free = (e: Enemy) => e.id === h.targetId || (dogsOn.get(e.id) ?? 0) < 2;
  const go = (e: Enemy) => { dogsOn.set(e.id, (dogsOn.get(e.id) ?? 0) + 1); attack(G, h, e, speed, dt); };
  let near: Enemy | null = null, nd = cfg.aggroRange;
  for (const e of G.enemies) { const d = dist(h, e); if (d < nd && free(e)) { nd = d; near = e; } }
  if (near) return go(near);

  // 2) ground coins (skipping any another dog is already chasing)
  let coin: Drop | null = G.drops.find(c => c.id === h.targetId && !c.taken) ?? null;
  if (!coin) {
    let cd = Infinity;
    for (const c of G.drops) {
      if (c.taken || c.z > 0.05 || c.age < 0.4 || reservedDrops.has(c.id)) continue;
      const d = dist(h, c);
      if (d < cd) { cd = d; coin = c; }
    }
  }
  if (coin) {
    h.mode = 'fetch';
    h.targetId = coin.id;
    reservedDrops.add(coin.id);
    moveTowards(G, h, coin, speed, 0, dt);
    if (dist(h, coin) < HELPERS.pickupRange) { coin.taken = true; h.carry += coin.worth; h.targetId = -1; }
    return;
  }
  if (h.carry > 0) return goDeliver(G, h, speed, dt);

  // 3) enemies near the player: hunt them
  let prey: Enemy | null = null, pd = cfg.huntRange;
  for (const e of G.enemies) { const d = dist(p, e); if (d < pd && free(e)) { pd = d; prey = e; } }
  if (prey) return go(prey);

  // 4) nothing to do: follow the player, each dog in its own spot
  h.mode = 'idle';
  h.targetId = -1;
  const a = Math.atan2(-p.faceY, -p.faceX) + (h.slot - 2.5) * 0.55;
  const goal = { x: p.x + Math.cos(a) * 1.1, y: p.y + Math.sin(a) * 1.1 };
  moveTowards(G, h, goal, speed, dist(h, p) > HELPERS.followDist + h.slot * 0.15 ? 0.2 : Infinity, dt);
}

function updatePeon(G: GameState, h: Helper, dt: number, peonLoad: Map<number, number>) {
  const cfg = HELPERS.peon;
  const cap = cfg.capacity(h.level), speed = cfg.speed(h.level);
  if (h.carry >= cap) return goDeliver(G, h, speed, dt);

  // table: its own if it still has loot; otherwise the one with the most unclaimed loot
  let table: Building | null = G.buildings.find(b => b.id === h.targetId && b.table > 0) ?? null;
  if (!table) {
    let best = -Infinity;
    for (const b of G.buildings) {
      const free = b.table - (peonLoad.get(b.id) ?? 0);   // what other peons aren't already going to take
      if (free <= 0) continue;
      const score = free - Math.hypot(h.x - b.tx, h.y - b.ty) * 0.5;
      if (score > best) { best = score; table = b; }
    }
  }
  if (!table) {
    if (h.carry > 0) return goDeliver(G, h, speed, dt);
    // no work: wait at the hut's door, each in its own spot
    h.mode = 'idle';
    h.targetId = -1;
    moveTowards(G, h, { x: h.home.x + (h.slot - 2.5) * 0.35, y: h.home.y + 0.8 + (h.slot % 2) * 0.3 }, speed, 0.1, dt);
    if (!h.moving) { h.faceX = 0; h.faceY = 1; }
    return;
  }
  h.mode = 'fetch';
  h.targetId = table.id;
  peonLoad.set(table.id, (peonLoad.get(table.id) ?? 0) + (cap - h.carry));
  const spot = { x: table.tx + ((h.slot % 3) - 1) * 0.3, y: table.ty + 0.45 };   // in front of the table
  moveTowards(G, h, spot, speed, 0.05, dt);
  if (Math.hypot(h.x - spot.x, h.y - spot.y) < HELPERS.tableRange) {
    h.faceX = 0; h.faceY = -1;               // facing the table
    h.acc += dt * cfg.tableRate(h.level);
    const n = Math.min(Math.floor(h.acc), table.table, cap - h.carry);
    h.acc -= Math.floor(h.acc);
    if (n > 0) {
      table.table -= n;
      h.carry += n;
      G.events.push({ type: 'coinFly', from: { x: table.tx, y: table.ty, z: 0.5 }, to: { x: h.x, y: h.y, z: 1.0 } });
    }
  }
}

function updateHelpers(G: GameState, dt: number) {
  const reservedDrops = new Set<number>();
  const peonLoad = new Map<number, number>();
  const dogsOn = new Map<number, number>();
  for (const h of G.helpers) {
    h.atkCd = Math.max(0, h.atkCd - dt);
    h.attackT = Math.max(0, h.attackT - dt);
    if (h.kind === 'dog') updateDog(G, h, dt, reservedDrops, dogsOn);
    else updatePeon(G, h, dt, peonLoad);
  }
  collideHelpers(G);
  G.drops = G.drops.filter(c => !c.taken);
}

/** Dogs and peons collide with each other and with the player (they don't push the player). */
function collideHelpers(G: GameState) {
  const hs = G.helpers, p = G.player;
  for (let i = 0; i < hs.length; i++) {
    const a = hs[i];
    for (let j = i + 1; j < hs.length; j++) {
      const b = hs[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = HELPERS.radius[a.kind] + HELPERS.radius[b.kind];
      if (d < min) {
        // if they're in exactly the same spot, separate them in an arbitrary direction
        const nx = d > 1e-4 ? dx / d : Math.cos(i + j), ny = d > 1e-4 ? dy / d : Math.sin(i + j);
        const push = (min - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      }
    }
    const dx = a.x - p.x, dy = a.y - p.y, d = Math.hypot(dx, dy), min = HELPERS.radius[a.kind] + 0.28;
    if (d < min && d > 1e-4) { a.x = p.x + dx / d * min; a.y = p.y + dy / d * min; }
    pushOutOfCastle(a, CASTLE_HALF + 0.2);
    avoidSolids(G, a, HELPERS.radius[a.kind]);
  }
}

// ------------------------------------------------------------
//  Simulation step
// ------------------------------------------------------------
export function step(G: GameState, dt: number, dir: Vec) {
  if (G.over) return;
  if (G.offer) {
    if (!G.dev.autoplay) return;   // waiting for the player to choose a card
    pickCard(G, G.offer.ids[Math.floor(Math.random() * G.offer.ids.length)]);
  }
  // a boss was killed: offer cards; the game stays paused (step() returns) until one is picked
  if (G.cardsPending > 0) {
    G.cardsPending--;
    const ids = drawHand(G);
    if (ids.length) { G.offer = { ids, rerolls: 0 }; return; }
  }
  G.t += dt;
  if (G.dev.infiniteMoney) G.player.coins = Math.max(G.player.coins, 99999);
  updateWaves(G, dt);
  updatePlayer(G, dt, dir);
  updateEnemies(G, dt);
  updateBuildings(G, dt);
  updateShots(G, dt);
  updateDrops(G, dt);
  updateHelpers(G, dt);
  if (G.dev.autoplay) autoplay(G);
}

// ------------------------------------------------------------
//  Autopilot (dev menu): used to see how the economy scales without playing.
//  Instantly collects all the money from the ground and the tables, and buys the cheapest pad
//  it can afford (repair only if the castle is damaged).
// ------------------------------------------------------------
function autoplay(G: GameState) {
  const p = G.player;
  for (const c of G.drops) if (c.z <= 0 && !c.taken) { c.taken = true; p.coins += c.worth; G.stats.earned.ground += c.worth; }
  G.drops = G.drops.filter(c => !c.taken);
  for (const b of G.buildings) if (b.table > 0) { p.coins += b.table; G.stats.earned.table += b.table; b.table = 0; }
  for (let n = 0; n < 5; n++) {
    let best: Pad | null = null;
    for (const pad of G.pads) {
      if (!pad.active || pad.done || pad.cool > 0) continue;
      if (pad.type === 'repair' && G.base.hp > G.base.max * 0.6) continue;
      const left = pad.cost - pad.paid;
      if (left <= p.coins && (!best || left < best.cost - best.paid)) best = pad;
    }
    if (!best) break;
    const left = best.cost - best.paid;
    p.coins -= left;
    G.stats.spent[best.type] = (G.stats.spent[best.type] ?? 0) + left;
    best.paid = best.cost;
    completePad(G, best);
  }
}
