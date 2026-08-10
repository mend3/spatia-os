/**
 * AS PELES DE COMETA, NEBULOSA E ESTAÇÃO — uma por espécime, com o eixo que as define aberto.
 *
 * É a REGRA DA INSPEÇÃO aplicada ao PARÂMETRO e não ao objeto: desenhar a pele não basta se o
 * número que a caracteriza não tem régua. `COROA SOB A PELE` desenha as três, mas com o nó falso
 * pinado — ele julga a coroa, não a pele.
 *
 * ## O que estes três espécimes têm em comum, e por que isso importa
 *
 * Os controles MULTIPLICAM ou ALIMENTAM a derivação — nunca a substituem. `churn` e `sections`
 * entram como o FATO DO GRAFO que a cena tem (commits na janela, títulos no corpo do arquivo) e
 * `*Params` decide o resto. Se a lei mudar, o painel muda junto; um espécime que escrevesse
 * `coma: 1.8` direto aprovaria uma pele que a cena não desenha mais.
 */
import * as THREE from 'three';
import { KIND_COLORS } from '../space/graph.js';
import { diskPx } from '../space/galaxy.js';
import {
  createComet,
  cometParams,
  LOD_FAR_PX as COMET_FAR,
  LOD_NEAR_PX as COMET_NEAR,
} from '../space/comet.js';
import {
  createNebula,
  nebulaParams,
  LOD_FAR_PX as NEBULA_FAR,
  LOD_NEAR_PX as NEBULA_NEAR,
} from '../space/nebula.js';
import {
  createStation,
  stationParams,
  LOD_FAR_PX as STATION_FAR,
  LOD_NEAR_PX as STATION_NEAR,
} from '../space/station.js';
import { APARENCIAS, CONTEXTO } from '../space/favoritos.js';

/**
 * As aparências que o cometa pode vestir, LIDAS do catálogo — `nenhuma` é o modo procedural.
 *
 * ☠️ **Objeto com dois modos precisa dos DOIS na bancada**, senão o caminho onde o defeito mora não
 * é desenhável. O núcleo tem o modo rocha (`uRock`) e o modo pele (`uMapa`), e é justamente na
 * troca que o `uUsaMapa` pode ficar preso — um defeito que a cena esconde, porque lá quase nenhum
 * corpo está marcado.
 */
const PELES_DO_NUCLEO = ['nenhuma', ...Object.keys(APARENCIAS[CONTEXTO.ROCHOSO])];

/**
 * O nó mínimo que os três `*Params` leem, com os DOIS fatos que o censo achou parados abertos ao
 * operador.
 *
 * `churn` é a contagem de commits na janela de 30 dias, e a escala não é livre: as três peles a
 * normalizam por `log2(1 + 27)`, então 27 é onde a atividade satura em 1. `sections` é a lista de
 * títulos do arquivo — só o COMPRIMENTO é lido, então preenchê-la com marcas basta e evita
 * inventar conteúdo que ninguém consulta.
 */
const noFalso = ({ semente, massa, churn = 0, secoes = 0 }) => ({
  source: `bancada/pele-${semente.toFixed(3)}`,
  chunks: Math.round(massa),
  sections: Array.from({ length: Math.round(secoes) }, (_, i) => `§${i}`),
  churn,
  massRank: 0.5,
});

/** O raio aparente do corpo, na mesma régua de `lod.js`: pixels de FRAMEBUFFER. */
function pixels(raio, camera) {
  const alturaFb = document.querySelector('canvas')?.height ?? window.innerHeight;
  return diskPx(raio, camera.position.length(), alturaFb, camera.fov);
}

/** O rótulo do nível de detalhe, igual em todas as peles: fora, transição, ou cheio. */
const nivelDe = (px, far, near) => (px < far ? `AUSENTE (<${far})` : px > near ? 'CHEIO' : 'transição');

/** Controles que os três compartilham. Repeti-los à mão faria três réguas divergirem com o tempo. */
const COMUNS = [
  { key: 'semente', label: 'SEMENTE (caminho)', type: 'range', min: 0, max: 1, step: 0.001, value: 0.31 },
  { key: 'tipo', label: 'TIPO (kind)', type: 'enum', options: Object.keys(KIND_COLORS), value: 'code' },
  { key: 'massa', label: 'MASSA (chunks)', type: 'range', min: 1, max: 240, step: 1, value: 60 },
  { key: 'raio', label: 'RAIO DO ASTRO', type: 'range', min: 0.1, max: 2, step: 0.01, value: 1 },
];

// ------------------------------------------------------------------------------- COMETA

export const COMET_SPEC = {
  id: 'cometa',
  name: 'COMETA',
  /*
   * 9 põe o corpo bem acima de `LOD_NEAR_PX` (110) e ainda deixa a cauda inteira no quadro: ela
   * chega a 9 raios no máximo de atividade (`TAIL_MAX`), e é ela, não o núcleo, que decide o
   * enquadramento desta pele.
   */
  distance: 9,
  controls: [
    ...COMUNS,
    /*
     * O EIXO DO ESPÉCIME. Tudo o que faz um cometa parecer um cometa — coma, as duas caudas e a
     * densidade delas — sai deste número por `log2(1+churn)/log2(28)`, que satura em 27 commits.
     */
    { key: 'churn', label: 'COMMITS NA JANELA', type: 'range', min: 0, max: 40, step: 1, value: 8 },
    /*
     * Multiplicador SÓ da cauda, e ele não é redundante com o de cima: `churn` move coma, cauda e
     * densidade JUNTOS, e é justamente por isso que ele não isola nada. A pergunta "a cauda está
     * comprida demais para esta coma?" só tem como ser feita separando os dois.
     */
    { key: 'cauda', label: 'CAUDA ×', type: 'range', min: 0, max: 2, step: 0.01, value: 1 },
    /*
     * O ÂNGULO DA FONTE gira o cometa em volta da origem — e a origem é onde a bancada desenha o
     * marcador da estrela. As duas caudas apontam para longe DELA e o crescente do núcleo é aceso
     * por ela: sem poder mover a fonte, "a cauda aponta para o lado certo" é uma frase que se
     * confere uma vez, no ângulo em que o espécime nasceu.
     */
    { key: 'angulo', label: 'ÂNGULO DA FONTE', type: 'range', min: 0, max: 6.28, step: 0.01, value: 0 },
    { key: 'reduzido', label: 'MOVIMENTO REDUZIDO', type: 'bool', value: false },
    { key: 'pele', label: 'APARÊNCIA DO NÚCLEO', type: 'enum', options: PELES_DO_NUCLEO, value: 'nenhuma' },
  ],
  watch: [
    'APARÊNCIA volta a `nenhuma`: a rocha tem de voltar EXATAMENTE ao cinza — se sobrar tinta da pele, `uUsaMapa` ficou preso',
    'com pele, o CRESCENTE continua lá: a marca troca a cor da rocha, nunca o terminador — é ele que diz que aquilo é sólido',
    'gire o corpo com a pele ligada: a textura acompanha a rocha. Presa no espaço = a UV saiu do mundo em vez do modelo',
    'as DUAS caudas saem para o MESMO lado, longe da fonte — íon ciano e reta, poeira amarela e arqueada',
    'gire o ÂNGULO DA FONTE: as caudas acompanham. Presas a um lado da tela = eixo de câmera',
    'com o tempo CORRENDO as duas escoam em ritmos diferentes (íon 2,2s, poeira 4,6s)',
    'o crescente do núcleo aponta PARA a fonte; as caudas, para o lado oposto',
    'COMMITS a zero: caroço escuro quase sem gás — não pode sumir, o núcleo é rocha',
    'COMMITS acima de 27: nada cresce, a atividade satura ali por definição',
    `RAIO abaixo de ${COMET_FAR}px de framebuffer: a pele some. Acima de ${COMET_NEAR}px: detalhe cheio`,
  ],
  build(ctx) {
    const grupo = new THREE.Group();
    const comet = createComet();
    grupo.add(comet.object);

    /*
     * O MARCADOR DA FONTE, e ele é a única coisa aqui que a cena não desenha.
     *
     * Está declarado como referência, não como astro: uma esfera lisa, sem shader, sem bloom. A
     * estrela de verdade é a fotosfera, e ela tem espécime próprio — copiá-la aqui daria duas
     * versões dela na bancada, que é exatamente o que o cabeçalho de `specs.js` proíbe. O que este
     * ponto precisa afirmar é uma coisa só: ONDE está a fonte que empurra as caudas.
     */
    const fonte = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff0d6 })
    );
    grupo.add(fonte);

    /** Distância do corpo à fonte, em unidades de mundo. Fixa: o que varre é o ÂNGULO. */
    const ORBITA = 3;
    const posicao = new THREE.Vector3();

    /*
     * As texturas por NOME, carregadas sob demanda e guardadas — a bancada troca de pele a cada
     * clique, e recarregar o JPEG a cada troca mediria a rede em vez do shader.
     */
    const texturas = new Map();
    const texturaDe = (nome) => {
      if (nome === 'nenhuma') return null;
      if (!texturas.has(nome)) {
        const t = new THREE.TextureLoader().load(`/${APARENCIAS[CONTEXTO.ROCHOSO][nome].arquivo}`);
        // O JPEG está em sRGB e o shader calcula em linear — o mesmo conserto da cena.
        t.colorSpace = THREE.SRGBColorSpace;
        texturas.set(nome, t);
      }
      return texturas.get(nome);
    };

    /** A uniform que o shader de fato lê, achada por QUEM a declara. */
    const usaMapa = () =>
      comet.object.children.find((n) => n.material?.uniforms?.uUsaMapa)?.material.uniforms.uUsaMapa
        .value;

    return {
      object: grupo,
      update(values, camera, clock) {
        const cor = KIND_COLORS[values.tipo] ?? KIND_COLORS.other;
        const base = cometParams(noFalso(values), cor);
        const params = { ...base, tail: base.tail * values.cauda, mapa: texturaDe(values.pele) };

        posicao.set(Math.cos(values.angulo) * ORBITA, 0, Math.sin(values.angulo) * ORBITA);
        comet.object.position.copy(posicao);
        comet.object.scale.setScalar(values.raio);

        const px = pixels(values.raio, camera);
        const nivel = comet.update(params, posicao, camera, px, clock.elapsed, values.reduzido);

        // A atividade não é devolvida por `cometParams` — ela é o fator interno de que os outros
        // três saem. Recuperada de `amount` (`0,25 + atividade·0,75`), que é a única inversa
        // exata: coma e cauda passam por grampos e perdem a informação nos extremos.
        const atividade = (base.amount - 0.25) / 0.75;
        ctx.report({
          atividade: `${atividade.toFixed(2)}${atividade > 0.999 ? ' (saturada)' : ''}`,
          coma: `${base.coma.toFixed(2)} raios`,
          cauda: `${params.tail.toFixed(2)} raios`,
          núcleo: `${base.nucleus.toFixed(3)} raios`,
          // `uUsaMapa` sai do PIXEL, não do controle: é a uniform que o shader lê, e é ela que fica
          // presa quando a troca de modo falha. Repetir o controle aqui não provaria nada.
          // ⚠️ Procurado por QUEM DECLARA a uniform, nunca por índice: `children[0]` vira outra peça
          // no dia em que a ordem de montagem mudar, e a sonda passa a medir o gás.
          pele: `${values.pele} · uUsaMapa ${usaMapa() ?? '—'}`,
          pixels: px.toFixed(0),
          nível: `${nivel.toFixed(2)} · ${nivelDe(px, COMET_FAR, COMET_NEAR)}`,
        });
      },
      dispose() {
        comet.dispose?.();
        for (const t of texturas.values()) t.dispose();
        texturas.clear();
        fonte.geometry.dispose();
        fonte.material.dispose();
      },
    };
  },
};

// ------------------------------------------------------------------------------ NEBULOSA

export const NEBULA_SPEC = {
  id: 'nebulosa',
  name: 'NEBULOSA',
  /*
   * A nuvem chega a `SPAN × 1,27` raios do corpo e é a pele de maior `SKIN_EXTENT` do catálogo
   * (3,4 em `lod.js`) — o recuo aqui acompanha, senão o espécime abre com a nuvem cortada pelo
   * quadro e a primeira coisa que ele mostra é um defeito que não existe.
   */
  distance: 11,
  controls: [
    ...COMUNS,
    /*
     * O EIXO: a CAVIDADE sai da contagem de títulos do arquivo, e ela é o único lugar em que o
     * CONTEÚDO do documento vira forma nesta pele. A faixa é estreita (0,14–0,46) e satura em 9
     * títulos — a régua vai a 14 para mostrar onde ela para.
     */
    { key: 'secoes', label: 'SEÇÕES (títulos)', type: 'range', min: 0, max: 14, step: 1, value: 3 },
    /*
     * Multiplicador da oitava fina. Não é redundante com a cavidade: uma decide o VAZIO no meio,
     * a outra o quanto a borda é rendilhada. Elas se somam no mesmo pixel e é aí que se confundem.
     */
    { key: 'filamento', label: 'FILAMENTO ×', type: 'range', min: 0, max: 2, step: 0.01, value: 1 },
    { key: 'reduzido', label: 'MOVIMENTO REDUZIDO', type: 'bool', value: false },
  ],
  watch: [
    'SEÇÕES para cima: o meio ABRE numa bolha e o gás recua para uma casca',
    'a nuvem não pode ter borda definida — contorno nítido lê como anel, e anel é outra classe',
    'FILAMENTO a zero: nuvem lisa e ainda com volume. Se sumir, a oitava fina virou a nuvem',
    'com o tempo CORRENDO ela ferve no lugar; deslizar de lado é textura rolando',
    'MOVIMENTO REDUZIDO congela o relógio, não a amplitude: a estrutura fica',
    'MASSA muda a EXTENSÃO em raios do corpo — confira com a ESFERA DE RAIO 1',
    `RAIO abaixo de ${NEBULA_FAR}px de framebuffer: some. Acima de ${NEBULA_NEAR}px: detalhe cheio`,
  ],
  build(ctx) {
    const nebula = createNebula();
    return {
      object: nebula.object,
      update(values, camera, clock) {
        const cor = KIND_COLORS[values.tipo] ?? KIND_COLORS.other;
        const base = nebulaParams(noFalso(values), cor);
        /*
         * ⚠️ `filament` é grampeado em 1: acima disso o shader soma mais oitava fina do que a
         * amplitude total admite e a nuvem estoura em branco. O grampo é do espécime, não da
         * derivação — a régua vai a 2 para MOSTRAR onde o teto está, e o número no readout diz
         * quando o slider deixou de mudar a imagem.
         */
        const filament = Math.min(base.filament * values.filamento, 1);
        const params = { ...base, filament };

        nebula.object.scale.setScalar(values.raio);
        const px = pixels(values.raio, camera);
        const nivel = nebula.update(params, camera, px, clock.elapsed, values.reduzido);

        ctx.report({
          cavidade: base.cavity.toFixed(3),
          filamento: `${filament.toFixed(2)}${base.filament * values.filamento > 1 ? ' ⚠️ NO TETO' : ''}`,
          extensão: `${base.span.toFixed(2)} raios`,
          densidade: base.amount.toFixed(2),
          pixels: px.toFixed(0),
          nível: `${nivel.toFixed(2)} · ${nivelDe(px, NEBULA_FAR, NEBULA_NEAR)}`,
        });
      },
      dispose: () => nebula.dispose(),
    };
  },
};

// ------------------------------------------------------------------------------- ESTAÇÃO

export const STATION_SPEC = {
  id: 'estacao',
  name: 'ESTAÇÃO',
  distance: 5,
  controls: [
    ...COMUNS,
    /*
     * SEÇÕES vira MÓDULOS e MASSA vira PAINÉIS — é a única pele em que os dois fatos do nó saem
     * como CONTAGEM DISCRETA em vez de intensidade. Discreto muda o que há para revisar: a peça é
     * REMONTADA a cada mudança (não há interpolar de 3 para 5 módulos), e é a remontagem que este
     * espécime exercita.
     */
    { key: 'secoes', label: 'SEÇÕES (módulos)', type: 'range', min: 0, max: 16, step: 1, value: 6 },
    /*
     * O FAROL, pela mesma lei de atividade do cometa: `log2(1+churn)/log2(28)`. Em zero ele fica
     * escuro, que é a leitura certa de um agente que ninguém tocou.
     */
    { key: 'churn', label: 'COMMITS NA JANELA', type: 'range', min: 0, max: 40, step: 1, value: 6 },
  ],
  watch: [
    'mova SEÇÕES devagar: a peça REMONTA em degraus — módulo é contagem inteira, não se interpola',
    'MASSA muda painéis e proporção do casco, nunca o tamanho na tela (esse vem do RAIO)',
    'com o tempo CORRENDO o farol pisca a 0,9 Hz na ponta; COMMITS a zero o apaga',
    'SEMENTE muda a pose e o passo dos painéis — duas de mesma massa não nascem iguais',
    `RAIO abaixo de ${STATION_FAR}px de framebuffer: some. Acima de ${STATION_NEAR}px: opacidade cheia`,
  ],
  build(ctx) {
    const station = createStation();
    return {
      object: station.object,
      update(values, camera, clock) {
        const cor = KIND_COLORS[values.tipo] ?? KIND_COLORS.other;
        const params = stationParams(noFalso(values), cor);
        station.object.scale.setScalar(values.raio);
        const px = pixels(values.raio, camera);
        const nivel = station.update(params, px, clock.elapsed);

        ctx.report({
          módulos: params.modules,
          painéis: params.panels,
          casco: `${params.length.toFixed(2)} raios`,
          farol: params.beacon.toFixed(2),
          pose: `${((params.yaw * 180) / Math.PI).toFixed(0)}° / ${((params.pitch * 180) / Math.PI).toFixed(0)}°`,
          pixels: px.toFixed(0),
          nível: `${nivel.toFixed(2)} · ${nivelDe(px, STATION_FAR, STATION_NEAR)}`,
        });
      },
      dispose: () => station.dispose(),
    };
  },
};
