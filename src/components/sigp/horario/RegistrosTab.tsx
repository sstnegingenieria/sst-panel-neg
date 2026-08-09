// Pestaña "Registros" de Horario y asistencia — bandeja de reportes de reloj,
// SOLO LECTURA (registros_horario lo escribe la CF registrarEventoHorario).
// Un solo campo (`fecha`) en el where — sin índice compuesto, consistente
// con el patrón del resto del panel. aparearJornadas() (puro, en
// types/sigp/horario.ts) hace toda la interpretación de ingreso↔salida.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Timestamp, collection, getDocs, orderBy, query, where } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { toast } from '../../shared/Toast'
import { aparearJornadas, claveDia, fmtDuracion } from '../../../types/sigp/horario'
import type { DispositivoHorario, RegistroHorario } from '../../../types/sigp/horario'
import ConfigHorarioCard from './ConfigHorarioCard'

function inicioDia(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0) }
function finDia(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999) }

function toDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function lunesDeSemana(d: Date): Date {
  const dia = d.getDay() // 0 = domingo
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

function ChipUbicacion({ enOficina }: { enOficina: boolean | null | undefined }) {
  if (enOficina === true) return <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">🏢 Oficina</span>
  if (enOficina === false) return <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">🌐 Remoto</span>
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

export default function RegistrosTab() {
  const hoyDate = new Date()
  const [desdeStr, setDesdeStr] = useState(() => toDateStr(new Date()))
  const [hastaStr, setHastaStr] = useState(() => toDateStr(new Date()))
  const [eventos, setEventos] = useState<RegistroHorario[]>([])
  const [loading, setLoading] = useState(true)
  const [sinAcceso, setSinAcceso] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const rangoHoy = () => { const s = toDateStr(hoyDate); setDesdeStr(s); setHastaStr(s) }
  const rangoSemana = () => { setDesdeStr(toDateStr(lunesDeSemana(hoyDate))); setHastaStr(toDateStr(hoyDate)) }
  const rangoMes = () => { setDesdeStr(toDateStr(primerDiaMes(hoyDate))); setHastaStr(toDateStr(hoyDate)) }

  const esHoyActivo = desdeStr === toDateStr(hoyDate) && hastaStr === toDateStr(hoyDate)
  const esSemanaActivo = desdeStr === toDateStr(lunesDeSemana(hoyDate)) && hastaStr === toDateStr(hoyDate)
  const esMesActivo = desdeStr === toDateStr(primerDiaMes(hoyDate)) && hastaStr === toDateStr(hoyDate)

  const load = useCallback(async () => {
    if (!desdeStr || !hastaStr) return
    setLoading(true)
    setSinAcceso(false)
    try {
      const inicio = Timestamp.fromDate(inicioDia(parseDateStr(desdeStr)))
      const fin = Timestamp.fromDate(finDia(parseDateStr(hastaStr)))
      const snap = await getDocs(query(collection(db, 'registros_horario'),
        where('fecha', '>=', inicio), where('fecha', '<=', fin), orderBy('fecha', 'desc')))
      const items: RegistroHorario[] = []
      snap.docs.forEach(docSnap => {
        const data = docSnap.data() as Record<string, unknown>
        const fecha = data.fecha as Timestamp | undefined
        // Defensivo: un doc malformado (sin uid/tipo/fecha válidos) no debe tumbar la bandeja.
        if (typeof data.uid !== 'string' || (data.tipo !== 'ingreso' && data.tipo !== 'salida') || !fecha?.toDate) return
        items.push({
          id: docSnap.id,
          uid: data.uid,
          nombre: typeof data.nombre === 'string' ? data.nombre : 'Sin nombre',
          rol: typeof data.rol === 'string' ? data.rol : '',
          tipo: data.tipo,
          fecha,
          ip: typeof data.ip === 'string' ? data.ip : '',
          en_oficina: typeof data.en_oficina === 'boolean' ? data.en_oficina : null,
          dispositivo: data.dispositivo === 'escritorio' || data.dispositivo === 'movil' ? data.dispositivo : 'desconocido',
        })
      })
      setEventos(items)
    } catch (e) {
      const denegado = (e as { code?: string } | null)?.code === 'permission-denied'
      setSinAcceso(denegado)
      if (!denegado) toast('Error al cargar los registros de horario', 'error')
      setEventos([])
    } finally { setLoading(false) }
  }, [desdeStr, hastaStr])

  useEffect(() => { load() }, [load])

  const jornadas = useMemo(() => aparearJornadas(eventos), [eventos])
  const hoy = claveDia(new Date())
  const sinSalida = useMemo(() => jornadas.filter(j => j.abierta && j.dia !== hoy), [jornadas, hoy])
  const personasHoy = useMemo(() => new Set(jornadas.filter(j => j.dia === hoy).map(j => j.uid)).size, [jornadas, hoy])

  const jornadasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return q ? jornadas.filter(j => j.nombre.toLowerCase().includes(q)) : jornadas
  }, [jornadas, busqueda])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Personas con jornada hoy</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{personasHoy}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Jornadas del rango</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{jornadas.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Sin salida (días previos)</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{sinSalida.length}</p>
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
      </div>

      {/* "Sin salida" va ARRIBA de la tabla — anomalía que merece atención
          antes que el detalle fila por fila (solo jornadas abiertas de
          días PREVIOS a hoy; una jornada abierta de hoy es normal). */}
      {!loading && !sinAcceso && sinSalida.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">⚠ Sin salida</h3>
          <ul className="space-y-1.5">
            {sinSalida.map((j, i) => (
              <li key={`${j.uid}-${j.dia}-${i}`} className="text-sm text-amber-900 flex items-center gap-2 flex-wrap">
                <span className="font-medium">{j.nombre}</span>
                <span className="text-amber-400">·</span>
                <span>{fFechaDia(j.dia)}</span>
                <span className="text-amber-400">·</span>
                <span className="font-mono">{j.ingreso ? fHora(j.ingreso.fecha) : '—'}</span>
                <span className="text-amber-700 text-xs">— ingreso sin salida registrada, recordar cerrar sesión</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <h3 className="text-sm font-semibold text-gray-700">Jornadas</h3>
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
                <th className="py-3 px-4 font-semibold">Ingreso</th>
                <th className="py-3 px-4 font-semibold">Salida</th>
                <th className="py-3 px-4 font-semibold">Duración</th>
                <th className="py-3 px-4 font-semibold">Ubicación</th>
                <th className="py-3 px-4 font-semibold text-center">Dispositivo</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="py-10 text-center text-gray-400">Cargando…</td></tr>
              )}
              {!loading && sinAcceso && (
                <tr><td colSpan={7} className="py-12 text-center text-gray-400">Sin acceso a los registros.</td></tr>
              )}
              {!loading && !sinAcceso && jornadasFiltradas.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-gray-400">
                  No hay jornadas {busqueda ? 'con esa búsqueda' : 'en este rango'}.
                </td></tr>
              )}
              {!loading && !sinAcceso && jornadasFiltradas.map((j, i) => {
                const salidaHuerfana = !j.ingreso && j.salida
                return (
                  <tr key={`${j.uid}-${j.dia}-${i}`} className="border-b border-gray-100 hover:bg-gray-50"
                    title={salidaHuerfana ? 'Salida sin ingreso ese día' : undefined}>
                    <td className="py-3 px-4">
                      <span className="font-medium text-gray-800">{j.nombre}</span>
                      <span className="block text-xs text-gray-400">{j.rol}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-700">{fFechaDia(j.dia)}</td>
                    <td className="py-3 px-4 font-mono text-gray-700">{j.ingreso ? fHora(j.ingreso.fecha) : '—'}</td>
                    <td className="py-3 px-4 font-mono text-gray-700">
                      {j.salida
                        ? fHora(j.salida.fecha)
                        : j.abierta && j.dia === hoy
                          ? <span className="text-xs px-2 py-0.5 rounded border border-dashed border-emerald-300 text-emerald-700">en jornada</span>
                          : '—'}
                    </td>
                    <td className="py-3 px-4 text-gray-700">{j.duracionMs !== undefined ? fmtDuracion(j.duracionMs) : '—'}</td>
                    <td className="py-3 px-4"><ChipUbicacion enOficina={j.ingreso?.en_oficina ?? j.salida?.en_oficina} /></td>
                    <td className="py-3 px-4 text-center"><ChipDispositivo dispositivo={j.ingreso?.dispositivo ?? j.salida?.dispositivo} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Configuración inline — footer de la pestaña */}
      <ConfigHorarioCard />
    </div>
  )
}
