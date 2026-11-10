// ============================================================
//  Montaje de modelos Kenney: personajes, torres por piezas,
//  castillo, cabaña del peón y proyectiles.
// ============================================================
import * as THREE from 'three';
import type { EnemyKind } from '../game/types';
import { Character, bake, model } from './assets';

// ------------------------------------------------------------
//  Personajes
// ------------------------------------------------------------
export const PLAYER_SCALE = 0.46;     // el pícaro de KayKit es mucho más grande que los Mini Characters
export const PEON_SCALE = 1.25;

export interface KnightModel { ch: Character; sword: THREE.Object3D; bow: THREE.Object3D }

/**
 * Huesos de cintura para arriba del esqueleto Rig_Medium de KayKit (los ataques solo mueven estos).
 * Ojo: Three.js quita los puntos de los nombres al cargar («hand.r» pasa a ser «handr»).
 */
const UPPER_BODY = ['spine', 'chest', 'head', 'upperarml', 'lowerarml', 'wristl', 'handl', 'handslotl',
  'upperarmr', 'lowerarmr', 'wristr', 'handr', 'handslotr'];

/**
 * Jugador: el pícaro de KayKit Adventurers, con daga en la mano derecha y ballesta en la izquierda.
 * Las armas van en los huesos «handslot», que KayKit prepara justo para eso.
 */
export function makeKnight(): KnightModel {
  const ch = new Character('Rogue', PLAYER_SCALE, false, ['Rig_Medium_General', 'Rig_Medium_MovementBasic']);
  const sword = model('dagger');
  const bow = model('crossbow_1handed');
  ch.bone('handslotr')?.add(sword);
  ch.bone('handslotl')?.add(bow);
  // tajo solo de cintura para arriba: así puede atacar sin dejar de correr
  ch.upperBody('Throw', 'slash', UPPER_BODY);
  ch.play('Idle_A');
  return { ch, sword, bow };
}

const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _dir = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);

/**
 * Ballesta (el pack gratuito no trae animación de disparo). Llamar en cada fotograma, después de ch.update().
 * - Siempre: la ballesta apunta hacia delante, con los brazos del arco en horizontal, esté donde esté la mano.
 * - Al disparar (`k` de 0 a 1): además estira el brazo izquierdo hacia delante, con un pequeño retroceso.
 */
export function aimCrossbow(m: KnightModel, k: number, recoil: number) {
  if (k > 0) aimArm(m, k, recoil);
  // la ballesta, recta hacia delante (su +z es la punta); la punta sube un poco con el retroceso
  const slot = m.bow.parent;
  if (!slot?.parent) return;
  m.ch.root.updateMatrixWorld(true);
  m.ch.root.getWorldQuaternion(_q);
  _q.multiply(_tilt.setFromAxisAngle(_X, -recoil * 0.35));
  slot.parent.getWorldQuaternion(_pq);
  slot.quaternion.copy(_q.premultiply(_pq.invert()));
}

function aimArm(m: KnightModel, k: number, recoil: number) {
  const upper = m.ch.bone('upperarml'), lower = m.ch.bone('lowerarml'), wrist = m.ch.bone('wristl');
  if (!upper || !lower || !upper.parent) return;
  m.ch.root.updateMatrixWorld(true);
  // dirección deseada del brazo en el mundo: hacia delante del personaje, algo hacia arriba y hacia el centro
  _dir.set(-0.15, 0.12 + recoil * 0.25, 1).normalize();
  _dir.applyQuaternion(m.ch.root.getWorldQuaternion(_q));
  // el hueso apunta por su eje Y local: giro de Y a esa dirección, pasado al espacio del padre
  _q.setFromUnitVectors(_Y, _dir);
  upper.parent.getWorldQuaternion(_pq);
  _q.premultiply(_pq.invert());
  upper.quaternion.slerp(_q, k);
  // antebrazo y muñeca rectos
  _q.identity();
  lower.quaternion.slerp(_q, k);
  wrist?.quaternion.slerp(_q, k);
}
const _tilt = new THREE.Quaternion(), _X = new THREE.Vector3(1, 0, 0);

/** Modelo de un enemigo y los nombres de sus animaciones (cada pack las llama a su manera). */
export interface EnemyModel {
  ch: Character;
  walk: string; walkRate: number;   // ritmo de la animación de andar por unidad de velocidad
  attack: string; die: string; cast?: string;
  barY: number;                     // altura de la barra de vida (sobre el suelo, incluido el vuelo)
}
export const SKELETON_SCALE = 0.44;   // KayKit Skeletons (mismo tamaño de modelo que el pícaro)
export const MINION_SCALE = 0.4;
export const BOSS_SCALE = 0.8;
export const BAT_SCALE = 0.0016;
const RIG = ['Rig_Medium_General', 'Rig_Medium_MovementBasic'];

/** Esqueleto de KayKit con sus armas en las manos (materiales propios, para el destello al golpearlo). */
function skeleton(name: string, scale: number, right?: string, left?: string): Character {
  const ch = new Character(name, scale, true, RIG);
  for (const [slot, weapon] of [['handslotr', right], ['handslotl', left]] as const) {
    if (!weapon) continue;
    const w = model(weapon);
    w.traverse(o => {
      const mm = o as THREE.Mesh;
      if (!mm.isMesh) return;
      const mat = (mm.material as THREE.MeshStandardMaterial).clone();
      mm.material = mat; ch.mats.push(mat);
    });
    ch.bone(slot)?.add(w);
  }
  return ch;
}

export function makeEnemy(kind: EnemyKind, boss: boolean): EnemyModel {
  let m: EnemyModel;
  if (boss || kind === 'zombie') {
    // guerrero esqueleto con espada y escudo; el jefe es el mismo, solo que enorme
    const ch = skeleton('Skeleton_Warrior', boss ? BOSS_SCALE : SKELETON_SCALE, 'Skeleton_Blade', 'Skeleton_Shield_Small_A');
    m = { ch, walk: 'Walking_A', walkRate: boss ? 1.0 : 1.15, attack: 'Throw', die: 'Death_A', barY: boss ? 2.3 : 1.3 };
  } else if (kind === 'runner') {
    // esbirro con hacha, corriendo
    const ch = skeleton('Skeleton_Minion', MINION_SCALE, 'Skeleton_Axe');
    m = { ch, walk: 'Running_A', walkRate: 0.45, attack: 'Throw', die: 'Death_B', barY: 1.2 };
  } else if (kind === 'bat') {
    const ch = new Character('bat', BAT_SCALE, true);
    m = { ch, walk: 'BatArmature|Bat_Flying', walkRate: 0.9, attack: 'BatArmature|Bat_Attack', die: 'BatArmature|Bat_Death', barY: 0.75 };
  } else {
    // mago esqueleto: báculo en la mano derecha; «Use_Item» como gesto del hechizo
    const ch = skeleton('Skeleton_Mage', SKELETON_SCALE, 'Skeleton_Staff');
    m = { ch, walk: 'Walking_B', walkRate: 1.1, attack: 'Interact', die: 'Death_A', cast: 'Use_Item', barY: 1.4 };
  }
  m.ch.play(m.walk);
  return m;
}

/** Lobo (Quaternius, Ultimate Animated Animals): sustituye al perro. */
export const WOLF_SCALE = 0.19;
export function makeDogK(): Character {
  const ch = new Character('wolf', WOLF_SCALE);
  ch.mixer.setTime(Math.random());
  ch.play('Idle');
  return ch;
}

export function makeWorker(): Character {
  const ch = new Character('character-male-b', PEON_SCALE);
  ch.play('idle');
  return ch;
}

// ------------------------------------------------------------
//  Torres (Tower Defense Kit): se apilan piezas según el nivel
// ------------------------------------------------------------
export interface TowerModel { root: THREE.Group; head: THREE.Group }

const TOWER_SCALE = 0.95;
// piezas de en medio por nivel (1..7) y variante de las piezas (a, b, c)
const MIDDLES = [0, 1, 1, 2, 2, 2, 2];
const variant = (level: number) => (level >= 5 ? 'c' : level >= 3 ? 'b' : 'a');

function stack(root: THREE.Group, shape: 'round' | 'square', level: number): number {
  const v = variant(level);
  const h = shape === 'round' ? 0.6 : 0.5;   // alto de cada pieza
  let y = 0;
  const put = (name: string, height: number) => {
    const p = model(name);
    p.position.y = y;
    root.add(p);
    y += height;
  };
  put(`tower-${shape}-bottom-${v}`, h);
  for (let i = 0; i < MIDDLES[level - 1]; i++) put(`tower-${shape}-middle-${i === 0 && level < 5 ? 'a' : v}`, h);
  return y;
}

export function makeTower(type: 'archer' | 'cannon', level: number): TowerModel {
  const L = Math.max(1, Math.min(7, level));
  const inner = new THREE.Group();
  const stat = new THREE.Group();          // piezas fijas: se funden en una sola malla
  const shape = type === 'archer' ? 'round' : 'square';
  const y = stack(stat, shape, L);
  const top = model(`tower-${shape}-top-${variant(L)}`);
  top.position.y = y;
  stat.add(top);
  // anillo de cristales a media altura desde nivel 5
  if (L >= 5) {
    const c = model('tower-round-crystals');
    c.position.y = Math.max(0.35, y - 0.3);
    c.scale.setScalar(L >= 7 ? 1.15 : 1);
    stat.add(c);
  }
  // cristales en lo alto en los niveles máximos
  if (L >= 6) {
    for (const [x, z] of [[-1, -1], [1, 1]]) {
      const c = model(L >= 7 ? 'detail-crystal-large' : 'detail-crystal');
      c.position.set(x * 0.36, y + 0.42, z * 0.36);
      c.scale.setScalar(0.6);
      c.name = 'crystal';
      stat.add(c);
    }
  }
  inner.add(bake(stat, `tower-${type}-${L}`));
  // arma: gira hacia el objetivo
  const head = new THREE.Group();
  head.position.y = y + (shape === 'round' ? 0.18 : 0.5);
  const w = model(type === 'archer' ? 'weapon-ballista' : 'weapon-cannon');
  w.position.y = shape === 'round' ? 0 : 0.12;
  w.scale.setScalar(type === 'archer' ? 1.1 : 1.15);
  head.add(w);
  inner.add(head);
  inner.scale.setScalar(TOWER_SCALE);
  const root = new THREE.Group();
  root.add(inner);
  // la cabeza se mueve en coordenadas del grupo interior; se expone tal cual
  return { root, head };
}

// ------------------------------------------------------------
//  Castillo (Castle Kit). Nivel 1..5 (sube con "Reparar base")
// ------------------------------------------------------------
/** Las piezas de muro de Fantasy Town ocupan el borde +x de una baldosa de 1×1 (cabaña). */
function wallAt(g: THREE.Group, name: string, tx: number, tz: number, side: '+x' | '-x' | '+z' | '-z', y: number) {
  const w = model(name);
  w.position.set(tx, y, tz);
  w.rotation.y = { '+x': 0, '-x': Math.PI, '+z': -Math.PI / 2, '-z': Math.PI / 2 }[side];
  g.add(w);
  return w;
}

function piece(g: THREE.Group, name: string, x: number, y: number, z: number, rotY = 0, scale = 1) {
  const p = model(name);
  p.position.set(x, y, z);
  p.rotation.y = rotY;
  p.scale.setScalar(scale);
  g.add(p);
  return p;
}

const CASTLE_SCALE = 0.72;   // 1,5 unidades del kit = medio lado de la base (BASE_HALF)
const CASTLE_EDGE = 1.5;

export function makeCastleK(level: number): THREE.Group {
  const L = Math.max(1, Math.min(5, level));
  const g = new THREE.Group();

  // --- torre del homenaje (centro): crece en pisos y tejado con el nivel
  const keep = new THREE.Group();
  let y = 0;
  const put = (name: string, h: number) => { piece(keep, name, 0, y, 0); y += h; };
  put('tower-square-base', 1.01);
  const mids = [0, 1, 1, 2, 2][L - 1];
  for (let i = 0; i < mids; i++) put(i === mids - 1 ? 'tower-square-mid-windows' : 'tower-square-mid', 1.01);
  const roofName = ['tower-square-top', 'tower-square-top-roof', 'tower-square-top-roof-high', 'tower-square-top-roof-high-windows', 'tower-square-top-roof-high-windows'][L - 1];
  const roofH = [0.3, 1.0, 1.35, 1.08, 1.08][L - 1];
  piece(keep, roofName, 0, y, 0);
  const keepTop = y + roofH;
  if (L >= 4) piece(keep, 'flag-banner-long', 0.52, 0.15, 0, 0, 0.8);
  if (L >= 4) piece(keep, 'flag-banner-long', 0, 0.15, 0.52, -Math.PI / 2, 0.8);
  keep.scale.setScalar(1.3);
  g.add(keep);

  // --- murallas: empalizada de madera al principio, piedra desde nivel 2
  const wall = L >= 2 ? 'wall' : 'wall-narrow-wood';
  for (const side of [0, 1, 2, 3]) {
    const rot = side * Math.PI / 2;
    for (const t of [-0.5, 0.5]) {
      const front = side === 0;
      const x = Math.sin(rot) * CASTLE_EDGE + Math.cos(rot) * t;
      const z = Math.cos(rot) * CASTLE_EDGE - Math.sin(rot) * t;
      // las piezas de muro del kit van a lo largo del eje z: se giran 90° para ir a lo largo del borde
      piece(g, front && L >= 2 ? (t < 0 ? 'wall-doorway' : wall) : wall, x, 0, z, rot + Math.PI / 2);
    }
  }
  // puerta principal (mirando a la cámara)
  if (L >= 2) piece(g, 'gate', 0, 0, CASTLE_EDGE + 0.12, Math.PI / 2);
  // estandartes en la muralla
  if (L >= 3) for (const x of [-0.8, 0.8]) piece(g, 'flag-banner-short', x, 0.35, CASTLE_EDGE + 0.32, -Math.PI / 2, 0.9);

  // --- torreones de las esquinas
  for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const t = new THREE.Group();
    let ty = 0;
    const tput = (name: string, h: number) => { piece(t, name, 0, ty, 0); ty += h; };
    if (L <= 2) {
      tput('tower-base', 1.31);
      if (L === 1) tput('tower-top', 0.13); else tput('tower-hexagon-roof', 0.83);
    } else {
      tput('tower-hexagon-base', 1.31);
      for (let i = 0; i < L - 3; i++) tput('tower-hexagon-mid', 0.46);
      tput('tower-hexagon-roof', 0.83);
      if (L >= 4) { const f = piece(t, 'flag', 0, ty - 0.12, 0, Math.PI / 2, 0.7); f.name = 'flag'; }
    }
    t.position.set(cx * CASTLE_EDGE, 0, cz * CASTLE_EDGE);
    t.scale.setScalar(1.05);
    g.add(t);
  }

  // --- bandera en lo alto del homenaje (ondea) y cristal en el nivel máximo
  const top = keepTop * 1.3;
  const flag = piece(g, L >= 3 ? 'flag-wide' : 'flag', 0, top - 0.15, 0, Math.PI / 2, 0.9);
  flag.name = 'flag';
  if (L >= 5) {
    const c = model('detail-crystal-large');
    c.position.y = top + 0.75;
    c.scale.setScalar(0.9);
    c.name = 'crystal';
    g.add(c);
  }

  g.scale.setScalar(CASTLE_SCALE);
  const root = new THREE.Group();
  root.add(g);
  return bake(root, `castle-${L}`);
}

// ------------------------------------------------------------
//  Cabaña del peón (Fantasy Town Kit)
// ------------------------------------------------------------
export function makeHutK(level: number): THREE.Group {
  const L = Math.max(1, Math.min(5, level));
  const g = new THREE.Group();
  const stone = L >= 4;
  const wall = stone ? 'wall' : 'wall-wood';
  wallAt(g, stone ? 'wall-door' : 'wall-wood-door', 0, 0, '+z', 0).position.x = 0;
  wallAt(g, L >= 2 ? (stone ? 'wall-window-shutters' : 'wall-wood-window-shutters') : wall, 0, 0, '+x', 0);
  wallAt(g, wall, 0, 0, '-x', 0);
  wallAt(g, wall, 0, 0, '-z', 0);
  const roof = model(L >= 3 ? 'roof-high-point' : 'roof-point');
  roof.position.y = 1;
  g.add(roof);
  if (L >= 2) { const c = model('chimney'); c.position.set(-0.1, 1, -0.2); c.scale.setScalar(0.8); g.add(c); }
  if (L >= 3) wallAt(g, 'banner-green', 0, 0, '+x', 0);
  if (L >= 5) { const l = model('lantern'); l.position.set(0.7, 0, 0.7); l.scale.setScalar(0.6); g.add(l); }
  g.scale.setScalar(0.95);
  const out = new THREE.Group();
  out.add(bake(g, `hut-${L}`));
  out.children[0].scale.setScalar(0.95);
  return out;
}

// ------------------------------------------------------------
//  Proyectiles
// ------------------------------------------------------------
export function makeArrowK(): THREE.Object3D {
  const g = new THREE.Group();
  const a = model('weapon-ammo-arrow');
  a.scale.setScalar(0.6);
  g.add(a);
  return g;
}
export function makeBallK(): THREE.Object3D {
  const b = model('weapon-ammo-cannonball');
  b.scale.setScalar(0.9);
  return b;
}
