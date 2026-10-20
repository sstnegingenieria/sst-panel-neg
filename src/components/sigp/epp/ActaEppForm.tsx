// Formulario del acta de EPP (crear / editar borrador): colaborador, elementos (desde el
// catálogo o a mano), fecha y firmantes de la empresa. NO firma: la firma se hace en el
// detalle, con las cláusulas a la vista.
import { useState } from 'react'
import {
  ITEM_ACTA_VACIO, itemDeCatalogo, validarActa, MAX_ITEMS_ACTA,
  type ActaFormData, type ItemActaEpp, type ItemCatalogoEppConId,
} from '../../../types/sigp/epp'
import type { OpcionColaboradorEpp } from '../../../hooks/useEpp'
import ColaboradorSelect from './ColaboradorSelect'

interface Props {
  inicial: ActaFormData
  catalogo: ItemCatalogoEppConId[]
  colaboradores: OpcionColaboradorEpp[]
  cargandoColaboradores?: boolean
  guardando?: boolean
  /** Referencia de la regla de la fecha de entrega: hoy al crear; la fecha de creación al editar. */
  referencia?: Date
  onGuardar: (f: ActaFormData, irAFirmar: boolean) => void
  onCancelar: () => void
}

const INPUT = 'px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 w-full'

export default function ActaEppForm({
  inicial, catalogo, colaboradores, cargandoColaboradores, guardando, referencia, onGuardar, onCancelar,
}: Props) {
  const [form, setForm] = useState<ActaFormData>(inicial)
  const [intento, setIntento] = useState(false)
  const errores = intento ? validarActa(form, referencia) : {}

  const setItem = (i: number, patch: Partial<ItemActaEpp>) =>
    setForm(f => ({ ...f, items: f.items.map((it, k) => k === i ? { ...it, ...patch } : it) }))
  const quitarItem = (i: number) => setForm(f => ({ ...f, items: f.items.filter((_, k) => k !== i) }))
  const agregarDeCatalogo = (id: string) => {
    const c = catalogo.find(x => x.id === id)
    if (c) setForm(f => ({ ...f, items: [...f.items, itemDeCatalogo(c)] }))
  }

  const enviar = (irAFirmar: boolean) => {
    setIntento(true)
    if (Object.keys(validarActa(form, referencia)).length > 0) return
    onGuardar(form, irAFirmar)
  }

  const activos = catalogo.filter(c => c.activo)

  return (
    <div className="flex flex-col gap-5">
      <section className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">1 · Colaborador</h2>
        <ColaboradorSelect
          opciones={colaboradores}
          value={form.colaborador}
          onChange={c => setForm(f => ({ ...f, colaborador: c }))}
          cargando={cargandoColaboradores}
          error={errores.colaborador}
        />
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700 max-w-xs">
          Fecha de entrega
          <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
            className={INPUT} />
          {errores.fecha && <span className="text-xs text-red-600 font-normal">{errores.fecha}</span>}
        </label>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">2 · Elementos de EPP entregados</h2>
          <div className="flex items-center gap-2">
            <select
              value="" onChange={e => { if (e.target.value) agregarDeCatalogo(e.target.value) }}
              disabled={form.items.length >= MAX_ITEMS_ACTA}
              aria-label="Agregar elemento del catálogo"
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="">＋ Agregar del catálogo…</option>
              {activos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <button type="button" onClick={() => setForm(f => ({ ...f, items: [...f.items, ITEM_ACTA_VACIO()] }))}
              disabled={form.items.length >= MAX_ITEMS_ACTA}
              className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium">
              ＋ Fila manual
            </button>
          </div>
        </div>
        {form.items.length === 0 ? (
          <p className="text-sm text-gray-400">Agrega los elementos entregados desde el catálogo o con una fila manual.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="py-1 pr-2 w-1/4">Elemento</th>
                  <th className="py-1 pr-2 w-20">Cantidad</th>
                  <th className="py-1 pr-2 w-24">Unidad</th>
                  <th className="py-1 pr-2">Especificación</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {form.items.map((it, i) => (
                  <tr key={i} className="align-top">
                    <td className="py-1 pr-2"><input value={it.nombre} onChange={e => setItem(i, { nombre: e.target.value })} className={INPUT} maxLength={120} aria-label={`Elemento ${i + 1}`} /></td>
                    <td className="py-1 pr-2"><input type="number" min={1} max={99} value={it.cantidad}
                      onChange={e => setItem(i, { cantidad: Number(e.target.value) })} className={INPUT} aria-label={`Cantidad ${i + 1}`} /></td>
                    <td className="py-1 pr-2"><input value={it.unidad} onChange={e => setItem(i, { unidad: e.target.value })} className={INPUT} maxLength={40} aria-label={`Unidad ${i + 1}`} /></td>
                    <td className="py-1 pr-2"><input value={it.especificacion} onChange={e => setItem(i, { especificacion: e.target.value })} className={INPUT} maxLength={500} aria-label={`Especificación ${i + 1}`} /></td>
                    <td className="py-1"><button type="button" onClick={() => quitarItem(i)} className="text-gray-400 hover:text-red-600" aria-label={`Quitar fila ${i + 1}`}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {errores.items && <p className="text-xs text-red-600">{errores.items}</p>}
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">3 · Firmantes por la empresa</h2>
        {form.firmantes_empresa.map((f, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input value={f.nombre} placeholder="Nombre" aria-label={`Firmante ${i + 1} nombre`}
              onChange={e => setForm(x => ({ ...x, firmantes_empresa: x.firmantes_empresa.map((y, k) => k === i ? { ...y, nombre: e.target.value } : y) }))}
              className={INPUT} maxLength={200} />
            <input value={f.cargo} placeholder="Cargo" aria-label={`Firmante ${i + 1} cargo`}
              onChange={e => setForm(x => ({ ...x, firmantes_empresa: x.firmantes_empresa.map((y, k) => k === i ? { ...y, cargo: e.target.value } : y) }))}
              className={INPUT} maxLength={200} />
          </div>
        ))}
        {errores.firmantes && <p className="text-xs text-red-600">{errores.firmantes}</p>}
        <p className="text-[11px] text-gray-400">Por defecto: Pedro Rodríguez y Ingrid Laverde. Editables en este acta mientras sea borrador.</p>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancelar} className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium">
          Volver
        </button>
        <button type="button" onClick={() => enviar(false)} disabled={guardando}
          className="px-4 py-2 rounded-lg border border-brand-300 text-brand-700 bg-white hover:bg-brand-50 text-sm font-medium disabled:opacity-50">
          Guardar borrador
        </button>
        <button type="button" onClick={() => enviar(true)} disabled={guardando}
          className="px-4 py-2 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium disabled:opacity-50">
          Guardar y pasar a la firma
        </button>
      </div>
    </div>
  )
}
