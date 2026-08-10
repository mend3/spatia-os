# Dinâmica de entidades — a astronomia como modelo causal

> **Estado: TRIADO na entrada (2026-08-09).** Ao contrário dos outros briefings, este não precisa
> ser lido inteiro à procura do que é real: a tese central dele foi medida contra o código e está
> **refutada aqui dentro**, e o que sobrou são três tarefas. Ver a tabela final do
> [`roadmap.md`](../roadmap.md) para quando ele morre.

## A proposta, em uma frase

> Astros não possuem animações; possuem estado e dinâmica, e a animação é a observação dessa
> dinâmica. Entidades do SpatIA também deveriam ter estado, relações, atividade e influência, com a
> cosmologia como linguagem que torna isso observável.

A cadeia causal que ela propõe importar da astronomia:

```
estado → interação → força/torque → evolução → trajetória observável
```

E a tradução cognitiva:

```
estado cognitivo → relação/influência/evento → steering/atividade → comportamento espacial
```

⭑ **A cadeia está certa e a base já a implementa** — o que estava errado era a última seta.

---

## §1 · A tese central está REFUTADA, e a refutação é uma garantia de produto

A proposta pedia que a entidade ganhasse `position · velocity · acceleration` com `steering`, de
modo que a influência CURVASSE a trajetória: o agente lê um documento, o documento ganha influência,
a trajetória muda.

Isso é o **corpo errante**, e ele já estava recusado por escrito
(`modelo-de-renderizacao.md`): determinismo no tempo não basta — um corpo errante é sempre
calculável e **nunca está no mesmo lugar**, então achar um arquivo onde você o deixou deixa de
valer. O `README.md` promete *"o mesmo conhecimento cai sempre no mesmo lugar"*. Sob a proposta, o
mesmo arquivo estaria em X às 10h e em Y às 15h.

☠️ **Não é uma escolha de física. É revogar uma feature de navegação** — e por isso foi decidida
pelo usuário (T-22), não por engenharia.

### O erro que produziu a tese: DINÂMICA confundida com INTEGRAÇÃO

A premissa astronômica estava certa (Kepler 2: a velocidade não é constante numa elipse). A
implicação — *"logo `speed` não pode ser a verdade fundamental, é preciso integrar"* — **é falsa, e
o contraexemplo já roda**: a lua tem velocidade variável por **equação do centro truncada em `e²`**,
função FECHADA do relógio da cena, com **área varrida máx/mín 1,0008**.

| a forma permitida | a forma proibida |
|---|---|
| `posição = f(entidade, t)` | `posição[t+1] = posição[t] + v·dt` |

Velocidade variável, aceleração aparente, precessão, pulsação e rotação **cabem todas na coluna da
esquerda**. `motion-catalog.js` é quem diz: *"no integration, no accumulated velocity, no internal
state"*.

⭑ **A generalização que vale a pena, e é o que sobra de útil da tese:** estender o padrão `f(t)`
onde ele render, nunca introduzir um integrador.

---

## §2 · O que a proposta descreve e JÁ EXISTE com outro nome

⚠️ Esta é a forma mais cara de desperdício desta base. Cada linha foi conferida no código.

| a proposta pede | o que já é verdade |
|---|---|
| Scene como lente, não dona da entidade | é **lei**, com oráculo: `scripts/lei-cena.mjs` perturba a cena por todo canal exposto |
| `evento → estado → fenômeno → render` | [`EVENTS.md`](../EVENTS.md), 17 eventos; nenhum comanda animação |
| influência cognitiva ≠ gravidade física | **A FRONTEIRA FÍSICA × COGNITIVA** (`CLAUDE.md`), com portão em `lente-estelar.mjs` |
| influência ≠ distância | `centralidade.mjs` · `vizinhanca.mjs` · `conectividade.mjs`; `connectivity` virou ALCANCE porque o grau repetia a centralidade (ρ 0,821) |
| influência → brilho/ênfase | `universe.js:brilhoDe` — `centrality` a 0,9, `usage` a 0,45 atrás do portão de evidência, `null` caindo para a atividade e nunca para zero |
| lua como acoplamento, não filho | `moon-orbits.js`, elipse dentro da janela Roche→Hill |
| pulsar como atividade direcional | desenhado, com `R_s/R = 0,4` vindo do fato de classe |
| campo magnético ≠ afinidade genérica | a FRONTEIRA já proíbe; o pulsar é legítimo porque `0,4` é fato de estrela de nêutrons |
| "influência muda apresentação, não identidade" | **1ª lei do Neo4j**, com oráculo (`lei-neo4j.mjs` §1) |

---

## §3 · A armadilha do contrato de 14 campos

A proposta terminava num `EntityDynamics` com `position · velocity · acceleration · orientation ·
angularVelocity · angularAcceleration · target · desiredVelocity · steering · influence ·
influenceRadius · influenceVector · activity · activityRate`.

☠️ **É o defeito que esta base pagou cinco vezes**: campo declarado sem leitor. `entity-physics.js`
já mantém `AUSENTES` justamente para declarar as **4 das 11** dimensões que não têm fato, em vez de
fingi-las.

⚠️ **E há um limite de SUPERFÍCIE que mata metade do contrato antes do leitor:** fora de foco o céu
é ponto e billboard. Girar um ponto não comunica nada, então `orientation`/`angularVelocity`/
`steering` **não têm onde ser desenhados** — e a tentação de mostrá-los vira deslocamento, que é
justamente o item proibido do §1. Orientação só tem superfície onde o corpo vira MUNDO: em foco.

> A ordem é **fenômeno necessário → leitor real → campo mínimo**, nunca contrato → esperar
> consumidores.

---

## §4 · O que a decisão produziu

A decisão do usuário (09/08) fechou **T-22** em duas metades:

- **aprovada** — influência governa brilho, ênfase, arco, partículas, emissão. Já existia.
- **recusada** — influência governa coordenada. Era verdade *por construção* e **sem guarda**.

O que foi construído é o guarda, e a regra virou **A REGRA DA COORDENADA** no `CLAUDE.md`:
`space/posicao-canonica.js` (puro) + `lei-neo4j.mjs` §2 e §3.

⚠️ **A refutação que fica, porque custa caro reaprendê-la:** a §3 nasceu casando a MENÇÃO de
`posicaoCanonica` e passou VERDE sob mutação — arrancada a chamada, a linha de `import` ainda dizia
o nome e o oráculo aprovou um módulo morto. Guarda que casa nome atesta que o módulo é CONHECIDO,
nunca que ele é CHAMADO.

---

## §5 · O que sobrou — as três tarefas

### T-86 · O baricentro

⭑ **A única lacuna de MODELO que a triagem confirmou.** A proposta está certa em que *"A = centro,
B = dependente"* é uma aproximação: em dois corpos, ambos orbitam o centro de massa comum.

E a base tem o buraco medido: a cena desenha **uma estrela por sistema nos 22**, enquanto `μ` (a
maior massa sobre a segunda) põe **18 dos 22 — 81,8%** na faixa de sistema duplo. O corpo central
num FOCO da elipse já está feito; o **segundo corpo** é que não existe.

Compatível com a REGRA DA COORDENADA, e é preciso que continue sendo:

```
baricentro   = f(razão de massa, layout do sistema)
corpoA.pos   = f(baricentro, faseA)
corpoB.pos   = f(baricentro, faseB)
```

☠️ **É PIPELINE NOVO, não limiar** — a mesma medida que arquivou T-28 (zonas por razão de massa), e
o mesmo custo: desenhar um companheiro em 81,8% dos sistemas, com as **0 sobreposições em 17.578
pares** no caminho.

### T-87 · Acoplamento entre agentes

Dois agentes que colaboram formam um sistema, e hoje só existe `edge = true` para dizer isso. A
saída é a do Neo4j: o vínculo muda **brilho, espessura do arco, partículas** — nunca a órbita de
nenhum dos dois.

⚠️ `blocked` por T-23, e não por engenharia: enquanto agente for **estação orbital, não nave**, não
há dois corpos a acoplar.

### T-88 · Os consumidores de influência

O censo que fecha a decisão pelo lado positivo: decidido que influência governa apresentação,
**quem mais deveria lê-la e não lê?** Hoje o único consumidor é `universe.js:brilhoDe`;
`connectivity` é materializada e não tem **um leitor visual sequer**.

⚠️ **O veredito pode ser NÃO, e isso é uma resposta legítima** — dimensão sem superfície que a torne
observável não ganha campo (§3). Ligar `connectivity` a um pixel só porque ela existe seria a sexta
ocorrência do defeito.

---

## §6 · O que está explicitamente FORA

Congelado junto com a decisão. Reabrir exige medida nova, não argumento novo:

- velocidade acumulada ou trajetória integrada no UNIVERSO;
- influência, uso ou atividade movendo a coordenada canônica de qualquer entidade;
- agente que percorre o espaço para demonstrar atividade (é `estação orbital, não nave`);
- `EntityDynamics` genérico, ou qualquer campo de dinâmica sem consumidor;
- orientação e `steering` onde o corpo é billboard.

⭑ **A separação que a proposta acertou e vale guardar:** se um dia existir um modo de navegação
livre, ele é OUTRO domínio — lá a nave tem `velocity` como estado porque a pergunta é *"para onde
estou indo?"*. O UNIVERSO responde *"onde está?"*, e as propriedades de um não podem contaminar o
outro.
