import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ titulo, children, pie, onCerrar, ancho }: { titulo: string; children: ReactNode; pie?: ReactNode; onCerrar: () => void; ancho?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', tecla);
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);
  return (
    <div className="fondo-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} ref={ref} style={ancho ? { width: `min(${ancho}px, 100%)` } : undefined}>
        <header><h2>{titulo}</h2><button className="boton fantasma" aria-label="Cerrar" onClick={onCerrar}><X size={18} /></button></header>
        <div className="cuerpo">{children}</div>
        {pie && <footer>{pie}</footer>}
      </div>
    </div>
  );
}

const colorPuntaje = (v: number) => (v >= 70 ? '#2f855a' : v >= 45 ? '#c58a16' : '#c53030');

/** Barra de 0 a 100 con el número a la derecha. */
export function Puntaje({ valor, color }: { valor: number | null | undefined; color?: string }) {
  if (valor === null || valor === undefined) return <span className="suave">—</span>;
  const v = Math.max(0, Math.min(100, valor));
  return (
    <div className="puntaje" title={`${v.toFixed(0)} de 100`}>
      <div className="pista"><span style={{ width: `${v}%`, background: color ?? colorPuntaje(v) }} /></div>
      <strong>{v.toFixed(0)}</strong>
    </div>
  );
}

export function BarraProgreso({ texto, pct }: { texto: string; pct: number | null }) {
  return (
    <div className="progreso" role="status">
      <span className="ayuda">{texto}</span>
      <div className={`barra${pct === null ? ' indeterminada' : ''}`}><span style={{ width: `${pct ?? 0}%` }} /></div>
    </div>
  );
}

export function Vacio({ icono, titulo, children }: { icono: ReactNode; titulo: string; children?: ReactNode }) {
  return <div className="vacio">{icono}<h3>{titulo}</h3>{children && <div className="ayuda" style={{ marginTop: 6 }}>{children}</div>}</div>;
}

/** Zona para soltar archivos o elegirlos. */
export function ZonaArchivos({ aceptar, multiple, onArchivos, children }: { aceptar: string; multiple?: boolean; onArchivos: (f: File[]) => void; children: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="zona-archivos" role="button" tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('activa'); }}
      onDragLeave={(e) => e.currentTarget.classList.remove('activa')}
      onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('activa'); onArchivos(Array.from(e.dataTransfer.files)); }}>
      {children}
      <input ref={input} type="file" accept={aceptar} multiple={multiple} hidden
        onChange={(e) => { onArchivos(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
    </div>
  );
}

export const iniciales = (texto: string) => texto.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'PT';
