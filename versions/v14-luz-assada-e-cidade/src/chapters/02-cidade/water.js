// Chão da praça: pedra seca, levemente molhada (reflexo sutil e borrado dos neons) e UMA poça — a única superfície
// espelhada — por onde a câmera emerge do mergulho. Reflexo barato: os "refletíveis" (prédios, telões, halos, céu,
// neon) são desenhados espelhados numa textura de baixa resolução e o chão lê essa textura na posição de tela.
// Vista de baixo (câmera dentro da poça): a mesma textura guarda a cena NÃO espelhada e vira a janela de Snell da poça;
// fora da poça o chão é só água turva (continuidade com o lago do capítulo 01).
import * as THREE from "three";
import { COMMON_GLSL } from "./glsl.js";

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
          float fres = .04 + .96 * pow(1. - max(V.y, 0.), 5.);
          // reflexo: na pedra, borrado e fraco; na poça, espelho com as ondinhas
          vec2 off = mix(vec2(0.), g * vec2(.4, 1.) * .5 / (1. + d * .2), pm);
          float spread = mix(.022, .006, pm);
          vec3 refl = vec3(0.);
          for (int i = 0; i < TAPS; i++) {
            float k = float(i) - float(TAPS - 1) * .5;
            refl += texture2D(tRefl, clamp(suv + off + vec2(k * spread * .25, k * spread), .001, .999)).rgb;
          }
          refl /= float(TAPS);
          vec3 col = stone + L * .03 * tone;
          col += refl * fres * wet * .22 * grout;                            // chão molhado: reflexo sutil
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
