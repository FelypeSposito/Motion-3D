import { createEngine } from "./core/engine.js";
import { createLoader } from "./core/loader.js";
import { createChapters } from "./core/chapters.js";
import { createScroll } from "./core/scroll.js";
import { quality } from "./core/quality.js";

// Roteiro da narrativa. Cada capítulo é um módulo separado: o Vite gera um arquivo por capítulo,
// baixado só quando a rolagem se aproxima dele.
const STORY = [
  { kicker: "01 — Prado", title: "Onde as ideias <em>florescem</em>", module: () => import("./chapters/01-prado/index.js") },
  { kicker: "02 — Cidade", title: "Onde as ideias <em>acendem</em>", module: () => import("./chapters/02-cidade/index.js") },
];

const engine = createEngine(document.getElementById("stage"));
const nightBtn = document.getElementById("nightBtn");
const loader = createLoader(engine.renderer);
const chapters = createChapters({
  list: STORY, engine, ctx: { loader, quality, renderer: engine.renderer },
  onChapter: (i, ch, inst) => {
    document.getElementById("kicker").textContent = ch.kicker;
    document.getElementById("title").innerHTML = ch.title;
  },
});

const bar = document.getElementById("progressBar");
let lastBar = -1;
const scroll = createScroll({
  max: STORY.length - 0.001,
  onChange: (p) => {
    chapters.setProgress(p);
    const v = Math.round((p / STORY.length) * 200) / 200;     // só escreve no DOM quando muda de fato
    if (v !== lastBar) { lastBar = v; bar.style.transform = `scaleY(${v})`; }
  },
});
// botão dia/noite: some quando o capítulo trava a noite (submerso) e o ícone acompanha o estado real
let lastLock = null, lastNight = null;
engine.onFrame = (t, dt) => {
  scroll.update(dt);
  const cur = engine.state.current; if (!cur) return;
  const lock = !!cur.nightLocked || !cur.toggleNight;
  if (lock !== lastLock) { lastLock = lock; nightBtn.classList.toggle("hide", lock); }
  const n = !!cur.isNight;
  if (n !== lastNight) { lastNight = n; nightBtn.textContent = n ? "☀" : "☾"; }
};

// carrega o primeiro capítulo antes de liberar a entrada
const loaderEl = document.getElementById("loader"), enter = document.getElementById("enter");
loaderEl.querySelector(".bar i").style.transform = "scaleX(.35)";
chapters.load(0).then(() => {
  chapters.setProgress(0);
  engine.start();
  loaderEl.querySelector(".bar i").style.transform = "scaleX(1)";
  enter.disabled = false;
  window.__readyAt = Math.round(performance.now());   // depuração: ms até a cena ficar pronta
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("export"))   // cena fixa → GLB para o Blender
    import("./dev/export-prado.js").then((m) => m.exportPrado(engine.state.current.scene));
});
enter.addEventListener("click", () => {
  loaderEl.classList.add("out");
  document.querySelectorAll(".ui").forEach((el) => el.classList.add("on"));
  scroll.enable();
  setTimeout(() => loaderEl.remove(), 1300);
});

nightBtn.addEventListener("click", () => engine.state.current?.toggleNight?.());

// atalho de depuração (localhost): __motion.go(1.5) leva a um ponto da narrativa
window.__motion = { engine, chapters, scroll, go: (p) => scroll.goTo(p), step: (n = 1) => { for (let i = 0; i < n; i++) engine.step(); } };
