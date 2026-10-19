// Verificación de contratistas — Gate SST (Administrativa · Bloque 3a).
//
// Antes de liquidar (pagar el saldo al contratista), SST confirma que el
// contratista está "al día en formatos" de esa obra. El criterio es MANUAL
// de SST (no se cablea). Cola: proyectos ejecutados en el tramo
// administrativo previo a la liquidación (facturado / pagado_cliente).
//
// CONFIDENCIALIDAD: esta vista lee SOLO la proyección `verificaciones_sst`
// (identidad + estado, sin NADA financiero) — SST no tiene acceso a
// `proyectos`. La proyección la mantiene la Cloud Function
// sincronizarVerificacionSst; el gate lo escribe SST aquí (fuente de verdad).
//
// Roles: sst y residente_sst OPERAN; admin ve (infra). El gate es NO
// esquivable: sin 'al_dia' las reglas impiden liquidar (Bloque 3b).
//
// AVAL FÍSICO: cuando el cliente exige los formatos en papel no hay
// formularios en la app; gestion_integral (SOLO ella) avala dejando un
// registro de CUSTODIA (responsable del archivo, ubicación localizable, formatos,
// fecha, motivo) + su declaración — los formatos NO se escanean. Queda con
// badge "físico"; la declaración NO se edita (corregir = aval nuevo, la anterior
// queda en el rastro). Vista "Avalados en físico" = la lista que pide el
// auditor, exportable a Excel. Empujón de UI (no es regla): si la obra no tiene
// formularios en la app, a gestion_integral se le oculta "Al día" y se le ofrece
// la vía física — el aval por app de sst/residente_sst con cola vacía queda como
// residual conocido (endurecimiento futuro).
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs, getCountFromServer, query, where, doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'
import { toast } from '../components/shared/Toast'
import Modal from '../components/shared/Modal'
import {
  ESTADO_PRY_LABEL, ESTADO_PRY_COLOR, enColaVerificacionSst,
  estadoSstGate, SST_GATE_LABEL, SST_GATE_COLOR,
} from '../types/sigp/proyecto'
import { puedeMarcarSstGateUI, puedeAvalarFisicoUI } from '../types/sigp/permisos'
import { LEYENDA_AVAL_FISICO, MAX_TEXTO_AVAL, esAvalFisico, filasAvalesFisicos, resumenCustodiaFisica } from '../types/sigp/avalFisico'
import { exportarAvalesFisicos } from '../utils/sigp/avalesFisicosExcel'
import AvalFisicoModal from '../components/sigp/verificacion/AvalFisicoModal'
import RastroCustodiaModal from '../components/sigp/verificacion/RastroCustodiaModal'
import type { EstadoSstGate } from '../types/sigp/proyecto'
import type { VerificacionSst } from '../types/sigp/verificacionSst'
import ObjetoObra from '../components/ObjetoObra'

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

export default function VerificacionContratistas() {
  const { user } = useAuth()
  const puedeMarcar = puedeMarcarSstGateUI(user?.rol)
  const puedeFisico = puedeAvalarFisicoUI(user?.rol)
  // `todas` = toda la proyección (incluye proyectos que ya salieron de la cola
  // y siguen avalados en físico — el auditor los pide); `verificaciones` = la cola.
  const [todas, setTodas] = useState<VerificacionSst[]>([])
  const [verificaciones, setVerificaciones] = useState<VerificacionSst[]>([])
  const [vista, setVista] = useState<'cola' | 'fisico'>('cola')
  const [rastroTarget, setRastroTarget] = useState<VerificacionSst | null>(null)
  const [loading, setLoading] = useState(true)
  const [aplicando, setAplicando] = useState(false)
  // novedad (observación obligatoria)
  const [novedadTarget, setNovedadTarget] = useState<VerificacionSst | null>(null)
  const [observacion, setObservacion] = useState('')
  // Aval físico (solo gestion_integral)
  const [fisicoTarget, setFisicoTarget] = useState<VerificacionSst | null>(null)
  // Nº de formularios de la obra-espejo en la app (solo se consulta para quien
  // puede avalar físico). null/ausente = desconocido → se muestran ambas vías.
  const [formsPorObra, setFormsPorObra] = useState<Record<string, number | null>>({})
  // Filtro por cliente (lista desplegable con conteo — patrón del filtro de
  // Obras) + búsqueda por sitio. Docs proyectados antes de que el snapshot
  // tuviera cliente/sitio traen el campo vacío → "—" (se re-llenan solos con
  // el próximo write del proyecto; acá NO se rellena ni se adivina).
  const [filtroCliente, setFiltroCliente] = useState('')
  const [busqueda, setBusqueda] = useState('')
  // Objeto/alcance de cada obra-espejo (obras/{obra_id}.alcance), leído una vez y
  // cruzado por obra_id — la proyección verificaciones_sst NO lo trae. Si no se
  // puede leer o falta el doc, se omite en silencio (es solo contexto visual).
  const [alcancePorObra, setAlcancePorObra] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'verificaciones_sst'))
      const docs = snap.docs.map(d => ({ proyecto_id: d.id, ...d.data() }) as VerificacionSst)
      setTodas(docs)
      setVerificaciones(docs.filter(v => enColaVerificacionSst(v.estado)))
    } catch {
      toast('Error al cargar la cola de verificación', 'error')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let cancelado = false
    getDocs(collection(db, 'obras'))
      .then(snap => {
        if (cancelado) return
        const mapa: Record<string, string> = {}
        for (const d of snap.docs) {
          const a = d.data().alcance
          if (typeof a === 'string' && a.trim()) mapa[d.id] = a
        }
        setAlcancePorObra(mapa)
      })
      .catch(() => { /* contexto opcional: sin alcance, sin línea */ })
    return () => { cancelado = true }
  }, [])

  // Empujón de UI: ¿la obra tiene formularios en la app? Falla abierta — si el
  // conteo no se puede leer, se muestran las dos vías (jamás se esconde "Al día"
  // por un error de lectura).
  useEffect(() => {
    if (!puedeFisico) return
    const pendientesObra = verificaciones.filter(v => estadoSstGate(v) !== 'al_dia' && v.obra_id)
    let cancelado = false
    Promise.all(pendientesObra.map(async v => {
      try {
        const c = await getCountFromServer(query(collection(db, 'formularios'), where('obra_id', '==', v.obra_id)))
        return [v.obra_id, c.data().count] as const
      } catch { return [v.obra_id, null] as const }
    })).then(pares => { if (!cancelado) setFormsPorObra(Object.fromEntries(pares)) })
    return () => { cancelado = true }
  }, [verificaciones, puedeFisico])

  // Lista base según la vista: la cola, o TODOS los avalados en físico vigentes
  // (incluso los que ya salieron de la cola).
  const fisicos = useMemo(() => todas.filter(v => esAvalFisico(v.sst_gate)), [todas])
  const base = vista === 'fisico' ? fisicos : verificaciones

  // Clientes DERIVADOS de la cola visible (jamás de la colección `clientes`,
  // que SST no lee), con conteo; vacíos agrupados bajo "—".
  const clientes = useMemo(() => {
    const conteo = new Map<string, number>()
    for (const v of base) {
      const c = (v.cliente_nombre ?? '').trim() || '—'
      conteo.set(c, (conteo.get(c) ?? 0) + 1)
    }
    return [...conteo.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
  }, [base])

  // Pendientes primero, luego con novedad, al día al final — y encima el
  // filtro de cliente (AND) + la búsqueda por sitio/consecutivo/contratista.
  const orden: Record<string, number> = { pendiente: 0, con_novedad: 1, al_dia: 2 }
  const ordenadas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return base
      .filter(v => !filtroCliente || ((v.cliente_nombre ?? '').trim() || '—') === filtroCliente)
      .filter(v => !q || [v.nombre_sitio, v.codigo_sitio_cliente, v.consecutivo, v.contratista_nombre, v.cliente_nombre]
        .some(campo => (campo ?? '').toLowerCase().includes(q)))
      .sort((a, b) => orden[estadoSstGate(a)] - orden[estadoSstGate(b)])
  }, [base, filtroCliente, busqueda])  // eslint-disable-line react-hooks/exhaustive-deps
  const pendientes = verificaciones.filter(v => estadoSstGate(v) !== 'al_dia').length

  const marcar = async (v: VerificacionSst, estado: EstadoSstGate, obs?: string) => {
    setAplicando(true)
    try {
      const ahora = Timestamp.now()
      await updateDoc(doc(db, 'verificaciones_sst', v.proyecto_id), {
        sst_gate: {
          estado,
          verificado_por: user?.uid ?? '',
          fecha: ahora,
          ...(obs?.trim() ? { observacion: obs.trim() } : {}),
        },
        fecha_actualizacion: ahora,
        historial: arrayUnion({
          de: estadoSstGate(v), a: estado, por: user?.uid ?? '', fecha: ahora,
          motivo: estado === 'al_dia'
            ? `Gate SST: contratista AL DÍA en formatos — habilita la liquidación (verificado por SST)`
            : `Gate SST: CON NOVEDAD — ${obs?.trim() ?? ''} (la liquidación queda bloqueada)`,
        }),
      })
      toast(estado === 'al_dia' ? 'Contratista al día — liquidación habilitada' : 'Novedad registrada — liquidación bloqueada')
      setNovedadTarget(null)
      setObservacion('')
      await load()
    } catch {
      toast('Error al registrar la verificación (verifica tu rol)', 'error')
    } finally { setAplicando(false) }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Verificación de contratistas</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Gate SST previo a la liquidación: confirma que el contratista está al día en los
          formatos de la obra. Sin tu aval no se paga el saldo.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-xs font-medium">
          <button onClick={() => { setVista('cola'); setFiltroCliente('') }}
            className={`px-3 py-1.5 ${vista === 'cola' ? 'bg-brand-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
            En cola ({verificaciones.length})
          </button>
          <button onClick={() => { setVista('fisico'); setFiltroCliente('') }}
            className={`px-3 py-1.5 border-l border-gray-300 ${vista === 'fisico' ? 'bg-brand-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
            📄 Avalados en físico ({fisicos.length})
          </button>
        </div>
        {vista === 'cola' ? (
          <p className="text-xs text-gray-500">
            <span className="font-semibold text-amber-700">{pendientes}</span> por verificar · {verificaciones.length} en la cola
          </p>
        ) : (
          <p className="text-xs text-gray-500">Avales con formatos en papel vigentes — {LEYENDA_AVAL_FISICO}.</p>
        )}
        <span className="flex-1" />
        {vista === 'fisico' && (
          <button
            onClick={() => exportarAvalesFisicos(filasAvalesFisicos(ordenadas), 'avales-sst-en-fisico')}
            disabled={ordenadas.length === 0}
            title="Exporta a Excel la lista que se ve (respeta el cliente y la búsqueda)"
            className="text-xs px-3 py-1.5 rounded-lg font-medium border border-brand-600 text-brand-800 bg-brand-50 hover:bg-brand-100 disabled:opacity-50">
            ⬇ Exportar Excel ({ordenadas.length})
          </button>
        )}
        <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
          <option value="">Todos los clientes ({base.length})</option>
          {clientes.map(([nombre, n]) => (
            <option key={nombre} value={nombre}>{nombre} ({n})</option>
          ))}
        </select>
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por sitio, PRY, contratista…"
          className="w-full sm:w-64 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-3 px-4 font-semibold">Proyecto</th>
              <th className="py-3 px-4 font-semibold">Cliente</th>
              <th className="py-3 px-4 font-semibold">Sitio</th>
              <th className="py-3 px-4 font-semibold">Contratista</th>
              <th className="py-3 px-4 font-semibold">Estado del proyecto</th>
              <th className="py-3 px-4 font-semibold">Gate SST</th>
              <th className="py-3 px-4 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="py-10 text-center text-gray-400">Cargando…</td></tr>
            )}
            {!loading && ordenadas.length === 0 && (
              <tr><td colSpan={7} className="py-12 text-center text-gray-400">
                {base.length > 0
                  ? 'Nada con ese filtro o búsqueda.'
                  : vista === 'fisico'
                    ? 'Ningún proyecto está avalado en físico.'
                    : 'No hay proyectos en el tramo de verificación (facturado / pagado por el cliente).'}
              </td></tr>
            )}
            {!loading && ordenadas.map(v => {
              const gate = estadoSstGate(v)
              return (
                <tr key={v.proyecto_id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    {/* Sin enlace a la ficha del proyecto: SST no accede a `proyectos` */}
                    <span className="font-mono text-gray-800 font-semibold">{v.consecutivo}</span>
                  </td>
                  <td className="py-3 px-4 text-gray-700">{(v.cliente_nombre ?? '').trim() || '—'}</td>
                  <td className="py-3 px-4">
                    <span className="font-medium text-gray-800">{v.nombre_sitio || '—'}</span>
                    <ObjetoObra alcance={alcancePorObra[v.obra_id]} className="mt-0.5 max-w-xs" />
                    <Link to={`/registros/${v.obra_id}`}
                      className="block text-[11px] text-brand-700 hover:underline"
                      title="Formularios SST de la obra-espejo de este proyecto">
                      Ver formularios de la obra →
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-gray-700">{v.contratista_nombre || '—'}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${ESTADO_PRY_COLOR[v.estado]}`}>
                      {ESTADO_PRY_LABEL[v.estado]}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${SST_GATE_COLOR[gate]}`}
                      title={v.sst_gate?.observacion ? `Observación: ${v.sst_gate.observacion}` : undefined}>
                      {SST_GATE_LABEL[gate]}
                    </span>
                    {esAvalFisico(v.sst_gate) && v.sst_gate?.fisico && (
                      <button onClick={() => setRastroTarget(v)}
                        className="inline-flex ml-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200"
                        title={`Aval FÍSICO — ${LEYENDA_AVAL_FISICO}. ${resumenCustodiaFisica(v.sst_gate.fisico)} — clic para ver el rastro de custodia`}>
                        📄 físico
                      </button>
                    )}
                    {esAvalFisico(v.sst_gate) && (
                      <span className="block text-[11px] text-gray-500 mt-0.5">{LEYENDA_AVAL_FISICO}</span>
                    )}
                    {v.sst_gate && (
                      <span className="block text-[11px] text-gray-400 mt-0.5">{fFecha(v.sst_gate.fecha)}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {!enColaVerificacionSst(v.estado) ? (
                      <span className="text-gray-300 text-xs">fuera de la cola</span>
                    ) : puedeMarcar ? (
                      <div className="flex items-center justify-end gap-2">
                        {gate !== 'al_dia' && !(puedeFisico && formsPorObra[v.obra_id] === 0) && (
                          <button onClick={() => marcar(v, 'al_dia')} disabled={aplicando}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                            ✔ Al día
                          </button>
                        )}
                        {puedeFisico && gate !== 'al_dia' && (
                          <button onClick={() => setFisicoTarget(v)} disabled={aplicando}
                            title={formsPorObra[v.obra_id] === 0
                              ? 'Esta obra no tiene formularios en la app — avala con los formatos físicos'
                              : 'Registrar la custodia de los formatos SST en papel (con tu declaración) y avalar'}
                            className={`text-xs px-3 py-1.5 rounded-lg font-medium border disabled:opacity-50 ${
                              formsPorObra[v.obra_id] === 0
                                ? 'border-brand-600 bg-brand-50 text-brand-800 hover:bg-brand-100'
                                : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                            📄 Registrar formatos físicos y avalar
                          </button>
                        )}
                        {puedeFisico && esAvalFisico(v.sst_gate) && (
                          <button onClick={() => setFisicoTarget(v)} disabled={aplicando}
                            title="La declaración no se edita: registra un aval físico NUEVO; el anterior queda en el rastro"
                            className="text-xs px-3 py-1.5 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                            ✎ Corregir custodia
                          </button>
                        )}
                        {gate !== 'con_novedad' && (
                          <button onClick={() => { setNovedadTarget(v); setObservacion('') }} disabled={aplicando}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">
                            ⚠ Con novedad
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">solo SST</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Aval físico — registro de custodia + declaración (solo gestion_integral) */}
      <AvalFisicoModal
        verificacion={fisicoTarget}
        uid={user?.uid}
        onClose={() => setFisicoTarget(null)}
        onSaved={load}
      />

      {/* Rastro de custodia: declaración vigente + anteriores */}
      <RastroCustodiaModal verificacion={rastroTarget} onClose={() => setRastroTarget(null)} />

      {/* Novedad — observación OBLIGATORIA */}
      <Modal
        isOpen={novedadTarget !== null}
        title={`Novedad SST — ${novedadTarget?.consecutivo ?? ''}`}
        onClose={() => setNovedadTarget(null)}
        actions={[
          { label: 'Volver', onClick: () => setNovedadTarget(null), variant: 'secondary' },
          {
            label: aplicando ? 'Registrando…' : 'Registrar novedad (bloquea liquidación)',
            onClick: () => { if (observacion.trim() && novedadTarget) marcar(novedadTarget, 'con_novedad', observacion) },
            variant: 'danger', loading: aplicando,
          },
        ]}
      >
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            Contratista <strong>{novedadTarget?.contratista_nombre || '—'}</strong> — describe la
            novedad: mientras exista, la liquidación queda bloqueada.
          </p>
          <label className="text-sm font-medium text-gray-700">
            Observación <span className="text-red-500">*</span>
          </label>
          <textarea value={observacion} maxLength={MAX_TEXTO_AVAL} onChange={e => setObservacion(e.target.value)} rows={3}
            placeholder="Ej: faltan permisos de trabajo en alturas de la semana del 15…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          {!observacion.trim() && <p className="text-xs text-red-600">La observación es obligatoria.</p>}
        </div>
      </Modal>
    </div>
  )
}
