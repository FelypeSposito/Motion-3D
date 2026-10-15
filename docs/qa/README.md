# QA visual — prints antes/depois (luz assada do prado)

Objetivo: comparar o prado com luz em tempo real ("antes") e com lightmaps assados ("depois") na MESMA posição de
câmera, no mesmo instante e com a mesma vegetação.

## Arquivos
- `scripts/qa/seeded.html` — abre o site com `Math.random` de semente fixa (grama, taboas, flores e lótus usam
  `Math.random`; sem isso cada carregamento muda o capim) e **sem recarga automática do Vite** (o socket HMR é
  silenciado; outros agentes editando `src/` derrubavam a série no meio). Lê o `index.html` atual em tempo real.
  Aceita os mesmos parâmetros do site (`?nobake`, `?cap2`…) e `?seed=N`.
- `scripts/qa/capture.js` — snippet para o `javascript_tool` (ou console). Define `__qa.setup/shot/series`:
  tempo fixo (`update` do capítulo embrulhado com t = 10 s, dt = 0), ponteiro zerado (`pointer` de scene-kit.js),
  `chapters.setProgress(p)` + 90 quadros via `__motion.step`, noite com `toggleNight()` + tweens do gsap levadas ao fim
  (sem esperar 2,6 s), DPR travado, `toDataURL` logo após `engine.step()` (sem precisar de preserveDrawingBuffer —
  nenhum print saiu preto).
- `scripts/qa/receive.py` — servidor local (127.0.0.1:5199) que recebe o dataURL e grava `<pasta>/<nome>.png`.
- `scripts/qa/diff.py` — PSNR, SSIM aproximado (blocos 8x8, luminância), MAE e % de pixels com diferença > 8;
  grava `a | b | |a-b|x4` em JPG e `report.txt` em `docs/qa/diff/...`.

## Como repetir
1. Dev server em http://localhost:5173 (`npm run dev -- --host`).
2. Receptor: `py -I scripts/qa/receive.py docs/qa/after` (ou `docs/qa/before`), em segundo plano.
3. No navegador embutido (aba própria), para cada tamanho e modo:
   - `resize_window` 1440x900 (dpr 1, prefixo `d1440`) ou 390x844 (dpr 2, prefixo `m390`; ≤768 px = modo celular,
     por isso recarregar depois de redimensionar);
   - navegar para `http://localhost:5173/scripts/qa/seeded.html` (ou `...seeded.html?nobake`, prefixo `-nobake`);
   - executar:
     ```js
     for (let i = 0; i < 100 && !window.__motion; i++) await new Promise(r => setTimeout(r, 100));
     (0, eval)((await import('/scripts/qa/capture.js?raw')).default);
     await __qa.setup({ dpr: 1 });                       // 2 no celular
     __qa.series({ prefix: 'd1440' }).then(r => window.__qaDone = r);   // ~40 s; não dá await (timeout de 45 s da ferramenta)
     ```
   - depois: `for (let i=0;i<400&&!window.__qaDone;i++) await new Promise(r=>setTimeout(r,100)); window.__qaDone`
     (lista nome, tamanho, isNight, under, bytes). Conferir se o tamanho é 1440x900 / 780x1688: a emulação de
     tamanho do painel às vezes é limpa entre chamadas — fazer resize+navigate+setup no MESMO `browser_batch`.
4. Comparar: `py -I scripts/qa/diff.py` (before x after, mesmos nomes) ou
   `py -I scripts/qa/diff.py --pair d1440 d1440-nobake` (dois prefixos dentro de `docs/qa/before`).

Pontos: p = 0, .15, .3, .45, .6, .75, .9 (progresso do capítulo 01), dia e noite. Nomes:
`<prefixo>-p<NNN>-<day|night>.png`.

## Captura "antes" (2026-10-14, ~23h)
56 PNGs em `docs/qa/before/`: `d1440-*` (1440x900, dpr 1), `m390-*` (780x1688 = 390x844 a dpr 2), e as mesmas
séries com `-nobake`. Sem `?cap2`.

Repetibilidade: dois carregamentos de `seeded.html` deram PNGs byte a byte idênticos.
Sem a semente fixa (página normal) a grama muda a cada carga → PSNR 18–27 dB em p ≤ .45 sem nenhuma mudança real.

`?nobake` x padrão (hoje, bake ainda sem lightmaps): idênticos (PSNR ∞) em todos os pontos, exceto p = .9
(PSNR ~46 dB, SSIM 0,975, 0 % de pixels > 8 — ruído de partículas submersas, não luz). Base de ruído ≈ 46 dB.

### Observações
- p = .9 está submerso: a noite é travada, então `p090-day` = `p090-night` (ambos noturnos/submersos).
- p = .6 e .75 (computador) já são lago/névoa: o arco quase não aparece; o vão do arco está em p ≈ .3–.45.
- Com `?cap2`, o capítulo 01 ocupa só 0..0,82 de cada unidade de progresso (`chapters.setProgress` divide por 0,82)
  e p ≥ .82 mistura o capítulo 02 — capturar SEM `?cap2` para comparar com o "antes".
- Partículas/pétalas avançam com o dt real até o `setup`; com a semente fixa isso não apareceu na superfície.

## Closeups de textura (tronco/barkMat e chão) — celular 390x844, dpr 2
Pasta: `docs/qa/closeup/before/` (depois: `docs/qa/closeup/after/`). Mesmo procedimento acima (seeded.html, setup dpr 2),
com pose manual de câmera: `__qa.setPose({pos, look})` sobrescreve a câmera depois do `update` (p = 0, t = 10).
```js
window.POSES = {
  'log-front':   { pos: [-5, 1.9, -0.6],   look: [-5, 0.7, -3.2] },   // tronco caído (único no celular, em -5, .72, -3.2)
  'log-above':   { pos: [-3.4, 2.8, -1.9], look: [-5, 0.7, -3.2] },
  'ground-near': { pos: [-1.5, 1.9, -4.2], look: [-3.8, 0.5, -6.8] }, // chão em ângulo rasante
  'ground-mid':  { pos: [-1, 2.6, 0.5],    look: [-4, 0.4, -6] },
  'pier-posts':  { pos: [8.2, 0.9, -2.2],  look: [9.8, -0.1, -0.4] }, // postes do píer (barkMat) + chão da margem
  'pier':        { pos: [7.6, 1.3, -2.6],  look: [9.9, -0.1, -0.4] },
};
for (const [k, p] of Object.entries(POSES)) { __qa.setPose(p); await __qa.shot({ p: 0, night: false, name: 'm390-' + k + '-day' }); }
for (const k of ['log-front', 'ground-mid', 'pier']) { __qa.setPose(POSES[k]); await __qa.shot({ p: 0, night: true, name: 'm390-' + k + '-night' }); }
__qa.setPose(null);
```
Obs.: no celular só existe UM tronco caído (bark em -5, .72, -3.2); em (13,-8) e (-11,-9) não há tronco (cai na água).
Atenção: a porta 5199 do receive.py pode estar em uso por outro agente (Windows deixa dois processos escutarem;
os PNGs podem cair na pasta do outro). Confira com `netstat -ano | grep 5199`.
