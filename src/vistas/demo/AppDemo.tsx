// Aplicación del modo demo (Demo Day): 4 clientes con datos inventados de demo/demo_clientes.json.
// Solo se carga con DEMO_MODE=true (ver main.tsx). No abre la base del navegador ni escribe en ninguna parte.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, BarChart3, Briefcase, Building2, Check, Columns3, Quote, Users } from 'lucide-react';
import { obtenerRepositorio } from '../../lib/modoDemo.ts';
import { cambio, formatoValor, EN_MEDICION } from '../../lib/formatoMetricas.ts';
import type { Cliente, FilaRanking, MetricasCliente, Publicacion, Repositorio } from '../../lib/repositorio.ts';
import { iniciales, Puntaje, Vacio } from '../../componentes/ui.tsx';

type Ruta =
  | { vista: 'clientes' }
  | { vista: 'publicaciones'; clienteId: string; publicacionId?: string }
  | { vista: 'metricas'; clienteId: string }
  | { vista: 'comparativa' };

function leerRuta(): Ruta {
  const p = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  if (p[0] === 'comparativa') return { vista: 'comparativa' };
  if (p[0] === 'cliente' && p[1]) {
    if (p[2] === 'metricas') return { vista: 'metricas', clienteId: p[1] };
    return { vista: 'publicaciones', clienteId: p[1], publicacionId: p[2] === 'publicacion' ? p[3] : undefined };
  }
  return { vista: 'clientes' };
}

const claseEstado = (estado: string) => (estado === 'Uso completo' ? 'etiqueta ok' : 'etiqueta aviso');

export default function AppDemo() {
  const [repo, setRepo] = useState<Repositorio | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [error, setError] = useState('');
  const [ruta, setRuta] = useState<Ruta>(leerRuta);

  useEffect(() => {
    obtenerRepositorio(true)
      .then(async (r) => { setClientes(await r.clientes()); setRepo(r); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos de demostración.'));
  }, []);
  useEffect(() => {
    const cambioRuta = () => { setRuta(leerRuta()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', cambioRuta);
    return () => window.removeEventListener('hashchange', cambioRuta);
  }, []);

  const clienteId = ruta.vista === 'publicaciones' || ruta.vista === 'metricas' ? ruta.clienteId : null;
  const cliente = clientes.find((c) => c.id === clienteId);
  const enlace = (href: string, activo: boolean, icono: ReactNode, texto: string) =>
    <a className="nav" href={href} aria-current={activo ? 'page' : undefined}>{icono}<span className="texto-nav">{texto}</span></a>;

  return (
    <div className="modo-demo">
      <div className="banda-demo" role="note">DEMO · datos de demostración</div>
      <div className="app">
        <nav className="lateral" aria-label="Secciones">
          <a className="logo" href="#/" title="CV UP"><img src="/logo.png" alt="" /><span className="texto-nav">CV <em>UP</em><small>Selección con IA</small></span></a>
          {enlace('#/', ruta.vista === 'clientes', <Building2 size={18} />, 'Clientes')}
          {enlace('#/comparativa', ruta.vista === 'comparativa', <Columns3 size={18} />, 'Comparativa')}
          {cliente && <>
            <p className="seccion-lateral texto-nav">{cliente.nombre}</p>
            {enlace(`#/cliente/${cliente.id}`, ruta.vista === 'publicaciones', <Briefcase size={18} />, 'Mis publicaciones')}
            {enlace(`#/cliente/${cliente.id}/metricas`, ruta.vista === 'metricas', <BarChart3 size={18} />, 'Métricas')}
          </>}
          <p className="pie texto-nav">Modo demo: los datos son inventados y los cambios solo duran mientras la página está abierta.</p>
        </nav>
        <div className="principal">
          <header className="cabecera">
            <span className="suave">{cliente ? `${cliente.nombre} · ${cliente.sector}` : 'Piloto con 4 clientes'}</span>
            {cliente && <a className="boton secundario chico" href="#/">Cambiar de cliente</a>}
          </header>
          <main className="contenido">
            {error && <p className="alerta">{error}</p>}
            {repo && ruta.vista === 'clientes' && <SelectorClientes clientes={clientes} />}
            {repo && ruta.vista === 'comparativa' && <Comparativa repo={repo} clientes={clientes} />}
            {repo && clienteId && !cliente && <Vacio icono={<Building2 size={32} />} titulo="Ese cliente no existe en la demo"><a href="#/">Volver a los clientes</a></Vacio>}
            {repo && cliente && ruta.vista === 'publicaciones' && <MisPublicaciones key={cliente.id} repo={repo} cliente={cliente} publicacionId={ruta.publicacionId} />}
            {repo && cliente && ruta.vista === 'metricas' && <PanelMetricas key={cliente.id} repo={repo} cliente={cliente} />}
          </main>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 1. Selector de cliente

function SelectorClientes({ clientes }: { clientes: Cliente[] }) {
  return (
    <>
      <div className="titulo-pagina"><div><h1>Clientes del piloto</h1><p>Elige un cliente para ver sus publicaciones, su ranking y sus métricas.</p></div>
        <a className="boton secundario" href="#/comparativa"><Columns3 size={16} />Ver comparativa</a></div>
      <div className="rejilla">
        {clientes.map((c) => (
          <a key={c.id} className="tarjeta tarjeta-cliente" href={`#/cliente/${c.id}`}>
            <span className="avatar">{iniciales(c.nombre)}</span>
            <div style={{ minWidth: 0 }}>
              <h3>{c.nombre}</h3>
              <p className="ayuda">{c.sector}</p>
              <span className={claseEstado(c.estadoUso)} style={{ marginTop: 8 }}>{c.estadoUso}</span>
            </div>
            <ArrowRight size={18} className="flecha" />
          </a>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 2. Mis publicaciones y ranking

function MisPublicaciones({ repo, cliente, publicacionId }: { repo: Repositorio; cliente: Cliente; publicacionId?: string }) {
  const [pubs, setPubs] = useState<Publicacion[] | null>(null);
  const [filas, setFilas] = useState<FilaRanking[] | null>(null);
  useEffect(() => { void repo.publicaciones(cliente.id).then(setPubs); }, [repo, cliente.id]);
  const cargarRanking = useCallback(() => {
    if (publicacionId) void repo.ranking(publicacionId).then(setFilas); else setFilas(null);
  }, [repo, publicacionId]);
  useEffect(cargarRanking, [cargarRanking]);

  const elegida = pubs?.find((p) => p.id === publicacionId);
  const pasar = async (f: FilaRanking) => { await repo.pasarASegundaRonda(publicacionId!, f.id); cargarRanking(); };

  return (
    <>
      <div className="titulo-pagina"><div><h1>Mis publicaciones</h1><p>Avisos de {cliente.nombre} en las bolsas de trabajo conectadas.</p></div></div>
      <div className="rejilla">
        {pubs?.map((p) => (
          <a key={p.id} href={`#/cliente/${cliente.id}/publicacion/${p.id}`} className={`tarjeta tarjeta-publicacion${p.id === publicacionId ? ' elegida' : ''}`} aria-current={p.id === publicacionId ? 'true' : undefined}>
            <h3>{p.puesto}</h3>
            <div className="fila" style={{ marginTop: 8 }}>
              <span className="etiqueta p1">{p.bolsa}</span>
              <span className="ayuda"><Users size={14} style={{ verticalAlign: -2 }} /> {p.postulantes.toLocaleString('es-PE')} postulantes</span>
            </div>
          </a>
        ))}
      </div>

      <section className="tarjeta" style={{ marginTop: 20 }}>
        {!elegida ? (
          <Vacio icono={<Briefcase size={32} />} titulo="Elige una publicación">Verás el ranking de postulantes que armó CV UP con Multilingual-E5.</Vacio>
        ) : (
          <>
            <div className="fila" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <div><h2>Ranking · {elegida.puesto}</h2><p className="ayuda">{elegida.postulantes.toLocaleString('es-PE')} postulantes desde {elegida.bolsa}. Se muestran los mejores puntajes.</p></div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="tabla">
                <thead><tr><th className="num">Puesto</th><th>Candidato</th><th style={{ minWidth: 170 }}>Puntaje</th><th>Por qué</th><th aria-label="Acción" /></tr></thead>
                <tbody>
                  {filas?.map((f) => (
                    <tr key={f.id}>
                      <td className="num"><strong>{f.puesto}</strong></td>
                      <td>{f.candidato}</td>
                      <td><Puntaje valor={f.puntaje} /></td>
                      <td className="ayuda">{f.porQue}</td>
                      <td style={{ textAlign: 'right' }}>
                        {f.segundaRonda
                          ? <span className="etiqueta ok"><Check size={13} />En 2ª ronda</span>
                          : <button className="boton chico" onClick={() => void pasar(f)}>Pasar a 2ª ronda</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="suave" style={{ marginTop: 10 }}>En la demo, «Pasar a 2ª ronda» solo cambia el estado en esta pantalla; no se guarda ni se avisa al postulante.</p>
          </>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------- 3. Panel de métricas por cliente

function PanelMetricas({ repo, cliente }: { repo: Repositorio; cliente: Cliente }) {
  const [m, setM] = useState<MetricasCliente | null | undefined>(undefined);
  useEffect(() => { void repo.metricas(cliente.id).then(setM); }, [repo, cliente.id]);
  if (m === undefined) return null;
  if (m === null) return <Vacio icono={<BarChart3 size={32} />} titulo="Sin métricas registradas" />;

  return (
    <>
      <div className="titulo-pagina"><div><h1>Métricas · {cliente.nombre}</h1><p>Antes de CV UP → con CV UP.</p></div>
        <span className={claseEstado(cliente.estadoUso)}>{cliente.estadoUso}</span></div>
      <div className="rejilla">
        {m.definiciones.map((d) => {
          const v = m.valores[d.id];
          const c = cambio(d, v);
          return (
            <section key={d.id} className="tarjeta tarjeta-metrica">
              <h3>{d.nombre}</h3>
              {v ? (
                <div className="antes-despues">
                  <div><span className="suave">Antes</span><strong className={v.antes === null ? 'en-medicion' : ''}>{formatoValor(v.antes, d.unidad)}</strong></div>
                  <ArrowRight size={18} aria-label="pasa a" />
                  <div><span className="suave">Con CV UP</span><strong className={v.despues === null ? 'en-medicion' : 'despues'}>{formatoValor(v.despues, d.unidad)}</strong></div>
                </div>
              ) : <p className="antes-despues"><strong className="en-medicion">{EN_MEDICION}</strong></p>}
              {c && <span className={c.mejora ? 'etiqueta ok' : 'etiqueta'}>{c.texto}</span>}
              <p className="nota-datos">{m.notaDatos}</p>
            </section>
          );
        })}
        {m.coincidenciaTerna && (
          <section className="tarjeta tarjeta-metrica">
            <h3>Coincidencia con la terna de RR. HH.</h3>
            <p className="antes-despues"><strong className="despues">{m.coincidenciaTerna}</strong></p>
            <p className="ayuda">Candidatos de la terna final que CV UP también puso arriba del ranking.</p>
            <p className="nota-datos">{m.notaDatos}</p>
          </section>
        )}
      </div>
      {m.cita && (
        <figure className="tarjeta cita">
          <Quote size={22} aria-hidden="true" />
          <blockquote>{m.cita}</blockquote>
          {m.contacto && <figcaption>{m.contacto.nombre} · {m.contacto.cargo}, {cliente.nombre}</figcaption>}
        </figure>
      )}
    </>
  );
}

// ---------------------------------------------------------------- 4. Vista comparativa

function Comparativa({ repo, clientes }: { repo: Repositorio; clientes: Cliente[] }) {
  const [metricas, setMetricas] = useState<(MetricasCliente | null)[] | null>(null);
  useEffect(() => { void Promise.all(clientes.map((c) => repo.metricas(c.id))).then(setMetricas); }, [repo, clientes]);
  const base = metricas?.find((x) => x !== null);
  if (!metricas || !base) return null;

  return (
    <>
      <div className="titulo-pagina"><div><h1>Comparativa de clientes</h1><p>Cada celda: antes → con CV UP.</p></div></div>
      <div className="tarjeta" style={{ overflowX: 'auto', padding: 0 }}>
        <table className="tabla comparativa">
          <thead>
            <tr><th>Métrica</th>{clientes.map((c) => <th key={c.id}><a href={`#/cliente/${c.id}/metricas`}>{c.nombre}</a><span className={claseEstado(c.estadoUso)}>{c.estadoUso}</span></th>)}</tr>
          </thead>
          <tbody>
            {base.definiciones.map((d) => (
              <tr key={d.id}>
                <th scope="row">{d.nombre}<span className="suave"> · {d.mejor === 'menor' ? 'menos es mejor' : 'más es mejor'}</span><p className="nota-datos">{base.notaDatos}</p></th>
                {metricas.map((m, i) => {
                  const v = m?.valores[d.id] ?? null;
                  const c = cambio(d, v);
                  return (
                    <td key={clientes[i].id}>
                      {v ? <><span className={v.antes === null ? 'en-medicion' : ''}>{formatoValor(v.antes, d.unidad)}</span> → <strong className={v.despues === null ? 'en-medicion' : ''}>{formatoValor(v.despues, d.unidad)}</strong></>
                        : <span className="en-medicion">{EN_MEDICION}</span>}
                      {c && <div><span className={c.mejora ? 'etiqueta ok' : 'etiqueta'}>{c.texto}</span></div>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th scope="row">Coincidencia con la terna de RR. HH.<p className="nota-datos">{base.notaDatos}</p></th>
              {metricas.map((m, i) => <td key={clientes[i].id}><strong>{m?.coincidenciaTerna ?? EN_MEDICION}</strong></td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
