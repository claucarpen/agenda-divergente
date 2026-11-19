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
