// src/pages/sigp/ActividadesSigp.tsx
//
// La ÚNICA página de Actividades — internos y residente_obra comparten este
// componente (el residente entra vía ShellResidente, sin sidebar). Vista
// principal: "Pendientes para el acta" (pendienteParaActa). Estar en esa
// lista es NORMAL — lo que pasa el corte cae al acta del mes siguiente; lo
// que se vigila es la ANTIGÜEDAD: la que envejece sin aprobar/valorizar
// (umbral UMBRAL_PENDIENTE_ACTA_DIAS) es lo que hoy se pierde.
// Render defensivo ante docs malformados (patrón OrdenesCompraSigp): ningún
// campo faltante revienta la página.
import { useState, useEffect, useMemo } from 'react'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/AuthContext'
import { useActividades } from '../../hooks/sigp/useActividades'
import { useFirestore } from '../../hooks/useFirestore'
import { toast } from '../../components/shared/Toast'
import SelectField from '../../components/shared/SelectField'
import ActividadForm from '../../components/sigp/actividades/ActividadForm'
import ActividadDetalle from '../../components/sigp/actividades/ActividadDetalle'
import { fmtMoney } from '../../utils/sigp/formato'
import { accesoResidente, type Rol } from '../../types/sigp/roles'
import { puedeGestionarActividadesUI } from '../../types/sigp/permisos'
import {
  ESTADO_ACTIVIDAD_LABEL, ESTADO_ACTIVIDAD_COLOR, pendienteParaActa, estaValorizada,
  diasPendiente, UMBRAL_PENDIENTE_ACTA_DIAS,
} from '../../types/sigp/actividad'
import type { Actividad, EstadoActividad } from '../../types/sigp/actividad'
import type { Cliente } from '../../types/sigp/cliente'
import type { LPU } from '../../types/sigp/lpu'

type Pill = 'pendiente_acta' | 'todas' | EstadoActividad

const PILLS: { clave: Pill; etiqueta: string }[] = [
  { clave: 'pendiente_acta', etiqueta: 'Pendientes para el acta' },
  { clave: 'ejecutada', etiqueta: 'Ejecutadas s/aprobar' },
  { clave: 'aprobada', etiqueta: 'Aprobadas' },
  { clave: 'registrada', etiqueta: 'Registradas' },
  { clave: 'completa', etiqueta: 'Completas' },
  { clave: 'todas', etiqueta: 'Todas' },
  { clave: 'anulada', etiqueta: 'Anuladas' },
]

const fFecha = (a: Actividad) => {
  const t = a.fecha_solicitud ?? a.fecha_creacion
  return t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'
}

const fAntiguedad = (d: number) => (d === 0 ? 'hoy' : d === 1 ? 'hace 1 día' : `hace ${d} días`)

export default function ActividadesSigp() {
  const { user } = useAuth()
  const { getAll } = useFirestore()
  const { actividades, loading, error, reload, clienteIdResidente, cargarAnuladas } = useActividades()
  const esResidente = accesoResidente((user?.rol ?? '') as Rol)
  const puedeGestionar = puedeGestionarActividadesUI(user?.rol)

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clienteId, setClienteId] = useState('')
  const [cargandoClientes, setCargandoClientes] = useState(true)
  const [lpus, setLpus] = useState<LPU[]>([])

  const [pill, setPill] = useState<Pill>('pendiente_acta')
  const [busqueda, setBusqueda] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [detalle, setDetalle] = useState<Actividad | null>(null)

  // Clientes elegibles: interno → todos con usa_actividades + activo;
  // residente → SOLO el suyo (id resuelto por el hook desde users/{uid}).
  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargandoClientes(true)
      try {
        if (esResidente) {
          if (!clienteIdResidente) { if (vivo) setClientes([]); return }
          const snap = await getDoc(doc(db, 'clientes', clienteIdResidente))
          if (vivo) setClientes(snap.exists() ? [{ id: snap.id, ...snap.data() } as Cliente] : [])
        } else {
          const todos = (await getAll('clientes')) as Cliente[]
          if (vivo) setClientes(todos.filter(c => c.usa_actividades === true && c.estado === 'activo'))
        }
      } catch {
        if (vivo) toast('Error al cargar clientes', 'error')
      } finally {
        if (vivo) setCargandoClientes(false)
      }
    })()
    return () => { vivo = false }
  }, [esResidente, clienteIdResidente]) // eslint-disable-line react-hooks/exhaustive-deps

  // Preselección automática — pieza clave del registro en <1 minuto.
  useEffect(() => {
    if (clienteId) return
    if (clientes.length === 1) setClienteId(clientes[0].id)
  }, [clientes, clienteId])

  const cliente = useMemo(() => clientes.find(c => c.id === clienteId) ?? null, [clientes, clienteId])

  // LPUs del cliente activo (alimentan el buscador de líneas del form/detalle).
  useEffect(() => {
    let vivo = true
    if (!cliente) { setLpus([]); return }
    ;(async () => {
      try {
        const snap = await getDocs(query(collection(db, 'lpus'), where('cliente_id', '==', cliente.id)))
        if (vivo) setLpus(snap.docs.map(d => ({ id: d.id, ...d.data() }) as LPU))
      } catch {
        if (vivo) setLpus([])
      }
    })()
    return () => { vivo = false }
  }, [cliente?.id])

  // Sincroniza el detalle abierto con la última carga (tras aprobar/ejecutar/
  // anular/editar líneas — sin cerrar el modal en cada acción).
  useEffect(() => {
    if (!detalle) return
    const actual = actividades.find(a => a.id === detalle.id)
    if (actual) setDetalle(actual)
  }, [actividades]) // eslint-disable-line react-hooks/exhaustive-deps

  const irAAnuladas = () => { cargarAnuladas(); setPill('anulada') }

  const conteos = useMemo(() => {
    const c: Record<string, number> = {}
    for (const p of PILLS) {
      c[p.clave] = p.clave === 'pendiente_acta'
        ? actividades.filter(pendienteParaActa).length
        : p.clave === 'todas'
          ? actividades.filter(a => a.estado !== 'anulada').length
          : actividades.filter(a => a.estado === p.clave).length
    }
    return c
  }, [actividades])

  const porPill = useMemo(() => {
    switch (pill) {
      case 'pendiente_acta': return actividades.filter(pendienteParaActa)
      case 'todas': return actividades.filter(a => a.estado !== 'anulada')
      default: return actividades.filter(a => a.estado === pill)
    }
  }, [actividades, pill])

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return porPill
    return porPill.filter(a =>
      (a.descripcion ?? '').toLowerCase().includes(q) ||
      (a.referencia_cliente ?? '').toLowerCase().includes(q) ||
      (a.sede_nombre ?? '').toLowerCase().includes(q) ||
      (a.lineas ?? []).some(l => (l.codigo ?? '').toLowerCase().includes(q)))
  }, [porPill, busqueda])

  // Total pendiente de facturar — plata que va camino al acta, no "en riesgo":
  // estar en la lista es normal (encuadre corregido por Giovanny, 18-ago).
  const metricasPendientes = useMemo(() => {
    const valorizadas = porPill.filter(a => estaValorizada(a))
    const suma = valorizadas.reduce((s, a) => s + (a.total || 0), 0)
    const sinValorizar = porPill.length - valorizadas.length
    return { suma, sinValorizar }
  }, [porPill])

  // Reloj de la vista: una sola lectura por render (no por fila).
  const ahora = useMemo(() => new Date(), [actividades]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          {!esResidente && <div className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-600">SIGP · Actividades</div>}
          <h1 className="text-2xl font-bold text-gray-800">Actividades</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Operación por LPU{cliente ? ` · ${cliente.nombre}` : ''}
          </p>
        </div>
        {puedeGestionar && cliente && (
          <button onClick={() => setFormOpen(true)}
            className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Registrar actividad
          </button>
        )}
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {clientes.length > 1 && (
        <SelectField label="Cliente" value={clienteId} onChange={setClienteId}
          options={clientes.map(c => ({ value: c.id, label: c.nombre }))} placeholder="Selecciona un cliente" />
      )}

      {!error && !cargandoClientes && clientes.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-400">
          {esResidente ? 'Tu cliente no tiene el módulo de Actividades habilitado.' : 'Ningún cliente tiene el módulo de Actividades habilitado.'}
        </div>
      )}

      {cliente && (
        <>
          <div className="flex items-center gap-1.5 flex-wrap">
            {PILLS.map(p => (
              <button key={p.clave}
                onClick={() => (p.clave === 'anulada' ? irAAnuladas() : setPill(p.clave))}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                  pill === p.clave ? 'bg-brand-700 border-brand-700 text-white' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                {p.etiqueta} ({conteos[p.clave] ?? 0})
              </button>
            ))}
          </div>

          {pill === 'pendiente_acta' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pendiente de facturar</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{fmtMoney(metricasPendientes.suma)}</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sin valorizar</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{metricasPendientes.sinValorizar}</p>
              </div>
            </div>
          )}

          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por descripción, referencia, sede o código de línea…"
            className="w-full sm:max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-3 px-4 font-semibold">Fecha</th>
                  <th className="py-3 px-4 font-semibold">Sede</th>
                  <th className="py-3 px-4 font-semibold">Descripción</th>
                  <th className="py-3 px-4 font-semibold">Contrato / Naturaleza</th>
                  <th className="py-3 px-4 font-semibold">Referencia</th>
                  <th className="py-3 px-4 font-semibold">Estado</th>
                  {pill === 'pendiente_acta' && <th className="py-3 px-4 font-semibold">Antigüedad</th>}
                  <th className="py-3 px-4 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={pill === 'pendiente_acta' ? 8 : 7} className="py-10 text-center text-gray-400">Cargando…</td></tr>
                )}
                {!loading && filtradas.length === 0 && (
                  <tr><td colSpan={pill === 'pendiente_acta' ? 8 : 7} className="py-12 text-center text-gray-400">
                    No hay actividades{busqueda ? ' con esa búsqueda' : ' en esta vista'}.
                  </td></tr>
                )}
                {!loading && filtradas.map(a => (
                  <tr key={a.id} onClick={() => setDetalle(a)} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <td className="py-3 px-4 text-gray-500 whitespace-nowrap">{fFecha(a)}</td>
                    <td className="py-3 px-4 text-gray-700">{a.sede_nombre || '—'}</td>
                    <td className="py-3 px-4 text-gray-800 max-w-xs truncate" title={a.descripcion}>{a.descripcion || '—'}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 mr-1">{a.contrato || '—'}</span>
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 uppercase">{a.naturaleza || '—'}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-500">{a.referencia_cliente || '—'}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${ESTADO_ACTIVIDAD_COLOR[a.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ESTADO_ACTIVIDAD_LABEL[a.estado] ?? a.estado}
                      </span>
                      {!estaValorizada(a) && (
                        <span className="ml-1.5 inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">sin valorizar</span>
                      )}
                    </td>
                    {pill === 'pendiente_acta' && (() => {
                      const dias = diasPendiente(a, ahora)
                      return (
                        <td className="py-3 px-4 whitespace-nowrap">
                          {dias === null ? <span className="text-gray-400">—</span>
                            : dias >= UMBRAL_PENDIENTE_ACTA_DIAS
                              ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700"
                                  title={`Pendiente hace más de ${UMBRAL_PENDIENTE_ACTA_DIAS} días — ya dejó pasar un corte de acta`}>
                                  {fAntiguedad(dias)}
                                </span>
                              : <span className="text-gray-500 text-xs">{fAntiguedad(dias)}</span>}
                        </td>
                      )
                    })()}
                    <td className="py-3 px-4 text-right font-mono text-gray-700">{fmtMoney(a.total || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {cliente && (
        <ActividadForm isOpen={formOpen} onClose={() => setFormOpen(false)} cliente={cliente} lpus={lpus}
          onRegistrada={() => { setFormOpen(false); reload() }} clienteFijo={esResidente} />
      )}

      {detalle && user && (
        <ActividadDetalle isOpen={!!detalle} onClose={() => setDetalle(null)} actividad={detalle} lpus={lpus}
          puedeGestionar={puedeGestionar} uid={user.uid} onCambio={() => { reload() }} />
      )}
    </div>
  )
}
