/**
 * Quem responde "que corpo é este, NA CENA EM VIGOR".
 *
 * Existe porque a HUD e a cena não se conhecem: o widget de CONTEXTO é montado pelo host de
 * widgets, que não recebe `scene`. Enfiar a cena por três camadas para carregar um rótulo seria
 * acoplamento maior que o problema — este registro é o seam explícito, com um dono só (`main.js`).
 *
 * ⚠️ Ele devolve `null` fora da cena UNIVERSO, e `null` significa **"pergunte ao catálogo antigo"**,
 * não "não sei". A HUD estava anunciando `GALÁXIA · dir · AGREGADO` em cima da cena nova — a mesma
 * classe de defeito da camada de galáxia que reacendia sozinha: o modelo velho falando por cima do
 * novo, e o usuário lendo a taxonomia que a ontologia já refutou.
 */
let resolvedor = null;

/** `main.js` registra; ninguém mais. Um dono só evita duas verdades sobre o mesmo rótulo. */
export function registrarTipoDeCorpo(fn) {
  resolvedor = typeof fn === 'function' ? fn : null;
}

/** `null` = a cena em vigor não tem opinião; o chamador usa o catálogo. */
export function tipoDeCorpo(source) {
  try {
    return resolvedor?.(source) ?? null;
  } catch {
    // Rótulo não vale derrubar a HUD: sem resposta, o catálogo antigo assume.
    return null;
  }
}
