// Níveis de qualidade e DPR adaptativo.
// O nível inicial vem do aparelho; depois o DPR sobe/desce sozinho pela duração real dos quadros.

// celular/tablet: tela de toque ou janela estreita (o tamanho da TELA enganava em notebooks de 720p/768p)
export const MOBILE = matchMedia("(pointer: coarse), (max-width: 768px)").matches;

export const quality = {
  mobile: MOBILE,
  // limites de resolução (multiplicador do tamanho CSS)
  dprMin: MOBILE ? 1.25 : 1,                                  // piso: abaixo disso o celular serrilha visivelmente
  dprMax: Math.min(devicePixelRatio, MOBILE ? 2.2 : 1.75),
  dpr: Math.min(devicePixelRatio, MOBILE ? 2 : 1.5),          // celular começa em 2x (tela do iPhone é 3x)
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
