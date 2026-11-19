# agenda-divergente — Arquitectura (as-built)

> Describe lo construido, nunca lo planeado — lo que falta vive en `specs/`.

## Stack

- Astro 7 con `@astrojs/vercel`, `output: 'server'`: todas las páginas se renderizan en el servidor porque dependen de la sesión. Sin islas de React: la única interactividad (copiar el link) es un `<script>` en `Inicio.astro`.
- Auth: Supabase Auth con Google vía `@supabase/ssr`; la sesión viaja en cookies (PKCE).
- Supabase: 7 tablas con RLS y sin acceso directo; todo pasa por funciones `security definer` con `search_path` vacío.
- Estilos: Material 3 hecho a mano. `src/styles/tokens.css` (generado desde la semilla `#2f8f83` por `scripts/generar-tokens.mjs`, claro y oscuro) y `src/styles/app.css` (componentes). Tipografía Figtree variable, autoalojada vía `@fontsource-variable/figtree`.

## Mapa

| Ruta | Qué es |
|---|---|
| `src/pages/index.astro` | `/`. Sin sesión: `Ingreso`. Con sesión sin familia: `CrearFamilia`. Con familia: `Inicio`. POST con `accion` = `crear_familia` \| `agregar_hijo` \| `invitar` |
| `src/pages/invitacion/[codigo].astro` | Invitación. Código con forma inválida o inexistente → 404. POST con sesión → `aceptar_invitacion` → 303 a `/` |
| `src/pages/auth/login.ts` | POST: arranca el OAuth de Google y vuelve a `next` |
| `src/pages/auth/callback.ts` | Canjea el código por la sesión, llama a `asegurar_perfil()` y sigue a `next` |
| `src/pages/auth/salir.ts` | POST: cierra la sesión |
| `src/components/` | `Ingreso`, `CrearFamilia`, `Inicio`, `Invitacion`, `BotonGoogle`, `Marca` (isotipo SVG) |
| `src/layouts/App.astro` | Barra superior (marca y "Salir" con sesión) y contenido de 640 px máximo |
| `src/lib/` | `supabase.ts` (cliente SSR, `rutaSegura`), `errores.ts` (claves de la base → texto), `whatsapp.ts`, `codigo.ts`, `familia.ts` (tipos, tope de 4 adultos, obras sociales del formulario) |
| `src/dev/vista-previa.astro` | Solo en `astro dev`: `/vista-previa/<pantalla>` con datos de ejemplo |
| `supabase/migrations/001_familias.sql` | Ver "Base" |
| `scripts/` | `generar-tokens.mjs` (`npm run tokens`), `contraste.mjs` (pares WCAG), `capturas.mjs` |
| `tests/db/` | `pg.ts` (Postgres embebido + shim), `shim.test.ts` (paso 0), `familias.test.ts` |
| `tests/app/` | Playwright contra `astro dev` con un Supabase falso (`stub-supabase.mjs`) |

## Base

| Tabla | Para qué |
|---|---|
| `obras_sociales` | Catálogo; semilla `osde` |
| `perfiles` | Adulto que entró con Google. `authenticated` lee solo su fila |
| `familias` | El espacio compartido |
| `miembros` | Adultos de cada familia; índice único por `perfil_id` (un adulto, una familia) |
| `invitaciones` | Código de 128 bits, vence a los 7 días, un solo uso |
| `hijos` | Nombre o apodo, obra social y plan. Nada más (`decisions.md` `[datos]`) |
| `movimientos` | `creo_familia`, `invito`, `se_unio`, `agrego_hijo`, `edito_hijo` |

| Función | Quién |
|---|---|
| `asegurar_perfil()`, `crear_familia(nombre)`, `mi_familia()`, `crear_invitacion()`, `aceptar_invitacion(codigo)`, `agregar_hijo(...)`, `editar_hijo(...)` | `authenticated` |
| `invitacion_publica(codigo)` | `anon` y `authenticated`: solo familia, quién invita y vigencia |

Las funciones lanzan claves (`sin_sesion`, `familia_llena`, `invitacion_vencida`…) que `src/lib/errores.ts` traduce. `_familia_de_quien_llama`, `_exigir_sesion` y `_limpio` son internas: sin `execute` para nadie.
