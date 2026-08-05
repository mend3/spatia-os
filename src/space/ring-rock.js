/**
 * O campo de rocha do anel, em coordenadas polares — gerado em código, nunca baixado.
 *
 * A tese: contra minificação de ~40:1 (um anel de 20px de raio amostrando uma textura de 512
 * téxeis em azimute), **o filtro trilinear do hardware é a única defesa correta**. Ruído
 * procedural por fragmento não tem como integrar a área que o pixel cobre — ele só pode apagar
 * a oitava fina, e o que sobra é uma faixa lisa. Uma textura com mipmap INTEGRA.
 *
 * Por isso este campo existe só para o nível de perto: de longe o anel volta a ser perfil, que
 * é o que a indústria faz (SpaceEngine: "distant particles fade into dust and transition to 2D
 * rings"; Elite Dangerous: LOD discreto).
 *
 * 256 KB compartilhados por TODOS os anéis da cena — não é por anel.
 */
import * as THREE from 'three';

const GRAIN_RADIAL_TEXELS = 128;
const GRAIN_AZIM_TEXELS = 512;
/*
 * Contagem de células. O teto não é estético: a oitava mais fina multiplica por 4, e menos de
 * ~2 téxeis por célula aliasa DENTRO da textura, antes de qualquer mipmap poder ajudar.
 * 16×4 = 64 células em 128 téxeis e 60×4 = 240 em 512 — os dois ficam em ~2.
 */
const GRAIN_RADIAL_CELLS = 16;
// Inteiro: é o período que fecha a costura azimutal. Todas as oitavas o multiplicam por
// fator inteiro, senão a costura reabre na oitava fina.
const GRAIN_AZIM_CELLS = 60;
const GRAIN_PITCH = 0.45;

const wrap = (value, period) => ((value % period) + period) % period;

function hash2(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

/** Ruído de valor bilinear, periódico no eixo Y (o azimute). */
function noise2(x, y, periodY) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const y0 = wrap(iy, periodY);
  const y1 = wrap(iy + 1, periodY);
  const a = hash2(ix, y0);
  const b = hash2(ix + 1, y0);
  const c = hash2(ix, y1);
  const d = hash2(ix + 1, y1);
  return a + (b - a) * ux + ((c - a) + (a - b - c + d) * ux) * uy;
}

/**
 * Campo de rocha em coordenadas polares (x = raio, y = azimute), gerado em código.
 *
 * Três canais, três papéis: `R` é a modulação de densidade (0.5 neutro), `G` são pedregulhos
 * acesos e raros, `B` é o aglomerado de baixa frequência. Nasce com mipmap porque essa é a
 * tese: contra minificação de ~40:1 o filtro trilinear do hardware é a única defesa correta —
 * ruído procedural por fragmento não tem como integrar a área que o pixel cobre.
 */
export function rockTexture() {
  const data = new Uint8Array(GRAIN_RADIAL_TEXELS * GRAIN_AZIM_TEXELS * 4);

  for (let y = 0; y < GRAIN_AZIM_TEXELS; y++) {
    for (let x = 0; x < GRAIN_RADIAL_TEXELS; x++) {
      const rad = ((x + 0.5) / GRAIN_RADIAL_TEXELS) * GRAIN_RADIAL_CELLS;
      // O cisalhamento inclina a célula no ângulo de pitch dos wakes; o `wrap` do ruído
      // continua fechando a costura porque ele só olha o índice azimutal.
      const azi = ((y + 0.5) / GRAIN_AZIM_TEXELS) * GRAIN_AZIM_CELLS + rad * GRAIN_PITCH;

      const grain =
        0.5 * (noise2(rad, azi, GRAIN_AZIM_CELLS) - 0.5) +
        0.25 * (noise2(rad * 2, azi * 2, GRAIN_AZIM_CELLS * 2) - 0.5) +
        0.125 * (noise2(rad * 4, azi * 4, GRAIN_AZIM_CELLS * 4) - 0.5);

      // Expoente alto = evento raro. É o que separa "pedregulho" de "ruído por toda parte".
      const speck = Math.pow(noise2(rad * 4, azi * 4, GRAIN_AZIM_CELLS * 4), 9);
      const clump = noise2(rad * 0.5, azi * 0.5, GRAIN_AZIM_CELLS * 0.5);

      const offset = (y * GRAIN_RADIAL_TEXELS + x) * 4;
      data[offset] = Math.round(Math.min(1, Math.max(0, 0.5 + grain)) * 255);
      data[offset + 1] = Math.round(Math.min(1, speck) * 255);
      data[offset + 2] = Math.round(Math.min(1, Math.max(0, clump)) * 255);
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, GRAIN_RADIAL_TEXELS, GRAIN_AZIM_TEXELS, THREE.RGBAFormat);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  // O anel é visto sempre em obliquidade forte: sem anisotropia o mip escolhido é o do eixo
  // mais comprimido e a rocha vira borrão liso justamente no tombo em que a cena a usa.
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}
