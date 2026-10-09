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
import { toast } from '../../shared/Toast'
import { aparearJornadas, claveDia, fmtDuracion } from '../../../types/sigp/horario'
import type { ConfigHorario, DispositivoHorario, RegistroHorario } from '../../../types/sigp/horario'
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
  const hoyDate = new Date()
  const [desdeStr, setDesdeStr] = useState(() => toDateStr(new Date()))
  const [hastaStr, setHastaStr] = useState(() => toDateStr(new Date()))
  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [usuariosApp, setUsuariosApp] = useState<UsuarioApp[]>([])
  const [cfg, setCfg] = useState<{ gracia: number; ventana: number }>({
    gracia: GRACIA_CIERRE_MIN_DEFAULT, ventana: VENTANA_PRESENTE_MIN_DEFAULT,
  })
  const [loading, setLoading] = useState(true)
  const [sinAcceso, setSinAcceso] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  // El reloj de la vista: se fija por carga (los derivados "presente/
  // automático" se evalúan contra este instante, no contra un timer vivo).
  const [ahoraMs, setAhoraMs] = useState(() => Date.now())
  // Histórico del sistema anterior (marcas ingreso/salida) — lazy al abrir.
  const [verHistorico, setVerHistorico] = useState(false)
  const [historico, setHistorico] = useState<RegistroHorario[] | null>(null)

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
      })
      .catch(() => { /* defaults */ })
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500" title={`Latido hace menos de ${cfg.ventana} min y sin salida manual`}>
            Presentes ahora
          </p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{presentes.length}</p>
          {presentes.length > 0 && (
            <p className="text-[11px] text-gray-400 mt-0.5 truncate" title={presentes.map(p => p.nombre).join(', ')}>
              {presentes.map(p => p.nombre.split(' ')[0]).join(' · ')}
            </p>
          )}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Con presencia hoy</p>
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

      <div>
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <h3 className="text-sm font-semibold text-gray-700">
            Presencia
            <span className="ml-2 text-xs font-normal text-gray-400">
              panel en uso — el latido corre con la interacción, no con la pestaña abierta
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
                <th className="py-3 px-4 font-semibold">Primera presencia</th>
                <th className="py-3 px-4 font-semibold">Última presencia</th>
                <th className="py-3 px-4 font-semibold">Cierre</th>
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
                    </td>
                    <td className="py-3 px-4 text-gray-700">{fFechaDia(j.dia)}</td>
                    <td className="py-3 px-4 font-mono text-gray-700">{fHora(j.inicio)}</td>
                    <td className="py-3 px-4 font-mono text-gray-700">{fHora(j.ultimo_latido)}</td>
                    <td className="py-3 px-4">
                      {cierre.estado === 'presente' && (
                        <span className="text-xs px-2 py-0.5 rounded border border-dashed border-emerald-300 text-emerald-700">
                          Presente ahora
                        </span>
                      )}
                      {cierre.estado === 'manual' && (
                        <span className="text-xs text-gray-700" title="La persona cerró sesión">
                          salió <span className="font-mono">{fHora(cierre.fecha)}</span>
                        </span>
                      )}
                      {cierre.estado === 'automatico' && (
                        <span className="text-xs text-gray-500"
                          title={`Sin latido hace más de ${cfg.gracia} min — cierre derivado en la última presencia (caso normal: nadie tiene que acordarse de salir)`}>
                          automático <span className="font-mono">{fHora(cierre.fecha)}</span>
                        </span>
                      )}
                      <span className="block text-[10px] text-gray-400 mt-0.5" title="Primera a última presencia del día — no mide horas netas de trabajo">
                        presencia: {fmtDuracion(j.ultimo_latido.toMillis() - j.inicio.toMillis())}
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

      {/* Configuración inline — footer de la pestaña */}
      <ConfigHorarioCard />
    </div>
  )
}
