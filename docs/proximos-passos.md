# O que está aberto — 2026-08-05

Documento único do que **ainda não foi feito**. O que foi entregue saiu daqui: o "porquê" de
cada decisão vive no comentário do código que a implementa, que é onde este projeto guarda
raciocínio. Três documentos de desenho foram apagados quando o desenho virou código
(`systray-notas.md`, `atalhos-ssot-notas.md`, `revisao-fidelidade-notas.md`) — as armadilhas que
eles carregavam estão hoje em `index.html`, `hud/systray.js`, `core/keys.js` e `space/rings.js`.

Tudo abaixo tem medida ou `arquivo:linha`. O que é estimativa está marcado como estimativa.

---

## 1. ~~Validar a extinção do anel~~ — FEITO em 2026-08-05, pela bancada

A bancada (`sandbox.html`) resolveu o que a cena não deixava: com o tempo congelado, um objeto
só e sem pós-processamento, a faixa escura sobre o astro aparece. `OPTICAL_DEPTH` saiu de 0,85
(palpite escolhido sem conseguir ver o efeito) para **2,0** — dentro da faixa real do anel B
(1,5–2,5), e escolhido vendo.

⚠️ **O anel continua visualmente ruim** por outro motivo: ele é uma faixa lisa com perfil de
densidade, sem granulação. Quatro candidatas estão na bancada (`src/sandbox/ring-variants.js`),
com a pesquisa e a recomendação em [`catalogo-celeste.md`](catalogo-celeste.md) e no relatório do
commit. **Falta escolher** — a comparação a 25px foi feita a olho, não com timer de GPU.

## 2. ~~Medir o custo do pós-processamento~~ — FEITO em 2026-08-05

`EXT_disjoint_timer_query_webgl2`, via `scene.sampleRenderCost()` (exposto em
`window.espatial.renderCost()`). Num Apple M5 a 3024×1484 com DPR 2, três leituras consistentes:

| | ms de GPU por quadro |
|---|---|
| cena inteira, sem pós-processamento | **0,45** |
| com a cadeia (lente + bloom + output) | **3,5 a 4,3** |
| fração do quadro que é pós-processamento | **87–90%** |

Mais forte do que a estimativa dizia: a cena praticamente não custa nada. Os perfis cortam no
lugar certo, e `pixelRatio` é de fato o parâmetro mais caro, porque é quadrático e multiplica
justamente a parte que domina. O número foi para o cabeçalho de `core/profiles.js`, no lugar da
estimativa.

Três medidas que NÃO respondem, todas tentadas antes: comparar FPS (a 105 FPS o loop está preso
no vsync), zerar `bloomStrength` (o passe continua rodando) e `gl.finish()` com relógio de parede
(neste driver não sincroniza — reportou 0,1ms para 4,5 megapixels, o que não é crível).

**Continua sem medida:** `advance()` com um corpus grande. O cabeçalho de `graph.js` chama ~468
sin/cos de "irrelevante" — agora com número, eles cabem dentro dos 0,45ms a 468 nós, mas ninguém
mediu a 5 000.

## 3. Dado que ainda chega ao browser e é descartado

O que já foi ligado saiu da lista. Continua vindo no fio e morrendo:

| Campo | Onde nasce | O que responderia |
|---|---|---|
| `session` | `brain.py:168` | correlacionar uma execução da tela com o log do CLI — hoje impossível |
| ~~`UpstreamError.status`~~ | `net.py` | **LIGADO em 2026-08-07.** O erro passou a carregar `reason` (decidido onde o fato existe) e os dois chegam ao corpo da resposta, à métrica e à timeline: `FALHA · TTS · CHAVE RECUSADA (401)` contra `FALHA · QDRANT · SERVIÇO FORA (503)`. Junto saíram dois defeitos que só apareceram puxando o fio: `recorder._reason` adivinhava o motivo pela FRASE (e por isso `http_client`/`http_server` eram rótulos sem escritor), e o handler genérico respondia 502 sem contar nada — um qdrant fora deixava `espatial_upstream_errors_total` em zero. Oráculo: `.cache/motivo-upstream.py` |
| ~~`detail` do `phase:"result"`~~ | `agent.py`, `brain.py` | **LIGADO em 2026-08-07.** O retorno de cada ferramenta aparece na linha dela (`→ 6 chunks`, `→ export const FOCUS_FIT_PX…`), um tom acima da ENTRADA que já era desenhada. Em falha ele é a mensagem do erro — a que mais sumia. |
| `tokens.in` / `cache_read` | `brain.py:264,266` | `answer.js` mostra só `out` e escreve "N tokens" |
| `depth`, `parent` | `graph.py` | o que sobra do payload da topologia sem consumidor — `sections`, `indexed_at` e `changed_at` foram para o painel `context` em 2026-08-05 |

## 4. i18n

Só o passo que não se desfaz foi dado: `plural()` em `hud/dom.js`, aplicado nos dois pontos que
concatenavam `(s)`. O resto **continua não recomendado agora**, e o motivo não é esforço.

São ~210 literais no cliente, mais servidor e docs. Mas o problema real é que os rótulos são
curtos e caixa-alta porque a HUD é hairline, e as réguas da systray, do `.config-key` (68px para
a tecla) e do `.headstat` foram dimensionadas para o português. Alemão e francês estouram 30–40%
em largura. i18n aqui é redesenhar largura, não trocar string.

Se um dia for feito, o que falta além do catálogo: datas (`toLocaleString('pt-BR')` espalhado) e
as mensagens que o servidor manda prontas no stream de eventos.

## 5. ~~Taxonomia de corpos celestes~~ — FEITO em 2026-08-05

Estão no céu: `planeta-anelado`, `cometa-extinto` (segunda janela de churn, 5 corpos hoje) e
`galaxia` (71 hubs, forma por concentração de massa). `supernova` DEIXOU de ser classe e virou
estado — como classe ela excluía as outras e tirava a superfície de 27 corpos.

**`lua` entrou em 2026-08-05**: as `sections` deixaram de ser payload sem consumidor e viram
corpos — 40 arquivos seguram **106 luas** em órbita ELÍPTICA, cada uma na sua banda radial, pela
janela Roche→Hill de `src/space/orbital-zones.js`. A não-colisão é demonstrada (bandas disjuntas, e
a inclinação não altera a distância ao pai), não estimada, e as 178 seções que não couberam são
reportadas na timeline em vez de sumirem — a contagem caiu de 278 quando o piso de legibilidade
passou a medir contra a órbita externa, que é quem fixa a distância da câmera. Quem
decide não é a massa e sim a RECÊNCIA (o `m^(1/3)` cancela na razão entre as duas fronteiras), então
a metade mais antiga do céu tem lua e a mais nova não.

O `status` de cada entrada em `src/space/catalog.js` é a fonte da verdade. Continua só declarado:
as zonas por razão de massa — embora `μ ≥ 5`, a fronteira delas, já esteja em uso como o corte que
separa lua de sistema duplo.

## 5b. ~~Planeta procedural — falta ligar ao céu e medir~~ — FEITO em 2026-08-05

Os quatro passos saíram: ligado ao `scene.js`, medido (`renderCost` com superfície cheia no
quadro: cena 0,61 ms, pós 87,6%), o shader compila (conferido lendo o `LINK_STATUS` do three.js,
não o silêncio do console), e o sprite cede pelo `haloOf` na mesma medida em que a superfície
aparece.

⚠️ O que fez a superfície aparecer não foi ligar — foi consertar o teto: o raio de MUNDO do corpo
saía do `gl_PointSize` capado em 511, então o tamanho aparente ficava preso em 153,3 px e
`LOD_NEAR_PX` (200) era inalcançável por aritmética. Ver `graph.js:starRadius`.

## 6. Mecanismos de sistema

Dez estão especificados em [`OS-SCREENS.md`](OS-SCREENS.md) §2, com a ordem de construção em §4.
São **projeto, não conserto** — cada um é uma decisão de produto antes de ser código.

Os três com melhor razão valor/custo, na minha leitura:

1. **§2.1 — capacidade em vez de lista de nomes.** Um hook `PreToolUse` apontando para
   `127.0.0.1:8787/api/gate` transforma a lista de permissões em política aplicada ANTES da
   chamada. O documento registra por que interceptar depois não vale: quando o `recorder` vê, o
   `Read` já aconteceu.
2. **§2.2 — desejado vs real.** `/api/health` só responde o real, então "TTS caiu" é
   indistinguível de "TTS nunca foi para ser usado aqui". Um `units.json` declarado responde
   *o que eu perco se o Ollama cair?*.
3. **§2.4 — ledger em vez de log.** Casa com o `core/session.js` que já sabe o que está aberto e
   qual foi o último gesto; falta a decisão ser gravada junto com a consequência.

---

## Duas lições de processo, para não repetir

**Comentário dentro de shader.** Duas armadilhas custaram três ciclos de compilação nesta
sessão: crase fecha o template literal do JS, e `*/` no meio de um comentário de bloco fecha o
comentário do GLSL (`M87` seguido de `*/` apagou o buraco negro inteiro da cena). Nas duas o
sintoma foi o mesmo — algo some da imagem e o erro fica só no console.

**Substituição sem âncora verificada.** Dois blocos inteiros se perderam em silêncio porque um
script de edição fez `replace` numa âncora que já tinha sido renomeada. Só apareceu como
`ORDER_SCATTER is not defined` na tela, graças à guarda fail-closed dos anéis. Afirmar a âncora
antes de substituir custa uma linha.
