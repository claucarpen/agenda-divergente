// Spec 003, C4: el aviso dice lo correcto y un error del servicio de push no se propaga.
import { describe, expect, test, vi } from 'vitest';
import { avisar, type Suscripcion } from './avisos';
import {
  avisoAnular, avisoCancelarUnaVez, avisoEvento, avisoHorario, avisoMoverUnaVez, avisoPeriodo, avisoPrueba, avisoTerminar, fechaAviso,
} from './textos-aviso';

describe('textos', () => {
  test('mover una vez: el ejemplo del operador, con la URL de la semana del turno nuevo', () => {
    const a = avisoMoverUnaVez('Terapia ocupacional', '2026-11-26', '15:00', '2026-11-27', '17:00', 'Laura');
    expect(a.titulo).toBe('Cambio en la semana');
    expect(a.cuerpo).toBe('Terapia ocupacional: jue 26/11 15:00 → vie 27/11 17:00. Lo cambió Laura');
    expect(a.url).toBe('/semana?desde=2026-11-23');
  });

  test('mover a la semana siguiente apunta a esa semana', () => {
    expect(avisoMoverUnaVez('TO', '2026-11-26', '15:00', '2026-12-01', '10:00', 'Laura').url).toBe('/semana?desde=2026-11-30');
  });

  test('cancelar, período y anular', () => {
    expect(avisoCancelarUnaVez('Psicopedagogía', '2026-11-27', '14:30', 'Claudio').cuerpo)
      .toBe('Psicopedagogía: no hay el vie 27/11 (14:30). Lo cambió Claudio');
    expect(avisoPeriodo('Psicopedagogía', '2027-03-01', '2027-03-31', 1, '14:30', { dia: 5, hora: '17:00' }, 'Laura').cuerpo)
      .toBe('Psicopedagogía: del 1/3 al 31/3 pasa de los lunes 14:30 a los viernes 17:00. Lo cambió Laura');
    expect(avisoPeriodo('Psicopedagogía', '2027-03-01', '2027-03-31', 6, '10:00', null, 'Laura').cuerpo)
      .toBe('Psicopedagogía: no hay los sábados del 1/3 al 31/3. Lo cambió Laura');
    expect(avisoAnular('Terapia ocupacional', 4, '15:00', '2026-11-26', 'Laura').cuerpo)
      .toBe('Terapia ocupacional: se deshizo un cambio, vuelve a los jueves 15:00. Lo cambió Laura');
  });

  test('horarios fijos, terminar y eventos', () => {
    expect(avisoHorario('TO', 4, '16:00', true, '2026-11-26', 'Laura').cuerpo).toBe('TO: nuevo horario los jueves 16:00. Lo cargó Laura');
    expect(avisoHorario('TO', 4, '16:00', false, '2026-11-26', 'Laura').cuerpo).toBe('TO: ya no va los jueves 16:00. Lo cambió Laura');
    expect(avisoTerminar('Fonoaudiología', '2026-12-18', 'Claudio').cuerpo).toBe('Fonoaudiología termina el vie 18/12. Lo cargó Claudio');
    expect(avisoEvento('Retirar del colegio', 5, '13:45', true, '2026-11-25', 'Laura').cuerpo).toBe('Nuevo evento: Retirar del colegio, los viernes 13:45. Lo cargó Laura');
    expect(avisoEvento('Retirar del colegio', 5, '13:45', false, '2026-11-25', 'Laura').cuerpo).toBe('Se quitó el evento Retirar del colegio (los viernes 13:45). Lo cambió Laura');
    expect(avisoPrueba().url).toBe('/familia');
    expect(fechaAviso('2026-11-29')).toBe('dom 29/11');
  });

  test('ningún texto tiene lugar para el nombre del hijo ni la nota', () => {
    // Las funciones no reciben ni hijo ni nota: la firma lo garantiza. Acá se fija la cantidad de parámetros.
    expect(avisoMoverUnaVez.length).toBe(6);
    expect(avisoCancelarUnaVez.length).toBe(4);
    expect(avisoPeriodo.length).toBe(7);
  });
});

describe('envío', () => {
  const subs: Suscripcion[] = [
    { endpoint: 'https://push.ejemplo.test/ok', p256dh: 'p', auth: 'a' },
    { endpoint: 'https://push.ejemplo.test/vencida', p256dh: 'p', auth: 'a' },
    { endpoint: 'https://push.ejemplo.test/caida', p256dh: 'p', auth: 'a' },
    { endpoint: 'https://push.ejemplo.test/borrada', p256dh: 'p', auth: 'a' },
  ];
  const aviso = avisoPrueba();

  test('un error del servicio no se propaga; 404 y 410 marcan para borrar; los buenos marcan ok', async () => {
    const marcar = vi.fn(async () => {});
    const enviar = vi.fn(async (s: Suscripcion) => {
      if (s.endpoint.endsWith('vencida')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      if (s.endpoint.endsWith('borrada')) throw Object.assign(new Error('Not found'), { statusCode: 404 });
      if (s.endpoint.endsWith('caida')) throw Object.assign(new Error('Bad gateway'), { statusCode: 502 });
    });
    const enviados = await avisar(aviso, { destinatarios: async () => subs, marcar, enviar });
    expect(enviados).toBe(1);
    expect(marcar).toHaveBeenCalledWith('https://push.ejemplo.test/ok', true);
    expect(marcar).toHaveBeenCalledWith('https://push.ejemplo.test/vencida', false);
    expect(marcar).toHaveBeenCalledWith('https://push.ejemplo.test/borrada', false);
    expect(marcar).not.toHaveBeenCalledWith('https://push.ejemplo.test/caida', false);
    expect(JSON.parse(enviar.mock.calls[0][1] as unknown as string)).toEqual(aviso);
  });

  test('si fallan los destinatarios, devuelve 0 sin lanzar', async () => {
    await expect(avisar(aviso, { destinatarios: async () => { throw new Error('caído'); }, marcar: async () => {}, enviar: async () => {} })).resolves.toBe(0);
  });

  test('el filtro manda solo al celular pedido (Probar aviso)', async () => {
    const enviar = vi.fn(async () => {});
    await avisar(aviso, { destinatarios: async () => subs, marcar: async () => {}, enviar }, (s) => s.endpoint.endsWith('ok'));
    expect(enviar).toHaveBeenCalledTimes(1);
  });
});
