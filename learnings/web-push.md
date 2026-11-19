# Web Push y la app instalable: lo que no se deduce del código

- `web-push` 4 es ESM sin export por defecto: `import * as webpush from 'web-push'`.
- `web-push` 4 rechaza endpoints `http://`: para probar, servicio falso HTTPS y `agent: new https.Agent({ ca })`.
- Un parámetro de función plpgsql llamado `auth` tapa al schema `auth`: dentro, `auth.uid()` deja de andar. En `guardar_suscripcion` quien llama sale de `_exigir_sesion()`.
- En un `union all` de SQL, una fila de `left join lateral (select x.* …)` es `record` y no combina con `public.cambios`: usar columnas sueltas.
- iPhone: los avisos solo funcionan con la app abierta desde la pantalla de inicio (`display-mode: standalone` o `navigator.standalone`), y `Notification.requestPermission()` tiene que salir de un toque.
- Las variables `PUBLIC_*` (incluida `PUBLIC_VAPID_PUBLIC_KEY`) se leen al construir: cambiarlas exige volver a desplegar; si cambia el par de claves, cada celular tiene que volver a suscribirse.
