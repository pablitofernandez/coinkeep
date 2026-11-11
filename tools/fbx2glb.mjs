// Usage: node tools/fbx2glb.mjs . <input.fbx> <output.glb>
// Converts an FBX (Quaternius) to GLB with Three.js's FBXLoader + GLTFExporter in Node.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , project, input, output] = process.argv;
const mod = p => pathToFileURL(path.join(project, 'node_modules', p)).href;

// minimal browser shims for the loaders
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
console.log('size', box.getSize(new THREE.Vector3()).toArray().map(v => v.toFixed(2)).join(' x '));
console.log('animations', obj.animations.map(a => `${a.name} (${a.duration.toFixed(2)}s)`).join(', '));
const mats = new Set();
obj.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(`${m.type}:${m.name}:${m.color?.getHexString()}${m.map ? ' [tex]' : ''}`)); });
console.log('materials', [...mats].join(' | '));

// FBXLoader gives MeshPhong; the game uses MeshStandard. The FBX colors were already linear and the loader converts them again: undo it once
obj.traverse(o => {
  if (!o.isMesh) return;
  const conv = m => new THREE.MeshStandardMaterial({ name: m.name, color: m.color.clone().convertLinearToSRGB(), roughness: 0.8, metalness: 0, map: null, side: m.side });
  o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
});

const glb = await new GLTFExporter().parseAsync(obj, { binary: true, animations: obj.animations });
fs.writeFileSync(output, Buffer.from(glb));
console.log('written', output, (fs.statSync(output).size / 1024).toFixed(0) + ' KB');
