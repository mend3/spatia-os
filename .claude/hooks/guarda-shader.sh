#!/bin/sh
# PostToolUse/Edit|Write — os blocos GLSL, conferidos no instante em que o arquivo é escrito.
#
# ☠️ **A régua é o EXIT 2, e é ela que faz este arquivo existir.** `PostToolUse` não é evento
# bloqueável, e exit 1 ali é "erro NÃO bloqueante": o stderr aparece no transcript do operador e
# o AGENTE NÃO VÊ. Um guarda que dispara sem o agente saber é pior que guarda nenhum — ele segue
# editando sobre um shader quebrado, e a tela não mente nem acusa, ela deixa de afirmar. Só o
# exit 2 alimenta o stderr de volta para quem está editando.
#
# ⚠️ O caminho do arquivo vem do JSON no STDIN, nunca de variável de ambiente. Não existe
# `CLAUDE_TOOL_FILE_PATH` — o ambiente do hook tem `CLAUDE_PROJECT_DIR` e os `CLAUDE_PLUGIN_*`.
# Um hook que lê a variável inexistente casa com string VAZIA, e o `case` vira código morto sem
# sintoma nenhum: ele não falha, ele para de afirmar. É o mesmo modo de falha que ele guarda.
#
# ⚠️ E a régua é o `check-shaders.mjs`, nunca um regex aqui. Um grep de crase por LINHA casa as
# linhas DELIMITADORAS do template (as que têm uma crase só) e deixa passar a linha ofensora,
# que tem duas — medido. Quem sabe onde o bloco GLSL começa e acaba é o oráculo.
f=$(jq -r '.tool_input.file_path // .tool_response.filePath // ""')
case "$f" in *.js) ;; *) exit 0 ;; esac

raiz=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$raiz" || exit 0

saida=$(node scripts/check-shaders.mjs 2>&1) && exit 0
printf '%s\n' "$saida" >&2
exit 2
