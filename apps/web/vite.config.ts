import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/development/',
  plugins: [react()],
  server: {
    proxy: {
      '/api/development/v1': {
        target: 'http://127.0.0.1:3100',
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
