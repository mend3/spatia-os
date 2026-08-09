# Identidade — SpatIA

Este documento é **decisão, não opção**. Ele nasceu como um brief com alternativas e notas; o que
sobreviveu à escolha está aqui, e o que foi descartado ficou registrado no fim, com o motivo — para
que ninguém reabra a mesma discussão daqui a seis meses sem saber que ela já aconteceu.

> **A grafia e as frases de marca são normativas.** Não são sugestão de tom: são o texto exato que
> vai na tela de boot, no GitHub, nas apresentações e em qualquer coisa pública. Mudar uma delas é
> mudar a marca, não editar uma cópia.

---

## Nome

> # SpatIA

**Pronúncia:** /spa-ti-a/

**Forma escrita:** sempre `SpatIA`, com **IA em maiúsculo**.

⚠️ **A caixa não é estilo.** É ela que faz o componente de *Inteligência Artificial* aparecer dentro
do nome. `SPATIA` em versalete, `Spatia` ou `spatIA` perdem exatamente isso — a única razão pela
qual essa forma foi escolhida. A tela de boot carrega essa nota no HTML, ao lado do `<h1>`, porque
versalete é a tentação natural de quem for mexer no CSS.

**O nome anterior era `Espatial OS`, e ele está aposentado.** Não conviver com os dois é a decisão:
uma marca só, desde o primeiro commit público, é o que produz reconhecimento e busca. Onde precisar
ser descritivo, use `SpatIA — The Spatial Operating System for AI`.

---

## Posicionamento

**Curto** (a frase principal):

> **The Spatial Operating System for AI.**

**Expandido:**

> **SpatIA is an open-source Spatial Operating System for AI, transforming knowledge, memory, tools
> and agents into a living, navigable universe.**

**One-liner:**

> **Navigate AI like a universe.**

⚠️ **O texto de marca é em inglês e os documentos internos são em PT-BR**, e isso é deliberado, não
inconsistência. A marca fala com o público do GitHub; a documentação fala com quem mantém o código.
Traduzir uma tagline é reescrevê-la.

---

## Manifesto

> **Knowledge has gravity.**
>
> Information shouldn't live in folders, tabs or endless chats.
>
> It should exist as a living universe.
>
> Every memory has a place.
>
> Every idea has an orbit.
>
> Every connection has gravity.
>
> SpatIA transforms AI into something you can explore, understand and control.

É a abertura do `README.md` da raiz — **antes** de qualquer instrução técnica. Quem chega tem de
entender que o projeto é diferente antes de ler um comando de shell.

---

## Missão e visão

**Missão:** build the operating system where humans and AI navigate knowledge together.

**Visão:** become the reference platform for spatial AI workspaces.

---

## Valores

* **Spatial-first**
* **AI-native**
* **Open by default**
* **Beautiful engineering**
* **Human-centered**
* **Explainable intelligence**

⚠️ Estes não são adjetivos de vitrine — três deles já são **regras executáveis** neste repositório,
e é isso que os torna valores em vez de slogan:

| valor | como ele é obrigado no código |
|---|---|
| *Explainable intelligence* | **A REGRA DA FÍSICA** — nenhuma animação é decorativa; toda feição afirma um fato. Feição sem fato não entra, e fato sem feição não é dado. |
| *Beautiful engineering* | **A REGRA DA INSPEÇÃO** — camada nova sem controle na bancada é camada que ninguém confere. `lod.js` lança na carga se uma pele não declarar o próprio orçamento. |
| *Spatial-first* | **A REGRA DO CATÁLOGO** — o que cada corpo pode e não pode ter (`forbids`) é decidido pelo que a forma afirmaria, não pelo que ficaria bonito. |

---

## Tagline

> ### Knowledge has gravity.

É a escolhida. `Navigate AI like a universe.` é a alternativa de mesmo peso, para quando o contexto
pedir verbo em vez de afirmação (um botão, uma chamada para ação).

---

## Identidade visual

**Logo:** um buraco negro estilizado.

```
●        ◉
```

**Extremamente minimalista.** Sem foguetes, sem astronautas, sem planetinhas — a referência é
Linear, Arc, Raycast, Vercel. O produto já tem um buraco negro renderizado por geodésica no centro
da tela; a marca aponta para ele, não desenha uma caricatura de espaço ao lado dele.

---

## GitHub

```
SpatIA
The Spatial Operating System for AI.
```

**Descrição curta:**

> Open-source spatial workspace where AI, knowledge graphs, memories and tools become an
> interactive 3D universe.

---

## Arquitetura de marca

Nomear os componentes como plataforma, não como um repositório com pastas:

```
SpatIA
├── SpatIA Core          ├── SpatIA Engine
├── SpatIA Studio        ├── SpatIA CLI
├── SpatIA Desktop       ├── SpatIA Agents
├── SpatIA Cloud         ├── SpatIA MCP
├── SpatIA SDK           └── SpatIA API
```

Estrutura de organização no GitHub, para separar responsabilidades sem perder a identidade:

```
spatia/
├── spatia      ├── engine     ├── server
├── docs        ├── desktop    └── awesome-spatia
├── examples    ├── web
├── sdk
```

⚠️ **Nada disso existe hoje**, e a lista é destino e não inventário. O repositório atual é um só. A
arquitetura está aqui para que a nomenclatura nasça certa quando o primeiro corte acontecer — não
para sugerir que ele já aconteceu.

---

## Domínio

Prioridade de aquisição: **spatia.ai** e **spatia.dev** (garantir os dois, se disponíveis).
Alternativas: `spatia.sh`, `spatia.io`, `getspatia.com`, `usespatia.com`.

---

## Onde a identidade já está aplicada

| lugar | o que carrega |
|---|---|
| `index.html` | `<title>SpatIA</title>`, `<h1 class="marca">SpatIA</h1>` e o posicionamento na tela de boot |
| `sandbox.html` | `SpatIA · bancada 3D` |
| `README.md` (raiz) | o manifesto abrindo o documento, antes de qualquer instrução |
| `window.spatia` | a janela de depuração — era `window.espatial` |
| `docs/catalogo-celeste.md` | o céu é "o céu do SpatIA" |

## Onde o nome antigo SOBREVIVE, de propósito

A migração de marca para no FORMATO DE FIO, e essa fronteira é a parte importante desta página.

| sobrevive | por quê |
|---|---|
| `espatial.tuning.v1` · `espatial.prefs.v1` · `espatial.collapsed.v1` · `espatial.trace` | chaves de `localStorage`. Renomear não migra: a chave nova simplesmente não encontra o que está gravado, e toda afinação feita à mão evapora **em silêncio** — junto com o histórico que `SUPERSEDED` usa para distinguir "nunca mexi" de "escolhi este valor" |
| `espatial_*` (métricas Prometheus) | alimentam dashboards e regras **fora deste repositório**. Renomear uma métrica é uma quebra na observabilidade, não uma edição de texto |
| o diretório `satellites/espatial-os` | mexe no `.gitignore` do workspace, no CWD de quem está trabalhando e em caminhos salvos fora daqui. Uma linha quando alguém decidir pagá-la; não bloqueia nada |

**Marca não vale uma perda de dados.** O nome sai de tudo o que é texto — tela, documento, log,
identificador de código — e fica onde a troca custaria o estado de alguém.

---

## Descartado, e por quê

Registrado para não reabrir a discussão sem contexto.

| descartado | motivo |
|---|---|
| `Espatial OS` | o nome anterior; duas marcas competindo diluem reconhecimento e busca |
| `Where intelligence takes shape.` | boa, mas descreve a interface e não a tese; "gravity" carrega o modelo mental inteiro |
| `Explore. Think. Orbit.` | ritmo bom, significado vago — "think" não é o que o produto faz, é o que o agente faz |
| `Visualize Intelligence.` | reduz o produto a visualização, e ele é navegação e controle |
| `Your AI. Your Universe.` | possessivo genérico; caberia em qualquer produto de IA |
| foguete / astronauta / planeta como logo | leitura de "espaço sideral decorativo", exatamente o oposto da tese de que a forma é o fato |
