/**
 * Consulta de ingesta a SECOP II (Socrata / SoQL) — sub-bloque B.1 del radar.
 *
 * CONSTRUYE LA CONSULTA, NO LA HACE. Este módulo es puro: devuelve
 * `URLSearchParams`, URLs y cabeceras. Quien dispare la petición será la
 * Cloud Function de su bloque, y los tests de acá no tocan la red.
 *
 * ── LO QUE SE MIDIÓ ANTES DE ESCRIBIR ESTO (09-nov-2026) ────────────────────
 *
 *  · APP TOKEN: NO es obligatorio — las mediciones de este bloque se hicieron
 *    anónimas y todas dieron HTTP 200. Pero sin token Socrata agrupa por IP en
 *    un POOL COMPARTIDO y limita con 429; con token el límite es por
 *    aplicación y la documentación dice que no se limita salvo abuso. Una CF
 *    sale por IPs de egreso compartidas de Google: ahí el pool ajeno es
 *    exactamente el riesgo. RECOMENDACIÓN: usar token, por configuración de
 *    Functions o Remote Config, NUNCA en el código.
 *    Verificado además: un token INVÁLIDO devuelve **403**, no un 200
 *    degradado. Eso es bueno — un token mal configurado falla fuerte — y por
 *    eso `cabecerasConsulta` no tiene camino de "reintento anónimo": un 403
 *    hay que verlo, no esconderlo.
 *    El token va en la CABECERA `X-App-Token` y no en el query string
 *    (Socrata admite `$$app_token` en la URL; las URLs quedan en logs).
 *
 *  · `$limit` AUSENTE = 1.000 FILAS, SIN AVISO. Medido: la misma consulta sin
 *    `$limit` devolvió 1.000 y con `$limit=50001` devolvió las 29.354 que
 *    tiene el filtro. Una cosecha "completa" sin `$limit` es una cosecha
 *    truncada que se ve igual de bien. Por eso `paramsIngesta` SIEMPRE escribe
 *    `$limit`, `$offset` y `$order`.
 *
 *  · PAGINAR SIN `$order` ES RULETA: `$offset` sobre un orden no especificado
 *    puede repetir y saltarse filas. El orden de paginación es
 *    `id_del_proceso ASC` — único por fila dentro de un proceso no, pero
 *    estable; se combina con `fecha_de_publicacion_del` para que la ventana
 *    sea legible.
 *
 *  · ACENTOS: los literales del filtro llevan tildes
 *    (`'Distrito Capital de Bogotá'`, `'Mínima cuantía'`). Construir la URL a
 *    mano en una shell no-UTF-8 mandó `Bogot?` y la API respondió 400. Peor
 *    aún: un literal mal codificado DENTRO de un `in(...)` válido devuelve
 *    **cero filas sin error** — una cosecha vacía que parece "hoy no hubo
 *    nada". Acá todo sale por `URLSearchParams`, que codifica UTF-8.
 *
 *  · VOLUMEN REAL del filtro del brief (tres familias + dos departamentos +
 *    dos modalidades), medido sobre 2025: **3.446 filas / 3.169 procesos** —
 *    unos 12,7 procesos por día hábil, no 17. Sobre todos los años: 29.354
 *    filas.
 *
 *  · ⚠ EL FILTRO POR FAMILIA NO SIRVE COMO RADAR, y es el hallazgo del
 *    bloque. La categoría UNSPC se asigna TARDE. Octubre de 2026, Bogotá +
 *    Cundinamarca con las dos modalidades: **2.238 filas `UNSPECIFIED` contra
 *    21 con código `V1.*`**. Mayo de 2025, mismo filtro: 539 contra 2.344. Y
 *    el mes a mes del filtro completo en 2026 se derrumba justo al final
 *    (jul 356 · ago 248 · sep 124 · **oct 12** · nov 0) mientras el mismo
 *    corte sin familias sigue normal (oct 2.259 · nov 429).
 *    Conclusión medida: el filtro de familias da un CORPUS HISTÓRICO
 *    excelente, pero como radar llega tarde. Por eso existe
 *    `modo: 'radar' | 'historico'` — y el default del módulo es el filtro del
 *    brief (`historico`), para no cambiarle el alcance a nadie por mi cuenta.
 *    La decisión de pasar el radar a `radar` es de Giovanny; el reporte lleva
 *    los números.
 *
 *  · `:updated_at` NO SIRVE DE MARCA INCREMENTAL: las 29.354 filas del filtro
 *    tienen el MISMO `:updated_at` (2026-11-08T13:35:42.561Z) — el dataset se
 *    republica completo. La marca es `fecha_de_publicacion_del`, como pide el
 *    brief, pero con VENTANA DE SOLAPE (`ventanaIngesta`): como la categoría
 *    y otros campos cambian después, un `>` pelado congela para siempre la
 *    foto de la primera lectura.
 *
 *  · 515 filas del filtro NO TIENEN `fecha_de_publicacion_del`. Un
 *    `where fecha > marca` las excluye SIEMPRE, en toda corrida. Por eso
 *    `incluir_sin_fecha` existe y por defecto está en `true`: entran y el
 *    mapeo las marca.
 *    CONSECUENCIA MEDIDA, para que no sorprenda: como no tienen fecha, esas
 *    filas caen DENTRO de cualquier ventana. El filtro de 2025 da 3.446 filas
 *    con el corte exacto del brief y 3.981 con los defectos de este módulo —
 *    la diferencia son esas ~515 sin fecha más los 15 de la variante sin
 *    tildes. Cuesta un re-leído acotado y constante por corrida, y no duplica
 *    nada porque el doc id es determinístico.
 *
 * ── VERIFICACIÓN DEL CONSTRUCTOR CONTRA LA API (09-nov-2026) ────────────────
 * Las URLs que produce este módulo se dispararon contra el endpoint y se
 * compararon con las mediciones hechas a mano antes de escribirlo:
 *   · filtro EXACTO del brief, 2025  ->  3.446 filas  (coincide)
 *   · defectos del módulo, 2025      ->  3.981 filas  (+ sin-fecha + variante)
 *   · `modo: 'radar'`, octubre 2026  ->  2.268 filas  (contra 21 por familia)
 *   · sin ventana (histórico)        ->  29.622 filas
 */

/** Dataset: SECOP II — Procesos de Contratación, en datos.gov.co. */
export const DATASET_SECOP = 'p6dx-8zbt'
export const ENDPOINT_SECOP = `https://www.datos.gov.co/resource/${DATASET_SECOP}.json`

/** Familias UNSPC del RUP de NEG (ver `secopMapeo.ts`). */
export const FAMILIAS_RUP_NEG = ['V1.7210', 'V1.7215', 'V1.8110'] as const

/** Territorio de NEG, con el texto EXACTO de SECOP (tildes incluidas). */
export const DEPARTAMENTOS_INGESTA = [
  'Distrito Capital de Bogotá',
  'Cundinamarca',
] as const

/**
 * Modalidades que entran. Las dos del brief MÁS la variante sin tildes
 * (decisión documentada en la trampa 11 de `secopMapeo.ts`): es menor cuantía
 * sin manifestación de interés — o sea sin sorteo de consolidación, la
 * variante con mejores probabilidades para NEG — y cae igual en rojo por
 * modalidad, así que no inunda la bandeja. Quitarla es borrar una línea.
 */
export const MODALIDADES_INGESTA = [
  'Mínima cuantía',
  'Selección Abreviada de Menor Cuantía',
  'Seleccion Abreviada Menor Cuantia Sin Manifestacion Interes',
] as const

/** Tope de filas por página que admite Socrata. */
export const LIMITE_PAGINA = 50_000

/**
 * Lo que devuelve la API cuando NO se manda `$limit`. No es un default
 * inofensivo: es una cosecha truncada con cara de completa.
 */
export const LIMITE_IMPLICITO_PELIGROSO = 1_000

/** Días de solape por defecto de la ventana incremental. */
export const DIAS_SOLAPE_DEFECTO = 45

export type ModoIngesta = 'historico' | 'radar'

export interface OpcionesIngesta {
  /**
   * `historico` (DEFECTO) = el filtro del brief: familias UNSPC + territorio +
   * modalidades. Corpus limpio, pero ciego a lo recién publicado.
   * `radar` = territorio + modalidades, SIN filtro de familia en la API: trae
   * también lo `UNSPECIFIED` y la familia se decide en casa con
   * `familiaRup()`. Ver el hallazgo del encabezado.
   */
  modo?: ModoIngesta
  /** Marca inferior, inclusiva: ISO o 'YYYY-MM-DD'. */
  desde?: string | null
  /** Marca superior, inclusiva. */
  hasta?: string | null
  /** Familias a exigir en `modo: 'historico'`. */
  familias?: readonly string[]
  departamentos?: readonly string[]
  modalidades?: readonly string[]
  /**
   * Incluir las filas sin fecha de publicación (515 medidas en el filtro).
   * Por defecto `true`: un `>` pelado las pierde en todas las corridas.
   */
  incluir_sin_fecha?: boolean
  limite?: number
  offset?: number
}

/**
 * Escapa un literal de cadena de SoQL. La comilla simple se duplica — es la
 * única vía de inyección posible en una consulta armada por concatenación, y
 * los nombres de entidad y modalidad vienen de datos.
 */
export function literalSoql(v: string): string {
  return `'${v.replace(/'/g, "''")}'`
}

/** `in('a','b')` con los literales escapados. */
export function clausulaIn(campo: string, valores: readonly string[]): string {
  return `${campo} in(${valores.map(literalSoql).join(',')})`
}

/** `(starts_with(cat,'V1.7210') OR …)` — una por familia. */
export function clausulaFamilias(familias: readonly string[] = FAMILIAS_RUP_NEG): string {
  const ors = familias.map(
    f => `starts_with(codigo_principal_de_categoria,${literalSoql(f)})`,
  )
  return `(${ors.join(' OR ')})`
}

/**
 * Ventana de fechas. Con `incluir_sin_fecha` la cláusula admite además las
 * filas sin publicación — si no, se perderían en todas las corridas.
 */
export function clausulaFechas(
  desde?: string | null, hasta?: string | null, incluir_sin_fecha = true,
): string | null {
  const campo = 'fecha_de_publicacion_del'
  const partes: string[] = []
  if (desde) partes.push(`${campo} >= ${literalSoql(desde)}`)
  if (hasta) partes.push(`${campo} <= ${literalSoql(hasta)}`)
  if (partes.length === 0) return incluir_sin_fecha ? null : `${campo} IS NOT NULL`
  const rango = partes.join(' AND ')
  return incluir_sin_fecha ? `(${rango} OR ${campo} IS NULL)` : `(${rango})`
}

/** El `$where` completo del filtro de ingesta. */
export function whereIngesta(opciones: OpcionesIngesta = {}): string {
  const {
    modo = 'historico',
    desde = null,
    hasta = null,
    familias = FAMILIAS_RUP_NEG,
    departamentos = DEPARTAMENTOS_INGESTA,
    modalidades = MODALIDADES_INGESTA,
    incluir_sin_fecha = true,
  } = opciones

  const clausulas: string[] = []
  if (modo === 'historico') clausulas.push(clausulaFamilias(familias))
  clausulas.push(clausulaIn('departamento_entidad', departamentos))
  clausulas.push(clausulaIn('modalidad_de_contratacion', modalidades))
  const fechas = clausulaFechas(desde, hasta, incluir_sin_fecha)
  if (fechas) clausulas.push(fechas)

  return clausulas.join(' AND ')
}

/**
 * Orden de paginación. ESTABLE y explícito: sin `$order`, `$offset` puede
 * repetir y saltarse filas, y una cosecha paginada queda con huecos que nadie
 * ve.
 */
export const ORDEN_INGESTA = 'fecha_de_publicacion_del ASC, id_del_proceso ASC'

/**
 * Parámetros de una página. `$limit` SIEMPRE presente (ver
 * `LIMITE_IMPLICITO_PELIGROSO`); `URLSearchParams` se encarga de codificar los
 * acentos en UTF-8.
 */
export function paramsIngesta(opciones: OpcionesIngesta = {}): URLSearchParams {
  const limite = Math.min(opciones.limite ?? LIMITE_PAGINA, LIMITE_PAGINA)
  const offset = opciones.offset ?? 0
  const p = new URLSearchParams()
  p.set('$where', whereIngesta(opciones))
  p.set('$order', ORDEN_INGESTA)
  p.set('$limit', String(limite))
  p.set('$offset', String(offset))
  return p
}

/** URL completa de una página de la ingesta. */
export function urlIngesta(opciones: OpcionesIngesta = {}): string {
  return `${ENDPOINT_SECOP}?${paramsIngesta(opciones).toString()}`
}

/** Parámetros de un `count(1)` con el MISMO `$where` — para verificar el total. */
export function paramsConteo(opciones: OpcionesIngesta = {}): URLSearchParams {
  const p = new URLSearchParams()
  p.set('$select', 'count(1) as total')
  p.set('$where', whereIngesta(opciones))
  return p
}

export function urlConteo(opciones: OpcionesIngesta = {}): string {
  return `${ENDPOINT_SECOP}?${paramsConteo(opciones).toString()}`
}

/**
 * Cabeceras de la petición. El token va acá, NUNCA en la URL.
 *
 * Sin token la petición funciona pero comparte pool por IP (429 posible); con
 * token inválido la API responde 403 — y eso NO se reintenta en anónimo: un
 * token mal configurado tiene que doler.
 */
export function cabecerasConsulta(appToken?: string | null): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' }
  const t = (appToken ?? '').trim()
  if (t !== '') h['X-App-Token'] = t
  return h
}

/** ¿Hace falta token? No para funcionar; sí para no depender de un pool ajeno. */
export const APP_TOKEN_OBLIGATORIO = false

// ── Ventana incremental ──────────────────────────────────────────────────────

export interface VentanaIngesta {
  desde: string | null
  hasta: string | null
  /** Días de solape aplicados hacia atrás sobre la marca. */
  solape_dias: number
  /** `true` en la primera corrida (sin marca): barrido completo. */
  primera_corrida: boolean
}

/**
 * Calcula la ventana a consultar a partir de la marca de la última corrida.
 *
 * NO es `fecha > marca`. Se retrocede `solape_dias` porque el dataset
 * COMPLETA los registros después de publicarlos: en octubre de 2026 el 99 %
 * de las filas del territorio todavía estaba `UNSPECIFIED` y su código UNSPC
 * aparece semanas más tarde. Con un `>` pelado, cada proceso se leería UNA
 * sola vez — en el momento en que menos se sabe de él — y el radar se quedaría
 * con esa foto para siempre.
 *
 * El solape no duplica nada: el doc id es determinístico (`docIdSecop`), así
 * que re-leer ACTUALIZA el mismo documento.
 *
 * Sin marca (primera corrida) devuelve `desde: null` — barrido completo.
 */
export function ventanaIngesta(
  marcaUltimaCorrida: string | null | undefined,
  ahora: Date,
  solape_dias: number = DIAS_SOLAPE_DEFECTO,
): VentanaIngesta {
  const hasta = iso(ahora)
  if (!marcaUltimaCorrida) {
    return { desde: null, hasta, solape_dias, primera_corrida: true }
  }
  const base = new Date(marcaUltimaCorrida)
  if (Number.isNaN(base.getTime())) {
    // Marca corrupta: barrido completo antes que una ventana inventada.
    return { desde: null, hasta, solape_dias, primera_corrida: true }
  }
  const desde = new Date(base.getTime() - solape_dias * 86_400_000)
  return { desde: iso(desde), hasta, solape_dias, primera_corrida: false }
}

const iso = (d: Date): string => d.toISOString().slice(0, 10)

/**
 * Páginas necesarias para `total` filas. Se calcula CONTRA EL CONTEO de la
 * API, no contra lo que devolvió la primera página: así una cosecha corta se
 * nota.
 */
export function paginasPara(total: number, limite: number = LIMITE_PAGINA): number {
  if (total <= 0) return 0
  return Math.ceil(total / Math.min(limite, LIMITE_PAGINA))
}

/**
 * Compara lo cosechado contra el conteo declarado por la API. Devuelve el
 * faltante y si la cosecha es aceptable — la guarda de "no comprobar el
 * resultado": que las páginas no hayan tirado error no significa que estén
 * todas.
 */
export function verificarCosecha(total_api: number, filas_cosechadas: number): {
  completa: boolean
  faltan: number
  senal: string | null
} {
  const faltan = total_api - filas_cosechadas
  if (faltan === 0) return { completa: true, faltan: 0, senal: null }
  return {
    completa: false,
    faltan,
    senal: faltan > 0
      ? `COSECHA INCOMPLETA: la API declara ${total_api} filas y se trajeron `
        + `${filas_cosechadas} (faltan ${faltan}). No se escribe con una cosecha a medias.`
      : `COSECHA MAYOR QUE EL CONTEO: ${filas_cosechadas} filas contra ${total_api} `
        + `declaradas (${-faltan} de más) — probable paginación sin $order.`,
  }
}
