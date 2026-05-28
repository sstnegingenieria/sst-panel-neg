// src/components/ObraCard.tsx
import { Link } from 'react-router-dom'
import type { ObraConStats } from '../hooks/useObrasConRegistros'
import { formatRelativeDate } from '../types/formulario'

interface Props {
  obra: ObraConStats
}

export default function ObraCard({ obra }: Props) {
  const tienePendientes = obra.pendientes > 0
  const inactiva = obra.estado === 'inactiva'

  return (
    <Link
      to={`/registros/${obra.id}`}
      className={`group flex flex-col bg-white border rounded-lg p-4 transition-all ${
        inactiva
          ? 'border-gray-200 opacity-60 hover:opacity-90'
          : 'border-gray-200 hover:border-blue-700 hover:shadow-md hover:-translate-y-0.5'
      }`}
    >
      {/* Título + estado */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-sm font-bold text-gray-900 truncate" title={obra.nombre_sitio}>
          {obra.nombre_sitio}
        </h3>
        <span
          className={`flex-shrink-0 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
            inactiva ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {inactiva ? 'Inactiva' : 'Obra activa'}
        </span>
      </div>

      {/* Código + cliente */}
      <div className="font-mono text-[10px] text-gray-400 truncate mb-3">
        {obra.codigo}
        {obra.cliente && <span className="text-gray-500"> · {obra.cliente}</span>}
      </div>

      {/* Stats: registros + pendientes */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <div className="text-[9px] uppercase tracking-wider font-semibold text-gray-400">
            Registros
          </div>
          <div className="text-xl font-bold text-gray-900 leading-none mt-1">
            {obra.totalRegistros}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider font-semibold text-gray-400">
            Pendientes SST
          </div>
          <div
            className={`text-xl font-bold leading-none mt-1 inline-flex items-center gap-1 ${
              tienePendientes ? 'text-amber-600' : 'text-gray-900'
            }`}
          >
            {obra.pendientes}
            {tienePendientes && <span className="text-amber-500 text-base leading-none">!</span>}
          </div>
        </div>
      </div>

      {/* Footer: última actividad + CTA */}
      <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-2">
        <span className="text-[9px] text-gray-400 truncate">
          {obra.ultimoTimestamp
            ? `${formatRelativeDate(obra.ultimoTimestamp)} · ${obra.ultimoResponsable || '—'}`
            : 'Sin actividad'}
        </span>
        <span className="text-[11px] font-semibold text-blue-700 group-hover:text-blue-800 flex-shrink-0 ml-2 inline-flex items-center gap-0.5">
          Gestionar
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </span>
      </div>
    </Link>
  )
}
