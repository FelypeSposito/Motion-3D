// Níveis de qualidade e DPR adaptativo.
// O nível inicial vem do aparelho; depois o DPR sobe/desce sozinho pela duração real dos quadros.

const coarse = matchMedia("(pointer: coarse)").matches;
const small = Math.min(screen.width, screen.height) < 820;

export const MOBILE = coarse || small;

export const quality = {
  mobile: MOBILE,
  // limites de resolução (multiplicador do tamanho CSS)
  dprMin: MOBILE ? 0.85 : 1,
  dprMax: Math.min(devicePixelRatio, MOBILE ? 1.5 : 1.75),
  dpr: Math.min(devicePixelRatio, MOBILE ? 1.25 : 1.5),
  msaa: MOBILE ? 0 : 4,          // antisserrilhado no render target (WebGL2)
  bloom: !MOBILE,
};

// Média móvel da duração do quadro → ajusta o DPR com histerese para não "piscar".
export function createAdaptiveDpr(onChange) {
  let acc = 0, n = 0, cooldown = 0;
  return (ms) => {
    if (cooldown > 0) { cooldown--; return; }
    acc += ms; n++;
    if (n < 45) return;
    const avg = acc / n; acc = 0; n = 0;
    let next = quality.dpr;
    if (avg > 19 && quality.dpr > quality.dprMin) next = Math.max(quality.dprMin, quality.dpr - 0.15);
    else if (avg < 11 && quality.dpr < quality.dprMax) next = Math.min(quality.dprMax, quality.dpr + 0.1);
    if (next !== quality.dpr) { quality.dpr = next; cooldown = 90; onChange(next); }
  };
}
