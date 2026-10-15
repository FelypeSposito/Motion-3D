// Motor: um renderizador, dois render targets (capítulo atual e o próximo, só durante a transição),
// loop com pausa automática e resolução adaptativa.
import * as THREE from "three";
import { quality, createAdaptiveDpr } from "./quality.js";
import { createFinalPass } from "./final-pass.js";

export function createEngine(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", stencil: false });
  renderer.toneMapping = THREE.AgXToneMapping;      // mesmo mapeamento de tons padrão do Blender 4
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;               // ligado só por capítulos que ainda usam sombra em tempo real
  container.appendChild(renderer.domElement);

  const rtOpts = { type: THREE.HalfFloatType, samples: quality.msaa, depthBuffer: true };
  const rtA = new THREE.WebGLRenderTarget(1, 1, rtOpts), rtB = new THREE.WebGLRenderTarget(1, 1, rtOpts);
  const final = createFinalPass();
  const size = { w: 1, h: 1 };

  function resize() {
    size.w = innerWidth; size.h = innerHeight;
    renderer.setPixelRatio(quality.dpr);
    renderer.setSize(size.w, size.h);
    const w = Math.round(size.w * quality.dpr), h = Math.round(size.h * quality.dpr);
    rtA.setSize(w, h); rtB.setSize(w, h);
    final.material.uniforms.uAspect.value = size.w / size.h;
    engine.onResize?.(size.w, size.h);
  }
  const adapt = createAdaptiveDpr(() => resize());

  // desenha um capítulo no seu render target
  function draw(ch, rt, cam = ch.camera) {
    renderer.setRenderTarget(rt);
    renderer.setClearColor(ch.clearColor ?? 0x000000, 1);
    renderer.clear();
    renderer.render(ch.scene, cam);
  }

  const clock = new THREE.Clock();
  let running = false, raf = 0, last = performance.now();
  function frame() {
    raf = requestAnimationFrame(frame);
    const now = performance.now(), ms = now - last; last = now;
    const dt = Math.min(clock.getDelta(), 1 / 20), t = clock.elapsedTime;
    engine.onFrame?.(t, dt);                         // scroll/narrativa atualizam o estado antes de desenhar
    const { current, next, mix } = engine.state;
    if (!current) return;
    current.update?.(t, dt);
    if (next && mix > 0) next.update?.(t, dt);
    const u = final.material.uniforms, sp = current.split;
    // capítulo com pós-processamento próprio (ex.: prado) entrega a textura pronta; os demais são desenhados aqui
    const view = (ch, rt, cam) => {
      if (ch.render) return ch.render(renderer, cam);
      draw(ch, rt, cam); return rt.texture;
    };
    let texA, texB = rtB.texture;
    // modo meio a meio (câmera atravessando a água): duas vistas do mesmo capítulo, juntas pela linha d'água
    if (sp?.on) {
      texA = view(current, rtA, current.camera); texB = view(current, rtB, sp.camera);
      u.uSplit.value = 1; u.uLine.value.set(sp.lineLeft, sp.lineRight); u.uThick.value = sp.thickness;
    } else {
      texA = view(current, rtA);
      if (next && mix > 0) texB = view(next, rtB);
      u.uSplit.value = 0;
    }
    // cada capítulo define seu mapeamento de tons, exposição, vinheta e grão
    renderer.toneMapping = current.toneMapping ?? THREE.AgXToneMapping;
    renderer.toneMappingExposure = current.exposure ?? 1;
    u.uVignette.value = current.post?.vignette ?? .85; u.uGrain.value = current.post?.grain ?? .045;
    u.uUnder.value = current.underwater ?? 0;
    u.tA.value = texA; u.tB.value = texB; u.uMix.value = next && !sp?.on ? mix : 0; u.uTime.value = t;
    final.render(renderer);
    if (ms < 250) adapt(ms);                         // ignora quadros após aba oculta
  }

  // pausa total com a aba oculta (economiza bateria e não acumula tempo)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelAnimationFrame(raf); running = false; }
    else if (!running) { running = true; clock.getDelta(); last = performance.now(); frame(); }
  });
  addEventListener("resize", resize);

  const engine = {
    renderer, size, final,
    state: { current: null, next: null, mix: 0 },
    start() { resize(); if (!running) { running = true; frame(); } },
    step() { frame(); },                       // depuração: desenha um quadro sob demanda
    onResize: null,
    onFrame: null,
  };
  return engine;
}
