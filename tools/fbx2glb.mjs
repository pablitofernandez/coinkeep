// Uso: node tools/fbx2glb.mjs . <entrada.fbx> <salida.glb>
// Convierte un FBX (Quaternius) a GLB con FBXLoader + GLTFExporter de Three.js en Node.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , project, input, output] = process.argv;
const mod = p => pathToFileURL(path.join(project, 'node_modules', p)).href;

// apaños mínimos de navegador para los cargadores
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(b => { this.result = b; this.onloadend?.(); this.onload?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(b => { this.result = 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + Buffer.from(b).toString('base64'); this.onloadend?.(); this.onload?.(); }); }
};
globalThis.document = { createElementNS: () => ({ style: {} }), createElement: () => ({ style: {} }) };

const THREE = await import(mod('three/build/three.module.js'));
const { FBXLoader } = await import(mod('three/examples/jsm/loaders/FBXLoader.js'));
const { GLTFExporter } = await import(mod('three/examples/jsm/exporters/GLTFExporter.js'));

const buf = fs.readFileSync(input);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const obj = new FBXLoader().parse(ab, '');
const box = new THREE.Box3().setFromObject(obj);
console.log('tamaño', box.getSize(new THREE.Vector3()).toArray().map(v => v.toFixed(2)).join(' x '));
console.log('animaciones', obj.animations.map(a => `${a.name} (${a.duration.toFixed(2)}s)`).join(', '));
const mats = new Set();
obj.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(`${m.type}:${m.name}:${m.color?.getHexString()}${m.map ? ' [tex]' : ''}`)); });
console.log('materiales', [...mats].join(' | '));

// FBXLoader da MeshPhong; el juego usa MeshStandard. Los colores del FBX ya venían en lineal y el cargador los vuelve a pasar: se deshace una vez
obj.traverse(o => {
  if (!o.isMesh) return;
  const conv = m => new THREE.MeshStandardMaterial({ name: m.name, color: m.color.clone().convertLinearToSRGB(), roughness: 0.8, metalness: 0, map: null, side: m.side });
  o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
});

const glb = await new GLTFExporter().parseAsync(obj, { binary: true, animations: obj.animations });
fs.writeFileSync(output, Buffer.from(glb));
console.log('escrito', output, (fs.statSync(output).size / 1024).toFixed(0) + ' KB');
