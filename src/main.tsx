import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { MODO_DEMO } from './lib/modoDemo.ts';
import './estilos.css';

// Con DEMO_MODE=true se muestra la app de demostración (datos de demo/demo_clientes.json).
// Si no, este import queda en una rama muerta y no entra en el paquete.
const AppDemo = MODO_DEMO ? lazy(() => import('./vistas/demo/AppDemo.tsx')) : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>{AppDemo ? <Suspense fallback={null}><AppDemo /></Suspense> : <App />}</StrictMode>,
);
