---
name: ponte-vscode
description: O que a ponte do VS Code responde NESTE repositório e onde ela cala — índice de símbolos frio, diagnostics de JS ruidosos, import dinâmico invisível. Use antes de buscar um símbolo com grep, antes de renomear, antes de acreditar numa contagem de erros, ao querer a assinatura ou o docblock de uma função, e sempre que o pedido disser "isso", "aqui" ou "o arquivo que estou vendo".
---

# A ponte do VS Code, aqui

O editor sabe três coisas que o disco não sabe: **onde o usuário está olhando**, **o que ainda
não foi salvo** e **quem é símbolo e quem é palavra igual**. É só para isso que a ponte serve.
`Read`, `Grep` e o terminal continuam melhores no resto — ela nem tem `read_file`.

Roteamento completo, hooks e detectores: [`docs/ponte-vscode.md`](../../../docs/ponte-vscode.md).
O que segue é o mínimo que evita erro nesta base.

## Antes de dar grep num símbolo

`find_references`. Neste repo **cinco módulos exportam uma função chamada `install`** e
`main.js` menciona `install` 14 vezes — busca textual não distingue nenhuma delas. A ponte
distingue.

## Antes de renomear

`rename_symbol`, nunca substituição textual. E **leia o campo `unresolvedMentions` da resposta**:
`scripts/lei-teclado.mjs` alcança `keys.js` por `await import(...)`, que o serviço de linguagem
não resolve. Um rename já ficou incompleto exatamente aí. Lista vazia é resposta completa; lista
cheia é trabalho que sobrou.

## Para entender uma função sem ler o arquivo

`describe_symbol` — assinatura resolvida pelo serviço de linguagem mais o docblock. Aceita o
nome do símbolo ou uma posição. É o caminho mais barato para "o que essa função faz".

## Antes de acreditar num erro

`src/main.js` tem **29 erros `TS2339 … 'dataset' … 'Element'` que não são bugs** — é tipagem de
DOM aplicada a JS puro. Filtre por código antes de agir.

## Ao ler para editar

`read_range` traz o buffer vivo e uma `version`; devolva essa `version` no `apply_edit`. Se o
usuário digitou no meio, a edição é recusada em vez de apagar o que ele escreveu. Escrever com
`Write` num arquivo sujo é bloqueado por hook — não contorne, use `apply_edit`.

## Quando ela não responde

`language_service_cold` é **"ainda não sei"**, não "não existe" — tente de novo. E
`find_workspace_symbols` respondendo `not_found` logo após abrir a janela costuma ser índice
frio, não ausência: um `read_range` em qualquer arquivo destrava o projeto inteiro.
`get_language_support` decide a dúvida — ele sonda os provedores e diz quais linguagens
respondem, o que a lista de extensões não diz (as `ms-python.*` constam desabilitadas no
global e estão ativas aqui). Python responde normalmente. Sem VS Code aberto, a ponte some e `Read`/`Grep` voltam a ser o
caminho.
