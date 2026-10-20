// Desplegable ÚNICO de colaborador: directos NEG activos + trabajadores vigentes de
// contratistas activos, etiquetado por origen. Al elegir, autocompleta nombre/cédula/cargo
// (editables: la nómina de contratistas no trae cargo, se escribe a mano).
import { useMemo, useState } from 'react'
import { enmascararCedula } from '../../../utils/empleadosDirectos'
import type { ColaboradorEpp } from '../../../types/sigp/epp'
import type { OpcionColaboradorEpp } from '../../../hooks/useEpp'

interface Props {
  opciones: OpcionColaboradorEpp[]
  value: ColaboradorEpp | null
  onChange: (c: ColaboradorEpp | null) => void
  cargando?: boolean
  error?: string
}

const INPUT = 'px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300'

export default function ColaboradorSelect({ opciones, value, onChange, cargando, error }: Props) {
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState(false)

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const digitos = q.replace(/[.\s-]/g, '')
    return opciones
      .filter(o => !q || o.nombre.toLowerCase().includes(q) || o.origen.toLowerCase().includes(q)
        || (digitos && o.cedula.includes(digitos)))
      .slice(0, 50)
  }, [opciones, busqueda])

  const elegir = (o: OpcionColaboradorEpp) => {
    const { clave: _c, origen: _o, ...col } = o
    void _c; void _o
    onChange(col)
    setBusqueda('')
    setAbierto(false)
  }

  const set = (campo: 'nombre' | 'cedula' | 'cargo', v: string) => value && onChange({ ...value, [campo]: v })

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-700">Colaborador <span className="text-red-500">*</span></label>
      <div className="relative">
        <input
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setAbierto(true) }}
          onFocus={() => setAbierto(true)}
          placeholder={cargando ? 'Cargando personas…' : 'Busca por nombre, cédula o empresa…'}
          className={`w-full ${INPUT}`}
          aria-label="Buscar colaborador"
        />
        {abierto && (
          <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg text-sm" role="listbox">
            {filtradas.length === 0 && <li className="px-3 py-2 text-gray-400">Sin coincidencias</li>}
            {filtradas.map(o => (
              <li key={o.clave}>
                <button type="button" onClick={() => elegir(o)} role="option"
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-baseline justify-between gap-3">
                  <span className="font-medium text-gray-900">{o.nombre}</span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {o.origen}{o.cedula ? ` · ${enmascararCedula(o.cedula)}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {value && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="sm:col-span-3 text-xs text-gray-500">
            {value.fuente === 'directo' ? 'Directo NEG' : `Contratista ${value.contratista_nombre ?? ''}`}
            {' · '}verifica los datos antes de firmar
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">Nombre
            <input value={value.nombre} onChange={e => set('nombre', e.target.value)} className={INPUT} maxLength={200} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">Cédula
            <input value={value.cedula} onChange={e => set('cedula', e.target.value)} className={INPUT} maxLength={30} inputMode="numeric" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">Cargo
            <input value={value.cargo} onChange={e => set('cargo', e.target.value)} className={INPUT} maxLength={200}
              placeholder={value.fuente === 'contratista' ? 'Escríbelo (la nómina no lo trae)' : ''} />
          </label>
          <div className="sm:col-span-3">
            <button type="button" onClick={() => onChange(null)} className="text-xs text-gray-500 hover:underline">
              Cambiar colaborador
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
