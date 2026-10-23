/**
 * Motor de CUMPLIMIENTO del checklist de un pliego (sub-bloque A.1) —
 * función pura, sin Firestore, sin React.
 *
 * Decide si NEG está en condiciones de presentarse. No decide por nadie:
 * dice qué falta y deja el override en manos de quien firma.
 *
 * ── DOS PRINCIPIOS QUE ATRAVIESAN TODO EL ARCHIVO ───────────────────────────
 *
 * 1. LA AUSENCIA DE DATO NUNCA ES "CUMPLE". Si el RUP no reporta el
 *    indicador, el veredicto es `pendiente` — alguien tiene que ir a
 *    buscarlo. Dar por cumplido lo que no se pudo medir es exactamente el
 *    error que costó un proceso en 2026, y es la misma clase de error que el
 *    contrafactual del semáforo (medir la ausencia de dato no es medir el
 *    dato).
 *
 * 2. LOS CHEQUEOS AUTOMÁTICOS SOLO VETAN, NUNCA APRUEBAN. `evaluarVigencia`
 *    puede decir "este documento vence antes del cierre, esto no se puede dar
 *    por cumplido", pero jamás dice "cumple": que un papel esté vigente no
 *    significa que sea el papel correcto ni que su contenido alcance. El
 *    `cumple` lo pone una persona, con firma (invariante 2 de `requisito.ts`).
 *
 * ── LA VIGENCIA ENTRA POR CONTRATO, NO POR IMPORT ───────────────────────────
 *
 * Este motor NO importa `utils/sigp/vigencias.ts`. Depende del TIPO
 * `MotorVigencias` (`types/sigp/motorVigencias.ts`) y recibe la
 * implementación por parámetro, porque `vigencias.ts` es PROVISIONAL: el
 * frente SIGP va a consolidarlo con su `utils/vencimiento.ts` y quedará uno
 * solo. Con el motor inyectado, esa consolidación cuesta UN archivo — el que
 * decide qué se inyecta — y no treinta.
 */
import type { Timestamp } from 'firebase/firestore'
import type {
  Requisito, EstadoRequisito, IndicadorRup, OperadorRequisito,
} from '../../types/sigp/requisito'
import type { DocumentoEmpresa, IndicadoresRup } from '../../types/sigp/documentoEmpresa'
import type { MotorVigencias } from '../../types/sigp/motorVigencias'

// ── Traducción indicador exigido → campo del RUP ─────────────────────────────

/**
 * ⚠ MAPA EXPLÍCITO A PROPÓSITO. Cinco de los seis nombres coinciden con su
 * campo en `IndicadoresRup`, pero `experiencia_smmlv` vive como
 * `experiencia_total_smmlv` — y un acceso por nombre "obvio" devolvería
 * `undefined`, que este motor convierte en `pendiente`: el requisito más
 * importante de un pliego de obra quedaría colgado SIN que nada avise.
 *
 * Es la misma clase de fallo que el `col()` por substring del importador
 * (`PROCESO` casaba con `TIPO PROCESO`): el nombre parecido es el enemigo.
 * `Record` completo ⇒ agregar un `IndicadorRup` sin su traducción no compila.
 */
export const CAMPO_RUP_DE: Record<IndicadorRup, keyof IndicadoresRup> = {
  liquidez: 'liquidez',
  endeudamiento: 'endeudamiento',
  cobertura_intereses: 'cobertura_intereses',
  rentabilidad_patrimonio: 'rentabilidad_patrimonio',
  rentabilidad_activo: 'rentabilidad_activo',
  experiencia_smmlv: 'experiencia_total_smmlv',
}

/**
 * El valor que NEG tiene para ese indicador, leído del RUP.
 * `null` cuando no hay RUP, no hay indicador declarado, el RUP no lo reporta
 * o el valor no es un número usable.
 */
export function valorNegDesdeRup(
  r: Pick<Requisito, 'indicador'>,
  indicadores: IndicadoresRup | null | undefined,
): number | null {
  if (!r.indicador || !indicadores) return null
  const valor = indicadores[CAMPO_RUP_DE[r.indicador]]
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

/** Compara con el operador del pliego. */
function compara(operador: OperadorRequisito, tiene: number, exigido: number): boolean {
  return operador === 'gte' ? tiene >= exigido : tiene <= exigido
}

/**
 * Evalúa un requisito de indicador contra los indicadores del RUP.
 *
 * `pendiente` cuando falta cualquier pieza para comparar: el RUP no cargado,
 * el indicador no reportado, el pliego sin operador o sin valor exigido.
 * NUNCA `cumple` por ausencia — principio 1.
 */
export function evaluarIndicador(
  r: Pick<Requisito, 'tipo_evidencia' | 'indicador' | 'operador' | 'valor_exigido'>,
  indicadores: IndicadoresRup | null | undefined,
): Extract<EstadoRequisito, 'cumple' | 'no_cumple' | 'pendiente'> {
  if (r.tipo_evidencia !== 'indicador') return 'pendiente'
  if (!r.operador) return 'pendiente'
  if (typeof r.valor_exigido !== 'number' || !Number.isFinite(r.valor_exigido)) return 'pendiente'

  const tiene = valorNegDesdeRup(r, indicadores)
  if (tiene === null) return 'pendiente'

  return compara(r.operador, tiene, r.valor_exigido) ? 'cumple' : 'no_cumple'
}

/**
 * El write de una evaluación de indicador: COPIA el valor del RUP a
 * `valor_neg` y fija el estado, en el MISMO patch.
 *
 * Por qué viven juntos: la invariante 4 exige `valor_neg` para que exista un
 * `cumple`. Si el estado y el número se escribieran por separado habría un
 * instante con `cumple` sin número — un documento que viola su propia
 * invariante. El mismo razonamiento del consecutivo en
 * `patchAvanzarLicitacion`.
 *
 * `null` si el requisito no es de indicador (no hay nada que evaluar).
 */
export function patchEvaluarIndicador(
  r: Pick<Requisito, 'tipo_evidencia' | 'indicador' | 'operador' | 'valor_exigido'>,
  indicadores: IndicadoresRup | null | undefined,
  actor: { uid: string },
  ahora: Timestamp,
) {
  if (r.tipo_evidencia !== 'indicador') return null
  if (actor.uid.trim() === '') return null

  const estado = evaluarIndicador(r, indicadores)
  const valorNeg = valorNegDesdeRup(r, indicadores)

  return {
    valor_neg: valorNeg,
    estado,
    // Un `pendiente` no lleva firma (invariante 2): no hay veredicto todavía.
    verificado_por: estado === 'pendiente' ? null : actor.uid,
    verificado_en: estado === 'pendiente' ? null : ahora,
    actualizado_por: actor.uid,
    actualizado_en: ahora,
  }
}

// ── Vigencia contra la fecha de cierre ───────────────────────────────────────

export const MOTIVOS_VIGENCIA = [
  'VENCE_ANTES_DEL_CIERRE', 'DOCUMENTO_AUSENTE', 'DOCUMENTO_INACTIVO',
] as const
export type MotivoVigencia = typeof MOTIVOS_VIGENCIA[number]

export const MOTIVO_VIGENCIA_LABEL: Record<MotivoVigencia, string> = {
  VENCE_ANTES_DEL_CIERRE: 'Vence antes de la fecha de cierre',
  DOCUMENTO_AUSENTE: 'Falta adjuntar el documento',
  DOCUMENTO_INACTIVO: 'El documento está archivado',
}

/**
 * Veredicto de la comprobación de vigencia.
 *
 * `objeta: false` significa "esta comprobación NO tiene nada en contra" —
 * NO significa que el requisito cumpla. Principio 2: los automáticos vetan,
 * no aprueban. Si devolviera `cumple` estaría firmando por una persona.
 */
export interface VeredictoVigencia {
  objeta: boolean
  /** El estado que la comprobación IMPONE cuando objeta. `null` si no objeta. */
  estado: Extract<EstadoRequisito, 'no_cumple' | 'pendiente'> | null
  motivo: MotivoVigencia | null
}

const NO_OBJETA: VeredictoVigencia = { objeta: false, estado: null, motivo: null }

/**
 * ¿La vigencia del documento impide dar por cumplido este requisito?
 *
 *   no es de documento_empresa     no objeta (no es asunto de este chequeo)
 *   sin fecha de cierre            no objeta (no hay contra qué medir)
 *   documento ausente              `pendiente` — falta adjuntarlo
 *   documento archivado            `pendiente` — hay que apuntar al vigente
 *   vence antes del cierre         `no_cumple` + VENCE_ANTES_DEL_CIERRE
 *
 * La distinción entre `pendiente` y `no_cumple` no es cosmética: lo ausente
 * se consigue (alguien lo sube y el proceso sigue), lo que vence antes del
 * cierre es un hecho contra el que no se puede presentar sin renovarlo.
 *
 * El `motor` es OBLIGATORIO y entra por el contrato `MotorVigencias`, no por
 * un import de `vigencias.ts`. Obligatorio a propósito: un default que
 * apuntara a la implementación provisional reconstruiría en silencio
 * exactamente el acoplamiento que este parámetro existe para evitar, y nadie
 * lo notaría hasta el día de la consolidación con SIGP. Si falta, no compila.
 */
export function evaluarVigencia(
  r: Pick<Requisito, 'tipo_evidencia'>,
  doc: Pick<DocumentoEmpresa, 'fecha_vigencia_hasta' | 'activo'> | null | undefined,
  fechaCierre: Timestamp | null | undefined,
  motor: Pick<MotorVigencias, 'venceAntesDe'>,
): VeredictoVigencia {
  if (r.tipo_evidencia !== 'documento_empresa') return NO_OBJETA
  if (!doc) return { objeta: true, estado: 'pendiente', motivo: 'DOCUMENTO_AUSENTE' }
  if (doc.activo === false) {
    return { objeta: true, estado: 'pendiente', motivo: 'DOCUMENTO_INACTIVO' }
  }
  if (!fechaCierre) return NO_OBJETA
  if (motor.venceAntesDe(doc, fechaCierre)) {
    return { objeta: true, estado: 'no_cumple', motivo: 'VENCE_ANTES_DEL_CIERRE' }
  }
  return NO_OBJETA
}

// ── Override del gate ────────────────────────────────────────────────────────

/**
 * Presentarse a sabiendas de que algo no cumple. Calco de `OverrideSemaforo`
 * de `licitacion.ts`: el motivo ESCRITO es el punto — es lo único que permite
 * revisar en un año cuántos procesos se presentaron con requisitos abiertos
 * y cómo salieron.
 */
export interface OverrideCumplimiento {
  por: string
  en: Timestamp
  motivo: string
}

/** Un override sin autor o sin motivo no es un override. */
export function overrideCumplimientoValido(
  o: OverrideCumplimiento | null | undefined,
): boolean {
  if (!o) return false
  return o.por.trim() !== '' && o.motivo.trim() !== ''
}

// ── Resumen del checklist ────────────────────────────────────────────────────

export interface ResumenCumplimiento {
  total: number
  pendientes: number
  cumplen: number
  no_cumplen: number
  no_aplican: number
  /** `true` si no hay NINGÚN requisito capturado. Ver la nota de abajo. */
  sin_requisitos: boolean
  /** Sin override: exige AL MENOS UN requisito, cero pendientes y cero
   *  no_cumplen. Ver `MOTIVOS_BLOQUEO_PRESENTACION`. */
  listoParaPresentar: boolean
}

export const MOTIVOS_BLOQUEO_PRESENTACION = [
  'SIN_REQUISITOS', 'PENDIENTES', 'NO_CUMPLEN',
] as const
export type MotivoBloqueoPresentacion = typeof MOTIVOS_BLOQUEO_PRESENTACION[number]

/**
 * Cuáles de los tres motivos CEDEN ante un override con motivo escrito.
 *
 * Solo `NO_CUMPLEN`. Los otros dos son estados de IGNORANCIA, no de riesgo:
 *  · `PENDIENTES`      nadie puede justificar por escrito algo que no ha mirado.
 *  · `SIN_REQUISITOS`  no hay nada que autorizar — ni siquiera se sabe qué
 *                      pide el pliego. Un override aquí sería una firma en
 *                      blanco.
 * Lo que se autoriza con motivo es un riesgo CONOCIDO.
 */
export const BLOQUEOS_CON_OVERRIDE: readonly MotivoBloqueoPresentacion[] = ['NO_CUMPLEN']

/**
 * Cuenta el checklist.
 *
 * ⚠ EL CHECKLIST VACÍO BLOQUEA (decisión del cierre de A.1). "No anoté
 * ningún requisito" NO es lo mismo que "revisé todo y está en orden": con un
 * `true` ahí, el gate de la invariante 8 no frenaría nada cuando nadie
 * capturó requisitos — exactamente el estado de cosas previo al módulo, y
 * una garantía que se cita sin existir.
 *
 * Y NO cede ante override, igual que los pendientes: no hay nada que
 * autorizar cuando todavía no se sabe qué pide el pliego.
 */
export function resumenCumplimiento(
  requisitos: readonly Pick<Requisito, 'estado'>[],
): ResumenCumplimiento {
  const cuenta = (e: EstadoRequisito) => requisitos.filter(r => r.estado === e).length
  const pendientes = cuenta('pendiente')
  const no_cumplen = cuenta('no_cumple')

  return {
    total: requisitos.length,
    pendientes,
    cumplen: cuenta('cumple'),
    no_cumplen,
    no_aplican: cuenta('no_aplica'),
    sin_requisitos: requisitos.length === 0,
    listoParaPresentar: requisitos.length > 0 && pendientes === 0 && no_cumplen === 0,
  }
}

/**
 * POR QUÉ no se puede presentar — motivo TIPIFICADO, o `null` si sí se puede.
 *
 * Fuente única del gate: `puedePresentar` y el texto de la UI salen de aquí,
 * así que no pueden decir cosas distintas.
 *
 * Precedencia: SIN_REQUISITOS → PENDIENTES → NO_CUMPLEN. Se reporta el
 * primero que aplique, que es también el que hay que resolver primero.
 */
export function bloqueoPresentacion(
  requisitos: readonly Pick<Requisito, 'estado'>[],
  override?: OverrideCumplimiento | null,
): { codigo: MotivoBloqueoPresentacion; mensaje: string } | null {
  const r = resumenCumplimiento(requisitos)

  if (r.sin_requisitos) {
    return {
      codigo: 'SIN_REQUISITOS',
      mensaje: 'El checklist del pliego está vacío — no hay nada verificado',
    }
  }
  if (r.pendientes > 0) {
    return {
      codigo: 'PENDIENTES',
      mensaje: `${r.pendientes} requisito${r.pendientes === 1 ? '' : 's'} sin verificar`,
    }
  }
  if (r.no_cumplen > 0 && !overrideCumplimientoValido(override)) {
    return {
      codigo: 'NO_CUMPLEN',
      mensaje: `${r.no_cumplen} requisito${r.no_cumplen === 1 ? '' : 's'} que no cumple`
        + ' — se necesita un motivo escrito para presentarse de todos modos',
    }
  }
  return null
}

/**
 * EL GATE (invariante 8 de `licitacion.ts`). ¿Se puede presentar?
 *
 *   checklist vacío           NO, y el override NO lo salva.
 *   pendientes > 0            NO, y el override NO lo salva.
 *   no_cumplen > 0            solo con override con motivo escrito.
 *   todo cumple/no_aplica     sí.
 *
 * Mismo predicado para el botón de la UI y para el patch builder — hay test
 * de que no divergen, igual que `datosPresentacionCompletos` en el 1.4.
 */
export function puedePresentar(
  requisitos: readonly Pick<Requisito, 'estado'>[],
  override?: OverrideCumplimiento | null,
): boolean {
  return bloqueoPresentacion(requisitos, override) === null
}

/**
 * El motivo en una frase, para que el botón deshabilitado diga qué falta en
 * vez de solo estar gris. `null` si se puede presentar.
 */
export function motivoBloqueoPresentacion(
  requisitos: readonly Pick<Requisito, 'estado'>[],
  override?: OverrideCumplimiento | null,
): string | null {
  return bloqueoPresentacion(requisitos, override)?.mensaje ?? null
}
