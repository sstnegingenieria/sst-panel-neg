// src/types/sigp/cliente.ts
//
// Tipos del dominio Cliente (Fase 1 — Comercial).
// Convención: campos Firestore en snake_case español; tipos TS en PascalCase.

import type { Timestamp } from 'firebase/firestore'
import type { MapeoImportacion } from './importacion'
// Normalizador de cédula REUTILIZADO del módulo de nómina de contratistas
// (26-nov: "ya hay un normalizador de cédula con sus reglas de longitud —
// no nazcan dos"). contratistasNomina solo importa firebase/firestore: sin
// ciclo de imports.
import { normalizarCedula, CEDULA_MIN_DIGITOS } from '../../utils/contratistasNomina'

/** Persona de contacto del cliente. Todos opcionales salvo el nombre. */
export interface Contacto {
  nombre: string
  cargo?: string
  email?: string
  telefono?: string
}

/**
 * Esquema tributario con el que se cotiza a este cliente.
 * - iva_pleno: subtotal + IVA sobre el total.
 * - aiu: Administración + Imprevistos + Utilidad (típico obra civil/servicios);
 *   el IVA aplica solo sobre la U (o sobre A+U según config), no sobre el costo directo.
 */
export interface CondicionesComerciales {
  esquema_impuestos: 'iva_pleno' | 'aiu'
  /** Porcentajes por defecto para AIU (enteros: admin = 10 significa 10%). Solo si esquema = 'aiu'. */
  aiu_defaults?: {
    admin: number
    imprevistos: number
    utilidad: number
  }
}

/** Documento de la colección `clientes`. */
export interface Cliente {
  id: string                 // id del doc Firestore (no se almacena dentro)
  nombre: string
  /** Identificación del cliente. Históricamente siempre NIT; desde el
   *  26-nov-2026 el campo guarda el número del tipo que diga
   *  `tipo_identificacion` (el nombre `nit` se conserva — renombrarlo
   *  tocaría snapshots congelados y la app). */
  nit: string
  /** Tipo de la identificación (26-nov-2026, caso clientes persona natural).
   *  MIGRACIÓN PEREZOSA: ausente = 'nit' (todos los clientes previos son
   *  personas jurídicas) — leer SIEMPRE vía `tipoIdentificacionDe()`.
   *  'ce' (cédula de extranjería) NO se incluyó: sin caso real a la fecha
   *  (proveedores sí la tiene); agregarla es extender el union + 1 opción. */
  tipo_identificacion?: 'nit' | 'cc'
  contactos: Contacto[]
  estado: 'activo' | 'inactivo'   // soft-delete, coherente con contratistas SST
  // `usa_tipo_inversion` (Bloque 2, PR #34) se RETIRÓ en la tanda 5 · #3:
  // nunca se activó en ningún cliente (censo de prod 24-sep) y Actividades
  // cubrió el caso Claro. La clasificación opex/capex vigente es la
  // `naturaleza` del alcance de LPU (C1.1).
  /** Ruta B (11-ago-2026, IHS→Vertis): el cliente opera PREVENTIVOS con
   *  precio de matriz (types/sigp/preventivos.ts). Reemplaza el viejo
   *  hardcode por nombre "ihs" del form de solicitudes. Ausente = false;
   *  la semántica es SINGULAR — un solo cliente flaggeado activo a la vez
   *  (la transición de metodología apaga el del antecesor). */
  usa_preventivos?: boolean
  /** Linaje informativo (p. ej. Vertis sucede a IHS tras la compra). Id del
   *  cliente antecesor. SIN UI de edición — se escribe por dato autorizado;
   *  el detalle del cliente lo muestra como chip de solo lectura. */
  sucede_a?: string
  /** C1.1 (14-ago): vocabulario controlado de CONTRATOS del cliente (texto
   *  libre, chips en el CRUD — nada hardcodeado). Vacío/ausente = el cliente
   *  no maneja la dimensión de contrato y ninguna UI cambia. Las LPUs y el
   *  cotizador lo usan como alcance (contrato + naturaleza OPEX/CAPEX). */
  contratos?: string[]
  /** F1 Actividades: el cliente opera bajo el módulo de ACTIVIDADES (dos
   *  hitos aprobación/ejecución + líneas de LPU por alcance). Con un solo
   *  cliente flaggeado, el registro lo preselecciona — pieza del <1 minuto.
   *  Ausente = false. */
  usa_actividades?: boolean
  /** F1 Actividades: SEDES del cliente con su CIUDAD y sus ZONAS (se cargan
   *  a mano en el detalle del cliente). La zona es la columna UBICACIÓN de
   *  la memoria de cantidades del acta (p. ej. "Búnker XI" en Triara) — no
   *  es decorativa. `id` local estable para denormalizar sin romper historia
   *  al renombrar.
   *
   *  ⚠ QUÉ ES UNA "SEDE" AQUÍ (decisión de Giovanny, 17-ago-2026): la unidad
   *  de este nivel NO es la geografía sino QUÉ GENERA ACTA PROPIA. Caso
   *  canónico: Oracle es físicamente un edificio DENTRO de Triara, pero se
   *  emite un acta para Triara y OTRA para Oracle → Oracle es una sede
   *  propia en esta lista, no una zona de Triara. No lo "corrijas" por
   *  criterio geográfico. */
  sedes?: { id: string; nombre: string; ciudad?: string; zonas?: string[] }[]
  /** F1 Actividades: contactos SOLICITANTES del cliente (quién pide el
   *  trabajo). Lista simple a mano — distinta de `contactos` (comercial). */
  contactos_solicitantes?: string[]
  condiciones_comerciales: CondicionesComerciales
  /** Mapeos de columnas guardados para reutilizar al importar futuras LPU de este cliente. */
  mapeos_lpu_guardados: MapeoImportacion[]
  fecha_creacion: Timestamp
  fecha_actualizacion?: Timestamp
}

/** Cliente que opera preventivos (Ruta B): el primero ACTIVO con el flag,
 *  en el orden del listado (alfabético). Null si ninguno — el form bloquea. */
export function clientePreventivosDe(clientes: Cliente[]): Cliente | null {
  return clientes.find(c => c.usa_preventivos === true && c.estado === 'activo') ?? null
}

export const CLIENTE_ESTADOS = ['activo', 'inactivo'] as const
export const ESQUEMAS_IMPUESTOS = ['iva_pleno', 'aiu'] as const

// ── NIT: dígito de verificación DIAN (04-nov) ───────────────────────────────
// El caso que lo motivó: IHS/Vertis vivieron meses con el placeholder
// 900.123.456-8 del alta. El DV no detecta rellenos (000.000.000-0 es
// DV-válido) pero sí typos — y desde hoy un NIT con DV errado no se guarda.
/** Pesos oficiales DIAN, del dígito MENOS significativo al más. */
const PESOS_DV = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]

/** DV de la base del NIT (solo dígitos, sin DV). null si no es numérica. */
export function dvNit(base: string): number | null {
  const d = base.replace(/\D/g, '')
  if (!d || d !== base.replace(/[.\s]/g, '')) return null
  let suma = 0
  for (let i = 0; i < d.length; i++) {
    const peso = PESOS_DV[d.length - 1 - i]
    if (peso === undefined) return null
    suma += Number(d[i]) * peso
  }
  const resto = suma % 11
  return resto <= 1 ? resto : 11 - resto
}

/** Valida el DV de un NIT con forma `NNN.NNN.NNN-D` (la que exige el form).
 *  ok=true si el DV cuadra; si no, `dv` trae el correcto para el mensaje. */
export function validarDvNit(nit: string): { ok: boolean; dv: number | null } {
  const m = nit.trim().match(/^([\d.]+)-(\d)$/)
  if (!m) return { ok: false, dv: null }
  const dv = dvNit(m[1])
  return { ok: dv !== null && dv === Number(m[2]), dv }
}

// ── NIT único (04-nov, caso Edificio Universal duplicado) ────────────────────
// El NIT identifica al cliente; el nombre NO bloquea (dos clientes pueden
// llamarse parecido legítimamente). La comparación es solo por dígitos, para
// que una variación de puntuación no esquive el chequeo.

/** Solo los dígitos del NIT (base + DV). '' si no hay ninguno. */
export const nitSoloDigitos = (nit: string) => (nit ?? '').replace(/\D/g, '')

/** Cliente ya registrado con ese NIT (comparación por dígitos), excluyendo
 *  al que se está editando. Null si el NIT aún no tiene base completa (<9
 *  dígitos + DV) o no hay coincidencia. Prefiere el ACTIVO si hubiera más de
 *  uno (duplicados históricos). */
export function clientePorNit(
  nit: string,
  clientes: Pick<Cliente, 'id' | 'nombre' | 'nit' | 'estado'>[],
  excluirId?: string,
): Pick<Cliente, 'id' | 'nombre' | 'nit' | 'estado'> | null {
  const d = nitSoloDigitos(nit)
  if (d.length < 10) return null
  const matches = clientes.filter(c => c.id !== excluirId && nitSoloDigitos(c.nit) === d)
  return matches.find(c => c.estado === 'activo') ?? matches[0] ?? null
}

// ── Tipo de identificación (26-nov-2026, clientes persona natural) ───────────
// El caso que lo motivó: el form exigía NIT con DV y una cédula no lo tiene —
// Giovanny no podía crear clientes persona natural. El DV solo aplica cuando
// el tipo es NIT; el control de duplicados compara SOLO dígitos sin importar
// el tipo (una cédula repetida es tan duplicado como un NIT repetido).

export const TIPOS_IDENTIFICACION_CLIENTE = ['nit', 'cc'] as const
export type TipoIdentificacionCliente = (typeof TIPOS_IDENTIFICACION_CLIENTE)[number]
export const TIPO_IDENTIFICACION_CLIENTE_LABEL: Record<TipoIdentificacionCliente, string> = {
  nit: 'NIT',
  cc: 'Cédula de ciudadanía',
}
/** Etiqueta corta para mostrar junto al número (tabla, detalle). */
export const TIPO_IDENTIFICACION_CLIENTE_CORTA: Record<TipoIdentificacionCliente, string> = {
  nit: 'NIT',
  cc: 'C.C.',
}

/** Fuente de verdad del tipo — AUSENTE = 'nit' (migración perezosa: los
 *  clientes previos al 26-nov son personas jurídicas; no se toca prod). */
export const tipoIdentificacionDe = (
  c: Pick<Cliente, 'tipo_identificacion'>,
): TipoIdentificacionCliente => c.tipo_identificacion ?? 'nit'

/** Formato que exige el form para NIT (base con puntos + guion + DV). */
export const NIT_FORMATO_RE = /^\d{3}\.\d{3}\.\d{3}-\d$/

/** Validación PURA de la identificación según su tipo.
 *  - nit: formato NNN.NNN.NNN-D + dígito de verificación DIAN.
 *  - cc: reglas del normalizador de NÓMINA (solo dígitos con separadores
 *    tolerados, 6–12 dígitos) — una sola implementación, no dos. */
export function validarIdentificacionCliente(
  tipo: TipoIdentificacionCliente,
  valor: string,
): { ok: true } | { ok: false; error: string } {
  const v = valor.trim()
  if (tipo === 'nit') {
    if (!v) return { ok: false, error: 'El NIT es requerido' }
    if (!NIT_FORMATO_RE.test(v)) return { ok: false, error: 'Formato: 123.456.789-6' }
    const dv = validarDvNit(v)
    if (!dv.ok) {
      return {
        ok: false,
        error: `El dígito de verificación no corresponde${dv.dv !== null ? ` — para esa base el DV es ${dv.dv}` : ''}`,
      }
    }
    return { ok: true }
  }
  if (!v) return { ok: false, error: 'La cédula es requerida' }
  if (normalizarCedula(v) === null) {
    return { ok: false, error: 'Cédula inválida: solo dígitos (6 a 12), puntos y espacios opcionales' }
  }
  return { ok: true }
}

/** Duplicado por dígitos SIN importar el tipo: una cédula repetida es tan
 *  duplicado como un NIT repetido, y un NIT guardado choca con una cédula de
 *  los mismos dígitos. Umbral por tipo para no avisar mientras se teclea:
 *  nit = 10 dígitos (base 9 + DV), cc = CEDULA_MIN_DIGITOS. */
export function clientePorIdentificacion(
  valor: string,
  tipo: TipoIdentificacionCliente,
  clientes: Pick<Cliente, 'id' | 'nombre' | 'nit' | 'estado'>[],
  excluirId?: string,
): Pick<Cliente, 'id' | 'nombre' | 'nit' | 'estado'> | null {
  const d = nitSoloDigitos(valor)
  const min = tipo === 'nit' ? 10 : CEDULA_MIN_DIGITOS
  if (d.length < min) return null
  const matches = clientes.filter(c => c.id !== excluirId && nitSoloDigitos(c.nit) === d)
  return matches.find(c => c.estado === 'activo') ?? matches[0] ?? null
}
