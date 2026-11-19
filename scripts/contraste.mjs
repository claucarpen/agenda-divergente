// Contraste WCAG de los pares de color de texto sobre fondo que usan los botones y los textos
// (rúbrica C8 de cada spec). Lee src/styles/tokens.css. Sale con 1 si algún par baja de 4.5:1.
import { readFileSync } from 'node:fs';

const css = readFileSync('src/styles/tokens.css', 'utf8');
const [claro, oscuro] = css.split('@media');
const leer = (bloque) => Object.fromEntries([...bloque.matchAll(/--md-([a-z-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const PARES = [
  ['on-primary', 'primary', 'botón relleno'],
  ['on-secondary-container', 'secondary-container', 'botón tonal y tarjeta de invitación'],
  ['primary', 'surface', 'botón de contorno y de texto'],
  ['primary', 'surface-container-low', 'botón de contorno dentro de tarjeta'],
  ['on-primary-container', 'primary-container', 'texto del encabezado'],
  ['on-surface-variant', 'surface-container-low', 'texto de apoyo en tarjeta'],
  ['on-error-container', 'error-container', 'aviso de error'],
  ['on-tertiary-container', 'tertiary-container', 'evento de la familia en la semana (spec 002)'],
  ['on-tertiary', 'tertiary', 'etiqueta "Familia" (spec 002)'],
  ['on-error', 'error', 'botón "Terminar terapia" (spec 002)'],
  ['on-surface-variant', 'surface-container', 'destino inactivo de la navegación (spec 002)'],
  ['primary', 'surface-container-low', 'nombre del día de hoy (spec 002)'],
  ['on-surface-variant', 'surface-container-high', 'turno cancelado (spec 003)'],
  ['on-secondary-container', 'secondary-container', 'turno cambiado (spec 003)'],
  ['on-primary', 'primary', 'etiqueta "Cambiado" (spec 003)'],
  ['on-error-container', 'error-container', 'etiqueta "No hay" (spec 003)'],
  ['on-primary-container', 'primary-container', 'mensaje de aviso de prueba enviado (spec 003)'],
];
let falla = false;
for (const [nombre, t] of [['claro', leer(claro)], ['oscuro', leer(oscuro)]]) {
  for (const [fg, bg, uso] of PARES) {
    const r = ratio(t[fg], t[bg]);
    if (r < 4.5) falla = true;
    console.log(`${r >= 4.5 ? 'OK  ' : 'BAJO'} ${r.toFixed(2)}:1  ${nombre}  ${fg} sobre ${bg} (${uso})`);
  }
}
process.exit(falla ? 1 : 0);
