/**
 * VOCABULARIO DE NEG — el léxico del trabajo que NEG hace (B.1b).
 *
 * Sirve para el SEGUNDO PISO de la clasificación del radar: cuando un proceso
 * de SECOP II todavía no tiene código UNSPC —el caso normal de lo recién
 * publicado, medido en B.1— la única señal disponible es el texto del objeto
 * contratado.
 *
 * ── POR QUÉ ES UN DOCUMENTO VERSIONADO Y NO UNA CONSTANTE ───────────────────
 *
 * Misma razón que el criterio del semáforo (`semaforoVersiones.ts`): es un
 * CRITERIO, no una constante técnica. Cambia con la evidencia de las corridas,
 * y cuando cambia hay que poder decir desde cuándo, con qué lista y por qué —
 * un radar que empieza a mostrar otras cosas sin que nadie sepa cuándo cambió
 * de criterio no es auditable.
 *
 * Vive en `configuracion/vocabulario_neg`. NO necesita regla nueva: el match
 * genérico `configuracion/{docId}` ya da lectura a `accesoSIGP()` y escritura
 * a gerencia_general y admin.
 *
 * ── DE DÓNDE SALIÓ LA LISTA ────────────────────────────────────────────────
 *
 * Derivada de los datos, no redactada. El detalle completo —corpus, método,
 * umbrales, métricas y lo que se excluyó a mano con su motivo— vive en
 * `functions/scripts/vocabulario-neg-v1.0.json`, que es la FUENTE ÚNICA: este
 * módulo lo importa, no lo copia.
 *
 * Resumen: 48 términos de 395 objetos positivos (23 procesos que NEG ganó en
 * SECOP + 372 del registro histórico de Karen) contra 16.807 negativos con
 * etiqueta real (procesos del territorio cuyo código existe y está fuera de
 * las familias del RUP). Recall en muestra 84,8 %; **fuera de muestra 83 %**
 * (léxico derivado solo del registro de Karen, medido contra los ganados de
 * SECOP) con 7,3 % de falsos positivos.
 *
 * ── EL TOKENIZADOR ES PARTE DEL CONTRATO ───────────────────────────────────
 *
 * `terminosDelObjeto` tiene que producir EXACTAMENTE los mismos términos que
 * produjo el script de derivación, o la lista medida deja de significar lo
 * que dice que significa. Por eso vive acá, junto a la lista, y no en el
 * módulo que clasifica: un tokenizador distinto es un léxico distinto.
 */
import type { Timestamp } from 'firebase/firestore'
import VOCABULARIO_JSON from '../../../functions/scripts/vocabulario-neg-v1.1.json'

/** Versión del léxico empaquetado. Subirla es cambiar de criterio. */
export const VOCABULARIO_NEG_VERSION: string = VOCABULARIO_JSON.version

/** Los términos del léxico v1.0, tal como salieron de la derivación. */
export const TERMINOS_NEG: readonly string[] = VOCABULARIO_JSON.terminos

/**
 * TÉRMINOS QUE BLOQUEAN. Si el objeto contiene uno, el proceso NO entra
 * aunque coincida cualquier otro término.
 *
 * No es lo mismo que excluir un término del léxico: un término excluido deja
 * de aportar, un negativo CANCELA lo que aportaron los demás. Hace falta
 * porque el ruido que queda no viene de una palabra mala sino de un objeto que
 * habla de otra cosa — «mantenimiento preventivo y correctivo de hardware y
 * software, con la adecuación de equipos» tiene ADECUACION, que es un buen
 * término, y aun así no es trabajo de NEG.
 *
 * SE MIDEN ANTES DE ENTRAR. Los dos que están aparecen en 3 procesos cada uno
 * de los 128 medidos, y los 6 son ruido. Se descartaron DESARROLLO y
 * MOBILIARIO porque bloqueaban adecuaciones locativas legítimas, y ALIMENTOS y
 * LICENCIA porque no aparecían en ninguno: un negativo sin casos medidos es
 * una suposición con cara de regla.
 */
export const NEGATIVOS_NEG: readonly string[] = VOCABULARIO_JSON.negativos ?? []

/** Frecuencias medidas por término: documentos positivos, fondo y lift. */
export const FRECUENCIAS_NEG: Readonly<Record<string, { pos: number; fondo: number; lift: number }>> =
  VOCABULARIO_JSON.frecuencias

/**
 * Palabras funcionales que el tokenizador descarta. Son las MISMAS que usó la
 * derivación; agregar o quitar una cambia los términos y por tanto el léxico.
 */
export const PALABRAS_FUNCIONALES: readonly string[] = [
  'PARA', 'COMO', 'ESTE', 'ESTA', 'ESTOS', 'ESTAS', 'DESDE', 'HASTA', 'SOBRE',
  'ENTRE', 'SEGUN', 'DEMAS', 'CUAL', 'CUALES', 'TODO', 'TODA', 'TODOS', 'TODAS',
  'OTRO', 'OTRA', 'OTROS', 'OTRAS', 'MISMO', 'MISMA', 'DICHO', 'DICHA', 'ANTE',
  'BAJO', 'CADA', 'SINO', 'PERO', 'DEL', 'LAS', 'LOS', 'POR', 'CON', 'QUE',
  'SUS', 'UNA', 'UNO', 'UNOS', 'UNAS', 'SIN', 'SER', 'SEA', 'SON', 'ESE', 'ESA',
  'ANO', 'ANOS', 'DONDE', 'CUYO', 'CUYA', 'VIGENCIA', 'VIGENCIAS', 'OBJETO',
  'ACUERDO', 'MARCO', 'NOMBRE', 'NECESARIAS', 'NECESARIOS', 'UBICADAS',
  'UBICADOS', 'REQUERIDAS', 'REQUERIDOS',
]

const FUNCIONALES = new Set(PALABRAS_FUNCIONALES)

/** Longitud mínima de palabra. 3 letras o menos es casi siempre función. */
export const LARGO_MINIMO_PALABRA = 4

/**
 * Normaliza el objeto contratado: sin tildes, MAYÚSCULAS, sin puntuación,
 * espacios colapsados. Idéntica a la del script de derivación.
 */
export function normalizarObjeto(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9ÑÜ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Términos de un objeto: unigramas y bigramas de las palabras significativas.
 *
 * Los BIGRAMAS importan: 'ADECUACION' solo aparece en 36,5 % de los positivos
 * pero también en 285 procesos del fondo; 'ADECUACIONES LOCATIVAS' aparece en
 * 21 positivos y 11 de 16.807 del fondo. La precisión del léxico vive en los
 * pares, no en las palabras sueltas.
 */
export function terminosDelObjeto(texto: string | null | undefined): Set<string> {
  const palabras = normalizarObjeto(texto)
    .split(' ')
    .filter(p => p.length >= LARGO_MINIMO_PALABRA && !FUNCIONALES.has(p))
  const salida = new Set<string>(palabras)
  for (let i = 0; i < palabras.length - 1; i++) {
    salida.add(`${palabras[i]} ${palabras[i + 1]}`)
  }
  return salida
}

export interface CoincidenciaVocabulario {
  /**
   * El término negativo que canceló la coincidencia, o `null`.
   *
   * NO es opcional. La función siempre lo devuelve, y declararlo opcional
   * obligaba a cada consumidor a tratar `undefined` como un tercer caso que
   * no existe — o, peor, a confundirlo con `null` y perder la distinción
   * entre «no hubo bloqueo» y «nadie preguntó».
   */
  bloqueado_por: string | null
  /**
   * El negativo que estaba presente y NO bloqueó, porque un término fuerte
   * se le impuso. O `null`.
   *
   * Existe por una razón precisa: el error de un negativo es INVISIBLE — lo
   * que bloquea no llega a ninguna pantalla. Este campo es el único lugar
   * donde queda registrado que un bloqueo estuvo a punto de tapar algo que el
   * léxico reconocía bien. Sin él, la pregunta «¿la regla nueva sirve?» no
   * se puede responder con datos.
   *
   * Nunca va junto con `bloqueado_por`: o bloqueó, o no bloqueó.
   */
  negativo_ignorado: string | null
  coincide: boolean
  /** Términos del léxico encontrados, en orden de aparición en la lista. */
  terminos: string[]
}

/** Un término de varias palabras. Ver `esTerminoFuerte`. */
export const esTerminoFuerte = (t: string): boolean => t.trim().includes(' ')

/**
 * ¿El objeto contratado habla del trabajo de NEG?
 *
 * Devuelve TAMBIÉN cuáles términos coincidieron: sin eso, un `probable` es
 * una afirmación sin respaldo y nadie puede revisar por qué el radar le puso
 * algo al frente. Es el mismo principio de `semaforo_motivos`.
 *
 * ── LA REGLA DE BLOQUEO ─────────────────────────────────────────────────────
 *
 * Un negativo bloquea SOLO si ningún término FUERTE —de varias palabras—
 * coincidió. Antes bloqueaba siempre, y esa versión vivió un día: al medir
 * recall apareció «OBRAS DE ADECUACIÓN, MANTENIMIENTO Y DOTACION DE
 * MOBILIARIO DE LA INFRAESTRUCTURA FÍSICA» — cuatro términos buenos adentro,
 * vetado por una palabra.
 *
 * Por qué el umbral son los bigramas y no un conteo: lo que distingue este
 * léxico es que las frases discriminan donde las palabras sueltas no
 * (INFRAESTRUCTURA FISICA tiene lift 95; INFRAESTRUCTURA sola arrastra
 * «infraestructura digital»). Un objeto que coincide en una FRASE del oficio
 * está hablando del oficio, y entonces el bloqueo pierde.
 *
 * Costo medido sobre el universo 2026: UN proceso al año que hoy se bloquea
 * entraría. Eso es lo que cuesta que un bloqueo equivocado no pueda tapar lo
 * que el léxico reconoce bien.
 */
export function coincideVocabulario(
  objeto: string | null | undefined,
  terminos: readonly string[] = TERMINOS_NEG,
  negativos: readonly string[] = NEGATIVOS_NEG,
): CoincidenciaVocabulario {
  const presentes = terminosDelObjeto(objeto)
  const hallados = terminos.filter(t => presentes.has(t))

  // El bloqueo se evalúa DESPUÉS de hallar, y los términos hallados se
  // conservan: el documento tiene que poder decir «coincidió en esto, y aun
  // así no entró por aquello». Devolver la lista vacía ahorraría una línea y
  // borraría la única evidencia de por qué el léxico se equivocó.
  const negativo = negativos.find(n => presentes.has(n)) ?? null
  const hayFuerte = hallados.some(esTerminoFuerte)
  const bloqueado_por = negativo !== null && !hayFuerte ? negativo : null
  return {
    coincide: hallados.length > 0 && bloqueado_por === null,
    terminos: hallados,
    bloqueado_por,
    negativo_ignorado: negativo !== null && hayFuerte ? negativo : null,
  }
}

// ── El documento de configuración ───────────────────────────────────────────

/** Una versión del léxico, tal como queda registrada. */
export interface VersionVocabularioNeg {
  vigente_desde: Timestamp
  /** `null` = es la vigente. Se cierra al adoptar la siguiente. */
  vigente_hasta: Timestamp | null
  /** Qué es y cómo se usa, legible por un auditor. */
  definicion: string
  /** De qué corpus y con qué método salió. */
  derivacion: string
  /** Lo medido: tamaños de corpus, recall, falsos positivos, carga. */
  metricas: Record<string, unknown>
  /** Lo que se excluyó a mano, con el motivo de cada grupo. */
  excluidos: Record<string, unknown>
  /** Qué NO puede hacer este léxico. El campo más importante del registro. */
  limitaciones: string
  /** Quién lo adoptó. */
  autor_uid: string
  terminos: string[]
  /** Términos que BLOQUEAN. Opcional: v1.0 no los tenía. */
  negativos?: string[]
}

export interface RegistroVocabularioNeg {
  versiones: Record<string, VersionVocabularioNeg>
  version_actual: string
}

/**
 * Términos de la versión vigente del registro, o el léxico empaquetado si el
 * documento no existe o está incompleto.
 *
 * La degradación es DELIBERADA y es la decisión de diseño del módulo: un radar
 * que se queda sin clasificar porque falta un documento de configuración es un
 * radar apagado. El léxico empaquetado es el mismo que sembraría el script, y
 * `versionVocabularioVigente` dice cuál se usó — para que el reporte de la
 * corrida no mienta sobre con qué criterio clasificó.
 */
export function terminosVigentes(
  registro: RegistroVocabularioNeg | null | undefined,
): readonly string[] {
  const v = registro?.versiones?.[registro.version_actual]
  if (!v || !Array.isArray(v.terminos) || v.terminos.length === 0) return TERMINOS_NEG
  return v.terminos
}

/**
 * Los negativos de la versión vigente, o los empaquetados.
 *
 * Una lista VACÍA es una respuesta legítima — una versión puede no tener
 * negativos— así que el fallback mira si el campo EXISTE, no si tiene algo.
 * Con el criterio de `terminosVigentes`, un registro que quiso quedarse sin
 * negativos recuperaría los empaquetados sin que nadie lo pidiera.
 */
export function negativosVigentes(
  registro: RegistroVocabularioNeg | null | undefined,
): readonly string[] {
  const v = registro?.versiones?.[registro.version_actual]
  if (!v || !Array.isArray(v.negativos)) return NEGATIVOS_NEG
  return v.negativos
}

/** Qué versión se está usando de verdad: la del documento o la empaquetada. */
export function versionVocabularioVigente(
  registro: RegistroVocabularioNeg | null | undefined,
): string {
  const v = registro?.versiones?.[registro.version_actual]
  if (!v || !Array.isArray(v.terminos) || v.terminos.length === 0) {
    return `${VOCABULARIO_NEG_VERSION} (empaquetada)`
  }
  return registro!.version_actual
}

/**
 * Semilla de `configuracion/vocabulario_neg`.
 *
 * PURA: sin Firestore, sin reloj propio. Es la misma fuente que usa el script
 * de siembra, para que un test pueda compararla contra el JSON campo por campo
 * — la guarda contra el defecto del `limitaciones` omitido, que fue invisible
 * precisamente porque el script construía el documento por su cuenta.
 */
export function construirSemillaVocabularioNeg(
  autorUid: string, ahora: Timestamp,
): RegistroVocabularioNeg {
  return {
    versiones: {
      [VOCABULARIO_NEG_VERSION]: {
        vigente_desde: ahora,
        vigente_hasta: null,
        definicion: VOCABULARIO_JSON.definicion,
        derivacion: VOCABULARIO_JSON.derivacion,
        metricas: VOCABULARIO_JSON.metricas,
        excluidos: VOCABULARIO_JSON.excluidos,
        limitaciones: VOCABULARIO_JSON.limitaciones,
        autor_uid: autorUid,
        terminos: [...TERMINOS_NEG],
        negativos: [...NEGATIVOS_NEG],
      },
    },
    version_actual: VOCABULARIO_NEG_VERSION,
  }
}

/**
 * Campos del JSON que la semilla escribe. Guarda anti-omisión: si el JSON gana
 * un campo y nadie lo lleva a la semilla, el documento se sembraría incompleto
 * sin que nada avise — y la siembra aborta al reintentar, así que el hueco
 * queda. Hay un test que compara esta lista contra las claves del JSON.
 */
export const CAMPOS_JSON_VOCABULARIO: readonly string[] = [
  'version', 'definicion', 'derivacion', 'metricas', 'excluidos',
  'limitaciones', 'terminos', 'frecuencias', 'negativos',
]
