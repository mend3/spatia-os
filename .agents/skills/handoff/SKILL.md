---
name: handoff
description: Retomar a sessão a partir de `docs/HANDOFF.md` e fechar o backlog numerado até o fim. Use quando o pedido for "continue o handoff", "retome de onde parou", "feche os itens T-NN", ou quando a sessão abrir sem escopo e houver itens abertos no handoff. Ela impõe a ordem MEDIR → hipótese → implementar → REMEDIR, um commit por ID de tarefa, e o par HANDOFF+roadmap fechando junto.
---

# Retomar o handoff

O ciclo desta base é um só: **o handoff diz o que está aberto, o portão diz o que pode ser
gravado, e a medida diz se o item fechou.** Nada aqui substitui o `AGENTS.md` — ele é a lei; isto
é a ORDEM de execução.

## 1 · Ler o par, não só um lado

Leia `docs/HANDOFF.md` **e** `docs/roadmap.md`. Eles são a mesma verdade por dois lados; se
discordarem, os DOIS estão errados e isso é o primeiro item, não um detalhe a contornar.

Produza a lista numerada completa dos itens abertos **com os arquivos exatos que cada um toca**,
antes de editar qualquer coisa. É essa lista que permite estimar o orçamento de contexto por
item — e é o que falta quando uma sessão morre no meio do escopo.

## 2 · Por item: medir ANTES de nomear a causa

⚠️ **A medida vem primeiro, e a hipótese depois — nunca o contrário.** Enuncie o número medido,
depois a hipótese, depois o que a refutaria. Constante trocada de sinal não é conserto: é
resultado que vale de um enquadramento e quebra os outros.

Quem responde depende do defeito:

- **invariante de código** → o oráculo de `scripts/` que cobre a área (`node scripts/leis.mjs`
  roda todos, ~4 s). Ao mexer no shader, `check-shaders.mjs` já roda sozinho a cada escrita.
- **o quadro que está na tela** → as sondas `spatia.*` (a lista viva está em `src/main.js`).
  ☠️ Medida de tela só vale com a aba VISÍVEL, a janela em FOCO e `quadros` ANDANDO entre duas
  leituras — e `quadros` andando prova que a cena não congelou, **nunca** que chegou ao regime.
- **grandeza que vem de rebuild assíncrono** → espere ACOMODAR e diga como confirmou que
  acomodou. Leitura prematura não é evidência.

Remeça depois da mudança, com a mesma régua. Sem o par de números, o item não fechou.

## 3 · O portão, e a prova por mutação

`node scripts/leis.mjs` verde não é review. ☠️ **Oráculo que nunca foi visto falhando é teste
verde, não guarda** — mutar a fonte e ver a lei cair PELO NOME é a metade que prova. Verde depois
de mutar é resultado a investigar.

## 4 · Commit por ID de tarefa

Um commit por item. `git add <caminhos explícitos>` — o hook RECUSA add por diretório, e a recusa
é a regra, não um obstáculo. Mostre o diff e **espere aprovação** antes de gravar. O corpo do
commit é longo aqui de propósito: é onde a medida que decidiu cada número mora, e é o que permite
aos docs não contarem a história.

## 5 · Não pare no meio

Siga até todo item estar **fechado ou explicitamente bloqueado com o motivo escrito**. Se o
contexto apertar, diga que apertou e escreva o handoff **enquanto ainda há espaço para escrevê-lo
bem** — parar calado é o único desfecho que não deixa nada para a próxima sessão.

## 6 · Fechar é MOVER, nunca anexar

Reescreva `docs/HANDOFF.md` **e** `docs/roadmap.md` juntos — o hook `par-de-docs.sh` mede quando
só um dos dois mudou. O relato sai; a armadilha vai para `docs/armadilhas.md`, o número para
`docs/medidas.md`, o resto para o corpo do commit. O orçamento de tamanho e o teste da narrativa
estão no `AGENTS.md`; não os repita aqui.

Termine com o prompt da próxima sessão.
