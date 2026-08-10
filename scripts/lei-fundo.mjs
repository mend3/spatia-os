#!/usr/bin/env node
/**
 * A LEI DO FUNDO — a casca estelar está no MUNDO, e o zoom tem de alcançá-la.
 *
 * ## O que ela guarda
 *
 * O fundo é a maior massa visual da tela e é o que informa DISTÂNCIA. Um fundo que não responde ao
 * zoom não dá erro, não some e não pisca: ele só deixa de afirmar profundidade, e quem olha sente
 * que "falta alguma coisa" sem ter onde procurar. É o modo de falha característico desta base.
 *
 * Cinco formas de perdê-lo, e todas em silêncio:
 *
 * 1. ☠️ **O QUAD DE VOLTA** (§1). `gl_Position = vec4(position.xy, …)` põe o fundo na TELA, e ali
 *    nenhuma paralaxe é possível sem calculá-la à mão. A imunidade ao zoom é estrutural, não um bug
 *    a consertar depois.
 * 2. ☠️ **A PARALAXE CALCULADA À MÃO** (§2). A que existia lia `camera.position.x / hypot(x, z)` —
 *    vetor NORMALIZADO, direção sem módulo. Aproximar e afastar entravam como o mesmo número.
 * 3. ☠️ **O MAPA RECORTADO** (§3). `stars.jpg` é equirretangular: qualquer janela, corte ou
 *    dissolução de borda nele abre buraco no céu ou emenda na volta.
 * 4. ☠️ **A IMAGEM QUE NÃO ATRAVESSA A CADEIA** (§3b). Duas linhas de textura decidem se o fundo
 *    aparece: decodificar sRGB põe um mapa cuja informação vive abaixo de 8/255 sob o toe do ACES,
 *    e o mipmap média estrela esparsa com o preto vizinho. As duas devolvem céu PRETO com o mapa
 *    carregado e o uniform correto — e ganho nenhum conserta. A §3c guarda a NÉVOA, que é o que
 *    dá profundidade: saturá-la chapa o quadro, e não tê-la deixa o fundo sem distância.
 * 5. ☠️ **A DEGRADAÇÃO MORDENDO DENTRO DO GESTO** (§4). Se o limite cair abaixo do alcance real da
 *    câmera (`ZOOM_RANGE.max` MAIS a âncora), a casca escorrega durante o zoom normal e o efeito
 *    morre exatamente onde deveria ser mais forte. O limite é lido do módulo e o alcance do
 *    `scene.js` — nenhum dos dois é literal aqui.
 *
 * Roda em `node` sem navegador: o módulo importa `three` mas só o toca dentro das funções, e as
 * grandezas que decidem o fenômeno são exportadas.
 *
 * Uso:  node scripts/lei-fundo.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHELL, LIMITE, FOG, escorregarPara, GAIN, VERTEX, FRAGMENT } from '../src/space/backdrop.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = { erro: '\x1b[31m', ok: '\x1b[32m', fraco: '\x1b[2m', forte: '\x1b[1m', fim: '\x1b[0m' };
let falhas = 0;
const checar = (secao, cond, frase) => {
  if (cond) console.log(`  ${C.ok}✓${C.fim} ${C.fraco}${secao}${C.fim} ${frase}`);
  else {
    falhas += 1;
    console.log(`${C.erro}✗ ${secao} ${frase}${C.fim}`);
  }
};

const cena = fs.readFileSync(path.join(RAIZ, 'src/space/scene.js'), 'utf8');
const fundo = fs.readFileSync(path.join(RAIZ, 'src/space/backdrop.js'), 'utf8');
/** O fonte sem comentários — prosa que EXPLICA uma proibição não pode satisfazer a lei que a proíbe. */
const semProsa = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log(`${C.forte}LEI DO FUNDO${C.fim}  ${C.fraco}a casca estelar está no mundo${C.fim}\n`);

// ────────────────────────────────────────────────── §1 · O FUNDO MORA NO MUNDO

console.log(`${C.forte}§1  A CASCA É GEOMETRIA, NÃO UM ADESIVO NA TELA${C.fim}`);
{
  const vs = semProsa(VERTEX);
  /*
   * ☠️ **A régua é a COMPOSIÇÃO, não a grafia.** Casar `projectionMatrix * modelViewMatrix` literal
   * reprova o vértice que guarda a posição de vista numa variável — que é o que a névoa exige para
   * ler a distância. Guarda que casa texto atesta texto.
   */
  checar(
    '§1',
    /modelViewMatrix\s*\*\s*vec4\(\s*position/.test(vs) && /projectionMatrix\s*\*/.test(vs),
    'o vértice passa pelas DUAS matrizes — é a câmera que transforma distância em tamanho aparente'
  );
  checar(
    '§1b',
    !/gl_Position\s*=\s*vec4\s*\(\s*position\s*\.\s*xy/.test(vs),
    'nenhum caminho volta ao espaço de RECORTE, onde a paralaxe por zoom é impossível'
  );
  checar(
    '§1c',
    /BackSide/.test(semProsa(fundo)) && /SphereGeometry/.test(semProsa(fundo)),
    'a geometria é esfera vista por dentro — é o que envolve a câmera em vez de ficar à frente dela'
  );
}

// ──────────────────────────────────────── §2 · NADA DE PARALAXE CALCULADA À MÃO

console.log(`\n${C.forte}§2  A PARALAXE É CONSEQUÊNCIA, NUNCA CONTA${C.fim}`);
{
  const corpo = semProsa(fundo);
  checar(
    '§2',
    !/normalize\s*\(|Math\.hypot\s*\(|Math\.atan2\s*\(/.test(corpo),
    'ninguém normaliza a posição da câmera — normalizar é justamente onde a DISTÂNCIA se perdia'
  );
  checar(
    '§2b',
    !/uShift/.test(corpo),
    'não sobrou deslocamento de UV dirigido pela câmera: o que move a imagem é a matriz'
  );
  /*
   * A única leitura de `camera.position` que sobra é a da degradação, e ela usa o MÓDULO
   * (`length()`), não a direção. É a diferença entre as duas que esta lei inteira protege.
   */
  const leituras = corpo.match(/camera\.position[.\w]*/g) ?? [];
  checar(
    '§2c',
    leituras.length > 0 && leituras.every((l) => l === 'camera.position' || l === 'camera.position.length'),
    `as ${leituras.length} leituras de \`camera.position\` são do vetor inteiro ou do MÓDULO — nenhuma é de eixo solto`
  );
}

// ─────────────────────────────────────────────── §3 · UMA CAMADA, E ELA É O CÉU INTEIRO

console.log(`\n${C.forte}§3  O MAPA COBRE A ESFERA, SEM RECORTE E SEM EMENDA${C.fim}`);
{
  const fs_ = semProsa(FRAGMENT);
  checar(
    '§3',
    /texture2D\s*\(\s*uMap\s*,\s*vUv\s*\)/.test(fs_),
    'a UV da esfera vai DIRETO na textura — é o que um mapa equirretangular pede'
  );
  checar(
    '§3b',
    !/uHalf|uCenter|uFeather|uCover|uMix/.test(fs_),
    'não sobrou recorte, janela nem fusão: o fundo tem uma imagem e um ganho'
  );
  checar(
    '§3c',
    /RepeatWrapping/.test(semProsa(fundo)),
    'a longitude REPETE — sem isso a volta completa mostra a emenda do mapa'
  );
  /*
   * ⚠️ O teto é 1: o mapa entra display-referred, então ganho acima de 1 AMPLIFICA o que já é a
   * saída pretendida — e o bloom soma tudo que passa do limiar, sobre uma HUD hairline que mora no
   * céu. A referência usa 1,2 e não tem essa HUD.
   */
  checar('§3d', GAIN > 0 && GAIN <= 1, `o ganho não amplifica a imagem (${GAIN} ≤ 1) — o bloom soma sobre a HUD hairline`);
}

// ──────────────────────── §3b · A COLORIMETRIA E O FILTRO, QUE DECIDEM SE ELE APARECE

console.log(`\n${C.forte}§3b  O MAPA ATRAVESSA A CADEIA${C.fim}`);
{
  const corpo = semProsa(fundo);
  /*
   * ☠️ As duas linhas que fizeram o céu sair PRETO com o mapa carregado, o uniform certo e a casca
   * cobrindo o quadro. Nenhuma das duas dá erro, e nenhuma se vê sem medir pixel.
   */
  checar(
    '§3b',
    /colorSpace\s*=\s*THREE\.LinearSRGBColorSpace/.test(corpo),
    'o mapa entra como DISPLAY-REFERRED — decodificar sRGB põe a imagem sob o toe do ACES e ela some'
  );
  checar(
    '§3b2',
    !/colorSpace\s*=\s*THREE\.SRGBColorSpace/.test(corpo),
    'e nenhum caminho volta a decodificar: 2,4% dos pixels passam de 8/255, não há margem a perder'
  );
  checar(
    '§3b3',
    /anisotropy\s*=\s*\d+/.test(corpo),
    'a anisotropia está declarada — a casca é vista em ângulo raso nas bordas do quadro'
  );
}

// ──────────────────────────── §3c · A NÉVOA, QUE É O QUE DÁ PROFUNDIDADE AO FUNDO

console.log(`\n${C.forte}§3c  A NÉVOA GRADUA, NUNCA SATURA${C.fim}`);
{
  const zoomMax = Number((cena.match(/ZOOM_RANGE\s*=\s*\{[^}]*max:\s*([\d.]+)/) || [])[1]);
  const extincao = (d) => Math.min(1, Math.max(0, (d - FOG.near) / (FOG.far - FOG.near)));

  checar('§3c', FOG.far > FOG.near, `a rampa tem largura (${FOG.near} → ${FOG.far})`);
  checar(
    '§3c2',
    extincao(SHELL) < 0.05,
    'com a câmera no CENTRO a casca está a R e quase não tem névoa — é assim que a mancha some ao aproximar'
  );
  /*
   * ☠️ **Copiar os limiares do app de referência escalando pelo raio SATURA.** Põe toda a faixa
   * visível além do fim da rampa, e o resultado é névoa chapada no quadro em vez de gradiente. A
   * régua é o extremo do afastamento.
   */
  const noExtremo = extincao(SHELL + zoomMax);
  checar(
    '§3c3',
    noExtremo > 0.2 && noExtremo < 1,
    `no extremo do zoom a extinção é ${noExtremo.toFixed(2)} — presente, e AINDA não saturada`
  );
  /*
   * ☠️ **Declarar a névoa não a implementa** — a constante pode estar perfeita e o fragmento nunca
   * consumi-la. Sem esta seção, arrancar o `mix` deixa toda a §3c verde, afirmando sobre um valor
   * que ninguém lê.
   */
  const fs2 = semProsa(FRAGMENT);
  checar(
    '§3c5',
    /uFogRange/.test(fs2) && /uFogColor/.test(fs2) && /\bmix\s*\(/.test(fs2),
    'o fragmento CONSUME a rampa e a cor — constante declarada e não lida seria névoa que não existe'
  );
  checar(
    '§3c6',
    /vDist/.test(semProsa(VERTEX)) && /vDist/.test(fs2),
    'e a DISTÂNCIA viaja do vértice ao fragmento: sem ela a névoa não tem do que ser função'
  );
  checar(
    '§3c4',
    FOG.color.every((c) => c === 0),
    'a névoa desvanece para o FUNDO desta cena, que é PRETO — importar a cor de outra pinta o céu dela'
  );
}

// ─────────────────────────────── §4 · A DEGRADAÇÃO NÃO PODE MORDER O GESTO NORMAL

console.log(`\n${C.forte}§4  O LIMITE FICA ALÉM DO ALCANCE DA CÂMERA${C.fim}`);
{
  const m = cena.match(/ZOOM_RANGE\s*=\s*\{[^}]*max:\s*([\d.]+)/);
  checar('§4', m !== null, 'o alcance do zoom é lido do `scene.js`, nunca transcrito aqui');
  const zoomMax = m ? Number(m[1]) : NaN;

  checar(
    '§4a',
    LIMITE < SHELL,
    `o limite (${LIMITE}) fica DENTRO da parede (${SHELL}) — encostar nela é ver a casca de perfil`
  );
  checar(
    '§4b',
    LIMITE > zoomMax,
    `o limite (${LIMITE}) passa do zoom máximo (${zoomMax}) — sem isso o fundo trava no fim do gesto`
  );
  checar(
    '§4c',
    escorregarPara(zoomMax) === 0,
    'na distância máxima do zoom a casca AINDA está na origem: a paralaxe vale a faixa inteira'
  );
  checar(
    '§4d',
    escorregarPara(LIMITE * 2) > 0 && escorregarPara(LIMITE * 2) < 1,
    'e fora dele ela escorrega de fato — degradar é continuar desenhando, não é não fazer nada'
  );
  /*
   * A prova de que a degradação faz o que diz: escorregando, a câmera fica EXATAMENTE no limite
   * medido a partir do novo centro. Um fator que não satisfaça isto deixa a câmera fora da casca
   * mesmo tendo "escorregado", e a esfera some do mesmo jeito.
   */
  const dentro = [LIMITE * 1.01, LIMITE * 3, LIMITE * 40].every((r) => {
    const centro = r * escorregarPara(r);
    return Math.abs(r - centro - LIMITE) < 1e-9;
  });
  checar('§4e', dentro, 'depois de escorregar a câmera fica no limite exato, em qualquer raio absurdo');

  console.log(
    `  ${C.fraco}censo · folga entre o limite e o zoom máximo: ${(LIMITE - zoomMax).toFixed(0)} unidades` +
      ` (é ela que a âncora dos sistemas consome)${C.fim}`
  );
}

// ──────────────────────────────────────────────────────────────────────────────

console.log(
  falhas === 0
    ? `\n${C.ok}${C.forte}O FUNDO RESPONDE À DISTÂNCIA.${C.fim}\n`
    : `\n${C.erro}${C.forte}${falhas} lei(s) do fundo caíram.${C.fim}\n`
);
process.exit(falhas === 0 ? 0 : 1);
