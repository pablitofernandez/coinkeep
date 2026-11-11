// ============================================================
//  3D render: scene, orthographic isometric camera, lights,
//  and syncing of the state's entities with meshes.
// ============================================================
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { LabelRenderer } from './labels';
import { BASE, PAD_INFO, WORLD } from '../config';
import { t } from '../i18n';
import type { GameEvent, GameState, HelperKind, Point3 } from '../game/types';
import {
  coinGeo, coinMat, makeKennel, makePad, makeTable, mat,
  type PadModel,
} from './models';
import { bake, instanced, type Character } from './assets';
import { DebugDraw } from './debugDraw';
import {
  aimCrossbow, makeArrowK, makeBallK, makeDogK, makeCastleK, makeHutK, makeKnight, makeTower, makeWorker, makeEnemy, type EnemyModel,
  type KnightModel, type TowerModel,
} from './kit';

// Camera direction (from the target). With x = z you get the classic isometric view.
const CAM_OFFSET = new THREE.Vector3(12, 14, 12);
export const CAM_ELEVATION_SIN = CAM_OFFSET.y / CAM_OFFSET.length();

const MAX_COINS = 4000;
const STACK_STEP = 0.055;   // vertical spacing of the coins in the stack
const SHOOT_POSE = 0.5;     // seconds the crossbow shooting gesture lasts

function label(className: string, html = ''): CSS2DObject {
  const el = document.createElement('div');
  el.className = className;
  el.innerHTML = html;
  return new CSS2DObject(el);
}
const MOBILE = window.matchMedia('(pointer: coarse)').matches;
// Write to the DOM only when the value changes (every write forces layout work)
const domCache = new WeakMap<HTMLElement, string>();
function setText(el: HTMLElement, v: string) { if (domCache.get(el) !== v) { domCache.set(el, v); el.textContent = v; } }
function setWidth(el: HTMLElement, pct: number) {
  const v = Math.round(pct) + '%';
  if (domCache.get(el) !== v) { domCache.set(el, v); el.style.width = v; }
}
function removeLabels(obj: THREE.Object3D) {
  obj.traverse(o => { if (o instanceof CSS2DObject) o.element.remove(); });
}
const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const lerpAngle = (a: number, b: number, k: number) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

// Shared geometry for the walking dust
const PUFF_GEO = new THREE.IcosahedronGeometry(1, 1);

interface Flyer { from: Point3; to: Point3 | 'player'; t: number; dur: number }
interface FloatText { obj: CSS2DObject; x: number; y: number; z: number; life: number }
interface Fx { obj: THREE.Object3D; life: number; max: number; update: (k: number) => void; own?: THREE.Material }

export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly labels: LabelRenderer;
  /** Milliseconds per frame (smoothed average): 3D drawing and HTML labels. Shown by the dev menu. */
  readonly timing = { gl: 0, labels: 0 };
  /**
   * How many frames between shadow map recomputes. On mobile, 2: almost half the draw calls.
   * Static things don't change; moving things update their shadow at 30 fps (barely noticeable from above).
   */
  shadowEvery = MOBILE ? 2 : 1;
  private frameNo = 0;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  /** Debug lines (dev menu). */
  readonly debug: DebugDraw;
  private sun: THREE.DirectionalLight;
  private camTarget = new THREE.Vector3();
  private time = 0;

  private player: KnightModel;
  private lastAttackT = 0;
  private propsRef: GameState['props'] | null = null;
  private propMeshes: THREE.InstancedMesh[] = [];
  private shootT = SHOOT_POSE;    // time since the last crossbow shot
  private playerCoinsLabel: CSS2DObject;
  private castle: THREE.Group;
  private castleLevel = 1;
  private castlePop = 1;
  private castleHp: CSS2DObject;
  private castleShake = 0;
  private coins: THREE.InstancedMesh;

  private enemies = new Map<number, { em: EnemyModel; ch: Character; hp: CSS2DObject; flash: string; castT: number }>();
  // dead enemies still visibly falling
  private dying: { ch: Character; t: number; y0: number }[] = [];
  private towers = new Map<number, { m: TowerModel; table: THREE.Group; tableLabel: CSS2DObject; stars: CSS2DObject; born: number; level: number; topY: number }>();
  private pads = new Map<number, { m: PadModel; label: CSS2DObject; pop: number }>();
  private shots = new Map<number, THREE.Object3D>();
  private helpers = new Map<number, {
    ch: Character;
    born: number; anim: number;
  }>();
  private homes = new Map<HelperKind, { obj: THREE.Group; level: number; born: number }>();
  // waving flags and spinning crystals (registered when each building is created)
  private padArrow: HTMLElement;
  private flags = new Set<THREE.Object3D>();
  private crystals = new Set<THREE.Object3D>();
  private flyers: Flyer[] = [];
  private texts: FloatText[] = [];
  private fx: Fx[] = [];
  private dustT = 0;

  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler();
  private tmpS = new THREE.Vector3(1, 1, 1);
  private tmpP = new THREE.Vector3();

  constructor(container: HTMLElement) {
    // --- renderers
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // on mobile the internal resolution is lowered: it's what costs the most (and heats up)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MOBILE ? 1.25 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.labels = new LabelRenderer();
    this.labels.domElement.className = 'labels';
    container.appendChild(this.labels.domElement);
    this.padArrow = document.createElement('div');
    this.padArrow.className = 'pad-arrow';
    this.padArrow.style.display = 'none';
    container.appendChild(this.padArrow);

    // --- camera
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);

    // --- scene and lights
    this.scene.add(new THREE.HemisphereLight('#dff1ff', '#55703a', 1.4));
    this.sun = new THREE.DirectionalLight('#fff1d6', 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 60;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.buildWorld();
    this.debug = new DebugDraw(this.scene);

    // --- castle
    this.castle = this.addAnimated(makeCastleK(1));
    this.castle.position.set(BASE.x, 0, BASE.y);
    this.castleHp = label('hpbar big', '<div></div>');
    this.castleHp.position.set(BASE.x, new THREE.Box3().setFromObject(this.castle).max.y + 0.35, BASE.y);
    this.scene.add(this.castleHp);

    // --- player
    this.player = makeKnight();
    this.scene.add(this.player.ch.root);
    this.playerCoinsLabel = label('stack-count');
    this.scene.add(this.playerCoinsLabel);

    // --- coins (a single instanced mesh for all of them)
    this.coins = new THREE.InstancedMesh(coinGeo, coinMat, MAX_COINS);
    this.coins.castShadow = true;
    this.coins.frustumCulled = false;
    this.coins.count = 0;
    this.scene.add(this.coins);

    this.resize();
  }

  // ------------------------------------------------------------
  //  Static world: ground, edge, trees and rocks
  // ------------------------------------------------------------
  private buildWorld() {
    const R = WORLD.forestRadius;
    // irregular outline (for the clearing and the forest edge)
    const blobPts = (radius: number, jitter: number, seed: number, n = 28) => {
      const pts: THREE.Vector2[] = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const r = radius + Math.sin(a * 3 + seed) * jitter + Math.sin(a * 7 + seed * 2) * jitter * 0.5;
        pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
      }
      return pts;
    };
    const flat = (geo: THREE.BufferGeometry, color: string, y: number) => {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 1 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(BASE.x, y, BASE.y);
      m.receiveShadow = true;
      this.scene.add(m);
    };

    // ground: huge flat color (its edge is never visible)
    this.scene.background = new THREE.Color('#2f5f2a');
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.size, WORLD.size), new THREE.MeshStandardMaterial({ color: '#5c9e4b', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(BASE.x, 0, BASE.y);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // darker forest floor, with a sharp irregular edge
    const half = WORLD.size / 2;
    const forestFloor = new THREE.Shape([new THREE.Vector2(-half, -half), new THREE.Vector2(half, -half), new THREE.Vector2(half, half), new THREE.Vector2(-half, half)]);
    forestFloor.holes.push(new THREE.Path(blobPts(R - 0.4, 0.6, 3.1, 40)));
    flat(new THREE.ShapeGeometry(forestFloor), '#447f38', 0.003);

    // dirt clearing around the base
    const seed = Math.random() * 10, cr = WORLD.clearingRadius;
    flat(new THREE.ShapeGeometry(new THREE.Shape(blobPts(cr + 0.15, 0.35, seed))), '#8f7a4f', 0.004);
    flat(new THREE.ShapeGeometry(new THREE.Shape(blobPts(cr, 0.35, seed))), '#c4ae7c', 0.008);

    // random position in a ring around the base
    const ring = (r0: number, r1: number) => {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(r0 * r0 + Math.random() * (r1 * r1 - r0 * r0));
      return { x: BASE.x + Math.cos(a) * r, z: BASE.y + Math.sin(a) * r };
    };

    // grass tufts in the clearing
    const bladeGeo = new THREE.ConeGeometry(0.045, 0.22, 3);
    bladeGeo.translate(0, 0.11, 0);
    const grassColors = ['#4a8a3b', '#6fb556', '#3f7d33', '#7cc25f'].map(c => new THREE.Color(c));
    const tufts = 900, perTuft = 3;
    const blades = new THREE.InstancedMesh(bladeGeo, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), tufts * perTuft);
    let bi = 0;
    for (let n = 0; n < tufts; n++) {
      const { x, z } = ring(cr + 0.6, R + 1);
      const col = grassColors[Math.floor(Math.random() * grassColors.length)];
      for (let k = 0; k < perTuft; k++) {
        this.tmpP.set(x + (Math.random() - 0.5) * 0.14, 0, z + (Math.random() - 0.5) * 0.14);
        this.tmpQ.setFromEuler(this.tmpE.set((Math.random() - 0.5) * 0.6, Math.random() * Math.PI, (Math.random() - 0.5) * 0.6));
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS.setScalar(0.7 + Math.random() * 0.6));
        blades.setMatrixAt(bi, this.tmpM);
        blades.setColorAt(bi, col);
        bi++;
      }
    }
    blades.count = bi;
    blades.receiveShadow = true;
    this.scene.add(blades);

    // placement matrices (position, random rotation and scale)
    const place = (x: number, z: number, scale: number, tilt = 0) => {
      this.tmpQ.setFromEuler(this.tmpE.set((Math.random() - 0.5) * tilt, Math.random() * Math.PI * 2, (Math.random() - 0.5) * tilt));
      return new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), this.tmpQ.clone(), new THREE.Vector3(scale, scale, scale));
    };
    // spreads positions across several models and adds them as instanced meshes
    const scatter = (names: string[], spots: THREE.Matrix4[], shadows: boolean, skip: string[] = []) => {
      const groups = names.map(() => [] as THREE.Matrix4[]);
      spots.forEach((m, k) => groups[k % names.length].push(m));
      names.forEach((n, k) => { if (groups[k].length) for (const im of instanced(n, groups[k], shadows, skip)) this.scene.add(im); });
    };

    // flowers, mushrooms and bushes around the clearing
    const deco = (n: number, r0: number, r1: number, s0: number, s1: number) =>
      Array.from({ length: n }, () => { const { x, z } = ring(r0, r1); return place(x, z, s0 + Math.random() * (s1 - s0)); });
    scatter(['flower_redA', 'flower_yellowA', 'flower_purpleA'], deco(240, cr + 0.6, R - 0.5, 0.9, 1.3), false);
    scatter(['mushroom_red', 'mushroom_tanGroup'], deco(40, cr + 2, R + 1, 0.9, 1.4), false);
    scatter(['plant_bush', 'plant_bushSmall'], deco(70, cr + 1.5, R + 1.5, 1.2, 2.0), false);

    // dense forest: jittered grid, with an irregular edge
    const outer = 30, step = 1.2;    // the camera never reaches beyond this
    const edge = (a: number) => R + Math.sin(a * 3 + 3.1) * 0.6 + Math.sin(a * 7 + 6.2) * 0.3;
    const edgeSpots: THREE.Matrix4[] = [], deepSpots: THREE.Matrix4[] = [];
    for (let gx = -outer; gx <= outer; gx += step) for (let gz = -outer; gz <= outer; gz += step) {
      const x = gx + (Math.random() - 0.5) * step * 0.8, z = gz + (Math.random() - 0.5) * step * 0.8;
      const r = Math.hypot(x, z);
      if (r > outer || r < edge(Math.atan2(z, x))) continue;
      const sc = 1.0 + Math.random() * 0.6 + Math.min(0.5, (r - R) * 0.03);
      (r < R + 3.5 ? edgeSpots : deepSpots).push(place(BASE.x + x, BASE.y + z, sc, 0.12));
    }
    // forest edge: variety and shadows; deeper in, the simplest models without shadows (much cheaper)
    scatter(['tree_pineDefaultA', 'tree_pineRoundA', 'tree_default', 'tree_pineDefaultB', 'tree_oak', 'tree_pineRoundB', 'tree_cone'], edgeSpots, !MOBILE);
    // in the deep forest trunks aren't visible: canopies only
    scatter(['tree_pineTallA', 'tree_pineTallB', 'tree_pineTallC', 'tree_pineTallD', 'tree_fat'], deepSpots, false, ['woodBark', 'woodBarkDark']);
    // lone trees, rocks, stumps and logs in the clearing are placed by the simulation (they're solid): see syncProps
  }

  /** Trees, rocks, stumps and logs in the clearing: draws them where the simulation put them (they change every game). */
  private syncProps(G: GameState) {
    if (this.propsRef === G.props) return;
    this.propsRef = G.props;
    for (const m of this.propMeshes) { this.scene.remove(m); m.dispose(); }
    this.propMeshes = [];
    const byModel = new Map<string, THREE.Matrix4[]>();
    for (const p of G.props) {
      this.tmpQ.setFromEuler(this.tmpE.set(0, p.rot, 0));
      const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0, p.y), this.tmpQ.clone(), new THREE.Vector3(p.scale, p.scale, p.scale));
      (byModel.get(p.model) ?? byModel.set(p.model, []).get(p.model)!).push(m);
    }
    for (const [name, list] of byModel) for (const im of instanced(name, list, true)) {
      this.scene.add(im);
      this.propMeshes.push(im);
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    // in landscape ~14 tiles are visible vertically; in portrait a minimum width is guaranteed
    const halfH = Math.max(6.5, 5.2 * h / w);
    const halfW = halfH * w / h;
    this.camera.left = -halfW; this.camera.right = halfW;
    this.camera.top = halfH; this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  /** Camera zoom (1 = normal; lower = farther). Dev menu. */
  setZoom(z: number) {
    this.camera.zoom = z;
    this.camera.updateProjectionMatrix();
  }

  /** Adds an object to the scene and registers its flags and crystals for animation. */
  private addAnimated<T extends THREE.Object3D>(obj: T): T {
    obj.traverse(o => { if (o.name === 'flag') this.flags.add(o); if (o.name === 'crystal') this.crystals.add(o); });
    this.scene.add(obj);
    return obj;
  }
  private removeAnimated(obj: THREE.Object3D) {
    obj.traverse(o => { this.flags.delete(o); this.crystals.delete(o); });
    this.scene.remove(obj);
  }

  private setCastleLevel(level: number, pop = true) {
    if (level === this.castleLevel) return;
    this.castleLevel = level;
    this.removeAnimated(this.castle);
    this.castle = this.addAnimated(makeCastleK(level));
    this.castle.position.set(BASE.x, 0, BASE.y);
    this.castleHp.position.y = new THREE.Box3().setFromObject(this.castle).max.y + 0.35;
    if (pop) this.castlePop = 0.55;
  }

  /** Resets everything dynamic (when starting a new game). */
  reset(G: GameState) {
    for (const { ch, hp } of this.enemies.values()) { removeLabels(hp); this.scene.remove(ch.root); ch.dispose(); }
    for (const d of this.dying) { this.scene.remove(d.ch.root); d.ch.dispose(); }
    this.dying = [];
    for (const t of this.towers.values()) { removeLabels(t.table); t.stars.element.remove(); this.removeAnimated(t.m.root); this.scene.remove(t.table, t.stars); }
    for (const p of this.pads.values()) { removeLabels(p.m.root); this.scene.remove(p.m.root); }
    for (const s of this.shots.values()) this.scene.remove(s);
    for (const t of this.texts) t.obj.element.remove(), this.scene.remove(t.obj);
    for (const f of this.fx) { this.scene.remove(f.obj); f.own?.dispose(); }
    for (const v of this.helpers.values()) this.scene.remove(v.ch.root);
    for (const h of this.homes.values()) this.removeAnimated(h.obj);
    this.helpers.clear(); this.homes.clear();
    this.setCastleLevel(1, false);
    this.enemies.clear(); this.towers.clear(); this.pads.clear(); this.shots.clear();
    this.flyers = []; this.texts = []; this.fx = [];
    this.camTarget.set(G.player.x, 0, G.player.y);
  }

  // ------------------------------------------------------------
  //  Simulation events -> effects
  // ------------------------------------------------------------
  private handle(ev: GameEvent, G: GameState) {
    switch (ev.type) {
      case 'text': {
        const obj = label('float-text', ev.text);
        obj.element.style.color = ev.color;
        obj.element.style.fontSize = ev.size + 'px';
        this.scene.add(obj);
        this.texts.push({ obj, x: ev.x, y: ev.y, z: 1.6, life: 1.2 });
        break;
      }
      case 'coinFly':
        if (this.flyers.length < 150) this.flyers.push({ from: ev.from, to: ev.to, t: 0, dur: 0.3 + Math.random() * 0.2 });
        break;
      case 'baseHit':
        this.castleShake = 0.15;
        break;
      case 'padUpgraded': {
        const p = this.pads.get(ev.id);
        if (p) p.pop = 1;
        break;
      }
    }
  }

  // ------------------------------------------------------------
  //  Frame
  // ------------------------------------------------------------
  render(G: GameState, dt: number) {
    this.time += dt;
    for (const ev of G.events) this.handle(ev, G);
    G.events.length = 0;

    this.syncProps(G);
    this.syncPlayer(G, dt);
    this.syncEnemies(G, dt);
    this.syncTowers(G, dt);
    this.syncPads(G, dt);
    this.syncShots(G);
    this.syncHelpers(G, dt);
    this.syncCastle(G, dt);
    this.updateCoins(G, dt);
    this.updateFx(dt);
    this.updateCamera(G, dt);
    this.debug.update(G);

    // shadows on alternate frames (mobile). In between, the previous map is reused with its own
    // light matrix, so shadows of static things don't move even though the sun follows the player
    const sm = this.renderer.shadowMap;
    sm.autoUpdate = false;
    sm.needsUpdate = this.frameNo++ % this.shadowEvery === 0;
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    const t1 = performance.now();
    this.labels.render(this.scene, this.camera);
    const t2 = performance.now();
    this.timing.gl += (t1 - t0 - this.timing.gl) * 0.1;
    this.timing.labels += (t2 - t1 - this.timing.labels) * 0.1;
  }

  private syncPlayer(G: GameState, dt: number) {
    const p = G.player, m = this.player, ch = m.ch;
    ch.root.position.set(p.x, 0, p.y);
    // faces the target while attacking, otherwise where it's walking
    let fx = p.faceX, fy = p.faceY;
    if (p.attackT > 0 && p.target) { fx = p.target.x - p.x; fy = p.target.y - p.y; }
    ch.root.rotation.y = lerpAngle(ch.root.rotation.y, Math.atan2(fx, fy), Math.min(1, dt * 14));
    // walking dust (dirt-colored in the clearing, greenish on grass)
    this.dustT -= dt;
    if (p.moving && this.dustT <= 0) {
      this.dustT = 0.11;
      const onDirt = Math.hypot(p.x - BASE.x, p.y - BASE.y) < WORLD.clearingRadius;
      this.puffs(p.x - p.faceX * 0.15, p.y - p.faceY * 0.15, 0.05, onDirt ? '#d9c49b' : '#a9c98a', 1, 0.08, 0.45, 0.09);
    }
    // walk / run / idle
    if (p.moving) ch.play('Running_A', 1.1); else ch.play('Idle_A');
    // new attack: dagger slash or crossbow shot (waist up only)
    if (p.attackT > this.lastAttackT + 0.01) {
      if (p.weapon === 'sword') ch.once('slash', 3.4);
      else this.shootT = 0;
    }
    this.lastAttackT = p.attackT;
    ch.update(dt);
    // crossbow: raise the arm, hold aim, recoil on shooting, then lower it
    this.shootT = Math.min(SHOOT_POSE, this.shootT + dt);
    const t = this.shootT / SHOOT_POSE;
    const k = t >= 1 ? 0 : t < 0.15 ? t / 0.15 : t > 0.7 ? (1 - t) / 0.3 : 1;
    const recoil = t > 0.15 && t < 0.35 ? Math.sin((t - 0.15) / 0.2 * Math.PI) : 0;
    aimCrossbow(m, k, recoil);
  }

  private syncEnemies(G: GameState, dt: number) {
    const seen = new Set<number>();
    for (const e of G.enemies) {
      seen.add(e.id);
      let v = this.enemies.get(e.id);
      if (!v) {
        const em = makeEnemy(e.kind, e.boss);
        const ch = em.ch;
        // each one starts the animation at a different point (so they don't all walk in sync)
        ch.mixer.setTime(Math.random() * 2);
        const hp = label('hpbar', '<div></div>');
        hp.position.set(0, em.barY + e.fly, 0);
        ch.root.add(hp);
        this.scene.add(ch.root);
        v = { em, ch, hp, flash: '', castT: 0 };
        this.enemies.set(e.id, v);
      }
      const ch = v.ch;
      const dx = BASE.x - e.x, dy = BASE.y - e.y;
      const em = v.em;
      // flyers bob up and down a little as they flap their wings
      ch.root.position.set(e.x, e.fly ? e.fly + Math.sin(this.time * 6 + e.id) * 0.06 : 0, e.y);
      ch.root.rotation.y = Math.atan2(dx, dy);
      // when casting a heal, the mage plays its gesture on top of the walk animation
      if (em.cast && e.lunge > 0.5 && v.castT <= 0) { ch.once(em.cast, 1.4); v.castT = 0.6; }
      v.castT -= dt;
      if (e.attacking) ch.play(em.attack, 1 / (e.boss ? 1.5 : 2.0) * 1.6);
      else ch.play(em.walk, e.speed * em.walkRate);
      // when hit: white flash; when healed by a mage: green
      const flash = e.hit > 0 ? '#ffffff' : e.healed > 0 ? '#2fae4a' : '';
      if (flash !== v.flash) for (const m of ch.mats) m.emissive.set(flash || '#000000');
      v.flash = flash;
      ch.update(dt);
      v.hp.visible = e.hp < e.maxHp;
      setWidth(v.hp.element.firstChild as HTMLElement, Math.max(0, e.hp / e.maxHp * 100));
    }
    for (const [id, v] of this.enemies) if (!seen.has(id)) {
      // dies: falling animation, then sinks into the ground
      removeLabels(v.ch.root);
      v.ch.root.remove(v.hp);
      for (const m of v.ch.mats) m.emissive.set('#000000');
      v.ch.root.scale.setScalar(1);
      v.ch.once(v.em.die, 1.6, true);
      this.dying.push({ ch: v.ch, t: 0, y0: v.ch.root.position.y });
      this.enemies.delete(id);
    }
    for (const d of this.dying) {
      d.t += dt;
      d.ch.update(dt);
      // flyers drop to the ground; then they all sink into the earth
      if (d.y0 > 0) d.ch.root.position.y = Math.max(0, d.y0 - d.t * d.t * 6);
      if (d.t > 0.7) d.ch.root.position.y = -(d.t - 0.7) * 1.2;
    }
    for (const d of this.dying) if (d.t > 1.2) { this.scene.remove(d.ch.root); d.ch.dispose(); }
    this.dying = this.dying.filter(d => d.t <= 1.2);
    // with many deaths at once, the oldest ones are removed (performance)
    while (this.dying.length > 40) { const d = this.dying.shift()!; this.scene.remove(d.ch.root); d.ch.dispose(); }
  }

  private syncTowers(G: GameState, dt: number) {
    for (const b of G.buildings) {
      let v = this.towers.get(b.id);
      const build = (level: number) => {
        const m = makeTower(b.type, level);
        m.root.position.set(b.x, 0, b.y);
        this.addAnimated(m.root);
        return m;
      };
      if (!v) {
        const m = build(b.level);
        const table = bake(makeTable(), 'table');
        table.position.set(b.tx, 0, b.ty);
        const tableLabel = label('stack-count small');
        table.add(tableLabel);
        const stars = label('tower-stars');
        this.scene.add(table, stars);
        v = { m, table, tableLabel, stars, born: 0, level: b.level, topY: new THREE.Box3().setFromObject(m.root).max.y };
        this.towers.set(b.id, v);
      }
      if (v.level !== b.level) {
        // on upgrade the whole model is swapped for the new level's, with a bounce
        const headRot = v.m.head.rotation.y;
        this.removeAnimated(v.m.root);
        v.m = build(b.level);
        v.m.head.rotation.y = headRot;
        v.topY = new THREE.Box3().setFromObject(v.m.root).max.y;
        v.born = 0.55;
        v.level = b.level;
      }
      setText(v.stars.element, '★'.repeat(b.level - 1));
      v.stars.visible = b.level > 1;
      v.stars.position.set(b.x, v.topY + 0.35, b.y);
      v.born = Math.min(1, v.born + dt * 2);
      const s = Math.max(0.01, easeOutBack(v.born));
      v.m.root.scale.set(s, s, s);
      v.m.head.rotation.y = lerpAngle(v.m.head.rotation.y, Math.atan2(b.aimX, b.aimY), Math.min(1, dt * 10));
      const rows = Math.ceil(Math.min(b.table, 48) / 4);
      v.tableLabel.position.set(0, 0.55 + rows * STACK_STEP, 0);
      v.tableLabel.visible = b.table > 0;
      setText(v.tableLabel.element, fmt(b.table));
    }
  }

  private syncPads(G: GameState, dt: number) {
    const coins = G.player.coins;
    let nearest: { x: number; y: number } | null = null, nd = Infinity;
    for (const pad of G.pads) {
      let v = this.pads.get(pad.id);
      if (!v && pad.active) {
        const m = makePad();
        m.root.position.set(pad.x, 0, pad.y);
        const info = PAD_INFO[pad.type];
        const lbl = label('pad-label' + (pad.small ? ' small' : ''), `<div class="icon">${info.icon}</div><div class="cost"></div><div class="name"></div>`);
        lbl.position.set(0, 0.3, 0);
        m.root.add(lbl);
        this.scene.add(m.root);
        v = { m, label: lbl, pop: 1 };
        this.pads.set(pad.id, v);
      }
      if (!v) continue;
      if (!pad.active) { removeLabels(v.m.root); this.scene.remove(v.m.root); this.pads.delete(pad.id); continue; }
      v.pop = Math.max(0, v.pop - dt * 2);
      const s = (1 + Math.sin(v.pop * Math.PI * 3) * v.pop * 0.25) * (pad.small ? 0.72 : 1);
      v.m.root.scale.set(s, 1, s);
      v.m.fill.scale.y = Math.max(0.001, pad.paid / pad.cost);
      // can you afford it now? -> pulsing golden frame, and candidate for the arrow
      const affordable = coins > 0 && coins >= pad.cost - pad.paid;
      const pulse = (Math.sin(this.time * 6) + 1) / 2;
      v.m.frameMat.color.set(affordable ? '#ffd34d' : '#ffffff');
      if (affordable) v.m.frameMat.color.multiplyScalar(0.75 + pulse * 0.35);
      v.m.frame.position.y = affordable ? 0.03 + pulse * 0.06 : Math.sin(this.time * 3) * 0.02;
      if (affordable) {
        const d = Math.hypot(pad.x - G.player.x, pad.y - G.player.y);
        if (d < nd) { nd = d; nearest = pad; }
      }
      const el = v.label.element;
      if (el.dataset.aff !== String(affordable)) { el.dataset.aff = String(affordable); el.classList.toggle('affordable', affordable); }
      setText(el.children[1] as HTMLElement, fmt(pad.cost - pad.paid));
      let name = pad.level ? t('pad.level', { name: t(`pad.${pad.type}`), n: pad.level + 1 }) : t(`pad.${pad.type}`);
      if (pad.type === 'upgrade') {
        const b = G.buildings.find(x => x.id === pad.buildingId);
        name = b ? t('pad.towerTo', { n: b.level + 1 }) : name;
      }
      setText(el.children[2] as HTMLElement, name);
    }
    this.updatePadArrow(nearest);
  }

  /** Arrow at the screen edge pointing to the nearest affordable pad, if it's off-screen. */
  private updatePadArrow(target: { x: number; y: number } | null) {
    const a = this.padArrow;
    if (!target) { if (a.style.display !== 'none') a.style.display = 'none'; return; }
    const w = window.innerWidth, h = window.innerHeight, margin = 36;
    const p = this.tmpP.set(target.x, 0.3, target.y).project(this.camera);
    const sx = (p.x + 1) / 2 * w, sy = (1 - p.y) / 2 * h;
    const onScreen = sx > margin && sx < w - margin && sy > margin + 50 && sy < h - margin;
    if (onScreen) { if (a.style.display !== 'none') a.style.display = 'none'; return; }
    // edge point in the direction of the target (from the screen center)
    const cx = w / 2, cy = h / 2, dx = sx - cx, dy = sy - cy;
    const k = Math.min((w / 2 - margin) / Math.abs(dx || 1e-6), (h / 2 - margin - 25) / Math.abs(dy || 1e-6));
    const ax = cx + dx * k, ay = cy + 25 + dy * k;
    const ang = Math.atan2(dy, dx) * 180 / Math.PI + 90;
    a.style.display = 'block';
    a.style.transform = `translate(${ax.toFixed(0)}px, ${ay.toFixed(0)}px) translate(-50%, -50%) rotate(${ang.toFixed(0)}deg)`;
  }

  private syncShots(G: GameState) {
    const seen = new Set<number>();
    for (const s of G.shots) {
      seen.add(s.id);
      let o = this.shots.get(s.id);
      if (!o) { o = s.type === 'archer' ? makeArrowK() : makeBallK(); this.scene.add(o); this.shots.set(s.id, o); }
      const prev = o.position.clone();
      o.position.set(s.x, s.z, s.y);
      if (s.type === 'archer' && prev.distanceToSquared(o.position) > 1e-6) o.lookAt(prev.multiplyScalar(-1).add(o.position).add(o.position));
    }
    for (const [id, o] of this.shots) if (!seen.has(id)) { this.scene.remove(o); this.shots.delete(id); }
  }

  private syncHelpers(G: GameState, dt: number) {
    // kennels / huts: one per kind, the model changes with level
    for (const kind of ['dog', 'peon'] as const) {
      const level = G.helperLevels[kind];
      const first = G.helpers.find(h => h.kind === kind);
      if (!level || !first) continue;
      let home = this.homes.get(kind);
      if (!home || home.level !== level) {
        if (home) this.removeAnimated(home.obj);
        const obj = this.addAnimated(kind === 'dog' ? makeKennel(level) : makeHutK(level));
        obj.position.set(first.home.x, 0, first.home.y);
        home = { obj, level, born: home ? 0.55 : 0 };
        this.homes.set(kind, home);
      }
      home.born = Math.min(1, home.born + dt * 2);
      home.obj.scale.setScalar(Math.max(0.01, easeOutBack(home.born)));
    }

    for (const h of G.helpers) {
      let v = this.helpers.get(h.id);
      if (!v) {
        const ch = h.kind === 'dog' ? makeDogK() : makeWorker();
        this.scene.add(ch.root);
        v = { ch, born: 0, anim: 0 };
        this.helpers.set(h.id, v);
      }
      v.born = Math.min(1, v.born + dt * 2);
      const s = Math.max(0.01, easeOutBack(v.born));
      const ch = v.ch, root = ch.root;
      root.scale.setScalar(s);
      root.position.set(h.x, 0, h.y);
      root.rotation.y = lerpAngle(root.rotation.y, Math.atan2(h.faceX, h.faceY), Math.min(1, dt * 12));

      if (h.kind === 'dog') {
        // wolf: snap when biting; gallops when going after something, walks when following you
        if (h.attackT > 0 && v.anim <= 0) { ch.once('Attack', 2); v.anim = 0.35; }
        v.anim = Math.max(0, v.anim - dt);
        if (h.mode === 'attack' && !h.moving) ch.play('Idle');
        else if (h.moving) ch.play(h.mode === 'idle' ? 'Walk' : 'Gallop', h.mode === 'idle' ? 1.4 : 1.1);
        else ch.play('Idle');
        ch.update(dt);
      } else {
        // collecting from the table: pick-up gesture; if carrying coins, walks with arms full
        const working = h.mode === 'fetch' && !h.moving;
        if (working) ch.play('interact-right', 1.6);
        else if (h.moving) ch.play(h.carry > 0 ? 'holding-both' : 'walk', 1.5);
        else ch.play('idle');
        ch.update(dt);
      }
    }
  }

  private syncCastle(G: GameState, dt: number) {
    this.setCastleLevel(G.castleLevel);
    this.castlePop = Math.min(1, this.castlePop + dt * 2);
    this.castle.scale.setScalar(Math.max(0.01, easeOutBack(this.castlePop)));
    this.castleShake = Math.max(0, this.castleShake - dt);
    const s = this.castleShake > 0 ? (Math.random() - 0.5) * 0.08 : 0;
    this.castle.position.set(BASE.x + s, 0, BASE.y - s);
    // flags and crystals of every building
    for (const f of this.flags) f.rotation.y = Math.sin(this.time * 4 + f.id) * 0.3;
    for (const c of this.crystals) { c.rotation.y = this.time * 1.5; c.position.y += Math.sin(this.time * 2.5) * 0.002; }
    setWidth(this.castleHp.element.firstChild as HTMLElement, G.base.hp / G.base.max * 100);
  }

  // ------------------------------------------------------------
  //  Coins: ground, player stack, tables and flying ones
  // ------------------------------------------------------------
  private putCoin(i: number, x: number, y: number, z: number, rx = 0, ry = 0, scale = 1) {
    this.tmpP.set(x, y, z);
    this.tmpQ.setFromEuler(this.tmpE.set(rx, ry, 0));
    this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS.setScalar(scale));
    this.coins.setMatrixAt(i, this.tmpM);
  }

  private updateCoins(G: GameState, dt: number) {
    let i = 0;
    const p = G.player;
    // on the ground: spin and hover a little
    for (const c of G.drops) {
      if (i >= MAX_COINS) break;
      const hover = c.z > 0 ? c.z : 0.12 + Math.sin(this.time * 5 + c.id) * 0.04;
      this.putCoin(i++, c.x, hover, c.y, Math.PI / 2, this.time * 3 + c.id);
    }
    // stack on the back (at most 50 are drawn; the total goes in the label)
    const rot = this.player.ch.root.rotation.y;
    const bx = p.x - Math.sin(rot) * 0.3, bz = p.y - Math.cos(rot) * 0.3;
    const n = Math.min(p.coins, 50);
    const baseY = 0.6;          // mid-back of the rogue (over the cape)
    for (let k = 0; k < n && i < MAX_COINS; k++) {
      // the taller the stack, the more it sways (inertia when moving)
      const sway = (p.moving ? 1 : 0.3) * Math.sin(this.time * 6 - k * 0.08) * k * k * 0.00004;
      this.putCoin(i++, bx + p.faceX * -sway, baseY + k * STACK_STEP, bz + p.faceY * -sway, 0, k * 0.4);
    }
    this.playerCoinsLabel.position.set(bx, baseY + n * STACK_STEP + 0.35, bz);
    this.playerCoinsLabel.visible = p.coins > 0;
    setText(this.playerCoinsLabel.element, fmt(p.coins));
    // coins carried by helpers
    for (const h of G.helpers) {
      const v = this.helpers.get(h.id);
      if (!v || h.carry <= 0) continue;
      const rot = v.ch.root.rotation.y;
      const bodyY = 0;
      if (h.kind === 'dog') {
        // wolf: small coins on its back, so it stays visible
        const sx = h.x - Math.sin(rot) * 0.1, sz = h.y - Math.cos(rot) * 0.1;
        const n = Math.min(h.carry, 25);
        for (let k = 0; k < n && i < MAX_COINS; k++) {
          this.putCoin(i++, sx, 0.38 + k * STACK_STEP * 0.65, sz, 0, k * 0.5, 0.6);
        }
      } else {
        // peon: stack sticking out of the basket on its back
        const sx = h.x - Math.sin(rot) * 0.22, sz = h.y - Math.cos(rot) * 0.22;
        const n = Math.min(h.carry, 40);
        for (let k = 0; k < n && i < MAX_COINS; k++) {
          this.putCoin(i++, sx, 0.72 + bodyY + k * STACK_STEP * 0.8, sz, 0, k * 0.4, 0.8);
        }
      }
    }
    // tables: 4 columns
    for (const b of G.buildings) {
      const m = Math.min(b.table, 48);
      for (let k = 0; k < m && i < MAX_COINS; k++) {
        const col = k % 4, row = Math.floor(k / 4);
        const ox = col % 2 ? 0.17 : -0.17, oz = col > 1 ? 0.1 : -0.1;
        this.putCoin(i++, b.tx + ox, 0.42 + row * STACK_STEP, b.ty + oz, 0, k);
      }
    }
    // flying (parabolic arc)
    const playerTop: Point3 = { x: bx, y: bz, z: baseY + n * STACK_STEP };
    for (const f of this.flyers) {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      const to = f.to === 'player' ? playerTop : f.to;
      const x = f.from.x + (to.x - f.from.x) * k;
      const y = f.from.y + (to.y - f.from.y) * k;
      const z = f.from.z + (to.z - f.from.z) * k + Math.sin(k * Math.PI) * 1.2;
      if (i < MAX_COINS) this.putCoin(i++, x, z, y, k * 6, k * 4);
    }
    this.flyers = this.flyers.filter(f => f.t < f.dur);
    this.coins.count = i;
    this.coins.instanceMatrix.needsUpdate = true;
  }

  private updateFx(dt: number) {
    for (const t of this.texts) {
      t.life -= dt;
      t.z += dt * 1.2;
      t.obj.position.set(t.x, t.z, t.y);
      const op = Math.min(1, t.life * 2).toFixed(2);
      if (t.obj.element.style.opacity !== op) t.obj.element.style.opacity = op;
    }
    for (const t of this.texts) if (t.life <= 0) { t.obj.element.remove(); this.scene.remove(t.obj); }
    this.texts = this.texts.filter(t => t.life > 0);

    for (const f of this.fx) { f.life -= dt; f.update(1 - Math.max(0, f.life) / f.max); }
    for (const f of this.fx) if (f.life <= 0) { this.scene.remove(f.obj); f.own?.dispose(); }
    this.fx = this.fx.filter(f => f.life > 0);
  }

  // ------------------------------------------------------------
  //  Particles (shared geometries and materials: cheap)
  // ------------------------------------------------------------
  private canSpawn() { return this.fx.length < 260; }

  /** Little puffs of smoke or dust that grow, rise and fade away. */
  private puffs(x: number, y: number, size: number, color: string, n: number, spread: number, life: number, z = 0.12) {
    for (let i = 0; i < n && this.canSpawn(); i++) {
      const p = new THREE.Mesh(PUFF_GEO, mat(color));
      const a = Math.random() * Math.PI * 2, d = Math.random() * spread, l = life * (0.7 + Math.random() * 0.6);
      const ox = x + Math.cos(a) * d * 0.3, oy = y + Math.sin(a) * d * 0.3;
      p.scale.setScalar(0.001);
      this.scene.add(p);
      this.fx.push({ obj: p, life: l, max: l, update: k => {
        const e = 1 - (1 - k) * (1 - k);
        p.position.set(ox + Math.cos(a) * d * e, z + k * 0.35, oy + Math.sin(a) * d * e);
        p.scale.setScalar(size * Math.sin(Math.min(1, k * 1.4) * Math.PI) + 0.001);
      } });
    }
  }

  /** Title screen: camera angle orbiting the castle (null = normal game camera). */
  orbit: number | null = null;

  private updateCamera(G: GameState, dt: number) {
    if (this.orbit !== null) {
      // same height and tilt as in game, orbiting a point slightly behind the castle
      // (so the castle sits in the lower half of the screen, below the logo)
      const r = Math.hypot(CAM_OFFSET.x, CAM_OFFSET.z), a = this.orbit;
      const tx = BASE.x - Math.sin(a) * 3, tz = BASE.y - Math.cos(a) * 3;
      this.camTarget.set(tx, 0, tz);
      this.camera.position.set(tx + Math.sin(a) * r, CAM_OFFSET.y, tz + Math.cos(a) * r);
      this.camera.lookAt(tx, 0, tz);
      this.sun.position.set(tx - 6, 16, tz + 4);
      this.sun.target.position.set(tx, 0, tz);
      return;
    }
    const k = Math.min(1, dt * 6);
    this.camTarget.x += (G.player.x - this.camTarget.x) * k;
    this.camTarget.z += (G.player.y - this.camTarget.z) * k;
    const tx = this.camTarget.x, tz = this.camTarget.z;
    this.camera.position.set(tx + CAM_OFFSET.x, CAM_OFFSET.y, tz + CAM_OFFSET.z);
    this.camera.lookAt(tx, 0, tz);
    // the sun follows the player so the shadow map stays sharp
    this.sun.position.set(tx - 6, 16, tz + 4);
    this.sun.target.position.set(tx, 0, tz);
  }
}

export function fmt(n: number) { return n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.floor(n)); }
