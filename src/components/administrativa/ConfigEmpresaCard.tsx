// OC1 — Datos de empresa para documentos (configuracion/empresa).
//
// Alimenta el bloque RADICACIÓN DE LA FACTURA y el pie institucional del PDF
// de orden de compra. Viven en Firestore (no en código) porque cambian por
// decisión administrativa sin deploy. Regla: match genérico
// configuracion/{docId} — read accesoSIGP, write gerencia_general + admin
// (sin cambio de reglas; espejo UI editaConfigEmpresaUI).
import { useState, useEffect, useCallback } from 'react'
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/AuthContext'
import { toast } from '../shared/Toast'
import TextField from '../shared/TextField'
import { CONFIG_EMPRESA_DOC, faltantesConfigEmpresa } from '../../types/sigp/configEmpresa'
import type { ConfigEmpresa } from '../../types/sigp/configEmpresa'
import { editaConfigEmpresaUI } from '../../types/sigp/permisos'

type FormEmpresa = Omit<ConfigEmpresa, 'actualizado_por' | 'fecha_actualizacion'>

const FORM_VACIO: FormEmpresa = {
  razon_social: '', nit: '', contacto_radicacion: '', movil_radicacion: '',
  direccion_factura: '', ciudad: '',
  pie_direccion: '', pie_correo: '', pie_web: '', pie_ciudad: '',
}

const CAMPOS: { clave: keyof FormEmpresa; label: string; placeholder: string; requerido?: boolean }[] = [
  { clave: 'razon_social', label: 'Facturar a nombre de', placeholder: 'NEG INGENIERÍA S.A.S., BIC', requerido: true },
  { clave: 'nit', label: 'NIT', placeholder: '900.975.870-1', requerido: true },
  { clave: 'contacto_radicacion', label: 'Contacto de radicación', placeholder: 'Quién recibe las facturas', requerido: true },
  { clave: 'movil_radicacion', label: 'Móvil de radicación', placeholder: 'Del contacto', requerido: true },
  { clave: 'direccion_factura', label: 'Entrega de la factura', placeholder: 'facturacion@negingenieria.com', requerido: true },
  { clave: 'ciudad', label: 'Ciudad', placeholder: 'Bogotá D.C.', requerido: true },
  { clave: 'pie_direccion', label: 'Pie — dirección', placeholder: 'Carrera 10 # 18-44 Edificio Universal piso 6' },
  { clave: 'pie_correo', label: 'Pie — correo', placeholder: 'facturacion@negingenieria.com' },
  { clave: 'pie_web', label: 'Pie — web', placeholder: 'www.negingenieria.com' },
  { clave: 'pie_ciudad', label: 'Pie — ciudad', placeholder: 'Bogotá D.C.' },
]

export default function ConfigEmpresaCard() {
  const { user } = useAuth()
  const puedeEditar = editaConfigEmpresaUI(user?.rol)
  const [form, setForm] = useState<FormEmpresa>(FORM_VACIO)
  const [existe, setExiste] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [cargado, setCargado] = useState(false)

  const load = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, 'configuracion', CONFIG_EMPRESA_DOC))
      if (snap.exists()) {
        const d = snap.data() as ConfigEmpresa
        setForm({ ...FORM_VACIO, ...Object.fromEntries(Object.entries(d).filter(([k]) => k in FORM_VACIO)) } as FormEmpresa)
        setExiste(true)
      }
    } catch { /* sin lectura: la tarjeta muestra el aviso de faltantes */ }
    finally { setCargado(true) }
  }, [])

  useEffect(() => { load() }, [load])

  const faltantes = faltantesConfigEmpresa(existe ? form : null)

  const guardar = async () => {
    setGuardando(true)
    try {
      const limpio = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, String(v).trim()])
      ) as unknown as FormEmpresa
      await setDoc(doc(db, 'configuracion', CONFIG_EMPRESA_DOC), {
        ...limpio,
        actualizado_por: user?.uid ?? '',
        fecha_actualizacion: Timestamp.now(),
      })
      setForm(limpio)
      setExiste(true)
      setEditando(false)
      toast('Datos de empresa guardados')
    } catch {
      toast('No se pudo guardar (verifica tu rol: solo gerencia general y admin)', 'error')
    } finally { setGuardando(false) }
  }

  if (!cargado) return null

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <button onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-left">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">🏢 Datos de empresa para documentos</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Radicación de facturas y pie institucional de las órdenes de compra.
            {faltantes.length > 0 && (
              <span className="ml-1 text-amber-700 font-medium">
                Faltan {faltantes.length} datos — las órdenes saldrán con el bloque de radicación incompleto.
              </span>
            )}
          </p>
        </div>
        <span className="text-gray-400 text-sm">{abierto ? '▴' : '▾'}</span>
      </button>

      {abierto && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4">
          {editando ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CAMPOS.map(c => (
                  <TextField key={c.clave} label={c.label} required={c.requerido}
                    value={form[c.clave] ?? ''} placeholder={c.placeholder}
                    onChange={v => setForm(f => ({ ...f, [c.clave]: v }))} />
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => { setEditando(false); load() }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium">
                  Cancelar
                </button>
                <button onClick={guardar} disabled={guardando}
                  className="text-xs px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-800 text-white font-medium disabled:opacity-50">
                  {guardando ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {CAMPOS.map(c => (
                  <div key={c.clave} className="flex flex-col">
                    <dt className="text-[11px] uppercase tracking-wide text-gray-400">{c.label}</dt>
                    <dd className={form[c.clave] ? 'text-gray-800' : 'text-gray-300'}>
                      {form[c.clave] || '—'}
                    </dd>
                  </div>
                ))}
              </dl>
              {puedeEditar ? (
                <div className="flex justify-end">
                  <button onClick={() => setEditando(true)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 font-medium">
                    ✎ Editar
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-gray-400 text-right">
                  Los edita gerencia general (o admin).
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
