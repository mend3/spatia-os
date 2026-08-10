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
 * ⚠️ `scripts/censo-superficies.mjs` falha se alguma pele ficar sem população — a outra metade da
 * REGRA DO CATÁLOGO: nomear o que a classe ACEITA, e provar que existe quem a exerça.
 */

import { FAMILIA } from './entity-physics.js';

/**
 * As peles que o céu sabe desenhar — **e este é o único vocabulário de pele do `src/`**.
 *
 * ☠️ **Havia dois, com nomes diferentes e a mesma grandeza:** este e o `SURFACE` do `solver.js`.
 * Os valores eram strings iguais *de propósito*, com um comentário de cada lado mandando o outro
 * bater — que é uma cópia com portão no lugar de uma fonte. Dois nomes para uma grandeza é como o
 * modelo velho fala por cima do novo sem que nada acuse: quem editasse um lado só teria o céu
 * roteando por uma tabela e a HUD nomeando pela outra, em silêncio.
 *
 * ⚠️ **Elas não eram alias — as chaves DIVERGIAM.** `SURFACE` tinha `GALAXY`, e esta tabela não o
 * roteia. E não é omissão: **agregado não tem pele.** `superficieDe` devolve `NENHUMA` para tudo
 * que não é `FAMILIA.CORPO`, e a galáxia da cena AGENTE nunca saiu de uma decisão de pele — ela é
 * um campo INSTANCIADO sobre os hubs (`scene.js` filtra `type === 'dir' || 'repo'` e chama
 * `galaxyParams`, sem passar pelo solver). `GALAXY` tinha produtor e **zero leitores**: era um
 * valor que nenhuma cena consultava.
 *
 * ⚠️ **E existe HOMÔNIMO vivo, que não é este vocabulário:** os `allowed` de `motion-catalog.js`
 * repetem estas strings como ATORES de animação (`file`, `moon`, `ring` e `ignition` estão na mesma
 * lista). Mesma string, grandeza diferente — ver `docs/identidade.md`, e **nunca varra por `sed`**.
 */
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
 * COMO SE CHAMA, NA TELA, cada pele — e este é o rótulo que o painel tem de dizer.
 *
 * ⚠️ **Ele mora aqui porque o painel não pode ter uma segunda derivação.** O rótulo saía de
 * `classificar().tipo`, que responde a CLASSE; a pele sai de `superficieDe()`, que responde o que
 * é DESENHADO. As duas são vocabulários legítimos e diferentes, e quando divergem o usuário lê uma
 * coisa e vê outra: um corpo de classe `planeta` com `atividade-de-cometa` desenha cometa e o
 * painel anunciava PLANETA. Reportado da tela — e é a TERCEIRA ocorrência desta forma (as duas
 * anteriores estão no comentário de `apps/context.js`, cada uma consertada como caso particular).
 *
 * Derivar do mesmo lugar é o que impede a quarta: quem acrescentar pele acrescenta o nome aqui, na
 * linha de cima, e o painel passa a dizê-lo sem que ninguém edite a HUD.
 *
 * `NENHUMA` não tem nome de propósito: ali não há corpo desenhado, e quem chama cai na CLASSE — que
 * naquele caso é a resposta certa, porque é ela que decide o que a tela mostra.
 */
export const NOME_DA_SUPERFICIE = Object.freeze({
  [SUPERFICIE.FOTOSFERA]: 'ESTRELA',
  [SUPERFICIE.PLANETA]: 'PLANETA',
  [SUPERFICIE.COMETA]: 'COMETA',
  [SUPERFICIE.ESTACAO]: 'ESTAÇÃO',
  [SUPERFICIE.PULSAR]: 'PULSAR',
  [SUPERFICIE.NEBULOSA]: 'NEBULOSA',
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
      /*
       * ⚠️ **UMA ESTRELA MORTA NÃO TEM FOTOSFERA.** O §2.7.1 fecha a pendência que o §2.7 abriu: a
       * dependência do pulsar era MASSA, não tempo. Quem responde é `remanescente()`, e ele já
       * distinguiu — `colapso` é o cadáver de um GIGANTE, `ana-branca` é o de todos os outros.
       * Os dois nunca convivem, por construção: um corpo tem UM cadáver.
       */
      if (fenomenosAtivos.includes('colapso')) return SUPERFICIE.PULSAR;
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
 *
 * ⭑ **`pulsar` SAIU desta lista em 2026-08-08.** Ele estava aqui porque *"pulsar é o que sobra de
 * uma supernova, e essa dependência não existe em código"*. O §2.7.1 do `replanejamento-celeste.md`
 * a resolveu: a dependência era MASSA, não tempo — supernova e estrela de nêutrons são duas
 * consequências da mesma causa. Hoje ele é roteado pelo fenômeno `colapso`, e tem população.
 *
 * ☠️ **AS DUAS AUSÊNCIAS RESTANTES ESTAVAM ESCRITAS COMO CONDIÇÕES QUE NÃO PORTEIAM NADA** —
 * medido em 2026-08-09, e as duas pelo mesmo mecanismo. Cada uma nomeava um fato que, ao virar
 * verdade, **continuaria não produzindo a pele**, porque o que falta não é o fato: é o CAMINHO.
 * É a REGRA DO CATÁLOGO pelo avesso — declarar a condição não a implementa, e uma condição falsa
 * é pior que nenhuma, porque manda a próxima pessoa medir a coisa errada com convicção total.
 * A `station` já mandou: o rótulo tem população desde antes de alguém ir olhar.
 */
export const AUSENTES_NA_TABELA = Object.freeze({
  /*
   * ⚠️ **O PORTÃO ANTIGO DIZIA *"quando o rótulo `Agent` do Neo4j tiver população, que hoje é 0"* —
   * e a população NÃO é 0.** Medido em 2026-08-09 contra o banco: `Agent` existe com **1 nó**
   * (`id: "claude"`, `brain: "claude"`), com 11 `RAN` para `Run` e 8 `Astro` do fixture `TOUCHED`.
   * A condição escrita está SATISFEITA há tempo, e nenhuma estação nasceu — porque ela nunca foi
   * o portão.
   *
   * **O portão real é TOPOLÓGICO, e a lei nº 2 do Neo4j o fecha por construção.** O banco só
   * chega ao céu como OVERLAY, e o overlay casa por `node["source"]` (`annotate_usage`,
   * `annotate_influence` e `annotate_connectivity` em `server/graphdb.py`, reaplicados por
   * `_reanexar_snapshots`). Um overlay MODIFICA corpo que já existe; ele nunca cria um. E o nó
   * `Agent` tem as chaves `[group_id, id, brain]` — **`source` não está entre elas**, então não há
   * sequer a que corpo se prender. Somar mil agentes ao rótulo não move este número.
   *
   * ⚠️ **E a rota tentadora é a taxonomia refutada.** O fixture tem 5 nós com `kind: "agent"`
   * (`revisor.md`, `varredura.md`, os três `farol-*.md`) e é por eles que a estação voltaria fácil
   * — que é exatamente a linha `agent → estação · 414` da inversão nº 1 (§2.1). Além de proibida,
   * ela classificaria o ARQUIVO QUE DESCREVE o agente, não o agente: `farol-intenso.md` resolve
   * hoje como COMETA, por churn 27.
   *
   * **O que teria de ser verdade:** um agente entra na TOPOLOGIA como corpo — com `source`,
   * sistema onde morar e as grandezas que `entityPhysics()` lê — vindo de um produtor que não é o
   * Qdrant (o diário, via `journal`/`uso.mjs`, é o candidato: é lá que a identidade já é FATO).
   * E `classificar()` ganha família para objeto CONSTRUÍDO, que o catálogo hoje não nomeia. É
   * outro pipeline, não outro limiar — e enquanto ele não existir, a ausência é estrutural.
   */
  station:
    'a estação é objeto CONSTRUÍDO e representa um AGENTE (§8 do replanejamento: não tem ' +
    'análogo natural). A cena UNIVERSO desenha conhecimento, e agente não é corpo do corpus: o ' +
    'rótulo `Agent` do Neo4j TEM população (1 em 2026-08-09) e não basta, porque o Neo4j só ' +
    'anota corpo existente por `source` — ele nunca cria um. Falta um produtor que ponha o ' +
    'agente na topologia, e família de objeto construído em `classificar()`',
  /*
   * ⚠️ **O PORTÃO ANTIGO DIZIA *"a cena ainda não tem esse nível"*, e o "ainda" é a parte falsa.**
   * Ele se lê como fila — como se o nível estivesse a um commit de distância. Medido em
   * 2026-08-09, ele está a uma CONTRADIÇÃO de distância, e a nebulosa é meia pendência, não uma:
   *
   * **O cadáver já está desenhado.** A casca expelida é a `supernova`, que é modificador e tem
   * população (3 de 71 no fixture). Metade da nebulosa nunca esteve em falta.
   *
   * **O berço é que não fecha.** Ele é *"região de arquivos novos/não rastreados"* (§3.2), e a
   * região teria de ser um fato de CONTENÇÃO entre sistema e corpo. Não existe:
   *
   * - **os arquivos novos não se agrupam.** Fixture: 7 `untracked` espalhados por 6 sistemas,
   *   **nunca mais de 1 por sistema** — a maior fração é um sistema de UM arquivo, que é o
   *   próprio caso aberto do agregado ausente, não um berço.
   * - **o aninhamento de diretórios é um nível ACIMA, não abaixo** — e ele não se separa. Medido
   *   nos dois corpora: **todo** pai de aninhamento é também um sistema com corpos próprios
   *   (vivo 3 de 3: `src` 7 filhos + 1 arquivo, `espatial-os` 6 + 6, `docs` 1 + 11; fixture 2 de
   *   2). Promover um deles a região tiraria a estrela de um sistema que a tem.
   * - **o que sobra agrupa por RELAÇÃO** (`CO_EDITED`, `SIMILAR_TO`, `ABOUT`), e desenhar relação
   *   como POSIÇÃO desfaz a separação contenção × relacionamento do §9.1 — o maior ganho do
   *   briefing, e o que matou as linhas atravessando a cena.
   *
   * Então o berço não espera um nível: ele espera que um dos três deixe de ser verdade. Enquanto
   * os três valerem, a ausência é decisão, e a nebulosa segue viva SÓ na bancada.
   */
  nebula:
    'nebulosa é berço ou cadáver (§3.2), e os dois têm desfechos diferentes: o CADÁVER já é ' +
    'desenhado (a casca da `supernova`, 3 de 71 no fixture) e nunca esteve em falta. O BERÇO é ' +
    'região de arquivos novos, e região exige contenção entre sistema e corpo — medido, ela não ' +
    'existe: os novos não se agrupam (máx 1 por sistema), o aninhamento de dir é nível ACIMA e ' +
    'nenhum pai se separa do próprio sistema, e o resto agrupa por RELAÇÃO, que o §9.1 proíbe ' +
    'desenhar como posição',
});
