#!/usr/bin/env node
/**
 * A LEI DA INTERFACE DO FAVORITO — a TELA diz que é escolha, e diz qual dos quatro estados é.
 *
 *     node scripts/lei-favoritos-ui.mjs        # sai 0 quando as onze leis valem
 *
 * A fase 1 provou o MODELO (`scripts/lei-favoritos.mjs`, 51 leis): a marca não entra em
 * `classificar()` e mora no operador. Ficou de fora a terceira condição, porque ela não é do modelo:
 *
 * > ☠️ **um corpo com cara de Júpiter sem dizer *"você marcou"* é a única forma de isto virar
 * > mentira.** O resto da HUD publica procedência de tudo; a marca não pode ser a exceção.
 *
 * As onze leis, e o que cada uma impede:
 *
 * | § | a lei | o que ela impede |
 * |---|---|---|
 * | 1 | a derivação do contexto é TRANSCRIÇÃO fiel de `universe.load()` | a HUD oferecer TERRA a uma fotosfera |
 * | 2 | todo corpo servido recebe contexto, e nenhum é ASSUMIDO | `dominante: false` de consolo virando planeta |
 * | 3 | os quatro estados desenham DIFERENTE | os dois nulos do modelo colapsarem no pixel |
 * | 4 | todo estado marcado escreve `por`, `em` e `corpus` | a marca passar por medida |
 * | 5 | `degradada` é ANÚNCIO, com o motivo do modelo, nas TRÊS causas | a afinação evaporar calada |
 * | 6 | `disponivel: null` não vira erro nem sumiço | "não medi" virar "medi e falta" |
 * | 7 | a tecla é única e a colisão falha no REGISTRO | atalho que existe e nunca dispara |
 * | 8 | a marca não muda a ontologia de ninguém | a condição 1, agora com a HUD no caminho |
 * | 9 | toda proibição do catálogo tem LEITOR no pixel | tabela de motivos que ninguém consulta |
 * | 10 | marca sem carimbo de corpus é RECUSADA, com o conserto no motivo | marca que não sabe de que céu veio |
 * | 11 | a marca REPINTA quem a desenha, e SOLTA quando ele some | o painel oferecendo MARCAR depois de marcar · ouvinte de widget destruído |
 *
 * ## Por que a RAIZ sai de `import.meta.url` e só dela
 *
 * ☠️ Raiz por argumento, variável de ambiente ou caminho de máquina faz o oráculo importar a árvore
 * que lhe apontarem — e aí ele passa sobre uma CÓPIA MUTADA, atestando guarda que a cópia não tem.
 * Derivada do próprio arquivo, copiar `src/` e `scripts/` para outro lugar, quebrar uma linha e
 * rodar o oráculo de lá tem de ficar VERMELHO. É o que torna a prova de reprovação possível.
 *
 * ## O que ele NÃO prova
 *
 * - **Legibilidade.** Que o âmbar de `--busy` se leia como anúncio sobre o disco de acreção só a
 *   FOTO julga. Aqui se prova que os quatro estados produzem textos distintos, não que eles se
 *   distinguem a olho.
 * - **Que a textura desenhe.** Nenhuma das 9 está em disco (T-34), e nada no renderer consome a
 *   escolha ainda. O §6 mede exatamente isso em vez de supor.
 * - **O gesto chegando ao canvas.** A tecla é provada no REGISTRO (colisão), não no dedo.
 */
import fs from 'node:fs';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SPATIA = process.env.SPATIA_HTTP || 'http://127.0.0.1:8787';
const src = (p) => fs.readFileSync(`${RAIZ}/${p}`, 'utf8');

const falhas = [];
const ok = [];
const conferir = (nome, condicao, detalhe = '') => {
  if (condicao) ok.push(nome);
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};

// ───────────────────────────────────────────────────────── o DOM de mentira

/*
 * O mínimo que `hud/dom.js` e `hud/button.js` tocam. Não é um DOM: é a superfície exata que os dois
 * primitivos usam, e é isso que o mantém honesto — um `jsdom` esconderia um `document` que a HUD não
 * tem, e uma reimplementação generosa passaria a atestar API que ninguém chama.
 *
 * ⚠️ `import` é IÇADO: o esboço tem de existir ANTES do módulo, e por isso todo `import` daqui para
 * baixo é dinâmico. Sem isso o módulo carrega com `document` indefinido e o script morre longe da
 * causa.
 */
function criarElemento(tag) {
  return {
    tagName: String(tag).toUpperCase(),
    className: '',
    dataset: {},
    style: { setProperty() {} },
    children: [],
    ouvintes: {},
    proprio: '',
    set textContent(v) {
      this.proprio = String(v ?? '');
      this.children.length = 0;
    },
    get textContent() {
      return this.children.length ? this.children.map((c) => c.textContent).join(' ') : this.proprio;
    },
    append(...ns) {
      for (const n of ns) if (n) this.children.push(n);
    },
    appendChild(n) {
      this.children.push(n);
      return n;
    },
    setAttribute(k, v) {
      this[k] = v;
    },
    addEventListener(tipo, fn) {
      (this.ouvintes[tipo] ||= []).push(fn);
    },
    clicar() {
      for (const fn of this.ouvintes.click || []) fn();
    },
  };
}
globalThis.document = { createElement: criarElemento };

/** Todo o texto de um desenho, na ordem — é o que a lei compara. */
const texto = (linhas) => linhas.map((n) => n.textContent).join(' | ');
/** Os nós de uma classe, em profundidade. */
function porClasse(linhas, classe, achados = []) {
  for (const n of linhas) {
    if (n.className === classe) achados.push(n);
    porClasse(n.children || [], classe, achados);
  }
  return achados;
}
const acoes = (linhas) => porClasse(linhas, 'fs-name').map((n) => n.textContent);

const UI = await import(`${RAIZ}/src/hud/favoritos-ui.js`);
const F = await import(`${RAIZ}/src/space/favoritos.js`);
const KEYS = await import(`${RAIZ}/src/core/keys.js`);

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
      '  Sem saber de que céu vieram, os corpos abaixo não sustentam afirmação nenhuma.'
  );
  process.exit(1);
}
const CORPUS = graph.corpus.collection;

// O `prefs` de mentira: a mesma injeção que `criarFavoritos` já exige, sem tocar em `localStorage`.
const guardados = new Map();
const avisos = [];
const prefsFake = {
  get: (k) => guardados.get(k) ?? null,
  set: (k, v) => {
    guardados.set(k, v);
    for (const fn of avisos) fn(k, v);
  },
  subscribe: (fn) => {
    avisos.push(fn);
    return () => {};
  },
};
UI.instalarFavoritos(prefsFake);
const cobertura = UI.carregarTopologia(graph);

/** Um corpo de cada contexto/caso, escolhido do corpus servido — nada sintetizado. */
const porId = new Map(graph.nodes.map((n) => [n.id, n]));
const espécimes = { planetario: [], rochoso: [], estrutura: [], fotosfera: [], cometa: [], pulsar: [] };
for (const n of graph.nodes) {
  const l = UI.leitura(n);
  if (l.impedimento) continue;
  if (l.contexto === F.CONTEXTO.PLANETARIO) espécimes.planetario.push(n);
  else if (l.contexto === F.CONTEXTO.ROCHOSO) espécimes.rochoso.push(n);
  else if (l.caso) (espécimes[l.caso.caso] ||= []).push(n);
}
const um = (nome) => espécimes[nome]?.[0] ?? null;

const limpar = () => guardados.set(F.CHAVE_PREFS, null);
/** Escreve um estado CRU no storage — é como se chega aos casos que um gesto sozinho não produz. */
const gravar = (marcas) => guardados.set(F.CHAVE_PREFS, { v: F.VERSAO, marcas });
const marcaCrua = (aparencias) => ({
  em: '2026-08-09T12:00:00.000Z',
  por: F.AUTORIA.OPERADOR,
  corpus: CORPUS,
  aparencias,
});

// ───────────────────────────────────────────────────── §1 · a derivação tem UM dono, e a HUD LÊ

/*
 * ☠️ **ISTO JÁ FOI UM PORTÃO DE CÓPIA, e a cópia é que era o defeito.**
 *
 * A HUD não alcançava a dominância (ela era publicada dentro da cena UNIVERSO) e o rótulo
 * `universe.tipoDe` é texto de TELA — lê-lo como dado é o que já derrubou 22 fotosferas para 21.
 * A saída da época foi TRANSCREVER o agrupamento e guardar a transcrição com um portão que conferia
 * linha a linha contra o texto da fonte. Funcionava, e custava: sete pares de strings para manter
 * em dia, e a fonte morando dentro de uma das duas cenas — de onde a cena AGENTE não podia lê-la.
 *
 * ⭑ Hoje o dono é `src/space/sistemas.js`, puro e sem cena, e as três derivações viraram uma. O que
 * esta seção guarda mudou de natureza: não é mais *"a cópia continua igual"*, é **"não voltou a
 * existir cópia"**. As duas perguntas que a substituem são de PROPRIEDADE, não de texto.
 */
const uiSrc = src('src/hud/favoritos-ui.js');

/**
 * O fonte sem comentário nem string — quem varre por NOME precisa disto.
 *
 * ⚠️ A versão anterior desta seção procurava `favoritos-ui` no texto cru de `src/space/*.js`, e a
 * primeira linha de prosa que citasse o arquivo derrubava a lei. Varrer a STRING em vez do
 * COMPORTAMENTO é armadilha conhecida desta base — a galáxia era billboard no vértice sem ter um
 * `quaternion.copy` para achar.
 */
function semProsa(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/'[^'\n]*'|"[^"\n]*"/g, "''");
}

/*
 * A REGRA DO DONO ÚNICO, e ela é varrida no comportamento: `dominanteDe` é a eleição que decide se
 * um corpo é ESTRELA ou tem teto em planeta. Um segundo chamador dela é uma segunda regra livre
 * para divergir no EMPATE — que é exatamente como quatro cópias desta base derivaram antes.
 */
const CHAMADORES = fs
  .readdirSync(`${RAIZ}/src/space`)
  .filter((f) => f.endsWith('.js'))
  // ⚠️ `function dominanteDe(` é a DECLARAÇÃO, não um chamado — `entity-physics.js` é a casa dela.
  .filter((f) => /(?<!function\s{1,4})\bdominanteDe\s*\(/.test(semProsa(src(`src/space/${f}`))));
conferir(
  '§1 só `sistemas.js` elege o dominante',
  CHAMADORES.length === 1 && CHAMADORES[0] === 'sistemas.js',
  `chamam \`dominanteDe()\`: ${CHAMADORES.join(', ') || 'ninguém'} — a eleição voltou a ter duas fontes`
);

/*
 * A HUD LÊ, e não deriva. Cada uma destas chamadas de volta ao `favoritos-ui.js` reabre a cópia —
 * e a cópia envelhece calada, porque nada na tela acusa uma classe derivada com contexto errado.
 */
for (const derivacao of [
  'entityPhysics',
  'classificar',
  'fenomenos',
  'superficieDe',
  'resolveBody',
  'dominanteDe',
]) {
  conferir(
    `§1 a HUD não deriva — \`${derivacao}()\``,
    !new RegExp(`\\b${derivacao}\\s*\\(`).test(semProsa(uiSrc)),
    `src/hud/favoritos-ui.js voltou a derivar a ontologia por conta própria`
  );
}
conferir(
  '§1 a HUD lê o índice dos sistemas',
  /identidadeDe\s*\(/.test(semProsa(uiSrc)),
  'a HUD parou de ler `sistemas.identidadeDe` — de onde ela tira a classe agora?'
);

/*
 * ☠️ **A PELE NÃO DEPENDE MAIS DA CENA, e isto é o que T-39 comprou.**
 *
 * Enquanto as duas cenas discordavam sobre 32 dos 72 corpos (44%, medido em 09/08), a marca tinha
 * de seguir a cena na tela: a aparência nomeada substitui o albedo do PLANETA, e num corpo
 * desenhado como ESTAÇÃO ela não tem onde ser aplicada. Convergidas as cenas, ler a cena aqui
 * voltaria a fabricar a diferença que deixou de existir.
 */
conferir(
  '§1 a pele oferecida não consulta a cena',
  !/telaEstado|\bcena\s*===/.test(semProsa(uiSrc)),
  'a UI voltou a escolher a pele pela cena corrente — as duas cenas desenham a mesma, e ler a cena aqui inventa divergência'
);

conferir(
  '§1 a seta é de mão única — nada em space/ importa a interface',
  !fs
    .readdirSync(`${RAIZ}/src/space`)
    .some(
      (f) => f.endsWith('.js') && /^\s*import[\s\S]*?from\s*['"][^'"]*hud\//m.test(src(`src/space/${f}`))
    ),
  'um módulo de space/ passou a importar a HUD: a marca voltaria a poder decidir o que um corpo é'
);

// ───────────────────────────────────────────────────────── §2 · cobertura, sem contexto assumido

conferir(
  '§2 a topologia inteira recebeu contexto',
  cobertura.semContexto === 0,
  `${cobertura.semContexto} de ${cobertura.nos} nós sem contexto`
);
conferir('§2 o corpus carimbado é o do servidor', cobertura.corpus === CORPUS, String(cobertura.corpus));
conferir('§2 há corpo em contexto planetário', espécimes.planetario.length > 0);
conferir(
  '§2 há corpo SEM contexto de aparência',
  espécimes.fotosfera.length + espécimes.estrutura.length > 0
);
/*
 * ⚠️ Nó fora da tabela não recebe contexto de consolo. Um `dominante: false` assumido daria contexto
 * PLANETARIO a uma estrela, e a tela ofereceria TERRA para uma fotosfera — com toda a cara de medida.
 */
const forasteiro = UI.leitura({ id: 'nao-existe-em-ceu-nenhum', type: 'file' });
conferir(
  '§2 corpo fora da topologia é IMPEDIMENTO, não `nao-marcado`',
  Boolean(forasteiro.impedimento) && forasteiro.estado === undefined,
  JSON.stringify(forasteiro)
);
conferir('§2 corpo sem `id` estável é IMPEDIMENTO', Boolean(UI.leitura({ type: 'moon' }).impedimento));

// ───────────────────────────────────────────────────────── §3 · os quatro estados no pixel

const alvo = um('planetario');
const semContextoNode = um('fotosfera') || um('estrutura');

limpar();
const desenhos = {};
desenhos[F.ESTADO.NAO_MARCADO] = UI.desenharFavorito(alvo);

gravar({ [alvo.id]: marcaCrua({}) });
desenhos[F.ESTADO.SEM_APARENCIA] = UI.desenharFavorito(alvo);

gravar({ [alvo.id]: marcaCrua({ planetario: 'terra' }) });
desenhos[F.ESTADO.MARCADA] = UI.desenharFavorito(alvo);

gravar({ [alvo.id]: marcaCrua({ rochoso: 'ceres' }) });
desenhos[F.ESTADO.DEGRADADA] = UI.desenharFavorito(alvo);

for (const [estado, linhas] of Object.entries(desenhos)) {
  limpar();
  conferir(`§3 ${estado} desenha alguma coisa`, linhas.length > 1, `${linhas.length} linha(s)`);
}
const textos = Object.fromEntries(Object.entries(desenhos).map(([e, l]) => [e, texto(l)]));
const distintos = new Set(Object.values(textos));
conferir(
  '§3 os QUATRO estados produzem textos distintos',
  distintos.size === 4,
  `${distintos.size} texto(s) distinto(s) em 4 estados — dois estados colapsaram no pixel`
);
conferir(
  '§3 `nao-marcado` oferece MARCAR e mais nada',
  acoes(desenhos[F.ESTADO.NAO_MARCADO]).join(',') === 'MARCAR'
);
conferir(
  '§3 `nao-marcado` não afirma procedência nenhuma',
  !textos[F.ESTADO.NAO_MARCADO].includes('VOCÊ MARCOU') &&
    !textos[F.ESTADO.NAO_MARCADO].includes(F.AUTORIA.OPERADOR)
);
conferir(
  '§3 `marcada` nomeia a aparência escolhida',
  textos[F.ESTADO.MARCADA].includes('TERRA') && textos[F.ESTADO.MARCADA].includes('APARÊNCIA')
);
conferir(
  '§3 `sem-aparencia` NÃO nomeia aparência nenhuma',
  !textos[F.ESTADO.SEM_APARENCIA].includes('APARÊNCIA')
);
conferir(
  '§3 os três estados marcados oferecem DESMARCAR',
  [F.ESTADO.SEM_APARENCIA, F.ESTADO.MARCADA, F.ESTADO.DEGRADADA].every((e) =>
    acoes(desenhos[e]).includes('DESMARCAR')
  )
);
/*
 * O estado viaja no `data-estado` da faixa, e é ele que o CSS lê para dar glifo e tinta próprios ao
 * anúncio. Sem isso `degradada` e `marcada` sairiam com a mesma cara, que é o §5 pelo lado do pixel.
 */
for (const e of [F.ESTADO.SEM_APARENCIA, F.ESTADO.MARCADA, F.ESTADO.DEGRADADA]) {
  const faixas = porClasse(desenhos[e], 'marca');
  conferir(
    `§3 ${e} carimba o estado na faixa`,
    faixas.length === 1 && faixas[0].dataset.estado === e,
    faixas.map((f) => f.dataset.estado).join(',')
  );
}

// ───────────────────────────────────────────────────────── §4 · a tela diz "VOCÊ MARCOU"

for (const e of [F.ESTADO.SEM_APARENCIA, F.ESTADO.MARCADA, F.ESTADO.DEGRADADA]) {
  const t = textos[e];
  conferir(`§4 ${e} diz VOCÊ MARCOU`, t.includes('VOCÊ MARCOU'));
  conferir(`§4 ${e} escreve QUEM marcou`, t.includes(F.AUTORIA.OPERADOR));
  conferir(`§4 ${e} escreve QUANDO`, t.includes('2026-08-09'));
  conferir(`§4 ${e} escreve DE QUE CÉU`, t.includes(CORPUS));
  /*
   * O fecho é o que separa esta seção das outras do painel. As linhas de cima (massa, commit,
   * alcance) saem de disco, de git e do snapshot; esta saiu de um gesto — apresentá-la com a mesma
   * voz ensina o operador a confiar na coisa errada, que é o mesmo argumento dos ASSUNTOS.
   */
  conferir(`§4 ${e} declara que NÃO é medida`, t.includes('não é medida'));
}

// ───────────────────────────────────────────────────────── §5 · degradada é ANÚNCIO, nas três causas

const arquivoDaTerra = F.APARENCIAS[F.CONTEXTO.PLANETARIO].terra.arquivo;
const CAUSAS = [
  ['contexto mudou', { rochoso: 'ceres' }, null, 'este corpo está em planetario agora'],
  ['nome fora do catálogo', { planetario: 'plutao' }, null, 'saiu do catálogo'],
  ['arquivo não está em disco', { planetario: 'terra' }, new Set(), 'não está em disco'],
];
const motivosVistos = [];
for (const [causa, aparencias, disco, marcador] of CAUSAS) {
  gravar({ [alvo.id]: marcaCrua(aparencias) });
  UI.declararEmDisco(disco);
  const l = UI.leitura(alvo);
  const linhas = UI.desenharFavorito(alvo);
  const t = texto(linhas);
  conferir(`§5 ${causa} · o modelo degrada`, l.estado === F.ESTADO.DEGRADADA, String(l.estado));
  conferir(`§5 ${causa} · a tela ANUNCIA`, t.includes('MARCA DEGRADADA'));
  /*
   * ⚠️ O motivo sai do MODELO, na íntegra. Parafrasear na HUD criaria uma segunda redação livre para
   * divergir — e é o motivo que nomeia QUAL das três causas foi, que é a diferença entre "a marca
   * sumiu" e "a marca não vale mais AQUI, por isto".
   */
  conferir(`§5 ${causa} · o motivo do modelo, na íntegra`, t.includes(l.motivo), l.motivo);
  conferir(`§5 ${causa} · o motivo nomeia a causa`, l.motivo.includes(marcador), l.motivo);
  conferir(`§5 ${causa} · degradada não é ausência`, t.includes('VOCÊ MARCOU'));
  motivosVistos.push(l.motivo);
  UI.declararEmDisco(null);
}
conferir(
  '§5 as TRÊS causas têm motivos distintos',
  new Set(motivosVistos).size === 3,
  `${new Set(motivosVistos).size} motivo(s) para 3 causas`
);
conferir(
  '§5 a causa "em disco" só existe com o disco DECLARADO',
  (() => {
    gravar({ [alvo.id]: marcaCrua({ planetario: 'terra' }) });
    UI.declararEmDisco(null);
    return UI.leitura(alvo).estado === F.ESTADO.MARCADA;
  })(),
  'com `emDisco` nulo a escolha válida não pode degradar — isso seria "não medi" virando "falta"'
);

// ───────────────────────────────────────────────────────── §6 · `disponivel: null` sobrevive

/*
 * ☠️ **`disponivel` tem TRÊS valores e a tela não pode colapsá-los.** `null` é *"ninguém me disse
 * o que existe"*, `false` é *"medi e FALTA"*, `true` é *"medi e TEM"* — e o do meio é o que some
 * primeiro, porque escrevê-lo como presença parece inofensivo e afirma o oposto do fato.
 * ⚠️ Nada aqui depende de QUANTAS texturas existem em disco hoje: isso é medida, e vive no censo.
 */
gravar({ [alvo.id]: marcaCrua({ planetario: 'terra' }) });
UI.declararEmDisco(null);
const lNull = UI.leitura(alvo);
const tNull = texto(UI.desenharFavorito(alvo));
conferir('§6 `disponivel` é null quando ninguém mediu', lNull.disponivel === null, String(lNull.disponivel));
conferir('§6 o estado continua MARCADA', lNull.estado === F.ESTADO.MARCADA, String(lNull.estado));
conferir('§6 a tela nomeia o arquivo', tNull.includes(arquivoDaTerra));
conferir('§6 a tela diz que o disco NÃO foi verificado', tNull.includes('disco não verificado'));
conferir('§6 a tela não AFIRMA que a textura está em disco', !tNull.includes('— em disco'));
conferir(
  '§6 a sonda publica `emDisco: null`, nunca 0',
  UI.sonda().emDisco === null,
  String(UI.sonda().emDisco)
);
/*
 * ☠️ **Aqui havia uma lei que gravava um FATO DE MUNDO:** *"nenhuma das 9 aparências está em
 * disco"*. Ela era verdade no dia em que foi escrita e **expirou na primeira vez que a tarefa irmã
 * entregou** — as nove entraram em disco e o oráculo passou a sair 1 sem uma linha de código ter
 * mudado. Lei tem de valer sobre o FUTURO; estado do mundo é medida, e medida vive no censo.
 *
 * O que a lei precisa provar é o COMPORTAMENTO, e ele é o mesmo com zero ou com nove em disco: a
 * tela distingue os TRÊS valores de `disponivel` e nunca afirma o que não mediu.
 */
conferir(
  '§6 `false` NÃO é desenhado como presença',
  (() => {
    UI.declararEmDisco(new Set());
    const t = texto(UI.desenharFavorito(alvo));
    UI.declararEmDisco(null);
    return !t.includes('— em disco');
  })(),
  '`disponivel: false` é "medi e FALTA" — escrevê-lo como presença é o colapso que o §6 existe para pegar'
);

// ───────────────────────────────────────────────────────── §7 · a tecla falha no REGISTRO

/*
 * ⚠️ **Colisão de tecla falha no REGISTRO, não na navegação.** `keys.bind` recusa combinação já
 * tomada; o que a prova exige é que TODOS os specs do `src/` passem pelo mesmo `reivindicar`, na
 * ordem em que o boot os registra. Um `keydown` cru fora do catálogo é o caso que a `reserve()`
 * existe para cobrir, e ele entra aqui pela mesma varredura.
 */
function specsDeclarados() {
  const achados = [];
  const dirs = ['src', 'src/hud', 'src/core', 'src/kernel', 'src/apps', 'src/space'];
  for (const dir of dirs) {
    for (const arq of fs.readdirSync(`${RAIZ}/${dir}`).filter((f) => f.endsWith('.js'))) {
      /*
       * ⚠️ Os COMENTÁRIOS saem antes da varredura. O cabeçalho de `hud/cena.js` cita
       * `bind({ code: 'KeyU' })` para explicar por que a tecla é reservada — e a varredura crua o
       * registrava como atalho de verdade, colidindo com a reserva três linhas abaixo. Um oráculo
       * que reprova por causa de uma frase é um oráculo que ensina a ignorá-lo.
       */
      const corpo = src(`${dir}/${arq}`)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');
      // Constantes locais de tecla (`const TOGGLE_KEY = 'KeyV'`) entram substituídas: o spec as
      // referencia por nome, e um literal escrito aqui seria uma segunda fonte da verdade.
      const constantes = [...corpo.matchAll(/const\s+([A-Z_]+)\s*=\s*'([^']+)'/g)];
      for (const m of corpo.matchAll(/\b(?:keys\.)?(bind|reserve)\(\{([^}]*)\}/g)) {
        let literal = m[2];
        for (const [, nome, valor] of constantes) {
          literal = literal.replace(new RegExp(`\\b${nome}\\b`, 'g'), `'${valor}'`);
        }
        try {
          // eslint-disable-next-line no-new-func
          achados.push({ onde: `${dir}/${arq}`, spec: new Function(`return ({${literal}})`)() });
        } catch (erro) {
          falhas.push(`§7 spec ilegível em ${dir}/${arq}: {${literal}} — ${erro.message}`);
        }
      }
    }
  }
  return achados;
}
const declarados = specsDeclarados();
conferir('§7 a varredura achou os atalhos', declarados.length >= 10, `${declarados.length} spec(s)`);
let colisao = null;
for (const { onde, spec } of declarados) {
  try {
    KEYS.bind(spec, () => {});
  } catch (erro) {
    colisao = `${onde}: ${erro.message}`;
    break;
  }
}
conferir('§7 nenhum atalho colide com outro', colisao === null, colisao || '');
const comF = declarados.filter(({ spec }) => spec.code === 'KeyF');
conferir('§7 `F` é declarado UMA vez', comF.length === 1, `${comF.length} declaração(ões)`);
conferir('§7 `F` está no catálogo com rótulo', comF[0]?.spec?.label === 'FAVORITAR', comF[0]?.spec?.label);
conferir('§7 `F` não vale com foco em texto', !comF[0]?.spec?.whileTyping);
/*
 * A prova de que a recusa é REAL, e não uma varredura otimista: uma segunda declaração da mesma
 * tecla tem de derrubar o registro, com o nome do dono dentro do erro.
 */
let recusou = '';
try {
  KEYS.bind({ code: 'KeyF', label: 'INTRUSO' }, () => {});
} catch (e) {
  recusou = e.message;
}
conferir(
  '§7 a segunda `F` é RECUSADA, nomeando o dono',
  recusou.includes('FAVORITAR'),
  recusou || 'a segunda declaração passou'
);

// ───────────────────────────────────────────────────────── §8 · a marca não muda a ontologia

/*
 * A condição 1 outra vez, agora com a HUD no caminho: a fase 1 provou que `classificar()` não lê a
 * marca; aqui se prova que a TABELA da HUD é a mesma com o storage vazio e com o céu inteiro
 * marcado. Se a marca vazasse para a derivação, algum corpo trocaria de contexto.
 */
limpar();
const antes = graph.nodes.map((n) => `${n.id}=${UI.leitura(n).contexto ?? '?'}`).join(';');
gravar(Object.fromEntries(graph.nodes.map((n) => [n.id, marcaCrua({ planetario: 'terra' })])));
UI.carregarTopologia(graph);
const depois = graph.nodes.map((n) => `${n.id}=${UI.leitura(n).contexto ?? '?'}`).join(';');
conferir('§8 o céu inteiro marcado não move um contexto sequer', antes === depois);
const sonda = UI.sonda();
conferir('§8 a sonda conta o que foi marcado', sonda.total === graph.nodes.length, `${sonda.total}`);
conferir('§8 a sonda não inventa corpo fora do céu', sonda.ausentes === 0, String(sonda.ausentes));
conferir('§8 a sonda não acusa marca de outro céu', sonda.foraDoCeu === 0, String(sonda.foraDoCeu));
limpar();

// ───────────────────────────────────────────────────────── §9 · a proibição tem LEITOR

/*
 * ⚠️ **Declarar a proibição não a implementa.** `SEM_APARENCIA` nomeia por que cada corpo não recebe
 * aparência; sem alguém a consultar, a tela diria "sem aparência" sem dizer por quê — que é a
 * diferença entre marca legível e marca calada. O leitor é o pixel, e aqui ele é conferido caso a
 * caso, só nos casos com POPULAÇÃO no corpus servido.
 */
let comPopulacao = 0;
for (const caso of Object.keys(F.SEM_APARENCIA)) {
  const node = um(caso);
  if (!node) continue;
  comPopulacao += 1;
  gravar({ [node.id]: marcaCrua({}) });
  const t = texto(UI.desenharFavorito(node));
  // Um trecho do motivo do modelo, não uma paráfrase: as duas redações divergiriam em silêncio.
  const trecho = F.SEM_APARENCIA[caso].slice(0, 48);
  conferir(`§9 ${caso} · a tela diz POR QUE não há aparência`, t.includes(trecho), trecho);
  conferir(`§9 ${caso} · e não oferece aparência nenhuma`, !t.includes('APARÊNCIA'));
  limpar();
}
conferir('§9 há caso de proibição com população no corpus', comPopulacao >= 2, `${comPopulacao} caso(s)`);
/* O contexto planetário exerce a outra metade: nomear o que a classe ACEITA. */
gravar({ [alvo.id]: marcaCrua({}) });
const chips = porClasse(UI.desenharFavorito(alvo), 'btn').map((b) => b.textContent);
conferir(
  '§9 o contexto planetário oferece as 8 aparências do catálogo',
  Object.keys(F.APARENCIAS[F.CONTEXTO.PLANETARIO]).every((n) =>
    chips.includes(F.APARENCIAS[F.CONTEXTO.PLANETARIO][n].rotulo)
  ),
  chips.join(',')
);
if (semContextoNode) {
  gravar({ [semContextoNode.id]: marcaCrua({}) });
  conferir(
    '§9 corpo sem contexto não recebe chip de aparência',
    porClasse(UI.desenharFavorito(semContextoNode), 'marca-aparencias').length === 0
  );
}
limpar();

// ───────────────────────────────────────────────────────── §10 · o gesto chega ao modelo

/*
 * O botão do painel e a tecla `F` chamam a MESMA função — um gesto, duas portas. O que se prova
 * aqui é o caminho inteiro: clicar escreve no `prefs`, a leitura seguinte muda de estado, e o
 * clique no chip grava a aparência do contexto em que o corpo está AGORA.
 */
limpar();
const linhaMarcar = porClasse(UI.desenharFavorito(alvo), 'btn')[0];
linhaMarcar.clicar();
conferir(
  '§10 clicar em MARCAR marca',
  UI.leitura(alvo).estado === F.ESTADO.SEM_APARENCIA,
  String(UI.leitura(alvo).estado)
);
conferir('§10 a marca gravada carimba o céu do servidor', UI.leitura(alvo).corpus === CORPUS);
conferir('§10 e carimba a autoria do OPERADOR', UI.leitura(alvo).por === F.AUTORIA.OPERADOR);

const chipTerra = porClasse(UI.desenharFavorito(alvo), 'btn').find(
  (b) => b.textContent === F.APARENCIAS[F.CONTEXTO.PLANETARIO].terra.rotulo
);
chipTerra.clicar();
conferir(
  '§10 clicar no chip escolhe a aparência',
  UI.leitura(alvo).aparencia === 'terra',
  String(UI.leitura(alvo).aparencia)
);
chipTerra.clicar();
conferir(
  '§10 clicar de novo ESQUECE a aparência e mantém a marca',
  UI.leitura(alvo).aparencia === null && UI.leitura(alvo).marcada === true
);

const linhaSoltar = porClasse(UI.desenharFavorito(alvo), 'btn').find((b) => acoes([b]).includes('DESMARCAR'));
linhaSoltar.clicar();
conferir('§10 clicar em DESMARCAR desmarca', UI.leitura(alvo).estado === F.ESTADO.NAO_MARCADO);

/*
 * ⚠️ **Sem carimbo de corpus a marca é RECUSADA**, e a recusa vira texto de tela em vez de exceção
 * solta: ela traz o conserto dentro do motivo, e engoli-la deixaria a tecla falhando em silêncio.
 */
UI.carregarTopologia({ ...graph, corpus: null });
const semCeu = UI.alternar(alvo);
conferir(
  '§10 marca sem carimbo de corpus é recusada com o conserto no motivo',
  semCeu.ok === false && String(semCeu.erro).includes('/api/graph'),
  JSON.stringify(semCeu)
);
UI.carregarTopologia(graph);
limpar();

// ─────────────────────────────────── §11 · a marca REPINTA quem a desenha, e SOLTA quando some

/*
 * Marcar não muda o que está sob atenção: nenhum `ui.links` sai do gesto. Sem uma notificação
 * própria, o operador clica em MARCAR e o painel continua oferecendo MARCAR — a tela contradizendo
 * um gesto que já aconteceu.
 *
 * ⭑ **O caminho é UM só, e é essa a lei:** toda escrita passa por `prefs`, e `instalarFavoritos`
 * escuta a chave. Um segundo caminho de notificação seria livre para discordar do primeiro, e o
 * lado que não fosse chamado desenharia o estado velho sem nada acusar.
 *
 * ⚠️ Por isso a §11b não usa o gesto: escrita vinda do CONSOLE durante uma medida tem de repintar
 * igual. É o caso que um evento emitido dentro de `alternar()` deixaria de fora.
 */
const repintou = [];
const soltar = UI.aoMudar(() => repintou.push(1));
const corpoDaMarca = um('planetario') || um('rochoso') || um('fotosfera');
conferir('§11 há corpo marcável no corpus servido', Boolean(corpoDaMarca));

repintou.length = 0;
UI.alternar(corpoDaMarca);
conferir('§11 o GESTO de marcar repinta quem desenha a marca', repintou.length === 1, `${repintou.length}`);

repintou.length = 0;
prefsFake.set(F.CHAVE_PREFS, { v: F.VERSAO, marcas: {} });
conferir('§11 escrita EXTERNA na chave repinta igual', repintou.length === 1, `${repintou.length}`);

repintou.length = 0;
prefsFake.set('espatial.nao-e-favorito.v1', 1);
conferir('§11 chave alheia NÃO repinta', repintou.length === 0, `${repintou.length}`);

/* `null` é o `prefs` inteiro trocado — limpeza, importação, restauração. A marca some junto. */
repintou.length = 0;
prefsFake.set(null, null);
conferir('§11 troca do prefs inteiro repinta', repintou.length === 1, `${repintou.length}`);

/*
 * ☠️ **O cancelamento é metade da lei, e é a metade que vaza calada.** Um widget destruído que
 * continue na lista repinta um DOM que saiu da árvore: sem erro, sem sintoma, e a cada rota mais um.
 */
soltar();
repintou.length = 0;
prefsFake.set(F.CHAVE_PREFS, { v: F.VERSAO, marcas: {} });
conferir('§11 o cancelamento de `aoMudar` solta o ouvinte', repintou.length === 0, `${repintou.length}`);

/*
 * A fiação do lado de quem desenha, por VARREDURA: o painel de contexto não é montável aqui (a
 * cadeia de import dele alcança `three`), então o que se confere é que ele registra a repintura e
 * chama o cancelamento que recebeu.
 *
 * ⚠️ **O nome do cancelamento sai do FONTE**, nunca cravado aqui: procurar `offMarca()` casaria o
 * nome e não a ligação, e renomear a variável deixaria a lei verde sobre um `destroy` que não solta.
 */
const ctx = semProsa(src('src/apps/context.js'));
const ligacao = ctx.match(/const\s+(\w+)\s*=\s*aoMudar\(/);
conferir(
  '§11 o painel de contexto registra a repintura por `aoMudar`',
  Boolean(ligacao),
  'nenhum `const X = aoMudar(` em apps/context.js'
);
if (ligacao) {
  const destroy = ctx.match(/destroy:\s*\(\)\s*=>\s*\{([\s\S]*?)\}/);
  conferir(
    '§11 e o `destroy` chama o cancelamento que recebeu',
    Boolean(destroy) && new RegExp(`\\b${ligacao[1]}\\(\\)`).test(destroy[1]),
    `destroy: ${destroy ? destroy[1].trim() : 'ausente'}`
  );
}

limpar();

// ───────────────────────────────────────────────────────── veredito

const CENSO = [
  `corpus ${CORPUS} · ${cobertura.nos} nós · ${cobertura.cobertos} com contexto`,
  `planetário ${espécimes.planetario.length} · rochoso ${espécimes.rochoso.length} · ` +
    `estrutura ${espécimes.estrutura.length} · fotosfera ${espécimes.fotosfera.length} · ` +
    `cometa ${espécimes.cometa.length} · pulsar ${espécimes.pulsar.length}`,
  // ⚠️ MEDIDO, nunca cravado: o `0` que estava aqui virou mentira no dia em que as texturas
  // chegaram, e continuava sendo impresso como se tivesse sido medido.
  (() => {
    const todas = Object.values(F.APARENCIAS).flatMap((c) => Object.values(c));
    const emDisco = todas.filter((a) => fs.existsSync(`${RAIZ}/${a.arquivo}`)).length;
    return `${todas.length} aparências no catálogo · ${emDisco} em disco`;
  })(),
];
for (const linha of CENSO) console.log(`  ${linha}`);
console.log(`\n  ${ok.length} leis passaram.`);
if (falhas.length) {
  console.error(`\n☠️  ${falhas.length} LEI(S) REPROVADA(S):\n`);
  for (const f of falhas) console.error(`  · ${f}`);
  process.exit(1);
}
console.log('  A interface diz que a marca é ESCOLHA, e distingue os quatro estados.');
