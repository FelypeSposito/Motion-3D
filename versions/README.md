# Versões do projeto (evolução)

Cada pasta é uma cópia completa do site naquele momento. Com `npm run dev` rodando,
abra `http://localhost:5173/versions/<pasta>/` para ver a versão.

| Versão | O que tem |
|---|---|
| `public/estudos/` | v1–v4: cenas em HTML único (motor antigo) |
| `v5-motor-base` | motor novo (capítulos, passe final único, DPR adaptativo) com cenas provisórias + modo meio a meio da água |
| `v6-prado-no-motor-novo` | prado da v4 portado inteiro para o motor novo (mesmo visual), botão dia/noite no site, capítulo 2 provisório |
| `v7-mergulho` | mergulho no lago: câmera desce, meio a meio com a faixa de água (ref. foto), mundo submerso com cáusticas, raios, partículas e cardume; cidade flutuante removida |
| `v8-arco-e-mergulho` | câmera atravessa o vão do arco e só depois desce no lago atrás da ilha; brilho do sol na água sem estrias |
| `v9-camera-unica-e-lago` | trajeto de câmera único do começo ao fim (mesmo início e fim); água do lago verde-oliva/turva; noite automática embaixo d'água com botão travado |
| `v10-curva-suave` | trajeto com uma curva suave pela frente da ilha antes do arco (sem ir reto ao lago) |
| `v11-scroll-mais-lento` | rolagem ~40% mais lenta e capítulo usando a rolagem inteira enquanto não há próximo capítulo |
| `v12-mobile-2x` | celular renderiza em 2x (piso 1,25x, teto 2,2x) — menos serrilhado |
| `v13-cache-de-cena` | texturas, terreno, pedras e relevo pré-gerados (?bake) em WebP/binário compactado; cada aparelho baixa só o seu; pronto em ~0,6 s (celular) e ~1,2 s (computador) na versão de produção |
| `v14-luz-assada-e-cidade` | luz assada no Blender nas peças fixas (dia/noite 4K), sorteio com semente, celular mais nítido e sem trancos, água/chão/tronco melhores no celular, transição pela água turva, capítulo 02 cidade + neon (`?cap2`), deploy via GitHub Actions |
| `v15-cidade-detalhes` | cidade: prédios com recuos e cornijas, fachadas de alvenaria (pilastras/faixas) ou vidro, vitrines no térreo, caixas d'água e antenas piscando; chão com asfalto pintado, faixa de pedestres, bueiros, ralos e manchas de poça; floreiras, bancos, frades, postes, semáforos, lixeiras, bancas e vapor de bueiro |
