---
name: context-hygiene
description: Onde cada fato MORA nesta base, e como não transformar código, docs ou tarefas em diário de investigação. Use ao escrever ou revisar comentário, docblock, doc em `docs/`, HANDOFF, roadmap, TODO, briefing ou relatório de conclusão — e antes de todo commit que toque em texto. Decide PROPRIEDADE e DURABILIDADE (este fato é de quem? sobrevive ao próximo refactor?); para decidir TAMANHO da prosa, use `documentation-minimalism`.
---

# Higiene de contexto

Contexto é finito. **Cada linha de história desloca uma linha que teria evitado um erro.**

Um texto desta base responde duas perguntas: *o que é verdade AGORA* e *como não cair na
armadilha*. Ele não conta o que aconteceu.

## O teste da narrativa

> **Apague a frase. Se ninguém perde a capacidade de AGIR, era narrativa.**

Aplique-o a toda frase nova antes de commitar. Ele é a lei; o resto deste arquivo é onde ela morde.

---

# 0. Onde cada fato mora

Antes de escrever qualquer coisa: **que artefato é DONO deste fato?** Se outro já é, aponte para
ele — nunca copie.

| fato | dono | por quê |
|---|---|---|
| o que o usuário GANHA | `README.md` | única superfície que alguém de fora lê |
| como se mede, e o que morde | `AGENTS.md` | carregado em toda sessão |
| **por que é assim** | comentário do MÓDULO | é onde a próxima pessoa tropeça |
| o que está aberto AGORA | `docs/HANDOFF.md` | |
| ordem, e o que cada peça destrava | `docs/roadmap.md` | |
| a lei/spec de um domínio | `docs/replanejamento-celeste.md`, `docs/catalogo-celeste.md` | é citável por cláusula |
| o que MENTE ao medir | `docs/armadilhas.md` | |
| número medido | `docs/medidas.md`, `docs/medicoes-*.md` | com corpus e data |
| comportamento verificado | um **oráculo** em `scripts/lei-*.mjs` | executável |
| o quadro que está na tela agora | uma **sonda** `spatia.*()` | só ela responde sobre runtime |
| **a história** | corpo do commit | e ele é longo aqui **de propósito** |

Não funda essas fontes numa narrativa só. E não crie um documento central que tente explicar tudo:
quanto mais perto o texto está do que ele descreve, menos ele apodrece.

## Direção da dependência

```text
lei / spec  →  documentação  →  código  →  oráculo / sonda  →  git
```

Documentação pode apontar para implementação. **Implementação tem de ser compreensível sem abrir
documentação de estado.**

---

# 1. Nada de narrativa

Não escreva parágrafo que descreva:

* o que o agente descobriu, tentou, notou, verificou ou consertou;
* o que quebrou e depois foi arrumado, ou quantas vezes foi investigado;
* o que outro documento afirmava antes;
* qual era o "estado de hoje" durante uma investigação;
* o raciocínio do agente, ou passos cronológicos de depuração;
* achado de depuração preso a uma execução;
* descrição emocional ou retórica de dívida técnica;
* aviso cujo único propósito é dramatizar;
* status de tarefa que outro documento já representa.

| ☠️ narrativa | ⭑ o que fica |
|---|---|
| *"era `massRank` e passou a ler `chunks`"* | *"lê `chunks` contra o limiar de colapso"* |
| *"este documento afirmou o errado por várias sessões"* | *"o objeto é `spatia`; quando doc e código discordarem, o código está certo"* |
| *"consertei o X no commit abc123"* | (nada — vai para o corpo do commit) |
| *"a dívida encolheu, e este parágrafo listava sete tarefas…"* | (nada — o roadmap é dono do status) |
| *"a regra já foi ignorada uma vez"* | a regra, no imperativo |

Se o achado for requisito durável, ele vira requisito:

```md
## Evidência de navegador

Aba VISÍVEL, janela em FOCO, e `quadros` andando entre duas leituras.
```

Se for restrição de implementação, vira comentário de módulo. Se for comportamento, vira oráculo.
Se for história, vira corpo de commit.

---

# 2. As três exceções desta base — e são só três

☠️ **Fora destas, passado é narrativa e sai.**

### 2.1 A refutação MEDIDA fica

*"`rocheLimit(raio)` não dispensa `DENSITY_K` — a constante mora em `physicalRadius`"* está no
passado e **não é história**: impede a próxima sessão de reimplementar o erro.

A diferença é o tempo verbal do EFEITO — história descreve o que mudou, refutação descreve o que
continua verdade sobre o futuro. **Se apagar a linha faz alguém refazer um trabalho já pago, ela
fica.**

### 2.2 Todo número carrega PROCEDÊNCIA — de que corpus, e quando

Isto não conflita com a proibição de datas: data em narrativa sai, data em MEDIDA é obrigatória.
Número sem procedência não envelhece, **apodrece** — nada acusa quando ele deixa de valer
(*"o fixture tem 14 arquivos"* sobreviveu até virar 71).

Melhor que carimbar é dizer de onde o número SAI, para quem ler poder refazê-lo:
*"a contagem do dia vem do `/api/graph`, nunca deste parágrafo"*.

### 2.3 O documento explicitamente temporal

`HANDOFF.md`, `roadmap.md`, changelog, release notes, relato de incidente. Só neles *"ainda falta"*,
*"em aberto"*, *"o restante é"* são legítimos — e ainda assim como ESTADO, nunca como crônica.

---

# 3. Comentários de código

Comentário explica **código**, nunca história de projeto. Use quando o código seria enganoso,
surpreendente ou perigoso de modificar.

Explique: invariante não-óbvia · restrição intencional · decisão algorítmica necessária à correção ·
esquisitice de runtime/GPU · requisito de sincronização · fronteira de segurança · comportamento
sensível a custo · **por que uma implementação aparentemente mais simples está errada**.

```js
// O uniform de ÂNGULO serve a dois donos (tela × física); separá-los é o que
// mantém a malha em foco rotacionável sem o shader continuar em billboard.
```

Nunca:

```js
// Descobrimos este bug na investigação de 9 de agosto.
// Isto mudou porque a T-52 falhou.
// TODO: arrumar depois que o roadmap for atualizado.
// IMPORTANTE!!! Isto foi extremamente difícil de depurar.
```

**O código não conhece tarefas, agentes, tickets nem investigações.**

---

# 4. Docblocks

Docblock descreve **o símbolo**, e serve a API pública, símbolo exportado, classe e módulo.

```js
/** Devolve a razão adimensional `R_s/R` da CLASSE do corpo, ou `null` se ela não é declarada. */
```

Não:

```js
/**
 * Adicionado depois que descobrimos, na investigação de navegador de 9 de agosto,
 * que a cena reportava zero quadros. Ver roadmap.md, armadilhas.md e T-52.
 */
```

O segundo cria a dependência `código → doc de estado → histórico de tarefa`. A desejada é
`doc → código`.

---

# 5. Documentação referencia código

Prefira referência estável ao símbolo:

```md
A área que aceita ponteiro é medida por `spatia.hud()`.
```

Não embuta detalhe que fica obsoleto no próximo refactor (*"usa três variáveis, um callback de RAF,
um closure mutável e um `setTimeout` de reserva…"*). **O código é autoridade sobre implementação; o
doc é autoridade sobre contrato, arquitetura e decisão que não se infere do código com segurança.**

---

# 6. Código cita LEI, nunca ESTADO

⚠️ **Esta base cita docs no código de propósito, e está certa** — mas só uma classe de doc.

⭑ **Pode:** cláusula NUMERADA de uma lei ou spec — `replanejamento-celeste.md §2.7.1`,
`armadilhas.md §B-23`, o oráculo que guarda a invariante pelo nome (`scripts/campo.mjs`), ou uma
especificação externa (`RFC 6455`). São contrato: a cláusula tem endereço, e alguém a mantém.

☠️ **Não pode:** `roadmap.md`, `HANDOFF.md`, número de tarefa, briefing. São ESTADO — mudam sem
avisar o código, e amarram o módulo a um instante.

O teste: *a coisa citada tem endereço estável e alguém responde por ela?* Se a resposta é "é o que
estava aberto na época", não cite.

---

# 7. Evidência aqui é ORÁCULO e SONDA — não existe suíte de testes

☠️ **Não há um único arquivo de teste nesta base.** Quem prova comportamento é:

| pergunta | quem responde |
|---|---|
| a invariante continua valendo? | um **oráculo** em `scripts/lei-*.mjs`, no portão `make leis` |
| o que está no quadro AGORA? | uma **sonda** `spatia.*()` |
| a classe ficou sem população? | um **censo** em `scripts/censo-*.mjs` |

Não afirme em prosa o que um executável pode provar:

```text
afirmação  →  dá para executar?  →  SIM  →  oráculo
                                 →  NÃO  →  documente a invariante
```

⚠️ **E oráculo só conta depois de ser visto FALHANDO por mutação** — verde nunca provou nada. Ver
`AGENTS.md`, *Commit — o que ele exige aqui*.

⭑ Censo e medida de tela são **medida, não lei**: relatam, não reprovam. Não escreva um número de
censo como se fosse invariante.

Screenshot, traço e relatório são artefatos de evidência. Não transforme a existência deles em prosa
quando o artefato é alcançável.

---

# 8. Investigação é efêmera por padrão

Hipótese, tentativa que falhou, log, comando, medição solta, instrumentação temporária: isso vive no
contexto de trabalho, no scratchpad, na discussão ou no corpo do commit. **Não promova
automaticamente** para README, doc permanente, comentário, descrição de tarefa ou changelog.

### Regra de promoção

Um achado entra em doc durável só quando vira **fato durável**.

| efêmero | durável |
|---|---|
| *"testei três abordagens e a B era instável"* | *"medida de quadro exige aba visível e janela em foco"* |

O primeiro descreve uma investigação; o segundo, uma restrição reusável do sistema.

⚠️ **Relatório de subagente é LEITURA, não medida.** A ordem de precedência quando as fontes
discordam é **CÓDIGO > doc > relatório de agente**. Confira no código antes de escrever no doc o que
um agente relatou.

---

# 9. Verdade temporal

Fora dos documentos da §2.3, evite: *"atualmente"*, *"no momento"*, *"em 9 de agosto"*, *"ainda
precisamos"*, *"isso mudou recentemente"*, *"o trabalho restante é"*.

Prefira o atemporal: **"medida de quadro exige aba visível e janela em foco."**

---

# 10. Não duplique estado

Um fato tem UM dono. Se o roadmap é dono do status, ele não é copiado para README, comentário, outro
checklist ou nota de agente. Se o código é dono do detalhe, o doc não o repete.

⭑ **A exceção declarada:** `HANDOFF.md` e `roadmap.md` são a mesma verdade por dois lados e mudam
JUNTOS. Fechar tarefa num obriga a fechar o item no outro. **Divergiram, os dois estão errados** — e
há um hook que MEDE essa divergência.

⚠️ **Transcrever uma lista que outro arquivo declara é como ela diverge.** Doc que fala de um
conjunto declarado em código **aponta para a declaração**; não copia os itens. (`OS-SCREENS.md` §0
aponta para `RESIDENTES` por isso, e um oráculo audita o apontamento.)

---

# 11. Não crie dívida documental

Antes de criar um `.md` novo, ache o documento que já é dono do assunto. Nunca:

```text
browser-debug.md · browser-debug-final.md · browser-debug-v2.md · browser-notes.md
```

Cada documento tem escopo definido.

### Briefing é ANDAIME

`docs/briefings/*.md` existe para ser **dissolvido**. Ao destravar um item dele: marque no briefing
**e anuncie no `README.md`** como capability — item entregue que ninguém sabe que existe é o mesmo
que não entregue. Diluído o conteúdo, **apague o arquivo**: o git guarda o texto, e o que não pode
existir são duas fontes divergentes.

⚠️ Briefings **acertam a ESTRUTURA e erram as FOLHAS** — onde nomeiam uma RELAÇÃO, acertam; onde
nomeiam um FATO DE MUNDO, descrevem um corpus que não existe.

### Fechar um item é MOVER, nunca anexar

O relato SAI; o resíduo se distribui: a armadilha para `armadilhas.md`, o número para `medidas.md`,
o resto para o corpo do commit. **Anexar "o texto original fica pelo valor do sintoma" é como estes
arquivos incham** — foi assim que uma seção de handoff chegou a 462 linhas com quase nada acionável.

⚠️ Orçamento — medida, não meta: `HANDOFF.md` acima de ~800 linhas significa que algo está sendo
contado duas vezes. **Procure o duplicado antes de cortar o que parece velho.**

---

# 12. Harness de contexto

## 12.1 Leia o mínimo, na ordem

1. a tarefa; 2. a lei/spec relevante; 3. o módulo; 4. o oráculo que o guarda; 5. as dependências
diretas; 6. só então a arquitetura ampla.

Busca dirigida antes de abrir arquivo grande. `make leis-lista` diz o que cada guarda responde;
`docs/armadilhas.md` diz o que vai mentir na medição. Não carregue o repositório inteiro.

## 12.2 Preserve as fronteiras

Mantenha separados — e **nunca promova hipótese a fato em silêncio**:

```text
FATO · HIPÓTESE · EVIDÊNCIA · DECISÃO · IMPLEMENTAÇÃO
```

```md
Fato:      a cena reporta zero quadros no modo agente.
Evidência: 180 callbacks de RAF em 1,5 s.
Hipótese:  o contador exposto representa só a cena do universo.
Decisão:   medir RAF para validação de navegador.
```

Essa estrutura serve a artefato temporário e discussão de tarefa. **Ela não vira comentário nem doc
permanente** — só a linha durável que sair dela vira.

---

# 13. O agente não narra dentro do artefato

Evite *"inspecionei"*, *"encontrei"*, *"notei"*, *"mudei"*, *"verifiquei"*, *"descobri"* — salvo em
relatório explicitamente pedido. Prefira o fato: *"o coletor repete requisição falha três vezes"*.

### Relatório de conclusão

Estruturado, não ensaio retrospectivo:

```md
## Mudou
- ...
## Verificado
- `make leis` passa; oráculo X visto falhando sob mutação Y.
## Em aberto
- nenhum
```

### TODO

Trabalho técnico acionável: a mudança necessária, a restrição técnica, opcionalmente o identificador.

```js
// TODO: trocar o polling pelo evento que SceneController emite.
```

Nunca a narrativa da tarefa dentro do TODO.

---

# 14. Revisão antes do commit

Para cada comentário e parágrafo NOVO, sete perguntas:

* **propriedade** — que artefato é dono deste fato?
* **durabilidade** — continua verdade depois do próximo refactor?
* **necessidade** — o leitor precisa disto?
* **localidade** — dá para morar mais perto do que descreve?
* **executabilidade** — um oráculo, uma sonda ou um tipo expressaria isto melhor?
* **duplicação** — isto já existe em outro lugar?
* **narrativa** — descreve o SISTEMA, ou descreve o que alguém VIVEU mexendo nele?

Se a última for "o que alguém viveu", remova.

### Checklist

* [ ] sem diário de investigação, raciocínio de agente ou linguagem dramatizada
* [ ] sem status de tarefa duplicado, sem detalhe de implementação duplicado
* [ ] sem *"descobrimos"*, *"tentamos"*, *"atualmente"* fora de doc temporal
* [ ] toda data e todo número com procedência (corpus + quando), ou fora
* [ ] refutação medida preservada
* [ ] nenhum código citando `roadmap.md`, `HANDOFF.md` ou número de tarefa
* [ ] comentário descreve código · docblock descreve símbolo · oráculo prova comportamento · commit guarda história
* [ ] `HANDOFF.md` e `roadmap.md` mexidos JUNTOS
* [ ] item fechado foi MOVIDO, não anexado
* [ ] doc novo tem escopo, e nenhum doc existente já era dono

---

# 15. A regra de ouro

> **Não documente a jornada, a menos que a jornada seja o artefato.**

O repositório responde: *o que é verdade · o que é exigido · o que este código faz · por que esta
decisão existe · como o comportamento é provado · como o sistema é operado.*

Ele não responde: *o que o agente pensou, tentou, quebrou ou achou difícil.*

**Otimize o repositório para a próxima pessoa, não para a investigação anterior.**
