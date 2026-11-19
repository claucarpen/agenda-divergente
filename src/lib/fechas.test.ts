// Spec 002, C4: las fechas de la semana.
import { describe, expect, test } from 'vitest';
import { diaSemana, esFechaIso, hoyEnArgentina, lunesDe, nombreDia, rangoHorario, sumarDias, tituloSemana } from './fechas';

describe('la semana en hora argentina', () => {
  test('domingo 23:30 h de Buenos Aires (en UTC ya es lunes) sigue siendo domingo', () => {
    const instante = new Date('2026-11-30T02:30:00Z'); // domingo 29/11, 23:30 h en Argentina
    expect(hoyEnArgentina(instante)).toBe('2026-11-29');
    expect(lunesDe(hoyEnArgentina(instante))).toBe('2026-11-23');
  });

  test('el lunes de la semana de cualquier día', () => {
    expect(lunesDe('2026-11-23')).toBe('2026-11-23');
    expect(lunesDe('2026-11-26')).toBe('2026-11-23');
    expect(lunesDe('2026-11-29')).toBe('2026-11-23');
    expect(lunesDe('2027-01-01')).toBe('2026-12-28');
    expect(diaSemana('2026-11-29')).toBe(7);
  });

  test('títulos y nombres', () => {
    expect(tituloSemana('2026-11-23')).toBe('Semana del 23 al 29/11');
    expect(tituloSemana('2026-11-30')).toBe('Semana del 30/11 al 6/12');
    expect(nombreDia('2026-11-23')).toBe('Lunes 23/11');
    expect(nombreDia('2026-11-25')).toBe('Miércoles 25/11');
    expect(rangoHorario('15:00', '15:45')).toBe('15:00 – 15:45');
  });

  test('sumar días y validar fechas', () => {
    expect(sumarDias('2026-11-30', -7)).toBe('2026-11-23');
    expect(sumarDias('2026-12-28', 7)).toBe('2027-01-04');
    expect(esFechaIso('2026-11-23')).toBe(true);
    expect(esFechaIso('2026-02-30')).toBe(false);
    expect(esFechaIso('23/11/2026')).toBe(false);
    expect(esFechaIso(null)).toBe(false);
  });
});
