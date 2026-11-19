-- Spec 003: cambios de turno (una vez o por un período) y suscripciones de Web Push.
-- Los horarios fijos no se tocan: `semana()` se redefine para aplicar los cambios no anulados.
-- Mismo patrón: RLS en todo, acceso solo por funciones security definer con search_path vacío.

-- Tablas ---------------------------------------------------------------------------------------

create table public.cambios (
  id uuid primary key default gen_random_uuid(),
  horario_id uuid not null references public.horarios (id) on delete cascade,
  alcance text not null check (alcance in ('una_vez', 'periodo')),
  fecha date,
  desde date,
  hasta date,
  accion text not null check (accion in ('mover', 'cancelar')),
  nueva_fecha date,
  nuevo_dia_semana int check (nuevo_dia_semana between 1 and 7),
  nueva_hora time,
  nota text check (nota is null or char_length(nota) between 1 and 80),
  creado_por uuid references public.perfiles (id) on delete set null,
  creado_en timestamptz not null default now(),
  anulado_en timestamptz,
  check (alcance <> 'una_vez' or (fecha is not null and desde is null and hasta is null and nuevo_dia_semana is null)),
  check (alcance <> 'periodo' or (fecha is null and nueva_fecha is null and desde is not null and hasta is not null
                                  and desde <= hasta and hasta - desde <= 180)),
  check (accion <> 'mover' or (nueva_hora is not null and (nueva_fecha is not null or nuevo_dia_semana is not null))),
  check (accion <> 'cancelar' or (nueva_hora is null and nueva_fecha is null and nuevo_dia_semana is null))
);
create index cambios_por_horario on public.cambios (horario_id) where anulado_en is null;

create table public.suscripciones_push (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  creada_en timestamptz not null default now(),
  ultimo_ok timestamptz
);

alter table public.cambios enable row level security;
alter table public.suscripciones_push enable row level security;
revoke all on public.cambios, public.suscripciones_push from anon, authenticated;

alter table public.movimientos drop constraint movimientos_tipo_check;
alter table public.movimientos add constraint movimientos_tipo_check check (tipo in (
  'creo_familia', 'invito', 'se_unio', 'agrego_hijo', 'edito_hijo',
  'agrego_profesional', 'edito_profesional', 'agrego_terapia', 'edito_terapia', 'termino_terapia',
  'agrego_horario', 'quito_horario', 'agrego_evento', 'quito_evento',
  'cambio_turno', 'anulo_cambio', 'activo_avisos', 'desactivo_avisos'));

-- Funciones internas ---------------------------------------------------------------------------

-- El horario, si es de la familia de quien llama; si no, `ajeno`.
create function public._horario_de_mi_familia(horario_id uuid) returns public.horarios
language plpgsql stable security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
  h public.horarios%rowtype;
begin
  select x.* into h from public.horarios x join public.terapias t on t.id = x.terapia_id
  where x.id = horario_id and t.familia_id = fam;
  if not found then raise exception 'ajeno'; end if;
  return h;
end
$$;

-- ¿El horario tiene turno ese día? (su día de la semana, horario y terapia vigentes).
create function public._hay_turno(h public.horarios, dia date) returns boolean
language sql stable security definer set search_path = ''
as $$
  select extract(isodow from dia) = h.dia_semana
     and h.desde <= dia and (h.hasta is null or h.hasta >= dia)
     and exists (select 1 from public.terapias t
                 where t.id = h.terapia_id and t.desde <= dia and (t.hasta is null or t.hasta >= dia))
$$;

-- ¿Hay un cambio no anulado del horario que afecte algún día entre `ini` y `fin`?
create function public._cambio_superpuesto(horario_id uuid, ini date, fin date) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.cambios c
    where c.horario_id = _cambio_superpuesto.horario_id and c.anulado_en is null
      and coalesce(c.fecha, c.desde) <= fin and coalesce(c.fecha, c.hasta) >= ini)
$$;

-- Funciones públicas: cambios ------------------------------------------------------------------

create function public.cambiar_turno_una_vez(horario_id uuid, fecha date, accion text,
  nueva_fecha date default null, nueva_hora time default null, nota text default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  h public.horarios := public._horario_de_mi_familia(cambiar_turno_una_vez.horario_id);
  n text := public._limpio(cambiar_turno_una_vez.nota);
  nuevo uuid;
begin
  if cambiar_turno_una_vez.fecha is null or not public._hay_turno(h, cambiar_turno_una_vez.fecha) then
    raise exception 'sin_turno';
  end if;
  if cambiar_turno_una_vez.accion not in ('mover', 'cancelar') then raise exception 'accion_invalida'; end if;
  if cambiar_turno_una_vez.accion = 'mover' and cambiar_turno_una_vez.nueva_hora is null then raise exception 'hora_invalida'; end if;
  if n is not null and char_length(n) > 80 then raise exception 'nota_invalida'; end if;
  if public._cambio_superpuesto(h.id, cambiar_turno_una_vez.fecha, cambiar_turno_una_vez.fecha) then
    raise exception 'cambio_superpuesto';
  end if;
  insert into public.cambios (horario_id, alcance, fecha, accion, nueva_fecha, nueva_hora, nota, creado_por)
  values (h.id, 'una_vez', cambiar_turno_una_vez.fecha, cambiar_turno_una_vez.accion,
    case when cambiar_turno_una_vez.accion = 'mover' then coalesce(cambiar_turno_una_vez.nueva_fecha, cambiar_turno_una_vez.fecha) end,
    case when cambiar_turno_una_vez.accion = 'mover' then cambiar_turno_una_vez.nueva_hora end,
    n, auth.uid())
  returning id into nuevo;
  perform public._registrar(public._familia_de_quien_llama(), 'cambio_turno');
  return nuevo;
end
$$;

create function public.cambiar_turno_periodo(horario_id uuid, desde date, hasta date, accion text,
  nuevo_dia_semana int default null, nueva_hora time default null, nota text default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  h public.horarios := public._horario_de_mi_familia(cambiar_turno_periodo.horario_id);
  n text := public._limpio(cambiar_turno_periodo.nota);
  nuevo uuid;
begin
  if cambiar_turno_periodo.desde is null or cambiar_turno_periodo.hasta is null
     or cambiar_turno_periodo.desde > cambiar_turno_periodo.hasta then
    raise exception 'periodo_invalido';
  end if;
  if cambiar_turno_periodo.hasta - cambiar_turno_periodo.desde > 180 then raise exception 'periodo_largo'; end if;
  if cambiar_turno_periodo.accion not in ('mover', 'cancelar') then raise exception 'accion_invalida'; end if;
  if cambiar_turno_periodo.accion = 'mover' then
    if cambiar_turno_periodo.nueva_hora is null then raise exception 'hora_invalida'; end if;
    if cambiar_turno_periodo.nuevo_dia_semana is not null and cambiar_turno_periodo.nuevo_dia_semana not between 1 and 7 then
      raise exception 'dia_invalido';
    end if;
  end if;
  if n is not null and char_length(n) > 80 then raise exception 'nota_invalida'; end if;
  if public._cambio_superpuesto(h.id, cambiar_turno_periodo.desde, cambiar_turno_periodo.hasta) then
    raise exception 'cambio_superpuesto';
  end if;
  insert into public.cambios (horario_id, alcance, desde, hasta, accion, nuevo_dia_semana, nueva_hora, nota, creado_por)
  values (h.id, 'periodo', cambiar_turno_periodo.desde, cambiar_turno_periodo.hasta, cambiar_turno_periodo.accion,
    case when cambiar_turno_periodo.accion = 'mover' then coalesce(cambiar_turno_periodo.nuevo_dia_semana, h.dia_semana) end,
    case when cambiar_turno_periodo.accion = 'mover' then cambiar_turno_periodo.nueva_hora end,
    n, auth.uid())
  returning id into nuevo;
  perform public._registrar(public._familia_de_quien_llama(), 'cambio_turno');
  return nuevo;
end
$$;

create function public.anular_cambio(id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
begin
  update public.cambios c set anulado_en = now()
  from public.horarios h, public.terapias t
  where c.id = anular_cambio.id and c.anulado_en is null
    and h.id = c.horario_id and t.id = h.terapia_id and t.familia_id = fam;
  if not found then raise exception 'ajeno'; end if;
  perform public._registrar(fam, 'anulo_cambio');
end
$$;

-- Un cambio como objeto JSON, con su terapia y su horario original.
create function public._cambio_json(c public.cambios) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'alcance', c.alcance, 'accion', c.accion,
    'fecha', c.fecha, 'desde', c.desde, 'hasta', c.hasta,
    'nueva_fecha', c.nueva_fecha, 'nuevo_dia_semana', c.nuevo_dia_semana,
    'nueva_hora', to_char(c.nueva_hora, 'HH24:MI'), 'nota', c.nota,
    'quien', (select p.nombre from public.perfiles p where p.id = c.creado_por),
    'horario_id', h.id, 'dia_semana', h.dia_semana, 'hora', to_char(h.hora, 'HH24:MI'), 'duracion_min', h.duracion_min,
    'terapia_id', t.id, 'tipo', tt.nombre)
  from public.horarios h
  join public.terapias t on t.id = h.terapia_id
  join public.tipos_terapia tt on tt.id = t.tipo_id
  where h.id = c.horario_id
$$;

-- Cambios no anulados que terminan hoy o después.
create function public.cambios_vigentes() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
  hoy date := public._hoy();
begin
  return coalesce((
    select jsonb_agg(public._cambio_json(c) order by coalesce(c.fecha, c.desde))
    from public.cambios c
    join public.horarios h on h.id = c.horario_id
    join public.terapias t on t.id = h.terapia_id
    where t.familia_id = fam and c.anulado_en is null
      and greatest(c.fecha, c.nueva_fecha, c.hasta) >= hoy), '[]'::jsonb);
end
$$;

-- Un turno puntual: su terapia, su horario y, si lo hay, el cambio no anulado de ese día.
create function public.turno(horario_id uuid, fecha date) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  h public.horarios := public._horario_de_mi_familia(turno.horario_id);
  c public.cambios%rowtype;
begin
  select * into c from public.cambios x
  where x.horario_id = h.id and x.anulado_en is null
    and coalesce(x.fecha, x.desde) <= turno.fecha and coalesce(x.fecha, x.hasta) >= turno.fecha
  limit 1;
  return jsonb_build_object(
    'horario_id', h.id, 'fecha', turno.fecha, 'hay_turno', public._hay_turno(h, turno.fecha),
    'dia_semana', h.dia_semana, 'hora', to_char(h.hora, 'HH24:MI'), 'duracion_min', h.duracion_min,
    'terapia', public._terapia_json((select t from public.terapias t where t.id = h.terapia_id), public._hoy()),
    'cambio', case when c.id is null then null else public._cambio_json(c) end);
end
$$;

-- Funciones públicas: suscripciones de Web Push ------------------------------------------------

create function public.guardar_suscripcion(endpoint text, p256dh text, auth text) returns void
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  -- El parámetro `auth` tapa al schema `auth`: quien llama sale de `_exigir_sesion()`, no de `auth.uid()`.
  yo uuid := public._exigir_sesion();
  fam uuid := public._exigir_familia();
begin
  if guardar_suscripcion.endpoint is null or guardar_suscripcion.endpoint !~ '^https://'
     or char_length(guardar_suscripcion.endpoint) > 1000
     or char_length(coalesce(guardar_suscripcion.p256dh, '')) not between 20 and 200
     or char_length(coalesce(guardar_suscripcion.auth, '')) not between 8 and 100 then
    raise exception 'suscripcion_invalida';
  end if;
  insert into public.suscripciones_push (perfil_id, endpoint, p256dh, auth)
  values (yo, guardar_suscripcion.endpoint, guardar_suscripcion.p256dh, guardar_suscripcion.auth)
  on conflict (endpoint) do update set perfil_id = excluded.perfil_id, p256dh = excluded.p256dh, auth = excluded.auth;
  perform public._registrar(fam, 'activo_avisos');
end
$$;

create function public.borrar_suscripcion(endpoint text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
begin
  delete from public.suscripciones_push s where s.endpoint = borrar_suscripcion.endpoint and s.perfil_id = auth.uid();
  if found then perform public._registrar(fam, 'desactivo_avisos'); end if;
end
$$;

-- Suscripciones de todos los adultos de la familia de quien llama, incluido quien llama.
create function public.destinatarios_aviso()
returns table (endpoint text, p256dh text, auth text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
begin
  return query
  select s.endpoint, s.p256dh, s.auth
  from public.suscripciones_push s
  join public.miembros m on m.perfil_id = s.perfil_id
  where m.familia_id = fam;
end
$$;

-- Con `ok`, registra el último envío bueno; sin `ok` (404 o 410 del servicio), borra la suscripción.
create function public.marcar_suscripcion(endpoint text, ok boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
begin
  if ok then
    update public.suscripciones_push s set ultimo_ok = now()
    from public.miembros m
    where s.endpoint = marcar_suscripcion.endpoint and m.perfil_id = s.perfil_id and m.familia_id = fam;
  else
    delete from public.suscripciones_push s
    using public.miembros m
    where s.endpoint = marcar_suscripcion.endpoint and m.perfil_id = s.perfil_id and m.familia_id = fam;
  end if;
end
$$;

-- Por adulto de la familia: nombre y si tiene al menos un celular suscripto.
create function public.estado_avisos() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
begin
  return (
    select jsonb_agg(jsonb_build_object(
      'nombre', p.nombre, 'soy_yo', p.id = auth.uid(),
      'activos', exists (select 1 from public.suscripciones_push s where s.perfil_id = p.id)) order by m.unido_en)
    from public.miembros m join public.perfiles p on p.id = m.perfil_id
    where m.familia_id = fam);
end
$$;

-- La semana, ahora con los cambios ---------------------------------------------------------------

-- Ocurrencias de terapias entre `ini` y `fin`: horarios fijos sin cambio, cancelados y movidos.
create function public._ocurrencias(fam uuid, ini date, fin date)
returns table (dia date, hora time, item jsonb)
language sql stable security definer set search_path = ''
as $$
  with dias as (
    select d::date as dia from generate_series(ini, fin, interval '1 day') d
  ),
  base as (
    select d.dia, h, c.id as cambio_id, c.accion, c.nota
    from dias d
    join public.horarios h on h.dia_semana = extract(isodow from d.dia)
    join public.terapias t on t.id = h.terapia_id and t.familia_id = fam
    left join lateral (
      select x.* from public.cambios x
      where x.horario_id = h.id and x.anulado_en is null
        and coalesce(x.fecha, x.desde) <= d.dia and coalesce(x.fecha, x.hasta) >= d.dia
      limit 1) c on true
    where public._hay_turno(h, d.dia)
  ),
  movidos as (
    -- Una vez: aparece en `nueva_fecha`.
    select c.nueva_fecha as dia, h, c.id as cambio_id, c.nueva_hora, c.nota, c.fecha as original
    from public.cambios c
    join public.horarios h on h.id = c.horario_id
    join public.terapias t on t.id = h.terapia_id and t.familia_id = fam
    where c.alcance = 'una_vez' and c.accion = 'mover' and c.anulado_en is null
      and c.nueva_fecha between ini and fin and public._hay_turno(h, c.fecha)
    union all
    -- Período: cada turno original del período pasa al `nuevo_dia_semana` de su misma semana.
    select d.dia, h, c.id, c.nueva_hora, c.nota, (d.dia + (h.dia_semana - c.nuevo_dia_semana))::date
    from dias d
    join public.cambios c on c.alcance = 'periodo' and c.accion = 'mover' and c.anulado_en is null
      and c.nuevo_dia_semana = extract(isodow from d.dia)
    join public.horarios h on h.id = c.horario_id
    join public.terapias t on t.id = h.terapia_id and t.familia_id = fam
    where (d.dia + (h.dia_semana - c.nuevo_dia_semana)) between c.desde and c.hasta
      and public._hay_turno(h, (d.dia + (h.dia_semana - c.nuevo_dia_semana))::date)
  ),
  todo as (
    select b.dia, (b.h).hora, b.h, null::date as original, null::time as hora_original,
           case when b.cambio_id is null then 'normal' else 'cancelado' end as estado, b.cambio_id, b.nota
    from base b
    where b.cambio_id is null or b.accion = 'cancelar'
    union all
    select m.dia, m.nueva_hora, m.h, m.original, (m.h).hora, 'cambiado', m.cambio_id, m.nota
    from movidos m
  )
  select x.dia, x.hora, jsonb_build_object(
    'clase', 'terapia', 'estado', x.estado, 'terapia_id', t.id, 'horario_id', (x.h).id,
    'fecha_turno', coalesce(x.original, x.dia),
    'inicio', to_char(x.hora, 'HH24:MI'),
    'fin', to_char(x.hora + make_interval(mins => (x.h).duracion_min), 'HH24:MI'),
    'original_fecha', x.original, 'original_inicio', to_char(x.hora_original, 'HH24:MI'),
    'cambio_id', x.cambio_id, 'nota', x.nota,
    'tipo', tt.nombre, 'profesional', p.nombre, 'modalidad', t.modalidad, 'lugar', t.lugar, 'hijo', hi.nombre)
  from todo x
  join public.terapias t on t.id = (x.h).terapia_id
  join public.tipos_terapia tt on tt.id = t.tipo_id
  join public.profesionales p on p.id = t.profesional_id
  join public.hijos hi on hi.id = t.hijo_id
$$;

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
        ) o), '[]'::jsonb)
    ) order by d.dia)
    from (select (lunes + i)::date as dia from generate_series(0, 6) i) d
  );
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
