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

~~**Continua sem medida:** `advance()` com um corpus grande.~~ → **MEDIDO em 2026-08-07**, com
`createGraph()` fora da cena e corpus sintético (média de 120 quadros, após 30 de aquecimento):

| nós | `update()` por quadro |
|---|---|
| 468 | 0,017 ms |
| 1 843 (corpus real) | 0,049 ms |
| 5 000 | 0,137 ms |
| 10 000 | 0,278 ms |

Linear, ~28 ns por nó. A 5 000 são **0,8% de um quadro de 60 Hz**, contra os 0,45 ms de GPU da cena
inteira e os 3,5–4,3 ms do pós-processamento. "Irrelevante" era a palavra certa, e agora tem
número.

## 3. Dado que ainda chega ao browser e é descartado

O que já foi ligado saiu da lista. Continua vindo no fio e morrendo:

| Campo | Onde nasce | O que responderia |
|---|---|---|
| ~~`session`~~ | `brain.py` | **LIGADO em 2026-08-07.** A linha do núcleo na timeline passou a ler `NÚCLEO ONLINE · claude-opus-5 · 14 FERRAMENTAS · a1b2c3d4` — oito caracteres bastam para grepar o log do CLI e cabem na régua da HUD. O id inteiro, o modelo, o `cwd` e os MCP vão no `title` da linha, que é copiável: é o único lugar onde 36 caracteres cabem sem quebrar a HUD. |
| ~~`UpstreamError.status`~~ | `net.py` | **LIGADO em 2026-08-07.** O erro passou a carregar `reason` (decidido onde o fato existe) e os dois chegam ao corpo da resposta, à métrica e à timeline: `FALHA · TTS · CHAVE RECUSADA (401)` contra `FALHA · QDRANT · SERVIÇO FORA (503)`. Junto saíram dois defeitos que só apareceram puxando o fio: `recorder._reason` adivinhava o motivo pela FRASE (e por isso `http_client`/`http_server` eram rótulos sem escritor), e o handler genérico respondia 502 sem contar nada — um qdrant fora deixava `espatial_upstream_errors_total` em zero. Oráculo: `scripts/motivo-upstream.py` |
| ~~`detail` do `phase:"result"`~~ | `agent.py`, `brain.py` | **LIGADO em 2026-08-07.** O retorno de cada ferramenta aparece na linha dela (`→ 6 chunks`, `→ export const FOCUS_FIT_PX…`), um tom acima da ENTRADA que já era desenhada. Em falha ele é a mensagem do erro — a que mais sumia. |
| ~~`tokens.in` / `cache_read`~~ | `brain.py` | **LIGADO em 2026-08-07.** A linha de metadados passou a ler `9,1k → 450 tokens · 21,4k de cache` em vez de "450 tokens" — o `out` sozinho é o menor dos três numa execução com contexto, e sem entrada e cache o `$` ao lado não se explica. `compact()` em `hud/dom.js` encurta os milhares. |
| ~~`depth`, `parent`~~ | `graph.py` | **CORTADOS em 2026-08-07**, e a saída foi essa mesmo: nenhum leitor no cliente NEM no servidor. E `parent` era pior que morto — ele duplicava a ARESTA que já afirma o mesmo parentesco, 1.843 vezes. Duas fontes para a mesma verdade é o defeito que este projeto persegue; esta nem chegou a divergir porque o campo estava morto. `SCHEMA_VERSION` 5 → 6. |

## 3b. Fixture paramétrico — o espaço de parâmetros não é coberto

O fixture cobre TODO tipo de corpo e quase nenhuma variação deles: cometa com coma e cauda no
piso, farol da estação em zero nas quatro, manchas da fotosfera em zero na mediana, cavidade da
nebulosa saturada no teto nas duas. E quatro sistemas inteiros nunca entram em cena — atividade do
cometa, farol, envoltório de supernova e o sistema de luas Roche→Hill.

A causa é comum e o conserto é barato: **dois knobs** — número de commits por arquivo (que vira
`node.churn`) e número de títulos no corpo (que vira `node.sections`) — destravam os quatro. A
tabela de causa e o alvo de cobertura estão em [`cobertura.md`](cobertura.md).

⚠️ Regenerar o fixture destrói o corpus de teste em uso; avise antes.

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
