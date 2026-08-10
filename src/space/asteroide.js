/**
 * ASTEROIDE — forma de levantamento real, escolhida por HASH e nunca por sorteio.
 *
 * ## ☠️ «Randômico» aqui significa VARIADO, nunca imprevisível
 *
 * Sortear a malha por carga faria o mesmo corpo mudar de forma entre sessões — e a garantia do
 * `README.md` é *"o mesmo conhecimento cai sempre no mesmo lugar"*. A REGRA DA COORDENADA protege
 * a posição; a mesma razão protege a FORMA, porque um corpo que troca de silhueta deixa de ser
 * reconhecível mesmo parado onde estava.
 *
 * ⭑ Então a escolha é `hash(id)`: **varia entre corpos e é fixa por corpo**, que é exatamente o que
 * o resto do céu já faz (`hash01(path, SALT_*)` em planeta, galáxia, quasar e pulsar). O olho lê
 * variedade; o operador lê estabilidade.
 *
 * ## O custo NÃO é uniforme, e a diferença é de 72×
 *
 * Medido nos oito arquivos (2026-08-09): de **2.780** triângulos (`8567-1996-hw1`) a **200.364**
 * (`25143-itokawa`) — este último sozinho é 68% do total dos oito. O céu inteiro com 213 instâncias
 * custa 0,31–0,35 ms, então pôr Itokawa em muitos corpos é uma decisão de orçamento, não de gosto.
 * `PESO` está declarado por malha para essa conta ser possível antes de desenhar.
 *
 * ## Textura: os planetas emprestam a PELE, e o STL não tem onde prendê-la
 *
 * ☠️ **Nenhum dos oito traz UV** — STL é lista de triângulos com normal por face, e nada mais. A UV
 * é GERADA aqui por projeção esférica, e a costura é corrigida por triângulo (a geometria não é
 * indexada, então cada face tem vértices próprios e a correção é local).
 */
import * as THREE from 'three';
import { carregarSTL, normalizar, medir } from './malha-de-autor.js';

/**
 * As oito formas, com o PESO medido em cada arquivo.
 *
 * ⚠️ O peso é medido, não estimado — e está aqui porque escolher malha sem ver o custo é como se
 * põe 200 mil triângulos numa cena que inteira custa 0,35 ms.
 */
export const MALHAS = Object.freeze([
  { id: '8567-1996-hw1', arquivo: 'asteroid-8567-1996-hw1.stl', triangulos: 2780 },
  { id: '216-kleopatra', arquivo: 'asteroid-216-kleopatra.stl', triangulos: 4092 },
  { id: '6489-golevka', arquivo: 'asteroid-6489-golevka.stl', triangulos: 4092 },
  { id: '4486-mithra', arquivo: 'asteroid-4486-mithra.stl', triangulos: 5996 },
  { id: '4179-toutatis', arquivo: 'asteroid-4179-toutatis.stl', triangulos: 12796 },
  { id: '1620-geographos', arquivo: 'asteroid-1620-geographos.stl', triangulos: 16380 },
  { id: '101955-bennu', arquivo: 'asteroid-101955-bennu.stl', triangulos: 49152 },
  { id: '25143-itokawa', arquivo: 'asteroid-25143-itokawa.stl', triangulos: 200364 },
]);

/**
 * As peles emprestadas dos planetas.
 *
 * ⚠️ **A Terra fica fora por decisão do operador**, e o Sol fica fora por outro motivo: ele é
 * ESTRELA, e uma rocha vestindo a superfície de uma estrela afirmaria emissão que ela não tem —
 * o céu já usa `sun.jpg` para o corpo que de fato emite.
 */
export const PELES = Object.freeze([
  'ceres.jpg',
  'mercury.jpg',
  'mars.jpg',
  'venus_surface.jpg',
  'jupiter.jpg',
  'saturn.jpg',
  'uranus.jpg',
  'neptune.jpg',
]);

const BASE_MALHA = '/assets/3d/';
const BASE_TEXTURA = '/assets/textures/';

/**
 * Que forma e que pele este corpo veste. Puro, determinístico, e sem tocar em rede.
 *
 * @param {string} id       identidade estável do corpo (`node.id` ou `source`)
 * @param {(t:string,s?:number)=>number} hash  o MESMO `hash01` do resto da cena
 */
export function asteroideParams(id, hash) {
  const malha = MALHAS[Math.floor(hash(id, 91) * MALHAS.length) % MALHAS.length];
  const pele = PELES[Math.floor(hash(id, 97) * PELES.length) % PELES.length];
  return {
    malha,
    pele,
    // A pose é do corpo, não da malha: dois corpos com a mesma forma não podem sair idênticos.
    giro: hash(id, 101) * Math.PI * 2,
    tombo: (hash(id, 103) - 0.5) * Math.PI,
    // Aspereza varia pouco de propósito: rocha é rocha. O que varia de verdade é forma e pele.
    aspereza: 0.82 + hash(id, 107) * 0.16,
  };
}

/**
 * Projeção esférica em geometria SEM UV, com a costura corrigida por triângulo.
 *
 * ☠️ **A costura é o defeito clássico desta projeção**: um triângulo que cruza `u = 0/1` recebe
 * vértices em lados opostos do atlas e a textura inteira se estica através dele. Como o STL não é
 * indexado, cada face tem vértices próprios — dá para corrigir localmente, somando 1 aos `u`
 * baixos do triângulo, sem duplicar vértice nem tocar em índice.
 *
 * ⚠️ Os polos continuam comprimidos: é inerente à projeção, e numa rocha irregular não há polo
 * geométrico que denuncie. Trocar por triplanar exigiria shader próprio, que é outro custo.
 */
export function gerarUV(geometria) {
  const pos = geometria.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    uv[i * 2] = 0.5 + Math.atan2(v.z, v.x) / (Math.PI * 2);
    uv[i * 2 + 1] = 0.5 - Math.asin(THREE.MathUtils.clamp(v.y, -1, 1)) / Math.PI;
  }
  for (let t = 0; t < pos.count; t += 3) {
    const a = uv[t * 2], b = uv[(t + 1) * 2], c = uv[(t + 2) * 2];
    if (Math.max(a, b, c) - Math.min(a, b, c) > 0.5) {
      for (let k = 0; k < 3; k++) if (uv[(t + k) * 2] < 0.5) uv[(t + k) * 2] += 1;
    }
  }
  geometria.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometria;
}

const cacheMalha = new Map();
const cacheTextura = new Map();

/** A geometria de uma malha, carregada UMA vez e com UV já gerada. */
export function geometriaDe(arquivo) {
  if (!cacheMalha.has(arquivo)) {
    cacheMalha.set(arquivo, carregarSTL(BASE_MALHA + arquivo).then(gerarUV));
  }
  return cacheMalha.get(arquivo);
}

/** A textura de uma pele, carregada UMA vez. */
export function texturaDe(nome) {
  if (!cacheTextura.has(nome)) {
    const t = new THREE.TextureLoader().load(BASE_TEXTURA + nome);
    t.colorSpace = THREE.SRGBColorSpace;
    // A projeção soma 1 aos `u` da costura, então o modo tem de repetir — `clamp` esticaria a borda.
    t.wrapS = THREE.RepeatWrapping;
    cacheTextura.set(nome, t);
  }
  return cacheTextura.get(nome);
}

/**
 * Monta um asteroide pronto para a cena, normalizado no raio pedido.
 *
 * ⚠️ **`flatShading` fica LIGADO**: a normal por face é o que o formato guarda, e é ela que faz a
 * rocha ler como rocha. Suavizar dá superfície de plástico com a mesma silhueta.
 */
export function criarAsteroide(params, raio = 1) {
  const grupo = new THREE.Group();
  const info = { medida: null, erro: null, malha: null };

  geometriaDe(params.malha.arquivo)
    .then((geometria) => {
      const material = new THREE.MeshStandardMaterial({
        map: texturaDe(params.pele),
        roughness: params.aspereza,
        metalness: 0.04,
        flatShading: true,
      });
      const malha = new THREE.Mesh(geometria, material);
      const { grupo: normalizado, raioOriginal, fator } = normalizar(malha, raio);
      normalizado.rotation.set(params.tombo, params.giro, 0);
      grupo.add(normalizado);
      info.malha = malha;
      info.medida = {
        ...medir(normalizado),
        raioOriginal: Number(raioOriginal.toFixed(3)),
        fatorDeEscala: Number(fator.toFixed(5)),
      };
    })
    .catch((e) => {
      info.erro = e.message;
    });

  return { objeto: grupo, info };
}
