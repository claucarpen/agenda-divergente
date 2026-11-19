// Spec 001, C3: reglas del espacio de familia y seguridad, sobre Postgres embebido + shim.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { admin, anon, startDb, user, type Db } from './pg';

let db: Db;
beforeAll(async () => { db = await startDb(['001_familias.sql']); });
afterAll(async () => { await db?.stop(); });

const TABLAS = ['obras_sociales', 'perfiles', 'familias', 'miembros', 'invitaciones', 'hijos', 'movimientos'];

let n = 0;
// Un usuario de Google simulado en auth.users; devuelve su id.
async function nuevoUsuario(nombre = `Adulto ${++n}`) {
  const id = randomUUID();
  await db.q(admin, 'insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
    id, `a${n}-${id.slice(0, 8)}@ejemplo.test`, { full_name: nombre },
  ]);
  return id;
}

const rpc = (u: string, sql: string, params: unknown[] = []) => db.q(user(u), sql, params);
const crearFamilia = (u: string, nombre = 'Familia de prueba') =>
  rpc(u, 'select public.crear_familia($1) as id', [nombre]).then((r) => r.rows[0].id as string);
const invitar = (u: string) => rpc(u, 'select public.crear_invitacion() as c').then((r) => r.rows[0].c as string);
const aceptar = (u: string, codigo: string) =>
  rpc(u, 'select public.aceptar_invitacion($1) as id', [codigo]).then((r) => r.rows[0].id as string);
const miFamilia = (u: string) => rpc(u, 'select public.mi_familia() as f').then((r) => r.rows[0].f);
const agregarHijo = (u: string, nombre = 'Nena', os = 'osde', plan: string | null = '310') =>
  rpc(u, 'select public.agregar_hijo($1, $2, $3) as id', [nombre, os, plan]).then((r) => r.rows[0].id as string);
const movimientos = (fam: string) =>
  db.q(admin, 'select tipo from public.movimientos where familia_id = $1', [fam]).then((r) => r.rows.map((x) => x.tipo as string));

// Una familia con su creador; devuelve los dos ids.
async function familiaCon(nombre?: string) {
  const creador = await nuevoUsuario();
  const fam = await crearFamilia(creador, nombre);
  return { creador, fam };
}

describe('crear_familia', () => {
  test('el creador queda como miembro', async () => {
    const { creador, fam } = await familiaCon();
    const r = await db.q(admin, 'select count(*)::int as n from public.miembros where familia_id = $1 and perfil_id = $2', [fam, creador]);
    expect(r.rows[0].n).toBe(1);
  });

  test('crear una segunda familia siendo miembro → rechazo', async () => {
    const { creador } = await familiaCon();
    await expect(crearFamilia(creador, 'Otra')).rejects.toThrow('ya_tiene_familia');
  });

  test('nombre vacío o de más de 60 caracteres → rechazo', async () => {
    const u = await nuevoUsuario();
    await expect(crearFamilia(u, '   ')).rejects.toThrow('nombre_invalido');
    await expect(crearFamilia(u, 'x'.repeat(61))).rejects.toThrow('nombre_invalido');
  });

  test('sin sesión → rechazo', async () => {
    await expect(db.q(admin, "select public.crear_familia('X')")).rejects.toThrow('sin_sesion');
  });
});

describe('invitaciones', () => {
  test('el código tiene ≥22 caracteres base64url y vence a los 7 días', async () => {
    const { creador } = await familiaCon();
    const c = await invitar(creador);
    expect(c).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    const r = await db.q(admin, "select round(extract(epoch from vence_en - creada_en) / 86400) as dias from public.invitaciones where codigo = $1", [c]);
    expect(Number(r.rows[0].dias)).toBe(7);
  });

  test('crear invitación sin familia → rechazo', async () => {
    const u = await nuevoUsuario();
    await expect(invitar(u)).rejects.toThrow('sin_familia');
  });

  test('aceptar una invitación válida → miembro e invitación usada', async () => {
    const { creador, fam } = await familiaCon();
    const c = await invitar(creador);
    const otro = await nuevoUsuario();
    expect(await aceptar(otro, c)).toBe(fam);
    const r = await db.q(admin, 'select usada_por from public.invitaciones where codigo = $1', [c]);
    expect(r.rows[0].usada_por).toBe(otro);
    expect((await miFamilia(otro)).id).toBe(fam);
  });

  test('aceptar dos veces: la misma persona no hace nada; otra persona → rechazo', async () => {
    const { creador, fam } = await familiaCon();
    const c = await invitar(creador);
    const otro = await nuevoUsuario();
    await aceptar(otro, c);
    expect(await aceptar(otro, c)).toBe(fam);
    const r = await db.q(admin, 'select count(*)::int as n from public.miembros where familia_id = $1', [fam]);
    expect(r.rows[0].n).toBe(2);
    const tercero = await nuevoUsuario();
    await expect(aceptar(tercero, c)).rejects.toThrow('invitacion_usada');
  });

  test('aceptar una invitación vencida → rechazo', async () => {
    const { creador } = await familiaCon();
    const c = await invitar(creador);
    await db.q(admin, "update public.invitaciones set vence_en = now() - interval '1 minute' where codigo = $1", [c]);
    await expect(aceptar(await nuevoUsuario(), c)).rejects.toThrow('invitacion_vencida');
  });

  test('aceptar siendo miembro de otra familia → rechazo', async () => {
    const a = await familiaCon();
    const b = await familiaCon();
    await expect(aceptar(b.creador, await invitar(a.creador))).rejects.toThrow('otra_familia');
  });

  test('un quinto adulto → rechazo', async () => {
    const { creador, fam } = await familiaCon();
    for (let i = 0; i < 3; i++) await aceptar(await nuevoUsuario(), await invitar(creador));
    const r = await db.q(admin, 'select count(*)::int as n from public.miembros where familia_id = $1', [fam]);
    expect(r.rows[0].n).toBe(4);
    await expect(aceptar(await nuevoUsuario(), await invitar(creador))).rejects.toThrow('familia_llena');
  });

  test('código inexistente → rechazo', async () => {
    await expect(aceptar(await nuevoUsuario(), 'AAAAAAAAAAAAAAAAAAAAAA')).rejects.toThrow('no_existe');
  });

  test('invitacion_publica solo expone familia, quién invita y vigencia', async () => {
    const { creador } = await familiaCon('Los Pérez');
    const c = await invitar(creador);
    const r = await db.q(anon, 'select * from public.invitacion_publica($1)', [c]);
    expect(r.fields.map((f) => f.name).sort()).toEqual(['familia', 'invita', 'vigente']);
    expect(r.rows[0]).toEqual({ familia: 'Los Pérez', invita: expect.stringMatching(/^Adulto \d+$/), vigente: true });
    const usada = await nuevoUsuario();
    await aceptar(usada, c);
    const r2 = await db.q(anon, 'select vigente from public.invitacion_publica($1)', [c]);
    expect(r2.rows[0].vigente).toBe(false);
  });
});

describe('mi_familia', () => {
  test('no expone emails', async () => {
    const { creador } = await familiaCon();
    await aceptar(await nuevoUsuario(), await invitar(creador));
    const f = await miFamilia(creador);
    expect(f.adultos).toHaveLength(2);
    expect(JSON.stringify(f)).not.toContain('@');
  });

  test('sin familia devuelve null', async () => {
    expect(await miFamilia(await nuevoUsuario())).toBeNull();
  });

  test('un usuario no ve la familia ni los hijos de otra', async () => {
    const a = await familiaCon('Familia A');
    await agregarHijo(a.creador, 'Hijo de A');
    const b = await familiaCon('Familia B');
    const vista = await miFamilia(b.creador);
    expect(vista.nombre).toBe('Familia B');
    expect(JSON.stringify(vista)).not.toContain('Hijo de A');
  });
});

describe('hijos', () => {
  test('agregar un hijo con nombre, obra social y plan', async () => {
    const { creador } = await familiaCon();
    await agregarHijo(creador, 'Nena', 'osde', '310');
    const f = await miFamilia(creador);
    expect(f.hijos).toEqual([expect.objectContaining({ nombre: 'Nena', obra_social: 'OSDE', plan: '310' })]);
  });

  test('obra social inexistente → rechazo', async () => {
    const { creador } = await familiaCon();
    await expect(agregarHijo(creador, 'Nena', 'no-existe')).rejects.toThrow('obra_social_invalida');
  });

  test('editar un hijo de otra familia → rechazo', async () => {
    const a = await familiaCon();
    const hijo = await agregarHijo(a.creador);
    const b = await familiaCon();
    await expect(rpc(b.creador, "select public.editar_hijo($1, 'Otro', 'osde', null)", [hijo])).rejects.toThrow('hijo_ajeno');
  });

  test('cualquier adulto de la familia edita (mismo perfil)', async () => {
    const { creador } = await familiaCon();
    const hijo = await agregarHijo(creador);
    const otro = await nuevoUsuario();
    await aceptar(otro, await invitar(creador));
    await rpc(otro, "select public.editar_hijo($1, 'Apodo', 'osde', '410')", [hijo]);
    const f = await miFamilia(creador);
    expect(f.hijos[0]).toEqual(expect.objectContaining({ nombre: 'Apodo', plan: '410' }));
  });
});

describe('seguridad', () => {
  test('anon no puede leer ninguna tabla', async () => {
    for (const t of TABLAS) {
      await expect(db.q(anon, `select * from public.${t}`), t).rejects.toThrow(/permission denied/);
    }
  });

  test('authenticated no puede insertar directo en ninguna tabla', async () => {
    const u = await nuevoUsuario();
    const inserts: Record<string, string> = {
      obras_sociales: "insert into public.obras_sociales values ('x', 'X')",
      perfiles: `insert into public.perfiles (id, nombre) values ('${u}', 'Yo')`,
      familias: "insert into public.familias (nombre) values ('X')",
      miembros: `insert into public.miembros (familia_id, perfil_id) values (gen_random_uuid(), '${u}')`,
      invitaciones: `insert into public.invitaciones (codigo, familia_id, creada_por) values ('x', gen_random_uuid(), '${u}')`,
      hijos: "insert into public.hijos (familia_id, nombre, obra_social_id) values (gen_random_uuid(), 'X', 'osde')",
      movimientos: "insert into public.movimientos (familia_id, tipo) values (gen_random_uuid(), 'invito')",
    };
    for (const t of TABLAS) {
      await expect(db.q(user(u), inserts[t]), t).rejects.toThrow(/permission denied/);
    }
  });

  test('authenticated solo lee su propia fila de perfiles y ninguna otra tabla', async () => {
    const a = await familiaCon();
    const b = await familiaCon();
    const r = await db.q(user(a.creador), 'select id from public.perfiles');
    expect(r.rows.map((x) => x.id)).toEqual([a.creador]);
    expect(b.creador).not.toBe(a.creador);
    for (const t of TABLAS.filter((x) => x !== 'perfiles')) {
      await expect(db.q(user(a.creador), `select * from public.${t}`), t).rejects.toThrow(/permission denied/);
    }
  });

  test('anon no puede ejecutar las funciones de miembros', async () => {
    await expect(db.q(anon, 'select public.mi_familia()')).rejects.toThrow(/permission denied/);
    await expect(db.q(anon, "select public.crear_familia('X')")).rejects.toThrow(/permission denied/);
  });

  test('movimientos registra los 5 tipos', async () => {
    const { creador, fam } = await familiaCon();
    await aceptar(await nuevoUsuario(), await invitar(creador));
    const hijo = await agregarHijo(creador);
    await rpc(creador, "select public.editar_hijo($1, 'Apodo', 'osde', null)", [hijo]);
    expect(new Set(await movimientos(fam))).toEqual(new Set(['creo_familia', 'invito', 'se_unio', 'agrego_hijo', 'edito_hijo']));
  });
});
