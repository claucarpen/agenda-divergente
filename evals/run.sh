#!/usr/bin/env bash
# Los evals del repo — un chequeo por criterio de aceptación de cada spec. Se corre: `evals/run.sh`
set -u

passed=0
failed=0
ok() { printf 'PASS %s\n' "$1"; passed=$((passed + 1)); }
ko() { printf 'FAIL %s\n' "$1"; failed=$((failed + 1)); }
ev() { printf '     | %s\n' "$1"; }

# Cada spec suma acá sus chequeos, una función por criterio, y los llama abajo.

# --- Spec 001: espacio de familia --------------------------------------------------------------

MIG=supabase/migrations/001_familias.sql

c0_paso0() {
  local out
  if out=$(npx vitest run --config vitest.db.config.ts tests/db/shim.test.ts 2>&1); then ok "001·C0 Postgres embebido + shim de Supabase"
  else ko "001·C0 paso 0"; ev "$(printf '%s' "$out" | tail -6)"; fi
}

c1_build() {
  local out
  if out=$(npm ci 2>&1 && PUBLIC_SUPABASE_URL=http://127.0.0.1:1 PUBLIC_SUPABASE_PUBLISHABLE_KEY=x npm run build 2>&1); then ok "001·C1 el proyecto compila"
  else ko "001·C1 el proyecto compila"; ev "$(printf '%s' "$out" | tail -5)"; fi
}

c2_migracion() {
  [ -f "$MIG" ] || { ko "001·C2 falta $MIG"; return; }
  local flat miss="" t f
  flat=$(tr '\n' ' ' < "$MIG" | tr -s ' ' | tr 'A-Z' 'a-z')
  for t in obras_sociales perfiles familias miembros invitaciones hijos movimientos; do
    printf '%s' "$flat" | grep -q "create table public.$t (" || miss="$miss tabla:$t"
    printf '%s' "$flat" | grep -q "alter table public.$t enable row level security" || miss="$miss rls:$t"
  done
  for f in asegurar_perfil crear_familia mi_familia crear_invitacion invitacion_publica aceptar_invitacion agregar_hijo editar_hijo; do
    printf '%s' "$flat" | grep -qE "create function public\.$f\([^;]*security definer set search_path = ''" || miss="$miss funcion:$f"
  done
  printf '%s' "$flat" | grep -qE "create policy [^;]* for (insert|update|delete|all) [^;]*to authenticated" && miss="$miss policy-escritura"
  grep -qiE 'diagnost|nacimiento|dni|document' "$MIG" && miss="$miss dato-prohibido"
  if [ -z "$miss" ]; then ok "001·C2 migración: 7 tablas con RLS, 8 funciones security definer, sin datos prohibidos"; else ko "001·C2 migración:$miss"; fi
}

c3_base() {
  local out
  if out=$(npm run -s test:db 2>&1); then ok "001·C3 + 002·C3 reglas y seguridad en la base"; ev "$(printf '%s' "$out" | grep -E 'Tests ')"
  else ko "001·C3 reglas y seguridad en la base"; ev "$(printf '%s' "$out" | grep -E 'FAIL|Error|Tests ' | head -8)"; fi
}

c4_whatsapp() {
  local out
  if out=$(npm test 2>&1); then ok "001·C4 + 002·C4 link de WhatsApp y fechas de la semana (Vitest)"; ev "$(printf '%s' "$out" | grep -E 'Tests ')"
  else ko "001·C4 Vitest"; ev "$(printf '%s' "$out" | tail -8)"; fi
}

c5_sin_sesion() {
  local out
  if out=$(npx playwright test --config playwright.app.config.ts 2>&1); then ok "001·C5 + 002·C5 páginas sin sesión (Playwright)"; ev "$(printf '%s' "$out" | grep -E 'passed')"
  else ko "001·C5 páginas sin sesión"; ev "$(printf '%s' "$out" | tail -8)"; fi
}

c6_sin_vista_previa() {
  [ -d .vercel/output ] || { ko "001·C6 no hay build (.vercel/output)"; return; }
  if grep -rqi 'vista-previa' .vercel/output; then ko "001·C6 la vista previa aparece en el build"
  else ok "001·C6 la vista previa no llega a producción"; fi
}

c7_secretos() {
  local hits
  hits=$(grep -rilE 'service_role|sb_secret' src supabase scripts tests 2>/dev/null)
  if [ -n "$hits" ]; then ko "001·C7 posibles secretos en:"; ev "$hits"
  elif git ls-files --error-unmatch .env >/dev/null 2>&1; then ko "001·C7 .env está versionado"
  else ok "001·C7 sin secretos"; fi
}

c8_contraste() {
  local out
  if out=$(node scripts/contraste.mjs 2>&1); then ok "001·C8 (parte automática) contraste AA de todos los pares, claro y oscuro"
  else ko "001·C8 contraste"; ev "$(printf '%s' "$out" | grep BAJO)"; fi
}

c9_readme() {
  local miss="" s
  for s in 'Login con Google' 'Migración 001'; do grep -q "^## $s" README.md || miss="$miss [$s]"; done
  if [ -z "$miss" ]; then ok "001·C9 README con las secciones del operador"; else ko "001·C9 faltan secciones:$miss"; fi
}

# --- Spec 002: terapias, horarios y la semana --------------------------------------------------

MIG2=supabase/migrations/002_terapias.sql

c2_002_migracion() {
  [ -f "$MIG2" ] || { ko "002·C2 falta $MIG2"; return; }
  local flat miss="" t f
  flat=$(tr '\n' ' ' < "$MIG2" | tr -s ' ' | tr 'A-Z' 'a-z')
  for t in tipos_terapia profesionales terapias horarios eventos_familia; do
    printf '%s' "$flat" | grep -q "create table public.$t (" || miss="$miss tabla:$t"
    printf '%s' "$flat" | grep -q "alter table public.$t enable row level security" || miss="$miss rls:$t"
  done
  for f in agregar_profesional editar_profesional agregar_terapia editar_terapia terminar_terapia agregar_horario \
           quitar_horario agregar_evento quitar_evento mis_terapias terapia semana; do
    printf '%s' "$flat" | grep -qE "create function public\.$f\([^;]*security definer set search_path = ''" || miss="$miss funcion:$f"
  done
  printf '%s' "$flat" | grep -qE "create policy [^;]* for (insert|update|delete|all) [^;]*to authenticated" && miss="$miss policy-escritura"
  grep -qiE 'diagnost|dni|document' "$MIG2" && miss="$miss dato-prohibido"
  grep -qiE 'drop (table|schema)' "$MIG2" && miss="$miss drop"
  if [ -z "$miss" ]; then ok "002·C2 migración: 5 tablas con RLS, 12 funciones security definer, sin datos prohibidos ni drops"; else ko "002·C2 migración:$miss"; fi
}

c9_002_readme() {
  if grep -q '^## Migración 002' README.md; then ok "002·C9 README con la sección Migración 002"; else ko "002·C9 falta la sección Migración 002"; fi
}

c0_paso0
c1_build
c2_migracion
c3_base
c4_whatsapp
c5_sin_sesion
c6_sin_vista_previa
c7_secretos
c8_contraste
c9_readme
c2_002_migracion
c9_002_readme

printf '\n%d pasan, %d fallan\n' "$passed" "$failed"
[ "$failed" -eq 0 ]
