// Interlúdio 2D — fundo do lago, entre o prado e a cidade. Fundo WebGL mínimo (azul-marinho com luz d'água sutil e
// poeira bege em suspensão) + camada HTML com a apresentação: linhas finas que descem do topo, textos que entram pela
// direita e de cima, tipografia editorial (Instrument Serif itálico + Instrument Sans). Tudo amarrado à rolagem do
// capítulo, suavizado (animações fluidas mesmo com a roda do mouse), só transform/opacity.
import * as THREE from "three";

const NAVY = new THREE.Color("#0f1b33"), DEEP = new THREE.Color("#070d1c"), SAND = new THREE.Color("#d9c9a8");

// ---- linha do tempo (p = progresso do capítulo, 0..1): cada peça entra em [a, b] e sai em [c, d]
//   from: deslocamento inicial (vw/vh); line: escala do traço (x ou y) em vez de deslocamento
const ACTS = [
  // 1 — título
  { sel: ".l1", a: .02, b: .16, c: .34, d: .42, line: "y" },
  { sel: ".l2", a: .05, b: .20, c: .34, d: .42, line: "y" },
  { sel: ".l3", a: .08, b: .22, c: .34, d: .42, line: "y" },
  { sel: ".tag1", a: .16, b: .24, c: .32, d: .40, from: [0, -2] },
  { sel: ".h1", a: .06, b: .24, c: .32, d: .42, from: [38, 0] },
  { sel: ".cap1", a: .12, b: .26, c: .32, d: .40, from: [0, -6] },
  // 2 — quem faz
  { sel: ".rule2", a: .42, b: .54, c: .66, d: .72, line: "x" },
  { sel: ".tag2", a: .44, b: .54, c: .64, d: .71, from: [0, -3] },
  { sel: ".h2", a: .45, b: .58, c: .64, d: .72, from: [30, 0] },
  { sel: ".sub2", a: .50, b: .60, c: .64, d: .71, from: [0, -4] },
  { sel: ".txt2", a: .53, b: .63, c: .64, d: .71, from: [0, -4] },
  { sel: ".v2", a: .43, b: .58, c: .64, d: .72, line: "y" },
  // 3 — próxima parada
  { sel: ".hr3", a: .72, b: .84, c: 2, d: 2, line: "x" },
  { sel: ".tag3", a: .75, b: .84, c: .95, d: 1.0, from: [0, -3] },
  { sel: ".h3", a: .76, b: .88, c: .95, d: 1.0, from: [24, 0] },
  { sel: ".v3", a: .80, b: .92, c: .95, d: 1.0, line: "y" },
  { sel: ".hint3", a: .86, b: .93, c: .96, d: 1.0, from: [0, -2] },
  { sel: ".coord", a: .03, b: .12, c: .95, d: 1.0, from: [0, 0] },
];

const HTML = `
  <div class="iv-line l1"></div><div class="iv-line l2"></div><div class="iv-line l3"></div>
  <span class="iv-tag tag1">01 — Interlúdio</span>
  <h2 class="iv-h h1">Motion <em>3D</em></h2>
  <p class="iv-cap cap1">um portfólio em movimento · 2026</p>

  <div class="iv-line v2"></div>
  <div class="iv-block b2">
    <span class="iv-tag tag2">Quem faz</span>
    <div class="iv-rule rule2"></div>
    <h2 class="iv-h h2"><em>Felype</em> Sposito</h2>
    <p class="iv-sub sub2">design · 3D · código interativo</p>
    <p class="iv-txt txt2">Cenas que respondem à rolagem, ao toque e ao tempo —<br>do prado na névoa à cidade que acende.</p>
  </div>

  <div class="iv-rule hr3"></div>
  <div class="iv-block b3">
    <span class="iv-tag tag3">Próxima parada</span>
    <h2 class="iv-h h3">a cidade <em>acende</em></h2>
  </div>
  <div class="iv-line v3"></div>
  <span class="iv-hint hint3">role ↓</span>
  <span class="iv-coord coord c-tl">23°32′S · 46°38′W</span><span class="iv-coord coord c-br">−4,2 m</span>
`;

const CSS = `
  #interlude{position:fixed;inset:0;z-index:5;pointer-events:none;color:#d9c9a8;font-family:"Instrument Sans",system-ui,sans-serif;opacity:0;
    --ink:#d9c9a8;--dim:rgba(217,201,168,.55);--hair:rgba(217,201,168,.38)}
  #interlude *{position:absolute;margin:0;will-change:transform,opacity}
  #interlude em{position:static;font-style:italic;font-family:"Instrument Serif",Georgia,serif;font-weight:400}
  #interlude .iv-line{width:1px;background:var(--hair);transform-origin:top}
  #interlude .l1{left:18vw;top:0;height:46vh} #interlude .l2{left:61vw;top:0;height:31vh} #interlude .l3{left:83vw;top:0;height:58vh}
  #interlude .iv-tag{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--dim);white-space:nowrap}
  #interlude .tag1{left:calc(61vw + 14px);top:calc(31vh - 6px)}
  #interlude .iv-h{font-family:"Instrument Serif",Georgia,serif;font-weight:400;line-height:.9;letter-spacing:-.02em;white-space:nowrap}
  #interlude .h1{right:7vw;bottom:16vh;font-size:clamp(64px,13vw,220px)}
  #interlude .h1 em{color:#efe3c8}
  #interlude .cap1{left:7vw;bottom:17vh;font-size:13px;letter-spacing:.06em;color:var(--dim);max-width:22ch}
  #interlude .iv-block{position:absolute}
  #interlude .iv-block > *{position:relative;display:block}
  #interlude .b2{right:8vw;top:30vh;width:min(46vw,640px)}
  #interlude .iv-rule{height:1px;background:var(--hair);transform-origin:right}
  #interlude .rule2{width:100%;margin:14px 0 26px}
  #interlude .h2{font-size:clamp(46px,7vw,120px);position:relative}
  #interlude .sub2{margin-top:22px;font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--ink)}
  #interlude .txt2{margin-top:16px;font-size:15px;line-height:1.6;color:var(--dim);max-width:46ch}
  #interlude .v2{left:30vw;top:0;height:72vh}
  #interlude .hr3{left:0;right:0;top:22vh;transform-origin:left}
  #interlude .b3{right:12vw;bottom:24vh;text-align:right}
  #interlude .h3{font-size:clamp(40px,5.6vw,96px);position:relative;margin-top:14px}
  #interlude .v3{right:calc(12vw + 4px);bottom:7vh;height:14vh;transform-origin:top}
  #interlude .iv-hint{right:calc(12vw + 14px);bottom:7vh;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--dim)}
  #interlude .iv-coord{font-size:10px;letter-spacing:.18em;color:var(--hair);font-family:ui-monospace,Menlo,monospace}
  #interlude .c-tl{left:24px;top:84px} #interlude .c-br{right:24px;bottom:24px}
  @media (max-width:768px){
    #interlude .l1{left:10vw} #interlude .l2{left:58vw} #interlude .l3{left:88vw}
    #interlude .tag1{left:calc(58vw + 10px)}
    #interlude .h1{right:auto;left:6vw;bottom:22vh;font-size:clamp(56px,19vw,110px)}
    #interlude .cap1{bottom:14vh;left:6vw}
    #interlude .b2{right:auto;left:6vw;width:88vw;top:24vh}
    #interlude .h2{font-size:clamp(40px,13vw,72px);white-space:normal}
    #interlude .v2{left:auto;right:5vw;height:20vh}
    #interlude .txt2 br{display:none}
    #interlude .b3{right:6vw;bottom:26vh}
    #interlude .v3{right:calc(6vw + 4px)} #interlude .iv-hint{right:calc(6vw + 14px)}
  }
  @media (prefers-reduced-motion:reduce){ #interlude *{transition:none} }
`;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOut = (x) => 1 - Math.pow(1 - x, 4);           // chegada macia, sem mola

export async function create(ctx) {
  // ---- fundo WebGL: azul-marinho, luz d'água bem sutil vinda de cima e poeira bege (barato: um quad + pontos)
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const U = { uT: { value: 0 }, uAspect: { value: 1 }, uP: { value: 0 } };
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { ...U, uNavy: { value: NAVY }, uDeep: { value: DEEP }, uSand: { value: SAND } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: /* glsl */`
      uniform float uT, uAspect, uP; uniform vec3 uNavy, uDeep, uSand; varying vec2 vUv;
      float h(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 p = vec2(vUv.x * uAspect, vUv.y);
        vec3 col = mix(uDeep, uNavy, smoothstep(-.1, 1.1, vUv.y));
        // véus de luz d'água: faixas largas e lentas, mais fortes no alto (a superfície fica em cima)
        float veil = vn(vec2(p.x * 1.6 + uT * .03, p.y * .35 - uT * .02)) * vn(vec2(p.x * 3.1 - uT * .05, p.y * 1.2));
        col += uSand * veil * .035 * smoothstep(.2, 1., vUv.y);
        // cáustica quase imperceptível
        vec2 q = p * 5. + vec2(uT * .12, -uT * .08);
        float c = pow(abs(sin(q.x + sin(q.y * 1.3)) * sin(q.y + sin(q.x * 1.1 + uT * .2))), 8.);
        col += uSand * c * .02 * smoothstep(.45, 1., vUv.y);
        // grão fino (premium, não ruidoso)
        col += (h(gl_FragCoord.xy + fract(uT) * 91.) - .5) * .012;
        gl_FragColor = vec4(col, 1.);
      }`,
  }));
  bg.frustumCulled = false; scene.add(bg);
  // poeira em suspensão: sobe devagar, como no fundo do lago
  const N = ctx.quality.mobile ? 90 : 220, pa = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) pa.set([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random()], i * 3);
  const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pa, 3));
  const dust = new THREE.Points(pg, new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, uniforms: { ...U, uDpr: { value: ctx.quality.dpr } },
    vertexShader: /* glsl */`uniform float uT, uDpr; varying float vA;
      void main(){
        vec2 p = position.xy; float z = position.z;
        p.y = mod(p.y + 1. + uT * (.008 + z * .02), 2.) - 1.; p.x += sin(uT * .2 + z * 20.) * .01;
        gl_Position = vec4(p, 0., 1.); gl_PointSize = uDpr * (1. + z * 2.2); vA = .15 + z * .35;
      }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - .5); gl_FragColor = vec4(vec3(.85, .79, .66), smoothstep(.5, .0, d) * vA); }`,
  }));
  dust.frustumCulled = false; scene.add(dust);

  // ---- camada HTML
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
  const root = document.createElement("div"); root.id = "interlude"; root.setAttribute("aria-hidden", "true"); root.innerHTML = HTML;
  document.body.appendChild(root);
  const acts = ACTS.map((a) => ({ ...a, els: [...root.querySelectorAll(a.sel)] }));

  let target = 0, p = 0;
  function apply(pp) {
    // a camada some nas pontas do capítulo (a água turva do motor faz a passagem)
    root.style.opacity = (clamp01((pp - .015) / .05) * (1 - clamp01((pp - .965) / .03))).toFixed(3);
    for (const a of acts) {
      const i = easeOut(clamp01((pp - a.a) / (a.b - a.a))), o = easeOut(clamp01((pp - a.c) / (a.d - a.c)));
      const vis = i * (1 - o);
      for (const el of a.els) {
        if (a.line) {
          const s = Math.max(0, i - o * (a.line === "y" ? 0 : 0));   // traço desenha na entrada e recolhe na saída
          el.style.transform = a.line === "y" ? `scaleY(${(i * (1 - o)).toFixed(4)})` : `scaleX(${s * (1 - o)})`;
          el.style.opacity = vis > .001 ? 1 : 0;
        } else {
          const [fx, fy] = a.from;
          // entra do deslocamento "from"; sai subindo um pouco (como bolha indo para a superfície)
          const x = fx * (1 - i), y = fy * (1 - i) - 3 * o;
          el.style.transform = `translate3d(${x.toFixed(3)}vw, ${y.toFixed(3)}vh, 0)`;
          el.style.opacity = vis.toFixed(3);
        }
      }
    }
  }
  apply(0);

  return {
    scene, camera, clearColor: 0x070d1c,
    toneMapping: THREE.NoToneMapping, exposure: 1,
    post: { vignette: .7, grain: .025 },
    underwater: 0, nightLocked: true, isNight: true, hideCaption: true,
    setProgress(v) { target = v; },
    update(t, dt) {
      U.uT.value = t;
      // suaviza a rolagem (mola crítica simples): fluido mesmo com a roda do mouse em degraus
      p += (target - p) * (1 - Math.exp(-dt * 6));
      if (Math.abs(target - p) < 1e-4) p = target;
      apply(p);
    },
    resize(w, h) { U.uAspect.value = w / h; },
    dispose() { root.remove(); style.remove(); },
  };
}
