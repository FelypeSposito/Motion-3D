// Capítulo 02 — praça dos letreiros (cenário FIXO, estilo Times Square, sem marcas reais).
// A câmera sai do fundo turvo (continuidade com o lago do cap. 01) por dentro de uma POÇA no chão da praça, no mesmo
// "meio a meio" do mergulho, rente ao chão, e sobe para o primeiro enquadramento. Depois a rolagem não "anda":
// passa por uma sequência de PLANOS fixos (geral, torre, contra-plongée, esquina, lateral, grua), cada um com um
// movimento mínimo, parallax leve do mouse e respiração; a troca de plano é um corte com fade rápido (por tempo).
// Cada telão de projeto está em projects.js. Sem luzes nem sombras em tempo real: emissivo + halos + mapa de luz.
import * as THREE from "three";
import { cameraPath, gradientSky, smoothPointer } from "../../core/scene-kit.js";
import { layoutPlaza, plazaHeroScreens, createBuildings, bakeLightMap, rng } from "./city.js";
import { createScreens } from "./screens.js";
import { createGround } from "./water.js";
import { createStreet } from "./props.js";
import { createFog } from "./fog.js";
import { COMMON_GLSL } from "./glsl.js";

// letreiros neon da praça: módulo de outro agente (src/chapters/02-cidade/neon/). Se não existir, segue sem.
const NEON_MOD = import.meta.glob("./neon/index.js");

const PUDDLE = { x: 0, z: 14, r: 1.7 };
const v3 = (a) => new THREE.Vector3(...a);
// planos: [p0, p1] da rolagem do capítulo, posição/alvo no começo (a) e no fim (b) — movimento curto e lento
const SHOTS = [
  { p: [0.18, 0.33], a: [[0, 3.2, 26], [0, 13, -70]], b: [[0, 3.6, 25], [0, 13.5, -70]] },          // plano geral (a foto)
  { p: [0.33, 0.48], a: [[1.6, 2.2, -52], [0, 28, -90]], b: [[1.1, 2.4, -55], [0, 31, -90]] },      // torre de telões
  { p: [0.48, 0.62], a: [[-7, 1.2, 7], [-18, 15, 13]], b: [[-7.5, 1.3, 8.5], [-18, 16, 13]] },      // contra-plongée esquerda
  { p: [0.62, 0.76], a: [[6, 3, 6], [14, 17, -8]], b: [[7, 3.4, 5], [15, 19, -8]] },                // esquina direita
  { p: [0.76, 0.88], a: [[5, 1.8, 16], [18, 12, 10]], b: [[6, 2, 14.5], [18, 13, 10]] },            // lateral direita
  { p: [0.88, 1.01], a: [[0, 4, 30], [0, 13, -70]], b: [[0, 10, 31], [0, 12, -70]] },               // grua final
].map((s) => ({ p: s.p, a: s.a.map(v3), b: s.b.map(v3) }));
const EMERGE_END = SHOTS[0].p[0];

export async function create(ctx) {
  const { quality } = ctx, mobile = quality.mobile;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1100);

  // uniforms compartilhados por todos os materiais do capítulo (clip = descarta o que está abaixo do chão)
  const U = {
    time: { value: 0 }, clip: { value: 1 }, refl: { value: null }, screen: { value: new THREE.Vector2(1, 1) },
    haze: { value: new THREE.Color(0.03, 0.017, 0.045) }, fogD: { value: 0.009 }, light: { value: null },
  };

  const rnd = rng(20261014);
  const { blocks, facades, roof } = layoutPlaza(rnd);
  const heroes = plazaHeroScreens();
  // fachadas com telão de projeto não recebem telão automático nem neon
  for (const f of facades) for (const h of heroes) {
    const n = [Math.sin(f.rotY), Math.cos(f.rotY)], dx = h.p.x - f.pos[0], dz = h.p.z - f.pos[2];
    if (Math.abs(h.rotY - f.rotY) < 1e-3 && Math.abs(dx * n[0] + dz * n[1]) < .5 && Math.abs(dx * n[1] - dz * n[0]) < f.w / 2 + h.W / 2) f.noAuto = f.hero = true;
  }
  const buildings = createBuildings(blocks, U, mobile);
  const screens = await createScreens({ facades, U, mobile, rnd, fixed: heroes, fill: .5 });

  let neon = null;
  const loadNeon = NEON_MOD["./neon/index.js"];
  if (loadNeon) {
    try {
      const m = await loadNeon();
      const layout = facades.filter((f) => !f.screen && !f.hero && !f.tower).map((f) => ({ pos: [f.pos[0], 0, f.pos[2]], rotY: f.rotY, w: f.w, h: f.h }));
      neon = m.createNeon({ quality, wakeAt: 0.06, origin: [PUDDLE.x, 0, PUDDLE.z], layout });   // neon espera a base da fachada
    } catch (e) { console.warn("[cidade] neon indisponível:", e); neon = null; }
  }

  // mobiliário, meio-fio e telhados (os postes iluminam o chão pelo mapa de luz)
  const street = createStreet(U, mobile, roof, facades);

  // mapa de luz: telões + neons (se houver) + postes, calculado uma vez
  const sources = [...screens.lights, ...street.lights];
  for (const l of neon?.lights ?? []) {               // pos pode vir como Vector3 ou [x,y,z]; intensidade de repouso = base
    const x = l.pos.isVector3 ? l.pos.x : l.pos[0], z = l.pos.isVector3 ? l.pos.z : l.pos[2];
    sources.push({ x, z, c: new THREE.Color(l.color), i: (l.base ?? l.intensity ?? 1) * 0.12 });   // o neon já traz a própria luz na parede
  }
  U.light.value = bakeLightMap(sources, mobile);

  const sky = gradientSky({ top: "#020208", horizon: "#2a1030", bottom: "#05030a", radius: 900 });
  sky.material.uniforms.uHor.value.multiplyScalar(0.55);

  // estátua + mastro de luz no centro da praça (bronze escuro com a luz dos letreiros)
  const bronze = new THREE.ShaderMaterial({
    uniforms: { uHaze: U.haze, uFogD: U.fogD, tLight: U.light },
    vertexShader: `varying vec3 vW, vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`varying vec3 vW, vN; ${COMMON_GLSL}
      void main(){ vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
        float rim = pow(1. - abs(dot(n, v)), 3.);
        vec3 col = vec3(.012, .01, .009) + neonLight(vW.xz) * (.03 + rim * .25);
        gl_FragColor = vec4(cityFog(col, vW, vW.y), 1.); }`,
  });
  const statue = new THREE.Group();
  const add = (g, x, y, z) => { const m = new THREE.Mesh(g, bronze); m.position.set(x, y, z); statue.add(m); return m; };
  add(new THREE.BoxGeometry(2.6, 1.6, 2.6), 0, 0.8, 4);
  add(new THREE.CylinderGeometry(0.32, 0.45, 2.6, 12), 0, 2.9, 4);
  add(new THREE.SphereGeometry(0.3, 12, 8), 0, 4.45, 4);
  add(new THREE.CylinderGeometry(0.07, 0.11, 9, 8), 3.4, 4.5, 1.5);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.1, 1.2), fog: false }));
  lamp.position.set(3.4, 9.1, 1.5); statue.add(lamp);

  // "refletíveis": tudo o que aparece no reflexo do chão/poça (o grupo é espelhado em y no passe do reflexo)
  const mirror = new THREE.Group();
  mirror.add(buildings, screens.group, sky, statue, street.group);
  if (neon) mirror.add(neon.group);
  const { ground, specks } = createGround(U, mobile, PUDDLE);
  const fog = createFog(U, mobile);
  scene.add(mirror, ground, specks, fog.group);

  // ---- câmera
  // emersão: do fundo turvo, sobe pela poça olhando para cima e recua rente ao chão até o primeiro plano
  const emerge = cameraPath([
    { pos: [0, -2.8, PUDDLE.z + .6], look: [0, 2, PUDDLE.z - 5] },
    { pos: [0, -1.3, PUDDLE.z + .3], look: [0, 3, PUDDLE.z - 10] },
    { pos: [0, -0.15, PUDDLE.z + .1], look: [0, 4, PUDDLE.z - 18] },
    { pos: [0, 0.45, PUDDLE.z + .7], look: [0, 6, -30] },
    { pos: [0, 1.6, PUDDLE.z + 5], look: [0, 10, -55] },
    { pos: SHOTS[0].a[0].toArray(), look: SHOTS[0].a[1].toArray() },
  ]);
  const shotAt = (p) => { let i = 0; while (i < SHOTS.length - 1 && p >= SHOTS[i].p[1]) i++; return i; };
  let shown = 0, fade = 1;                              // plano na tela e multiplicador de exposição (corte com fade)
  const P = new THREE.Vector3(), Lk = new THREE.Vector3(), R = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

  // meio a meio (mesma lente do mergulho): duas câmeras, uma logo acima e outra logo abaixo da superfície
  const LENS = 0.45;
  const camUnder = camera.clone(), camAbove = camera.clone();
  const split = { on: false, camera: camUnder, cameraAbove: camAbove, lineLeft: 0.5, lineRight: 0.5, thickness: 0.09 };
  const fwd = new THREE.Vector3(), RR = new THREE.Vector3(), PP = new THREE.Vector3();
  function horizonY(cam, side) {
    cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    RR.crossVectors(fwd, cam.up).normalize();
    PP.copy(cam.position).addScaledVector(fwd, 800).addScaledVector(RR, side * 300); PP.y = 0;
    PP.project(cam);
    return { x: PP.x * 0.5 + 0.5, y: PP.y * 0.5 + 0.5 };
  }

  let prog = 0, underAmt = 1;
  function update(t, dt) {
    U.time.value = t;
    const ptr = smoothPointer(dt, 4);
    const p = THREE.MathUtils.clamp(prog, 0, 1);
    if (p < EMERGE_END) {
      // emersão contínua (sem corte); parallax cresce quando sai da água
      const k = THREE.MathUtils.smoothstep(p, 0.08, EMERGE_END);
      emerge(camera, p / EMERGE_END, { sway: 0.05 + 0.05 * k, px: ptr.sx * 0.8 * k, py: ptr.sy * 0.4 * k, time: t });
      shown = 0; fade = Math.min(1, fade + dt / 0.45);
    } else {
      const target = shotAt(p);
      if (target !== shown) { fade -= dt / 0.22; if (fade <= 0) { fade = 0; shown = target; } }
      else fade = Math.min(1, fade + dt / 0.45);
      const s = SHOTS[shown];
      const l = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp((p - s.p[0]) / (s.p[1] - s.p[0]), 0, 1), 0, 1);
      P.lerpVectors(s.a[0], s.b[0], l); Lk.lerpVectors(s.a[1], s.b[1], l);
      // parallax do mouse (lateral/vertical ao olhar) + respiração mínima
      R.subVectors(Lk, P).cross(UP).normalize();
      P.addScaledVector(R, ptr.sx * 0.7 + Math.sin(t * 0.23) * 0.06); P.y += -ptr.sy * 0.35 + Math.sin(t * 0.31 + 0.7) * 0.04;
      Lk.addScaledVector(R, ptr.sx * 1.2); Lk.y -= ptr.sy * 0.8;
      camera.position.copy(P); camera.lookAt(Lk);
    }
    camera.rotateZ(-ptr.sx * 0.02 + Math.sin(t * 0.27) * 0.003);
    camera.updateMatrixWorld();
    const y = camera.position.y;
    split.on = Math.abs(y) < LENS;
    if (split.on) {
      camUnder.copy(camera); camUnder.position.y = Math.min(y, -0.04); camUnder.updateMatrixWorld();
      camAbove.copy(camera); camAbove.position.y = Math.max(y, 0.04); camAbove.updateMatrixWorld();
      const l = horizonY(camAbove, -1), r = horizonY(camAbove, 1);
      const off = (y / LENS) * 0.42, slope = (r.y - l.y) / Math.max(1e-3, r.x - l.x), mid = (l.y + r.y) / 2 - off;
      split.lineLeft = mid - slope * 0.5; split.lineRight = mid + slope * 0.5;
    }
    sky.position.copy(camera.position);
    specks.position.y = Math.sin(t * 0.2) * 0.1;
    screens.update(camera, dt);
    street.update(camera);
    fog.update(t, camera);
    neon?.update(t, dt, { progress: prog, camera });
    underAmt = THREE.MathUtils.smoothstep(-y, 0, 0.6);
  }

  // ---- desenho: 1) passe baixo-res dos refletíveis (espelhado acima do chão / direto abaixo); 2) cena completa
  const rtOpts = { type: THREE.HalfFloatType, depthBuffer: true };
  const rtMain = new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, samples: quality.msaa });
  const rtUnder = new THREE.WebGLRenderTarget(1, 1, rtOpts);          // vista submersa do meio a meio (meia resolução)
  const rtRefl = new THREE.WebGLRenderTarget(1, 1, rtOpts);
  U.refl.value = rtRefl.texture;
  const REFL_SCALE = mobile ? 0.33 : 0.5;

  function render(r, cam = camera) {
    if (cam === camera && split.on) cam = camAbove;
    const under = cam.position.y < 0, rt = cam === camUnder ? rtUnder : rtMain;
    mirror.scale.y = under ? 1 : -1;
    ground.visible = specks.visible = fog.group.visible = false;   // névoa fora do reflexo
    r.setRenderTarget(rtRefl); r.setClearColor(0x000000, 1); r.clear(); r.render(scene, cam);
    mirror.scale.y = 1;
    ground.visible = true; specks.visible = under; fog.group.visible = !under;
    U.screen.value.set(rt.width, rt.height);
    r.setRenderTarget(rt); r.setClearColor(under ? 0x030b0a : 0x050310, 1); r.clear(); r.render(scene, cam);
    return rt.texture;
  }

  return {
    scene, camera, clearColor: 0x000000,
    toneMapping: THREE.ACESFilmicToneMapping,
    get exposure() { return 0.95 * fade; },             // corte entre planos: fade rápido pelo preto
    // submerso: igual ao fim do prado (vinheta .95, grão .04); na praça, um pouco mais de grão (noite filmada)
    get post() { return { vignette: 0.95 - 0.1 * (1 - underAmt), grain: 0.04 + 0.015 * (1 - underAmt) }; },
    get split() { return split; },
    get underwater() { return underAmt; },
    nightLocked: true, isNight: true,
    setProgress(p) { prog = p; },
    update, render,
    resize(w, h) {
      camera.aspect = w / h; camera.fov = w < h ? 68 : 55; camera.updateProjectionMatrix();
      const d = quality.dpr, W = Math.round(w * d), H = Math.round(h * d);
      rtMain.setSize(W, H); rtUnder.setSize(Math.round(W / 2), Math.round(H / 2));
      rtRefl.setSize(Math.round(W * REFL_SCALE), Math.round(H * REFL_SCALE));
    },
    // API dos telões (vídeo mosaico, pôster) e fachadas para outros módulos
    screens, facades,
    dispose() { rtMain.dispose(); rtUnder.dispose(); rtRefl.dispose(); screens.dispose(); U.light.value.dispose(); neon?.dispose?.(); },
  };
}
