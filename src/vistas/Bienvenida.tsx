import { useState } from 'react';
import { Building2, PlayCircle } from 'lucide-react';
import { almacen } from '../lib/almacen.ts';
import { crearEmpresaDemo } from '../lib/demo.ts';
import { nuevoId, type Empresa } from '../lib/tipos.ts';

const SECTORES = ['Retail y consumo', 'Servicios financieros', 'Educación', 'Salud', 'Tecnología', 'Industria y manufactura', 'Logística', 'Otro'];

export function Bienvenida({ empresas, onAbrir }: { empresas: Empresa[]; onAbrir: (e: Empresa) => void }) {
  const [nombre, setNombre] = useState('');
  const [sector, setSector] = useState(SECTORES[0]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const crear = async () => {
    if (!nombre.trim()) return;
    const e: Empresa = { id: nuevoId(), nombre: nombre.trim(), sector, creadaAt: new Date().toISOString(), demo: false, integraciones: {} };
    await almacen.guardarEmpresa(e);
    onAbrir(e);
  };
  const demo = async () => {
    setCargando(true); setError('');
    try { onAbrir(await crearEmpresaDemo()); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear la demo.'); setCargando(false); }
  };

  return (
    <div className="bienvenida">
      <div className="caja">
        <div className="marca">
          <img src="/logo.png" alt="" />
          <div><h1>Palomar <em>Talent</em></h1><p>Selección de personal con IA: análisis de CV y de entrevistas en video, para cualquier empresa.</p></div>
        </div>
        {empresas.length > 0 && (
          <section className="tarjeta">
            <h3>Tus espacios de trabajo</h3>
            <div className="fila" style={{ marginTop: 10 }}>
              {empresas.map((e) => <button key={e.id} className="boton secundario" onClick={() => onAbrir(e)}><Building2 size={16} />{e.nombre}</button>)}
            </div>
          </section>
        )}
        <div className="opciones">
          <section className="tarjeta" style={{ display: 'grid', gap: 12 }}>
            <h2>Crea el espacio de tu empresa</h2>
            <p className="ayuda">Tus convocatorias, candidatos y decisiones quedan guardados en este navegador.</p>
            <label className="campo">Nombre de la empresa<input value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Inversiones del Sur S.A.C." onKeyDown={(e) => { if (e.key === 'Enter') void crear(); }} /></label>
            <label className="campo">Sector<select value={sector} onChange={(e) => setSector(e.target.value)}>{SECTORES.map((s) => <option key={s}>{s}</option>)}</select></label>
            <button className="boton" disabled={!nombre.trim()} onClick={() => void crear()}><Building2 size={16} />Crear espacio de trabajo</button>
          </section>
          <section className="tarjeta" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <h2>Prueba con una empresa demo</h2>
            <p className="ayuda">Viene con la integración de Bumeran activa y 3 avisos importados con sus postulantes (ficticios) y entrevistas en video, para recorrer las tres partes.</p>
            <ol className="pasos">
              <li>Los postulantes llegan desde Bumeran; analiza sus CVs contra los requisitos.</li>
              <li>Transcribe y evalúa las entrevistas con Whisper.</li>
              <li>Combina ambos puntajes y registra la decisión.</li>
            </ol>
            {error && <p className="alerta">{error}</p>}
            <button className="boton secundario" disabled={cargando} onClick={() => void demo()}><PlayCircle size={16} />{cargando ? 'Preparando la demo…' : 'Abrir la demo'}</button>
          </section>
        </div>
      </div>
    </div>
  );
}
