/**
 * Módulo Licitaciones (sub-bloque 1.1) — modelo, máquina de estados y patch
 * builders puros. CERO Firestore, CERO React, CERO UI: este archivo describe
 * la forma del documento y las transiciones legales, nada más.
 *
 * Patrón calcado de `types/sigp/tarea.ts`: los helpers de patch son PUROS —
 * validan la transición y devuelven el objeto a persistir, o `null` si el
 * movimiento no es legal. La UI (bloque posterior) persiste EXACTAMENTE lo
 * que devuelven; no improvisa writes.
 *
 * LAS CINCO INVARIANTES (cada una con su validador puro y su test):
 *  1. `estado === 'descartada'` <=> `motivo_descarte !== null`.
 *  2. `activa === false` <=> estado inactivo (terminales + descartada).
 *     DERIVADA — la mantienen los builders, nunca se escribe a mano.
 *  3. PORTERO: con `semaforo === 'rojo'` no se avanza a en_preparacion /
 *     manifestada / presentada salvo que exista `override_manual`.
 *  4. `override_manual !== null` implica `por` y `motivo` no vacíos y
 *     `semaforo_anterior` igual al valor real previo al override.
 *  5. `semaforo_version` NO se muta como efecto colateral de un recálculo:
 *     cambiar de criterio es un acto explícito que declara la versión que
 *     se está dejando atrás.
 *  6. Los estados de COMPROMISO y de RESULTADO exigen `consecutivo`; los tres
 *     estados de triage (detectada, en_evaluacion, descartada) lo admiten
 *     vacío. Implicación en un solo sentido — ver ESTADOS_EXIGEN_CONSECUTIVO.
 *     NO aplica a los registros `migrado` (ver el campo).
 *  7. `consecutivo` es inmutable una vez asignado. La única transición legal
 *     es `'' -> 'LIC-AAAA-NNNN'`, y ocurre UNA vez.
 *  8. GATE DE CUMPLIMIENTO (A.1): no se pasa a `presentada` si el checklist
 *     del pliego tiene requisitos SIN VERIFICAR, ni con requisitos que NO
 *     CUMPLEN salvo override con motivo escrito. El predicado es
 *     `puedePresentar` de `utils/sigp/cumplimiento.ts` — el MISMO que usa la
 *     UI para deshabilitar el botón, con test de que no divergen.
 */
import type { Timestamp } from 'firebase/firestore'
// Función PURA de la capa de utils. Precedente de la casa: `proyecto.ts` y
// `preventivos.ts` importan `esCoordenadaValida` de `utils/geo`.
import { puedePresentar } from '../../utils/sigp/cumplimiento'
import type { OverrideCumplimiento } from '../../utils/sigp/cumplimiento'
import type { Requisito } from './requisito'

export type { Timestamp }

// ── Vocabularios cerrados ────────────────────────────────────────────────────

export const MODALIDADES_LICITACION = [
  'minima_cuantia', 'menor_cuantia', 'licitacion_publica',
  'seleccion_abreviada', 'regimen_especial', 'otra',
] as const
export type ModalidadLicitacion = typeof MODALIDADES_LICITACION[number]

export const ORIGENES_LICITACION = ['secop_ii', 'secop_i', 'manual'] as const
export type OrigenLicitacion = typeof ORIGENES_LICITACION[number]

export const SEMAFOROS = ['verde', 'amarillo', 'rojo'] as const
export type Semaforo = typeof SEMAFOROS[number]

export const ESTADOS_LICITACION = [
  'detectada', 'en_evaluacion', 'descartada', 'en_preparacion',
  'manifestada', 'presentada', 'adjudicada', 'perdida',
  'rechazada', 'revocada', 'desierta',
] as const
export type EstadoLicitacion = typeof ESTADOS_LICITACION[number]

/**
 * Por qué se descartó. VOCABULARIO CERRADO: el texto libre no se cuenta, y lo
 * que no se cuenta no responde "¿el radar sirve?" ni "¿por qué dejamos pasar
 * 117 procesos el año pasado?".
 *
 * LOS OCHO PRIMEROS SON MEDIDOS, no diseñados: salen del registro real de
 * Karen, normalizados en `mapearMotivoDescarte` con sus erratas incluidas
 * (`MYPIME`, `PRESUPUESTTO`). Los cinco de arriba explican el 94 % de 121
 * descartes (sorteo 26 % · MiPyme 24 % · experiencia 20 % · presupuesto 17 % ·
 * indicadores 7 %).
 *
 * LOS CUATRO ÚLTIMOS son del mundo del RADAR (B.3) y no existían porque el
 * radar no existía. Nunca vienen del registro histórico, así que
 * `mapearMotivoDescarte` no los conoce ni tiene por qué.
 */
export const MOTIVOS_DESCARTE = [
  'SORTEO', 'LIMITACION_MIPYME', 'EXPERIENCIA', 'INDICADORES',
  'BAJO_PRESUPUESTO', 'UBICACION', 'CAPACIDAD',
  // ── Del radar (B.3) ──
  'RUIDO_LEXICO', 'FUERA_DE_ALCANCE', 'PLAZO_IMPOSIBLE', 'DUPLICADO',
  'OTRO',
] as const
export type MotivoDescarte = typeof MOTIVOS_DESCARTE[number]

/**
 * LOS DOS QUE SE CONFUNDEN, y por qué son dos y no uno.
 *
 * `RUIDO_LEXICO` es un defecto DEL INSTRUMENTO: el léxico trajo algo que no
 * debía. `FUERA_DE_ALCANCE` es una detección CORRECTA con un "no" de negocio.
 *
 * El caso que los separa: un proceso de transmisión a 230 kV cuyo objeto dice
 * "redes eléctricas". El léxico ACERTÓ —ese término es vocabulario de NEG— y
 * NEG igual no lo hace. Si eso se marca como ruido, la métrica dice que el
 * léxico es peor de lo que es, y el "arreglo" sería borrar términos que
 * funcionan: el inverso de para qué existe el motivo.
 *
 * La prueba para quien descarta cabe en una línea, y el formulario la HACE en
 * vez de confiar en que alguien se acuerde (`ModalDescartar`):
 *     ¿el léxico se equivocó, o acertó y aun así no lo queremos?
 *
 * ⚠ CONDICIÓN DE REVISIÓN (acordada con Giovanny el 11-nov-2026): si a los
 * TRES MESES los dos motivos se usan de forma intercambiable, SE FUSIONAN. Eso
 * se mide con número —la distribución de ambos sobre los descartes del radar—,
 * no con impresiones.
 */
export const MOTIVOS_DESCARTE_DEL_LEXICO: MotivoDescarte[] = ['RUIDO_LEXICO', 'FUERA_DE_ALCANCE']

export const MOTIVOS_SEMAFORO = [
  'MODALIDAD_SIN_HISTORIAL', 'SORTEO', 'LIMITACION_MIPYME', 'REQUIERE_LECTURA',
] as const
export type MotivoSemaforo = typeof MOTIVOS_SEMAFORO[number]

// ── Sub-tipos ────────────────────────────────────────────────────────────────

/** Entidad contratante. `orden` y geografía llegan de SECOP tal cual. */
export interface EntidadLicitacion {
  nombre: string
  nit: string
  orden: string
  departamento: string
  ciudad: string
}

/** Hitos del proceso. `null` es información, no ausencia de dato: un
 *  `sorteo: null` significa "este proceso no tiene sorteo de consolidación",
 *  y el motor del semáforo lo lee así. */
export interface CronogramaLicitacion {
  publicacion: Timestamp | null
  manifestacion: Timestamp | null
  sorteo: Timestamp | null
  cierre: Timestamp | null
  adjudicacion: Timestamp | null
}

/** Anulación manual del semáforo (invariante 4). Registra QUIÉN, CUÁNDO,
 *  POR QUÉ y QUÉ valor había antes — sin las cuatro cosas no es auditable. */
export interface OverrideSemaforo {
  por: string
  en: Timestamp
  motivo: string
  semaforo_anterior: Semaforo
}

/** Ganador del proceso (solo con resultado conocido). */
export interface GanadorLicitacion {
  nombre: string
  nit: string
}

// ── Procedencia: cómo llegó el proceso a la colección ───────────────────────

/**
 * Qué señal produjo el veredicto del radar. Un veredicto sin señal no es
 * auditable.
 *
 * VIVE AQUÍ Y NO EN `utils/sigp/secopMapeo.ts`, donde nació: el DOCUMENTO
 * persiste este valor, así que su dueño es el tipo del documento. Tenerlo en
 * utils obligaba a que `types/` importara de `utils/` para declarar el campo
 * —la dependencia al revés, y circular, porque el mapeo ya importa de aquí—.
 */
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
 * De dónde salió la fecha con la que se ubica el proceso en el tiempo
 * (trampa 12 del mapeo). Vive en el tipo del DOCUMENTO porque desde el PR #252
 * el documento lo persiste; `utils/sigp/secopMapeo.ts` lo re-exporta para no
 * romper a quien ya lo importaba de ahí.
 */
export type OrigenFecha = 'publicacion' | 'recepcion_de_ofertas' | 'ninguna'

/**
 * Por qué el radar trajo este proceso. `null` en todo lo que no vino del radar
 * —tecleado a mano o importado del registro histórico—, y ESO ES LA DECISIÓN
 * que reparte la bandeja (D1): la procedencia decide, no el estado. Una
 * `detectada` escrita a mano es trabajo que alguien eligió; lo que el radar
 * trajo solo todavía no es de nadie.
 *
 * El bloque ya se escribía en Firestore desde la primera corrida del radar y
 * el panel no lo declaraba: el dato estaba ahí y era invisible para la UI.
 */
export interface ProcedenciaRadar {
  senal: SenalClasificacion
  /** Términos del léxico que lo trajeron. Vacío si entró por código. */
  terminos: string[]
  /** Con qué versión del léxico se clasificó. */
  vocabulario_version: string
  /** Id de la corrida que lo creó. Lo sella el escritor, no el mapeo. */
  corrida: string | null
  /**
   * LA FASE DEL PROCESO EN SECOP, literal: «Presentación de oferta»,
   * «Manifestación de interés (Menor Cuantía)», «Presentación de
   * observaciones»… `null` cuando el origen no la trae.
   *
   * ── POR QUÉ IMPORTA, MEDIDO ────────────────────────────────────────────
   * En una MENOR CUANTÍA, quien no manifestó interés antes del límite NO
   * puede presentar oferta, aunque la fecha de cierre siga vigente. El límite
   * de manifestación NO se publica en datos abiertos (`fecha_de_recepcion_de`
   * vale lo mismo en las dos filas en el 85,8 % de 10.421 procesos de 2026:
   * es el límite de la OFERTA, estampado también sobre la fila de
   * manifestación). La fase es lo que SÍ lo dice: un proceso en
   * «Presentación de oferta» ya pasó la manifestación.
   *
   * Medido además: la manifestación se abre, 5 días después (mediana) se abre
   * la fase de oferta, y 4 días después vence. En un proceso de ~9 días la
   * puerta se cierra sobre el día 5 — y al día 6 el `cierre` todavía muestra
   * 3 o 4 días por delante.
   */
  fase: string | null
  /**
   * Las fases por las que el proceso YA pasó, en orden, tal como el origen las
   * dejó escritas en la referencia.
   *
   * Es la evidencia de que hubo manifestación de interés — y hay que guardarla
   * porque el número de proceso se limpia. `menor_cuantia` no alcanza para
   * saberlo: la modalidad «Sin Manifestacion Interes» (4.817 procesos) también
   * mapea ahí.
   */
  fases_previas: string[]
  /**
   * `id_del_portafolio` — LO ÚNICO QUE UNE LAS FASES DE UN MISMO PROCESO.
   *
   * Las filas de un mismo proceso NO comparten `id_del_proceso` (cruzan 0 de
   * 11.463 medidas); comparten el portafolio (cruzan 10.421, el 90,9 %). Y
   * como el id del documento sale de `id_del_proceso`, **cada fase entra como
   * documento propio**: el radar ya trae todas las filas, solo que sin saber
   * que son la misma licitación.
   *
   * Cuánto se nota depende de la ventana —1,16 filas por portafolio a 12 días;
   * 1,50 en el año—, porque las fases están a ~9 días una de otra. Con el
   * solape en 4 el problema está escondido; al ampliarlo aparece. Por eso este
   * campo entra ANTES de la restitución del solape.
   */
  portafolio: string | null
  /**
   * DE DÓNDE SALIÓ LA FECHA DEL PROCESO, en el DOCUMENTO y no solo en la meta.
   *
   * Hasta la corrida de noviembre `origen_fecha` vivía únicamente en
   * `MetaIngesta` —"para el reporte y el triage, no para el doc"—, y eso
   * bastaba mientras las dos poblaciones entraban juntas. Desde que la corrida
   * automática excluye las filas sin ninguna fecha (`incluir_sin_fecha: false`,
   * PR #252), un `'ninguna'` SOLO puede venir del BARRIDO AUTORIZADO del
   * backlog: el campo es la marca que distingue esas filas de las del flujo
   * normal, y es lo que la bandeja muestra en el chip de procedencia.
   */
  origen_fecha: OrigenFecha
}

/**
 * ¿EL LÉXICO PARTICIPÓ en que este proceso entrara?
 *
 * No es lo mismo que `esDelRadar`, y la diferencia importa en un solo lugar
 * pero importa mucho: la pregunta del descarte («¿el léxico se equivocó, o
 * acertó y aun así no lo queremos?») solo tiene sentido si hubo léxico.
 *
 * Un proceso que entró por CÓDIGO sin que el texto dijera nada —señal
 * `codigo_en_clase_sin_texto`, los de ferretería pura— vino por EVIDENCIA de
 * adjudicación, no porque el vocabulario reconociera el objeto. Marcarlo
 * `RUIDO_LEXICO` diría que el léxico falló en algo donde el léxico no opinó, y
 * arruinaría exactamente la métrica que `RUIDO_LEXICO` existe para dar — el
 * mismo daño que D4 vino a evitar, una capa más abajo.
 *
 * El predicado es `terminos.length > 0` y no una lista de señales: los
 * términos SON la huella de que el vocabulario coincidió. Una señal nueva no
 * obliga a acordarse de actualizar esto.
 */
export function lexicoParticipo(radar: ProcedenciaRadar | null | undefined): boolean {
  return radar != null && radar.terminos.length > 0
}

/**
 * ¿Lo trajo el radar?
 *
 * COMPARA CONTRA `null` CON `!=` A PROPÓSITO (no `!== null`): los documentos
 * que ya están en producción —los ~350 del registro histórico y los tecleados
 * antes de este bloque— NO TIENEN el campo, así que al leerlos llega
 * `undefined`. Con `!== null` un histórico daría `true` y la bandeja lo
 * mandaría a la sección del radar, que es exactamente al revés.
 *
 * Los caminos de creación sí escriben `null` explícito desde este bloque; esta
 * guarda es para lo que se escribió antes y no se va a reescribir.
 */
export function esDelRadar(l: { radar?: ProcedenciaRadar | null }): boolean {
  return l.radar != null
}

// ── Documento de la colección `licitaciones` ─────────────────────────────────

export interface Licitacion {
  /**
   * LIC-AAAA-NNNN (padding 4, serie anual). DIFERIDO: nace en `''` y se quema
   * al MATERIALIZAR — al entrar en `en_preparacion`, que es donde NEG se
   * compromete con horas de trabajo. Un proceso detectado en SECOP y
   * descartado a los dos minutos no gasta número (contigüidad ISO, misma
   * costumbre que SOL/VIS/COT/PEA).
   *
   * Si ya se quemó y luego el proceso se descarta, el número SE CONSERVA: el
   * hueco en la serie es legítimo y trazable, igual que en SOL.
   *
   * Invariantes 6 y 7 — ver `consecutivoConsistente` y
   * `transicionConsecutivoValida`.
   */
  consecutivo: string
  numero_proceso: string
  id_secop: string | null
  origen: OrigenLicitacion
  /** Por qué lo trajo el radar, o `null` si no vino de ahí. Ver `esDelRadar`. */
  radar: ProcedenciaRadar | null
  url_proceso: string
  entidad: EntidadLicitacion
  objeto: string
  categoria_unspsc: string | null
  modalidad: ModalidadLicitacion
  presupuesto_oficial: number
  lotes: number
  cronograma: CronogramaLicitacion

  // ── Semáforo: valor, por qué, con qué criterio y cuándo ──
  semaforo: Semaforo
  semaforo_motivos: MotivoSemaforo[]
  /** Versión del CRITERIO que produjo este semáforo (SEMAFORO_VERSION del
   *  motor). Invariante 5: no se mueve por efecto colateral. */
  semaforo_version: string
  semaforo_calculado_en: Timestamp
  override_manual: OverrideSemaforo | null

  // ── Estado del proceso ──
  estado: EstadoLicitacion
  motivo_descarte: MotivoDescarte | null

  // ── Resultado (se conoce tarde; null mientras no haya dato) ──
  oferta_neg: number | null
  oferta_ganador: number | null
  ganador: GanadorLicitacion | null
  manifestaciones: number | null
  ofertas_recibidas: number | null

  /**
   * Registro HISTÓRICO importado del registro CM-FT-CPG-26 (sub-bloque 1.3):
   * ~350 procesos de 2022, 2024, 2025 y 2026 que NEG siguió antes de que
   * existiera el módulo. Entran con `origen: 'manual'` y `consecutivo: ''`.
   *
   * La INVARIANTE 6 no aplica cuando esto es `true`: no se retro-numera una
   * serie ISO que no existió. Un Listado Maestro con números inventados hacia
   * atrás es peor que uno que empieza hoy — la serie LIC arranca con la
   * primera licitación nueva.
   *
   * Inmutable: un histórico no se convierte en numerado ni al revés.
   */
  migrado: boolean

  /**
   * Decisión MANUAL sobre la capacidad semanal (1.4). `null` = la licitación
   * cae donde la deje el orden por fecha de cierre (lo normal).
   *
   * La bandeja solo tiene sitio para `capacidad_semanal` activas. Meter una
   * que quedó fuera obliga a sacar otra — y el intercambio queda escrito en
   * LOS DOS documentos (`intercambio_con` apunta al otro), porque "por qué
   * esta y no aquella" es exactamente la pregunta que nadie recuerda tres
   * meses después.
   */
  capacidad_manual: {
    en_capacidad: boolean
    por: string
    en: Timestamp
    motivo: string
    /** Id de la licitación con la que se intercambió el cupo. */
    intercambio_con: string | null
  } | null

  // ── Trazabilidad ──

  /**

   * TRIAGE DEL RADAR (D3): quién sacó este proceso de la sección del radar,

   * admitiéndolo o descartándolo, y cuándo. `null` en todo lo que no pasó por

   * ese triage — incluidas las licitaciones tecleadas a mano, donde no hay

   * nada que revisar. Distinto de `actualizado_por`, que se mueve con cada

   * escritura y a los dos meses ya no responde quién hizo el triage.

   */

  revisado_por: string | null

  revisado_en: Timestamp | null

  responsable_uid: string
  creado_por: string
  creado_en: Timestamp
  actualizado_por: string
  actualizado_en: Timestamp
  /** DERIVADA del estado (invariante 2) — la mantienen los builders. */
  activa: boolean
}

// ── Etiquetas (datos puros; los colores son cosa de la UI, no de aquí) ──────

export const MODALIDAD_LICITACION_LABEL: Record<ModalidadLicitacion, string> = {
  minima_cuantia: 'Mínima cuantía',
  menor_cuantia: 'Menor cuantía',
  licitacion_publica: 'Licitación pública',
  seleccion_abreviada: 'Selección abreviada',
  regimen_especial: 'Régimen especial',
  otra: 'Otra',
}

export const ESTADO_LICITACION_LABEL: Record<EstadoLicitacion, string> = {
  detectada: 'Detectada',
  en_evaluacion: 'En evaluación',
  descartada: 'Descartada',
  en_preparacion: 'En preparación',
  manifestada: 'Manifestada',
  presentada: 'Presentada',
  adjudicada: 'Adjudicada',
  perdida: 'Perdida',
  rechazada: 'Rechazada',
  revocada: 'Revocada',
  desierta: 'Desierta',
}

export const MOTIVO_DESCARTE_LABEL: Record<MotivoDescarte, string> = {
  SORTEO: 'Sorteo de consolidación',
  LIMITACION_MIPYME: 'Limitación a MiPyme territorial',
  EXPERIENCIA: 'Experiencia no acreditable',
  INDICADORES: 'Indicadores financieros',
  BAJO_PRESUPUESTO: 'Presupuesto no rentable',
  UBICACION: 'Ubicación fuera de cobertura',
  CAPACIDAD: 'Capacidad operativa',

  RUIDO_LEXICO: 'El léxico lo trajo por error',

  FUERA_DE_ALCANCE: 'No es el trabajo de NEG',

  PLAZO_IMPOSIBLE: 'Cierra antes de poder armarlo',

  DUPLICADO: 'Ya estaba por otra vía',

  OTRO: 'Otro',
}

/**
 * Por qué el radar lo trajo, en palabras.
 *
 * Solo CUATRO de las siete pueden aparecer en un documento: las otras tres son
 * veredictos `no` y no se persisten. Se etiquetan igual —el tipo las admite y
 * una lectura defensiva no debe quedarse sin texto—, pero no se van a ver.
 */
export const SENAL_LABEL: Record<SenalClasificacion, string> = {
  codigo_en_familia: 'Código de la familia del RUP',
  codigo_en_clase_con_texto: 'Código con adjudicación probada, y el objeto concuerda',
  codigo_en_clase_sin_texto: 'Código con adjudicación probada — el texto no dice nada',
  texto_coincide: 'El objeto coincide con el léxico',
  codigo_fuera_de_familia: 'Código fuera de la familia',
  sin_codigo_ni_texto: 'Ni código ni texto',
  fuera_de_territorio: 'Fuera del territorio',
}

/**
 * De dónde salió la fecha con la que el proceso se ubica en el tiempo.
 *
 * `ninguna` NO es un detalle técnico: desde el PR #252 la corrida automática
 * excluye esas filas, así que una que lo diga entró por el BARRIDO AUTORIZADO
 * del backlog. La bandeja lo dice con todas las letras porque es lo único que
 * explica por qué esa fila no tiene reloj.
 */
export const ORIGEN_FECHA_LABEL: Record<OrigenFecha, string> = {
  publicacion: 'fecha de publicación',
  recepcion_de_ofertas: 'fecha de recepción de ofertas',
  ninguna: 'sin fecha en el origen',
}

export const MOTIVO_SEMAFORO_LABEL: Record<MotivoSemaforo, string> = {
  MODALIDAD_SIN_HISTORIAL: 'Modalidad sin historial de NEG',
  SORTEO: 'El proceso tiene sorteo de consolidación',
  LIMITACION_MIPYME: 'Limitación a MiPyme de otro territorio',
  REQUIERE_LECTURA: 'Requiere lectura del pliego',
}

// ── Máquina de estados ───────────────────────────────────────────────────────

/**
 * Transiciones legales SIN distinguir actor (quién puede cada una lo dirán
 * las reglas y los guards de UI, en su bloque).
 *
 * `descartada -> en_evaluacion` es la ÚNICA reapertura del sistema: descartar
 * es reversible porque se descarta con información incompleta. Los cinco
 * estados de resultado son terminales duros — un resultado no se "corrige",
 * y si el proceso revive es otro proceso.
 */
export const TRANSICIONES_LICITACION: Record<EstadoLicitacion, EstadoLicitacion[]> = {
  detectada:      ['en_evaluacion', 'descartada'],
  en_evaluacion:  ['en_preparacion', 'descartada'],
  en_preparacion: ['manifestada', 'presentada', 'descartada'],
  manifestada:    ['presentada', 'descartada', 'revocada'],
  presentada:     ['adjudicada', 'perdida', 'rechazada', 'revocada', 'desierta'],
  descartada:     ['en_evaluacion'],
  adjudicada:     [],
  perdida:        [],
  rechazada:      [],
  revocada:       [],
  desierta:       [],
}

export function puedeTransicionarLicitacion(de: EstadoLicitacion, a: EstadoLicitacion): boolean {
  return (TRANSICIONES_LICITACION[de] ?? []).includes(a)
}

/** Terminal duro: sin salidas. `descartada` NO es terminal (se reabre). */
export const esLicitacionTerminal = (estado: EstadoLicitacion): boolean =>
  TRANSICIONES_LICITACION[estado]?.length === 0

/**
 * Estados que apagan `activa` (invariante 2): los cinco terminales MÁS
 * `descartada`. Descartada no es terminal pero tampoco está en juego — sale
 * de la bandeja de trabajo hasta que alguien la reabra.
 */
export const ESTADOS_INACTIVOS: EstadoLicitacion[] = [
  'descartada', 'adjudicada', 'perdida', 'rechazada', 'revocada', 'desierta',
]

/** `activa` derivada del estado — fuente única para los patch builders. */
export const esLicitacionActiva = (estado: EstadoLicitacion): boolean =>
  !ESTADOS_INACTIVOS.includes(estado)

/**
 * Estados a los que el PORTERO del semáforo rojo bloquea el paso
 * (invariante 3): comprometerse con el proceso cuesta horas. Evaluar y
 * descartar siguen libres — leer para decidir no cuesta nada.
 */
export const ESTADOS_TRAS_PORTERO: EstadoLicitacion[] = [
  'en_preparacion', 'manifestada', 'presentada',
]

/**
 * Estados que EXIGEN consecutivo (invariante 6): los tres de compromiso más
 * los cinco de resultado. Complemento exacto: `detectada`, `en_evaluacion` y
 * `descartada` — los tres de triage, donde todavía no se gastó nada.
 *
 * `descartada` está FUERA a propósito y la implicación va en UN solo sentido:
 * admite el consecutivo vacío (lo normal, se descartó antes de materializar)
 * pero también admite uno asignado (se materializó y después se descartó —
 * el número se conserva).
 */
export const ESTADOS_EXIGEN_CONSECUTIVO: EstadoLicitacion[] = [
  'en_preparacion', 'manifestada', 'presentada',
  'adjudicada', 'perdida', 'rechazada', 'revocada', 'desierta',
]

/** Formato de la serie: LIC-AAAA-NNNN con padding mínimo 4 (extensible). */
export const PATRON_CONSECUTIVO_LIC = /^LIC-\d{4}-\d{4,}$/

export function esConsecutivoLicValido(c: string): boolean {
  return PATRON_CONSECUTIVO_LIC.test(c)
}

// ── Validadores puros de las invariantes ─────────────────────────────────────

/** Invariante 1: descartada <=> motivo_descarte presente. */
export function motivoDescarteConsistente(
  estado: EstadoLicitacion, motivo: MotivoDescarte | null,
): boolean {
  return estado === 'descartada' ? motivo !== null : motivo === null
}

/** Invariante 2: activa es exactamente la negación de "estado inactivo". */
export function activaConsistente(estado: EstadoLicitacion, activa: boolean): boolean {
  return activa === esLicitacionActiva(estado)
}

/**
 * Invariante 3 (portero): ¿el semáforo deja pasar a `destino`?
 * Rojo bloquea los tres estados de compromiso; con override registrado, pasa.
 */
export function porteroPermite(
  l: Pick<Licitacion, 'semaforo' | 'override_manual'>, destino: EstadoLicitacion,
): boolean {
  if (l.semaforo !== 'rojo') return true
  if (!ESTADOS_TRAS_PORTERO.includes(destino)) return true
  return l.override_manual !== null
}

/** Invariante 4: forma mínima auditable de un override. */
export function overrideValido(o: OverrideSemaforo | null): boolean {
  if (o === null) return true
  return o.por.trim() !== '' && o.motivo.trim() !== ''
}

/**
 * Invariante 6: los estados de compromiso y resultado exigen consecutivo.
 * Implicación en UN sentido — los tres de triage no exigen nada, ni vacío ni
 * lleno (una descartada puede conservar el número que quemó).
 *
 * EXCEPCIÓN de los MIGRADOS (1.3): un histórico importado no lleva número
 * porque la serie no existía cuando ocurrió. Ver el campo `migrado`.
 */
export function consecutivoConsistente(
  estado: EstadoLicitacion, consecutivo: string, migrado = false,
): boolean {
  if (migrado) return true
  if (!ESTADOS_EXIGEN_CONSECUTIVO.includes(estado)) return true
  return consecutivo !== ''
}

/** ¿Este destino exige número PARA ESTE documento? (migrado nunca lo exige). */
export function exigeConsecutivo(
  destino: EstadoLicitacion, migrado: boolean,
): boolean {
  return !migrado && ESTADOS_EXIGEN_CONSECUTIVO.includes(destino)
}

/**
 * Invariante 7: `consecutivo` es inmutable una vez asignado. Legales solo dos
 * casos — que no cambie, o la asignación inicial desde `''` con el formato de
 * la serie. Reescribir, limpiar o asignar basura: ilegal.
 */
export function transicionConsecutivoValida(anterior: string, nuevo: string): boolean {
  if (nuevo === anterior) return true
  if (anterior !== '') return false          // reescritura o borrado
  return esConsecutivoLicValido(nuevo)       // asignación inicial
}

/** Las invariantes de forma, juntas — útil para aserciones de test. */
export function licitacionConsistente(l: Licitacion): boolean {
  return motivoDescarteConsistente(l.estado, l.motivo_descarte)
      && activaConsistente(l.estado, l.activa)
      && overrideValido(l.override_manual)
      && consecutivoConsistente(l.estado, l.consecutivo, l.migrado)
}

// ── Derivados (NO se persisten — mismo criterio que `validez_dias`) ─────────

/**
 * Oferta de NEG como % del presupuesto oficial (0–100, convención `pct` de
 * la casa: `iva_pct`, `margen`, `aiu_defaults`). `null` si falta la oferta o
 * el presupuesto no es positivo — jamás una división por cero disfrazada.
 */
export function pctNeg(l: Pick<Licitacion, 'oferta_neg' | 'presupuesto_oficial'>): number | null {
  if (l.oferta_neg === null) return null
  if (l.presupuesto_oficial <= 0) return null
  return (l.oferta_neg / l.presupuesto_oficial) * 100
}

/** Oferta ganadora como % del presupuesto oficial. Mismas guardas. */
export function pctGanador(l: Pick<Licitacion, 'oferta_ganador' | 'presupuesto_oficial'>): number | null {
  if (l.oferta_ganador === null) return null
  if (l.presupuesto_oficial <= 0) return null
  return (l.oferta_ganador / l.presupuesto_oficial) * 100
}

// ── Patch builders puros ─────────────────────────────────────────────────────
// Devuelven `null` si el movimiento no es legal desde el estado actual.
// El timestamp lo pone el caller (Timestamp.now()) para mantenerlos puros.
// Ninguno escribe `activa` a mano: siempre sale de esLicitacionActiva().

/** Quién ejecuta el movimiento (alimenta `actualizado_por`). */
export interface ActorLicitacion {
  uid: string
}

/** Campos de trazabilidad que TODO patch arrastra. */
interface SelloPatch {
  actualizado_por: string
  actualizado_en: Timestamp
}

const sello = (actor: ActorLicitacion, ahora: Timestamp): SelloPatch => ({
  actualizado_por: actor.uid,
  actualizado_en: ahora,
})

/**

 * SELLO DEL TRIAGE DEL RADAR (D3).

 *

 * Quién sacó un proceso de la sección del radar — admitiéndolo o descartándolo

 * — y cuándo. NO es lo mismo que `actualizado_por`: ese se mueve con cada

 * escritura posterior y a los dos meses ya no dice quién hizo el triage, que es

 * justamente la pregunta ("¿quién metió esto a la semana de alguien?").

 *

 * SOLO se sella cuando el proceso VINO DEL RADAR y está en `detectada`: en una

 * licitación tecleada a mano no hay triage que registrar, y poner "revisada"

 * sobre algo que nadie revisó sería un campo que miente.

 *

 * Quién PUEDE hacerlo no se restringe aquí: cualquiera con

 * `gestionaLicitaciones()`, que es la misma puerta por la que ya lee la

 * colección. No se inventa un dueño que las reglas no pueden sostener, y

 * restringirlo solo en la UI no sería un control — es la lección de SGI/SST.

 * Lo que sí queda es la traza.

 */

function selloTriage(

  l: Pick<Licitacion, 'estado'> & Partial<Pick<Licitacion, 'radar'>>,

  actor: ActorLicitacion, ahora: Timestamp,

): Partial<{ revisado_por: string; revisado_en: Timestamp }> {

  if (l.estado !== 'detectada' || !esDelRadar(l)) return {}

  return { revisado_por: actor.uid, revisado_en: ahora }

}



/**

 * Avance normal por la máquina de estados. NO cubre `descartada` (la dueña
 * de la invariante 1 es `patchDescartarLicitacion`) ni la reapertura desde
 * descartada (`patchReabrirLicitacion`) — cada invariante tiene un solo
 * dueño, así no hay dos caminos que puedan divergir.
 *
 * Aplica el PORTERO (invariante 3) antes que nada.
 *
 * CONSECUTIVO (invariantes 6 y 7): al avanzar a un estado que lo exige y la
 * licitación todavía no lo tiene, hay que pasarlo en `opciones.consecutivo` y
 * viaja EN EL MISMO PATCH — nunca en una escritura aparte, o existiría un
 * instante con el documento en `en_preparacion` sin número. El caller lo
 * obtiene de la CF `generarConsecutivo('LIC')` justo antes.
 */
export interface FechasCronograma {
  manifestacion?: Timestamp | null
  sorteo?: Timestamp | null
  cierre?: Timestamp | null
}

/**
 * ¿Las fechas van en orden? manifestación ≤ sorteo ≤ cierre.
 *
 * Las ausentes no opinan: un cronograma con sorteo y sin manifestación es
 * perfectamente válido — quiere decir que todavía no se sabe la primera, no
 * que el orden esté mal.
 */
export function ordenCronogramaValido(f: FechasCronograma): boolean {
  const ms = (t: Timestamp | null | undefined) => t?.toMillis?.() ?? null
  const m = ms(f.manifestacion), so = ms(f.sorteo), c = ms(f.cierre)
  if (m !== null && so !== null && m > so) return false
  if (so !== null && c !== null && so > c) return false
  if (m !== null && c !== null && m > c) return false
  return true
}

/**
 * Patch de las fechas del cronograma que una PERSONA escribe.
 *
 * ── POR QUÉ ESTO EXISTE ────────────────────────────────────────
 * El límite de manifestación de interés y la fecha de sorteo NO EXISTEN en
 * datos abiertos — medido sobre 10.421 procesos de 2026. Si alguien las
 * escribe, este documento es el único lugar del mundo donde están.
 *
 * En MENOR CUANTÍA la de manifestación es la que manda: quien no manifestó
 * interes antes del límite no puede presentar oferta, aunque la fecha de cierre
 * siga vigente. El cierre llega a los 9 días (mediana) de publicado el proceso
 * y la puerta se cierra sobre el día 5.
 *
 * Solo toca las claves que vienen en `fechas`: lo que no se menciona no se
 * mueve. `null` explícito SÍ limpia — es una persona diciendo "me equivoqué".
 */
export function patchCronogramaManual(
  l: Pick<Licitacion, 'cronograma'>, fechas: FechasCronograma,
  actor: ActorLicitacion, ahora: Timestamp,
) {
  if (!actor.uid.trim()) return null
  const cronograma = { ...l.cronograma }
  let toco = false
  for (const k of ['manifestacion', 'sorteo', 'cierre'] as const) {
    if (!(k in fechas)) continue
    const v = fechas[k] ?? null
    if ((cronograma[k]?.toMillis?.() ?? null) === (v?.toMillis?.() ?? null)) continue
    cronograma[k] = v
    toco = true
  }
  if (!toco) return null
  if (!ordenCronogramaValido(cronograma)) return null
  return { cronograma, actualizado_por: actor.uid, actualizado_en: ahora }
}

export function patchAvanzarLicitacion(
  l: Licitacion, destino: EstadoLicitacion, actor: ActorLicitacion, ahora: Timestamp,
  opciones?: { consecutivo?: string },
) {
  if (destino === 'descartada') return null          // -> patchDescartarLicitacion
  if (l.estado === 'descartada') return null         // -> patchReabrirLicitacion
  if (!puedeTransicionarLicitacion(l.estado, destino)) return null
  if (!porteroPermite(l, destino)) return null       // invariante 3

  const propuesto = opciones?.consecutivo
  const yaTiene = l.consecutivo !== ''
  const exige = exigeConsecutivo(destino, l.migrado)

  // Invariante 7: si ya tiene número, nadie lo reescribe — ni pasando el mismo.
  if (propuesto !== undefined && yaTiene) return null
  // Fuera de los estados que lo exigen no se quema número (contigüidad ISO).
  if (propuesto !== undefined && !exige) return null
  // Invariante 6: el destino lo exige y no hay de dónde sacarlo.
  if (exige && !yaTiene && propuesto === undefined) return null
  // Formato de la serie (invariante 7, asignación inicial).
  if (propuesto !== undefined && !esConsecutivoLicValido(propuesto)) return null

  return {
    estado: destino,
    activa: esLicitacionActiva(destino),             // invariante 2
    motivo_descarte: null,                           // invariante 1
    // Solo aparece en la asignación inicial; si ya lo tenía, ni se toca.

    ...(propuesto !== undefined ? { consecutivo: propuesto } : {}),

    // ADMITIR una fila del radar ES el triage: sale de la sección del radar y

    // entra a competir por el cupo de la semana. Vacio en cualquier otro caso.

    ...selloTriage(l, actor, ahora),

    ...sello(actor, ahora),

  }

}

/**
 * Descarte con motivo OBLIGATORIO (invariante 1). Legal desde cualquier
 * estado que liste `descartada` como salida; el portero no aplica —
 * descartar nunca está bloqueado.
 */
export function patchDescartarLicitacion(
  l: Licitacion, actor: ActorLicitacion, ahora: Timestamp, motivo: MotivoDescarte,
) {
  if (!puedeTransicionarLicitacion(l.estado, 'descartada')) return null
  if (!MOTIVOS_DESCARTE.includes(motivo)) return null
  return {
    estado: 'descartada' as EstadoLicitacion,
    activa: esLicitacionActiva('descartada'),        // false, invariante 2
    motivo_descarte: motivo,                         // invariante 1

    // DESCARTAR desde `detectada` tambien es triage. Desde otro estado no:

    // ahi el proceso ya habia sido admitido y revisado por alguien.

    ...selloTriage(l, actor, ahora),

    ...sello(actor, ahora),
  }
}

/**
 * Reapertura — la única del sistema. Vuelve a `en_evaluacion` y LIMPIA el
 * motivo de descarte (invariante 1: fuera de descartada, motivo === null).
 */
export function patchReabrirLicitacion(
  l: Licitacion, actor: ActorLicitacion, ahora: Timestamp,
) {
  if (l.estado !== 'descartada') return null
  return {
    estado: 'en_evaluacion' as EstadoLicitacion,
    activa: esLicitacionActiva('en_evaluacion'),     // true, invariante 2
    motivo_descarte: null,                           // invariante 1
    ...sello(actor, ahora),
  }
}

/**
 * Override manual del semáforo (invariante 4). `semaforo_anterior` NO lo
 * elige el caller: sale del documento, así no se puede falsear. Exige `por`
 * y `motivo` no vacíos.
 *
 * Un override que MANTIENE el rojo es legítimo y es el caso central del
 * portero: "sé que está en rojo, entro igual y queda escrito por qué".
 */
export function patchOverrideSemaforo(
  l: Licitacion, actor: ActorLicitacion, ahora: Timestamp,
  destino: { semaforo: Semaforo; motivo: string },
) {
  if (!actor.uid.trim()) return null
  if (!destino.motivo.trim()) return null
  if (!SEMAFOROS.includes(destino.semaforo)) return null
  const override: OverrideSemaforo = {
    por: actor.uid,
    en: ahora,
    motivo: destino.motivo.trim(),
    semaforo_anterior: l.semaforo,                   // valor real previo
  }
  return {
    semaforo: destino.semaforo,
    override_manual: override,
    ...sello(actor, ahora),
  }
}

/**
 * CAPTURA OBLIGATORIA AL PRESENTAR (1.4).
 *
 * `presentada` es el único momento en que estos tres datos existen y alguien
 * los tiene a la vista. Si no se piden acá, no se piden nunca — y sin
 * `manifestaciones` no hay `probabilidadSorteo`, sin `ofertas_recibidas` no
 * hay medición de competencia (la hipótesis de v1.1 del registro de
 * versiones), y sin `oferta_neg` no hay `pctNeg`.
 */
export interface DatosPresentacion {
  oferta_neg: number
  manifestaciones: number
  ofertas_recibidas: number
}

/** ¿Están los tres datos y son números sanos? */
export function datosPresentacionCompletos(d: Partial<DatosPresentacion>): boolean {
  const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0
  return ok(d.oferta_neg) && ok(d.manifestaciones) && ok(d.ofertas_recibidas)
}

/**
 * El checklist del pliego, para el gate de la invariante 8.
 *
 * Se pasa EXPLÍCITAMENTE y es OBLIGATORIO a propósito: con un parámetro
 * opcional, olvidarlo dejaría el gate inerte sin que nada avise — una
 * invariante que no se aplica es peor que no tenerla, porque se cita como
 * garantía. El tipo obliga a que cada camino diga con qué checklist presenta.
 */
export interface DatosCumplimiento {
  requisitos: readonly Pick<Requisito, 'estado'>[]
  /** Presentarse a sabiendas, con motivo escrito. Ver `puedePresentar`. */
  override?: OverrideCumplimiento | null
}

/**
 * Transición a `presentada` CON la captura y CON el gate de cumplimiento.
 * Sin los tres datos, o con el checklist abierto, devuelve `null` — el botón
 * de la UI se deshabilita con los mismos predicados, así que cada regla vive
 * en un solo lugar.
 */
export function patchPresentarLicitacion(
  l: Licitacion, actor: ActorLicitacion, ahora: Timestamp,
  datos: Partial<DatosPresentacion>,
  cumplimiento: DatosCumplimiento,
) {
  if (!puedeTransicionarLicitacion(l.estado, 'presentada')) return null
  if (!porteroPermite(l, 'presentada')) return null
  if (!datosPresentacionCompletos(datos)) return null
  // Invariante 8 — el checklist manda.
  if (!puedePresentar(cumplimiento.requisitos, cumplimiento.override)) return null
  // `presentada` exige consecutivo (invariante 6): debe venir de en_preparacion
  // o manifestada, que ya lo tienen. Un migrado está exento.
  if (exigeConsecutivo('presentada', l.migrado) && l.consecutivo === '') return null

  return {
    estado: 'presentada' as EstadoLicitacion,
    activa: esLicitacionActiva('presentada'),
    motivo_descarte: null,
    oferta_neg: datos.oferta_neg!,
    manifestaciones: datos.manifestaciones!,
    ofertas_recibidas: datos.ofertas_recibidas!,
    ...sello(actor, ahora),
  }
}

/** Cierre con resultado conocido: exige quién ganó y con cuánto. */
export interface DatosResultado {
  oferta_ganador: number
  ganador: GanadorLicitacion
}

export function datosResultadoCompletos(d: Partial<DatosResultado>): boolean {
  const monto = typeof d.oferta_ganador === 'number'
    && Number.isFinite(d.oferta_ganador) && d.oferta_ganador >= 0
  return monto && !!d.ganador && d.ganador.nombre.trim() !== ''
}

/**
 * Cierre en `adjudicada` o `perdida`. Ambos exigen saber quién ganó y con
 * cuánto — incluso el propio: sin `oferta_ganador` no hay `pctGanador`, y sin
 * eso el histórico no sirve para calibrar nada.
 *
 * Los otros tres terminales (rechazada, revocada, desierta) NO pasan por acá:
 * en ellos no hubo ganador que registrar. Van por `patchAvanzarLicitacion`.
 */
export function patchCerrarConResultado(
  l: Licitacion, destino: 'adjudicada' | 'perdida',
  actor: ActorLicitacion, ahora: Timestamp, datos: Partial<DatosResultado>,
) {
  if (!puedeTransicionarLicitacion(l.estado, destino)) return null
  if (!datosResultadoCompletos(datos)) return null
  return {
    estado: destino as EstadoLicitacion,
    activa: esLicitacionActiva(destino),
    motivo_descarte: null,
    oferta_ganador: datos.oferta_ganador!,
    ganador: {
      nombre: datos.ganador!.nombre.trim(),
      nit: (datos.ganador!.nit ?? '').trim(),
    },
    ...sello(actor, ahora),
  }
}

/** Resultado del motor puro (`utils/sigp/semaforo.ts`), sin importarlo. */
export interface ResultadoSemaforoLicitacion {
  semaforo: Semaforo
  motivos: MotivoSemaforo[]
  version: string
}

/**
 * Declaración EXPLÍCITA de cambio de criterio (invariante 5). Obligatoria
 * cuando la versión del motor difiere de la guardada; prohibida cuando
 * coincide (afirmar un cambio que no ocurre también es ruido de auditoría).
 */
export interface CambioDeVersionSemaforo {
  motivo: string
  /** Debe coincidir con el `semaforo_version` real del documento. */
  version_anterior: string
}

/**
 * Recálculo del semáforo (invariante 5).
 *
 *  - MISMA versión: se refresca valor, motivos y fecha. `semaforo_version`
 *    NO aparece en el patch — la prueba de que no se mutó.
 *  - VERSIÓN DISTINTA: se exige `cambio` con motivo no vacío y
 *    `version_anterior` igual al valor real del documento. Sin eso devuelve
 *    `null`: un criterio nuevo jamás entra como efecto colateral.
 *
 * NO toca `override_manual`: una decisión humana no se borra sola. El
 * override queda como registro del acto que fue, con el `semaforo_anterior`
 * que era cierto en su momento.
 */
export function patchRecalcularSemaforo(
  l: Licitacion, r: ResultadoSemaforoLicitacion, ahora: Timestamp,
  cambio?: CambioDeVersionSemaforo,
) {
  const mismaVersion = r.version === l.semaforo_version

  if (mismaVersion) {
    if (cambio) return null                          // no hay cambio que declarar
    return {
      semaforo: r.semaforo,
      semaforo_motivos: r.motivos,
      semaforo_calculado_en: ahora,
      // semaforo_version deliberadamente AUSENTE (invariante 5)
    }
  }

  if (!cambio) return null                           // invariante 5
  if (!cambio.motivo.trim()) return null
  if (cambio.version_anterior !== l.semaforo_version) return null

  return {
    semaforo: r.semaforo,
    semaforo_motivos: r.motivos,
    semaforo_calculado_en: ahora,
    semaforo_version: r.version,                     // acto explícito
  }
}
