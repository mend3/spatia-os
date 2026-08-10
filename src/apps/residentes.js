/**
 * O CONJUNTO RESIDENTE: quais widgets TODA rota monta, e de que cada um responde.
 *
 * ☠️ Esta lista era PROSA em dois lugares — `OS-SCREENS.md` §0 e um comentário de `apps/index.js` —
 * e portão em nenhum. `#/security` ficou sem `timeline` e nada acusou: a fenda não fica vazia, ela
 * simplesmente não existe naquela rota, e o operador lê como "recolhi sem querer". Declarar uma
 * invariante não a implementa; aqui ela é DADO, tem leitor, e `declararApp` recusa a lista
 * incompleta NO REGISTRO — alto, como a tecla com dois donos, e não numa tela meia hora depois.
 *
 * ⚠️ **Por que aqui e não no kernel.** Os dois registros são deliberadamente burros: guardam
 * manifestos e devolvem manifestos. QUAIS widgets são residentes é política de produto — o kernel
 * não conhece o id `timeline` e não deve conhecer. A política mora com quem declara os destinos.
 *
 * ⚠️ **Não existe dispensa por app, e é decisão.** Um campo `semTimeline: true` no manifesto faria
 * a invariante valer só onde ninguém a testa, que é a forma como este tipo de portão morre. Tirar
 * um residente é editar ESTA tabela, num lugar só, com a frase do motivo — e a decisão vale para as
 * dez rotas de uma vez, que é exatamente o que "residente" significa.
 *
 * A prova está em `scripts/lei-residentes.mjs`: a declaração é única, o portão recusa por
 * perturbação, e nenhuma rota chega ao `registerApp` sem passar por aqui.
 */
import { registerApp } from '../kernel/registry.js';

/**
 * Os residentes, e a frase de por que cada um não pode sair da tela.
 *
 * A frase não é ornamento: ela é o que a recusa imprime quando um app esquece o widget, e é o
 * único lugar onde o motivo sobrevive à próxima pessoa que for enxugar uma lista de nove itens.
 */
export const RESIDENTES = Object.freeze({
  context:
    'o céu está visível em TODA rota e este painel fala do céu — e clicar num astro NAVEGA, ' +
    'então o gesto que trava a câmera era o mesmo que apagava o painel que ia descrever o astro travado',
  answer:
    'o compositor se pergunta de qualquer rota — se a resposta só tivesse onde aparecer em algumas, ' +
    'as outras executariam, pagariam e jogariam o texto no sótão. Sem resposta ele não desenha nada',
  'sky-time':
    'a janela temporal controla o CÉU, que está visível em toda rota — fora da tela ela fica ativa ' +
    'e sem controle, filtrando o corpus por uma data que ninguém vê',
  timeline:
    'o histórico do que aconteceu, e o host preserva o que continua declarado — ele atravessa a ' +
    'navegação sem remontar, então sair dele numa rota é PERDER a continuidade, não escondê-la',
});

/** Este widget é residente? Leitor de `RESIDENTES`. */
export const ehResidente = (id) => Object.hasOwn(RESIDENTES, id);

/** Os ids residentes, na ordem declarada. */
export const listarResidentes = () => Object.keys(RESIDENTES);

/**
 * Quais residentes faltam nesta lista de widgets — a medida que o portão usa.
 *
 * Lista ausente devolve TODOS, e não zero: "não declarei widget nenhum" não é uma vista sem
 * residentes, é uma vista que não decidiu nada.
 */
export const residentesAusentes = (widgets) =>
  listarResidentes().filter((id) => !(widgets ?? []).includes(id));

/** A recusa, com o nome do culpado e o motivo de cada residente que falta. */
function exigirResidentes(rotulo, widgets) {
  const faltando = residentesAusentes(widgets);
  if (!faltando.length) return;
  throw new Error(
    `${rotulo}: a lista de widgets não monta o conjunto residente — falta ${faltando.join(', ')}. ` +
      faltando.map((id) => `\`${id}\`: ${RESIDENTES[id]}`).join(' — ')
  );
}

/**
 * Declara um destino: o manifesto do `registerApp`, com os residentes exigidos ANTES do registro.
 *
 * A conferência vem primeiro de propósito — recusa que deixa resíduo no registro é meia recusa, e
 * um app metade registrado responde ao dígito do atalho para uma vista que não existe.
 *
 * @param {object} manifest  o manifesto de `registerApp` (`kernel/registry.js`)
 */
export function declararApp(manifest) {
  exigirResidentes(`app ${manifest?.id ?? '(sem id)'}`, manifest?.widgets);
  return registerApp(manifest);
}

/**
 * Declara uma VISTA sem app — hoje só a rota raiz, que não passa pelo registro de apps.
 *
 * Ela precisa do mesmo portão pelo mesmo motivo: é a décima rota, e a única que ficaria de fora
 * de uma guarda montada só no `registerApp`. Devolve a lista CONGELADA, porque uma vista mutável
 * depois do boot é o quinto dono de estado de tela que esta base já tem.
 *
 * @param {string} id        a rota (`ROUTE_ROOT`)
 * @param {string[]} widgets ids de widget, na ordem de montagem
 */
export function declararVista(id, widgets) {
  exigirResidentes(`vista ${id}`, widgets);
  return Object.freeze([...widgets]);
}
