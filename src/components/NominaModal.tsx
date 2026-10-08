// Nómina del contratista (PR A 22-sep + Paquete GI · C5a oct-2026).
//
// DOS CAMINOS de carga para dos situaciones distintas (ninguno reemplaza al
// otro): "＋ Agregar persona" de a una (llegaron dos nombres por WhatsApp —
// nombre y cédula, guardar, listo) y el PEGADO masivo para listas largas,
// ahora con VISTA PREVIA AUTOMÁTICA al pegar (el clic intermedio era donde
// se perdía la gente — lección: construir la capacidad no es crear el
// camino hacia ella).
//
// FICHA DOCUMENTAL por persona (C3a-mínimo adelantado): EPS/ARL/pensión/
// alturas con vencimiento (REUSO de utils/vencimiento.ts — un solo sistema
// de vencimientos) + exámenes médicos de ingreso/egreso como HECHO
// documental (fecha + archivo en ruta RESTRINGIDA de Storage: solo GI y
// admin). Sin texto libre clínico POR TIPO.
import { useState, useEffect, useCallback } from 'react'
import type { ChangeEvent } from 'react'
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../firebase/config'
import Modal from './shared/Modal'
import { toast } from './shared/Toast'
import { useAuth } from '../contexts/AuthContext'
import { getDocEstado, estadoLabel, estadoClasses, formatFechaVenc } from '../utils/vencimiento'
import {
  parsearPegado, clasificarFilas, patchCargarNomina, patchRetiro,
  patchAgregarPersona, patchDocumentoPersona, unirPersonasYCuentas,
  CAMPOS_DOC_PERSONA, ETIQUETA_DOC_PERSONA, ES_EXAMEN_MEDICO,
  ETIQUETA_FILA,
} from '../utils/contratistasNomina'
import type {
  FilaParseada, NominaContratista, TrabajadorNomina, CampoDocPersona,
} from '../utils/contratistasNomina'
import { ChipVerificacionNomina } from './UsuariosPendientes'
import type { Tecnico } from './UsuariosPendientes'

/** C5a-2 — acciones sobre la CUENTA de la app desde la ficha de la persona.
 *  Mismos writes que la pantalla de Usuarios (conviven hasta el C5b); si el
 *  objeto no llega, el bloque de cuenta es solo lectura. */
export interface AccionesCuenta {
  puedeGestionarTecnicos: boolean
  onAprobar: (t: Tecnico) => void
  onRechazar: (t: Tecnico) => void
  onRestaurar: (t: Tecnico) => void
  onDesactivar: (t: Tecnico) => void
  onActivar: (t: Tecnico) => void
  onAsignarObras: (t: Tecnico) => void
  onVerPerfil: (t: Tecnico) => void
}

interface NominaModalProps {
  isOpen: boolean
  onClose: () => void
  contratista: { id: string; nombre: string } | null
  /** Nóminas VIVAS de los demás contratistas (guard "en otra nómina"). */
  nominasOtros: Record<string, Set<string>>
  /** C5a-2: cuentas de la app (users rol tecnico) para el bloque "Cuenta en
   *  la app" de cada ficha. Ausente = el bloque no se pinta (p. ej. un rol
   *  que gestiona nómina pero no cuentas). */
  cuentas?: Tecnico[]
  acciones?: AccionesCuenta
}

const CHIP_FILA: Record<string, string> = {
  nueva: 'bg-emerald-50 text-emerald-700',
  reincorporar: 'bg-brand-50 text-brand-700',
  ya_en_nomina: 'bg-gray-100 text-gray-500',
  duplicada_pegado: 'bg-amber-50 text-amber-700',
  sin_cedula: 'bg-amber-50 text-amber-700',
  sin_nombre: 'bg-amber-50 text-amber-700',
  en_otra_nomina: 'bg-amber-50 text-amber-700',
}

const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024

function archivoValido(file: File): boolean {
  const esPdfOImagen = file.type === 'application/pdf' || file.type.startsWith('image/')
  if (!esPdfOImagen) { toast('El archivo debe ser un PDF o una imagen', 'error'); return false }
  if (file.size > MAX_ARCHIVO_BYTES) { toast('El archivo no puede superar 10MB', 'error'); return false }
  return true
}

const extensionDe = (file: File): string => {
  const partes = file.name.split('.')
  return partes.length > 1 ? partes[partes.length - 1] : 'dat'
}

export default function NominaModal({ isOpen, onClose, contratista, nominasOtros, cuentas, acciones }: NominaModalProps) {
  const { user } = useAuth()
  const [nomina, setNomina] = useState<NominaContratista | null>(null)
  const [texto, setTexto] = useState('')
  const [filas, setFilas] = useState<FilaParseada[] | null>(null)
  const [guardando, setGuardando] = useState(false)
  // C5a — agregar de a una
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevaCedula, setNuevaCedula] = useState('')
  // C5a — ficha documental expandida (cédula normalizada o null)
  const [fichaAbierta, setFichaAbierta] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState<string | null>(null)   // `${ced}.${campo}`

  const refNomina = useCallback(() =>
    doc(db, 'contratistas', contratista!.id, 'privado', 'nomina'), [contratista])

  const cargar = useCallback(async () => {
    if (!contratista) return
    try {
      const s = await getDoc(doc(db, 'contratistas', contratista.id, 'privado', 'nomina'))
      setNomina(s.exists() ? (s.data() as NominaContratista) : null)
    } catch {
      toast('No se pudo leer la nómina', 'error')
    }
  }, [contratista])

  useEffect(() => {
    if (isOpen) {
      setTexto(''); setFilas(null); setNuevoNombre(''); setNuevaCedula(''); setFichaAbierta(null)
      cargar()
    }
  }, [isOpen, cargar])

  // ── Vista previa AUTOMÁTICA (OK 08-oct): se interpreta al pegar/teclear,
  //    con un debounce corto — desapareció el clic intermedio. ──
  useEffect(() => {
    if (!texto.trim()) { setFilas(null); return }
    const t = setTimeout(() => {
      setFilas(clasificarFilas(parsearPegado(texto), nomina, nominasOtros))
    }, 250)
    return () => clearTimeout(t)
  }, [texto, nomina, nominasOtros])

  /** El doc puede no existir aún — nace con merge (updateDoc exige existente). */
  const escribir = async (patch: Record<string, unknown>) => {
    if (!nomina) await setDoc(refNomina(), { trabajadores: {} }, { merge: true })
    await updateDoc(refNomina(), patch)
  }

  const confirmar = async () => {
    if (!contratista || !filas) return
    const patch = patchCargarNomina(filas, { uid: user?.uid ?? '', nombre: user?.nombre }, Timestamp.now())
    if (!patch) { toast('No hay filas incluidas para cargar', 'error'); return }
    setGuardando(true)
    try {
      await escribir(patch)
      toast('Nómina actualizada')
      setTexto(''); setFilas(null)
      await cargar()
    } catch {
      toast('Error al guardar la nómina', 'error')
    } finally { setGuardando(false) }
  }

  const agregarUna = async () => {
    if (!contratista) return
    const r = patchAgregarPersona(nomina, nuevoNombre, nuevaCedula, nominasOtros,
      { uid: user?.uid ?? '', nombre: user?.nombre }, Timestamp.now())
    if (!r.ok) { toast(r.motivo, 'error'); return }
    setGuardando(true)
    try {
      await escribir(r.patch)
      toast(r.tipo === 'reincorporada' ? 'Persona reincorporada a la nómina' : 'Persona agregada a la nómina')
      setNuevoNombre(''); setNuevaCedula('')
      await cargar()
    } catch {
      toast('Error al agregar la persona', 'error')
    } finally { setGuardando(false) }
  }

  const retirar = async (cedulaNorm: string, retirarFlag: boolean) => {
    if (!contratista) return
    try {
      await updateDoc(refNomina(), patchRetiro(cedulaNorm, retirarFlag, Timestamp.now()))
      await cargar()
    } catch {
      toast('Error al actualizar el trabajador', 'error')
    }
  }

  // ── Ficha documental: guardar fecha y/o archivo de UN documento ──
  const guardarDoc = async (ced: string, campo: CampoDocPersona, fecha?: string, archivo?: File) => {
    if (!contratista) return
    const actual = (nomina?.trabajadores?.[ced]?.[campo] ?? {}) as { vencimiento?: string; fecha?: string; archivo_url?: string }
    setSubiendo(`${ced}.${campo}`)
    try {
      let archivo_url = actual.archivo_url
      if (archivo) {
        const carpeta = ES_EXAMEN_MEDICO(campo) ? 'examenes' : 'documentos'
        const path = `contratistas/${contratista.id}/nomina/${ced}/${carpeta}/${crypto.randomUUID()}.${extensionDe(archivo)}`
        const snap = await uploadBytes(ref(storage, path), archivo)
        archivo_url = await getDownloadURL(snap.ref)
      }
      const claveFecha = ES_EXAMEN_MEDICO(campo) ? 'fecha' : 'vencimiento'
      const valor = {
        ...(fecha ? { [claveFecha]: fecha } : (actual.vencimiento || actual.fecha) ? { [claveFecha]: actual.vencimiento ?? actual.fecha } : {}),
        ...(archivo_url ? { archivo_url } : {}),
      }
      await escribir(patchDocumentoPersona(ced, campo, valor, Timestamp.now()))
      toast(`${ETIQUETA_DOC_PERSONA[campo]} guardado`)
      await cargar()
    } catch {
      toast(`Error al guardar ${ETIQUETA_DOC_PERSONA[campo]} (verifica tu rol)`, 'error')
    } finally { setSubiendo(null) }
  }

  const trabajadores = Object.entries(nomina?.trabajadores ?? {})
    .sort(([, a], [, b]) => a.nombre.localeCompare(b.nombre, 'es')) as [string, TrabajadorNomina][]
  const vivos = trabajadores.filter(([, t]) => !t.retirado).length
  // C5a-2 — una persona, una ficha: la cuenta de la app emparejada por
  // cédula normalizada (criterio de la CF). Sin `cuentas` el vínculo es vacío.
  const vinculo = contratista
    ? unirPersonasYCuentas(nomina, cuentas ?? [], contratista.id)
    : { porCedula: {}, fueraDeNomina: [] }

  return (
    <Modal
      isOpen={isOpen}
      title={`Nómina autorizada — ${contratista?.nombre ?? ''}`}
      onClose={onClose}
      size="xl"
      actions={[{ label: 'Cerrar', onClick: onClose, variant: 'secondary' }]}
    >
      <div className="space-y-5">
        <p className="text-xs text-gray-500">
          El contratista entrega su gente; aquí se precarga la <b>nómina autorizada</b> y la carpeta
          documental de cada persona. Cuando un trabajador se registre en la app, el sistema lo
          empareja por cédula — el empleador pasa de declaración libre a dato verificado. Quien no
          esté acá <b>no se bloquea</b>: queda "sin verificar" para revisión.
        </p>

        {/* ── C5a: agregar DE A UNA (el camino del WhatsApp) ── */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
          <p className="text-sm font-semibold text-gray-700">＋ Agregar persona</p>
          <div className="flex gap-2 flex-wrap items-end">
            <label className="block text-xs text-gray-600 flex-1 min-w-[180px]">
              Nombre completo
              <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
            <label className="block text-xs text-gray-600 w-40">
              Cédula
              <input value={nuevaCedula} onChange={e => setNuevaCedula(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </label>
            <button onClick={agregarUna} disabled={guardando || !nuevoNombre.trim() || !nuevaCedula.trim()}
              className="text-sm px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-800 text-white font-medium disabled:opacity-50">
              Guardar
            </button>
          </div>
        </div>

        {/* ── Pegado masivo (para listas largas) — vista previa AUTOMÁTICA ── */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-gray-700">
            O pegar una lista desde el archivo del contratista
          </label>
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            rows={3}
            placeholder={'Copia las columnas (nombre y cédula, en cualquier orden) y pégalas aquí — la vista previa aparece sola.\nEj.:\nJuan Pérez Gómez\t1.020.345.678'}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {filas != null && (
            <div className="space-y-2">
              <table className="min-w-full text-xs border border-gray-200 rounded">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="py-1.5 px-2">Incluir</th>
                    <th className="py-1.5 px-2">Nombre</th>
                    <th className="py-1.5 px-2">Cédula</th>
                    <th className="py-1.5 px-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-1 px-2">
                        <input
                          type="checkbox"
                          checked={f.incluir}
                          disabled={f.cedula_norm == null || f.estado === 'sin_nombre' || f.estado === 'duplicada_pegado'}
                          onChange={e => setFilas(fs => fs!.map((x, j) => j === i ? { ...x, incluir: e.target.checked } : x))}
                        />
                      </td>
                      <td className="py-1 px-2 text-gray-800">{f.nombre || <span className="text-gray-400">—</span>}</td>
                      <td className="py-1 px-2 font-mono">{f.cedula_original || <span className="text-gray-400" title={f.linea}>{f.linea.slice(0, 30)}</span>}</td>
                      <td className="py-1 px-2">
                        <span className={`inline-flex px-1.5 py-px rounded font-medium ${CHIP_FILA[f.estado]}`}>
                          {ETIQUETA_FILA[f.estado]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-gray-400">
                Las filas advertidas van excluidas — márcalas solo a conciencia. Documentos con
                letras (pasaporte, PPT) no se interpretan como cédula: pendiente de definición.
              </p>
              <button
                onClick={confirmar}
                disabled={guardando || !filas.some(f => f.incluir)}
                className="text-sm px-4 py-2 rounded-lg bg-brand-700 hover:bg-brand-800 text-white font-medium disabled:opacity-50"
              >
                {guardando ? 'Guardando…' : `Confirmar carga (${filas.filter(f => f.incluir).length})`}
              </button>
            </div>
          )}
        </div>

        {/* ── Nómina vigente + ficha documental ── */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1.5">
            Nómina vigente <span className="font-normal text-gray-400">({vivos} activos{trabajadores.length > vivos ? ` · ${trabajadores.length - vivos} retirados` : ''})</span>
          </h3>
          {trabajadores.length === 0 ? (
            <p className="text-xs text-gray-400">Sin trabajadores precargados todavía.</p>
          ) : (
            <table className="min-w-full text-xs">
              <tbody>
                {trabajadores.map(([ced, t]) => (
                  <Fila key={ced} ced={ced} t={t}
                    abierta={fichaAbierta === ced}
                    onToggle={() => setFichaAbierta(fichaAbierta === ced ? null : ced)}
                    onRetirar={retirar}
                    onGuardarDoc={guardarDoc}
                    subiendo={subiendo}
                    cuenta={cuentas ? (vinculo.porCedula[ced] as Tecnico | undefined) ?? null : undefined}
                    acciones={acciones}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── C5a-2: cuentas que declaran ESTE contratista sin estar en la
            nómina — se dicen, no se esconden; la salida corta es precargar
            la persona con un clic (prellenando el form de arriba). ── */}
        {cuentas && vinculo.fueraDeNomina.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-800">
              📱 Con cuenta en la app, pero FUERA de esta nómina ({vinculo.fueraDeNomina.length})
            </p>
            <p className="text-[11px] text-amber-700">
              Estas cuentas declaran a {contratista?.nombre ?? 'este contratista'} como empleador y su cédula
              no está en la nómina precargada (o no es legible). Si la persona sí trabaja acá, precárgala;
              si no, revisa la cuenta.
            </p>
            {vinculo.fueraDeNomina.map(c => {
              const t = c as Tecnico
              return (
                <div key={c.id} className="flex items-center gap-2 flex-wrap bg-white rounded border border-amber-100 px-2.5 py-1.5">
                  <span className="text-xs font-medium text-gray-800">{c.nombre}</span>
                  <span className="text-[11px] font-mono text-gray-500">{c.cedula || 'sin cédula'}</span>
                  <EstadoCuentaChip estado={c.estado} />
                  <span className="flex-1" />
                  <button
                    onClick={() => { setNuevoNombre(c.nombre); setNuevaCedula(c.cedula ?? '') }}
                    className="text-[11px] px-2 py-0.5 rounded border border-brand-300 text-brand-700 hover:bg-brand-50"
                    title="Prellena el formulario de arriba — revisa y guarda"
                  >
                    ＋ Precargar a la nómina
                  </button>
                  {acciones && <BotonesCuenta t={t} acciones={acciones} />}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── C5a-2: la cuenta de la app como ESTADO dentro de la ficha ───────────────

function EstadoCuentaChip({ estado }: { estado: Tecnico['estado'] }) {
  const map: Record<string, { cls: string; label: string }> = {
    pendiente: { cls: 'bg-amber-50 text-amber-700', label: '⏳ cuenta pendiente de aprobación' },
    activo: { cls: 'bg-emerald-50 text-emerald-700', label: '✓ cuenta activa en la app' },
    inactivo: { cls: 'bg-gray-100 text-gray-500', label: 'cuenta desactivada' },
    rechazado: { cls: 'bg-red-50 text-red-700', label: '✗ registro rechazado' },
  }
  const m = map[estado] ?? map.inactivo
  return <span className={`inline-flex px-1.5 py-px rounded text-[10px] font-semibold ${m.cls}`}>{m.label}</span>
}

function BotonesCuenta({ t, acciones }: { t: Tecnico; acciones: AccionesCuenta }) {
  if (!acciones.puedeGestionarTecnicos) return null
  const btn = 'text-[11px] px-2 py-0.5 rounded border'
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <button onClick={() => acciones.onVerPerfil(t)} className={`${btn} border-gray-200 text-gray-600 hover:bg-gray-50`}>Ver perfil</button>
      {t.estado === 'pendiente' && (
        <>
          <button onClick={() => acciones.onAprobar(t)} className={`${btn} border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-semibold`}>Aprobar</button>
          <button onClick={() => acciones.onRechazar(t)} className={`${btn} border-red-200 text-red-600 hover:bg-red-50`}>Rechazar</button>
        </>
      )}
      {t.estado === 'activo' && (
        <>
          <button onClick={() => acciones.onAsignarObras(t)} className={`${btn} border-brand-300 text-brand-700 hover:bg-brand-50`}>Obras / empleador</button>
          <button onClick={() => acciones.onDesactivar(t)} className={`${btn} border-red-200 text-red-600 hover:bg-red-50`}>Desactivar</button>
        </>
      )}
      {t.estado === 'inactivo' && (
        <button onClick={() => acciones.onActivar(t)} className={`${btn} border-emerald-300 text-emerald-700 hover:bg-emerald-50`}>Activar</button>
      )}
      {t.estado === 'rechazado' && (
        <button onClick={() => acciones.onRestaurar(t)} className={`${btn} border-gray-300 text-gray-600 hover:bg-gray-50`}>Restaurar a pendiente</button>
      )}
    </span>
  )
}

/** El bloque "Cuenta en la app" de la ficha. `cuenta === undefined` = el
 *  caller no trajo cuentas (no se pinta nada); `null` = sin cuenta. */
function CuentaEnApp({ cuenta, acciones }: { cuenta: Tecnico | null; acciones?: AccionesCuenta }) {
  return (
    <div className="rounded border border-gray-200 bg-white px-2.5 py-2 space-y-1.5">
      <p className="text-[11px] font-semibold text-gray-700">📱 Cuenta en la app</p>
      {cuenta == null ? (
        <p className="text-[11px] text-gray-400">
          Sin cuenta — la persona se registra desde la app y el sistema la empareja por cédula.
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <EstadoCuentaChip estado={cuenta.estado} />
            <ChipVerificacionNomina t={cuenta} />
            {cuenta.estado === 'activo' && (
              <span className="text-[10px] text-gray-500">
                {(cuenta.obras_asignadas?.length ?? 0)} obra(s) asignada(s)
              </span>
            )}
          </div>
          {cuenta.estado === 'rechazado' && cuenta.rechazo && (
            <p className="text-[10px] text-red-600">
              Motivo: {cuenta.rechazo.motivo} · por {cuenta.rechazo.por_nombre}
            </p>
          )}
          <p className="text-[10px] text-gray-400">{cuenta.email}</p>
          {(cuenta.cedula_url || cuenta.seguridad_social_url || cuenta.curso_alturas_url) && (
            <p className="text-[10px] text-gray-500">
              Subidos desde la app:{' '}
              {cuenta.cedula_url && <a className="text-brand-700 underline underline-offset-2 mr-2" href={cuenta.cedula_url} target="_blank" rel="noreferrer">cédula</a>}
              {cuenta.seguridad_social_url && <a className="text-brand-700 underline underline-offset-2 mr-2" href={cuenta.seguridad_social_url} target="_blank" rel="noreferrer">seguridad social</a>}
              {cuenta.curso_alturas_url && <a className="text-brand-700 underline underline-offset-2" href={cuenta.curso_alturas_url} target="_blank" rel="noreferrer">curso de alturas</a>}
            </p>
          )}
          {acciones && <BotonesCuenta t={cuenta} acciones={acciones} />}
        </div>
      )}
    </div>
  )
}

// ── Fila de persona + su ficha documental expandible ────────────────────────

function Fila({ ced, t, abierta, onToggle, onRetirar, onGuardarDoc, subiendo, cuenta, acciones }: {
  ced: string
  t: TrabajadorNomina
  abierta: boolean
  onToggle: () => void
  onRetirar: (ced: string, retirar: boolean) => void
  onGuardarDoc: (ced: string, campo: CampoDocPersona, fecha?: string, archivo?: File) => Promise<void>
  subiendo: string | null
  /** undefined = sin datos de cuentas (no pintar) · null = sin cuenta. */
  cuenta?: Tecnico | null
  acciones?: AccionesCuenta
}) {
  // El peor estado de los 4 documentales con vencimiento (semáforo mínimo —
  // el semáforo completo y la completitud llegan con el resto del C3).
  const estados = (['eps', 'arl', 'pension', 'alturas'] as const).map(c => getDocEstado(t[c]?.vencimiento))
  const peor = estados.includes('vencido') ? 'vencido' : estados.includes('proximo') ? 'proximo'
    : estados.every(e => e === 'ok') ? 'ok' : 'sin_fecha'
  return (
    <>
      <tr className={`border-b border-gray-100 ${t.retirado ? 'opacity-50' : ''}`}>
        <td className="py-1.5 pr-2 text-gray-800 cursor-pointer" onClick={onToggle}>
          <span className={`mr-1 inline-block text-gray-300 transition-transform ${abierta ? 'rotate-90' : ''}`}>▸</span>
          {t.nombre}
        </td>
        <td className="py-1.5 pr-2 font-mono text-gray-500">{t.cedula_original}</td>
        <td className="py-1.5 pr-2">
          {/* C5a-2 — el estado de la cuenta se ve desde la LISTA, sin abrir */}
          {cuenta !== undefined && (cuenta == null
            ? <span className="text-[10px] text-gray-300">sin cuenta</span>
            : <EstadoCuentaChip estado={cuenta.estado} />)}
        </td>
        <td className="py-1.5 pr-2">
          <span className={`inline-flex px-1.5 py-px rounded text-[10px] font-medium ${estadoClasses[peor]}`}
            title="Documentos con vencimiento (EPS/ARL/pensión/alturas) — el peor estado gana">
            {peor === 'sin_fecha' ? 'Docs sin cargar' : estadoLabel(peor)}
          </span>
        </td>
        <td className="py-1.5 pr-2 text-gray-400" title={`Cargado por ${t.cargado_por_nombre}`}>
          {t.fecha_carga?.toDate?.().toLocaleDateString('es-CO') ?? ''}
        </td>
        <td className="py-1.5 text-right">
          {t.retirado ? (
            <button onClick={() => onRetirar(ced, false)}
              className="text-[11px] px-2 py-0.5 rounded border border-green-200 text-green-600 hover:bg-green-50">
              Reincorporar
            </button>
          ) : (
            <button onClick={() => onRetirar(ced, true)}
              className="text-[11px] px-2 py-0.5 rounded border border-red-200 text-red-600 hover:bg-red-50">
              Retirar
            </button>
          )}
        </td>
      </tr>
      {abierta && (
        <tr className="border-b border-gray-100 bg-gray-50/60">
          <td colSpan={6} className="px-6 py-3">
            {/* C5a-2 — la cuenta de la app es un ESTADO de la ficha */}
            {cuenta !== undefined && (
              <div className="mb-3">
                <CuentaEnApp cuenta={cuenta} acciones={acciones} />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CAMPOS_DOC_PERSONA.map(campo => (
                <DocCampo key={campo} ced={ced} campo={campo}
                  valor={t[campo]}
                  ocupado={subiendo === `${ced}.${campo}`}
                  onGuardar={onGuardarDoc} />
              ))}
            </div>
            <p className="mt-2 text-[10px] text-gray-400">
              Los exámenes médicos guardan SOLO el hecho (fecha y archivo) y su archivo queda en ruta
              restringida a Gestión Integral y admin — ningún contenido clínico entra al sistema.
            </p>
          </td>
        </tr>
      )}
    </>
  )
}

function DocCampo({ ced, campo, valor, ocupado, onGuardar }: {
  ced: string
  campo: CampoDocPersona
  valor?: { vencimiento?: string; fecha?: string; archivo_url?: string }
  ocupado: boolean
  onGuardar: (ced: string, campo: CampoDocPersona, fecha?: string, archivo?: File) => Promise<void>
}) {
  const esExamen = ES_EXAMEN_MEDICO(campo)
  const fechaActual = esExamen ? valor?.fecha : valor?.vencimiento
  const [fecha, setFecha] = useState(fechaActual ?? '')
  const estado = esExamen ? null : getDocEstado(valor?.vencimiento)
  const onArchivo = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!archivoValido(f)) { e.target.value = ''; return }
    void onGuardar(ced, campo, fecha || undefined, f)
    e.target.value = ''
  }
  return (
    <div className="rounded border border-gray-200 bg-white px-2.5 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-gray-700">
          {ETIQUETA_DOC_PERSONA[campo]}
          {esExamen && <span className="ml-1.5 text-[9px] font-medium text-rose-600" title="Archivo en ruta restringida — solo Gestión Integral y admin">🔒 restringido</span>}
        </span>
        {estado && fechaActual && (
          <span className={`inline-flex px-1.5 py-px rounded text-[10px] font-medium ${estadoClasses[estado]}`}>
            {estadoLabel(estado)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[10px] text-gray-500">
          {esExamen ? 'Fecha' : 'Vence'}
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            onBlur={() => { if (fecha && fecha !== fechaActual) void onGuardar(ced, campo, fecha) }}
            className="ml-1.5 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-brand-300" />
        </label>
        {fechaActual && !esExamen && <span className="text-[10px] text-gray-400">({formatFechaVenc(fechaActual)})</span>}
        <label className={`text-[10px] px-2 py-0.5 rounded border cursor-pointer ${ocupado ? 'opacity-50' : 'border-brand-300 text-brand-700 hover:bg-brand-50'}`}>
          {ocupado ? 'Subiendo…' : valor?.archivo_url ? 'Reemplazar archivo' : '📎 Adjuntar'}
          <input type="file" accept=".pdf,image/*" className="hidden" onChange={onArchivo} disabled={ocupado} />
        </label>
        {valor?.archivo_url && (
          <a href={valor.archivo_url} target="_blank" rel="noreferrer"
            className="text-[10px] text-brand-700 underline underline-offset-2 font-medium">ver</a>
        )}
      </div>
    </div>
  )
}
