import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useIndicadorRegistros } from '../../hooks/useIndicadorRegistros'
import type { ConfigChecklist, Indicador, IndicadorRegistro } from '../../types/indicador'

interface ChecklistCriteriosProps {
  indicador: Indicador
  periodo: string
  registros: IndicadorRegistro[]
  puedeEditar: boolean
  onCambio: () => Promise<void>
}

/** Patrón A — checklist de criterios (SST-IND-01: los 11 del Decreto 1072). */
export default function ChecklistCriterios({ indicador, periodo, registros, puedeEditar, onCambio }: ChecklistCriteriosProps) {
  const { user } = useAuth()
  const { marcarCriterioChecklist } = useIndicadorRegistros()
  const [guardandoId, setGuardandoId] = useState<string | null>(null)
  const criterios = (indicador.config as ConfigChecklist | undefined)?.criterios ?? []

  const cumpleDe = (criterioId: string) =>
    registros.find(r => r.data.criterio_id === criterioId)?.data.cumple === true

  const toggle = async (criterioId: string, actual: boolean) => {
    if (!user || !puedeEditar) return
    setGuardandoId(criterioId)
    try {
      await marcarCriterioChecklist(indicador, periodo, criterioId, !actual, user.uid)
      await onCambio()
    } finally {
      setGuardandoId(null)
    }
  }

  if (criterios.length === 0) {
    return <p className="text-sm text-gray-400">Este indicador no tiene criterios configurados todavía.</p>
  }

  return (
    <div className="flex flex-col gap-1.5">
      {criterios.map(c => {
        const cumple = cumpleDe(c.id)
        return (
          <label
            key={c.id}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm transition ${
              cumple ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'
            } ${puedeEditar ? 'cursor-pointer hover:border-brand-300' : 'cursor-default opacity-80'}`}
          >
            <input
              type="checkbox"
              checked={cumple}
              disabled={!puedeEditar || guardandoId === c.id}
              onChange={() => toggle(c.id, cumple)}
              className="w-4 h-4 accent-brand-600"
            />
            <span className="flex-1 text-gray-700">{c.texto}</span>
            {guardandoId === c.id && <span className="text-[10px] text-gray-400">Guardando…</span>}
          </label>
        )
      })}
    </div>
  )
}
