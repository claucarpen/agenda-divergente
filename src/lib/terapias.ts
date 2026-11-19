// Formas que devuelven las funciones de `002_terapias.sql` y textos de la interfaz.
export type Horario = { id: string; dia_semana: number; hora: string; duracion_min: number; desde: string };
export type Terapia = {
  id: string; estado: 'activa' | 'terminada'; desde: string; hasta: string | null;
  modalidad: Modalidad; lugar: string | null; tipo_id: string; tipo: string;
  hijo_id: string; hijo: string; profesional_id: string; profesional: string; telefono: string | null;
  horarios: Horario[];
};
export type Profesional = { id: string; nombre: string; tipo_id: string; tipo: string; telefono: string | null; fuera_de_cartilla: boolean };
export type Evento = { id: string; titulo: string; dia_semana: number; hora: string; hijo: string | null };
export type TipoTerapia = { id: string; nombre: string };
export type MisTerapias = { terapias: Terapia[]; profesionales: Profesional[]; eventos: Evento[]; tipos: TipoTerapia[] };

export type OcurrenciaTerapia = {
  clase: 'terapia'; terapia_id: string; horario_id: string; inicio: string; fin: string;
  tipo: string; profesional: string; modalidad: Modalidad; lugar: string | null; hijo: string;
  // Spec 003: `fecha_turno` es el día del turno original (al que se aplica un cambio).
  estado?: 'normal' | 'cambiado' | 'cancelado'; fecha_turno?: string; original_fecha?: string | null;
  original_inicio?: string | null; cambio_id?: string | null; nota?: string | null;
};
export type Cambio = {
  id: string; alcance: 'una_vez' | 'periodo'; accion: 'mover' | 'cancelar';
  fecha: string | null; desde: string | null; hasta: string | null;
  nueva_fecha: string | null; nuevo_dia_semana: number | null; nueva_hora: string | null; nota: string | null;
  quien: string | null; horario_id: string; dia_semana: number; hora: string; duracion_min: number; terapia_id: string; tipo: string;
};
export type Turno = {
  horario_id: string; fecha: string; hay_turno: boolean; dia_semana: number; hora: string; duracion_min: number;
  terapia: Terapia; cambio: Cambio | null;
};
export type OcurrenciaEvento = { clase: 'evento'; evento_id: string; inicio: string; titulo: string; hijo: string | null };
export type Dia = { fecha: string; ocurrencias: (OcurrenciaTerapia | OcurrenciaEvento)[] };

export type Modalidad = 'consultorio' | 'domicilio' | 'colegio' | 'virtual';
export const MODALIDADES: { id: Modalidad; nombre: string }[] = [
  { id: 'consultorio', nombre: 'Consultorio' },
  { id: 'domicilio', nombre: 'Domicilio' },
  { id: 'colegio', nombre: 'Colegio' },
  { id: 'virtual', nombre: 'Virtual' },
];
export const nombreModalidad = (m: Modalidad) => MODALIDADES.find((x) => x.id === m)?.nombre ?? m;

// "Consultorio Belgrano" si hay lugar; si no, la modalidad.
export const dondeEs = (modalidad: Modalidad, lugar: string | null) => lugar ?? nombreModalidad(modalidad);
