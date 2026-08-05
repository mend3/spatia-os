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
   * Medido: o buraco negro ocupava ~8% da tela num enquadramento em que a faixa central livre é
   * 60% da largura. Um centro oco com as bordas escritas lê como MOLDURA — e o núcleo é
   * literalmente o centro gravitacional do sistema, o lugar de onde toda interação nasce. 1.9
   * leva para a faixa de 18–25% da altura da viewport, que é onde ele passa a se impor.
   *
   * Escala o GRUPO, não a largura do disco: `diskWidth` muda a proporção interna (quanto o disco
   * se afasta do horizonte) e mexer nela para crescer distorceria o objeto em vez de aproximá-lo.
   */
  ['NÚCLEO', 'coreScale', 'TAMANHO DO NÚCLEO', 0.5, 4.5, 0.05, 3.1],
  ['NÚCLEO', 'breath', 'RESPIRAÇÃO', 0, 3, 0.05, 1],

  ['CÉU', 'starSpread', 'ESPAÇAMENTO DAS ESTRELAS', 0.4, 2.5, 0.02, 0.76],
  ['CÉU', 'starSize', 'TAMANHO DAS ESTRELAS', 0.2, 3, 0.05, 1.0],
  ['CÉU', 'starBrightness', 'BRILHO DAS ESTRELAS', 0, 2.5, 0.05, 0.55],
  ['CÉU', 'starDrift', 'DERIVA DO CÉU', 0, 6, 0.05, 0.8],

  ['GRAFO', 'graphSpread', 'ESPAÇAMENTO DOS NÓS', 0.3, 2.5, 0.02, 1.78],
  ['GRAFO', 'graphSpeed', 'VELOCIDADE ORBITAL', 0, 4, 0.05, 0.2],
  ['GRAFO', 'nodeSize', 'TAMANHO DOS NÓS', 0.2, 3, 0.05, 1.1],
  ['GRAFO', 'edgeOpacity', 'OPACIDADE DAS ARESTAS', 0, 1, 0.02, 0.2],

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
