// Spec 002, C3: terapias, horarios, eventos y la semana, sobre Postgres embebido + shim, con 001 y 002.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { admin, anon, startDb, user, type Db } from './pg';

let db: Db;
beforeAll(async () => { db = await startDb(['001_familias.sql', '002_terapias.sql']); });
afterAll(async () => { await db?.stop(); });

const TABLAS = ['tipos_terapia', 'profesionales', 'terapias', 'horarios', 'eventos_familia'];
const LUNES = '2026-11-23'; // un lunes
const dia = (offset: number) => {
  const d = new Date(`${LUNES}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

let n = 0;
async function nuevoUsuario() {
  const id = randomUUID();
  await db.q(admin, 'insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
    id, `t${++n}-${id.slice(0, 8)}@ejemplo.test`, { full_name: `Adulto ${n}` },
  ]);
  return id;
}
const uno = async <T = any>(u: string, sql: string, params: unknown[] = []) =>
  (await db.q(user(u), sql, params)).rows[0] as T;

// Una familia con un adulto, un hijo y un profesional.
async function familia() {
  const adulto = await nuevoUsuario();
  const { fam } = await uno(adulto, "select public.crear_familia('Familia') as fam");
  const { hijo } = await uno(adulto, "select public.agregar_hijo('Nena', 'osde', '310') as hijo");
  const { prof } = await uno(adulto, "select public.agregar_profesional('Ana TO', 'terapia_ocupacional', '+54 11 5555-1234', true) as prof");
  return { adulto, fam: fam as string, hijo: hijo as string, prof: prof as string };
}
const agregarTerapia = (u: string, hijo: string, prof: string, desde = dia(-30)) =>
  uno(u, "select public.agregar_terapia($1, $2, 'terapia_ocupacional', 'consultorio', 'Consultorio Belgrano', $3) as id", [hijo, prof, desde])
    .then((r) => r.id as string);
const agregarHorario = (u: string, terapia: string, diaSemana: number, hora: string, duracion = 45, desde = dia(-30)) =>
  uno(u, 'select public.agregar_horario($1, $2, $3, $4, $5) as id', [terapia, diaSemana, hora, duracion, desde]).then((r) => r.id as string);
const semana = (u: string, lunes = LUNES) => uno(u, 'select public.semana($1) as s', [lunes]).then((r) => r.s as any[]);
const ocurrencias = (s: any[], i: number) => s[i].ocurrencias as any[];

describe('terapias y profesionales', () => {
  test('terapia con hijo de otra familia → ajeno', async () => {
    const a = await familia();
    const b = await familia();
    await expect(agregarTerapia(b.adulto, a.hijo, b.prof)).rejects.toThrow('ajeno');
  });

  test('terapia con profesional de otra familia → ajeno', async () => {
    const a = await familia();
    const b = await familia();
    await expect(agregarTerapia(b.adulto, b.hijo, a.prof)).rejects.toThrow('ajeno');
  });

  test('teléfono con letras → telefono_invalido', async () => {
    const { adulto } = await familia();
    await expect(uno(adulto, "select public.agregar_profesional('X', 'psicologia', 'llamame', true)")).rejects.toThrow('telefono_invalido');
  });

  test('tipo de terapia fuera de la lista → tipo_invalido', async () => {
    const { adulto } = await familia();
    await expect(uno(adulto, "select public.agregar_profesional('X', 'astrologia', null, true)")).rejects.toThrow('tipo_invalido');
  });
});

describe('horarios', () => {
  test('dia_semana 0 u 8 → rechazo', async () => {
    const f = await familia();
    const t = await agregarTerapia(f.adulto, f.hijo, f.prof);
    await expect(agregarHorario(f.adulto, t, 0, '15:00')).rejects.toThrow('dia_invalido');
    await expect(agregarHorario(f.adulto, t, 8, '15:00')).rejects.toThrow('dia_invalido');
  });

  test('duración 10 o 300 → rechazo', async () => {
    const f = await familia();
    const t = await agregarTerapia(f.adulto, f.hijo, f.prof);
    await expect(agregarHorario(f.adulto, t, 1, '15:00', 10)).rejects.toThrow('duracion_invalida');
    await expect(agregarHorario(f.adulto, t, 1, '15:00', 300)).rejects.toThrow('duracion_invalida');
  });

  test('horario en terapia terminada → rechazo', async () => {
    const f = await familia();
    const t = await agregarTerapia(f.adulto, f.hijo, f.prof);
    await uno(f.adulto, 'select public.terminar_terapia($1, $2)', [t, dia(-1)]);
    await expect(agregarHorario(f.adulto, t, 1, '15:00')).rejects.toThrow('terapia_terminada');
  });

  test('terminar_terapia cierra sus horarios abiertos', async () => {
    const f = await familia();
    const t = await agregarTerapia(f.adulto, f.hijo, f.prof);
    await agregarHorario(f.adulto, t, 1, '15:00');
    await agregarHorario(f.adulto, t, 3, '16:00');
    await uno(f.adulto, 'select public.terminar_terapia($1, $2)', [t, dia(2)]);
    const r = await db.q(admin, 'select count(*)::int as abiertos from public.horarios where terapia_id = $1 and (hasta is null or hasta > $2)', [t, dia(2)]);
    expect(r.rows[0].abiertos).toBe(0);
  });
});

describe('semana', () => {
  test('con una fecha que no es lunes → rechazo', async () => {
    const { adulto } = await familia();
    await expect(semana(adulto, dia(1))).rejects.toThrow('no_es_lunes');
  });

  test('devuelve 7 días con las ocurrencias ordenadas por hora', async () => {
    const f = await familia();
    const t = await agregarTerapia(f.adulto, f.hijo, f.prof);
    await agregarHorario(f.adulto, t, 1, '17:00');
    await agregarHorario(f.adulto, t, 1, '09:30', 60);
    const s = await semana(f.adulto);
    expect(s).toHaveLength(7);
    expect(s.map((d) => d.fecha)).toEqual([0, 1, 2, 3, 4, 5, 6].map(dia));
    expect(ocurrencias(s, 0).map((o) => [o.inicio, o.fin])).toEqual([['09:30', '10:30'], ['17:00', '17:45']]);
    expect(ocurrencias(s, 0)[0]).toEqual(expect.objectContaining({
      clase: 'terapia', tipo: 'Terapia ocupacional', profesional: 'Ana TO', modalidad: 'consultorio', lugar: 'Consultorio Belgrano', hijo: 'Nena',
    }));
    expect(ocurrencias(s, 1)).toEqual([]);
  });

  test('un horario con hasta antes del día no aparece; con desde después del día, tampoco', async () => {
    const f = await familia();
    const t = await agregarTerapia(f.adulto, f.hijo, f.prof);
    const h = await agregarHorario(f.adulto, t, 2, '15:00'); // martes
    await uno(f.adulto, 'select public.quitar_horario($1, $2)', [h, dia(0)]); // último día: el lunes
    await agregarHorario(f.adulto, t, 3, '15:00', 45, dia(3)); // miércoles, pero empieza el jueves
    const s = await semana(f.adulto);
    expect(ocurrencias(s, 1)).toEqual([]);
    expect(ocurrencias(s, 2)).toEqual([]);
  });

  test('una terapia terminada no aparece después de su hasta y sí antes', async () => {
    const f = await familia();
    const t = await agregarTerapia(f.adulto, f.hijo, f.prof);
    await agregarHorario(f.adulto, t, 1, '15:00');
    await agregarHorario(f.adulto, t, 5, '15:00');
    await uno(f.adulto, 'select public.terminar_terapia($1, $2)', [t, dia(2)]); // termina el miércoles
    const s = await semana(f.adulto);
    expect(ocurrencias(s, 0)).toHaveLength(1);
    expect(ocurrencias(s, 4)).toEqual([]);
  });

  test('un evento aparece en su día, después de una terapia a la misma hora', async () => {
    const f = await familia();
    const t = await agregarTerapia(f.adulto, f.hijo, f.prof);
    await agregarHorario(f.adulto, t, 4, '14:30');
    await uno(f.adulto, "select public.agregar_evento('Retirar del colegio', 4, '14:30', $1, $2)", [f.hijo, dia(-7)]);
    const s = await semana(f.adulto);
    expect(ocurrencias(s, 3).map((o) => o.clase)).toEqual(['terapia', 'evento']);
    expect(ocurrencias(s, 3)[1]).toEqual(expect.objectContaining({ titulo: 'Retirar del colegio', inicio: '14:30', hijo: 'Nena' }));
  });

  test('los dos adultos de una familia ven la misma semana', async () => {
    const f = await familia();
    const t = await agregarTerapia(f.adulto, f.hijo, f.prof);
    await agregarHorario(f.adulto, t, 1, '15:00');
    const { c } = await uno(f.adulto, 'select public.crear_invitacion() as c');
    const otro = await nuevoUsuario();
    await uno(otro, 'select public.aceptar_invitacion($1)', [c]);
    expect(await semana(otro)).toEqual(await semana(f.adulto));
  });

  test('un adulto no ve terapias, profesionales ni eventos de otra familia', async () => {
    const a = await familia();
    const t = await agregarTerapia(a.adulto, a.hijo, a.prof);
    await agregarHorario(a.adulto, t, 1, '15:00');
    await uno(a.adulto, "select public.agregar_evento('Evento de A', 2, '10:00', null, $1)", [dia(-7)]);
    const b = await familia();
    const s = await semana(b.adulto);
    expect(s.flatMap((d) => d.ocurrencias)).toEqual([]);
    const mias = (await uno(b.adulto, 'select public.mis_terapias() as m')).m;
    expect(JSON.stringify(mias)).not.toContain('Evento de A');
    expect(mias.terapias).toEqual([]);
    expect(mias.profesionales.map((p: any) => p.id)).toEqual([b.prof]);
    await expect(uno(b.adulto, 'select public.terapia($1)', [t])).rejects.toThrow('ajeno');
  });
});

describe('seguridad', () => {
  test('anon no lee ni ejecuta nada nuevo', async () => {
    for (const t of TABLAS) await expect(db.q(anon, `select * from public.${t}`), t).rejects.toThrow(/permission denied/);
    await expect(db.q(anon, `select public.semana('${LUNES}')`)).rejects.toThrow(/permission denied/);
    await expect(db.q(anon, 'select public.mis_terapias()')).rejects.toThrow(/permission denied/);
  });

  test('authenticated no inserta directo en ninguna tabla nueva', async () => {
    const f = await familia();
    const inserts: Record<string, string> = {
      tipos_terapia: "insert into public.tipos_terapia values ('x', 'X', 1)",
      profesionales: `insert into public.profesionales (familia_id, nombre, tipo_id) values ('${f.fam}', 'X', 'otra')`,
      terapias: `insert into public.terapias (familia_id, hijo_id, profesional_id, tipo_id, modalidad, desde) values ('${f.fam}', '${f.hijo}', '${f.prof}', 'otra', 'virtual', now())`,
      horarios: "insert into public.horarios (terapia_id, dia_semana, hora, duracion_min, desde) values (gen_random_uuid(), 1, '10:00', 30, now())",
      eventos_familia: `insert into public.eventos_familia (familia_id, titulo, dia_semana, hora, desde) values ('${f.fam}', 'X', 1, '10:00', now())`,
    };
    for (const t of TABLAS) await expect(db.q(user(f.adulto), inserts[t]), t).rejects.toThrow(/permission denied/);
  });

  test('movimientos registra los 9 tipos nuevos', async () => {
    const f = await familia();
    await uno(f.adulto, "select public.editar_profesional($1, 'Ana', 'terapia_ocupacional', null, false)", [f.prof]);
    const t = await agregarTerapia(f.adulto, f.hijo, f.prof);
    await uno(f.adulto, "select public.editar_terapia($1, $2, 'terapia_ocupacional', 'domicilio', null)", [t, f.prof]);
    const h = await agregarHorario(f.adulto, t, 1, '10:00');
    await uno(f.adulto, 'select public.quitar_horario($1, null)', [h]);
    const { e } = await uno(f.adulto, "select public.agregar_evento('X', 2, '10:00', null, null) as e");
    await uno(f.adulto, 'select public.quitar_evento($1, null)', [e]);
    await uno(f.adulto, 'select public.terminar_terapia($1, $2)', [t, dia(10)]);
    const r = await db.q(admin, 'select distinct tipo from public.movimientos where familia_id = $1', [f.fam]);
    const tipos = new Set(r.rows.map((x) => x.tipo));
    for (const tipo of ['agrego_profesional', 'edito_profesional', 'agrego_terapia', 'edito_terapia', 'termino_terapia',
      'agrego_horario', 'quito_horario', 'agrego_evento', 'quito_evento']) expect(tipos, tipo).toContain(tipo);
  });
});
