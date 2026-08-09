#!/usr/bin/env node
/**
 * A CENA É UMA LENTE, NUNCA UMA DONA DO MUNDO. Este script PROVA isso — por auditoria e por
 * perturbação.
 *
 *     node scripts/lei-cena.mjs        # sai 0 se a lei vale para todo corpo do corpus servido
 *
 * ## A lei
 *
 * Trocar de cena decide o que se **ACENDE** (`passes`, `camadas`) e **de onde se OLHA** (`chegada`,
 * `aoEntrar`). Ela não decide o que um corpo **É**: classe, física e pele saem de
 * `entity-physics.js` e `superficies.js`, e nenhuma das duas recebe a cena.
 *
 * É a mesma forma da 1ª lei do Neo4j — *muda o brilho, nunca a classe* — aplicada a um eixo que
 * ainda não a tinha. E a consequência de ela falhar calada é a mesma: o modo de OLHAR decidindo o
 * que a coisa é faz o usuário aprender que a forma não significa nada. Esta base já pagou duas
 * vezes por isso (uma lua em foco resolvendo como galáxia; a taxonomia velha virando 228 de 228
 * agregados em galáxia).
 *
 * ## O caminho: AUDITORIA, porque `CENAS` não é importável sem WebGL
 *
 * `CENAS` é um `const` dentro da fábrica `createScene` — não é exportado, e alcançá-lo exigiria
 * instanciar a cena inteira (`WebGLRenderer`, `EffectComposer`, canvas), que não existe em Node.
 *
 * ⚠️ **Transcrever a tabela aqui seria pior que não ter oráculo:** ela viraria uma segunda fonte da
 * verdade livre para divergir em silêncio, e o oráculo passaria a atestar cenas que não existem —
 * exatamente o preço que os oráculos de GLSL pagam à mão. Então a saída é ler o `scene.js` DE
 * VERDADE: o bloco `const CENAS = …` é recortado do arquivo com um balanceador de chaves e avaliado
 * como literal. Isso funciona porque no nível de cima ele só tem literais e arrow functions — e as
 * arrows (`chegada`, `aoEntrar`), que é onde moram as variáveis livres da fábrica, **não são
 * chamadas**. Mudou o `scene.js`, mudou o que este script audita, sem ninguém lembrar de nada.
 *
 * Se o recorte falhar, o script **morre** em vez de cair numa tabela de reserva: uma tabela de
 * reserva é a transcrição voltando pela porta dos fundos.
 *
 * ## As quatro provas, e por que são quatro
 *
 * 1. **O VOCABULÁRIO da tabela** — uma entrada de cena só pode declarar `id`, `passes`, `camadas`,
 *    `chegada` e `aoEntrar`. É a REGRA DO CATÁLOGO: nomeie o que a classe ACEITA. É esta prova que
 *    pega a edição futura em que alguém acrescenta `superficie:` ou `classe:` a uma cena — o jeito
 *    mais provável de a lei cair, porque parece conveniente e compila.
 * 2. **Os CALL SITES** — todo chamado de `entityPhysics`, `classificar`, `fenomenos` e
 *    `superficieDe` em `src/` tem os argumentos lidos e recusados se mencionarem a cena. É a prova
 *    de que a cena **não chega** aos três módulos.
 * 3. **A PUREZA dos módulos** — eles não podem importar quem conhece cena nem ler global de
 *    navegador. É a prova de que a cena não chega por baixo, sem passar por argumento.
 * 4. **A PERTURBAÇÃO** — para todo corpo do corpus servido, a cena é ENFIADA nos três por todos os
 *    canais que as assinaturas expõem (chave no `node`, chave no `contexto`, argumento posicional
 *    extra), uma vez por cena registrada, e a assinatura do corpo tem de sair idêntica. É a prova
 *    de que, se um dia a cena chegar, ela **não muda nada**.
 *
 * ⚠️ **A prova 4 é mais fraca que a do `lei-neo4j.mjs`, e é honesto dizer por quê:** lá as
 * dimensões perturbadas (`centrality`, `usage`) são entradas REAIS das funções, então a perturbação
 * exercita caminho vivo. Aqui a cena não é entrada de nada — enfiá-la testa que as funções ignoram
 * o que não conhecem. **Quem carrega a lei é a prova 2**; a 4 fecha a porta do outro lado, e as
 * duas juntas é que valem. Sozinha, a 4 seria um teste verde que não prova nada.
 *
 * ## O que ele NÃO prova
 *
 * - **Que a cena não influencia por via INDIRETA.** As provas 2 e 3 são textuais: um call site que
 *   passasse `contexto` montado a partir do estado da cena, sob nome inocente, passaria pelo filtro.
 *   O que limita o estrago é o contrato de entrada — `entityPhysics` só lê `contexto.dominante` e
 *   `contexto.sistema`, e as duas vêm da CONTENÇÃO — mas isso é leitura humana, não medida daqui.
 * - **Nada sobre a TELA.** Que a cena acenda o que declarou, que o passe da lente de fato desligue,
 *   que a chegada enquadre: tudo isso é quadro, e quadro se mede com as sondas do `spatia`.
 * - **Nada sobre cena que não esteja em `CENAS`.** Se algum caminho trocar camada por fora da
 *   tabela, ele é invisível para este script.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { entityPhysics, classificar, fenomenos, dominanteDe } from '../src/space/entity-physics.js';
import { superficieDe } from '../src/space/superficies.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPATIA = process.env.SPATIA_HTTP || 'http://127.0.0.1:8787';

/** O arquivo que declara as cenas. Ele NÃO é editado por este script — só lido. */
const SCENE_JS = path.join(RAIZ, 'src', 'space', 'scene.js');
/** Os três módulos que a cena não pode tocar, e a quarta função que compõe a identidade. */
const PUROS = ['entity-physics.js', 'superficies.js'].map((f) => path.join(RAIZ, 'src', 'space', f));
/** Os chamados auditados. `fenomenos` entra porque ela compõe a assinatura junto com a classe. */
const FUNCOES = ['entityPhysics', 'classificar', 'fenomenos', 'superficieDe'];

const falhas = [];
const nota = (secao, texto) => falhas.push({ secao, texto });

// ────────────────────────────────────────────────────────── um leitor de código que respeita aspas

/**
 * Avança um índice por cima de comentário, string e template literal, devolvendo o próximo índice
 * de código de verdade. Sem isso, uma chave dentro de um comentário desbalanceia o recorte — e o
 * `scene.js` é feito de comentários longos de propósito.
 */
function pulaOQueNaoEhCodigo(texto, i) {
  const dois = texto.slice(i, i + 2);
  if (dois === '//') {
    const fim = texto.indexOf('\n', i);
    return fim < 0 ? texto.length : fim;
  }
  if (dois === '/*') {
    const fim = texto.indexOf('*/', i + 2);
    return fim < 0 ? texto.length : fim + 2;
  }
  const c = texto[i];
  if (c === '"' || c === "'" || c === '`') {
    let j = i + 1;
    while (j < texto.length && texto[j] !== c) j += texto[j] === '\\' ? 2 : 1;
    return j + 1;
  }
  return i;
}

/**
 * Marca com 1 todo byte que NÃO é código — comentário, string, template.
 *
 * ⚠️ Ela existe porque a primeira versão procurava o chamado por regex e por linha, e acusou
 * `classificar()` dentro de uma STRING de `AUSENTES_NA_TABELA` que se estende por cinco linhas
 * (`superficies.js:215`) como se fosse um call site. Um oráculo que aponta prosa como código gasta
 * a confiança de quem o lê — e depois de duas dessas ninguém mais lê a saída verde.
 */
function mascaraDeCodigo(texto) {
  const mascara = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) {
    const pulou = pulaOQueNaoEhCodigo(texto, i);
    if (pulou === i) continue;
    for (let k = i; k < Math.min(pulou, texto.length); k++) mascara[k] = 1;
    i = pulou - 1;
  }
  return mascara;
}

/** `true` se `nome(` aparece como CÓDIGO no texto — citação em comentário ou string não conta. */
function chamaEmCodigo(texto, nome) {
  const codigo = mascaraDeCodigo(texto);
  const busca = new RegExp(`\\b${nome}\\s*\\(`, 'g');
  let m;
  while ((m = busca.exec(texto))) if (!codigo[m.index]) return true;
  return false;
}

/** Recorta do texto o trecho equilibrado que começa no primeiro `abre` a partir de `de`. */
function recorteEquilibrado(texto, de) {
  const ABRE = '({[';
  const FECHA = ')}]';
  let profundidade = 0;
  let comeco = -1;
  for (let i = de; i < texto.length; i++) {
    const pulou = pulaOQueNaoEhCodigo(texto, i);
    if (pulou !== i) {
      i = pulou - 1;
      continue;
    }
    if (ABRE.includes(texto[i])) {
      if (comeco < 0) comeco = i;
      profundidade++;
    } else if (FECHA.includes(texto[i])) {
      profundidade--;
      if (profundidade === 0) return { texto: texto.slice(comeco, i + 1), comeco, fim: i };
      if (profundidade < 0) return null;
    }
  }
  return null;
}

// ───────────────────────────────────────────────── 1. AS CENAS, lidas do `scene.js` que a cena usa

const fonteDaCena = fs.readFileSync(SCENE_JS, 'utf8');

/**
 * O bloco `const CENAS = Object.freeze({…})`, recortado e avaliado.
 *
 * ⚠️ O `new Function` é sobre um trecho do PRÓPRIO repositório, lido do disco — não é entrada de
 * ninguém. E ele avalia só o literal: nenhuma arrow é chamada, então as variáveis livres da fábrica
 * (`focusedNode`, `HOME`, `universe`) nunca são resolvidas.
 */
function leCenasDeclaradas() {
  const marca = fonteDaCena.indexOf('const CENAS');
  if (marca < 0) return null;
  const igual = fonteDaCena.indexOf('=', marca);
  if (igual < 0) return null;
  const bloco = recorteEquilibrado(fonteDaCena, igual + 1);
  if (!bloco) return null;
  // A fatia começa no `(` de `Object.freeze(`, então a expressão avaliada preserva o congelamento.
  const expressao = fonteDaCena.slice(igual + 1, bloco.fim + 1);
  let valor;
  try {
    valor = new Function(`return (${expressao});`)();
  } catch (erro) {
    return { erro: erro.message, bloco: bloco.texto };
  }
  return { valor, bloco: bloco.texto };
}

const lidas = leCenasDeclaradas();
if (!lidas || lidas.erro || !lidas.valor || typeof lidas.valor !== 'object') {
  console.error(
    `\x1b[31mnão consegui recortar \`const CENAS\` de ${path.relative(RAIZ, SCENE_JS)}` +
      `${lidas?.erro ? ` (${lidas.erro})` : ''}.\x1b[0m\n` +
      `  Este oráculo NÃO tem tabela de reserva de propósito: uma cópia da tabela aqui seria uma\n` +
      `  segunda fonte da verdade livre para divergir em silêncio. Conserte o recorte ou o arquivo.`
  );
  process.exit(1);
}

const CENAS = lidas.valor;
const cenas = Object.entries(CENAS).map(([chave, cena]) => ({ chave, cena }));

if (cenas.length < 2) {
  console.error(
    `\x1b[31mCENAS tem ${cenas.length} entrada(s) — uma lei sobre TROCAR de cena precisa de duas.\x1b[0m\n` +
      `  Com uma cena só não há o que perturbar, e este script sairia verde sem provar nada.`
  );
  process.exit(1);
}

// ───────────────────────────────────────────────────────────────────── o corpus, sempre do servidor

/*
 * ⚠️ O corpus vem do SERVIDOR, que é quem lê o `.env` — nunca do ambiente deste shell. Três
 * variáveis estão exportadas no perfil apontando para lugares que não existem, e um censo rodado
 * contra o corpus errado responde com convicção total sobre um céu que ninguém está vendo.
 */
const graph = await fetch(`${SPATIA}/api/graph`)
  .then((r) => r.json())
  .catch(() => null);
if (!graph) {
  console.error(`sem resposta de ${SPATIA}/api/graph — suba o ./serve.py primeiro.`);
  process.exit(1);
}
if (!graph.corpus?.collection) {
  console.error(
    `${SPATIA}/api/graph respondeu sem \`corpus\` — sem saber de que céu vieram, os corpos abaixo\n` +
      `  não sustentam afirmação nenhuma. Carimbo ausente não é carimbo neutro.`
  );
  process.exit(1);
}

const corpos = graph.nodes.filter((n) => n.type === 'file');
if (!corpos.length) {
  console.error(`o corpus ${graph.corpus.collection} não tem um único corpo — não há o que provar.`);
  process.exit(1);
}

/*
 * A dominância é contexto e vem da CONTENÇÃO, não da cena — e é IMPORTADA, não recalculada. Uma
 * cópia com `>` estrito diverge da cena no empate (ela desempata pelo menor `id`), e um teste de
 * fidelidade que recalcula a regra por conta própria testa a sua cópia, não o céu.
 */
const porSistema = new Map();
for (const n of corpos) {
  const dir = n.dir || n.repo || '';
  if (!porSistema.has(dir)) porSistema.set(dir, []);
  porSistema.get(dir).push(n);
}
const dominantes = new Set([...porSistema.values()].map((v) => dominanteDe(v).id));

console.log(`\x1b[1mLEI DA CENA — a cena é uma LENTE, nunca uma dona do mundo\x1b[0m`);
console.log(`  corpus: ${graph.corpus.collection} · ${corpos.length} corpos · ${porSistema.size} sistemas`);
console.log(`  cenas registradas em scene.js: ${cenas.map(({ cena }) => cena.id ?? '?').join(', ')}`);

// ───────────────────────────── §1 o vocabulário da tabela: o que uma cena tem DIREITO de declarar

/**
 * As chaves que uma entrada de `CENAS` aceita, e o eixo de que cada uma responde.
 *
 * ⚠️ Nomeadas por ACEITAÇÃO, nunca por exclusão — classificar por exclusão é o defeito que fazia
 * uma lua em foco resolver como galáxia. Chave nova aqui é decisão de MODELO: ela tem de responder
 * "o que acende" ou "de onde se olha", e nada mais.
 */
const VOCABULARIO_DA_CENA = Object.freeze({
  id: 'identidade — o nome pelo qual a rota e a sonda a pedem',
  passes: 'o que ACENDE — passes de pós-processamento',
  camadas: 'o que ACENDE — grupos visíveis',
  chegada: 'de onde se OLHA — a distância de enquadramento',
  aoEntrar: 'de onde se OLHA — o ajuste de pose na entrada',
});
const OBRIGATORIAS = ['id', 'passes', 'camadas', 'chegada'];

console.log(`\n\x1b[1m§1 O VOCABULÁRIO DA TABELA\x1b[0m  o que uma cena tem direito de declarar`);
for (const { chave, cena } of cenas) {
  const declaradas = Object.keys(cena);
  const intrusas = declaradas.filter((k) => !Object.hasOwn(VOCABULARIO_DA_CENA, k));
  const faltando = OBRIGATORIAS.filter((k) => !declaradas.includes(k));
  if (intrusas.length) {
    nota('§1', `a cena \`${chave}\` declara ${intrusas.map((k) => `\`${k}\``).join(', ')} — fora do vocabulário`);
  }
  if (faltando.length) {
    nota('§1', `a cena \`${chave}\` não declara ${faltando.map((k) => `\`${k}\``).join(', ')}`);
  }
  if (!Object.isFrozen(cena)) nota('§1', `a cena \`${chave}\` não está congelada — a tabela é mutável em runtime`);
  const marca = intrusas.length || faltando.length ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m';
  console.log(
    `  ${marca} ${String(chave).padEnd(10)} ${declaradas.join(', ')}` +
      `${intrusas.length ? `  \x1b[31m← ${intrusas.join(', ')} não pertence a uma lente\x1b[0m` : ''}`
  );
}
if (!Object.isFrozen(CENAS)) nota('§1', 'a tabela `CENAS` não está congelada');

/*
 * A tabela também não pode CLASSIFICAR. Uma cena que chamasse `superficieDe` dentro de `aoEntrar`
 * estaria decidindo o que um corpo é a partir do modo de olhar — pelo caminho mais curto que existe.
 */
for (const nome of FUNCOES) {
  if (chamaEmCodigo(lidas.bloco, nome)) {
    nota('§1', `a tabela \`CENAS\` chama \`${nome}()\` — a lente está classificando`);
  }
}

// ─────────────────────── §2 os call sites: a cena não chega aos módulos que dizem o que um corpo É

/** Todo `.js` sob `src/` — a auditoria varre o app inteiro, não só o `scene.js`. */
function todosOsFontes(dir) {
  const saida = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const alvo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) saida.push(...todosOsFontes(alvo));
    else if (entrada.name.endsWith('.js')) saida.push(alvo);
  }
  return saida;
}

/**
 * As palavras que denunciam a cena atravessando para dentro de um chamado.
 *
 * ⚠️ Os ids saem de `CENAS`, não de literal escrito aqui — cena nova entra na varredura sozinha.
 * ⚠️ E as chaves de `camadas` ficam de FORA de propósito: `universe` é o nome da camada E o nome do
 * objeto que a desenha, e `entityPhysics(node, { dominante: universe.ehDominante(…) })` é um call
 * site legítimo — a dominância vem da contenção, não da lente.
 */
const VOCABULARIO_DE_CENA = [
  ...new Set([
    'CENAS',
    'cena',
    'cenas',
    'modo',
    'setMode',
    'aplicarCena',
    'sceneMode',
    'passes',
    'camadas',
    'chegada',
    'aoEntrar',
    ...cenas.map(({ cena }) => cena.id).filter((id) => typeof id === 'string'),
  ]),
];

const fontes = todosOsFontes(path.join(RAIZ, 'src'));
const chamados = [];

for (const arquivo of fontes) {
  const texto = fs.readFileSync(arquivo, 'utf8');
  const codigo = mascaraDeCodigo(texto);
  for (const nome of FUNCOES) {
    const busca = new RegExp(`\\b${nome}\\s*\\(`, 'g');
    let m;
    while ((m = busca.exec(texto))) {
      if (codigo[m.index]) continue;
      const antes = texto.slice(Math.max(0, m.index - 20), m.index);
      // A DEFINIÇÃO não é um chamado. Sem isto o módulo puro acusaria a si mesmo.
      if (/\bfunction\s*$/.test(antes)) continue;
      const args = recorteEquilibrado(texto, m.index + nome.length);
      if (!args) continue;
      const linha = texto.slice(0, m.index).split('\n').length;
      chamados.push({
        arquivo: path.relative(RAIZ, arquivo),
        linha,
        nome,
        args: args.texto.replace(/\s+/g, ' '),
      });
    }
  }
}

console.log(`\n\x1b[1m§2 OS CALL SITES\x1b[0m  a cena não chega a quem diz o que um corpo é`);
if (!chamados.length) {
  nota('§2', `nenhum chamado de ${FUNCOES.join('/')} encontrado em src/ — a varredura envelheceu`);
  console.log(`  \x1b[31m✗ zero chamados encontrados — a varredura envelheceu, e zero não é prova\x1b[0m`);
}
for (const c of chamados) {
  const suspeitas = VOCABULARIO_DE_CENA.filter((p) => new RegExp(`\\b${p}\\b`).test(c.args));
  if (suspeitas.length) {
    nota('§2', `${c.arquivo}:${c.linha} — \`${c.nome}\` recebe ${suspeitas.join(', ')}: ${c.args}`);
  }
  const marca = suspeitas.length ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m';
  const arg = c.args.length > 78 ? `${c.args.slice(0, 75)}…` : c.args;
  console.log(`  ${marca} ${`${c.arquivo}:${c.linha}`.padEnd(28)} ${c.nome}${arg}`);
}

// ───────────────────────────────── §3 a pureza: a cena também não chega por baixo, sem argumento

console.log(`\n\x1b[1m§3 A PUREZA DOS MÓDULOS\x1b[0m  sem three, sem global, sem quem conheça cena`);
for (const arquivo of PUROS) {
  const texto = fs.readFileSync(arquivo, 'utf8');
  const nomeCurto = path.relative(RAIZ, arquivo);
  const imports = [...texto.matchAll(/^import\s.*?from\s+'([^']+)'/gm)].map((m) => m[1]);
  const proibidos = imports.filter((i) => i === 'three' || /scene|solver|universe/.test(i));
  if (proibidos.length) nota('§3', `${nomeCurto} importa ${proibidos.join(', ')}`);
  /*
   * Global de navegador é a porta lateral: um módulo que lesse `document.documentElement.dataset`
   * poderia saber a cena sem ninguém lhe passar nada, e nenhum call site denunciaria.
   */
  const globais = ['window', 'document', 'globalThis', 'localStorage'].filter((g) =>
    new RegExp(`(^|[^\\w.'\`])${g}\\s*[.[]`, 'm').test(texto)
  );
  if (globais.length) nota('§3', `${nomeCurto} lê ${globais.join(', ')} — a cena pode chegar por fora do argumento`);
  const marca = proibidos.length || globais.length ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m';
  console.log(`  ${marca} ${nomeCurto.padEnd(28)} imports: ${imports.length ? imports.join(', ') : '\x1b[2mnenhum\x1b[0m'}`);
}

// ───────────────────── §4 a perturbação: se a cena chegar, ela não muda o que o corpo É

/**
 * A assinatura de identidade de um corpo — tudo o que a cena NÃO pode mudar.
 *
 * ⚠️ A física inteira entra serializada, não três campos escolhidos: campo novo em
 * `entityPhysics` passa a ser vigiado sozinho, sem ninguém lembrar de acrescentá-lo aqui.
 */
function assinatura(node, contexto, injecao = {}) {
  const noNo = { ...node, ...(injecao.no || {}) };
  const noContexto = { ...contexto, ...(injecao.ctx || {}) };
  const extra = injecao.pos || [];
  const fisica = entityPhysics(noNo, noContexto, ...extra);
  const classe = classificar(fisica, noNo, ...extra);
  const fens = fenomenos(fisica, noNo, ...extra)
    .map((f) => f.tipo)
    .sort();
  const pele = superficieDe(classe, fisica, fens, ...extra);
  return JSON.stringify({ fisica, classe, fens, pele });
}

/**
 * Os canais por onde uma cena poderia entrar nos três módulos — um por assinatura exposta.
 *
 * ⚠️ Não é "chave inventada com cara de opção": é o inverso da armadilha nº 20 do handoff. Ali a
 * assinatura errada fez o corpo sair `PELE=none` e o zero pareceu medida. Aqui a assinatura REAL é
 * `entityPhysics(node, contexto)` / `classificar(fisica, node)` / `superficieDe(classe, fisica,
 * fenomenos)`, e o que se enfia é sempre argumento A MAIS. Se um dia alguém acrescentar um
 * parâmetro de cena a qualquer uma delas, este canal deixa de ser inerte e a divergência aparece.
 * A guarda contra o zero silencioso é a linha de baixo: a base é medida com os MESMOS corpos, e
 * `provas` é publicado.
 */
const canaisDaCena = (cena) => [
  ['contexto.cena', { ctx: { cena } }],
  ['contexto.modo', { ctx: { modo: cena.id, mode: cena.id, scene: cena.id } }],
  ['contexto.camadas', { ctx: { camadas: cena.camadas, passes: cena.passes } }],
  ['node.cena', { no: { cena, modo: cena.id, scene: cena.id } }],
  ['node.camadas', { no: { camadas: cena.camadas, passes: cena.passes } }],
  ['argumento posicional', { pos: [cena] } ],
];

const violacoes = [];
let provas = 0;

for (const node of corpos) {
  const contexto = { dominante: dominantes.has(node.id), sistema: node.dir || node.repo || '' };
  const base = assinatura(node, contexto);
  for (const { chave, cena } of cenas) {
    for (const [canal, injecao] of canaisDaCena(cena)) {
      provas++;
      const comCena = assinatura(node, contexto, injecao);
      if (comCena !== base) violacoes.push({ source: node.source, cena: chave, canal, base, comCena });
    }
  }
  /*
   * IDA E VOLTA — a lente vai a cada cena e retorna à primeira, e a terceira leitura tem de repetir
   * a primeira. Estado guardado no módulo (um cache com chave de cena, o defeito mais plausível
   * depois de "a cena vira argumento") sobrevive à perturbação de cima e morre aqui.
   */
  for (const { cena } of [...cenas, cenas[0]]) {
    provas++;
    if (assinatura(node, contexto, { ctx: { cena } }) !== base) {
      violacoes.push({ source: node.source, cena: cena.id, canal: 'ida e volta', base, comCena: '—' });
    }
  }
}

console.log(`\n\x1b[1m§4 A PERTURBAÇÃO\x1b[0m  a cena enfiada nos três módulos por todo canal exposto`);
console.log(`  canais: ${canaisDaCena(cenas[0].cena).map(([n]) => n).join(' · ')} · ida e volta`);
console.log(`  combinações testadas: ${provas}  (${corpos.length} corpos × ${cenas.length} cenas)`);

for (const v of violacoes.slice(0, 8)) {
  nota('§4', `${v.source} muda de identidade na cena \`${v.cena}\` (${v.canal})`);
}
if (violacoes.length > 8) nota('§4', `… e mais ${violacoes.length - 8} corpos`);

// ────────────────────────────────────────────────────────────────────────────────────── o veredito

if (falhas.length) {
  /*
   * ⚠️ O número é de APONTAMENTOS, não de corpos: o §4 imprime os oito primeiros e resume o resto,
   * então dizer "N violações" contaria a lista truncada como se fosse a população. É a armadilha nº
   * 4 do handoff em miniatura — um resto que não é diagnóstico.
   */
  const perturbacao = violacoes.length ? ` · ${violacoes.length} de ${provas} perturbações divergiram` : '';
  console.log(`\n\x1b[31m✗ A LEI CAIU — ${falhas.length} apontamento(s)${perturbacao}\x1b[0m`);
  for (const f of falhas) console.log(`  \x1b[31m${f.secao}\x1b[0m ${f.texto}`);
  console.log(
    `\n  \x1b[33mTrocar de cena passou a decidir o que um corpo É. O usuário aprende que a forma\x1b[0m\n` +
      `  \x1b[33mnão significa nada — é a 1ª lei do Neo4j caindo pelo eixo de olhar.\x1b[0m`
  );
  process.exit(1);
}

console.log(`\n\x1b[32m✓ a lei vale\x1b[0m  a cena decide o que ACENDE e de onde se OLHA, e mais nada.`);
console.log(
  `  \x1b[2mnenhuma das ${cenas.length} cenas altera física, família, tipo, porte, fenômeno ou pele de\x1b[0m\n` +
    `  \x1b[2mnenhum dos ${corpos.length} corpos — e nenhum dos ${chamados.length} chamados em src/ recebe a cena.\x1b[0m`
);
