"""Monta src/chapters/01-prado/index.js a partir do script da meadow-scene-v4.html.
O código de cena é mantido; só muda o que passa a ser do motor (renderer, loop, UI, rolagem)."""
import sys, re
root = sys.argv[1]
html = open(root + "/public/estudos/meadow-scene-v4.html", encoding="utf-8").read()
js = html[html.index('<script type="module">') + len('<script type="module">'):html.rindex("</script>")]

def cut(s, start, end, incl_end=False):
    a = s.index(start); b = s.index(end, a) + (len(end) if incl_end else 0)
    return s[a:b]

def must(s, a, b):
    if a not in s: sys.exit("NOT FOUND: " + a[:90])
    return s.replace(a, b, 1)

# ---------- parte 1: construção da cena (até a interação) ----------
p1 = js[:js.index("// =====================================================================\n// INTERAÇÃO + INTRO")]
p1 = p1[p1.index("const C = {"):]                      # tira os imports originais
p1 = "\n".join(l for l in p1.split("\n") if 'getElementById("palette")' not in l)   # paleta era da interface antiga
renderer_old = cut(p1, "const renderer = new THREE.WebGLRenderer(", "document.body.prepend(renderer.domElement);", True)
p1 = p1.replace(renderer_old, """const renderer = ctx.renderer;
const MOBILE = ctx.quality.mobile;
const DPR = ctx.quality.dpr;
renderer.shadowMap.enabled = true;
renderer.shadowMap.autoUpdate = !MOBILE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const view = { exposure: .82 };   // exposição (o motor aplica no passe final)""")
p1 = p1.replace("renderer.toneMappingExposure", "view.exposure")
p1 = must(p1, "const h = -1.4 + isl * (", "const deep = 4 * smooth(1.0, 1.35, d) * smooth(1.5, 3.5, Math.hypot(Math.abs(x - 4.8), Math.max(0, 5 - z, z - 13)));   // lago fundo longe da ilha; raso na trilha de pedras\n  const h = -1.4 - deep + isl * (")
p1 = must(p1, "return Math.max(h, -1.4 + ring * (", "return Math.max(h, -1.4 - deep + ring * (")
# brilho do sol na água: some com a distância (de frente para o sol, rente à água, ele serrilhava em estrias)
p1 = must(p1, "col += vec3(1., .7, .38) * (glitter * 1.4 + pow(nh, 60.) * .35 + pow(nh, 8.) * .08) * (1. - uNight);",
              "col += vec3(1., .7, .38) * (glitter * 1.4 * smoothstep(40., 6., dist) + pow(nh, 60.) * .35 * smoothstep(90., 12., dist) + pow(nh, 8.) * .08) * (1. - uNight);")
p1 = must(p1, 'if (h < -.25) out.set("#3a4430");', 'if (h < -.25) out.set("#6f6a4e").lerp(tmpC.set("#3f5446"), n * .8).lerp(tmpC.set("#2c3a34"), smooth(-1.5, -5, h));   // fundo: areia e lodo')
p1 = must(p1, """THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
 vec3 fogD = vFogWorld - cameraPosition; float fogY = vFogWorld.y; vec3 fogIn = gl_FragColor.rgb; vec3 fogOut;
 ${FOG_GLSL}
 gl_FragColor.rgb = fogOut;
#endif`;""", """THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
 if (fogDensity < 0.) {
   // submerso: névoa turquesa que escurece com a profundidade
   float ud = length(vFogWorld - cameraPosition);
   vec3 uc = mix(vec3(.15, .27, .17), vec3(.035, .085, .07), clamp(-vFogWorld.y * .2, 0., 1.));
   uc *= clamp(dot(fogColor, vec3(.3, .59, .11)) * 1.8, .12, 1.);   // à noite a névoa do prado escurece; a submersa acompanha
   gl_FragColor.rgb = mix(gl_FragColor.rgb, uc, clamp(1. - exp(-ud * -fogDensity), 0., 1.));
 } else {
 vec3 fogD = vFogWorld - cameraPosition; float fogY = vFogWorld.y; vec3 fogIn = gl_FragColor.rgb; vec3 fogOut;
 ${FOG_GLSL}
 gl_FragColor.rgb = fogOut;
 }
#endif`;""")
# o passe final do motor faz a saída de cor; o compositor do prado entrega a imagem num render target
p1 = must(p1, "composer.addPass(new OutputPass());", "composer.renderToScreen = false;   // a imagem vai para o passe final do motor")

# ---------- parte 2: rastro/ondas na água (sem cursor DOM) ----------
p2 = cut(js, "// ---------- hover na água", 'addEventListener("pointerdown", () => { if (overWater) { addRip(hit.x, hit.z, 1.5); } });', True)
p2 = must(p2, '  cursor.classList.toggle("water", overWater);\n', "")

# ---------- parte 3: modo noite (luzes, vagalumes, velas, lanternas) ----------
p3 = cut(js, "if (MOBILE) scene.traverse(o =>", "// botão dia/noite")
p3 = p3.replace("view.exposure", "view.exposure").replace("renderer.toneMappingExposure", "view.exposure")

# ---------- parte 4: corpo do loop vira update(t, dt) ----------
body = cut(js, "function frame() {\n", "\n}\nframe();")
body = body[len("function frame() {\n"):]
body = must(body, "  const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;\n", "")
body = must(body, "  if (!MOBILE) cursor.style.transform = `translate(${cur.x}px,${cur.y}px)`;\n  composer.render();\n  requestAnimationFrame(frame);", "")
body = body.replace("    setHeroOpacity(1 - dolly * 1.8);\n", "").replace("      setHeroOpacity(1 - dolly * 1.8);\n", "")

out = '''// Capítulo 01 — Prado na névoa (portado da meadow-scene-v4, mesmo visual).
// Gerado por scripts/port: o código da cena é o da v4; motor, rolagem e interface são do site.
import * as THREE from "three";
import gsap from "gsap";
import { Reflector } from "three/addons/objects/Reflector.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { pointer } from "../../core/scene-kit.js";
import { createDive, addCaustics, UNDER_FOG } from "./dive.js";

export async function create(ctx) {
''' + p1 + '''
// =====================================================================
// INTERAÇÃO (ponteiro do site; a rolagem da narrativa controla o "dolly")
// =====================================================================
const mouse = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
let started = true, dolly = 0, dollyT = 0;

''' + p2 + '''

// =====================================================================
''' + p3 + '''
// =====================================================================
// MERGULHO (dive.js): câmera desce ao lago, meio a meio, e segue submersa
// =====================================================================
const dive = createDive({ scene, camera, U, surfaceOnly, mobile: MOBILE, arch });
addCaustics(groundMat, U.time, "ground", U.night); addCaustics(rockMat, U.time, "rock", U.night);
const fogD = scene.fog.density;
const rtUnder = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
let prog = 0, underAmt = 0, nightLocked = false, userNight = 0;

const sm = { x: 0, y: 0 };
const look = new THREE.Vector3(), sunScreen = new THREE.Vector3(), dummy = new THREE.Object3D();
let frameN = 0;

function update(t, dt) {
  mouse.x = pointer.x; mouse.y = pointer.y; cur.x = (pointer.x + .5) * innerWidth; cur.y = (pointer.y + .5) * innerHeight;
''' + body + '''
  underAmt = dive.update(t, dt, prog, sm);
  // embaixo d'água a cena anoitece sozinha (a cidade seguinte é noturna); de volta à superfície, volta à escolha do usuário
  const lock = underAmt > .15;
  if (lock !== nightLocked) {
    nightLocked = lock;
    gsap.to(NIGHT, { v: lock ? 1 : userNight, duration: 2.4, ease: "power2.inOut", overwrite: true });
  }
  sky.position.copy(camera.position);
  if (underAmt > 0) godRays.uniforms.strength.value *= 1 - underAmt;
}

function toggleNight() {
  if (nightLocked) return true;                 // submerso: a noite está travada
  const toNight = NIGHT.v < .5;
  userNight = toNight ? 1 : 0;
  gsap.to(NIGHT, { v: toNight ? 1 : 0, duration: 2.6, ease: "power2.inOut", overwrite: true });
  return toNight;
}

return {
  scene, camera, clearColor: 0x000000,
  toneMapping: THREE.ACESFilmicToneMapping,
  get exposure() { return view.exposure; },
  // acima d'água, vinheta e grão vêm do passe de cor do prado; submerso, do passe final do motor
  get post() { return underAmt > .5 ? { vignette: .95, grain: .04 } : { vignette: 0, grain: 0 }; },
  get split() { return dive.split; },
  get underwater() { return underAmt; },
  get nightLocked() { return nightLocked; },
  get isNight() { return NIGHT.v > .5; },
  setProgress(p) { prog = p; },
  update,
  render(r, cam = camera) {
    if (cam === camera && dive.split.on) cam = dive.split.cameraAbove;
    if (cam.position.y >= 0) { composer.passes[0].camera = cam; composer.render(); return composer.readBuffer.texture; }
    // vista submersa: render direto (sem raios de sol), com a névoa no modo submerso
    scene.fog.density = -UNDER_FOG;
    fogCards.forEach(c => c.visible = false);              // camadas de névoa são da superfície
    r.setRenderTarget(rtUnder); r.setClearColor(0x0b3a3c, 1); r.clear(); r.render(scene, cam);
    fogCards.forEach(c => c.visible = true);
    scene.fog.density = fogD;
    return rtUnder.texture;
  },
  resize(w, h) {
    camera.aspect = w / h; camera.updateProjectionMatrix();
    composer.setPixelRatio(ctx.quality.dpr); composer.setSize(w, h); bloom.resolution.set(w / 2, h / 2);
    rtUnder.setSize(Math.round(w * ctx.quality.dpr), Math.round(h * ctx.quality.dpr));
  },
  toggleNight,
  dispose() { composer.dispose(); water.getRenderTarget().dispose(); rtUnder.dispose(); },
};
}
'''

# ---------- cache de cena: dados caros vêm de arquivos pré-gerados (ver src/core/bake-cache.js) ----------
import re as _re
def _rep(a, b):
    global out
    if a not in out: sys.exit("CACHE NOT FOUND: " + a[:80])
    out = out.replace(a, b, 1)
_rep('import { pointer } from "../../core/scene-kit.js";\n', 'import { pointer } from "../../core/scene-kit.js";\nimport { openBakeCache } from "../../core/bake-cache.js";\n')
_rep("export async function create(ctx) {\n", 'export async function create(ctx) {\nconst cache = await openBakeCache("./assets/prado/", { device: ctx.quality.mobile ? "m" : "d" });   // texturas, malhas e relevo prontos (gerados com ?bake)\n')
# texturas: nome fixo por textura; imagem pronta do cache ou desenhada agora
_rep("""function canvasTex(size, draw, { srgb = true, repeat = 1 } = {}) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);""", """function canvasTex(name, size, draw, { srgb = true, repeat = 1 } = {}) {
  const t = new THREE.Texture(cache.image(name, size, draw)); t.needsUpdate = true;   // pronta do cache ou desenhada agora""")
_rep("const t = canvasTex(256,", 'const t = canvasTex("fogNoise", 256,')
out = _re.sub(r"const (\w+) = canvasTex\((?!\")", r'const \1 = canvasTex("\1", ', out)
# ondas da água: o cálculo das alturas entra no desenho (com cache, não roda)
_rep("""const WN = 256, wh = new Float32Array(WN * WN);
for (let j = 0; j < WN; j++) for (let i = 0; i < WN; i++) wh[j * WN + i] = pfbm(i / WN * 8, j / WN * 8, 8, 8, 5);
const waterNormal = canvasTex("waterNormal", WN, (x) => pixels(x, WN, (i, j) => {""", """const WN = 256, wh = new Float32Array(WN * WN);
const waterNormal = canvasTex("waterNormal", WN, (x) => { for (let j = 0; j < WN; j++) for (let i = 0; i < WN; i++) wh[j * WN + i] = pfbm(i / WN * 8, j / WN * 8, 8, 8, 5); pixels(x, WN, (i, j) => {""")
a = out.index('const waterNormal = canvasTex("waterNormal"')
b = out.index("}), { srgb: false });", a)
out = out[:b] + "}); }, { srgb: false });" + out[b + len("}), { srgb: false });"):]
# relevo: grade pré-calculada com interpolação (milhares de consultas por carga viram leituras de memória)
_rep("function H(x, z) {", "function H0(x, z) {")
_rep("const slope = (f, x, z) => Math.hypot(f(x + .5, z) - f(x - .5, z), f(x, z + .5) - f(x, z - .5));",
"""const slope = (f, x, z) => Math.hypot(f(x + .5, z) - f(x - .5, z), f(x, z + .5) - f(x, z - .5));
const HG = 512, HR = 85;
const hgrid = cache.floats("height-512", () => {
  const a = new Float32Array(HG * HG);
  for (let j = 0; j < HG; j++) for (let i = 0; i < HG; i++) a[j * HG + i] = H0(-HR + i / (HG - 1) * 2 * HR, -HR + j / (HG - 1) * 2 * HR);
  return a;
});
function H(x, z) {
  const fx = (x + HR) / (2 * HR) * (HG - 1), fz = (z + HR) / (2 * HR) * (HG - 1);
  if (fx < 0 || fz < 0 || fx >= HG - 1 || fz >= HG - 1) return H0(x, z);
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * HG + i;
  return (hgrid[k] * (1 - u) + hgrid[k + 1] * u) * (1 - v) + (hgrid[k + HG] * (1 - u) + hgrid[k + HG + 1] * u) * v;
}""")
# malhas pesadas: terreno e pedras
_rep("function terrain(w, d, sx, sz, cx, cz, fn, colorFn) {",
"""function terrain(w, d, sx, sz, cx, cz, fn, colorFn) {
  // o cache guarda só altura e cor de cada ponto; a grade (índices, uv, normais) é refeita aqui
  const key = `terrain-${w}x${d}-${sx}x${sz}`;
  let built = null;
  const hy = cache.floats(key + "-h", () => { built = terrain0(w, d, sx, sz, cx, cz, fn, colorFn); const p = built.attributes.position; return Float32Array.from({ length: p.count }, (_, i) => p.getY(i)); });
  const cc = cache.floats(key + "-c", () => (built ??= terrain0(w, d, sx, sz, cx, cz, fn, colorFn)).attributes.color.array.slice());
  if (built) return built;
  const g = new THREE.PlaneGeometry(w, d, sx, sz); g.rotateX(-Math.PI / 2); g.translate(cx, 0, cz);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, hy[i]);
  g.setAttribute("color", new THREE.BufferAttribute(cc, 3)); g.computeVertexNormals();
  return g;
}
function terrain0(w, d, sx, sz, cx, cz, fn, colorFn) {""")
_rep("const rockGeos = Array.from({ length: 6 }, (_, k) => {",
     'const rockGeos = Array.from({ length: 6 }, (_, k) => cache.geo("rock-" + k + "-" + (MOBILE ? 18 : 28), () => {')
a = out.index('const rockGeos = Array.from({ length: 6 }, (_, k) => cache.geo(')
b = out.index("\n});", a)
out = out[:b] + "\n}));" + out[b + len("\n});"):]
_rep("\nreturn {\n  scene, camera,", "\nawait cache.flush();   // modo ?bake: salva o que foi gerado agora\nreturn {\n  scene, camera,")

open(root + "/src/chapters/01-prado/index.js", "w", encoding="utf-8").write(out)
print("ok", len(out.splitlines()), "linhas")
