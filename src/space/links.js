/**
 * VÍNCULOS — as arestas do grafo, desenhadas sob demanda e como ARCO.
 *
 * ## Por que a teia permanente foi embora
 *
 * O céu desenhava ~800 `LineSegments` retos, um por par filho→pai, reposicionados todo quadro a
 * partir de dois corpos com velocidade angular diferente (`ω ∝ r^-1.5`). Isso é o **problema do
 * enrolamento**, literalmente: a teoria de ondas de densidade (Lin–Shu) existe porque braço
 * espiral não pode ser estrutura MATERIAL — o material interno orbita mais rápido e qualquer
 * estrutura rígida se enrola em poucas rotações. Aquelas linhas cisalhavam a 60 Hz, cruzando
 * umas as outras, e é por isso que o campo de arestas nunca leu como estrutura: ele não era
 * estrutura, era o rastro de um enrolamento.
 *
 * ## O que substitui
 *
 * Nada em repouso. O vínculo aparece quando alguém PERGUNTA — cursor sobre um astro, ou câmera
 * travada nele. Isso resolve o enrolamento pela raiz: um punhado de arcos que vive segundos não
 * tem tempo de enrolar, e some antes de virar ruído.
 *
 * ## Por que ARCO e não corda
 *
 * Uma reta entre dois corpos em órbita atravessa o interior do sistema — e, com frequência, o
 * próprio buraco negro. Pior: ela afirma um caminho que não existe, porque os dois corpos não
 * estão ligados por uma barra rígida. O arco sai para FORA, acompanhando o sentido da órbita, e
 * lê como "estes dois se relacionam" em vez de "estes dois estão amarrados".
 *
 * ⚠️ E ele é RECALCULADO a cada quadro a partir das posições vivas, nunca transportado. É essa
 * diferença que o torna um PADRÃO e não uma estrutura material — a mesma distinção que faz uma
 * onda de densidade sobreviver enquanto um braço rígido se desmancha.
 *
 * ## Um desenho, duas cenas — e o que a semântica obrigou a acrescentar
 *
 * A cena AGENTE alimenta isto com contenção (pares filho→pai do `/api/graph`); a cena UNIVERSO
 * alimenta com a rede lateral do Neo4j (`/api/vizinhanca`). O desenho continua sem saber o que os
 * pares significam — ele recebe índices —, mas duas coisas **não** couberam no desenho antigo, e
 * as duas são fato, não estilo:
 *
 * - **cor por arco.** Vínculos de tipos diferentes na mesma tela precisam de vozes diferentes,
 *   senão são cinco fatos desenhados com a mesma linha (`integracao-neo4j.md` §3.2.2);
 * - **sentido por arco.** Contenção tem direção (filho→pai) e co-edição **não tem** — a seta dela
 *   é alfabética, herdada da ordenação do par. Um pulso viajante sobre relação simétrica afirmaria
 *   uma direção que ninguém mediu.
 *
 * Nenhum dos dois virou ramo: cor única é o caso em que todos os arcos recebem a mesma cor, pelo
 * mesmo caminho.
 */
import * as THREE from 'three';

/** Teto de vínculos desenhados ao mesmo tempo. Além disso vira teia de novo, em miniatura. */
const MAX_LINKS = 28;
/**
 * Pontos por arco. 20 é onde a curva para de mostrar faceta no zoom de foco — medido abrindo a
 * bancada; abaixo disso o arco lê como polilinha, que é o defeito que ele existe para evitar.
 */
const SEGMENTS = 20;
/**
 * Quanto o arco se afasta radialmente, em fração da corda. O sinal é POSITIVO (para fora):
 * puxar para dentro faria o vínculo passar por trás do núcleo, que é onde ele some.
 */
const BULGE = 0.34;
/** Segundos para o arco surgir e para sumir. Aparição instantânea lê como falha de render. */
const FADE = 0.22;

const VERTEX = /* glsl */ `
  attribute float aAlong;
  attribute vec3 aCor;
  attribute float aSentido;
  varying float vAlong;
  varying vec3 vCor;
  varying float vSentido;
  void main(){
    vAlong = aAlong;
    vCor = aCor;
    vSentido = aSentido;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  uniform float uTime;
  varying float vAlong;
  varying vec3 vCor;
  varying float vSentido;

  void main(){
    // As pontas somem: um arco que termina em aresta dura vira uma barra apontando para o
    // astro, e barra e o que se quer evitar. Desvanecer nas duas pontas deixa o vinculo
    // encostar sem tocar.
    float ends = smoothstep(0.0, 0.16, vAlong) * smoothstep(1.0, 0.84, vAlong);

    /*
     * PULSO que percorre o arco, e o SENTIDO dele e um fato, nao um enfeite.
     *
     * Desenhada estatica, toda relacao le como simetrica: "A referencia B" e "B referencia A"
     * viram a mesma linha, e a unica coisa na geometria que os distingue e o sentido do
     * movimento. Por isso o pulso viaja — e por isso ele PARA quando a relacao e mesmo simetrica.
     *
     * ⚠️ aSentido = 0 significa reciprocidade MEDIDA (co-edicao, ou vizinhanca mutua), e ali um
     * pulso viajante afirmaria uma direcao que ninguem mediu. O que fica e uma respiracao no arco
     * inteiro: presenca sem seta.
     */
    float viaja = 0.55 + 0.45 * sin((vAlong * 3.0 - uTime * 1.6 * vSentido) * 6.2831853);
    float respira = 0.62 + 0.38 * sin(uTime * 1.9 * 6.2831853 * 0.16);
    float pulse = mix(respira, viaja, abs(vSentido));
    gl_FragColor = vec4(vCor * (0.5 + pulse * 0.5), ends * uOpacity * (0.35 + pulse * 0.65));
  }
`;

export function createLinks() {
  const total = MAX_LINKS * SEGMENTS;
  const positions = new Float32Array(total * 3);
  const along = new Float32Array(total);
  const cores = new Float32Array(total * 3);
  const sentidos = new Float32Array(total);

  // `aAlong` é a posição normalizada DENTRO do arco, e ela não depende de quais nós estão
  // ligados — então é escrita uma vez, no nascimento, e nunca mais.
  for (let link = 0; link < MAX_LINKS; link++) {
    for (let i = 0; i < SEGMENTS; i++) along[link * SEGMENTS + i] = i / (SEGMENTS - 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
  /*
   * A cor é POR ARCO, e não um uniform, desde que a rede da cena UNIVERSO passou a desenhar tipos
   * diferentes de vínculo ao mesmo tempo. Cinco vínculos com a mesma voz seriam cinco fatos
   * desenhados com a mesma linha — a colisão dos três aros outra vez, agora nas arestas
   * (`integracao-neo4j.md` §3.2.2).
   *
   * O caminho de cor única não some: ele passa a ser o caso em que todo arco recebe a MESMA cor,
   * escrita no mesmo lugar. Uma via, sem ramo — o uniform teria de ser mantido em paralelo.
   */
  geometry.setAttribute('aCor', new THREE.BufferAttribute(cores, 3));
  geometry.setAttribute('aSentido', new THREE.BufferAttribute(sentidos, 1));
  /*
   * Um `drawRange` sobre UM buffer, em vez de N objetos.
   *
   * Cada arco é um `LineStrip` independente, mas criar e destruir objetos a cada hover faria
   * alocação no meio do loop de render — o custo apareceria como engasgo justamente no gesto
   * mais frequente da interface. O buffer é fixo e só a contagem muda.
   */
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  /*
   * ⚠️ `LineSegments` desenha PARES (0-1, 2-3, …); `Line` desenha uma polilinha contínua ligando
   * TODOS os vértices — inclusive o último ponto de um arco ao primeiro do seguinte, o que
   * costuraria os arcos numa única linha maluca atravessando a cena. Como os arcos vivem no
   * mesmo buffer, cada um vira um trecho próprio e a emenda é evitada duplicando os vértices
   * internos em `write`.
   */
  const object = new THREE.LineSegments(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = 1;
  object.visible = false;

  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const MID = new THREE.Vector3();
  const OUT = new THREE.Vector3();
  const P = new THREE.Vector3();

  let shown = 0;
  let opacity = 0;
  let target = 0;
  let pairs = [];

  const COR = new THREE.Color();

  /** Escreve a cor e o sentido de um arco. Só muda quando a LISTA muda, nunca por quadro. */
  function pintar(slot, hex, sentido) {
    COR.setHex(hex);
    const base = slot * SEGMENTS;
    for (let i = 0; i < SEGMENTS; i++) {
      cores[(base + i) * 3] = COR.r;
      cores[(base + i) * 3 + 1] = COR.g;
      cores[(base + i) * 3 + 2] = COR.b;
      sentidos[base + i] = sentido;
    }
  }

  /** Escreve um arco no buffer, de `a` até `b`, no slot `slot`. */
  function write(slot, positionsArray, a, b) {
    A.set(positionsArray[a * 3], positionsArray[a * 3 + 1], positionsArray[a * 3 + 2]);
    B.set(positionsArray[b * 3], positionsArray[b * 3 + 1], positionsArray[b * 3 + 2]);
    MID.copy(A).add(B).multiplyScalar(0.5);
    /*
     * Controle da Bézier: o meio empurrado para FORA do centro do sistema. Quando os dois
     * corpos estão quase alinhados com a origem o ponto médio cai perto dela e a direção
     * radial fica indefinida — aí o empurrão vai na normal do plano da órbita, que é a única
     * direção estável nesse caso.
     */
    const distance = A.distanceTo(B);
    if (MID.lengthSq() > 1e-4) OUT.copy(MID).normalize();
    else OUT.set(0, 1, 0);
    MID.addScaledVector(OUT, distance * BULGE);

    const base = slot * SEGMENTS;
    for (let i = 0; i < SEGMENTS; i++) {
      const t = i / (SEGMENTS - 1);
      const u = 1 - t;
      // Bézier quadrática: (1-t)²A + 2(1-t)t·C + t²B.
      P.copy(A).multiplyScalar(u * u)
        .addScaledVector(MID, 2 * u * t)
        .addScaledVector(B, t * t);
      positions[(base + i) * 3] = P.x;
      positions[(base + i) * 3 + 1] = P.y;
      positions[(base + i) * 3 + 2] = P.z;
    }
  }

  return {
    object,

    /**
     * Quais vínculos mostrar. Passar lista vazia (ou `null`) faz o desenho sumir por
     * desvanecimento — nunca de um quadro para o outro.
     *
     * Cada item é `[a, b]` (índices de nó) e pode trazer, no terceiro e no quarto lugar, a COR e o
     * SENTIDO daquele arco: `[a, b, 0x6fe0ff, 1]`. Sem eles vale o `colorHex` da chamada e o
     * sentido `+1`, que é o vínculo de contenção da cena AGENTE — um pai, um filho, uma direção.
     *
     * @param {Array<[number, number, number?, number?]>|null} list  pares de ÍNDICES de nó
     * @param {number} [colorHex]  cor de quem não trouxe a própria
     * @param {number} [sentidoPadrao]  +1 a→b · −1 b→a · 0 recíproco (sem seta)
     * @returns {number} quantos arcos foram ACEITOS — o teto corta o resto em silêncio, e quem
     *   escreve a legenda precisa saber onde a lista dela para. Sem isto, a legenda nomearia
     *   vínculos que a tela não desenhou no dia em que um nó passasse de `MAX_LINKS`.
     */
    show(list, colorHex = 0xffb35c, sentidoPadrao = 1) {
      pairs = (list || []).slice(0, MAX_LINKS);
      target = pairs.length ? 1 : 0;
      // A pintura acontece AQUI e não no quadro: cor e sentido são propriedade da lista, e
      // reescrevê-los 60× por segundo seria pagar por um dado que não muda.
      pairs.forEach((p, i) => pintar(i, p[2] ?? colorHex, p[3] ?? sentidoPadrao));
      if (pairs.length) {
        geometry.attributes.aCor.needsUpdate = true;
        geometry.attributes.aSentido.needsUpdate = true;
      }
      return pairs.length;
    },

    /**
     * Um quadro. As posições vêm VIVAS do grafo — é o recálculo que impede o enrolamento.
     *
     * @param {Float32Array} positionsArray  o mesmo buffer que o campo de pontos usa
     * @param {number} delta
     * @param {number} elapsed
     */
    update(positionsArray, delta, elapsed, force = 1) {
      opacity += (target - opacity) * (1 - Math.exp(-delta / FADE));
      if (opacity < 0.004 && target === 0) {
        object.visible = false;
        return;
      }
      object.visible = true;
      /*
       * ⚠️ `edgeOpacity` era slider ÓRFÃO — o painel dizia "FORÇA DO VÍNCULO" e nada lia o valor.
       *
       * Achado por auditoria de consumo: das 25 chaves do `SPEC`, esta era a única sem leitor. O
       * comentário do `tuning.js` até explicava que ela passara a governar o vínculo sob demanda
       * quando a aresta em repouso saiu — a explicação foi escrita, a ligação não. Slider que não
       * faz nada é pior que slider ausente: ele afirma um controle que não existe.
       */
      material.uniforms.uOpacity.value = opacity * force;
      material.uniforms.uTime.value = elapsed;

      if (!positionsArray || !pairs.length) return;
      for (let i = 0; i < pairs.length; i++) write(i, positionsArray, pairs[i][0], pairs[i][1]);
      shown = pairs.length;
      /*
       * `LineSegments` consome pares consecutivos, então cada trecho do arco precisa dos dois
       * extremos: em vez de reescrever o buffer inteiro em formato de pares, o `drawRange`
       * cobre os vértices do arco e a duplicação vem do índice.
       */
      geometry.setIndex(indexFor(shown));
      geometry.attributes.position.needsUpdate = true;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };

  /*
   * Índice de pares para N arcos, memoizado. Ele só depende da CONTAGEM, e a contagem muda
   * poucas vezes por sessão — recriá-lo a cada quadro seria alocação no loop de render.
   */
  function indexFor(count) {
    if (indexFor.cache?.count === count) return indexFor.cache.index;
    const list = [];
    for (let link = 0; link < count; link++) {
      const base = link * SEGMENTS;
      for (let i = 0; i < SEGMENTS - 1; i++) list.push(base + i, base + i + 1);
    }
    const index = new THREE.BufferAttribute(new Uint16Array(list), 1);
    indexFor.cache = { count, index };
    return index;
  }
}
