/**
 * A SONDA — o corpo do OPERADOR na cena, e o único do céu que não é conteúdo.
 *
 * ## Por que ela não cai na recusa escrita da nave
 *
 * `docs/modelo-de-renderizacao.md` recusa nave por escrito — *"nave implica posição independente, e
 * posição independente quebra a estabilidade espacial"*. Aquela recusa é sobre os **54 corpos de
 * corpus** de `kind: agent`: eles são conhecimento, e conhecimento tem de continuar encontrável onde
 * foi deixado (A REGRA DA COORDENADA).
 *
 * ⭑ **A sonda não é conhecimento.** Ela não tem `source`, não entra no `/api/graph`, não é indexada
 * e não responde a busca. É a CÂMERA tornada visível. Nada deixa de ser encontrável por ela existir,
 * e por isso a posição dela pode ser livre sem tocar na lei.
 *
 * ☠️ **E ela não é a ESTAÇÃO.** `station.js` deriva tudo de fatos de um nó — `sections` vira módulos
 * do casco, `chunks` vira comprimento, `churn` vira farol. A sonda não tem nenhum desses fatos, e
 * usar aquele módulo aqui obrigaria a inventá-los. São dois objetos construídos e distintos.
 *
 * ## Malha de arquivo, e não procedural — a exceção, com o motivo
 *
 * O resto do céu é procedural porque é conteúdo: a forma tem de sair do fato. A sonda não descreve
 * fato nenhum — ela é o operador —, então a fidelidade dela é livre e vale usar malha de autor.
 *
 * ⚠️ **O `.glb` é DRACO**, então o decodificador é obrigatório: sem ele o carregamento falha com
 * `no DRACOLoader instance provided`, que é erro de configuração e não de arquivo.
 */
import * as THREE from 'three';
import { carregarGLB, normalizar, medir } from './malha-de-autor.js';

/** O arquivo do operador. O decodificador DRACO é ligado por `malha-de-autor.js`. */
const MALHA = '/assets/3d/hubble-space-telescope.glb';

/**
 * O raio de referência da sonda depois de normalizada, em unidades de mundo.
 *
 * ⚠️ **A malha de autor vem na escala do autor**, que não tem relação nenhuma com a régua desta
 * cena. Normalizar no módulo — e não em cada chamador — é o que impede a sonda de aparecer do
 * tamanho de um sistema numa tela e invisível na outra.
 */
export const RAIO = 1;

let promessa = null;

/**
 * Carrega a sonda UMA vez e devolve sempre o mesmo `Object3D` clonável.
 *
 * ⚠️ **A carga é assíncrona e o chamador é síncrono.** Quem monta cena recebe um grupo vazio agora e
 * o conteúdo depois; não há como um `build()` de bancada esperar sem travar o quadro.
 *
 * @returns {Promise<{ objeto: THREE.Object3D, medida: object }>}
 */
export function carregarSonda() {
  if (promessa) return promessa;

  promessa = carregarGLB(MALHA).then((cena) => {
    const { grupo, raioOriginal, fator } = normalizar(cena, RAIO);
    return {
      objeto: grupo,
      medida: {
        ...medir(cena),
        raioOriginal: Number(raioOriginal.toFixed(3)),
        fatorDeEscala: Number(fator.toFixed(5)),
      },
    };
  });

  return promessa;
}
