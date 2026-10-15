// Acciones de Mejora / No Conformidades (AC/AP, cláusula 10.2) — Fase 1: lista.
// Solo gestion_integral + admin (espejo de gestionaAcAp() en firestore.rules).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useAccionesMejora } from '../../hooks/useAccionesMejora'
import { puedeGestionarAcapUI } from '../../types/sigp/permisos'
import {
  ESTADOS_ACCION, ESTADO_ACCION_COLOR, ESTADO_ACCION_LABEL, FUENTES_ACCION, FUENTE_ACCION_LABEL,
  TIPOS_ACCION, TIPO_ACCION_COLOR, TIPO_ACCION_LABEL, porquesDiligenciados,
  type AccionFormData, type AccionMejoraConId,
} from '../../types/sigp/accionMejora'
import AccionMejoraFormModal from '../../components/sigp/acciones/AccionMejoraFormModal'
import { toast } from '../../components/shared/Toast'

export function fFechaAccion(ts: { toDate?: () => Date } | undefined | null): string {
  return ts && typeof ts.toDate === 'function' ? ts.toDate().toLocaleDateString('es-CO') : '—'
}

const SEL = 'px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300'

export default function AccionesMejora() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const puedeGestionar = puedeGestionarAcapUI(user?.rol)
  const { cargar, crear } = useAccionesMejora()

  const [acciones, setAcciones] = useState<AccionMejoraConId[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [fFuente, setFFuente] = useState('')
  const [formAbierto, setFormAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setAcciones(await cargar())
    } catch {
      toast('Error al cargar las acciones de mejora', 'error')
    } finally {
      setLoading(false)
    }
  }, [cargar])
  useEffect(() => { load() }, [load])

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return acciones
      .filter(a => !fTipo || a.tipo === fTipo)
      .filter(a => !fEstado || a.estado === fEstado)
      .filter(a => !fFuente || a.fuente === fFuente)
      .filter(a => !q || [a.descripcion_nc, a.cliente_proceso, a.lider_proceso, a.consecutivo ?? '']
        .some(t => (t ?? '').toLowerCase().includes(q)))
  }, [acciones, busqueda, fTipo, fEstado, fFuente])

  const handleCrear = async (form: AccionFormData) => {
    if (!user) return
    setGuardando(true)
    try {
      const id = await crear(form, { uid: user.uid, nombre: user.nombre })
      if (!id) { toast('Revisa los campos obligatorios', 'error'); return }
      toast('Acción guardada como borrador')
      setFormAbierto(false)
      navigate(`/acciones-mejora/${id}`)
    } catch {
      toast('No se pudo guardar la acción (verifica tu rol)', 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Acciones de mejora / NC</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Matriz de acciones correctivas, preventivas y de mejora (cláusula 10.2): captura de la no conformidad y su causa raíz.
          </p>
        </div>
        {puedeGestionar && (
          <button
            type="button"
            onClick={() => setFormAbierto(true)}
            className="px-4 py-2 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium"
          >
            ＋ Nueva acción
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por descripción, cliente/proceso o líder…"
          className={`${SEL} flex-1 min-w-[220px]`}
        />
        <select value={fTipo} onChange={e => setFTipo(e.target.value)} className={SEL} aria-label="Filtrar por tipo">
          <option value="">Todos los tipos</option>
          {TIPOS_ACCION.map(t => <option key={t} value={t}>{TIPO_ACCION_LABEL[t]}</option>)}
        </select>
        <select value={fEstado} onChange={e => setFEstado(e.target.value)} className={SEL} aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          {ESTADOS_ACCION.map(e => <option key={e} value={e}>{ESTADO_ACCION_LABEL[e]}</option>)}
        </select>
        <select value={fFuente} onChange={e => setFFuente(e.target.value)} className={SEL} aria-label="Filtrar por fuente">
          <option value="">Todas las fuentes</option>
          {FUENTES_ACCION.map(x => <option key={x} value={x}>{FUENTE_ACCION_LABEL[x]}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : filtradas.length === 0 ? (
        <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded-xl p-6">
          {acciones.length === 0 ? 'Aún no hay acciones registradas.' : 'Nada coincide con ese filtro o búsqueda.'}
        </p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-400 border-b border-gray-100">
                <th className="py-2 px-3">Consecutivo</th>
                <th className="py-2 px-3">Tipo</th>
                <th className="py-2 px-3">Fecha</th>
                <th className="py-2 px-3">Cliente / proceso</th>
                <th className="py-2 px-3">No conformidad</th>
                <th className="py-2 px-3">Fuente</th>
                <th className="py-2 px-3">5 por qués</th>
                <th className="py-2 px-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map(a => (
                <tr
                  key={a.id}
                  onClick={() => navigate(`/acciones-mejora/${a.id}`)}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="py-2 px-3 font-mono text-xs text-gray-600">
                    {a.consecutivo ?? <span className="text-gray-400">sin asignar</span>}
                  </td>
                  <td className="py-2 px-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${TIPO_ACCION_COLOR[a.tipo] ?? ''}`}>
                      {TIPO_ACCION_LABEL[a.tipo] ?? a.tipo}
                    </span>
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">{fFechaAccion(a.fecha_tratamiento)}</td>
                  <td className="py-2 px-3 max-w-[180px] truncate" title={a.cliente_proceso}>{a.cliente_proceso || '—'}</td>
                  <td className="py-2 px-3 max-w-[320px] truncate" title={a.descripcion_nc}>{a.descripcion_nc}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{FUENTE_ACCION_LABEL[a.fuente] ?? a.fuente}</td>
                  <td className="py-2 px-3 whitespace-nowrap text-gray-600">{porquesDiligenciados(a.causa_raiz)} de 5</td>
                  <td className="py-2 px-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${ESTADO_ACCION_COLOR[a.estado] ?? ''}`}>
                      {ESTADO_ACCION_LABEL[a.estado] ?? a.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AccionMejoraFormModal
        isOpen={formAbierto}
        titulo="Nueva acción de mejora"
        guardando={guardando}
        onClose={() => setFormAbierto(false)}
        onSubmit={handleCrear}
      />
    </div>
  )
}
