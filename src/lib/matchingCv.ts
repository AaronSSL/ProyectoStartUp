// Parte 1: ranking de CVs por requisito (misma lógica que talentai/matching_cv.py).
// Para cada requisito se busca el fragmento del CV más parecido (esa es la evidencia) y el score del candidato es el
// promedio ponderado de esas similitudes. Con e5 las similitudes salen muy juntas, así que el score y cada similitud
// por requisito se reescalan a 0-1 dentro de la convocatoria (el mejor = 1); el orden no cambia.
import { firma, pesosNormalizados, type Candidato, type Convocatoria, type ResultadoCv } from './tipos.ts';

export type Similitudes = (consultas: string[], textos: string[]) => Promise<number[][]>;

export async function rankear(conv: Convocatoria, candidatos: Candidato[], similitudes: Similitudes): Promise<Record<string, ResultadoCv>> {
  const reqs = conv.requisitos.map((r) => r.texto);
  if (!reqs.length) throw new Error('La convocatoria no tiene requisitos.');
  const pesos = pesosNormalizados(conv.requisitos);
  const textos: string[] = [];
  const duenos: string[] = [];
  for (const c of candidatos) for (const f of c.fragmentos) { textos.push(f); duenos.push(c.id); }
  const sim = textos.length ? await similitudes(reqs, textos) : reqs.map(() => []);

  const filas: Record<string, ResultadoCv> = {};
  for (const c of candidatos) {
    const cols = duenos.flatMap((d, j) => (d === c.id ? [j] : []));
    const porRequisito = reqs.map((requisito, k) => {
      if (!cols.length) return { requisito, simBruta: null, sim: null, evidencia: '' };
      const j = cols.reduce((mejor, x) => (sim[k][x] > sim[k][mejor] ? x : mejor), cols[0]);
      return { requisito, simBruta: sim[k][j], sim: null, evidencia: textos[j] };
    });
    const scoreBruto = cols.length ? porRequisito.reduce((s, p, k) => s + (p.simBruta ?? 0) * pesos[k], 0) : 0;
    filas[c.id] = { score: 0, scoreBruto, ranking: 0, sinTexto: !cols.length, firma: firma(conv.requisitos), porRequisito };
  }
  reescalar(filas, reqs.length);
  Object.values(filas).sort((a, b) => b.scoreBruto - a.scoreBruto).forEach((f, i) => { f.ranking = i + 1; });
  return filas;
}

function minMax(valores: (number | null)[]): (number | null)[] {
  const v = valores.filter((x): x is number => x !== null);
  if (v.length < 2) return valores;
  const lo = Math.min(...v), hi = Math.max(...v);
  if (hi - lo < 1e-9) return valores;
  return valores.map((x) => (x === null ? null : (x - lo) / (hi - lo)));
}

const r4 = (x: number) => Math.round(x * 10000) / 10000;

function reescalar(filas: Record<string, ResultadoCv>, nReqs: number) {
  const validos = Object.values(filas).filter((f) => !f.sinTexto);
  minMax(validos.map((f) => f.scoreBruto)).forEach((s, i) => { validos[i].score = r4(s ?? validos[i].scoreBruto); });
  for (let k = 0; k < nReqs; k++) {
    minMax(validos.map((f) => f.porRequisito[k].simBruta)).forEach((s, i) => { validos[i].porRequisito[k].sim = s === null ? null : r4(s); });
  }
}
