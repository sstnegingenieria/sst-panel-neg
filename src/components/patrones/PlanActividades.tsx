import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useIndicadorRegistros } from '../../hooks/useIndicadorRegistros'
import TextField from '../shared/TextField'
import type { Indicador, IndicadorRegistro } from '../../types/indicador'

interface PlanActividadesProps {
  indicador: Indicador
  periodo: string
  registros: IndicadorRegistro[]
  puedeEditar: boolean
  esAdmin: boolean
  onCambio: () => Promise<void>
}

/** Patrón B — programado vs. ejecutado (SST-IND-04: plan de capacitación). */
export default function PlanActividades({ indicador, periodo, registros, puedeEditar, esAdmin, onCambio }: PlanActividadesProps) {
  const { user } = useAuth()
  const { agregarRegistro, actualizarRegistro, eliminarRegistro } = useIndicadorRegistros()
  const [nombre, setNombre] = useState('')
  const [fechaPlaneada, setFechaPlaneada] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [procesandoId, setProcesandoId] = useState<string | null>(null)

  const agregar = async () => {
    if (!user || !nombre.trim()) return
    setGuardando(true)
    try {
      await agregarRegistro(indicador, periodo, { nombre: nombre.trim(), fecha_planeada: fechaPlaneada, ejecutada: false }, user.uid)
      setNombre('')
      setFechaPlaneada('')
      await onCambio()
    } finally {
      setGuardando(false)
    }
  }

  const toggleEjecutada = async (r: IndicadorRegistro) => {
    if (!user) return
    setProcesandoId(r.id)
    try {
      await actualizarRegistro(indicador, periodo, r.id, { ...r.data, ejecutada: !r.data.ejecutada }, user.uid)
      await onCambio()
    } finally {
      setProcesandoId(null)
    }
  }

  const eliminar = async (r: IndicadorRegistro) => {
    if (!user) return
    setProcesandoId(r.id)
    try {
      await eliminarRegistro(indicador, periodo, r.id, user.uid)
      await onCambio()
    } finally {
      setProcesandoId(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {registros.length === 0 ? (
        <p className="text-sm text-gray-400">Sin actividades registradas todavía.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {registros.map(r => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm">
              <input
                type="checkbox"
                checked={r.data.ejecutada === true}
                disabled={!puedeEditar || procesandoId === r.id}
                onChange={() => toggleEjecutada(r)}
                className="w-4 h-4 accent-brand-600"
              />
              <span className="flex-1 text-gray-700">{String(r.data.nombre)}</span>
              {!!r.data.fecha_planeada && <span className="text-xs text-gray-400">{String(r.data.fecha_planeada)}</span>}
              {esAdmin && (
                <button
                  onClick={() => eliminar(r)}
                  disabled={procesandoId === r.id}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Eliminar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {puedeEditar && (
        <div className="flex items-end gap-2 pt-1">
          <div className="flex-1">
            <TextField label="Nueva actividad" value={nombre} onChange={setNombre} placeholder="Nombre de la actividad" />
          </div>
          <div className="w-40">
            <TextField label="Fecha planeada" value={fechaPlaneada} onChange={setFechaPlaneada} type="date" />
          </div>
          <button
            onClick={agregar}
            disabled={guardando || !nombre.trim()}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-brand-700 hover:bg-brand-800 text-white transition disabled:opacity-50"
          >
            ＋ Agregar
          </button>
        </div>
      )}
    </div>
  )
}
