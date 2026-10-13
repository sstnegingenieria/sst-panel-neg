// Rastro de custodia de un aval físico: la declaración vigente + las anteriores.
//
// La declaración NUNCA se edita en sitio. Corregirla es registrar un aval
// físico NUEVO (su propia fecha_registro y su propia entrada del historial); la
// anterior permanece aquí, en el historial append-only. Este modal es la vista
// de auditoría de esa cadena: qué se declaró, quién, cuándo, y qué lo reemplazó.
import { useEffect, useMemo, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import Modal from '../../shared/Modal'
import {
  LEYENDA_AVAL_FISICO, etiquetasFormatosAval, rastroCustodia, textoDeclaracionDe,
} from '../../../types/sigp/avalFisico'
import type { VerificacionSst } from '../../../types/sigp/verificacionSst'

interface Props {
  verificacion: VerificacionSst | null
  onClose: () => void
}

const fFechaHora = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) ?? '—'
const fDia = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

export default function RastroCustodiaModal({ verificacion, onClose }: Props) {
  const rastro = useMemo(() => (verificacion ? rastroCustodia(verificacion) : []), [verificacion])
  // uid → nombre (best-effort: si no se puede leer, se muestra el uid)
  const [nombres, setNombres] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelado = false
    const uids = [...new Set(rastro.map(r => r.por).filter(Boolean))]
    Promise.all(uids.map(async uid => {
      try {
        const s = await getDoc(doc(db, 'users', uid))
        return [uid, (s.data()?.nombre as string | undefined) || uid] as const
      } catch { return [uid, uid] as const }
    })).then(pares => { if (!cancelado) setNombres(Object.fromEntries(pares)) })
    return () => { cancelado = true }
  }, [rastro])

  return (
    <Modal
      isOpen={verificacion !== null}
      title={`Custodia de formatos físicos — ${verificacion?.consecutivo ?? ''}`}
      onClose={onClose}
      size="lg"
      actions={[{ label: 'Cerrar', onClick: onClose, variant: 'secondary' }]}
    >
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          La declaración no se edita: una corrección es un aval físico NUEVO y la anterior queda en
          este rastro ({LEYENDA_AVAL_FISICO}).
        </p>
        {rastro.length === 0 && (
          <p className="text-sm text-gray-500">Este proyecto no tiene declaraciones de custodia registradas.</p>
        )}
        {rastro.map((r, i) => (
          <div key={i}
            className={`rounded-lg border px-4 py-3 text-sm space-y-1 ${
              r.vigente ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                r.vigente ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'}`}>
                {r.vigente ? 'Declaración vigente' : 'Anterior (reemplazada)'}
              </span>
              <span className="text-xs text-gray-500">
                {fFechaHora(r.fecha)} · {nombres[r.por] ?? r.por}
              </span>
            </div>
            <p><span className="text-gray-500">Responsable del archivo:</span> <strong>{r.fisico.responsable_archivo}</strong></p>
            <p><span className="text-gray-500">Ubicación:</span> {r.fisico.ubicacion}</p>
            <p><span className="text-gray-500">Formatos:</span> {etiquetasFormatosAval(r.fisico).join(', ')}
              <span className="text-gray-400"> · fecha de los formatos: {fDia(r.fisico.fecha_formatos)}</span></p>
            <p><span className="text-gray-500">Motivo:</span> {r.fisico.motivo}</p>
            <p className="text-xs text-gray-500 italic">
              Declaración ({r.fisico.declaracion_version ?? '—'}): {textoDeclaracionDe(r.fisico.declaracion_version)}
            </p>
            <p className="text-[11px] text-gray-400">Declarado por: {r.fisico.declaracion_email ?? '—'}</p>
          </div>
        ))}
      </div>
    </Modal>
  )
}
