// Puente con el worker de IA (ia.worker.ts) y lectura del audio de un video.
import type { PedidoIA, RespuestaIA } from './ia.worker.ts';
import type { Transcripcion } from './tipos.ts';
import { preferencias } from './almacen.ts';

export type Progreso = (texto: string, pct: number | null) => void;
type SinId<T> = T extends unknown ? Omit<T, 'id'> : never;
type Pendiente = { resolver: (v: unknown) => void; rechazar: (e: Error) => void; progreso?: Progreso };

export const MODELOS_WHISPER = [
  { id: 'Xenova/whisper-small', nombre: 'Whisper small (recomendado)', detalle: 'Buena precisión en español. ~350-500 MB la primera vez.' },
  { id: 'Xenova/whisper-base', nombre: 'Whisper base (rápido)', detalle: 'Más rápido y liviano (~150 MB), con más errores.' },
];
export type AjustesIA = { modelo: string; procesador: 'auto' | 'cpu' };
export const ajustesIA = (): AjustesIA => preferencias.leer<AjustesIA>('ia', { modelo: MODELOS_WHISPER[0].id, procesador: 'auto' });

let worker: Worker | null = null;
let siguiente = 1;
const pendientes = new Map<number, Pendiente>();

function obtenerWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./ia.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent<RespuestaIA>) => {
    const r = ev.data;
    const p = pendientes.get(r.id);
    if (!p) return;
    if (r.tipo === 'progreso') p.progreso?.(r.texto, r.pct);
    else {
      pendientes.delete(r.id);
      if (r.tipo === 'resultado') p.resolver(r.datos);
      else p.rechazar(new Error(traducirError(r.mensaje)));
    }
  };
  worker.onerror = (e) => {
    for (const p of pendientes.values()) p.rechazar(new Error(`El módulo de IA se detuvo (${e.message || 'sin memoria'}). Recarga la página e inténtalo de nuevo.`));
    pendientes.clear();
    worker = null;
  };
  return worker;
}

function traducirError(m: string): string {
  if (/fetch|network|Failed to fetch/i.test(m)) return 'No se pudo descargar el modelo de IA. Revisa tu conexión a internet (solo se necesita la primera vez).';
  if (/memory|allocation|OOM/i.test(m)) return 'El navegador se quedó sin memoria. Cierra otras pestañas o elige «Whisper base» en Ajustes.';
  return m;
}

function pedir<T>(pedido: SinId<PedidoIA>, progreso?: Progreso, transferir: Transferable[] = []): Promise<T> {
  const id = siguiente++;
  return new Promise<T>((resolver, rechazar) => {
    pendientes.set(id, { resolver: resolver as (v: unknown) => void, rechazar, progreso });
    obtenerWorker().postMessage({ ...pedido, id }, transferir);
  });
}

export const similitudes = (consultas: string[], textos: string[], progreso?: Progreso) =>
  pedir<number[][]>({ tipo: 'similitudes', consultas, textos }, progreso);

/** Audio del video en mono a 16 kHz (lo que espera Whisper), decodificado por el propio navegador. */
export async function audioDeVideo(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    if (buf.numberOfChannels === 1) return buf.getChannelData(0).slice();
    const mezcla = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const canal = buf.getChannelData(c);
      for (let i = 0; i < canal.length; i++) mezcla[i] += canal[i] / buf.numberOfChannels;
    }
    return mezcla;
  } catch {
    throw new Error('No se pudo leer el audio del video. Prueba con MP4 (H.264/AAC), WebM o un archivo de audio.');
  } finally { void ctx.close(); }
}

export async function transcribir(blob: Blob, progreso?: Progreso): Promise<Transcripcion> {
  progreso?.('Extrayendo el audio del video…', null);
  const audio = await audioDeVideo(blob);
  const { modelo, procesador } = ajustesIA();
  return pedir<Transcripcion>({ tipo: 'transcribir', audio, modelo, procesador }, progreso, [audio.buffer]);
}
