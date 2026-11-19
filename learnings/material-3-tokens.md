# Material 3 a mano: lo que no se deduce del código

- `@material/material-color-utilities` 0.4.0 publica imports ESM sin extensión: Node no lo carga directo. `npm run tokens` lo empaqueta con esbuild antes de correrlo.
- El esquema oscuro de `themeFromSourceColor` pone `surface` en tono 10: si `surface-container-low` también es 10, las tarjetas desaparecen. Se usan tonos 14, 17 y 22.
- El `<summary>` de `<details>` estilado como botón necesita `list-style: none` y ocultar `::-webkit-details-marker`, o Safari muestra el triángulo.
- En una captura `fullPage` de Playwright, lo fijo o sticky aparece a la altura del viewport original: `scripts/capturas.mjs` agranda el viewport al alto del documento antes de capturar. Con `locale: 'es-AR'` los `input type="date"` se ven como en un celular argentino.
