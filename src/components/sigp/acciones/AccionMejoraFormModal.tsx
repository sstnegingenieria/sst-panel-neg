import { useEffect, useState } from 'react'
import Modal from '../../shared/Modal'
import SelectField from '../../shared/SelectField'
import TextField from '../../shared/TextField'
import {
  FORM_ACCION_VACIO, FUENTES_ACCION, FUENTE_ACCION_LABEL, MAX_DESCRIPCION, MAX_PORQUE,
  TIPOS_ACCION, TIPO_ACCION_LABEL, validarAccion, type AccionFormData,
} from '../../../types/sigp/accionMejora'

interface Props {
  isOpen: boolean
  titulo: string
  inicial?: AccionFormData
  guardando: boolean
  onClose: () => void
  onSubmit: (form: AccionFormData) => void
}

const AREA_CLASE = 'px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 w-full'

function Area({ label, value, onChange, rows, max, error, hint, required }: {
  label: string; value: string; onChange: (v: string) => void; rows: number
  max?: number; error?: string; hint?: string; required?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        maxLength={max}
        className={`${AREA_CLASE} ${error ? 'border-red-400' : ''}`}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

/** Formulario de la acción (F1): Sección 1 "Descripción general" + Sección 2 "Causa raíz — 5 por qués".
 *  Obligatorio para guardar un borrador: tipo, fecha, descripción de la NC y fuente. El resto es progresivo. */
export default function AccionMejoraFormModal({ isOpen, titulo, inicial, guardando, onClose, onSubmit }: Props) {
  const [f, setF] = useState<AccionFormData>(inicial ?? FORM_ACCION_VACIO)
  const [intento, setIntento] = useState(false)

  useEffect(() => {
    if (isOpen) { setF(inicial ?? FORM_ACCION_VACIO); setIntento(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const errores = intento ? validarAccion(f) : {}
  const set = <K extends keyof AccionFormData>(k: K, v: AccionFormData[K]) => setF(prev => ({ ...prev, [k]: v }))
  const setPorque = (i: number, v: string) =>
    setF(prev => {
      const p = [...prev.porques] as AccionFormData['porques']
      p[i] = v
      return { ...prev, porques: p }
    })

  const guardar = () => {
    setIntento(true)
    if (Object.keys(validarAccion(f)).length > 0) return
    onSubmit(f)
  }

  return (
    <Modal
      isOpen={isOpen}
      title={titulo}
      onClose={onClose}
      size="xl"
      actions={[
        { label: 'Volver', variant: 'secondary', onClick: onClose },
        { label: 'Guardar borrador', variant: 'primary', onClick: guardar, loading: guardando },
      ]}
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">1 · Descripción general</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SelectField
              label="Tipo de acción" required value={f.tipo} error={errores.tipo} placeholder="Selecciona…"
              options={TIPOS_ACCION.map(t => ({ value: t, label: TIPO_ACCION_LABEL[t] }))}
              onChange={v => set('tipo', v as AccionFormData['tipo'])}
            />
            <TextField
              label="Fecha de tratamiento" type="date" required value={f.fecha} error={errores.fecha}
              onChange={v => set('fecha', v)}
            />
            <TextField label="Cliente / proceso" value={f.cliente_proceso} onChange={v => set('cliente_proceso', v)} />
            <TextField label="Líder del proceso" value={f.lider_proceso} onChange={v => set('lider_proceso', v)} />
          </div>
          <TextField
            label="Numeral de la norma" value={f.numeral_texto} onChange={v => set('numeral_texto', v)}
            hint="Separa con comas las cláusulas: 9001:2015 10.2, 45001:2018 10.2"
          />
          <Area
            label="Descripción de la no conformidad" required rows={4} max={MAX_DESCRIPCION}
            value={f.descripcion_nc} onChange={v => set('descripcion_nc', v)} error={errores.descripcion_nc}
          />
          <SelectField
            label="Fuente" required value={f.fuente} error={errores.fuente} placeholder="Selecciona…"
            options={FUENTES_ACCION.map(x => ({ value: x, label: FUENTE_ACCION_LABEL[x] }))}
            onChange={v => set('fuente', v as AccionFormData['fuente'])}
          />
          <Area label="Observaciones" rows={2} value={f.observaciones} onChange={v => set('observaciones', v)} />
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">2 · Causa raíz — 5 por qués</h3>
          <p className="text-xs text-gray-500">
            Puedes completarla de a poco: se exigirá completa al emitir la acción (Fase 2).
          </p>
          {f.porques.map((p, i) => (
            <Area key={i} label={`¿Por qué? ${i + 1}`} rows={2} max={MAX_PORQUE} value={p} onChange={v => setPorque(i, v)} />
          ))}
          {errores.porques && <p className="text-xs text-red-600">{errores.porques}</p>}
        </section>
      </div>
    </Modal>
  )
}
