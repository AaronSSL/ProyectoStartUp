import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Play, RefreshCw, UserPlus, Video } from 'lucide-react';
import { almacen } from '../lib/almacen.ts';
import { analizarEntrevista, PESOS, subtitulosVtt, UMBRAL_SUSTENTO } from '../lib/entrevista.ts';
import { similitudes, transcribir } from '../lib/ia.ts';
import { firma, mmss, nuevoId, type Candidato } from '../lib/tipos.ts';
import { BarraProgreso, Modal, Puntaje, Vacio, ZonaArchivos } from '../componentes/ui.tsx';
import type { PropsParte } from './ConvocatoriaVista.tsx';

const VIDEO = 'video/*,audio/*,.mp4,.mov,.webm,.mkv,.m4a,.mp3,.wav';

export function ParteEntrevista({ conv, candidatos, guardar }: PropsParte) {
  const invitados = candidatos.filter((c) => c.preseleccionado).sort((a, b) => (a.cv?.ranking ?? 1e9) - (b.cv?.ranking ?? 1e9));
  const [seleccion, setSeleccion] = useState<string | null>(invitados[0]?.id ?? null);
  const [nuevo, setNuevo] = useState(false);
  const actual = invitados.find((c) => c.id === seleccion) ?? invitados[0];

  return (
    <div className="entrevista">
      <aside style={{ display: 'grid', gap: 10 }}>
        <div className="fila entre"><h3>Invitados a entrevista</h3><span className="suave">{invitados.length}</span></div>
        {!invitados.length && <p className="ayuda">Marca «Invitar» en la Parte 1, o agrega a alguien que solo tiene entrevista.</p>}
        <div className="lista-candidatos">
          {invitados.map((c) => (
            <button key={c.id} className="item-candidato" aria-pressed={actual?.id === c.id} onClick={() => setSeleccion(c.id)}>
              <span><strong>{c.nombre}</strong><br /><span className="suave">{c.cv ? `CV #${c.cv.ranking}` : c.archivoCv ? 'CV sin analizar' : 'Solo entrevista'}</span></span>
              {c.entrevista ? <span className="etiqueta p2">{c.entrevista.puntaje.toFixed(0)}</span> : c.videoId ? <span className="etiqueta">Video listo</span> : <span className="etiqueta aviso">Sin video</span>}
            </button>
          ))}
        </div>
        <button className="boton secundario" onClick={() => setNuevo(true)}><UserPlus size={15} />Candidato solo con entrevista</button>
      </aside>
      {actual ? <PanelCandidato key={actual.id} c={actual} conv={conv} guardar={guardar} />
        : <div className="tarjeta"><Vacio icono={<Video size={36} />} titulo="Nadie invitado todavía">En la Parte 1, usa «Invitar a entrevista al Top N» o marca a los candidatos uno por uno.</Vacio></div>}
      {nuevo && <NuevoSoloEntrevista onCerrar={() => setNuevo(false)} onCrear={async (nombre) => {
        const c: Candidato = { id: nuevoId(), convocatoriaId: conv.id, nombre, archivoCv: '', textoCv: '', fragmentos: [], fuente: 'Solo entrevista', preseleccionado: true, decision: 'Pendiente', nota: '' };
        await guardar([c]); setSeleccion(c.id); setNuevo(false);
      }} />}
    </div>
  );
}

function NuevoSoloEntrevista({ onCerrar, onCrear }: { onCerrar: () => void; onCrear: (nombre: string) => Promise<void> }) {
  const [nombre, setNombre] = useState('');
  return (
    <Modal titulo="Candidato solo con entrevista" onCerrar={onCerrar}
      pie={<><button className="boton secundario" onClick={onCerrar}>Cancelar</button><button className="boton" disabled={!nombre.trim()} onClick={() => void onCrear(nombre.trim())}>Agregar</button></>}>
      <p className="ayuda">Para quien no envió CV (por ejemplo, una referencia). Su puntaje final será solo el de la entrevista.</p>
      <label className="campo">Nombre completo<input value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} /></label>
    </Modal>
  );
}

function PanelCandidato({ c, conv, guardar }: { c: Candidato; conv: PropsParte['conv']; guardar: PropsParte['guardar'] }) {
  const video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [esAudio, setEsAudio] = useState(false);
  const [progreso, setProgreso] = useState<{ texto: string; pct: number | null } | null>(null);
  const [error, setError] = useState('');
  const [tiempo, setTiempo] = useState(0);
  const e = c.entrevista;
  const desactualizado = e && e.firma !== firma(conv.requisitos);

  useEffect(() => {
    let creada: string | null = null;
    void (async () => {
      const blob = c.videoId ? await almacen.video(c.videoId) : undefined;
      if (blob) { creada = URL.createObjectURL(blob); setUrl(creada); setEsAudio(blob.type.startsWith('audio/')); } else setUrl(null);
    })();
    return () => { if (creada) URL.revokeObjectURL(creada); };
  }, [c.videoId]);

  const vtt = useMemo(() => (e ? URL.createObjectURL(new Blob([subtitulosVtt(e.transcripcion.segmentos)], { type: 'text/vtt' })) : null), [e]);
  useEffect(() => () => { if (vtt) URL.revokeObjectURL(vtt); }, [vtt]);

  const ir = (t: number) => { if (video.current) { video.current.currentTime = t; void video.current.play(); } };
  const subirVideo = async (archivos: File[]) => {
    const f = archivos[0];
    if (!f) return;
    const id = c.videoId ?? nuevoId();
    await almacen.guardarVideo(id, f);
    await guardar([{ ...c, videoId: id, archivoVideo: f.name, entrevista: undefined }]);
  };
  const analizar = async (retranscribir: boolean) => {
    setError('');
    try {
      let trans = !retranscribir && e ? e.transcripcion : null;
      if (!trans) {
        const blob = c.videoId ? await almacen.video(c.videoId) : undefined;
        if (!blob) throw new Error('Primero sube el video de la entrevista.');
        trans = await transcribir(blob, (texto, pct) => setProgreso({ texto, pct }));
      }
      setProgreso({ texto: 'Comparando lo que dijo con los requisitos…', pct: null });
      const resultado = await analizarEntrevista(trans, conv, (q, t) => similitudes(q, t, (texto, pct) => setProgreso({ texto, pct })));
      await guardar([{ ...c, entrevista: resultado }]);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo analizar la entrevista.'); }
    finally { setProgreso(null); }
  };

  if (!url) return (
    <section className="tarjeta" style={{ display: 'grid', gap: 12 }}>
      <h2>{c.nombre}</h2>
      <ZonaArchivos aceptar={VIDEO} onArchivos={(f) => void subirVideo(f)}>
        <Video size={26} /><p><strong>Sube el video de la entrevista</strong></p><p className="suave">MP4, WebM, MOV o solo audio · se guarda en este navegador</p>
      </ZonaArchivos>
    </section>
  );

  return (
    <section className="tarjeta" style={{ display: 'grid', gap: 14 }}>
      <div className="fila entre">
        <div><h2>{c.nombre}</h2><p className="suave">{c.archivoVideo}</p></div>
        <div className="fila">
          <label className="boton secundario chico"><Video size={14} />Cambiar video<input type="file" accept={VIDEO} hidden onChange={(ev) => { void subirVideo(Array.from(ev.target.files ?? [])); ev.target.value = ''; }} /></label>
          {desactualizado && <button className="boton secundario chico" disabled={!!progreso} onClick={() => void analizar(false)}><RefreshCw size={14} />Recalcular con los requisitos nuevos</button>}
          <button className="boton" style={{ background: 'var(--p2)' }} disabled={!!progreso} onClick={() => void analizar(true)}><Mic size={16} />{e ? 'Transcribir de nuevo' : 'Transcribir y analizar'}</button>
        </div>
      </div>
      {progreso && <BarraProgreso {...progreso} />}
      {error && <p className="alerta">{error}</p>}
      <div className="panel-entrevista">
        <div style={{ display: 'grid', gap: 12 }}>
          {esAudio ? <audio ref={video as unknown as React.RefObject<HTMLAudioElement>} src={url} controls style={{ width: '100%' }} onTimeUpdate={(ev) => setTiempo(ev.currentTarget.currentTime)} />
            : <video ref={video} className="reproductor" src={url} controls onTimeUpdate={(ev) => setTiempo(ev.currentTarget.currentTime)}>
              {vtt && <track kind="subtitles" srcLang="es" label="Español" src={vtt} default />}
            </video>}
          {e && (
            <div>
              <div className="fila entre" style={{ marginBottom: 6 }}><h3>Transcripción</h3><span className="suave">{e.transcripcion.modelo} · {e.transcripcion.dispositivo}</span></div>
              <div className="transcripcion">
                {e.transcripcion.segmentos.map((s, i) => (
                  <button key={i} className={tiempo >= s.inicio && tiempo < s.fin ? 'actual' : undefined} onClick={() => ir(s.inicio)}>
                    <span className="tiempo">{mmss(s.inicio)}</span><span>{s.texto}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {e ? <Analisis c={c} ir={ir} /> : <Vacio icono={<Mic size={34} />} titulo="Entrevista sin analizar">«Transcribir y analizar» convierte el audio en texto con Whisper y lo compara con los requisitos. Todo ocurre en este navegador.</Vacio>}
      </div>
    </section>
  );
}

function Analisis({ c, ir }: { c: Candidato; ir: (t: number) => void }) {
  const e = c.entrevista!;
  const m = e.metricas;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="fila" style={{ gap: 14 }}>
        <span className="gran-puntaje">{e.puntaje.toFixed(0)}</span>
        <span className="ayuda">Puntaje de la entrevista (0-100)<br />{Math.round(PESOS.contenido * 100)}% contenido · {Math.round(PESOS.fluidez * 100)}% fluidez · {Math.round(PESOS.claridad * 100)}% claridad</span>
      </div>
      <div className="sub-puntajes">
        <div><span>Contenido</span><strong>{e.contenido.toFixed(0)}</strong><span>responde a los requisitos</span></div>
        <div><span>Fluidez</span><strong>{e.fluidez.toFixed(0)}</strong><span>{m.ppm.toFixed(0)} palabras/min · {m.pausasLargas} pausas largas</span></div>
        <div><span>Claridad</span><strong>{e.claridad.toFixed(0)}</strong><span>{m.muletillasTotal} muletillas · {m.repeticiones} repeticiones</span></div>
      </div>
      <div>
        <h3 style={{ marginBottom: 6 }}>Evidencia por requisito</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {e.porRequisito.map((p) => (
            <div key={p.requisito} style={{ display: 'grid', gap: 4 }}>
              <div className="fila entre"><strong style={{ fontSize: '.88rem' }}>{p.requisito}</strong>{p.puntaje >= UMBRAL_SUSTENTO ? <span className="etiqueta ok">Sustentado</span> : p.negacion ? <span className="etiqueta aviso">Lo niega</span> : <span className="etiqueta">Débil</span>}</div>
              <Puntaje valor={p.puntaje} color="var(--p2)" />
              <div className="fila" style={{ gap: 6, alignItems: 'baseline' }}><button className="tiempo" onClick={() => ir(p.inicio)}><Play size={11} /> {mmss(p.inicio)}</button><q className="ayuda" style={{ fontStyle: 'italic' }}>{p.evidencia}</q></div>
            </div>
          ))}
        </div>
      </div>
      <div><h3 style={{ marginBottom: 6 }}>Observaciones</h3><ul className="observaciones">{e.observaciones.map((o) => <li key={o}>{o}</li>)}</ul></div>
      <p className="suave">Solo se analiza lo que la persona dice y cómo lo dice. No se evalúan rostro, gestos, apariencia, la voz como rasgo personal ni emociones.{!e.transcripcion.tiemposPorPalabra && ' Los tiempos por palabra son estimados en este navegador.'}</p>
    </div>
  );
}
