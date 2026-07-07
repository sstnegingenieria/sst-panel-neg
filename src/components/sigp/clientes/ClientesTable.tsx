import type { Cliente } from '../../../types/sigp/cliente'

interface ClientesTableProps {
  clientes: Cliente[]
  loading: boolean
  onEdit: (c: Cliente) => void
  onToggleEstado: (c: Cliente) => void
  puedeGestionar: boolean
}

const estadoBadge = {
  activo: 'bg-emerald-50 text-emerald-700',
  inactivo: 'bg-gray-100 text-gray-500',
}

const esquemaBadge = {
  iva_pleno: 'bg-brand-50 text-brand-700',
  aiu: 'bg-lime-100 text-lime-800',
}

const esquemaLabel = {
  iva_pleno: 'IVA pleno',
  aiu: 'AIU',
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

export default function ClientesTable({
  clientes, loading, onEdit, onToggleEstado, puedeGestionar,
}: ClientesTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Cliente</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">NIT</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Impuestos</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Contactos</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Estado</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-100">
                {Array.from({ length: 6 }).map((__, j) => (
                  <td key={j} className="py-3 px-4">
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-24" />
                  </td>
                ))}
              </tr>
            ))}

          {!loading && clientes.length === 0 && (
            <tr>
              <td colSpan={6} className="py-12 text-center text-gray-400">
                No hay clientes registrados.
              </td>
            </tr>
          )}

          {!loading &&
            clientes.map(c => {
              const primerContacto = c.contactos[0]
              return (
                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                        {initials(c.nombre)}
                      </div>
                      <span className="font-medium text-gray-800">{c.nombre}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-gray-600 font-mono text-xs">{c.nit || '—'}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${esquemaBadge[c.condiciones_comerciales.esquema_impuestos]}`}>
                      {esquemaLabel[c.condiciones_comerciales.esquema_impuestos]}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {c.contactos.length === 0 ? (
                      <span className="text-gray-300 text-xs">—</span>
                    ) : (
                      <div className="text-xs text-gray-600">
                        <span className="text-gray-800">{primerContacto.nombre}</span>
                        {c.contactos.length > 1 && (
                          <span className="text-gray-400"> +{c.contactos.length - 1}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${estadoBadge[c.estado]}`}>
                      {c.estado}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {puedeGestionar ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onEdit(c)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition font-medium"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => onToggleEstado(c)}
                          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${
                            c.estado === 'activo'
                              ? 'border-red-200 text-red-600 hover:bg-red-50'
                              : 'border-green-200 text-green-600 hover:bg-green-50'
                          }`}
                        >
                          {c.estado === 'activo' ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
        </tbody>
      </table>
    </div>
  )
}
