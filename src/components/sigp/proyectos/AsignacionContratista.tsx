// Bloque "Contratista" de la ficha de Proyecto (F2.1.b).
//
// Evidencia ISO: solo se asignan contratistas HABILITADOS; al asignar se
// congela su estado de habilitación (y documento) en el proyecto. El registro
// actual no tiene datos de evaluación → se muestra la nota de que la
// evaluación formal vive en el SGI.
import { useState, useEffect, useCallback } from 'react'
import { doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { useFirestore } from '../../../hooks/useFirestore'
import { toast } from '../../shared/Toast'
import { contratistaAsignable, construirAsignacion } from '../../../types/sigp/proyecto'
import type { Proyecto } from '../../../types/sigp/proyecto'
import type { Contratista } from '../../ContratistasTable'

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

interface Props {
  proyecto: Proyecto
  puedeGestionar: boolean
  reload: () => Promise<void>
}

export default function AsignacionContratista({ proyecto, puedeGestionar, reload }: Props) {
  const { user } = useAuth()
  const { getAllOrdered } = useFirestore()
  const [contratistas, setContratistas] = useState<Contratista[]>([])
  const [seleccionId, setSeleccionId] = useState('')
  const [nota, setNota] = useState('')
  const [aplicando, setAplicando] = useState(false)

  const puedeAsignar = puedeGestionar && proyecto.estado === 'creado' && !proyecto.asignacion

  const load = useCallback(async () => {
    try {
      setContratistas(await getAllOrdered('contratistas', 'nombre', 'asc') as Contratista[])
    } catch { toast('Error al cargar contratistas', 'error') }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (puedeAsignar) load() }, [puedeAsignar, load])

  const habilitados = contratistas.filter(contratistaAsignable)
  const seleccionado = habilitados.find(c => c.id === seleccionId) ?? null

  const asignar = async () => {
    if (!seleccionado) return
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      const asignacion = construirAsignacion(seleccionado, user?.uid ?? '', ahora, nota)
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        asignacion,
        estado: 'contratista_asignado',
        fecha_actualizacion: ahora,
        historial: arrayUnion({
          de: 'creado', a: 'contratista_asignado', por: user?.uid ?? '', fecha: ahora,
          motivo: `Contratista ${seleccionado.nombre} asignado (habilitado al momento de la asignación)`,
        }),
      })
      toast(`Contratista asignado — ${seleccionado.nombre}`)
      await reload()
    } catch { toast('Error al asignar el contratista', 'error') } finally { setAplicando(false) }
  }

  // ── Asignado: evidencia congelada ──
  if (proyecto.asignacion) {
    const a = proyecto.asignacion
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Contratista</p>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-gray-800">{a.contratista_nombre}</p>
          <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
            Habilitado al asignar
          </span>
        </div>
        {a.contratista_documento && <p className="text-xs text-gray-500">Documento: {a.contratista_documento}</p>}
        <p className="text-xs text-gray-500">Asignado el {fFecha(a.fecha)}</p>
        {a.nota_criterio && <p className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5">Criterio: {a.nota_criterio}</p>}
        {a.evaluacion_snapshot ? (
          <p className="text-xs text-gray-500">
            Evaluación: {a.evaluacion_snapshot.puntaje ?? '—'} · {fFecha(a.evaluacion_snapshot.fecha)}
            {a.evaluacion_snapshot.detalle ? ` · ${a.evaluacion_snapshot.detalle}` : ''}
          </p>
        ) : (
          <p className="text-[11px] text-gray-400">
            Evidencia de habilitación congelada al asignar. La evaluación formal del proveedor vive en el SGI
            (FT Selección y Reevaluación de Proveedores).
          </p>
        )}
      </div>
    )
  }

  // ── Sin asignar ──
  if (!puedeAsignar) {
    return (
      <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-400">Contratista</p>
        <p className="text-xs text-gray-400 mt-1">Sin asignar.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Asignar contratista</p>
      <select value={seleccionId} onChange={e => setSeleccionId(e.target.value)}
        className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300">
        <option value="">— Selecciona un contratista habilitado —</option>
        {habilitados.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <p className="text-[11px] text-gray-400">
        Solo aparecen contratistas habilitados ({habilitados.length} de {contratistas.length} en el registro).
      </p>

      {seleccionado && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-800">{seleccionado.nombre}</p>
            <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
              Habilitado
            </span>
            <span className="text-[11px] text-gray-500">{seleccionado.tipo === 'juridica' ? 'Persona jurídica' : 'Persona natural'}</span>
          </div>
          {(seleccionado.nit || seleccionado.cedula) && (
            <p className="text-xs text-gray-500">Documento: {seleccionado.nit || seleccionado.cedula}</p>
          )}
          <p className="text-[11px] text-gray-400">
            El registro no incluye evaluación del proveedor: la evaluación formal vive en el SGI
            (FT Selección y Reevaluación de Proveedores). Al asignar se congela esta evidencia de habilitación.
          </p>
        </div>
      )}

      <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
        placeholder="Nota de criterio (opcional) — por qué este contratista"
        className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />

      <button onClick={asignar} disabled={!seleccionado || aplicando}
        className="text-sm px-3 py-1.5 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
        {aplicando ? 'Asignando…' : 'Asignar contratista'}
      </button>
    </div>
  )
}
