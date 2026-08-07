/**
 * Parâmetros de cena ajustáveis em runtime — o painel de afinação.
 *
 * O briefing pedia Leva para isso. Aqui é nativo, por dois motivos: a dependência não cabe
 * num projeto sem build, e o painel precisa ser *do produto*, não uma ferramenta de dev
 * colada por cima — ele usa a mesma tipografia hairline do resto e desaparece no modo
 * cinematográfico.
 *
 * O contrato é declarativo: cada parâmetro se declara aqui (faixa, passo, unidade, grupo) e
 * o painel se constrói sozinho. Adicionar um controle novo é uma linha nesta tabela — não há
 * lugar onde esquecer de registrar.
 *
 * O valor persiste em `localStorage`. Afinar uma cena visual leva vários minutos de tentativa
 * e erro, e perder isso num reload torna o painel inútil na prática.
 */

const STORAGE_KEY = 'espatial.tuning.v1';

/**
 * Todo valor que já foi default de uma chave, por chave.
 *
 * Existe para a migração abaixo distinguir "nunca mexi neste slider" de "escolhi este valor". Quem
 * afinou a cena à mão não pode perder o trabalho por uma mudança de default; quem herdou o número
 * anterior sem nunca tocar nele deve receber o novo.
 *
 * ⚠️ É uma LISTA por chave, e era um valor só. A segunda revisão de ambientação (2026-08-05, tarde)
 * mexeu em seis chaves que já tinham entrada aqui da primeira — e com um valor só, migrar a segunda
 * vez apagaria a primeira: quem estava sentado no default intermediário passaria a ser tratado como
 * alguém que escolheu aquilo, e nunca mais receberia default novo nenhum. Um histórico de defaults
 * é o que o mecanismo sempre precisou; ele só não tinha sido pedido duas vezes ainda.
 *
 * ⚠️ Persistir é TUDO OU NADA: `persist()` grava o objeto inteiro, então quem mexeu em UM slider
 * tem as 28 chaves no storage. Por isso não basta olhar "a chave está lá?" — tem de ser o valor.
 */
const SUPERSEDED = Object.freeze({
  // Primeira revisão de ambientação (manhã de 2026-08-05).
  starSize: [1.45, 1.0],
  starBrightness: [0.8, 0.55],
  starDrift: [3.75],
  cameraDrift: [1, 0.4],
  fov: [80, 46],
  lensStrength: [0.28],
  bloomStrength: [0.58, 0.45],
  bloomThreshold: [0.72],
  aberration: [1],
  grain: [0.03],
  vignette: [1],
  // Segunda revisão: céu vasto (fov e espaçamento no máximo, o resto derivado deles).
  graphSpread: [2.6],
  starSpread: [0.76],
  nodeSize: [1.1],
  coreScale: [1.55],
  graphSpeed: [0.2],
  /*
   * Terceira revisão (2026-08-07): o BLOOM deixa de ser névoa e vira PSF.
   *
   * Motivo, e ele é de fidelidade e não de gosto: glare de instrumento óptico é forte em fonte
   * PONTUAL e fraca em fonte EXTENSA — a luz de um objeto extenso já está espalhada por muitos
   * pixels e cada um contribui pouco para a auréola. Com limiar 0,54 quase todo o céu cruzava o
   * corte, e um halo de raio fixo em tela cobria INTEIRA uma galáxia de 60 px enquanto no buraco
   * negro de 600 px era só uma borda. O dano era pior justamente no que é mais numeroso.
   *
   * Medido no vivo, mesma câmera: em 0,54 a galáxia é núcleo branco com braços lavados; em 0,92 a
   * cor e os braços voltam e o núcleo grande ainda estoura; em 1,15–1,40 aparecem braços, faixas
   * de poeira e núcleo estruturado. Ver `espatial.bloom({ threshold, radius })`.
   */
  bloomStrength: [0.58, 0.45, 0.5, 0.36],
  bloomThreshold: [0.72, 0.8, 0.54],
});

/*
 * ## A ambientação padrão: um universo VASTO, e o que "vasto" custou em cada linha
 *
 * `fov` e `graphSpread` no MÁXIMO foi o pedido; o resto abaixo é consequência medida dos dois, não
 * gosto solto. Cada um deles quebrava alguma coisa se ficasse onde estava:
 *
 * | chave | antes → agora | por que TINHA de mudar |
 * |---|---|---|
 * | `graphSpread` | 2,6 → **3,5** | o pedido. A casca de arquivos vai de 68–161 para 91–217 |
 * | `fov` | 46 → **80** | o pedido. A meia-altura do quadro dobra (`tan` 0,42 → 0,84) |
 * | `starSpread` | 0,76 → **1,6** | o campo estelar vive em 150–400 × isto: em 0,76 ele começava em 114 e o grafo, agora chegando a 217, ATRAVESSAVA o próprio fundo |
 * | `starSize` | 1,0 → **2,0** | o fundo foi de 114–304 para 240–640: 2,1× mais longe, 2,1× menor em pixel |
 * | `starBrightness` | 0,55 → **0,7** | idem — mais longe, mais apagado |
 * | `nodeSize` | 1,1 → **1,45** | 1,35× mais distante. ⚠️ Só isso: `gl_PointSize` é `300/z` e NÃO depende do `fov`, então o campo de visão não encolhe o sprite — encolhe o mundo em volta dele |
 * | `coreScale` | 1,55 → **2,05** | o teto é estrutural (`26 · graphSpread / 39`) e o espaçamento o empurrou de 1,19 para 2,33. O núcleo é o centro gravitacional da composição e agora cabe maior. 2,05 deixa 11 unidades entre a borda do disco e a primeira órbita — em 2,2 sobrariam 5, e a câmera dentro do disco é um defeito que esta cena já pagou cinco vezes |
 * | `graphSpeed` | 0,2 → **0,25** | ⚠️ o espaçamento NÃO muda a taxa angular (ela sai de `node.radius`, que é local), então a órbita ficou com o mesmo ritmo num círculo maior. O empurrão é pelo "vivo" do pedido, e ele multiplica o relógio das luas também |
 * | `cameraDrift` | 0,4 → **0,55** | céu vasto e parado lê como fundo de tela |
 * | `bloomStrength` | 0,45 → **0,5** | mais vazio escuro por quadro; o brilho é o que o mantém povoado |
 *
 * `CAMERA.start` em `space/scene.js` acompanha: 88 unidades enquadravam a casca antiga.
 */
export const SPEC = [
  // grupo, chave, rótulo, min, max, passo, default
  ['NÚCLEO', 'diskSpin', 'ROTAÇÃO DO DISCO', 0, 4, 0.05, 1],
  ['NÚCLEO', 'diskIntensity', 'INTENSIDADE DO DISCO', 0.1, 3, 0.05, 1],
  ['NÚCLEO', 'diskWidth', 'LARGURA DO DISCO', 0.4, 2, 0.02, 1],
  /*
   * Escala do NÚCLEO INTEIRO — horizonte, anel de fóton, disco e crescente juntos.
   *
   * Existe porque o buraco negro ocupava ~8% da tela num enquadramento com 60% da largura
   * central livre: um centro oco com as bordas escritas lê como MOLDURA, e o núcleo é
   * literalmente o centro gravitacional do sistema.
   *
   * ⚠️ TETO ESTRUTURAL, e ele é baixo. A conta, com os números do código:
   *
   *   borda do disco   = DISK_OUTER (39 = HORIZON_RADIUS 3.0 × 13) × coreScale
   *   órbita mais perto = SHELLS.file[0] (26) × graphSpread (1.78) = 46
   *
   * O disco só não engole o arquivo mais próximo enquanto `coreScale < 26 × graphSpread / 39`,
   * ou seja **1,19** no ajuste padrão. Testei 3.1 e 1.35 na tela: nos dois, focar um astro
   * enchia a viewport de estrias porque a câmera passava a orbitar DENTRO do disco.
   *
   * Consequência que vale dizer: **o núcleo NÃO chega a 18–25% da altura por este parâmetro.**
   * Não é limitação dele — é que a casca de nós vive entre 20 e 110 unidades de mundo, e um
   * núcleo grande o bastante para se impor ocupa o mesmo espaço que o grafo. Chegar lá é
   * REENQUADRAR (empurrar `graphSpread` e afastar a câmera na mesma proporção), o que muda a
   * composição inteira — decisão de produto, não de escala de objeto.
   *
   * Escala o GRUPO, não `diskWidth`: aquela muda a proporção interna e distorceria o objeto em
   * vez de aproximá-lo.
   */
  ['NÚCLEO', 'coreScale', 'TAMANHO DO NÚCLEO', 0.5, 2.2, 0.05, 2.05],
  ['NÚCLEO', 'breath', 'RESPIRAÇÃO', 0, 3, 0.05, 1],

  ['CÉU', 'starSpread', 'ESPAÇAMENTO DAS ESTRELAS', 0.4, 2.5, 0.02, 1.6],
  ['CÉU', 'starSize', 'TAMANHO DAS ESTRELAS', 0.2, 3, 0.05, 2.0],
  ['CÉU', 'starBrightness', 'BRILHO DAS ESTRELAS', 0, 2.5, 0.05, 0.7],
  ['CÉU', 'starDrift', 'DERIVA DO CÉU', 0, 6, 0.05, 0.8],

  /*
   * ⚠️ Este número decide se a câmera consegue chegar perto de um astro.
   *
   * A órbita de arquivo mais interna é `SHELLS.file[0]` (26) × este valor. Em 1.78 ela caía em
   * 46 — e a borda do disco de acreção fica em 45. Ou seja: **não havia espaço livre entre o
   * disco e o primeiro anel de arquivos**. Travar a câmera num arquivo recente punha ela dentro
   * do disco, e a tela virava um borrão de estrias. Reproduzido cinco vezes, com três tentativas
   * de consertar o sintoma errado (escala do núcleo, folga radial, distância de foco).
   *
   * 2.6 abre um vão de ~23 unidades entre o disco e a primeira órbita. É o que torna possível ao
   * mesmo tempo aproximar a câmera de um astro e crescer o núcleo — os dois estavam presos pela
   * mesma falta de espaço.
   */
  ['GRAFO', 'graphSpread', 'ESPAÇAMENTO DOS NÓS', 0.3, 3.5, 0.02, 3.5],
  ['GRAFO', 'graphSpeed', 'VELOCIDADE ORBITAL', 0, 4, 0.05, 0.25],
  ['GRAFO', 'nodeSize', 'TAMANHO DOS NÓS', 0.2, 3, 0.05, 1.45],
  /*
   * ⚠️ A aresta não é mais desenhada em repouso, então este parâmetro passou a controlar o
   * VÍNCULO SOB DEMANDA (`space/links.js`): o arco que aparece ao passar o cursor num astro ou
   * travar a câmera nele. Zero continua significando "não desenhe" — só o momento mudou.
   */
  ['GRAFO', 'edgeOpacity', 'FORÇA DO VÍNCULO', 0, 1, 0.02, 0.55],

  /*
   * LUAS — e os tetos aqui são de CUSTO, não de gosto.
   *
   * `moonSize` multiplica `MOON_DRAW_GAIN` (`space/graph.js`), que já é uma compressão declarada:
   * a lua desenhada fiel tem 4,4% do raio do pai e some no enquadramento do sistema. O teto de 3
   * existe porque acima disso a lua passa a competir com o próprio pai em tamanho aparente e o
   * sistema deixa de ler como sistema — e o piso de 0,4 devolve a proporção quase fiel para quem
   * quiser vê-la. **Não muda a contagem nem a prova de não-colisão**: as duas vivem na régua da
   * mecânica (`orbital-zones.js`), e este slider é da régua do sprite.
   *
   * `moonSpeed` multiplica o relógio já comprimido do `moonOrbit.timeScale`. O teto de 4 é o que
   * mantém o passo angular por quadro abaixo de ~0,1 rad a 60fps na lua mais interna — acima
   * disso a elipse começa a ler como polígono, porque a posição é amostrada uma vez por quadro.
   * Zero PARA as luas, e é um estado legítimo (quem quiser olhar a geometria sem o movimento).
   *
   * `moonOrbitOpacity` é o traço das órbitas. Zero apaga — o sistema volta a ser pontos, que é o
   * que ele era antes do traço existir, e há quem prefira. Não custa nada: são 96 segmentos por
   * lua e só do astro em foco.
   */
  ['LUAS', 'moonSize', 'TAMANHO DAS LUAS', 0.4, 3, 0.05, 1],
  ['LUAS', 'moonSpeed', 'VELOCIDADE DAS LUAS', 0, 4, 0.05, 1],
  ['LUAS', 'moonOrbitOpacity', 'TRAÇO DAS ÓRBITAS', 0, 1, 0.02, 0.22],

  ['CÂMERA', 'cameraDrift', 'DERIVA DA CÂMERA', 0, 6, 0.05, 0.55],
  ['CÂMERA', 'cameraEase', 'SUAVIDADE DA CÂMERA', 2, 20, 0.5, 9],
  ['CÂMERA', 'fov', 'CAMPO DE VISÃO', 28, 80, 1, 80],

  ['LENTE', 'lensStrength', 'FORÇA DA LENTE', 0, 2.5, 0.02, 0.18],
  ['LENTE', 'bloomStrength', 'BLOOM', 0, 2, 0.02, 0.62],
  /*
   * ⚠️ O TETO ERA 1 e o valor certo está ACIMA dele — o slider não conseguia expressar a correção.
   * Limiar é linear e a cena tem fonte bem acima de 1; cortar a régua em 1 era decidir, por
   * acidente de interface, que o bloom sempre pegaria as galáxias.
   */
  ['LENTE', 'bloomThreshold', 'LIMIAR DO BLOOM', 0, 2, 0.02, 1.15],
  // O RAIO nunca teve controle, e é ele o mecanismo do borrão: halo de tamanho fixo em tela cobre
  // objeto pequeno inteiro. Sem ele, só dava para escurecer o céu inteiro para salvar a galáxia.
  ['LENTE', 'bloomRadius', 'RAIO DO BLOOM', 0.05, 0.8, 0.01, 0.2],
  ['LENTE', 'aberration', 'ABERRAÇÃO CROMÁTICA', 0, 4, 0.05, 0.4],
  ['LENTE', 'grain', 'GRÃO', 0, 0.12, 0.002, 0.012],
  ['LENTE', 'vignette', 'VINHETA', 0, 2, 0.05, 0.65],

  ['ÁUDIO', 'volume', 'VOLUME', 0, 1, 0.02, 0.42],
  // Conforto sonoro é gosto, não constante. Estes dois existem para você acertar o seu em vez
  // de eu adivinhar: `ambient` é o quanto do ar/ruído rosa se ouve, `brightness` escala a
  // frequência de corte do filtro global (mais baixo = mais abafado e mais quente).
  ['ÁUDIO', 'ambient', 'AR AMBIENTE', 0, 3, 0.05, 1],
  ['ÁUDIO', 'brightness', 'BRILHO', 0.3, 2, 0.02, 1],
];

const DEFAULTS = Object.fromEntries(SPEC.map(([, key, , , , , value]) => [key, value]));

const listeners = new Set();
let current = { ...DEFAULTS, ...load() };

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    // Filtra chave desconhecida: um parâmetro removido do SPEC não deve ressuscitar do
    // storage de uma versão antiga e ficar sem controle na tela.
    const known = Object.entries(stored).filter(([key]) => key in DEFAULTS);
    /*
     * Migração por VALOR, não por versão.
     *
     * Trocar um default não alcança quem já usou o painel: o valor antigo está no
     * localStorage e vence. Resetar tudo alcançaria — e jogaria fora minutos de afinação
     * manual, que é justamente o que este store existe para preservar.
     *
     * A regra que separa os dois casos: se o valor guardado é IDÊNTICO ao default anterior,
     * ninguém escolheu aquilo — foi herdado. Esse recebe o novo. Qualquer outro valor é uma
     * decisão e fica de pé.
     */
    return Object.fromEntries(
      known.filter(([key, value]) => !(SUPERSEDED[key] ?? []).includes(value))
    );
  } catch {
    return {};
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Modo privado ou storage cheio: afinar sem persistir ainda funciona.
  }
}

export const values = () => current;
export const get = (key) => current[key];
export const defaults = () => ({ ...DEFAULTS });

export function set(key, value) {
  if (!(key in DEFAULTS)) return;
  current = { ...current, [key]: Number(value) };
  persist();
  notify(key);
}

/**
 * Aplica um CONJUNTO de valores de uma vez — é o que um perfil de qualidade faz.
 *
 * `patch` parcial sobre os DEFAULTS, não sobre os valores atuais: um perfil descreve um estado
 * completo da cena, e mesclar com o que estava ali faria trocar de perfil deixar resíduo do
 * anterior — trocar de PLENO para MÍNIMO e de volta não devolveria PLENO.
 *
 * Uma notificação só (`notify(null)`), não 22: cada `set` refaz a cadeia de afinação inteira
 * na cena, e 22 refazeres seguidos aparecem como um tranco na imagem.
 */
export function apply(patch) {
  current = { ...DEFAULTS, ...(patch || {}) };
  persist();
  notify(null);
}

export function reset() {
  current = { ...DEFAULTS };
  persist();
  notify(null);
}

export function subscribe(handler) {
  listeners.add(handler);
  handler(current, null);
  return () => listeners.delete(handler);
}

function notify(key) {
  for (const handler of [...listeners]) {
    try {
      handler(current, key);
    } catch (error) {
      console.error('[tuning] assinante falhou', error);
    }
  }
}
