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
      className={`group block bg-white border rounded-lg p-3 transition-all relative ${
        inactiva
          ? 'border-gray-200 opacity-50 hover:opacity-75'
          : 'border-gray-200 hover:border-blue-700 hover:-translate-y-px hover:shadow-md'
      }`}
    >
      {/* Indicador de pendientes (esquina superior derecha) */}
      {tienePendientes && (
        <span
          className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-amber-500"
          style={{ boxShadow: '0 0 0 4px rgba(245,158,11,0.18)' }}
          aria-label={`${obra.pendientes} pendientes`}
        />
      )}

      {/* Título + código */}
      <div className="text-sm font-semibold text-gray-900 truncate" title={obra.nombre_sitio}>
        {obra.nombre_sitio}
      </div>
      <div className="font-mono text-[10px] text-gray-400 mb-2 truncate">
        {obra.codigo}
        {obra.cliente && <span className="text-gray-500"> · {obra.cliente}</span>}
      </div>

      {/* Stats grandes */}
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-xl font-bold text-gray-900 leading-none">
          {obra.totalRegistros}
        </span>
        <span className="text-[9px] uppercase tracking-wide text-gray-400">
          {obra.totalRegistros === 1 ? 'registro' : 'registros'}
        </span>
        {tienePendientes && (
          <span className="ml-auto bg-amber-100 text-amber-800 rounded text-[9px] font-bold px-1.5 py-0.5">
            {obra.pendientes} pend
          </span>
        )}
      </div>

      {/* Última actividad */}
      <div className="text-[9px] text-gray-400 border-t border-gray-100 pt-1">
        {obra.ultimoTimestamp
          ? `${formatRelativeDate(obra.ultimoTimestamp)} · ${obra.ultimoResponsable || '—'}`
          : 'Sin actividad'}
      </div>
    </Link>
  )
}
