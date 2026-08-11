export interface Obra {
  id: string
  nombre_sitio: string
  codigo: string
  cliente: string
  alcance?: string
  estado: 'activa' | 'inactiva'
  // Bloque D — obra-espejo creada desde un proyecto SIGP: identidad y estado
  // los gobierna el PROYECTO (un solo escritor); el panel no la edita.
  origen?: 'sigp'
  proyecto_id?: string
  proyecto_consecutivo?: string
  /** Bloque 3+5 — contratista PRINCIPAL del proyecto (de la asignación).
   *  La app lo ignora; el panel filtra el aval de obras por él. */
  contratista_id?: string
  /** Coordenadas de referencia del sitio (para el indicador geo de formularios).
   *  Opcional: sin este campo los formularios quedan en estado `sin_referencia`. */
  coordenadas_sitio?: { latitud: number; longitud: number }
}

/** ¿Es una obra-espejo gobernada por el SIGP? */
export const esObraEspejo = (o: Obra) => o.origen === 'sigp'

interface ObrasTableProps {
  obras: Obra[]
  loading: boolean
}

const estadoBadge = {
  activa: 'bg-emerald-50 text-emerald-700',
  inactiva: 'bg-amber-50 text-amber-700',
}

export default function ObrasTable({ obras, loading }: ObrasTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Nombre sitio</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Código</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Cliente</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Alcance / Objeto</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Estado</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Coordenadas</th>
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-100">
                {Array.from({ length: 6 }).map((__, j) => (
                  <td key={j} className="py-3 px-4">
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-24" />
                  </td>
                ))}
              </tr>
            ))}

          {!loading && obras.length === 0 && (
            <tr>
              <td colSpan={6} className="py-12 text-center text-gray-400">
                No hay obras registradas.
              </td>
            </tr>
          )}

          {!loading &&
            obras.map(obra => (
              <tr key={obra.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="py-3 px-4 font-medium text-gray-800">
                  {obra.nombre_sitio}
                  {esObraEspejo(obra) && (
                    <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand-50 text-brand-700 font-mono"
                      title="Obra-espejo del proyecto SIGP: identidad y estado los gobierna el proyecto">
                      {obra.proyecto_consecutivo ?? 'SIGP'}
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-gray-600 font-mono text-xs">{obra.codigo}</td>
                <td className="py-3 px-4 text-gray-600">{obra.cliente}</td>
                <td className="py-3 px-4 max-w-xs">
                  {obra.alcance
                    ? <span className="text-gray-700 text-xs line-clamp-2" title={obra.alcance}>{obra.alcance}</span>
                    : <span className="text-gray-300 text-xs">—</span>
                  }
                </td>
                <td className="py-3 px-4">
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${estadoBadge[obra.estado]}`}>
                    {obra.estado}
                  </span>
                </td>
                <td className="py-3 px-4">
                  {obra.coordenadas_sitio ? (
                    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700"
                      title={`lat ${obra.coordenadas_sitio.latitud}, lon ${obra.coordenadas_sitio.longitud}`}>
                      📍 Coordenadas cargadas
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">Sin referencia</span>
                  )}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
