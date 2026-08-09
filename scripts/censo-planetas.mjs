/**
 * CENSO DOS PLANETAS — quantos formatos VISUALMENTE DISTINTOS o corpus produz, e qual eixo colapsou.
 *
 * A pergunta que ele responde é a do usuário olhando o céu: *"por que todo planeta parece o mesmo
 * corpo escuro de manchas cinzas?"*. Um planeta tem nove parâmetros de aparência, e nove eixos com
 * faixa larga produziriam centenas de mundos diferentes — mas isso é o que o CÓDIGO permite, não o
 * que o CORPUS ocupa. Um eixo cuja entrada real varre 5% da faixa teórica é um eixo morto: ele está
 * lá, compila, não desenha nada. É esse eixo que este censo nomeia.
 *
 * Rode quando:
 *   - o céu parecer homogêneo demais («todos iguais»);
 *   - mexer numa constante de `planetParams` (`CHUNKS_LOG_FULL`, `ORIGIN_SPAN`, qualquer `lerp`);
 *   - o corpus mudar de tamanho ou de escopo — as faixas dependem de `chunks`, e `chunks` muda.
 *
 *     node scripts/censo-planetas.mjs
 *     ESPATIAL_GRAPH=http://127.0.0.1:9999/api/graph node scripts/censo-planetas.mjs
 *
 * ## Ele IMPORTA a derivação, não a copia
 *
 * `planetParams` e `resolveBody` são chamados de verdade, do `src/`. É a regra que os oráculos
 * deste repo (`campo.mjs`, `costura-disco.mjs`) não conseguem seguir — eles transcrevem GLSL, e
 * pagam o preço de ter que acompanhar o shader à mão. Aqui não há preço a pagar: a derivação é
 * JavaScript, então o censo mede o que a cena desenha por construção.
 *
 * Duas pontes existem só para o Node conseguir carregar módulos escritos para o navegador:
 *
 * 1. **`node_modules/three/`** — `planet.js` faz `import * as THREE from 'three'`, um especificador
 *    NU. No navegador quem o resolve é o importmap do `index.html`; o Node não lê importmap. O
 *    `garanteShimDoThree()` abaixo escreve um pacote de duas linhas que reexporta
 *    `vendor/three.module.js`. É idempotente e NÃO baixa nada da rede — o three já está no repo.
 * 2. **`window`/`document`** — `src/core/motion.js` lê `prefers-reduced-motion` no escopo do
 *    módulo. O esboço declara "nenhuma preferência", que é o valor certo para um censo: movimento
 *    reduzido congela a rotação, não muda parâmetro nenhum de aparência.
 *
 * ## O que ele NÃO mede
 *
 * O céu inteiro. Quem decide a pele é `resolveBody`, e a maior parte do corpus não vira planeta —
 * medir todos os nós descreveria um céu que ninguém vê. Esse erro exato já produziu recomendação
 * errada neste repo; ver `docs/cobertura.md`.
 *
 * E não mede o SHADER. Ele mede os parâmetros que entram nele. Dois planetas com parâmetros
 * distintos ainda podem sair parecidos na tela — cobertura de parâmetro não é cobertura de pixel.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_GRAFO = process.env.ESPATIAL_GRAPH ?? 'http://127.0.0.1:8787/api/graph';

// ───────────────────────────────────────────────────────────────── as duas pontes para o Node

/**
 * Escreve (ou confere) o pacote `three` que aponta para o `vendor/`. Idempotente.
 *
 * Duas linhas de reexportação em vez de um `exports` apontando para fora do diretório do pacote:
 * o Node recusa alvo externo em `exports`, e um symlink não sobrevive a `git clean`.
 */
function garanteShimDoThree() {
  const vendorizado = path.join(RAIZ, 'vendor', 'three.module.js');
  if (!fs.existsSync(vendorizado)) {
    throw new Error(
      `three vendorizado não encontrado em ${vendorizado} — sem ele não há como resolver ` +
        `o "import * as THREE from 'three'" de planet.js, e este censo não inventa a derivação.`
    );
  }
  const dir = path.join(RAIZ, 'node_modules', 'three');
  const arquivos = {
    'package.json':
      JSON.stringify(
        {
          name: 'three',
          version: '0.0.0-vendor',
          type: 'module',
          main: 'index.mjs',
          exports: { '.': './index.mjs' },
          // Quem ler isto depois de um `git status` estranho merece saber de onde veio.
          _origem: 'gerado por scripts/censo-planetas.mjs — reexporta vendor/three.module.js',
        },
        null,
        2
      ) + '\n',
    'index.mjs': "export * from '../../vendor/three.module.js';\n",
  };
  fs.mkdirSync(dir, { recursive: true });
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const alvo = path.join(dir, nome);
    const atual = fs.existsSync(alvo) ? fs.readFileSync(alvo, 'utf8') : null;
    if (atual !== conteudo) fs.writeFileSync(alvo, conteudo);
  }
}

garanteShimDoThree();
globalThis.window ??= { matchMedia: () => null };
globalThis.document ??= { documentElement: { dataset: {} } };

// `import()` e não `import` estático: os esboços acima têm de existir ANTES do módulo carregar, e
// o `import` estático é içado para o topo do arquivo.
const { planetParams } = await import(new URL('../src/space/planet.js', import.meta.url));
const { SUPERFICIE } = await import(new URL('../src/space/superficies.js', import.meta.url));
const { indexar } = await import(new URL('../src/space/sistemas.js', import.meta.url));
const { WET_EDGE } = await import(new URL('../src/space/planet-palette.js', import.meta.url));

// ─────────────────────────────────────────────────────────────────────── o corpus, do servidor

async function buscaGrafo() {
  let resposta;
  try {
    resposta = await fetch(URL_GRAFO);
  } catch (erro) {
    throw new Error(
      `não consegui falar com ${URL_GRAFO} (${erro.message}).\n` +
        `  Suba o servidor com ./serve.py e rode de novo. Este censo NÃO fabrica corpus ` +
        `sintético: um número tirado de nós inventados responderia sobre um céu que não existe.`
    );
  }
  if (!resposta.ok) throw new Error(`${URL_GRAFO} devolveu HTTP ${resposta.status}`);
  const grafo = await resposta.json();
  if (!Array.isArray(grafo.nodes)) throw new Error(`${URL_GRAFO} não devolveu {nodes: [...]}`);
  return grafo;
}

const grafo = await buscaGrafo();
const arquivos = grafo.nodes.filter((n) => n.type === 'file');

/*
 * A pele resolvida, pela ONTOLOGIA — que é quem as duas cenas consultam.
 *
 * ⚠️ Isto lia `resolveBody().surface`, a taxonomia por `kind` que a Fase B refutou. Enquanto a cena
 * AGENTE a usava, o censo descrevia um céu que existia; convergidas as duas (T-39), ela deixou de
 * ter leitor no `src/` e este censo passaria a medir um caminho que ninguém desenha — o defeito que
 * esta base persegue nos oráculos, aplicado ao censo.
 *
 * ⚠️ **`indexar` e não uma varredura própria:** a dominância decide se um corpo é ESTRELA, e uma
 * segunda eleição divergiria no empate. `facts.dirty` continua fora de propósito — o git sujo só
 * ACRESCENTA modificadores, e nenhuma classe troca de superfície por causa dele.
 */
const indice = indexar(grafo);
const peleDe = (n) => indice.identidadeDe(n)?.pele ?? SUPERFICIE.NENHUMA;
const peles = new Map();
for (const n of arquivos) {
  const pele = peleDe(n);
  peles.set(pele, (peles.get(pele) || 0) + 1);
}
const planetas = arquivos
  .filter((n) => peleDe(n) === SUPERFICIE.PLANETA)
  .map((n) => ({ node: n, p: planetParams(n) }));

if (!planetas.length) {
  throw new Error(
    `nenhum dos ${arquivos.length} arquivos do índice resolve para superfície de planeta — ` +
      `não há o que medir. Confira o catálogo (morfologia por kind) antes de suspeitar do censo.`
  );
}

// ────────────────────────────────────────────────────────────────────────────── os eixos medidos

/**
 * A FRAÇÃO DA AMPLITUDE QUE O MAR COME, e por que ela entra no lugar de `sea`.
 *
 * No shader a altura é `max(0, amplitude * forma - sea)`, com `forma ∈ [0,1]`. Então `sea` sozinho
 * não diz nada: 0,02 num corpo de amplitude 0,13 é uma praia, e num de amplitude 0,035 afoga o
 * planeta inteiro. O que governa a área de oceano é a RAZÃO — e é ela que o olho lê.
 */
const inundacao = (p) => p.sea / p.amplitude;

/**
 * Os eixos de APARÊNCIA, com o passo perceptual de cada um e a justificativa do passo.
 *
 * ⚠️ Bin arbitrário produz o número que se quiser. Cada largura abaixo está amarrada a uma
 * consequência na tela, medida na régua que o próprio módulo usa: `LOD_NEAR_PX = 200`, ou seja um
 * planeta em foco tem ~200px de raio aparente.
 */
const EIXOS = [
  {
    nome: 'amplitude',
    valor: (p) => p.amplitude,
    bin: 0.015,
    // O relevo desloca a silhueta em `amplitude × raio`. A 200px de raio, 0,015 são 3px de
    // rugosidade na borda — o menor degrau que se distingue contra o céu preto.
    porque: '3px de silhueta a 200px de raio',
  },
  {
    nome: 'inundação',
    valor: inundacao,
    bin: 0.08,
    // A rampa de biomas tem 5 faixas em altura normalizada, espaçadas ~0,16. Meia faixa é o
    // menor deslocamento de linha de costa que troca a cor de uma região reconhecível.
    porque: 'meia faixa da rampa de biomas (BANDS ~0,16)',
  },
  {
    nome: 'ridged',
    valor: (p) => p.ridged,
    bin: 0.2,
    // Peso de mistura entre duas morfologias (vale arredondado × crista). Mistura abaixo de ~20%
    // fica soterrada pelo termo dominante — é a regra prática de qualquer `mix` visual.
    porque: '20% de mistura, o piso para um `mix` aparecer',
  },
  {
    nome: 'sharpness',
    valor: (p) => p.sharpness,
    bin: 0.5,
    // Expoente de `pow`. Passo de 0,5 sobre uma base ~2 muda a altura mediana do campo em ~15%,
    // que é onde a proporção terra/mar começa a mudar de leitura.
    porque: '~15% na altura mediana do campo',
  },
  {
    nome: 'period',
    valor: (p) => p.period,
    bin: 0.1,
    // Tamanho da feição maior. O comentário de `planetParams` fixa a régua: 0,45–0,85 dá de três
    // a seis massas continentais, logo ~0,1 é uma massa continental a mais ou a menos.
    porque: 'um continente a mais ou a menos',
  },
  {
    nome: 'persistence',
    valor: (p) => p.persistence,
    bin: 0.06,
    // Ganho por oitava. 0,06 muda a amplitude da segunda oitava em ~13% — o limiar em que a
    // textura fina passa de lisa a granulada.
    porque: '~13% na amplitude da 2ª oitava',
  },
  {
    nome: 'lacunarity',
    valor: (p) => p.lacunarity,
    bin: 0.12,
    // Razão de frequência entre oitavas. 0,12 sobre ~1,9 desloca a 4ª oitava em ~20% de escala,
    // que é quando o padrão fino visivelmente muda de granulometria.
    porque: '~20% de escala na 4ª oitava',
  },
  {
    nome: 'atmosphere',
    valor: (p) => p.atmosphere,
    bin: 0.15,
    // Alfa da coroa e peso da cor do ar no limbo. 0,15 de alfa sobre fundo preto é o degrau
    // mínimo de um brilho difuso — abaixo disso a coroa é a mesma coroa.
    porque: '0,15 de alfa, degrau mínimo de brilho difuso',
  },
];

/**
 * A faixa TEÓRICA de cada eixo, medida varrendo a própria `planetParams`.
 *
 * Não é uma conta à mão sobre as fórmulas — seria a cópia que este arquivo se recusa a fazer. É a
 * derivação real avaliada num barrido denso das ENTRADAS que ela admite: caminhos quaisquer (as
 * sementes saem de `hash01`, que é ~uniforme em [0,1)) e `chunks` de 0 até bem além do ponto em
 * que `chunksNorm` satura. O envelope que sai daí é o que o código consegue produzir.
 */
function faixasTeoricas(amostras = 60000) {
  const acc = new Map(EIXOS.map((e) => [e.nome, { min: Infinity, max: -Infinity }]));
  for (let i = 0; i < amostras; i++) {
    // Caminho arbitrário: o que importa é entrar no hash com bastante variedade.
    const p = planetParams({
      source: `sonda/${i}/${(i * 2654435761) % 1e9}.md`,
      kind: 'doc',
      // Log-espaçado até 512: `chunksNorm` satura em chunks = 2⁸-1, então isso cobre a faixa inteira.
      chunks: Math.round(2 ** ((i % 512) / 512 * 9.1)),
    });
    for (const e of EIXOS) {
      const v = e.valor(p);
      const a = acc.get(e.nome);
      if (v < a.min) a.min = v;
      if (v > a.max) a.max = v;
    }
  }
  return acc;
}

const TEORICA = faixasTeoricas();

// ──────────────────────────────────────────────────────────────────────────────────── estatística

const ordena = (xs) => [...xs].sort((a, b) => a - b);
const pct = (xs, p) => {
  const s = ordena(xs);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
};
const media = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const desvio = (xs) => {
  const m = media(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};
const f = (v, casas = 3) => v.toFixed(casas);
const frac = (n, t) => `${((n / Math.max(t, 1)) * 100).toFixed(1)}%`;
const titulo = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);
const vermelho = (t) => `\x1b[31m${t}\x1b[0m`;
const amarelo = (t) => `\x1b[33m${t}\x1b[0m`;

/** Spearman: correlação de POSTO. Ela pega dependência monótona não-linear, que é o caso aqui. */
function spearman(xs, ys) {
  const posto = (vs) => {
    const idx = vs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(vs.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const medio = (i + j) / 2;
      for (let k = i; k <= j; k++) r[idx[k][1]] = medio;
      i = j + 1;
    }
    return r;
  };
  const a = posto(xs);
  const b = posto(ys);
  const ma = media(a);
  const mb = media(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.max(Math.sqrt(da * db), 1e-12);
}

// ═══════════════════════════════════════════════════════════════════════════════════ o relatório

console.log(`\x1b[1mCENSO DOS PLANETAS\x1b[0m  ·  ${URL_GRAFO}`);

titulo('1. QUEM É PLANETA (pele resolvida por superficies.js)');
for (const [pele, n] of [...peles].sort((a, b) => b[1] - a[1])) {
  const marca = pele === SUPERFICIE.PLANETA ? ' ←' : '';
  console.log(`  ${String(pele).padEnd(12)} ${String(n).padStart(5)}  ${frac(n, arquivos.length).padStart(6)}${marca}`);
}
console.log(`  ${'—'.repeat(30)}`);
console.log(`  ${planetas.length} planetas de ${arquivos.length} arquivos indexados (${grafo.nodes.length} nós no total)`);

titulo('2. DISTRIBUIÇÃO DE CADA EIXO — e quanto da faixa teórica ele ocupa');
console.log(
  `  ${'eixo'.padEnd(12)}${'mín'.padStart(8)}${'MED'.padStart(8)}${'máx'.padStart(8)}${'σ'.padStart(8)}` +
    `   ${'faixa teórica'.padEnd(17)}${'mín–máx'.padStart(9)}${'P10–P90'.padStart(9)}`
);
const colapsados = [];
for (const e of EIXOS) {
  const vs = planetas.map((x) => e.valor(x.p));
  const t = TEORICA.get(e.nome);
  const largura = Math.max(t.max - t.min, 1e-12);
  const ocupTotal = (Math.max(...vs) - Math.min(...vs)) / largura;
  const ocupUtil = (pct(vs, 0.9) - pct(vs, 0.1)) / largura;
  // Um eixo cujo miolo (P10–P90) cabe em 15% da faixa é um eixo que o corpus não usa: ele
  // compila, custa uniform e não distingue dois corpos. É a definição operacional de EIXO MORTO.
  const morto = ocupUtil < 0.15;
  if (morto) colapsados.push({ e, ocupUtil, vs });
  const linha =
    `  ${e.nome.padEnd(12)}${f(Math.min(...vs)).padStart(8)}${f(pct(vs, 0.5)).padStart(8)}` +
    `${f(Math.max(...vs)).padStart(8)}${f(desvio(vs)).padStart(8)}` +
    `   ${`${f(t.min)} … ${f(t.max)}`.padEnd(17)}${`${(ocupTotal * 100).toFixed(0)}%`.padStart(9)}` +
    `${`${(ocupUtil * 100).toFixed(0)}%`.padStart(9)}`;
  console.log(morto ? vermelho(linha) : linha);
}
console.log(`  passo perceptual de cada eixo, e o porquê:`);
for (const e of EIXOS) console.log(`    ${e.nome.padEnd(12)} ${String(e.bin).padStart(6)}  ${e.porque}`);

titulo('3. QUANTOS FORMATOS DISTINTOS');
const impressao = (p) => EIXOS.map((e) => Math.floor(e.valor(p) / e.bin)).join('|');
const baldes = new Map();
for (const x of planetas) {
  const k = impressao(x.p);
  if (!baldes.has(k)) baldes.set(k, []);
  baldes.get(k).push(x);
}
const ordenados = [...baldes].sort((a, b) => b[1].length - a[1].length);
const binsPorEixo = EIXOS.map((e) => {
  const t = TEORICA.get(e.nome);
  return Math.max(1, Math.floor(t.max / e.bin) - Math.floor(t.min / e.bin) + 1);
});
console.log(`  combinações que o CÓDIGO admite: ${binsPorEixo.reduce((a, b) => a * b, 1).toLocaleString('pt-BR')}  (${binsPorEixo.join('×')})`);
console.log(`  formatos que o CORPUS produz:    \x1b[1m${ordenados.length}\x1b[0m  em ${planetas.length} planetas`);
console.log(`  bins ocupados por eixo:          ${EIXOS.map((e, i) => `${e.nome} ${new Set(planetas.map((x) => Math.floor(e.valor(x.p) / e.bin))).size}/${binsPorEixo[i]}`).join(' · ')}`);
const maior = ordenados[0];
console.log(
  `  bin mais populoso: \x1b[1m${maior[1].length}\x1b[0m planetas — ${frac(maior[1].length, planetas.length)} do céu`
);
console.log(`    exemplo: ${maior[1].slice(0, 3).map((x) => x.node.id).join(' · ')}`);
const top5 = ordenados.slice(0, 5).reduce((s, b) => s + b[1].length, 0);
console.log(`  os 5 maiores bins cobrem ${top5} planetas (${frac(top5, planetas.length)})`);
const solitarios = ordenados.filter(([, b]) => b.length === 1).length;
console.log(`  formatos com um único planeta: ${solitarios} (${frac(solitarios, ordenados.length)} dos formatos)`);

titulo('4. CORRELAÇÃO SUSPEITA — eixos que andam juntos porque saem da mesma semente');
console.log('  |ρ| de Spearman >= 0,90. Cada par destes é UM eixo de variação, não dois.');
const numericos = [{ nome: 'chunksNorm', valor: (p) => p.chunksNorm }, ...EIXOS];
let pares = 0;
for (let i = 0; i < numericos.length; i++) {
  for (let j = i + 1; j < numericos.length; j++) {
    const r = spearman(planetas.map((x) => numericos[i].valor(x.p)), planetas.map((x) => numericos[j].valor(x.p)));
    if (Math.abs(r) >= 0.9) {
      pares++;
      const trava = Math.abs(r) > 0.999 ? vermelho('  ← função exata um do outro') : '';
      console.log(`  ${numericos[i].nome.padEnd(12)} ↔ ${numericos[j].nome.padEnd(12)} ρ = ${r >= 0 ? ' ' : ''}${f(r)}${trava}`);
    }
  }
}
if (!pares) console.log('  nenhum — os eixos variam independentemente.');

titulo('5. A PALETA');
/*
 * Duas contagens, porque cada uma sozinha mentiria.
 *
 * EXATA conta tuplas de hex. `planetPalette` desvia a matiz por semente, então quase toda tupla é
 * única e a contagem exata diz "cada planeta tem sua paleta" — verdade inútil.
 *
 * FAMÍLIAS agrupa por DISTÂNCIA, não por bin: bin com borda fixa parte um grupo em dois só porque
 * ele caiu em cima da borda, que foi exatamente o que aconteceu na primeira versão deste censo.
 * O limiar de matiz é 0,045 e ele não é escolhido no olho — é a largura TOTAL do desvio que
 * `planet-palette.js` aplica (±0,02), com folga. Ou seja, a pergunta que este agrupamento faz é:
 * **a semente consegue tirar um planeta da família de cor do TIPO dele?**
 */
const hsl = (cor) => cor.getHSL({ h: 0, s: 0, l: 0 });
const DH = 0.045;
const dHue = (a, b) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
const exatas = new Set(planetas.map((x) => x.p.palette.map((c) => c.getHexString()).join('-')));
const famílias = [];
for (const x of planetas) {
  const camadas = x.p.palette.map(hsl);
  let g = famílias.find((cand) =>
    cand.rep.every(
      (c, i) =>
        dHue(c.h, camadas[i].h) <= DH &&
        Math.abs(c.s - camadas[i].s) <= 0.08 &&
        Math.abs(c.l - camadas[i].l) <= 0.06
    )
  );
  if (!g) {
    g = { rep: camadas, n: 0, kinds: new Set() };
    famílias.push(g);
  }
  g.n++;
  g.kinds.add(x.node.kind);
}
console.log(`  paletas com hex distinto:  ${exatas.size} de ${planetas.length} — a semente separa a tinta, sim`);
console.log(`  famílias de cor:           \x1b[1m${famílias.length}\x1b[0m — e é este o número que o olho conta`);
for (const g of [...famílias].sort((a, b) => b.n - a.n)) {
  const linha =
    `    ${[...g.kinds].join(',').padEnd(12)} ${String(g.n).padStart(4)}  ${frac(g.n, planetas.length).padStart(6)}` +
    `   mar L=${f(g.rep[0].l, 2)} · costa L=${f(g.rep[2].l, 2)} S=${f(g.rep[2].s, 2)} · terra L=${f(g.rep[3].l, 2)} · pico L=${f(g.rep[4].l, 2)}`;
  console.log(g.n / planetas.length > 0.5 ? vermelho(linha) : linha);
}

titulo('6. ALCANCE DA RAMPA — as cinco faixas de bioma são pintadas, ou só as três de baixo?');
/*
 * ⚠️ ESTA SEÇÃO TRANSCREVE O SHADER, e por isso carrega a obrigação dos oráculos deste repo: se
 * `GLSL_TERRAIN` ou `BANDS` mudarem, ela passa a atestar código que não existe mais.
 *
 * O que ela transcreve, e só isto:
 *   terrainHeight → h = max(0, amplitude * forma - sea),  com forma = pow(x, sharpness), x ∈ [0,1]
 *   planet.js     → t = h / (amplitude - sea)             — a altura NORMALIZADA que indexa a rampa
 *   planet-palette.js → BANDS (não é exportado; WET_EDGE, que é BANDS[2], serve de conferência)
 *
 * Invertendo: para a rampa chegar em `t`, o campo tem de valer `x = (t·(1-i) + i)^(1/sharpness)`,
 * com `i = sea/amplitude`. E aqui está o ponto: `x = (fbm+1)/2` de um campo de média zero, então a
 * MEDIANA de x é 0,5. Isso não modela distribuição nenhuma — só usa que o ruído é simétrico.
 * Comparar 0,5 com o x exigido por cada faixa é aritmética, e responde se a faixa é pintada.
 */
const BANDS = [0.0, 0.16, 0.3, 0.55, 0.86];
if (Math.abs(BANDS[2] - WET_EDGE) > 1e-9) {
  throw new Error(
    `BANDS[2] (${BANDS[2]}) não bate com o WET_EDGE importado (${WET_EDGE}) — a transcrição da ` +
      `rampa saiu de sincronia com planet-palette.js. Corrija a tabela acima antes de ler o resto.`
  );
}
const NOMES = ['mar profundo', 'plataforma', 'costa', 'terra alta', 'pico'];
const xExigido = (p, t) => ((t * (1 - inundacao(p)) + inundacao(p)) ** (1 / p.sharpness));
console.log(`  x é o campo remapeado para [0,1]; ele é simétrico, então sua MEDIANA é 0,50.`);
console.log(`  ${'faixa'.padEnd(13)}${'t'.padStart(6)}${'x exigido (MED)'.padStart(18)}${'planetas em que o'.padStart(20)}`);
console.log(`  ${''.padEnd(13)}${''.padStart(6)}${''.padStart(18)}${'ponto MEDIANO chega'.padStart(20)}`);
for (let b = 0; b < BANDS.length; b++) {
  const xs = planetas.map((x) => xExigido(x.p, BANDS[b]));
  const alcanca = xs.filter((x) => x <= 0.5).length;
  const linha =
    `  ${NOMES[b].padEnd(13)}${f(BANDS[b], 2).padStart(6)}${f(pct(xs, 0.5)).padStart(18)}` +
    `${`${alcanca}  ${frac(alcanca, planetas.length)}`.padStart(20)}`;
  console.log(alcanca === 0 ? vermelho(`${linha}  ← NUNCA PINTADA`) : linha);
}

titulo('7. O DIAGNÓSTICO — o que está colapsado');
const chunksNorm = planetas.map((x) => x.p.chunksNorm);
console.log(
  `  chunksNorm = log2(1+chunks)/8 →  mín ${f(Math.min(...chunksNorm))} · MED ${f(pct(chunksNorm, 0.5))} · máx ${f(Math.max(...chunksNorm))}` +
    `  (chunks MED ${pct(planetas.map((x) => x.node.chunks || 0), 0.5)}) — a MÃE de amplitude, sea, ridged e atmosphere`
);

if (colapsados.length) {
  for (const c of colapsados) {
    console.log(
      vermelho(`  ▶ GEOMETRIA: ${c.e.nome} ocupa ${(c.ocupUtil * 100).toFixed(0)}% da faixa teórica no miolo do corpus`) +
        `\n      P10 ${f(pct(c.vs, 0.1))} … P90 ${f(pct(c.vs, 0.9))}, contra ${f(TEORICA.get(c.e.nome).min)} … ${f(TEORICA.get(c.e.nome).max)} que o código permite`
    );
  }
} else {
  console.log(
    `  ▶ GEOMETRIA: ${amarelo('nenhum eixo colapsado')} — todos varrem >= 15% da faixa teórica no miolo,` +
      ` e o corpus\n      produz ${ordenados.length} formatos em ${planetas.length} planetas. A forma NÃO é a causa da homogeneidade.`
  );
}

const dominante = [...famílias].sort((a, b) => b.n - a.n)[0];
console.log(
  vermelho(`  ▶ COR: ${famílias.length} famílias para ${planetas.length} planetas — a maior cobre ${frac(dominante.n, planetas.length)} do céu`) +
    `\n      A cor sai de \`kind\`, e o desvio por semente é ±0,02 de matiz: menor que o degrau em que` +
    `\n      o olho separa dois azuis. A semente pinta ${exatas.size} tintas que leem como ${famílias.length}.`
);

const mortas = BANDS.filter((t) => planetas.every((x) => xExigido(x.p, t) > 0.5)).length;
console.log(
  vermelho(`  ▶ CONTRASTE: ${mortas} das ${BANDS.length} faixas de bioma exigem campo acima da mediana em TODO planeta`) +
    `\n      As faixas de cima são as que carregam a matiz do tipo e o brilho de referência. Sem elas` +
    `\n      sobram mar (L≈0,09) e costa dessaturada (L≈0,50) — corpo escuro com manchas cinzas.`
);

console.log(
  `\n  ⚠️ Este censo mede PARÂMETRO, não pixel. Os ${ordenados.length} formatos são o TETO do que a tela pode\n` +
    `     mostrar, nunca o piso: dois parâmetros distintos ainda podem desenhar a mesma bola escura.`
);
