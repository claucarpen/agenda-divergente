import { expect, test } from '@playwright/test';

// Spec 003, C5: la app se puede instalar, y las páginas nuevas sin sesión no exponen nada.
test('003·C5: el manifest tiene nombre, inicio, standalone e íconos 192 y 512 que existen', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.status()).toBe(200);
  const m = await res.json();
  expect(m).toMatchObject({ name: 'Agenda Divergente', start_url: '/semana', display: 'standalone' });
  for (const lado of ['192x192', '512x512']) {
    const icono = m.icons.find((i: { sizes: string }) => i.sizes === lado);
    expect(icono, lado).toBeTruthy();
    const r = await request.get(icono.src);
    expect(r.status(), icono.src).toBe(200);
    expect(r.headers()['content-type']).toContain('image/png');
  }
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
});

test('003·C5: /sw.js es JavaScript y maneja push y notificationclick', async ({ request }) => {
  const res = await request.get('/sw.js');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/javascript/);
  const codigo = await res.text();
  expect(codigo).toContain("addEventListener('push'");
  expect(codigo).toContain("addEventListener('notificationclick'");
});

test('003·C5: el layout enlaza el manifest y el apple-touch-icon', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect((await page.request.get(apple!)).status()).toBe(200);
});

test('003·C5: /turno sin sesión redirige a /', async ({ request }) => {
  const res = await request.get('/turno?horario=00000000-0000-4000-8000-000000000000&fecha=2026-11-26', { maxRedirects: 0 });
  expect([302, 303]).toContain(res.status());
  expect(res.headers().location).toBe('/');
});

// Todas las pantallas de la vista previa, con los desplegables abiertos, sin scroll horizontal a 375 px.
const PANTALLAS = ['sin-sesion', 'crear-familia', 'inicio', 'inicio-invitando', 'invitacion-vigente', 'invitacion-vencida',
  'semana', 'semana-vacia', 'terapias', 'terapia-detalle', 'semana-con-cambios', 'cambiar-turno', 'avisos', 'avisos-iphone'];
test.describe('375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('vista previa: ninguna pantalla tiene scroll horizontal', async ({ page }) => {
    for (const p of PANTALLAS) {
      await page.goto(`/vista-previa/${p}`);
      await page.evaluate(() => { for (const d of document.querySelectorAll('details')) d.open = true; });
      expect(await page.evaluate(() => document.documentElement.scrollWidth), p).toBeLessThanOrEqual(375);
    }
  });
});
