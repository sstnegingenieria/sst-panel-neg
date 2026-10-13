import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '../firebase/config'
import { accesoResidente, type Rol } from '../types/sigp/roles'
import {
  CLAVE_MARCA_LS, parseMarcaLocal, debeForzarLogin, GRACIA_CIERRE_MIN_DEFAULT,
} from '../types/sigp/jornada'
import { claveDia } from '../types/sigp/horario'
import { guardarMarcaLocal } from '../hooks/usePresencia'

// MARCACIÓN por login/logout (rebuild 13-oct — regla de negocio: "todos se
// loguean al llegar; el login es la marcación de entrada; al terminar
// cierran sesión y eso marca la salida"):
//  - login() → CF latidoJornada {accion:'entrada'} (no-fatal).
//  - logout(auto?) → {accion:'salir'|'salir_auto'} antes del signOut.
//  - GUARD DE ARRANQUE: la sesión persistida que despierta en un DÍA NUEVO
//    recibe signOut → login → entrada. Decide con la marca LOCAL del último
//    latido (no expulsa a quien cruza la medianoche trabajando: una marca de
//    hace minutos es continuación — precisión 1). El cierre de hoy produce
//    el login de mañana: el modelo se sella solo, sin schedulers.

/** El login explícito no debe pasar por el guard (bandera módulo-local,
 *  patrón del fix 10-ago: se levanta ANTES del signIn porque el callback
 *  puede correr antes de que login() retome). */
let loginExplicito = false

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
  /** true cuando el guard cerró la sesión por día nuevo — el Login muestra
   *  el aviso "inicia sesión para marcar tu entrada". */
  sesionCerradaPorJornada: boolean
  /** true mientras el cierre de sesión (marca de salida + signOut) está en
   *  vuelo — los botones de salir se deshabilitan con "Cerrando…". */
  cerrandoSesion: boolean
  login: (email: string, password: string) => Promise<void>
  /** `auto` = cierre de jornada vencido (salida AUTOMÁTICA, distinguible). */
  logout: (auto?: boolean) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [sesionCerradaPorJornada, setSesionCerradaPorJornada] = useState(false)
  const [cerrandoSesion, setCerrandoSesion] = useState(false)
  // Guard de en-vuelo del logout COMPLETO: clics repetidos (Header, pop-up o
  // ambos) reutilizan la misma promesa → una sola marca de salida por cierre.
  const logoutEnCurso = useRef<Promise<void> | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (firebaseUser) {
        const esExplicito = loginExplicito
        loginExplicito = false
        const docRef = doc(db, 'users', firebaseUser.uid)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          const data = docSnap.data()

          // Bloquear acceso si el usuario está inactivo
          if (data.estado === 'inactivo') {
            await signOut(auth)
            setUser(null)
            setAccessDenied(true)
            setLoading(false)
            return
          }

          // GUARD DE ARRANQUE (solo sesiones RESTAURADAS de personal que
          // marca): día nuevo sin marca local fresca → signOut → el login
          // que sigue ES la marcación de entrada. Residentes y técnicos
          // quedan fuera (no marcan jornada — su sesión no se toca).
          const marcaJornada = !accesoResidente((data.rol ?? '') as Rol) && data.rol !== 'tecnico'
          if (!esExplicito && marcaJornada) {
            try {
              const marca = parseMarcaLocal(localStorage.getItem(CLAVE_MARCA_LS(firebaseUser.uid)))
              if (debeForzarLogin(marca, claveDia(new Date()), Date.now(), GRACIA_CIERRE_MIN_DEFAULT)) {
                await signOut(auth)
                setUser(null)
                setAccessDenied(false)
                setSesionCerradaPorJornada(true)
                setLoading(false)
                return
              }
            } catch { /* LS inaccesible — no se bloquea el arranque */ }
          }

          setAccessDenied(false)
          setSesionCerradaPorJornada(false)
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
        // (Rebuild presencia oct-2026: aquí vivía la marca de ingreso por
        // ARRANQUE — retirada; el primer latido del día la reemplaza.)
      } else {
        setUser(null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const login = async (email: string, password: string) => {
    setAccessDenied(false)
    // ANTES del signIn (el callback puede correr antes de que este await
    // retome): el login explícito no pasa por el guard de arranque.
    loginExplicito = true
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (e) {
      loginExplicito = false
      throw e
    }
    setSesionCerradaPorJornada(false)
    // LA MARCACIÓN DE ENTRADA — no-fatal: el login jamás depende de la CF.
    const uid = auth.currentUser?.uid
    try {
      const rolDoc = uid ? (await getDoc(doc(db, 'users', uid))).data()?.rol ?? '' : ''
      if (uid && !accesoResidente(rolDoc as Rol) && rolDoc !== 'tecnico') {
        await httpsCallable(functions, 'latidoJornada')({ accion: 'entrada' })
        guardarMarcaLocal(uid, new Date())
      }
    } catch (e) {
      console.warn('Marcación: no se pudo registrar la entrada', e)
    }
  }

  const logout = (auto = false): Promise<void> => {
    // Reutilizar el cierre en vuelo: el multi-clic del bug del 10-ago (cold
    // start de la CF sin feedback) generaba una marca de salida POR CLIC.
    if (logoutEnCurso.current) return logoutEnCurso.current
    setAccessDenied(false)
    setCerrandoSesion(true)
    logoutEnCurso.current = (async () => {
      try {
        // ANTES del signOut — después ya no hay token para invocar la CF.
        // 'salir' = salida MANUAL · 'salir_auto' = el cierre de jornada
        // venció sin respuesta (distinguible). Residentes/técnicos no marcan.
        if (!accesoResidente((user?.rol ?? '') as Rol) && user?.rol !== 'tecnico') {
          await httpsCallable(functions, 'latidoJornada')({ accion: auto ? 'salir_auto' : 'salir' })
        }
      } catch (e) {
        console.warn('Marcación: no se pudo registrar la salida', e)
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
    <AuthContext.Provider value={{ user, loading, accessDenied, sesionCerradaPorJornada, cerrandoSesion, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
