/**
 * Anéis planetários: a estrela cujo arquivo está diferente do que está commitado.
 *
 * O céu inteiro mostra conhecimento *indexado*, e índice é sempre uma foto do passado. O anel
 * é a única coisa na cena que fala do disco AGORA: apareceu anel, aquele arquivo mudou depois
 * da última reindexação. É o par visual do `server/dirty.py`.
 *
 * **Três estados, três sistemas de anéis reais** — a estrutura carrega a informação junto com
 * a cor, e não só a cor:
 *
 * | Estado | Família | Por quê |
 * |---|---|---|
 * | `modified` | Saturno | trabalho em curso: o sistema mais rico, faixas largas e Cassini |
 * | `staged` | Urano | preparado: anéis estreitos, separados, arrumados |
 * | `untracked` | Júpiter | sem histórico: halo difuso, quase sem estrutura |
 *
 * Distinguir por cor apenas obrigaria a decorar uma legenda; distinguir também pela silhueta
 * deixa os três reconhecíveis de relance e sobrevive a quem não separa bem as cores. O perfil
 * radial de cada família está em `ring-profiles.js`, com as medidas reais.
 *
 * **É um quad com shader, não um `RingGeometry`.** A primeira versão era anel de geometria com
 * `MeshBasicMaterial`, e media mal em três frentes ao mesmo tempo: a silhueta facetava (um anel
 * grande mostra os segmentos como cantos), a borda era um corte duro numa cena onde tudo tem
 * queda suave, e a faixa era preenchimento uniforme — um donut chapado. Num quad a
 * circunferência é analítica: não há segmento para facetar em tamanho nenhum, e a densidade
 * vem da textura de perfil, que é o que produz as bandas e os vãos.
 *
 * **O anel é billboardado e INCLINADO, não fixo no mundo.** Inclinação de mundo põe o anel de
 * perfil em metade da órbita da câmera — ele some exatamente quando o operador gira a cena.
 * Copiar o quaternion da câmera e depois tombar mantém a mesma elipse de qualquer ângulo.
 *
 * O tombo entra por `rotateZ`/`rotateX`, que multiplicam o quaternion — nunca por `rotation.x`.
 * Escrever no Euler recalcularia o quaternion e descartaria o billboard, que é o defeito que os
 * portais de `satellites.js` já pagaram uma vez (o anel cambaleava a cada quadro).
 *
 * Não há giro nem pulso: o anel é uma circunferência, e girá-la em torno do próprio eixo não
 * muda um pixel. Sai de graça obedecendo `prefers-reduced-motion` — não há movimento a reduzir.
 */
import * as THREE from 'three';
import { profileTexture } from './ring-profiles.js';

/**
 * Uma cor por estado do `git status`. Âmbar, verde-água e violeta se separam bem entre si
 * também nas deficiências de visão de cor mais comuns — e, aqui, a cor é reforço da família,
 * não a única pista.
 */
export const DIRTY_COLORS = {
  modified: 0xffc169,
  staged: 0x7ee0c0,
  untracked: 0xc9a6ff,
};

export const DIRTY_LABELS = {
  modified: 'ALTERADO',
  staged: 'PREPARADO',
  untracked: 'NÃO RASTREADO',
};

const DIRTY_FAMILIES = {
  modified: 'saturn',
  staged: 'uranus',
  untracked: 'jupiter',
};

/*
 * O raio da estrela NÃO é constante aqui — ele chega por `radiusOf` em `follow`.
 *
 * Já foi uma constante (`0.39 * aSize`) e a constante errava por três caminhos ao mesmo tempo,
 * todos medidos: o `graphSpread` escala a geometria e não o ponto (oscilação de 8× no slider),
 * a ignição infla o ponto em até ~4× (a estrela acesa engolia o próprio anel) e `gl_PointSize`
 * é pixel de framebuffer, então a razão mudava ~4× entre monitores. Quem sabe o tamanho
 * aparente do ponto é quem escreve o `gl_PointSize`: `graph.js`.
 */
// Inclinação média a partir do plano da tela, ~63°: elipse achatada o bastante para ler como
// anel em perspectiva, aberta o bastante para não virar um traço.
const TILT = 1.1;
/*
 * Quanto do sprite da estrela o SISTEMA DE ANÉIS INTEIRO ocupa — a borda externa fica aqui.
 *
 * Isto é decisão de tela, não de física, e o arquivo diz isso porque a versão anterior tentou
 * o contrário e falhou de forma medida: ancorando o perfil no LIMBO do planeta, Saturno
 * (`reach` 2.45) rende um sistema 4.9× mais largo que o astro — o que é verdade e é
 * inutilizável, porque no ajuste padrão a câmera fica dentro da casca de nós e os anéis passam
 * a se sobrepor cobrindo a tela. Fixando a borda EXTERNA no sprite, o rodapé fica limitado e
 * todas as proporções INTERNAS (B, Divisão de Cassini, ε, os gossamer) seguem reais — o que se
 * perde é só a comparação de tamanho entre um anel e outro planeta, que não é o que a cena
 * comunica. Famílias de `reach` maior ganham um planeta proporcionalmente menor dentro do
 * mesmo rodapé, o que por acaso é verdade (o sistema de Júpiter é mesmo mais largo).
 */
const FOOTPRINT = 0.62;

/**
 * Que fração do raio do SPRITE é o disco visível da estrela.
 *
 * Este número era um contrato IMPLÍCITO entre `graph.js` (que devolve o raio do sprite) e este
 * módulo (que ancora o anel nele) — e a bancada o expôs na primeira montagem: passando o raio
 * VISÍVEL onde o código esperava o do sprite, o anel inteiro cabia dentro da estrela e não
 * aparecia. Exportado para quem precisar converter entre os dois ter uma fonte só.
 *
 * De onde sai: o núcleo do ponto é `pow(1 - smoothstep(0,1,d), 2.2)` e já caiu a ~2% em d=0.6.
 * O `LIMB` do shader (0.97) é esta constante dividida por `FOOTPRINT`.
 */
export const VISIBLE_CORE = 0.6;
// Dispersão determinística da inclinação e do rolamento. Todos os anéis com o MESMO tombo lê
// como carimbo; os planetas reais não combinaram inclinação entre si.
const TILT_SPREAD = 0.30;
const OPACITY = 0.9;
/*
 * Teto de anéis desenhados ao mesmo tempo. Um refactor grande suja centenas de arquivos, e aí
 * o céu vira um campo de anéis que não informa nada. Quem chama recebe quantos ficaram de fora
 * e é responsável por dizê-lo — corte silencioso lê como "é só isso que mudou".
 */
let maxRings = 64;

/*
 * Ordem de desenho, e ela é OBRIGATÓRIA.
 *
 * São três coisas na mesma posição: a estrela (ponto aditivo), a extinção (multiplicativa) e a
 * luz espalhada pelo anel (aditiva). A sequência tem que ser exatamente essa — a estrela
 * desenha, o anel escurece o que ficou atrás dele, e só então a luz somada entra.
 *
 * Sem `renderOrder` explícito isso ficaria à mercê da ordenação de transparentes do three, que
 * ordena por DISTÂNCIA — e aqui as três estão à mesma distância, então o resultado seria a
 * ordem de inserção, que não é contrato de nada.
 */
// τ efetivo. Não é o do anel B real (1.5–2.5): ali a faixa some por completo, e uma estrela é
// fonte pontual muito mais brilhante que um planeta iluminado. Este é o valor que deixa a
// passagem legível sem apagar o astro — número de tela, não constante do modelo.
// τ do anel B, medido: 1.5–2.5. Fica em 2.0 — DENTRO da faixa real, e a bancada mostrou que
// nesse patamar a faixa escura sobre o astro é visível. O valor anterior (0.85) foi um palpite
// escolhido sem conseguir ver o efeito; este foi escolhido vendo.
const OPTICAL_DEPTH = 2.0;

/*
 * EXTINÇÃO — o anel na frente do astro ESCURECE, não soma luz.
 *
 * O anel B de Saturno tem profundidade óptica τ≈1.5–2.5: passando na frente do planeta ele
 * aparece como uma faixa ESCURA. Com blending aditivo o desenho fazia o oposto — a metade
 * próxima clareava exatamente o que devia tapar.
 *
 * Este passe desenha SÓ a metade próxima, e só onde ela cruza o disco da estrela: fora dali não
 * há nada para escurecer. A metade distante nem chega aqui — ela já foi descartada pela oclusão
 * do outro passe.
 */
const EXTINCTION_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uProfile;
  uniform float uOpacity;
  uniform float uCosTilt;
  uniform vec2 uRadial;
  uniform float uDepth;
  varying vec2 vUv;

  const float LIMB = 0.97;

  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    if (d > 1.0) discard;
    float r = d * uRadial.x + uRadial.y;
    if (r < 0.0) discard;
    if (p.y < 0.0) discard;
    float screenR = length(vec2(p.x, p.y * uCosTilt));
    if (screenR > LIMB) discard;

    float density = texture2D(uProfile, vec2(r, 0.5)).r;
    // Beer-Lambert: a fracao que ATRAVESSA e exp(-tau * densidade).
    float transmitted = exp(-uDepth * density);
    float blocked = (1.0 - transmitted) * uOpacity;
    if (blocked < 0.004) discard;
    // Com blendSrc=Zero e blendDst=OneMinusSrcColor, o destino e multiplicado por (1 - src).
    gl_FragColor = vec4(vec3(blocked), 1.0);
  }
`;

const ORDER_EXTINCTION = 1;
const ORDER_SCATTER = 2;

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/*
 * O fragmento não desenha faixa nenhuma: ele só pergunta ao perfil qual é a densidade naquele
 * raio. Toda a estrutura (largura das faixas, Cassini, Encke, gossamer) mora nos dados, onde é
 * legível e conferível contra a medida real, e não espalhada em constantes de shader.
 *
 * ## O gradiente é ÂNGULO DE FASE, e ele difere por família
 *
 * A primeira versão escurecia "a metade que passa na frente" — e fazia o contrário do que o
 * comentário dizia (com `rotateX` positivo e a câmera olhando por −Z, `p.y > 0` é a metade
 * PRÓXIMA, que era justamente a que recebia brilho cheio). Pior: aplicava a mesma assimetria
 * fraca nas três famílias, quando duas delas pedem o oposto e a terceira pede muito mais.
 *
 * Aqui o primário é uma ESTRELA — fonte emissiva no centro — então a assimetria é puramente de
 * ângulo de fase, e ela é a assinatura física de cada família:
 *
 * | Família | Partícula | Comportamento |
 * |---|---|---|
 * | Saturno, Urano | gelo/rocha centimétrica | RETROespalha: a metade DISTANTE é mais clara |
 * | Júpiter | poeira sub-micrométrica | espalha para FRENTE: ~100× mais brilhante em fase baixa |
 *
 * O anel de Júpiter foi literalmente descoberto assim, pela Voyager 2 olhando para trás — em
 * retroespalhamento ele é quase invisível. Um lobo frontal estreito e forte é o que o torna
 * reconhecível, e é o que `uForward` liga.
 *
 * ## O perfil começa no LIMBO, não no centro
 *
 * `uRadial` remapeia o raio do quad para o raio do perfil. Sem isso, 45% do raio (a região
 * dentro do planeta, onde não existe anel) consumia téxeis e resolução de tela: a lacuna de
 * Encke e os dez anéis de Urano ficavam uma ordem de grandeza abaixo de um pixel — existiam no
 * arquivo e não na imagem. Descartar essa faixa devolve ~1.8× de resolução radial onde há
 * estrutura para ver.
 */const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uProfile;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uForward;
  uniform vec2 uRadial;
  uniform float uCosTilt;
  varying vec2 vUv;

  /*
   * Onde fica o LIMBO da estrela, em unidades do quad.
   *
   * O disco visivel da estrela e ~0.6 do raio do sprite (o nucleo do ponto ja apagou ali), e o
   * quad tem meia-extensao FOOTPRINT=0.62 do mesmo raio. Logo o limbo cai em 0.6/0.62 ≈ 0.97
   * do quad. Os dois numeros vivem no JS deste modulo e em graph.js; se um mudar, este muda.
   */
  const float LIMB = 0.97;

  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    if (d > 1.0) discard;

    // Raio do quad para raio do perfil: 0 no limbo do planeta, 1 no alcance da família.
    float r = d * uRadial.x + uRadial.y;
    if (r < 0.0) discard;

    /*
     * OCLUSAO pelo limbo do astro.
     *
     * O quad esta em espaco de camera, entao o deslocamento na TELA de um ponto do anel e
     * (p.x, p.y * cos(tombo)) — o eixo tombado encurta na projecao. A borda interna do perfil
     * projetada cai bem dentro do disco da estrela, entao a metade DISTANTE do anel deve sumir
     * atras dela e reaparecer do outro lado.
     *
     * ⚠️ p.y < 0 e a metade DISTANTE (com rotateX positivo e a camera olhando por -Z, p.y > 0
     * e a proxima) — a mesma convencao que o gradiente de fase logo abaixo usa. Trocar o sinal
     * aqui esconderia justamente a metade que passa NA FRENTE.
     *
     * Ver o anel emergir por tras do corpo e a pista numero um de que aquilo e um objeto 3D em
     * volta de uma esfera, e nao um decalque colado na tela.
     */
    float screenR = length(vec2(p.x, p.y * uCosTilt));
    if (p.y < 0.0 && screenR < LIMB) discard;

    float density = texture2D(uProfile, vec2(r, 0.5)).r;

    float near = clamp(p.y, 0.0, 1.0);
    float far = clamp(-p.y, 0.0, 1.0);
    float ice = 0.72 + 0.28 * far;
    float dust = 0.30 + 2.6 * pow(near, 3.0);
    float phase = mix(ice, dust, uForward);

    float intensity = density * phase * uOpacity;
    if (intensity < 0.004) discard;
    gl_FragColor = vec4(uColor * intensity, intensity);
  }
`;

/** Hash determinístico: o mesmo nó recebe sempre a mesma inclinação, em qualquer sessão. */
function jitter(index, salt) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function createRings() {
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(2, 2);
  // Uma textura de perfil por família, compartilhada por todos os anéis dela. Construídas sob
  // demanda: uma árvore sem `staged` nunca paga o perfil de Urano.
  const profiles = new Map();
  // Pool: os anéis são reatribuídos a cada leitura do `git status` (a cada 15s). Criar e
  // destruir malha e material nesse ritmo é lixo garantido para o coletor.
  const pool = [];
  const active = [];

  function profileFor(family) {
    if (!profiles.has(family)) profiles.set(family, profileTexture(family));
    return profiles.get(family);
  }

  function grow(size) {
    while (pool.length < size) {
      const mesh = new THREE.Mesh(
        geometry,
        // Material por anel: cor, perfil E opacidade variam por anel (a opacidade acompanha a
        // janela temporal, então dois anéis da mesma família divergem nela).
        new THREE.ShaderMaterial({
          uniforms: {
            uProfile: { value: null },
            uColor: { value: new THREE.Color(DIRTY_COLORS.modified) },
            uOpacity: { value: 0 },
            uForward: { value: 0 },
            uRadial: { value: new THREE.Vector2(1, 0) },
            uCosTilt: { value: Math.cos(TILT) },
          },
          vertexShader: VERTEX,
          fragmentShader: FRAGMENT,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        })
      );
      mesh.renderOrder = ORDER_SCATTER;
      mesh.visible = false;

      // O passe de extinção compartilha geometria e uniformes de forma; o que muda é o
      // blending e o fato de ele escurecer em vez de somar.
      const shade = new THREE.Mesh(
        geometry,
        new THREE.ShaderMaterial({
          uniforms: {
            uProfile: { value: null },
            uOpacity: { value: 0 },
            uCosTilt: { value: Math.cos(TILT) },
            uRadial: { value: new THREE.Vector2(1, 0) },
            uDepth: { value: OPTICAL_DEPTH },
          },
          vertexShader: VERTEX,
          fragmentShader: EXTINCTION_FRAGMENT,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.CustomBlending,
          blendSrc: THREE.ZeroFactor,
          blendDst: THREE.OneMinusSrcColorFactor,
        })
      );
      shade.renderOrder = ORDER_EXTINCTION;
      shade.visible = false;
      mesh.userData.shade = shade;

      group.add(mesh, shade);
      pool.push(mesh);
    }
  }

  return {
    group,

    /**
     * Define quais estrelas ganham anel.
     *
     * `entries`: `[{ index, size, state, recency }]`, onde `index` é a posição do nó no buffer
     * de posições do grafo — é por ele que `follow` acompanha a órbita sem procurar nada.
     *
     * Devolve `{ shown, dropped }`.
     */
    set(entries) {
      const kept = entries.length > maxRings ? entries.slice(0, maxRings) : entries;
      grow(kept.length);

      active.length = 0;
      kept.forEach((entry, slot) => {
        const mesh = pool[slot];
        const family = DIRTY_FAMILIES[entry.state] ?? DIRTY_FAMILIES.modified;
        const profile = profileFor(family);

        mesh.visible = true;
        mesh.userData.shade.visible = true;
        mesh.userData.shade.material.uniforms.uProfile.value = profile.texture;
        mesh.material.uniforms.uProfile.value = profile.texture;
        mesh.material.uniforms.uForward.value = profile.forward;
        // d_perfil = (d·reach − 1)/(reach − 1): descarta a região dentro do limbo.
        const radial = [profile.reach / (profile.reach - 1), -1 / (profile.reach - 1)];
        mesh.material.uniforms.uRadial.value.set(...radial);
        mesh.userData.shade.material.uniforms.uRadial.value.set(...radial);
        mesh.material.uniforms.uColor.value.setHex(
          DIRTY_COLORS[entry.state] ?? DIRTY_COLORS.modified
        );

        active.push({
          mesh,
          index: entry.index,
          recency: entry.recency,
          // O quad tem meia-extensão 1 e o perfil vai do LIMBO ao `reach`. `uRadial` já cuida
          // do remapeamento; aqui só sobra o rodapé de tela.
          reach: profile.reach,
          tilt: TILT + (jitter(entry.index, 1) - 0.5) * TILT_SPREAD,
          roll: (jitter(entry.index, 2) - 0.5) * Math.PI,
        });
      });
      for (let i = kept.length; i < pool.length; i++) {
        pool[i].visible = false;
        pool[i].userData.shade.visible = false;
      }

      return { shown: kept.length, dropped: entries.length - kept.length };
    },

    /**
     * Cola cada anel na estrela dele, neste quadro.
     *
     * `dimOf(recency)` é a MESMA atenuação da janela temporal que o shader das estrelas
     * aplica. Sem ela, arrastar o scrubber para um período antigo apagaria a estrela e
     * deixaria o anel aceso em volta do nada.
     */
    /**
     * @param {number} [tiltOverride]  tombo fixo, para a BANCADA varrer o ângulo. Na cena o
     *   tombo é por nó (dispersão determinística) e este parâmetro não é passado.
     */
    follow(positions, camera, dimOf, radiusOf, tiltOverride) {
      for (const ring of active) {
        const offset = ring.index * 3;
        ring.mesh.position.set(positions[offset], positions[offset + 1], positions[offset + 2]);
        // Ordem importa: `roll` gira em torno do eixo de visão (inclina o eixo maior da elipse
        // na tela) e `tilt` tomba em torno do eixo X já rolado. Invertido, o rolamento passaria
        // a girar o anel dentro do próprio plano — onde ele é simétrico e nada mudaria.
        ring.mesh.quaternion.copy(camera.quaternion);
        ring.mesh.rotateZ(ring.roll);
        const tilt = tiltOverride ?? ring.tilt;
        ring.mesh.rotateX(tilt);
        // O achatamento na tela depende do tombo DESTE anel, que tem dispersão por nó.
        ring.mesh.material.uniforms.uCosTilt.value = Math.cos(tilt);
        // O passe de extinção acompanha posição, orientação e escala do anel — é o MESMO anel,
        // desenhado duas vezes com blendings opostos.
        const shade = ring.mesh.userData.shade;
        shade.position.copy(ring.mesh.position);
        shade.quaternion.copy(ring.mesh.quaternion);
        shade.scale.copy(ring.mesh.scale);
        shade.material.uniforms.uCosTilt.value = Math.cos(tilt);
        shade.material.uniforms.uOpacity.value = ring.mesh.material.uniforms.uOpacity.value;
        // Raio do sprite da estrela AGORA — já com ignição, spread, fov, resolução e o teto
        // de `gl_PointSize` — vezes o rodapé. É o que mantém o anel colado ao astro em
        // qualquer ajuste do painel e em qualquer monitor.
        ring.mesh.scale.setScalar(radiusOf(ring.index) * FOOTPRINT);
        ring.mesh.material.uniforms.uOpacity.value = OPACITY * dimOf(ring.recency);
      }
    },

    /** Teto de anéis — quem decide é o perfil de qualidade. */
    setMaxRings(value) {
      maxRings = Math.max(1, Math.round(value));
    },

    count: () => active.length,

    dispose() {
      active.length = 0;
      for (const mesh of pool) {
        group.remove(mesh, mesh.userData.shade);
        mesh.material.dispose();
        mesh.userData.shade.material.dispose();
      }
      pool.length = 0;
      for (const profile of profiles.values()) profile.texture.dispose();
      profiles.clear();
      geometry.dispose();
    },
  };
}
