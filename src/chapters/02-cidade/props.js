// Mobiliário da praça e telhados: floreiras, bancos, frades, postes, semáforos, lixeiras, bancas, meio-fio,
// caixas d'água e antenas. Cada tipo é UMA malha instanciada; as lâmpadas são outra malha instanciada emissiva
// (postes quentes, semáforos em ciclo, luz vermelha piscando nas antenas). Sem luzes reais: os postes entram no
// mapa de luz (lights) e um vapor sai do bueiro da avenida.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { COMMON_GLSL } from "./glsl.js";
import { PLAZA } from "./city.js";

export const ROAD_HW = PLAZA.ahw - 2.5;      // meia largura do asfalto da avenida (calçada de 2,5 m de cada lado)
export const CROSS = [PLAZA.z0 - 13, PLAZA.z0 - 9];   // faixa de pedestres (z)
export const STEAM = [-3.2, -40];             // bueiro com vapor

// peças: geometria em (0,0,0) no chão; tudo junto vira uma geometria só por tipo
const part = (g, x = 0, y = 0, z = 0) => g.translate(x, y, z);
const merged = (...gs) => mergeGeometries(gs.map((g) => g.toNonIndexed()));
const GEO = {
  planter: () => merged(part(new THREE.BoxGeometry(2.4, .7, 1.1), 0, .35), part(new THREE.BoxGeometry(2.5, .08, 1.2), 0, .74)),
  shrub: () => new THREE.IcosahedronGeometry(.55, 1).scale(1, .75, 1),
  bench: () => merged(part(new THREE.BoxGeometry(1.8, .08, .5), 0, .45), part(new THREE.BoxGeometry(1.8, .4, .06), 0, .75, -.22),
    part(new THREE.BoxGeometry(.08, .45, .45), -.8, .22), part(new THREE.BoxGeometry(.08, .45, .45), .8, .22)),
  bollard: () => merged(part(new THREE.CylinderGeometry(.11, .13, .9, 8), 0, .45), part(new THREE.SphereGeometry(.11, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, .9)),
  lamp: () => merged(part(new THREE.CylinderGeometry(.08, .13, 6.2, 8), 0, 3.1), part(new THREE.BoxGeometry(1.4, .09, .09), .62, 6.08),
    part(new THREE.BoxGeometry(.5, .14, .26), 1.25, 5.98)),
  signal: () => merged(part(new THREE.CylinderGeometry(.09, .11, 4.6, 8), 0, 2.3), part(new THREE.BoxGeometry(.38, 1.15, .32), 0, 4.2, .2)),
  bin: () => new THREE.CylinderGeometry(.32, .28, .95, 10).translate(0, .48, 0),
  newsbox: () => merged(part(new THREE.BoxGeometry(.5, .95, .45), 0, .48), part(new THREE.BoxGeometry(.52, .04, .47), 0, .97)),
  curb: () => new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0),
  tank: () => merged(part(new THREE.BoxGeometry(3, .35, 3), 0, .18), part(new THREE.CylinderGeometry(1.45, 1.45, 2.5, 12), 0, 1.6),
    part(new THREE.ConeGeometry(1.6, 1, 12), 0, 3.35)),
  antenna: () => new THREE.CylinderGeometry(.05, .12, 1, 6).translate(0, .5, 0),
};

// material escuro dos objetos: cor própria (aTint) iluminada só pela luz dos letreiros + contraluz
function propMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: { uHaze: U.haze, uFogD: U.fogD, tLight: U.light },
    vertexShader: /* glsl */`
      attribute vec3 aTint; varying vec3 vW, vN, vTint;
      void main() {
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.); vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vTint = aTint;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vW, vN, vTint; ${COMMON_GLSL}
      void main() {
        vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
        float rim = pow(1. - abs(dot(n, v)), 3.), top = max(n.y, 0.);
        vec3 L = neonLight(vW.xz);
        vec3 col = vTint * (.018 + .022 * top) + L * vTint * (.03 + .05 * top) + L * rim * .16;
        gl_FragColor = vec4(cityFog(col, vW, vW.y), 1.);
      }`,
  });
}

// lâmpadas: cor HDR por instância; aMode 0 = fixa, 1 = pisca (antena), 2..4 = semáforo (vermelho, amarelo, verde)
function bulbMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: { uT: U.time, uHaze: U.haze, uFogD: U.fogD, tLight: U.light },
    vertexShader: /* glsl */`
      attribute vec3 aCol; attribute float aMode; varying vec3 vW, vCol; varying float vMode, vPh;
      void main() {
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.); vW = w.xyz; vCol = aCol; vMode = aMode;
        vPh = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uT; varying vec3 vW, vCol; varying float vMode, vPh; ${COMMON_GLSL}
      void main() {
        float on = 1.;
        if (vMode > .5 && vMode < 1.5) on = .08 + step(.86, fract(uT * .45 + vPh));             // antena: pisca
        else if (vMode > 1.5) {                                                                  // semáforo: 14 s por ciclo
          float c = fract(uT / 14. + vPh * .0), st = c < .45 ? 4. : (c < .55 ? 3. : 2.);       // verde, amarelo, vermelho
          on = abs(vMode - st) < .5 ? 1. : .06;
        }
        gl_FragColor = vec4(cityFog(vCol * on, vW, vW.y), 1.);
      }`,
  });
}

export function createStreet(U, mobile, roof) {
  const group = new THREE.Group(), lights = [];
  const items = {};                                     // tipo → [{p, ry, s, tint}]
  const put = (kind, x, z, ry = 0, s = [1, 1, 1], tint = [1, 1, 1], y = 0) =>
    (items[kind] ??= []).push({ p: new THREE.Vector3(x, y, z), ry, s, tint });
  const bulbs = [];                                     // {p, r, col, mode}
  const { hw, z0, z1, ahw } = PLAZA;

  for (const s of [-1, 1]) {
    // floreiras com arbusto ao longo das laterais da praça (longe da poça e da estátua)
    for (const z of [0, 9, 26, 32]) {
      put("planter", s * 13.5, z, Math.PI / 2, [1, 1, 1], [1.25, 1.2, 1.15]);
      for (const dz of [-.6, .55]) put("shrub", s * 13.5, z + dz, dz * 3, [1, .9 + Math.abs(dz) * .3, 1], [.35, .8, .38], .78);
    }
    for (const z of [3.5, 29.5]) put("bench", s * 11.9, z, s * Math.PI / 2, [1, 1, 1], [.9, .75, .6]);
    put("bin", s * 12.2, 13, 0, [1, 1, 1], [.55, .6, .55]);
    put("newsbox", s * 11.6, 19.5 - s * .8, s * Math.PI / 2, [1, 1, 1], s < 0 ? [1.4, .35, .25] : [.3, .5, 1.3]);
    // postes da praça e da avenida (braço para dentro), com lâmpada quente no mapa de luz
    for (const z of [0, 22, -30, -50, -70, -92]) {
      const x = s * (z > z0 ? 16 : ahw - 1.1), ry = s > 0 ? Math.PI : 0;
      put("lamp", x, z, ry, [1, 1, 1], [.7, .7, .75]);
      bulbs.push({ p: new THREE.Vector3(x - s * 1.25, 5.88, z), r: .2, col: [4, 2.6, 1.4], mode: 0 });
      lights.push({ x: x - s * 1.25, z, c: new THREE.Color(1, .66, .38), i: .9 });
    }
    // semáforos dos dois lados da faixa de pedestres, voltados para a avenida
    for (const z of [CROSS[1] + .8, CROSS[0] - 1.4]) {
      const x = s * (ROAD_HW + .9), ry = z > CROSS[1] ? Math.PI : 0;
      put("signal", x, z, ry, [1, 1, 1], [.55, .55, .5]);
      const dz = ry ? -.37 : .37;
      [[4.58, [5, .25, .15], 2], [4.2, [4.5, 2.2, .2], 3], [3.82, [.3, 3.8, 1.6], 4]].forEach(([y, col, mode]) =>
        bulbs.push({ p: new THREE.Vector3(x, y, z + dz), r: .11, col, mode }));
      lights.push({ x, z, c: new THREE.Color(1, .25, .2), i: .25 });
    }
    // meio-fio da avenida, lixeiras e banca nas calçadas
    put("curb", s * ROAD_HW, (z0 - 9 + -112) / 2, 0, [.3, .17, 103], [1.3, 1.25, 1.2]);
    for (const z of [-26, -62]) put("bin", s * (ROAD_HW + 1.7), z, 0, [1, 1, 1], [.5, .55, .5]);
  }
  put("newsbox", ROAD_HW + 1.8, -40, -Math.PI / 2, [1, 1, 1], [1.3, 1.1, .25]);
  // frades na divisa praça/avenida
  for (let x = -6; x <= 6.01; x += 1.5) put("bollard", x, z0 - 1.2, 0, [1, 1, 1], [.8, .8, .85]);

  // telhados: caixas d'água e antenas (com luz vermelha no topo)
  for (const r of roof) {
    if (r.kind === "tank") put("tank", r.x, r.z, r.x * .37, [r.s, r.s, r.s], [.7, .55, .45], r.y);
    else {
      put("antenna", r.x, r.z, 0, [1, r.h, 1], [.6, .6, .65], r.y);
      bulbs.push({ p: new THREE.Vector3(r.x, r.y + r.h + .1, r.z), r: .22, col: [6, .25, .15], mode: 1 });
    }
  }

  // uma malha instanciada por tipo
  const mat = propMaterial(U), m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3();
  for (const [kind, list] of Object.entries(items)) {
    const geo = GEO[kind](), mesh = new THREE.InstancedMesh(geo, mat, list.length), tint = new Float32Array(list.length * 3);
    list.forEach((it, i) => {
      q.setFromAxisAngle(up, it.ry); sc.set(...it.s); m.compose(it.p, q, sc); mesh.setMatrixAt(i, m); tint.set(it.tint, i * 3);
    });
    geo.setAttribute("aTint", new THREE.InstancedBufferAttribute(tint, 3));
    mesh.computeBoundingSphere(); group.add(mesh);
  }
  const bgeo = new THREE.SphereGeometry(1, 10, 6), bmesh = new THREE.InstancedMesh(bgeo, bulbMaterial(U), bulbs.length);
  const bcol = new Float32Array(bulbs.length * 3), bmode = new Float32Array(bulbs.length);
  bulbs.forEach((b, i) => { m.compose(b.p, q.identity(), sc.setScalar(b.r)); bmesh.setMatrixAt(i, m); bcol.set(b.col, i * 3); bmode[i] = b.mode; });
  bgeo.setAttribute("aCol", new THREE.InstancedBufferAttribute(bcol, 3));
  bgeo.setAttribute("aMode", new THREE.InstancedBufferAttribute(bmode, 1));
  bmesh.computeBoundingSphere(); group.add(bmesh);

  // vapor saindo do bueiro (Nova York): um cartão voltado para a câmera, ruído subindo, colorido pelos letreiros
  const steam = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 11).translate(0, 5.3, 0), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: U.time, uHaze: U.haze, uFogD: U.fogD, tLight: U.light },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uT; varying vec2 vUv; varying vec3 vW; ${COMMON_GLSL}
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 p = vec2((vUv.x - .5) * 2.2, vUv.y * 5.);
        float w = .18 + vUv.y * .85;                                     // a pluma abre ao subir
        float shape = smoothstep(w, w * .2, abs(p.x + sin(vUv.y * 4. + uT * .4) * .25 * vUv.y));
        float n = vn(p * 1.6 - vec2(uT * .15, uT * .9)) * .6 + vn(p * 3.7 - vec2(-uT * .1, uT * 1.6)) * .4;
        float a = shape * smoothstep(.0, .08, vUv.y) * smoothstep(1., .45, vUv.y) * smoothstep(.25, .75, n) * .5;
        vec3 col = (uHaze * 3. + neonLight(vW.xz) * .5 + vec3(.05, .045, .05)) * a;
        float d = length(vW - cameraPosition);
        gl_FragColor = vec4(col * exp(-d * uFogD * .8), 1.);
      }`,
  }));
  steam.position.set(STEAM[0], 0, STEAM[1]);
  group.add(steam);

  return {
    group, lights,
    update(camera) { steam.rotation.y = Math.atan2(camera.position.x - steam.position.x, camera.position.z - steam.position.z); },
  };
}
