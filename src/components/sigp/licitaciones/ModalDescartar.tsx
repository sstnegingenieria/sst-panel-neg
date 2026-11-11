// Descartar con motivo OBLIGATORIO (invariante 1 del 1.1).
//
// El motivo no es burocracia: la sección "Descartadas" de la bandeja se filtra
// por él, y ese filtro es lo que responde "¿por qué dejamos pasar 117
// procesos el año pasado?" — la pregunta que el registro en Excel no podía
// contestar sin leerlo fila por fila.
//
// ── LA UI HACE LA PREGUNTA, NO OFRECE LA ETIQUETA (B.3, D4) ─────────────────
// `RUIDO_LEXICO` y `FUERA_DE_ALCANCE` son fáciles de confundir, y confundirlos
// arruina justo la métrica que `RUIDO_LEXICO` existe para dar: si una detección
// CORRECTA se marca como ruido, el número dice que el léxico es peor de lo que
// es, y el "arreglo" sería borrar términos que funcionan.
//
// Así que no se ofrecen como dos etiquetas más de la lista. Se ofrecen como UNA
// entrada que abre la pregunta, con las dos respuestas debajo:
//     ¿el léxico se equivocó, o acertó y aun así no lo queremos?
// Que la distinción se aplique bien tiene que ser el camino fácil, no el que
// requiere acordarse.
//
// Y donde NO HUBO LÉXICO la pregunta no se hace: ahí `RUIDO_LEXICO` no se
// ofrece siquiera, y `FUERA_DE_ALCANCE` es un motivo normal de la lista.
//
// «No hubo léxico» NO es lo mismo que «no vino del radar» (B.3, sub-bloque 4).
// Un proceso que entró por CÓDIGO con el texto en silencio —señal
// `codigo_en_clase_sin_texto`, los de ferretería pura— vino del radar y aun así
// el vocabulario no opinó sobre él. Hacerle la pregunta invitaría a marcar
// `RUIDO_LEXICO` sobre algo donde el léxico no falló, que es el mismo daño que
// esta pregunta vino a evitar. El gate es `lexicoParticipo()`, cuyo predicado
// son los TÉRMINOS: ellos son la huella de que el vocabulario coincidió.
import { useEffect, useState } from 'react'
import Modal from '../../shared/Modal'
import SelectField from '../../shared/SelectField'
import {
  MOTIVOS_DESCARTE, MOTIVOS_DESCARTE_DEL_LEXICO, MOTIVO_DESCARTE_LABEL,
} from '../../../types/sigp/licitacion'
import type { MotivoDescarte } from '../../../types/sigp/licitacion'

/** Valor centinela del selector que abre la pregunta. No es un motivo. */
const ABRE_PREGUNTA = '__LEXICO__'

interface Props {
  abierto: boolean
  /**
   * ¿El léxico participó en que este proceso entrara? Decide si la pregunta
   * tiene sentido. Se calcula con `lexicoParticipo(lic.radar)` — no con
   * `esDelRadar`, que es más ancho de lo que la pregunta soporta.
   */
  lexicoParticipo: boolean
  onCerrar: () => void
  onConfirmar: (motivo: MotivoDescarte) => void
}

export default function ModalDescartar(
  { abierto, lexicoParticipo, onCerrar, onConfirmar }: Props,
) {
  const [eleccion, setEleccion] = useState('')
  const [respuesta, setRespuesta] = useState<MotivoDescarte | ''>('')

  useEffect(() => { if (abierto) { setEleccion(''); setRespuesta('') } }, [abierto])

  const opciones = lexicoParticipo
    // Hubo léxico: los dos motivos del léxico salen de la lista y entran por
    // la pregunta, que es la única forma de que la distinción se aplique bien.
    ? [
      ...MOTIVOS_DESCARTE
        .filter(m => !MOTIVOS_DESCARTE_DEL_LEXICO.includes(m))
        .map(m => ({ value: m as string, label: MOTIVO_DESCARTE_LABEL[m] })),
      { value: ABRE_PREGUNTA, label: 'El léxico lo trajo y no nos sirve…' },
    ]
    // Sin léxico de por medio —tecleada a mano, o traída por código con el
    // texto en silencio—: `RUIDO_LEXICO` no tiene sobre qué opinar.
    : MOTIVOS_DESCARTE
      .filter(m => m !== 'RUIDO_LEXICO')
      .map(m => ({ value: m as string, label: MOTIVO_DESCARTE_LABEL[m] }))

  const preguntando = eleccion === ABRE_PREGUNTA
  const motivoFinal: MotivoDescarte | '' = preguntando
    ? respuesta
    : (eleccion as MotivoDescarte | '')

  return (
    <Modal
      isOpen={abierto}
      title="Descartar proceso"
      onClose={onCerrar}
      size="md"
      actions={[
        { label: 'Volver', onClick: onCerrar, variant: 'secondary' },
        {
          label: 'Descartar',
          onClick: () => motivoFinal && onConfirmar(motivoFinal),
          variant: 'danger',
          disabled: !motivoFinal,
        },
      ]}
    >
      <div className="space-y-3">
        <SelectField
          label="Motivo del descarte"
          value={eleccion}
          onChange={v => { setEleccion(v); setRespuesta('') }}
          required
          options={[{ value: '', label: 'Elegir…' }, ...opciones]}
        />

        {preguntando && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
            <p className="text-sm font-semibold text-gray-800">
              ¿El léxico se equivocó, o acertó y aun así no lo queremos?
            </p>
            {([
              {
                valor: 'RUIDO_LEXICO' as MotivoDescarte,
                titulo: 'Se equivocó',
                detalle: 'Esto no tiene nada que ver con lo que NEG hace. El léxico lo trajo por error.',
              },
              {
                valor: 'FUERA_DE_ALCANCE' as MotivoDescarte,
                titulo: 'Acertó, pero no lo queremos',
                detalle: 'El objeto sí habla del trabajo de NEG, pero este proceso no es para nosotros.',
              },
            ]).map(o => (
              <label
                key={o.valor}
                className={`flex gap-2 items-start p-2 rounded-lg cursor-pointer border ${
                  respuesta === o.valor
                    ? 'border-brand-600 bg-white'
                    : 'border-transparent hover:bg-white/60'
                }`}
              >
                <input
                  type="radio"
                  name="motivo-lexico"
                  className="mt-1"
                  checked={respuesta === o.valor}
                  onChange={() => setRespuesta(o.valor)}
                />
                <span className="text-sm">
                  <span className="font-medium text-gray-800">{o.titulo}</span>
                  <span className="block text-xs text-gray-600">{o.detalle}</span>
                </span>
              </label>
            ))}
            <p className="text-xs text-gray-600">
              La diferencia importa: es la única forma de saber con número si el
              léxico está trayendo basura, en vez de con la impresión de quien
              descarta.
            </p>
          </div>
        )}

        <p className="text-xs text-gray-500">
          Descartar es reversible: el proceso se puede reabrir en evaluación.
          Si ya tenía consecutivo, lo conserva — el número gastado no se devuelve.
        </p>
      </div>
    </Modal>
  )
}
