// Rebuild presencia (oct-2026) — el AuthContext frente a la jornada:
//  (1) el ARRANQUE ya NO marca nada (la marca de ingreso del módulo #3 se
//      retiró — el primer latido del día la reemplaza, en usePresencia);
//  (2) logout = cierre MANUAL de la jornada (latidoJornada accion 'salir')
//      con el guard de en-vuelo intacto: multi-clic = UN solo cierre.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthContext'

// ── Mocks de firebase ────────────────────────────────────────────────────────
let authCallback: ((u: unknown) => Promise<void>) | null = null
const signOutMock = vi.fn(async () => {})
const signInMock = vi.fn(async () => {})

vi.mock('../../firebase/config', () => ({ auth: {}, db: {}, functions: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => Promise<void>) => {
    authCallback = cb
    return () => {}
  },
  signInWithEmailAndPassword: () => signInMock(),
  signOut: () => signOutMock(),
}))
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({
    exists: () => true,
    data: () => ({ nombre: 'Test', rol: 'admin', estado: 'activo' }),
  })),
}))

// La CF: httpsCallable(functions, nombre) → función; espiamos las invocaciones
const cfSpy = vi.fn(async (_datos: { accion?: string }) => ({ data: { ok: true } }))
vi.mock('firebase/functions', () => ({
  httpsCallable: () => (datos: { accion?: string }) => cfSpy(datos),
}))

// ── Arnés ────────────────────────────────────────────────────────────────────
const acciones: { login?: (e: string, p: string) => Promise<void>; logout?: () => Promise<void> } = {}

function Consumidor() {
  const { login, logout, cerrandoSesion, user } = useAuth()
  acciones.login = login
  acciones.logout = logout
  return <div data-testid="estado">{cerrandoSesion ? 'cerrando' : 'idle'}|{user ? user.uid : 'sin-usuario'}</div>
}

const USUARIO = { uid: 'uid-test', email: 'test@neg.co' }
const cierres = () => cfSpy.mock.calls.filter(c => c[0]?.accion === 'salir').length

async function montarYAutenticar() {
  render(<AuthProvider><Consumidor /></AuthProvider>)
  await act(async () => { await authCallback!(USUARIO) })
}

beforeEach(() => {
  cfSpy.mockClear()
  signOutMock.mockClear()
  signInMock.mockClear()
  authCallback = null
})

// ── (1) El arranque NO marca ─────────────────────────────────────────────────

describe('arranque de sesión (persistida o explícita)', () => {
  it('NO invoca CF alguna — la marca de arranque se retiró (la presencia es del latido)', async () => {
    await montarYAutenticar()
    await act(async () => { await authCallback!(USUARIO) })   // F5
    await new Promise(r => setTimeout(r, 30))
    expect(cfSpy).not.toHaveBeenCalled()
  })

  it('login explícito tampoco marca por sí mismo', async () => {
    await montarYAutenticar()
    await act(async () => {
      await acciones.login!('test@neg.co', 'x')
      await authCallback!(USUARIO)
    })
    await new Promise(r => setTimeout(r, 30))
    expect(cfSpy).not.toHaveBeenCalled()
  })
})

// ── (2) Logout = cierre manual, con guard de en-vuelo ────────────────────────

describe('logout con guard de en-vuelo (cierre manual de jornada)', () => {
  it('multi-clic → UN solo cierre manual (accion salir) y UN signOut', async () => {
    await montarYAutenticar()
    let p1: Promise<void>, p2: Promise<void>, p3: Promise<void>
    await act(async () => {
      p1 = acciones.logout!()
      p2 = acciones.logout!()
      p3 = acciones.logout!()
      await Promise.all([p1, p2, p3])
    })
    expect(p1!).toBe(p2!)
    expect(p2!).toBe(p3!)
    expect(cierres()).toBe(1)
    expect(signOutMock).toHaveBeenCalledTimes(1)
  })

  it('cerrandoSesion se enciende durante el cierre y se apaga al terminar', async () => {
    let resolverCF: () => void
    cfSpy.mockImplementationOnce(() => new Promise(r => { resolverCF = () => r({ data: { ok: true } }) }))
    await montarYAutenticar()
    let promesa: Promise<void>
    act(() => { promesa = acciones.logout!() })
    await waitFor(() => expect(screen.getByTestId('estado').textContent).toContain('cerrando'))
    await act(async () => { resolverCF!(); await promesa })
    expect(screen.getByTestId('estado').textContent).toContain('idle')
  })

  it('la CF de cierre FALLA → el signOut ocurre igual (no-fatal) y el guard se libera', async () => {
    await montarYAutenticar()
    cfSpy.mockRejectedValueOnce(new Error('offline'))
    await act(async () => { await acciones.logout!() })
    expect(signOutMock).toHaveBeenCalledTimes(1)
    await act(async () => { await acciones.logout!() })
    expect(cierres()).toBe(2)
    expect(signOutMock).toHaveBeenCalledTimes(2)
  })
})
