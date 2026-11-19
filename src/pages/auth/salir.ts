// POST desde "Salir": cierra la sesión (borra las cookies) y vuelve al inicio.
import type { APIRoute } from 'astro';
import { supabaseServidor } from '../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  await supabaseServidor(request, cookies).auth.signOut();
  return redirect('/', 303);
};
