---
status: borrador
depends_on: [001]
---

# 002 — Terapias, horarios y la semana a la vista

Cargar las terapias del hijo con su profesional y sus horarios fijos de cada semana, y ver la
semana ordenada día por día: qué terapia hay, a qué hora, con quién y dónde, más los eventos de la
familia que cruzan la semana (p. ej. retirar antes del colegio). Los dos adultos ven y cambian lo
mismo. Los cambios puntuales o por período de un turno **no** entran acá: son la spec 003.

**Tipo**: feature · **Flujo**: design-first (sin paso 0: el Postgres embebido ya está probado en
la 001)

## Contexto

- PRD (brain): v1 = calendario de terapias + vencimientos. El calendario es lo primero para el
  operador; hoy la semana vive en un calendario de la heladera.
- Caso real de partida: 3 terapias con 3 profesionales fuera de cartilla (conductual,
  psicopedagogía y terapia ocupacional); el año próximo se suma una maestra integradora en el
  colegio.
- Las terapias cambian con los años: una terapia termina (`terminada`) y otra empieza, sin borrar
  el historial.
- Reglas que aplican: `decisions.md` → `[datos]`, `[familia]`, `[diseño]`, `[stack]`.

## Estado previo

Ver `ARCHITECTURE.md`: migración `001_familias.sql` (familias, adultos, invitaciones, hijos),
`/` con la familia, `/invitacion/[codigo]`, auth con Google, estilos Material 3 en
`src/styles/`, evals de la 001 en `evals/run.sh`. No hay terapias, horarios ni calendario.

## Qué se construye

### Base de datos — `supabase/migrations/002_terapias.sql`

No toca las tablas de la 001 salvo ampliar el `check` de `movimientos.tipo`.

| Tabla | Columnas clave |
|---|---|
| `tipos_terapia` | `id text` PK, `nombre`. Semilla: `conductual` (Terapia conductual), `psicopedagogia` (Psicopedagogía), `terapia_ocupacional` (Terapia ocupacional), `fonoaudiologia` (Fonoaudiología), `psicologia` (Psicología), `maestra_integradora` (Maestra integradora), `kinesiologia` (Kinesiología), `otra` (Otra) |
| `profesionales` | `id`, `familia_id`, `nombre` (1-60), `tipo_id` (FK), `fuera_de_cartilla bool` default true, `creado_en` |
| `terapias` | `id`, `familia_id`, `hijo_id` (FK, misma familia), `profesional_id` (FK, misma familia), `tipo_id` (FK), `modalidad` (`consultorio` \| `domicilio` \| `colegio` \| `virtual`), `lugar` (0-80, nullable), `estado` (`activa` \| `terminada`), `desde date`, `hasta date` nullable, `creada_en` |
| `horarios` | `id`, `terapia_id`, `dia_semana` (1 = lunes … 7 = domingo), `hora time`, `duracion_min` (15-240), `desde date`, `hasta date` nullable |
| `eventos_familia` | `id`, `familia_id`, `hijo_id` nullable, `titulo` (1-60), `dia_semana`, `hora time`, `desde date`, `hasta date` nullable |

- Las horas son **hora local de Argentina** (`time` sin zona); las fechas, `date` local.
- Ninguna tabla guarda diagnósticos, informes, teléfonos ni documentos (`decisions.md`
  `[datos]`).
- `movimientos.tipo` suma: `agrego_profesional`, `edito_profesional`, `agrego_terapia`,
  `edito_terapia`, `termino_terapia`, `agrego_horario`, `quito_horario`, `agrego_evento`,
  `quito_evento`.

**Acceso solo por funciones**, igual que la 001: RLS en todas las tablas, sin escritura directa
para `authenticated`, nada para `anon`. Cada función valida que todo lo que toca sea de la familia
de quien llama; si no, `ajeno`.

| Función | Qué hace |
|---|---|
| `agregar_profesional(nombre, tipo_id, fuera_de_cartilla)` / `editar_profesional(id, …)` | Alta y edición |
| `agregar_terapia(hijo_id, profesional_id, tipo_id, modalidad, lugar, desde)` | Nace `activa` |
| `editar_terapia(id, profesional_id, tipo_id, modalidad, lugar)` | Edición |
| `terminar_terapia(id, hasta)` | Pasa a `terminada` con su fecha de fin; también cierra sus horarios abiertos con esa fecha. No borra nada |
| `agregar_horario(terapia_id, dia_semana, hora, duracion_min, desde)` | Rechaza si la terapia está terminada |
| `quitar_horario(id, hasta)` | Cierra el horario con fecha de fin; no lo borra (la 003 colgará cambios de los horarios) |
| `agregar_evento(titulo, dia_semana, hora, hijo_id, desde)` / `quitar_evento(id, hasta)` | Eventos semanales de la familia |
| `mis_terapias()` | Terapias de la familia con profesional, tipo, modalidad, lugar, estado y horarios vigentes; profesionales; eventos vigentes |
| `semana(lunes date)` | Los 7 días desde `lunes` (rechaza si no es lunes): por día, las ocurrencias ordenadas por hora. Una ocurrencia es un horario vigente ese día (`desde ≤ día` y `hasta` nulo o `≥ día`) de una terapia que no terminó antes de ese día, o un evento vigente. Cada ocurrencia trae tipo, hora de inicio y fin, profesional, modalidad, lugar y nombre del hijo |

### Aplicación

- **Navegación inferior** (barra de navegación de Material 3) con tres destinos, visible con
  familia: **Semana**, **Terapias**, **Familia**.
- `/`: con familia → redirige a `/semana`. Sin sesión o sin familia, igual que hoy.
- `/familia`: lo que hoy muestra `/` con familia (adultos, invitar, hijos), sin cambios de
  comportamiento.
- `/semana?desde=AAAA-MM-DD`:
  - Por defecto, la semana actual (lunes a domingo, zona `America/Argentina/Buenos_Aires`).
  - Encabezado "Semana del 23 al 29/11" con "Anterior", "Hoy" y "Siguiente".
  - Un bloque por día ("Lunes 23/11"); el de hoy, destacado. Cada ocurrencia en una tarjeta:
    hora "15:00 – 15:45", tipo, profesional y lugar o modalidad. Los eventos de la familia con un
    estilo distinto al de las terapias.
  - Día sin nada: "Sin terapias". Semana sin terapias cargadas: un estado vacío con un botón a
    "Cargar la primera terapia".
  - `desde` inválido o que no es lunes → redirige a la semana que contiene esa fecha, o a la
    actual.
- `/terapias`: lista de terapias activas (y, plegadas, las terminadas), profesionales y eventos.
  Formularios para agregar profesional, terapia (con su primer horario) y evento.
- `/terapias/<id>`: editar la terapia, agregar y quitar horarios, terminarla (pide fecha de fin y
  confirma).
- Formularios con controles nativos del celular: `select` para día y tipo, `input type="time"`,
  `input type="date"`.
- **Vista previa de diseño**: suma `semana`, `semana-vacia`, `terapias` y `terapia-detalle` con
  datos de ejemplo. Sigue sin existir en el build de producción.
- `README.md`: sección "Migración 002".

## Criterios de aceptación y sus evals

Los deterministas se agregan a `evals/run.sh`. **Los evals de la 001 siguen y deben pasar.**

| # | Criterio | Eval |
|---|---|---|
| C1 | Compila y no rompe nada | `evals/run.sh` completo: 0 fallan |
| C2 | La migración tiene la forma pedida | `grep` sobre `002_terapias.sql`: las 5 tablas nuevas; `enable row level security` en cada una; las 12 funciones con `security definer` y `set search_path`; ninguna `create policy … for insert/update/delete … to authenticated`; ninguna columna que contenga `diagnost`, `telefono`, `dni` o `document`; no aparece `drop` sobre tablas de la 001 |
| C3 | Las reglas y la seguridad funcionan en la base | `npm run test:db` (aplicando 001 y 002) pasa con, como mínimo: agregar terapia con hijo o profesional de otra familia → `ajeno` · horario con `dia_semana` 0 u 8 → rechazo · duración 10 o 300 → rechazo · horario en terapia terminada → rechazo · `terminar_terapia` cierra sus horarios abiertos · `semana` con una fecha que no es lunes → rechazo · `semana` devuelve 7 días con las ocurrencias ordenadas por hora · un horario con `hasta` antes del día no aparece; con `desde` después del día, tampoco · una terapia terminada no aparece después de su `hasta` y sí antes · un evento aparece en su día · un adulto no ve terapias, profesionales ni eventos de otra familia · los dos adultos de una familia ven la misma `semana` · `anon` no lee ni ejecuta nada nuevo · `authenticated` no inserta directo en ninguna tabla nueva · `movimientos` registra los 9 tipos nuevos |
| C4 | Las fechas de la semana salen bien | `npm test` pasa con: el lunes de la semana de una fecha en hora argentina (incluido domingo 23:30 h de Buenos Aires, que en UTC ya es lunes); "Semana del 30/11 al 6/12" cruzando de mes; "Lunes 23/11"; rango "15:00 – 15:45" |
| C5 | Las páginas nuevas sin sesión no exponen nada | Playwright con el Supabase falso: `/semana`, `/terapias` y `/familia` sin sesión redirigen a `/` (303 o 302) |
| C6 | La vista previa no llega a producción | Sigue pasando `001·C6` |
| C7 | Sin secretos | Sigue pasando `001·C7` |
| C8 | La semana se entiende de un vistazo | Rúbrica (abajo) sobre capturas a 375 y 1280 px, claro y oscuro a 375, de las 4 pantallas nuevas, adjuntas al PR; contraste AA de los pares nuevos agregado a `scripts/contraste.mjs` |
| C9 | El operador puede ponerla en marcha solo | `README.md` tiene la sección "Migración 002" |

### Rúbrica de C8 (pasa si cumple todo)

1. En la semana, se ve en dos segundos qué hay hoy y a qué hora.
2. Terapias y eventos de la familia se distinguen sin leer el texto.
3. Cambiar de semana y volver a hoy se hace con un toque, con área táctil de 48 px.
4. Cargar una terapia con su horario entra en una sola pantalla en el celular.
5. Mismo lenguaje visual de la 001 (`decisions.md` `[diseño]`); español rioplatense; fechas en
   formato argentino.

## Decisiones

### Cerradas antes de delegar

- DECIDIDO por Claudio (2026-11-18): v1 = calendario primero; los cambios de turno son la 003.
- DECIDIDO por Claudio (2026-11-18): los dos adultos ven y cambian todo (`decisions.md`
  `[familia]`).

### Pendientes del operador (antes de aprobar)

- **La semana como inicio**. Propuesta: con familia, `/` lleva a la semana y la familia pasa a
  su propia pestaña. Alternativa: `/` sigue siendo la familia y la semana es una pestaña más.
- **Tipos de terapia**. Propuesta: la lista cerrada de la semilla, con "Otra". Alternativa: texto
  libre.
- **Eventos de la familia**. Propuesta: eventos semanales con título y hora (p. ej. "Retirar del
  colegio 14:30"), separados de las terapias. Alternativa: una nota de "salida del colegio" dentro
  de cada horario.
- **Datos del profesional**. Propuesta: nombre, especialidad y si está fuera de cartilla; sin
  teléfono ni mail, porque el contacto ya está en WhatsApp. Alternativa: sumar teléfono.

### Las decide quien implementa

- Si la semana necesita una isla de React o alcanza con links y formularios (registrar en
  `decisions.md`).
- Cómo se calcula el lunes de la semana en el servidor, respetando la zona argentina.

### Condiciones de parada (el agente para y pregunta)

- Algo exige guardar un dato fuera de la regla `[datos]`.
- Algo exige cambiar el comportamiento de `/familia` o de las invitaciones.
- Algo requiere un servicio pago, una cuenta nueva o claves reales.
- Un criterio contradice a otro, o aparece una decisión que ninguna lista cubre.

## Efectos que escapan del sistema

**Ninguno durante la implementación.** Correr `002_terapias.sql` en el Supabase real es un acto
del operador siguiendo el README.

## Fuera de alcance, con condición de reactivación

| Fuera | Se reactiva si |
|---|---|
| Cambios de un turno (una vez o por período) y avisos al otro adulto | Spec 003 |
| Terapias cada 15 días o con frecuencia irregular | Una terapia real del operador lo necesita |
| Vista de mes | Los adultos lo extrañan después de usar la semana |
| Exportar a Google Calendar | Los adultos lo piden |
| Borrar una terapia (en lugar de terminarla) | Se cargó una por error y molesta |
