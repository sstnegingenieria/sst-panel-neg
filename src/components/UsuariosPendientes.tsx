export interface Tecnico {
  id: string
  nombre: string
  email: string
  telefono?: string
  cedula?: string
  eps?: string
  arl?: string
  fondo_pension?: string
  eps_vencimiento?: string
  arl_vencimiento?: string
  pension_vencimiento?: string
  contratista_nombre?: string
  contratista_id?: string
  obras_asignadas: string[]
  estado: 'pendiente' | 'activo' | 'inactivo'
  rol: string
  // Documentos adjuntos subidos desde la app móvil
  cedula_url?: string
  seguridad_social_url?: string
  curso_alturas_url?: string
}

interface UsuariosPendientesProps {
  isAdmin: boolean
  tecnicos: Tecnico[]
  loading: boolean
  onAprobar: (t: Tecnico) => void
  onRechazar: (t: Tecnico) => void
  onVerPerfil: (t: Tecnico) => void
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(s => s[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-gray-400 w-12 flex-shrink-0">{label}</span>
      <span className="text-gray-700 truncate">{value || '—'}</span>
    </div>
  )
}

export default function UsuariosPendientes({ isAdmin, tecnicos, loading, onAprobar, onRechazar, onVerPerfil }: UsuariosPendientesProps) {
  return (
    <section>
      {/* Encabezado de sección */}
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <h2 className="font-bold text-gray-800">
          Técnicos pendientes de aprobación
          {!loading && (
            <span className="ml-2 text-xs font-normal text-gray-400">({tecnicos.length})</span>
          )}
        </h2>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-44 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {/* Vacío */}
      {!loading && tecnicos.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg py-8 text-center text-sm text-gray-400">
          ✅ No hay técnicos pendientes de aprobación.
        </div>
      )}

      {/* Cards de pendientes */}
      {!loading && tecnicos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {tecnicos.map(t => (
            <div key={t.id} className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col">
              {/* Cabecera: avatar + nombre + badge */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {initials(t.nombre)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 text-sm truncate" title={t.nombre}>{t.nombre}</div>
                    <div className="text-xs text-gray-400 truncate" title={t.email}>{t.email}</div>
                  </div>
                </div>
                <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                  Espera
                </span>
              </div>

              {/* Datos */}
              <div className="mt-3 space-y-1">
                <InfoRow label="EPS" value={t.eps} />
                <InfoRow label="ARL" value={t.arl} />
                <InfoRow label="Contrat." value={t.contratista_nombre} />
              </div>

              {/* Acciones */}
              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => onVerPerfil(t)}
                  title="Ver perfil completo"
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition font-medium"
                >
                  Ver
                </button>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => onAprobar(t)}
                      className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition font-semibold flex items-center justify-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Aprobar
                    </button>
                    <button
                      onClick={() => onRechazar(t)}
                      className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition font-semibold flex items-center justify-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Rechazar
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
