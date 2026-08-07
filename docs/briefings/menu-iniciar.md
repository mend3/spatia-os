quero criar um "menu iniciar" para remover botoes da tela e otimizar o espaço. a referencia que quero copiar é o menu do Mass Effect Andromeda, como da imagem. deve ser usando THREE.js, com efeitos, animacoes, transicoes, glass effect, brilho que segue o mouse entre os botoes, etc

referencia: https://static.wikia.nocookie.net/masseffectandromeda_gamepedia_en/images/5/5c/Main_Menu.png/revision/latest/scale-to-width-down/1200?cb=20191007175519

---

Acho que essa é uma excelente referência para o SpatIA, principalmente porque **não é um menu**, é uma **camada de navegação temporária**. Ela reduz o ruído da interface sem tirar o usuário do contexto.

Mais importante ainda: ela conversa com um princípio que já definimos para o projeto: **Zoom muda paradigma**. Em vez de abrir um drawer lateral ou um modal, o universo continua existindo ao fundo e apenas uma "interface orbital" aparece sobre ele. 

---

# O conceito

Eu copiaria apenas a ideia, não o visual.

O menu do Mass Effect é radial porque o controle é por gamepad.

No SpatIA podemos fazer algo melhor:

* mouse → brilho segue o cursor
* touch → segue o dedo
* teclado → navegação radial
* scroll → expande/contrai
* IA → itens mudam conforme contexto

Então ele deixa de ser um menu estático e vira um **Launcher Orbital**.

---

# Aparência

Imagine que ao apertar:

```
Space
```

ou

```
Ctrl+K
```

o universo faz uma pequena reação.

```
Tudo escurece

↓

Bloom aumenta

↓

Profundidade aumenta

↓

Glass surge

↓

Menu abre
```

Como se um HUD holográfico tivesse sido projetado.

---

# Layout

Ao invés de oito botões iguais, faria três anéis.

```
                Workspace

        Search          Agents

    Files                  Projects

        Tools         Memory

              Settings
```

ou ainda melhor:

```
            ○

      ◜────────◝

   ○      ●       ○

      ◟────────◞

            ○
```

Onde:

● = foco

Os outros ficam levemente curvos.

---

# Glass

Não usaria um blur comum.

Usaria várias camadas.

```
Glass

↓

Background Blur

↓

Tint

↓

Noise

↓

Inner Shadow

↓

Specular

↓

Glow

↓

Reflections
```

O painel pareceria um vidro tecnológico.

---

# Material

Cada botão seria composto por:

```
Base

↓

Frosted Glass

↓

Hex Pattern

↓

Border

↓

Light Sweep

↓

Hover Glow

↓

Inner Bloom

↓

Animated Noise
```

---

# O efeito mais importante

## Mouse Energy

Quando o mouse passa:

não apenas acende.

Uma energia percorre a borda.

```
────────────

███████─────
```

seguindo exatamente a posição do cursor.

Pode ser feito com:

```
ShaderMaterial

↓

distance(mouse)

↓

gradient

↓

fresnel
```

O brilho literalmente acompanha o ponteiro.

---

# Hover

No hover eu faria:

```
Escala

1.00

↓

1.03

↓

1.02
```

Nunca cresce muito.

Além disso:

```
Glass

↓

fica mais transparente

↓

Glow aumenta

↓

Bloom aumenta

↓

Texto ilumina
```

---

# Quando troca de botão

Ao invés de desligar um e ligar outro.

A energia viaja.

```
Botão A

══════►

Botão B
```

Como uma corrente elétrica.

---

# Centro

No Mass Effect existe o MAP.

No SpatIA eu colocaria algo vivo.

O próprio universo.

Exemplo:

```
Mini Buraco Negro
```

ou

```
Galáxia

girando lentamente
```

Quando muda de opção.

A galáxia muda.

```
Workspace

↓

galáxia azul

↓

Search

↓

espiral branca

↓

Agents

↓

nebulosa

↓

Memory

↓

estrela pulsando
```

Assim o centro comunica o contexto atual.

---

# Fundo

O fundo nunca fica preto.

Ele continua mostrando o universo.

Mas:

```
Exposure ↓

Saturação ↓

DOF ↑

Bloom ↑

Vignette ↑
```

Tudo continua vivo.

Só menos importante.

---

# Micro animações

Cada botão pode possuir:

### Idle

Respiração.

```
opacity

0.86

↓

0.91

↓

0.86
```

---

### Hover

Pequenas partículas.

```
•

••

•••
```

Passando pela superfície.

---

### Select

```
Glow

↓

Pulse

↓

Ripple

↓

Click
```

---

### Exit

Tudo volta para o centro.

Como se fosse absorvido.

---

# Transições

A abertura deveria durar algo entre:

```
180–250ms
```

com easing:

```
cubic-bezier(.16,1,.3,1)
```

Fechamento:

```
120–180ms
```

Mais rápido.

---

# Three.js

Eu não faria esse menu em HTML.

Faria como parte da cena 3D.

Estrutura:

```ts
Scene
 ├── Universe
 ├── HUDRoot
 │    ├── RadialMenu
 │    ├── GlassPanels
 │    ├── CursorLight
 │    ├── CenterPreview
 │    └── BackgroundDimmer
 └── PostProcessing
```

Cada item seria um `Mesh` (ShapeGeometry/ExtrudeGeometry) com `ShaderMaterial`, em vez de um `<button>`. Isso permite:

* **Glass real** com refração (FBO ou transmissão).
* **Borda emissiva** controlada por shader.
* **Fresnel** nas bordas para sensação de holograma.
* **Cursor Light**: um uniforme `uMouse` faz um highlight que percorre a superfície conforme o mouse.
* **GPU animations**: todos os estados (`idle`, `hover`, `selected`, `opening`) são interpolados no shader, sem manipular dezenas de propriedades da CPU.

---

# Adaptando ao SpatIA

Como o SpatIA é um sistema operacional espacial, eu substituiria os itens fixos por **ações contextuais**, alinhando com a ideia de que o sistema responde "o que posso fazer agora?" em vez de apenas listar funcionalidades. 

Por exemplo:

| Contexto  | Ações principais                              |
| --------- | --------------------------------------------- |
| Universo  | Workspace · Pesquisar · Agentes · Criar       |
| Documento | Resumir · Editar · Relacionar · Compartilhar  |
| Agente    | Conversar · Delegar · Ferramentas · Histórico |
| Projeto   | Roadmap · Tarefas · Código · Métricas         |
| Pesquisa  | Web · Workspace · Papers · Memórias           |

Ou seja, o "Menu Iniciar" deixa de ser um menu de navegação e passa a ser um **Action Ring**: um launcher que sempre mostra as ações mais relevantes para o estado atual do usuário. Isso reduz drasticamente a quantidade de botões permanentes na tela sem aumentar o número de cliques.

