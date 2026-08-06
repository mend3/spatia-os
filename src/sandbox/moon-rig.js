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
import { createPointMaterial, hash01, KIND_COLORS } from '../space/graph.js';
import { moonsOf, physicalRadius } from '../space/orbital-zones.js';

/**
 * `gl_PointSize` por unidade da razão `raio da lua / órbita externa`, no enquadramento canônico.
 *
 * É a inversão exata do vertex shader: o ponto vale `uSize·aSize·300/z` e o enquadramento fixa
 * `z = outer/tan(fov/2)`, então `px = uSize·300·tan(fov/2)·(aSize/outer)` — o `outer` cancela e
 * sobra uma constante. `4,6` é o `uSize` do material e `300` é o `POINT_SCALE` do shader; o
 * `tan(fov/2)` vem do `fov` da bancada, então ele entra na hora.
 */
const PONTO_POR_RAZAO = (fov) => 4.6 * 300 * Math.tan((fov * Math.PI) / 360);

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
  // `a_corte = ROCHE_FLUID · DENSITY_K · (3·M)^(1/3)`, invertido para o slider falar em folga.
  const corte = 2.44 * physicalRadius(3 * massaCentral);
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
    { key: 'piso', label: 'PISO DE LEGIBILIDADE (px)', type: 'range', min: 0, max: 10, step: 0.25, value: 4.5 },
    { key: 'idade', label: 'IDADE DO PAI (folga da janela)', type: 'range', min: 1.02, max: 1.8, step: 0.01, value: 1.4 },
    { key: 'secoes', label: 'SEÇÕES DO DOCUMENTO', type: 'range', min: 5, max: 24, step: 1, value: 9 },
    { key: 'massa', label: 'MASSA DO PAI (chunks)', type: 'range', min: 5, max: 120, step: 1, value: 11 },
    { key: 'enquadrar', label: 'ENQUADRAR O SISTEMA', type: 'bool', value: true },
    { key: 'orbitar', label: 'DEIXAR ORBITAR', type: 'bool', value: false },
    { key: 'pai', label: 'DESENHAR O PAI', type: 'bool', value: true },
  ],
  watch: [
    'PISO em 0 é o modelo ANTERIOR (lua de 1,42 px) — o controle, para comparar com o 4,5 da cena',
    'a pergunta não é "a lua existe": é se as BANDAS se separam, e se elas leem como sistema',
    'suba o PISO e conte o que se perde: o número de luas cai para comprar tamanho, não há terceira saída',
    'desligue ENQUADRAR e aproxime: de perto sempre se lê. Isso não responde nada — a cena nunca está lá',
    'IDADE baixa fecha a janela (o corpo raspa o limiar): sobra uma lua, e é assim mesmo',
  ],

  build(ctx) {
    const group = new THREE.Group();
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
           * A MESMA elipse do `graph.js:advance` — anomalia média, raio pelo foco, inclinação que
           * NÃO altera a distância ao pai. É essa última propriedade que faz a banda disjunta
           * provar a não-colisão, então ela precisa estar aqui inteira ou a bancada mostraria uma
           * separação que a cena não tem.
           */
          const anomalia = lua.meanAnomaly + t * lua.meanMotion;
          const e = lua.eccentricity;
          const theta = anomalia + 2 * e * Math.sin(anomalia);
          const r = lua.semiMajor * (1 - e * e) / (1 + e * Math.cos(theta - lua.periapsis));
          posicoes.set(
            [r * Math.cos(theta), r * Math.sin(theta) * Math.sin(lua.inclination), r * Math.sin(theta) * Math.cos(lua.inclination)],
            n * 3
          );
          tamanhos[n] = lua.drawRadius;
          n += 1;
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
          camera.position.setLength(externa / Math.tan((camera.fov * Math.PI) / 360));
        }

        const raioLua = moons.length ? moons[0].drawRadius : 0;
        const dpr = DPR();
        const pxNoEnquadramento = (K * (raioLua / externa)) / dpr;
        const banda = moons.length > 1 ? moons[1].semiMajor - moons[0].semiMajor : 0;
        ctx.report({
          'luas': `${moons.length}${dropped ? ` (−${dropped})` : ''}`,
          'lua @ enquadramento': `${pxNoEnquadramento.toFixed(2)} px CSS`,
          'disco visível': `${(pxNoEnquadramento * 0.6).toFixed(2)} px CSS`,
          'separação de banda': `${(K * (banda / externa) / dpr).toFixed(1)} px CSS`,
          'lua ÷ pai': `${((raioLua / raioDoPai(pai.chunks)) * 100).toFixed(2)}%`,
          'órbita ÷ raio do pai': (externa / raioDoPai(pai.chunks)).toFixed(1),
          'excentricidade': moons.length ? moons[0].eccentricity.toFixed(4) : '—',
          'piso pedido': values.piso > 0 ? `${values.piso.toFixed(2)} px` : 'DESLIGADO (modelo anterior)',
        });
      },
      dispose() {
        geometry.dispose();
        material.dispose();
      },
    };
  },
};
