/**
 * Os globais do NAVEGADOR que a lib padrão do TypeScript não declara, e que esta base usa de fato.
 *
 * ⚠️ **Cada entrada tem de ter chamador em `src/`.** Declaração aqui é promessa sobre o ambiente:
 * uma que ninguém usa é a mesma invariante-sem-leitor que o resto do projeto recusa.
 */

interface Window {
  /**
   * Safari antigo só expõe `AudioContext` com prefixo. Quatro módulos fazem
   * `window.AudioContext || window.webkitAudioContext` — sem esta linha, o fallback que MANTÉM o
   * som funcionando no Safari é reportado como erro de digitação.
   */
  webkitAudioContext?: typeof AudioContext;
}
