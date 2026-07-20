// Entregables IHS (SIGP F2.3 ligero) — solo proyectos PREVENTIVOS.
//
// Traza los 3 formatos que el equipo diligencia en los archivos de IHS y
// sube a la app del cliente: aquí solo estado + copia adjunta + fecha + nota.
// Los 3 son requisito para registrar la ENTREGA (gate en EjecucionProyecto).
import { useState } from 'react'
import { doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import { ENTREGABLES_IHS, entregablesIhsFaltantes } from '../../../types/sigp/proyecto'
import type { Proyecto, EntregableIhsKey } from '../../../types/sigp/proyecto'

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

interface Props {
  proyecto: Proyecto
  puedeGestionar: boolean
  reload: () => Promise<void>
}

export default function EntregablesIhs({ proyecto, puedeGestionar, reload }: Props) {
  const { user } = useAuth()
  const [abierto, setAbierto] = useState<EntregableIhsKey | null>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [fecha, setFecha] = useState('')
  const [nota, setNota] = useState('')
  const [aplicando, setAplicando] = useState(false)

  if (proyecto.origen !== 'preventivo') return null

  const faltantes = entregablesIhsFaltantes(proyecto)
  const hechos = ENTREGABLES_IHS.length - faltantes.length

  const abrir = (key: EntregableIhsKey) => {
    setAbierto(key)
    setArchivo(null)
    setFecha(new Date().toISOString().slice(0, 10))
    setNota(proyecto.entregables_ihs?.[key]?.nota ?? '')
  }

  const guardar = async () => {
    if (!abierto || !archivo) return   // el adjunto ES la evidencia — obligatorio
    setAplicando(true)
    try {
      const etiqueta = ENTREGABLES_IHS.find(e => e.key === abierto)!.label
      const nombre = `${Date.now()}_${archivo.name}`
      const snap = await uploadBytes(ref(storage, `proyectos/${proyecto.id}/entregables/${nombre}`), archivo)
      const url = await getDownloadURL(snap.ref)
      const ahora = Timestamp.now()
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        [`entregables_ihs.${abierto}`]: {
          estado: 'diligenciado',
          adjunto_url: url, adjunto_nombre: archivo.name,
          fecha: Timestamp.fromDate(new Date(fecha + 'T12:00:00')),
          ...(nota.trim() ? { nota: nota.trim() } : {}),
          por: user?.uid ?? '',
        },
        fecha_actualizacion: ahora,
        historial: arrayUnion({
          de: proyecto.estado, a: proyecto.estado, por: user?.uid ?? '', fecha: ahora,
          motivo: `Entregable IHS diligenciado: ${etiqueta} (${archivo.name})`,
        }),
      })
      toast(`${etiqueta} adjuntado`)
      setAbierto(null)
      await reload()
    } catch { toast('Error al adjuntar el entregable', 'error') } finally { setAplicando(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Entregables IHS</p>
        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
          hechos === ENTREGABLES_IHS.length ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
        }`}>
          {hechos}/{ENTREGABLES_IHS.length}
        </span>
      </div>
      <p className="text-[11px] text-gray-400">
        Los formatos se diligencian en los archivos de IHS y se suben a su app; aquí queda la trazabilidad y la copia.
        Los 3 son requisito para registrar la entrega.
      </p>

      <ul className="space-y-2">
        {ENTREGABLES_IHS.map(e => {
          const item = proyecto.entregables_ihs?.[e.key]
          const hecho = item?.estado === 'diligenciado'
          return (
            <li key={e.key} className="rounded-lg border border-gray-100 px-3 py-2">
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className={hecho ? 'text-emerald-600' : 'text-gray-300'}>{hecho ? '✓' : '○'}</span>
                <span className="font-medium text-gray-700">{e.label}</span>
                {hecho ? (
                  <>
                    <span className="text-xs text-gray-400">· {fFecha(item?.fecha)}</span>
                    {item?.adjunto_url && (
                      <a href={item.adjunto_url} target="_blank" rel="noreferrer"
                        className="text-xs text-brand-700 underline underline-offset-2">
                        📎 {item.adjunto_nombre ?? 'Archivo'}
                      </a>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-amber-600">Pendiente</span>
                )}
                {puedeGestionar && (
                  <button onClick={() => abrir(e.key)}
                    className="ml-auto text-xs px-2 py-0.5 rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 font-medium">
                    {hecho ? 'Reemplazar' : 'Adjuntar'}
                  </button>
                )}
              </div>
              {item?.nota && <p className="mt-1 text-xs text-gray-500 pl-6">{item.nota}</p>}

              {abierto === e.key && (
                <div className="mt-2 pl-6 space-y-2 bg-gray-50 rounded-lg p-3">
                  <label className="block text-xs text-gray-500">
                    Archivo diligenciado (Excel de IHS)
                    <input type="file" onChange={ev => setArchivo(ev.target.files?.[0] ?? null)}
                      className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
                  </label>
                  <div className="flex flex-wrap gap-2.5">
                    <label className="text-xs text-gray-500">
                      Fecha
                      <input type="date" value={fecha} onChange={ev => setFecha(ev.target.value)}
                        className="mt-1 block text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
                    </label>
                    <label className="flex-1 min-w-[200px] text-xs text-gray-500">
                      Nota (opcional)
                      <input value={nota} onChange={ev => setNota(ev.target.value)}
                        className="mt-1 w-full text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={guardar} disabled={!archivo || !fecha || aplicando}
                      className="text-sm px-3 py-1.5 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
                      {aplicando ? 'Adjuntando…' : 'Guardar'}
                    </button>
                    <button onClick={() => setAbierto(null)} disabled={aplicando}
                      className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
