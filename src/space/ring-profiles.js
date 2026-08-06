/**
 * Os três sistemas de anéis reais do Sistema Solar, como perfil de densidade radial.
 *
 * Um anel de verdade não é um aro: é uma estrutura de faixas com larguras, brilhos e vãos
 * específicos, e é exatamente essa estrutura que o olho reconhece como "anel planetário". Um
 * aro liso lê como marcador de interface, por mais bem desenhado que esteja — o que faltava na
 * primeira versão.
 *
 * As tabelas abaixo são as distâncias reais, em **raios do planeta** (a fonte é a geometria
 * publicada de cada sistema; dividir por R deixa os três comparáveis e faz o perfil escalar
 * junto com a estrela sem nenhuma constante mágica). O que cada uma reproduz:
 *
 * | Família | Assinatura real |
 * |---|---|
 * | `saturn` | faixas largas C/B/A, a Divisão de Cassini entre B e A, a lacuna de Encke dentro de A, o F estreito por fora |
 * | `uranus` | dez anéis ESTREITOS e separados, o ε bem mais largo e brilhante que os outros |
 * | `jupiter` | halo espesso e difuso, um anel principal fino, e os dois gossamer desbotando para fora |
 *
 * ⚠️ **Duas licenças, ambas deliberadas.** (1) As larguras dos anéis de Urano são infladas: o ε
 * real tem ~96 km, que em raios de Urano é 0.004 — abaixo de um téxel deste perfil e MUITO
 * abaixo de um pixel na tela. Mantida a largura real, Urano seria um anel invisível. (2) O
 * brilho de cada família é normalizado para o pico 1: os anéis de Júpiter são, na realidade,
 * quase invisíveis, e um anel que não se vê não informa nada. **A geometria é real; o brilho
 * relativo ENTRE famílias não é.**
 */
import * as THREE from 'three';

// Téxeis do perfil. 1024 sobre ~3 raios planetários dá ~0.003 R por téxel — resolve a lacuna
// de Encke (0.006 R) com dois téxeis, que é o detalhe mais fino que sobrevive à tela.
const RESOLUTION = 1024;
// Ombro das bordas das faixas largas, em raios do planeta. A borda externa do anel B é
// famosamente abrupta; um ombro pequeno preserva isso sem serrilhar.
const EDGE = 0.006;

/**
 * `reach` é o raio onde o perfil termina, em raios do planeta — e portanto quanto o anel se
 * afasta da estrela. `sheets` são faixas contínuas `[de, até]`; `bands` são anéis estreitos
 * (centro, largura); `gaps` são vãos escavados depois de somadas as faixas.
 *
 * ## `obliquity` — e ela não estava aqui, que era o defeito
 *
 * Anel planetário fica no plano EQUATORIAL do planeta, então quanto ele sai do plano orbital é a
 * obliquidade do corpo — um dado real, por planeta, exatamente como `reach`. O anel do astro em
 * foco usava no lugar dela o `TILT` de `rings.js`, que é outra coisa: o achatamento da ELIPSE NA
 * TELA, calibrado para o billboard. Reusado como rotação de mundo, 1,1 rad põe todo anel a **63°
 * do plano orbital** — mais perto de Urano que de Saturno, com as referências pedindo Saturno.
 *
 * ⚠️ Urano é 97,8° de verdade e por isso o anel dele fica de pé. Não é defeito e não vai ser
 * suavizado: `staged → uranus` foi a família escolhida, e falsear a obliquidade faria o rótulo
 * mentir. Se a pose incomodar, o conserto é remapear o ESTADO para outra família.
 */
export const RING_FAMILIES = {
  saturn: {
    reach: 2.45,
    /** 26,73° — a obliquidade que dá a pose de todas as fotos de Saturno. */
    obliquity: 0.4665,
    // Gelo centimétrico: retroespalha. Ver `uForward` em `rings.js`.
    forward: 0,
    sheets: [
      { from: 1.110, to: 1.236, density: 0.07 }, // anel D
      { from: 1.239, to: 1.526, density: 0.24 }, // anel C ("crepe")
      { from: 1.526, to: 1.950, density: 1.00 }, // anel B — o mais brilhante
      { from: 2.026, to: 2.269, density: 0.62 }, // anel A
    ],
    bands: [
      { at: 2.326, width: 0.010, density: 0.45 }, // anel F
    ],
    // A Divisão de Cassini (1.950–2.026) não precisa ser escavada: ela é o intervalo VAZIO
    // entre as faixas B e A. Escavá-la duas vezes só apagaria as bordas das vizinhas.
    gaps: [
      { at: 2.216, width: 0.007, depth: 0.85 }, // lacuna de Encke, dentro do A
    ],
  },

  uranus: {
    reach: 2.20,
    /** 97,77° — Urano rola deitado, então o anel dele fica quase de pé. É o dado, não um exagero. */
    obliquity: 1.7064,
    // Partículas grandes e muito escuras (albedo ~0.05): também retroespalham.
    forward: 0,
    sheets: [],
    bands: [
      { at: 1.637, width: 0.010, density: 0.34 }, // 6
      { at: 1.652, width: 0.010, density: 0.38 }, // 5
      { at: 1.666, width: 0.010, density: 0.34 }, // 4
      { at: 1.750, width: 0.013, density: 0.55 }, // α
      { at: 1.786, width: 0.013, density: 0.55 }, // β
      { at: 1.846, width: 0.009, density: 0.30 }, // η
      { at: 1.863, width: 0.010, density: 0.45 }, // γ
      { at: 1.890, width: 0.011, density: 0.45 }, // δ
      { at: 1.957, width: 0.007, density: 0.16 }, // λ
      { at: 2.001, width: 0.024, density: 1.00 }, // ε — o largo e brilhante
    ],
    gaps: [],
  },

  jupiter: {
    reach: 3.20,
    /** 3,13° — praticamente no plano orbital, e é o que faz o anel de Júpiter ser sempre de perfil. */
    obliquity: 0.0546,
    // Poeira sub-micrométrica: lobo frontal dominante — é assim que a Voyager 2 o descobriu.
    forward: 1,
    sheets: [
      { from: 1.290, to: 1.710, density: 0.20 }, // halo, espesso e difuso
      { from: 1.710, to: 1.806, density: 0.55 }, // anel principal
      { from: 1.806, to: 2.550, density: 0.11 }, // gossamer de Amalteia
      { from: 2.550, to: 3.160, density: 0.05 }, // gossamer de Tebe
    ],
    bands: [],
    gaps: [],
  },
};

/** Transição suave e simétrica — o mesmo `smoothstep` do GLSL. */
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const gaussian = (x, center, width) => Math.exp(-(((x - center) / width) ** 2));

/**
 * Densidade bruta do perfil no raio `r` (em raios do planeta).
 *
 * Faixas e anéis SOMAM; vãos MULTIPLICAM. É a ordem física: a lacuna de Encke é matéria
 * removida de dentro do anel A, não uma faixa escura desenhada por cima dele.
 */
function densityAt(family, r) {
  let value = 0;
  for (const sheet of family.sheets) {
    value +=
      sheet.density *
      smoothstep(sheet.from - EDGE, sheet.from + EDGE, r) *
      (1 - smoothstep(sheet.to - EDGE, sheet.to + EDGE, r));
  }
  for (const band of family.bands) {
    value += band.density * gaussian(r, band.at, band.width);
  }
  for (const gap of family.gaps) {
    value *= 1 - gap.depth * gaussian(r, gap.at, gap.width);
  }
  return value;
}

/**
 * Suavização de três téxeis.
 *
 * Sem ela, uma borda abrupta de faixa ocupa menos de um téxel e cintila quando o anel fica
 * pequeno na tela — o perfil não tem mipmap (é 1D e a amostragem é sempre no mesmo eixo), então
 * a única defesa contra o aliasing é já entregar o dado sem degrau de um téxel.
 */
function smoothed(values) {
  return values.map((value, i) => {
    const before = values[Math.max(0, i - 1)];
    const after = values[Math.min(values.length - 1, i + 1)];
    return (before + value * 2 + after) / 4;
  });
}

/**
 * O perfil de uma família como textura 1D, pronta para o shader amostrar em `d` (0 no centro
 * da estrela, 1 no `reach` da família).
 *
 * RGBA e não `RedFormat`: são 4 KB por família — irrelevante — e RGBA não depende de o
 * contexto ser WebGL2, o que tira um modo de falha do caminho.
 */
export function profileTexture(name) {
  const family = RING_FAMILIES[name] ?? RING_FAMILIES.saturn;

  /*
   * O perfil vai de 1 (o limbo do planeta) até `reach`, e NÃO de 0.
   *
   * Começando em 0, quase metade dos téxeis descrevia a região dentro do planeta — onde não
   * existe anel — e a estrutura fina (a lacuna de Encke, os dez anéis de Urano) ficava
   * espremida no resto. Recortar o vazio devolve ~1.8× de resolução radial onde há o que ver.
   * O shader faz o remapeamento inverso por `uRadial`.
   */
  const span = family.reach - 1;
  const raw = [];
  for (let i = 0; i < RESOLUTION; i++) {
    raw.push(densityAt(family, 1 + ((i + 0.5) / RESOLUTION) * span));
  }

  const values = smoothed(raw);
  // Normaliza pelo pico: é o que põe as três famílias no mesmo patamar de legibilidade. Ver a
  // ressalva no topo do arquivo — a geometria é real, este brilho relativo não é.
  const peak = Math.max(...values, 1e-6);

  /*
   * Canal R: densidade. Canal G: a COLUNA de profundidade óptica acumulada do limbo até aquele
   * raio — a integral da densidade.
   *
   * Ela mora aqui, e não em quem desenha, porque é derivada DIRETA do perfil: recalcular do
   * outro lado abriria a chance de a integral e a densidade discordarem depois de uma edição
   * nesta tabela. E o custo é zero — a soma acontece na mesma passada que já normaliza.
   *
   * Serve à auto-sombra radial: aqui o primário é uma ESTRELA no centro, então a luz sai dele
   * NO plano do anel e o caminho da luz é o próprio raio. O que chega a um raio já atravessou
   * tudo que está entre a estrela e ele — o anel A fica atrás da parede que é o anel B.
   */
  const data = new Uint8Array(RESOLUTION * 4);
  let accumulated = 0;
  const column = values.map((value) => (accumulated += Math.min(1, value / peak)));
  const total = Math.max(accumulated, 1e-6);
  values.forEach((value, i) => {
    const level = Math.round(Math.min(1, value / peak) * 255);
    data.set([level, Math.round((column[i] / total) * 255), level, 255], i * 4);
  });

  const texture = new THREE.DataTexture(data, RESOLUTION, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  /*
   * COM mipmap. O anel costuma ocupar ~20 px de raio na tela e o perfil tem 1024 téxeis: a
   * minificação é de ~40:1, o caso patológico do aliasing. Sem mipmap a estrutura fina não
   * borra — ela CINTILA conforme o anel se move, que lê como bug de render. A suavização de
   * três téxeis defende contra degrau de um téxel, não contra 40:1.
   */
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return {
    texture,
    reach: family.reach,
    forward: family.forward ?? 0,
    obliquity: family.obliquity ?? RING_FAMILIES.saturn.obliquity,
  };
}
