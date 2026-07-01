import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: '/debug/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@debug': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/rpc': 'http://127.0.0.1:3001',
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-flow': ['@xyflow/react', 'dagre'],
          'vendor-charts': ['recharts'],
          'vendor-ui': ['@radix-ui/react-checkbox', '@radix-ui/react-label', 'lucide-react'],
        },
      },
    },
  },
})
