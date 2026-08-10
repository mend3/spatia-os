/**
 * A ÚLTIMA LEITURA DE `/api/health`, e quem a quiser LÊ daqui.
 *
 * ## Por que existe um dono
 *
 * `/api/health` é uma AFERIÇÃO: a resposta vale para o instante em que chegou, e um segundo
 * pollster produz duas verdades sobre o mesmo servidor com idades diferentes. Um painel mostrando
 * uma leitura de 2 s ao lado de um cabeçalho anunciando idade de 28 s são dois fatos corretos que
 * se contradizem na tela — e nada os reconcilia, porque nenhum dos dois sabe do outro.
 *
 * ⚠️ **Não é `core/state.js`**: aquele estado é função do stream de eventos, e o contrato dele é
 * *"ninguém escreve aqui direto"*. Health chega por HTTP, não por evento.
 *
 * ⚠️ **E não é o barramento**: `lei-afericao.mjs` §11 proíbe o laço de emitir — um evento por volta
 * é a mesma frase a cada 30 s, que é o que ensina o operador a não ler a tela. Assinar aqui é
 * dirigido a quem pediu.
 *
 * ## Quem escreve
 *
 * Só quem AFERIU. É a mesma regra de `frame.applyHealth`, e pelo mesmo motivo: publicar a leitura
 * velha depois de uma falha carimbaria uma aferição que não aconteceu.
 */

let ultima = null;
let aferidoEm = null;
const ouvintes = new Set();

/** A leitura corrente e QUANDO ela chegou. `null` em ambos antes da primeira aferição. */
export const snapshot = () => ({ saude: ultima, aferidoEm });

/** Publica uma leitura que ACONTECEU. Nunca chamar num `catch`. */
export function publicar(saude) {
  ultima = saude;
  aferidoEm = Date.now();
  for (const fn of [...ouvintes]) fn(ultima);
}

/**
 * Assina a próxima aferição. Devolve o cancelamento.
 *
 * ⚠️ Quem assina numa montagem SOLTA na destruição: ouvinte de painel destruído repinta um DOM
 * fora da árvore, sem erro e sem sintoma.
 */
export function aoAferir(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}
