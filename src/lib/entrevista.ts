// Parte 2: análisis de la entrevista a partir de su transcripción (lógica de talentai/audio.py).
//  - Contenido (60%): qué tanto responde a cada requisito (embeddings), con la frase y el minuto que lo respaldan.
//  - Fluidez (20%): palabras por minuto mientras habla y pausas largas.
//  - Claridad (20%): muletillas por cada 100 palabras y continuidad (palabras repetidas o frases reiniciadas).
//    En el navegador Whisper no entrega la confianza por palabra, por eso la «dicción» de la versión de escritorio
//    se reemplaza por la continuidad.
// No se analizan rostro, gestos, voz como rasgo personal ni emociones: solo lo que la persona dice y cómo lo dice.
import type { Similitudes } from './matchingCv.ts';
import {
  firma, mmss, pesosNormalizados, type Convocatoria, type EvidenciaEntrevista, type MetricasHabla, type Palabra,
  type ResultadoEntrevista, type Segmento, type Transcripcion,
} from './tipos.ts';

export const PESOS = { contenido: 0.6, fluidez: 0.2, claridad: 0.2 };
export const PPM_IDEAL: [number, number] = [110, 160];
const PPM_LIMITES: [number, number] = [60, 220];
const PAUSA = 1.0;
export const PAUSA_LARGA = 3.0;
const FACTOR_NEGACION = 0.3;
export const UMBRAL_SUSTENTO = 50;
/** e5 da similitudes comprimidas: con una sola entrevista no hay grupo para reescalar, se usan estos umbrales.
 *  Calibrados con e5-small sobre las entrevistas de ejemplo: lo que responde al requisito queda en 0,87-0,90 y lo
 *  que no tiene relación, en 0,80-0,83 (la versión de escritorio, con e5-base, usaba 0,78-0,88). */
const ESCALA_E5: [number, number] = [0.8, 0.88];

// «este», «bueno», «pues» y «tipo» solo cuentan como muletilla seguidos de una pausa escrita (coma o puntos).
const MULETILLAS: Record<string, RegExp> = {
  'eh / em / mmm': /(?<![\p{L}])(e+h+|e+m+|m{2,}|a+h+|e)(?=\s*[,.…])/giu,
  'este…': /\beste\b(?=\s*(,|\.\.\.|…))/gi,
  'o sea': /\bo sea\b/gi,
  'bueno…': /\bbueno\b(?=\s*(,|\.\.\.|…))/gi,
  'pues…': /\bpues\b(?=\s*(,|\.\.\.|…))/gi,
  digamos: /\bdigamos\b/gi,
  'tipo…': /\btipo\b(?=\s*(,|\.\.\.|…))/gi,
  '¿no?': /¿\s*no\s*\?|,\s*no[.?]/gi,
  'como que': /\bcomo que\b/gi,
};

// «no tengo experiencia en cobranzas», «nunca he usado Excel»: el texto se parece al requisito pero lo niega.
const NEGACION = /\b(no|nunca|jam[aá]s|sin|tampoco)\b(\s+\p{L}+){0,3}?\s*\b(tengo|tuve|he|cuento|manejo|conozco|s[eé]|experiencia|conocimiento|domino|us[eé]|trabaj[eé])\b/iu;
export const niega = (texto: string) => NEGACION.test(texto);

const lineal = (x: number, lo: number, hi: number) => Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
const r1 = (x: number) => Math.round(x * 10) / 10;

export function puntajeRitmo(ppm: number): number {
  const [a, b] = PPM_IDEAL, [lo, hi] = PPM_LIMITES;
  if (ppm >= a && ppm <= b) return 100;
  return 100 * (ppm < a ? lineal(ppm, lo, a) : 1 - lineal(ppm, b, hi));
}

export function contarMuletillas(texto: string): Record<string, number> {
  const t = texto.toLowerCase();
  return Object.fromEntries(Object.entries(MULETILLAS)
    .map(([k, patron]) => [k, (t.match(patron) || []).length] as const).filter(([, n]) => n > 0));
}

/** Palabras repetidas seguidas («el el», «yo yo») sin contar muletillas: frases que se reinician. */
export function contarRepeticiones(texto: string): number {
  const tokens = texto.toLowerCase().match(/\p{L}+/gu) || [];
  let n = 0;
  for (let i = 1; i < tokens.length; i++) if (tokens[i] === tokens[i - 1] && !['este', 'eh', 'e', 'mmm', 'no'].includes(tokens[i])) n++;
  return n;
}

const palabrasDe = (s: Segmento): Palabra[] => (s.palabras.length ? s.palabras : [{ w: s.texto, ini: s.inicio, fin: s.fin }]);

export function oraciones(segmentos: Segmento[]) {
  const out: Palabra[][] = [];
  let actual: Palabra[] = [];
  for (const s of segmentos) for (const w of palabrasDe(s)) {
    if (!w.w) continue;
    actual.push(w);
    if (/[.?!…]$/.test(w.w)) { out.push(actual); actual = []; }
  }
  if (actual.length) out.push(actual);
  return out.map((o) => ({ inicio: o[0].ini, fin: o[o.length - 1].fin, texto: o.map((w) => w.w).join(' ') }));
}

/** Cada oración y cada par de oraciones seguidas: la evidencia de un requisito suele ocupar una o dos. */
export function ventanas(segmentos: Segmento[], maxChars = 300) {
  const ors = oraciones(segmentos);
  const out = [...ors];
  for (let i = 0; i + 1 < ors.length; i++) {
    const a = ors[i], b = ors[i + 1];
    if (a.texto.length + b.texto.length < maxChars) out.push({ inicio: a.inicio, fin: b.fin, texto: `${a.texto} ${b.texto}` });
  }
  return out;
}

/** Subtítulos en líneas cortas a partir de los tiempos de cada palabra. */
export function lineasSubtitulo(segmentos: Segmento[], maxChars = 70) {
  const out: Palabra[][] = [];
  let actual: Palabra[] = [];
  const largo = (ws: Palabra[]) => ws.map((x) => x.w).join(' ').length;
  for (const s of segmentos) for (const w of palabrasDe(s)) {
    if (!w.w) continue;
    if (actual.length && largo([...actual, w]) > maxChars) { out.push(actual); actual = []; }
    actual.push(w);
    if (/[.?!…]$/.test(w.w) || (/,$/.test(w.w) && largo(actual) > maxChars * 0.6)) { out.push(actual); actual = []; }
  }
  if (actual.length) out.push(actual);
  return out.map((l) => ({ inicio: l[0].ini, fin: l[l.length - 1].fin, texto: l.map((x) => x.w).join(' ') }));
}

export function subtitulosVtt(segmentos: Segmento[]): string {
  const t = (s: number) => {
    const ms = Math.round(s * 1000);
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60, r = ms % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(r).padStart(3, '0')}`;
  };
  return 'WEBVTT\n\n' + lineasSubtitulo(segmentos).map((l) => `${t(l.inicio)} --> ${t(Math.max(l.fin, l.inicio + 0.6))}\n${l.texto}`).join('\n\n') + '\n';
}

export function metricasHabla(segmentos: Segmento[], duracion: number): MetricasHabla {
  const palabras = segmentos.flatMap(palabrasDe).filter((w) => w.w);
  const n = palabras.length;
  const gaps = palabras.slice(1).map((b, i) => b.ini - palabras[i].fin);
  const pausas = gaps.filter((g) => g >= PAUSA);
  const habla = palabras.reduce((s, w) => s + Math.max(w.fin - w.ini, 0), 0) + gaps.filter((g) => g > 0 && g < PAUSA).reduce((s, g) => s + g, 0);
  const texto = segmentos.map((s) => s.texto).join(' ');
  const mulet = contarMuletillas(texto);
  const totalMulet = Object.values(mulet).reduce((s, x) => s + x, 0);
  const repeticiones = contarRepeticiones(texto);
  return {
    palabras: n, duracion, tiempoHabla: r1(habla),
    ppm: habla > 1 ? r1(n / (habla / 60)) : 0,
    pausas: pausas.length, pausasLargas: pausas.filter((g) => g >= PAUSA_LARGA).length,
    pausaMax: pausas.length ? r1(Math.max(...pausas)) : 0,
    muletillas: mulet, muletillasTotal: totalMulet, muletillas100: n ? Math.round((10000 * totalMulet) / n) / 100 : 0,
    repeticiones, repeticiones100: n ? Math.round((10000 * repeticiones) / n) / 100 : 0,
  };
}

export async function analizarEntrevista(trans: Transcripcion, conv: Convocatoria, similitudes: Similitudes): Promise<ResultadoEntrevista> {
  const segs = trans.segmentos;
  const m = metricasHabla(segs, trans.duracion);
  if (m.palabras < 5) throw new Error('El audio casi no tiene voz reconocible: revisa que el video tenga sonido.');

  const vent = ventanas(segs);
  const reqs = conv.requisitos.map((r) => r.texto);
  const pesos = pesosNormalizados(conv.requisitos);
  const sim = reqs.length ? await similitudes(reqs, vent.map((v) => v.texto)) : [];
  const porRequisito: EvidenciaEntrevista[] = reqs.map((requisito, k) => {
    const j = sim[k].reduce((mejor, x, i) => (x > sim[k][mejor] ? i : mejor), 0);
    const puntaje = 100 * lineal(sim[k][j], ...ESCALA_E5);
    const negacion = niega(vent[j].texto);
    return { requisito, sim: sim[k][j], negacion, puntaje: r1(puntaje * (negacion ? FACTOR_NEGACION : 1)),
      evidencia: vent[j].texto, inicio: vent[j].inicio, fin: vent[j].fin };
  });
  const contenido = porRequisito.reduce((s, p, k) => s + p.puntaje * pesos[k], 0);

  const minutos = Math.max(m.duracion / 60, 0.5);
  const fluidez = Math.max(0, puntajeRitmo(m.ppm) - Math.min(40, (15 * m.pausasLargas) / minutos));
  const claridad = 0.6 * Math.max(0, 100 - 12 * m.muletillas100) + 0.4 * Math.max(0, 100 - 25 * m.repeticiones100);

  const sub = { contenido: r1(contenido), fluidez: r1(fluidez), claridad: r1(claridad) };
  const puntaje = r1(sub.contenido * PESOS.contenido + sub.fluidez * PESOS.fluidez + sub.claridad * PESOS.claridad);
  return { puntaje, ...sub, metricas: m, porRequisito, observaciones: observaciones(m, porRequisito), firma: firma(conv.requisitos), transcripcion: trans };
}

export function observaciones(m: MetricasHabla, porReq: EvidenciaEntrevista[]): string[] {
  const obs: string[] = [];
  const [a, b] = PPM_IDEAL;
  const ritmo = m.ppm >= a && m.ppm <= b ? 'dentro del rango recomendado' : m.ppm < a ? 'algo lento' : 'algo acelerado';
  obs.push(`Ritmo de ${m.ppm.toFixed(0)} palabras por minuto mientras habla: ${ritmo} (${a}-${b}).`);
  obs.push(m.pausasLargas
    ? `${m.pausasLargas} pausa(s) de más de ${PAUSA_LARGA} s; la más larga, de ${m.pausaMax.toFixed(1)} s.`
    : `Sin pausas de más de ${PAUSA_LARGA} s.`);
  if (m.muletillasTotal) {
    const detalle = Object.entries(m.muletillas).sort((x, y) => y[1] - x[1]).map(([k, n]) => `«${k}» ×${n}`).join(', ');
    obs.push(`${m.muletillasTotal} muletilla(s), ${m.muletillas100.toFixed(1)} por cada 100 palabras: ${detalle}.`);
  } else obs.push('No se detectaron muletillas.');
  obs.push(m.repeticiones ? `${m.repeticiones} palabra(s) repetida(s) seguidas (frases que se reinician).` : 'Habla continua, sin frases reiniciadas.');
  if (porReq.length) {
    const mejor = porReq.reduce((x, y) => (y.puntaje > x.puntaje ? y : x));
    const peor = porReq.reduce((x, y) => (y.puntaje < x.puntaje ? y : x));
    obs.push(mejor.puntaje >= UMBRAL_SUSTENTO
      ? `Lo que mejor sustentó: «${mejor.requisito}» (min ${mmss(mejor.inicio)}).`
      : `Ningún requisito quedó bien sustentado en la entrevista (todos por debajo de ${UMBRAL_SUSTENTO}).`);
    if (peor !== mejor) obs.push(`Lo que menos abordó: «${peor.requisito}»; conviene repreguntar sobre ello.`);
    const negados = new Map<string, { inicio: number; reqs: string[] }>();
    for (const p of porReq) if (p.negacion) {
      const g = negados.get(p.evidencia) ?? { inicio: p.inicio, reqs: [] };
      g.reqs.push(p.requisito); negados.set(p.evidencia, g);
    }
    for (const [evidencia, g] of negados) obs.push(`Lo más cercano a ${g.reqs.map((r) => `«${r}»`).join(', ')} es una negación (min ${mmss(g.inicio)}): «${evidencia}». Se redujo el puntaje de contenido.`);
  }
  return obs;
}
