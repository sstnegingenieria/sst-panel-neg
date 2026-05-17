export type DocEstado = 'ok' | 'proximo' | 'vencido' | 'sin_fecha'

// Returns the expiration status of a document given its ISO date string
export function getDocEstado(fecha?: string): DocEstado {
  if (!fecha) return 'sin_fecha'
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const venc = new Date(fecha + 'T00:00:00')
  const diasRestantes = Math.floor((venc.getTime() - hoy.getTime()) / 86400000)
  if (diasRestantes < 0) return 'vencido'
  if (diasRestantes <= 30) return 'proximo'
  return 'ok'
}

// Human-readable label for the status
export function estadoLabel(estado: DocEstado): string {
  return { ok: 'Vigente', proximo: 'Por vencer', vencido: 'Vencido', sin_fecha: 'Sin fecha' }[estado]
}

// Tailwind classes for each status
export const estadoClasses: Record<DocEstado, string> = {
  ok:        'bg-green-100 text-green-800',
  proximo:   'bg-amber-100 text-amber-800',
  vencido:   'bg-red-100 text-red-800',
  sin_fecha: 'bg-gray-100 text-gray-500',
}

// Overall health for a technician (worst status wins)
export function getSaludDocumental(t: { eps_vencimiento?: string; arl_vencimiento?: string; pension_vencimiento?: string }): DocEstado {
  const estados = [
    getDocEstado(t.eps_vencimiento),
    getDocEstado(t.arl_vencimiento),
    getDocEstado(t.pension_vencimiento),
  ]
  if (estados.includes('vencido'))  return 'vencido'
  if (estados.includes('proximo'))  return 'proximo'
  if (estados.every(e => e === 'ok')) return 'ok'
  return 'sin_fecha'
}

// Format ISO date to dd/mm/yyyy
export function formatFechaVenc(fecha?: string): string {
  if (!fecha) return '—'
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y}`
}
