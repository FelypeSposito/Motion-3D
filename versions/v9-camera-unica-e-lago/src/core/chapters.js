// Gerenciador de capítulos: só existe na GPU o capítulo atual (e o seguinte durante a transição).
// O próximo é baixado/montado em segundo plano a partir da metade do capítulo atual;
// capítulos que ficaram para trás são descartados.
import { disposeScene } from "./loader.js";

const TRANSITION_START = 0.82;   // fração do capítulo em que a transição para o próximo começa

export function createChapters({ list, ctx, engine, onChapter }) {
  const live = new Map();        // índice → instância montada
  const pending = new Map();     // índice → promessa de montagem

  function load(i) {
    if (i < 0 || i >= list.length) return null;
    if (live.has(i)) return Promise.resolve(live.get(i));
    if (!pending.has(i)) {
      pending.set(i, list[i].module()
        .then((m) => m.create(ctx))
        .then((ch) => { ch.index = i; live.set(i, ch); pending.delete(i); ch.resize?.(engine.size.w, engine.size.h); return ch; }));
    }
    return pending.get(i);
  }

  function drop(i) {
    const ch = live.get(i); if (!ch) return;
    ch.dispose?.(); disposeScene(ch.scene); live.delete(i);
  }

  let active = -1;
  function setProgress(p) {
    const i = Math.min(Math.floor(p), list.length - 1), local = p - i;
    const cur = live.get(i);
    // pré-carrega o próximo (e o anterior, para quem volta rolando)
    if (local > 0.35) load(i + 1);
    if (local < 0.2) load(i - 1);
    // descarta o que está a mais de um capítulo de distância
    for (const k of [...live.keys()]) if (Math.abs(k - i) > 1) drop(k);

    if (!cur) { load(i); return; }               // ainda montando: mantém o quadro anterior
    if (i !== active) { active = i; onChapter?.(i, list[i], cur); }
    cur.setProgress?.(Math.min(local / TRANSITION_START, 1));

    const nxt = live.get(i + 1);
    const mix = local > TRANSITION_START && nxt ? (local - TRANSITION_START) / (1 - TRANSITION_START) : 0;
    if (nxt && mix > 0) nxt.setProgress?.(0);
    engine.state.current = cur;
    engine.state.next = mix > 0 ? nxt : null;
    engine.state.mix = mix;
  }

  engine.onResize = (w, h) => live.forEach((ch) => ch.resize?.(w, h));
  return { load, setProgress, get count() { return list.length; } };
}
