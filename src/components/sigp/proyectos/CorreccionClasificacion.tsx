// Corrección de clasificación de preventivos POR EL PANEL (07-nov-2026).
// Individual (desde la ficha) y en LOTE (desde la bandeja): una autorización,
// una traza por proyecto. Quién: GG/GA/admin — quien captura no se corrige.
// Precondiciones del acto de los once, con NOMBRE PROPIO en pantalla.
// LÍMITE explícito: la zona/departamento NO se corrigen aquí.
import { useState, useEffect, useMemo } from 'react'
import { doc, getDoc, getDocs, collection, query, where, writeBatch, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import Modal from '../../shared/Modal'
import SelectField from '../../shared/SelectField'
import { toast } from '../../shared/Toast'
import { useAuth } from '../../../contexts/AuthContext'
import { fmtMoney } from '../../../utils/sigp/formato'
import type { Proyecto } from '../../../types/sigp/proyecto'
import type { Solicitud } from '../../../types/sigp/solicitud'
import type { AsignacionContratista } from '../../../types/sigp/asignacion'
import { TIPO_SITIO_LABEL, INTENSIDAD_LABEL, type TipoSitio, type IntensidadPreventivo } from '../../../types/sigp/preventivos'
import {
  impedimentosCorreccion, planCorreccionPreventivo, type OcLigada, type PlanCorreccion,
} from '../../../types/sigp/correccionPreventivo'
import {
  normalizarCodigoSitio, patchMaestroPorCorreccion, resumenClasificacion,
  type ClasificacionSitio, type SitioPreventivo,
} from '../../../types/sigp/sitioPreventivo'

interface DatosProyecto {
  proyecto: Proyecto
  solicitud: (Solicitud & { id: string }) | null
  asignaciones: (AsignacionContratista & { id: string })[]
  ocs: OcLigada[]
  impedimentos: string[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  /** 1 proyecto = modo individual (ficha); varios = lote (bandeja). */
  proyectos: Proyecto[]
  onAplicado: () => void
}

export default function CorreccionClasificacionModal({ isOpen, onClose, proyectos, onAplicado }: Props) {
  const { user } = useAuth()
  const [cargando, setCargando] = useState(false)
  const [datos, setDatos] = useState<DatosProyecto[]>([])
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [tipoSitio, setTipoSitio] = useState<TipoSitio | ''>('')
  const [intensidad, setIntensidad] = useState<IntensidadPreventivo | ''>('')
  const [esJungle, setEsJungle] = useState<boolean | null>(null)
  const [motivo, setMotivo] = useState('')
  const [aplicando, setAplicando] = useState(false)
  const [resultado, setResultado] = useState<{ consecutivo: string; ok: boolean; detalle: string }[] | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setDatos([]); setSel({}); setTipoSitio(''); setIntensidad(''); setEsJungle(null)
    setMotivo(''); setResultado(null); setCargando(true)
    ;(async () => {
      const out: DatosProyecto[] = []
      for (const p of proyectos) {
        try {
          const [sSnap, aSnap, ocSnap] = await Promise.all([
            getDoc(doc(db, 'solicitudes', p.id)),
            getDocs(collection(db, 'proyectos', p.id, 'asignaciones')),
            getDocs(query(collection(db, 'ordenes_compra'), where('proyecto_id', '==', p.id))),
          ])
          const solicitud = sSnap.exists() ? ({ id: sSnap.id, ...sSnap.data() } as Solicitud & { id: string }) : null
          const asignaciones = aSnap.docs.map(d => ({ id: d.id, ...d.data() } as AsignacionContratista & { id: string }))
          const ocs = ocSnap.docs.map(d => d.data() as OcLigada)
          const impedimentos = impedimentosCorreccion(p, asignaciones, ocs)
          if (!solicitud?.preventivo) impedimentos.push('La solicitud de origen no tiene los datos del preventivo')
          out.push({ proyecto: p, solicitud, asignaciones, ocs, impedimentos })
        } catch {
          out.push({ proyecto: p, solicitud: null, asignaciones: [], ocs: [], impedimentos: ['No se pudieron cargar los datos del proyecto'] })
        }
      }
      setDatos(out)
      // preselección: en INDIVIDUAL el único elegible queda marcado; en lote
      // se marcan a mano (elegir es un acto, no un default).
      if (proyectos.length === 1 && out[0]?.impedimentos.length === 0) setSel({ [out[0].proyecto.id]: true })
      setCargando(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const clasifLista = tipoSitio !== '' && intensidad !== '' && esJungle !== null
  const nueva: ClasificacionSitio | null = clasifLista
    ? { tipo_sitio: tipoSitio as TipoSitio, intensidad: intensidad as IntensidadPreventivo, es_jungle: esJungle === true }
    : null

  /** Plan por proyecto elegible (null si la clasificación aún no está completa
   *  o el plan falla — p. ej. misma clasificación / combinación inexistente). */
  const planes = useMemo(() => {
    const m: Record<string, { plan?: PlanCorreccion; error?: string }> = {}
    if (!nueva) return m
    for (const d of datos) {
      if (d.impedimentos.length > 0 || !d.solicitud) continue
      const r = planCorreccionPreventivo({
        solicitud: d.solicitud, proyecto: d.proyecto, asignaciones: d.asignaciones,
        nueva, motivo: motivo || '(pendiente)', uid: user?.uid ?? '',
        nombreUsuario: user?.nombre, rol: user?.rol ?? '', fecha: Timestamp.now(),
      })
      m[d.proyecto.id] = r.ok ? { plan: r.plan } : { error: r.error }
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, tipoSitio, intensidad, esJungle, motivo])

  const seleccionados = datos.filter(d => sel[d.proyecto.id] && d.impedimentos.length === 0 && planes[d.proyecto.id]?.plan)
  const deltaTotal = seleccionados.reduce((s, d) => {
    const p = planes[d.proyecto.id].plan!
    return s + (p.ventaNueva - p.ventaAntes)
  }, 0)

  const aplicar = async () => {
    if (!nueva || seleccionados.length === 0) return
    if (!motivo.trim()) { toast('El motivo es obligatorio', 'error'); return }
    setAplicando(true)
    const res: { consecutivo: string; ok: boolean; detalle: string }[] = []
    for (const d of seleccionados) {
      try {
        // Plan FRESCO con el motivo final (el memo usaba un placeholder)
        const r = planCorreccionPreventivo({
          solicitud: d.solicitud!, proyecto: d.proyecto, asignaciones: d.asignaciones,
          nueva, motivo, uid: user?.uid ?? '', nombreUsuario: user?.nombre,
          rol: user?.rol ?? '', fecha: Timestamp.now(),
        })
        if (!r.ok) { res.push({ consecutivo: d.proyecto.consecutivo, ok: false, detalle: r.error }); continue }
        const plan = r.plan
        const batch = writeBatch(db)
        batch.update(doc(db, 'solicitudes', d.proyecto.id), plan.patchSolicitud as never)
        batch.update(doc(db, 'proyectos', d.proyecto.id), plan.patchProyecto as never)
        for (const pa of plan.patchesAsignacion)
          batch.update(doc(db, 'proyectos', d.proyecto.id, 'asignaciones', pa.id),
            { preliquidacion: pa.preliquidacion, historial: pa.historial, fecha_actualizacion: pa.fecha_actualizacion } as never)
        await batch.commit()
        // "De paso": la clasificación queda en el MAESTRO del sitio (best-
        // effort — la corrección ya está aplicada; un fallo acá no la revierte)
        try {
          const codigo = normalizarCodigoSitio(d.solicitud!.preventivo!.sitio_id ?? d.proyecto.snapshot.codigo_sitio_cliente ?? '')
          if (codigo && codigo !== 'N/A') {
            const mRef = doc(db, 'sitios_preventivos', codigo)
            const mSnap = await getDoc(mRef)
            if (mSnap.exists()) {
              const maestro = mSnap.data() as SitioPreventivo
              await setDoc(mRef, { ...maestro, ...patchMaestroPorCorreccion(maestro, nueva, user?.uid ?? '', user?.nombre, motivo, Timestamp.now()) })
            } else {
              const prev = d.solicitud!.preventivo!
              await setDoc(mRef, {
                codigo, nombre: prev.sitio_nombre, departamento: prev.departamento, zona: prev.zona,
                clasificacion: nueva, establecida_por: user?.uid ?? '',
                ...(user?.nombre ? { establecida_por_nombre: user.nombre } : {}),
                fecha_establecida: Timestamp.now(), origen: 'correccion',
                solicitud_consecutivo: d.solicitud!.consecutivo, historial: [], fecha_creacion: Timestamp.now(),
              })
            }
          }
        } catch { /* best-effort */ }
        res.push({ consecutivo: d.proyecto.consecutivo, ok: true, detalle: `${fmtMoney(plan.ventaAntes)} → ${fmtMoney(plan.ventaNueva)}` })
      } catch (e) {
        res.push({ consecutivo: d.proyecto.consecutivo, ok: false, detalle: e instanceof Error ? e.message : 'error al escribir' })
      }
    }
    setResultado(res)
    setAplicando(false)
    if (res.some(x => x.ok)) onAplicado()
  }

  const lote = proyectos.length > 1
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg"
      title={lote ? 'Corregir clasificación en lote (preventivos)' : 'Corregir clasificación del preventivo'}
      actions={resultado
        ? [{ label: 'Cerrar', onClick: onClose, variant: 'secondary' as const }]
        : [
            { label: 'Cancelar', onClick: onClose, variant: 'secondary' as const },
            { label: `Aplicar a ${seleccionados.length} proyecto(s)`, onClick: aplicar, variant: 'primary' as const, loading: aplicando },
          ]}>
      {resultado ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700">Resultado</p>
          {resultado.map(r => (
            <div key={r.consecutivo} className={`rounded-lg border px-3 py-2 text-sm ${r.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
              {r.ok ? '✓' : '✗'} <span className="font-mono font-semibold">{r.consecutivo}</span> — {r.detalle}
            </div>
          ))}
        </div>
      ) : (
      <div className="space-y-4">
        {/* LÍMITE EXPLÍCITO — que nadie crea que esto corrige todo */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          Corrige <b>tipo de sitio, intensidad y jungle</b> — la venta se recalcula con la matriz y queda
          traza en solicitud, proyecto y preliquidación. <b>El valor del contratista no se toca</b> (decisión
          comercial aparte). <b>Si la ZONA o el departamento están mal, esta herramienta no lo arregla</b> —
          reportalo antes de seguir.
        </div>

        {/* Clasificación CORRECTA — una vez para todo el lote, sin defaults */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SelectField label="Tipo de sitio" value={tipoSitio} onChange={v => setTipoSitio(v as TipoSitio | '')}
            options={[{ value: '', label: '— Elegir —' }, ...(['greenfield', 'rooftop'] as TipoSitio[]).map(t => ({ value: t, label: TIPO_SITIO_LABEL[t] }))]} required />
          <SelectField label="Intensidad" value={intensidad} onChange={v => setIntensidad(v as IntensidadPreventivo | '')}
            options={[{ value: '', label: '— Elegir —' }, ...(['liviano', 'pesado'] as IntensidadPreventivo[]).map(i => ({ value: i, label: INTENSIDAD_LABEL[i] }))]} required />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">¿Sitio jungle? <span className="text-red-500">*</span></label>
            <div className="flex items-center gap-4 px-3 py-2 border rounded-lg border-gray-300 bg-white">
              {([['si', 'Sí', true], ['no', 'No', false]] as const).map(([k, lbl, val]) => (
                <label key={k} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="corr-jungle" className="accent-brand-700" checked={esJungle === val} onChange={() => setEsJungle(val)} />
                  {lbl}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Proyectos: elegibles con preview; impedidos en gris CON SUS RAZONES */}
        {cargando ? <p className="text-sm text-gray-400">Cargando proyectos…</p> : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {datos.map(d => {
              const p = d.proyecto
              const imp = d.impedimentos
              const plan = planes[p.id]
              return (
                <div key={p.id} className={`rounded-lg border px-3 py-2 text-sm ${imp.length ? 'border-gray-200 bg-gray-50 opacity-80' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-start gap-2">
                    {imp.length === 0 && (
                      <input type="checkbox" className="mt-1 accent-brand-700" checked={!!sel[p.id]}
                        onChange={e => setSel(s => ({ ...s, [p.id]: e.target.checked }))} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800">
                        <span className="font-mono text-xs">{p.consecutivo}</span> · {p.snapshot.nombre_sitio}
                        {p.snapshot.codigo_sitio_cliente && <span className="ml-1.5 text-[11px] font-mono text-gray-400">{p.snapshot.codigo_sitio_cliente}</span>}
                      </p>
                      {d.solicitud?.preventivo && (
                        <p className="text-xs text-gray-500">
                          Registrado: {resumenClasificacion({ tipo_sitio: d.solicitud.preventivo.tipo_sitio, intensidad: d.solicitud.preventivo.intensidad, es_jungle: d.solicitud.preventivo.es_jungle })} · {d.solicitud.preventivo.zona}
                        </p>
                      )}
                      {imp.length > 0 ? (
                        <ul className="mt-1 space-y-0.5">
                          {imp.map((x, i) => <li key={i} className="text-xs text-red-700">⛔ {x}</li>)}
                        </ul>
                      ) : plan?.error ? (
                        <p className="text-xs text-amber-700 mt-1">{plan.error}</p>
                      ) : plan?.plan ? (
                        <div className="mt-1 text-xs space-y-0.5">
                          <p className="text-gray-700">
                            Venta: <span className="font-mono">{fmtMoney(plan.plan.ventaAntes)}</span> → <span className="font-mono font-semibold">{fmtMoney(plan.plan.ventaNueva)}</span>
                            <span className="text-gray-400"> (base {fmtMoney(plan.plan.precio.base)} + transporte {fmtMoney(plan.plan.precio.transporte)})</span>
                          </p>
                          {plan.plan.margenes.map((m, i) => (
                            <p key={i} className={m.despues.negativo ? 'text-red-700 font-medium' : m.despues.implausible ? 'text-amber-700' : 'text-gray-500'}>
                              Margen ({m.contratista}, contratista {fmtMoney(m.valor_contratista)} intacto):{' '}
                              {m.antes.margen_pct?.toFixed(1) ?? '—'}% → <b>{m.despues.margen_pct?.toFixed(1) ?? '—'}%</b>
                              {m.despues.negativo ? ' ⚠ NEGATIVO' : m.despues.implausible ? ' ⚠ sobre el umbral del 70% — revisar' : ''}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 mt-1">Elegí la clasificación correcta para ver el recálculo.</p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Motivo <span className="text-red-500">*</span></label>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
            placeholder="Por qué se corrige — queda en el historial de solicitud, proyecto y preliquidación"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
        </div>

        {seleccionados.length > 0 && (
          <p className="text-sm text-gray-700">
            Se corrigen <b>{seleccionados.length}</b> proyecto(s) · Δ venta total{' '}
            <span className="font-mono font-semibold">{fmtMoney(deltaTotal)}</span> · una traza por proyecto.
          </p>
        )}
      </div>
      )}
    </Modal>
  )
}
