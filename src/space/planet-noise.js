/**
 * Ruído simplex 3D de Ashima Arts, e o campo de terreno construído em cima dele — como texto
 * GLSL.
 *
 * Módulo separado pelo mesmo motivo de `ring-noise.js`: é código de terceiro com licença
 * própria (fica isolado, com o cabeçalho intacto) e a página não tem build, então não há
 * `#include` — o shader é montado por concatenação de string.
 *
 * **Por que 3D e não 2D com UV.** A esfera do planeta é uma UV-sphere: ela tem uma costura em
 * u=0 e dois polos onde os téxeis convergem. Qualquer ruído amostrado em `uv` desenha essa
 * costura como uma cicatriz de meridiano e esmaga o padrão nos polos. Amostrado em `position`
 * — o ponto na esfera unitária, que é contínuo e não tem costura nenhuma — o campo não sabe
 * que existe uma parametrização. É a razão pela qual a referência
 * (`dgreenheck/threejs-procedural-planets`) usa simplex 3D, e é a decisão que faz o planeta
 * fechar.
 *
 * Fonte: https://github.com/stegu/webgl-noise — `src/noise3D.glsl`. A versão abaixo é a compacta
 * que a referência embute em `index.html:22-93`, com os `mod289` já inlineados.
 */

/*
 * Copyright (C) 2011 Ashima Arts. All rights reserved.
 * Distributed under the MIT License.
 * https://github.com/ashima/webgl-noise · https://github.com/stegu/webgl-noise
 */
export const GLSL_SIMPLEX3 = /* glsl */ `
  vec4 permute(vec4 x){ return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

  float simplex3(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    // N*N pontos uniformes num quadrado, mapeados num octaedro.
    float n_ = 1.0 / 7.0;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
`;

/**
 * O campo de terreno: fbm com oitavas que ENTRAM por rampa, e a altura já com o mar recortado.
 *
 * Duas divergências deliberadas em relação à referência, as duas com motivo:
 *
 * 1. **A contagem de oitavas não é um `int` uniforme.** Na referência o laço é
 *    `for (int i = 0; i < octaves; i++)` com `octaves` uniforme — forma que a GLSL ES 1.00 não
 *    garante compilar (o limite tem de ser expressão constante). Aqui o limite é constante e o
 *    controle é `uDetail`, um float: a oitava `i` entra com ganho `clamp(detail - i, 0, 1)`.
 *    Ganha duas coisas de graça — o nível de detalhe deixa de POPAR (a oitava aparece por
 *    rampa em vez de surgir inteira num quadro) e o `break` em ganho zero economiza de verdade
 *    as oitavas que não estão sendo usadas.
 *
 *    ⚠️ O `break` num laço de limite constante é legal em GLSL ES 1.00 (o Apêndice A restringe
 *    a FORMA do laço, não o corpo) e esta página roda em WebGL2, onde a restrição nem se aplica
 *    — mas **não foi compilado nesta sessão**, porque não houve navegador. Se algum driver o
 *    rejeitar, o sintoma é o de sempre: o planeta some e o erro fica só no console. A troca
 *    segura é apagar a linha do `break`; o campo continua idêntico, só deixa de economizar.
 *
 * 2. **`ridged` é uma mistura contínua, não um `if (type == 3)`.** O tipo de relevo aqui não é
 *    escolha de menu, é consequência da massa (corpo pequeno é irregular e cristado, corpo
 *    grande é liso), e massa é contínua. Um `if` produziria um degrau numa grandeza que não
 *    tem degrau.
 *
 * **O mar não é um objeto.** Ele é o piso do `max(0, h - sea)`: tudo que a subtração levou a
 * zero fica PLANO, e uma superfície plana no meio de um terreno rugoso lê como oceano. É o
 * mesmo truque do `offset` da referência (`index.html:155`), só com o sinal invertido para que
 * o controle se chame "mar" e subir signifique mais água.
 */
export const GLSL_TERRAIN = /* glsl */ `
  const int MAX_OCTAVES = 8;

  float fbm3(vec3 v, float period, float persistence, float lacunarity, float detail) {
    float total = 0.0;
    float amp = 1.0;
    float norm = 0.0;
    float p = period;
    for (int i = 0; i < MAX_OCTAVES; i++) {
      float gain = clamp(detail - float(i), 0.0, 1.0);
      if (gain <= 0.0) break;
      total += amp * gain * simplex3(v / p);
      norm += amp * gain;
      amp *= persistence;
      p /= lacunarity;
    }
    return total / max(norm, 0.0001);
  }

  float terrainHeight(
    vec3 v, float amplitude, float sharpness, float sea,
    float period, float persistence, float lacunarity, float detail, float ridged
  ) {
    float f = fbm3(v, period, persistence, lacunarity, detail);
    // Vales largos e cumes estreitos: sharpness > 1 empurra a massa do campo para baixo.
    float rolling = pow(max(0.0, (f + 1.0) * 0.5), sharpness);
    // 1 - abs(f) poe uma CRISTA onde o ruido cruza zero. E a assinatura de corpo pequeno.
    float ridges = pow(max(0.0, 1.0 - abs(f)), sharpness);
    return max(0.0, amplitude * mix(rolling, ridges, ridged) - sea);
  }
`;
