// Pestaña "Presencia" de Horario y asistencia (rebuild oct-2026) — SOLO
// LECTURA (`jornadas` lo escribe la CF latidoJornada; el cierre automático
// es DERIVADO aquí, nunca escrito).
//
// Los rótulos dicen lo que se mide (el modelo anterior decía "jornada" y
// medía arranques — por eso se usó mal): "Presente ahora" = latido en la
// ventana; "cierre automático" = el latido se detuvo (caso normal, no
// anomalía); los roles que operan en la APP (ROLES_OPERAN_EN_APP) van en
// sección aparte — su cero NO es ausencia. El histórico de marcas
// ingreso/salida (sistema anterior, congelado) queda plegado al final.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Timestamp, collection, getDoc, getDocs, doc, orderBy, query, where } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import {
  aparearJornadas, claveDia, fmtDuracion, esHoraValida, tieneRespaldo,
  UMBRAL_SALIDA_SIN_RESPALDO_DIAS, RANGO_COLA_SIN_RESPALDO_DIAS,
} from '../../../types/sigp/horario'
import type { Ausentismo, ConfigHorario, DispositivoHorario, HorariosPersonales, RegistroHorario } from '../../../types/sigp/horario'
import { puedeRegistrarAusentismoUI, puedeGestionarHorarioUI } from '../../../types/sigp/permisos'
import HorariosPersonalesCard from './HorariosPersonalesCard'
import AusentismoFormModal from './AusentismoFormModal'
import {
  normalizarJornada, cierreEfectivo, presenteAhora, operaEnApp,
  GRACIA_CIERRE_MIN_DEFAULT, VENTANA_PRESENTE_MIN_DEFAULT,
} from '../../../types/sigp/jornada'
import type { Jornada } from '../../../types/sigp/jornada'
import ConfigHorarioCard from './ConfigHorarioCard'

function toDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function inicioDia(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0) }
function finDia(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999) }

function lunesDeSemana(d: Date): Date {
  const dia = d.getDay()
  const diff = dia === 0 ? -6 : 1 - dia
  const l = new Date(d)
  l.setDate(d.getDate() + diff)
  return l
}

function primerDiaMes(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1) }

const fHora = (t?: Timestamp) =>
  t ? t.toDate().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—'

const fFechaDia = (dia: string) => {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function ChipUbicacion({ enOficina, inicio }: { enOficina: boolean | null | undefined; inicio?: boolean | null }) {
  const title = inicio != null && inicio !== enOficina
    ? `Último latido; al inicio del día estaba ${inicio ? 'en oficina' : 'remoto'}`
    : undefined
  if (enOficina === true) return <span title={title} className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">🏢 Oficina</span>
  if (enOficina === false) return <span title={title} className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">🌐 Remoto</span>
  return <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-400">—</span>
}

function ChipDispositivo({ dispositivo }: { dispositivo: DispositivoHorario | undefined }) {
  if (dispositivo === 'escritorio') return <span title="Escritorio (🖥)">🖥</span>
  if (dispositivo === 'movil') return <span title="Móvil (📱)">📱</span>
  return <span className="text-gray-300">—</span>
}

const pill = (activo: boolean) =>
  `px-3 py-1.5 rounded-full text-xs font-medium border ${
    activo ? 'bg-brand-700 border-brand-700 text-white' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`

interface UsuarioApp { uid: string; nombre: string; rol: string }

export default function RegistrosTab() {
  const { user } = useAuth()
  const hoyDate = new Date()
  const [desdeStr, setDesdeStr] = useState(() => toDateStr(new Date()))
  const [hastaStr, setHastaStr] = useState(() => toDateStr(new Date()))
  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [usuariosApp, setUsuariosApp] = useState<UsuarioApp[]>([])
  const [cfg, setCfg] = useState<{ gracia: number; ventana: number }>({
    gracia: GRACIA_CIERRE_MIN_DEFAULT, ventana: VENTANA_PRESENTE_MIN_DEFAULT,
  })
  // Horario por persona (13-oct): hora general + mapa individual, para que
  // nadie tenga que adivinar por qué a uno le cerró a las 3 y a otro a las 5.
  const [horaGeneral, setHoraGeneral] = useState<string | null>(null)
  const [horasPersonales, setHorasPersonales] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [sinAcceso, setSinAcceso] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  // El reloj de la vista: se fija por carga (los derivados "presente/
  // automático" se evalúan contra este instante, no contra un timer vivo).
  const [ahoraMs, setAhoraMs] = useState(() => Date.now())
  // Histórico del sistema anterior (marcas ingreso/salida) — lazy al abrir.
  const [verHistorico, setVerHistorico] = useState(false)
  const [historico, setHistorico] = useState<RegistroHorario[] | null>(null)
  // ── Salida anticipada con respaldo (13-oct) ──
  // Ausentismos para el CRUCE (mismos lectores que esta pantalla: veHorario)
  // y la COLA de anticipadas sin respaldo (consulta dedicada por
  // cierre.anticipada — campo único, sin índice compuesto — independiente
  // del rango visible: una salida sin respaldo de hace tres semanas no puede
  // depender de qué fechas esté mirando alguien).
  const [ausentismos, setAusentismos] = useState<Ausentismo[]>([])
  const [anticipadas, setAnticipadas] = useState<Jornada[]>([])
  const [registrarPara, setRegistrarPara] = useState<{ empleadoUid: string; fecha: string } | null>(null)

  const rangoHoy = () => { const s = toDateStr(hoyDate); setDesdeStr(s); setHastaStr(s) }
  const rangoSemana = () => { setDesdeStr(toDateStr(lunesDeSemana(hoyDate))); setHastaStr(toDateStr(hoyDate)) }
  const rangoMes = () => { setDesdeStr(toDateStr(primerDiaMes(hoyDate))); setHastaStr(toDateStr(hoyDate)) }

  const esHoyActivo = desdeStr === toDateStr(hoyDate) && hastaStr === toDateStr(hoyDate)
  const esSemanaActivo = desdeStr === toDateStr(lunesDeSemana(hoyDate)) && hastaStr === toDateStr(hoyDate)
  const esMesActivo = desdeStr === toDateStr(primerDiaMes(hoyDate)) && hastaStr === toDateStr(hoyDate)

  useEffect(() => {
    // Config de umbrales (best-effort; defaults si no hay doc/lectura) +
    // usuarios de roles que operan en la app (sección "no se miden aquí").
    getDoc(doc(db, 'configuracion', 'horario'))
      .then(s => {
        const d = s.exists() ? (s.data() as ConfigHorario) : {}
        setCfg({
          gracia: typeof d.gracia_cierre_min === 'number' && d.gracia_cierre_min >= 5 ? d.gracia_cierre_min : GRACIA_CIERRE_MIN_DEFAULT,
          ventana: typeof d.ventana_presente_min === 'number' && d.ventana_presente_min >= 1 ? d.ventana_presente_min : VENTANA_PRESENTE_MIN_DEFAULT,
        })
        setHoraGeneral(d.hora_fin_jornada && esHoraValida(d.hora_fin_jornada) ? d.hora_fin_jornada.trim() : null)
      })
      .catch(() => { /* defaults */ })
    getDoc(doc(db, 'configuracion', 'horarios_personales'))
      .then(s => setHorasPersonales(s.exists() ? ((s.data() as HorariosPersonales).horarios ?? {}) : {}))
      .catch(() => setHorasPersonales({}))
    getDocs(collection(db, 'users'))
      .then(snap => {
        const items: UsuarioApp[] = []
        snap.docs.forEach(d2 => {
          const data = d2.data() as Record<string, unknown>
          if (data.estado === 'activo' && operaEnApp(data.rol as string | undefined)) {
            items.push({ uid: d2.id, nombre: (data.nombre as string) ?? d2.id, rol: (data.rol as string) ?? '' })
          }
        })
        setUsuariosApp(items.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
      })
      .catch(() => setUsuariosApp([]))
  }, [])

  const cargarCruce = useCallback(async () => {
    // Best-effort: si una de las dos lecturas falla, el cruce degrada a
    // "sin respaldo visible" en la cola y los chips — jamás tumba la pestaña.
    try {
      const snap = await getDocs(collection(db, 'ausentismos'))
      setAusentismos(snap.docs.map(d2 => ({ id: d2.id, ...d2.data() }) as Ausentismo))
    } catch { setAusentismos([]) }
    try {
      const corte = claveDia(new Date(Date.now() - RANGO_COLA_SIN_RESPALDO_DIAS * 86_400_000))
      const snap = await getDocs(query(collection(db, 'jornadas'), where('cierre.anticipada', '==', true)))
      const items: Jornada[] = []
      snap.docs.forEach(d2 => {
        const j = normalizarJornada(d2.id, d2.data() as Record<string, unknown>)
        if (j && j.dia >= corte) items.push(j)
      })
      setAnticipadas(items.sort((a, b) => a.dia.localeCompare(b.dia)))
    } catch { setAnticipadas([]) }
  }, [])

  useEffect(() => { cargarCruce() }, [cargarCruce])

  const load = useCallback(async () => {
    if (!desdeStr || !hastaStr) return
    setLoading(true)
    setSinAcceso(false)
    try {
      // `dia` es string YYYY-MM-DD — rango sobre UN campo, sin índice compuesto.
      const snap = await getDocs(query(collection(db, 'jornadas'),
        where('dia', '>=', desdeStr), where('dia', '<=', hastaStr), orderBy('dia', 'desc')))
      const items: Jornada[] = []
      snap.docs.forEach(d2 => {
        const j = normalizarJornada(d2.id, d2.data() as Record<string, unknown>)
        if (j) items.push(j)
      })
      setJornadas(items)
      setAhoraMs(Date.now())
    } catch (e) {
      const denegado = (e as { code?: string } | null)?.code === 'permission-denied'
      setSinAcceso(denegado)
      if (!denegado) toast('Error al cargar la presencia', 'error')
      setJornadas([])
    } finally { setLoading(false) }
  }, [desdeStr, hastaStr])

  useEffect(() => { load() }, [load])

  const cargarHistorico = async () => {
    setVerHistorico(v => !v)
    if (historico !== null) return
    try {
      const inicio = Timestamp.fromDate(inicioDia(parseDateStr(desdeStr)))
      const fin = Timestamp.fromDate(finDia(parseDateStr(hastaStr)))
      const snap = await getDocs(query(collection(db, 'registros_horario'),
        where('fecha', '>=', inicio), where('fecha', '<=', fin), orderBy('fecha', 'desc')))
      const items: RegistroHorario[] = []
      snap.docs.forEach(d2 => {
        const data = d2.data() as Record<string, unknown>
        const fecha = data.fecha as Timestamp | undefined
        if (typeof data.uid !== 'string' || (data.tipo !== 'ingreso' && data.tipo !== 'salida') || !fecha?.toDate) return
        items.push({
          id: d2.id, uid: data.uid,
          nombre: typeof data.nombre === 'string' ? data.nombre : 'Sin nombre',
          rol: typeof data.rol === 'string' ? data.rol : '',
          tipo: data.tipo, fecha,
          ip: typeof data.ip === 'string' ? data.ip : '',
          en_oficina: typeof data.en_oficina === 'boolean' ? data.en_oficina : null,
          dispositivo: data.dispositivo === 'escritorio' || data.dispositivo === 'movil' ? data.dispositivo : 'desconocido',
        })
      })
      setHistorico(items)
    } catch { setHistorico([]) }
  }

  const hoy = claveDia(new Date())
  const presentes = useMemo(() =>
    jornadas.filter(j => j.dia === hoy && presenteAhora(j, ahoraMs, cfg.ventana)),
  [jornadas, hoy, ahoraMs, cfg.ventana])
  const conPresenciaHoy = useMemo(() =>
    new Set(jornadas.filter(j => j.dia === hoy).map(j => j.uid)).size,
  [jornadas, hoy])

  const jornadasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return q ? jornadas.filter(j => j.nombre.toLowerCase().includes(q)) : jornadas
  }, [jornadas, busqueda])

  const jornadasHistorico = useMemo(() => aparearJornadas(historico ?? []), [historico])

  // Cola: anticipadas SIN permiso registrado, con antigüedad (como las otras
  // colas de la casa — lo que no puede quedar invisible es la de hace tres
  // semanas). Encuadre: pendiente de registro, no castigo.
  const sinRespaldo = useMemo(() =>
    anticipadas
      .filter(j => !tieneRespaldo(j.uid, j.dia, ausentismos))
      .map(j => ({ j, dias: Math.floor((Date.now() - parseDateStr(j.dia).getTime()) / 86_400_000) })),
  [anticipadas, ausentismos])

  const puedeRegistrar = puedeRegistrarAusentismoUI(user?.rol)
  const respaldoDe = (j: Jornada): boolean => tieneRespaldo(j.uid, j.dia, ausentismos)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500" title={`Actividad hace menos de ${cfg.ventana} min y sin salida`}>
            En jornada ahora
          </p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{presentes.length}</p>
          {presentes.length > 0 && (
            <p className="text-[11px] text-gray-400 mt-0.5 truncate" title={presentes.map(p => p.nombre).join(', ')}>
              {presentes.map(p => p.nombre.split(' ')[0]).join(' · ')}
            </p>
          )}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500" title="Entrada = inicio de sesión del día">Marcaciones de hoy</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{conPresenciaHoy}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Jornadas del rango</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{jornadas.length}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={rangoHoy} className={pill(esHoyActivo)}>Hoy</button>
        <button onClick={rangoSemana} className={pill(esSemanaActivo)}>Esta semana</button>
        <button onClick={rangoMes} className={pill(esMesActivo)}>Este mes</button>
        <span className="text-gray-300 mx-1">|</span>
        <label className="text-xs text-gray-500 flex items-center gap-1.5">
          Desde
          <input type="date" value={desdeStr} onChange={e => setDesdeStr(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
        </label>
        <label className="text-xs text-gray-500 flex items-center gap-1.5">
          Hasta
          <input type="date" value={hastaStr} onChange={e => setHastaStr(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
        </label>
        <button onClick={load} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50" title="Reevaluar presentes y cierres derivados">
          ↻ Actualizar
        </button>
      </div>

      {/* ── Salidas anticipadas sin respaldo — cola para quien registra
          permisos, no un castigo: normalmente es que el permiso todavía no
          se registró. El rótulo JAMÁS dice el tipo (privacidad: genérico
          uniforme, sin excepciones). ── */}
      {sinRespaldo.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-800">
            ⏱ Salidas anticipadas sin permiso registrado ({sinRespaldo.length})
          </p>
          <p className="text-[11px] text-amber-700 mt-0.5 mb-1.5">
            Salida manual antes de la hora de cierre de esa persona, sin ausentismo que cubra el día.
            Normalmente falta registrar el permiso — el panel registra, no autoriza.
          </p>
          <div className="space-y-1">
            {sinRespaldo.map(({ j, dias }) => (
              <div key={j.id} className="flex items-center gap-3 text-xs">
                <span className="text-gray-800 font-medium">{j.nombre}</span>
                <span className="text-gray-500">{fFechaDia(j.dia)}</span>
                <span className={dias > UMBRAL_SALIDA_SIN_RESPALDO_DIAS
                  ? 'text-red-600 font-semibold'
                  : 'text-gray-400'}
                  title={dias > UMBRAL_SALIDA_SIN_RESPALDO_DIAS
                    ? `Lleva más de ${UMBRAL_SALIDA_SIN_RESPALDO_DIAS} días sin respaldo registrado`
                    : undefined}>
                  hace {dias} día{dias === 1 ? '' : 's'}
                </span>
                {puedeRegistrar && (
                  <button onClick={() => setRegistrarPara({ empleadoUid: j.uid, fecha: j.dia })}
                    className="ml-auto text-[11px] px-2 py-0.5 rounded border border-amber-300 text-amber-800 hover:bg-amber-100 font-medium">
                    Registrar ausentismo
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <h3 className="text-sm font-semibold text-gray-700">
            Marcación de entrada y salida
            <span className="ml-2 text-xs font-normal text-gray-400">
              la entrada es el inicio de sesión; la salida, el cierre — manual o automático
              {horaGeneral && <> · hora de cierre general: <b>{horaGeneral}</b></>}
            </span>
          </h3>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre…"
            className="w-full sm:w-64 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-3 px-4 font-semibold">Persona</th>
                <th className="py-3 px-4 font-semibold">Día</th>
                <th className="py-3 px-4 font-semibold">Entrada</th>
                <th className="py-3 px-4 font-semibold">Última actividad</th>
                <th className="py-3 px-4 font-semibold">Salida</th>
                <th className="py-3 px-4 font-semibold">Ubicación</th>
                <th className="py-3 px-4 font-semibold text-center">Dispositivo</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="py-10 text-center text-gray-400">Cargando…</td></tr>
              )}
              {!loading && sinAcceso && (
                <tr><td colSpan={7} className="py-12 text-center text-gray-400">Sin acceso a la presencia.</td></tr>
              )}
              {!loading && !sinAcceso && jornadasFiltradas.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-gray-400">
                  Sin presencia {busqueda ? 'con esa búsqueda' : 'en este rango'}.
                </td></tr>
              )}
              {!loading && !sinAcceso && jornadasFiltradas.map(j => {
                const cierre = cierreEfectivo(j, ahoraMs, cfg.gracia)
                return (
                  <tr key={j.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <span className="font-medium text-gray-800">{j.nombre}</span>
                      <span className="block text-xs text-gray-400">{j.rol}</span>
                      {horasPersonales[j.uid] && esHoraValida(horasPersonales[j.uid]) && (
                        <span className="inline-flex mt-0.5 px-1.5 py-px rounded text-[10px] font-medium bg-brand-50 text-brand-700"
                          title={`Horario propio — su sesión avisa y cierra a las ${horasPersonales[j.uid]} (la general es ${horaGeneral ?? '—'})`}>
                          cierre {horasPersonales[j.uid]}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-700">{fFechaDia(j.dia)}</td>
                    <td className="py-3 px-4 font-mono text-gray-700"
                      title={j.entrada ? 'Inicio de sesión del día' : 'Sin login registrado — sesión persistida (transición del arranque); la primera actividad fue ' + fHora(j.inicio)}>
                      {j.entrada ? fHora(j.entrada.fecha) : '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-700" title="Último uso del panel (latido)">{fHora(j.ultimo_latido)}</td>
                    <td className="py-3 px-4">
                      {cierre.estado === 'presente' && (
                        <span className="text-xs px-2 py-0.5 rounded border border-dashed border-emerald-300 text-emerald-700">
                          En jornada
                        </span>
                      )}
                      {cierre.estado === 'manual' && (
                        <span className="text-xs text-gray-700" title="La persona cerró sesión">
                          salió <span className="font-mono">{fHora(cierre.fecha)}</span>
                        </span>
                      )}
                      {/* Salida anticipada: tres estados legibles. El rótulo del
                          respaldo es GENÉRICO siempre — jamás el tipo. */}
                      {j.cierre?.anticipada && (
                        respaldoDe(j) ? (
                          <span className="block text-[11px] text-gray-500 mt-0.5"
                            title="Salida manual antes de su hora de cierre, con ausentismo registrado que cubre el día">
                            ⏱ salida anticipada · permiso registrado ✓
                          </span>
                        ) : (
                          <span className="block text-[11px] text-amber-700 mt-0.5"
                            title="Salida manual antes de su hora de cierre, sin ausentismo que cubra el día — normalmente falta registrarlo">
                            ⏱ salida anticipada · sin permiso registrado
                          </span>
                        )
                      )}
                      {cierre.estado === 'automatico' && (
                        <span className="text-xs text-gray-500"
                          title="Salida automática: el cierre de jornada venció sin respuesta, o la sesión quedó sin cerrar y se toma la última actividad">
                          automática <span className="font-mono">{fHora(cierre.fecha)}</span>
                        </span>
                      )}
                      <span className="block text-[10px] text-gray-400 mt-0.5" title="De la entrada (o primera actividad) a la última actividad — no mide horas netas">
                        jornada: {fmtDuracion(j.ultimo_latido.toMillis() - (j.entrada?.fecha ?? j.inicio).toMillis())}
                      </span>
                    </td>
                    <td className="py-3 px-4"><ChipUbicacion enOficina={j.en_oficina_ultimo} inicio={j.en_oficina_inicio} /></td>
                    <td className="py-3 px-4 text-center"><ChipDispositivo dispositivo={j.dispositivo} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Roles que NO se miden aquí (agregado 1 — el hueco de Juan Carlos):
          operan en la app móvil / en obra; un cero en esta pantalla NO es
          ausencia, y se dice — no se deja inferir. Si usan el panel, su
          presencia aparece arriba como la de cualquiera. ── */}
      {usuariosApp.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-xs font-semibold text-gray-600">
            📱 Este módulo no los mide — operan en la app móvil / en obra
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5 mb-1.5">
            La presencia de esta pantalla es del PANEL. Estas personas trabajan por fuera de él:
            que no aparezcan arriba no dice nada sobre si están trabajando.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {usuariosApp.map(u => (
              <span key={u.uid} className="inline-flex items-center gap-1.5 text-xs bg-white border border-gray-200 rounded-full px-2.5 py-0.5 text-gray-700">
                {u.nombre} <span className="text-gray-400">· {u.rol}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Histórico del sistema anterior (marcas por arranque/cierre de
          sesión, congelado — registros_horario es inmutable). ── */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3">
        <button onClick={cargarHistorico} className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <span>{verHistorico ? '▾' : '▸'}</span>
          Registros anteriores — sistema de marcas por inicio/cierre de sesión (congelado)
          {historico !== null && <span className="text-xs font-normal text-gray-400">({jornadasHistorico.length} en el rango)</span>}
        </button>
        {verHistorico && (
          historico === null ? (
            <p className="mt-2 text-xs text-gray-400">Cargando…</p>
          ) : jornadasHistorico.length === 0 ? (
            <p className="mt-2 text-xs text-gray-400">Sin marcas del sistema anterior en este rango.</p>
          ) : (
            <table className="min-w-full text-xs mt-2">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-200">
                  <th className="py-1.5 pr-3 font-medium">Persona</th>
                  <th className="py-1.5 pr-3 font-medium">Día</th>
                  <th className="py-1.5 pr-3 font-medium">Ingreso</th>
                  <th className="py-1.5 pr-3 font-medium">Salida</th>
                  <th className="py-1.5 font-medium">Duración</th>
                </tr>
              </thead>
              <tbody>
                {jornadasHistorico.map((j, i) => (
                  <tr key={`${j.uid}-${j.dia}-${i}`} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3 text-gray-700">{j.nombre}</td>
                    <td className="py-1.5 pr-3 text-gray-500">{fFechaDia(j.dia)}</td>
                    <td className="py-1.5 pr-3 font-mono text-gray-600">{j.ingreso ? fHora(j.ingreso.fecha) : '—'}</td>
                    <td className="py-1.5 pr-3 font-mono text-gray-600">{j.salida ? fHora(j.salida.fecha) : '—'}</td>
                    <td className="py-1.5 text-gray-600">{j.duracionMs !== undefined ? fmtDuracion(j.duracionMs) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* CTA de la cola: registrar el ausentismo prellenado (persona + día).
          El detalle médico dentro del modal sigue gateado aparte (GA+admin). */}
      <AusentismoFormModal
        isOpen={registrarPara !== null}
        onClose={() => setRegistrarPara(null)}
        onSaved={() => { setRegistrarPara(null); void cargarCruce() }}
        puedeGestionar={puedeGestionarHorarioUI(user?.rol)}
        userUid={user?.uid}
        inicial={registrarPara ?? undefined}
      />

      {/* Horarios por persona (gerencia_administrativa + admin) */}
      <HorariosPersonalesCard horaGeneral={horaGeneral} />

      {/* Configuración inline — footer de la pestaña */}
      <ConfigHorarioCard />
    </div>
  )
}
