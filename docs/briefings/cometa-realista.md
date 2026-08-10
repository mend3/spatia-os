# O cometa — de «rocha com emissor de partículas» para corpo ativo

> **Andaime.** Este arquivo existe para ser DISSOLVIDO: cada item destravado é marcado aqui,
> anunciado no `README.md` e movido para o `roadmap.md`. Quando não sobrar nada, o arquivo é
> APAGADO — o git guarda o texto, e o que não pode existir são duas fontes divergentes.

O relato que o abriu: *"há claras diferenças entre ele e os cometas reais; o nosso está visualmente
muito mais próximo de um asteroide emitindo partículas do que de um cometa"*.

---

## ☠️ Antes de ler o resto: o que foi CONFERIDO no código, e o que caiu

Um briefing acerta a ESTRUTURA e erra as FOLHAS. Esta seção separa as duas, e ela vale mais que
tudo o que vem depois — **quatro dos itens de prioridade máxima do relato já estavam implementados**.

| item do relato | veredito, conferido no código |
|---|---|
| «faltam DUAS caudas» | ⭑ **já existe.** `comet.js` desenha `ion` (0x74d8ff, reta, `spread` 0,12, `curve` 0) e `dust` (0xffe9b8, `spread` 0,3, `curve` 1,5–3,1), escoando em ritmos diferentes (`MOTION.cometOutflow`: íon 2,2 s, poeira 4,6 s) |
| «a direção não deveria ser `velocity`» | ⭑ **já existe, e nunca foi `velocity`.** `PARA_FONTE` é a direção do corpo PARA a fonte de radiação; o cabeçalho do módulo diz *"um cometa indo embora do Sol viaja com a cauda na frente"* |
| «falta a coma» | ⚠️ **meio-falso.** Há coma, com queda em **1/ρ** — a integral de coluna, não um polinômio macio — e assimetria parabólica pela direção da fonte. O que é verdade está no item C abaixo |
| «núcleo quase esférico, poucas faces» | ⚠️ **meio-falso.** Três harmônicas de frequência crescente + **contato binário em ~metade dos corpos** (`seed > 0.5`); o corpo da foto caiu no lobo único. E a faceta é DELIBERADA: corpo abaixo do limite hidrostático tem quina |
| «cauda muito digital» | ☠️ **verdade.** 260 `THREE.Points` por cauda — a partícula É a estrutura |
| «faltam jatos» | ☠️ **verdade, não existe nenhum** |
| «brilho neon» | ⚠️ as cores já são as físicas (íon azul, poeira dourada). O que lê como neon é o disco aditivo de cada partícula |

⚠️ **E a imagem que motivou o relato é a BANCADA**, que não tem pós-processamento. O que o app
desenha é outra coisa — medir na bancada separa o que a PELE faz do que o PÓS faz, e as duas
produzem a mesma imagem na cena cheia.

---

## O que já foi entregue por causa deste relato

- ⭑ **A envoltória CEDE conforme a superfície sólida assume** (`lod.js:CEDE_A_ENVOLTORIA`): o
  florescimento do bloom e a coma recuam juntos ao aproximar. Ver a linha de T-61 no `roadmap.md`.

---

## O que sobra, em ordem de ganho

### A · A cauda deixa de ser fila de pontos

Hoje: 260 partículas por cauda, cada uma um disco aditivo com halo próprio. Um cometa real não tem
fila de estrelas — a cauda de poeira é contínua e difusa, com filamentos dentro.

**A partícula tem de virar o DETALHE da estrutura, não a estrutura.**

⚠️ **O caminho barato já existe nesta base**: a nebulosa desenha volume com billboard e ruído 3D.
Uma faixa (ou algumas) com ruído advectado, com as partículas por cima como grão, dá a leitura sem
ray-marching.

☠️ **E o orçamento decide:** a lente sozinha custa **3,8–5,1 ms** contra 0,31–0,35 ms do céu inteiro
(`docs/medidas.md`). *"Volumetric"* no sentido de marchar raio **não cabe** — qualquer proposta
assim precisa do número antes do código.

### B · Jatos

Não existem. São o que mais aproxima a leitura de «corpo ATIVO» em vez de «corpo com rastro»: várias
estruturas estreitas saindo de regiões da superfície, que se fundem ao se afastar.

⭑ **Eles ligam e desligam com a ROTAÇÃO**, que este módulo já tem (`params.spin`, pela lei de
`MOTION.spin`). Um jato ancorado numa direção do MODELO acende quando aquela região vê a fonte — sai
de graça e é fiel.

⚠️ **A quantidade tem de sair de um FATO do arquivo**, como o resto da pele (`chunks` → núcleo,
`churn` → atividade). Um número de jatos escolhido a gosto é forma que não significa nada, e esta
base recusa isso em toda pele.

### C · A coma ganha ESPESSURA

A cessão tirou o gás de cima do corpo, mas ele continua lendo como **bola sólida**: a lei em 1/ρ
satura por construção no piso `uCore`, e o resultado é um disco chapado com borda macia.

Falta: regiões mais densas e outras quase transparentes, ruído que não é radial, e a coma
ALIMENTANDO a cauda em vez de as duas serem duas figuras.

⚠️ **A assimetria já existe** (parábola com o núcleo no foco, comprimida do lado da fonte) — o que
falta é textura interna, não forma.

### D · O núcleo ganha relevo

O contato binário já existe em metade dos corpos. O que falta é amplitude e MICRO-relevo: cratera,
fratura, depressão. Albedo baixo e rugosidade alta importam mais que resolução de textura.

⚠️ **A faceta NÃO é defeito** e não deve ser suavizada — ela é o que faz o corpo ler como rocha
abaixo do limite hidrostático. O relevo entra POR CIMA dela.

---

## As leis que qualquer proposta aqui tem de respeitar

⚠️ **A trava do `replanejamento-celeste.md`**: *não implementar morfologia nova até a classificação
que decide quando ela existe estar correta*. Nada aqui é morfologia nova — é a mesma pele com mais
detalhe —, mas um «cometa dormente» como pele separada seria, e cai na trava.

☠️ **A FRONTEIRA FÍSICA × COGNITIVA.** `churn` é contagem de commits, não taxa de sublimação.
Quantidade de jato, densidade de coma e comprimento de cauda podem sair dele como METÁFORA — que é
o que já fazem —, mas nenhuma grandeza física pode ser DERIVADA dele sem unidade e constante
explícitas.

⚠️ **A REGRA DA COORDENADA.** Nada aqui pode mover o corpo: a órbita é `f(t)` fechada, sem
integrador. Jato, coma e cauda são APRESENTAÇÃO.

⭑ **A bancada precisa dos dois modos de tudo o que for adicionado** (REGRA DA INSPEÇÃO): o espécime
`COMETA` em `canvas.html` já tem `APARÊNCIA DO NÚCLEO`, e cada feição nova entra ali com o controle
que a liga e desliga — senão o caminho onde o defeito mora não é desenhável.

☠️ **E `check-shaders.mjs` antes de commitar qualquer GLSL**: crase dentro de `/* glsl */` já mordeu
**seis** vezes neste repositório, a última neste mesmo módulo.

---

## O que NÃO fazer

- ☠️ **Não tratar isto como um único `ParticleSystem`.** O relato acerta aqui: a partícula é detalhe.
- ☠️ **Não copiar o 67P.** Ele é uma forma entre muitas, e a forma do corpo aqui tem de sair do
  arquivo, não de uma referência fixa — é a mesma razão pela qual o planeta é procedural.
- ⚠️ **Não somar brilho para «parecer mais real».** O que se ganhou com a cessão da envoltória se
  perde inteiro no primeiro `+0,2` de emissivo.
