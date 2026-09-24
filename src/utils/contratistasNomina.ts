// Nómina precargada de contratistas (PR A del diseño aprobado 22-sep).
//
// Ingrid (GI) precarga la nómina autorizada que el contratista le entrega;
// la persona sigue registrándose sola en la app y una CF (PR B) la empareja
// por cédula NORMALIZADA y la vincula al contratista de la nómina — el
// empleador deja de ser una declaración libre y pasa a ser dato verificado.
//
// DÓNDE VIVE: contratistas/{id}/privado/nomina — nombres y cédulas de
// terceros que aún no han entrado al sistema JAMÁS van al doc padre (público
// pre-login, H-001). El match privado/{docId} ya da los permisos correctos
// (escriben gestores + gestion_integral; lee también gerencia) — cero reglas
// nuevas.
//
// Retirar a alguien marca `retirado: true` — cero borrado físico
// (restricción 5.1): deja de emparejar registros futuros, pero quién estuvo
// autorizado se conserva y las verificaciones ya congeladas en `users` no se
// tocan.

import { Timestamp, deleteField } from 'firebase/firestore'

export interface TrabajadorNomina {
  nombre: string
  /** Como vino en el archivo del contratista (fidelidad). */
  cedula_original: string
  cargado_por: string
  cargado_por_nombre: string
  fecha_carga: Timestamp
  /** Fuera de la nómina SIN borrado físico. */
  retirado?: true
}

export interface NominaContratista {
  /** Clave: cédula NORMALIZADA (solo dígitos). */
  trabajadores?: Record<string, TrabajadorNomina>
  fecha_actualizacion?: Timestamp
}

// ── Normalización de cédula ──────────────────────────────────────────────────
// Umbral 6–12 dígitos: SUPUESTO VIGENTE, no verdad permanente (confirmado
// por Giovanny 24-sep-2026: hoy no hay trabajadores extranjeros entre el
// personal de los contratistas). ⚠ Si algún día entra personal extranjero,
// el emparejamiento por cédula numérica FALLARÍA EN SILENCIO — un pasaporte
// normalizado podría coincidir con la cédula de otra persona — y este
// parser necesita revisión. Mientras tanto, un documento con letras
// (pasaporte "AB123456", PPT) NO se normaliza a los dígitos sueltos:
// devuelve null y la fila/registro queda "sin cédula legible" /
// "sin verificar". Este helper es el único punto que cambia. Fijado por test.
export const CEDULA_MIN_DIGITOS = 6
export const CEDULA_MAX_DIGITOS = 12

/** Solo dígitos si el documento es una cédula numérica plausible; null si
 *  contiene letras u otros caracteres no separadores, o si queda fuera del
 *  umbral. Separadores tolerados: puntos, espacios, guiones. */
export function normalizarCedula(valor: string | undefined | null): string | null {
  if (!valor) return null
  const sinSeparadores = valor.replace(/[.\s -]/g, '')
  if (!/^\d+$/.test(sinSeparadores)) return null
  if (sinSeparadores.length < CEDULA_MIN_DIGITOS || sinSeparadores.length > CEDULA_MAX_DIGITOS) return null
  return sinSeparadores
}

// ── Parser del pegado ────────────────────────────────────────────────────────
// La persona copia las columnas del archivo del contratista (Excel produce
// TSV al copiar) y pega. Por fila: la CÉDULA es el único token que normaliza
// a cédula válida; el NOMBRE es el resto. Columnas en cualquier orden;
// encabezados caen solos (sin cédula válida).

export type EstadoFila =
  | 'nueva'
  | 'ya_en_nomina'
  | 'reincorporar'        // estaba retirado — el pegado lo trae de vuelta
  | 'duplicada_pegado'
  | 'sin_cedula'          // sin token normalizable (incluye docs con letras)
  | 'sin_nombre'
  | 'en_otra_nomina'      // guard: ya está en la nómina VIVA de otro contratista

export interface FilaParseada {
  nombre: string
  cedula_original: string
  cedula_norm: string | null
  estado: EstadoFila
  /** Preselección de la vista previa (las advertidas van excluidas). */
  incluir: boolean
  linea: string
}

const DELIMITADORES = ['\t', ';', ','] as const

function tokensDe(linea: string): string[] {
  const delim = DELIMITADORES.find(d => linea.includes(d))
  const crudos = delim ? linea.split(delim) : linea.split(/\s+/)
  return crudos.map(t => t.trim()).filter(Boolean)
}

/** Parse puro del texto pegado (sin clasificar contra nóminas). */
export function parsearPegado(texto: string): FilaParseada[] {
  return texto
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(linea => {
      const tokens = tokensDe(linea)
      // El token-cédula debe ser ÚNICO: dos candidatos = fila ambigua
      // (mejor honesto que adivinar).
      const candidatos = tokens
        .map((t, i) => ({ i, norm: normalizarCedula(t) }))
        .filter(c => c.norm != null)
      if (candidatos.length !== 1) {
        return {
          nombre: tokens.join(' '), cedula_original: '', cedula_norm: null,
          estado: 'sin_cedula' as const, incluir: false, linea,
        }
      }
      const { i, norm } = candidatos[0]
      const nombre = tokens.filter((_, j) => j !== i).join(' ').replace(/\s+/g, ' ').trim()
      if (!nombre) {
        return {
          nombre: '', cedula_original: tokens[i], cedula_norm: norm,
          estado: 'sin_nombre' as const, incluir: false, linea,
        }
      }
      return {
        nombre, cedula_original: tokens[i], cedula_norm: norm!,
        estado: 'nueva' as const, incluir: true, linea,
      }
    })
}

/** Clasifica las filas parseadas contra la nómina del contratista y las de
 *  LOS DEMÁS (guard que evita fabricar conflictos: si la cédula ya vive en
 *  la nómina VIVA de otro contratista, la fila se advierte y queda excluida
 *  por defecto — incluible a conciencia si la persona cambió de empresa). */
export function clasificarFilas(
  filas: FilaParseada[],
  nominaActual: NominaContratista | null | undefined,
  nominasOtros: Record<string, Set<string>>,
): FilaParseada[] {
  const vistas = new Set<string>()
  return filas.map(f => {
    if (f.cedula_norm == null || f.estado === 'sin_nombre') return f
    if (vistas.has(f.cedula_norm)) {
      return { ...f, estado: 'duplicada_pegado', incluir: false }
    }
    vistas.add(f.cedula_norm)
    const otro = Object.keys(nominasOtros).find(id => nominasOtros[id].has(f.cedula_norm!))
    if (otro) return { ...f, estado: 'en_otra_nomina', incluir: false }
    const existente = nominaActual?.trabajadores?.[f.cedula_norm]
    if (existente?.retirado) return { ...f, estado: 'reincorporar', incluir: true }
    if (existente) return { ...f, estado: 'ya_en_nomina', incluir: false }
    return f
  })
}

export const ETIQUETA_FILA: Record<EstadoFila, string> = {
  nueva: 'Nueva',
  ya_en_nomina: 'Ya en la nómina',
  reincorporar: 'Reincorporar (estaba retirado)',
  duplicada_pegado: '⚠ Duplicada en el pegado',
  sin_cedula: '⚠ Sin cédula legible',
  sin_nombre: '⚠ Sin nombre',
  en_otra_nomina: '⚠ Ya en la nómina de OTRO contratista',
}

// ── Builders de writes (la UI no improvisa) ─────────────────────────────────

/** Patch por dot-paths para updateDoc: cada fila incluida escribe su nodo
 *  COMPLETO (reemplazo del nodo → un `retirado` previo desaparece solo, que
 *  es exactamente la reincorporación). Un pegado parcial JAMÁS toca a los
 *  demás trabajadores. */
export function patchCargarNomina(
  filas: FilaParseada[],
  usuario: { uid: string; nombre?: string },
  fecha: Timestamp,
): Record<string, unknown> | null {
  const incluidas = filas.filter(f =>
    f.incluir && f.cedula_norm != null
    && (f.estado === 'nueva' || f.estado === 'reincorporar'
        || f.estado === 'ya_en_nomina' || f.estado === 'en_otra_nomina'))
  if (incluidas.length === 0) return null
  const patch: Record<string, unknown> = { fecha_actualizacion: fecha }
  for (const f of incluidas) {
    patch[`trabajadores.${f.cedula_norm}`] = {
      nombre: f.nombre,
      cedula_original: f.cedula_original,
      cargado_por: usuario.uid,
      cargado_por_nombre: usuario.nombre ?? '',
      fecha_carga: fecha,
    } satisfies TrabajadorNomina
  }
  return patch
}

/** Retirar / reincorporar UNA cédula (acción por fila de la tabla). */
export function patchRetiro(cedulaNorm: string, retirar: boolean, fecha: Timestamp): Record<string, unknown> {
  return {
    [`trabajadores.${cedulaNorm}.retirado`]: retirar ? true : deleteField(),
    fecha_actualizacion: fecha,
  }
}
