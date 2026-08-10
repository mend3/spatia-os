/**
 * OS DOIS OBJETOS QUE NÃO SÃO CORPO — o envoltório da supernova e os vínculos do grafo.
 *
 * Os dois são raros na cena pela mesma razão: o remanescente só existe acima de um piso de churn
 * que quase nenhum arquivo cruza, e o vínculo só existe enquanto o cursor está sobre um astro. Um
 * objeto que aparece por acidente e some antes de ser olhado não tem como ser revisado lá — que é
 * a definição de espécime de bancada.
 */
import * as THREE from 'three';
import { KIND_COLORS } from '../space/graph.js';
import { createRemnant } from '../space/remnant.js';
import { createLinks } from '../space/links.js';

// ------------------------------------------------------------------- CASCA DE SUPERNOVA

export const REMNANT_SPEC = {
  id: 'remanescente',
  name: 'CASCA DE SUPERNOVA',
  /*
   * O quad chega a 2,03 raios do corpo (`ENV_OUTER` mais os lobos), e é ele que enquadra. A 5,
   * um corpo de raio 1 ocupa a metade central e a casca inteira cabe com folga para os lobos
   * saírem — que é justamente o contorno que este espécime existe para olhar.
   */
  distance: 5,
  controls: [
    /*
     * A QUANTIDADE é `node.supernova` — churn na janela acima do piso, normalizado. É o eixo do
     * espécime, e o piso (`SUPERNOVA_FLOOR`) é o que torna este desenho raro no céu.
     */
    { key: 'quantidade', label: 'SUPERNOVA', type: 'range', min: 0, max: 1, step: 0.01, value: 0.6 },
    /*
     * A SEMENTE é a mesma que o sprite usa (`graph.starSeed`), e ela é o único parâmetro de FORMA:
     * os lobos do contorno saem dela. Sem varrê-la, um espécime aprovaria a única casca que o
     * acaso lhe deu — e o modo de falha deste objeto é uma semente cair num contorno REGULAR, que
     * lê como anel.
     */
    { key: 'semente', label: 'SEMENTE', type: 'range', min: 0, max: 1, step: 0.001, value: 0.42 },
    { key: 'tipo', label: 'TIPO (kind)', type: 'enum', options: Object.keys(KIND_COLORS), value: 'code' },
    { key: 'raio', label: 'RAIO DO ASTRO', type: 'range', min: 0.1, max: 2, step: 0.01, value: 1 },
    /*
     * O NÚCLEO OPACO existe para provar a decisão de `depthTest: false`. Com ele ligado, a casca
     * tem de continuar visível NA FRENTE da esfera; se o miolo brilhante desaparecer e sobrar um
     * aro fino no limbo, o teste de profundidade voltou — e a nebulosidade vira contorno, que é a
     * leitura de ANEL que o `envelope()` existe para não dar.
     */
    { key: 'nucleo', label: 'NÚCLEO OPACO', type: 'bool', value: true },
  ],
  watch: [
    'com NÚCLEO OPACO a casca fica NA FRENTE da esfera; só um aro no limbo = depthTest voltou',
    'o contorno é ONDULADO e sem borda definida — nítido lê como anel',
    'varra a SEMENTE inteira: nenhuma pode dar contorno redondo e regular',
    'não pisca com o tempo CORRENDO — supernova aqui é estado, não evento',
    'SUPERNOVA abaixo de 0,004: some por inteiro, sem resíduo',
    'é billboard: orbitar não muda a pose, e ela também não pode girar sobre si mesma',
  ],
  build(ctx) {
    const grupo = new THREE.Group();
    const remnant = createRemnant();
    grupo.add(remnant.object);

    /*
     * O núcleo é uma esfera lisa e OPACA de propósito: ela não representa astro nenhum, ela é o
     * oclusor. Uma fotosfera de verdade aqui traria o shader dela para dentro de um espécime que
     * julga outra coisa — e a fotosfera já tem o próprio.
     */
    const nucleo = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0x2a3140 })
    );
    grupo.add(nucleo);

    const ORIGEM = new THREE.Vector3();

    return {
      object: grupo,
      update(values, camera) {
        const cor = KIND_COLORS[values.tipo] ?? KIND_COLORS.other;
        nucleo.visible = values.nucleo;
        nucleo.scale.setScalar(values.raio);
        remnant.update(ORIGEM, values.raio, values.quantidade, values.semente, cor, camera);
        ctx.report({
          supernova: values.quantidade.toFixed(2),
          desenhando: remnant.object.visible ? 'sim' : 'não (< 0,004)',
          extensão: `${(2.1 / 0.6).toFixed(2)} raios do sprite · 2,03 do corpo`,
          oclusor: values.nucleo ? 'ligado' : 'desligado',
        });
      },
      dispose() {
        remnant.dispose();
        nucleo.geometry.dispose();
        nucleo.material.dispose();
      },
    };
  },
};

// ---------------------------------------------------------------------------- VÍNCULOS

/** Teto de `links.js`. Espelhado aqui só para o readout poder NOMEAR o corte — ver `watch`. */
const MAX_LINKS = 28;

export const LINKS_SPEC = {
  id: 'vinculos',
  name: 'VÍNCULOS DO GRAFO',
  distance: 40,
  controls: [
    { key: 'nos', label: 'NÓS', type: 'range', min: 2, max: 60, step: 1, value: 24 },
    /*
     * ⚠️ A régua passa de 28 DE PROPÓSITO. `links.js` corta em `MAX_LINKS` "em silêncio", e o
     * `show` devolve quantos aceitou justamente para quem escreve a legenda não nomear vínculo
     * que a tela não desenhou. Um espécime que parasse em 28 nunca exercitaria o corte, e o corte
     * é o comportamento mais fácil de quebrar sem ninguém ver.
     */
    { key: 'vinculos', label: 'VÍNCULOS PEDIDOS', type: 'range', min: 0, max: 44, step: 1, value: 12 },
    /*
     * A FORÇA é `edgeOpacity` do painel da cena, na mesma faixa. Zero apaga, e é estado legítimo.
     */
    { key: 'forca', label: 'FORÇA DO VÍNCULO', type: 'range', min: 0, max: 1, step: 0.02, value: 0.55 },
    /*
     * MOSTRAR é o A/B do desvanecimento: `links.js` nunca some de um quadro para o outro, e a
     * única forma de conferir isso é ligar e desligar olhando.
     */
    { key: 'mostrar', label: 'MOSTRAR', type: 'bool', value: true },
    /*
     * A ÓRBITA é o coração deste espécime. As posições correm com `ω ∝ r^-1.5`, e é esse
     * cisalhamento que desmancha qualquer estrutura transportada entre quadros. O arco sobrevive
     * porque é RECALCULADO; com as posições paradas a diferença é invisível.
     */
    { key: 'orbita', label: 'NÓS EM ÓRBITA', type: 'bool', value: true },
  ],
  watch: [
    'VÍNCULOS PEDIDOS acima de 28: `aceitos` para de crescer — é o teto de MAX_LINKS',
    'cada arco sai para FORA; nenhum atravessa a origem, onde fica o buraco negro',
    'as duas PONTAS desvanecem — ponta dura vira barra apontando para o astro',
    'com o tempo CORRENDO um PULSO percorre o arco no sentido filho→pai',
    'NÓS EM ÓRBITA ligado por 20s: os arcos acompanham as posições vivas e NÃO se enrolam',
    'MOSTRAR desligado: desvanecem em ~0,22s, nunca de um quadro para o outro',
    'FORÇA a zero apaga tudo — é o mesmo zero do painel da cena',
  ],
  build(ctx) {
    const grupo = new THREE.Group();
    const links = createLinks();
    grupo.add(links.object);

    const MAX_NOS = 60;
    const posicoes = new Float32Array(MAX_NOS * 3);
    /** Raio e fase de cada nó. Fixos no nascimento: o que corre é a fase, não o arranjo. */
    const orbitas = Array.from({ length: MAX_NOS }, (_, i) => ({
      raio: 8 + (i % 7) * 3.4,
      fase: (i * 2.399) % (Math.PI * 2),
      altura: ((i % 5) - 2) * 1.6,
    }));

    /*
     * Marcadores dos nós — pontos lisos, e declaradamente NÃO o sprite da cena. O sprite tem
     * espécime próprio (`COROA SOB A PELE`), e trazê-lo para cá somaria bloom aditivo por cima
     * justamente das pontas que este espécime existe para olhar desvanecerem.
     */
    const geoNos = new THREE.BufferGeometry();
    geoNos.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
    const nos = new THREE.Points(
      geoNos,
      new THREE.PointsMaterial({ color: 0x8fa2bd, size: 4, sizeAttenuation: false })
    );
    nos.frustumCulled = false;
    grupo.add(nos);

    return {
      object: grupo,
      update(values, camera, clock) {
        const total = Math.round(values.nos);
        const tempo = values.orbita ? clock.elapsed : 0;
        for (let i = 0; i < total; i++) {
          const { raio, fase, altura } = orbitas[i];
          // ω ∝ r^-1.5 — a lei de Kepler, e a origem do cisalhamento. Uma velocidade única para
          // todos os nós faria os arcos nunca se torcerem, e o espécime deixaria de medir isso.
          const angulo = fase + tempo * (0.9 / Math.pow(raio, 1.5)) * 12;
          posicoes[i * 3] = Math.cos(angulo) * raio;
          posicoes[i * 3 + 1] = altura;
          posicoes[i * 3 + 2] = Math.sin(angulo) * raio;
        }
        geoNos.setDrawRange(0, total);
        geoNos.attributes.position.needsUpdate = true;

        /*
         * Pares filho→pai numa ÁRVORE, que é o que `/api/graph` entrega hoje. Ligar tudo ao nó 0
         * daria um leque de arcos idênticos, e o caso que quebra o desenho é o outro: cordas de
         * comprimentos MUITO diferentes, onde o `BULGE` é fração da corda e o arco curto quase
         * não sai do lugar.
         */
        const pedidos = Math.min(Math.round(values.vinculos), Math.max(total - 1, 0));
        const pares = [];
        for (let i = 1; i <= pedidos; i++) pares.push([i % total, Math.floor(i / 3) % total]);
        const aceitos = links.show(values.mostrar ? pares : [], 0xffb35c);

        links.update(posicoes, clock.delta, clock.elapsed, values.forca);

        ctx.report({
          nós: total,
          pedidos: pedidos,
          aceitos: `${aceitos}${pedidos > MAX_LINKS ? ` ⚠️ TETO ${MAX_LINKS}` : ''}`,
          força: values.forca.toFixed(2),
          órbita: values.orbita ? 'correndo' : 'parada',
        });
      },
      dispose() {
        links.dispose();
        geoNos.dispose();
        nos.material.dispose();
      },
    };
  },
};
