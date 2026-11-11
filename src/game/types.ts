// Game coordinates: (x, y) on the ground in tiles. The renderer maps them to (x, 0, y) in 3D.
export interface Vec { x: number; y: number }

export type PadType = 'archer' | 'cannon' | 'power' | 'repair' | 'forge' | 'kennel' | 'peon' | 'upgrade';

// Automatic helpers:
//  - dog: picks up coins from the ground
//  - peon: empties the towers' loot tables
export type HelperKind = 'dog' | 'peon';
export interface Helper extends Vec {
  id: number;
  kind: HelperKind;
  level: number;
  carry: number;                     // coins it is carrying
  mode: 'fetch' | 'deliver' | 'idle' | 'attack';
  moving: boolean;
  faceX: number; faceY: number;
  home: Vec;                         // kennel / hut
  acc: number;                       // accumulator for the pickup rate at tables
  targetId: number;                  // coin / table / enemy it is heading to (-1 = none)
  atkCd: number;
  attackT: number;                   // >0 during the bite animation
  slot: number;                      // index within its group (to spread out while waiting)
  goal?: Vec | null;                 // next point it walks to (only for drawing it in the dev menu)
}
export type TowerType = 'archer' | 'cannon';

export interface Player extends Vec {
  coins: number;
  swordDmg: number;
  bowDmg: number;
  speed: number;
  cd: number;
  moving: boolean;
  faceX: number; faceY: number;   // last movement direction
  weapon: Weapon;                 // last weapon used (for the animation)
  attackT: number;                // >0 during the attack animation
  target: Vec | null;
}

export type Weapon = 'sword' | 'bow';

/** Enemy types: zombie (normal), skeleton (runner), bat (flies) and mage (heals the others). */
export type EnemyKind = 'zombie' | 'runner' | 'bat' | 'shaman';

export interface Enemy extends Vec {
  id: number;
  kind: EnemyKind;
  fly: number;                 // flight height (0 = on the ground)
  cast: number;                // mage: seconds until its next healing spell
  healed: number;              // green flash when healed
  hp: number; maxHp: number;
  speed: number; value: number;
  dmg: number; atkRate: number; atk: number;
  r: number; boss: boolean;
  dead: boolean; attacking: boolean;
  lunge: number; hit: number;
}

export interface Drop extends Vec {
  id: number;
  z: number; vx: number; vy: number; vz: number;
  worth: number; age: number; taken: boolean;
}

export interface Pad extends Vec {
  id: number;
  type: PadType;
  cost: number; paid: number; unlock: number;
  repeat: boolean; active: boolean; done: boolean;
  level: number; cool: number;
  buildingId: number | null;   // only on 'upgrade' pads: the tower it upgrades
  small: boolean;              // small pad (tower upgrades)
}

export interface Building extends Vec {
  id: number;
  type: TowerType;
  tx: number; ty: number;   // position of the loot table
  cd: number; table: number;
  aimX: number; aimY: number;
  level: number;
  baseCost: number;          // what it cost to build (to work out the upgrade price)
  startLevel: number;        // level it was built at (expensive towers start upgraded)
}

export interface Shot extends Vec {
  id: number;
  type: TowerType;
  z: number; z0: number; dist0: number;
  target: Enemy | null;
  tx: number; ty: number; tz: number;   // impact point (tz: height, higher if the target flies)
  speed: number; dmg: number; splash: number;
  from: Building | null;           // null = player's arrow (the loot drops on the ground)
  done: boolean;
}

export interface Point3 { x: number; y: number; z: number }

/** Scenery item placed by the simulation (the view draws it with that model, rotation and scale). */
export interface Prop extends Vec { model: string; rot: number; scale: number }
/**
 * Solid area (tree trunk, rock, fallen log…): nobody can pass through it.
 * It's a circle of radius r, or a capsule if it has (hx, hy): the segment centre ± (hx, hy) thickened by r.
 */
export interface Solid extends Vec { r: number; hx?: number; hy?: number }

export type SfxName =
  | 'sword' | 'bow' | 'arrow' | 'cannon' | 'boom' | 'die' | 'dieBones' | 'dieBat' | 'bossDie' | 'bite' | 'heal'
  | 'coin' | 'pay' | 'build' | 'upgrade' | 'baseHit' | 'wave' | 'boss' | 'waveClear' | 'gameOver';

export type GameEvent =
  | { type: 'sfx'; name: SfxName; x?: number; y?: number }
  | { type: 'text'; x: number; y: number; text: string; color: string; size: number }
  | { type: 'coinFly'; from: Point3; to: Point3 | 'player' }
  | { type: 'boom'; x: number; y: number; r: number }
  | { type: 'enemyDied'; x: number; y: number; boss: boolean; kind: EnemyKind }
  | { type: 'built'; id: number }
  | { type: 'towerUpgraded'; id: number }
  | { type: 'baseHit' }
  | { type: 'padUpgraded'; id: number };

export type Difficulty = 'normal' | 'hard' | 'nightmare';

export interface GameState {
  t: number;
  difficulty: Difficulty;
  over: boolean;
  built: number;
  player: Player;
  base: { hp: number; max: number };
  enemies: Enemy[];
  drops: Drop[];
  shots: Shot[];
  buildings: Building[];
  pads: Pad[];
  props: Prop[];             // trees, rocks, stumps and logs in the clearing (change every game)
  solids: Solid[];           // their solid areas
  wave: number; waveTimer: number; spawnLeft: number; spawnTimer: number;
  towerMult: number;
  transferAcc: number;
  helpers: Helper[];
  padDwellId: number;        // pad the player is standing on
  padDwell: number;          // how long they've been on it
  castleLevel: number;       // 1..5, goes up with "Repair base" (changes the castle's look)
  helperLevels: Record<HelperKind, number>;  // kennel / hut level (0 = not built)
  stats: Stats;              // game log (for balancing)
  events: GameEvent[];
  dev: DevFlags;             // active dev menu cheats
  cheated: boolean;          // the dev menu was used this game (flagged in the log)
}

/** Cheats that change how the simulation behaves (dev menu). */
export interface DevFlags {
  pauseWaves: boolean;       // the countdown to the next wave doesn't advance
  godCastle: boolean;        // the castle doesn't lose health
  freeze: boolean;           // enemies stand still and don't attack
  enemyHp: number;           // health multiplier for new enemies
  enemySpeed: number;        // enemy speed multiplier
  playerDmg: number;         // player damage multiplier
  playerSpeed: number;       // player speed multiplier
  freeBuild: boolean;        // stepping on a pad completes it for free
  infiniteMoney: boolean;    // always 99,999 coins
  autoplay: boolean;         // picks up all the money by itself and buys the cheapest pad it can
}

// ------------------------------------------------------------
//  Game log
// ------------------------------------------------------------
export type KillSource = 'sword' | 'bow' | 'archer' | 'cannon' | 'dog';
export type EarnSource = 'ground' | 'table' | 'dog' | 'peon';

/** Counters accumulated since the start of the game. */
export interface Counters {
  earned: Record<EarnSource, number>;     // coins that reach the player's stack, by source
  spent: Partial<Record<PadType, number>>;// coins spent, by pad type
  kills: Record<KillSource, number>;
  baseDamage: number;
  spawned: number;
  spawnedKind: Partial<Record<EnemyKind | 'boss', number>>;
}

/** Snapshot of a wave (counter values are what happened ONLY in that wave). */
export interface WaveLog extends Counters {
  wave: number;
  t: number;                 // game second at which it ends
  duration: number;
  baseHp: number; baseMax: number;
  coinsHeld: number;         // coins in the stack at the end
  tablesLoot: number;        // coins waiting on tables
  groundCoins: number;       // coins on the ground
  enemiesAlive: number;
  enemyHp: number;           // health of a normal enemy in that wave
  enemyValue: number;        // coins it drops
  towers: string;            // e.g. "A5 A3 C2" (type + level)
  towerMult: number;
  helpers: Record<HelperKind, number>;
  player: { sword: number; bow: number };
  pads: string;              // levels of the repeatable pads
}

export interface Stats extends Counters {
  waves: WaveLog[];
  last: Counters;            // counters at the start of the current wave (to compute the difference)
  lastT: number;
}
