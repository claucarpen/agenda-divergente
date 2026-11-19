// Traduce los mensajes-clave que lanzan las funciones de `001_familias.sql` a texto para la persona.
const TEXTOS: Record<string, string> = {
  sin_sesion: 'Tu sesión se venció. Entrá con Google de nuevo.',
  nombre_invalido: 'Revisá el nombre: no puede quedar vacío ni ser tan largo.',
  plan_invalido: 'El plan puede tener hasta 30 caracteres.',
  obra_social_invalida: 'Elegí una obra social de la lista.',
  ya_tiene_familia: 'Ya sos parte de una familia.',
  sin_familia: 'Primero creá tu familia o sumate a una.',
  no_existe: 'Esta invitación no existe.',
  invitacion_usada: 'Esta invitación ya se usó.',
  invitacion_vencida: 'Esta invitación venció.',
  otra_familia: 'Ya sos parte de otra familia.',
  familia_llena: 'Esta familia ya tiene 4 adultos, el máximo.',
  hijo_ajeno: 'No encontramos a ese hijo en tu familia.',
  login: 'No pudimos entrar con Google. Probá de nuevo.',
};

export const ERROR_GENERICO = 'Algo falló. Probá de nuevo en un rato.';

export function claveDeError(error: { message?: string } | null | undefined): string | null {
  const m = error?.message ?? '';
  return Object.hasOwn(TEXTOS, m) ? m : null;
}

export function textoDeError(error: { message?: string } | null | undefined): string {
  const clave = claveDeError(error);
  return clave ? TEXTOS[clave] : ERROR_GENERICO;
}
