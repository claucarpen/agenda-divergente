# agenda-divergente — Arquitectura (as-built)

> Describe lo construido, nunca lo planeado — lo que falta vive en `specs/`.

## Stack

- Astro 7 con `@astrojs/vercel`, `output: 'server'`: todas las páginas se renderizan en el servidor porque dependen de la sesión. Sin islas de React: la navegación es con links y formularios POST; la única interactividad (copiar el link) es un `<script>` en `Inicio.astro`.
- Con familia, el layout muestra la navegación inferior (`Navegacion.astro`: Semana, Terapias, Familia), `position: sticky` al final del body.
- App instalable: `public/manifest.webmanifest` (`start_url: /semana`, standalone, íconos en `public/iconos/` generados por `scripts/iconos.mjs`) y `public/sw.js` (solo `push` y `notificationclick`; sin caché offline). El service worker lo registra el script de `Avisos.astro` al activar los avisos.
- Avisos: Web Push desde el servidor con `web-push` 4 (`src/lib/avisos.ts`). Claves `PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` en variables de Vercel; sin ellas, no se envía nada y la app funciona igual. Cada acción que dispara aviso espera el envío (máximo 4 s por suscripción) antes de redirigir; un fallo nunca rompe la acción.
- Auth: Supabase Auth con Google vía `@supabase/ssr`; la sesión viaja en cookies (PKCE).
- Supabase: 7 tablas con RLS y sin acceso directo; todo pasa por funciones `security definer` con `search_path` vacío.
- Estilos: Material 3 hecho a mano. `src/styles/tokens.css` (generado desde la semilla `#2f8f83` por `scripts/generar-tokens.mjs`, claro y oscuro) y `src/styles/app.css` (componentes). Tipografía Figtree variable, autoalojada vía `@fontsource-variable/figtree`.

## Mapa

| Ruta | Qué es |
|---|---|
| `src/pages/index.astro` | `/`. Sin sesión: `Ingreso`. Con sesión sin familia: `CrearFamilia` (POST `crear_familia` → `/familia`). Con familia: 303 a `/semana` |
| `src/pages/familia.astro` | Adultos, invitar e hijos (`Inicio.astro`) y avisos (`Avisos.astro`). POST con `accion` = `agregar_hijo` \| `invitar` \| `probar_aviso`; `guardar_suscripcion` \| `borrar_suscripcion` vienen por `fetch` del script y responden 204 o 400 |
| `src/pages/turno.astro` | `?horario=<uuid>&fecha=AAAA-MM-DD` (`CambiarTurno.astro`). POST con `accion` = `mover` \| `cancelar` \| `periodo` \| `anular`; avisa y redirige a la semana del cambio |
| `src/pages/semana.astro` | `?desde=AAAA-MM-DD` (lunes; si no, 303 al lunes de esa semana; inválido, 303 a la actual). `semana()` + `mis_terapias()` → `Semana.astro` |
| `src/pages/terapias/index.astro` | Terapias, profesionales y eventos (`Terapias.astro`). POST: `agregar_profesional`, `agregar_terapia` (y su primer horario; si el horario falla, 303 a la terapia con `?error=`), `agregar_evento`, `quitar_evento` |
| `src/pages/terapias/[id].astro` | Una terapia (`TerapiaDetalle.astro`). Id no-UUID o de otra familia → 404. POST: `agregar_horario`, `quitar_horario`, `editar_terapia`, `terminar_terapia`, `anular_cambio`; lista los cambios vigentes de la terapia |
| `src/pages/invitacion/[codigo].astro` | Invitación. Código con forma inválida o inexistente → 404. POST con sesión → `aceptar_invitacion` → 303 a `/` |
| `src/pages/auth/login.ts` | POST: arranca el OAuth de Google y vuelve a `next` |
| `src/pages/auth/callback.ts` | Canjea el código por la sesión, llama a `asegurar_perfil()` y sigue a `next` |
| `src/pages/auth/salir.ts` | POST: cierra la sesión |
| `src/components/` | `Ingreso`, `CrearFamilia`, `Inicio`, `Invitacion`, `BotonGoogle`, `Marca` (isotipo SVG), `Navegacion`, `Semana` (turnos normales, cambiados y cancelados; cada uno enlaza a `/turno`), `Terapias`, `TerapiaDetalle`, `CamposFranja` (día, hora y duración), `CambiarTurno`, `Avisos` (estado por adulto y el script del celular: soporte, iPhone sin instalar, permiso, suscripción) |
| `src/layouts/App.astro` | Barra superior (marca y "Salir" con sesión) y contenido de 640 px máximo |
| `src/lib/` | `supabase.ts` (cliente SSR, `rutaSegura`), `sesion.ts` (`exigirFamilia`: sin sesión o sin familia → 303 a `/`; lectura de campos), `errores.ts` (claves de la base → texto), `whatsapp.ts`, `codigo.ts`, `familia.ts` (tipos, tope de 4 adultos, obras sociales del formulario), `fechas.ts` (semana en hora argentina), `terapias.ts` (tipos y modalidades), `cambios.ts` (un cambio en una línea), `textos-aviso.ts` (textos de los avisos, sin hijo ni nota), `avisos.ts` (envío con dependencias inyectables; 404 y 410 borran la suscripción), `avisar-familia.ts` (lo conecta con Supabase) |
| `src/dev/vista-previa.astro` | Solo en `astro dev`: `/vista-previa/<pantalla>` con datos de ejemplo |
| `supabase/migrations/001_familias.sql`, `002_terapias.sql`, `003_cambios.sql` | Ver "Base" |
| `scripts/` | `generar-tokens.mjs` (`npm run tokens`), `contraste.mjs` (pares WCAG), `capturas.mjs` (`SPEC=001`, `002` o `003`), `iconos.mjs` |
| `tests/db/` | `pg.ts` (Postgres embebido + shim), `shim.test.ts` (paso 0), `familias.test.ts`, `terapias.test.ts`, `cambios.test.ts` |
| `tests/push/` | Paso 0 de la 003: `web-push` contra un servicio de push falso HTTPS con certificado autofirmado (openssl) |
| `tests/app/` | Playwright contra `astro dev` con un Supabase falso (`stub-supabase.mjs`): sin sesión, instalable y sin scroll horizontal en toda la vista previa |

## Base

| Tabla | Para qué |
|---|---|
| `obras_sociales` | Catálogo; semilla `osde` |
| `perfiles` | Adulto que entró con Google. `authenticated` lee solo su fila |
| `familias` | El espacio compartido |
| `miembros` | Adultos de cada familia; índice único por `perfil_id` (un adulto, una familia) |
| `invitaciones` | Código de 128 bits, vence a los 7 días, un solo uso |
| `hijos` | Nombre o apodo, obra social y plan. Nada más (`decisions.md` `[datos]`) |
| `movimientos` | 001: `creo_familia`, `invito`, `se_unio`, `agrego_hijo`, `edito_hijo`. 002: `agrego_profesional`, `edito_profesional`, `agrego_terapia`, `edito_terapia`, `termino_terapia`, `agrego_horario`, `quito_horario`, `agrego_evento`, `quito_evento` |
| `tipos_terapia` | Catálogo cerrado con `orden`; `otra` al final |
| `profesionales` | De cada familia: nombre, tipo, teléfono opcional, fuera de cartilla |
| `terapias` | Hijo + profesional + tipo + modalidad + lugar; `activa` o `terminada` con `desde`/`hasta`. No se borran |
| `horarios` | Franja semanal (`dia_semana` 1-7, `hora` local, `duracion_min`) con `desde`/`hasta`; quitar es cerrar con `hasta` |
| `eventos_familia` | Franja semanal con título, sin duración; quitar es cerrar con `hasta` |
| `cambios` | Excepción a un horario: `una_vez` (`fecha` → `nueva_fecha`/`nueva_hora` o cancelar) o `periodo` (`desde`–`hasta`, hasta 180 días → `nuevo_dia_semana`/`nueva_hora` o cancelar). Nota opcional de 80. Deshacer = `anulado_en`. Sin superposiciones por horario |
| `suscripciones_push` | Endpoint https, `p256dh`, `auth` por adulto; `ultimo_ok` |

| Función | Quién |
|---|---|
| `asegurar_perfil()`, `crear_familia(nombre)`, `mi_familia()`, `crear_invitacion()`, `aceptar_invitacion(codigo)`, `agregar_hijo(...)`, `editar_hijo(...)` | `authenticated` |
| `invitacion_publica(codigo)` | `anon` y `authenticated`: solo familia, quién invita y vigencia |
| `agregar_profesional`, `editar_profesional`, `agregar_terapia`, `editar_terapia`, `terminar_terapia`, `agregar_horario`, `quitar_horario`, `agregar_evento`, `quitar_evento`, `mis_terapias()`, `terapia(id)`, `semana(lunes)` | `authenticated` con familia; algo de otra familia → `ajeno` |

| `cambiar_turno_una_vez`, `cambiar_turno_periodo`, `anular_cambio`, `cambios_vigentes()`, `turno(horario_id, fecha)`, `guardar_suscripcion`, `borrar_suscripcion`, `destinatarios_aviso()` (todos los adultos de la familia, incluido quien llama), `marcar_suscripcion`, `estado_avisos()` | `authenticated` con familia |

`semana(lunes)` devuelve 7 días ordenados por hora (a igual hora, la terapia primero). Las ocurrencias de terapias salen de `_ocurrencias(fam, ini, fin)`: horarios fijos vigentes sin cambio (`estado: normal`), con un cambio de cancelar (`cancelado`, en su hora original) y los movidos (`cambiado`, en su día y hora nuevos, con `original_fecha` y `original_inicio`). Un período mueve cada turno al `nuevo_dia_semana` de su misma semana. `fecha_turno` es siempre el día del turno original. `_hoy()` es la fecha argentina.

Las funciones lanzan claves (`sin_sesion`, `familia_llena`, `ajeno`, `no_es_lunes`…) que `src/lib/errores.ts` traduce. Las que empiezan con `_` son internas: sin `execute` para nadie. Cada migración vuelve a quitar `execute` de todas las funciones y lo concede de nuevo por rol, incluidas las de las anteriores.
