/**
 * O buraco negro — o núcleo cognitivo, e a única metáfora do sistema.
 *
 * Composto de quatro peças que juntas dão o visual da referência:
 *
 * 1. `horizon` — esfera pura preta. Não recebe luz nenhuma; ela existe para *ocluir*.
 * 2. `disk` — anel equatorial com shader: fluxo kepleriano (ω ∝ r^-1.5), filamentos por
 *    fbm alongado em θ, e rampa de temperatura do branco interno ao vermelho externo.
 *
 * NÃO existe plano de halo. Havia um, encarando a câmera e centrado na origem — metade dele
 * caía na frente da esfera e, sendo aditivo, lavava o horizonte de âmbar. Onde a esfera
 * ocultava as estrelas sobrava névoa-sem-estrela, e o resultado era um domo com silhueta
 * visível: exatamente o que um horizonte de eventos não pode ter. O bloom sobre o disco
 * largo dá a mesma névoa sem tocar no preto.
 *
 * A assinatura do Interstellar (o lado de trás do disco curvado por cima do horizonte) NÃO
 * é geometria: um disco visto de perfil já projeta o lado distante acima do centro na tela,
 * e o passe de lente em screen-space termina de curvá-lo. Tentar montar isso com anéis
 * perpendiculares produz uma gota/triângulo — foi o que aconteceu na primeira versão.
 *
 * A respiração é uma única fonte de verdade (`pulse`) usada por todas as peças: escala,
 * intensidade e velocidade angular saem dela. Sem isso, cada peça respiraria no seu ritmo e
 * o conjunto pareceria montado em vez de vivo.
 */
import * as THREE from 'three';

// Regimes cognitivos → parâmetros físicos. O buraco negro não "fica animado": ele muda de
// regime, e o regime é o estado real do agente.
export const REGIMES = {
  boot: { spin: 0.05, intensity: 0.25, turbulence: 0.4, breath: 0.02 },
  idle: { spin: 0.18, intensity: 0.75, turbulence: 0.6, breath: 0.035 },
  thinking: { spin: 0.85, intensity: 1.25, turbulence: 1.5, breath: 0.06 },
  retrieving: { spin: 0.6, intensity: 1.1, turbulence: 1.1, breath: 0.05 },
  searching: { spin: 0.7, intensity: 1.0, turbulence: 1.3, breath: 0.055 },
  answering: { spin: 1.15, intensity: 1.6, turbulence: 1.0, breath: 0.045 },
  error: { spin: 0.12, intensity: 0.5, turbulence: 2.6, breath: 0.1 },
};

export const HORIZON_RADIUS = 3.0;
/*
 * ⚠️ `HORIZON_RADIUS` é o raio da SOMBRA aparente, não o do horizonte geométrico.
 *
 * Para Schwarzschild a sombra tem raio √27/2 ≈ 2.6 R_s: luz com parâmetro de impacto abaixo
 * disso é capturada. E a ISCO, em 3 R_s, tem imagem aparente em 3/√(1−1/3) = 3.67 R_s — logo a
 * borda interna do disco aparece a **1.41× o raio da sombra**, não a 1.08. Pôr o disco em 1.08
 * o colocava onde não há órbita nenhuma, e era daí que vinham os crescentes desenhando por cima
 * do horizonte.
 */
const DISK_INNER = HORIZON_RADIUS * 1.41;
const DISK_OUTER = HORIZON_RADIUS * 13.0;
// Taxa de convergência do regime, em 1/s — NÃO fração por quadro. A transição entre
// regimes cognitivos tem que levar o mesmo tempo a 30 ou a 144fps, e um quadro longo não
// pode virar um salto de intensidade no disco.
const REGIME_RATE = 2.4;
/** Temporário do `geometry()`. Reusado para não alocar um Vector3 por quadro. */
const CENTRO = new THREE.Vector3();

const NOISE = /* glsl */ `
  // Hash e fbm baratos: o disco pede filamento, não realismo de ruído. Três oitavas
  // bastam porque o alongamento em θ já cria a aparência de fluxo laminar.
  vec2 hash2(vec2 p){
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453) * 2.0 - 1.0;
  }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(dot(hash2(i + vec2(0,0)), f - vec2(0,0)), dot(hash2(i + vec2(1,0)), f - vec2(1,0)), u.x),
      mix(dot(hash2(i + vec2(0,1)), f - vec2(0,1)), dot(hash2(i + vec2(1,1)), f - vec2(1,1)), u.x),
      u.y);
  }
  float fbm(vec2 p){
    float sum = 0.0, amp = 0.5;
    for (int i = 0; i < 3; i++) { sum += amp * noise(p); p *= 2.17; amp *= 0.5; }
    return sum;
  }
`;

const DISK_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vLocal;
  void main(){
    vUv = uv;
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DISK_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime, uSpin, uIntensity, uTurbulence, uInner, uOuter, uErrorMix, uViewAz, uViewInPlane;
  uniform vec3 uHot, uMid, uCool;
  uniform float uHeight, uWeight, uCheap;
  varying vec3 vLocal;
  ${NOISE}

  /*
   * SEGUNDOS ate o campo de filamentos se refazer, e o GANHO do cisalhamento diferencial.
   *
   * O ciclo tem de ser longo o bastante para o cisalhamento desenhar espiral e curto o bastante
   * para ele nao virar cabelo. Com o ganho em 0,18 a borda interna anda ~1,8 unidades de ruido
   * por segundo contra a externa, entao em meio ciclo (1,4 s) ela acumula ~2,5 feicoes de
   * defasagem: espiral visivel, e nenhuma feicao sobrevive tempo suficiente para enrolar.
   *
   * O ganho ataca SO a parte diferencial. O giro de conjunto continua com o coeficiente cheio,
   * entao o disco gira tao rapido quanto antes — o que mudou e so quanto ele TORCE.
   */
  const float SHEAR_CYCLE = 2.8;
  const float SHEAR_GAIN = 0.18;

  // Uma amostra do campo de filamentos. Extraida em funcao porque agora ela e chamada DUAS vezes,
  // com fases de cisalhamento diferentes — ver a mistura no corpo principal.
  float striacao(float flow, float radial){
    vec2 filament = vec2(flow * 2.4, radial);
    return fbm(filament * vec2(1.0, 2.6)) * 0.5 + 0.5;
  }

  void main(){
    // RingGeometry é gerada no plano XY (z=0) e só depois o mesh é rotacionado — então o
    // raio e o ângulo do disco saem de xy, não de xz. Ler o par errado não dá erro de
    // compilação: devolve radius=|x| e theta≈0, e o disco simplesmente não aparece.
    // (Sem backtick neste comentário: ele vive dentro de um template literal.)
    float radius = length(vLocal.xy);
    float span = clamp((radius - uInner) / (uOuter - uInner), 0.0, 1.0);
    float theta = atan(vLocal.y, vLocal.x);

    // Rotação diferencial: a borda interna gira muito mais rápido que a externa. É o que
    // impede o disco de parecer uma textura girando rígida.
    float keplerian = pow(max(radius / uInner, 0.35), -1.5);

    /*
     * ⚠️ O CISALHAMENTO NAO PODE ACUMULAR SEM FIM — e era isso que estava acontecendo.
     *
     * A conta era flow = theta + uTime * uSpin * keplerian * 6.0. O termo kepleriano varia de
     * ~0,3 na borda externa a 4,83 na interna, entao a DIFERENCA de fase entre as duas bordas
     * cresce linearmente com o relogio e nunca para. Medido: com uSpin de repouso (0,18) a fase
     * diferencial anda ~11,7 unidades de ruido por segundo. Depois de um minuto de cena as duas
     * bordas estao 700 feicoes fora de fase — o campo enrolou em centenas de fios finos, e o
     * disco perde a camada de densidade e vira estriado.
     *
     * E o defeito nao e novo: e o ENROLAMENTO de Lin-Shu, o mesmo que matou o campo de arestas e
     * que MOTION.patternSpin existe para impedir ("padrao que gira sem transportar materia"). O
     * disco do buraco negro nunca passou por aquele catalogo, entao repetiu o erro sozinho.
     *
     * A correcao e a que a fisica manda: turbulencia de disco de acrecao NAO enrola para sempre —
     * a magnetorrotacao regenera a estrutura continuamente, e os filamentos nascem, cisalham e
     * sao substituidos. Duas copias do campo, defasadas de meio ciclo, misturadas por peso
     * triangular: cada uma so vive meio ciclo, entao o cisalhamento e limitado por construcao.
     * Nenhuma das duas some — quando uma nasce a outra esta no pico, e a soma nunca pisca.
     */
    float giro = theta + uTime * uSpin * 6.0;
    // rad/s de cisalhamento DIFERENCIAL, ja atenuado: o giro de conjunto continua rapido (e o
    // que da a sensacao de rotacao), so a parte que enrola anda devagar.
    float taxa = (keplerian - 1.0) * uSpin * 6.0 * SHEAR_GAIN;

    float fase = fract(uTime / SHEAR_CYCLE);
    // Peso triangular: 0 no meio da vida da copia A, 1 quando ela reinicia — e nesse instante a
    // copia B esta no proprio meio. A troca acontece onde a copia que sai vale zero.
    float peso = abs(fase * 2.0 - 1.0);
    float localA = (fase - 0.5) * SHEAR_CYCLE;
    float localB = (fract(uTime / SHEAR_CYCLE + 0.5) - 0.5) * SHEAR_CYCLE;

    /*
     * uHeight descorrelaciona a FATIA: sem ele as copias empilhadas mostrariam o mesmo campo
     * deslocado em y, e a pilha leria como um decalque repetido em vez de volume.
     */
    float radialDrift = span * 9.0 - uTime * uSpin * 0.35 + uHeight * 31.0;
    /*
     * FORA DO PLANO MEDIO nao ha amostragem de ruido, e isso e fisica antes de ser economia: a
     * altura de escala e sustentada por pressao, e o gas la em cima e rarefeito e liso. A
     * estrutura filamentar vive no plano medio, que e onde a densidade esta.
     *
     * uCheap = 1 devolve uma constante e o compilador poda as duas chamadas de fbm da fatia.
     */
    float striation = uCheap > 0.5 ? 0.72 : mix(
      striacao(giro + taxa * localA, radialDrift),
      striacao(giro + taxa * localB, radialDrift),
      peso
    );
    striation = pow(striation, mix(1.4, 3.2, uTurbulence * 0.35));

    float temperature = pow(1.0 - span, 3.4);
    vec3 color = mix(uCool, uMid, smoothstep(0.0, 0.55, temperature));
    color = mix(color, uHot, smoothstep(0.5, 1.0, temperature));
    color = mix(color, vec3(0.95, 0.28, 0.22), uErrorMix * 0.7);

    // Duas bordas suaves: sem elas o anel tem contorno geométrico visível.
    float edge = smoothstep(0.0, 0.014, span) * (1.0 - smoothstep(0.2, 0.95, span));

    /*
     * Brilho de superfície de Shakura-Sunyaev: T ∝ r^-3/4, logo fluxo ∝ r^-3.
     *
     * A versão anterior era "0.5 + temperatura*2.6", e os dois termos erravam. O PISO de 0.5
     * mantinha 16% do pico em todo o disco externo, produzindo um donut largo e uniforme —
     * enquanto o disco real, e toda imagem dele (EHT, Luminet, Interstellar), e um anel interno
     * estreito e muito brilhante mais uma nevoa externa fraca. E o pico chegava a ~4-5.5 em
     * linear: com ACES e exposicao 1.05, ACES(4.2)=0.976 contra ACES(2.8)=0.945, entao uHot e
     * uMid colapsavam AMBOS em branco quase puro e a rampa de temperatura — que e a fisica que
     * o disco carrega — so sobrevivia na metade externa.
     */
    float flux = pow(max(radius / uInner, 1.0), -3.0);
    /*
     * A curva de EXIBIÇÃO, e ela não é física — é o que a tela comporta.
     *
     * O fluxo de Shakura-Sunyaev varre tres ordens de grandeza entre a borda interna e a
     * externa (medido aqui: 1.0 no anel interno, 0.054 em span 0.2, 0.0017 em span 0.9). A
     * imagem tem cerca de dois stops uteis antes de o ACES saturar, entao mostrar o fluxo cru
     * apaga o disco inteiro fora do anel interno — foi o que aconteceu na primeira tentativa,
     * e o buraco negro sumiu da cena.
     *
     * pow(flux, 0.4) preserva a ORDEM (interno sempre mais claro que externo) e comprime a
     * faixa para caber. A afirmacao continua verdadeira — o gradiente e o de um disco de
     * acrecao — mas o mapeamento e de tela, nao de fisica, e isto esta escrito aqui para
     * ninguem ler o expoente como se fosse uma constante do modelo.
     */
    float brightness = edge * striation * pow(flux, 0.4) * uIntensity * 1.8;

    /*
     * Beaming relativístico — ESTÁTICO no referencial do observador.
     *
     * Era sin(flow), e flow contém uTime: o lobo brilhante CIRCULAVA o disco, e como
     * keplerian depende do raio ele ainda cisalhava numa espiral. Isso é outro fenômeno (um
     * ponto quente em órbita), não beaming. O beaming real não se move: o lado cuja velocidade
     * aponta para a câmera é permanentemente mais claro, e é essa assimetria fixa que produz o
     * crescente das imagens do EHT.
     *
     * uViewAz é o azimute da câmera no espaço local do disco, calculado uma vez por quadro na
     * CPU. mu é a projeção de v̂·n̂, e o fator Doppler entra com o expoente 3+α (α≈0.5), que é
     * o que dá o contraste observado de ~5:1 — contra os 1.76:1 da versão anterior.
     */
    float beta = 0.42 * sqrt(uInner / max(radius, uInner));
    /*
     * O beaming depende da INCLINAÇÃO de quem olha, e a versão anterior ignorava isso.
     *
     * mu projetava a velocidade orbital inteira na linha de visada, o que só vale visto DE
     * PERFIL. De cima o movimento do disco é perpendicular ao olhar, a componente radial vai a
     * zero e não existe assimetria alguma — o crescente das imagens do EHT e do Interstellar
     * aparece porque as duas são vistas quase de perfil.
     *
     * Sem este fator, olhar o disco de cima produzia um lado permanentemente estourado e o
     * outro apagado, sem causa física nenhuma: era só o bloom pegando um brilho que não devia
     * estar ali.
     */
    float mu = sin(uViewAz - theta) * uViewInPlane;
    /*
     * Normalizado pelo termo TRANSVERSAL, e com o expoente na ponta conservadora.
     *
     * Duas correções sobre a primeira versão, e as duas por medição do resultado:
     *
     * 1. Sem tirar o fator de Lorentz, o beaming não redistribuía brilho — ele MULTIPLICAVA o
     *    disco inteiro para cima (o lado que se aproxima ficava ~9.5x o brilho base). O que
     *    aparecia na tela era um lado estourado no bloom, e não um crescente. Dividindo pelo
     *    termo transversal, mu=0 vale 1: a média fica onde estava e a assimetria é de fato uma
     *    redistribuição.
     *
     * 2. O expoente é 3+α, e α depende do espectro. Com α=0.5 o contraste dava ~23:1, bem
     *    acima dos ~5-10:1 observados em M87 e em Sgr A. α=0 (espectro plano) é a ponta
     *    conservadora da faixa plausível e cai dentro do observado — foi escolhido porque o
     *    pico saturava, e isto está escrito para o número não ser lido como constante do
     *    modelo.
     */
    float boost = 1.0 / max(1.0 - beta * mu, 0.05);
    brightness *= pow(boost, 3.0);

    // O PESO DA FATIA. As fatias somam (blending aditivo) e os pesos somam 1, entao visto de
    // frente o disco tem exatamente o brilho de antes — o que muda e so a distribuicao vertical.
    brightness *= uWeight;
    gl_FragColor = vec4(color * brightness, brightness);
  }
`;

/**
 * As fatias do disco, em desvios-padrão da altura de escala. Ímpar de propósito: a do meio É o
 * disco que já existia, então o plano médio continua idêntico ao de antes.
 *
 * ⚠️ **As de fora NÃO amostram ruído** — e a primeira versão amostrava, o que MATOU A ABA.
 *
 * Cinco fatias com o campo completo é 5× o custo de fragmento de um anel que enche a tela, e o
 * campo passou a ser amostrado DUAS vezes por causa do ciclo anti-enrolamento: 10× o original.
 * A GPU travou e o navegador fechou a aba. O erro de raciocínio foi tratar "volume" como "mais
 * cópias do mesmo detalhe" — mas o que dá espessura a olho é a LUZ fora do plano médio, não a
 * estrutura dela. Fora do plano o gás é rarefeito: uma névoa lisa é o que ele é de verdade.
 *
 * Custo final: 2 amostras de ruído (só o plano médio) + 4 fatias triviais.
 */
const SLICE_OFFSETS = Object.freeze([-1.6, -0.8, 0, 0.8, 1.6]);

/**
 * Altura de escala, em frações do raio EXTERNO.
 *
 * Disco fino real tem `h/r` entre 0,01 e 0,1; as ilustrações de referência mostram um toro bem
 * mais gordo, porque nelas o disco está inchado por radiação. 0,05 fica no topo da faixa física e
 * é o suficiente para a espessura aparecer de perfil sem o disco virar rosquinha visto de cima.
 */
const SCALE_HEIGHT = 0.05;

export function createBlackHole() {
  const group = new THREE.Group();

  const uniforms = {
    uHeight: { value: 0 },
    uWeight: { value: 1 },
    uCheap: { value: 0 },
    uTime: { value: 0 },
    uSpin: { value: REGIMES.boot.spin },
    uIntensity: { value: REGIMES.boot.intensity },
    uTurbulence: { value: REGIMES.boot.turbulence },
    uViewAz: { value: 0 },
    uViewInPlane: { value: 1 },
    uInner: { value: DISK_INNER },
    uOuter: { value: DISK_OUTER },
    uErrorMix: { value: 0 },
    uHot: { value: new THREE.Color(0xffdba8) },
    uMid: { value: new THREE.Color(0xff8f3c) },
    uCool: { value: new THREE.Color(0x521705) },
  };

  /*
   * ⚠️ A ESFERA É MENOR QUE A SOMBRA, e antes era do tamanho exato dela.
   *
   * A silhueta de uma malha opaca é um círculo perfeito, e nenhuma rampa no pós-processamento
   * conserta isso: o recorte duro que fazia o objeto ler como "bola preta" vinha da GEOMETRIA,
   * não do shader da sombra. Desenhada a 78% do raio da sombra, a borda dela cai fundo dentro da
   * região que o passe de lente já levou a zero — o que chega à tela é só a rampa longa, que é o
   * que uma sombra gravitacional é.
   *
   * Ela continua existindo, e opaca, por um motivo que não mudou: é ela que oclui a metade de
   * trás do disco. Sem malha nenhuma o disco inteiro apareceria e a sombra viraria um filtro
   * escuro por cima dele.
   */
  const horizon = new THREE.Mesh(
    new THREE.SphereGeometry(HORIZON_RADIUS * 0.78, 64, 48),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  group.add(horizon);

  const diskMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: DISK_VERTEX,
    fragmentShader: DISK_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  /*
   * O DISCO É UMA PILHA DE FATIAS, não um plano — e antes era um plano.
   *
   * `RingGeometry` tem espessura ZERO. De frente isso não aparece; de perfil, com a câmera no
   * plano do disco, o que se vê é uma folha de um pixel — foi exatamente o que o usuário
   * fotografou em x = 0. Disco de acreção real tem altura de escala: a pressão do gás sustenta
   * uma espessura, e é ela que dá a leitura de VOLUME que as referências têm.
   *
   * Cinco cópias do mesmo disco, deslocadas em y por uma gaussiana, com os pesos SOMANDO 1. Como
   * o blending é aditivo, a soma vista de frente é idêntica à do disco único de antes — nenhuma
   * regressão no enquadramento em que ele já estava bom. De perfil, a mesma luz se espalha por
   * uma faixa em vez de uma linha.
   *
   * As fatias compartilham os OBJETOS de uniform (`{...uniforms}` copia as referências, não os
   * valores), então uma escrita em `uniforms.uTime.value` atinge as cinco. Só `uHeight` e
   * `uWeight` são próprios.
   */
  const disk = new THREE.Mesh(new THREE.RingGeometry(DISK_INNER, DISK_OUTER, 256, 64), diskMaterial);
  disk.rotation.x = -Math.PI / 2;

  const slices = [];
  {
    const pesos = SLICE_OFFSETS.map((i) => Math.exp(-(i * i) / 2));
    const soma = pesos.reduce((a, b) => a + b, 0);
    SLICE_OFFSETS.forEach((i, k) => {
      const material = i === 0
        ? diskMaterial
        : new THREE.ShaderMaterial({
          uniforms: { ...uniforms, uHeight: { value: 0 }, uWeight: { value: 0 }, uCheap: { value: 1 } },
          vertexShader: DISK_VERTEX,
          fragmentShader: DISK_FRAGMENT,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        });
      material.uniforms.uHeight.value = i * SCALE_HEIGHT * DISK_OUTER;
      material.uniforms.uWeight.value = pesos[k] / soma;
      const malha = i === 0
        ? disk
        : new THREE.Mesh(new THREE.RingGeometry(DISK_INNER, DISK_OUTER, 256, 64), material);
      malha.rotation.x = -Math.PI / 2;
      // A pilha é aditiva e sem `depthWrite`, então a ordem entre as fatias não importa — mas ela
      // tem de vir DEPOIS do horizonte, que é opaco e escreve profundidade.
      malha.position.y = material.uniforms.uHeight.value;
      /*
       * ⚠️ O DISCO DE GEOMETRIA ESTÁ DESLIGADO — quem o desenha agora é o traçado de geodésicas
       * (`blackhole-geodesic.js`), dentro do passe de tela.
       *
       * Ele não foi apagado ainda de propósito: a troca é grande e o raymarch precisa passar pelo
       * olho do usuário na máquina dele antes de a versão antiga sumir do repositório. Enquanto
       * isso ele custa zero — `visible: false` tira a malha do render list inteiro, não só do
       * desenho. Quando o raymarch for aprovado, este bloco e o `DISK_FRAGMENT` saem juntos.
       *
       * A ESFERA DO HORIZONTE continua ligada, e não é esquecimento: ela é opaca e escreve
       * profundidade, então é ela que oclui os corpos que passam ATRÁS do buraco negro. O passe de
       * tela não lê profundidade e não saberia fazer isso.
       */
      malha.visible = false;
      slices.push(malha);
      group.add(malha);
    });
  }

  // Sem anel extra colado no horizonte. Nesta inclinação rasante um anel de raio próximo
  // ao da esfera se sobrepõe à silhueta dela, e o passe de lente esfrega isso num espiral
  // dentro do buraco. A borda interna do próprio disco já é a beirada incandescente — e ela
  // está no lugar certo por construção, não por ajuste.


  const target = { ...REGIMES.idle };
  const live = { ...REGIMES.boot };
  let pulse = 0;
  // Escalas do painel de afinação. Multiplicam o regime em vez de substituí-lo: o estado
  // cognitivo continua mandando na forma, e o operador só ajusta a amplitude.
  const tune = { spin: 1, intensity: 1, width: 1, breath: 1 };

  return {
    group,
    /**
     * Onde a câmera está, no referencial do DISCO — é o que ancora o beaming.
     *
     * O crescente tem que ficar parado enquanto o disco gira, então ele não pode sair de um
     * ângulo do disco: sai do ângulo do OBSERVADOR. `worldToLocal` faz a conversão respeitando
     * qualquer rotação/escala que o grupo tenha, o que evita reimplementar aqui a orientação do
     * anel — e evita que ela e esta conta divirjam quando uma das duas mudar.
     */
    syncView(camera) {
      const local = disk.worldToLocal(camera.position.clone());
      uniforms.uViewAz.value = Math.atan2(local.y, local.x);
      // 1 = câmera no plano do disco (perfil, beaming cheio); 0 = de cima (sem assimetria).
      // O plano do disco é o XY local; Z é a normal.
      const span = Math.hypot(local.x, local.y);
      uniforms.uViewInPlane.value = span / Math.max(Math.hypot(span, local.z), 1e-4);
    },

    horizonRadius: HORIZON_RADIUS,
    diskOuter: DISK_OUTER,

    /**
     * A geometria e o estado que o traçado de geodésicas precisa, em unidades de MUNDO.
     *
     * ⚠️ Tudo aqui já vai multiplicado por `group.scale`, e é essa multiplicação que faltava.
     * `HORIZON_RADIUS` é o valor de projeto (3,0); o objeto na cena tem `coreScale` em cima dele
     * (2,05 no padrão), logo 6,15. `scene.js` fazia a conta à mão num lugar e **`lensing.js` não
     * fazia em lugar nenhum** — media o raio aparente pelos 3,0 crus. Medido: com isso o anel de
     * fótons era desenhado a 0,69 do raio da esfera OPACA, ou seja dentro do preto, junto com a
     * rampa inteira que suaviza a borda da sombra. Era exatamente o que se via na tela.
     *
     * Uma função só, pela mesma razão que `clampDistance` de `scene.js` é uma só: dois donos do
     * mesmo número é como eles divergem.
     */
    geometry() {
      const escala = group.scale.x;
      return {
        center: group.getWorldPosition(CENTRO),
        /*
         * `HORIZON_RADIUS` é o raio da SOMBRA, não o de Schwarzschild — o cabeçalho da constante
         * já diz isso. Para Schwarzschild a sombra tem √27/2 ≈ 2,598 R_s, então o traçado, que
         * integra em torno de R_s, precisa da divisão. Passar a sombra como se fosse R_s inflaria
         * o horizonte 2,6× e engoliria o disco inteiro.
         */
        rs: (HORIZON_RADIUS * escala) / Math.sqrt(27) * 2,
        inner: DISK_INNER * escala,
        outer: DISK_OUTER * escala,
        spin: live.spin * tune.spin,
        intensity: live.intensity * tune.intensity,
        turbulence: live.turbulence,
        error: uniforms.uErrorMix.value,
        hot: uniforms.uHot.value,
        mid: uniforms.uMid.value,
        cool: uniforms.uCool.value,
      };
    },

    setRegime(state) {
      Object.assign(target, REGIMES[state] || REGIMES.idle);
      uniforms.uErrorMix.value = state === 'error' ? 1 : 0;
    },

    /** Empurrão de energia: um evento que chega (memória, ferramenta) alimenta o núcleo. */
    surge(amount = 1) {
      live.intensity += amount * 0.5;
      live.turbulence += amount * 0.3;
    },

    update(delta, elapsed) {
      // Aproximação exponencial em vez de salto: a troca de regime tem que ser sentida
      // como aceleração, não como corte. O fator sai do delta, não do número de quadros.
      const factor = 1 - Math.exp(-REGIME_RATE * delta);
      for (const key of Object.keys(target)) {
        live[key] += (target[key] - live[key]) * factor;
      }

      pulse = Math.sin(elapsed * 0.55) * 0.5 + Math.sin(elapsed * 1.37) * 0.25;
      const breath = 1 + pulse * live.breath * tune.breath;

      uniforms.uTime.value = elapsed;
      uniforms.uSpin.value = live.spin * tune.spin;
      uniforms.uIntensity.value = live.intensity * (0.9 + pulse * 0.14) * tune.intensity;
      uniforms.uTurbulence.value = live.turbulence;
      uniforms.uOuter.value = DISK_OUTER * tune.width;

      horizon.scale.setScalar(breath);
      for (const fatia of slices) fatia.scale.setScalar(1 + pulse * live.breath * tune.breath * 0.45);
      /*
       * A rotação de corpo rígido SAIU.
       *
       * Ela girava o grupo inteiro por cima do cisalhamento kepleriano que o shader já produz —
       * duas rotações somadas, uma delas contradizendo a afirmação de rotação diferencial que o
       * próprio shader faz três linhas acima. Com o beaming agora ancorado no azimute da
       * CÂMERA, girar o grupo também moveria o crescente, que é justamente o que ele não pode
       * fazer.
       */
    },


    /** Afinação: escala o regime, não o troca. */
    tune(values) {
      tune.spin = values.diskSpin;
      tune.intensity = values.diskIntensity;
      tune.width = values.diskWidth;
      tune.breath = values.breath;
      /*
       * A escala vai no GRUPO. O crescente e a lente leem o raio do horizonte em espaço de
       * MUNDO — escalar o grupo os leva junto, o que é o que se quer; escalar cada malha
       * separadamente deixaria a lente calibrada para um raio que não existe mais.
       */
      group.scale.setScalar(values.coreScale ?? 1);
      // O disco é geometria fixa; a largura efetiva é o raio externo lido pelo shader, e a
      // borda de fade acompanha porque `span` é normalizado por uOuter.
      for (const fatia of slices) fatia.scale.setScalar(1);
    },

    intensity: () => live.intensity,
    pulse: () => pulse,
  };
}
