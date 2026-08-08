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
import { KIND_COLORS } from './graph.js';
import { createLinks } from './links.js';

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
function brilhoDe(node) {
  const atividade = Math.min((node.churn || 0) / 12, 1);
  const influencia = typeof node.centrality === 'number' ? node.centrality : null;
  // Piso 0,55: nem o corpo mais periférico do céu desaparece. Ele fica DISCRETO, que é diferente.
  const base = 0.55 + atividade * 0.35;
  return influencia === null ? base : base + influencia * 0.9;
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
  desconhecido: 0x8a97ad,
};

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

  function limpar() {
    for (const m of [estrelas, planetas]) if (m) { group.remove(m); m.dispose?.(); }
    estrelas = planetas = null;
    orbitas = [];
    centros = [];
    posicoes = null;
    corpos = [];
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
        brilhoE.push(brilhoDe(s.estrela));
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
            n: MOVIMENTO_MEDIO * Math.pow(raio / a, 1.5), brilho: brilhoDe(f) });
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

      stats = { sistemas: centros.length, corpos: centros.length + orbitas.length, colisoes };
      return stats;
    },

    /**
     * Um quadro. Sistemas viajam e planetas orbitam — a composição é uma HÉLICE.
     *
     * ⚠️ A deriva é do UNIVERSO inteiro, não por sistema: o que a cena afirma é que não há
     * referencial parado, e mover cada sistema para um lado diferente afirmaria outra coisa.
     */
    update(elapsed, delta = 0) {
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
      // DEPOIS das posições, nunca antes: o arco lê o buffer que este quadro acabou de escrever.
      // Um quadro de atraso aqui aparece como o vínculo arrastando atrás do corpo.
      rede.update(posicoes, delta, elapsed);
    },

    setVisible(v) { group.visible = v; },
    dispose() { limpar(); rede.dispose(); geo.dispose(); matEstrela.dispose(); matPlaneta.dispose(); },
  };
}
