import { defineConfig } from 'vitest/config'

// Config mínima del script "cifra del día" (scripts/sigp/pozo-vivo.pozo.ts).
// Aparte de la suite a propósito: sale a la red y su resultado cambia a diario.
// Uso: npx vitest run --config vitest.pozo.config.ts
export default defineConfig({
  test: {
    include: ['scripts/sigp/pozo-vivo.pozo.ts'],
    environment: 'node',
    testTimeout: 120_000,
    reporters: ['verbose'], // sin esto el reporte impreso queda oculto en la salida por defecto
  },
})
