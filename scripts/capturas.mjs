// Capturas de la vista previa (rúbrica C8 de cada spec) a 375 y 1280 px, en docs/capturas/<spec>/ (`SPEC=001` o `SPEC=002`, por defecto 002).
// Requiere `astro dev` corriendo en BASE (por defecto http://127.0.0.1:4323). `CHROMIUM_PATH` es opcional.
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4323';
const PANTALLAS = ['sin-sesion', 'crear-familia', 'inicio', 'inicio-invitando', 'invitacion-vigente', 'invitacion-vencida', 'semana', 'semana-vacia', 'terapias', 'terapia-detalle'];
const SPEC = process.env.SPEC ?? '002';
const DE_LA_SPEC = { '001': PANTALLAS.slice(0, 6), '002': PANTALLAS.slice(6) }[SPEC];
const ANCHOS = [375, 1280];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const esquema of ['light', 'dark']) {
  for (const ancho of ANCHOS) {
    const page = await browser.newPage({ viewport: { width: ancho, height: 900 }, deviceScaleFactor: 2, colorScheme: esquema, locale: 'es-AR' });
    for (const p of DE_LA_SPEC) {
      if (esquema === 'dark' && ancho !== 375) continue;
      await page.goto(`${BASE}/vista-previa/${p}`);
      await page.evaluate(() => document.fonts.ready);
      // La navegación inferior es sticky: con el viewport del alto del documento queda al final, como al
      // terminar el scroll, en lugar de aparecer a media página en la captura.
      const alto = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: ancho, height: Math.max(900, alto) });
      const sufijo = esquema === 'dark' ? '-oscuro' : '';
      await page.screenshot({ path: `docs/capturas/${SPEC}/${p}-${ancho}${sufijo}.png`, fullPage: true });
      await page.setViewportSize({ width: ancho, height: 900 });
    }
    await page.close();
  }
}
await browser.close();
console.log('capturas listas');
