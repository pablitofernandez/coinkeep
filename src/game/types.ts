// Coordenadas de juego: (x, y) sobre el suelo en tiles. El render las mapea a (x, 0, y) en 3D.
export interface Vec { x: number; y: number }

export type PadType = 'archer' | 'cannon' | 'power' | 'repair' | 'forge' | 'kennel' | 'peon' | 'upgrade';

// Ayudantes automáticos:
//  - perro: recoge las monedas del suelo
//  - peón: vacía las mesas de botín de las torres
export type HelperKind = 'dog' | 'peon';
export interface Helper extends Vec {
  id: number;
  kind: HelperKind;
  level: number;
  carry: number;                     // monedas que lleva encima
  mode: 'fetch' | 'deliver' | 'idle' | 'attack';
  moving: boolean;
  faceX: number; faceY: number;
  home: Vec;                         // caseta / cabaña
  acc: number;                       // acumulador para el ritmo de recogida en mesas
  targetId: number;                  // moneda / mesa / enemigo al que va (-1 = ninguno)
  atkCd: number;
  attackT: number;                   // >0 durante la animación de mordisco
  slot: number;                      // índice dentro de su grupo (para repartirse al esperar)
  goal?: Vec | null;                 // siguiente punto al que camina (solo para dibujarlo en el menú de desarrollo)
}
export type TowerType = 'archer' | 'cannon';

export interface Player extends Vec {
  coins: number;
  swordDmg: number;
  bowDmg: number;
  speed: number;
  cd: number;
  moving: boolean;
  faceX: number; faceY: number;   // última dirección de movimiento
  weapon: Weapon;                 // última arma usada (para la animación)
  attackT: number;                // >0 durante la animación de ataque
  target: Vec | null;
}

export type Weapon = 'sword' | 'bow';

export interface Enemy extends Vec {
  id: number;
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
  buildingId: number | null;   // solo en parcelas 'upgrade': la torre que mejora
  small: boolean;              // parcela pequeña (mejoras de torre)
}

export interface Building extends Vec {
  id: number;
  type: TowerType;
  tx: number; ty: number;   // posición de la mesa de botín
  cd: number; table: number;
  aimX: number; aimY: number;
  level: number;
  baseCost: number;          // lo que costó construirla (para calcular el precio de las mejoras)
  startLevel: number;        // nivel con el que se construyó (las torres caras nacen mejoradas)
}

export interface Shot extends Vec {
  id: number;
  type: TowerType;
  z: number; z0: number; dist0: number;
  target: Enemy | null;
  tx: number; ty: number;
  speed: number; dmg: number; splash: number;
  from: Building | null;           // null = flecha del jugador (el botín cae al suelo)
  done: boolean;
}

export interface Point3 { x: number; y: number; z: number }

/** Elemento de decorado colocado por la simulación (la vista lo dibuja con ese modelo, giro y escala). */
export interface Prop extends Vec { model: string; rot: number; scale: number }
/**
 * Zona sólida (tronco de árbol, roca, tronco caído…): nadie la puede atravesar.
 * Es un círculo de radio r, o una cápsula si tiene (hx, hy): el segmento centro ± (hx, hy) engordado r.
 */
export interface Solid extends Vec { r: number; hx?: number; hy?: number }

export type SfxName =
  | 'sword' | 'bow' | 'arrow' | 'cannon' | 'boom' | 'die' | 'bossDie' | 'bite'
  | 'coin' | 'pay' | 'build' | 'upgrade' | 'baseHit' | 'wave' | 'boss' | 'waveClear' | 'gameOver';

export type GameEvent =
  | { type: 'sfx'; name: SfxName; x?: number; y?: number }
  | { type: 'text'; x: number; y: number; text: string; color: string; size: number }
  | { type: 'coinFly'; from: Point3; to: Point3 | 'player' }
  | { type: 'boom'; x: number; y: number; r: number }
  | { type: 'enemyDied'; x: number; y: number; boss: boolean }
  | { type: 'built'; id: number }
  | { type: 'towerUpgraded'; id: number }
  | { type: 'baseHit' }
  | { type: 'padUpgraded'; id: number };

export interface GameState {
  t: number;
  over: boolean;
  built: number;
  player: Player;
  base: { hp: number; max: number };
  enemies: Enemy[];
  drops: Drop[];
  shots: Shot[];
  buildings: Building[];
  pads: Pad[];
  props: Prop[];             // árboles, rocas, tocones y troncos del claro (cambian en cada partida)
  solids: Solid[];           // sus zonas sólidas
  wave: number; waveTimer: number; spawnLeft: number; spawnTimer: number;
  towerMult: number;
  transferAcc: number;
  helpers: Helper[];
  padDwellId: number;        // parcela que está pisando el jugador
  padDwell: number;          // cuánto tiempo lleva encima
  castleLevel: number;       // 1..5, sube con "Reparar base" (cambia el aspecto del castillo)
  helperLevels: Record<HelperKind, number>;  // nivel de la caseta / cabaña (0 = no construida)
  stats: Stats;              // registro de la partida (para equilibrar)
  events: GameEvent[];
  dev: DevFlags;             // trucos activos del menú de desarrollo
  cheated: boolean;          // se ha usado el menú de desarrollo en esta partida (se marca en el registro)
}

/** Trucos que cambian el comportamiento de la simulación (menú de desarrollo). */
export interface DevFlags {
  pauseWaves: boolean;       // el contador hasta la siguiente oleada no avanza
  godCastle: boolean;        // el castillo no pierde vida
  freeze: boolean;           // enemigos quietos y sin atacar
  enemyHp: number;           // multiplicador de vida de los enemigos nuevos
  enemySpeed: number;        // multiplicador de velocidad de los enemigos
  playerDmg: number;         // multiplicador de daño del jugador
  playerSpeed: number;       // multiplicador de velocidad del jugador
  freeBuild: boolean;        // pisar una parcela la completa gratis
  infiniteMoney: boolean;    // siempre 99.999 monedas
  autoplay: boolean;         // recoge todo el dinero solo y compra la parcela más barata que pueda
}

// ------------------------------------------------------------
//  Registro de partida
// ------------------------------------------------------------
export type KillSource = 'sword' | 'bow' | 'archer' | 'cannon' | 'dog';
export type EarnSource = 'ground' | 'table' | 'dog' | 'peon';

/** Contadores acumulados desde el inicio de la partida. */
export interface Counters {
  earned: Record<EarnSource, number>;     // monedas que llegan a la pila del jugador, por origen
  spent: Partial<Record<PadType, number>>;// monedas gastadas, por tipo de parcela
  kills: Record<KillSource, number>;
  baseDamage: number;
  spawned: number;
}

/** Foto de una oleada (los valores de contadores son lo ocurrido SOLO en esa oleada). */
export interface WaveLog extends Counters {
  wave: number;
  t: number;                 // segundo de partida en que termina
  duration: number;
  baseHp: number; baseMax: number;
  coinsHeld: number;         // monedas en la pila al terminar
  tablesLoot: number;        // monedas esperando en mesas
  groundCoins: number;       // monedas en el suelo
  enemiesAlive: number;
  enemyHp: number;           // vida de un enemigo normal en esa oleada
  enemyValue: number;        // monedas que suelta
  towers: string;            // p.ej. "A5 A3 C2" (tipo + nivel)
  towerMult: number;
  helpers: Record<HelperKind, number>;
  player: { sword: number; bow: number };
  pads: string;              // niveles de las parcelas repetibles
}

export interface Stats extends Counters {
  waves: WaveLog[];
  last: Counters;            // contadores al empezar la oleada actual (para calcular la diferencia)
  lastT: number;
}
