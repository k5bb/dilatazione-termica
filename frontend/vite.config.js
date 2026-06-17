import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/bottiglie':     'http://127.0.0.1:8001',
      '/calcola':       'http://127.0.0.1:8001',
      '/eu-compliance': 'http://127.0.0.1:8001',
      '/parse-pdf':     'http://127.0.0.1:8001',
    },
  },
})
