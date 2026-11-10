/**
 * LAS ÚNICAS RUTAS QUE EL RADAR PUEDE ESCRIBIR.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ─────────────────────────────────────────────
 *
 * La Cloud Function del radar corre con una cuenta de servicio dedicada
 * (`radar-secop@`) cuyo único rol es `roles/datastore.user`. Eso baja la
 * superficie de 12.497 permisos (Editor) a 23, y la saca de Storage, Auth, IAM
 * y la administración de Functions.
 *
 * Pero `datastore.user` es **todo-o-nada sobre la base de datos**: no se puede
 * acotar a colecciones ni a documentos, y los clientes de servidor OMITEN las
 * Security Rules. Está medido y citado en `docs/radar-cuenta-de-servicio.md`.
 *
 * Consecuencia honesta: **lo único que impide que el radar escriba en `users`,
 * en `proyectos` o en cualquier otra parte es nuestro código.** Y un límite que
 * vive solo en el código es una intención, no un control — salvo que tenga un
 * test.
 *
 * Este archivo es ese control:
 *  · la lista blanca tiene DOS entradas y está acá, en un solo lugar;
 *  · `validarRutaEscritura` LANZA ante cualquier otra ruta, así que un error de
 *    programación falla en la corrida en vez de escribir donde no debe;
 *  · y su test lee el CÓDIGO FUENTE de la Cloud Function para verificar que no
 *    construye referencias por fuera de los dos helpers. Si alguien agrega una
 *    escritura a otra colección, **cae la suite**.
 *
 * Es el mismo patrón de los otros guardarraíles del módulo —el test que parsea
 * `firestore.rules` para que el builder y la regla no divergan, el que compara
 * los dos constructores de la semilla— aplicado a las rutas de escritura.
 *
 * ── ESTA LISTA NO SE AMPLÍA POR CONVENIENCIA ────────────────────────────────
 *
 * Agregar una ruta es un diff visible en este archivo, con su caso en el test.
 * Si un bloque futuro necesita escribir en otra parte, eso es una decisión de
 * alcance del radar, no un detalle de implementación.
 */

/** La colección del radar. */
export const COL_LICITACIONES = 'licitaciones'

/** El estado del radar: marca, registro de corridas y acumulado. ESCRIBIBLE. */
export const RUTA_ESTADO_RADAR = 'configuracion/radar_secop'

/**
 * El léxico versionado. **SOLO LECTURA** para el radar: lo adopta una persona
 * con el rol correspondiente (gerencia_general o admin) desde el panel o con el
 * script de siembra. El radar lo consume; no lo decide.
 */
export const RUTA_VOCABULARIO_NEG = 'configuracion/vocabulario_neg'

/**
 * Las dos formas de ruta que el radar puede ESCRIBIR, en texto legible. Es la
 * lista que el test fija: si crece, el diff se ve.
 */
export const RUTAS_ESCRITURA_RADAR: readonly string[] = [
  `${COL_LICITACIONES}/{docId}`,
  RUTA_ESTADO_RADAR,
]

/** Ruta del documento de una licitación. */
export function rutaLicitacion(docId: string): string {
  return `${COL_LICITACIONES}/${docId}`
}

/** Un segmento de ruta de Firestore válido para lo que escribe el radar. */
function segmentoValido(s: string): boolean {
  if (s === '' || s === '.' || s === '..') return false
  // El doc id del radar lo produce `docIdSecop`: `secop_<legible>_<hash>`.
  // Cualquier cosa con barras, espacios o caracteres raros no viene de ahí.
  return /^[A-Za-z0-9_.-]+$/.test(s)
}

/**
 * ¿Es una ruta que el radar PUEDE escribir?
 *
 * Solo dos formas, y nada más:
 *  · `licitaciones/<docId>` — exactamente dos segmentos. Las subcolecciones
 *    quedan FUERA a propósito: el radar escribe el documento de la licitación,
 *    no sus requisitos ni sus adjuntos, que tienen otros dueños.
 *  · `configuracion/radar_secop` — exacto.
 */
export function esRutaDeEscrituraPermitida(ruta: string): boolean {
  if (typeof ruta !== 'string' || ruta === '') return false
  if (ruta !== ruta.trim()) return false
  const partes = ruta.split('/')
  if (!partes.every(segmentoValido)) return false
  if (ruta === RUTA_ESTADO_RADAR) return true
  if (partes.length !== 2) return false
  return partes[0] === COL_LICITACIONES
}

/**
 * Devuelve la ruta si el radar puede escribirla; si no, LANZA.
 *
 * Lanzar y no devolver `false` es deliberado: una corrida que falla ruidosamente
 * es un problema que se ve; una que escribe en la colección equivocada es un
 * problema que se descubre meses después. Y el mensaje nombra la ruta, porque
 * un error que no dice qué pasó cuesta una sesión de depuración.
 */
export function validarRutaEscritura(ruta: string): string {
  if (!esRutaDeEscrituraPermitida(ruta)) {
    throw new Error(
      `RUTA NO PERMITIDA PARA EL RADAR: "${ruta}". `
      + `El radar solo escribe en ${RUTAS_ESCRITURA_RADAR.join(' y ')}. `
      + 'Si un bloque nuevo necesita otra ruta, agrégala a RUTAS_ESCRITURA_RADAR '
      + 'con su caso en el test — no por acá.',
    )
  }
  return ruta
}

/**
 * Las rutas que el radar LEE además de las que escribe. Están declaradas para
 * que el test del código fuente sepa qué literales son legítimos: una ruta de
 * lectura no autoriza una escritura, pero tampoco debería aparecer sin
 * declararse.
 */
export const RUTAS_LECTURA_RADAR: readonly string[] = [
  RUTA_VOCABULARIO_NEG,
]
