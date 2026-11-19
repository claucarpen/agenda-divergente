// Paso 0 de la spec 001: el Postgres embebido con el shim de Supabase se comporta como Supabase.
import { afterAll, beforeAll, expect, test } from 'vitest';
import { admin, startDb, user, type Db } from './pg';

let db: Db;
beforeAll(async () => { db = await startDb([]); });
afterAll(async () => { await db?.stop(); });

test('paso 0: auth.uid() devuelve el id simulado bajo authenticated', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const r = await db.q(user(id), 'select auth.uid() as uid, current_user as rol');
  expect(r.rows[0]).toEqual({ uid: id, rol: 'authenticated' });
});

test('paso 0: auth.uid() también lee el claim viejo request.jwt.claim.sub', async () => {
  const id = '22222222-2222-4222-8222-222222222222';
  const r = await db.q(admin, "select set_config('request.jwt.claim.sub', $1, true), auth.uid() as uid", [id]);
  expect(r.rows[0].uid).toBe(id);
});

test('paso 0: los grants por defecto de Supabase están (sin ellos los tests de seguridad dan falsos verdes)', async () => {
  await db.q(admin, 'create table public.prueba_grants (id int)');
  const r = await db.q(admin, "select has_table_privilege('anon', 'public.prueba_grants', 'select') as anon_lee");
  expect(r.rows[0].anon_lee).toBe(true);
  await db.q(admin, 'drop table public.prueba_grants');
});
