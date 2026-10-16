// src/components/CierrePermiso.tsx
// Cierre de permisos de trabajo (alturas, caliente, eléctrico, espacios
// confinados): chip para lista/kanban y sección para el detalle. Solo lee
// campos_dinamicos vía cierrePermisoDe(); no escribe nada.
import { cierrePermisoDe, type Formulario } from '../types/formulario'

type PermisoLike = Pick<Formulario, 'tipo' | 'campos_dinamicos'>

/** Chip "Cerrado" / "Abierto" — no renderiza nada si no es un permiso con fase. */
export function ChipCierrePermiso({ f, compacto = false }: { f: PermisoLike; compacto?: boolean }) {
  const c = cierrePermisoDe(f)
  if (!c) return null
  const base = compacto
    ? 'inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded'
    : 'inline-block text-[10px] font-medium px-2.5 py-0.5 rounded-full'
  if (c.estado === 'abierto') {
    return (
      <span className={`${base} bg-amber-100 text-amber-800`} title="Permiso abierto — cierre pendiente">
        Abierto
      </span>
    )
  }
  return (
    <span
      className={`${base} ${c.noFavorable ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}
      title={c.noFavorable ? 'Permiso cerrado con condición NO favorable' : 'Permiso cerrado'}
    >
      {c.noFavorable ? 'Cerrado ⚠' : 'Cerrado'}
    </span>
  )
}

/** Sección "Cierre del permiso" del detalle. Null si no aplica. */
export function SeccionCierrePermiso({ f }: { f: PermisoLike }) {
  const c = cierrePermisoDe(f)
  if (!c) return null

  if (c.estado === 'abierto') {
    return (
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Cierre del permiso
        </h3>
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex-shrink-0">
            Abierto
          </span>
          <p className="text-sm text-amber-800">
            Permiso abierto — cierre pendiente. El técnico aún no ha registrado el cierre en la app.
          </p>
        </div>
      </section>
    )
  }

  const filas: { label: string; value?: string; destacar?: boolean }[] = [
    { label: 'Hora de cierre', value: c.hora },
    { label: 'Supervisor de cierre', value: c.supervisor },
    { label: 'Condición final', value: c.condicionFinal, destacar: c.noFavorable },
    { label: 'Observaciones', value: c.observaciones },
  ]
  const hayDetalle = filas.some(r => r.value)

  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        Cierre del permiso
      </h3>
      <div
        className={`rounded-lg p-4 border ${
          c.noFavorable ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          <span
            className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              c.noFavorable ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {c.noFavorable ? 'Cerrado — condición NO favorable' : 'Cerrado'}
          </span>
        </div>
        {hayDetalle ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
            {filas.filter(r => r.value).map(r => (
              <div key={r.label} className={r.label === 'Observaciones' ? 'col-span-2 md:col-span-3' : ''}>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{r.label}</p>
                <p
                  className={`text-sm mt-0.5 break-words whitespace-pre-wrap ${
                    r.destacar ? 'text-red-700 font-semibold' : 'text-gray-700'
                  }`}
                >
                  {r.value}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">El cierre está registrado, sin detalle adicional.</p>
        )}
        <p className="text-[10px] text-gray-400 mt-3">
          La app registra solo la hora del cierre (no la fecha) y la firma queda en el PDF.
        </p>
      </div>
    </section>
  )
}
