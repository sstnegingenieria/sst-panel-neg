// Bandeja de Proyectos (SIGP F2.1.a) — detrás de sigp_f2_enabled.
// Los proyectos NACEN al aprobar cotizaciones; aquí no se crean a mano.
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useFirestore } from '../../hooks/useFirestore'
import { useFeatureFlag } from '../../hooks/useFeatureFlag'
import { toast } from '../../components/shared/Toast'
import { fmtMoney } from '../../utils/sigp/formato'
import { ESTADOS_PROYECTO, ESTADO_PRY_LABEL, ESTADO_PRY_COLOR } from '../../types/sigp/proyecto'
import type { Proyecto } from '../../types/sigp/proyecto'

export default function ProyectosSigp() {
  const f2Enabled = useFeatureFlag('sigp_f2_enabled', false)
  const { getAll } = useFirestore()
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [busqueda, setBusqueda] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAll('proyectos') as Proyecto[]
      data.sort((a, b) => (b.fecha_creacion?.toMillis?.() ?? 0) - (a.fecha_creacion?.toMillis?.() ?? 0))
      setProyectos(data)
    } catch {
      toast('Error al cargar proyectos', 'error')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (f2Enabled) load() }, [f2Enabled, load])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return proyectos.filter(p =>
      (!filtroEstado || p.estado === filtroEstado) &&
      (!q ||
        p.consecutivo.toLowerCase().includes(q) ||
        p.snapshot.cliente.toLowerCase().includes(q) ||
        p.snapshot.asunto.toLowerCase().includes(q) ||
        p.cotizacion_consecutivo.toLowerCase().includes(q)),
    )
  }, [proyectos, filtroEstado, busqueda])

  if (!f2Enabled) {
    return (
      <div className="max-w-6xl mx-auto py-16 text-center text-sm text-gray-500">
        El módulo de Proyectos aún no está habilitado.
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">SIGP · Proyectos</p>
        <h1 className="text-2xl font-bold text-gray-800">Proyectos</h1>
        <p className="text-sm text-gray-500">
          Ejecución de lo aprobado · un proyecto nace automáticamente al aprobar una cotización
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">
            Bandeja <span className="text-gray-400 font-normal">({filtrados.length})</span>
          </h2>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por PRY, cliente, asunto o COT…"
              className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-brand-300" />
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
              className="text-sm px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300">
              <option value="">Todos los estados</option>
              {ESTADOS_PROYECTO.map(e => <option key={e} value={e}>{ESTADO_PRY_LABEL[e]}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400">
            {proyectos.length === 0
              ? 'Aún no hay proyectos — nacerán al aprobar cotizaciones.'
              : 'Ningún proyecto coincide con el filtro.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="px-4 py-2 font-medium">Consecutivo</th>
                  <th className="px-4 py-2 font-medium">Cliente</th>
                  <th className="px-4 py-2 font-medium">Asunto</th>
                  <th className="px-4 py-2 font-medium text-right">Valor venta</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                  <th className="px-4 py-2 font-medium">Creado</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <Link to={`/sigp/proyectos/${p.id}`} className="font-mono text-brand-700 font-semibold hover:underline">
                        {p.consecutivo}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{p.snapshot.cliente}</td>
                    <td className="px-4 py-2.5 text-gray-500 max-w-xs truncate" title={p.snapshot.asunto}>
                      {p.snapshot.asunto || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-700">{fmtMoney(p.snapshot.valor_venta)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${ESTADO_PRY_COLOR[p.estado]}`}>
                        {ESTADO_PRY_LABEL[p.estado]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">
                      {p.fecha_creacion?.toDate?.().toLocaleDateString('es-CO') ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
