// Integración con las bolsas de trabajo: los avisos y sus postulantes llegan desde el portal y se consolidan aquí.
// En el prototipo, la integración de Bumeran de la empresa demo lee public/demo/bumeran.json (mismos campos que la
// exportación de Bumeran); en producción, soporte técnico configura la extracción para cada empresa.
import { almacen } from './almacen.ts';
import { fragmentar } from './textos.ts';
import { nuevoId, type Candidato, type Convocatoria, type Empresa, type PerfilPortal, type Portal } from './tipos.ts';

export const PORTALES: { id: Portal; nombre: string; sigla: string; color: string; detalle: string }[] = [
  { id: 'linkedin', nombre: 'LinkedIn', sigla: 'in', color: '#0a66c2', detalle: 'Postulantes de tus empleos publicados en LinkedIn, con su experiencia y formación.' },
  { id: 'bumeran', nombre: 'Bumeran', sigla: 'B', color: '#d81f5c', detalle: 'Avisos publicados y postulaciones, con el perfil y el CV de cada postulante.' },
  { id: 'computrabajo', nombre: 'Computrabajo', sigla: 'C', color: '#1f6fb5', detalle: 'Ofertas activas y candidatos inscritos, con su hoja de vida.' },
];
export const nombrePortal = (p: Portal) => PORTALES.find((x) => x.id === p)?.nombre ?? p;

export type PostulantePortal = PerfilPortal & { id: string; nombre: string; postuladoEl: string; video?: string; soloEntrevista?: boolean };
export type AvisoPortal = {
  avisoId: string; titulo: string; area: string; publicadoEl: string; modalidad: string; descripcion: string;
  requisitos: { texto: string; peso: number }[];
  postulantes: PostulantePortal[];
};

/** Avisos disponibles en las integraciones activas de la empresa. */
export async function avisosDisponibles(empresa: Empresa): Promise<{ portal: Portal; aviso: AvisoPortal }[]> {
  if (!empresa.demo || empresa.integraciones.bumeran?.estado !== 'activa') return [];
  const feed = await (await fetch('/demo/bumeran.json')).json() as { avisos: AvisoPortal[] };
  return feed.avisos.map((aviso) => ({ portal: 'bumeran' as const, aviso }));
}

/** CV en texto a partir del perfil del portal: es lo que se compara con los requisitos. */
export function textoDePerfil(p: PerfilPortal): string {
  return [
    'EXPERIENCIA',
    ...p.experiencias.map((e) => `${e.puesto} — ${e.empresa} (${e.periodo}). ${e.descripcion}`),
    'EDUCACIÓN',
    ...p.estudios.map((e) => `${e.titulo} — ${e.institucion} (${e.nivel}, ${e.estado}).`),
    p.idiomas ? `Idiomas: ${p.idiomas}.` : '',
    p.habilidades ? `Habilidades: ${p.habilidades}.` : '',
  ].filter(Boolean).join('\n');
}

async function candidatoDesde(portal: Portal, convocatoriaId: string, p: PostulantePortal): Promise<Candidato> {
  const perfil: PerfilPortal = { ciudad: p.ciudad, experiencias: p.experiencias ?? [], estudios: p.estudios ?? [], idiomas: p.idiomas, habilidades: p.habilidades };
  const texto = p.soloEntrevista ? '' : textoDePerfil(perfil);
  const c: Candidato = {
    id: nuevoId(), convocatoriaId, nombre: p.nombre, idPortal: p.id, postuladoEl: p.postuladoEl,
    portal: p.soloEntrevista ? undefined : portal, fuente: p.soloEntrevista ? 'Solo entrevista' : nombrePortal(portal),
    archivoCv: p.soloEntrevista ? '' : `Perfil de ${nombrePortal(portal)}`, textoCv: texto, fragmentos: fragmentar(texto),
    perfil: p.soloEntrevista ? undefined : perfil, preseleccionado: !!p.video, decision: 'Pendiente', nota: '',
  };
  if (p.video) {
    // El video real puede no estar publicado (p. ej. en Vercel): en ese caso el candidato queda sin video
    const r = await fetch(`/demo/entrevistas/${encodeURIComponent(p.video)}`);
    if (r.ok && (r.headers.get('content-type') ?? '').startsWith('video')) {
      c.videoId = nuevoId();
      c.archivoVideo = p.video;
      await almacen.guardarVideo(c.videoId, await r.blob());
    }
  }
  return c;
}

export async function importarAviso(empresa: Empresa, portal: Portal, aviso: AvisoPortal): Promise<Convocatoria> {
  const ahora = new Date().toISOString();
  const conv: Convocatoria = {
    id: nuevoId(), empresaId: empresa.id, titulo: aviso.titulo, area: aviso.area, topN: 3, pesoCv: 50, creadaAt: ahora,
    descripcion: aviso.descripcion,
    origen: { portal, avisoId: aviso.avisoId, publicadoEl: aviso.publicadoEl, modalidad: aviso.modalidad, sincronizadoAt: ahora },
    requisitos: aviso.requisitos.map((r) => ({ id: nuevoId(), texto: r.texto, peso: r.peso })),
  };
  const candidatos = await Promise.all(aviso.postulantes.map((p) => candidatoDesde(portal, conv.id, p)));
  await almacen.guardarConvocatoria(conv);
  await almacen.guardarCandidatos(candidatos);
  return conv;
}

/** Trae a los postulantes nuevos del aviso (los que ya están no se tocan). Devuelve cuántos llegaron. */
export async function sincronizar(empresa: Empresa, conv: Convocatoria, actuales: Candidato[]): Promise<{ nuevos: Candidato[]; conv: Convocatoria }> {
  if (!conv.origen) return { nuevos: [], conv };
  const aviso = (await avisosDisponibles(empresa)).find((a) => a.portal === conv.origen!.portal && a.aviso.avisoId === conv.origen!.avisoId)?.aviso;
  if (!aviso) throw new Error(`La integración con ${nombrePortal(conv.origen.portal)} no está activa para esta empresa.`);
  const ya = new Set(actuales.map((c) => c.idPortal));
  const nuevos = await Promise.all(aviso.postulantes.filter((p) => !ya.has(p.id)).map((p) => candidatoDesde(conv.origen!.portal, conv.id, p)));
  const actualizada = { ...conv, origen: { ...conv.origen, sincronizadoAt: new Date().toISOString() } };
  await almacen.guardarCandidatos(nuevos);
  await almacen.guardarConvocatoria(actualizada);
  return { nuevos, conv: actualizada };
}
