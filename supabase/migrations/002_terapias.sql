-- Spec 002: terapias, profesionales, horarios semanales, eventos de la familia y la semana.
-- Horas en hora local de Argentina (`time` sin zona); fechas, `date` local.
-- Mismo patrón que la 001: RLS en todo, escritura y lectura solo por funciones security definer.
-- Reutiliza `_exigir_sesion`, `_familia_de_quien_llama` y `_limpio` de la 001.

-- Tablas ---------------------------------------------------------------------------------------

create table public.tipos_terapia (
  id text primary key,
  nombre text not null,
  orden int not null
);
insert into public.tipos_terapia (id, nombre, orden) values
  ('conductual', 'Terapia conductual', 1),
  ('psicopedagogia', 'Psicopedagogía', 2),
  ('terapia_ocupacional', 'Terapia ocupacional', 3),
  ('fonoaudiologia', 'Fonoaudiología', 4),
  ('psicologia', 'Psicología', 5),
  ('maestra_integradora', 'Maestra integradora', 6),
  ('kinesiologia', 'Kinesiología', 7),
  ('otra', 'Otra', 99);

create table public.profesionales (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 60),
  tipo_id text not null references public.tipos_terapia (id),
  telefono text check (telefono is null or telefono ~ '^[0-9 +()-]{6,30}$'),
  fuera_de_cartilla boolean not null default true,
  creado_en timestamptz not null default now()
);

create table public.terapias (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias (id) on delete cascade,
  hijo_id uuid not null references public.hijos (id) on delete cascade,
  profesional_id uuid not null references public.profesionales (id),
  tipo_id text not null references public.tipos_terapia (id),
  modalidad text not null check (modalidad in ('consultorio', 'domicilio', 'colegio', 'virtual')),
  lugar text check (lugar is null or char_length(lugar) between 1 and 80),
  estado text not null default 'activa' check (estado in ('activa', 'terminada')),
  desde date not null,
  hasta date,
  creada_en timestamptz not null default now(),
  check (hasta is null or hasta >= desde)
);

create table public.horarios (
  id uuid primary key default gen_random_uuid(),
  terapia_id uuid not null references public.terapias (id) on delete cascade,
  dia_semana int not null check (dia_semana between 1 and 7),
  hora time not null,
  duracion_min int not null check (duracion_min between 15 and 240),
  desde date not null,
  hasta date,
  check (hasta is null or hasta >= desde - 1)
);

create table public.eventos_familia (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias (id) on delete cascade,
  hijo_id uuid references public.hijos (id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 60),
  dia_semana int not null check (dia_semana between 1 and 7),
  hora time not null,
  desde date not null,
  hasta date,
  check (hasta is null or hasta >= desde - 1)
);

alter table public.tipos_terapia enable row level security;
alter table public.profesionales enable row level security;
alter table public.terapias enable row level security;
alter table public.horarios enable row level security;
alter table public.eventos_familia enable row level security;

revoke all on public.tipos_terapia, public.profesionales, public.terapias, public.horarios,
  public.eventos_familia from anon, authenticated;

alter table public.movimientos drop constraint movimientos_tipo_check;
alter table public.movimientos add constraint movimientos_tipo_check check (tipo in (
  'creo_familia', 'invito', 'se_unio', 'agrego_hijo', 'edito_hijo',
  'agrego_profesional', 'edito_profesional', 'agrego_terapia', 'edito_terapia', 'termino_terapia',
  'agrego_horario', 'quito_horario', 'agrego_evento', 'quito_evento'));

-- Funciones internas ---------------------------------------------------------------------------

-- Hoy en Argentina.
create function public._hoy() returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

-- La familia de quien llama; si no tiene, `sin_familia`.
create function public._exigir_familia() returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  fam uuid;
begin
  perform public._exigir_sesion();
  fam := public._familia_de_quien_llama();
  if fam is null then raise exception 'sin_familia'; end if;
  return fam;
end
$$;

create function public._registrar(fam uuid, tipo text) returns void
language sql security definer set search_path = ''
as $$ insert into public.movimientos (familia_id, perfil_id, tipo) values (fam, auth.uid(), tipo) $$;

create function public._validar_profesional(nombre text, tipo_id text, telefono text) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if nombre is null or char_length(nombre) > 60 then raise exception 'nombre_invalido'; end if;
  if not exists (select 1 from public.tipos_terapia t where t.id = tipo_id) then raise exception 'tipo_invalido'; end if;
  if telefono is not null and telefono !~ '^[0-9 +()-]{6,30}$' then raise exception 'telefono_invalido'; end if;
end
$$;

create function public._validar_terapia(fam uuid, profesional_id uuid, tipo_id text, modalidad text, lugar text) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.profesionales p where p.id = profesional_id and p.familia_id = fam) then
    raise exception 'ajeno';
  end if;
  if not exists (select 1 from public.tipos_terapia t where t.id = tipo_id) then raise exception 'tipo_invalido'; end if;
  if modalidad is null or modalidad not in ('consultorio', 'domicilio', 'colegio', 'virtual') then
    raise exception 'modalidad_invalida';
  end if;
  if lugar is not null and char_length(lugar) > 80 then raise exception 'lugar_invalido'; end if;
end
$$;

create function public._validar_franja(dia_semana int, hora time, duracion_min int) returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if dia_semana is null or dia_semana not between 1 and 7 then raise exception 'dia_invalido'; end if;
  if hora is null then raise exception 'hora_invalida'; end if;
  if duracion_min is null or duracion_min not between 15 and 240 then raise exception 'duracion_invalida'; end if;
end
$$;

-- Profesionales --------------------------------------------------------------------------------

create function public.agregar_profesional(nombre text, tipo_id text, telefono text default null, fuera_de_cartilla boolean default true)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
  n text := public._limpio(agregar_profesional.nombre);
  tel text := public._limpio(agregar_profesional.telefono);
  nuevo uuid;
begin
  perform public._validar_profesional(n, agregar_profesional.tipo_id, tel);
  insert into public.profesionales (familia_id, nombre, tipo_id, telefono, fuera_de_cartilla)
  values (fam, n, agregar_profesional.tipo_id, tel, coalesce(agregar_profesional.fuera_de_cartilla, true))
  returning id into nuevo;
  perform public._registrar(fam, 'agrego_profesional');
  return nuevo;
end
$$;

create function public.editar_profesional(id uuid, nombre text, tipo_id text, telefono text default null, fuera_de_cartilla boolean default true)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
  n text := public._limpio(editar_profesional.nombre);
  tel text := public._limpio(editar_profesional.telefono);
begin
  if not exists (select 1 from public.profesionales p where p.id = editar_profesional.id and p.familia_id = fam) then
    raise exception 'ajeno';
  end if;
  perform public._validar_profesional(n, editar_profesional.tipo_id, tel);
  update public.profesionales p
  set nombre = n, tipo_id = editar_profesional.tipo_id, telefono = tel,
      fuera_de_cartilla = coalesce(editar_profesional.fuera_de_cartilla, true)
  where p.id = editar_profesional.id;
  perform public._registrar(fam, 'edito_profesional');
end
$$;

-- Terapias -------------------------------------------------------------------------------------

create function public.agregar_terapia(hijo_id uuid, profesional_id uuid, tipo_id text, modalidad text, lugar text default null, desde date default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
  nuevo uuid;
begin
  if not exists (select 1 from public.hijos h where h.id = agregar_terapia.hijo_id and h.familia_id = fam) then
    raise exception 'ajeno';
  end if;
  perform public._validar_terapia(fam, agregar_terapia.profesional_id, agregar_terapia.tipo_id,
    agregar_terapia.modalidad, public._limpio(agregar_terapia.lugar));
  insert into public.terapias (familia_id, hijo_id, profesional_id, tipo_id, modalidad, lugar, desde)
  values (fam, agregar_terapia.hijo_id, agregar_terapia.profesional_id, agregar_terapia.tipo_id,
    agregar_terapia.modalidad, public._limpio(agregar_terapia.lugar), coalesce(agregar_terapia.desde, public._hoy()))
  returning id into nuevo;
  perform public._registrar(fam, 'agrego_terapia');
  return nuevo;
end
$$;

create function public.editar_terapia(id uuid, profesional_id uuid, tipo_id text, modalidad text, lugar text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
begin
  if not exists (select 1 from public.terapias t where t.id = editar_terapia.id and t.familia_id = fam) then
    raise exception 'ajeno';
  end if;
  perform public._validar_terapia(fam, editar_terapia.profesional_id, editar_terapia.tipo_id,
    editar_terapia.modalidad, public._limpio(editar_terapia.lugar));
  update public.terapias t
  set profesional_id = editar_terapia.profesional_id, tipo_id = editar_terapia.tipo_id,
      modalidad = editar_terapia.modalidad, lugar = public._limpio(editar_terapia.lugar)
  where t.id = editar_terapia.id;
  perform public._registrar(fam, 'edito_terapia');
end
$$;

-- Pasa a `terminada` con su fecha de fin y cierra sus horarios abiertos. No borra nada.
create function public.terminar_terapia(id uuid, hasta date)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
  t public.terapias%rowtype;
begin
  select * into t from public.terapias x where x.id = terminar_terapia.id and x.familia_id = fam for update;
  if not found then raise exception 'ajeno'; end if;
  if t.estado = 'terminada' then raise exception 'terapia_terminada'; end if;
  if terminar_terapia.hasta is null or terminar_terapia.hasta < t.desde then raise exception 'fecha_invalida'; end if;
  update public.terapias x set estado = 'terminada', hasta = terminar_terapia.hasta where x.id = t.id;
  update public.horarios h set hasta = greatest(terminar_terapia.hasta, h.desde - 1)
  where h.terapia_id = t.id and (h.hasta is null or h.hasta > terminar_terapia.hasta);
  perform public._registrar(fam, 'termino_terapia');
end
$$;

-- Horarios -------------------------------------------------------------------------------------

create function public.agregar_horario(terapia_id uuid, dia_semana int, hora time, duracion_min int, desde date default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
  t public.terapias%rowtype;
  nuevo uuid;
begin
  select * into t from public.terapias x where x.id = agregar_horario.terapia_id and x.familia_id = fam;
  if not found then raise exception 'ajeno'; end if;
  if t.estado = 'terminada' then raise exception 'terapia_terminada'; end if;
  perform public._validar_franja(agregar_horario.dia_semana, agregar_horario.hora, agregar_horario.duracion_min);
  insert into public.horarios (terapia_id, dia_semana, hora, duracion_min, desde)
  values (t.id, agregar_horario.dia_semana, agregar_horario.hora, agregar_horario.duracion_min,
    greatest(coalesce(agregar_horario.desde, public._hoy()), t.desde))
  returning id into nuevo;
  perform public._registrar(fam, 'agrego_horario');
  return nuevo;
end
$$;

-- Cierra el horario con fecha de fin (`hasta` es el último día en que vale); no lo borra.
create function public.quitar_horario(id uuid, hasta date default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
  h public.horarios%rowtype;
  fin date;
begin
  select x.* into h from public.horarios x join public.terapias t on t.id = x.terapia_id
  where x.id = quitar_horario.id and t.familia_id = fam for update of x;
  if not found then raise exception 'ajeno'; end if;
  fin := greatest(coalesce(quitar_horario.hasta, public._hoy() - 1), h.desde - 1);
  update public.horarios x set hasta = fin where x.id = h.id;
  perform public._registrar(fam, 'quito_horario');
end
$$;

-- Eventos de la familia ------------------------------------------------------------------------

create function public.agregar_evento(titulo text, dia_semana int, hora time, hijo_id uuid default null, desde date default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
  ti text := public._limpio(agregar_evento.titulo);
  nuevo uuid;
begin
  if ti is null or char_length(ti) > 60 then raise exception 'titulo_invalido'; end if;
  perform public._validar_franja(agregar_evento.dia_semana, agregar_evento.hora, 15);
  if agregar_evento.hijo_id is not null
     and not exists (select 1 from public.hijos h where h.id = agregar_evento.hijo_id and h.familia_id = fam) then
    raise exception 'ajeno';
  end if;
  insert into public.eventos_familia (familia_id, hijo_id, titulo, dia_semana, hora, desde)
  values (fam, agregar_evento.hijo_id, ti, agregar_evento.dia_semana, agregar_evento.hora,
    coalesce(agregar_evento.desde, public._hoy()))
  returning id into nuevo;
  perform public._registrar(fam, 'agrego_evento');
  return nuevo;
end
$$;

create function public.quitar_evento(id uuid, hasta date default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
  e public.eventos_familia%rowtype;
begin
  select * into e from public.eventos_familia x where x.id = quitar_evento.id and x.familia_id = fam for update;
  if not found then raise exception 'ajeno'; end if;
  update public.eventos_familia x
  set hasta = greatest(coalesce(quitar_evento.hasta, public._hoy() - 1), e.desde - 1)
  where x.id = e.id;
  perform public._registrar(fam, 'quito_evento');
end
$$;

-- Lecturas -------------------------------------------------------------------------------------

-- Una terapia como objeto JSON, con sus horarios vigentes desde `dia`.
create function public._terapia_json(t public.terapias, dia date) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id, 'estado', t.estado, 'desde', t.desde, 'hasta', t.hasta,
    'modalidad', t.modalidad, 'lugar', t.lugar,
    'tipo_id', t.tipo_id, 'tipo', (select tt.nombre from public.tipos_terapia tt where tt.id = t.tipo_id),
    'hijo_id', t.hijo_id, 'hijo', (select h.nombre from public.hijos h where h.id = t.hijo_id),
    'profesional_id', t.profesional_id,
    'profesional', (select p.nombre from public.profesionales p where p.id = t.profesional_id),
    'telefono', (select p.telefono from public.profesionales p where p.id = t.profesional_id),
    'horarios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'dia_semana', h.dia_semana, 'hora', to_char(h.hora, 'HH24:MI'),
        'duracion_min', h.duracion_min, 'desde', h.desde) order by h.dia_semana, h.hora)
      from public.horarios h
      where h.terapia_id = t.id and (h.hasta is null or h.hasta >= dia)), '[]'::jsonb)
  )
$$;

create function public.mis_terapias() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
  hoy date := public._hoy();
begin
  return jsonb_build_object(
    'terapias', coalesce((
      select jsonb_agg(public._terapia_json(t, hoy) order by t.estado, t.desde desc)
      from public.terapias t where t.familia_id = fam), '[]'::jsonb),
    'profesionales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'nombre', p.nombre, 'tipo_id', p.tipo_id,
        'tipo', (select tt.nombre from public.tipos_terapia tt where tt.id = p.tipo_id),
        'telefono', p.telefono, 'fuera_de_cartilla', p.fuera_de_cartilla) order by p.nombre)
      from public.profesionales p where p.familia_id = fam), '[]'::jsonb),
    'eventos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'titulo', e.titulo, 'dia_semana', e.dia_semana, 'hora', to_char(e.hora, 'HH24:MI'),
        'hijo', (select h.nombre from public.hijos h where h.id = e.hijo_id)) order by e.dia_semana, e.hora)
      from public.eventos_familia e where e.familia_id = fam and (e.hasta is null or e.hasta >= hoy)), '[]'::jsonb),
    'tipos', (select jsonb_agg(jsonb_build_object('id', tt.id, 'nombre', tt.nombre) order by tt.orden) from public.tipos_terapia tt)
  );
end
$$;

create function public.terapia(id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  fam uuid := public._exigir_familia();
  t public.terapias%rowtype;
begin
  select * into t from public.terapias x where x.id = terapia.id and x.familia_id = fam;
  if not found then raise exception 'ajeno'; end if;
  return public._terapia_json(t, public._hoy());
end
$$;

-- Los 7 días desde `lunes`, con las ocurrencias de cada día ordenadas por hora.
create function public.semana(lunes date) returns jsonb
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
          select h.hora, 0 as orden, jsonb_build_object(
            'clase', 'terapia', 'terapia_id', t.id, 'horario_id', h.id,
            'inicio', to_char(h.hora, 'HH24:MI'),
            'fin', to_char(h.hora + make_interval(mins => h.duracion_min), 'HH24:MI'),
            'tipo', tt.nombre, 'profesional', p.nombre, 'modalidad', t.modalidad, 'lugar', t.lugar,
            'hijo', hi.nombre) as item
          from public.horarios h
          join public.terapias t on t.id = h.terapia_id
          join public.tipos_terapia tt on tt.id = t.tipo_id
          join public.profesionales p on p.id = t.profesional_id
          join public.hijos hi on hi.id = t.hijo_id
          where t.familia_id = fam
            and h.dia_semana = extract(isodow from d.dia)
            and h.desde <= d.dia and (h.hasta is null or h.hasta >= d.dia)
            and t.desde <= d.dia and (t.hasta is null or t.hasta >= d.dia)
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
