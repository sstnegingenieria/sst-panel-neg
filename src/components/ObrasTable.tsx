import { Fragment, useState } from 'react'
import { urlVerificarEnMaps } from '../utils/geo'

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
  /** Bloque 3+5 — contratista PRINCIPAL del proyecto (de la asignación
   *  inicial). La app lo ignora; la CF asignarObraAlPrincipal lo consume —
   *  NO se retira. Con el reparto por ítem quedó corto: ver `contratistas`. */
  contratista_id?: string
  /** Paquete GI · C1 — contratista(s) EN PLURAL, denormalizados de las
   *  asignaciones vivas del proyecto (refrescados en cada sync del espejo).
   *  Aditivo: la app no lee contratista alguno de la obra (verificado
   *  contra obra_model.dart, 07-oct-2026). */
  contratistas?: { id: string; nombre: string }[]
  /** Coordenadas de referencia del sitio (para el indicador geo de formularios).
   *  Opcional: sin este campo los formularios quedan en estado `sin_referencia`. */
  coordenadas_sitio?: { latitud: number; longitud: number }
}

/** ¿Es una obra-espejo gobernada por el SIGP? */
export const esObraEspejo = (o: Obra) => o.origen === 'sigp'

/** Nombres de contratistas de la obra: el plural denormalizado, con respaldo
 *  en el campo único legacy (resuelto a nombre por el mapa del caller). */
export function contratistasDeObra(o: Obra, nombrePorId: Record<string, string>): string[] {
  if (o.contratistas?.length) return o.contratistas.map(c => c.nombre || nombrePorId[c.id] || c.id)
  if (o.contratista_id) return [nombrePorId[o.contratista_id] ?? o.contratista_id]
  return []
}

interface ObrasTableProps {
  obras: Obra[]
  loading: boolean
  /** id → nombre de contratistas (para el respaldo legacy `contratista_id`). */
  nombresContratistas?: Record<string, string>
}

const estadoBadge = {
  activa: 'bg-emerald-50 text-emerald-700',
  inactiva: 'bg-amber-50 text-amber-700',
}

const COLS = 6

export default function ObrasTable({ obras, loading, nombresContratistas = {} }: ObrasTableProps) {
  // Paquete GI · C1 — las coordenadas salen de la tabla y viven en el
  // DETALLE (fila expandible), junto con el código del cliente.
  const [abierta, setAbierta] = useState<string | null>(null)
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Nombre sitio</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Proyecto</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Cliente</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Contratista(s)</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Alcance / Objeto</th>
            <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Estado</th>
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-100">
                {Array.from({ length: COLS }).map((__, j) => (
                  <td key={j} className="py-3 px-4">
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-24" />
                  </td>
                ))}
              </tr>
            ))}

          {!loading && obras.length === 0 && (
            <tr>
              <td colSpan={COLS} className="py-12 text-center text-gray-400">
                No hay obras registradas.
              </td>
            </tr>
          )}

          {!loading &&
            obras.map(obra => {
              const nombres = contratistasDeObra(obra, nombresContratistas)
              const expandida = abierta === obra.id
              return (
                <Fragment key={obra.id}>
                  <tr
                    onClick={() => setAbierta(expandida ? null : obra.id)}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                    title="Ver detalle (coordenadas y código del sitio)"
                  >
                    <td className="py-3 px-4 font-medium text-gray-800">
                      <span className={`mr-1.5 inline-block text-gray-300 transition-transform ${expandida ? 'rotate-90' : ''}`}>▸</span>
                      {obra.nombre_sitio}
                      {esObraEspejo(obra) && (
                        <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand-50 text-brand-700"
                          title="Obra-espejo del proyecto SIGP: identidad y estado los gobierna el proyecto">
                          SIGP
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-600 font-mono text-xs">
                      {obra.proyecto_consecutivo
                        ?? <span className="text-gray-400" title="Obra anterior al SIGP — sin proyecto; su código vive en el detalle">—</span>}
                    </td>
                    <td className="py-3 px-4 text-gray-600">{obra.cliente}</td>
                    <td className="py-3 px-4">
                      {nombres.length === 0
                        ? <span className="text-gray-300 text-xs">—</span>
                        : (
                          <span className="flex flex-wrap gap-1">
                            {nombres.map((n, i) => (
                              <span key={i} className="inline-flex px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">{n}</span>
                            ))}
                          </span>
                        )}
                    </td>
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
                  </tr>
                  {expandida && (
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <td colSpan={COLS} className="px-10 py-3">
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs text-gray-600">
                          <span>
                            <span className="font-semibold text-gray-500 uppercase tracking-wide text-[10px] mr-1.5">Código del sitio</span>
                            <span className="font-mono">{obra.codigo || '—'}</span>
                          </span>
                          <span>
                            <span className="font-semibold text-gray-500 uppercase tracking-wide text-[10px] mr-1.5">Coordenadas</span>
                            {obra.coordenadas_sitio ? (
                              <>
                                <span className="font-mono">{obra.coordenadas_sitio.latitud}, {obra.coordenadas_sitio.longitud}</span>
                                <a href={urlVerificarEnMaps(obra.coordenadas_sitio)} target="_blank" rel="noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="ml-2 text-brand-700 underline underline-offset-2 font-medium">
                                  📍 Ver en Maps
                                </a>
                              </>
                            ) : (
                              <span className="text-gray-400">sin referencia — los formularios de esta obra quedan sin geo-control</span>
                            )}
                          </span>
                          {obra.proyecto_consecutivo && (
                            <span>
                              <span className="font-semibold text-gray-500 uppercase tracking-wide text-[10px] mr-1.5">Proyecto</span>
                              <span className="font-mono">{obra.proyecto_consecutivo}</span>
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
        </tbody>
      </table>
    </div>
  )
}
