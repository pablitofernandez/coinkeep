// ============================================================
//  Modelos procedurales que no vienen de los packs de Kenney:
//  mesas, parcelas, la caseta del perro y la moneda.
//  (personajes, torres, castillo y cabaña están en kit.ts)
// ============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, opts: { rough?: number; metal?: number; emissive?: string } = {}) {
  const key = `${color}|${opts.rough ?? 0.85}|${opts.metal ?? 0}|${opts.emissive ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0, flatShading: true,
      emissive: opts.emissive ?? '#000000',
    });
    matCache.set(key, m);
  }
  return m;
}

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------
//  Detalles comunes para "subir de nivel" la caseta
// ------------------------------------------------------------
const GOLD = () => mat('#ffcc33', { metal: 0.7, rough: 0.3, emissive: '#3a2a00' });
const CRYSTAL = () => mat('#7fe7ff', { rough: 0.2, emissive: '#2a8fb0' });

/** Mástil con banderín (la tela se llama 'flag' para que el render la haga ondear). */
function pennant(g: THREE.Group, x: number, y: number, z: number, color: string, h = 0.5, named = false) {
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, h, 5), mat('#5a3a1e'), x, y + h / 2, z));
  const f = mesh(new THREE.BoxGeometry(0.26, 0.16, 0.02), mat(color), x + 0.13, y + h - 0.1, z);
  if (named) f.name = 'flag';
  g.add(f);
}

/** Cristal brillante flotando (nivel máximo). */
function crystal(g: THREE.Group, y: number, size = 0.14, x = 0, z = 0) {
  const c = mesh(new THREE.OctahedronGeometry(size, 0), CRYSTAL(), x, y, z);
  c.name = 'crystal';
  g.add(c);
}

// ------------------------------------------------------------
//  Mesa del botín de cada torre
// ------------------------------------------------------------
export function makeTable(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat('#8a5a2b');
  g.add(mesh(new THREE.BoxGeometry(0.8, 0.07, 0.55), wood, 0, 0.36, 0));
  const leg = new THREE.BoxGeometry(0.06, 0.34, 0.06);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.add(mesh(leg, mat('#6e4520'), x * 0.33, 0.17, z * 0.22));
  return g;
}

// ------------------------------------------------------------
//  Parcela de construcción
// ------------------------------------------------------------
let frameGeo: THREE.BufferGeometry | null = null;
function padFrameGeo() {
  if (frameGeo) return frameGeo;
  const parts: THREE.BufferGeometry[] = [];
  const side = 0.7;
  for (let i = 0; i < 4; i++) {
    for (let k = -2; k <= 2; k++) {
      const d = new THREE.BoxGeometry(0.22, 0.04, 0.06);
      const along = k * 0.3;
      if (i >= 2) d.rotateY(Math.PI / 2);
      if (i === 0) d.translate(along, 0.03, -side);
      if (i === 1) d.translate(along, 0.03, side);
      if (i === 2) d.translate(-side, 0.03, along);
      if (i === 3) d.translate(side, 0.03, along);
      parts.push(d);
    }
  }
  frameGeo = mergeGeometries(parts)!;
  return frameGeo;
}

export interface PadModel { root: THREE.Group; fill: THREE.Mesh; frame: THREE.Group; frameMat: THREE.MeshBasicMaterial }
export function makePad(): PadModel {
  const root = new THREE.Group();
  const base = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, depthWrite: false }));
  base.rotation.x = -Math.PI / 2; base.position.y = 0.02;
  root.add(base);
  const fillMat = new THREE.MeshBasicMaterial({ color: '#ffd34d', transparent: true, opacity: 0.6, depthWrite: false });
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), fillMat);
  fill.rotation.x = -Math.PI / 2; fill.position.y = 0.025;
  fill.geometry.translate(0, 0.7, 0);       // escalado desde un borde
  fill.position.z = 0.7;
  root.add(fill);
  // marco de "guiones": una sola malla (geometría compartida por todas las parcelas)
  const frame = new THREE.Group();
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  frame.add(new THREE.Mesh(padFrameGeo(), white));
  root.add(frame);
  return { root, fill, frame, frameMat: white };
}

// ------------------------------------------------------------
//  Caseta del perro
// ------------------------------------------------------------
/** Caseta del perro. Nivel 1..5 (sube al mejorar a los perros). */
export function makeKennel(level = 1): THREE.Group {
  const g = new THREE.Group();
  const L = Math.max(1, Math.min(5, level));
  const one = (s: number, woodColor: string, roofMat: THREE.Material) => {
    const k = new THREE.Group();
    const wood = mat(woodColor);
    k.add(mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), wood, 0, 0.25, 0));
    // tejado a dos aguas
    const r1 = mesh(new THREE.BoxGeometry(0.5, 0.05, 0.82), roofMat, -0.2, 0.62, 0); r1.rotation.z = 0.7;
    const r2 = mesh(new THREE.BoxGeometry(0.5, 0.05, 0.82), roofMat, 0.2, 0.62, 0); r2.rotation.z = -0.7;
    k.add(r1, r2);
    // frontón y puerta (mira hacia +z, hacia la cámara)
    const gable = new THREE.Shape();
    gable.moveTo(-0.35, 0); gable.lineTo(0.35, 0); gable.lineTo(0, 0.32); gable.lineTo(-0.35, 0);
    const gableGeo = new THREE.ShapeGeometry(gable);
    const front = mesh(gableGeo, wood, 0, 0.5, 0.351);
    const back = mesh(gableGeo, wood, 0, 0.5, -0.351); back.rotation.y = Math.PI;
    k.add(front, back);
    k.add(mesh(new THREE.BoxGeometry(0.3, 0.32, 0.02), mat('#2a1a0e'), 0, 0.18, 0.355));
    k.scale.setScalar(s);
    return k;
  };
  const roof = L >= 5 ? GOLD() : mat(L >= 3 ? '#2f5fc4' : '#c0392b');
  const main = one(1 + (L - 1) * 0.12, L >= 3 ? '#e2c48e' : '#c98b4a', roof);
  g.add(main);
  // cuenco
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.06, 10), mat('#3a6ccf'), 0.48, 0.03, 0.35));
  // hueso sobre la puerta (nivel 2+)
  if (L >= 2) {
    const s = 1 + (L - 1) * 0.12, bone = mat('#f3e9d2');
    g.add(mesh(new THREE.BoxGeometry(0.22, 0.05, 0.03), bone, 0, 0.42 * s, 0.37 * s));
    for (const x of [-0.11, 0.11]) g.add(mesh(new THREE.SphereGeometry(0.04, 6, 4), bone, x, 0.42 * s, 0.37 * s));
  }
  // valla (nivel 3+)
  if (L >= 3) {
    const post = new THREE.BoxGeometry(0.05, 0.22, 0.05), w = mat('#8a5a2b');
    for (let k = -3; k <= 3; k++) {
      g.add(mesh(post, w, k * 0.18, 0.11, -0.65));
      g.add(mesh(post, w, -0.75, 0.11, k * 0.18 - 0.1));
    }
    g.add(mesh(new THREE.BoxGeometry(1.15, 0.04, 0.03), w, 0, 0.17, -0.65));
    g.add(mesh(new THREE.BoxGeometry(0.03, 0.04, 1.15), w, -0.75, 0.17, -0.1));
  }
  // segunda caseta (nivel 4+)
  if (L >= 4) {
    const second = one(0.75, '#c98b4a', roof);
    second.position.set(0.15, 0, -1.0);
    g.add(second);
  }
  if (L >= 5) { pennant(g, -0.5, 0.6, 0.3, '#ffcc33', 0.6, true); crystal(g, 1.35, 0.12); }
  return g;
}

// ------------------------------------------------------------
//  Geometrías compartidas para instancias / efectos
// ------------------------------------------------------------
export const coinGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.05, 12);
export const coinMat = new THREE.MeshStandardMaterial({ color: '#ffcc33', metalness: 0.7, roughness: 0.3, emissive: '#5a3d00', flatShading: true });
