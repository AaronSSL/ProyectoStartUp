// Cómo se muestran las métricas «antes → con CV UP» del modo demo.
import type { DefinicionMetrica, ValorMetrica } from './repositorio.ts';

export const EN_MEDICION = 'En medición';

export function formatoValor(v: number | null | undefined, unidad: string): string {
  if (v === null || v === undefined) return EN_MEDICION;
  switch (unidad) {
    case '%': return `${v}%`;
    case '1-5': return `${v} / 5`;
    case 'horas': return `${v} h`;
    case 'días': return `${v} ${v === 1 ? 'día' : 'días'}`;
    case 'puntos': return `${v} ${v === 1 ? 'punto' : 'puntos'}`;
    default: return `${v} ${unidad}`;
  }
}

/** Cambio entre antes y después (null si falta alguno de los dos). */
export function cambio(def: DefinicionMetrica, valor: ValorMetrica): { texto: string; mejora: boolean } | null {
  if (!valor || valor.antes === null || valor.despues === null) return null;
  const dif = valor.despues - valor.antes;
  if (dif === 0) return { texto: 'Sin cambio', mejora: false };
  const abs = Math.abs(dif);
  const unidad = def.unidad === '%' ? ' pp' : def.unidad === 'horas' ? ' h' : def.unidad === '1-5' ? '' : ` ${def.unidad}`;
  const pct = valor.antes !== 0 && def.unidad !== '%' ? ` (${dif > 0 ? '+' : '−'}${Math.round((abs / valor.antes) * 100)}%)` : '';
  return { texto: `${dif > 0 ? '+' : '−'}${abs}${unidad}${pct}`, mejora: def.mejor === 'menor' ? dif < 0 : dif > 0 };
}
