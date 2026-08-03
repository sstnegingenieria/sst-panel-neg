// Módulo Compras · C3 — Compras menores del proyecto (sin OC).
//
// Para gastos pequeños que no ameritan una orden de compra formal (C2): las
// registra gerencia_administrativa/admin directo en el proyecto —
// subcolección `proyectos/{id}/compras_menores` (reglas propias, sin delete;
// corrección por update — restricción 5.1). El agregado de la CF las suma
// junto con las OCs compradas para alimentar el indicador presupuestal (#3).
import { useState, useEffect, useCallback } from 'react'
import type { ChangeEvent } from 'react'
import {
  collection, addDoc, updateDoc, doc, getDocs, query, orderBy, Timestamp,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../../firebase/config'
import { useAuth } from '../../../contexts/AuthContext'
import { toast } from '../../shared/Toast'
import Modal from '../../shared/Modal'
import TextField from '../../shared/TextField'
import InputExpresion from '../cotizaciones/InputExpresion'
import { fmtMoney } from '../../../utils/sigp/formato'
import { veOcUI, puedeGestionarComprasUI } from '../../../types/sigp/permisos'
import type { CompraMenorProyecto } from '../../../types/sigp/ordenCompra'
import type { Proyecto } from '../../../types/sigp/proyecto'

const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024

/** PDF o imagen, <10MB — mismo criterio del resto de Compras. */
function archivoValido(file: File): boolean {
  const esPdfOImagen = file.type === 'application/pdf' || file.type.startsWith('image/')
  if (!esPdfOImagen) { toast('El archivo debe ser un PDF o una imagen', 'error'); return false }
  if (file.size > MAX_ARCHIVO_BYTES) { toast('El archivo no puede superar 10MB', 'error'); return false }
  return true
}

function extensionDe(file: File): string {
  const partes = file.name.split('.')
  return partes.length > 1 ? partes[partes.length - 1] : 'dat'
}

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

const hoyISO = () => new Date().toISOString().slice(0, 10)

interface Props {
  proyecto: Proyecto
}

export default function ComprasMenoresProyecto({ proyecto }: Props) {
  const { user } = useAuth()
  const puedeVer = veOcUI(user?.rol)
  const puedeGestionar = puedeGestionarComprasUI(user?.rol)

  const [compras, setCompras] = useState<CompraMenorProyecto[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(
        query(collection(db, 'proyectos', proyecto.id, 'compras_menores'), orderBy('fecha_creacion', 'desc')),
      )
      setCompras(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CompraMenorProyecto))
    } catch {
      toast('Error al cargar las compras menores', 'error')
    } finally { setLoading(false) }
  }, [proyecto.id])

  useEffect(() => { if (puedeVer) load() }, [load, puedeVer])

  // ═══════════════════════════════════════════════════════════════════════
  // MODAL — Nueva / Editar compra menor
  // ═══════════════════════════════════════════════════════════════════════
  const [formOpen, setFormOpen] = useState(false)
  const [formTarget, setFormTarget] = useState<CompraMenorProyecto | null>(null)   // null = creando
  const [descripcion, setDescripcion] = useState('')
  const [valor, setValor] = useState<number | undefined>(undefined)
  const [proveedorNombre, setProveedorNombre] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [soporte, setSoporte] = useState<File | null>(null)

  const abrirCrear = () => {
    setFormTarget(null)
    setDescripcion('')
    setValor(undefined)
    setProveedorNombre('')
    setFecha(hoyISO())
    setSoporte(null)
    setFormOpen(true)
  }

  const abrirEditar = (c: CompraMenorProyecto) => {
    setFormTarget(c)
    setDescripcion(c.descripcion)
    setValor(c.valor)
    setProveedorNombre(c.proveedor_nombre ?? '')
    setFecha(c.fecha_compra?.toDate?.().toISOString().slice(0, 10) ?? hoyISO())
    setSoporte(null)
    setFormOpen(true)
  }

  const onArchivoSoporte = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (!f) { setSoporte(null); return }
    if (archivoValido(f)) setSoporte(f)
    else { setSoporte(null); e.target.value = '' }
  }

  const puedeGuardar = descripcion.trim() !== '' && valor !== undefined && valor > 0 && fecha !== ''

  const guardar = async () => {
    if (!puedeGuardar || valor === undefined) return
    setGuardando(true)
    try {
      const ahora = Timestamp.now()
      const fechaCompra = Timestamp.fromDate(new Date(fecha + 'T12:00:00'))
      let soporteUrl: string | undefined
      if (soporte) {
        const path = `proyectos/${proyecto.id}/compras_menores/${crypto.randomUUID()}.${extensionDe(soporte)}`
        const snap = await uploadBytes(ref(storage, path), soporte)
        soporteUrl = await getDownloadURL(snap.ref)
      }
      if (formTarget) {
        await updateDoc(doc(db, 'proyectos', proyecto.id, 'compras_menores', formTarget.id), {
          descripcion: descripcion.trim(),
          valor,
          ...(proveedorNombre.trim() ? { proveedor_nombre: proveedorNombre.trim() } : {}),
          fecha_compra: fechaCompra,
          ...(soporteUrl ? { soporte_url: soporteUrl } : {}),
          fecha_actualizacion: ahora,
        })
        toast('Compra menor actualizada')
      } else {
        await addDoc(collection(db, 'proyectos', proyecto.id, 'compras_menores'), {
          descripcion: descripcion.trim(),
          valor,
          ...(proveedorNombre.trim() ? { proveedor_nombre: proveedorNombre.trim() } : {}),
          ...(soporteUrl ? { soporte_url: soporteUrl } : {}),
          fecha_compra: fechaCompra,
          registrada_por: user?.uid ?? '',
          fecha_creacion: ahora,
        })
        toast('Compra menor registrada')
      }
      setFormOpen(false)
      await load()
    } catch {
      toast('Error al guardar la compra menor (verifica tu rol)', 'error')
    } finally { setGuardando(false) }
  }

  if (!puedeVer) return null

  const total = compras.reduce((s, c) => s + (c.valor || 0), 0)

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-800">Compras menores</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Compras · C3 — gastos pequeños sin orden de compra formal, registrados directo en el
            proyecto. Se suman al indicador presupuestal junto con las OC compradas.
          </p>
        </div>
        {puedeGestionar && (
          <button onClick={abrirCrear}
            className="text-xs px-3 py-1.5 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50 flex-shrink-0">
            ＋ Compra menor
          </button>
        )}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-gray-400 text-center py-4">Cargando…</p>
      ) : compras.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400 text-center py-4">Aún no hay compras menores para este proyecto.</p>
      ) : (
        <div className="mt-4 divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {compras.map(c => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <span className="text-gray-800">{c.descripcion}</span>
                <span className="block text-[11px] text-gray-400">
                  {fFecha(c.fecha_compra)}
                  {c.proveedor_nombre && <> · {c.proveedor_nombre}</>}
                  {c.soporte_url && (
                    <> · <a href={c.soporte_url} target="_blank" rel="noreferrer" className="text-brand-700 underline underline-offset-2">📎 soporte</a></>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono font-semibold text-gray-800">{fmtMoney(c.valor)}</span>
                {puedeGestionar && (
                  <button onClick={() => abrirEditar(c)}
                    className="text-xs px-2 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50" title="Editar">
                    ✎
                  </button>
                )}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between px-3 py-2 text-sm bg-gray-50 rounded-b-lg">
            <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Total compras menores</span>
            <span className="font-mono font-bold text-gray-900">{fmtMoney(total)}</span>
          </div>
        </div>
      )}

      {/* ── Modal: Nueva / Editar compra menor ────────────────────────── */}
      <Modal
        isOpen={formOpen}
        title={formTarget ? 'Editar compra menor' : 'Nueva compra menor'}
        onClose={() => setFormOpen(false)}
        actions={[
          { label: 'Cancelar', onClick: () => setFormOpen(false), variant: 'secondary' },
          {
            label: guardando ? 'Guardando…' : formTarget ? 'Guardar cambios' : 'Registrar',
            onClick: guardar, variant: 'primary', loading: guardando, disabled: !puedeGuardar,
          },
        ]}
      >
        <div className="space-y-3">
          <TextField label="Descripción" value={descripcion} onChange={setDescripcion} required
            placeholder="Ej: tornillería para el andamio" />
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Valor <span className="text-red-500">*</span></span>
            <InputExpresion valor={valor} onValor={setValor}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
          <TextField label="Proveedor (opcional)" value={proveedorNombre} onChange={setProveedorNombre}
            placeholder="Texto libre" />
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Fecha <span className="text-red-500">*</span></span>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">
              {formTarget?.soporte_url ? 'Reemplazar soporte (opcional)' : 'Soporte (opcional)'}
            </span>
            <input type="file" accept=".pdf,image/*" onChange={onArchivoSoporte}
              className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
          </label>
        </div>
      </Modal>
    </div>
  )
}
