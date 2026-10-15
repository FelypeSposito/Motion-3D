// Avenida inundada: eixo em curva suave, prédios em duas fileiras de cada lado (UMA chamada de desenho para todos)
// e o mapa de luz dos letreiros (textura pequena calculada uma vez, usada por prédios e água como luz "assada").
import * as THREE from "three";
import { COMMON_GLSL, LIGHT_BOX } from "./glsl.js";

export const HW = 8.5;                                   // meia largura da avenida (canal de água)
const K = 0.016, A = 6;
export const axisX = (z) => Math.sin(-z * K) * A;        // eixo da avenida: S suave
export const axisDX = (z) => -Math.cos(-z * K) * A * K;  // derivada dx/dz
// lateral (perpendicular ao eixo) e direção de avanço (para -z) num ponto do eixo
export const lateral = (z) => new THREE.Vector3(1, 0, -axisDX(z)).normalize();
export const forward = (z) => new THREE.Vector3(-axisDX(z), 0, -1).normalize();

export function rng(seed = 7) {          // mulberry32: mesmo layout a cada carga
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Layout: prédios da frente (com fachada para a avenida) e de trás (silhueta). Cada prédio da frente gera uma
// "fachada" { pos, rotY, w, h } — centro da face voltada para a avenida, normal = (sin rotY, 0, cos rotY).
export function layoutCity(rnd) {
  const blocks = [], facades = [];
  for (const side of [-1, 1]) {
    for (let row = 0; row < 2; row++) {
      let z = 22;
      while (z > -232) {
        const w = row ? 10 + rnd() * 12 : 7 + rnd() * 7, zc = z - w / 2;
        const d = row ? 14 + rnd() * 10 : 9 + rnd() * 6;
        const h = row ? 34 + rnd() * 60 : (rnd() < .2 ? 9 + rnd() * 5 : 16 + rnd() * 34);
        const L = lateral(zc), off = HW + (row ? 17 : 0) + d / 2 + (row ? rnd() * 4 : 0);
        const c = new THREE.Vector3(axisX(zc), 0, zc).addScaledVector(L, side * off);
        const ry = Math.atan(axisDX(zc));
        blocks.push({ c, w, d, h, ry, row, seed: rnd() });
        if (!row) {
          const n = L.clone().multiplyScalar(-side);                            // normal da fachada (para a avenida)
          const p = c.clone().addScaledVector(n, d / 2);
          facades.push({ pos: [p.x, h / 2, p.z], rotY: Math.atan2(n.x, n.z), w, h, side, z: zc });
        }
        z -= w + (row ? rnd() * 3 : 0.4 + rnd() * 1.2);
      }
    }
  }
  // fundo da avenida: uma fileira atravessada fecha a vista no fim do trajeto
  for (let i = -3; i <= 3; i++) {
    const zc = -236, w = 12, c = new THREE.Vector3(axisX(zc) + i * 12.5, 0, zc);
    blocks.push({ c, w: 10, d: w, h: 30 + rnd() * 50, ry: 0, row: 1, seed: rnd() });
  }
  return { blocks, facades };
}

export const SUB = 7;                                    // os prédios descem até 7 m abaixo d'água

// Peças de prédio (UMA chamada de desenho para tudo). aKind: 0 = corpo da frente (com vitrines no térreo),
// 1 = cornija/laje (pedra lisa), 2 = recuo do topo (janelas, sem térreo), 3 = corpo de fundo (sem vitrines).
// Bloco sem y0 é o corpo principal e desce até SUB abaixo do chão; com y0, começa nessa altura.
export function createBuildings(blocks, U, mobile) {
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const seeds = new Float32Array(blocks.length), kinds = new Float32Array(blocks.length);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: U.time, uClip: U.clip, uHaze: U.haze, uFogD: U.fogD, tLight: U.light },
    vertexShader: /* glsl */`
      attribute float aSeed, aKind;
      varying vec3 vW, vR, vN, vL; varying float vSeed, vKind; varying vec3 vSc;
      void main() {
        vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec4 ip = instanceMatrix * vec4(position, 1.);
        vR = ip.xyz;                                  // posição real (antes do espelho do reflexo)
        vL = position * vSc; vN = normal; vSeed = aSeed; vKind = aKind;
        vec4 w = modelMatrix * ip; vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uT, uClip;
      varying vec3 vW, vR, vN, vL; varying float vSeed, vKind; varying vec3 vSc;
      ${COMMON_GLSL}
      void main() {
        if (uClip > .5 && vR.y < 0.) discard;          // reflexo/refração: só a parte acima do chão
        vec3 n = abs(vN);
        vec3 L = neonLight(vR.xz);
        float lift = smoothstep(-1., 4., vR.y) * (1. - smoothstep(18., 48., vR.y));   // luz dos letreiros: forte embaixo, some no alto
        vec3 col;
        if (vKind > .5 && vKind < 1.5) {
          // cornija / laje: pedra mais clara; a borda pega a luz dos letreiros
          col = vec3(.034, .031, .034) * (n.y > .5 ? .55 : 1.) + L * (.07 * lift + .012);
        } else if (n.y > .5) col = vec3(.008, .008, .012) + L * .004;    // telhado
        else {
          vec3 V = normalize(cameraPosition - vW);
          vec2 fc = vec2(n.x > .5 ? vL.z : vL.x, vR.y);                    // andares alinhados entre corpo e recuos
          vec2 fw0 = fwidth(fc);
          if (fract(vSeed * 7.31) < .33) {
            // cortina de vidro: montantes finos, reflete o céu/névoa e os letreiros; andares de escritório acesos
            vec2 g = fc / vec2(1.5, 3.3), id = floor(g), f = fract(g), fw = fwidth(g);
            float pane = smoothstep(.0, .06 + fw.x, f.x) * smoothstep(1., .94 - fw.x, f.x) * smoothstep(.0, .1 + fw.y, f.y) * smoothstep(1., .9 - fw.y, f.y);
            float fres = .1 + .9 * pow(1. - abs(dot(vN, V)), 4.);
            vec3 sky = mix(uHaze * .9, vec3(.003, .003, .008), clamp(vR.y / 90., 0., 1.));
            float floorLit = step(.58, hash12(vec2(id.y, vSeed * 13.)));
            float h = hash12(id + vSeed * 5.);
            vec3 office = vec3(.32, .42, .58) * (.05 + .16 * h) * step(.45, h) * floorLit * step(1.5, vR.y);
            vec3 glass = sky * fres + L * (.025 + .09 * fres) * (.4 + .6 * lift) + office;
            vec3 detail = mix(vec3(.009, .009, .012), glass, pane);
            vec3 avg = sky * fres * .8 + L * .05 * lift + floorLit * vec3(.32, .42, .58) * .05;
            col = mix(detail, avg, smoothstep(.35, .9, max(fw.x, fw.y)));
          } else {
            // alvenaria: janelas recortadas, pilastra a cada 4 vãos e faixa de pedra a cada 5 andares
            vec2 g = fc / vec2(1.9, 3.3), id = floor(g), f = fract(g), fw = fwidth(g);
            float win = smoothstep(.24, .24 + fw.x, f.x) * smoothstep(.76, .76 - fw.x, f.x) * smoothstep(.3, .3 + fw.y, f.y) * smoothstep(.78, .78 - fw.y, f.y);
            float pier = 1. - step(.5, mod(id.x, 4.)), band = step(3.5, mod(id.y, 5.));
            win *= (1. - pier) * (1. - band);
            float r = hash12(id + vSeed * 91.7);
            float lit = step(.76, r) * step(1.5, vR.y);
            vec3 wc = mix(vec3(1., .6, .3), vec3(.55, .75, 1.), step(.78, fract(r * 13.))) * (.15 + fract(r * 31.) * .75);
            vec3 facade = vec3(.016, .016, .022) * (.7 + .6 * hash12(vec2(id.x, vSeed)));
            facade += max(pier, band) * (vec3(.005, .0045, .005) + L * .015 * lift);     // pilastras e faixas salientes pegam luz
            vec3 detail = facade + win * (lit * wc * 1.3 + (1. - lit) * vec3(.008, .01, .016));
            vec3 avg = facade + vec3(.9, .7, .55) * .018;
            col = mix(detail, avg, smoothstep(.35, .9, max(fw.x, fw.y)));
          }
          // térreo dos prédios da frente: vitrines de loja acesas (vãos de 3 m), travessa e faixa escura do letreiro
          if (vKind < .5 && vR.y > 0. && vR.y < 5.4) {
            float bx = fc.x / 3., fb = fract(bx), fwb = fw0.x / 3.;
            float frame = smoothstep(.0, .035 + fwb, fb) * smoothstep(1., .965 - fwb, fb);
            float hb = hash12(vec2(floor(bx), vSeed * 3.));
            vec3 shop = mix(vec3(1., .62, .32), vec3(.6, .78, 1.), step(.72, hb)) * (.008 + .07 * hb) * step(.42, hb);
            shop *= (.5 + .5 * smoothstep(0., 3., vR.y)) * (.75 + .25 * sin(fb * 6.283 * 2. + hb * 9.));   // interior irregular
            float transom = step(3., vR.y) * step(vR.y, 3.22);
            col = vR.y < 4.4 ? shop * frame * (1. - transom) + vec3(.006, .006, .008) * (1. - frame)
                             : vec3(.007, .006, .009) + L * .06;
          }
          // quinas mais escuras (oclusão barata)
          float ex = (.5 - abs(n.x > .5 ? vL.z / vSc.z : vL.x / vSc.x)) * (n.x > .5 ? vSc.z : vSc.x);
          col *= .55 + .45 * smoothstep(0., 1.2, ex);
          col += L * .045 * lift;
          // parte enterrada (vista de dentro da poça): lodo escuro
          if (vR.y < 0.) col = mix(vec3(.01, .03, .028), col * .3, exp(vR.y * .8)) + L * .01;
        }
        gl_FragColor = vec4(cityFog(col, vW, vR.y), 1.);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, blocks.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  blocks.forEach((b, i) => {
    const base = b.y0 == null;
    q.setFromAxisAngle(up, b.ry); s.set(b.d, base ? b.h + SUB : b.h, b.w);
    m.compose(new THREE.Vector3(b.c.x, base ? -SUB : b.y0, b.c.z), q, s); mesh.setMatrixAt(i, m);
    seeds[i] = b.seed; kinds[i] = b.kind ?? (b.row ? 3 : 0);
  });
  geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  geo.setAttribute("aKind", new THREE.InstancedBufferAttribute(kinds, 1));
  mesh.computeBoundingSphere();
  return mesh;
}

// Mapa de luz: soma das fontes (telões, neons) com queda pela distância, numa textura 64×192 RGBA8.
export function bakeLightMap(sources, mobile) {
  const W = 64, H = 192, data = new Uint8Array(W * H * 4), { x0, x1, z0, z1 } = LIGHT_BOX;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + (i + .5) / W * (x1 - x0), z = z0 + (j + .5) / H * (z1 - z0);
    let r = 0, g = 0, b = 0;
    for (const s of sources) {
      const dx = x - s.x, dz = z - s.z, k = s.i / (1 + (dx * dx + dz * dz) / 30);
      r += s.c.r * k; g += s.c.g * k; b += s.c.b * k;
    }
    const o = (j * W + i) * 4;
    data[o] = Math.min(255, r / 4 * 255); data[o + 1] = Math.min(255, g / 4 * 255); data[o + 2] = Math.min(255, b / 4 * 255); data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return tex;
}

// ---- PRAÇA FIXA (estilo Times Square, sem marcas): praça aberta em primeiro plano, avenida que afunila até uma
// torre estreita coberta de telões no ponto de fuga. Prédios alinhados aos eixos; cada face voltada para o espaço
// aberto vira uma fachada { pos (centro da face, y = h/2), rotY (normal = (sin, 0, cos)), w, h }.
export const PLAZA = { hw: 18, z0: -8, z1: 34, ahw: 9, tower: { x: 0, z: -96, sx: 14, sz: 12, h: 92 } };

export function layoutPlaza(rnd) {
  const blocks = [], facades = [], roof = [];
  // topo de prédio de Nova York: cornija saliente, 0–2 recuos (cada um com sua cornija) e, no telhado,
  // caixa d'água e/ou antena (com luz vermelha). Os recuos usam a semente do corpo (mesmo estilo de fachada).
  const crown = (x, z, sx, sz, h, seed) => {
    const slab = (w, d, y) => blocks.push({ c: new THREE.Vector3(x, 0, z), d: w, w: d, h: .7, y0: y - .7, ry: 0, kind: 1, seed });
    slab(sx + .7, sz + .7, h);
    let cx = sx, cz = sz, y = h;
    const tiers = rnd() < .65 ? (rnd() < .4 ? 2 : 1) : 0;
    for (let t = 0; t < tiers; t++) {
      const ins = 1.4 + rnd() * 2.4;
      if (cx - 2 * ins < 4 || cz - 2 * ins < 4) break;
      cx -= 2 * ins; cz -= 2 * ins;
      const th = 5 + rnd() * 13;
      blocks.push({ c: new THREE.Vector3(x, 0, z), d: cx, w: cz, h: th, y0: y, ry: 0, kind: 2, seed });
      y += th; slab(cx + .5, cz + .5, y);
    }
    if (rnd() < .55) roof.push({ kind: "tank", x: x + (rnd() - .5) * cx * .5, z: z + (rnd() - .5) * cz * .5, y, s: .8 + rnd() * .5 });
    if (rnd() < .35) roof.push({ kind: "antenna", x: x + (rnd() - .5) * cx * .4, z: z + (rnd() - .5) * cz * .4, y, h: 5 + rnd() * 12 });
  };
  // caixa alinhada: centro (x, z), tamanho (sx, sz), altura h
  const box = (x, z, sx, sz, h, faces = [], row = 0) => {
    const seed = rnd();
    blocks.push({ c: new THREE.Vector3(x, 0, z), d: sx, w: sz, h, ry: 0, row, seed });
    crown(x, z, sx, sz, h, seed);
    for (const f of faces) {                         // '+x' | '-x' | '+z' com faixa visível opcional [a, b]
      const [dir, a, b] = f;
      if (dir === "+x" || dir === "-x") {
        const s = dir === "+x" ? 1 : -1, z0 = a ?? z - sz / 2, z1 = b ?? z + sz / 2;
        facades.push({ pos: [x + s * sx / 2, h / 2, (z0 + z1) / 2], rotY: s * Math.PI / 2, w: z1 - z0, h });
      } else {
        const x0 = a ?? x - sx / 2, x1 = b ?? x + sx / 2;
        facades.push({ pos: [(x0 + x1) / 2, h / 2, z + sz / 2], rotY: 0, w: x1 - x0, h });
      }
    }
  };
  const { hw, z0, z1, ahw, tower: T } = PLAZA;
  for (const s of [-1, 1]) {
    const fx = s < 0 ? "+x" : "-x";
    // laterais da praça (prédios altos com telões enormes)
    let z = z1;
    for (const w of [11, 13, 11, 7]) { box(s * (hw + 8), z - w / 2, 16, w, 42 + rnd() * 38, [[fx]]); z -= w; }
    // "ombro": prédio da esquina da avenida, com a face voltada para a praça (bem de frente para a câmera)
    const sh = 46 + rnd() * 30;
    box(s * (ahw + 8), z0 - 7, 16, 14, sh, [[fx], ["+z", s < 0 ? -hw : ahw, s < 0 ? -ahw : hw]]);
    facades.at(-1).corner = s;
    // avenida até a torre
    z = z0 - 14;
    while (z > -112) { const w = 9 + rnd() * 6; box(s * (ahw + 8), z - w / 2, 16, w, 30 + rnd() * 45, [[fx]]); z -= w + .4; }
    // silhueta atrás (mais alta, sem fachada)
    for (let k = 0; k < 5; k++) box(s * (hw + 30 + rnd() * 8), z1 - k * 26 - 10, 22, 22, 70 + rnd() * 50, [], 1);
  }
  // torre do ponto de fuga (telões empilhados na frente) + quarteirões atrás dela e fechando a praça atrás da câmera
  box(T.x, T.z, T.sx, T.sz, T.h, [["+z"]]); facades.at(-1).noAuto = facades.at(-1).tower = true;
  for (let i = -3; i <= 3; i++) if (i) box(i * 13, -140, 12, 16, 40 + rnd() * 50, [], 1);
  for (let i = -2; i <= 2; i++) box(i * 15, z1 + 9, 14, 16, 30 + rnd() * 30, [], 1);
  return { blocks, facades, roof };
}

// telões dos projetos (posições à mão, pensadas para os enquadramentos)
export function plazaHeroScreens() {
  const { hw, z0, ahw, tower: T } = PLAZA, V = (x, y, z) => new THREE.Vector3(x, y, z), fz = T.z + T.sz / 2 + .15;
  const R = Math.PI / 2;
  return [
    { p: V(0, 16, fz), W: 11.5, H: 6.5, rotY: 0, project: 0 },            // torre
    { p: V(0, 30, fz), W: 11.5, H: 6.5, rotY: 0, project: 1 },
    { p: V(0, 9.2, fz), W: 11.5, H: 4.2, rotY: 0 },
    { p: V(0, 23, fz), W: 11.5, H: 5, rotY: 0 },
    { p: V(0, 37.5, fz), W: 11.5, H: 5.5, rotY: 0 },
    { p: V(0, 46, fz), W: 9, H: 9, rotY: 0 },
    { p: V(-hw + .15, 15, 13), W: 16, H: 9, rotY: R, project: 2 },         // laterais da praça
    { p: V(hw - .15, 13, 10), W: 14, H: 8, rotY: -R, project: 3 },
    { p: V(-(ahw + hw) / 2, 13, z0 + .15), W: 7.5, H: 12, rotY: 0, project: 4 },   // ombros (de frente para a praça)
    { p: V((ahw + hw) / 2, 17, z0 + .15), W: 8.5, H: 4.8, rotY: 0, project: 5 },
    { p: V((ahw + hw) / 2, 9.5, z0 + .15), W: 8.5, H: 4.8, rotY: 0 },
    { p: V(-hw + 1, 27, z0 + 1), W: 6.5, H: 9.5, rotY: Math.PI / 4, project: 6 },  // chanfro das esquinas (45°)
    { p: V(hw - 1, 25, z0 + 1), W: 6.5, H: 9.5, rotY: -Math.PI / 4, project: 7 },
  ];
}
