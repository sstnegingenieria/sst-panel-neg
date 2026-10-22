/**
 * Documentos de habilitación de la EMPRESA (sub-bloque A.1) — forma del
 * documento y nada más. CERO Firestore, CERO React, CERO UI.
 *
 * Son los papeles que NEG adjunta a cada propuesta: RUP, cámara de comercio,
 * RUT, estados financieros, pólizas, antecedentes, parafiscales,
 * certificaciones. Hoy viven en carpetas y cada licitación se arma buscando
 * cuál es la versión vigente; el módulo los vuelve un registro con fecha de
 * vigencia, para que el checklist pueda decir "este vence antes del cierre"
 * ANTES de presentar y no después.
 *
 * ── DOS DECISIONES DE FORMA ─────────────────────────────────────────────────
 *
 * 1. EL ESTADO DE VIGENCIA NO SE PERSISTE. No existe un campo `vencido`:
 *    sería un dato que envejece solo y que habría que recalcular con un cron
 *    para que no mienta. Se DERIVA con `estadoVigencia()` de
 *    `utils/sigp/vigencias.ts`, que lee `fecha_vigencia_hasta` y
 *    `dias_alerta`. Mismo criterio que `validez_dias` en `cotizacion.ts` y
 *    que `getDocEstado` del panel SST: lo guardado es la fecha, el juicio se
 *    calcula al mirar.
 *
 * 2. LOS INDICADORES DEL RUP NO SON DATO CONFIDENCIAL. El RUP lo expide la
 *    Cámara de Comercio y cualquiera lo compra: sus indicadores son públicos
 *    por construcción. Van EMBEBIDOS en el documento, no en una subcolección
 *    restringida como `proveedores/{id}/privado/datos_bancarios` o la cédula
 *    de `contratistas/{id}/privado/datos`. Tratarlos como secretos sería
 *    confundir "financiero" con "confidencial", y le costaría al checklist
 *    una lectura extra para un dato que está en la web de la Cámara.
 */
import type { Timestamp } from 'firebase/firestore'

export type { Timestamp }

// ── Vocabularios cerrados ────────────────────────────────────────────────────

export const TIPOS_DOCUMENTO_EMPRESA = [
  'rup', 'camara_comercio', 'rut', 'estados_financieros',
  'poliza', 'certificacion_bancaria', 'antecedentes', 'parafiscales',
  'certificacion_experiencia', 'certificacion_mipyme', 'otro',
] as const
export type TipoDocumentoEmpresa = typeof TIPOS_DOCUMENTO_EMPRESA[number]

export const TIPO_DOCUMENTO_EMPRESA_LABEL: Record<TipoDocumentoEmpresa, string> = {
  rup: 'RUP',
  camara_comercio: 'Certificado de Cámara de Comercio',
  rut: 'RUT',
  estados_financieros: 'Estados financieros',
  poliza: 'Póliza',
  certificacion_bancaria: 'Certificación bancaria',
  antecedentes: 'Antecedentes',
  parafiscales: 'Aportes parafiscales',
  certificacion_experiencia: 'Certificación de experiencia',
  certificacion_mipyme: 'Certificación MiPyme',
  otro: 'Otro',
}

export const CLASIFICACIONES_TAMANO = ['micro', 'pequena', 'mediana', 'grande'] as const
export type ClasificacionTamano = typeof CLASIFICACIONES_TAMANO[number]

/** Días de anticipación por defecto para la alerta de vencimiento.
 *  Mismo umbral que `getDocEstado` usa para los documentos de los técnicos
 *  en el panel SST — un mes de margen para renovar. Es por documento: una
 *  póliza puede querer 60 y un RUT no vence nunca. */
export const DIAS_ALERTA_DEFAULT = 30

// ── Indicadores del RUP ──────────────────────────────────────────────────────

/**
 * Indicadores financieros y de experiencia del RUP.
 *
 * TODOS los numéricos son `number | null` a propósito. Un RUP real puede no
 * reportar un indicador —la cobertura de intereses queda indeterminada cuando
 * no hubo gastos financieros— y esa AUSENCIA tiene que poder representarse:
 * el evaluador la convierte en `pendiente`, nunca en "cumple". Un `0` por
 * defecto diría que el indicador es cero, que es una afirmación distinta y
 * normalmente falsa.
 */
export interface IndicadoresRup {
  /** Fecha de corte de los estados financieros que respaldan el RUP. */
  fecha_corte: Timestamp
  liquidez: number | null
  endeudamiento: number | null
  cobertura_intereses: number | null
  rentabilidad_patrimonio: number | null
  rentabilidad_activo: number | null
  patrimonio: number | null
  activo_total: number | null
  /** Experiencia acreditada, en SMMLV (así la pide el pliego). */
  experiencia_total_smmlv: number | null
  numero_contratos_acreditados: number | null
  clasificacion_tamano: ClasificacionTamano | null
}

// ── El documento ─────────────────────────────────────────────────────────────

export interface DocumentoEmpresa {
  tipo: TipoDocumentoEmpresa
  /** Cómo lo llama el área: "RUP 2026", "Póliza de cumplimiento SURA". */
  nombre: string
  /** Número/radicado del documento. `null` cuando no lo tiene. */
  numero: string | null
  entidad_emisora: string | null

  fecha_expedicion: Timestamp
  /** `null` NO es dato faltante: significa QUE NO VENCE (un RUT, por
   *  ejemplo). `estadoVigencia` lo reporta como 'sin_vencimiento' y
   *  `venceAntesDe` devuelve `false` — no es un hueco que haya que llenar. */
  fecha_vigencia_hasta: Timestamp | null
  dias_alerta: number

  archivo_url: string
  /** SHA-256 del archivo — regla 8 de la casa: todo documento que se
   *  distribuye lleva su hash de integridad. */
  archivo_hash: string
  archivo_nombre: string

  /** `true` si el mismo archivo sirve para cualquier licitación (el RUP, la
   *  cámara). `false` para los que se expiden a nombre de un proceso
   *  concreto, que no se deben reciclar aunque estén vigentes. */
  reutilizable: boolean
  observaciones: string

  /** Soft-delete (restricción 5.1 de la casa): nada se borra físicamente. */
  activo: boolean

  /** Solo para `tipo === 'rup'`. Ver `indicadoresConsistentes`. */
  indicadores: IndicadoresRup | null

  creado_por: string
  creado_en: Timestamp
  actualizado_por: string
  actualizado_en: Timestamp
}

// ── Validadores de forma ─────────────────────────────────────────────────────

/**
 * Los indicadores solo pueden colgar de un RUP.
 *
 * IMPLICACIÓN EN UN SOLO SENTIDO, igual que la invariante 6 de
 * `licitacion.ts`: un RUP PUEDE traer `indicadores: null` —se sube el archivo
 * y alguien teclea las cifras después—, pero un documento que no es RUP los
 * tiene prohibidos. Si aparecieran en una póliza, el evaluador de indicadores
 * leería cifras de un papel que no las acredita.
 */
export function indicadoresConsistentes(
  d: Pick<DocumentoEmpresa, 'tipo' | 'indicadores'>,
): boolean {
  if (d.tipo === 'rup') return true
  return d.indicadores === null
}

/** `dias_alerta` tiene que ser un entero no negativo: con un negativo la
 *  alerta llegaría después del vencimiento. */
export function diasAlertaValido(dias: number): boolean {
  return Number.isInteger(dias) && dias >= 0
}

/** Un documento sin archivo no es evidencia de nada. */
export function tieneArchivo(
  d: Pick<DocumentoEmpresa, 'archivo_url' | 'archivo_nombre'>,
): boolean {
  return d.archivo_url.trim() !== '' && d.archivo_nombre.trim() !== ''
}

/** Las tres reglas de forma juntas — el equivalente de
 *  `licitacionConsistente` para este documento. */
export function documentoEmpresaConsistente(d: DocumentoEmpresa): boolean {
  return indicadoresConsistentes(d)
    && diasAlertaValido(d.dias_alerta)
    && tieneArchivo(d)
    && d.nombre.trim() !== ''
}
