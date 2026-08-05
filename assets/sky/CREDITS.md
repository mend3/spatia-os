# Fundos do universo — crédito e licença

As três imagens são do **James Webb Space Telescope**, publicadas por ESA/Webb sob
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Usá-las exige atribuição, e é por
isso que o crédito aparece na tela de configuração do próprio observatório — não só aqui.

| Arquivo | Objeto | Crédito |
|---|---|---|
| `cosmic-cliffs.jpg` | NGC 3324, Nebulosa de Carina ("Penhascos Cósmicos") | ESA/Webb, NASA & CSA, J. Lee, PHANGS-JWST |
| `rho-ophiuchi.jpg` | Complexo de nuvens de Rho Ophiuchi | ESA/Webb, NASA & CSA, K. Pontoppidan, A. Pagan |
| `cartwheel.jpg` | Galáxia Roda de Carro (ESO 350-40) | ESA/Webb, NASA & CSA |

Originais em <https://esawebb.org/images/> (`weic2205a`, `weic2316a`, `weic2211a`).

## O que foi feito com elas

Recorte central para 16:9 e duas reduções — nada de correção de cor, para que o que se vê seja
o que o telescópio registrou. O escurecimento na tela é do shader (`space/backdrop.js`), em
tempo real, e não está gravado no arquivo.

| Qualidade | Resolução | Arquivo |
|---|---|---|
| alta | 3200×1800 | `<id>.jpg` |
| baixa | 1280×720 | `<id>-low.jpg` |

**São os únicos binários do projeto.** Todo o resto — áudio, anéis, buraco negro, campo estelar —
é procedural. A exceção existe porque nebulosa sintética parece ruído fractal, e o que se quer
aqui é a imagem que existe de verdade.
