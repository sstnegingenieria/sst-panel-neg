// Bandeja de Órdenes de compra (Compras · C2 + C3), sub-bloque 3 — UI.
//
// Solo lectura + navegación para el ciclo C2 (crear/editar/emitir/aprobar/
// anular viven en la ficha del proyecto, OrdenesCompraProyecto — aquí se
// SURFACEA, no se reinventa). La COMPRA (C3, Marcela) sí opera IN SITU en
// esta bandeja: es su cola de trabajo, no la del proyecto. Protegida por
// ROLES_VEN_OC en App.tsx; las acciones de compra además por
// puedeGestionarComprasUI.
import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs, doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import { useAuth } from '../../contexts/AuthContext'
import { toast } from '../../components/shared/Toast'
import Modal from '../../components/shared/Modal'
import InputExpresion from '../../components/sigp/cotizaciones/InputExpresion'
import { fmtMoney } from '../../utils/sigp/formato'
import { puedeGestionarComprasUI } from '../../types/sigp/permisos'
import { ESTADO_OC_LABEL, ESTADO_OC_COLOR, validarOcParaComprar } from '../../types/sigp/ordenCompra'
import type { OrdenCompra, EstadoOrdenCompra } from '../../types/sigp/ordenCompra'

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

const PILLS: { clave: Seccion; etiqueta: string }[] = [
  { clave: 'borrador', etiqueta: 'Borradores' },
  { clave: 'emitida', etiqueta: 'Por aprobar' },
  { clave: 'aprobada', etiqueta: 'Por comprar' },
  { clave: 'comprada', etiqueta: 'Compradas' },
  { clave: 'anulada', etiqueta: 'Anuladas' },
  { clave: 'todas', etiqueta: 'Todas' },
]

export default function OrdenesCompraSigp() {
  const { user } = useAuth()
  const puedeComprar = puedeGestionarComprasUI(user?.rol)
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [aplicandoId, setAplicandoId] = useState<string | null>(null)
  // Default: "Por aprobar" — es la cola de trabajo del aprobador.
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
    setComprarTarget(oc)
    setValorReal(oc.valor_total)
    setSoporteCompra(null)
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
          de: 'aprobada', a: 'comprada', por: user?.uid ?? '', fecha: ahora,
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
      <div>
        <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">SIGP · Compras · C2/C3</p>
        <h1 className="text-2xl font-bold text-gray-800">Órdenes de compra</h1>
        <p className="text-sm text-gray-500">
          Crear, editar, emitir, aprobar y anular se hacen desde la ficha del proyecto. La
          <b> compra</b> (valor real pagado + soporte) se registra aquí — es la cola de trabajo de
          quien gestiona compras.
        </p>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {PILLS.map(p => (
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
              {puedeComprar && <th className="py-3 px-4 font-semibold">Acción</th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={puedeComprar ? 7 : 6} className="py-10 text-center text-gray-400">Cargando…</td></tr>
            )}
            {!loading && filtradas.length === 0 && (
              <tr><td colSpan={puedeComprar ? 7 : 6} className="py-12 text-center text-gray-400">
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
                {puedeComprar && (
                  <td className="py-3 px-4">
                    {oc.estado === 'aprobada' && (
                      <button onClick={() => abrirComprar(oc)} disabled={aplicandoId === oc.id}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50 disabled:opacity-50 whitespace-nowrap">
                        🛒 Comprar
                      </button>
                    )}
                    {oc.estado === 'comprada' && (
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

      {/* ── Modal: Comprar (C3) — aprobada → comprada ─────────────────── */}
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
