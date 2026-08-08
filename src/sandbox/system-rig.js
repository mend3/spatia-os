/**
 * SISTEMA LOCAL — o primeiro espécime da cena UNIVERSO.
 *
 * Ele existe para provar UMA coisa antes de qualquer corpo novo entrar no céu: **gravidade local
 * funciona**. Uma estrela segura os planetas dela, e nada aqui orbita um centro global.
 *
 * ⚠️ **Este espécime NÃO julga pele.** Os corpos são esferas emissivas de propósito — a spec de
 * transição (`docs/replanejamento-celeste.md`) proíbe morfologia nova antes de a classificação
 * estar correta, e desenhar aqui a fotosfera ou o planeta procedural convidaria exatamente isso.
 * O que se revisa é ÓRBITA, MASSA e ESCALA. Se a bola parecer feia, ela está fazendo o trabalho.
 *
 * As leis que ele torna verificáveis, todas do `replanejamento-celeste.md`:
 *
 * 1. **§2.1 — tipo é massa.** A estrela é o corpo mais massivo do sistema, sempre. O painel mostra
 *    a razão, e um planeta maior que a estrela é o defeito nº 1 do céu de hoje reaparecendo.
 * 2. **§1 — não há centro absoluto.** DERIVA move a estrela; o sistema inteiro tem de ir junto.
 *    Se os planetas ficarem para trás, eles estavam presos a um centro global.
 * 3. **§2.8 — o universo é vazio.** RAIO DO SISTEMA existe para medir quanto volume um sistema
 *    ocupa, porque 221 deles vão ter de caber sem se atravessar.
 *
 * E uma lei que não é do documento, é do céu: **Kepler**. `T² ∝ a³` é o que faz um sistema ler
 * como sistema em vez de carrossel — sem ela, todos os planetas giram com a mesma cara e a cena
 * vira um relógio. É a primeira coisa a conferir com o tempo CORRENDO.
 *
 * ---
 *
 * ## ⚠️ O que ele já achou, na primeira execução (2026-08-07)
 *
 * **1. A lei de massa→raio do céu não consegue produzir hierarquia.** `log2(1 + chunks)` comprime
 * a faixa INTEIRA do corpus (1 a 289 chunks) em raios de 0,095 a 0,346 — **3,65× do menor ao maior
 * arquivo que existe**. Uma estrela de 289 chunks ao lado do maior planeta plausível (24) fica
 * **1,56×** maior; na natureza o Sol tem ~10× o raio de Júpiter.
 *
 * Ou seja: **mesmo com a escada de massa corrigida, a estrela não vai parecer dominante.** A
 * inversão nº 1 do replanejamento tem duas metades, e só uma estava documentada — a outra é esta
 * lei de raio. Consertar quem é estrela sem consertar o raio troca a inversão por um empate.
 *
 * **2. O espaçamento geométrico explode.** Com razão 2,0 e 9 planetas, o sistema fica com **433
 * unidades** de raio. São 221 sistemas para caber no mesmo universo; ou o espaçamento tem teto, ou
 * cada sistema é normalizado para um orçamento fixo de volume. O painel publica
 * `raio do sistema` e `sistemas por 100 un.` justamente para essa conta não ser feita de olho.
 */
import * as THREE from 'three';
import { KIND_COLORS } from '../space/graph.js';

/** A lei do céu de hoje. Fica aqui para o A/B — é ela que o achado nº 1 acusa. */
const raioLog = (chunks) => 0.06 + Math.log2(1 + Math.max(chunks, 0)) * 0.035;

/**
 * Massa em que um corpo passa a fundir, em chunks. **Constante calibrada, logo expira.**
 *
 * 20 fica entre o P75 (13) e o P90 (25) do corpus de 2026-08-07, o que põe ~13% dos arquivos acima
 * dela — perto dos 221 sistemas em 1 636 arquivos que a contenção já produz. Não é derivação, é
 * âncora: o número certo sai da escada do §3 do replanejamento, que ainda não está fechada.
 */
const MASSA_FUSAO = 20;

/** Raio no limiar. As duas curvas se ENCONTRAM aqui, e é isso que torna a lei honesta. */
const RAIO_FUSAO = 0.2;

/**
 * Massa → raio com DUAS curvas, porque a natureza tem duas.
 *
 * A lei única (`log2`) comprimia a faixa inteira do corpus em 3,6× e deixava a estrela 1,6× maior
 * que o maior planeta — contra ~10× de Sol para Júpiter. O erro não era o expoente: era supor **uma
 * curva só**.
 *
 * - **Planeta** (`c ≤ MASSA_FUSAO`): `R ∝ M^(1/3)` — a contribuição clássica dos íons, que é
 *   densidade constante. Acima de Júpiter a degenerescência achata a curva (`R ∝ M^-1/8`), e é por
 *   isso que um planeta de 10 massas de Júpiter é quase do tamanho de Júpiter.
 * - **Estrela** (`c > MASSA_FUSAO`): `R ∝ M^0.8` — sequência principal.
 *
 * ⚠️ **As curvas se tocam no limiar, e isso é fato, não conveniência:** objetos perto do limite de
 * queima de hidrogênio têm raio de Júpiter. O maior planeta e a menor estrela são do mesmo tamanho
 * — a dominância nasce da massa ACIMA do limiar, não de um degrau pintado.
 *
 * Medido: faixa do corpus 3,6× → **23×**; estrela de 289 contra planeta no limiar 1,6× → **8,5×**.
 *
 * > Fontes: [ESA · Stars](https://sci.esa.int/web/gaia/-/40576-stars) ·
 * > [Giant Planets (arXiv:1405.3752)](https://arxiv.org/pdf/1405.3752) — o máximo local perto de
 * > 4 M_J e a degenerescência que achata a curva acima dele.
 */
const raioDuasCurvas = (chunks) => {
  const c = Math.max(chunks, 0.001);
  const razao = c / MASSA_FUSAO;
  return RAIO_FUSAO * Math.pow(razao, c <= MASSA_FUSAO ? 1 / 3 : 0.8);
};

/**
 * Semi-eixo da órbita `i`, em raios da estrela.
 *
 * Espaçamento geométrico e não linear: no sistema solar as órbitas crescem por razão (a chamada
 * regra de Titius-Bode é ruim como lei e boa como leitura), e o linear empilha os planetas
 * externos numa faixa só. O primeiro nasce fora do limite de Roche (2,44 raios) porque dentro
 * dele o material não se acreta em corpo — é anel, e anel já tem dono.
 */
const semiEixo = (i, espaco) => 2.44 * Math.pow(espaco, i + 1);

function corpo(cor, raio) {
  const malha = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshBasicMaterial({ color: cor })
  );
  malha.scale.setScalar(raio);
  return malha;
}

export const SYSTEM_SPEC = {
  id: 'sistema-local',
  name: 'SISTEMA LOCAL',
  distance: 34,
  controls: [
    { key: 'massaEstrela', label: 'MASSA DA ESTRELA (chunks)', type: 'range', min: 1, max: 289, step: 1, value: 120 },
    { key: 'planetas', label: 'PLANETAS', type: 'range', min: 0, max: 12, step: 1, value: 4 },
    { key: 'massaMaior', label: 'MASSA DO MAIOR PLANETA', type: 'range', min: 1, max: 289, step: 1, value: 24 },
    { key: 'espaco', label: 'ESPAÇAMENTO ×', type: 'range', min: 1.15, max: 2.2, step: 0.01, value: 1.45 },
    { key: 'inclinacao', label: 'INCLINAÇÃO DO SISTEMA', type: 'range', min: 0, max: 1.2, step: 0.01, value: 0.35 },
    { key: 'deriva', label: 'DERIVA DA ESTRELA', type: 'range', min: 0, max: 8, step: 0.1, value: 0 },
    { key: 'kepler', label: 'OBEDECER KEPLER', type: 'bool', value: true },
    { key: 'lei', label: 'LEI DE RAIO', type: 'enum', options: ['duas curvas', 'log (a do céu)'], value: 'duas curvas' },
    { key: 'orcamento', label: 'ORÇAMENTO DO SISTEMA', type: 'range', min: 0, max: 20, step: 0.5, value: 0 },
    { key: 'camera', label: 'DISTÂNCIA DA CÂMERA', type: 'range', min: 8, max: 90, step: 1, value: 34, roll: false },
  ],
  watch: [
    'a ESTRELA é sempre o maior corpo — razão < 1 no painel é a inversão nº 1 do replanejamento',
    'DERIVA acima de zero: o sistema INTEIRO acompanha a estrela. Planeta que fica para trás estava preso a um centro global',
    'com KEPLER ligado o planeta interno corre visivelmente mais que o externo; desligado, todos giram junto e vira carrossel',
    'nenhuma órbita cruza outra — o espaçamento é geométrico e o primeiro nasce fora de Roche (2,44 raios)',
    'PLANETAS em 0: sobra a estrela sozinha, e ela tem de continuar legível (é o caso dos 336 órfãos)',
    'RAIO DO SISTEMA no painel é o número que decide se 221 sistemas cabem sem se atravessar',
    'LEI DE RAIO em «log»: a estrela encolhe até quase empatar com o planeta — é o achado nº 1 ao vivo',
    'ORÇAMENTO acima de zero: o sistema muda de tamanho e as PROPORÇÕES internas não mudam',
  ],
  build(ctx) {
    const grupo = new THREE.Group();
    const estrela = corpo(0xffd9a0, 1);
    grupo.add(estrela);

    const orbitas = new THREE.Group();
    grupo.add(orbitas);

    /** Um planeta por índice, criado sob demanda e reaproveitado — o slider vai de 0 a 12. */
    const planetas = [];
    const anel = (raio) => {
      const pontos = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        pontos.push(new THREE.Vector3(Math.cos(a) * raio, 0, Math.sin(a) * raio));
      }
      return new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pontos),
        new THREE.LineBasicMaterial({ color: 0x2a3550 })
      );
    };

    function garante(n) {
      while (planetas.length < n) {
        const i = planetas.length;
        const cor = Object.values(KIND_COLORS)[i % Object.values(KIND_COLORS).length];
        const malha = corpo(cor, 0.2);
        const trilha = anel(1);
        orbitas.add(malha, trilha);
        planetas.push({ malha, trilha });
      }
      planetas.forEach((p, i) => {
        p.malha.visible = i < n;
        p.trilha.visible = i < n;
      });
    }

    return {
      object: grupo,
      update(values, camera, clock) {
        const n = Math.round(values.planetas);
        garante(n);

        const raio = values.lei === 'log (a do céu)' ? raioLog : raioDuasCurvas;
        const raioEstrela = raio(values.massaEstrela);
        estrela.scale.setScalar(raioEstrela);
        orbitas.rotation.x = values.inclinacao;

        // A DERIVA move a estrela E o grupo: é o teste de gravidade local. Se algum planeta não
        // acompanhar, ele não está pendurado nela.
        grupo.position.x = Math.sin(clock.elapsed * 0.25) * values.deriva;

        let maiorPlaneta = 0;
        let raioSistema = raioEstrela;
        for (let i = 0; i < n; i++) {
          /*
           * A massa cai com a distância — no sistema solar os gigantes são externos, mas aqui o
           * que importa é a INVERSÃO não acontecer: nenhum planeta pode passar a estrela. O maior
           * é o primeiro, e os demais decaem por razão fixa.
           */
          const massa = values.massaMaior * Math.pow(0.72, i);
          const rp = raio(massa);
          maiorPlaneta = Math.max(maiorPlaneta, rp);

          const a = semiEixo(i, values.espaco) * raioEstrela;
          raioSistema = Math.max(raioSistema, a + rp);

          /*
           * Kepler: T ∝ a^(3/2), logo ω ∝ a^(-3/2). Com o portão desligado, ω é constante — e é
           * essa comparação que mostra por que a lei importa para a LEITURA, não só para a física.
           */
          const omega = values.kepler ? 0.9 * Math.pow(a, -1.5) : 0.12;
          const ang = clock.elapsed * omega + i * 1.7;

          const p = planetas[i];
          p.malha.scale.setScalar(rp);
          p.malha.position.set(Math.cos(ang) * a, 0, Math.sin(ang) * a);
          p.trilha.scale.setScalar(a);
        }
        /*
         * ORÇAMENTO acima de zero normaliza o sistema INTEIRO para caber num raio fixo.
         *
         * É a resposta ao achado nº 2: espaçamento geométrico explode (433 unidades com razão 2,0
         * e 9 planetas), e 221 sistemas não cabem num universo se cada um escolhe o próprio
         * tamanho. Normalizar preserva as PROPORÇÕES internas — que é o que a leitura usa — e
         * troca a escala absoluta, que ninguém lê.
         */
        if (values.orcamento > 0 && raioSistema > 0) {
          grupo.scale.setScalar(values.orcamento / raioSistema);
        } else {
          grupo.scale.setScalar(1);
        }

        const razao = maiorPlaneta > 0 ? raioEstrela / maiorPlaneta : Infinity;
        ctx.report({
          'razão estrela/maior planeta': razao === Infinity ? '— (sem planeta)' : razao.toFixed(2),
          'raio da estrela': raioEstrela.toFixed(3),
          'raio do sistema': raioSistema.toFixed(2),
          'sistemas por 100 un.': (100 / Math.max(raioSistema * 2, 0.001)).toFixed(1),
          'kepler': values.kepler ? 'ligado (ω ∝ a^-3/2)' : 'DESLIGADO — carrossel',
          'lei de raio': values.lei,
          'orçamento': values.orcamento > 0 ? `${values.orcamento} un. (escala ${(values.orcamento / raioSistema).toFixed(3)}×)` : 'livre',
          'inversão de massa': razao >= 1 ? 'não' : 'SIM — planeta maior que a estrela',
        });
        camera.position.setLength(values.camera);
      },
      dispose() {
        grupo.traverse((o) => {
          o.geometry?.dispose();
          o.material?.dispose();
        });
      },
    };
  },
};
