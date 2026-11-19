---
status: implementada
depends_on: [002]
---

# 003 — Cambios de turno, avisos al otro adulto y app instalable

Cambiar un turno sin tocar el horario fijo: **una vez** ("este jueves la TO pasa al viernes 17 h"
o "este jueves no hay") o **por un período** ("durante marzo, psicopedagogía va los viernes"). Al
terminar el cambio, vuelve sola al horario de siempre. Apenas un adulto cambia algo, los demás
adultos de la familia reciben un aviso en el celular. La app se instala en la pantalla de inicio,
que en iPhone es obligatorio para recibir avisos.

**Tipo**: feature · **Flujo**: design-first (el paso 0 despeja el riesgo de mandar Web Push desde
una función de Vercel sin claves reales)

## Contexto

- PRD (brain): el problema de fondo no es anotar un turno sino que el cambio llega por WhatsApp y
  nadie lo pasa al calendario. Hoy la familia usa un calendario en la heladera. Cargar un cambio
  tiene que ser más rápido que anotarlo ahí.
- Arquitectura (brain, `architecture.md`): avisos por Web Push con claves VAPID propias; en
  Android llegan con el navegador cerrado; en iPhone, solo con la app instalada (iOS 16.4+) y el
  permiso pedido con un toque. Pantalla de estado de avisos con "Probar aviso".
- Reglas que aplican: `decisions.md` → `[datos]`, `[familia]`, `[avisos]`, `[diseño]`, `[stack]`.

## Estado previo

Ver `ARCHITECTURE.md`: migraciones 001 y 002, `semana(lunes)` arma la semana desde los horarios
fijos, `/semana`, `/terapias`, `/terapias/<id>` y `/familia` con navegación inferior. No hay
cambios de turno, ni avisos, ni manifest, ni service worker.

## Paso 0 — prueba de factibilidad (antes de construir)

Con el paquete `web-push` y un par de claves VAPID generadas en el test (nunca reales), mandar un
aviso a un **servicio de push falso local** (un servidor HTTP del test que hace de endpoint) y
demostrar que recibe un POST cifrado (`Content-Encoding: aes128gcm`) con el header de VAPID.

Si el paso 0 no pasa, **parar y reportar** con alternativas. No construir nada más.

## Qué se construye

### Base de datos — `supabase/migrations/003_cambios.sql`

| Tabla | Columnas clave |
|---|---|
| `cambios` | `id`, `horario_id` (FK), `alcance` (`una_vez` \| `periodo`), `fecha date` (una vez: el día del turno original), `desde date` / `hasta date` (período), `accion` (`mover` \| `cancelar`), `nueva_fecha date` (una vez + mover), `nuevo_dia_semana` (período + mover), `nueva_hora time` (mover), `nota` (1-80, nullable), `creado_por`, `creado_en`, `anulado_en` nullable |
| `suscripciones_push` | `id`, `perfil_id`, `endpoint text unique`, `p256dh`, `auth`, `creada_en`, `ultimo_ok` nullable |

Restricciones de forma: una vez exige `fecha`; período exige `desde ≤ hasta` y que el período no
pase de 180 días; mover exige `nueva_hora` y la fecha o el día nuevos. Un horario no puede tener
dos cambios no anulados que se pisen en la misma fecha (`cambio_superpuesto`).

`movimientos.tipo` suma `cambio_turno`, `anulo_cambio`, `activo_avisos`, `desactivo_avisos`.

| Función | Qué hace |
|---|---|
| `cambiar_turno_una_vez(horario_id, fecha, accion, nueva_fecha, nueva_hora, nota)` | Valida que el horario sea de la familia y que `fecha` sea un día en que ese horario tiene turno |
| `cambiar_turno_periodo(horario_id, desde, hasta, accion, nuevo_dia_semana, nueva_hora, nota)` | Valida familia, rango y tope |
| `anular_cambio(id)` | Marca `anulado_en`: el turno vuelve a su horario fijo |
| `cambios_vigentes()` | Cambios no anulados que terminan hoy o después, con terapia, horario original y quién los hizo |
| `guardar_suscripcion(endpoint, p256dh, auth)` / `borrar_suscripcion(endpoint)` | De quien llama |
| `destinatarios_aviso()` | Suscripciones de **todos** los adultos de la familia de quien llama, incluido quien llama (endpoint y claves; nunca emails) |
| `marcar_suscripcion(endpoint, ok)` | Con `ok` registra `ultimo_ok`; sin `ok` (el servicio respondió 404 o 410) la borra. Solo para suscripciones de la propia familia |
| `estado_avisos()` | Por adulto de la familia: nombre y si tiene al menos un celular suscripto |

**`semana(lunes)` aplica los cambios**: un turno cancelado aparece marcado "No hay" con la hora
original; un turno movido aparece en su día y hora nuevos, marcado "Cambiado" y con el horario
original ("antes jue 15:00"). Los horarios fijos no se tocan.

### Avisos — `src/lib/avisos.ts` y el envío

- Después de que una función de cambio responde bien, el servidor de Astro pide
  `destinatarios_aviso()` y manda el aviso con `web-push` a cada suscripción. Respuesta 404 o 410
  → `marcar_suscripcion(endpoint, false)`. Un aviso que falla **nunca** hace fallar el cambio.
- Disparan aviso: cambiar un turno (una vez o período), anular un cambio, agregar o quitar un
  horario fijo, terminar una terapia, agregar o quitar un evento de la familia.
- El texto lo arma una función pura: título "Cambio en la semana" y un cuerpo de una línea con qué
  cambió, cuándo y quién, sin el nombre del hijo ni la nota (p. ej. "Terapia ocupacional: jue 26/11
  15:00 → vie 27/11 17:00. Lo cambió Laura"). Tocar el aviso abre `/semana` en la semana
  del cambio.
- Claves: `PUBLIC_VAPID_PUBLIC_KEY` (pública) y `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` (solo en el
  servidor, variables de Vercel). Sin claves configuradas, la app funciona y los avisos no salen.

### App instalable

- `public/manifest.webmanifest`: nombre "Agenda Divergente", `start_url: /semana`,
  `display: standalone`, colores del tema, íconos 192 y 512 px (y versión maskable) derivados del
  isotipo.
- `public/sw.js`: service worker mínimo: recibe `push` y muestra la notificación; en
  `notificationclick` abre o enfoca la URL del aviso. Sin caché offline en esta spec.
- `<link rel="manifest">`, `apple-touch-icon` y `theme-color` en el layout.

### Aplicación

- **Cambiar un turno**: cada turno de la semana abre una hoja "Cambiar este turno" con tres
  caminos: "Moverlo" (fecha y hora nuevas, por defecto el mismo día), "No hay ese día" y "Cambiar
  durante un período" (desde, hasta, día y hora nuevos, o "no hay"). Nota corta opcional ("Nota
  (opcional)", hasta 80 caracteres, con la ayuda "No pongas datos de salud"). Tiene que poder
  hacerse en tres toques más la hora. La nota se ve en la semana y en la terapia, nunca en el
  aviso.
- **Cambios en curso**: en `/terapias/<id>`, la lista de cambios vigentes de esa terapia con
  "Deshacer" (anula).
- **Avisos** (nueva sección dentro de `/familia`):
  - Por adulto, si tiene avisos activos ("Laura · avisos activos" / "Claudio · sin avisos").
  - Para el celular actual: "Activar avisos" (pide permiso con el toque, registra el service
    worker y guarda la suscripción), "Probar aviso" (se manda uno a sí mismo) y "Desactivar en
    este celular".
  - En iPhone sin instalar: en lugar del botón, las instrucciones "Tocá Compartir → Agregar a
    inicio y abrí la app desde ahí".
  - Permiso denegado: explicar cómo volver a habilitarlo en los ajustes del navegador.
- **Vista previa de diseño**: suma `semana-con-cambios`, `cambiar-turno`, `avisos` y
  `avisos-iphone`. Sigue sin existir en el build de producción.
- `README.md`: secciones "Avisos (claves VAPID)" y "Migración 003".

## Criterios de aceptación y sus evals

Los deterministas se agregan a `evals/run.sh`. **Los de la 001 y la 002 siguen y deben pasar.**

| # | Criterio | Eval |
|---|---|---|
| C0 | Web Push sale hacia un servicio de push | Test del paso 0 contra el servicio falso local |
| C1 | Compila y no rompe nada | `evals/run.sh` completo: 0 fallan |
| C2 | La migración tiene la forma pedida | `grep` sobre `003_cambios.sql`: las 2 tablas con RLS; las 9 funciones con `security definer` y `set search_path`; ninguna política de escritura para `authenticated`; sin `drop table`; `destinatarios_aviso` no devuelve `email` |
| C3 | Las reglas y la seguridad funcionan en la base | `npm run test:db` pasa con, como mínimo: cambio de un horario de otra familia → `ajeno` · una vez en un día sin turno → rechazo · período con `desde > hasta` o de más de 180 días → rechazo · dos cambios superpuestos → `cambio_superpuesto` · `semana` muestra el turno movido en su día y hora nuevos con el original, el cancelado marcado y, fuera del período, el horario fijo · un cambio anulado deja de aplicarse · un movimiento de la semana a otra semana aparece en la nueva y desaparece de la vieja · `destinatarios_aviso` devuelve las suscripciones de todos los adultos de la familia, incluida la de quien llama, y nunca las de otra familia · una nota de más de 80 caracteres → rechazo · `marcar_suscripcion(…, false)` borra y no puede tocar suscripciones de otra familia · `anon` no lee ni ejecuta nada nuevo · `movimientos` registra los 4 tipos nuevos |
| C4 | El aviso dice lo correcto | `npm test` pasa con: texto de mover una vez, cancelar, período y anular, con fechas "jue 26/11" y horas "15:00"; el cuerpo nunca incluye el nombre del hijo ni la nota; la URL del aviso apunta a `/semana?desde=<lunes del cambio>`; un error del servicio de push no se propaga; 404 y 410 marcan la suscripción para borrar |
| C5 | Se puede instalar | Playwright: `/manifest.webmanifest` responde con `name`, `start_url`, `display: standalone` e íconos 192 y 512 que existen; `/sw.js` responde con `content-type` JavaScript; el layout tiene `rel="manifest"` y `apple-touch-icon`; las páginas nuevas sin sesión redirigen a `/` |
| C6 | La vista previa no llega a producción | Sigue pasando `001·C6` |
| C7 | Sin secretos | Sigue pasando `001·C7`, más: ninguna clave privada VAPID en el repo (`grep` de `VAPID_PRIVATE_KEY=` con valor y de claves base64url de 43 caracteres en `src/`, `public/`, `scripts/`); `VAPID_PRIVATE_KEY` solo se lee en código de servidor |
| C8 | Cambiar un turno es más rápido que la heladera | Rúbrica (abajo) sobre capturas a 375 y 1280 px, claro y oscuro a 375, de las 4 pantallas nuevas; contraste AA de los pares nuevos en `scripts/contraste.mjs` |
| C9 | El operador puede ponerla en marcha solo | `README.md` tiene "Avisos (claves VAPID)" y "Migración 003" |

### Rúbrica de C8 (pasa si cumple todo)

1. Desde la semana, mover un turno lleva tres toques más elegir la hora.
2. En la semana, un turno cambiado o cancelado se reconoce sin leer el detalle, y se ve cuál era
   el horario original.
3. En "Avisos" se entiende en dos segundos quién tiene los avisos activos y qué hacer en este
   celular.
4. Las instrucciones de iPhone son de un paso por línea, con los nombres que muestra iOS.
5. Mismo lenguaje visual de la 001 y la 002; español rioplatense; área táctil de 48 px.

## Decisiones

### Cerradas antes de delegar

- DECIDIDO por Claudio (2026-11-18): avisos por push de la web app; sin mail ni WhatsApp en la v1
  (`decisions.md` `[avisos]`).
- DECIDIDO por Claudio (2026-11-18): web app instalable, no app nativa.
- DECIDIDO por Claudio (2026-11-18): los dos adultos tienen el mismo perfil y ambos cambian
  turnos.
- DECIDIDO por Claudio (2026-11-18): el aviso en la pantalla bloqueada muestra el detalle, sin el
  nombre del hijo: "Terapia ocupacional: jue 26/11 15:00 → vie 27/11 17:00. Lo cambió Laura".
- DECIDIDO por Claudio (2026-11-18): nota corta opcional en el cambio (hasta 80 caracteres); no
  viaja en el aviso.
- DECIDIDO por Claudio (2026-11-18): disparan aviso los cambios de turno, los horarios fijos que se
  agregan o quitan, las terapias que terminan y los eventos de la familia.
- DECIDIDO por Claudio (2026-11-18): reciben el aviso **todos** los adultos de la familia, incluido
  quien hizo el cambio.

### Las decide quien implementa

- Si la hoja "Cambiar este turno" es una página propia o un `<dialog>` (registrar en
  `decisions.md`); si necesita una isla de React.
- Cómo se generan los íconos del manifest a partir del isotipo (versionados como PNG).

### Condiciones de parada (el agente para y pregunta)

- El paso 0 no pasa.
- Mandar avisos exige una clave de servicio de Supabase o cualquier secreto en el navegador.
- Algo exige guardar un dato fuera de la regla `[datos]`.
- Algo requiere un servicio pago, una cuenta nueva o claves reales.
- Un criterio contradice a otro, o aparece una decisión que ninguna lista cubre.

## Efectos que escapan del sistema

**Ninguno durante la implementación.** Los avisos se prueban contra un servicio de push falso
local, con claves VAPID generadas en el test. Generar las claves reales, cargarlas en Vercel,
correr `003_cambios.sql` y activar los avisos en cada celular son actos del operador siguiendo el
README. Una vez en producción, cada cambio manda avisos reales a los celulares de la familia.

## Fuera de alcance, con condición de reactivación

| Fuera | Se reactiva si |
|---|---|
| Recordatorio antes de cada terapia (p. ej. 1 h antes) | Los adultos lo piden; exige un cron más frecuente que el diario del plan Hobby |
| Avisos por mail | Un adulto no puede o no quiere instalar la app |
| Funcionar sin conexión | Los adultos lo extrañan |
| Capturar el cambio desde el WhatsApp de la terapeuta | Cargar a mano resulta lento (oportunidad del PRD) |
| Mover un turno arrastrándolo | Los formularios resultan lentos en la práctica |

## Evidencia de implementación (2026-11-18)

Rama `spec/003-cambios`. Decisiones nuevas: `decisions.md`, entradas `[ui]` (`/turno` como página),
`[avisos]` (envío antes de redirigir) y `[tests]` (servicio de push falso HTTPS) del 2026-11-18.

### Paso 0

Pasó antes de construir nada: `tests/push/push.test.ts` manda con `web-push` 4 y claves generadas en
el test a un servicio falso HTTPS local; llega un POST con `Content-Encoding: aes128gcm`, el header
`Authorization: vapid t=…, k=…` y el cuerpo cifrado. Un 410 llega como error con `statusCode`.

### `evals/run.sh`

```
PASS 001·C0 Postgres embebido + shim de Supabase
PASS 001·C1 el proyecto compila
PASS 001·C2 migración: 7 tablas con RLS, 8 funciones security definer, sin datos prohibidos
PASS 001·C3 + 002·C3 + 003·C3 reglas y seguridad en la base
     |       Tests  64 passed (64)
PASS 001·C4 + 002·C4 + 003·C4 WhatsApp, fechas y avisos (Vitest)
     |       Tests  16 passed (16)
PASS 001·C5 + 002·C5 + 003·C5 sin sesión, instalable y sin scroll horizontal (Playwright)
     |   12 passed (6.1s)
PASS 001·C6 la vista previa no llega a producción
PASS 001·C7 sin secretos
PASS 001·C8 (parte automática) contraste AA de todos los pares, claro y oscuro
PASS 001·C9 README con las secciones del operador
PASS 002·C2 migración: 5 tablas con RLS, 12 funciones security definer, sin datos prohibidos ni drops
PASS 002·C9 README con la sección Migración 002
PASS 003·C0 Web Push cifrado con VAPID hacia un servicio de push falso
PASS 003·C2 migración: 2 tablas con RLS, 9 funciones security definer, destinatarios sin email
PASS 003·C7 sin claves VAPID privadas en el repo ni en el navegador
PASS 003·C9 README con Avisos y Migración 003

16 pasan, 0 fallan
```

C2 y C7 se probaron en negativo: con `email` en `destinatarios_aviso` falla C2; con un archivo con
`VAPID_PRIVATE_KEY=<valor>` falla C7. Se sumó un test que recorre las 14 pantallas de la vista
previa con los desplegables abiertos a 375 px: encontró un desborde de los formularios en dos
columnas, corregido con `minmax(0, 1fr)`.

### C8 — rúbrica

Capturas en `docs/capturas/003/` (4 pantallas a 375 y 1280 px, y a 375 px en modo oscuro); las de
la 001 y la 002 se rehicieron.

1. Mover: tocar el turno → "Moverlo" ya abierto con día y hora del turno → elegir hora →
   "Guardar". Tres toques más la hora. ✓
2. Cancelado: gris, tachado y "No hay"; cambiado: otro color, borde y "Cambiado · antes jue
   26/11 16:00". ✓
3. Avisos: un punto por adulto (activo / sin avisos) y una tarjeta "En este celular" con un solo
   paso visible. ✓
4. iPhone: cuatro pasos numerados con "Safari", "Compartir", "Agregar a inicio" y "Agregar". ✓
5. Mismos tokens; contraste AA de los 5 pares nuevos; botones de 48 px. ✓
