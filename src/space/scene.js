/**
 * A cena: renderer, cadeia de pós-processamento, câmera, e a tradução de eventos em imagem.
 *
 * Ordem da cadeia importa e não é arbitrária:
 *
 *   render → lente → bloom → output
 *
 * A lente vem **antes** do bloom porque o brilho tem que florescer a partir da imagem já
 * deformada — florescer antes e deformar depois arrastaria o halo junto com a distorção, o
 * que denuncia o truque na hora. O `OutputPass` fecha com tone mapping e conversão de
 * espaço de cor; sem ele o aditivo estoura em branco chapado.
 */
import * as THREE from 'three';
import { EffectComposer } from '../../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../vendor/jsm/postprocessing/OutputPass.js';

import { on, ui } from '../core/bus.js';
import * as tuning from '../core/tuning.js';
import * as prefs from '../core/prefs.js';
import { createBlackHole } from './blackhole.js';
import { createUniverse } from './universe.js';
// A ontologia nova, e a tabela que a traduz em pele. Ver `decisaoDoUniverso`.
import { entityPhysics, classificar, fenomenos } from './entity-physics.js';
import { superficieDe } from './superficies.js';
import { createLensingPass } from './lensing.js';
import { createStars } from './stars.js';
import { createGraph, hash01, starSeed } from './graph.js';
import * as motion from '../core/motion.js';
import { createParticles } from './particles.js';
import { createSatellites, createWormholes, TOOL_COLORS } from './satellites.js';
import { createBodies } from './bodies.js';
import { createBackdrop } from './backdrop.js';
import { createPlanet, planetParams, LOD_FAR_PX as PLANETA_FAR } from './planet.js';
import { RS_POR_RAIO } from './astrofisica.js';
import { createLinks } from './links.js';
import { createGalaxy, galaxyParams, diskPx, LOD_ARM_PX, LOD_FULL_PX } from './galaxy.js';
import { createQuasars, quasarParams } from './quasar.js';
import { MOTION, rateOf } from './motion-catalog.js';
import { trace } from '../core/trace.js';
import { resolveBody, SURFACE } from './solver.js';
import { SKIN_EXTENT, FOCUS_FIT_PX, FOCUS_FLOOR_RADII, budget, keepsCrown, BODY_SPAN } from './lod.js';
import { createPhotosphere, photosphereParams, LOD_FAR_PX as FOTOSFERA_FAR } from './photosphere.js';
import { createRemnant } from './remnant.js';
import { createMoonOrbits } from './moon-orbits.js';
import { createStation, stationParams } from './station.js';
import { createComet, cometParams, LOD_FAR_PX as COMETA_FAR } from './comet.js';
import { createPulsar, pulsarParams, LOD_FAR_PX as PULSAR_FAR } from './pulsar.js';
import { createNebula, nebulaParams } from './nebula.js';

/*
 * `start.z` acompanha `graphSpread`: a casca de nós foi de 46–110 para 68–160 unidades, e uma
 * câmera parada em 54 ficaria DENTRO dela — olhando o grafo de dentro para fora.
 */
/*
 * ⚠️ `start` é o enquadramento de quem nunca mexeu na câmera, e ele acompanha o `graphSpread`.
 *
 * 88 unidades enquadravam a casca de 68–161. Com o espaçamento no máximo (3,5) ela vai a 91–217, e
 * o vetor inteiro teve de mudar — DISTÂNCIA e ELEVAÇÃO, e a segunda importou mais que a primeira.
 *
 * Medido olhando três poses. De 260 o céu vira um aglomerado pequeno num quadro vazio, que é o
 * oposto de vasto. De 96 quase no plano do disco (`y = 26`), o disco de acreção — que com
 * `coreScale 2.05` tem raio 80 — enche o quadro sozinho e o céu fica atrás dele. 150 com `y = 96`
 * põe a câmera a ~34° acima do plano: o núcleo ancora o centro sem dominar, e a casca de arquivos
 * se abre em profundidade até 217, que é a leitura pedida.
 *
 * `fov` aqui é só o valor de partida do objeto: quem manda é o slider (`tuning`), aplicado no boot.
 */
const CAMERA = { fov: 46, near: 0.1, far: 900, start: new THREE.Vector3(0, 96, 115) };

/**
 * Suavização exponencial independente de frame rate.
 *
 * `x += (alvo - x) * k` é a forma tentadora e está errada: `k` é fração POR QUADRO, então a
 * 120fps a câmera converge duas vezes mais rápido que a 60fps, e num quadro longo ela dá um
 * salto. Como o quadro longo acontece exatamente quando se arrasta o mouse (raycast + upload
 * de buffers no mesmo frame), o defeito aparece no pior momento possível.
 *
 * Com `1 - exp(-rate * delta)` o resultado depende só do tempo decorrido: mesma trajetória a
 * qualquer FPS, e quadro perdido não vira tranco. `rate` é em unidades de 1/segundo.
 */
const smooth = (current, target, rate, delta) =>
  current + (target - current) * (1 - Math.exp(-rate * delta));

// Taxas de convergência, em 1/s. Câmera responde rápido, regime cognitivo respira devagar.
const RATE = { orbit: 9, zoom: 6, focus: 1.4, portal: 5 };
const PICK_INTERVAL_MS = 60;
const DRIFT_BASE = 0.014;
const LONG_FRAME_MS = 50;
const MAX_PIXEL_RATIO = 2;
/*
 * Salvamento periódico da órbita. Não é "a cada quadro": o que se guarda é ONDE O OPERADOR
 * DEIXOU a câmera, e entre dois gestos não há nada de novo para gravar.
 */
const ORBIT_SAVE_MS = 5_000;
/*
 * Enquadramento de um astro do céu. Mais perto que o de um corpo de app (30) porque um nó é um
 * ponto, não uma malha: à distância do app ele seria um pixel no meio da tela.
 */
/*
 * Distância da câmera ao astro focado.
 *
 * Era 16, e nunca tinha sido conferida contra o tamanho do que se olha. Medido no maior arquivo
 * do corpus (226 chunks): raio visível de 0,64 no mundo, o que a 16 unidades dá ~70px de raio
 * aparente — abaixo do limiar de 90 em que a superfície procedural entra. O astro travava e
 * continuava sendo um ponto.
 *
 * A 7, o mesmo astro passa de 160px e vira planeta. Corpos menores continuam pontos, e isso é o
 * nível de detalhe funcionando: quem é pequeno de verdade não ganha crosta por ter sido clicado.
 */
const NODE_FOCUS_DISTANCE = 7;
const NODE_FOCUS_POLAR = 1.18;

/*
 * `FOCUS_FIT_PX`, `FOCUS_FLOOR_RADII` e `SKIN_EXTENT` moraram aqui e agora moram em `lod.js`.
 *
 * Não foi arrumação: os três formam UM orçamento com os `LOD_FAR_PX`/`LOD_NEAR_PX` das peles, e
 * enquanto o recuo estava neste arquivo e o piso de detalhe no de cada pele, ninguém conferia a
 * colisão — foi assim que o pulsar passou a não ser desenhado em distância alcançável nenhuma.
 * Juntos, eles se checam sozinhos na carga. A conta inteira está no cabeçalho de `lod.js`.
 */
/** Free-flight range, when nothing is locked. */
const ZOOM_RANGE = { min: 12, max: 260 };
/**
 * Distância de casa da cena UNIVERSO — o enquadramento que mostra a teia inteira.
 *
 * O universo foi normalizado para caber no zoom de hoje (`universe.js`), então isto é só o recuo que
 * o enquadra. Ele é constante e não some no `HOME` do AGENTE porque as duas cenas têm mundos de
 * tamanhos diferentes: entrar numa com a distância da outra põe o operador dentro de um sistema sem
 * saber que existe um universo em volta.
 */
const HOME_UNIVERSO = 150;
/** Caminho de ponteiro, em px CSS, acima do qual o `click` do browser é órbita e não clique. */
const CLICK_SLOP_PX = 6;
/**
 * Amplitude da paralaxe, em fração da distância da câmera.
 *
 * 0,015 a 88 unidades dá ~1,3 de mundo — deslocamento suficiente para o grafo se soltar do
 * fundo e pequeno demais para alguém apontar. Paralaxe que se percebe conscientemente deixou
 * de ser profundidade e virou movimento da câmera.
 */
const PARALLAX_SCALE = 0.015;
// 3 casas ≈ 0.06° de azimute. Abaixo disso é ruído de float, e ruído de float faria a guarda
// de "só se mudou" do `prefs` disparar uma escrita a cada tique, para sempre.
const ORBIT_STEP = 1e3;
/**
 * Segundos que o foco salvo espera o astro aparecer antes de ser esquecido.
 *
 * Generoso porque a topologia pode demorar a assentar, e curto o bastante para o pedido não
 * ressuscitar depois que o operador já escolheu olhar outra coisa.
 */
const FOCO_PRAZO_S = 8;
const ZERO = new THREE.Vector3();

/**
 * @param {object} [options]
 * @param {Element} [options.labelLayer]
 * @param {{update: Function}} [options.signals]  recebe, por quadro, onde na TELA estão os
 *   corpos com sinal acionável. A cena não sabe o que o consumidor faz com isso — hoje é a HUD
 *   abrindo furo para não competir com o anel, e o tipo do parâmetro é o que mantém isso
 *   verdadeiro: um objeto com `update`, não "a HUD".
 */
export function createScene(canvas, { labelLayer, signals } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // o bloom e o grão já suavizam; MSAA aqui só custaria fill rate
    powerPreference: 'high-performance',
  });
  /*
   * O `pixelRatio` é o parâmetro mais caro da cena e é QUADRÁTICO: DPR 2 desenha 4× os
   * fragmentos de DPR 1, em toda a cadeia de pós-processamento. Por isso ele é do PERFIL, e não
   * um slider entre os 22 — um controle contínuo aqui convidaria a ajustar em passos de 0.05
   * uma grandeza que só tem três respostas úteis.
   */
  let pixelCeiling = MAX_PIXEL_RATIO;
  const applyPixelRatio = () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelCeiling));
    // `setSize` de novo porque o buffer de desenho muda de tamanho junto com o ratio; sem isto
    // o composer continua no tamanho antigo e a imagem sai esticada.
    resize();
  };
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelCeiling));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
  camera.position.copy(CAMERA.start);

  const blackHole = createBlackHole();
  /* A cena UNIVERSO. Nasce oculta: o modo padrão é AGENTE, que é o céu de hoje. */
  const universe = createUniverse();
  let modo = 'agente';
  const stars = createStars();
  const graph = createGraph();
  const particles = createParticles();
  const satellites = createSatellites();
  const wormholes = createWormholes();
  const bodies = createBodies(labelLayer || document.body);
  const backdrop = createBackdrop();
  /*
   * UM planeta, reaproveitado. Nunca 460.
   *
   * Só o astro em foco ganha superfície: o campo de pontos continua sendo o céu, e a esfera
   * procedural é o que o zoom revela. Reaproveitar a instância em vez de criar uma por nó é o
   * que mantém a promessa do módulo — geometria, materiais e rampa nascem no primeiro quadro em
   * que alguém chega perto, e a rampa só é recozida quando a semente ou a paleta mudam.
   */
  const links = createLinks();
  const galaxy = createGalaxy();
  /*
   * O QUASAR É UM SEGUNDO DESENHO, e não cabia no da galáxia — era esse o obstáculo levantado.
   *
   * O quad da galáxia tem 1,35 raios de âncora; o jato precisa de 6,3. Alargar o quad existente
   * pagaria a área maior em TODOS os 213 hubs para que 7 deles usassem a borda, e o disco da
   * galáxia perderia resolução na mesma proporção. Duas malhas, cada uma do tamanho que precisa.
   */
  const quasars = createQuasars();
  /*
   * Os parâmetros de cada galáxia são ESTÁTICOS — dependem da massa dos filhos, que só muda
   * quando a topologia recarrega. Calcular por quadro seria refazer 71 partições de arquivos a
   * 60Hz para obter o mesmo resultado.
   */
  let hubs = [];
  const planet = createPlanet();

  /*
   * ─────────────────── AS PELES SEM FOCO, e o teto que impede isto de virar uma conta aberta
   *
   * O relato: *"mesmo sem foco, ao chegar perto o suficiente deveríamos poder ver suas formas
   * reais"*. Até 08/08 isso era impossível por PIXEL — o §4b do `distancia-e-forma` mediu `0 de 71`
   * corpos acima de 22 px no enquadramento de casa e concluiu que a pele só era alcançável por foco.
   *
   * ⚠️ **Aquela conclusão morreu com a câmera que a produziu.** Ela valia enquanto a câmera orbitava
   * a ORIGEM a 150 unidades, sem como se aproximar sem travar num corpo. Com a chegada por envelope,
   * medido sem foco nenhum: P50 5,52 px, máximo 91,34 px, **3 de 71 acima de 22 px e 1 acima de 90**.
   * A pele passou a ser alcançável, e o que bloqueava deixou de ser pixel e passou a ser ARQUITETURA
   * — `photosphere` e `planet` eram objetos ÚNICOS, alimentados por `ancoraDoUniverso(focusedNode)`.
   *
   * ## O desenho, e por que ele é ADITIVO
   *
   * O caminho do corpo em FOCO não foi tocado. Ele carrega a sonda, o `fitPending`, a coroa, a
   * cessão e a casca de supernova, tudo afinado no olho ao longo de várias rodadas — reescrevê-lo
   * para caber num laço genérico trocaria uma feature nova por um risco de regressão em tudo que já
   * funciona. Estas peles são as dos OUTROS corpos, e elas param onde o foco começa.
   *
   * ## O teto, e por que ele é PUBLICADO
   *
   * Cada pele é uma esfera de 96×96 com ~27 avaliações de ruído por pixel coberto. O orçamento desta
   * cena é 0,23 ms de geometria; a cena AGENTE gasta 1,95 ms com UMA pele em foco. Sem teto, chegar
   * perto de um sistema apertado ligaria dezenas. `cortadas` vai na sonda porque *um corte calado lê
   * como "cobri tudo"* — a armadilha nº 4 do handoff, o resto que não sabe se nomear.
   *
   * ⚠️ **PLANETA, FOTOSFERA e COMETA** entram no pool — 69 dos 71 corpos do fixture. Estação, pulsar
   * e nebulosa continuam só no foco, e o motivo é população: o fixture tem **ZERO** de cada uma.
   * Pool para população que não existe é código sem quem o exerça — a REGRA DO CATÁLOGO pelo avesso —
   * e a bancada não teria como provar que ele desenha.
   *
   * ⚠️ **O cometa exigiu um conserto antes de caber aqui:** a `update` dele derivava a direção das
   * caudas de `−normalize(position)`, ou seja, *para longe da ORIGEM*. Isso acerta na cena AGENTE,
   * onde a origem é o buraco negro; no UNIVERSO a origem é vazio, e toda cauda apontaria para longe
   * de nada — reafirmando o centro único que esta cena existe para negar. Agora a fonte é parâmetro,
   * e aqui ela é a **estrela do sistema do próprio cometa**, pela mesma lei que o `CORPO_VS` aplica
   * à luz: *"cada planeta é iluminado pela ESTRELA DELE"*.
   */
  /*
   * Pixels de raio que um corpo ANEXADO recebe na chegada. 1,5× o piso de pele (90) — acende a pele
   * com margem e não enche a tela, que é o que separa anexar de travar.
   */
  const CHEGADA_PX = 135;
  const PELES_VIZINHAS_MAX = 4;
  const poolPlaneta = [];
  const poolFotosfera = [];
  const poolCometa = [];
  const poolPulsar = [];
  /** `planetParams`/`photosphereParams` são PUROS e caros: derivá-los por quadro seria desperdício. */
  const paramsPorFonte = new Map();
  let pelesVizinhas = { desenhadas: 0, teto: PELES_VIZINHAS_MAX, cortadas: 0, corpos: [] };

  /**
   * A TABELA DE ROTAS do pool: uma pele, um piso, uma forma de derivar parâmetro e uma de desenhar.
   *
   * ⚠️ Ela existe porque as três peles têm assinaturas de `update` DIFERENTES — o planeta quer a
   * direção da luz em `params`, o cometa quer posição, câmera e a fonte como argumentos. Escritas
   * como `if` encadeado, a quarta pele viraria um quarto ramo e o laço deixaria de ser legível.
   * Aqui, pele nova é uma linha; e quem esquecer o `far` não compila um caso silencioso, porque a
   * rota inteira falta.
   */
  const ROTAS_DO_POOL = {
    [SURFACE.PLANET]: {
      pool: poolPlaneta, criar: createPlanet, far: PLANETA_FAR,
      params: (node) => planetParams(node),
      desenhar: (pele, base, c, elapsed) => {
        // A luz vem da ESTRELA DO SISTEMA, não da origem: iluminar de outra direção poria o
        // terminador em desacordo com o que se vê, e é o terminador que faz a esfera ler como esfera.
        estrelaDoSistema(c.source, c.position, LIGHT_DIR);
        pele.update({ ...base, light: [LIGHT_DIR.x, LIGHT_DIR.y, LIGHT_DIR.z] }, camera, c.px, elapsed);
      },
      // Esconder é `px = 0`: o próprio módulo derruba o nível de detalhe e some. Um `visible = false`
      // por fora deixaria a pele sem saber que parou — e ela reapareceria no meio da rampa.
      esconder: (pele, base, elapsed) => pele.update(base ?? {}, camera, 0, elapsed),
    },
    [SURFACE.PHOTOSPHERE]: {
      pool: poolFotosfera, criar: createPhotosphere, far: FOTOSFERA_FAR,
      params: (node) => photosphereParams(node, hash01, graph.kindColor(node.kind)),
      // A fotosfera EMITE: não tem terminador e não pede direção de luz nenhuma.
      desenhar: (pele, base, c, elapsed) => pele.update(base, camera, c.px, elapsed),
      esconder: (pele, base, elapsed) => pele.update(base ?? {}, camera, 0, elapsed),
    },
    [SURFACE.COMET]: {
      pool: poolCometa, criar: createComet, far: COMETA_FAR,
      params: (node) => cometParams(node, graph.kindColor(node.kind)),
      desenhar: (pele, base, c, elapsed) => {
        // ⚠️ `estrelaDoSistema` PRIMEIRO: é ela que preenche `FONTE_DA_CAUDA`. Sem esta linha a
        // cauda usaria a fonte do corpo anterior — um erro que só aparece com dois cometas na tela.
        estrelaDoSistema(c.source, c.position, LIGHT_DIR);
        pele.update(base, c.position, camera, c.px, elapsed, motion.isReduced(), FONTE_DA_CAUDA);
      },
      // O cometa segue o idioma do caminho de foco: as morfológicas somem por `visible`, porque a
      // coma e as caudas não têm rampa de nível própria para descer.
      esconder: (pele) => { pele.object.visible = false; },
    },
    /*
     * O PULSAR entrou no pool em 2026-08-08, quando deixou de ter população zero — o §2.7.1 do
     * `replanejamento-celeste.md` roteou o cadáver de um GIGANTE para cá. Antes disso ele estava
     * fora por um motivo que não existe mais: pool para população inexistente é código sem quem o
     * exerça, e a bancada não teria como provar que ele desenha.
     *
     * ⚠️ Ele NÃO alimenta a lente. Quem dobra a luz é o `corpoDaLente`, e ele só olha o corpo em
     * FOCO — uma lente por pulsar visível estouraria o quadro (o pós já é 89–97% dele). O oráculo
     * `lente-estelar.mjs` audita aquele caminho, não este.
     */
    [SURFACE.PULSAR]: {
      pool: poolPulsar, criar: createPulsar, far: PULSAR_FAR,
      params: (node) => pulsarParams(node, graph.kindColor(node.kind)),
      desenhar: (pele, base, c, elapsed) => pele.update(base, c.px, elapsed, motion.isReduced(), camera),
      esconder: (pele) => { pele.object.visible = false; },
    },
  };

  /**
   * A posição da ESTRELA do sistema de um corpo — a fonte de luz dele nesta cena.
   *
   * Devolve a DIREÇÃO normalizada do corpo para a estrela em `saida`, e deixa `FONTE_DA_CAUDA` com a
   * posição dela. Sem estrela (corpo órfão), cai na origem: é a degradação, não o padrão.
   */
  function estrelaDoSistema(source, posicao, saida) {
    const i = universe.sistemaDe(source);
    const sis = i === null ? null : universe.sistemas()[i];
    FONTE_DA_CAUDA.copy(sis ? sis.pos : ZERO);
    return saida.copy(FONTE_DA_CAUDA).sub(posicao).normalize();
  }
  const FONTE_DA_CAUDA = new THREE.Vector3();

  /** Um slot do pool, criado sob demanda — a mesma preguiça do `build` das peles. */
  function slotDaPele(pool, criar) {
    for (const p of pool) if (!p.usado) return p;
    const nova = { pele: criar(), usado: false, fonte: null };
    scene.add(nova.pele.object);
    pool.push(nova);
    return nova;
  }

  /**
   * O laço do A/B DENTRO DO MESMO QUADRO. Uma lei só, duas cenas.
   *
   * ## Por que ele existe
   *
   * A primeira tentativa mediu uma condição por quadro e não concluiu nada: entre duas amostras a
   * câmera acomoda, o corpo gira e a paralaxe anda, e a dispersão da PRÓPRIA condição base ficou
   * maior que a diferença entre os tratamentos (limbo 13,6 a 27,0 em seis réplicas, 2026-08-08).
   * Um controle que não distingue a si mesmo não distingue mais nada.
   *
   * Aqui as condições são desenhadas em sequência sem soltar o quadro: nada avança entre elas —
   * nem relógio, nem câmera, nem rotação. **A única coisa que difere entre duas amostras é o
   * uniform.** Medido depois de pronto: a primeira e a última amostra da mesma condição saem com
   * ZERO pixels de diferença, e é esse zero que torna a diferença atribuível.
   *
   * ⚠️ **Não usa `requestAnimationFrame`, de propósito.** Redesenhar é ordem ao driver, não quadro
   * de animação — o mesmo argumento já escrito no `sampleRenderCost`. Consequência: é a única
   * medida desta base que NÃO depende da aba estar visível.
   *
   * ⚠️ **`ler` roda com o desenho ainda no buffer** — é onde entra o `gl.readPixels`, e ela é
   * chamada SÍNCRONA. Qualquer `await` ali dentro devolve o quadro ao compositor e a amostra passa
   * a ser de outra coisa.
   *
   * `restaurar` roda no `finally` e redesenha: sair daqui com a tela num tratamento seria a
   * bancada mudando a composição pelas costas de quem mediu.
   *
   * @param {object[]} condicoes  na ordem de desenho
   * @param {(c: object) => void} aplicar
   * @param {() => void} restaurar
   * @param {(c: object, i: number) => any} [ler]  síncrona, com o desenho ainda no buffer
   */
  function mesmoQuadro(condicoes, aplicar, restaurar, ler) {
    const amostras = [];
    try {
      for (let i = 0; i < condicoes.length; i++) {
        aplicar(condicoes[i]);
        composer.render();
        amostras.push(ler ? ler(condicoes[i], i) : null);
      }
    } finally {
      restaurar();
      composer.render();
    }
    return amostras;
  }
  const photosphere = createPhotosphere();
  const remnant = createRemnant();
  const moonOrbits = createMoonOrbits();
  /*
   * As quatro peles que faltavam — cobertura de 59% para 100% dos arquivos.
   *
   * Uma instância de cada por cena, como a fotosfera e o planeta: só o astro em foco desenha
   * superfície, então quatro objetos cobrem os 167 corpos que antes chegavam ao zoom e não tinham
   * nada. Elas se distinguem por CONSTRUÇÃO e não por cor — aresta reta, cauda direcional, feixe
   * varrendo, filamento sem borda — porque a queixa que as motivou foi de FORMA repetida.
   */
  const station = createStation();
  const comet = createComet();
  const pulsar = createPulsar();
  const nebula = createNebula();
  let morphSource = null;
  let morphParams = null;
  let moonSource = null;
  let starParamsCache = null;
  let starSource = null;
  let planetSource = null;

  scene.add(
    // O fundo entra PRIMEIRO na lista e com `renderOrder` mínimo: ele é o que tudo o mais tapa.
    backdrop.object,
    stars.object, blackHole.group, universe.object, graph.group, planet.object, photosphere.object, remnant.object, moonOrbits.object,
    station.object, comet.object, pulsar.object, nebula.object,
    /*
     * SCENE ROOT, e não sob `graph.group` — o módulo é explícito sobre isso e o motivo é medido:
     * as entradas vêm de `planetAnchor`, que já multiplicou posição e raio pela escala do grupo.
     * Pendurar aqui embaixo aplicaria `graphSpread` (2,6 por padrão) uma segunda vez, pondo cada
     * galáxia 2,6× longe demais e dois degraus de LOD abaixo. É o bug dos arcos com o sinal
     * trocado, e ele já foi pago uma vez neste arquivo.
     */
    galaxy.object,
    // Mesma razão da galáxia, e o módulo repete o aviso no próprio JSDoc: as entradas vêm de
    // `planetAnchor`, já em MUNDO. Sob `graph.group` o `graphSpread` entraria duas vezes.
    quasars.object,
    particles.object,
    satellites.group, wormholes.group, bodies.group
  );

  /*
   * Arcs belong INSIDE the graph group, not beside it.
   *
   * `links.update` is fed `graph.positions()` — the raw buffer, which holds coordinates LOCAL to
   * that group. The group carries the `graphSpread` scale (0.3–3.5, default 2.6) and the stars
   * are children of it, so they render at `local × spread` while an arc parented to the scene
   * root rendered at `local`. Every endpoint landed at `1/spread ≈ 38%` of its star's distance
   * from the origin: arcs collapsed toward the cluster, worst for the bodies farthest out. The
   * shape looked right because the whole arc shrank uniformly — only its anchoring was wrong.
   *
   * Parenting is the fix rather than copying the scale onto `links.object`, and the difference
   * matters: `tune()` runs on every slider move, so a copied scale is a second source of truth
   * that must be re-synced forever, and it would break outright the day the group gains a
   * rotation or an offset. It is also free — no per-frame work. Same treatment `rings.group`
   * already gets (`graph.js`, `group.add(rings.group)`), and for the same reason.
   *
   * Scale-invariant by construction, so nothing else needs adjusting: the Bézier bulge is a
   * fraction of the chord, `aAlong` is normalized per arc, and the shader has no world-space
   * term. `renderOrder = 1` still sorts globally because the group's own renderOrder is 0.
   */
  graph.group.add(links.object);

  /*
   * O COMPOSER CARREGA PROFUNDIDADE, e antes não carregava — era essa a lacuna de arquitetura.
   *
   * O passe de lente reamostra a imagem da cena pela direção com que o fóton chegou. Só a cor não
   * basta para isso: uma cor sozinha não diz de que LADO da massa a superfície que a emitiu está.
   * Sem essa informação o passe tinha de tratar todo pixel igual, e um corpo passando NA FRENTE do
   * buraco negro seria dobrado como se a luz dele tivesse rasado a massa — o que é falso: essa luz
   * nunca chegou perto.
   *
   * A profundidade é o que responde "esta superfície está antes ou depois da massa", e é a única
   * coisa que faltava para a lente deixar de ser um efeito de tela e virar o remapeamento das
   * direções que ela deve ser.
   *
   * ⚠️ `renderTarget2` é um `clone()` do que se passa aqui, e `WebGLRenderTarget.copy` copia o
   * `depthTexture` por REFERÊNCIA — os dois alvos compartilham uma textura só. Isso seria um
   * problema num pingue-pongue longo, e não é aqui: o `RenderPass` é o único passe que desenha
   * geometria, e a lente roda IMEDIATAMENTE depois dele. A profundidade que ela lê é a da cena.
   */
  /*
   * ⚠️ A profundidade é ANEXADA depois, e não passada ao construtor — a primeira tentativa passou e
   * a cena ficou PRETA.
   *
   * `EffectComposer(renderer, alvo)` troca a semântica das dimensões dele: sem alvo ele lê
   * `renderer.getSize()` (pixels CSS) e multiplica pelo `pixelRatio` para criar o buffer; COM alvo
   * ele adota `alvo.width/height`, que já estão em pixels de framebuffer. Os dois números passam a
   * significar coisas diferentes, e o `setSize` seguinte reaplica o ratio sobre um valor que já o
   * tinha. É a mesma troca de régua que este projeto já pagou seis vezes — framebuffer × CSS.
   *
   * Anexando depois, o composer dimensiona os alvos como sempre fez e só ganha um destino a mais
   * para a profundidade.
   */
  const composer = new EffectComposer(renderer);

  /*
   * A PROFUNDIDADE DA CENA, e ela mora em UM alvo só — o `renderTarget2`.
   *
   * ⚠️ Duas tentativas anteriores apagaram a cena, e as duas pelo MESMO motivo, que só apareceu
   * lendo o `EffectComposer` e o `RenderPass` vendorizados em vez de deduzir:
   *
   * | quem | `needsSwap` | lê de | escreve em |
   * |---|---|---|---|
   * | `RenderPass` | **false** | — | `readBuffer` = **renderTarget2** |
   * | `ShaderPass` (a lente) | true | `readBuffer` = rt2 | `writeBuffer` = **renderTarget1** |
   *
   * Nas duas tentativas eu anexei a MESMA `DepthTexture` aos dois alvos (na primeira sem querer:
   * `renderTarget2 = renderTarget1.clone()` e o `copy` leva `depthTexture` por REFERÊNCIA). Com
   * isso a lente amostrava uma textura que estava, ao mesmo tempo, anexada como profundidade do
   * alvo em que ela própria escrevia — **feedback loop**. WebGL trata como indefinido, e o que
   * chegou à tela foi preto. Não era o construtor nem o momento do anexo; era o alvo errado.
   *
   * Anexando só ao `renderTarget2`, a cena grava profundidade lá, a lente lê de lá e escreve no
   * `renderTarget1`. Nenhuma textura é entrada e saída ao mesmo tempo.
   *
   * ⚠️ **ISTO DEPENDE DA PARIDADE DE SWAPS.** A cadeia tem dois passes que trocam (a lente e o
   * `OutputPass`), então o par volta ao estado inicial a cada quadro e o `RenderPass` cai SEMPRE no
   * `renderTarget2`. Acrescentar ou remover um passe que troca inverte isso, a profundidade passa a
   * ser gravada no rt1 e a lente lê um buffer vazio — **em silêncio**, sem erro nenhum. Se a lente
   * um dia parar de distinguir frente de trás, é aqui que se olha primeiro.
   */
  const profundidadeDaCena = new THREE.DepthTexture(
    composer.renderTarget2.width,
    composer.renderTarget2.height
  );
  composer.renderTarget2.depthTexture = profundidadeDaCena;

  const lensing = createLensingPass();
  lensing.setDepth(profundidadeDaCena, CAMERA.near, CAMERA.far);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.58, 0.32, 0.72);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(lensing.pass);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /*
   * Órbita restaurada da sessão anterior — corrente E alvo no mesmo valor.
   *
   * Só o alvo faria a câmera VOAR da posição inicial até a salva no primeiro segundo, o que lê
   * como a cena se ajeitando sozinha. Os limites são os mesmos do `wheel` e do `pointermove`
   * porque storage é entrada não confiável: um valor fora de faixa vindo de uma versão antiga
   * (ou editado à mão) põe a câmera dentro do disco ou a 10 mil unidades daqui.
   */
  const startOrbit = {
    azimuth: readOrbit('camera.azimuth', -Infinity, Infinity),
    polar: readOrbit('camera.polar', 0.22, 2.9),
    distance: readOrbit('camera.distance', 12, 260),
  };
  const orbit = {
    azimuth: startOrbit.azimuth, polar: startOrbit.polar, distance: startOrbit.distance,
    targetAzimuth: startOrbit.azimuth,
    targetPolar: startOrbit.polar,
    targetDistance: startOrbit.distance,
  };
  /*
   * Só o que o OPERADOR moveu é digno de gravar.
   *
   * A deriva automática muda o azimute continuamente; gravá-la escreveria no localStorage a
   * cada tique da sessão inteira e ainda restauraria uma posição que ninguém escolheu. A marca
   * é levantada nos gestos reais (arrasto, roda) e no foco de um app.
   */
  let orbitMoved = false;
  /** O foco só se restaura UMA vez: recarga de topologia não deve arrastar a câmera de volta. */
  let focoRestaurado = false;
  /** O astro salvo esperando posição resolver. Ver `aplicarFocoPendente`. */
  let focoPendente = null;
  /*
   * O enquadramento "em casa" — para onde `focusBody(null)` volta.
   *
   * Era a constante 54/1.33 escrita dentro do `focusBody`, e isso ANULAVA a restauração: o
   * `router.start` chama `focusBody` no boot, então a órbita recém-lida do storage era
   * sobrescrita pelo default antes do primeiro quadro — e o salvamento periódico gravava o
   * default por cima do que o operador tinha deixado. Medido: a câmera voltava para 54 em toda
   * sessão. Sair de um app tem que devolver ao enquadramento DO OPERADOR, não ao de fábrica.
   */
  const HOME = { polar: startOrbit.polar, distance: startOrbit.distance };
  const pointer = new THREE.Vector2(-2, -2);
  const raycaster = new THREE.Raycaster();
  const clock = new THREE.Clock();
  /*
   * O RELÓGIO DOS OBJETOS, separado do relógio da parede.
   *
   * `clock.elapsedTime` anda sempre; este acumula `delta × timeScale`. Precisa ser acumulado e não
   * derivado (`elapsedTime × escala`) porque a escala muda no meio: multiplicar o total daria um
   * SALTO no instante em que o operador move o slider — todo shader que lê `elapsed` como fase
   * pularia de posição, e a cena inteira daria um tranco a cada passo de 0,05.
   */
  let sceneTime = 0;
  const focusTarget = new THREE.Vector3();

  let dragging = false;
  /*
   * Quantos pixels o ponteiro andou desde o `pointerdown` — a guarda do clique.
   *
   * `orbitMoved` não serve para isto: o `pointerdown` já o liga em `true` incondicionalmente,
   * porque ele responde outra pergunta ("há órbita a gravar?"). Este conta CAMINHO, e é o único
   * jeito de separar "cliquei" de "orbitei" — o browser dispara `click` depois de qualquer
   * down+up no mesmo elemento, tenha o ponteiro andado 2 px ou 800.
   */
  let pressTravel = 0;
  let userControlled = false;
  let cinematic = false;
  let glitch = 0;
  let hovered = null;
  let focusWeight = 0;
  let lastPick = 0;
  let hoveredBody = null;
  let focusedBody = null;
  /*
   * Astro do céu em foco — o `source` do nó, não um índice.
   *
   * Índice é posição num buffer que se refaz a cada `load`; `source` é a identidade do arquivo.
   * Guardar o índice faria a câmera passar a seguir OUTRO astro depois de uma recarga da
   * topologia, sem nada acusar.
   */
  let focusedNode = null;
  /** Radius and projection constant of the focused body, refreshed by the frame loop. */
  let focusGeometry = null;
  /** A focus flight is waiting for the first resolved anchor to correct its distance. */
  let fitPending = false;
  /** A guarda do núcleo mordeu neste quadro? Sonda: ela deforma o enquadramento em silêncio. */
  let guardBit = false;
  /** Última superfície decidida — o traço do solver só sai quando ela muda. */
  let ultimaSuperficie = null;
  /** Parâmetros do planeta em foco. Recalculados só na TROCA de astro — são puros e congelados. */
  let planetParamsCache = null;
  const LIGHT_DIR = new THREE.Vector3();
  const ORBIT_OFFSET = new THREE.Vector3();
  const RADIAL = new THREE.Vector3();
  /*
   * Estado da paralaxe. `AIM` persegue o ponteiro com suavizacao por TEMPO — ponteiro cru
   * transportaria o ruido do mouse direto para a imagem, que e a mesma razao pela qual o
   * arraste da camera ja move o ALVO e nao a camera.
   */
  const PARALLAX_AIM = new THREE.Vector2();
  const PARALLAX_FWD = new THREE.Vector3();
  const PARALLAX_RIGHT = new THREE.Vector3();
  const PARALLAX_UP = new THREE.Vector3();
  const PARALLAX_SHIFT = new THREE.Vector3();
  let probe = null;
  let lastFocusRequest = null;
  // Alvo de órbita quando dentro de um app: a câmera passa a orbitar O CORPO, com o núcleo
  // ao fundo. `anchor` interpola entre a origem (sistema) e a posição do corpo.
  const anchor = new THREE.Vector3();
  const anchorTarget = new THREE.Vector3();

  /*
   * O SISTEMA CORRENTE — o que a câmera do UNIVERSO orbita quando nada está em foco.
   *
   * ## Por que ele existe
   *
   * `anchorTarget.copy(bodyAt || ZERO)` punha a câmera a orbitar a ORIGEM. Na cena AGENTE isso é
   * certo — a origem é o buraco negro, um objeto que está lá. Na UNIVERSO **não há nada ali**, e
   * orbitar o vazio afirma um centro que esta cena existe para negar. Escrito pelo usuário em
   * 08/08: *"não existe centro no universo real"*.
   *
   * ⚠️ **E o defeito não era a âncora, era a falta de deslocamento.** Medido no mesmo dia: o
   * arraste move só `azimuth`/`polar`, a roda move só `distance`, e a posição é derivada inteira
   * (`anchor + direção × distância`). A câmera não sabe transladar — o único jeito de a âncora
   * mudar era travar num corpo. Trocar `ZERO` por um sistema sem dar como TROCAR de sistema teria
   * mudado qual vazio se orbita, e nada mais.
   *
   * Por isso a adoção viaja junto com o foco: travar num corpo adota o sistema DELE, e soltar o
   * foco deixa a câmera lá — que é o "sair de um é adotar outro" sem inventar gesto novo.
   */
  let sistemaCorrente = null;
  const ANCORA_LARGA = new THREE.Vector3();

  /*
   * VOO LIVRE — o padrão desta cena desde 08/08, por decisão do usuário.
   *
   * `ancoraLivre` é onde a câmera olha quando nada está em foco e nada está anexado. Ela não é um
   * lugar privilegiado: começa no centroide só para o primeiro quadro ter um alvo, e a partir daí
   * quem a move é o operador (arraste com SHIFT ou botão do meio) ou uma chegada a sistema.
   *
   * ⚠️ **Ela é o que faltava para "não existe centro".** Trocar a origem por um sistema mudava qual
   * ponto se orbita; só a translação livre remove a pergunta "orbitando o quê". Medido antes: o
   * arraste movia só ângulo e a roda só raio — a câmera não sabia transladar, e por isso a âncora
   * era destino, não posição.
   *
   * `objetoAnexado` é o degrau intermediário pedido junto: um corpo que a câmera adota como alvo
   * padrão, viajando com ele. Hoje é um corpo qualquer do céu, como prova de conceito; o destino é
   * uma sonda 3D representando o operador, e aí ela passa a ser quem "detém o centroide".
   */
  const ancoraLivre = new THREE.Vector3();
  let ancoraLivreIniciada = false;
  let objetoAnexado = null;
  /** Quem a âncora persegue neste quadro — lido pela sonda, escrito pelo laço. */
  let seguindoId = null;
  const PAN_FWD = new THREE.Vector3();
  const PAN_RIGHT = new THREE.Vector3();
  const PAN_UP = new THREE.Vector3();

  /**
   * Translada a âncora livre no plano da tela. É o gesto que faltava para a câmera ir a algum lugar.
   *
   * ⚠️ A escala sai da DISTÂNCIA e do fov, não de uma constante: um pixel de arraste tem de valer o
   * mesmo tanto de tela perto e longe, senão o gesto vira teleporte num extremo e melado no outro.
   */
  function transladarLivre(dxPx, dyPx) {
    const alturaCss = Math.max(canvas.clientHeight, 1);
    const k = (2 * Math.tan((camera.fov * Math.PI) / 360) * orbit.distance) / alturaCss;
    camera.getWorldDirection(PAN_FWD);
    PAN_RIGHT.crossVectors(PAN_FWD, camera.up).normalize();
    PAN_UP.crossVectors(PAN_RIGHT, PAN_FWD).normalize();
    ancoraLivre.addScaledVector(PAN_RIGHT, -dxPx * k).addScaledVector(PAN_UP, dyPx * k);
  }

  /**
   * Adota um sistema como âncora, e opcionalmente CHEGA nele.
   *
   * ⚠️ A distância de chegada sai do ENVELOPE do sistema, não de uma constante. `HOME_UNIVERSO` são
   * 150 unidades derivadas do universo inteiro; um envelope mede ~14 no fixture. Chegar a 150 de um
   * sistema de 14 é continuar olhando o aglomerado de fora — que é exatamente o relato que abriu
   * esta linha de trabalho. O fator 2,6 põe o envelope inteiro no quadro com folga.
   *
   * @param {number|null} i  índice do sistema, ou `null` para soltar
   * @param {boolean} chegar `true` = reenquadra a distância pelo envelope
   */
  function adotarSistema(i, chegar = false) {
    if (i === null || i === undefined) { sistemaCorrente = null; return; }
    sistemaCorrente = i;
    const s = universe.sistemas()[i];
    if (!s) return;
    // A viagem é a âncora LIVRE indo até lá — não um degrau à parte. Um só lugar decide onde a
    // câmera está, e "cheguei num sistema" vira um caso de voo livre em vez de um modo novo.
    ancoraLivre.copy(s.pos);
    ancoraLivreIniciada = true;
    if (!chegar) return;
    orbit.targetDistance = clampDistance(Math.max(s.envelope * 2.6, ZOOM_RANGE.min));
  }
  /**
   * Onde o corpo em foco estava no quadro ANTERIOR, e de quem era.
   *
   * É o que permite separar o deslocamento do CORPO (que a âncora acompanha sem atraso) do voo até
   * ele (que continua amortecido). `alvoAnteriorDe` guarda o `source` porque, na troca de foco, a
   * diferença entre dois corpos não é deslocamento nenhum — é justamente o voo.
   */
  let alvoAnterior = null;
  let alvoAnteriorDe = null;
  const ANCHOR_DELTA = new THREE.Vector3();
  /*
   * `hidden` marca a janela de amostragem que NÃO é medida.
   *
   * Aba em segundo plano congela o `requestAnimationFrame`: a janela fecha com zero quadro e a
   * conta devolve 0 FPS — que não é "máquina lenta", é "ninguém desenhou". Foi exatamente o que
   * aconteceu numa sessão de automação: a cena abriu em aba oculta e o boot anunciou "0 FPS
   * MEDIDOS · PERFIL MÍNIMO RECOMENDADO" sobre uma máquina que roda a cena inteira em 0,45 ms.
   */
  const frames = { count: 0, long: 0, since: performance.now(), hidden: document.hidden };
  // Espelho local do store: o loop lê daqui em vez de chamar getters por quadro.
  let tune = tuning.values();

  /**
   * Uma assinatura só distribui a afinação para todos os módulos.
   *
   * Nenhum deles conhece o painel: cada um expõe `tune(values)` e recebe o objeto inteiro.
   * Parâmetro novo no SPEC vira uma linha no módulo que o consome — e nada mais.
   */
  /**
   * A afinação depois de obedecer `prefers-reduced-motion`.
   *
   * O ajuste é aqui, no ÚNICO ponto por onde os valores passam para todos os módulos — não em
   * cada shader. `grain` e `breath` vão a zero porque são movimento sem evento por trás; a
   * deriva do céu e a velocidade orbital são AMORTECIDAS e não zeradas, porque órbita parada
   * afirmaria que o sistema morreu, e o pedido é reduzir movimento, não remover estado.
   *
   * ⚠️ Isto faz o painel de afinação exibir um valor que não está em vigor. O painel diz isso na
   * própria tela (`controls.js`); um slider que não controla nada, em silêncio, é pior que um
   * slider ausente.
   */
  const QUIET_FACTOR = 0.25;
  function respectMotion(values) {
    if (!motion.isReduced()) return values;
    return {
      ...values,
      grain: 0,
      breath: 0,
      cameraDrift: 0,
      starDrift: values.starDrift * QUIET_FACTOR,
      graphSpeed: values.graphSpeed * QUIET_FACTOR,
      diskSpin: values.diskSpin * QUIET_FACTOR,
    };
  }

  function fanOut(raw) {
    const values = respectMotion(raw);
    tune = values;
    blackHole.tune(values);
    stars.tune(values);
    graph.tune(values);
    moonOrbits.tune(values);
    lensing.tune(values);
    bloom.strength = values.bloomStrength;
    bloom.threshold = values.bloomThreshold;
    bloom.radius = values.bloomRadius;
    if (camera.fov !== values.fov) {
      camera.fov = values.fov;
      camera.updateProjectionMatrix();
    }
  }

  tuning.subscribe(fanOut);
  // A preferência muda em runtime: religar "reduzir movimento" no sistema tem que apagar o grão
  // sem reload, então a mudança reaplica a afinação inteira pelo mesmo caminho.
  motion.subscribe(() => fanOut(tuning.values()));

  // ---------------------------------------------------------------- eventos → imagem

  on('ui.state-changed', ({ state }) => {
    blackHole.setRegime(state);
    stars.setUnstable(state === 'error');
  });

  on('memory', ({ hits }) => {
    // Acender a estrela e derrubá-la no núcleo é a mesma informação em dois canais: onde o
    // conhecimento está no céu, e que ele foi absorvido agora.
    const lit = graph.ignite((hits || []).map((hit) => hit.source), 1.2);
    for (const { node, position } of lit) {
      particles.infall(position, graph.kindColor(node.kind), 16);
    }
    blackHole.surge(Math.min(lit.length * 0.25, 1.2));
    if (lit.length) focusOn(lit.map((entry) => entry.position));
  });

  /*
   * A CARGA COGNITIVA CHEGA NA IMAGEM — item #17 do brief: "consumo de contexto: o disco ganha
   * brilho e engrossa ligeiramente".
   *
   * O evento existia inteiro desde `brain.py` e morria no medidor do HUD: o buraco negro
   * representava o estado do agente sem nunca saber QUANTO ele estava carregando. Uma linha, e o
   * mesmo número que está escrito em texto passa a estar escrito na forma do disco.
   */
  on('cogload', (event) => blackHole.setLoad(event.tokens || 0));

  on('token', () => particles.outflow(outflowTarget(), 0xffe6bd, 2));
  on('thought', () => particles.outflow(outflowTarget(0.5, 0.86), 0x6f8bb0, 1));

  on('tool', (event) => {
    if (event.phase === 'call') {
      wormholes.open(event.id || event.tool, event.kind);
      blackHole.surge(0.3);
    } else if (event.phase === 'result') {
      wormholes.close(event.id || event.tool);
      if (event.ok === false) glitch = Math.max(glitch, 0.5);
    }
  });

  on('web', (event) => {
    const position = satellites.activate(event.provider);
    if (!position) return;
    if (event.phase === 'start') {
      // Consulta subindo: do núcleo para o satélite.
      particles.outflow(position, 0xff9b4a, 8);
    } else if (event.phase === 'result') {
      // Resultado voltando como meteoro: do satélite para o núcleo.
      particles.infall(position, 0xffb066, 10 + (event.results?.length || 0) * 3);
    }
  });

  on('error', () => {
    glitch = 1;
    particles.burst(new THREE.Vector3(0, 0, 0), 0xff5b45, 40, 9);
  });

  on('answer', () => blackHole.surge(1.4));

  /*
   * Selecionar um astro é olhar para ele.
   *
   * A câmera reage ao EVENTO, não ao clique no canvas. São a mesma coisa hoje (só o clique
   * emite `ui.select`), e serão diferentes amanhã: um resultado de busca que aponta uma estrela
   * deve centralizá-la pelo mesmo caminho, e não por uma segunda cópia desta linha dentro do
   * módulo de busca. A cena responde a "isto foi selecionado", venha de onde vier.
   */
  /*
   * `id`, não só `source`: hub (repo, diretório) NÃO tem `source` — o campo só existe em
   * arquivo. Lendo apenas `source`, clicar ou passar o cursor num hub resolvia para `null` e o
   * gesto morria em silêncio: nenhum arco, nenhuma câmera, nenhum erro. O grafo é indexado por
   * `id` dos dois lados (`index.get`), e em arquivo `id === source`, então o `??` não muda nada
   * para eles.
   */
  const alvoDe = (node) => node?.source ?? node?.id ?? null;
  on('ui.select', ({ node }) => focusNode(alvoDe(node)));
  /*
   * Focar SEM abrir inspetor. `ui.select` faz as duas coisas porque nasceu do clique no céu, mas
   * quem já vai abrir o leitor central (árvore, busca) precisa só da câmera — e emitir
   * `ui.select` ali abriria um segundo painel com o mesmo arquivo.
   */
  on('ui.focus-node', ({ source }) => focusNode(source ?? null));

  /*
   * Filtro de tipo do histograma "forma do corpus". `kinds` nulo devolve o céu inteiro.
   *
   * Solta o foco quando o corpo travado é o que acabou de ser escondido: a câmera continuaria
   * orbitando um ponto invisível, e nada na tela explicaria por que ela parou de responder.
   */
  on('ui.filter-kinds', ({ kinds }) => {
    graph.setKindFilter(kinds ?? null);
    const alvo = focusedNode ? graph.nodeAt(focusedNode) : null;
    if (alvo && kinds && !kinds.includes(alvo.kind || 'other')) focusNode(null);
  });

  /*
   * O vínculo responde ao GESTO, e o cursor vence o foco enquanto existe.
   *
   * São duas perguntas diferentes com a mesma resposta visual: "o que é aquilo ali?" (cursor,
   * passageiro) e "o que se liga ao que estou estudando?" (foco, durável). Se o foco vencesse,
   * passar o cursor por outro astro não responderia nada — e o hover é o gesto mais barato que
   * a interface tem.
   */
  let hoveredNode = null;

  /*
   * ─────────────────── A REDE DA CENA UNIVERSO — só na seleção, e por outro caminho
   *
   * Duas diferenças em relação ao arco da cena AGENTE, e as duas são a spec, não preferência:
   *
   * 1. **Só a SELEÇÃO acende.** Lá o cursor vence o foco, porque o vínculo é de contenção e
   *    responder ao gesto mais barato é um ganho. Aqui a regra é o §5 do `integracao-neo4j.md`:
   *    *"a teia só existe na seleção"*, e o corpo selecionado **vira o centro temporário daquela
   *    topologia**. Rede acendendo no hover seria a teia de volta, agora perseguindo o cursor.
   * 2. **O dado não vem do `/api/graph`.** São 3 705 vínculos, 3,4× a topologia inteira — eles têm
   *    rota própria (`/api/vizinhanca`), lida sob demanda. Continua sendo a lei nº 2: o que se lê é
   *    um SNAPSHOT em disco, e o Neo4j nunca está no caminho do quadro.
   *
   * ⚠️ O `pedido` é um carimbo contra resposta fora de ordem. Selecionar A e B em sequência dispara
   * duas buscas, e a de A pode voltar depois — sem o carimbo, a rede de A se desenharia em volta de
   * B, que é o pior tipo de erro aqui: plausível.
   */
  let pedido = 0;
  const paintUniverseLinks = async () => {
    const alvo = focusedNode;
    const meu = ++pedido;
    if (!alvo) {
      universe.selecionar(null, null);
      ui('links', { subject: null, dirty: null, origin: 'focus', nodes: [], rede: null });
      return;
    }
    let resposta = null;
    try {
      resposta = await fetch(`/api/vizinhanca?source=${encodeURIComponent(alvo)}`).then((r) => r.json());
    } catch {
      // Rede indisponível é `null`, nunca lista vazia: "não perguntei" e "perguntei e não há
      // vizinho" são fatos diferentes, e só o segundo pode ser desenhado como ausência.
      resposta = null;
    }
    if (meu !== pedido) return;
    const vizinhanca = resposta?.disponivel ? resposta.vizinhanca : null;
    const desenho = universe.selecionar(alvo, vizinhanca);
    ui('links', {
      subject: graph.nodeAt(alvo),
      dirty: graph.dirtyOf(alvo),
      origin: 'focus',
      // A legenda sai da MESMA lista que virou linha, e na mesma ordem — a regra do arco da outra
      // cena vale inteira aqui. O nó vem do céu; o tipo e a força vêm do vínculo.
      nodes: (vizinhanca?.v || [])
        .slice(0, desenho?.desenhados ?? 0)
        .map((v) => ({ ...(graph.nodeAt(v.para) || { source: v.para, type: 'file' }), vinculo: v })),
      rede: desenho
        ? { ...desenho, teto: resposta?.teto, tipos: resposta?.tipos, as_of: resposta?.as_of }
        : { indisponivel: resposta?.motivo || 'rede não materializada' },
      // Os ASSUNTOS vêm na MESMA resposta e no mesmo evento: eles respondem a mesma pergunta que a
      // rede — com o que este corpo se relaciona —, por um caminho que liga corpo a CONCEITO em vez
      // de corpo a corpo. Dois eventos fariam o painel montar em duas etapas e piscar.
      conceitos: resposta?.conceitos ?? null,
    });
  };

  const paintLinks = () => {
    if (modo === 'universo') {
      paintUniverseLinks();
      return;
    }
    const alvo = hoveredNode || focusedNode;
    const desenhados = links.show(
      alvo ? graph.linksOf(alvo) : null,
      alvo === focusedNode ? 0xffb35c : 0x7ee0c0
    );
    /*
     * A LEGENDA sai da mesma chamada que desenha.
     *
     * O arco responde "existe relação" e não responde "com quem" — a essa distância os dois
     * extremos são pixels iguais. Quem nomeia é um widget, e ele não conhece o grafo; então o
     * evento leva o nó pronto, já CORTADO no número de arcos que o desenho aceitou.
     *
     * Deixar o widget recalcular a partir do `/api/graph` daria uma segunda lista, e no dia em
     * que o teto de `MAX_LINKS` mordesse ela nomearia um vínculo que não está na tela — sem erro
     * nenhum, só divergência. É a mesma regra das métricas deste projeto: o que se lê sai do
     * mesmo lugar que o que se vê.
     */
    ui('links', {
      subject: alvo ? graph.nodeAt(alvo) : null,
      dirty: alvo ? graph.dirtyOf(alvo) : null,
      // Qual gesto trouxe este sujeito. O cursor vence o foco enquanto existe (ver acima), e a
      // legenda tem de dizer qual dos dois está falando: um é passageiro, o outro é a escolha.
      origin: hoveredNode ? 'hover' : 'focus',
      nodes: alvo ? graph.neighborsOf(alvo).slice(0, desenhados) : [],
    });
  };
  on('ui.hover', ({ node }) => {
    hoveredNode = alvoDe(node);
    /*
     * ⚠️ **No UNIVERSO o cursor NÃO repinta a rede, e isso não é economia.** Lá o arco é a
     * topologia do corpo ESCOLHIDO; deixar o hover trocar o sujeito faria a legenda nomear os
     * vínculos de um corpo enquanto a tela desenha os de outro — as duas afirmações discordando
     * sobre de quem estão falando, que é pior do que não ter painel.
     */
    if (modo === 'universo') return;
    paintLinks();
  });
  on('ui.node-focus', () => paintLinks());

  on('ui.cinematic', ({ on: enabled }) => {
    cinematic = enabled;
    // Offset sobre o valor afinado, não constante fixa: entrar e sair do modo cinema não
    // pode descartar o que o operador ajustou no painel.
    lensing.setCinematic(enabled, tune);
    bloom.strength = tune.bloomStrength * (enabled ? 1.45 : 1);
  });

  // ---------------------------------------------------------------- interação

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    pressTravel = 0;
    userControlled = true;
    orbitMoved = true;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointerup', (event) => {
    dragging = false;
    canvas.releasePointerCapture?.(event.pointerId);
  });

  /*
   * O ponteiro está sobre um painel da HUD, e não sobre o céu?
   *
   * O picking usa a ÚLTIMA coordenada que o canvas recebeu, e o canvas para de receber
   * `pointermove` no instante em que o cursor entra num painel interativo. O efeito medido: o
   * cursor está lendo o conteúdo de um arquivo e o rótulo de hover do céu continua acendendo,
   * porque um nó em órbita passa por baixo daquela coordenada congelada. O tooltip "atravessava"
   * o painel.
   *
   * A regra é do SISTEMA, não de cada painel — a mesma disciplina do `keys.js`, onde atalho
   * global não dispara enquanto há foco em texto. Aqui: não há hover no céu enquanto o ponteiro
   * está sobre a HUD. Escuta em `window` com `capture`, porque o evento pode ser consumido antes
   * de borbulhar.
   */
  let pointerOffSky = false;
  window.addEventListener(
    'pointermove',
    (event) => {
      const off = event.target !== canvas;
      if (off === pointerOffSky) return;
      pointerOffSky = off;
      // Sair do céu apaga o hover na hora. Esperar o próximo quadro de picking deixaria o
      // rótulo aceso sobre o painel pelo tempo do intervalo.
      if (off && (hovered || hoveredBody)) {
        hovered = null;
        hoveredBody = null;
        canvas.style.cursor = '';
        ui('hover', { node: null, dirty: null });
      }
    },
    true
  );

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    if (!dragging) return;
    pressTravel += Math.hypot(event.movementX, event.movementY);
    /*
     * TRANSLADAR × GIRAR — e o UNIVERSO é a única cena que translada.
     *
     * SHIFT ou botão do meio movem a âncora livre; o arraste simples continua girando, que é o
     * gesto que já estava no dedo de quem usa. Na cena AGENTE não há para onde transladar: a
     * âncora de lá é o núcleo, um objeto real, e pan sobre ele seria sair de órbita do que se veio
     * ver. `buttons & 4` é o do meio — `event.button` não vale em `pointermove`, ele só é o botão
     * que INICIOU o gesto.
     */
    if (modo === 'universo' && !focusedNode && (event.shiftKey || (event.buttons & 4))) {
      userControlled = true;
      orbitMoved = true;
      transladarLivre(event.movementX, event.movementY);
      return;
    }
    // O mouse move o ALVO, não a câmera. Delta de ponteiro é ruidoso e não vem alinhado com
    // o quadro; aplicá-lo direto na câmera transporta esse ruído para a imagem.
    orbitMoved = true;
    orbit.targetAzimuth -= event.movementX * 0.0042;
    orbit.targetPolar = THREE.MathUtils.clamp(
      orbit.targetPolar - event.movementY * 0.0034, 0.22, 2.9
    );
  });

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      userControlled = true;
      orbitMoved = true;
      orbit.targetDistance = clampDistance(orbit.targetDistance * (1 + Math.sign(event.deltaY) * 0.08));
    },
    { passive: false }
  );

  /*
   * ORBITAR NÃO É CLICAR — e sem esta guarda era, o que quebrava a REGRA DA INSPEÇÃO.
   *
   * Medido em 2026-08-07 com `README.md` travado: um arraste horizontal de 350 px emitia
   * `ui.select` com o source do PRÓPRIO astro travado 56 ms depois de soltar, e `focusNode`
   * reescrevia `targetPolar`/`targetDistance` e religava `fitPending`. `px` ia de 213 para 260
   * — `FOCUS_FIT_PX` cravado, que é a assinatura de quem foi remandado para a pose canônica.
   * Na tela isso lê como "a câmera reseta sozinha depois de 3 ou 4 segundos"; os segundos são o
   * amortecimento de `cameraEase`, não um temporizador. Soltando sobre um nó VIZINHO, o mesmo
   * caminho re-focava o vizinho.
   *
   * 6 px de folga: `targetAzimuth` anda 0,0042 rad/px, então o que a guarda pode engolir são
   * 0,025 rad — 1,4°, abaixo do que o olho separa. Acima do tremor de mão de um clique
   * deliberado e três ordens de grandeza abaixo de um gesto de órbita.
   */
  canvas.addEventListener('click', () => {
    if (pressTravel > CLICK_SLOP_PX) return;
    if (hoveredBody) {
      // Corpo de app navega; corpo de controle alterna. A cena não sabe o que cada um faz —
      // ela emite a intenção e quem registrou o controle decide.
      ui(hoveredBody.type === 'control' ? 'toggle-control' : 'open-app', { id: hoveredBody.id });
      return;
    }
    if (!hovered) return;
    // Onda no espaço-tempo no ponto clicado, e o resto do sistema decide o que fazer.
    particles.burst(hovered.position, graph.kindColor(hovered.node.kind), 26, 4);
    ui('select', { node: hovered.node });
  });

  // ---------------------------------------------------------------- loop

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    /*
     * ⚠️ A textura de profundidade é redimensionada AQUI, na mão, e isso foi conferido na fonte.
     *
     * `WebGLRenderTarget.setSize` percorre `this.textures` — que são as de COR. A de profundidade é
     * anexada por fora e não está nessa lista, então ela mantém as dimensões de boot. O `setSize`
     * chama `dispose()`, e o renderer solta os recursos de GL da profundidade junto; na próxima
     * subida ele os recria a partir de `image.width/height`, que é justamente o que fica velho.
     *
     * Sem estas três linhas a lente leria a profundidade num quadriculado deslocado depois de
     * qualquer mudança de tamanho de janela — defeito que só aparece ao redimensionar, que é a
     * pior classe para reproduzir.
     */
    profundidadeDaCena.image.width = composer.renderTarget2.width;
    profundidadeDaCena.image.height = composer.renderTarget2.height;
    profundidadeDaCena.needsUpdate = true;
    bloom.resolution.set(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function outflowTarget(x = 0.78, y = 0.55) {
    // Ponto no mundo que corresponde a uma posição na tela: é assim que a corrente de
    // partículas termina exatamente onde o painel de texto começa.
    return new THREE.Vector3(x * 2 - 1, y * 2 - 1, 0.55).unproject(camera);
  }

  /**
   * Ancora a câmera num corpo de app, ou devolve ao núcleo com `null`.
   *
   * Não move a câmera direto: move o ALVO. O loop persegue com suavização por tempo, então a
   * chegada tem a mesma física do resto da cena e um segundo `focusBody` no meio do voo
   * redireciona em vez de teleportar.
   */
  function focusBody(id) {
    focusedBody = id;
    /*
     * ⚠️ ASTRO TRAVADO MANDA MAIS QUE A ROTA — e não mandava.
     *
     * `router.js` chama isto em TODA troca de rota, e daqui saía uma reescrita de distância e
     * polar sem perguntar a ninguém. Com um astro travado, o operador via a câmera saltar para o
     * enquadramento de app (distância 30) no meio de um gesto — inclusive por rota que ele não
     * pediu, como a que o aviso de trabalho local abre sozinho. O sintoma que chega ao usuário é
     * "não consigo dar zoom nem girar em volta do astro": os dois caminhos funcionavam, e o
     * último a escrever ganhava.
     *
     * O foco em astro é o pedido mais ESPECÍFICO e é sempre explícito (clique ou tecla). A rota
     * muda por muitos motivos que não são pedido de câmera. Quem soltar o astro recupera o
     * enquadramento de app na próxima navegação.
     */
    if (focusedNode) return;
    userControlled = false;
    // 15 punha a câmera DENTRO do disco (raio externo 39): o disco enchia o quadro e lavava
    // a coluna de texto. 30 mantém o núcleo presente e grande, com o corpo do app ancorando
    // o enquadramento, e devolve contraste para a HUD.
    orbit.targetDistance = id ? 30 : HOME.distance;
    orbit.targetPolar = id ? 1.06 : HOME.polar;
    // Movimento reduzido: corte, não voo. O alvo já está no destino e a câmera é posta lá no
    // mesmo quadro — a chegada continua acontecendo, só sem os 900ms de deslocamento.
    if (motion.isReduced()) {
      orbit.distance = orbit.targetDistance;
      orbit.polar = orbit.targetPolar;
      orbit.azimuth = orbit.targetAzimuth;
    }
  }

  /**
   * Trava a câmera num astro do céu — ela passa a orbitá-LO, com ele no centro.
   *
   * `null` solta e devolve o enquadramento de casa. Como no `focusBody`, o que se move é o
   * ALVO: o loop persegue com suavização por tempo, então um segundo clique no meio do voo
   * redireciona em vez de teleportar, e a chegada tem a mesma física do resto da cena.
   */
  function focusNode(source) {
    focusedNode = source;
    // Registra NO MOMENTO DO PEDIDO se o céu conhece este astro. Depois é tarde: o quadro solta
    // o foco de quem não tem posição, e aí "focado: null" já não diz se o pedido era inválido.
    lastFocusRequest = { source, conhecido: source ? Boolean(graph.nodeAt(source)) : null };
    // O operador escolheu para onde olhar: a deriva automática pararia de fazer sentido
    // arrastando o quadro para longe do que ele acabou de pedir.
    userControlled = Boolean(source);
    /*
     * `NODE_FOCUS_DISTANCE` is the FIRST GUESS, not the destination.
     *
     * The real distance depends on the body's radius, which is only known once the anchor resolves
     * in the frame loop — and asking the graph for it here would mean a second projection formula
     * living outside `planetAnchor`, free to drift from the one that actually sizes the body. So
     * the flight starts toward the old constant and the next resolved frame corrects it to the
     * distance that yields `FOCUS_FIT_PX`. The correction lands inside the camera's own easing,
     * so it reads as one flight, not as two.
     */
    /*
     * ⚠️ **No UNIVERSO a distância NÃO sai daqui**, e não porque a seleção não deva aproximar — ela
     * deve, e a primeira versão desta linha errou nisso. É que `NODE_FOCUS_DISTANCE` são 7 unidades
     * derivadas do céu AGENTE, e os corpos desta cena medem de 0,1 a 1,6: voar para 7 é parar a dez
     * vezes o tamanho do que se pediu para ver. Quem resolve é o enquadramento por RAIO, no quadro
     * seguinte, com a âncora da cena em vigor — o mesmo mecanismo do `fitPending` do AGENTE.
     */
    if (modo !== 'universo') {
      orbit.targetDistance = source ? NODE_FOCUS_DISTANCE : HOME.distance;
      orbit.targetPolar = source ? NODE_FOCUS_POLAR : HOME.polar;
    } else if (source) {
      /*
       * TRAVAR NUM CORPO ADOTA O SISTEMA DELE — e é este o gesto de viagem, sem inventar entrada
       * nova. A distância não sai daqui (ver a nota acima); quem enquadra é o `fitPending`.
       */
      adotarSistema(universe.sistemaDe(source));
    } else {
      /*
       * SOLTAR O FOCO deixa a câmera NO SISTEMA, e não de volta ao vazio da origem. Sem sistema
       * adotado ainda, `HOME_UNIVERSO` continua sendo o enquadramento largo.
       */
      if (sistemaCorrente === null) orbit.targetDistance = HOME_UNIVERSO;
      else adotarSistema(sistemaCorrente, true);
    }
    fitPending = Boolean(source);
    if (!source) focusGeometry = null;
    if (motion.isReduced()) {
      orbit.distance = orbit.targetDistance;
      orbit.polar = orbit.targetPolar;
    }
    /*
     * O FOCO SE GRAVA SOZINHO, aqui, e não no atalho.
     *
     * Este é o ponto ÚNICO por onde o foco muda — `ui.node-focus` já sai daqui e já tem três
     * assinantes. Gravar junto não acrescenta evento, estado nem caminho: quem travou num astro
     * acabou de dizer o que quer ver, e depender de o operador lembrar do `⌘S` é perder a
     * informação no caso mais comum, que é fechar a aba sem gravar nada.
     */
    prefs.set('camera.focus', source ?? '');
    ui('node-focus', { source: source ?? null });
  }

  /**
   * A âncora do corpo em foco na cena UNIVERSO, na MESMA forma que `graph.planetAnchor` devolve.
   *
   * ⚠️ **A constante de projeção é escrita pela definição, e é a única cópia dela nesta base.** No
   * caminho do AGENTE ela é RECUPERADA da saída do `planetAnchor` (`px · distância / raio`) de
   * propósito, para não existir uma segunda fórmula livre para divergir. Aqui não há âncora de onde
   * recuperá-la — então ela nasce da definição da projeção em perspectiva, `altura / (2·tan(fov/2))`,
   * que é exatamente o que a outra recupera. As duas divergirem é o defeito a vigiar.
   */
  function ancoraDoUniverso(source) {
    const ancora = universe.ancoraDe(source);
    if (!ancora) return null;
    const k = canvas.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const distancia = camera.position.distanceTo(ancora.position);
    return {
      node: ancora.node,
      position: ancora.position,
      radius: ancora.radius,
      // Distância mínima de 1e-3: dentro do corpo o `px` estouraria para infinito e levaria junto o
      // LOD, que decide nível por pixel aparente.
      px: (k * ancora.radius) / Math.max(distancia, 1e-3),
    };
  }

  /**
   * A pele do corpo em foco na cena UNIVERSO, pela ontologia NOVA. Ver `space/superficies.js`.
   *
   * A forma do retorno é a de `resolveBody` no que o quadro consome — `surface` e `recusados` —,
   * porque o bloco que desenha é o MESMO. O que muda é quem decide, não quem desenha.
   */
  function decisaoDoUniverso(node) {
    /*
     * ☠️ Aqui era `universe.tipoDe(node.source) === 'ESTRELA'` — **um rótulo de TELA lido como
     * dado.** Ele acertava enquanto `tipos` guardava a classe em maiúsculas, e quebrou no instante
     * em que o rótulo passou a nomear a PELE: estrela com atividade de cometa rotula COMETA, perdia
     * a dominância e caía para planeta (medido: 22 fotosferas → 21, 3 cometas → 2). Dominância é
     * FATO e agora vem publicada como fato.
     */
    const fisica = entityPhysics(node, { dominante: universe.ehDominante(node.source) });
    const classe = classificar(fisica, node);
    const ativos = fenomenos(fisica, node).map((f) => f.tipo);
    const surface = superficieDe(classe, fisica, ativos);
    /*
     * ⚠️ **A FORMA é a de `resolveBody`, com os nomes dele — `modifiers` e `rejected`.** A primeira
     * versão devolveu `recusados`, e o laço de quadro morreu na linha que escreve o traço
     * (`decisao.rejected.map`), num erro que só aparece quando o corpo em foco troca de superfície.
     * Quem desenha é o MESMO bloco: quem muda é quem decide, e o contrato de saída é dele.
     */
    return {
      surface,
      modifiers: [],
      rejected: surface === SURFACE.NONE
        ? [{ feature: 'surface', motivo: `classe ${classe.tipo} não roteia pele` }]
        : [],
      // O que a ontologia NOVA concluiu, para a sonda poder dizer por que esta pele e não outra.
      classe,
      fenomenos: ativos,
    };
  }

  /**
   * The zoom range in force right now.
   *
   * One function because there were two clamps before — the wheel's literals and the focus flight
   * — and they disagreed: the floor was farther out than the place focus flew to. Two rules over
   * one number is how the wheel ended up undoing the gesture that preceded it.
   *
   * `focusGeometry` is written by the frame loop from the SAME anchor that sizes and places the
   * body, so the floor cannot drift from the geometry it is protecting.
   */
  function clampDistance(value) {
    /*
     * ⚠️ **`ZOOM_RANGE.min` PRESSUPÕE UM CENTRO, e no UNIVERSO não há um.**
     *
     * As 12 unidades existem para a câmera não entrar no buraco negro da cena AGENTE — ali a âncora
     * é o núcleo, um objeto real, e o piso protege dele. Em voo livre a âncora é um ponto no vazio:
     * o mesmo 12 vira um chão sem dono, e ele impede de chegar perto de qualquer corpo. Medido em
     * 08/08: a roda encosta em 12 unidades com o maior corpo em 34 px, contra um piso de pele de 90
     * — e o §2.1 do `distancia-e-forma` já dizia que o corpo mediano precisa de 3,4 unidades para
     * alcançar 90 px. Nenhum planeta era alcançável, e a causa não era a pele.
     *
     * É a mesma forma do defeito da âncora: uma constante da outra cena viajando junto com o modelo
     * de câmera. O piso é para não ATRAVESSAR um corpo, então ele tem de vir do corpo mais próximo —
     * a mesma regra que o foco já usa (`FOCUS_FLOOR_RADII`), aplicada a quem está por perto em vez
     * de a quem está travado.
     */
    let floor = ZOOM_RANGE.min;
    if (focusGeometry) {
      floor = Math.max(focusGeometry.radius * FOCUS_FLOOR_RADII, CAMERA.near * 4);
    } else if (modo === 'universo') {
      const perto = universe.corpoMaisProximo(anchor);
      floor = Math.max((perto?.radius ?? 0) * FOCUS_FLOOR_RADII, CAMERA.near * 4);
    }
    return THREE.MathUtils.clamp(value, floor, ZOOM_RANGE.max);
  }

  /**
   * A galáxia de cada hub, montada uma vez por carga de topologia.
   *
   * Os filhos entram com MASSA (`chunks`), não só com caminho: é a concentração dessa massa que
   * escolhe a classe de Hubble (`galaxy-classes.js`), e uma lista de caminhos daria a todo mundo
   * a distribuição uniforme.
   */
  function buildHubs(payload) {
    const nodes = payload?.nodes ?? [];
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const kids = new Map();
    for (const [child, parent] of payload?.edges ?? []) {
      const node = byId.get(child);
      if (node?.type !== 'file') continue;
      if (!kids.has(parent)) kids.set(parent, []);
      // `churn` viaja junto com a massa porque o quasar acende por ACREÇÃO, não por tamanho:
      // `chunks` diz que o buraco negro EXISTE, `churn` diz que há gás caindo AGORA. Ver
      // `quasar.isActive` e `docs/catalogo-celeste.md`, seção "2. O quasar tem de acender por
      // ACREÇÃO, não por massa".
      kids.get(parent).push({ source: node.source, chunks: node.chunks, churn: node.churn });
    }
    return nodes
      .filter((node) => node.type === 'dir' || node.type === 'repo')
      .map((node) => ({ id: node.id, params: galaxyParams(node, kids.get(node.id) ?? []) }));
  }

  function focusOn(points) {
    if (!points.length) return;
    focusTarget.set(0, 0, 0);
    for (const point of points) focusTarget.add(point);
    focusTarget.divideScalar(points.length);
    focusWeight = 1;
  }

  /** Lê um escalar da órbita do storage, preso à mesma faixa que a interação impõe. */
  function readOrbit(key, min, max) {
    const value = prefs.get(key);
    if (typeof value !== 'number' || !Number.isFinite(value)) return prefs.DEFAULTS[key];
    return THREE.MathUtils.clamp(value, min, max);
  }

  const quantize = (value) => Math.round(value * ORBIT_STEP) / ORBIT_STEP;

  /**
   * Grava a órbita. `force` é o ⌘S; sem ele, só grava se houve gesto do operador.
   *
   * Não escreve nada quando o valor não mudou — a guarda é do próprio `prefs.set`, e é por isso
   * que os três escalares são chaves separadas em vez de um objeto (dois objetos de conteúdo
   * igual nunca são `===`, e a guarda nunca dispararia).
   *
   * Devolve se havia algo a gravar, para quem quiser dar retorno na tela.
   */
  function saveOrbit(force = false) {
    if (!force && !orbitMoved) return false;
    orbitMoved = false;
    /*
     * O ASTRO EM FOCO **não** é gravado aqui — ele se grava sozinho em `focusNode`, no instante em
     * que o operador trava. Depender do atalho perderia a informação no caso mais comum, que é
     * fechar a aba sem gravar nada.
     */
    prefs.set('camera.azimuth', quantize(orbit.targetAzimuth));

    /*
     * Dentro de um app o enquadramento é DERIVADO (o `focusBody` escolhe distância e polar para
     * emoldurar o corpo), não escolhido — gravá-lo faria a próxima sessão nascer com a moldura de
     * um app que talvez nem esteja aberto. Só o azimute, que continua sendo do operador, atravessa.
     *
     * ⚠️ Isto vale para corpo de APP (`focusedBody`), não para astro (`focusedNode`). São coisas
     * diferentes e a distinção é a que faltava: o zoom que o operador deu SOBRE um astro é escolha
     * dele, e agora atravessa junto com o próprio astro.
     */
    if (focusedBody) return true;

    // `HOME` é o enquadramento do CÉU. Com um astro travado a distância corrente é a dele, não a
    // de casa — sobrescrever `HOME` aqui faria destravar cair num zoom que ninguém escolheu.
    if (!focusedNode) {
      HOME.polar = orbit.targetPolar;
      HOME.distance = orbit.targetDistance;
    }
    prefs.set('camera.polar', quantize(orbit.targetPolar));
    prefs.set('camera.distance', quantize(orbit.targetDistance));
    return true;
  }

  /**
   * Devolve o operador ao astro da sessão anterior. Roda uma vez, quando a topologia chega.
   *
   * ⚠️ Antes da topologia é cedo: `focusNode` registra se o céu conhece o astro, e pedir foco com o
   * grafo vazio marcaria `conhecido: false` para um nó perfeitamente válido — o diagnóstico passaria
   * a mentir. Depois de `graph.load` o céu já sabe responder.
   */
  function agendarFoco() {
    if (focoRestaurado) return;
    focoRestaurado = true;
    const alvo = prefs.get('camera.focus');
    /*
     * O TRAÇO FICA, e não é sobra de depuração.
     *
     * Esta restauração falhou QUATRO vezes seguidas com todos os elos parecendo corretos na
     * leitura — gravação, índice do grafo, ordem de carga, escopo do relógio, guarda do router.
     * Cada tentativa custou uma rodada inteira porque o caminho falhava em SILÊNCIO: o foco era
     * pedido, apagado no quadro seguinte, e nada em lugar nenhum dizia isso.
     *
     * É a mesma disciplina que a sonda do planeta já segue — "diagnóstico que só existe no caminho
     * feliz não é diagnóstico". `conhecido: false` aqui aponta direto para a armadilha do prefixo
     * do repo no id, que o handoff registra e que já mordeu antes.
     */
    trace('foco-restaura', () => ({
      etapa: 'agendar',
      salvo: alvo || '(vazio)',
      conhecido: alvo ? Boolean(graph.nodeAt(alvo)) : null,
    }));
    // Storage é entrada não confiável: o astro pode ter saído da topologia entre as sessões.
    if (!alvo || !graph.nodeAt(alvo)) return;
    focoPendente = alvo;
  }

  /**
   * Aplica o foco salvo no primeiro quadro em que o astro TEM POSIÇÃO. Chamada pelo laço.
   *
   * ⚠️ **Aplicar direto no `loadGraph` NÃO funciona, e essa foi a primeira versão.** O laço de
   * quadro solta o foco de quem não tem posição resolvida (`if (focusedNode && !nodeAt)`), e logo
   * depois de `graph.load` as posições ainda não foram computadas — então o foco restaurado era
   * apagado no quadro seguinte, em silêncio. A câmera voltava (ela vem de `startOrbit`, por outro
   * caminho) e o astro não, que é exatamente o sintoma relatado.
   *
   * O prazo existe para o pedido não ressuscitar minutos depois: se o astro nunca resolve — filtro
   * de tipo escondendo o `kind` dele, nó fora da janela de recência — ele é esquecido em vez de
   * puxar a câmera quando o operador já estiver olhando outra coisa.
   */
  function aplicarFocoPendente(elapsed) {
    if (!focoPendente) return;
    if (!graph.worldPositionOf(focoPendente)) {
      if (elapsed > FOCO_PRAZO_S) {
        trace('foco-restaura', () => ({ etapa: 'desistiu', alvo: focoPendente, apos: `${elapsed.toFixed(1)}s` }));
        focoPendente = null;
      }
      return;
    }
    const alvo = focoPendente;
    focoPendente = null;
    trace('foco-restaura', () => ({ etapa: 'aplicou', alvo, em: `${elapsed.toFixed(2)}s` }));
    focusNode(alvo);
    /*
     * O ENQUADRAMENTO SALVO VENCE O AUTOMÁTICO.
     *
     * `focusNode` mira `NODE_FOCUS_DISTANCE` e liga `fitPending`, que no quadro seguinte recalcula
     * a distância para dar `FOCUS_FIT_PX`. Isso é o certo para um foco NOVO — e é errado aqui, onde
     * o operador já escolheu o zoom e gravou. Sem desligar o `fitPending`, a câmera restauraria a
     * pose salva e seria puxada para longe dela no quadro seguinte, o que lê como a cena corrigindo
     * o operador.
     */
    orbit.polar = orbit.targetPolar = startOrbit.polar;
    orbit.distance = orbit.targetDistance = startOrbit.distance;
    fitPending = false;
  }

  setInterval(() => saveOrbit(), ORBIT_SAVE_MS);

  /*
   * `visibilitychange` e `pagehide` — nunca `beforeunload`.
   *
   * `beforeunload` não é confiável em nenhum browser moderno para gravar: ele não dispara no
   * descarte de aba em background nem em mobile, e ainda desliga o bfcache. `pagehide` cobre o
   * fechamento real e `visibilitychange` cobre trocar de aba, que é como a sessão termina de
   * fato na maior parte das vezes.
   */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    // Contamina a janela de telemetria em curso: dali em diante ela mede uma aba que parou de
    // desenhar, e a média resultante fala da visibilidade, não do desempenho.
    frames.hidden = true;
    saveOrbit();
  });
  window.addEventListener('pagehide', () => saveOrbit());

  function frame() {
    /*
     * ⚠️ **A cena UNIVERSO atualiza AQUI, no topo do quadro e fora de todo bloco condicional.**
     *
     * Ela já morou em dois lugares errados, e os dois falharam em silêncio. Primeiro no `fanOut`
     * (que é afinação, não quadro): o `elapsed` de lá não é o do quadro, as matrizes saíam com
     * `NaN` e os corpos iam para lugar nenhum. Depois dentro do bloco `if (hubs.length)` da
     * galáxia: ali o `update` simplesmente NUNCA rodava, e a prova foi um contador — `quadros = 0`
     * com a cena montada e visível.
     *
     * Nenhum dos dois deu erro. `NaN` é posição e bloco não executado é ausência — os dois modos de
     * falha favoritos deste projeto, no mesmo lugar.
     */

    /*
     * DOIS RELÓGIOS, e a divisão entre eles é a regra inteira do multiplicador global.
     *
     * `real` é o tempo da parede: RESPOSTA a gesto (suavização de órbita, zoom, âncora, decaimento
     * do glitch) e PRAZO em segundos (a janela do foco pendente). `delta`/`elapsed` são o tempo dos
     * OBJETOS, multiplicado por `tune.timeScale` — é o que chega em todo `update` daqui para baixo.
     *
     * Misturar os dois quebra os dois extremos do slider: em 0 a câmera pararia de responder ao
     * mouse (e a cena congelada é exatamente quando se quer orbitar para olhar), e em 4 o prazo de
     * 8s do foco pendente viraria 2s sem que nada tivesse mudado na rede.
     *
     * A DERIVA da câmera fica do lado dos objetos de propósito: ela é movimento ambiente da cena,
     * não resposta a um gesto — quem congela a cena espera que ela também pare.
     */
    const real = Math.min(clock.getDelta(), 0.1);
    const delta = real * (tune.timeScale ?? 1);
    sceneTime += delta;
    const elapsed = sceneTime;
    // A cena UNIVERSO, logo que o relógio dos objetos avança e ANTES de qualquer condicional.
    // `canvas.height` é o framebuffer (CSS × devicePixelRatio) — a MESMA régua que o `pick` e o
    // `graph.update` recebem. O anel decide nível de detalhe em pixels, e duas réguas dariam duas
    // distâncias de troca na mesma tela.
    if (modo === 'universo') universe.update(elapsed, delta, camera, canvas.height);
    const started = performance.now();

    // Deriva automática é movimento contínuo sem evento por trás — o primeiro a sair.
    const drift = motion.isReduced() ? 0 : DRIFT_BASE * tune.cameraDrift;
    if (!dragging && !userControlled) orbit.targetAzimuth += delta * drift;
    if (cinematic) orbit.targetAzimuth += delta * drift * 1.6;

    orbit.azimuth = smooth(orbit.azimuth, orbit.targetAzimuth, tune.cameraEase, real);
    orbit.polar = smooth(orbit.polar, orbit.targetPolar, tune.cameraEase, real);
    orbit.distance = smooth(orbit.distance, orbit.targetDistance, RATE.zoom, real);

    // Âncora da órbita: origem no sistema, posição do corpo dentro de um app.
    /*
     * A âncora persegue o astro TODO QUADRO, não uma vez ao clicar.
     *
     * O nó está em órbita: fixar a âncora na posição do instante do clique deixaria o astro
     * escapando do centro em segundos. É o mesmo mecanismo do corpo de app, e por isso ele
     * está aqui e não num segundo caminho.
     */
    // Antes de qualquer coisa que leia o foco: o astro da sessão anterior entra aqui, no
    // primeiro quadro em que ele tem posição.
    // ⚠️ TEMPO REAL: `FOCO_PRAZO_S` é um prazo de rede em segundos, não uma fase de animação.
    aplicarFocoPendente(clock.elapsedTime);
    /*
     * ⚠️ **A posição do astro em foco é a da CENA EM VIGOR.** O mesmo `source` existe nas duas, em
     * lugares completamente diferentes: no AGENTE ele orbita o buraco negro por recência; no
     * UNIVERSO ele orbita a estrela do sistema dele. Perguntar sempre ao grafo fazia a câmera voar,
     * dentro do universo, para a coordenada do OUTRO céu — e como as duas cenas compartilham o
     * corpus, o destino era sempre plausível e sempre errado.
     */
    const nodeAt = focusedNode
      ? (modo === 'universo' ? universe.posicaoDe(focusedNode) : graph.worldPositionOf(focusedNode))
      : null;
    // Astro que saiu do céu (recarga da topologia) solta o foco em vez de prender a câmera
    // apontando para o vazio.
    if (focusedNode && !nodeAt) focusedNode = null;
    const bodyAt = nodeAt || (focusedBody ? bodies.positionOf(focusedBody) : null);
    /*
     * ⚠️ **A SUAVIZAÇÃO É DO VOO, NÃO DO CORPO** — e sem essa distinção a câmera trava PERTO do
     * astro, nunca nele.
     *
     * Um `lerp` de taxa fixa contra alvo em MOVIMENTO tem erro permanente: ele converge para uma
     * distância proporcional à velocidade do alvo (`v / taxa`), e nunca a zero. No céu AGENTE isso
     * é invisível porque `ω ∝ r^-1,5` e os raios são grandes; na cena UNIVERSO a órbita mais interna
     * fecha a volta em ~15 s, e a 0,4 rad/s o atraso vira quase um raio do corpo. Relatado da tela
     * exatamente assim: *"o zoom no astro não fixa nele, parece fixar perto dele"*.
     *
     * O conserto separa os dois movimentos que estavam somados: o deslocamento que o CORPO fez
     * neste quadro é aplicado à âncora sem amortecimento nenhum — ela viaja junto —, e o `lerp`
     * passa a amortecer só o que sobra, que é a diferença entre onde a câmera estava olhando e o
     * corpo novo. O voo continua macio; a perseguição deixa de existir.
     */
    /*
     * A ÂNCORA DO UNIVERSO NÃO É A ORIGEM. Ver `sistemaCorrente`.
     *
     * Ordem de queda, e cada degrau é um fato menor que o anterior: o corpo em foco → o sistema
     * corrente → o centroide dos sistemas (pendência declarada, ver `universe.centroideDosSistemas`)
     * → a origem, que só sobra quando não há sistema nenhum carregado. `ZERO` deixou de ser o
     * padrão e virou a degradação.
     */
    let alvoDaCena = bodyAt;
    if (!alvoDaCena && modo === 'universo') {
      if (!ancoraLivreIniciada) {
        // O primeiro quadro precisa de UM alvo. O centroide é o menos arbitrário que existe antes
        // de o operador ter voado para algum lugar — e deixa de valer no instante em que ele voa.
        ancoraLivre.copy(universe.centroideDosSistemas());
        ancoraLivreIniciada = true;
      }
      const anexado = objetoAnexado ? universe.posicaoDe(objetoAnexado) : null;
      if (anexado) ancoraLivre.copy(anexado);
      alvoDaCena = ancoraLivre;
    }
    anchorTarget.copy(alvoDaCena || ZERO);
    /*
     * ⚠️ **A CORREÇÃO ANTI-PERSEGUIÇÃO VALE PARA QUALQUER CORPO QUE A ÂNCORA SIGA, não só o em foco.**
     *
     * O comentário acima explica por que um `lerp` de taxa fixa contra alvo em MOVIMENTO tem erro
     * permanente. A correção existia, e só olhava `focusedNode` — então o objeto ANEXADO, que também
     * orbita, era perseguido com amortecimento e a âncora ficava para trás dele. Medido em 08/08:
     * anexar um planeta e chegar a 3,03 unidades dava **89,7 px** onde a conta pedia 135 — abaixo do
     * piso de pele de 90, então a pele não acendia por 0,3 px. O sintoma era "anexei, cheguei perto,
     * e a forma não aparece", que não aponta para a câmera em lugar nenhum.
     *
     * `seguindo` é a identidade do que a âncora persegue — o corpo em foco, ou o anexado. Uma
     * pergunta, uma variável: usar `focusedNode` para decidir isso era o modelo antigo (só o foco
     * movia a âncora) sobrevivendo dentro do novo.
     */
    const seguindo = focusedNode ?? (modo === 'universo' ? objetoAnexado : null);
    seguindoId = seguindo;
    if (alvoAnterior && alvoAnteriorDe === seguindo && seguindo) {
      anchor.add(ANCHOR_DELTA.copy(anchorTarget).sub(alvoAnterior));
    }
    anchor.lerp(anchorTarget, 1 - Math.exp(-2.6 * real));
    alvoAnterior = (alvoAnterior || new THREE.Vector3()).copy(anchorTarget);
    alvoAnteriorDe = seguindo;

    // A câmera olha para o núcleo, mas se inclina na direção do que foi recuperado: o
    // sistema aponta a atenção para onde a memória acendeu, e depois relaxa de volta.
    focusWeight = smooth(focusWeight, 0, RATE.focus, real);
    const lookAt = focusTarget.clone().multiplyScalar(focusWeight * 0.28);

    camera.position.set(
      anchor.x + Math.sin(orbit.azimuth) * Math.sin(orbit.polar) * orbit.distance,
      anchor.y + Math.cos(orbit.polar) * orbit.distance,
      anchor.z + Math.cos(orbit.azimuth) * Math.sin(orbit.polar) * orbit.distance
    );

    /*
     * A CÂMERA NÃO ENTRA NO NÚCLEO. Guarda geométrica, e ela conserta um defeito antigo.
     *
     * A posição da câmera é `âncora + direção × distância`. Ao focar um astro a âncora vira o
     * astro, e a distância de foco é 16 — mas nada garante que o resultado fique FORA do buraco
     * negro. Um arquivo pesado orbita a ~46 unidades do centro e o disco vai a 45: com a órbita
     * apontando para o lado de dentro, a câmera parava em 30, dentro do disco, e a tela virava
     * um borrão de estrias. Reproduzido três vezes seguidas ao focar o arquivo de 226 chunks.
     *
     * Não era escala do núcleo — eu cheguei a mexer nela duas vezes atrás do sintoma errado. É
     * que `focusNode` escolhe uma distância ao ASTRO sem olhar onde isso põe a câmera em relação
     * à ORIGEM, e nenhum valor de `coreScale` conserta isso: basta o astro estar perto o
     * bastante do centro.
     *
     * O empurrão é radial e mantém a direção do olhar praticamente intacta, porque a âncora
     * continua sendo o alvo do `lookAt`.
     */
    /*
     * Ao focar um astro, a câmera fica do lado DE FORA dele — nunca entre ele e o núcleo.
     *
     * A guarda radial abaixo evita o desastre, mas empurrando a câmera para longe do próprio
     * astro que se pediu para ver: o planeta procedural, que só aparece acima de 90px de raio
     * aparente, nunca chegava lá. Aqui o que se corrige é a POSE, não a distância — se o
     * deslocamento da órbita aponta para dentro, ele é refletido na direção radial. O ângulo de
     * visada escolhido pelo operador é preservado em módulo; só o lado muda.
     */
    if (focusedNode && anchor.lengthSq() > 1e-6) {
      const offset = ORBIT_OFFSET.copy(camera.position).sub(anchor);
      const outward = RADIAL.copy(anchor).normalize();
      const along = offset.dot(outward);
      if (along < 0) {
        offset.addScaledVector(outward, -2 * along);
        camera.position.copy(anchor).add(offset);
      }
    }

    /*
     * A folga é do HORIZONTE, não da borda do disco — e a diferença decidia se o planeta podia
     * existir.
     *
     * Medido: o disco vai a 45 unidades e a órbita de arquivo mais interna começa em 46. Uma
     * folga baseada na borda do disco (48,6) põe os astros mais recentes DENTRO da zona
     * proibida — a câmera nunca conseguia se aproximar deles, parava a 30,5 do alvo, e o astro
     * ficava com 37px de raio aparente quando o planeta precisa de 90. Não é que o planeta
     * estivesse quebrado: ele nunca era pedido.
     *
     * O que precisa mesmo de folga é a esfera OPACA. O disco é aditivo e fino; atravessar a
     * borda dele custa umas estrias no quadro, não a cena. 3,5 raios de horizonte mantêm o
     * enquadramento inteiro fora do buraco e devolvem toda a casca de nós para a câmera.
     */
    /*
     * ⚠️ A guarda move a câmera em relação à ORIGEM, e com um astro travado isso deforma o
     * enquadramento DELE — foi o que travou o zoom e o giro em foco.
     *
     * A casca de arquivo vai de 26 a 62 e a folga mede ~`horizonte × 3,5`: metade das poses em
     * volta de um astro recente cai dentro da esfera proibida. Ali a câmera era empurrada para
     * fora radialmente, o pedido do operador (roda ou arraste) virava um deslocamento que ele não
     * fez, e o resultado lia como "a câmera não responde". `guarda` na sonda diz quando morde.
     */
    const clearance = blackHole.horizonRadius * (tune.coreScale ?? 1) * 3.5;
    guardBit = camera.position.lengthSq() < clearance * clearance;
    if (guardBit) {
      // Câmera exatamente no centro não tem direção; a de partida da cena serve de desempate.
      if (camera.position.lengthSq() < 1e-6) camera.position.copy(CAMERA.start);
      camera.position.setLength(clearance);
    }
    /*
     * PARALAXE — a camera TRANSLADA com o ponteiro, e o alvo do olhar vai junto.
     *
     * Transladar os dois e o que produz paralaxe de verdade: numa translacao pura, o
     * deslocamento aparente cai com a distancia, entao o que esta perto anda muito e o que esta
     * longe quase nao anda. Se eu movesse so a posicao e mantivesse o alvo, seria uma ROTACAO em
     * torno da ancora — e aí o objeto focado ficaria parado e o fundo giraria, que e o oposto do
     * que o olho espera.
     *
     * ⚠️ Aqui os numeros do pedido foram INVERTIDOS, de proposito. A especificacao era estrelas
     * 20px, grafo 8px, HUD 2px — mas o campo estelar vive entre 150 e 400 unidades e o grafo
     * entre 68 e 160: o GRAFO e a camada mais proxima. Dar mais movimento ao que esta mais longe
     * produziria uma profundidade invertida, que o olho le como erro mesmo sem saber nomear. A
     * ordem correta sai de graca da translacao; nao precisei escolher valor por camada.
     */
    if (!motion.isReduced()) {
      // Tempo REAL: perseguir o cursor é resposta a gesto, e ela não desacelera com a cena.
      PARALLAX_AIM.lerp(pointer, 1 - Math.exp(-3.4 * real));
      camera.getWorldDirection(PARALLAX_FWD);
      PARALLAX_RIGHT.crossVectors(PARALLAX_FWD, camera.up).normalize();
      PARALLAX_UP.crossVectors(PARALLAX_RIGHT, PARALLAX_FWD).normalize();
      // A amplitude acompanha a distancia: a 88 unidades sao ~1,3 de mundo, e ao travar num
      // astro (distancia 7) cai para ~0,1 — sem isso, o mesmo deslocamento que e sutil de longe
      // sacudiria o planeta na tela.
      const amplitude = orbit.distance * PARALLAX_SCALE;
      PARALLAX_SHIFT.set(0, 0, 0)
        .addScaledVector(PARALLAX_RIGHT, PARALLAX_AIM.x * amplitude)
        .addScaledVector(PARALLAX_UP, PARALLAX_AIM.y * amplitude);
      camera.position.add(PARALLAX_SHIFT);
      lookAt.add(PARALLAX_SHIFT);
    }

    camera.lookAt(lookAt.add(anchor));

    blackHole.update(delta, elapsed);
    // Depois de a câmera ter sido posicionada neste quadro: o beaming é função de onde o
    // observador está, e usar a posição do quadro anterior faria o crescente arrastar atrás da
    // órbita da câmera.
    blackHole.syncView(camera);
    stars.update(delta, elapsed);
    // `canvas.height` é o framebuffer (CSS × devicePixelRatio), que é a unidade de
    // `gl_PointSize` — é ele, e não o tamanho CSS, que dimensiona o anel junto com a estrela.
    graph.update(delta, elapsed, camera, canvas.height);
    particles.update(delta);
    satellites.update(delta, elapsed);
    satellites.faceCamera(camera);
    wormholes.update(delta, elapsed, camera);
    bodies.update(delta, elapsed, camera, focusedBody, hoveredBody?.id ?? null, {
      radius: blackHole.horizonRadius,
    });

    // Picking limitado a ~16Hz e suspenso durante o arrasto: era ele que roubava o
    // orçamento de quadro justamente enquanto a câmera se movia. Arrastando, ninguém está
    // mirando num nó.
    if (!dragging && !pointerOffSky && performance.now() - lastPick > PICK_INTERVAL_MS) {
      lastPick = performance.now();
      raycaster.setFromCamera(pointer, camera);
      // Corpo de app tem prioridade: é destino de navegação, e um nó do grafo atrás dele não
      // pode roubar o clique.
      const body = bodies.pick(raycaster);
      if (body?.id !== hoveredBody?.id) {
        hoveredBody = body;
        canvas.style.cursor = body ? 'pointer' : '';
      }
      /*
       * ⚠️ **Cada cena responde pelo próprio picking, e o raycast não sabe disso.**
       *
       * O `raycaster` do three NÃO olha `object.visible`: ele trabalha sobre as posições, e o grafo
       * da cena AGENTE continua tendo todas as suas mesmo escondido. No modo UNIVERSO, portanto,
       * passar o cursor pelo céu acertava um corpo da OUTRA cena — hover e clique respondiam com
       * convicção total sobre um objeto que ninguém estava vendo, sem erro nenhum no caminho.
       *
       * A cena UNIVERSO pica por proximidade na TELA (`universe.pick`), e não por malha: os corpos
       * dela têm poucos pixels, e exigir o acerto dentro da esfera deixaria só as estrelas
       * clicáveis.
       */
      const picked = body
        ? null
        : modo === 'universo'
          ? universe.pick(pointer, camera, canvas.height)
          : graph.pick(raycaster);
      if (picked?.node?.id !== hovered?.node?.id) {
        hovered = picked;
        /*
         * O estado local vai JUNTO no evento, não anexado ao nó depois.
         *
         * Quem sabe se o arquivo está alterado é esta cena (`graph.dirtyOf`), e quem desenha o
         * rótulo é um widget que não a conhece. A alternativa seria o `main` escrever o campo
         * dentro do nó entre um assinante e outro — mutação de estado compartilhado dependendo
         * da ORDEM de registro dos ouvintes, que é a forma mais silenciosa de quebrar isto.
         */
        ui('hover', {
          node: picked?.node ?? null,
          dirty: picked?.node ? graph.dirtyOf(picked.node.source) : null,
        });
      }
    }

    /*
     * O PLANETA do astro em foco.
     *
     * Depois de `graph.update`, nunca antes: a âncora lê a posição que acabou de ser escrita.
     * É a mesma regra do anel, e pelo mesmo motivo — um quadro de atraso aqui aparece como a
     * esfera arrastando atrás do próprio halo.
     */
    /*
     * ⚠️ **No UNIVERSO não há pouso, e é a regra do cabeçalho do replanejamento em uma linha:**
     * *nenhuma morfologia nova enquanto a classificação não fechar.* Todo o aparato de PELE do
     * astro em foco — planeta, fotosfera, estação, cometa, pulsar, nebulosa, luas — sai daqui, e
     * ele desenha a taxonomia ANTIGA (`solver.js` sobre o `kind`).
     *
     * Sem esta guarda, travar num corpo do universo abria a esfera texturizada da outra cena por
     * cima da teia: o céu novo respondendo com o corpo do céu velho, e ainda por cima com a câmera
     * a 7 unidades de um objeto que a cena nova desenha com 0,7.
     */
    /*
     * ⚠️ **A ÂNCORA vem da cena em vigor, e o caminho depois dela é UM SÓ.**
     *
     * `graph.planetAnchor` resolve posição, raio e `px` no céu AGENTE. No UNIVERSO o corpo está em
     * outro lugar, com outro tamanho — mas o que o resto do quadro precisa é a mesma tupla, então
     * ela é montada aqui em vez de existir um segundo bloco de pele. Um bloco só é o que garante
     * que enquadramento, piso de zoom, LOD e sonda contam a mesma história nas duas cenas.
     */
    const pouso = !focusedNode
      ? null
      : modo === 'universo'
        ? ancoraDoUniverso(focusedNode)
        : graph.planetAnchor(focusedNode, camera, canvas.height, elapsed);

    /*
     * The zoom floor and the fit are derived from the anchor, never from a second formula.
     *
     * `pouso.px * distance / radius` IS the projection constant (viewport height over twice the
     * tangent of half the fov) — recovered from the anchor's own output instead of rewritten here.
     * Rewriting it would be a copy free to disagree with what sizes the body, which is the class of
     * bug that already put the link arcs in the wrong coordinate space.
     */
    /*
     * O TRAÇO DAS ÓRBITAS — a ordenação radial das luas é informação de dois instantes.
     *
     * Com o piso de legibilidade a lua virou corpo, e o sistema continuou lendo como pontos
     * espalhados: um ponto parado não diz em que raio ele orbita. Desenhar a elipse converte esse
     * tempo em espaço. Só para o astro em foco — 106 sistemas traçados juntos seriam ruído, e a
     * pergunta só existe quando alguém travou a câmera num corpo. Ver `space/moon-orbits.js`.
     *
     * Remonta no FOCO, não no quadro: `graph.moonsAt` varre o vetor inteiro.
     */
    if (focusedNode !== moonSource) {
      // As luas existem no céu só enquanto o astro delas está em foco — mesma disciplina da
      // superfície procedural. Ver `graph.setFocus`.
      graph.setFocus(focusedNode);
      const luas = focusedNode ? graph.moonsAt(focusedNode) : [];
      moonOrbits.build(luas);
      moonSource = focusedNode;
    }
    // O traço das luas é do céu AGENTE: as luas são as SEÇÕES do arquivo, e a escala dele é a do
    // grupo do grafo. No UNIVERSO ele desenharia elipses de outro mundo, no espaço errado.
    if (pouso && modo !== 'universo') moonOrbits.show(pouso.position, graph.spread());
    else moonOrbits.hide();

    /*
     * ⚠️ **QUEM ESCOLHE A PELE É A ONTOLOGIA DA CENA EM VIGOR.**
     *
     * `resolveBody` decide a partir do `kind` — a taxonomia que a Fase B refutou, em que um `config`
     * de 2 chunks desenha uma ESTRELA ao lado de um `doc` de 200 desenhado como planeta. Usá-la na
     * cena nova seria o modelo velho falando por cima do novo, exatamente o defeito que `ce8ad95`
     * consertou na HUD.
     *
     * No UNIVERSO quem responde é `superficieDe(classe, física, fenômenos)` — a tabela da Fase D,
     * medida antes de escrita (`scripts/censo-superficies.mjs`): fotosfera 17 · planeta 152 ·
     * cometa 8 · sem pele 11, e nenhuma pele roteada nasce vazia.
     */
    const decisao = pouso
      ? (modo === 'universo'
          ? decisaoDoUniverso(pouso.node)
          : resolveBody(pouso.node, { dirty: graph.dirtyOf(pouso.node.source) }))
      : null;
    if (pouso) {
      const distancia = camera.position.distanceTo(pouso.position);
      focusGeometry = { radius: pouso.radius, k: (pouso.px * distancia) / pouso.radius };
      if (fitPending && pouso.px > 0) {
        /*
         * ⚠️ FOCO POUSA NO CORPO — e por um tempo ele pousou no SISTEMA, o que foi pior.
         *
         * A ideia era boa e o resultado não: como a lua orbita a ~7,4 raios, enquadrar o sistema
         * põe a câmera a 23 unidades e o corpo fica com 33 px. O operador trava num documento e
         * recebe um ponto distante — reportado como "não consigo dar zoom nem controlar a câmera",
         * porque nada do que ele faz parece mudar o que está vendo. E dois corpos do mesmo tamanho
         * passavam a enquadrar diferente conforme tivessem ou não luas, o que é surpresa pura.
         *
         * Travar num astro significa VER AQUELE ASTRO. O sistema continua desenhado — o traço das
         * órbitas sai do quadro, e é ele o convite para afastar. Informação oferecida, não imposta.
         */

        /*
         * A PELE pode ser maior que o corpo, e o enquadramento tem de saber disso.
         *
         * `FOCUS_FIT_PX` enche a tela com o corpo — certo para a fotosfera e o planeta, que TÊM o
         * raio do corpo. A nebulosa tem 4,2 raios e o cometa arrasta a cauda por 9: enquadrados
         * pelo corpo, os dois transbordam e o operador vê filamento e partícula sem ver o objeto.
         * `SKIN_EXTENT` é o multiplicador de distância de cada pele.
         */
        const extensao = SKIN_EXTENT[decisao?.surface] ?? 1;
        orbit.targetDistance = clampDistance(
          ((focusGeometry.k * pouso.radius) / FOCUS_FIT_PX) * extensao
        );
        fitPending = false;
      }
    } else if (!focusedNode) {
      focusGeometry = null;
    }
    /*
     * A sonda escreve SEMPRE, inclusive o caso negativo.
     *
     * Escrevendo só quando há planeta, "sonda ausente" confundia três causas diferentes: foco
     * nulo, âncora não resolvida e nível de detalhe zero. Custou várias rodadas de depuração às
     * cegas. Diagnóstico que só existe no caminho feliz não é diagnóstico.
     */
    probe = {
      focado: focusedNode, ancorou: Boolean(pouso), px: pouso?.px ?? 0, level: 0,
      pedido: lastFocusRequest,
      guarda: guardBit,
      raioDaCamera: +camera.position.length().toFixed(2),
      alvo: pouso ? +pouso.position.length().toFixed(2) : null,
    };

    /*
     * O CATÁLOGO decide se este corpo pode ter superfície — não este bloco.
     *
     * Ligar o planeta sem consultá-lo pôs crosta num DIRETÓRIO, que é exatamente o
     * empilhamento que `catalog.js` existe para impedir: "agregado não tem corpo; dar crosta a
     * um diretório afirmaria um objeto que não há". A classe padrão, ESTRELA, também proíbe —
     * estrela tem fotosfera, não crosta — então a superfície é a exceção, e ela precisa de
     * permissão explícita.
     */
    /*
     * O SOLVER decide, e este bloco só obedece.
     *
     * Antes eram duas condições soltas aqui — `allows(classe,'surface')` e
     * `classe.features.photosphere` — que juntas formavam a regra sem que nada a chamasse de
     * regra. Cada superfície nova exigiria uma terceira condição e a chance de duas se
     * sobreporem crescia com o número delas. Agora existe UM lugar que responde "o que este
     * corpo desenha de perto", e ele responde também o que RECUSOU e por quê.
     */
    const classe = decisao?.klass ?? null;
    /*
     * A sonda carrega a decisão INTEIRA, e `recusados` é a metade que não existia.
     *
     * "Este corpo não desenha nada ao aproximar" tinha três causas indistinguíveis: âncora não
     * resolvida, nível de detalhe zero, ou a classe não permitir superfície nenhuma. A terceira
     * agora se lê pelo nome, com a frase do catálogo junto — que é como os 27 corpos de
     * `supernova` deixam de ser um mistério e viram um item de trabalho.
     */
    probe.classe = classe?.id ?? null;
    probe.tipo = decisao?.surface ?? SURFACE.NONE;
    probe.recusados = decisao?.rejected ?? [];
    // Qual dos DOIS modos de `haloOf` esta pele pediu. Sem isto, "o sprite sumiu" e "a coroa
    // cedeu porque devia" seriam a mesma imagem sem jeito de distinguir por sonda.
    probe.coroa = decisao ? keepsCrown(decisao.surface) : null;
    if (decisao && decisao.surface !== ultimaSuperficie) {
      ultimaSuperficie = decisao.surface;
      trace('solver', {
        corpo: pouso?.node?.label,
        classe: classe?.id,
        superficie: decisao.surface,
        modificadores: decisao.modifiers,
        recusados: decisao.rejected.map((r) => r.feature),
      });
    }
    // `tipo` é o que o solver DECIDIU; `desenhado`, o que a tela fez. Enquanto a galáxia só
    // existir na bancada os dois divergem nos 71 hubs, e é assim que a pendência fica legível.
    probe.desenhado = false;

    if (pouso && decisao.surface === SURFACE.PHOTOSPHERE) {
      if (focusedNode !== starSource) {
        starParamsCache = photosphereParams(pouso.node, hash01, graph.kindColor(pouso.node.kind));
        starSource = focusedNode;
      }
      photosphere.object.position.copy(pouso.position);
      photosphere.object.scale.setScalar(pouso.radius);
      const level = photosphere.update(starParamsCache, camera, pouso.px, elapsed);
      // A fotosfera É o corpo: a coroa fica, e é ela a atmosfera iluminada por trás. Quem
      // responde por isso é `keepsCrown` — este bloco não decide, obedece.
      graph.haloOf(level > 0.002 ? focusedNode : null, level, !keepsCrown(decisao.surface));
      probe.level = level;
      probe.raio = pouso.radius;
      probe.dist = camera.position.distanceTo(pouso.position);
      probe.desenhado = true;
    } else if (starSource) {
      photosphere.update(starParamsCache, camera, 0, elapsed);
      starSource = null;
    }

    /*
     * AS QUATRO PELES NOVAS — estação, cometa, pulsar e nebulosa.
     *
     * Um bloco só porque o contrato delas é o mesmo: parâmetros puros derivados do nó, cacheados
     * por `source`, e um `update` que devolve o nível de detalhe. O que muda entre elas é o que
     * cada uma precisa saber — a estação não precisa da câmera (ela é geometria), o cometa precisa
     * da POSIÇÃO (a cauda aponta para longe do núcleo) e o pulsar precisa do relógio.
     *
     * O sprite cede pelo `haloOf` na mesma medida, como já fazia para a fotosfera e o planeta: sem
     * isso o ponto aditivo somaria brilho por cima da peça e apagaria o contorno, que é justamente
     * o que distingue estas quatro.
     */
    const MORFOLOGICAS = [SURFACE.STATION, SURFACE.COMET, SURFACE.PULSAR, SURFACE.NEBULA];
    if (pouso && MORFOLOGICAS.includes(decisao.surface)) {
      const cor = graph.kindColor(pouso.node.kind);
      if (focusedNode !== morphSource) {
        morphSource = focusedNode;
        morphParams = {
          [SURFACE.STATION]: () => stationParams(pouso.node, cor),
          [SURFACE.COMET]: () => cometParams(pouso.node, cor),
          [SURFACE.PULSAR]: () => pulsarParams(pouso.node, cor),
          [SURFACE.NEBULA]: () => nebulaParams(pouso.node, cor),
        }[decisao.surface]();
      }
      for (const pele of [station.object, comet.object, pulsar.object, nebula.object]) {
        pele.position.copy(pouso.position);
        pele.scale.setScalar(pouso.radius);
      }
      let level = 0;
      if (decisao.surface === SURFACE.STATION) level = station.update(morphParams, pouso.px, elapsed);
      else station.object.visible = false;
      if (decisao.surface === SURFACE.COMET) {
        level = comet.update(morphParams, pouso.position, camera, pouso.px, elapsed, motion.isReduced());
      } else comet.object.visible = false;
      if (decisao.surface === SURFACE.PULSAR) {
        level = pulsar.update(morphParams, pouso.px, elapsed, motion.isReduced(), camera);
      } else pulsar.object.visible = false;
      if (decisao.surface === SURFACE.NEBULA) {
        level = nebula.update(morphParams, camera, pouso.px, elapsed, motion.isReduced());
      } else nebula.object.visible = false;

      /*
       * ⚠️ Destas quatro, só a ESTAÇÃO fica com a coroa — e a diferença não é de recuo, é de
       * corpo. Cometa (núcleo 0,30 do raio), pulsar (0,16) e nebulosa (nenhum) não têm superfície
       * sob a coroa: ela viraria um disco chapado da cor do nó por cima da coma/da nuvem. Ver
       * `keepsCrown` em `lod.js`, que traz a medida.
       */
      graph.haloOf(level > 0.002 ? focusedNode : null, level, !keepsCrown(decisao.surface));
      probe.level = level;
      probe.raio = pouso.radius;
      probe.dist = camera.position.distanceTo(pouso.position);
      probe.desenhado = level > 0.002;
    } else if (morphSource) {
      for (const pele of [station, comet, pulsar, nebula]) pele.object.visible = false;
      graph.haloOf(null, 0);
      morphSource = null;
      morphParams = null;
    }

    if (pouso && decisao.surface === SURFACE.PLANET) {
      if (focusedNode !== planetSource) {
        planetParamsCache = planetParams(pouso.node);
        planetSource = focusedNode;
      }
      planet.object.position.copy(pouso.position);
      planet.object.scale.setScalar(pouso.radius);
      /*
       * DE ONDE VEM A LUZ, e a resposta depende da CENA.
       *
       * Na AGENTE o núcleo é o único corpo emissivo, então a direção é o corpo → origem: iluminar
       * de outro lugar poria o terminador em desacordo com o que se vê, e é o terminador que faz a
       * esfera ler como esfera.
       *
       * ⚠️ **No UNIVERSO não há nada na origem**, e a luz é da ESTRELA DO SISTEMA — a mesma lei que
       * o `CORPO_VS` já aplica ao céu instanciado (*"luz global afirmaria de novo um centro único,
       * que é justamente o que ela nega"*). Sem esta distinção o mesmo planeta ficava iluminado de
       * um lado quando travado e de outro quando desenhado pelo pool, que é a pior das duas.
       */
      if (modo === 'universo') estrelaDoSistema(focusedNode, pouso.position, LIGHT_DIR);
      else LIGHT_DIR.copy(pouso.position).negate().normalize();
      const level = planet.update(
        { ...planetParamsCache, light: [LIGHT_DIR.x, LIGHT_DIR.y, LIGHT_DIR.z] },
        camera,
        pouso.px,
        elapsed
      );
      // O sprite cede NA MESMA MEDIDA em que a superfície aparece: sem isso a troca seria seca
      // e o astro piscaria de ponto para planeta. O planeta é o corpo, então a coroa fica.
      graph.haloOf(level > 0.002 ? focusedNode : null, level, !keepsCrown(decisao.surface));
      // Sonda de diagnóstico: o planeta é o único objeto cuja ausência não gera erro nenhum —
      // ele simplesmente não desenha. Sem isto, "não apareceu" não distingue LOD baixo de
      // âncora errada de shader mudo.
      probe.level = level;
      probe.raio = pouso.radius;
      probe.dist = camera.position.distanceTo(pouso.position);
      probe.desenhado = true;
    } else if (planetSource) {
      planet.update({ ...planetParamsCache, light: [0, 0, 1] }, camera, 0, elapsed);
      graph.haloOf(null, 0);
      planetSource = null;
    }

    /*
     * A NEBULOSIDADE do remanescente troca de desenho junto com o corpo, e pelo mesmo fator.
     *
     * De longe ela vive dentro do sprite; de perto o sprite bate no teto de 511 do driver e para
     * de crescer enquanto o corpo continua — a estrela transbordava o próprio remanescente no
     * zoom máximo. `probe.level` é o mesmo número que o `haloOf` usa para abrir o núcleo, então a
     * geometria entra exatamente na medida em que o sprite sai: nunca as duas somadas, nunca
     * nenhuma das duas. Ver `space/remnant.js`.
     */
    /*
     * ⚠️ **A esfera CEDE o lugar para a pele — ela não some.**
     *
     * A primeira versão escondia a instância, e o corpo desaparecia ao afastar a câmera: a pele tem
     * escada de LOD e apaga abaixo de ~90 px (medido: 35 270 pixels acesos a px 103 contra 3 430 a
     * px 82), e sem a esfera não sobrava nada. Relatado da tela: *"objeto em foco some quando
     * afastamos o zoom dele"*.
     *
     * ⚠️ E trocar o limiar não resolveria — só mudaria o degrau em que o buraco aparece. Quem
     * resolve é a esfera virar NÚCLEO (2% menor): a pele opaca a cobre de perto, e ela reaparece
     * sozinha conforme a pele apaga. Transição contínua, sem quadro nenhum decidindo nada.
     */
    /*
     * ─────────────────── AS PELES SEM FOCO. Ver o bloco do pool para o porquê e para o teto.
     *
     * A ORDEM é por pixel, e não por massa nem por proximidade: quem tem mais pixel é quem tem mais
     * a mostrar, e é a mesma grandeza que o `LOD_FAR_PX` de cada pele já usa para decidir se vale
     * desenhar. Duas réguas para "quem ganha pele" divergiriam na primeira mudança de fov.
     */
    for (const p of [...poolPlaneta, ...poolFotosfera, ...poolCometa, ...poolPulsar]) p.usado = false;
    const vizinhas = [];
    let cortadas = 0;
    if (modo === 'universo') {
      for (const c of universe.candidatosAPele(PELES_VIZINHAS_MAX * 3, focusedNode)) {
        const sup = decisaoDoUniverso(c.node)?.surface;
        const rota = ROTAS_DO_POOL[sup];
        if (!rota) continue;
        if (c.px < rota.far) continue;
        if (vizinhas.length >= PELES_VIZINHAS_MAX) { cortadas += 1; continue; }
        const slot = slotDaPele(rota.pool, rota.criar);
        slot.usado = true;
        slot.fonte = c.source;
        if (!paramsPorFonte.has(c.source)) paramsPorFonte.set(c.source, rota.params(c.node));
        slot.pele.object.position.copy(c.position);
        slot.pele.object.scale.setScalar(c.radius);
        slot.rota = sup;
        rota.desenhar(slot.pele, paramsPorFonte.get(c.source), c, elapsed);
        vizinhas.push({ source: c.source, px: +c.px.toFixed(1), pele: sup });
      }
    }
    // Slot que ninguém pediu neste quadro tem de PARAR DE DESENHAR. `px = 0` derruba o nível de
    // detalhe a zero e o próprio módulo esconde o grupo — o mesmo caminho que o corpo em foco usa
    // ao soltar, e não um `visible = false` por fora que a pele não saberia explicar.
    for (const p of [...poolPlaneta, ...poolFotosfera, ...poolCometa, ...poolPulsar]) {
      if (p.usado || !p.fonte) continue;
      ROTAS_DO_POOL[p.rota]?.esconder(p.pele, paramsPorFonte.get(p.fonte), elapsed);
      p.fonte = null;
    }
    pelesVizinhas = { desenhadas: vizinhas.length, teto: PELES_VIZINHAS_MAX, cortadas, corpos: vizinhas };

    /*
     * A CESSÃO é PLURAL: o corpo em foco e cada vizinho com pele cedem o sprite e viram núcleo.
     * Um só chamador, uma só lista — ver `universe.cederParaVarios`.
     */
    universe.cederParaVarios([
      ...(modo === 'universo' && decisao && decisao.surface !== SURFACE.NONE && focusedNode
        ? [{ source: focusedNode, span: BODY_SPAN[decisao.surface] ?? 1 }]
        : []),
      // Cada pele cede conforme o PORTE dela: a esfera vira o núcleo sob o corpo desenhado, e não
      // uma bola 2% menor que o cobre. Ver `cederParaVarios`.
      ...vizinhas.map((v) => ({ source: v.source, span: BODY_SPAN[v.pele] ?? 1 })),
    ],
    /*
     * ⚠️ **O FOCO vai no segundo argumento, e não como item da lista.** É ele que decide qual
     * anel é objeto de mundo e qual é billboard. O `universe` inferia isso de
     * `cedidos.size === 1`; desde que a cessão virou plural a inferência erra nos DOIS sentidos —
     * some com o anel de mundo quando há vizinho com pele, e o inventa num vizinho quando não há
     * foco. E ele é independente de PELE de propósito: um corpo em foco sem pele continua sendo
     * o corpo que se está inspecionando. Ver `indiceFocado` em `universe.js`.
     */
    modo === 'universo' ? focusedNode : null);
    /*
     * ⚠️ **A COROA da estrela, e ela existe porque a cena AGENTE a tinha por outro caminho.**
     *
     * Lá quem faz a estrela brilhar é o sprite do grafo, aceso por trás da fotosfera
     * (`graph.haloOf`, e `keepsCrown` já diz o motivo: *"a fotosfera É o corpo: a coroa fica, e é
     * ela a atmosfera iluminada por trás"*). O UNIVERSO esconde o grafo inteiro, então o corpo
     * ganhava superfície e perdia a LUZ — relatado da tela: *"estrela está sem brilho (estrelas
     * emitem luz própria)"*.
     *
     * Ela acompanha o nível de LOD da pele: acende com ela e apaga com ela, em vez de ter um
     * limiar próprio para discordar do corpo que está iluminando.
     */
    universe.coroar(
      modo === 'universo' && decisao?.surface === SURFACE.PHOTOSPHERE ? focusedNode : null,
      probe.level ?? 0
    );

    probe.casca = probe.desenhado ? (pouso.node.supernova || 0) * probe.level : 0;
    remnant.update(
      pouso?.position ?? ZERO,
      pouso?.radius ?? 0,
      probe.casca,
      probe.desenhado ? starSeed(pouso.node) : 0,
      probe.desenhado ? graph.kindColor(pouso.node.kind) : 0xffffff,
      camera
    );

    /*
     * TODAS as galáxias por quadro, num desenho só.
     *
     * Não é como o planeta e a fotosfera, que só existem para o corpo focado: são 71 hubs
     * visíveis ao mesmo tempo, e desenhar só o focado deixaria 70 pastas como pontos cinzas —
     * que é exatamente o defeito relatado. O módulo é instanciado justamente para isso.
     *
     * `canvas.height` (framebuffer), não `clientHeight`: a escada de LOD do módulo é escrita
     * nessa unidade, e passar a altura CSS dividiria por dois todo número de pixel que o shader
     * vê. Foi o defeito que a bancada escondeu por um DPR inteiro.
     */
    if (hubs.length) {
      const lote = [];
      /*
       * O QUASAR SAI DA MESMA VARREDURA, e é de propósito.
       *
       * Ele não é um corpo do céu: é o núcleo ATIVO de uma galáxia massiva, então quem decide se
       * ele existe é `quasarParams`, lendo os MESMOS `hub.params` que já desenham o disco. Uma
       * segunda varredura poderia divergir da primeira sobre quais hubs existem neste quadro —
       * e a âncora é a mesma, no mesmo quadro, pelo mesmo motivo que `planetAnchor` existe.
       *
       * `quasarParams` devolve `null` para quem não passa do limiar de massa de BOJO, então a
       * lista sai curta sozinha: 7 de 72 hubs no corpus medido (9,7%, a fração observada).
       */
      const nucleos = [];
      /*
       * QUAL DELAS ESTÁ EM FOCO — a REGRA DA INSPEÇÃO em um índice.
       *
       * A galáxia travada passa a desenhar um disco de MUNDO, que responde à órbita; as outras
       * continuam billboard, porque longe o corpo é sinal e um disco de perfil apagaria a
       * contagem de braços (`galaxy.js`, "A ORIENTAÇÃO TEM DOIS REGIMES"). É a posição no `lote`,
       * não no `hubs`: só quem tem âncora resolvida entra na lista, então os dois índices
       * divergem no primeiro hub sem posição — e essa divergência poria o disco de mundo em
       * outra galáxia, calada.
       */
      let focadaNoLote = -1;
      for (const hub of hubs) {
        const ancora = graph.planetAnchor(hub.id, camera, canvas.height, elapsed);
        if (!ancora) continue;
        if (hub.id === focusedNode) focadaNoLote = lote.length;
        lote.push({ params: hub.params, position: ancora.position, radius: ancora.radius });
        const nucleo = quasarParams(hub.params);
        if (nucleo) {
          nucleos.push({ params: nucleo, position: ancora.position, radius: ancora.radius });
        }
        // A sonda tem de dizer a verdade nos DOIS sentidos. Ela já sabia acusar "decidido e não
        // desenhado" enquanto a galáxia era só bancada; deixar o carimbo para trás agora a faria
        // negar uma imagem que está na tela, que é o mesmo defeito espelhado.
        if (hub.id === focusedNode) probe.desenhado = true;
      }
      /*
       * A TAXA VEM DO CATÁLOGO DE MOVIMENTO, e ela mudou porque foi medida.
       *
       * O padrão girava a 0,06 rad/s — 105 s por volta. Com 6 braços a figura se repete a cada
       * 17,5 s, então o olho tinha pouquíssimo sinal: na vista do céu, onde o disco tem ~20 px,
       * um ponto do braço andava 1,2 px/s. Não era "não gira", era abaixo do limiar.
       *
       * `reduced` do catálogo é `freeze` para padrão: quem pediu menos movimento não perde
       * informação nenhuma aqui — a figura fica, só para de girar.
       */
      galaxy.tune({ omega: motion.isReduced() ? 0 : rateOf(MOTION.patternSpin) });
      /*
       * ⚠️ A galáxia se REACENDE sozinha: o `update` dela repõe a visibilidade por instância, então
       * esconder o objeto no `setMode` durava um quadro. A guarda tem de ser na CHAMADA — e ela vale
       * como economia também, porque a cena UNIVERSO não paga o LOD de 228 discos que não desenha.
       */
      const acesas = modo === 'universo' ? [] : galaxy.update(lote, camera, canvas.height, elapsed, focadaNoLote);
      /*
       * A MESMA projeção e a MESMA escada da galáxia, injetadas — não recalculadas aqui.
       *
       * `diskPx` e `LOD_ARM_PX`/`LOD_FULL_PX` são de `galaxy.js` e vão para dentro do quasar como
       * argumento. É o que impede os dois de discordarem sobre qual número escolheu o nível de
       * detalhe: um núcleo aceso sobre um disco que já desistiu de resolver seria a mesma classe de
       * defeito das duas réguas de pixel que o anel pagou.
       */
      /*
       * O FLUXO DO QUASAR É DECIDIDO PELO PERFIL DE QUALIDADE, não pelo módulo.
       *
       * Animação é custo, e num perfil mínimo ela é a primeira coisa que sai — mas congelar não
       * pode apagar feição nenhuma: com `flow = 0` os nós do jato e a rugosidade do lóbulo
       * continuam desenhados, só param de andar. É a mesma disciplina de `reduced: freeze` do
       * `motion-catalog.js`, e o motivo é o mesmo: quem pediu menos movimento não pediu menos
       * informação.
       *
       * O portão sai de `graphSpeed` porque é o knob que os PERFIS já usam para dizer "esta
       * máquina se move menos" (`mínimo` o põe em 0,1 contra 0,25 do padrão). Um vigésimo terceiro
       * parâmetro só para isto seria uma chave a mais para alguém esquecer de ligar — e este
       * arquivo já pagou por chave órfã.
       */
      const fluxo = motion.isReduced()
        ? 0
        : THREE.MathUtils.clamp(tune.graphSpeed / 0.25, 0, 1.6);
      quasars.tune({ flow: fluxo });
      const nucleosAcesos = quasars.update(nucleos, camera, canvas.height, elapsed, diskPx, {
        far: LOD_ARM_PX,
        near: LOD_FULL_PX,
      });
      trace('galaxy', () => ({
        instancias: lote.length,
        emFoco: focadaNoLote,
        acimaDoLimiarDeBraco: acesas,
        quasares: nucleos.length,
        quasaresAcesos: nucleosAcesos,
        omega: +rateOf(MOTION.patternSpin).toFixed(4),
        voltaEmSegundos: MOTION.patternSpin.period,
        girouAteAgora: `${((elapsed * rateOf(MOTION.patternSpin) * 180) / Math.PI).toFixed(0)}°`,
      }));
    }

    links.update(graph.positions(), delta, elapsed, tune.edgeOpacity);

    backdrop.update(delta, camera.aspect, camera);

    if (signals) {
      const size = renderer.getSize(new THREE.Vector2());
      // `getSize` devolve pixels de CSS (o `pixelRatio` é interno ao renderer), que é a mesma
      // régua do `getBoundingClientRect` do lado da HUD. Misturar as duas daria furo deslocado
      // pelo DPR — e só em monitor retina, que é a pior classe de bug para reproduzir.
      //
      // `bufferHeight` vai junto porque a inversão do `gl_PointSize` lá dentro fala em pixel de
      // FRAMEBUFFER. São réguas diferentes no mesmo cálculo; ver `graph.signalPoints`.
      signals.update(
        graph.signalPoints(camera, { width: size.x, height: size.y, bufferHeight: canvas.height }, elapsed)
      );
    }

    // Tempo REAL: o glitch é o decaimento de um EVENTO de erro, e ele tem de morrer mesmo com a
    // cena congelada — senão um erro deixa a tela suja até alguém mexer no slider.
    glitch = smooth(glitch, 0, 3.2, real);
    /*
     * A LENTE DO CORPO EM FOCO — item #10 do brief, e quem decide é AQUI.
     *
     * `lensing.js` não conhece o catálogo e não deve conhecer: ele recebe uma massa e a aplica.
     * Quem sabe que um pulsar dobra o espaço e uma fotosfera não é o solver, e a decisão passa pelo
     * mesmo lugar que já decide pele e coroa. `null` desliga o termo inteiro no shader, que é o
     * estado da esmagadora maioria dos quadros.
     *
     * O Rs sai do raio DESENHADO do corpo: uma estrela de nêutrons tem ~10 km contra ~4 km de raio
     * de Schwarzschild para 1,4 massas solares, e é essa razão de 0,4 que faz a deflexão dela ser
     * forte de perto e invisível de longe. Ela alcança o interior da silhueta de propósito — ver o
     * bloco em `lensing.js`, e a escolha foi do usuário.
     */
    const corpoDaLente = pouso && decisao?.surface === SURFACE.PULSAR
      ? { center: pouso.position, rs: pouso.radius * BODY_SPAN[SURFACE.PULSAR] * RS_POR_RAIO.pulsar }
      : null;
    lensing.sync(camera, blackHole, renderer.getSize(new THREE.Vector2()), { glitch, lente: corpoDaLente });
    lensing.setTime(elapsed);

    composer.render();

    frames.count += 1;
    if (performance.now() - started > LONG_FRAME_MS) frames.long += 1;
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);

  return {
    focusBody,
    installApps: (apps) => bodies.install(apps),
    focusedBody: () => focusedBody,
    /**
     * O que a galáxia está REALMENTE recebendo — tempo, taxa e quantas instâncias.
     *
     * Existe pelo mesmo motivo de `planetProbe`: "não está girando" tem várias causas e nenhuma
     * delas aparece na tela. Ler o uniforme responde em um passo o que a aritmética só estima.
     */
    galaxyProbe: () => {
      const mesh = galaxy.object.children[0];
      const u = mesh?.material?.uniforms;
      if (!u) return { montado: false };
      /*
       * A POSE DE MUNDO entra na sonda porque "girar não revela nada" tem duas causas que a tela
       * não separa: o corpo pode não estar em modo mundo, ou estar e o ângulo não chegar ao
       * shader — que foi como o anel falhou em silêncio (`835e749`). Orbitar e ver `cosVista`
       * andar prova que chegou; vê-lo parado com `modo: 'mundo'` nomeia o defeito exato.
       */
      const pose = galaxy.pose();
      return {
        montado: true,
        tempo: u.uTime.value,
        omega: u.uOmegaP.value,
        instancias: mesh.geometry?.instanceCount ?? 0,
        voltaEmSegundos: u.uOmegaP.value ? (Math.PI * 2) / u.uOmegaP.value : Infinity,
        modo: pose ? 'mundo' : 'billboard',
        cosVista: pose ? +pose.cosView.toFixed(4) : null,
        // O que o shader recebeu, já com o piso de espessura e o sinal da face.
        achatamento: pose ? +pose.cosInc.toFixed(4) : null,
        rolagem: pose ? +pose.roll.toFixed(4) : null,
      };
    },
    /**
     * Luas em órbita e seções que não couberam — repassado de `graph.moonReport` para quem mostra.
     * O corte é geométrico e legítimo, mas silencioso ele leria como "o documento não tem essa
     * parte".
     */
    moonReport: () => graph.moonReport(),

    /**
     * Troca entre as duas cenas: `agente` (buraco negro no centro) e `universo` (gravidade local).
     *
     * ⚠️ Ela ESCONDE, não destrói. As duas ficam montadas: reconstruir 1 636 corpos a cada clique
     * daria um engasgo de meio segundo no gesto que mais se repete, e o custo de manter as duas em
     * memória é geometria instanciada, que não custa quadro enquanto invisível.
     *
     * O que sai no modo UNIVERSO é o que afirma um centro: o buraco negro e o campo de corpos por
     * recência. O campo estelar de fundo fica — ele é cenário, não afirmação.
     */
    setMode: (proximo) => {
      if (proximo !== 'agente' && proximo !== 'universo') return modo;
      modo = proximo;
      const universo = modo === 'universo';

      /*
       * ⚠️ **Esconder o GRUPO do buraco negro não o tira da cena.** Ele é, acima de tudo, um PASSE
       * de pós-processamento — a lente gravitacional deforma o quadro inteiro, e ela continua
       * rodando com o disco invisível. Foi o que aconteceu na primeira versão deste switcher: a
       * cena trocou, os corpos sumiram, e a distorção do espaço-tempo ficou.
       *
       * Desligar o passe é o que de fato muda de universo — e devolve o orçamento junto: a lente
       * custa 3,8–5,1 ms de GPU contra 0,31–0,35 ms do céu inteiro com 213 instâncias. A cena
       * UNIVERSO nasce, por construção, uma ordem de grandeza mais barata.
       */
      lensing.pass.enabled = !universo;
      blackHole.group.visible = !universo;
      graph.group.visible = !universo;
      /*
       * A camada de galáxia sai junto, e não é economia: ela desenha TODO agregado como galáxia,
       * que é o modelo que a nova ontologia refutou (228 de 228). Deixá-la ligada faria a cena
       * nova afirmar a taxonomia velha por cima da nova.
       */
      galaxy.object.visible = !universo;
      universe.setVisible(universo);

      /*
       * A escala muda com o mundo. O céu AGENTE cabe em ~60 unidades; o UNIVERSO tem raio 150, e
       * entrar nele com a câmera do outro deixaria o operador dentro de um sistema sem saber que
       * existe um universo em volta. O limite superior da órbita sobe junto, senão a câmera bate
       * no teto do modo anterior.
       */
      // O universo foi normalizado para caber no zoom de hoje (ver `universe.js`), então aqui basta
      // recuar até enquadrá-lo. Sem isto o operador entra na cena nova dentro de um sistema, sem
      // saber que existe um universo em volta.
      /*
       * ⚠️ Voltar ao AGENTE com um astro TRAVADO tem de voltar ao enquadramento DELE. Sem isto a
       * câmera recuava para a casa (`HOME.distance`) com o foco intacto: o astro continuava
       * travado, o painel continuava nomeando-o, e a tela mostrava o céu inteiro — a cena
       * afirmando duas coisas diferentes sobre o mesmo estado. `fitPending` volta junto porque é
       * ele que deixa o quadro seguinte corrigir a distância pelo raio real do corpo.
       */
      orbit.targetDistance = universo ? HOME_UNIVERSO : (focusedNode ? NODE_FOCUS_DISTANCE : HOME.distance);
      /*
       * ⚠️ Trocar de cena ENQUADRA A CENA, não mergulha no astro travado. São gestos diferentes:
       * "me mostre o universo" e "me leve até este corpo". Por isso `fitPending` só religa no
       * caminho de volta ao AGENTE, onde a distância de foco é do outro céu e precisa ser refeita.
       */
      fitPending = false;
      if (!universo && focusedNode) {
        orbit.targetPolar = NODE_FOCUS_POLAR;
        fitPending = true;
      }
      /*
       * Trocar de cena repinta o vínculo, e sem isto ele fica preso na cena anterior: sair do
       * UNIVERSO deixava a rede acesa por baixo do céu AGENTE (o grupo some, a lista não), e entrar
       * nele com um astro já travado não desenhava rede nenhuma até alguém clicar de novo. As duas
       * metades são o mesmo esquecimento — o desenho é derivado do FOCO, e o foco sobrevive à
       * troca de cena.
       */
      if (!universo) universe.selecionar(null, null);
      paintLinks();
      /*
       * ⚠️ **A CENA ANUNCIA A TROCA — quem a pediu não é responsável por contar aos outros.**
       *
       * O switcher só se repintava dentro do PRÓPRIO handler de clique/tecla. Toda outra porta que
       * chega aqui — `spatia.cena('universo')`, a rota, qualquer caminho futuro — trocava a cena e
       * deixava o HUD marcando a anterior. Medido: a sonda trocava para UNIVERSO e o botão seguia
       * aceso em AGENTE, em quatro capturas seguidas.
       *
       * Devolver `modo` e mandar cada chamador repintar seria a mesma dívida com outro nome: a
       * primeira porta que esquecesse voltaria a mentir, e um switcher mentindo é exatamente o que
       * faz alguém duvidar da sonda certa. `estado observável > estado implícito` do `CLAUDE.md`.
       *
       * Sem laço: quem escuta pinta, e pintar não chama `setMode`.
       */
      ui('scene-mode', { modo });
      return modo;
    },
    mode: () => modo,
    universeStats: () => universe.stats(),
    /**
     * "Os corpos se atravessam?" — a pergunta que a foto não responde, porque colisão e oclusão
     * produzem a mesma imagem. Sob demanda: `spatia.universo.sobreposicoes()`.
     */
    universeOverlaps: (limite) => universe.sobreposicoes(limite),
    /** O par nomeado: distância viva, raios e penetração. `spatia.universo.entre(a, b)`. */
    universePair: (a, b) => universe.entre(a, b),
    /**
     * O raio APARENTE de cada corpo, em pixels de framebuffer — esfera e sprite lado a lado.
     *
     * `spatia.universo.pixels()`. Ela existe porque "os astros somem de longe" e "os astros estão
     * opacos de longe" são dois relatos diferentes sobre a mesma foto, e só o histograma os separa.
     */
    universePixels: () => universe.pixels(),
    /** As peles desenhadas SEM foco, e o que o teto cortou. `spatia.universo.peles()`. */
    universeSkins: () => pelesVizinhas,

    /**
     * Onde a câmera do UNIVERSO está ancorada, e por quê. `spatia.universo.ancora()`.
     *
     * ⚠️ Ela existe porque "a âncora mudou" não tem imagem: a origem e um sistema a 40 unidades
     * dela produzem a MESMA foto se o enquadramento for largo. `porque` nomeia o degrau em vigor —
     * sem isso, "continua orbitando o vazio" e "adotou um sistema que por acaso está perto do
     * centro" seriam indistinguíveis, que é a confusão que abriu esta linha de trabalho.
     */
    universeAnchor() {
      const lista = universe.sistemas();
      const sis = sistemaCorrente === null ? null : lista[sistemaCorrente];
      const porque = focusedNode ? 'corpo em foco' : objetoAnexado ? 'objeto anexado' : 'voo livre';
      return {
        modo, porque, focado: focusedNode, anexado: objetoAnexado,
        ancoraLivre: [+ancoraLivre.x.toFixed(2), +ancoraLivre.y.toFixed(2), +ancoraLivre.z.toFixed(2)],
        sistema: sis ? { i: sistemaCorrente, id: sis.id, envelope: +sis.envelope.toFixed(3),
          distanciaDaOrigem: +sis.pos.length().toFixed(2) } : null,
        sistemas: lista.length,
        centroideDaOrigem: +universe.centroideDosSistemas().length().toFixed(2),
        ancoraAtual: [+anchor.x.toFixed(2), +anchor.y.toFixed(2), +anchor.z.toFixed(2)],
        ancoraDaOrigem: +anchor.length().toFixed(2),
        distancia: +orbit.distance.toFixed(2), alvoDeDistancia: +orbit.targetDistance.toFixed(2),
        /*
         * ⚠️ O ERRO DA ÂNCORA, e ele existe porque `distancia` MENTE sobre o que se vê.
         *
         * `orbit.distance` é a distância à ÂNCORA. O pixel de um corpo sai da distância ao CORPO.
         * Enquanto a âncora está em cima dele os dois são o mesmo número; quando ela fica para trás
         * (o corpo orbita, o `lerp` amortece) eles divergem — e a divergência aparece como "cheguei
         * perto e a pele não acendeu", que não aponta para a câmera em lugar nenhum. Medido em
         * 08/08: `distancia` 3,03 com o corpo a 3,81 e 107,5 px onde a conta pedia 135.
         */
        ...(() => {
          const alvo = seguindoId ? universe.posicaoDe(seguindoId) : null;
          if (!alvo) return { seguindo: seguindoId, erroDaAncora: null, distanciaAoCorpo: null };
          return {
            seguindo: seguindoId,
            erroDaAncora: +anchor.distanceTo(alvo).toFixed(3),
            distanciaAoCorpo: +camera.position.distanceTo(alvo).toFixed(3),
          };
        })(),
      };
    },

    /**
     * Anexa um corpo: a câmera passa a ter ELE como alvo padrão e viaja junto.
     *
     * ⚠️ Prova de conceito com um corpo do céu. O destino declarado é uma sonda 3D representando o
     * operador — e aí "quem detém o centroide" deixa de ser um cálculo e vira um objeto que está lá,
     * que é a diferença entre um centro computado e um corpo de referência.
     *
     * @param {string|null} source  `null` desanexa e devolve a câmera ao voo livre
     */
    universeAttach(source, chegar = true) {
      objetoAnexado = source && universe.sistemaDe(source) !== null ? source : null;
      /*
       * ANEXAR TAMBÉM CHEGA — senão a câmera adota o corpo e continua a 150 unidades dele, que é
       * adotar sem visitar. `irPara` já chega no sistema pelo envelope; a assimetria era um descuido,
       * e ela aparecia como "anexei e não mudou nada".
       *
       * ⚠️ A distância NÃO é a do foco. `FOCUS_FIT_PX` (260) enche a tela com o corpo, que é a pose
       * de quem TRAVOU nele. Anexar não é travar: o corpo vira a casa da câmera e o sistema tem de
       * continuar visível em volta. `CHEGADA_PX` é 1,5× o piso de pele — o bastante para a pele
       * acender com margem, longe o bastante para o resto continuar na tela.
       */
      if (objetoAnexado && chegar) {
        const anc = universe.ancoraDe(objetoAnexado);
        if (anc) {
          const k = canvas.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
          orbit.targetDistance = clampDistance((k * anc.radius) / CHEGADA_PX);
        }
      }
      return this.universeAnchor();
    },

    /** Adota um sistema pelo índice e CHEGA nele. `spatia.universo.irPara(3)`. */
    universeGoTo(i) {
      adotarSistema(i, true);
      return this.universeAnchor();
    },
    /** O tipo de um corpo na cena em vigor: novo no UNIVERSO, `null` no AGENTE. */
    bodyTypeOf: (source) => (modo === 'universo' ? universe.tipoDe(source) : null),

    loadGraph: (payload) => {
      const count = graph.load(payload);
      // A cena UNIVERSO lê o MESMO payload: um corpus, duas leituras dele. Montar as duas no
      // carregamento evita o engasgo de construir 1 636 corpos no clique do switcher.
      universe.load(payload);
      // Topologia nova reconstrói os sistemas: o índice guardado passa a apontar para outro lugar.
      // `SCHEMA_VERSION` protege dado em disco; isto protege um índice em memória, pelo mesmo motivo.
      sistemaCorrente = null;
      paramsPorFonte.clear();
      hubs = buildHubs(payload);
      // Só agora o céu sabe responder se conhece o astro salvo. Ver `aplicarFocoPendente`.
      agendarFoco();
      return count;
    },
    /** Janela temporal do céu, em espaço de recência — o mesmo eixo que já define o raio. */
    revealSky: (value) => graph.reveal(value),
    /** Anéis de Saturno nos arquivos alterados no disco. Recebe o `{caminho: estado}` cru. */
    /** Fundo do universo: liga/desliga, tempo de rotação, transição e qualidade. */
    applyBackdrop: (options) => backdrop.apply(options),
    /** Qual imagem está no ar — a tela de configuração precisa dela para creditar. */
    backdropPlate: () => backdrop.plate(),
    markDirty: (table) => {
      const resultado = graph.markDirty(table);
      /*
       * ⚠️ **A cena UNIVERSO tem o próprio anel, e ele precisa da MESMA varredura.**
       *
       * `rings` vive dentro de `graph.js` e o grupo dele é filho de `graph.group`, que o UNIVERSO
       * esconde inteiro — então o estado do git chegava ao painel ("NÃO RASTREADO") e não à
       * geometria. Relatado da tela exatamente assim. Aqui a mesma tabela alimenta as duas cenas,
       * de um ponto só: duas chamadas em lugares diferentes divergiriam no dia em que uma delas
       * fosse esquecida.
       */
      universe.sujar((source) => graph.dirtyOf(source));
      return resultado;
    },
    /** Apaga os anéis sem afirmar árvore limpa — quando o disco deixa de ser verificável. */
    forgetDirty: () => graph.forgetDirty(),
    dirtyOf: (source) => graph.dirtyOf(source),
    installProviders: (providers) => satellites.install(providers),
    nodeCount: () => graph.count(),
    toolColor: (kind) => TOOL_COLORS[kind] ?? TOOL_COLORS.other,

    /**
     * Quanto custa a cadeia de pós-processamento, em ms de GPU por quadro.
     *
     * Existe porque a pergunta volta toda vez que a cena muda, e porque as duas medidas óbvias
     * NÃO respondem — as duas foram tentadas e falharam:
     *
     * | Tentativa | Por que não serve |
     * |---|---|
     * | comparar FPS | a 105 FPS o loop está preso no vsync: baixar o custo não aparece |
     * | zerar `bloomStrength` | o PASSE continua rodando, só com o parâmetro em zero |
     * | `gl.finish()` + relógio de parede | neste driver (ANGLE/Metal) não sincroniza: mediu 0.1ms para 4.5 megapixels, o que não é crível |
     *
     * `EXT_disjoint_timer_query_webgl2` é o instrumento certo: ele pergunta À GPU quanto tempo
     * ELA levou, sem depender de o driver honrar um ponto de sincronia. O resultado chega
     * assíncrono, por isso a assinatura é uma promessa.
     *
     * ⚠️ A comparação carrega uma diferença: `renderer.render` escreve no framebuffer padrão e
     * o composer escreve em alvos intermediários. Serve para ordem de grandeza — que é a
     * pergunta ("o pós vale metade do quadro ou 5%?"), não para benchmark.
     */
    async sampleRenderCost(samples = 30) {
      const gl = renderer.getContext();
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (!ext) return { erro: 'EXT_disjoint_timer_query_webgl2 indisponível neste contexto' };

      const medir = (desenhar) =>
        new Promise((resolve) => {
          const query = gl.createQuery();
          gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
          for (let i = 0; i < samples; i++) desenhar();
          gl.endQuery(ext.TIME_ELAPSED_EXT);

          /*
           * A ESPERA PELO RESULTADO NÃO PODE DEPENDER DO `requestAnimationFrame`.
           *
           * Dependia, e isso pendurava a medição para sempre: basta a janela ir para trás no meio
           * da amostra e o rAF para de disparar — a promessa nunca resolve, e o sintoma que chega
           * a quem está medindo é "o script travou", que lê como cena travada e não é. Justo no
           * instrumento que existe para medir desempenho, e justo na hora em que alguém olha para
           * outra janela enquanto espera.
           *
           * Nada aqui precisa de vsync: é uma pergunta ao driver, não um desenho. `setTimeout`
           * continua disparando em aba oculta (estrangulado a ~1s, o que só torna a espera lenta),
           * e o teto de tentativas garante que ela TERMINA mesmo se o resultado nunca vier.
           */
          let tentativas = 0;
          const colher = () => {
            // `GPU_DISJOINT` marca que o relógio da GPU foi perturbado (troca de contexto,
            // throttling): a amostra inteira vira lixo e não pode ser reportada como medida.
            if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
              gl.deleteQuery(query);
              resolve(null);
              return;
            }
            if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
              if ((tentativas += 1) > 600) {
                gl.deleteQuery(query);
                resolve(null);
                return;
              }
              setTimeout(colher, 8);
              return;
            }
            const nanos = gl.getQueryParameter(query, gl.QUERY_RESULT);
            gl.deleteQuery(query);
            resolve(nanos / 1e6 / samples);
          };
          setTimeout(colher, 8);
        });

      const comCadeia = await medir(() => composer.render());
      const semCadeia = await medir(() => renderer.render(scene, camera));
      if (comCadeia === null || semCadeia === null) {
        return { erro: 'relógio da GPU perturbado (GPU_DISJOINT) — amostra descartada' };
      }
      return {
        comCadeia: +comCadeia.toFixed(3),
        semCadeia: +semCadeia.toFixed(3),
        custoDoPos: +(comCadeia - semCadeia).toFixed(3),
        fracao: +((1 - semCadeia / comCadeia) * 100).toFixed(1),
        pixelRatio: renderer.getPixelRatio(),
        buffer: [canvas.width, canvas.height],
        /*
         * O ESTADO SOB O QUAL A AMOSTRA FOI TIRADA — sem ele o número não é reproduzível.
         *
         * O custo do pós é dominado pelo raymarch da lente, e o orçamento de passos varia com o
         * tamanho da sombra na tela (18 longe, 64 em cima dela). Dois números diferentes tirados
         * em poses diferentes leriam como regressão, e dois iguais leriam como "não mudou nada".
         * A distância entra junto porque é ela que escolhe os passos.
         */
        passos: Math.round(lensing.pass.uniforms.uSteps.value),
        // O portão de profundidade da lente. `uHasDepth` 0 significa que ela trata TUDO como se
        // estivesse atrás da massa — o modo de falha que o handoff registra como silencioso.
        temProfundidade: lensing.pass.uniforms.uHasDepth.value,
        distanciaDaMassa: +lensing.pass.uniforms.uBhDist.value.toFixed(1),
        fov: camera.fov,
        distanciaAoNucleo: +camera.position.length().toFixed(1),
      };
    },

    /**
     * Amostra de desempenho para o beacon; zera a janela a cada leitura.
     *
     * `null` quando a janela não foi medida — aba oculta em qualquer momento dela, ou nenhum
     * quadro desenhado. É a distinção que faltava: ausência de medida e medida ruim davam o mesmo
     * número, e quem consome não tinha como saber qual dos dois recebeu. A janela é reiniciada de
     * todo jeito, senão a amostra seguinte carregaria o trecho oculto junto.
     */
    sampleTelemetry() {
      const now = performance.now();
      const seconds = (now - frames.since) / 1000;
      const medida = !frames.hidden && frames.count > 0;
      const sample = {
        fps: seconds > 0 ? frames.count / seconds : 0,
        long_frames: frames.long,
        nodes: graph.count(),
      };
      frames.count = 0;
      frames.long = 0;
      frames.since = now;
      frames.hidden = document.hidden;
      return medida ? sample : null;
    },

    /** Grava a órbita agora (o ⌘S). Devolve se havia gesto novo a registrar. */
    saveOrbit: () => saveOrbit(true),

    /**
     * Aplica a parte da cena que um perfil de qualidade decide.
     *
     * O `tuning` (os 22 parâmetros) é aplicado por quem chama, direto no store — ele já se
     * distribui sozinho pelo `subscribe`. O que passa por aqui é só o que NÃO é afinação:
     * resolução de desenho e teto de anéis.
     */
    applyProfile({ pixelRatio, maxRings }) {
      if (typeof maxRings === 'number') graph.setMaxRings(maxRings);
      if (typeof pixelRatio === 'number' && pixelRatio !== pixelCeiling) {
        pixelCeiling = pixelRatio;
        applyPixelRatio();
      }
    },

    /** Trava a câmera num astro do céu; `null` solta. */
    focusNode,
    focusedNode: () => focusedNode,
    /** Diagnóstico do planeta em foco — raio aparente, nível de detalhe e distância. */
    planetProbe: () => probe,

    /*
     * O orçamento de pixel das peles, com a TELA de verdade — a metade da regra que não é constante.
     *
     * `lod.js` obriga na carga o que só depende de constante (o recuo contra o piso de detalhe).
     * O que depende de monitor não pode ser obrigado ali: `k = H/(2·tan(fov/2))` só existe com uma
     * janela aberta, e é ele que decide se o detalhe PLENO é alcançável — numa janela 1x de 800px
     * o planeta empaca em ~35% e nenhum zoom resolve. Então essa metade se LÊ, aqui, em vez de
     * ficar num comentário afirmando um monitor que ninguém tem.
     */
    lodProbe: () => budget({ fov: camera.fov, framebufferHeight: canvas.height }),

    /*
     * O BLOOM, para o teste do item #9 — "o brilho deveria nascer do shader; o bloom apenas
     * amplificaria". Esse item não se responde discutindo: põe-se a força em zero e olha-se se o
     * astro continua brilhando. Se ele apaga, o brilho era do pós-processamento.
     *
     * ⚠️ É a única sonda que ESCREVE, e escreve fora do store de propósito: `fanOut` reaplica a
     * afinação inteira a cada mudança de preferência, então o valor forçado aqui volta sozinho ao
     * do store na próxima — que é exatamente o que se quer de um interruptor de bancada. Sem
     * argumento, só lê.
     */
    /*
     * O buraco negro como indicador cognitivo — a bancada da CAMADA 4.
     *
     * Sem isto, ver "thinking engrossa o disco" exigia fazer o agente pensar, o que leva segundos
     * e não se repete igual. É a REGRA DA INSPEÇÃO aplicada ao que a camada 4 acabou de criar:
     * grandeza nova sem como olhar para ela é grandeza que ninguém confere.
     *
     * Com argumento força o regime e/ou a carga; sem argumento, só lê o que o traçado recebe.
     */
    blackHoleProbe: ({ regime, tokens } = {}) => {
      if (regime) blackHole.setRegime(regime);
      if (tokens !== undefined) blackHole.setLoad(tokens);
      const g = blackHole.geometry();
      const alvo = blackHole.regimeTarget();
      return {
        // O que o traçado recebe NESTE quadro.
        agora: {
          thickness: Number(g.thickness.toFixed(3)),
          intensity: Number(g.intensity.toFixed(3)),
          spin: Number(g.spin.toFixed(3)),
          turbulence: Number(g.turbulence.toFixed(3)),
        },
        // Para onde o regime está puxando. Os dois, porque `live` chega no alvo por aproximação
        // exponencial e sem o alvo "não mudou" e "ainda está a caminho" leem igual.
        alvo,
      };
    },

    bloomProbe: (ajuste) => {
      // Número solto continua valendo como força — é a chamada que já existia.
      if (typeof ajuste === 'number') bloom.strength = ajuste;
      else if (ajuste) {
        if (ajuste.strength !== undefined) bloom.strength = ajuste.strength;
        if (ajuste.threshold !== undefined) bloom.threshold = ajuste.threshold;
        if (ajuste.radius !== undefined) bloom.radius = ajuste.radius;
      }
      return {
        strength: bloom.strength,
        threshold: bloom.threshold,
        radius: bloom.radius,
        doStore: tune?.bloomStrength,
      };
    },

    /**
     * O A/B dos dois termos de borda da pele do planeta. Ver `planet.termos`.
     *
     * Ela responde a pergunta que a medida de 2026-08-08 deixou aberta: o disco em foco é aceso na
     * BORDA e escuro no meio (centro 5,9 contra limbo 80,7 em `nucleo/bloco-10`), e os dois
     * candidatos a autor — o fresnel na superfície e a casca aditiva — são cortados pelo MESMO
     * `params.atmosphere`. Sem separá-los, "é a atmosfera" é tudo o que se consegue dizer.
     */
    skinTerms: (ajuste) => planet.termos(ajuste),

    /**
     * O A/B dos dois termos de borda da pele do planeta, no mesmo quadro. Ver `mesmoQuadro`.
     *
     * @param {Array<{limbo?: number, casca?: number}>} condicoes  na ordem de desenho
     * @param {(cond: object, i: number) => any} [ler]  síncrona, com o desenho ainda no buffer
     * @returns {{amostras: any[], estado: object}}
     */
    skinAB(condicoes = [], ler) {
      const amostras = mesmoQuadro(condicoes, (c) => planet.termos(c), () => planet.termos({ limbo: 1, casca: 1 }), ler);
      return { amostras, estado: planet.termos() };
    },

    /**
     * O mesmo A/B, na cena UNIVERSO: o ganho do ARO da estrela. Ver `universe.termos`.
     *
     * ⚠️ Ela mede a ESTRELA porque `CORPO_FS` não tem aro — o passo 2 do `distancia-e-forma.md`
     * cria um em vez de ajustar um. O que esta sonda responde é quanto um aro compra no tamanho
     * que um corpo REALMENTE tem nesta cena, que é a pergunta que decide se vale criá-lo.
     */
    universeAB(condicoes = [], ler) {
      const amostras = mesmoQuadro(condicoes, (c) => universe.termos(c), () => universe.termos({ borda: 1 }), ler);
      return { amostras, estado: universe.termos() };
    },

    /** Devolve o controle da câmera à deriva automática. */
    release() {
      userControlled = false;
    },
  };
}
