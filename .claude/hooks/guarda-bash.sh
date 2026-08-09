#!/bin/sh
# PreToolUse/Bash — recusa o que desfaz as regras desta base EM SILÊNCIO.
#
# ⚠️ Ele NEGA, não avisa: aviso sobre comando destrutivo chega depois do comando.
# A saída é o JSON de decisão de permissão; qualquer outra saída deixa o comando passar.
#
# ☠️ **O ESCOPO DELE É O QUE MAIS IMPORTA, e foi MEDIDO, não suposto.** As duas formas de burlar
# o portão — a flag literal de pular verificação em `git commit`, e a de sobrepor o caminho dos
# hooks do git — **já são recusadas por um hook de plugin no nível do usuário**. Isso não foi
# deduzido: as duas foram vistas bloqueando comandos desta própria sessão, com a mensagem
# "Git hooks must not be bypassed". Reimplementá-las aqui criaria DUAS fontes para a mesma
# recusa, que é o defeito que este repo passa o tempo desfazendo.
#
# ⚠️ Então o que sobra para este arquivo é **exatamente uma regra: a que ninguém mais guarda.**
# Se um dia o hook de plugin sair, é aqui que a cobertura volta — e a decisão tem de ser
# consciente, não um `case` que alguém acrescenta "por precaução".
cmd=$(jq -r '.tool_input.command // ""')

nega() {
  jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",
    permissionDecision:"deny", permissionDecisionReason:$r}}'
  exit 0
}

# ── Estagiar por DIRETÓRIO
# ☠️ `git add docs/` já varreu trabalho de OUTRA sessão para dentro de um commit nesta base.
# O estrago é silencioso: só aparece no diff do PR, quando já está gravado.
case "$cmd" in *"git add"*)
  args=$(printf '%s' "$cmd" | sed -n 's/.*git add//p' | sed 's/&&.*//;s/;.*//;s/|.*//')
  for a in $args; do
    case "$a" in
      -A|--all|-u|--update|.|:/)
        nega "\`git add $a\` estagia TUDO. A regra desta base é commitar por ARQUIVO:
\`git add <caminho> <caminho>\`. Ela existe porque um add abrangente já levou o trabalho de
outra sessão para dentro de um commit, e isso só aparece depois de gravado." ;;
      -*) ;;
      *)
        [ -d "$a" ] && nega "\`$a\` é um DIRETÓRIO. Commite por ARQUIVO — liste os caminhos.
Se houver outra sessão escrevendo, um add de diretório leva o trabalho dela junto, e o
sintoma aparece só no diff do PR." ;;
    esac
  done ;;
esac
exit 0
