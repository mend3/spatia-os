/**
 * Regras sobre o corpus indexado que mais de uma camada precisa aplicar.
 *
 * Existe por causa de uma divergência concreta: a cena filtra os nós que entram no céu, e o
 * scrubber conta os nós do céu para escrever "n/N arquivos". Com a regra duplicada, o rótulo
 * dizia 397 enquanto a cena desenhava 388 — e uma divergência de 9 na tela lê como desconfiança
 * na interface, não como bug no código.
 *
 * Fica em `core/` para que nem a HUD importe de `space/` nem o contrário: as duas dependem da
 * regra, e nenhuma das duas é dona dela.
 */

/**
 * Este nó entra no céu?
 *
 * `lock` fica fora: são arquivos de centenas de chunks e zero conhecimento — dominariam o campo
 * visual com peso que não corresponde a valor.
 */
export const isSkyNode = (node) => node.kind !== 'lock';
