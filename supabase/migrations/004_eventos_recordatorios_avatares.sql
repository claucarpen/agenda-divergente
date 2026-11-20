-- Spec 004: eventos con fecha propia, recordatorios (10 minutos antes y el día anterior) y avatares
-- ilustrados. Mismo patrón: RLS en todo, acceso solo por funciones security definer con search_path
-- vacío. La única función para `anon` es `tomar_recordatorios`, que exige el secreto del reloj.
-- Regla de datos (decisions.md, [datos]): los avatares son ids de una galería; ningún archivo.

-- Tablas ---------------------------------------------------------------------------------------

create table public.eventos_fecha (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias (id) on delete cascade,
  hijo_id uuid references public.hijos (id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 60),
  fecha date not null,
  hora time,
  nota text check (nota is null or char_length(nota) between 1 and 80),
  creado_por uuid references public.perfiles (id) on delete set null,
  creado_en timestamptz not null default now()
);
create index eventos_fecha_por_familia on public.eventos_fecha (familia_id, fecha);

create table public.recordatorios_enviados (
  clave text primary key,
  familia_id uuid not null references public.familias (id) on delete cascade,
  enviado_en timestamptz not null default now()
);

-- Configuración que solo leen las funciones security definer (y el trabajo de pg_cron, como postgres).
create table public.config_privada (
  clave text primary key,
  valor text not null
);

alter table public.eventos_fecha enable row level security;
alter table public.recordatorios_enviados enable row level security;
alter table public.config_privada enable row level security;
revoke all on public.eventos_fecha, public.recordatorios_enviados, public.config_privada from anon, authenticated;

-- Galería cerrada de avatares (public/avatares/<id>.svg).
alter table public.perfiles add column avatar text check (avatar is null or avatar in (
  'zorro', 'pulpo', 'buho', 'gato', 'perro', 'conejo', 'oso', 'pinguino', 'rana', 'ballena', 'dino', 'caracol'));
alter table public.hijos add column avatar text check (avatar is null or avatar in (
  'zorro', 'pulpo', 'buho', 'gato', 'perro', 'conejo', 'oso', 'pinguino', 'rana', 'ballena', 'dino', 'caracol'));
alter table public.perfiles add column recordatorios boolean not null default true;

alter table public.movimientos drop constraint movimientos_tipo_check;
alter table public.movimientos add constraint movimientos_tipo_check check (tipo in (
  'creo_familia', 'invito', 'se_unio', 'agrego_hijo', 'edito_hijo',
  'agrego_profesional', 'edito_profesional', 'agrego_terapia', 'edito_terapia', 'termino_terapia',
  'agrego_horario', 'quito_horario', 'agrego_evento', 'quito_evento',
  'cambio_turno', 'anulo_cambio', 'activo_avisos', 'desactivo_avisos',
  'agrego_evento_fecha', 'edito_evento_fecha', 'borro_evento_fecha', 'eligio_avatar'));

-- Funciones internas ---------------------------------------------------------------------------

-- Un evento con fecha como objeto JSON.
create function public._evento_fecha_json(e public.eventos_fecha) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id, 'titulo', e.titulo, 'fecha', e.fecha, 'hora', to_char(e.hora, 'HH24:MI'),
    'todo_el_dia', e.hora is null, 'nota', e.nota, 'hijo_id', e.hijo_id,
    'hijo', (select h.nombre from public.hijos h where h.id = e.hijo_id),
    'quien', (select p.nombre from public.perfiles p where p.id = e.creado_por),
    'quien_avatar', (select p.avatar from public.perfiles p where p.id = e.creado_por))
$$;

-- Valida los campos de un evento con fecha; si algo falla, la clave del error.
create function public._validar_evento_fecha(fam uuid, titulo text, fecha date, hijo_id uuid, nota text) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if titulo is null or char_length(titulo) > 60 then raise exception 'titulo_invalido'; end if;
  if fecha is null or fecha < public._hoy() then raise exception 'fecha_pasada'; end if;
  if nota is not null and char_length(nota) > 80 then raise exception 'nota_invalida'; end if;
  if hijo_id is not null and not exists (select 1 from public.hijos h where h.id = hijo_id and h.familia_id = fam) then
    raise exception 'ajeno';
  end if;
end
$$;

-- Funciones públicas: eventos con fecha ---------------------------------------------------------

create function public.agregar_evento_fecha(titulo text, fecha date, hora time default null,
  hijo_id uuid default null, nota text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
  ti text := public._limpio(agregar_evento_fecha.titulo);
  n text := public._limpio(agregar_evento_fecha.nota);
  e public.eventos_fecha%rowtype;
begin
  perform public._validar_evento_fecha(fam, ti, agregar_evento_fecha.fecha, agregar_evento_fecha.hijo_id, n);
  insert into public.eventos_fecha (familia_id, hijo_id, titulo, fecha, hora, nota, creado_por)
  values (fam, agregar_evento_fecha.hijo_id, ti, agregar_evento_fecha.fecha, agregar_evento_fecha.hora, n, auth.uid())
  returning * into e;
  perform public._registrar(fam, 'agrego_evento_fecha');
  return public._evento_fecha_json(e);
end
$$;

-- Devuelve el evento como estaba antes del cambio (para el aviso).
create function public.editar_evento_fecha(id uuid, titulo text, fecha date, hora time default null,
  hijo_id uuid default null, nota text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
  ti text := public._limpio(editar_evento_fecha.titulo);
  n text := public._limpio(editar_evento_fecha.nota);
  previo public.eventos_fecha%rowtype;
begin
  select * into previo from public.eventos_fecha x where x.id = editar_evento_fecha.id and x.familia_id = fam for update;
  if not found then raise exception 'ajeno'; end if;
  perform public._validar_evento_fecha(fam, ti, editar_evento_fecha.fecha, editar_evento_fecha.hijo_id, n);
  update public.eventos_fecha x
  set titulo = ti, fecha = editar_evento_fecha.fecha, hora = editar_evento_fecha.hora,
      hijo_id = editar_evento_fecha.hijo_id, nota = n
  where x.id = previo.id;
  perform public._registrar(fam, 'edito_evento_fecha');
  return public._evento_fecha_json(previo);
end
$$;

-- Borra de verdad; devuelve el evento borrado (para el aviso).
create function public.borrar_evento_fecha(id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
  previo public.eventos_fecha%rowtype;
begin
  delete from public.eventos_fecha x where x.id = borrar_evento_fecha.id and x.familia_id = fam
  returning * into previo;
  if not found then raise exception 'ajeno'; end if;
  perform public._registrar(fam, 'borro_evento_fecha');
  return public._evento_fecha_json(previo);
end
$$;

create function public.evento_fecha(id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
  e public.eventos_fecha%rowtype;
begin
  select * into e from public.eventos_fecha x where x.id = evento_fecha.id and x.familia_id = fam;
  if not found then raise exception 'ajeno'; end if;
  return public._evento_fecha_json(e);
end
$$;

-- Funciones públicas: avatares y recordatorios -------------------------------------------------

create function public.elegir_avatar(avatar text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  yo uuid := public._exigir_sesion();
  fam uuid := public._exigir_familia();
begin
  begin
    update public.perfiles p set avatar = elegir_avatar.avatar where p.id = yo;
  exception when check_violation then raise exception 'avatar_invalido';
  end;
  perform public._registrar(fam, 'eligio_avatar');
end
$$;

create function public.elegir_avatar_hijo(hijo_id uuid, avatar text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
begin
  if not exists (select 1 from public.hijos h where h.id = elegir_avatar_hijo.hijo_id and h.familia_id = fam) then
    raise exception 'ajeno';
  end if;
  begin
    update public.hijos h set avatar = elegir_avatar_hijo.avatar where h.id = elegir_avatar_hijo.hijo_id;
  exception when check_violation then raise exception 'avatar_invalido';
  end;
  perform public._registrar(fam, 'eligio_avatar');
end
$$;

create function public.cambiar_recordatorios(activos boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  yo uuid := public._exigir_sesion();
begin
  if activos is null then raise exception 'valor_invalido'; end if;
  update public.perfiles p set recordatorios = cambiar_recordatorios.activos where p.id = yo;
end
$$;

-- La familia, ahora con avatares y con los recordatorios de quien llama.
create or replace function public.mi_familia() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', f.id,
    'nombre', f.nombre,
    'recordatorios', (select p.recordatorios from public.perfiles p where p.id = auth.uid()),
    'adultos', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', p.nombre, 'soy_yo', p.id = auth.uid(), 'avatar', p.avatar) order by m.unido_en)
      from public.miembros m join public.perfiles p on p.id = m.perfil_id
      where m.familia_id = f.id), '[]'::jsonb),
    'hijos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'nombre', h.nombre, 'plan', h.plan, 'avatar', h.avatar,
        'obra_social_id', o.id, 'obra_social', o.nombre) order by h.creado_en)
      from public.hijos h join public.obras_sociales o on o.id = h.obra_social_id
      where h.familia_id = f.id), '[]'::jsonb)
  )
  from public.familias f
  where f.id = public._familia_de_quien_llama()
$$;

-- La semana, ahora con los eventos con fecha ----------------------------------------------------

create or replace function public.semana(lunes date) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
begin
  if lunes is null or extract(isodow from lunes) <> 1 then raise exception 'no_es_lunes'; end if;
  return (
    select jsonb_agg(jsonb_build_object(
      'fecha', d.dia,
      'todo_el_dia', coalesce((
        select jsonb_agg(public._evento_fecha_json(e) || jsonb_build_object('clase', 'evento_fecha') order by e.creado_en)
        from public.eventos_fecha e
        where e.familia_id = fam and e.fecha = d.dia and e.hora is null), '[]'::jsonb),
      'ocurrencias', coalesce((
        select jsonb_agg(o.item order by o.hora, o.orden)
        from (
          select oc.hora, 0 as orden, oc.item
          from public._ocurrencias(fam, lunes, (lunes + 6)::date) oc
          where oc.dia = d.dia
          union all
          select e.hora, 1, jsonb_build_object(
            'clase', 'evento', 'evento_id', e.id, 'inicio', to_char(e.hora, 'HH24:MI'),
            'titulo', e.titulo, 'hijo', (select hi.nombre from public.hijos hi where hi.id = e.hijo_id))
          from public.eventos_familia e
          where e.familia_id = fam
            and e.dia_semana = extract(isodow from d.dia)
            and e.desde <= d.dia and (e.hasta is null or e.hasta >= d.dia)
          union all
          select e.hora, 2, public._evento_fecha_json(e)
            || jsonb_build_object('clase', 'evento_fecha', 'evento_id', e.id, 'inicio', to_char(e.hora, 'HH24:MI'))
          from public.eventos_fecha e
          where e.familia_id = fam and e.fecha = d.dia and e.hora is not null
        ) o), '[]'::jsonb)
    ) order by d.dia)
    from (select (lunes + i)::date as dia from generate_series(0, 6) i) d
  );
end
$$;

-- El reloj: recordatorios -----------------------------------------------------------------------

-- Lo que toca recordar en `ahora` para todas las familias. Registra cada recordatorio en
-- `recordatorios_enviados` en la misma transacción: llamada dos veces, la segunda devuelve vacío.
-- Devuelve las partes del texto (lo arma `textos-aviso.ts`) y las suscripciones de los adultos de
-- esa familia con los recordatorios prendidos. Nunca emails ni el nombre del hijo de la ficha.
create function public.tomar_recordatorios(secreto text, ahora timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  local_ahora timestamp := ahora at time zone 'America/Argentina/Buenos_Aires';
  hoy date := local_ahora::date;
  manana date := (local_ahora::date + 1);
  esperado text := (select c.valor from public.config_privada c where c.clave = 'cron_secret');
  resultado jsonb;
begin
  if esperado is null or secreto is null or secreto <> esperado then raise exception 'secreto_invalido'; end if;

  with candidatos as (
    -- 10 minutos antes: turnos de terapia (con los cambios aplicados; los cancelados no avisan).
    select f.id as familia_id, 'diez'::text as tipo,
           '10min:t:' || (oc.item ->> 'horario_id') || ':' || oc.dia || ':' || oc.hora as clave,
           oc.item ->> 'tipo' as titulo, oc.dia as fecha, oc.hora, oc.item ->> 'lugar' as lugar
    from public.familias f
    cross join lateral public._ocurrencias(f.id, hoy, manana) oc
    where oc.item ->> 'estado' <> 'cancelado'
      and (oc.dia + oc.hora) > local_ahora and (oc.dia + oc.hora) <= local_ahora + interval '10 minutes'
    union all
    -- 10 minutos antes: eventos semanales.
    select e.familia_id, 'diez', '10min:s:' || e.id || ':' || d.dia || ':' || e.hora,
           e.titulo, d.dia, e.hora, null
    from public.eventos_familia e
    cross join (values (hoy), (manana)) d (dia)
    where e.dia_semana = extract(isodow from d.dia)
      and e.desde <= d.dia and (e.hasta is null or e.hasta >= d.dia)
      and (d.dia + e.hora) > local_ahora and (d.dia + e.hora) <= local_ahora + interval '10 minutes'
    union all
    -- 10 minutos antes: eventos con fecha y hora.
    select e.familia_id, 'diez', '10min:f:' || e.id || ':' || e.fecha || ':' || e.hora,
           e.titulo, e.fecha, e.hora, null
    from public.eventos_fecha e
    where e.hora is not null
      and (e.fecha + e.hora) > local_ahora and (e.fecha + e.hora) <= local_ahora + interval '10 minutes'
    union all
    -- El día anterior, desde las 20:00: eventos con fecha de mañana (con hora o de todo el día).
    select e.familia_id, 'manana', 'manana:' || e.id || ':' || e.fecha,
           e.titulo, e.fecha, e.hora, null
    from public.eventos_fecha e
    where e.fecha = manana and local_ahora::time >= time '20:00'
  ),
  nuevos as (
    insert into public.recordatorios_enviados (clave, familia_id)
    select c.clave, c.familia_id from candidatos c
    on conflict (clave) do nothing
    returning clave
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'tipo', c.tipo, 'titulo', c.titulo, 'fecha', c.fecha, 'hora', to_char(c.hora, 'HH24:MI'), 'lugar', c.lugar,
    'suscripciones', s.lista) order by c.fecha, c.hora), '[]'::jsonb)
  into resultado
  from candidatos c
  join nuevos n on n.clave = c.clave
  cross join lateral (
    select jsonb_agg(jsonb_build_object('endpoint', x.endpoint, 'p256dh', x.p256dh, 'auth', x.auth)) as lista
    from public.suscripciones_push x
    join public.miembros m on m.perfil_id = x.perfil_id
    join public.perfiles p on p.id = x.perfil_id
    where m.familia_id = c.familia_id and p.recordatorios) s
  where s.lista is not null;

  -- Se limpia lo enviado hace más de 3 días: las claves llevan fecha y no vuelven a tocar.
  delete from public.recordatorios_enviados r where r.enviado_en < now() - interval '3 days';
  return resultado;
end
$$;

-- Permisos de ejecución ------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.asegurar_perfil() to authenticated;
grant execute on function public.crear_familia(text) to authenticated;
grant execute on function public.mi_familia() to authenticated;
grant execute on function public.crear_invitacion() to authenticated;
grant execute on function public.invitacion_publica(text) to anon, authenticated;
grant execute on function public.aceptar_invitacion(text) to authenticated;
grant execute on function public.agregar_hijo(text, text, text) to authenticated;
grant execute on function public.editar_hijo(uuid, text, text, text) to authenticated;
grant execute on function public.agregar_profesional(text, text, text, boolean) to authenticated;
grant execute on function public.editar_profesional(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.agregar_terapia(uuid, uuid, text, text, text, date) to authenticated;
grant execute on function public.editar_terapia(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.terminar_terapia(uuid, date) to authenticated;
grant execute on function public.agregar_horario(uuid, int, time, int, date) to authenticated;
grant execute on function public.quitar_horario(uuid, date) to authenticated;
grant execute on function public.agregar_evento(text, int, time, uuid, date) to authenticated;
grant execute on function public.quitar_evento(uuid, date) to authenticated;
grant execute on function public.mis_terapias() to authenticated;
grant execute on function public.terapia(uuid) to authenticated;
grant execute on function public.semana(date) to authenticated;
grant execute on function public.cambiar_turno_una_vez(uuid, date, text, date, time, text) to authenticated;
grant execute on function public.cambiar_turno_periodo(uuid, date, date, text, int, time, text) to authenticated;
grant execute on function public.anular_cambio(uuid) to authenticated;
grant execute on function public.cambios_vigentes() to authenticated;
grant execute on function public.turno(uuid, date) to authenticated;
grant execute on function public.guardar_suscripcion(text, text, text) to authenticated;
grant execute on function public.borrar_suscripcion(text) to authenticated;
grant execute on function public.destinatarios_aviso() to authenticated;
grant execute on function public.marcar_suscripcion(text, boolean) to authenticated;
grant execute on function public.estado_avisos() to authenticated;
grant execute on function public.agregar_evento_fecha(text, date, time, uuid, text) to authenticated;
grant execute on function public.editar_evento_fecha(uuid, text, date, time, uuid, text) to authenticated;
grant execute on function public.borrar_evento_fecha(uuid) to authenticated;
grant execute on function public.evento_fecha(uuid) to authenticated;
grant execute on function public.elegir_avatar(text) to authenticated;
grant execute on function public.elegir_avatar_hijo(uuid, text) to authenticated;
grant execute on function public.cambiar_recordatorios(boolean) to authenticated;
grant execute on function public.tomar_recordatorios(text, timestamptz) to anon;
