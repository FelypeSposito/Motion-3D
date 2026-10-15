// Shaders dos letreiros. Modos (aA.x):
// 0 fixo (piscada rara de tubo velho) · 1 letra a letra (seq = ordem) · 2 perseguição de lâmpadas (seq = índice)
// 3 subida (onda de baixo p/ cima, por pixel, dentro de aB.yz) · 4 tubo com defeito · 5 rolagem p/ cima (janela aB.yz)
// 6 pulso correndo pelo tubo (seq = fração do comprimento) · 7 alterna dois grupos (seq 0/1)
// "e" = tempo desde que o trecho acordou: min(despertar, subida pela altura) → partida com tremulação, depois aceso.

const common = /* glsl */`
  uniform float uTime, uWake, uClimb, uProgress;
  float h1(float x) { return fract(sin(x) * 43758.5453); }
  // tempo desde que acordou (cascata: aW = atraso do trecho; uClimb = altura até onde as luzes já subiram)
  float awake(float w, float y) { return min(uWake - w, (uClimb - y) * .3); }
  // partida de reator: pisca irregular nos primeiros ~0,7 s, depois firme
  float boot(float e, float seed) {
    float on = clamp(e * 3., 0., 1.);
    float fl = step(.42, h1(floor(e * 24.) + seed * 31.));
    return on * mix(fl, 1., smoothstep(.45, .75, e));
  }
  // piscada rara: ~1 janela em 10 (1,6 s) com falhas rápidas
  float rare(float seed) {
    float win = floor(uTime * .6 + seed * 13.);
    return h1(win * 1.7 + seed * 71.) > .9 ? mix(.05, 1., step(.45, h1(floor(uTime * 26.) + seed * 17.))) : 1.;
  }
`;

const fogPars = /* glsl */`
  #ifdef USE_FOG
    uniform vec3 fogColor; varying float vFogDepth;
    #ifdef FOG_EXP2
      uniform float fogDensity;
    #else
      uniform float fogNear, fogFar;
    #endif
    float fogF() {
      #ifdef FOG_EXP2
        return 1. - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        return smoothstep(fogNear, fogFar, vFogDepth);
      #endif
    }
  #else
    float fogF() { return 0.; }
  #endif
`;
const fogVert = `#ifdef USE_FOG
    varying float vFogDepth;
  #endif`;

export const tubeVS = /* glsl */`
  attribute vec4 aQ;   // s, t (m, no quad da cápsula), L comprimento, r raio do tubo
  attribute vec3 aCol;
  attribute vec4 aA;   // modo, semente, seq, atraso de despertar
  attribute vec3 aB;   // parâmetro (período/velocidade), janela y0, y1
  attribute vec3 aR;   // altura da revelação, atraso do letreiro, y do centro do trecho
  ${common}
  ${fogVert}
  varying vec2 vQ; varying vec3 vCol; varying vec4 vP; varying vec3 vB; varying float vY;
  void main() {
    vec3 p = position;
    float mode = aA.x, seed = aA.y, seq = aA.z;
    // revelação: o conteúdo sobe de dentro da moldura enquanto o letreiro acorda
    if (aR.x > 0.) p.y -= aR.x * (1. - smoothstep(0., 1., (uWake - aR.y) * .55));
    // rolagem contínua para cima (duas cópias empilhadas → sem emenda)
    if (mode > 4.5 && mode < 5.5) p.y += mod(uTime * aB.x + uProgress * 4., aB.z - aB.y);
    float e = awake(aA.w, aR.z);
    float lum = boot(e, seed);
    if (mode < .5) lum *= rare(seed);
    else if (mode < 1.5) {                       // letra a letra: monta, segura, pisca duas vezes, apaga
      float c = fract(uTime / aB.x + seed);
      float lit = c < .42 ? smoothstep(seq * .38, seq * .38 + .01, c) : c < .8 ? 1. : c < .9 ? step(.5, fract(c * 40.)) : c < .965 ? 1. : 0.;
      lum *= mix(.03, 1., lit) * rare(seed + 3.);
    } else if (mode < 2.5) {                     // perseguição: 1 acesa a cada 3
      float k = mod(seq - floor(uTime * aB.x), 3.);
      lum *= k < .5 ? 1. : .1;
    } else if (mode < 3.5) {
      // calculado por pixel no fragment
    } else if (mode < 4.5) {                     // defeito: rajadas de falha + zumbido
      float burst = step(.55, h1(floor(uTime * 1.3 + seed * 5.) + seed));
      lum *= mix(1., step(.35, h1(floor(uTime * 17.) + seed * 9.)) * (.75 + .25 * sin(uTime * 110. + seed)), burst);
    } else if (mode < 5.5) lum *= rare(seed);
    else if (mode < 6.5) lum *= .35 + .65 * pow(.5 + .5 * sin(uTime * aB.x - seq * 9.), 2.);
    else lum *= step(.5, fract(uTime * aB.x * .5 + seq * .5)) * .97 + .03;
    vQ = aQ.xy; vCol = aCol; vP = vec4(aQ.zw, lum, mode); vB = vec3(aB.y, aB.z, seed + aB.x * 7.); vY = p.y;
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    #ifdef USE_FOG
      vFogDepth = -mv.z;
    #endif
    gl_Position = projectionMatrix * mv;
  }`;

export const tubeFS = /* glsl */`
  precision highp float;
  uniform float uTime, uHalo, uGain, uProgress;
  ${fogPars}
  varying vec2 vQ; varying vec3 vCol; varying vec4 vP; varying vec3 vB; varying float vY;
  void main() {
    float L = vP.x, R = vP.y, lum = vP.z, mode = vP.w;
    // distância ao eixo do tubo (cápsula: segmento de 0 a L)
    float dx = max(max(-vQ.x, vQ.x - L), 0.);
    float d = length(vec2(dx, vQ.y));
    float fw = max(fwidth(vQ.y), 1e-5);
    float r = max(R, fw * .9);                   // nunca mais fino que ~1 px (sem serrilhado/cintilação ao longe)
    float k = R / r;                             // ... conservando a energia
    float H = R * uHalo;
    if (mode > 2.5 && mode < 3.5) {              // subida: cometa de baixo para cima com rastro
      float sq = clamp((vY - vB.x) / max(vB.y - vB.x, .01), 0., 1.);
      float spd = .28 + fract(vB.z * 3.7) * .25 + uProgress * .3;
      float front = fract(uTime * spd + fract(vB.z * 1.3)) * 1.5 - .25;
      float x = front - sq;
      float b = x > 0. ? exp(-x * 3.5) : smoothstep(-.025, 0., x);
      lum *= .1 + .9 * b;
    } else if (vB.y > vB.x) {                    // janela (rolagem / revelação): corta fora dela
      lum *= smoothstep(vB.x, vB.x + .08, vY) * smoothstep(vB.y, vB.y - .08, vY);
      if (vY < vB.x - H || vY > vB.y + H) discard;
    }
    float body = 1. - smoothstep(r - fw, r + fw, d);
    float hot = exp(-d * d / (r * r * .2));
    float halo = exp(-d / (H * .3)) * (1. - smoothstep(H * .55, H, d));
    vec3 c = vCol * (body * 1.5 * k + halo * .85 + hot * .6 * k) * lum + vec3(1., .9, .8) * hot * 2.4 * k * lum;
    c += (vCol * .035 + .012) * body * k * (1. - lum);   // vidro apagado ainda aparece
    c *= 1. - fogF() * .92;
    gl_FragColor = vec4(c * uGain, 1.);
  }`;

// fundos escuros (placas e caixas dos letreiros) — opaco, recebe um pouco da cor do próprio neon
export const boardVS = /* glsl */`
  attribute vec3 aCol; attribute vec2 aK;      // atraso de despertar, y do centro
  ${common}
  ${fogVert}
  varying vec3 vC;
  void main() {
    float on = clamp(awake(aK.x, aK.y) * 2., 0., 1.);
    vC = vec3(.011, .011, .014) + aCol * .045 * on;
    vec4 mv = modelViewMatrix * vec4(position, 1.);
    #ifdef USE_FOG
      vFogDepth = -mv.z;
    #endif
    gl_Position = projectionMatrix * mv;
  }`;
export const boardFS = /* glsl */`
  precision highp float;
  ${fogPars}
  varying vec3 vC;
  void main() {
    vec3 c = vC;
    #ifdef USE_FOG
      c = mix(c, fogColor, fogF());
    #endif
    gl_FragColor = vec4(c, 1.);
  }`;

// luz rebatida na parede atrás de cada letreiro (aditiva, macia)
export const washVS = /* glsl */`
  attribute vec2 aUv; attribute vec3 aCol; attribute vec2 aK;
  ${common}
  ${fogVert}
  varying vec2 vUv; varying vec3 vC;
  void main() {
    float on = clamp(awake(aK.x, aK.y) * 1.5, 0., 1.);
    vUv = aUv; vC = aCol * on;
    vec4 mv = modelViewMatrix * vec4(position, 1.);
    #ifdef USE_FOG
      vFogDepth = -mv.z;
    #endif
    gl_Position = projectionMatrix * mv;
  }`;
export const washFS = /* glsl */`
  precision highp float;
  uniform float uWash;
  ${fogPars}
  varying vec2 vUv; varying vec3 vC;
  void main() {
    vec2 q = 1. - vUv * vUv;
    float f = q.x * q.x * q.y * q.y;
    gl_FragColor = vec4(vC * f * uWash * (1. - fogF()), 1.);
  }`;
