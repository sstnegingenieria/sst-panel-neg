import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import App from './App'

// Test de HUMO. Solo verifica que <App /> monta sin lanzar errores de
// compilación ni de render. No valida comportamiento.
//
// App ya se envuelve a sí mismo en <BrowserRouter> y <AuthProvider>, por lo
// que se renderiza directamente (envolverlo de nuevo duplicaría el Router).
//
// Firebase se mockea para que el render no inicialice la app real ni toque la
// red: config con objetos vacíos, y onAuthStateChanged devuelve usuario null
// (=> el gate de rutas cae en <Login />).

vi.mock('./firebase/config', () => ({
  auth: {},
  db: {},
  storage: {},
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => {
    cb(null)
    return () => {}
  },
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  doc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  Timestamp: { now: vi.fn(() => ({})) },
}))

describe('App (smoke test)', () => {
  it('monta sin lanzar errores', () => {
    const { container } = render(<App />)
    expect(container).toBeTruthy()
  })
})
