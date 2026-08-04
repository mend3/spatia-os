# Protocolo de eventos

O contrato entre backend e interface. A cena 3D, a HUD, o áudio e as métricas assinam este
mesmo stream — nenhum deles sabe o que é Qdrant ou Ollama, todos sabem desenhar `state`,
`tool`, `memory`, `token`.

**A consequência que importa:** trocar o retriever, o modelo ou o provedor de busca não
muda uma linha de shader. E instrumentar um comportamento novo é emitir um evento novo — o
`recorder.py` é o único lugar que precisa saber contá-lo.

Transporte: SSE em `GET /api/ask?q=<pergunta>&web=0|1`, um JSON por linha `data:`.

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
| `done` | fim do stream | — | volta a ocioso |

`state` ∈ `thinking · retrieving · searching · answering · idle · error`.

`tool.kind` ∈ `filesystem · shell · browser · database · github · mcp · agent · planner ·
other` — é a cor, não o nome da ferramenta. O nome muda por instalação; a família não.

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
