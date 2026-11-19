// Envío de avisos por Web Push desde el servidor (spec 003). Un aviso que falla nunca hace fallar el
// cambio que lo disparó: todos los errores se tragan acá.
import * as webpush from 'web-push';
import type { Aviso } from './textos-aviso';

export type Suscripcion = { endpoint: string; p256dh: string; auth: string };
export type Enviar = (s: Suscripcion, carga: string) => Promise<void>;
export type Dependencias = {
  destinatarios: () => Promise<Suscripcion[]>;
  marcar: (endpoint: string, ok: boolean) => Promise<void>;
  enviar: Enviar;
};

const TIEMPO_MAXIMO_MS = 4000;

// 404 y 410: el servicio de push dice que esa suscripción ya no existe.
export const suscripcionVencida = (e: unknown) => {
  const codigo = (e as { statusCode?: number } | null)?.statusCode;
  return codigo === 404 || codigo === 410;
};

// Manda el aviso a cada suscripción. Devuelve cuántos salieron bien; nunca lanza.
export async function avisar(aviso: Aviso, deps: Dependencias, filtro?: (s: Suscripcion) => boolean): Promise<number> {
  try {
    const todas = await deps.destinatarios();
    const lista = filtro ? todas.filter(filtro) : todas;
    const carga = JSON.stringify(aviso);
    const resultados = await Promise.all(lista.map(async (s) => {
      try {
        await deps.enviar(s, carga);
        await deps.marcar(s.endpoint, true).catch(() => {});
        return true;
      } catch (e) {
        if (suscripcionVencida(e)) await deps.marcar(s.endpoint, false).catch(() => {});
        return false;
      }
    }));
    return resultados.filter(Boolean).length;
  } catch {
    return 0;
  }
}

// El envío real con `web-push` y las claves VAPID del servidor. Sin claves, no hay envío.
export function enviarConVapid(): Enviar | null {
  const publicKey = import.meta.env.PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = import.meta.env.VAPID_PRIVATE_KEY;
  const subject = import.meta.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return async (s, carga) => {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, {
      vapidDetails: { subject, publicKey, privateKey }, TTL: 86_400, timeout: TIEMPO_MAXIMO_MS,
    });
  };
}
