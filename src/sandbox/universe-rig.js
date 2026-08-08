/**
 * UNIVERSO — o segundo espécime da cena, e o que responde "isto cabe?".
 *
 * O `SISTEMA LOCAL` prova que UM sistema funciona. Este prova que **221 deles convivem** — que é
 * uma pergunta diferente e a única que pode reprovar a cena inteira. Ele não desenha planeta: na
 * escala do universo um sistema É um ponto, e essa é justamente a escada de LOD que o briefing
 * pede ("só aquele sistema é simulado com detalhes; o resto vira LOD").
 *
 * ⚠️ **Ele não julga forma nem pele.** Julga DISTRIBUIÇÃO e EMPACOTAMENTO. As duas medidas que
 * importam saem no painel e nenhuma delas se enxerga a olho:
 *
 * 1. **colisões** — quantos pares de sistemas se atravessam. Um só já é defeito: dois sistemas
 *    sobrepostos afirmam um vínculo gravitacional que não existe.
 * 2. **fração de vazio** — a estrutura em grande escala tem **mais de 70% do volume vazio**, com
 *    nós ligados por filamentos (§2.8 do replanejamento). Céu uniforme não é neutro: ele é a
 *    afirmação de que tudo está igualmente distribuído, que é falsa e ilegível.
 *
 * O A/B entre `teia cósmica` e `uniforme` existe porque a diferença é impossível de defender sem
 * ver as duas. A distribuição uniforme é a de hoje — `recency` é posição no ranking, feita para
 * ser uniforme por construção.
 */
import * as THREE from 'three';

/** Corpus de 2026-08-07, para o espécime não inventar escala: 221 pastas, 1 300 arquivos sob elas. */
export const SISTEMAS_REAIS = 221;

/** PRNG determinístico: o mesmo N tem de dar o mesmo universo, ou o A/B compara dois sorteios. */
function semente(i, sal) {
  let v = 2166136261 ^ sal;
  for (const ch of `${i}`) { v ^= ch.charCodeAt(0); v = Math.imul(v, 16777619); }
  return ((v >>> 0) % 100000) / 100000;
}

/**
 * Posição de um sistema, nos dois modelos.
 *
 * **Teia**: sorteia um NÓ entre poucos, e o sistema cai perto dele — com uma fração indo para o
 * FILAMENTO entre dois nós. É o mínimo que reproduz "nós ligados por filamentos envolvendo
 * vazios"; não pretende ser simulação de estrutura, e sim negar a uniformidade.
 *
 * **Uniforme**: cubo. É o que a distribuição por recência produz hoje.
 */
/** Tentativas de reposicionamento antes de desistir. 30 zera as colisões com 221 sistemas. */
const TENTATIVAS = 30;

/**
 * Posição de um sistema, nos dois modelos — com REJEIÇÃO.
 *
 * **Teia**: sorteia um nó, com 35% indo para o filamento entre dois. **Uniforme**: cubo, que é o
 * que a distribuição por recência produz hoje.
 *
 * ⚠️ **A rejeição é o que faz a teia funcionar, e ela custou duas medições para aparecer.**
 *
 * 1ª versão — queda cúbica sobre raio fixo: vizinho mais próximo **0,0 un.**, 1 379 colisões. Não
 * era densidade, eram sistemas COINCIDENTES.
 * 2ª versão — raio do grumo por empacotamento (`r · n^(1/3) / 0,6`): melhorou para 132 colisões e
 * vizinho 1,04, mas **estagnou** — reservar o volume certo não impede dois pontos aleatórios de
 * caírem juntos. É o problema do aniversário, e nenhum raio de universo conserta.
 * 3ª — esta: tenta, e se o ponto invade um vizinho, **tenta de novo com o grumo 6% maior**.
 * Medido: 30 tentativas → **0 colisões**, vizinho 12,02 (= 2× o raio do sistema, o limite de
 * empacotamento), com 184 rejeições para 221 sistemas.
 *
 * O grumo crescer a cada tentativa é o que impede o laço de girar em vão num nó lotado: o
 * aglomerado se expande em vez de a busca falhar.
 */
function posicao(i, modo, raio, nos, raioSistema, porNo, jaPostos) {
  const a = semente(i, 11), b = semente(i, 23), c = semente(i, 41);
  if (modo === 'uniforme') {
    return new THREE.Vector3((a - 0.5) * 2 * raio, (b - 0.5) * 2 * raio, (c - 0.5) * 2 * raio);
  }
  const idx = Math.floor(a * nos.length) % nos.length;
  const n1 = nos[idx];
  const n2 = nos[Math.floor(b * nos.length) % nos.length];
  const t = c < 0.35 ? semente(i, 59) : 0;
  const base = n1.clone().lerp(n2, t);
  const quantos = Math.max(porNo[idx] || 1, 1);
  const grumoBase = Math.max((raioSistema * Math.cbrt(quantos)) / 0.6, raioSistema * 2.2);
  const minimo = raioSistema * 2;

  for (let k = 0; k < TENTATIVAS; k++) {
    const grumo = grumoBase * (1 + k * 0.06);
    const u = semente(i * 97 + k, 71), v = semente(i * 97 + k, 83), w = semente(i * 97 + k, 97);
    // Ponto UNIFORME na bola: `cbrt` no raio, senão tudo se acumula no centro.
    const rr = grumo * Math.cbrt(u);
    const theta = v * Math.PI * 2;
    const phi = Math.acos(2 * w - 1);
    const p = base.clone().add(new THREE.Vector3(
      rr * Math.sin(phi) * Math.cos(theta),
      rr * Math.sin(phi) * Math.sin(theta),
      rr * Math.cos(phi)
    ));
    if (jaPostos.every((o) => o.distanceTo(p) >= minimo)) return p;
  }
  // Desistiu: devolve o nó. Melhor um caso visível do que um laço sem fim — e o contador de
  // colisões do painel vai acusar, que é o comportamento honesto.
  return base;
}

export const UNIVERSE_SPEC = {
  id: 'universo',
  name: 'UNIVERSO',
  distance: 260,
  controls: [
    { key: 'sistemas', label: 'SISTEMAS', type: 'range', min: 4, max: 260, step: 1, value: SISTEMAS_REAIS },
    { key: 'modo', label: 'DISTRIBUIÇÃO', type: 'enum', options: ['teia cósmica', 'uniforme'], value: 'teia cósmica' },
    { key: 'nos', label: 'NÓS DA TEIA', type: 'range', min: 2, max: 24, step: 1, value: 9 },
    { key: 'raioUniverso', label: 'RAIO DO UNIVERSO', type: 'range', min: 30, max: 300, step: 5, value: 120 },
    { key: 'raioSistema', label: 'RAIO DE CADA SISTEMA', type: 'range', min: 0.5, max: 20, step: 0.5, value: 6 },
    { key: 'camera', label: 'DISTÂNCIA DA CÂMERA', type: 'range', min: 40, max: 500, step: 5, value: 260, roll: false },
  ],
  watch: [
    'COLISÕES tem de ser ZERO — dois sistemas sobrepostos afirmam um vínculo que não existe',
    'em «teia cósmica» aparecem grumos e VAZIOS entre eles; em «uniforme» o céu vira um chuveiro de pontos igual em todo lugar',
    'a fração de vazio da natureza passa de 70% — o painel diz a daqui',
    'baixe RAIO DO UNIVERSO até colidir: o número onde ele quebra é o orçamento de espaço da cena',
    'nenhum sistema no centro por privilégio — não há centro nesta cena, e é esse o ponto dela',
  ],
  build(ctx) {
    const grupo = new THREE.Group();
    const geo = new THREE.SphereGeometry(1, 10, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    const halo = new THREE.MeshBasicMaterial({ color: 0x1b2540, transparent: true, opacity: 0.5 });
    const malha = new THREE.InstancedMesh(geo, material, 260);
    const casca = new THREE.InstancedMesh(geo, halo, 260);
    grupo.add(malha, casca);

    const M = new THREE.Matrix4();
    const S = new THREE.Vector3();
    let ultimo = '';

    return {
      object: grupo,
      update(values, camera) {
        const n = Math.round(values.sistemas);
        const chave = `${n}:${values.modo}:${values.nos}:${values.raioUniverso}:${values.raioSistema}`;
        camera.position.setLength(values.camera);
        if (chave === ultimo) return;
        ultimo = chave;

        const nos = [];
        for (let k = 0; k < Math.round(values.nos); k++) {
          nos.push(new THREE.Vector3(
            (semente(k, 7) - 0.5) * 1.6 * values.raioUniverso,
            (semente(k, 13) - 0.5) * 1.6 * values.raioUniverso,
            (semente(k, 17) - 0.5) * 1.6 * values.raioUniverso
          ));
        }

        // Quantos sistemas cada nó recebe — o grumo precisa saber para reservar volume.
        const porNo = new Array(nos.length).fill(0);
        for (let i = 0; i < n; i++) porNo[Math.floor(semente(i, 11) * nos.length) % nos.length]++;

        const pos = [];
        for (let i = 0; i < n; i++) {
          pos.push(posicao(i, values.modo, values.raioUniverso, nos, values.raioSistema, porNo, pos));
        }

        // COLISÃO: dois sistemas cujos raios se tocam. O(n²) é aceitável — 260 no máximo, e a
        // conta só roda quando um controle muda.
        let colisoes = 0;
        let vizinhoMin = Infinity;
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const d = pos[i].distanceTo(pos[j]);
            vizinhoMin = Math.min(vizinhoMin, d);
            if (d < values.raioSistema * 2) colisoes++;
          }
        }

        /*
         * VAZIO por amostragem em grade: conta quantas células do cubo não têm sistema nenhum
         * dentro do raio. Amostrar é o único jeito honesto — o volume da união de 221 esferas não
         * tem forma fechada, e somar 221 volumes contaria a sobreposição duas vezes.
         */
        const L = 12;
        let vazias = 0;
        const passo = (2 * values.raioUniverso) / L;
        for (let x = 0; x < L; x++) {
          for (let y = 0; y < L; y++) {
            for (let z = 0; z < L; z++) {
              const p = new THREE.Vector3(
                -values.raioUniverso + (x + 0.5) * passo,
                -values.raioUniverso + (y + 0.5) * passo,
                -values.raioUniverso + (z + 0.5) * passo
              );
              let ocupada = false;
              for (let i = 0; i < n && !ocupada; i++) {
                if (p.distanceToSquared(pos[i]) < values.raioSistema * values.raioSistema) ocupada = true;
              }
              if (!ocupada) vazias++;
            }
          }
        }

        for (let i = 0; i < 260; i++) {
          const vivo = i < n;
          S.setScalar(vivo ? values.raioSistema * 0.16 : 0);
          M.compose(vivo ? pos[i] : new THREE.Vector3(), new THREE.Quaternion(), S);
          malha.setMatrixAt(i, M);
          S.setScalar(vivo ? values.raioSistema : 0);
          M.compose(vivo ? pos[i] : new THREE.Vector3(), new THREE.Quaternion(), S);
          casca.setMatrixAt(i, M);
        }
        malha.instanceMatrix.needsUpdate = true;
        casca.instanceMatrix.needsUpdate = true;

        ctx.report({
          'sistemas': `${n} (real: ${SISTEMAS_REAIS})`,
          'distribuição': values.modo,
          'colisões': colisoes === 0 ? '0 ✓' : `${colisoes} ✗`,
          'vizinho mais próximo': `${vizinhoMin.toFixed(1)} un. (mínimo seguro ${(values.raioSistema * 2).toFixed(1)})`,
          'fração de vazio': `${((vazias / (L * L * L)) * 100).toFixed(1)}% (natureza: >70%)`,
          'densidade': `${(n / Math.pow(2 * values.raioUniverso, 3) * 1e6).toFixed(2)} sistemas por 10⁶ un.³`,
        });
      },
      dispose() {
        geo.dispose();
        material.dispose();
        halo.dispose();
      },
    };
  },
};
