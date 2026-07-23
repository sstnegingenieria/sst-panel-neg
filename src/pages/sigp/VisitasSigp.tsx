import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import VisitasTable from '../../components/sigp/visitas/VisitasTable'
import VisitaForm from '../../components/sigp/visitas/VisitaForm'
import StatCard from '../../components/StatCard'
import { useVisitas } from '../../hooks/sigp/useVisitas'
import { useFirestore } from '../../hooks/useFirestore'
import { toast } from '../../components/shared/Toast'
import { useAuth } from '../../contexts/AuthContext'
import { puedeGestionarVisitasUI } from '../../types/sigp/permisos'
import { TIPOS_VISITA, TIPO_VISITA_LABEL, ESTADOS_VISITA, ESTADO_VISITA_LABEL } from '../../types/sigp/visita'
import type { Cliente } from '../../types/sigp/cliente'
import type { Visita } from '../../types/sigp/visita'

export default function VisitasSigp() {
  const { visitas, loading, reload } = useVisitas()
  const { getAllOrdered } = useFirestore()
  const { user } = useAuth()
  const puedeGestionar = puedeGestionarVisitasUI(user?.rol)

  const [clientes, setClientes] = useState<Cliente[]>([])
  // Pipeline: el badge del sidebar llega con ?pendientes=1 → preseleccionar
  // el filtro de pendientes de agendar.
  const [searchParams] = useSearchParams()
  const [filtroEstado, setFiltroEstado] = useState(searchParams.get('pendientes') ? 'pendiente_agendar' : '')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  // Borrador del pipeline a materializar (el form precarga y asigna el VIS)
  const [borradorAgendar, setBorradorAgendar] = useState<Visita | null>(null)

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

  const filtradas = useMemo(() => visitas.filter(v =>
    (!filtroEstado || v.estado === filtroEstado) &&
    (!filtroTipo || v.tipo === filtroTipo) &&
    (!filtroCliente || v.cliente_id === filtroCliente),
  ), [visitas, filtroEstado, filtroTipo, filtroCliente])

  const stats = useMemo(() => ({
    total: visitas.length,
    pendientes: visitas.filter(v => v.estado === 'pendiente_agendar').length,
    programadas: visitas.filter(v => v.estado === 'programada').length,
    realizadas: visitas.filter(v => v.estado === 'realizada').length,
    canceladas: visitas.filter(v => v.estado === 'cancelada').length,
  }), [visitas])

  const handleNueva = () => setFormOpen(true)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-600">
            SIGP · Comercial
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Visitas técnicas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Levantamiento en sitio · programación y ejecución
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
            Programar visita
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Por agendar" value={loading ? '…' : stats.pendientes} loading={loading} color="brand"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title="Programadas" value={loading ? '…' : stats.programadas} loading={loading} color="orange"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} />
        <StatCard title="Realizadas" value={loading ? '…' : stats.realizadas} loading={loading} color="green"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title="Canceladas" value={loading ? '…' : stats.canceladas} loading={loading} color="purple"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>} />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <h2 className="font-bold text-gray-800">
            Bandeja
            {!loading && <span className="ml-2 text-xs font-normal text-gray-400">({filtradas.length})</span>}
          </h2>
          <div className="flex gap-2 flex-wrap">
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
              <option value="">Todos los estados</option>
              {ESTADOS_VISITA.map(e => <option key={e} value={e}>{ESTADO_VISITA_LABEL[e]}</option>)}
            </select>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
              <option value="">Todos los tipos</option>
              {TIPOS_VISITA.map(t => <option key={t} value={t}>{TIPO_VISITA_LABEL[t]}</option>)}
            </select>
            <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}
              className="w-44 px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
              <option value="">Todos los clientes</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
        <VisitasTable visitas={filtradas} loading={loading} clienteNombres={clienteNombres} filasClicables
          onAgendar={puedeGestionar ? (v => { setBorradorAgendar(v); setFormOpen(true) }) : undefined} />
      </div>

      <VisitaForm
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setBorradorAgendar(null) }}
        onGuardado={reload}
        clientes={clientes.filter(c => c.estado === 'activo')}
        borrador={borradorAgendar}
      />
    </div>
  )
}
