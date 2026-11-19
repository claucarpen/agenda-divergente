// Describe un cambio en una línea para la interfaz (no para el aviso, que vive en textos-aviso.ts).
import { DIAS, diaCorto } from './fechas';
import type { Cambio } from './terapias';

const ddmm = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

export function describirCambio(c: Cambio): string {
  if (c.alcance === 'una_vez') {
    return c.accion === 'cancelar'
      ? `No hay el ${diaCorto(c.fecha!)} (${c.hora})`
      : `${diaCorto(c.fecha!)} ${c.hora} → ${diaCorto(c.nueva_fecha!)} ${c.nueva_hora}`;
  }
  const rango = `Del ${ddmm(c.desde!)} al ${ddmm(c.hasta!)}`;
  return c.accion === 'cancelar'
    ? `${rango}: no hay los ${DIAS[c.dia_semana - 1].toLowerCase()}`
    : `${rango}: ${DIAS[c.dia_semana - 1].toLowerCase()} ${c.hora} → ${DIAS[c.nuevo_dia_semana! - 1].toLowerCase()} ${c.nueva_hora}`;
}
