/**
 * A SONDA na bancada — a malha de autor, antes de qualquer decisão de cena.
 *
 * O que este espécime existe para responder, e nenhuma dessas perguntas se responde na cena cheia:
 *
 * 1. a malha CARREGA? (é DRACO, e o decodificador é vendorizado — falha aqui é configuração)
 * 2. ela está CENTRADA e NORMALIZADA, ou gira em torno da origem do autor?
 * 3. quanto ela CUSTA — triângulo, chamada de desenho, textura — contra o céu inteiro, que
 *    custa 0,31–0,35 ms com 213 instâncias;
 * 4. ela se LÊ como objeto construído a distâncias diferentes, ou vira mancha?
 *
 * ⚠️ **A carga é assíncrona e o `build()` é síncrono.** O espécime devolve um grupo VAZIO e o
 * preenche quando a promessa resolve — quem esperar dentro do `build` trava o primeiro quadro. Até
 * lá o painel diz `carregando`, e nunca um zero que pareça medida.
 */
import * as THREE from 'three';
import { carregarSonda, RAIO } from '../space/sonda.js';

export const SONDA_SPEC = {
  id: 'sonda',
  name: 'SONDA (operador)',
  distance: 4,
  controls: [
    { key: 'giro', label: 'GIRO AUTOMÁTICO', type: 'bool', value: true },
    { key: 'escala', label: 'ESCALA', type: 'range', min: 0.2, max: 4, step: 0.1, value: 1 },
    { key: 'inclinacao', label: 'INCLINAÇÃO', type: 'range', min: -1.57, max: 1.57, step: 0.01, value: 0.3 },
    { key: 'malha', label: 'ARAME (ver topologia)', type: 'bool', value: false },
    { key: 'luz', label: 'LUZ FRONTAL', type: 'range', min: 0, max: 3, step: 0.1, value: 1.4 },
    { key: 'ambiente', label: 'LUZ AMBIENTE', type: 'range', min: 0, max: 2, step: 0.05, value: 0.35 },
    { key: 'envolvente', label: 'ESFERA ENVOLVENTE', type: 'bool', value: false },
  ],
  watch: [
    'ela CARREGA: o painel troca `carregando` por contagem de triângulo. Se ficar em carregando, é o DRACO',
    'com GIRO ligado ela roda sobre SI — se orbitar um ponto fora dela, o centro não foi corrigido',
    'ESFERA ENVOLVENTE ligada: a malha cabe DENTRO e sobra folga — o vértice mais distante fica a 0,793 do raio, porque a esfera circunscreve a CAIXA e não a malha',
    'ARAME mostra a densidade real: onde o triângulo se acumula é o que vai custar quando ela entrar na cena',
    'LUZ a zero: a malha some. Ela não tem material emissivo — ao contrário da estação, que é contorno',
  ],
  build(ctx) {
    const grupo = new THREE.Group();

    /*
     * A LUZ é do espécime, não do módulo.
     *
     * A cena tem UMA fonte (o núcleo) e ela ilumina conteúdo. A sonda é o operador e não orbita o
     * núcleo, então iluminá-la com aquela luz a deixaria preta de um lado sem que isso significasse
     * nada — o mesmo argumento que fez `station.js` recusar material iluminado. Aqui a luz existe
     * só para revelar a FORMA da malha de autor, que é o que se está revisando.
     */
    const frontal = new THREE.DirectionalLight(0xffffff, 1.4);
    frontal.position.set(2, 3, 4);
    const ambiente = new THREE.AmbientLight(0xbcd0ff, 0.35);
    grupo.add(frontal, ambiente);

    const envolvente = new THREE.Mesh(
      new THREE.SphereGeometry(RAIO, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x6fe0ff, wireframe: true, transparent: true, opacity: 0.25 })
    );
    envolvente.visible = false;
    grupo.add(envolvente);

    const pivo = new THREE.Group();
    grupo.add(pivo);

    let medida = null;
    let erro = null;
    let malhas = [];

    carregarSonda()
      .then((sonda) => {
        pivo.add(sonda.objeto);
        medida = sonda.medida;
        sonda.objeto.traverse((n) => {
          if (n.isMesh) malhas.push(n);
        });
      })
      .catch((e) => {
        erro = e.message;
      });

    return {
      object: grupo,
      update(values, camera, clock) {
        pivo.scale.setScalar(values.escala);
        pivo.rotation.x = values.inclinacao;
        // O giro é do ESPÉCIME: quem revisa quer varrer o ângulo, e o relógio da bancada é manual.
        if (values.giro) pivo.rotation.y = clock.elapsed * 0.4;
        envolvente.visible = values.envolvente;
        envolvente.scale.setScalar(values.escala);
        frontal.intensity = values.luz;
        ambiente.intensity = values.ambiente;
        for (const m of malhas) {
          for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
            if (mat && mat.wireframe !== values.malha) mat.wireframe = values.malha;
          }
        }
        /*
         * ⚠️ `carregando` e `0 triângulos` NÃO são a mesma coisa, e o painel tem de distingui-las:
         * um zero durante a carga se lê como malha vazia, que é a medida errada com cara de certa.
         */
        ctx.report(
          erro
            ? { ESTADO: 'FALHOU', MOTIVO: erro }
            : !medida
              ? { ESTADO: 'carregando…', ARQUIVO: 'hubble-space-telescope.glb · DRACO' }
              : {
                  TRIÂNGULOS: medida.triangulos.toLocaleString('pt-BR'),
                  MALHAS: `${medida.malhas} · ${medida.materiais} materiais · ${medida.texturas} texturas`,
                  'RAIO DE MUNDO': (RAIO * values.escala).toFixed(2),
                  NORMALIZAÇÃO: `raio de autor ${medida.raioOriginal} × ${medida.fatorDeEscala}`,
                },
        );
      },
      dispose() {
        malhas = [];
      },
    };
  },
};
