// Actas de entrega de EPP (SST-FT-AEP-18) — lista. Solo gestion_integral + admin
// (espejo de gestionaEpp() en firestore.rules): el acta lleva la cédula del colaborador.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useActasEpp } from '../../hooks/useEpp'
import { puedeGestionarEppUI } from '../../types/sigp/permisos'
import {
  ESTADOS_ACTA_EPP, ESTADO_ACTA_EPP_COLOR, ESTADO_ACTA_EPP_LABEL, type ActaEppConId,
} from '../../types/sigp/epp'
import { toast } from '../../components/shared/Toast'

const fFecha = (ts: { toDate?: () => Date } | undefined | null) =>
  ts && typeof ts.toDate === 'function' ? ts.toDate().toLocaleDateString('es-CO') : '—'

export default function ActasEpp() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const puede = puedeGestionarEppUI(user?.rol)
  const { cargar } = useActasEpp()

  const [actas, setActas] = useState<ActaEppConId[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setActas(await cargar()) } catch { toast('Error al cargar las actas de EPP', 'error') } finally { setLoading(false) }
  }, [cargar])
  useEffect(() => { load() }, [load])

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const dig = q.replace(/[.\s-]/g, '')
    return actas.filter(a =>
      (!estado || a.estado === estado) &&
      (!q || a.colaborador.nombre.toLowerCase().includes(q)
        || (dig && a.colaborador.cedula.includes(dig))
        || (a.colaborador.contratista_nombre ?? '').toLowerCase().includes(q)
        || a.items.some(i => i.nombre.toLowerCase().includes(q))))
  }, [actas, busqueda, estado])

  return (
    <div className="flex flex-col gap-5 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Actas de entrega de EPP</h1>
          <p className="text-sm text-gray-500">Formato SST-FT-AEP-18: entrega de elementos de protección personal con firma del colaborador.</p>
        </div>
        {puede && (
          <div className="flex gap-2">
            <Link to="/actas-epp/catalogo" className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium">
              Catálogo EPP
            </Link>
            <button type="button" onClick={() => navigate('/actas-epp/nueva')}
              className="px-4 py-2 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium">
              ＋ Nueva acta
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por colaborador, cédula, empresa o elemento…"
          className="flex-1 min-w-[240px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
        <select value={estado} onChange={e => setEstado(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
          <option value="">Todos los estados</option>
          {ESTADOS_ACTA_EPP.map(s => <option key={s} value={s}>{ESTADO_ACTA_EPP_LABEL[s]}</option>)}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
              <th className="py-2 px-3">Fecha</th><th className="py-2 px-3">Colaborador</th>
              <th className="py-2 px-3">Origen</th><th className="py-2 px-3">Elementos</th><th className="py-2 px-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="py-6 text-center text-gray-400">Cargando…</td></tr>}
            {!loading && filtradas.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-gray-400">{actas.length === 0 ? 'Aún no hay actas. Crea la primera con “＋ Nueva acta”.' : 'Nada con ese filtro o búsqueda'}</td></tr>
            )}
            {filtradas.map(a => (
              <tr key={a.id} onClick={() => navigate(`/actas-epp/${a.id}`)} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                <td className="py-2 px-3 whitespace-nowrap">{fFecha(a.fecha)}</td>
                <td className="py-2 px-3 font-medium text-gray-900">{a.colaborador.nombre}</td>
                <td className="py-2 px-3 text-gray-600">{a.colaborador.fuente === 'directo' ? 'Directo NEG' : `Contratista ${a.colaborador.contratista_nombre ?? ''}`}</td>
                <td className="py-2 px-3 text-gray-600">{a.items.length}</td>
                <td className="py-2 px-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${ESTADO_ACTA_EPP_COLOR[a.estado] ?? ''}`}>
                    {ESTADO_ACTA_EPP_LABEL[a.estado] ?? a.estado}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
