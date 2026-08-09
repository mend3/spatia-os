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
// A lei de raio mora no módulo PURO: a cena e a bancada leem a mesma, e não duas cópias.
import { raioPorMassa as raioDuasCurvas } from '../space/entity-physics.js';

/** A lei do céu de hoje. Fica aqui para o A/B — é ela que o achado nº 1 acusa. */
const raioLog = (chunks) => 0.06 + Math.log2(1 + Math.max(chunks, 0)) * 0.035;

/**
 * Semi-eixo da órbita `i`, em raios da estrela.
 *
 * Espaçamento geométrico e não linear: no sistema solar as órbitas crescem por razão (a chamada
 * regra de Titius-Bode é ruim como lei e boa como leitura), e o linear empilha os planetas
 * externos numa faixa só. O primeiro nasce fora do limite de Roche (2,44 raios) porque dentro
 * dele o material não se acreta em corpo — é anel, e anel já tem dono.
 */
const semiEixo = (i, espaco) => 2.44 * Math.pow(espaco, i + 1);

/**
 * Resolve a equação de Kepler `M = E − e·sin(E)` por Newton — não há forma fechada.
 *
 * É ela que produz a SEGUNDA lei (áreas iguais em tempos iguais), e é por isso que não dá para
 * trapacear com um seno na anomalia média: a anomalia média avança uniforme, a EXCÊNTRICA não, e a
 * diferença entre as duas é exatamente o "acelera no periélio" do briefing.
 *
 * Cinco iterações bastam para `e < 0,9` com folga de várias casas; o `break` sai antes na maioria.
 */
function anomaliaExcentrica(M, e) {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 5; i++) {
    const passo = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= passo;
    if (Math.abs(passo) < 1e-6) break;
  }
  return E;
}

/**
 * Excentricidade do planeta `i`.
 *
 * ⚠️ **O default é PLANETÁRIO, e isso resolve uma contradição aparente.**
 *
 * O briefing diz "o corpo central fica em um foco" e "a velocidade nunca é constante"; a leitura do
 * usuário diz "de cima é um círculo, de lado é uma elipse". As duas estão certas, e o número prova:
 *
 * | e | achatamento | foco fora do centro |
 * |---|---|---|
 * | 0,0167 (Terra) | **0,01%** | 2% de a |
 * | 0,09 | 0,41% | 9% |
 * | 0,43 | 9,7% | 43% |
 *
 * **A órbita da Terra é elíptica e, vista de cima, é indistinguível de um círculo.** Então a elipse
 * que se vê de lado é PROJEÇÃO da inclinação, e a elipse física fica no comportamento — o foco
 * deslocado e a velocidade variável — em vez de na silhueta.
 *
 * A primeira versão deste rig nasceu com base 0,18 e chegava a 0,43 no primeiro planeta: isso não é
 * planeta, é cometa. E é justamente o que o briefing reserva para "objetos de passagem" — a faixa
 * alta continua disponível no controle, para quando um corpo tiver de comunicar isso.
 */
const excentricidade = (i, base) => Math.min(0.86, base * (0.6 + ((i * 7) % 5) * 0.2));

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
    { key: 'deriva', label: 'VELOCIDADE DO SISTEMA', type: 'range', min: 0, max: 3, step: 0.05, value: 0.6 },
    { key: 'rumo', label: 'INCLINAÇÃO DO RUMO', type: 'range', min: 0, max: 1.5, step: 0.01, value: 1.05 },
    { key: 'rastro', label: 'RASTRO HELICOIDAL', type: 'bool', value: true },
    { key: 'excentricidade', label: 'EXCENTRICIDADE', type: 'range', min: 0, max: 0.9, step: 0.005, value: 0.03 },
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
    'a ESTRELA não fica no centro da elipse — ela fica num FOCO. Com EXCENTRICIDADE alta isso salta aos olhos',
    'com o tempo CORRENDO o planeta ACELERA perto da estrela e desacelera longe (2ª lei). Se a velocidade for constante, é ponteiro de relógio',
    'EXCENTRICIDADE em 0: volta ao círculo, e a estrela volta ao centro — é o A/B do briefing',
    'com VELOCIDADE DO SISTEMA acima de zero o rastro vira HÉLICE, não círculo — é a composição de orbitar com viajar',
    'INCLINAÇÃO DO RUMO em 0 dá o «vórtice» dos vídeos: bonito e FALSO. O plano real é inclinado ~60° em relação ao rumo',
    'no default (planetário) a órbita LÊ como círculo de cima; a elipse que se vê de lado é a INCLINAÇÃO, não a excentricidade',
    'a faixa alta (acima de ~0,3) é de objeto de PASSAGEM, não de planeta — cometa, não órbita estável',
  ],
  build(ctx) {
    const grupo = new THREE.Group();
    const estrela = corpo(0xffd9a0, 1);
    grupo.add(estrela);

    const orbitas = new THREE.Group();
    grupo.add(orbitas);

    /** Um planeta por índice, criado sob demanda e reaproveitado — o slider vai de 0 a 12. */
    const planetas = [];
    /*
     * A trilha é um CÍRCULO UNITÁRIO, e a elipse nasce da escala não-uniforme mais o deslocamento
     * do centro. `x = a(cos t − e)` e `z = a√(1−e²) sin t` — que é a elipse com o FOCO na origem,
     * onde a estrela está. Desenhar a elipse ponto a ponto por quadro seria reconstruir geometria
     * 96 vezes por planeta para dizer a mesma coisa.
     */
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

    /*
     * O rastro é do PRIMEIRO planeta, em coordenadas de MUNDO — é lá que a hélice existe. Desenhado
     * no espaço do sistema ele voltaria a ser uma elipse, que é exatamente a ilusão que ele desmente.
     */
    const RASTRO = 420;
    const trilhaPos = new Float32Array(RASTRO * 3);
    const trilhaGeo = new THREE.BufferGeometry();
    trilhaGeo.setAttribute('position', new THREE.BufferAttribute(trilhaPos, 3));
    const rastro = new THREE.Line(trilhaGeo, new THREE.LineBasicMaterial({ color: 0x4a6da8 }));
    rastro.frustumCulled = false;
    let escritos = 0;
    const MUNDO = new THREE.Vector3();

    return {
      object: grupo,
      update(values, camera, clock) {
        if (!rastro.parent) grupo.parent?.add(rastro);
        rastro.visible = values.rastro;
        const n = Math.round(values.planetas);
        garante(n);

        const raio = values.lei === 'log (a do céu)' ? raioLog : raioDuasCurvas;
        const raioEstrela = raio(values.massaEstrela);
        estrela.scale.setScalar(raioEstrela);
        orbitas.rotation.x = values.inclinacao;

        /*
         * O SISTEMA VIAJA, e isso não é enfeite: é a segunda metade do que uma órbita é.
         *
         * O Sol atravessa a galáxia a ~828 mil km/h; os planetas orbitam enquanto isso. A
         * composição das duas coisas não é um círculo — é uma HÉLICE. "Astro parado" não existe no
         * universo, e um sistema estático afirma um referencial absoluto que a cena inteira nega.
         *
         * Serve também como o teste de gravidade local que este rig já fazia: se um planeta não
         * acompanhar a estrela, ele não está pendurado nela.
         *
         * ⚠️ **Sem o exagero do vídeo do "vórtice".** O plano orbital NÃO é perpendicular ao rumo
         * do Sol — ele é inclinado ~60°, e por isso a hélice é ESTICADA, não um redemoinho apertado.
         * INCLINAÇÃO DO RUMO existe para não repetir esse erro: em 0 o plano fica perpendicular e a
         * figura vira a do vídeo, que é bonita e falsa.
         */
        const rumo = new THREE.Vector3(Math.cos(values.rumo), Math.sin(values.rumo) * 0.35, 0).normalize();
        grupo.position.copy(rumo).multiplyScalar(clock.elapsed * values.deriva);

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
          // O afélio é o que fixa o tamanho do sistema: `a(1 + e)`, não o semi-eixo.
          raioSistema = Math.max(raioSistema, a * (1 + excentricidade(i, values.excentricidade)) + rp);

          /*
           * TERCEIRA lei: T ∝ a^(3/2), logo o movimento médio n ∝ a^(-3/2). Com o portão desligado
           * n é constante — e é essa comparação que mostra por que a lei importa para a LEITURA.
           */
          const n_ = values.kepler ? 0.9 * Math.pow(a, -1.5) : 0.12;
          const M = clock.elapsed * n_ + i * 1.7;

          /*
           * SEGUNDA lei, e é ela que o briefing `orbita-eliptica.md` veio corrigir.
           *
           * A anomalia MÉDIA avança uniforme; a posição sai da anomalia EXCÊNTRICA, que não avança.
           * O resultado é o planeta varrer áreas iguais em tempos iguais — rápido no periélio,
           * lento no afélio. Sem isso a órbita vira ponteiro de relógio, que é a sensação
           * artificial que o documento nomeia.
           */
          const ecc = excentricidade(i, values.excentricidade);
          const E = anomaliaExcentrica(M, ecc);
          const b = a * Math.sqrt(1 - ecc * ecc);

          const p = planetas[i];
          p.malha.scale.setScalar(rp);
          // FOCO na origem: `x = a(cos E − e)`. A estrela não fica no centro da elipse — e essa é
          // a primeira frase do briefing.
          p.malha.position.set(a * (Math.cos(E) - ecc), 0, b * Math.sin(E));
          p.trilha.scale.set(a, 1, b);
          p.trilha.position.x = -a * ecc;
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

        // Amostra a posição de MUNDO do primeiro planeta a cada quadro: a hélice se desenha sozinha.
        if (values.rastro && n > 0) {
          planetas[0].malha.getWorldPosition(MUNDO);
          const k = escritos % RASTRO;
          trilhaPos[k * 3] = MUNDO.x; trilhaPos[k * 3 + 1] = MUNDO.y; trilhaPos[k * 3 + 2] = MUNDO.z;
          escritos++;
          trilhaGeo.setDrawRange(0, Math.min(escritos, RASTRO));
          trilhaGeo.attributes.position.needsUpdate = true;
        }

        const razao = maiorPlaneta > 0 ? raioEstrela / maiorPlaneta : Infinity;
        ctx.report({
          'razão estrela/maior planeta': razao === Infinity ? '— (sem planeta)' : razao.toFixed(2),
          'raio da estrela': raioEstrela.toFixed(3),
          'raio do sistema': raioSistema.toFixed(2),
          'sistemas por 100 un.': (100 / Math.max(raioSistema * 2, 0.001)).toFixed(1),
          'kepler': values.kepler ? 'ligado (ω ∝ a^-3/2)' : 'DESLIGADO — carrossel',
          'lei de raio': values.lei,
          'excentricidade (1º planeta)': excentricidade(0, values.excentricidade).toFixed(3),
          'periélio → afélio': `${(1 - excentricidade(0, values.excentricidade)).toFixed(2)} → ${(1 + excentricidade(0, values.excentricidade)).toFixed(2)} × a`,
          'v periélio / v afélio': ((1 + excentricidade(0, values.excentricidade)) / (1 - excentricidade(0, values.excentricidade))).toFixed(2) + '×',
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
