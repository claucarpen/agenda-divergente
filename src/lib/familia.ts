// Formas que devuelven las funciones de `001_familias.sql`.
export type Adulto = { nombre: string; soy_yo: boolean; avatar?: string | null };
export type Hijo = { id: string; nombre: string; plan: string | null; obra_social_id: string; obra_social: string; avatar?: string | null };
// `recordatorios` (spec 004): si quien llama tiene los recordatorios prendidos.
export type Familia = { id: string; nombre: string; adultos: Adulto[]; hijos: Hijo[]; recordatorios?: boolean };
export type InvitacionPublica = { familia: string; invita: string; vigente: boolean };

export const MAX_ADULTOS = 4;

// Obras sociales que ofrece el formulario; deben existir en la semilla de `obras_sociales`.
export const OBRAS_SOCIALES = [{ id: 'osde', nombre: 'OSDE' }];
