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
 * Os defaults que valiam antes da revisão de ambientação (2026-08-05).
 *
 * Existem só para a migração abaixo saber distinguir "nunca mexi neste slider" de "escolhi
 * este valor". Quem afinou a cena à mão não pode ter o trabalho descartado por uma mudança de
 * default; quem herdou o número anterior sem nunca tocar nele deve receber o novo.
 */
const LEGACY_DEFAULTS = Object.freeze({'starSize': 1.45, 'starBrightness': 0.8, 'starDrift': 3.75, 'cameraDrift': 1, 'fov': 80, 'lensStrength': 0.28, 'bloomStrength': 0.58, 'bloomThreshold': 0.72, 'aberration': 1, 'grain': 0.03, 'vignette': 1});

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
  ['NÚCLEO', 'coreScale', 'TAMANHO DO NÚCLEO', 0.5, 2.2, 0.05, 1.55],
  ['NÚCLEO', 'breath', 'RESPIRAÇÃO', 0, 3, 0.05, 1],

  ['CÉU', 'starSpread', 'ESPAÇAMENTO DAS ESTRELAS', 0.4, 2.5, 0.02, 0.76],
  ['CÉU', 'starSize', 'TAMANHO DAS ESTRELAS', 0.2, 3, 0.05, 1.0],
  ['CÉU', 'starBrightness', 'BRILHO DAS ESTRELAS', 0, 2.5, 0.05, 0.55],
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
  ['GRAFO', 'graphSpread', 'ESPAÇAMENTO DOS NÓS', 0.3, 3.5, 0.02, 2.6],
  ['GRAFO', 'graphSpeed', 'VELOCIDADE ORBITAL', 0, 4, 0.05, 0.2],
  ['GRAFO', 'nodeSize', 'TAMANHO DOS NÓS', 0.2, 3, 0.05, 1.1],
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

  ['CÂMERA', 'cameraDrift', 'DERIVA DA CÂMERA', 0, 6, 0.05, 0.4],
  ['CÂMERA', 'cameraEase', 'SUAVIDADE DA CÂMERA', 2, 20, 0.5, 9],
  ['CÂMERA', 'fov', 'CAMPO DE VISÃO', 28, 80, 1, 46],

  ['LENTE', 'lensStrength', 'FORÇA DA LENTE', 0, 2.5, 0.02, 0.18],
  ['LENTE', 'bloomStrength', 'BLOOM', 0, 2, 0.02, 0.45],
  ['LENTE', 'bloomThreshold', 'LIMIAR DO BLOOM', 0, 1, 0.02, 0.8],
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
      known.filter(([key, value]) => !(key in LEGACY_DEFAULTS) || value !== LEGACY_DEFAULTS[key])
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
