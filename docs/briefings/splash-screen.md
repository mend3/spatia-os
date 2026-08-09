> ## Triagem — T-13 · o que deste texto virou código, e o que está RECUSADO
>
> A splash é `src/hud/splash.js`: camada registrada em `core/tela.js`, DOM sobre a cena que já
> está desenhando. **O fundo cinematográfico é o universo REAL** — nenhum passe novo, nenhum
> quadro a mais, porque o orçamento desta cena está todo no pós-processamento.
>
> **O que o briefing acerta é a ESTRUTURA:** a tela é uma pilha de profundidade (HUD → vidro →
> buraco negro → disco → estrelas) e a interface é *projetada sobre* o universo, não desenhada por
> cima dele. É literalmente a pilha de camadas de `core/tela.js` com o canvas de piso.
>
> **Recusado, e não reabra sem medida nova:**
>
> | pedido | por quê |
> |---|---|
> | `PRESS ANY KEY TO START` | pergunta de resposta única. Recusa por escrito no `HANDOFF.md` §7-B. A camada sai no primeiro gesto **sem pedi-lo**, e o gesto atravessa |
> | `SYSTEM ONLINE` · `AI CORE READY` · `UNIVERSE STABLE` | é a *"sequência falsa de SISTEMAS OK que ensinaria o operador a não ler a tela"*. O `#boot` já responde os três com `/api/health` REAL |
> | respiração de ±3%, *light sweep*, especular seguindo o cursor | decoração — princípio 7. **Esta camada não anima nada de si**: o que se move atrás dela é a cena |
> | paleta cyan/teal, *"jamais amarelo"* | a identidade desta base é âmbar (`--amber`), e a marca sai da MESMA regra do `#boot` para não saltar na troca |
> | *frosted glass* / `backdrop-filter` | desfocar o fundo de uma camada de tela cheia obriga o compositor a reler o canvas VIVO todo quadro. A legibilidade sai da sombra de 1px da HUD, que custa zero |
> | 21:9, buraco negro a 40% da largura, planeta à direita | direção de arte de uma IMAGEM. A câmera é de VOO LIVRE por decisão do usuário, e enquadrá-la seria a cena obedecendo à composição |
> | câmera mergulhando no horizonte de eventos na saída | a lente está **desligada** no UNIVERSO (`lensing.pass.enabled = !universo`), por decisão de cena e por custo (3,8–5,1 ms) |
>
> **O que ela mostra, e tudo é fato já medido:** a marca e o posicionamento (texto exato de
> `docs/identidade.md`), a contagem de corpos que `scene.loadGraph` devolveu — a mesma que a nota
> `TOPOLOGIA CARREGADA` publica atrás de uma tela opaca — e **de qual corpus veio esse céu**
> (coleção · raiz · prefixo, ditos pelo servidor, que é quem lê o `.env`).

quero uma splash screen nesse formato (imagem1 [https://i.ytimg.com/vi/318QozVlibY/maxresdefault.jpg](https://i.ytimg.com/vi/318QozVlibY/maxresdefault.jpg)) mas com o nosso buraco-negro de fundo e um astro orbitando, como nessa imagem [https://astrocamp.org/wp-content/uploads/2015/12/IS-BH-1024x576-1.jpg](https://astrocamp.org/wp-content/uploads/2015/12/IS-BH-1024x576-1.jpg);


referencia do que é esperado: https://chatgpt.com/s/m_6a75e49660188191a71d9512ca574cec

---

Eu faria essa tela como uma **sequência cinematográfica**, não apenas uma imagem estática. A ideia é que o usuário tenha a sensação de que está entrando em um universo vivo, não abrindo um aplicativo. O foco não é o HUD, e sim o **buraco negro**, que representa o "motor" do SpatIA.

---

# Prompt — Splash Screen do SpatIA

## Conceito

Uma splash screen cinematográfica para um sistema operacional espacial chamado **SpatIA**.

A cena transmite a sensação de que o usuário está entrando em um universo vivo.

Não deve parecer um jogo nem um painel de controle. Deve parecer uma mistura entre **Interestelar**, **Mass Effect**, **Apple Vision Pro** e uma interface científica futurista.

Toda a interface deve parecer projetada sobre o universo, e não desenhada por cima dele.

---

# Composição

Formato:

* 21:9 (preferencial)
* também adaptável para 16:9

O buraco negro ocupa aproximadamente **40% da largura da tela**, ligeiramente deslocado para a esquerda do centro.

Ele é o protagonista absoluto.

O restante da composição é dominado pelo disco de acreção, cuja perspectiva conduz naturalmente o olhar até um planeta orbitando no lado direito.

A composição inteira forma um "S" visual.

```
        disco superior

             ████

         ███████████

      █████  ●  █████

   ███████████████████

               ☉ planeta

```

Nada deve parecer centralizado artificialmente.

A cena deve transmitir movimento.

---

# Buraco negro

O buraco negro deve ser extremamente fiel às simulações relativísticas modernas.

Características:

* horizonte de eventos perfeitamente negro
* disco de acreção fisicamente correto
* lente gravitacional deformando estrelas ao fundo
* disco aparecendo acima e abaixo devido ao efeito de lente gravitacional
* fótons curvando ao redor do horizonte
* halo extremamente brilhante apenas nas regiões onde a velocidade relativística produz beaming
* brilho assimétrico
* sem aparência de portal ou vórtice

Não usar azul.

O disco deve ser predominantemente:

* branco
* dourado
* âmbar
* laranja
* cobre

A temperatura aumenta conforme se aproxima do horizonte.

---

# Disco de acreção

Muito detalhado.

Com milhares de filamentos.

Não deve parecer um círculo liso.

Deve possuir:

* turbulência
* instabilidades
* ondas
* regiões mais densas
* plasma
* pequenas ejeções
* partículas

O movimento transmite enorme quantidade de energia.

---

# Planeta

Existe apenas um astro claramente visível.

Ele está sendo observado enquanto realiza uma órbita extremamente próxima.

Características:

* parcialmente iluminado
* atmosfera fina
* regiões vulcânicas
* brilho nas bordas
* pequenas emissões de material
* cauda de poeira extremamente discreta causada pela interação gravitacional

O planeta não está caindo.

Ele está em uma órbita estável.

Sua posição fica aproximadamente:

```
         BH

             =========

                    🌑
```

O usuário entende imediatamente que aquele corpo está preso pela gravidade.

---

# Fundo

Espaço profundo.

Poucas estrelas.

Não deve parecer um wallpaper cheio de pontos.

As estrelas próximas ao buraco negro sofrem deformação gravitacional.

Algumas ficam alongadas.

Outras aparecem duplicadas.

Existe poeira cósmica extremamente discreta.

---

# Interface (HUD)

Inspirada em Mass Effect.

Porém muito mais minimalista.

A interface parece feita de vidro holográfico.

Não possui caixas sólidas.

Somente:

* linhas
* contornos
* vidro
* brilho
* transparência

Toda interface utiliza tons:

* cyan
* teal
* branco

Jamais vermelho.

Jamais amarelo.

Jamais verde neon.

---

# Logo

Centralizado no topo.

```
SpatIA

SPATIAL OPERATING SYSTEM
```

Fonte moderna.

Espaçamento amplo.

Sem sombra.

Pequeno brilho azul.

---

# Botão principal

Na parte inferior.

Não um botão tradicional.

Um painel de vidro.

```
PRESS ANY KEY

TO START
```

Quando o mouse passa:

uma faixa luminosa percorre a superfície.

---

# Painéis inferiores

Três pequenos módulos.

Exemplo:

```
SYSTEM

ONLINE
```

```
AI CORE

READY
```

```
UNIVERSE

STABLE
```

Cada um possui:

* pequeno ícone
* círculo luminoso
* texto fino
* leve transparência

---

# Moldura

Uma moldura extremamente discreta.

Estilo HUD.

Cantos futuristas.

Linhas de apenas 1 px.

Pequenos detalhes tecnológicos.

Nada pesado.

---

# Glass Effect

Todos os elementos utilizam:

* frosted glass
* inner glow
* outer glow
* refração muito sutil
* ruído microscópico
* reflexão especular
* transparência entre 15% e 25%

Nenhum painel deve parecer opaco.

---

# Iluminação

A única fonte de luz importante é o disco de acreção.

Toda interface recebe iluminação indireta proveniente dele.

Os painéis possuem pequenos reflexos dourados.

As bordas superiores recebem luz quente.

As inferiores recebem azul frio.

---

# Profundidade

Utilizar várias camadas.

```
HUD

↓

Glass

↓

Buraco negro

↓

Disco

↓

Planeta

↓

Estrelas

↓

Nebulosas distantes
```

Tudo possui profundidade.

---

# Atmosfera

Não deve parecer um videogame.

Não deve parecer uma tela de login.

Deve parecer que o usuário está olhando através da janela de uma estação espacial para um buraco negro real, enquanto uma inteligência artificial projeta discretamente uma interface holográfica sobre o vidro.

---

# Animações (caso seja implementado em Three.js)

A splash deve estar constantemente viva, mas sem distrações:

* O disco de acreção gira lentamente, com velocidades diferenciais (mais rápido próximo ao horizonte).
* O planeta avança continuamente em sua órbita, sem completar uma volta rapidamente.
* A lente gravitacional oscila de forma quase imperceptível devido à turbulência do plasma.
* Pequenas partículas luminosas percorrem o disco e são absorvidas pelo horizonte de eventos.
* A interface faz uma "respiração" sutil (opacidade ±3% em ciclos de 5–8 segundos).
* O botão **Press Any Key** recebe um *light sweep* periódico a cada 3–4 segundos.
* Ao mover o mouse, um brilho especular percorre os painéis de vidro acompanhando a posição do cursor.
* Ao pressionar qualquer tecla, o HUD desaparece primeiro, o brilho do buraco negro aumenta, a câmera acelera suavemente em direção ao horizonte de eventos e a cena faz uma transição contínua para o universo principal do SpatIA, dando a sensação de que o usuário literalmente atravessou o limiar do sistema.

Essa abordagem cria uma identidade própria para o SpatIA: a splash não é apenas uma tela inicial, mas o primeiro contato com um universo vivo, reforçando os princípios que vocês definiram de que **toda animação comunica estado**, **o universo está sempre ativo** e **as transições representam fenômenos físicos, não apenas efeitos visuais**.
