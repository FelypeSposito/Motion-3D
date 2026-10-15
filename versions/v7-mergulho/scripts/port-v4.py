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
p1 = must(p1, 'if (h < -.25) out.set("#3a4430");', 'if (h < -.25) out.set("#6f6a4e").lerp(tmpC.set("#3f5446"), n * .8).lerp(tmpC.set("#2c3a34"), smooth(-1.5, -5, h));   // fundo: areia e lodo')
p1 = must(p1, """THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
 vec3 fogD = vFogWorld - cameraPosition; float fogY = vFogWorld.y; vec3 fogIn = gl_FragColor.rgb; vec3 fogOut;
 ${FOG_GLSL}
 gl_FragColor.rgb = fogOut;
#endif`;""", """THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
 if (fogDensity < 0.) {
   // submerso: névoa turquesa que escurece com a profundidade
   float ud = length(vFogWorld - cameraPosition);
   vec3 uc = mix(vec3(.1, .42, .4), vec3(.02, .15, .17), clamp(-vFogWorld.y * .2, 0., 1.));
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
import { createDive, addCaustics, DIVE_START, UNDER_FOG } from "./dive.js";

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
const dive = createDive({ scene, camera, U, surfaceOnly, mobile: MOBILE });
addCaustics(groundMat, U.time, "ground"); addCaustics(rockMat, U.time, "rock");
const fogD = scene.fog.density;
const rtUnder = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
let prog = 0, underAmt = 0;

const sm = { x: 0, y: 0 };
const look = new THREE.Vector3(), sunScreen = new THREE.Vector3(), dummy = new THREE.Object3D();
let frameN = 0;

function update(t, dt) {
  mouse.x = pointer.x; mouse.y = pointer.y; cur.x = (pointer.x + .5) * innerWidth; cur.y = (pointer.y + .5) * innerHeight;
''' + body + '''
  underAmt = dive.update(t, dt, prog);
  sky.position.copy(camera.position);
  if (underAmt > 0) godRays.uniforms.strength.value *= 1 - underAmt;
}

function toggleNight() {
  const toNight = NIGHT.v < .5;
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
  setProgress(p) { prog = p; dollyT = Math.min(p / DIVE_START, 1); },
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
open(root + "/src/chapters/01-prado/index.js", "w", encoding="utf-8").write(out)
print("ok", len(out.splitlines()), "linhas")
