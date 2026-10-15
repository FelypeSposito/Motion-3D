// Chão da praça: pedra seca, levemente molhada (reflexo sutil e borrado dos neons) e UMA poça — a única superfície
// espelhada — por onde a câmera emerge do mergulho. Reflexo barato: os "refletíveis" (prédios, telões, halos, céu,
// neon) são desenhados espelhados numa textura de baixa resolução e o chão lê essa textura na posição de tela.
// Vista de baixo (câmera dentro da poça): a mesma textura guarda a cena NÃO espelhada e vira a janela de Snell da poça;
// fora da poça o chão é só água turva (continuidade com o lago do capítulo 01).
import * as THREE from "three";
import { COMMON_GLSL } from "./glsl.js";
import { PLAZA } from "./city.js";
import { ROAD_HW, CROSS, STEAM } from "./props.js";

const f1 = (v) => (+v).toFixed(2);
// detalhes do chão: asfalto da avenida com pintura gasta, faixa de pedestres, bueiros e ralos, manchas de poça
const GROUND_GLSL = /* glsl */`
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
  // tampa de bueiro: disco de ferro com aro e grade em losango
  float manhole(vec2 p, vec2 c, out float ring) {
    float d = length(p - c); ring = smoothstep(.04, 0., abs(d - .46));
    return smoothstep(.5, .47, d);
  }
  const float RW = ${f1(ROAD_HW)}, Z0 = ${f1(PLAZA.z0)}, CZ0 = ${f1(CROSS[0])}, CZ1 = ${f1(CROSS[1])};
  const vec2 STEAMC = vec2(${f1(STEAM[0])}, ${f1(STEAM[1])});
`;

export function createGround(U, mobile, puddle) {
  U.puddle = { value: new THREE.Vector3(puddle.x, puddle.z, puddle.r) };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uT: U.time, tRefl: U.refl, uScreen: U.screen, uHaze: U.haze, uFogD: U.fogD, tLight: U.light, uPuddle: U.puddle },
    defines: { TAPS: mobile ? 3 : 5 },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uT; uniform sampler2D tRefl; uniform vec2 uScreen; uniform vec3 uPuddle; varying vec3 vW;
      ${COMMON_GLSL}
      ${GROUND_GLSL}
      // contorno irregular da poça (raio que varia com o ângulo)
      float puddleMask(vec2 p, float aa) {
        vec2 q = p - uPuddle.xy; float a = atan(q.y, q.x);
        float r = uPuddle.z * (1. + .16 * sin(a * 3. + 1.3) + .09 * sin(a * 5. - .4) + .05 * sin(a * 9. + 2.));
        return smoothstep(r + aa, r - aa, length(q * vec2(1., 1.25)));
      }
      void main() {
        vec2 p = vW.xz; float t = uT;
        float d = length(cameraPosition - vW);
        vec2 suv = gl_FragCoord.xy / uScreen;
        vec3 V = normalize(cameraPosition - vW);
        vec3 L = neonLight(p);
        float pm = puddleMask(p, .03 + d * .004);
        // ondinhas só na poça (gota caindo de vez em quando + brisa)
        vec2 q = p - uPuddle.xy; float rr = length(q), ph = fract(t * .35);
        vec2 g = vec2(cos(dot(p, vec2(.8, .6)) * 5. + t * 1.4), cos(dot(p, vec2(-.5, .86)) * 7. - t * 1.9)) * .05
               + q / max(rr, 1e-3) * sin((rr - ph * 1.6) * 28.) * smoothstep(.25, 0., abs(rr - ph * 1.6)) * (1. - ph) * .25;
        if (cameraPosition.y >= 0.) {
          // pedra: lajotas 1,2 × 0,6 m em fiadas desencontradas, rejunte escuro, tom de cada peça varia
          vec2 st = p / vec2(1.2, .6); st.x += step(1., mod(floor(st.y), 2.)) * .5;
          vec2 id = floor(st), f = fract(st), fw = fwidth(st);
          float grout = smoothstep(.0, .05 + fw.x, f.x) * smoothstep(1., .95 - fw.x, f.x) * smoothstep(.0, .08 + fw.y, f.y) * smoothstep(1., .92 - fw.y, f.y);
          grout = mix(grout, .9, smoothstep(.3, .8, max(fw.x, fw.y)));       // longe: sem cintilar
          float tone = .75 + .5 * hash12(id);
          vec3 stone = vec3(.022, .021, .024) * tone * (.45 + .55 * grout);
          float wet = .35 + .45 * hash12(id * .37 + 4.);                      // manchas mais molhadas
          // avenida: asfalto com pintura gasta (faixa central tracejada, bordas, faixa de pedestres, linha de parada)
          float road = step(abs(p.x), RW) * step(p.y, Z0 - 1.);
          if (road > .5) {
            float grain = vn(p * 3.1) * .6 + vn(p * 11.) * .4;
            stone = vec3(.013, .013, .015) * (.75 + .5 * grain);
            grout = 1.;
            float paintAA = .02 + fwidth(p.x) * 1.5;
            float wear = smoothstep(.25, .6, vn(p * 2.3 + 7.)) * .7 + .3;
            float zebra = step(CZ0, p.y) * step(p.y, CZ1) * smoothstep(.45 + paintAA, .45, abs(fract(p.x / 1.1) - .5)) * step(abs(p.x), RW - .6);
            float stopl = smoothstep(.16 + paintAA, .16, abs(p.y - (CZ0 - 1.4))) * step(0., p.x) * step(p.x, RW - .3);
            float edge = smoothstep(.07 + paintAA, .07, abs(abs(p.x) - (RW - .45))) * step(p.y, CZ0 - 1.);
            float center = smoothstep(.07 + paintAA, .07, abs(abs(p.x) - .12)) * step(fract(p.y / 6.), .55) * step(p.y, CZ0 - 3.);
            stone = mix(stone, vec3(.075, .072, .068), (zebra + stopl + edge) * wear);
            stone = mix(stone, vec3(.09, .065, .018), center * wear);
            wet = .6;
          }
          // bueiros (o da avenida solta vapor) e ralos junto ao meio-fio
          float ring, mh = manhole(p, STEAMC, ring);
          float ring2, mh2 = manhole(p, vec2(3.4, -64.), ring2);
          float ring3, mh3 = manhole(p, vec2(-5.5, 24.), ring3);
          float lid = max(mh, max(mh2, mh3));
          vec2 lg = abs(fract(p * 4.2 + p.yx * 2.1) - .5);
          stone = mix(stone, vec3(.012, .011, .011) * (.8 + .6 * step(.18, min(lg.x, lg.y))), lid);
          stone += vec3(.02, .018, .016) * max(ring, max(ring2, ring3));
          float drain = step(abs(abs(p.x) - (RW + .25)), .2) * step(abs(mod(p.y + 3., 25.) - 12.5), .45) * step(p.y, Z0 - 2.);
          stone = mix(stone, vec3(.004) * (.5 + step(.5, fract(p.y * 9.))), drain);
          // manchas de poça (chuva recente): espelho fraco por cima da pedra
          float pn = vn(p * .33 + 3.) + vn(p * 1.2) * .35;
          float pm2 = smoothstep(.86, .9, pn) * (1. - pm) * (1. - lid);
          wet = mix(wet, 1.4, pm2);
          float fres = .04 + .96 * pow(1. - max(V.y, 0.), 5.);
          // reflexo: na pedra, borrado e fraco; na poça, espelho com as ondinhas
          vec2 off = mix(vec2(0.), g * vec2(.4, 1.) * .5 / (1. + d * .2), pm);
          float spread = mix(mix(.022, .01, pm2), .006, pm);
          vec3 refl = vec3(0.);
          for (int i = 0; i < TAPS; i++) {
            float k = float(i) - float(TAPS - 1) * .5;
            refl += texture2D(tRefl, clamp(suv + off + vec2(k * spread * .25, k * spread), .001, .999)).rgb;
          }
          refl /= float(TAPS);
          vec3 col = stone + L * .03 * tone;
          col += refl * fres * wet * .22 * grout;                            // chão molhado: reflexo sutil
          col = mix(col, stone * .35 + refl * (fres * .55 + .12), pm2 * .75); // manchas de poça: escuras e espelhadas
          vec3 pud = mix(vec3(.003, .004, .006), refl, clamp(fres * 1.2 + .35, 0., .95));
          col = mix(col, pud, pm);
          col *= 1. - .35 * smoothstep(.0, .5, pm) * smoothstep(1., .5, pm); // borda escura (molhada) da poça
          gl_FragColor = vec4(cityFog(col, vW, 0.), 1.);
        } else {
          // de dentro da poça: janela de Snell mostrando a praça; fora dela, só a água turva
          vec3 murky = vec3(.014, .045, .04);
          vec3 refr = texture2D(tRefl, clamp(suv + g * .08, .001, .999)).rgb;
          vec3 col = mix(murky + L * .02, refr * .9 + vec3(0., .01, .012), pm * smoothstep(.2, .6, -V.y));
          gl_FragColor = vec4(cityFog(col, vW, 0.), 1.);
        }
      }`,
  }));
  ground.frustumCulled = false;

  // partículas em suspensão no fundo turvo (só com a câmera submersa)
  const PN = mobile ? 200 : 450, pa = new Float32Array(PN * 3);
  for (let i = 0; i < PN; i++) pa.set([puddle.x - 6 + Math.random() * 12, -5.6 + Math.random() * 5.4, puddle.z - 8 + Math.random() * 14], i * 3);
  const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pa, 3));
  const specks = new THREE.Points(pg, new THREE.PointsMaterial({ color: "#7fb7c4", size: .035, transparent: true, opacity: .55, depthWrite: false, fog: false }));
  return { ground, specks };
}
