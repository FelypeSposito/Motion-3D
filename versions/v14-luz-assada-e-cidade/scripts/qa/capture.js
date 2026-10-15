// QA visual — captura determinística do canvas (colar no javascript_tool do navegador embutido / console).
// Uso (depois de colar este arquivo inteiro uma vez por carregamento de página):
//   await __qa.setup({ dpr: 1 })                       // 1440x900 → dpr 1; 390x844 → dpr 2
//   await __qa.shot({ p: .45, night: false, name: "d1440-p045-day" })   // envia ao receive.py e devolve metadados
//   await __qa.shot({ p: .45, night: true,  name: "...", dataURL: true }) // devolve o dataURL (sem servidor)
//
// O que torna o quadro repetível:
//  - tempo fixo: o update() do capítulo atual é embrulhado para receber sempre t = T (padrão 10 s) e dt = 0
//    (céu, água, grama, flutuação da câmera e animações ficam congelados no mesmo instante);
//  - ponteiro: o objeto `pointer` de src/core/scene-kit.js é zerado (centro) antes de cada quadro;
//  - progresso: __motion.chapters.setProgress(p) + N quadros (o parallax `sm` converge por quadro, não por dt);
//  - noite: toggleNight() e as tweens do gsap sobre NIGHT são levadas ao fim (progress(1)) — sem esperar 2,6 s;
//  - DPR travado (dprMin = dprMax = dpr) para o DPR adaptativo não mudar a resolução entre prints;
//  - leitura: toDataURL logo após engine.step() no mesmo tick (o renderer não usa preserveDrawingBuffer).
// Limitação: partículas/pétalas acumulam posição com o dt real até o setup — pequenas diferenças entre execuções.
(() => {
  const RECEIVER = "http://127.0.0.1:5199/save";   // scripts/qa/receive.py
  const findDep = (re) => performance.getEntriesByType("resource").map((e) => new URL(e.name).pathname + new URL(e.name).search).find((u) => re.test(u));
  let kit, gsap, quality, T = 10, pose = null;   // pose: { pos:[x,y,z], look:[x,y,z], fov? }

  function wrapUpdate() {
    const cur = __motion.engine.state.current;
    if (!cur || cur.__qaWrapped) return cur;
    const orig = cur.update.bind(cur);
    cur.update = (t, dt) => {
      kit.pointer.x = kit.pointer.y = kit.pointer.sx = kit.pointer.sy = 0;
      const r = orig(T, 0);
      if (pose) {   // pose manual (closeups): sobrescreve a câmera do trajeto depois do update
        const c = cur.camera; c.position.set(...pose.pos); c.lookAt(...pose.look);
        if (pose.fov) { c.fov = pose.fov; c.updateProjectionMatrix(); }
        c.updateMatrixWorld();
      }
      return r;
    };
    cur.__qaWrapped = true;
    return cur;
  }
  const finishTweens = () => gsap?.globalTimeline.getChildren(true, true, false).forEach((tw) => tw.progress(1));

  async function setup({ dpr = 1, time = 10 } = {}) {
    T = time;
    kit = await import("/src/core/scene-kit.js");
    quality = (await import("/src/core/quality.js")).quality;
    // gsap: URL exata do pré-empacotado do Vite; se o buffer de resource timing encheu, monta pelo hash de outro dep
    let g = findDep(/\/deps\/gsap\.js/);
    if (!g) { const any = findDep(/\/\.vite\/deps\/.*\?v=/); if (any) g = "/node_modules/.vite/deps/gsap.js?" + any.split("?")[1]; }
    gsap = g ? (await import(g)).default : null;
    for (let i = 0; i < 200 && !__motion.engine.state.current; i++) await new Promise((r) => setTimeout(r, 100));
    quality.dpr = quality.dprMin = quality.dprMax = dpr;
    dispatchEvent(new Event("resize"));
    wrapUpdate();
    return { gsap: !!gsap, dpr: __motion.engine.renderer.getPixelRatio(), w: innerWidth, h: innerHeight, mobile: quality.mobile,
      nobake: location.search.includes("nobake"), ready: window.__readyAt };
  }

  async function shot({ p = 0, night = false, name = "shot", frames = 90, dataURL = false } = {}) {
    const cur = wrapUpdate();
    __motion.chapters.setProgress(p);
    __motion.step(3);
    finishTweens(); __motion.step(2);   // sair/entrar na água dispara tween da trava noturna: resolve antes de comparar
    if (!!cur.isNight !== night && !cur.nightLocked) { cur.toggleNight(); }
    finishTweens();
    __motion.step(frames);
    finishTweens();          // a trava submersa pode ter disparado outra tween
    __motion.step(5);
    __motion.engine.step();
    const url = __motion.engine.renderer.domElement.toDataURL("image/png");
    const meta = { name, p, night, isNight: !!cur.isNight, locked: !!cur.nightLocked, under: +(cur.underwater || 0).toFixed(3),
      w: __motion.engine.renderer.domElement.width, h: __motion.engine.renderer.domElement.height, bytes: url.length };
    if (dataURL) return { ...meta, url };
    const r = await fetch(RECEIVER + "?name=" + encodeURIComponent(name), { method: "POST", body: url, headers: { "Content-Type": "text/plain" } });
    return { ...meta, saved: await r.text() };
  }

  // série completa: pontos × dia/noite
  async function series({ prefix, points = [0, .15, .3, .45, .6, .75, .9] } = {}) {
    const out = [];
    for (const night of [false, true]) for (const p of points) {
      const name = `${prefix}-p${String(Math.round(p * 100)).padStart(3, "0")}-${night ? "night" : "day"}`;
      out.push(await shot({ p, night, name }));
    }
    return out.map((m) => `${m.name} ${m.w}x${m.h} night=${m.isNight} under=${m.under} ${m.saved}`).join("\n");
  }
  window.__qa = { setup, shot, series, finishTweens, setPose: (p) => { pose = p; } };
  return "ok";
})();
