/**
 * Rendering a JS number into GLSL source, without the two ways it goes wrong quietly.
 *
 * Shaders in this project take their constants from JS by interpolation — `photosphere.js` has
 * done it since it was written (`const float LIMB_U = ...`), and it is what lets a value have ONE
 * home instead of one per language. The interpolation itself has a trap at each end:
 *
 * 1. **`26` interpolates as `26`, which is an int**, and GLSL will not assign an int to a float.
 *    The shader fails to compile and the body disappears — the failure mode this codebase already
 *    pays for elsewhere, visible only in the console.
 * 2. **`.toFixed(n)` silently truncates.** It is the current idiom and it works only because every
 *    value happens to fit the digit count someone chose by hand. The day a rate becomes `0.0145`
 *    under a `toFixed(3)`, the shader keeps compiling and runs at `0.014` — a number no one wrote,
 *    disagreeing with the JS that claims to be its source.
 *
 * `String(value)` is exact for every finite double (it is the shortest round-tripping form), so
 * the only thing left to add is the decimal point.
 */

/**
 * A finite number as a GLSL float literal.
 *
 * @param {number} value
 * @returns {string}
 */
export function glslFloat(value) {
  if (!Number.isFinite(value)) throw new RangeError(`glslFloat: ${value} não é um float GLSL`);
  const text = String(value);
  // A GLSL floating constant needs a decimal point OR an exponent — `1e-7` already qualifies, and
  // that is the only form `String` produces without a dot other than a plain integer.
  if (text.includes('.') || text.includes('e')) return text;
  return `${text}.0`;
}
