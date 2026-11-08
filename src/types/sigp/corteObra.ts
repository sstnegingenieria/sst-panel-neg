// CORTE DE AVANCE DE OBRA (07-nov-2026) — modelo del documento que Giovanny
// armaba a mano (CORTE-01-SENA-INTERCENTROS-COT-2026-063). Principios fijados:
//
//  - El AVANCE se captura POR ÍTEM cuando OCURRE (lección del acta de Claro:
//    capturar en el momento, no reconstruir al cierre) — sobre el MISMO ítem
//    del alcance que ya asigna y liquida (items_alcance: una sola verdad).
//    Capturan los GESTORES; la evidencia es opcional, EL AUTOR NO: cada
//    registro guarda quién midió y cuándo, por ítem.
//  - El CORTE es GENERADO, no armado a mano: congela el acumulado al emitir
//    (consecutivo CRT, snapshot, hash). Un corte entregado es un HECHO, no
//    una vista: corregir el avance después NO cambia el delta de un corte
//    emitido — solo afecta los siguientes (la base del corte N+1 es el
//    ACUMULADO CONGELADO del corte N, jamás re-derivado).
//  - Capturan gestores, EMITE GERENCIA (el corte sustenta una factura: quien
//    mide no puede ser quien la emite — misma segregación definir/aprobar).
//  - Si entra una VERSIÓN DE CAMBIO tras un corte emitido, el siguiente dice
//    contra qué alcance mide (cotizacion_version_medida) y los avances de
//    ítems que salieron del alcance quedan listados como huérfanos, visibles.
//  - LÍMITE: el resumen económico usa los % del CONTRATO congelados en la
//    versión aprobada de la cotización (AIU con IVA sobre la U, o IVA pleno).
import { Timestamp } from 'firebase/firestore'
import type { Proyecto, ItemAlcance, EntradaHistorialProyecto } from './proyecto'
import type { ConfigAIU, EsquemaTributario } from './cotizacion'

export const IVA_PCT_CORTE = 19

// ── Avance vivo (en el PROYECTO) ─────────────────────────────────────────────

export interface RegistroAvance {
  fecha: Timestamp
  por: string
  por_nombre?: string
  /** Cantidad ACUMULADA tras este registro (no delta — lo que se mide en
   *  campo es "cuánto va", y el acumulado no depende de la aritmética del
   *  capturador). */
  cantidad: number
  nota?: string
}

export interface AvanceItem {
  /** La clave del ítem en snapshot.items_alcance — la verdad del átomo. */
  clave: string
  /** Cantidad ejecutada ACUMULADA vigente. */
  cantidad: number
  /** Quién midió y cuándo, registro a registro (append-only). */
  registros: RegistroAvance[]
}

export const avanceDe = (
  p: Pick<Proyecto, 'avance_items'>, clave: string,
): AvanceItem | undefined => (p.avance_items ?? []).find(a => a.clave === clave)

/** % de un ítem por CANTIDAD (tope visual 100 no se aplica aquí — la sobre-
 *  ejecución es un hecho que se muestra, no se recorta). */
export const pctItem = (item: Pick<ItemAlcance, 'cantidad'>, avance?: Pick<AvanceItem, 'cantidad'>): number =>
  item.cantidad > 0 ? ((avance?.cantidad ?? 0) / item.cantidad) * 100 : 0

export type EstadoItemAvance = 'sin_avance' | 'en_ejecucion' | 'ejecutado'
export const estadoItemAvance = (pct: number): EstadoItemAvance =>
  pct <= 0 ? 'sin_avance' : pct >= 100 ? 'ejecutado' : 'en_ejecucion'
export const ESTADO_ITEM_LABEL: Record<EstadoItemAvance, string> = {
  sin_avance: 'Sin avance', en_ejecucion: 'En ejecución', ejecutado: 'Ejecutado',
}

/** Valor ejecutado acumulado de un ítem (proporcional por cantidad, al peso). */
export const valorEjecutadoItem = (item: Pick<ItemAlcance, 'cantidad' | 'valor_total'>, cantidadAcum: number): number =>
  item.cantidad > 0 ? Math.round(item.valor_total * (cantidadAcum / item.cantidad)) : 0

/** Registrar/actualizar el avance de UN ítem — PURO. Guarda el autor SIEMPRE
 *  (un avance sin autor no es evidencia de nada); la cantidad es la
 *  ACUMULADA medida. Sobre-ejecución (> contratada) se acepta y se devuelve
 *  el aviso (advertir, no bloquear). */
export function patchRegistrarAvance(
  p: Pick<Proyecto, 'avance_items' | 'snapshot'>,
  clave: string,
  cantidadAcum: number,
  uid: string,
  fecha: Timestamp,
  nombre?: string,
  nota?: string,
): { avance_items: AvanceItem[]; sobreEjecutado: boolean; item: ItemAlcance } | null {
  const item = (p.snapshot.items_alcance ?? []).find(i => i.clave === clave)
  if (!item) return null
  if (!(cantidadAcum >= 0)) return null
  const registro: RegistroAvance = {
    fecha, por: uid, ...(nombre ? { por_nombre: nombre } : {}),
    cantidad: cantidadAcum, ...(nota?.trim() ? { nota: nota.trim() } : {}),
  }
  const lista = [...(p.avance_items ?? [])]
  const idx = lista.findIndex(a => a.clave === clave)
  if (idx >= 0) lista[idx] = { ...lista[idx], cantidad: cantidadAcum, registros: [...lista[idx].registros, registro] }
  else lista.push({ clave, cantidad: cantidadAcum, registros: [registro] })
  return { avance_items: lista, sobreEjecutado: cantidadAcum > item.cantidad, item }
}

// ── El CORTE (subcolección proyectos/{id}/cortes) ────────────────────────────

export interface ItemCorte {
  clave: string
  codigo?: string
  descripcion: string
  unidad: string
  grupo: string
  cantidad_contratada: number
  valor_unitario: number
  valor_contratado: number
  cantidad_acum: number
  pct: number
  valor_acum: number
  estado: EstadoItemAvance
}

export interface ResumenEconomicoCorte {
  esquema: EsquemaTributario
  aiu_pct?: ConfigAIU
  /** El FACTURABLE del corte se calcula sobre el DELTA de CD. */
  delta_cd: number
  admin: number
  imprevistos: number
  utilidad: number
  base_iva: number
  iva: number
  /** Total facturable del corte (lo que sustenta la factura parcial). */
  total: number
}

// ── Tipo de corte (08-nov) ───────────────────────────────────────────────────
// FACTURABLE: sustenta una factura — su delta mueve la base de cobro.
// INFORMATIVO: congela el acumulado y genera PDF (un hecho fechado para el
// cliente o una reunión), pero NO mueve la base — el siguiente facturable
// mide contra el ÚLTIMO FACTURABLE, jamás contra el informativo (si midiera
// contra "el anterior a secas", un informativo se comería el trabajo que
// había que cobrar). Ausente = facturable (cortes previos a esta fecha).
export type TipoCorte = 'facturable' | 'informativo'
export const TIPO_CORTE_LABEL: Record<TipoCorte, string> = {
  facturable: 'Facturable',
  informativo: 'Informativo — no facturable',
}
export const esCorteFacturable = (c: Pick<CorteObra, 'tipo'>): boolean =>
  c.tipo !== 'informativo'

export interface CorteObra {
  consecutivo: string          // CRT-YYYY-NNN (al emitir)
  numero_corte: number         // 1, 2, 3… dentro del proyecto
  /** Ausente = facturable (legacy). Un informativo congela y documenta pero
   *  su delta NO es base de cobro ni admite factura que lo referencie. */
  tipo?: TipoCorte
  proyecto_id: string
  proyecto_consecutivo: string
  cliente: string
  // Forma del modelo SENA (08-nov): cabecera de 6 campos + referencia a la
  // cotización + firma del emisor — el documento sale a un cliente del
  // Estado y la forma importa.
  cliente_nit?: string
  /** Persona nombrada del lado del cliente (contacto del snapshot/cliente). */
  contacto?: string
  /** Referencias de CONTRATO del cliente (p. ej. SENA: CO1.PCCNTR.9961018 ·
   *  MC-RDC-CFAFC-0011-2026) — salen de `clientes.contratos` al emitir. */
  contrato_referencias?: string[]
  moneda?: string              // 'COP'
  cotizacion_consecutivo?: string
  nombre_sitio?: string
  fecha_emision: Timestamp
  emitido_por: string
  emitido_por_nombre?: string
  /** Firma de quien emite: nombre, área, correo y teléfono. */
  emisor?: { nombre: string; area: string; correo?: string; telefono?: string }
  /** Contra qué alcance mide (la versión aprobada vigente al emitir). */
  cotizacion_version_medida?: number
  /** Si difiere de la del corte anterior: la nota VISIBLE del cambio. */
  nota_version_cambio?: string
  /** Avances de ítems que YA NO están en el alcance vigente (cambio de
   *  alcance posterior) — huérfanos listados, jamás silenciados. */
  items_fuera_de_alcance?: { clave: string; cantidad: number }[]
  items: ItemCorte[]
  cd_contratado: number
  /** Acumulado del corte ANTERIOR (congelado allá) — la base del delta. */
  cd_acum_anterior: number
  cd_acum: number
  pct_global: number
  resumen: ResumenEconomicoCorte
  observaciones?: string
  pdf_url?: string
  pdf_nombre?: string
  pdf_hash?: string            // SHA-256 (regla 8)
  fecha_creacion: Timestamp
}

/** Resumen económico sobre el DELTA, con los % del contrato (AIU: IVA solo
 *  sobre la U — la mecánica exacta de calcularTotales; iva_pleno: IVA sobre
 *  el delta). Redondeo a peso por componente. */
export function resumenEconomicoCorte(
  deltaCd: number, esquema: EsquemaTributario, aiu?: ConfigAIU,
): ResumenEconomicoCorte {
  if (esquema === 'aiu') {
    const a = aiu ?? { admin: 0, imprevistos: 0, utilidad: 0 }
    const admin = Math.round(deltaCd * a.admin / 100)
    const imprevistos = Math.round(deltaCd * a.imprevistos / 100)
    const utilidad = Math.round(deltaCd * a.utilidad / 100)
    const iva = Math.round(utilidad * IVA_PCT_CORTE / 100)
    return { esquema, aiu_pct: a, delta_cd: deltaCd, admin, imprevistos, utilidad, base_iva: utilidad, iva, total: deltaCd + admin + imprevistos + utilidad + iva }
  }
  const iva = Math.round(deltaCd * IVA_PCT_CORTE / 100)
  return { esquema, delta_cd: deltaCd, admin: 0, imprevistos: 0, utilidad: 0, base_iva: deltaCd, iva, total: deltaCd + iva }
}

export type ResultadoCorte =
  | { ok: true; corte: Omit<CorteObra, 'consecutivo' | 'fecha_emision' | 'emitido_por' | 'emitido_por_nombre' | 'fecha_creacion' | 'pdf_url' | 'pdf_nombre' | 'pdf_hash'> }
  | { ok: false; error: string }

/** Construye el corte N — PURO. La BASE del delta sale del ÚLTIMO corte
 *  FACTURABLE emitido (congelado allá) — un informativo intermedio no la
 *  mueve; corregir el avance después de emitir jamás cambia el delta de lo
 *  ya entregado. El número de corte sí es correlativo sobre TODOS. */
export function construirCorte(args: {
  proyecto: Pick<Proyecto, 'id' | 'consecutivo' | 'snapshot' | 'avance_items' | 'cotizacion_version' | 'cotizacion_consecutivo'>
  cortesPrevios: Pick<CorteObra, 'numero_corte' | 'cd_acum' | 'cotizacion_version_medida' | 'tipo'>[]
  esquema: EsquemaTributario
  aiu?: ConfigAIU
  /** Default 'facturable'. Informativo: mismo snapshot/resumen, delta
   *  ROTULADO no-facturable; admite delta 0 (constancia fechada sin avance
   *  nuevo), jamás negativo. */
  tipo?: TipoCorte
  observaciones?: string
  /** Forma SENA: referencias de contrato del cliente (clientes.contratos). */
  contratoReferencias?: string[]
}): ResultadoCorte {
  const { proyecto, cortesPrevios } = args
  const tipo: TipoCorte = args.tipo ?? 'facturable'
  const items_alcance = proyecto.snapshot.items_alcance ?? []
  if (items_alcance.length === 0) return { ok: false, error: 'El proyecto no tiene ítems de alcance (items_alcance) — corte no disponible' }
  const avances = proyecto.avance_items ?? []
  if (avances.length === 0) return { ok: false, error: 'No hay avance capturado — el corte se genera del avance, no se arma a mano' }

  const ordenados = [...cortesPrevios].sort((a, b) => b.numero_corte - a.numero_corte)
  const previo = ordenados[0]
  // La base de cobro: el último FACTURABLE (ausencia de tipo = facturable,
  // legacy). Los informativos intermedios no mueven esta base.
  const previoFacturable = ordenados.find(c => esCorteFacturable(c))
  const items: ItemCorte[] = items_alcance.map(it => {
    const av = avances.find(a => a.clave === it.clave)
    const cantidadAcum = av?.cantidad ?? 0
    const pct = pctItem(it, av)
    const valorAcum = valorEjecutadoItem(it, cantidadAcum)
    return {
      clave: it.clave, ...(it.codigo ? { codigo: it.codigo } : {}),
      descripcion: it.descripcion, unidad: it.unidad, grupo: it.grupo,
      cantidad_contratada: it.cantidad,
      valor_unitario: it.cantidad > 0 ? Math.round(it.valor_total / it.cantidad) : 0,
      valor_contratado: it.valor_total,
      cantidad_acum: cantidadAcum, pct, valor_acum: valorAcum,
      estado: estadoItemAvance(pct),
    }
  })
  const cd_contratado = items.reduce((s, i) => s + i.valor_contratado, 0)
  const cd_acum = items.reduce((s, i) => s + i.valor_acum, 0)
  const cd_acum_anterior = previoFacturable?.cd_acum ?? 0
  const deltaCd = cd_acum - cd_acum_anterior
  if (deltaCd < 0) return { ok: false, error: `El acumulado (${cd_acum}) quedó POR DEBAJO de la base del último corte facturable (${cd_acum_anterior}) — hay una inconsistencia que resolver (avance corregido a la baja o cambio de alcance), no un corte que emitir` }
  if (deltaCd === 0 && tipo === 'facturable') return { ok: false, error: `El acumulado (${cd_acum}) no supera la base del último corte facturable (${cd_acum_anterior}) — no hay avance nuevo que cobrar. Si lo que se necesita es una constancia fechada del estado de la obra, emite un corte INFORMATIVO` }

  // Huérfanos: avance de claves que YA no están en el alcance vigente
  const claves = new Set(items_alcance.map(i => i.clave))
  const huerfanos = avances.filter(a => !claves.has(a.clave)).map(a => ({ clave: a.clave, cantidad: a.cantidad }))

  const versionMedida = proyecto.cotizacion_version
  const notaCambio = previo && previo.cotizacion_version_medida != null && versionMedida != null
    && previo.cotizacion_version_medida !== versionMedida
    ? `Este corte mide contra la versión v${versionMedida} del alcance; el corte ${previo.numero_corte} midió contra v${previo.cotizacion_version_medida} (cambio de alcance aprobado entre cortes).`
    : undefined

  return {
    ok: true,
    corte: {
      numero_corte: (previo?.numero_corte ?? 0) + 1,
      tipo,
      proyecto_id: proyecto.id,
      proyecto_consecutivo: proyecto.consecutivo,
      cliente: proyecto.snapshot.cliente,
      ...(proyecto.snapshot.cliente_nit ? { cliente_nit: proyecto.snapshot.cliente_nit } : {}),
      ...(proyecto.snapshot.contacto ? { contacto: proyecto.snapshot.contacto } : {}),
      ...(args.contratoReferencias?.length ? { contrato_referencias: args.contratoReferencias } : {}),
      moneda: 'COP',
      ...(proyecto.cotizacion_consecutivo ? { cotizacion_consecutivo: proyecto.cotizacion_consecutivo } : {}),
      ...(proyecto.snapshot.nombre_sitio ? { nombre_sitio: proyecto.snapshot.nombre_sitio } : {}),
      ...(versionMedida != null ? { cotizacion_version_medida: versionMedida } : {}),
      ...(notaCambio ? { nota_version_cambio: notaCambio } : {}),
      ...(huerfanos.length ? { items_fuera_de_alcance: huerfanos } : {}),
      items, cd_contratado, cd_acum_anterior, cd_acum,
      pct_global: cd_contratado > 0 ? (cd_acum / cd_contratado) * 100 : 0,
      resumen: resumenEconomicoCorte(deltaCd, args.esquema, args.aiu),
      ...(args.observaciones?.trim() ? { observaciones: args.observaciones.trim() } : {}),
    },
  }
}

/** Entrada de historial del padre al emitir (la traza vive también en el
 *  proyecto, no solo en la subcolección). */
export const entradaHistorialCorte = (
  estado: Proyecto['estado'], consecutivo: string, numero: number, total: number,
  uid: string, fecha: Timestamp, nombre?: string, tipo: TipoCorte = 'facturable',
): EntradaHistorialProyecto => ({
  de: estado, a: estado, por: uid, fecha,
  ...(nombre ? { por_nombre: nombre } : {}),
  motivo: tipo === 'informativo'
    ? `Corte de obra ${consecutivo} (corte ${numero}) EMITIDO — INFORMATIVO, no facturable: delta ${total} rotulado como constancia; NO mueve la base de cobro (congelado con hash)`
    : `Corte de obra ${consecutivo} (corte ${numero}) EMITIDO — facturable del corte ${total} (congelado con hash; el avance posterior solo afecta los cortes siguientes)`,
} as EntradaHistorialProyecto)

// ── Aritmética de facturas POR CORTE (08-nov) ────────────────────────────────
// Un corte facturable puede cubrirse con VARIAS facturas (parciales) — la
// cuenta facturado vs. falta queda a la vista, y superar lo facturable
// ADVIERTE con constancia, jamás bloquea (patrón sobre-giro).
export interface AritmeticaFacturasCorte {
  facturado: number
  falta: number
  sobrepasa: boolean
  numeros: string[]
}
export const aritmeticaFacturasCorte = (
  corteId: string,
  totalCorte: number,
  facturas: { corte_id?: string; valor: number; numero: string; anulada?: unknown }[],
): AritmeticaFacturasCorte => {
  const propias = facturas.filter(f => !f.anulada && f.corte_id === corteId)
  const facturado = propias.reduce((s, f) => s + (f.valor || 0), 0)
  return {
    facturado,
    falta: Math.max(0, totalCorte - facturado),
    sobrepasa: facturado > totalCorte,
    numeros: propias.map(f => f.numero),
  }
}

/** PLANTILLA de observaciones (forma SENA, 08-nov): el campo INVITA en vez
 *  de quedar vacío — un primer punto con el avance global, los ítems que se
 *  salen de lo típico (100%, ≥80%, en cero) y la nota de adicionales en
 *  trámite. Generada del dato, editable por quien emite. */
export function plantillaObservacionesCorte(
  c: Pick<CorteObra, 'items' | 'pct_global' | 'cd_acum' | 'cd_contratado' | 'numero_corte'>,
): string {
  // es-CO: coma decimal (el PDF y la banda global ya la usan via fmtNum)
  const pct = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('es-CO')}%`
  const lineas: string[] = [
    `• Avance global de la obra: ${pct(c.pct_global)} del costo directo contratado al corte ${c.numero_corte}.`,
  ]
  const ejecutados = c.items.filter(i => i.estado === 'ejecutado')
  const avanzados = c.items.filter(i => i.estado === 'en_ejecucion' && i.pct >= 80)
  const enCero = c.items.filter(i => i.estado === 'sin_avance')
  if (ejecutados.length)
    lineas.push(`• Ejecutados al 100%: ${ejecutados.map(i => i.codigo ?? i.descripcion.slice(0, 40)).join(', ')}.`)
  for (const i of avanzados)
    lineas.push(`• ${i.codigo ?? i.descripcion.slice(0, 40)} presenta un avance del ${pct(i.pct)}.`)
  if (enCero.length)
    lineas.push(`• Sin avance a la fecha: ${enCero.map(i => i.codigo ?? i.descripcion.slice(0, 40)).join(', ')} (programados para el siguiente periodo).`)
  lineas.push('• Adicionales en trámite: [no se incluyen en este corte — indicar la cotización donde se tramitan, o retirar este punto].')
  return lineas.join('\n')
}
