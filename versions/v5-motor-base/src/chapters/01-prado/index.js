// Capítulo 01 — Prado na névoa.
// Usa o modelo assado (assets/prado/prado.glb) quando existir; até lá, um substituto leve
// com o mesmo enquadramento, para testar motor, câmera e transições.
import * as THREE from "three";
import { cameraPath, gradientSky, smoothPointer, useBakedMaterials } from "../../core/scene-kit.js";

const MODEL = "./assets/prado/prado.glb";

export async function create({ loader, quality }) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2("#e9c69a", 0.022);
  const camera = new THREE.PerspectiveCamera(quality.mobile ? 58 : 40, 1, 0.1, 1200);

  scene.add(gradientSky({ top: "#8fa5c8", horizon: "#f2cfa0", bottom: "#d8b48a", sunDir: [0.25, 0.06, -1], sunColor: "#ffcf8a" }));

  if (await loader.exists(MODEL)) {
    const gltf = await loader.gltf(MODEL);
    useBakedMaterials(gltf.scene);
    scene.add(gltf.scene);
  } else {
    buildPlaceholder(scene);
  }

  // câmera: chega perto da ilha e se alinha com o arco no fim do capítulo
  const path = cameraPath([
    { pos: [0, 2.8, 22], look: [2.5, 2.6, -10] },
    { pos: [1.5, 2.7, 13], look: [4, 3, -10] },
    { pos: [5.2, 3.2, 2], look: [7, 4, -14] },
    { pos: [7.2, 3.6, -9], look: [8.5, 4.5, -30] },
  ]);
  let progress = 0;

  return {
    scene, camera, clearColor: 0xe9c69a,
    setProgress(p) { progress = p; },
    update(t, dt) {
      const ptr = smoothPointer(dt);
      path(camera, progress, { sway: 0.35, px: ptr.sx * 2.2, py: ptr.sy * 1.2, time: t });
    },
    resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); },
  };
}

// Substituto: formas simples e materiais sem iluminação (mesmo custo que a versão assada terá).
function buildPlaceholder(scene) {
  const basic = (c) => new THREE.MeshBasicMaterial({ color: c });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), basic("#c7a983"));
  scene.add(water);
  const island = new THREE.Mesh(new THREE.CircleGeometry(13, 48).rotateX(-Math.PI / 2), basic("#8c9a52"));
  island.scale.set(1.15, 1, 0.8); island.position.set(1, 0.05, -6); scene.add(island);
  const archShape = new THREE.Shape([[-3.2, 0], [3.2, 0], [3.2, 9.4], [-3.2, 9.4]].map(([x, y]) => new THREE.Vector2(x, y)));
  const hole = new THREE.Path(); hole.moveTo(-1.8, 0); hole.lineTo(1.8, 0); hole.lineTo(1.8, 4.3); hole.absarc(0, 4.3, 1.8, 0, Math.PI, false); hole.lineTo(-1.8, 0);
  archShape.holes.push(hole);
  const arch = new THREE.Mesh(new THREE.ExtrudeGeometry(archShape, { depth: 1.3, bevelEnabled: false }), basic("#b49a7c"));
  arch.position.set(7, 0, -10.6); arch.rotation.y = -0.24; scene.add(arch);
  for (let i = 0; i < 40; i++) {
    const h = 6 + Math.random() * 10, x = (Math.random() - 0.5) * 140, z = -45 - Math.random() * 40;
    const pine = new THREE.Mesh(new THREE.ConeGeometry(h * 0.25, h, 6), basic("#7d7a68"));
    pine.position.set(x, h / 2 - 1, z); scene.add(pine);
  }
  scene.traverse((o) => { if (o.isMesh) { o.matrixAutoUpdate = false; o.updateMatrix(); } });
}
