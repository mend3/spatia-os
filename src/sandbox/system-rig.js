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

/** Massa → raio, a mesma lei do céu (`log2(1 + chunks)`), para o espécime não inventar escala. */
const raioPorMassa = (chunks) => 0.06 + Math.log2(1 + Math.max(chunks, 0)) * 0.035;

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
    { key: 'camera', label: 'DISTÂNCIA DA CÂMERA', type: 'range', min: 8, max: 90, step: 1, value: 34, roll: false },
  ],
  watch: [
    'a ESTRELA é sempre o maior corpo — razão < 1 no painel é a inversão nº 1 do replanejamento',
    'DERIVA acima de zero: o sistema INTEIRO acompanha a estrela. Planeta que fica para trás estava preso a um centro global',
    'com KEPLER ligado o planeta interno corre visivelmente mais que o externo; desligado, todos giram junto e vira carrossel',
    'nenhuma órbita cruza outra — o espaçamento é geométrico e o primeiro nasce fora de Roche (2,44 raios)',
    'PLANETAS em 0: sobra a estrela sozinha, e ela tem de continuar legível (é o caso dos 336 órfãos)',
    'RAIO DO SISTEMA no painel é o número que decide se 221 sistemas cabem sem se atravessar',
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

        const raioEstrela = raioPorMassa(values.massaEstrela);
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
          const raio = raioPorMassa(massa);
          maiorPlaneta = Math.max(maiorPlaneta, raio);

          const a = semiEixo(i, values.espaco) * raioEstrela;
          raioSistema = Math.max(raioSistema, a + raio);

          /*
           * Kepler: T ∝ a^(3/2), logo ω ∝ a^(-3/2). Com o portão desligado, ω é constante — e é
           * essa comparação que mostra por que a lei importa para a LEITURA, não só para a física.
           */
          const omega = values.kepler ? 0.9 * Math.pow(a, -1.5) : 0.12;
          const ang = clock.elapsed * omega + i * 1.7;

          const p = planetas[i];
          p.malha.scale.setScalar(raio);
          p.malha.position.set(Math.cos(ang) * a, 0, Math.sin(ang) * a);
          p.trilha.scale.setScalar(a);
        }
        const razao = maiorPlaneta > 0 ? raioEstrela / maiorPlaneta : Infinity;
        ctx.report({
          'razão estrela/maior planeta': razao === Infinity ? '— (sem planeta)' : razao.toFixed(2),
          'raio da estrela': raioEstrela.toFixed(3),
          'raio do sistema': raioSistema.toFixed(2),
          'sistemas por 100 un.': (100 / Math.max(raioSistema * 2, 0.001)).toFixed(1),
          'kepler': values.kepler ? 'ligado (ω ∝ a^-3/2)' : 'DESLIGADO — carrossel',
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
