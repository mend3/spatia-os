/**
 * Registro do sistema: aplicativos e widgets.
 *
 * Um app aqui não é uma janela — é um **destino**. Ele declara de que cor é, por qual dígito se
 * alcança e quais widgets compõem a vista quando você está dentro dele.
 *
 * ⚠️ O manifesto declarava `orbit: {radius, inclination, phase}` e NINGUÉM lia: os corpos de app
 * saíram do céu em `7719d4f` e o campo ficou, copiado por cada app novo. Enquanto não houver
 * corpo para posicionar, órbita alocada por hash (§2.3) seria construir o mesmo defeito com mais
 * cerimônia.
 *
 * Um widget declara em que fenda cabe e de que eventos vive. Ele NÃO sabe em qual app está:
 * o mesmo widget de timeline serve o sistema e o app de arquivos sem uma linha de condicional.
 * É a mesma disciplina do barramento — quem desenha não conhece quem produz.
 *
 * Os dois registros são deliberadamente burros: guardam manifestos e devolvem manifestos. A
 * política (o que abre, quando, com qual layout) mora no `router`, e a mecânica de montagem
 * mora no host de widgets. Registro que também decide é onde nasce o acoplamento.
 */

/**
 * Rota raiz: a vista sem app, com o núcleo centrado.
 *
 * Vive AQUI, não no router, porque é um id reservado no mesmo namespace dos apps — e o
 * registro é quem pode recusar a colisão. Ela já aconteceu: a raiz chamava `system`, existe um
 * app `system`, e `#/system` caía na vista raiz deixando o app inalcançável sem erro nenhum.
 */
export const ROUTE_ROOT = 'core';

const apps = new Map();
const widgets = new Map();

/*
 * Gestos reivindicados por app: `claim -> app id`.
 *
 * The kernel dispatches, it never decides — a destination written into the router is one app's
 * policy inside the mechanism that routes for every app.
 */
const claims = new Map();

/*
 * Atalho numérico → app.
 *
 * A tecla vinha da POSIÇÃO em `listApps()`, então instalar um app remapeava os atalhos que o
 * operador já tinha decorado — silenciosamente, e para todos ao mesmo tempo. Declarada no
 * manifesto, ela é propriedade do app e sobrevive a qualquer ordem de registro.
 */
const keys = new Map();

/**
 * O CATÁLOGO do contrato de widget: o que ele ACEITA, e de que cada chave responde.
 *
 * ⚠️ Esta tabela é a fonte única do vocabulário — a assinatura em `@param` seria uma segunda,
 * livre para divergir em silêncio. Chave nova entra AQUI, com a frase do que ela responde, e o
 * portão passa a aceitá-la sem ninguém editar mais nada.
 *
 * ☠️ **Chave declarada precisa de LEITOR.** Um campo que ninguém lê é o `orbit` do manifesto de
 * app outra vez: copiado por cada registro novo, sem efeito nenhum. `scripts/lei-catalogo.mjs`
 * varre os dois sentidos — declarada sem leitor, e lida sem declaração.
 */
export const VOCABULARIO_DO_WIDGET = Object.freeze({
  id: 'identidade — o nome pelo qual o app pede o widget e o host o encontra',
  title: 'o rótulo da seção, e o alvo de clique que a recolhe',
  hint: 'o texto pequeno à direita do rótulo (contagem, estado)',
  slot: 'em que FENDA cabe — uma de `FENDAS`',
  grow: 'peso elástico na fenda (flex); 0 = altura do conteúdo',
  collapsed: 'nasce recolhido? só vale onde há rótulo para recolher',
  surface: 'é JANELA? o palco não tem moldura, e quem precisa de fundo declara que precisa',
  mount: '(host, ctx) => ({ destroy? }) | void — quem desenha',
});

/**
 * As FENDAS do layout: o que cada uma significa, o que EXIGE declarado e o que ela PROÍBE.
 *
 * A semântica é a de `OS-SCREENS.md` §0 e mora aqui porque o portão a usa — doc não recusa nada.
 *
 * ⚠️ **`exige` é sobre DECLARAR, não sobre o valor.** No palco, `surface` ausente e
 * `surface: false` não são a mesma coisa: um é "ninguém decidiu", o outro é "decidi que não".
 * É a distinção `null` ≠ `0` das leis do Neo4j aplicada ao contrato — e é a que faltava quando um
 * widget de palco nasceu sem fundo e o disco de acreção atravessou o texto da página
 * (`index.html:811-814`).
 *
 * ⚠️ **`proibe` é a proibição em campo próprio, com leitor** — a REGRA DO CATÁLOGO manda nomear o
 * que se aceita, e o que se recusa vai em campo separado em vez de virar exclusão espalhada. No
 * palco o host não desenha rótulo (`kernel/widgets.js:104`), então `collapsed` ali promete um
 * recolhimento que não existe: declaração inerte é invariante declarada e não implementada.
 */
export const FENDAS = Object.freeze({
  left: Object.freeze({
    semantica: 'o que É — identidade, configuração, o estado declarado',
    exige: Object.freeze([]),
    proibe: Object.freeze([]),
  }),
  right: Object.freeze({
    semantica: 'o que está ACONTECENDO — medido, observado, agora',
    exige: Object.freeze([]),
    proibe: Object.freeze([]),
  }),
  stage: Object.freeze({
    semantica: 'o OBJETO do app — a coisa única que a tela serve para olhar',
    exige: Object.freeze(['surface']),
    proibe: Object.freeze(['collapsed']),
  }),
  strip: Object.freeze({
    semantica: 'RESIDENTES — o que nunca deve sair da tela',
    exige: Object.freeze([]),
    proibe: Object.freeze([]),
  }),
});

/** As fendas do layout. `stage` é o centro, onde a resposta nasce. */
export const SLOTS = Object.freeze(Object.keys(FENDAS));

/** O contrato aceita esta chave? */
export const aceitaNoWidget = (chave) => Object.hasOwn(VOCABULARIO_DO_WIDGET, chave);
/** O que esta fenda exige DECLARADO — leitor de `FENDAS.exige`. */
export const exigidasDaFenda = (slot) => FENDAS[slot]?.exige ?? [];
/** O que esta fenda recusa — leitor de `FENDAS.proibe`. */
export const proibidasNaFenda = (slot) => FENDAS[slot]?.proibe ?? [];

/**
 * @param {object} manifest
 * @param {string} manifest.id            identificador estável — vira rota (`#/files`)
 * @param {string} manifest.name          rótulo na dock e no cabeçalho
 * @param {string} manifest.tagline       uma linha do que o app é
 * @param {number} manifest.color         cor do corpo no espaço e do acento na HUD
 * @param {string} manifest.key           dígito do atalho (1–9), estável e declarado
 * @param {string[]} manifest.widgets     ids de widget, na ordem de montagem
 * @param {string[]} [manifest.claims]    gestos que o app reivindica (`ui.select:file`)
 * @param {Function} [manifest.onEnter]   efeito colateral ao entrar (ex.: carregar dados)
 * @param {Function} [manifest.onLeave]   limpeza ao sair
 */
export function registerApp(manifest) {
  if (!manifest?.id) throw new Error('app sem id');
  if (apps.has(manifest.id)) throw new Error(`app duplicado: ${manifest.id}`);
  if (manifest.id === ROUTE_ROOT) {
    throw new Error(`app não pode usar o id reservado da rota raiz: ${ROUTE_ROOT}`);
  }

  const unknown = (manifest.widgets || []).filter((id) => !widgets.has(id));
  if (unknown.length) {
    // Falha no registro, não na navegação. Widget que não existe só apareceria como uma
    // fenda vazia quando o operador abrisse o app — e uma fenda vazia não diz o motivo.
    throw new Error(`app ${manifest.id} pede widget inexistente: ${unknown.join(', ')}`);
  }

  if (manifest.key !== undefined) {
    if (!/^[1-9]$/.test(String(manifest.key))) {
      throw new Error(`app ${manifest.id}: tecla inválida "${manifest.key}" — só os dígitos 1–9`);
    }
    const owner = keys.get(String(manifest.key));
    // Mesmo motivo dos gestos: duas donas para a mesma tecla seriam resolvidas pela ordem de
    // registro, e o operador leria como o atalho mudando de destino sozinho.
    if (owner) throw new Error(`app ${manifest.id}: tecla ${manifest.key} já é de ${owner}`);
  }

  for (const claim of manifest.claims || []) {
    const owner = claims.get(claim);
    // Two apps answering the same gesture is a coin toss decided by registration order, and the
    // operator reads it as the click landing somewhere different each install.
    if (owner) throw new Error(`app ${manifest.id}: gesto ${claim} já é de ${owner}`);
  }

  apps.set(manifest.id, Object.freeze({ tagline: '', widgets: [], claims: [], ...manifest }));
  for (const claim of manifest.claims || []) claims.set(claim, manifest.id);
  if (manifest.key !== undefined) keys.set(String(manifest.key), manifest.id);
  return manifest.id;
}

/**
 * Registra um widget. As chaves aceitas — e de que cada uma responde — estão em
 * `VOCABULARIO_DO_WIDGET`; o que cada fenda exige e proíbe, em `FENDAS`.
 *
 * ☠️ **A recusa é no REGISTRO, alta, como a da tecla duplicada.** `...contract` espalhado sem
 * conferência aceitava qualquer chave: `surafce: true` entrava, ninguém lia, e o defeito só
 * aparecia como um painel sem fundo — uma fenda vazia não diz o motivo, e um campo ignorado diz
 * menos ainda. O erro tem de estourar no boot, com o nome do culpado (`main.js:146-150`).
 *
 * @param {object} contract  as chaves de `VOCABULARIO_DO_WIDGET`
 */
export function registerWidget(contract) {
  if (!contract?.id) throw new Error('widget sem id');
  const intrusas = Object.keys(contract).filter((chave) => !aceitaNoWidget(chave));
  if (intrusas.length) {
    throw new Error(
      `widget ${contract.id}: chave fora do vocabulário: ${intrusas.join(', ')} — ` +
        `o contrato aceita ${Object.keys(VOCABULARIO_DO_WIDGET).join(', ')}`
    );
  }
  if (!SLOTS.includes(contract.slot)) {
    throw new Error(`widget ${contract.id}: fenda inválida "${contract.slot}" — as fendas são ${SLOTS.join(', ')}`);
  }
  if (typeof contract.mount !== 'function') {
    throw new Error(`widget ${contract.id}: mount não é função`);
  }
  // Ausente é diferente de `false`: quem não declarou não decidiu, e a fenda não decide por ele.
  const faltando = exigidasDaFenda(contract.slot).filter((chave) => contract[chave] == null);
  if (faltando.length) {
    throw new Error(
      `widget ${contract.id}: a fenda "${contract.slot}" exige ${faltando.join(', ')} DECLARADO — ` +
        `não dizer nada não é dizer que não. ${faltando.map((c) => `${c}: ${VOCABULARIO_DO_WIDGET[c]}`).join('; ')}`
    );
  }
  // Pedir é declarar valor VERDADEIRO: um `false` que o invólucro repassa não pede nada.
  const recusadas = proibidasNaFenda(contract.slot).filter((chave) => Boolean(contract[chave]));
  if (recusadas.length) {
    throw new Error(
      `widget ${contract.id}: a fenda "${contract.slot}" (${FENDAS[contract.slot].semantica}) ` +
        `não lê ${recusadas.join(', ')} — campo sem leitor é promessa que a tela não cumpre`
    );
  }
  // Registro duplicado é a mesma falha calada da tecla com dois donos: o segundo contrato
  // substituiria o primeiro pela ordem de importação, e o widget mudaria de dono sozinho.
  if (widgets.has(contract.id)) throw new Error(`widget duplicado: ${contract.id}`);
  widgets.set(contract.id, Object.freeze({ hint: '', grow: 0, ...contract }));
  return contract.id;
}

export const getApp = (id) => apps.get(id) ?? null;
export const getWidget = (id) => widgets.get(id) ?? null;
export const listApps = () => [...apps.values()];
export const listWidgets = () => [...widgets.values()];
export const hasApp = (id) => apps.has(id);
/** Which app claims a gesture, or `null` — the router resolves, it does not choose. */
export const appClaiming = (claim) => claims.get(claim) ?? null;
/** Qual app responde por um dígito, ou `null`. */
export const appByKey = (key) => keys.get(String(key)) ?? null;
