// Capturas de la vista previa (spec 001, C8) a 375 y 1280 px, en docs/capturas/001/.
// Requiere `astro dev` corriendo en BASE (por defecto http://127.0.0.1:4323). `CHROMIUM_PATH` es opcional.
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4323';
const PANTALLAS = ['sin-sesion', 'crear-familia', 'inicio', 'inicio-invitando', 'invitacion-vigente', 'invitacion-vencida'];
const ANCHOS = [375, 1280];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const esquema of ['light', 'dark']) {
  for (const ancho of ANCHOS) {
    const page = await browser.newPage({ viewport: { width: ancho, height: 900 }, deviceScaleFactor: 2, colorScheme: esquema });
    for (const p of PANTALLAS) {
      if (esquema === 'dark' && ancho !== 375) continue;
      await page.goto(`${BASE}/vista-previa/${p}`);
      await page.evaluate(() => document.fonts.ready);
      const sufijo = esquema === 'dark' ? '-oscuro' : '';
      await page.screenshot({ path: `docs/capturas/001/${p}-${ancho}${sufijo}.png`, fullPage: true });
    }
    await page.close();
  }
}
await browser.close();
console.log('capturas listas');
