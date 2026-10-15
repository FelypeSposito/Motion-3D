// Peças reutilizadas pelos capítulos: caminho de câmera, parallax do ponteiro,
// conversão de materiais assados e céu em degradê barato.
import * as THREE from "three";

// Ponteiro normalizado (-.5..5) compartilhado; no toque fica parado no centro.
export const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch") return;
  pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5;
});
export function smoothPointer(dt, speed = 5) {
  const k = 1 - Math.exp(-dt * speed);
  pointer.sx += (pointer.x - pointer.sx) * k; pointer.sy += (pointer.y - pointer.sy) * k;
  return pointer;
}

// Caminho de câmera por pontos-chave: posição e alvo interpolados por curvas suaves.
export function cameraPath(keys) {
  const pos = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.pos)), false, "centripetal");
  const tgt = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.look)), false, "centripetal");
  const p = new THREE.Vector3(), l = new THREE.Vector3();
  const fn = (camera, t, { sway = 0, px = 0, py = 0, time = 0 } = {}) => {
    const u = THREE.MathUtils.clamp(t, 0, 1);
    pos.getPointAt(u, p); tgt.getPointAt(u, l);
    p.x += Math.sin(time * 0.23) * sway + px; p.y += Math.sin(time * 0.37 + 0.7) * sway * 0.4 - py;
    l.x += px * 0.8; l.y -= py * 0.6;
    camera.position.copy(p); camera.lookAt(l);
  };
  // fração do trajeto mais próxima de um ponto (ex.: o centro do arco)
  fn.closestU = (point, samples = 400) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i <= samples; i++) { const u = i / samples, d = pos.getPointAt(u, p).distanceTo(point); if (d < bd) { bd = d; best = u; } }
    return best;
  };
  return fn;
}

// Materiais exportados do Blender com a luz assada viram MeshBasicMaterial:
// nenhuma luz, nenhuma sombra em tempo real — só a textura assada (e névoa, se houver).
export function useBakedMaterials(root, { fog = true } = {}) {
  const cache = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.material;
    if (!cache.has(src)) {
      const m = new THREE.MeshBasicMaterial({
        map: src.map ?? src.emissiveMap ?? null, color: src.map || src.emissiveMap ? 0xffffff : src.color,
        transparent: src.transparent, alphaTest: src.alphaTest, side: src.side, fog,
      });
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
      cache.set(src, m); src.dispose();
    }
    o.material = cache.get(src);
    o.matrixAutoUpdate = false; o.updateMatrix();   // objetos estáticos: nada de recalcular matriz todo quadro
  });
}

// Céu em degradê com sol/halo — um único shader simples.
export function gradientSky({ top, horizon, bottom, sunDir = null, sunColor = "#ffd8a0", radius = 900 }) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(top) }, uHor: { value: new THREE.Color(horizon) }, uBot: { value: new THREE.Color(bottom) },
      uSun: { value: sunDir ? new THREE.Vector3(...sunDir).normalize() : new THREE.Vector3(0, -1, 0) }, uSunC: { value: new THREE.Color(sunColor) },
      uHasSun: { value: sunDir ? 1 : 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      uniform vec3 uTop, uHor, uBot, uSun, uSunC; uniform float uHasSun; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 c = h > 0. ? mix(uHor, uTop, pow(smoothstep(0., .7, h), .8)) : mix(uHor, uBot, smoothstep(0., -.3, h));
        float s = max(dot(d, uSun), 0.) * uHasSun;
        c += uSunC * (pow(s, 8.) * .45 + pow(s, 90.) * 1.4 + smoothstep(.9994, .9998, s) * 6.);
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), m);
  mesh.renderOrder = -1; mesh.frustumCulled = false;
  return mesh;
}
