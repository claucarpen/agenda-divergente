// Genera src/styles/tokens.css: los roles de color de Material 3 a partir del color semilla.
// Se corre a mano, desde la raíz, al cambiar la semilla: `npm run tokens` (esbuild lo empaqueta porque
// el paquete publica imports ESM sin extensión que Node no resuelve). El CSS generado se versiona.
import { argbFromHex, hexFromArgb, themeFromSourceColor } from '@material/material-color-utilities';
import { writeFileSync } from 'node:fs';

const SEMILLA = '#2f8f83'; // verde agua: fresco y sereno (decisions.md, [diseño])
const ROLES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'background', 'onBackground', 'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant',
  'outline', 'outlineVariant',
];
const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
const tema = themeFromSourceColor(argbFromHex(SEMILLA));
const bloque = (esquema) => ROLES.map((r) => `  --md-${kebab(r)}: ${hexFromArgb(esquema[r])};`).join('\n');
const tono = (paleta, t) => hexFromArgb(paleta.tone(t));
const n = tema.palettes.neutral;

const css = `/* Generado por scripts/generar-tokens.mjs desde la semilla ${SEMILLA}. No editar a mano. */
:root {
${bloque(tema.schemes.light.toJSON())}
  --md-surface-container-low: ${tono(n, 96)};
  --md-surface-container: ${tono(n, 94)};
  --md-surface-container-high: ${tono(n, 92)};
}
@media (prefers-color-scheme: dark) {
  :root {
${bloque(tema.schemes.dark.toJSON()).replace(/^/gm, '  ')}
    --md-surface-container-low: ${tono(n, 14)};
    --md-surface-container: ${tono(n, 17)};
    --md-surface-container-high: ${tono(n, 22)};
  }
}
`;
writeFileSync('src/styles/tokens.css', css);
console.log(css);
