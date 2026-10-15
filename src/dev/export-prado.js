// Só em desenvolvimento (?export): junta as malhas FIXAS do prado já posicionadas e salva um GLB
// para assar a luz no Blender. Cada malha sai em coordenadas de mundo (transformação aplicada),
// com o nome do material ("stone", "rock", "wood"...). Fica de fora tudo que se mexe ou é instanciado.
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const BAKE = new Set(["stone", "stoneV", "rock", "bark", "wood", "ground"]);

function movesOrSkipped(o) {
  for (let p = o; p; p = p.parent) if (p.name === "tree" || p.name === "boat") return true;
  return false;
}

// atributos compactados (Int8/Uint8 normalizados) viram Float32: o Blender importa sem surpresas
function plain(geo) {
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(geo.attributes)) {
    if (!["position", "normal", "uv", "color"].includes(k)) continue;
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c);
    g.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize));
  }
  if (geo.index) g.setIndex(Array.from(geo.index.array));
  return g;
}

export async function exportPrado(scene, { path = "assets/prado/bake/prado-static.glb" } = {}) {
  scene.updateMatrixWorld(true);
  const out = new THREE.Scene(), count = {};
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.visible || movesOrSkipped(o)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const name = mats[0]?.name;
    if (!BAKE.has(name)) return;
    const g = plain(o.geometry); g.applyMatrix4(o.matrixWorld);
    if (g.attributes.normal) g.computeVertexNormals();   // normais corretas depois de escala não uniforme
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ name, vertexColors: !!g.attributes.color }));
    count[name] = (count[name] || 0) + 1;
    mesh.name = `${name}-${count[name]}`;
    out.add(mesh);
  });
  const glb = await new GLTFExporter().parseAsync(out, { binary: true });
  const r = await fetch("/__save?path=" + path, { method: "POST", body: glb });
  console.log("[export] ", r.ok ? "salvo" : "falhou", path, count, (glb.byteLength / 1048576).toFixed(1) + " MB");
  return count;
}
