import { useState, useEffect, useMemo, useCallback } from 'react'
import CotizacionesTable from '../../components/sigp/cotizaciones/CotizacionesTable'
import CotizacionForm from '../../components/sigp/cotizaciones/CotizacionForm'
import StatCard from '../../components/StatCard'
import { useCotizaciones } from '../../hooks/sigp/useCotizaciones'
import { useFirestore } from '../../hooks/useFirestore'
import { toast } from '../../components/shared/Toast'
import { useAuth } from '../../contexts/AuthContext'
import { puedeGestionarCotizacionesUI } from '../../types/sigp/permisos'
import { ESTADOS_COTIZACION, ESTADO_COT_LABEL, estadoEfectivo, TIPOS_INVERSION, TIPO_INVERSION_LABEL } from '../../types/sigp/cotizacion'
import type { Cliente } from '../../types/sigp/cliente'

export default function CotizacionesSigp() {
  const { cotizaciones, loading, reload } = useCotizaciones()
  const { getAllOrdered } = useFirestore()
  const { user } = useAuth()
  const puedeGestionar = puedeGestionarCotizacionesUI(user?.rol)

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroInversion, setFiltroInversion] = useState('')
  const [formOpen, setFormOpen] = useState(false)

  const loadClientes = useCallback(async () => {
    try {
      const data = await getAllOrdered('clientes', 'nombre', 'asc')
      setClientes(data as Cliente[])
    } catch {
      toast('Error al cargar clientes', 'error')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadClientes() }, [loadClientes])

  const clienteNombres = useMemo(
    () => Object.fromEntries(clientes.map(c => [c.id, c.nombre])),
    [clientes],
  )

  const filtradas = useMemo(() => cotizaciones.filter(c =>
    (!filtroEstado || estadoEfectivo(c) === filtroEstado) &&
    (!filtroCliente || c.cliente_id === filtroCliente) &&
    (!filtroInversion || c.tipo_inversion === filtroInversion),
  ), [cotizaciones, filtroEstado, filtroCliente, filtroInversion])

  const stats = useMemo(() => {
    const efectivos = cotizaciones.map(estadoEfectivo)
    return {
      total: cotizaciones.length,
      enviadas: efectivos.filter(e => e === 'enviada').length,
      aprobadas: efectivos.filter(e => e === 'aprobada').length,
      vencidas: efectivos.filter(e => e === 'vencida').length,
    }
  }, [cotizaciones])

  const handleNueva = () => setFormOpen(true)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-600">SIGP · Comercial</div>
          <h1 className="text-2xl font-bold text-gray-800">Cotizaciones</h1>
          <p className="text-sm text-gray-500 mt-0.5">Ofertas al cliente · versiones y aprobación</p>
        </div>
        {puedeGestionar && (
          <button onClick={handleNueva}
            className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva cotización
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total" value={loading ? '…' : stats.total} loading={loading} color="brand"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>} />
        <StatCard title="Enviadas" value={loading ? '…' : stats.enviadas} loading={loading} color="orange"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>} />
        <StatCard title="Aprobadas" value={loading ? '…' : stats.aprobadas} loading={loading} color="green"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title="Vencidas" value={loading ? '…' : stats.vencidas} loading={loading} color="purple"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <h2 className="font-bold text-gray-800">
            Listado
            {!loading && <span className="ml-2 text-xs font-normal text-gray-400">({filtradas.length})</span>}
          </h2>
          <div className="flex gap-2">
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
              <option value="">Todos los estados</option>
              {ESTADOS_COTIZACION.map(e => <option key={e} value={e}>{ESTADO_COT_LABEL[e]}</option>)}
            </select>
            <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}
              className="w-48 px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
              <option value="">Todos los clientes</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <select value={filtroInversion} onChange={e => setFiltroInversion(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
              <option value="">OPEX y CAPEX</option>
              {TIPOS_INVERSION.map(t => <option key={t} value={t}>{TIPO_INVERSION_LABEL[t]}</option>)}
            </select>
          </div>
        </div>
        <CotizacionesTable cotizaciones={filtradas} loading={loading} clienteNombres={clienteNombres} filasClicables />
      </div>

      <CotizacionForm
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onGuardado={reload}
        clientes={clientes.filter(c => c.estado === 'activo')}
      />
    </div>
  )
}
