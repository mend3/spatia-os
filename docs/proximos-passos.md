# O que está aberto — 2026-08-05

Documento único do que **ainda não foi feito**. O que foi entregue saiu daqui: o "porquê" de
cada decisão vive no comentário do código que a implementa, que é onde este projeto guarda
raciocínio. Três documentos de desenho foram apagados quando o desenho virou código
(`systray-notas.md`, `atalhos-ssot-notas.md`, `revisao-fidelidade-notas.md`) — as armadilhas que
eles carregavam estão hoje em `index.html`, `hud/systray.js`, `core/keys.js` e `space/rings.js`.

Tudo abaixo tem medida ou `arquivo:linha`. O que é estimativa está marcado como estimativa.

---

## 1. Validar a extinção do anel

Implementada e **não confirmada visualmente** (`space/rings.js`, `EXTINCTION_FRAGMENT`). O anel B
tem τ≈1.5–2.5: passando na frente do astro ele é uma faixa ESCURA, e com blending aditivo o
desenho fazia o oposto. Entrou um segundo passe multiplicativo com Beer-Lambert.

Verificado: o shader compila, não há erro de console, o FPS não mudou (120). **Não verificado:**
se o efeito aparece e se `OPTICAL_DEPTH = 0.85` é o valor certo. Uma tentativa de A/B ligando e
desligando não concluiu — os dois astros comparados eram diferentes e a cena se move entre os
quadros. Precisa de um olhar humano parado, com um arquivo sujo e a câmera travada nele.

## 2. Medir o custo do pós-processamento

Os três perfis de qualidade (`core/profiles.js`) foram montados a partir do que domina o
orçamento de quadro por razão **estrutural** — `pixelRatio` é quadrático, a cadeia são três
passes de tela cheia, o bloom borra em várias resoluções. Medição comparativa não existe.

É ela que diria se `EQUILIBRADO` está no lugar certo entre `MÍNIMO` e `PLENO`. O
`performance_start_trace` do DevTools resolve em minutos, e o resultado deve voltar para o
comentário de `profiles.js`, que hoje declara a estimativa como estimativa.

Junto, o que continua sem medida: `advance()` com um corpus grande (o cabeçalho de `graph.js`
chama ~468 sin/cos de "irrelevante" — plausível a 468 nós, nunca medido a 5 000).

## 3. Dado que ainda chega ao browser e é descartado

O que já foi ligado saiu da lista. Continua vindo no fio e morrendo:

| Campo | Onde nasce | O que responderia |
|---|---|---|
| `session` | `brain.py:168` | correlacionar uma execução da tela com o log do CLI — hoje impossível |
| `UpstreamError.status` | `net.py:22` | 401 de chave inválida e 503 de serviço fora viram o mesmo 502 |
| `detail` do `phase:"result"` | `agent.py`, `brain.py` | o conteúdo devolvido por cada tool_result, até 220 chars, descartado em `streams.js` |
| `tokens.in` / `cache_read` | `brain.py:264,266` | `answer.js` mostra só `out` e escreve "N tokens" |
| `sections`, `depth`, `parent`, `indexed_at` | `graph.py` | ~23% do payload da topologia, sem consumidor |

## 4. i18n

Só o passo que não se desfaz foi dado: `plural()` em `hud/dom.js`, aplicado nos dois pontos que
concatenavam `(s)`. O resto **continua não recomendado agora**, e o motivo não é esforço.

São ~210 literais no cliente, mais servidor e docs. Mas o problema real é que os rótulos são
curtos e caixa-alta porque a HUD é hairline, e as réguas da systray, do `.config-key` (68px para
a tecla) e do `.headstat` foram dimensionadas para o português. Alemão e francês estouram 30–40%
em largura. i18n aqui é redesenhar largura, não trocar string.

Se um dia for feito, o que falta além do catálogo: datas (`toLocaleString('pt-BR')` espalhado) e
as mensagens que o servidor manda prontas no stream de eventos.

## 5. Mecanismos de sistema

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
