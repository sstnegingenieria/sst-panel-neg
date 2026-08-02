// Módulo Compras (C1) — Proveedores.
//
// MODELO NEG: los materiales los compra NEG (no el contratista). Este
// registro es la base de datos de proveedores que alimentará las órdenes de
// compra (C2, futuro). Identidad + RUT visibles a todo el que tenga acceso
// SIGP (los necesitarán para elegir proveedor); lo BANCARIO vive en la
// subcolección privada `proveedores/{id}/privado/datos_bancarios`, solo
// legible/editable por gerencia_administrativa/admin — igual que la
// proyección `verificaciones_sst` del módulo administrativo (Bloque 3a).
//
// Roles: gerencia_administrativa OPERA (Marcela); admin respalda
// (infraestructura). Ningún otro rol ve ni esta página ni su ítem del
// sidebar (puedeGestionarComprasUI).
import { useState, useCallback, useEffect, useMemo } from 'react'
import type { ChangeEvent } from 'react'
import {
  runTransaction, doc, getDoc, getDocs, collection, updateDoc, Timestamp,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import { useAuth } from '../../contexts/AuthContext'
import { toast } from '../../components/shared/Toast'
import Modal from '../../components/shared/Modal'
import TextField from '../../components/shared/TextField'
import SelectField from '../../components/shared/SelectField'
import { puedeGestionarComprasUI } from '../../types/sigp/permisos'
import {
  TIPOS_IDENTIFICACION, TIPO_IDENTIFICACION_LABEL,
  TIPOS_PERSONA, TIPO_PERSONA_LABEL,
  TIPOS_CUENTA, TIPO_CUENTA_LABEL,
  ESTADO_PROVEEDOR_LABEL, ESTADO_PROVEEDOR_COLOR,
  normalizarIdentificacion, validarProveedorNuevo,
} from '../../types/sigp/proveedor'
import type {
  Proveedor, DatosBancariosProveedor, ContactoLookup,
  TipoIdentificacion, TipoPersona, TipoCuenta,
} from '../../types/sigp/proveedor'

const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024

/** Tipo/tamaño de archivo aceptado (PDF o imagen, <10MB) — rechazo con toast. */
function validarArchivo(file: File): boolean {
  const esPdfOImagen = file.type === 'application/pdf' || file.type.startsWith('image/')
  if (!esPdfOImagen) {
    toast('El archivo debe ser un PDF o una imagen', 'error')
    return false
  }
  if (file.size > MAX_ARCHIVO_BYTES) {
    toast('El archivo no puede superar 10MB', 'error')
    return false
  }
  return true
}

function extensionDe(file: File): string {
  const partes = file.name.split('.')
  return partes.length > 1 ? partes[partes.length - 1] : 'dat'
}

const fFecha = (t?: { toDate?: () => Date }) =>
  t?.toDate?.()?.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'

type FiltroEstado = 'activos' | 'inactivos' | 'todos'

export default function Proveedores() {
  const { user } = useAuth()
  const puedeGestionar = puedeGestionarComprasUI(user?.rol)

  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('activos')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'proveedores'))
      setProveedores(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Proveedor))
    } catch {
      toast('Error al cargar los proveedores', 'error')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return proveedores
      .filter(p => filtroEstado === 'todos' ? true : p.estado === (filtroEstado === 'activos' ? 'activo' : 'inactivo'))
      .filter(p => !q ||
        p.razon_social.toLowerCase().includes(q) ||
        p.identificacion.toLowerCase().includes(q) ||
        p.contacto.nombre.toLowerCase().includes(q) ||
        p.contacto.correo.toLowerCase().includes(q))
      .sort((a, b) => a.razon_social.localeCompare(b.razon_social, 'es', { sensitivity: 'base' }))
  }, [proveedores, busqueda, filtroEstado])

  // ── Toggle activo/inactivo (soft-delete) ──────────────────────────────
  const toggleEstado = async (p: Proveedor) => {
    const nuevoEstado = p.estado === 'activo' ? 'inactivo' : 'activo'
    const accion = nuevoEstado === 'inactivo' ? 'desactivar' : 'activar'
    if (!window.confirm(`¿Seguro que deseas ${accion} a "${p.razon_social}"?`)) return
    try {
      await updateDoc(doc(db, 'proveedores', p.id), {
        estado: nuevoEstado,
        fecha_actualizacion: Timestamp.now(),
      })
      toast(`Proveedor ${nuevoEstado === 'activo' ? 'activado' : 'desactivado'}`)
      await load()
    } catch {
      toast('Error al actualizar el estado', 'error')
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODAL — Nuevo proveedor
  // ═══════════════════════════════════════════════════════════════════════
  const [crearOpen, setCrearOpen] = useState(false)
  const [contactosLookup, setContactosLookup] = useState<ContactoLookup[]>([])
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false)

  const [tipoIdentificacion, setTipoIdentificacion] = useState<TipoIdentificacion>('nit')
  const [identificacion, setIdentificacion] = useState('')
  const [tipoPersona, setTipoPersona] = useState<TipoPersona>('juridica')
  const [razonSocial, setRazonSocial] = useState('')
  const [contactoNombre, setContactoNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [correo, setCorreo] = useState('')
  const [banco, setBanco] = useState('')
  const [tipoCuenta, setTipoCuenta] = useState<TipoCuenta>('ahorros')
  const [numeroCuenta, setNumeroCuenta] = useState('')
  const [rutFile, setRutFile] = useState<File | null>(null)
  const [certFile, setCertFile] = useState<File | null>(null)
  const [guardando, setGuardando] = useState(false)

  const resetCrear = () => {
    setTipoIdentificacion('nit'); setIdentificacion(''); setTipoPersona('juridica')
    setRazonSocial(''); setContactoNombre(''); setTelefono(''); setCorreo('')
    setBanco(''); setTipoCuenta('ahorros'); setNumeroCuenta('')
    setRutFile(null); setCertFile(null); setMostrarSugerencias(false)
  }

  const abrirCrear = async () => {
    resetCrear()
    setCrearOpen(true)
    // Autocompletado (degrada SILENCIOSAMENTE si falla o está vacío — cero
    // errores visibles, es solo una comodidad de captura).
    try {
      const snap = await getDocs(collection(db, 'contactos_lookup'))
      setContactosLookup(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ContactoLookup))
    } catch {
      setContactosLookup([])
    }
  }

  const idNormalizada = normalizarIdentificacion(identificacion)
  const duplicado = idNormalizada ? proveedores.find(p => p.id === idNormalizada) : undefined

  const sugerencias = useMemo(() => {
    const q = contactoNombre.trim().toLowerCase()
    if (!q || contactosLookup.length === 0) return []
    return contactosLookup.filter(c => c.nombre.toLowerCase().includes(q)).slice(0, 8)
  }, [contactoNombre, contactosLookup])

  const elegirSugerencia = (c: ContactoLookup) => {
    setContactoNombre(c.nombre)
    setCorreo(c.correo)
    setMostrarSugerencias(false)
  }

  const erroresCrear = useMemo(() => validarProveedorNuevo({
    identificacion, razon_social: razonSocial, contactoNombre, banco, tipoCuenta, numeroCuenta,
    rutFile: rutFile !== null, certFile: certFile !== null,
  }), [identificacion, razonSocial, contactoNombre, banco, tipoCuenta, numeroCuenta, rutFile, certFile])

  const puedeCrear = Object.keys(erroresCrear).length === 0 && !duplicado

  const onArchivo = (setter: (f: File | null) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (!f) { setter(null); return }
    if (validarArchivo(f)) setter(f)
    else { setter(null); e.target.value = '' }
  }

  const crear = async () => {
    if (!puedeCrear || !rutFile || !certFile) return
    setGuardando(true)
    try {
      const id = idNormalizada
      // (1) Subir ambos archivos ANTES de la transacción — huérfanos en
      // Storage si la transacción falla son inofensivos (criterio LPU).
      const rutRef = ref(storage, `proveedores/${id}/rut/${crypto.randomUUID()}.${extensionDe(rutFile)}`)
      await uploadBytes(rutRef, rutFile)
      const rutUrl = await getDownloadURL(rutRef)

      const certRef = ref(storage, `proveedores/${id}/certificacion_bancaria/${crypto.randomUUID()}.${extensionDe(certFile)}`)
      await uploadBytes(certRef, certFile)
      const certUrl = await getDownloadURL(certRef)

      // (2) Transacción — respaldo server-side contra carreras/pisado (un
      // set sobre un doc existente sería update y la regla lo permitiría).
      const ahora = Timestamp.now()
      await runTransaction(db, async tx => {
        const refProveedor = doc(db, 'proveedores', id)
        const snap = await tx.get(refProveedor)
        if (snap.exists()) {
          throw new Error('Ya existe un proveedor con esta identificación')
        }
        tx.set(refProveedor, {
          identificacion: id,
          tipo_identificacion: tipoIdentificacion,
          tipo_persona: tipoPersona,
          razon_social: razonSocial.trim(),
          rut_url: rutUrl,
          contacto: {
            nombre: contactoNombre.trim(),
            telefono: telefono.trim(),
            correo: correo.trim(),
          },
          estado: 'activo',
          creado_por: user?.uid ?? '',
          fecha_creacion: ahora,
        })
        tx.set(doc(db, 'proveedores', id, 'privado', 'datos_bancarios'), {
          banco: banco.trim(),
          tipo_cuenta: tipoCuenta,
          numero_cuenta: numeroCuenta.trim(),
          certificacion_bancaria_url: certUrl,
          actualizado_por: user?.uid ?? '',
          fecha_actualizacion: ahora,
        })
      })
      toast('Proveedor creado')
      setCrearOpen(false)
      await load()
    } catch (e) {
      toast(e instanceof Error && e.message.includes('Ya existe')
        ? e.message : 'Error al crear el proveedor', 'error')
    } finally { setGuardando(false) }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODAL — Editar identidad/contacto
  // ═══════════════════════════════════════════════════════════════════════
  const [editTarget, setEditTarget] = useState<Proveedor | null>(null)
  const [editTipoPersona, setEditTipoPersona] = useState<TipoPersona>('juridica')
  const [editRazonSocial, setEditRazonSocial] = useState('')
  const [editContactoNombre, setEditContactoNombre] = useState('')
  const [editTelefono, setEditTelefono] = useState('')
  const [editCorreo, setEditCorreo] = useState('')
  const [guardandoEdit, setGuardandoEdit] = useState(false)

  const abrirEditar = (p: Proveedor) => {
    setEditTarget(p)
    setEditTipoPersona(p.tipo_persona)
    setEditRazonSocial(p.razon_social)
    setEditContactoNombre(p.contacto.nombre)
    setEditTelefono(p.contacto.telefono)
    setEditCorreo(p.contacto.correo)
  }

  const guardarEdicion = async () => {
    if (!editTarget || !editRazonSocial.trim()) return
    setGuardandoEdit(true)
    try {
      await updateDoc(doc(db, 'proveedores', editTarget.id), {
        tipo_persona: editTipoPersona,
        razon_social: editRazonSocial.trim(),
        contacto: {
          nombre: editContactoNombre.trim(),
          telefono: editTelefono.trim(),
          correo: editCorreo.trim(),
        },
        fecha_actualizacion: Timestamp.now(),
      })
      toast('Proveedor actualizado')
      setEditTarget(null)
      await load()
    } catch {
      toast('Error al actualizar el proveedor', 'error')
    } finally { setGuardandoEdit(false) }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODAL — Datos bancarios
  // ═══════════════════════════════════════════════════════════════════════
  const [bancarioTarget, setBancarioTarget] = useState<Proveedor | null>(null)
  const [cargandoBancario, setCargandoBancario] = useState(false)
  const [bancoEd, setBancoEd] = useState('')
  const [tipoCuentaEd, setTipoCuentaEd] = useState<TipoCuenta>('ahorros')
  const [numeroCuentaEd, setNumeroCuentaEd] = useState('')
  const [certUrlActual, setCertUrlActual] = useState('')
  const [certNuevo, setCertNuevo] = useState<File | null>(null)
  const [guardandoBancario, setGuardandoBancario] = useState(false)
  const [bancarioFecha, setBancarioFecha] = useState<Timestamp | undefined>(undefined)

  const abrirBancario = async (p: Proveedor) => {
    setBancarioTarget(p)
    setCargandoBancario(true)
    setCertNuevo(null)
    try {
      const snap = await getDoc(doc(db, 'proveedores', p.id, 'privado', 'datos_bancarios'))
      const data = snap.data() as DatosBancariosProveedor | undefined
      setBancoEd(data?.banco ?? '')
      setTipoCuentaEd(data?.tipo_cuenta ?? 'ahorros')
      setNumeroCuentaEd(data?.numero_cuenta ?? '')
      setCertUrlActual(data?.certificacion_bancaria_url ?? '')
      setBancarioFecha(data?.fecha_actualizacion)
    } catch {
      toast('Error al cargar los datos bancarios', 'error')
      setBancarioTarget(null)
    } finally { setCargandoBancario(false) }
  }

  const onArchivoCert = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (!f) { setCertNuevo(null); return }
    if (validarArchivo(f)) setCertNuevo(f)
    else { setCertNuevo(null); e.target.value = '' }
  }

  const guardarBancario = async () => {
    if (!bancarioTarget || !bancoEd.trim() || !numeroCuentaEd.trim()) return
    setGuardandoBancario(true)
    try {
      let certUrl = certUrlActual
      if (certNuevo) {
        const certRef = ref(storage,
          `proveedores/${bancarioTarget.id}/certificacion_bancaria/${crypto.randomUUID()}.${extensionDe(certNuevo)}`)
        await uploadBytes(certRef, certNuevo)
        certUrl = await getDownloadURL(certRef)
      }
      await updateDoc(doc(db, 'proveedores', bancarioTarget.id, 'privado', 'datos_bancarios'), {
        banco: bancoEd.trim(),
        tipo_cuenta: tipoCuentaEd,
        numero_cuenta: numeroCuentaEd.trim(),
        certificacion_bancaria_url: certUrl,
        actualizado_por: user?.uid ?? '',
        fecha_actualizacion: Timestamp.now(),
      })
      toast('Datos bancarios actualizados')
      setBancarioTarget(null)
      await load()
    } catch {
      toast('Error al actualizar los datos bancarios', 'error')
    } finally { setGuardandoBancario(false) }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-600">
            Compras · C1
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Proveedores</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Registro de proveedores para las compras de NEG — identidad, RUT y datos bancarios.
          </p>
        </div>
        {puedeGestionar && (
          <button onClick={abrirCrear}
            className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo proveedor
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por razón social, identificación o contacto…"
          className="flex-1 min-w-[260px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
        <div className="flex items-center gap-1.5">
          {(['activos', 'inactivos', 'todos'] as FiltroEstado[]).map(f => (
            <button key={f} onClick={() => setFiltroEstado(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                filtroEstado === f ? 'bg-brand-700 border-brand-700 text-white' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {f === 'activos' ? 'Activos' : f === 'inactivos' ? 'Inactivos' : 'Todos'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-3 px-4 font-semibold">Razón social</th>
              <th className="py-3 px-4 font-semibold">Identificación</th>
              <th className="py-3 px-4 font-semibold">Contacto</th>
              <th className="py-3 px-4 font-semibold">Estado</th>
              <th className="py-3 px-4 font-semibold">RUT</th>
              {puedeGestionar && <th className="py-3 px-4 font-semibold text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="py-10 text-center text-gray-400">Cargando…</td></tr>
            )}
            {!loading && filtrados.length === 0 && (
              <tr><td colSpan={6} className="py-12 text-center text-gray-400">
                No hay proveedores{busqueda ? ' con esa búsqueda' : ''}.
              </td></tr>
            )}
            {!loading && filtrados.map(p => (
              <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4 font-medium text-gray-800">{p.razon_social}</td>
                <td className="py-3 px-4 text-gray-700">
                  <span className="text-[11px] uppercase text-gray-400">{TIPO_IDENTIFICACION_LABEL[p.tipo_identificacion]}</span>
                  <span className="block font-mono">{p.identificacion}</span>
                </td>
                <td className="py-3 px-4 text-gray-700">
                  <span>{p.contacto.nombre || '—'}</span>
                  {p.contacto.correo && <span className="block text-xs text-gray-400">{p.contacto.correo}</span>}
                </td>
                <td className="py-3 px-4">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${ESTADO_PROVEEDOR_COLOR[p.estado]}`}>
                    {ESTADO_PROVEEDOR_LABEL[p.estado]}
                  </span>
                </td>
                <td className="py-3 px-4">
                  {p.rut_url ? (
                    <a href={p.rut_url} target="_blank" rel="noreferrer"
                      className="text-brand-700 underline underline-offset-2 text-xs font-medium">RUT</a>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
                {puedeGestionar && (
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <button onClick={() => abrirEditar(p)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50">
                        Editar
                      </button>
                      <button onClick={() => abrirBancario(p)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium border border-brand-300 text-brand-700 hover:bg-brand-50">
                        🏦 Datos bancarios
                      </button>
                      <button onClick={() => toggleEstado(p)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium border ${
                          p.estado === 'activo'
                            ? 'border-red-300 text-red-700 hover:bg-red-50'
                            : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}>
                        {p.estado === 'activo' ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modal: Nuevo proveedor ────────────────────────────────────── */}
      <Modal
        isOpen={crearOpen}
        title="Nuevo proveedor"
        onClose={() => setCrearOpen(false)}
        size="lg"
        actions={[
          { label: 'Cancelar', onClick: () => setCrearOpen(false), variant: 'secondary' },
          { label: guardando ? 'Creando…' : 'Crear proveedor', onClick: crear, variant: 'primary', loading: guardando, disabled: !puedeCrear },
        ]}
      >
        <div className="space-y-5">
          {/* Identidad */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SelectField label="Tipo de identificación" value={tipoIdentificacion}
              onChange={v => setTipoIdentificacion(v as TipoIdentificacion)} required
              options={TIPOS_IDENTIFICACION.map(t => ({ value: t, label: TIPO_IDENTIFICACION_LABEL[t] }))} />
            <div>
              <TextField label="Identificación" value={identificacion} onChange={setIdentificacion}
                required error={duplicado ? `Ya existe: ${duplicado.razon_social}` : erroresCrear.identificacion}
                placeholder="Ej: 900.555.111-2" />
              {idNormalizada && !duplicado && (
                <p className="text-xs text-gray-400 mt-1">Normalizada: <span className="font-mono">{idNormalizada}</span></p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SelectField label="Tipo de persona" value={tipoPersona}
              onChange={v => setTipoPersona(v as TipoPersona)} required
              options={TIPOS_PERSONA.map(t => ({ value: t, label: TIPO_PERSONA_LABEL[t] }))} />
            <TextField label="Razón social" value={razonSocial} onChange={setRazonSocial}
              required error={erroresCrear.razon_social} placeholder="Nombre o razón social" />
          </div>

          {/* Contacto — con autocompletado desde contactos_lookup */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative">
            <div className="relative">
              <TextField label="Nombre de contacto" value={contactoNombre}
                onChange={v => { setContactoNombre(v); setMostrarSugerencias(true) }}
                onFocus={() => setMostrarSugerencias(true)}
                onBlur={() => setTimeout(() => setMostrarSugerencias(false), 150)}
                placeholder="Nombre del contacto" autoComplete="off" />
              {mostrarSugerencias && sugerencias.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {sugerencias.map(s => (
                    <button key={s.id} type="button"
                      onMouseDown={() => elegirSugerencia(s)}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-brand-50">
                      <span className="text-gray-800">{s.nombre}</span>
                      {s.correo && <span className="block text-xs text-gray-400">{s.correo}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <TextField label="Teléfono" value={telefono} onChange={setTelefono} placeholder="Teléfono de contacto" />
          </div>
          <TextField label="Correo" value={correo} onChange={setCorreo} placeholder="correo@proveedor.com" type="email" />

          {/* Bancario */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Datos bancarios</h3>
            <TextField label="Banco" value={banco} onChange={setBanco} required error={erroresCrear.banco} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SelectField label="Tipo de cuenta" value={tipoCuenta}
                onChange={v => setTipoCuenta(v as TipoCuenta)} required error={erroresCrear.tipoCuenta}
                options={TIPOS_CUENTA.map(t => ({ value: t, label: TIPO_CUENTA_LABEL[t] }))} />
              <TextField label="Número de cuenta" value={numeroCuenta} onChange={setNumeroCuenta}
                required error={erroresCrear.numeroCuenta} />
            </div>
          </div>

          {/* Archivos */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <label className="block text-sm">
              <span className="font-medium text-gray-700">RUT <span className="text-red-500">*</span></span>
              <input type="file" accept=".pdf,image/*" onChange={onArchivo(setRutFile)}
                className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
              {erroresCrear.rutFile && <p className="text-xs text-red-600 mt-1">{erroresCrear.rutFile}</p>}
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Certificación bancaria <span className="text-red-500">*</span></span>
              <input type="file" accept=".pdf,image/*" onChange={onArchivo(setCertFile)}
                className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
              {erroresCrear.certFile && <p className="text-xs text-red-600 mt-1">{erroresCrear.certFile}</p>}
            </label>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Editar identidad/contacto ──────────────────────────── */}
      <Modal
        isOpen={editTarget !== null}
        title={`Editar proveedor — ${editTarget?.razon_social ?? ''}`}
        onClose={() => setEditTarget(null)}
        actions={[
          { label: 'Cancelar', onClick: () => setEditTarget(null), variant: 'secondary' },
          { label: guardandoEdit ? 'Guardando…' : 'Guardar cambios', onClick: guardarEdicion, variant: 'primary', loading: guardandoEdit },
        ]}
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Identificación (no editable): <span className="font-mono">{editTarget?.identificacion}</span>
          </p>
          <SelectField label="Tipo de persona" value={editTipoPersona}
            onChange={v => setEditTipoPersona(v as TipoPersona)} required
            options={TIPOS_PERSONA.map(t => ({ value: t, label: TIPO_PERSONA_LABEL[t] }))} />
          <TextField label="Razón social" value={editRazonSocial} onChange={setEditRazonSocial} required />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField label="Nombre de contacto" value={editContactoNombre} onChange={setEditContactoNombre} />
            <TextField label="Teléfono" value={editTelefono} onChange={setEditTelefono} />
          </div>
          <TextField label="Correo" value={editCorreo} onChange={setEditCorreo} type="email" />
        </div>
      </Modal>

      {/* ── Modal: Datos bancarios ─────────────────────────────────────── */}
      <Modal
        isOpen={bancarioTarget !== null}
        title={`Datos bancarios — ${bancarioTarget?.razon_social ?? ''}`}
        onClose={() => setBancarioTarget(null)}
        actions={[
          { label: 'Cancelar', onClick: () => setBancarioTarget(null), variant: 'secondary' },
          {
            label: guardandoBancario ? 'Guardando…' : 'Guardar cambios',
            onClick: guardarBancario, variant: 'primary',
            loading: guardandoBancario,
            disabled: cargandoBancario || !bancoEd.trim() || !numeroCuentaEd.trim(),
          },
        ]}
      >
        {cargandoBancario ? (
          <p className="text-sm text-gray-400 text-center py-6">Cargando…</p>
        ) : (
          <div className="space-y-3">
            <TextField label="Banco" value={bancoEd} onChange={setBancoEd} required />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SelectField label="Tipo de cuenta" value={tipoCuentaEd}
                onChange={v => setTipoCuentaEd(v as TipoCuenta)} required
                options={TIPOS_CUENTA.map(t => ({ value: t, label: TIPO_CUENTA_LABEL[t] }))} />
              <TextField label="Número de cuenta" value={numeroCuentaEd} onChange={setNumeroCuentaEd} required />
            </div>
            {certUrlActual && (
              <p className="text-xs text-gray-500">
                Certificación actual:{' '}
                <a href={certUrlActual} target="_blank" rel="noreferrer"
                  className="text-brand-700 underline underline-offset-2">ver documento</a>
              </p>
            )}
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Reemplazar certificación (opcional)</span>
              <input type="file" accept=".pdf,image/*" onChange={onArchivoCert}
                className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100" />
            </label>
            {bancarioFecha && (
              <p className="text-[11px] text-gray-400">Última actualización: {fFecha(bancarioFecha)}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
