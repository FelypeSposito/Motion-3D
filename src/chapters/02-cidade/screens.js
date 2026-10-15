// Telões: cada projeto do portfólio é uma tela de LED na fachada, com efeito de "tela filmada por celular"
// (grade de subpixels RGB, moiré, faixa de obturador rolando, aberração cromática, estouro de exposição).
// Todos os telões = UMA malha instanciada (+ uma de halos aditivos).
//
// Conteúdo — VÍDEO MOSAICO: um único vídeo com vários clipes em grade; cada telão lê um recorte (aRect).
// Sem vídeo, o shader gera um clipe procedural por célula. API: screens.setMosaic(videoOuTextura, { cols, rows, aspect })
// e screens.setPoster(textura) (quadro parado usado pelos telões congelados; sem pôster, leem o próprio vídeo).
// Desempenho: só os N telões mais próximos e visíveis "tocam"; os demais visíveis andam a ~4 quadros/s e os fora de vista
// congelam. Com vídeo real, o elemento <video> é pausado quando nenhum telão está tocando.
import * as THREE from "three";
import { COMMON_GLSL } from "./glsl.js";
import { PROJECTS, NEON, MOSAIC } from "./projects.js";

// Títulos dos projetos numa textura (uma faixa 4:1 por projeto), desenhada uma vez num canvas
async function titleAtlas(mobile) {
  try { await Promise.race([Promise.all([document.fonts.load('italic 120px "Instrument Serif"'), document.fonts.load('500 40px "Instrument Sans"')]), new Promise((r) => setTimeout(r, 1200))]); } catch {}
  const cw = mobile ? 512 : 1024, ch = cw / 4, cv = document.createElement("canvas");
  cv.width = cw; cv.height = ch * PROJECTS.length;
  const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.textBaseline = "alphabetic";
  PROJECTS.forEach((p, i) => {
    const y = i * ch;
    g.font = `500 ${ch * .13}px "Instrument Sans", sans-serif`;
    g.fillText(String(i + 1).padStart(2, "0") + " — " + p.tag.toUpperCase(), ch * .04, y + ch * .2);
    g.font = `italic ${ch * .62}px "Instrument Serif", serif`;
    g.fillText(p.title, ch * .02, y + ch * .86);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
  return t;
}
// chamada do hover ("VER PROJETO ↗"), uma faixa 4:1 única
function ctaTexture(mobile) {
  const cw = mobile ? 256 : 512, ch = cw / 4, cv = document.createElement("canvas");
  cv.width = cw; cv.height = ch;
  const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.textBaseline = "middle";
  g.font = `600 ${ch * .34}px "Instrument Sans", sans-serif`;
  g.fillText("VER PROJETO  \u2197", ch * .06, ch * .52);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
  return t;
}

// fixed: telões posicionados à mão [{ p: Vector3, W, H, rotY, project? }] (os projetos vão neles);
// facades: as demais fachadas recebem telões automáticos (anúncios abstratos), marcadas com f.screen = true.
export async function createScreens({ facades, U, mobile, rnd, fixed = [], fill = .58 }) {
  const items = fixed.map((it) => ({ ...it, n: new THREE.Vector3(Math.sin(it.rotY), 0, Math.cos(it.rotY)) }));
  for (const f of facades) {
    if (f.noAuto || rnd() > fill) continue;                                 // fachadas sem telão ficam para os neons
    f.screen = true;
    const n = new THREE.Vector3(Math.sin(f.rotY), 0, Math.cos(f.rotY));
    const T = new THREE.Vector3(Math.cos(f.rotY), 0, -Math.sin(f.rotY));      // horizontal, no plano da fachada
    const vertical = rnd() < .25;
    let W = vertical ? Math.min(f.w * .6, 4 + rnd() * 3) : Math.min(f.w * .86, 6 + rnd() * 7);
    let H = vertical ? W * 1.6 : W * 9 / 16;
    if (H > f.h - 5) { H = f.h - 5; W = vertical ? H / 1.6 : H * 16 / 9; }
    const y = 3.2 + H / 2 + rnd() * Math.max(0, Math.min(14, f.h - H - 6));
    const along = (rnd() - .5) * Math.max(0, f.w - W) * .8;
    const base = new THREE.Vector3(f.pos[0], 0, f.pos[2]).addScaledVector(n, .15).addScaledVector(T, along);
    items.push({ p: base.clone().setY(y), W, H, rotY: f.rotY, n });
    if (!vertical && f.h > y + H + 9 && rnd() < .5) {                     // segundo telão acima (estilo praça)
      const W2 = W * (.6 + rnd() * .3), H2 = W2 * 9 / 16 * (rnd() < .5 ? 1 : .5);
      items.push({ p: base.clone().setY(y + H / 2 + 1 + H2 / 2), W: W2, H: H2, rotY: f.rotY, n });
    }
  }
  const N = items.length;

  // ---- atributos por instância
  const aRect = new Float32Array(N * 4), aColor = new Float32Array(N * 3), aInfo = new Float32Array(N * 4), aKind = new Float32Array(N * 2);
  const col = new THREE.Color();
  const cellRect = (cell, cols, rows) => [(cell % cols) / cols, 1 - (Math.floor(cell / cols) + 1) / rows, 1 / cols, 1 / rows];
  const cells = items.map((it, i) => (it.project !== undefined ? it.project : PROJECTS.length + (i % (MOSAIC.cols * MOSAIC.rows - PROJECTS.length))));
  function setRects(cols, rows) { items.forEach((_, i) => aRect.set(cellRect(cells[i] % (cols * rows), cols, rows), i * 4)); }
  setRects(MOSAIC.cols, MOSAIC.rows);
  items.forEach((it, i) => {
    col.set(it.project !== undefined ? PROJECTS[it.project].color : NEON[Math.floor(rnd() * NEON.length)]);
    aColor.set([col.r, col.g, col.b], i * 3);
    aInfo.set([rnd() * 10, 0, rnd() * 20, 0], i * 4);                       // semente, (livre), tempo do clipe, tocando?
    aKind.set([it.project ?? -1, cells[i] % 4], i * 2);                      // linha do título, estilo do clipe procedural
  });

  const plane = new THREE.PlaneGeometry(1, 1);
  const geo = plane.clone(), haloGeo = plane.clone();
  for (const g of [geo, haloGeo]) {
    g.setAttribute("aRect", new THREE.InstancedBufferAttribute(aRect, 4));
    g.setAttribute("aColor", new THREE.InstancedBufferAttribute(aColor, 3));
    g.setAttribute("aKind", new THREE.InstancedBufferAttribute(aKind, 2));
  }
  const infoAttr = new THREE.InstancedBufferAttribute(aInfo, 4); infoAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aInfo", infoAttr); haloGeo.setAttribute("aInfo", infoAttr);
  const aHover = new Float32Array(N), hoverAttr = new THREE.InstancedBufferAttribute(aHover, 1); hoverAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aHover", hoverAttr); haloGeo.setAttribute("aHover", hoverAttr);

  const S = {
    tVideo: { value: null }, tPoster: { value: null }, uHasVideo: { value: 0 }, uCellAspect: { value: MOSAIC.aspect },
    tTitles: { value: await titleAtlas(mobile) }, tCta: { value: ctaTexture(mobile) }, uRows: { value: PROJECTS.length }, uDensity: { value: mobile ? 13 : 17 },
  };
  const VS = /* glsl */`
    attribute vec4 aRect, aInfo; attribute vec3 aColor; attribute vec2 aKind; attribute float aHover;
    varying vec2 vUv, vSize, vKind; varying vec3 vW, vColor; varying vec4 vRect, vInfo; varying float vH, vHover;
    void main() {
      vUv = uv; vRect = aRect; vInfo = aInfo; vColor = aColor; vKind = aKind; vHover = aHover;
      vSize = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
      float pop = aHover * aHover * (3. - 2. * aHover);   // em foco: cresce um pouco e avança da parede
      vec4 ip = instanceMatrix * vec4(position * (1. + .045 * pop) + vec3(0., 0., .12 * pop), 1.); vH = ip.y;
      vec4 w = modelMatrix * ip; vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...S, uT: U.time, uHaze: U.haze, uFogD: U.fogD, tLight: U.light },
    vertexShader: VS,
    fragmentShader: /* glsl */`
      uniform sampler2D tVideo, tPoster, tTitles, tCta; uniform float uT, uHasVideo, uCellAspect, uRows, uDensity;
      varying vec2 vUv, vSize, vKind; varying vec3 vW, vColor; varying vec4 vRect, vInfo; varying float vH, vHover;
      ${COMMON_GLSL}
      // clipes procedurais (substitutos do vídeo): 4 estilos, cada um com a cor do projeto
      vec3 clip(vec2 uv, float t, vec3 c, float s, float st) {
        vec3 c2 = c.gbr * .85 + .08;
        if (st < .5) {                                   // manchas fluidas
          vec2 p = uv * vec2(4.5, 2.6);
          float v = sin(p.x * 1.3 + t * .9 + s) + sin(p.y * 1.9 - t * .7 + sin(p.x + t * .4) * 1.5) + sin((p.x + p.y) * 1.1 + t * .5);
          return mix(c * .06, mix(c, c2, .5 + .5 * sin(v * 1.4 + t)), smoothstep(-.8, 1.8, v));
        } else if (st < 1.5) {                           // barras de equalizador
          float i = floor(uv.x * 18.), hg = .4 + .28 * sin(t * 2.3 + i * .7 + s) + .18 * sin(t * 3.7 + i * 1.9);
          float on = step(uv.y, hg) * step(.18, fract(uv.x * 18.));
          return mix(c * .04, mix(c, c2, uv.y * 1.4), on);
        } else if (st < 2.5) {                           // anéis pulsando
          vec2 q = (uv - .5) * vec2(1.78, 1.); float r = length(q);
          float ring = smoothstep(.07, .0, abs(fract(r * 3.5 - t * .5) - .5) - .16);
          return mix(c * .05, c2, ring * smoothstep(.95, .2, r)) + c * smoothstep(.28, .0, r) * .9;
        }
        vec2 g = floor(uv * vec2(9., 5.)); float h = hash12(g + s);   // ladrilhos virando
        float f = step(.5, fract(h + t * .22 * (.5 + h)));
        return mix(c * .05, mix(c, c2, h), f) * (.55 + .45 * fract(h * 7.));
      }
      vec3 content(vec2 cuv, float t) {
        if (uHasVideo > .5) {
          vec2 m = vRect.xy + clamp(cuv, .002, .998) * vRect.zw, a = vec2(.0018 * vRect.z, 0.);   // aberração no vídeo
          if (vInfo.w > .5) return vec3(texture2D(tVideo, m + a).r, texture2D(tVideo, m).g, texture2D(tVideo, m - a).b);
          return vec3(texture2D(tPoster, m + a).r, texture2D(tPoster, m).g, texture2D(tPoster, m - a).b);
        }
        return clip(cuv, t, vColor, vInfo.x, vKind.y);
      }
      void main() {
        if (!gl_FrontFacing) { gl_FragColor = vec4(cityFog(vec3(.01), vW, vH), 1.); return; }
        vec2 uv = vUv, res = floor(vSize * uDensity), px = uv * res;
        vec2 q = (floor(px) + .5) / res;                 // amostra no centro de cada LED
        float A = vSize.x / vSize.y;                     // recorte "cover" do clipe no telão
        vec2 cuv = q - .5;
        if (A > uCellAspect) cuv.y *= uCellAspect / A; else cuv.x *= A / uCellAspect;
        vec3 c = content(cuv + .5, vInfo.z);
        // título do projeto (faixa no canto inferior esquerdo), com aberração cromática nas bordas das letras
        if (vKind.x > -.5) {
          float hb = min(.24, .9 * vSize.x / 4. / vSize.y), wb = hb * vSize.y * 4. / vSize.x;
          vec2 tuv = (q - vec2(.05, .07)) / vec2(wb, hb);
          if (tuv.x > 0. && tuv.x < 1. && tuv.y > 0. && tuv.y < 1.) {
            vec2 o = vec2(.006, 0.);
            float row = vKind.x;
            vec2 a = vec2(tuv.x, 1. - (row + 1. - tuv.y) / uRows);
            vec3 tt = vec3(texture2D(tTitles, a + o).a, texture2D(tTitles, a).a, texture2D(tTitles, a - o).a);
            c = c * (1. - .55 * tt.g) + tt * 1.6;
          }
          c *= 1. - .45 * smoothstep(.0, .35, .33 - q.y);  // base mais escura para o texto
        }
        // ---- "filmado por celular"
        vec2 f = fract(px), fw = fwidth(px);
        float fm = max(fw.x, fw.y);                      // LEDs por pixel de tela
        vec3 sub = clamp(1.7 - abs(f.x * 3. - vec3(.5, 1.5, 2.5)) * 1.9, 0., 1.);
        float rowm = smoothstep(.0, .2, f.y) * smoothstep(1., .8, f.y);
        vec3 mask = mix(sub * rowm * 2.4, vec3(.8), smoothstep(.22, .6, fm));
        float hv = vHover * vHover * (3. - 2. * vHover);
        mask = mix(mask, vec3(1.), hv * .55);                // em foco: imagem mais limpa (menos "tela filmada")
        // moiré: arcos coloridos que aparecem quando a grade de LEDs bate com a grade do sensor (mais forte na faixa
        // em que um LED ocupa ~1 pixel); mudam com a distância, como na câmera de verdade
        float ma = length((uv - vec2(.25 + .2 * sin(vInfo.x), 1.6)) * vec2(A, 1.)) * (55. + 25. * fract(vInfo.x)) / (.6 + fm) + uT * .4;
        float mk = .08 + .3 * smoothstep(.12, .45, fm) * (1. - smoothstep(1., 3., fm));
        c *= mask * (1. + mk * (1. - hv) * vec3(sin(ma), sin(ma + 2.09), sin(ma + 4.19)));
        // obturador rolando: faixa escura com borda clara descendo pela tela
        float rb = fract(uv.y * .7 + uT * .21 + vInfo.x);
        c *= 1. - .32 * smoothstep(.0, .05, rb) * smoothstep(.3, .14, rb);
        c += c * .5 * smoothstep(.012, .0, abs(rb - .31));
        // exposição estourada: os claros saturam para o branco
        c *= 2.2;
        float l = dot(c, vec3(.3, .59, .11));
        c = mix(c, vec3(l), smoothstep(1.2, 4., l) * .55);
        // moldura escura do painel
        vec2 e = min(uv, 1. - uv) * vSize;
        c *= smoothstep(.03, .14, min(e.x, e.y));
        c *= 1. + .35 * hv;
        if (hv > .001) {
          // moldura acesa com uma luz que corre pelo perímetro
          float ed = min(e.x, e.y), line = smoothstep(.09, .0, abs(ed - .2));
          vec2 cuv2 = uv - .5; float ang = atan(cuv2.y * vSize.y, cuv2.x * vSize.x) / 6.2832 + .5;
          float run = pow(fract(ang - uT * .35), 6.) + pow(fract(ang - uT * .35 + .5), 6.);
          vec3 lc = mix(vColor, vec3(1.), .55);
          c += lc * line * (.6 + 2.4 * run) * hv;
          // cantoneiras (estilo mira) entrando de fora para dentro
          vec2 k = abs(uv - .5) * vSize - (vSize * .5 - .55 - .5 * (1. - hv));
          float br = step(0., k.x) * step(0., k.y) * step(min(k.x, k.y), .07) * step(max(k.x, k.y), .8);
          c += vec3(1.) * br * 2.2 * hv;
          // chamada "VER PROJETO" no canto inferior direito, subindo
          float hb = min(.16, .7 * vSize.x / 4. / vSize.y), wb = hb * vSize.y * 4. / vSize.x;
          vec2 cu = (uv - vec2(.95 - wb, .93 - hb + .04 * (1. - hv))) / vec2(wb, hb);   // canto superior direito (o título fica embaixo)
          if (cu.x > 0. && cu.x < 1. && cu.y > 0. && cu.y < 1.) c = mix(c, vec3(2.2), texture2D(tCta, cu).a * hv);
        }
        vec3 fogged = cityFog(c, vW, vH);
        gl_FragColor = vec4(mix(c, fogged, .75), 1.);
      }`,
  });

  // halo aditivo atrás de cada telão (brilho falso, no lugar do bloom)
  const haloMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: U.time, uHaze: U.haze, uFogD: U.fogD, tLight: U.light },
    vertexShader: VS,
    fragmentShader: /* glsl */`
      uniform float uT;
      varying vec2 vUv, vSize, vKind; varying vec3 vW, vColor; varying vec4 vRect, vInfo; varying float vH, vHover;
      ${COMMON_GLSL}
      void main() {
        vec2 p = abs(vUv - .5) * 2., inner = vec2(1. / 1.7);
        float d = length(max(p - inner, 0.) / (1. - inner));
        float g = pow(max(1. - d, 0.), 2.2) * (.75 + .25 * sin(uT * 1.7 + vInfo.x * 3.));
        float dist = length(vW - cameraPosition);
        g *= smoothstep(2., 8., dist) * exp(-dist * .01);
        gl_FragColor = vec4(vColor * g * (.28 + .12 * vInfo.w) * (1. + 1.8 * vHover), 1.);
      }`,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, N), halo = new THREE.InstancedMesh(haloGeo, haloMat, N);
  halo.renderOrder = 2;
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3();
  const centers = items.map((it) => it.p.clone()), radii = items.map((it) => Math.hypot(it.W, it.H) / 2);
  items.forEach((it, i) => {
    q4.setFromAxisAngle(up, it.rotY);
    mesh.setMatrixAt(i, m4.compose(it.p, q4, sc.set(it.W, it.H, 1)));
    halo.setMatrixAt(i, m4.compose(it.p.clone().addScaledVector(it.n, -.06), q4, sc.set(it.W * 1.7, it.H * 1.7, 1)));
  });
  mesh.computeBoundingSphere(); halo.computeBoundingSphere();
  const group = new THREE.Group(); group.add(mesh, halo);

  // ---- quem toca: os mais próximos dentro do quadro
  const MAX_LIVE = mobile ? 3 : 6;
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();
  const acc = new Float32Array(N), order = items.map((_, i) => i), dist = new Float32Array(N), vis = new Uint8Array(N);
  let video = null, anyLive = false;

  // ---- telões de projeto são botões: raio do ponteiro → foco (hover); clique/toque → abre o projeto
  const ndc = new THREE.Vector2(9, 9), ray = new THREE.Raycaster(), hitP = new THREE.Vector3(), hitPlane = new THREE.Plane(), T3 = new THREE.Vector3();
  const projIdx = items.map((it, i) => (it.project !== undefined ? i : -1)).filter((i) => i >= 0);
  let hovered = -1, lastCam = null;
  const setNdc = (e) => ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  const pick = (cam) => {
    if (!cam || ndc.x > 2) return -1;
    ray.setFromCamera(ndc, cam);
    let best = -1, bd = Infinity;
    for (const i of projIdx) {
      const it = items[i];
      if (ray.ray.direction.dot(it.n) > -1e-3) continue;                    // só pela frente
      hitPlane.setFromNormalAndCoplanarPoint(it.n, it.p);
      if (!ray.ray.intersectPlane(hitPlane, hitP)) continue;
      const d = hitP.distanceTo(cam.position); if (d > 140 || d > bd) continue;
      hitP.sub(it.p); T3.set(Math.cos(it.rotY), 0, -Math.sin(it.rotY));
      if (Math.abs(hitP.dot(T3)) < it.W * .52 && Math.abs(hitP.y) < it.H * .52) { best = i; bd = d; }
    }
    return best;
  };
  const open = (i) => {
    const project = PROJECTS[items[i].project];
    dispatchEvent(new CustomEvent("motion:project", { detail: { index: items[i].project, project } }));
    if (project.url) window.open(project.url, "_blank", "noopener");
  };
  const onMove = (e) => setNdc(e);
  const onClick = (e) => { setNdc(e); const i = pick(lastCam); if (i >= 0) open(i); };
  addEventListener("pointermove", onMove, { passive: true });
  addEventListener("click", onClick);

  return {
    group, items,
    // fontes de luz para o mapa de luz (água/fachadas)
    lights: items.map((it, i) => ({ x: it.p.x + it.n.x * 2, z: it.p.z + it.n.z * 2, c: new THREE.Color(aColor[i * 3], aColor[i * 3 + 1], aColor[i * 3 + 2]), i: it.W * it.H * .011 })),
    update(cam, dt) {
      pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
      for (let i = 0; i < N; i++) {
        sph.set(centers[i], radii[i]); vis[i] = frustum.intersectsSphere(sph) ? 1 : 0;
        dist[i] = centers[i].distanceTo(cam.position) + (vis[i] ? 0 : 1e4);
      }
      order.sort((a, b) => dist[a] - dist[b]);
      let live = 0;
      for (const i of order) {
        const isLive = vis[i] && live < MAX_LIVE; if (isLive) live++;
        const o = i * 4;
        if (isLive) aInfo[o + 2] += dt;
        else if (vis[i]) { acc[i] += dt; if (acc[i] > .25) { aInfo[o + 2] += acc[i]; acc[i] = 0; } }   // ~4 quadros/s
        aInfo[o + 3] = isLive ? 1 : 0;
      }
      infoAttr.needsUpdate = true;
      // foco: entra rápido, sai devagar; o cursor vira mãozinha sobre um projeto
      lastCam = cam;
      const h = pick(cam);
      if (h !== hovered) { hovered = h; document.body.style.cursor = h >= 0 ? "pointer" : ""; }
      for (const i of projIdx) aHover[i] += ((i === hovered ? 1 : 0) - aHover[i]) * Math.min(1, dt * (i === hovered ? 9 : 5));
      hoverAttr.needsUpdate = true;
      if (video && (live > 0) !== anyLive) { anyLive = live > 0; anyLive ? video.play?.().catch(() => {}) : video.pause?.(); }
    },
    // recebe o vídeo mosaico (HTMLVideoElement ou THREE.Texture)
    setMosaic(src, { cols = MOSAIC.cols, rows = MOSAIC.rows, aspect = MOSAIC.aspect } = {}) {
      const tex = src.isTexture ? src : new THREE.VideoTexture(src);
      tex.colorSpace = THREE.SRGBColorSpace;
      video = src.isTexture ? null : src;
      S.tVideo.value = tex; if (!S.tPoster.value) S.tPoster.value = tex;
      S.uHasVideo.value = 1; S.uCellAspect.value = aspect;
      setRects(cols, rows); geo.attributes.aRect.needsUpdate = haloGeo.attributes.aRect.needsUpdate = true;
    },
    setPoster(tex) { tex.colorSpace = THREE.SRGBColorSpace; S.tPoster.value = tex; },
    get hovered() { return hovered >= 0 ? items[hovered].project : -1; },
    dispose() {
      S.tTitles.value.dispose(); S.tCta.value.dispose(); S.tVideo.value?.dispose();
      removeEventListener("pointermove", onMove); removeEventListener("click", onClick); document.body.style.cursor = "";
    },
  };
}
