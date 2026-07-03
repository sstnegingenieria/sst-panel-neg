import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Config de Vitest. vite.config.ts no define alias de imports (todo es relativo),
// así que aquí tampoco se declaran. Si en el futuro se agregan alias a vite.config.ts,
// replicarlos en `resolve.alias` de este archivo.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
