// ============================================================
//  Modelos 3D (Kenney, CC0). Se cargan todos al arrancar y luego
//  se clonan: los clones comparten geometría y materiales.
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const FILES: Record<string, string[]> = {
  chars: ['character-male-b', 'character-zombie'],
  // KayKit Adventurers: el pícaro (jugador), sus armas y las animaciones del esqueleto «Rig_Medium»
  kaykit: ['Rogue', 'Mage', 'Rig_Medium_General', 'Rig_Medium_MovementBasic', 'dagger.gltf', 'crossbow_1handed.gltf', 'staff.gltf'],
  // Quaternius Animated Monster Pack (convertidos de FBX a GLB): esqueleto corredor y murciélago
  monsters: ['skeleton', 'bat'],
  // Quaternius Ultimate Animated Animals
  animals: ['wolf'],
  td: [
    'tower-round-bottom-a', 'tower-round-bottom-b', 'tower-round-bottom-c',
    'tower-round-middle-a', 'tower-round-middle-b', 'tower-round-middle-c',
    'tower-round-top-a', 'tower-round-top-b', 'tower-round-top-c',
    'tower-round-roof-a', 'tower-round-roof-b', 'tower-round-roof-c', 'tower-round-crystals',
    'tower-square-bottom-a', 'tower-square-bottom-b', 'tower-square-bottom-c',
    'tower-square-middle-a', 'tower-square-middle-b', 'tower-square-middle-c',
    'tower-square-top-a', 'tower-square-top-b', 'tower-square-top-c',
    'weapon-ballista', 'weapon-cannon', 'weapon-ammo-arrow', 'weapon-ammo-cannonball',
    'detail-crystal', 'detail-crystal-large',
  ],
  town: [
    'wall', 'wall-door', 'wall-window-shutters', 'wall-window-stone', 'wall-wood', 'wall-wood-door',
    'wall-wood-window-shutters', 'roof-point', 'roof-high-point', 'banner-red', 'banner-green',
    'lantern', 'chimney', 'stall-red', 'fence',
  ],
  castle: ['door', 'flag-banner-long', 'flag-banner-short', 'flag-pennant', 'flag-wide', 'flag', 'gate', 'metal-gate', 'tower-base', 'tower-hexagon-base', 'tower-hexagon-mid', 'tower-hexagon-roof-secondary', 'tower-hexagon-roof', 'tower-hexagon-top-wood', 'tower-hexagon-top', 'tower-slant-roof', 'tower-square-arch', 'tower-square-base-border', 'tower-square-base-color', 'tower-square-base', 'tower-square-mid-color', 'tower-square-mid-door', 'tower-square-mid-open-simple', 'tower-square-mid-open', 'tower-square-mid-windows', 'tower-square-mid', 'tower-square-roof', 'tower-square-top-color', 'tower-square-top-roof-high-windows', 'tower-square-top-roof-high', 'tower-square-top-roof-rounded', 'tower-square-top-roof', 'tower-square-top', 'tower-square', 'tower-top', 'wall-corner-half-tower', 'wall-corner-half', 'wall-corner-slant', 'wall-corner', 'wall-doorway', 'wall-half-modular', 'wall-half', 'wall-narrow-corner', 'wall-narrow-gate', 'wall-narrow-stairs-rail', 'wall-narrow-stairs', 'wall-narrow-wood-fence', 'wall-narrow-wood', 'wall-narrow', 'wall-pillar', 'wall-stud', 'wall-to-narrow', 'wall'],
  nature: [
    'tree_pineTallA', 'tree_pineTallB', 'tree_pineTallC', 'tree_pineTallD', 'tree_pineRoundA', 'tree_pineRoundB',
    'tree_pineDefaultA', 'tree_pineDefaultB', 'tree_default', 'tree_oak', 'tree_cone', 'tree_fat',
    'rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_smallA', 'rock_smallC', 'stone_largeA', 'stone_largeC',
    'flower_redA', 'flower_yellowA', 'flower_purpleA', 'mushroom_red', 'mushroom_tanGroup',
    'plant_bush', 'plant_bushSmall', 'stump_round', 'log',
  ],
};

interface Asset { scene: THREE.Group; clips: THREE.AnimationClip[]; skinned: boolean }

// El Nature Kit viene en tonos pastel turquesa: se pasa a la paleta del juego
const NATURE_COLORS: Record<string, string> = {
  grass: '#5aa843', leafsGreen: '#4c9e3f', leafsDark: '#2f7a36', stone: '#a3a3ad', dirt: '#8f7652',
  woodBark: '#7a5232', woodBarkDark: '#5e3e26', woodInner: '#d9b98c',
};
const assets = new Map<string, Asset>();
// Un único material por pack y nombre: así las piezas se pueden fusionar en una sola malla
const sharedMats = new Map<string, THREE.Material>();

/** Carga todos los modelos. `onProgress` recibe 0..1. */
export async function loadAssets(onProgress: (k: number) => void = () => {}) {
  const loader = new GLTFLoader();
  const list = Object.entries(FILES).flatMap(([dir, names]) => names.map(n => ({ dir, n })));
  let done = 0;
  await Promise.all(list.map(async ({ dir, n: file }) => {
    // sin extensión se entiende .glb; los .gltf se registran con el nombre sin extensión
    const n = file.replace(/\.gltf$/, '');
    const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${dir}/${file.includes('.') ? file : file + '.glb'}`);
    let skinned = false;
    gltf.scene.traverse(o => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.castShadow = true;
        m.receiveShadow = true;
        if ((m as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
        // los modelos de Kenney vienen algo metálicos; en este estilo quedan mejor mate
        if (Array.isArray(m.material)) return;
        const key = dir + ':' + m.material.name;
        const known = sharedMats.get(key);
        if (known && !skinnedMesh(m)) { m.material = known; return; }
        const s = m.material as THREE.MeshStandardMaterial;
        if (s.isMeshStandardMaterial) {
          s.metalness = 0; s.roughness = Math.max(s.roughness, 0.75);
          if (dir === 'nature' && NATURE_COLORS[s.name]) s.color.set(NATURE_COLORS[s.name]);
        }
        if (!known) sharedMats.set(key, s);
      }
    });
    assets.set(n, { scene: gltf.scene, clips: gltf.animations, skinned });
    onProgress(++done / list.length);
  }));
}

const skinnedMesh = (m: THREE.Mesh) => (m as THREE.SkinnedMesh).isSkinnedMesh === true;

function get(name: string): Asset {
  const a = assets.get(name);
  if (!a) throw new Error('Modelo no cargado: ' + name);
  return a;
}

/** Copia de un modelo estático (comparte geometría y materiales). */
export function model(name: string): THREE.Group {
  return get(name).scene.clone(true);
}

/** Personaje animado: modelo + mezclador con todas sus animaciones. */
export class Character {
  readonly root = new THREE.Group();
  readonly mixer: THREE.AnimationMixer;
  readonly actions = new Map<string, THREE.AnimationAction>();
  readonly mats: THREE.MeshStandardMaterial[] = [];
  private current: THREE.AnimationAction | null = null;
  private oneShot: THREE.AnimationAction | null = null;

  /** `clipsFrom`: otros modelos cuyas animaciones se añaden (mismo esqueleto, p. ej. los Rig_Medium de KayKit). */
  constructor(name: string, scale = 1, ownMaterials = false, clipsFrom: string[] = []) {
    const a = get(name);
    const obj = cloneSkinned(a.scene) as THREE.Group;
    obj.scale.setScalar(scale);
    // materiales propios si hay que hacerlos destellar sin afectar a los demás
    if (ownMaterials) {
      obj.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const c = (m.material as THREE.MeshStandardMaterial).clone();
          m.material = c;
          this.mats.push(c);
        }
      });
    }
    this.root.add(obj);
    this.mixer = new THREE.AnimationMixer(obj);
    for (const clip of [...a.clips, ...clipsFrom.flatMap(n => get(n).clips)]) {
      if (!this.actions.has(clip.name)) this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
  }

  /** Busca un hueso / nodo por nombre (para colgar armas). */
  bone(name: string): THREE.Object3D | undefined {
    return this.root.getObjectByName(name);
  }

  /** Crea una animación nueva `as` con solo las pistas de los huesos indicados (p. ej. tronco y brazos). */
  upperBody(clip: string, as: string, bones: string[]) {
    const src = this.actions.get(clip)?.getClip();
    if (!src) return;
    const tracks = src.tracks.filter(t => bones.includes(t.name.slice(0, t.name.lastIndexOf('.'))));
    this.actions.set(as, this.mixer.clipAction(new THREE.AnimationClip(as, src.duration, tracks)));
  }

  /** Animación en bucle (con transición suave). */
  play(name: string, timeScale = 1, fade = 0.15) {
    const act = this.actions.get(name);
    if (!act) return;
    act.timeScale = timeScale;
    if (act === this.current) return;
    act.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = act;
  }

  /** Animación de una sola vez por encima de la actual (golpe, disparo, muerte). */
  once(name: string, timeScale = 1, hold = false) {
    const act = this.actions.get(name);
    if (!act) return;
    if (this.oneShot && this.oneShot !== act) this.oneShot.stop();
    act.reset();
    act.setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = hold;
    act.timeScale = timeScale;
    act.setEffectiveWeight(1);
    act.play();
    this.oneShot = act;
  }

  update(dt: number) { this.mixer.update(dt); }

  dispose() {
    this.mixer.stopAllAction();
    for (const m of this.mats) m.dispose();
  }
}

/**
 * Convierte un modelo en mallas instanciadas (una por cada sub-malla del modelo).
 * Para cientos de árboles o flores con muy pocas llamadas de dibujo.
 */
export function instanced(name: string, matrices: THREE.Matrix4[], shadows: boolean, skipMaterials: string[] = []): THREE.InstancedMesh[] {
  const src = get(name).scene;
  src.updateMatrixWorld(true);
  const out: THREE.InstancedMesh[] = [];
  const tmp = new THREE.Matrix4();
  src.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || skipMaterials.includes((m.material as THREE.Material).name)) return;
    const im = new THREE.InstancedMesh(m.geometry, m.material, matrices.length);
    matrices.forEach((mat, i) => im.setMatrixAt(i, tmp.multiplyMatrices(mat, m.matrixWorld)));
    im.castShadow = shadows;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    out.push(im);
  });
  return out;
}

// ------------------------------------------------------------
//  Fusión de piezas estáticas (muchas menos llamadas de dibujo)
// ------------------------------------------------------------
const bakeCache = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material }[]>();
const KEEP = new Set(['flag', 'crystal']);   // piezas animadas: no se fusionan

/**
 * Funde todas las mallas estáticas de `group` en una malla por material.
 * Las piezas animadas (banderas, cristales) se conservan aparte.
 * Con `key`, la geometría fusionada se reutiliza entre copias iguales (torres del mismo nivel).
 */
export function bake(group: THREE.Group, key?: string): THREE.Group {
  const out = new THREE.Group();
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const keep: THREE.Object3D[] = [];
  const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  group.traverse(o => {
    if (o === group) return;
    let p: THREE.Object3D | null = o;
    while (p && p !== group) { if (KEEP.has(p.name)) { if (p === o) keep.push(o); return; } p = p.parent; }
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material) || skinnedMesh(m)) return;
    if (key && bakeCache.has(key)) return;
    const g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const attrs = Object.keys(g.attributes).sort().join(',') + (g.index ? ':i' : '');
    const k = m.material.uuid + '|' + attrs;
    if (!buckets.has(k)) buckets.set(k, { mat: m.material, geos: [] });
    buckets.get(k)!.geos.push(g);
  });
  let parts = key ? bakeCache.get(key) : undefined;
  if (!parts) {
    parts = [...buckets.values()].map(b => ({ geo: b.geos.length > 1 ? mergeGeometries(b.geos)! : b.geos[0], mat: b.mat }));
    if (key) bakeCache.set(key, parts);
  }
  for (const { geo, mat } of parts) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    out.add(mesh);
  }
  // las piezas animadas se pasan tal cual, conservando su posición
  for (const o of keep) {
    o.updateMatrixWorld(true);
    const mtx = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    o.removeFromParent();
    mtx.decompose(o.position, o.quaternion, o.scale);
    out.add(o);
  }
  return out;
}
