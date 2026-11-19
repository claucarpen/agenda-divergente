// Spec 001, C4: el link de invitación por WhatsApp.
import { expect, test } from 'vitest';
import { linkInvitacion, textoInvitacion } from './whatsapp';

const URL_INV = 'https://agenda.ejemplo.test/invitacion/AbC_def-123456789012345';

test('el link empieza con https://wa.me/?text= y decodifica al texto exacto', () => {
  const link = linkInvitacion('Los Pérez', URL_INV);
  expect(link.startsWith('https://wa.me/?text=')).toBe(true);
  const texto = decodeURIComponent(link.slice('https://wa.me/?text='.length));
  expect(texto).toBe(`Sumate a Los Pérez en Agenda Divergente: ${URL_INV}`);
  expect(texto).toBe(textoInvitacion('Los Pérez', URL_INV));
});

test('"¿", "ñ" y "&" sobreviven codificados', () => {
  const familia = '¿Los Muñoz & cía?';
  const link = linkInvitacion(familia, URL_INV);
  const crudo = link.slice('https://wa.me/?text='.length);
  expect(crudo).not.toMatch(/[¿ñ& ]/);
  expect(decodeURIComponent(crudo)).toContain(familia);
});
