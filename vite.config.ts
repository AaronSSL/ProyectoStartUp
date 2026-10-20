/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La app de escritorio (Python) vive en la misma carpeta: Vite solo mira src/ y public/.
export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  server: { watch: { ignored: ['**/.venv/**', '**/datos/**', '**/ejemplos/**', '**/talentai/**'] } },
  test: { include: ['src/**/*.test.ts'] },
});
