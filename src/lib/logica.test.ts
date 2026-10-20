import { describe, expect, it } from 'vitest';
import { contarMuletillas, contarRepeticiones, metricasHabla, niega, oraciones, puntajeRitmo, subtitulosVtt } from './entrevista.ts';
import { rankear } from './matchingCv.ts';
import { fragmentar } from './textos.ts';
import { puntajeFinal, type Candidato, type Convocatoria, type Segmento } from './tipos.ts';

// Transcripción real de Whisper small (transformers.js) de ejemplos/entrevistas/Diego_Ramos_entrevista.mp4
const DIEGO = 'E, este, bueno, mi nombre es Diego. Este, yo trabajo en un restaurante, o sea, en la cocina. E, preparo los platos y, este, ordeno los insumos. Digamos que, o sea, me gusta trabajar en equipo, no. Bueno, de cobranzas, E, no tengo experiencia, pero, este, puedo aprender.';
const LUCIA = 'Trabajo hace más de tres años en cobranzas, en financiera andina. Lo que más hago es negociar por teléfono acuerdos de pago y refinanciamientos.';

const conv: Convocatoria = { id: 'c', empresaId: 'e', titulo: 'Analista', area: '', topN: 3, pesoCv: 50, creadaAt: '',
  requisitos: [{ id: 'a', texto: 'Cobranzas', peso: 60 }, { id: 'b', texto: 'Excel', peso: 40 }] };
const cand = (id: string, fragmentos: string[]): Candidato => ({ id, convocatoriaId: 'c', nombre: id, archivoCv: `${id}.txt`, textoCv: '', fragmentos,
  fuente: 'Archivo', preseleccionado: false, decision: 'Pendiente', nota: '' });

describe('CV', () => {
  it('fragmenta por líneas, une títulos cortos y descarta duplicados', () => {
    const linea = 'Gestión de una cartera morosa de 600 clientes con tramos de 30 a 120 días.';
    expect(fragmentar(`EXPERIENCIA\n- ${linea}\n• ${linea}`)).toEqual([`EXPERIENCIA ${linea}`, linea]);
    expect(fragmentar(`- ${linea}\n- ${linea}`)).toEqual([linea]);
  });
  it('ordena por el promedio ponderado y reescala dentro de la convocatoria', async () => {
    // similitud = 0,9 si el fragmento contiene la palabra del requisito; 0,8 si no
    const sim = async (q: string[], t: string[]) => q.map((r) => t.map((x) => (x.includes(r) ? 0.9 : 0.8)));
    const res = await rankear(conv, [cand('ana', ['Cobranzas y Excel avanzado']), cand('beto', ['Excel básico']), cand('caro', [])], sim);
    expect(res.ana).toMatchObject({ ranking: 1, score: 1 });
    expect(res.beto).toMatchObject({ ranking: 2, score: 0 });
    expect(res.caro.sinTexto).toBe(true);
    expect(res.ana.porRequisito[0].evidencia).toBe('Cobranzas y Excel avanzado');
  });
});

describe('Entrevista', () => {
  it('cuenta las muletillas reales de una transcripción de Whisper', () => {
    const m = contarMuletillas(DIEGO);
    expect(m['este…']).toBe(4);
    expect(m['o sea']).toBe(2);
    expect(m['eh / em / mmm']).toBe(3);
    expect(m.digamos).toBe(1);
    expect(m['¿no?']).toBe(1);
    expect(contarMuletillas(LUCIA)).toEqual({});
  });
  it('detecta la negación aunque el texto se parezca al requisito', () => {
    expect(niega('Bueno, de cobranzas, E, no tengo experiencia, pero, este, puedo aprender.')).toBe(true);
    expect(niega(LUCIA)).toBe(false);
  });
  it('mide ritmo y pausas largas con los tiempos de cada palabra', () => {
    const palabras = 'uno dos tres cuatro cinco seis.'.split(' ').map((w, i) => ({ w, ini: i * 0.4 + (i >= 3 ? 4 : 0), fin: i * 0.4 + 0.3 + (i >= 3 ? 4 : 0) }));
    const segs: Segmento[] = [{ inicio: 0, fin: palabras[5].fin, texto: 'uno dos tres cuatro cinco seis.', palabras }];
    const m = metricasHabla(segs, 7);
    expect(m.pausasLargas).toBe(1);
    expect(m.pausaMax).toBeGreaterThan(3);
    expect(oraciones(segs)).toHaveLength(1);
    expect(subtitulosVtt(segs)).toMatch(/^WEBVTT\n\n00:00:00.000 --> /);
  });
  it('premia el ritmo recomendado y castiga los extremos', () => {
    expect(puntajeRitmo(130)).toBe(100);
    expect(puntajeRitmo(60)).toBe(0);
    expect(puntajeRitmo(85)).toBeCloseTo(50);
  });
  it('cuenta frases reiniciadas sin confundirlas con muletillas', () => {
    expect(contarRepeticiones('yo yo trabajé en el el área, este este')).toBe(2);
  });
});

describe('Resultado', () => {
  it('combina CV y entrevista con el peso elegido, o usa la parte que exista', () => {
    const base = cand('x', ['algo']);
    const cv = { score: 0.8, scoreBruto: 0.85, ranking: 1, sinTexto: false, firma: '', porRequisito: [] };
    const entrevista = { puntaje: 60 } as Candidato['entrevista'];
    expect(puntajeFinal({ ...base, cv, entrevista }, 50)).toEqual({ valor: 70, base: 'CV + entrevista' });
    expect(puntajeFinal({ ...base, cv }, 50)).toEqual({ valor: 80, base: 'Solo CV' });
    expect(puntajeFinal(base, 50)).toEqual({ valor: null, base: 'Sin datos' });
  });
});

describe('Tramos de audio', () => {
  it('corta los audios largos en el silencio más cercano y no parte los cortos', async () => {
    const { cortarEnTramos } = await import('./tramos.ts');
    const sr = 100;   // muestreo bajo para la prueba
    const audio = new Float32Array(70 * sr).fill(0.5);
    audio.fill(0, 24 * sr, 25 * sr);     // silencios a los 24-25 s y 49-50 s
    audio.fill(0, 49 * sr, 50 * sr);
    const tramos = cortarEnTramos(audio, sr);
    expect(tramos.map((t) => Math.round(t.inicio))).toEqual([0, 24, 49]);
    expect(tramos.reduce((s, t) => s + t.audio.length, 0)).toBe(audio.length);
    expect(cortarEnTramos(new Float32Array(29 * sr), sr)).toHaveLength(1);
  });
});
