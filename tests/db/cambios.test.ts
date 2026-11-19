// Spec 003, C3: cambios de turno, la semana con cambios y suscripciones de Web Push. Aplica 001, 002 y 003.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { admin, anon, startDb, user, type Db } from './pg';

let db: Db;
beforeAll(async () => { db = await startDb(['001_familias.sql', '002_terapias.sql', '003_cambios.sql']); });
afterAll(async () => { await db?.stop(); });

const LUNES = '2026-11-23';
const dia = (offset: number) => {
  const d = new Date(`${LUNES}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const JUEVES = dia(3);
const VIERNES = dia(4);

let n = 0;
async function nuevoUsuario() {
  const id = randomUUID();
  await db.q(admin, 'insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
    id, `c${++n}-${id.slice(0, 8)}@ejemplo.test`, { full_name: `Adulto ${n}` },
  ]);
  return id;
}
const uno = async <T = any>(u: string, sql: string, params: unknown[] = []) => (await db.q(user(u), sql, params)).rows[0] as T;

// Familia con un adulto, una terapia y un horario fijo los jueves 15:00 (45 min) desde hace un mes.
async function familia() {
  const adulto = await nuevoUsuario();
  const { fam } = await uno(adulto, "select public.crear_familia('Familia') as fam");
  const { hijo } = await uno(adulto, "select public.agregar_hijo('Nena', 'osde', null) as hijo");
  const { prof } = await uno(adulto, "select public.agregar_profesional('Ana', 'terapia_ocupacional', null, true) as prof");
  const { t } = await uno(adulto, "select public.agregar_terapia($1, $2, 'terapia_ocupacional', 'consultorio', null, $3) as t", [hijo, prof, dia(-30)]);
  const { h } = await uno(adulto, "select public.agregar_horario($1, 4, '15:00', 45, $2) as h", [t, dia(-30)]);
  return { adulto, fam: fam as string, terapia: t as string, horario: h as string };
}
const unaVez = (u: string, h: string, fecha: string, accion: string, nuevaFecha: string | null = null, hora: string | null = null, nota: string | null = null) =>
  uno(u, 'select public.cambiar_turno_una_vez($1, $2, $3, $4, $5, $6) as id', [h, fecha, accion, nuevaFecha, hora, nota]).then((r) => r.id as string);
const periodo = (u: string, h: string, desde: string, hasta: string, accion: string, diaNuevo: number | null = null, hora: string | null = null) =>
  uno(u, 'select public.cambiar_turno_periodo($1, $2, $3, $4, $5, $6, null) as id', [h, desde, hasta, accion, diaNuevo, hora]).then((r) => r.id as string);
const semana = (u: string, lunes = LUNES) => uno(u, 'select public.semana($1) as s', [lunes]).then((r) => r.s as any[]);
const delDia = (s: any[], fecha: string) => s.find((d) => d.fecha === fecha).ocurrencias as any[];
const lunesDe = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const p256dh = 'B'.repeat(87);
const auth = 'a'.repeat(22);

describe('cambiar un turno', () => {
  test('horario de otra familia → ajeno', async () => {
    const a = await familia();
    const b = await familia();
    await expect(unaVez(b.adulto, a.horario, JUEVES, 'cancelar')).rejects.toThrow('ajeno');
    await expect(periodo(b.adulto, a.horario, JUEVES, dia(10), 'cancelar')).rejects.toThrow('ajeno');
  });

  test('una vez en un día sin turno → sin_turno', async () => {
    const f = await familia();
    await expect(unaVez(f.adulto, f.horario, VIERNES, 'cancelar')).rejects.toThrow('sin_turno');
  });

  test('período con desde > hasta o de más de 180 días → rechazo', async () => {
    const f = await familia();
    await expect(periodo(f.adulto, f.horario, dia(10), dia(3), 'cancelar')).rejects.toThrow('periodo_invalido');
    await expect(periodo(f.adulto, f.horario, dia(0), dia(181), 'cancelar')).rejects.toThrow('periodo_largo');
  });

  test('dos cambios superpuestos → cambio_superpuesto', async () => {
    const f = await familia();
    await unaVez(f.adulto, f.horario, JUEVES, 'cancelar');
    await expect(unaVez(f.adulto, f.horario, JUEVES, 'mover', VIERNES, '17:00')).rejects.toThrow('cambio_superpuesto');
    await expect(periodo(f.adulto, f.horario, dia(0), dia(20), 'cancelar')).rejects.toThrow('cambio_superpuesto');
  });

  test('una nota de más de 80 caracteres → rechazo', async () => {
    const f = await familia();
    await expect(unaVez(f.adulto, f.horario, JUEVES, 'cancelar', null, null, 'x'.repeat(81))).rejects.toThrow('nota_invalida');
  });
});

describe('la semana con cambios', () => {
  test('mover una vez: aparece el viernes 17:00 con el original; el jueves queda vacío', async () => {
    const f = await familia();
    await unaVez(f.adulto, f.horario, JUEVES, 'mover', VIERNES, '17:00', 'Vacaciones');
    const s = await semana(f.adulto);
    expect(delDia(s, JUEVES)).toEqual([]);
    expect(delDia(s, VIERNES)).toEqual([expect.objectContaining({
      estado: 'cambiado', inicio: '17:00', fin: '17:45', original_fecha: JUEVES, original_inicio: '15:00', fecha_turno: JUEVES, nota: 'Vacaciones',
    })]);
  });

  test('cancelar una vez: el jueves aparece marcado cancelado con la hora original', async () => {
    const f = await familia();
    await unaVez(f.adulto, f.horario, JUEVES, 'cancelar');
    const s = await semana(f.adulto);
    expect(delDia(s, JUEVES)).toEqual([expect.objectContaining({ estado: 'cancelado', inicio: '15:00' })]);
  });

  test('período: dentro pasa a los viernes 17:00; fuera, el horario fijo', async () => {
    const f = await familia();
    await periodo(f.adulto, f.horario, dia(0), dia(6), 'mover', 5, '17:00'); // solo esta semana
    const s = await semana(f.adulto);
    expect(delDia(s, JUEVES)).toEqual([]);
    expect(delDia(s, VIERNES)).toEqual([expect.objectContaining({ estado: 'cambiado', inicio: '17:00', original_fecha: JUEVES })]);
    const siguiente = await semana(f.adulto, dia(7));
    expect(delDia(siguiente, dia(10))).toEqual([expect.objectContaining({ estado: 'normal', inicio: '15:00' })]);
    expect(delDia(siguiente, dia(11))).toEqual([]);
  });

  test('un cambio anulado deja de aplicarse', async () => {
    const f = await familia();
    const c = await unaVez(f.adulto, f.horario, JUEVES, 'cancelar');
    await uno(f.adulto, 'select public.anular_cambio($1)', [c]);
    const s = await semana(f.adulto);
    expect(delDia(s, JUEVES)).toEqual([expect.objectContaining({ estado: 'normal', inicio: '15:00' })]);
    // Anulado, se puede volver a cambiar el mismo día.
    await expect(unaVez(f.adulto, f.horario, JUEVES, 'cancelar')).resolves.toBeTruthy();
  });

  test('mover a otra semana: aparece en la nueva y desaparece de la vieja', async () => {
    const f = await familia();
    await unaVez(f.adulto, f.horario, JUEVES, 'mover', dia(8), '10:00'); // martes de la semana siguiente
    expect(delDia(await semana(f.adulto), JUEVES)).toEqual([]);
    const siguiente = await semana(f.adulto, dia(7));
    expect(delDia(siguiente, dia(8))).toEqual([expect.objectContaining({ estado: 'cambiado', inicio: '10:00', original_fecha: JUEVES })]);
    expect(delDia(siguiente, dia(10))).toEqual([expect.objectContaining({ estado: 'normal' })]);
    expect(lunesDe(dia(8))).toBe(dia(7));
  });

  test('turno() informa el horario y el cambio de ese día', async () => {
    const f = await familia();
    await unaVez(f.adulto, f.horario, JUEVES, 'cancelar');
    const t = (await uno(f.adulto, 'select public.turno($1, $2) as t', [f.horario, JUEVES])).t;
    expect(t).toEqual(expect.objectContaining({ hay_turno: true, hora: '15:00', duracion_min: 45 }));
    expect(t.cambio).toEqual(expect.objectContaining({ accion: 'cancelar', alcance: 'una_vez', tipo: 'Terapia ocupacional' }));
    expect(t.terapia.tipo).toBe('Terapia ocupacional');
  });
});

describe('suscripciones de Web Push', () => {
  test('destinatarios_aviso: todos los adultos de la familia, incluido quien llama, nunca otra familia', async () => {
    const f = await familia();
    const { c } = await uno(f.adulto, 'select public.crear_invitacion() as c');
    const otro = await nuevoUsuario();
    await uno(otro, 'select public.aceptar_invitacion($1)', [c]);
    await uno(f.adulto, 'select public.guardar_suscripcion($1, $2, $3)', ['https://push.ejemplo.test/yo', p256dh, auth]);
    await uno(otro, 'select public.guardar_suscripcion($1, $2, $3)', ['https://push.ejemplo.test/otro', p256dh, auth]);
    const ajena = await familia();
    await uno(ajena.adulto, 'select public.guardar_suscripcion($1, $2, $3)', ['https://push.ejemplo.test/ajena', p256dh, auth]);
    const r = await db.q(user(f.adulto), 'select * from public.destinatarios_aviso()');
    expect(r.rows.map((x) => x.endpoint).sort()).toEqual(['https://push.ejemplo.test/otro', 'https://push.ejemplo.test/yo']);
    expect(r.fields.map((x) => x.name).sort()).toEqual(['auth', 'endpoint', 'p256dh']);
    const estado = (await uno(otro, 'select public.estado_avisos() as e')).e;
    expect(estado.map((x: any) => x.activos)).toEqual([true, true]);
  });

  test('endpoint que no es https → suscripcion_invalida', async () => {
    const f = await familia();
    await expect(uno(f.adulto, 'select public.guardar_suscripcion($1, $2, $3)', ['http://push.ejemplo.test/x', p256dh, auth])).rejects.toThrow('suscripcion_invalida');
  });

  test('marcar_suscripcion(…, false) borra y no toca suscripciones de otra familia', async () => {
    const a = await familia();
    const b = await familia();
    await uno(a.adulto, 'select public.guardar_suscripcion($1, $2, $3)', ['https://push.ejemplo.test/a', p256dh, auth]);
    await uno(b.adulto, 'select public.guardar_suscripcion($1, $2, $3)', ['https://push.ejemplo.test/b', p256dh, auth]);
    await uno(b.adulto, 'select public.marcar_suscripcion($1, false)', ['https://push.ejemplo.test/a']);
    const sigue = await db.q(admin, "select count(*)::int as n from public.suscripciones_push where endpoint = 'https://push.ejemplo.test/a'");
    expect(sigue.rows[0].n).toBe(1);
    await uno(a.adulto, 'select public.marcar_suscripcion($1, false)', ['https://push.ejemplo.test/a']);
    const borrada = await db.q(admin, "select count(*)::int as n from public.suscripciones_push where endpoint = 'https://push.ejemplo.test/a'");
    expect(borrada.rows[0].n).toBe(0);
  });
});

describe('seguridad', () => {
  test('anon no lee ni ejecuta nada nuevo', async () => {
    for (const t of ['cambios', 'suscripciones_push']) await expect(db.q(anon, `select * from public.${t}`), t).rejects.toThrow(/permission denied/);
    await expect(db.q(anon, 'select * from public.destinatarios_aviso()')).rejects.toThrow(/permission denied/);
    await expect(db.q(anon, 'select public.cambios_vigentes()')).rejects.toThrow(/permission denied/);
  });

  test('authenticated no inserta directo en las tablas nuevas', async () => {
    const f = await familia();
    await expect(db.q(user(f.adulto), `insert into public.cambios (horario_id, alcance, fecha, accion) values ('${f.horario}', 'una_vez', '${JUEVES}', 'cancelar')`)).rejects.toThrow(/permission denied/);
    await expect(db.q(user(f.adulto), `insert into public.suscripciones_push (perfil_id, endpoint, p256dh, auth) values ('${f.adulto}', 'https://x', '${p256dh}', '${auth}')`)).rejects.toThrow(/permission denied/);
  });

  test('movimientos registra los 4 tipos nuevos', async () => {
    const f = await familia();
    const c = await unaVez(f.adulto, f.horario, JUEVES, 'cancelar');
    await uno(f.adulto, 'select public.anular_cambio($1)', [c]);
    await uno(f.adulto, 'select public.guardar_suscripcion($1, $2, $3)', ['https://push.ejemplo.test/m', p256dh, auth]);
    await uno(f.adulto, 'select public.borrar_suscripcion($1)', ['https://push.ejemplo.test/m']);
    const r = await db.q(admin, 'select distinct tipo from public.movimientos where familia_id = $1', [f.fam]);
    const tipos = new Set(r.rows.map((x) => x.tipo));
    for (const t of ['cambio_turno', 'anulo_cambio', 'activo_avisos', 'desactivo_avisos']) expect(tipos, t).toContain(t);
  });

  test('cambios_vigentes solo muestra los de la propia familia', async () => {
    const a = await familia();
    await unaVez(a.adulto, a.horario, JUEVES, 'cancelar');
    const b = await familia();
    expect((await uno(b.adulto, 'select public.cambios_vigentes() as c')).c).toEqual([]);
  });
});
