/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// La app de escritorio (Python) vive en la misma carpeta: Vite solo mira src/ y public/.
export default defineConfig(({ mode }) => {
  // DEMO_MODE=true (variable de entorno, o .env.demo con `--mode demo`) activa el modo demo del Demo Day.
  const modoDemo = loadEnv(mode, '.', '').DEMO_MODE === 'true';
  return {
    plugins: [react()],
    define: { __DEMO_MODE__: JSON.stringify(modoDemo) },
    worker: { format: 'es' },
    optimizeDeps: { exclude: ['@huggingface/transformers'] },
    server: { watch: { ignored: ['**/.venv/**', '**/datos/**', '**/ejemplos/**', '**/talentai/**'] } },
    test: { include: ['src/**/*.test.ts'] },
  };
});
