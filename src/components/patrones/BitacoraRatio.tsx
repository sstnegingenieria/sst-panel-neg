import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useIndicadorRegistros } from '../../hooks/useIndicadorRegistros'
import TextField from '../shared/TextField'
import type { ConfigRatioAnual, Indicador, IndicadorRegistro } from '../../types/indicador'

interface BitacoraRatioProps {
  indicador: Indicador
  periodo: string
  registros: IndicadorRegistro[]
  puedeEditar: boolean
  esAdmin: boolean
  onCambio: () => Promise<void>
}

/** Patrón D — ratio con base externa (SST-IND-06: evaluación de condiciones de salud). */
export default function BitacoraRatio({ indicador, periodo, registros, puedeEditar, esAdmin, onCambio }: BitacoraRatioProps) {
  const { user } = useAuth()
  const { agregarRegistro, eliminarRegistro, actualizarConfigIndicador } = useIndicadorRegistros()
  const config = indicador.config as ConfigRatioAnual | undefined
  const [totalTrabajadores, setTotalTrabajadores] = useState(String(config?.total_trabajadores ?? ''))
  const [nombre, setNombre] = useState('')
  const [fecha, setFecha] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [procesandoId, setProcesandoId] = useState<string | null>(null)

  const guardarConfig = async () => {
    const n = Number(totalTrabajadores)
    if (!Number.isFinite(n) || n <= 0) return
    await actualizarConfigIndicador(indicador.id, { total_trabajadores: n })
    await onCambio()
  }

  const agregar = async () => {
    if (!user || !nombre.trim() || !fecha) return
    setGuardando(true)
    try {
      await agregarRegistro(indicador, periodo, { nombre: nombre.trim(), fecha }, user.uid)
      setNombre('')
      setFecha('')
      await onCambio()
    } finally {
      setGuardando(false)
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
    <div className="flex flex-col gap-4">
      {puedeEditar && (
        <div className="flex items-end gap-2">
          <div className="w-44">
            <TextField label="Total de trabajadores" value={totalTrabajadores} onChange={setTotalTrabajadores} type="number" />
          </div>
          <button
            onClick={guardarConfig}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 hover:bg-gray-50 transition"
          >
            Guardar
          </button>
        </div>
      )}

      {registros.length === 0 ? (
        <p className="text-sm text-gray-400">Sin registros todavía.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {registros.map(r => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm">
              <span className="flex-1 text-gray-700">{String(r.data.nombre)}</span>
              <span className="text-xs text-gray-400">{String(r.data.fecha)}</span>
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
            <TextField label="Nombre" value={nombre} onChange={setNombre} placeholder="Nombre del trabajador" />
          </div>
          <div className="w-40">
            <TextField label="Fecha del examen" value={fecha} onChange={setFecha} type="date" />
          </div>
          <button
            onClick={agregar}
            disabled={guardando || !nombre.trim() || !fecha}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-brand-700 hover:bg-brand-800 text-white transition disabled:opacity-50"
          >
            ＋ Agregar
          </button>
        </div>
      )}
    </div>
  )
}
