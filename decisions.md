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
