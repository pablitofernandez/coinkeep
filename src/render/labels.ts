// ============================================================
//  Etiquetas HTML pegadas a objetos 3D (precios, barras de vida,
//  estrellas, textos flotantes). Sustituye a CSS2DRenderer de Three.js,
//  que en cada fotograma reescribía el estilo de TODAS las etiquetas
//  (también las de fuera de pantalla) y las reordenaba por distancia:
//  en Safari/iPhone eso costaba mucho procesador.
//
//  Este solo toca el DOM cuando algo cambia de verdad, oculta lo que
//  queda fuera de pantalla y redondea a píxeles enteros (sin temblor
//  ni rastros de un píxel). Usa los mismos CSS2DObject de Three.js.
// ============================================================
import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/** Margen (px) fuera de pantalla antes de ocultar una etiqueta (las grandes no deben cortarse de golpe). */
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

  /** Llamar justo después de renderer.render (las matrices ya están actualizadas). */
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
