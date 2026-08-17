import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '../firebase/config'
import { claveIngresoLS, evaluarMarcaIngreso, esClaveIngresoObsoleta } from '../types/sigp/horario'
import { accesoClientes, type Rol } from '../types/sigp/roles'

/** Validador de horario (#3): marca de ingreso/salida vía CF — el servidor
 *  pone IP, dispositivo y timestamp; el cliente solo dice el tipo. LANZA en
 *  fallo: cada sitio de llamada decide cómo degradar (siempre no-fatal). */
async function invocarMarcaHorario(tipo: 'ingreso' | 'salida'): Promise<void> {
  await httpsCallable(functions, 'registrarEventoHorario')({ tipo })
}

/** Fix 10-ago (Opción B): el login EXPLÍCITO marca siempre. La banderita se
 *  levanta ANTES del signIn (el onAuthStateChanged puede disparar antes de
 *  que login() retome) y la consume el callback exactamente una vez. */
let loginExplicito = false

/** Marca de INGRESO — vive en onAuthStateChanged para capturar también las
 *  SESIONES PERSISTIDAS (antes solo login() marcaba y quien nunca re-loguea
 *  jamás generaba marcas). Guard una-vez-por-día por uid en localStorage con
 *  centinela anti-carrera; la clave queda 'ok' SOLO tras el éxito de la CF
 *  (fallo → se borra → el próximo arranque reintenta). No-fatal por contrato. */
async function marcarIngresoSiCorresponde(uid: string): Promise<void> {
  const esExplicito = loginExplicito
  loginExplicito = false
  try {
    const ahora = new Date()
    const clave = claveIngresoLS(uid, ahora)
    if (!esExplicito && !evaluarMarcaIngreso(localStorage.getItem(clave), ahora)) return
    localStorage.setItem(clave, `pendiente:${ahora.getTime()}`)
    // Poda de claves de otros días del mismo uid (higiene de localStorage)
    for (const k of Object.keys(localStorage)) {
      if (esClaveIngresoObsoleta(k, uid, clave)) localStorage.removeItem(k)
    }
    try {
      await invocarMarcaHorario('ingreso')
      localStorage.setItem(clave, 'ok')
    } catch (e) {
      localStorage.removeItem(clave)
      console.warn('Validador de horario: no se pudo registrar la marca de ingreso', e)
    }
  } catch (e) {
    // localStorage inaccesible (modo privado estricto, etc.) — jamás bloquea la sesión
    console.warn('Validador de horario: guard de ingreso no disponible', e)
  }
}

interface UserProfile {
  uid: string
  email: string | null
  nombre: string
  rol: string
}

interface AuthContextType {
  user: UserProfile | null
  loading: boolean
  accessDenied: boolean   // true cuando la cuenta existe pero está inactiva
  /** true mientras el cierre de sesión (marca de salida + signOut) está en
   *  vuelo — los botones de salir se deshabilitan con "Cerrando…". */
  cerrandoSesion: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [cerrandoSesion, setCerrandoSesion] = useState(false)
  // Guard de en-vuelo del logout COMPLETO: clics repetidos (Header, pop-up o
  // ambos) reutilizan la misma promesa → una sola marca de salida por cierre.
  const logoutEnCurso = useRef<Promise<void> | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (firebaseUser) {
        const docRef = doc(db, 'users', firebaseUser.uid)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          const data = docSnap.data()

          // Bloquear acceso si el usuario está inactivo
          if (data.estado === 'inactivo') {
            loginExplicito = false   // un login rechazado no deja banderita viva
            await signOut(auth)
            setUser(null)
            setAccessDenied(true)
            setLoading(false)
            return
          }

          setAccessDenied(false)
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            nombre: data.nombre ?? firebaseUser.email ?? 'Usuario',
            rol: data.rol ?? '',
          })
        } else {
          setAccessDenied(false)
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            nombre: firebaseUser.email ?? 'Usuario',
            rol: '',
          })
        }
        // Usuario VÁLIDO en sesión (explícita o persistida) → marca de ingreso
        // con guard una-vez-por-día. No se espera: jamás retrasa el arranque.
        // C2.1 paso 6: los residentes de cliente NO marcan asistencia — el
        // reloj es del personal interno (el rol externo nace sin efectos
        // colaterales; sus logins no ensucian registros_horario).
        if (!accesoClientes((docSnap.exists() ? (docSnap.data().rol ?? '') : '') as Rol)) {
          void marcarIngresoSiCorresponde(firebaseUser.uid)
        }
      } else {
        setUser(null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const login = async (email: string, password: string) => {
    setAccessDenied(false)
    // ANTES del signIn: el onAuthStateChanged puede correr antes de que este
    // await retome; el callback consume la banderita (Opción B: explícito
    // marca SIEMPRE, aunque la clave del día ya esté en 'ok').
    loginExplicito = true
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (e) {
      loginExplicito = false
      throw e
    }
  }

  const logout = (): Promise<void> => {
    // Reutilizar el cierre en vuelo: el multi-clic del bug del 10-ago (cold
    // start de la CF sin feedback) generaba una marca de salida POR CLIC.
    if (logoutEnCurso.current) return logoutEnCurso.current
    setAccessDenied(false)
    setCerrandoSesion(true)
    logoutEnCurso.current = (async () => {
      try {
        // ANTES del signOut — después ya no hay token para invocar la CF.
        // C2.1 paso 6: el residente de cliente no marca (espejo del ingreso).
        if (!accesoClientes((user?.rol ?? '') as Rol)) {
          await invocarMarcaHorario('salida')
        }
      } catch (e) {
        console.warn('Validador de horario: no se pudo registrar la marca de salida', e)
      } finally {
        try {
          await signOut(auth)
        } finally {
          logoutEnCurso.current = null
          setCerrandoSesion(false)
        }
      }
    })()
    return logoutEnCurso.current
  }

  return (
    <AuthContext.Provider value={{ user, loading, accessDenied, cerrandoSesion, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
