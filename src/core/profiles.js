/**
 * Perfis de qualidade — três conjuntos nomeados dos 22 parâmetros da cena.
 *
 * O painel de afinação tem 22 sliders e nenhum agrupamento por CUSTO. Quem abre numa máquina
 * fraca encontra 22 controles e nenhuma pista de quais três decidem o FPS. Um perfil responde
 * essa pergunta de uma vez: é o mesmo store, com nome.
 *
 * ## O que realmente custa
 *
 * Medido nesta base: 120 FPS, zero quadros longos, 16 MB, num Apple M5 a 3024×1484 com DPR 2.
 * Essa é a máquina mais rápida que vai rodar isto, então os perfis não existem para ela — e é
 * por isso que a escolha do que cortar não pode sair de "achismo sobre o que parece pesado".
 * Os três itens abaixo dominam o orçamento de quadro por razões estruturais, não por medição
 * comparativa (que ainda não existe, e está anotada como tal em `docs/proximos-passos.md`):
 *
 * | Item | Por que domina |
 * |---|---|
 * | `pixelRatio` | é QUADRÁTICO: DPR 2 → 4× os fragmentos de DPR 1, em toda a cadeia |
 * | pós-processamento | lente + bloom + output = três passes de tela CHEIA por quadro |
 * | bloom | além do passe, ele borra em várias resoluções — o mais caro dos três |
 *
 * Tudo o mais (raycast a 16Hz, ~468 sin/cos por quadro, os anéis) é ruído perto disso.
 *
 * ## O perfil NÃO se aplica sozinho
 *
 * A detecção mede e **sugere**; aplicar sem pedir seria trocar a aparência da cena por conta
 * própria. O sistema já tem uma regra sobre isso: `respectMotion` em `space/scene.js` amortece
 * a cena quando o sistema pede movimento reduzido, e o painel DIZ na tela que está exibindo um
 * valor que não está em vigor — porque um controle que mente em silêncio é pior que um controle
 * ausente. A mesma régua vale aqui.
 */

/**
 * `tuning` traz só o que o perfil MUDA em relação ao default. Listar os 22 em cada perfil faria
 * três cópias do default, e a próxima mudança de default só chegaria a uma delas.
 */
export const PROFILES = [
  {
    id: 'minimo',
    name: 'MÍNIMO',
    note: 'sem pós-processamento · DPR 1 · para gráfico integrado ou bateria',
    pixelRatio: 1,
    maxRings: 16,
    tuning: {
      bloomStrength: 0,
      lensStrength: 0,
      grain: 0,
      aberration: 0,
      vignette: 0,
      // A órbita continua andando, só mais devagar: cena parada afirmaria que o sistema morreu.
      graphSpeed: 0.1,
      starDrift: 1.2,
      diskSpin: 0.5,
    },
  },
  {
    id: 'equilibrado',
    name: 'EQUILIBRADO',
    note: 'bloom leve · DPR até 1.5 · o meio-termo',
    pixelRatio: 1.5,
    maxRings: 40,
    tuning: {
      bloomStrength: 0.34,
      lensStrength: 0.18,
      grain: 0.02,
      aberration: 0.6,
    },
  },
  {
    id: 'pleno',
    name: 'PLENO',
    note: 'tudo ligado · DPR até 2 · GPU dedicada',
    pixelRatio: 2,
    maxRings: 64,
    tuning: null, // `null` = os defaults do SPEC, sem sobreposição nenhuma
  },
];

export const DEFAULT_PROFILE = 'pleno';

export const byId = (id) => PROFILES.find((profile) => profile.id === id) ?? null;

/*
 * Limiares da sugestão, em FPS. Abaixo de 30 a cena deixa de parecer contínua; abaixo de 50 já
 * se percebe o arraste da câmera engasgando, que é o gesto mais sensível da interface.
 */
const FLOOR_MINIMO = 30;
const FLOOR_EQUILIBRADO = 50;

/**
 * Qual perfil os números pedem — a partir de uma amostra REAL, nunca da string do agente.
 *
 * `navigator.userAgent` e `deviceMemory` respondem "que máquina é" e a pergunta é outra: "esta
 * cena, com este corpus, neste tamanho de janela, roda?". Um M1 numa janela 5K e um i5 numa
 * janela pequena podem trocar de lugar, e a única coisa que sabe disso é o próprio loop.
 *
 * @param {{fps: number, longFrames: number}} sample
 * @returns {string} id do perfil sugerido
 */
export function suggest({ fps, longFrames }) {
  if (fps < FLOOR_MINIMO) return 'minimo';
  // Quadro longo é engasgo, e engasgo importa mais que a média: 60 FPS com dez travadas por
  // minuto é pior de usar que 45 constantes. A média sozinha esconde exatamente isso.
  if (fps < FLOOR_EQUILIBRADO || longFrames > 3) return 'equilibrado';
  return 'pleno';
}
