import { expect, test, type Page } from '@playwright/test';

// Spec 001, C5: las páginas sin sesión se ven y funcionan.
const CODIGO_INEXISTENTE = 'AAAAAAAAAAAAAAAAAAAAAA'; // forma válida (22 base64url); el stub dice que no existe

const anchoDocumento = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

test.describe('375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('C5: / sin sesión muestra "Entrar con Google" sin scroll horizontal', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    const boton = page.getByRole('button', { name: 'Entrar con Google' });
    await expect(boton).toBeVisible();
    expect((await boton.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await anchoDocumento(page)).toBeLessThanOrEqual(375);
  });

  test('C5: /invitacion/<inexistente> responde 404 con "Esta invitación no existe" sin scroll horizontal', async ({ page }) => {
    const res = await page.goto(`/invitacion/${CODIGO_INEXISTENTE}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByText('Esta invitación no existe')).toBeVisible();
    expect(await anchoDocumento(page)).toBeLessThanOrEqual(375);
  });

  test('C5: un código con forma inválida también da 404', async ({ page }) => {
    const res = await page.goto('/invitacion/no-existe');
    expect(res?.status()).toBe(404);
    await expect(page.getByText('Esta invitación no existe')).toBeVisible();
  });
});

// Spec 002, C5: las páginas nuevas sin sesión redirigen a `/` y no exponen nada.
for (const ruta of ['/semana', '/terapias', '/familia', '/terapias/00000000-0000-4000-8000-000000000000']) {
  test(`002·C5: ${ruta} sin sesión redirige a /`, async ({ request }) => {
    const res = await request.get(ruta, { maxRedirects: 0 });
    expect([302, 303]).toContain(res.status());
    expect(res.headers().location).toBe('/');
  });
}
