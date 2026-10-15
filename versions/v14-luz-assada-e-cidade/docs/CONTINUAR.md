# Motion 3D — onde o projeto parou (handoff)

Última atualização: **v14 (luz assada + cidade)**, 15/out/2026, enviada ao GitHub a pedido do usuário. Só enviar de novo quando ele mandar.

## 0. COMO SEGUIR (leia primeiro) — estado da sessão de 14–15/out
**O que entrou na v14**
- **Sorteio com semente** (`RNG.seed(n)` no gerador): pedras, colunas, píer e trilha saem iguais em toda carga e aparelho
  (necessário para a luz assada bater). Grama/flores ainda usam `Math.random` (o QA usa `scripts/qa/seeded.html`).
- **Luz assada nas peças fixas** (arco, ruína, colunas, pedras, troncos, píer): `src/core/baked.js` carrega
  `public/assets/prado/bake/props.glb` (celular: `props-m.glb`) + `props-day.png`/`props-night.png` (4K, sRGB de L/4,
  `lightMapIntensity = 4π`), troca por `MeshBasicMaterial` com mistura dia/noite e cáusticas. `?nobake` desliga.
  Fluxo para refazer: `?export` (computador) grava `bake/prado-static.glb` → Blender (`blender/prado-bake.blend`,
  cena salva com a luz da NOITE; valores do dia em docs/CONTINUAR §6 e no relatório do bake) → bake Cycles →
  `npx gltfpack -cc -kn -km -kv -vtf -vp 16 -vn 10 -vc 10` → renomear nós (stone, stoneV, rock, bark, wood).
  O terreno, a grama e as árvores continuam com luz em tempo real (fase 2: assar o terreno).
- **Celular**: DPR 2 (piso 1,5; o DPR adaptativo agora volta a subir), sombra desenhada só no início (sem tranco a cada
  30 quadros), reflexo da água todo quadro a 0,3 da tela, água com menos névoa própria (reflexo/fresnel mais visíveis),
  brilho do sol sem cintilar (fwidth), chão com 2ª leitura girada contra repetição e textura fina sumindo ao longe,
  casca do tronco em 512 (`barkTex512`), anisotropia máxima, névoa +13%. MSAA no prado foi DESLIGADO (dava linhas
  tracejadas na névoa e deixava menos nítido); `?aa=4` liga para investigar, `?dpr=1.75` fixa resolução.
- Computador: arbustos com esfera leve (−1,4 M triângulos).
- **Transição entre capítulos**: a água turva até não se ver nada (lodo verde-oliva + partículas), a cena troca
  escondida e clareia (src/core/final-pass.js).
- **Capítulo 02 — cidade dos letreiros** (ligado direto no roteiro desde 15/out, aprovado pelo usuário): `src/chapters/02-cidade/` (city, screens = telões com efeito
  "tela filmada por celular" e mosaico de vídeo, water, glsl, projects) + `neon/` (letreiros neon com cascata,
  subida, flicker; página de teste `neon-test.html`). O usuário GOSTOU da cidade.
- Deploy: `.github/workflows/pages.yml` compila e publica no Pages (Settings → Pages → Source = GitHub Actions).

**Pendente (em ordem)**
1. **Cidade = praça fixa, não avenida** (pedido do usuário, referência: foto da Times Square): a rolagem passa por
   ENQUADRAMENTOS fixos/quase fixos dos letreiros em várias perspectivas (plano geral, torre de telões ao fundo,
   contra-plongée, close de esquina), com transições suaves, sem "personagem andando". **Saímos de dentro de uma POÇA
   d'água na calçada** — o chão da praça é SECO (no máximo levemente molhado); só a poça espelha. O agente que fazia isso
   caiu no meio ("Refactoring the screen layout to accept fixed placements…"): conferir `src/chapters/02-cidade/` —
   o build passa, mas a refatoração pode estar incompleta.
2. Conferir no iPhone: fps, chão/tronco/água novos (closeups "antes" em docs/qa/closeup/before — não versionados;
   poses em docs/qa/README.md; comparar com `py -I scripts/qa/diff.py`).
3. Converter `props-day/night.png` (9 e 7 MB) para KTX2/WebP — pesados para o celular.
4. Assar o terreno (fase 2) e tirar luzes/sombras em tempo real; PointLights apagadas com `visible=false`
   (perf: −4 ms GPU no computador; ver docs/perf-baseline.md).
5. Arquivos órfãos para apagar: `public/assets/prado/terrain-170x170-220x220.bin`, `terrain-600x420-120x50.bin`,
   `barkTex.webp` (substituído por barkTex512).
6. Remover atalhos de depuração antes da versão final (`__motion`, `__readyAt`).

**Ferramentas criadas**: `scripts/perf/measure.js` (métricas; ver docs/perf-baseline.md), `scripts/qa/` (capture.js,
seeded.html, receive.py, diff.py; ver docs/qa/README.md), `src/dev/export-prado.js` (`?export`).
Obs.: o plugin "security-guidance" do app está quebrado e gera avisos falsos — o usuário o desativou (vale após reiniciar).

## 1. O que é o projeto
Portfólio interativo em 3D, narrativa por rolagem, inspirado no unseen.co. Cada capítulo é um ambiente;
os projetos do usuário vão aparecer como "murais" (próximo capítulo: cidade noturna com letreiros, estilo Times Square,
sem marcas reais).

Roteiro atual:
1. **Prado na névoa** (capítulo 01): câmera faz uma curva suave pela frente da ilha, atravessa o vão do arco principal,
   passa a margem de trás, desce no lago (plano "meio a meio", metade acima/metade abaixo d'água, referência: foto
   split-level) e termina no fundo do lago. Embaixo d'água a cena anoitece sozinha e o botão dia/noite some.
2. **(a fazer) Mergulho → cidade dos letreiros**: emergir numa cidade noturna inundada; cada telão = um projeto, com efeito
   de "tela filmada por celular" (grade RGB, moiré, varredura) e vídeos em mosaico (vários clipes num vídeo só).

Removido a pedido: capítulo "cidade flutuante / nuvens".

## 2. Como rodar
```
npm install
npm run dev        # http://localhost:5173  (celular na mesma rede: http://<IP>:5173, ex. 192.168.0.80)
npm run build      # gera dist/ (GitHub Pages)
npm run preview    # serve dist/ em http://localhost:4173 (medir desempenho real)
```
`.claude/launch.json` tem as configs `motion` (dev), `motion-build` (preview) e `estudos` (servidor Python antigo).
Atalhos de depuração no console: `__motion.chapters.setProgress(p)` + `__motion.step(n)` (desenha quadros com o painel
oculto), `__motion.go(p)`, `window.__readyAt` (ms até a cena ficar pronta).

## 3. Estrutura
```
index.html, src/style.css, src/main.js     página, interface, roteiro (STORY), botão dia/noite
src/core/engine.js        renderer único, loop, pausa com aba oculta, DPR adaptativo, modo meio a meio (split)
src/core/final-pass.js    UM passe final: transição entre capítulos, linha d'água do meio a meio, tom submerso,
                          vinheta, grão, mapeamento de tons
src/core/quality.js       níveis (celular = toque OU janela ≤768px); celular 2x (piso 1,25x, teto 2,2x)
src/core/chapters.js      carrega só o capítulo atual (+ próximo na transição), descarta os distantes
src/core/scroll.js        rolagem virtual (roda, toque, teclado)
src/core/loader.js        GLB (Meshopt) + KTX2, para os assets do Blender
src/core/scene-kit.js     cameraPath (curva de câmera + closestU), ponteiro, céu, materiais assados
src/core/bake-cache.js    CACHE DE CENA (ver seção 5)
src/chapters/01-prado/index.js   GERADO — não editar à mão (ver seção 4)
src/chapters/01-prado/dive.js    trajeto único da câmera, mergulho, submerso, cáusticas, meio a meio
scripts/port-v4.py        GERADOR do capítulo 01
public/estudos/           versões antigas em HTML único (v1–v4); meadow-scene-v4.html é a FONTE do prado
public/assets/prado/      arquivos do cache (cache.json + .webp/.bin)
versions/                 cópias de cada etapa (v5…v13) — ver versions/README.md
docs/arquitetura.md       diagnóstico de desempenho e análise do unseen.co
```

## 4. IMPORTANTE: o capítulo 01 é gerado
`src/chapters/01-prado/index.js` é montado por `scripts/port-v4.py` a partir do script de
`public/estudos/meadow-scene-v4.html`, com substituições (renderer do motor, rolagem, mergulho, cache, lago fundo,
névoa submersa, etc.). **Para mudar o prado, edite o gerador (ou dive.js) e rode:**
```
py -I scripts/port-v4.py "<caminho absoluto do projeto>"
```
Editar o index.js direto perde a mudança na próxima geração.

## 5. Cache de cena (`?bake`)
Texturas procedurais, terreno, pedras e grade de relevo são gerados uma vez e salvos; visitantes só baixam.
- Gerar/atualizar: abrir `http://localhost:5173/?bake=reset` em tamanho de computador, depois `?bake` em tamanho de
  celular (viewport ≤768px). O plugin `save-assets` do `vite.config.js` grava em `public/assets/prado/`.
- `cache.json` marca cada arquivo com `dev`: `d` (computador), `m` (celular) ou `both`; cada aparelho baixa só o seu.
- **Sempre que mudar algo procedural do prado** (texturas, relevo `H0`, terreno, pedras) é preciso refazer o bake.
- Resultado medido na produção: pronto em ~1,2 s (computador, 2,4 MB) e ~0,56 s (celular, 1,5 MB).
- Pendência: apagar os órfãos `public/assets/prado/terrain-170x170-220x220.bin` e `terrain-600x420-120x50.bin`
  (formato antigo, não referenciados).

## 6. Próximos passos combinados
1. **Blender (conectado via MCP, porta 9876)**: exportar terreno, ruínas, colunas, pedras, troncos e píer; assar luz
   de dia e de noite (Cycles) em texturas 4K (computador) / 2K (celular), KTX2; trocar por `MeshBasicMaterial` com a luz
   assada. Objetivo: tirar as 8 luzes + sombras em tempo real e dar ao celular a mesma cena do computador (hoje o
   celular recebe versão "sem folhas"). Comparar prints na mesma posição de câmera antes de trocar.
2. **Capítulo da cidade dos letreiros** (noturno), emergindo do mergulho; vídeos em mosaico, poucos tocando por vez.
3. Remover atalhos de depuração antes de publicar (`__motion`, `__readyAt`, `__meadow`).

## 7. Preferências do usuário (seguir sempre)
- Responder em **português**; mostrar **link do localhost e do celular (IP da rede)** juntos.
- **Não enviar ao GitHub** sem ordem explícita. Repositório: github.com/FelypeSposito/Motion-3D (Pages ativo).
- **Salvar cada etapa** como cópia em `versions/vNN-nome/` e registrar em `versions/README.md`.
- **Nunca abaixo da qualidade do motor antigo (v4)**; prioridade: fluidez (60 fps) + qualidade alta, inclusive no
  celular (testa num iPhone 12 Pro).
- Referência estética: unseen.co (câmera reage rápido ao mouse, névoa leve, superfícies lisas).
- Mudanças de câmera: suaves, sem exagero (pediu "curva suave", não "passeio pela ilha").
