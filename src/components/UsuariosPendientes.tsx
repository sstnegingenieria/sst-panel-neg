export interface Tecnico {
  id: string
  nombre: string
  email: string
  telefono?: string
  cedula?: string
  eps?: string
  arl?: string
  fondo_pension?: string
  contratista_nombre?: string
  contratista_id?: string
  obras_asignadas: string[]
  estado: 'pendiente' | 'activo' | 'inactivo'
  rol: string
}

interface UsuariosPendientesProps {
  isAdmin: boolean
  tecnicos: Tecnico[]
  loading: boolean
  onAprobar: (t: Tecnico) => void
  onRechazar: (t: Tecnico) => void
  onVerPerfil: (t: Tecnico) => void
}

export default function UsuariosPendientes({ isAdmin, tecnicos, loading, onAprobar, onRechazar, onVerPerfil }: UsuariosPendientesProps) {
  return (
    <div className="bg-white rounded-xl border border-amber-200 shadow-sm">
      <div className="px-6 py-4 border-b border-amber-100 bg-amber-50 rounded-t-xl flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <h2 className="font-semibold text-amber-800">
          Técnicos pendientes de aprobación
          {!loading && (
            <span className="ml-2 text-xs font-normal text-amber-600">({tecnicos.length})</span>
          )}
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Nombre</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Email</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Cédula</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Contratista</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Estado</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 2 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="py-3 px-4">
                      <div className="h-4 bg-gray-200 rounded animate-pulse w-24" />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading && tecnicos.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">
                  ✅ No hay técnicos pendientes de aprobación.
                </td>
              </tr>
            )}

            {!loading &&
              tecnicos.map(t => (
                <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4 font-medium text-gray-800">{t.nombre}</td>
                  <td className="py-3 px-4 text-gray-600 text-xs">{t.email}</td>
                  <td className="py-3 px-4 text-gray-600">{t.cedula ?? <span className="text-gray-300">—</span>}</td>
                  <td className="py-3 px-4 text-gray-600">{t.contratista_nombre ?? '—'}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                      Pendiente
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onVerPerfil(t)}
                        title="Ver perfil completo"
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition font-medium"
                      >
                        👤 Ver
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            onClick={() => onAprobar(t)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 transition font-medium flex items-center gap-1"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Aprobar
                          </button>
                          <button
                            onClick={() => onRechazar(t)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition font-medium flex items-center gap-1"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Rechazar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
