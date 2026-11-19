// Páginas que requieren sesión y familia: sin sesión o sin familia, redirigen a `/`.
import type { AstroGlobal } from 'astro';
import type { Familia } from './familia';
import { supabaseServidor } from './supabase';

type ConFamilia =
  | { ok: true; supabase: ReturnType<typeof supabaseServidor>; familia: Familia }
  | { ok: false; respuesta: Response };

export async function exigirFamilia(Astro: AstroGlobal): Promise<ConFamilia> {
  const supabase = supabaseServidor(Astro.request, Astro.cookies);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, respuesta: Astro.redirect('/', 303) };
  const r = await supabase.rpc('mi_familia');
  if (r.error) return { ok: false, respuesta: new Response('Algo falló. Probá de nuevo en un rato.', { status: 503 }) };
  if (!r.data) return { ok: false, respuesta: Astro.redirect('/', 303) };
  return { ok: true, supabase, familia: r.data as Familia };
}

// Lee un campo de un formulario como texto recortado; vacío → null.
export const campo = (form: FormData, k: string): string | null => {
  const v = String(form.get(k) ?? '').trim();
  return v === '' ? null : v;
};
export const campoNumero = (form: FormData, k: string): number | null => {
  const v = campo(form, k);
  return v === null || !/^-?\d+$/.test(v) ? null : Number(v);
};
