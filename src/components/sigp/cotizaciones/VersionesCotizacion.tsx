import { useState, useEffect } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import type { VersionCotizacion } from '../../../types/sigp/cotizacion'
import { ESQUEMA_LABEL } from '../../../types/sigp/cotizacion'

const fMoneda = (n: number | undefined) => n === undefined ? '—' : '$ ' + Math.round(n || 0).toLocaleString('es-CO')

function fFecha(ts: unknown): string {
  const d = (ts as { toDate?: () => Date })?.toDate?.()
  return d ? d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}

/**
 * Comparación simple entre versiones (1.4A.e): totales lado a lado + conteo de
 * ítems por versión, sin diff fino de ítems. Solo se muestra si hay más de una.
 */
export default function VersionesCotizacion({ cotizacionId, versionActiva }: { cotizacionId: string; versionActiva: number }) {
  const [versiones, setVersiones] = useState<VersionCotizacion[]>([])

  useEffect(() => {
    if (versionActiva <= 1) { setVersiones([]); return }
    getDocs(collection(db, 'cotizaciones', cotizacionId, 'versiones'))
      .then(snap => {
        const vs = snap.docs.map(d => ({ id: d.id, ...d.data() }) as VersionCotizacion)
        vs.sort((a, b) => a.version - b.version)
        setVersiones(vs)
      })
      .catch(() => setVersiones([]))
  }, [cotizacionId, versionActiva])

  if (versiones.length < 2) return null

  const filas: { label: string; valor: (v: VersionCotizacion) => string }[] = [
    { label: 'Esquema', valor: v => ESQUEMA_LABEL[v.esquema] },
    { label: 'Ítems', valor: v => String(v.items?.length ?? 0) },
    { label: 'Costos directos', valor: v => fMoneda(v.totales?.costos_directos) },
    { label: 'IVA', valor: v => fMoneda(v.totales?.iva) },
    { label: 'Total', valor: v => fMoneda(v.totales?.total) },
    { label: 'Enviada', valor: v => fFecha(v.fecha_envio) },
  ]

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <h2 className="font-semibold text-gray-800 text-sm">Comparación de versiones</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-2 py-2 font-semibold"></th>
              {versiones.map(v => (
                <th key={v.version} className={`px-2 py-2 font-semibold text-right ${v.version === versionActiva ? 'text-brand-700' : ''}`}>
                  v{v.version}{v.version === versionActiva && ' (activa)'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.label} className="border-b border-gray-50">
                <td className="px-2 py-1.5 text-gray-500">{f.label}</td>
                {versiones.map(v => (
                  <td key={v.version} className={`px-2 py-1.5 text-right font-mono ${f.label === 'Total' ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
                    {f.valor(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
