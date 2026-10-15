// Trechos de shader compartilhados pela cidade: hash, mapa de luz dos letreiros e névoa (acima e abaixo d'água).
// Todos os materiais do capítulo são ShaderMaterial próprios (o prado troca os chunks de névoa do three globalmente).

// área coberta pelo mapa de luz (x, z): mesma conta no JS (city.js) e nos shaders
export const LIGHT_BOX = { x0: -50, x1: 50, z0: -240, z1: 50 };

export const COMMON_GLSL = /* glsl */`
  uniform vec3 uHaze; uniform float uFogD; uniform sampler2D tLight;
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  // luz difusa dos telões/neons no plano xz (pré-calculada uma vez numa textura pequena)
  vec3 neonLight(vec2 xz) {
    vec2 uv = vec2((xz.x - (${LIGHT_BOX.x0.toFixed(1)})) / ${(LIGHT_BOX.x1 - LIGHT_BOX.x0).toFixed(1)}, (xz.y - (${LIGHT_BOX.z0.toFixed(1)})) / ${(LIGHT_BOX.z1 - LIGHT_BOX.z0).toFixed(1)});
    return texture2D(tLight, uv).rgb * 4.;
  }
  // névoa: acima d'água, neblina noturna mais densa rente à água; com a câmera submersa, água turva e escura
  vec3 cityFog(vec3 col, vec3 wp, float h) {
    float d = length(wp - cameraPosition);
    if (cameraPosition.y < 0.) return mix(col, vec3(.014, .045, .04), 1. - exp(-d * .065));
    float hf = exp(-max(h, 0.) * .03);
    float f = (1. - exp(-d * uFogD)) * (.6 + .4 * hf);
    return mix(col, uHaze * (1. + hf * .8), clamp(f, 0., 1.));
  }`;
