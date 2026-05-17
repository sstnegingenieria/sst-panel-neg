import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase/config'

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
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)

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
    // El onAuthStateChanged se encarga de verificar el estado después del login
  }

  const logout = async () => {
    setAccessDenied(false)
    await signOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, loading, accessDenied, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
