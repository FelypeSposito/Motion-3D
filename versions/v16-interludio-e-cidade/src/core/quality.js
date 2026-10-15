// Níveis de qualidade e DPR adaptativo.
// O nível inicial vem do aparelho; depois o DPR sobe/desce sozinho pela duração real dos quadros.

// celular/tablet: tela de toque ou janela estreita (o tamanho da TELA enganava em notebooks de 720p/768p)
export const MOBILE = matchMedia("(pointer: coarse), (max-width: 768px)").matches;

// testes no aparelho: ?aa=0 desliga o MSAA, ?dpr=1.5 fixa a resolução
const Q = new URLSearchParams(location.search), fixedDpr = parseFloat(Q.get("dpr"));

export const quality = {
  mobile: MOBILE,
  // limites de resolução (multiplicador do tamanho CSS)
  dprMin: fixedDpr || (MOBILE ? 1.5 : 1),                     // piso: abaixo disso a tela 3x do iPhone fica borrada
  dprMax: fixedDpr || Math.min(devicePixelRatio, MOBILE ? 2 : 1.75),
  dpr: fixedDpr || Math.min(devicePixelRatio, MOBILE ? 2 : 1.5),      // celular: 2x + MSAA
  msaa: MOBILE ? 0 : 4,          // antisserrilhado nos render targets do motor (WebGL2)
  // MSAA no compositor do prado: desligado — com ele surgiam linhas tracejadas na névoa e a imagem ficava menos nítida.
  // ?aa=4 liga para investigar
  msaaPost: +(Q.get("aa") || 0),
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
    // 60 Hz = 16,7 ms: abaixo de 17,5 está no ritmo da tela e pode subir de volta
    // (antes só subia abaixo de 11 ms, o que nunca acontece a 60 Hz: um tranco derrubava o DPR para sempre)
    if (avg > 21 && quality.dpr > quality.dprMin) next = Math.max(quality.dprMin, quality.dpr - 0.15);
    else if (avg < 17.5 && quality.dpr < quality.dprMax) next = Math.min(quality.dprMax, quality.dpr + 0.1);
    if (next !== quality.dpr) { quality.dpr = next; cooldown = 90; onChange(next); }
  };
}
