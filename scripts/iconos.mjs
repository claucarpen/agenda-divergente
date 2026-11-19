// Genera los íconos de la app instalable (spec 003) a partir del isotipo: public/iconos/*.png.
// Se corre a mano al cambiar el isotipo: `node scripts/iconos.mjs` (`CHROMIUM_PATH` opcional).
import { chromium } from '@playwright/test';

const FONDO = '#74f8e5'; // primary-container claro (src/styles/tokens.css)
const TRAZO = '#006a60'; // primary
const PUNTO = '#456179'; // tertiary
// `relleno`: proporción del lado que ocupa el dibujo (los maskable necesitan zona segura del 80 %).
const isotipo = (lado, redondeo, relleno) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${redondeo}" fill="${FONDO}"/>
  <g transform="translate(16 16) scale(${relleno}) translate(-16 -16)">
    <path d="M9 20c0-5 3-9 7-9s7 4 7 9" fill="none" stroke="${TRAZO}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="16" cy="21" r="3.2" fill="${PUNTO}"/>
  </g>
</svg>`;
const ICONOS = [
  { archivo: 'icono-192.png', lado: 192, redondeo: 0, relleno: 1.15 },
  { archivo: 'icono-512.png', lado: 512, redondeo: 0, relleno: 1.15 },
  { archivo: 'icono-maskable-512.png', lado: 512, redondeo: 0, relleno: 0.9 },
  { archivo: 'apple-touch-icon.png', lado: 180, redondeo: 0, relleno: 1.15 },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const i of ICONOS) {
  const page = await browser.newPage({ viewport: { width: i.lado, height: i.lado } });
  await page.setContent(`<html><body style="margin:0">${isotipo(i.lado, i.redondeo, i.relleno)}</body></html>`);
  await page.screenshot({ path: `public/iconos/${i.archivo}`, clip: { x: 0, y: 0, width: i.lado, height: i.lado } });
  await page.close();
}
await browser.close();
console.log('íconos listos');
