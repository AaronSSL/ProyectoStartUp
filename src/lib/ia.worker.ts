/// <reference lib="webworker" />
// Modelos de IA en el navegador (transformers.js): Whisper para las entrevistas y e5 para comparar textos.
// Se descargan una sola vez desde Hugging Face y quedan en la caché del navegador; el audio y los CVs no salen de aquí.
import { env, pipeline, type AutomaticSpeechRecognitionPipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import type { Palabra, Segmento } from './tipos.ts';
import { cortarEnTramos, MUESTREO } from './tramos.ts';

env.allowLocalModels = false;
// Las sobrecargas de pipeline() generan un tipo demasiado complejo para TypeScript: se usa una firma simple
const crearPipeline = pipeline as unknown as (tarea: string, modelo: string, opciones: Record<string, unknown>) => Promise<unknown>;

export type PedidoIA =
  | { id: number; tipo: 'similitudes'; consultas: string[]; textos: string[] }
  | { id: number; tipo: 'transcribir'; audio: Float32Array; modelo: string; procesador: 'auto' | 'cpu' };
export type RespuestaIA =
  | { id: number; tipo: 'progreso'; texto: string; pct: number | null }
  | { id: number; tipo: 'resultado'; datos: unknown }
  | { id: number; tipo: 'error'; mensaje: string };

const MODELO_E5 = 'Xenova/multilingual-e5-small';
const responder = (r: RespuestaIA) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(r);

/** Progreso de descarga sumando todos los archivos del modelo. */
function progresoDescarga(id: number, nombre: string) {
  const archivos = new Map<string, { cargado: number; total: number }>();
  return (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== 'progress' || !p.file) return;
    archivos.set(p.file, { cargado: p.loaded ?? 0, total: p.total ?? 0 });
    const cargado = [...archivos.values()].reduce((s, a) => s + a.cargado, 0);
    const total = [...archivos.values()].reduce((s, a) => s + a.total, 0);
    responder({ id, tipo: 'progreso', texto: `Descargando ${nombre} (${(cargado / 1e6).toFixed(0)} de ${(total / 1e6).toFixed(0)} MB, solo la primera vez)…`, pct: total ? (100 * cargado) / total : null });
  };
}

let e5: Promise<FeatureExtractionPipeline> | null = null;
async function similitudes(id: number, consultas: string[], textos: string[]): Promise<number[][]> {
  e5 ??= crearPipeline('feature-extraction', MODELO_E5, { dtype: 'q8', progress_callback: progresoDescarga(id, 'el modelo de lenguaje') }) as Promise<FeatureExtractionPipeline>;
  const modelo = await e5;
  const codificar = async (lista: string[], prefijo: string) => {
    const vectores: number[][] = [];
    for (let i = 0; i < lista.length; i += 32) {
      const lote = await modelo(lista.slice(i, i + 32).map((t) => `${prefijo}: ${t}`), { pooling: 'mean', normalize: true });
      vectores.push(...(lote.tolist() as number[][]));
      responder({ id, tipo: 'progreso', texto: `Comparando textos… ${Math.min(i + 32, lista.length)} de ${lista.length}`, pct: (100 * Math.min(i + 32, lista.length)) / lista.length });
    }
    return vectores;
  };
  const q = await codificar(consultas, 'query');
  const t = await codificar(textos, 'passage');
  return q.map((a) => t.map((b) => a.reduce((s, v, k) => s + v * b[k], 0)));
}

let whisper: { modelo: string; procesador: string; tubo: Promise<AutomaticSpeechRecognitionPipeline>; dispositivo: string } | null = null;
async function cargarWhisper(id: number, modelo: string, procesador: 'auto' | 'cpu') {
  if (whisper && whisper.modelo === modelo && whisper.procesador === procesador) return whisper;
  const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } };
  const gpu = procesador === 'auto' && nav.gpu ? await nav.gpu.requestAdapter().catch(() => null) : null;
  // En la GPU: encoder fp32 + decoder q4 (~590 MB en small). Se probó fp16 + q4f16 (~320 MB) en una RTX 2060 y
  // tardó más de 100 s en una entrevista de 39 s, frente a menos de 10 s de esta combinación. En el procesador, q8.
  const dtypeGpu = { encoder_model: 'fp32', decoder_model_merged: 'q4' };
  const intentar = (device: 'webgpu' | 'wasm') => crearPipeline('automatic-speech-recognition', modelo, {
    device,
    dtype: device === 'webgpu' ? dtypeGpu : 'q8',
    progress_callback: progresoDescarga(id, 'Whisper'),
  }) as Promise<AutomaticSpeechRecognitionPipeline>;
  let dispositivo = gpu ? 'GPU del navegador (WebGPU)' : 'Procesador (WASM)';
  let tubo = gpu ? intentar('webgpu') : intentar('wasm');
  try { await tubo; } catch (e) {
    if (!gpu) throw e;
    // Algunas tarjetas no admiten todas las operaciones en WebGPU: se usa el procesador
    dispositivo = 'Procesador (WASM)';
    tubo = intentar('wasm');
    await tubo;
  }
  whisper = { modelo, procesador, tubo, dispositivo };
  return whisper;
}

type Trozo = { text: string; timestamp: [number, number | null] };

/** Agrupa palabras en frases (hasta un punto o ~12 s) para la transcripción y la evidencia. */
function frasesDesdePalabras(palabras: Palabra[]): Segmento[] {
  const out: Segmento[] = [];
  let actual: Palabra[] = [];
  for (const w of palabras) {
    actual.push(w);
    if (/[.?!…]$/.test(w.w) || w.fin - actual[0].ini > 12) {
      out.push({ inicio: actual[0].ini, fin: w.fin, texto: actual.map((x) => x.w).join(' '), palabras: actual });
      actual = [];
    }
  }
  if (actual.length) out.push({ inicio: actual[0].ini, fin: actual[actual.length - 1].fin, texto: actual.map((x) => x.w).join(' '), palabras: actual });
  return out;
}

/** Sin tiempos por palabra: se reparten dentro de cada frase según el largo de cada palabra. */
function estimarPalabras(trozos: Trozo[], duracion: number): Segmento[] {
  return trozos.map((t) => {
    const inicio = t.timestamp[0];
    const fin = t.timestamp[1] ?? duracion;
    const ws = t.text.trim().split(/\s+/).filter(Boolean);
    const total = ws.reduce((s, w) => s + w.length + 1, 0) || 1;
    let cursor = inicio;
    const palabras = ws.map((w) => {
      const d = ((fin - inicio) * (w.length + 1)) / total;
      const p = { w, ini: cursor, fin: cursor + d * 0.85 };
      cursor += d;
      return p;
    });
    return { inicio, fin, texto: t.text.trim(), palabras };
  });
}

async function transcribir(id: number, audio: Float32Array, modelo: string, procesador: 'auto' | 'cpu') {
  const w = await cargarWhisper(id, modelo, procesador);
  const tubo = await w.tubo;
  const duracion = audio.length / MUESTREO;
  const tramos = cortarEnTramos(audio);
  const inicio = Date.now();
  let hecho = 0;
  const avisar = () => responder({ id, tipo: 'progreso', pct: (100 * hecho) / tramos.length,
    texto: `Transcribiendo ${Math.round(duracion)} s de audio en ${w.dispositivo}… tramo ${Math.min(hecho + 1, tramos.length)} de ${tramos.length} (${Math.round((Date.now() - inicio) / 1000)} s)` });
  const reloj = setInterval(avisar, 1000);
  const opciones = { language: 'spanish', task: 'transcribe' };
  const porPalabra = async () => {
    const palabras: Palabra[] = [];
    for (const t of tramos) {
      avisar();
      const fin = t.inicio + t.audio.length / MUESTREO;
      const r = await tubo(t.audio, { ...opciones, return_timestamps: 'word' }) as { chunks?: Trozo[] };
      for (const c of r.chunks ?? []) {
        const texto = c.text.trim();
        if (texto) palabras.push({ w: texto, ini: t.inicio + c.timestamp[0], fin: Math.min(fin, t.inicio + (c.timestamp[1] ?? c.timestamp[0] + 0.3)) });
      }
      hecho++;
    }
    return frasesDesdePalabras(palabras);
  };
  const porFrase = async () => {
    const frases: Trozo[] = [];
    for (const t of tramos) {
      avisar();
      const fin = t.inicio + t.audio.length / MUESTREO;
      const r = await tubo(t.audio, { ...opciones, return_timestamps: true }) as { chunks?: Trozo[] };
      frases.push(...(r.chunks ?? []).map((c): Trozo => ({ text: c.text, timestamp: [t.inicio + c.timestamp[0], c.timestamp[1] === null ? fin : t.inicio + c.timestamp[1]] })));
      hecho++;
    }
    return estimarPalabras(frases, duracion);
  };
  try {
    let tiemposPorPalabra = true;
    let segmentos: Segmento[];
    try { segmentos = await porPalabra(); }
    catch {
      // Este dispositivo no da tiempos por palabra: se rehace todo por frases y se estiman dentro de cada una
      tiemposPorPalabra = false;
      hecho = 0;
      segmentos = await porFrase();
    }
    return { segmentos, duracion, modelo: modelo.split('/').pop(), dispositivo: w.dispositivo, tiemposPorPalabra };
  } finally { clearInterval(reloj); }
}

self.onmessage = async (ev: MessageEvent<PedidoIA>) => {
  const p = ev.data;
  try {
    const datos = p.tipo === 'similitudes' ? await similitudes(p.id, p.consultas, p.textos) : await transcribir(p.id, p.audio, p.modelo, p.procesador);
    responder({ id: p.id, tipo: 'resultado', datos });
  } catch (e) {
    responder({ id: p.id, tipo: 'error', mensaje: e instanceof Error ? e.message : String(e) });
  }
};
