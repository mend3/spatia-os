/**
 * MALHA DE AUTOR — carregar, centrar, normalizar e MEDIR o que veio de um arquivo.
 *
 * ## Quando um objeto desta cena pode vir de arquivo
 *
 * O resto do céu é procedural porque é CONTEÚDO: a forma sai do fato (`chunks` vira tamanho,
 * `sections` vira módulos). Malha de autor não pode descrever fato nenhum — ela é fixa, e um
 * arquivo não sabe quantos chunks o corpo tem.
 *
 * ⭑ Então ela serve a duas coisas, e só a essas: o que **não é conteúdo** (a sonda do operador) e o
 * que é **corpo sem fato próprio** (um asteroide, que não vem do corpus). Para todo o resto, malha
 * de autor seria a forma deixando de significar.
 *
 * ## O que este módulo garante, e o que ele deliberadamente NÃO faz
 *
 * Ele CENTRA e NORMALIZA — sem isso a malha aparece na escala do autor, que não tem relação nenhuma
 * com a régua desta cena, e gira em torno da origem do arquivo em vez de sobre si.
 *
 * ☠️ **Ele não escolhe MATERIAL.** GLB traz o do autor; STL não traz nada — é geometria pura. Quem
 * chama decide, porque material é significado: um asteroide de cromo e um de rocha carregam a mesma
 * geometria e afirmam coisas diferentes.
 */
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from '../../vendor/jsm/loaders/DRACOLoader.js';
import { STLLoader } from '../../vendor/jsm/loaders/STLLoader.js';

/** Onde mora o decodificador que o DRACO exige. Caminho absoluto: o servidor serve a raiz. */
const DRACO = '/vendor/jsm/libs/draco/gltf/';

/**
 * Centra na origem e escala para caber num raio conhecido.
 *
 * ⭑ **A escala sai da MEIA-DIAGONAL da caixa**, e a garantia é essa: a esfera de raio `raio`
 * circunscreve a caixa, então a malha **não ultrapassa `raio` em pose nenhuma**. É o número de quem
 * precisa reservar espaço sem saber a orientação.
 *
 * ⚠️ **Ela não ENCOSTA nesse raio.** Medido no Hubble, o vértice mais distante fica a **0,793** do
 * raio declarado. Raio APERTADO é outra grandeza — mede-se por vértice e perde a invariância à
 * rotação. A escolha aqui é a conservadora.
 *
 * ☠️ **Medir a caixa depois de rotacionar dá outro número, e é armadilha de MEDIDA, não de código:**
 * `Box3.setFromObject` sem `precise` usa a caixa de cada malha já transformada — caixa de caixa —, e
 * num objeto girado ela infla. Conferir normalização exige `precise`, ou pose zerada.
 */
export function normalizar(objeto, raio) {
  const caixa = new THREE.Box3().setFromObject(objeto);
  objeto.position.sub(caixa.getCenter(new THREE.Vector3()));

  const envolvente = caixa.getBoundingSphere(new THREE.Sphere());
  const fator = envolvente.radius > 0 ? raio / envolvente.radius : 1;

  const grupo = new THREE.Group();
  grupo.add(objeto);
  grupo.scale.setScalar(fator);
  return { grupo, raioOriginal: envolvente.radius, fator };
}

/**
 * O que a malha CUSTA, contado na própria malha.
 *
 * ⭑ Existe porque o tamanho do ARQUIVO não diz nada sobre o quadro. O que decide se ela cabe no
 * orçamento é triângulo, chamada de desenho e textura — e o céu inteiro com 213 instâncias custa
 * 0,31–0,35 ms, então estes números têm contra o que ser comparados.
 */
export function medir(raiz) {
  let triangulos = 0;
  let malhas = 0;
  const materiais = new Set();
  const texturas = new Set();
  raiz.traverse((n) => {
    if (!n.isMesh) return;
    malhas += 1;
    const g = n.geometry;
    triangulos += (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3;
    for (const m of Array.isArray(n.material) ? n.material : [n.material]) {
      if (!m) continue;
      materiais.add(m.uuid);
      for (const chave of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
        if (m[chave]) texturas.add(m[chave].uuid);
      }
    }
  });
  return { triangulos: Math.round(triangulos), malhas, materiais: materiais.size, texturas: texturas.size };
}

/**
 * Carrega um `.glb`. Devolve a cena do arquivo, com os materiais e texturas do autor.
 *
 * ⚠️ O `DRACOLoader` é sempre ligado: um `.glb` que declare `KHR_draco_mesh_compression` em
 * `extensionsRequired` falha sem ele com *"no DRACOLoader instance provided"* — erro de
 * CONFIGURAÇÃO que se parece com arquivo corrompido.
 */
export function carregarGLB(url) {
  const draco = new DRACOLoader().setDecoderPath(DRACO);
  return new GLTFLoader().setDRACOLoader(draco).loadAsync(url).then((gltf) => gltf.scene);
}

/**
 * Carrega um `.stl`. Devolve GEOMETRIA — não malha, não material.
 *
 * ☠️ **STL não tem material, não tem UV e não tem cena.** Ele é uma lista de triângulos com normal
 * POR FACE, e é por isso que ele renderiza facetado. Para um asteroide isso é a leitura certa e sai
 * de graça; quem quiser superfície lisa chama `computeVertexNormals()` e paga a perda das arestas.
 *
 * ⚠️ Sem UV, textura que dependa de `map` não tem onde se prender — o material tem de ser
 * procedural ou chapado.
 */
export function carregarSTL(url) {
  return new STLLoader().loadAsync(url);
}
