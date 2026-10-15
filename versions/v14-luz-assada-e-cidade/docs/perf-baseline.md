# Linha de base de desempenho (15/out/2026, antes de lightmaps/cap. 02)

Build: `npx vite build --outDir dist-perf` + `npx vite preview --outDir dist-perf --port 4174`.
Ferramenta: `scripts/perf/measure.js` (copiar para `dist-perf/__measure.js` e rodar
`(0,eval)(await (await fetch('/__measure.js')).text())`, depois `__perf.baseStep()`, `__perf.pointStep(p)`,
`__perf.scrollStep()`, `__perf.passes()`, `__perf.ablate()`).
Máquina: Radeon RX 590 (ANGLE/D3D11). O painel do navegador estava OCULTO (rAF não dispara) → medido em modo
**step**: `__motion.step(1)` + `readPixels(1px)` + `EXT_disjoint_timer_query_webgl2` (GPU real por quadro) +
tempo de JS do quadro (onFrame → fim do passe final). O peso das props assadas ainda NÃO estava ativo
(`bake/props.*` não existem → luz em tempo real).

Cuidados de método: (1) o DPR adaptativo mede o intervalo ENTRE quadros, então medir com pausas derruba o DPR —
conferir `renderer.dpr` no resultado; (2) `engine.step()` agenda um rAF extra a cada chamada (cadeias duplicadas se o
painel ficar visível depois) → recarregar a página antes de medir por rAF; (3) após `navigate` a emulação de viewport
some — redimensionar e recarregar com `location.reload()`.

## Computador 1440x900, DPR 1
Pronto (`__readyAt`): 1,95 s (cache frio na origem 4174). Download: **2,59 MB** (bin 2,13 MB, js 264 KB, webp 197 KB).
Maiores: height-512.bin 512 KB, terrain-220-c.bin 286 KB, 6× rock-*-28.bin 198 KB cada.
Cena: 10 luzes (hemi, sol c/ sombra, fill, **7 PointLights**), 277 malhas (251 soltas, 26 instanciadas / 59 165 instâncias),
151 projetam sombra, 101 materiais, **55 programas**, 162 geometrias.

| p | GPU ms (p95) | JS ms | draw calls | triângulos | obs |
|---|---|---|---|---|---|
| 0 | **16,6** (17,7) | 6,2 | 558 | 13,3 M | |
| .25 | 16,5 (17,4) | 4,8 | 348 | 12,4 M | |
| .5 | 14,0 (16,6) | 3,4 | 250 | 11,6 M | |
| .75 | 8,8 (10,6) | 2,1 | 200 | 4,6 M | |
| .85 | 6,5 | 2,8 | 373 | 5,8 M | meio a meio (2 vistas) |
| .95 | 2,2 | 1,3 | 168 | 2,8 M | submerso |
| rolagem 0→.95 | 12,4 (17,2) | 3,7 | — | — | picos de 300–440 ms (compilação de shader ao entrar em vistas novas) |

Por passada (p=0): cena 14,8 ms (inclui sombra + reflexo) · pós do prado (16 quads: higiene, raios, bloom, cor) 1,6 ms · final 0,2 ms.
Ablação (p=0, GPU): base 16,1 → sem sombra 12,9 (−3,2) · sem reflexo 11,1 (−5,0) · **sem as 7 PointLights 12,1 (−4,0,
mesmo com intensidade 0 de dia)** · sem sombra+reflexo 9,0 (−7,1; 248 calls, 5,4 M tris).
Triângulos de UMA passada: 5,4 M — arbustos 90×16 820 = **1,51 M** (geometria de pedra detalhe 28, projeta sombra),
espigas 7 199×188 = 1,35 M, flores 1 484×480 = 0,71 M, pedras soltas 47×16 820 = 0,79 M (47 draw calls × 3 passadas).

## Celular 390x844 (modo celular, DPR do motor 2 → canvas 780×1688)
Pronto: 0,74–1,36 s. Download: **1,89 MB** (bin 1,27 MB, webp 362 KB, js 256 KB).
Cena: 7 luzes (hemi, sol c/ sombra 1024², fill, 4 PointLights), 246 malhas, 1 982 instâncias, 118 projetam sombra,
23–36 programas, texturas estimadas 11,7 MB.

GPU no RX 590: ~2,0–2,2 ms por quadro (cena 1,9 · cor 0,08 · final 0,16). Num iPhone 12 Pro (A14, ~8–10× menos GPU)
isso projeta ~16–22 ms → **no limite de 60 fps** e sem folga para picos.
Sequência real de 64 quadros (p=0): o custo **alterna** a cada quadro — ~165–190 calls / 1,89 M tris (sem reflexo) e
~270–330 calls / 2,35 M tris (com reflexo, que roda 1 quadro sim 1 não) — e **a cada 30 quadros** salta para 384–441
calls / 2,7 M tris (atualização do mapa de sombras). Ou seja, ritmo irregular: quadros pares ~60 % mais caros + pico
a cada 0,5 s.
JS por quadro: 1,0–4,5 ms (p95 até 12,6 ms em p=0 com compilação).

## Por que o iPhone fica "baixo e sem fluidez" (diagnóstico)
1. **DPR adaptativo despenca e não volta** (`src/core/quality.js:19-30`): média >19 ms derruba 0,15 até o piso 1,25;
   só sobe com média <11 ms (impossível a 60 Hz, onde o intervalo é ≥16,7 ms). Os picos de reflexo/sombra e qualquer
   modo economia (30 Hz → 33 ms) empurram para **1,25x numa tela 3x** = imagem esticada 2,4× → borrada. No teste aqui
   o DPR caiu sozinho de 2 → 1,4 em segundos.
2. **Nenhum antisserrilhado no prado, nem no computador**: `quality.msaa` (4) só vale para `rtA/rtB` do motor
   (`src/core/engine.js:15`), mas o prado desenha no `EffectComposer` próprio (`index.js:1184`), cujo alvo tem 0 amostras.
   Grama/bordas cintilam e o DPR baixo piora.
3. Picos periódicos: reflexo a cada 2 quadros (`index.js:510`) e sombra a cada 30 (`index.js:1394`).

## Correções recomendadas — celular primeiro, por ganho/risco
| # | O quê | Onde | Valor concreto | Ganho estimado | Risco |
|---|---|---|---|---|---|
| 1 | DPR fixo no celular, sem descer por média de intervalo | quality.js:11-13, 19-30 | celular `dpr = dprMin = 2`, `dprMax = 2`; descer só se **tempo de GPU/JS** (não intervalo) >14 ms por 3 s, piso **1,75**; subir com <10 ms | nitidez estável (hoje cai a 1,25) | baixo |
| 2 | MSAA de verdade no prado | index.js:1184 | `new EffectComposer(renderer, new WebGLRenderTarget(w,h,{type:HalfFloatType, samples: MOBILE ? 4 : 4}))` | bordas/grama limpas; em GPU Apple (TBDR) MSAA 4× custa ~0,3–1 ms vs DPR +0,5 custar ~+56 % de pixels | baixo |
| 3 | Remover alternância do reflexo e reduzir | index.js:492-511 | reflexo **todo quadro** a **0,25×** da tela (195×422) em vez de 0,33× a cada 2 (o nº de pixels cai ~43 %, o ritmo fica uniforme); manter a lista de exclusão do celular | elimina judder par/ímpar | baixo |
| 4 | Sombra: congelar no celular | index.js:114-131,1394 | celular: `needsUpdate` só 1× após carregar (a cena fixa não muda; o sol só muda na troca dia/noite → atualizar nela) ou mapa 1024 → 512 com PCF (não Soft) | remove pico de ~+120 calls / +350 k tris a cada 0,5 s | baixo |
| 5 | PointLights com intensidade 0 fora do shader | index.js:948,1306,1316 | `visible = intensity > 0.001` (de dia nenhuma acende) e pré-compilar a variante noturna com `renderer.compileAsync` | −4 ms GPU no computador (25 %); proporcional no celular | médio (recompila ao virar noite → pré-compilar) |
| 6 | Arbustos com geometria leve | index.js:727 | trocar `rockGeos[2]` (16 820 tris) por Icosahedron detalhe 4–6 (~500–1 000 tris) | −1,4 M tris/passada no computador (×3 passadas) | baixo |
| 7 | Pedras soltas → InstancedMesh por geometria (6) e LOD | index.js:629,657 | 47 malhas → 6 InstancedMesh; detalhe 28 → 18 no computador também | −~130 calls/quadro (47×3 passadas) | baixo (some quando as pedras assadas entrarem) |
| 8 | Fundir o passe de cor do prado no passe final | index.js:1209-1226 + final-pass.js | grão/vinheta/cromático já existem no final; tirar 1 passe HalfFloat de tela cheia | −1 leitura+escrita de 1,3 MP no celular (~0,5–1 ms no A14) | médio (conferir cor) |
| 9 | GC por quadro | index.js:507-508 | o `onBeforeRender` da água cria arrays com spread e `scene.children.filter(...)` todo quadro → montar a lista 1× | menos pausas de GC | baixo |
| 10 | Memória de vídeo desperdiçada | engine.js:15 | `rtA/rtB` (com MSAA 4 no computador) existem em tamanho cheio mas o prado não os usa → criar sob demanda | dezenas de MB a menos no Safari | baixo |

Nitidez sem perder fps: preferir **DPR 2 fixo + MSAA 4×** (ou FXAA no passe final se MSAA em HalfFloat falhar no Safari)
em vez de subir DPR para 2,2–3; SMAA não compensa (2 passes extras). DPR 2 numa tela 3x com MSAA fica mais nítido que
DPR 2,5 sem AA e custa ~44 % menos pixels.

Outros: o build leva `public/assets/prado/bake/prado-static.glb` (22 MB, não usado em tempo de execução) e os órfãos
`terrain-*.bin` antigos (1,9 MB) para o GitHub Pages; `bake-test/` também vai junto.
