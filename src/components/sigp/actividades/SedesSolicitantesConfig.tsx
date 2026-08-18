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
  const [ciudadSede, setCiudadSede] = useState('')
  const [nombreSolicitante, setNombreSolicitante] = useState('')
  const [guardando, setGuardando] = useState(false)
  // Editor de ZONAS por sede (plenamente editable: agregar/renombrar/quitar —
  // la lista sembrada es parcial por definición y se completa sola en uso).
  const [sedeAbierta, setSedeAbierta] = useState<string | null>(null)
  const [zonaNueva, setZonaNueva] = useState('')
  const [zonaEnEdicion, setZonaEnEdicion] = useState<{ idx: number; texto: string } | null>(null)

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
    const nueva: Sede = { id: crypto.randomUUID(), nombre: nombreSede.trim(), ...(ciudadSede.trim() ? { ciudad: ciudadSede.trim() } : {}) }
    const nuevas = [...sedes, nueva]
    setSedes(nuevas); setNombreSede(''); setCiudadSede('')
    persistir({ sedes: nuevas })
  }

  const quitarSede = (id: string) => {
    if (!window.confirm('¿Quitar esta sede?')) return
    const nuevas = sedes.filter(s => s.id !== id)
    setSedes(nuevas)
    persistir({ sedes: nuevas })
  }

  // Zonas: mutan el arreglo `zonas` de UNA sede y persisten el conjunto.
  // Quitar/renombrar una zona JAMÁS toca actividades históricas: la zona se
  // denormaliza como string en la actividad al registrarla.
  const conZonas = (sedeId: string, fn: (zonas: string[]) => string[]) => {
    const nuevas = sedes.map(s => {
      if (s.id !== sedeId) return s
      const zonas = fn([...(s.zonas ?? [])])
      return zonas.length > 0 ? { ...s, zonas } : (() => { const { zonas: _z, ...resto } = s; return resto })()
    })
    setSedes(nuevas)
    persistir({ sedes: nuevas })
  }

  const agregarZona = (sedeId: string) => {
    const z = zonaNueva.trim()
    if (!z) return
    conZonas(sedeId, zonas => zonas.includes(z) ? zonas : [...zonas, z])
    setZonaNueva('')
  }

  const renombrarZona = (sedeId: string) => {
    if (!zonaEnEdicion) return
    const texto = zonaEnEdicion.texto.trim()
    if (!texto) return
    conZonas(sedeId, zonas => zonas.map((z, i) => i === zonaEnEdicion.idx ? texto : z))
    setZonaEnEdicion(null)
  }

  const quitarZona = (sedeId: string, idx: number) => {
    if (!window.confirm('¿Quitar esta zona? Las actividades ya registradas con ella no cambian.')) return
    conZonas(sedeId, zonas => zonas.filter((_z, i) => i !== idx))
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
            <li key={s.id} className="text-sm text-gray-600 border-b border-gray-50 pb-1">
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => { setSedeAbierta(sedeAbierta === s.id ? null : s.id); setZonaNueva(''); setZonaEnEdicion(null) }}
                  className="text-left flex-1 hover:text-gray-800">
                  <span className="font-medium">{s.nombre}</span>
                  {s.ciudad && <span className="text-gray-400"> · {s.ciudad}</span>}
                  <span className="ml-2 text-[11px] text-gray-400">
                    {(s.zonas?.length ?? 0) > 0 ? `${s.zonas!.length} zonas` : 'sin zonas'} {sedeAbierta === s.id ? '▾' : '▸'}
                  </span>
                </button>
                {puedeEditar && (
                  <button onClick={() => quitarSede(s.id)} disabled={guardando} className="text-gray-400 hover:text-red-600 text-xs">✕</button>
                )}
              </div>
              {sedeAbierta === s.id && (
                <div className="mt-2 ml-2 space-y-1.5 border-l-2 border-gray-100 pl-3 pb-1">
                  {(s.zonas ?? []).map((z, idx) => (
                    <div key={`${s.id}-${idx}`} className="flex items-center gap-2 text-xs text-gray-600">
                      {zonaEnEdicion && zonaEnEdicion.idx === idx && puedeEditar ? (
                        <>
                          <input autoFocus value={zonaEnEdicion.texto}
                            onChange={e => setZonaEnEdicion({ idx, texto: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') renombrarZona(s.id); if (e.key === 'Escape') setZonaEnEdicion(null) }}
                            className="flex-1 px-2 py-1 border border-brand-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-400" />
                          <button onClick={() => renombrarZona(s.id)} disabled={guardando} className="text-brand-700 font-medium">Guardar</button>
                          <button onClick={() => setZonaEnEdicion(null)} className="text-gray-400">Cancelar</button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1">📍 {z}</span>
                          {puedeEditar && (
                            <>
                              <button onClick={() => setZonaEnEdicion({ idx, texto: z })} disabled={guardando}
                                className="text-gray-400 hover:text-brand-700" title="Renombrar zona">✎</button>
                              <button onClick={() => quitarZona(s.id, idx)} disabled={guardando}
                                className="text-gray-400 hover:text-red-600" title="Quitar zona">✕</button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  {puedeEditar && (
                    <div className="flex gap-2 items-center pt-1">
                      <input value={zonaNueva} onChange={e => setZonaNueva(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') agregarZona(s.id) }}
                        placeholder="Nueva zona (p. ej. Búnker XII)"
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-400" />
                      <button onClick={() => agregarZona(s.id)} disabled={guardando || !zonaNueva.trim()}
                        className="px-2 py-1 rounded text-xs font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">＋</button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        {puedeEditar && (
          <div className="flex gap-2 items-end pt-1">
            <TextField label="Nombre" value={nombreSede} onChange={setNombreSede} />
            <TextField label="Ciudad" value={ciudadSede} onChange={setCiudadSede} />
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
