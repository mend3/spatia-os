/**
 * CATÁLOGO CELESTE — SSOT declarativo dos corpos do céu.
 *
 * Cada entrada diz o que um corpo É: de que fato do grafo ele nasce, que proporções tem, que
 * feições pode carregar e — o campo que mais vale — **quais NÃO pode**. Nada aqui desenha; este
 * arquivo é o modelo, e quem renderiza (`graph.js`, `rings.js`) o consome.
 *
 * ## Por que ele existe
 *
 * O céu chamava todo arquivo indexado de "estrela" e pendurava feições nele por fatos
 * independentes: sujo no git ganhava anel planetário, muito reescrito ganhava casca de
 * supernova. Como os dois fatos podem ser verdade ao mesmo tempo, **um mesmo corpo saía com anel
 * E casca** — duas afirmações de classes diferentes no mesmo objeto. Não é questão de gosto: uma
 * estrela que explodiu e um planeta com anel não são o mesmo tipo de coisa, e desenhar os dois
 * juntos não diz "as duas coisas", diz "nenhuma das duas".
 *
 * A correção estrutural é esta: um corpo resolve para **exatamente uma classe**, por prioridade
 * declarada, e a classe declara o que ela pode ter. Empilhamento vira erro de dados, não de
 * desenho.
 *
 * ## As duas regras que organizam o catálogo
 *
 * > **Massa decide a CLASSE. Composição decide o TIPO.**
 *
 * É por isso que a anã marrom não é estrela: composição idêntica, massa insuficiente (13 M_J
 * acendem deutério, 80 M_J acendem hidrogênio). Aqui `chunks` é a massa e `kind` é a composição
 * — e é por isso que a cor vem de `kind` e o tamanho de `chunks`, nunca o contrário.
 *
 * > **Estrela não tem anel planetário.** Tem disco de detritos.
 *
 * Corpos pequenos TÊM anel — Chariklo (ocultação de 03/06/2013), Haumea (2017), Quaoar (2022).
 * O que não tem é estrela: a pressão de radiação e o arrasto de Poynting–Robertson varrem o
 * material. Então a pergunta certa nunca foi "só planeta tem anel?" e sim "por que a ESTRELA
 * tinha?".
 *
 * ## Como ler uma entrada
 *
 * - `from` — o fato do grafo que produz a classe. Se for `null`, é a classe padrão.
 * - `priority` — quem vence quando mais de um fato é verdade. Maior ganha.
 * - `features` — o que a classe desenha. Ausente = não desenha.
 * - `forbids` — o que a classe NÃO pode ter, com o motivo. É documentação executável: o
 *   resolvedor confere, e um empilhamento acidental aparece como aviso em vez de virar imagem.
 * - `status` — `'rendered'` se já existe no céu, `'declared'` se está no modelo e ainda não foi
 *   desenhado. Nenhuma entrada mente sobre estar pronta.
 *
 * Pesquisa e fontes (IAU, Cassini/UVIS, Hyodo et al. 2024, 107P/Wilson–Harrington) em
 * `docs/catalogo-celeste.md`. O que virar código sai de lá e vira comentário aqui.
 */

/**
 * Piso de churn para um arquivo carregar a casca de supernova, na escala 0…1 normalizada pelo
 * corpus. Exportado porque quem aplica o modificador agora é o `solver.js`, não uma classe daqui.
 */
export const SUPERNOVA_FLOOR = 0.001;
/**
 * Toques na janela dormente (30–180d) para um arquivo contar como ponto quente ABANDONADO.
 *
 * 2, não 1: um toque isolado é ruído de manutenção — renomear uma variável, corrigir um typo — e
 * com o piso em 1 a classe abocanharia 47 dos 397 arquivos. Com 2 são 5, medidos em 2026-08-05.
 */
const DORMANT_FLOOR = 2;

export const CELESTIAL = [
  /*
   * SUPERNOVA SAIU DAQUI — virou ESTADO, e a mudança é a correção de uma contradição que a
   * própria entrada declarava.
   *
   * Ela dizia, com todas as letras, ser "estado DURÁVEL do repositório: diz 'este arquivo é um
   * ponto quente', não 'algo aconteceu agora'" — e mesmo assim era modelada como CLASSE. Como
   * classe é exclusiva, ela excluía as outras: não declarava `photosphere` e proibia `surface`,
   * então tirava do corpo as duas superfícies possíveis. Medido em 2026-08-05: 27 corpos, e
   * chegar perto de qualquer um deles mostrava um sprite e mais nada.
   *
   * Churn alto não muda o que um arquivo É. Um `config` muito reescrito continua sendo um
   * `config` — agora com uma casca em volta. Qualquer corpo pode explodir e continuar ele mesmo.
   *
   * O ENVOLTÓRIO NÃO SE PERDE: ele nunca foi desenhado por esta entrada. Sai do atributo
   * `aSupernova` do shader de pontos (`graph.js:406`), alimentado direto por `node.supernova` sem
   * consultar classe nenhuma. A entrada só suprimia o resto.
   *
   * Duas descobertas de desenho que ela carregava, preservadas porque custaram duas tentativas:
   * o remanescente tem de ser NEBULOSIDADE difusa, sem borda definida — qualquer coisa com
   * contorno nítido em volta do núcleo lê como anel, por mais irregular que seja, e anel é outra
   * classe. E ele não pisca: aqui supernova é estado, não evento, e piscar seria movimento sem
   * nada por trás. Os parâmetros medidos eram `{ inner: 0.34, outer: 1.0, gain: 0.55,
   * lobes: 0.22 }`; o núcleo herda a cor do nó, porque a cor carrega o TIPO de conhecimento.
   *
   * Quem decide o que coexiste com a casca agora é o `solver.js`.
   */

  {
    id: 'planeta-anelado',
    name: 'PLANETA COM ANEL',
    /*
     * ⚠️ Vence a supernova de propósito. Os dois fatos podem ser verdade no mesmo arquivo — e é
     * o caso mais comum, porque o arquivo que você está editando agora costuma ser o mesmo que
     * você mais editou no mês. Ganha o EVENTO EM ABERTO: ele é acionável agora e some sozinho no
     * commit, enquanto o churn continua lá amanhã. Perder o anel para mostrar a supernova seria
     * trocar o sinal perecível pelo permanente.
     */
    priority: 40,
    status: 'rendered',
    /*
     * Alteração não commitada no disco. É EVENTO, não estado: existe enquanto o trabalho está em
     * aberto e some no commit.
     */
    from: 'arquivo sujo no git (`/api/dirty`)',
    test: (node, facts) => Boolean(facts.dirty),
    features: {
      /*
       * Família por estado do git. Não é decoração: as três têm assinaturas fotométricas opostas
       * e é isso que as distingue de longe, mais do que a cor.
       */
      ring: {
        modified: { family: 'saturn', reach: 2.45, scatter: 'retro' },
        staged: { family: 'uranus', reach: 2.2, scatter: 'retro' },
        untracked: { family: 'jupiter', reach: 3.2, scatter: 'forward' },
      },
      span: 'min(reach, 2.4) raios do astro — o teto existe porque a câmera fica dentro da casca',
      spin: 'kepleriano, ω ∝ r^-1.5: a borda interna gira mais rápido que a externa',
      /*
       * SUPERFÍCIE PROCEDURAL — o nível de PERTO deste corpo, em `space/planet.js`.
       *
       * Ela mora aqui e não na estrela porque a estrela não tem superfície para ter: relevo,
       * linha de costa e atmosfera afirmam crosta, e crosta é o que separa as duas classes. É a
       * mesma disciplina que separou anel de envoltório — a feição pertence a UMA classe.
       *
       * As duas regras do catálogo governam o que se vê: `chunks` (a massa) decide relevo, mar e
       * se o corpo retém atmosfera; `kind` (a composição) decide a paleta, derivada da mesma
       * `KIND_COLORS` que pinta o ponto — um ponto verde não pode virar um mundo azul quando a
       * câmera chega perto.
       *
       * ⚠️ Custo: 460 malhas com ruído por fragmento não cabem nos 0,45 ms medidos da cena. Ela
       * existe por NÍVEL DE DETALHE, como a rocha do anel: nasce só acima de 90px de raio na
       * tela, que é a marca em que a câmera está travada num astro.
       *
       * ⚠️ Estado real: desenhada na BANCADA (`sandbox.html`, espécime `planeta`). O céu ainda
       * não a chama — falta `scene.js` instanciar o `createPlanet` no nó de `focusNode`.
       */
      surface: 'planeta procedural por semente do caminho; só acima de 90px de raio na tela',
    },
    forbids: {
      envelope: 'anel e envoltório à volta do mesmo núcleo é o empilhamento que criou o catálogo',
    },
  },

  {
    id: 'cometa-extinto',
    name: 'COMETA EXTINTO',
    priority: 25,
    /*
     * `partial`: a SUPERFÍCIE já desenha (a classe permite `surface`, e `planet.js` a monta como
     * em qualquer corpo sólido). A CAUDA continua só declarada — nenhuma geometria a desenha.
     */
    status: 'partial',
    /*
     * O sinal de maior valor operacional do catálogo: **ponto quente ABANDONADO**. Um arquivo que
     * foi muito trabalhado e esfriou.
     *
     * O análogo é documentado: 107P/Wilson–Harrington foi descoberto como cometa COM CAUDA em
     * 19/11/1949, redescoberto como asteroide em 1979, e só em 1992 confirmou-se que eram o mesmo
     * objeto. Cometas da família de Júpiter ficam ativos ~10.000 anos e depois selam a superfície
     * com uma crosta refratária.
     *
     * Custo: um `if` a mais na passada de `git log` que o servidor já faz — a mesma de onde saiu
     * o churn atual. Falta uma SEGUNDA janela (ex.: 30–180 dias) em `server/recency.py`.
     */
    from: 'churn na janela ANTIGA (30–180d) sem nenhum toque nos últimos 30d (`node.dormant`)',
    /*
     * A recência baixa NÃO é um terceiro teste, é consequência: zero toques em 30 dias já obriga
     * o último commit a ser antigo. Medido nos candidatos deste corpus — recência entre 0,15 e
     * 0,24, todos na periferia. Um limiar de recência aqui seria um botão sem evidência.
     *
     * ⚠️ O PISO É MODESTO PORQUE O CORPUS É JOVEM, e vale registrar a medida que o contradiz: o
     * documento aposta neste como o melhor sinal do lote, mas em 2026-08-05 só 5 arquivos têm 2+
     * toques dormentes e nenhum recente. Os de churn dormente ALTO (29, 22, 20) continuam sendo
     * mexidos — logo são supernova, não cometa. O sinal é fino hoje e engorda conforme o
     * repositório envelhece; o campo passa a ser coletado agora justamente por isso.
     */
    test: (node) => node.type === 'file' && (node.dormant || 0) >= DORMANT_FLOOR && !node.churn,
    features: {
      tail: 'cauda apontando para FORA do núcleo, comprimento pela recência perdida',
      /*
       * A crosta refratária do documento é literalmente uma superfície: é ela que sela o corpo
       * e encerra a atividade. O mesmo `space/planet.js` serve — a massa baixa já produz sozinha
       * o corpo cristado e sem atmosfera, que é a aparência certa para um núcleo esgotado.
       */
      surface: 'a mesma de `planeta-anelado`; massa baixa dá o corpo irregular e sem ar',
    },
    forbids: { ring: 'corpo pequeno pode ter anel, mas cauda e anel juntos não descrevem nada' },
  },

  {
    id: 'lua',
    name: 'LUA',
    priority: 15,
    status: 'declared',
    /*
     * `sections` chega no payload da topologia e é descartado hoje (~23% do payload sem
     * consumidor). Cada seção seria uma lua do arquivo.
     *
     * A regra correta é a ESFERA DE HILL, não o limite de Roche: `r_H = a(1−e)·∛(m/3M)`. O termo
     * que importa é o `a` — a esfera de Hill de Netuno (115 milhões de km) é MAIOR que a de
     * Júpiter (50,6 milhões) apesar de muito menos massa, porque a dependência no raio orbital é
     * linear e a da massa é raiz cúbica. Como raio já é recência nesta cena, um arquivo antigo
     * seguraria suas seções em órbitas mais largas que um arquivo novo e pesado — sai de graça e
     * é fisicamente correto.
     */
    from: '`node.sections` (já vem no payload, sem consumidor)',
    test: () => false,
    features: {
      orbit: 'raio pela esfera de Hill do pai; travada por maré, sem rotação própria',
      surface: 'a mesma de `planeta-anelado`, com `spin: 0` — lua é corpo rochoso como o pai',
    },
    forbids: {
      spin: 'todas as 19 luas arredondadas do Sistema Solar estão travadas por maré',
      moon: 'nenhum satélite de satélite foi observado em lugar nenhum',
    },
  },

  {
    id: 'galaxia',
    name: 'GALÁXIA',
    priority: 10,
    status: 'partial',
    /*
     * O repositório é a galáxia e os arquivos orbitam nela — a leitura que o usuário propôs. Os
     * hubs por diretório já existem no céu; o que falta é o `git_root` (submódulo) virar galáxia
     * SATÉLITE, com sistema próprio.
     *
     * ⚠️ As arestas atuais são literalmente o problema do enrolamento: o `LineSegments` liga cada
     * arquivo (r≈26–62) ao hub (r≈19–33) e os dois têm ω diferente por `speed = (r/r₀)^-1.5`.
     * Braço espiral não pode ser estrutura material justamente por isso (Lin–Shu) — se a leitura
     * pretendida é "grupo co-móvel", a aresta tem de ser PADRÃO (mesma fase, mesma cor), não
     * segmento permanente.
     */
    from: '`node.type !== "file"` (repo, diretório) e, futuramente, `git_root`',
    test: (node) => node.type !== 'file',
    features: { aggregate: 'tamanho pela soma dos filhos; sem janela temporal própria' },
    forbids: {
      supernova: 'agregado não tem história própria, tem a dos filhos',
      recency: 'diretório não tem UMA data; atenuá-lo por data inventada afirmaria idade falsa',
      surface: 'agregado não tem corpo; dar crosta a um diretório afirmaria um objeto que não há',
    },
  },

  {
    id: 'estrela',
    name: 'ESTRELA',
    priority: 0,
    status: 'rendered',
    /** A classe padrão: arquivo indexado, sem nenhum fato extra. */
    from: null,
    test: () => true,
    features: {
      core: 'sprite emissivo; raio por log2(chunks), cor por kind, órbita por recência',
      corona: 'só em nó aceso pela busca — evento, e ele passa',
      /*
       * A superfície que a estrela realmente tem, e ela é o oposto do planeta num ponto que
       * decide o shader: NÃO HÁ TERMINADOR. Estrela é emissiva, não iluminada de fora — o
       * volume vem do escurecimento de limbo (`I(μ)/I₀ = 1 − u(1 − μ)`, u ≈ 0,6 no visível),
       * que é a feição mais reconhecível de um disco estelar.
       *
       * Proibir crosta e não dar NADA no lugar deixava 371 dos 459 corpos sem o que revelar no
       * zoom. A resposta fiel nunca foi afrouxar a proibição — era esta entrada.
       */
      photosphere: 'granulação que ferve, escurecimento de limbo, manchas frias e fáculas no limbo',
    },
    forbids: {
      ring: 'estrela tem DISCO DE DETRITOS, não anel: radiação e Poynting–Robertson varrem',
      /*
       * ⚠️ Este é o `forbids` que mais vai ser testado, porque a classe padrão é a que cobre
       * quase todo o corpus — e a tentação de dar um planeta bonito a todo arquivo é grande.
       *
       * Estrela não tem crosta: tem fotosfera, que é gás opaco. Relevo, linha de costa e
       * atmosfera afirmam corpo sólido, e afirmar isso de uma estrela é a MESMA classe de erro
       * que pendurar anel nela — a que originou este arquivo. O nível de perto certo para uma
       * estrela é granulação convectiva e escurecimento de limbo, que é outro shader e outra
       * feição; enquanto ele não existir, a estrela continua sendo um ponto de perto também.
       */
      surface: 'estrela tem FOTOSFERA, não crosta: relevo e mar afirmariam corpo sólido — mas ela TEM fotosfera, ver `features.photosphere`',
    },
  },
];

const BY_PRIORITY = [...CELESTIAL].sort((a, b) => b.priority - a.priority);

/**
 * A que classe este nó pertence, AGORA.
 *
 * Sempre devolve exatamente uma — é essa unicidade que impede o empilhamento. `facts` traz o que
 * não está no nó (hoje, `dirty`), porque estado local do disco muda sem a topologia recarregar.
 *
 * @param {object} node   nó da topologia
 * @param {{dirty?: string|null}} [facts]
 * @returns {object} a entrada do catálogo
 */
export function classify(node, facts = {}) {
  return BY_PRIORITY.find((entry) => entry.test(node, facts)) ?? BY_PRIORITY[BY_PRIORITY.length - 1];
}

/** A classe deste nó pode carregar esta feição? Consulta o `forbids` declarado. */
export const allows = (entry, feature) => !(entry.forbids && feature in entry.forbids);
