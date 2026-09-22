import { Line, LineChart, ResponsiveContainer } from 'recharts'
import type { Indicador, IndicadorMedicion } from '../types/indicador'
import { TIPO_INDICADOR_COLOR, TIPO_INDICADOR_LABELS } from '../types/indicador'
import { calcularValor, formatoValor, semaforoIndicador, SEMAFORO_CLASSES, SEMAFORO_LABEL } from '../utils/indicadoresCalc'

interface IndicadorCardProps {
  indicador: Indicador
  historico: IndicadorMedicion[]
  periodoActual: string
  onClick: () => void
}

export default function IndicadorCard({ indicador, historico, periodoActual, onClick }: IndicadorCardProps) {
  const medicionActual = historico.find(m => m.periodo === periodoActual)
  const valorActual = medicionActual
    ? calcularValor(medicionActual.numerador, medicionActual.denominador, indicador.factor)
    : null
  const semaforo = medicionActual
    ? semaforoIndicador(indicador.pendiente_validacion, valorActual, medicionActual.meta, indicador.factor)
    : null

  const sparklineData = historico
    .map(m => ({
      periodo: m.periodo,
      valor: calcularValor(m.numerador, m.denominador, indicador.factor),
    }))
    .filter((d): d is { periodo: string; valor: number } => d.valor != null)

  return (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-brand-300 hover:shadow-sm transition flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${TIPO_INDICADOR_COLOR[indicador.tipo]}`}>
          {TIPO_INDICADOR_LABELS[indicador.tipo]}
        </span>
        <span className="text-[10px] text-gray-400 font-mono">{indicador.codigo}</span>
      </div>

      <h3 className="text-sm font-semibold text-gray-800 leading-snug">{indicador.nombre}</h3>

      <div className="flex items-end justify-between gap-2 mt-auto">
        <div>
          <p className="text-2xl font-bold text-gray-900">{formatoValor(valorActual, indicador.factor)}</p>
          <p className="text-[11px] text-gray-400">{periodoActual}</p>
        </div>
        {sparklineData.length > 1 && (
          <div className="w-16 h-8">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData}>
                <Line type="monotone" dataKey="valor" stroke="#628e3a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {indicador.pendiente_validacion ? (
        <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-500 text-center">
          Pendiente de validación
        </span>
      ) : semaforo ? (
        <span className={`text-[10px] font-medium px-2 py-1 rounded-full text-center ${SEMAFORO_CLASSES[semaforo]}`}>
          {SEMAFORO_LABEL[semaforo]}
        </span>
      ) : (
        <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-gray-50 text-gray-400 text-center">
          Sin medición {periodoActual}
        </span>
      )}
    </button>
  )
}
