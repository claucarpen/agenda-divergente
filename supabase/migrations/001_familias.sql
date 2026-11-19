-- Spec 001: espacio de familia. Los adultos entran con Google, uno invita al otro y cargan al hijo.
-- Regla de datos (decisions.md, [datos]): del hijo solo nombre de pila o apodo, obra social y plan.
-- Acceso solo por funciones security definer con search_path vacío: `authenticated` no escribe
-- directo en ninguna tabla y solo lee su propia fila de `perfiles`; `anon` no lee nada.

-- Tablas ---------------------------------------------------------------------------------------

create table public.obras_sociales (
  id text primary key,
  nombre text not null
);
insert into public.obras_sociales (id, nombre) values ('osde', 'OSDE');

create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  email text,
  creado_en timestamptz not null default now()
);

create table public.familias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 1 and 60),
  creada_en timestamptz not null default now()
);

create table public.miembros (
  familia_id uuid not null references public.familias (id) on delete cascade,
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  unido_en timestamptz not null default now(),
  primary key (familia_id, perfil_id)
);
-- Un adulto pertenece a una sola familia.
create unique index miembros_un_adulto_una_familia on public.miembros (perfil_id);

create table public.invitaciones (
  codigo text primary key,
  familia_id uuid not null references public.familias (id) on delete cascade,
  creada_por uuid not null references public.perfiles (id) on delete cascade,
  creada_en timestamptz not null default now(),
  vence_en timestamptz not null default now() + interval '7 days',
  usada_por uuid references public.perfiles (id) on delete set null,
  usada_en timestamptz
);

create table public.hijos (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 40),
  obra_social_id text not null references public.obras_sociales (id),
  plan text check (plan is null or char_length(plan) between 1 and 30),
  creado_en timestamptz not null default now()
);

create table public.movimientos (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias (id) on delete cascade,
  perfil_id uuid references public.perfiles (id) on delete set null,
  tipo text not null check (tipo in ('creo_familia', 'invito', 'se_unio', 'agrego_hijo', 'edito_hijo')),
  creado_en timestamptz not null default now()
);

alter table public.obras_sociales enable row level security;
alter table public.perfiles enable row level security;
alter table public.familias enable row level security;
alter table public.miembros enable row level security;
alter table public.invitaciones enable row level security;
alter table public.hijos enable row level security;
alter table public.movimientos enable row level security;

-- Supabase concede todo por defecto a anon y authenticated: se quita y se da solo lo necesario.
revoke all on public.obras_sociales, public.perfiles, public.familias, public.miembros,
  public.invitaciones, public.hijos, public.movimientos from anon, authenticated;

grant select on public.perfiles to authenticated;
create policy perfiles_leer_el_propio on public.perfiles
  for select to authenticated using (id = auth.uid());

-- Funciones internas (sin execute para anon ni authenticated) ---------------------------------

-- La familia de quien llama, o null.
create function public._familia_de_quien_llama() returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.familia_id from public.miembros m where m.perfil_id = auth.uid()
$$;

-- Quien llama tiene sesión; si no, `sin_sesion`.
create function public._exigir_sesion() returns uuid
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;
  return auth.uid();
end
$$;

-- Texto recortado; vacío → null.
create function public._limpio(t text) returns text
language sql immutable set search_path = ''
as $$ select nullif(btrim(t), '') $$;

-- Funciones públicas ---------------------------------------------------------------------------

-- Crea el perfil si no existe, con el nombre y el email de Google.
create function public.asegurar_perfil() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  yo uuid := public._exigir_sesion();
begin
  insert into public.perfiles (id, nombre, email)
  select u.id,
         left(coalesce(public._limpio(u.raw_user_meta_data ->> 'full_name'),
                       public._limpio(u.raw_user_meta_data ->> 'name'),
                       split_part(u.email, '@', 1),
                       'Adulto'), 80),
         u.email
  from auth.users u
  where u.id = yo
  on conflict (id) do nothing;
end
$$;

create function public.crear_familia(nombre text) returns uuid
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  yo uuid := public._exigir_sesion();
  n text := public._limpio(crear_familia.nombre);
  nueva uuid;
begin
  if n is null or char_length(n) > 60 then raise exception 'nombre_invalido'; end if;
  perform public.asegurar_perfil();
  if public._familia_de_quien_llama() is not null then raise exception 'ya_tiene_familia'; end if;
  insert into public.familias (nombre) values (n) returning id into nueva;
  insert into public.miembros (familia_id, perfil_id) values (nueva, yo);
  insert into public.movimientos (familia_id, perfil_id, tipo) values (nueva, yo, 'creo_familia');
  return nueva;
end
$$;

-- La familia de quien llama: nombre, adultos (solo nombre) e hijos. Null si no tiene familia.
create function public.mi_familia() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', f.id,
    'nombre', f.nombre,
    'adultos', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', p.nombre, 'soy_yo', p.id = auth.uid()) order by m.unido_en)
      from public.miembros m join public.perfiles p on p.id = m.perfil_id
      where m.familia_id = f.id), '[]'::jsonb),
    'hijos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'nombre', h.nombre, 'plan', h.plan,
        'obra_social_id', o.id, 'obra_social', o.nombre) order by h.creado_en)
      from public.hijos h join public.obras_sociales o on o.id = h.obra_social_id
      where h.familia_id = f.id), '[]'::jsonb)
  )
  from public.familias f
  where f.id = public._familia_de_quien_llama()
$$;

-- Código de 128 bits aleatorios en base64url (22 caracteres), vence a los 7 días, un solo uso.
create function public.crear_invitacion() returns text
language plpgsql security definer set search_path = ''
as $$
declare
  yo uuid := public._exigir_sesion();
  fam uuid := public._familia_de_quien_llama();
  c text;
begin
  if fam is null then raise exception 'sin_familia'; end if;
  c := rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '=');
  insert into public.invitaciones (codigo, familia_id, creada_por) values (c, fam, yo);
  insert into public.movimientos (familia_id, perfil_id, tipo) values (fam, yo, 'invito');
  return c;
end
$$;

-- Lo único que ve quien abre el link: nombre de la familia, quién invita y si sigue vigente.
create function public.invitacion_publica(codigo text)
returns table (familia text, invita text, vigente boolean)
language sql stable security definer set search_path = ''
as $$
  select f.nombre, p.nombre, (i.usada_por is null and i.vence_en > now())
  from public.invitaciones i
  join public.familias f on f.id = i.familia_id
  join public.perfiles p on p.id = i.creada_por
  where i.codigo = invitacion_publica.codigo
$$;

create function public.aceptar_invitacion(codigo text) returns uuid
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  yo uuid := public._exigir_sesion();
  inv public.invitaciones%rowtype;
  adultos int;
begin
  select * into inv from public.invitaciones i where i.codigo = aceptar_invitacion.codigo for update;
  if not found then raise exception 'no_existe'; end if;
  perform public.asegurar_perfil();
  -- Ya es miembro de esa familia: no hace nada.
  if exists (select 1 from public.miembros m where m.familia_id = inv.familia_id and m.perfil_id = yo) then
    return inv.familia_id;
  end if;
  if inv.usada_por is not null then raise exception 'invitacion_usada'; end if;
  if inv.vence_en <= now() then raise exception 'invitacion_vencida'; end if;
  if public._familia_de_quien_llama() is not null then raise exception 'otra_familia'; end if;
  perform 1 from public.familias f where f.id = inv.familia_id for update;
  select count(*) into adultos from public.miembros m where m.familia_id = inv.familia_id;
  if adultos >= 4 then raise exception 'familia_llena'; end if;
  insert into public.miembros (familia_id, perfil_id) values (inv.familia_id, yo);
  update public.invitaciones i set usada_por = yo, usada_en = now() where i.codigo = inv.codigo;
  insert into public.movimientos (familia_id, perfil_id, tipo) values (inv.familia_id, yo, 'se_unio');
  return inv.familia_id;
end
$$;

create function public.agregar_hijo(nombre text, obra_social_id text, plan text default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  yo uuid := public._exigir_sesion();
  fam uuid := public._familia_de_quien_llama();
  n text := public._limpio(agregar_hijo.nombre);
  pl text := public._limpio(agregar_hijo.plan);
  nuevo uuid;
begin
  if fam is null then raise exception 'sin_familia'; end if;
  if n is null or char_length(n) > 40 then raise exception 'nombre_invalido'; end if;
  if pl is not null and char_length(pl) > 30 then raise exception 'plan_invalido'; end if;
  if not exists (select 1 from public.obras_sociales o where o.id = agregar_hijo.obra_social_id) then
    raise exception 'obra_social_invalida';
  end if;
  insert into public.hijos (familia_id, nombre, obra_social_id, plan)
  values (fam, n, agregar_hijo.obra_social_id, pl) returning id into nuevo;
  insert into public.movimientos (familia_id, perfil_id, tipo) values (fam, yo, 'agrego_hijo');
  return nuevo;
end
$$;

create function public.editar_hijo(hijo_id uuid, nombre text, obra_social_id text, plan text default null) returns void
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  yo uuid := public._exigir_sesion();
  fam uuid := public._familia_de_quien_llama();
  n text := public._limpio(editar_hijo.nombre);
  pl text := public._limpio(editar_hijo.plan);
begin
  if fam is null or not exists (select 1 from public.hijos h where h.id = editar_hijo.hijo_id and h.familia_id = fam) then
    raise exception 'hijo_ajeno';
  end if;
  if n is null or char_length(n) > 40 then raise exception 'nombre_invalido'; end if;
  if pl is not null and char_length(pl) > 30 then raise exception 'plan_invalido'; end if;
  if not exists (select 1 from public.obras_sociales o where o.id = editar_hijo.obra_social_id) then
    raise exception 'obra_social_invalida';
  end if;
  update public.hijos h set nombre = n, obra_social_id = editar_hijo.obra_social_id, plan = pl
  where h.id = editar_hijo.hijo_id;
  insert into public.movimientos (familia_id, perfil_id, tipo) values (fam, yo, 'edito_hijo');
end
$$;

-- Permisos de ejecución: Postgres da execute a `public` en toda función; se quita y se da por rol.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.asegurar_perfil() to authenticated;
grant execute on function public.crear_familia(text) to authenticated;
grant execute on function public.mi_familia() to authenticated;
grant execute on function public.crear_invitacion() to authenticated;
grant execute on function public.invitacion_publica(text) to anon, authenticated;
grant execute on function public.aceptar_invitacion(text) to authenticated;
grant execute on function public.agregar_hijo(text, text, text) to authenticated;
grant execute on function public.editar_hijo(uuid, text, text, text) to authenticated;
