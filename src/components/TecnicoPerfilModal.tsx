import { Tecnico } from './UsuariosPendientes'
import { Obra } from './ObrasTable'

interface Props {
  isOpen: boolean
  onClose: () => void
  tecnico: Tecnico | null
  obras: Obra[]
}

function InfoFila({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="py-2.5 border-b border-gray-100 last:border-0 flex items-start gap-3">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-36 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-800 break-all">
        {value ?? <span className="text-gray-300 italic">No registrado</span>}
      </span>
    </div>
  )
}

const estadoBadge: Record<string, string> = {
  activo: 'bg-green-100 text-green-800',
  inactivo: 'bg-red-100 text-red-800',
  pendiente: 'bg-amber-100 text-amber-800',
}

export default function TecnicoPerfilModal({ isOpen, onClose, tecnico, obras }: Props) {
  if (!isOpen || !tecnico) return null

  const obraMap = Object.fromEntries(obras.map(o => [o.id, o.nombre_sitio]))
  const obrasNombres = (tecnico.obras_asignadas ?? []).map(id => obraMap[id] ?? id)

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center text-xl font-bold text-green-700">
              {tecnico.nombre?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{tecnico.nombre}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${estadoBadge[tecnico.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                  {tecnico.estado}
                </span>
                <span className="text-xs text-gray-400">{tecnico.email}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">

          {/* Identificación */}
          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Identificación
            </h3>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              <InfoFila label="Cédula" value={tecnico.cedula} />
              <InfoFila label="Teléfono" value={tecnico.telefono} />
            </div>
          </section>

          {/* Seguridad social */}
          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Seguridad Social
            </h3>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              <InfoFila label="EPS" value={tecnico.eps} />
              <InfoFila label="ARL" value={tecnico.arl} />
              <InfoFila label="Fondo de pensión" value={tecnico.fondo_pension} />
            </div>
          </section>

          {/* Empresa / Obras */}
          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Asignación
            </h3>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              <InfoFila label="Contratista" value={tecnico.contratista_nombre} />
              <div className="py-2.5 flex items-start gap-3">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-36 shrink-0 pt-0.5">Obras</span>
                <div className="flex flex-wrap gap-1.5">
                  {obrasNombres.length === 0
                    ? <span className="text-sm text-gray-300 italic">Sin asignar</span>
                    : obrasNombres.map((nombre, i) => (
                        <span
                          key={i}
                          className="inline-flex px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs border border-blue-100"
                        >
                          {nombre}
                        </span>
                      ))
                  }
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
