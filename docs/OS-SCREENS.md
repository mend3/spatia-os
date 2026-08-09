# Telas do sistema

Arquitetura de informação das telas de sistema do SpatIA: quais existem, que pergunta cada uma
responde, e **o que fica de fora**.

> ⭑ **A construção acabou.** As nove rotas existem, oito dos dez mecanismos da §2 estão no código, e
> o OAuth da §3 sobreviveu inteiro. O que este documento ainda faz por quem chega: guardar o
> **vocabulário** (§0) e as **recusas** (§1.1) — porque nenhuma das duas tem outro dono, e uma recusa
> apagada é uma discussão reaberta daqui a seis meses.
>
> ⚠️ **Os números de seção são citados pelo CÓDIGO** (`registry.js` §2.3, `journal.py` e `budget.py`
> §2.4, `security.js` e `permissions.js` §0). **Não renumere.**

O critério é único e vale para tudo neste documento: **uma tela existe para responder uma
pergunta operacional que hoje não tem resposta.** Se a pergunta não dá para nomear numa
frase, a tela não entra. Tela de sistema sem pergunta é inventário com tema escuro.

Os documentos que este assume lidos: [`EVENTS.md`](EVENTS.md) (o contrato), 
[`METRICS.md`](METRICS.md) (o que já se mede) e o kernel em `src/kernel/`.

---

## 0. O vocabulário

Três decisões de fundação já tomadas, repetidas aqui porque tudo abaixo depende delas:

- **Tela é destino, não aba.** Um app é um corpo em órbita; abrir é a câmera voar até ele.
  A HUD trocar de widgets é consequência do voo, não o evento.
- **Widget é contrato** (`id`, `title`, `slot`, `grow`, `mount(host, ctx)`), e não sabe em que
  app está. O mesmo widget de timeline serve o sistema e os arquivos.
- **Layout é do produto.** O app declara os widgets e a ordem; o operador não arrasta nada.

### Convenção de fendas

O contrato tem quatro fendas e não diz o que cada uma significa. Sem semântica declarada,
cada app vai inventar a sua e o sistema deixa de parecer um sistema:

| Fenda | Semântica | Exemplo |
|---|---|---|
| `left` | **o que é** — identidade, configuração, o estado declarado | identidade da instalação, ferramentas ligadas |
| `right` | **o que está acontecendo** — medido, observado, agora | medidores, saúde, janela de uso |
| `stage` | **o objeto do app** — a coisa única que a tela serve para olhar. Sem moldura. | a resposta, o conteúdo do arquivo, a tabela de execuções |
| `strip` | **residentes** — o que nunca deve sair da tela | prompt, timeline |

### O conjunto residente

`core.prompt` e `core.timeline` entram na lista de widgets de **todos** os apps. O host de
widgets preserva o que continua declarado, então eles atravessam a navegação sem remontar —
o foco do prompt e o histórico da timeline sobrevivem ao voo.

Isso não é conveniência, é a diferença entre um ambiente e um painel de configuração: um OS
onde você não pode perguntar nada enquanto está na tela de armazenamento é um OS modal.

### Painel ou destino

Duas coisas convivem no sistema — painéis sobrepostos (afinação, `` ` ``) e destinos
(`#/files`). O critério para decidir:

> **Painel** quando a mudança precisa ser vista no mesmo instante, na mesma tela.
> **Destino** quando o efeito da mudança acontece em outro lugar ou depois.

A afinação é painel: 33 parâmetros de física e óptica que só fazem sentido ajustados olhando
o buraco negro reagir — abrindo no grupo GLOBAL (velocidade, volume, brilho, contraste,
saturação), que é o que atravessa a cena inteira. Tirar isso do lugar destruiria a única razão
de existir.

As permissões são **destino**, e hoje são painel — o que está errado. Nenhum toggle de
permissão tem efeito na execução em curso: ele vira flag de `claude -p` na *próxima*
invocação. Não há nada para ver acontecendo, e portanto nenhum custo em ser uma tela. A
tecla `P` continua existindo, apenas navegando em vez de sobrepondo (uma verdade, um código).

---

## 1. Inventário de telas

⭑ **CONSTRUÍDO.** As nove rotas existem e o critério da §0 decide cada uma. O manifesto vivo está em
`src/apps/index.js` — ele é a fonte, este quadro é orientação:

| rota | pergunta que responde | onde |
|---|---|---|
| `#/system` | identidade, subsistemas, comando efetivo | `apps/index.js` |
| `#/files` | o que existe no disco, e qual a forma dele | `apps/index.js` |
| `#/web` | de onde vem o que o agente leu fora daqui | `apps/index.js` |
| `#/bridge` | credenciais, entregas, MCP e webhooks | `apps/index.js` |
| `#/activity` | o que está acontecendo AGORA | `apps/activity.js` |
| `#/journal` | o que aconteceu, e por quê | `apps/journal.js` |
| `#/metrics` | o que este processo mede sobre si | `apps/metrics.js` |
| `#/storage` | o que o índice tem, e o que falta nele | `apps/storage.js` |
| `#/security` | o que o agente pode fazer, e com que limite | `apps/security.js` |

⚠️ **`#/integrations` virou `#/bridge`.** A tela é a mesma; o nome mudou porque o módulo que a serve
não integra, ele MEDEIA — o agente fala com a ponte, nunca com o terceiro.

## 1.1 Telas que eu não recomendo

As omissões valem tanto quanto as propostas, e cada uma tem motivo próprio.

**Centro de notificações.** O espaço **já é** o centro de notificações: halo pulsando, meteoro
entrando, glitch na interferência. Uma caixinha com sino seria a primeira animação decorativa
do projeto — algo se movendo porque a UI decidiu, não porque um evento aconteceu — e é assim
que a regra de ouro começa a morrer. O mecanismo que eu recomendo em vez da tela está em §2.5 (aberto — T-09 do roadmap).

**Aparência e temas.** O painel de afinação já é isso, e é melhor: 33 parâmetros de física e
óptica — inclusive brilho, contraste e saturação da imagem — em vez de "cor de destaque".

**Contas, perfis, multiusuário.** Ver `#/security`.

**Loja ou marketplace de apps.** Um app aqui é código JavaScript que roda na mesma origem que
fala com um servidor que executa um agente com ferramentas totais. Instalar app de terceiro
nisso é entregar a máquina. Instalação é `git`, revisada, e o formato de pacote de §2.3 existe
para organizar o que **você** escreve, não para receber o que outros escrevem.

**Editor de arquivos.** É um observatório. Escrever é o que o agente faz com `Write`/`Edit`
sob permissão declarada e registro no diário, não o que a página faz por baixo do agente.

**Terminal de shell na página.** Já existe, e chama-se `Bash` via o agente — com wormhole,
métrica e registro. Um shell direto contornaria o modelo de permissões inteiro, e o
`Sec-Fetch-Site` passaria a ser a única coisa entre uma aba maliciosa e um `rm -rf`.

**Painel de série temporal.** Motivo em `#/metrics`: o processo é o armazenamento.

**Tela de logs do servidor.** O diário é estruturado, derivado do barramento e consultável. O
stdout é para quem está no terminal.

---

## 2. Mecanismos que um OS tem e este ainda não

⭑ **Oito dos dez foram construídos**, e o RACIOCÍNIO de cada um mora no módulo que o implementa —
vários citam esta seção pelo número, então **os números não podem ser renumerados**:

| § | mecanismo | estado |
|---|---|---|
| 2.1 | capacidade, não lista de nomes | ⭑ `server/capabilities.py` — `(verbo, escopo, limite)` + portão `PreToolUse` |
| 2.2 | unidades de serviço: desejado vs real | ⭑ `server/units.py` + `config/units.json` |
| 2.3 | o que é um pacote, e o que é instalar | ⭑ `src/kernel/registry.js` (citado por `router.js`) |
| 2.4 | ledger, não log | ⭑ `server/journal.py` (citado por ele e por `budget.py`) |
| **2.5** | **notificação como evento, não como caixa** | ☠️ **ABERTO** — `severity` tem **zero ocorrências** em `src/` e `server/`. É o **T-09** do roadmap, e vai junto com o produtor ambiental: `notice` sem produtor é vocabulário sem leitor |
| 2.6 | sessão, e o que "bloquear" significa | ⭑ `src/core/session.js` |
| 2.7 | cotas, e a falta é a que importa | ⭑ `server/budget.py` |
| 2.8 | recuperação de falha | ⭑ `server/hookqueue.py` — a fila de entregas EM DISCO |
| 2.9 | o que significa desligar | ⭑ drenagem no `SIGTERM`, com `boot`/`shutdown` no diário |
| 2.10 | endereço para o ESTADO, não só para a tela | ⭑ `router.parse()` devolve `{app, arg}`; `#/files/<caminho>` e `#/journal/<id>` sobrevivem ao F5. Sub-rota **não remonta** o widget — o endereço existe para trazer o estado de volta, e remontar destruiria justamente isso |

## 3. OAuth e credenciais de terceiros

⭑ **CONSTRUÍDO**, e a arquitetura sobreviveu inteira: `server/credentials.py` é **o único lugar que
lê um segredo**, `server/oauth.py` faz PKCE + loopback, `server/bridge.py` é com quem o agente fala
(nunca com o terceiro), e `server/webhooks.py` exige HMAC com política por endpoint. A entrega é
`server/hookqueue.py`, uma fila EM DISCO.

⚠️ **A propriedade que não pode ser perdida numa refatoração:** o agente usa a credencial **sem
vê-la**. Qualquer caminho novo que entregue o segredo ao agente quebra o modelo inteiro, e o
sintoma não aparece em teste nenhum.
