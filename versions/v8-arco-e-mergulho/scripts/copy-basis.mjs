// Copia o transcodificador Basis (KTX2) do three para public/basis,
// de onde o KTX2Loader o carrega em tempo de execução.
import { cpSync, existsSync, mkdirSync } from "node:fs";

const src = "node_modules/three/examples/jsm/libs/basis";
if (!existsSync(src)) { console.warn("[copy-basis] three ainda não instalado; rode npm install"); process.exit(0); }
mkdirSync("public/basis", { recursive: true });
for (const f of ["basis_transcoder.js", "basis_transcoder.wasm"]) cpSync(`${src}/${f}`, `public/basis/${f}`);
console.log("[copy-basis] ok");
