import { useNavigate } from 'react-router-dom'
import type { Solicitud } from '../../../types/sigp/solicitud'
import { ESTADO_LABEL, ESTADO_COLOR, CANAL_LABEL } from '../../../types/sigp/solicitud'

interface SolicitudesTableProps {
  solicitudes: Solicitud[]
  loading: boolean
  /** Mapa clienteId → nombre, para mostrar el origen de cada solicitud. */
  clienteNombres: Record<string, string>
  /** Si las filas navegan al detalle (se habilita en 1.2.d). */
  filasClicables?: boolean
}

function fFecha(ts: unknown): string {
  const d = (ts as { toDate?: () => Date })?.toDate?.()
  return d ? d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}

/** Nombre a mostrar: cliente registrado o prospecto. */
function origen(s: Solicitud, clienteNombres: Record<string, string>): string {
  if (s.cliente_id && clienteNombres[s.cliente_id]) return clienteNombres[s.cliente_id]
  if (s.prospecto_nombre) return s.prospecto_nombre
  return '—'
}

export default function SolicitudesTable({
  solicitudes, loading, clienteNombres, filasClicables,
}: SolicitudesTableProps) {
  const navigate = useNavigate()
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Consecutivo</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Cliente / Prospecto</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Canal</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Descripción</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Estado</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Recepción</th>
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

          {!loading && solicitudes.length === 0 && (
            <tr>
              <td colSpan={6} className="py-12 text-center text-gray-400">
                No hay solicitudes registradas.
              </td>
            </tr>
          )}

          {!loading &&
            solicitudes.map(s => (
              <tr
                key={s.id}
                onClick={filasClicables ? () => navigate(`/sigp/solicitudes/${s.id}`) : undefined}
                className={`border-b border-gray-100 transition-colors ${
                  filasClicables ? 'hover:bg-gray-50 cursor-pointer' : ''
                }`}
              >
                <td className="py-3 px-4 font-mono text-xs text-gray-700">
                  {s.consecutivo}
                  {s.tipo === 'preventivo' && (
                    <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold bg-brand-50 text-brand-700 align-middle">PREV</span>
                  )}
                </td>
                <td className="py-3 px-4 font-medium text-gray-800">{origen(s, clienteNombres)}</td>
                <td className="py-3 px-4 text-gray-600">{CANAL_LABEL[s.canal] ?? s.canal}</td>
                <td className="py-3 px-4 text-gray-600 max-w-xs truncate">{s.descripcion}</td>
                <td className="py-3 px-4">
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLOR[s.estado]}`}>
                    {ESTADO_LABEL[s.estado]}
                  </span>
                </td>
                <td className="py-3 px-4 text-gray-600">{fFecha(s.fecha_recepcion)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
