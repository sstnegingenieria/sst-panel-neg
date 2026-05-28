// src/components/RegistroCard.tsx
import {
  TIPO_LABELS,
  TIPO_COLOR,
  REVISION_BADGE,
  type Formulario,
} from '../types/formulario'

interface Props {
  formulario: Formulario
  onClick: () => void
}

function avatarInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() ?? '')
    .join('') || '?'
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function RegistroCard({ formulario: f, onClick }: Props) {
  const revEstado = f.revision_sst?.estado ?? 'pendiente'
  const tipoLabel = TIPO_LABELS[f.tipo] ?? f.tipo
  const tipoColor = TIPO_COLOR[f.tipo] ?? 'bg-gray-100 text-gray-700'

  return (
    <div
      onClick={onClick}
      className="grid grid-cols-[80px_1fr_140px_90px] gap-3 items-center bg-white border border-gray-200 rounded-lg px-3 py-2.5 cursor-pointer hover:border-brand-700 hover:shadow-sm transition-all"
    >
      {/* Tipo + código */}
      <div className="text-center">
        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded ${tipoColor}`}>
          {tipoLabel}
        </span>
        {f.codigo_formato && (
          <div className="font-mono text-[9px] text-gray-400 mt-1 truncate">
            {f.codigo_formato}
          </div>
        )}
      </div>

      {/* Descripción */}
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-900 truncate">{tipoLabel}</div>
        <div className="text-[11px] text-gray-500 truncate">
          {(f.campos_dinamicos['tema'] as string) ??
            (f.campos_dinamicos['actividad'] as string) ??
            (f.campos_dinamicos['descripcion'] as string) ??
            f.proyecto}
        </div>
      </div>

      {/* Técnico */}
      <div className="text-center">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-[9px] font-bold flex items-center justify-center mx-auto mb-0.5">
          {avatarInitials(f.responsable)}
        </div>
        <div className="text-[10px] text-gray-600 truncate">{f.responsable || '—'}</div>
        <div className="text-[9px] text-gray-400">{formatDateTime(f.timestamp_creacion)}</div>
      </div>

      {/* Estado */}
      <div className="text-center">
        <span className={`inline-block text-[10px] font-medium px-2.5 py-0.5 rounded-full capitalize ${REVISION_BADGE[revEstado]}`}>
          {revEstado}
        </span>
      </div>
    </div>
  )
}
