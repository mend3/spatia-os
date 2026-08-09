/**
 * A CENA UNIVERSO — sistemas locais, sem centro absoluto.
 *
 * O céu de hoje (cena AGENTE) põe o buraco negro no meio e faz os 1 636 arquivos orbitarem ele por
 * recência. Esta cena nega as duas coisas: **cada estrela domina só a vizinhança dela**, e o volume
 * se organiza em nós e vazios em vez de uniformemente.
 *
 * Ver `docs/replanejamento-celeste.md` (a spec) e `docs/briefings/multi-scene.md` (o briefing).
 * Cada lei aqui foi derivada e medida antes na bancada — `SISTEMA LOCAL` e `UNIVERSO`:
 *
 * | lei | onde foi validada | medida |
 * |---|---|---|
 * | massa → raio em duas curvas | `system-rig` | razão estrela/planeta 1,36 → 3,62 |
 * | órbita elíptica com a estrela no FOCO | `system-rig` | área varrida máx/mín = 1,0008 |
 * | excentricidade planetária | `system-rig` | 0,018–0,042 (Terra 0,017) |
 * | teia cósmica com rejeição | `universe-rig` | 30 tentativas → 0 colisões |
 *
 * ⚠️ **Nenhuma morfologia nova.** Corpos são esferas; a spec proíbe pele nova enquanto a
 * classificação não fechar, e o que esta cena entrega é ESTRUTURA — quem orbita quem, e onde.
 *
 * ⚠️ **A classificação vem de `entity-physics.js`, não daqui.** Estrela é a entidade DOMINANTE do
 * sistema, e isso torna a inversão de massa impossível por construção: a dominante é a mais massiva,
 * logo nenhum planeta pode ser maior que a sua estrela.
 */
import * as THREE from 'three';
import { entityPhysics, classificar, raioPorMassa } from './entity-physics.js';
import { KIND_COLORS, createPointMaterial, starSeed, POINT_SCALE } from './graph.js';
import { createLinks } from './links.js';
import { createRings, VISIBLE_CORE } from './rings.js';

/**
 * Escala do universo, em unidades de mundo.
 *
 * ⚠️ **Ela cabe no ZOOM da câmera de hoje, e isso é decisão.** A primeira versão usou raio 150 e
 * pediu para a câmera esticar até 420 — mas a distância é limitada por `ZOOM_RANGE`, e esticar o
 * teto de um modo mexe no outro. A bancada já tinha ensinado a resposta certa no espécime UNIVERSO:
 * **normalizar o mundo ao orçamento** preserva as proporções internas, que é o que a leitura usa, e
 * troca só a escala absoluta, que ninguém lê.
 */
const RAIO_UNIVERSO = 52;
/**
 * Nós da teia cósmica.
 *
 * ⚠️ Subiu de 9 para 16 depois de VER: com 9, cada nó recebia ~25 sistemas e o miolo virava uma
 * massa única em que nenhum corpo se distinguia. Mais nós é menos aperto por nó, mantendo os
 * vazios — que é o que a estrutura em grande escala afirma. Menos que isso vira nuvem; muito mais
 * vira uniforme, e uniforme é a distribuição que esta cena existe para negar.
 */
const NOS = 16;
/** Tentativas de reposicionamento antes de desistir. 30 zerou as colisões na bancada. */
const TENTATIVAS = 30;
/**
 * Repartição da banda orbital, em raios do corpo — **o `BAND_MOONS` de `orbital-zones.js`**, e ele
 * vale aqui pelo mesmo motivo: metade da banda é o corpo (diâmetro `2r`), um quarto é a excursão da
 * elipse e um quarto é folga vazia. É esse orçamento que torna as bandas DISJUNTAS.
 */
const BANDA_CORPOS = 4;
/**
 * FOLGA vazia em cada ponta da banda, em fração dela. É o "padding" que separa dois corpos vizinhos.
 *
 * ⚠️ **Aumentar o corpo ou diminuir a excentricidade NÃO aumenta a folga** — e é o que confunde:
 * a excursão da elipse absorve tudo o que o corpo não usa, então o intervalo radial mede sempre
 * `B/2 − folga`, seja qual for o raio. Quem separa é só isto. A distância vazia entre dois
 * intervalos vizinhos é exatamente `2 · FOLGA_DA_BANDA · B`.
 *
 * ⚠️ E ela é paga em EXCENTRICIDADE: `0,25` deixa metade da banda vazia e devolve órbitas quase
 * circulares. As luas usam `1/8`, que é o mínimo para a disjunção; aqui vale o dobro porque o corpo
 * do céu é olhado de perto, e a 5 unidades de distância dois corpos que quase se tocam LEEM como
 * um só — foi o relato que trouxe este número.
 */
const FOLGA_DA_BANDA = 0.25;
/**
 * Teto da excentricidade — faixa PLANETÁRIA. De cima lê como círculo; a elipse lateral é inclinação.
 *
 * ⚠️ Ele é TETO, não valor: a excentricidade real é o que a banda deixa sobrar depois do corpo e da
 * folga (ver `load`). Uma constante escolhida aqui apagaria a razão física que faz o planeta interno
 * ser mais excêntrico que o externo.
 */
const EXCENTRICIDADE_MAX = 0.12;
/** Velocidade do sistema pela galáxia. Astro parado não existe; a composição é uma hélice. */
const DERIVA = 0.35;
/**
 * ⚠️ **A ESCALA DOS CORPOS SAI DE UM ORÇAMENTO DE VOLUME, e não mais de um ganho fixo.**
 *
 * O ganho de 4,5 (`ESCALA_CORPO`) foi derivado da projeção — quantos pixels uma estrela típica
 * precisa para deixar de ser ponto — e por isso **não sabia nada sobre quantos sistemas existem**.
 * Ele expirou do jeito que o `CLAUDE.md` avisa que constantes calibradas expiram: com 15 sistemas a
 * estrela mais massiva saía com raio **7,7** num universo de 52, enquanto o empacotamento da teia
 * reservava **2** por sistema. Estrela e envelope discordavam por 4×, e ninguém acusava porque o
 * teste de colisão media distância entre CENTROS.
 *
 * O que substitui é uma fração que a própria spec já afirma como fato: **mais de 70% do volume do
 * universo é vazio** (§2.8 do replanejamento, estrutura em grande escala). Então os sistemas somados
 * ocupam no máximo `OCUPACAO` do volume, e a escala de tudo cai disso:
 *
 *     Σ envelope³ = OCUPACAO · RAIO_UNIVERSO³
 *
 * ⚠️ **E isto não expira com o corpus.** Com 15 sistemas cada envelope dá ~14 unidades; com os 221
 * do corpus real, ~5,8. A cena reescala sozinha em vez de exigir recalibração — que é a diferença
 * entre uma lei e um número calibrado.
 */
const OCUPACAO = 0.30;
/**
 * Que fração do envelope do sistema é a ESTRELA.
 *
 * Ela precisa caber junto com as órbitas: o limite de Roche põe o primeiro planeta em 2,44 raios
 * estelares, então uma estrela acima de ~0,4 do envelope não deixaria espaço para nenhuma órbita.
 * 0,22 põe a órbita mais interna em 0,54 do envelope e deixa a metade externa para a escada.
 */
const FRACAO_ESTRELA = 0.10;
/**
 * Movimento médio na órbita de Roche, em rad/s — o relógio do sistema.
 *
 * Ele é o que a lei de Kepler precisa como constante de escala (`√GM`), e aqui vale para todos
 * porque o raio já carrega a massa: `n = MOVIMENTO_MEDIO · (raio/a)^1,5`. Derivado do que a órbita
 * tem de comunicar, não do relógio: a mais interna (em Roche) fecha a volta em **~15 s**, e a mais
 * externa do sistema, dez vezes mais longe, leva **~8 min**. Rápido o bastante para o universo estar
 * vivo sem interação — a Regra dos Cinco Minutos — e lento o bastante para não ler como agitação.
 */
const MOVIMENTO_MEDIO = 1.6;
/**
 * Limite de Roche, em raios do corpo central — **o mesmo 2,44 do `orbital-zones.js`**, e ele tem
 * fonte: para densidades iguais o material não se acreta abaixo de ~2,5 raios. É o piso da escada.
 */
const ROCHE = 2.44;
/**
 * Piso de raio da ESTRELA, em unidades de mundo. A 150 unidades, 1 unidade dá ~2,95 px.
 *
 * ⚠️ **Ele valia para todo corpo e passou a valer só para a estrela**, e a razão é uma escolha entre
 * dois males. O planeta agora é limitado pela BANDA orbital dele (ver `load`), e num sistema de 38
 * arquivos a banda paga ~0,12 unidades — abaixo deste piso. Forçar o piso ali quebraria a
 * disjunção das bandas, que é o que impede as órbitas de se cruzarem: **corpo grande demais para a
 * banda atravessa o vizinho.**
 *
 * Entre "o planeta some de longe" e "as órbitas colidem", a cena escolhe o primeiro, porque a
 * primeira se conserta aproximando a câmera e a segunda afirma uma geometria falsa. É a escada de
 * LOD que o briefing pede — de longe o sistema é um ponto; ele se resolve quando alguém chega perto.
 */
const RAIO_MINIMO = 0.7;

/**
 * PISO DO SPRITE, em raio de pixel do FRAMEBUFFER — a única constante que a camada de sprite tem.
 *
 * ⚠️ **Ela não é gosto, e o comentário do `RAIO_MINIMO` logo acima é a metade que faltava.** Lá a
 * cena aceita, por escrito, que o planeta "some de longe" para as bandas não se cruzarem; isto é o
 * que impede o "some" de ser literal. O raio de MUNDO continua intocado — a REGRA DA FÍSICA diz que
 * o que dá para resolver fora da simulação se resolve fora, e a legibilidade a distância é
 * apresentação, não mecânica.
 *
 * O número sai de medida, e ela está em `docs/distancia-e-forma.md` §2.1: **49,7 de 71 corpos ficam
 * abaixo de 4 px de raio no enquadramento de casa**, e abaixo de 4 px não existe terminador nem
 * limbo — uma esfera sombreada de 2 px devolve UM valor de cor, que é literalmente o relato da tela
 * (*"cores diferentes, mas ainda assim esferas opacas"*).
 *
 * ⚠️ **A medida dá o intervalo, não o ponto.** O §5 do mesmo documento registra que o teto é ~8 px
 * (acima disso o sprite cobre a esfera e passa a MENTIR sobre o tamanho do corpo) e o chão é 4 px.
 * Entre os dois é decisão de olho, e é para mexer aqui: `spatia.universo.pixels()` mede o efeito.
 */
const PISO_SPRITE_PX = 4;
/**
 * Onde a ESFERA assume por inteiro, em múltiplos do piso — e o sprite se APAGA (ver `uHaloYield`).
 *
 * Sem isto o sprite seria aditivo por cima de um corpo que já tem pixels, e o que ele apagaria é
 * justamente o TERMINADOR — a única coisa que faz a esfera ler como volume, e o motivo declarado de
 * `CORPO_FS` não ser cor chapada. Consertar o corpo distante estragando o próximo seria trocar de
 * defeito.
 *
 * Em `2` a cessão se completa em 8 px, que é onde a medida do §2.1 põe o corpo com borda legível.
 * Ela é GRADUAL de propósito: um degrau aqui apareceria como o corpo piscando ao se aproximar, e
 * esta base já registra que "nada aparece, nada desaparece — tudo evolui".
 */
const CESSAO_DO_SPRITE = 2;

/**
 * BRILHO — e é aqui que a influência do §11.1 finalmente tem um leitor.
 *
 * A lei separa os eixos: **massa governa ESCALA, atividade governa ENERGIA, centralidade governa
 * INFLUÊNCIA**. Escala já está no raio; este é o outro canal, e sem ele a `centrality` que o P3
 * materializou seria mais uma invariante declarada sem ninguém que a consulte — o defeito que esta
 * base já pagou cinco vezes.
 *
 * ⚠️ **`centrality` pode ser `null`, e aí o brilho cai para a atividade sozinha** — não para zero.
 * Um corpo apagado porque o Neo4j não foi materializado seria o céu afirmando periferia sobre um
 * fato que ninguém mediu. É a lei nº 1 da integração, do lado do pixel.
 */
function brilhoDe(node, usoVale = false) {
  const atividade = Math.min((node.churn || 0) / 12, 1);
  const influencia = typeof node.centrality === 'number' ? node.centrality : null;
  // Piso 0,55: nem o corpo mais periférico do céu desaparece. Ele fica DISCRETO, que é diferente.
  const base = 0.55 + atividade * 0.35;
  const semUso = influencia === null ? base : base + influencia * 0.9;
  /*
   * ─────────────── O USO no brilho, e ele só entra com EVIDÊNCIA SUFICIENTE
   *
   * O P5 construiu a dimensão com evidência deliberadamente rala e publicou o veredito junto do
   * número (`evidenciaDeUso`), justamente para que ela NÃO influenciasse nada enquanto "usado por
   * muitos agentes" fosse um empate. O piso é grau máximo ≥ 5 e cobertura > 7,2%.
   *
   * ⚠️ **Ele foi vencido pela primeira vez em 2026-08-08**, com execuções REAIS contra o fixture:
   * 22 runs · 8 corpos tocados (11,3% do céu) · grau máximo 10 · 1 `:Agent`. Nada foi semeado — o
   * `--semear` recusa escrever no diário real, e a cadeia por hash é o que torna isso verificável.
   *
   * ⚠️ E o portão continua no código, não na lembrança: `usoVale` vem do veredito que viaja no
   * snapshot. Se o corpus mudar e a evidência voltar a ser rala, o uso PARA de influenciar sozinho
   * — que é a diferença entre uma dimensão medida e uma dimensão ligada de uma vez por todas.
   *
   * O peso é METADE do da influência (0,45 contra 0,9): "quem me abriu" é um sinal mais novo e mais
   * ralo que "quem se parece comigo", e o brilho deve dizer isso pela intensidade também.
   */
  const uso = typeof node.usage === 'number' ? node.usage : null;
  return usoVale && uso !== null ? semUso + uso * 0.45 : semUso;
}

/**
 * A COR DE CADA TIPO DE VÍNCULO — a legenda do `integracao-neo4j.md` §3.2.2, do lado do pixel.
 *
 * ⚠️ **Nenhuma delas aparece em `KIND_COLORS` nem em `DIRTY_LABELS`.** É a condição que impede o
 * arco de ser lido como o `kind` de um corpo ou como um estado do git — e as duas primeiras são
 * opostas em matiz, porque a única coisa que a rede TEM de comunicar sem legenda é que aquelas duas
 * linhas afirmam fatos diferentes.
 *
 * `REFERENCES` e `IMPORTS` (o P6) ainda não têm população. Eles entram aqui quando tiverem, e até
 * lá o pega-tudo desenha em cinza: um vínculo que existe e cuja voz ninguém declarou é diferente de
 * um vínculo ausente, e some-lo seria esconder um fato medido.
 */
export const COR_DO_VINCULO = {
  SIMILAR_TO: 0x6fe0ff,
  CO_EDITED: 0xff5fa2,
  REFERENCES: 0xffcf5c,
  IMPORTS: 0x8affc0,
  desconhecido: 0x8a97ad,
};

/**
 * ⚠️ **E as quatro se separam por DUAS coisas, não uma.** Só a matiz não bastaria com quatro tipos
 * na mesma tela: as duas primeiras são estatísticas e SIMÉTRICAS (parecença, co-edição), as duas
 * últimas são citações e têm SETA. O pulso viajante já distingue os dois grupos antes da cor —
 * `links.js` desenha direção onde ela foi medida e respiração onde não foi.
 */

/** `sentido` do snapshot → o sinal que o shader do arco lê. Recíproco = 0 = sem seta. */
const SENTIDO = { saida: 1, entrada: -1, mutuo: 0 };

/**
 * Tolerância do clique, em PIXELS de framebuffer.
 *
 * Não é conforto: sem ela os corpos pequenos seriam inselecionáveis. O corpo mediano desta cena tem
 * poucos pixels — ~4 é onde uma esfera deixa de ser um ponto —, e exigir o acerto dentro de 4 px
 * deixaria só as estrelas clicáveis. Três vezes isso é o alvo de clique mínimo usual, e continua
 * pequeno o bastante para não roubar o corpo vizinho: o empacotamento da teia garante 2× o raio do
 * sistema entre vizinhos.
 */
const ALVO_PX = 12;

const hash01 = (texto, sal = 0) => {
  let v = 2166136261 ^ sal;
  for (let i = 0; i < texto.length; i++) { v ^= texto.charCodeAt(i); v = Math.imul(v, 16777619); }
  return ((v >>> 0) % 100000) / 100000;
};

/** Resolve `M = E − e·sin(E)` por Newton. É ela que produz a 2ª lei (áreas iguais). */
function anomaliaExcentrica(M, e) {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 5; i++) {
    const passo = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= passo;
    if (Math.abs(passo) < 1e-6) break;
  }
  return E;
}

export function createUniverse() {
  const group = new THREE.Group();
  group.visible = false;

  /*
   * ⚠️ **12×8 segmentos era um POLÍGONO de perto, e isso não é falta de pele — é falta de vértice.**
   *
   * A malha nasceu quando esta cena era só estrutura vista de longe, onde um corpo tem 4 px e a
   * silhueta não se lê. Desde que o foco passou a enquadrar o corpo pelo raio dele (`FOCUS_FIT_PX`),
   * ele chega a centenas de pixels — e a 12 segmentos a borda vira um octógono visível. Relatado da
   * tela como "os astros são apenas esferas opacas": metade disso é a silhueta facetada, e essa
   * metade se conserta sem tocar em morfologia nenhuma.
   *
   * 32×16 é onde a borda para de mostrar faceta no enquadramento de foco. O custo é irrelevante e
   * medido: 1 024 triângulos por corpo × 188 = 192 mil, contra 0,31–0,35 ms que o céu inteiro já
   * custava — e a cena UNIVERSO roda sem o passe da lente, que sozinho come 3,8–5,1 ms.
   */
  const geo = new THREE.SphereGeometry(1, 32, 16);
  /*
   * ⚠️ **Sem `vertexColors`.** Ele faz o shader procurar um atributo `color` na GEOMETRIA, que não
   * existe aqui — e o resultado é preto, não erro. Quem colore instância é o `instanceColor`.
   *
   * ## Por que shader próprio, e não `MeshBasicMaterial`
   *
   * `MeshBasicMaterial` é cor CHAPADA: a esfera vira um disco, e um disco não lê como corpo — lê
   * como adesivo. A diferença entre os dois é o TERMINADOR, e ele não é enfeite: é a única coisa
   * que diz que aquilo tem volume.
   *
   * E a luz não pode ser global. Cada planeta é iluminado pela ESTRELA DELE, que é o fato inteiro
   * desta cena — luz global afirmaria de novo um centro único, que é justamente o que ela nega.
   * A posição da estrela viaja como atributo de instância; 228 luzes reais custariam o quadro.
   */
  const CORPO_VS = /* glsl */ `
    attribute vec3 aEstrela;
    attribute float aBrilho;
    varying vec3 vNormal;
    varying vec3 vLuz;
    varying vec3 vCor;
    varying float vBrilho;
    void main(){
      vBrilho = aBrilho;
      // ⚠️ \`vInstanceColor\` só existe nos materiais NATIVOS do three — em ShaderMaterial o varying
      // tem de ser declarado e preenchido à mão. O atributo \`instanceColor\` em si o renderer
      // declara sozinho quando \`mesh.instanceColor\` existe.
      vCor = instanceColor;
      vNormal = normalize(mat3(instanceMatrix) * normal);
      vec4 mundo = instanceMatrix * vec4(position, 1.0);
      vLuz = normalize(aEstrela - mundo.xyz);
      gl_Position = projectionMatrix * modelViewMatrix * mundo;
    }
  `;
  const CORPO_FS = /* glsl */ `
    precision highp float;
    varying vec3 vNormal;
    varying vec3 vLuz;
    varying vec3 vCor;
    varying float vBrilho;
    void main(){
      // Meia-lambert: o lado escuro nao vai a zero. Preto puro sobre fundo preto some, e some sem
      // avisar — o corpo deixa de existir em vez de ficar na sombra.
      float d = dot(normalize(vNormal), normalize(vLuz)) * 0.5 + 0.5;
      gl_FragColor = vec4(vCor * (0.10 + 0.90 * d * d) * vBrilho, 1.0);
    }
  `;
  const ESTRELA_FS = /* glsl */ `
    precision highp float;
    varying vec3 vNormal;
    varying vec3 vLuz;
    varying vec3 vCor;
    varying float vBrilho;
    void main(){
      // Estrela EMITE: sem terminador, e mais clara na BORDA — o limbo de um corpo emissivo nao
      // escurece, ao contrario do planeta. O ganho acima de 1 e o que da ao bloom o que amplificar.
      // ⚠️ O ganho ficou em 1,15 e nao em 1,6, e o motivo e medido: com 228 estrelas em 9 grumos,
      // dezenas caem no mesmo punhado de pixels e o brilho SOMA. Em 1,6 o miolo da teia virava uma
      // mancha branca e engolia os planetas — o bloom amplificava um estouro em vez de um astro.
      float borda = 1.0 - abs(normalize(vNormal).z);
      gl_FragColor = vec4(vCor * (1.05 + borda * 0.45) * 1.15 * vBrilho, 1.0);
    }
  `;
  const matPlaneta = new THREE.ShaderMaterial({ vertexShader: CORPO_VS, fragmentShader: CORPO_FS });
  const matEstrela = new THREE.ShaderMaterial({ vertexShader: CORPO_VS, fragmentShader: ESTRELA_FS });
  let estrelas = null;
  let planetas = null;
  /** Estado por planeta: a que sistema pertence, semi-eixo, excentricidade, fase. */
  let orbitas = [];
  let centros = [];
  let rumo = new THREE.Vector3(1, 0.3, 0).normalize();
  let stats = { sistemas: 0, corpos: 0, colisoes: 0 };
  /* source → tipo, na ontologia NOVA. É o que impede a HUD de anunciar a taxonomia velha
     por cima da cena nova — o mesmo defeito que a camada de galáxia tinha. */
  const tipos = new Map();

  /*
   * ─────────────────────────── a REDE, e por que ela mora aqui
   *
   * O arco é o mesmo desenho da cena AGENTE (`links.js`), em outra instância. Duas razões, e a
   * segunda é a que decide: as posições são as DESTA cena (planeta em órbita, sistema em deriva),
   * e o objeto precisa ser filho DESTE grupo — arco parented noutro lugar renderiza no espaço de
   * coordenadas errado, que é exatamente o defeito que os arcos da cena AGENTE já pagaram.
   *
   * ⚠️ As posições são recalculadas por quadro, nunca transportadas. Um arco entre dois corpos que
   * orbitam com velocidade angular diferente é um PADRÃO, não uma barra rígida — a mesma distinção
   * que fez a teia permanente sair da cena AGENTE.
   */
  const rede = createLinks();
  group.add(rede.object);

  /*
   * ─────────────────────────── O ANEL DO GIT — a terceira feição que só a outra cena tinha
   *
   * ⚠️ Relatado da tela: um corpo marcado **NÃO RASTREADO** aparecia sem anel. A causa é a mesma
   * da coroa da estrela: `rings` é instanciado dentro de `graph.js` e o grupo dele é filho de
   * `graph.group`, que o UNIVERSO esconde inteiro. O estado do git chegava ao painel e não à
   * geometria.
   *
   * ⚠️ E ele NÃO é feição de seleção, ao contrário da rede: anel é ESTADO — "este arquivo tem
   * trabalho aberto" —, e vale para todos os corpos sujos ao mesmo tempo. Mostrar só no foco
   * transformaria um fato permanente numa resposta a gesto.
   *
   * O `index` das entradas é a posição no buffer de posições, e o desta cena serve tal e qual: é
   * o mesmo contrato que o grafo usa, com outro buffer.
   */
  const aneis = createRings();
  group.add(aneis.group);
  /** `index` → raio desenhado, para o anel escalar com o corpo. Ver `follow`. */
  let sujosAtivos = [];

  /*
   * ─────────────────────────── A COROA da estrela em foco
   *
   * ⚠️ **Estrela emite luz própria, e a pele sozinha não emite.** Relatado da tela: a fotosfera
   * desenhava o grão e o corpo lia como pedra. O motivo é estrutural e não estava nesta cena: na
   * cena AGENTE quem faz a estrela BRILHAR é o sprite do grafo (`graph.haloOf`), aceso por trás da
   * fotosfera — e o UNIVERSO esconde o grafo inteiro, então o corpo perdia a luz junto.
   *
   * Isto não é morfologia nova: é a MESMA feição (`keepsCrown` já a nomeia — *"a fotosfera É o
   * corpo: a coroa fica, e é ela a atmosfera iluminada por trás"*), desenhada por quem esta cena
   * tem. Uma casca aditiva, sem escrita de profundidade, acesa no LIMBO — que é onde a atmosfera de
   * uma estrela real aparece, porque ali a linha de visada atravessa mais gás.
   */
  const COROA_VS = /* glsl */ `
    varying vec3 vN;
    varying vec3 vV;
    void main(){
      vec4 mundo = modelMatrix * vec4(position, 1.0);
      vN = normalize(mat3(modelMatrix) * normal);
      vV = normalize(cameraPosition - mundo.xyz);
      gl_Position = projectionMatrix * viewMatrix * mundo;
    }
  `;
  const COROA_FS = /* glsl */ `
    precision highp float;
    uniform vec3 uCor;
    uniform float uForca;
    varying vec3 vN;
    varying vec3 vV;
    void main(){
      // Borda: 0 no meio do disco, 1 no limbo. O expoente concentra a luz na borda em vez de
      // lavar o corpo inteiro — atmosfera se ve de perfil, nao de frente.
      float borda = 1.0 - abs(dot(normalize(vN), normalize(vV)));
      // Duas camadas: uma fina e forte colada no limbo, outra larga e fraca que é o halo.
      float limbo = pow(borda, 6.0);
      float halo = pow(borda, 1.6);
      float luz = (limbo * 1.6 + halo * 0.45) * uForca;
      gl_FragColor = vec4(uCor * luz, luz);
    }
  `;
  /** O branco levemente quente de uma fotosfera. A coroa puxa para cá; ver `coroar`. */
  const BRANCO_QUENTE = new THREE.Color(0xfff2dc);
  const matCoroa = new THREE.ShaderMaterial({
    uniforms: { uCor: { value: new THREE.Color(0xffd9a0) }, uForca: { value: 0 } },
    vertexShader: COROA_VS,
    fragmentShader: COROA_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
  /**
   * Raio da coroa, em raios do corpo. A cromosfera solar é uma casca FINA — a 1,35 ela descolava do
   * corpo e lia como uma bolha em volta da estrela, que é outra coisa.
   */
  const COROA_RAIO = 1.14;
  const coroa = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), matCoroa);
  coroa.frustumCulled = false;
  coroa.visible = false;
  coroa.renderOrder = 2;
  group.add(coroa);
  /*
   * ─────────────────────────── O SPRITE — a representação de LONGE, que esta cena nunca teve
   *
   * ⚠️ **O diagnóstico é medido e está em `docs/distancia-e-forma.md`:** a cena UNIVERSO tem
   * *esfera lisa* e *pele completa*, e NADA no meio. No enquadramento de casa, 49,7 de 71 corpos
   * ficam abaixo de 4 px de raio e **zero** alcança 22 px, que é o menor `LOD_FAR_PX` desta base —
   * ou seja, a pele não é alcançável por zoom, só por foco. O degrau do meio, que é justamente o
   * que a cena AGENTE tem, nunca foi construído.
   *
   * ⚠️ **E o defeito é PIXEL, não sombreamento.** Abaixo de ~4 px não há terminador (precisa de
   * gradiente), não há limbo (precisa de borda) e não há relevo (precisa de área): sobra UM valor
   * de cor por corpo. Nenhum modelo de iluminação conserta isso, porque não há onde escrever. O que
   * se lê em 2 px é EMISSÃO com pegada maior que a geometria — que é literalmente o que o AGENTE
   * faz, e é o que o relato da tela chamou de "mais bonita".
   *
   * ⚠️ **Não é morfologia nova, e por isso não colide com a trava do replanejamento** (*"nenhuma
   * morfologia até a classificação que decide quando ela existe estar correta"*). É a MESMA feição
   * já classificada, desenhada por quem esta cena tem — o terceiro caso do mesmo precedente, depois
   * da coroa da estrela e do anel do git, os dois trazidos para cá pelo mesmo argumento: o objeto
   * vive dentro de `graph.js` e o UNIVERSO esconde aquele grupo inteiro.
   *
   * O material vem de `createPointMaterial()`, não de uma cópia: um shader reimplementado aqui
   * passaria a mentir na primeira divergência, que é exatamente o instante em que ele importaria.
   * Cada chamada devolve material NOVO, então o `uSize` desta cena não mexe no da outra.
   */
  const matSprite = createPointMaterial();
  /*
   * ⚠️ **`uSize` vira 1 e o TAMANHO passa a viajar inteiro no `aSize`, por quadro.**
   *
   * A lei que o desenho tem de obedecer é `px_sprite = max(px_geometria, PISO)`, e ela NÃO cabe num
   * atributo estático: o `max` quebra a proporcionalidade com `1/z` que o vertex shader assume
   * (`uSize · aSize · 300/−z`). Perto, o sprite acompanha a esfera; longe, ele trava no piso — duas
   * leis diferentes de distância, e só a CPU sabe em qual dos dois regimes cada corpo está.
   *
   * ⚠️ E a escolha de calcular em JS não é preguiça de shader: é o que faz `pixels()` medir o
   * NÚMERO QUE A GPU DESENHA, em vez de uma segunda derivação da mesma conta livre para divergir da
   * primeira. Uma régua, um lugar. Esta base já pagou por sondas que mediam a grandeza errada com a
   * marcha perfeita.
   */
  matSprite.uniforms.uSize.value = 1;
  /*
   * ⚠️ **`uHaloYield = 1` fixo, e é ele que faz a cessão ser um DESAPARECIMENTO e não um BURACO.**
   *
   * O fragmento resolve `core *= mix(1.0, aberto, vHalo)` com `aberto = mix(smoothstep(0,0.62,d), 0,
   * uHaloYield)`. Em 0 — o modo da cena AGENTE — o miolo do sprite é ESVAZIADO e sobra o aro: lá
   * isso é certo, porque a pele em foco É o corpo e o que tem de restar é a coroa em volta dela. Em
   * 1 a conta vira `core *= 1 − vHalo`, uma atenuação limpa e proporcional.
   *
   * ⚠️ **Aqui o modo do AGENTE seria um defeito, e ele tem nome:** o corpo cedendo ganharia um anel
   * de luz com o meio vazado por cima de uma esfera que ESTÁ desenhada — e um miolo escuro dentro de
   * um halo lê exatamente como *"o planeta está transparente e deixando o núcleo à mostra"*. Foi o
   * relato da tela nesta rodada. A diferença entre as duas cenas é qual desenho assume o corpo: lá é
   * a pele (e a coroa é atmosfera de verdade), aqui é a ESFERA, que não precisa de aro nenhum.
   *
   * Isto NÃO mexe na cena AGENTE: `createPointMaterial()` devolve material novo a cada chamada, e
   * este uniform é deste material. Ver a nota do `createPointMaterial`.
   */
  matSprite.uniforms.uHaloYield.value = 1;
  let sprites = null;
  /** `aSize` e `aHalo` vivos — reescritos por quadro. Ver `update`. */
  let spriteTam = null;
  let spriteHalo = null;
  /** Posição do sprite: NÃO é `posicoes`. Ver a nota da profundidade em `update`. */
  let spritePos = null;
  /** Raio aparente medido no último quadro, por índice — a matéria-prima de `pixels()`. */
  let pxGeometria = null;
  let pxSprite = null;
  /*
   * A PROFUNDIDADE DE VISTA por corpo, guardada — e ela existe para a bancada do PISO.
   *
   * `aplicarPiso()` precisa de `z` para inverter `uSize·aSize·(300/−z)`, e ela roda FORA do laço
   * do quadro (quando `termos({piso})` troca o piso entre dois `composer.render()`). Recalcular o
   * `z` ali seria uma segunda cópia da conversão — e o comentário dela já avisa que usar `dist` no
   * lugar de `z` infla o sprite na borda da tela, onde ninguém procuraria a causa.
   */
  let zPorIndice = null;
  /*
   * O PISO VIVO. Nasce em `PISO_SPRITE_PX` e só a bancada o move (`spatia.universo.piso`).
   *
   * ⚠️ Ele é decisão de OLHO dentro de um intervalo que a medida já cercou: 3 px é o chão (abaixo
   * disso não adianta) e ~8 px é o teto (acima, o sprite cobre a esfera e passa a mentir sobre o
   * tamanho do corpo). Ver `docs/distancia-e-forma.md` §5 — a medida dá o intervalo e recusa
   * escolher dentro dele.
   */
  let pisoSprite = PISO_SPRITE_PX;

  /**
   * A LEI DO SPRITE, e ela cabe numa linha: `px_sprite = max(px_geometria, PISO)`.
   *
   * Extraída do laço do quadro porque tem **dois chamadores**: o `update`, uma vez por quadro, e
   * `termos({ piso })`, que precisa reaplicá-la **entre dois `composer.render()`** — sem isso o A/B
   * do piso mediria o piso velho com o rótulo do novo, que é o modo de falha que esta base mais
   * registra. Deixá-la em dois lugares seria duas leis de tamanho para o mesmo fato.
   *
   * Ela NÃO recalcula posição nem `pxGeometria`: nenhum dos dois depende do piso. O que ela precisa
   * do quadro — `pxGeometria` e `zPorIndice` — já está guardado.
   */
  function aplicarPiso() {
    if (!sprites || !pxGeometria || !zPorIndice || !corpos.length) return;
    const largura = pisoSprite * CESSAO_DO_SPRITE;
    for (let i = 0; i < corpos.length; i++) {
      const pxG = pxGeometria[i];
      const pxS = Math.max(pxG, pisoSprite);
      pxSprite[i] = pxS;
      // `gl_PointSize` é DIÂMETRO; `pxS` é raio. A inversão exata de `uSize·aSize·(300/−z)`.
      spriteTam[i] = (2 * pxS * zPorIndice[i]) / POINT_SCALE;
      /*
       * A CESSÃO. Corpo em foco cede INTEIRO (1): ali quem desenha é a pele, e o núcleo do sprite
       * por cima dela apagaria o relevo que a pele existe para mostrar — a mesma razão pela qual
       * `haloOf` já cede no AGENTE. Fora do foco, cede conforme a esfera ganha borda.
       */
      spriteHalo[i] = i === cedidoIdx ? 1 : suave(pisoSprite, largura, pxG);
    }
    sprites.geometry.getAttribute('aSize').needsUpdate = true;
    sprites.geometry.getAttribute('aHalo').needsUpdate = true;
  }

  /** `smoothstep` do GLSL em JS — a cessão do sprite tem de ser a mesma curva dos dois lados. */
  const suave = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  /** Posição VIVA de todo corpo, na ordem `estrelas` e depois `planetas`. É o buffer do arco. */
  let posicoes = null;
  /** `source` → índice em `posicoes`. É o que traduz um vínculo do snapshot em dois índices. */
  const indiceDe = new Map();
  /** Índice → o nó do `/api/graph`, para o picking devolver corpo e não número. */
  let corpos = [];
  /** Raio DESENHADO por índice — o que o teste de sobreposição precisa e a matriz de instância já usa. */
  let raiosPorIndice = null;
  /** A seleção em vigor e o que ela desenhou. `null` = ninguém selecionado, e a rede some. */
  let selecao = null;
  /**
   * O corpo cuja PELE é desenhada por fora — ele CEDE o lugar, mas não desaparece.
   *
   * ⚠️ **A primeira versão escondia a esfera, e o corpo sumia ao afastar a câmera.** A pele tem
   * escada de LOD: abaixo de ~90 px ela apaga (medido: 35 270 pixels acesos a px 103 contra 3 430 a
   * px 82), e sem a esfera não sobrava nada no lugar. Qualquer limiar que ligasse a esfera de volta
   * teria o mesmo defeito num degrau diferente — o problema não era ONDE esconder, era ESCONDER.
   *
   * O que resolve sem limiar nenhum: a esfera encolhe 2% e vira o NÚCLEO. Enquanto a pele está
   * opaca ela cobre a esfera (nada de z-fighting, que é o motivo de a esfera ter saído); conforme a
   * pele apaga com a distância, o núcleo reaparece por baixo. É uma transição contínua em vez de um
   * degrau, e é grátis — nenhum quadro precisa decidir nada.
   */
  const FATOR_NUCLEO = 0.98;
  let cedidoIdx = -1;
  /* Posição de mundo do planeta 0, atualizada por quadro. É a sonda que prova MOVIMENTO —
     sem ela, "os astros orbitam?" não distingue órbita parada de órbita invisível. */
  const amostra = new THREE.Vector3();
  let quadros = 0;
  let ultimoElapsed = 0;

  const M4 = new THREE.Matrix4();
  const V3 = new THREE.Vector3();
  const Q = new THREE.Quaternion();
  // Próprio, e não o `V3` acima: este é lido DENTRO do `follow`, que roda depois dos laços de
  // órbita — compartilhar o temporário faria a distância do anel depender da ordem das chamadas.
  const ALVO = new THREE.Vector3();
  /* Próprios, pelo mesmo motivo do `ALVO`: o laço do sprite roda DEPOIS dos laços de órbita e
     ANTES do `follow` do anel. Compartilhar o temporário faria o tamanho do sprite depender da
     ordem das chamadas — a espécie de acoplamento que não dá erro, só número errado. */
  const SP = new THREE.Vector3();
  const SV = new THREE.Vector3();

  /**
   * O raio do corpo `i` nas DUAS réguas que `rings.follow` consome: mundo e pixel.
   *
   * ⚠️ Aqui se passava o NÚMERO cru de `raiosPorIndice`, e `follow` lê `size.world` e `size.px`.
   * Os dois saíam `undefined`: a escala da malha virava `NaN` (nada desenhado) e o nível de
   * detalhe também. Anel montado e invisível é o pior estado possível — a sonda conta e a tela
   * não mostra.
   *
   * `world` é o raio do SPRITE equivalente, não o do corpo: `follow` escala por
   * `world · VISIBLE_CORE` porque no AGENTE o astro visível é 0,6 do sprite. Nesta cena o corpo é
   * malha e `raiosPorIndice` JÁ é o raio desenhado, então dividir pelo mesmo 0,6 é o que faz o aro
   * envolver a esfera em vez de cortá-la.
   *
   * `px` é o raio aparente do corpo — a régua que decide quando a rocha entra (`LOD_NEAR_PX`). É a
   * mesma conta de `graph.apparentPx`, com a régua do framebuffer que `scene` já passa ao `pick`.
   */
  function raioAparente(i, camera, viewportHeight) {
    const raio = raiosPorIndice?.[i] ?? 1;
    ALVO.set(posicoes[i * 3], posicoes[i * 3 + 1], posicoes[i * 3 + 2]);
    const meiaAltura = Math.max(
      Math.tan((camera.fov * Math.PI) / 360) * camera.position.distanceTo(ALVO),
      1e-4
    );
    return { world: raio / VISIBLE_CORE, px: (raio * viewportHeight) / (2 * meiaAltura) };
  }

  function limpar() {
    for (const m of [estrelas, planetas]) if (m) { group.remove(m); m.dispose?.(); }
    estrelas = planetas = null;
    // O material é do módulo e sobrevive à troca de corpus; a GEOMETRIA é do céu que saiu.
    if (sprites) { group.remove(sprites); sprites.geometry.dispose(); }
    sprites = null;
    spritePos = spriteTam = spriteHalo = pxGeometria = pxSprite = zPorIndice = null;
    orbitas = [];
    centros = [];
    posicoes = null;
    corpos = [];
    sujosAtivos = [];
    aneis.set([]);
    indiceDe.clear();
    selecao = null;
    rede.show(null);
  }

  /**
   * Posição de um sistema na teia, com REJEIÇÃO.
   *
   * Reservar o volume certo não basta — dois pontos aleatórios caem juntos (problema do
   * aniversário). Medido na bancada: sem rejeição, 132 colisões que nenhum raio de universo
   * conserta; com 30 tentativas, zero. O grumo cresce 6% por tentativa para um nó lotado se
   * expandir em vez de a busca falhar.
   */
  function posicionar(i, nos, porNo, envelope, medio, postos) {
    const a = hash01(`s${i}`, 11), b = hash01(`s${i}`, 23), c = hash01(`s${i}`, 41);
    const idx = Math.floor(a * nos.length) % nos.length;
    const base = nos[idx].clone().lerp(nos[Math.floor(b * nos.length) % nos.length], c < 0.35 ? hash01(`s${i}`, 59) : 0);
    const grumoBase = Math.max((medio * Math.cbrt(Math.max(porNo[idx], 1))) / 0.6, medio * 2.2);
    for (let k = 0; k < TENTATIVAS; k++) {
      const grumo = grumoBase * (1 + k * 0.06);
      const u = hash01(`s${i}:${k}`, 71), v = hash01(`s${i}:${k}`, 83), w = hash01(`s${i}:${k}`, 97);
      const rr = grumo * Math.cbrt(u);
      const theta = v * Math.PI * 2;
      const phi = Math.acos(2 * w - 1);
      const p = base.clone().add(new THREE.Vector3(
        rr * Math.sin(phi) * Math.cos(theta),
        rr * Math.sin(phi) * Math.sin(theta),
        rr * Math.cos(phi)
      ));
      /*
       * ⚠️ **A distância mínima é a soma dos DOIS envelopes, não uma constante.**
       *
       * Com um raio único, o teste media centros e deixava passar exatamente o caso que ele existe
       * para pegar: um sistema grande engolindo um pequeno. Agora dois sistemas se tocam quando os
       * envelopes se tocam, que é o que "não colidir" significa quando eles têm tamanhos diferentes.
       */
      if (postos.every((o) => o.pos.distanceTo(p) >= envelope + o.envelope)) return p;
    }
    return base;
  }

  return {
    object: group,
    /** O tipo de um corpo NESTA cena, ou `null` fora dela. A HUD pergunta; ela não deduz. */
    tipoDe: (source) => tipos.get(source) ?? null,

    /**
     * Põe anel nos corpos cujo arquivo está alterado no disco.
     *
     * ⚠️ **Este método não existia, e a chamada em `scene.markDirty` já existia.** O
     * `TypeError: universe.sujar is not a function` subia do `scene.markDirty` até o `catch` do
     * `watchDirty`, que responde a QUALQUER falha apagando os anéis (`forgetDirty`) — então o
     * defeito não ficava nesta cena: ele zerava o `dirtyState` do grafo e derrubava o anel das
     * DUAS cenas, mais a linha DISCO do painel, que sai de `graph.dirtyOf`. Medido antes do
     * conserto: 17 arquivos sujos, 17 casando com `byPath`, `spatia.cena().aneis` = 0, e a única
     * testemunha era uma nota no log — *"ALTERAÇÕES LOCAIS INDISPONÍVEIS: universe.sujar is not a
     * function · ANÉIS REMOVIDOS"*. É por isso que quem chama não pode engolir o erro: a nota foi
     * a prova.
     *
     * `estadoDe(source)` é o `graph.dirtyOf`. Quem lê o `git status` continua sendo uma cena só e
     * esta consome o resultado pelo `source` — duas leituras da mesma tabela divergiriam no dia em
     * que uma delas mudasse de chave.
     *
     * ⚠️ A FAMÍLIA sai da geometria DAQUI, não do solver do AGENTE: `índice < centros.length` é
     * uma estrela desta cena, e o catálogo é explícito — *a estrela não ganha anel, ganha um disco
     * de detritos*. Perguntar ao `resolveBody` responderia sobre a morfologia da OUTRA cena, onde
     * o mesmo arquivo pode ser um pulsar que recusa anel enquanto aqui ele é uma esfera que o
     * aceita.
     */
    sujar(estadoDe) {
      const entradas = [];
      for (const [source, i] of indiceDe) {
        const state = estadoDe(source);
        if (!state) continue;
        // `recency` alimenta o `dimOf` do `follow`, e aqui ele é constante (esta cena não tem
        // janela temporal): vai o valor neutro em vez de um campo faltando.
        entradas.push({ index: i, size: raiosPorIndice?.[i] ?? 1, state, recency: 1, detritos: i < centros.length });
      }
      const resultado = aneis.set(entradas);
      // A sonda conta o que foi MONTADO, não o que foi pedido: o teto de `maxRings` corta, e um
      // número que ignorasse o corte mentiria exatamente na hora em que ele passa a importar.
      sujosAtivos = entradas.slice(0, resultado.shown);
      return resultado;
    },
    stats: () => ({
      ...stats,
      quadros,
      elapsed: +ultimoElapsed.toFixed(2),
      amostra: [+amostra.x.toFixed(3), +amostra.y.toFixed(3), +amostra.z.toFixed(3)],
      // A rede na sonda: sem isto, "a seleção desenhou?" só se responde por foto — e foto não
      // distingue arco ausente de arco desenhado fora da tela.
      rede: selecao
        ? { fonte: selecao.fonte, desenhados: selecao.desenhados, recusados: selecao.recusados, total: selecao.total }
        : null,
      /*
       * ⚠️ Quantos ANÉIS estão montados. Sem isto, "o anel não apareceu" não distingue três coisas
       * diferentes: mapa de sujos vazio, `source` que não casou, e geometria muda. Foi exatamente
       * essa dúvida que custou a primeira investigação.
       */
      aneis: sujosAtivos.length,
    }),

    /**
     * OS CORPOS SE ATRAVESSAM? — a sonda que responde por MEDIDA o que a foto não decide.
     *
     * ⚠️ Ela existe porque "aqueles dois estão colidindo" e "aqueles dois estão um na frente do
     * outro" produzem a MESMA imagem numa cena sem sombra projetada, e a diferença entre as duas é
     * um defeito de geometria contra nada. Esta base já pagou por isso: *"posição na foto é dado"*,
     * e *"prove movimento com contador, não com foto"*.
     *
     * Varre TODOS os pares (188 corpos = 17 578 pares) e devolve os piores. Só sob demanda — nunca
     * por quadro.
     *
     * @param {number} [limite] quantos pares devolver
     * @returns {{pares:number, sobrepostos:number, piores:Array}}
     */
    sobreposicoes(limite = 6) {
      if (!posicoes || !raiosPorIndice) return { pares: 0, sobrepostos: 0, piores: [] };
      const achados = [];
      let pares = 0;
      for (let i = 0; i < corpos.length; i++) {
        for (let j = i + 1; j < corpos.length; j++) {
          pares++;
          const dx = posicoes[i * 3] - posicoes[j * 3];
          const dy = posicoes[i * 3 + 1] - posicoes[j * 3 + 1];
          const dz = posicoes[i * 3 + 2] - posicoes[j * 3 + 2];
          const soma = raiosPorIndice[i] + raiosPorIndice[j];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= soma * soma) continue;
          const d = Math.sqrt(d2);
          achados.push({
            a: corpos[i]?.source ?? corpos[i]?.id,
            b: corpos[j]?.source ?? corpos[j]?.id,
            distancia: +d.toFixed(3),
            somaDosRaios: +soma.toFixed(3),
            // Quanto um entrou no outro. É o número que decide, e ele é positivo só quando há
            // interpenetração de verdade.
            penetracao: +(soma - d).toFixed(3),
          });
        }
      }
      achados.sort((x, y) => y.penetracao - x.penetracao);
      return { pares, sobrepostos: achados.length, piores: achados.slice(0, limite) };
    },

    /** A distância viva entre dois corpos e a soma dos raios deles. Para conferir um par nomeado. */
    entre(a, b) {
      const i = indiceDe.get(a);
      const j = indiceDe.get(b);
      if (i === undefined || j === undefined || !posicoes) return null;
      const dx = posicoes[i * 3] - posicoes[j * 3];
      const dy = posicoes[i * 3 + 1] - posicoes[j * 3 + 1];
      const dz = posicoes[i * 3 + 2] - posicoes[j * 3 + 2];
      const d = Math.hypot(dx, dy, dz);
      const soma = raiosPorIndice[i] + raiosPorIndice[j];
      return {
        distancia: +d.toFixed(3),
        raios: [+raiosPorIndice[i].toFixed(3), +raiosPorIndice[j].toFixed(3)],
        somaDosRaios: +soma.toFixed(3),
        penetracao: +(soma - d).toFixed(3),
        // A distância ao CENTRO de cada um: é a grandeza que as bandas disjuntas separam, e é ela
        // que diz se o defeito é da banda ou de outra coisa.
        raioOrbital: [
          +Math.hypot(posicoes[i * 3], posicoes[i * 3 + 1], posicoes[i * 3 + 2]).toFixed(3),
          +Math.hypot(posicoes[j * 3], posicoes[j * 3 + 1], posicoes[j * 3 + 2]).toFixed(3),
        ],
      };
    },

    /**
     * QUANTOS PIXELS CADA CORPO TEM, agora — a sonda que impede "ficou melhor" de voltar a ser foto.
     *
     * ⚠️ Ela mede o quadro que ACABOU de ser desenhado: `pxGeometria` e `pxSprite` são escritos pelo
     * laço do `update`, com a mesma câmera e a mesma régua de framebuffer que a GPU usou. Não é uma
     * reconstrução da conta — é o número que foi para o `aSize`. Esta base já registra o custo da
     * alternativa: *"medir a grandeza errada parece medir"*, com a marcha perfeita.
     *
     * ⚠️ **`quadros` vem junto de propósito, e é a primeira coisa a olhar.** Sonda congelada MENTE, e
     * mente de forma PLAUSÍVEL — aba oculta estrangula o `rAF` e a leitura devolve um quadro velho
     * com toda a cara de presente. Se `quadros` não anda entre duas leituras, nenhum número daqui é
     * do presente.
     *
     * A referência medida ANTES do sprite, no fixture (71 corpos, enquadramento de casa, buffer
     * 3024×1484, fov 80) está em `docs/distancia-e-forma.md` §2.1: **49,7 de 71 abaixo de 4 px ·
     * 0 de 71 acima de 22 px · máximo 17,1 px**.
     */
    pixels() {
      if (!pxSprite || !corpos.length) return { quadros, n: 0, piso: pisoSprite };
      const perfil = (fonte) => {
        const v = Array.from(fonte.slice(0, corpos.length)).sort((a, b) => a - b);
        const q = (p) => +v[Math.min(v.length - 1, Math.floor(p * v.length))].toFixed(2);
        return { min: +v[0].toFixed(2), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95),
          max: +v[v.length - 1].toFixed(2) };
      };
      const conta = (fonte, teste) => {
        let c = 0;
        for (let i = 0; i < corpos.length; i++) if (teste(fonte[i])) c++;
        return c;
      };
      let cedendo = 0;
      for (let i = 0; i < corpos.length; i++) if (spriteHalo[i] > 0.5) cedendo++;
      return {
        quadros,
        n: corpos.length,
        piso: pisoSprite,
        /* O raio da ESFERA — a coluna que não muda, porque o sprite não toca na simulação. É a
           testemunha de que o raio de mundo continua onde estava. */
        geometria: {
          ...perfil(pxGeometria),
          abaixoDoPiso: conta(pxGeometria, (x) => x < pisoSprite),
          // 22 px é o menor `LOD_FAR_PX` desta base (nebulosa) — o limiar do §2.1.
          acimaDe22: conta(pxGeometria, (x) => x >= 22),
        },
        /* O que a tela realmente desenha. `abaixoDoPiso` tem de ser ZERO — é a lei, medida. */
        sprite: { ...perfil(pxSprite), abaixoDoPiso: conta(pxSprite, (x) => x < pisoSprite) },
        /* Quantos já cederam o miolo para a esfera: o outro lado da mesma lei. */
        cedendo,
      };
    },

    /**
     * A ÂNCORA de um corpo: onde ele está e QUE TAMANHO tem, agora.
     *
     * ⚠️ É o equivalente do `graph.planetAnchor` para esta cena, e sem ele a câmera não sabe chegar
     * perto: o piso de zoom cai no valor global (12 unidades) enquanto os corpos daqui medem 0,1 a
     * 1,6 — a câmera parava a dez vezes o tamanho do que se pediu para ver.
     */
    ancoraDe(source) {
      const i = indiceDe.get(source);
      if (i === undefined || !posicoes || !raiosPorIndice) return null;
      return {
        position: new THREE.Vector3(posicoes[i * 3], posicoes[i * 3 + 1], posicoes[i * 3 + 2]),
        radius: raiosPorIndice[i],
        node: corpos[i],
      };
    },

    /**
     * Este corpo tem PELE desenhada por fora: a esfera dele vira núcleo (2% menor). `null` devolve.
     *
     * A alternativa seria a cena UNIVERSO desenhar a própria pele, e ela seria uma segunda cópia
     * das seis que já existem e já foram validadas na bancada.
     */
    cederPara(source) {
      const i = source ? indiceDe.get(source) : undefined;
      cedidoIdx = i === undefined ? -1 : i;
    },

    /**
     * Acende a COROA sobre um corpo — a luz própria da estrela, que a pele sozinha não emite.
     *
     * @param {string|null} source  o corpo, ou `null` para apagar
     * @param {number} forca  0…1, tipicamente o nível de LOD da pele: a coroa apaga junto com ela
     */
    coroar(source, forca = 1) {
      const i = source ? indiceDe.get(source) : undefined;
      if (i === undefined || !posicoes || !raiosPorIndice || forca <= 0.001) {
        coroa.visible = false;
        return;
      }
      coroa.visible = true;
      coroa.position.set(posicoes[i * 3], posicoes[i * 3 + 1], posicoes[i * 3 + 2]);
      coroa.scale.setScalar(raiosPorIndice[i] * COROA_RAIO);
      matCoroa.uniforms.uForca.value = forca;
      /*
       * ⚠️ **A cor da coroa NÃO é a do `kind`.** O `kind` é o fato do corpus e governa a cor do
       * CORPO (§4 do replanejamento); a coroa é LUZ, e luz de estrela não é cinza. Com
       * `other = 0x6f7b8f` a casca saía cinza-azulada e lia como fumaça. Ela puxa o matiz do corpo
       * — para duas estrelas de tipos diferentes não terem a mesma luz — e vai a 70% do branco
       * quente, que é o que faz a coroa passar do limiar do bloom e virar brilho de verdade.
       */
      const cor = corpos[i] ? KIND_COLORS[corpos[i].kind] : null;
      matCoroa.uniforms.uCor.value.setHex(cor ?? 0xffd9a0).lerp(BRANCO_QUENTE, 0.7);
    },

    /** Posição VIVA de um corpo desta cena, ou `null` se ele não é corpo aqui. */
    posicaoDe(source) {
      const i = indiceDe.get(source);
      if (i === undefined || !posicoes) return null;
      return new THREE.Vector3(posicoes[i * 3], posicoes[i * 3 + 1], posicoes[i * 3 + 2]);
    },

    /**
     * O corpo sob o ponteiro, por PROXIMIDADE NA TELA.
     *
     * ⚠️ **Não é raycast contra a esfera**, e a diferença é a razão de existir do método. O corpo
     * mediano desta cena tem ~4 px; exigir o acerto dentro da malha deixaria só as estrelas
     * clicáveis, e o gesto morreria em silêncio sobre a maior parte do céu — que é o defeito que a
     * cena AGENTE já resolveu com `threshold` nos pontos.
     *
     * ⚠️ E ele existe porque o picking da cena AGENTE **continua acertando** aqui: o raycast do
     * three não olha `visible`, então o grafo escondido responde por baixo do universo. Sem esta
     * rota, selecionar no UNIVERSO devolvia o corpo de outra cena, com convicção total.
     *
     * @param {THREE.Vector2} ponteiro  em NDC (−1…1), como o `pointer` da cena
     * @param {THREE.Camera} camera
     * @param {number} alturaFB  `canvas.height` — framebuffer, nunca `clientHeight`
     */
    pick(ponteiro, camera, alturaFB) {
      if (!posicoes || !corpos.length || !alturaFB) return null;
      // NDC → px: metade da altura, porque o NDC vai de −1 a 1. Mesma unidade do `gl_PointSize`.
      const limite = (ALVO_PX * 2) / alturaFB;
      let melhor = null;
      for (let i = 0; i < corpos.length; i++) {
        V3.set(posicoes[i * 3], posicoes[i * 3 + 1], posicoes[i * 3 + 2]).project(camera);
        // Atrás da câmera o `project` devolve coordenada espelhada — sem este corte, um corpo às
        // costas do observador ganharia o clique de um corpo à frente.
        if (V3.z > 1) continue;
        const dx = V3.x - ponteiro.x;
        const dy = V3.y - ponteiro.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > limite * limite) continue;
        if (!melhor || d2 < melhor.d2) melhor = { d2, node: corpos[i], i };
      }
      // `position` viaja junto porque quem recebe o pick também acende partículas ali — pedir a
      // posição depois, por `source`, seria ler o buffer de novo para responder o que já se sabe.
      if (!melhor) return null;
      const p = melhor.i * 3;
      return { node: melhor.node, position: new THREE.Vector3(posicoes[p], posicoes[p + 1], posicoes[p + 2]) };
    },

    /**
     * A REDE NA SELEÇÃO — o corpo vira o centro temporário da topologia dele.
     *
     * `vizinhanca` é o que o `/api/vizinhanca` devolveu para este corpo (já cortado no teto pelo
     * script que o materializou). Passar `null` apaga a rede por desvanecimento.
     *
     * ⚠️ **Vizinho que não é corpo DESTA cena é recusado, e a recusa é contada.** A cena UNIVERSO
     * desenha arquivos; um vínculo para algo que ela não desenha não pode virar linha para lugar
     * nenhum. Contar em vez de descartar é o que impede a legenda de nomear um arco que a tela não
     * tem — a mesma regra que o `MAX_LINKS` já obrigava.
     *
     * @returns {{desenhados:number, recusados:number, total:object}|null}
     */
    selecionar(source, vizinhanca) {
      if (!source || !vizinhanca || indiceDe.get(source) === undefined) {
        selecao = null;
        rede.show(null);
        return null;
      }
      const eu = indiceDe.get(source);
      const pares = [];
      let recusados = 0;
      for (const v of vizinhanca.v || []) {
        const outro = indiceDe.get(v.para);
        if (outro === undefined) { recusados++; continue; }
        pares.push([eu, outro, COR_DO_VINCULO[v.tipo] ?? COR_DO_VINCULO.desconhecido, SENTIDO[v.sentido] ?? 0]);
      }
      const desenhados = rede.show(pares);
      selecao = { fonte: source, desenhados, recusados, total: vizinhanca.total || {} };
      return { desenhados, recusados, total: selecao.total };
    },

    /**
     * Monta a cena a partir do payload do grafo. Idempotente: recarregar refaz tudo.
     *
     * O sistema é o AGREGADO (pasta ou repo) e a estrela é o arquivo dominante dele. Os 336
     * arquivos que penduram direto no repo não são órfãos: o sistema deles é o repositório.
     */
    load(payload) {
      limpar();
      tipos.clear();
      /*
       * O veredito de evidência viaja com a topologia (`stats.uso.evidencia`), escrito por quem
       * mediu. Lê-lo aqui em vez de recalcular é a mesma regra da legenda dos arcos: o que se vê
       * sai do mesmo lugar que o que se mediu.
       */
      const usoVale = payload?.stats?.uso?.evidencia?.suficiente === true;
      const nodes = payload?.nodes || [];
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const filhos = new Map();
      for (const [filho, pai] of payload?.edges || []) {
        if (!filhos.has(pai)) filhos.set(pai, []);
        filhos.get(pai).push(byId.get(filho));
      }

      const aggs = nodes.filter((n) => n.type !== 'file');
      const sistemas = [];
      for (const agg of aggs) {
        const meus = (filhos.get(agg.id) || []).filter((c) => c?.type === 'file');
        if (!meus.length) continue;
        const dono = meus.reduce((x, y) => {
          const mx = x.chunks || 0, my = y.chunks || 0;
          return my > mx ? y : my < mx ? x : (x.id < y.id ? x : y);
        });
        sistemas.push({ agg, estrela: dono, planetas: meus.filter((f) => f.id !== dono.id) });
        tipos.set(agg.id, agg.type === 'repo' ? 'GALÁXIA' : 'SISTEMA');
        for (const f of meus) {
          const fis = entityPhysics(f, { dominante: f.id === dono.id, sistema: agg.id });
          tipos.set(f.source, classificar(fis, f).tipo.toUpperCase());
        }
      }

      /*
       * ─────────────────────────── O ORÇAMENTO DE VOLUME, e é ele que decide TODA escala
       *
       * O envelope de cada sistema é proporcional ao raio da estrela dele — massa governa escala,
       * a lei do §11.1 — e o conjunto é normalizado para caber em `OCUPACAO` do volume do universo.
       * Nenhuma constante calibrada sobrevive aqui: 15 sistemas dão envelope ~14, os 221 do corpus
       * real dariam ~5,8, e a cena reescala sozinha.
       *
       * ⚠️ Isto substitui `ESCALA_CORPO = 4,5`, que era um ganho de LEGIBILIDADE cego ao número de
       * sistemas — ele punha a maior estrela em raio 7,7 enquanto o empacotamento reservava 2.
       */
      /*
       * O envelope segue a massa TOTAL do sistema, não a da estrela — densidade média constante,
       * que é a afirmação mais simples que se pode fazer sobre tamanho de sistema. A alternativa
       * (envelope ∝ raio da estrela) foi medida e perde: ela ignora quantos corpos o sistema tem,
       * então a pasta de 38 arquivos recebe o mesmo volume de uma de 2 com estrela parecida, e as
       * bandas orbitais lá ficam 2,6× mais estreitas — **menor planeta 0,039 contra 0,100 un**.
       */
      /*
       * ⚠️ **O POSTO ESTELAR — a temperatura de uma estrela se mede contra outras ESTRELAS.**
       *
       * `massRank` (escrito por `graph.js`) é o posto no ranking do céu inteiro, e para estrela ele
       * é uma constante disfarçada: ela é, por definição, o arquivo mais massivo da pasta dela.
       * Medido aqui: **dez das 17 estrelas têm `massRank` acima de 0,85**. A fotosfera derivava
       * temperatura, tamanho de grânulo, escurecimento de limbo e cor desse número — e com ele
       * saturado o céu ficava com dezessete estrelas iguais.
       *
       * Quem sabe quem é estrela é esta cena, então é ela que escreve o posto. Empate resolve pelo
       * `id`, para o número não depender da ordem em que os sistemas chegaram.
       */
      const porMassa = [...sistemas].sort(
        (a, b) => (a.estrela.chunks || 0) - (b.estrela.chunks || 0) || (a.estrela.id < b.estrela.id ? -1 : 1)
      );
      porMassa.forEach((s, i) => {
        s.estrela.postoEstelar = porMassa.length > 1 ? i / (porMassa.length - 1) : 0.5;
      });

      const bruto = sistemas.map((s) =>
        Math.cbrt((s.estrela.chunks || 1) + s.planetas.reduce((a, f) => a + (f.chunks || 0), 0))
      );
      const somaCubos = bruto.reduce((a, r) => a + r * r * r, 0) || 1;
      const lambda = Math.cbrt((OCUPACAO * Math.pow(RAIO_UNIVERSO, 3)) / somaCubos);
      const reservados = bruto.map((r) => r * lambda);
      /*
       * A escala de CORPO é UMA SÓ, para estrela e planeta — é o que mantém a lei massa→raio
       * intacta entre os dois. Duas escalas fariam a inversão nº 1 voltar pela porta dos fundos:
       * um planeta massivo num sistema pequeno ficaria maior que uma estrela num sistema grande.
       *
       * Ela é derivada do aperto MÁXIMO: a estrela mais folgada em relação ao envelope dela decide,
       * porque basta uma não caber para o sistema dela furar o volume reservado.
       */
      const escalaCorpo = Math.min(
        ...sistemas.map((s, i) => (reservados[i] * FRACAO_ESTRELA) / raioPorMassa(s.estrela.chunks || 1))
      );
      const raios = sistemas.map((s) => Math.max(raioPorMassa(s.estrela.chunks || 1) * escalaCorpo, RAIO_MINIMO * 1.6));
      /*
       * ⚠️ **O envelope cede ao PISO, e não o contrário.** `RAIO_MINIMO` impede corpo sub-pixel, e
       * numa pasta de 1 arquivo ele deixa a estrela maior do que a fatia de volume que o orçamento
       * lhe daria — aí a órbita de Roche sairia PARA FORA do envelope, e o empacotamento reservaria
       * menos espaço do que o sistema ocupa. Um corpo que some é pior do que um vazio menor, então
       * o envelope cresce para caber a escada; o que ele nunca faz é encolher e mentir.
       */
      const envelopes = sistemas.map((s, i) => Math.max(reservados[i], (raios[i] * ROCHE * 1.2) / 0.95));
      const envelopeMedio = envelopes.reduce((a, b) => a + b, 0) / (envelopes.length || 1);
      const nos = [];
      for (let k = 0; k < NOS; k++) {
        nos.push(new THREE.Vector3(
          (hash01(`n${k}`, 7) - 0.5) * 1.6 * RAIO_UNIVERSO,
          (hash01(`n${k}`, 13) - 0.5) * 1.6 * RAIO_UNIVERSO,
          (hash01(`n${k}`, 17) - 0.5) * 1.6 * RAIO_UNIVERSO
        ));
      }
      const porNo = new Array(NOS).fill(0);
      for (let i = 0; i < sistemas.length; i++) porNo[Math.floor(hash01(`s${i}`, 11) * NOS) % NOS]++;

      /*
       * ⚠️ **Os MAIORES primeiro, e a ordem não é detalhe de implementação.**
       *
       * Com envelopes de tamanhos diferentes, colocar na ordem do corpus faz o sistema grande
       * chegar por último e não achar buraco — ele precisa de espaço que os pequenos já picotaram.
       * É o mesmo motivo pelo qual se empacota caixa grande antes de caixa pequena. Medido neste
       * corpus: **3 colisões na ordem do corpus, 0 na ordem por tamanho.**
       *
       * A colocação é por tamanho; o ARRAY continua na ordem do corpus, porque é ele que casa com
       * `centros`, `orbitas` e o índice do arco.
       */
      const postos = new Array(sistemas.length);
      const colocados = [];
      const ordem = sistemas.map((_, i) => i).sort((a, b) => envelopes[b] - envelopes[a]);
      for (const i of ordem) {
        const posto = { pos: posicionar(i, nos, porNo, envelopes[i], envelopeMedio, colocados), s: sistemas[i], envelope: envelopes[i] };
        postos[i] = posto;
        colocados.push(posto);
      }

      // Colisões, para o painel poder acusar em vez de a tela deixar passar. Mesma régua da
      // rejeição: dois sistemas colidem quando os ENVELOPES se tocam, não os centros.
      let colisoes = 0;
      for (let i = 0; i < postos.length; i++) {
        for (let j = i + 1; j < postos.length; j++) {
          if (postos[i].pos.distanceTo(postos[j].pos) < postos[i].envelope + postos[j].envelope) colisoes++;
        }
      }

      const corEstrela = [];
      const corPlaneta = [];
      const brilhoE = [];
      /*
       * O índice de um corpo é o mesmo em `posicoes`, em `corpos` e no `InstancedMesh` dele —
       * estrelas primeiro, planetas depois. Um índice só evita a tradução que já mordeu esta base
       * ("espaço de coordenadas", armadilha nº 9): o arco lê o buffer por índice e não sabe, nem
       * precisa saber, se aquilo é estrela ou planeta.
       */
      const estrelasPorFonte = [];
      const planetasPorFonte = [];
      centros = postos.map(({ pos, s, envelope }, i) => {
        const fisica = entityPhysics(s.estrela, { dominante: true, sistema: s.agg.id });
        classificar(fisica, s.estrela); // a classe é dele; aqui só o raio importa
        const raio = raios[i];
        const cor = new THREE.Color(KIND_COLORS[s.estrela.kind] ?? 0xffd9a0);
        corEstrela.push(cor.r, cor.g, cor.b);
        brilhoE.push(brilhoDe(s.estrela, usoVale));
        estrelasPorFonte.push(s.estrela);

        // Inclinação própria por sistema: dois sistemas não compartilham plano orbital.
        const inc = (hash01(s.agg.id, 31) - 0.5) * 1.4;
        const giro = hash01(s.agg.id, 37) * Math.PI * 2;

        /*
         * ─────────────────── A ESCADA ORBITAL, agora LIMITADA pelos dois lados
         *
         * ⚠️ **Ela era `a = raio · 2,44 · 1,38^(j+1)` — geométrica e SEM TETO, e isso não é um
         * exagero de escala: é uma explosão.** O passo de 1,38 foi derivado na bancada com a
         * MEDIANA de 4 planetas por estrela (1,38⁴ = 3,7×, uma escada de sistema solar). Aplicado
         * aos 38 arquivos de `src/space`, 1,38³⁸ põe a órbita mais externa a **2.165.653 unidades**
         * num universo de raio 52 — e 8 dos 15 sistemas estouravam o universo inteiro.
         *
         * O sintoma era o relatado da tela: travar num corpo desses não mostra mais nada em volta,
         * porque não HÁ mais nada por perto — a câmera está a milhões de unidades da teia. E a rede
         * na seleção acusou o defeito antes de qualquer medida: um corpo de alcance 0% (todos os
         * vínculos na mesma pasta, logo no mesmo sistema) desenhava arcos varrendo a tela inteira.
         *
         * A escada nova tem os dois extremos ancorados em fato:
         *
         * - **piso**: o limite de Roche (`ROCHE` raios estelares), que é onde material deixa de se
         *   acretar em lua — o mesmo 2,44 do `orbital-zones.js`;
         * - **teto**: o ENVELOPE do sistema, que é o volume que o empacotamento reservou para ele.
         *
         * Entre os dois, os planetas ficam **log-uniformes** — que é a mesma leitura da escada
         * antiga ("cada planeta um tanto mais longe que o anterior", Titius–Bode), só que com a
         * razão DERIVADA do número de planetas em vez de fixa. Com 4 planetas ela dá um sistema
         * solar largo; com 38, uma escada apertada. É o que uma lei faz e uma constante não.
         */
        const aMin = raio * ROCHE;
        const aMax = Math.max(envelope * 0.95, aMin * 1.2);
        const n = s.planetas.length;
        /*
         * ─────────────────── BANDAS DISJUNTAS — a lei das LUAS, aplicada aos planetas
         *
         * ⚠️ **Distribuir os planetas na janela NÃO impede que eles se cruzem**, e foi o que a tela
         * mostrou: escada log-uniforme com 38 corpos põe vizinhos a menos de um raio um do outro, e
         * as órbitas colidem. Espaçamento não é separação.
         *
         * A cena já tinha a lei certa e ela estava a um módulo de distância: `orbital-zones.js`
         * corta a janela das luas em N **bandas disjuntas** e faz cada corpo viver dentro da SUA. O
         * que fecha a prova é a distância ao centro ser `r` exatamente, qualquer que seja a
         * inclinação — então basta o intervalo radial `[a(1−e) − raio, a(1+e) + raio]` caber na
         * banda para que dois corpos de bandas distintas **nunca estejam à mesma distância do
         * centro, logo nunca se encontrem**.
         *
         * O orçamento de uma banda de largura `B`, com a folga DOBRADA em relação às luas (ver
         * `FOLGA_DA_BANDA` — o corpo do céu é olhado de perto, e dois que quase se tocam leem como
         * um só):
         *
         * | fatia | quanto |
         * |---|---|
         * | diâmetro do planeta | até `B/2` (raio `B/4`) |
         * | excursão da elipse (`2·a·e`) | o que sobrar |
         * | **folga vazia** | **`B/2`, metade em cada ponta** |
         *
         * O intervalo radial de cada corpo mede `B/2 − folga` para cada lado do semieixo, então a
         * distância VAZIA entre dois vizinhos é `2 · FOLGA_DA_BANDA · B` — e ela não depende do
         * tamanho do corpo, porque a excursão absorve o que o corpo não usa.
         *
         * ⚠️ E o raio desenhado é **o que a banda paga**, limitado pelo que a massa permite — a
         * mesma compressão declarada das luas. Num sistema de 38 arquivos os planetas ficam
         * pequenos, e isso é a verdade da cena: 38 corpos não cabem grandes na fatia de volume que
         * o universo tem para dar. Quem quiser vê-los aproxima a câmera; o que não se pode é
         * desenhá-los grandes e deixá-los atravessar uns aos outros.
         */
        const janela = aMax - aMin;
        const banda = janela / Math.max(n, 1);
        const raioDaBanda = banda / BANDA_CORPOS;
        s.planetas.forEach((f, j) => {
          const rp = Math.min(raioPorMassa(f.chunks || 1) * escalaCorpo, raioDaBanda, raio * 0.85);
          const a = aMin + banda * (j + 0.5);
          /*
           * A EXCENTRICIDADE não é escolhida: é o que sobra da banda depois do corpo e da folga —
           * `EXCENTRICIDADE` era uma constante e virou consequência, como nas luas. E ela varia
           * sozinha entre os planetas do mesmo sistema: a excursão é a mesma em todas as bandas,
           * então o planeta interno, com `a` menor, fica mais excêntrico que o externo. Razão
           * física, não decoração.
           */
          const excursao = Math.max(banda / 2 - rp - banda * FOLGA_DA_BANDA, 0);
          const e = Math.min(EXCENTRICIDADE_MAX, excursao / a);
          const c2 = new THREE.Color(KIND_COLORS[f.kind] ?? 0x8fb8ff);
          corPlaneta.push(c2.r, c2.g, c2.b);
          planetasPorFonte.push(f);
          /*
           * ⚠️ **A velocidade angular era `0,9 · a^-1,5` — Kepler com a massa de TODAS as estrelas
           * igual, e com a constante calibrada na escala antiga.** Com as órbitas nos milhares de
           * unidades ela dava 6,5 min para a órbita mais interna; na escala nova daria 5 s. Um
           * número que muda de significado quando o mundo reescala é uma constante expirável.
           *
           * `n = MOVIMENTO_MEDIO · (raio/a)^1,5` conserta os dois: a razão é ADIMENSIONAL, então
           * ela sobrevive a qualquer reescala do universo, e `raio³ ∝ M` faz a terceira lei valer
           * também ENTRE sistemas — estrela mais massiva move seus planetas mais rápido no mesmo
           * raio relativo, que é o que Kepler afirma e o que a constante única negava.
           */
          orbitas.push({ centro: i, a, e, rp, fase: hash01(f.id, 53) * Math.PI * 2, inc, giro,
            n: MOVIMENTO_MEDIO * Math.pow(raio / a, 1.5), brilho: brilhoDe(f, usoVale) });
        });
        return { pos, raio, sistema: s.agg.id };
      });

      corpos = [...estrelasPorFonte, ...planetasPorFonte];
      corpos.forEach((n, i) => { if (n?.source) indiceDe.set(n.source, i); });
      posicoes = new Float32Array(Math.max(corpos.length, 1) * 3);
      raiosPorIndice = Float32Array.from([...centros.map((c) => c.raio), ...orbitas.map((o) => o.rp)]);

      estrelas = new THREE.InstancedMesh(geo, matEstrela, Math.max(centros.length, 1));
      planetas = new THREE.InstancedMesh(geo, matPlaneta, Math.max(orbitas.length, 1));
      /*
       * A posição da estrela de cada planeta, como atributo. É o que permite 1 408 corpos serem
       * iluminados por 228 fontes diferentes sem uma única luz de verdade na cena.
       */
      const luz = new Float32Array(Math.max(orbitas.length, 1) * 3);
      const brilhoP = new Float32Array(Math.max(orbitas.length, 1));
      orbitas.forEach((o, i) => {
        const c = centros[o.centro].pos;
        luz[i * 3] = c.x; luz[i * 3 + 1] = c.y; luz[i * 3 + 2] = c.z;
        brilhoP[i] = o.brilho;
      });
      planetas.geometry = geo.clone();
      planetas.geometry.setAttribute('aEstrela', new THREE.InstancedBufferAttribute(luz, 3));
      planetas.geometry.setAttribute('aBrilho', new THREE.InstancedBufferAttribute(brilhoP, 1));
      estrelas.geometry = geo.clone();
      estrelas.geometry.setAttribute('aEstrela', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(centros.length, 1) * 3), 3));
      estrelas.geometry.setAttribute('aBrilho', new THREE.InstancedBufferAttribute(Float32Array.from(brilhoE), 1));
      estrelas.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(corEstrela), 3);
      planetas.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(corPlaneta), 3);
      estrelas.frustumCulled = false;
      planetas.frustumCulled = false;
      group.add(estrelas, planetas);

      /*
       * ─── A CAMADA DE SPRITE, na MESMA ordem de `corpos` — estrelas e depois planetas.
       *
       * A ordem não é detalhe: `posicoes`, `raiosPorIndice`, `indiceDe` e o anel já falam por
       * índice, e um segundo mapeamento aqui seria a quarta tradução do mesmo corpo. O sprite lê o
       * mesmo índice que todo o resto desta cena lê.
       */
      const n = corpos.length;
      spritePos = new Float32Array(Math.max(n, 1) * 3);
      spriteTam = new Float32Array(Math.max(n, 1));
      spriteHalo = new Float32Array(Math.max(n, 1));
      pxGeometria = new Float32Array(Math.max(n, 1));
      pxSprite = new Float32Array(Math.max(n, 1));
      zPorIndice = new Float32Array(Math.max(n, 1));
      const geoSprite = new THREE.BufferGeometry();
      geoSprite.setAttribute('position', new THREE.BufferAttribute(spritePos, 3));
      geoSprite.setAttribute('aSize', new THREE.BufferAttribute(spriteTam, 1));
      geoSprite.setAttribute('aHalo', new THREE.BufferAttribute(spriteHalo, 1));
      /*
       * ⚠️ **A COR é a mesma do corpo, e vem do mesmo array — não de uma segunda tabela.**
       * O sprite e a esfera afirmam o MESMO tipo; duas fontes para a cor de um corpo é como a HUD
       * passou a anunciar a taxonomia velha por cima da nova (`ce8ad95`).
       */
      geoSprite.setAttribute('aColor', new THREE.BufferAttribute(
        Float32Array.from([...corEstrela, ...corPlaneta]), 3));
      /*
       * ⚠️ **Os cinco atributos abaixo existem para não ficarem IMPLÍCITOS.** Atributo não ligado lê
       * como `(0,0,0,1)` na GPU — funciona, e é a espécie de acerto silencioso que esta base já
       * pagou cinco vezes (campo declarado sem leitor, invariante sem implementação). Zero aqui é
       * uma AFIRMAÇÃO: o passo 1 desenha existência, tipo e tamanho, e nada mais.
       *
       * `aRecency = 0` com o `uReveal = 1` do material dá `within = 1` — sem playhead, a janela
       * temporal fica inteiramente aberta e o `shrink` do vertex vale 1. Sem isso o sprite nasceria
       * 0,62× menor que a lei manda, e a diferença apareceria como o piso não pegando.
       *
       * `aSupernova` e `aDwarf` ficam em zero mesmo com o fato disponível nos nós (§2.5 do relatório
       * conta 3 e 7 de 71): eles são o passo 2, e acender agora seria decidir no escuro quanto de
       * cada feição cabe num corpo de 4 px.
       */
      for (const [nome, largura] of [['aIgnition', 1], ['aRecency', 1], ['aSupernova', 1], ['aDwarf', 1], ['aHidden', 1]]) {
        geoSprite.setAttribute(nome, new THREE.BufferAttribute(new Float32Array(Math.max(n, 1) * largura), largura));
      }
      /* A semente da silhueta sai do CAMINHO, como em toda feição por nó — nunca do índice, que
         muda quando o corpus ganha ou perde um arquivo. Ver `starSeed`. */
      geoSprite.setAttribute('aSeed', new THREE.BufferAttribute(
        Float32Array.from(corpos.map((c) => (c ? starSeed(c) : 0))), 1));
      sprites = new THREE.Points(geoSprite, matSprite);
      sprites.frustumCulled = false;
      /*
       * ⚠️ **Depois das esferas, e o motivo é a mistura.** O sprite é ADITIVO e não escreve
       * profundidade (`createPointMaterial`); ele precisa somar sobre o que a esfera já pintou. Na
       * ordem inversa ele somaria sobre o fundo e a esfera opaca o apagaria em seguida — sprite
       * montado e invisível, que é o pior estado possível, porque a sonda conta e a tela não mostra.
       */
      sprites.renderOrder = 1;
      group.add(sprites);

      stats = { sistemas: centros.length, corpos: centros.length + orbitas.length, colisoes };
      return stats;
    },

    /**
     * Um quadro. Sistemas viajam e planetas orbitam — a composição é uma HÉLICE.
     *
     * ⚠️ A deriva é do UNIVERSO inteiro, não por sistema: o que a cena afirma é que não há
     * referencial parado, e mover cada sistema para um lado diferente afirmaria outra coisa.
     */
    update(elapsed, delta = 0, camera = null, viewportHeight = 0) {
      quadros++;
      ultimoElapsed = elapsed;
      if (!estrelas || !planetas) return;
      const desloca = rumo.clone().multiplyScalar(elapsed * DERIVA);
      for (let i = 0; i < centros.length; i++) {
        V3.copy(centros[i].pos).add(desloca);
        // A POSIÇÃO é escrita sempre — o arco e o picking dependem dela mesmo com o corpo oculto.
        // Quem some é só a ESCALA da instância: zero desenha nada e não custa fragmento nenhum.
        posicoes[i * 3] = V3.x; posicoes[i * 3 + 1] = V3.y; posicoes[i * 3 + 2] = V3.z;
        M4.compose(V3, Q, new THREE.Vector3().setScalar(centros[i].raio * (i === cedidoIdx ? FATOR_NUCLEO : 1)));
        estrelas.setMatrixAt(i, M4);
      }
      for (let k = 0; k < orbitas.length; k++) {
        const o = orbitas[k];
        const M = elapsed * o.n + o.fase;
        const E = anomaliaExcentrica(M, o.e);
        const b = o.a * Math.sqrt(1 - o.e * o.e);
        // Foco na origem do sistema: `x = a(cos E − e)`. A estrela não fica no centro da elipse.
        const x = o.a * (Math.cos(E) - o.e);
        const z = b * Math.sin(E);
        // Plano próprio do sistema: giro no plano, depois inclinação.
        const xr = x * Math.cos(o.giro) - z * Math.sin(o.giro);
        const zr = x * Math.sin(o.giro) + z * Math.cos(o.giro);
        const c = centros[o.centro];
        V3.set(c.pos.x + xr, c.pos.y + zr * Math.sin(o.inc), c.pos.z + zr * Math.cos(o.inc)).add(desloca);
        M4.compose(V3, Q, new THREE.Vector3().setScalar(o.rp * (centros.length + k === cedidoIdx ? FATOR_NUCLEO : 1)));
        planetas.setMatrixAt(k, M4);
        const p = (centros.length + k) * 3;
        posicoes[p] = V3.x; posicoes[p + 1] = V3.y; posicoes[p + 2] = V3.z;
        if (k === 0) amostra.copy(V3);
      }
      estrelas.instanceMatrix.needsUpdate = true;
      planetas.instanceMatrix.needsUpdate = true;

      /*
       * ─── O SPRITE, e a lei inteira dele cabe numa linha: `px_sprite = max(px_geometria, PISO)`.
       *
       * ⚠️ **Ele deriva do RAIO JÁ DESENHADO, nunca de `chunks` outra vez.** No AGENTE o `aSize` sai
       * de `log2(1+chunks)`; aqui `chunks` já decidiu o raio de mundo em `raioPorMassa`, e derivá-lo
       * de novo criaria DUAS leis de tamanho para o MESMO fato — a lei nº 3 do replanejamento, e as
       * duas divergiriam de verdade (log2 contra o piso da banda orbital). Saindo de
       * `raiosPorIndice`, o sprite não tem como contradizer a esfera: ele só a impede de sumir.
       *
       * Sem corpo em foco isto é a única coisa que roda por quadro além das matrizes, e são três
       * escritas num buffer de `n` floats — a mesma ordem de grandeza do que o anel já faz.
       */
      if (camera && viewportHeight && sprites) {
        /* `H/(2·tan(fov/2))`: a MESMA constante de projeção de `raioAparente` e de
           `graph.apparentPx`. Recalculada por quadro porque o fov é um slider de afinação, e uma
           cópia congelada aqui viraria a divergência que o comentário de `ancoraDoUniverso` manda
           vigiar. */
        const k = viewportHeight / (2 * Math.max(Math.tan((camera.fov * Math.PI) / 360), 1e-6));
        for (let i = 0; i < corpos.length; i++) {
          const raio = raiosPorIndice[i];
          SP.set(posicoes[i * 3], posicoes[i * 3 + 1], posicoes[i * 3 + 2]);
          const dist = Math.max(camera.position.distanceTo(SP), 1e-4);
          const pxG = (raio * k) / dist;
          pxGeometria[i] = pxG;
          /*
           * ⚠️ **A conversão usa a PROFUNDIDADE DE VISTA, e o raio aparente usa a DISTÂNCIA.**
           *
           * Não é descuido: são as duas réguas certas para as duas perguntas. O vertex shader
           * divide por `−viewPosition.z`, então é `z` que tem de entrar aqui para o `px` pedido
           * sair intacto do outro lado — fora do eixo óptico `dist > z`, e usar `dist` nos dois
           * lugares inflaria o sprite na borda da tela, onde ninguém procuraria a causa.
           */
          zPorIndice[i] = Math.max(-SV.copy(SP).applyMatrix4(camera.matrixWorldInverse).z, 1e-4);
          /*
           * ⚠️ **A POSIÇÃO DO SPRITE NÃO É `posicoes`, e sem isto ele nasceria invisível.**
           *
           * Um `THREE.Points` é um ponto no CENTRO do corpo, e a esfera é opaca e ESCREVE
           * profundidade: o teste de profundidade descartaria o sprite contra a própria esfera dele
           * — não contra as outras, contra a dele. O sintoma seria um buraco escuro no lugar do
           * brilho, e o `depthWrite: false` do material não salva, porque quem reprova é o TESTE.
           *
           * Ele vai para a superfície FRONTAL: o centro deslocado para a câmera pelo raio do corpo.
           * Isso é o que a coisa é fisicamente — o brilho de uma atmosfera está na frente da rocha,
           * não no miolo dela — e preserva a oclusão VERDADEIRA: um corpo atrás de outro continua
           * atrás. Desligar o teste de profundidade daria o mesmo pixel de perto e mentiria de
           * longe, que é a troca que esta cena recusa desde a sonda `sobreposicoes()`.
           */
          SV.subVectors(camera.position, SP).normalize().multiplyScalar(raio);
          spritePos[i * 3] = SP.x + SV.x;
          spritePos[i * 3 + 1] = SP.y + SV.y;
          spritePos[i * 3 + 2] = SP.z + SV.z;
        }
        sprites.geometry.getAttribute('position').needsUpdate = true;
        // A LEI DO PISO mora em `aplicarPiso`, e ela tem DOIS chamadores: este, por quadro, e a
        // bancada, entre dois desenhos do mesmo quadro. Uma lei, duas portas.
        aplicarPiso();
      }
      // DEPOIS das posições, nunca antes: o arco lê o buffer que este quadro acabou de escrever.
      // Um quadro de atraso aqui aparece como o vínculo arrastando atrás do corpo.
      rede.update(posicoes, delta, elapsed);
      /*
       * O anel segue pelo MESMO buffer, pelo índice. `dimOf` devolve 1 porque esta cena não tem
       * filtro de tipo (quem some no AGENTE é o que o histograma escondeu); `radiusOf` devolve as
       * duas réguas do corpo — ver `raioAparente`, que é o que faz o aro envolver a esfera em vez
       * de sair `NaN`.
       */
      if (camera && viewportHeight && sujosAtivos.length) {
        aneis.follow(posicoes, camera, () => 1, (i) => raioAparente(i, camera, viewportHeight), elapsed, undefined, cedidoIdx);
      }
    },

    setVisible(v) { group.visible = v; },
    dispose() { limpar(); rede.dispose(); coroa.geometry.dispose(); matCoroa.dispose(); geo.dispose(); matEstrela.dispose(); matPlaneta.dispose(); matSprite.dispose(); },
  };
}
