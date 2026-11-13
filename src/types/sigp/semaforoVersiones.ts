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
  /**
   * LA REGLA EN UNA FRASE, para quien decide — no para quien audita.
   *
   * `definicion` y `limitaciones` tenían UN SOLO TEXTO PARA DOS LECTORES:
   * Karen, que decide si trabaja un proceso, y quien revise la calibración
   * dentro de un año. Estaban escritos para el segundo. Estos dos campos son
   * para la primera; los otros no se tocan, porque siguen haciendo falta.
   *
   * Opcional: los registros anteriores a v1.1 no lo tienen, y el panel cae a
   * `definicion` cuando falta.
   */
  resumen?: string
  /**
   * Lo que conviene saber ANTES DE DESCARTAR — el momento en que sirve.
   *
   * No es «las limitaciones del criterio»: es lo que hay que leer con el dedo
   * sobre el botón de descartar. El nombre dice para qué es y cuándo.
   */
  antes_de_descartar?: string
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
// ── v1.1: la menor cuantía deja de cortar ────────────────────────────

export const DEFINICION_V1_1 =
  'ROJO si la modalidad no es mínima ni menor cuantía. AMARILLO en menor '
  + 'cuantía, y en mínima cuando hay sorteo, limitación MiPyme fuera de '
  + 'Bogotá/Cundinamarca, o requiere lectura. VERDE en el resto. Sin banda de '
  + 'presupuesto.'

export const RESUMEN_V1_1 =
  'NEG ha ganado casi siempre en mínima cuantía, así que esas salen en verde. '
  + 'La menor cuantía sale en amarillo: se puede trabajar, pero hay dos cosas '
  + 'que verificar antes — si tiene sorteo, y si la manifestación de interés '
  + 'sigue abierta. Las demás modalidades salen en rojo. También salen en '
  + 'amarillo las que están reservadas a MiPymes de otra región y las que no se '
  + 'pueden juzgar sin leer el pliego. El monto no se mira: no hay un tamaño de '
  + 'contrato que prediga si ganamos.'

export const ANTES_DE_DESCARTAR_V1_1 =
  'En 2023 NEG ganó tres menores cuantías, y fueron de las más grandes de su '
  + 'historia: DESAJ ($315 millones), CNSC ($67 millones) e INM ($102 '
  + 'millones). En esos tres procesos competían solo 2, 3 y 5 empresas.\n\n'
  + 'Desde 2024, en cambio, NEG se presentó a 16 menores cuantías y no ganó '
  + 'ninguna — pero ahí competían entre 4 y 8 empresas.\n\n'
  + 'Puede que lo que cambió no sea la modalidad, sino cuánta competencia hay. '
  + 'Todavía no lo sabemos con certeza, y por eso esto no bloquea: avisa.'

export const MOTIVO_V1_1 =
  'La menor cuantía pasa de roja a amarilla. Tres razones medidas sobre los 396 '
  + 'documentos reales: (1) el cupo semanal ya protege — con la regla vieja '
  + 'entran 5 al cupo y con esta también 5; lo que cambia es cuántas compiten, '
  + 'de 9 a 36; (2) la regla frenaba 30 de las 39 de la bandeja cuando el cupo '
  + 'ya limita lo que se puede trabajar, haciendo dos veces el mismo trabajo y '
  + 'la segunda a ciegas; (3) los tres contratos más grandes de la historia de '
  + 'NEG fueron menores cuantías. Y el criterio de cancelación —una regla no '
  + 'puede descartar adjudicaciones reales— que v1.0 reprobaba, v1.1 lo pasa.'

export const CALIBRACION_V1_1 =
  'Medida el 12-nov-2026 sobre los 396 documentos de `licitaciones` en '
  + 'producción y sobre datos abiertos SECOP II (dataset p6dx-8zbt). Reparto '
  + 'de la bandeja de trabajo con cupo 5: antes dentro 5 / fuera 4 / frenadas '
  + '30; con v1.1 dentro 5 / fuera 31 / frenadas 3. De los 396, 235 pasan de '
  + 'roja a amarilla, pero 181 ya estaban descartadas y 17 cerradas: a la '
  + 'bandeja viva solo la tocan 27. COSTO EXPLÍCITO: v1.0 bloqueaba 12 '
  + 'propuestas sin retorno de 2025; v1.1 no bloquea ninguna — lo que limita '
  + 'el esfuerzo pasa a ser el cupo semanal. PENDIENTE: registrar este análisis '
  + 'en el Listado Maestro del SGI.'

export const LIMITACIONES_V1_1 =
  'CORRECCIÓN DE UNA PREMISA FALSA QUE YA VIAJÓ A UNA DECISIÓN: se sostuvo que '
  + 'la menor cuantía tiene menos competencia que la mínima (1,73 contra 5,48). '
  + 'Ese cálculo mezclaba todos los procesos publicados, ceros incluidos, con un '
  + 'recorte de adjudicados. La competencia medida sobre ADJUDICADOS desde 2025 '
  + 'en Bogotá y Cundinamarca es 5,04 en mínima contra 5,68 en menor — '
  + 'prácticamente igual, y en el orden contrario al que se suponía. La idea de '
  + 'que la menor cuantía tiene menos competencia NO SE SOSTIENE, y el cambio a '
  + 'v1.1 no se apoya en ella.\n\n'
  + 'Lo que sigue sin medirse: la tasa de éxito de NEG por modalidad '
  + 'CONTROLANDO por competencia. El registro interno no tiene el número de '
  + 'competidores en ninguna de sus 349 filas, así que la pregunta no se puede '
  + 'responder hoy; `ofertas_recibidas` se captura a mano al presentar y es lo '
  + 'que la irá construyendo.\n\n'
  + 'Y lo que se descartó a propósito: la lista de verificación del amarillo '
  + 'tenía un tercer ítem, «cuántos manifestaron interés». Se midió y NO EXISTE '
  + 'antes de decidir — 0 de 349 en el registro, y `proveedores_que_manifestaron` '
  + 'está en cero en las 29.354 filas del filtro de ingesta. Una lista con un '
  + 'ítem que nunca se puede llenar enseña a ignorar la lista entera.'

export const VERSION_INICIAL = 'v1.0'
/** La vigente HOY. `VERSION_INICIAL` se conserva: la historia no se reescribe. */
export const VERSION_VIGENTE = 'v1.1'

/**
 * Construye el documento de la semilla. PURO — el `Timestamp` y el uid los
 * pone el caller (mismo criterio que los patch builders de `licitacion.ts`).
 */
export function construirSemillaSemaforoVersiones(
  autorUid: string, ahora: Timestamp,
): RegistroSemaforoVersiones {
  return {
    versiones: {
      // v1.0 se CONSERVA con su texto intacto y su vigencia cerrada. Los
      // documentos que la llevan sellada siguen pudiendo explicarse.
      [VERSION_INICIAL]: {
        vigente_desde: ahora,
        vigente_hasta: ahora,
        definicion: DEFINICION_V1_0,
        motivo: MOTIVO_V1_0,
        autor_uid: autorUid,
        calibracion: CALIBRACION_V1_0,
        limitaciones: LIMITACIONES_V1_0,
      },
      [VERSION_VIGENTE]: {
        vigente_desde: ahora,
        vigente_hasta: null,
        definicion: DEFINICION_V1_1,
        motivo: MOTIVO_V1_1,
        autor_uid: autorUid,
        calibracion: CALIBRACION_V1_1,
        limitaciones: LIMITACIONES_V1_1,
        resumen: RESUMEN_V1_1,
        antes_de_descartar: ANTES_DE_DESCARTAR_V1_1,
      },
    },
    version_actual: VERSION_VIGENTE,
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
