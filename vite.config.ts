import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  server: {
    port: 3003,
    open: true,
  },
  preview: {
    // Loopback IPv4 explícito: `localhost` resuelve a ::1 y los smoke tests
    // (wf @arranque, curl 127.0.0.1) no llegan al server.
    host: '127.0.0.1',
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
