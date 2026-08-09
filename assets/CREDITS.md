# Créditos de terceiros

Tudo o que este repositório usa e não escreveu. **Item novo entra aqui no mesmo commit em que
entra no disco** — atribuição descoberta depois da publicação é atribuição que já faltou.

## `textures/sun.jpg`

| | |
|---|---|
| obra | *2k Sun* — mapa de superfície solar, 2048×1024 |
| autor | **Solar System Scope** — <https://www.solarsystemscope.com/textures/> |
| licença | **CC BY 4.0** — <https://creativecommons.org/licenses/by/4.0/> |
| modificações | **nenhuma no arquivo.** É tingida em tempo de execução por temperatura (`FORCA_DO_MAPA` em `src/space/photosphere.js`); o JPEG em disco é o original |

**Atribuição exigida na publicação:** *Textura solar por Solar System Scope
(solarsystemscope.com), CC BY 4.0.*

⭑ **A identidade está PROVADA, não suposta:** `sha256` do arquivo aqui e do
`solarsystemscope.com/textures/download/2k_sun.jpg` são o mesmo —
`ff0f076ba65e03b5ab518451bc96699325be38e3ccbdd5869ee1c00f3a0c8816`, 822 427 bytes nos dois.
Conferir de novo é uma linha:

```bash
shasum -a 256 assets/textures/sun.jpg
```

⚠️ Ela chegou por um intermediário (`github.com/SoumyaEXE/3d-Solar-System-ThreeJS`) que **não
declara licença nenhuma**. O intermediário não é a fonte e não tem o que licenciar — quem licencia é
o autor, e é a ele que o crédito vai. Sem a conferência de hash isto continuaria sendo suposição.
