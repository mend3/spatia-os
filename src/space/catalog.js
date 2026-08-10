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

/**
 * Regularidade mínima para um arquivo ser PULSAR — `1 - CV` dos intervalos entre commits.
 *
 * ⚠️ MEDIDO na distribuição do corpus real, não escolhido: dos ~6.400 caminhos versionados do
 * workspace, 287 têm regularidade acima de zero, e a massa deles está ABAIXO de 0,5 —
 *
 *     >= 0,3 → 110 arquivos     >= 0,5 →  27
 *     >= 0,4 →  67 arquivos     >= 0,6 →  17     >= 0,7 → 7
 *
 * O salto está entre 0,4 (67) e 0,5 (27): abaixo do corte a contagem mais que dobra. O limiar cai
 * num AFINAMENTO da distribuição, não na parte densa dela — que é exatamente o defeito que o
 * portão do quasar tinha (bojos `51·51·49·45` em volta do corte de 50, mudando de resposta a cada
 * commit no corpus).
 *
 * E ele tem leitura física: `CV <= 0,5` é **no máximo metade da dispersão relativa de um processo
 * de Poisson**. Não é "regular o bastante para ficar bonito" — é duas vezes mais regular que o
 * acaso.
 *
 * Conferido no corpus de teste, que traz as três cadências de propósito: metrônomo (intervalos
 * idênticos) 1,0000 · jitter de ±15% 0,8974 · rajada REJEITADA (CV > 1, ausente da tabela). A
 * rajada é o controle NEGATIVO, e é o padrão humano típico de commit.
 */
export const PULSAR_REGULARITY_FLOOR = 0.5;

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

  /*
   * ⚠️ `planeta-anelado` SAIU DAQUI — o ANEL virou MODIFICADOR, como a supernova já era.
   *
   * Era uma CLASSE de prioridade 40, e como classe é exclusiva ela SEQUESTRAVA o corpo: todo
   * arquivo sujo virava um planeta, qualquer que fosse a morfologia dele. Medido no corpus de
   * teste: dos 17 arquivos sujos, só 7 eram planetas — os outros 10 eram 2 cometas, 2 estações,
   * 2 nebulosas, 2 fotosferas e 2 estrelas, todos redesenhados como planeta anelado.
   *
   * É o MESMO erro que esta seção já corrigiu na supernova, com as mesmas palavras: "churn alto
   * não muda o que um arquivo É". Editar um arquivo também não. Um cometa sujo é um cometa que
   * está sendo editado, não um planeta.
   *
   * O anel é objeto SEPARADO e ANEXÁVEL — quem o desenha nunca precisou de classe: `rings.js` é
   * um módulo próprio, e o que ele pendura num corpo é uma feição, não uma identidade. A tabela
   * de famílias por estado do git virou `RING_BY_STATE`, logo abaixo, e quem pode HOSPEDAR um
   * anel está declarado em `MORPHOLOGY_BY_KIND`. O conflito anel × envoltório continua valendo e
   * agora é resolvido entre dois modificadores, no `solver.js`, que é onde ele sempre pertenceu.
   */

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
      surface: 'a mesma do planeta; massa baixa dá o corpo irregular e sem ar',
    },
    forbids: { ring: 'corpo pequeno pode ter anel, mas cauda e anel juntos não descrevem nada' },
  },

  {
    id: 'pulsar',
    name: 'PULSAR',
    priority: 20,
    status: 'rendered',
    /*
     * ⚠️ O PULSAR SAIU DE `kind` E VEIO PARA O RITMO — 2026-08-06.
     *
     * Ele era `kind === 'infra'`, e a pesquisa do catálogo derruba isso numa frase: *galáxia,
     * quasar e pulsar se distinguem pelo que FAZEM, não pelo que são feitos*. Um `.tf` não pulsa.
     * O que faz um pulsar ser reconhecível não é do que ele é feito — é que os pulsos chegam em
     * INTERVALO REGULAR, e esse é o único corpo deste céu com definição temporal.
     *
     * O fato é `node.regularity`, escrito por `server/recency.py`: `1 - CV` dos intervalos entre
     * commits, onde CV é o coeficiente de variação. A âncora não é escolhida — para um processo
     * de Poisson (eventos totalmente aleatórios) o CV vale 1, então o número é literalmente
     * "quanto mais regular que o acaso este arquivo é".
     */
    from: 'ritmo REGULAR de commits (`node.regularity`, de `server/recency.py`)',
    test: (node) => node?.type === 'file' && (node.regularity || 0) >= PULSAR_REGULARITY_FLOOR,
    features: {
      /*
       * A CLASSE declara o corpo, e é isso que a diferencia das outras: aqui o corpo não vem da
       * morfologia por `kind`. Um scheduler pode ser `.sh`, `.yaml` ou `.ts` — o que o torna
       * pulsar é o ritmo, não a extensão.
       */
      body: 'pulsar',
      beam: 'feixe pelos polos magnéticos; o pulso é o feixe cruzando a linha de visada',
      period: 'o intervalo MÉDIO entre commits — o que o objeto afirma é a regularidade dele',
    },
    forbids: {
      /*
       * Estrela de nêutrons tem ~20 km. Crosta, costa e atmosfera afirmariam um corpo planetário
       * onde há matéria degenerada — e é a mesma recusa que a fotosfera já leva.
       */
      surface: 'estrela de nêutrons não tem crosta a desenhar: são 20 km de matéria degenerada',
    },
  },

  {
    id: 'lua',
    name: 'LUA',
    priority: 15,
    status: 'applied',
    /*
     * Cada seção de um arquivo é uma lua dele — quando a massa do arquivo consegue segurá-la. A
     * regra inteira está em `orbital-zones.js`, junto com a medida que escolheu cada constante;
     * aqui fica só o que a classe é.
     *
     * A fronteira é a ESFERA DE HILL por fora e o limite de ROCHE por dentro: `r_H = a(1−e)·∛(m/3M)`.
     * O termo que importa é o `a` — a esfera de Hill de Netuno (115 milhões de km) é MAIOR que a de
     * Júpiter (50,6 milhões) apesar de muito menos massa, porque a dependência no raio orbital é
     * linear e a da massa é raiz cúbica. Como raio já é recência nesta cena, arquivo antigo segura
     * suas seções em órbita e arquivo recente não.
     *
     * ⚠️ MEDIDO em 2026-08-05, e é mais forte que a previsão: na razão Hill/Roche o `m^(1/3)`
     * CANCELA, então quem decide não é a massa — é só o `a`. O corte cai em `a = 44`, o meio exato
     * da casca dos arquivos: a metade mais antiga do céu tem lua, a mais nova não. 23 corpos, 182
     * luas neste corpus.
     *
     * A lua não vem do servidor: ela é sintetizada em `graph.js:load` a partir de `sections`, que
     * já chegava no payload e era descartado (~23% dele sem consumidor).
     */
    from: '`node.sections`, filtrado pela janela Roche→Hill de `orbital-zones.js`',
    test: (node) => node.type === 'moon',
    features: {
      orbit: 'raio pela esfera de Hill do pai; travada por maré, sem rotação própria',
    },
    forbids: {
      spin: 'todas as 19 luas arredondadas do Sistema Solar estão travadas por maré',
      moon: 'nenhum satélite de satélite foi observado em lugar nenhum',
      /*
       * ⚠️ Isto era `features.surface: 'nenhuma — …'` e NÃO era obedecido.
       *
       * `allows()` consulta `forbids`, não `features` — então a frase "a lua é ponto e não há
       * superfície a resolver" estava escrita e o solver liberava superfície assim mesmo. É a mesma
       * classe de defeito do slider `edgeOpacity`, que dizia governar o vínculo e nada o lia: a
       * declaração existia, a aplicação não. Declarar uma invariante não a implementa.
       */
      surface: 'a lua é ponto — a 1–5% do raio do pai não há superfície a resolver',
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
    from: '`node.type` em (`repo`, `dir`) e, futuramente, `git_root`',
    /*
     * ⚠️ Era `node.type !== 'file'` — classificação por EXCLUSÃO, e ela já mordeu uma vez.
     *
     * A lua escapava só porque a classe `lua` tem prioridade maior; qualquer tipo de nó novo caía
     * aqui em silêncio e virava galáxia. O solver tinha o mesmo teste e o consertou primeiro
     * (a lua em foco resolvia como GALÁXIA); esta é a outra metade do mesmo defeito, no lugar onde
     * a CLASSE é decidida.
     *
     * Nomear os dois tipos faz o tipo novo nascer FORA daqui, que é o comportamento certo: ele cai
     * no `desconhecido` abaixo e a tela diz que não sabe, em vez de afirmar um continente.
     */
    test: (node) => node.type === 'repo' || node.type === 'dir',
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
    /** A classe padrão: ARQUIVO indexado, sem nenhum fato extra. */
    from: null,
    /*
     * ⚠️ Era `() => true` — pega-tudo, e com o `galaxia` deixando de classificar por exclusão isso
     * passaria a varrer todo tipo de nó novo para cá. Um tipo que não é arquivo desenhado como
     * estrela é a mesma mentira que a galáxia era, com outro corpo.
     *
     * O pega-tudo agora é `desconhecido`, logo abaixo, e ele não desenha nada — o que é o certo:
     * a tela não sabe o que é aquilo, e dizer isso é mais barato que inventar.
     */
    test: (node) => node?.type === 'file',
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
      /*
       * ⚠️ O `ring` SAIU DAQUI, e o motivo é que ele estava no nível errado.
       *
       * A frase continua verdadeira — estrela tem disco de detritos, não anel — mas ela é sobre
       * o CORPO, e esta é a classe PADRÃO: ela cobre quase todo o corpus, inclusive os arquivos
       * cuja morfologia é PLANETA. Enquanto o anel era classe isso nunca aparecia, porque um
       * arquivo sujo virava `planeta-anelado` e jamais caía aqui. Assim que o anel virou
       * modificador, este `forbids` passou a recusar TODOS os anéis do céu — medido: 17 sujos,
       * 0 anéis.
       *
       * A regra tem um dono só agora, e é `RING_HOST`, indexado por CORPO. Duas cópias da mesma
       * proibição em níveis diferentes é exatamente o defeito que este catálogo existe para
       * impedir.
       */
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
      surface:
        'estrela tem FOTOSFERA, não crosta: relevo e mar afirmariam corpo sólido — mas ela TEM fotosfera, ver `features.photosphere`',
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
/**
 * O PEGA-TUDO, e ele existe para não desenhar nada.
 *
 * Toda outra classe agora nomeia os tipos que aceita, em vez de excluir os que não aceita — a
 * classificação por exclusão já produziu dois defeitos (lua virando galáxia no solver, e a mesma
 * coisa aqui). O preço de nomear é precisar de um fundo de escala explícito: é este.
 *
 * `priority: -1` o põe por último, e `forbids` em tudo faz o solver recusar com motivo em vez de
 * escolher um corpo qualquer. Um tipo de nó novo aparece como ponto e a sonda diz por quê.
 */
const UNKNOWN = Object.freeze({
  id: 'desconhecido',
  name: 'NÃO CATALOGADO',
  priority: -1,
  status: 'declared',
  from: 'nenhuma outra classe reconheceu o `type` deste nó',
  test: () => true,
  features: {},
  forbids: Object.freeze({
    surface: 'tipo de nó não catalogado — desenhar um corpo afirmaria saber o que ele é',
  }),
});

export function classify(node, facts = {}) {
  return BY_PRIORITY.find((entry) => entry.test(node, facts)) ?? UNKNOWN;
}

/*
 * ☠️ **`allows(entry, feature)` SAIU daqui, e ela perdeu o último leitor no mesmo commit em que
 * deixou de ter sentido.** O único chamado era o ramo `allows(klass, 'surface') → PLANET` do
 * `solver.js`, e a pele deixou de sair de lá: quem decide é `superficieDe`, que pergunta à
 * ONTOLOGIA (família, tipo, fenômeno) e não ao `forbids` do catálogo.
 *
 * ⭑ **`forbids` continua vivo e é lido diretamente** — `klass.forbids?.ring` e `?.envelope`, no
 * solver, que é onde as proibições que sobraram valem. Um invólucro genérico sobre uma consulta de
 * uma linha, sem chamador, é o convite escrito para alguém voltar a perguntar ao catálogo o que a
 * ontologia responde.
 */

/**
 * O ANEL, por estado do git — a feição que se ANEXA a um corpo, não uma classe dele.
 *
 * Família não é decoração: as três têm assinaturas fotométricas opostas, e é isso que as
 * distingue de longe, mais do que a cor.
 *
 * ⚠️ Ele é EVENTO, não estado: existe enquanto o trabalho está em aberto e some no commit. É por
 * isso que ele vence o envoltório de supernova quando os dois cabem no mesmo corpo — o caso mais
 * comum, porque o arquivo que você está editando agora costuma ser o mesmo que você mais editou
 * no mês. Ganha o sinal PERECÍVEL: ele é acionável agora e se limpa sozinho, enquanto o churn
 * continua lá amanhã. A regra é aplicada em `solver.js`.
 */
/**
 * O que o estado do git acrescenta ao anel — e é só o ESPALHAMENTO.
 *
 * ⚠️ **`family` saiu, e não foi renomeado: ele deixou de existir.** Ele mapeava
 * `modified → 'saturn'`, e desde que `RING_FAMILIES` passou a ser indexado pelo próprio estado o
 * mapa virava identidade — indireção que não indireciona é um nome a mais para o mesmo fato.
 *
 * ⚠️ **`reach` saiu pelo motivo mais grave: ele estava DUPLICADO.** `RING_BY_STATE.modified.reach`
 * era 2.45 e `RING_FAMILIES.modified.reach` é 2.45 — o mesmo número em dois lugares, livres para
 * divergir na primeira vez que alguém ajustasse um só. O alcance é propriedade da FÍSICA do anel
 * (é o raio externo real do planeta transcrito), não do estado do git; ele mora onde o dado mora.
 */
export const RING_BY_STATE = Object.freeze({
  modified: Object.freeze({ scatter: 'retro' }),
  staged: Object.freeze({ scatter: 'retro' }),
  untracked: Object.freeze({ scatter: 'forward' }),
});

/** Geometria do anel, igual para as três famílias. */
export const RING_SPAN = 'min(reach, 2.4) raios do astro — o teto existe porque a câmera entra na casca';
export const RING_SPIN = 'kepleriano, ω ∝ r^-1.5: a borda interna gira mais rápido que a externa';

/**
 * Que corpo celeste cada TIPO de arquivo é — a tabela de morfologias por `kind`.
 *
 * Ela era INTENÇÃO DECLARADA e virou o que a cena desenha: `solver.js` roteia a superfície por esta
 * tabela quando a classe é a padrão, então o `kind` deixou de governar só a cor. `drawn` sobrevive
 * para marcar morfologia declarada e ainda não implementada — hoje nenhuma, e o campo continua aqui
 * porque a próxima entrada nova nasce sem módulo e a HUD precisa dizer isso em vez de prometer.
 *
 * ⚠️ A CLASSE ainda manda quando o ESTADO produz um corpo próprio: sujo → planeta anelado, dormente
 * → cometa extinto. A morfologia decide o corpo PADRÃO, não o corpo em todo caso — quem quiser a
 * ordem inteira leia `solver.js`, que é onde as duas se compõem.
 */
/**
 * Quem pode HOSPEDAR um anel, por corpo — e o porquê de cada recusa.
 *
 * ⚠️ Esta tabela é a metade que faltava quando o anel era classe. Como classe, ele nunca
 * PERGUNTAVA se o corpo aceitava: ele SUBSTITUÍA o corpo por um planeta, e a regra de abertura
 * deste arquivo — *estrela não tem anel planetário; tem disco de detritos* — nunca chegava a ser
 * consultada, porque a estrela deixava de existir antes disso.
 *
 * A recusa NÃO é silenciosa: o `solver.js` a registra com a frase, e a sonda a publica. "Por que
 * este arquivo sujo não tem anel?" tem resposta na tela.
 */
const CIRCUMSTELLAR = Object.freeze({
  planeta: 'anel',
  /*
   * ⚠️ A ESTRELA NÃO GANHA NADA MENOS — ela ganha OUTRA COISA, e é a frase que abre este arquivo:
   * *estrela tem DISCO DE DETRITOS, não anel*. A pressão de radiação e o arrasto de
   * Poynting-Robertson varrem o material que um anel planetário precisaria; o que sobra é poeira
   * reposta por colisões, numa cavidade enorme com um cinturão estreito lá fora.
   *
   * Enquanto o disco não existia, esta linha era uma RECUSA, e ela custava o sinal de "sujo" em
   * 4 dos 17 arquivos alterados. Agora ela é um destino.
   */
  fotosfera: 'disco-de-detritos',
  estrela: 'disco-de-detritos',
  /*
   * O pulsar é o caso mais interessante das recusas, e ele NÃO é preguiça: disco de fallback em
   * estrela de nêutrons existe de verdade — PSR B1257+12 formou planetas de um. Mas fallback é
   * material da própria supernova recaindo, não cascata colisional de um sistema planetário, e
   * desenhar qualquer um dos dois aqui afirmaria um objeto que a cena não modela.
   */
  pulsar: null,
  cometa: null,
  estação: null,
  nebulosa: null,
});

/** Por que este corpo não hospeda nada em órbita. Só para os que recusam. */
const SEM_ORBITA = Object.freeze({
  cometa:
    'cauda e anel juntos não descrevem nada — é o mesmo `forbids` que a classe cometa-extinto já declarava',
  pulsar:
    'estrela de nêutrons pode ter disco de FALLBACK (PSR B1257+12 formou planetas de um), mas fallback é a supernova recaindo, não cascata colisional — e a cena não modela nenhum dos dois',
  estação:
    'anel em volta de um artefato não descreve nada: material orbital é o que NÃO se agregou, e uma estação foi construída inteira',
  nebulosa: 'não há corpo central a anelar — a nebulosa é difusa por definição',
});

/**
 * Que objeto EM ÓRBITA este corpo hospeda quando o arquivo está sujo — ou a frase da recusa.
 *
 * ⚠️ Esta tabela é a metade que faltava quando o anel era classe. Como classe, ele nunca
 * PERGUNTAVA se o corpo aceitava: ele SUBSTITUÍA o corpo por um planeta, e a regra de abertura
 * deste arquivo nunca chegava a ser consultada, porque a estrela deixava de existir antes.
 *
 * A recusa NÃO é silenciosa: o `solver.js` a registra com a frase, e a sonda a publica. "Por que
 * este arquivo sujo não tem anel?" tem resposta na tela.
 *
 * @returns {'anel'|'disco-de-detritos'|{reason: string}}
 */
export const orbitingOf = (body) => {
  const objeto = CIRCUMSTELLAR[body];
  if (objeto) return objeto;
  if (objeto === null) return { reason: SEM_ORBITA[body] ?? `${body} não hospeda material em órbita` };
  // Corpo que a tabela não conhece ainda: anel é o padrão, como era antes de ela existir.
  return 'anel';
};

export const MORPHOLOGY_BY_KIND = Object.freeze({
  config: Object.freeze({ body: 'fotosfera', drawn: true }),
  schema: Object.freeze({ body: 'fotosfera', drawn: true }),
  doc: Object.freeze({ body: 'planeta', drawn: true }),
  decision: Object.freeze({ body: 'planeta', drawn: true }),
  memory: Object.freeze({ body: 'planeta', drawn: true }),
  script: Object.freeze({ body: 'cometa', drawn: true }),
  agent: Object.freeze({ body: 'estação', drawn: true }),
  /*
   * ⚠️ `infra` ERA PULSAR, e era o erro mais claro do lote: um `.tf` de Terraform não pulsa.
   *
   * Ele é infraestrutura, que é o OPOSTO de um evento periódico — é o que fica parado para que
   * outra coisa aconteça. E o pulsar é o único corpo deste céu cuja definição é temporal, então
   * derivá-lo de `kind` (que é COMPOSIÇÃO) contradiz a regra que abre o catálogo.
   *
   * Estação é o destino certo, e não é consolo: a leitura pré-verbal é a mesma que `agent` já usa
   * — aresta reta é alguém que construiu aquilo — e é exatamente o que Terraform e k8s são.
   *
   * O nome `pulsar` sai desta tabela e vira CLASSE, decidida pelo ritmo de commits. Ver a classe
   * `pulsar` acima e `docs/catalogo-celeste.md`, "1. O pulsar tem de sair do RITMO".
   */
  infra: Object.freeze({ body: 'estação', drawn: true }),
  compose: Object.freeze({ body: 'nebulosa', drawn: true }),
  lock: Object.freeze({ body: 'estrela', drawn: true }),
  other: Object.freeze({ body: 'estrela', drawn: true }),
});

/** A morfologia declarada para este tipo, com `estrela` como padrão — é o que a classe faz. */
export const morphologyOf = (kind) => MORPHOLOGY_BY_KIND[kind] ?? MORPHOLOGY_BY_KIND.other;
