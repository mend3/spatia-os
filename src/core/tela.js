/**
 * O dono único do estado de TELA: **o que está na tela agora**, respondido de um lugar só.
 *
 * Três fatos, e nenhum deles é do outro:
 *
 * | campo | significa | quem sabe |
 * |---|---|---|
 * | `camada` | que superfície está NA FRENTE (boot, splash, launcher, o mundo) | quem monta a superfície |
 * | `cena` | qual leitura do céu está montada | a cena, por `ui.scene-mode` |
 * | `rota` | que app está aberto e no quê | o kernel, por `ui.route` |
 *
 * Sem este módulo, *"a splash acabou → o universo começa"* não tem onde morar: cada camada
 * precisa de um `if` sobre as outras, e a enésima superfície custa N novos.
 *
 * ## As camadas são uma PILHA declarada, não um `if`
 *
 * Superfície nova entra em uma linha (`registrar({ id: 'splash' })`) e some em outra
 * (`sair('splash')`) — o que estiver embaixo reaparece sozinho, porque a pilha sabe a ordem e
 * ninguém mais precisa saber. `mundo` é o piso e nunca sai: o canvas nunca é desmontado.
 * ⚠️ Só id DECLARADO entra. Aceitar qualquer string faz um erro de digitação virar uma camada
 * que existe para o estado e não existe para os olhos.
 *
 * ## ⚠️ Ele ESCUTA e ANOTA — nunca manda de volta
 *
 * `cena` e `rota` são espelhos: quem os decide continua sendo `scene.setMode` e o router, e este
 * módulo não chama nenhum dos dois. É a lei de *"quem escuta pinta, e pintar não chama de volta"*
 * aplicada a um observador — anotar não chama de volta. A trava dupla é o `commit`, que só
 * anuncia quando algum campo mudou de fato: um assinante de `ui.tela` que navegue ou troque de
 * cena fecha o ciclo no segundo passo, em vez de ficar dando voltas.
 *
 * ⚠️ `cena` nasce `null` e `null` é **"ninguém anunciou ainda"**, não "cena nenhuma" — a cena só
 * emite quando TROCA, então o valor inicial é declarado por quem o conhece, no `install`.
 */
import { emit, on } from './bus.js';

/** O piso da pilha. O canvas está sempre atrás de tudo, e por isso esta camada nunca sai. */
export const CAMADA_BASE = 'mundo';

/** O vocabulário de uma camada. Chave fora daqui é recusada — catálogo nomeia o que ACEITA. */
const CHAVES = new Set(['id']);

const declaradas = new Set([CAMADA_BASE]);

const INICIAL = Object.freeze({
  /** A camada NA FRENTE. */
  camada: CAMADA_BASE,
  /** A pilha inteira, do piso ao topo. */
  camadas: Object.freeze([CAMADA_BASE]),
  /** Leitura do céu em vigor, ou `null` enquanto ninguém anunciou. */
  cena: null,
  /** `id` é a rota resolvida, `app` é `null` na raiz, `arg` é a sub-rota. */
  rota: Object.freeze({ id: null, app: null, arg: '' }),
});

let atual = INICIAL;
let instalado = false;

/** O que está na tela agora. Leitura só — toda escrita entra por função nomeada. */
export const estado = () => atual;

function diferente(a, b) {
  return (
    a.camada !== b.camada ||
    a.camadas.length !== b.camadas.length ||
    a.camadas.some((id, i) => b.camadas[i] !== id) ||
    a.cena !== b.cena ||
    a.rota.id !== b.rota.id ||
    a.rota.app !== b.rota.app ||
    a.rota.arg !== b.rota.arg
  );
}

function commit(patch) {
  const proximo = Object.freeze({ ...atual, ...patch });
  if (!diferente(atual, proximo)) return atual;
  atual = proximo;
  emit({ t: 'ui.tela', tela: proximo });
  return atual;
}

function comPilha(camadas) {
  const pilha = Object.freeze([...camadas]);
  return commit({ camadas: pilha, camada: pilha[pilha.length - 1] });
}

/**
 * Declara uma camada. Uma linha por superfície, e é a única coisa que ela precisa dizer de si.
 *
 * Falha alto de propósito: id duplicado é justamente o defeito que este módulo existe para
 * impedir — dois donos da mesma superfície — e id ausente ou chave desconhecida só nasce de
 * quem está montando a camada, na primeira execução.
 */
export function registrar(definicao) {
  const id = definicao?.id;
  if (typeof id !== 'string' || !id) throw new Error('[tela] camada precisa de um `id`');
  if (declaradas.has(id)) throw new Error(`[tela] camada já declarada: ${id}`);
  for (const chave of Object.keys(definicao)) {
    if (!CHAVES.has(chave)) throw new Error(`[tela] camada "${id}": chave desconhecida "${chave}"`);
  }
  declaradas.add(id);
  return id;
}

/**
 * `id` passa a estar NA FRENTE — e a regra é uma só, valha para camada nova ou já empilhada:
 * o que estava acima dela sai junto.
 *
 * Devolve a camada em vigor; id não declarado é recusado sem trocar nada.
 */
export function mostrar(id) {
  if (!declaradas.has(id)) return atual.camada;
  const posicao = atual.camadas.indexOf(id);
  if (posicao === -1) return comPilha([...atual.camadas, id]).camada;
  return comPilha(atual.camadas.slice(0, posicao + 1)).camada;
}

/**
 * A camada acabou. O que estiver embaixo reaparece sem que ninguém precise nomeá-lo — é isto que
 * dispensa o `if` em cada superfície.
 */
export function sair(id) {
  if (id === CAMADA_BASE) return atual.camada;
  const posicao = atual.camadas.indexOf(id);
  if (posicao === -1) return atual.camada;
  return comPilha(atual.camadas.filter((_, i) => i !== posicao)).camada;
}

/**
 * Liga os espelhos. Uma vez, no boot, e `cena` é o valor que só a cena conhece.
 *
 * Assinar duas vezes daria dois commits por evento — inofensivo pelo `commit`, e ainda assim
 * duas assinaturas para um observador que é um.
 */
export function install({ cena = null } = {}) {
  if (instalado) return atual;
  instalado = true;
  commit({ cena });
  on('ui.scene-mode', ({ modo }) => commit({ cena: modo ?? null }));
  on('ui.route', ({ route, app, arg }) =>
    commit({ rota: Object.freeze({ id: route ?? null, app: app ?? null, arg: arg ?? '' }) })
  );
  return atual;
}
