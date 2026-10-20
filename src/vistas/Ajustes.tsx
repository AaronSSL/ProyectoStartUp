import { useEffect, useState } from 'react';
import { Cpu, Trash2 } from 'lucide-react';
import { preferencias } from '../lib/almacen.ts';
import { ajustesIA, MODELOS_WHISPER, type AjustesIA } from '../lib/ia.ts';
import type { Empresa } from '../lib/tipos.ts';

export function Ajustes({ empresa, onGuardar, onBorrar }: { empresa: Empresa; onGuardar: (e: Empresa) => Promise<void>; onBorrar: () => void }) {
  const [ia, setIa] = useState<AjustesIA>(ajustesIA);
  const [nombre, setNombre] = useState(empresa.nombre);
  const [gpu, setGpu] = useState<boolean | null>(null);

  useEffect(() => {
    const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } };
    if (!nav.gpu) { setGpu(false); return; }
    nav.gpu.requestAdapter().then((a) => setGpu(!!a), () => setGpu(false));
  }, []);
  const cambiarIa = (cambio: Partial<AjustesIA>) => { const n = { ...ia, ...cambio }; setIa(n); preferencias.guardar('ia', n); };

  return (
    <>
      <div className="titulo-pagina"><div><h1>Ajustes</h1><p>Espacio de trabajo y modelos de IA de este navegador.</p></div></div>
      <section className="tarjeta" style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
        <h2>Empresa</h2>
        <div className="fila" style={{ alignItems: 'end' }}>
          <label className="campo" style={{ flex: 1, minWidth: 240 }}>Nombre<input value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} /></label>
          <button className="boton secundario" disabled={!nombre.trim() || nombre === empresa.nombre} onClick={() => void onGuardar({ ...empresa, nombre: nombre.trim() })}>Guardar</button>
        </div>
        <p className="ayuda">Sector: {empresa.sector}. Creado el {new Date(empresa.creadaAt).toLocaleDateString('es-PE')}.</p>
      </section>
      <section className="tarjeta" style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
        <h2 className="fila"><Cpu size={18} />Transcripción de entrevistas</h2>
        <p className="ayuda">Whisper se descarga una sola vez y queda guardado en el navegador. Después funciona sin volver a descargarlo.</p>
        {MODELOS_WHISPER.map((m) => (
          <label key={m.id} className="fila" style={{ alignItems: 'start', gap: 8 }}>
            <input type="radio" name="modelo" checked={ia.modelo === m.id} onChange={() => cambiarIa({ modelo: m.id })} style={{ marginTop: 4 }} />
            <span><strong>{m.nombre}</strong><br /><span className="ayuda">{m.detalle}</span></span>
          </label>
        ))}
        <label className="campo" style={{ maxWidth: 360 }}>Procesador
          <select value={ia.procesador} onChange={(e) => cambiarIa({ procesador: e.target.value as AjustesIA['procesador'] })}>
            <option value="auto">Automático (tarjeta gráfica si está disponible)</option>
            <option value="cpu">Solo procesador (más lento, más compatible)</option>
          </select>
        </label>
        <p className={gpu ? 'aviso-info' : 'ayuda'}>{gpu === null ? 'Revisando la tarjeta gráfica…' : gpu ? 'Este navegador puede usar la tarjeta gráfica (WebGPU): la transcripción será más rápida.' : 'Este navegador no expone WebGPU: se usará el procesador. Para más velocidad, usa Chrome o Edge actualizados.'}</p>
      </section>
      <section className="tarjeta" style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
        <h2>Datos</h2>
        <p className="ayuda">Las convocatorias, CVs, videos y decisiones de «{empresa.nombre}» están guardados solo en este navegador. Si borras los datos del sitio en el navegador, se pierden.</p>
        <div><button className="boton peligro" onClick={() => { if (confirm(`¿Borrar el espacio «${empresa.nombre}» con todas sus convocatorias, CVs y videos? No se puede deshacer.`)) onBorrar(); }}><Trash2 size={15} />Borrar este espacio de trabajo</button></div>
      </section>
    </>
  );
}
