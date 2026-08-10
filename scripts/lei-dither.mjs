/**
 * A LEI DO DITHER DE SAÍDA — que a correção de quantização chegue ao shader, e no lugar certo.
 *
 * Ela existe porque o defeito que o dither conserta **falha em silêncio nos dois sentidos**: a
 * injeção que perde a âncora devolve a banda sem erro nenhum, e o dither posto antes da conversão
 * de espaço de cor continua compilando e some justamente na faixa clara, que é a que ele existe
 * para consertar. Nenhuma das duas aparece como exceção — só como imagem pior.
 *
 * Roda em `node`, sem navegador e sem GPU: lê o shader vendorizado de verdade e o módulo puro.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { comDither, GLSL_DITHER, MARCA } from '../src/space/dither-de-saida.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const C = { ok: '\x1b[32m', erro: '\x1b[31m', forte: '\x1b[1m', fraco: '\x1b[2m', fim: '\x1b[0m' };
let falhas = 0;
const falhar = (m) => { console.log(`${C.erro}✗ ${m}${C.fim}`); falhas++; };
const passa = (m) => console.log(`  ${C.ok}✓${C.fim} ${m}`);

const ler = (p) => readFileSync(resolve(RAIZ, p), 'utf8');

console.log(`${C.forte}A LEI DO DITHER DE SAÍDA${C.fim}`);

/*
 * §1 — a fonte é o shader VENDORIZADO, nunca uma cópia. Conferir contra um literal escrito aqui
 * provaria que o oráculo concorda consigo mesmo enquanto o `three` mudou por baixo.
 */
const fonteDoModulo = ler('vendor/jsm/shaders/OutputShader.js');
const casa = fonteDoModulo.match(/fragmentShader:\s*\/\* glsl \*\/`([\s\S]*?)`\s*\n\s*\}/);
if (!casa) {
  falhar('não achei o `fragmentShader` em `vendor/jsm/shaders/OutputShader.js` — o oráculo perdeu ' +
    'o alvo e não pode afirmar nada sobre a saída.');
} else {
  const cru = casa[1];
  passa(`shader de saída lido do vendor (${cru.split('\n').length} linhas)`);

  // §2 — a injeção acontece de fato, e o marcador chega ao shader composto.
  let composto = null;
  try { composto = comDither(cru); } catch (e) { falhar(`a injeção levantou sobre o shader REAL: ${e.message}`); }
  if (composto) {
    if (!composto.includes(MARCA)) falhar(`o shader composto não traz o marcador \`${MARCA}\`.`);
    else passa(`o marcador \`${MARCA}\` chega ao shader composto`);

    /*
     * §3 — ORDEM. O dither tem de vir DEPOIS da conversão de espaço de cor: 1/255 só significa
     * 1 LSB no espaço em que o quantizador mora, e sRGB não é linear.
     */
    const iConv = composto.lastIndexOf('sRGBTransferOETF');
    const iDither = composto.indexOf(MARCA + ':');
    if (iDither < 0 || iConv < 0) falhar('não consegui localizar conversão e dither no composto.');
    else if (iDither < iConv) {
      falhar('o dither está ANTES da conversão de espaço de cor. Em luz linear 1/255 não é 1 LSB, ' +
        'e a correção some exatamente na faixa clara, que é a que ela existe para consertar.');
    } else passa('o dither roda DEPOIS da conversão de espaço de cor');

    // §4 — ele está dentro do `main()`, não pendurado depois do fecho.
    const fechos = composto.trimEnd();
    if (!fechos.endsWith('}')) falhar('o shader composto não termina em `}` — a injeção quebrou a função.');
    else if (iDither > fechos.lastIndexOf('}')) falhar('o dither ficou FORA do `main()`.');
    else passa('o dither está dentro do `main()`');
  }

  /*
   * §5 — a AMPLITUDE é 1 LSB e a densidade é TRIANGULAR. Dither uniforme de ½ LSB descorrela o erro
   * mas deixa a variância dele depender do sinal, e a banda volta como textura modulada.
   */
  if (!/\/\s*255\.0/.test(GLSL_DITHER)) {
    falhar('a amplitude do dither não é 1/255. Abaixo disso ele não alcança o quantizador; acima, ' +
      'vira grão visível — e grão é `uGrain`, que tem outro dono e outro propósito.');
  } else passa('amplitude de 1 LSB (1/255)');
  if (!/ign1\s*-\s*ign2/.test(GLSL_DITHER)) {
    falhar('o dither não é TPDF (diferença de dois uniformes) — com um sorteio só a variância do ' +
      'erro acompanha o sinal e a banda reaparece modulada.');
  } else passa('densidade triangular (TPDF): diferença de dois uniformes');
  if (/uTime|uDiskTime/.test(GLSL_DITHER)) {
    falhar('o dither depende do relógio. A 1 LSB um padrão fixo é invisível; um animado acrescenta ' +
      'cintilação numa cena que já tem grão temporal.');
  } else passa('o padrão não depende do relógio');
}

/*
 * §6 — A RECUSA. Um `three` novo que mude o shader tem de PARAR O BOOT, não degradar a imagem em
 * silêncio. Esta seção é o oráculo se vendo falhar: se `comDither` aceitar as duas fontes abaixo,
 * ele não é guarda.
 */
const recusas = [
  ['sem `}` final', 'void main() { gl_FragColor = sRGBTransferOETF( gl_FragColor );'],
  ['sem conversão de espaço de cor', 'void main() {\n  gl_FragColor = texture2D(tDiffuse, vUv);\n}'],
];
for (const [nome, fonte] of recusas) {
  let levantou = false;
  try { comDither(fonte); } catch { levantou = true; }
  if (!levantou) falhar(`\`comDither\` ACEITOU um shader ${nome} — injeção que degrada calada.`);
  else passa(`recusa shader ${nome}`);
}

/*
 * §7 — o chamador. A injeção só vale se a cena a usar no passe que vai à TELA; injetar num
 * `OutputPass` que ninguém adiciona é a invariante declarada sem leitor.
 */
const cena = ler('src/space/scene.js');
if (!/comDither\(\s*\w+\.material\.fragmentShader\s*\)/.test(cena)) {
  falhar('`scene.js` não injeta o dither no `fragmentShader` do passe de saída.');
} else if (!/composer\.addPass\(\s*passeDeSaida\s*\)/.test(cena)) {
  falhar('o passe de saída com dither não é adicionado ao composer — ele existe e não desenha.');
} else passa('`scene.js` injeta e ADICIONA o passe de saída ao composer');

console.log(falhas ? `\n${C.erro}✗ ${falhas} falha(s)${C.fim}` : `\n${C.ok}✓ a lei do dither vale${C.fim}`);
process.exit(falhas ? 1 : 0);
