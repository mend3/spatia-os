/**
 * A CENA UNIVERSO — sistemas locais, sem centro absoluto.
 *
 * O céu de hoje (cena AGENTE) põe o buraco negro no meio e faz os 1 636 arquivos orbitarem ele por
 * recência. Esta cena nega as duas coisas: **cada estrela domina só a vizinhança dela**, e o volume
 * se organiza em nós e vazios em vez de uniformemente.
 *
 * Ver `docs/replanejamento-celeste.md` (a spec) e `docs/briefings/multi-scene.md` (o briefing).
 * Cada lei aqui foi derivada e medida antes na bancada — `SISTEMA LOCAL` e `UNIVERSO`:
 *
 * | lei | onde foi validada | medida |
 * |---|---|---|
 * | massa → raio em duas curvas | `system-rig` | razão estrela/planeta 1,36 → 3,62 |
 * | órbita elíptica com a estrela no FOCO | `system-rig` | área varrida máx/mín = 1,0008 |
 * | excentricidade planetária | `system-rig` | 0,018–0,042 (Terra 0,017) |
 * | teia cósmica com rejeição | `universe-rig` | 30 tentativas → 0 colisões |
 *
 * ⚠️ **Nenhuma morfologia nova.** Corpos são esferas; a spec proíbe pele nova enquanto a
 * classificação não fechar, e o que esta cena entrega é ESTRUTURA — quem orbita quem, e onde.
 *
 * ⚠️ **A classificação vem de `entity-physics.js`, não daqui.** Estrela é a entidade DOMINANTE do
 * sistema, e isso torna a inversão de massa impossível por construção: a dominante é a mais massiva,
 * logo nenhum planeta pode ser maior que a sua estrela.
 */
import * as THREE from 'three';
import { entityPhysics, classificar, raioPorMassa } from './entity-physics.js';
import { KIND_COLORS } from './graph.js';

/**
 * Escala do universo, em unidades de mundo.
 *
 * ⚠️ **Ela cabe no ZOOM da câmera de hoje, e isso é decisão.** A primeira versão usou raio 150 e
 * pediu para a câmera esticar até 420 — mas a distância é limitada por `ZOOM_RANGE`, e esticar o
 * teto de um modo mexe no outro. A bancada já tinha ensinado a resposta certa no espécime UNIVERSO:
 * **normalizar o mundo ao orçamento** preserva as proporções internas, que é o que a leitura usa, e
 * troca só a escala absoluta, que ninguém lê.
 */
const RAIO_UNIVERSO = 52;
/**
 * Nós da teia cósmica.
 *
 * ⚠️ Subiu de 9 para 16 depois de VER: com 9, cada nó recebia ~25 sistemas e o miolo virava uma
 * massa única em que nenhum corpo se distinguia. Mais nós é menos aperto por nó, mantendo os
 * vazios — que é o que a estrutura em grande escala afirma. Menos que isso vira nuvem; muito mais
 * vira uniforme, e uniforme é a distribuição que esta cena existe para negar.
 */
const NOS = 16;
/** Tentativas de reposicionamento antes de desistir. 30 zerou as colisões na bancada. */
const TENTATIVAS = 30;
/** Excentricidade base — faixa PLANETÁRIA. De cima lê como círculo; a elipse lateral é inclinação. */
const EXCENTRICIDADE = 0.03;
/** Velocidade do sistema pela galáxia. Astro parado não existe; a composição é uma hélice. */
const DERIVA = 0.35;
/**
 * Ganho de tamanho dos corpos, para eles serem VISÍVEIS na escala do universo.
 *
 * ⚠️ Não é física, é legibilidade — e por isso está separado da lei de raio em vez de embutido
 * nela. `raioPorMassa` dá ~0,3 para uma estrela típica; num universo de 52 unidades visto de 150,
 * isso é **menos de um pixel**. O ganho multiplica todo mundo igualmente, então as PROPORÇÕES —
 * que é o que a leitura usa e o que a inversão nº 1 estragava — ficam intactas.
 *
 * Derivado da projeção, não escolhido: a 150 unidades com fov 80 e 742px de altura, um raio de 1
 * unidade dá ~2,95 px. Uma estrela típica (0,3) precisa de ~4,5× para chegar aos 4 px em que uma
 * esfera deixa de ser um ponto.
 */
const ESCALA_CORPO = 4.5;
/**
 * Piso de raio, em unidades de mundo. **Nada pode ser sub-pixel.**
 *
 * A 150 unidades, 1 unidade dá ~2,95 px — um asteroide de 1 chunk sai com 0,33 e desaparece. Corpo
 * que some não é economia de LOD: é o céu afirmando que aquele arquivo não existe. O piso os mantém
 * como PONTO, que é o que eles são nesta escala, em vez de nada.
 */
const RAIO_MINIMO = 0.7;

/**
 * BRILHO — e é aqui que a influência do §11.1 finalmente tem um leitor.
 *
 * A lei separa os eixos: **massa governa ESCALA, atividade governa ENERGIA, centralidade governa
 * INFLUÊNCIA**. Escala já está no raio; este é o outro canal, e sem ele a `centrality` que o P3
 * materializou seria mais uma invariante declarada sem ninguém que a consulte — o defeito que esta
 * base já pagou cinco vezes.
 *
 * ⚠️ **`centrality` pode ser `null`, e aí o brilho cai para a atividade sozinha** — não para zero.
 * Um corpo apagado porque o Neo4j não foi materializado seria o céu afirmando periferia sobre um
 * fato que ninguém mediu. É a lei nº 1 da integração, do lado do pixel.
 */
function brilhoDe(node) {
  const atividade = Math.min((node.churn || 0) / 12, 1);
  const influencia = typeof node.centrality === 'number' ? node.centrality : null;
  // Piso 0,55: nem o corpo mais periférico do céu desaparece. Ele fica DISCRETO, que é diferente.
  const base = 0.55 + atividade * 0.35;
  return influencia === null ? base : base + influencia * 0.9;
}

const hash01 = (texto, sal = 0) => {
  let v = 2166136261 ^ sal;
  for (let i = 0; i < texto.length; i++) { v ^= texto.charCodeAt(i); v = Math.imul(v, 16777619); }
  return ((v >>> 0) % 100000) / 100000;
};

/** Resolve `M = E − e·sin(E)` por Newton. É ela que produz a 2ª lei (áreas iguais). */
function anomaliaExcentrica(M, e) {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 5; i++) {
    const passo = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= passo;
    if (Math.abs(passo) < 1e-6) break;
  }
  return E;
}

export function createUniverse() {
  const group = new THREE.Group();
  group.visible = false;

  const geo = new THREE.SphereGeometry(1, 12, 8);
  /*
   * ⚠️ **Sem `vertexColors`.** Ele faz o shader procurar um atributo `color` na GEOMETRIA, que não
   * existe aqui — e o resultado é preto, não erro. Quem colore instância é o `instanceColor`.
   *
   * ## Por que shader próprio, e não `MeshBasicMaterial`
   *
   * `MeshBasicMaterial` é cor CHAPADA: a esfera vira um disco, e um disco não lê como corpo — lê
   * como adesivo. A diferença entre os dois é o TERMINADOR, e ele não é enfeite: é a única coisa
   * que diz que aquilo tem volume.
   *
   * E a luz não pode ser global. Cada planeta é iluminado pela ESTRELA DELE, que é o fato inteiro
   * desta cena — luz global afirmaria de novo um centro único, que é justamente o que ela nega.
   * A posição da estrela viaja como atributo de instância; 228 luzes reais custariam o quadro.
   */
  const CORPO_VS = /* glsl */ `
    attribute vec3 aEstrela;
    attribute float aBrilho;
    varying vec3 vNormal;
    varying vec3 vLuz;
    varying vec3 vCor;
    varying float vBrilho;
    void main(){
      vBrilho = aBrilho;
      // ⚠️ \`vInstanceColor\` só existe nos materiais NATIVOS do three — em ShaderMaterial o varying
      // tem de ser declarado e preenchido à mão. O atributo \`instanceColor\` em si o renderer
      // declara sozinho quando \`mesh.instanceColor\` existe.
      vCor = instanceColor;
      vNormal = normalize(mat3(instanceMatrix) * normal);
      vec4 mundo = instanceMatrix * vec4(position, 1.0);
      vLuz = normalize(aEstrela - mundo.xyz);
      gl_Position = projectionMatrix * modelViewMatrix * mundo;
    }
  `;
  const CORPO_FS = /* glsl */ `
    precision highp float;
    varying vec3 vNormal;
    varying vec3 vLuz;
    varying vec3 vCor;
    varying float vBrilho;
    void main(){
      // Meia-lambert: o lado escuro nao vai a zero. Preto puro sobre fundo preto some, e some sem
      // avisar — o corpo deixa de existir em vez de ficar na sombra.
      float d = dot(normalize(vNormal), normalize(vLuz)) * 0.5 + 0.5;
      gl_FragColor = vec4(vCor * (0.10 + 0.90 * d * d) * vBrilho, 1.0);
    }
  `;
  const ESTRELA_FS = /* glsl */ `
    precision highp float;
    varying vec3 vNormal;
    varying vec3 vLuz;
    varying vec3 vCor;
    varying float vBrilho;
    void main(){
      // Estrela EMITE: sem terminador, e mais clara na BORDA — o limbo de um corpo emissivo nao
      // escurece, ao contrario do planeta. O ganho acima de 1 e o que da ao bloom o que amplificar.
      // ⚠️ O ganho ficou em 1,15 e nao em 1,6, e o motivo e medido: com 228 estrelas em 9 grumos,
      // dezenas caem no mesmo punhado de pixels e o brilho SOMA. Em 1,6 o miolo da teia virava uma
      // mancha branca e engolia os planetas — o bloom amplificava um estouro em vez de um astro.
      float borda = 1.0 - abs(normalize(vNormal).z);
      gl_FragColor = vec4(vCor * (1.05 + borda * 0.45) * 1.15 * vBrilho, 1.0);
    }
  `;
  const matPlaneta = new THREE.ShaderMaterial({ vertexShader: CORPO_VS, fragmentShader: CORPO_FS });
  const matEstrela = new THREE.ShaderMaterial({ vertexShader: CORPO_VS, fragmentShader: ESTRELA_FS });
  let estrelas = null;
  let planetas = null;
  /** Estado por planeta: a que sistema pertence, semi-eixo, excentricidade, fase. */
  let orbitas = [];
  let centros = [];
  let rumo = new THREE.Vector3(1, 0.3, 0).normalize();
  let stats = { sistemas: 0, corpos: 0, colisoes: 0 };
  /* source → tipo, na ontologia NOVA. É o que impede a HUD de anunciar a taxonomia velha
     por cima da cena nova — o mesmo defeito que a camada de galáxia tinha. */
  const tipos = new Map();
  /* Posição de mundo do planeta 0, atualizada por quadro. É a sonda que prova MOVIMENTO —
     sem ela, "os astros orbitam?" não distingue órbita parada de órbita invisível. */
  const amostra = new THREE.Vector3();
  let quadros = 0;
  let ultimoElapsed = 0;

  const M4 = new THREE.Matrix4();
  const V3 = new THREE.Vector3();
  const Q = new THREE.Quaternion();

  function limpar() {
    for (const m of [estrelas, planetas]) if (m) { group.remove(m); m.dispose?.(); }
    estrelas = planetas = null;
    orbitas = [];
    centros = [];
  }

  /**
   * Posição de um sistema na teia, com REJEIÇÃO.
   *
   * Reservar o volume certo não basta — dois pontos aleatórios caem juntos (problema do
   * aniversário). Medido na bancada: sem rejeição, 132 colisões que nenhum raio de universo
   * conserta; com 30 tentativas, zero. O grumo cresce 6% por tentativa para um nó lotado se
   * expandir em vez de a busca falhar.
   */
  function posicionar(i, nos, porNo, raioSistema, postos) {
    const a = hash01(`s${i}`, 11), b = hash01(`s${i}`, 23), c = hash01(`s${i}`, 41);
    const idx = Math.floor(a * nos.length) % nos.length;
    const base = nos[idx].clone().lerp(nos[Math.floor(b * nos.length) % nos.length], c < 0.35 ? hash01(`s${i}`, 59) : 0);
    const grumoBase = Math.max((raioSistema * Math.cbrt(Math.max(porNo[idx], 1))) / 0.6, raioSistema * 2.2);
    const minimo = raioSistema * 2;
    for (let k = 0; k < TENTATIVAS; k++) {
      const grumo = grumoBase * (1 + k * 0.06);
      const u = hash01(`s${i}:${k}`, 71), v = hash01(`s${i}:${k}`, 83), w = hash01(`s${i}:${k}`, 97);
      const rr = grumo * Math.cbrt(u);
      const theta = v * Math.PI * 2;
      const phi = Math.acos(2 * w - 1);
      const p = base.clone().add(new THREE.Vector3(
        rr * Math.sin(phi) * Math.cos(theta),
        rr * Math.sin(phi) * Math.sin(theta),
        rr * Math.cos(phi)
      ));
      if (postos.every((o) => o.pos.distanceTo(p) >= minimo)) return p;
    }
    return base;
  }

  return {
    object: group,
    /** O tipo de um corpo NESTA cena, ou `null` fora dela. A HUD pergunta; ela não deduz. */
    tipoDe: (source) => tipos.get(source) ?? null,
    stats: () => ({ ...stats, quadros, elapsed: +ultimoElapsed.toFixed(2), amostra: [+amostra.x.toFixed(3), +amostra.y.toFixed(3), +amostra.z.toFixed(3)] }),

    /**
     * Monta a cena a partir do payload do grafo. Idempotente: recarregar refaz tudo.
     *
     * O sistema é o AGREGADO (pasta ou repo) e a estrela é o arquivo dominante dele. Os 336
     * arquivos que penduram direto no repo não são órfãos: o sistema deles é o repositório.
     */
    load(payload) {
      limpar();
      tipos.clear();
      const nodes = payload?.nodes || [];
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const filhos = new Map();
      for (const [filho, pai] of payload?.edges || []) {
        if (!filhos.has(pai)) filhos.set(pai, []);
        filhos.get(pai).push(byId.get(filho));
      }

      const aggs = nodes.filter((n) => n.type !== 'file');
      const sistemas = [];
      for (const agg of aggs) {
        const meus = (filhos.get(agg.id) || []).filter((c) => c?.type === 'file');
        if (!meus.length) continue;
        const dono = meus.reduce((x, y) => {
          const mx = x.chunks || 0, my = y.chunks || 0;
          return my > mx ? y : my < mx ? x : (x.id < y.id ? x : y);
        });
        sistemas.push({ agg, estrela: dono, planetas: meus.filter((f) => f.id !== dono.id) });
        tipos.set(agg.id, agg.type === 'repo' ? 'GALÁXIA' : 'SISTEMA');
        for (const f of meus) {
          const fis = entityPhysics(f, { dominante: f.id === dono.id, sistema: agg.id });
          tipos.set(f.source, classificar(fis, f).tipo.toUpperCase());
        }
      }

      // Raio típico de sistema, para a teia reservar volume. Ele é o que decide se 221 cabem.
      // Proporcional ao raio do universo: 221 sistemas têm de caber sem se tocar, e a bancada
      // mediu que o limite é o vizinho a 2× o raio do sistema.
      const raioSistema = RAIO_UNIVERSO / 26;
      const nos = [];
      for (let k = 0; k < NOS; k++) {
        nos.push(new THREE.Vector3(
          (hash01(`n${k}`, 7) - 0.5) * 1.6 * RAIO_UNIVERSO,
          (hash01(`n${k}`, 13) - 0.5) * 1.6 * RAIO_UNIVERSO,
          (hash01(`n${k}`, 17) - 0.5) * 1.6 * RAIO_UNIVERSO
        ));
      }
      const porNo = new Array(NOS).fill(0);
      for (let i = 0; i < sistemas.length; i++) porNo[Math.floor(hash01(`s${i}`, 11) * NOS) % NOS]++;

      const postos = [];
      sistemas.forEach((s, i) => {
        postos.push({ pos: posicionar(i, nos, porNo, raioSistema, postos), s });
      });

      // Colisões, para o painel poder acusar em vez de a tela deixar passar.
      let colisoes = 0;
      for (let i = 0; i < postos.length; i++) {
        for (let j = i + 1; j < postos.length; j++) {
          if (postos[i].pos.distanceTo(postos[j].pos) < raioSistema * 2) colisoes++;
        }
      }

      const corEstrela = [];
      const corPlaneta = [];
      const brilhoE = [];
      centros = postos.map(({ pos, s }, i) => {
        const fisica = entityPhysics(s.estrela, { dominante: true, sistema: s.agg.id });
        classificar(fisica, s.estrela); // a classe é dele; aqui só o raio importa
        const raio = Math.max(raioPorMassa(s.estrela.chunks || 1) * ESCALA_CORPO, RAIO_MINIMO * 1.6);
        const cor = new THREE.Color(KIND_COLORS[s.estrela.kind] ?? 0xffd9a0);
        corEstrela.push(cor.r, cor.g, cor.b);
        brilhoE.push(brilhoDe(s.estrela));

        // Inclinação própria por sistema: dois sistemas não compartilham plano orbital.
        const inc = (hash01(s.agg.id, 31) - 0.5) * 1.4;
        const giro = hash01(s.agg.id, 37) * Math.PI * 2;

        s.planetas.forEach((f, j) => {
          const rp = Math.min(Math.max(raioPorMassa(f.chunks || 1) * ESCALA_CORPO, RAIO_MINIMO), raio * 0.85);
          const a = raio * 2.44 * Math.pow(1.38, j + 1);
          const e = Math.min(0.4, EXCENTRICIDADE * (0.6 + ((j * 7) % 5) * 0.2));
          const c2 = new THREE.Color(KIND_COLORS[f.kind] ?? 0x8fb8ff);
          corPlaneta.push(c2.r, c2.g, c2.b);
          orbitas.push({ centro: i, a, e, rp, fase: hash01(f.id, 53) * Math.PI * 2, inc, giro,
            n: 0.9 * Math.pow(a, -1.5), brilho: brilhoDe(f) });
        });
        return { pos, raio, sistema: s.agg.id };
      });

      estrelas = new THREE.InstancedMesh(geo, matEstrela, Math.max(centros.length, 1));
      planetas = new THREE.InstancedMesh(geo, matPlaneta, Math.max(orbitas.length, 1));
      /*
       * A posição da estrela de cada planeta, como atributo. É o que permite 1 408 corpos serem
       * iluminados por 228 fontes diferentes sem uma única luz de verdade na cena.
       */
      const luz = new Float32Array(Math.max(orbitas.length, 1) * 3);
      const brilhoP = new Float32Array(Math.max(orbitas.length, 1));
      orbitas.forEach((o, i) => {
        const c = centros[o.centro].pos;
        luz[i * 3] = c.x; luz[i * 3 + 1] = c.y; luz[i * 3 + 2] = c.z;
        brilhoP[i] = o.brilho;
      });
      planetas.geometry = geo.clone();
      planetas.geometry.setAttribute('aEstrela', new THREE.InstancedBufferAttribute(luz, 3));
      planetas.geometry.setAttribute('aBrilho', new THREE.InstancedBufferAttribute(brilhoP, 1));
      estrelas.geometry = geo.clone();
      estrelas.geometry.setAttribute('aEstrela', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(centros.length, 1) * 3), 3));
      estrelas.geometry.setAttribute('aBrilho', new THREE.InstancedBufferAttribute(Float32Array.from(brilhoE), 1));
      estrelas.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(corEstrela), 3);
      planetas.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(corPlaneta), 3);
      estrelas.frustumCulled = false;
      planetas.frustumCulled = false;
      group.add(estrelas, planetas);

      stats = { sistemas: centros.length, corpos: centros.length + orbitas.length, colisoes };
      return stats;
    },

    /**
     * Um quadro. Sistemas viajam e planetas orbitam — a composição é uma HÉLICE.
     *
     * ⚠️ A deriva é do UNIVERSO inteiro, não por sistema: o que a cena afirma é que não há
     * referencial parado, e mover cada sistema para um lado diferente afirmaria outra coisa.
     */
    update(elapsed) {
      quadros++;
      ultimoElapsed = elapsed;
      if (!estrelas || !planetas) return;
      const desloca = rumo.clone().multiplyScalar(elapsed * DERIVA);
      for (let i = 0; i < centros.length; i++) {
        V3.copy(centros[i].pos).add(desloca);
        M4.compose(V3, Q, new THREE.Vector3().setScalar(centros[i].raio));
        estrelas.setMatrixAt(i, M4);
      }
      for (let k = 0; k < orbitas.length; k++) {
        const o = orbitas[k];
        const M = elapsed * o.n + o.fase;
        const E = anomaliaExcentrica(M, o.e);
        const b = o.a * Math.sqrt(1 - o.e * o.e);
        // Foco na origem do sistema: `x = a(cos E − e)`. A estrela não fica no centro da elipse.
        const x = o.a * (Math.cos(E) - o.e);
        const z = b * Math.sin(E);
        // Plano próprio do sistema: giro no plano, depois inclinação.
        const xr = x * Math.cos(o.giro) - z * Math.sin(o.giro);
        const zr = x * Math.sin(o.giro) + z * Math.cos(o.giro);
        const c = centros[o.centro];
        V3.set(c.pos.x + xr, c.pos.y + zr * Math.sin(o.inc), c.pos.z + zr * Math.cos(o.inc)).add(desloca);
        M4.compose(V3, Q, new THREE.Vector3().setScalar(o.rp));
        planetas.setMatrixAt(k, M4);
        if (k === 0) amostra.copy(V3);
      }
      estrelas.instanceMatrix.needsUpdate = true;
      planetas.instanceMatrix.needsUpdate = true;
    },

    setVisible(v) { group.visible = v; },
    dispose() { limpar(); geo.dispose(); matEstrela.dispose(); matPlaneta.dispose(); },
  };
}
