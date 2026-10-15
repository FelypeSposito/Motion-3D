// Página de teste isolada dos letreiros (neon-test.html). Imita o motor: cena → render target HDR → passe final AgX.
// ?mobile=1 força o perfil de celular · ?cam=orbit câmera orbitando e subindo.
import * as THREE from "three";
import { createFinalPass } from "../../../core/final-pass.js";
import { quality as Q } from "../../../core/quality.js";
import { createNeon, demoLayout } from "./index.js";

const qs = new URLSearchParams(location.search);
const quality = { ...Q, mobile: qs.has("mobile") ? qs.get("mobile") === "1" : Q.mobile };
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.toneMapping = THREE.AgXToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: quality.mobile ? 0 : 4 });
const final = createFinalPass();

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x04050a, .012);
const camera = new THREE.PerspectiveCamera(55, 1, .1, 400);
const layout = demoLayout();
// prédios escuros só para dar contexto
const bmat = new THREE.MeshBasicMaterial({ color: 0x07080c });
for (const f of layout) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(f.w, f.h + 6, 14), bmat);
  m.rotation.y = f.rotY; m.position.set(...f.pos); m.translateZ(-7.02); m.position.y = (f.h + 6) / 2; scene.add(m);
}
const neon = createNeon({ quality, layout });
scene.add(neon.group); window.__neon = neon;
// reflexo falso (só no teste): cópia espelhada sob uma água escura semitransparente
const refl = neon.group.clone(); refl.scale.y = -1; refl.updateMatrixWorld(true); scene.add(refl);
const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x020307, transparent: true, opacity: .72, depthWrite: false }));
water.rotation.x = -Math.PI / 2; water.renderOrder = -1; scene.add(water);
refl.children.forEach((c) => (c.renderOrder -= 10));

function resize() {
  const dpr = Math.min(devicePixelRatio, quality.mobile ? 2 : 1.5);
  renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight);
  rt.setSize(Math.round(innerWidth * dpr), Math.round(innerHeight * dpr));
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  final.material.uniforms.uAspect.value = camera.aspect;
}
addEventListener("resize", resize); resize();

const $ = (id) => document.getElementById(id);
$("re").onclick = () => neon.ignite();
const orbit = qs.get("cam") === "orbit";
const clock = new THREE.Clock();
let frames = 0, acc = 0, fps = 0, prog = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
  if ($("auto").checked) { prog = (t / 40) % 1; $("p").value = prog; } else prog = +$("p").value;
  if (orbit) {
    const a = t * .12; camera.position.set(Math.sin(a) * 28, 2 + prog * 25, -40 + Math.cos(a) * 28); camera.lookAt(0, 8 + prog * 10, -40);
  } else {
    const rise = Math.min(prog / .06, 1);                         // emerge da água e anda pela avenida
    camera.position.set(Math.sin(t * .2) * 1.5, -.2 + rise * 3.2 + prog * 6, 6 - prog * 110);
    camera.lookAt(Math.sin(t * .15) * 3, 5 + prog * 8 + (1 - rise) * 2, camera.position.z - 30);
  }
  neon.update(t, dt, { progress: prog, camera });
  renderer.setRenderTarget(rt); renderer.setClearColor(0x020308, 1); renderer.clear(); renderer.render(scene, camera);
  const u = final.material.uniforms; u.tA.value = rt.texture; u.uTime.value = t; u.uMix.value = 0; u.uSplit.value = 0; u.uVignette.value = .9; u.uGrain.value = .035;
  final.render(renderer);
  frames++; acc += dt;
  if (acc > .5) { fps = frames / acc; frames = 0; acc = 0;
    $("st").textContent = `${fps.toFixed(0)} fps · calls ${renderer.info.render.calls} · ${neon.stats.signs} letreiros · ${neon.stats.segments} trechos · ${quality.mobile ? "celular" : "desktop"}`;
    window.__neonStats = { fps, ...neon.stats }; }
}
frame();
