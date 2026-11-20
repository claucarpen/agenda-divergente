---
status: implementada
depends_on: [003]
---

# 004 — Eventos con fecha, recordatorios y avatares ilustrados

Tres ajustes que salieron de usar la app unos días en familia:

1. **Eventos con fecha propia**, por fuera de las terapias: un cumpleaños, un acto, una salida. Con
   hora o de "todo el día", con una nota corta, y en la semana junto a las terapias.
2. **Recordatorios**: el día anterior a cada evento con fecha, y 10 minutos antes de cada turno de
   terapia y de cada evento con hora.
3. **Avatares ilustrados** para cada adulto y cada hijo: personajes propios elegidos de una galería,
   sin subir fotos.

**Tipo**: feature · **Flujo**: design-first (el paso 0 despeja el riesgo de despertar la app cada
minuto sin un servicio pago ni una clave de servicio de Supabase)

## Contexto

- Uso real (2026-11-19): la familia quiere centralizar en la semana también lo que no es terapia
  (cumples, actos). Los "eventos de la familia" de la 002 solo se repiten cada semana.
- La 003 dejó fuera de alcance el recordatorio previo a cada terapia hasta tener un reloj más
  frecuente que el diario. El operador lo pide ahora: 10 minutos antes.
- Reglas que aplican: `decisions.md` → `[datos]`, `[familia]`, `[avisos]`, `[diseño]`, `[stack]`.
  Los avatares ilustrados **no** tocan `[datos]`: no se sube ningún archivo.

## Estado previo

Ver `ARCHITECTURE.md`: migraciones 001 a 003, `semana(lunes)` arma la semana con terapias, cambios
y eventos semanales; avisos inmediatos por Web Push desde el servidor de Astro con
`destinatarios_aviso()`. No hay ninguna tarea programada: el cron diario de `[avisos]` nunca se
creó.

## Paso 0 — prueba de factibilidad (antes de construir)

En el Postgres embebido, con un endpoint HTTP falso del test:

1. La función `tomar_recordatorios(secreto, ahora)` devuelve los recordatorios que tocan y, llamada
   dos veces con el mismo `ahora`, la segunda devuelve vacío (no se manda dos veces).
2. Con un secreto equivocado → `secreto_invalido`, sin devolver nada.
3. El endpoint `/api/recordatorios` de Astro rechaza con 401 una llamada sin el header correcto.

Contra el proyecto real de Supabase (solo lectura): `pg_cron` y `pg_net` están disponibles.

Si algo del paso 0 no pasa, **parar y reportar** con alternativas. No construir nada más.

## Qué se construye

### Base de datos — `supabase/migrations/004_eventos_recordatorios_avatares.sql`

| Tabla | Columnas clave |
|---|---|
| `eventos_fecha` | `id`, `familia_id`, `hijo_id` (nullable: de la familia), `titulo` (1-60), `fecha date`, `hora time` (nullable = todo el día), `nota` (1-80, nullable), `creado_por`, `creado_en` |
| `recordatorios_enviados` | `clave text primary key` (p. ej. `10min:<horario_id>:<fecha>`), `familia_id`, `enviado_en` |
| `config_privada` | `clave text primary key`, `valor text`. Sin ningún `grant` para `anon` ni `authenticated`: guarda el secreto del reloj |

Columnas nuevas: `perfiles.avatar text` y `hijos.avatar text`, nullable, con `check` contra la lista
cerrada de ids de la galería. `perfiles.recordatorios boolean not null default true`.

`movimientos.tipo` suma `agrego_evento_fecha`, `edito_evento_fecha`, `borro_evento_fecha`,
`eligio_avatar`.

| Función | Qué hace |
|---|---|
| `agregar_evento_fecha(titulo, fecha, hora, hijo_id, nota)` | Valida familia, título y nota; la fecha no puede ser anterior a hoy |
| `editar_evento_fecha(id, titulo, fecha, hora, hijo_id, nota)` | Solo eventos de la propia familia; devuelve el evento previo para el aviso |
| `borrar_evento_fecha(id)` | Borra de verdad; devuelve el evento borrado para el aviso |
| `elegir_avatar(avatar)` | Avatar de quien llama; `null` vuelve a la inicial |
| `elegir_avatar_hijo(hijo_id, avatar)` | Solo hijos de la propia familia |
| `cambiar_recordatorios(activos)` | Prende o apaga los recordatorios de quien llama |
| `tomar_recordatorios(secreto, ahora)` | **Única función para `anon`**. Compara `secreto` con `config_privada`; si no coincide, `secreto_invalido`. Calcula los recordatorios que tocan para **todas** las familias, los registra en `recordatorios_enviados` en la misma transacción y devuelve por cada uno: el texto armado y las suscripciones (endpoint y claves) de los adultos de esa familia con `recordatorios = true`. Nunca emails ni nombres de hijos |

**Qué toca en `tomar_recordatorios`** (todo en `America/Argentina/Buenos_Aires`):

- **10 minutos antes**: cada turno de terapia de hoy (con los cambios de la 003 aplicados: el
  cancelado no avisa, el movido avisa en su hora nueva), cada evento semanal y cada evento con fecha
  que tenga hora, cuyo inicio caiga entre `ahora` y `ahora + 10 min` y no esté en
  `recordatorios_enviados`. La ventana tolera que el reloj se saltee un minuto.
- **El día anterior**: a partir de las 20:00, cada evento con fecha de mañana (con hora o de todo el
  día) que no esté en `recordatorios_enviados`.

**`semana(lunes)` suma los eventos con fecha**: los de todo el día encabezan su día; los que tienen
hora se ordenan con las terapias. Clase `evento_fecha`, con su nota.

`mi_familia()` devuelve el avatar de cada adulto y de cada hijo, y si quien llama tiene los
recordatorios activos.

### El reloj — Supabase `pg_cron` + `pg_net`

- Un trabajo de `pg_cron` cada minuto llama con `pg_net` a
  `POST https://agenda-divergente.vercel.app/api/recordatorios` con
  `Authorization: Bearer <secreto>`. El secreto vive en Supabase Vault y en la variable
  `CRON_SECRET` de Vercel; nunca en el repo.
- `src/pages/api/recordatorios.ts`: verifica el header contra `CRON_SECRET` (si no coincide, 401),
  llama a `tomar_recordatorios(CRON_SECRET, now())` con la clave publicable y manda cada aviso con
  `web-push`, con el mismo manejo de errores de la 003 (404 o 410 borran la suscripción, un error no
  frena a los demás).
- El trabajo de `pg_cron` **no** va en la migración (cambia según el ambiente): va en
  `supabase/cron/recordatorios.sql` con el secreto como parámetro, y el README explica cómo
  correrlo.

### Avisos inmediatos

Agregar, editar o borrar un evento con fecha dispara el aviso de la 003 a todos los adultos.
Textos (funciones puras en `textos-aviso.ts`):

| Caso | Título | Cuerpo |
|---|---|---|
| Evento nuevo | "Nuevo evento" | "Cumple de Sofi: sáb 6/12 17:00. Lo agregó Laura" |
| Evento de todo el día | "Nuevo evento" | "Acto de fin de año: vie 12/12, todo el día. Lo agregó Laura" |
| Editado / borrado | "Cambio en la semana" | "Cumple de Sofi: sáb 6/12 17:00 → dom 7/12 16:00. Lo cambió Claudio" / "… se quitó. Lo quitó Claudio" |
| 10 min antes | "En 10 minutos" | "Terapia ocupacional, 15:00 · Consultorio Rivadavia" / "Cumple de Sofi, 17:00" |
| Día anterior | "Mañana" | "Cumple de Sofi, 17:00" / "Acto de fin de año, todo el día" |

Ningún aviso lleva la nota ni el nombre del hijo cargado en la ficha (el título del evento lo
escribe la familia y sí viaja). Tocar el aviso abre `/semana` en la semana del evento.

### Aplicación

- **Agregar evento** (`/evento`, página propia como `/turno`): botón "Agregar evento" en `/semana`.
  Campos: título, fecha (por defecto hoy, o el día desde el que se abrió), "Todo el día" o una hora,
  para quién (cada hijo o "Toda la familia"), nota opcional (80 caracteres, con la ayuda "No pongas
  datos de salud"). Tocar un evento con fecha en la semana abre la misma página para editarlo o
  borrarlo.
- **Semana**: los eventos con fecha tienen su propio estilo, distinguible de las terapias y de los
  eventos semanales; los de todo el día van arriba del día como una franja.
- **Avatares**: en `/familia`, tocar el avatar de un adulto (solo el propio) o de un hijo abre
  `/avatar` con la galería; "Usar la inicial" vuelve al círculo con la letra. El avatar se ve en
  `/familia`, en la cabecera de la semana (el hijo) y en "Lo agregó / Lo cambió" donde aparezca.
- **Galería**: 13 personajes originales en SVG, propios del proyecto, en la paleta de Material 3 de
  la app (animales y criaturas simples con cara amable). Versionados en `public/avatares/`, cada uno
  con nombre accesible ("Zorro", "Pulpo", …). **No** copian ni imitan personajes de terceros.
- **Avisos** (`/familia`): un interruptor "Recordatorios (10 minutos antes y el día anterior)" por
  adulto, para el propio.
- **Vista previa de diseño**: suma `evento-nuevo`, `semana-con-eventos`, `galeria-avatares` y
  `familia-con-avatares`.
- `README.md`: secciones "Migración 004" y "Recordatorios (reloj de Supabase)".

## Criterios de aceptación y sus evals

Los deterministas se agregan a `evals/run.sh`. **Los de la 001 a la 003 siguen y deben pasar.**

| # | Criterio | Eval |
|---|---|---|
| C0 | El reloj es seguro e idempotente | Tests del paso 0 |
| C1 | Compila y no rompe nada | `evals/run.sh` completo: 0 fallan |
| C2 | La migración tiene la forma pedida | `grep` sobre `004_…sql`: las 3 tablas con RLS; las 7 funciones con `security definer` y `set search_path`; `config_privada` sin `grant`; `tomar_recordatorios` es la única con `execute` para `anon`; sin `drop table`; ninguna columna de archivo, URL de imagen ni `bytea` |
| C3 | Las reglas y la seguridad funcionan en la base | `npm run test:db` pasa con, como mínimo: evento de otra familia → `ajeno` · fecha pasada → rechazo · nota de más de 80 → rechazo · `semana` muestra el evento con hora en su lugar y el de todo el día arriba · avatar fuera de la lista → rechazo · avatar de un hijo ajeno → rechazo · `tomar_recordatorios`: turno de 15:00 con `ahora` 14:51 → sale; con 14:49 → no; segunda llamada → vacío; turno cancelado → no; turno movido → en la hora nueva; evento de mañana a las 20:00 → sale "Mañana", a las 19:59 → no; evento de todo el día → solo "Mañana", nunca "En 10 minutos"; adulto con recordatorios apagados → sin su suscripción; nunca suscripciones de otra familia en el recordatorio de una · `anon` no lee ninguna tabla nueva · `movimientos` registra los 4 tipos nuevos |
| C4 | Los avisos dicen lo correcto | `npm test` pasa con los textos de la tabla, con fechas "sáb 6/12" y horas "17:00"; nunca la nota ni el nombre del hijo de la ficha; la URL apunta a `/semana?desde=<lunes del evento>` |
| C5 | El endpoint y las páginas se defienden | Playwright o Vitest: `/api/recordatorios` sin header o con uno equivocado → 401 y no llama a la base; `/evento` y `/avatar` sin sesión redirigen a `/` |
| C6 | La vista previa no llega a producción | Sigue pasando `001·C6` |
| C7 | Sin secretos | Sigue pasando `001·C7` y `003·C7`, más: ningún `CRON_SECRET=` con valor en el repo; `supabase/cron/recordatorios.sql` recibe el secreto como parámetro |
| C8 | Cargar un cumple es más rápido que la heladera | Rúbrica (abajo) sobre capturas a 375 y 1280 px, claro y oscuro a 375, de las 4 pantallas nuevas; contraste AA de los pares nuevos en `scripts/contraste.mjs` |
| C9 | El operador puede ponerla en marcha | `README.md` tiene "Migración 004" y "Recordatorios (reloj de Supabase)" |

### Rúbrica de C8 (pasa si cumple todo)

1. Desde la semana, cargar "Cumple de Sofi, sábado 17 h" lleva un toque más título, fecha y hora.
2. En la semana, un evento con fecha se distingue de una terapia y de un evento semanal sin leer.
3. Los avatares se reconocen a 40 px y ninguno se parece a un personaje conocido.
4. Mismo lenguaje visual de la 001 a la 003; español rioplatense; área táctil de 48 px.

## Decisiones

### Cerradas antes de delegar

- DECIDIDO por Claudio (2026-11-19): eventos con fecha propia, con hora opcional ("todo el día") y
  nota corta.
- DECIDIDO por Claudio (2026-11-19): agregar, cambiar o borrar un evento avisa a todos los adultos,
  como los turnos.
- DECIDIDO por Claudio (2026-11-19): recordatorio el día anterior a cada evento con fecha, y 10
  minutos antes de cualquier turno de terapia o evento.
- DECIDIDO por Claudio (2026-11-19): el reloj de los recordatorios es `pg_cron` + `pg_net` de
  Supabase; no Vercel Pro ni un servicio externo.
- DECIDIDO por Claudio (2026-11-19): avatares ilustrados elegidos de una galería, sin subir fotos;
  la regla `[datos]` no cambia.

- DECIDIDO por Claudio (2026-11-19, al aprobar): el recordatorio del día anterior sale a las 20:00.
- DECIDIDO por Claudio (2026-11-19, al aprobar): avatares para cada adulto y cada hijo; cada adulto
  elige el suyo y el de los hijos.
- DECIDIDO por Claudio (2026-11-19, al aprobar): cada adulto puede apagar sus recordatorios; vienen
  prendidos.

### Las decide quien implementa

- Cómo se dibujan los 13 personajes (a mano en SVG, dentro de la paleta).
- Cómo se cruza en SQL la hora de Buenos Aires con `ahora` (registrar en `decisions.md`).

### Condiciones de parada (el agente para y pregunta)

- El paso 0 no pasa, o `pg_cron` / `pg_net` no están disponibles en el proyecto.
- Mandar recordatorios exige una clave de servicio de Supabase o cualquier secreto en el navegador.
- Algo exige guardar un dato fuera de la regla `[datos]`.
- Algo requiere un servicio pago o una cuenta nueva.
- Un criterio contradice a otro, o aparece una decisión que ninguna lista cubre.

## Efectos que escapan del sistema

**Ninguno durante la implementación**: todo se prueba en el Postgres embebido y con servicios
falsos. Al poner en marcha, con el OK del operador para cada paso: correr `004_…sql` en Supabase,
habilitar `pg_cron` y `pg_net`, generar el secreto y guardarlo en Vault y en `CRON_SECRET` de
Vercel, y crear el trabajo de cada minuto. Desde ahí, la app manda recordatorios reales a los
celulares de la familia.

## Fuera de alcance, con condición de reactivación

| Fuera | Se reactiva si |
|---|---|
| Foto real como avatar | La familia lo pide; exige cambiar `[datos]` con almacenamiento privado y sin metadatos |
| Elegir cuántos minutos antes llega el recordatorio | 10 minutos resulta poco o mucho en la práctica |
| Eventos que se repiten cada año (cumples) | Cargar el mismo cumple cada año molesta |
| Invitar a gente de afuera a un evento | La familia quiere compartir eventos con otros adultos |
| Papeles y vencimientos | Es la spec 005 |

## Evidencia de implementación (2026-11-19)

Rama `spec/004-eventos-recordatorios-avatares`. Decisiones nuevas en `decisions.md` del 2026-11-19:
`[avisos]` reloj con `pg_cron` (reemplaza la parte del cron diario de Vercel de `[avisos]`),
`[avisos]` secreto en `config_privada`, `[avisos]` el reloj no borra suscripciones vencidas,
`[datos]` avatares de galería cerrada y `[stack]` hora local en los recordatorios.

### Desvíos de la spec

- `tomar_recordatorios` devuelve las partes del texto (tipo, título, fecha, hora, lugar) y el texto lo
  arma `avisoRecordatorio` en `textos-aviso.ts`, para que C4 lo pruebe con Vitest como los demás.
- El secreto vive solo en `config_privada` (no en Vault): lo leen la función y el trabajo de
  `pg_cron`; los tests usan el mismo esquema.
- Un 404 o 410 en un recordatorio no borra la suscripción: eso exigiría una segunda función para
  `anon`. La borra el próximo aviso inmediato.
- Fecha pasada lanza `fecha_pasada` (y no `fecha_invalida`, que en la 002 significa "antes del inicio
  de la terapia").

### Paso 0

Pasó antes de construir la aplicación: `tests/db/eventos-recordatorios.test.ts` ("paso 0") prueba
que una segunda llamada con el mismo `ahora` devuelve vacío y que un secreto equivocado o vacío
lanza `secreto_invalido`; `src/lib/recordatorios.test.ts` prueba el 401 sin header, con uno
equivocado o sin `CRON_SECRET`, sin llamar a la base. En el proyecto real, `pg_cron` 1.6.4 y
`pg_net` 0.20.4 figuran disponibles (sin instalar) y Vault está instalado. El primer intento falló
la idempotencia: la limpieza comparaba contra `ahora` y no contra `now()` (`learnings/`).

### `evals/run.sh`

```
PASS 001·C0 Postgres embebido + shim de Supabase
PASS 001·C1 el proyecto compila
PASS 001·C2 migración: 7 tablas con RLS, 8 funciones security definer, sin datos prohibidos
PASS 001·C3 a 004·C3 reglas y seguridad en la base
     |       Tests  82 passed (82)
PASS 001·C4 a 004·C4 WhatsApp, fechas, avisos y recordatorios (Vitest)
     |       Tests  24 passed (24)
PASS 001·C5 a 004·C5 sin sesión, instalable y sin scroll horizontal (Playwright)
     |   15 passed
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
PASS 004·C0 el reloj exige el secreto, no repite recordatorios y el endpoint responde 401 sin header
PASS 004·C2 migración: 3 tablas con RLS, 7 funciones security definer, solo tomar_recordatorios para anon, sin archivos
PASS 004·C7 el secreto del reloj no está en el repo y el SQL de pg_cron lo recibe como parámetro
PASS 004·C9 README con Migración 004 y Recordatorios

20 pasan, 0 fallan
```

C2 y C7 se probaron en negativo: con `evento_fecha` concedida a `anon` falla C2; con un archivo que
lee `import.meta.env.CRON_SECRET` fuera del endpoint, o con `CRON_SECRET=<valor>`, falla C7.

### C8 — rúbrica

Capturas en `docs/capturas/004/` (4 pantallas a 375 y 1280 px, y a 375 px en modo oscuro).

1. Cargar un cumple: "+ Agregar evento" en la semana → título, día (ya en el día de hoy o el lunes)
   y hora → "Guardar evento". Un toque más los tres campos. ✓
2. Evento con fecha: tarjeta blanca con borde terciario y etiqueta "Evento"; terapia: relleno
   verde; evento semanal: relleno azul con borde izquierdo; todo el día: franja azul oscura arriba
   del día. ✓
3. Los 13 personajes se distinguen a 40 px (galería renderizada a 96 y 40 px) y son originales del
   proyecto. ✓
4. Mismos tokens; contraste AA de los 5 pares nuevos en claro y oscuro; botones de 48 px. ✓
