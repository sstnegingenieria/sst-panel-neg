// Bandeja de Órdenes de compra (Compras · C2 + C3 + OC2) — UI.
//
// Solo lectura + navegación para el ciclo de creación (crear/editar/emitir/
// re-enviar/anular viven en la ficha del proyecto, OrdenesCompraProyecto —
// aquí se SURFACEA, no se reinventa). Lo que SÍ opera in situ es cada cola
// de trabajo: la REVISIÓN de Gestión Administrativa (OC2 — el gate nuevo:
// valida o devuelve con la cotización del proveedor AL LADO de las líneas,
// para que la comparación sea obvia y el control siga vivo) y la COMPRA
// (C3, que pasó de Marcela a Paula: quien valida no recibe). Protegida por
// ROLES_VEN_OC en App.tsx; revisión por puedeRevisarOcUI y compra por
// puedeMarcarCompraOcUI.
import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, getDocs, doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import { useAuth } from '../../contexts/AuthContext'
import { toast } from '../../components/shared/Toast'
import Modal from '../../components/shared/Modal'
import InputExpresion from '../../components/sigp/cotizaciones/InputExpresion'
import { fmtMoney } from '../../utils/sigp/formato'
import { puedeMarcarCompraOcUI, puedeRevisarOcUI, puedeCrearOcUI } from '../../types/sigp/permisos'
import {
  ESTADO_OC_LABEL, ESTADO_OC_COLOR, validarOcParaComprar,
  patchRevisarOc, patchRechazarOc, subtotalDe, ivaTotalDe,
} from '../../types/sigp/ordenCompra'
import type { OrdenCompra, EstadoOrdenCompra } from '../../types/sigp/ordenCompra'
import { ESTADO_PRY_LABEL } from '../../types/sigp/proyecto'
import type { Proyecto } from '../../types/sigp/proyecto'

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024

/** PDF o imagen, <10MB — mismo criterio que el resto de Compras (C1/C2). */
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

type Seccion = 'todas' | EstadoOrdenCompra

// OC2: 'emitida' es la cola de REVISIÓN; 'revisada' la de compra (Paula);
// 'rechazada' las devueltas al creador. 'Aprobadas (anteriores)' = las del
// régimen anterior — la pill solo se pinta mientras exista alguna: cuando
// la última se compre o anule, desaparece sola (conviven, no se migran).
const PILLS: { clave: Seccion; etiqueta: string; soloConDocs?: boolean }[] = [
  { clave: 'borrador', etiqueta: 'Borradores' },
  { clave: 'emitida', etiqueta: 'Por revisar' },
  { clave: 'rechazada', etiqueta: 'Devueltas' },
  { clave: 'revisada', etiqueta: 'Por comprar' },
  { clave: 'aprobada', etiqueta: 'Aprobadas (anteriores)', soloConDocs: true },
  { clave: 'comprada', etiqueta: 'Compradas' },
  { clave: 'anulada', etiqueta: 'Anuladas' },
  { clave: 'todas', etiqueta: 'Todas' },
]

export default function OrdenesCompraSigp() {
  const { user } = useAuth()
  const navigate = useNavigate()
  // OC2: la compra pasó a Paula (quien valida no recibe); la revisión es de
  // gerencia_administrativa + respaldo GG/admin.
  const puedeComprar = puedeMarcarCompraOcUI(user?.rol)
  const puedeRevisar = puedeRevisarOcUI(user?.rol)
  const puedeCrear = puedeCrearOcUI(user?.rol)
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [aplicandoId, setAplicandoId] = useState<string | null>(null)
  // Default: "Por revisar" — es la cola de trabajo de quien revisa (OC2).
  const [seccion, setSeccion] = useState<Seccion>('emitida')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'ordenes_compra'))
      const datos = snap.docs.map(d => ({ id: d.id, ...d.data() }) as OrdenCompra)
      datos.sort((a, b) => (b.fecha_creacion?.toMillis?.() ?? 0) - (a.fecha_creacion?.toMillis?.() ?? 0))
      setOrdenes(datos)
    } catch {
      toast('Error al cargar las órdenes de compra', 'error')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // ═══════════════════════════════════════════════════════════════════════
  // Comprar (C3) — aprobada → comprada, valor real + soporte obligatorios
  // ═══════════════════════════════════════════════════════════════════════
  const [comprarTarget, setComprarTarget] = useState<OrdenCompra | null>(null)
  const [valorReal, setValorReal] = useState<number | undefined>(undefined)
  const [soporteCompra, setSoporteCompra] = useState<File | null>(null)

  const abrirComprar = (oc: OrdenCompra) => {
    // OC2: se compra desde `revisada` (régimen nuevo) o `aprobada` (legacy).
    setComprarTarget(oc)
    setValorReal(oc.valor_total)
    setSoporteCompra(null)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // OC2 — REVISIÓN (el gate nuevo): la cotización del proveedor AL LADO de
  // las líneas — lo que se compara está en la misma pantalla, para que la
  // revisión no se vuelva un clic sin mirar. El total TECLEADO de la
  // cotización es parte del control; si difiere del de la orden se dice en
  // pantalla (no bloquea — puede haber razón — pero no pasa desapercibido).
  // ═══════════════════════════════════════════════════════════════════════
  const [revisarTarget, setRevisarTarget] = useState<OrdenCompra | null>(null)
  const [totalCotProveedor, setTotalCotProveedor] = useState<number | undefined>(undefined)
  const [salvedadRevision, setSalvedadRevision] = useState('')
  const [motivoDevolucion, setMotivoDevolucion] = useState('')

  const abrirRevisar = (oc: OrdenCompra) => {
    setRevisarTarget(oc)
    // El total NO se prellena: teclearlo leyéndolo de la cotización es el
    // acto de mirar (misma razón del no-prefill del catálogo, PR #73).
    setTotalCotProveedor(undefined)
    setSalvedadRevision('')
    setMotivoDevolucion('')
  }

  const revisionRequiereSalvedad = revisarTarget !== null && revisarTarget.creada_por === user?.uid
  const totalDifiere = revisarTarget !== null && totalCotProveedor !== undefined
    && totalCotProveedor > 0 && totalCotProveedor !== revisarTarget.valor_total
  // El MISMO builder valida el botón y ejecuta (null = deshabilitado).
  const previaValidar = revisarTarget
    ? patchRevisarOc(revisarTarget, user?.uid ?? '', totalCotProveedor ?? 0, Timestamp.now(),
        salvedadRevision.trim() || undefined)
    : null

  const validarRevision = async () => {
    const oc = revisarTarget
    if (!oc) return
    const patch = patchRevisarOc(oc, user?.uid ?? '', totalCotProveedor ?? 0, Timestamp.now(),
      salvedadRevision.trim() || undefined)
    if (!patch) return
    setAplicandoId(oc.id)
    try {
      await updateDoc(doc(db, 'ordenes_compra', oc.id), { ...patch })
      toast(`${oc.consecutivo} validada${totalDifiere ? ' — con diferencia de total registrada' : ''}`)
      setRevisarTarget(null)
      await load()
    } catch {
      toast('Error al validar la orden (verifica tu rol)', 'error')
    } finally { setAplicandoId(null) }
  }

  const devolverOc = async () => {
    const oc = revisarTarget
    if (!oc) return
    const patch = patchRechazarOc(oc, user?.uid ?? '', motivoDevolucion, Timestamp.now())
    if (!patch) return
    setAplicandoId(oc.id)
    try {
      await updateDoc(doc(db, 'ordenes_compra', oc.id), { ...patch })
      toast(`${oc.consecutivo} devuelta al creador`)
      setRevisarTarget(null)
      await load()
    } catch {
      toast('Error al devolver la orden (verifica tu rol)', 'error')
    } finally { setAplicandoId(null) }
  }

  const onArchivoSoporte = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (!f) { setSoporteCompra(null); return }
    if (archivoValido(f)) setSoporteCompra(f)
    else { setSoporteCompra(null); e.target.value = '' }
  }

  const erroresComprar = comprarTarget
    ? validarOcParaComprar({ valorReal, tieneSoporte: !!soporteCompra })
    : {}
  const puedeConfirmarCompra = comprarTarget !== null && Object.keys(erroresComprar).length === 0
  const difiereDelPactado = comprarTarget != null && valorReal !== undefined && valorReal !== comprarTarget.valor_total

  const confirmarCompra = async () => {
    if (!comprarTarget || !puedeConfirmarCompra || !soporteCompra || valorReal === undefined) return
    setAplicandoId(comprarTarget.id)
    try {
      const path = `ordenes_compra/${comprarTarget.id}/soporte/${crypto.randomUUID()}.${extensionDe(soporteCompra)}`
      const snap = await uploadBytes(ref(storage, path), soporteCompra)
      const soporteUrl = await getDownloadURL(snap.ref)
      const ahora = Timestamp.now()
      await updateDoc(doc(db, 'ordenes_compra', comprarTarget.id), {
        estado: 'comprada',
        valor_real: valorReal,
        soporte_compra_url: soporteUrl,
        comprada_por: user?.uid ?? '',
        fecha_compra: ahora,
        fecha_actualizacion: ahora,
        historial: arrayUnion({
          // OC2: la compra sale de `revisada` (régimen nuevo) o `aprobada` (legacy).
          de: comprarTarget.estado, a: 'comprada', por: user?.uid ?? '', fecha: ahora,
          motivo: `Comprada — valor real ${fmtMoney(valorReal)}`,
        }),
      })
      toast(`${comprarTarget.consecutivo} marcada como comprada`)
      setComprarTarget(null)
      setSoporteCompra(null)
      await load()
    } catch {
      toast('Error al registrar la compra (verifica tu rol)', 'error')
    } finally { setAplicandoId(null) }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Corregir compra (addendum C3) — solo valor_real/soporte, con motivo
  // ═══════════════════════════════════════════════════════════════════════
  const [corregirTarget, setCorregirTarget] = useState<OrdenCompra | null>(null)
  const [corrValorReal, setCorrValorReal] = useState<number | undefined>(undefined)
  const [corrMotivo, setCorrMotivo] = useState('')
  const [corrSoporte, setCorrSoporte] = useState<File | null>(null)

  const abrirCorregir = (oc: OrdenCompra) => {
    setCorregirTarget(oc)
    setCorrValorReal(oc.valor_real)
    setCorrMotivo('')
    setCorrSoporte(null)
  }

  const onArchivoCorrSoporte = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (!f) { setCorrSoporte(null); return }
    if (archivoValido(f)) setCorrSoporte(f)
    else { setCorrSoporte(null); e.target.value = '' }
  }

  const puedeGuardarCorreccion = corregirTarget !== null
    && corrValorReal !== undefined && corrValorReal > 0 && corrMotivo.trim() !== ''

  const guardarCorreccion = async () => {
    if (!corregirTarget || !puedeGuardarCorreccion || corrValorReal === undefined) return
    setAplicandoId(corregirTarget.id)
    try {
      const ahora = Timestamp.now()
      let soporte = {}
      if (corrSoporte) {
        const path = `ordenes_compra/${corregirTarget.id}/soporte/${crypto.randomUUID()}.${extensionDe(corrSoporte)}`
        const snap = await uploadBytes(ref(storage, path), corrSoporte)
        soporte = { soporte_compra_url: await getDownloadURL(snap.ref) }
      }
      await updateDoc(doc(db, 'ordenes_compra', corregirTarget.id), {
        valor_real: corrValorReal,
        ...soporte,
        fecha_actualizacion: ahora,
        historial: arrayUnion({
          de: 'comprada', a: 'comprada', por: user?.uid ?? '', fecha: ahora,
          motivo: `Corrección de compra: ${corrMotivo.trim()} — valor ${fmtMoney(corregirTarget.valor_real ?? 0)} → ${fmtMoney(corrValorReal)}`,
        }),
      })
      toast(`${corregirTarget.consecutivo} — compra corregida`)
      setCorregirTarget(null)
      setCorrSoporte(null)
      await load()
    } catch {
      toast('Error al corregir la compra (verifica tu rol)', 'error')
    } finally { setAplicandoId(null) }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Tanda 5 · #4 — salida del callejón: "＋ Crear orden de compra" pregunta
  // a qué proyecto y lleva DIRECTO a la sección de OCs de su ficha (con el
  // formulario abierto vía ?oc=crear). El diseño no cambia — la OC se sigue
  // creando en la ficha; esto solo le da camino a quien llega por el sidebar.
  // Solo se ofrecen proyectos donde crear ES posible (cerrados fuera, con la
  // razón dicha) — matiz de Giovanny: no cambiar un callejón por otro.
  // ═══════════════════════════════════════════════════════════════════════
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerBusqueda, setPickerBusqueda] = useState('')
  const [proyectosPicker, setProyectosPicker] = useState<Proyecto[]>([])

  const abrirPicker = async () => {
    setPickerOpen(true)
    setPickerBusqueda('')
    setPickerLoading(true)
    try {
      const snap = await getDocs(collection(db, 'proyectos'))
      const datos = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Proyecto)
        .filter(p => p.estado !== 'cerrado' && p.estado !== 'cancelado')
      datos.sort((a, b) => (b.fecha_creacion?.toMillis?.() ?? 0) - (a.fecha_creacion?.toMillis?.() ?? 0))
      setProyectosPicker(datos)
    } catch {
      toast('Error al cargar los proyectos', 'error')
      setPickerOpen(false)
    } finally { setPickerLoading(false) }
  }

  const proyectosPickerFiltrados = useMemo(() => {
    const q = pickerBusqueda.trim().toLowerCase()
    if (!q) return proyectosPicker
    return proyectosPicker.filter(p =>
      p.consecutivo.toLowerCase().includes(q) ||
      (p.snapshot?.cliente ?? '').toLowerCase().includes(q) ||
      (p.snapshot?.nombre_sitio ?? '').toLowerCase().includes(q) ||
      (p.snapshot?.asunto ?? '').toLowerCase().includes(q))
  }, [proyectosPicker, pickerBusqueda])

  const conteo = useMemo(() => Object.fromEntries(
    PILLS.map(p => [p.clave, p.clave === 'todas' ? ordenes.length : ordenes.filter(o => o.estado === p.clave).length]),
  ) as Record<Seccion, number>, [ordenes])

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const base = seccion === 'todas' ? ordenes : ordenes.filter(o => o.estado === seccion)
    if (!q) return base
    return base.filter(o =>
      (o.consecutivo ?? '').toLowerCase().includes(q) ||
      (o.proveedor_snapshot?.razon_social ?? '').toLowerCase().includes(q) ||
      (o.proyecto_consecutivo ?? '').toLowerCase().includes(q))
  }, [ordenes, seccion, busqueda])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">SIGP · Compras · C2/C3</p>
          <h1 className="text-2xl font-bold text-gray-800">Órdenes de compra</h1>
          <p className="text-sm text-gray-500">
            Cada OC vive en la ficha de su proyecto; la <b>compra</b> (valor real + soporte) se
            registra aquí.
          </p>
        </div>
        {puedeCrear && (
          <button onClick={abrirPicker}
            className="text-sm px-3 py-2 rounded-lg font-medium bg-brand-600 hover:bg-brand-700 text-white flex-shrink-0">
            ＋ Crear orden de compra
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {PILLS.filter(p => !p.soloConDocs || (conteo[p.clave] ?? 0) > 0 || seccion === p.clave).map(p => (
          <button key={p.clave} onClick={() => setSeccion(p.clave)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
              seccion === p.clave ? 'bg-brand-700 border-brand-700 text-white' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            {p.etiqueta} ({conteo[p.clave] ?? 0})
          </button>
        ))}
      </div>

      <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar por consecutivo, proveedor o proyecto…"
        className="w-full sm:max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-3 px-4 font-semibold">Consecutivo</th>
              <th className="py-3 px-4 font-semibold">Proyecto</th>
              <th className="py-3 px-4 font-semibold">Proveedor</th>
              <th className="py-3 px-4 font-semibold text-right">Total</th>
              <th className="py-3 px-4 font-semibold">Estado</th>
              <th className="py-3 px-4 font-semibold">Fecha</th>
              {(puedeComprar || puedeRevisar) && <th className="py-3 px-4 font-semibold">Acción</th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={(puedeComprar || puedeRevisar) ? 7 : 6} className="py-10 text-center text-gray-400">Cargando…</td></tr>
            )}
            {!loading && filtradas.length === 0 && (
              <tr><td colSpan={(puedeComprar || puedeRevisar) ? 7 : 6} className="py-12 text-center text-gray-400">
                No hay órdenes de compra{busqueda ? ' con esa búsqueda' : ' en esta sección'}.
              </td></tr>
            )}
            {!loading && filtradas.map(oc => (
              <tr key={oc.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4">
                  <Link to={`/sigp/proyectos/${oc.proyecto_id}`} className="font-mono text-brand-700 font-semibold hover:underline">
                    {oc.consecutivo || 'sin código'}
                  </Link>
                </td>
                <td className="py-3 px-4">
                  <Link to={`/sigp/proyectos/${oc.proyecto_id}`} className="font-mono text-gray-700 hover:underline">
                    {oc.proyecto_consecutivo}
                  </Link>
                </td>
                <td className="py-3 px-4 text-gray-700">{oc.proveedor_snapshot?.razon_social ?? '—'}</td>
                <td className="py-3 px-4 text-right font-mono text-gray-700">
                  {oc.estado === 'comprada' && oc.valor_real != null ? (
                    <span title={`Pactado: ${fmtMoney(oc.valor_total)}`}>{fmtMoney(oc.valor_real)}</span>
                  ) : fmtMoney(oc.valor_total)}
                </td>
                <td className="py-3 px-4">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${ESTADO_OC_COLOR[oc.estado]}`}>
                    {ESTADO_OC_LABEL[oc.estado]}
                  </span>
                  {oc.salvedad_aprobacion && (
                    <span className="ml-1.5 inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800"
                      title={`Aprobación con salvedad: ${oc.salvedad_aprobacion}`}>
                      Salvedad
                    </span>
                  )}
                  {oc.estado === 'comprada' && oc.soporte_compra_url && (
                    <a href={oc.soporte_compra_url} target="_blank" rel="noreferrer"
                      className="ml-1.5 text-[11px] text-brand-700 underline underline-offset-2 font-medium">
                      soporte
                    </a>
                  )}
                </td>
                <td className="py-3 px-4 text-gray-500">{fFecha(oc.fecha_creacion)}</td>
                {(puedeComprar || puedeRevisar) && (
                  <td className="py-3 px-4">
                    {oc.estado === 'emitida' && puedeRevisar && (
                      <button onClick={() => abrirRevisar(oc)} disabled={aplicandoId === oc.id}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 whitespace-nowrap">
                        🔍 Revisar
                      </button>
                    )}
                    {(oc.estado === 'revisada' || oc.estado === 'aprobada') && puedeComprar && (
                      <button onClick={() => abrirComprar(oc)} disabled={aplicandoId === oc.id}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50 disabled:opacity-50 whitespace-nowrap">
                        🛒 Comprar
                      </button>
                    )}
                    {oc.estado === 'comprada' && puedeComprar && (
                      <button onClick={() => abrirCorregir(oc)} disabled={aplicandoId === oc.id}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap">
                        ✎ Corregir compra
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modal: elegir proyecto para la nueva OC (tanda 5 · #4) ────── */}
      <Modal
        isOpen={pickerOpen}
        title="Nueva orden de compra — ¿para qué proyecto?"
        onClose={() => setPickerOpen(false)}
        actions={[{ label: 'Cancelar', onClick: () => setPickerOpen(false), variant: 'secondary' }]}
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            La orden se crea en la ficha del proyecto — elige uno y te llevamos directo con el
            formulario abierto.
          </p>
          <input value={pickerBusqueda} onChange={e => setPickerBusqueda(e.target.value)} autoFocus
            placeholder="Buscar por PRY, cliente, sitio o asunto…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          {pickerLoading ? (
            <p className="py-6 text-center text-sm text-gray-400">Cargando proyectos…</p>
          ) : proyectosPickerFiltrados.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              {proyectosPicker.length === 0
                ? 'No hay proyectos abiertos donde crear una orden.'
                : 'Ningún proyecto coincide con la búsqueda.'}
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {proyectosPickerFiltrados.map(p => (
                <button key={p.id} onClick={() => { setPickerOpen(false); navigate(`/sigp/proyectos/${p.id}?oc=crear`) }}
                  className="w-full text-left px-3 py-2 hover:bg-brand-50 transition-colors">
                  <span className="font-mono text-sm text-brand-700 font-semibold">{p.consecutivo}</span>
                  <span className="ml-2 text-sm text-gray-700">{p.snapshot?.nombre_sitio || p.snapshot?.asunto || '—'}</span>
                  <span className="block text-xs text-gray-400">
                    {p.snapshot?.cliente} · {ESTADO_PRY_LABEL[p.estado] ?? p.estado}
                  </span>
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-gray-400">
            Los proyectos cerrados o cancelados no admiten órdenes nuevas y no aparecen en esta lista.
          </p>
        </div>
      </Modal>

      {/* ── Modal OC2: Revisar — la cotización del proveedor AL LADO de las
             líneas; validar exige el total LEÍDO de esa cotización ───────── */}
      <Modal
        isOpen={revisarTarget !== null}
        title={`Revisar — ${revisarTarget?.consecutivo ?? ''} · ${revisarTarget?.proveedor_snapshot?.razon_social ?? ''}`}
        onClose={() => setRevisarTarget(null)}
        size="lg"
        actions={[
          { label: 'Volver', onClick: () => setRevisarTarget(null), variant: 'secondary' },
          {
            label: aplicandoId === revisarTarget?.id ? 'Devolviendo…' : 'Devolver al creador',
            onClick: devolverOc, variant: 'danger',
            loading: aplicandoId === revisarTarget?.id, disabled: !motivoDevolucion.trim(),
          },
          {
            label: aplicandoId === revisarTarget?.id ? 'Validando…' : '✓ Validar',
            onClick: validarRevision, variant: 'primary',
            loading: aplicandoId === revisarTarget?.id, disabled: previaValidar === null,
          },
        ]}
      >
        {revisarTarget && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Las líneas de la ORDEN */}
              <div>
                <p className="text-xs font-bold text-brand-700 uppercase tracking-wide mb-1.5">Líneas de la orden</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
                        <th className="py-1.5 px-2 font-semibold">Descripción</th>
                        <th className="py-1.5 px-2 font-semibold text-right">Cant</th>
                        <th className="py-1.5 px-2 font-semibold text-right">Vr. unit</th>
                        <th className="py-1.5 px-2 font-semibold text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(revisarTarget.lineas ?? []).map((l, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="py-1.5 px-2 text-gray-700">{l.descripcion}{l.unidad ? ` (${l.unidad})` : ''}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-gray-600">{l.cantidad}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-gray-600">{fmtMoney(l.valor_unitario)}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-gray-700">{fmtMoney(l.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="border-t border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-right space-y-0.5">
                    <p className="text-gray-500">Subtotal: <span className="font-mono">{fmtMoney(subtotalDe(revisarTarget.lineas ?? []))}</span>
                      {' '}· IVA: <span className="font-mono">{fmtMoney(ivaTotalDe(revisarTarget.lineas ?? []))}</span></p>
                    <p className="font-semibold text-gray-800">Total de la orden: <span className="font-mono">{fmtMoney(revisarTarget.valor_total)}</span></p>
                  </div>
                </div>
              </div>
              {/* La COTIZACIÓN del proveedor — lo que se compara, en la misma pantalla */}
              <div>
                <p className="text-xs font-bold text-brand-700 uppercase tracking-wide mb-1.5">
                  Cotización del proveedor
                  {revisarTarget.cotizacion_referencia ? ` · ${revisarTarget.cotizacion_referencia}` : ''}
                </p>
                {revisarTarget.cotizacion_proveedor_url ? (
                  <>
                    <iframe src={revisarTarget.cotizacion_proveedor_url} title="Cotización del proveedor"
                      className="w-full h-[380px] border border-gray-200 rounded-lg bg-gray-50" />
                    <a href={revisarTarget.cotizacion_proveedor_url} target="_blank" rel="noreferrer"
                      className="mt-1 inline-block text-[11px] text-brand-700 underline underline-offset-2 font-medium">
                      abrir en pestaña aparte ↗
                    </a>
                  </>
                ) : (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1.5">
                    La orden no tiene cotización adjunta — no debería haber llegado a revisión; devuélvela con ese motivo.
                  </p>
                )}
              </div>
            </div>

            <label className="block text-sm">
              <span className="font-medium text-gray-700">
                Total según la cotización del proveedor <span className="text-red-500">*</span>
              </span>
              <span className="block text-[11px] text-gray-400">
                Léelo del documento de la derecha y tecléalo — es la comparación que esta revisión protege.
              </span>
              <InputExpresion valor={totalCotProveedor} onValor={setTotalCotProveedor}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
            {totalDifiere && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-300 rounded px-2.5 py-1.5">
                ⚠ <b>El total de la orden ({fmtMoney(revisarTarget.valor_total)}) no coincide con el de la
                cotización ({fmtMoney(totalCotProveedor ?? 0)})</b> — puede haber razón; si validas, la
                diferencia queda registrada en el historial.
              </p>
            )}
            {revisionRequiereSalvedad && (
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Salvedad <span className="text-red-500">*</span></span>
                <span className="block text-[11px] text-gray-400">
                  Creaste esta orden — validar lo propio exige salvedad con traza.
                </span>
                <textarea value={salvedadRevision} onChange={e => setSalvedadRevision(e.target.value)} rows={2}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
              </label>
            )}
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Motivo de devolución</span>
              <span className="block text-[11px] text-gray-400">
                Solo si la devuelves — vuelve al creador, editable y re-enviable con el mismo consecutivo.
              </span>
              <textarea value={motivoDevolucion} onChange={e => setMotivoDevolucion(e.target.value)} rows={2}
                placeholder="Qué debe corregirse…"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
          </div>
        )}
      </Modal>

      {/* ── Modal: Comprar (C3/OC2) — revisada (o aprobada legacy) → comprada ── */}
      <Modal
        isOpen={comprarTarget !== null}
        title={`Comprar — ${comprarTarget?.consecutivo ?? ''}`}
        onClose={() => setComprarTarget(null)}
        actions={[
          { label: 'Cancelar', onClick: () => setComprarTarget(null), variant: 'secondary' },
          {
            label: aplicandoId === comprarTarget?.id ? 'Guardando…' : 'Marcar comprada',
            onClick: confirmarCompra, variant: 'primary',
            loading: aplicandoId === comprarTarget?.id, disabled: !puedeConfirmarCompra,
          },
        ]}
      >
        {comprarTarget && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Proveedor <b>{comprarTarget.proveedor_snapshot?.razon_social ?? '—'}</b> · pactado{' '}
              <b>{fmtMoney(comprarTarget.valor_total)}</b>.
            </p>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Valor real pagado <span className="text-red-500">*</span></span>
              <InputExpresion valor={valorReal} onValor={setValorReal}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
            {difiereDelPactado && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                ⚠ El valor real difiere del pactado ({fmtMoney(comprarTarget.valor_total)}).
              </p>
            )}
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Soporte de la compra <span className="text-red-500">*</span></span>
              <input type="file" accept=".pdf,image/*" onChange={onArchivoSoporte}
                className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
            </label>
          </div>
        )}
      </Modal>

      {/* ── Modal: Corregir compra (addendum C3) — valor_real/soporte + motivo ── */}
      <Modal
        isOpen={corregirTarget !== null}
        title={`Corregir compra — ${corregirTarget?.consecutivo ?? ''}`}
        onClose={() => setCorregirTarget(null)}
        actions={[
          { label: 'Cancelar', onClick: () => setCorregirTarget(null), variant: 'secondary' },
          {
            label: aplicandoId === corregirTarget?.id ? 'Guardando…' : 'Guardar corrección',
            onClick: guardarCorreccion, variant: 'primary',
            loading: aplicandoId === corregirTarget?.id, disabled: !puedeGuardarCorreccion,
          },
        ]}
      >
        {corregirTarget && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              El estado <b>comprada</b> es terminal — solo se corrige el monto registrado, con
              motivo y traza (no se "descompra").
            </p>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Valor real pagado <span className="text-red-500">*</span></span>
              <InputExpresion valor={corrValorReal} onValor={setCorrValorReal}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Reemplazar soporte (opcional)</span>
              <input type="file" accept=".pdf,image/*" onChange={onArchivoCorrSoporte}
                className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Motivo de la corrección <span className="text-red-500">*</span></span>
              <textarea value={corrMotivo} onChange={e => setCorrMotivo(e.target.value)} rows={3} autoFocus
                placeholder="Por qué se corrige el valor registrado…"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}
