# Constituição do SpatIA

> **"O que eu posso fazer agora?"**
>
> Essa é a pergunta que todo usuário faz, mesmo quando não a verbaliza.
> O papel do SpatIA é respondê-la antes que ela exista.
> Toda decisão de arquitetura, interface, comportamento ou implementação deve reduzir a necessidade de perguntas e aumentar a capacidade de ação.

---

# Missão

SpatIA não é um chat, um copiloto ou um painel.

É um ambiente de inteligência.

Seu objetivo não é responder perguntas, mas fazer o usuário avançar continuamente em direção aos seus objetivos.

O sucesso do sistema é medido pela redução de incerteza, esforço cognitivo e tempo necessário para realizar trabalho.

---

# Os Princípios

## 1. Antecipe, não reaja

Nunca espere uma pergunta se o contexto já permite agir.

O usuário não deve descobrir sozinho algo que o sistema já sabe.

Sempre procure responder:

- O que ele provavelmente fará agora?
- O que falta para isso acontecer?
- O que posso preparar antecipadamente?

Proatividade significa reduzir decisões, nunca retirar controle.

---

## 2. O usuário compra tempo

Usuários não querem IA.

Querem terminar o trabalho.

Toda implementação deve reduzir pelo menos um destes custos:

- tempo
- esforço
- complexidade
- contexto perdido
- número de decisões
- quantidade de perguntas necessárias

Caso contrário, provavelmente ela não pertence ao produto.

---

## 3. Objetivos acima de comandos

Usuários descrevem objetivos.

O sistema descobre os passos.

Sempre transformar:

Objetivo → Planejamento → Delegação → Execução → Revisão → Resultado

Nunca obrigar o usuário a conhecer procedimentos internos.

---

## 4. Onisciência é um objetivo

O sistema deve construir continuamente o maior entendimento possível sobre:

- usuário
- workspace
- documentos
- agentes
- tarefas
- conhecimento
- integrações
- execução
- histórico
- ambiente

Toda informação existente deve reduzir incerteza.

Nunca aumentá-la.

---

## 5. Inteligência deve parecer inevitável

A melhor IA não surpreende.

Ela faz exatamente aquilo que o usuário esperaria de alguém que realmente entende seu contexto.

O usuário deve pensar:

> "Era óbvio que o sistema faria isso."

Nunca:

> "Que truque inteligente."

---

## 6. O universo está vivo

Mesmo sem interação:

- agentes trabalham
- conhecimento evolui
- relações aparecem
- índices atualizam
- integrações respondem
- eventos chegam
- prioridades mudam

O usuário entra em um organismo vivo, nunca em uma tela parada.

---

## 7. Tudo possui comportamento

Não existem ícones.

Existem entidades.

Cada objeto possui comportamento coerente com sua natureza.

A física comunica significado.

Nunca decoração.

Toda animação representa informação, atividade ou transformação real.

---

## 8. Zoom muda paradigma

Zoom não aumenta objetos.

Cada nível revela um novo modelo mental.

Exemplo:

Universo
→ Workspace
→ Agentes
→ Objetos
→ Chunks
→ Embeddings
→ Tokens

Cada escala possui sua própria linguagem visual.

---

## 9. Mostrar é melhor que explicar

Sempre que possível:

- visualizar
- demonstrar
- animar
- contextualizar

Antes de explicar em texto.

O usuário entende sistemas observando comportamento.

---

## 10. Transparência gera confiança

Toda decisão importante deve responder:

- por quê?
- como?
- com quais dados?
- com quais limitações?

Nunca esconda incerteza.

Nunca simule precisão.

Nunca invente contexto.

---

## 11. Continuidade acima de transições

Nada aparece.

Nada desaparece.

Tudo evolui.

Toda transformação deve possuir causa, consequência e continuidade observável.

O universo deve parecer existir independentemente da presença do usuário.

---

## 12. Agentes são entidades

Agentes não são prompts.

São trabalhadores persistentes.

Possuem:

- memória
- especialidade
- ferramentas
- responsabilidades
- contexto
- histórico

Eles colaboram, aprendem, delegam e evoluem continuamente.

---

## 13. Conhecimento possui gravidade

Conhecimento relevante atrai.

Conhecimento relacionado aproxima.

Conhecimento utilizado ganha influência.

Conhecimento esquecido perde massa.

O universo reorganiza-se continuamente conforme aprende.

---

# Antes de implementar qualquer coisa

Toda decisão deve responder às perguntas abaixo.

## Valor

- Resolve um problema real?
- Reduz trabalho do usuário?
- Aproxima o sistema da missão?

## Inteligência

- Antecipou uma necessidade?
- Aproveitou o contexto disponível?
- Eliminou uma pergunta futura?

## Interface

- Comunica através do comportamento?
- A animação representa um evento real?
- Existe continuidade física?

## Arquitetura

- Simplifica o sistema?
- É reutilizável?
- É observável?
- É segura?
- É resiliente?

Se alguma resposta for "não", reavalie a implementação.

---

# A Regra dos Cinco Minutos

Se um usuário abrir o SpatIA e permanecer cinco minutos sem fazer absolutamente nada, ele ainda deve perceber que existe inteligência em funcionamento.

O sistema continua observando, organizando, aprendendo, planejando e evoluindo.

A inteligência nunca depende de comandos para existir.

---

# O Princípio Final

Toda mudança deve responder uma única pergunta:

> **Depois desta implementação, o usuário precisará fazer mais perguntas ao sistema ou menos?**

Se precisar fazer mais perguntas, a implementação está errada.

O melhor momento para ajudar o usuário não é quando ele pergunta.

É alguns segundos antes de ele perceber que precisava perguntar.

---

# Filosofia de Engenharia

Sempre prefira:

- autonomia > automação
- contexto > configuração
- observação > entrada manual
- objetivos > comandos
- comportamento > documentação
- simplicidade > quantidade de features
- composição > acoplamento
- eventos > polling
- estado observável > estado implícito
- evolução contínua > ações isoladas
- segurança por padrão > segurança opcional
- degradar com elegância > falhar silenciosamente

Cada nova funcionalidade deve tornar o sistema mais inteligente, não apenas maior.

---

# As leis desta base

Escritas pelo usuário. **Valem sobre qualquer decisão técnica**, e sobre os Princípios acima
quando os dois se cruzarem: um princípio diz para onde ir, uma lei diz o que não se faz para
chegar lá.

**A REGRA DA FÍSICA** — *Nenhuma decisão de composição pode alterar a simulação. Se um problema pode
ser resolvido fora da simulação, ele deve ser resolvido fora dela.*
Proíbe de imediato: reduzir `R_s` para o buraco negro incomodar menos, enfraquecer a lente de perto,
alterar a geodésica por distância, trocar física por curva artística.
**O corolário vale mais que a regra:** quando a física produz exatamente o fenômeno esperado, o
defeito costuma estar em **linguagem visual**.

**A REGRA DA INSPEÇÃO** — *Todo objeto tem de poder ser rotacionado.*
O padrão que a satisfaz: **em foco vira MUNDO; fora de foco continua billboard.**
Dois modos de falha silenciosos: (1) a malha virou mundo mas o **ÂNGULO** não chegou ao shader — um
uniform servindo a dois donos (tela × física); (2) **objeto com dois modos precisa dos dois na
bancada**, senão o caminho onde o defeito mora não é desenhável.
Ainda violam (auditado, nada consertado): `remnant.js:145`, `nebula.js`, `comet.js:577`,
`pulsar-pulse.js:169`, `bodies.js:236`, `satellites.js:189,263`. ⚠️ Varra o COMPORTAMENTO, não a
string — a galáxia não tinha `quaternion.copy` e era billboard no vértice.

**A REGRA DO CATÁLOGO** — *Nomeie os tipos que a classe ACEITA; nunca exclua os que ela não aceita.
Ponha a proibição em `forbids`.*
Classificar por exclusão (`type !== 'file'`) fazia uma LUA em foco resolver como GALÁXIA.
**E o corolário que esta base já pagou CINCO vezes: declarar uma invariante não a implementa.** A
auditoria que acha isso é barata (varra cada chave declarada e procure um leitor) e vale rodar depois
de toda entrada nova no catálogo, no `tuning.SPEC` ou num vocabulário de métrica.

**A FRONTEIRA FÍSICA × COGNITIVA** — *Nenhuma grandeza física é derivada de uma variável cognitiva
sem uma unidade e uma constante física explicitamente definidas.* Escrita em 08/08.
`EntityPhysics` não tem grandezas SI: `chunks` é contagem de conhecimento, `scale` é degrau,
`activity` é toque em 30 dias. São metáforas — legítimas, e é o que faz a cena significar algo. O que
não pode é uma delas atravessar para onde a matemática precisa ser física, porque o caminho é curto e
calado: `chunks → "massa" → gravidade → órbita → lente`, e no fim ninguém sabe onde a metáfora
terminou.
⭑ **A saída é RAZÃO, não massa:** `alfa = 2·(R_s/R)` e `R_s/R` é ADIMENSIONAL — atravessa qualquer
escala sem `G`, sem `c`, sem quilograma. Basta a razão da CLASSE. O buraco negro é legítimo porque
`R_s` É a propriedade definidora dele; o pulsar porque `0,4` é o fato de uma estrela de nêutrons.
O portão é `scripts/lente-estelar.mjs`. Detalhe e tabela: §11.2 do `replanejamento-celeste.md`.

**As duas leis do Neo4j:** (1) ele muda o **BRILHO, nunca a CLASSE** — se `centrality` decidisse
classe, um container caindo faria corpos trocarem de identidade; (2) ele **nunca está no caminho do
quadro** (materialização → snapshot → servidor anexa → renderer lê pronto). E **`null` ≠ `0`**:
`null` é "não medi", `0` é "medi e é periférico".

**A REGRA DO FOCO** — *Nada deve competir com o objeto que está em foco.* Escrita em 09/08.
A superfície não é fixa: ela segue o que o operador está FAZENDO.

| ele está | quem domina |
|---|---|
| navegando | o universo |
| lendo | o conteúdo |
| conversando | o agente, e **temporariamente** |
| inspecionando | o inspector abre |
| navegando pela árvore | a árvore abre |

⭑ **É mais forte que "deixar os painéis menores", e a diferença é de natureza:** encolher trata todos
os estados como o mesmo estado. Esta regra diz que a tela tem MODO, e que o modo sai do gesto.

☠️ **A LEI VALE PARA A UI INTEIRA, não para a cena principal.** Ela nasceu de um review sobre a cena
de foco, e ali é onde ela MENOS rende: medido nas dez rotas, a raiz é a mais leve (**5,4% de glifo ·
88,4% de céu**) e `journal` é a mais pesada (**24,7% · 60,2%**). *"O objeto em foco"* não é sempre um
astro — em `journal` é a execução sob leitura, em `metrics` é o gráfico, em `files` é o arquivo.
**Aplicar a regra só ao céu é consertar a tela menos quebrada.**

☠️ **"DOMINAR" É ADJETIVO ATÉ ALGUÉM DIZER DE QUE GRANDEZA SE FALA** — e são três, medidas em
`bancada-hud.html`: **texto** (glifo disputando o olho), **tinta** (superfície cobrindo o céu) e
**ponteiro** (`spatia.hud()`, onde o gesto de órbita morre). Elas não se substituem: `metrics`
reivindica **33,1%** ao ponteiro com apenas **10,3%** de glifo. Quem afirmar que algo "domina" diz
em qual das três, ou não afirmou nada.

☠️ **RECOLHER NÃO É DESMONTAR, e é essa distinção que impede a regra de virar defeito.** O conjunto
residente (`apps/residentes.js`) declara, com o motivo escrito, o que TODA rota monta. Ceder espaço
é `data-collapsed`; tirar da tela é outra coisa, e `timeline` diz por quê — *"sair dele numa rota é
PERDER a continuidade, não escondê-la"*.

⚠️ **A exceção, e ela é MEDIDA, não gosto: CONTROLE DE ESTADO ATIVO NÃO CEDE.** `sky-time` governa a
janela temporal do céu, que está ligada em toda rota — *"fora da tela ela fica ativa e sem controle,
filtrando o corpus por uma data que ninguém vê"*. Um controle escondido não deixa de agir; ele deixa
de ser corrigível, e o operador passa a ver um corpus filtrado sem saber por quê. **Some o que
INFORMA; fica o que COMANDA algo que está ligado.**

⭑ `answer` já é o exemplar da regra: sem resposta ele **não desenha nada**. Residente e de custo zero
quando não tem o que dizer — é assim que os outros deviam se comportar.

A tarefa é **T-71**; a bancada é onde ela se julga antes de ir para o app.

---

**A distinção que vale para toda dimensão nova:** *"a dimensão existe" ≠ "a dimensão tem poder
estatístico para classificar"*. Dimensão presente e fraca vale um número pequeno **com o veredito ao
lado** (`evidenciaDeUso()`), nunca um número que finge.

---

# Commit — o que ele exige aqui

⚠️ **Commit exige REVIEW antes** — e review aqui é rodar `node scripts/leis.mjs` **e provar por
MUTAÇÃO** que os oráculos reprovam. ☠️ **Oráculo que nunca foi visto falhando não é guarda: é teste
verde.** E a mutação tem de ser vista derrubando a lei que ela ataca **pelo nome** — verde depois de
mutar é resultado a INVESTIGAR, nunca a comemorar.

⚠️ **Commite por ARQUIVO, nunca por diretório**, quando houver outra sessão escrevendo — `git add
docs/` já varreu trabalho alheio para dentro de um commit uma vez.

⭑ **Estas regras deixaram de depender de memória.** `.claude/hooks/` tem os guardas do AGENTE,
versionados e legíveis, ligados em `.claude/settings.json`: `guarda-bash.sh` RECUSA estagiar por
diretório (a checagem é `[ -d ]`, não nome); `par-de-docs.sh` MEDE se `HANDOFF.md` e `roadmap.md`
divergiram e só fala quando divergiram; `estado-da-sessao.sh` injeta o estado VIVO da árvore —
branch, sujos, portão armado ou não — e **nada de doutrina**, que já mora aqui.
⚠️ **O escopo do `guarda-bash` é estreito de propósito:** as duas formas de burlar o portão já são
recusadas por um hook no nível do USUÁRIO — medido, visto bloqueando. Reimplementá-las aqui seria a
segunda fonte para a mesma recusa.
⚠️ **E hook nenhum prova por MUTAÇÃO** — isso continua sendo trabalho de quem revisa.

⭑ **O corpo do commit é LONGO aqui de propósito**, com a medida que decidiu cada número: ele é o
lugar da história, e é o que permite aos docs não a contarem.

---

# Manter a documentação — o que ela é, e o que ela não é

Um doc desta base responde **duas** perguntas: *"o que é verdade AGORA"* e *"como não cair na
armadilha"*. Ele **não** conta o que aconteceu. Isso não é gosto de estilo: contexto é finito, e
cada linha de história desloca uma linha que teria evitado um erro.

## O teste da narrativa

> **Apague a frase. Se ninguém perde a capacidade de AGIR, era narrativa.**

Marcadores quase infalíveis — passado sobre o **próprio código ou o próprio doc**:

| ☠️ narrativa | ⭑ o que fica |
|---|---|
| *"era `massRank` e passou a ler `chunks`"* | *"lê `chunks` contra o limiar de colapso"* |
| *"este documento afirmou o errado por várias sessões"* | *"o objeto é `spatia`; quando doc e código discordarem, o código está certo"* |
| *"consertei o X no commit abc123"* | (nada — vai para o corpo do commit) |
| *"o handoff morava em `.cache/` e agora está em `docs/`"* | (nada — o arquivo está onde está) |
| *"a regra já foi ignorada uma vez"* | a regra, no imperativo |

⚠️ **Uma exceção, e é só uma: a REFUTAÇÃO MEDIDA fica.** *"`rocheLimit(raio)` não dispensa
`DENSITY_K` — a constante mora em `physicalRadius`"* está no passado e **não é história**: é o que
impede a próxima sessão de reimplementar o erro. A diferença é o tempo verbal do EFEITO — história
descreve o que mudou, refutação descreve o que continua verdade sobre o futuro. Se apagar a linha
faz alguém refazer um trabalho já pago, ela fica.

## Onde cada coisa mora

| conteúdo | lugar | por quê |
|---|---|---|
| o que o usuário GANHA | `README.md` | é a única superfície que alguém de fora lê |
| como se mede, e o que morde | este arquivo | carregado em toda sessão |
| **por que é assim** | comentário do MÓDULO | é onde a próxima pessoa tropeça |
| o que está aberto AGORA | `docs/HANDOFF.md` | |
| ordem, e o que cada peça destrava | `docs/roadmap.md` | |
| **a história** | corpo do commit | e ele é longo aqui **de propósito** |

☠️ **A ORDEM DE PRECEDÊNCIA, quando duas fontes discordam: o CÓDIGO vence o doc, e o doc vence o
relatório de agente.** Relatório de subagente é leitura, não medida — ele já afirmou que uma feature
faltava enquanto o código a tinha e um doc a registrava como fechada, e a afirmação entrou no
handoff por cima dos dois. **Confira no código antes de escrever no doc o que um agente relatou.**

⭑ **`HANDOFF.md` e `roadmap.md` mudam JUNTOS** — são a mesma verdade por dois lados. Fechar tarefa
num obriga a fechar o item no outro. Divergiram, os dois estão errados.

## Fechar um item é MOVER, nunca anexar

Ao dar por concluído qualquer item, o relato **sai** e o resíduo se distribui: a armadilha vai para
a lista de armadilhas, o número para a lista de números, o resto para o corpo do commit. **Anexar
"o texto original fica pelo valor do sintoma" é como estes arquivos incham** — foi assim que uma
seção de handoff chegou a 462 linhas com quase nada acionável dentro.

⚠️ **Orçamento de tamanho, e ele é uma medida, não uma meta:** se `HANDOFF.md` passar de ~800 linhas,
alguma coisa está sendo contada duas vezes. Procure o duplicado antes de cortar o que parece velho.

## Todo número num doc é uma mentira em potencial

Número sem procedência **não envelhece — apodrece**, porque nada acusa quando ele deixa de valer.
Todo número escrito carrega **de que corpus** e **quando**, ou vira "medida" com cara de fato:

- *"o fixture tem 14 arquivos"* sobreviveu até virar 71. Ninguém percebeu porque não havia data.
- *"74 arquivos · 2.606 pontos"* passou a ser 72 · 2.514 e continuou sendo citado.

⭑ **A saída é dizer de onde o número sai**, para quem ler poder refazê-lo: *"a contagem do dia vem
do `/api/graph`, nunca deste parágrafo"*.

## Briefing é ANDAIME

Um `docs/briefings/*.md` existe para ser **dissolvido**. Ao destravar um item dele: marque no
briefing **e anuncie no `README.md`** como feature/capability — item entregue que ninguém sabe que
existe é o mesmo que não entregue. Quando o conteúdo estiver todo diluído nos docs permanentes,
**apague o arquivo**: o git guarda o texto, e o que não pode existir são duas fontes divergentes
sobre a mesma coisa.

⚠️ **A triagem que vale para todos:** os briefings **acertam a ESTRUTURA e erram as FOLHAS**. Onde
nomeiam uma RELAÇÃO, acertam — e às vezes descrevem algo que já existe com outro nome. Onde nomeiam
um FATO DE MUNDO, descrevem um corpus que não existe. Leia cada linha perguntando qual das duas é.

## Antes de corrigir um nome em massa

☠️ **Nunca `sed` num nome sem separar os homônimos.** As sondas se chamam `spatia.*`, mas
`espatial.trace`, `espatial.*.v1` e as métricas `espatial_*` mantêm o nome antigo **de propósito**:
renomear a chave não migra o que está gravado, e a afinação feita à mão evapora em silêncio. A
tabela de `docs/identidade.md` existe para impedir exatamente esse `sed`. **Leia cada ocorrência.**

# As ferramentas de `scripts/`

Elas existem porque este projeto tem um modo de falha característico: **a feição some, o shader
continua lá, e a tela não mente nem acusa — ela deixa de afirmar.**

## ☠️ Só uma linha importa, e é esta

    node scripts/leis.mjs

Roda **todos** os guardas e sai 1 se qualquer um cair. **~3,6 s.** Está instalado como
`pre-commit`; num clone novo, **`make hooks`** — ele aponta o git para `.githooks/`, que é
VERSIONADO. ☠️ `.git/hooks/` não é, e era assim que um clone nascia sem guarda nenhum.

⚠️ **Este parágrafo dizia o contrário — *"nenhuma delas roda sozinha; a pergunta diz quando
usá-las"* — e essa era a razão de os defeitos passarem.** Com 4 oráculos respondendo perguntas
estreitas, escolher qual rodar era razoável. Com 22 a 3,6 s, escolher é como se perde guarda:
medido numa sessão só, quatro deles não guardavam o que diziam (lista branca que não via o quinto
arquivo; lei cega para uma das duas cenas; fato de mundo gravado como lei; `RAIZ` que fazia o
oráculo passar sobre uma cópia MUTADA). **Quantidade de arquivo não é cobertura.**

⭑ `--lista` mostra o que roda e o que NÃO roda com o motivo. Quem não roda é só quem **muta estado
compartilhado** (`.cache/`, o Neo4j, o fixture) — e isso é MEDIDO no fonte, não listado à mão: a
lista e a medida discordarem derruba o portão.

As perguntas individuais continuam valendo para saber **o que** cada um responde — é para isso que
serve o resto desta seção.

## Antes de mexer no buraco negro

| script | a pergunta | quando |
|---|---|---|
| `campo.mjs` | o campo de deflexão ainda é MONÓTONO? | qualquer edição na geodésica |
| `costura-disco.mjs` | o disco fecha a volta sem cicatriz radial? | ao tocar no ruído do disco |
| `lado-distante.mjs` | o lado distante ainda afunila 3–6,7×? | ao mexer na integração ou na pose |
| `lente-estelar.mjs` | este corpo vale **um pixel** de deflexão? quem dobra a luz tem razão `R_s/R` declarada? | ao mexer na lente, ou ao propor lente em corpo novo |

⚠️ **`lente-estelar.mjs` também AUDITA o `scene.js`** (o outro que faz isso é o `lei-cena.mjs`,
abaixo), e ele existe por causa de um
relato: *"um planeta passa atrás de uma estrela e não há a distorção esperada"*. A medida diz que a
ausência é o comportamento CERTO — uma estrela tipo Sol deflete **0,0075 px** no limbo, 133× abaixo do
piso de um pixel, e o anel de Einstein dela só sai de dentro do próprio disco a 10⁵ raios (as 548 UA
da lente solar). Sem oráculo, essa conclusão vive numa conversa e a próxima pessoa implementa.

> **A saída da armadilha:** a deflexão no limbo é `alfa = 2·(R_s/R)`, e `R_s/R` é **adimensional**.
> Não é preciso converter `chunks` em quilogramas — basta a razão da CLASSE, que é fato astronômico.
> É o que o pulsar já faz (`0,4` = ~4 km de Schwarzschild para ~10 km de raio de uma estrela de
> nêutrons). **Nenhuma grandeza física pode ser derivada de uma variável cognitiva sem unidade e
> constante explícitas** — e o oráculo falha se alguém tentar.

São **oráculos**: rodam em `node`, sem navegador e sem GPU, e transcrevem o GLSL. Um deles falhando
é uma invariante quebrada, não um teste chato — `blackhole-geodesic.js` cita o `campo.mjs` pelo
nome como quem garante que as cinco invariantes seguem intactas.

⚠️ **Eles têm de acompanhar o shader.** A fonte é o GLSL; a transcrição é cópia. Mudou um, mude o
outro, ou o oráculo passa a atestar código que não existe mais.

## Antes de commitar shader

    node scripts/check-shaders.mjs

Guarda estática dos blocos GLSL. Pega as duas armadilhas que já morderam quatro vezes e que
**falham em silêncio**: crase dentro de `/* glsl */` fechando o template literal, e o shader que
compila mas perde a feição.

## Ao mexer na sonda da HUD

    node scripts/lei-hud.mjs

Prova, num DOM de mentira com geometria conhecida, que `spatia.hud()` mede **área que aceita
ponteiro** e não área desenhada (na cena de prova a HUD pinta 100% da janela e reivindica 33,8%),
que forma sem identidade **acusa** em vez de sumir, que nenhum ponto se perde na atribuição, que
recolhido · não montado · declarado-e-ausente · **espremido** saem em caixas diferentes, e que a
sonda não escreve no que mede. Ele recorta o bloco `⟦sonda-hud⟧` do próprio `src/main.js` e o
executa — **marcador apagado REPROVA**, porque desligar uma lei em silêncio é como esta base perde
guarda.
☠️ **A QUARTA caixa é `espremidos`: montado, ABERTO, e desenhando menos que uma linha.** Item de
flex encolhe, e o que perde a disputa não fica menor — fica com ZERO, com `montado` e `aberto`
ainda VERDADEIROS e o operador sem ver nada. A régua é DERIVADA (`line-height` do próprio corpo,
`font-size × 1,2` quando sai `normal`): número fixo valeria numa fenda e mentiria na outra.
⚠️ **`orcamento.cabe: false` é DEFEITO; `orcamento.pressao > 1` NÃO É** — o segundo é rolagem ou
poda, o comportamento normal de conteúdo longo. Confundir os dois faz a régua acusar o céu inteiro.
⚠️ **Ramo sem cena não é ramo guardado:** o reserva `font-size × 1,2` passou verde sob mutação
enquanto as cenas de prova declaravam `line-height` em px. Ele tem cena própria agora.

## Ao mexer na lista de fontes, ou no CSS do palco

    node scripts/lei-fontes.mjs

Prova que a vista da lista de fontes tem **teto, rolagem, ponteiro e scrim em gradiente**, e — a
metade que importa — que o teto **não corta a lista**: as 24 fontes ficam no DOM, o total viaja
publicado num cabeçalho grudado, e o clique numa citação rola até a linha dela. ☠️ **`[n]` é
contrato com o prompt:** lista truncada faria `citeMark` desenhar como INVENTADA uma fonte real.
Ele lê o CSS pela **cascata** — duas regras disputando o teto acusam, porque quem decide aí é a
ordem e o oráculo não adivinha ordem — e varre o `answer.js` **sem os comentários**, senão a prosa
que explica por que `scrollIntoView` é proibido satisfaz a lei que o proíbe.

## Ao mexer no que a lista de fontes esconde, ou nos painéis que ela repete

    node scripts/lei-referencia.mjs

Prova que uma linha só sai da lista quando um painel **VISÍVEL** já a afirma — e que ela nunca é
apagada, só APONTADA: o `[n]` sobrevive numa linha que nomeia o painel, porque o painel não mostra
número nenhum e `[n]` é contrato com o prompt. A testemunha é MEDIDA no DOM, e são quatro perguntas
que falham todas para o lado seguro: nó no **sótão** (`index.html`, `.attic`) não é painel montado,
painel **recolhido** não mostra nada, a **poda** do painel (`WEB_LIMIT`) engole resultado que a
lista então precisa manter, e moldura sem título não sabe se chamar. ☠️ **«O painel está montado»
nunca vale por «o painel está mostrando ISTO»** — a conferência é por FONTE, nunca por rota. A §3
roda a montagem em cinco configurações de tela e conta os `[n]`: nenhum a menos, na mesma ordem.
⚠️ A §6 liga o NOME que observa ao `new MutationObserver` que o construiu — procurar o construtor
no arquivo deixava a lei verde com um dos dois observadores trocado por um objeto de mentira. E a
§8 é CENSO: os limites saem de `agent.py`, `websearch.py` e `streams.js`, e **quantas linhas de
fato saem é medida de tela** (`spatia.hud().fontes`), nunca deste parágrafo.

## Ao mexer em `pointer-events`, ou em qualquer superfície sobre o céu

    node scripts/lei-palco.mjs

Prova que no palco **quem PINTA reivindica o ponteiro e quem só POSICIONA cede**: a moldura do
painel de palco (`flex: 1`, estica pela coluna central, `background: none`) cede, o `.widget-body`
(fundo, borda, teto de 62vh) reivindica, e o escape do painel VAZIO alcança também o `.scroll` —
☠️ `pointer-events` não é herança que descendente respeite, e filho com `auto` volta a ser alvo sob
ancestral `none`. A §6 é VARREDURA: **toda** regra do `index.html` que conceda `pointer-events:
auto` tem de se justificar pelo próprio CSS — pinta, ou é controle (`cursor`/`a`/`button`/`input`/
`.clickable`) — ou constar de `CEDEM_SEM_PINTAR` com o motivo; forma desconhecida ACUSA, e entrada
que não casa mais nada é acusada como tabela velha. ⚠️ Ele lê o CSS DECLARADO: **quanto de céu
sobra por rota é medida, não lei**, e quem responde é `spatia.hud().painelDePalco.aoPonteiro`.

## Ao mexer na lista de widgets de uma rota

    node scripts/lei-residentes.mjs

Prova que o CONJUNTO RESIDENTE — os widgets que toda rota monta — é declarado num lugar só
(`RESIDENTES`, `src/apps/residentes.js`, cada id com a frase do motivo) e IMPOSTO no registro:
`declararApp`/`declararVista` recusam a lista incompleta, e a recusa é enfiada no portão de verdade,
um residente por vez. A varredura da fonte fecha as duas fugas: rota que alcança o `registerApp` do
kernel por fora, e a **rota raiz** — que não é app, e que um portão montado só no `registerApp`
deixaria de fora sendo a rota inicial. ⚠️ **A §4 audita o DOC:** `OS-SCREENS.md` §0 tem de APONTAR
para a declaração; transcrever a lista lá foi como ela divergiu, e `#/security` ficou sem `timeline`
com a regra escrita em dois lugares e imposta em nenhum. O §5 é censo (medida, não lei) e é de onde
sai o número de rotas por widget.

## Ao mexer no documento ancorado no corpo em foco

    node scripts/lei-ancora.mjs

Prova, num DOM de mentira com geometria conhecida, que o painel do corpo travado **não foge** (a
caixa de `getBoundingClientRect` já inclui o `transform`, e ler a caixa deslocada realimenta — o
painel anda `dx` por quadro até sair da janela, **sem erro nenhum**), que a caixa PINTADA fica
dentro da JANELA nos 180 enquadramentos varridos, que as quatro causas de *"não se moveu"* saem por
NOME (sem corpo · painel não montado · atrás da câmera · eclipsado), que a LUZ do corpo **não
repinta por quadro** e que tudo o que ele escreve está no namespace `--ancora-*` — propriedade
customizada não altera comportamento sozinha, e é isso que impede o módulo de mexer na regra do
palco por acidente.
☠️ **O piso da §6 é a JANELA, não a `MARGEM_PX` do módulo:** a lei importa a constante, então
conferir contra ela é tautologia — visto por mutação, baixar a margem relaxava a lei junto.
☠️ **Teto sobre o DESLOCAMENTO é proxy:** `dx` dentro do teto com a borda esquerda do painel em
**−102 px** na tela. Oráculo que mede proxy afirma sobre a coisa errada.
⚠️ **A §10b confere a PRÓPRIA PREMISSA** — ela afirma sobre «o painel livre», e uma varredura que
deixa o painel prender mede outra coisa e reprova comportamento certo.

## Ao criar um script novo em `scripts/`

    node scripts/lei-tooling.mjs

⭑ **Script novo entra na sequência porque a lei recusa deixá-lo órfão.** Ela mede quem muta estado
compartilhado — recortando a medida de `leis.mjs`, que é a dona dela — e exige um alvo no
`Makefile` para cada um. Guarda novo não precisa de nada: `leis.mjs` o descobre sozinho.
⚠️ **A cadeia é DERIVADA do fonte**, nunca declarada: quem lê um `.cache/X.json` depende de quem o
escreve, quem lê o grafo depende de quem escreve nele. A lei reprova a receita que chame um
dependente antes da dependência **ou sem ela**, e o diagrama de doc que omita uma aresta medida.
☠️ **A varredura é sobre a MEDIDA, não sobre `NAO_RODAM`** — conferir a lista declarada deixaria
passar justo o caso que importa, o script recém-criado que ainda não está em lista nenhuma.
☠️ **E o nome no diagrama é casado SEM extensão:** procurar só `x.mjs` faz a lei passar sobre um
bloco que escreveu `x`.

## Ao mexer em quem decide o corpo em foco na entrada

    node scripts/lei-foco.mjs

Prova que o ENDEREÇO pedido vence o ÚLTIMO VISITADO **nos dois sentidos de montagem** — pedido antes
e depois da memória —, que destravar também é pedido, e que memória que cedeu não ressuscita.
☠️ **Pedir foco antes de a POSIÇÃO resolver perde o pedido em silêncio:** o laço de quadro solta o
foco de quem não tem posição. Todo pedido herda a espera que existia só para a memória.
☠️ **E a POSE gravada é da MEMÓRIA, nunca do pedido** — `startOrbit` é a pose do astro da sessão
anterior, e aplicá-la a um corpo pedido por endereço enquadra o novo com o zoom do antigo. Por isso
a origem viaja com o alvo até a aplicação, e o ramo que a lê está varrido no fonte.
⭑ Quem arbitra é `space/foco-de-entrada.js`, PURO: ele devolve a decisão, e a cena é quem age.

## Ao mexer no teclado

    node scripts/lei-teclado.mjs

Prova, simulando eventos num `window` de mentira, que **nenhuma tecla sobrevive a perder o foco** —
e que o despacho de atalho continua idêntico. Existe porque estado de tecla pressionada falha de um
jeito só: a tecla presa não tem sintoma além do movimento que não para (armadilha §B-23 de `docs/armadilhas.md`).

## Ao mexer em classificação, limiar ou constante calibrada

| script | o que mede |
|---|---|
| `censo-morfologias.mjs` | o que o céu DESENHA — classe · pele · morfologia por `kind` · modificadores |
| `censo-corpus.mjs` | o que o corpus É — forma, saúde das constantes calibradas, sinal de cada candidata |
| `censo-ontologia.mjs` | a ontologia nova — família, tipo, porte, fenômeno |
| `censo-superficies.mjs` | ⚠️ **obrigatório após tocar em roteamento de pele:** nenhuma pele roteada pode nascer vazia |
| `lei-neo4j.mjs` | ⚠️ **É ORÁCULO, e roda após tocar em `entity-physics.js`.** Perturba `centrality`, `usage` e `connectivity` em todo corpo e exige que **nenhuma** mude família, tipo, porte, fenômeno ou escala — a 1ª lei do Neo4j deixando de ser invariante declarada |
| `lei-cena.mjs` | ⚠️ **É ORÁCULO, e roda após tocar em `CENAS`/`aplicarCena`, `entity-physics.js`, `superficies.js` ou `solver.js`.** A cena é uma LENTE: ela decide o que ACENDE e de onde se OLHA, nunca o que um corpo É. Audita o vocabulário da tabela, os argumentos de todo call site dos três em `src/`, a pureza dos módulos, e perturba enfiando a cena por todo canal exposto. **A §5 guarda o VOCABULÁRIO DE PELE**: `resolveBody` não pode devolver valor de pele (conferido por VALOR, nunca por nome de chave) e só `superficies.js` o declara — homônimo entra em `VOCABULARIO_ALHEIO` com o motivo |

O `censo-corpus` existe por causa de três constantes que degradaram sem erro nenhum: `SPAN` (calibrada
com 71 hubs, aplicada em 228), `DENSITY_K` (corpus 5,6× maior, **297 luas viraram 0**) e o piso do
pulsar (medido no git, aplicado no índice, **0 corpos**). Ele acusa em vermelho a classe que ficou
sem população.

> **Toda constante derivada de `M_total` ou da contagem de hubs expira.** Quem reindexar um corpus
> muito maior refaz a conta — ela está no comentário de cada uma. O relatório completo, com o que
> foi refutado e por quê, está em [`docs/medicoes-2026-08-07.md`](./docs/medicoes-2026-08-07.md).

⚠️ **E existe um modo de falha PIOR que a constante expirada: a grandeza que piora sozinha.** Uma
constante calibrada funcionou um dia e o comentário dela diz quando refazer a conta. Já uma
grandeza derivada de **posto/percentil** para descrever um corpo de uma CLASSE nunca funcionou e
**encolhe conforme o corpus cresce** — a classe vive na cauda, e a cauda ocupa uma fatia cada vez
menor do posto. Medido no rig do pulsar: **16,9% do eixo** num corpus de 72 corpos e **0,36%** num de
276. A saída é a mesma da FRONTEIRA: **razão adimensional ancorada num limiar FIXO** (`chunks/80`,
como o `R_s/R`), nunca posto de população — e nunca renormalizar dentro da classe, que é a mesma
família de erro e é degenerada quando a população é 1.

⚠️ Os dois medem o **ÍNDICE**, nunca o disco. A diferença decide conclusões: o disco é 58%
TypeScript e o índice não tem um único `.ts`. Confundir os dois já produziu uma recomendação errada.

## Quando o céu parecer «todos iguais»

| script | a pergunta | quando |
|---|---|---|
| `censo-planetas.mjs` | quantos formatos VISUALMENTE distintos o corpus produz, e qual eixo colapsou | ao mexer em `planetParams`, na paleta ou nas faixas da rampa |

Ele **importa** `planetParams` e `resolveBody` em vez de transcrevê-los — a derivação é JS, então
não há oráculo a manter em dia. Conta só os nós cuja pele resolvida é planeta (363 dos 1 636
arquivos hoje); medir o corpus inteiro descreve um céu que ninguém vê.

Ele cria sozinho `node_modules/three/` reexportando `vendor/three.module.js` — o Node não lê o
importmap do `index.html` — e esboça `window`/`document` para o `motion.js` carregar. Nada vem da rede.

⚠️ A §6 (alcance da rampa) **transcreve** três linhas de `GLSL_TERRAIN` e a tabela `BANDS`; ela
carrega a obrigação dos oráculos. O `WET_EDGE` importado serve de trava — a §6 aborta se a
transcrição sair de sincronia.

## Ao precisar de um corpus que exercite tudo

    uv run --with fastembed python scripts/fixture.py            # cria repo + indexa
    uv run --with fastembed python scripts/fixture.py --limpar   # apaga repo + coleção

Corpus sintético em coleção própria (`espatial_fixture`) cujos arquivos levam cada eixo aos
extremos — **71 arquivos · 72 corpos · 20 sistemas** em 2026-08-09. ⚠️ Ele CRESCE conforme espécimes
entram e saem; a contagem do dia vem de `/api/graph`, nunca deste parágrafo. É o primeiro degrau da doutrina de [`docs/cobertura.md`](./docs/cobertura.md) — *o código
desenha este tipo?* — e o único jeito de exercitar um corpo que o corpus real não produz. `FIXTURE_ROOT`
sobrepõe o destino.

⚠️ Cobertura de TIPO não é cobertura de PARÂMETRO: um tipo presente prova que o caminho desenha,
não que o shader foi exercitado.

## Ao mexer nas dimensões do GRAFO — a cadeia de rematerialização

O Neo4j **nunca está no caminho do quadro**: cada dimensão é materializada por um script para um
arquivo em `.cache/`, o servidor anexa ao servir a topologia, e o renderer lê pronto. Rematerializar
é rodar o script — **a ordem importa**, porque a rede lê o snapshot e não o banco:

    make rematerializar          # a cadeia inteira, na ordem — é este o comando
      make grafo                 # ESCREVEM no Neo4j:  vinculos · similares · citacoes · uso
      make snapshots             # LEEM o grafo:       centralidade → vizinhanca → conectividade

⚠️ **`conectividade` LÊ `.cache/influencia.json` e SAI 1 sem ele** — `centralidade` vem antes, e a
pergunta dele é justamente se a dimensão nova REPETE a velha. ⚠️ `uso` está na fase de ESCRITA
porque dá `MERGE` em `Astro`/`Run`/`Agent`, embora também materialize um snapshot. `conceitos` fica
fora (`make conceitos`): é a única dimensão que não é fato, e só se roda quando a prosa muda.

⭑ **A ordem não é mantida à mão.** `scripts/lei-tooling.mjs` a DERIVA do fonte — quem lê um
`.cache/X.json` depende de quem o escreve — e reprova a receita que chame um dependente sem a
dependência, o script que nenhum alvo roda, e o diagrama de doc que omita uma aresta medida.

| snapshot | script | o que é |
|---|---|---|
| `influencia.json` | `centralidade.mjs` | `centrality` — quantos se parecem comigo |
| `uso.json` | `uso.mjs` | `usage` — quantas execuções me abriram |
| `conectividade.json` | `conectividade.mjs` | `connectivity` = **ALCANCE**, não grau (o grau repetia a centralidade, ρ 0,821) |
| `vizinhanca.json` | `vizinhanca.mjs` | os vínculos laterais que a seleção desenha |
| `conceitos.json` | `conceitos.mjs` | os assuntos — ⚠️ a única dimensão que **não é fato** |

☠️ **Todo snapshot carrega `corpus`, e o servidor RECUSA o que não é do céu servido.** Isto existe
por um defeito que custou um dia: os snapshots eram de outro corpus e a API respondia
`disponivel: true · corpos: 188 · vinculos: 4226` enquanto devolvia `vizinhanca: null` para todo
mundo — **a cena não desenhava um arco e o painel anunciava 4.226**. `connectivity` chegava a **0 de
72 corpos** com `stats.conexao` de cabeçalho cheio.

> **O padrão é o pior que existe nesta base: o cabeçalho AFIRMA e a carga está vazia** — pior do que
> faltar, porque quem lê o cabeçalho para de procurar. É `null` ≠ `0` aplicado ao snapshot INTEIRO.
> **Sem carimbo também é recusa**, e não tolerância: "não tenho como saber" não autoriza afirmar.
> Script novo que escreva snapshot **carimba `corpus`**, e o nome sai do `/api/graph` — do servidor,
> que é quem lê o `.env` — nunca de palpite. Ver `graphdb._recusa_de_corpus`.

⚠️ **`.env` (arquivo) vence o ambiente, e três variáveis estão exportadas no perfil do shell
apontando para lugares que não existem.** Elas produzem **zero com cara de medida**. Todo script que
fale com o corpus confere o override, ou herda o defeito.

## Ao suspeitar de custo

Cole `scripts/baseline.js` no console da aba da cena, com a **janela em primeiro plano**. Leva ~35 s
e mede FPS + `renderCost` em duas poses, junto com o ambiente (GPU, DPR, foco, aba oculta) — sem
isso a medida não vale, porque aba oculta é estrangulada pelo motor.

Referência já medida: o céu inteiro com 213 instâncias custa **0,31–0,35 ms**, contra 3,8–5,1 ms só
da lente do buraco negro. **Não existe "otimizar a galáxia"** — o orçamento está todo na lente.

## Ao mexer em erro de upstream

    python3 scripts/motivo-upstream.py

Sobe um upstream de mentira e confere se `status` e `reason` saem do FATO e não da frase. Sai 0
quando as quatro famílias batem. Existe porque dois rótulos de métrica não tinham ninguém capaz de
emiti-los.

## Ao mexer na continuidade da conversa

    python3 -m server.lei_fio

Sobe um CLI `claude` de mentira e confere a ARGV que o servidor montou: que `--resume` só aparece
havendo fio, que ele **convive com a `--settings` do portão** no mesmo comando, que a chave contada
pelo portão é a da EXECUÇÃO e não a da sessão, e que fio quebrado degrada anunciando. Sai 0 quando
as cinco leis batem. ☠️ **Ele desvia `journal.DIR` para um temporário e confere a cadeia real antes
e depois** — um oráculo do fio que escrevesse no ledger encadeado corromperia o que a base tem de
mais caro. ⚠️ O lugar dele é `scripts/lei-fio.py`; mora em `server/` por acidente de sessão.

## E o que NÃO está aqui

As sondas de runtime vivem na cena, não em `scripts/`. Elas respondem sobre **o quadro que está na
tela agora**, que é uma pergunta diferente da que qualquer script offline pode responder:

`spatia.session()` · `.state()` · `.tela()` · `.favoritos()` · `.hud()` · `.renderCost(n)` ·
`.planet()` · `.galaxy()` · `.lod()` · `.moons()` · `.bloom({…})` · `.core({…})` · `.pele(ajuste)` ·
`.peleAB(condições, ler)` · `.aroAB(condições, ler)` · `.cena()` (com `.composicao`) · `.ancora()` ·
`.universo.{sobreposicoes,entre,pixels,ancora,irPara,anexar,peles}()`

⚠️ **`spatia.hud()` mede LAYOUT, não quadro** — é a única que não precisa de `quadros` andando, e a
única que não prova nada sobre o que foi desenhado. ☠️ **A grandeza dela é área que ACEITA
PONTEIRO**, nunca área pintada: os ouvintes de gesto da cena estão presos ao `canvas`, então um
retângulo com `pointer-events: auto` por cima não disputa o clique — ele CANCELA órbita e zoom ali.

⚠️ **A lista viva está em `src/main.js`, no `window.spatia`** — antes de dizer "não dá para medir",
leia lá. E `spatia.cena().aneisPose` é o modelo do que uma sonda deve ser: ela devolve o
`deltaBillboard` **de controle** ao lado do `deltaCamera`, porque contagem não distingue objeto de
sinal (o modo do anel caiu duas vezes calado com a contagem intacta).

☠️ **Duas armadilhas que invalidam toda medida de tela**, e são dois testes, não um: a aba precisa
estar VISÍVEL (`document.hidden`) **e** a janela em foco (`document.hasFocus()`) — aba oculta é
estrangulada pelo motor, e qualquer comando de shell rouba o foco de volta. E `quadros` tem de
ANDAR entre duas leituras. ⚠️ `quadros` andando prova que a cena não congelou; **não** prova que ela
parou de se mover — grandeza que ainda se acomoda não é regime.

⚠️ **O objeto é `spatia`.** Quando um doc e o código discordarem, **o código está certo**. ⚠️ Não confunda com as CHAVES do
`localStorage` (`espatial.trace`, `espatial.*.v1`) e as métricas `espatial_*`: essas mantêm o nome
antigo **de propósito** — renomear a chave não migra o que está gravado, e a afinação feita à mão
evapora em silêncio (a tabela de `docs/identidade.md` existe para proteger exatamente isso).
