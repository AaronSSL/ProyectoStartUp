import { useState } from 'react';
import { CheckCircle2, Clock, Headset, Plug } from 'lucide-react';
import type { Empresa, Portal, SolicitudIntegracion } from '../lib/tipos.ts';
import { PORTALES } from '../lib/portales.ts';
import { Modal } from '../componentes/ui.tsx';

const ESTADOS: Record<SolicitudIntegracion['estado'], { texto: string; clase: string }> = {
  solicitada: { texto: 'Solicitud enviada', clase: 'etiqueta aviso' },
  en_configuracion: { texto: 'En configuración', clase: 'etiqueta aviso' },
  activa: { texto: 'Activa', clase: 'etiqueta ok' },
};

export function Integraciones({ empresa, onGuardar }: { empresa: Empresa; onGuardar: (e: Empresa) => Promise<void> }) {
  const [abierto, setAbierto] = useState<Portal | null>(null);
  const cambiarEstado = (p: Portal, estado: SolicitudIntegracion['estado']) => {
    const s = empresa.integraciones[p];
    if (s) void onGuardar({ ...empresa, integraciones: { ...empresa.integraciones, [p]: { ...s, estado } } });
  };

  return (
    <>
      <div className="titulo-pagina">
        <div><h1>Integraciones</h1><p>Trae automáticamente a los postulantes de las bolsas de trabajo donde publicas tus avisos.</p></div>
      </div>
      <div className="rejilla">
        {PORTALES.map((p) => {
          const s = empresa.integraciones[p.id];
          return (
            <section key={p.id} className="tarjeta portal">
              <div className="fila entre">
                <div className="fila"><span className="insignia" style={{ background: p.color }}>{p.sigla}</span><h2>{p.nombre}</h2></div>
                {s ? <span className={ESTADOS[s.estado].clase}>{s.estado === 'activa' ? <CheckCircle2 size={13} /> : <Clock size={13} />}{ESTADOS[s.estado].texto}</span> : <span className="etiqueta">No configurada</span>}
              </div>
              <p className="ayuda">{p.detalle}</p>
              {s ? (
                <div className="aviso-info">
                  {s.estado === 'activa'
                    ? <>Conectada. Tus avisos se importan como convocatorias y sus postulantes llegan solos a la Parte 1.</>
                    : <>Solicitud del {new Date(s.fecha).toLocaleDateString('es-PE')}. Nuestro equipo de soporte técnico te contactará en {s.correo} para configurar la conexión.</>}
                </div>
              ) : (
                <button className="boton" onClick={() => setAbierto(p.id)}><Headset size={16} />Solicitar configuración a soporte</button>
              )}
              {s && empresa.demo && s.estado !== 'activa' && (
                <button className="boton fantasma chico" onClick={() => cambiarEstado(p.id, 'activa')}>Marcar como activa (solo en la demo)</button>
              )}
            </section>
          );
        })}
      </div>
      <section className="tarjeta" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <h2 className="fila"><Plug size={18} />Cómo funciona la integración</h2>
        <ol className="pasos">
          <li>Solicitas la integración desde esta página con los datos de tu cuenta en el portal.</li>
          <li>Soporte técnico de Palomar Talent se comunica contigo para validar el acceso a la cuenta de empresa del portal.</li>
          <li>Configuramos la extracción de tus avisos y postulaciones, y la frecuencia de actualización (por ejemplo, cada noche).</li>
          <li>Los postulantes llegan solos a cada convocatoria, listos para el análisis de CV.</li>
        </ol>
        <p className="suave">Cada conexión se configura con la cuenta de empresa de la organización contratante en ese portal y según sus condiciones de uso. LinkedIn, Bumeran y Computrabajo son marcas de sus respectivos dueños.</p>
      </section>
      {abierto && <Solicitud portal={PORTALES.find((p) => p.id === abierto)!.nombre} onCerrar={() => setAbierto(null)}
        onEnviar={async (s) => { await onGuardar({ ...empresa, integraciones: { ...empresa.integraciones, [abierto]: s } }); setAbierto(null); }} />}
    </>
  );
}

function Solicitud({ portal, onCerrar, onEnviar }: { portal: string; onCerrar: () => void; onEnviar: (s: SolicitudIntegracion) => Promise<void> }) {
  const [f, setF] = useState({ contacto: '', correo: '', telefono: '', cuentaPortal: '', detalle: '' });
  const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.correo.trim());
  const listo = f.contacto.trim() && correoValido && f.cuentaPortal.trim();
  const campo = (k: keyof typeof f, etiqueta: string, extra: Record<string, unknown> = {}) => (
    <label className="campo">{etiqueta}<input value={f[k]} maxLength={150} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} /></label>
  );
  return (
    <Modal titulo={`Integrar ${portal}`} onCerrar={onCerrar}
      pie={<><button className="boton secundario" onClick={onCerrar}>Cancelar</button>
        <button className="boton" disabled={!listo} onClick={() => void onEnviar({ ...f, estado: 'solicitada', fecha: new Date().toISOString() })}>Enviar solicitud</button></>}>
      <p className="ayuda">Soporte técnico usará estos datos para coordinar contigo la configuración. No escribas contraseñas aquí: te pediremos el acceso por un canal seguro.</p>
      {campo('contacto', 'Persona de contacto')}
      <div className="fila" style={{ alignItems: 'start' }}>
        <div style={{ flex: 1, minWidth: 200 }}>{campo('correo', 'Correo', { type: 'email', placeholder: 'rrhh@tuempresa.com' })}</div>
        <div style={{ flex: 1, minWidth: 160 }}>{campo('telefono', 'Teléfono (opcional)', { type: 'tel' })}</div>
      </div>
      {campo('cuentaPortal', `Cuenta o empresa en ${portal}`, { placeholder: 'Nombre o correo de la cuenta de empresa' })}
      <label className="campo">¿Qué avisos quieres integrar? (opcional)<textarea value={f.detalle} maxLength={500} onChange={(e) => setF({ ...f, detalle: e.target.value })} placeholder="Ej.: todos los avisos activos del área comercial" /></label>
    </Modal>
  );
}
