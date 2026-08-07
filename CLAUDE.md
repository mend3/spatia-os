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

## Ao mexer em classificação, limiar ou constante calibrada

| script | o que mede |
|---|---|
| `censo-morfologias.mjs` | o que o céu DESENHA — classe · pele · morfologia por `kind` · modificadores |
| `censo-corpus.mjs` | o que o corpus É — forma, saúde das constantes calibradas, sinal de cada candidata |

O segundo existe por causa de três constantes que degradaram sem erro nenhum: `SPAN` (calibrada
com 71 hubs, aplicada em 228), `DENSITY_K` (corpus 5,6× maior, **297 luas viraram 0**) e o piso do
pulsar (medido no git, aplicado no índice, **0 corpos**). Ele acusa em vermelho a classe que ficou
sem população.

> **Toda constante derivada de `M_total` ou da contagem de hubs expira.** Quem reindexar um corpus
> muito maior refaz a conta — ela está no comentário de cada uma. O relatório completo, com o que
> foi refutado e por quê, está em [`docs/medicoes-2026-08-07.md`](./docs/medicoes-2026-08-07.md).

⚠️ Os dois medem o **ÍNDICE**, nunca o disco. A diferença decide conclusões: o disco é 58%
TypeScript e o índice não tem um único `.ts`. Confundir os dois já produziu uma recomendação errada.

## Ao precisar de um corpus que exercite tudo

    uv run --with fastembed python scripts/fixture.py            # cria repo + indexa
    uv run --with fastembed python scripts/fixture.py --limpar   # apaga repo + coleção

Corpus sintético em coleção própria (`espatial_fixture`), com 14 arquivos que levam cada eixo aos
extremos. É o primeiro degrau da doutrina de [`docs/cobertura.md`](./docs/cobertura.md) — *o código
desenha este tipo?* — e o único jeito de exercitar um corpo que o corpus real não produz. `FIXTURE_ROOT`
sobrepõe o destino.

⚠️ Cobertura de TIPO não é cobertura de PARÂMETRO: um tipo presente prova que o caminho desenha,
não que o shader foi exercitado.

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

## E o que NÃO está aqui

As sondas de runtime vivem na cena, não em `scripts/`: `spatia.galaxy()` · `spatia.moons()` ·
`spatia.lod()` · `spatia.planet()` · `spatia.bloom({…})` · `spatia.core({…})` ·
`spatia.renderCost()`. Elas respondem sobre o quadro que está na tela agora, que é uma pergunta
diferente da que qualquer script offline pode responder.

⚠️ `docs/catalogo-celeste.md` documenta essas sondas como `espatial.*`. O objeto real é
**`spatia`** — quando os dois discordarem, o código está certo.
