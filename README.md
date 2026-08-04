# espatial-os

Um observatório espacial para um cérebro artificial. O centro é um buraco negro; tudo o que
o agente sabe orbita ele, e tudo o que ele faz é visível como física.

Não é um dashboard com tema escuro. A diferença é de intenção: aqui **não existe animação
decorativa**. Cada movimento na tela corresponde a um evento que aconteceu — uma estrela que
acende é um arquivo que foi recuperado, um wormhole verde é um `Read` que o agente executou,
a timeline é o profile real da execução em milissegundos.

Projeto pessoal, independente. Não faz parte de nenhuma plataforma, não é serviço de
ninguém, e a única coisa que ele assume do mundo externo é que Qdrant responde em
`localhost:6333`.

## Rodar

Precisa de: `uv`, um Qdrant com uma coleção indexada, e o CLI `claude` no PATH.

```bash
./serve.py                      # http://127.0.0.1:8787
```

É isso. Sem `npm install`, sem build, sem bundler — o `three.js` está vendorizado em
`vendor/` e resolvido por importmap. A única dependência Python é o `fastembed`, declarada
inline no `serve.py` (PEP 723) e resolvida pelo `uv` na primeira execução.

A tela de boot mostra o estado **real** de cada subsistema antes de deixar entrar. Se algo
estiver degradado, ela diz o quê — e o observatório abre em modo parcial em vez de fingir.

## O que é real e o que não é

Vale a pena ser explícito, porque uma interface bonita facilmente parece mais capaz do que é.

| Real | Como |
|---|---|
| Os nós do céu | 397 arquivos agregados da coleção vetorial, com peso = nº de chunks |
| A posição de cada nó | hash determinístico do id → órbita fixa. O mesmo conhecimento cai sempre no mesmo lugar |
| A recuperação | busca híbrida densa+BM25 fundida por RRF, ~8ms |
| As chamadas de ferramenta | `tool_use` reais do agente, com argumentos e duração medida |
| As citações `[n]` | apontam para o arquivo que entrou no prompt; citação sem fonte aparece riscada |
| Custo, turnos, tokens, janela de uso | vêm do stream do CLI, não de estimativa |
| A timeline | horário e `ms` medidos por estágio |
| A forma de onda | amplitude medida por `AnalyserNode` — do microfone gravando, ou do MP3 que o TTS devolveu |

| Aproximação | Por quê |
|---|---|
| Lente gravitacional | deflexão analítica ∝ 1/d² em screen-space. Geodésicas por pixel custariam a cena inteira |
| Arestas do grafo | hierarquia real `repo → diretório → arquivo`. O Neo4j é a fonte natural das relações, mas pode estar desligado |
| Depth of field | não existe. Exigiria depth buffer e passe próprio; o desfoque de borda dá a sensação de lente |
| Onda no fallback de voz | quando o TTS do servidor está fora, a fala cai no `speechSynthesis` do browser, que não expõe o buffer — aí a onda volta a ser envelope estimado, e a HUD diz qual motor está em uso |

## Comandos

| | |
|---|---|
| digitar + `Enter` | pergunta ao núcleo |
| segurar `Espaço` | falar (STT do browser) |
| botão `VOZ` | lê a resposta em voz alta pelo TTS do oracle, frase por frase |
| `Esc` | aborta o ciclo |
| `Tab` | modo cinematográfico — a HUD desaparece, sobra o núcleo e o texto |
| `` ` `` (ou botão AFINAR) | painel de afinação visual (22 parâmetros, persistidos neste navegador) |
| `P` (ou botão PERMISSÕES) | permissões, skills e agentes — ativar/desativar o que existe no repo |
| `Alt+R` | devolve a câmera à deriva automática |
| `⌘M` | mudo |
| arrastar / roda | orbitar / aproximar |
| clicar num nó | abre o conteúdo indexado dele |

## Arquitetura

Quatro camadas que **não se conhecem**. Todas assinam o mesmo barramento de eventos.

```
                  ┌─────────────────┐
   pergunta ─────▶│  agent.py       │  ciclo cognitivo
                  │  ↳ qdrant       │  (recuperar → buscar → sintetizar)
                  │  ↳ websearch    │
                  │  ↳ brain/claude │
                  └────────┬────────┘
                           │ SSE, um evento por passo
                  ┌────────▼────────┐
                  │  core/bus.js    │
                  └──┬───┬───┬───┬──┘
         ┌───────────┘   │   │   └───────────┐
    ┌────▼────┐   ┌──────▼─┐ ┌▼──────┐  ┌────▼─────┐
    │  space  │   │  hud   │ │ audio │  │ recorder │
    │ (three) │   │ (dom)  │ │(web-  │  │ (métricas│
    │         │   │        │ │ audio)│  │  prom)   │
    └─────────┘   └────────┘ └───────┘  └──────────┘
```

O contrato está em [`docs/EVENTS.md`](docs/EVENTS.md) — leia antes de mexer em qualquer
camada. A propriedade que ele garante: trocar o retriever, o modelo ou o provedor de busca
não muda uma linha de shader.

**As métricas derivam do mesmo stream que desenha a tela.** Isso não é elegância: significa
que não existe divergência possível entre o que se vê e o que se mede. Detalhes e o
catálogo em [`docs/METRICS.md`](docs/METRICS.md), exposto em `/metrics`.

### Arquivos

```
serve.py                 entrypoint (PEP 723 — uv resolve a dependência)
server/
  config.py              defaults + .env
  app.py                 rotas, SSE, /metrics
  agent.py               o ciclo cognitivo  ← o contrato de eventos nasce aqui
  brain.py               claude -p como subprocesso, traduzido para eventos
  llm.py                 ollama (cérebro offline) + montagem do prompt
  qdrant.py              busca híbrida, varredura, vizinhos
  embed.py               fastembed (ONNX na CPU, sem rede)
  graph.py               topologia derivada da coleção
  websearch.py           brave · serpapi · searxng · fallback ddg
  files.py               leitura com barreira de raiz
  promex.py              Counter/Gauge/Histogram + formato 0.0.4
  metrics.py             o catálogo — o que se mede e por quê
  recorder.py            evento → métrica
src/
  core/    bus · state · api · tuning
  space/   scene · blackhole · lensing · stars · graph · particles · satellites
  hud/     frame · streams · answer · terminal · controls · boot · dom
  audio/   engine (síntese procedural, zero asset)
vendor/    three.js + postprocessing
```

## Configuração

Tudo por `.env` na raiz (nada é obrigatório — os defaults casam com a infra local):

```ini
BRAIN=claude                 # ou `ollama` para responder offline, sem ferramentas
AGENT_CWD=                   # onde o agente enxerga arquivos (default: este projeto)
AGENT_MODEL=                 # vazio = default do CLI
AGENT_ALLOWED_TOOLS=Read Glob Grep WebSearch WebFetch
AGENT_MAX_TURNS=10

QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=workspace_embedding

BRAVE_API_KEY=               # satélite apagado até a chave existir
SERPAPI_API_KEY=
SEARXNG_URL=
```

**A busca web é opt-in.** É o único passo que expõe a pergunta a terceiros. Ou o operador
liga o toggle `WEB`, ou usa uma palavra explícita ("pesquise", "notícia", "hoje").

## Voz

O botão `VOZ` lê a resposta em voz alta. Duas decisões que valem explicação:

**Fala por frase, não pela resposta inteira.** Esperar o `answer` completo significa esperar o
modelo terminar E o motor sintetizar tudo. Medido nesta máquina: a voz começa em **~10s** (a
primeira frase fechada) contra ~40s se esperasse o fim. Cada frase fechada durante o stream de
tokens entra numa fila serial — paralelo chegaria antes e falaria fora de ordem, e resposta
técnica lida na ordem errada é pior que lida devagar.

**O browser fala com `/api/tts`, não com o TTS.** Mesma origem (sem CORS), o cliente não
conhece a infra, e voz/modelo são config de servidor (`TTS_VOICE`, `TTS_MODEL`) — quem abre a
página não escolhe. `/api/health` reporta se o motor está no ar **e** se a voz configurada
existe nele: voz inexistente falha em toda síntese e devolveria 200 no health sem isso.

Markdown é removido antes de sintetizar (`` `código` ``, `**negrito**`, `[3]`) — no ponto por
onde todos os caminhos passam, senão o motor lê a crase.

Requer o TTS global do oracle: `make up nvidia speech` (ou `cpu`). Sem ele, cai no
`speechSynthesis` do browser e a HUD diz que caiu.

## Permissões (painel `P`)

Permissões, skills e agentes **não** vivem no `.env`: vivem num estado editável na UI
(`.cache/config.json`) que o `brain.py` traduz para flags do CLI a cada execução.

A regra que o painel respeita: **todo toggle vira flag real**. Interruptor que não muda o
comando executado é pior que interruptor nenhum, porque o operador passa a confiar num
controle que não controla. O painel mostra o comando resultante no pé, como prova.

| Toggle | Vira |
|---|---|
| ferramenta desligada | `--disallowedTools Nome` |
| modo de permissão | `--permission-mode <modo>` |
| fonte de settings ligada | `--setting-sources project,local,user` |
| skill desligada | `--disallowedTools "Skill(nome)"` |
| agente desligado | `--disallowedTools "Task(nome)"` |
| todas as skills desligadas | `--disable-slash-commands` |

O catálogo é **descoberto** em `.claude/agents/*.md` e `.claude/skills/*/SKILL.md` do
`AGENT_CWD`, lendo o frontmatter. Skill nova no repo aparece no painel sozinha.

⚠️ Um acoplamento que não dá para esconder: skills e agentes do projeto só existem para a
sessão se as settings do projeto forem carregadas — e isso traz os **hooks do projeto** junto.
Não há flag que separe as duas coisas, e o painel diz isso em vez de fingir que separa.

### As três fontes de settings, com o custo medido

Um toggle só ("carregar `.claude` do repo") escondia que existem três fontes, e isso produziu um
bug: `hub-board` e `graphiti` vivem no escopo **`local`** (`~/.claude.json` →
`projects[<cwd>].mcpServers`, onde `claude mcp add` grava por default), que
`--setting-sources project` não alcança. O painel de MCP não os listava e não dizia por quê.

Medido em 2026-08-04 (`claude -p` com `claude-haiku-4-5`, `cache_creation_input_tokens` do frame
`result`):

| `--setting-sources` | cache criado | ferramentas | servidores MCP |
|---|---|---|---|
| (vazio) | 2.703 tk | 29 | 0 |
| `project` | 15.573 tk | 41 | 5 |
| `project,local` | 16.423 tk | 104 | 7 |
| `project,local,user` | 25.489 tk | 159 | 8 |

O escopo que faltava custa **~850 tokens**, não os ~9.100 do `user` — o medo de "trazer as
regras globais de volta" era do escopo errado. Por isso `project,local` é o default e `user` é um
toggle explícito com o custo escrito na própria linha.

O painel `br-mcp` mostra **duas** listas: o **declarado em arquivo** (por escopo, com o motivo de
cada exclusão) e o **reportado pela sessão**. As duas discordam de propósito — conectores da
conta (`claude.ai …`) não estão em arquivo nenhum que este servidor possa ler, e fingir que a
primeira lista explica a segunda seria voltar a omitir.

### A barreira que o modo assistente exige

Com ferramentas totais (`bypassPermissions`, `Bash` ligado), `GET /api/ask?q=…` executa
comandos arbitrários. Qualquer página aberta no browser pode disparar essa URL por
`fetch`/`<img>`/`<form>`: o CORS bloqueia a *leitura* da resposta, mas a requisição executa —
e para rodar um comando isso basta. É CSRF virando execução remota no próprio localhost.

Por isso `/api/ask` e `POST /api/config` recusam requisição `cross-site`, lendo o
`Sec-Fetch-Site` que o browser preenche e a página não falsifica. Cliente sem o cabeçalho
(`curl`) passa: a ameaça é a página web, não o terminal de quem já está na máquina.

Isso **não** substitui o bind em `127.0.0.1`, e não protege de nada rodando localmente.

## Estender

**Um comportamento novo na cena** = um evento novo no `agent.py` + quem reage no `space/` ou
no `hud/`. O `recorder.py` é o único lugar que precisa saber contá-lo.

**Um parâmetro visual novo** = uma linha no `SPEC` do `core/tuning.js` + o módulo que o
consome. O painel se constrói sozinho a partir da tabela.

**Ligar o Neo4j** (relações de verdade, em vez da hierarquia de diretórios): um módulo
`server/neo4j.py` que devolve `{nodes, edges}` no mesmo formato de `graph.load()`. A cena não
muda.

**Portar para Next.js/R3F**, se um dia fizer sentido: os shaders (`blackhole.js`,
`lensing.js`, `stars.js`, `graph.js`) são independentes de framework — recebem `THREE` e
devolvem objetos com `update(delta, elapsed)`. Envolver cada um num componente R3F é
mecânico. O que **não** deve ser portado é o barramento: ele já é agnóstico, e reescrevê-lo
como estado de React reintroduziria o acoplamento que ele existe para evitar.

## Armadilhas encontradas (e que voltam se alguém mexer)

- **Backtick em comentário dentro de template literal de shader** fecha a string. Custou um
  `SyntaxError: Unexpected identifier 'RingGeometry'` que parece erro de GLSL e não é.
- **`RingGeometry` é gerada no plano XY**, não XZ. Ler `vLocal.xz` no shader do disco não dá
  erro: devolve raio errado e o disco simplesmente não aparece.
- **Suavização em fração por quadro** (`x += (alvo-x) * 0.05`) parece funcionar e produz
  travadinha em qualquer queda de FPS. Sempre `1 - exp(-rate * delta)`.
- **`rotation.z` num anel não o levanta** — gira dentro do próprio plano. Foi o que
  transformou o "anel de fóton" numa gota triangular.
- **Emitir eventos de uma lista acumulada** em vez de `yield` em tempo real quebra a medição
  de estágio: o histograma passa a medir o loop de emissão, não o trabalho.
