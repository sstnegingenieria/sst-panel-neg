// src/components/EstadoSstBar.tsx
interface Props {
  aprobados: number
  rechazados: number
  pendientes: number
  total: number
  className?: string
}

export default function EstadoSstBar({ aprobados, rechazados, pendientes, total, className = '' }: Props) {
  const tooltip = `${aprobados} aprobados · ${rechazados} rechazados · ${pendientes} pendientes`

  if (total === 0) {
    return (
      <div className={className} title={tooltip}>
        <span className="text-[11px] text-gray-400">Sin registros</span>
      </div>
    )
  }

  const pctAprobados = (aprobados / total) * 100
  const pctRechazados = (rechazados / total) * 100
  const pctPendientes = (pendientes / total) * 100

  let label: string
  let labelClass: string
  if (aprobados === total) {
    label = 'Al día · 100%'
    labelClass = 'text-emerald-700'
  } else if (rechazados > 0) {
    label = `${Math.round((rechazados / total) * 100)}% rechazados`
    labelClass = 'text-red-600'
  } else {
    label = `${pendientes} pendientes`
    labelClass = 'text-amber-600'
  }

  return (
    <div className={className} title={tooltip}>
      <div className="h-1.5 w-full min-w-[56px] rounded-full overflow-hidden bg-gray-100 flex">
        {pctAprobados > 0 && <div className="h-full bg-emerald-500" style={{ width: `${pctAprobados}%` }} />}
        {pctRechazados > 0 && <div className="h-full bg-red-500" style={{ width: `${pctRechazados}%` }} />}
        {pctPendientes > 0 && <div className="h-full bg-amber-400" style={{ width: `${pctPendientes}%` }} />}
      </div>
      <span className={`text-[11px] font-semibold mt-1 inline-block ${labelClass}`}>{label}</span>
    </div>
  )
}
