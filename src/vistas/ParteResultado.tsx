import { Download, Trophy } from 'lucide-react';
import { DECISIONES, puntajeFinal, type Candidato, type Decision } from '../lib/tipos.ts';
import { Puntaje, Vacio } from '../componentes/ui.tsx';
import type { PropsParte } from './ConvocatoriaVista.tsx';

export function ParteResultado({ conv, candidatos, guardar, guardarConv }: PropsParte) {
  const filas = candidatos.map((c) => ({ c, final: puntajeFinal(c, conv.pesoCv) }))
    .filter((f) => f.final.valor !== null)
    .sort((a, b) => (b.final.valor ?? 0) - (a.final.valor ?? 0));

  const exportar = () => {
    const celda = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const cabecera = ['Puesto', 'Candidato', 'Puntaje CV', 'Puntaje entrevista', 'Puntaje final', 'Base', 'Decisión', 'Nota'];
    const lineas = filas.map(({ c, final }) => [conv.titulo, c.nombre, c.cv && !c.cv.sinTexto ? (c.cv.score * 100).toFixed(0) : '',
      c.entrevista ? c.entrevista.puntaje.toFixed(0) : '', final.valor?.toFixed(1), final.base, c.decision, c.nota]);
    const csv = '﻿' + [cabecera, ...lineas].map((l) => l.map(celda).join(';')).join('\r\n');   // BOM: Excel lo abre bien
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${conv.titulo.replace(/[^\p{L}\d]+/gu, '_')}_resultados.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const cambiar = (c: Candidato, cambios: Partial<Candidato>) => void guardar([{ ...c, ...cambios }]);

  return (
    <section className="tarjeta" style={{ display: 'grid', gap: 16 }}>
      <div className="fila entre">
        <div><h2>Resultado final</h2><p className="ayuda">Puntaje final = CV × {conv.pesoCv}% + entrevista × {100 - conv.pesoCv}%. Si falta una parte, se usa la que exista.</p></div>
        <div className="fila">
          <label className="fila" style={{ gap: 8 }}>
            <span className="ayuda">CV {conv.pesoCv}%</span>
            <input type="range" min={0} max={100} step={5} value={conv.pesoCv} aria-label="Peso del CV en el puntaje final" onChange={(e) => void guardarConv({ ...conv, pesoCv: Number(e.target.value) })} />
            <span className="ayuda">Entrevista {100 - conv.pesoCv}%</span>
          </label>
          <button className="boton secundario" disabled={!filas.length} onClick={exportar}><Download size={15} />Exportar CSV</button>
        </div>
      </div>
      {!filas.length ? <Vacio icono={<Trophy size={34} />} titulo="Todavía no hay puntajes">Analiza los CVs (Parte 1) o las entrevistas (Parte 2) para ver aquí el resultado combinado.</Vacio> : (
        <div className="envoltura-tabla">
          <table className="tabla">
            <thead><tr><th className="num">#</th><th>Candidato</th><th>CV</th><th>Entrevista</th><th>Final</th><th>Decisión</th><th>Nota</th></tr></thead>
            <tbody>
              {filas.map(({ c, final }, i) => (
                <tr key={c.id}>
                  <td className="num">{i + 1}</td>
                  <td><strong>{c.nombre}</strong><div className="suave">{final.base}</div></td>
                  <td style={{ minWidth: 130 }}><Puntaje valor={c.cv && !c.cv.sinTexto ? c.cv.score * 100 : null} color="var(--p1)" /></td>
                  <td style={{ minWidth: 130 }}><Puntaje valor={c.entrevista?.puntaje} color="var(--p2)" /></td>
                  <td style={{ minWidth: 130 }}><Puntaje valor={final.valor} color="var(--p3)" /></td>
                  <td><select className="control" aria-label={`Decisión sobre ${c.nombre}`} value={c.decision} onChange={(e) => cambiar(c, { decision: e.target.value as Decision })}>{DECISIONES.map((d) => <option key={d}>{d}</option>)}</select></td>
                  <td style={{ minWidth: 200 }}><input className="control" aria-label={`Nota sobre ${c.nombre}`} defaultValue={c.nota} maxLength={300} placeholder="Opcional" onBlur={(e) => { if (e.target.value !== c.nota) cambiar(c, { nota: e.target.value }); }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="suave">El puntaje ayuda a ordenar y explicar; la decisión la toma siempre una persona del equipo.</p>
    </section>
  );
}
