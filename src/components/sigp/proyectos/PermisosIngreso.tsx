// Bloque "Permisos de ingreso" de la ficha de Proyecto (F2.1.b).
//
// El primer registro mueve el proyecto a 'permisos_en_tramite'; la resolución
// (aprobado/negado/no_requiere) se registra sobre el mismo objeto `permisos`
// con su entrada de historial. Adjunto a Storage proyectos/{id}/permisos/
// (auth-only, patrón de visitas).
import { useState } from 'react'
import { doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import { ESTADOS_PERMISOS, PERMISOS_LABEL, PERMISOS_COLOR } from '../../../types/sigp/proyecto'
import type { Proyecto, EstadoPermisos } from '../../../types/sigp/proyecto'

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

interface Props {
  proyecto: Proyecto
  puedeGestionar: boolean
  reload: () => Promise<void>
}

export default function PermisosIngreso({ proyecto, puedeGestionar, reload }: Props) {
  const { user } = useAuth()
  const p = proyecto.permisos
  const [editando, setEditando] = useState(false)
  const [estado, setEstado] = useState<EstadoPermisos>(p?.estado ?? 'solicitado')
  const [entidad, setEntidad] = useState(p?.entidad_responsable ?? '')
  const [fechaSolicitud, setFechaSolicitud] = useState('')
  const [fechaRespuesta, setFechaRespuesta] = useState('')
  const [nota, setNota] = useState(p?.nota ?? '')
  const [adjunto, setAdjunto] = useState<File | null>(null)
  const [aplicando, setAplicando] = useState(false)

  // Activo desde que hay contratista asignado; NO exige resolución para c/d
  // (la transición a preliquidación es F2.1.c).
  const activo = ['contratista_asignado', 'permisos_en_tramite'].includes(proyecto.estado)
  const puedeEditar = puedeGestionar && activo

  const guardar = async () => {
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      let adjuntoCampos = {}
      if (adjunto) {
        const nombre = `${Date.now()}_${adjunto.name}`
        const snap = await uploadBytes(ref(storage, `proyectos/${proyecto.id}/permisos/${nombre}`), adjunto)
        adjuntoCampos = { adjunto_url: await getDownloadURL(snap.ref), adjunto_nombre: adjunto.name }
      }
      const permisos = {
        ...(p ?? {}),
        estado,
        ...(entidad.trim() ? { entidad_responsable: entidad.trim() } : {}),
        ...(fechaSolicitud ? { fecha_solicitud: Timestamp.fromDate(new Date(fechaSolicitud + 'T12:00:00')) } : {}),
        ...(fechaRespuesta ? { fecha_respuesta: Timestamp.fromDate(new Date(fechaRespuesta + 'T12:00:00')) } : {}),
        ...(nota.trim() ? { nota: nota.trim() } : {}),
        ...adjuntoCampos,
      }
      const esPrimerRegistro = proyecto.estado === 'contratista_asignado'
      await updateDoc(doc(db, 'proyectos', proyecto.id), {
        permisos,
        ...(esPrimerRegistro ? { estado: 'permisos_en_tramite' } : {}),
        fecha_actualizacion: ahora,
        historial: arrayUnion({
          de: esPrimerRegistro ? 'contratista_asignado' : 'permisos_en_tramite',
          a: 'permisos_en_tramite',
          por: user?.uid ?? '', fecha: ahora,
          motivo: `Permisos de ingreso: ${PERMISOS_LABEL[estado]}${entidad.trim() ? ` · ${entidad.trim()}` : ''}`,
        }),
      })
      toast('Permisos de ingreso registrados')
      setEditando(false); setAdjunto(null)
      await reload()
    } catch { toast('Error al registrar los permisos', 'error') } finally { setAplicando(false) }
  }

  if (!activo && !p) {
    return (
      <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-400">Permisos de ingreso</p>
        <p className="text-xs text-gray-400 mt-1">Disponible al asignar el contratista.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Permisos de ingreso</p>
        {p && (
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${PERMISOS_COLOR[p.estado]}`}>
            {PERMISOS_LABEL[p.estado]}
          </span>
        )}
        {puedeEditar && !editando && (
          <button onClick={() => setEditando(true)}
            className="ml-auto text-xs px-2.5 py-1 rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 font-medium">
            {p ? 'Actualizar' : 'Registrar permisos'}
          </button>
        )}
      </div>

      {/* Registro actual */}
      {p && !editando && (
        <div className="text-xs text-gray-600 space-y-1">
          {p.entidad_responsable && <p>Entidad responsable: <span className="font-medium">{p.entidad_responsable}</span></p>}
          <p>
            {p.fecha_solicitud && <>Solicitado: {fFecha(p.fecha_solicitud)}</>}
            {p.fecha_respuesta && <> · Respuesta: {fFecha(p.fecha_respuesta)}</>}
          </p>
          {p.adjunto_url && (
            <a href={p.adjunto_url} target="_blank" rel="noreferrer" className="text-brand-700 underline underline-offset-2">
              📎 {p.adjunto_nombre ?? 'Adjunto'}
            </a>
          )}
          {p.nota && <p className="bg-gray-50 rounded px-2 py-1.5">{p.nota}</p>}
        </div>
      )}
      {!p && !editando && <p className="text-xs text-gray-400">Sin registro aún.</p>}

      {/* Formulario */}
      {editando && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="text-xs text-gray-500">
              Estado
              <select value={estado} onChange={e => setEstado(e.target.value as EstadoPermisos)}
                className="mt-1 w-full text-sm px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300">
                {ESTADOS_PERMISOS.map(e => <option key={e} value={e}>{PERMISOS_LABEL[e]}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              Entidad responsable
              <input value={entidad} onChange={e => setEntidad(e.target.value)} placeholder="Ej: Claro, Titan Plaza, administración…"
                className="mt-1 w-full text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
            <label className="text-xs text-gray-500">
              Fecha de solicitud
              <input type="date" value={fechaSolicitud} onChange={e => setFechaSolicitud(e.target.value)}
                className="mt-1 w-full text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
            <label className="text-xs text-gray-500">
              Fecha de respuesta
              <input type="date" value={fechaRespuesta} onChange={e => setFechaRespuesta(e.target.value)}
                className="mt-1 w-full text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
          </div>
          <label className="block text-xs text-gray-500">
            Adjunto (permiso / comunicación)
            <input type="file" onChange={e => setAdjunto(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
          </label>
          <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} placeholder="Nota (opcional)"
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
          <div className="flex gap-2">
            <button onClick={guardar} disabled={aplicando}
              className="text-sm px-3 py-1.5 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
              {aplicando ? 'Guardando…' : 'Guardar'}
            </button>
            <button onClick={() => setEditando(false)} disabled={aplicando}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
