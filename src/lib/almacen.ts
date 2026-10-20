// Datos de cada empresa en el navegador (IndexedDB): nada sale de esta computadora.
import type { Candidato, Convocatoria, Empresa } from './tipos.ts';

const BASE = 'palomar-talent';
type Tienda = 'empresas' | 'convocatorias' | 'candidatos' | 'videos';

let conexion: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  conexion ??= new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BASE, 1);
    pedido.onupgradeneeded = () => {
      const d = pedido.result;
      d.createObjectStore('empresas', { keyPath: 'id' });
      d.createObjectStore('convocatorias', { keyPath: 'id' }).createIndex('empresaId', 'empresaId');
      d.createObjectStore('candidatos', { keyPath: 'id' }).createIndex('convocatoriaId', 'convocatoriaId');
      d.createObjectStore('videos');   // clave = videoId, valor = Blob
    };
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
  return conexion;
}

function operar<T>(tienda: Tienda, modo: IDBTransactionMode, accion: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const tx = d.transaction(tienda, modo);
    const pedido = accion(tx.objectStore(tienda));
    tx.oncomplete = () => resolve(pedido ? pedido.result : (undefined as T));
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Operación cancelada'));
  }));
}

const porIndice = <T>(tienda: Tienda, indice: string, valor: string) =>
  operar<T[]>(tienda, 'readonly', (s) => s.index(indice).getAll(valor));

export const almacen = {
  empresas: () => operar<Empresa[]>('empresas', 'readonly', (s) => s.getAll()),
  guardarEmpresa: (e: Empresa) => operar('empresas', 'readwrite', (s) => s.put(e)),
  convocatorias: (empresaId: string) => porIndice<Convocatoria>('convocatorias', 'empresaId', empresaId),
  guardarConvocatoria: (c: Convocatoria) => operar('convocatorias', 'readwrite', (s) => s.put(c)),
  candidatos: (convocatoriaId: string) => porIndice<Candidato>('candidatos', 'convocatoriaId', convocatoriaId),
  guardarCandidatos: (lista: Candidato[]) => operar('candidatos', 'readwrite', (s) => { lista.forEach((c) => s.put(c)); }),
  borrarCandidato: async (c: Candidato) => {
    if (c.videoId) await almacen.borrarVideo(c.videoId);
    await operar('candidatos', 'readwrite', (s) => s.delete(c.id));
  },
  video: (id: string) => operar<Blob | undefined>('videos', 'readonly', (s) => s.get(id)),
  guardarVideo: (id: string, blob: Blob) => operar('videos', 'readwrite', (s) => s.put(blob, id)),
  borrarVideo: (id: string) => operar('videos', 'readwrite', (s) => s.delete(id)),

  async borrarConvocatoria(c: Convocatoria) {
    for (const cand of await almacen.candidatos(c.id)) await almacen.borrarCandidato(cand);
    await operar('convocatorias', 'readwrite', (s) => s.delete(c.id));
  },
  async borrarEmpresa(e: Empresa) {
    for (const c of await almacen.convocatorias(e.id)) await almacen.borrarConvocatoria(c);
    await operar('empresas', 'readwrite', (s) => s.delete(e.id));
  },
};

/** Preferencias del navegador (empresa abierta, modelo de IA). */
export const preferencias = {
  leer<T>(clave: string, defecto: T): T {
    try { const v = localStorage.getItem(`palomar:${clave}`); return v === null ? defecto : (JSON.parse(v) as T); }
    catch { return defecto; }
  },
  guardar(clave: string, valor: unknown) {
    try { localStorage.setItem(`palomar:${clave}`, JSON.stringify(valor)); } catch { /* modo privado: solo en esta sesión */ }
  },
};
