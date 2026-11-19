# Agenda Divergente

Un solo lugar donde los dos padres organizan la semana de terapias de su hijo y los trámites con
la obra social: calendario con cambios que avisan al otro, y vencimientos de papeles.

El para qué y el estado viven en el brain (`orgs/personal/initiatives/agenda-divergente/`). Este
repo es el cuerpo: specs, decisiones y lo construido. Cómo se trabaja acá: `CLAUDE.md`.

## Hoja de ruta de la v1

| Spec | Qué |
|---|---|
| 001 | Espacio de familia: los dos padres entran con Google, uno invita al otro, cargan al hijo |
| 002 | Terapias y horarios recurrentes; la semana a la vista |
| 003 | Cambios de turno (una vez o por período), web app instalable y avisos push |
| 004 | Papeles y vencimientos, con el cron diario de alertas |

Cada una se escribe y se aprueba antes de construirla (Gate 1).

## Desarrollo

```bash
npm ci
cp .env.example .env   # completar con el proyecto de Supabase
npm run dev
```

| Comando | Qué hace |
|---|---|
| `evals/run.sh` | Corre todos los criterios de las specs |
| `npm run test:db` | Tests de la base sobre un Postgres embebido (sin Docker) |
| `npm test` | Tests unitarios |
| `npm run test:app` | Páginas sin sesión con Playwright contra un Supabase falso (`CHROMIUM_PATH` opcional) |
| `npm run tokens` | Regenera los colores de Material 3 desde la semilla |

## Login con Google

Pasos del operador, una sola vez:

1. **Supabase**: crear el proyecto (plan Free). Copiar la URL y la *publishable key* de Settings → API a `.env` y a las variables del proyecto en Vercel (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
2. **Google Cloud**: APIs y servicios → Pantalla de consentimiento OAuth (tipo Externo, nombre "Agenda Divergente") → Credenciales → Crear ID de cliente OAuth → Aplicación web. En "URIs de redireccionamiento autorizados", pegar la *Callback URL* que muestra Supabase en Authentication → Providers → Google.
3. **Supabase** → Authentication → Providers → Google: activar y pegar el Client ID y el Client Secret de Google.
4. **Supabase** → Authentication → URL Configuration: *Site URL* = la URL de Vercel; en *Redirect URLs* sumar `https://<tu-app>.vercel.app/auth/callback` y `http://localhost:4321/auth/callback`.
5. Probar: entrar desde la app con tu cuenta; después, que el otro adulto entre desde el link de invitación.

## Migración 001

En Supabase → SQL Editor, pegar y correr completo `supabase/migrations/001_familias.sql`. Crea las 7 tablas con Row Level Security, las funciones y la obra social OSDE. Se corre una sola vez, antes del primer login.

## Migración 002

Después de la 001, en Supabase → SQL Editor, pegar y correr completo `supabase/migrations/002_terapias.sql`. Crea los tipos de terapia, profesionales, terapias, horarios y eventos de la familia, con Row Level Security, y la función que arma la semana. Se corre una sola vez.

## Avisos (claves VAPID)

Los avisos al celular usan Web Push con un par de claves propias. Una sola vez:

1. En tu compu, dentro del repo: `npx web-push generate-vapid-keys`. Muestra una *Public Key* y una *Private Key*.
2. En Vercel → el proyecto → Settings → Environment Variables, cargar:
   - `PUBLIC_VAPID_PUBLIC_KEY` = la *Public Key*.
   - `VAPID_PRIVATE_KEY` = la *Private Key*. **Es secreta**: nunca va en `.env.example`, en el código ni en un mensaje.
   - `VAPID_SUBJECT` = `mailto:` y tu mail (por ejemplo `mailto:tu-mail@gmail.com`).
3. Volver a desplegar (las variables `PUBLIC_*` se leen al construir).
4. En cada celular: abrir la app → Familia → Avisos → **Activar avisos** → **Probar aviso**.
   - **Android**: desde Chrome alcanza. Revisar que Chrome tenga permitidas las notificaciones y sin restricciones de batería.
   - **iPhone**: primero instalar la app (Safari → Compartir → Agregar a inicio) y activar los avisos abriéndola desde la pantalla de inicio.

Si cambiás las claves, todos los celulares tienen que volver a activar los avisos.

## Migración 003

Después de la 002, en Supabase → SQL Editor, pegar y correr completo `supabase/migrations/003_cambios.sql`. Crea los cambios de turno y las suscripciones de avisos, y actualiza la función de la semana para que muestre los cambios. Se corre una sola vez.
