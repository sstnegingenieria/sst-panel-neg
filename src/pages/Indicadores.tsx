import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useAuth } from '../contexts/AuthContext'
import { useIndicadores } from '../hooks/useIndicadores'
import { puedeGestionarIndicadoresSstUI } from '../types/sigp/permisos'
import type { Indicador, IndicadorMedicion, TipoIndicador } from '../types/indicador'
import { TIPO_INDICADOR_LABELS } from '../types/indicador'
import { calcularValor, colorSemaforo, formatoValor, SEMAFORO_LABEL } from '../utils/indicadoresCalc'
import IndicadorCard from '../components/IndicadorCard'
import IndicadorDetalleModal from '../components/IndicadorDetalleModal'
import { toast } from '../components/shared/Toast'

const PERIODO_ACTUAL = '2026'

export default function Indicadores() {
  const { user } = useAuth()
  const { cargarCatalogo, cargarTodasMediciones, guardarMedicion, sembrarCatalogoSiFalta } = useIndicadores()
  const puedeGestionar = puedeGestionarIndicadoresSstUI(user?.rol)

  const [catalogo, setCatalogo] = useState<Indicador[]>([])
  const [mediciones, setMediciones] = useState<IndicadorMedicion[]>([])
  const [cargando, setCargando] = useState(true)
  const [sembrando, setSembrando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [indicadorAbierto, setIndicadorAbierto] = useState<Indicador | null>(null)
  const [filtroTipo, setFiltroTipo] = useState<TipoIndicador | ''>('')
  const [busqueda, setBusqueda] = useState('')

  const cargarTodo = async () => {
    setCargando(true)
    const [cat, med] = await Promise.all([cargarCatalogo(), cargarTodasMediciones()])
    setCatalogo(cat)
    setMediciones(med)
    setCargando(false)
  }

  useEffect(() => {
    cargarTodo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const medicionesPorIndicador = useMemo(() => {
    const mapa = new Map<string, IndicadorMedicion[]>()
    for (const m of mediciones) {
      const lista = mapa.get(m.indicador_id) ?? []
      lista.push(m)
      mapa.set(m.indicador_id, lista)
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.periodo.localeCompare(b.periodo))
    return mapa
  }, [mediciones])

  const catalogoFiltrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return catalogo.filter(ind =>
      (!filtroTipo || ind.tipo === filtroTipo)
      && (!q || ind.nombre.toLowerCase().includes(q) || ind.codigo.toLowerCase().includes(q)))
  }, [catalogo, filtroTipo, busqueda])

  const handleSembrar = async () => {
    setSembrando(true)
    try {
      const n = await sembrarCatalogoSiFalta()
      toast(n > 0 ? `Catálogo sembrado: ${n} indicadores` : 'El catálogo ya estaba completo')
      await cargarTodo()
    } catch {
      toast('No se pudo sembrar el catálogo', 'error')
    } finally {
      setSembrando(false)
    }
  }

  const handleGuardarMedicion = async (datos: { numerador: number; denominador: number; meta: number; interpretacion: string }) => {
    if (!indicadorAbierto || !user) return
    setGuardando(true)
    try {
      const existente = medicionesPorIndicador.get(indicadorAbierto.id)?.find(m => m.periodo === PERIODO_ACTUAL)
      await guardarMedicion(indicadorAbierto.id, PERIODO_ACTUAL, datos, user.uid, existente?.id)
      toast('Medición guardada')
      setIndicadorAbierto(null)
      await cargarTodo()
    } catch {
      toast('No se pudo guardar la medición', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const exportarExcel = () => {
    const rows = catalogo.map(ind => {
      const m = medicionesPorIndicador.get(ind.id)?.find(x => x.periodo === PERIODO_ACTUAL)
      const valor = m ? calcularValor(m.numerador, m.denominador, ind.factor) : null
      const semaforo = valor != null && m && !ind.pendiente_validacion
        ? SEMAFORO_LABEL[colorSemaforo(valor, m.meta, ind.factor)]
        : ind.pendiente_validacion ? 'Pendiente de validación' : 'Sin medición'
      return {
        Código: ind.codigo,
        Indicador: ind.nombre,
        Tipo: TIPO_INDICADOR_LABELS[ind.tipo],
        Numerador: m?.numerador ?? '',
        Denominador: m?.denominador ?? '',
        Valor: formatoValor(valor, ind.factor),
        Meta: m ? `${(m.meta * 100).toLocaleString('es-CO')}%` : '',
        Estado: semaforo,
        Interpretación: m?.interpretacion ?? '',
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `Indicadores ${PERIODO_ACTUAL}`)
    XLSX.writeFile(wb, `Indicadores_SGSST_${PERIODO_ACTUAL}.xlsx`)
  }

  const indicadorAbiertoHistorico = indicadorAbierto ? (medicionesPorIndicador.get(indicadorAbierto.id) ?? []) : []

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-display font-bold text-gray-900">Indicadores SG-SST</h1>
          <p className="text-sm text-gray-500">Plan de evaluación por indicadores (SST-PLA-EI-24) — periodo {PERIODO_ACTUAL}</p>
        </div>
        <button
          onClick={exportarExcel}
          disabled={catalogo.length === 0}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
        >
          Exportar informe
        </button>
      </div>

      {!cargando && catalogo.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center mb-6">
          <p className="text-sm text-gray-500 mb-3">Todavía no se ha sembrado el catálogo de indicadores.</p>
          {puedeGestionar ? (
            <button
              onClick={handleSembrar}
              disabled={sembrando}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-700 hover:bg-brand-800 text-white transition disabled:opacity-50"
            >
              {sembrando ? 'Sembrando…' : 'Sembrar catálogo (26 indicadores)'}
            </button>
          ) : (
            <p className="text-xs text-gray-400">Pídele a SST o Gestión Integral que lo siembre.</p>
          )}
        </div>
      )}

      {catalogo.length > 0 && (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar indicador…"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
            />
            <select
              value={filtroTipo}
              onChange={e => setFiltroTipo(e.target.value as TipoIndicador | '')}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
            >
              <option value="">Todos los tipos</option>
              {(Object.keys(TIPO_INDICADOR_LABELS) as TipoIndicador[]).map(t => (
                <option key={t} value={t}>{TIPO_INDICADOR_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {catalogoFiltrado.map(ind => (
              <IndicadorCard
                key={ind.id}
                indicador={ind}
                historico={medicionesPorIndicador.get(ind.id) ?? []}
                periodoActual={PERIODO_ACTUAL}
                onClick={() => setIndicadorAbierto(ind)}
              />
            ))}
          </div>
        </>
      )}

      {indicadorAbierto && (
        <IndicadorDetalleModal
          isOpen
          indicador={indicadorAbierto}
          historico={indicadorAbiertoHistorico}
          periodoActual={PERIODO_ACTUAL}
          puedeEditar={puedeGestionar}
          guardando={guardando}
          onGuardar={handleGuardarMedicion}
          onClose={() => setIndicadorAbierto(null)}
        />
      )}
    </div>
  )
}
