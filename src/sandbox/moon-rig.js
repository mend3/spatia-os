/**
 * SISTEMA DE LUAS — a bancada onde o piso de legibilidade é escolhido VENDO.
 *
 * Existe por um resultado medido na cena viva em 2026-08-05: travada a câmera em
 * `core/oracle/browser/README.md` (9 luas, o melhor candidato da tabela), não há sistema de luas
 * visível — só espalhamento indistinguível do campo de fundo. Nos 40 sistemas do corpus, o sprite
 * da lua mede 1,09 · 2,11 · 4,47 px (mín · mediana · máx) no ÚNICO enquadramento que mostra o
 * sistema inteiro, e o disco visível é 0,6 disso.
 *
 * ## Por que só existe UM enquadramento
 *
 * A lua tem ~1,8% do raio da estrela e orbita a ~7,4 raios dela — proporção fiel (Io: 2,6% e 5,9
 * raios de Júpiter). O preço é que a razão órbita/lua fica em ~410: aproximar para ver a lua tira
 * o sistema da tela, enquadrar o sistema apaga a lua. Nenhum movimento de câmera resolve, então a
 * pergunta que a bancada responde é uma só — **naquele enquadramento, o sistema se lê?**
 *
 * `ENQUADRAR` liga esse enquadramento: a câmera é posta em `outer / tan(fov/2)`, que é a distância
 * exata em que a órbita mais externa toca a borda. Desligue para inspecionar de perto; o número
 * que decide continua sendo reportado com o enquadramento canônico, não com o que está na tela.
 *
 * ## O que está em teste
 *
 * `PISO` é o parâmetro, em pixels CSS de diâmetro do sprite. Ele vira `minRadiusOverOuter` e
 * sobrepõe `MOON_MIN_OVER_OUTER` no `moonsOf` real. **4,5 px foi escolhido aqui em 2026-08-05 e
 * está na cena**; o slider nasce nele. Zero desliga o piso e devolve o modelo anterior, que é o
 * controle do experimento — é a comparação a fazer antes de mexer no valor.
 *
 * ⚠️ O piso compra tamanho de lua com NÚMERO de luas (`moonRadius = W/(N·BAND_MOONS)`), e
 * `BAND_MOONS = 4` é quase o mínimo que a prova de não-colisão aceita. Então a decisão é entre
 * "todo documento tem seu sistema" e "poucos documentos têm um sistema legível" — olhe as duas
 * pontas do slider antes de escolher.
 */
import * as THREE from 'three';
import { createPointMaterial, hash01, KIND_COLORS, moonOffset, moonSpriteSize } from '../space/graph.js';
import { moonsOf, raioDeCorpo } from '../space/orbital-zones.js';
import { createMoonOrbits } from '../space/moon-orbits.js';

/**
 * `gl_PointSize` por unidade da razão `raio da lua / órbita externa`, no enquadramento canônico.
 *
 * É a inversão exata do vertex shader: o ponto vale `uSize·aSize·300/z` e o enquadramento fixa
 * `z = outer/tan(fov/2)`, então `px = uSize·300·tan(fov/2)·(aSize/outer)` — o `outer` cancela e
 * sobra uma constante. `4,6` é o `uSize` do material e `300` é o `POINT_SCALE` do shader; o
 * `tan(fov/2)` vem do `fov` da bancada, então ele entra na hora.
 */
const PONTO_POR_RAZAO = (fov) => (4.6 * 300 * Math.tan((fov * Math.PI) / 360)) / GRAPH_SPREAD;

/**
 * ⚠️ `graphSpread` da cena — sem ele esta bancada MENTE, e mentiu.
 *
 * A órbita é esticada por `graphSpread` no mundo; o sprite não é esticado por nada. Medindo sem
 * esse fator, a bancada anunciou 5,42 px CSS por lua onde a cena entregava 1,63 — e foi com o
 * número dela que o piso de legibilidade foi escolhido. É a terceira vez que a régua de pixel
 * morde este projeto, e a única defesa é o fator estar aqui, nomeado.
 */
const GRAPH_SPREAD = 2.6;

/**
 * `gl_PointSize` é pixel do FRAMEBUFFER; o olho mede em pixel CSS. Em DPR 2 é o dobro.
 *
 * Esta bancada já pagou essa confusão uma vez, na sessão do anel — passar `clientHeight` onde o
 * shader fala em `canvas.height` dividiu por dois todo veredito de legibilidade, e nenhum deles
 * era confiável até alguém conferir. O teto de 2 é o mesmo de `sandbox/main.js`.
 */
const DPR = () => Math.min(window.devicePixelRatio, 2);

/** Raio desenhado do pai — a mesma lei de `graph.js` para nó de arquivo. */
const raioDoPai = (chunks) => 0.55 + Math.log2(1 + chunks) * 0.42;

/**
 * O corpo sintético que o `moonsOf` recebe.
 *
 * `radius` é o raio ORBITAL do pai, e é ele que decide se existe janela: a razão Hill/Roche não
 * depende da massa (o `m^(1/3)` cancela), então o corte é em `a`. O slider chama isso de IDADE
 * porque é o que ele significa na cena — raio orbital é recência.
 */
function corpo(secoes, chunks, idade, massaCentral) {
  // `a_corte = ROCHE_FLUID · K_RAIO · (3·M)^(1/3)`, invertido para o slider falar em folga.
  const corte = 2.44 * raioDeCorpo(3 * massaCentral);
  return {
    id: `bancada/lua-${secoes}-${chunks}`,
    sections: Array.from({ length: secoes }, (_, i) => `§ seção ${i + 1}`),
    chunks,
    radius: corte * idade,
  };
}

export const MOON_SPEC = {
  id: 'luas',
  name: 'SISTEMA DE LUAS',
  distance: 24,
  controls: [
    {
      key: 'piso',
      label: 'PISO DE LEGIBILIDADE (px)',
      type: 'range',
      min: 0,
      max: 10,
      step: 0.25,
      value: 4.5,
    },
    {
      key: 'idade',
      label: 'IDADE DO PAI (folga da janela)',
      type: 'range',
      min: 1.02,
      max: 1.8,
      step: 0.01,
      value: 1.4,
    },
    { key: 'secoes', label: 'SEÇÕES DO DOCUMENTO', type: 'range', min: 5, max: 24, step: 1, value: 9 },
    { key: 'massa', label: 'MASSA DO PAI (chunks)', type: 'range', min: 5, max: 120, step: 1, value: 11 },
    { key: 'enquadrar', label: 'ENQUADRAR O SISTEMA', type: 'bool', value: true },
    { key: 'orbitar', label: 'DEIXAR ORBITAR', type: 'bool', value: false },
    { key: 'orbitas', label: 'TRAÇAR AS ÓRBITAS', type: 'bool', value: true },
    { key: 'pai', label: 'DESENHAR O PAI', type: 'bool', value: true },
  ],
  watch: [
    'sem TRAÇAR AS ÓRBITAS o sistema vira pontos soltos: é a comparação que motivou o traço',
    'PISO em 0 é o modelo ANTERIOR (lua de 1,42 px) — o controle, para comparar com o 4,5 da cena',
    'a pergunta não é "a lua existe": é se as BANDAS se separam, e se elas leem como sistema',
    'suba o PISO e conte o que se perde: o número de luas cai para comprar tamanho, não há terceira saída',
    'desligue ENQUADRAR e aproxime: de perto sempre se lê. Isso não responde nada — a cena nunca está lá',
    'IDADE baixa fecha a janela (o corpo raspa o limiar): sobra uma lua, e é assim mesmo',
  ],

  build(ctx) {
    const group = new THREE.Group();
    const orbitas = createMoonOrbits();
    group.add(orbitas.object);
    const ORIGEM = new THREE.Vector3();
    const AT = [0, 0, 0];
    // Remonta o traço só quando a GEOMETRIA do sistema muda — não a cada quadro de slider.
    let assinatura = null;
    const material = createPointMaterial();
    // Capacidade fixa no máximo do slider (+1 do pai): realocar buffer por quadro de slider
    // faria o espécime medir o alocador junto com o modelo.
    const MAX = 25;
    const geometry = new THREE.BufferGeometry();
    const posicoes = new Float32Array(MAX * 3);
    const tamanhos = new Float32Array(MAX);
    const cores = new Float32Array(MAX * 3);
    const escondidos = new Float32Array(MAX);
    geometry.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(tamanhos, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(cores, 3));
    geometry.setAttribute('aHidden', new THREE.BufferAttribute(escondidos, 1));
    for (const nome of ['aIgnition', 'aRecency', 'aSupernova', 'aSeed', 'aHalo']) {
      geometry.setAttribute(nome, new THREE.BufferAttribute(new Float32Array(MAX), 1));
    }
    const pontos = new THREE.Points(geometry, material);
    pontos.frustumCulled = false;
    group.add(pontos);

    const cor = new THREE.Color(KIND_COLORS.doc ?? KIND_COLORS.other);
    for (let i = 0; i < MAX; i += 1) cores.set([cor.r, cor.g, cor.b], i * 3);

    return {
      object: group,
      update(values, camera, clock) {
        const massaCentral = 3644; // o corpus medido em 2026-08-05, para a folga bater com a cena
        const pai = corpo(values.secoes, Math.round(values.massa), values.idade, massaCentral);
        const K = PONTO_POR_RAZAO(camera.fov);
        // O slider fala em pixel CSS (é o que o olho mede); o shader devolve pixel de
        // framebuffer. O DPR é a ponte, e esquecê-lo dobraria o piso em silêncio.
        const { moons, dropped } = moonsOf(pai, massaCentral, hash01, {
          minRadiusOverOuter: values.piso > 0 ? (values.piso * DPR()) / K : 0,
        });

        const externa = moons.length ? moons.at(-1).semiMajor : 1;
        // O tempo é o do relógio da bancada, e ele congela com ORBITAR desligado: banda que se
        // separa só enquanto anda não se separou, separou-se o olho de quem seguiu o movimento.
        const t = values.orbitar ? clock.elapsed : 0;

        let n = 0;
        if (values.pai) {
          posicoes.set([0, 0, 0], 0);
          tamanhos[0] = raioDoPai(pai.chunks);
          n = 1;
        }
        for (const lua of moons) {
          /*
           * A elipse vem de `graph.moonOffset` — a MESMA função que posiciona a lua na cena, e a
           * mesma que o traço da órbita amostra. Uma bancada que reescrevesse a cônica mostraria
           * uma separação de bandas que a cena não tem, e seria descoberta como erro justamente
           * quando alguém confiasse nela para decidir.
           */
          const e = lua.eccentricity;
          const media = lua.meanAnomaly + t * lua.meanMotion;
          const verdadeira = media + 2 * e * Math.sin(media) + 1.25 * e * e * Math.sin(2 * media);
          moonOffset(lua, verdadeira, AT);
          posicoes.set([AT[0] * GRAPH_SPREAD, AT[1] * GRAPH_SPREAD, AT[2] * GRAPH_SPREAD], n * 3);
          tamanhos[n] = moonSpriteSize(lua, { chunks: pai.chunks });
          n += 1;
        }
        // O TRAÇO é o que faz a ordenação radial existir numa imagem parada — ver `moon-orbits.js`.
        if (values.orbitas) {
          if (assinatura !== `${values.piso}|${values.idade}|${values.secoes}|${values.massa}`) {
            assinatura = `${values.piso}|${values.idade}|${values.secoes}|${values.massa}`;
            orbitas.build(moons);
          }
          orbitas.show(ORIGEM, GRAPH_SPREAD);
        } else {
          orbitas.hide();
        }
        for (let i = n; i < MAX; i += 1) escondidos[i] = 1;
        for (let i = 0; i < n; i += 1) escondidos[i] = 0;
        geometry.setDrawRange(0, MAX);
        geometry.getAttribute('position').needsUpdate = true;
        geometry.getAttribute('aSize').needsUpdate = true;
        geometry.getAttribute('aHidden').needsUpdate = true;
        material.uniforms.uTime.value = t;

        /*
         * O enquadramento canônico é IMPOSTO, não sugerido.
         *
         * A direção do olhar continua sendo do operador — só o módulo da distância é reescrito.
         * Sem isso, a leitura de px na tela dependeria de quanto ele rolou a roda, e a única
         * pergunta que este espécime existe para responder deixaria de ter resposta estável.
         */
        if (values.enquadrar) {
          camera.position.setLength((externa * GRAPH_SPREAD) / Math.tan((camera.fov * Math.PI) / 360));
        }

        const raioLua = moons.length ? moonSpriteSize(moons[0], { chunks: pai.chunks }) : 0;
        const dpr = DPR();
        const pxNoEnquadramento = (K * (raioLua / externa)) / dpr;
        const banda = moons.length > 1 ? moons[1].semiMajor - moons[0].semiMajor : 0;
        ctx.report({
          luas: `${moons.length}${dropped ? ` (−${dropped})` : ''}`,
          'lua @ enquadramento': `${pxNoEnquadramento.toFixed(2)} px CSS`,
          'disco visível': `${(pxNoEnquadramento * 0.6).toFixed(2)} px CSS`,
          'separação de banda': `${((K * (banda / externa)) / dpr).toFixed(1)} px CSS`,
          'lua ÷ pai': `${((raioLua / raioDoPai(pai.chunks)) * 100).toFixed(2)}%`,
          'órbita ÷ raio do pai': (externa / raioDoPai(pai.chunks)).toFixed(1),
          excentricidade: moons.length ? moons[0].eccentricity.toFixed(4) : '—',
          'piso pedido': values.piso > 0 ? `${values.piso.toFixed(2)} px` : 'DESLIGADO (modelo anterior)',
        });
      },
      dispose() {
        orbitas.dispose();
        geometry.dispose();
        material.dispose();
      },
    };
  },
};
