// Captura OBLIGATORIA al marcar presentada (1.4).
//
// Los tres datos solo existen en este momento y nadie los va a buscar después.
// Sin `manifestaciones` no hay probabilidad de sorteo; sin `ofertas_recibidas`
// no hay con qué medir la hipótesis de competencia que el registro del
// criterio deja planteada para una v1.1; sin `oferta_neg` no hay `pctNeg`.
//
// El botón usa el MISMO predicado que el patch builder
// (`datosPresentacionCompletos`): la regla vive en un solo lugar.
import { useEffect, useState } from 'react'
import Modal from '../../shared/Modal'
import TextField from '../../shared/TextField'
import { datosPresentacionCompletos, pctNeg } from '../../../types/sigp/licitacion'
import type { DatosPresentacion, Licitacion } from '../../../types/sigp/licitacion'
import { REFERENCIA_OFERTA, fueraDeBanda } from '../../../utils/sigp/ventanaLicitacion'
import { fmtMoney, fmtNum } from '../../../utils/sigp/formato'

/** Lee un monto/cantidad tolerando el formato es-CO. `undefined` si no es válido. */
const num = (s: string): number | undefined => {
  const t = s.replace(/[.\s$]/g, '').replace(',', '.')
  if (t === '') return undefined
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

interface Props {
  abierto: boolean
  lic: Licitacion
  onCerrar: () => void
  onConfirmar: (datos: Partial<DatosPresentacion>) => void
}

export default function ModalPresentar({ abierto, lic, onCerrar, onConfirmar }: Props) {
  const [oferta, setOferta] = useState('')
  const [manif, setManif] = useState('')
  const [ofertas, setOfertas] = useState('')

  useEffect(() => { if (abierto) { setOferta(''); setManif(''); setOfertas('') } }, [abierto])

  const datos: Partial<DatosPresentacion> = {
    oferta_neg: num(oferta),
    manifestaciones: num(manif),
    ofertas_recibidas: num(ofertas),
  }
  const completo = datosPresentacionCompletos(datos)

  // % EN VIVO contra el presupuesto oficial del propio proceso.
  const pct = datos.oferta_neg !== undefined
    ? pctNeg({ oferta_neg: datos.oferta_neg, presupuesto_oficial: lic.presupuesto_oficial })
    : null

  return (
    <Modal
      isOpen={abierto}
      title="Marcar presentada"
      onClose={onCerrar}
      size="md"
      actions={[
        { label: 'Cancelar', onClick: onCerrar, variant: 'secondary' },
        {
          label: 'Registrar presentación',
          onClick: () => onConfirmar(datos),
          variant: 'primary',
          disabled: !completo,
        },
      ]}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Estos tres datos solo se saben hoy. Después no hay de dónde sacarlos.
        </p>

        <div>
          <TextField
            label="Oferta de NEG" value={oferta} onChange={setOferta} required
            inputMode="decimal" placeholder="Ej.: 45.000.000"
          />
          <div className="mt-1 text-xs">
            {pct !== null ? (
              <span className={fueraDeBanda(pct) ? 'text-amber-700 font-medium' : 'text-gray-600'}>
                {fmtNum(pct)} % del presupuesto oficial ({fmtMoney(lic.presupuesto_oficial)})
                {fueraDeBanda(pct) ? ' — fuera de la banda histórica' : ''}
              </span>
            ) : (
              <span className="text-gray-400">El % aparece al escribir la oferta</span>
            )}
            <p className="text-gray-500 mt-0.5">{REFERENCIA_OFERTA}.</p>
          </div>
        </div>

        <TextField
          label="Manifestaciones de interés" value={manif} onChange={setManif} required
          inputMode="numeric" placeholder="Cuántos manifestaron"
          hint="Con esto se calcula la probabilidad de quedar en el sorteo."
        />
        <TextField
          label="Ofertas recibidas" value={ofertas} onChange={setOfertas} required
          inputMode="numeric" placeholder="Cuántos presentaron finalmente"
          hint="El nivel de competencia real: el dato que falta para medir una v1.1 del criterio."
        />

        {!completo && (
          <p className="text-xs text-gray-500">
            Faltan datos: el botón se habilita con los tres completos.
          </p>
        )}
      </div>
    </Modal>
  )
}
