import { useState } from 'react'

// ── Tipos compartidos ────────────────────────────────────────────────────────

export interface RevisionSST {
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  observacion?: string
  revisado_por?: string
  fecha_revision?: string
}

export interface Formulario {
  id: string
  tipo: string
  uid_creador: string
  proyecto: string        // normalizado desde obra_nombre
  fecha: string
  responsable: string    // normalizado desde data.responsable o user_nombre
  ciudad?: string
  direccion?: string
  codigo_formato: string // normalizado desde data.numero_formulario
  version?: string
  fecha_modificacion?: string
  timestamp_creacion: string  // normalizado desde fecha_creacion (Timestamp)
  campos_dinamicos: Record<string, unknown>  // normalizado desde data
  fotos_urls?: string[]
  firmas_urls?: Record<string, string>
  pdf_url?: string
  estado_sync?: string
  revision_sst?: RevisionSST
  descargado_sst?: boolean
  fecha_descarga?: string
}

// ── Normalizador: mapea el documento Firestore real al tipo Formulario ────────
// La app Flutter guarda campos con nombres distintos a los que espera el panel.

type FirestoreTimestamp = { toDate: () => Date }

export function normalizarDoc(id: string, raw: Record<string, unknown>): Formulario {
  // fecha_creacion viene como Firestore Timestamp o string ISO
  const fechaRaw = raw.fecha_creacion as FirestoreTimestamp | string | null | undefined
  const timestamp_creacion: string = fechaRaw
    ? (typeof fechaRaw === 'string'
        ? fechaRaw
        : (fechaRaw.toDate?.()?.toISOString() ?? ''))
    : ''

  // data es el mapa de campos dinámicos del formulario
  const data = (raw.data as Record<string, unknown>) ?? {}

  return {
    id,
    tipo:               (raw.tipo              as string) ?? '',
    uid_creador:        (raw.user_id           as string) ?? '',
    proyecto:           (raw.obra_nombre       as string) ?? '',
    fecha:              timestamp_creacion,
    responsable:        (data.responsable      as string) ?? (raw.user_nombre as string) ?? '',
    ciudad:             (data.ciudad           as string) ?? '',
    direccion:          (data.direccion        as string) ?? '',
    codigo_formato:     (data.numero_formulario as string) ?? '',
    version:            '',
    fecha_modificacion: '',
    timestamp_creacion,
    campos_dinamicos:   data,
    fotos_urls:         [],
    firmas_urls:        {},
    pdf_url:            (raw.pdf_url           as string) ?? undefined,
    estado_sync:        '',
    revision_sst:       raw.revision_sst       as RevisionSST | undefined,
    descargado_sst:     (raw.descargado_sst    as boolean)  ?? false,
    fecha_descarga:     (raw.fecha_descarga    as string)   ?? undefined,
  }
}

// ── Labels y colores por tipo ────────────────────────────────────────────────

export const TIPO_LABELS: Record<string, string> = {
  preoperacional:          'Preoperacional',
  ats:                     'ATS',
  charla:                  'Charla 5 min',
  permiso_alturas:         'Permiso Alturas',
  permiso_caliente:        'Permiso Caliente',
  inspeccion_herramientas: 'Insp. Herramientas',
  inspeccion_epp:          'Insp. EPP',
  inspeccion_escaleras:    'Insp. Escaleras',
  inspeccion_arnes:        'Insp. Arnés',
  inspeccion_tieoff:       'Insp. Tie-Off',
  inspeccion_instalaciones:'Insp. Instalaciones',
  reporte_actos:           'Reporte Actos',
  emergencia:              'Emergencia',
}

const TIPO_COLOR: Record<string, string> = {
  preoperacional:          'bg-blue-100 text-blue-800',
  ats:                     'bg-violet-100 text-violet-800',
  charla:                  'bg-purple-100 text-purple-800',
  permiso_alturas:         'bg-orange-100 text-orange-800',
  permiso_caliente:        'bg-red-100 text-red-800',
  inspeccion_herramientas: 'bg-cyan-100 text-cyan-800',
  inspeccion_epp:          'bg-teal-100 text-teal-800',
  inspeccion_escaleras:    'bg-sky-100 text-sky-800',
  inspeccion_arnes:        'bg-indigo-100 text-indigo-800',
  inspeccion_tieoff:       'bg-blue-100 text-blue-800',
  inspeccion_instalaciones:'bg-emerald-100 text-emerald-800',
  reporte_actos:           'bg-amber-100 text-amber-800',
  emergencia:              'bg-rose-100 text-rose-800',
}

const REVISION_BADGE: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  aprobado:  'bg-green-100 text-green-800',
  rechazado: 'bg-red-100 text-red-800',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch {
    return iso
  }
}

// ── Paginación ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25

// ── Componente ───────────────────────────────────────────────────────────────

interface RegistrosTableProps {
  formularios: Formulario[]
  loading: boolean
  onVerDetalle: (f: Formulario) => void
}

export default function RegistrosTable({ formularios, loading, onVerDetalle }: RegistrosTableProps) {
  const [page, setPage] = useState(1)

  // Resetear página cuando cambia la lista filtrada
  const totalPages = Math.max(1, Math.ceil(formularios.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const paginated  = formularios.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Fecha</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Formulario</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Técnico</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Obra</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Revisión SST</th>
              <th className="py-3 px-4 font-semibold text-gray-500 uppercase text-xs tracking-wide text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="py-3 px-4">
                      <div className="h-4 bg-gray-200 rounded animate-pulse w-24" />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading && formularios.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-gray-400">
                  No hay registros que coincidan con los filtros.
                </td>
              </tr>
            )}

            {!loading &&
              paginated.map(f => {
                const revEstado = f.revision_sst?.estado ?? 'pendiente'
                return (
                  <tr
                    key={f.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => onVerDetalle(f)}
                  >
                    <td className="py-3 px-4 text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(f.timestamp_creacion)}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium w-fit ${
                            TIPO_COLOR[f.tipo] ?? 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {TIPO_LABELS[f.tipo] ?? f.tipo}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">{f.codigo_formato}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-gray-700 font-medium">{f.responsable}</td>

                    <td className="py-3 px-4 text-gray-600 text-xs max-w-[180px]">
                      <span className="block truncate" title={f.proyecto}>{f.proyecto}</span>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                          REVISION_BADGE[revEstado]
                        }`}
                      >
                        {revEstado}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={e => { e.stopPropagation(); onVerDetalle(f) }}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition font-medium"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
          <span>
            Página {safePage} de {totalPages}
            <span className="ml-1 text-gray-400">
              ({formularios.length} registros)
            </span>
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={safePage === 1}
              className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Primera página"
            >
              «
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              ‹ Anterior
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Siguiente ›
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={safePage === totalPages}
              className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Última página"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
