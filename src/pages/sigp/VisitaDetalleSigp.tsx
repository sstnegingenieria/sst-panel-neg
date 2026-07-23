import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { doc, getDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import { useVisitaDetalle } from '../../hooks/sigp/useVisitaDetalle'
import { useFirestore } from '../../hooks/useFirestore'
import { useAuth } from '../../contexts/AuthContext'
import { toast } from '../../components/shared/Toast'
import Modal from '../../components/shared/Modal'
import { puedeGestionarVisitasUI } from '../../types/sigp/permisos'
import {
  plantillaChecklist, TIPO_VISITA_LABEL, SUBTIPO_LABEL,
  ESTADO_VISITA_LABEL, ESTADO_VISITA_COLOR, ESTADO_ITEM_LABEL, ESTADO_ITEM_COLOR,
} from '../../types/sigp/visita'
import type {
  ChecklistItem, Hallazgo, CantidadPreliminar, Adjunto, EstadoItem,
} from '../../types/sigp/visita'
import { crearBorradorCotizacion } from '../../utils/sigp/pipeline'
import type { Solicitud } from '../../types/sigp/solicitud'

const ESTADOS_ITEM: EstadoItem[] = ['bueno', 'regular', 'malo', 'no_aplica']

function fFecha(ts: unknown): string {
  const d = (ts as { toDate?: () => Date })?.toDate?.()
  return d
    ? d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : '—'
}

export default function VisitaDetalleSigp() {
  const { visitaId } = useParams<{ visitaId: string }>()
  const { visita, cliente, solicitud, loading, noEncontrada, reload } = useVisitaDetalle(visitaId)
  const { update } = useFirestore()
  const { user } = useAuth()
  const puedeGestionar = puedeGestionarVisitasUI(user?.rol)

  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [hallazgos, setHallazgos] = useState<Hallazgo[]>([])
  const [cantidades, setCantidades] = useState<CantidadPreliminar[]>([])
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([])
  const [observaciones, setObservaciones] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [motivoCancel, setMotivoCancel] = useState('')

  useEffect(() => {
    if (!visita) return
    const plantilla = plantillaChecklist(visita.tipo, visita.subtipo)
    setChecklist(
      plantilla.length
        ? plantilla.map(t => visita.checklist.find(c => c.clave === t.clave) ?? { clave: t.clave, etiqueta: t.etiqueta, estado: 'no_aplica' })
        : visita.checklist ?? [],
    )
    setHallazgos(visita.hallazgos ?? [])
    setCantidades(visita.cantidades ?? [])
    setAdjuntos(visita.adjuntos ?? [])
    setObservaciones(visita.observaciones_generales ?? '')
  }, [visita?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="max-w-xl mx-auto p-8 text-sm text-gray-400">Cargando…</div>
  if (noEncontrada || !visita) {
    return (
      <div className="max-w-xl mx-auto p-8">
        <p className="text-gray-500">La visita no existe o fue eliminada.</p>
        <Link to="/sigp/visitas" className="text-brand-700 text-sm hover:underline mt-2 inline-block">← Volver a visitas</Link>
      </div>
    )
  }

  const editable = visita.estado === 'programada' && puedeGestionar
  const origen = cliente?.nombre ?? visita.prospecto_nombre ?? '—'
  const planos = adjuntos.filter(a => a.categoria === 'plano')
  const fotos = adjuntos.filter(a => a.categoria === 'foto')

  // ── Subida de imágenes (inmediata; robusta ante guardado a medias) ─────────
  async function subir(sub: string, file: File) {
    const nombre = file.name.replace(/[^\w.\-]/g, '_')
    const ruta = `visitas/${visita!.id}/${sub}/${Date.now()}-${nombre}`
    const snap = await uploadBytes(ref(storage, ruta), file)
    const url = await getDownloadURL(snap.ref)
    return { url, nombre: file.name, tamano: file.size, content_type: file.type || undefined }
  }

  const agregarAdjunto = async (categoria: 'plano' | 'foto', file: File) => {
    setSubiendo(true)
    try {
      const r = await subir(categoria, file)
      const a: Adjunto = { nombre: r.nombre, url: r.url, categoria, tamano: r.tamano, subido_en: Timestamp.now() }
      if (r.content_type) a.content_type = r.content_type
      setAdjuntos(prev => [...prev, a])
    } catch { toast('Error al subir la imagen', 'error') } finally { setSubiendo(false) }
  }

  const agregarFotoHallazgo = async (i: number, file: File) => {
    setSubiendo(true)
    try {
      const r = await subir('hallazgos', file)
      setHallazgos(prev => prev.map((h, j) => (j === i ? { ...h, fotos: [...h.fotos, r.url] } : h)))
    } catch { toast('Error al subir la foto', 'error') } finally { setSubiendo(false) }
  }

  // ── Persistencia ───────────────────────────────────────────────────────────
  const datosEjecucion = () => ({
    checklist, hallazgos, cantidades, adjuntos, observaciones_generales: observaciones,
  })

  const guardarAvance = async () => {
    setGuardando(true)
    try {
      await update('visitas', visita.id, datosEjecucion())
      toast('Avance guardado')
      await reload()
    } catch { toast('Error al guardar el avance', 'error') } finally { setGuardando(false) }
  }

  const marcarRealizada = async () => {
    const aviso = visita.solicitud_id && solicitud?.estado === 'requiere_visita'
      ? `\n\nLa solicitud ${solicitud.consecutivo} pasará a «Lista para cotizar».`
      : ''
    if (!window.confirm(`¿Marcar la visita como realizada? No se puede deshacer.${aviso}`)) return
    setGuardando(true)
    try {
      const ahora = Timestamp.now()
      await update('visitas', visita.id, {
        ...datosEjecucion(),
        estado: 'realizada',
        fecha_ejecucion: ahora,
        historial: arrayUnion({ de: 'programada', a: 'realizada', por: user?.uid ?? '', fecha: ahora }),
      })
      // Transición cruzada: la solicitud vinculada en requiere_visita → lista_para_cotizar.
      if (visita.solicitud_id) {
        const sSnap = await getDoc(doc(db, 'solicitudes', visita.solicitud_id))
        if (sSnap.exists() && sSnap.data().estado === 'requiere_visita') {
          await update('solicitudes', visita.solicitud_id, {
            estado: 'lista_para_cotizar',
            historial: arrayUnion({
              de: 'requiere_visita', a: 'lista_para_cotizar',
              por: user?.uid ?? '', fecha: ahora,
              motivo: `Visita ${visita.consecutivo} realizada`,
            }),
          })
        }
        // Pipeline (23-jul): la visita realizada crea sola la cotización
        // pendiente de diligenciar (borrador SIN código, precargada con la
        // solicitud + esta visita). Idempotente: una cotización por visita.
        if (sSnap.exists()) {
          const creada = await crearBorradorCotizacion(
            { id: sSnap.id, ...sSnap.data() } as Solicitud, user?.uid ?? '', visita)
          if (creada) toast('Cotización pendiente de diligenciar creada (sin código) — ver Cotizaciones')
        }
      }
      toast(`Visita ${visita.consecutivo} realizada`)
      await reload()
    } catch { toast('Error al marcar realizada', 'error') } finally { setGuardando(false) }
  }

  const cancelarVisita = async () => {
    if (!motivoCancel.trim()) return
    setGuardando(true)
    try {
      const ahora = Timestamp.now()
      await update('visitas', visita.id, {
        estado: 'cancelada',
        motivo_cancelacion: motivoCancel.trim(),
        historial: arrayUnion({ de: visita.estado, a: 'cancelada', por: user?.uid ?? '', fecha: ahora, motivo: motivoCancel.trim() }),
      })
      toast('Visita cancelada')
      setCancelando(false)
      setMotivoCancel('')
      await reload()
    } catch { toast('Error al cancelar', 'error') } finally { setGuardando(false) }
  }

  return (
    <div className="max-w-xl mx-auto space-y-5 pb-28">
      <Link to="/sigp/visitas" className="text-sm text-gray-500 hover:text-brand-700 inline-flex items-center gap-1">← Visitas</Link>

      {/* Cabecera */}
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-600">
          {TIPO_VISITA_LABEL[visita.tipo]}{visita.subtipo ? ` · ${SUBTIPO_LABEL[visita.subtipo]}` : ''} · {origen}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-800 font-mono">
            {visita.consecutivo || <span className="text-gray-400 italic text-lg font-sans" title="El VIS se asigna al agendar (desde la bandeja de Visitas)">sin código · pendiente de agendar</span>}
          </h1>
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${ESTADO_VISITA_COLOR[visita.estado]}`}>
            {ESTADO_VISITA_LABEL[visita.estado]}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm flex-wrap">
          <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${visita.ejecutor.tipo === 'contratista' ? 'bg-violet-50 text-violet-700' : 'bg-brand-50 text-brand-700'}`}>
            {visita.ejecutor.tipo === 'contratista' ? 'Contratista' : 'NEG'}
          </span>
          <span className="text-gray-600 text-xs">{visita.ejecutor.nombre || '—'}</span>
          <span className="text-gray-300">·</span>
          <span className="text-xs text-gray-500">Programada {fFecha(visita.fecha_programada)}</span>
        </div>
        {solicitud && (
          <p className="mt-1 text-xs text-gray-500">
            Vinculada a{' '}
            <Link to={`/sigp/solicitudes/${solicitud.id}`} className="text-brand-700 hover:underline">{solicitud.consecutivo}</Link>
          </p>
        )}
      </div>

      {visita.motivo_cancelacion && (
        <div className="rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-xs text-gray-600">
          <span className="font-semibold">Cancelada:</span> {visita.motivo_cancelacion}
        </div>
      )}

      {/* CHECKLIST (solo estación base) */}
      {checklist.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold text-gray-800">Checklist</h2>
          {checklist.map((item, i) => (
            <div key={item.clave} className="rounded-xl border border-gray-200 p-3 space-y-2">
              <p className="text-sm font-medium text-gray-800">{item.etiqueta}</p>
              <div className="grid grid-cols-4 gap-1.5">
                {ESTADOS_ITEM.map(est => {
                  const activo = item.estado === est
                  return (
                    <button
                      key={est}
                      disabled={!editable}
                      onClick={() => setChecklist(prev => prev.map((c, j) => (j === i ? { ...c, estado: est } : c)))}
                      className={`min-h-[44px] rounded-lg text-xs font-semibold transition ${
                        activo ? ESTADO_ITEM_COLOR[est] + ' ring-2 ring-offset-1 ring-brand-400' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                      } disabled:opacity-70`}
                    >
                      {ESTADO_ITEM_LABEL[est]}
                    </button>
                  )
                })}
              </div>
              <input
                value={item.observacion ?? ''}
                onChange={e => setChecklist(prev => prev.map((c, j) => (j === i ? { ...c, observacion: e.target.value } : c)))}
                disabled={!editable}
                placeholder="Observación (opcional)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:bg-gray-50"
              />
            </div>
          ))}
        </section>
      )}

      {/* HALLAZGOS */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-800">Hallazgos</h2>
          {editable && (
            <button onClick={() => setHallazgos(prev => [...prev, { descripcion: '', posible_solucion: '', fotos: [] }])}
              className="text-xs font-medium text-brand-700">+ Agregar</button>
          )}
        </div>
        {hallazgos.length === 0 && <p className="text-xs text-gray-400">Sin hallazgos.</p>}
        {hallazgos.map((h, i) => (
          <div key={i} className="rounded-xl border border-gray-200 p-3 space-y-2">
            <textarea value={h.descripcion} disabled={!editable}
              onChange={e => setHallazgos(prev => prev.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))}
              rows={2} placeholder="Descripción del hallazgo / anomalía"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:bg-gray-50" />
            <textarea value={h.posible_solucion ?? ''} disabled={!editable}
              onChange={e => setHallazgos(prev => prev.map((x, j) => (j === i ? { ...x, posible_solucion: e.target.value } : x)))}
              rows={2} placeholder="Posible solución (opcional)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:bg-gray-50" />
            <div className="flex items-center gap-2 flex-wrap">
              {h.fotos.map((f, k) => (
                <a key={k} href={f} target="_blank" rel="noopener noreferrer">
                  <img src={f} alt="" className="w-14 h-14 object-cover rounded-lg border border-gray-200" />
                </a>
              ))}
              {editable && (
                <label className="w-14 h-14 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 cursor-pointer hover:border-brand-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) agregarFotoHallazgo(i, f) }} />
                </label>
              )}
            </div>
            {editable && (
              <button onClick={() => setHallazgos(prev => prev.filter((_, j) => j !== i))} className="text-xs text-red-500">Quitar hallazgo</button>
            )}
          </div>
        ))}
      </section>

      {/* PLANO */}
      <section className="space-y-2">
        <h2 className="font-bold text-gray-800">Plano a mano alzada</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {planos.map((a, i) => (
            <a key={i} href={a.url} target="_blank" rel="noopener noreferrer">
              <img src={a.url} alt="" className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
            </a>
          ))}
          {editable && (
            <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:border-brand-400 text-[10px] gap-1">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Foto del sketch
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) agregarAdjunto('plano', f) }} />
            </label>
          )}
        </div>
      </section>

      {/* CANTIDADES PRELIMINARES */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-800">Cantidades preliminares</h2>
          {editable && (
            <button onClick={() => setCantidades(prev => [...prev, { descripcion: '', unidad: '', cantidad: 0 }])}
              className="text-xs font-medium text-brand-700">+ Agregar</button>
          )}
        </div>
        {cantidades.length === 0 && <p className="text-xs text-gray-400">Sin cantidades.</p>}
        {cantidades.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={c.descripcion} disabled={!editable}
              onChange={e => setCantidades(prev => prev.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))}
              placeholder="Descripción" className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:bg-gray-50" />
            <input value={c.unidad} disabled={!editable}
              onChange={e => setCantidades(prev => prev.map((x, j) => (j === i ? { ...x, unidad: e.target.value } : x)))}
              placeholder="Und" className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:bg-gray-50" />
            <input type="number" value={c.cantidad || ''} disabled={!editable}
              onChange={e => setCantidades(prev => prev.map((x, j) => (j === i ? { ...x, cantidad: Number(e.target.value) } : x)))}
              placeholder="Cant." className="w-20 px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:bg-gray-50" />
            {editable && <button onClick={() => setCantidades(prev => prev.filter((_, j) => j !== i))} className="text-red-400 px-1">✕</button>}
          </div>
        ))}
      </section>

      {/* FOTOS DEL SITIO + OBSERVACIONES */}
      <section className="space-y-2">
        <h2 className="font-bold text-gray-800">Fotos del sitio</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {fotos.map((a, i) => (
            <a key={i} href={a.url} target="_blank" rel="noopener noreferrer">
              <img src={a.url} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
            </a>
          ))}
          {editable && (
            <label className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 cursor-pointer hover:border-brand-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) agregarAdjunto('foto', f) }} />
            </label>
          )}
        </div>
      </section>

      <section className="space-y-1">
        <h2 className="font-bold text-gray-800">Observaciones generales</h2>
        <textarea value={observaciones} disabled={!editable} onChange={e => setObservaciones(e.target.value)}
          rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:bg-gray-50" />
      </section>

      {/* HISTORIAL */}
      <section>
        <h2 className="font-bold text-gray-800 mb-2">Historial</h2>
        <ol className="space-y-3">
          {visita.historial.map((h, i) => (
            <li key={i} className="text-sm">
              <span className="text-gray-800">{h.de ? `${ESTADO_VISITA_LABEL[h.de]} → ` : 'Programada · '}<span className="font-medium">{ESTADO_VISITA_LABEL[h.a]}</span></span>
              <span className="text-[11px] text-gray-400 ml-2">{fFecha(h.fecha)}</span>
              {h.motivo && <p className="text-xs text-gray-500">{h.motivo}</p>}
            </li>
          ))}
        </ol>
      </section>

      {/* BARRA DE ACCIÓN FIJA (mobile-first) */}
      {editable && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-2 z-40">
          <div className="max-w-xl mx-auto w-full flex items-center gap-2">
            <button onClick={() => setCancelando(true)} disabled={guardando}
              className="text-sm px-3 py-2.5 rounded-lg text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50">Cancelar</button>
            <button onClick={guardarAvance} disabled={guardando || subiendo}
              className="flex-1 text-sm px-3 py-2.5 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {subiendo ? 'Subiendo…' : guardando ? 'Guardando…' : 'Guardar avance'}
            </button>
            <button onClick={marcarRealizada} disabled={guardando || subiendo}
              className="flex-1 text-sm px-3 py-2.5 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">Marcar realizada</button>
          </div>
        </div>
      )}

      {/* Modal cancelar (motivo obligatorio) */}
      <Modal
        isOpen={cancelando}
        title="Cancelar visita"
        onClose={() => setCancelando(false)}
        actions={[
          { label: 'Volver', onClick: () => setCancelando(false), variant: 'secondary' },
          { label: 'Cancelar visita', onClick: cancelarVisita, variant: 'danger', loading: guardando },
        ]}
      >
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Motivo <span className="text-red-500">*</span></label>
          <textarea value={motivoCancel} onChange={e => setMotivoCancel(e.target.value)} rows={3}
            placeholder="Por qué se cancela…" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          {!motivoCancel.trim() && <p className="text-xs text-red-600">El motivo es obligatorio.</p>}
          <p className="text-xs text-gray-400">Reagendar = programar una visita nueva.</p>
        </div>
      </Modal>
    </div>
  )
}
