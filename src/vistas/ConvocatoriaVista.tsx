import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import { almacen } from '../lib/almacen.ts';
import type { Candidato, Convocatoria, Empresa } from '../lib/tipos.ts';
import { EditorConvocatoria, InsigniaPortal } from './Convocatorias.tsx';
import { ParteCv } from './ParteCv.tsx';
import { ParteEntrevista } from './ParteEntrevista.tsx';
import { ParteResultado } from './ParteResultado.tsx';

export type Parte = 'cv' | 'entrevista' | 'resultado';
export type PropsParte = {
  empresa: Empresa;
  conv: Convocatoria;
  candidatos: Candidato[];
  /** Guarda los candidatos indicados (nuevos o cambiados) y refresca la vista. */
  guardar: (cambios: Candidato[]) => Promise<void>;
  quitar: (c: Candidato) => Promise<void>;
  guardarConv: (c: Convocatoria) => Promise<void>;
};

const SEGMENTOS: { id: Parte; n: number; titulo: string; detalle: string }[] = [
  { id: 'cv', n: 1, titulo: 'Análisis de CV', detalle: 'Ranking por requisitos' },
  { id: 'entrevista', n: 2, titulo: 'Análisis de entrevista', detalle: 'Video transcrito con Whisper' },
  { id: 'resultado', n: 3, titulo: 'Resultado final', detalle: 'CV + entrevista y decisión' },
];

export function ConvocatoriaVista({ id, parte, empresa }: { id: string; parte: Parte; empresa: Empresa }) {
  const [conv, setConv] = useState<Convocatoria | null | undefined>(undefined);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    void (async () => {
      const c = (await almacen.convocatorias(empresa.id)).find((x) => x.id === id) ?? null;
      setConv(c);
      if (c) setCandidatos(await almacen.candidatos(c.id));
    })();
  }, [id, empresa.id]);

  const guardar = useCallback(async (cambios: Candidato[]) => {
    await almacen.guardarCandidatos(cambios);
    setCandidatos((prev) => {
      const porId = new Map(prev.map((c) => [c.id, c]));
      for (const c of cambios) porId.set(c.id, c);
      return [...porId.values()];
    });
  }, []);
  const quitar = useCallback(async (c: Candidato) => {
    await almacen.borrarCandidato(c);
    setCandidatos((prev) => prev.filter((x) => x.id !== c.id));
  }, []);
  const guardarConv = useCallback(async (c: Convocatoria) => { await almacen.guardarConvocatoria(c); setConv(c); }, []);

  if (conv === undefined) return null;
  if (conv === null) return <div className="tarjeta"><p>No se encontró la convocatoria.</p><a href="#/">Volver a convocatorias</a></div>;

  const props: PropsParte = { empresa, conv, candidatos, guardar, quitar, guardarConv };
  const conteo: Record<Parte, string> = {
    cv: `${candidatos.filter((c) => c.cv).length} de ${candidatos.filter((c) => c.archivoCv).length} CV analizados`,
    entrevista: `${candidatos.filter((c) => c.entrevista).length} de ${candidatos.filter((c) => c.preseleccionado).length} entrevistas`,
    resultado: `${candidatos.filter((c) => c.decision !== 'Pendiente').length} decisiones`,
  };
  return (
    <>
      <div className="titulo-pagina">
        <div>
          <a href="#/" className="suave" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}><ArrowLeft size={14} />Convocatorias</a>
          <h1 style={{ marginTop: 4 }}>{conv.titulo}</h1>
          <p className="fila" style={{ gap: 8 }}>{conv.origen && <InsigniaPortal portal={conv.origen.portal} />}<span>{conv.area ? `${conv.area} · ` : ''}{conv.requisitos.length} requisitos · {candidatos.length} postulantes</span></p>
          {conv.descripcion && <p className="ayuda" style={{ maxWidth: 820, marginTop: 6 }}>{conv.descripcion}</p>}
        </div>
        <button className="boton secundario" onClick={() => setEditando(true)}><Pencil size={15} />Editar requisitos</button>
      </div>
      <nav className="segmentos" aria-label="Partes del proceso">
        {SEGMENTOS.map((s) => (
          <a key={s.id} className={`segmento p${s.n}`} href={`#/convocatoria/${conv.id}/${s.id}`} aria-current={parte === s.id ? 'page' : undefined}>
            <span className="n">{s.n}</span><span><strong>{s.titulo}</strong><small>{conteo[s.id]}</small></span>
          </a>
        ))}
      </nav>
      {parte === 'cv' && <ParteCv {...props} />}
      {parte === 'entrevista' && <ParteEntrevista {...props} />}
      {parte === 'resultado' && <ParteResultado {...props} />}
      {editando && <EditorConvocatoria conv={conv} onCerrar={() => setEditando(false)}
        onGuardado={(c) => { setConv(c); setEditando(false); }}
        onBorrar={async () => {
          if (!confirm(`¿Eliminar «${conv.titulo}» con sus ${candidatos.length} candidatos? No se puede deshacer.`)) return;
          await almacen.borrarConvocatoria(conv);
          location.hash = '#/';
        }} />}
    </>
  );
}
