// Spec 004, C0 (paso 0, punto 3), C4 y C5: el reloj rechaza sin secreto y los textos dicen lo correcto.
import { describe, expect, test, vi } from 'vitest';
import { correrReloj, secretoValido, type RecordatorioConDestino } from './recordatorios';
import { avisoEventoFechaBorrado, avisoEventoFechaCambio, avisoEventoFechaNuevo, avisoRecordatorio } from './textos-aviso';

const s = (n: number) => ({ endpoint: `https://push.ejemplo.test/${n}`, p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) });
const rec = (extra: Partial<RecordatorioConDestino> = {}): RecordatorioConDestino => ({
  tipo: 'diez', titulo: 'Terapia ocupacional', fecha: '2026-11-26', hora: '15:00', lugar: 'Consultorio Rivadavia', suscripciones: [s(1), s(2)], ...extra,
});

describe('el reloj se defiende', () => {
  test('sin header, con uno equivocado o sin CRON_SECRET → 401 y no llama a la base', async () => {
    for (const [header, secreto] of [[null, 'abc'], ['Bearer otro', 'abc'], ['abc', 'abc'], ['Bearer abc', undefined], ['Bearer ', '']] as const) {
      const tomar = vi.fn();
      const r = await correrReloj(header, { secreto, tomar, enviar: vi.fn() });
      expect(r.estado).toBe(401);
      expect(tomar).not.toHaveBeenCalled();
    }
  });

  test('con el secreto correcto pide los recordatorios y manda a cada suscripción', async () => {
    const enviar = vi.fn().mockResolvedValue(undefined);
    const tomar = vi.fn().mockResolvedValue([rec(), rec({ tipo: 'manana', titulo: 'Cumple de Sofi', hora: null, suscripciones: [s(3)] })]);
    const r = await correrReloj('Bearer abc', { secreto: 'abc', tomar, enviar });
    expect(tomar).toHaveBeenCalledWith('abc');
    expect(r).toEqual({ estado: 200, recordatorios: 2, enviados: 3, vencidos: 0 });
    expect(JSON.parse(enviar.mock.calls[0][1])).toEqual({ titulo: 'En 10 minutos', cuerpo: 'Terapia ocupacional, 15:00 · Consultorio Rivadavia', url: '/semana?desde=2026-11-23' });
  });

  test('un error del servicio de push no frena a los demás; 410 cuenta como vencida', async () => {
    const enviar = vi.fn().mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 })).mockResolvedValue(undefined);
    const r = await correrReloj('Bearer abc', { secreto: 'abc', tomar: async () => [rec()], enviar });
    expect(r).toEqual({ estado: 200, recordatorios: 1, enviados: 1, vencidos: 1 });
  });

  test('si la base falla → 500, sin lanzar', async () => {
    const r = await correrReloj('Bearer abc', { secreto: 'abc', tomar: async () => { throw new Error('x'); }, enviar: vi.fn() });
    expect(r.estado).toBe(500);
  });

  test('secretoValido compara en tiempo constante y exige el prefijo Bearer', () => {
    expect(secretoValido('Bearer abc', 'abc')).toBe(true);
    expect(secretoValido('Bearer abcd', 'abc')).toBe(false);
  });
});

describe('textos de eventos y recordatorios', () => {
  const cumple = { titulo: 'Cumple de Sofi', fecha: '2026-12-05', hora: '17:00' };
  const acto = { titulo: 'Acto de fin de año', fecha: '2026-12-11', hora: null };

  test('evento nuevo, con hora y de todo el día', () => {
    expect(avisoEventoFechaNuevo(cumple, 'Laura')).toEqual({ titulo: 'Nuevo evento', cuerpo: 'Cumple de Sofi: sáb 5/12 17:00. Lo agregó Laura', url: '/semana?desde=2026-11-30' });
    expect(avisoEventoFechaNuevo(acto, 'Laura').cuerpo).toBe('Acto de fin de año: vie 11/12, todo el día. Lo agregó Laura');
  });

  test('evento cambiado y borrado', () => {
    const a = avisoEventoFechaCambio(cumple, { ...cumple, fecha: '2026-12-06', hora: '16:00' }, 'Claudio');
    expect(a).toEqual({ titulo: 'Cambio en la semana', cuerpo: 'Cumple de Sofi: sáb 5/12 17:00 → dom 6/12 16:00. Lo cambió Claudio', url: '/semana?desde=2026-11-30' });
    expect(avisoEventoFechaCambio(cumple, { ...cumple, titulo: 'Cumple de Sofi (5 años)' }, 'Claudio').cuerpo).toBe('Cumple de Sofi (5 años): sáb 5/12 17:00. Lo cambió Claudio');
    expect(avisoEventoFechaBorrado(cumple, 'Claudio').cuerpo).toBe('Cumple de Sofi (sáb 5/12 17:00) se quitó. Lo quitó Claudio');
  });

  test('recordatorios: 10 minutos antes y el día anterior', () => {
    expect(avisoRecordatorio({ tipo: 'diez', titulo: 'Cumple de Sofi', fecha: '2026-12-05', hora: '17:00', lugar: null }).cuerpo).toBe('Cumple de Sofi, 17:00');
    expect(avisoRecordatorio({ tipo: 'manana', titulo: 'Cumple de Sofi', fecha: '2026-12-05', hora: '17:00', lugar: 'Consultorio' })).toEqual({ titulo: 'Mañana', cuerpo: 'Cumple de Sofi, 17:00', url: '/semana?desde=2026-11-30' });
    expect(avisoRecordatorio({ tipo: 'manana', titulo: 'Acto de fin de año', fecha: '2026-12-11', hora: null, lugar: null }).cuerpo).toBe('Acto de fin de año, todo el día');
  });
});
