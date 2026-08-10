#!/usr/bin/env node
/**
 * A LEI DO FAVORITO — a marca é ESCOLHA DE GENTE, e ela não decide o que um corpo É.
 *
 *     node scripts/lei-favoritos.mjs        # sai 0 quando as cinco leis valem
 *
 * ⭑ O par dele é `scripts/lei-favoritos-ui.mjs`: aqui se prova o MODELO, lá a TELA. Os dois rodam
 * juntos — a marca legítima precisa das duas metades.
 *
 * ## A lei
 *
 * O operador marca corpos e escolhe a aparência nomeada de alguns. Isso só é legítimo enquanto
 * valerem três coisas, e as três são PROVADAS aqui em vez de declaradas:
 *
 * 1. **A marca não entra em `classificar()`, `entityPhysics()` nem `superficieDe()`** (§2). Se o
 *    DADO decidisse que um arquivo é Marte, o modo de olhar estaria decidindo a classe — o defeito
 *    que esta base já pagou duas vezes.
 * 2. **Ela mora no OPERADOR** (§4), com a chave declarada em `prefs` e um formato que sobrevive ao
 *    que estiver gravado de antes.
 * 3. **Ela é legível como escolha** (§5): quem marcou, quando, e de qual céu.
 *
 * E o caso que decide o desenho tem seção própria (§3): **o arquivo muda de classe**, e a escolha
 * não pode ficar presa nem sumir calada.
 *
 * ## Por que ele roda sobre a RAIZ derivada do próprio arquivo
 *
 * ☠️ Com caminho absoluto de máquina o oráculo importa sempre a mesma árvore: ele passaria ao ser
 * rodado sobre uma CÓPIA MUTADA, atestando uma guarda que a cópia não tem. É a mesma armadilha que o
 * `AGENT_CWD` absoluto já custou uma vez, e é o que torna a prova de REPROVAÇÃO possível — copie
 * `src/` para outro lugar, quebre uma linha, rode o oráculo de lá, e ele tem de ficar vermelho.
 *
 * ## O que ele NÃO prova
 *
 * - **Nada sobre a tela.** Que a marca apareça dizendo *"você marcou"* é a fase da interface, e se
 *   mede com as sondas do `spatia` e as duas guardas do §4 do handoff.
 * - **Que a textura nomeada desenha.** Nenhum dos arquivos do catálogo está em disco (T-34), e o §1
 *   MEDE isso em vez de supor — o modelo já degrada anunciando quando falta.
 * - ⚠️ **Que a perturbação alcance TODO campo.** Ela só chega onde o pipeline carrega valor: uma
 *   leitura de `fisica.favorito` é inalcançável, porque `entityPhysics` devolve forma fixa e nunca
 *   copia chave desconhecida. Quem pega esse caso é a varredura TEXTUAL do §2 — as duas juntas é que
 *   valem, e é honesto dizer qual carrega o quê. Medido com a implementação mutada: `superficieDe`
 *   lendo `classe.favorito` ou um fenômeno `favorito` cai nas DUAS; lendo `fisica.favorito`, só na
 *   textual.
 */
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SPATIA = process.env.SPATIA_HTTP || 'http://127.0.0.1:8787';
const src = (p) => fs.readFileSync(`${RAIZ}/${p}`, 'utf8');

const falhas = [];
const ok = [];
const conferir = (nome, condicao, detalhe = '') => {
  if (condicao) ok.push(nome);
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};
const recusa = (fn) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e.message;
  }
};

const F = await import(`${RAIZ}/src/space/favoritos.js`);
const { entityPhysics, classificar, fenomenos, dominanteDe } = await import(
  `${RAIZ}/src/space/entity-physics.js`
);
const { superficieDe, SUPERFICIE } = await import(`${RAIZ}/src/space/superficies.js`);

// ───────────────────────────────────────────────────────── o corpus, sempre do SERVIDOR

/*
 * ⚠️ Do servidor, que é quem lê o `.env` — nunca do ambiente deste shell. Três variáveis estão
 * exportadas no perfil apontando para lugares que não existem, e um oráculo rodado contra o corpus
 * errado responde com convicção total sobre um céu que ninguém está vendo.
 */
const graph = await fetch(`${SPATIA}/api/graph`)
  .then((r) => r.json())
  .catch(() => null);
if (!graph?.corpus?.collection) {
  console.error(
    `sem \`corpus\` em ${SPATIA}/api/graph — suba o ./serve.py primeiro.\n` +
      `  Sem saber de que céu vieram, os corpos abaixo não sustentam afirmação nenhuma, e um zero\n` +
      `  aqui teria cara de medida. Carimbo ausente não é carimbo neutro.`
  );
  process.exit(1);
}
const CORPUS = graph.corpus.collection;
const corpos = graph.nodes.filter((n) => n.type === 'file');
const estruturas = graph.nodes.filter((n) => n.type !== 'file');
if (!corpos.length) {
  console.error(`o corpus ${CORPUS} não tem um único corpo — não há o que provar.`);
  process.exit(1);
}

const EMITIDOS = new Set(graph.nodes.filter((x) => x.type === 'dir').map((x) => x.dir));
const porSistema = new Map();
for (const n of corpos) {
  /*
   * ⚠️ O sistema sai dos nós `dir` EMITIDOS, não de `n.dir`. O servidor só promove a sistema pasta
   * com mais de um arquivo (`graph._hierarchy`); agrupar por `dir` distinto dá ao arquivo solitário
   * um sistema próprio, ele vira dominante e portanto ESTRELA — layout decidindo o papel. A
   * dominância aqui tem de ser a MESMA que a cena calcula.
   */
  const dir = EMITIDOS.has(n.dir || '') ? n.dir : `repo:${n.repo}`;
  if (!porSistema.has(dir)) porSistema.set(dir, []);
  porSistema.get(dir).push(n);
}
const dominantes = new Set([...porSistema.values()].map((v) => dominanteDe(v).id));

/** A ontologia de um corpo, como a cena a deriva. `injecao` enfia a marca por um canal exposto. */
function ontologia(node, injecao = {}) {
  const noNo = { ...node, ...(injecao.no || {}) };
  const ctx = {
    dominante: dominantes.has(node.id),
    sistema: node.dir || node.repo || '',
    ...(injecao.ctx || {}),
  };
  const extra = injecao.pos || [];
  const fisica = entityPhysics(noNo, ctx, ...extra);
  const classe = classificar(fisica, noNo, ...extra);
  const fens = fenomenos(fisica, noNo, ...extra)
    .map((f) => f.tipo)
    .sort();
  /*
   * ⚠️ A injeção entra nos ARGUMENTOS de `superficieDe` e fica FORA da assinatura devolvida: a
   * comparação é entre o que os módulos produziram, não entre o que este script enfiou. Sem essa
   * separação a perturbação divergiria de si mesma e o vermelho não significaria nada.
   */
  const pele = superficieDe(
    { ...classe, ...(injecao.classe || {}) },
    fisica,
    injecao.fens ? [...fens, ...injecao.fens] : fens,
    ...extra
  );
  return { fisica, classe, fens, pele };
}

const ceu = corpos.map((node) => ({ node, ...ontologia(node) }));

console.log(`\x1b[1mLEI DO FAVORITO — a marca é escolha de gente, e não decide o que um corpo É\x1b[0m`);
console.log(
  `  corpus: ${CORPUS} · ${corpos.length} corpos · ${estruturas.length} estruturas · ${porSistema.size} sistemas`
);

// ══════════════════════════════════════════════════ §1 O CATÁLOGO — o que a marca ACEITA

console.log(`\n\x1b[1m§1 O CATÁLOGO\x1b[0m  nomeie o que a marca aceita; a proibição em campo próprio`);

const contextosDeclarados = Object.values(F.CONTEXTO);
conferir(
  '§1 todo contexto declarado tem entrada em APARENCIAS',
  contextosDeclarados.every((c) => F.APARENCIAS[c] !== undefined),
  contextosDeclarados.filter((c) => F.APARENCIAS[c] === undefined).join(', ')
);
conferir(
  '§1 APARENCIAS não declara contexto fora de CONTEXTO',
  Object.keys(F.APARENCIAS).every((c) => contextosDeclarados.includes(c))
);

/*
 * ⚠️ Toda aparência declarada carrega arquivo, origem e licença. Atribuição descoberta depois da
 * publicação é atribuição que já faltou — e uma entrada sem `arquivo` seria um nome que nada pode
 * desenhar, que é o cabeçalho afirmando com a carga vazia.
 */
const todas = contextosDeclarados.flatMap((c) =>
  Object.entries(F.APARENCIAS[c]).map(([nome, item]) => ({ contexto: c, nome, ...item }))
);
conferir(
  '§1 toda aparência declara arquivo, origem e licença',
  todas.every((a) => a.arquivo && a.origem && a.licenca),
  todas
    .filter((a) => !(a.arquivo && a.origem && a.licenca))
    .map((a) => a.nome)
    .join(', ')
);
/*
 * ☠️ **A unicidade é DENTRO do contexto, e não entre contextos — e a diferença é o que o modelo
 * grava.** `marca.aparencias` é um objeto chaveado por CONTEXTO (`favoritos.js`: `aparencias[
 * contexto] = nome`), então "mercúrio num corpo ROCHOSO" e "mercúrio num PLANETA" são dois
 * registros distintos, e nenhuma leitura os confunde.
 *
 * A regra anterior exigia arquivo único no catálogo INTEIRO, e o motivo escrito era a ambiguidade
 * da escolha — que o armazenamento por contexto já impedia. O que continua valendo, e é o que esta
 * asserção guarda: **duas aparências do MESMO contexto não podem apontar para o mesmo arquivo**,
 * porque aí a escolha do operador de fato deixaria de dizer qual delas ele quis.
 *
 * ⚠️ Compartilhar arquivo entre contextos é aceitável, não desejável: textura dedicada a corpo
 * rochoso (Vesta, Eros, a Lua) diria mais que um mapa de planeta emprestado. É trabalho de asset,
 * não de modelo.
 */
for (const c of contextosDeclarados) {
  const arquivos = Object.values(F.APARENCIAS[c]).map((a) => a.arquivo);
  conferir(
    `§1 em \`${c}\` nenhum arquivo serve a duas aparências`,
    new Set(arquivos).size === arquivos.length,
    arquivos.join(', ')
  );
}

// A proibição em campo próprio, e ela precisa de LEITOR — senão é tabela declarada e não implementada.
const casos = Object.keys(F.SEM_APARENCIA);
conferir(
  '§1 SEM_APARENCIA e APARENCIAS não se sobrepõem',
  casos.every((c) => !contextosDeclarados.includes(c))
);
conferir(
  '§1 todo motivo de SEM_APARENCIA é prosa, não rótulo',
  Object.values(F.SEM_APARENCIA).every((m) => typeof m === 'string' && m.length > 60)
);

/*
 * ⚠️ **Toda pele do céu tem de ter desfecho declarado:** ou abre contexto, ou está nomeada em
 * SEM_APARENCIA com um leitor que a alcança. Pele nova que ninguém classificasse cairia calada em
 * `nenhum` sem motivo — a versão desta base do "resto que não é diagnóstico".
 */
const semDesfecho = Object.values(SUPERFICIE).filter((pele) => {
  /*
   * ⚠️ `none` é da ESTRUTURA, e só dela. O asteroide tinha de ser reconhecido aqui por `tipo` porque
   * não tinha pele; com `SUPERFICIE.ASTEROIDE` existindo, `contextoDe` decide pela pele e a classe
   * deixou de participar — então a varredura não precisa mais fabricar um tipo por pele.
   */
  const classe = { tipo: pele === SUPERFICIE.NENHUMA ? 'sistema' : 'planeta' };
  if (F.contextoDe(classe, pele) !== F.CONTEXTO.NENHUM) return false;
  return !F.casoSemAparencia(classe, pele);
});
conferir(
  '§1 toda pele abre contexto ou tem caso nomeado com motivo',
  semDesfecho.length === 0,
  `sem desfecho: ${semDesfecho.join(', ')}`
);
/*
 * ⭑ **A separação entre ESTRUTURA e ASTEROIDE ficou mais forte, e por isso a asserção mudou.**
 *
 * Antes os dois compartilhavam `none` e só o `tipo` os separava — classificar por exclusão com um
 * remendo em cima. Agora cada um tem a própria pele, e a pergunta é a mesma feita ao vocabulário
 * certo: estrutura cai no caso `estrutura`, e o asteroide não cai em caso nenhum porque ABRE
 * contexto.
 *
 * ⚠️ A combinação `{tipo: 'asteroide', pele: none}` deixou de ser alcançável (`superficieDe`
 * devolve `ASTEROIDE` ou `COMETA` para esse tipo), e afirmar sobre o inalcançável é como um oráculo
 * atesta comportamento que não existe.
 */
conferir(
  '§1 estrutura tem caso próprio, e o asteroide abre contexto em vez de cair nele',
  F.casoSemAparencia({ tipo: 'sistema' }, SUPERFICIE.NENHUMA)?.caso === 'estrutura' &&
    F.casoSemAparencia({ tipo: 'asteroide' }, SUPERFICIE.ASTEROIDE) === null &&
    F.contextoDe({ tipo: 'asteroide' }, SUPERFICIE.ASTEROIDE) === F.CONTEXTO.ROCHOSO
);

// A POPULAÇÃO de cada contexto no céu servido — nenhum contexto pode nascer vazio sem motivo escrito.
const populacao = new Map(contextosDeclarados.map((c) => [c, 0]));
for (const { classe, pele } of ceu) {
  const c = F.contextoDe(classe, pele);
  populacao.set(c, populacao.get(c) + 1);
}
for (const [c, n] of populacao) {
  const aceitas = F.aparenciasDe(c).length;
  console.log(
    `  ${n ? '\x1b[32m✓\x1b[0m' : '\x1b[33m·\x1b[0m'} ${c.padEnd(12)} ${String(n).padStart(3)} corpos · ${aceitas} aparência(s) aceita(s)`
  );
}
conferir('§1 o contexto planetário tem população', populacao.get(F.CONTEXTO.PLANETARIO) > 0);

/*
 * ⭑ MEDIDA, não asserção: quantos arquivos do catálogo existem em disco. Hoje é 0 e é o esperado —
 * T-34 está bloqueada por T-35 justamente porque era esta tarefa que decidia o que baixar. O que o
 * oráculo prova é que o modelo NÃO afirma disponibilidade (§3), e não que os arquivos estão lá.
 */
// A guarda de tipo não é paranoia: sem ela uma entrada de catálogo sem `arquivo` MATA o script aqui,
// antes de o apontamento do §1 chegar ao veredito — morrer no lugar errado esconde o diagnóstico.
const emDisco = new Set(
  todas.map((a) => a.arquivo).filter((a) => typeof a === 'string' && fs.existsSync(path.join(RAIZ, a)))
);
console.log(
  `  \x1b[2m[medida] ${emDisco.size}/${todas.length} texturas do catálogo em disco (T-34 ainda não rodou)\x1b[0m`
);

// ══════════════════════════════════ §2 A MARCA NÃO CHEGA A QUEM DIZ O QUE UM CORPO É

console.log(`\n\x1b[1m§2 A MARCA NÃO CLASSIFICA\x1b[0m  a condição 1, provada por texto e por perturbação`);

// (a) a seta aponta numa direção só: favoritos LÊ a ontologia, e a ontologia não sabe que ele existe.
for (const arquivo of ['src/space/entity-physics.js', 'src/space/superficies.js']) {
  const texto = src(arquivo);
  conferir(
    `§2 ${path.basename(arquivo)} não conhece favoritos`,
    !/favorito|aparencia|aparência|\bmarca\b/i.test(texto)
  );
}

// (b) o módulo é PURO: sem three, sem global de navegador — a marca também não chega por baixo.
const fonteFav = src('src/space/favoritos.js');
const importsFav = [...fonteFav.matchAll(/^import\s.*?from\s+'([^']+)'/gm)].map((m) => m[1]);
conferir(
  '§2 favoritos.js só importa o vocabulário da pele',
  importsFav.join(',') === './superficies.js',
  importsFav.join(', ') || 'nenhum'
);
const globais = ['window', 'document', 'globalThis', 'localStorage'].filter((g) =>
  new RegExp(`(^|[^\\w.'\`])${g}\\s*[.[]`, 'm').test(fonteFav)
);
conferir('§2 favoritos.js não lê global de navegador', globais.length === 0, globais.join(', '));

// (c) nenhum call site dos quatro em src/ recebe marca — varredura, nunca lista branca.
function varrer(dir) {
  const saida = [];
  for (const e of fs.readdirSync(`${RAIZ}/${dir}`, { withFileTypes: true })) {
    const caminho = `${dir}/${e.name}`;
    if (e.isDirectory()) saida.push(...varrer(caminho));
    else if (e.name.endsWith('.js')) saida.push(caminho);
  }
  return saida;
}
const FUNCOES = ['entityPhysics', 'classificar', 'fenomenos', 'superficieDe'];
const VOCABULARIO_DA_MARCA = [
  'favorito',
  'favoritos',
  'favorites',
  'marca',
  'marcas',
  'marcado',
  'marcados',
  'aparencia',
  'aparencias',
  'APARENCIAS',
  'CONTEXTO',
  'contextoDe',
];
let callSites = 0;
const contaminados = [];
for (const arquivo of varrer('src')) {
  const texto = src(arquivo);
  for (const nome of FUNCOES) {
    const busca = new RegExp(`\\b${nome}\\s*\\(([^)]*)\\)`, 'g');
    let m;
    while ((m = busca.exec(texto))) {
      if (/\bfunction\s*$/.test(texto.slice(Math.max(0, m.index - 20), m.index))) continue;
      callSites += 1;
      const sujo = VOCABULARIO_DA_MARCA.filter((p) => new RegExp(`\\b${p}\\b`).test(m[1]));
      if (sujo.length) contaminados.push(`${arquivo} — ${nome}(${m[1]}) recebe ${sujo.join(', ')}`);
    }
  }
}
conferir(
  '§2 a varredura de call sites achou alguma coisa',
  callSites > 0,
  'zero chamados: a varredura envelheceu, e zero não é prova'
);
conferir('§2 nenhum call site dos quatro recebe marca', contaminados.length === 0, contaminados[0] || '');

/*
 * (d) A PERTURBAÇÃO — a prova que o texto não dá. Todo corpo do céu é marcado, com aparência
 * escolhida, e a marca é ENFIADA nos quatro por todos os canais que as assinaturas expõem. A
 * assinatura de identidade tem de sair idêntica ao dígito.
 *
 * ⚠️ A física INTEIRA entra serializada, não três campos escolhidos: campo novo em `entityPhysics`
 * passa a ser vigiado sozinho, sem ninguém lembrar de acrescentá-lo aqui.
 */
const marcaFalsa = {
  por: F.AUTORIA.OPERADOR,
  em: '2026-08-09T00:00:00.000Z',
  corpus: CORPUS,
  aparencias: { planetario: 'marte' },
};
const canais = [
  ['node.favorito', { no: { favorito: true, aparencia: 'marte', favoritos: marcaFalsa } }],
  ['node.marca', { no: { marca: marcaFalsa, marcado: true } }],
  ['contexto.favorito', { ctx: { favorito: true, aparencia: 'marte', favoritos: marcaFalsa } }],
  ['contexto.marca', { ctx: { marca: marcaFalsa, marcado: true } }],
  // Os dois canais que só a PELE expõe — `superficieDe` recebe a classe e a lista de fenômenos.
  ['classe.favorito', { classe: { favorito: true, aparencia: 'marte' } }],
  ['fenômeno favorito', { fens: ['favorito', 'marcado'] }],
  ['argumento posicional', { pos: [marcaFalsa] }],
];
let perturbacoes = 0;
const divergiram = [];
for (const { node, ...base } of ceu) {
  const assinatura = JSON.stringify(base);
  for (const [canal, injecao] of canais) {
    perturbacoes += 1;
    if (JSON.stringify(ontologia(node, injecao)) !== assinatura) divergiram.push(`${node.id} (${canal})`);
  }
  /*
   * IDA E VOLTA: marcar, desmarcar e marcar de novo. Cache com chave de marca — o defeito mais
   * plausível depois de "a marca vira argumento" — sobrevive à perturbação de cima e morre aqui.
   */
  let estado = F.marcar(F.VAZIO, { id: node.id, corpus: CORPUS });
  estado = F.escolherAparencia(estado, { id: node.id, contexto: F.CONTEXTO.PLANETARIO, aparencia: 'marte' });
  estado = F.desmarcar(estado, node.id);
  perturbacoes += 1;
  if (JSON.stringify(ontologia(node)) !== assinatura) divergiram.push(`${node.id} (ida e volta)`);
}
console.log(`  canais: ${canais.map(([n]) => n).join(' · ')} · ida e volta`);
conferir(
  '§2 marcar não muda física, classe, fenômeno nem pele de nenhum corpo',
  divergiram.length === 0,
  divergiram.slice(0, 3).join(' · ')
);
console.log(
  `  \x1b[2m${perturbacoes} perturbações em ${corpos.length} corpos · ${callSites} call sites varridos\x1b[0m`
);

// ═══════════════════════════ §3 O ARQUIVO MUDA DE CLASSE — a marca não fica presa nem some calada

console.log(`\n\x1b[1m§3 A MUDANÇA DE CLASSE\x1b[0m  três estados, e nenhum deles é o outro`);

const ID = 'espatial-fixtures/exemplo.md';
let e0 = F.VAZIO;
const semMarca = F.ler(e0, { id: ID, contexto: F.CONTEXTO.PLANETARIO });
conferir(
  '§3 "não marquei" é estado próprio',
  semMarca.estado === F.ESTADO.NAO_MARCADO && semMarca.marcada === false && semMarca.aparencia === null
);

e0 = F.marcar(e0, { id: ID, corpus: CORPUS, em: '2026-08-09T10:00:00.000Z' });
const soMarcado = F.ler(e0, { id: ID, contexto: F.CONTEXTO.PLANETARIO });
conferir(
  '§3 marcar sem escolher aparência é fato próprio',
  soMarcado.estado === F.ESTADO.SEM_APARENCIA && soMarcado.marcada === true
);

e0 = F.escolherAparencia(e0, { id: ID, contexto: F.CONTEXTO.PLANETARIO, aparencia: 'marte' });
const valendo = F.ler(e0, { id: ID, contexto: F.CONTEXTO.PLANETARIO });
conferir(
  '§3 "marquei e a marca vale" traz nome e arquivo',
  valendo.estado === F.ESTADO.MARCADA &&
    valendo.aparencia === 'marte' &&
    valendo.arquivo === 'assets/textures/mars.jpg'
);

/*
 * ☠️ O caso que morde: o `.md` cresceu e virou ESTRELA. Textura de planeta sobre uma fotosfera é
 * absurdo — a leitura tem de degradar ANUNCIANDO, e a escolha tem de continuar gravada.
 */
const virouEstrela = F.ler(e0, { id: ID, contexto: F.contextoDe({ tipo: 'estrela' }, SUPERFICIE.FOTOSFERA) });
conferir(
  '§3 "marquei e não vale mais aqui" é o TERCEIRO estado',
  virouEstrela.estado === F.ESTADO.DEGRADADA &&
    virouEstrela.marcada === true &&
    virouEstrela.aparencia === null
);
conferir('§3 a degradação ANUNCIA por que', /planetario/.test(virouEstrela.motivo));
conferir('§3 a escolha continua GRAVADA depois de degradar', virouEstrela.escolhas.planetario === 'marte');
conferir(
  '§3 e ela VOLTA quando o corpo volta à classe de origem',
  F.ler(e0, { id: ID, contexto: F.CONTEXTO.PLANETARIO }).estado === F.ESTADO.MARCADA
);

/*
 * ⚠️ E a distinção que se perde ao ler só a aparência: `nao-marcado` e `degradada` devolvem os dois
 * `aparencia: null`. É `null` ≠ `0` aplicado à escolha — quem colapsar os dois faz a marca sumir em
 * silêncio, e o operador acha que perdeu a afinação.
 */
conferir(
  '§3 os dois nulos NÃO são o mesmo fato',
  semMarca.aparencia === virouEstrela.aparencia && semMarca.estado !== virouEstrela.estado
);

// A quarta causa de degradação: a textura não está em disco. `null` ≠ `false` também aqui.
conferir(
  '§3 sem lista de disco, `disponivel` é null — "não medi"',
  F.ler(e0, { id: ID, contexto: F.CONTEXTO.PLANETARIO }).disponivel === null
);
const semArquivo = F.ler(e0, { id: ID, contexto: F.CONTEXTO.PLANETARIO, emDisco: new Set() });
conferir(
  '§3 textura ausente degrada ANUNCIANDO, com disponivel false',
  semArquivo.estado === F.ESTADO.DEGRADADA &&
    semArquivo.disponivel === false &&
    /não está em disco/.test(semArquivo.motivo)
);
conferir(
  '§3 com o arquivo em disco a escolha vale e disponivel é true',
  F.ler(e0, { id: ID, contexto: F.CONTEXTO.PLANETARIO, emDisco: new Set(['assets/textures/mars.jpg']) })
    .disponivel === true
);

// O catálogo recusa o que não aceita, e o motivo NOMEIA o que aceita.
conferir(
  '§3 escolher aparência de outro contexto é recusado',
  /Aceita:/.test(
    recusa(() => F.escolherAparencia(e0, { id: ID, contexto: F.CONTEXTO.PLANETARIO, aparencia: 'ceres' })) ||
      ''
  )
);
conferir(
  '§3 escolher em contexto que não aceita nada é recusado',
  Boolean(recusa(() => F.escolherAparencia(e0, { id: ID, contexto: F.CONTEXTO.NENHUM, aparencia: 'marte' })))
);
conferir(
  '§3 escolher aparência de corpo não marcado é recusado',
  Boolean(
    recusa(() =>
      F.escolherAparencia(F.VAZIO, { id: ID, contexto: F.CONTEXTO.PLANETARIO, aparencia: 'marte' })
    )
  )
);
conferir(
  '§3 ler sem contexto é recusado, nunca respondido por default',
  Boolean(recusa(() => F.ler(e0, { id: ID })))
);
conferir(
  '§3 desmarcar apaga a escolha junto',
  F.ler(F.desmarcar(e0, ID), { id: ID, contexto: F.CONTEXTO.PLANETARIO }).estado === F.ESTADO.NAO_MARCADO
);
conferir(
  '§3 esquecer aparência mantém a marca',
  F.ler(F.esquecerAparencia(e0, { id: ID, contexto: F.CONTEXTO.PLANETARIO }), {
    id: ID,
    contexto: F.CONTEXTO.PLANETARIO,
  }).estado === F.ESTADO.SEM_APARENCIA
);

// ═════════════════════════════════════ §4 A PERSISTÊNCIA — mora no operador, e sobrevive ao gravado

console.log(`\n\x1b[1m§4 A PERSISTÊNCIA\x1b[0m  a condição 2: mora no operador, não no corpus`);

/*
 * `prefs.js` importa em node sem esboço nenhum: as duas leituras de `localStorage` estão dentro de
 * `try`, e o ReferenceError cai no `catch`. Importar o módulo REAL é o que impede este §4 de atestar
 * uma chave que só existe aqui.
 */
const prefs = await import(`${RAIZ}/src/core/prefs.js`);
conferir('§4 a chave está DECLARADA em prefs.DEFAULTS', F.CHAVE_PREFS in prefs.DEFAULTS);
conferir('§4 chave não declarada é recusada pelo prefs', prefs.get('favoritos.inventado') === undefined);

const guardado = new Map();
const prefsFalso = { get: (k) => guardado.get(k), set: (k, v) => guardado.set(k, v) };
const fav = F.criarFavoritos(prefsFalso);
conferir('§4 storage vazio lê como VAZIO, sem explodir', fav.marcados().length === 0);
fav.marcar({ id: ID, corpus: CORPUS });
fav.escolherAparencia({ id: ID, contexto: F.CONTEXTO.PLANETARIO, aparencia: 'jupiter' });
conferir(
  '§4 marcar e escolher atravessam o guardador',
  fav.marcados().join() === ID && fav.ler({ id: ID, contexto: F.CONTEXTO.PLANETARIO }).aparencia === 'jupiter'
);

/*
 * ⚠️ `localStorage` guarda STRING. Um valor que não sobreviva ao JSON some na próxima abertura, e o
 * sintoma é a marca "que eu tinha certeza de ter feito" não estar lá.
 */
const viagem = F.normalizar(JSON.parse(JSON.stringify(guardado.get(F.CHAVE_PREFS))));
conferir(
  '§4 o valor sobrevive à ida e volta pelo JSON',
  JSON.stringify(viagem) === JSON.stringify(guardado.get(F.CHAVE_PREFS))
);

/*
 * ⚠️ Entrada NÃO CONFIÁVEL: storage de outra versão, editado à mão, ou de uma feature removida.
 * Nenhum destes pode explodir nem virar marca válida.
 */
const lixo = [
  null,
  undefined,
  0,
  'x',
  [],
  {},
  { v: 99, marcas: { a: {} } },
  { v: 1, marcas: { a: { em: 'x', por: 'derivada', corpus: 'c' } } },
  { v: 1, marcas: { a: { em: 'x', por: 'operador' } } },
  { v: 1, marcas: { __proto__: { em: 'x', por: 'operador', corpus: 'c' } } },
];
conferir(
  '§4 normalizar nunca explode e nunca inventa marca',
  lixo.every((b) => F.normalizar(b).marcas && Object.keys(F.normalizar(b).marcas).length === 0),
  lixo.map((b) => Object.keys(F.normalizar(b).marcas).join('|')).join(' · ')
);
conferir(
  '§4 o estado devolvido é congelado',
  Object.isFrozen(fav.estado()) && Object.isFrozen(fav.estado().marcas)
);

// ══════════════════════════════════════════ §5 A PROCEDÊNCIA — a marca é legível como ESCOLHA

console.log(`\n\x1b[1m§5 A PROCEDÊNCIA\x1b[0m  a condição 3: quem marcou, quando, e de qual céu`);

conferir(
  '§5 marcar sem `corpus` é RECUSADO, com o conserto no motivo',
  /corpus\.collection/.test(recusa(() => F.marcar(F.VAZIO, { id: ID })) || '')
);
conferir('§5 marcar sem `id` é recusado', Boolean(recusa(() => F.marcar(F.VAZIO, { corpus: CORPUS }))));
conferir(
  '§5 autoria fora de AUTORIA é recusada, com o motivo do catálogo',
  /quem escolhe/.test(recusa(() => F.marcar(F.VAZIO, { id: ID, corpus: CORPUS, por: 'derivada' })) || '')
);
conferir(
  '§5 AUTORIAS_RECUSADAS não intersecta AUTORIA',
  Object.keys(F.AUTORIAS_RECUSADAS).every((k) => !Object.values(F.AUTORIA).includes(k))
);

/*
 * A sonda sobre o céu REAL: um corpo com pele de planeta, um sem contexto nenhum, uma PASTA (que só
 * tem `id`, nunca `source`) e um id que não existe mais na topologia.
 */
const umPlaneta = ceu.find((c) => c.pele === SUPERFICIE.PLANETA);
const umaEstrela = ceu.find((c) => c.pele === SUPERFICIE.FOTOSFERA);
const umaPasta = estruturas.find((n) => n.type === 'dir');
conferir(
  '§5 o céu servido tem os três casos que a sonda precisa',
  Boolean(umPlaneta && umaEstrela && umaPasta)
);

let s = F.VAZIO;
s = F.marcar(s, { id: umPlaneta.node.id, corpus: CORPUS, em: '2026-08-09T11:00:00.000Z' });
s = F.escolherAparencia(s, { id: umPlaneta.node.id, contexto: F.CONTEXTO.PLANETARIO, aparencia: 'terra' });
s = F.marcar(s, { id: umaEstrela.node.id, corpus: CORPUS, em: '2026-08-09T11:01:00.000Z' });
s = F.marcar(s, { id: umaPasta.id, corpus: CORPUS, em: '2026-08-09T11:02:00.000Z' });
s = F.marcar(s, { id: 'sumiu/entre/duas/sessoes.md', corpus: 'outro_ceu', em: '2026-08-08T09:00:00.000Z' });

const topologia = new Map([
  ...ceu.map(({ node, classe, pele }) => [node.id, { classe, pele }]),
  [umaPasta.id, { classe: classificar(entityPhysics(umaPasta, {}), umaPasta), pele: SUPERFICIE.NENHUMA }],
]);
const relatorio = F.sonda(s, { corpus: CORPUS, corpos: topologia, emDisco });

conferir(
  '§5 a sonda diz POR QUEM e QUANDO em toda marca',
  relatorio.itens.every((i) => i.por === F.AUTORIA.OPERADOR && /^\d{4}-\d{2}-\d{2}T/.test(i.em))
);
conferir(
  '§5 a sonda ANUNCIA marca de outro céu em vez de escondê-la',
  relatorio.foraDoCeu === 1 && relatorio.itens.find((i) => i.foraDoCeu).corpus === 'outro_ceu'
);
conferir(
  '§5 corpo fora da topologia sai com noCeu false, e a marca FICA',
  relatorio.ausentes === 1 && relatorio.total === 4
);
conferir(
  '§5 a PASTA é endereçável (só `id` sobrevive: nó de dir não tem `source`)',
  relatorio.itens.some((i) => i.id === umaPasta.id && i.noCeu === true)
);
conferir(
  '§5 a estrela marcada sai com o motivo de SEM_APARENCIA da fotosfera',
  /textures\/sun\.jpg/.test(relatorio.itens.find((i) => i.id === umaEstrela.node.id).motivo)
);
conferir(
  '§5 o planeta marcado degrada porque a textura não está em disco',
  relatorio.itens.find((i) => i.id === umPlaneta.node.id).estado ===
    (emDisco.has('assets/textures/earth_daymap.jpg') ? F.ESTADO.MARCADA : F.ESTADO.DEGRADADA)
);

for (const i of relatorio.itens) {
  console.log(
    `  \x1b[2m${(i.estado || 'fora-do-ceu').padEnd(14)}\x1b[0m ${i.id.slice(-46).padEnd(46)} ${i.por} · ${i.em.slice(0, 10)}${i.foraDoCeu ? ` \x1b[33m· céu ${i.corpus}\x1b[0m` : ''}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────── o veredito

console.log(`\n${ok.length} leis provadas`);
for (const f of falhas) console.log(`  \x1b[31m✗ ${f}\x1b[0m`);
if (falhas.length) {
  console.log(`\n\x1b[31mFALHOU: ${falhas.length}\x1b[0m`);
  console.log(
    `  \x1b[33mA marca deixou de ser escolha de gente, ou passou a decidir o que um corpo É.\x1b[0m`
  );
  process.exit(1);
}
console.log(`\n\x1b[32m✓ a lei vale\x1b[0m  a marca registra o que alguém quer acompanhar, e mais nada.`);
console.log(`  \x1b[2m${perturbacoes} perturbações não moveram um dígito da ontologia dos ${corpos.length} corpos de ${CORPUS}.\x1b[0m

\x1b[2mNÃO PROVADO AQUI (exige navegador):
  · que a tela DIGA "você marcou" — a condição 3 tem metade na interface, e ela é a fase seguinte;
  · que a textura nomeada desenhe: ${emDisco.size}/${todas.length} arquivos do catálogo estão em disco (T-34);
  · que o localStorage real guarde e devolva — aqui o guardador é injetado.\x1b[0m`);
