// UM único passe de tela cheia faz tudo o que vem depois da cena:
// transição entre dois capítulos + mapeamento de tons (AgX, o mesmo do Blender) + cor + vinheta + grão.
// Assim o pós-processamento custa uma leitura por pixel em vez de vários passes encadeados.
import * as THREE from "three";

export function createFinalPass() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tA: { value: null }, tB: { value: null },
      uMix: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 },
      uTint: { value: new THREE.Vector3(1, 1, 1) }, uVignette: { value: 0.85 }, uGrain: { value: 0.045 },
      uSplit: { value: 0 }, uLine: { value: new THREE.Vector2(.5, .5) }, uThick: { value: .1 }, uUnder: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tA, tB; uniform float uMix, uTime, uAspect, uVignette, uGrain, uSplit, uThick, uUnder; uniform vec3 uTint; uniform vec2 uLine;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
      void main() {
        vec2 uv = vUv;
        vec3 col = texture2D(tA, uv).rgb;
        if (uSplit > 0.) {
          // linha d'água ondulante (inclina junto com a câmera)
          float ly = mix(uLine.x, uLine.y, uv.x)
            + sin(uv.x * 6.3 + uTime * 1.2) * .014 + sin(uv.x * 15.7 - uTime * 1.9) * .007 + sin(uv.x * 33. + uTime * 2.8) * .003;
          vec2 uw = uv + vec2(sin(uv.y * 38. + uTime * 1.7) * .0018, sin(uv.x * 22. - uTime * 1.3) * .0012);
          vec3 above = texture2D(tA, uv).rgb, below = texture2D(tB, uw).rgb;
          if (uv.y >= ly) col = above;
          else if (uv.y < ly - uThick) col = below;
          else {
            // a superfície vista de lado (como na referência): vidro turquesa que refrata a paisagem no topo,
            // poucos brilhos irregulares e uma base que se dissolve no mundo submerso
            float k = (ly - uv.y) / uThick;                                    // 0 = topo da faixa, 1 = base
            float n1 = vnoise(vec2(uv.x * 7. + uTime * .35, k * 2.5)), n2 = vnoise(vec2(uv.x * 21. - uTime * .6, k * 5. + 3.));
            float wob = (n1 - .5) * .035 + (n2 - .5) * .014;
            vec3 refr = texture2D(tA, clamp(vec2(uv.x + wob, ly + .015 + k * uThick * 1.7), 0., 1.)).rgb;
            vec3 under = texture2D(tB, clamp(vec2(uv.x - wob * .6, uv.y - .008), 0., 1.)).rgb;
            vec3 glass = mix(under, vec3(.11, .24, .17), .38);
            col = mix(glass, refr * vec3(.82, .95, .86), smoothstep(.6, .0, k) * .72);
            float ln = 0.;
            for (int i = 0; i < 3; i++) {
              float fi = float(i);
              float y0 = .16 + fi * .25 + (vnoise(vec2(uv.x * 4.5 + fi * 7., uTime * .25 + fi)) - .5) * .2;
              float w = .018 + vnoise(vec2(uv.x * 9. - fi * 3., uTime * .4)) * .03;
              ln += smoothstep(w, 0., abs(k - y0)) * (.25 + .75 * vnoise(vec2(uv.x * 13. + fi * 5., uTime * .5)));
            }
            col += vec3(.92, .96, .85) * ln * .34;
            col += vec3(1., .97, .88) * smoothstep(.06, 0., k) * .55;          // menisco claro no topo
            col = mix(col, under * 1.04, smoothstep(.7, 1., k));              // a base some no submerso
          }
        } else if (uMix > 0.) {
          // transição pela água turva: a imagem desfoca e afunda num lodo verde-oliva com partículas em suspensão;
          // a troca de cena acontece escondida no pico da turvação e a água clareia de novo no capítulo seguinte
          float murk = sin(3.14159 * clamp(uMix, 0., 1.)); murk = murk * murk * (3. - 2. * murk);
          float m = smoothstep(.42, .58, uMix);                                   // troca só quando já não se vê nada
          vec2 q = vec2(uv.x * uAspect, uv.y);
          vec2 drift = (vec2(vnoise(q * 2.2 + uTime * .05), vnoise(q * 2.2 - uTime * .04 + 7.)) - .5) * .025 * murk;
          float r = .012 * murk;                                                   // desfoque cresce com a turvação
          vec2 o1 = vec2(r, r * .6), o2 = vec2(-r * .6, r);
          vec3 a = (texture2D(tA, uv + drift).rgb * 2. + texture2D(tA, uv + drift + o1).rgb + texture2D(tA, uv + drift - o1).rgb
                  + texture2D(tA, uv + drift + o2).rgb + texture2D(tA, uv + drift - o2).rgb) / 6.;
          vec3 b = (texture2D(tB, uv - drift).rgb * 2. + texture2D(tB, uv - drift + o1).rgb + texture2D(tB, uv - drift - o1).rgb
                  + texture2D(tB, uv - drift + o2).rgb + texture2D(tB, uv - drift - o2).rgb) / 6.;
          float silt = vnoise(q * 3. + vec2(uTime * .03, -uTime * .02)) * .6 + vnoise(q * 9. - uTime * .05) * .4;   // nuvens de sedimento
          vec3 mud = mix(vec3(.028, .055, .042), vec3(.06, .085, .055), silt) * (1. + (1. - uv.y) * .25);
          col = mix(mix(a, b, m), mud, murk * (.82 + silt * .18));
          col += vec3(.5, .6, .45) * smoothstep(.93, .99, vnoise(q * 60. + vec2(0., uTime * .08))) * murk * .05; // partículas
        }
        col = mix(col, col * vec3(.86, 1.0, .9) + vec3(.0, .006, .002), uUnder);   // tom submerso (lago)
        col *= uTint;
        vec2 c = uv - .5;
        col *= 1. - dot(c, c) * uVignette;
        col += (hash(uv * vec2(1731., 977.) + fract(uTime * 7.)) - .5) * uGrain * (col + .05);
        gl_FragColor = vec4(max(col, 0.), 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false,
  });
  // triângulo que cobre a tela (mais barato que um quad: sem diagonal compartilhada)
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mesh = new THREE.Mesh(geo, material); mesh.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(mesh);
  const camera = new THREE.Camera();
  return { material, render: (renderer) => { renderer.setRenderTarget(null); renderer.render(scene, camera); } };
}
