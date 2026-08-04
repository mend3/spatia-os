# Notas: systray no topo (e o que sobra para a página de configuração)

Rascunho de desenho, **não implementado**. Escrito porque o subagente não pôde mais ser
retomado e o contexto da sessão acabou. Pedido do usuário em 2026-08-04, com a barra de menus
do macOS como referência visual:

> precisamos repensar isso [a faixa VOZ · ON / CONFIG VOZ / PERMISSÕES / AFINAR / WEB · AUTO no
> rodapé] como uma systray (como a do macos, com uma faixa horizontal no topo)

## A leitura que muda o desenho

**A faixa do topo já é uma systray** e ninguém a tratou como tal. A estrutura dela é a mesma da
barra do macOS:

| Região | Hoje | Papel |
|---|---|---|
| esquerda | `.headstat` (custo, corpus, índice) | identidade + estado residente |
| centro | `.status` (estado + pontos de serviço) | o que o sistema está fazendo |
| direita | `.clockbox` | relógio |

Os controles do rodapé são *status items*, e o lugar deles é o agrupamento da **direita**,
imediatamente antes do relógio — é ali que o macOS põe wifi, bateria e relógio.

**Não criar uma segunda barra. Não empurrar o `header` para baixo. Estender o que existe.**

## A regra que economiza o espaço

Item de menu bar é **glifo compacto cujo desenho comunica o estado**, e que abre um menu
ancorado ao clique. É por isso que a barra do macOS acomoda 8 itens no espaço em que hoje cabem
5 botões rotulados.

- `VOZ · ON` → glifo com estado no próprio glifo. Clique abre o popover de voz.
- `WEB · AUTO` → glifo com os **três** estados distinguíveis. ⚠️ `web.mode` é TRI-ESTADO e
  `auto` significa *não mandar o parâmetro*. Tratar como booleano já quebrou uma vez: o AUTO
  enviava `web=0`, que o servidor lê como "não pesquise" explícito, e nunca pesquisava nada.
- `CONFIG VOZ`, `PERMISSÕES`, `AFINAR` → não merecem item próprio. Viram entradas **dentro** do
  popover do item correspondente (voz no glifo de voz; permissões e afinação num item de
  sistema), ou levam à seção da página de configuração.

### Popover, não painel flutuante solto

Ancorado sob o item, fecha por Esc / clique fora / segundo clique no item, **um aberto por vez**.
Entrar na cadeia de Esc central do `main.js`, sem criar outro listener. Popover ancorado e modal
centrado são contratos distintos — se um primitivo só servir aos dois, justificar.

## O que o rodapé perde

Sai a faixa de 5 botões e sai a linha de dicas estática (`TAB CINEMA · ...`), que vira a seção
ATALHOS da página de configuração, **gerada de `keys.hints()`** e nunca escrita à mão (a versão
manual já apodreceu uma vez, anunciando `G` depois da tecla ter mudado). O rodapé fica só com o
compositor. O espaço liberado é ganho — não preencher sem pedido.

## Relação com a página de configuração

As duas coexistem e são complementares:

- **systray** = acesso rápido, estado sempre visível;
- **página de configuração** (dentro do app `system`, que já tem a tagline "saúde, custo,
  permissões, afinação") = profundidade e seções.

Mesma fonte de estado (`prefs` / `tuning` / servidor) em duas superfícies. Duplicar a construção
dos controles em vez de reaproveitar `createControls` / `createSpeechPanel` /
`createPermissions` garante divergência na primeira alteração.

## Armadilhas já medidas — não redescobrir

- `#hud` é `pointer-events: none`; só `a/button/input/.clickable` reativam. `div` interativo
  nasce morto ao clique — quebrou o scrubber e o leitor de arquivo.
- `#hud` é `position: fixed` e **cria contexto de empilhamento**: z-index interno não vence o
  `#bodies` (z-index 2). Popover que precise passar à frente dos astros exige elevar o `#hud`
  (ver `#hud:has(.widget[data-widget="fs-content"])`).
- Container flex encolhe os filhos e mata a rolagem → `flex: 0 0 auto` nos filhos.
- Verificar clique com `elementFromPoint` **e** clique real. `dispatchEvent` não testa
  hit-testing, e foi o que deixou o scrubber passar quebrado.

## Atalhos

⌘G, `P` e `V` continuam valendo e passam a abrir o popover ou a seção correspondente. **Um
comportamento por atalho** — não "abre popover E navega". Preservar o raciocínio de
`hud/controls.js`: ⌘G alterna com `whileTyping` porque modificador não disputa caractere; a
crase é alias **sem** `whileTyping` porque crase é caractere e se digita.

## Fila pendente nesta linha de trabalho

1. ~~Anéis de Saturno em arquivos alterados.~~ **Feito** em 2026-08-04 — `space/rings.js` +
   `space/ring-profiles.js` (perfil radial real de Saturno/Urano/Júpiter, um por estado do
   `git status`). Passou por três revisões; os achados e o que ficou de fila estão em
   [`revisao-fidelidade-notas.md`](./revisao-fidelidade-notas.md).
2. ~~Persistir órbita da câmera por tick + ⌘S manual.~~ **Feito** em 2026-08-04 — salvamento a
   cada 5s só quando houve gesto, `visibilitychange`/`pagehide` (nunca `beforeunload`), três
   escalares em `prefs` para a guarda de "só se mudou" funcionar, e ⌘S com nota na tela.
   ⚠️ A armadilha que quase passou: `focusBody(null)` reescrevia a distância com a constante 54
   e anulava a restauração — sair de um app tem que voltar ao enquadramento DO OPERADOR.
3. Systray (este documento).
4. Página de configuração com menu lateral.
5. SSOT de atalhos — ver [`atalhos-ssot-notas.md`](./atalhos-ssot-notas.md). Nota: `keys.hints()`
   já existe e **não tem chamador nenhum**; a barra do rodapé em `index.html` é texto fixo. Essa
   é a duplicação a matar.
