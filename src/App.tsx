import { useCallback, useEffect, useState } from 'react';
import { Briefcase, ChevronDown, PanelLeftClose, PanelLeftOpen, Plug, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { almacen, preferencias } from './lib/almacen.ts';
import type { Empresa } from './lib/tipos.ts';
import { iniciales } from './componentes/ui.tsx';
import { Bienvenida } from './vistas/Bienvenida.tsx';
import { Convocatorias } from './vistas/Convocatorias.tsx';
import { ConvocatoriaVista, type Parte } from './vistas/ConvocatoriaVista.tsx';
import { Integraciones } from './vistas/Integraciones.tsx';
import { Ajustes } from './vistas/Ajustes.tsx';

type Ruta = { vista: 'convocatorias' } | { vista: 'convocatoria'; id: string; parte: Parte } | { vista: 'integraciones' } | { vista: 'ajustes' };

function leerRuta(): Ruta {
  const partes = location.hash.replace(/^#\/?/, '').split('/');
  if (partes[0] === 'convocatoria' && partes[1]) {
    const parte = (['cv', 'entrevista', 'resultado'] as Parte[]).includes(partes[2] as Parte) ? (partes[2] as Parte) : 'cv';
    return { vista: 'convocatoria', id: partes[1], parte };
  }
  if (partes[0] === 'integraciones') return { vista: 'integraciones' };
  if (partes[0] === 'ajustes') return { vista: 'ajustes' };
  return { vista: 'convocatorias' };
}

export function App() {
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(() => preferencias.leer<string | null>('empresa', null));
  const [ruta, setRuta] = useState<Ruta>(leerRuta);
  const [menu, setMenu] = useState(false);
  // Menú lateral plegable (solo íconos); se recuerda en este navegador
  const [plegado, setPlegado] = useState(() => preferencias.leer('menuPlegado', false));
  const plegar = () => { setPlegado(!plegado); preferencias.guardar('menuPlegado', !plegado); };

  useEffect(() => { void almacen.empresas().then(setEmpresas); }, []);
  useEffect(() => {
    const cambio = () => setRuta(leerRuta());
    window.addEventListener('hashchange', cambio);
    return () => window.removeEventListener('hashchange', cambio);
  }, []);

  const abrirEmpresa = useCallback((e: Empresa) => {
    setEmpresas((prev) => [...(prev ?? []).filter((x) => x.id !== e.id), e]);
    setEmpresaId(e.id);
    preferencias.guardar('empresa', e.id);
    setMenu(false);
    location.hash = '#/';
  }, []);
  const actualizarEmpresa = useCallback(async (e: Empresa) => {
    await almacen.guardarEmpresa(e);
    setEmpresas((prev) => (prev ?? []).map((x) => (x.id === e.id ? e : x)));
  }, []);
  const salirEmpresa = useCallback(async (borrar?: Empresa) => {
    if (borrar) await almacen.borrarEmpresa(borrar);
    setEmpresas(await almacen.empresas());
    setEmpresaId(null);
    preferencias.guardar('empresa', null);
    setMenu(false);
  }, []);

  if (!empresas) return null;
  const empresa = empresas.find((e) => e.id === empresaId);
  if (!empresa) return <Bienvenida empresas={empresas} onAbrir={abrirEmpresa} />;

  const enlace = (href: string, activo: boolean, icono: ReactNode, texto: string) =>
    <a className="nav" href={href} aria-current={activo ? 'page' : undefined} title={plegado ? texto : undefined}>{icono}<span className="texto-nav">{texto}</span></a>;
  return (
    <div className={`app${plegado ? ' plegada' : ''}`}>
      <nav className="lateral" aria-label="Secciones">
        <a className="logo" href="#/" title="Palomar Talent"><img src="/logo.png" alt="" /><span className="texto-nav">Palomar <em>Talent</em><small>Selección con IA</small></span></a>
        {enlace('#/', ruta.vista === 'convocatorias' || ruta.vista === 'convocatoria', <Briefcase size={18} />, 'Convocatorias')}
        {enlace('#/integraciones', ruta.vista === 'integraciones', <Plug size={18} />, 'Integraciones')}
        {enlace('#/ajustes', ruta.vista === 'ajustes', <Settings size={18} />, 'Ajustes')}
        <p className="pie texto-nav">Los CVs y las entrevistas se analizan en este navegador: no se suben a ningún servidor.</p>
      </nav>
      <div className="principal">
        <header className="cabecera">
          <div className="fila" style={{ gap: 8 }}>
            <button className="boton fantasma" aria-label={plegado ? 'Mostrar el menú' : 'Esconder el menú'} title={plegado ? 'Mostrar el menú' : 'Esconder el menú'} onClick={plegar}>{plegado ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}</button>
            <span className="suave">Espacio de trabajo</span>
          </div>
          <div style={{ position: 'relative' }}>
            <button className="boton secundario" aria-expanded={menu} onClick={() => setMenu(!menu)}>
              <span className="avatar" style={{ width: 26, height: 26, fontSize: '.75rem' }}>{iniciales(empresa.nombre)}</span>
              {empresa.nombre}<ChevronDown size={16} />
            </button>
            {menu && (
              <div className="tarjeta" style={{ position: 'absolute', right: 0, top: 44, width: 260, padding: 8, zIndex: 10 }}>
                {empresas.filter((e) => e.id !== empresa.id).map((e) => (
                  <button key={e.id} className="boton fantasma" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => abrirEmpresa(e)}>{e.nombre}</button>
                ))}
                <button className="boton fantasma" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => void salirEmpresa()}>Otra empresa o nueva…</button>
              </div>
            )}
          </div>
        </header>
        <main className="contenido">
          {ruta.vista === 'convocatorias' && <Convocatorias empresa={empresa} />}
          {ruta.vista === 'convocatoria' && <ConvocatoriaVista key={ruta.id} id={ruta.id} parte={ruta.parte} empresa={empresa} />}
          {ruta.vista === 'integraciones' && <Integraciones empresa={empresa} onGuardar={actualizarEmpresa} />}
          {ruta.vista === 'ajustes' && <Ajustes empresa={empresa} onGuardar={actualizarEmpresa} onBorrar={() => void salirEmpresa(empresa)} />}
        </main>
      </div>
    </div>
  );
}
