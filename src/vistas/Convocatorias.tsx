import { useEffect, useState } from 'react';
import { Briefcase, Download, Plug, Plus, Trash2, Users } from 'lucide-react';
import { almacen } from '../lib/almacen.ts';
import { avisosDisponibles, importarAviso, nombrePortal, PORTALES, type AvisoPortal } from '../lib/portales.ts';
import { nuevoId, type Candidato, type Convocatoria, type Empresa, type Portal, type Requisito } from '../lib/tipos.ts';
import { Modal, Vacio } from '../componentes/ui.tsx';

type Resumen = { conv: Convocatoria; candidatos: number; conCv: number; entrevistas: number; decididos: number };

export function Convocatorias({ empresa }: { empresa: Empresa }) {
  const [lista, setLista] = useState<Resumen[] | null>(null);
  const [importando, setImportando] = useState(false);
  const conectados = Object.entries(empresa.integraciones).filter(([, s]) => s?.estado === 'activa').map(([p]) => nombrePortal(p as Portal));

  const cargar = async () => {
    const convs = await almacen.convocatorias(empresa.id);
    const resumenes = await Promise.all(convs.map(async (conv) => {
      const cands: Candidato[] = await almacen.candidatos(conv.id);
      return { conv, candidatos: cands.length, conCv: cands.filter((c) => c.cv).length, entrevistas: cands.filter((c) => c.entrevista).length, decididos: cands.filter((c) => c.decision !== 'Pendiente').length };
    }));
    setLista(resumenes.sort((a, b) => (b.conv.origen?.publicadoEl ?? b.conv.creadaAt).localeCompare(a.conv.origen?.publicadoEl ?? a.conv.creadaAt)));
  };
  useEffect(() => { void cargar(); }, [empresa.id]);

  return (
    <>
      <div className="titulo-pagina">
        <div><h1>Convocatorias</h1><p>Cada aviso publicado en un portal es una convocatoria: sus postulantes llegan solos y pasan por las tres partes (CV, entrevista y resultado).</p></div>
        <button className="boton" disabled={!conectados.length} title={conectados.length ? undefined : 'Primero conecta un portal en Integraciones'} onClick={() => setImportando(true)}><Download size={16} />Importar aviso</button>
      </div>
      {!conectados.length && (
        <div className="aviso-info fila" style={{ marginBottom: 16 }}><Plug size={16} />Aún no hay portales conectados. <a href="#/integraciones">Solicita la integración con LinkedIn, Bumeran o Computrabajo</a> para traer tus avisos y postulantes.</div>
      )}
      {lista && !lista.length && (
        <div className="tarjeta"><Vacio icono={<Briefcase size={36} />} titulo="Aún no hay convocatorias">{conectados.length ? 'Importa un aviso de tus portales conectados para empezar.' : 'Cuando soporte técnico active tu integración, tus avisos aparecerán aquí.'}</Vacio></div>
      )}
      <div className="rejilla">
        {lista?.map(({ conv, candidatos, conCv, entrevistas, decididos }) => (
          <a key={conv.id} className="tarjeta" href={`#/convocatoria/${conv.id}/cv`} style={{ textDecoration: 'none', color: 'inherit', display: 'grid', gap: 10 }}>
            <div className="fila entre"><h3>{conv.titulo}</h3>{conv.origen && <InsigniaPortal portal={conv.origen.portal} />}</div>
            <p className="ayuda">{conv.area ? `${conv.area} · ` : ''}{conv.requisitos.length} requisitos{conv.origen ? ` · publicado el ${fecha(conv.origen.publicadoEl)}` : ''}</p>
            <div className="fila" style={{ gap: 6 }}>
              <span className="etiqueta"><Users size={13} />{candidatos} postulantes</span>
              <span className="etiqueta p1">{conCv} CV analizados</span>
              <span className="etiqueta p2">{entrevistas} entrevistas</span>
              <span className="etiqueta ok">{decididos} decididos</span>
            </div>
          </a>
        ))}
      </div>
      {importando && <ImportarAviso empresa={empresa} importados={new Set(lista?.map((r) => `${r.conv.origen?.portal}:${r.conv.origen?.avisoId}`))}
        onCerrar={() => setImportando(false)} onImportado={(c) => { setImportando(false); location.hash = `#/convocatoria/${c.id}/cv`; }} />}
    </>
  );
}

export const fecha = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });

export function InsigniaPortal({ portal }: { portal: Portal }) {
  const p = PORTALES.find((x) => x.id === portal)!;
  return <span className="etiqueta" style={{ background: p.color, color: '#fff' }}>{p.nombre}</span>;
}

function ImportarAviso({ empresa, importados, onCerrar, onImportado }: { empresa: Empresa; importados: Set<string>; onCerrar: () => void; onImportado: (c: Convocatoria) => void }) {
  const [avisos, setAvisos] = useState<{ portal: Portal; aviso: AvisoPortal }[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { avisosDisponibles(empresa).then(setAvisos, () => setError('No se pudieron leer los avisos del portal.')); }, [empresa]);
  const importar = async (portal: Portal, aviso: AvisoPortal) => {
    setOcupado(aviso.avisoId); setError('');
    try { onImportado(await importarAviso(empresa, portal, aviso)); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo importar el aviso.'); setOcupado(null); }
  };
  return (
    <Modal titulo="Importar aviso" onCerrar={onCerrar} ancho={720} pie={<button className="boton secundario" onClick={onCerrar}>Cerrar</button>}>
      <p className="ayuda">Avisos publicados en tus portales conectados. Al importarlo se crean la convocatoria con sus requisitos y la lista de postulantes.</p>
      {error && <p className="alerta">{error}</p>}
      {avisos && !avisos.length && <p className="ayuda">Tu integración todavía no tiene avisos. Soporte técnico te avisará cuando quede configurada.</p>}
      <div style={{ display: 'grid', gap: 10 }}>
        {avisos?.map(({ portal, aviso }) => {
          const ya = importados.has(`${portal}:${aviso.avisoId}`);
          return (
            <div key={aviso.avisoId} className="tarjeta fila entre" style={{ padding: 12, boxShadow: 'none' }}>
              <div><div className="fila" style={{ gap: 8 }}><strong>{aviso.titulo}</strong><InsigniaPortal portal={portal} /></div>
                <span className="suave">Aviso {aviso.avisoId} · {aviso.modalidad} · {aviso.postulantes.length} postulantes · {fecha(aviso.publicadoEl)}</span></div>
              {ya ? <span className="etiqueta ok">Ya importado</span>
                : <button className="boton chico" disabled={!!ocupado} onClick={() => void importar(portal, aviso)}>{ocupado === aviso.avisoId ? 'Importando…' : 'Importar'}</button>}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/** Editar la convocatoria: el título y los requisitos vienen del aviso, pero el equipo puede ajustar los pesos. */
export function EditorConvocatoria({ conv, onCerrar, onGuardado, onBorrar }: { conv: Convocatoria; onCerrar: () => void; onGuardado: (c: Convocatoria) => void; onBorrar?: () => void }) {
  const [titulo, setTitulo] = useState(conv.titulo);
  const [area, setArea] = useState(conv.area);
  const [reqs, setReqs] = useState<Requisito[]>(conv.requisitos);
  const [error, setError] = useState('');
  const validos = reqs.filter((r) => r.texto.trim());
  const total = validos.reduce((s, r) => s + Math.max(r.peso, 0), 0);

  const guardar = async () => {
    if (!titulo.trim()) return setError('Escribe el nombre del puesto.');
    if (!validos.length) return setError('Agrega al menos un requisito.');
    if (total <= 0) return setError('Los pesos deben sumar más de 0.');
    const c = { ...conv, titulo: titulo.trim(), area: area.trim(), requisitos: validos.map((r) => ({ ...r, texto: r.texto.trim() })) };
    await almacen.guardarConvocatoria(c);
    onGuardado(c);
  };

  return (
    <Modal titulo="Editar convocatoria" onCerrar={onCerrar} ancho={720}
      pie={<>
        {onBorrar && <button className="boton peligro" style={{ marginRight: 'auto' }} onClick={onBorrar}><Trash2 size={15} />Eliminar</button>}
        <button className="boton secundario" onClick={onCerrar}>Cancelar</button>
        <button className="boton" onClick={() => void guardar()}>Guardar</button>
      </>}>
      <div className="fila" style={{ alignItems: 'end' }}>
        <label className="campo" style={{ flex: 2, minWidth: 220 }}>Puesto<input value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Analista de Cobranzas" /></label>
        <label className="campo" style={{ flex: 1, minWidth: 140 }}>Área<input value={area} maxLength={60} onChange={(e) => setArea(e.target.value)} placeholder="Ej.: Finanzas" /></label>
      </div>
      <div>
        <div className="fila entre" style={{ marginBottom: 8 }}>
          <h3>Requisitos y su peso</h3>
        </div>
        <div className="requisitos">
          {reqs.map((r, i) => (
            <div key={r.id} className="requisito">
              <input className="control" aria-label={`Requisito ${i + 1}`} value={r.texto} placeholder="Ej.: Experiencia mínima de 2 años en cobranzas"
                onChange={(e) => setReqs(reqs.map((x) => (x.id === r.id ? { ...x, texto: e.target.value } : x)))} />
              <input className="control" aria-label={`Peso del requisito ${i + 1}`} type="number" min={0} max={100} value={r.peso}
                onChange={(e) => setReqs(reqs.map((x) => (x.id === r.id ? { ...x, peso: Number(e.target.value) } : x)))} />
              <button className="boton fantasma" aria-label={`Quitar requisito ${i + 1}`} onClick={() => setReqs(reqs.filter((x) => x.id !== r.id))}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <div className="fila entre" style={{ marginTop: 8 }}>
          <button className="boton secundario chico" onClick={() => setReqs([...reqs, { id: nuevoId(), texto: '', peso: 20 }])}><Plus size={14} />Agregar requisito</button>
          <span className="suave">Los pesos se normalizan: suman {total} → 100%.</span>
        </div>
      </div>
      <p className="ayuda">Escribe cada requisito como aparecería en un CV («Manejo de Excel avanzado», «Inglés intermedio»): la IA busca en cada CV y en cada entrevista el fragmento que mejor lo respalda.</p>
      {error && <p className="alerta">{error}</p>}
    </Modal>
  );
}
