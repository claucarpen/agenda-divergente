// Conecta `avisar` con Supabase: destinatarios y marcas por las funciones de `003_cambios.sql`.
import type { SupabaseClient } from '@supabase/supabase-js';
import { avisar, enviarConVapid, type Suscripcion } from './avisos';
import type { Aviso } from './textos-aviso';

export async function avisarFamilia(supabase: SupabaseClient, aviso: Aviso, soloEndpoint?: string): Promise<number> {
  const enviar = enviarConVapid();
  if (!enviar) return 0;
  return avisar(aviso, {
    destinatarios: async () => {
      const r = await supabase.rpc('destinatarios_aviso');
      if (r.error) throw r.error;
      return (r.data ?? []) as Suscripcion[];
    },
    marcar: async (endpoint, ok) => { await supabase.rpc('marcar_suscripcion', { endpoint, ok }); },
    enviar,
  }, soloEndpoint ? (s) => s.endpoint === soloEndpoint : undefined);
}
