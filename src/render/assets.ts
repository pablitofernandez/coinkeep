// ============================================================
//  3D models (Kenney, CC0). All are loaded at startup and then
//  cloned: clones share geometry and materials.
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const FILES: Record<string, string[]> = {
  chars: ['character-male-b'],
  // KayKit Adventurers: the rogue (player), its weapons and the "Rig_Medium" skeleton animations
  kaykit: ['Rogue', 'Rig_Medium_General', 'Rig_Medium_MovementBasic', 'dagger.gltf', 'crossbow_1handed.gltf'],
  // KayKit Skeletons (same Rig_Medium skeleton as the rogue: they share animations)
  skeletons: ['Skeleton_Warrior', 'Skeleton_Minion', 'Skeleton_Mage', 'Skeleton_Blade.gltf', 'Skeleton_Axe.gltf', 'Skeleton_Staff.gltf', 'Skeleton_Shield_Small_A.gltf'],
  // Quaternius Animated Monster Pack (converted from FBX to GLB): bat
  monsters: ['bat'],
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

// The Nature Kit comes in turquoise pastel tones: remap them to the game's palette
const NATURE_COLORS: Record<string, string> = {
  grass: '#5aa843', leafsGreen: '#4c9e3f', leafsDark: '#2f7a36', stone: '#a3a3ad', dirt: '#8f7652',
  woodBark: '#7a5232', woodBarkDark: '#5e3e26', woodInner: '#d9b98c',
};
const assets = new Map<string, Asset>();
// A single material per pack and name: that way pieces can be merged into one mesh
const sharedMats = new Map<string, THREE.Material>();

/** Loads all models. `onProgress` receives 0..1. */
export async function loadAssets(onProgress: (k: number) => void = () => {}) {
  const loader = new GLTFLoader();
  const list = Object.entries(FILES).flatMap(([dir, names]) => names.map(n => ({ dir, n })));
  let done = 0;
  await Promise.all(list.map(async ({ dir, n: file }) => {
    // no extension means .glb; .gltf files are registered under the name without extension
    const n = file.replace(/\.gltf$/, '');
    const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${dir}/${file.includes('.') ? file : file + '.glb'}`);
    let skinned = false;
    gltf.scene.traverse(o => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.castShadow = true;
        m.receiveShadow = true;
        if ((m as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
        // Kenney models come somewhat metallic; matte looks better in this style
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
    if (skinned) mergeParts(gltf.scene);
    assets.set(n, { scene: gltf.scene, clips: gltf.animations, skinned });
    onProgress(++done / list.length);
  }));
}

const skinnedMesh = (m: THREE.Mesh) => (m as THREE.SkinnedMesh).isSkinnedMesh === true;

/** What has to match for two meshes to be drawn as one: same look and, if skinned, same skeleton and bind pose. */
function partKey(m: THREE.Mesh): string | null {
  if (Array.isArray(m.material)) return null;
  const s = m.material as THREE.MeshStandardMaterial;
  const look = [s.type, s.color?.getHexString(), s.map?.uuid, s.transparent, s.side, s.vertexColors, s.emissive?.getHexString(), s.opacity].join('|');
  const g = m.geometry;
  const attrs = Object.keys(g.attributes).sort().join(',') + (g.index ? '+i' : '');
  if (!skinnedMesh(m)) return `${m.parent?.uuid}|static|${look}|${attrs}`;
  const sk = m as THREE.SkinnedMesh;
  return `${m.parent?.uuid}|${sk.skeleton.bones.map(b => b.uuid).join(',')}|${sk.bindMatrix.elements.join(',')}|${m.matrix.elements.join(',')}|${look}|${attrs}`;
}

/**
 * Merges the sibling parts of a character that share material (and skeleton): each part is a draw call,
 * twice with shadows. The bat converted from FBX came in 101 pieces of 5 colours (~200 draw calls per bat:
 * with a dozen bats on screen the game dropped to a crawl); KayKit skeletons come in ~9 parts.
 */
function mergeParts(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const groups = new Map<string, THREE.Mesh[]>();
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const key = partKey(m);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  });
  for (const parts of groups.values()) {
    if (parts.length < 2) continue;
    const first = parts[0], parent = first.parent!;
    const skinned = skinnedMesh(first);
    // skinned parts are already in the same bind space; static ones get their local transform baked in
    const geos = parts.map(p => skinned ? p.geometry : p.geometry.clone().applyMatrix4(p.matrix));
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    let mesh: THREE.Mesh;
    if (skinned) {
      const sk = first as THREE.SkinnedMesh;
      const sm = new THREE.SkinnedMesh(merged, first.material);
      sm.position.copy(first.position); sm.quaternion.copy(first.quaternion); sm.scale.copy(first.scale);
      sm.bind(sk.skeleton, sk.bindMatrix);
      mesh = sm;
    } else {
      mesh = new THREE.Mesh(merged, first.material);
    }
    mesh.name = first.name;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    parent.add(mesh);
    for (const p of parts) p.removeFromParent();
  }
}

function get(name: string): Asset {
  const a = assets.get(name);
  if (!a) throw new Error('Model not loaded: ' + name);
  return a;
}

/** Copy of a static model (shares geometry and materials). */
export function model(name: string): THREE.Group {
  return get(name).scene.clone(true);
}

/** Animated character: model + mixer with all its animations. */
export class Character {
  readonly root = new THREE.Group();
  readonly mixer: THREE.AnimationMixer;
  readonly actions = new Map<string, THREE.AnimationAction>();
  readonly mats: THREE.MeshStandardMaterial[] = [];
  private current: THREE.AnimationAction | null = null;
  private oneShot: THREE.AnimationAction | null = null;

  /** `clipsFrom`: other models whose animations are added (same skeleton, e.g. KayKit's Rig_Medium). */
  constructor(name: string, scale = 1, ownMaterials = false, clipsFrom: string[] = []) {
    const a = get(name);
    const obj = cloneSkinned(a.scene) as THREE.Group;
    obj.scale.setScalar(scale);
    // own materials if they need to flash without affecting the others
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

  /** Finds a bone / node by name (to attach weapons). */
  bone(name: string): THREE.Object3D | undefined {
    return this.root.getObjectByName(name);
  }

  /** Creates a new animation `as` with only the tracks of the given bones (e.g. torso and arms). */
  upperBody(clip: string, as: string, bones: string[]) {
    const src = this.actions.get(clip)?.getClip();
    if (!src) return;
    const tracks = src.tracks.filter(t => bones.includes(t.name.slice(0, t.name.lastIndexOf('.'))));
    this.actions.set(as, this.mixer.clipAction(new THREE.AnimationClip(as, src.duration, tracks)));
  }

  /** Looping animation (with a smooth crossfade). */
  play(name: string, timeScale = 1, fade = 0.15) {
    const act = this.actions.get(name);
    if (!act) return;
    act.timeScale = timeScale;
    if (act === this.current) return;
    act.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = act;
  }

  /** One-shot animation on top of the current one (hit, shot, death). */
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
 * Turns a model into instanced meshes (one per sub-mesh of the model).
 * For hundreds of trees or flowers with very few draw calls.
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
//  Merging of static pieces (far fewer draw calls)
// ------------------------------------------------------------
const bakeCache = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material }[]>();
const KEEP = new Set(['flag', 'crystal']);   // animated pieces: not merged

/**
 * Merges all static meshes of `group` into one mesh per material.
 * Animated pieces (flags, crystals) are kept separate.
 * With `key`, the merged geometry is reused across identical copies (towers of the same level).
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
  // animated pieces are passed through as they are, keeping their position
  for (const o of keep) {
    o.updateMatrixWorld(true);
    const mtx = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    o.removeFromParent();
    mtx.decompose(o.position, o.quaternion, o.scale);
    out.add(o);
  }
  return out;
}
