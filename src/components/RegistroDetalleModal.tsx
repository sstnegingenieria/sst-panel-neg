import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { toast } from './shared/Toast'
import { Formulario, TIPO_LABELS } from './RegistrosTable'

interface Props {
  formulario: Formulario
  onClose: () => void
  onVistobueno: (
    id: string,
    estado: 'aprobado' | 'rechazado',
    observacion: string,
    revisadoPor: string,
  ) => Promise<void>
  onPdfDescargado?: (id: string) => void
}

// ── Helpers para renderizar campos_dinamicos ─────────────────────────────────

function formatKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\./g, ' › ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—'
  if (typeof val === 'boolean') return val ? 'Sí' : 'No'
  if (Array.isArray(val)) return val.length === 0 ? '—' : val.join(', ')
  if (typeof val === 'object') {
    try { return JSON.stringify(val, null, 2) } catch { return String(val) }
  }
  return String(val)
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

// ── Componente ───────────────────────────────────────────────────────────────

export default function RegistroDetalleModal({ formulario: f, onClose, onVistobueno, onPdfDescargado }: Props) {
  const { user } = useAuth()
  const [revEstado, setRevEstado] = useState<'aprobado' | 'rechazado'>(
    f.revision_sst?.estado === 'rechazado' ? 'rechazado' : 'aprobado'
  )
  const [observacion, setObservacion] = useState(f.revision_sst?.observacion ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onVistobueno(f.id, revEstado, observacion, user?.nombre ?? 'SST')
      toast(`Formulario ${revEstado} correctamente`)
    } catch {
      toast('Error al guardar revisión', 'error')
    } finally {
      setSaving(false)
    }
  }

  const campos = Object.entries(f.campos_dinamicos ?? {})

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      aria-modal="true"
      role="dialog"
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl my-8 flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              {TIPO_LABELS[f.tipo] ?? f.tipo}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">
              {f.codigo_formato} · ID: {f.id.slice(0, 12)}…
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6 overflow-y-auto" style={{ maxHeight: '75vh' }}>

          {/* Información general */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Información general
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
              <InfoItem label="Técnico"     value={f.responsable} />
              <InfoItem label="Obra"        value={f.proyecto} />
              <InfoItem label="Fecha envío" value={formatDate(f.timestamp_creacion)} />
              {f.ciudad    && <InfoItem label="Ciudad"    value={f.ciudad} />}
              {f.direccion && <InfoItem label="Dirección" value={f.direccion} />}
              {f.version   && <InfoItem label="Versión"   value={f.version} />}
            </div>
          </section>

          {/* Campos dinámicos */}
          {campos.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Datos del formulario
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {campos.map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-lg px-3 py-2 min-w-0">
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide truncate">
                      {formatKey(k)}
                    </p>
                    <p className="text-sm text-gray-700 mt-0.5 break-words whitespace-pre-wrap">
                      {formatValue(v)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Fotos */}
          {f.fotos_urls && f.fotos_urls.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Evidencias fotográficas ({f.fotos_urls.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {f.fotos_urls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <img
                      src={url}
                      alt={`Foto ${i + 1}`}
                      className="w-20 h-20 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition"
                    />
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* PDF */}
          {f.pdf_url && (
            <PdfViewer
              url={f.pdf_url}
              onAbrir={() => onPdfDescargado?.(f.id)}
            />
          )}

          {/* ── Revisión SST / Visto bueno ──────────────────────────────────── */}
          <section className="border border-gray-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-sm font-semibold text-gray-700">Revisión SST</h3>
              {f.revision_sst?.estado && (
                <span
                  className={`ml-auto text-xs px-2.5 py-0.5 rounded-full font-medium capitalize ${
                    f.revision_sst.estado === 'aprobado'  ? 'bg-green-100 text-green-800' :
                    f.revision_sst.estado === 'rechazado' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {f.revision_sst.estado}
                </span>
              )}
            </div>

            {f.revision_sst?.revisado_por && (
              <p className="text-xs text-gray-400">
                Revisado por{' '}
                <strong className="text-gray-600">{f.revision_sst.revisado_por}</strong>
                {f.revision_sst.fecha_revision &&
                  ` · ${new Date(f.revision_sst.fecha_revision).toLocaleDateString('es-CO')}`}
              </p>
            )}

            {/* Toggle aprobar / rechazar */}
            <div className="flex gap-3">
              <label
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border-2 cursor-pointer text-sm font-medium transition select-none ${
                  revEstado === 'aprobado'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="rev"
                  value="aprobado"
                  className="sr-only"
                  checked={revEstado === 'aprobado'}
                  onChange={() => setRevEstado('aprobado')}
                />
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Aprobar
              </label>

              <label
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border-2 cursor-pointer text-sm font-medium transition select-none ${
                  revEstado === 'rechazado'
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="rev"
                  value="rechazado"
                  className="sr-only"
                  checked={revEstado === 'rechazado'}
                  onChange={() => setRevEstado('rechazado')}
                />
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Rechazar
              </label>
            </div>

            <textarea
              value={observacion}
              onChange={e => setObservacion(e.target.value)}
              placeholder="Observación (opcional)..."
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium transition disabled:opacity-50"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Guardando…
                </span>
              ) : (
                'Guardar revisión'
              )}
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function PdfViewer({ url, onAbrir }: { url: string; onAbrir?: () => void }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Documento PDF
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-blue-700 hover:text-blue-800 font-medium hover:underline"
          >
            {expanded ? 'Ocultar vista previa' : 'Ver en panel'}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onAbrir?.()}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 hover:underline"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Abrir
          </a>
        </div>
      </div>
      {expanded && (
        <iframe
          src={url}
          className="w-full rounded-lg border border-gray-200"
          style={{ height: '520px' }}
          title="Vista previa PDF"
        />
      )}
    </section>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-700 mt-0.5 break-words">{value}</p>
    </div>
  )
}
