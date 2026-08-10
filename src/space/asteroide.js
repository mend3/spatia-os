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
import { APARENCIAS, CONTEXTO } from './favoritos.js';

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
 * As peles que a rocha pode vestir — **LIDAS do catálogo de favoritos**, nunca repetidas aqui.
 *
 * ☠️ **Uma segunda lista era o defeito.** A pele que a rocha veste por HASH e a que o operador
 * ESCOLHE são a mesma pergunta; com duas tabelas, a primeira edição as separa — e o sintoma é o
 * painel oferecendo uma opção enquanto o céu desenha outra.
 *
 * ⚠️ `APARENCIAS[ROCHOSO]` é quem decide o conjunto, e o motivo de cada exclusão mora lá: os quatro
 * gigantes GASOSOS ficam fora porque mapa de atmosfera numa rocha lê como listra pintada.
 */
export const PELES = Object.freeze(
  Object.values(APARENCIAS[CONTEXTO.ROCHOSO]).map((a) => a.arquivo.replace('assets/textures/', ''))
);

const BASE_MALHA = '/assets/3d/';
const BASE_TEXTURA = '/assets/textures/';

/**
 * Que forma e que pele este corpo veste. Puro, determinístico, e sem tocar em rede.
 *
 * @param {string} id       identidade estável do corpo (`node.id` ou `source`)
 * @param {(t:string,s?:number)=>number} hash  o MESMO `hash01` do resto da cena
 */
export function asteroideParams(id, hash, arquivoEscolhido = null) {
  const malha = MALHAS[Math.floor(hash(id, 91) * MALHAS.length) % MALHAS.length];
  /*
   * ⭑ **A ESCOLHA do operador vence o hash, e o hash é o PADRÃO — nunca o contrário.**
   *
   * O hash existe para o céu ter variedade sem ninguém decidir nada; a marca existe para alguém
   * decidir. Quando as duas respondem, quem decidiu ganha — é a mesma precedência de `pedirFoco`
   * (pedido vence memória).
   *
   * ⚠️ **A escolha é CONFERIDA contra o catálogo**, e não aceita crua: `PELES` é derivada de
   * `APARENCIAS[ROCHOSO]`, então um arquivo de fora dela seria uma pele que este contexto não
   * aceita chegando pela porta dos fundos. Fora do catálogo, o hash responde.
   */
  const pedida = arquivoEscolhido ? arquivoEscolhido.replace('assets/textures/', '') : null;
  const pele = pedida && PELES.includes(pedida)
    ? pedida
    : PELES[Math.floor(hash(id, 97) * PELES.length) % PELES.length];
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
      /*
       * ☠️ **`DoubleSide`, e é a CONCAVIDADE que obriga.** Estas são formas de levantamento real, e
       * várias são profundamente côncavas — `216-kleopatra` é um binário de CONTATO, um osso com
       * cintura estreita. Com face única, a linha de visada entra pela cintura e sai do outro lado:
       * a parede interna oposta é traseira, é descartada, e o que aparece é o FUNDO. Lê-se como
       * "estou vendo dentro do asteroide", e o ângulo decide quando acontece.
       *
       * ⚠️ **Não é corte do plano near** — medido no corpo travado: raio de mundo 0,1432, câmera a
       * 0,4869, folga de 0,3437. A câmera está fora, e bem fora.
       *
       * ⚠️ O custo é desenhar as faces internas quando elas aparecem; numa malha opaca e fechada
       * elas quase nunca ficam visíveis, e onde ficam é precisamente onde a face única falhava.
       */
      const material = new THREE.MeshStandardMaterial({
        map: texturaDe(params.pele),
        roughness: params.aspereza,
        metalness: 0.04,
        flatShading: true,
        side: THREE.DoubleSide,
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

/** Onde a rocha começa a aparecer e onde satura, em pixels de raio. A régua das outras peles. */
export const LOD_FAR_PX = 26;
export const LOD_NEAR_PX = 110;

/**
 * ☠️ **ZERO — porque nenhuma ESFERA representa um corpo irregular.**
 *
 * `BODY_SPAN` tem dois leitores, e os dois pedem a mesma resposta aqui:
 *
 * 1. `keepsCrown` (`lod.js`) decide se o sprite mantém a coroa. Zero < `CROWN_FLOOR` (0,8), então
 *    o sprite **cede inteiro** e a rocha fica sozinha — que é o certo: ela é opaca e completa.
 * 2. `universe.cederParaVarios` usa este número como o raio do NÚCLEO — a esfera que fica sob a
 *    pele desenhada. Zero **some com a esfera**, e é a mesma saída da nebulosa.
 *
 * ⚠️ **O motivo é outro, e é medido.** A nebulosa zera porque não desenha corpo; a rocha desenha, e
 * mesmo assim nenhuma esfera cabe sob ela. O raio INSCRITO das oito malhas (2026-08-10, maior
 * esfera que cabe dentro, sobre o raio de referência):
 *
 * | malha | inscrito | | malha | inscrito |
 * |---|---|---|---|---|
 * | `216-kleopatra` | **0,124** | | `4179-toutatis` | 0,245 |
 * | `25143-itokawa` | 0,144 | | `6489-golevka` | 0,339 |
 * | `8567-1996-hw1` | 0,184 | | `101955-bennu` | **0,475** |
 * | `4486-mithra` | 0,196 | | `1620-geographos` | 0,213 |
 *
 * ☠️ **Um `span` do raio MÁXIMO (0,601) fura a rocha nas partes finas** — visto na tela: a esfera
 * azul do `universe` atravessando o meio da pedra, com a rocha aparecendo só nas bordas. E um
 * `span` do menor inscrito (0,124) seria uma bolinha inútil. Não há valor que sirva: **uma esfera
 * é a forma errada para descrever isto**, e a resposta honesta é não desenhar nenhuma.
 */
export const BODY_SPAN = 0;

/**
 * A pele de CENA — mesmo contrato das outras quatro morfológicas: `{ object, update(...) → nível }`.
 *
 * ☠️ **Esta é a única pele cuja geometria chega DEPOIS.** As outras quatro são procedurais e existem
 * no primeiro quadro; esta é arquivo, e a rede não tem prazo. Enquanto não chega, `update` devolve
 * **0** e o grupo fica invisível — e é isso que faz o sprite do corpo continuar respondendo por ele,
 * em vez de o astro sumir enquanto carrega.
 *
 * ⚠️ **O nível NÃO é `1` antes da malha existir.** Devolver nível cheio faria o `haloOf` do sprite
 * ceder para uma pele que ainda não desenha — o corpo apagaria e nada tomaria o lugar dele.
 */
export function createAsteroide() {
  const group = new THREE.Group();
  group.visible = false;

  /*
   * ☠️ **A CENA NÃO TEM UMA LUZ SEQUER**, e é isto que decide o material desta pele.
   *
   * Medido: nenhum `DirectionalLight`/`AmbientLight`/`PointLight` em `src/space/`. Um
   * `MeshStandardMaterial` ali renderiza PRETO — o corpo monta, fica visível, e desenha uma
   * silhueta escura. `station.js` já tinha batido nisso e escolheu `MeshBasicMaterial` por causa
   * disso; a rocha não pode fazer o mesmo, porque é a SOMBRA que carrega a forma dela (sem
   * sombreamento, a malha de levantamento vira um adesivo).
   *
   * ⭑ Então a luz vem JUNTO com a pele, e some com ela. A direção é a convenção já escrita da
   * cena: **o núcleo é o único corpo emissivo**, então ela vem do lado da origem.
   *
   * ⚠️ A ambiente é fraca de propósito: no vácuo o lado escuro é escuro, e o que ela evita é o
   * lado oposto virar recorte preto — que se lê como buraco, não como sombra.
   */
  const solar = new THREE.DirectionalLight(0xfff4e2, 2.8);
  solar.position.set(0.6, 0.5, 1);
  const ambiente = new THREE.AmbientLight(0x5a6a86, 0.4);
  group.add(solar, ambiente);

  /*
   * ⚠️ **O GIRO é do pivô, não do grupo — e é isso que mantém a luz parada.**
   *
   * Girando o grupo inteiro, a luz gira junto e o lado aceso fica colado na rocha: ela roda e o
   * sombreamento não muda, que é a leitura de adesivo. Com o pivô por dentro, a pedra passa sob
   * uma luz fixa e o relevo aparece — que é a única razão de esta pele ter material iluminado.
   */
  const pivo = new THREE.Group();
  group.add(pivo);

  let assinatura = null;
  let montado = null;

  return {
    object: group,
    update(params, px, elapsed) {
      const nivel = THREE.MathUtils.clamp((px - LOD_FAR_PX) / (LOD_NEAR_PX - LOD_FAR_PX), 0, 1);

      const chave = `${params.malha.id}|${params.pele}|${params.giro.toFixed(3)}`;
      if (chave !== assinatura) {
        assinatura = chave;
        if (montado) pivo.remove(montado.objeto);
        montado = criarAsteroide(params, 1);
        pivo.add(montado.objeto);
      }

      // Sem malha ainda: nível ZERO, e o sprite continua respondendo pelo corpo.
      const pronto = Boolean(montado?.info.malha);
      group.visible = pronto && nivel > 0.002;
      if (!group.visible) return 0;

      /*
       * O giro é LENTO e do corpo, não do relógio de quem olha: uma rocha girando rápido lê como
       * detrito em queda. `hash` já deu a fase, então dois asteroides nunca estão no mesmo ângulo.
       */
      pivo.rotation.y = params.giro + elapsed * 0.06;
      return nivel;
    },
  };
}
