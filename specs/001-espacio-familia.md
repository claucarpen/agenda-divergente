---
status: borrador
depends_on: []
---

# 001 — Espacio de familia: los padres entran con Google, uno invita al otro y cargan al hijo

Construir la base del producto. Un padre entra con Google, crea su familia y carga a su hijo
(nombre de pila u apodo, obra social y plan). Genera un link de invitación y se lo manda al otro
padre, que entra con Google y queda en la misma familia con el mismo perfil. Los dos ven lo mismo.
Ninguna otra familia ve nada de ellos.

**Tipo**: feature · **Flujo**: design-first (el paso 0 despeja el riesgo de probar la seguridad
de la base sin Docker; ya resuelto en Nos Vemos, ver `learnings/postgres-supabase-tests.md`)

## Contexto

- PRD (brain): v1 = calendario de terapias + vencimientos, para la familia del operador, con los
  datos preparados para varias familias (camino B).
- Esta spec no tiene terapias ni avisos: son las specs 002 a 004 (`README.md`).
- Reglas que aplican: `decisions.md` → `[stack]`, `[datos]`, `[familia]`.

## Estado previo

Repo vacío salvo la estructura (`CLAUDE.md`, `decisions.md`, `evals/run.sh`, `learnings/`). No hay
proyecto Astro, ni migraciones, ni tests. La máquina no tiene Docker.

## Paso 0 — prueba de factibilidad (antes de construir)

Crear el proyecto Astro 7 con `@astrojs/vercel` y levantar un Postgres embebido
(`embedded-postgres`) desde Vitest con un shim mínimo de Supabase: roles `anon` y `authenticated`,
schema `auth` con `auth.users` y `auth.uid()` que lee el claim `sub`, y los grants por defecto de
Supabase (ver `learnings/postgres-supabase-tests.md`). Demostrar con un test que `auth.uid()`
devuelve el id simulado bajo `set role authenticated`.

Si el paso 0 no pasa, **parar y reportar** con alternativas. No construir nada más.

## Qué se construye

### Base de datos — `supabase/migrations/001_familias.sql`

Tablas (todas con RLS activado):

| Tabla | Columnas clave |
|---|---|
| `obras_sociales` | `id text` PK, `nombre`. Semilla: `('osde', 'OSDE')` |
| `perfiles` | `id uuid` PK = `auth.users.id`, `nombre`, `email`, `creado_en` |
| `familias` | `id uuid` PK, `nombre` (1-60), `creada_en` |
| `miembros` | (`familia_id`, `perfil_id`) PK, `unido_en` |
| `invitaciones` | `codigo text` PK, `familia_id`, `creada_por`, `creada_en`, `vence_en` (creada + 7 días), `usada_por` (nullable), `usada_en` |
| `hijos` | `id uuid` PK, `familia_id`, `nombre` (1-40), `obra_social_id` (FK), `plan` (0-30, nullable), `creado_en` |
| `movimientos` | `id`, `familia_id`, `perfil_id`, `tipo` (`creo_familia` \| `invito` \| `se_unio` \| `agrego_hijo` \| `edito_hijo`), `creado_en` |

Sin columnas de diagnóstico, fecha de nacimiento, documento ni datos clínicos (`decisions.md`
`[datos]`).

**Acceso solo por funciones** (`security definer`, `search_path` fijo). `authenticated` no tiene
políticas de insert/update/delete directas en ninguna tabla, y solo lee su propia fila de
`perfiles`. `anon` no lee ninguna tabla.

| Función | Quién | Qué hace |
|---|---|---|
| `asegurar_perfil()` | authenticated | Crea el perfil si no existe (nombre y email de Google) |
| `crear_familia(nombre)` | authenticated sin familia | Crea la familia, suma al creador como miembro, registra `creo_familia`. Rechaza si ya es miembro de una familia |
| `mi_familia()` | miembro | Nombre de la familia, miembros **solo con nombre**, hijos (nombre, obra social, plan) |
| `crear_invitacion()` | miembro | Genera un código de ≥128 bits en base64url (≥22 caracteres), vence a los 7 días, un solo uso. Registra `invito`. Devuelve el código |
| `invitacion_publica(codigo)` | anon y authenticated | Solo nombre de la familia y nombre de quien invita, y si está vigente. Nada más |
| `aceptar_invitacion(codigo)` | authenticated | Rechaza si venció, si ya se usó, si quien acepta ya es miembro de otra familia o si la familia ya tiene 4 adultos. Suma como miembro, marca la invitación usada, registra `se_unio`. Si ya es miembro de esa familia, no hace nada |
| `agregar_hijo(nombre, obra_social_id, plan)` | miembro | Valida largos y obra social. Registra `agrego_hijo` |
| `editar_hijo(hijo_id, nombre, obra_social_id, plan)` | miembro de esa familia | Registra `edito_hijo` |

### Aplicación

- **Auth**: Supabase Auth con Google con `@supabase/ssr` y cookies (ver
  `learnings/astro-7-vercel.md`). Ruta `/auth/callback`. Al entrar se llama a `asegurar_perfil()`.
  Si se entró desde una invitación, vuelve a ella.
- **Páginas renderizadas en el servidor**:
  - `/`: sin sesión, nombre del producto, una línea de qué es y "Entrar con Google". Con sesión y
    sin familia: formulario "Creá tu familia" (nombre). Con familia: inicio con los miembros, los
    hijos, "Agregar hijo" y "Invitar a otro adulto".
  - "Invitar a otro adulto": genera el link y ofrece **"Compartir por WhatsApp"** →
    `https://wa.me/?text=<encodeURIComponent("Sumate a <familia> en Agenda Divergente: <url>")>`
    y "Copiar link". El link solo abre WhatsApp con el texto: no envía nada solo.
  - `/invitacion/<código>`: sin sesión, "<quien invita> te invita a <familia>" y "Entrar con
    Google para sumarte". Con sesión, botón "Sumarme". Vencida o usada: "Esta invitación ya no
    sirve. Pedile a <quien invita> una nueva." Inexistente: "Esta invitación no existe" (404).
- **Celular primero**: se diseña a 375 px; también se ve bien a 1280 px.
- **Vista previa de diseño**: una ruta de desarrollo con datos de ejemplo de las pantallas (sin
  sesión, crear familia, inicio con hijos, invitación vigente, invitación vencida) para capturas.
  **No existe en el build de producción.**
- `README.md`: suma los pasos del operador para configurar Google (Google Cloud → OAuth client →
  Supabase → Authentication → Providers → Google, con las URLs de redirección de Vercel y de
  localhost) y correr `001_familias.sql`.

## Criterios de aceptación y sus evals

Los deterministas se agregan a `evals/run.sh`, una función por criterio.

| # | Criterio | Eval |
|---|---|---|
| C0 | Postgres embebido con el shim de Supabase funciona | `npm run test:db` incluye y pasa el test del paso 0 |
| C1 | Compila | `npm ci && npm run build` sale con código 0 |
| C2 | La migración tiene la forma pedida | `grep` sobre `001_familias.sql`: las 7 tablas; `enable row level security` en cada una; las 8 funciones con `security definer` y `set search_path`; ninguna `create policy … for insert/update/delete … to authenticated`; ninguna columna que contenga `diagnost`, `nacimiento`, `dni` o `document` |
| C3 | Las reglas y la seguridad funcionan en la base | `npm run test:db` pasa con, como mínimo: crear familia → creador miembro · crear una segunda familia siendo miembro → rechazo · invitación con código de ≥22 caracteres · aceptar invitación válida → miembro, invitación usada · aceptar dos veces la misma → la segunda rechaza (si es otra persona) o no hace nada (si es la misma) · aceptar vencida → rechazo · aceptar siendo miembro de otra familia → rechazo · un quinto adulto → rechazo · `mi_familia` no expone emails · un usuario no ve la familia ni los hijos de otra · `agregar_hijo` con obra social inexistente → rechazo · `editar_hijo` de otra familia → rechazo · `invitacion_publica` no expone nada más que nombre de familia, nombre de quien invita y vigencia · `anon` no puede leer ninguna tabla · `authenticated` no puede insertar directo en ninguna tabla · `movimientos` registra los 5 tipos |
| C4 | El link de invitación sale bien | `npm test` (Vitest) pasa con: el link de WhatsApp empieza con `https://wa.me/?text=` y decodifica al texto exacto; "¿", "ñ" y "&" sobreviven codificados |
| C5 | Las páginas sin sesión se ven y funcionan | Playwright con variables de Supabase falsas: `/` sin sesión muestra "Entrar con Google"; `/invitacion/<inexistente>` responde 404 con "Esta invitación no existe"; a 375 px, sin scroll horizontal |
| C6 | La vista previa no llega a producción | En la salida del build no existe la ruta de vista previa (grep en `.vercel/output`) |
| C7 | Sin secretos | `grep -riE "service_role\|sb_secret"` en `src/`, `supabase/`, `scripts/`, `tests/` = 0 resultados; `.env` no está en `git ls-files` |
| C8 | Se entiende y se usa con una mano | Rúbrica (abajo) sobre capturas a 375 y 1280 px de las 5 pantallas de la vista previa, adjuntas al PR |
| C9 | El operador puede ponerla en marcha solo | `README.md` tiene las secciones: Login con Google, Migración 001 |

### Rúbrica de C8 (pasa si cumple todo)

1. En el inicio se entiende en dos segundos quiénes son la familia y cómo invitar al otro padre.
2. Botones con contraste AA (registrar el ratio) y área táctil de al menos 44 px.
3. Español rioplatense en todo.
4. Ningún dato del hijo más allá de nombre, obra social y plan aparece en pantalla.
5. Tono cálido y sereno: nada que se lea como clínico ni como burocrático.
6. Lenguaje visual de Material 3 (`decisions.md` `[diseño]`): roles de color tonales derivados de
   un color semilla (declarados como variables CSS), esquinas redondeadas, elevación tonal,
   tipografía sans moderna; ningún rasgo retro ni pixel art.

## Decisiones

### Cerradas antes de delegar

- DECIDIDO por Claudio (2026-11-18): login solo con Google; los dos padres con el mismo perfil.
- DECIDIDO por Claudio (2026-11-18): del hijo se guarda solo nombre de pila o apodo, obra social y
  plan.
- DECIDIDO por Claudio (2026-11-18): tope de 4 adultos por familia.
- DECIDIDO por Claudio (2026-11-18): la invitación vence a los 7 días y es de un solo uso.
- DECIDIDO por Claudio (2026-11-18): identidad visual inspirada en Material Design 3 (Material
  You), moderna, limpia y fresca; nada retro (`decisions.md` `[diseño]`). Quien implementa elige
  el color semilla y la tipografía, los registra en `decisions.md`, y el operador los ajusta sobre
  las capturas.

### Las decide quien implementa

- División en componentes: lo más simple que pase los evals; React solo donde haya
  interactividad.
- Cómo se implementa Material 3: tokens propios en CSS o una librería, si se registra en
  `decisions.md` por qué y su estado de mantenimiento verificado ese día.
- Cómo se generan los códigos dentro de la función, respetando ≥128 bits.

### Condiciones de parada (el agente para y pregunta)

- El paso 0 no pasa.
- Algo exige guardar un dato del hijo fuera de nombre, obra social y plan.
- Algo requiere un servicio pago, una cuenta nueva o claves reales.
- `@supabase/ssr` no funciona con Astro 7 + Vercel.
- Un criterio contradice a otro, o aparece una decisión que ninguna lista cubre.

## Efectos que escapan del sistema

**Ninguno durante la implementación.** El agente no toca el proyecto real de Supabase, Vercel ni
Google Cloud, y no conoce claves reales: todo se prueba con el Postgres embebido y variables
falsas. Crear el proyecto de Supabase, correr la migración, configurar Google y desplegar son actos
del operador siguiendo el README. El link de WhatsApp solo abre WhatsApp con un texto.

## Fuera de alcance, con condición de reactivación

| Fuera | Se reactiva si |
|---|---|
| Terapias, horarios y la semana | Spec 002 |
| Cambios de turno, web app instalable y avisos push | Spec 003 |
| Papeles y vencimientos | Spec 004 |
| Salir de una familia o quitar a un miembro | Lo pide una familia de prueba |
| Adultos de solo lectura (abuelos, niñera) | Lo pide una familia de prueba |
| Más de una familia por adulto | Un adulto real lo necesita |
| Otras obras sociales en la semilla | Se suma una familia con otra obra social |
