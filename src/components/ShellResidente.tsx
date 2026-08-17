// src/components/ShellResidente.tsx
//
// Shell mínimo para el rol residente_obra: SIN sidebar, SIN menús — el
// empleado NEG con alcance restringido entra directo a su único módulo de
// trabajo (Actividades). Esto NO es una superficie de cara al cliente.
import { ReactNode, useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'
import { useFeatureFlag } from '../hooks/useFeatureFlag'

interface ShellResidenteProps {
  children: ReactNode
}

export default function ShellResidente({ children }: ShellResidenteProps) {
  const { user, logout, cerrandoSesion } = useAuth()
  const [nombreCliente, setNombreCliente] = useState<string | null>(null)
  // El flag gatea TAMBIÉN al residente (decisión 17-ago): con el módulo
  // apagado ve un mensaje explícito — jamás un shell en blanco, que parece
  // una falla del sistema y genera una llamada.
  const moduloActivo = useFeatureFlag('sigp_actividades_enabled', false)

  useEffect(() => {
    let vivo = true
    if (!user?.uid) return
    ;(async () => {
      try {
        const usnap = await getDoc(doc(db, 'users', user.uid))
        const clienteId = usnap.exists() ? (usnap.data().cliente_id as string | undefined) : undefined
        if (!clienteId) return
        const csnap = await getDoc(doc(db, 'clientes', clienteId))
        if (vivo && csnap.exists()) setNombreCliente((csnap.data().nombre as string) ?? null)
      } catch {
        // best-effort — sin nombre de cliente, el header queda genérico
      }
    })()
    return () => { vivo = false }
  }, [user?.uid])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo-neg.png" alt="NEG Ingeniería" className="h-8 w-auto flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-gray-800 leading-tight">Actividades</h1>
              <p className="text-xs text-gray-500 leading-tight truncate">
                Acceso restringido{nombreCliente ? ` · ${nombreCliente}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            disabled={cerrandoSesion}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition"
          >
            {cerrandoSesion ? 'Cerrando…' : 'Cerrar sesión'}
          </button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-4 lg:p-6">
        {moduloActivo ? children : (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center max-w-md mx-auto mt-10">
            <p className="text-sm font-semibold text-gray-800">El módulo no está disponible en este momento.</p>
            <p className="text-xs text-gray-500 mt-2">
              Si cree que se trata de un error, comuníquese con NEG Ingeniería.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
