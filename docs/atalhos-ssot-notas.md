# Notas para a spec do SSOT de atalhos

Rascunho de evidência, **não é a spec**. Escrito antes de começá-la para que ela parta de
fatos medidos nesta sessão em vez de memória. A spec vem depois da entrega do agente.

Pedido do usuário (2026-08-04, textual):

> os atalhos merecem um ssot, mais surgirao e queremos fazer com que seja facil
> criar/linkar/manipular com o tempo. eles podem fazer muitas coisas pelos componentes para dar
> vida ao ambiente e manter reativo, proativo e de facil acesso e uso.

## Onde estamos hoje

`src/core/keys.js` já é meio caminho: centralizou a guarda ("atalho global não dispara enquanto
há entrada de texto com foco") e expõe `hints()`, que monta a barra de dicas a partir dos
atalhos **registrados** em vez de texto fixo. O que ele ainda NÃO é: fonte única. Cada
componente chama `bind()` no seu próprio `create*`, então a lista completa de atalhos só existe
em tempo de execução, espalhada por arquivos.

## Cinco bugs reais que a centralização matou (o histórico que justifica o SSOT)

Estavam no cabeçalho do `keys.js` e valem como requisito de regressão:

1. digitar `p` na busca de arquivos abria o painel de permissões;
2. digitar `v` na bancada de voz abria o painel de voz;
3. digitar `1` na busca navegava para o primeiro app;
4. crase abria a afinação em qualquer campo;
5. espaço no prompt vazio ligava o microfone em vez de digitar um espaço.

Cinco bugs, **uma** causa: a guarda era decidida por quem registra o atalho, e quem registra não
sabe onde o foco está. A regra é do sistema, não do painel.

## Restrições descobertas medindo (não presumir de novo)

- **Letra solta não pode ser toggle global.** O prompt tem foco quase sempre. Ou o atalho engole
  o caractere, ou o campo engole o atalho — não há terceira opção. Foi por isso que `G` puro
  saiu e ⌘G entrou.
- **Modificador é o que permite `whileTyping`.** Com ⌘/Ctrl não existe caractere em disputa,
  então o atalho vale com o cursor no prompt. Sem modificador, `whileTyping` transforma o
  caractere em comando: a crase marcada assim faria cada `` ` `` digitado abrir o painel.
- **Simetria é requisito, não gosto.** Abrir por uma tecla e fechar por outra obriga a decorar
  duas coisas para um gesto só. O usuário reprovou explicitamente a versão assimétrica.
- **`meta: true` casa ⌘ OU Ctrl** (ver `matches`), o que serve mac e linux sem ramificar.
- **`capture: true` é necessário**: a supressão tem que acontecer antes de qualquer handler de
  borbulhamento, senão o atalho já rodou quando a checagem chega.
- **Atalho de browser não é sempre cancelável.** O `preventDefault()` no match cobre o caso
  comum, mas ⌘S/⌘G precisam de verificação real por tecla apertada de verdade — evento sintético
  não prova nada aqui (evento não-confiável não dispara comportamento nativo).
- **Dica escrita à mão apodrece.** A linha do rodapé dizia "`G` abre a afinação" depois de a
  tecla ter mudado. `hints()` existe para isso; qualquer superfície nova (página de config,
  paleta de comandos) deve derivar dela.

## Como ficou (implementado em 2026-08-04)

`core/keys.js` virou a fonte única. As respostas às perguntas abaixo, como foram decididas:

- **Declaração:** continua `bind()` imperativo, e não um manifesto de dados. O manifesto seria
  um segundo lugar para o atalho existir, e quem registra é quem sabe o que a ação faz — separar
  os dois cria a chance de um sobreviver ao outro. O que mudou é que o `bind` agora entrega
  DADO: `keys.list()` devolve tecla, ação, grupo e se vale digitando.
- **A tecla saiu do rótulo.** Era `'⌘G AFINAR'`, com a tecla escrita na string; agora o `label` é
  só a ação e a tecla é derivada do spec por `keys.render()`. Era exatamente aqui que a dica
  apodrecia.
- **Conflito falha alto.** Duas combinações iguais lançam no registro, com o nome de quem já
  tinha a tecla — mesma disciplina do `kernel/registry.js` com id duplicado. Antes o segundo
  simplesmente não disparava, em silêncio.
- **Alias não polui a lista.** A crase é um segundo caminho para a afinação, não um segundo
  comando: entra com `alias: true` e fica fora de `list()`.
- **Descoberta:** a seção ATALHOS da página de configuração (`sys-config`) consome `keys.list()`
  agrupado. Não há paleta de comandos — ela seria uma terceira superfície para o mesmo dado, e
  o pedido de espaço do usuário é que a tela é para componentes.
- **Escopo e remapeamento** ficaram de fora, deliberadamente: nenhum atalho hoje é de rota ou de
  painel montado, e remapear é dado que ninguém pediu ainda. Quando chegar, `list()` já é a
  forma que uma tela de remapeamento consumiria.

## Perguntas originais que a spec precisava responder

- Declaração: manifesto de dados (um arquivo/registro) vs `bind()` imperativo espalhado. O que
  torna "criar/linkar/manipular com o tempo" fácil de verdade?
- Conflito: dois componentes pedindo a mesma tecla. Hoje o primeiro registrado ganha e ninguém
  avisa — o `matches` retorna no primeiro match. Isso deveria falhar no registro, como o
  registry de apps já faz com widget inexistente e com o id reservado `core`.
- Escopo: atalho global vs atalho de rota/painel montado. Hoje tudo é global e o `destroy` do
  widget é que remove.
- Descoberta: paleta de comandos derivada do mesmo registro? É o caminho natural para
  "fácil acesso e uso" sem gastar espaço de tela (regra do usuário: espaço é para componentes).
- Reatividade/proatividade: o usuário fala de atalhos que "dão vida ao ambiente". Isso sugere
  atalho como *ação de sistema* endereçável — o mesmo alvo que a dock, a rota e o astro orbital
  já endereçam. Vale unificar com o barramento de eventos (`emit({ t: 'ui.*' })`) em vez de
  criar um segundo mecanismo de acionamento.
- Configurabilidade pelo usuário: se atalho vira dado, remapear é edição de dado. Isso combina
  com a regra do projeto de que todo controle de UI persiste no `localStorage`.

## Armadilha de persistência que afeta isto

O `localStorage` está preso à grafia da URL: o servidor escuta em `127.0.0.1` **e** em
`localhost` (dual-stack necessário para o Chrome), e para o browser são origens distintas, logo
dois storages. Se atalho remapeado virar preferência de cliente, herda esse problema.
