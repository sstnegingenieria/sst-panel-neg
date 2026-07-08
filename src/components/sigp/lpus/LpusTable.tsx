import { useNavigate } from 'react-router-dom'
import type { LPU } from '../../../types/sigp/lpu'

interface LpusTableProps {
  lpus: LPU[]
  loading: boolean
  /** Mapa clienteId → nombre para mostrar el cliente de cada LPU. */
  clienteNombres: Record<string, string>
}

const estadoBadge = {
  vigente: 'bg-emerald-50 text-emerald-700',
  historica: 'bg-gray-100 text-gray-500',
}

const estadoLabel = {
  vigente: 'Vigente',
  historica: 'Histórica',
}

function formatFecha(ts: unknown): string {
  const d = (ts as { toDate?: () => Date })?.toDate?.()
  if (!d) return '—'
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function LpusTable({ lpus, loading, clienteNombres }: LpusTableProps) {
  const navigate = useNavigate()
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Cliente</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Lista</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Estado</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide text-right">Ítems</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Importada</th>
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-100">
                {Array.from({ length: 5 }).map((__, j) => (
                  <td key={j} className="py-3 px-4">
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-24" />
                  </td>
                ))}
              </tr>
            ))}

          {!loading && lpus.length === 0 && (
            <tr>
              <td colSpan={5} className="py-12 text-center text-gray-400">
                No hay listas de precios importadas.
              </td>
            </tr>
          )}

          {!loading &&
            lpus.map(lpu => (
              <tr key={lpu.id} onClick={() => navigate(`/sigp/lpus/${lpu.id}`)}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer">
                <td className="py-3 px-4 font-medium text-gray-800">
                  {clienteNombres[lpu.cliente_id] ?? '—'}
                </td>
                <td className="py-3 px-4">
                  <span className="text-gray-800">{lpu.nombre}</span>
                  <span className="ml-2 text-xs text-gray-400">v{lpu.version}</span>
                </td>
                <td className="py-3 px-4">
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${estadoBadge[lpu.estado]}`}>
                    {estadoLabel[lpu.estado]}
                  </span>
                </td>
                <td className="py-3 px-4 text-right text-gray-600 font-mono text-xs">
                  {lpu.total_items}
                </td>
                <td className="py-3 px-4 text-gray-600">
                  {formatFecha(lpu.fecha_importacion)}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
