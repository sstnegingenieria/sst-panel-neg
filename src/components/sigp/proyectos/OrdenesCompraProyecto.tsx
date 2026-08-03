// Módulo Compras · C2 — Órdenes de compra (sub-bloque 3, UI).
//
// Documento de EJECUCIÓN (costo operativo, jamás venta/utilidad). La crea un
// operativo de proyectos con la cotización del proveedor adjunta; la aprueba
// GP/GG/admin (aprobador ≠ creador, o salvedad obligatoria como escape). El
// consecutivo OC-YYYY-NNN se asigna al EMITIR (contigüidad ISO — patrón
// SOL/VIS/COT/PRY: preservado ante fallo, nunca se queman huecos).
//
// Roles (types/sigp/permisos.ts, alineados con firestore.rules):
// - puedeCrearOcUI: crea/edita/emite/anula sus borradores y emitidas.
// - apruebaOcUI: aprueba emitidas; anula aprobadas.
// - veOcUI: lectura (además gerencia_administrativa + gestion_integral).
import { useState, useEffect, useCallback, useRef } from 'react'
import type { ChangeEvent } from 'react'
import {
  collection, query, where, getDocs, addDoc, updateDoc, doc, arrayUnion, Timestamp,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { useConsecutivo } from '../../../hooks/sigp/useConsecutivo'
import { toast } from '../../shared/Toast'
import Modal from '../../shared/Modal'
import TextField from '../../shared/TextField'
import SelectField from '../../shared/SelectField'
import InputExpresion from '../cotizaciones/InputExpresion'
import { fmtMoney } from '../../../utils/sigp/formato'
import {
  ESTADO_OC_LABEL, ESTADO_OC_COLOR,
  valorLineaDe, totalDe, validarOcParaEmitir, requiereSalvedadAprobacion,
} from '../../../types/sigp/ordenCompra'
import { puedeCrearOcUI, apruebaOcUI, veOcUI } from '../../../types/sigp/permisos'
import type { OrdenCompra, LineaOrdenCompra } from '../../../types/sigp/ordenCompra'
import type { Proveedor } from '../../../types/sigp/proveedor'
import type { Proyecto } from '../../../types/sigp/proyecto'

const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024

/** PDF o imagen, <10MB — mismo criterio que Compras C1 (Proveedores). */
function archivoValido(file: File): boolean {
  const esPdfOImagen = file.type === 'application/pdf' || file.type.startsWith('image/')
  if (!esPdfOImagen) { toast('El archivo debe ser un PDF o una imagen', 'error'); return false }
  if (file.size > MAX_ARCHIVO_BYTES) { toast('El archivo no puede superar 10MB', 'error'); return false }
  return true
}

function extensionDe(file: File): string {
  const partes = file.name.split('.')
  return partes.length > 1 ? partes[partes.length - 1] : 'dat'
}

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

/** Línea del formulario — cantidad/valor_unitario sin confirmar aún (InputExpresion). */
interface LineaForm {
  descripcion: string
  cantidad?: number
  valor_unitario?: number
}

const lineaFormVacia = (): LineaForm => ({ descripcion: '', cantidad: undefined, valor_unitario: undefined })

/** Convierte las líneas del formulario a LineaOrdenCompra[] con valor derivado. */
function lineasDe(form: LineaForm[]): LineaOrdenCompra[] {
  return form
    .filter(l => l.descripcion.trim() || l.cantidad || l.valor_unitario)
    .map(l => ({
      descripcion: l.descripcion.trim(),
      cantidad: l.cantidad ?? 0,
      valor_unitario: l.valor_unitario ?? 0,
      valor: valorLineaDe(l.cantidad ?? 0, l.valor_unitario ?? 0),
    }))
}

interface Props {
  proyecto: Proyecto
  reload?: () => Promise<void>
}

export default function OrdenesCompraProyecto({ proyecto, reload }: Props) {
  const { user } = useAuth()
  const puedeCrear = puedeCrearOcUI(user?.rol)
  const puedeAprobar = apruebaOcUI(user?.rol)
  const { obtener } = useConsecutivo()
  // Patrón SOL/VIS/COT/PRY: el consecutivo, si ya se consumió al emitir y el
  // guardado posterior falló, se preserva por OC — el reintento lo reutiliza
  // en vez de quemar otro número.
  const pendientesRef = useRef<Record<string, string>>({})

  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([])
  const [loading, setLoading] = useState(true)
  const [aplicandoId, setAplicandoId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'ordenes_compra'), where('proyecto_id', '==', proyecto.id)))
      const datos = snap.docs.map(d => ({ id: d.id, ...d.data() }) as OrdenCompra)
      datos.sort((a, b) => (b.fecha_creacion?.toMillis?.() ?? 0) - (a.fecha_creacion?.toMillis?.() ?? 0))
      setOrdenes(datos)
    } catch {
      toast('Error al cargar las órdenes de compra', 'error')
    } finally { setLoading(false) }
  }, [proyecto.id])

  useEffect(() => { if (veOcUI(user?.rol)) load() }, [load, user?.rol])

  // ═══════════════════════════════════════════════════════════════════════
  // MODAL — Nueva / Editar orden de compra
  // ═══════════════════════════════════════════════════════════════════════
  const [formOpen, setFormOpen] = useState(false)
  const [formTarget, setFormTarget] = useState<OrdenCompra | null>(null)   // null = creando
  const [proveedoresActivos, setProveedoresActivos] = useState<Proveedor[]>([])
  const [proveedorId, setProveedorId] = useState('')
  const [lineasForm, setLineasForm] = useState<LineaForm[]>([lineaFormVacia()])
  const [guardando, setGuardando] = useState(false)

  const proveedorSeleccionado = proveedoresActivos.find(p => p.id === proveedorId)
  const totalForm = totalDe(lineasDe(lineasForm))

  const abrirCrear = async () => {
    setFormTarget(null)
    setProveedorId('')
    setLineasForm([lineaFormVacia()])
    setFormOpen(true)
    try {
      const snap = await getDocs(query(collection(db, 'proveedores'), where('estado', '==', 'activo')))
      setProveedoresActivos(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Proveedor)
        .sort((a, b) => a.razon_social.localeCompare(b.razon_social, 'es', { sensitivity: 'base' })))
    } catch {
      toast('Error al cargar los proveedores activos', 'error')
      setProveedoresActivos([])
    }
  }

  const abrirEditar = (oc: OrdenCompra) => {
    setFormTarget(oc)
    setProveedorId(oc.proveedor_id)
    setProveedoresActivos([{
      id: oc.proveedor_id, identificacion: oc.proveedor_snapshot?.identificacion ?? '',
      razon_social: oc.proveedor_snapshot?.razon_social ?? '—',
    } as Proveedor])
    setLineasForm((oc.lineas ?? []).length
      ? oc.lineas.map(l => ({ descripcion: l.descripcion, cantidad: l.cantidad, valor_unitario: l.valor_unitario }))
      : [lineaFormVacia()])
    setFormOpen(true)
  }

  const agregarLinea = () => setLineasForm(prev => [...prev, lineaFormVacia()])
  const quitarLinea = (i: number) => setLineasForm(prev => prev.filter((_, idx) => idx !== i))
  const patchLinea = (i: number, patch: Partial<LineaForm>) =>
    setLineasForm(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))

  const puedeGuardarForm = proveedorId !== ''

  const guardarForm = async () => {
    if (!puedeGuardarForm || !proveedorSeleccionado) return
    setGuardando(true)
    try {
      const lineas = lineasDe(lineasForm)
      const valorTotal = totalDe(lineas)
      const ahora = Timestamp.now()
      if (formTarget) {
        // Editar (solo borrador — la regla también lo exige): líneas + total.
        await updateDoc(doc(db, 'ordenes_compra', formTarget.id), {
          lineas, valor_total: valorTotal, fecha_actualizacion: ahora,
        })
        toast('Orden de compra actualizada')
      } else {
        await addDoc(collection(db, 'ordenes_compra'), {
          consecutivo: '',
          proyecto_id: proyecto.id,
          proyecto_consecutivo: proyecto.consecutivo,
          proveedor_id: proveedorSeleccionado.id,
          proveedor_snapshot: {
            identificacion: proveedorSeleccionado.identificacion,
            razon_social: proveedorSeleccionado.razon_social,
          },
          lineas, valor_total: valorTotal,
          cotizacion_proveedor_url: '',
          estado: 'borrador',
          creada_por: user?.uid ?? '',
          historial: [{ de: null, a: 'borrador', por: user?.uid ?? '', fecha: ahora }],
          fecha_creacion: ahora,
        })
        toast('Orden de compra creada — borrador')
      }
      setFormOpen(false)
      await load()
      await reload?.()
    } catch {
      toast('Error al guardar la orden de compra (verifica tu rol)', 'error')
    } finally { setGuardando(false) }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODAL — Cotización del proveedor (Storage)
  // ═══════════════════════════════════════════════════════════════════════
  const [cotizacionTarget, setCotizacionTarget] = useState<OrdenCompra | null>(null)
  const [cotizacionFile, setCotizacionFile] = useState<File | null>(null)
  const [subiendoCotizacion, setSubiendoCotizacion] = useState(false)

  const onArchivoCotizacion = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (!f) { setCotizacionFile(null); return }
    if (archivoValido(f)) setCotizacionFile(f)
    else { setCotizacionFile(null); e.target.value = '' }
  }

  const subirCotizacion = async () => {
    if (!cotizacionTarget || !cotizacionFile) return
    setSubiendoCotizacion(true)
    try {
      const path = `ordenes_compra/${cotizacionTarget.id}/cotizacion/${crypto.randomUUID()}.${extensionDe(cotizacionFile)}`
      const snap = await uploadBytes(ref(storage, path), cotizacionFile)
      const url = await getDownloadURL(snap.ref)
      await updateDoc(doc(db, 'ordenes_compra', cotizacionTarget.id), {
        cotizacion_proveedor_url: url, fecha_actualizacion: Timestamp.now(),
      })
      toast('Cotización del proveedor adjuntada')
      setCotizacionTarget(null)
      setCotizacionFile(null)
      await load()
    } catch {
      toast('Error al subir la cotización', 'error')
    } finally { setSubiendoCotizacion(false) }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Emitir — consecutivo al materializar, preservado ante fallo
  // ═══════════════════════════════════════════════════════════════════════
  const obtenerConsecutivoOC = async (ocId: string) => {
    if (pendientesRef.current[ocId]) return pendientesRef.current[ocId]
    const c = await obtener('OC')
    pendientesRef.current[ocId] = c
    return c
  }

  const emitir = async (oc: OrdenCompra) => {
    const errores = validarOcParaEmitir(oc)
    if (Object.keys(errores).length) return
    if (!window.confirm(`¿Emitir la orden de compra a ${oc.proveedor_snapshot?.razon_social ?? 'el proveedor'} por ${fmtMoney(oc.valor_total)}? Se le asignará el consecutivo OC.`)) return
    setAplicandoId(oc.id)
    try {
      const consecutivo = await obtenerConsecutivoOC(oc.id)
      const ahora = Timestamp.now()
      await updateDoc(doc(db, 'ordenes_compra', oc.id), {
        estado: 'emitida',
        consecutivo,
        fecha_actualizacion: ahora,
        historial: arrayUnion({
          de: 'borrador', a: 'emitida', por: user?.uid ?? '', fecha: ahora,
          motivo: `Emitida — ${consecutivo} asignado`,
        }),
      })
      delete pendientesRef.current[oc.id]
      toast(`${consecutivo} emitida`)
      await load()
      await reload?.()
    } catch {
      toast('Error al emitir la orden de compra — el consecutivo se conserva para reintentar', 'error')
    } finally { setAplicandoId(null) }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Aprobar — salvedad obligatoria si aprobador == creador
  // ═══════════════════════════════════════════════════════════════════════
  const [salvedadTarget, setSalvedadTarget] = useState<OrdenCompra | null>(null)
  const [salvedadTexto, setSalvedadTexto] = useState('')

  const ejecutarAprobacion = async (oc: OrdenCompra, salvedad?: string) => {
    setAplicandoId(oc.id)
    try {
      const ahora = Timestamp.now()
      await updateDoc(doc(db, 'ordenes_compra', oc.id), {
        estado: 'aprobada',
        aprobada_por: user?.uid ?? '',
        fecha_aprobacion: ahora,
        fecha_actualizacion: ahora,
        ...(salvedad ? { salvedad_aprobacion: salvedad } : {}),
        historial: arrayUnion({
          de: 'emitida', a: 'aprobada', por: user?.uid ?? '', fecha: ahora,
          motivo: salvedad ? `Aprobada — SALVEDAD: ${salvedad}` : 'Aprobada',
        }),
      })
      toast(`${oc.consecutivo} aprobada`)
      setSalvedadTarget(null)
      setSalvedadTexto('')
      await load()
      await reload?.()
    } catch {
      toast('Error al aprobar la orden de compra (verifica tu rol)', 'error')
    } finally { setAplicandoId(null) }
  }

  const clicAprobar = (oc: OrdenCompra) => {
    if (requiereSalvedadAprobacion(user?.uid ?? '', oc.creada_por)) {
      setSalvedadTarget(oc)
      setSalvedadTexto('')
      return
    }
    if (!window.confirm(`¿Aprobar la orden ${oc.consecutivo}? Total ${fmtMoney(oc.valor_total)}.`)) return
    ejecutarAprobacion(oc)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Anular — motivo obligatorio
  // ═══════════════════════════════════════════════════════════════════════
  const [anularTarget, setAnularTarget] = useState<OrdenCompra | null>(null)
  const [anularMotivo, setAnularMotivo] = useState('')

  const anular = async () => {
    if (!anularTarget || !anularMotivo.trim()) return
    setAplicandoId(anularTarget.id)
    try {
      const ahora = Timestamp.now()
      await updateDoc(doc(db, 'ordenes_compra', anularTarget.id), {
        estado: 'anulada',
        fecha_actualizacion: ahora,
        historial: arrayUnion({
          de: anularTarget.estado, a: 'anulada', por: user?.uid ?? '', fecha: ahora,
          motivo: anularMotivo.trim(),
        }),
      })
      toast('Orden de compra anulada')
      setAnularTarget(null)
      setAnularMotivo('')
      delete pendientesRef.current[anularTarget.id]
      await load()
      await reload?.()
    } catch {
      toast('Error al anular la orden de compra (verifica tu rol)', 'error')
    } finally { setAplicandoId(null) }
  }

  if (!veOcUI(user?.rol)) return null

  const motivoAnulacion = (oc: OrdenCompra) =>
    [...oc.historial].reverse().find(h => h.a === 'anulada')?.motivo

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-800">Órdenes de compra</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Compras · C2 — costo operativo con proveedor. Nace en borrador; el consecutivo OC se
            asigna al emitir, con la cotización del proveedor ya adjunta.
          </p>
        </div>
        {puedeCrear && (
          <button onClick={abrirCrear}
            className="text-xs px-3 py-1.5 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50 flex-shrink-0">
            ＋ Nueva orden de compra
          </button>
        )}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-gray-400 text-center py-4">Cargando…</p>
      ) : ordenes.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400 text-center py-4">Aún no hay órdenes de compra para este proyecto.</p>
      ) : (
        <div className="mt-4 divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {ordenes.map(oc => {
            const aplicando = aplicandoId === oc.id
            const erroresEmitir = oc.estado === 'borrador' ? validarOcParaEmitir(oc) : {}
            const puedeEmitir = Object.keys(erroresEmitir).length === 0

            return (
              <div key={oc.id} className="px-3 py-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-gray-800">
                    {oc.consecutivo || 'sin código · borrador'}
                  </span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${ESTADO_OC_COLOR[oc.estado]}`}>
                    {ESTADO_OC_LABEL[oc.estado]}
                  </span>
                  {oc.salvedad_aprobacion && (
                    <span
                      className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800"
                      title={`Aprobación con salvedad: ${oc.salvedad_aprobacion}`}>
                      Salvedad
                    </span>
                  )}
                  <span className="text-sm text-gray-600">{oc.proveedor_snapshot?.razon_social ?? '—'}</span>
                  <span className="ml-auto font-mono text-sm font-semibold text-gray-800">{fmtMoney(oc.valor_total)}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                  <span>Creada el {fFecha(oc.fecha_creacion)}</span>
                  {oc.cotizacion_proveedor_url && (
                    <a href={oc.cotizacion_proveedor_url} target="_blank" rel="noreferrer"
                      className="text-brand-700 underline underline-offset-2 font-medium">ver cotización</a>
                  )}
                  {oc.estado === 'anulada' && motivoAnulacion(oc) && (
                    <span className="text-red-600">Motivo de anulación: {motivoAnulacion(oc)}</span>
                  )}
                  {(oc.estado === 'aprobada' || oc.estado === 'comprada') && oc.fecha_aprobacion && (
                    <span>Aprobada el {fFecha(oc.fecha_aprobacion)}</span>
                  )}
                  {oc.estado === 'comprada' && (
                    <>
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-brand-100 text-brand-800">
                        Valor real: {oc.valor_real != null ? fmtMoney(oc.valor_real) : '—'}
                      </span>
                      {oc.soporte_compra_url && (
                        <a href={oc.soporte_compra_url} target="_blank" rel="noreferrer"
                          className="text-brand-700 underline underline-offset-2 font-medium">ver soporte</a>
                      )}
                      {oc.fecha_compra && <span>Comprada el {fFecha(oc.fecha_compra)}</span>}
                    </>
                  )}
                </div>
                {oc.estado === 'comprada' && (
                  <p className="text-[11px] text-gray-400">
                    La compra (valor real + soporte) se registra y corrige desde la bandeja de{' '}
                    <span className="font-medium text-gray-500">Órdenes de compra</span> — aquí solo se consulta.
                  </p>
                )}

                {/* ── Acciones por estado/rol ── */}
                <div className="flex flex-wrap items-center gap-2">
                  {oc.estado === 'borrador' && puedeCrear && (
                    <>
                      <button onClick={() => abrirEditar(oc)} disabled={aplicando}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                        Editar
                      </button>
                      <button onClick={() => { setCotizacionTarget(oc); setCotizacionFile(null) }} disabled={aplicando}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                        📎 Cotización del proveedor
                      </button>
                      <button onClick={() => emitir(oc)} disabled={aplicando || !puedeEmitir}
                        title={puedeEmitir ? undefined : Object.values(erroresEmitir).join(' · ')}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed">
                        {aplicando ? 'Emitiendo…' : 'Emitir →'}
                      </button>
                      <button onClick={() => { setAnularTarget(oc); setAnularMotivo('') }} disabled={aplicando}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">
                        Anular
                      </button>
                    </>
                  )}
                  {oc.estado === 'emitida' && puedeAprobar && (
                    <button onClick={() => clicAprobar(oc)} disabled={aplicando}
                      title={requiereSalvedadAprobacion(user?.uid ?? '', oc.creada_por)
                        ? 'Aprobador = creador: la salvedad es obligatoria' : undefined}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                      ✓ Aprobar
                    </button>
                  )}
                  {oc.estado === 'emitida' && puedeCrear && (
                    <button onClick={() => { setAnularTarget(oc); setAnularMotivo('') }} disabled={aplicando}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">
                      Anular
                    </button>
                  )}
                  {oc.estado === 'aprobada' && puedeAprobar && (
                    <button onClick={() => { setAnularTarget(oc); setAnularMotivo('') }} disabled={aplicando}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">
                      Anular
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal: Nueva / Editar orden de compra ─────────────────────── */}
      <Modal
        isOpen={formOpen}
        title={formTarget ? `Editar orden de compra — ${formTarget.consecutivo || 'borrador'}` : 'Nueva orden de compra'}
        onClose={() => setFormOpen(false)}
        size="lg"
        actions={[
          { label: 'Cancelar', onClick: () => setFormOpen(false), variant: 'secondary' },
          {
            label: guardando ? 'Guardando…' : formTarget ? 'Guardar cambios' : 'Crear orden de compra',
            onClick: guardarForm, variant: 'primary', loading: guardando, disabled: !puedeGuardarForm,
          },
        ]}
      >
        <div className="space-y-4">
          <SelectField label="Proveedor" value={proveedorId} onChange={setProveedorId}
            required disabled={!!formTarget} placeholder="Selecciona un proveedor activo"
            options={proveedoresActivos.map(p => ({ value: p.id, label: `${p.razon_social} — ${p.identificacion}` }))} />
          {!formTarget && proveedoresActivos.length === 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5">
              No hay proveedores activos — regístralos primero en Compras · Proveedores.
            </p>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Líneas</span>
              <button type="button" onClick={agregarLinea}
                className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium">
                ＋ Agregar línea
              </button>
            </div>
            <div className="space-y-2">
              {lineasForm.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start bg-gray-50 rounded-lg p-2">
                  <div className="col-span-12 sm:col-span-5">
                    <TextField label={i === 0 ? 'Descripción' : ''} value={l.descripcion}
                      onChange={v => patchLinea(i, { descripcion: v })} placeholder="Descripción de la línea" />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    {i === 0 && <label className="text-sm font-medium text-gray-700 block mb-1">Cantidad</label>}
                    <InputExpresion valor={l.cantidad} onValor={v => patchLinea(i, { cantidad: v })}
                      className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-300" />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    {i === 0 && <label className="text-sm font-medium text-gray-700 block mb-1">Vr. unitario</label>}
                    <InputExpresion valor={l.valor_unitario} onValor={v => patchLinea(i, { valor_unitario: v })}
                      className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-300" />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    {i === 0 && <label className="text-sm font-medium text-gray-700 block mb-1">Valor</label>}
                    <p className="text-sm px-2 py-2 font-mono text-gray-600 text-right">
                      {fmtMoney(valorLineaDe(l.cantidad ?? 0, l.valor_unitario ?? 0))}
                    </p>
                  </div>
                  <div className="col-span-1 flex items-end justify-end h-full">
                    {lineasForm.length > 1 && (
                      <button type="button" onClick={() => quitarLinea(i)}
                        className="text-red-400 hover:text-red-600 text-lg leading-none px-1" title="Quitar línea">✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-1 border-t border-gray-100">
              <span className="text-sm font-semibold text-gray-700">Total: <span className="font-mono">{fmtMoney(totalForm)}</span></span>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Cotización del proveedor ───────────────────────────── */}
      <Modal
        isOpen={cotizacionTarget !== null}
        title={`Cotización del proveedor — ${cotizacionTarget?.consecutivo || 'borrador'}`}
        onClose={() => setCotizacionTarget(null)}
        actions={[
          { label: 'Cancelar', onClick: () => setCotizacionTarget(null), variant: 'secondary' },
          {
            label: subiendoCotizacion ? 'Subiendo…' : 'Guardar',
            onClick: subirCotizacion, variant: 'primary', loading: subiendoCotizacion, disabled: !cotizacionFile,
          },
        ]}
      >
        <div className="space-y-3">
          {cotizacionTarget?.cotizacion_proveedor_url && (
            <p className="text-xs text-gray-500">
              Cotización actual:{' '}
              <a href={cotizacionTarget.cotizacion_proveedor_url} target="_blank" rel="noreferrer"
                className="text-brand-700 underline underline-offset-2">ver documento</a>
            </p>
          )}
          <label className="block text-sm">
            <span className="font-medium text-gray-700">
              {cotizacionTarget?.cotizacion_proveedor_url ? 'Reemplazar cotización' : 'Cotización del proveedor'} <span className="text-red-500">*</span>
            </span>
            <input type="file" accept=".pdf,image/*" onChange={onArchivoCotizacion}
              className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
          </label>
        </div>
      </Modal>

      {/* ── Modal: Aprobar con salvedad obligatoria (aprobador == creador) ── */}
      <Modal
        isOpen={salvedadTarget !== null}
        title={`Aprobar con salvedad — ${salvedadTarget?.consecutivo ?? ''}`}
        onClose={() => setSalvedadTarget(null)}
        actions={[
          { label: 'Cancelar', onClick: () => setSalvedadTarget(null), variant: 'secondary' },
          {
            label: aplicandoId === salvedadTarget?.id ? 'Aprobando…' : 'Aprobar con salvedad',
            onClick: () => salvedadTarget && salvedadTexto.trim() && ejecutarAprobacion(salvedadTarget, salvedadTexto.trim()),
            variant: 'primary', loading: aplicandoId === salvedadTarget?.id, disabled: !salvedadTexto.trim(),
          },
        ]}
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Creaste esta orden de compra — la aprobación exige salvedad (queda en la orden y en el
            historial, con tu justificación de por qué apruebas tú mismo).
          </p>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Salvedad <span className="text-red-500">*</span></span>
            <textarea value={salvedadTexto} onChange={e => setSalvedadTexto(e.target.value)} rows={3} autoFocus
              placeholder="Ej: no hay otro rol aprobador disponible en este momento…"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
        </div>
      </Modal>

      {/* ── Modal: Anular (motivo obligatorio) ────────────────────────── */}
      <Modal
        isOpen={anularTarget !== null}
        title={`Anular orden de compra — ${anularTarget?.consecutivo || 'borrador'}`}
        onClose={() => setAnularTarget(null)}
        actions={[
          { label: 'Cancelar', onClick: () => setAnularTarget(null), variant: 'secondary' },
          {
            label: aplicandoId === anularTarget?.id ? 'Anulando…' : 'Anular',
            onClick: anular, variant: 'danger', loading: aplicandoId === anularTarget?.id, disabled: !anularMotivo.trim(),
          },
        ]}
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            La anulación es un estado terminal — la orden queda archivada con el motivo. No se elimina.
          </p>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Motivo <span className="text-red-500">*</span></span>
            <textarea value={anularMotivo} onChange={e => setAnularMotivo(e.target.value)} rows={3} autoFocus
              placeholder="Por qué se anula esta orden de compra…"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
        </div>
      </Modal>
    </div>
  )
}
