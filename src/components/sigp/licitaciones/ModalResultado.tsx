// Cierre con resultado: adjudicada o perdida (1.4).
//
// Exige `oferta_ganador` y `ganador` incluso cuando ganamos nosotros: sin la
// oferta ganadora no hay `pctGanador`, y sin eso el histórico no sirve para
// calibrar nada. Los otros tres terminales (rechazada, revocada, desierta) no
// pasan por acá — en ellos no hubo ganador que registrar.
import { useEffect, useState } from 'react'
import Modal from '../../shared/Modal'
import TextField from '../../shared/TextField'
import { datosResultadoCompletos, pctGanador } from '../../../types/sigp/licitacion'
import type { DatosResultado, Licitacion } from '../../../types/sigp/licitacion'
import { fmtMoney, fmtNum } from '../../../utils/sigp/formato'

const num = (s: string): number | undefined => {
  const t = s.replace(/[.\s$]/g, '').replace(',', '.')
  if (t === '') return undefined
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

interface Props {
  abierto: boolean
  lic: Licitacion
  destino: 'adjudicada' | 'perdida'
  onCerrar: () => void
  onConfirmar: (datos: Partial<DatosResultado>) => void
}

export default function ModalResultado({ abierto, lic, destino, onCerrar, onConfirmar }: Props) {
  const [monto, setMonto] = useState('')
  const [nombre, setNombre] = useState('')
  const [nit, setNit] = useState('')

  useEffect(() => {
    if (!abierto) return
    // Si ganamos, el ganador somos nosotros y la oferta ya está registrada:
    // se prellena, pero sigue siendo editable (el valor adjudicado puede
    // diferir de la oferta si hubo ajuste).
    if (destino === 'adjudicada') {
      setNombre('NEG Ingeniería S.A.S. BIC')
      setNit('900.975.870-1')
      setMonto(lic.oferta_neg !== null ? String(lic.oferta_neg) : '')
    } else {
      setNombre(''); setNit(''); setMonto('')
    }
  }, [abierto, destino, lic.oferta_neg])

  const datos: Partial<DatosResultado> = {
    oferta_ganador: num(monto),
    ganador: { nombre, nit },
  }
  const completo = datosResultadoCompletos(datos)
  const pct = datos.oferta_ganador !== undefined
    ? pctGanador({ oferta_ganador: datos.oferta_ganador, presupuesto_oficial: lic.presupuesto_oficial })
    : null

  return (
    <Modal
      isOpen={abierto}
      title={destino === 'adjudicada' ? 'Cerrar como adjudicada' : 'Cerrar como perdida'}
      onClose={onCerrar}
      size="md"
      actions={[
        { label: 'Cancelar', onClick: onCerrar, variant: 'secondary' },
        {
          label: 'Cerrar proceso', onClick: () => onConfirmar(datos),
          variant: 'primary', disabled: !completo,
        },
      ]}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          {destino === 'adjudicada'
            ? 'Confirma con cuánto se adjudicó: el monto es lo que permite comparar contra el presupuesto oficial.'
            : 'Quién ganó y con cuánto. Es lo que convierte una derrota en información utilizable.'}
        </p>
        <div>
          <TextField
            label="Oferta ganadora" value={monto} onChange={setMonto} required
            inputMode="decimal" placeholder="Ej.: 38.500.000"
          />
          {pct !== null && (
            <p className="text-xs text-gray-600 mt-1">
              {fmtNum(pct)} % del presupuesto oficial ({fmtMoney(lic.presupuesto_oficial)})
            </p>
          )}
        </div>
        <TextField label="Ganador" value={nombre} onChange={setNombre} required
          placeholder="Razón social de quien ganó" />
        <TextField label="NIT del ganador" value={nit} onChange={setNit}
          placeholder="Opcional" hint="Si no aparece en SECOP, se puede dejar vacío." />
        <p className="text-xs text-gray-500">
          Es un estado TERMINAL: no se reabre. Una corrección se registra como proceso nuevo.
        </p>
      </div>
    </Modal>
  )
}
