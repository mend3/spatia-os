/**
 * Ruído simplex 2D **periódico**, de Stefan Gustavson (`webgl-noise`), como string GLSL.
 *
 * Módulo separado por dois motivos: é código de terceiro com licença própria (fica isolado,
 * com o cabeçalho intacto), e o anel só precisa dele como texto para concatenar no shader —
 * a página não tem build, então não há como fazer `#include`.
 *
 * **Por que periódico e não um hash qualquer.** O anel é fechado em θ: qualquer campo que não
 * feche o período desenha uma cicatriz radial exatamente em ±π, e esse é o único artefato que
 * o olho lê como bug de render em vez de como pedra. `psnoise(pos, per)` fecha por construção,
 * bastando `per.x` inteiro e `per.y` par.
 *
 * Convenção deste projeto: **x é o azimute** (período = número de células na volta) e **y é o
 * raio** (período grande o bastante para nunca dar a volta dentro do anel).
 *
 * ⚠️ `rgrad2` aqui usa a variante de gradiente por MAPA DE LOSANGO, que no original está sob
 * `#if 0`. A variante padrão calcula `sin`/`cos` por canto — três senos e três cossenos por
 * amostra, vezes três oitavas, por fragmento. A isotropia extra que ela compra não se vê num
 * campo que é deliberadamente anisotrópico (as células são estrias alongadas).
 *
 * Fonte: https://github.com/stegu/webgl-noise — `src/psrdnoise2D.glsl`, versão 2016-05-10.
 */

/*
 * Copyright (c) 2016 Stefan Gustavson. All rights reserved.
 * Distributed under the MIT license.
 * https://github.com/stegu/webgl-noise
 */
export const GLSL_PSNOISE = /* glsl */ `
  vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }

  float mod289(float x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }

  // Polinomio de permutacao (anel de tamanho 289 = 17*17)
  float permute(float x) {
    return mod289(((x * 34.0) + 1.0) * x);
  }

  // Gradientes 2D com hash. 0.0243902439 = 1/41.
  vec2 rgrad2(vec2 p) {
    float u = permute(permute(p.x) + p.y) * 0.0243902439;
    u = 4.0 * fract(u) - 2.0;
    return vec2(abs(u) - 1.0, abs(abs(u + 1.0) - 2.0) - 1.0);
  }

  // Simplex 2D com ladrilhamento: per.x inteiro positivo, per.y inteiro PAR positivo.
  float psnoise(vec2 pos, vec2 per) {
    // Deslocamento minimo em y: esconde artefatos raros de precisao no indice do gradiente.
    pos.y += 0.001;
    vec2 uv = vec2(pos.x + pos.y * 0.5, pos.y);

    vec2 i0 = floor(uv);
    vec2 f0 = fract(uv);
    vec2 i1 = (f0.x > f0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);

    vec2 p0 = vec2(i0.x - i0.y * 0.5, i0.y);
    vec2 p1 = vec2(p0.x + i1.x - i1.y * 0.5, p0.y + i1.y);
    vec2 p2 = vec2(p0.x + 0.5, p0.y + 1.0);

    vec2 d0 = pos - p0;
    vec2 d1 = pos - p1;
    vec2 d2 = pos - p2;

    // O ladrilhamento acontece AQUI: os indices vao ao periodo antes do hash do gradiente.
    vec3 xw = mod(vec3(p0.x, p1.x, p2.x), per.x);
    vec3 yw = mod(vec3(p0.y, p1.y, p2.y), per.y);
    vec3 iuw = xw + 0.5 * yw;
    vec3 ivw = yw;

    vec2 g0 = rgrad2(vec2(iuw.x, ivw.x));
    vec2 g1 = rgrad2(vec2(iuw.y, ivw.y));
    vec2 g2 = rgrad2(vec2(iuw.z, ivw.z));

    vec3 w = vec3(dot(g0, d0), dot(g1, d1), dot(g2, d2));

    // 0.8 = quadrado de 2/sqrt(5), a distancia de um ponto de grade a fronteira do simplex.
    vec3 t = max(0.8 - vec3(dot(d0, d0), dot(d1, d1), dot(d2, d2)), 0.0);
    vec3 t2 = t * t;
    vec3 t4 = t2 * t2;

    // 11.0 reescala para cobrir [-1,1] razoavelmente bem.
    return 11.0 * dot(t4, w);
  }
`;
