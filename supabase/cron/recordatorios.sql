-- Spec 004: el reloj de los recordatorios. NO es una migración: se corre una vez por ambiente, después
-- de 004_eventos_recordatorios_avatares.sql, con el secreto como parámetro (nunca escrito acá).
--   psql "$DATABASE_URL" -v secreto="$CRON_SECRET" -v url='https://agenda-divergente.vercel.app' -f supabase/cron/recordatorios.sql
-- En el SQL Editor de Supabase: reemplazar :'secreto' y :'url' por los valores, entre comillas simples.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- El mismo secreto que `CRON_SECRET` de Vercel. `tomar_recordatorios` lo compara con este.
insert into public.config_privada (clave, valor) values ('cron_secret', :'secreto')
on conflict (clave) do update set valor = excluded.valor;
insert into public.config_privada (clave, valor) values ('url_app', :'url')
on conflict (clave) do update set valor = excluded.valor;

-- Cada minuto: POST a /api/recordatorios con el secreto. Lee secreto y URL de config_privada al
-- correr, así que rotar el secreto es solo actualizar la fila (y la variable de Vercel).
select cron.unschedule(jobid) from cron.job where jobname = 'recordatorios';
select cron.schedule('recordatorios', '* * * * *', $job$
  select net.http_post(
    url := (select valor from public.config_privada where clave = 'url_app') || '/api/recordatorios',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select valor from public.config_privada where clave = 'cron_secret'),
      'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000)
$job$);
