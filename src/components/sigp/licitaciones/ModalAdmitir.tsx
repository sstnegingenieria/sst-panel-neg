// Admitir una licitación del radar — y, de paso, pedir las fechas que el
// origen NO TRAE.
//
// ── POR QUÉ SE PIDEN ACÁ Y NO DESPUÉS ──────────────────────────────────────
// Admitir es el momento en que alguien lee el pliego por primera vez. Las dos
// fechas que faltan están ahí, en el pliego, y en ningún otro lado: el límite
// de manifestación de interés y la fecha de sorteo NO EXISTEN en datos
// abiertos — medido sobre 10.421 procesos de 2026, `fecha_de_recepcion_de`
// vale lo mismo en la fila de manifestación y en la de oferta en el 85,8 %, o
// sea que es el límite de la OFERTA en las dos.
//
// Pedirlas en otro momento es pedirle a alguien que vuelva a abrir el pliego.
//
// ── Y POR QUÉ SON OPCIONALES ───────────────────────────────────────────────
// Porque el sistema informa, no decide. Si Karen quiere admitir ya y leer el
// pliego después, admite; la ficha dirá que falta la fecha de manifestación y
// por qué importa. Un campo obligatorio acá solo lograría que alguien escriba
// cualquier cosa para pasar.
import { useEffect, useState } from 'react'
import Modal from '../../shared/Modal'
import { ordenCronogramaValido } from '../../../types/sigp/licitacion'
import type { Licitacion } from '../../../types/sigp/licitacion'

/** Fechas como las escribe un formulario: `AAAA-MM-DD` o vacío. */
export interface FechasFormulario {
  manifestacion: string
  sorteo: string
  cierre: string
}

const aIso = (ts: { toDate?: () => Date } | null | undefined): string => {
  const d = ts?.toDate?.()
  if (!d) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Para validar el orden sin construir Timestamps: milisegundos del día local. */
const ms = (iso: string): { toMillis: () => number } | null =>
  iso ? { toMillis: () => Date.parse(`${iso}T12:00:00`) } : null

interface Props {
  abierto: boolean
  licitacion: Licitacion | null
  /** `true` si el proceso pasó (o está en) una fase de manifestación. */
  hubeManifestacion: boolean
  guardando?: boolean
  onCerrar: () => void
  onConfirmar: (fechas: FechasFormulario) => void
}

export default function ModalAdmitir({
  abierto, licitacion, hubeManifestacion, guardando, onCerrar, onConfirmar,
}: Props) {
  const [f, setF] = useState<FechasFormulario>({ manifestacion: '', sorteo: '', cierre: '' })

  useEffect(() => {
    if (!abierto || !licitacion) return
    setF({
      manifestacion: aIso(licitacion.cronograma.manifestacion),
      sorteo: aIso(licitacion.cronograma.sorteo),
      // El cierre SÍ viene del origen: se precarga y se puede corregir.
      cierre: aIso(licitacion.cronograma.cierre),
    })
  }, [abierto, licitacion])

  const ordenOk = ordenCronogramaValido({
    manifestacion: ms(f.manifestacion) as never,
    sorteo: ms(f.sorteo) as never,
    cierre: ms(f.cierre) as never,
  })

  const campo = (
    k: keyof FechasFormulario, etiqueta: string, ayuda: string,
  ) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{etiqueta}</label>
      <input
        type="date"
        value={f[k]}
        onChange={e => setF(v => ({ ...v, [k]: e.target.value }))}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                   focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
      />
      <p className="text-xs text-gray-500 mt-1">{ayuda}</p>
    </div>
  )

  return (
    <Modal
      isOpen={abierto}
      title="Admitir en evaluación"
      onClose={onCerrar}
      size="md"
      actions={[
        { label: 'Cancelar', onClick: onCerrar, variant: 'secondary' },
        {
          label: guardando ? 'Guardando…' : 'Admitir',
          onClick: () => onConfirmar(f),
          variant: 'primary',
          disabled: !!guardando || !ordenOk,
        },
      ]}
    >
      {licitacion && (
        <div className="space-y-4 text-sm">
          <p className="text-gray-700">
            <strong>{licitacion.numero_proceso}</strong> pasa a evaluación y entra a
            competir por el cupo de la semana. No gasta consecutivo: el número se
            asigna al comprometerse con horas de trabajo, no al mirar.
          </p>

          {hubeManifestacion && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-1">
              <p className="text-sm font-semibold text-gray-800">
                Este proceso tiene manifestación de interés
              </p>
              <p className="text-xs text-gray-700 leading-relaxed">
                En menor cuantía, quien no manifiesta interés antes del límite
                <strong> no puede presentar oferta</strong>, aunque la fecha de cierre
                siga vigente. Esa fecha no viene en los datos del SECOP — está en el
                pliego, y anotarla acá es lo que le permite al panel avisar a tiempo.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {campo('manifestacion', 'Límite de manifestación de interés',
              'Del pliego. No viene en los datos abiertos: si no se anota acá, nadie la va a tener.')}
            {campo('sorteo', 'Sorteo',
              'Si el proceso tiene sorteo de consolidación. Tampoco viene en los datos.')}
            {campo('cierre', 'Presentación de la oferta',
              'Viene del SECOP y ya está cargada. Se puede corregir si el pliego dice otra cosa.')}
          </div>

          {!ordenOk && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">
              Las fechas están fuera de orden: la manifestación va antes del sorteo, y
              el sorteo antes de la presentación.
            </p>
          )}

          <p className="text-xs text-gray-500">
            Las tres son opcionales: se puede admitir ahora y anotarlas al leer el
            pliego — la ficha va a decir cuál falta.
          </p>
        </div>
      )}
    </Modal>
  )
}
