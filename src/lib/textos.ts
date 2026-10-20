// Partición del CV (el perfil que llega del portal, en texto) en fragmentos comparables con los requisitos.
// Misma lógica que la versión de escritorio (talentai/textos.py).

const MAX_FRAGMENTO = 320;
const MIN_FRAGMENTO = 12;

/** Divide el CV en fragmentos cortos (viñetas, líneas, oraciones) para encontrar la evidencia de cada requisito.
 *  Las líneas muy cortas (títulos de sección, fechas sueltas) se unen a la siguiente. */
export function fragmentar(texto: string): string[] {
  const lineas = (texto || '').split(/\r?\n/)
    .map((l) => l.replace(/^[\s•●▪►✓✔\-*·–]+/, '').trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  const fragmentos: string[] = [];
  let pendiente = '';
  for (const original of lineas) {
    const linea = pendiente ? `${pendiente} ${original}`.trim() : original;
    if (linea.length < 40 && !/[.;:]$/.test(linea)) { pendiente = linea; continue; }
    pendiente = '';
    fragmentos.push(...partirLargo(linea));
  }
  if (pendiente) fragmentos.push(pendiente);
  const vistos = new Set<string>();
  return fragmentos.filter((f) => {
    const clave = f.toLowerCase();
    if (f.length < MIN_FRAGMENTO || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

function partirLargo(texto: string): string[] {
  if (texto.length <= MAX_FRAGMENTO) return [texto];
  const partes: string[] = [];
  let actual = '';
  for (const oracion of texto.split(/(?<=[.;!?])\s+/)) {
    if (actual && actual.length + oracion.length + 1 > MAX_FRAGMENTO) { partes.push(actual); actual = oracion; }
    else actual = `${actual} ${oracion}`.trim();
  }
  if (actual) partes.push(actual);
  // Una oración larguísima sin puntos se corta por palabras
  const salida: string[] = [];
  for (let p of partes) {
    while (p.length > MAX_FRAGMENTO) {
      const corte = p.lastIndexOf(' ', MAX_FRAGMENTO);
      const fin = corte > 0 ? corte : MAX_FRAGMENTO;
      salida.push(p.slice(0, fin).trim());
      p = p.slice(fin).trim();
    }
    if (p) salida.push(p);
  }
  return salida;
}
