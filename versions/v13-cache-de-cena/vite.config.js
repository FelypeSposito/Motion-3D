import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";

// Só em desenvolvimento: recebe arquivos gerados no navegador (ex.: modelos exportados da cena)
// e grava em public/assets/. Caminho restrito a assets/ com extensões conhecidas.
function saveAssets() {
  return {
    name: "save-assets",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__save", (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; return res.end(); }
        const file = new URL(req.url, "http://local").searchParams.get("path") || "";
        if (!/^assets\/[\w\-/]+\.(glb|png|webp|bin|json)$/.test(file) || file.includes("..")) { res.statusCode = 400; return res.end("caminho inválido"); }
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          const out = path.join("public", file);
          fs.mkdirSync(path.dirname(out), { recursive: true });
          fs.writeFileSync(out, Buffer.concat(chunks));
          res.end("ok");
        });
      });
    },
  };
}

// base relativa: o mesmo build funciona no GitHub Pages (/Motion-3D/) e no localhost
export default defineConfig({
  base: "./",
  server: { port: 5173 },
  plugins: [saveAssets()],
  build: {
    target: "es2020",
    assetsInlineLimit: 0,          // modelos e texturas sempre como arquivos (cache do navegador)
    chunkSizeWarningLimit: 900,
  },
});
