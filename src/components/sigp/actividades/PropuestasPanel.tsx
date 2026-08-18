// src/components/sigp/actividades/PropuestasPanel.tsx
//
// Propuestas económicas del cliente (F1.2): series agrupadas por consecutivo
// — la VIGENTE al frente, históricas expandibles, PDF por versión. Re-emitir
// toma la SELECCIÓN ACTUAL de la tabla de actividades como conjunto nuevo
// (el botón lo habilita el padre). Render defensivo ante docs malformados.
import { useState } from 'react'
import { fmtMoney } from '../../../utils/sigp/formato'
import { seriesDe } from '../../../types/sigp/propuestaActividad'
import type { PropuestaActividad } from '../../../types/sigp/propuestaActividad'

interface PropuestasPanelProps {
  propuestas: PropuestaActividad[]
  cargando: boolean
  puedeGestionar: boolean
  /** Cuántas actividades hay seleccionadas en la tabla (conjunto de la re-emisión). */
  seleccionadas: number
  onReemitir: (vigente: PropuestaActividad) => void
}

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

export default function PropuestasPanel({ propuestas, cargando, puedeGestionar, seleccionadas, onReemitir }: PropuestasPanelProps) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
  const series = seriesDe(propuestas)

  const toggle = (c: string) => setAbiertas(prev => {
    const s = new Set(prev)
    if (s.has(c)) s.delete(c); else s.add(c)
    return s
  })

  if (cargando) return <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-400">Cargando propuestas…</div>
  if (series.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-400">
        Sin propuestas emitidas. Selecciona actividades en la vista de Actividades y usa "Generar propuesta".
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {series.map(({ consecutivo, versiones }) => {
        const vigente = versiones.find(v => v.estado === 'vigente')
        const historicas = versiones.filter(v => v.estado !== 'vigente')
        const cab = vigente ?? versiones[0]
        return (
          <div key={consecutivo} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-bold text-brand-700">{consecutivo}</span>
              {cab && (
                <>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-800 font-semibold">
                    {vigente ? `vigente · v${cab.version}` : 'sin vigente'}
                  </span>
                  <span className="text-sm text-gray-600 truncate max-w-xs" title={cab.asunto}>{cab.asunto || '—'}</span>
                  <span className="text-xs text-gray-400">{fFecha(cab.fecha_emision)} · {(cab.actividad_ids ?? []).length} actividad{(cab.actividad_ids ?? []).length === 1 ? '' : 'es'}</span>
                  <span className="ml-auto font-mono text-sm text-gray-700">{fmtMoney(cab.totales?.total ?? 0)}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2">
              {cab?.pdf_url && (
                <a href={cab.pdf_url} target="_blank" rel="noreferrer" className="text-xs text-brand-700 hover:underline">
                  📄 PDF {vigente ? `v${cab.version}` : ''}
                </a>
              )}
              {puedeGestionar && vigente && (
                <button onClick={() => onReemitir(vigente)} disabled={seleccionadas === 0}
                  title={seleccionadas === 0 ? 'Selecciona en la vista de Actividades el conjunto de la nueva versión' : ''}
                  className="text-xs px-2 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                  ↻ Re-emitir con la selección actual ({seleccionadas})
                </button>
              )}
              {historicas.length > 0 && (
                <button onClick={() => toggle(consecutivo)} className="text-xs text-gray-400 hover:text-gray-600">
                  {abiertas.has(consecutivo) ? '− Ocultar' : '+ Ver'} históricas ({historicas.length})
                </button>
              )}
            </div>
            {abiertas.has(consecutivo) && historicas.length > 0 && (
              <ul className="mt-2 border-t border-gray-100 pt-2 space-y-1">
                {historicas.map(h => (
                  <li key={h.id} className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="px-1.5 py-0.5 rounded bg-gray-100">v{h.version} · histórica</span>
                    <span>{fFecha(h.fecha_emision)}</span>
                    <span>{(h.actividad_ids ?? []).length} act.</span>
                    <span className="font-mono">{fmtMoney(h.totales?.total ?? 0)}</span>
                    {h.pdf_url && <a href={h.pdf_url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">PDF</a>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
