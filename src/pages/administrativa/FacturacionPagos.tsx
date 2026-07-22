// Módulo Gerencia Administrativa · Bloque 1 — Facturación y Pagos.
//
// Continuación del handoff "enviado a facturación" (F2.1.d). Principio: el
// SIGP REGISTRA y controla — NO ejecuta dinero ni genera factura electrónica
// (eso vive en los sistemas externos del área). Bandeja de proyectos desde el
// handoff en adelante; registrar la factura dispara → 'facturado'.
//
// Roles: gerencia_administrativa OPERA; admin y gerencia_general VEN
// (lectura). Los gestores de proyectos no entran aquí (segregación).
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs, doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import { useAuth } from '../../contexts/AuthContext'
import { toast } from '../../components/shared/Toast'
import Modal from '../../components/shared/Modal'
import InputExpresion from '../../components/sigp/cotizaciones/InputExpresion'
import { fmtMoney } from '../../utils/sigp/formato'
import {
  ESTADOS_PROYECTO, ESTADO_PRY_LABEL, ESTADO_PRY_COLOR, enBandejaFacturacion,
} from '../../types/sigp/proyecto'
import { puedeRegistrarFacturaUI } from '../../types/sigp/permisos'
import type { Proyecto } from '../../types/sigp/proyecto'

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

export default function FacturacionPagos() {
  const { user } = useAuth()
  const puedeRegistrar = puedeRegistrarFacturaUI(user?.rol)
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  // registro de factura
  const [target, setTarget] = useState<Proyecto | null>(null)
  const [numero, setNumero] = useState('')
  const [fecha, setFecha] = useState('')
  const [valor, setValor] = useState<number | undefined>(undefined)
  const [cufe, setCufe] = useState('')
  const [adjunto, setAdjunto] = useState<File | null>(null)
  const [aplicando, setAplicando] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'proyectos'))
      const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Proyecto)
      // Defensivo: un doc malformado (sin snapshot) no debe tumbar la bandeja
      setProyectos(todos.filter(p => p.snapshot && enBandejaFacturacion(p.estado)))
    } catch {
      toast('Error al cargar la bandeja', 'error')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const lista = q
      ? proyectos.filter(p =>
          p.consecutivo.toLowerCase().includes(q) ||
          p.snapshot.cliente.toLowerCase().includes(q) ||
          (p.snapshot.nombre_sitio ?? '').toLowerCase().includes(q) ||
          (p.snapshot.codigo_sitio_cliente ?? '').toLowerCase().includes(q) ||
          p.snapshot.asunto.toLowerCase().includes(q) ||
          (p.facturacion?.numero ?? '').toLowerCase().includes(q))
      : proyectos
    // por facturar primero; luego por avance del ciclo
    return [...lista].sort((a, b) =>
      ESTADOS_PROYECTO.indexOf(a.estado) - ESTADOS_PROYECTO.indexOf(b.estado))
  }, [proyectos, busqueda])

  const porFacturar = proyectos.filter(p => p.estado === 'enviado_a_facturacion').length

  const abrirRegistro = (p: Proyecto) => {
    setTarget(p)
    setNumero('')
    setFecha(new Date().toISOString().slice(0, 10))
    setValor(p.snapshot.valor_venta)   // prellenado con lo pactado, editable
    setCufe('')
    setAdjunto(null)
  }

  const registrar = async () => {
    if (!target || !numero.trim() || !fecha || valor === undefined || valor <= 0) return
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      let adjuntoData = {}
      if (adjunto) {
        const nombre = `${Date.now()}_${adjunto.name}`
        const snap = await uploadBytes(ref(storage, `proyectos/${target.id}/factura/${nombre}`), adjunto)
        adjuntoData = { adjunto_url: await getDownloadURL(snap.ref), adjunto_nombre: adjunto.name }
      }
      await updateDoc(doc(db, 'proyectos', target.id), {
        facturacion: {
          numero: numero.trim(),
          fecha: Timestamp.fromDate(new Date(fecha + 'T12:00:00')),
          valor,
          ...(cufe.trim() ? { cufe: cufe.trim() } : {}),
          ...adjuntoData,
          registrado_por: user?.uid ?? '',
          fecha_registro: ahora,
        },
        estado: 'facturado',
        fecha_actualizacion: ahora,
        historial: arrayUnion({
          de: 'enviado_a_facturacion', a: 'facturado', por: user?.uid ?? '', fecha: ahora,
          motivo: `Factura registrada — N° ${numero.trim()} por ${fmtMoney(valor)}`,
        }),
      })
      toast(`Factura ${numero.trim()} registrada — proyecto facturado`)
      setTarget(null)
      await load()
    } catch {
      toast('Error al registrar la factura (verifica tu rol)', 'error')
    } finally { setAplicando(false) }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Facturación y Pagos</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Gerencia Administrativa — continuación del ciclo desde el handoff de Proyectos.
          El SIGP registra y controla; la factura se emite en el sistema contable externo.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por PRY, sitio, código, cliente o N° de factura…"
          className="flex-1 min-w-[260px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
        <span className="text-xs text-gray-500">
          <span className="font-semibold text-amber-700">{porFacturar}</span> por facturar · {proyectos.length} en el ciclo
        </span>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-3 px-4 font-semibold">Proyecto</th>
              <th className="py-3 px-4 font-semibold">Sitio</th>
              <th className="py-3 px-4 font-semibold">Cliente</th>
              <th className="py-3 px-4 font-semibold text-right">Valor pactado</th>
              <th className="py-3 px-4 font-semibold">Factura</th>
              <th className="py-3 px-4 font-semibold">Estado</th>
              <th className="py-3 px-4 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="py-10 text-center text-gray-400">Cargando…</td></tr>
            )}
            {!loading && filtrados.length === 0 && (
              <tr><td colSpan={7} className="py-12 text-center text-gray-400">
                No hay proyectos en el ciclo de facturación{busqueda ? ' con esa búsqueda' : ''}.
              </td></tr>
            )}
            {!loading && filtrados.map(p => (
              <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4">
                  <Link to={`/sigp/proyectos/${p.id}`} className="font-mono text-brand-700 font-semibold hover:underline">
                    {p.consecutivo}
                  </Link>
                </td>
                <td className="py-3 px-4">
                  <span className="font-medium text-gray-800">{p.snapshot.nombre_sitio || p.snapshot.asunto}</span>
                  {p.snapshot.codigo_sitio_cliente && p.snapshot.codigo_sitio_cliente !== 'N/A' && (
                    <span className="ml-1.5 text-[11px] font-mono text-gray-400">{p.snapshot.codigo_sitio_cliente}</span>
                  )}
                </td>
                <td className="py-3 px-4 text-gray-700">{p.snapshot.cliente}</td>
                <td className="py-3 px-4 text-right font-mono text-gray-700">{fmtMoney(p.snapshot.valor_venta)}</td>
                <td className="py-3 px-4">
                  {p.facturacion ? (
                    <span className="text-xs text-gray-700">
                      <span className="font-mono font-semibold">{p.facturacion.numero}</span>
                      <span className="text-gray-400"> · {fFecha(p.facturacion.fecha)} · {fmtMoney(p.facturacion.valor)}</span>
                      {p.facturacion.adjunto_url && (
                        <a href={p.facturacion.adjunto_url} target="_blank" rel="noreferrer"
                          className="ml-1.5 text-brand-700 underline underline-offset-2">PDF</a>
                      )}
                    </span>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="py-3 px-4">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${ESTADO_PRY_COLOR[p.estado]}`}>
                    {ESTADO_PRY_LABEL[p.estado]}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  {p.estado === 'enviado_a_facturacion' && puedeRegistrar ? (
                    <button onClick={() => abrirRegistro(p)}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50">
                      🧾 Registrar factura
                    </button>
                  ) : p.estado === 'enviado_a_facturacion' ? (
                    <span className="text-[11px] text-gray-400">Pendiente de Gerencia Adm.</span>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal de registro — la factura se REGISTRA (emitida en el sistema externo) */}
      <Modal
        isOpen={target !== null}
        title={`Registrar factura — ${target?.consecutivo ?? ''}`}
        onClose={() => setTarget(null)}
        actions={[
          { label: 'Cancelar', onClick: () => setTarget(null), variant: 'secondary' },
          {
            label: aplicando ? 'Registrando…' : 'Registrar y marcar facturado',
            onClick: registrar, variant: 'primary', loading: aplicando,
          },
        ]}
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            {target?.snapshot.nombre_sitio || target?.snapshot.asunto} · {target?.snapshot.cliente} ·
            pactado <span className="font-mono">{fmtMoney(target?.snapshot.valor_venta ?? 0)}</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-gray-500">
              Número de factura <span className="text-red-500">*</span>
              <input value={numero} onChange={e => setNumero(e.target.value)} placeholder="Ej: FE-1042"
                className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
            <label className="text-xs text-gray-500">
              Fecha de emisión <span className="text-red-500">*</span>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
          </div>
          <label className="block text-xs text-gray-500">
            Valor facturado <span className="text-red-500">*</span>
            <InputExpresion valor={valor} onValor={setValor}
              className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
          {valor !== undefined && target && valor !== target.snapshot.valor_venta && (
            <p className="text-xs text-amber-800 bg-amber-50 rounded px-2 py-1.5">
              ⚠ El valor facturado difiere del pactado ({fmtMoney(target.snapshot.valor_venta)}) — verifica antes de registrar.
            </p>
          )}
          <label className="block text-xs text-gray-500">
            CUFE (factura electrónica — opcional)
            <input value={cufe} onChange={e => setCufe(e.target.value)} placeholder="Código único de factura electrónica"
              className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
          <label className="block text-xs text-gray-500">
            PDF de la factura (opcional)
            <input type="file" accept="application/pdf" onChange={e => setAdjunto(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
          </label>
        </div>
      </Modal>
    </div>
  )
}
