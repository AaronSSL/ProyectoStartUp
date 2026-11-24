import { describe, expect, it, vi } from 'vitest';
import { cargarDatosDemo, MODO_DEMO, obtenerRepositorio } from './modoDemo.ts';
import { crearRepositorioDemo, repositorioReal, type DatosDemo } from './repositorio.ts';
import { cambio, formatoValor } from './formatoMetricas.ts';
import datosDemo from '../../demo/demo_clientes.json';

const DATOS = datosDemo as DatosDemo;

describe('modo demo desactivado (DEMO_MODE=false o sin definir)', () => {
  it('no lee el JSON de demo y devuelve el repositorio real', async () => {
    const cargar = vi.fn(async () => DATOS);
    const repo = await obtenerRepositorio(false, cargar);
    expect(cargar).not.toHaveBeenCalled();
    expect(repo).toBe(repositorioReal);
    expect(repo.demo).toBe(false);
  });
  it('los tests corren sin DEMO_MODE: la constante es false y el cargador del JSON se niega a leerlo', async () => {
    expect(MODO_DEMO).toBe(false);
    await expect(cargarDatosDemo()).rejects.toThrow(/desactivado/);
  });
});

describe('repositorio demo', () => {
  it('con el modo activo lee el JSON una vez', async () => {
    const cargar = vi.fn(async () => DATOS);
    const repo = await obtenerRepositorio(true, cargar);
    expect(cargar).toHaveBeenCalledTimes(1);
    expect(repo.demo).toBe(true);
    expect((await repo.clientes()).map((c) => c.nombre)).toEqual(['B y R Repostería', 'Zytrust', 'Intercorp', 'Municipalidad de Ate']);
  });
  it('ordena el ranking y «Pasar a 2ª ronda» solo cambia el estado en memoria', async () => {
    const repo = crearRepositorioDemo(DATOS);
    expect((await repo.publicaciones('intercorp')).map((p) => p.bolsa)).toEqual(['Bumeran', 'LinkedIn']);
    const [primero] = await repo.ranking('ic-1');
    expect(primero).toMatchObject({ puesto: 1, candidato: 'Candidato 014', puntaje: 92, segundaRonda: false });
    await repo.pasarASegundaRonda('ic-1', primero.id);
    expect((await repo.ranking('ic-1'))[0].segundaRonda).toBe(true);
    expect((await crearRepositorioDemo(DATOS).ranking('ic-1'))[0].segundaRonda).toBe(false);   // nueva sesión: no quedó guardado
  });
  it('las métricas null se muestran como «En medición» y el contacto no expone teléfono ni correo', async () => {
    const m = (await crearRepositorioDemo(DATOS).metricas('byr'))!;
    expect(m.valores.brecha_equidad).toBeNull();
    expect(formatoValor(m.valores.satisfaccion!.antes, '1-5')).toBe('En medición');
    expect(m.notaDatos).toBe(DATOS.nota_datos);
    expect(Object.keys(m.contacto!)).toEqual(['nombre', 'cargo']);
    const criba = m.definiciones.find((d) => d.id === 'tiempo_criba')!;
    expect(cambio(criba, m.valores.tiempo_criba)).toEqual({ texto: '−5 h (−83%)', mejora: true });
  });
});
