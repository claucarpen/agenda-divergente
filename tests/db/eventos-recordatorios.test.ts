// Spec 004, C0 y C3: eventos con fecha, avatares y el reloj de recordatorios. Aplica 001 a 004.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { admin, anon, startDb, user, type Db } from './pg';

let db: Db;
const SECRETO = 'secreto-de-prueba-' + randomUUID();
beforeAll(async () => {
  db = await startDb(['001_familias.sql', '002_terapias.sql', '003_cambios.sql', '004_eventos_recordatorios_avatares.sql']);
  await db.q(admin, "insert into public.config_privada (clave, valor) values ('cron_secret', $1)", [SECRETO]);
});
afterAll(async () => { await db?.stop(); });

// Fechas relativas a hoy en Argentina, para que los tests no venzan.
const hoyAr = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const masDias = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lunesDe = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
// Un jueves al menos una semana adelante.
const JUEVES = (() => { let d = masDias(hoyAr(), 7); while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 4) d = masDias(d, 1); return d; })();
const VIERNES = masDias(JUEVES, 1);
const MIERCOLES = masDias(JUEVES, -1);
const en = (fecha: string, hora: string) => `${fecha}T${hora}:00-03:00`;

let n = 0;
async function nuevoUsuario() {
  const id = randomUUID();
  await db.q(admin, 'insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
    id, `r${++n}-${id.slice(0, 8)}@ejemplo.test`, { full_name: `Adulto ${n}` },
  ]);
  return id;
}
const uno = async <T = any>(u: string, sql: string, params: unknown[] = []) => (await db.q(user(u), sql, params)).rows[0] as T;
const p256dh = 'B'.repeat(87);
const authKey = 'a'.repeat(22);

// Familia con un adulto suscripto, una hija y la TO los jueves 15:00 en "Consultorio Rivadavia".
async function familia() {
  const adulto = await nuevoUsuario();
  const { fam } = await uno(adulto, "select public.crear_familia('Familia') as fam");
  const { hijo } = await uno(adulto, "select public.agregar_hijo('Nena', 'osde', null) as hijo");
  const { prof } = await uno(adulto, "select public.agregar_profesional('Ana', 'terapia_ocupacional', null, true) as prof");
  const { t } = await uno(adulto, "select public.agregar_terapia($1, $2, 'terapia_ocupacional', 'consultorio', 'Consultorio Rivadavia', $3) as t", [hijo, prof, hoyAr()]);
  const { h } = await uno(adulto, "select public.agregar_horario($1, 4, '15:00', 45, $2) as h", [t, hoyAr()]);
  const endpoint = `https://push.ejemplo.test/${randomUUID()}`;
  await uno(adulto, 'select public.guardar_suscripcion($1, $2, $3)', [endpoint, p256dh, authKey]);
  return { adulto, fam: fam as string, hijo: hijo as string, horario: h as string, endpoint };
}
const tomar = async (ahora: string, secreto = SECRETO) =>
  (await db.q(anon, 'select public.tomar_recordatorios($1, $2) as r', [secreto, ahora])).rows[0].r as any[];
const deFamilia = (r: any[], endpoint: string) => r.filter((x) => x.suscripciones.some((s: any) => s.endpoint === endpoint));
const agregar = (u: string, titulo: string, fecha: string, hora: string | null, hijo: string | null = null, nota: string | null = null) =>
  uno(u, 'select public.agregar_evento_fecha($1, $2, $3, $4, $5) as e', [titulo, fecha, hora, hijo, nota]).then((r) => r.e);

describe('paso 0: el reloj es seguro e idempotente', () => {
  test('dos llamadas con el mismo ahora: la segunda devuelve vacío', async () => {
    const f = await familia();
    const r1 = deFamilia(await tomar(en(JUEVES, '14:51')), f.endpoint);
    expect(r1).toHaveLength(1);
    expect(r1[0]).toMatchObject({ tipo: 'diez', titulo: 'Terapia ocupacional', hora: '15:00', lugar: 'Consultorio Rivadavia' });
    expect(deFamilia(await tomar(en(JUEVES, '14:51')), f.endpoint)).toHaveLength(0);
    expect(deFamilia(await tomar(en(JUEVES, '14:55')), f.endpoint)).toHaveLength(0);
  });

  test('secreto equivocado o vacío → secreto_invalido', async () => {
    await expect(tomar(en(JUEVES, '14:51'), 'otro')).rejects.toThrow('secreto_invalido');
    await expect(tomar(en(JUEVES, '14:51'), '')).rejects.toThrow('secreto_invalido');
  });
});

describe('recordatorios', () => {
  test('turno 15:00: a las 14:49 no, a las 14:51 sí', async () => {
    const f = await familia();
    expect(deFamilia(await tomar(en(JUEVES, '14:49')), f.endpoint)).toHaveLength(0);
    expect(deFamilia(await tomar(en(JUEVES, '14:51')), f.endpoint)).toHaveLength(1);
  });

  test('turno cancelado no avisa; turno movido avisa en su hora nueva', async () => {
    const f = await familia();
    await uno(f.adulto, "select public.cambiar_turno_una_vez($1, $2, 'cancelar')", [f.horario, JUEVES]);
    expect(deFamilia(await tomar(en(JUEVES, '14:55')), f.endpoint)).toHaveLength(0);

    const g = await familia();
    await uno(g.adulto, "select public.cambiar_turno_una_vez($1, $2, 'mover', $3, '17:00')", [g.horario, JUEVES, VIERNES]);
    expect(deFamilia(await tomar(en(JUEVES, '14:55')), g.endpoint)).toHaveLength(0);
    const r = deFamilia(await tomar(en(VIERNES, '16:52')), g.endpoint);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ hora: '17:00', fecha: VIERNES });
  });

  test('evento de mañana: a las 19:59 no, a las 20:00 sale "manana"', async () => {
    const f = await familia();
    await agregar(f.adulto, 'Cumple de Sofi', JUEVES, '17:00');
    expect(deFamilia(await tomar(en(MIERCOLES, '19:59')), f.endpoint)).toHaveLength(0);
    const r = deFamilia(await tomar(en(MIERCOLES, '20:00')), f.endpoint);
    expect(r).toEqual([expect.objectContaining({ tipo: 'manana', titulo: 'Cumple de Sofi', hora: '17:00' })]);
    expect(deFamilia(await tomar(en(MIERCOLES, '21:00')), f.endpoint)).toHaveLength(0);
  });

  test('evento con hora: también 10 minutos antes', async () => {
    const f = await familia();
    await agregar(f.adulto, 'Cumple de Sofi', VIERNES, '17:00');
    const r = deFamilia(await tomar(en(VIERNES, '16:53')), f.endpoint);
    expect(r).toEqual([expect.objectContaining({ tipo: 'diez', titulo: 'Cumple de Sofi' })]);
  });

  test('evento de todo el día: solo "manana", nunca "diez"', async () => {
    const f = await familia();
    await agregar(f.adulto, 'Acto de fin de año', VIERNES, null);
    const r = deFamilia(await tomar(en(JUEVES, '20:30')), f.endpoint).filter((x) => x.titulo === 'Acto de fin de año');
    expect(r).toEqual([expect.objectContaining({ tipo: 'manana', hora: null })]);
    for (const h of ['00:00', '00:05', '09:55', '23:55']) {
      expect(deFamilia(await tomar(en(VIERNES, h)), f.endpoint).filter((x) => x.titulo === 'Acto de fin de año')).toHaveLength(0);
    }
  });

  test('evento semanal: 10 minutos antes', async () => {
    const f = await familia();
    await uno(f.adulto, "select public.agregar_evento('Retirar del colegio', 5, '12:00', null, $1)", [hoyAr()]);
    const r = deFamilia(await tomar(en(VIERNES, '11:55')), f.endpoint);
    expect(r).toEqual([expect.objectContaining({ tipo: 'diez', titulo: 'Retirar del colegio', hora: '12:00' })]);
  });

  test('adulto con recordatorios apagados → sin su suscripción', async () => {
    const f = await familia();
    const otro = await nuevoUsuario();
    const { cod } = await uno(f.adulto, 'select public.crear_invitacion() as cod');
    await uno(otro, 'select public.aceptar_invitacion($1)', [cod]);
    const endpoint2 = `https://push.ejemplo.test/${randomUUID()}`;
    await uno(otro, 'select public.guardar_suscripcion($1, $2, $3)', [endpoint2, p256dh, authKey]);
    await uno(f.adulto, 'select public.cambiar_recordatorios(false)');
    const r = await tomar(en(JUEVES, '14:52'));
    expect(deFamilia(r, f.endpoint)).toHaveLength(0);
    expect(deFamilia(r, endpoint2)).toHaveLength(1);
  });

  test('nunca suscripciones de otra familia ni emails en el recordatorio', async () => {
    const a = await familia();
    const b = await familia();
    const r = await tomar(en(JUEVES, '14:53'));
    const deA = deFamilia(r, a.endpoint);
    expect(deA).toHaveLength(1);
    expect(deA[0].suscripciones.map((s: any) => s.endpoint)).toEqual([a.endpoint]);
    expect(deA[0].suscripciones).not.toContainEqual(expect.objectContaining({ endpoint: b.endpoint }));
    expect(JSON.stringify(r)).not.toMatch(/@ejemplo\.test|Nena/);
  });
});

describe('eventos con fecha', () => {
  test('agregar, ver en la semana, editar y borrar', async () => {
    const f = await familia();
    const e = await agregar(f.adulto, 'Cumple de Sofi', JUEVES, '17:00', f.hijo, 'Salón Pelotero');
    const acto = await agregar(f.adulto, 'Acto', JUEVES, null);
    let s = (await uno(f.adulto, 'select public.semana($1) as s', [lunesDe(JUEVES)])).s as any[];
    const jueves = s.find((d) => d.fecha === JUEVES);
    expect(jueves.todo_el_dia).toEqual([expect.objectContaining({ id: acto.id, clase: 'evento_fecha', todo_el_dia: true })]);
    const horas = jueves.ocurrencias.map((o: any) => `${o.inicio} ${o.clase}`);
    expect(horas).toEqual(['15:00 terapia', '17:00 evento_fecha']);
    expect(jueves.ocurrencias[1]).toMatchObject({ titulo: 'Cumple de Sofi', nota: 'Salón Pelotero', hijo: 'Nena' });

    const previo = (await uno(f.adulto, 'select public.editar_evento_fecha($1, $2, $3, $4, null, null) as e', [e.id, 'Cumple de Sofi', VIERNES, '16:00'])).e;
    expect(previo).toMatchObject({ fecha: JUEVES, hora: '17:00' });
    s = (await uno(f.adulto, 'select public.semana($1) as s', [lunesDe(JUEVES)])).s as any[];
    expect(s.find((d) => d.fecha === VIERNES).ocurrencias).toEqual([expect.objectContaining({ inicio: '16:00', clase: 'evento_fecha' })]);

    const borrado = (await uno(f.adulto, 'select public.borrar_evento_fecha($1) as e', [e.id])).e;
    expect(borrado).toMatchObject({ titulo: 'Cumple de Sofi', fecha: VIERNES });
    await expect(uno(f.adulto, 'select public.evento_fecha($1)', [e.id])).rejects.toThrow('ajeno');
  });

  test('evento de otra familia → ajeno; hijo de otra familia → ajeno', async () => {
    const a = await familia();
    const b = await familia();
    const e = await agregar(a.adulto, 'Cumple', JUEVES, '17:00');
    await expect(uno(b.adulto, 'select public.editar_evento_fecha($1, $2, $3, null, null, null)', [e.id, 'X', JUEVES])).rejects.toThrow('ajeno');
    await expect(uno(b.adulto, 'select public.borrar_evento_fecha($1)', [e.id])).rejects.toThrow('ajeno');
    await expect(uno(b.adulto, 'select public.evento_fecha($1)', [e.id])).rejects.toThrow('ajeno');
    await expect(agregar(b.adulto, 'Cumple', JUEVES, null, a.hijo)).rejects.toThrow('ajeno');
  });

  test('fecha pasada, título vacío o nota de más de 80 → rechazo', async () => {
    const f = await familia();
    await expect(agregar(f.adulto, 'Cumple', masDias(hoyAr(), -1), null)).rejects.toThrow('fecha_pasada');
    await expect(agregar(f.adulto, '  ', JUEVES, null)).rejects.toThrow('titulo_invalido');
    await expect(agregar(f.adulto, 'Cumple', JUEVES, null, null, 'x'.repeat(81))).rejects.toThrow('nota_invalida');
  });
});

describe('avatares', () => {
  test('elegir el propio y el de un hijo; se ven en mi_familia', async () => {
    const f = await familia();
    await uno(f.adulto, "select public.elegir_avatar('zorro')");
    await uno(f.adulto, "select public.elegir_avatar_hijo($1, 'palta')", [f.hijo]);
    const { fam } = await uno(f.adulto, 'select public.mi_familia() as fam');
    expect(fam.adultos[0]).toMatchObject({ soy_yo: true, avatar: 'zorro' });
    expect(fam.hijos[0]).toMatchObject({ avatar: 'palta' });
    expect(fam.recordatorios).toBe(true);
    await uno(f.adulto, 'select public.elegir_avatar(null)');
    expect((await uno(f.adulto, 'select public.mi_familia() as fam')).fam.adultos[0].avatar).toBeNull();
  });

  test('avatar fuera de la galería → avatar_invalido; hijo ajeno → ajeno', async () => {
    const a = await familia();
    const b = await familia();
    await expect(uno(a.adulto, "select public.elegir_avatar('mickey')")).rejects.toThrow('avatar_invalido');
    await expect(uno(a.adulto, "select public.elegir_avatar_hijo($1, 'oso')", [a.hijo]).then(() => uno(a.adulto, "select public.elegir_avatar_hijo($1, 'x')", [a.hijo]))).rejects.toThrow('avatar_invalido');
    await expect(uno(b.adulto, "select public.elegir_avatar_hijo($1, 'oso')", [a.hijo])).rejects.toThrow('ajeno');
  });
});

describe('seguridad y movimientos', () => {
  test('anon no lee las tablas nuevas ni ejecuta las funciones de la familia', async () => {
    for (const t of ['eventos_fecha', 'recordatorios_enviados', 'config_privada']) {
      await expect(db.q(anon, `select * from public.${t}`)).rejects.toThrow(/permission denied/);
    }
    await expect(db.q(anon, "select public.agregar_evento_fecha('x', current_date)")).rejects.toThrow(/permission denied/);
    await expect(db.q(anon, "select public.elegir_avatar('oso')")).rejects.toThrow(/permission denied/);
  });

  test('authenticated no lee config_privada ni ejecuta tomar_recordatorios', async () => {
    const f = await familia();
    await expect(db.q(user(f.adulto), 'select * from public.config_privada')).rejects.toThrow(/permission denied/);
    await expect(db.q(user(f.adulto), 'select public.tomar_recordatorios($1)', [SECRETO])).rejects.toThrow(/permission denied/);
  });

  test('movimientos registra los 4 tipos nuevos', async () => {
    const f = await familia();
    const e = await agregar(f.adulto, 'Cumple', JUEVES, null);
    await uno(f.adulto, 'select public.editar_evento_fecha($1, $2, $3, null, null, null)', [e.id, 'Cumple 2', JUEVES]);
    await uno(f.adulto, 'select public.borrar_evento_fecha($1)', [e.id]);
    await uno(f.adulto, "select public.elegir_avatar('oso')");
    const r = await db.q(admin, 'select tipo from public.movimientos where familia_id = $1', [f.fam]);
    const tipos = r.rows.map((x) => x.tipo);
    for (const t of ['agrego_evento_fecha', 'edito_evento_fecha', 'borro_evento_fecha', 'eligio_avatar']) expect(tipos).toContain(t);
  });
});
