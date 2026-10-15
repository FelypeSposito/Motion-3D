// Medição de desempenho repetível do Motion 3D.
// Uso: colar no console (ou javascript_tool) com o site aberto (build: npx vite preview --outDir dist-perf --port 4174).
// A última expressão devolve o JSON. Opções: await __perf.run({ points: [0,.25,.5,.75,.95], staticMs: 5000, scrollMs: 5000 })
// Métodos:
//  - fps/p95: requestAnimationFrame real (se o painel estiver oculto e o rAF estrangulado, marca rafThrottled=true)
//  - cpuMs: tempo de JS+envio por quadro, medido de onFrame (início do quadro) até o fim do passe final (independe do rAF)
//  - gpuMs: EXT_disjoint_timer_query_webgl2 em volta do quadro inteiro (quando o navegador expõe a extensão)
//  - renderer.info acumulado no quadro inteiro (autoReset desligado durante a medição; senão só conta o último render())
//  - modo step (fallback): __motion.step(1) em laço + readPixels de 1 px para forçar a GPU terminar (cpu+gpu síncrono)
(() => {
  const M = window.__motion, E = M.engine, R = E.renderer, gl = R.getContext();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pct = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

  // ---------- instrumentação do quadro (onFrame = início, final.render = fim) ----------
  const tq = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  let hook = null;
  function instrument() {
    if (hook) return hook;
    const origOnFrame = E.onFrame, origFinal = E.final.render;
    const h = { cpu: [], gpu: [], info: null, t0: 0, pendingQ: [], active: false };
    E.onFrame = function (t, dt) {
      if (h.active) {
        R.info.autoReset = false; R.info.reset(); h.t0 = performance.now();
        if (tq && !h.q) { h.q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, h.q); }
      }
      return origOnFrame.call(this, t, dt);
    };
    E.final.render = function (r) {
      origFinal.call(this, r);
      if (!h.active) return;
      h.cpu.push(performance.now() - h.t0);
      if (h.q) { gl.endQuery(tq.TIME_ELAPSED_EXT); h.pendingQ.push(h.q); h.q = null; }
      const i = R.info;
      h.info = { calls: i.render.calls, triangles: i.render.triangles, points: i.render.points, lines: i.render.lines };
      R.info.autoReset = true;
      // recolhe consultas prontas
      h.pendingQ = h.pendingQ.filter((q) => {
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return true;
        if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) h.gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(q); return false;
      });
    };
    h.restore = () => { E.onFrame = origOnFrame; E.final.render = origFinal; hook = null; };
    return (hook = h);
  }

  // ---------- janela de medição por rAF ----------
  async function sampleRaf(ms, during) {
    const h = instrument(); h.cpu = []; h.gpu = []; h.active = true;
    const dts = []; let last = performance.now(), stop = false;
    const heap0 = performance.memory?.usedJSHeapSize;
    const loop = (now) => { dts.push(now - last); last = now; if (!stop) requestAnimationFrame(loop); };
    requestAnimationFrame((n) => { last = n; requestAnimationFrame(loop); });
    const t0 = performance.now();
    if (during) await during(ms); else await sleep(ms);
    stop = true; h.active = false; await sleep(50);
    const el = performance.now() - t0, heap1 = performance.memory?.usedJSHeapSize;
    const frames = dts.length;
    return {
      frames, fps: r2(frames / (el / 1000)), frameMsAvg: r2(avg(dts)), frameMsP95: r2(pct(dts, .95)), frameMsMax: r2(Math.max(...dts)),
      cpuMsAvg: r2(avg(h.cpu)), cpuMsP95: r2(pct(h.cpu, .95)),
      gpuMsAvg: r2(avg(h.gpu)), gpuMsP95: r2(pct(h.gpu, .95)), gpuSamples: h.gpu.length,
      heapGrowthKBps: heap0 != null ? r2((heap1 - heap0) / 1024 / (el / 1000)) : null,   // negativo = houve GC no meio
      rafThrottled: frames / (el / 1000) < 20,
      info: h.info,
    };
  }

  // ---------- fallback: custo síncrono por quadro com __motion.step ----------
  function sampleStep(n = 60) {
    const h = instrument(); h.cpu = []; h.active = true;
    const px = new Uint8Array(4), tot = [];
    for (let i = 0; i < n; i++) {
      const t = performance.now(); M.step(1); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); tot.push(performance.now() - t);
    }
    h.active = false;
    return { method: "step+readPixels", n, syncMsAvg: r2(avg(tot)), syncMsP95: r2(pct(tot, .95)), cpuMsAvg: r2(avg(h.cpu)), info: h.info };
  }

  // ---------- cena ----------
  function sceneStats() {
    const sc = E.state.current?.scene; if (!sc) return null;
    const lights = {}, mats = new Set(), tex = new Map();
    let meshes = 0, inst = 0, instances = 0, cast = 0, castVisible = 0, recv = 0, points = 0, visibleMeshes = 0;
    sc.traverse((o) => {
      if (o.isLight) { const k = o.type + (o.castShadow ? "+shadow" : ""); lights[k] = (lights[k] || 0) + 1; }
      if (o.isPoints) points++;
      if (o.isMesh) {
        meshes++; if (o.isInstancedMesh) { inst++; instances += o.count; }
        let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break; }
        if (vis) visibleMeshes++;
        if (o.castShadow) { cast++; if (vis) castVisible++; }
        if (o.receiveShadow) recv++;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          mats.add(m);
          for (const k in m) { const v = m[k]; if (v && v.isTexture && v.image) tex.set(v.uuid, v); }
          if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k]?.value; if (v && v.isTexture && v.image) tex.set(v.uuid, v); }
        });
      }
    });
    const texList = [...tex.values()].map((t) => { const i = t.image, w = i.width || i.data?.width || 0, h = i.height || i.data?.height || 0; return { name: t.name || t.source?.data?.src?.split("/").pop() || "", w, h, mb: r2((w * h * 4 * (t.generateMipmaps !== false ? 1.33 : 1)) / 1048576) }; })
      .sort((a, b) => b.mb - a.mb);
    const lightCount = Object.values(lights).reduce((a, b) => a + b, 0);
    return {
      lights, lightCount, meshes, visibleMeshes, instancedMeshes: inst, instances, castShadow: cast, castShadowVisible: castVisible, receiveShadow: recv, points,
      materials: mats.size, textures: texList.length, textureMBest: r2(texList.reduce((a, t) => a + t.mb, 0)), topTextures: texList.slice(0, 6),
      shadowMap: { enabled: R.shadowMap.enabled, autoUpdate: R.shadowMap.autoUpdate, type: R.shadowMap.type },
    };
  }

  function rendererStats() {
    const i = R.info;
    return { geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length, dpr: R.getPixelRatio(), canvas: [R.domElement.width, R.domElement.height] };
  }

  function network() {
    const by = {}; let total = 0, totalDecoded = 0;
    const ext = (u) => { const p = new URL(u).pathname, m = p.match(/\.([a-z0-9]+)$/i); return m ? m[1].toLowerCase() : "other"; };
    const big = [];
    for (const e of performance.getEntriesByType("resource")) {
      const k = ext(e.name), b = e.encodedBodySize || e.transferSize || 0;   // corpo comprimido (independe do cache HTTP)
      by[k] = by[k] || { n: 0, KB: 0 }; by[k].n++; by[k].KB += b / 1024; total += b; totalDecoded += e.decodedBodySize || 0;
      if (!/__measure/.test(e.name)) big.push({ f: new URL(e.name).pathname.split("/").slice(-2).join("/"), KB: Math.round(b / 1024), status: e.responseStatus, ms: Math.round(e.duration) });
    }
    for (const k in by) by[k].KB = Math.round(by[k].KB);
    return { totalKB: Math.round(total / 1024), decodedKB: Math.round(totalDecoded / 1024), byType: by, largest: big.sort((a, b) => b.KB - a.KB).slice(0, 40) };
  }

  async function settleAt(p, ms = 2500) { M.go(p); await sleep(ms); }

  // ---------- MODO STEP (painel oculto: rAF não dispara) ----------
  // Cada quadro: __motion.step(1) + readPixels(1px) → força a GPU a terminar; syncMs = custo real CPU+GPU do quadro
  // (sem vsync). fpsEq = 1000/syncMsAvg é o teto teórico. Quadros espaçados ~16 ms em tempo real para que as
  // suavizações por dt (rolagem, câmera) avancem como no uso normal.
  // ATENÇÃO: engine.step() agenda mais um requestAnimationFrame a cada chamada; se o painel ficar visível depois,
  // essas cadeias extras rodam juntas → recarregue a página antes de medir por rAF.
  async function stepFrames(n, { gap = 0, onEach } = {}) {
    const h = instrument(); h.cpu = []; h.gpu = []; h.active = true;
    const px = new Uint8Array(4), sync = [];
    const heap0 = performance.memory?.usedJSHeapSize, t0 = performance.now();
    for (let i = 0; i < n; i++) {
      onEach?.(i, n);
      const t = performance.now(); M.step(1); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); sync.push(performance.now() - t);
      await sleep(gap ? Math.max(0, gap - (performance.now() - t)) : 0);
    }
    M.step(1); M.step(1);    // recolhe as últimas consultas de GPU
    h.active = false;
    const el = performance.now() - t0, heap1 = performance.memory?.usedJSHeapSize;
    return {
      method: "step+readPixels", frames: n, syncMsAvg: r2(avg(sync)), syncMsP95: r2(pct(sync, .95)), syncMsMax: r2(Math.max(...sync)),
      fpsEq: r2(1000 / avg(sync)), cpuMsAvg: r2(avg(h.cpu)), cpuMsP95: r2(pct(h.cpu, .95)),
      gpuMsAvg: r2(avg(h.gpu)), gpuMsP95: r2(pct(h.gpu, .95)), gpuSamples: h.gpu.length,
      heapGrowthKBps: heap0 != null ? r2((heap1 - heap0) / 1024 / (el / 1000)) : null, info: h.info,
    };
  }
  // sem intervalo entre quadros: o DPR adaptativo do motor mede o tempo ENTRE quadros (>19 ms derruba o DPR);
  // com intervalos de 16 ms + custo do quadro ele cairia sozinho e falsearia a medição. Sempre conferir renderer.dpr no resultado.
  async function settleStep(p, ms = 2500) { M.go(p); const h = instrument(); h.active = false; const t0 = performance.now(); while (performance.now() - t0 < ms) { M.step(1); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); await sleep(0); } }
  // um ponto parado (cabe em < 45 s por chamada do javascript_tool)
  async function pointStep(p, { settleMs = 2500, frames = 120 } = {}) {
    await settleStep(p, settleMs);
    const s = await stepFrames(frames);
    s.p = p; s.underwater = r2(E.state.current?.underwater ?? 0); s.split = !!E.state.current?.split?.on; s.renderer = rendererStats();
    return s;
  }
  // rolagem contínua 0 → .95 em ~frames*16 ms
  async function scrollStep({ frames = 300, to = .95, settleMs = 2000, gap = 0 } = {}) {
    await settleStep(0, settleMs);
    const s = await stepFrames(frames, { gap, onEach: (i, n) => { if (i % 15 === 0) M.go(to * Math.min(1, (i + 15) / n)); } });
    s.renderer = rendererStats();
    s.p = "scroll"; return s;
  }
  // GPU por passada: envolve renderer.render com consultas de tempo (chamadas aninhadas — reflexo do Reflector — contam
  // dentro da passada que as chamou). Rótulos: scene (cena do capítulo, inclui mapa de sombras e reflexo),
  // post (quads de tela cheia do compositor do capítulo: raios, bloom, cor), final (passe final do motor, na tela).
  async function passes(frames = 30) {
    if (!tq) return null;
    const orig = R.render, res = [], open = [];
    let depth = 0;
    R.render = function (sc, cam) {
      const sceneCur = E.state.current?.scene;
      const label = sc === sceneCur ? "scene" : (R.getRenderTarget() == null ? "final" : "post");
      if (depth++ > 0) { try { return orig.call(this, sc, cam); } finally { depth--; } }
      const q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q);
      try { return orig.call(this, sc, cam); } finally { gl.endQuery(tq.TIME_ELAPSED_EXT); open.push({ label, q }); depth--; }
    };
    const px = new Uint8Array(4);
    for (let i = 0; i < frames; i++) { M.step(1); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); await sleep(0); }
    R.render = orig;
    await sleep(100);
    const sum = {}, cnt = {};
    for (const { label, q } of open) {
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { sum[label] = (sum[label] || 0) + gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; cnt[label] = (cnt[label] || 0) + 1; }
      gl.deleteQuery(q);
    }
    const out = {};
    for (const k in sum) out[k] = { msPerFrame: r2(sum[k] / frames), callsPerFrame: r2(cnt[k] / frames) };
    return out;
  }

  // ablação: quanto cada recurso custa no ponto atual (só nesta aba, desfeito ao final)
  async function ablate({ frames = 60 } = {}) {
    const sc = E.state.current.scene, sun = []; let water = null; const pls = [];
    sc.traverse((o) => { if (o.isLight && o.castShadow) sun.push(o); if (o.isReflector) water = o; if (o.isPointLight) pls.push(o); });
    const run = async (label) => { await stepFrames(20); const s = await stepFrames(frames); return { label, gpu: s.gpuMsAvg, cpu: s.cpuMsAvg, calls: s.info.calls, tris: s.info.triangles }; };
    const out = [await run("base")];
    sun.forEach((l) => (l.castShadow = false)); out.push(await run("sem sombra")); sun.forEach((l) => (l.castShadow = true));
    if (water) { const ob = water.onBeforeRender; water.onBeforeRender = () => {}; out.push(await run("sem reflexo (água sem re-render)")); water.onBeforeRender = ob; }
    pls.forEach((l) => (l.visible = false)); out.push(await run(`sem ${pls.length} PointLights`)); pls.forEach((l) => (l.visible = true));
    sun.forEach((l) => (l.castShadow = false)); if (water) { var ob2 = water.onBeforeRender; water.onBeforeRender = () => {}; }
    out.push(await run("sem sombra+reflexo")); sun.forEach((l) => (l.castShadow = true)); if (water) water.onBeforeRender = ob2;
    return out;
  }

  async function baseStep() {
    return { when: new Date().toISOString(), url: location.href, viewport: [innerWidth, innerHeight], dprDevice: devicePixelRatio,
      mobile: !!window.matchMedia("(pointer: coarse), (max-width: 768px)").matches, readyAt: window.__readyAt ?? null,
      gpu: (() => { const d = gl.getExtension("WEBGL_debug_renderer_info"); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null; })(),
      timerQuery: !!tq, network: network(), renderer: rendererStats(), scene: sceneStats() };
  }

  async function run({ points = [0, .25, .5, .75, .95], staticMs = 5000, scrollMs = 5000, settleMs = 2500 } = {}) {
    const out = {
      when: new Date().toISOString(), url: location.href, viewport: [innerWidth, innerHeight], mobile: !!window.matchMedia("(pointer: coarse), (max-width: 768px)").matches,
      readyAt: window.__readyAt ?? null, gpu: (() => { const d = gl.getExtension("WEBGL_debug_renderer_info"); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null; })(),
      timerQuery: !!tq, network: network(), renderer: null, scene: null, points: {}, scroll: null,
    };
    out.renderer = rendererStats(); out.scene = sceneStats();
    for (const p of points) {
      await settleAt(p, settleMs);
      const s = await sampleRaf(staticMs);
      if (s.rafThrottled) s.step = sampleStep(60);
      s.underwater = r2(E.state.current?.underwater ?? 0); s.split = !!E.state.current?.split?.on;
      s.renderer = rendererStats();
      out.points[p] = s;
    }
    // rolagem contínua 0 → .95 em scrollMs
    await settleAt(0, settleMs);
    out.scroll = await sampleRaf(scrollMs, async (ms) => { const n = 20; for (let i = 1; i <= n; i++) { M.go(.95 * i / n); await sleep(ms / n); } });
    out.renderer = rendererStats(); out.sceneEnd = sceneStats();
    hook?.restore();
    M.go(0);
    return out;
  }

  // resumo de uma linha por ponto (para colar na tabela)
  function summary(o) {
    const rows = Object.entries(o.points).map(([p, s]) => ({ p, fps: s.fps, p95: s.frameMsP95, cpu: s.cpuMsAvg, gpu: s.gpuMsAvg, calls: s.info?.calls, tris: s.info?.triangles, sync: s.step?.syncMsAvg, under: s.underwater, split: s.split }));
    rows.push({ p: "scroll", fps: o.scroll.fps, p95: o.scroll.frameMsP95, cpu: o.scroll.cpuMsAvg, gpu: o.scroll.gpuMsAvg, calls: o.scroll.info?.calls, tris: o.scroll.info?.triangles });
    return rows;
  }

  window.__perf = { run, summary, sampleRaf, sampleStep, sceneStats, rendererStats, network, stepFrames, pointStep, scrollStep, baseStep, passes, ablate, restore: () => hook?.restore() };
})();
// Painel visível (rAF a 60 Hz):  await __perf.run()            (~45 s; pode estourar o limite de 45 s do javascript_tool)
// Painel oculto / por partes:    await __perf.baseStep(); await __perf.pointStep(0); ... ; await __perf.scrollStep()
"__perf pronto";
