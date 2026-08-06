/**
 * O planeta procedural — o nível de PERTO de um corpo do céu, gerado por semente.
 *
 * De longe um arquivo indexado é um ponto num `THREE.Points` com 460 irmãos, e tem de continuar
 * sendo: o campo inteiro custa 0,45 ms de GPU (medido, `EXT_disjoint_timer_query_webgl2`, Apple
 * M5 a 3024×1484 DPR 2) e 460 malhas de esfera com ruído por fragmento não cabem nesse
 * orçamento nem perto. O que cabe é UM planeta — o do astro em que a câmera travou.
 *
 * Por isso este módulo segue a mesma regra dos anéis: **nível de detalhe por tamanho na TELA**.
 * Abaixo de `LOD_FAR_PX` ele não existe (nem geometria, nem material, nem textura — o `build` é
 * preguiçoso, como a rocha do anel em `ring-rock.js`); entre as duas marcas ele entra por rampa,
 * ganhando oitavas de ruído e opacidade juntas.
 *
 * ## Custo
 *
 * **NÃO MEDIDO.** Não há navegador nesta sessão, então `window.espatial.renderCost()` não foi
 * executado — e ele não teria o que medir, porque o módulo ainda não está ligado ao `scene.js`.
 * O que dá para afirmar é a conta: o fragmento avalia `terrainHeight` três vezes (a altura e as
 * duas amostras deslocadas que reconstroem a normal), cada uma com até 8 oitavas de simplex 3D,
 * mais 3 oitavas da nuvem — ~27 avaliações de ruído por pixel coberto. É a mesma ordem de
 * grandeza da referência, que roda a tela cheia a 60 FPS num desktop. Isso é ARITMÉTICA, não
 * medida; quem ligar o módulo à cena mede e substitui esta seção pelo número.
 *
 * ## De onde vem a cara do planeta
 *
 * As duas regras do catálogo governam, e não é decoração:
 *
 * > **Massa decide a CLASSE. Composição decide o TIPO.**
 *
 * - `chunks` é a MASSA → decide relevo, mar e atmosfera. E na direção certa: corpo pequeno é
 *   irregular e cristado (Vesta, Fobos), corpo grande é liso, tem mais água e SEGURA atmosfera —
 *   um corpo de pouca massa não tem velocidade de escape para reter gás. São três consequências
 *   de uma variável só, todas com análogo real.
 * - `kind` é a COMPOSIÇÃO → decide a paleta, derivada de `KIND_COLORS` (ver `planet-palette.js`).
 *   Um ponto verde não pode virar um mundo azul ao aproximar a câmera.
 *
 * ## A semente sai do CAMINHO, nunca do índice
 *
 * Pelo mesmo motivo que a casca da supernova em `graph.js:370`: o índice muda quando o corpus
 * ganha ou perde um arquivo, e o planeta trocaria de continente sem que nada tivesse acontecido
 * com ele. `hash01(node.source, salt)` é estável entre sessões e entre máquinas.
 *
 * ## Duas referências, e o que veio de cada uma
 *
 * **`dgreenheck/threejs-procedural-planets`** deu o TERRENO: esfera unitária com simplex 3D
 * amostrado em `position` — sem costura, porque o campo nunca vê a parametrização
 * (`index.html:194`) —, deslocamento no vértice e normal de relevo reconstruída no fragmento por
 * diferença de altura ao longo da tangente (`index.html:264-295`). É essa última que dá detalhe
 * muito abaixo da resolução da malha, e é a técnica que valia copiar.
 *
 * **`webgpu_tsl_earth`, exemplo oficial do three.js**, deu a COMPOSIÇÃO — e ela contradiz a
 * primeira referência em três pontos, todos adotados aqui:
 *
 * | Camada | Como fizemos | Por quê |
 * |---|---|---|
 * | atmosfera | casca em `BackSide` com Fresnel remapeado | só a coroa FORA da silhueta acende; a parte de dentro é ocluída pelo teste de profundidade, não por um truque |
 * | limbo | a cor do céu entra na PRÓPRIA superfície por `fresnel²` | sem isso o planeta é uma bola com um halo colado em volta, e lê como duas coisas |
 * | terminador | mistura para a cor do CREPÚSCULO por `dot(N,L)` | é a única pista de que existe ar; um terminador que só escurece lê como pedra |
 *
 * ⚠️ O exemplo do three.js é **WebGPU/TSL** e esta página é WebGL2 com GLSL puro e sem build.
 * Nada dele é portável como código — o que atravessou foi a receita, reescrita à mão.
 *
 * O que **não** foi adotado da primeira referência: a atmosfera de 4.000 `Points` com
 * `cloud.png` (binário, e 4.000 quads transparentes por planeta), os treze uniformes de cor
 * (viraram uma rampa em textura) e o `int octaves` uniforme no laço.
 */
import * as THREE from 'three';
import { hash01 } from './graph.js';
import { GLSL_SIMPLEX3, GLSL_TERRAIN } from './planet-noise.js';
import { planetPalette, rampTexture, skyColor, TWILIGHT, WET_EDGE } from './planet-palette.js';
import * as motion from '../core/motion.js';
import { MOTION } from './motion-catalog.js';

const SPIN = MOTION.spin;

/*
 * Faixa de transição do nível de detalhe, em pixels de RAIO na tela.
 *
 * 90 é medido no sentido de que é a marca em que `rings.js` considera a câmera travada num
 * astro (`LOD_NEAR_PX`) — abaixo dela nem o anel mostra rocha, então um planeta com biomas
 * seria detalhe que ninguém consegue ver. 200 é PALPITE: é onde o astro passa a ocupar um
 * quarto da altura de uma tela de 1500px, e não foi calibrado olhando.
 */
export const LOD_FAR_PX = 90;
export const LOD_NEAR_PX = 200;

/*
 * Segmentos da esfera. A referência usa 128×128; 96 basta porque a malha aqui responde só pela
 * SILHUETA — o relevo que se vê na superfície vem da normal reconstruída no fragmento, não dos
 * vértices. 97×97 = 9.409 vértices, ~18k triângulos, um objeto só na cena.
 */
const SEGMENTS = 96;
/*
 * Deslocamento das duas amostras que reconstroem a normal, em unidades da esfera unitária.
 * 0,001 vem da referência (`index.html:31`) e não foi re-derivado. Menor que isso, a diferença
 * de altura afunda no erro de ponto flutuante e a normal vira ruído.
 */
const BUMP_OFFSET = 0.0012;
const BUMP_STRENGTH = 0.92;

const AMBIENT = 0.055;
const DIFFUSE = 1.15;
const SPECULAR = 1.6;
const SHININESS = 12;

/** Folga da casca de atmosfera acima do pico mais alto, em raios do corpo. */
const SHELL_MARGIN = 0.035;

/*
 * Régua da massa. `graph.js:360` já usa `log2(1 + chunks)` para o tamanho do ponto; 8 é o topo
 * porque o maior arquivo citado em `docs/catalogo-celeste.md` tem 226 chunks e log2(227)≈7,8.
 * É calibragem por um único caso, não estatística do corpus — PALPITE com âncora.
 */
const MASS_LOG_FULL = 8;

/* Vetores de rascunho: a conversão para o espaço do objeto acontece a cada quadro. */
const OBJ_CAM = new THREE.Vector3();
const OBJ_LIGHT = new THREE.Vector3();
const INVERSE = new THREE.Matrix4();

const SURFACE_VERTEX = /* glsl */ `
  attribute vec4 tangent;

  uniform float uAmplitude, uSharpness, uSea;
  uniform float uPeriod, uPersistence, uLacunarity, uDetail, uRidged;

  varying vec3 vSphere;
  varying vec3 vNormal;
  varying vec3 vTangent;
  varying vec3 vBitangent;

  ${GLSL_SIMPLEX3}
  ${GLSL_TERRAIN}

  void main(){
    // A geometria e uma esfera de raio 1: position JA e o ponto do dominio do ruido.
    float h = terrainHeight(
      position, uAmplitude, uSharpness, uSea,
      uPeriod, uPersistence, uLacunarity, uDetail, uRidged
    );
    vSphere = position;
    vNormal = normal;
    vTangent = tangent.xyz;
    // O w do atributo carrega a lateralidade; sem ele a normal de relevo inverte em metade
    // da esfera e o terreno fica iluminado ao contrario de um lado.
    vBitangent = cross(normal, tangent.xyz) * tangent.w;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position * (1.0 + h), 1.0);
  }
`;

/*
 * A ILUMINACAO ACONTECE NO ESPACO DO OBJETO, e isso e uma decisao, nao um descuido.
 *
 * O planeta gira (rotacao propria e inclinacao do eixo), entao o espaco do objeto NAO e o do
 * mundo. A alternativa seria transformar a normal para o mundo por fragmento; em vez disso a
 * camera e a luz sao trazidas para o espaco do objeto uma vez por quadro, na CPU. Duas
 * multiplicacoes de vetor contra uma matriz por pixel.
 *
 * A consequencia importante: uLight e uCam TEM de ser reescritos sempre que o planeta gira. Se
 * congelarem, o terminador gira junto com a superficie e o planeta parece iluminado por dentro.
 *
 * ## Duas normais, dois papeis
 *
 * A normal com RELEVO (bumped) responde pela luz difusa — e ela que faz a montanha aparecer. A
 * normal GEOMETRICA responde pelo Fresnel e pela orientacao em relacao a luz. Usar a com relevo
 * no Fresnel poria a cor do ceu piscando pedra a pedra no limbo, que e ruido, nao atmosfera.
 */
const SURFACE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform sampler2D uRamp;
  uniform float uAmplitude, uSharpness, uSea;
  uniform float uPeriod, uPersistence, uLacunarity, uDetail, uRidged;
  uniform float uScale, uBump, uBumpStrength, uWet, uFade;
  uniform float uAmount, uCloudPeriod;
  uniform vec2 uSpin;
  uniform vec3 uLight, uCam, uSky, uTwilight;

  varying vec3 vSphere;
  varying vec3 vNormal;
  varying vec3 vTangent;
  varying vec3 vBitangent;

  ${GLSL_SIMPLEX3}
  ${GLSL_TERRAIN}

  void main(){
    float h = terrainHeight(
      vSphere, uAmplitude, uSharpness, uSea,
      uPeriod, uPersistence, uLacunarity, uDetail, uRidged
    );

    // Duas amostras deslocadas no plano tangente. A normal sai da geometria DESLOCADA, nao de
    // uma derivada do campo: e o que faz o relevo aparecer muito abaixo da resolucao da malha.
    vec3 dx = uBump * normalize(vTangent);
    vec3 dy = uBump * normalize(vBitangent);
    float hx = terrainHeight(
      vSphere + dx, uAmplitude, uSharpness, uSea,
      uPeriod, uPersistence, uLacunarity, uDetail, uRidged
    );
    float hy = terrainHeight(
      vSphere + dy, uAmplitude, uSharpness, uSea,
      uPeriod, uPersistence, uLacunarity, uDetail, uRidged
    );

    vec3 p = vSphere * (1.0 + h);
    vec3 bumped = normalize(cross(
      (vSphere + dx) * (1.0 + hx) - p,
      (vSphere + dy) * (1.0 + hy) - p
    ));
    vec3 Ng = normalize(vNormal);
    vec3 N = normalize(mix(Ng, bumped, uBumpStrength));
    vec3 L = normalize(uLight);
    vec3 V = normalize(uCam - p);

    // Altura NORMALIZADA: a rampa de biomas nao pode andar quando a massa muda o relevo.
    float t = clamp(h / uScale, 0.0, 1.0);
    vec3 albedo = texture2D(uRamp, vec2(t, 0.5)).rgb;

    // NUVEM: mesmo fbm, direcao GIRADA por conta propria. Ela mora na superficie e nao na casca
    // porque nuvem esta dentro da atmosfera, nao em volta dela — na casca ela apareceria como
    // um anel de neblina no limbo em vez de uma cobertura sobre o continente.
    vec3 d = vec3(
      vSphere.x * uSpin.x - vSphere.z * uSpin.y,
      vSphere.y,
      vSphere.x * uSpin.y + vSphere.z * uSpin.x
    );
    float cover = smoothstep(0.05, 0.5, fbm3(d, uCloudPeriod, 0.55, 2.1, 3.0)) * uAmount;
    albedo = mix(albedo, vec3(1.0), cover);

    float diffuse = ${DIFFUSE.toFixed(3)} * max(0.0, dot(N, L));
    // Rocha nao espelha, e nuvem tampa. O especular so existe ate a linha de costa, e e ele que
    // separa "azul porque e fundo de vale" de "azul porque e agua".
    float wet = (1.0 - smoothstep(uWet * 0.55, uWet, t)) * (1.0 - cover);
    float specular = ${SPECULAR.toFixed(3)} * wet
      * pow(max(0.0, dot(V, reflect(-L, N))), ${SHININESS.toFixed(1)});

    vec3 color = albedo * (${AMBIENT.toFixed(3)} + diffuse) + vec3(0.86, 0.92, 1.0) * specular;

    // A cor do ar entra na PROPRIA superficie, com peso Fresnel: e o que costura o planeta a
    // coroa da casca. Sem isto, o halo lida como adesivo colado em volta de uma bola.
    float sunOrient = dot(Ng, L);
    float fres = 1.0 - abs(dot(V, Ng));
    vec3 air = mix(uTwilight, uSky, smoothstep(-0.25, 0.75, sunOrient));
    float airMix = clamp(smoothstep(-0.5, 1.0, sunOrient) * fres * fres, 0.0, 1.0) * uAmount;
    color = mix(color, air, airMix);

    gl_FragColor = vec4(color * uFade, uFade);
  }
`;

const SHELL_VERTEX = /* glsl */ `
  uniform float uShell;
  varying vec3 vDir;
  varying vec3 vPos;

  void main(){
    vDir = normalize(position);
    vPos = position * uShell;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(vPos, 1.0);
  }
`;

/*
 * A ATMOSFERA E UMA CASCA EM BackSide, NAO UM CAMPO DE PARTICULAS.
 *
 * A primeira referencia monta 4.000 THREE.Points com uma textura de nuvem (public/cloud.png)
 * espalhados numa concha. Duas coisas impedem de copiar isso: o binario (toda textura deste
 * projeto nasce em codigo) e o custo — 4.000 quads transparentes sobrepostos, POR PLANETA, num
 * quadro cuja cena inteira custa 0,45 ms.
 *
 * O exemplo oficial do three.js resolve com um desenho so, e o truque esta no BackSide:
 * desenhando as faces de TRAS de uma esfera um pouco maior, o miolo do disco fica atras do
 * planeta e o teste de profundidade o descarta sozinho. Sobra exatamente o anel de fora da
 * silhueta — que e onde a linha de visada atravessa mais gas, e por isso e onde a atmosfera
 * aparece de verdade.
 *
 * uRimEdge nao e constante: ele e o Fresnel EXATO no limbo do planeta, e depende de quanto a
 * casca e maior que o corpo. O exemplo cravou 0.73 porque la a escala e fixa em 1.04; aqui o
 * relevo muda com a massa, entao a casca muda de raio e o numero tem de ser derivado.
 */
const SHELL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3 uLight, uCam, uSky, uTwilight;
  uniform float uAmount, uRimEdge, uFade;

  varying vec3 vDir;
  varying vec3 vPos;

  void main(){
    vec3 Ng = normalize(vDir);
    vec3 V = normalize(uCam - vPos);
    float fres = 1.0 - abs(dot(V, Ng));
    float sunOrient = dot(Ng, normalize(uLight));

    // 1 no limbo do planeta, 0 na borda externa da casca. Ao cubo: a coroa cai rapido, que e
    // como uma coluna de ar se comporta com a altitude.
    float rim = clamp(1.0 - (fres - uRimEdge) / max(1.0 - uRimEdge, 0.001), 0.0, 1.0);
    float alpha = pow(rim, 3.0) * smoothstep(-0.5, 1.0, sunOrient) * uAmount * uFade;
    if (alpha < 0.004) discard;

    vec3 air = mix(uTwilight, uSky, smoothstep(-0.25, 0.75, sunOrient));
    gl_FragColor = vec4(air, alpha);
  }
`;

/**
 * Tudo que define a cara de um planeta, derivado do nó. Puro e determinístico.
 *
 * Separado de `createPlanet` de propósito: assim a BANCADA pode pegar o resultado e sobrescrever
 * um campo (`{ ...planetParams(node), amplitude: x }`) sem reimplementar a derivação — que é
 * exatamente o que uma bancada não pode fazer, sob pena de mentir na primeira divergência.
 *
 * @param {{source?: string, id?: string, kind?: string, chunks?: number}} node
 * @returns {Readonly<object>}
 */
export function planetParams(node = {}) {
  const path = node.source ?? node.id ?? 'sem-caminho';
  const seed = hash01(path, 11);
  const seedB = hash01(path, 23);
  const seedC = hash01(path, 41);
  const chunks = Number.isFinite(node.chunks) ? node.chunks : 1;
  const mass = THREE.MathUtils.clamp(Math.log2(1 + chunks) / MASS_LOG_FULL, 0, 1);

  /*
   * O relevo é EXAGERADO, e o exagero é o ponto.
   *
   * O Everest é 0,14% do raio da Terra: em escala real um planeta é uma bola de bilhar e não
   * haveria o que ver. A régua aqui é legibilidade. O que se preserva é a RAZÃO — corpo leve
   * com relevo relativo maior, que é o fato físico (a montanha máxima cai com a gravidade, e é
   * por isso que Vesta é amassada e a Terra é lisa).
   */
  const amplitude = THREE.MathUtils.lerp(0.115, 0.038, mass) * (0.82 + seed * 0.36);
  // Mais massa segura mais volátil: mais água, e menos terreno exposto.
  const sea = amplitude * THREE.MathUtils.lerp(0.1, 0.5, mass) * (0.55 + seedB * 0.9);
  const palette = planetPalette(node.kind ?? 'other', seed);

  return Object.freeze({
    seed,
    mass,
    amplitude,
    sea,
    // Corpo leve não arredonda: o relevo cristado (`1 - |ruído|`) é a assinatura dele.
    ridged: THREE.MathUtils.clamp(1.12 - mass * 1.45, 0, 1),
    sharpness: 1.7 + seed * 1.5,
    // Tamanho da feição maior, em unidades da esfera unitária. 0,45–0,85 dá de três a seis
    // massas continentais — abaixo disso o planeta vira mármore, acima vira dois hemisférios.
    period: 0.45 + seedB * 0.4,
    persistence: 0.44 + seedC * 0.12,
    lacunarity: 1.75 + seed * 0.35,
    /*
     * Atmosfera por velocidade de escape: abaixo de certa massa o corpo não retém gás nenhum.
     * A transição é suave porque a retenção depende também da temperatura, e o corte duro
     * afirmaria uma fronteira que a física não tem.
     */
    atmosphere: THREE.MathUtils.smoothstep(mass, 0.24, 0.68) * (0.6 + seedC * 0.7),
    // Retrógrado é possível — Vênus e Urano giram ao contrário, e um céu em que todo mundo gira
    // para o mesmo lado lê como carimbo. A largura da faixa e a fatia retrógrada vêm do
    // `motion-catalog.js`; a assimetria entre os dois sentidos está documentada lá.
    spin: (seedB - SPIN.retrograde) * SPIN.span,
    tilt: (seedC - 0.5) * 0.9,
    palette,
    sky: skyColor(palette),
    twilight: new THREE.Color(TWILIGHT),
    /** Direção da luz em coordenadas de MUNDO. Na cena tem de apontar para o núcleo. */
    light: [0.62, 0.48, 0.62],
  });
}

/**
 * O planeta. `{ object, update, dispose }`, como os outros módulos da cena.
 *
 * Nada é construído no `createPlanet`: geometria, materiais e rampa nascem no primeiro quadro
 * em que o astro cruza `LOD_FAR_PX`. Um planeta que ninguém chegou perto o bastante para ver
 * não custa um byte — a mesma disciplina da textura de rocha do anel.
 */
export function createPlanet() {
  const group = new THREE.Group();
  const spinner = new THREE.Group();
  group.add(spinner);

  let geometry = null;
  let surface = null;
  let shell = null;
  let ramp = null;
  // Chave da paleta em uso. A rampa são 512 bytes, mas reconstruí-la por quadro seria upload de
  // textura por quadro — e o nó focado troca com o clique, não com o quadro.
  let rampKey = null;

  function build() {
    geometry = new THREE.SphereGeometry(1, SEGMENTS, SEGMENTS);
    // Obrigatório: o fragmento reconstrói a normal do relevo ao longo da tangente, e sem este
    // atributo o `tangent` do shader chega zerado — a superfície fica chapada e a única pista
    // é o console.
    geometry.computeTangents();

    surface = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: {
          uRamp: { value: null },
          uAmplitude: { value: 0.08 },
          uSharpness: { value: 2.2 },
          uSea: { value: 0.02 },
          uPeriod: { value: 0.6 },
          uPersistence: { value: 0.48 },
          uLacunarity: { value: 1.9 },
          uDetail: { value: 8 },
          uRidged: { value: 0 },
          uScale: { value: 0.06 },
          uBump: { value: BUMP_OFFSET },
          uBumpStrength: { value: BUMP_STRENGTH },
          uWet: { value: WET_EDGE },
          uAmount: { value: 0 },
          uCloudPeriod: { value: 0.3 },
          uSpin: { value: new THREE.Vector2(1, 0) },
          uFade: { value: 0 },
          uLight: { value: new THREE.Vector3(1, 1, 1) },
          uCam: { value: new THREE.Vector3(0, 0, 1) },
          uSky: { value: new THREE.Color(0x4db2ff) },
          uTwilight: { value: new THREE.Color(TWILIGHT) },
        },
        vertexShader: SURFACE_VERTEX,
        fragmentShader: SURFACE_FRAGMENT,
        // Transparente pela entrada em rampa, mas ESCREVENDO profundidade: é o que faz o miolo
        // da casca de atmosfera ser descartado pelo teste de profundidade em vez de por um
        // truque no shader.
        transparent: true,
        depthWrite: true,
      })
    );

    shell = new THREE.Mesh(
      // A casca não precisa da resolução da superfície: ela não é deslocada, é uma esfera lisa.
      new THREE.SphereGeometry(1, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: {
          uLight: { value: new THREE.Vector3(1, 1, 1) },
          uCam: { value: new THREE.Vector3(0, 0, 1) },
          uSky: { value: new THREE.Color(0x4db2ff) },
          uTwilight: { value: new THREE.Color(TWILIGHT) },
          uAmount: { value: 0 },
          uRimEdge: { value: 0.73 },
          uShell: { value: 1.05 },
          uFade: { value: 0 },
        },
        vertexShader: SHELL_VERTEX,
        fragmentShader: SHELL_FRAGMENT,
        transparent: true,
        // Gás iluminado SOMA luz. Com blending normal o limbo escureceria o fundo, que é o
        // oposto do que uma atmosfera faz contra o céu escuro.
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
      })
    );
    shell.renderOrder = 1;

    spinner.add(surface, shell);
  }

  return {
    object: group,

    /**
     * Um quadro do planeta. Devolve o nível de detalhe resolvido (0 = invisível, 1 = cheio).
     *
     * @param {object} params  saída de `planetParams`, possivelmente com campos sobrescritos
     * @param {THREE.Camera} camera
     * @param {number} px      raio APARENTE do astro, em pixels — quem decide o nível de detalhe
     * @param {number} elapsed relógio da cena, em segundos
     */
    update(params, camera, px, elapsed = 0) {
      const near = THREE.MathUtils.smoothstep(px, LOD_FAR_PX, LOD_NEAR_PX);
      if (near <= 0.001) {
        group.visible = false;
        return 0;
      }
      if (!surface) build();
      group.visible = true;

      /*
       * `spin` declara `reduced: 'freeze'` no catálogo, e agora obedece.
       *
       * O planeta congela virado para um lado só — o que ele perde é a rotação, não a inclinação
       * nem o terminador, que continuam dizendo onde é dia e onde é noite. Parar o RELÓGIO em vez
       * de zerar `params.spin` mantém a nuvem congelada junto com a crosta: as duas leem o mesmo
       * tempo, e travar só uma faria a atmosfera deslizar sobre um planeta parado.
       */
      const clock = motion.isReduced() ? 0 : elapsed;
      spinner.rotation.set(params.tilt, clock * params.spin, 0);
      // Depois do `rotation.set`, nunca antes: a matriz que converte câmera e luz para o espaço
      // do objeto tem de ser a DESTE quadro. Um quadro de atraso aqui aparece como o terminador
      // arrastando atrás da superfície.
      spinner.updateWorldMatrix(true, false);
      INVERSE.copy(spinner.matrixWorld).invert();
      OBJ_CAM.copy(camera.position).applyMatrix4(INVERSE);
      OBJ_LIGHT.set(params.light[0], params.light[1], params.light[2]).transformDirection(INVERSE);

      const key = `${params.seed}:${params.palette[0].getHex()}`;
      if (key !== rampKey) {
        ramp?.dispose();
        ramp = rampTexture(params.palette);
        rampKey = key;
        surface.material.uniforms.uRamp.value = ramp;
      }

      // A altura útil é o que sobra do relevo depois do mar. Casca e rampa saem os dois daqui —
      // divergir move a linha de costa ou faz a montanha furar a atmosfera.
      const relief = Math.max(params.amplitude - params.sea, 1e-4);
      const shellRadius = 1 + relief + SHELL_MARGIN;
      // Nuvem gira ~3× a superfície: é o que a separa de uma textura pintada no planeta. Mesmo
      // `clock` da crosta — ver o `rotation.set` acima.
      const cloudAngle = clock * params.spin * SPIN.cloudFactor;

      const u = surface.material.uniforms;
      u.uAmplitude.value = params.amplitude;
      u.uSharpness.value = params.sharpness;
      u.uSea.value = params.sea;
      u.uPeriod.value = params.period;
      u.uPersistence.value = params.persistence;
      u.uLacunarity.value = params.lacunarity;
      u.uRidged.value = params.ridged;
      u.uScale.value = relief;
      /*
       * As oitavas ENTRAM com o nível de detalhe, em vez de aparecer todas de uma vez.
       *
       * Três oitavas dão a silhueta e os continentes, que é tudo que se distingue quando o astro
       * tem 90px. As cinco finas só ligam quando há pixel para elas — e o `break` do `fbm3`
       * torna isso economia de verdade, não só suavização.
       */
      u.uDetail.value = 3 + near * 5;
      u.uAmount.value = params.atmosphere;
      u.uSpin.value.set(Math.cos(cloudAngle), Math.sin(cloudAngle));
      u.uFade.value = near;
      u.uLight.value.copy(OBJ_LIGHT);
      u.uCam.value.copy(OBJ_CAM);
      u.uSky.value.copy(params.sky);
      u.uTwilight.value.copy(params.twilight);

      const s = shell.material.uniforms;
      s.uAmount.value = params.atmosphere;
      s.uFade.value = near;
      s.uShell.value = shellRadius;
      /*
       * O Fresnel EXATO na altura do limbo do planeta.
       *
       * Num ponto da casca à distância radial r do centro na tela, a face de trás faz
       * `|N·V| = sqrt(1 - (r/R)²)` com R o raio da casca. No limbo do corpo (r = 1) isso dá o
       * valor abaixo — e é dele para fora que existe coroa. Cravar 0,73 (como o exemplo do
       * three.js, cuja casca é sempre 1,04) faria a coroa vazar para dentro do planeta ou sumir,
       * conforme o relevo daquele corpo.
       */
      s.uRimEdge.value = 1 - Math.sqrt(Math.max(1 - 1 / (shellRadius * shellRadius), 0));
      s.uLight.value.copy(OBJ_LIGHT);
      s.uCam.value.copy(OBJ_CAM);
      s.uSky.value.copy(params.sky);
      s.uTwilight.value.copy(params.twilight);
      shell.visible = params.atmosphere > 0.004;

      return near;
    },

    dispose() {
      if (!surface) return;
      spinner.remove(surface, shell);
      surface.material.dispose();
      shell.geometry.dispose();
      shell.material.dispose();
      geometry.dispose();
      ramp?.dispose();
      surface = shell = geometry = ramp = null;
      rampKey = null;
    },
  };
}
