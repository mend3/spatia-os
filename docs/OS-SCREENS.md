# Telas do sistema

Arquitetura de informação das telas de sistema do espatial-os: quais existem, que pergunta
cada uma responde, de que widgets é feita e o que fica de fora.

O critério é único e vale para tudo neste documento: **uma tela existe para responder uma
pergunta operacional que hoje não tem resposta.** Se a pergunta não dá para nomear numa
frase, a tela não entra. Tela de sistema sem pergunta é inventário com tema escuro.

Os documentos que este assume lidos: [`EVENTS.md`](EVENTS.md) (o contrato), 
[`METRICS.md`](METRICS.md) (o que já se mede) e o kernel em `src/kernel/`.

---

## 0. O vocabulário

Três decisões de fundação já tomadas, repetidas aqui porque tudo abaixo depende delas:

- **Tela é destino, não aba.** Um app é um corpo em órbita; abrir é a câmera voar até ele.
  A HUD trocar de widgets é consequência do voo, não o evento.
- **Widget é contrato** (`id`, `title`, `slot`, `grow`, `mount(host, ctx)`), e não sabe em que
  app está. O mesmo widget de timeline serve o sistema e os arquivos.
- **Layout é do produto.** O app declara os widgets e a ordem; o operador não arrasta nada.

### Convenção de fendas

O contrato tem quatro fendas e não diz o que cada uma significa. Sem semântica declarada,
cada app vai inventar a sua e o sistema deixa de parecer um sistema:

| Fenda | Semântica | Exemplo |
|---|---|---|
| `left` | **o que é** — identidade, configuração, o estado declarado | identidade da instalação, ferramentas ligadas |
| `right` | **o que está acontecendo** — medido, observado, agora | medidores, saúde, janela de uso |
| `stage` | **o objeto do app** — a coisa única que a tela serve para olhar. Sem moldura. | a resposta, o conteúdo do arquivo, a tabela de execuções |
| `strip` | **residentes** — o que nunca deve sair da tela | prompt, timeline |

### O conjunto residente

`core.prompt` e `core.timeline` entram na lista de widgets de **todos** os apps. O host de
widgets preserva o que continua declarado, então eles atravessam a navegação sem remontar —
o foco do prompt e o histórico da timeline sobrevivem ao voo.

Isso não é conveniência, é a diferença entre um ambiente e um painel de configuração: um OS
onde você não pode perguntar nada enquanto está na tela de armazenamento é um OS modal.

### Painel ou destino

Duas coisas convivem no sistema — painéis sobrepostos (afinação, `` ` ``) e destinos
(`#/files`). O critério para decidir:

> **Painel** quando a mudança precisa ser vista no mesmo instante, na mesma tela.
> **Destino** quando o efeito da mudança acontece em outro lugar ou depois.

A afinação é painel: 22 parâmetros de física e óptica que só fazem sentido ajustados olhando
o buraco negro reagir. Tirar isso do lugar destruiria a única razão de existir.

As permissões são **destino**, e hoje são painel — o que está errado. Nenhum toggle de
permissão tem efeito na execução em curso: ele vira flag de `claude -p` na *próxima*
invocação. Não há nada para ver acontecendo, e portanto nenhum custo em ser uma tela. A
tecla `P` continua existindo, apenas navegando em vez de sobrepondo (uma verdade, um código).

---

## 1. Inventário de telas

| Rota | Nome | A pergunta que responde | Existe hoje |
|---|---|---|---|
| `#/` | Núcleo | — (é a ponte: perguntar e ver responder) | sim |
| `#/system` | Sistema | *que instalação é essa, e o que ela está rodando agora?* | não |
| `#/activity` | Atividade | *o que está executando neste instante, e como eu paro?* | não |
| `#/journal` | Diário | *o que aconteceu enquanto eu não olhava — e prove* | não |
| `#/metrics` | Instrumentos | *demorou onde? custou quanto? a tela aguenta?* | só em `/metrics` |
| `#/storage` | Armazenamento | *o índice está atual e íntegro? o que ocupa disco?* | não |
| `#/security` | Permissões | *o que este agente pode fazer agora, e com que prova?* | painel `P` |
| `#/integrations` | Integrações | *que porta externa está aberta, com qual credencial?* | não |
| `#/files` | Memória | *o que o núcleo sabe sobre X?* | 1ª leva |
| `#/web` | Web | *o que o mundo externo respondeu, e por qual provedor?* | 1ª leva |
| `#/mcp` | Ponte MCP | *que capacidades externas o núcleo alcança?* | 1ª leva |

### A geografia

Os apps orbitam mais perto do núcleo que o campo de conhecimento (`bodies.js`,
`ORBIT_BASE = 12.5`) porque são *do* sistema, não conteúdo dele. Vale explicitar três anéis,
porque a distância é a semântica:

```
        r≈9        anel de introspecção   system · activity · journal · metrics
        r≈13-18    anel de trabalho       files · web · mcp · storage · security
        r≈26       fronteira              integrations
        r≈40+      campo de conhecimento  459 corpos
```

O anel interno é o sistema olhando para si: entrar nele **não afasta a câmera do núcleo** —
o buraco negro continua ocupando meia tela, porque é dele que a tela fala. O anel de trabalho
tem o comportamento normal de voo. E `integrations` fica na borda externa de propósito: é onde
o mundo de fora toca o sistema, e um webhook que chega atravessa aquela órbita vindo de fora
para dentro, com o mesmo vocabulário dos meteoros que já caem quando a busca web responde.

---

### `#/system` — Sistema

**Pergunta:** *que instalação é essa, o que ela está rodando agora, e com que configuração?*

Hoje a resposta está partida em quatro lugares e nenhum deles é uma tela: parte no
`/api/health`, parte no evento `brain` (que só existe depois da primeira pergunta), parte no
pé do painel de permissões, parte em `espatial_build_info` no `/metrics`. Ninguém consegue
responder "este servidor subiu quando?" ou "que modelo respondeu a última pergunta?" sem ler
código.

| Widget | Fenda | grow | O que responde | Fonte |
|---|---|---|---|---|
| `sys.identity` | left | 0 | versão, host:porta, PID, uptime, RSS, cérebro, modelo efetivo, `AGENT_CWD`, coleção, modelo de embedding | `build_info`, `process_*`, `config` |
| `sys.subsystems` | left | 1 | os 6 upstreams em **três** estados (online · offline · não configurado) + há quanto tempo a observação foi feita | `/api/health`, `upstream_up` |
| `sys.session` | right | 0 | a sessão do agente: `session_id`, `cwd`, `model`, nº de ferramentas, servidores MCP | evento `brain` |
| `sys.command` | right | 1 | o `argv` do próximo `claude -p`, inteiro | `permissions.cli_flags()` + `.env` |
| `sys.policy` | right | 0 | limites configurados: `max-turns`, teto de custo, execuções simultâneas, retenção do diário | config |

Dois detalhes que fazem a tela ser honesta em vez de decorativa:

**A idade da observação.** `upstream_up` é observação de tráfego real, não sonda sintética — o
próprio `METRICS.md` avisa que fica velha se ninguém usar o serviço. Um ponto verde sem idade
mente. `sys.subsystems` escreve "medido há 12s" ao lado de cada estado.

**Três estados, nunca dois.** Um provedor de busca sem chave não é falha. Pintá-lo de vermelho
ensina o operador a ignorar vermelho, que é o começo de toda cegueira operacional. O
`frame.js` já acertou isso; a tela herda a regra.

**O que NÃO deve estar aqui:** distribuição de latência (é `#/metrics`); lista de arquivos
indexados (é `#/storage`); qualquer botão que prometa subir ou reiniciar Qdrant/Ollama/TTS — o
espatial-os não é dono deles, e um botão que não controla é pior que nenhum. O que cabe é o
*comando* copiável (ver §2.2).

---

### `#/activity` — Atividade

**Pergunta:** *o que está executando neste instante, há quanto tempo, quanto já custou, quem
pediu, e como eu interrompo?*

Este é o buraco mais concreto do sistema atual. `espatial_ask_active` existe como gauge, mas a
UI só conhece o stream **da própria aba**. Duas abas abertas são dois subprocessos `claude`
queimando a mesma janela de uso, e nada na tela diz isso. `Esc` aborta o stream local; o
subprocesso da outra aba continua. Quando os webhooks entrarem, haverá execuções que nenhuma
aba iniciou — e aí a tela deixa de ser útil e passa a ser necessária.

| Widget | Fenda | grow | O que responde | Fonte |
|---|---|---|---|---|
| `act.running` | stage | 1 | execuções vivas: id, pergunta truncada, origem, estágio atual, ms, turnos, custo parcial, **ENCERRAR** | registro novo no servidor |
| `act.queue` | left | 1 | fila de execuções disparadas por evento externo, aguardando vez | fila em disco |
| `act.throttle` | right | 0 | janela de uso (`status`, `window`, `resets_at`), custo do dia contra o teto, execuções simultâneas contra o limite | evento `limit` + orçamento |
| `act.processes` | right | 1 | o que este servidor gerou: `claude` (PID, RSS, CPU), thread do embed, refresher do corpus | `psutil` não existe aqui — `/proc` ou `ps` por PID conhecido |

Isto exige backend novo: um registro de execuções em processo (id, pergunta, início, estágio,
PID, origem, custo parcial) e `POST /api/kill {id}`. O registro é o mesmo objeto que o
`recorder.instrument()` já atravessa — ele vê o começo, cada estágio e o `finally`. Não é um
segundo caminho de instrumentação.

**Manifestação espacial:** o corpo de `activity` é o único cujo halo pulsa proporcional a
`ask_active`. Se há execução rodando, você vê de qualquer lugar do espaço, sem estar na tela.
É notificação sem centro de notificações (ver §2.5).

**O que NÃO deve estar aqui:** histórico. Vivo e morto na mesma lista é o que transforma uma
tela acionável numa tela de leitura. O que terminou vai para `#/journal`.

---

### `#/journal` — Diário

**Pergunta:** *o agente leu, rodou e chamou o quê, quando, com qual permissão em vigor, e com
que resultado?* E a variante que aparece depois: *por que a resposta de ontem citou aquele
arquivo?*

Hoje: zero persistência. O widget de streams é volátil e é limpo a cada `query`. Uma execução
que rodou `Bash` com `bypassPermissions` às 3h da manhã não deixa rastro em nenhum lugar
consultável.

O backend é pequeno e o lugar é obrigatório: **o `recorder.py`**. Ele já é o único ponto por
onde todo evento passa e o único que sabe contar. Fazer dele também o único que sabe persistir
mantém a propriedade que o `METRICS.md` defende — não há divergência possível entre o que se
vê, o que se mede e o que ficou registrado. JSONL append-only em
`.cache/journal/<AAAA-MM-DD>.jsonl`, rotação por dia.

O que **não** se grava: `token` e `thought`, que são delta por letra. Grava-se o texto final. O
raciocínio integral só se o operador ligar — é volume e é conteúdo sensível.

O que se grava por execução, e a linha que importa é a terceira:

```json
{ "id": "r-2026-08-04-014", "started": "…", "origin": "console|hook:github|replay",
  "question": "…", "flags": ["--permission-mode","bypassPermissions","--setting-sources","project", "…"],
  "tools": [{"tool":"Read","kind":"filesystem","detail":"file_path=…","ok":true,"ms":12}],
  "sources": [{"n":1,"label":"…"}], "answer": "…",
  "cost_usd": 0.031, "tokens": {"in":…,"out":…,"cache_read":…}, "turns": 3,
  "outcome": "success", "prev": "sha256:…" }
```

`flags` é o snapshot de `cli_flags()` **no instante do disparo**. Sem ele, o diário diz "rodou
Bash" sem dizer que Bash estava permitido naquele momento — o que é registro, não auditoria.

| Widget | Fenda | grow | O que responde | Fonte |
|---|---|---|---|---|
| `jr.runs` | stage | 1 | tabela de execuções por dia, com filtro por resultado e por ferramenta | JSONL |
| `jr.detail` | right | 1 | a execução selecionada, inteira: flags, ferramentas, fontes, resposta, custo | JSONL |
| `jr.replay` | right | 0 | **reproduzir** a execução no espaço | reemissão no barramento |
| `jr.denials` | left | 1 | o que foi negado: ferramenta bloqueada, cross-site recusado (403), arquivo fora da raiz, web sem opt-in | JSONL |
| `jr.spend` | left | 0 | custo por dia, agregado — o único lugar que sobrevive a um restart | JSONL |

**`jr.replay` é o item de maior retorno por linha de código deste documento.** Reemitir os
eventos gravados no barramento faz a cena reencenar a execução: os wormholes abrem nas mesmas
cores, as estrelas acendem nos mesmos nós, a resposta aparece letra por letra. A cena não
precisa saber que é reprise — o barramento já aceita qualquer produtor. Exige exatamente dois
cuidados: marcar cada evento com `replay: true` para o `recorder` não recontar a métrica, e a
HUD dizer **REPRISE** em vez de deixar o operador achar que algo está acontecendo agora.

**`jr.denials` é o que justifica o painel de permissões existir.** Um toggle desligado que
nunca aparece sendo respeitado é um toggle em que se acredita, não um que se verifica.

**O que NÃO deve estar aqui:** métricas agregadas (é `#/metrics`); `tail` do stdout do
servidor — o diário é estruturado e derivado do barramento, o stdout é para quem está no
terminal e não precisa de tela.

---

### `#/metrics` — Instrumentos

**Pergunta:** as quatro que o `METRICS.md` já declara existir para responder. A tela não
inventa perguntas: ela renderiza um catálogo que já as declarou.

1. A resposta demorou — onde?
2. O índice apodreceu?
3. Quanto custou?
4. A tela aguenta?

21 famílias de métrica existem, são derivadas do mesmo stream que desenha a cena, e **ninguém
as lê**, porque ler exige `curl /metrics` e olhar texto de exposição Prometheus.

| Widget | Fenda | grow | O que responde | Fonte |
|---|---|---|---|---|
| `mx.stages` | stage | 1 | `ask_stage_duration_seconds{stage}` por quantil, lado a lado com `ask_ttft_seconds` | `/metrics` |
| `mx.tools` | left | 1 | `tool_calls_total{tool,kind,outcome}`, pintado com a paleta de `kind` da cena — é o histograma do céu | `/metrics` |
| `mx.corpus` | left | 0 | pontos, arquivos, idade do índice, nós e arestas do grafo | `/metrics` |
| `mx.cost` | right | 1 | custo por modelo, tokens por tipo, tokens de raciocínio, turnos | `/metrics` |
| `mx.client` | right | 0 | fps, quadros longos, nós na cena, resultados de boot | `/metrics` |

O cliente ganha um parser do formato de exposição (60 linhas: nome, labels, valor, `_bucket`).
Nenhum backend novo.

Dois cuidados que a tela precisa carregar por escrito, porque ambos já estão documentados como
armadilha: `retrieval_top_score` é score de fusão RRF e **não é comparável entre consultas**
em valor absoluto — serve como sinal de deriva, não como qualidade. E `/api/ask` está fora do
histograma de latência HTTP de propósito.

**O que NÃO deve estar aqui, e o motivo é técnico:** seletor de janela temporal, consulta
arbitrária, alertas. **O processo é o armazenamento.** São contadores em memória desde o boot,
sem série temporal — um eixo do tempo mentiria sobre dados que não existem. Quem quiser
histórico aponta um Prometheus para `/metrics` (o oracle já tem um) e a resposta honesta desta
tela é o link para o Grafana. O widget que vale acrescentar é o inverso: `mx.scrape`, que diz
se alguém está coletando e quando foi a última vez.

---

### `#/storage` — Armazenamento

**Pergunta:** *o índice está atual e íntegro, e o que este sistema escreveu em disco?*

Distinção com `#/files`, porque elas parecem a mesma tela e não são:

- `#/files` responde **"o que o núcleo sabe sobre X"** — navega conteúdo, chunks, vizinhos.
- `#/storage` responde **"o corpus é confiável"** — cobertura, idade, integridade, volume.

| Widget | Fenda | grow | O que responde | Fonte |
|---|---|---|---|---|
| `st.collection` | left | 0 | coleção, nº de pontos, vetores **esperados vs presentes**, tamanho | `qdrant.info()` |
| `st.coverage` | stage | 1 | cobertura por tipo e por repo/diretório, com a idade do mais novo e do mais velho de cada grupo | `graph.build()` + `index_files_by_kind` |
| `st.freshness` | right | 1 | `index_age_seconds` e a distribuição de idade; alerta acima do limiar | `/metrics` |
| `st.caches` | right | 1 | o que este processo gravou: `.cache/config.json`, `.cache/graph.json`, `.cache/journal/`, modelo ONNX do fastembed — com idade e tamanho | disco |

**`st.collection` justifica a tela sozinho.** O acoplamento mais traiçoeiro do sistema está em
`config.vector_name()`: nome de vetor divergente devolve **resultado vazio em vez de erro**. O
comentário no código já admite isso. Um widget que compara o nome esperado (`fast-<modelo>` +
`bm25`) com o que a coleção realmente tem é a única defesa contra o modo de falha que não
levanta exceção nenhuma.

`st.caches` também carrega a metade que quase todo painel de "limpar dados" esquece: a
afinação vive no `localStorage` do navegador, não no servidor. **Reset de fábrica tem duas
metades**, e a tela diz quais.

**A ação honesta:** o espatial-os **não indexa**. Ele lê uma coleção que outro pipeline
escreveu. Portanto não existe botão REINDEXAR — existe o comando de reindexação exibido e
copiável, mais a data em que o índice mudou pela última vez. Reconstruir a topologia, sim, é
deste sistema (`/api/graph?force=1` já existe) e esse botão é real.

**O que NÃO deve estar aqui:** leitor de conteúdo, editor de chunk, busca. Tudo isso é
`#/files`.

---

### `#/security` — Permissões

**Pergunta:** *o que este agente pode fazer agora, quem decidiu isso, e prove que a decisão
saiu como flag.*

O painel `P` já responde a maior parte disso e respeita a regra certa (todo toggle vira flag,
com o comando resultante no pé como prova). O que a promoção para destino acrescenta são as
duas perguntas que não caberiam num painel sobreposto.

| Widget | Fenda | grow | O que responde | Fonte |
|---|---|---|---|---|
| `sec.mode` | left | 0 | modo de permissão (5) e `load_repo_config`, com o aviso do acoplamento hooks↔skills | `permissions.describe()` |
| `sec.tools` | left | 1 | as 11 ferramentas, com a cor de `kind` | idem |
| `sec.catalog` | stage | 1 | 12 skills e 16 agentes descobertos, **com o caminho de onde vieram** | `catalog.snapshot()` |
| `sec.reach` | right | 1 | o **alcance**: `AGENT_CWD`, `FILE_ROOTS`, MCPs conectados, provedores de rede alcançáveis | config + evento `brain` |
| `sec.exposure` | right | 0 | postura do servidor: bind, ausência de autenticação, barreira `Sec-Fetch-Site`, nº de recusas cross-site | servidor |
| `sec.effective` | strip | 0 | o `argv` resultante | `cli_flags()` |

**`sec.reach` é a tela nova dentro da tela antiga.** A lista de permissões cobre *ferramentas*;
o dano vive no *alcance*. Esta instalação roda com `AGENT_CWD=/Users/victor/workspace/devshell-one`
— o workspace inteiro, não o projeto — e nenhum dos 11 toggles diz isso. `Read` com a raiz no
próprio projeto e `Read` com a raiz no workspace são a mesma marca de seleção ligada e duas
autoridades incomparáveis. E
`mcp__hub-board__update_issue` não é coberto por nenhum dos 11 toggles — MCP entra por outra
porta e escapa inteiro da lista. Uma tela de segurança que não mostra isso mostra a metade
tranquilizadora.

O mesmo widget resolve uma leitura errada que o painel atual induz. Com `AGENT_ALLOWED_TOOLS`
vazio não sai `--allowedTools` nenhum, e o conjunto real é **tudo** o que o CLI tem; os 11
toggles só sabem *negar*. O painel mostra 11 ferramentas ligadas e o operador conclui que o
universo tem 11. O evento `brain` já reporta o número verdadeiro (`tools: N`) — `sec.reach`
mostra os dois lado a lado, e a diferença entre eles é exatamente o que nenhum toggle controla.

Por isso o catálogo exibe **origem**: o operador tem que ver que as skills vieram de
`AGENT_CWD/.claude`, e que mudar `AGENT_CWD` troca o catálogo inteiro sem tocar num toggle.

**O que NÃO deve estar aqui:** usuários, papéis, grupos. Não há usuários — um operador, uma
máquina, `127.0.0.1` sem autenticação. Papel sem sujeito é teatro de conformidade. Se um dia
houver acesso remoto, o problema é autenticação de transporte, não uma tela de perfis.

---

### `#/integrations` — Integrações

**Pergunta:** *que porta externa está aberta, quem pode bater nela, o que entrou nas últimas
24h, e qual credencial está a ponto de expirar?*

| Widget | Fenda | grow | O que responde | Fonte |
|---|---|---|---|---|
| `in.inbound` | stage | 1 | cada endpoint: id, URL, **impressão** do segredo, último recebimento, contagem, e a **política de efeito** | registro novo |
| `in.credentials` | left | 1 | provedor, escopos, validade, estado (ausente · válida · expirada), impressão | `.cache/credentials.json` |
| `in.traffic` | right | 1 | os últimos eventos externos, aceitos e recusados, com o motivo da recusa | diário |
| `in.packages` | right | 1 | MCPs declarados vs conectados; apps instalados e as capacidades que pediram | `--mcp-config`, registry |

A decisão que a tela materializa: **a política de efeito de um webhook é explícita e o default
é não executar nada.** Três valores:

| Política | O que o evento faz ao chegar |
|---|---|
| `draw` (default) | emite evento no barramento; a cena reage. Nada mais. |
| `enqueue` | entra na fila de `#/activity` como pergunta, aguardando disparo |
| `off` | recusado e registrado |

Não existe `execute`. Um webhook que dispara execução direta num sistema que roda com
`bypassPermissions` é execução remota com outro nome. Promover para `enqueue` é um toggle
separado, com o aviso ao lado.

**Manifestação espacial:** o corpo de `integrations` está na borda externa. Um webhook aceito
atravessa aquela órbita para dentro, como meteoro — o mesmo vocabulário que já existe para
resultado de busca web. Recusado, ele bate na órbita e se apaga. O operador vê que algo veio de
fora sem estar na tela, e vê a diferença entre entrar e ser barrado.

**O que NÃO deve estar aqui:** o valor de nenhum segredo, nunca, em nenhum estado da UI (§3);
saída para terceiros (a primeira leva é só entrada, e "notificar o Slack quando terminar" é
outro documento).

---

## 1.1 Telas que eu não recomendo

As omissões valem tanto quanto as propostas, e cada uma tem motivo próprio.

**Centro de notificações.** O espaço **já é** o centro de notificações: halo pulsando, meteoro
entrando, glitch na interferência. Uma caixinha com sino seria a primeira animação decorativa
do projeto — algo se movendo porque a UI decidiu, não porque um evento aconteceu — e é assim
que a regra de ouro começa a morrer. O mecanismo que eu recomendo em vez da tela está em §2.5.

**Aparência e temas.** O painel de afinação já é isso, e é melhor: 22 parâmetros de física e
óptica em vez de "cor de destaque".

**Contas, perfis, multiusuário.** Ver `#/security`.

**Loja ou marketplace de apps.** Um app aqui é código JavaScript que roda na mesma origem que
fala com um servidor que executa um agente com ferramentas totais. Instalar app de terceiro
nisso é entregar a máquina. Instalação é `git`, revisada, e o formato de pacote de §2.3 existe
para organizar o que **você** escreve, não para receber o que outros escrevem.

**Editor de arquivos.** É um observatório. Escrever é o que o agente faz com `Write`/`Edit`
sob permissão declarada e registro no diário, não o que a página faz por baixo do agente.

**Terminal de shell na página.** Já existe, e chama-se `Bash` via o agente — com wormhole,
métrica e registro. Um shell direto contornaria o modelo de permissões inteiro, e o
`Sec-Fetch-Site` passaria a ser a única coisa entre uma aba maliciosa e um `rm -rf`.

**Painel de série temporal.** Motivo em `#/metrics`: o processo é o armazenamento.

**Tela de logs do servidor.** O diário é estruturado, derivado do barramento e consultável. O
stdout é para quem está no terminal.

---

## 2. Mecanismos que um OS tem e este ainda não

### 2.1 Capacidade, não lista de nomes

O modelo atual é uma lista de nomes negados: `--disallowedTools Read`. O problema é que um
nome não é uma autoridade. Três buracos concretos:

- `Read` ligado com `AGENT_CWD` no projeto e `Read` ligado com `AGENT_CWD` no workspace inteiro
  (o valor atual) são a mesma marca de seleção e duas autoridades separadas por ordens de
  magnitude.
- `mcp__*` não aparece na lista das 11 ferramentas. As capacidades mais poderosas do sistema
  entram por `--mcp-config` e nenhum toggle desta UI as alcança.
- Não há limite quantitativo em nada: uma ferramenta permitida é permitida N vezes.

O modelo que resolve é `capability = (verbo, escopo, limite)`:

```js
{ id: 'fs.read',        verb: 'Read|Glob|Grep',    scope: ['<AGENT_CWD>'],        limit: { bytes: 2_000_000 } }
{ id: 'net.fetch',      verb: 'WebFetch',          scope: ['docs.anthropic.com'], limit: { calls_per_run: 5 } }
{ id: 'mcp.hub-board',  verb: 'mcp__hub-board__*', scope: [],                     limit: { calls_per_run: 20 } }
```

E aqui vem a parte honesta: **o CLI só aceita nomes, não escopos.** Então a capacidade se
materializa por dois caminhos distintos, e confundi-los é vender sandbox que não existe.

**O que o CLI aceita** — `--allowedTools` / `--disallowedTools`, `AGENT_CWD` como raiz do que
o agente enxerga, `--mcp-config` + `--strict-mcp-config` como conjunto fechado de capacidades
externas. Isso é prevenção real, aplicada antes do processo existir.

**O que o CLI não aceita** — escopo e limite. Aqui existe um mecanismo de verdade e ele já
está a um passo: um hook `PreToolUse` instalado numa `--settings` efêmera, que faz uma
requisição para o próprio espatial em `127.0.0.1:8787/api/gate` antes de cada chamada de
ferramenta. O servidor decide por capacidade, responde permitir ou negar, e grava a decisão no
diário. Isso transforma a lista em política, e o diário em ledger com decisão — não só com
consequência.

O que **não** vale fazer: interceptar depois. O `recorder` já vê `tool.args` em tempo real e
poderia matar o subprocesso ao ver uma violação, mas nesse ponto o `Read` já aconteceu.
Interceptação a posteriori é detecção, e chamá-la de controle é a mentira que o painel de
permissões existe justamente para não contar.

### 2.2 Unidades de serviço: desejado vs real

`/api/health` responde o **real**. Não existe **desejado** em lugar nenhum, e a consequência é
que TTS fora do ar é indistinguível de TTS que nunca foi para ser usado nesta instalação.

Um arquivo de unidades declarado resolve, e a forma importa:

```json
{ "qdrant":  { "state": "required", "degrades": "sem contexto recuperado; o céu não carrega",
               "start_hint": "cd core/oracle && make up qdrant" },
  "tts":     { "state": "optional", "degrades": "a voz cai no speechSynthesis do browser",
               "start_hint": "cd core/oracle && make up nvidia speech" },
  "ollama":  { "state": "disabled", "degrades": "—" } }
```

Com isso o widget mostra três colunas — desejado, real, degradação assumida — e o sistema
passa a responder uma pergunta que hoje ninguém responde: *o que eu perco se o Ollama cair?* A
tela de boot já faz metade disso (abre em modo parcial e diz o quê); o que falta é o desejado
ser **declarado** em vez de inferido da ausência.

Somando o grafo de dependência (`ask → embed → qdrant`, `voz → tts`, `web → provedor`), o
sistema pode desabilitar o botão `VOZ` preventivamente em vez de deixá-lo falhar.

**A decisão de projeto:** uma unidade tem `start_hint` textual, **não** `start()`. O
espatial-os não é o init desta máquina, não sobe Qdrant nem Ollama, e um painel que finge poder
é a mesma classe de erro do interruptor que não controla. A diferença entre systemd e um painel
de estado honesto é essa, e aqui o segundo é a escolha certa.

### 2.3 O que é um pacote, e o que é instalar

Hoje um app é uma chamada de `registerApp()` no boot, escrita à mão no código. Isso serve para
a primeira leva e não serve depois de dez telas.

Um pacote é um diretório em `src/apps/<id>/`:

```
src/apps/journal/
  manifest.json      id, name, tagline, color, capabilities[], api[]
  widgets.js         registra os widgets do app
  server.py          (opcional) rotas que o app precisa
```

- **Instalar** = colocar o diretório no lugar e regenerar o índice que o boot importa. Não há
  import dinâmico de rede: o `three.js` está vendorizado e resolvido por importmap de
  propósito, e essa propriedade não se troca por conveniência de instalação.
- **Desinstalar** = remover o diretório e limpar `.cache/apps/<id>/`. Estado órfão de app
  removido é o lixo que faz um sistema envelhecer.
- **Aprovar** = o manifesto declara `capabilities` e `api`, e o operador vê a lista no ato da
  instalação. **É aqui que uma lista de permissões faz sentido** — por app, no momento em que
  algo novo entra —, ao contrário da lista global de ferramentas do agente, que é sempre a
  mesma e por isso deixa de ser lida.

Três correções concretas no kernel que este formato exige:

**Órbita alocada, não escolhida.** Dois apps declarando `orbit.radius: 12.5` se sobrepõem no
espaço, e o `registerApp` aceita calado. A cena já tem a solução para isso e ela é boa: os nós
do céu usam hash determinístico do id → órbita fixa, "o mesmo conhecimento cai sempre no mesmo
lugar". Apps devem usar o mesmo truque, com o anel (§1) vindo do manifesto e a fase vindo do
hash.

**Tecla estável.** O router faz `listApps()[Number(key) - 1]`, ou seja, o atalho depende da
ordem de registro: instalar um app remapeia os atalhos que o operador já decorou. A tecla tem
que vir do manifesto, e os dígitos 1–9 são para o anel de trabalho — o anel de introspecção se
alcança por paleta de comando.

**O gesto pertence ao app, não ao kernel.** O router hoje tem `navigate('files')` escrito
dentro dele, ao reagir a `ui.select`. Isso é política de um app específico morando no kernel —
exatamente o acoplamento que o registry foi escrito para evitar. O manifesto declara o que
reivindica (`claims: ['ui.select:file']`) e o router só resolve.

### 2.4 Ledger, não log

Coberto por `#/journal`. As propriedades que o fazem ledger e não log:

- **Append-only**, rotação por dia, nunca sobrescrita no meio.
- **Um registro por decisão**, não por evento. `token` por letra não é decisão.
- **Snapshot das flags no disparo** — sem isso não é auditoria (§1, `#/journal`).
- **Encadeamento por hash**: cada linha carrega o hash da anterior. Custa três linhas de
  código e é a diferença entre "alguém pode ter editado isto" e "não sem que apareça".
- **Truncamento é o modo de falha a projetar**: teto de disco declarado, e o comportamento ao
  cruzá-lo é parar de aceitar execuções, não parar de gravar. Um sistema que executa sem
  registrar é pior que um que recusa.

### 2.5 Notificação como evento, não como caixa

Recomendo o mecanismo e recuso a tela. Um evento novo no protocolo:

```
notice · severidade (info|warn|error) · origem (app id) · texto · ttl · rota-alvo
```

A cena o manifesta no corpo do app de origem — contador no rótulo DOM, que já existe em
`bodies.js` — e o diário o grava. Sem sino, sem caixa, sem badge global.

A regra de ouro se aplica sem exceção: **notificação só nasce de evento.** O que qualifica:
índice envelheceu além do limiar, janela de uso passou de X%, credencial expirando em N dias,
webhook recusado, execução falhou sem operador presente, orçamento diário cruzado.

O que não qualifica: "bem-vindo", "dica do dia", qualquer coisa que a UI inventou.

### 2.6 Sessão, e o que "bloquear" significa aqui

Duas coisas diferentes chamadas de sessão, e vale separar porque uma delas é uma lacuna de
produto real:

**Sessão de conversa.** Cada `claude -p` abre uma sessão nova. O evento `brain` reporta um
`session_id` diferente a cada pergunta, e ninguém encadeia — o núcleo é um oráculo amnésico e a
tela não diz isso. `--resume <session_id>` existe; o que falta é a decisão de usá-lo e um
lugar em `#/system` que mostre qual sessão está sendo continuada. Enquanto isso não existir, a
segunda pergunta do operador não sabe da primeira, e ele vai descobrir isso do jeito ruim.

**Bloqueio de console.** Autenticação não faz sentido: localhost, um usuário, nada aqui protege
de código rodando localmente. O que faz sentido é o inverso — um estado **desarmado**: depois
de N minutos sem interação o sistema volta para a tela de engate, e enquanto desarmado
`/api/ask` recusa. Isso não é segurança e não deve ser vendido como tal. É proteção contra o
caso real: a aba aberta com `bypassPermissions` na tela do notebook, num café ou numa
apresentação, e alguém digitando.

### 2.7 Cotas, e a que falta é a que importa

Existem: `AGENT_MAX_TURNS`, a janela de uso reportada pelo provedor (evento `limit`), custo
contado por modelo.

Faltam quatro, e a primeira é a que dói:

| Cota | Por que | Onde vive |
|---|---|---|
| **teto de custo por dia e por execução** | uma pergunta ruim entra em loop de tool call até `max-turns` e nada a para por dinheiro | recusa em `/api/ask` com `error{service:'budget'}` |
| **execuções simultâneas** | N abas = N subprocessos `claude` na mesma janela de uso | registro de execuções (§`#/activity`) |
| **chamadas MCP por execução** | é a capacidade sem limite nenhum hoje | gate de capacidade (§2.1) |
| **disco do diário** | crescimento sem teto | rotação + parada de aceite |

A divisão entre telas evita duplicação: os **medidores** (o que resta agora) ficam em
`#/activity`; as **políticas** (o que está configurado) ficam em `#/system`.

### 2.8 Recuperação de falha — e um fail-open que existe hoje

Muita coisa já está certa: falha é evento e o ciclo continua; o subprocesso morre no `finally`
se o browser desconectar; `ask_active` não vaza.

Um problema concreto no código atual: `permissions.load()` trata `.cache/config.json` ilegível
com um `logger.warning` e cai em `_defaults()`, cujo modo é `AGENT_PERMISSION_MODE` — que nesta
instalação, no `.env`, é `bypassPermissions`. **O caminho de recuperação herda o modo mais
permissivo configurado**, em silêncio, com uma linha de log que ninguém está lendo. Recuperação
de falha não pode ser o caminho que devolve mais autoridade que o estado perdido: o
comportamento certo é cair em `default` (o modo que pede confirmação), emitir `notice` de
severidade `error` e dizer na tela que a configuração foi perdida — o operador reabilita o que
quiser depois de saber.

Os outros três:

- `graph.json` corrompido → reconstruir, que já é barato e já tem caminho.
- Modelo de embedding ausente → o boot já reporta e abre em modo parcial. Está correto.
- **Queda do servidor** → não há supervisor. Isso significa que a fila de webhooks precisa
  nascer **em disco**, não em memória: uma fila que evapora no restart transforma "recebido" em
  mentira, e recebido é exatamente o que um endpoint de entrada promete.

### 2.9 O que significa desligar

Três níveis distintos, e nomear a diferença é metade do valor:

| Ação | Perde | Não perde |
|---|---|---|
| **fechar a aba** | as execuções em voo (SSE fecha → generator fecha → `aborted`) | nada mais. Correto como está. |
| **reiniciar o núcleo** | contadores do `/metrics`, sessão do agente, execuções em voo | `.cache/*`, diário, índice |
| **"desligar o sistema"** | não existe — e não deveria | — |

O terceiro merece a decisão explícita: o espatial-os não é dono de Qdrant, Ollama ou TTS, então
não tem o que desligar. O que existe de verdade e vale implementar é **drenagem**: `SIGTERM` →
parar de aceitar execuções, esperar as vivas terminarem, gravar no diário um registro de
encerramento limpo, sair.

O registro de encerramento é o ponto. Sem ele, ninguém responde depois *o sistema caiu ou eu
fechei?* — e essa é a primeira pergunta que se faz ao ver uma lacuna no diário.

Sobre o botão "reiniciar o núcleo" em `#/system`: só é honesto se houver supervisor. Sem
supervisor, o widget mostra o comando.

### 2.10 Endereço para o estado, não só para a tela

O hash sobrevive ao F5 — mas só até o nome do app. `parse()` descarta tudo depois do id, então
"a execução que eu estava olhando no diário" e "o arquivo que eu tinha aberto" não sobrevivem a
um recarregamento nem a um link.

A correção é pequena e habilita muita coisa: `parse()` divide em `{app, arg}` e o `arg` entra
no `ctx` que o host passa aos widgets. `#/journal/r-2026-08-04-014` e `#/files/docs/EVENTS.md`
passam a ser endereços. Um OS onde F5 te devolve à tela inicial não é ambiente, é demo — o
próprio comentário do router diz isso, e a sub-rota é o resto da frase.

**Um bug latente, antes de qualquer tela:** `ROUTE_ROOT === 'system'`. Registrar um app com id
`system` produz uma rota que resolve (`hasApp('system')` é verdadeiro) e uma tela que nunca
monta (`activate` trata `id === ROUTE_ROOT` como raiz e passa `app = null`). A tela mais
importante deste documento é inalcançável enquanto a constante não mudar. Renomear a raiz para
`core` custa duas linhas e tem que vir primeiro.

---

## 3. OAuth e credenciais de terceiros

Restrições reais: servidor de biblioteca padrão em `127.0.0.1`, sem dependências, sem
autenticação; a página é servida pelo mesmo processo; e o agente já alcança MCPs autenticados
por outro caminho. O objetivo: **a página nunca toca em segredo, e o agente também não.**

### 3.1 Onde o segredo mora

Não no `.env` (que é o arquivo que se copia e se cola em chat) e não no `localStorage` (que é o
arquivo que qualquer XSS lê). Um único `.cache/credentials.json`, e o modo de criação importa:

```python
# Path.write_text cria 0644. Aqui isso é a diferença entre segredo e arquivo.
fd = os.open(path, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
```

Melhor, quando disponível: o keychain do sistema (`security add-generic-password` no macOS,
`secret-tool` no Linux), com o arquivo `0600` como fallback declarado — declarado, porque
"onde está a minha credencial" é pergunta de tela (`in.credentials`) e a resposta não pode ser
"depende".

O servidor é o único leitor. Nenhuma rota devolve segredo, em nenhum estado da UI, nem
mascarado — só:

```json
{ "provider": "github", "scopes": ["repo:read"], "expires_at": "…",
  "fingerprint": "sha256:9f2a…", "state": "valid" }
```

A impressão existe para o operador conseguir dizer "é a mesma credencial de ontem" sem que
exista um caminho de código que devolva o valor.

### 3.2 O fluxo

Authorization Code + PKCE, com o loopback como redirect — que é o fluxo canônico para
aplicação nativa (RFC 8252) e é exatamente o que este servidor é.

1. **`POST /api/oauth/start {provider}`** (a barreira `Sec-Fetch-Site` já cobre esta rota como
   cobre `/api/config`). O servidor gera `code_verifier` e `state` com `secrets.token_urlsafe`,
   guarda em memória com TTL de 5 minutos, e devolve **apenas a URL de autorização**. A página
   faz `window.open` e não sabe mais nada.
2. **`GET /api/oauth/callback?code&state`** — o servidor compara o `state` com
   `hmac.compare_digest`, troca `code` por token em POST servidor-a-servidor via `urllib`
   (o padrão que `net.py` já usa), grava a credencial, e responde uma página mínima que se
   fecha. O `code` transita pela barra de endereços por um instante; é por isso que existem
   `state`, PKCE e TTL curto, e é por isso que o callback não devolve nada útil ao JavaScript.
3. **Renovação** por thread de fundo — o padrão do refresher de corpus de 60s já está no
   projeto. Falha de renovação marca a credencial como `expirada` e emite `notice`; não entra
   em retry infinito, porque provedor irritado revoga.

Restrições a declarar na tela em vez de descobrir na hora: alguns provedores exigem
`localhost` em vez de `127.0.0.1`, outros exigem HTTPS no redirect, e todos exigem a **porta
exata** registrada — o que significa que `ESPATIAL_PORT` deixa de ser detalhe local no momento
em que a primeira integração existe.

### 3.3 Como o agente usa sem ver o segredo

Duas rotas, e a escolha entre elas é a parte interessante.

**(a) MCP com ambiente injetado.** O espatial escreve um `--mcp-config` efêmero com o token no
`env` do servidor MCP e passa `--strict-mcp-config`. Já é suportado (`AGENT_MCP_CONFIG`
existe). Custo real: o token fica num arquivo temporário e/ou no ambiente de um subprocesso —
`0600`, apagado depois, e nunca no `argv`, que é visível em `ps`. É o caminho obrigatório para
MCP autenticado, porque o protocolo é do servidor MCP e não passa por aqui.

**(b) Ponte autenticada local — preferível quando o terceiro é REST.** O espatial expõe
`POST /api/bridge/<provider>/<path>` e injeta o `Authorization` do lado do servidor. O agente
recebe **apenas a URL local** e a alcança com `WebFetch`. Consequências, todas boas:

- o token nunca entra no contexto do agente, logo nunca vaza numa resposta nem num log de tool;
- cada chamada nasce no diário com provedor, caminho e escopo;
- revogar é apagar uma linha, sem reiniciar sessão nem reescrever config;
- o limite por execução (§2.7) tem onde ser aplicado.

Isto é a extensão de um princípio que o projeto já tomou e documentou: *"o browser fala com
`/api/tts`, não com o TTS"*. A regra completa passa a ser **o agente fala com a ponte, não com
o terceiro** — e a ponte é o único lugar do sistema onde um segredo é lido.

### 3.4 Webhooks de entrada

`POST /api/hook/<id>`, com segredo por endpoint gerado pelo servidor
(`secrets.token_urlsafe`), assinatura `X-Espatial-Signature: sha256=…` e comparação por
`hmac.compare_digest` — tempo constante, porque comparação de assinatura com `==` é o clássico.

**`Sec-Fetch-Site` não serve aqui**, e o motivo tem que estar escrito no código: o remetente é
um servidor, não um browser, e não preenche o cabeçalho. A barreira que protege `/api/ask` não
existe nesta rota. Logo o HMAC é obrigatório, não configurável, e endpoint sem segredo válido
não sobe.

Mais: rate limit por id; corpo com teto (o `MAX_BODY_BYTES` de 8192 já é o precedente);
política de efeito do §1 com `draw` como default; e cada recusa vira linha no diário — um
endpoint que recusa em silêncio é indistinguível de um endpoint que ninguém está usando.

**A nota de rede que evita uma tarde perdida:** `127.0.0.1` não recebe webhook da internet. Ou
o remetente é local (o próprio workspace, um script, o `hub`), ou existe um túnel. E se existe
túnel, **o bind em loopback deixou de ser a proteção que era** — o servidor não tem
autenticação, e agora tem endereço público. `sec.exposure` precisa detectar o cenário (presença
de `X-Forwarded-For`, `Host` diferente de localhost) e dizer isso em letra grande, porque é o
único momento em que a postura de segurança deste sistema muda de categoria.

---

## 4. Ordem de construção

Dois critérios, aplicados nesta ordem: **fundação primeiro** (o que o resto não consegue
existir sem), depois **valor visível por esforço**.

### Fase 0 — kernel (invisível, e tudo depende)

| # | Item | Esforço | Por que primeiro |
|---|---|---|---|
| 1 | Renomear `ROUTE_ROOT` para `core` | 2 linhas | `#/system` é inalcançável enquanto a constante se chamar `system` (§2.10) |
| 2 | Sub-rota no `parse()` → `{app, arg}` no `ctx` | ~10 linhas | endereço para estado; o diário e os arquivos precisam disso desde o primeiro dia |
| 3 | Órbita e tecla derivadas do manifesto/hash | ~15 linhas | colisão silenciosa de órbita e remapeamento de atalho pioram a cada app novo |
| 4 | `ctx` completo (`{app, route, arg, navigate, api, bus}`) | ~5 linhas | widget que importa `api` direto não pode virar pacote (§2.3) |
| 5 | Mover `navigate('files')` do router para o manifesto | ~10 linhas | política de app dentro do kernel é o acoplamento que o registry existe para evitar |

### Fase 1 — as três telas que já existem em dados

| # | Item | Esforço | Retorno |
|---|---|---|---|
| 6 | **`#/system`** | baixo | 90% dos dados já estão em `/api/health`, `permissions.describe()`, evento `brain` e `build_info`. É montar widgets, e responde a pergunta mais frequente do sistema. |
| 7 | **`#/security`** (painel `P` → destino) | baixo | o código existe; o ganho é uma verdade só, e abre espaço para `sec.reach` e `sec.exposure`, que são novos e são o que a tela antiga não mostrava |
| 8 | **`#/metrics`** | baixo-médio | 21 famílias já expostas, zero backend novo, um parser de ~60 linhas. Melhor razão valor/esforço do documento. |

### Fase 2 — auditoria (a fundação de que quase tudo depende)

| # | Item | Esforço | Retorno |
|---|---|---|---|
| 9 | **Diário no `recorder`** (JSONL, snapshot de flags, encadeamento) | médio | é dependência de `#/journal`, replay, negações, custo por dia, cotas e notices persistentes. **Antes de qualquer webhook** — sem isso o sistema aceita disparo externo que não registra. |
| 10 | **`#/journal` + `jr.replay`** | médio | replay é o maior efeito por linha: reemitir no barramento e a cena reencena sozinha. Custa uma flag `replay` para não recontar métrica. |
| 11 | **Registro de execuções + `POST /api/kill` + `#/activity`** | médio | resolve o problema real de N abas = N subprocessos e de custo invisível |

### Fase 3 — política

| # | Item | Esforço | Retorno |
|---|---|---|---|
| 12 | Fail-safe da config corrompida | trivial | corrige um fail-open que hoje resulta em `bypassPermissions` (§2.8) |
| 13 | Orçamento diário e limite de concorrência | baixo | o teto de custo é a única coisa entre um loop de tool call e a fatura |
| 14 | Drenagem no `SIGTERM` + registro de encerramento | baixo | responde depois "caiu ou eu fechei?" |
| 15 | `units.json` (desejado vs real) | baixo | transforma health em diagnóstico e habilita desabilitar `VOZ` antes de falhar |
| 16 | **`#/storage`** | médio | precisa de backend (tamanho, cobertura por grupo, comparação de nome de vetor). O widget de vetor esperado vs presente vale sozinho. |

### Fase 4 — mundo externo (só depois da Fase 2)

| # | Item | Esforço | Retorno |
|---|---|---|---|
| 17 | Webhooks de entrada: HMAC, política `draw`, fila em disco | médio | primeira porta de fora; exige diário e cotas prontos |
| 18 | OAuth + `/api/bridge` | alto | credencial de terceiro sem segredo na página nem no contexto do agente |
| 19 | **`#/integrations`** | médio | a tela sem 17 e 18 não tem o que mostrar |
| 20 | Capacidades com gate `PreToolUse` | alto | muda o modelo de permissão de nome para autoridade — e só faz sentido quando o diário já registra decisões |

### O que fica de fora, deliberadamente

Pacote instalável de terceiro (§1.1), notificações como tela (§2.5), painel de série temporal
(§1 `#/metrics`), autenticação de operador (§1 `#/security`). E `--resume` para continuidade de
conversa (§2.6) não está numerado acima porque é decisão de produto, não de tela: enquanto não
for tomada, `#/system` deve dizer com clareza que cada pergunta é uma sessão nova.

---

## 5. Esqueletos de manifesto

Concretos o suficiente para não haver ambiguidade na hora de escrever, e nada além disso.

```js
// src/apps/system/manifest.js
export default {
  id: 'system',
  name: 'SISTEMA',
  tagline: 'identidade, subsistemas e o comando efetivo',
  color: 0x8fb8ff,
  ring: 'introspection',        // o kernel resolve raio/fase a partir do id (§2.3)
  key: 's',
  widgets: [
    'sys.identity', 'sys.subsystems',            // left
    'sys.session', 'sys.command', 'sys.policy',  // right
    'core.prompt', 'core.timeline',              // strip — residentes
  ],
  // A câmera não se afasta do núcleo nesta tela: é dele que ela fala.
  camera: { keepCore: true },
  onEnter: (ctx) => ctx.api.health().then(/* … */),
};
```

```js
// src/apps/journal/manifest.js
export default {
  id: 'journal',
  name: 'DIÁRIO',
  tagline: 'toda execução, com a permissão que estava em vigor',
  color: 0xc7a3ff,
  ring: 'introspection',
  key: 'j',
  widgets: ['jr.denials', 'jr.spend', 'jr.runs', 'jr.detail', 'jr.replay',
            'core.prompt', 'core.timeline'],
  // `#/journal/r-2026-08-04-014` cai direto na execução (§2.10)
  onEnter: (ctx) => ctx.arg && ctx.bus.ui('journal.select', { run: ctx.arg }),
};
```

```js
// src/apps/integrations/manifest.js
export default {
  id: 'integrations',
  name: 'INTEGRAÇÕES',
  tagline: 'as portas que o mundo externo alcança',
  color: 0xff9a4d,
  ring: 'frontier',              // borda externa: é onde o de fora toca o sistema
  key: 'i',
  widgets: ['in.credentials', 'in.inbound', 'in.traffic', 'in.packages',
            'core.prompt', 'core.timeline'],
  claims: ['hook.inbound'],      // meteoro de webhook pertence a este corpo
};
```

```js
// Um widget. Não sabe em que app está, e é isso que o torna reutilizável.
registerWidget({
  id: 'sys.subsystems',
  title: 'SUBSISTEMAS',
  hint: '',                      // o host atualiza por setHint (ex.: "5/6")
  slot: 'left',
  grow: 1,
  mount(host, ctx) {
    const stop = ctx.bus.on('ui.health', (health) => render(host, health));
    const timer = setInterval(() => ctx.api.health(), 15_000);
    return { destroy: () => { stop(); clearInterval(timer); } };
  },
});
```
