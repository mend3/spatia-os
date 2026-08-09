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
```

Eu ainda acrescentaria um último bloco, porque ele muda completamente a forma como um agente implementa funcionalidades:

```md
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
```

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
continua lá, e a tela não mente nem acusa — ela deixa de afirmar.** Nenhuma delas roda sozinha em
CI; todas respondem uma pergunta específica, e é a pergunta que diz quando usá-las.

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

## Ao mexer no teclado

    node scripts/lei-teclado.mjs

Prova, simulando eventos num `window` de mentira, que **nenhuma tecla sobrevive a perder o foco** —
e que o despacho de atalho continua idêntico. Existe porque estado de tecla pressionada falha de um
jeito só: a tecla presa não tem sintoma além do movimento que não para (armadilha 23 do handoff).

## Ao mexer em classificação, limiar ou constante calibrada

| script | o que mede |
|---|---|
| `censo-morfologias.mjs` | o que o céu DESENHA — classe · pele · morfologia por `kind` · modificadores |
| `censo-corpus.mjs` | o que o corpus É — forma, saúde das constantes calibradas, sinal de cada candidata |
| `censo-ontologia.mjs` | a ontologia nova — família, tipo, porte, fenômeno |
| `censo-superficies.mjs` | ⚠️ **obrigatório após tocar em roteamento de pele:** nenhuma pele roteada pode nascer vazia |
| `lei-neo4j.mjs` | ⚠️ **É ORÁCULO, e roda após tocar em `entity-physics.js`.** Perturba `centrality`, `usage` e `connectivity` em todo corpo e exige que **nenhuma** mude família, tipo, porte, fenômeno ou escala — a 1ª lei do Neo4j deixando de ser invariante declarada |
| `lei-cena.mjs` | ⚠️ **É ORÁCULO, e roda após tocar em `CENAS`/`aplicarCena`, `entity-physics.js` ou `superficies.js`.** A cena é uma LENTE: ela decide o que ACENDE e de onde se OLHA, nunca o que um corpo É. Audita o vocabulário da tabela, os argumentos de todo call site dos três em `src/`, a pureza dos módulos, e perturba enfiando a cena por todo canal exposto |

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

    vinculos.mjs · similares.mjs · citacoes.mjs   →  vizinhanca.mjs  →  conectividade.mjs
    centralidade.mjs · uso.mjs · conceitos.mjs    (independentes)

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

`spatia.session()` · `.state()` · `.renderCost(n)` · `.planet()` · `.galaxy()` · `.lod()` ·
`.moons()` · `.bloom({…})` · `.core({…})` · `.pele(ajuste)` · `.peleAB(condições, ler)` ·
`.aroAB(condições, ler)` · `.cena()` · `.universo.{sobreposicoes,entre,pixels,ancora,peles,anexar}()`

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
