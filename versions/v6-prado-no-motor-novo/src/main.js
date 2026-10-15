import { createEngine } from "./core/engine.js";
import { createLoader } from "./core/loader.js";
import { createChapters } from "./core/chapters.js";
import { createScroll } from "./core/scroll.js";
import { quality } from "./core/quality.js";

// Roteiro da narrativa. Cada capítulo é um módulo separado: o Vite gera um arquivo por capítulo,
// baixado só quando a rolagem se aproxima dele.
const STORY = [
  { kicker: "01 — Prado", title: "Onde as ideias <em>florescem</em>", module: () => import("./chapters/01-prado/index.js") },
  { kicker: "02 — Cidade flutuante", title: "Acima das <em>nuvens</em>", module: () => import("./chapters/02-nuvens/index.js") },
];

const engine = createEngine(document.getElementById("stage"));
const nightBtn = document.getElementById("nightBtn");
const loader = createLoader(engine.renderer);
const chapters = createChapters({
  list: STORY, engine, ctx: { loader, quality, renderer: engine.renderer },
  onChapter: (i, ch, inst) => {
    nightBtn.classList.toggle("hide", !inst?.toggleNight);   // só aparece em capítulos com noite
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
engine.onFrame = (t, dt) => scroll.update(dt);

// carrega o primeiro capítulo antes de liberar a entrada
const loaderEl = document.getElementById("loader"), enter = document.getElementById("enter");
loaderEl.querySelector(".bar i").style.transform = "scaleX(.35)";
chapters.load(0).then(() => {
  chapters.setProgress(0);
  engine.start();
  loaderEl.querySelector(".bar i").style.transform = "scaleX(1)";
  enter.disabled = false;
});
enter.addEventListener("click", () => {
  loaderEl.classList.add("out");
  document.querySelectorAll(".ui").forEach((el) => el.classList.add("on"));
  scroll.enable();
  setTimeout(() => loaderEl.remove(), 1300);
});

nightBtn.addEventListener("click", () => {
  const toNight = engine.state.current?.toggleNight?.();
  nightBtn.textContent = toNight ? "☀" : "☾";
});

// atalho de depuração (localhost): __motion.go(1.5) leva a um ponto da narrativa
window.__motion = { engine, chapters, go: (p) => scroll.goTo(p) };
