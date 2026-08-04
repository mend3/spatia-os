# Revisão de fidelidade e correção — achados de 2026-08-04

Três revisões independentes rodaram sobre a entrega dos anéis (fidelidade visual, oportunidades
de dado, verificação adversarial). Este arquivo é o **registro dos achados**, não a spec do
conserto. O que já foi corrigido está marcado; o resto é fila com evidência.

Pedido do usuário que originou isto:

> após cada entrega da lista, faça uma revisão de UI no código para aferir que o código cria
> objetos que emulam fielmente. texturas, shaders, tudo permitido o quanto necessário. […] a
> intenção é prever/capturar ideias/correções/melhorias que eu possa ter deixado passar.

---

## Já corrigido nesta sessão

| # | Achado | Onde |
|---|---|---|
| ✅ | `graphSpread` escalava o anel e não a estrela (oscilação de 8× no slider) | raio da estrela agora é CALCULADO em `graph.js:starRadius` |
| ✅ | Estrela acesa inflava até ~4× e engolia o próprio anel | `starRadius` usa a mesma expressão de `pulse` do shader |
| ✅ | `STAR_RADIUS = 0.39` valia para um monitor só (varia ~4× com `H×DPR` e com o fov) | idem — entram `camera.fov` e `canvas.height` reais |
| ✅ | `gl_PointSize` satura no teto da GPU (medido: **511px**) e a geometria do anel não | `POINT_SIZE_CAP` espelha o teto |
| ✅ | Anel ancorado no limbo dava um sistema 4.9× mais largo que o astro — fiel e inutilizável | `FOOTPRINT` fixa a borda EXTERNA no sprite; proporções internas seguem reais |
| ✅ | Gradiente de profundidade **invertido** e igual nas três famílias | `uForward`: gelo retroespalha (Saturno/Urano), poeira espalha para frente (Júpiter) |
| ✅ | 45% dos téxeis do perfil descreviam o interior do planeta; Encke e Urano ficavam abaixo de 1px | perfil vai do limbo ao `reach`; `uRadial` remapeia |
| ✅ | Sem mipmap, minificação de ~40:1 fazia a estrutura fina CINTILAR | `LinearMipmapLinearFilter` |
| ✅ | Falha do `/api/dirty` deixava o céu afirmando "ALTERADO" indefinidamente | `forgetDirty()` — fail-closed |
| ✅ | 200 sem `files` virava "ÁRVORE LIMPA" em verde | validação de fronteira em `watchDirty` |
| ✅ | Estado desconhecido pintava anel de `modified` e o rótulo CALAVA | rótulo cai para o estado cru em maiúsculas |
| ✅ | Sonda de 15s igual ao TTL de 15s → atraso de pior caso de 30s | sonda a 6s |
| ✅ | Erro de import deixava a tela de boot congelada para sempre, sem dizer nada | guarda clássica em `index.html` + `catch` do `main` escrevendo na tela |
| ✅ | `#boot button` (órfão do ENGATAR) tinha especificidade de ID e vencia o primitivo `.btn` | removido; `.btn[data-size="lg"]` entrou no primitivo |
| ✅ | Anel de foco AZUL do browser sobre a paleta âmbar | `.btn:focus-visible` na cor do sistema |

---

## Correção — bugs que fazem código existente nunca funcionar

Custo P cada um. Valor por linha maior que qualquer feature nova.

1. **ENTREGAS RECENTES congelado para sempre.** `webhooks.py:150-157` põe `origin:"webhook"`
   só no evento `phase:"call"`; `apps/index.js:474` exige `origin==='webhook' && phase==='result'`
   — condição **impossível**. E o widget não tem `setInterval`: depois do `draw()` inicial nunca
   mais atualiza.
2. **Ferramentas internas nunca fecham a linha na HUD.** `agent.py:205-218` emite eventos `tool`
   **sem `id`**; `streams.js:91` só guarda `if (event.id)`. `qdrant.query`, `web.search` e
   `ollama.generate` abrem linha com `···` e morrem — sem `ok`, sem `ms`. Torna o ramo
   `${event.ms}ms` de `streams.js:107` código morto nos dois cérebros. Pior em `state.js:83`:
   com `BRAIN=ollama`, `id: undefined` casa consigo mesmo e o primeiro `result` fecha TODAS.
3. **`Esc` não cala a voz.** `voice.js:161` assina `on('ui.cancel', stop)` e **nada emite
   `ui.cancel`**. Abortar deixa o TTS lendo a resposta abandonada.
4. **Guarda de auto-repeat com corpo vazio.** `keys.js:72-75`: o `if` tem só um comentário
   dentro. Segurar `P`/`V`/crase alterna o painel na taxa de auto-repeat.
5. **`/api/file` vivo e inalcançável.** Rota (`app.py:248`), barreira de raízes (`files.py:19-44`)
   e cliente (`api.js:26`) sem nenhum chamador. Os dois leitores usam `/api/node`, que devolve
   **só os chunks indexados** — o operador lê a foto do índice enquanto o anel ao lado diz que o
   arquivo mudou. É a divergência mais direta entre tela e disco. (M)
6. **`dirty.annotate()` sem chamador** (`dirty.py:136-148`). Função morta.

## Correção — no servidor, que o anel expôs

7. **`git status` não desescapa `core.quotePath`** (`dirty.py:87-90`). Acento vira
   `cora\303\247\303\243o.md` e `rename` com aspas vira `"plain space2.md`. Nenhum casa com
   `byPath` → **sem anel**, e a nota afirma "FORA DO ÍNDICE" sobre arquivo indexado. Num
   workspace PT-BR isto acontece todo dia. Conserto: `-z` (sem quoting) ou `--porcelain=v2`.
8. **Submódulo aninhado invisível.** `_roots` (`dirty.py:41-67`) lê só o `.gitmodules` da base.
   `core/oracle` tem o seu (`shared/mcp`) e há **7 nós de arquivo** sob ele hoje.
9. **`AGENT_CWD` vazio desliga a feature em silêncio.** `dirty.py:48` não tem o
   `or config.ROOT` que os irmãos usam (`catalog.py:44`, `mcp_scopes.py:48`, `brain.py:110`),
   e o `.env.example:9` vem vazio. `/api/dirty` responde `{}` para sempre: sem anel, sem nota,
   sem erro. Copiar o `or config.ROOT` **não** resolve (varreria o repo errado) — o servidor
   precisa dizer "sem raiz" e o cliente distinguir isso de "nada sujo".

## Instrumentação que afirma o que não mede

10. `"mcp"` fora do enum `ROUTES` (`metrics.py:35-38`) → cai em `other`, exatamente o que o
    comentário de `metrics.py:33-34` diz temer.
11. `cache_creation` declarada (`metrics.py:56`) e nunca amostrada (`recorder.py:177`) — e é
    sobre ela que a tabela de custo de `permissions.py:55-62` argumenta.
12. `kind:"llm"` (`agent.py:47`) não existe em `TOOL_COLORS` nem em `TOOL_KINDS` → cinza nos dois.
13. **`CORPUS` mostra dois números diferentes na mesma tela**: `frame.js:106` escreve chunks no
    cabeçalho, `frame.js:171` sobrescreve o medidor com nós. Ambos rotulados `CORPUS`.
14. `client_fps`: `app.py:200` usa `if payload.get("fps")` → **`fps == 0` é falsy e some**. É
    justamente a aba travada que `metrics.py:16-17` diz querer pegar.

## Promessas escritas no código que a tela não cumpre

15. `state.recovered` (`permissions.py:94-96`) — "a UI mostra o aviso": não existe em `src/`.
16. `partial: True` (`mcp_scopes.py:132-133`) — "a tela precisa saber que a lista não é o total":
    a tela usa frase fixa (`apps/index.js:568`).
17. `keys.hints()` (`keys.js:89-91`) — o docstring promete barra de dicas derivada dos atalhos
    registrados; **sem chamador**, e `index.html` traz a barra fixa. → **é o item 5 da fila.**
18. `perms.reload()` sem chamador e `createPermissions(hud)` sem `onChange` (`main.js:75`):
    trocar a fonte de settings não recarrega o painel de MCP — contrariando o motivo declarado
    em `app.py:223-225` para a rota `/api/mcp` existir separada.
19. `graph.labelCandidates()` (`graph.js`) **sem chamador**: rótulo DOM para estrelas nunca foi
    ligado. `MAX_LABEL_DISTANCE` existe só para alimentá-la.
20. `voice_ok and blend_ok` fundidos (`app.py:310`) → a tela manda checar a variável errada.

## Dado que chega ao browser e é descartado

Do payload de `/api/graph`: `sections`, `depth`, `repo`, `dir`, `parent`, `indexed_at`, e o
bloco `stats` inteiro (`graph.py:112-119`) — **incluindo `stats.kinds` e `stats.repos`, dois
histogramas prontos que nenhuma tela desenha**, enquanto `sky-time.js:59-67` reconta à mão.

Descartados também: `api_ms` (`brain.py:260`), `session` (`brain.py:168` — impossível
correlacionar uma execução da tela com o log do CLI), `tokens.in`/`cache_read`,
`health.qdrant.vectors`/`.sparse` (`qdrant.py:50-51` — exatamente o dado que diagnosticaria
"busca devolve vazio sem erro"), `UpstreamError.status` (`net.py:22` — 401 e 503 viram o mesmo
502) e o `detail` dos `phase:"result"`, **inclusive o conteúdo devolvido por cada tool_result**,
que trafega até 220 chars e é jogado fora em `streams.js:95-101`.

---

## Fidelidade — o que a cena ainda não emula

Nenhum destes custa mais que ~0.1 ms de GPU. Ordenados por impacto na percepção.

21. **Beaming relativístico do disco é um hotspot orbitando, não um crescente.**
    `blackhole.js:115-116`: `flow` contém `uTime`, então o lobo brilhante circula o disco e
    ainda cisalha com a taxa kepleriana. O beaming real é **estático no referencial do
    observador** — é a assimetria do EHT (M87*, Sgr A*). E o contraste está 5× fraco (1.76:1
    contra os ~5:1 a 10:1 observados). Conserto: uniform `uViewAz` e
    `D = 1/(γ(1−β·μ))`, `brilho ∝ D^3.5`; remover o `rotation.y` de `blackhole.js:206`, que
    ainda soma rotação de corpo rígido por cima da diferencial.
22. **As "órbitas inclinadas" são círculos horizontais.** `graph.js` (`advance`) e
    `satellites.js:156-161` escrevem `y = sin(inclination)·radius`, **constante em `angle`**:
    o nó nunca cruza o plano. Órbita inclinada de verdade cruza duas vezes por revolução. Efeito
    colateral: o raio efetivo dos satélites cai de 74 para ~54 u — eles orbitam **dentro** da
    casca de arquivos. Conserto de 3 linhas: `[x, z·sin(inc), z·cos(inc)]`.
23. **O disco satura em branco e o perfil radial é chapado.** `blackhole.js:112`: no regime
    `answering` o brilho linear chega a ~4–5.5, e `ACES(4.2)=0.976` contra `ACES(2.8)=0.945` —
    `uHot` e `uMid` renderizam ambos como branco. A rampa de temperatura só sobrevive na metade
    externa. Além disso o piso de `0.5` mantém 16% do pico em todo o disco externo, quando
    Shakura–Sunyaev dá `brilho ∝ r⁻³`. Conserto: `flux = pow(r/r_in, -3.0)`, pico linear entre
    1.2 e 2.0.
24. **A lente usa 1/d² onde a física dá 1/d.** `lensing.js:53`. Massa pontual desloca a imagem
    por `θ_E²/θ`. Com o quadrado o efeito vira um borrão colado no horizonte e some fora dele —
    perde-se o "campo estelar inteiro sutilmente torcido", que é o que faz uma lente ler como
    lente. Conserto: trocar o expoente e re-afinar `lensStrength` (0.28 → ~0.9).
25. **A sombra do buraco negro é 2.6× menor do que deveria.** Para Schwarzschild a sombra
    aparente tem raio `√27/2 ≈ 2.6 R_s` e o anel de fótons fica na borda dela — não 16% fora
    (`lensing.js:62,65`). A ISCO aparente cai em `1.41×` o raio da sombra, não `1.08×`
    (`blackhole.js:40`). São três constantes.
26. **A distribuição espectral do céu está invertida.** `stars.js:95`: `pow(random(), 1.7)`
    empurra para o índice 0, que é o AZUL — **40% do campo é O/B**, contra ~0.7% reais (e ~30%
    no céu a olho nu, já enviesado por luminosidade). O comentário pede o contrário. Conserto de
    uma linha: expoente `0.45`. Faltam ainda: cor de corpo negro real (Planck→sRGB), correlação
    cor↔brilho (hoje sorteadas independentes), e a **banda galáctica** — a casca é uniforme, não
    existe Via Láctea, e ela é a feição dominante de qualquer céu escuro.
27. **Corpos sólidos sem sombreamento nenhum.** `bodies.js:81` e `satellites.js:102` usam
    `MeshBasicMaterial`: todas as faces com a mesma cor. Consequência direta — as rotações de
    `bodies.js:159-161` são **invisíveis**, porque não há gradiente para revelar o giro. O
    comentário justifica com "não há luz na cena"; a conclusão certa era a oposta, já que o
    núcleo É a fonte. Um lambert de ponto único na origem (12 linhas) faz o giro aparecer e dá
    aos corpos um lado voltado para o buraco negro.
28. **A hierarquia radial anunciada não existe nos defaults.** `bodies.js:5-7` declara
    "núcleo, apps, conhecimento, satélites, fundo", mas **62% da casca do fundo estelar
    (68–110 u) está interpenetrada com os nós do grafo** — e ambos são sprites aditivos de
    tamanho e paleta parecidos. Nessa faixa não há como distinguir conhecimento de fundo, que é
    a função da cena.
29. **Anel sem oclusão e sem extinção** (`rings.js`). A metade distante deveria sumir atrás do
    limbo e reaparecer — é a pista número um de que aquilo é 3D e não decalque. E a metade
    próxima deveria ESCURECER o astro (o anel B tem τ≈1.5–2.5), não somar luz. Exige um segundo
    passe multiplicativo. Fica registrado, não feito.

---

## Supernova — a proposta do usuário

> calcular nos últimos 10 commits os arquivos que mais foram modificados. arquivos com pelo
> menos 5 alterações viram "supernova" e a intensidade se dá num cálculo usando a quantidade de
> alterações desse arquivo nos últimos 10 commits.

Avaliada e **aprovada como o melhor valor/custo do lote**. Pontos do desenho a preservar:

- O dado já é lido: `recency.py` percorre o histórico do git por raiz (inclusive submódulos).
  O churn sai da MESMA passada — não precisa de um segundo `git log`.
- **Não pode disputar pixel com `aIgnition`.** "Supernova" (estado durável do repositório) e
  "nó aceso pela busca" (evento) são dois canais no mesmo ponto. A saída desenhada: a supernova
  vira uma **casca anular** ortogonal à ignição, não mais brilho no núcleo do sprite.
- Janela por TEMPO, não por contagem de commits: 10 commits são um dia num dia agitado e um mês
  num calmo, e a mesma feature mudaria de significado sozinha.
- Riscos a filtrar: lockfile/CHANGELOG com 50 alterações, commit de merge, renomeação.
