// Ficha de Proyecto (SIGP F2.1.a) — columna vertebral de Ejecución.
// Muestra el snapshot pactado (copia de la versión aprobada), el estado y la
// línea de tiempo. Las áreas de asignación/preliquidación/ejecución son
// placeholders para F2.1.b/c/d.
import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/AuthContext'
import { useFeatureFlag } from '../../hooks/useFeatureFlag'
import { puedeGestionarProyectosUI, puedeAprobarPreliquidacionUI } from '../../types/sigp/permisos'
import AsignacionContratista from '../../components/sigp/proyectos/AsignacionContratista'
import PermisosIngreso from '../../components/sigp/proyectos/PermisosIngreso'
import PreliquidacionProyecto from '../../components/sigp/proyectos/PreliquidacionProyecto'
import EjecucionProyecto from '../../components/sigp/proyectos/EjecucionProyecto'
import EntregablesIhs from '../../components/sigp/proyectos/EntregablesIhs'
import EvaluacionContratistaCard from '../../components/sigp/proyectos/EvaluacionContratistaCard'
import SatisfaccionClienteCard from '../../components/sigp/proyectos/SatisfaccionClienteCard'
import { toast } from '../../components/shared/Toast'
import { fmtMoney, etiquetaVersion } from '../../utils/sigp/formato'
import { sincronizarObraEspejo } from '../../utils/sigp/obraEspejo'
import { ESTADOS_PROYECTO, ESTADO_PRY_LABEL, ESTADO_PRY_COLOR, ESTADO_INICIO_ADMINISTRATIVA } from '../../types/sigp/proyecto'
import { TIPO_INVERSION_LABEL, TIPO_INVERSION_COLOR } from '../../types/sigp/cotizacion'
import type { Proyecto } from '../../types/sigp/proyecto'

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) ?? '—'

export default function ProyectoDetalleSigp() {
  const { proyectoId } = useParams<{ proyectoId: string }>()
  const { user } = useAuth()
  const f2Enabled = useFeatureFlag('sigp_f2_enabled', false)
  const puedeGestionar = puedeGestionarProyectosUI(user?.rol)
  const puedeAprobar = puedeAprobarPreliquidacionUI(user?.rol)
  const [proyecto, setProyecto] = useState<Proyecto | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!proyectoId) return
    setLoading(true)
    try {
      const snap = await getDoc(doc(db, 'proyectos', proyectoId))
      setProyecto(snap.exists() ? ({ id: snap.id, ...snap.data() } as Proyecto) : null)
    } catch {
      toast('Error al cargar el proyecto', 'error')
    } finally {
      setLoading(false)
    }
  }, [proyectoId])

  useEffect(() => { if (f2Enabled) load() }, [f2Enabled, load])

  if (!f2Enabled) {
    return <div className="max-w-5xl mx-auto py-16 text-center text-sm text-gray-500">El módulo de Proyectos aún no está habilitado.</div>
  }
  if (loading) {
    return <div className="max-w-5xl mx-auto py-16 text-center text-sm text-gray-400">Cargando…</div>
  }
  if (!proyecto) {
    return (
      <div className="max-w-5xl mx-auto py-16 text-center space-y-2">
        <p className="text-sm text-gray-500">Proyecto no encontrado.</p>
        <Link to="/sigp/proyectos" className="text-sm text-brand-700 hover:underline">← Volver a Proyectos</Link>
      </div>
    )
  }

  const s = proyecto.snapshot
  const idxEstado = ESTADOS_PROYECTO.indexOf(proyecto.estado)

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-16">
      <Link to="/sigp/proyectos" className="text-sm text-gray-500 hover:text-brand-700 inline-flex items-center gap-1">← Proyectos</Link>

      {/* Encabezado */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-800 font-mono">{proyecto.consecutivo}</h1>
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${ESTADO_PRY_COLOR[proyecto.estado]}`}>
          {ESTADO_PRY_LABEL[proyecto.estado]}
        </span>
        {s.tipo_inversion && (
          <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-semibold ${TIPO_INVERSION_COLOR[s.tipo_inversion]}`}>
            {TIPO_INVERSION_LABEL[s.tipo_inversion]}
          </span>
        )}
        {/* Bloque D — reintento del espejo SST (upsert idempotente: no duplica) */}
        {puedeGestionar && idxEstado >= ESTADOS_PROYECTO.indexOf('en_ejecucion') && (
          <button
            onClick={async () => {
              const ok = await sincronizarObraEspejo(proyecto)
              toast(ok ? 'Obra SST sincronizada' : 'No se pudo sincronizar la obra SST', ok ? undefined : 'error')
            }}
            title="Crea o actualiza la obra-espejo del panel SST (idempotente: reintentar no duplica)"
            className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium">
            🏗 Sincronizar obra SST
          </button>
        )}
        {proyecto.origen === 'preventivo' ? (
          <Link to={`/sigp/solicitudes/${proyecto.solicitud_id}`}
            className="ml-auto text-xs px-2.5 py-1 rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 font-medium">
            🛠 Origen: preventivo {proyecto.solicitud_consecutivo}
          </Link>
        ) : (
          <Link to={`/sigp/cotizaciones/${proyecto.cotizacion_id}`}
            className="ml-auto text-xs px-2.5 py-1 rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 font-medium">
            📄 Origen: {proyecto.cotizacion_consecutivo}{etiquetaVersion(proyecto.cotizacion_version ?? 1) ? ` ${etiquetaVersion(proyecto.cotizacion_version ?? 1)}` : ''}
          </Link>
        )}
      </div>

      {/* Progreso del ciclo de vida */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Ciclo de vida</p>
        <div className="flex flex-wrap gap-1.5">
          {ESTADOS_PROYECTO.map((e, i) => {
            const deAdministrativa = i >= ESTADOS_PROYECTO.indexOf(ESTADO_INICIO_ADMINISTRATIVA)
            return (
              <span key={e}
                title={deAdministrativa ? 'Gerencia Administrativa (módulo futuro)' : undefined}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  i < idxEstado ? 'bg-brand-50 text-brand-700'
                  : i === idxEstado ? ESTADO_PRY_COLOR[e] + ' ring-1 ring-brand-400'
                  : 'bg-gray-50 text-gray-300'
                } ${deAdministrativa ? 'border border-dashed border-gray-200' : ''}`}>
                {ESTADO_PRY_LABEL[e]}
              </span>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          Desde «Facturado» el proyecto pasa a Gerencia Administrativa (módulo futuro): factura, pago del cliente y saldo del contratista.
        </p>
      </div>

      {/* Snapshot pactado */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Lo pactado <span className="normal-case font-normal">
            {proyecto.origen === 'preventivo'
              ? `(precio de matriz IHS · ${proyecto.solicitud_consecutivo})`
              : `(copia de ${proyecto.cotizacion_consecutivo}${etiquetaVersion(proyecto.cotizacion_version ?? 1) ? ` ${etiquetaVersion(proyecto.cotizacion_version ?? 1)}` : ''} aprobada)`}
          </span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400">Sitio</p>
            <p className="font-semibold text-gray-800">{s.nombre_sitio || '—'}</p>
            {s.codigo_sitio_cliente && <p className="text-xs text-gray-500 font-mono">{s.codigo_sitio_cliente}</p>}
          </div>
          <div>
            <p className="text-xs text-gray-400">Cliente</p>
            <p className="font-semibold text-gray-800">{s.cliente}</p>
            {s.cliente_nit && <p className="text-xs text-gray-500">NIT {s.cliente_nit}</p>}
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-gray-400">Asunto</p>
            <p className="text-gray-700">{s.asunto || '—'}</p>
            {s.contacto && <p className="text-xs text-gray-500">Contacto: {s.contacto}</p>}
          </div>
          <div>
            <p className="text-xs text-gray-400">Valor de venta</p>
            <p className="font-mono font-bold text-gray-800">{fmtMoney(s.valor_venta)}</p>
            <p className="text-xs text-gray-500">{s.esquema_tributario === 'aiu' ? 'AIU' : 'IVA pleno'}</p>
          </div>
        </div>

        {s.alcance.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-1.5">Alcance ({s.total_items} ítem{s.total_items === 1 ? '' : 's'})</p>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="py-1.5 pr-4 font-medium">Grupo</th>
                  <th className="py-1.5 pr-4 font-medium text-center">Ítems</th>
                  <th className="py-1.5 font-medium text-right">Subtotal (antes de impuestos)</th>
                </tr>
              </thead>
              <tbody>
                {s.alcance.map(g => (
                  <tr key={g.grupo} className="border-b border-gray-50">
                    <td className="py-1.5 pr-4 text-gray-700">{g.grupo}</td>
                    <td className="py-1.5 pr-4 text-center text-gray-500">{g.items}</td>
                    <td className="py-1.5 text-right font-mono text-gray-700">{fmtMoney(g.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Asignación y permisos (F2.1.b) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <AsignacionContratista proyecto={proyecto} puedeGestionar={puedeGestionar} reload={load} />
        <PermisosIngreso proyecto={proyecto} puedeGestionar={puedeGestionar} reload={load} />
      </div>

      {/* Preliquidación (F2.1.c) */}
      <PreliquidacionProyecto proyecto={proyecto} puedeGestionar={puedeGestionar} puedeAprobar={puedeAprobar} reload={load} />

      {/* Entregables IHS (F2.3 — solo preventivos; requisito de la entrega) */}
      <EntregablesIhs proyecto={proyecto} puedeGestionar={puedeGestionar} reload={load} />

      {/* Ejecución → entrega → soporte → handoff (F2.1.d) */}
      <EjecucionProyecto proyecto={proyecto} puedeGestionar={puedeGestionar} reload={load} />

      {/* Administrativa B1 — factura registrada (lectura; se gestiona en
          Facturación y Pagos) */}
      {proyecto.facturacion && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-1.5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Factura <span className="normal-case font-normal">(registrada por Gerencia Administrativa)</span>
          </p>
          <p className="text-sm text-gray-800">
            <span className="font-mono font-semibold">{proyecto.facturacion.numero}</span>
            <span className="text-gray-500"> · emitida el {fFecha(proyecto.facturacion.fecha)} · </span>
            <span className="font-mono">{fmtMoney(proyecto.facturacion.valor)}</span>
          </p>
          {proyecto.facturacion.cufe && (
            <p className="text-[11px] text-gray-400 font-mono break-all">CUFE: {proyecto.facturacion.cufe}</p>
          )}
          {proyecto.facturacion.adjunto_url && (
            <a href={proyecto.facturacion.adjunto_url} target="_blank" rel="noreferrer"
              className="text-xs text-brand-700 underline underline-offset-2">
              📎 {proyecto.facturacion.adjunto_nombre ?? 'PDF de la factura'}
            </a>
          )}
        </div>
      )}

      {/* Evaluación del contratista (F2.1.d) + satisfacción del cliente (ISO 4) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <EvaluacionContratistaCard proyecto={proyecto} puedeGestionar={puedeGestionar} reload={load} />
        <SatisfaccionClienteCard proyecto={proyecto} puedeGestionar={puedeGestionar} reload={load} />
      </div>

      {/* Línea de tiempo */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Línea de tiempo</p>
        <ol className="space-y-2.5">
          {[...(proyecto.historial ?? [])].reverse().map((h, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <span className="mt-1.5 w-2 h-2 rounded-full bg-brand-600 flex-shrink-0" />
              <div>
                <p className="text-gray-700">
                  {h.de ? <>{ESTADO_PRY_LABEL[h.de]} → <span className="font-semibold">{ESTADO_PRY_LABEL[h.a]}</span></>
                    : <span className="font-semibold">{ESTADO_PRY_LABEL[h.a]}</span>}
                </p>
                {h.motivo && <p className="text-xs text-gray-500">{h.motivo}</p>}
                <p className="text-[11px] text-gray-400">{fFecha(h.fecha)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
