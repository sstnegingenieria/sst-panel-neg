/**
 * Mapeo de SECOP II (datos abiertos de Colombia, Socrata) al modelo de
 * `licitaciones` — sub-bloque B.1 del radar.
 *
 * FUNCIÓN PURA: recibe las filas crudas tal como las devuelve la API y
 * devuelve registros normalizados + un reporte. CERO red, CERO Firestore,
 * CERO React. Quien hace la petición es `secopConsulta.ts` (que tampoco la
 * hace: solo construye la consulta) y el escritor vendrá en su bloque.
 *
 * Dataset: `p6dx-8zbt` — "SECOP II · Procesos de Contratación" en
 * datos.gov.co. 59 columnas, todas declaradas en el encabezado
 * `X-SODA2-Fields` de cualquier respuesta.
 *
 * ── TRAMPAS DEL ORIGEN, verificadas contra la API el 09-nov-2026 ────────────
 *
 *  1. TODO LLEGA COMO TEXTO. Las columnas que Socrata declara `number`
 *     (`precio_base`, `numero_de_lotes`, `respuestas_al_procedimiento`,
 *     `valor_total_adjudicacion`) viajan en el JSON como string: `"6000000"`,
 *     `"0"`. Un `+` o una comparación numérica directa sobre ellas miente.
 *
 *  2. LAS CLAVES NULAS NO VIENEN: Socrata OMITE el campo en vez de mandarlo
 *     en `null`. Las filas de los fixtures traen entre 49 y 55 de las 59
 *     columnas. Acceder por nombre a una ausente da `undefined` en silencio
 *     — es la misma forma del defecto de `experiencia_total_smmlv`. Por eso
 *     NINGÚN nombre de campo de SECOP se escribe suelto en este archivo:
 *     todos pasan por la tabla `CAMPO_SECOP`, y el chequeo `_TODOS_LOS_CAMPOS`
 *     del final hace que agregar una columna sin traducirla NO COMPILE.
 *
 *  3. `urlproceso` es una columna de tipo `url`: llega como objeto
 *     `{ "url": "..." }`, no como string. Y a veces apunta al LOGIN genérico
 *     (`.../STS/Users/Login/Index`) en vez de al proceso — caso real:
 *     `CO1.REQ.3026940`. Se mapea verbatim y se CUENTA, porque el valor del
 *     radar es que Karen pueda abrir el pliego.
 *
 *  4. CENTINELAS DE TEXTO en vez de nulos: `"No Definido"` aparece en
 *     `nit_del_proveedor_adjudicado` (2.483 de las 3.446 filas del segmento
 *     2025), en `nombre_del_proveedor`, en `ciudad_entidad` y hasta en
 *     `departamento_entidad` (2.545 filas de las familias de NEG). Guardar la
 *     cadena sería guardar basura con apariencia de dato.
 *
 *  5. `codigo_principal_de_categoria` puede ser `'UNSPECIFIED'` —> `null`.
 *     Y NO es un caso de borde: la categoría se asigna TARDE. En octubre de
 *     2026, Bogotá + Cundinamarca con las dos modalidades de ingesta tenía
 *     2.238 filas `UNSPECIFIED` contra 21 con código `V1.*`; en mayo de 2025
 *     (mes maduro) la proporción es la inversa: 539 contra 2.344. Un filtro
 *     por familia UNSPC a nivel de API no ve los procesos NUEVOS. De ahí la
 *     tri-estado `FamiliaRup`: `familia_neg` / `fuera_de_familia` /
 *     `sin_clasificar` — lo sin clasificar se triaja, no se tira.
 *
 *  6. `proveedores_que_manifestaron` ESTÁ EN CERO EN TODO EL DATASET
 *     (`max` = 0 y `sum` = 0 sobre las 29.354 filas del filtro de ingesta).
 *     NO se mapea: `manifestaciones` queda `null`, nunca `0`. Un 0 diría
 *     "nadie manifestó interés" cuando lo cierto es "el dato no existe", y
 *     `probabilidadSorteo` se calcularía sobre una mentira.
 *     `respuestas_al_procedimiento` SÍ sirve y es la que se usa.
 *
 *  7. FECHAS FLOTANTES SIN ZONA: `'2026-10-02T00:00:00.000'`. Se interpretan
 *     como hora civil de Colombia (UTC−05:00) y salen como instante ISO
 *     (`'2026-10-02T05:00:00.000Z'`). Leerlas como UTC correría la fecha un
 *     día hacia atrás en la pantalla de Karen. Se devuelve ISO, no
 *     `Timestamp`: el módulo es puro y no toca el SDK (mismo reparto que el
 *     importador histórico).
 *     Hay filas SIN fecha de publicación — 515 en el filtro de ingesta — y un
 *     `where fecha_de_publicacion_del > marca` las excluye PARA SIEMPRE. Acá
 *     entran con `publicacion: null` y cuentan como señal.
 *
 *  8. `precio_base` trae basura real: 568 filas en CERO, 3 NEGATIVAS (la peor,
 *     −$35.272.818) y una de $11.111.111.111.111.111 — veinte veces el
 *     presupuesto de la Nación. Cero, negativo y por encima del tope se
 *     mapean a `null` y se cuentan; el cero NO se confunde con el nulo en el
 *     reporte, porque "publicaron sin presupuesto" y "el dato es absurdo" son
 *     dos problemas distintos.
 *
 *  9. UNA FILA NO ES UN PROCESO. En el filtro de ingesta de 2025 hay 3.446
 *     filas para 3.169 `id_del_proceso` distintos: los procesos con varias
 *     adjudicaciones repiten la fila. Y lo que varía entre esas filas es el
 *     PRODUCTO CARTESIANO de proveedores × valores, no la pareja real:
 *     `CO1.REQ.8973433` (7 lotes) trae 28 filas = 4 proveedores × 7 valores;
 *     `CO1.REQ.8965019` (6 lotes) trae 20 = 4 × 5. La pareja
 *     (ganador, valor) de una fila cualquiera de un proceso multi-adjudicado
 *     ES INVENTADA. Por eso `colapsarPorProceso` solo fija ganador y oferta
 *     cuando el proceso colapsa a UN proveedor y UN valor; si no, los deja en
 *     `null` y marca `adjudicacion_ambigua`.
 *
 * 10. `referencia_del_proceso` NO ES IDENTIDAD: `'SAMC-001-2025'` la usan 42
 *     entidades distintas; `'MC-001-2025'`, 29. La identidad es
 *     `id_del_proceso`, y el doc id lleva sufijo de hash sobre ese valor —la
 *     lección del importador, donde el prefijo legible colapsaba puntuación y
 *     perdió 4 registros en silencio—. Además, la guarda en tiempo de
 *     ejecución CUENTA los ids únicos antes de escribir y aborta nombrando a
 *     los culpables.
 *
 * 11. MODALIDAD SIN TILDES: existe `'Seleccion Abreviada Menor Cuantia Sin
 *     Manifestacion Interes'` (4.817 filas en el dataset, 15 en el segmento
 *     2025). DECISIÓN: ENTRA, mapeada a `menor_cuantia`. Es menor cuantía sin
 *     manifestación de interés — es decir, sin sorteo de consolidación, que es
 *     justamente la variante con MEJORES probabilidades para NEG. Cae en rojo
 *     por modalidad igual que la otra menor cuantía, así que no inunda la
 *     bandeja: queda detrás del portero. Se activa con la constante
 *     `MODALIDADES_INGESTA` de `secopConsulta.ts` — revertirla es una línea.
 *
 * ── B.1b ────────────────────────────────────────────────────────────────────
 *
 * 12. `fecha_de_ultima_publicaci` NO SIRVE DE RESPALDO DE FECHA. De las 3.785
 *     filas del territorio sin `fecha_de_publicacion_del`, las que tienen
 *     `fecha_de_ultima_publicaci` son **CERO**. Lo que sí existe:
 *     `fecha_de_recepcion_de` en 2.859 (75,5 %) y `fecha_adjudicacion` en 806.
 *     Quedan 926 sin NINGUNA fecha utilizable — esas entran MARCADAS
 *     (`origen_fecha: 'ninguna'`), nunca desaparecidas.
 *     La cadena es: publicación -> recepción de ofertas -> marcada.
 *
 * 13. CLASIFICACIÓN HÍBRIDA: el código manda cuando existe, el texto habla
 *     cuando no. Cuatro casos (B.1b):
 *       código en familia              -> `si`        (confianza alta)
 *       código presente y fuera        -> `no`
 *       sin código y el texto coincide -> `probable`  (lectura humana)
 *       sin código y el texto no       -> `no`
 *     Solo `si` y `probable` se persisten; los `no` se CUENTAN. Y el conteo
 *     incluye `descartados_con_texto_coincidente`: los que el código descartó
 *     aunque el léxico sí los reconoce. No es un detalle — de los 23 procesos
 *     que NEG ganó, 3 tienen código presente y FUERA de las tres familias
 *     (adecuación de ambientes, ferretería, subestación eléctrica) y el texto
 *     coincide en 2 de los 3. Ese contador es la medida de lo que la regla
 *     está dejando pasar.
 *
 * 14. `fecha_de_recepcion_de` ES EL CIERRE, verificado: cae 4–13 días después
 *     de la publicación y coincide con la apertura de respuestas en las
 *     mínimas cuantías. 618 filas del territorio la tienen ANTES de la
 *     publicación — inconsistencia del origen; se mapea verbatim y el
 *     cronograma queda con las dos fechas, sin corregir ninguna a mano.
 */
import type {
  GanadorLicitacion, ModalidadLicitacion, MotivoSemaforo, Semaforo,
} from '../../types/sigp/licitacion'
import { calcularSemaforo, esTerritorioNeg } from './semaforo'
import type { EntradaSemaforo } from './semaforo'
import {
  coincideVocabulario, TERMINOS_NEG, VOCABULARIO_NEG_VERSION,
} from '../../types/sigp/vocabularioNeg'

// ── Las 59 columnas del dataset ──────────────────────────────────────────────
// Transcritas del encabezado `X-SODA2-Fields` de una respuesta real (no a
// mano: generadas del header). El comentario es el tipo que declara
// `X-SODA2-Types` — recordatorio de que `number` NO significa número en el
// JSON (trampa 1).

export const CAMPOS_SECOP = [
  'entidad',                           // text
  'nit_entidad',                       // text
  'departamento_entidad',              // text
  'ciudad_entidad',                    // text
  'ordenentidad',                      // text
  'codigo_pci',                        // text
  'id_del_proceso',                    // text
  'referencia_del_proceso',            // text
  'ppi',                               // text
  'id_del_portafolio',                 // text
  'nombre_del_procedimiento',          // text
  'descripci_n_del_procedimiento',     // text
  'fase',                              // text
  'fecha_de_publicacion_del',          // floating_timestamp
  'fecha_de_ultima_publicaci',         // floating_timestamp
  'fecha_de_publicacion_fase',         // floating_timestamp
  'fecha_de_publicacion_fase_1',       // floating_timestamp
  'fecha_de_publicacion',              // floating_timestamp
  'fecha_de_publicacion_fase_2',       // floating_timestamp
  'fecha_de_publicacion_fase_3',       // floating_timestamp
  'precio_base',                       // number
  'modalidad_de_contratacion',         // text
  'justificaci_n_modalidad_de',        // text
  'duracion',                          // number
  'unidad_de_duracion',                // text
  'fecha_de_recepcion_de',             // floating_timestamp
  'fecha_de_apertura_de_respuesta',    // floating_timestamp
  'fecha_de_apertura_efectiva',        // floating_timestamp
  'ciudad_de_la_unidad_de',            // text
  'nombre_de_la_unidad_de',            // text
  'proveedores_invitados',             // number
  'proveedores_con_invitacion',        // number
  'visualizaciones_del',               // number
  'proveedores_que_manifestaron',      // number
  'respuestas_al_procedimiento',       // number
  'respuestas_externas',               // number
  'conteo_de_respuestas_a_ofertas',    // number
  'proveedores_unicos_con',            // number
  'numero_de_lotes',                   // number
  'estado_del_procedimiento',          // text
  'id_estado_del_procedimiento',       // number
  'adjudicado',                        // text
  'id_adjudicacion',                   // text
  'codigoproveedor',                   // text
  'departamento_proveedor',            // text
  'ciudad_proveedor',                  // text
  'fecha_adjudicacion',                // floating_timestamp
  'valor_total_adjudicacion',          // number
  'nombre_del_adjudicador',            // text
  'nombre_del_proveedor',              // text
  'nit_del_proveedor_adjudicado',      // text
  'codigo_principal_de_categoria',     // text
  'estado_de_apertura_del_proceso',    // text
  'tipo_de_contrato',                  // text
  'subtipo_de_contrato',               // text
  'categorias_adicionales',            // text
  'urlproceso',                        // url
  'codigo_entidad',                    // number
  'estado_resumen',                    // text
] as const

export type CampoSecop = typeof CAMPOS_SECOP[number]

/**
 * Fila cruda de la API. Los valores son `unknown` A PROPÓSITO: el tipo no
 * puede prometer `string` cuando la columna `urlproceso` llega como objeto y
 * cualquier campo puede venir ausente (trampas 2 y 3). Todo acceso pasa por
 * los lectores de abajo, que validan antes de convertir.
 */
export type FilaSecop = { readonly [K in CampoSecop]?: unknown }

// ── La tabla de traducción: el único lugar con nombres de SECOP ──────────────

/** Destinos de nuestro modelo que se alimentan de SECOP. */
export type DestinoMapeado =
  | 'id_secop'
  | 'numero_proceso'
  | 'entidad.nombre'
  | 'entidad.nit'
  | 'entidad.departamento'
  | 'entidad.ciudad'
  | 'entidad.orden'
  | 'objeto'
  | 'categoria_unspsc'
  | 'modalidad'
  | 'presupuesto_oficial'
  | 'lotes'
  | 'cronograma.publicacion'
  | 'cronograma.cierre'
  | 'url_proceso'
  | 'ofertas_recibidas'
  | 'ganador.nit'
  | 'ganador.nombre'
  | 'oferta_ganador'

/**
 * Traducción EXPLÍCITA, en un solo sentido legible: nuestro campo <- campo de
 * SECOP. El `satisfies` hace dos trabajos a la vez:
 *  · `Record<DestinoMapeado, …>` exige que TODO destino tenga su fuente — un
 *    campo nuevo del modelo sin traducción no compila.
 *  · `…, CampoSecop>` exige que la fuente EXISTA en el dataset — un nombre
 *    mal tecleado no compila, en vez de devolver `undefined` en silencio.
 */
export const CAMPO_SECOP = {
  id_secop: 'id_del_proceso',
  numero_proceso: 'referencia_del_proceso',
  'entidad.nombre': 'entidad',
  'entidad.nit': 'nit_entidad',
  'entidad.departamento': 'departamento_entidad',
  'entidad.ciudad': 'ciudad_entidad',
  'entidad.orden': 'ordenentidad',
  objeto: 'descripci_n_del_procedimiento',
  categoria_unspsc: 'codigo_principal_de_categoria',
  modalidad: 'modalidad_de_contratacion',
  presupuesto_oficial: 'precio_base',
  lotes: 'numero_de_lotes',
  'cronograma.publicacion': 'fecha_de_publicacion_del',
  // Verificado contra el dato (B.1b): es la fecha de RECEPCIÓN DE OFERTAS, o
  // sea el cierre — cae entre 4 y 13 días después de la publicación y coincide
  // con `fecha_de_apertura_de_respuesta` en las mínimas cuantías. Es además el
  // respaldo de fecha cuando no hay publicación (trampa 12).
  'cronograma.cierre': 'fecha_de_recepcion_de',
  url_proceso: 'urlproceso',
  ofertas_recibidas: 'respuestas_al_procedimiento',
  'ganador.nit': 'nit_del_proveedor_adjudicado',
  'ganador.nombre': 'nombre_del_proveedor',
  oferta_ganador: 'valor_total_adjudicacion',
} as const satisfies Record<DestinoMapeado, CampoSecop>

/**
 * Las otras 41 columnas, cada una con el motivo de NO mapearla. No es
 * documentación decorativa: el chequeo de exhaustividad del final exige que
 * cada columna del dataset esté mapeada O justificada acá.
 *
 * `Partial<Record<CampoSecop, string>>` impide justificar un campo inventado.
 */
export const CAMPOS_NO_MAPEADOS: Partial<Record<CampoSecop, string>> = {
  proveedores_que_manifestaron:
    'EN CERO EN TODO EL DATASET (max=0, sum=0 sobre 29.354 filas del filtro). '
    + 'Mapearlo pondría un 0 donde la verdad es "no se sabe" y falsearía '
    + 'probabilidadSorteo(). `manifestaciones` se captura a mano al presentar.',
  codigo_pci: 'Clasificador interno de la entidad; sin uso en el radar.',
  ppi: 'Marca de proyecto de inversión; sin uso en el radar.',
  id_del_portafolio: 'Agrupador interno de SECOP.',
  nombre_del_procedimiento: 'Título corto; el objeto contratado va en descripci_n_del_procedimiento.',
  fase: 'Fase del flujo de SECOP; el estado del radar es el nuestro (nace detectada).',
  fecha_de_ultima_publicaci: 'Reservado para el bloque de re-lectura (detectar cambios del pliego).',
  fecha_de_publicacion_fase: 'Fecha de fase intermedia; el cronograma del radar se arma en su bloque.',
  fecha_de_publicacion_fase_1: 'Ídem.',
  fecha_de_publicacion: 'Ídem — no confundir con fecha_de_publicacion_del (trampa de nombre).',
  fecha_de_publicacion_fase_2: 'Ídem.',
  fecha_de_publicacion_fase_3: 'Ídem.',
  justificaci_n_modalidad_de: 'Texto jurídico de la modalidad; no alimenta ninguna decisión del semáforo.',
  duracion: 'Plazo de ejecución; entra cuando el radar evalúe capacidad, no ahora.',
  unidad_de_duracion: 'Unidad del anterior.',
  fecha_de_apertura_de_respuesta:
    'Apertura de ofertas. Coincide con fecha_de_recepcion_de en las mínimas '
    + 'cuantías y existe en 2.860 de las 3.785 filas sin publicación — casi las '
    + 'mismas que la de recepción. Con una basta para el respaldo de fecha; dos '
    + 'fuentes para el mismo hito son dos cosas que pueden divergir.',
  fecha_de_apertura_efectiva: 'Ídem.',
  ciudad_de_la_unidad_de: 'Unidad de contratación; la geografía del radar es la de la entidad.',
  nombre_de_la_unidad_de: 'Ídem.',
  proveedores_invitados: 'Solo tiene sentido en procesos por invitación.',
  proveedores_con_invitacion: 'Ídem.',
  visualizaciones_del: 'Métrica de la plataforma, no del proceso.',
  respuestas_externas: 'Respuestas por fuera de SECOP II; no comparable con ofertas_recibidas.',
  conteo_de_respuestas_a_ofertas: 'Observaciones a las ofertas, no ofertas.',
  proveedores_unicos_con: 'Derivado de la plataforma; ofertas_recibidas es la medida que se validó.',
  estado_del_procedimiento: 'Estado de SECOP; el del radar nace en detectada y lo mueve NEG.',
  id_estado_del_procedimiento: 'Ídem, en numérico.',
  adjudicado: 'Si/No — se usa como señal interna del colapso, no se persiste: '
    + 'el estado del radar lo decide NEG, y "adjudicado a otro" no es un estado nuestro.',
  id_adjudicacion: 'Id del acto de adjudicación; en multi-adjudicación se repite y no desambigua.',
  codigoproveedor: 'Código interno del proveedor ganador.',
  departamento_proveedor: 'Geografía del ganador; el radar filtra por la entidad.',
  ciudad_proveedor: 'Ídem.',
  fecha_adjudicacion: 'CANDIDATA a cronograma.adjudicacion en un bloque posterior.',
  nombre_del_adjudicador: 'Funcionario que adjudicó; dato personal sin uso (Ley 1581).',
  estado_de_apertura_del_proceso: 'Estado de la apertura en la plataforma.',
  tipo_de_contrato: 'Tipología jurídica; el radar discrimina por categoría UNSPC.',
  subtipo_de_contrato: 'Ídem.',
  categorias_adicionales: 'Categorías secundarias; la familia se decide por la principal.',
  codigo_entidad: 'Código interno de la entidad; el NIT es la identidad.',
  estado_resumen: 'Resumen de la fase; ver `fase`.',
}

/**
 * Exhaustividad EN TIEMPO DE COMPILACIÓN: toda columna del dataset está
 * mapeada o justificada. Si mañana SECOP agrega una columna y alguien la
 * suma a `CAMPOS_SECOP` sin darle destino ni motivo, este `const` no compila
 * y el error NOMBRA las que faltan.
 */
type CamposTraducidos = typeof CAMPO_SECOP[DestinoMapeado]
type CamposJustificados = keyof typeof CAMPOS_NO_MAPEADOS
type CamposDocumentados = CamposTraducidos | CamposJustificados
type FaltanPorDocumentar = Exclude<CampoSecop, CamposDocumentados>
const _TODOS_LOS_CAMPOS: [FaltanPorDocumentar] extends [never] ? true
  : ['columnas de SECOP sin destino ni motivo:', FaltanPorDocumentar] = true
void _TODOS_LOS_CAMPOS

// ── Lectores: nada entra sin pasar por acá ───────────────────────────────────

/** Centinelas que SECOP usa en vez de dejar el campo vacío (trampa 4). */
export const CENTINELAS_SECOP = ['NO DEFINIDO', 'NO DEFINIDA', 'N/A', 'NA', 'SIN DEFINIR'] as const

/** MAYÚSCULAS, sin tildes, espacios colapsados. */
export function norm(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/** Texto tal cual, espacios colapsados. `''` si falta. */
export function texto(fila: FilaSecop, campo: CampoSecop): string {
  const v = fila[campo]
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return ''
  return String(v).replace(/\s+/g, ' ').trim()
}

/** Como `texto`, pero los centinelas y el vacío son `null` (trampa 4). */
export function textoONull(fila: FilaSecop, campo: CampoSecop): string | null {
  const s = texto(fila, campo)
  if (s === '') return null
  if ((CENTINELAS_SECOP as readonly string[]).includes(norm(s))) return null
  return s
}

/**
 * Número desde el string del alambre (trampa 1). `null` para ausente, vacío,
 * centinela y cualquier cosa que no sea número finito. No acepta separadores
 * de miles: el dataset no los usa y aceptarlos abriría la puerta a
 * interpretar '1.200' como 1200 o como 1,2.
 */
export function numeroSecop(fila: FilaSecop, campo: CampoSecop): number | null {
  const v = fila[campo]
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Tope de cordura del presupuesto (trampa 8). Diez billones de pesos: más que
 * cualquier contrato estatal colombiano y muy por debajo del caso real
 * encontrado ($11.111.111.111.111.111). Por encima es error de digitación,
 * no un presupuesto.
 */
export const TOPE_PRESUPUESTO_COP = 1e13

export type ProblemaPresupuesto = 'ausente' | 'cero' | 'negativo' | 'absurdo' | null

/** Clasifica el presupuesto ANTES de decidir si se guarda (trampa 8). */
export function problemaPresupuesto(n: number | null): ProblemaPresupuesto {
  if (n === null) return 'ausente'
  if (n < 0) return 'negativo'
  if (n === 0) return 'cero'
  if (n > TOPE_PRESUPUESTO_COP) return 'absurdo'
  return null
}

/** Desfase horario de Colombia: sin horario de verano desde 1993 (trampa 7). */
export const OFFSET_COLOMBIA_HORAS = -5

/**
 * Fecha flotante de Socrata (`'2026-10-02T00:00:00.000'`, sin zona) al
 * instante ISO equivalente en hora civil de Colombia. `null` si falta o no
 * tiene la forma esperada — NUNCA lanza, y nunca inventa un instante a partir
 * de algo que no se entendió.
 */
export function fechaSecopAIso(fila: FilaSecop, campo: CampoSecop): string | null {
  const s = texto(fila, campo)
  if (s === '') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?)?$/.exec(s)
  if (!m) return null
  const [a, mes, dia] = [+m[1], +m[2], +m[3]]
  const [hh, mm, ss] = [+(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)]
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  if (hh > 23 || mm > 59 || ss > 59) return null
  if (a < 1990 || a > 2099) return null
  // Fechas que NO EXISTEN (31 de febrero): `Date.UTC` las desborda al mes
  // siguiente en silencio — '2026-02-31' saldría como 3 de marzo. Se verifica
  // el viaje de ida y vuelta de la fecha civil ANTES de aplicar el desfase.
  const civil = new Date(Date.UTC(a, mes - 1, dia))
  if (civil.getUTCFullYear() !== a || civil.getUTCMonth() !== mes - 1
      || civil.getUTCDate() !== dia) return null
  const d = new Date(Date.UTC(a, mes - 1, dia, hh - OFFSET_COLOMBIA_HORAS, mm, ss))
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** De dónde salió la fecha con la que se ubica el proceso en el tiempo. */
export type OrigenFecha = 'publicacion' | 'recepcion_de_ofertas' | 'ninguna'

export interface FechaReferencia {
  /** ISO con zona, o `null` si el origen no trae ninguna fecha utilizable. */
  iso: string | null
  origen: OrigenFecha
}

/**
 * Fecha con la que el proceso se ubica en el tiempo (trampa 12).
 *
 * Cadena medida, no supuesta: `fecha_de_publicacion_del` ->
 * `fecha_de_recepcion_de` -> nada. `fecha_de_ultima_publicaci`, que parecía
 * el respaldo natural, está vacía en TODAS las filas sin publicación (0 de
 * 3.785), así que no entra en la cadena: un respaldo que nunca tiene dato es
 * peor que no tenerlo, porque se cita como si existiera.
 *
 * Las 926 filas que no tienen ninguna de las dos entran con
 * `origen: 'ninguna'` y el mapeo las marca. Desaparecer no es una opción.
 */
export function fechaReferencia(fila: FilaSecop): FechaReferencia {
  const pub = fechaSecopAIso(fila, CAMPO_SECOP['cronograma.publicacion'])
  if (pub !== null) return { iso: pub, origen: 'publicacion' }
  const rec = fechaSecopAIso(fila, CAMPO_SECOP['cronograma.cierre'])
  if (rec !== null) return { iso: rec, origen: 'recepcion_de_ofertas' }
  return { iso: null, origen: 'ninguna' }
}

/** URL de la columna `url` de Socrata, que llega como objeto (trampa 3). */
export function urlSecop(fila: FilaSecop, campo: CampoSecop): string {
  const v = fila[campo]
  if (typeof v === 'string') return v.trim()
  if (v && typeof v === 'object' && 'url' in v) {
    const u = (v as { url?: unknown }).url
    return typeof u === 'string' ? u.trim() : ''
  }
  return ''
}

/**
 * ¿La URL apunta al proceso o al login genérico de SECOP? (trampa 3). No
 * cambia el valor mapeado — la fidelidad manda — pero se cuenta, porque una
 * ficha sin enlace al pliego no sirve para decidir.
 */
export function esUrlGenerica(url: string): boolean {
  if (url === '') return true
  return !/noticeUID=|OpportunityDetail/i.test(url)
}

// ── Categoría UNSPC y familias del RUP de NEG ───────────────────────────────

/**
 * Familias UNSPC donde NEG tiene adjudicaciones en su RUP:
 *  · 7210 — servicios de apoyo y mantenimiento
 *  · 7215 — servicios eléctricos, albañilería, pintura y pisos
 *  · 8110 — servicios de ingeniería civil, mecánica y eléctrica
 */
export const FAMILIAS_RUP_NEG = ['V1.7210', 'V1.7215', 'V1.8110'] as const

/**
 * CLASES —no familias— con ADJUDICACIÓN PROBADA de NEG (B.1c).
 *
 * ── EL CRITERIO DE INCLUSIÓN, ESCRITO ──────────────────────────────────────
 *
 * Una clase UNSPC entra acá **cuando tiene una adjudicación probada de NEG en
 * SECOP II**. No por parecido semántico, no porque "suena a lo que hacemos":
 * por evidencia. Quien quiera agregar una clase tiene que poder nombrar el
 * proceso que NEG ganó bajo ese código.
 *
 * Y entra A NIVEL DE CLASE (6 dígitos), no de segmento (2) ni de familia (4).
 * El segmento completo trae el sector entero: medido el 09-nov-2026 sobre el
 * territorio, los segmentos 30, 31 y 83 completos habrían agregado 532
 * procesos en 2025 (+17 % sobre los «si») y 4.187 en el histórico; las tres
 * CLASES agregan 69 en 2025 (**+2,2 %**) y 550 en el histórico (+2,0 %). Ocho
 * veces menos, por la misma evidencia.
 *
 * Las tres, con el proceso que las acredita:
 *  · 301717 — vidrio, carpintería y divisiones.  `V1.30171706`, "adecuación de
 *    ambientes para programas formativos" (SENA). 3 procesos en 2025.
 *  · 311628 — ferretería y materiales.  `V1.31162800`, "suministrar elementos
 *    de ferretería para las adecuaciones de los edificios de la Facultad de
 *    Ingeniería". 54 en 2025 — el 78 % del delta; 30 de esos 54 coinciden
 *    además con el léxico (son ferretería PARA mantenimiento).
 *  · 831018 — servicios eléctricos.  `V1.83101800`, "mantenimiento correctivo
 *    y preventivo de la subestación eléctrica". 12 en 2025.
 *
 * El veredicto que producen se marca con su propia señal
 * (`codigo_en_clase_adjudicada`), así que el aporte de esta decisión se puede
 * medir corrida por corrida en vez de quedar diluido en los «si».
 */
export const CLASES_CON_ADJUDICACION_NEG = [
  'V1.301717', 'V1.311628', 'V1.831018',
] as const

/** El catálogo completo con el que se reconoce un código como de NEG. */
export const CATALOGO_UNSPC_NEG = {
  familias: FAMILIAS_RUP_NEG,
  clases: CLASES_CON_ADJUDICACION_NEG,
} as const

export const CATEGORIA_SIN_CLASIFICAR = 'UNSPECIFIED'

export type FamiliaRup = 'familia_neg' | 'fuera_de_familia' | 'sin_clasificar'

/** `'UNSPECIFIED'` y los centinelas van a `null` (trampa 5). */
export function categoriaONull(fila: FilaSecop): string | null {
  const s = textoONull(fila, CAMPO_SECOP.categoria_unspsc)
  if (s === null) return null
  if (norm(s) === CATEGORIA_SIN_CLASIFICAR) return null
  return s
}

/**
 * Tri-estado (trampa 5). `sin_clasificar` NO es lo mismo que
 * `fuera_de_familia`: el primero es "SECOP todavía no le puso código" —el
 * estado normal de un proceso recién publicado— y el segundo es un no
 * medido. Confundirlos deja al radar ciego justo en la ventana en la que
 * todavía se puede presentar.
 */
/**
 * Por qué un código se reconoce como de NEG: por familia del RUP (4 dígitos) o
 * por clase con adjudicación probada (6 dígitos). `null` = no se reconoce.
 */
export type OrigenCodigoNeg = 'familia' | 'clase' | null

export function origenCodigoNeg(categoria: string | null): OrigenCodigoNeg {
  if (categoria === null) return null
  const c = norm(categoria)
  if (FAMILIAS_RUP_NEG.some(f => c.startsWith(norm(f)))) return 'familia'
  if (CLASES_CON_ADJUDICACION_NEG.some(k => c.startsWith(norm(k)))) return 'clase'
  return null
}

export function familiaRup(categoria: string | null): FamiliaRup {
  if (categoria === null) return 'sin_clasificar'
  return origenCodigoNeg(categoria) !== null ? 'familia_neg' : 'fuera_de_familia'
}

// ── Clasificación híbrida: código arriba, texto abajo (trampa 13) ───────────

/** Qué se hace con el proceso. Solo `si` y `probable` se persisten. */
export type VeredictoRadar = 'si' | 'probable' | 'no'

/** Qué señal produjo el veredicto. Un veredicto sin señal no es auditable. */
export type SenalClasificacion =
  | 'codigo_en_familia'
  /** Clase con adjudicación probada Y el objeto habla del trabajo de NEG. */
  | 'codigo_en_clase_con_texto'
  /**
   * Clase con adjudicación probada pero el léxico NO reconoce el objeto: los
   * 24 de ferretería pura de 2025. Entran por EVIDENCIA (NEG ganó bajo ese
   * código), no porque el texto lo diga, así que llevan señal aparte y el
   * reporte de cada corrida los separa — para que en tres meses se pueda ver
   * si alguno se trabajó o si entraron para nada.
   */
  | 'codigo_en_clase_sin_texto'
  | 'codigo_fuera_de_familia'
  | 'texto_coincide'
  | 'sin_codigo_ni_texto'
  | 'fuera_de_territorio'

/**
 * Departamentos que NO entran a la bandeja pero SÍ se cuentan (B.1c).
 *
 * NEG ganó en Antioquia y Boyacá, así que la pregunta "¿deberíamos abrirlos?"
 * es legítima. La respuesta de hoy es NO, y está medida, no intuida: el 24 %
 * de los descartes del registro de Karen son limitación territorial MiPyme, su
 * regla de logística mata la mayoría de lo de afuera, y SOLTEC multiplicó por
 * 17 su facturación sin salir de Bogotá. Profundidad antes que amplitud.
 *
 * Pero una decisión así tiene que ser revisable con número: estos procesos se
 * clasifican igual, se marcan `fuera_de_territorio` con `habria_calificado`, y
 * el agregado de la corrida los cuenta con muestra.
 *
 * ── EL UMBRAL DE REVISIÓN ───────────────────────────────────────────────────
 *
 * ⚠ **El conteo bruto NO es el umbral.** Referencia medida al fijar esto
 * (09-nov-2026): en 2025 Antioquia + Boyacá tuvieron **1.696 procesos
 * reconocidos por código** en las modalidades de ingesta, más 1.600 sin
 * clasificar. O sea que este contador va a reportar **millares al año, no
 * centenas**, y cruzaría cualquier umbral de conteo bruto en la primera semana
 * sin decir nada útil.
 *
 * El umbral se expresa sobre algo **más fino que el conteo**: cuántos de esos
 * procesos NEG habría podido GANAR y ATENDER. Dos formas medibles, en orden de
 * preferencia:
 *
 *  1. **Adjudicables**: de los que habrían calificado, cuántos terminaron
 *     adjudicados a un proveedor de perfil comparable al de NEG —tamaño de
 *     contrato y tipo de trabajo— en vez de a un actor local grande. El
 *     dataset trae `nit_del_proveedor_adjudicado` y `valor_total_adjudicacion`,
 *     así que es una consulta, no una encuesta.
 *  2. **Ganados por competidores comparables**: los mismos NIT que hoy le
 *     ganan a NEG en Bogotá, apareciendo allá. Si los competidores que NEG ya
 *     enfrenta están facturando en Antioquia, la pregunta cambia de naturaleza.
 *
 * Mientras no haya una de esas dos medidas, el contador sirve para VER, no para
 * decidir. Lo que lo haría revisable es que la medida fina muestre volumen
 * adjudicable sostenido, no que el conteo bruto sea grande — ya sabemos que lo
 * es, y la decisión se tomó igual porque la restricción real es la capacidad de
 * atender, no la de encontrar.
 */
export const DEPARTAMENTOS_OBSERVADOS = ['Antioquia', 'Boyacá'] as const

export interface Clasificacion {
  veredicto: VeredictoRadar
  senal: SenalClasificacion
  familia: FamiliaRup
  /** Por familia del RUP o por clase con adjudicación probada. */
  origen_codigo: OrigenCodigoNeg
  /** Términos del léxico encontrados en el objeto. Vacío si no se consultó. */
  terminos: string[]
  /**
   * `true` cuando el CÓDIGO descartó un proceso cuyo TEXTO sí reconoce el
   * léxico. Es el contador que mide lo que la regla está dejando pasar: de los
   * 23 procesos que NEG ganó, 3 caen acá — y por eso tres CLASES entraron.
   */
  descartado_con_texto_coincidente: boolean
  /**
   * `true` si el proceso está en un departamento OBSERVADO y habría calificado
   * de estar en el territorio. Mismo instrumento que el contador de arriba,
   * aplicado a la frontera geográfica.
   */
  habria_calificado: boolean
  /**
   * La señal que el proceso TENÍA antes de que el territorio lo dejara afuera.
   * Se conserva en vez de re-derivarse: re-derivar es una segunda
   * implementación de la misma decisión, y las dos pueden divergir.
   */
  senal_previa?: SenalClasificacion
}

/**
 * Clasifica un proceso con las dos señales.
 *
 * El código UNSPC MANDA cuando existe —es un dato estructurado, declarado por
 * la entidad— y el texto solo habla cuando no hay código, que es el caso
 * normal de lo recién publicado. El orden no es negociable: si el texto pudiera
 * sobreponerse al código, un "mantenimiento de software" entraría por la
 * palabra MANTENIMIENTO.
 *
 * `terminos` se inyecta para que el léxico pueda venir del documento de
 * configuración o del paquete, sin que este módulo sepa de dónde.
 */
export function clasificarProceso(
  categoria: string | null,
  objeto: string | null | undefined,
  terminos: readonly string[],
  contexto?: { departamento?: string },
): Clasificacion {
  const familia = familiaRup(categoria)
  const origen_codigo = origenCodigoNeg(categoria)
  const { coincide, terminos: hallados } = coincideVocabulario(objeto, terminos)

  const base = { familia, origen_codigo, habria_calificado: false }
  let v: Clasificacion

  if (familia === 'familia_neg') {
    v = {
      ...base,
      veredicto: 'si',
      // Tres señales distintas y no una: familia del RUP, clase con el texto
      // de acuerdo, y clase SIN que el texto diga nada (los de ferretería
      // pura, que entran por evidencia). Así el aporte de cada decisión se
      // mide por separado corrida por corrida.
      senal: origen_codigo === 'clase'
        ? (coincide ? 'codigo_en_clase_con_texto' : 'codigo_en_clase_sin_texto')
        : 'codigo_en_familia',
      terminos: hallados,
      descartado_con_texto_coincidente: false,
    }
  } else if (familia === 'fuera_de_familia') {
    v = {
      ...base,
      veredicto: 'no',
      senal: 'codigo_fuera_de_familia',
      terminos: hallados,
      descartado_con_texto_coincidente: coincide,
    }
  } else if (coincide) {
    // Sin código: el texto es la única señal.
    v = {
      ...base,
      veredicto: 'probable',
      senal: 'texto_coincide',
      terminos: hallados,
      descartado_con_texto_coincidente: false,
    }
  } else {
    v = {
      ...base,
      veredicto: 'no',
      senal: 'sin_codigo_ni_texto',
      terminos: [],
      descartado_con_texto_coincidente: false,
    }
  }

  // ── La frontera geográfica se aplica DESPUÉS, y deja huella ──
  // El orden importa: primero se decide si el proceso califica por lo que es,
  // y solo entonces el territorio lo deja afuera. Al revés no habría nada que
  // contar — y lo que se cuenta es exactamente "qué estamos dejando pasar".
  const depto = contexto?.departamento
  if (depto !== undefined && depto !== '' && !esTerritorioNeg(depto)) {
    return {
      ...v,
      veredicto: 'no',
      senal: 'fuera_de_territorio',
      senal_previa: v.senal,
      habria_calificado: sePersiste(v.veredicto),
    }
  }
  return v
}

/** ¿Es un departamento de los que se observan sin abrir? */
export function esDepartamentoObservado(departamento: string): boolean {
  const n = norm(departamento)
  return DEPARTAMENTOS_OBSERVADOS.some(d => norm(d) === n)
}

/** Veredictos que producen documento. El resto se cuenta y se tira. */
export const VEREDICTOS_PERSISTIBLES: readonly VeredictoRadar[] = ['si', 'probable']

export const sePersiste = (v: VeredictoRadar): boolean =>
  (VEREDICTOS_PERSISTIBLES as readonly string[]).includes(v)

// ── Modalidad ────────────────────────────────────────────────────────────────

/**
 * Las 17 modalidades que existen en el dataset, medidas con un `group by`
 * sobre la colección completa el 09-nov-2026 (con su volumen):
 *
 *   Contratación directa 4.237.176 · Contratación régimen especial 3.727.856 ·
 *   Mínima cuantía 433.767 · Selección Abreviada de Menor Cuantía 235.373 ·
 *   Selección abreviada subasta inversa 213.442 · Solicitud de información a
 *   los Proveedores 175.128 · Contratación régimen especial (con ofertas)
 *   138.280 · Contratación Directa (con ofertas) 123.826 · Licitación pública
 *   63.723 · Concurso de méritos abierto 43.852 · Licitación pública Obra
 *   Publica 32.045 · Licitación Pública Acuerdo Marco de Precios 11.249 ·
 *   Seleccion Abreviada Menor Cuantia Sin Manifestacion Interes 4.817 ·
 *   Subasta de prueba 4.791 · Enajenación de bienes con subasta 926 ·
 *   Enajenación de bienes con sobre cerrado 855 · Concurso de méritos con
 *   precalificación 55.
 *
 * El mapa se indexa por el texto NORMALIZADO para que una tilde perdida no
 * cambie el veredicto (SECOP no es consistente: la variante sin tildes de la
 * trampa 11 es el caso probado).
 */
export const MODALIDAD_SECOP: Record<string, ModalidadLicitacion> = {
  'MINIMA CUANTIA': 'minima_cuantia',
  'SELECCION ABREVIADA DE MENOR CUANTIA': 'menor_cuantia',
  // Trampa 11: menor cuantía SIN manifestación de interés — entra.
  'SELECCION ABREVIADA MENOR CUANTIA SIN MANIFESTACION INTERES': 'menor_cuantia',
  'SELECCION ABREVIADA SUBASTA INVERSA': 'seleccion_abreviada',
  'LICITACION PUBLICA': 'licitacion_publica',
  'LICITACION PUBLICA OBRA PUBLICA': 'licitacion_publica',
  'LICITACION PUBLICA ACUERDO MARCO DE PRECIOS': 'licitacion_publica',
  'CONTRATACION REGIMEN ESPECIAL': 'regimen_especial',
  'CONTRATACION REGIMEN ESPECIAL (CON OFERTAS)': 'regimen_especial',
  // Las que no tienen equivalente en el vocabulario del módulo caen en 'otra'
  // de forma EXPLÍCITA, no por el fallback: así se distingue "no aplica" de
  // "apareció una modalidad nueva y nadie la vio".
  'CONTRATACION DIRECTA': 'otra',
  'CONTRATACION DIRECTA (CON OFERTAS)': 'otra',
  'CONCURSO DE MERITOS ABIERTO': 'otra',
  'CONCURSO DE MERITOS CON PRECALIFICACION': 'otra',
  'SOLICITUD DE INFORMACION A LOS PROVEEDORES': 'otra',
  'SUBASTA DE PRUEBA': 'otra',
  'ENAJENACION DE BIENES CON SUBASTA': 'otra',
  'ENAJENACION DE BIENES CON SOBRE CERRADO': 'otra',
}

export interface ResultadoModalidad {
  modalidad: ModalidadLicitacion
  /** Texto exacto del origen, para auditar. */
  crudo: string
  /** `true` si el texto no está en el mapa: cae en 'otra' y se reporta. */
  imprevista: boolean
}

export function mapearModalidadSecop(fila: FilaSecop): ResultadoModalidad {
  const crudo = texto(fila, CAMPO_SECOP.modalidad)
  const conocida = MODALIDAD_SECOP[norm(crudo)]
  return conocida !== undefined
    ? { modalidad: conocida, crudo, imprevista: false }
    : { modalidad: 'otra', crudo, imprevista: true }
}

// ── Doc id libre de colisión ─────────────────────────────────────────────────

/**
 * Doc id determinístico de un proceso de SECOP.
 *
 * ⚠ EL PREFIJO LEGIBLE NO ES IDENTIDAD — misma lección que `docIdHistorico`:
 * colapsa toda la puntuación a `_`, así que dos `id_del_proceso` distintos
 * podrían compartir prefijo. El sufijo es el hash del id EXACTO, de modo que
 * el id sigue siendo determinístico (re-ingerir ACTUALIZA, no duplica) pero
 * dos procesos distintos jamás caen en el mismo documento.
 *
 * `hash` se inyecta porque este módulo es puro y no importa `node:crypto`.
 */
export function docIdSecop(idProceso: string, hash: (s: string) => string): string {
  const legible = idProceso
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100)
  return `secop_${legible}_${hash(idProceso.trim())}`
}

// ── Colapso de filas a procesos (trampa 9) ───────────────────────────────────

export interface GanadorSecop {
  nombre: string
  nit: string | null
}

export interface ProcesoColapsado {
  id_secop: string
  /** Fila representante: la primera del grupo, para los campos estables. */
  representante: FilaSecop
  /** Cuántas filas trajo la API para este proceso. */
  filas: number
  /** Parejas (nit, nombre) distintas vistas en el grupo. */
  proveedores: number
  /** Valores de adjudicación distintos vistos en el grupo. */
  valores: number
  /**
   * Ganador SOLO si el proceso colapsa a un proveedor y un valor. Con varias
   * adjudicaciones la pareja de cualquier fila es un producto cartesiano
   * (trampa 9): preferimos no saber a inventar.
   */
  ganador: GanadorSecop | null
  oferta_ganador: number | null
  adjudicacion_ambigua: boolean
  /** Campos estables que NO coincidieron entre las filas del grupo. */
  campos_divergentes: CampoSecop[]
}

/** Campos que deben ser iguales en todas las filas de un mismo proceso. */
const CAMPOS_ESTABLES: CampoSecop[] = [
  CAMPO_SECOP.numero_proceso,
  CAMPO_SECOP['entidad.nombre'],
  CAMPO_SECOP['entidad.nit'],
  CAMPO_SECOP['entidad.departamento'],
  CAMPO_SECOP.objeto,
  CAMPO_SECOP.modalidad,
  CAMPO_SECOP.presupuesto_oficial,
  CAMPO_SECOP['cronograma.publicacion'],
]

/**
 * Agrupa las filas por `id_del_proceso` — la identidad real (trampa 10) — y
 * deja un registro por proceso. Las filas sin id se devuelven aparte: sin
 * identidad no hay documento posible.
 */
export function colapsarPorProceso(filas: readonly FilaSecop[]): {
  procesos: ProcesoColapsado[]
  sin_identidad: number
} {
  const grupos = new Map<string, FilaSecop[]>()
  let sin_identidad = 0

  for (const f of filas) {
    const id = texto(f, CAMPO_SECOP.id_secop)
    if (id === '') { sin_identidad++; continue }
    const g = grupos.get(id)
    if (g) g.push(f)
    else grupos.set(id, [f])
  }

  const procesos: ProcesoColapsado[] = []
  for (const [id_secop, g] of grupos) {
    const representante = g[0]

    const parejas = new Set<string>()
    const valores = new Set<number>()
    for (const f of g) {
      const nombre = textoONull(f, CAMPO_SECOP['ganador.nombre'])
      const nit = textoONull(f, CAMPO_SECOP['ganador.nit'])
      if (nombre !== null || nit !== null) parejas.add(`${nit ?? ''}|${nombre ?? ''}`)
      const v = numeroSecop(f, CAMPO_SECOP.oferta_ganador)
      if (v !== null && v > 0) valores.add(v)
    }

    const unico = parejas.size === 1 && valores.size <= 1
    const ambigua = parejas.size > 1 || valores.size > 1

    let ganador: GanadorSecop | null = null
    let oferta_ganador: number | null = null
    if (unico) {
      const nombre = textoONull(representante, CAMPO_SECOP['ganador.nombre'])
      if (nombre !== null) {
        ganador = { nombre, nit: textoONull(representante, CAMPO_SECOP['ganador.nit']) }
      }
      const [v] = [...valores]
      oferta_ganador = v ?? null
    }

    const campos_divergentes = CAMPOS_ESTABLES.filter(c => {
      const vistos = new Set(g.map(f => JSON.stringify(f[c] ?? null)))
      return vistos.size > 1
    })

    procesos.push({
      id_secop,
      representante,
      filas: g.length,
      proveedores: parejas.size,
      valores: valores.size,
      ganador,
      oferta_ganador,
      adjudicacion_ambigua: ambigua,
      campos_divergentes,
    })
  }

  return { procesos, sin_identidad }
}

// ── La forma de lo que entra ─────────────────────────────────────────────────

/**
 * Registro listo para escribir. Es un SUBCONJUNTO ESTRICTO de `Licitacion`
 * (los campos que el radar puede conocer), con las fechas como ISO: el
 * escritor las convierte a `Timestamp`. Los metadatos del acto de ingesta van
 * aparte, en `MetaIngesta`, para no contaminar el documento con campos que el
 * modelo no declara.
 */
export interface LicitacionDetectada {
  consecutivo: ''
  numero_proceso: string
  id_secop: string
  origen: 'secop_ii'
  url_proceso: string
  entidad: {
    nombre: string
    nit: string
    orden: string
    departamento: string
    ciudad: string
  }
  objeto: string
  categoria_unspsc: string | null
  modalidad: ModalidadLicitacion
  /** `null` cuando el origen trae cero, negativo o absurdo (trampa 8). */
  /**
   * EL CENTINELA DE LA COLECCION ES 0, NO null. `Licitacion` lo declara
   * `number` y TODOS sus lectores usan `> 0` / `<= 0` como "no hay dato":
   * `pctNeg` y `pctGanador` (licitacion.ts), el detalle y la bandeja. El
   * importador historico ya escribe `?? 0` por lo mismo.
   *
   * No se pierde informacion: POR QUE no hay cifra sigue en
   * `meta.problema_presupuesto` (ausente / cero / negativo / absurdo) y contado
   * en el reporte de la corrida. El documento dice "no hay cifra usable"; el
   * reporte dice de que clase era el problema.
   */
  presupuesto_oficial: number
  lotes: number
  cronograma: {
    /** ISO con zona; `null` si el origen no la trae (trampa 7). */
    publicacion: string | null
    manifestacion: null
    sorteo: null
    /** Recepción de ofertas = cierre, verificado contra el dato (trampa 14). */
    cierre: string | null
    adjudicacion: null
  }
  semaforo: Semaforo
  semaforo_motivos: MotivoSemaforo[]
  semaforo_version: string
  override_manual: null
  estado: 'detectada'
  motivo_descarte: null
  oferta_neg: null
  oferta_ganador: number | null
  /**
   * EL DOCUMENTO PIDE `nit: string`; la FUENTE lo da como `string | null`
   * (`GanadorSecop`), porque SECOP a veces no lo trae. El centinela de "no se
   * sabe" en esta colección es la CADENA VACÍA —`consecutivo`,
   * `responsable_uid` y las propias reglas usan `!= ''`—, no `null`.
   * La conversión va donde se arma el documento, no en `GanadorSecop`: ahí
   * `null` es honesto, porque describe lo que el origen entregó.
   */
  ganador: GanadorLicitacion | null
  /** Siempre `null`: el origen no tiene el dato (trampa 6). */
  manifestaciones: null
  ofertas_recibidas: number | null
  migrado: false
  capacidad_manual: null
  activa: true
  /**
   * PROCEDENCIA DEL NACIMIENTO: por qué el radar trajo este proceso.
   *
   * Se escribe UNA vez, al nacer, y el radar NO la refresca — es historia, no
   * estado. Sin esto, la pregunta "de los que entraron por clase sin que el
   * texto lo dijera, ¿alguno se trabajó?" solo se podría responder con la
   * muestra de 10 del registro de la corrida; con esto es una consulta a
   * `licitaciones`.
   */
  radar: {
    senal: SenalClasificacion
    /** Términos del léxico que lo trajeron. Vacío si entró por código. */
    terminos: string[]
    /** Con qué versión del léxico se clasificó. */
    vocabulario_version: string
    /** Id de la corrida que lo creó. Lo sella el escritor, no el mapeo. */
    corrida: string | null
  }
}

/** Metadatos del acto de ingesta — para el reporte y el triage, no para el doc. */
export interface MetaIngesta {
  doc_id: string
  /** Veredicto híbrido con su señal y los términos que lo sostienen. */
  clasificacion: Clasificacion
  /** De dónde salió la fecha del proceso (trampa 12). */
  origen_fecha: OrigenFecha
  familia_rup: FamiliaRup
  categoria_cruda: string | null
  modalidad_cruda: string
  modalidad_imprevista: boolean
  problema_presupuesto: ProblemaPresupuesto
  presupuesto_crudo: number | null
  url_generica: boolean
  filas_origen: number
  adjudicacion_ambigua: boolean
  campos_divergentes: CampoSecop[]
  sin_fecha_publicacion: boolean
}

export interface RegistroIngesta {
  doc: LicitacionDetectada
  meta: MetaIngesta
}

/**
 * Entrada del semáforo a partir de lo que SECOP II sí trae.
 *
 * Tres de los cinco campos del motor NO existen en este dataset y entran en
 * `false` a conciencia:
 *  · `tiene_sorteo`: el dataset no tiene fecha de sorteo. Materialmente no
 *    cambia nada — el sorteo de consolidación es de menor cuantía, que ya cae
 *    en rojo por modalidad, y la mínima cuantía no tiene sorteo por ley.
 *  · `limitacion_mipyme`: vive en el pliego, no en los datos abiertos.
 *  · `requiere_lectura`: es juicio humano; lo pone Karen al evaluar.
 *
 * Consecuencia honesta, fijada por test: de la ingesta salen VERDES las
 * mínimas cuantías y ROJAS todas las demás. El amarillo lo produce la
 * lectura del pliego, no el radar.
 */
export function entradaSemaforoSecop(d: {
  modalidad: ModalidadLicitacion
  entidad: { departamento: string }
}): EntradaSemaforo {
  return {
    modalidad: d.modalidad,
    tiene_sorteo: false,
    limitacion_mipyme: false,
    departamento: d.entidad.departamento,
    requiere_lectura: false,
  }
}

/**
 * Mapea UN proceso colapsado al registro que entra. Devuelve `null` solo si
 * el proceso no tiene identidad usable — todo lo demás se degrada a `null` en
 * su campo y queda contado en `meta`.
 */
export function mapearProceso(
  p: ProcesoColapsado, hash: (s: string) => string,
  terminos: readonly string[] = TERMINOS_NEG,
  vocabulario_version: string = VOCABULARIO_NEG_VERSION,
): RegistroIngesta | null {
  const f = p.representante
  const id_secop = p.id_secop.trim()
  if (id_secop === '') return null

  const categoria_cruda = textoONull(f, CAMPO_SECOP.categoria_unspsc)
  const categoria_unspsc = categoriaONull(f)
  const mod = mapearModalidadSecop(f)
  const presupuesto_crudo = numeroSecop(f, CAMPO_SECOP.presupuesto_oficial)
  const problema = problemaPresupuesto(presupuesto_crudo)
  const url_proceso = urlSecop(f, CAMPO_SECOP.url_proceso)
  const objeto = texto(f, CAMPO_SECOP.objeto)
  const departamento = textoONull(f, CAMPO_SECOP['entidad.departamento']) ?? ''
  const clasificacion = clasificarProceso(categoria_unspsc, objeto, terminos, { departamento })
  const fecha = fechaReferencia(f)
  const publicacion = fechaSecopAIso(f, CAMPO_SECOP['cronograma.publicacion'])
  const cierre = fechaSecopAIso(f, CAMPO_SECOP['cronograma.cierre'])

  const entidad = {
    nombre: texto(f, CAMPO_SECOP['entidad.nombre']),
    nit: texto(f, CAMPO_SECOP['entidad.nit']),
    orden: texto(f, CAMPO_SECOP['entidad.orden']),
    departamento,
    ciudad: textoONull(f, CAMPO_SECOP['entidad.ciudad']) ?? '',
  }

  const sem = calcularSemaforo(entradaSemaforoSecop({ modalidad: mod.modalidad, entidad }))

  const doc: LicitacionDetectada = {
    consecutivo: '',
    numero_proceso: texto(f, CAMPO_SECOP.numero_proceso),
    id_secop,
    origen: 'secop_ii',
    url_proceso,
    entidad,
    objeto,
    categoria_unspsc,
    modalidad: mod.modalidad,
    presupuesto_oficial: problema === null && presupuesto_crudo !== null
      ? presupuesto_crudo : 0,
    lotes: numeroSecop(f, CAMPO_SECOP.lotes) ?? 0,
    cronograma: {
      publicacion,
      manifestacion: null,
      sorteo: null,
      cierre,
      adjudicacion: null,
    },
    semaforo: sem.semaforo,
    semaforo_motivos: sem.motivos,
    semaforo_version: sem.version,
    override_manual: null,
    estado: 'detectada',
    motivo_descarte: null,
    oferta_neg: null,
    oferta_ganador: p.oferta_ganador,
    ganador: p.ganador === null
      ? null
      : { nombre: p.ganador.nombre, nit: p.ganador.nit ?? '' },
    manifestaciones: null,
    ofertas_recibidas: numeroSecop(f, CAMPO_SECOP.ofertas_recibidas),
    migrado: false,
    capacidad_manual: null,
    activa: true,
    radar: {
      senal: clasificacion.senal,
      terminos: clasificacion.terminos,
      vocabulario_version,
      corrida: null,
    },
  }

  const meta: MetaIngesta = {
    doc_id: docIdSecop(id_secop, hash),
    clasificacion,
    origen_fecha: fecha.origen,
    familia_rup: clasificacion.familia,
    categoria_cruda,
    modalidad_cruda: mod.crudo,
    modalidad_imprevista: mod.imprevista,
    problema_presupuesto: problema,
    presupuesto_crudo,
    url_generica: esUrlGenerica(url_proceso),
    filas_origen: p.filas,
    adjudicacion_ambigua: p.adjudicacion_ambigua,
    campos_divergentes: p.campos_divergentes,
    sin_fecha_publicacion: publicacion === null,
  }

  return { doc, meta }
}

// ── Guarda de identidad (la lección del importador) ─────────────────────────

export interface ColisionDocId {
  doc_id: string
  ids_secop: string[]
}

/**
 * CUENTA antes de escribir: tantos doc ids distintos como procesos. Si dos
 * procesos caen en el mismo documento, devuelve la colisión NOMBRANDO a los
 * culpables — el importador perdió 4 registros en silencio por no hacer esto,
 * y se descubrió contando la colección en producción.
 */
export function guardaIdentidad(registros: readonly RegistroIngesta[]): {
  procesos: number
  doc_ids: number
  colisiones: ColisionDocId[]
} {
  const porDocId = new Map<string, Set<string>>()
  for (const r of registros) {
    const s = porDocId.get(r.meta.doc_id) ?? new Set<string>()
    s.add(r.doc.id_secop)
    porDocId.set(r.meta.doc_id, s)
  }
  const colisiones: ColisionDocId[] = []
  for (const [doc_id, ids] of porDocId) {
    if (ids.size > 1) colisiones.push({ doc_id, ids_secop: [...ids].sort() })
  }
  return {
    procesos: new Set(registros.map(r => r.doc.id_secop)).size,
    doc_ids: porDocId.size,
    colisiones,
  }
}

// ── Ingesta completa + guard de calidad ──────────────────────────────────────

/** Umbrales del guard. Superarlos deja `puede_escribir` en `false`. */
export const GUARD_SECOP = {
  /** Más de este % de modalidades imprevistas: apareció un vocabulario nuevo. */
  MAX_PCT_MODALIDAD_IMPREVISTA: 5,
  /**
   * Más de este % SIN NINGUNA fecha utilizable (ni publicación ni recepción):
   * la consulta está trayendo basura. Que falte la publicación ya no cuenta —
   * para eso está la cadena de respaldo de la trampa 12.
   */
  MAX_PCT_SIN_FECHA: 10,
  /** Más de este % de presupuestos inservibles. */
  MAX_PCT_PRESUPUESTO_PROBLEMA: 15,
} as const

/**
 * Cuántos procesos se descartaron y POR QUÉ. Es el instrumento que mide si el
 * clasificador está dejando pasar cosas: sin esto, un radar que no muestra
 * nada y un radar que descarta lo bueno se ven igual.
 */
export interface DescartesIngesta {
  total: number
  /** Código presente y fuera de las tres familias del RUP. */
  codigo_fuera_de_familia: number
  /** Sin código y sin coincidencia de léxico. */
  sin_codigo_ni_texto: number
  /**
   * Descartados por el TERRITORIO (B.1c). Cierra la identidad del struct:
   * `total` = código fuera + sin código ni texto + fuera de territorio.
   */
  fuera_de_territorio: number
  /**
   * De los descartados por código, cuántos SÍ coinciden con el léxico. El
   * contador que importa: 3 de los 23 procesos que NEG ganó caen acá.
   */
  con_texto_coincidente: number
  /** Muestra acotada de esos casos, para revisarlos a mano. */
  ejemplos_con_texto_coincidente: {
    id_secop: string
    categoria: string | null
    objeto: string
    terminos: string[]
  }[]
}

/**
 * Procesos de los departamentos OBSERVADOS (B.1c): no se persisten, se
 * cuentan. `habrian_calificado` es la respuesta a "qué estamos dejando pasar
 * por no abrir Antioquia y Boyacá", con muestra para mirarla a mano.
 */
export interface ObservadosIngesta {
  total: number
  habrian_calificado: number
  ejemplos: {
    id_secop: string
    departamento: string
    categoria: string | null
    objeto: string
    senal_previa: SenalClasificacion
  }[]
}

/**
 * Los que entraron por CLASE sin que el léxico reconozca el objeto — los 24 de
 * ferretería pura. Se separan en el reporte de cada corrida, con muestra, para
 * que en tres meses se pueda ver si alguno se trabajó o si entraron para nada.
 * `total` tiene que coincidir con `por_senal.codigo_en_clase_sin_texto`.
 */
export interface EvidenciaSinTexto {
  total: number
  ejemplos: { id_secop: string; categoria: string | null; objeto: string }[]
}

export interface ReporteIngestaSecop {
  /** SOLO los persistibles: veredicto `si` o `probable` (trampa 13). */
  registros: RegistroIngesta[]
  filas_vistas: number
  /** Procesos distintos vistos, persistibles o no. */
  procesos_vistos: number
  /** Procesos que producen documento. */
  procesos: number
  filas_sin_identidad: number
  /** Conteo por veredicto sobre TODOS los procesos vistos. */
  por_veredicto: Record<VeredictoRadar, number>
  /**
   * Conteo por señal. Separa `codigo_en_familia` de
   * `codigo_en_clase_adjudicada`, así que el aporte de las tres clases de
   * B.1c se mide en cada corrida en vez de diluirse en los «si».
   */
  por_senal: Record<SenalClasificacion, number>
  descartes: DescartesIngesta
  /** Entraron por evidencia de clase, sin que el texto lo dijera. */
  evidencia_sin_texto: EvidenciaSinTexto
  /** Los departamentos observados sin abrir (B.1c). */
  observados: ObservadosIngesta
  /** Conteo por tri-estado de familia (trampa 5), sobre los vistos. */
  por_familia: Record<FamiliaRup, number>
  /** De dónde salió la fecha de cada persistible (trampa 12). */
  por_origen_fecha: Record<OrigenFecha, number>
  /** Versión del léxico con la que se clasificó. */
  vocabulario_version: string
  colisiones: ColisionDocId[]
  /** Procesos con varias adjudicaciones: sin ganador fijado (trampa 9). */
  adjudicacion_ambigua: number
  sin_fecha_publicacion: number
  sin_ninguna_fecha: number
  presupuesto_problema: Record<Exclude<ProblemaPresupuesto, null>, number>
  modalidades_imprevistas: { crudo: string; procesos: number }[]
  urls_genericas: number
  /** Señales del guard. Si hay alguna, la ingesta NO procede. */
  senales: string[]
  puede_escribir: boolean
}

/** Cuántos ejemplos de descarte-con-texto se guardan para revisión. */
export const MAX_EJEMPLOS_DESCARTE = 10

/**
 * Pipeline completo: colapsa filas a procesos, mapea, cuenta y decide si se
 * puede escribir. No escribe nada: devuelve el reporte y los registros.
 */
export function ingerirSecop(
  filas: readonly FilaSecop[], hash: (s: string) => string,
  opciones?: { terminos?: readonly string[]; vocabulario_version?: string },
): ReporteIngestaSecop {
  const terminos = opciones?.terminos ?? TERMINOS_NEG
  const { procesos: colapsados, sin_identidad } = colapsarPorProceso(filas)

  const por_veredicto: Record<VeredictoRadar, number> = { si: 0, probable: 0, no: 0 }
  const por_senal: Record<SenalClasificacion, number> = {
    codigo_en_familia: 0,
    codigo_en_clase_con_texto: 0,
    codigo_en_clase_sin_texto: 0,
    codigo_fuera_de_familia: 0,
    texto_coincide: 0,
    sin_codigo_ni_texto: 0,
    fuera_de_territorio: 0,
  }
  const por_familia: Record<FamiliaRup, number> = {
    familia_neg: 0, fuera_de_familia: 0, sin_clasificar: 0,
  }
  const descartes: DescartesIngesta = {
    total: 0,
    codigo_fuera_de_familia: 0,
    sin_codigo_ni_texto: 0,
    fuera_de_territorio: 0,
    con_texto_coincidente: 0,
    ejemplos_con_texto_coincidente: [],
  }
  const observados: ObservadosIngesta = { total: 0, habrian_calificado: 0, ejemplos: [] }
  const evidencia_sin_texto: EvidenciaSinTexto = { total: 0, ejemplos: [] }

  // Se mapea TODO (el veredicto necesita el objeto ya leído) y se persiste
  // solo lo que da `si` o `probable`. Los `no` no producen documento pero SÍ
  // producen conteo — decenas de miles de registros de comida y software no
  // entran a Firestore, pero tampoco desaparecen sin dejar número.
  const registros: RegistroIngesta[] = []
  let procesos_vistos = 0
  for (const p of colapsados) {
    const r = mapearProceso(p, hash, terminos, opciones?.vocabulario_version)
    if (!r) continue
    procesos_vistos++
    const c = r.meta.clasificacion
    por_veredicto[c.veredicto]++
    por_senal[c.senal]++
    por_familia[c.familia]++
    if (c.senal === 'codigo_en_clase_sin_texto') {
      evidencia_sin_texto.total++
      if (evidencia_sin_texto.ejemplos.length < MAX_EJEMPLOS_DESCARTE) {
        evidencia_sin_texto.ejemplos.push({
          id_secop: r.doc.id_secop,
          categoria: r.doc.categoria_unspsc,
          objeto: r.doc.objeto.slice(0, 200),
        })
      }
    }
    if (sePersiste(c.veredicto)) { registros.push(r); continue }
    descartes.total++
    if (c.senal === 'codigo_fuera_de_familia') descartes.codigo_fuera_de_familia++
    if (c.senal === 'sin_codigo_ni_texto') descartes.sin_codigo_ni_texto++
    if (c.senal === 'fuera_de_territorio') {
      descartes.fuera_de_territorio++
      observados.total++
      if (c.habria_calificado) {
        observados.habrian_calificado++
        if (observados.ejemplos.length < MAX_EJEMPLOS_DESCARTE) {
          observados.ejemplos.push({
            id_secop: r.doc.id_secop,
            departamento: r.doc.entidad.departamento,
            categoria: r.doc.categoria_unspsc,
            objeto: r.doc.objeto.slice(0, 200),
            senal_previa: c.senal_previa ?? c.senal,
          })
        }
      }
      continue
    }
    if (c.descartado_con_texto_coincidente) {
      descartes.con_texto_coincidente++
      if (descartes.ejemplos_con_texto_coincidente.length < MAX_EJEMPLOS_DESCARTE) {
        descartes.ejemplos_con_texto_coincidente.push({
          id_secop: r.doc.id_secop,
          categoria: r.doc.categoria_unspsc,
          objeto: r.doc.objeto.slice(0, 200),
          terminos: c.terminos,
        })
      }
    }
  }

  const por_origen_fecha: Record<OrigenFecha, number> = {
    publicacion: 0, recepcion_de_ofertas: 0, ninguna: 0,
  }
  const presupuesto_problema = { ausente: 0, cero: 0, negativo: 0, absurdo: 0 }
  const imprevistas = new Map<string, number>()
  let adjudicacion_ambigua = 0
  let sin_fecha_publicacion = 0
  let urls_genericas = 0

  for (const r of registros) {
    por_origen_fecha[r.meta.origen_fecha]++
    if (r.meta.problema_presupuesto !== null) presupuesto_problema[r.meta.problema_presupuesto]++
    if (r.meta.modalidad_imprevista) {
      imprevistas.set(r.meta.modalidad_cruda, (imprevistas.get(r.meta.modalidad_cruda) ?? 0) + 1)
    }
    if (r.meta.adjudicacion_ambigua) adjudicacion_ambigua++
    if (r.meta.sin_fecha_publicacion) sin_fecha_publicacion++
    if (r.meta.url_generica) urls_genericas++
  }

  const { procesos, doc_ids, colisiones } = guardaIdentidad(registros)

  const senales: string[] = []
  const pct = (n: number) => (procesos === 0 ? 0 : (n / procesos) * 100)

  if (colisiones.length > 0) {
    senales.push(
      `COLISIÓN DE DOC ID: ${procesos} procesos pero ${doc_ids} documentos. `
      + colisiones.map(c => `${c.doc_id} <- [${c.ids_secop.join(', ')}]`).join(' · '),
    )
  }
  const impr = [...imprevistas.values()].reduce((a, b) => a + b, 0)
  if (pct(impr) > GUARD_SECOP.MAX_PCT_MODALIDAD_IMPREVISTA) {
    senales.push(
      `MODALIDADES IMPREVISTAS: ${impr} de ${procesos} procesos `
      + `(${pct(impr).toFixed(1)} %) con un texto que no está en MODALIDAD_SECOP: `
      + [...imprevistas.keys()].join(' · '),
    )
  }
  const sin_ninguna_fecha = por_origen_fecha.ninguna
  if (pct(sin_ninguna_fecha) > GUARD_SECOP.MAX_PCT_SIN_FECHA) {
    senales.push(
      `SIN NINGUNA FECHA UTILIZABLE: ${sin_ninguna_fecha} de ${procesos} `
      + `(${pct(sin_ninguna_fecha).toFixed(1)} %) — ni publicación ni recepción `
      + 'de ofertas. Entran marcadas, pero esta proporción dice que la consulta '
      + 'está trayendo basura.',
    )
  }
  const conProblema = Object.values(presupuesto_problema).reduce((a, b) => a + b, 0)
  if (pct(conProblema) > GUARD_SECOP.MAX_PCT_PRESUPUESTO_PROBLEMA) {
    senales.push(
      `PRESUPUESTO INSERVIBLE: ${conProblema} de ${procesos} `
      + `(${pct(conProblema).toFixed(1)} %) — ausente ${presupuesto_problema.ausente}, `
      + `cero ${presupuesto_problema.cero}, negativo ${presupuesto_problema.negativo}, `
      + `absurdo ${presupuesto_problema.absurdo}.`,
    )
  }

  return {
    registros,
    filas_vistas: filas.length,
    procesos_vistos,
    procesos,
    filas_sin_identidad: sin_identidad,
    por_veredicto,
    por_senal,
    descartes,
    evidencia_sin_texto,
    observados,
    por_familia,
    por_origen_fecha,
    vocabulario_version: opciones?.vocabulario_version ?? VOCABULARIO_NEG_VERSION,
    colisiones,
    adjudicacion_ambigua,
    sin_fecha_publicacion,
    sin_ninguna_fecha,
    presupuesto_problema,
    modalidades_imprevistas: [...imprevistas.entries()]
      .map(([crudo, p]) => ({ crudo, procesos: p }))
      .sort((a, b) => b.procesos - a.procesos),
    urls_genericas,
    senales,
    puede_escribir: senales.length === 0,
  }
}

// ── El agregado de la corrida ────────────────────────────────────────────────

/**
 * Resumen de UNA corrida del radar, listo para persistir.
 *
 * Es la contraparte medible de "solo se guarda lo que da sí o probable": sin
 * este documento, nadie puede responder si el clasificador está dejando pasar
 * cosas, porque lo descartado no deja rastro en ninguna colección. Guarda los
 * conteos y una muestra acotada de los descartes que coinciden con el léxico.
 *
 * PURA: el caller pone el reloj y el id. La colección (`corridas_radar`) y su
 * regla de lectura son del bloque que escriba —acá no se toca ninguna regla—.
 */
export interface ResumenCorridaRadar {
  ejecutada_en: string
  /** Ventana consultada, tal como se le pidió a la API. */
  ventana: { desde: string | null; hasta: string | null; solape_dias: number }
  modo: string
  vocabulario_version: string
  filas_vistas: number
  procesos_vistos: number
  persistidos: number
  por_veredicto: Record<VeredictoRadar, number>
  por_senal: Record<SenalClasificacion, number>
  descartes: DescartesIngesta
  /** Los que entraron por evidencia de clase sin texto, separados. */
  evidencia_sin_texto: EvidenciaSinTexto
  /** Qué se está dejando pasar por no abrir Antioquia y Boyacá (B.1c). */
  observados: ObservadosIngesta
  por_familia: Record<FamiliaRup, number>
  por_origen_fecha: Record<OrigenFecha, number>
  adjudicacion_ambigua: number
  presupuesto_problema: Record<Exclude<ProblemaPresupuesto, null>, number>
  modalidades_imprevistas: { crudo: string; procesos: number }[]
  urls_genericas: number
  senales: string[]
  puede_escribir: boolean
}

export function construirResumenCorrida(
  r: ReporteIngestaSecop,
  contexto: {
    ejecutada_en: string
    modo: string
    ventana: { desde: string | null; hasta: string | null; solape_dias: number }
  },
): ResumenCorridaRadar {
  return {
    ejecutada_en: contexto.ejecutada_en,
    ventana: contexto.ventana,
    modo: contexto.modo,
    vocabulario_version: r.vocabulario_version,
    filas_vistas: r.filas_vistas,
    procesos_vistos: r.procesos_vistos,
    persistidos: r.procesos,
    por_veredicto: r.por_veredicto,
    por_senal: r.por_senal,
    descartes: r.descartes,
    evidencia_sin_texto: r.evidencia_sin_texto,
    observados: r.observados,
    por_familia: r.por_familia,
    por_origen_fecha: r.por_origen_fecha,
    adjudicacion_ambigua: r.adjudicacion_ambigua,
    presupuesto_problema: r.presupuesto_problema,
    modalidades_imprevistas: r.modalidades_imprevistas,
    urls_genericas: r.urls_genericas,
    senales: r.senales,
    puede_escribir: r.puede_escribir,
  }
}
