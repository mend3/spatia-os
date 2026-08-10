/**
 * FAVORITOS — o operador marca corpos para acompanhar, e escolhe a aparência nomeada de alguns.
 *
 * ## Por que um corpo NOMEADO é legítimo aqui, e só aqui
 *
 * `assets/CREDITS.md` recusa textura fotográfica de planeta com uma frase dura: *"uma foto de Marte
 * faria todo arquivo parecer Marte independentemente do que ele É"* — o modo de olhar decidindo a
 * classe, o defeito que esta base já pagou duas vezes (uma lua em foco resolvendo como galáxia; 228
 * de 228 agregados virando galáxia).
 *
 * O que muda aqui é **quem escolhe**. Se quem diz *"este é o meu Marte"* é o OPERADOR, a aparência
 * deixa de ser afirmação derivada do dado e vira **MARCA**: ela não diz o que o arquivo é, registra
 * o que alguém quer acompanhar — e isso é fato próprio, com dono, com data e com o céu em que foi
 * feito.
 *
 * ## As três condições, e o que neste arquivo IMPLEMENTA cada uma
 *
 * 1. **A marca não entra em `classificar()`, `entityPhysics()` nem `superficieDe()`.** A dependência
 *    é de mão única e ela é visível na primeira linha: este módulo IMPORTA o vocabulário da pele e
 *    nunca é importado por quem decide classe. `contextoDe()` LÊ a saída dos três; nada aqui entra
 *    neles. Provado por perturbação em `lei-favoritos.mjs` §2 — declarar não implementa.
 * 2. **Mora no operador, não no corpus.** O estado inteiro é um objeto simples que `prefs` guarda
 *    sob `CHAVE_PREFS`; o corpus não tem opinião sobre ele. Dois operadores veem marcas diferentes
 *    sobre a MESMA topologia, e é isso que a torna marca.
 * 3. **É legível como escolha.** `ler()` e `sonda()` devolvem `por`, `em` e `corpus` junto com o
 *    nome — quem desenhar a marca sem dizer *"você marcou"* está fora do contrato.
 *
 * ## O caso que decide o desenho: o arquivo MUDA DE CLASSE
 *
 * Um `.md` cresce e vira estrela; um dominante deixa de ser dominante. Textura de planeta sobre uma
 * fotosfera é absurdo. Então a escolha é guardada **por CONTEXTO** e nunca fica presa: some quando o
 * corpo sai do contexto em que foi feita, **anunciando** que sumiu, e volta inteira se o corpo
 * voltar. E `null` não é `0` aplicado à escolha — são estados diferentes, ver `ESTADO`.
 *
 * ⚠️ **Módulo PURO** — sem `three`, sem `document`, sem `localStorage`, no espírito de
 * `entity-physics.js`. Quem persiste é `prefs`, e ele chega por injeção em `criarFavoritos()`, nunca
 * por `import`: é o que permite provar o modelo inteiro em `node`.
 *
 * ⚠️ **Ele mora em `space/` e não em `core/` porque o vocabulário que ele não pode duplicar é daqui**
 * (`SUPERFICIE`, os tipos de `classificar()`). Uma cópia dessas strings em `core/` seria uma segunda
 * fonte da verdade livre para divergir em silêncio — o mesmo motivo pelo qual `superficieDe()`
 * importa `FAMILIA` em vez de escrever `'body'` à mão.
 */

import { SUPERFICIE } from './superficies.js';

// ─────────────────────────────────────────────────────────── quem tem direito de marcar

/**
 * As autorias que uma marca ACEITA. Hoje há uma só, e é ela que carrega a legitimidade inteira.
 *
 * ⚠️ Não é campo decorativo: `marcar()` recusa qualquer outra, e é essa recusa que impede a marca
 * de voltar a ser o defeito. Uma marca "derivada" seria o DADO escolhendo a aparência — a mesma
 * coisa que a textura de Marte roteada por `kind`, com outro nome.
 */
export const AUTORIA = Object.freeze({
  OPERADOR: 'operador',
});

/** O que a autoria NÃO aceita, com o motivo — a proibição em campo próprio (REGRA DO CATÁLOGO). */
export const AUTORIAS_RECUSADAS = Object.freeze({
  derivada:
    'marca derivada do dado é a afirmação que o favorito existe para não ser: quem escolhe ' +
    'tem de ser gente. Se um dia houver um segundo autor legítimo (importação, sincronização ' +
    'entre máquinas), ele entra em AUTORIA com nome próprio — nunca por aqui',
  inferida:
    'inferência não é escolha. `ABOUT` é a única dimensão desta base que não é fato, e ela ' +
    'carrega `modelo` e `as_of` justamente para poder ser apagada de uma vez',
});

// ─────────────────────────────────────────────────────────── o catálogo de aparências

/**
 * O CONTEXTO de aparência de um corpo — a pergunta *"que tipo de aparência nomeada cabe aqui?"*.
 *
 * ⚠️ Ele não é a classe nem a pele: é derivado das DUAS, e por medida. A pele sozinha não serve
 * porque `none` cobre tanto o asteroide parado (que é a única lacuna real de textura, e onde ela
 * ACRESCENTA) quanto a estrutura (que não tem corpo nenhum). A classe sozinha não serve porque um
 * planeta em atividade extrema desenha COMETA, e textura de planeta sobre coma e cauda é o mesmo
 * absurdo que sobre uma fotosfera.
 */
export const CONTEXTO = Object.freeze({
  PLANETARIO: 'planetario',
  ROCHOSO: 'rochoso',
  NENHUM: 'nenhum',
});

/**
 * O que a marca ACEITA, por contexto. Nomear a aceitação é a REGRA DO CATÁLOGO; a proibição está em
 * `SEM_APARENCIA`, logo abaixo.
 *
 * ☠️ **NENHUM destes arquivos está em disco hoje, e isto é medida, não esquecimento.** T-34 (baixar
 * as texturas) está bloqueada por T-35 (isto aqui) exatamente porque era esta tarefa que decidia
 * quais valia a pena baixar. O modelo não afirma disponibilidade em lugar nenhum: `ler()` devolve
 * `disponivel: null` quando ninguém lhe disse o que existe, e **degrada anunciando** quando o
 * arquivo falta. Um catálogo que afirmasse a carga seria o pior padrão desta base — o cabeçalho
 * afirmando enquanto a carga está vazia.
 *
 * ⚠️ `origem` e `licenca` viajam com cada entrada porque atribuição descoberta depois da publicação
 * é atribuição que já faltou (regra do topo de `assets/CREDITS.md`). Quem baixar um destes escreve o
 * hash e a atribuição **no mesmo commit**.
 */
const SSS = (nome) => `https://www.solarsystemscope.com/textures/download/2k_${nome}.jpg`;
const CC_BY_4 = 'CC BY 4.0 · Solar System Scope (solarsystemscope.com)';
const planetario = (chave, rotulo, nome) => [
  chave,
  Object.freeze({
    rotulo,
    arquivo: `assets/textures/${nome}.jpg`,
    origem: SSS(nome),
    licenca: CC_BY_4,
  }),
];

export const APARENCIAS = Object.freeze({
  /*
   * Os oito da lista do Solar System Scope que `assets/CREDITS.md` nomeia na seção do FAVORITO. Ela
   * está escrita lá como o que deixa de ser inútil para esta cena assim que a escolha passa a ser
   * do operador — é a lista, não uma seleção nova.
   *
   * ⚠️ Planeta e LUA compartilham a pele (`superficies.js`: a diferença entre eles é de porte, não
   * de natureza), então os dois caem neste contexto e a mesma escolha vale para os dois.
   */
  [CONTEXTO.PLANETARIO]: Object.freeze(
    Object.fromEntries([
      planetario('terra', 'TERRA', 'earth_daymap'),
      planetario('marte', 'MARTE', 'mars'),
      planetario('jupiter', 'JÚPITER', 'jupiter'),
      planetario('saturno', 'SATURNO', 'saturn'),
      planetario('venus', 'VÊNUS', 'venus_surface'),
      planetario('mercurio', 'MERCÚRIO', 'mercury'),
      planetario('netuno', 'NETUNO', 'neptune'),
      planetario('urano', 'URANO', 'uranus'),
    ])
  ),
  /*
   * ⭑ **O asteroide é o único caso em que textura ACRESCENTA em vez de substituir** — é a única
   * classe sem pele nenhuma (`superficies.js`: parado ele fica sem pele, e isso é decisão).
   *
   * Ceres, e não Mercúrio, porque Ceres é um asteroide de verdade — `CREDITS.md` chama a diferença
   * de "o mais defensável". Mercúrio já está no contexto planetário; repeti-lo aqui faria o mesmo
   * arquivo servir a dois contextos e a escolha deixaria de dizer qual dos dois o operador quis.
   */
  [CONTEXTO.ROCHOSO]: Object.freeze({
    ceres: Object.freeze({
      rotulo: 'CERES',
      arquivo: 'assets/textures/ceres.jpg',
      origem: 'https://www.solarsystemscope.com/textures/',
      licenca: CC_BY_4,
    }),
  }),
  [CONTEXTO.NENHUM]: Object.freeze({}),
});

/**
 * Os corpos que NÃO abrem contexto de aparência, com o motivo de cada um — a outra metade da REGRA
 * DO CATÁLOGO, no mesmo formato de `AUSENTES_NA_TABELA`.
 *
 * ⚠️ Cada motivo aqui tem de nomear o FATO que teria de mudar, nunca uma fila. *"a cena ainda não
 * tem esse nível"* é a forma de condição que não porteia nada — ela manda a próxima pessoa medir a
 * coisa errada com convicção total.
 *
 * ⚠️ A tabela é indexada por CASO e não por pele, porque `none` é dois casos e não um: o asteroide
 * (que abre `rochoso`) e a estrutura (que não abre nada). Indexar pela pele juntaria os dois na
 * mesma chave e a proibição passaria a mentir sobre metade da população dela.
 */
export const SEM_APARENCIA = Object.freeze({
  estrutura:
    'agregado não tem corpo — dar-lhe aparência afirmaria um objeto que não há, e a cena ' +
    'UNIVERSO nem o desenha (ele é o lugar onde o sistema mora, e a POSIÇÃO já o comunica). ' +
    'Marcar uma pasta continua valendo: o que ela não recebe é aparência',
  fotosfera:
    'a estrela JÁ é fotografada — `textures/sun.jpg` veste toda fotosfera do ' +
    'céu, tingida por temperatura em `photosphere.js`. Uma aparência "Sol" seria escolher o que já ' +
    'está lá: parâmetro sem leitor. Abre contexto no dia em que houver uma SEGUNDA textura ' +
    'estelar (a K/M fria do item 7 do handoff), e aí a escolha passa a mudar um pixel',
  cometa:
    'coma e cauda são ESTADO, não corpo — existem só enquanto há trabalho ' +
    'recente e somem quando ele passa. Uma marca nomeada aqui prenderia aparência a uma condição ' +
    'que expira sozinha, e o corpo por baixo já tem contexto próprio (planetário ou rochoso)',
  pulsar:
    'não existe foto de superfície de estrela de nêutrons: o que se vê dela é ' +
    'EMISSÃO, e emissão é o que o shader calcula. Textura aqui seria ilustração, não medida ' +
    '(`CREDITS.md`, a mesma linha que recusa quasar e buraco negro)',
  nebulosa:
    'já resolvido por outro canal — os fundos JWST em `assets/sky/` SÃO a ' +
    'nebulosa fotografada, com crédito próprio',
  estacao:
    'a estação pede MALHA, não mapa: ela é objeto CONSTRUÍDO e o análogo ' +
    'honesto é um `.glb` (o CubeSat genérico da NASA, T-34). E ela não tem população: ' +
    '`superficieDe()` não tem ramo que a devolva — ver `AUSENTES_NA_TABELA.station`',
});

/**
 * O contexto de aparência de um corpo, a partir do que a ontologia já decidiu sobre ele.
 *
 * ⚠️ **A seta aponta para cá, nunca para lá.** Esta função LÊ `classificar()` e `superficieDe()`;
 * nenhuma delas sabe que favoritos existem, e nenhum chamado delas em `src/` recebe marca. É a
 * condição 1, e `lei-favoritos.mjs` §2 a prova perturbando todo corpo do corpus servido.
 *
 * @param {{tipo?: string}} classe  saída de `classificar()`
 * @param {string} pele  saída de `superficieDe()`, um valor de `SUPERFICIE`
 * @returns {string} um valor de `CONTEXTO`
 */
export function contextoDe(classe, pele) {
  if (pele === SUPERFICIE.PLANETA) return CONTEXTO.PLANETARIO;
  /*
   * Só o ASTEROIDE, e não toda pele ausente: `none` também é o que a ESTRUTURA recebe (um diretório
   * não tem corpo, e dar-lhe crosta afirmaria um objeto que não há). Ler `none` como um balde só
   * juntaria os dois no mesmo contexto — que é classificar por exclusão, o defeito que fazia uma lua
   * em foco resolver como galáxia.
   */
  if (pele === SUPERFICIE.NENHUMA && classe?.tipo === 'asteroide') return CONTEXTO.ROCHOSO;
  return CONTEXTO.NENHUM;
}

/** As aparências que este contexto aceita, por nome. Contexto desconhecido devolve lista vazia. */
export function aparenciasDe(contexto) {
  return Object.keys(APARENCIAS[contexto] || {});
}

/**
 * POR QUE este corpo não recebe aparência nomeada — a entrada de `SEM_APARENCIA` que vale para ele,
 * ou `null` quando ele abre contexto.
 *
 * ⚠️ Ela existe para a proibição ter LEITOR. Uma tabela de motivos que ninguém consulta é invariante
 * declarada e não implementada — e o preço é a tela dizer "sem aparência" sem dizer por quê, que é
 * exatamente a diferença entre marca legível e marca calada.
 */
export function casoSemAparencia(classe, pele) {
  if (contextoDe(classe, pele) !== CONTEXTO.NENHUM) return null;
  /** Cada pele que não abre contexto, ligada ao caso. ⚠️ `none` fica fora: ela é dois casos. */
  const PELE_PARA_CASO = {
    [SUPERFICIE.FOTOSFERA]: 'fotosfera',
    [SUPERFICIE.COMETA]: 'cometa',
    [SUPERFICIE.PULSAR]: 'pulsar',
    [SUPERFICIE.NEBULOSA]: 'nebulosa',
    [SUPERFICIE.ESTACAO]: 'estacao',
  };
  const caso = pele === SUPERFICIE.NENHUMA ? 'estrutura' : PELE_PARA_CASO[pele];
  return caso ? Object.freeze({ caso, motivo: SEM_APARENCIA[caso] }) : null;
}

// ─────────────────────────────────────────────────────────── os estados da escolha

/**
 * Os estados em que a escolha de aparência pode estar. **São quatro, e não dois** — colapsá-los é o
 * mesmo erro que `null` valendo `0` no snapshot: some a diferença entre "não medi" e "medi e é zero".
 *
 * | estado | o fato |
 * |---|---|
 * | `nao-marcado` | *"não marquei"* — não existe marca nenhuma neste corpo |
 * | `sem-aparencia` | *"marquei para acompanhar, e não escolhi aparência"* — a marca é fato próprio, a aparência é opcional |
 * | `marcada` | *"marquei e a marca vale aqui"* — há escolha para o contexto atual e ela é honrável |
 * | `degradada` | *"marquei e a marca não vale mais aqui"* — a escolha existe e está GUARDADA, mas não pode ser desenhada agora |
 *
 * ⚠️ **`nao-marcado` e `degradada` devolvem os dois `aparencia: null`.** Quem ler só a aparência
 * perde a distinção inteira, e ela é justamente o que a tela precisa dizer: um corpo sem marca não
 * anuncia nada; um corpo degradado tem de anunciar *"a sua escolha não cabe neste corpo agora"*,
 * senão a marca some em silêncio e o operador acha que perdeu a afinação.
 */
export const ESTADO = Object.freeze({
  NAO_MARCADO: 'nao-marcado',
  SEM_APARENCIA: 'sem-aparencia',
  MARCADA: 'marcada',
  DEGRADADA: 'degradada',
});

// ─────────────────────────────────────────────────────────── o estado do operador

/**
 * A chave em `prefs`. ⚠️ **Ela NUNCA é renomeada.** Renomear não migra o que já está gravado, e a
 * afinação feita à mão evapora em silêncio — é a mesma regra que protege `camera.distance` e as
 * chaves `espatial.*` (ver `docs/identidade.md`). Formato novo entra pelo `v` de dentro do valor, e
 * `normalizar()` é a única porta.
 */
export const CHAVE_PREFS = 'favorites.marks';

/** A versão do FORMATO gravado — o que permite migrar sem trocar a chave. */
export const VERSAO = 1;

/** Nenhuma marca. É o que `normalizar()` devolve para storage vazio, ilegível ou de outro formato. */
export const VAZIO = Object.freeze({ v: VERSAO, marcas: Object.freeze({}) });

const ehTexto = (v) => typeof v === 'string' && v.length > 0;

/**
 * Põe em forma canônica o que veio do storage. **Entrada NÃO CONFIÁVEL**, como todo valor gravado:
 * ele pode ser de uma versão antiga, de outra máquina, ou editado à mão no console.
 *
 * ⚠️ Ela **não joga fora marca cujo corpo sumiu da topologia** — arquivo removido pode voltar, e
 * apagar a marca aqui seria o modelo decidindo por um fato que ele não tem (a topologia não passa
 * por aqui). Quem sabe disso é `sonda()`, que publica `noCeu` sem alterar nada.
 */
export function normalizar(bruto) {
  if (!bruto || typeof bruto !== 'object' || bruto.v !== VERSAO) return VAZIO;
  const marcas = {};
  for (const [id, marca] of Object.entries(bruto.marcas || {})) {
    if (!ehTexto(id) || !marca || typeof marca !== 'object') continue;
    if (!ehTexto(marca.corpus) || !ehTexto(marca.em)) continue;
    if (!Object.values(AUTORIA).includes(marca.por)) continue;
    const aparencias = {};
    for (const [contexto, nome] of Object.entries(marca.aparencias || {})) {
      // Nome fora do catálogo NÃO é descartado aqui: `ler()` o reporta como degradado com motivo.
      // Apagá-lo faria a escolha do operador sumir sem que ninguém dissesse por quê.
      if (ehTexto(contexto) && ehTexto(nome)) aparencias[contexto] = nome;
    }
    marcas[id] = Object.freeze({
      em: marca.em,
      por: marca.por,
      corpus: marca.corpus,
      aparencias: Object.freeze(aparencias),
    });
  }
  return Object.freeze({ v: VERSAO, marcas: Object.freeze(marcas) });
}

const comMarcas = (marcas) => Object.freeze({ v: VERSAO, marcas: Object.freeze(marcas) });

/**
 * MARCA um corpo. Devolve um estado NOVO — nada é mutado.
 *
 * @param {object} estado  o estado atual (passe por `normalizar()` antes, se veio do storage)
 * @param {{id: string, corpus: string, por?: string, em?: string}} entrada
 *   `id` é a identidade ESTÁVEL do nó (`node.id`), não o índice: para arquivo ele é igual a
 *   `source`, e para pasta é `dir:<caminho>` — que é o único que sobrevive a uma reindexação e o
 *   único que também endereça PASTA (nó de `dir` não tem `source`).
 */
export function marcar(estado, entrada = {}) {
  const { id, corpus, por = AUTORIA.OPERADOR, em = new Date().toISOString() } = entrada;
  if (!ehTexto(id)) throw new Error('favoritos: marcar exige `id` — a identidade estável do nó (`node.id`)');
  /*
   * ☠️ **CARIMBO AUSENTE NÃO É CARIMBO NEUTRO**, e a tentação é tolerar quem não o tem para não
   * quebrar. Tolerar reproduz o defeito: uma marca sem céu é indistinguível de uma marca feita em
   * OUTRO céu, e os caminhos se repetem entre corpora. Recusar com o conserto dentro do motivo é o
   * que `graphdb._recusa_de_corpus` já faz do outro lado.
   */
  if (!ehTexto(corpus)) {
    throw new Error(
      'favoritos: marcar exige `corpus` — sem ele a marca não sabe de que céu é, e os caminhos se ' +
        'repetem entre corpora. O nome sai de `/api/graph` → `corpus.collection`, do SERVIDOR (que é ' +
        'quem lê o .env), nunca do ambiente deste processo'
    );
  }
  if (!Object.values(AUTORIA).includes(por)) {
    const motivo = AUTORIAS_RECUSADAS[por];
    throw new Error(
      `favoritos: autoria \`${por}\` recusada — ${motivo || 'fora de AUTORIA'}. ` +
        `Aceitas: ${Object.values(AUTORIA).join(', ')}`
    );
  }
  const anterior = estado?.marcas?.[id];
  return comMarcas({
    ...estado.marcas,
    // Remarcar preserva as escolhas: desmarcar é que as apaga, e é um gesto diferente.
    [id]: Object.freeze({ em, por, corpus, aparencias: anterior?.aparencias || Object.freeze({}) }),
  });
}

/** DESMARCA um corpo — some a marca e as escolhas dela junto. É o gesto que apaga de propósito. */
export function desmarcar(estado, id) {
  if (!estado?.marcas?.[id]) return estado;
  const marcas = { ...estado.marcas };
  delete marcas[id];
  return comMarcas(marcas);
}

/**
 * ESCOLHE a aparência nomeada de um corpo já marcado, para um CONTEXTO.
 *
 * ⚠️ Ela recusa corpo não marcado de propósito: criar a marca aqui produziria uma marca sem
 * procedência declarada (sem `por`, sem `corpus`), que é o estado que `marcar()` existe para não
 * haver. Marcar primeiro é um gesto, não burocracia.
 */
export function escolherAparencia(estado, entrada = {}) {
  const { id, contexto, aparencia } = entrada;
  const marca = estado?.marcas?.[id];
  if (!marca) throw new Error(`favoritos: \`${id}\` não está marcado — marque antes de escolher aparência`);
  const aceitas = APARENCIAS[contexto];
  if (!aceitas) {
    throw new Error(
      `favoritos: contexto \`${contexto}\` não existe. Aceitos: ${Object.values(CONTEXTO).join(', ')}`
    );
  }
  if (!Object.hasOwn(aceitas, aparencia)) {
    const nomes = Object.keys(aceitas);
    throw new Error(
      `favoritos: \`${aparencia}\` não é aparência de \`${contexto}\`. ` +
        (nomes.length
          ? `Aceita: ${nomes.join(', ')}`
          : 'Este contexto não aceita aparência nomeada — ver SEM_APARENCIA')
    );
  }
  return comMarcas({
    ...estado.marcas,
    [id]: Object.freeze({
      ...marca,
      aparencias: Object.freeze({ ...marca.aparencias, [contexto]: aparencia }),
    }),
  });
}

/** ESQUECE a escolha de UM contexto, mantendo a marca e as escolhas dos outros contextos. */
export function esquecerAparencia(estado, entrada = {}) {
  const { id, contexto } = entrada;
  const marca = estado?.marcas?.[id];
  if (!marca || !Object.hasOwn(marca.aparencias, contexto)) return estado;
  const aparencias = { ...marca.aparencias };
  delete aparencias[contexto];
  return comMarcas({
    ...estado.marcas,
    [id]: Object.freeze({ ...marca, aparencias: Object.freeze(aparencias) }),
  });
}

/**
 * LÊ a marca de um corpo no contexto em que ele está AGORA.
 *
 * @param {object} estado
 * @param {{id: string, contexto: string, caso?: object|null, emDisco?: Set<string>|null}} consulta
 *   `emDisco` é o conjunto de `arquivo`s que o carregador sabe carregar. **Omitir não é dizer que
 *   não há** — omitido, `disponivel` sai `null` ("não medi"), que é diferente de `false` ("medi e
 *   falta"). Enquanto T-34 não baixar nada, o conjunto é vazio e toda escolha degrada ANUNCIANDO.
 *   `caso` é a saída de `casoSemAparencia()`, e serve só para o motivo dizer POR QUE este corpo não
 *   abre contexto em vez de mandar quem lê procurar na tabela.
 * @returns {object} congelado
 */
export function ler(estado, consulta = {}) {
  const { id, contexto, caso = null, emDisco = null } = consulta;
  /*
   * Contexto ausente é recusa, e não um default silencioso: responder sem saber em que corpo a
   * marca está devolveria "não vale" com cara de medida sobre uma escolha perfeitamente válida.
   */
  if (!ehTexto(contexto)) {
    throw new Error(
      'favoritos: ler exige `contexto` — use `contextoDe(classificar(...), superficieDe(...))`'
    );
  }
  const marca = estado?.marcas?.[id];
  const base = { id, contexto, aparencia: null, arquivo: null, disponivel: null };
  if (!marca) {
    return Object.freeze({
      ...base,
      marcada: false,
      estado: ESTADO.NAO_MARCADO,
      motivo: 'não marcado',
      por: null,
      em: null,
      corpus: null,
      escolhas: Object.freeze({}),
    });
  }

  const proveniencia = {
    marcada: true,
    por: marca.por,
    em: marca.em,
    corpus: marca.corpus,
    escolhas: marca.aparencias,
  };
  const escolhido = marca.aparencias[contexto];
  const outros = Object.keys(marca.aparencias).filter((c) => c !== contexto);

  if (!escolhido) {
    if (outros.length) {
      return Object.freeze({
        ...base,
        ...proveniencia,
        estado: ESTADO.DEGRADADA,
        motivo:
          `a escolha foi feita para ${outros.join(', ')} e este corpo está em ${contexto} agora — ` +
          'ela fica guardada e volta se o corpo voltar',
      });
    }
    const semContexto = contexto === CONTEXTO.NENHUM;
    return Object.freeze({
      ...base,
      ...proveniencia,
      estado: ESTADO.SEM_APARENCIA,
      motivo: semContexto
        ? `marcado para acompanhar; este corpo não abre contexto de aparência — ${caso?.motivo || `ver SEM_APARENCIA (${Object.keys(SEM_APARENCIA).join(', ')})`}`
        : 'marcado para acompanhar, sem aparência escolhida',
    });
  }

  const item = APARENCIAS[contexto]?.[escolhido];
  if (!item) {
    return Object.freeze({
      ...base,
      ...proveniencia,
      estado: ESTADO.DEGRADADA,
      motivo: `\`${escolhido}\` saiu do catálogo de ${contexto} — a escolha continua gravada, e nada a desenha`,
    });
  }
  if (emDisco && !emDisco.has(item.arquivo)) {
    return Object.freeze({
      ...base,
      ...proveniencia,
      estado: ESTADO.DEGRADADA,
      aparencia: escolhido,
      arquivo: item.arquivo,
      disponivel: false,
      motivo: `${item.arquivo} não está em disco (T-34) — a escolha vale, e a pele procedural desenha no lugar`,
    });
  }
  return Object.freeze({
    ...base,
    ...proveniencia,
    estado: ESTADO.MARCADA,
    aparencia: escolhido,
    arquivo: item.arquivo,
    disponivel: emDisco ? true : null,
    motivo: 'escolha do operador, válida neste corpo',
  });
}

/** Os ids marcados. */
export const marcados = (estado) => Object.keys(estado?.marcas || {});

/**
 * A SONDA — *"isto foi marcado, por quem, quando, e de qual céu"*, em uma chamada.
 *
 * É a peça da condição 3 que esta fase entrega: enquanto não há interface, ela é o que torna a marca
 * legível como ESCOLHA em vez de aparecer como se fosse medida.
 *
 * @param {object} estado
 * @param {{corpus?: string, emDisco?: Set<string>|null, corpos?: Map<string, {classe: object, pele: string}>}} onde
 *   `corpos` é a topologia servida, por `id`. Marca cujo id não está lá sai com `noCeu: false` — o
 *   arquivo pode ter sumido entre duas sessões, e isso é fato sobre o CÉU, não sobre a escolha.
 */
export function sonda(estado, onde = {}) {
  const { corpus = null, emDisco = null, corpos = null } = onde;
  const itens = marcados(estado).map((id) => {
    const marca = estado.marcas[id];
    const corpo = corpos?.get?.(id) ?? null;
    const contexto = corpo ? contextoDe(corpo.classe, corpo.pele) : null;
    const caso = corpo ? casoSemAparencia(corpo.classe, corpo.pele) : null;
    const leitura = contexto ? ler(estado, { id, contexto, caso, emDisco }) : null;
    return Object.freeze({
      id,
      por: marca.por,
      em: marca.em,
      corpus: marca.corpus,
      /*
       * ⚠️ Divergência de céu ANUNCIA, nunca esconde. Ocultar a marca faria a afinação do operador
       * evaporar em silêncio ao trocar de corpus; e `null` aqui é "não me disseram qual céu é",
       * que é diferente de "é outro".
       */
      foraDoCeu: corpus ? marca.corpus !== corpus : null,
      noCeu: corpos ? Boolean(corpo) : null,
      contexto,
      escolhas: marca.aparencias,
      estado: leitura?.estado ?? null,
      aparencia: leitura?.aparencia ?? null,
      motivo: leitura?.motivo ?? 'corpo fora da topologia servida — a marca fica, o céu é que não o tem',
    });
  });
  const conta = (p) => itens.filter(p).length;
  return Object.freeze({
    corpus,
    total: itens.length,
    degradadas: conta((i) => i.estado === ESTADO.DEGRADADA),
    foraDoCeu: corpus ? conta((i) => i.foraDoCeu) : null,
    ausentes: corpos ? conta((i) => !i.noCeu) : null,
    // `null` = ninguém disse o que existe em disco. `0` diria "medi e não há", e são fatos diferentes.
    emDisco: emDisco ? emDisco.size : null,
    itens: Object.freeze(itens),
  });
}

// ─────────────────────────────────────────────────────────── a persistência

/**
 * Liga o modelo ao guardador do operador. O `prefs` chega por INJEÇÃO (`{get, set}`), nunca por
 * `import`: é o que mantém este módulo puro e provável em `node`, e o que permite ao oráculo usar um
 * `prefs` de mentira sem tocar em `localStorage`.
 *
 * ⚠️ **A guarda `===` de `prefs.set` não desduplica objeto**, então toda chamada aqui escreve e
 * notifica. É aceitável e é diferente do caso da câmera: a pose é salva periodicamente (por isso ela
 * mora em três ESCALARES, para o salvamento que não mudou nada não acordar ninguém), e favorito só
 * muda por gesto do operador. Se um dia algo passar a gravar favorito em laço, esta linha é a que
 * volta a doer.
 */
export function criarFavoritos(prefsLike) {
  const ler_ = () => normalizar(prefsLike.get(CHAVE_PREFS));
  const gravar = (novo) => {
    prefsLike.set(CHAVE_PREFS, novo);
    return novo;
  };
  return {
    estado: ler_,
    marcados: () => marcados(ler_()),
    marcar: (entrada) => gravar(marcar(ler_(), entrada)),
    desmarcar: (id) => gravar(desmarcar(ler_(), id)),
    escolherAparencia: (entrada) => gravar(escolherAparencia(ler_(), entrada)),
    esquecerAparencia: (entrada) => gravar(esquecerAparencia(ler_(), entrada)),
    ler: (consulta) => ler(ler_(), consulta),
    sonda: (onde) => sonda(ler_(), onde),
  };
}
