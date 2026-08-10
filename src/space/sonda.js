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
import { GLTFLoader } from '../../vendor/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from '../../vendor/jsm/loaders/DRACOLoader.js';

/** O arquivo, e o decodificador que ele exige. Caminhos absolutos: o servidor serve a raiz. */
const MALHA = '/assets/3d/HubbleSpaceTelescope.glb';
const DRACO = '/vendor/jsm/libs/draco/gltf/';

/**
 * O raio de referência da sonda depois de normalizada, em unidades de mundo.
 *
 * ⚠️ **A malha de autor vem na escala do autor**, que não tem relação nenhuma com a régua desta
 * cena. Normalizar aqui — e não em cada chamador — é o que impede a sonda de aparecer do tamanho de
 * um sistema numa tela e invisível na outra.
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

  const draco = new DRACOLoader().setDecoderPath(DRACO);
  const loader = new GLTFLoader().setDRACOLoader(draco);

  promessa = loader.loadAsync(MALHA).then((gltf) => {
    const objeto = gltf.scene;

    /*
     * CENTRAR e NORMALIZAR, nesta ordem.
     *
     * O centro da malha de autor é a origem do arquivo dele, que raramente é o centro geométrico —
     * girar em torno dela faz o objeto orbitar o próprio eixo em vez de rodar sobre si.
     *
     * ⭑ **A escala sai da MEIA-DIAGONAL da caixa, e a garantia é essa:** a esfera de raio `RAIO`
     * circunscreve a caixa, então a malha **não ultrapassa `RAIO` em pose nenhuma**. É o número que
     * um chamador precisa para reservar espaço sem saber a orientação.
     * ⚠️ **Ela não ENCOSTA nesse raio** — medido nesta malha, o vértice mais distante fica a
     * **0,793** de `RAIO`. Quem quiser o raio APERTADO mede vértice, e aí perde a invariância à
     * rotação; são duas grandezas e a escolha aqui é a conservadora.
     */
    const caixa = new THREE.Box3().setFromObject(objeto);
    const centro = caixa.getCenter(new THREE.Vector3());
    objeto.position.sub(centro);

    const envolvente = caixa.getBoundingSphere(new THREE.Sphere());
    const fator = envolvente.radius > 0 ? RAIO / envolvente.radius : 1;

    const grupo = new THREE.Group();
    grupo.add(objeto);
    grupo.scale.setScalar(fator);

    return { objeto: grupo, medida: medir(gltf.scene, envolvente.radius, fator) };
  });

  return promessa;
}

/**
 * O que a malha CUSTA, contado na própria malha.
 *
 * ⭑ Existe porque *"1,6 MB"* é o tamanho do arquivo e não diz nada sobre o quadro. O que decide se
 * a sonda cabe no orçamento é triângulo, chamada de desenho e textura — e o céu inteiro com 213
 * instâncias custa 0,31–0,35 ms, então o número aqui tem contra o que ser comparado.
 */
function medir(raiz, raioOriginal, fator) {
  let triangulos = 0;
  let malhas = 0;
  const materiais = new Set();
  const texturas = new Set();
  raiz.traverse((n) => {
    if (!n.isMesh) return;
    malhas += 1;
    const g = n.geometry;
    const contagem = g.index ? g.index.count : g.attributes.position?.count ?? 0;
    triangulos += contagem / 3;
    for (const m of Array.isArray(n.material) ? n.material : [n.material]) {
      if (!m) continue;
      materiais.add(m.uuid);
      for (const chave of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
        if (m[chave]) texturas.add(m[chave].uuid);
      }
    }
  });
  return {
    triangulos: Math.round(triangulos),
    malhas,
    materiais: materiais.size,
    texturas: texturas.size,
    raioOriginal: Number(raioOriginal.toFixed(3)),
    fatorDeEscala: Number(fator.toFixed(5)),
  };
}
