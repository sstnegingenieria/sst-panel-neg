import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  doc, getDoc, setDoc, updateDoc, arrayUnion, deleteField, Timestamp,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { useFeatureFlag } from '../../../hooks/useFeatureFlag'
import { patchSolicitudCotizada } from '../../../utils/sigp/pipeline'
import { construirSnapshotProyecto } from '../../../types/sigp/proyecto'
import { veProyectosUI } from '../../../types/sigp/permisos'
import { useNacimientoProyecto } from '../../../hooks/sigp/useNacimientoProyecto'
import { toast } from '../../shared/Toast'
import Modal from '../../shared/Modal'
import {
  puedeNuevaVersion, subtotalesPorGrupo, modoAgrupacionDe, actividadesDe, confirmacionAlcanceDe,
} from '../../../types/sigp/cotizacion'
import { etiquetaVersion, fmtMoney } from '../../../utils/sigp/formato'
import type { Cotizacion, EstadoCotizacion, VersionCotizacion, SubtotalGrupo } from '../../../types/sigp/cotizacion'
import type { SnapshotProyecto } from '../../../types/sigp/proyecto'

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
  // ── P1 — guard al aprobar (03-sep): el modal muestra el alcance que se va a
  // congelar (grupos con valores) y exige una elección explícita SIN default.
  // "Pidió cambios" bloquea la aprobación y lleva a la versión nueva.
  const [alcanceAprobar, setAlcanceAprobar] = useState<{ grupos: SubtotalGrupo[]; total: number } | null>(null)
  const [eleccionAlcance, setEleccionAlcance] = useState<'tal_cual' | 'cambios' | null>(null)

  // ── §16 (ii) — el proyecto nace SERVER-SIDE (CF crearProyectoAlAprobar).
  // El cliente solo deja STAGED el snapshot (`snapshot_proyecto`) en el mismo
  // updateDoc de la aprobación; la CF lo copia, asigna el PRY transaccional,
  // escribe el enlace inverso y pasa la solicitud a «aceptada». Detrás de
  // sigp_f2_enabled: con el flag apagado no se stagea y la CF no crea nada.
  const f2Enabled = useFeatureFlag('sigp_f2_enabled', false)
  // §16 (ii): comercial NO ve proyectos — su chip PRY es informativo
  // no-navegable. El listener sigue el nacimiento server-side en vivo.
  const veProyectos = veProyectosUI(user?.rol)
  const esperandoNacimiento = f2Enabled && efectivo === 'aprobada'
    && !cotizacion.proyecto_id && !!cotizacion.snapshot_proyecto
  const nacimiento = useNacimientoProyecto('cotizaciones', cotizacion.id, esperandoNacimiento)
  const proyectoId = cotizacion.proyecto_id ?? nacimiento.proyectoId
  const proyectoConsecutivo = cotizacion.proyecto_consecutivo ?? nacimiento.proyectoConsecutivo
  const recienCreado = !cotizacion.proyecto_id && !!nacimiento.proyectoId

  /** Construye el snapshot del proyecto desde la VERSIÓN APROBADA (mismos
   *  reads que hacía el nacimiento client-side retirado). null = falló. */
  const construirStaging = async (): Promise<SnapshotProyecto | null> => {
    try {
      const vSnap = await getDoc(doc(db, 'cotizaciones', cotizacion.id, 'versiones', String(cotizacion.version_activa)))
      if (!vSnap.exists()) throw new Error(`Versión ${cotizacion.version_activa} no encontrada`)
      const version = vSnap.data() as VersionCotizacion
      let clienteNombre: string | undefined
      let clienteNit: string | undefined
      if (cotizacion.cliente_id) {
        const c = await getDoc(doc(db, 'clientes', cotizacion.cliente_id))
        if (c.exists()) {
          clienteNombre = c.data().nombre as string
          clienteNit = (c.data().nit as string) || undefined
        }
      }
      return construirSnapshotProyecto(cotizacion, version, clienteNombre, clienteNit)
    } catch (e) {
      console.error('No se pudo construir el snapshot del proyecto:', e)
      return null
    }
  }

  /** Escotilla: cotización aprobada sin proyecto (histórica o con snapshot
   *  fallido) → stagea el snapshot si falta y RE-TOCA el doc; el touch
   *  re-dispara la CF, que crea el proyecto o repara el enlace. */
  const reintentarProyecto = async () => {
    setAplicando(true)
    try {
      const patch: Record<string, unknown> = { fecha_actualizacion: Timestamp.now() }
      if (!cotizacion.snapshot_proyecto) {
        const staged = await construirStaging()
        if (!staged) { toast('No se pudo preparar el snapshot del proyecto — reintenta', 'error'); return }
        patch.snapshot_proyecto = staged
      }
      await updateDoc(doc(db, 'cotizaciones', cotizacion.id), patch)
      toast('Reintento enviado — el sistema está creando el proyecto')
      await reload()
    } catch (e) {
      console.error('Error en el reintento de creación del proyecto:', e)
      toast('El reintento falló — vuelve a intentarlo', 'error')
    } finally { setAplicando(false) }
  }

  if (!puedeGestionar) return null

  const entrada = (de: EstadoCotizacion, a: EstadoCotizacion, extra?: { motivo?: string; version?: number }) => ({
    de, a,
    version: extra?.version ?? cotizacion.version_activa,
    por: user?.uid ?? '',
    fecha: Timestamp.now(),
    ...(extra?.motivo ? { motivo: extra.motivo } : {}),
  })

  const enviar = async () => {
    const etiq = etiquetaVersion(cotizacion.version_activa)
    if (!window.confirm(`¿Enviar ${etiq ? `la versión ${etiq} de ` : ''}${cotizacion.consecutivo}? El snapshot se congela, se genera el PDF y la cotización deja de ser editable.`)) return
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
        pdf_desactualizado: deleteField(),   // el PDF recién generado trae el asunto vivo
        historial: arrayUnion(entrada('borrador', 'enviada')),
      })
      // 4. Regla unificada (27-jul): la solicitud enlazada pasa a `cotizada`
      // aquí — cuando la cotización queda EN FIRME —, no al crear el borrador.
      // No-fatal: el envío ya ocurrió; si esto falla se avisa sin revertir.
      if (cotizacion.solicitud_id) {
        try {
          const sSnap = await getDoc(doc(db, 'solicitudes', cotizacion.solicitud_id))
          const patch = sSnap.exists()
            ? patchSolicitudCotizada(sSnap.data().estado, cotizacion.consecutivo, user?.uid ?? '', ahora)
            : null
          if (patch) {
            await updateDoc(doc(db, 'solicitudes', cotizacion.solicitud_id), {
              estado: patch.estado, fecha_actualizacion: ahora,
              historial: arrayUnion(patch.entradaHistorial),
            })
          }
        } catch (e) {
          console.error('Cotización enviada, pero la solicitud no pudo pasar a cotizada:', e)
          toast('Enviada — pero la solicitud enlazada no se pudo marcar como «cotizada»', 'error')
        }
      }
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

  /** P1: abre el modal de aprobar CARGANDO el alcance de la versión activa —
   *  sin alcance en pantalla no hay guard, y sin guard no se aprueba a ciegas. */
  const abrirModalAprobar = async () => {
    setEleccionAlcance(null)
    setEvidencia(null)
    setAlcanceAprobar(null)
    setModalAprobar(true)
    try {
      const vSnap = await getDoc(doc(db, 'cotizaciones', cotizacion.id, 'versiones', String(cotizacion.version_activa)))
      if (!vSnap.exists()) throw new Error('versión activa no encontrada')
      const v = vSnap.data() as VersionCotizacion
      const grupos = subtotalesPorGrupo(v.items ?? [], modoAgrupacionDe(v), actividadesDe(v))
      setAlcanceAprobar({ grupos, total: v.totales?.total ?? 0 })
    } catch (e) {
      console.error('No se pudo cargar el alcance para el guard de aprobación:', e)
      toast('No se pudo cargar el alcance de la versión — reintenta', 'error')
      setModalAprobar(false)
    }
  }

  const aprobar = async () => {
    // Validaciones DURAS: sin evidencia no hay aprobación; sin la afirmación
    // explícita "el cliente aprobó esto tal cual" tampoco (guard P1).
    if (!evidencia || eleccionAlcance !== 'tal_cual' || !alcanceAprobar) return
    setAplicando(true)
    try {
      // §16 (ii): el snapshot se construye ANTES de subir nada — si falla,
      // la aprobación no se aplica (mejor fallar temprano que aprobar sin
      // staging y depender de la escotilla).
      let snapshotProyecto: SnapshotProyecto | null = null
      if (f2Enabled) {
        snapshotProyecto = await construirStaging()
        if (!snapshotProyecto) {
          toast('No se pudo preparar el snapshot del proyecto — la aprobación no se aplicó, reintenta', 'error')
          return
        }
      }
      const nombre = `${Date.now()}_${evidencia.name}`
      const snap = await uploadBytes(ref(storage, `cotizaciones/${cotizacion.id}/evidencia/${nombre}`), evidencia)
      const url = await getDownloadURL(snap.ref)
      const ahora = Timestamp.now()
      await updateDoc(doc(db, 'cotizaciones', cotizacion.id), {
        estado: 'aprobada',
        pdf_desactualizado: deleteField(),   // el PDF aprobado queda como evidencia histórica
        evidencia_aprobacion: {
          nombre: evidencia.name, url, categoria: 'evidencia',
          content_type: evidencia.type || 'application/octet-stream',
          tamano: evidencia.size, subido_en: ahora,
        },
        aprobada_por: user?.uid ?? '', fecha_aprobacion: ahora, fecha_actualizacion: ahora,
        // P1: la afirmación de quien aprueba, tras VER el alcance en pantalla.
        confirmacion_alcance: confirmacionAlcanceDe(user?.uid ?? '', ahora, cotizacion.version_activa, {
          grupos: alcanceAprobar.grupos.length, total: alcanceAprobar.total,
        }),
        // Staging §16 (ii): mismo updateDoc que la aprobación (atómico). La CF
        // crearProyectoAlAprobarCotizacion copia este snapshot al proyecto,
        // asigna el PRY y pasa la solicitud enlazada a «aceptada».
        ...(snapshotProyecto ? { snapshot_proyecto: snapshotProyecto } : {}),
        historial: arrayUnion(entrada('enviada', 'aprobada', {
          motivo: `Evidencia: ${evidencia.name} · Alcance confirmado tal cual (${alcanceAprobar.grupos.length} grupos, ${fmtMoney(alcanceAprobar.total)})`,
        })),
      })
      toast(`${cotizacion.consecutivo} aprobada 🎉${snapshotProyecto ? ' — el sistema está creando el proyecto' : ''}`)
      setModalAprobar(false); setEvidencia(null)
      await reload()
    } catch { toast('Error al aprobar', 'error') } finally { setAplicando(false) }
  }

  const nuevaVersion = async () => {
    const n = cotizacion.version_activa + 1
    if (!window.confirm(`¿Crear la versión ${etiquetaVersion(n)} de ${cotizacion.consecutivo}? Se copia ${etiquetaVersion(cotizacion.version_activa) || 'la emisión inicial'} completa como borrador editable.`)) return
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
        pdf_desactualizado: deleteField(),   // la nueva versión regenerará el PDF al enviar
        fecha_actualizacion: Timestamp.now(),
        historial: arrayUnion(entrada(efectivo, 'borrador', { motivo: `Nueva versión v${n}`, version: n })),
      })
      toast(`Versión ${etiquetaVersion(n)} creada (borrador)`)
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
          <button onClick={abrirModalAprobar} disabled={aplicando}
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
        f2Enabled ? (
          proyectoId ? (
            veProyectos ? (
              <Link to={`/sigp/proyectos/${proyectoId}`}
                className="text-xs px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 font-semibold hover:bg-brand-100">
                🏗 {proyectoConsecutivo ?? 'Proyecto'}{recienCreado ? ' creado ✓' : ' →'}
              </Link>
            ) : (
              // §16 (ii): chip INFORMATIVO para comercial — el proyecto existe,
              // pero su gestión es dominio de ejecución (sin navegación).
              <span className="text-xs px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 font-semibold cursor-default"
                title="Proyecto en manos de Gerencia de Proyectos — la gestión comercial termina en la cotización">
                🏗 {proyectoConsecutivo ?? 'Proyecto'}{recienCreado ? ' creado ✓' : ''}
              </span>
            )
          ) : esperandoNacimiento && !nacimiento.tardando ? (
            <span className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500 font-medium animate-pulse">
              ⏳ Creando proyecto…
            </span>
          ) : (
            <>
              <button onClick={reintentarProyecto} disabled={aplicando}
                className="text-xs px-2.5 py-1 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 font-medium disabled:opacity-50"
                title="Esta cotización aprobada aún no tiene proyecto (aprobada antes de F2, snapshot fallido o el sistema tarda) — el reintento re-toca el doc y el sistema lo crea">
                🏗 Reintentar proyecto
              </button>
              {esperandoNacimiento && nacimiento.tardando && (
                <span className="text-[11px] text-gray-400">El sistema está tardando más de lo normal…</span>
              )}
            </>
          )
        ) : (
          <span className="text-xs text-gray-400">Estado terminal · los cambios posteriores pertenecen al proyecto.</span>
        )
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

      {/* Modal aprobar — P1: guard de RECONOCIMIENTO del alcance + evidencia
          obligatoria. La elección es explícita, sin default: aprobar exige
          afirmar "el cliente aprobó esto tal cual" con el alcance a la vista. */}
      <Modal isOpen={modalAprobar} onClose={() => setModalAprobar(false)} title={`Aprobar ${cotizacion.consecutivo}`} size="lg">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-800">
              Este es el alcance que se va a congelar{etiquetaVersion(cotizacion.version_activa) ? ` (versión ${etiquetaVersion(cotizacion.version_activa)})` : ''}:
            </p>
            {alcanceAprobar === null ? (
              <p className="mt-2 text-sm text-gray-400">Cargando el alcance…</p>
            ) : (
              <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100">
                {alcanceAprobar.grupos.map(g => (
                  <div key={g.grupo_id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-gray-700">{g.grupo_nombre}</span>
                    <span className="font-mono text-gray-700">{fmtMoney(g.subtotal)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2 text-sm bg-brand-50">
                  <span className="font-semibold text-brand-800">Total (con impuestos)</span>
                  <span className="font-mono font-bold text-brand-800">{fmtMoney(alcanceAprobar.total)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
              <input type="radio" name="eleccion-alcance" className="mt-0.5 accent-brand-700"
                checked={eleccionAlcance === 'tal_cual'} onChange={() => setEleccionAlcance('tal_cual')} />
              <span className="text-sm text-gray-800">
                <span className="font-semibold">El cliente aprobó esto tal cual.</span>{' '}
                <span className="text-gray-500">Todas las actividades listadas hacen parte de lo aprobado.</span>
              </span>
            </label>
            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
              <input type="radio" name="eleccion-alcance" className="mt-0.5 accent-brand-700"
                checked={eleccionAlcance === 'cambios'} onChange={() => setEleccionAlcance('cambios')} />
              <span className="text-sm text-gray-800">
                <span className="font-semibold">El cliente pidió cambios.</span>{' '}
                <span className="text-gray-500">Quitar o modificar algo — no se aprueba esta versión.</span>
              </span>
            </label>
          </div>

          {eleccionAlcance === 'cambios' ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 space-y-2">
              <p className="text-sm text-amber-800">
                Esta versión no refleja lo que el cliente aprobó — genera la versión nueva con los cambios y apruébala cuando esté enviada.
              </p>
              <button onClick={() => { setModalAprobar(false); nuevaVersion() }} disabled={aplicando}
                className="text-sm px-3 py-1.5 rounded-lg font-medium border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-50">
                + Generar versión nueva →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Adjunta la <span className="font-semibold">evidencia de aprobación del cliente</span> (correo, orden de compra o contrato). Sin evidencia no es posible aprobar.
              </p>
              <input type="file" onChange={e => setEvidencia(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
              {evidencia && <p className="text-xs text-gray-500">📎 {evidencia.name} ({Math.round(evidencia.size / 1024)} KB)</p>}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={() => setModalAprobar(false)} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button onClick={aprobar} disabled={!evidencia || eleccionAlcance !== 'tal_cual' || !alcanceAprobar || aplicando}
              title={eleccionAlcance !== 'tal_cual' ? 'Confirma primero que el cliente aprobó el alcance tal cual' : undefined}
              className="text-sm px-3 py-1.5 rounded-lg font-medium bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-50">
              {aplicando ? 'Aprobando…' : 'Aprobar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
