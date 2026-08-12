# A ponte do VS Code — o que ela entrega aqui, e onde ela cala

> **Este arquivo é DURÁVEL.** Ele diz o que a ponte responde NESTE repositório e onde ela
> cala — não o que ela é em geral. A arquitetura, as medições e o contrato das ferramentas
> vivem no repositório dela (`~/workspace/vscode-agent-bridge`: `SPEC.md`, `USAGE.md`,
> `bench/README.md`); não os transcreva.
>
> ⚠️ **A ponte só existe com o VS Code aberto neste projeto.** Sem janela, as ferramentas somem
> e o agente cai em `Read`/`Grep` — degradação, não erro. Detector: a barra de status mostra
> `⇄ Bridge :<porta>`; se não mostrar, o `bridge-doctor.mjs` diz o motivo em uma tela.
>
> ☠️ **PONTE SAUDÁVEL NÃO É FERRAMENTA DISPONÍVEL, e a diferença tem um sintoma só: nenhuma.**
> As ferramentas MCP entram na sessão do agente quando ela COMEÇA. Numa sessão aberta antes do
> plugin, elas não existem — e o agente não recebe erro, recebe ausência: ele cai em `Read`/`Grep`
> e segue, com a ponte de pé do outro lado. Medido aqui: `bridge-doctor` reportando
> `live windows: 1`, `health: 200 {"ok":true}` e workspace batendo, com ZERO ferramentas
> `mcp__vscode*` alcançáveis. **O conserto é reiniciar a sessão do agente, não a ponte.**
>
> ⚠️ **O caminho do doctor não é estável — ache-o, não o transcreva.** Ele mora sob a versão
> instalada do plugin (`plugins/cache/vscode-agent-bridge/vscode-bridge/<versão>/bin/`), e um glob
> escrito à mão erra quando a versão muda:
>
> ```bash
> node "$(find ~/.claude/plugins -name bridge-doctor.mjs | head -1)"
> ```

## Para que serve

O editor já resolveu o que o texto não resolve: quem é símbolo e quem é palavra igual, onde o
usuário está olhando, o que ainda não foi salvo. A ponte expõe isso por MCP. **Ela não substitui
`Read`, `Grep` nem o terminal** — não existe `read_file` nem `search_files` nela justamente
porque as nativas fazem melhor.

## Roteamento — quando ela ganha do grep

| a pergunta | a ferramenta |
|---|---|
| "isso", "aqui", "o arquivo que estou vendo" | `get_active_editor` — é a **única** fonte |
| onde este símbolo é usado | `find_references` — grep acha comentário e string, ela acha referência |
| o que quebra se eu mudar esta função | `get_call_hierarchy` |
| onde mora algo chamado X | `find_workspace_symbols` |
| assinatura e docblock de um símbolo | `describe_symbol` — o que o editor mostra no hover, sem abrir o arquivo |
| ler para depois editar | `read_range` — traz o buffer vivo e a `version` |
| renomear | `rename_symbol` — arruma imports, e **um** Ctrl+Z desfaz tudo |
| corrigir um erro | `get_code_actions` antes de escrever o patch: o editor já calculou a correção |
| o que o usuário rodou e falhou | `get_terminal_history` — já está na tela dele |
| desfazer o que acabei de aplicar | `revert_last_edit` |
| "isso está frio ou não existe?" | `get_language_support` — pergunta aos provedores, não à lista de extensões |

⭑ **Ao editar, devolva a `version` que o `read_range` deu.** Se o usuário digitou no arquivo no
meio do caminho, a edição é **recusada** em vez de sobrescrever o que ele escreveu.

## O que chega sem ser pedido

Quatro hooks, e eles são o motivo de a ponte mudar comportamento — ferramenta que ninguém lembra
de chamar não previne nada:

- no início da sessão: workspace aberto, arquivo em foco, quais estão **não salvos**;
- depois de `Read`/`Grep`/`Glob`: aviso se o que foi lido do disco está desatualizado;
- **antes** de `Edit`/`Write`: **bloqueio** se o arquivo tem alteração não salva — use `apply_edit`;
- depois de `Edit`/`Write`: os erros que os serviços de linguagem passaram a reportar.

---

# As três armadilhas locais

## ⚠️ O índice de símbolos nasce VAZIO — e um arquivo aberto o preenche inteiro

O TypeScript monta o projeto a partir do que o editor abriu, e este repo não tem `tsconfig`:
num VS Code recém-aberto, `find_workspace_symbols` não acha nada. **Medido:** zero antes;
as **6 funções `install` de todo o projeto** logo após um único `read_range` em qualquer
arquivo.

A ferramenta já abre um arquivo-fonte sozinha quando não encontra nada — primeira chamada a
frio devolve as 6 em ~1,4s. **Detector:** se ela responder `not_found` logo depois de abrir a
janela, não conclua ausência; a mensagem diz quais `kind` existem sob aquele nome, e um
`read_range` em qualquer arquivo destrava o resto. Para separar frio de ausente de uma vez,
`get_language_support` sonda os provedores e diz quais linguagens respondem de fato.

⭑ **Python responde aqui, e a lista de extensões NÃO é a verdade sobre isso.** Os
`ms-python.*` e o próprio prettier aparecem como desabilitados no global e estão **ativos
neste workspace** — o VS Code permite habilitação por workspace. Medido: `describe_symbol` em
`.py` devolve tipagem do Pylance, `get_diagnostics` em `server/graphdb.py` acusa 4 erros
reais. Quem responde essa pergunta é `get_language_support`, nunca `code --list-extensions`.

## ⚠️ `get_diagnostics` MENTE em JS sem checagem de tipos

`src/main.js` reporta **29 erros** `TS2339 Property 'dataset' does not exist on type 'Element'`.
É o servidor TS aplicando tipagem de DOM a JS puro — `querySelector` devolve `Element`, `dataset`
só existe em `HTMLElement`. **Nenhum é bug.** Um agente que confia na contagem vai caçar erro que
não existe.

**Detector:** o código do diagnóstico vem na saída. `TS2339` + `dataset` em `.js` é ruído; filtre
por código antes de agir.

## ☠️ Import dinâmico FALHA CALADO — e por isso a ponte agora reporta

`scripts/lei-teclado.mjs` faz `const keys = await import('../src/core/keys.js')` e chama
`keys.install()`. O serviço de linguagem **não resolve isso**: um rename de `install` deixou essa
chamada apontando para uma função que não existia mais, enquanto o grep a pegava. Custou uma
rodada de medição.

**Detector:** `find_references` e `rename_symbol` devolvem o campo **`unresolvedMentions`** — as
menções que alcançam o módulo por um vínculo que o serviço de linguagem não enxerga. **Leia esse
campo.** Ele existe porque um rename real ficou incompleto sem ele; lista vazia é a resposta
completa, lista cheia é trabalho que sobrou para você.

---

⭑ **`language_service_cold` significa "ainda não sei", nunca "não existe".** Tente de novo antes
de concluir ausência — foi para essa distinção que a camada semântica foi construída.
