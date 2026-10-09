import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '../firebase/config'
import { accesoResidente, type Rol } from '../types/sigp/roles'

// Jornada por PRESENCIA (rebuild oct-2026): la marca de INGRESO-al-arranque
// del módulo #3 SE RETIRÓ de aquí — su información vive en el primer latido
// del día (hooks/usePresencia.ts, montado en el Layout) y la colección vieja
// `registros_horario` queda congelada como histórico. El cierre de sesión
// invoca el cierre MANUAL de la jornada (CF latidoJornada, accion 'salir').

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
    await signInWithEmailAndPassword(auth, email, password)
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
        // Cierre MANUAL de la jornada de presencia (queda distinguible del
        // cierre automático derivado). Residentes y técnicos no marcan.
        if (!accesoResidente((user?.rol ?? '') as Rol) && user?.rol !== 'tecnico') {
          await httpsCallable(functions, 'latidoJornada')({ accion: 'salir' })
        }
      } catch (e) {
        console.warn('Presencia: no se pudo registrar el cierre manual', e)
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
