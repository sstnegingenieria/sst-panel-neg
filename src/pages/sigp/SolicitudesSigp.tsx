import { useState, useEffect, useMemo, useCallback } from 'react'
import SolicitudesTable from '../../components/sigp/solicitudes/SolicitudesTable'
import SolicitudForm from '../../components/sigp/solicitudes/SolicitudForm'
import StatCard from '../../components/StatCard'
import { useSolicitudes } from '../../hooks/sigp/useSolicitudes'
import { useFirestore } from '../../hooks/useFirestore'
import { toast } from '../../components/shared/Toast'
import { useAuth } from '../../contexts/AuthContext'
import { puedeGestionarSolicitudesUI } from '../../types/sigp/permisos'
import { ESTADO_LABEL, ESTADOS_SOLICITUD } from '../../types/sigp/solicitud'
import type { Cliente } from '../../types/sigp/cliente'

export default function SolicitudesSigp() {
  const { solicitudes, loading, reload } = useSolicitudes()
  const { getAllOrdered } = useFirestore()
  const { user } = useAuth()
  const puedeGestionar = puedeGestionarSolicitudesUI(user?.rol)

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
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

  const filtradas = useMemo(() => {
    return solicitudes.filter(s =>
      (!filtroEstado || s.estado === filtroEstado) &&
      (!filtroCliente || s.cliente_id === filtroCliente),
    )
  }, [solicitudes, filtroEstado, filtroCliente])

  const stats = useMemo(() => ({
    total: solicitudes.length,
    recibidas: solicitudes.filter(s => s.estado === 'recibida').length,
    en_estudio: solicitudes.filter(s => s.estado === 'en_estudio').length,
    listas: solicitudes.filter(s => s.estado === 'lista_para_cotizar').length,
  }), [solicitudes])

  const handleNueva = () => setFormOpen(true)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-600">
            SIGP · Comercial
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Solicitudes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Bandeja de entrada comercial · recepción y estudio de solicitudes
          </p>
        </div>
        {puedeGestionar && (
          <button
            onClick={handleNueva}
            className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva solicitud
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total"
          value={loading ? '…' : stats.total}
          loading={loading}
          color="brand"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          }
        />
        <StatCard
          title="Recibidas"
          value={loading ? '…' : stats.recibidas}
          loading={loading}
          color="orange"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          }
        />
        <StatCard
          title="En estudio"
          value={loading ? '…' : stats.en_estudio}
          loading={loading}
          color="purple"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          }
        />
        <StatCard
          title="Listas para cotizar"
          value={loading ? '…' : stats.listas}
          loading={loading}
          color="green"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <h2 className="font-bold text-gray-800">
            Bandeja
            {!loading && (
              <span className="ml-2 text-xs font-normal text-gray-400">({filtradas.length})</span>
            )}
          </h2>
          <div className="flex gap-2">
            <select
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="">Todos los estados</option>
              {ESTADOS_SOLICITUD.map(e => (
                <option key={e} value={e}>{ESTADO_LABEL[e]}</option>
              ))}
            </select>
            <select
              value={filtroCliente}
              onChange={e => setFiltroCliente(e.target.value)}
              className="w-48 px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="">Todos los clientes</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        <SolicitudesTable
          solicitudes={filtradas}
          loading={loading}
          clienteNombres={clienteNombres}
          filasClicables
        />
      </div>

      <SolicitudForm
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onGuardado={reload}
        clientes={clientes.filter(c => c.estado === 'activo')}
      />
    </div>
  )
}
