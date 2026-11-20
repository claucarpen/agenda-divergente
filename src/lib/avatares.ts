// Generado por scripts/generar-avatares.mjs: la galería cerrada de la spec 004. Los ids deben ser los
// mismos del `check` de perfiles.avatar e hijos.avatar en 004_eventos_recordatorios_avatares.sql.
export const AVATARES = [
  { id: 'zorro', nombre: 'Zorro' },
  { id: 'pulpo', nombre: 'Pulpo' },
  { id: 'buho', nombre: 'Búho' },
  { id: 'gato', nombre: 'Gato' },
  { id: 'perro', nombre: 'Perro' },
  { id: 'conejo', nombre: 'Conejo' },
  { id: 'oso', nombre: 'Oso' },
  { id: 'pinguino', nombre: 'Pingüino' },
  { id: 'rana', nombre: 'Rana' },
  { id: 'ballena', nombre: 'Ballena' },
  { id: 'dino', nombre: 'Dino' },
  { id: 'caracol', nombre: 'Caracol' },
] as const;
export type AvatarId = (typeof AVATARES)[number]['id'];
export const esAvatar = (v: unknown): v is AvatarId => AVATARES.some((a) => a.id === v);
export const urlAvatar = (id: string) => `/avatares/${id}.svg`;
export const nombreAvatar = (id: string) => AVATARES.find((a) => a.id === id)?.nombre ?? id;
