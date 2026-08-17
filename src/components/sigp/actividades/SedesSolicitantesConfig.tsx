// src/components/sigp/actividades/SedesSolicitantesConfig.tsx
//
// Configuración mínima del cliente para operar Actividades: sedes,
// solicitantes y el flag `usa_actividades`. Se monta en el detalle del
// cliente (otra sesión lo cablea); cada cambio persiste directo con
// updateDoc — sin borrador local que se pueda perder.
import { useState } from 'react'
import { doc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import TextField from '../../shared/TextField'
import { toast } from '../../shared/Toast'
import type { Cliente } from '../../../types/sigp/cliente'

interface SedesSolicitantesConfigProps {
  cliente: Cliente
  onGuardado: () => void
  puedeEditar: boolean
}

type Sede = NonNullable<Cliente['sedes']>[number]

export default function SedesSolicitantesConfig({ cliente, onGuardado, puedeEditar }: SedesSolicitantesConfigProps) {
  const [sedes, setSedes] = useState<Sede[]>(cliente.sedes ?? [])
  const [solicitantes, setSolicitantes] = useState<string[]>(cliente.contactos_solicitantes ?? [])
  const [usaActividades, setUsaActividades] = useState(cliente.usa_actividades ?? false)

  const [nombreSede, setNombreSede] = useState('')
  const [zonaSede, setZonaSede] = useState('')
  const [nombreSolicitante, setNombreSolicitante] = useState('')
  const [guardando, setGuardando] = useState(false)

  const persistir = async (parcial: { sedes?: Sede[]; contactos_solicitantes?: string[]; usa_actividades?: boolean }) => {
    setGuardando(true)
    try {
      await updateDoc(doc(db, 'clientes', cliente.id), { ...parcial, fecha_actualizacion: Timestamp.now() })
      toast('Cambios guardados')
      onGuardado()
    } catch (e) {
      console.error('SedesSolicitantesConfig.persistir', e)
      toast('No se pudo guardar el cambio', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const agregarSede = () => {
    if (!nombreSede.trim()) return
    const nueva: Sede = { id: crypto.randomUUID(), nombre: nombreSede.trim(), ...(zonaSede.trim() ? { zona: zonaSede.trim() } : {}) }
    const nuevas = [...sedes, nueva]
    setSedes(nuevas); setNombreSede(''); setZonaSede('')
    persistir({ sedes: nuevas })
  }

  const quitarSede = (id: string) => {
    if (!window.confirm('¿Quitar esta sede?')) return
    const nuevas = sedes.filter(s => s.id !== id)
    setSedes(nuevas)
    persistir({ sedes: nuevas })
  }

  const agregarSolicitante = () => {
    if (!nombreSolicitante.trim()) return
    const nuevos = [...solicitantes, nombreSolicitante.trim()]
    setSolicitantes(nuevos); setNombreSolicitante('')
    persistir({ contactos_solicitantes: nuevos })
  }

  const quitarSolicitante = (nombre: string) => {
    if (!window.confirm('¿Quitar este solicitante?')) return
    const nuevos = solicitantes.filter(s => s !== nombre)
    setSolicitantes(nuevos)
    persistir({ contactos_solicitantes: nuevos })
  }

  const toggleUsaActividades = () => {
    const nuevo = !usaActividades
    setUsaActividades(nuevo)
    persistir({ usa_actividades: nuevo })
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Sedes</h3>
        {sedes.length === 0 && <p className="text-xs text-gray-400">Sin sedes registradas.</p>}
        <ul className="space-y-1">
          {sedes.map(s => (
            <li key={s.id} className="flex items-center justify-between text-sm text-gray-600 border-b border-gray-50 pb-1">
              <span>{s.nombre}{s.zona ? <span className="text-gray-400"> · {s.zona}</span> : null}</span>
              {puedeEditar && (
                <button onClick={() => quitarSede(s.id)} disabled={guardando} className="text-gray-400 hover:text-red-600 text-xs">✕</button>
              )}
            </li>
          ))}
        </ul>
        {puedeEditar && (
          <div className="flex gap-2 items-end pt-1">
            <TextField label="Nombre" value={nombreSede} onChange={setNombreSede} />
            <TextField label="Zona" value={zonaSede} onChange={setZonaSede} />
            <button onClick={agregarSede} disabled={guardando || !nombreSede.trim()}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50 whitespace-nowrap">
              ＋ Agregar
            </button>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Solicitantes</h3>
        {solicitantes.length === 0 && <p className="text-xs text-gray-400">Sin solicitantes registrados.</p>}
        <ul className="space-y-1">
          {solicitantes.map(s => (
            <li key={s} className="flex items-center justify-between text-sm text-gray-600 border-b border-gray-50 pb-1">
              <span>{s}</span>
              {puedeEditar && (
                <button onClick={() => quitarSolicitante(s)} disabled={guardando} className="text-gray-400 hover:text-red-600 text-xs">✕</button>
              )}
            </li>
          ))}
        </ul>
        {puedeEditar && (
          <div className="flex gap-2 items-end pt-1">
            <TextField label="Nombre" value={nombreSolicitante} onChange={setNombreSolicitante} />
            <button onClick={agregarSolicitante} disabled={guardando || !nombreSolicitante.trim()}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50 whitespace-nowrap">
              ＋ Agregar
            </button>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-600 pt-2 border-t border-gray-100">
          <input type="checkbox" checked={usaActividades} onChange={toggleUsaActividades} disabled={!puedeEditar || guardando} />
          Este cliente opera con el módulo de Actividades
        </label>
      </div>
    </div>
  )
}
