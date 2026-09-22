import { useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Modal from './shared/Modal'
import TextField from './shared/TextField'
import ChecklistCriterios from './patrones/ChecklistCriterios'
import PlanActividades from './patrones/PlanActividades'
import BitacoraAusentismo from './patrones/BitacoraAusentismo'
import BitacoraRatio from './patrones/BitacoraRatio'
import { useIndicadorRegistros } from '../hooks/useIndicadorRegistros'
import type { Indicador, IndicadorMedicion, IndicadorRegistro } from '../types/indicador'
import { TIPO_INDICADOR_LABELS } from '../types/indicador'
import {
  calcularValor,
  colorSemaforo,
  formatoValor,
  semaforoIndicador,
  SEMAFORO_CLASSES,
  SEMAFORO_LABEL,
} from '../utils/indicadoresCalc'
import { derivarNumDen } from '../utils/indicadoresRegistros'

interface IndicadorDetalleModalProps {
  isOpen: boolean
  indicador: Indicador
  historico: IndicadorMedicion[]
  periodoActual: string
  puedeEditar: boolean
  esAdmin: boolean
  guardando: boolean
  onGuardar: (datos: { numerador: number; denominador: number; meta: number; interpretacion: string }) => void
  onGuardarMetaInterpretacion: (datos: { meta: number; interpretacion: string }) => void
  onDatosCambiados: () => Promise<void>
  onClose: () => void
}

export default function IndicadorDetalleModal({
  isOpen,
  indicador,
  historico,
  periodoActual,
  puedeEditar,
  esAdmin,
  guardando,
  onGuardar,
  onGuardarMetaInterpretacion,
  onDatosCambiados,
  onClose,
}: IndicadorDetalleModalProps) {
  const { cargarRegistros } = useIndicadorRegistros()
  const medicionActual = historico.find(m => m.periodo === periodoActual)
  const esPatronado = !!indicador.patron

  const [numerador, setNumerador] = useState(String(medicionActual?.numerador ?? ''))
  const [denominador, setDenominador] = useState(String(medicionActual?.denominador ?? ''))
  const [metaPct, setMetaPct] = useState(medicionActual ? String(medicionActual.meta * 100) : '')
  const [interpretacion, setInterpretacion] = useState(medicionActual?.interpretacion ?? '')
  const [registros, setRegistros] = useState<IndicadorRegistro[]>([])

  // Reabrir con otro indicador (o cambiar de periodo) resetea el formulario.
  useEffect(() => {
    setNumerador(String(medicionActual?.numerador ?? ''))
    setDenominador(String(medicionActual?.denominador ?? ''))
    setMetaPct(medicionActual ? String(medicionActual.meta * 100) : '')
    setInterpretacion(medicionActual?.interpretacion ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicador.id, periodoActual])

  useEffect(() => {
    if (esPatronado) {
      cargarRegistros(indicador.id, periodoActual).then(setRegistros)
    } else {
      setRegistros([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicador.id, esPatronado, periodoActual])

  const recargarRegistros = async () => {
    const [nuevos] = await Promise.all([
      cargarRegistros(indicador.id, periodoActual),
      onDatosCambiados(),
    ])
    setRegistros(nuevos)
  }

  const derivadoPatron = esPatronado ? derivarNumDen(indicador, registros) : null
  const numPreview = esPatronado ? derivadoPatron?.numerador ?? 0 : Number(numerador.replace(',', '.'))
  const denPreview = esPatronado ? derivadoPatron?.denominador ?? 0 : Number(denominador.replace(',', '.'))
  const metaPreview = Number(metaPct.replace(',', '.')) / 100
  const valorPreview = Number.isFinite(numPreview) && Number.isFinite(denPreview)
    ? calcularValor(numPreview, denPreview, indicador.factor)
    : null
  const semaforoPreview = valorPreview != null && Number.isFinite(metaPreview)
    ? semaforoIndicador(indicador.pendiente_validacion, valorPreview, metaPreview, indicador.factor)
    : null

  const chartData = historico
    .map(m => ({ periodo: m.periodo, valor: calcularValor(m.numerador, m.denominador, indicador.factor) }))
    .filter((d): d is { periodo: string; valor: number } => d.valor != null)

  const formValido = esPatronado
    ? Number.isFinite(metaPreview) && metaPreview >= 0
    : Number.isFinite(numPreview) && numPreview >= 0
      && Number.isFinite(denPreview) && denPreview > 0
      && Number.isFinite(metaPreview) && metaPreview >= 0

  const handleGuardar = () => {
    if (!formValido) return
    if (esPatronado) {
      onGuardarMetaInterpretacion({ meta: metaPreview, interpretacion })
    } else {
      onGuardar({ numerador: numPreview, denominador: denPreview, meta: metaPreview, interpretacion })
    }
  }

  const renderPatron = () => {
    const props = { indicador, periodo: periodoActual, registros, puedeEditar, onCambio: recargarRegistros }
    switch (indicador.patron) {
      case 'checklist':
        return <ChecklistCriterios {...props} />
      case 'plan':
        return <PlanActividades {...props} esAdmin={esAdmin} />
      case 'registro':
        return <BitacoraAusentismo {...props} esAdmin={esAdmin} />
      case 'ratio':
        return <BitacoraRatio {...props} esAdmin={esAdmin} />
      default:
        return null
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={indicador.nombre}
      size="xl"
      actions={puedeEditar ? [
        { label: 'Cerrar', onClick: onClose, variant: 'secondary' },
        { label: esPatronado ? 'Guardar meta e interpretación' : `Guardar medición ${periodoActual}`, onClick: handleGuardar, variant: 'primary', loading: guardando, disabled: !formValido },
      ] : [
        { label: 'Cerrar', onClick: onClose, variant: 'secondary' },
      ]}
    >
      <div className="flex flex-col gap-6">
        {/* I. Identificación */}
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Identificación del indicador</h4>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-gray-400 text-xs">Código</dt>
              <dd className="text-gray-800 font-mono">{indicador.codigo}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-gray-400 text-xs">Tipo</dt>
              <dd className="text-gray-800">{TIPO_INDICADOR_LABELS[indicador.tipo]}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-gray-400 text-xs">Fórmula</dt>
              <dd className="text-gray-800">
                {indicador.label_numerador} <span className="text-gray-400">/</span> {indicador.label_denominador}
                {' '}× {indicador.factor.toLocaleString('es-CO')}
              </dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-gray-400 text-xs">Frecuencia de medición</dt>
              <dd className="text-gray-800 capitalize">{indicador.frecuencia}</dd>
            </div>
            {indicador.pendiente_validacion && (
              <div className="col-span-2 sm:col-span-1">
                <dt className="text-gray-400 text-xs">Estado de la fórmula</dt>
                <dd className="text-amber-700 font-medium">Pendiente de validación (Gestión Integral)</dd>
              </div>
            )}
          </dl>
        </section>

        {/* III. Gráfico — siempre visible (Ingrid, F2 punto 3) */}
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Gráfico</h4>
          {chartData.length > 1 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatoValor(typeof v === 'number' ? v : Number(v), indicador.factor)} />
                  <Line type="monotone" dataKey="valor" stroke="#628e3a" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-24 flex items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-400">
              Aún no hay suficientes periodos con datos para graficar.
            </div>
          )}
        </section>

        {/* Valor y semáforo en vivo del periodo actual / formulario */}
        <section className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
            Medición {periodoActual}
          </h4>
          {puedeEditar ? (
            <div className="flex flex-col gap-3">
              {esPatronado ? (
                renderPatron()
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Numerador" value={numerador} onChange={setNumerador} hint={indicador.label_numerador} />
                  <TextField label="Denominador" value={denominador} onChange={setDenominador} hint={indicador.label_denominador} />
                </div>
              )}
              <TextField label="Meta (%)" value={metaPct} onChange={setMetaPct} hint="Ej. 90 para 90%" />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Interpretación</label>
                <textarea
                  value={interpretacion}
                  onChange={e => setInterpretacion(e.target.value)}
                  rows={3}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
                  placeholder="Por qué dio este resultado en el periodo…"
                />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <span className="text-2xl font-bold text-gray-900">{formatoValor(valorPreview, indicador.factor)}</span>
                {esPatronado && (
                  <span className="text-xs text-gray-400">
                    ({numPreview} / {denPreview} — derivado de la bitácora)
                  </span>
                )}
                {indicador.pendiente_validacion ? (
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-500">Pendiente de validación</span>
                ) : semaforoPreview ? (
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${SEMAFORO_CLASSES[semaforoPreview]}`}>
                    {SEMAFORO_LABEL[semaforoPreview]}
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No tienes permiso para registrar mediciones de este indicador.</p>
          )}
        </section>

        {/* II. Tabla de datos */}
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Tabla de datos</h4>
          {historico.length === 0 ? (
            <p className="text-sm text-gray-400">Sin mediciones registradas todavía.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs uppercase">
                    <th className="py-1 pr-3">Periodo</th>
                    <th className="py-1 pr-3">Numerador</th>
                    <th className="py-1 pr-3">Denominador</th>
                    <th className="py-1 pr-3">Valor</th>
                    <th className="py-1 pr-3">Meta</th>
                    <th className="py-1 pr-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map(m => {
                    const valor = calcularValor(m.numerador, m.denominador, indicador.factor)
                    const semaforo = valor != null && !indicador.pendiente_validacion && !m.es_referencia
                      ? colorSemaforo(valor, m.meta, indicador.factor)
                      : null
                    return (
                      <tr key={m.id} className="border-t border-gray-100">
                        <td className="py-1.5 pr-3 font-medium text-gray-700">
                          {m.periodo}
                          {m.es_referencia && <span className="ml-1.5 text-[10px] text-gray-400 font-normal">(referencia)</span>}
                        </td>
                        <td className="py-1.5 pr-3 text-gray-600">{m.numerador}</td>
                        <td className="py-1.5 pr-3 text-gray-600">{m.denominador}</td>
                        <td className="py-1.5 pr-3 text-gray-800 font-medium">{formatoValor(valor, indicador.factor)}</td>
                        <td className="py-1.5 pr-3 text-gray-500">{m.es_referencia ? '—' : `${(m.meta * 100).toLocaleString('es-CO')}%`}</td>
                        <td className="py-1.5 pr-3">
                          {m.es_referencia || indicador.pendiente_validacion ? (
                            <span className="text-xs text-gray-400">—</span>
                          ) : semaforo ? (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${SEMAFORO_CLASSES[semaforo]}`}>
                              {SEMAFORO_LABEL[semaforo]}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* IV. Interpretación histórica */}
        {historico.some(m => m.interpretacion) && (
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Interpretación</h4>
            <ul className="flex flex-col gap-1.5 text-sm text-gray-600">
              {historico.filter(m => m.interpretacion).map(m => (
                <li key={m.id}><span className="font-medium text-gray-700">{m.periodo}:</span> {m.interpretacion}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  )
}
