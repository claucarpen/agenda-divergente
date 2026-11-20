// Spec 004: lo llama cada minuto el trabajo de `pg_cron` (supabase/cron/recordatorios.sql).
import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { enviarConVapid } from '../../lib/avisos';
import { correrReloj, type RecordatorioConDestino } from '../../lib/recordatorios';

export const POST: APIRoute = async ({ request }) => {
  const r = await correrReloj(request.headers.get('authorization'), {
    secreto: import.meta.env.CRON_SECRET,
    tomar: async (secreto) => {
      const supabase = createClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const res = await supabase.rpc('tomar_recordatorios', { secreto });
      if (res.error) throw res.error;
      return (res.data ?? []) as RecordatorioConDestino[];
    },
    enviar: enviarConVapid(),
  });
  return new Response(JSON.stringify(r), { status: r.estado, headers: { 'content-type': 'application/json' } });
};
