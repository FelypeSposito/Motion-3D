# Motion 3D

Portfólio 3D interativo (Three.js + Vite). **Leia `docs/CONTINUAR.md` antes de qualquer coisa** — tem onde o projeto
parou, a estrutura e os próximos passos.

Regras essenciais:
- Responder em português. Ao mostrar o site, mandar o link do localhost **e** o do celular (IP da rede, ex.
  http://192.168.0.80:5173/).
- Não fazer `git push` sem o usuário mandar.
- `src/chapters/01-prado/index.js` é GERADO por `scripts/port-v4.py` (fonte: `public/estudos/meadow-scene-v4.html`).
  Edite o gerador ou `dive.js` e rode `py -I scripts/port-v4.py "<caminho absoluto>"`.
- Mudou algo procedural do prado? Refaça o cache: `?bake=reset` (computador) e depois `?bake` (celular, ≤768px).
- Cada etapa vira uma cópia em `versions/vNN-nome/` + linha em `versions/README.md`.
- Qualidade nunca abaixo da v4; meta 60 fps também no celular.
