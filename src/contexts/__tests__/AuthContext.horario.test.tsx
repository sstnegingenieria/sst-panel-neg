// Marcación por login/logout (rebuild 13-oct) — el AuthContext:
//  (1) login explícito = marcación de ENTRADA (CF accion 'entrada');
//  (2) GUARD DE ARRANQUE: sesión restaurada en día nuevo sin marca local
//      fresca → signOut (el login que sigue marca la entrada); marca local
//      de hoy o fresca de ayer (cruce de medianoche) → no toca la sesión;
//  (3) logout = salida manual ('salir') / logout(true) = automática
//      ('salir_auto'), con el guard de en-vuelo intacto.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthContext'
import { CLAVE_MARCA_LS } from '../../types/sigp/jornada'
import { claveDia } from '../../types/sigp/horario'

// ── Mocks de firebase ────────────────────────────────────────────────────────
let authCallback: ((u: unknown) => Promise<void>) | null = null
const signOutMock = vi.fn(async () => {})
const signInMock = vi.fn(async () => {})

const authObj = vi.hoisted((): { currentUser: { uid: string } | null } => ({ currentUser: null }))
vi.mock('../../firebase/config', () => ({ auth: authObj, db: {}, functions: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => Promise<void>) => {
    authCallback = cb
    return () => {}
  },
  signInWithEmailAndPassword: () => { authObj.currentUser = { uid: 'uid-test' }; return signInMock() },
  signOut: () => signOutMock(),
}))
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({
    exists: () => true,
    data: () => ({ nombre: 'Test', rol: 'admin', estado: 'activo' }),
  })),
}))

const cfSpy = vi.fn(async (_datos: { accion?: string }) => ({ data: { ok: true } }))
vi.mock('firebase/functions', () => ({
  httpsCallable: () => (datos: { accion?: string }) => cfSpy(datos),
}))

// ── Arnés ────────────────────────────────────────────────────────────────────
const acciones: { login?: (e: string, p: string) => Promise<void>; logout?: (a?: boolean) => Promise<void> } = {}

function Consumidor() {
  const { login, logout, cerrandoSesion, sesionCerradaPorJornada, user } = useAuth()
  acciones.login = login
  acciones.logout = logout
  return (
    <div data-testid="estado">
      {cerrandoSesion ? 'cerrando' : 'idle'}|{user ? user.uid : 'sin-usuario'}|{sesionCerradaPorJornada ? 'pide-login' : ''}
    </div>
  )
}

const USUARIO = { uid: 'uid-test', email: 'test@neg.co' }
const llamadas = (accion: string) => cfSpy.mock.calls.filter(c => c[0]?.accion === accion).length
const marcaHoy = () =>
  localStorage.setItem(CLAVE_MARCA_LS('uid-test'), JSON.stringify({ dia: claveDia(new Date()), ts: Date.now() }))

beforeEach(() => {
  localStorage.clear()
  cfSpy.mockClear()
  signOutMock.mockClear()
  signInMock.mockClear()
  authCallback = null
  authObj.currentUser = null
})

async function montar() {
  render(<AuthProvider><Consumidor /></AuthProvider>)
}

// ── (1) Login explícito = entrada ────────────────────────────────────────────

describe('login explícito — la marcación de entrada', () => {
  it("invoca la CF con accion 'entrada' y no pasa por el guard", async () => {
    await montar()
    await act(async () => {
      await acciones.login!('test@neg.co', 'x')
      await authCallback!(USUARIO)
    })
    await waitFor(() => expect(llamadas('entrada')).toBe(1))
    expect(signOutMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('estado').textContent).toContain('uid-test')
  })
})

// ── (2) Guard de arranque ────────────────────────────────────────────────────

describe('guard de arranque — día nuevo exige login', () => {
  it('sesión RESTAURADA sin marca local → signOut + aviso "pide-login" + cero CF', async () => {
    await montar()
    await act(async () => { await authCallback!(USUARIO) })
    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(cfSpy).not.toHaveBeenCalled()
    expect(screen.getByTestId('estado').textContent).toContain('pide-login')
    expect(screen.getByTestId('estado').textContent).toContain('sin-usuario')
  })

  it('sesión restaurada con marca local de HOY → entra normal sin marcar nada', async () => {
    marcaHoy()
    await montar()
    await act(async () => { await authCallback!(USUARIO) })
    expect(signOutMock).not.toHaveBeenCalled()
    expect(cfSpy).not.toHaveBeenCalled()
    expect(screen.getByTestId('estado').textContent).toContain('uid-test')
  })

  it('CRUCE DE MEDIANOCHE: marca de AYER pero fresca (hace 5 min) → NO expulsa', async () => {
    const ayer = claveDia(new Date(Date.now() - 86_400_000))
    localStorage.setItem(CLAVE_MARCA_LS('uid-test'), JSON.stringify({ dia: ayer, ts: Date.now() - 5 * 60_000 }))
    await montar()
    await act(async () => { await authCallback!(USUARIO) })
    expect(signOutMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('estado').textContent).toContain('uid-test')
  })
})

// ── (3) Logout manual vs automático, con guard de en-vuelo ───────────────────

describe('logout — salida manual y automática', () => {
  async function montarActivo() {
    marcaHoy()
    await montar()
    await act(async () => { await authCallback!(USUARIO) })
  }

  it("logout() marca 'salir'; logout(true) marca 'salir_auto'", async () => {
    await montarActivo()
    await act(async () => { await acciones.logout!() })
    expect(llamadas('salir')).toBe(1)
    await act(async () => { await authCallback!(USUARIO) })   // re-restaura (marca sigue hoy)
    await act(async () => { await acciones.logout!(true) })
    expect(llamadas('salir_auto')).toBe(1)
    expect(signOutMock).toHaveBeenCalledTimes(2)
  })

  it('multi-clic → UNA sola salida y UN signOut (promesa compartida)', async () => {
    await montarActivo()
    let p1: Promise<void>, p2: Promise<void>
    await act(async () => {
      p1 = acciones.logout!()
      p2 = acciones.logout!()
      await Promise.all([p1, p2])
    })
    expect(p1!).toBe(p2!)
    expect(llamadas('salir')).toBe(1)
    expect(signOutMock).toHaveBeenCalledTimes(1)
  })

  it('la CF de salida FALLA → el signOut ocurre igual (no-fatal)', async () => {
    await montarActivo()
    cfSpy.mockRejectedValueOnce(new Error('offline'))
    await act(async () => { await acciones.logout!() })
    expect(signOutMock).toHaveBeenCalledTimes(1)
  })
})
