# Fundo do universo — crédito e licença

## Em uso: `stars.jpg`

|              |                                                                                       |
|--------------|---------------------------------------------------------------------------------------|
| obra         | ***8k Stars Milky Way*** — mapa estelar equirretangular, **8192×4096** (razão 2:1)    |
| autor        | **Solar System Scope** — <https://www.solarsystemscope.com/textures/>                 |
| licença      | **CC BY 4.0** — <https://creativecommons.org/licenses/by/4.0/>                        |
| onde entra   | a casca `BackSide` de `src/space/backdrop.js` — o único fundo que a cena desenha      |
| modificações | **nenhuma no arquivo.** O escurecimento é do shader (`GAIN` e vinheta), em tempo real |

**Atribuição exigida na publicação:** *Mapa estelar por Solar System Scope
(solarsystemscope.com), CC BY 4.0.*

⭑ **A identidade está PROVADA, não suposta:** o `sha256` do arquivo aqui e do
`solarsystemscope.com/textures/download/8k_stars_milky_way.jpg` são o mesmo —
`1fd005ddd6d53364cc5106e0121b83fd3bca236b1503f6b51f5501d9d51eafaf`, 1_905_513 bytes nos dois.
Reconferir é uma linha: `shasum -a 256 assets/sky/stars.jpg`.

⚠️ Ele chegou por um intermediário (`github.com/SoumyaEXE/3d-Solar-System-ThreeJS`, onde se chama
`8k_stars.jpg`) que **não declara licença nenhuma**. Intermediário não licencia o que não é dele —
quem licencia é o autor, e é a ele que o crédito vai. É a mesma rota e a mesma conclusão do
`textures/sun.jpg`.

☠️ **O nome do arquivo aqui MENTE por conveniência de caminho.** Ele é o mapa *Milky Way*, não o
`8k_stars.jpg` liso do mesmo autor — são obras diferentes, e o hash acima é o que desempata.

## O que a cena faz com ele, e por quê

⚠️ **A imagem é escuríssima de propósito:** média **1,43/255**, com só **2,4%** dos pixels acima de
8/255. Isso decide UMA linha em `backdrop.js` que não é estilo — ele entra como **display-referred**
(`LinearSRGBColorSpace`), porque decodificar sRGB põe a imagem sob o *toe* do ACES e o céu sai
**preto** com o mapa carregado e tudo o mais correto. `scripts/lei-fundo.mjs` §3b guarda isso.

⭑ **A região escura no centro da vista é a NÉVOA, e é desejada** — o trecho de casca à frente está a
`R + r`. Ela **não** é mipmap: desligar o mipmap remove o efeito junto, e devolve cintilação.

---

⚠️ Estes **não são os únicos binários** — o inventário completo, com licença e pendências, está em
[`../CREDITS.md`](../CREDITS.md).
