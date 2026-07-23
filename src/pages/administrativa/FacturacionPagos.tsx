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
import LiquidacionModal from '../../components/administrativa/LiquidacionModal'
import {
  ESTADOS_PROYECTO, ESTADO_PRY_LABEL, ESTADO_PRY_COLOR,
  SECCIONES_ADMINISTRATIVA, enBandejaAdministrativa,
  enCaminoAdministrativa, ETIQUETA_EN_CAMINO, narrativaAdministrativa,
  enColaVerificacionSst, estadoSstGate, sstGateAlDia, SST_GATE_LABEL, SST_GATE_COLOR,
  completitudCierre, pagoClientePendiente, puedeCerrarseProyecto,
  MEDIOS_PAGO, MEDIO_PAGO_LABEL,
} from '../../types/sigp/proyecto'
import { puedeRegistrarFacturaUI, puedeLiquidarUI, puedeCerrarProyectoUI, puedeAprobarPreliquidacionUI } from '../../types/sigp/permisos'
import type { Proyecto, MedioPago } from '../../types/sigp/proyecto'
import type { VerificacionSst } from '../../types/sigp/verificacionSst'

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

export default function FacturacionPagos() {
  const { user } = useAuth()
  const puedeRegistrar = puedeRegistrarFacturaUI(user?.rol)
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  // Bloque 3a: gate SST por proyecto, leído de la proyección verificaciones_sst
  const [gates, setGates] = useState<Record<string, VerificacionSst>>({})
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
  // B2 — registro del pago del cliente
  const [pagoTarget, setPagoTarget] = useState<Proyecto | null>(null)
  const [pagoFecha, setPagoFecha] = useState('')
  const [pagoValor, setPagoValor] = useState<number | undefined>(undefined)
  const [pagoMedio, setPagoMedio] = useState<MedioPago>('transferencia')
  const [pagoComprobante, setPagoComprobante] = useState<File | null>(null)
  // B3b — liquidación del contratista
  const puedeLiquidar = puedeLiquidarUI(user?.rol)
  const [liquidacionTarget, setLiquidacionTarget] = useState<Proyecto | null>(null)
  // Bloque final — cierre del proyecto
  const puedeCerrar = puedeCerrarProyectoUI(user?.rol)
  // Bandeja completa: 'todas' (activas) o una de las 7 secciones del ciclo
  const [seccion, setSeccion] = useState<'todas' | 'en_camino' | (typeof SECCIONES_ADMINISTRATIVA)[number]['clave']>('todas')
  const [cierreTarget, setCierreTarget] = useState<Proyecto | null>(null)
  const [notasCierre, setNotasCierre] = useState('')

  const cerrarProyecto = async () => {
    // INTEGRIDAD (anticipada, 23-jul): no se cierra con cuenta por cobrar
    // abierta — la regla de Firestore también lo exige.
    if (!cierreTarget || !puedeCerrarseProyecto(cierreTarget)) return
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      await updateDoc(doc(db, 'proyectos', cierreTarget.id), {
        cierre: {
          fecha: ahora, cerrado_por: user?.uid ?? '',
          ...(notasCierre.trim() ? { notas: notasCierre.trim() } : {}),
        },
        estado: 'cerrado',
        fecha_actualizacion: ahora,
        historial: arrayUnion({
          de: 'liquidado_contratista', a: 'cerrado', por: user?.uid ?? '', fecha: ahora,
          motivo: 'Cierre formal del proyecto — ciclo administrativo completo (factura · pago · gate SST · liquidación)' +
            (notasCierre.trim() ? ` · Notas: ${notasCierre.trim()}` : ''),
        }),
      })
      toast('Proyecto cerrado — pasa al histórico')
      setCierreTarget(null)
      setNotasCierre('')
      await load()
    } catch {
      toast('Error al cerrar el proyecto', 'error')
    } finally { setAplicando(false) }
  }

  /** PDF de liquidación (documento para el contratista) — desde el registro. */
  const descargarPdfLiquidacion = async (p: Proyecto) => {
    const liq = p.liquidacion
    if (!liq) return
    setAplicando(true)
    try {
      const { cargarAssetsPdf, generarPdfLiquidacion } = await import('../../utils/sigp/liquidacionPdf')
      const pdf = await generarPdfLiquidacion({
        proyectoConsecutivo: p.consecutivo,
        contratistaNombre: p.asignacion?.contratista_nombre ?? '—',
        clienteNombre: p.snapshot.nombre_sitio
          ? `${p.snapshot.cliente} — ${p.snapshot.nombre_sitio}` : p.snapshot.cliente,
        asunto: p.snapshot.asunto,
        fecha: liq.fecha.toDate(),
        gruposAlcance: p.snapshot.alcance.map(g => ({ nombre: g.grupo, items: g.items })),
        manoObra: liq.mano_obra,
        compras: liq.compras_reembolsos.map(c => ({ concepto: c.concepto, valor: c.valor })),
        retenciones: liq.retenciones,
        totalFinal: liq.total_final,
        anticipoGirado: liq.anticipo_girado,
        saldoFinal: liq.saldo_final,
        esIgual: liq.es_igual,
        diferencia: liq.diferencia,
        ajustesReconocidos: liq.ajustes_reconocidos,
        ...(liq.observaciones ? { observaciones: liq.observaciones } : {}),
        ...(liq.liquidacion_anticipada ? { anticipada: {
          justificacion: liq.justificacion_anticipada ?? '',
          acuerdoCon: liq.acuerdo_con ?? '—',
          acuerdoFecha: liq.acuerdo_fecha?.toDate() ?? liq.fecha.toDate(),
        } } : {}),
      }, await cargarAssetsPdf())
      const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${p.consecutivo} - Liquidación ${p.asignacion?.contratista_nombre ?? 'contratista'}.pdf`.replace(/[\\/:*?"<>|]/g, '')
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (e) {
      console.error('Error generando la liquidación:', e)
      toast('No se pudo generar el documento', 'error')
    } finally { setAplicando(false) }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'proyectos'))
      const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Proyecto)
      // Defensivo: un doc malformado (sin snapshot) no debe tumbar la bandeja.
      // Mapa proactivo (23-jul): además de los 7 momentos de acción, se cargan
      // los proyectos EN CAMINO (preparación/ejecución) como sección
      // informativa — el panel narra TODO el pipeline.
      setProyectos(todos.filter(p => p.snapshot &&
        (enBandejaAdministrativa(p.estado) || enCaminoAdministrativa(p.estado))))
      // Chip del gate SST (solo lectura — el gate lo marca SST en su cola)
      const gatesSnap = await getDocs(collection(db, 'verificaciones_sst'))
      setGates(Object.fromEntries(gatesSnap.docs.map(d => [d.id, d.data() as VerificacionSst])))
    } catch {
      toast('Error al cargar la bandeja', 'error')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    // 'todas' = el ciclo activo (los cerrados solo en su sección/histórico).
    // "Por cobrar" usa PREDICADO, no estado: incluye el liquidado ANTICIPADO
    // cuyo pago sigue pendiente (23-jul).
    const estadoSeccion = SECCIONES_ADMINISTRATIVA.find(s => s.clave === seccion)?.estado
    const base = proyectos.filter(p =>
      seccion === 'por_cobrar' ? pagoClientePendiente(p)
      : seccion === 'en_camino' ? enCaminoAdministrativa(p.estado)
      : estadoSeccion ? p.estado === estadoSeccion
      : p.estado !== 'cerrado')
    const lista = q
      ? base.filter(p =>
          p.consecutivo.toLowerCase().includes(q) ||
          p.snapshot.cliente.toLowerCase().includes(q) ||
          (p.snapshot.nombre_sitio ?? '').toLowerCase().includes(q) ||
          (p.snapshot.codigo_sitio_cliente ?? '').toLowerCase().includes(q) ||
          p.snapshot.asunto.toLowerCase().includes(q) ||
          (p.facturacion?.numero ?? '').toLowerCase().includes(q))
      : base
    // por facturar primero; luego por avance del ciclo
    return [...lista].sort((a, b) =>
      ESTADOS_PROYECTO.indexOf(a.estado) - ESTADOS_PROYECTO.indexOf(b.estado))
  }, [proyectos, busqueda, seccion])

  const conteo = useMemo(() => Object.fromEntries(
    SECCIONES_ADMINISTRATIVA.map(s => [s.clave, proyectos.filter(p =>
      s.clave === 'por_cobrar' ? pagoClientePendiente(p) : p.estado === s.estado).length]),
  ) as Record<string, number>, [proyectos])
  const enCamino = useMemo(() => proyectos.filter(p => enCaminoAdministrativa(p.estado)).length, [proyectos])

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

  // ── B2 — pago del cliente (el dinero se mueve en bancos; aquí se REGISTRA) ──
  const abrirPago = (p: Proyecto) => {
    setPagoTarget(p)
    setPagoFecha(new Date().toISOString().slice(0, 10))
    setPagoValor(p.facturacion?.valor ?? p.snapshot.valor_venta)   // prellenado con lo facturado
    setPagoMedio('transferencia')
    setPagoComprobante(null)
  }

  const registrarPago = async () => {
    if (!pagoTarget || !pagoFecha || pagoValor === undefined || pagoValor <= 0) return
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      let comprobanteData = {}
      if (pagoComprobante) {
        const nombre = `${Date.now()}_${pagoComprobante.name}`
        const snap = await uploadBytes(ref(storage, `proyectos/${pagoTarget.id}/pago/${nombre}`), pagoComprobante)
        comprobanteData = { comprobante_url: await getDownloadURL(snap.ref), comprobante_nombre: pagoComprobante.name }
      }
      // Cobro POSTERIOR a una liquidación anticipada: llena pago_cliente SIN
      // cambiar el estado (ya avanzó a liquidado_contratista) — y con eso el
      // cierre queda desbloqueado.
      const posterior = pagoTarget.estado === 'liquidado_contratista'
      await updateDoc(doc(db, 'proyectos', pagoTarget.id), {
        pago_cliente: {
          fecha: Timestamp.fromDate(new Date(pagoFecha + 'T12:00:00')),
          valor: pagoValor,
          medio: pagoMedio,
          ...comprobanteData,
          registrado_por: user?.uid ?? '',
          fecha_registro: ahora,
        },
        ...(posterior ? {} : { estado: 'pagado_cliente' }),
        fecha_actualizacion: ahora,
        historial: arrayUnion({
          de: pagoTarget.estado, a: posterior ? pagoTarget.estado : 'pagado_cliente', por: user?.uid ?? '', fecha: ahora,
          motivo: `Pago del cliente registrado — ${fmtMoney(pagoValor)} por ${MEDIO_PAGO_LABEL[pagoMedio].toLowerCase()}` +
            (posterior ? ' (posterior a la liquidación anticipada — cierra la cuenta por cobrar; el estado se mantiene)' : ''),
        }),
      })
      toast(posterior ? 'Cobro registrado — el proyecto ya puede cerrarse' : 'Pago del cliente registrado — proyecto pagado')
      setPagoTarget(null)
      await load()
    } catch {
      toast('Error al registrar el pago (verifica tu rol)', 'error')
    } finally { setAplicando(false) }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        {/* Saludo personalizado (23-jul): primer nombre del perfil; sin
            nombre real, saludo neutro — jamás rompe. OJO: AuthContext hace
            fallback nombre=email cuando el perfil no lo trae — un '@' no es
            un nombre. */}
        <h1 className="text-2xl font-bold text-gray-800">
          {user?.nombre?.trim() && !user.nombre.includes('@')
            ? `Hola, ${user.nombre.trim().split(/\s+/)[0]} 👋`
            : 'Hola 👋'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Aquí tienes tu ciclo completo en un solo lugar: aprobar preliquidaciones, registrar
          anticipos, recibir los soportes y dar luz verde a la facturación, registrar el cobro
          del cliente, liquidar al contratista y cerrar. La factura la haces en Siigo; el SIGP
          te va guiando etapa por etapa y deja la trazabilidad.
        </p>
      </div>

      {/* Resumen NARRATIVO: qué hay por hacer ahora y qué viene */}
      {!loading && (
        <p className="text-sm text-gray-700 bg-brand-50/60 border border-brand-100 rounded-lg px-3 py-2">
          {narrativaAdministrativa(conteo, enCamino)}
        </p>
      )}

      {/* Las 7 secciones del ciclo, con contador. 'Todo el ciclo' = todo lo
          vivo (acción + en camino); 'En camino' = informativa. */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setSeccion('todas')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border ${seccion === 'todas' ? 'bg-brand-700 border-brand-700 text-white' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          Todo el ciclo ({proyectos.filter(p => p.estado !== 'cerrado').length})
        </button>
        {SECCIONES_ADMINISTRATIVA.map(s => (
          <button key={s.clave} onClick={() => setSeccion(s.clave)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${seccion === s.clave ? 'bg-brand-700 border-brand-700 text-white' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'} ${conteo[s.clave] === 0 ? 'opacity-60' : ''}`}>
            {s.etiqueta} ({conteo[s.clave]})
          </button>
        ))}
        <button onClick={() => setSeccion('en_camino')}
          title="Proyectos en preparación/ejecución — informativa, aún no le tocan a Gerencia Administrativa"
          className={`px-3 py-1.5 rounded-full text-xs font-medium border border-dashed ${seccion === 'en_camino' ? 'bg-gray-700 border-gray-700 text-white' : 'bg-white border-gray-400 text-gray-500 hover:bg-gray-50'} ${enCamino === 0 ? 'opacity-60' : ''}`}>
          En camino ({enCamino})
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por PRY, sitio, código, cliente o N° de factura…"
          className="flex-1 min-w-[260px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
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
              <th className="py-3 px-4 font-semibold">Pago</th>
              <th className="py-3 px-4 font-semibold">Estado</th>
              <th className="py-3 px-4 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="py-10 text-center text-gray-400">Cargando…</td></tr>
            )}
            {!loading && filtrados.length === 0 && (
              <tr><td colSpan={8} className="py-12 text-center text-gray-400">
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
                  {p.pago_cliente ? (
                    <span className="text-xs text-gray-700">
                      <span className="font-mono">{fmtMoney(p.pago_cliente.valor)}</span>
                      <span className="text-gray-400"> · {MEDIO_PAGO_LABEL[p.pago_cliente.medio]} · {fFecha(p.pago_cliente.fecha)}</span>
                      {p.pago_cliente.comprobante_url && (
                        <a href={p.pago_cliente.comprobante_url} target="_blank" rel="noreferrer"
                          className="ml-1.5 text-brand-700 underline underline-offset-2">PDF</a>
                      )}
                    </span>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="py-3 px-4">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${ESTADO_PRY_COLOR[p.estado]}`}>
                    {ESTADO_PRY_LABEL[p.estado]}
                  </span>
                  {/* Bloque 3a: estado del gate SST — SOLO LECTURA para gerencia,
                      leído de la proyección verificaciones_sst (el gate lo marca
                      SST en /verificacion-contratistas); sin 'al_dia' la
                      liquidación queda bloqueada (Bloque 3b). */}
                  {enColaVerificacionSst(p.estado) && (
                    <span
                      className={`block w-fit mt-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${SST_GATE_COLOR[estadoSstGate(gates[p.id] ?? {})]}`}
                      title={gates[p.id]?.sst_gate?.observacion
                        ? `Gate SST — observación: ${gates[p.id].sst_gate!.observacion}`
                        : 'Gate SST: verificación del contratista, previa a la liquidación'}>
                      {SST_GATE_LABEL[estadoSstGate(gates[p.id] ?? {})]}
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-right">
                  {/* Las acciones de preliquidación YA existen en la ficha del
                      proyecto (F2.1.c) — aquí se SURFACEAN con enlace directo,
                      no se reinventan. */}
                  {(p.estado === 'preliquidacion_definida' || p.estado === 'preliquidacion_aprobada') && puedeAprobarPreliquidacionUI(user?.rol) ? (
                    <Link to={`/sigp/proyectos/${p.id}`}
                      className="inline-block text-xs px-3 py-1.5 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50">
                      {p.estado === 'preliquidacion_definida' ? '✓ Aprobar preliquidación →' : '💸 Registrar anticipo →'}
                    </Link>
                  ) : p.estado === 'enviado_a_facturacion' && puedeRegistrar ? (
                    <button onClick={() => abrirRegistro(p)}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50">
                      🧾 Registrar factura
                    </button>
                  ) : p.estado === 'facturado' && puedeRegistrar ? (
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => abrirPago(p)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                        💰 Registrar pago del cliente
                      </button>
                      {/* Anticipada (23-jul): pagar al contratista ANTES de
                          cobrar, por acuerdo — gate SST innegociable */}
                      {puedeLiquidar && (
                        <button onClick={() => setLiquidacionTarget(p)}
                          disabled={!sstGateAlDia(gates[p.id] ?? {})}
                          title={sstGateAlDia(gates[p.id] ?? {})
                            ? 'Liquidar al contratista ANTES del pago del cliente (requiere acuerdo con Gerencia de Proyectos)'
                            : 'Bloqueada: falta el aval de SST (gate al día)'}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed">
                          ⏩ Liquidar anticipado
                        </button>
                      )}
                    </div>
                  ) : p.estado === 'pagado_cliente' && puedeLiquidar ? (
                    // 3b — liquidar exige el gate SST al día (la regla también);
                    // sin aval el botón lo dice y el modal explica la novedad.
                    <button onClick={() => setLiquidacionTarget(p)}
                      disabled={!sstGateAlDia(gates[p.id] ?? {})}
                      title={sstGateAlDia(gates[p.id] ?? {}) ? undefined : 'Bloqueada: falta el aval de SST (gate al día)'}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50 disabled:opacity-40 disabled:cursor-not-allowed">
                      🧮 Liquidar contratista
                    </button>
                  ) : p.estado === 'liquidado_contratista' || p.estado === 'cerrado' ? (
                    <div className="flex items-center justify-end gap-2">
                      {p.liquidacion && (
                        <button onClick={() => descargarPdfLiquidacion(p)} disabled={aplicando}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50">
                          📄 Liquidación
                        </button>
                      )}
                      {/* Anticipada: el cobro pendiente se registra DESPUÉS
                          (llena pago_cliente sin cambiar el estado) */}
                      {p.estado === 'liquidado_contratista' && !p.pago_cliente && puedeRegistrar && (
                        <button onClick={() => abrirPago(p)}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                          💰 Registrar cobro pendiente
                        </button>
                      )}
                      {/* Bloque final: cerrar solo desde liquidado CON el pago
                          registrado (no se cierra con cuenta por cobrar
                          abierta); un cerrado es SOLO LECTURA */}
                      {p.estado === 'liquidado_contratista' && puedeCerrar && (
                        <button onClick={() => { setCierreTarget(p); setNotasCierre('') }}
                          disabled={!puedeCerrarseProyecto(p)}
                          title={puedeCerrarseProyecto(p) ? undefined : 'Bloqueado: el pago del cliente sigue pendiente (liquidación anticipada) — regístralo primero'}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50 disabled:opacity-40 disabled:cursor-not-allowed">
                          🏁 Cerrar proyecto
                        </button>
                      )}
                    </div>
                  ) : enCaminoAdministrativa(p.estado) ? (
                    // Mapa proactivo: etapa clara de lo que AÚN no le toca
                    <span className="text-[11px] text-gray-500 italic">
                      {ETIQUETA_EN_CAMINO[p.estado as keyof typeof ETIQUETA_EN_CAMINO]}
                    </span>
                  ) : (
                    // cerrado/liquidado ya salieron en la rama anterior — esto
                    // es el resto del ciclo visto por roles de solo lectura
                    <span className="text-[11px] text-gray-400">Pendiente de Gerencia Adm.</span>
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

      {/* B2 — Modal de pago del cliente (se REGISTRA; el dinero se mueve en bancos) */}
      <Modal
        isOpen={pagoTarget !== null}
        title={`Registrar pago del cliente — ${pagoTarget?.consecutivo ?? ''}`}
        onClose={() => setPagoTarget(null)}
        actions={[
          { label: 'Cancelar', onClick: () => setPagoTarget(null), variant: 'secondary' },
          {
            label: aplicando ? 'Registrando…' : 'Registrar y marcar pagado',
            onClick: registrarPago, variant: 'primary', loading: aplicando,
          },
        ]}
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            {pagoTarget?.snapshot.nombre_sitio || pagoTarget?.snapshot.asunto} · {pagoTarget?.snapshot.cliente} ·
            facturado <span className="font-mono">{fmtMoney(pagoTarget?.facturacion?.valor ?? 0)}</span>
            {pagoTarget?.facturacion?.numero && <span className="font-mono"> ({pagoTarget.facturacion.numero})</span>}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-gray-500">
              Fecha del pago <span className="text-red-500">*</span>
              <input type="date" value={pagoFecha} onChange={e => setPagoFecha(e.target.value)}
                className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
            <label className="text-xs text-gray-500">
              Medio de pago <span className="text-red-500">*</span>
              <select value={pagoMedio} onChange={e => setPagoMedio(e.target.value as MedioPago)}
                className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
                {MEDIOS_PAGO.map(m => <option key={m} value={m}>{MEDIO_PAGO_LABEL[m]}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-xs text-gray-500">
            Valor recibido <span className="text-red-500">*</span>
            <InputExpresion valor={pagoValor} onValor={setPagoValor}
              className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
          {pagoValor !== undefined && pagoTarget?.facturacion && pagoValor !== pagoTarget.facturacion.valor && (
            <p className="text-xs text-amber-800 bg-amber-50 rounded px-2 py-1.5">
              ⚠ El valor recibido difiere del facturado ({fmtMoney(pagoTarget.facturacion.valor)}) — verifica antes de
              registrar. (Pagos parciales/abonos: extensión futura si el área los confirma.)
            </p>
          )}
          <label className="block text-xs text-gray-500">
            Comprobante del pago (opcional)
            <input type="file" accept="application/pdf" onChange={e => setPagoComprobante(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
          </label>
        </div>
      </Modal>

      {/* Bloque final — cierre del proyecto con resumen de completitud */}
      <Modal
        isOpen={cierreTarget !== null}
        title={`Cerrar proyecto — ${cierreTarget?.consecutivo ?? ''}`}
        onClose={() => setCierreTarget(null)}
        actions={[
          { label: 'Cancelar', onClick: () => setCierreTarget(null), variant: 'secondary' },
          {
            label: aplicando ? 'Cerrando…'
              : cierreTarget && !puedeCerrarseProyecto(cierreTarget)
                ? 'Bloqueado: cobro del cliente pendiente'
                : 'Cerrar proyecto (queda de solo lectura)',
            onClick: cerrarProyecto, variant: 'primary', loading: aplicando,
          },
        ]}
      >
        {cierreTarget && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Cierre formal del ciclo. El resumen es <strong>informativo</strong> — un pendiente
              no bloquea el cierre, <strong>excepto el pago del cliente</strong>: no se cierra
              con cuenta por cobrar abierta.
            </p>
            {!puedeCerrarseProyecto(cierreTarget) && (
              <p className="text-xs text-red-700 bg-red-50 rounded px-2 py-1.5">
                ⛔ Este proyecto se liquidó ANTICIPADAMENTE y el cobro al cliente sigue
                pendiente — registra el pago (sección "Por cobrar") y vuelve a cerrar.
              </p>
            )}
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {completitudCierre(cierreTarget).map(item => (
                <div key={item.clave} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-gray-700">{item.etiqueta}</span>
                  {item.ok ? (
                    <span className="text-emerald-700 text-xs font-semibold">✓ capturada</span>
                  ) : (
                    <span className="text-amber-700 text-xs font-semibold">
                      pendiente
                      {item.clave === 'evaluacion_cliente' && (
                        <Link to={`/sigp/proyectos/${cierreTarget.id}`}
                          className="ml-2 text-brand-700 underline underline-offset-2 font-medium">
                          capturarla en la ficha →
                        </Link>
                      )}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <label className="block text-xs text-gray-500">
              Notas de cierre / lecciones aprendidas (opcional)
              <textarea value={notasCierre} onChange={e => setNotasCierre(e.target.value)} rows={3}
                placeholder="Ej: el soporte del cliente tardó 3 semanas — pactar fecha límite en la próxima OC…"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
          </div>
        )}
      </Modal>

      {/* B3b — liquidación del contratista (gate SST al día obligatorio) */}
      {liquidacionTarget && (
        <LiquidacionModal
          proyecto={liquidacionTarget}
          verificacion={gates[liquidacionTarget.id]}
          onClose={() => setLiquidacionTarget(null)}
          onDone={load}
        />
      )}
    </div>
  )
}
