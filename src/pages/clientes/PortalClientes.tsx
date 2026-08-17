// C2.1 paso 6 — aterrizaje NEUTRO del rol residente_cliente.
//
// NO es el módulo del portal (bloque F1 aparte): es el estado CERO que
// garantiza que un residente puede entrar al panel sin ver absolutamente
// nada — sin Layout, sin sidebar, sin menús, sin una sola lectura de
// Firestore/Storage. Cada vista que se agregue después será una concesión
// explícita de ese bloque.
import { useAuth } from '../../contexts/AuthContext'

export default function PortalClientes() {
  const { user, logout, cerrandoSesion } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <img src="/logo-neg.png" alt="NEG Ingeniería" className="w-14 h-14 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-800">Portal de clientes</h1>
        <p className="text-sm text-gray-500 mt-2">
          Hola{user?.nombre && !user.nombre.includes('@') ? `, ${user.nombre.split(' ')[0]}` : ''}.
          Su portal está en preparación — pronto podrá consultar aquí la
          información de sus proyectos con NEG Ingeniería.
        </p>
        <button
          onClick={() => { void logout() }}
          disabled={cerrandoSesion}
          className="mt-6 text-sm text-brand-600 hover:underline disabled:opacity-50"
        >
          {cerrandoSesion ? 'Cerrando…' : 'Cerrar sesión'}
        </button>
      </div>
    </div>
  )
}
