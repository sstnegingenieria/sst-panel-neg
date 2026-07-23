import { useNavigate } from 'react-router-dom'
import type { Visita } from '../../../types/sigp/visita'
import { ESTADO_VISITA_LABEL, ESTADO_VISITA_COLOR, TIPO_VISITA_LABEL } from '../../../types/sigp/visita'

interface VisitasTableProps {
  visitas: Visita[]
  loading: boolean
  clienteNombres: Record<string, string>
  filasClicables?: boolean
  /** Pipeline: acción "Agendar" en filas `pendiente_agendar` (materializa el
   *  borrador asignando el VIS). Ausente = sin botón (solo lectura). */
  onAgendar?: (v: Visita) => void
}

function fFecha(ts: unknown): string {
  const d = (ts as { toDate?: () => Date })?.toDate?.()
  return d ? d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}

function origen(v: Visita, clienteNombres: Record<string, string>): string {
  if (v.cliente_id && clienteNombres[v.cliente_id]) return clienteNombres[v.cliente_id]
  if (v.prospecto_nombre) return v.prospecto_nombre
  return '—'
}

export default function VisitasTable({ visitas, loading, clienteNombres, filasClicables, onAgendar }: VisitasTableProps) {
  const navigate = useNavigate()
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Consecutivo</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Cliente / Prospecto</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Tipo</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Ejecutor</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Estado</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Programada</th>
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

          {!loading && visitas.length === 0 && (
            <tr>
              <td colSpan={6} className="py-12 text-center text-gray-400">
                No hay visitas registradas.
              </td>
            </tr>
          )}

          {!loading &&
            visitas.map(v => {
              const esContratista = v.ejecutor?.tipo === 'contratista'
              return (
                <tr
                  key={v.id}
                  onClick={filasClicables ? () => navigate(`/sigp/visitas/${v.id}`) : undefined}
                  className={`border-b border-gray-100 transition-colors ${filasClicables ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
                >
                  <td className="py-3 px-4 font-mono text-xs text-gray-700">
                    {v.consecutivo || <span className="text-gray-400 italic font-sans" title="El VIS se asigna al agendar (no se queman consecutivos en pendientes)">sin código · pendiente</span>}
                  </td>
                  <td className="py-3 px-4 font-medium text-gray-800">{origen(v, clienteNombres)}</td>
                  <td className="py-3 px-4 text-gray-600">{TIPO_VISITA_LABEL[v.tipo] ?? v.tipo}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${
                        esContratista ? 'bg-violet-50 text-violet-700' : 'bg-brand-50 text-brand-700'
                      }`}>
                        {esContratista ? 'Contratista' : 'NEG'}
                      </span>
                      <span className="text-gray-600 text-xs">{v.ejecutor?.nombre || '—'}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${ESTADO_VISITA_COLOR[v.estado]}`}>
                      {ESTADO_VISITA_LABEL[v.estado]}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    {v.estado === 'pendiente_agendar' && onAgendar ? (
                      <button onClick={e => { e.stopPropagation(); onAgendar(v) }}
                        className="text-xs px-3 py-1 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50">
                        📅 Agendar (asigna VIS)
                      </button>
                    ) : fFecha(v.fecha_programada)}
                  </td>
                </tr>
              )
            })}
        </tbody>
      </table>
    </div>
  )
}
