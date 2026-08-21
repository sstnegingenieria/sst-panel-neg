// Adjuntos del proceso por `tipoDoc` (1.4).
//
// Rutas y whitelist EXACTAS de storage.rules (1.2):
//   licitaciones/{id}/{pliego|propuesta|evidencia|subsanacion}/{uuid}
// `economia` NO está acá: vive en su propia ruta con su propio gate y su
// propia vista — mezclarlas en el mismo selector filtraría por la UI lo que
// las reglas separan.
import { useCallback, useEffect, useState } from 'react'
import { getDownloadURL, listAll, ref, uploadBytes } from 'firebase/storage'
import { storage } from '../../../firebase/config'
import { toast } from '../../shared/Toast'

/** Espejo de la whitelist de `storage.rules`. Si cambia allá, cambia acá. */
const TIPOS_DOC = ['pliego', 'propuesta', 'evidencia', 'subsanacion'] as const
type TipoDoc = typeof TIPOS_DOC[number]

const TIPO_LABEL: Record<TipoDoc, string> = {
  pliego: 'Pliego',
  propuesta: 'Propuesta presentada',
  evidencia: 'Evidencia',
  subsanacion: 'Subsanación',
}

const MAX_BYTES = 10 * 1024 * 1024

interface Archivo { nombre: string; url: string; tipo: TipoDoc }

export default function AdjuntosLicitacion({
  licitacionId, puedeSubir,
}: { licitacionId: string; puedeSubir: boolean }) {
  const [archivos, setArchivos] = useState<Archivo[]>([])
  const [subiendo, setSubiendo] = useState<TipoDoc | null>(null)

  const cargar = useCallback(async () => {
    const out: Archivo[] = []
    for (const tipo of TIPOS_DOC) {
      try {
        const res = await listAll(ref(storage, `licitaciones/${licitacionId}/${tipo}`))
        for (const item of res.items) {
          out.push({ nombre: item.name, url: await getDownloadURL(item), tipo })
        }
      } catch { /* carpeta vacía o sin permiso: se omite en silencio */ }
    }
    setArchivos(out)
  }, [licitacionId])

  useEffect(() => { void cargar() }, [cargar])

  const subir = async (tipo: TipoDoc, file: File) => {
    const esPdfOImagen = file.type === 'application/pdf' || file.type.startsWith('image/')
    if (!esPdfOImagen) { toast('El archivo debe ser un PDF o una imagen', 'error'); return }
    if (file.size > MAX_BYTES) { toast('El archivo no puede superar 10MB', 'error'); return }
    setSubiendo(tipo)
    try {
      // Nombre con UUID (mitigación H-008: el path no se adivina).
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'dat'
      const nombre = `${crypto.randomUUID()}.${ext}`
      await uploadBytes(ref(storage, `licitaciones/${licitacionId}/${tipo}/${nombre}`), file, {
        contentType: file.type,
      })
      toast(`${TIPO_LABEL[tipo]} adjuntado`)
      await cargar()
    } catch {
      toast('No se pudo subir el archivo', 'error')
    } finally { setSubiendo(null) }
  }

  return (
    <section className="bg-white border border-gray-300 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-gray-800 mb-3">Documentos del proceso</h2>
      <div className="space-y-3">
        {TIPOS_DOC.map(tipo => {
          const propios = archivos.filter(a => a.tipo === tipo)
          return (
            <div key={tipo} className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 w-44">{TIPO_LABEL[tipo]}</span>
              <div className="flex flex-wrap gap-2 flex-1">
                {propios.length === 0 && <span className="text-xs text-gray-400">sin archivos</span>}
                {propios.map(a => (
                  <a key={a.url} href={a.url} target="_blank" rel="noreferrer"
                    className="text-xs text-brand-700 hover:underline bg-gray-50 border border-gray-200 rounded px-2 py-0.5">
                    📎 {a.nombre.slice(0, 12)}…
                  </a>
                ))}
              </div>
              {puedeSubir && (
                <label className="text-xs text-brand-700 hover:underline cursor-pointer">
                  {subiendo === tipo ? 'Subiendo…' : '+ adjuntar'}
                  <input
                    type="file" className="hidden" accept="application/pdf,image/*"
                    disabled={subiendo !== null}
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) void subir(tipo, f)
                      e.target.value = ''
                    }}
                  />
                </label>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
