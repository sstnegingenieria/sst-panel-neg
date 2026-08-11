import { Link } from 'react-router-dom'
import type { ObraConStats } from '../hooks/useObrasConRegistros'
import { formatRelativeDate } from '../types/formulario'
import { DIRECCION_ORDEN, type SortBy } from '../utils/ordenObras'
import EstadoSstBar from './EstadoSstBar'

interface Props {
  obras: ObraConStats[]
  sortBy: SortBy
  onSort: (criterio: SortBy) => void
}

interface EncabezadoProps {
  label: string
  criterio: SortBy
  sortBy: SortBy
  onSort: (criterio: SortBy) => void
  align?: 'left' | 'right'
}

function EncabezadoOrdenable({ label, criterio, sortBy, onSort, align = 'left' }: EncabezadoProps) {
  const activo = sortBy === criterio
  const direccion = DIRECCION_ORDEN[criterio]
  const flecha = direccion === 'ascending' ? '▲' : '▼'

  return (
    <th
      scope="col"
      aria-sort={activo ? direccion : 'none'}
      className={`px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-gray-500 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(criterio)}
        className={`inline-flex items-center gap-1 hover:text-gray-900 transition ${
          activo ? 'text-gray-900' : ''
        }`}
      >
        {label}
        {activo && <span aria-hidden="true">{flecha}</span>}
      </button>
    </th>
  )
}

export default function RegistrosLista({ obras, sortBy, onSort }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100">
          <tr>
            <th scope="col" className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-bold text-gray-500">
              Obra
            </th>
            <th scope="col" className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-bold text-gray-500">
              Código
            </th>
            <EncabezadoOrdenable label="Cliente" criterio="cliente" sortBy={sortBy} onSort={onSort} />
            <th scope="col" className="px-3 py-2 text-right text-[10px] uppercase tracking-wider font-bold text-gray-500">
              Nº registros
            </th>
            <EncabezadoOrdenable label="Pendientes SST" criterio="pendientes" sortBy={sortBy} onSort={onSort} align="right" />
            <th scope="col" className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-bold text-gray-500">
              Estado SST
            </th>
            <EncabezadoOrdenable label="Última actividad" criterio="recientes" sortBy={sortBy} onSort={onSort} />
            <th scope="col" className="px-3 py-2 text-right text-[10px] uppercase tracking-wider font-bold text-gray-500">
              <span className="sr-only">Acción</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {obras.map(obra => {
            const inactiva = obra.estado === 'inactiva'
            const tienePendientes = obra.pendientes > 0
            return (
              <tr key={obra.id} className={inactiva ? 'opacity-60' : undefined}>
                <td className="px-3 py-2.5">
                  <span className="font-semibold text-gray-900">{obra.nombre_sitio}</span>
                  {inactiva && (
                    <span className="ml-2 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                      Inactiva
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-gray-500">{obra.codigo}</td>
                <td className="px-3 py-2.5 text-gray-700">{obra.cliente || '—'}</td>
                <td className="px-3 py-2.5 text-right text-gray-900">{obra.totalRegistros}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`font-semibold ${tienePendientes ? 'text-amber-600' : 'text-gray-900'}`}>
                    {obra.pendientes}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <EstadoSstBar
                    aprobados={obra.aprobados}
                    rechazados={obra.rechazados}
                    pendientes={obra.pendientes}
                    total={obra.totalRegistros}
                    className="max-w-[120px]"
                  />
                </td>
                <td className="px-3 py-2.5 text-gray-500 text-[11px]">
                  {obra.ultimoTimestamp ? formatRelativeDate(obra.ultimoTimestamp) : 'Sin actividad'}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Link
                    to={`/registros/${obra.id}`}
                    className="text-[11px] font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-0.5"
                  >
                    Gestionar →
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
