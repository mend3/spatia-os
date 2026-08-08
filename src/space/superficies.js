/**
 * A tabela `classificar() → SUPERFÍCIE`. É o primeiro passo da FASE D, e ele não é um shader.
 *
 * ## Por que ela existe, em vez de reusar o `solver.js`
 *
 * As seis peles do céu já existem e foram validadas na bancada. O que faltava era **quem as
 * escolhe**: hoje é `solver.js`, a partir do `kind` — e `kind` é exatamente a taxonomia que a Fase B
 * refutou. Naquele caminho um `config` de 2 chunks desenha uma ESTRELA ao lado de um `doc` de 200
 * desenhado como PLANETA (`replanejamento-celeste.md` §2.1, a inversão nº 1).
 *
 * Ligar as peles da cena UNIVERSO pelo caminho velho seria o modelo antigo falando por cima do novo
 * — o mesmo defeito que `ce8ad95` consertou na HUD, quando a taxonomia velha anunciava GALÁXIA
 * sobre um agregado que a cena nova chama de SISTEMA.
 *
 * ## As duas leis que a tabela obedece
 *
 * 1. **A CLASSE decide o corpo; o FENÔMENO decide o que acontece com ele.** Um cometa não é uma
 *    classe: é um planeta com coma e cauda, porque houve trabalho recente (§2.3). Foi assim que a
 *    supernova já tinha sido corrigida — ela reprovou como classe justamente por excluir as outras.
 * 2. **`kind` perde o CORPO e mantém a COR** (§4 do replanejamento). Ele não aparece aqui.
 *
 * ⚠️ **Módulo PURO** — sem `three`, como o `entity-physics.js`. É isso que deixa o censo e o céu
 * usarem a MESMA derivação em vez de duas cópias que envelhecem em ritmos diferentes.
 *
 * ⚠️ Os valores têm de bater com `SURFACE` do `solver.js`, que é quem o renderer consulta. Eles são
 * strings iguais de propósito, e `scripts/censo-superficies.mjs` falha se alguma pele ficar sem
 * população — que é a outra metade da regra do catálogo: nomear o que a classe ACEITA, e provar que
 * existe quem a exerça.
 */

import { FAMILIA } from './entity-physics.js';

/** As peles que o céu sabe desenhar. Espelha `SURFACE` de `solver.js`. */
export const SUPERFICIE = Object.freeze({
  NENHUMA: 'none',
  FOTOSFERA: 'photosphere',
  PLANETA: 'planet',
  COMETA: 'comet',
  ESTACAO: 'station',
  PULSAR: 'pulsar',
  NEBULOSA: 'nebula',
});

/**
 * A pele de um corpo, decidida pela ontologia nova.
 *
 * @param {{familia:string, tipo:string, porte?:string}} classe  saída de `classificar()`
 * @param {{activity:number}} fisica  saída de `entityPhysics()`
 * @param {string[]} fenomenosAtivos  os `tipo` de `fenomenos()`
 * @returns {string} um valor de `SUPERFICIE`
 */
export function superficieDe(classe, fisica, fenomenosAtivos = []) {
  /*
   * ESTRUTURA não tem corpo. O catálogo já dizia isso — *"agregado não tem corpo; dar crosta a um
   * diretório afirmaria um objeto que não há"* — e a cena UNIVERSO nem desenha o agregado: ele é o
   * lugar onde o sistema mora, e a POSIÇÃO já o comunica.
   */
  /*
   * ⚠️ `FAMILIA.CORPO` importado, e não a string à mão: a primeira versão desta linha comparava com
   * `'corpo'` e o valor real é `'body'`. O censo acusou na hora — **as seis peles nascendo vazias e
   * 188 corpos sem superfície** —, e é exatamente para isso que ele roda ANTES do roteamento.
   * Escrito à mão, o literal seria uma segunda fonte da verdade livre para divergir em silêncio.
   */
  if (classe.familia !== FAMILIA.CORPO) return SUPERFICIE.NENHUMA;

  /*
   * ─────────────────────────── FENÔMENO antes de CLASSE, e só quando ele MUDA A PELE
   *
   * ⚠️ A ordem importa e ela não é hierarquia: é que dois destes fenômenos têm pele própria e os
   * outros são modificadores que se somam ao corpo (a supernova desenha casca, a anã branca é
   * massa parada — nenhum dos dois troca a superfície).
   *
   * **Atividade de cometa** é o caso que o §2.3 explica: coma e cauda existem *só perto do Sol* e
   * somem quando ele se afasta. Ela é ESTADO, e por isso vence a pele do corpo enquanto dura —
   * exatamente o oposto do modelo velho, em que todo `script` era cometa para sempre, inclusive com
   * churn zero.
   *
   * ⚠️ **Mas o limiar do FENÔMENO não é o limiar da PELE, e o censo obrigou a distinção.** O
   * fenômeno dispara com `activity > 0,08` — churn ≥ 1 em 30 dias — e mede "houve trabalho
   * recente", que é o que governa BRILHO. Medido no `espatial_vivo`, que é o próprio projeto em
   * desenvolvimento: **188 de 188 corpos (100%) o exercem.** Uma pele que todo o céu veste não
   * distingue nada — é a armadilha da classe vazia pelo avesso.
   *
   * A pele pede que a atividade DOMINE o corpo, não que exista: coma e cauda são o caso extremo,
   * não a norma. O corte é a SATURAÇÃO que a ontologia já tinha (`ATIVIDADE_CHEIA` = 12 toques),
   * então nenhuma constante nova nasce aqui. Medido: **15 corpos, 8,0% do céu** — a mesma ordem dos
   * 14% que o fenômeno tinha no corpus antigo.
   *
   * | corte | população |
   * |---|---|
   * | `> 0,08` (o do fenômeno) | 188 · **100%** |
   * | `≥ 0,50` | 38 · 20,2% |
   * | **`≥ 1,00` (saturada)** | **15 · 8,0%** |
   */
  const ativoAoExtremo = fenomenosAtivos.includes('atividade-de-cometa') && (fisica?.activity ?? 0) >= 1;

  switch (classe.tipo) {
    /*
     * ESTRELA é a entidade DOMINANTE do sistema, e fotosfera é a pele de quem brilha por luz
     * própria (§2.1). Aqui a dominância já garantiu que ela é a mais massiva — a inversão nº 1 é
     * impossível por construção, não por proibição.
     *
     * ⚠️ **E ela NÃO cede ao cometa, por mais ativa que esteja** — o censo pegou este erro meu:
     * sete estrelas viravam cometa por saturação. Estrela não tem coma nem cauda; ela não é um
     * corpo gelado se aproximando do Sol, ela É o Sol. A atividade dela já governa BRILHO
     * (`brilhoDe` no `universe.js`), que é o canal certo — dar-lhe cauda seria a mesma confusão de
     * eixos que a inversão nº 1: um estado desenhado como se fosse outra natureza.
     */
    case 'estrela':
      return SUPERFICIE.FOTOSFERA;
    /*
     * PLANETA e LUA compartilham a pele: os dois são corpos SÓLIDOS que refletem, e a diferença
     * entre eles é de massa — que já está no raio. Dar pele diferente à lua afirmaria uma diferença
     * de natureza onde há só de porte.
     */
    case 'planeta':
    case 'lua':
      return ativoAoExtremo ? SUPERFICIE.COMETA : SUPERFICIE.PLANETA;
    /*
     * ⚠️ ASTEROIDE só ganha pele quando está em atividade extrema — e aí ele é um COMETA, o que não
     * é licença poética: *"cometa que esgotou os voláteis é dormente e indistinguível de um
     * asteroide"* (§2.3). Os dois são o mesmo corpo em estados diferentes, e é a atividade que os
     * separa. Parado, ele fica sem pele, e isso é decisão: o catálogo define asteroide como corpo
     * pequeno e IRREGULAR, e nenhuma das seis peles desenha irregularidade — `planet.js` monta uma
     * esfera com crosta, que afirmaria um mundo onde há uma pedra.
     */
    case 'asteroide':
      return ativoAoExtremo ? SUPERFICIE.COMETA : SUPERFICIE.NENHUMA;
    default:
      return SUPERFICIE.NENHUMA;
  }
}

/**
 * As peles que a tabela NÃO usa hoje, com o motivo — a outra metade da REGRA DO CATÁLOGO.
 *
 * Declarar só o que se aceita não basta: quem ler a tabela e não achar `estacao` precisa saber se
 * foi decisão ou esquecimento. E as duas ausências aqui têm motivos de naturezas diferentes.
 */
export const AUSENTES_NA_TABELA = Object.freeze({
  station: 'a estação é objeto CONSTRUÍDO e representa um AGENTE (§8 do replanejamento: não tem '
    + 'análogo natural). A cena UNIVERSO desenha conhecimento, não agentes — ela volta quando o '
    + 'rótulo `Agent` do Neo4j tiver população, que hoje é 0',
  pulsar: 'pulsar é o que SOBRA de uma supernova (§2.7), e essa dependência não existe em código: '
    + 'hoje as duas feições saem de fatos independentes. Roteá-lo por regularidade repetiria o '
    + 'defeito de população zero que o `censo-corpus` já acusou',
  nebula: 'nebulosa é berço ou cadáver (§3.2), e nenhum dos dois é propriedade de UM corpo: berço é '
    + 'região de arquivos novos, cadáver é a casca que a supernova já desenha. Ela é feição de '
    + 'REGIÃO, e a cena ainda não tem esse nível',
});
