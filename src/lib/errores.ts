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
  ajeno: 'No encontramos eso en tu familia.',
  tipo_invalido: 'Elegí un tipo de terapia de la lista.',
  telefono_invalido: 'Revisá el teléfono: solo números, espacios, +, - y paréntesis.',
  modalidad_invalida: 'Elegí una modalidad de la lista.',
  lugar_invalido: 'El lugar puede tener hasta 80 caracteres.',
  dia_invalido: 'Elegí un día de la semana.',
  hora_invalida: 'Revisá la hora.',
  duracion_invalida: 'La duración va de 15 a 240 minutos.',
  terapia_terminada: 'Esa terapia ya terminó.',
  fecha_invalida: 'Revisá la fecha: no puede ser anterior al inicio de la terapia.',
  titulo_invalido: 'El título no puede quedar vacío ni pasar de 60 caracteres.',
  no_es_lunes: 'La semana empieza un lunes.',
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
