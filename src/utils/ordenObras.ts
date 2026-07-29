export type SortBy = 'recientes' | 'pendientes' | 'alfabetico' | 'cliente'

export const DIRECCION_ORDEN: Record<SortBy, 'ascending' | 'descending'> = {
  recientes: 'descending',
  pendientes: 'descending',
  alfabetico: 'ascending',
  cliente: 'ascending',
}

interface ObraOrdenable {
  nombre_sitio: string
  cliente: string
  pendientes: number
  ultimoTimestamp: string
}

/**
 * Ordena una lista de obras según el criterio dado, sin mutar el array
 * original. Nulos (sin actividad / sin cliente) siempre quedan al final,
 * sin importar la dirección del resto del criterio.
 */
export function ordenarObras<T extends ObraOrdenable>(obras: T[], sortBy: SortBy): T[] {
  const sorted = [...obras]

  switch (sortBy) {
    case 'recientes':
      sorted.sort((a, b) => {
        if (!a.ultimoTimestamp && !b.ultimoTimestamp) return 0
        if (!a.ultimoTimestamp) return 1
        if (!b.ultimoTimestamp) return -1
        return b.ultimoTimestamp.localeCompare(a.ultimoTimestamp)
      })
      break
    case 'pendientes':
      sorted.sort((a, b) => b.pendientes - a.pendientes)
      break
    case 'alfabetico':
      sorted.sort((a, b) => a.nombre_sitio.localeCompare(b.nombre_sitio))
      break
    case 'cliente':
      sorted.sort((a, b) => {
        if (!a.cliente && !b.cliente) return 0
        if (!a.cliente) return 1
        if (!b.cliente) return -1
        return a.cliente.localeCompare(b.cliente)
      })
      break
  }

  return sorted
}
