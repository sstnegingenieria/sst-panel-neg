import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useIndicadorRegistros } from '../../hooks/useIndicadorRegistros'
import TextField from '../shared/TextField'
import SelectField from '../shared/SelectField'
import { agruparPorMes } from '../../utils/indicadoresRegistros'
import type { ConfigRegistroAnual, Indicador, IndicadorRegistro } from '../../types/indicador'

interface BitacoraAusentismoProps {
  indicador: Indicador
  periodo: string
  registros: IndicadorRegistro[]
  puedeEditar: boolean
  esAdmin: boolean
  onCambio: () => Promise<void>
}

const TIPO_OPCIONES = [
  { value: 'laboral', label: 'Laboral (AT/EL)' },
  { value: 'comun', label: 'Común' },
]

/** Patrón C — bitácora acumulable (SST-IND-26: Ausentismo). No captura motivo médico. */
export default function BitacoraAusentismo({ indicador, periodo, registros, puedeEditar, esAdmin, onCambio }: BitacoraAusentismoProps) {
  const { user } = useAuth()
  const { agregarRegistro, eliminarRegistro, actualizarConfigIndicador } = useIndicadorRegistros()
  const config = indicador.config as ConfigRegistroAnual | undefined
  const [diasProgramados, setDiasProgramados] = useState(String(config?.dias_programados ?? ''))
  const [fecha, setFecha] = useState('')
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<'laboral' | 'comun'>('laboral')
  const [dias, setDias] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [procesandoId, setProcesandoId] = useState<string | null>(null)

  const totalAnual = registros.reduce((acc, r) => acc + (Number(r.data.dias) || 0), 0)
  const porMes = agruparPorMes(registros)

  const guardarConfig = async () => {
    const n = Number(diasProgramados)
    if (!Number.isFinite(n) || n <= 0) return
    await actualizarConfigIndicador(indicador.id, { dias_programados: n })
    await onCambio()
  }

  const agregar = async () => {
    const n = Number(dias)
    if (!user || !fecha || !nombre.trim() || !Number.isFinite(n) || n <= 0) return
    setGuardando(true)
    try {
      await agregarRegistro(indicador, periodo, { fecha, nombre: nombre.trim(), tipo, dias: n }, user.uid)
      setFecha('')
      setNombre('')
      setDias('')
      setTipo('laboral')
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
            <TextField label="Días programados (año)" value={diasProgramados} onChange={setDiasProgramados} type="number" />
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
        <p className="text-sm text-gray-400">Sin registros de ausentismo todavía.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 text-xs uppercase">
                <th className="py-1 pr-3">Fecha</th>
                <th className="py-1 pr-3">Nombre</th>
                <th className="py-1 pr-3">Tipo</th>
                <th className="py-1 pr-3">Días</th>
                {esAdmin && <th className="py-1" />}
              </tr>
            </thead>
            <tbody>
              {registros.map(r => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="py-1.5 pr-3 text-gray-600">{String(r.data.fecha)}</td>
                  <td className="py-1.5 pr-3 text-gray-700">{String(r.data.nombre)}</td>
                  <td className="py-1.5 pr-3 text-gray-500 capitalize">{String(r.data.tipo)}</td>
                  <td className="py-1.5 pr-3 text-gray-800 font-medium">{String(r.data.dias)}</td>
                  {esAdmin && (
                    <td className="py-1.5">
                      <button
                        onClick={() => eliminar(r)}
                        disabled={procesandoId === r.id}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Eliminar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {porMes.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          {porMes.map(m => (
            <span key={m.mes} className="px-2 py-1 rounded-full bg-gray-100">
              {m.mes}: {m.dias} día{m.dias === 1 ? '' : 's'}
            </span>
          ))}
          <span className="px-2 py-1 rounded-full bg-brand-100 text-brand-800 font-medium">Total año: {totalAnual} días</span>
        </div>
      )}

      {puedeEditar && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end pt-1">
          <TextField label="Fecha" value={fecha} onChange={setFecha} type="date" />
          <TextField label="Nombre" value={nombre} onChange={setNombre} />
          <SelectField label="Tipo" value={tipo} onChange={v => setTipo(v as 'laboral' | 'comun')} options={TIPO_OPCIONES} />
          <TextField label="Días" value={dias} onChange={setDias} type="number" />
          <div className="col-span-2 sm:col-span-4">
            <button
              onClick={agregar}
              disabled={guardando}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-brand-700 hover:bg-brand-800 text-white transition disabled:opacity-50"
            >
              ＋ Agregar registro
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
