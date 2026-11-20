// Genera la galería de avatares (spec 004) en public/avatares/<id>.svg y src/lib/avatares.ts.
// Personajes originales del proyecto: todos comparten la misma cara (ojos con brillo, cachetes y
// sonrisa) y un fondo redondo de color. `node scripts/generar-avatares.mjs`.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const raiz = join(import.meta.dirname, '..');
const TINTA = '#1f2a28';

const ojos = (x1, x2, y, r = 4.2) => [x1, x2].map((x) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${TINTA}"/><circle cx="${x + r * 0.35}" cy="${y - r * 0.4}" r="${r * 0.35}" fill="#fff"/>`).join('');
const cachetes = (x1, x2, y, color = '#ff8f8f') =>
  `<ellipse cx="${x1}" cy="${y}" rx="5" ry="3.2" fill="${color}" opacity=".55"/><ellipse cx="${x2}" cy="${y}" rx="5" ry="3.2" fill="${color}" opacity=".55"/>`;
const sonrisa = (x, y, w = 8) =>
  `<path d="M${x - w / 2} ${y} q${w / 2} ${w * 0.6} ${w} 0" fill="none" stroke="${TINTA}" stroke-width="2.6" stroke-linecap="round"/>`;
const cara = (x1, x2, yOjos, yBoca, yCach = yOjos + 9) => ojos(x1, x2, yOjos) + cachetes(x1 - 5, x2 + 5, yCach) + sonrisa((x1 + x2) / 2, yBoca);

// Cada personaje: nombre accesible, color de fondo y el dibujo (viewBox 0 0 96 96).
const PERSONAJES = {
  zorro: ['Zorro', '#ffe2cc', `
    <path d="M22 30 L30 8 L42 26 Z" fill="#f07a2b"/><path d="M74 30 L66 8 L54 26 Z" fill="#f07a2b"/>
    <path d="M27 27 L31 15 L37 25 Z" fill="#ffd2b0"/><path d="M69 27 L65 15 L59 25 Z" fill="#ffd2b0"/>
    <path d="M18 44 C18 26 78 26 78 44 C78 64 62 78 48 78 C34 78 18 64 18 44 Z" fill="#f07a2b"/>
    <path d="M26 54 C34 52 42 58 48 66 C54 58 62 52 70 54 C68 68 58 78 48 78 C38 78 28 68 26 54 Z" fill="#fff4ea"/>
    <ellipse cx="48" cy="64" rx="4" ry="3" fill="${TINTA}"/>${ojos(37, 59, 47)}${cachetes(31, 65, 56)}
    <path d="M44 70 q4 3 8 0" fill="none" stroke="${TINTA}" stroke-width="2.4" stroke-linecap="round"/>`],
  pulpo: ['Pulpo', '#f1e0ff', `
    ${[18, 30, 42, 54, 66].map((x, i) => `<path d="M${x + 6} 52 q${i % 2 ? 6 : -6} 14 ${i % 2 ? -1 : 1} 26" fill="none" stroke="#a45ee5" stroke-width="8" stroke-linecap="round"/>`).join('')}
    <path d="M18 44 C18 14 78 14 78 44 C78 56 66 60 48 60 C30 60 18 56 18 44 Z" fill="#b774f0"/>
    <circle cx="34" cy="24" r="4" fill="#d6a8ff"/><circle cx="62" cy="21" r="3" fill="#d6a8ff"/>
    ${cara(38, 58, 38, 48)}`],
  buho: ['Búho', '#e3f0d6', `
    <path d="M24 26 L30 12 L38 24 Z" fill="#8a5a3c"/><path d="M72 26 L66 12 L58 24 Z" fill="#8a5a3c"/>
    <ellipse cx="48" cy="52" rx="28" ry="30" fill="#a8714d"/>
    <ellipse cx="48" cy="62" rx="16" ry="16" fill="#f3dcc2"/>
    <circle cx="37" cy="42" r="10" fill="#fff8ee"/><circle cx="59" cy="42" r="10" fill="#fff8ee"/>
    ${ojos(37, 59, 42, 4.6)}<path d="M44 50 L52 50 L48 57 Z" fill="#f2a33a"/>
    ${cachetes(28, 68, 54)}<path d="M40 68 q2 2 4 0 M46 70 q2 2 4 0 M52 68 q2 2 4 0" fill="none" stroke="#c79a72" stroke-width="2" stroke-linecap="round"/>`],
  gato: ['Gato', '#dde9ff', `
    <path d="M20 40 L24 12 L42 28 Z" fill="#7d8aa3"/><path d="M76 40 L72 12 L54 28 Z" fill="#7d8aa3"/>
    <path d="M25 33 L27 19 L36 28 Z" fill="#ffb8c6"/><path d="M71 33 L69 19 L60 28 Z" fill="#ffb8c6"/>
    <ellipse cx="48" cy="52" rx="30" ry="26" fill="#93a0b8"/>
    <path d="M42 30 l2 8 M48 28 v9 M54 30 l-2 8" stroke="#7d8aa3" stroke-width="3" stroke-linecap="round"/>
    ${ojos(37, 59, 50)}${cachetes(30, 66, 59)}<path d="M45 57 L51 57 L48 60 Z" fill="#ff8fa3"/>
    <path d="M44 63 q2 3 4 0 q2 3 4 0" fill="none" stroke="${TINTA}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M22 56 h-10 M22 61 l-9 3 M74 56 h10 M74 61 l9 3" stroke="${TINTA}" stroke-width="1.8" stroke-linecap="round" opacity=".6"/>`],
  perro: ['Perro', '#fff1c7', `
    <ellipse cx="22" cy="44" rx="10" ry="20" fill="#8b5e3c" transform="rotate(15 22 44)"/>
    <ellipse cx="74" cy="44" rx="10" ry="20" fill="#8b5e3c" transform="rotate(-15 74 44)"/>
    <ellipse cx="48" cy="50" rx="27" ry="28" fill="#d9a066"/>
    <ellipse cx="58" cy="40" rx="9" ry="8" fill="#f3d2a8"/>
    <ellipse cx="48" cy="64" rx="14" ry="11" fill="#f3d2a8"/>
    ${ojos(38, 58, 46)}${cachetes(31, 65, 57)}<ellipse cx="48" cy="59" rx="5" ry="3.6" fill="${TINTA}"/>
    <path d="M43 65 q5 4 10 0" fill="none" stroke="${TINTA}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M48 66 v4 q0 4 3 4 q3 0 3 -4 v-3" fill="#ff8fa3"/>`],
  conejo: ['Conejo', '#ffe0ec', `
    <ellipse cx="36" cy="22" rx="8" ry="20" fill="#f4f1f6"/><ellipse cx="60" cy="22" rx="8" ry="20" fill="#f4f1f6"/>
    <ellipse cx="36" cy="22" rx="4" ry="14" fill="#ffb8cf"/><ellipse cx="60" cy="22" rx="4" ry="14" fill="#ffb8cf"/>
    <ellipse cx="48" cy="58" rx="28" ry="24" fill="#f4f1f6"/>
    ${ojos(38, 58, 54)}${cachetes(31, 65, 63)}<path d="M45 61 L51 61 L48 64 Z" fill="#ff8fb0"/>
    <path d="M44 67 q2 3 4 0 q2 3 4 0" fill="none" stroke="${TINTA}" stroke-width="2.2" stroke-linecap="round"/>
    <rect x="45" y="69" width="6" height="5" rx="1.5" fill="#fff" stroke="#d9d3dc" stroke-width="1"/>`],
  oso: ['Oso', '#ffe7d1', `
    <circle cx="26" cy="28" r="11" fill="#9c6b45"/><circle cx="70" cy="28" r="11" fill="#9c6b45"/>
    <circle cx="26" cy="28" r="5.5" fill="#d9a77d"/><circle cx="70" cy="28" r="5.5" fill="#d9a77d"/>
    <circle cx="48" cy="52" r="29" fill="#b07b52"/>
    <ellipse cx="48" cy="62" rx="13" ry="10" fill="#e8c39f"/>
    ${ojos(37, 59, 47)}${cachetes(30, 66, 56)}<ellipse cx="48" cy="58" rx="5" ry="3.6" fill="${TINTA}"/>
    <path d="M44 64 q4 3 8 0" fill="none" stroke="${TINTA}" stroke-width="2.4" stroke-linecap="round"/>`],
  pinguino: ['Pingüino', '#d8f1f7', `
    <ellipse cx="48" cy="52" rx="28" ry="32" fill="#2f3d4c"/>
    <path d="M30 50 C30 34 66 34 66 50 C66 70 58 80 48 80 C38 80 30 70 30 50 Z" fill="#fbfdff"/>
    <path d="M32 42 C36 30 60 30 64 42 C58 38 38 38 32 42 Z" fill="#2f3d4c"/>
    ${ojos(40, 56, 46)}${cachetes(33, 63, 55)}<path d="M43 53 L53 53 L48 60 Z" fill="#f5a524"/>
    <ellipse cx="38" cy="84" rx="7" ry="3.5" fill="#f5a524"/><ellipse cx="58" cy="84" rx="7" ry="3.5" fill="#f5a524"/>`],
  rana: ['Rana', '#e6f6d0', `
    <circle cx="32" cy="32" r="12" fill="#5fb85a"/><circle cx="64" cy="32" r="12" fill="#5fb85a"/>
    <circle cx="32" cy="32" r="8" fill="#fff"/><circle cx="64" cy="32" r="8" fill="#fff"/>
    <ellipse cx="48" cy="58" rx="32" ry="22" fill="#6cc867"/>
    ${ojos(32, 64, 32, 4.4)}${cachetes(26, 70, 58)}
    <path d="M30 60 q18 14 36 0" fill="none" stroke="${TINTA}" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="40" cy="48" r="1.6" fill="#3f8f3b"/><circle cx="56" cy="48" r="1.6" fill="#3f8f3b"/>`],
  ballena: ['Ballena', '#d6ecff', `
    <path d="M48 20 q-4 -8 -10 -6 M48 20 q4 -8 10 -6 M48 20 v-8" fill="none" stroke="#7cc4ff" stroke-width="3" stroke-linecap="round"/>
    <path d="M14 56 C14 32 78 28 80 52 C82 66 70 78 48 78 C26 78 14 70 14 56 Z" fill="#4a9be0"/>
    <path d="M78 54 L90 44 L88 62 Z" fill="#4a9be0"/>
    <path d="M22 62 C30 72 64 74 76 62 C72 74 60 78 48 78 C34 78 24 72 22 62 Z" fill="#cfe8ff"/>
    ${cara(36, 56, 48, 58)}`],
  dino: ['Dino', '#dff5e8', `
    ${[30, 42, 54, 66].map((x) => `<path d="M${x - 6} 26 L${x} 14 L${x + 6} 26 Z" fill="#f2b84b"/>`).join('')}
    <path d="M18 52 C18 28 78 24 78 50 C78 68 66 80 48 80 C30 80 18 70 18 52 Z" fill="#4fbf8f"/>
    <circle cx="30" cy="40" r="3" fill="#3a9c72"/><circle cx="66" cy="36" r="4" fill="#3a9c72"/><circle cx="70" cy="62" r="3" fill="#3a9c72"/>
    ${ojos(38, 58, 48)}${cachetes(31, 65, 58)}
    <path d="M38 64 q10 9 20 0" fill="#fff" stroke="${TINTA}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M42 64 l2 3 l2 -3 M50 64 l2 3 l2 -3" fill="none" stroke="${TINTA}" stroke-width="1.2"/>`],
  caracol: ['Caracol', '#fff3d6', `
    <path d="M14 76 C14 66 26 62 40 62 L78 62 C84 62 86 70 80 74 C76 78 60 78 14 78 Z" fill="#f6c27a"/>
    <path d="M70 62 L66 34 M76 62 L80 36" stroke="#f6c27a" stroke-width="5" stroke-linecap="round"/>
    <circle cx="66" cy="32" r="4.5" fill="#f6c27a"/><circle cx="80" cy="34" r="4.5" fill="#f6c27a"/>
    <circle cx="38" cy="46" r="24" fill="#e0785a"/>
    <path d="M38 46 m0 -16 a16 16 0 1 1 -14 22 a11 11 0 1 1 18 -12 a6 6 0 1 1 -7 7" fill="none" stroke="#b9533a" stroke-width="3.2" stroke-linecap="round"/>
    ${ojos(64, 76, 54, 3.4)}${cachetes(60, 80, 62)}${sonrisa(70, 66, 6)}`],
};

const svg = (nombre, fondo, cuerpo) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="${nombre}">
<title>${nombre}</title>
<circle cx="48" cy="48" r="48" fill="${fondo}"/>
<g>${cuerpo.replace(/\n\s*/g, '')}</g>
</svg>
`;

await mkdir(join(raiz, 'public/avatares'), { recursive: true });
for (const [id, [nombre, fondo, cuerpo]] of Object.entries(PERSONAJES)) {
  await writeFile(join(raiz, 'public/avatares', `${id}.svg`), svg(nombre, fondo, cuerpo));
}
const lista = Object.entries(PERSONAJES).map(([id, [nombre]]) => `  { id: '${id}', nombre: '${nombre}' },`).join('\n');
await writeFile(join(raiz, 'src/lib/avatares.ts'), `// Generado por scripts/generar-avatares.mjs: la galería cerrada de la spec 004. Los ids deben ser los
// mismos del \`check\` de perfiles.avatar e hijos.avatar en 004_eventos_recordatorios_avatares.sql.
export const AVATARES = [
${lista}
] as const;
export type AvatarId = (typeof AVATARES)[number]['id'];
export const esAvatar = (v: unknown): v is AvatarId => AVATARES.some((a) => a.id === v);
export const urlAvatar = (id: string) => \`/avatares/\${id}.svg\`;
export const nombreAvatar = (id: string) => AVATARES.find((a) => a.id === id)?.nombre ?? id;
`);
console.log(`${Object.keys(PERSONAJES).length} avatares`);
