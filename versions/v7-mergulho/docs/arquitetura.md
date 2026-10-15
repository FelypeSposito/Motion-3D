# Motion 3D — diagnóstico de desempenho e arquitetura do portfólio

## 1. Como o unseen.co faz (medido no site, out/2026)

O unseen não calcula quase nada em tempo real: a cena chega pronta.

| Técnica | O que vimos | Efeito |
|---|---|---|
| **Iluminação "assada" (baked)** | `room-1.ktx2` (941 KB), `room-2.ktx2` (879 KB), `ao.ktx2` | Sombras, luz e oclusão vêm pintadas na textura. Zero luzes e zero sombras em tempo real. |
| **Modelos minúsculos** | `room-1.glb` 14 KB, `rocks.glb` 8 KB, `land-group.glb` 2 KB, `chair.glb` 196 KB | Pouca geometria; o detalhe está na textura. |
| **Texturas KTX2 (Basis)** | todas as texturas grandes | Comprimidas na GPU: carregam rápido e ocupam ~4–8x menos memória de vídeo. |
| **Matcaps** | `matcap-white.png`, `pearl-matcap.ktx2`, `project-model-matcap.png` | Material com "luz" pronta numa imagem: o shader mais barato possível. |
| **Ruído em textura** | `noise-small.png`, `gradient-noise.jpg`, `iri-32.png` | Em vez de calcular ruído por pixel, faz uma leitura de textura. |
| **Grama barata** | `grass-simple.glb` 2 KB + `blade.jpg` 2 KB | Uma lâmina instanciada com textura. |
| **Atlas** | `butterfly-atlas-diffuse/normal` | Várias peças numa textura só = menos trocas de estado. |
| **Cenas carregadas por partes** | `models/home/…` e `models/project-menu/…` | Cada ambiente baixa só o que usa, na hora em que precisa. |
| **Resolução contida** | canvas 1024×768 em DPR 1 | Não renderiza acima do necessário. |

## 2. Nossa cena hoje (meadow-scene-v4, computador, 1280×720)

| Métrica | Valor | Problema |
|---|---|---|
| Chamadas de desenho por quadro | **580** | A cena é desenhada 3 vezes (sombras + reflexo + câmera), cada objeto/peça é uma chamada. |
| Triângulos por quadro | **13,4 milhões** | Rochas, grama e flores com muita geometria, desenhadas nas 3 passadas. |
| Programas de shader | **53** | Muitos materiais diferentes = muitas trocas de estado e compilação lenta. |
| Luzes | **8** (5 de vagalumes + sol, preenchimento, hemisfério) | Toda luz pontual custa em **todo pixel** de **todo** material iluminado. |
| Carregamento | **~10 s** | Terreno, rochas, texturas de reboco/água/névoa geradas pixel a pixel no processador. |
| Reflexo | `Reflector` | Re-renderiza a cena inteira de novo, todo quadro. |

## 3. Arquitetura proposta para o portfólio em capítulos

```
src/
  core/
    engine.js        renderer único, loop, relógio, pausa quando a aba/canvas some
    quality.js       níveis (alto/médio/baixo) + DPR adaptativo pela duração do quadro
    loader.js        GLB (Meshopt) + KTX2 com cache e pré-carregamento do próximo capítulo
    post.js          UM passe final (cor + vinheta + grão + FXAA); bloom só se o nível permitir
    transitions.js   transições entre capítulos por shader (dissolve, portal, tinta, água...)
    scroll.js        progresso da narrativa (Lenis) → timeline de câmera de cada capítulo
  chapters/
    01-prado/        cena.glb + baked.ktx2 + chapter.js (câmera, interações, murais)
    02-…/            cada ambiente isolado; só o capítulo atual (e o próximo, na transição) existe na GPU
  shaders/           água, névoa, céu — reaproveitados entre capítulos
public/assets/       arquivos gerados pelo pipeline (não editados à mão)
```

### Regras de desempenho
1. **Luz assada no Blender**: cada capítulo é modelado e "assado" (Cycles) num atlas; em tempo real os objetos usam `MeshBasicMaterial` com essa textura. Luz em tempo real só para o que se mexe (vagalumes como sprites, não como `PointLight`).
2. **Só o capítulo visível existe**: ao sair de um capítulo, ele é removido e descartado da GPU; o seguinte é pré-carregado durante a rolagem.
3. **Uma passada de cena por quadro**: sem mapa de sombras em tempo real; reflexo da água por textura pré-renderizada/rugosidade ou, quando indispensável, reflexo em baixa resolução só da "camada refletível".
4. **Instâncias por blocos espaciais**: grama/pedras divididas em células para o recorte por câmera descartar o que está fora da tela (hoje um grupo inteiro é desenhado se uma peça aparece).
5. **Ruído em textura, não calculado**: névoa, água e céu leem texturas de ruído pré-geradas.
6. **Arquivos comprimidos**: `gltf-transform` (Meshopt + KTX2/UASTC/ETC1S) no pipeline.
7. **Pós-processamento mínimo**: um único passe combinado; bloom barato só no nível alto.
8. **DPR adaptativo**: começa em 1.5 (computador) / 1.25 (celular) e desce automaticamente se o quadro passar de ~14 ms.
9. **Pausa inteligente**: nada renderiza com a aba oculta, e o loop desacelera quando não há movimento.
10. **Build com Vite**: módulos, minificação, divisão de código por capítulo (cada ambiente baixa seu próprio JS).

### Ganho esperado (estimativa)
| | Hoje | Com a arquitetura |
|---|---|---|
| Chamadas por quadro | 580 | 30–80 |
| Triângulos por quadro | 13,4 M | 0,3–1 M |
| Luzes em tempo real | 8 | 0–1 |
| Carregamento do 1º capítulo | ~10 s | 1–3 s (arquivos comprimidos, nada gerado no processador) |
