import { useState } from 'react'
import {
  doc, getDoc, setDoc, updateDoc, arrayUnion, deleteField, Timestamp,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import Modal from '../../shared/Modal'
import { puedeNuevaVersion } from '../../../types/sigp/cotizacion'
import type { Cotizacion, EstadoCotizacion, VersionCotizacion } from '../../../types/sigp/cotizacion'

interface CotizacionAccionesProps {
  cotizacion: Cotizacion
  efectivo: EstadoCotizacion
  puedeGestionar: boolean
  /** Persiste el borrador en pantalla antes de enviar (congela el snapshot). Devuelve false si se canceló. */
  guardarBorrador: () => Promise<boolean>
  /** Genera y sube el PDF de la versión congelada (1.4B.e). null = falló → el envío se aborta. */
  generarPdf: (fechaEmision: Date) => Promise<{ url: string; hash: string } | null>
  reload: () => Promise<void>
}

/**
 * Acciones de estado de la cotización (1.4A.e):
 *  - borrador  → Enviar (confirm; congela snapshot + fecha_envio)
 *  - enviada   → Aprobar (evidencia OBLIGATORIA) | Rechazar (motivo obligatorio)
 *  - enviada/rechazada/vencida → Nueva versión (copia completa como borrador v+1)
 */
export default function CotizacionAcciones({ cotizacion, efectivo, puedeGestionar, guardarBorrador, generarPdf, reload }: CotizacionAccionesProps) {
  const { user } = useAuth()
  const [aplicando, setAplicando] = useState(false)
  const [modalRechazo, setModalRechazo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [modalAprobar, setModalAprobar] = useState(false)
  const [evidencia, setEvidencia] = useState<File | null>(null)

  if (!puedeGestionar) return null

  const entrada = (de: EstadoCotizacion, a: EstadoCotizacion, extra?: { motivo?: string; version?: number }) => ({
    de, a,
    version: extra?.version ?? cotizacion.version_activa,
    por: user?.uid ?? '',
    fecha: Timestamp.now(),
    ...(extra?.motivo ? { motivo: extra.motivo } : {}),
  })

  const enviar = async () => {
    if (!window.confirm(`¿Enviar la versión v${cotizacion.version_activa} de ${cotizacion.consecutivo}? El snapshot se congela, se genera el PDF y la cotización deja de ser editable.`)) return
    setAplicando(true)
    try {
      // 1. Congelar lo que el usuario ve: persistir el borrador actual.
      if (!(await guardarBorrador())) { setAplicando(false); return }
      const ahora = Timestamp.now()
      // 2. Generar el PDF de la versión congelada. Si falla, el envío NO se completa.
      const pdf = await generarPdf(ahora.toDate())
      if (!pdf) { setAplicando(false); return }
      // 3. Marcar enviada: fecha + pdf en la versión, estado en el padre.
      await updateDoc(doc(db, 'cotizaciones', cotizacion.id, 'versiones', String(cotizacion.version_activa)), {
        fecha_envio: ahora, pdf_url: pdf.url, pdf_hash: pdf.hash,
      })
      await updateDoc(doc(db, 'cotizaciones', cotizacion.id), {
        estado: 'enviada', fecha_envio: ahora, fecha_actualizacion: ahora,
        historial: arrayUnion(entrada('borrador', 'enviada')),
      })
      toast(`${cotizacion.consecutivo} enviada — PDF generado`)
      await reload()
    } catch { toast('Error al enviar', 'error') } finally { setAplicando(false) }
  }

  const rechazar = async () => {
    if (!motivo.trim()) return
    setAplicando(true)
    try {
      await updateDoc(doc(db, 'cotizaciones', cotizacion.id), {
        estado: 'rechazada', motivo_rechazo: motivo.trim(), fecha_actualizacion: Timestamp.now(),
        historial: arrayUnion(entrada('enviada', 'rechazada', { motivo: motivo.trim() })),
      })
      toast(`${cotizacion.consecutivo} rechazada`)
      setModalRechazo(false); setMotivo('')
      await reload()
    } catch { toast('Error al rechazar', 'error') } finally { setAplicando(false) }
  }

  const aprobar = async () => {
    if (!evidencia) return  // validación DURA: sin evidencia no hay aprobación
    setAplicando(true)
    try {
      const nombre = `${Date.now()}_${evidencia.name}`
      const snap = await uploadBytes(ref(storage, `cotizaciones/${cotizacion.id}/evidencia/${nombre}`), evidencia)
      const url = await getDownloadURL(snap.ref)
      const ahora = Timestamp.now()
      await updateDoc(doc(db, 'cotizaciones', cotizacion.id), {
        estado: 'aprobada',
        evidencia_aprobacion: {
          nombre: evidencia.name, url, categoria: 'evidencia',
          content_type: evidencia.type || 'application/octet-stream',
          tamano: evidencia.size, subido_en: ahora,
        },
        aprobada_por: user?.uid ?? '', fecha_aprobacion: ahora, fecha_actualizacion: ahora,
        historial: arrayUnion(entrada('enviada', 'aprobada', { motivo: `Evidencia: ${evidencia.name}` })),
      })
      toast(`${cotizacion.consecutivo} aprobada 🎉`)
      setModalAprobar(false); setEvidencia(null)
      await reload()
    } catch { toast('Error al aprobar', 'error') } finally { setAplicando(false) }
  }

  const nuevaVersion = async () => {
    const n = cotizacion.version_activa + 1
    if (!window.confirm(`¿Crear la versión v${n} de ${cotizacion.consecutivo}? Se copia la v${cotizacion.version_activa} completa como borrador editable.`)) return
    setAplicando(true)
    try {
      const vSnap = await getDoc(doc(db, 'cotizaciones', cotizacion.id, 'versiones', String(cotizacion.version_activa)))
      if (!vSnap.exists()) throw new Error('versión activa no encontrada')
      const base = vSnap.data() as Omit<VersionCotizacion, 'id'>
      const { fecha_envio: _fe, pdf_url: _pdf, pdf_hash: _ph, ...copia } = base
      await setDoc(doc(db, 'cotizaciones', cotizacion.id, 'versiones', String(n)), {
        ...copia, version: n, creada_por: user?.uid ?? '', fecha_creacion: Timestamp.now(),
      })
      await updateDoc(doc(db, 'cotizaciones', cotizacion.id), {
        estado: 'borrador', version_activa: n,
        fecha_envio: deleteField(), motivo_rechazo: deleteField(),
        fecha_actualizacion: Timestamp.now(),
        historial: arrayUnion(entrada(efectivo, 'borrador', { motivo: `Nueva versión v${n}`, version: n })),
      })
      toast(`Versión v${n} creada (borrador)`)
      await reload()
    } catch { toast('Error al crear la nueva versión', 'error') } finally { setAplicando(false) }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {efectivo === 'borrador' && (
        <button onClick={enviar} disabled={aplicando}
          className="text-sm px-3 py-1.5 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50 disabled:opacity-50">
          Enviar →
        </button>
      )}
      {efectivo === 'enviada' && (
        <>
          <button onClick={() => setModalAprobar(true)} disabled={aplicando}
            className="text-sm px-3 py-1.5 rounded-lg font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
            ✓ Aprobar
          </button>
          <button onClick={() => { setModalRechazo(true); setMotivo('') }} disabled={aplicando}
            className="text-sm px-3 py-1.5 rounded-lg font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">
            ✕ Rechazar
          </button>
        </>
      )}
      {puedeNuevaVersion(efectivo) && (
        <button onClick={nuevaVersion} disabled={aplicando}
          className="text-sm px-3 py-1.5 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          + Nueva versión
        </button>
      )}
      {efectivo === 'aprobada' && (
        <span className="text-xs text-gray-400">Estado terminal · los cambios posteriores pertenecen al proyecto.</span>
      )}

      {/* Modal rechazar (motivo obligatorio) */}
      <Modal isOpen={modalRechazo} onClose={() => setModalRechazo(false)} title={`Rechazar ${cotizacion.consecutivo}`}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Registra el motivo del rechazo del cliente (obligatorio).</p>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} autoFocus
            placeholder="Ej: precio fuera de presupuesto, adjudicado a otro proveedor…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setModalRechazo(false)} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button onClick={rechazar} disabled={!motivo.trim() || aplicando}
              className="text-sm px-3 py-1.5 rounded-lg font-medium bg-red-600 hover:bg-red-700 text-white disabled:opacity-50">
              {aplicando ? 'Aplicando…' : 'Rechazar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal aprobar (evidencia OBLIGATORIA — botón deshabilitado sin adjunto) */}
      <Modal isOpen={modalAprobar} onClose={() => setModalAprobar(false)} title={`Aprobar ${cotizacion.consecutivo}`}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Adjunta la <span className="font-semibold">evidencia de aprobación del cliente</span> (correo, orden de compra o contrato). Sin evidencia no es posible aprobar.
          </p>
          <input type="file" onChange={e => setEvidencia(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
          {evidencia && <p className="text-xs text-gray-500">📎 {evidencia.name} ({Math.round(evidencia.size / 1024)} KB)</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setModalAprobar(false)} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button onClick={aprobar} disabled={!evidencia || aplicando}
              className="text-sm px-3 py-1.5 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
              {aplicando ? 'Aprobando…' : 'Aprobar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
