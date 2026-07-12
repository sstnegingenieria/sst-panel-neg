import { useNavigate } from 'react-router-dom'
import type { Cotizacion } from '../../../types/sigp/cotizacion'
import {
  ESTADO_COT_LABEL, ESTADO_COT_COLOR, estadoEfectivo,
  TIPO_INVERSION_LABEL, TIPO_INVERSION_COLOR, diasDesdeEnvio, colorSeguimiento,
} from '../../../types/sigp/cotizacion'

interface CotizacionesTableProps {
  cotizaciones: Cotizacion[]
  loading: boolean
  clienteNombres: Record<string, string>
  filasClicables?: boolean
}

function fFecha(ts: unknown): string {
  const d = (ts as { toDate?: () => Date })?.toDate?.()
  return d ? d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}
const fMoneda = (n: number) => '$ ' + (n || 0).toLocaleString('es-CO')

function origen(c: Cotizacion, clienteNombres: Record<string, string>): string {
  if (c.cliente_id && clienteNombres[c.cliente_id]) return clienteNombres[c.cliente_id]
  if (c.prospecto_nombre) return c.prospecto_nombre
  return '—'
}

export default function CotizacionesTable({ cotizaciones, loading, clienteNombres, filasClicables }: CotizacionesTableProps) {
  const navigate = useNavigate()
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Consecutivo</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Cliente / Prospecto</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Asunto</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Estado</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide text-right">Total</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Versión</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Creada</th>
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-100">
                {Array.from({ length: 7 }).map((__, j) => (
                  <td key={j} className="py-3 px-4"><div className="h-4 bg-gray-200 rounded animate-pulse w-24" /></td>
                ))}
              </tr>
            ))}

          {!loading && cotizaciones.length === 0 && (
            <tr><td colSpan={7} className="py-12 text-center text-gray-400">No hay cotizaciones registradas.</td></tr>
          )}

          {!loading &&
            cotizaciones.map(c => {
              const est = estadoEfectivo(c)
              return (
                <tr
                  key={c.id}
                  onClick={filasClicables ? () => navigate(`/sigp/cotizaciones/${c.id}`) : undefined}
                  className={`border-b border-gray-100 transition-colors ${filasClicables ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
                >
                  <td className="py-3 px-4 font-mono text-xs text-gray-700">
                    {c.consecutivo}
                    {c.es_licitacion && <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-700">LIC</span>}
                    {c.tipo_inversion && <span className={`ml-1 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${TIPO_INVERSION_COLOR[c.tipo_inversion]}`}>{TIPO_INVERSION_LABEL[c.tipo_inversion]}</span>}
                  </td>
                  <td className="py-3 px-4 font-medium text-gray-800">{origen(c, clienteNombres)}</td>
                  <td className="py-3 px-4 text-gray-600 max-w-[16rem] truncate" title={c.asunto}>{c.asunto || '—'}</td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${ESTADO_COT_COLOR[est]}`}>
                      {ESTADO_COT_LABEL[est]}
                    </span>
                    {est === 'enviada' && (() => {
                      const dias = diasDesdeEnvio(c.fecha_envio)
                      return dias !== null && (
                        <span className={`ml-1.5 inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${colorSeguimiento(dias)}`}
                          title="Días desde el envío (seguimiento)">
                          hace {dias} {dias === 1 ? 'día' : 'días'}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs text-gray-700">{fMoneda(c.total)}</td>
                  <td className="py-3 px-4 text-gray-500 text-xs">v{c.version_activa}</td>
                  <td className="py-3 px-4 text-gray-600">{fFecha(c.fecha_creacion)}</td>
                </tr>
              )
            })}
        </tbody>
      </table>
    </div>
  )
}
