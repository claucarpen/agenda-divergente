// Textos de los avisos (spec 003). Funciones puras: sin el nombre del hijo ni la nota, que no viajan
// en el aviso ni se ven en la pantalla bloqueada.
import { DIAS, lunesDe } from './fechas';

export type Aviso = { titulo: string; cuerpo: string; url: string };

const DIAS_AVISO = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const diaDe = (iso: string) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
const ddmm = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
// "jue 26/11".
export const fechaAviso = (iso: string) => `${DIAS_AVISO[diaDe(iso) - 1]} ${ddmm(iso)}`;
// "los jueves", "los sábados".
const losDias = (dia: number) => `los ${DIAS[dia - 1].toLowerCase()}${dia <= 5 ? '' : 's'}`;
const semanaDe = (iso: string) => `/semana?desde=${lunesDe(iso)}`;
const TITULO = 'Cambio en la semana';
const firma = (quien: string, verbo = 'cambió') => `Lo ${verbo} ${quien}`;

export function avisoMoverUnaVez(tipo: string, fecha: string, hora: string, nuevaFecha: string, nuevaHora: string, quien: string): Aviso {
  return { titulo: TITULO, cuerpo: `${tipo}: ${fechaAviso(fecha)} ${hora} → ${fechaAviso(nuevaFecha)} ${nuevaHora}. ${firma(quien)}`, url: semanaDe(nuevaFecha) };
}

export function avisoCancelarUnaVez(tipo: string, fecha: string, hora: string, quien: string): Aviso {
  return { titulo: TITULO, cuerpo: `${tipo}: no hay el ${fechaAviso(fecha)} (${hora}). ${firma(quien)}`, url: semanaDe(fecha) };
}

export function avisoPeriodo(tipo: string, desde: string, hasta: string, dia: number, hora: string,
  nuevo: { dia: number; hora: string } | null, quien: string): Aviso {
  const rango = `del ${ddmm(desde)} al ${ddmm(hasta)}`;
  const cuerpo = nuevo
    ? `${tipo}: ${rango} pasa de ${losDias(dia)} ${hora} a ${losDias(nuevo.dia)} ${nuevo.hora}. ${firma(quien)}`
    : `${tipo}: no hay ${losDias(dia)} ${rango}. ${firma(quien)}`;
  return { titulo: TITULO, cuerpo, url: semanaDe(desde) };
}

export function avisoAnular(tipo: string, dia: number, hora: string, desde: string, quien: string): Aviso {
  return { titulo: TITULO, cuerpo: `${tipo}: se deshizo un cambio, vuelve a ${losDias(dia)} ${hora}. ${firma(quien)}`, url: semanaDe(desde) };
}

export function avisoHorario(tipo: string, dia: number, hora: string, agregado: boolean, desde: string, quien: string): Aviso {
  const cuerpo = agregado
    ? `${tipo}: nuevo horario ${losDias(dia)} ${hora}. ${firma(quien, 'cargó')}`
    : `${tipo}: ya no va ${losDias(dia)} ${hora}. ${firma(quien)}`;
  return { titulo: TITULO, cuerpo, url: semanaDe(desde) };
}

export function avisoTerminar(tipo: string, hasta: string, quien: string): Aviso {
  return { titulo: TITULO, cuerpo: `${tipo} termina el ${fechaAviso(hasta)}. ${firma(quien, 'cargó')}`, url: semanaDe(hasta) };
}

export function avisoEvento(titulo: string, dia: number, hora: string, agregado: boolean, hoy: string, quien: string): Aviso {
  const cuerpo = agregado
    ? `Nuevo evento: ${titulo}, ${losDias(dia)} ${hora}. ${firma(quien, 'cargó')}`
    : `Se quitó el evento ${titulo} (${losDias(dia)} ${hora}). ${firma(quien)}`;
  return { titulo: TITULO, cuerpo, url: semanaDe(hoy) };
}

export function avisoPrueba(): Aviso {
  return { titulo: 'Avisos activos', cuerpo: 'Así te van a llegar los cambios de la semana.', url: '/familia' };
}
