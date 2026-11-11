// ============================================================
//  HTML labels attached to 3D objects (prices, health bars, stars,
//  floating texts). Replaces Three.js's CSS2DRenderer, which every
//  frame rewrote the style of ALL labels (including off-screen ones)
//  and re-sorted them by distance: on Safari/iPhone that cost a lot
//  of CPU.
//
//  This one only touches the DOM when something actually changes,
//  hides what is off-screen and rounds to whole pixels (no jitter or
//  one-pixel trails). It uses the same Three.js CSS2DObjects.
// ============================================================
import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/** Off-screen margin (px) before hiding a label (big ones must not get cut off abruptly). */
const MARGIN = 120;

interface LabelState { shown: boolean; tx: number; ty: number }

export class LabelRenderer {
  readonly domElement = document.createElement('div');
  private width = 1;
  private height = 1;
  private viewProj = new THREE.Matrix4();
  private v = new THREE.Vector3();
  private state = new WeakMap<HTMLElement, LabelState>();

  constructor() {
    this.domElement.style.overflow = 'hidden';
  }

  setSize(width: number, height: number) {
    this.width = width; this.height = height;
    this.domElement.style.width = width + 'px';
    this.domElement.style.height = height + 'px';
  }

  /** Call right after renderer.render (matrices are already up to date). */
  render(scene: THREE.Scene, camera: THREE.Camera) {
    this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.visit(scene, true);
  }

  private visit(obj: THREE.Object3D, parentVisible: boolean) {
    const visible = parentVisible && obj.visible;
    if ((obj as Partial<{ isCSS2DObject: boolean }>).isCSS2DObject) this.place(obj as CSS2DObject, visible);
    const kids = obj.children;
    for (let i = 0; i < kids.length; i++) this.visit(kids[i], visible);
  }

  private place(obj: CSS2DObject, visible: boolean) {
    const el = obj.element;
    let st = this.state.get(el);
    if (!st) { st = { shown: true, tx: NaN, ty: NaN }; this.state.set(el, st); }
    let tx = 0, ty = 0;
    if (visible) {
      const v = this.v.setFromMatrixPosition(obj.matrixWorld).applyMatrix4(this.viewProj);
      tx = Math.round((v.x + 1) * 0.5 * this.width);
      ty = Math.round((1 - v.y) * 0.5 * this.height);
      visible = v.z >= -1 && v.z <= 1 &&
        tx > -MARGIN && tx < this.width + MARGIN && ty > -MARGIN && ty < this.height + MARGIN;
    }
    if (visible !== st.shown) { el.style.display = visible ? '' : 'none'; st.shown = visible; }
    if (!visible) return;
    if (el.parentNode !== this.domElement) this.domElement.appendChild(el);
    if (tx !== st.tx || ty !== st.ty) {
      el.style.transform = `translate(-50%, -50%) translate(${tx}px, ${ty}px)`;
      st.tx = tx; st.ty = ty;
    }
  }
}
