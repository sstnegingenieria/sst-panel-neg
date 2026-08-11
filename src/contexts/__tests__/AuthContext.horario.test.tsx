// Fix 10-ago — validador de horario en el AuthContext:
//  (1) logout con guard de en-vuelo → multi-clic = UNA sola marca de salida;
//  (2) marca de ingreso en onAuthStateChanged con guard una-vez-por-día
//      (sesión persistida marca; F5 no re-marca; login explícito marca SIEMPRE;
//      fallo de la CF → la clave se borra y el siguiente arranque reintenta).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthContext'
import { claveIngresoLS } from '../../types/sigp/horario'

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
const cfSpy = vi.fn(async (_datos: { tipo: string }) => ({ data: { ok: true } }))
vi.mock('firebase/functions', () => ({
  httpsCallable: () => (datos: { tipo: string }) => cfSpy(datos),
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
const llamadasDe = (tipo: string) => cfSpy.mock.calls.filter(c => c[0]?.tipo === tipo).length

async function montarYAutenticar() {
  render(<AuthProvider><Consumidor /></AuthProvider>)
  await act(async () => { await authCallback!(USUARIO) })
}

beforeEach(() => {
  localStorage.clear()
  cfSpy.mockClear()
  signOutMock.mockClear()
  signInMock.mockClear()
  authCallback = null
})

// ── (2) Marca de ingreso ─────────────────────────────────────────────────────

describe('marca de ingreso en onAuthStateChanged', () => {
  it('sesión PERSISTIDA (primer arranque del día) → marca una vez y deja la clave en ok', async () => {
    await montarYAutenticar()
    await waitFor(() => expect(llamadasDe('ingreso')).toBe(1))
    expect(localStorage.getItem(claveIngresoLS('uid-test', new Date()))).toBe('ok')
  })

  it('F5 (segundo evento de auth el mismo día) → NO re-marca', async () => {
    await montarYAutenticar()
    await waitFor(() => expect(llamadasDe('ingreso')).toBe(1))
    await act(async () => { await authCallback!(USUARIO) })   // F5: sesión restaurada otra vez
    await new Promise(r => setTimeout(r, 30))
    expect(llamadasDe('ingreso')).toBe(1)
  })

  it('login EXPLÍCITO marca SIEMPRE, aunque la clave del día ya esté en ok (Opción B)', async () => {
    await montarYAutenticar()
    await waitFor(() => expect(llamadasDe('ingreso')).toBe(1))
    // Re-login el mismo día: login() levanta la banderita y el callback la consume
    await act(async () => {
      await acciones.login!('test@neg.co', 'x')
      await authCallback!(USUARIO)
    })
    await waitFor(() => expect(llamadasDe('ingreso')).toBe(2))
    expect(localStorage.getItem(claveIngresoLS('uid-test', new Date()))).toBe('ok')
  })

  it('fallo de la CF → la clave se BORRA y el siguiente arranque reintenta', async () => {
    cfSpy.mockRejectedValueOnce(new Error('cold start murió'))
    await montarYAutenticar()
    await waitFor(() => expect(llamadasDe('ingreso')).toBe(1))
    const clave = claveIngresoLS('uid-test', new Date())
    await waitFor(() => expect(localStorage.getItem(clave)).toBeNull())
    await act(async () => { await authCallback!(USUARIO) })   // siguiente F5 → reintento
    await waitFor(() => expect(llamadasDe('ingreso')).toBe(2))
    expect(localStorage.getItem(clave)).toBe('ok')
  })

  it('poda las claves de ingreso de OTROS días del mismo uid al marcar', async () => {
    localStorage.setItem('sigp.horario.ingreso.uid-test.2026-08-01', 'ok')
    localStorage.setItem('sigp.horario.ingreso.otro-uid.2026-08-01', 'ok')
    await montarYAutenticar()
    await waitFor(() => expect(llamadasDe('ingreso')).toBe(1))
    expect(localStorage.getItem('sigp.horario.ingreso.uid-test.2026-08-01')).toBeNull()
    expect(localStorage.getItem('sigp.horario.ingreso.otro-uid.2026-08-01')).toBe('ok')
  })
})

// ── (1) Guard de en-vuelo del logout ─────────────────────────────────────────

describe('logout con guard de en-vuelo', () => {
  it('multi-clic (el bug del 10-ago) → UNA sola marca de salida y UN signOut', async () => {
    await montarYAutenticar()
    await waitFor(() => expect(llamadasDe('ingreso')).toBe(1))
    let p1: Promise<void>, p2: Promise<void>, p3: Promise<void>
    await act(async () => {
      p1 = acciones.logout!()   // clic 1
      p2 = acciones.logout!()   // clic 2 (botón aún vivo por el cold start)
      p3 = acciones.logout!()   // clic 3
      await Promise.all([p1, p2, p3])
    })
    expect(p1!).toBe(p2!)       // misma promesa compartida
    expect(p2!).toBe(p3!)
    expect(llamadasDe('salida')).toBe(1)
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

  it('la CF de salida FALLA → el signOut ocurre igual (no-fatal) y el guard se libera', async () => {
    await montarYAutenticar()
    cfSpy.mockRejectedValueOnce(new Error('offline'))
    await act(async () => { await acciones.logout!() })
    expect(signOutMock).toHaveBeenCalledTimes(1)
    // Guard liberado: un cierre POSTERIOR (nueva sesión) vuelve a marcar
    await act(async () => { await acciones.logout!() })
    expect(llamadasDe('salida')).toBe(2)
    expect(signOutMock).toHaveBeenCalledTimes(2)
  })
})
