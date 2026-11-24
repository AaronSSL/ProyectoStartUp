// Capa de datos de clientes, publicaciones y ranking. Hay dos implementaciones de la misma interfaz:
// - repositorioReal: la base del navegador (IndexedDB, ver almacen.ts), la que usa el sistema hoy.
// - crearRepositorioDemo: lee demo/demo_clientes.json y guarda los cambios solo en memoria (modo demo).
import { almacen } from './almacen.ts';
import type { Portal } from './tipos.ts';

export type Cliente = { id: string; nombre: string; sector: string; estadoUso: string };
export type Publicacion = { id: string; clienteId: string; puesto: string; bolsa: string; postulantes: number };
export type FilaRanking = { id: string; puesto: number; candidato: string; puntaje: number; porQue: string; segundaRonda: boolean };

export type ValorMetrica = { antes: number | null; despues: number | null } | null;
export type DefinicionMetrica = { id: string; nombre: string; unidad: string; mejor: 'menor' | 'mayor' };
export type MetricasCliente = {
  notaDatos: string;
  definiciones: DefinicionMetrica[];
  valores: Record<string, ValorMetrica>;
  coincidenciaTerna: string | null;
  cita: string | null;
  contacto: { nombre: string; cargo: string } | null;   // solo nombre y cargo: nunca teléfono ni correo
};

export interface Repositorio {
  readonly demo: boolean;
  clientes(): Promise<Cliente[]>;
  publicaciones(clienteId: string): Promise<Publicacion[]>;
  ranking(publicacionId: string): Promise<FilaRanking[]>;
  pasarASegundaRonda(publicacionId: string, filaId: string): Promise<void>;
  /** null si el cliente no tiene métricas registradas. */
  metricas(clienteId: string): Promise<MetricasCliente | null>;
}

const NOMBRE_PORTAL: Record<Portal, string> = { linkedin: 'LinkedIn', bumeran: 'Bumeran', computrabajo: 'Computrabajo' };

export const repositorioReal: Repositorio = {
  demo: false,
  async clientes() {
    return (await almacen.empresas()).map((e) => ({ id: e.id, nombre: e.nombre, sector: e.sector, estadoUso: e.demo ? 'Demo' : 'En uso' }));
  },
  async publicaciones(clienteId) {
    const convs = await almacen.convocatorias(clienteId);
    return Promise.all(convs.map(async (c) => ({
      id: c.id, clienteId, puesto: c.titulo,
      bolsa: c.origen ? NOMBRE_PORTAL[c.origen.portal] : 'Carga manual',
      postulantes: (await almacen.candidatos(c.id)).length,
    })));
  },
  async ranking(publicacionId) {
    const cands = (await almacen.candidatos(publicacionId)).filter((c) => c.cv && !c.cv.sinTexto);
    return cands.sort((a, b) => a.cv!.ranking - b.cv!.ranking).map((c) => {
      const mejor = [...c.cv!.porRequisito].sort((x, y) => (y.sim ?? 0) - (x.sim ?? 0))[0];
      return { id: c.id, puesto: c.cv!.ranking, candidato: c.nombre, puntaje: Math.round(c.cv!.score * 100),
        porQue: mejor ? `${mejor.requisito}: ${mejor.evidencia}` : '', segundaRonda: c.preseleccionado };
    });
  },
  async pasarASegundaRonda(publicacionId, filaId) {
    const c = (await almacen.candidatos(publicacionId)).find((x) => x.id === filaId);
    if (c) await almacen.guardarCandidatos([{ ...c, preseleccionado: true }]);
  },
  async metricas() { return null; },
};

// ---------------------------------------------------------------- modo demo

/** Forma de demo/demo_clientes.json. */
export type DatosDemo = {
  nota_datos: string;
  metricas: { id: string; nombre: string; unidad: string; mejor: string }[];
  clientes: {
    id: string; nombre: string; sector: string; estado_uso: string;
    contacto: { nombre: string; cargo: string };
    cita: string;
    metricas: Record<string, { antes: number | null; despues: number | null } | null>;
    coincidencia_terna: string;
    publicaciones: {
      id: string; puesto: string; bolsa: string; postulantes: number;
      ranking: { candidato: string; puntaje: number; por_que: string }[];
    }[];
  }[];
};

/** Repositorio en memoria a partir del JSON de demo. No abre la base del navegador ni escribe en ninguna parte. */
export function crearRepositorioDemo(datos: DatosDemo): Repositorio {
  const segundaRonda = new Set<string>();   // «publicacionId/filaId»: se pierde al recargar la página
  const pubs = datos.clientes.flatMap((c) => c.publicaciones.map((p) => ({ ...p, clienteId: c.id })));
  return {
    demo: true,
    async clientes() {
      return datos.clientes.map((c) => ({ id: c.id, nombre: c.nombre, sector: c.sector, estadoUso: c.estado_uso }));
    },
    async publicaciones(clienteId) {
      return pubs.filter((p) => p.clienteId === clienteId)
        .map((p) => ({ id: p.id, clienteId, puesto: p.puesto, bolsa: p.bolsa, postulantes: p.postulantes }));
    },
    async ranking(publicacionId) {
      const p = pubs.find((x) => x.id === publicacionId);
      if (!p) return [];
      return [...p.ranking].sort((a, b) => b.puntaje - a.puntaje).map((r, i) => ({
        id: r.candidato, puesto: i + 1, candidato: r.candidato, puntaje: r.puntaje, porQue: r.por_que,
        segundaRonda: segundaRonda.has(`${publicacionId}/${r.candidato}`),
      }));
    },
    async pasarASegundaRonda(publicacionId, filaId) { segundaRonda.add(`${publicacionId}/${filaId}`); },
    async metricas(clienteId) {
      const c = datos.clientes.find((x) => x.id === clienteId);
      if (!c) return null;
      return {
        notaDatos: datos.nota_datos,
        definiciones: datos.metricas.map((m) => ({ ...m, mejor: m.mejor === 'menor' ? 'menor' : 'mayor' })),
        valores: Object.fromEntries(datos.metricas.map((m) => [m.id, c.metricas[m.id] ?? null])),
        coincidenciaTerna: c.coincidencia_terna ?? null,
        cita: c.cita ?? null,
        contacto: c.contacto ? { nombre: c.contacto.nombre, cargo: c.contacto.cargo } : null,
      };
    },
  };
}
