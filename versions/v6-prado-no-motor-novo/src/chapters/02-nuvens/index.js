// Capítulo 02 — Cidade flutuante sobre um mar de nuvens.
// Modelo assado em assets/nuvens/nuvens.glb quando existir; até lá, um substituto leve.
import * as THREE from "three";
import { cameraPath, gradientSky, smoothPointer, useBakedMaterials } from "../../core/scene-kit.js";

const MODEL = "./assets/nuvens/nuvens.glb";

export async function create({ loader, quality }) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2("#f6d9c4", .006);   // mesmo tipo de névoa do prado (o chunk de névoa é global)
  const camera = new THREE.PerspectiveCamera(quality.mobile ? 60 : 42, 1, 0.1, 1500);

  scene.add(gradientSky({ top: "#6f8fd0", horizon: "#ffd9bf", bottom: "#ffffff", sunDir: [-0.4, 0.12, -1], sunColor: "#ffe2b8" }));

  // mar de nuvens: um plano grande com ruído em textura (uma leitura por pixel, rolando devagar)
  const clouds = cloudSea();
  scene.add(clouds.mesh);

  if (await loader.exists(MODEL)) {
    const gltf = await loader.gltf(MODEL);
    useBakedMaterials(gltf.scene);
    scene.add(gltf.scene);
  } else {
    buildPlaceholder(scene);
  }

  const path = cameraPath([
    { pos: [0, 14, 60], look: [0, 10, 0] },
    { pos: [-14, 16, 30], look: [0, 14, -10] },
    { pos: [-6, 22, 4], look: [10, 18, -30] },
    { pos: [10, 26, -24], look: [20, 22, -70] },
  ]);
  let progress = 0;

  return {
    scene, camera, clearColor: 0xf6d9c4,
    setProgress(p) { progress = p; },
    update(t, dt) {
      const ptr = smoothPointer(dt);
      clouds.update(t);
      path(camera, progress, { sway: 0.6, px: ptr.sx * 3, py: ptr.sy * 1.6, time: t });
    },
    resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); },
    dispose() { clouds.dispose(); },
  };
}

function cloudSea() {
  // textura de ruído gerada uma vez (128px, tileável) — nada de ruído calculado por pixel
  const S = 128, data = new Uint8Array(S * S * 4);
  const h = (x, y) => { const v = Math.sin((x % S) * 127.1 + (y % S) * 311.7) * 43758.5453; return v - Math.floor(v); };
  const vn = (x, y, p) => {
    const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g);
    const a = h(i % p, j % p), b = h((i + 1) % p, j % p), c = h(i % p, (j + 1) % p), d = h((i + 1) % p, (j + 1) % p);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let s = 0, a = 0.5, f = 4;
    for (let o = 0; o < 4; o++) { s += a * vn(x / S * f, y / S * f, f); a *= 0.5; f *= 2; }
    const k = (y * S + x) * 4; data[k] = data[k + 1] = data[k + 2] = (s / 0.9375) * 255; data[k + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, S, S); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.needsUpdate = true;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;

  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { tNoise: { value: tex }, uTime: { value: 0 } }]),
    vertexShader: `#include <fog_pars_vertex>
      varying vec2 vUv; void main(){ vec3 transformed = position; vUv = position.xz; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
      #include <fog_vertex>
      }`.replace("#include <fog_vertex>", "vec4 mvPosition = mv;\n#include <fog_vertex>"),
    fragmentShader: `#include <fog_pars_fragment>
      uniform sampler2D tNoise; uniform float uTime; varying vec2 vUv;
      void main(){
        float n = texture2D(tNoise, vUv * .006 + vec2(uTime * .004, 0.)).r * .65 + texture2D(tNoise, vUv * .017 - vec2(0., uTime * .006)).r * .35;
        vec3 c = mix(vec3(.93, .8, .76), vec3(1., .97, .94), smoothstep(.35, .75, n));
        gl_FragColor = vec4(c, 1.);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2), mat);
  mesh.position.y = 0; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  return { mesh, update: (t) => { mat.uniforms.uTime.value = t; }, dispose: () => tex.dispose() };
}

function buildPlaceholder(scene) {
  const basic = (c) => new THREE.MeshBasicMaterial({ color: c });
  const islands = [[0, 10, 0, 9], [-22, 14, -18, 6], [18, 18, -36, 7], [-8, 22, -60, 10], [26, 26, -84, 8]];
  islands.forEach(([x, y, z, r]) => {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, 1.2, 28), basic("#e8d6bc"));
    const rock = new THREE.Mesh(new THREE.ConeGeometry(r * 0.92, r * 1.6, 9), basic("#b9a28a"));
    top.position.set(x, y, z); rock.position.set(x, y - 0.6 - r * 0.8, z); rock.rotation.x = Math.PI;
    scene.add(top, rock);
    for (let i = 0; i < 3; i++) {
      const hgt = 3 + Math.random() * 7, w = 1 + Math.random() * 1.5;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, w), basic(i % 2 ? "#f4eadc" : "#dfc8ae"));
      tower.position.set(x + (Math.random() - 0.5) * r, y + hgt / 2 + 0.6, z + (Math.random() - 0.5) * r); scene.add(tower);
    }
  });
  for (let i = 0; i < islands.length - 1; i++) {
    const [ax, ay, az] = islands[i], [bx, by, bz] = islands[i + 1];
    const a = new THREE.Vector3(ax, ay + 0.6, az), b = new THREE.Vector3(bx, by + 0.6, bz), len = a.distanceTo(b);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, len), basic("#cdb393"));
    bridge.position.copy(a).lerp(b, 0.5); bridge.lookAt(b); scene.add(bridge);
  }
  scene.traverse((o) => { if (o.isMesh && o.material.type === "MeshBasicMaterial") { o.matrixAutoUpdate = false; o.updateMatrix(); } });
}
