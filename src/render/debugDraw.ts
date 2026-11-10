// ============================================================
//  Dibujo de depuración (menú de desarrollo): colisiones, alcances
//  y caminos de los ayudantes, con líneas sobre el suelo.
//  Una sola malla de líneas que se rellena cada fotograma.
// ============================================================
import * as THREE from 'three';
import { BASE, CASTLE_HALF, HELPERS, PLAYER, PLAYER_RADIUS } from '../config';
import { towerStats } from '../game/sim';
import type { GameState } from '../game/types';

export interface DebugOptions { colliders: boolean; ranges: boolean; paths: boolean }

const MAX_SEGMENTS = 60000;
const SEG = 24;            // segmentos por círculo
const Y = 0.06;            // altura de las líneas (justo sobre el suelo)

const C = {
  solid: new THREE.Color('#ff3b3b'),
  castle: new THREE.Color('#ff3bd1'),
  player: new THREE.Color('#3bff6a'),
  enemy: new THREE.Color('#ffb03b'),
  helper: new THREE.Color('#3bd1ff'),
  sword: new THREE.Color('#ffffff'),
  bow: new THREE.Color('#9be7ff'),
  archer: new THREE.Color('#ffe14d'),
  cannon: new THREE.Color('#ff7a3b'),
  path: new THREE.Color('#00e5ff'),
};

export class DebugDraw {
  readonly opts: DebugOptions = { colliders: false, ranges: false, paths: false };
  private pos = new Float32Array(MAX_SEGMENTS * 6);
  private col = new Float32Array(MAX_SEGMENTS * 6);
  private geo = new THREE.BufferGeometry();
  private lines: THREE.LineSegments;
  private n = 0;

  constructor(scene: THREE.Scene) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    // toneMapped: false para que el filtro de color de la escena (ACES) no las deje grises
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.95, toneMapped: false });
    this.lines = new THREE.LineSegments(this.geo, mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  get active() { return this.opts.colliders || this.opts.ranges || this.opts.paths; }

  update(G: GameState) {
    this.lines.visible = this.active;
    if (!this.active) return;
    this.n = 0;
    const o = this.opts;
    if (o.colliders) {
      for (const s of G.solids) {
        if (!s.hx && !s.hy) { this.circle(s.x, s.y, s.r, C.solid); continue; }
        // cápsula: un círculo en cada punta y los dos lados rectos
        const hx = s.hx ?? 0, hy = s.hy ?? 0, l = Math.hypot(hx, hy), px = -hy / l * s.r, py = hx / l * s.r;
        this.circle(s.x + hx, s.y + hy, s.r, C.solid, 12);
        this.circle(s.x - hx, s.y - hy, s.r, C.solid, 12);
        this.seg(s.x - hx + px, s.y - hy + py, s.x + hx + px, s.y + hy + py, C.solid);
        this.seg(s.x - hx - px, s.y - hy - py, s.x + hx - px, s.y + hy - py, C.solid);
      }
      this.square(BASE.x, BASE.y, CASTLE_HALF, C.castle);
      this.circle(G.player.x, G.player.y, PLAYER_RADIUS, C.player);
      for (const e of G.enemies) this.circle(e.x, e.y, e.r, C.enemy);
      for (const h of G.helpers) this.circle(h.x, h.y, HELPERS.radius[h.kind], C.helper);
    }
    if (o.ranges) {
      this.circle(G.player.x, G.player.y, PLAYER.sword.range, C.sword);
      this.circle(G.player.x, G.player.y, PLAYER.bow.range, C.bow);
      for (const b of G.buildings) this.circle(b.x, b.y, towerStats(G, b).range, b.type === 'archer' ? C.archer : C.cannon, 48);
    }
    if (o.paths) {
      for (const h of G.helpers) {
        if (!h.goal) continue;
        this.seg(h.x, h.y, h.goal.x, h.goal.y, C.path);
        this.circle(h.goal.x, h.goal.y, 0.12, C.path, 8);
      }
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, this.n * 2);
  }

  private seg(x0: number, y0: number, x1: number, y1: number, c: THREE.Color) {
    if (this.n >= MAX_SEGMENTS) return;
    const i = this.n * 6;
    this.pos[i] = x0; this.pos[i + 1] = Y; this.pos[i + 2] = y0;
    this.pos[i + 3] = x1; this.pos[i + 4] = Y; this.pos[i + 5] = y1;
    this.col[i] = this.col[i + 3] = c.r;
    this.col[i + 1] = this.col[i + 4] = c.g;
    this.col[i + 2] = this.col[i + 5] = c.b;
    this.n++;
  }

  private circle(x: number, y: number, r: number, c: THREE.Color, seg = SEG) {
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      this.seg(x + Math.cos(a0) * r, y + Math.sin(a0) * r, x + Math.cos(a1) * r, y + Math.sin(a1) * r, c);
    }
  }

  private square(x: number, y: number, h: number, c: THREE.Color) {
    this.seg(x - h, y - h, x + h, y - h, c); this.seg(x + h, y - h, x + h, y + h, c);
    this.seg(x + h, y + h, x - h, y + h, c); this.seg(x - h, y + h, x - h, y - h, c);
  }
}
