// vite.config.ts - Vite build configuration for TrucoAI
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [],
  server: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@core': '/src/core',
      '@ai': '/src/ai',
      '@network': '/src/network',
      '@renderer': '/src/renderer',
      '@ui': '/src/ui'
    }
  }
})
