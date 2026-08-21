/**
 * Registro del CRITERIO del semáforo — `configuracion/semaforo_versiones`.
 *
 * Documento ÚNICO. Cada versión del criterio queda registrada con su vigencia,
 * su definición legible, por qué se adoptó, quién la adoptó y contra qué
 * medición se calibró. Es la contraparte auditable de `semaforo_version` en
 * cada `licitaciones/{id}`: el campo del documento dice CON QUÉ criterio se
 * clasificó; este registro dice QUÉ decía ese criterio y por qué.
 *
 * Cierra la invariante 5 de `licitacion.ts` por el otro extremo: allá el patch
 * builder impide que la versión cambie como efecto colateral; acá queda escrito
 * qué significa cada versión que llegó a existir.
 *
 * SEGREGACIÓN DE FUNCIONES (reglas): `operacion_comercial` LEE el criterio y no
 * lo ESCRIBE. Quien es medido por el criterio no lo redefine — no es
 * desconfianza, es que la calibración responde a la dirección.
 *
 * ⚠ GOTCHA DE FIRESTORE — las claves de versión llevan punto ('v1.0'). Como
 * CLAVE de mapa es perfectamente válida, pero como RUTA DE CAMPO no: un
 * `updateDoc(ref, { 'versiones.v1.0.vigente_hasta': x })` se parsea como
 * `versiones > v1 > 0 > vigente_hasta` y escribe basura en silencio. Para
 * tocar una versión existente hay que usar `updateDoc` con
 * `new FieldPath('versiones', 'v1.0', 'vigente_hasta')`, o reescribir el mapa
 * completo. No hay UI en este sub-bloque; queda anotado para quien la haga.
 */
import type { Timestamp } from 'firebase/firestore'

/** Una versión del criterio, tal como queda registrada. */
export interface VersionCriterioSemaforo {
  vigente_desde: Timestamp
  /** `null` = es la vigente. Se cierra al adoptar la siguiente. */
  vigente_hasta: Timestamp | null
  /** Qué dice la regla, en prosa legible por un auditor. */
  definicion: string
  /** Por qué se adoptó. */
  motivo: string
  autor_uid: string
  /** Referencia a la medición que la respalda. */
  calibracion: string
  /**
   * Qué NO cubre la medición: años sin registro, hipótesis abiertas y la
   * escotilla vigente mientras tanto. Va junto a la calibración a propósito —
   * un criterio sin sus límites escritos se lee como si fuera universal, y el
   * primero que lo aplique fuera de la ventana medida no tendrá cómo saberlo.
   */
  limitaciones: string
}

/** Documento `configuracion/semaforo_versiones`. */
export interface RegistroSemaforoVersiones {
  /** Clave = el string de `semaforo_version` (p. ej. 'v1.0'). */
  versiones: Record<string, VersionCriterioSemaforo>
  version_actual: string
}

// ── Semilla de v1.0 ──────────────────────────────────────────────────────────

export const DEFINICION_V1_0 =
  'ROJO si modalidad ≠ mínima cuantía. AMARILLO si hay sorteo, limitación '
  + 'MiPyme fuera de Bogotá/Cundinamarca, o requiere lectura. VERDE en el '
  + 'resto. Sin banda de presupuesto.'

export const MOTIVO_V1_0 =
  'Calibrado contra las 32 licitaciones presentadas en 2025: conserva 3 de 3 '
  + 'adjudicaciones y bloquea 12 propuestas sin retorno.'

/**
 * Referencia de la medición que respalda el criterio. Texto provisto por la
 * dirección (21-ago-2026); el registro en el Listado Maestro del SGI está
 * PENDIENTE — misma convención que los códigos ISO de `isoControl.ts`.
 *
 * Fuente única: `functions/scripts/semaforo-v1.0.json`. El test
 * `semaforoVersiones.test.ts` compara ambos carácter por carácter.
 */
export const CALIBRACION_V1_0 =
  'Calibrada el 21-ago-2026 contra el registro CM-FT-CPG-26 (archivo '
  + '«PROCESOS 2024 2026.xlsx», hoja 2025), deduplicado por número de proceso: '
  + '164 procesos seguidos, 32 presentados, 3 adjudicados (9,4%). Aplicando la '
  + 'regla de modalidad pasan 20 de 32, conservando 3 de 3 adjudicaciones y '
  + 'bloqueando 12 propuestas sin retorno; tasa resultante 15,0%. Se evaluaron '
  + 'y descartaron bandas de presupuesto oficial de $20–200M, $25–160M y '
  + '$30–160M: las tres eliminan la adjudicación de $6.011.508 y bajan la tasa '
  + 'a 11,1–13,3%. Contraste externo: datos abiertos SECOP II (datasets '
  + 'jbjy-vk9h y p6dx-8zbt), que confirman 3 contratos adjudicados a NEG con '
  + 'firma en 2025. PENDIENTE: registrar este análisis en el Listado Maestro '
  + 'del SGI.'

/**
 * Límites declarados de la medición de v1.0. Texto provisto por la dirección
 * (21-ago-2026). Fuente única: `functions/scripts/semaforo-v1.0.json`.
 *
 * Lo importante que dice, para quien lea solo el código: 2023 NO está medido,
 * y en SECOP II ese año 3 de 5 adjudicaciones fueron menor cuantía — que v1.0
 * pinta en rojo. Por eso el rojo NO es un bloqueo absoluto: se atiende por
 * `override_manual` con motivo escrito (invariante 3 de `licitacion.ts`).
 */
export const LIMITACIONES_V1_0 =
  'El criterio está validado sobre 2022, 2024, 2025 y 2026, donde existen '
  + 'numerador y denominador. NO está validado sobre 2023, año sin registro '
  + 'interno: según datos abiertos SECOP II, 3 de las 5 adjudicaciones de 2023 '
  + 'fueron Selección Abreviada de Menor Cuantía —DESAJ Cundinamarca-Amazonas '
  + '($315,3M), CNSC ($67,1M) e INM ($101,8M)— y v1.0 las habría marcado en '
  + 'rojo. Esas tres se adjudicaron en procesos con 2, 3 y 5 ofertas '
  + 'competidoras, frente a 4, 7 y 8 en las adjudicaciones de 2025. En la '
  + 'ventana medible, NEG presentó 16 o más menores cuantías con cero '
  + 'adjudicaciones. Hipótesis pendiente de medir para una v1.1: el '
  + 'discriminante puede ser el nivel de competencia y la presencia de sorteo, '
  + 'no la modalidad. Mientras tanto, la menor cuantía se atiende por '
  + 'override_manual con motivo escrito, no por bloqueo absoluto.'

/** Versión que la semilla deja vigente. */
export const VERSION_INICIAL = 'v1.0'

/**
 * Construye el documento de la semilla. PURO — el `Timestamp` y el uid los
 * pone el caller (mismo criterio que los patch builders de `licitacion.ts`).
 */
export function construirSemillaSemaforoVersiones(
  autorUid: string, ahora: Timestamp,
): RegistroSemaforoVersiones {
  return {
    versiones: {
      [VERSION_INICIAL]: {
        vigente_desde: ahora,
        vigente_hasta: null,
        definicion: DEFINICION_V1_0,
        motivo: MOTIVO_V1_0,
        autor_uid: autorUid,
        calibracion: CALIBRACION_V1_0,
        limitaciones: LIMITACIONES_V1_0,
      },
    },
    version_actual: VERSION_INICIAL,
  }
}

// ── Helpers de lectura (puros) ───────────────────────────────────────────────

/** La versión vigente declarada, o `null` si el registro no la tiene. */
export function versionVigente(
  r: RegistroSemaforoVersiones,
): VersionCriterioSemaforo | null {
  return r.versiones[r.version_actual] ?? null
}

/**
 * ¿El registro es coherente? `version_actual` debe existir en el mapa y ser la
 * única con `vigente_hasta === null` — dos vigentes es un registro que no
 * responde "con qué criterio clasificamos hoy".
 */
export function registroCoherente(r: RegistroSemaforoVersiones): boolean {
  const actual = r.versiones[r.version_actual]
  if (!actual) return false
  if (actual.vigente_hasta !== null) return false
  const abiertas = Object.values(r.versiones).filter(v => v.vigente_hasta === null)
  return abiertas.length === 1
}
