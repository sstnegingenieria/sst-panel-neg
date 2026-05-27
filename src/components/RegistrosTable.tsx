import { useState } from 'react'

// ── Re-exports para mantener compatibilidad con código que aún importa desde
//    este archivo (Reportes, Dashboard, etc.). La fuente única de verdad para
//    los tipos del formulario vive ahora en src/types/formulario.ts.
export {
  TIPO_LABELS,
  TIPO_COLOR,
  REVISION_BADGE,
  normalizarDoc,
  formatDate,
} from '../types/formulario'
export type { RevisionSST, Formulario } from '../types/formulario'

// Imports locales para uso dentro de este archivo
import {
  TIPO_LABELS,
  TIPO_COLOR,
  REVISION_BADGE,
  formatDate,
  type Formulario,
} from '../types/formulario'

// ── Paginación ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25

// ── Componente ───────────────────────────────────────────────────────────────

interface RegistrosTableProps {
  formularios: Formulario[]
  loading: boolean
  onVerDetalle: (f: Formulario) => void
}

export default function RegistrosTable({ formularios, loading, onVerDetalle }: RegistrosTableProps) {
  const [page, setPage] = useState(1)

  // Resetear página cuando cambia la lista filtrada
  const totalPages = Math.max(1, Math.ceil(formularios.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const paginated  = formularios.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Fecha</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Formulario</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Técnico</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Obra</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Revisión SST</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="py-3 px-4">
                      <div className="h-4 bg-gray-200 rounded animate-pulse w-24" />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading && formularios.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-gray-400">
                  No hay registros que coincidan con los filtros.
                </td>
              </tr>
            )}

            {!loading &&
              paginated.map(f => {
                const revEstado = f.revision_sst?.estado ?? 'pendiente'
                return (
                  <tr
                    key={f.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => onVerDetalle(f)}
                  >
                    <td className="py-3 px-4 text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(f.timestamp_creacion)}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium w-fit ${
                            TIPO_COLOR[f.tipo] ?? 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {TIPO_LABELS[f.tipo] ?? f.tipo}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">{f.codigo_formato}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-gray-700 font-medium">{f.responsable}</td>

                    <td className="py-3 px-4 text-gray-600 text-xs max-w-[180px]">
                      <span className="block truncate" title={f.proyecto}>{f.proyecto}</span>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                          REVISION_BADGE[revEstado]
                        }`}
                      >
                        {revEstado}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={e => { e.stopPropagation(); onVerDetalle(f) }}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition font-medium"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
          <span>
            Página {safePage} de {totalPages}
            <span className="ml-1 text-gray-400">
              ({formularios.length} registros)
            </span>
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={safePage === 1}
              className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Primera página"
            >
              «
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              ‹ Anterior
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Siguiente ›
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={safePage === totalPages}
              className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Última página"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
