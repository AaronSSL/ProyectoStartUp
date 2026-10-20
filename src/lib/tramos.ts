// Whisper procesa hasta 30 s por vez. Unir trozos con los tiempos por palabra de transformers.js pierde frases y
// desordena los tiempos, así que el audio se corta aquí en tramos de hasta 28 s, en el momento más silencioso de
// sus últimos segundos (para no partir una palabra), y cada tramo se transcribe por separado.
export const MUESTREO = 16000;
const MAX_TRAMO = 28;
const BUSCAR_CORTE_DESDE = 20;   // el corte se busca entre los 20 y 28 s del tramo
const VENTANA_ENERGIA = 0.25;    // s

export type Tramo = { inicio: number; audio: Float32Array };

export function cortarEnTramos(audio: Float32Array, muestreo = MUESTREO): Tramo[] {
  const tramos: Tramo[] = [];
  const max = MAX_TRAMO * muestreo;
  const paso = Math.round(VENTANA_ENERGIA * muestreo);
  let inicio = 0;
  while (inicio < audio.length) {
    if (audio.length - inicio <= max + 2 * muestreo) {   // lo que queda entra en un tramo (hasta 30 s)
      tramos.push({ inicio: inicio / muestreo, audio: audio.subarray(inicio) });
      break;
    }
    let corte = inicio + max;
    let menor = Infinity;
    for (let p = inicio + BUSCAR_CORTE_DESDE * muestreo; p + paso <= inicio + max; p += paso) {
      let energia = 0;
      for (let i = p; i < p + paso; i++) energia += audio[i] * audio[i];
      if (energia < menor) { menor = energia; corte = p + Math.floor(paso / 2); }
    }
    tramos.push({ inicio: inicio / muestreo, audio: audio.subarray(inicio, corte) });
    inicio = corte;
  }
  return tramos;
}
