// Cache de cena: tudo o que é caro de calcular no carregamento (texturas procedurais, malhas,
// grade de relevo) é gerado UMA vez em desenvolvimento (abrindo o site com ?bake) e salvo em
// public/assets/<capítulo>/. Para quem visita, o capítulo só baixa esses arquivos prontos.
//
//   const cache = await openBakeCache("./assets/prado/");
//   cache.image(nome, tamanho, desenhar)  → <img> pronta ou canvas recém-desenhado
//   cache.geo(nome, construir)            → BufferGeometry
//   cache.floats(nome, construir)         → Float32Array
//   await cache.flush()                   → (modo bake) envia arquivos novos + manifesto
import * as THREE from "three";

const isHtml = (r) => (r.headers.get("content-type") || "").includes("text/html");

export async function openBakeCache(base, { device = "d" } = {}) {   // device: "d" computador, "m" celular
  const q = new URLSearchParams(location.search), bake = q.has("bake"), reset = q.get("bake") === "reset";
  const rel = base.replace(/^\.\//, "");
  let manifest = {};
  try {
    const r = await fetch(base + "cache.json", { cache: "no-cache" });
    if (r.ok && !isHtml(r) && !reset) manifest = await r.json();
  } catch { /* sem cache: gera tudo */ }

  // pré-carrega tudo em paralelo (no modo bake nada é lido: tudo é recalculado)
  const images = new Map(), bins = new Map();
  if (!bake) {
    // cada aparelho baixa só o que é dele (ou comum aos dois)
    const mine = Object.entries(manifest).filter(([, info]) => !info.dev || info.dev === "both" || info.dev === device);
    await Promise.all(mine.map(async ([name, info]) => {
      const url = `${base}${info.file}?v=${info.v}`;
      try {
        if (info.kind === "image") {
          // evento load em vez de img.decode(): decode() pode ficar pendente com a aba em segundo plano
          const img = new Image();
          await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = url; });
          images.set(name, img);
        }
        else { const r = await fetch(url); if (r.ok && !isHtml(r)) bins.set(name, await r.arrayBuffer()); }
      } catch { /* arquivo faltando: será gerado */ }
    }));
  }

  const fresh = [];   // itens gerados agora (enviados no flush, só em modo bake)
  const v = Date.now().toString(36);

  return {
    bake,
    hits: images.size + bins.size,

    image(name, size, draw) {
      if (images.has(name)) return images.get(name);
      const c = document.createElement("canvas"); c.width = c.height = size;
      draw(c.getContext("2d"), size);
      // WebP de alta qualidade: 5–10x menor que PNG, sem diferença visível nessas texturas
      fresh.push({ name, kind: "image", file: `${name}.webp`, blob: () => new Promise((res) => c.toBlob(res, "image/webp", 0.94)) });
      return c;
    },

    geo(name, build) {
      if (bins.has(name)) return decodeGeometry(bins.get(name));
      const g = build();
      fresh.push({ name, kind: "bin", file: `${name}.bin`, blob: async () => new Blob([encodeGeometry(g)]) });
      return g;
    },

    floats(name, build) {
      if (bins.has(name)) return decodeFloats(bins.get(name));
      const a = build();
      fresh.push({ name, kind: "bin", file: `${name}.bin`, blob: async () => new Blob([encodeFloats(a)]) });
      return a;
    },

    async flush() {
      if (!bake || !fresh.length) return;
      const save = (file, body) => fetch(`/__save?path=${encodeURIComponent(rel + file)}`, { method: "POST", body });
      for (const f of fresh) {
        await save(f.file, await f.blob());
        const prev = manifest[f.name]?.dev, dev = prev && prev !== device ? "both" : device;
        manifest[f.name] = { file: f.file, kind: f.kind, v, dev };
      }
      await save("cache.json", JSON.stringify(manifest, null, 1));
      console.info(`[bake] ${fresh.length} arquivos salvos em ${rel}`);
    },
  };
}

// formato binário simples: [u32 tamanho do cabeçalho][cabeçalho JSON][dados alinhados a 4 bytes]
function encodeGeometry(g) {
  const parts = [], header = { attrs: [], index: null };
  let offset = 0;
  const add = (arr) => { const o = offset; parts.push(arr); offset += arr.byteLength; return o; };
  for (const [name, a] of Object.entries(g.attributes)) {
    const src = a.array;
    // normais em 8 bits, cores e uv em 8/16 bits normalizados; posição continua em float
    let data = null, type = "f32";
    if (name === "normal") { data = Int8Array.from(src, (v) => Math.round(Math.max(-1, Math.min(1, v)) * 127)); type = "i8n"; }
    else if (name === "color" && src.every((v) => v >= 0 && v <= 1)) { data = Uint8Array.from(src, (v) => Math.round(v * 255)); type = "u8n"; }
    else if (name === "uv" && src.every((v) => v >= 0 && v <= 1)) { data = Uint16Array.from(src, (v) => Math.round(v * 65535)); type = "u16n"; }
    let range = null;
    if (name === "position") {   // posição em 16 bits dentro da caixa da malha
      const n = a.itemSize, lo = Array(n).fill(Infinity), hi = Array(n).fill(-Infinity);
      for (let i = 0; i < src.length; i++) { const c = i % n; if (src[i] < lo[c]) lo[c] = src[i]; if (src[i] > hi[c]) hi[c] = src[i]; }
      data = Uint16Array.from(src, (v, i) => Math.round((v - lo[i % n]) / Math.max(hi[i % n] - lo[i % n], 1e-9) * 65535)); type = "q16"; range = [lo, hi];
    }
    if (!data) data = src instanceof Float32Array ? src : new Float32Array(src);
    header.attrs.push({ name, itemSize: a.itemSize, count: data.length, offset: add(data), type, range });
    const padB = (4 - (data.byteLength % 4)) % 4; if (padB) add(new Uint8Array(padB));   // mantém o alinhamento de 4 bytes
  }
  if (g.index) {
    const big = g.attributes.position.count > 65535;
    const idx = big ? new Uint32Array(g.index.array) : new Uint16Array(g.index.array);
    header.index = { count: idx.length, offset: add(idx), type: big ? "u32" : "u16" };
  }
  const hj = new TextEncoder().encode(JSON.stringify(header));
  const pad = (4 - ((4 + hj.length) % 4)) % 4, start = 4 + hj.length + pad;
  const out = new Uint8Array(start + offset);
  new DataView(out.buffer).setUint32(0, hj.length, true);
  out.set(hj, 4);
  let o = start; for (const p of parts) { out.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), o); o += p.byteLength; }
  return out;
}

function decodeGeometry(buf) {
  const len = new DataView(buf).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, len)));
  const start = 4 + len + ((4 - ((4 + len) % 4)) % 4);
  const g = new THREE.BufferGeometry();
  const T = { f32: Float32Array, i8n: Int8Array, u8n: Uint8Array, u16n: Uint16Array };
  for (const a of header.attrs) {
    if (a.type === "q16") {   // volta para float
      const q = new Uint16Array(buf, start + a.offset, a.count), f = new Float32Array(a.count), [lo, hi] = a.range, n = a.itemSize;
      for (let i = 0; i < a.count; i++) { const c = i % n; f[i] = lo[c] + q[i] / 65535 * (hi[c] - lo[c]); }
      g.setAttribute(a.name, new THREE.BufferAttribute(f, n)); continue;
    }
    const arr = new (T[a.type || "f32"])(buf, start + a.offset, a.count);
    g.setAttribute(a.name, new THREE.BufferAttribute(arr, a.itemSize, (a.type || "f32") !== "f32"));
  }
  if (header.index) {
    const I = header.index.type === "u16" ? Uint16Array : Uint32Array;
    g.setIndex(new THREE.BufferAttribute(new I(buf, start + header.index.offset, header.index.count), 1));
  }
  g.computeBoundingSphere();
  return g;
}

// grade de floats em 16 bits (min/max no cabeçalho): metade do tamanho, erro ~1 mm no relevo
function encodeFloats(a) {
  let min = Infinity, max = -Infinity; for (const v of a) { if (v < min) min = v; if (v > max) max = v; }
  const out = new ArrayBuffer(8 + a.length * 2), dv = new DataView(out), q = new Uint16Array(out, 8);
  dv.setFloat32(0, min, true); dv.setFloat32(4, max, true);
  const k = 65535 / Math.max(max - min, 1e-6); for (let i = 0; i < a.length; i++) q[i] = Math.round((a[i] - min) * k);
  return out;
}
function decodeFloats(buf) {
  const dv = new DataView(buf), min = dv.getFloat32(0, true), max = dv.getFloat32(4, true), q = new Uint16Array(buf, 8);
  const a = new Float32Array(q.length), k = (max - min) / 65535; for (let i = 0; i < q.length; i++) a[i] = min + q[i] * k;
  return a;
}
