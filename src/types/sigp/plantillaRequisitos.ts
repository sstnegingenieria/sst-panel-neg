/**
 * PLANTILLA de requisitos — `configuracion/plantilla_requisitos` (A.2a).
 *
 * El punto de partida para no armar el checklist de cada pliego desde cero.
 * Lo que Karen reportó como los requisitos que aparecen en la mayoría de los
 * procesos que NEG atiende, versionado con el MISMO mecanismo que el criterio
 * del semáforo (`semaforoVersiones.ts`): documento único, un mapa de versiones
 * con su vigencia y su autor, y el TEXTO viviendo en
 * `functions/scripts/plantilla-requisitos-v1.0.json` como fuente única — la
 * semilla del servidor y esta constante lo consumen, y un test los compara
 * carácter por carácter.
 *
 * ── LA PLANTILLA ES UNA LISTA DE PREGUNTAS, NO DE RESPUESTAS ────────────────
 *
 * Todos los requisitos que salen de aquí nacen en `pendiente`. No hay un
 * camino para que la plantilla traiga un `cumple` preasignado, por la misma
 * razón que la invariante 1 impide heredar estado entre licitaciones: lo que
 * se hereda es la ESTRUCTURA de la exigencia, nunca el veredicto. Un pliego
 * nuevo son 22 preguntas por responder, no 22 respuestas por confirmar.
 *
 * ── SEGREGACIÓN DE FUNCIONES ────────────────────────────────────────────────
 *
 * LEE `accesoSIGP()` (la plantilla no tiene nada reservado: es la lista de lo
 * que un pliego suele pedir). ESCRIBE gerencia_general ·
 * gerencia_administrativa · admin — `operacion_comercial` y
 * `director_proyectos` trabajan CONTRA la plantilla y no la editan, el mismo
 * reparto que el criterio del semáforo: quien es medido por una lista no la
 * redefine.
 *
 * ⚠ MISMO GOTCHA DE FIRESTORE que el registro del criterio: las claves de
 * versión llevan punto ('v1.0'). Válidas como CLAVE de mapa, inválidas como
 * RUTA DE CAMPO — `updateDoc(ref, { 'versiones.v1.0.x': y })` se parsea como
 * `versiones > v1 > 0 > x` y escribe basura EN SILENCIO. Para tocar una
 * versión existente: `FieldPath('versiones', 'v1.0', …)` o reescribir el mapa
 * completo. No hay UI en este sub-bloque; queda anotado para quien la haga.
 */
import type { Timestamp } from 'firebase/firestore'
import type { CategoriaRequisito, TipoEvidencia } from './requisito'
import { CATEGORIAS_REQUISITO, TIPOS_EVIDENCIA } from './requisito'
import SEMILLA_JSON from '../../../functions/scripts/plantilla-requisitos-v1.0.json'

/**
 * En cuál de las tres listas del pliego venía el requisito.
 *
 * Es METADATO DE PROCEDENCIA de la plantilla, no un campo de `Requisito`: el
 * pliego agrupa por capítulos y el modelo tiene su propia taxonomía
 * (`categoria`), y las dos NO siempre coinciden — ver `CAPITULO_LABEL`.
 */
export const CAPITULOS_PLANTILLA = ['juridicos', 'tecnicos', 'financieros'] as const
export type CapituloPlantilla = typeof CAPITULOS_PLANTILLA[number]

export const CAPITULO_LABEL: Record<CapituloPlantilla, string> = {
  juridicos: 'Jurídicos',
  tecnicos: 'Técnicos',
  financieros: 'Financieros',
}

/** Un renglón de la plantilla: la pregunta y de qué tipo es su evidencia. */
export interface ItemPlantillaRequisito {
  capitulo: CapituloPlantilla
  categoria: CategoriaRequisito
  /** NOMBRE CANÓNICO del requisito — no el texto literal de un pliego. */
  descripcion: string
  tipo_evidencia: TipoEvidencia
}

/** Una versión de la plantilla, tal como queda registrada. */
export interface VersionPlantillaRequisitos {
  vigente_desde: Timestamp
  /** `null` = es la vigente. Se cierra al adoptar la siguiente. */
  vigente_hasta: Timestamp | null
  /** Cómo se llama esta versión, legible por un auditor. */
  nombre: string
  /** De dónde salió la lista. */
  origen: string
  autor_uid: string
  items: ItemPlantillaRequisito[]
}

/** Documento `configuracion/plantilla_requisitos`. */
export interface RegistroPlantillaRequisitos {
  /** Clave = la versión (p. ej. 'v1.0'). */
  versiones: Record<string, VersionPlantillaRequisitos>
  version_actual: string
}

// ── Semilla de v1.0 — el texto vive en el JSON ───────────────────────────────

export const VERSION_PLANTILLA_INICIAL = SEMILLA_JSON.version
export const NOMBRE_PLANTILLA_V1_0 = SEMILLA_JSON.nombre
export const ORIGEN_PLANTILLA_V1_0 = SEMILLA_JSON.origen

/**
 * Los 22 renglones de la plantilla v1.0.
 *
 * ⚠ `as` sobre el JSON importado: TypeScript tipa sus strings como `string`,
 * no como los literales de los vocabularios cerrados. El test
 * `plantillaRequisitos.test.ts` valida EN RUNTIME que cada `capitulo`,
 * `categoria` y `tipo_evidencia` pertenezca a su vocabulario — el cast no se
 * cree nada que no esté verificado.
 */
export const ITEMS_PLANTILLA_V1_0 = SEMILLA_JSON.items as ItemPlantillaRequisito[]

/**
 * Construye el documento a sembrar. PURA: sin Firestore, sin `process`, sin
 * reloj propio — igual que `construirDocSemilla` del criterio, para que un
 * test pueda compararla contra el JSON campo por campo.
 */
export function construirSemillaPlantillaRequisitos(
  autorUid: string,
  ahora: Timestamp,
): RegistroPlantillaRequisitos {
  return {
    versiones: {
      [VERSION_PLANTILLA_INICIAL]: {
        vigente_desde: ahora,
        vigente_hasta: null,
        nombre: NOMBRE_PLANTILLA_V1_0,
        origen: ORIGEN_PLANTILLA_V1_0,
        autor_uid: autorUid,
        items: ITEMS_PLANTILLA_V1_0,
      },
    },
    version_actual: VERSION_PLANTILLA_INICIAL,
  }
}

/** La versión vigente del registro, o `null`. Calco de `versionVigente`. */
export function plantillaVigente(
  r: RegistroPlantillaRequisitos | null | undefined,
): VersionPlantillaRequisitos | null {
  if (!r) return null
  // ⚠ Acceso POR ÍNDICE del objeto, jamás por ruta de campo (ver el gotcha).
  return r.versiones?.[r.version_actual] ?? null
}

/** Los ítems de la versión vigente, o lista vacía. */
export function itemsPlantillaVigente(
  r: RegistroPlantillaRequisitos | null | undefined,
): ItemPlantillaRequisito[] {
  return plantillaVigente(r)?.items ?? []
}

/** ¿Cada ítem declara vocabularios conocidos y una descripción no vacía? */
export function itemPlantillaValido(i: ItemPlantillaRequisito): boolean {
  return CAPITULOS_PLANTILLA.includes(i.capitulo)
    && CATEGORIAS_REQUISITO.includes(i.categoria)
    && TIPOS_EVIDENCIA.includes(i.tipo_evidencia)
    && i.descripcion.trim() !== ''
}

/** Coherencia del registro completo. Calco de `registroCoherente`. */
export function registroPlantillaCoherente(r: RegistroPlantillaRequisitos): boolean {
  const v = plantillaVigente(r)
  if (v === null) return false
  if (v.vigente_hasta !== null) return false        // la actual está vigente
  if (v.items.length === 0) return false            // una plantilla vacía no sirve
  return v.items.every(itemPlantillaValido)
}

/** Cuántos renglones trae cada capítulo — para la UI y para los tests. */
export function conteoPorCapitulo(
  items: readonly ItemPlantillaRequisito[],
): Record<CapituloPlantilla, number> {
  const base = { juridicos: 0, tecnicos: 0, financieros: 0 }
  for (const i of items) base[i.capitulo]++
  return base
}
