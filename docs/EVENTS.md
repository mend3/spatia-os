# Protocolo de eventos

O contrato entre backend e interface. A cena 3D, a HUD, o áudio e as métricas assinam este
mesmo stream — nenhum deles sabe o que é Qdrant ou Ollama, todos sabem desenhar `state`,
`tool`, `memory`, `token`.

**A consequência que importa:** trocar o retriever, o modelo ou o provedor de busca não
muda uma linha de shader. E instrumentar um comportamento novo é emitir um evento novo.

Transporte: SSE, um JSON por linha `data:`, em **dois streams**.

| stream | vida | quem escreve |
|---|---|---|
| `GET /api/ask?q=<pergunta>&web=0\|1` | um ciclo, fecha no `done` | o agente |
| `GET /api/system-events` | enquanto a página viver | os webhooks e o vigia do `server/ambient.py` |

⚠️ **Quem conta cada stream é diferente, e confundir os dois deixa métrica em zero.** O
`recorder.py` envolve só o `/api/ask`; quem publica no stream do sistema contabiliza a si
mesmo (`webhooks.deliver`, `ambient._registrar`). Evento novo no stream do sistema que espere
o recorder nasce sem contador.

## Eventos

| `t` | Quando | Campos | Quem reage |
|---|---|---|---|
| `query` | abertura do ciclo | `text`, `web` | terminal limpa, timeline abre entrada |
| `state` | transição cognitiva | `state`, `label` | buraco negro muda de regime, drone muda de tom |
| `plan` | passos decididos | `steps[]` = `{id,label,target}` | HUD lista o plano |
| `tool` | ferramenta real do agente | `phase` (`call`/`args`/`result`), `tool`, `kind`, `id`, `detail`, `ok`, `ms` | wormhole abre na cor de `kind` |
| `memory` | chunks recuperados | `hits[]` = `{id,source,section,score,text,indexed_at}` | estrelas do grafo acendem |
| `sources` | numeração das citações | `sources[]` = `{n,kind,label,section,url}` | painel de fontes |
| `web` | satélite de busca | `phase` (`start`/`result`/`error`), `provider`, `results[]` | satélite liga, resultados caem como meteoros |
| `thought` | delta de raciocínio | `text` | trilha tênue de partículas |
| `token` | delta da resposta | `text` | texto aparece letra por letra |
| `cogload` | tokens de raciocínio | `tokens` (acumulado) | medidor de carga cognitiva |
| `brain` | agente inicializado | `session`, `cwd`, `model`, `tools`, `mcp[]` | HUD mostra o núcleo online |
| `limit` | janela de uso | `status`, `window`, `resets_at` | medidor de janela |
| `answer` | resposta completa | `text`, `ms`, `api_ms`, `turns`, `cost_usd`, `tokens{}`, `sources[]` | fecha a resposta, relaxa o som |
| `error` | falha de serviço | `service`, `message` | glitch/interferência |
| `notice` | o sistema mudou sem ninguém perguntar | `severity`, `topic`, `label`, `detail`, `at`, `action` (só em `warn`/`alert`) | cabeça da timeline: `warn`/`alert` ficam de pé, `info` escreve linha e apaga |
| `done` | fim do stream | — | volta a ocioso |

`state` ∈ `thinking · retrieving · searching · answering · idle · error`.

`tool.kind` ∈ `filesystem · shell · browser · database · github · mcp · agent · planner ·
other` — é a cor, não o nome da ferramenta. O nome muda por instalação; a família não.

## `notice` — o vocabulário do que acontece sozinho

`notice.severity` ∈ `info · warn · alert`, e o nível sai do que o operador PODE FAZER:

| nível | o que ele diz | `action` |
|---|---|---|
| `info` | mudou, e não há o que fazer — a tela estava afirmando outra coisa | **nunca** |
| `warn` | há o que fazer e **pode esperar**: nada na tela está errado agora, uma capacidade degradou | **sempre** |
| `alert` | há o que fazer **agora**: uma capacidade de que o operador depende parou de responder | **sempre** |

`notice.topic` ∈ `corpus · topology · index · graphdb · credential`. É a família do fato, como
`tool.kind` é a família da ferramenta — o que muda por instalação é o número no `detail`.

⚠️ **`notice` não aceita:** nível fora dos três; `warn`/`alert` sem `action`; `info` com
`action`. As três levantam em `ambient.notice`, antes de o evento existir — um aviso que não
nomeia o que fazer é a definição de ruído, e ruído ensina o operador a não ler a tela.

☠️ **Falha de serviço não é `notice`, é `error`.** `error` já tem leitor (o glitch) e já tem
métrica (`espatial_upstream_errors_total`). Publicar a mesma queda nos dois vocabulários faria
a tela contar duas vezes o que aconteceu uma.

**Um tópico tem no máximo UM aviso de pé.** `warn`/`alert` põe o tópico de pé; `info` no mesmo
tópico o apaga. Quem assina o `/api/system-events` recebe de saída os que estão de pé, com o
`at` original — abrir a página depois do boot não pode mostrar tela limpa sobre um índice
vencido, e o `at` é o que impede um aviso de ontem de parecer recém-nascido.

**Dispara por TRANSIÇÃO, nunca por relógio.** Cinco minutos parados só produzem `notice` se um
fato mudou; repetir o mesmo aviso a cada volta é o que a regra acima existe para impedir.
Fato que o sistema não sabe (Neo4j nunca configurado, ponto sem carimbo de data) **não vira
evento** — anunciá-lo seria afirmar sobre o que ninguém mediu.

**Onde ele vira pixel:** `src/hud/streams.js`, na CABEÇA da timeline. `warn`/`alert` ficam de
pé com `label`, `detail`, `action` e a idade tirada do `at`; `info` escreve uma linha de timeline
e apaga o aviso de pé do mesmo tópico. A severidade colore o que aconteceu, a idade colore há
quanto tempo (3d âmbar, 7d vermelho — a mesma rampa da célula ÍNDICE do cabeçalho).

⚠️ **`warn`/`alert` NÃO escrevem linha de timeline.** A reposição dos de pé acontece a cada
assinatura, e `api.watchSystem` reconecta com backoff: uma linha por entrega faria de toda queda
de rede uma repetição do mesmo aviso. A reentrega é reconhecida pelo par (`topic`, `at`) — mesmo
fato, zero pixel novo.

☠️ **A reconexão não sabe o que foi APAGADO enquanto esteve fora.** A reposição só carrega os de
pé; um `info` emitido durante a queda não é reentregue, e o aviso correspondente fica na tela
envelhecendo. Fechar isso é a assinatura se ANUNCIAR no barramento (`core/api.js`), para o bloco
ser reconstruído a partir da reposição em vez de acumulado.

## Regras que o protocolo impõe

**Emitir no instante, não no fim.** Cada passo é um gerador que dá `yield` enquanto
trabalha. Acumular eventos numa lista e devolvê-los junto quebra a medição: numa versão
anterior o estágio `retrieve` marcou 0,2ms (o tempo do loop de `yield`) para um trabalho de
8ms. A métrica denunciou o erro — o `docs/METRICS.md` conta o caso.

**Falha é evento, não exceção.** Um provedor de busca fora do ar emite `web.error` e o
ciclo continua; Qdrant fora do ar emite `error` e o agente responde sem contexto
recuperado. Só `done` encerra.

**`[n]` na resposta aponta para `sources[n]`.** A numeração do prompt e a da HUD são a
mesma lista (`agent.sources_of`). Citação que não bate com a fonte é decorativa, e uma
resposta decorativamente citada é pior que uma sem citação: parece verificável.

## Eventos locais da UI

Nascem no browser, nunca no backend, e usam o prefixo `ui.` (`bus.ui('select', {...})`).
Servem para clique em nó, modo cinematográfico e destravamento do áudio — coisas que a cena
e a HUD precisam compartilhar sem se conhecerem.
