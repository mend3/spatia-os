/**
 * ESTAÇÃO — o corpo de um AGENTE, e o único do céu que não é natural.
 *
 * ## Por que ela não pode ser feita de ruído
 *
 * Todos os outros corpos desta cena nascem de `simplex3`: fotosfera, planeta, nebulosa,
 * remanescente. Ruído é a ferramenta certa para o que a natureza faz — e errada para o que
 * alguém FEZ. Um agente é artefato: existe porque foi projetado, tem partes com função e
 * simetria de montagem. Desenhá-lo com a mesma granulação dos outros o classificaria, para o
 * olho, na mesma família — que é exatamente a queixa que originou este módulo ("muitas estrelas
 * e outros objetos com as mesmas formas").
 *
 * Então aqui não há ruído nenhum. Há caixas, cilindros e simetria radial. A leitura pretendida é
 * imediata e pré-verbal: **aresta reta = alguém construiu**.
 *
 * ## O que os números do nó viram
 *
 * | fato do nó | o que ele governa | por quê |
 * |---|---|---|
 * | `sections` | quantos MÓDULOS o casco tem | a estrutura do documento é a estrutura da estação |
 * | `chunks` | comprimento do casco | massa é tamanho, como no resto do céu |
 * | `churn` | brilho do farol | estação ativa pisca; abandonada fica escura |
 * | hash do caminho | rotação de montagem e passo dos painéis | duas estações não são a mesma peça |
 *
 * ⚠️ **Sem `simplex3` e sem shader próprio de propósito.** Ela usa `MeshBasicMaterial` com
 * `wireframe` no casco e faces sólidas nos painéis: o contorno é a informação. Um material com
 * iluminação exigiria uma luz que a cena não tem para este corpo (o núcleo ilumina planetas, e
 * uma estação orbitando longe dele ficaria preta de um lado sem que isso significasse nada).
 */
import * as THREE from 'three';

/** Onde a estação começa a aparecer e onde satura, em pixels de raio. Igual às outras peles. */
export const LOD_FAR_PX = 34;
export const LOD_NEAR_PX = 120;

/**
 * Quanto do raio de referência a peça ocupa — e ela para um pouco ANTES dele.
 *
 * A montagem é normalizada por este número (ver `createStation`): o farol fica na ponta do casco
 * e um encaixe exato o poria colado na borda do enquadramento, que lê como corte. Quem lê isto
 * também é `lod.js` (`BODY_SPAN`): 0,92 é perto o bastante de 1 para a coroa do sprite envolver a
 * estrutura em vez de boiar dentro dela — foi esta a pose aprovada no olho em 2026-08-07.
 */
export const BODY_SPAN = 0.92;

/** Módulos do casco: piso e teto. Menos de 2 não lê como estrutura; mais de 7 vira mancha. */
const MODULES = { min: 2, max: 7 };
/** Painéis por lado. Dois é o mínimo que dá simetria; seis satura antes de virar ruído visual. */
const PANELS = { min: 2, max: 6 };

const hash01 = (text, salt) => {
  let value = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return ((value >>> 0) % 100000) / 100000;
};

/**
 * Parâmetros da estação de um nó. Puro e congelado, como `planetParams` e `photosphereParams`.
 *
 * @param {{source?: string, id?: string, sections?: string[], chunks?: number, churn?: number}} node
 * @param {number} color  a cor que o céu já usa para este tipo de conhecimento
 */
export function stationParams(node = {}, color = 0xffffff) {
  const path = node.source ?? node.id ?? 'sem-caminho';
  const seed = hash01(path, 29);
  const seedB = hash01(path, 31);
  const sections = node.sections?.length ?? 0;
  const chunks = Number.isFinite(node.chunks) ? node.chunks : 1;
  const churn = Number.isFinite(node.churn) ? node.churn : 0;

  return Object.freeze({
    // A estrutura do documento vira a estrutura do casco — não é decoração: um agente com dez
    // seções É uma peça mais articulada que um de duas.
    modules: THREE.MathUtils.clamp(
      MODULES.min + Math.round(sections * 0.5),
      MODULES.min,
      MODULES.max
    ),
    panels: THREE.MathUtils.clamp(
      PANELS.min + Math.round(Math.log2(1 + chunks) * 0.6),
      PANELS.min,
      PANELS.max
    ),
    /** Comprimento do casco em raios. Log, como todo tamanho desta cena. */
    length: 1.1 + Math.min(Math.log2(1 + chunks) * 0.16, 0.9),
    /** Farol por ATIVIDADE: agente mexido pisca; agente parado fica escuro. */
    beacon: THREE.MathUtils.clamp(Math.log2(1 + churn) / Math.log2(1 + 27), 0, 1),
    /** Pose de montagem — sem ela toda estação teria a mesma silhueta na mesma pose. */
    yaw: seed * Math.PI * 2,
    pitch: (seedB - 0.5) * 1.1,
    /** Passo entre painéis, em fração do casco. Muda o ritmo da peça sem mudar as partes. */
    pitchStep: 0.42 + seedB * 0.3,
    color,
  });
}

/**
 * A estação do astro em foco. Uma por cena — mesmo ciclo de vida da fotosfera e do planeta.
 *
 * Nada é construído aqui: a geometria nasce no primeiro quadro em que o corpo cruza
 * `LOD_FAR_PX`, e é REMONTADA quando os parâmetros mudam (outro astro em foco). Estação é peça
 * discreta: não dá para interpolar de 3 para 5 módulos, então remontar é o único caminho honesto.
 */
export function createStation() {
  const group = new THREE.Group();
  group.visible = false;

  /*
   * A MONTAGEM vive num grupo interno normalizado, e o motivo é de enquadramento.
   *
   * O `scene.js` escala esta pele pelo raio do corpo, que já carrega a massa — é o mesmo raio que
   * enquadra a fotosfera e o planeta. Se o comprimento do casco também crescesse com a massa, a
   * estação apareceria ao dobro do tamanho das outras peles e transbordaria o quadro no
   * enquadramento de foco (medido: 257px de raio virando 500+ px de peça).
   *
   * Normalizado, `length` governa a PROPORÇÃO — estação esguia contra estação atarracada — e o
   * tamanho continua vindo de onde vem para todo mundo.
   */
  const montagem = new THREE.Group();
  group.add(montagem);
  let assinatura = null;
  let farol = null;
  const materiais = [];

  function limpar() {
    for (const filho of [...montagem.children]) {
      montagem.remove(filho);
      filho.geometry?.dispose();
    }
    for (const m of materiais) m.dispose();
    materiais.length = 0;
    farol = null;
  }

  function construir(params) {
    limpar();
    const cor = new THREE.Color(params.color);

    /*
     * O CASCO é wireframe, e isso não é economia — é a leitura.
     *
     * Sólido, a estação vira uma pedra clara e volta para a família dos corpos naturais. O
     * contorno é o que diz "isto foi montado", e ele sobrevive a 34px, que é onde esta pele
     * começa. Sólido a 34px seria um borrão sem informação nenhuma.
     */
    const cascoMat = new THREE.MeshBasicMaterial({
      color: cor,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });
    materiais.push(cascoMat);

    const passo = (params.length * 2) / params.modules;
    for (let i = 0; i < params.modules; i += 1) {
      // Módulos alternam entre cilindro e caixa: uma estação de peças idênticas empilhadas lê
      // como cristal, que é de novo a família natural.
      const raio = 0.34 * (i % 2 === 0 ? 1 : 0.72);
      const geo =
        i % 2 === 0
          ? new THREE.CylinderGeometry(raio, raio, passo * 0.86, 8, 1)
          : new THREE.BoxGeometry(raio * 1.5, passo * 0.7, raio * 1.5);
      const malha = new THREE.Mesh(geo, cascoMat);
      malha.position.y = -params.length + passo * (i + 0.5);
      montagem.add(malha);
    }

    /*
     * PAINÉIS: faces SÓLIDAS contra o casco vazado.
     *
     * O contraste entre os dois é o que faz a peça ler como montagem em vez de gaiola. Eles saem
     * em pares opostos porque estrutura assimétrica em órbita não se sustenta — e porque simetria
     * é a assinatura mais barata de "projetado".
     */
    const painelMat = new THREE.MeshBasicMaterial({
      color: cor.clone().multiplyScalar(0.55),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    });
    materiais.push(painelMat);

    for (let i = 0; i < params.panels; i += 1) {
      const y = -params.length + params.length * 2 * ((i + 0.5) / params.panels);
      for (const lado of [-1, 1]) {
        const geo = new THREE.PlaneGeometry(0.9, params.pitchStep);
        const painel = new THREE.Mesh(geo, painelMat);
        painel.position.set(lado * 0.78, y, 0);
        painel.rotation.y = Math.PI / 2;
        montagem.add(painel);
      }
    }

    /*
     * O FAROL é a única parte que pulsa, e ele carrega a única informação que muda: atividade.
     *
     * Aditivo e sem profundidade, como todo brilho desta cena — e a amplitude sai de `churn`, não
     * de um relógio decorativo. Agente parado tem farol apagado, e isso é o dado.
     */
    const farolMat = new THREE.MeshBasicMaterial({
      color: cor,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    materiais.push(farolMat);
    farol = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), farolMat);
    farol.position.y = params.length;
    montagem.add(farol);

    // `BODY_SPAN` deixa uma folga: o farol fica na ponta e um encaixe exato o poria colado na
    // borda do enquadramento, que lê como corte. O número mora lá porque `lod.js` também o lê.
    montagem.scale.setScalar(BODY_SPAN / params.length);
    group.rotation.set(params.pitch, params.yaw, 0);
    assinatura = `${params.modules}|${params.panels}|${params.length}|${params.yaw}`;
  }

  return {
    object: group,

    /**
     * @param {object} params  de `stationParams`
     * @param {number} px      raio aparente do corpo, em pixels
     * @param {number} elapsed relógio da cena
     * @returns {number} nível de detalhe aplicado, 0…1 — o mesmo contrato das outras peles
     */
    update(params, px, elapsed) {
      const level = THREE.MathUtils.clamp(
        (px - LOD_FAR_PX) / (LOD_NEAR_PX - LOD_FAR_PX),
        0,
        1
      );
      group.visible = level > 0.002;
      if (!group.visible) return 0;

      const chave = `${params.modules}|${params.panels}|${params.length}|${params.yaw}`;
      if (chave !== assinatura) construir(params);

      // Piscar do farol: 0,9 Hz, e a amplitude é a atividade. Sem `churn` ele fica apagado, que é
      // a leitura certa para um agente que ninguém tocou.
      if (farol) {
        const pisca = 0.5 + 0.5 * Math.sin(elapsed * 5.6);
        farol.material.opacity = params.beacon * (0.25 + pisca * 0.75) * level;
      }
      for (const filho of montagem.children) {
        if (filho !== farol && filho.material) {
          filho.material.opacity = (filho.material.wireframe ? 0.9 : 0.75) * level;
        }
      }
      return level;
    },

    dispose: limpar,
  };
}
