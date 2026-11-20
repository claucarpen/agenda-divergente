# agenda-divergente — Decisiones

> Append-only: acá no se corrige nada. Cuatro campos por decisión — el formato está en
> `CLAUDE.md`.

## 2026-11-18 · [stack] Astro, Supabase con RLS, Vercel y login con Google, como Nos Vemos

**Qué se decide**: Astro 7 con islas de React, Supabase (Postgres + Auth con Google) con RLS en todas las tablas y escrituras por funciones `security definer`, deploy en Vercel Hobby desde GitHub.
**Por qué**: es el stack que el operador ya dirigió y tiene en producción en Nos Vemos; costo cero mientras sea para su familia; los dos padres tienen Gmail. Descartados: app nativa (Apple cobra USD 99 por año y sin esa cuenta no hay push en iPhone; otro stack), construir sobre Google Calendar (ya se quedó corto), Firebase (otro stack sin ventaja para este caso).
**La invalidaría**: que los avisos push en iPhone fallen en la práctica, o abrir a otras familias con uso comercial (Vercel Hobby no lo admite).

## 2026-11-18 · [datos] Se guardan fechas, estados y vencimientos; nunca diagnósticos, informes ni documentos

**Qué se decide**: ninguna tabla guarda diagnósticos, datos clínicos, informes ni archivos. Del hijo, solo nombre de pila o apodo, obra social y plan.
**Por qué**: son datos de menores en terapia. Sin documentos, una filtración expone una agenda, no una historia clínica. Los PDF siguen donde están hoy (mail y computadora del operador).
**La invalidaría**: una decisión del operador de custodiar documentos, con la seguridad para hacerlo resuelta en una spec propia.

## 2026-11-18 · [familia] Todos los adultos de una familia tienen el mismo perfil

**Qué se decide**: sin roles: cualquier adulto miembro ve, carga, cambia e invita.
**Por qué**: decisión del operador: la logística es compartida y los cambios de las terapeutas llegan a cualquiera de los dos padres.
**La invalidaría**: que una familia necesite un adulto de solo lectura (abuelos, niñera).

## 2026-11-18 · [avisos] Avisos por push de la web app en la v1, sin mail ni WhatsApp

**Qué se decide**: los avisos inmediatos (cambios) y programados (vencimientos, cron diario de Vercel) salen por Web Push con claves VAPID propias.
**Por qué**: gratis y sin proveedor intermedio. En Android llega con el navegador cerrado; en iPhone requiere la app instalada en la pantalla de inicio (iOS 16.4+). El mail exige dominio propio antes de validar; WhatsApp tiene costo por mensaje y dependencia de Meta.
**La invalidaría**: que un padre de prueba no reciba los avisos de forma confiable.

## 2026-11-18 · [gates] Los agentes pushean ramas y mergean con el OK explícito del operador

**Qué se decide**: los agentes pushean sus ramas y abren PR; mergean un PR solo cuando el operador lo pide para ese PR. Nunca pushean directo a `main` ni fuerzan un push.
**Por qué**: decisión del operador (2026-11-18): en Nos Vemos el push y el merge les estaban negados a los agentes y eso lo obligaba a hacerlos a mano; la revisión humana se mantiene en el OK del merge.
**Reemplaza a**: la negación de `git push` y `gh pr merge` heredada de Nos Vemos en `.claude/settings.json`.
**La invalidaría**: un merge hecho sin el OK del operador, o un push directo a `main`.

## 2026-11-18 · [diseño] Identidad visual moderna y fresca, inspirada en Material Design 3 (Material You)

**Qué se decide**: lenguaje visual de Material 3: color tonal derivado de un color semilla con roles (primary, secondary, surface, container), esquinas redondeadas, elevación tonal en lugar de sombras duras, tipografía sans moderna, mucho aire. Nada retro ni pixel art.
**Por qué**: decisión del operador (2026-11-18): no quiere la estética retrogaming de Nos Vemos sino algo limpio y fresco; además, Material es el lenguaje que reconocen los usuarios de Android y se lee bien en iPhone.
**La invalidaría**: que el operador elija otra dirección sobre las capturas de la spec 001.

## 2026-11-18 · [diseño] Semilla verde agua #2f8f83, tipografía Figtree y Material 3 sin librería de componentes

**Qué se decide**: los colores salen de `scripts/generar-tokens.mjs` (Material Color Utilities 0.4.0, roles de Material 3 en claro y oscuro) y los componentes son CSS propio en `src/styles/app.css`. Tipografía Figtree variable, autoalojada.
**Por qué**: verde agua se lee fresco y sereno, no clínico. Una librería de componentes web sumaría peso y dependencia para cinco pantallas de formularios; los tokens dan la misma coherencia de color. Figtree es una sans geométrica moderna y legible en celular, con licencia OFL. Contraste AA medido en todos los pares (`scripts/contraste.mjs`, mínimo 5,51:1).
**La invalidaría**: que el operador elija otra semilla o tipografía sobre las capturas, o que las pantallas crezcan al punto de que mantener componentes propios cueste más que una librería.

## 2026-11-18 · [stack] Sin islas de React en la spec 001

**Qué se decide**: las páginas son Astro con formularios POST; la única interactividad (copiar el link) es un `<script>` chico. `@astrojs/react` no está instalado.
**Por qué**: la spec pide React solo donde haya interactividad y acá no la hay; menos dependencias y menos JavaScript en el celular.
**La invalidaría**: una spec con interactividad real (por ejemplo, el calendario de la 002).

## 2026-11-18 · [tests] Los tests corren también como root y con un Chromium ya instalado

**Qué se decide**: `tests/db/pg.ts` usa `createPostgresUser` cuando el proceso es root; `playwright.app.config.ts` y `scripts/capturas.mjs` aceptan `CHROMIUM_PATH` opcional.
**Por qué**: el agente corre en un contenedor como root, donde Postgres no arranca y la versión de Playwright no coincide con el Chromium instalado. En la máquina del operador nada cambia.
**La invalidaría**: que los tests corran solo en la máquina del operador o en un CI propio.

## 2026-11-18 · [stack] La semana y las terapias también sin React: links y formularios POST

**Qué se decide**: cambiar de semana son links (`?desde=`); cargar, quitar y terminar son formularios POST que redirigen. Sin islas de React en la spec 002.
**Por qué**: la spec 002 dejaba la elección a quien implementa. Nada de la semana necesita estado en el navegador; con formularios funciona igual en celulares viejos y sin JavaScript, y la confirmación de "Terminar terapia" es una casilla obligatoria en lugar de un diálogo.
**La invalidaría**: una interacción que no se resuelva con un recargo de página (por ejemplo, arrastrar un turno en la spec 003).

## 2026-11-18 · [diseño] Navegación inferior sticky al final del body, no fija

**Qué se decide**: `.navegacion` usa `position: sticky; bottom: 0` como último elemento del body.
**Por qué**: queda pegada abajo al hacer scroll igual que una barra fija, pero no tapa el último contenido y no obliga a reservar un margen inferior adivinado.
**La invalidaría**: un navegador objetivo donde sticky no funcione bien al final del body.

## 2026-11-18 · [ui] Cambiar un turno es una página propia (`/turno`), no un diálogo

**Qué se decide**: tocar un turno en la semana abre `/turno?horario=…&fecha=…` con los tres caminos (moverlo, no hay ese día, período) o, si ya está cambiado, el cambio con "Deshacer". Sin React ni `<dialog>`.
**Por qué**: la spec dejaba la elección a quien implementa. Una página funciona igual con formularios POST, el botón atrás del celular vuelve a la semana, y mover un turno sigue siendo tres toques más la hora ("Moverlo" abre desplegado).
**La invalidaría**: que en la práctica ir y volver de la semana resulte lento.

## 2026-11-18 · [avisos] El aviso se envía antes de redirigir, con tope de 4 s por suscripción

**Qué se decide**: las páginas esperan `avisarFamilia` antes de responder el 303; `web-push` corta a los 4 s. Los errores se tragan.
**Por qué**: en una función de Vercel, el trabajo que sigue después de responder puede cortarse; esperar asegura que el aviso salga. Con dos o tres celulares por familia la espera es corta.
**La invalidaría**: familias con muchos celulares o avisos que demoren la navegación de forma notoria; entonces, una cola.

## 2026-11-18 · [tests] El servicio de push falso es HTTPS con un certificado autofirmado de openssl

**Qué se decide**: `tests/push/push.test.ts` genera un certificado para 127.0.0.1 con openssl y el cliente de `web-push` confía solo en ese certificado (`agent` con `ca`). Nunca se desactiva la verificación TLS.
**Por qué**: `web-push` 4 solo habla HTTPS; un certificado propio del test prueba el envío real sin servicios externos ni claves reales.
**La invalidaría**: una máquina sin openssl (macOS y Linux lo traen).

## 2026-11-19 · [avisos] Los recordatorios los dispara pg_cron de Supabase cada minuto, sin clave de servicio

**Qué se decide**: un trabajo de `pg_cron` llama cada minuto con `pg_net` a `/api/recordatorios` con `Authorization: Bearer <secreto>`. El endpoint llama a `tomar_recordatorios(secreto)` con la clave publicable; esa función es la única con `execute` para `anon` y compara el secreto con `config_privada`.
**Por qué**: el recordatorio de 10 minutos necesita un reloj de un minuto. El cron de Vercel Hobby es diario, Vercel Pro cuesta USD 20 por mes y un servicio externo suma una cuenta. `pg_cron` y `pg_net` vienen con Supabase. Con el secreto compartido, ninguna clave de servicio de Supabase llega a Vercel.
**Reemplaza a**: la parte "programados (vencimientos, cron diario de Vercel)" de `2026-11-18 · [avisos]`; el canal sigue siendo Web Push.
**La invalidaría**: que Supabase quite `pg_cron` o `pg_net` del plan gratis, o que la app pase a un plan de Vercel con cron por minuto.

## 2026-11-19 · [avisos] El secreto del reloj vive en `config_privada`, no en Vault

**Qué se decide**: el secreto del reloj y la URL de la app se guardan en `public.config_privada`, sin `grant` para `anon` ni `authenticated`. Lo leen `tomar_recordatorios` y el trabajo de `pg_cron`.
**Por qué**: un solo lugar para las dos lecturas, y el mismo esquema funciona en el Postgres embebido de los tests, que no tiene Vault. Sin `grant` y con RLS, solo `postgres` y las funciones `security definer` lo leen.
**La invalidaría**: guardar un secreto que dé acceso a algo más que pedir recordatorios.

## 2026-11-19 · [avisos] El reloj no borra suscripciones vencidas

**Qué se decide**: si un recordatorio recibe 404 o 410, el endpoint solo lo cuenta. La suscripción la borra el próximo aviso inmediato de esa familia (`marcar_suscripcion`, spec 003).
**Por qué**: borrar sin sesión exige otra función para `anon`. Una suscripción vencida solo cuesta un envío fallido por recordatorio.
**La invalidaría**: que los envíos fallidos se acumulen hasta afectar el tiempo del endpoint.

## 2026-11-19 · [datos] Avatares ilustrados de una galería cerrada, sin fotos

**Qué se decide**: `perfiles.avatar` e `hijos.avatar` guardan el id de uno de 12 personajes propios (`public/avatares/`), con `check` contra la lista. Ningún archivo ni URL de imagen.
**Por qué**: la familia quería personalizar sin subir fotos de una menor; la regla `2026-11-18 · [datos]` no cambia. Los personajes son originales del proyecto, no de terceros.
**La invalidaría**: una decisión del operador de permitir fotos reales, con almacenamiento privado y sin metadatos.

## 2026-11-19 · [stack] La hora de los recordatorios se calcula en hora local de Buenos Aires

**Qué se decide**: `tomar_recordatorios` pasa `ahora` a `timestamp` local con `at time zone 'America/Argentina/Buenos_Aires'` y lo compara con `fecha + hora` de cada turno o evento. Ventana: `(ahora, ahora + 10 min]`; la clave de `recordatorios_enviados` evita repetir.
**Por qué**: los horarios se guardan como hora local sin zona (spec 002). La ventana de 10 minutos tolera que el reloj se saltee un minuto sin mandar dos veces.
**La invalidaría**: familias en otra zona horaria.
