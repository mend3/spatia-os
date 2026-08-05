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

export const SPEC = [
  // grupo, chave, rótulo, min, max, passo, default
  ['NÚCLEO', 'diskSpin', 'ROTAÇÃO DO DISCO', 0, 4, 0.05, 1],
  ['NÚCLEO', 'diskIntensity', 'INTENSIDADE DO DISCO', 0.1, 3, 0.05, 1],
  ['NÚCLEO', 'diskWidth', 'LARGURA DO DISCO', 0.4, 2, 0.02, 1],
  ['NÚCLEO', 'breath', 'RESPIRAÇÃO', 0, 3, 0.05, 1],

  ['CÉU', 'starSpread', 'ESPAÇAMENTO DAS ESTRELAS', 0.4, 2.5, 0.02, 0.76],
  ['CÉU', 'starSize', 'TAMANHO DAS ESTRELAS', 0.2, 3, 0.05, 1.45],
  ['CÉU', 'starBrightness', 'BRILHO DAS ESTRELAS', 0, 2.5, 0.05, 0.8],
  ['CÉU', 'starDrift', 'DERIVA DO CÉU', 0, 6, 0.05, 3.75],

  ['GRAFO', 'graphSpread', 'ESPAÇAMENTO DOS NÓS', 0.3, 2.5, 0.02, 1.78],
  ['GRAFO', 'graphSpeed', 'VELOCIDADE ORBITAL', 0, 4, 0.05, 0.2],
  ['GRAFO', 'nodeSize', 'TAMANHO DOS NÓS', 0.2, 3, 0.05, 1.1],
  ['GRAFO', 'edgeOpacity', 'OPACIDADE DAS ARESTAS', 0, 1, 0.02, 0.2],

  ['CÂMERA', 'cameraDrift', 'DERIVA DA CÂMERA', 0, 6, 0.05, 1],
  ['CÂMERA', 'cameraEase', 'SUAVIDADE DA CÂMERA', 2, 20, 0.5, 9],
  ['CÂMERA', 'fov', 'CAMPO DE VISÃO', 28, 80, 1, 80],

  ['LENTE', 'lensStrength', 'FORÇA DA LENTE', 0, 2.5, 0.02, 0.28],
  ['LENTE', 'bloomStrength', 'BLOOM', 0, 2, 0.02, 0.58],
  ['LENTE', 'bloomThreshold', 'LIMIAR DO BLOOM', 0, 1, 0.02, 0.72],
  ['LENTE', 'aberration', 'ABERRAÇÃO CROMÁTICA', 0, 4, 0.05, 1],
  ['LENTE', 'grain', 'GRÃO', 0, 0.12, 0.002, 0.03],
  ['LENTE', 'vignette', 'VINHETA', 0, 2, 0.05, 1],

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
    return Object.fromEntries(Object.entries(stored).filter(([key]) => key in DEFAULTS));
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
