# Créditos de terceiros

Tudo o que este repositório usa e não escreveu. **Item novo entra aqui no mesmo commit em que
entra no disco** — atribuição descoberta depois da publicação é atribuição que já faltou.

⚠️ Os fundos do céu têm crédito próprio em [`sky/CREDITS.md`](sky/CREDITS.md).

---

## Em uso

### `textures/sun.jpg`

| | |
|---|---|
| obra | *2k Sun* — mapa de superfície solar, 2048×1024 |
| autor | **Solar System Scope** — <https://www.solarsystemscope.com/textures/> |
| licença | **CC BY 4.0** — <https://creativecommons.org/licenses/by/4.0/> |
| modificações | **nenhuma no arquivo.** É tingida em tempo de execução por temperatura (`FORCA_DO_MAPA` em `src/space/photosphere.js`); o JPEG em disco é o original |

**Atribuição exigida na publicação:** *Textura solar por Solar System Scope
(solarsystemscope.com), CC BY 4.0.*

⭑ **A identidade está PROVADA, não suposta:** o `sha256` do arquivo aqui e do
`solarsystemscope.com/textures/download/2k_sun.jpg` são o mesmo —
`ff0f076ba65e03b5ab518451bc96699325be38e3ccbdd5869ee1c00f3a0c8816`, 822 427 bytes nos dois.
Reconferir é uma linha: `shasum -a 256 assets/textures/sun.jpg`.

⚠️ Ela chegou por um intermediário (`github.com/SoumyaEXE/3d-Solar-System-ThreeJS`) que **não
declara licença nenhuma**. Intermediário não licencia o que não é dele — quem licencia é o autor, e
é a ele que o crédito vai.

---

## ☠️ Pendências

### `interstellar.mp3` — 10 MB, sem licença e SEM CONSUMIDOR

Chegou no mesmo minuto que o `sun.jpg` (2026-08-06 01:16), do mesmo repositório sem licença.
**Nada em `src/`, `server/` ou nos dois HTML o carrega** — conferido por varredura.

O motor de áudio deste projeto é **síntese procedural, zero asset**. Então o arquivo não é uma
dependência: é peso morto com um nome que sugere trilha de filme, num repositório de origem que não
declara direito nenhum. **Diferente do `sun.jpg`, aqui não há licença livre plausível a rastrear.**

⭑ **A saída barata é apagá-lo.** Nada quebra, e 10 MB saem do repositório. Fica como decisão porque
apagar binário é irreversível na árvore de trabalho — no git ele permanece no histórico, e um
`git filter-repo` seria necessário antes de publicar.

### `sky/CREDITS.md` afirma o que não é mais verdade

Ele diz: *"São os únicos binários do projeto. Todo o resto — áudio, anéis, buraco negro, campo
estelar — é procedural."* Havia **três binários** fora dali quando isto foi escrito. A frase sobre o
áudio é a parte certa (o motor é procedural); a contagem é a errada.

---

## Mapa de texturas candidatas

**O que o céu desenha hoje, e o que ele tira de foto:** a única pele fotografada é a estrela
(`sun.jpg`). Todo o resto é procedural — planeta, cometa, pulsar, nebulosa, estação, quasar, anel,
galáxia, buraco negro, casca de supernova.

### ⚠️ Antes de baixar qualquer coisa: onde textura AJUDA e onde ela mente

Esta cena não desenha o Sistema Solar. Ela desenha **conhecimento**, e a forma de um corpo é a
afirmação de um fato sobre um arquivo. Isso decide o que entra:

| corpo | textura fotográfica? | por quê |
|---|---|---|
| **planeta** | ☠️ **NÃO** | é procedural POR DECISÃO, gerado por semente do caminho. `censo-planetas.mjs` existe para medir quantos formatos distintos o corpus produz. Uma foto de Marte faria todo arquivo parecer Marte **independentemente do que ele É** — o modo de olhar decidindo a classe, que é o defeito que esta base já pagou duas vezes |
| **lua** | ⭑ **talvez** | a lua é PARTE NOMEADA de um documento, e hoje é ponto de 4,5 px. Textura em 4 px não entrega detalhe — mede antes (`MOON_MIN_OVER_OUTER`) |
| **asteroide** | ⭑ **sim, e é a lacuna real** | é a única classe do censo **sem pele nenhuma** (*"fica esfera lisa até existir a pele dele, e isso é decisão"*). 1 corpo no fixture |
| **estação** | ⭑ **sim** | é objeto CONSTRUÍDO. Modelo de satélite/sonda real é o análogo honesto, e a NASA publica dezenas |
| **pulsar · quasar · buraco negro** | ☠️ **NÃO** | não existe foto de superfície de estrela de nêutrons ou de quasar. O que se vê deles é **emissão**, e emissão é o que o shader já calcula. Uma "textura de pulsar" seria ilustração, não medida |
| **nebulosa** | ⚠️ já resolvido | os fundos JWST em `sky/` são exatamente isso, e o crédito está lá |
| **campo estelar** | ⚠️ procedural, e é melhor | o campo tem de responder à câmera; imagem equiretangular fixa não responde |

### Fonte 1 — Solar System Scope · **CC BY 4.0**, uso comercial permitido

<https://www.solarsystemscope.com/textures/> · padrão de download `/textures/download/[2k|8k]_[nome].jpg`

**É a fonte preferida**, porque a licença é explícita, o formato já é equiretangular 2:1 (o que o
`SphereGeometry` espera) e a identidade se confere por hash — foi assim que o `sun.jpg` saiu de
"suposto" para "provado".

| textura | resoluções | serviria a |
|---|---|---|
| [Moon](https://www.solarsystemscope.com/textures/download/2k_moon.jpg) | 2k · 8k | **lua** — a candidata mais direta |
| [Ceres](https://www.solarsystemscope.com/textures/) · Haumea · Makemake · Eris | 2k · 4k | **asteroide / corpo menor** — Ceres é o mais defensável (é um asteroide real) |
| [Mercury](https://www.solarsystemscope.com/textures/download/2k_mercury.jpg) | 2k · 8k | **asteroide** — superfície craterada sem atmosfera, se Ceres não servir |
| [Saturn Ring](https://www.solarsystemscope.com/textures/download/2k_saturn_ring_alpha.png) | 2k · 8k | ⚠️ o anel **já é procedural com quatro variantes na bancada** (T-26). Textura aqui *substituiria* uma decisão em aberto em vez de fechá-la |
| Stars · Stars + Milky Way | 2k · 8k | ⚠️ ver a tabela acima — o campo procedural responde à câmera |
| Sun | 2k · 8k | ⭑ **já em uso** |

### Fonte 2 — NASA 3D Resources · sem copyright, **com ressalvas**

<https://science.nasa.gov/3d-resources/> · espelho em <https://github.com/nasa/NASA-3D-Resources>

*"All of these assets are free to download and use"*, sob as
[Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).

☠️ **As guidelines NÃO são uma licença livre, e três ressalvas mordem aqui:** o logotipo e a
insígnia da NASA são **restritos**; nem tudo no acervo é obra da NASA (há material de terceiros com
copyright próprio); e o uso não pode sugerir endosso. **Cada item se confere individualmente** — o
guarda-chuva "NASA é domínio público" é falso no detalhe.

⚠️ E o formato é outro problema: o acervo é de **MODELOS 3D** (`3ds`, `blend`, `glb`, `stl`, `obj`),
não de mapas equiretangulares. Um `.glb` de asteroide não se aplica como textura — ele **substitui a
geometria**, o que é uma mudança de modelo, não de pele.

| categoria | serviria a | ressalva |
|---|---|---|
| **Asteroides** (Bennu, Eros, Itokawa) | **asteroide** — forma irregular real | é MALHA, não textura. Trocaria a esfera lisa por geometria — decisão de modelo |
| **Satélites / espaçonaves** | **estação** | idem, e é o caso mais forte do acervo: estação é objeto construído |
| **Lunar** (terreno, sítios Apollo) | **lua** | terreno local, não mapa global — não casa com esfera |
| **Pillars of Creation** | nebulosa | ⚠️ já coberto pelos fundos JWST |

### O que eu recomendaria medir primeiro

1. **Asteroide** é a única classe sem pele, e portanto o único caso em que textura **acrescenta** em
   vez de substituir. Ceres (CC BY 4.0) é o caminho mais barato.
2. **Lua** só depois de medir: ela vive em ~4,5 px, e o handoff já mediu que **detalhe por zoom está
   refutado** — textura invisível é peso de download com cara de melhoria.
3. **Estação** é o caso onde a NASA ganha da Solar System Scope, e é o único em que vale encarar
   malha em vez de mapa.

⚠️ **Nada foi baixado.** Isto é o mapa; baixar é decisão, e cada item entra com o hash conferido e a
atribuição escrita **no mesmo commit** — a regra do topo deste arquivo.
