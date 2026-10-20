import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Plug, RefreshCw, Sparkles, Trash2, Users } from 'lucide-react';
import { similitudes } from '../lib/ia.ts';
import { rankear } from '../lib/matchingCv.ts';
import { nombrePortal, sincronizar } from '../lib/portales.ts';
import { firma, pesosNormalizados, type Candidato } from '../lib/tipos.ts';
import { BarraProgreso, Puntaje, Vacio } from '../componentes/ui.tsx';
import { fecha, InsigniaPortal } from './Convocatorias.tsx';
import type { PropsParte } from './ConvocatoriaVista.tsx';

export function ParteCv({ empresa, conv, candidatos, guardar, quitar, guardarConv }: PropsParte) {
  const [progreso, setProgreso] = useState<{ texto: string; pct: number | null } | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const conCv = candidatos.filter((c) => c.archivoCv);
  const vigente = firma(conv.requisitos);
  const pendientes = conCv.filter((c) => !c.cv || c.cv.firma !== vigente).length;
  const orden = [...conCv].sort((a, b) => (a.cv?.ranking ?? 1e9) - (b.cv?.ranking ?? 1e9) || a.nombre.localeCompare(b.nombre));
  const pesos = pesosNormalizados(conv.requisitos);

  const traer = async () => {
    setError(''); setAviso('');
    setProgreso({ texto: `Consultando ${conv.origen ? nombrePortal(conv.origen.portal) : 'el portal'}…`, pct: null });
    try {
      const { nuevos, conv: actualizada } = await sincronizar(empresa, conv, candidatos);
      await guardar(nuevos);
      await guardarConv(actualizada);
      setAviso(nuevos.length ? `Llegaron ${nuevos.length} postulante(s) nuevo(s).` : 'Sin postulantes nuevos: la convocatoria está al día.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo sincronizar.'); }
    finally { setProgreso(null); }
  };

  const analizar = async () => {
    setError(''); setAviso('');
    setProgreso({ texto: 'Preparando el modelo de lenguaje…', pct: null });
    try {
      const res = await rankear(conv, conCv, (q, t) => similitudes(q, t, (texto, pct) => setProgreso({ texto, pct })));
      await guardar(conCv.map((c) => ({ ...c, cv: res[c.id] })));
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo analizar.'); }
    finally { setProgreso(null); }
  };

  const preseleccionarTop = async () => {
    const top = new Set(orden.filter((c) => c.cv && !c.cv.sinTexto).slice(0, conv.topN).map((c) => c.id));
    await guardar(conCv.map((c) => ({ ...c, preseleccionado: top.has(c.id) || (!!c.entrevista && c.preseleccionado) })));
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 300px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }} className="parte-cv">
      <aside style={{ display: 'grid', gap: 16 }}>
        <section className="tarjeta" style={{ display: 'grid', gap: 10 }}>
          <div className="fila entre"><h3>Origen de los postulantes</h3>{conv.origen && <InsigniaPortal portal={conv.origen.portal} />}</div>
          {conv.origen ? (
            <>
              <p className="ayuda">Aviso {conv.origen.avisoId} · publicado el {fecha(conv.origen.publicadoEl)}{conv.origen.modalidad ? ` · ${conv.origen.modalidad}` : ''}</p>
              <p className="ayuda"><Users size={14} style={{ verticalAlign: '-2px' }} /> {conCv.length} postulantes consolidados. Última sincronización: {new Date(conv.origen.sincronizadoAt).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}.</p>
              <button className="boton secundario" disabled={!!progreso} onClick={() => void traer()}><RefreshCw size={15} />Sincronizar postulantes</button>
            </>
          ) : (
            <p className="ayuda"><Plug size={14} style={{ verticalAlign: '-2px' }} /> Esta convocatoria no está vinculada a un portal. <a href="#/integraciones">Ver integraciones</a></p>
          )}
        </section>
        <section className="tarjeta" style={{ display: 'grid', gap: 10 }}>
          <div><h3>Requisitos del aviso</h3><p className="suave">Peso normalizado</p></div>
          <ul className="lista-req">{conv.requisitos.map((r, k) => <li key={r.id}><span>{r.texto}</span><strong>{Math.round(pesos[k] * 100)}%</strong></li>)}</ul>
        </section>
      </aside>

      <section className="tarjeta" style={{ display: 'grid', gap: 14 }}>
        <div className="fila entre">
          <div><h2>Ranking de CVs</h2><p className="ayuda">Para cada requisito se busca la frase del perfil que mejor lo respalda; el puntaje es relativo a esta convocatoria (el mejor = 100).</p></div>
          <div className="fila">
            <label className="fila" style={{ gap: 6 }}><span className="suave">Top</span>
              <input className="control" type="number" min={1} max={50} value={conv.topN} style={{ width: 64 }} onChange={(e) => void guardarConv({ ...conv, topN: Math.max(1, Number(e.target.value) || 1) })} /></label>
            <button className="boton secundario" disabled={!conCv.some((c) => c.cv)} onClick={() => void preseleccionarTop()}>Invitar a entrevista al Top {conv.topN}</button>
            <button className="boton" disabled={!!progreso || !conCv.length} onClick={() => void analizar()}><Sparkles size={16} />{pendientes ? `Analizar CVs (${pendientes})` : 'Volver a analizar'}</button>
          </div>
        </div>
        {progreso && <BarraProgreso {...progreso} />}
        {error && <p className="alerta">{error}</p>}
        {aviso && <p className="aviso-info">{aviso}</p>}
        {!conCv.length ? <Vacio icono={<Users size={34} />} titulo="Sin postulantes todavía">Los postulantes del aviso llegan desde el portal; usa «Sincronizar postulantes» para traer a los nuevos.</Vacio> : (
          <div className="envoltura-tabla">
            <table className="tabla">
              <thead><tr><th style={{ width: 28 }} /><th className="num">#</th><th>Postulante</th><th>Puntaje CV</th><th>Entrevista</th><th /></tr></thead>
              <tbody>
                {orden.map((c) => {
                  const desactualizado = c.cv && c.cv.firma !== vigente;
                  return (
                    <Fragment key={c.id}>
                      <tr className={abierto === c.id ? 'expandida' : undefined}>
                        <td><button className="boton fantasma" aria-label={`Ver perfil y evidencia de ${c.nombre}`} aria-expanded={abierto === c.id} onClick={() => setAbierto(abierto === c.id ? null : c.id)}>{abierto === c.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button></td>
                        <td className="num">{c.cv?.ranking ?? '—'}</td>
                        <td><strong>{c.nombre}</strong><div className="suave">{c.fuente}{c.perfil?.ciudad ? ` · ${c.perfil.ciudad}` : ''}{c.postuladoEl ? ` · postuló el ${fecha(c.postuladoEl)}` : ''}</div></td>
                        <td style={{ minWidth: 170 }}>
                          {c.cv?.sinTexto ? <span className="etiqueta aviso">Perfil sin datos</span> : <Puntaje valor={c.cv ? c.cv.score * 100 : null} color="var(--p1)" />}
                          {desactualizado && <span className="etiqueta aviso" style={{ marginTop: 4 }}>Requisitos cambiaron</span>}
                        </td>
                        <td><label className="fila" style={{ gap: 6 }}><input type="checkbox" checked={c.preseleccionado} onChange={(e) => void guardar([{ ...c, preseleccionado: e.target.checked }])} /><span className="ayuda">Invitar</span></label></td>
                        <td><button className="boton fantasma" aria-label={`Descartar a ${c.nombre}`} title="Quitar de la convocatoria" onClick={() => { if (confirm(`¿Quitar a ${c.nombre} de la convocatoria?`)) void quitar(c); }}><Trash2 size={15} /></button></td>
                      </tr>
                      {abierto === c.id && (
                        <tr className="expandida"><td /><td colSpan={5}><Detalle c={c} /></td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Detalle({ c }: { c: Candidato }) {
  return (
    <div style={{ display: 'grid', gap: 14, padding: '4px 0' }}>
      {c.cv && (
        <div className="evidencia">
          <h4>Evidencia por requisito</h4>
          {c.cv.porRequisito.map((p) => (
            <div key={p.requisito}><strong>{p.requisito}</strong><Puntaje valor={p.sim === null ? null : p.sim * 100} color="var(--p1)" />{p.evidencia ? <q>{p.evidencia}</q> : <span className="suave">Sin evidencia</span>}</div>
          ))}
        </div>
      )}
      {c.perfil && (
        <div className="perfil-portal">
          <h4>Perfil en {c.fuente}</h4>
          <div>
            <strong>Experiencia</strong>
            {c.perfil.experiencias.length ? c.perfil.experiencias.map((e, i) => (
              <p key={i}><b>{e.puesto}</b> · {e.empresa} <span className="suave">({e.periodo})</span><br /><span className="ayuda">{e.descripcion}</span></p>
            )) : <p className="suave">Sin experiencia registrada.</p>}
          </div>
          <div>
            <strong>Estudios</strong>
            {c.perfil.estudios.map((e, i) => <p key={i}>{e.titulo} · {e.institucion} <span className="suave">({e.nivel}, {e.estado})</span></p>)}
            {c.perfil.idiomas && <p><strong>Idiomas:</strong> {c.perfil.idiomas}</p>}
            {c.perfil.habilidades && <p><strong>Habilidades:</strong> {c.perfil.habilidades}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
