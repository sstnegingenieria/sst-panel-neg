// src/components/RegistroKanban.tsx
import {
  TIPO_LABELS,
  TIPO_COLOR,
  type Formulario,
} from '../types/formulario'

interface Props {
  formularios: Formulario[]
  onCardClick: (f: Formulario) => void
}

type Estado = 'pendiente' | 'aprobado' | 'rechazado'

const COLUMN_STYLES: Record<Estado, { titulo: string; tituloColor: string; bg: string }> = {
  pendiente:  { titulo: 'Pendientes',  tituloColor: 'text-amber-700',   bg: 'bg-amber-50/50' },
  aprobado:   { titulo: 'Aprobados',   tituloColor: 'text-emerald-700', bg: 'bg-emerald-50/50' },
  rechazado:  { titulo: 'Rechazados',  tituloColor: 'text-red-700',     bg: 'bg-red-50/50' },
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

function KanbanCard({ f, onClick }: { f: Formulario; onClick: () => void }) {
  const tipoLabel = TIPO_LABELS[f.tipo] ?? f.tipo
  const tipoColor = TIPO_COLOR[f.tipo] ?? 'bg-gray-100 text-gray-700'
  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-md px-2.5 py-2 mb-1.5 cursor-pointer hover:border-gray-900 transition-colors"
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${tipoColor}`}>
          {tipoLabel}
        </span>
        {f.codigo_formato && (
          <span className="font-mono text-[8px] text-gray-400 truncate ml-2">
            {f.codigo_formato}
          </span>
        )}
      </div>
      <div className="text-[10px] text-gray-800 font-medium truncate">
        {f.responsable || '—'}
      </div>
      <div className="text-[9px] text-gray-400 mt-0.5">
        {formatShortDate(f.timestamp_creacion)}
      </div>
    </div>
  )
}

export default function RegistroKanban({ formularios, onCardClick }: Props) {
  const grouped: Record<Estado, Formulario[]> = { pendiente: [], aprobado: [], rechazado: [] }
  for (const f of formularios) {
    const estado: Estado = (f.revision_sst?.estado as Estado) ?? 'pendiente'
    grouped[estado].push(f)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 overflow-x-auto">
      {(['pendiente', 'aprobado', 'rechazado'] as Estado[]).map(estado => {
        const cfg = COLUMN_STYLES[estado]
        const items = grouped[estado]
        return (
          <div key={estado} className={`rounded-lg p-2.5 min-h-[300px] ${cfg.bg} min-w-[260px]`}>
            <div className={`flex items-center justify-between mb-2 text-[10px] font-bold uppercase tracking-wide ${cfg.tituloColor}`}>
              <span>{cfg.titulo}</span>
              <span className="bg-black/5 rounded-full px-1.5 py-0.5 text-[9px] font-bold">
                {items.length}
              </span>
            </div>
            {items.length === 0 ? (
              <div className="text-center text-[10px] text-gray-400 py-6">
                — sin registros —
              </div>
            ) : (
              items.map(f => <KanbanCard key={f.id} f={f} onClick={() => onCardClick(f)} />)
            )}
          </div>
        )
      })}
    </div>
  )
}
