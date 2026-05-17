import { useState } from 'react'
import { Tecnico } from './UsuariosPendientes'
import { Obra } from './ObrasTable'
import { getDocEstado, getSaludDocumental, estadoLabel, estadoClasses, formatFechaVenc } from '../utils/vencimiento'

async function descargarArchivo(url: string, nombreArchivo: string) {
  const resp = await fetch(url)
  const blob = await resp.blob()
  const blobUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = nombreArchivo
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(blobUrl)
}

interface Props {
  isOpen: boolean
  onClose: () => void
  tecnico: Tecnico | null
  obras: Obra[]
}

function InfoFila({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="py-2.5 border-b border-gray-100 last:border-0 flex items-start gap-3">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-36 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-800 break-all">
        {value ?? <span className="text-gray-300 italic">No registrado</span>}
      </span>
    </div>
  )
}

function DocFila({ label, entidad, vencimiento }: { label: string; entidad?: string; vencimiento?: string }) {
  const estado = getDocEstado(vencimiento)
  return (
    <div className="py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${estadoClasses[estado]}`}>
          {estadoLabel(estado)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-sm text-gray-800">
          {entidad ?? <span className="text-gray-300 italic">No registrado</span>}
        </span>
        {vencimiento && (
          <span className="text-xs text-gray-500">Vence: {formatFechaVenc(vencimiento)}</span>
        )}
      </div>
    </div>
  )
}

const estadoBadge: Record<string, string> = {
  activo: 'bg-green-100 text-green-800',
  inactivo: 'bg-red-100 text-red-800',
  pendiente: 'bg-amber-100 text-amber-800',
}

export default function TecnicoPerfilModal({ isOpen, onClose, tecnico, obras }: Props) {
  const [descargando, setDescargando] = useState<string | null>(null)

  const handleDescargar = async (url: string, label: string, nombre: string) => {
    setDescargando(label)
    try {
      // Infiere extensión desde la URL o tipo MIME
      const ext = url.includes('.pdf') ? 'pdf' : url.includes('.png') ? 'png' : url.includes('.jpg') || url.includes('.jpeg') ? 'jpg' : 'pdf'
      await descargarArchivo(url, `${nombre}_${label.replace(/\s+/g, '_')}.${ext}`)
    } catch {
      window.open(url, '_blank')
    } finally {
      setDescargando(null)
    }
  }

  if (!isOpen || !tecnico) return null

  const obraMap = Object.fromEntries(obras.map(o => [o.id, o.nombre_sitio]))
  const obrasNombres = (tecnico.obras_asignadas ?? []).map(id => obraMap[id] ?? id)

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center text-xl font-bold text-green-700">
              {tecnico.nombre?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{tecnico.nombre}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${estadoBadge[tecnico.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                  {tecnico.estado}
                </span>
                <span className="text-xs text-gray-400">{tecnico.email}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">

          {/* Alert banner — document health */}
          {(() => {
            const saludDocs = getSaludDocumental(tecnico)
            return (saludDocs === 'vencido' || saludDocs === 'proximo') ? (
              <div className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 ${
                saludDocs === 'vencido'
                  ? 'bg-red-50 border border-red-200 text-red-800'
                  : 'bg-amber-50 border border-amber-200 text-amber-800'
              }`}>
                <span>{saludDocs === 'vencido' ? '🔴' : '⚠️'}</span>
                <span>
                  {saludDocs === 'vencido'
                    ? 'Hay documentos vencidos. Requiere actualización urgente.'
                    : 'Hay documentos próximos a vencer (≤ 30 días).'}
                </span>
              </div>
            ) : null
          })()}

          {/* Identificación */}
          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Identificación
            </h3>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              <InfoFila label="Cédula" value={tecnico.cedula} />
              <InfoFila label="Teléfono" value={tecnico.telefono} />
            </div>
          </section>

          {/* Seguridad social */}
          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Seguridad Social
            </h3>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              <DocFila label="EPS" entidad={tecnico.eps} vencimiento={tecnico.eps_vencimiento} />
              <DocFila label="ARL" entidad={tecnico.arl} vencimiento={tecnico.arl_vencimiento} />
              <DocFila label="Fondo de pensión" entidad={tecnico.fondo_pension} vencimiento={tecnico.pension_vencimiento} />
            </div>
          </section>

          {/* Documentos adjuntos */}
          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Documentos adjuntos
            </h3>
            <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2">
              {[
                { label: 'Cédula de ciudadanía', url: tecnico.cedula_url, icon: '🪪' },
                { label: 'Seguridad social (EPS / ARL)', url: tecnico.seguridad_social_url, icon: '📋' },
                { label: 'Certificado trabajo en alturas', url: tecnico.curso_alturas_url, icon: '🪜' },
              ].map(({ label, url, icon }) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base">{icon}</span>
                    <span className="text-sm text-gray-700 truncate">{label}</span>
                  </div>
                  {url ? (
                    <div className="shrink-0 flex items-center gap-1.5">
                      {/* Ver */}
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs font-medium transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Ver
                      </a>
                      {/* Descargar */}
                      <button
                        onClick={() => handleDescargar(url, label, tecnico.nombre)}
                        disabled={descargando === label}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-semibold transition-colors"
                      >
                        {descargando === label ? (
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        )}
                        {descargando === label ? 'Descargando…' : 'Descargar'}
                      </button>
                    </div>
                  ) : (
                    <span className="shrink-0 text-xs text-gray-300 italic">No adjuntado</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Empresa / Obras */}
          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Asignación
            </h3>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              <InfoFila label="Contratista" value={tecnico.contratista_nombre} />
              <div className="py-2.5 flex items-start gap-3">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-36 shrink-0 pt-0.5">Obras</span>
                <div className="flex flex-wrap gap-1.5">
                  {obrasNombres.length === 0
                    ? <span className="text-sm text-gray-300 italic">Sin asignar</span>
                    : obrasNombres.map((nombre, i) => (
                        <span
                          key={i}
                          className="inline-flex px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs border border-blue-100"
                        >
                          {nombre}
                        </span>
                      ))
                  }
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
