/**
 * Registro do sistema: aplicativos e widgets.
 *
 * Um app aqui não é uma janela — é um **destino no espaço**. Ele declara onde orbita, de que
 * cor é, e quais widgets compõem a vista quando você está dentro dele. Abrir um app é a
 * câmera ir até o corpo dele; a HUD reconfigurar é consequência, não o evento principal.
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

/** As fendas do layout. `stage` é o centro, onde a resposta nasce. */
export const SLOTS = ['left', 'right', 'stage', 'strip'];

/**
 * @param {object} manifest
 * @param {string} manifest.id            identificador estável — vira rota (`#/files`)
 * @param {string} manifest.name          rótulo na dock e no cabeçalho
 * @param {string} manifest.tagline       uma linha do que o app é
 * @param {number} manifest.color         cor do corpo no espaço e do acento na HUD
 * @param {object} manifest.orbit         {radius, inclination, phase} — posição do corpo
 * @param {string[]} manifest.widgets     ids de widget, na ordem de montagem
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

  apps.set(manifest.id, Object.freeze({ tagline: '', widgets: [], ...manifest }));
  return manifest.id;
}

/**
 * @param {object} contract
 * @param {string} contract.id
 * @param {string} contract.title       rótulo do widget
 * @param {string} [contract.hint]      texto pequeno à direita do rótulo
 * @param {string} contract.slot        uma de SLOTS
 * @param {number} [contract.grow]      peso na fenda (flex); 0 = altura do conteúdo
 * @param {Function} contract.mount     (host, ctx) => ({ destroy? }) | void
 */
export function registerWidget(contract) {
  if (!contract?.id) throw new Error('widget sem id');
  if (!SLOTS.includes(contract.slot)) {
    throw new Error(`widget ${contract.id}: fenda inválida "${contract.slot}"`);
  }
  if (typeof contract.mount !== 'function') {
    throw new Error(`widget ${contract.id}: mount não é função`);
  }
  widgets.set(contract.id, Object.freeze({ hint: '', grow: 0, ...contract }));
  return contract.id;
}

export const getApp = (id) => apps.get(id) ?? null;
export const getWidget = (id) => widgets.get(id) ?? null;
export const listApps = () => [...apps.values()];
export const listWidgets = () => [...widgets.values()];
export const hasApp = (id) => apps.has(id);
