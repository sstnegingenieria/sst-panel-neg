// Modal "Registrar formatos físicos y avalar" — Gate SST por formatos en papel.
//
// Cuando el cliente exige los formatos SST en FÍSICO no hay formularios en la
// app y la cola queda sin evidencia. Gestión Integral da el aval dejando un
// REGISTRO DE CUSTODIA (quién guarda el archivo, dónde, qué formatos cubre, de
// qué fecha, por qué fue físico) y DECLARANDO que los originales están
// archivados y disponibles para auditoría. Los formatos NO se escanean (pueden
// ser 100+ hojas): el panel guarda la constancia de custodia, no una copia.
// "Registrar y avalar" se habilita con todo completo Y la declaración marcada —
// y la regla de Firestore lo exige igual (la obligatoriedad no vive solo aquí).
import { useEffect, useMemo, useState } from 'react'
import { Timestamp, arrayUnion, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { toast } from '../../shared/Toast'
import Modal from '../../shared/Modal'
import { estadoSstGate } from '../../../types/sigp/proyecto'
import type { SstGateProyecto } from '../../../types/sigp/proyecto'
import {
  AYUDA_UBICACION, MAX_TEXTO_AVAL, MIN_MOTIVO_FISICO, MIN_UBICACION, OPCIONES_TIPO_FORMATO,
  PLACEHOLDER_UBICACION, TEXTO_DECLARACION, TIPO_FORMATO_OTRO, esAvalFisico,
  fechaFormatosATimestampMs, patchAvalFisico, validarAvalFisico,
} from '../../../types/sigp/avalFisico'
import type { EntradaAvalFisico } from '../../../types/sigp/avalFisico'
import type { VerificacionSst } from '../../../types/sigp/verificacionSst'

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
  // La declaración NUNCA se edita en sitio: corregir = un aval físico NUEVO.
  const esCorreccion = esAvalFisico(verificacion?.sst_gate)
  const [responsable, setResponsable] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [fecha, setFecha] = useState('')
  const [tipos, setTipos] = useState<string[]>([])
  const [otro, setOtro] = useState('')
  const [motivo, setMotivo] = useState('')
  const [declaracion, setDeclaracion] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    setResponsable(''); setUbicacion(''); setFecha(''); setTipos([]); setOtro(''); setMotivo('')
    setDeclaracion(false); setGuardando(false)
  }, [abierto, verificacion?.proyecto_id])

  const entrada: EntradaAvalFisico = useMemo(() => ({
    responsable_archivo: responsable, ubicacion, fecha_formatos: fecha,
    tipos_formato: tipos, formato_otro: otro, motivo, declaracion,
  }), [responsable, ubicacion, fecha, tipos, otro, motivo, declaracion])
  const faltantes = Object.values(validarAvalFisico(entrada))
  const listo = faltantes.length === 0 && !!uid

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
      title={`${esCorreccion ? 'Corregir custodia' : 'Formatos físicos'} — ${verificacion?.consecutivo ?? ''}`}
      onClose={onClose}
      size="lg"
      actions={[
        { label: 'Volver', onClick: onClose, variant: 'secondary' },
        { label: guardando ? 'Registrando…' : 'Registrar y avalar', onClick: avalar, variant: 'primary', loading: guardando, disabled: !listo },
      ]}
    >
      <div className="space-y-4">
        {esCorreccion && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            La declaración vigente <strong>no se edita</strong>: esto registra un aval físico NUEVO
            (con su propia fecha) y la declaración anterior queda en el rastro de custodia.
          </p>
        )}
        <p className="text-sm text-gray-600">
          Avala a <strong>{verificacion?.contratista_nombre || '—'}</strong> con los formatos SST en
          papel. No se escanean: queda el <strong>registro de custodia</strong> del archivo y tu
          declaración. Se marca como aval <strong>físico</strong> (distinguible del aval por app) y
          habilita la liquidación.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-gray-500">
            Responsable del archivo <span className="text-red-500">*</span>
            <input value={responsable} maxLength={MAX_TEXTO_AVAL} onChange={e => setResponsable(e.target.value)}
              className={input} placeholder="Quién custodia los originales" />
          </label>
          <label className="text-xs text-gray-500">
            Ubicación del archivo <span className="text-red-500">*</span>
            <input value={ubicacion} maxLength={MAX_TEXTO_AVAL} onChange={e => setUbicacion(e.target.value)}
              className={input} placeholder={PLACEHOLDER_UBICACION} />
            <span className="block text-[11px] text-gray-400 mt-1">
              {AYUDA_UBICACION} Mínimo {MIN_UBICACION} caracteres.
            </span>
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
            <input value={otro} maxLength={MAX_TEXTO_AVAL} onChange={e => setOtro(e.target.value)}
              className={input} placeholder="Nombre del formato" />
          </label>
        )}

        <label className="block text-xs text-gray-500">
          Motivo — ¿por qué fue físico? <span className="text-red-500">*</span>
          <textarea value={motivo} maxLength={MAX_TEXTO_AVAL} onChange={e => setMotivo(e.target.value)} rows={2} className={input}
            placeholder="Ej: el cliente exige los formatos SST impresos y firmados en sitio" />
          <span className="block text-[11px] text-gray-400 mt-1">Mínimo {MIN_MOTIVO_FISICO} caracteres.</span>
        </label>

        <label className="flex items-start gap-2 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
          <input type="checkbox" checked={declaracion} onChange={e => setDeclaracion(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-300" />
          <span><strong>Declaración.</strong> {TEXTO_DECLARACION}</span>
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
