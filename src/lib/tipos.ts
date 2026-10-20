// Modelo de datos de Palomar Talent. Todo vive en el navegador de cada empresa (IndexedDB, ver almacen.ts).

export type Portal = 'linkedin' | 'bumeran' | 'computrabajo';

export type SolicitudIntegracion = {
  estado: 'solicitada' | 'en_configuracion' | 'activa';
  contacto: string;
  correo: string;
  telefono: string;
  cuentaPortal: string;
  detalle: string;
  fecha: string;
};

export type Empresa = {
  id: string;
  nombre: string;
  sector: string;
  creadaAt: string;
  demo: boolean;
  integraciones: Partial<Record<Portal, SolicitudIntegracion>>;
};

export type Requisito = { id: string; texto: string; peso: number };

/** Perfil del postulante tal como llega del portal (mismos campos que la exportación de Bumeran). */
export type PerfilPortal = {
  ciudad?: string;
  experiencias: { puesto: string; empresa: string; periodo: string; descripcion: string }[];
  estudios: { titulo: string; institucion: string; nivel: string; estado: string }[];
  idiomas?: string;
  habilidades?: string;
};

export type Convocatoria = {
  id: string;
  empresaId: string;
  titulo: string;
  area: string;
  requisitos: Requisito[];
  topN: number;      // cuántos de los primeros del ranking se invitan a entrevista
  pesoCv: number;    // % del CV en el puntaje final; el resto es la entrevista
  creadaAt: string;
  /** Aviso del portal del que viene (los postulantes llegan por la integración, no se suben a mano). */
  origen?: { portal: Portal; avisoId: string; publicadoEl: string; modalidad?: string; sincronizadoAt: string };
  descripcion?: string;
};

export type EvidenciaCv = { requisito: string; sim: number | null; simBruta: number | null; evidencia: string };
export type ResultadoCv = {
  score: number;       // 0-1, reescalado dentro de la convocatoria (el mejor CV = 1)
  scoreBruto: number;
  ranking: number;
  sinTexto: boolean;
  firma: string;       // requisitos y pesos con los que se calculó
  porRequisito: EvidenciaCv[];
};

export type Palabra = { w: string; ini: number; fin: number };
export type Segmento = { inicio: number; fin: number; texto: string; palabras: Palabra[] };
export type Transcripcion = {
  segmentos: Segmento[];
  duracion: number;
  modelo: string;
  dispositivo: string;
  tiemposPorPalabra: boolean;   // false: tiempos de cada palabra estimados dentro de su frase
};

export type MetricasHabla = {
  palabras: number; duracion: number; tiempoHabla: number; ppm: number;
  pausas: number; pausasLargas: number; pausaMax: number;
  muletillas: Record<string, number>; muletillasTotal: number; muletillas100: number;
  repeticiones: number; repeticiones100: number;
};
export type EvidenciaEntrevista = {
  requisito: string; sim: number; negacion: boolean; puntaje: number; evidencia: string; inicio: number; fin: number;
};
export type ResultadoEntrevista = {
  puntaje: number; contenido: number; fluidez: number; claridad: number;
  metricas: MetricasHabla;
  porRequisito: EvidenciaEntrevista[];
  observaciones: string[];
  firma: string;
  transcripcion: Transcripcion;
};

export const DECISIONES = ['Pendiente', 'Avanza', 'En espera', 'Descartado'] as const;
export type Decision = (typeof DECISIONES)[number];

export type Candidato = {
  id: string;
  convocatoriaId: string;
  nombre: string;
  archivoCv: string;          // origen del perfil (p. ej. «Perfil de Bumeran»); vacío si solo tiene entrevista
  textoCv: string;
  fragmentos: string[];
  fuente: string;             // «Bumeran», «LinkedIn», «Computrabajo» o «Solo entrevista»
  portal?: Portal;
  idPortal?: string;          // id del postulante en el portal: evita duplicarlo al sincronizar
  perfil?: PerfilPortal;
  postuladoEl?: string;
  cv?: ResultadoCv;
  videoId?: string;           // clave del video en IndexedDB
  archivoVideo?: string;
  entrevista?: ResultadoEntrevista;
  preseleccionado: boolean;
  decision: Decision;
  nota: string;
};

export const nuevoId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

export function pesosNormalizados(reqs: Requisito[]): number[] {
  const total = reqs.reduce((s, r) => s + Math.max(r.peso, 0), 0);
  return reqs.map((r) => (total ? Math.max(r.peso, 0) / total : 1 / Math.max(reqs.length, 1)));
}

/** Cambia si cambian los requisitos o los pesos: los resultados anteriores quedan desactualizados. */
export const firma = (reqs: Requisito[]) => reqs.map((r) => `${r.texto.trim()}:${r.peso}`).join('|');

/** Promedio ponderado CV/entrevista en 0-100. Si falta una parte, se usa la que exista (y se indica). */
export function puntajeFinal(c: Candidato, pesoCv: number): { valor: number | null; base: string } {
  const cv = c.cv && !c.cv.sinTexto ? c.cv.score * 100 : null;
  const ent = c.entrevista ? c.entrevista.puntaje : null;
  if (cv !== null && ent !== null) return { valor: (cv * pesoCv + ent * (100 - pesoCv)) / 100, base: 'CV + entrevista' };
  if (cv !== null) return { valor: cv, base: 'Solo CV' };
  if (ent !== null) return { valor: ent, base: 'Solo entrevista' };
  return { valor: null, base: 'Sin datos' };
}

export const mmss = (seg: number) => {
  const s = Math.max(0, Math.round(seg || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
