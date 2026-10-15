// Mergulho no lago do prado: a câmera desce até a água, passa pelo plano meio a meio
// (metade acima, metade abaixo, como uma câmera de ação semi-submersa) e segue submersa.
import * as THREE from "three";
import { cameraPath } from "../../core/scene-kit.js";

export const DIVE_START = 0.42;          // fração do capítulo em que o mergulho começa
export const UNDER_FOG = 0.17;           // densidade da névoa submersa (sinal negativo liga o modo submerso no chunk)

// Cáusticas (luz refratada dançando no fundo): função compartilhada pelos materiais submersos.
export const CAUSTICS_GLSL = /* glsl */`
  // três famílias de ondas deformadas; onde alguma cruza o zero nasce uma linha clara (a rede de cáusticas)
  float causticsAt(vec2 p, float t) {
    vec2 q = p + vec2(sin(p.y * 1.3 + t * .7), cos(p.x * 1.1 - t * .6)) * .6;
    float a = abs(sin(q.x * 2.1 + sin(q.y * 1.7 + t) * 1.2));
    float b = abs(sin(q.y * 2.3 + sin(q.x * 1.9 - t * .8) * 1.2));
    float c = abs(sin((q.x + q.y) * 1.6 + sin(q.x * .7 - q.y * .9 + t * .5)));
    return pow(1. - min(min(a, b), c), 9.);
  }`;

// Liga cáusticas num material padrão (terreno, pedras): só abaixo da água, mais fortes perto da superfície.
export function addCaustics(mat, timeUniform, key) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.uCausT = timeUniform;
    sh.vertexShader = "varying vec3 vCausW;\n" + sh.vertexShader.replace("#include <worldpos_vertex>",
      "#include <worldpos_vertex>\n  vCausW = (modelMatrix * vec4(transformed, 1.)).xyz;");
    sh.fragmentShader = "uniform float uCausT;\nvarying vec3 vCausW;\n" + CAUSTICS_GLSL + "\n" + sh.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      if (vCausW.y < -.02) {
        float dc = clamp(-vCausW.y, 0., 6.);
        float ca = causticsAt(vCausW.xz * .9 + 7., uCausT * .55) + causticsAt(vCausW.xz * 1.7 - 3., uCausT * .4) * .5;
        totalEmissiveRadiance += diffuseColor.rgb * vec3(.55, 1., .95) * ca * 1.6 * exp(-dc * .35);
      }`);
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : "") + "-caus-" + key;
}

export function createDive({ scene, camera, U, surfaceOnly, mobile, arch }) {
  // eixo do arco principal: a câmera atravessa o vão e só depois desce, no lago atrás da ilha
  const N = new THREE.Vector3(Math.sin(arch.rotation.y), 0, Math.cos(arch.rotation.y));   // frente da fachada
  const base = arch.position.y;
  const along = (d, y) => { const v = arch.position.clone().addScaledVector(N, d); v.y = base + y; return v.toArray(); };
  const center = arch.position.clone().addScaledVector(N, -16);          // lago atrás da ilha (área submersa)
  const group = new THREE.Group();

  // superfície vista de baixo: espelho escuro nos ângulos rasantes (reflexão total) e janela clara para o céu
  const below = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, 1, 1).rotateX(Math.PI / 2), new THREE.ShaderMaterial({
    side: THREE.FrontSide, transparent: false, fog: false,
    uniforms: { uT: U.time },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uT; varying vec3 vW;
      void main(){
        vec2 p = vW.xz;
        vec2 n = vec2(sin(p.x * 1.3 + uT * 1.1) + sin(p.y * 2.1 - uT * .9 + p.x * .5), cos(p.y * 1.7 + uT) + sin((p.x + p.y) * 3.3 - uT * 1.6) * .5) * .12;
        vec3 v = normalize(vW - cameraPosition);
        float up = clamp(v.y + n.x * .3, 0., 1.);
        float window = smoothstep(.62, .82, up);                     // janela de Snell: céu claro bem acima
        vec3 col = mix(vec3(.04, .24, .26), vec3(.2, .62, .6), smoothstep(.0, .6, up));
        col = mix(col, vec3(.8, .98, .95), window * .85);
        col += vec3(.6, 1., .95) * pow(max(0., sin((p.x + n.y * 6.) * 3.1 + uT * 2.) * sin((p.y + n.x * 6.) * 2.7 - uT * 1.7)), 6.) * .25 * window;
        float d = length(vW - cameraPosition);
        col = mix(col, vec3(.06, .3, .31), clamp(1. - exp(-d * .05), 0., .85));
        gl_FragColor = vec4(col, 1.);
      }`,
  }));
  below.position.y = -0.002; below.frustumCulled = false;
  group.add(below); surfaceOnly.push(below);

  // raios de luz descendo da superfície (planos aditivos, só aparecem submersos)
  const shaftMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uT: U.time },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uT; varying vec2 vUv; varying vec3 vW;
      void main(){
        float a = smoothstep(0., .25, vUv.x) * smoothstep(1., .75, vUv.x) * pow(vUv.y, 1.6);
        a *= .55 + .45 * sin(vW.x * 1.7 + uT * .8 + vW.z);
        float d = length(vW - cameraPosition);
        a *= smoothstep(1., 4., d) * exp(-d * .06);
        gl_FragColor = vec4(vec3(.55, .95, .9) * a * .35, 1.);
      }`,
  });
  const shafts = new THREE.Group();
  for (let i = 0; i < (mobile ? 6 : 12); i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + Math.random() * 2, 9), shaftMat);
    s.position.set(center.x - 7 + Math.random() * 14, -4.5, center.z - 7 + Math.random() * 14);
    s.rotation.set(0, Math.random() * Math.PI, 0.18);
    shafts.add(s);
  }
  group.add(shafts); surfaceOnly.push(shafts);

  // partículas em suspensão
  const PN = mobile ? 260 : 600, pg = new THREE.BufferGeometry(), pa = new Float32Array(PN * 3);
  for (let i = 0; i < PN; i++) pa.set([center.x - 9 + Math.random() * 18, -0.2 - Math.random() * 5.5, center.z - 9 + Math.random() * 18], i * 3);
  pg.setAttribute("position", new THREE.BufferAttribute(pa, 3));
  const specks = new THREE.Points(pg, new THREE.PointsMaterial({ color: "#cff6ee", size: 0.035, transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
  group.add(specks); surfaceOnly.push(specks);

  // cardume: peixes pequenos girando devagar em volta do caminho do mergulho
  const FN = mobile ? 14 : 26;
  const fishGeo = new THREE.SphereGeometry(1, 10, 6).scale(0.05, 0.07, 0.22);
  const fish = new THREE.InstancedMesh(fishGeo, new THREE.MeshStandardMaterial({ color: "#c9d6cf", roughness: 0.35, metalness: 0.5 }), FN);
  const fd = Array.from({ length: FN }, () => ({ r: 1.2 + Math.random() * 1.8, a: Math.random() * 6.28, y: -2 - Math.random() * 2.2, s: 0.25 + Math.random() * 0.2, o: Math.random() * 6 }));
  const dummy = new THREE.Object3D();
  group.add(fish); surfaceOnly.push(fish);
  scene.add(group);

  // caminho da câmera: do fim da aproximação até a água e para baixo
  // fim da aproximação → alinha no eixo → atravessa o vão → passa a margem → desce → submerso
  const path = cameraPath([
    { pos: [2.6, 2.9, 7], look: [4.5, 2.6, -10] },
    { pos: along(8, 2.6), look: along(-6, 2.4) },
    { pos: along(2.2, 2.4), look: along(-8, 2.2) },
    { pos: along(-2.5, 2.3), look: along(-12, 1.6) },          // do outro lado do vão
    { pos: along(-8, 1.6), look: along(-16, 0.2) },            // sobre a margem de trás
    { pos: along(-11.5, 0.12), look: along(-20, 0) },          // linha d'água: meio a meio
    { pos: along(-14.5, -1.6), look: along(-22, -2.8) },
    { pos: along(-19, -3.4), look: along(-28, -4.6) },
  ]);

  const camUnder = camera.clone(), camAbove = camera.clone();
  const split = { on: false, camera: camUnder, cameraAbove: camAbove, lineLeft: 0.5, lineRight: 0.5, thickness: 0.09 };
  const tmp = new THREE.PerspectiveCamera(), pos = new THREE.Vector3(), tgt = new THREE.Vector3(), fwd = new THREE.Vector3(), P = new THREE.Vector3(), R = new THREE.Vector3();
  const LENS = 0.45;                       // "raio" da lente: faixa de altura em que a câmera fica meio a meio

  function horizonY(cam, side) {
    cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    R.crossVectors(fwd, cam.up).normalize();
    P.copy(cam.position).addScaledVector(fwd, 800).addScaledVector(R, side * 300); P.y = 0;
    P.project(cam);
    return { x: P.x * 0.5 + 0.5, y: P.y * 0.5 + 0.5 };
  }

  return {
    split,
    // aplica o mergulho por cima da câmera da aproximação (v4); p = progresso do capítulo
    update(t, dt, p) {
      const b = THREE.MathUtils.smoothstep(p, DIVE_START - 0.04, DIVE_START + 0.08);
      if (b > 0) {
        const u = THREE.MathUtils.clamp((p - DIVE_START) / (1 - DIVE_START), 0, 1);
        path(tmp, u, { sway: 0.12, time: t });
        tmp.getWorldDirection(fwd); tgt.copy(tmp.position).add(fwd);
        pos.copy(camera.position).lerp(tmp.position, b);
        camera.getWorldDirection(fwd); const lookA = fwd.add(camera.position);
        camera.position.copy(pos); camera.lookAt(lookA.lerp(tgt, b));
        camera.updateMatrixWorld();
      }
      const y = camera.position.y;
      // meio a meio: duas câmeras, uma logo acima e outra logo abaixo da água, juntas no passe final
      split.on = Math.abs(y) < LENS;
      if (split.on) {
        camUnder.copy(camera); camUnder.position.y = Math.min(y, -0.04); camUnder.updateMatrixWorld();
        camAbove.copy(camera); camAbove.position.y = Math.max(y, 0.04); camAbove.updateMatrixWorld();
        const l = horizonY(camAbove, -1), r = horizonY(camAbove, 1);
        const off = (y / LENS) * 0.42;                      // quanto mais alta a câmera, mais a linha desce na tela
        const slope = (r.y - l.y) / Math.max(1e-3, r.x - l.x);
        const mid = (l.y + r.y) / 2 - off;
        split.lineLeft = mid - slope * 0.5; split.lineRight = mid + slope * 0.5;
      }
      // animação do submerso só quando dá para ver
      const vis = y < LENS;
      shafts.visible = specks.visible = fish.visible = vis;
      if (vis) {
        for (let i = 0; i < FN; i++) {
          const f = fd[i], a = f.a + t * f.s;
          dummy.position.set(center.x + Math.cos(a) * f.r, f.y + Math.sin(t * 0.9 + f.o) * 0.15, center.z - 4 + Math.sin(a) * f.r);
          dummy.rotation.set(0, -a, 0); dummy.updateMatrix(); fish.setMatrixAt(i, dummy.matrix);
        }
        fish.instanceMatrix.needsUpdate = true;
        specks.position.y = Math.sin(t * 0.2) * 0.1;
      }
      return THREE.MathUtils.smoothstep(-y, 0.0, 0.6);    // 0..1: quanto a câmera está submersa (tom do passe final)
    },
  };
}
