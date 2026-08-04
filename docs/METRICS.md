# Métricas

Exposto em `GET /metrics`, formato Prometheus 0.0.4, sem `prometheus_client` — as primitivas
estão em `server/promex.py` (~180 linhas de stdlib).

## A ideia central

**As métricas derivam do mesmo stream de eventos que desenha a tela.**

O `recorder.instrument()` envolve o gerador do ciclo cognitivo: repassa cada evento intacto
para o SSE e contabiliza de lado. Não existe um segundo caminho de instrumentação espalhado
pelo código.

A propriedade que isso garante é prática: **se a HUD mostrou uma chamada de ferramenta, o
contador dela subiu.** Se o contador não subiu, a HUD também não mostrou. Não há como
divergirem, e não há como esquecer de instrumentar um caminho novo — instrumentar é emitir um
evento, e o `recorder.py` é o único lugar que precisa saber contá-lo.

## Duas regras de construção

**Cardinalidade é declarada, não descoberta.** Cada métrica lista os valores aceitos por
label; valor fora da lista cai em `other` em vez de criar série nova. Nome de servidor MCP, id
de `tool_use`, caminho de arquivo e texto de pergunta **nunca** viram label. A exceção
tolerada é `tool` (o nome da ferramenta): o conjunto é limitado pelas ferramentas instaladas,
e saber que `Read` domina as chamadas vale a série.

**Scrape não faz trabalho.** Toda escrita acontece no evento; `render()` só formata o que já
está em memória. Nenhuma métrica chama upstream durante o scrape — os gauges de corpus são
alimentados por um refresher de 60s em background. Qdrant fora do ar não transforma
`/metrics` em timeout.

## As quatro perguntas que este catálogo existe para responder

**1. A resposta demorou — onde?**
`espatial_ask_stage_duration_seconds{stage}` separa `retrieve`, `websearch`, `reason` e
`synthesize`. Sem isso, "está lento" é indistinguível entre embedding na CPU e um modelo
remoto pensando. Medição de uma execução real: retrieve 0,076s · reason 18,4s · synthesize
6,7s — o raciocínio é o custo, e ele era invisível.
`espatial_ask_ttft_seconds` é a latência que o operador de fato sente.

**2. O índice apodreceu?**
`espatial_index_age_seconds` e `espatial_index_files_by_kind{kind}`. Este é o modo de falha
silenciosa que já aconteceu neste ecossistema: a busca continua respondendo, só que sobre um
corpus velho ou incompleto, e não há erro nenhum para ninguém notar.
`espatial_retrieval_hits` com bucket `le=0` é o irmão disso: recuperação vazia devolve 200 e
parece sucesso.

**3. Quanto custou?**
`espatial_agent_cost_usd_total{model}`, `espatial_agent_tokens_total{model,kind}`,
`espatial_agent_turns` e `espatial_agent_thinking_tokens_total`. Um agente com ferramentas
gasta em loop de tool call, não em texto — e os tokens de raciocínio não aparecem na resposta.
`espatial_rate_limit_resets_at_seconds{window}` alimenta o medidor de janela na HUD.

**4. A tela aguenta?**
`espatial_client_fps` e `espatial_client_long_frames_total`, vindos de um beacon do browser a
cada 10s. É um app 3D: 400 nós a 20fps é regressão de produto, e o servidor jamais saberia
disso sozinho. `espatial_client_boot_total{outcome}` separa `no_webgl` de `error`.

## Catálogo

### Meta
| Métrica | Tipo | Labels |
|---|---|---|
| `espatial_build_info` | gauge | `version`, `brain`, `model` |
| `espatial_process_start_time_seconds` | gauge | — |
| `espatial_process_resident_memory_bytes` | gauge | — |
| `espatial_process_cpu_seconds_total` | counter | — |

### HTTP
| Métrica | Tipo | Labels |
|---|---|---|
| `espatial_http_requests_total` | counter | `route`, `status` |
| `espatial_http_request_duration_seconds` | histogram | `route` |

`route` é um enum fechado (`ask`, `search`, `graph`, `node`, `file`, `health`, `metrics`,
`client`, `static`) — o path cru como label é o jeito clássico de explodir um `/metrics`.
`/api/ask` fica **fora** do histograma de latência: é stream de dezenas de segundos e
empurraria toda rota curta para o primeiro bucket.

### Ciclo cognitivo
| Métrica | Tipo | Labels |
|---|---|---|
| `espatial_ask_total` | counter | `brain`, `outcome` (`success`/`error`/`aborted`) |
| `espatial_ask_active` | gauge | `brain` |
| `espatial_ask_duration_seconds` | histogram | `brain` |
| `espatial_ask_ttft_seconds` | histogram | `brain` |
| `espatial_ask_stage_duration_seconds` | histogram | `stage` |
| `espatial_ask_web_total` | counter | — |

`aborted` cobre o browser fechando a conexão no meio. O `finally` do `instrument()` é o que
garante isso — sem ele, `ask_active` vazaria para sempre.

### Recuperação
| Métrica | Tipo | Labels |
|---|---|---|
| `espatial_retrieval_hits` | histogram | — |
| `espatial_retrieval_top_score` | histogram | — |
| `espatial_embed_duration_seconds` | histogram | — |
| `espatial_qdrant_duration_seconds` | histogram | `op` |

⚠️ `retrieval_top_score` é score de fusão RRF: **não é comparável entre consultas em valor
absoluto**. Serve como sinal de deriva da distribuição, não como qualidade por si.

### Ferramentas, custo e upstream
| Métrica | Tipo | Labels |
|---|---|---|
| `espatial_tool_calls_total` | counter | `tool`, `kind`, `outcome` |
| `espatial_tool_duration_seconds` | histogram | `kind` |
| `espatial_agent_cost_usd_total` | counter | `model` |
| `espatial_agent_tokens_total` | counter | `model`, `kind` |
| `espatial_agent_thinking_tokens_total` | counter | — |
| `espatial_agent_turns` | histogram | — |
| `espatial_rate_limit_allowed` | gauge | `window` |
| `espatial_rate_limit_resets_at_seconds` | gauge | `window` |
| `espatial_websearch_total` | counter | `provider`, `outcome` |
| `espatial_websearch_duration_seconds` | histogram | `provider` |
| `espatial_websearch_results` | histogram | `provider` |
| `espatial_upstream_up` | gauge | `service` |
| `espatial_upstream_errors_total` | counter | `service`, `reason` |

`kind` é a família de cor do briefing (`filesystem`, `shell`, `browser`, `database`, `github`,
`mcp`, `agent`, `planner`, `other`) — a mesma que pinta o wormhole na cena.

⚠️ `upstream_up` é observação de **tráfego real**, não sonda sintética: fica velha se ninguém
usar o serviço. A rota `/api/health`, que a UI consulta periodicamente, é o que a mantém
fresca na prática.

### Corpus, grafo e cliente
| Métrica | Tipo | Labels |
|---|---|---|
| `espatial_index_points` · `espatial_index_files` | gauge | — |
| `espatial_index_files_by_kind` | gauge | `kind` |
| `espatial_index_age_seconds` | gauge | — |
| `espatial_graph_nodes` · `espatial_graph_edges` | gauge | — |
| `espatial_graph_build_duration_seconds` | histogram | — |
| `espatial_client_fps` | histogram | — |
| `espatial_client_long_frames_total` | counter | — |
| `espatial_client_boot_total` | counter | `outcome` |
| `espatial_client_nodes` · `espatial_client_audio_enabled` | gauge | — |

## Buckets

Três escalas distintas, e reaproveitar uma entre elas é o erro que torna o histograma inútil
(ou tudo cai no primeiro bucket, ou tudo cai no `+Inf`):

- **FAST** `0.005 … 5` — embedding, Qdrant, rotas curtas
- **SLOW** `0.1 … 300` — ciclo, estágios, ferramentas, provedores
- **TTFT** `0.25 … 34` — tempo até o primeiro token

## Um caso real: a métrica que achou o próprio bug

Na primeira execução instrumentada, `ask_stage_duration_seconds{stage="retrieve"}` marcou
**0,16ms** para uma recuperação que o `tool` correspondente media em **8ms**.

A causa era o `_step_memory` construir uma lista de eventos e devolvê-la no fim: quando o
recorder via `state: retrieving`, o trabalho já havia terminado, e o estágio media só o loop
de `yield`. Além disso, a soma dos estágios dava 1,4s numa execução de 10,7s — o tempo de
raciocínio não tinha dono.

As duas correções: passo virou gerador que emite em tempo real, e `thinking` ganhou o estágio
`reason`. Está registrado aqui porque é o argumento de que este catálogo não é decorativo — e
porque a tentação de acumular eventos numa lista vai voltar.
