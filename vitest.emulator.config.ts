import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Config dedicada a los tests que corren contra la Firebase Emulator Suite.
// Se invoca con `npm run test:emulator`, que la envuelve en `firebase emulators:exec`.
// Está aislada del `npm test` por defecto para no exigir Java + emuladores en CI
// ni en el desarrollo cotidiano. Entorno `node` porque son tests funcionales
// (llamadas a Cloud Functions / Firestore), no de UI.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/hooks/sigp/__tests__/**/*.{test,spec}.ts'],
    // SECUENCIAL (19-oct): cada batería hace clearFirestore()/clearAuth() en
    // su beforeEach — en paralelo se limpian el emulador ENTRE SÍ y el run
    // masivo fallaba desde que la carpeta dejó de tener un solo archivo
    // (las baterías siempre se corrieron por archivo, por eso nadie lo vio).
    fileParallelism: false,
  },
})
