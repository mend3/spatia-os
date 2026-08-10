/*
 * Oráculo da pose de MUNDO da galáxia — roda sem navegador, sem GPU.
 *
 * A pergunta que ele responde é a única que importa nesta mudança: um ponto que está em (raio,
 * ângulo) DENTRO do disco de mundo é desenhado pelo shader naquele mesmo (raio, ângulo)?
 *
 * O método é ida e volta. Ele calcula onde o ponto cai na TELA (projeção ortográfica de verdade,
 * feita aqui, sem usar nada de `poseDe`), joga essa coordenada de tela na aritmética EXATA do
 * fragmento, e confere se o que sai é o (raio, ângulo) de onde se partiu.
 *
 * Falha aqui = a imagem mente sobre a forma, e o olho levaria uma sessão para nomear isso.
 *
 *   node scripts/pose-galaxia.mjs
 */

const ASPECT_FOLHA = 0.05;
const TAU = Math.PI * 2;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a) => scale(a, 1 / len(a));

/** `galaxyParams`: a base fixa do plano, com `e1 x e2 = axisWorld`. */
function planeBasis(axis) {
  const ref = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const e1 = norm(cross(axis, ref));
  return { e1, e2: cross(axis, e1) };
}

/** `poseDe` de `galaxy.js`, transcrito. */
function poseDe(axis, e1, e2, camPos, position, right, up) {
  const W = norm(sub(camPos, position));
  const cosView = dot(axis, W);
  const N = scale(axis, cosView < 0 ? -1 : 1);
  let U = cross(N, W);
  const sinView = len(U);
  U = sinView > 1e-4 ? scale(U, 1 / sinView) : e1;
  const magnitude = Math.max(ASPECT_FOLHA, Math.abs(cosView));
  return {
    cosInc: cosView < 0 ? -magnitude : magnitude,
    roll: Math.atan2(dot(U, up), dot(U, right)),
    phase: -Math.atan2(dot(U, e2), dot(U, e1)), // `p.phase - alpha`, com p.phase = 0
    cosView,
  };
}

/** O fragmento, transcrito: `rotate`, o achatamento, o raio, o espelho da face e `th`. */
function fragment(vP, pose) {
  const c = Math.cos(pose.roll);
  const s = Math.sin(pose.roll);
  let qx = vP[0] * c + vP[1] * s;
  let qy = -vP[0] * s + vP[1] * c;
  const cosInc = Math.abs(pose.cosInc);
  const face = pose.cosInc < 0 ? -1 : 1;
  qy /= cosInc;
  const r = Math.hypot(qx, qy);
  // `vLonge` do fragmento: o lado do plano médio, ANTES do espelho da face.
  const vLonge = qy;
  qy *= face;
  return { r, vLonge, th: Math.atan2(qy, qx) - pose.phase };
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

let piorRaio = 0;
let piorAngulo = 0;
let piorPerfil = 0;
let amostras = 0;
let deTras = 0;
/*
 * O SINAL DE `vLonge`, e por que ele precisa de oráculo.
 *
 * O fragmento afirma que `+q.y` (antes do espelho) é o lado do plano médio que está LONGE do
 * olho, e o bojo é escurecido do lado oposto por causa disso — a poeira do disco passa na frente
 * da metade de trás. Errar esse sinal não quebra nada: produz uma imagem plausível que afirma o
 * lado errado, e nenhuma automação de tela distingue as duas.
 *
 * O teste não tem opinião: pega o ponto do disco que está de fato MAIS PERTO da câmera (a
 * projeção da direção de visada no plano, que é o ponto de maior produto escalar com W), passa
 * pela mesma ida e volta, e exige `vLonge` NEGATIVO.
 */
let pertoErrado = 0;
let pertoConferido = 0;

// Amostragem determinística: eixos na esfera, câmeras em volta, pontos no disco.
for (let ia = 0; ia < 40; ia++) {
  const z = -1 + (2 * (ia + 0.5)) / 40;
  const az = ia * 2.399963; // ângulo áureo: cobre o azimute sem repetir
  const rr = Math.sqrt(Math.max(0, 1 - z * z));
  const axis = [rr * Math.cos(az), rr * Math.sin(az), z];
  const { e1, e2 } = planeBasis(axis);

  for (let ic = 0; ic < 24; ic++) {
    // A câmera olha PARA o corpo, que é o que o foco faz — e é o regime em que a projeção
    // ortográfica é exata (a visada é o eixo óptico).
    const cz = -1 + (2 * (ic + 0.5)) / 24;
    const caz = ic * 1.618034 * Math.PI;
    const cr = Math.sqrt(Math.max(0, 1 - cz * cz));
    const dir = [cr * Math.cos(caz), cr * Math.sin(caz), cz];
    const position = [3, -7, 11];
    const camPos = [position[0] + dir[0] * 40, position[1] + dir[1] * 40, position[2] + dir[2] * 40];
    const forward = norm(sub(position, camPos));
    const mundoCima = Math.abs(forward[2]) > 0.99 ? [0, 1, 0] : [0, 0, 1];
    const right = norm(cross(forward, mundoCima));
    const up = cross(right, forward);

    const pose = poseDe(axis, e1, e2, camPos, position, right, up);
    if (pose.cosView < 0) deTras++;
    // De perfil o piso de espessura entra em ação de propósito: a imagem deixa de ser a projeção
    // de uma folha de espessura zero. A ida e volta não pode valer ali, e o teste diz isso em vez
    // de fingir que vale — o que ele confere no lugar é que o piso é EXATAMENTE o da laje.
    const noPiso = Math.abs(pose.cosView) < ASPECT_FOLHA;
    if (noPiso) {
      piorPerfil = Math.max(piorPerfil, Math.abs(Math.abs(pose.cosInc) - ASPECT_FOLHA));
      continue;
    }

    // O ponto do disco mais próximo da câmera: W projetado no plano, normalizado. Só vale a pena
    // perguntar quando o disco não está de frente — aí "mais perto" tem um lado.
    const W = norm(sub(camPos, position));
    const noPlano = sub(W, scale(axis, dot(axis, W)));
    if (len(noPlano) > 0.05) {
      const perto = norm(noPlano);
      const saidaPerto = fragment([dot(perto, right), dot(perto, up)], pose);
      pertoConferido++;
      if (saidaPerto.vLonge >= 0) pertoErrado++;
    }

    for (let ip = 0; ip < 16; ip++) {
      const phi = (ip * TAU) / 16 + 0.31;
      const rho = 0.2 + 0.07 * (ip % 9);
      // O ponto, no MUNDO. Nada aqui vem de `poseDe`.
      const local = [
        rho * (Math.cos(phi) * e1[0] + Math.sin(phi) * e2[0]),
        rho * (Math.cos(phi) * e1[1] + Math.sin(phi) * e2[1]),
        rho * (Math.cos(phi) * e1[2] + Math.sin(phi) * e2[2]),
      ];
      // Onde ele cai na tela, em unidades de raio do disco: projeção ortográfica, à mão.
      const vP = [dot(local, right), dot(local, up)];
      const saida = fragment(vP, pose);
      piorRaio = Math.max(piorRaio, Math.abs(saida.r - rho));
      piorAngulo = Math.max(piorAngulo, Math.abs(wrap(saida.th - phi)));
      amostras++;
    }
  }
}

console.log(`amostras            ${amostras} (${deTras} poses vistas pela face de trás)`);
console.log(`pior erro de RAIO   ${piorRaio.toExponential(3)}`);
console.log(`pior erro de ÂNGULO ${piorAngulo.toExponential(3)} rad`);
console.log(`piso de perfil      ${piorPerfil.toExponential(3)} de desvio de ASPECT_FOLHA`);
console.log(`lado PERTO          ${pertoConferido - pertoErrado}/${pertoConferido} com vLonge < 0`);

const ok =
  piorRaio < 1e-9 &&
  piorAngulo < 1e-9 &&
  piorPerfil < 1e-12 &&
  deTras > 0 &&
  pertoConferido > 0 &&
  pertoErrado === 0;
console.log(ok ? '\nok — o que o disco de mundo tem, a tela desenha.' : '\nFALHOU.');
process.exit(ok ? 0 : 1);
