// Empresa de demostración: integración con Bumeran ya activa y 3 avisos importados desde public/demo/bumeran.json
// (requisitos de avisos reales; postulantes ficticios).
import { almacen } from './almacen.ts';
import { avisosDisponibles, importarAviso } from './portales.ts';
import { nuevoId, type Empresa } from './tipos.ts';

export async function crearEmpresaDemo(): Promise<Empresa> {
  const ahora = new Date().toISOString();
  const empresa: Empresa = {
    id: nuevoId(), nombre: 'Comercial Aurora (demo)', sector: 'Servicios financieros', creadaAt: ahora, demo: true,
    integraciones: {
      bumeran: { estado: 'activa', contacto: 'Área de Selección', correo: 'seleccion@ejemplo.com', telefono: '', cuentaPortal: 'Comercial Aurora', detalle: 'Todos los avisos activos', fecha: ahora },
    },
  };
  await almacen.guardarEmpresa(empresa);
  for (const { portal, aviso } of await avisosDisponibles(empresa)) await importarAviso(empresa, portal, aviso);
  return empresa;
}
