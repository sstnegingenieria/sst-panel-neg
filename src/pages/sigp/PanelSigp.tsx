// Panel SIGP — Tablero de indicadores de la Gerencia de Proyectos (v2).
//
// CAPA OFICIAL: los 5 indicadores de la Caracterización Integral del Área de
// Proyectos (documento controlado — evidencia ISO 9.1). CAPA OPERATIVA:
// apoyo de gestión diaria (sin estatus ISO). Cálculos client-side
// (utils/sigp/indicadores.ts); sin Cloud Functions nuevas.
//
// Dirección visual v2 (mockup panel_sigp_mockup_v2.html, alineado al Panel
// SST): hero "Así vamos" en gradiente verde→violeta con anillo de salud X/5;
// tarjetas KPI con chip de ícono (ACENTO = identidad del indicador),
// anillo conic (ESTADO = desempeño), pill con texto y sparkline en acento.
// Regla de color: identidad y estado NUNCA se mezclan; el estado siempre
// va acompañado de texto ("En meta"), nunca color solo.
import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useFirestore } from '../../hooks/useFirestore'
import { useAuth } from '../../contexts/AuthContext'
import { toast } from '../../components/shared/Toast'
import { fmtNum } from '../../utils/sigp/formato'
import {
  SEMAFORO_COLOR, ACENTOS, etiquetaPeriodo, ultimosPeriodos,
  indPlanTrabajo, indCalidad, indPresupuesto, indSatisfaccion, indSst,
  embudoDelMes, preventivosDelMes, gruposDonut,
} from '../../utils/sigp/indicadores'
import type { Periodo, ValorIndicador, Semaforo } from '../../utils/sigp/indicadores'
import { puedeGestionarProyectosUI } from '../../types/sigp/permisos'
import type { Proyecto } from '../../types/sigp/proyecto'
import type { Solicitud } from '../../types/sigp/solicitud'

interface DocConFecha { fecha_creacion?: { toDate?: () => Date } }

const hoy = new Date()
const periodoActual: Periodo = { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 }

const mesLargo = (p: Periodo) =>
  new Date(p.anio, p.mes - 1, 1).toLocaleDateString('es-CO', { month: 'long' })

// ── Identidad visual de cada indicador (acento = identidad) ──

type Acento = keyof typeof ACENTOS

const IDENTIDAD: Record<number, { acento: Acento; icono: ReactNode }> = {
  1: {
    acento: 'verde',
    icono: <svg viewBox="0 0 24 24" fill="none" stroke={ACENTOS.verde.tinta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>,
  },
  2: {
    acento: 'violeta',
    icono: <svg viewBox="0 0 24 24" fill="none" stroke={ACENTOS.violeta.tinta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3 6.9 7.6.6-5.8 5 1.8 7.4L12 17.8 5.4 21.9 7.2 14.5 1.4 9.5 9 8.9z" /></svg>,
  },
  3: {
    acento: 'ambar',
    icono: <svg viewBox="0 0 24 24" fill="none" stroke={ACENTOS.ambar.tinta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18v12H3z" /><path d="M16 12h.01" /><path d="M3 10h18" /></svg>,
  },
  4: {
    acento: 'teal',
    icono: <svg viewBox="0 0 24 24" fill="none" stroke={ACENTOS.teal.tinta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path d="M9 9h.01M15 9h.01" /></svg>,
  },
  5: {
    acento: 'naranja',
    icono: <svg viewBox="0 0 24 24" fill="none" stroke={ACENTOS.naranja.tinta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" /></svg>,
  },
}

/** Pill de estado con TEXTO (regla: el color de estado nunca va solo). */
const pillDe = (num: number, ind: ValorIndicador): { texto: string; s: Semaforo } | null => {
  if (ind.valor == null || !ind.semaforo) return null
  if (num === 3 && ind.valor > 110) return { texto: 'Sobre meta', s: ind.semaforo }
  if (ind.semaforo === 'verde') return { texto: 'En meta', s: 'verde' }
  return { texto: 'Bajo meta', s: ind.semaforo }
}

const PILL_CLS: Record<Semaforo, string> = {
  verde: 'bg-[#eef4e7] text-[#3C8B2E]',
  ambar: 'bg-[#fbf3da] text-[#8a6410]',
  rojo: 'bg-[#fbe4e4] text-[#a12b2b]',
}

// ── Tarjeta KPI ──

interface TarjetaProps {
  numero: number
  nombre: string
  meta: string
  frecuencia: string
  fuente: string
  ind: ValorIndicador
  subtitulo: string
  tendencia?: { etiqueta: string; valor: number | null }[]
  children?: ReactNode
}

function TarjetaKpi({ numero, nombre, meta, frecuencia, fuente, ind, subtitulo, tendencia, children }: TarjetaProps) {
  const idv = IDENTIDAD[numero]
  const acento = ACENTOS[idv.acento]
  const pill = pillDe(numero, ind)
  const estadoColor = ind.semaforo ? SEMAFORO_COLOR[ind.semaforo] : '#d1d5db'
  const anillo = ind.valor == null ? 0 : Math.min(ind.valor, 100)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-[18px] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg flex flex-col">
      {/* head: chip de identidad + nombre + punto de estado */}
      <div className="flex items-center gap-3 mb-3.5">
        <div className="w-[38px] h-[38px] rounded-xl grid place-items-center flex-none" style={{ backgroundColor: acento.suave }}>
          <span className="w-5 h-5 block">{idv.icono}</span>
        </div>
        <p className="text-sm font-bold text-gray-800 leading-tight flex-1">
          <span className="text-[11px] font-extrabold text-gray-300">{numero} · </span>{nombre}
        </p>
        <span className="w-[11px] h-[11px] rounded-full flex-none" style={{ backgroundColor: estadoColor }} />
      </div>

      {/* body: anillo de desempeño + info */}
      <div className="flex items-center gap-4">
        <div className="w-[78px] h-[78px] rounded-full grid place-items-center flex-none"
          style={{ background: ind.valor == null ? '#edf0ec' : `conic-gradient(${estadoColor} ${anillo}%, #edf0ec 0)` }}>
          <b className="w-[58px] h-[58px] bg-white rounded-full grid place-items-center text-[15px] font-extrabold"
            style={{ color: ind.valor == null ? '#9aa1ab' : estadoColor }}>
            {ind.valor == null ? '—' : `${fmtNum(ind.valor)}%`}
          </b>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 mb-2">{subtitulo}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {pill ? (
              <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md ${PILL_CLS[pill.s]}`}>{pill.texto}</span>
            ) : (
              <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-400">Sin datos aún</span>
            )}
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{frecuencia}</span>
          </div>
          {children}
        </div>
      </div>

      {/* sparkline en el ACENTO del indicador */}
      {tendencia && tendencia.some(t => t.valor != null) && (
        <div className="flex items-end gap-[3px] h-6 mt-3.5">
          {tendencia.map((t, i) => (
            <i key={i} className="flex-1 rounded-t-sm"
              title={`${t.etiqueta}: ${t.valor == null ? 'sin datos' : fmtNum(t.valor) + '%'}`}
              style={{
                height: `${t.valor == null ? 8 : Math.max(12, (Math.min(t.valor, 120) / 120) * 100)}%`,
                backgroundColor: t.valor == null ? '#e8eae7' : acento.base,
                opacity: i === tendencia.length - 1 ? 1 : 0.45,
              }} />
          ))}
        </div>
      )}

      <div className="mt-auto pt-2.5 border-t border-dashed border-gray-100 flex justify-between gap-2 text-[10.5px] text-gray-400 mt-3">
        <span>Meta {meta}</span>
        <span className="truncate" title={fuente}>Fuente: {fuente}</span>
      </div>
    </div>
  )
}

// ── Página ──

export default function PanelSigp() {
  const { getAll } = useFirestore()
  const { user } = useAuth()
  const puedeGestionar = puedeGestionarProyectosUI(user?.rol)

  const [periodo, setPeriodo] = useState<Periodo>(periodoActual)
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [visitas, setVisitas] = useState<DocConFecha[]>([])
  const [cotizaciones, setCotizaciones] = useState<DocConFecha[]>([])
  const [sstManual, setSstManual] = useState<number | null>(null)
  const [sstInput, setSstInput] = useState('')
  const [loading, setLoading] = useState(true)

  const docSst = `sst_${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pr, so, vi, co] = await Promise.all([
        getAll('proyectos'), getAll('solicitudes'), getAll('visitas'), getAll('cotizaciones'),
      ])
      setProyectos(pr as Proyecto[])
      setSolicitudes(so as Solicitud[])
      setVisitas(vi as DocConFecha[])
      setCotizaciones(co as DocConFecha[])
    } catch {
      toast('Error al cargar los datos del panel', 'error')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // Ind. 5 — valor manual del periodo (colección `indicadores`, doc sst_YYYY-MM)
  useEffect(() => {
    setSstManual(null)
    getDoc(doc(db, 'indicadores', docSst))
      .then(s => {
        const v = s.exists() ? (s.data().valor as number) : null
        setSstManual(v)
        setSstInput(v != null ? String(v) : '')
      })
      .catch(() => {})
  }, [docSst])

  const guardarSst = async () => {
    const v = Number(sstInput.replace(',', '.'))
    if (!Number.isFinite(v) || v < 0 || v > 100) { toast('Valor inválido (0–100)', 'error'); return }
    try {
      await setDoc(doc(db, 'indicadores', docSst), {
        valor: v, fuente: 'manual', por: user?.uid ?? '', fecha: Timestamp.now(),
      })
      setSstManual(v)
      toast('Indicador SST registrado (manual)')
    } catch { toast('No se pudo guardar el registro manual', 'error') }
  }

  // ── Cálculos ──
  const ind1 = useMemo(() => indPlanTrabajo(proyectos), [proyectos])
  const ind2 = useMemo(() => indCalidad(proyectos, periodo), [proyectos, periodo])
  const ind3 = useMemo(() => indPresupuesto(proyectos), [proyectos])
  const ind4 = useMemo(() => indSatisfaccion(proyectos, periodo), [proyectos, periodo])
  const ind5 = useMemo(() => indSst(sstManual), [sstManual])
  const indicadores = [ind1, ind2, ind3, ind4, ind5]

  const enMeta = indicadores.filter(i => i.semaforo === 'verde').length
  const sinDatos = indicadores.filter(i => i.valor == null).length
  const conAlerta = indicadores.filter(i => i.semaforo && i.semaforo !== 'verde').length

  const fraseResumen = sinDatos === 5
    ? 'El periodo aún no tiene registros — los indicadores se encienden solos a medida que el equipo opera.'
    : conAlerta === 0 && sinDatos === 0
      ? `Vamos muy bien: los 5 indicadores del proceso están en meta este mes.`
      : `${enMeta} de los 5 indicadores del proceso están en meta este mes${conAlerta > 0 ? `; ${conAlerta} requiere${conAlerta > 1 ? 'n' : ''} atención` : ''}${sinDatos > 0 ? ` (${sinDatos} sin datos aún)` : ''}.`

  const tend2 = useMemo(() => ultimosPeriodos(periodo, 6).map(per => ({
    etiqueta: etiquetaPeriodo(per), valor: indCalidad(proyectos, per).valor,
  })), [periodo, proyectos])
  const tend4 = useMemo(() => ultimosPeriodos(periodo, 6).map(per => ({
    etiqueta: etiquetaPeriodo(per), valor: indSatisfaccion(proyectos, per).valor,
  })), [periodo, proyectos])

  const donut = useMemo(() => gruposDonut(proyectos), [proyectos])
  const totalDonut = donut.reduce((s, g) => s + g.count, 0)
  const DONUT_COLORES = [ACENTOS.teal.base, ACENTOS.verde.base, ACENTOS.violeta.base, ACENTOS.naranja.base, ACENTOS.ambar.base]
  const donutCss = useMemo(() => {
    if (totalDonut === 0) return '#edf0ec'
    let acc = 0
    const stops = donut.map((g, i) => {
      const desde = (acc / totalDonut) * 100
      acc += g.count
      const hasta = (acc / totalDonut) * 100
      return `${DONUT_COLORES[i]} ${desde}% ${hasta}%`
    })
    return `conic-gradient(${stops.join(',')})`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donut, totalDonut])

  const embudo = useMemo(() => embudoDelMes(solicitudes, visitas, cotizaciones, proyectos, periodo),
    [solicitudes, visitas, cotizaciones, proyectos, periodo])
  const preventivos = useMemo(() => preventivosDelMes(solicitudes, proyectos, periodo), [solicitudes, proyectos, periodo])

  const RAMPA_FUNNEL = ['#628E3A', '#6a9642', '#7fa85c', '#98bd7a']
  const pasosEmbudo: [string, number][] = [
    ['Solicitudes', embudo.solicitudes],
    ['Visitas técnicas', embudo.visitas],
    ['Cotizaciones', embudo.cotizaciones],
    ['Proyectos', embudo.proyectos],
  ]
  const conversion = embudo.solicitudes > 0 ? (embudo.proyectos / embudo.solicitudes) * 100 : null

  return (
    <div className="max-w-6xl mx-auto space-y-5">

      {/* ═══ HERO "Así vamos" — gradiente verde→violeta ═══ */}
      <div className="relative overflow-hidden rounded-2xl text-white px-7 py-6 flex flex-wrap items-center gap-6"
        style={{ background: 'linear-gradient(120deg,#5b8636 0%,#6E56CF 155%)' }}>
        <div className="absolute -right-10 -top-10 w-64 h-64 rounded-full bg-white/5 pointer-events-none" />
        <div className="flex-1 min-w-[260px] relative">
          <p className="text-xs font-bold tracking-[1.2px] uppercase opacity-85">Panel SIGP · Gerencia de Proyectos</p>
          <h1 className="text-3xl font-extrabold tracking-tight mt-1 mb-2">Así vamos en {mesLargo(periodo)} 👷</h1>
          <p className="text-[15px] opacity-95 max-w-xl">{fraseResumen}</p>
          <span className="inline-flex items-center gap-2 mt-3.5 bg-white/15 px-3 py-1.5 rounded-full text-[11.5px] font-semibold">
            🎯 Seguimiento ISO 9.1 · Caracterización del proceso · Responsable: Gerente de Proyectos
          </span>
        </div>
        <div className="text-center relative flex-none">
          <label className="inline-flex items-center gap-2 bg-white/15 px-3 py-1.5 rounded-lg text-[13px] font-semibold mb-3 cursor-pointer">
            📅
            <input type="month"
              value={`${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`}
              onChange={e => {
                const [a, m] = e.target.value.split('-').map(Number)
                if (a && m) setPeriodo({ anio: a, mes: m })
              }}
              className="bg-transparent text-white text-[13px] font-semibold focus:outline-none [color-scheme:dark]" />
          </label>
          <div className="w-[132px] h-[132px] rounded-full grid place-items-center mx-auto"
            style={{ background: `conic-gradient(#fff ${(enMeta / 5) * 100}%, rgba(255,255,255,.28) 0)` }}>
            <div className="w-[104px] h-[104px] rounded-full grid place-items-center"
              style={{ background: 'linear-gradient(135deg,#5b8636,#527a30)' }}>
              <span className="text-[38px] font-extrabold leading-none">{enMeta}<small className="text-base opacity-85">/5</small></span>
            </div>
          </div>
          <p className="text-[11.5px] mt-2 opacity-90">indicadores en meta</p>
        </div>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-gray-400">Cargando indicadores…</p>
      ) : (
        <>
          {/* ═══ CAPA OFICIAL ═══ */}
          <div>
            <p className="text-xs font-extrabold text-gray-500 uppercase tracking-wide mt-1 mb-0.5 px-1">
              Indicadores oficiales del proceso <span className="normal-case font-semibold text-gray-400">· la evidencia de seguimiento y medición (ISO 9001 / 14001 / 45001)</span>
            </p>
            <p className="text-xs text-gray-400 px-1 mb-3">
              Cada tarjeta se calcula sola desde el sistema. Anillo = desempeño vs. meta · color del ícono = identidad del indicador.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <TarjetaKpi numero={1} nombre="Cumplimiento del plan de trabajo"
                meta="80–100 %" frecuencia="Mensual" fuente="SIGP · plan de actividades" ind={ind1}
                subtitulo={ind1.valor != null ? `${ind1.numerador} / ${ind1.denominador} actividades ejecutadas (corte)` : 'Se calcula del plan de actividades de los proyectos en gestión'} />

              <TarjetaKpi numero={2} nombre="Características técnicas y calidad"
                meta="≥ 90 %" frecuencia="Por proyecto" fuente="acta de entrega · calidad 1–5" ind={ind2} tendencia={tend2}
                subtitulo={ind2.valor != null ? `${ind2.numerador} / ${ind2.denominador} entregas con calif. ≥ 4` : 'Entregas del periodo con calificación de calidad'} />

              <TarjetaKpi numero={3} nombre="Proyección presupuestal"
                meta="90–110 %" frecuencia="Mensual" fuente="preliquidación · costo/valor" ind={ind3}
                subtitulo={ind3.valor != null ? 'Σ ejecutado / Σ proyectado (corte)' : 'Requiere el costo ejecutado en la preliquidación'} />

              <TarjetaKpi numero={4} nombre="Satisfacción del cliente"
                meta="≥ 90 %" frecuencia="Por proyecto" fuente="encuesta al cierre · 1–5" ind={ind4} tendencia={tend4}
                subtitulo={ind4.valor != null ? `${ind4.numerador} / ${ind4.denominador} encuestas con puntaje ≥ 4` : 'Encuestas de satisfacción del periodo'} />

              <TarjetaKpi numero={5} nombre="Requisitos ambientales y SST"
                meta="≥ 95 %" frecuencia="Mensual" fuente="Panel SST · proceso cruzado" ind={ind5}
                subtitulo={sstManual != null ? 'Registro manual del periodo (Panel SST)' : 'Aún sin integración con el Panel SST'}>
                {puedeGestionar && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <input value={sstInput} onChange={e => setSstInput(e.target.value)} placeholder="%"
                      className="w-16 text-xs px-2 py-1 border border-gray-200 rounded text-right font-mono focus:outline-none focus:ring-1 focus:ring-brand-300" />
                    <button onClick={guardarSst}
                      className="text-[11px] px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                      Registrar manual
                    </button>
                  </div>
                )}
              </TarjetaKpi>

              {/* Nota de integración (ind. 5) */}
              <div className="rounded-2xl border border-dashed border-gray-300 bg-[#fbfcfa] p-[18px] flex flex-col justify-center">
                <p className="text-sm font-bold text-gray-700 mb-1.5">Nota de integración</p>
                <p className="text-xs text-gray-500">
                  El indicador <b>5</b> se alimenta del <b>Panel SST</b> (proceso cruzado). Hasta la integración con esa
                  área puede registrarse manual — marcado como "registro manual" — sin afectar los otros cuatro.
                </p>
              </div>
            </div>
          </div>

          {/* ═══ CAPA OPERATIVA ═══ */}
          <div>
            <p className="text-xs font-extrabold text-gray-500 uppercase tracking-wide mt-2 mb-0.5 px-1">
              Gestión operativa <span className="normal-case font-semibold text-gray-400">· apoyo para el día a día (sin estatus ISO)</span>
            </p>
            <p className="text-xs text-gray-400 px-1 mb-3">Indicadores anticipados del área. No son indicadores oficiales de la caracterización.</p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Donut categórica: proyectos por estado agrupado */}
              <div className="bg-white rounded-2xl border border-gray-200 p-[18px]">
                <h3 className="text-[13.5px] font-bold text-gray-800 mb-4">Proyectos por estado agrupado</h3>
                {totalDonut === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">Sin proyectos activos aún.</p>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="w-[132px] h-[132px] rounded-full relative flex-none" style={{ background: donutCss }}>
                      <div className="absolute inset-[22px] bg-white rounded-full grid place-items-center text-center">
                        <span className="text-xl font-extrabold text-gray-800 leading-none">
                          {totalDonut}
                          <small className="block text-[9.5px] text-gray-400 font-semibold">activos</small>
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 text-[11.5px] flex-1">
                      {donut.map((g, i) => (
                        <div key={g.key} className="flex items-center gap-2">
                          <span className="w-[9px] h-[9px] rounded flex-none" style={{ backgroundColor: DONUT_COLORES[i] }} />
                          <span className="text-gray-600">{g.label}</span>
                          <b className="ml-auto font-mono text-gray-800">{g.count}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-gray-400 mt-3.5">Alcance de Proyectos: hasta <b>enviado a facturación</b>.</p>
              </div>

              {/* Embudo comercial (funnel verde, rampa ordinal) */}
              <div className="bg-white rounded-2xl border border-gray-200 p-[18px]">
                <h3 className="text-[13.5px] font-bold text-gray-800 mb-4">Embudo comercial · {mesLargo(periodo)}</h3>
                <div className="flex flex-col gap-2">
                  {pasosEmbudo.map(([label, n], i) => (
                    <div key={label}
                      className="flex justify-between items-center rounded-lg px-3.5 py-2 text-white text-[12.5px] font-semibold"
                      style={{ backgroundColor: RAMPA_FUNNEL[i], marginLeft: i * 6, marginRight: i * 6 }}>
                      {label} <span className="text-[15px] font-extrabold">{n}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-3.5">
                  {conversion == null ? 'Sin solicitudes en el periodo.' : <>Conversión solicitud → proyecto: <b>{fmtNum(conversion)}%</b></>}
                </p>
              </div>

              {/* Preventivos IHS (tiles) */}
              <div className="bg-white rounded-2xl border border-gray-200 p-[18px]">
                <h3 className="text-[13.5px] font-bold text-gray-800 mb-4">Preventivos IHS · {mesLargo(periodo)}</h3>
                <div className="grid grid-cols-2 gap-2.5">
                  {([
                    ['Programados', preventivos.programados, ACENTOS.verde.base],
                    ['Ejecutados', preventivos.ejecutados, ACENTOS.teal.base],
                    ['En ejecución', preventivos.enEjecucion, ACENTOS.ambar.base],
                    ['Pendientes', preventivos.pendientes, SEMAFORO_COLOR.rojo],
                  ] as [string, number, string][]).map(([label, n, color]) => (
                    <div key={label} className="rounded-xl py-2.5 text-center bg-[#f5f7f4]">
                      <p className="text-[22px] font-extrabold leading-tight" style={{ color }}>{n}</p>
                      <p className="text-[10.5px] text-gray-500">{label}</p>
                    </div>
                  ))}
                  <div className="col-span-2 rounded-xl py-2.5 text-center bg-[#eef4e7]">
                    <p className="text-[22px] font-extrabold leading-tight text-[#4d712c]">{preventivos.entregablesOk}</p>
                    <p className="text-[10.5px] text-[#4d712c]">Con entregables IHS completos (3/3)</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
