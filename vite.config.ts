import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: '../dist-client',
    emptyOutDir: true,
  },
});
