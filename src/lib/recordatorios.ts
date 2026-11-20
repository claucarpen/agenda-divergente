// El reloj de recordatorios (spec 004): `pg_cron` de Supabase llama cada minuto a
// `/api/recordatorios` con `Authorization: Bearer <CRON_SECRET>`. Acá se verifica el secreto, se piden
// los recordatorios a `tomar_recordatorios` y se manda cada uno con Web Push. Nunca lanza.
import { timingSafeEqual } from 'node:crypto';
import { suscripcionVencida, type Enviar, type Suscripcion } from './avisos';
import { avisoRecordatorio, type Recordatorio } from './textos-aviso';

export type RecordatorioConDestino = Recordatorio & { suscripciones: Suscripcion[] };
export type DependenciasReloj = {
  secreto: string | undefined;
  tomar: (secreto: string) => Promise<RecordatorioConDestino[]>;
  enviar: Enviar | null;
};
export type ResultadoReloj = { estado: 200 | 401 | 500; recordatorios: number; enviados: number; vencidos: number };

export function secretoValido(header: string | null, secreto: string | undefined): boolean {
  if (!secreto || !header) return false;
  const esperado = Buffer.from(`Bearer ${secreto}`);
  const recibido = Buffer.from(header);
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}

export async function correrReloj(header: string | null, deps: DependenciasReloj): Promise<ResultadoReloj> {
  if (!secretoValido(header, deps.secreto)) return { estado: 401, recordatorios: 0, enviados: 0, vencidos: 0 };
  let lista: RecordatorioConDestino[];
  try {
    lista = await deps.tomar(deps.secreto!);
  } catch {
    return { estado: 500, recordatorios: 0, enviados: 0, vencidos: 0 };
  }
  let enviados = 0;
  let vencidos = 0;
  if (deps.enviar) {
    const enviar = deps.enviar;
    await Promise.all(lista.flatMap((r) => {
      const carga = JSON.stringify(avisoRecordatorio(r));
      return r.suscripciones.map(async (s) => {
        try {
          await enviar(s, carga);
          enviados++;
        } catch (e) {
          // Sin sesión no se puede borrar la suscripción: la borra el próximo aviso inmediato de la familia.
          if (suscripcionVencida(e)) vencidos++;
        }
      });
    }));
  }
  return { estado: 200, recordatorios: lista.length, enviados, vencidos };
}
