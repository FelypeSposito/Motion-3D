// Névoa em camadas: véus verticais à deriva (voltados para a câmera) e neblina rasteira no chão, tingidos pela luz
// dos telões (mapa de luz). Só aparecem acima do chão; ficam fora do passe de reflexo. Celular: menos camadas.
import * as THREE from "three";
import { COMMON_GLSL } from "./glsl.js";
import { PLAZA } from "./city.js";

export function createFog(U, mobile) {
  const group = new THREE.Group();
  const mat = (ground) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uT: U.time, uHaze: U.haze, uFogD: U.fogD, tLight: U.light, uSeed: { value: Math.random() * 50 } },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uT, uSeed; varying vec2 vUv; varying vec3 vW; ${COMMON_GLSL}
      void main() {
        vec2 p = ${ground ? "vW.xz * .09" : "vec2(vW.x + vW.z, vW.y) * .07"} + uSeed;
        float n = vn(p + vec2(uT * .035, uT * .01)) * .6 + vn(p * 2.3 - vec2(uT * .05, -uT * .02)) * .3 + vn(p * 5.1 + uT * .04) * .1;
        vec2 e = min(vUv, 1. - vUv);
        float edge = smoothstep(0., .35, e.x) * smoothstep(0., ${ground ? ".35" : ".5"}, e.y);
        float a = smoothstep(.35, .85, n) * edge * ${ground ? ".5" : ".28"};
        float d = length(vW - cameraPosition);
        a *= smoothstep(2., 9., d);                                     // some perto da câmera (sem "parede")
        vec3 L = neonLight(vW.xz);
        vec3 col = uHaze * 2.6 + L * ${ground ? ".22" : ".16"};
        gl_FragColor = vec4(col, a);
      }`,
  });
  const cards = [];
  // véus verticais: praça e avenida (centro aberto), alturas variadas
  const spots = [[0, 8, 20, 10], [-6, 14, 2, 22], [5, 6, -14, 16], [-2, 18, -36, 26], [3, 10, -60, 22], [0, 24, -84, 34]];
  for (const [x, y, z, w] of mobile ? spots.filter((_, i) => i % 2 === 0) : spots) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * .55), mat(false));
    m.position.set(x, y, z); m.userData.base = m.position.clone(); cards.push(m); group.add(m);
  }
  // neblina rasteira: lâminas horizontais a ~0,6 m do chão
  for (const [x, z, s] of [[0, 18, 36], [0, -30, 30], [0, -70, 30]].slice(0, mobile ? 2 : 3)) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s).rotateX(-Math.PI / 2), mat(true));
    m.position.set(x, .6, z); group.add(m);
  }
  group.renderOrder = 3;
  return {
    group,
    update(t, camera) {
      for (const c of cards) {                                         // véus de frente para a câmera (só no eixo y) e à deriva
        c.rotation.y = Math.atan2(camera.position.x - c.position.x, camera.position.z - c.position.z);
        c.position.x = c.userData.base.x + Math.sin(t * .05 + c.userData.base.z) * 2.5;
      }
    },
  };
}
