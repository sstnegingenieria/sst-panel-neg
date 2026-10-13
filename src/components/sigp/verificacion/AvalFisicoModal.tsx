// Modal "Registrar formatos físicos y avalar" — Gate SST por formatos en papel.
//
// Cuando el cliente exige los formatos SST en FÍSICO no hay formularios en la
// app y la cola queda sin evidencia. Gestión Integral da el aval cargando el
// ESCANEO: sin archivo el botón no se habilita (y la regla de Firestore lo
// rechaza igual — la obligatoriedad no vive solo aquí). El escaneo se sube al
// elegirlo (Storage verificacion_sst/{proyectoId}/fisico/{uuid}) para que el
// botón de avalar dependa de "ya está cargado", no de "hay un archivo local".
import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Timestamp, arrayUnion, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '../../../firebase/config'
import { toast } from '../../shared/Toast'
import Modal from '../../shared/Modal'
import { estadoSstGate } from '../../../types/sigp/proyecto'
import type { SstGateProyecto } from '../../../types/sigp/proyecto'
import {
  MAX_TEXTO_AVAL, MIN_MOTIVO_FISICO, OPCIONES_TIPO_FORMATO, TIPO_FORMATO_OTRO,
  extensionDeEscaneo, fechaFormatosATimestampMs, patchAvalFisico, validarAvalFisico,
} from '../../../types/sigp/avalFisico'
import type { EntradaAvalFisico } from '../../../types/sigp/avalFisico'
import type { VerificacionSst } from '../../../types/sigp/verificacionSst'

const MAX_BYTES = 10 * 1024 * 1024  // espejo de storage.rules

interface Props {
  verificacion: VerificacionSst | null
  uid: string | undefined
  onClose: () => void
  onSaved: () => void
}

const hoyLocal = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function AvalFisicoModal({ verificacion, uid, onClose, onSaved }: Props) {
  const abierto = verificacion !== null
  const [soporteUrl, setSoporteUrl] = useState('')
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [quien, setQuien] = useState('')
  const [cargo, setCargo] = useState('')
  const [fecha, setFecha] = useState('')
  const [tipos, setTipos] = useState<string[]>([])
  const [otro, setOtro] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    setSoporteUrl(''); setNombreArchivo(''); setSubiendo(false)
    setQuien(''); setCargo(''); setFecha(''); setTipos([]); setOtro(''); setMotivo('')
    setGuardando(false)
  }, [abierto, verificacion?.proyecto_id])

  const entrada: EntradaAvalFisico = useMemo(() => ({
    soporte_url: soporteUrl, quien_tiene_original: quien, cargo,
    fecha_formatos: fecha, tipos_formato: tipos, formato_otro: otro, motivo,
  }), [soporteUrl, quien, cargo, fecha, tipos, otro, motivo])
  const errores = validarAvalFisico(entrada)
  const listo = Object.keys(errores).length === 0 && !subiendo && !!uid
  const faltantes = Object.values(errores)

  const onArchivo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setSoporteUrl(''); setNombreArchivo('')
    if (!file || !verificacion) return
    if (file.size >= MAX_BYTES) { toast('El archivo debe pesar menos de 10 MB', 'error'); return }
    const ext = extensionDeEscaneo(file.type)
    if (!ext) { toast('El escaneo debe ser PDF o imagen (PNG, JPG, WEBP, HEIC)', 'error'); return }
    setSubiendo(true)
    try {
      const r = ref(storage, `verificacion_sst/${verificacion.proyecto_id}/fisico/${crypto.randomUUID()}.${ext}`)
      await uploadBytes(r, file, { contentType: file.type })
      setSoporteUrl(await getDownloadURL(r))
      setNombreArchivo(file.name)
    } catch {
      toast('No se pudo subir el escaneo (¿permisos o conexión?)', 'error')
    } finally { setSubiendo(false) }
  }

  const alternarTipo = (valor: string) =>
    setTipos(t => t.includes(valor) ? t.filter(x => x !== valor) : [...t, valor])

  const avalar = async () => {
    if (!verificacion || !uid || !listo) return
    setGuardando(true)
    try {
      // Estado FRESCO del gate: la regla exige que `de` de la entrada del
      // historial coincida con el estado real en el servidor (una pestaña con
      // datos viejos habría fallado con un error engañoso).
      const fresco = await getDoc(doc(db, 'verificaciones_sst', verificacion.proyecto_id))
      const estadoActual = estadoSstGate({ sst_gate: fresco.data()?.sst_gate as SstGateProyecto | undefined })
      const p = patchAvalFisico(
        entrada, uid, estadoActual,
        serverTimestamp(), Timestamp.now(), Timestamp.fromMillis(fechaFormatosATimestampMs(fecha)),
      )
      if (!p) return
      await updateDoc(doc(db, 'verificaciones_sst', verificacion.proyecto_id), {
        sst_gate: p.sst_gate,
        fecha_actualizacion: serverTimestamp(),
        historial: arrayUnion(p.entradaHistorial),
      })
      toast('Aval físico registrado — liquidación habilitada')
      onSaved()
      onClose()
    } catch {
      toast('No se pudo registrar el aval físico: revisa los datos, recarga la página (el estado pudo cambiar) o verifica tu rol', 'error')
    } finally { setGuardando(false) }
  }

  const input = 'mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300'

  return (
    <Modal
      isOpen={abierto}
      title={`Formatos físicos — ${verificacion?.consecutivo ?? ''}`}
      onClose={onClose}
      size="lg"
      actions={[
        { label: 'Volver', onClick: onClose, variant: 'secondary' },
        { label: guardando ? 'Registrando…' : 'Registrar y avalar', onClick: avalar, variant: 'primary', loading: guardando, disabled: !listo },
      ]}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Avala a <strong>{verificacion?.contratista_nombre || '—'}</strong> con los formatos SST en
          papel. Queda registrado como aval <strong>físico</strong> (distinguible del aval por app) y
          habilita la liquidación. <strong>Sin el escaneo no hay aval.</strong>
        </p>

        <label className="block text-sm">
          <span className="font-medium text-gray-700">Escaneo de los formatos (PDF o imagen) <span className="text-red-500">*</span></span>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif" onChange={onArchivo} disabled={subiendo}
            className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
          <span className="block text-[11px] text-gray-400 mt-1">Si son varios formatos, únelos en un solo PDF. Máx. 10 MB.</span>
          {subiendo && <span className="block text-xs text-gray-500 mt-1">Subiendo escaneo…</span>}
          {soporteUrl && <span className="block text-xs text-emerald-700 mt-1">✔ Escaneo cargado: {nombreArchivo}</span>}
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-gray-500">
            ¿Quién tiene el original? <span className="text-red-500">*</span>
            <input value={quien} maxLength={MAX_TEXTO_AVAL} onChange={e => setQuien(e.target.value)} className={input} placeholder="Nombre" />
          </label>
          <label className="text-xs text-gray-500">
            Cargo (opcional)
            <input value={cargo} maxLength={MAX_TEXTO_AVAL} onChange={e => setCargo(e.target.value)} className={input} placeholder="Ej: Supervisor del cliente" />
          </label>
        </div>

        <label className="block text-xs text-gray-500 sm:w-1/2">
          Fecha de los formatos <span className="text-red-500">*</span>
          <input type="date" value={fecha} max={hoyLocal()} onChange={e => setFecha(e.target.value)} className={input} />
        </label>

        <fieldset>
          <legend className="text-xs text-gray-500">Formatos que cubre el aval <span className="text-red-500">*</span></legend>
          <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">
            {OPCIONES_TIPO_FORMATO.map(o => (
              <label key={o.valor} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={tipos.includes(o.valor)} onChange={() => alternarTipo(o.valor)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-300" />
                {o.etiqueta}
              </label>
            ))}
          </div>
        </fieldset>

        {tipos.includes(TIPO_FORMATO_OTRO) && (
          <label className="block text-xs text-gray-500">
            ¿Cuál formato? (el propio del cliente) <span className="text-red-500">*</span>
            <input value={otro} maxLength={MAX_TEXTO_AVAL} onChange={e => setOtro(e.target.value)} className={input} placeholder="Nombre del formato" />
          </label>
        )}

        <label className="block text-xs text-gray-500">
          Motivo — ¿por qué fue físico? <span className="text-red-500">*</span>
          <textarea value={motivo} maxLength={MAX_TEXTO_AVAL} onChange={e => setMotivo(e.target.value)} rows={2} className={input}
            placeholder="Ej: el cliente exige los formatos SST impresos y firmados en sitio" />
          <span className="block text-[11px] text-gray-400 mt-1">Mínimo {MIN_MOTIVO_FISICO} caracteres.</span>
        </label>

        {faltantes.length > 0 && (
          <ul className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 space-y-0.5 list-disc list-inside">
            {faltantes.map(f => <li key={f}>{f}</li>)}
          </ul>
        )}
      </div>
    </Modal>
  )
}
