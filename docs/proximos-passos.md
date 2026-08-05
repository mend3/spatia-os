# Revisão de próximos passos — 2026-08-04

Escrita depois de fechar a fila de cinco itens (anéis, órbita, systray, página de configuração,
SSOT de atalhos). Pedido do usuário:

> quando terminar tudo, faça uma revisão sobre melhorias que podem ser feitas, perfis
> (performance, gráfico, etc), i18n e outras coisas que possam ser integradas.

Tudo abaixo tem medida ou arquivo:linha. O que é estimativa está marcado como estimativa.

---

## 1. Perfis de qualidade — o item de maior valor por esforço

### O que está medido

| Métrica | Valor | Onde |
|---|---|---|
| FPS | **120** | medido por 6s no app `system`, painel montado |
| Quadros longos (>50ms) | **0** | idem |
| Framebuffer | 3024×1484 (DPR 2) | `canvas.width/height` |
| GPU | Apple M5 (ANGLE Metal) | `WEBGL_debug_renderer_info` |
| Heap JS | 16 MB | `performance.memory` |

**Esta é a máquina mais rápida que vai rodar isto.** O número não diz nada sobre um notebook
sem GPU dedicada, e é exatamente esse o problema: não existe nenhum dado sobre a cauda.

### O que falta

A cena tem **22 parâmetros** afináveis (`core/tuning.js`) e nenhum agrupamento. Quem abre o
painel numa máquina fraca encontra 22 sliders e nenhuma pista de quais três importam para o
FPS. Um perfil é um conjunto NOMEADO desses valores:

| Perfil | O que muda | Para quem |
|---|---|---|
| `mínimo` | DPR 1, bloom off, lente off, grão 0, `graphSpeed` reduzido, `MAX_RINGS` 16 | integrada / bateria |
| `equilibrado` | DPR ≤1.5, bloom leve, lente on | o default de hoje |
| `pleno` | DPR ≤2, tudo ligado | GPU dedicada |

O custo real está concentrado em três lugares, e vale medir antes de escolher: `MAX_PIXEL_RATIO`
(`space/scene.js` — DPR 2 quadruplica os fragmentos em relação a 1), a cadeia de
pós-processamento (lente + `UnrealBloomPass` + output, três passes de tela cheia) e o
`composer.render()` sem teto de FPS.

**Detecção automática é possível e não deve ser silenciosa:** medir os primeiros ~120 quadros e
sugerir o perfil, nunca aplicá-lo sozinho. Trocar a aparência da cena sem pedir é a mesma classe
de erro do slider que exibe um valor que não está em vigor — o `respectMotion` em `scene.js` já
avisa na tela quando faz isso, e a mesma honestidade vale aqui.

### Um defeito que impede medir a cauda

`server/app.py:200` usa `if payload.get("fps")` — **`fps == 0` é falsy e some**. A aba travada,
que é o caso que `metrics.py:16-17` diz querer pegar, reporta 0 e nunca entra no histograma.
Sem corrigir isso, qualquer perfil automático estaria sendo calibrado contra um universo do qual
os piores casos foram removidos. **Corrigir antes de construir os perfis, não depois.**

---

## 2. Performance — o que dá para afirmar e o que não

Afirmável: no melhor caso a cena não é o gargalo (120 FPS, zero quadros longos, 16 MB).

Não afirmável, e cada um é uma investigação curta:

- **Custo de pós-processamento.** Três passes de tela cheia a 3024×1484. Estimativa: é o maior
  item do orçamento de quadro, mas não foi medido isoladamente. `performance_start_trace` do
  DevTools resolve em minutos.
- **`raycaster` a 16Hz** (`PICK_INTERVAL_MS = 60`) sobre 468 pontos — já tem teto e é suspendido
  no arrasto, provavelmente barato.
- **`advance()` por quadro**: ~468 sin/cos + upload de dois buffers. O cabeçalho de `graph.js`
  chama de "irrelevante"; a 468 nós é plausível, mas o número cresce com o corpus e ninguém
  mediu com 5 000.
- **O teto que já apareceu:** `gl_PointSize` satura em **511px** nesta GPU. O anel espelha o
  teto (`POINT_SIZE_CAP` em `graph.js`), mas nenhuma outra parte da cena sabe disso.

---

## 3. i18n — a recomendação é honesta, não entusiasmada

**Escala medida:** ~210 literais em maiúsculas no cliente e 34 pontos que escrevem texto direto
no DOM, mais os rótulos do servidor (`app.py`, `permissions.py`, `speech.py`) e **todos os
comentários e docs**, que são PT-BR por decisão registrada no CLAUDE.md do workspace.

O que um i18n de verdade exigiria: extrair as 210 strings para um catálogo, trocar 34 pontos de
escrita, resolver plural (`${n} chunk(s)` aparece hoje com o `(s)` chapado), datas
(`toLocaleString('pt-BR')` está espalhado) e decidir o que fazer com as mensagens do servidor,
que chegam prontas no stream de eventos.

**Recomendação: não fazer agora, e o motivo não é o esforço.** Este é um observatório pessoal
com um operador, e a tipografia é parte do desenho — os rótulos são curtos e caixa-alta porque a
HUD é hairline e o espaço é apertado. Alemão e francês estouram 30–40% em largura, e as réguas
de `.headstat`, `.config-key` (68px para a tecla) e da systray foram dimensionadas para o
português. i18n aqui não é trocar strings: é redesenhar as larguras.

**O que vale fazer desde já, e é barato:** parar de gerar frases por concatenação. `${n}
chunk(s)`, `${n} ARQUIVO(S)` e afins são o único ponto que trava de verdade uma tradução futura,
porque plural não é sufixo em quase nenhuma língua. Uma função `plural(n, 'chunk', 'chunks')`
resolve hoje, deixa o texto melhor em português, e é o passo que não se desfaz.

---

## 4. Integrações e mecanismos já desenhados

`docs/OS-SCREENS.md §2` já tem dez mecanismos especificados. Os três com melhor razão
valor/custo, na minha leitura:

1. **§2.1 — capacidade em vez de lista de nomes.** O hook `PreToolUse` apontando para
   `127.0.0.1:8787/api/gate` transforma a lista de permissões em política aplicada ANTES da
   chamada. O documento já registra por que interceptar depois não vale: quando o `recorder` vê,
   o `Read` já aconteceu.
2. **§2.2 — desejado vs real.** Hoje `/api/health` só responde o real, e "TTS caiu" é
   indistinguível de "TTS nunca foi para ser usado aqui". Um arquivo de unidades declarado
   responde *o que eu perco se o Ollama cair?*.
3. **§2.4 — ledger em vez de log.** Casa com o context manager (`core/session.js`) que entrou
   nesta sessão: já existe quem saiba o que está aberto e qual foi o último gesto; falta a
   decisão ser gravada junto com a consequência.

---

## 5. A fila que já tem evidência

`docs/revisao-fidelidade-notas.md` tem 29 achados com arquivo:linha, dos quais **nenhum dos 6
bugs de correção foi consertado**. Eles continuam sendo o melhor valor por linha do repositório,
porque são funcionalidades que existem no código e **nunca funcionam**:

- ENTREGAS RECENTES com condição impossível (`origin` só no evento `call`);
- ferramentas internas sem `id`, que nunca fecham a linha na HUD — e, com `BRAIN=ollama`, o
  primeiro `result` fecha todas;
- `Esc` não cala a voz (ninguém emite `ui.cancel`);
- guarda de auto-repeat com corpo vazio em `keys.js`;
- `/api/file` vivo e sem chamador — o leitor mostra a foto do ÍNDICE enquanto o anel ao lado diz
  que o arquivo mudou. Conceitualmente o pior da lista;
- `dirty.annotate()` morta.

E no servidor, os três que o anel expôs: quoting do `git status` (acento e rename nunca acendem
anel, e a nota culpa "FORA DO ÍNDICE" um arquivo indexado), submódulo aninhado invisível, e
`AGENT_CWD` vazio desligando a feature em silêncio.

---

## 6. Ordem que eu seguiria

1. Os 6 bugs de correção + os 3 do servidor (§5) — custo P cada, e todos são "existe e não
   funciona", não "não existe".
2. O `fps == 0` (§1) — uma linha, e sem ela não há como calibrar perfil nenhum.
3. Perfis de qualidade (§1) — o pedido, e o que torna a cena utilizável fora desta máquina.
4. `plural()` (§3) — barato, melhora o português hoje, não se desfaz.
5. §2.2 desejado vs real (§4) — a menor das três integrações e a que mais muda o boot.
6. Fidelidade da cena (`revisao-fidelidade-notas.md` §21-29) — beaming do disco, órbitas que de
   fato cruzam o plano, distribuição espectral invertida. Nenhum custa mais que ~0.1ms de GPU.
