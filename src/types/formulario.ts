// src/types/formulario.ts

// ── Tipos ────────────────────────────────────────────────────────────────────

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
  obraId: string            // NUEVO — id de la obra (raw.obra_id)
  proyecto: string          // nombre de la obra (raw.obra_nombre)
  fecha: string
  responsable: string
  ciudad?: string
  direccion?: string
  codigo_formato: string
  version?: string
  fecha_modificacion?: string
  timestamp_creacion: string
  campos_dinamicos: Record<string, unknown>
  fotos_urls?: string[]
  firmas_urls?: Record<string, string>
  pdf_url?: string
  estado_sync?: string
  revision_sst?: RevisionSST
  descargado_sst?: boolean
  fecha_descarga?: string
}

// ── Normalizador ─────────────────────────────────────────────────────────────

type FirestoreTimestamp = { toDate: () => Date }

export function normalizarDoc(id: string, raw: Record<string, unknown>): Formulario {
  const fechaRaw = raw.fecha_creacion as FirestoreTimestamp | string | null | undefined
  const timestamp_creacion: string = fechaRaw
    ? (typeof fechaRaw === 'string'
        ? fechaRaw
        : (fechaRaw.toDate?.()?.toISOString() ?? ''))
    : ''

  const data = (raw.data as Record<string, unknown>) ?? {}

  return {
    id,
    tipo:               (raw.tipo              as string) ?? '',
    uid_creador:        (raw.user_id           as string) ?? '',
    obraId:             (raw.obra_id           as string) ?? '',
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
  inspeccion_hseq:         'Insp. HSEQ',
  reporte_actos:           'Reporte Actos',
  emergencia:              'Emergencia',
}

export const TIPO_COLOR: Record<string, string> = {
  preoperacional:          'bg-brand-100 text-brand-800',
  ats:                     'bg-violet-100 text-violet-800',
  charla:                  'bg-purple-100 text-purple-800',
  permiso_alturas:         'bg-orange-100 text-orange-800',
  permiso_caliente:        'bg-red-100 text-red-800',
  inspeccion_herramientas: 'bg-cyan-100 text-cyan-800',
  inspeccion_epp:          'bg-teal-100 text-teal-800',
  inspeccion_escaleras:    'bg-sky-100 text-sky-800',
  inspeccion_arnes:        'bg-indigo-100 text-indigo-800',
  inspeccion_tieoff:       'bg-brand-100 text-brand-800',
  inspeccion_instalaciones:'bg-emerald-100 text-emerald-800',
  inspeccion_hseq:         'bg-lime-100 text-lime-800',
  reporte_actos:           'bg-amber-100 text-amber-800',
  emergencia:              'bg-rose-100 text-rose-800',
}

export const REVISION_BADGE: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  aprobado:  'bg-green-100 text-green-800',
  rechazado: 'bg-red-100 text-red-800',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch {
    return iso
  }
}

export function formatRelativeDate(iso: string): string {
  if (!iso) return 'sin actividad'
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `hace ${days} día${days !== 1 ? 's' : ''}`
  if (days < 30) return `hace ${Math.floor(days / 7)} sem`
  return formatDate(iso)
}
