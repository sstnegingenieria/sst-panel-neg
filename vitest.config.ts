import { defineConfig, configDefaults } from 'vitest/config'
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
    // Los tests que dependen de la Emulator Suite viven en hooks/sigp/__tests__/
    // y se excluyen del `npm test` por defecto (requieren Java + emuladores).
    // Se corren aparte con `npm run test:emulator` (vitest.emulator.config.ts).
    exclude: [...configDefaults.exclude, '**/hooks/sigp/__tests__/**'],
  },
})
