// Projetos do portfólio (PLACEHOLDERS — trocar pela lista real). Cada um vira um telão na avenida, na ordem em que a
// câmera passa. `cell` = célula do vídeo mosaico (coluna, linha a partir do topo) quando houver vídeo real.
export const PROJECTS = [
  { title: "Maré Alta", tag: "filme · 2026", color: "#ff2d6f" },
  { title: "Orbital", tag: "identidade · 2025", color: "#25d8ff" },
  { title: "Casa Vazia", tag: "instalação · 2025", color: "#ffb02e" },
  { title: "Pulso", tag: "app · 2024", color: "#9b5cff" },
  { title: "Farol", tag: "campanha · 2024", color: "#33ffa0" },
  { title: "Vertigem", tag: "clipe · 2023", color: "#ff5a1f" },
  { title: "Eco / Eco", tag: "som · 2023", color: "#e9e4ff" },
  { title: "Subsolo", tag: "web · 2022", color: "#ff3fd2" },
];

// cores dos letreiros genéricos (anúncios abstratos, neons verticais)
export const NEON = ["#ff2d6f", "#25d8ff", "#ffb02e", "#9b5cff", "#33ffa0", "#ff5a1f", "#ff3fd2", "#fff1d6"];

// grade do mosaico: 4×3 = 12 clipes (8 projetos + 4 anúncios abstratos)
export const MOSAIC = { cols: 4, rows: 3, aspect: 16 / 9 };
