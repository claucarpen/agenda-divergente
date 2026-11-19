// Fechas de la semana en hora argentina. Las fechas viajan como texto ISO `AAAA-MM-DD`.
export const ZONA = 'America/Argentina/Buenos_Aires';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

// Fecha a mediodía UTC: sumar días o leer el día de la semana nunca cruza de fecha.
const aDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const aIso = (d: Date) => d.toISOString().slice(0, 10);

export function esFechaIso(s: string | null | undefined): s is string {
  if (typeof s !== 'string' || !ISO_RE.test(s)) return false;
  const d = aDate(s);
  return !Number.isNaN(d.getTime()) && aIso(d) === s;
}

// Hoy en Argentina, para un instante dado.
export function hoyEnArgentina(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}

export function sumarDias(iso: string, dias: number): string {
  const d = aDate(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return aIso(d);
}

// 1 = lunes … 7 = domingo.
export function diaSemana(iso: string): number {
  return ((aDate(iso).getUTCDay() + 6) % 7) + 1;
}

export function lunesDe(iso: string): string {
  return sumarDias(iso, 1 - diaSemana(iso));
}

const ddmm = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// "Semana del 23 al 29/11"; si cruza de mes, "Semana del 30/11 al 6/12".
export function tituloSemana(lunes: string): string {
  const domingo = sumarDias(lunes, 6);
  const mismoMes = lunes.slice(0, 7) === domingo.slice(0, 7);
  return `Semana del ${mismoMes ? Number(lunes.slice(8, 10)) : ddmm(lunes)} al ${ddmm(domingo)}`;
}

// "Lunes 23/11".
export const nombreDia = (iso: string) => `${DIAS[diaSemana(iso) - 1]} ${ddmm(iso)}`;

// "15:00 – 15:45".
export const rangoHorario = (inicio: string, fin: string) => `${inicio} – ${fin}`;

// "23/11/2026".
export const fechaCorta = (iso: string) => `${ddmm(iso)}/${iso.slice(0, 4)}`;
