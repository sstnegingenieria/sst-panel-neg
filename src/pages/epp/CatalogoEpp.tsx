// Catálogo de EPP (CRUD simple, GI/admin): los elementos de los que se arma cada acta.
// Baja SOFT (activo). "Cargar catálogo base" siembra la lista del formato SST-FT-AEP-18 sin
// duplicar ni pisar lo ya editado.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useCatalogoEpp } from '../../hooks/useEpp'
import { puedeGestionarEppUI } from '../../types/sigp/permisos'
import {
  FORM_CATALOGO_VACIO, validarItemCatalogo, type ItemCatalogoEppConId, type ItemCatalogoFormData,
} from '../../types/sigp/epp'
import Modal from '../../components/shared/Modal'
import TextField from '../../components/shared/TextField'
import { toast } from '../../components/shared/Toast'

export default function CatalogoEpp() {
  const { user } = useAuth()
  const puede = puedeGestionarEppUI(user?.rol)
  const { cargar, crear, editar, setActivo, cargarSemilla } = useCatalogoEpp()

  const [items, setItems] = useState<ItemCatalogoEppConId[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [verInactivos, setVerInactivos] = useState(false)

  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState<ItemCatalogoEppConId | null>(null)
  const [form, setForm] = useState<ItemCatalogoFormData>(FORM_CATALOGO_VACIO)
  const [intento, setIntento] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const errores = intento ? validarItemCatalogo(form) : {}

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await cargar()) } catch { toast('Error al cargar el catálogo', 'error') } finally { setLoading(false) }
  }, [cargar])
  useEffect(() => { load() }, [load])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return items.filter(i => (verInactivos || i.activo)
      && (!q || i.nombre.toLowerCase().includes(q) || i.especificacion.toLowerCase().includes(q)))
  }, [items, busqueda, verInactivos])

  const abrirNuevo = () => { setEditando(null); setForm(FORM_CATALOGO_VACIO); setIntento(false); setAbierto(true) }
  const abrirEditar = (i: ItemCatalogoEppConId) => {
    setEditando(i)
    setForm({ nombre: i.nombre, especificacion: i.especificacion, unidad: i.unidad, cantidad_default: String(i.cantidad_default) })
    setIntento(false); setAbierto(true)
  }

  const guardar = async () => {
    if (!user) return
    setIntento(true)
    if (Object.keys(validarItemCatalogo(form)).length > 0) return
    setGuardando(true)
    try {
      const ok = editando ? await editar(editando.id, form, user.uid) : await crear(form, user.uid)
      if (!ok) { toast('Revisa los datos', 'error'); return }
      toast(editando ? 'Elemento actualizado' : 'Elemento creado')
      setAbierto(false)
      await load()
    } catch { toast('No se pudo guardar (verifica tu rol)', 'error') } finally { setGuardando(false) }
  }

  const alternar = async (i: ItemCatalogoEppConId) => {
    if (!user) return
    try { await setActivo(i.id, !i.activo, user.uid); await load() } catch { toast('No se pudo cambiar el estado', 'error') }
  }

  const sembrar = async () => {
    if (!user) return
    try {
      const n = await cargarSemilla(user.uid)
      toast(n > 0 ? `${n} elemento${n === 1 ? '' : 's'} del formato agregado${n === 1 ? '' : 's'}` : 'El catálogo base ya estaba cargado')
      await load()
    } catch { toast('No se pudo cargar el catálogo base (verifica tu rol)', 'error') }
  }

  if (!puede) return <p className="text-sm text-gray-500">Sin acceso.</p>

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <Link to="/actas-epp" className="text-sm text-brand-700 hover:underline">← Actas de EPP</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Catálogo de EPP</h1>
          <p className="text-sm text-gray-500">Los elementos que se ofrecen al armar un acta. Cambiarlos no altera las actas ya firmadas.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={sembrar} className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium">
            Cargar catálogo base
          </button>
          <button type="button" onClick={abrirNuevo} className="px-4 py-2 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium">
            ＋ Nuevo elemento
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar elemento o especificación…"
          className="flex-1 min-w-[220px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} /> Ver inactivos
        </label>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
              <th className="py-2 px-3">Elemento</th><th className="py-2 px-3">Especificación</th>
              <th className="py-2 px-3">Unidad</th><th className="py-2 px-3">Cant.</th><th className="py-2 px-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="py-6 text-center text-gray-400">Cargando…</td></tr>}
            {!loading && visibles.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-gray-400">
                {items.length === 0 ? 'El catálogo está vacío. Usa “Cargar catálogo base” para traer los elementos del formato.' : 'Nada con ese filtro o búsqueda'}
              </td></tr>
            )}
            {visibles.map(i => (
              <tr key={i.id} className={`border-b border-gray-50 ${i.activo ? '' : 'opacity-50'}`}>
                <td className="py-2 px-3 font-medium text-gray-900">{i.nombre}{!i.activo && <span className="ml-2 text-[11px] text-gray-500">(inactivo)</span>}</td>
                <td className="py-2 px-3 text-gray-600">{i.especificacion || '—'}</td>
                <td className="py-2 px-3">{i.unidad}</td>
                <td className="py-2 px-3">{i.cantidad_default}</td>
                <td className="py-2 px-3 whitespace-nowrap text-right">
                  <button type="button" onClick={() => abrirEditar(i)} className="text-brand-700 hover:underline mr-3">Editar</button>
                  <button type="button" onClick={() => alternar(i)} className="text-gray-500 hover:underline">{i.activo ? 'Desactivar' : 'Reactivar'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={abierto}
        title={editando ? 'Editar elemento' : 'Nuevo elemento de EPP'}
        onClose={() => setAbierto(false)}
        actions={[
          { label: 'Volver', variant: 'secondary', onClick: () => setAbierto(false) },
          { label: 'Guardar', onClick: guardar, loading: guardando },
        ]}
      >
        <div className="flex flex-col gap-3">
          <TextField label="Nombre" required value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} error={errores.nombre} maxLength={120} />
          <TextField label="Especificación" value={form.especificacion} onChange={v => setForm(f => ({ ...f, especificacion: v }))} error={errores.especificacion} maxLength={500}
            hint="Marca, modelo o norma. Se copia a la fila del acta y se puede ajustar allí." />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Unidad" required value={form.unidad} onChange={v => setForm(f => ({ ...f, unidad: v }))} error={errores.unidad} maxLength={40} hint="Ej.: 1, 1 par" />
            <TextField label="Cantidad por defecto" required type="number" value={form.cantidad_default} onChange={v => setForm(f => ({ ...f, cantidad_default: v }))} error={errores.cantidad_default} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
