// Modo demo (Demo Day): se activa con la variable de entorno DEMO_MODE=true al levantar o compilar la app
// (vite.config.ts la convierte en la constante __DEMO_MODE__). Con DEMO_MODE=false o sin definir,
// el JSON de demo ni siquiera entra en el paquete: el `import()` de abajo queda en una rama muerta.
import { crearRepositorioDemo, repositorioReal, type DatosDemo, type Repositorio } from './repositorio.ts';

export const MODO_DEMO: boolean = __DEMO_MODE__;

export function cargarDatosDemo(): Promise<DatosDemo> {
  if (!__DEMO_MODE__) return Promise.reject(new Error('El modo demo está desactivado (DEMO_MODE no es true).'));
  return import('../../demo/demo_clientes.json').then((m) => m.default as DatosDemo);
}

/** Repositorio que corresponde al modo actual: el demo lee el JSON; el real, la base del navegador. */
export async function obtenerRepositorio(demo: boolean = MODO_DEMO, cargar: () => Promise<DatosDemo> = cargarDatosDemo): Promise<Repositorio> {
  if (!demo) return repositorioReal;
  return crearRepositorioDemo(await cargar());
}
