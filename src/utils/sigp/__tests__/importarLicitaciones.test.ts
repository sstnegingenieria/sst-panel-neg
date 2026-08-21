/**
 * Tests del importador histórico (1.3).
 *
 * FIXTURES SINTÉTICOS: replican la ESTRUCTURA real de los archivos (membrete
 * ISO en las primeras filas, encabezado en fila variable, formatos numéricos
 * mezclados, seriales inválidos, erratas de tecleo) con montos y entidades
 * INVENTADOS. Los archivos reales viven en `_datos/`, gitignoreado — este repo
 * no lleva precios ni procesos reales.
 *
 * Las únicas cifras reales que aparecen son las YA publicadas en el texto de
 * calibración del criterio (`functions/scripts/semaforo-v1.0.json`), que sí
 * está versionado: el serial corrupto 4572620833 y la adjudicación de
 * $6.011.508.
 */
import { describe, it, expect } from 'vitest'
import {
  norm, textoONull, claveProceso, parsearMonto, parsearFecha, parsearLotes,
  mapearModalidad, mapearEstado, mapearMotivoDescarte,
  detectarEncabezado, colExacta, atribuirAnio,
  parsearHoja, importarLicitaciones,
  entradaSemaforoDe, estamparSemaforo, evaluarRetroactivo, dejaPasar,
  contarPorAnio, ESTADOS_PRESENTADO, AMBIGUOS_CONOCIDOS, MAPEOS_A_CONFIRMAR, GUARD,
  type HojaFuente, type Celda, type LicitacionImportada,
} from '../importarLicitaciones'

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Membrete ISO: las filas que NO son datos. */
const MEMBRETE: Celda[][] = [
  [null, null, null],
  ['COMERCIAL', null, 'NEG INGENIERÍA S.A.S BIC'],
  ['CÓDIGO:', null, 'CM-FT-CPG-26'],
  ['VERSIÓN:', null, '1'],
  ['MÓDIFICACIÓN 17 DE JUNIO DE 2026', null, null],
  [null, null, null],
]

/** Encabezado de las hojas tipo "gobierno" (18 columnas). */
const HEAD_GOB: Celda[] = [
  'LINK', 'TIPO PROCESO', 'NUMERO', 'CIUDAD', 'ENTIDAD', 'OBJETO', 'LOTES',
  'PRESUPUESTO OFICIAL', 'PRESUPUESTO NEG', 'PRESUPUESTO GANADOR',
  '% NEG', '% GANADOR', 'LIMITACIÓN MIPYMES', 'MANIFESTACIÓN', 'SORTEO',
  'PRESENTACIÓN', 'ESTADO', 'OBSERVACIÓN',
]

/** Fila tipo gobierno. Solo hay que pasar lo que el caso necesita. */
const filaGob = (o: {
  tipo?: Celda; numero: Celda; entidad?: Celda; presupuesto?: Celda;
  neg?: Celda; ganador?: Celda; mipyme?: Celda; manifestacion?: Celda;
  sorteo?: Celda; presentacion?: Celda; estado?: Celda; observacion?: Celda;
  lotes?: Celda;
}): Celda[] => ([
  'https://www.secop.gov.co/x', o.tipo ?? 'MINIMA', o.numero, 'BOGOTÁ',
  o.entidad ?? 'ENTIDAD DE PRUEBA', 'Objeto de prueba', o.lotes ?? 'NO',
  o.presupuesto ?? null, o.neg ?? null, o.ganador ?? null,
  null, null, o.mipyme ?? 'N/A', o.manifestacion ?? null, o.sorteo ?? null,
  o.presentacion ?? null, o.estado ?? null, o.observacion ?? null,
])

const hojaGob = (filas: Celda[][], extra?: Partial<HojaFuente>): HojaFuente => ({
  archivo: 'FIXTURE.xlsx', hoja: 'HOJA GOB', anio_declarado: 2026,
  filas: [...MEMBRETE, HEAD_GOB, ...filas],
  ...extra,
})

// ═════════════════════════════════════════════════════════════════════════════
// Normalización y parseo de celdas
// ═════════════════════════════════════════════════════════════════════════════

describe('norm / textoONull / claveProceso', () => {
  it('norm quita tildes, colapsa espacios y pasa a mayúsculas', () => {
    expect(norm('  Mínima   Cuantía ')).toBe('MINIMA CUANTIA')
    expect(norm(null)).toBe('')
    expect(norm(42)).toBe('42')
  })

  it("textoONull convierte 'N/A' en null, no en la cadena", () => {
    expect(textoONull('N/A')).toBeNull()
    expect(textoONull('n/a')).toBeNull()
    expect(textoONull('#N/A')).toBeNull()
    expect(textoONull('   ')).toBeNull()
    expect(textoONull('ARMADA NACIONAL')).toBe('ARMADA NACIONAL')
  })

  it('claveProceso normaliza para deduplicar (upper + trim + sin tildes)', () => {
    expect(claveProceso(' mc-025-2022 ')).toBe('MC-025-2022')
    expect(claveProceso('MC-025-2022')).toBe(claveProceso('mc-025-2022  '))
  })
})

describe('parsearMonto — los tres formatos que conviven', () => {
  it('number nativo: el punto ya es decimal', () => {
    expect(parsearMonto(359936409.64)).toBe(359936409.64)
    expect(parsearMonto(60000000)).toBe(60000000)
  })

  it('string SIN coma: los puntos son separadores de MILES', () => {
    expect(parsearMonto('75.000.000')).toBe(75000000)
    expect(parsearMonto('12.577.839.416')).toBe(12577839416)
    expect(parsearMonto('1.440.000.000')).toBe(1440000000)
  })

  it('string CON coma: coma decimal, puntos de miles (es-CO)', () => {
    expect(parsearMonto('209.913.601,59')).toBeCloseTo(209913601.59, 2)
    expect(parsearMonto('1.078.085.170,9')).toBeCloseTo(1078085170.9, 2)
  })

  it('tolera el signo de peso y espacios (incl. el no-rompible de Excel)', () => {
    expect(parsearMonto('$ 75.000.000')).toBe(75000000)
    expect(parsearMonto('27.828.257,39 ')).toBeCloseTo(27828257.39, 2)
  })

  it('null para vacío, N/A y errores de Excel', () => {
    for (const v of [null, undefined, '', '   ', 'N/A', '#VALUE!', '#DIV/0!', '#N/A']) {
      expect(parsearMonto(v as Celda), `${v}`).toBeNull()
    }
  })

  it('null para texto que no es un número', () => {
    expect(parsearMonto('POR DEFINIR')).toBeNull()
    expect(parsearMonto(true)).toBeNull()
  })

  it('el cero es un dato, no una ausencia', () => {
    expect(parsearMonto(0)).toBe(0)
    expect(parsearMonto('0')).toBe(0)
  })
})

describe('parsearFecha', () => {
  it('serial de Excel en rango → ISO', () => {
    expect(parsearFecha(45770.708333333336)).toBe('2025-04-23')
    expect(parsearFecha(44714)).toBe('2022-06-02')
  })

  it('CLAVE: el serial corrupto real (4572620833) devuelve null, no revienta', () => {
    // Celda 2025!N139 del archivo real. Como serial cae en el año 12.517.821.
    expect(parsearFecha(4572620833)).toBeNull()
  })

  it('rechaza seriales fuera del rango razonable sin lanzar', () => {
    for (const v of [0, 1, -5, 100, 999999999, Number.MAX_SAFE_INTEGER]) {
      expect(parsearFecha(v), `${v}`).toBeNull()
    }
  })

  it("string 'd/m/yyyy hh:mm:ss AM' (aparece en la columna SORTEO)", () => {
    expect(parsearFecha('9/06/2025 4:00:00 PM')).toBe('2025-06-09')
    expect(parsearFecha('09/06/2025')).toBe('2025-06-09')
  })

  it("null para 'N/A', vacío y basura", () => {
    for (const v of [null, undefined, '', 'N/A', 'n/a', '#VALUE!', 'pendiente']) {
      expect(parsearFecha(v as Celda), `${v}`).toBeNull()
    }
  })

  it('rechaza fechas imposibles', () => {
    expect(parsearFecha('45/13/2025')).toBeNull()
    expect(parsearFecha('1899-12-30')).toBeNull()
  })
})

describe('parsearLotes', () => {
  it("'NO' del origen y vacío → 1 (un solo lote)", () => {
    expect(parsearLotes('NO')).toBe(1)
    expect(parsearLotes(null)).toBe(1)
    expect(parsearLotes('')).toBe(1)
  })

  it('un conteo explícito se respeta', () => {
    expect(parsearLotes(3)).toBe(3)
    expect(parsearLotes('4')).toBe(4)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Vocabularios
// ═════════════════════════════════════════════════════════════════════════════

describe('mapearModalidad — variantes y erratas reales', () => {
  it('las seis grafías de mínima cuantía del origen', () => {
    for (const v of ['MINIMA', 'MÍNIMA', 'MÌNIMA', 'MINIMO', 'MIIMA', 'MININA']) {
      expect(mapearModalidad(v), v).toBe('minima_cuantia')
    }
  })

  it('las tres de menor cuantía', () => {
    for (const v of [
      'MENOR', 'MENOR SECOP I', 'MENOR SELECCION ABREVIADA DE MENOR CUANTIA',
    ]) {
      expect(mapearModalidad(v), v).toBe('menor_cuantia')
    }
  })

  it('LP → licitación pública', () => {
    expect(mapearModalidad('LP')).toBe('licitacion_publica')
  })

  it('vacío y basura → otra (nunca revienta, nunca inventa)', () => {
    expect(mapearModalidad(null)).toBe('otra')
    expect(mapearModalidad('')).toBe('otra')
    expect(mapearModalidad('expe')).toBe('otra')     // fila basura real
    expect(mapearModalidad('CONCURSO')).toBe('otra')
  })
})

describe('mapearEstado', () => {
  it('el mapa acordado, caso por caso', () => {
    const casos: [string, string][] = [
      ['NO', 'descartada'], ['NO PRESENTADA', 'descartada'],
      ['PERDIDA', 'perdida'], ['PERDIDO', 'perdida'],
      ['GANADA', 'adjudicada'], ['GANADO', 'adjudicada'],
      ['SUSCRITO', 'manifestada'], ['MANIFESTADO', 'manifestada'],
      ['MANIFESTAR', 'en_preparacion'], ['PRESENTAR', 'en_preparacion'],
      ['PRESENTADA', 'presentada'], ['EN PROCESO', 'presentada'],
      ['REVOCADO', 'revocada'], ['RECHAZADO', 'rechazada'],
      ['DESIERTO', 'desierta'],
    ]
    for (const [crudo, esperado] of casos) {
      const r = mapearEstado(crudo)
      expect(r.estado, crudo).toBe(esperado)
      expect(r.requiere_resolucion, crudo).toBe(false)
    }
  })

  it('CLAVE: SUSCRITO es manifestada, JAMÁS adjudicada', () => {
    // Los 8 SUSCRITO del archivo real traen observación "MANIFESTAR" y
    // cierres futuros: no se ganó nada todavía.
    expect(mapearEstado('SUSCRITO').estado).toBe('manifestada')
    expect(mapearEstado('SUSCRITO').estado).not.toBe('adjudicada')
    expect(mapearEstado('suscrito').estado).toBe('manifestada')
  })

  it('vacío → detectada', () => {
    expect(mapearEstado(null)).toEqual({
      estado: 'detectada', requiere_resolucion: false, imprevisto: false,
    })
  })

  it('CLAVE (1.3b): TERMINADO → perdida, en firme', () => {
    // La hoja se llama PRESENTADAS y SECOP II registra 6 adjudicaciones a NEG
    // en 2022, no 20+. TERMINADO = el proceso cerró sin que NEG ganara.
    const r = mapearEstado('TERMINADO')
    expect(r.estado).toBe('perdida')
    expect(r.requiere_resolucion).toBe(false)
    expect(r.imprevisto).toBe(false)
    expect(AMBIGUOS_CONOCIDOS).not.toContain('TERMINADO')
  })

  it('TERMINADO se sigue REPORTANDO para confirmación de Karen', () => {
    // Mapear en firme no es dar por cerrado: la lectura se confirma.
    expect(Object.keys(MAPEOS_A_CONFIRMAR)).toContain('TERMINADO')
    expect(MAPEOS_A_CONFIRMAR.TERMINADO).toContain('perdida')
  })

  it('un valor IMPREVISTO se lista Y cuenta para el guard', () => {
    const r = mapearEstado('EN NEGOCIACION')
    expect(r.estado).toBe('en_evaluacion')
    expect(r.requiere_resolucion).toBe(true)
    expect(r.imprevisto).toBe(true)
  })

  it('nunca adivina: un valor imprevisto no cae en un estado de resultado', () => {
    for (const v of ['EN NEGOCIACION', 'XYZ', 'CERRADO', 'ADJUDICADO?']) {
      expect(mapearEstado(v).estado, v).toBe('en_evaluacion')
    }
  })
})

describe('mapearMotivoDescarte — erratas del origen', () => {
  it('normaliza las erratas reales', () => {
    expect(mapearMotivoDescarte('BAJO PRESUPUESTTO')).toBe('BAJO_PRESUPUESTO')  // doble T
    expect(mapearMotivoDescarte('EXPERIENCIA  ')).toBe('EXPERIENCIA')            // espacio final
    expect(mapearMotivoDescarte('LIMITACION MYPIMES')).toBe('LIMITACION_MIPYME') // MYPIMES
    expect(mapearMotivoDescarte('LIMITACION MIPYMES')).toBe('LIMITACION_MIPYME')
  })

  it('el compuesto EXPERIENCIA/INDICADORES resuelve al primero', () => {
    expect(mapearMotivoDescarte('EXPERIENCIA/INDICADORES')).toBe('EXPERIENCIA')
  })

  it('los del vocabulario, directo', () => {
    expect(mapearMotivoDescarte('SORTEO')).toBe('SORTEO')
    expect(mapearMotivoDescarte('INDICADORES')).toBe('INDICADORES')
    expect(mapearMotivoDescarte('UBICACION')).toBe('UBICACION')
  })

  it('los que no tienen casilla caen a OTRO (el texto crudo se conserva aparte)', () => {
    for (const v of ['AMPARO GARANTIA DE SERIEDAD', 'PERSONAL', 'PERDIDA', 'REVOCADA']) {
      expect(mapearMotivoDescarte(v), v).toBe('OTRO')
    }
  })

  it('vacío → null', () => {
    expect(mapearMotivoDescarte(null)).toBeNull()
    expect(mapearMotivoDescarte('')).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Detección de encabezado y resolución de columnas
// ═════════════════════════════════════════════════════════════════════════════

describe('detectarEncabezado', () => {
  it('salta el membrete ISO y encuentra el encabezado real', () => {
    const filas = [...MEMBRETE, HEAD_GOB, filaGob({ numero: 'X-1' })]
    expect(detectarEncabezado(filas)).toBe(MEMBRETE.length)   // índice 6
  })

  it('funciona con una fila extra de membrete (el caso de la hoja 2024)', () => {
    const filas = [...MEMBRETE, [null, null], HEAD_GOB, filaGob({ numero: 'X-1' })]
    expect(detectarEncabezado(filas)).toBe(MEMBRETE.length + 1)  // índice 7
  })

  it('funciona con el encabezado en la primera fila (PROCESOS.xlsx)', () => {
    const filas = [['NÚMERO', 'PROCESO', 'ENTIDAD', 'ESTADO'], [1, 'MC-1', 'E', 'GANADO']]
    expect(detectarEncabezado(filas)).toBe(0)
  })

  it('-1 si no hay encabezado reconocible (no adivina una fila cualquiera)', () => {
    expect(detectarEncabezado([[null], ['algo'], [1, 2, 3]])).toBe(-1)
  })
})

describe('colExacta — la defensa contra el corrimiento de columnas', () => {
  const head = ['LINK', 'TIPO PROCESO', 'NUMERO', 'ESTADO']

  it("'PROCESO' EXACTO no engancha 'TIPO PROCESO'", () => {
    // Este es el bug que colapsó 372 filas en 35: buscar PROCESO por
    // inclusión devolvía el índice de TIPO PROCESO y numero_proceso valía
    // "MENOR"/"MINIMA".
    expect(colExacta(head, 'PROCESO')).toBe(-1)
    expect(colExacta(head, 'TIPO PROCESO')).toBe(1)
    expect(colExacta(head, 'NUMERO')).toBe(2)
  })

  it('respeta el orden de preferencia de las alternativas', () => {
    expect(colExacta(head, 'PROCESO', 'NUMERO')).toBe(2)
  })
})

describe('atribuirAnio', () => {
  it('prefiere la fecha de cierre', () => {
    expect(atribuirAnio('2025-04-21', 'MC-025-2022', 2026)).toBe(2025)
  })

  it('sin cierre, usa el año de 4 dígitos del número de proceso', () => {
    expect(atribuirAnio(null, 'MC-025-2022', 2026)).toBe(2022)
    expect(atribuirAnio(null, '0003-ARC-CBNL03-2026', 2024)).toBe(2026)
  })

  it('sin cierre ni año en el número, cae al declarado de la hoja', () => {
    expect(atribuirAnio(null, '13962', 2022)).toBe(2022)
    expect(atribuirAnio(null, '0053-ARC', 2022)).toBe(2022)
  })

  it('no confunde un número largo con un año', () => {
    expect(atribuirAnio(null, '41610103217872000', 2025)).toBe(2025)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Parseo de hoja
// ═════════════════════════════════════════════════════════════════════════════

describe('parsearHoja', () => {
  it('importa una fila normal con todos sus campos', () => {
    const h = hojaGob([filaGob({
      tipo: 'MINIMA', numero: 'MC-001-2026', entidad: 'ALCALDÍA DE PRUEBA',
      presupuesto: '50.000.000', neg: '45.000.000', presentacion: 45817.375,
      estado: 'PERDIDA', observacion: 'MENOR PRECIO',
    })])
    const r = parsearHoja(h)
    expect(r.registros).toHaveLength(1)
    const l = r.registros[0]
    expect(l.numero_proceso).toBe('MC-001-2026')
    expect(l.modalidad).toBe('minima_cuantia')
    expect(l.modalidad_conocida).toBe(true)
    expect(l.presupuesto_oficial).toBe(50000000)
    expect(l.oferta_neg).toBe(45000000)
    expect(l.estado).toBe('perdida')
    expect(l.migrado).toBe(true)
    expect(l.origen).toBe('manual')
    expect(l.consecutivo).toBe('')
    expect(l.cronograma.cierre).toBe('2025-06-09')
  })

  it("ENTIDAD 'N/A' entra como null, no como la cadena", () => {
    const h = hojaGob([filaGob({ numero: 'X-1', entidad: 'N/A' })])
    expect(parsearHoja(h).registros[0].entidad.nombre).toBeNull()
  })

  it('descarta las filas sin número de proceso, con motivo', () => {
    const h = hojaGob([
      filaGob({ numero: 'X-1' }),
      filaGob({ numero: null }),
      filaGob({ numero: '   ' }),
    ])
    const r = parsearHoja(h)
    expect(r.registros).toHaveLength(1)
    expect(r.descartadas).toHaveLength(2)
    expect(r.descartadas.every(d => d.motivo === 'sin_numero_proceso')).toBe(true)
  })

  it('las filas totalmente vacías no son descartes: son el final del rango', () => {
    const h = hojaGob([filaGob({ numero: 'X-1' }), [null, null, null], []])
    const r = parsearHoja(h)
    expect(r.registros).toHaveLength(1)
    expect(r.descartadas).toHaveLength(0)
  })

  it('CLAVE: LIMITACIÓN MIPYMES va al crudo y NO se interpreta como bandera', () => {
    // La columna está mal rotulada en el origen: contiene FECHAS.
    const h = hojaGob([filaGob({ numero: 'X-1', mipyme: 45854.5 })])
    const l = parsearHoja(h).registros[0]
    expect(l.observacion_cruda).toContain('LIMITACIÓN MIPYMES')
    expect(l.observacion_cruda).toContain('45854.5')
    expect(l).not.toHaveProperty('limitacion_mipyme')
    // Y el semáforo la ignora por completo:
    expect(entradaSemaforoDe(l).limitacion_mipyme).toBe(false)
  })

  it('el serial corrupto en una fecha no rompe la fila: queda null', () => {
    const h = hojaGob([filaGob({ numero: 'X-1', manifestacion: 4572620833 })])
    const r = parsearHoja(h)
    expect(r.registros).toHaveLength(1)
    expect(r.registros[0].cronograma.manifestacion).toBeNull()
  })

  it('motivo de descarte: usa MOTIVO, y si no hay, OBSERVACIÓN', () => {
    const h = hojaGob([
      filaGob({ numero: 'X-1', estado: 'NO', observacion: 'LIMITACION MYPIMES' }),
    ])
    const l = parsearHoja(h).registros[0]
    expect(l.estado).toBe('descartada')
    expect(l.motivo_descarte).toBe('LIMITACION_MIPYME')
  })

  it('un estado que no es descartada nunca lleva motivo (invariante 1)', () => {
    const h = hojaGob([filaGob({ numero: 'X-1', estado: 'PERDIDA', observacion: 'SORTEO' })])
    expect(parsearHoja(h).registros[0].motivo_descarte).toBeNull()
  })

  it('sin columna TIPO PROCESO, modalidad_conocida es false', () => {
    const h: HojaFuente = {
      archivo: 'F.xlsx', hoja: 'PRESENTADAS', anio_declarado: 2022,
      filas: [
        ['NÚMERO', 'PROCESO', 'ENTIDAD', 'PRESUPUESTO OFICIAL', 'ESTADO'],
        [1, 'MC-025-2022', 'ALCALDÍA X', 13863503, 'GANADO'],
      ],
    }
    const l = parsearHoja(h).registros[0]
    expect(l.numero_proceso).toBe('MC-025-2022')     // de PROCESO, no de NÚMERO
    expect(l.modalidad_conocida).toBe(false)
    expect(l.presupuesto_columna_presente).toBe(true)
  })

  it('sin columna de presupuesto oficial, el flag lo declara', () => {
    const h: HojaFuente = {
      archivo: 'F.xlsx', hoja: 'LEIDAS', anio_declarado: 2026,
      filas: [
        ['LINK', 'TIPO PROCESO', 'NUMERO', 'ENTIDAD', 'ESTADO', 'MOTIVO'],
        ['u', 'MENOR', 'X-1', 'E', 'NO PRESENTADA', 'SORTEO'],
      ],
    }
    const l = parsearHoja(h).registros[0]
    expect(l.presupuesto_columna_presente).toBe(false)
    expect(l.presupuesto_oficial).toBeNull()
  })

  it('sin encabezado reconocible reporta el descarte y no revienta', () => {
    const r = parsearHoja({
      archivo: 'F.xlsx', hoja: 'Hoja 3', filas: [[null], [null]], anio_declarado: 2026,
    })
    expect(r.registros).toHaveLength(0)
    expect(r.descartadas[0].motivo).toBe('sin_encabezado')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Deduplicación e importación completa
// ═════════════════════════════════════════════════════════════════════════════

describe('importarLicitaciones — deduplicación', () => {
  it('deduplica por número normalizado conservando la PRIMERA', () => {
    const h = hojaGob([
      filaGob({ numero: 'MC-001-2026', estado: 'PERDIDA' }),
      filaGob({ numero: ' mc-001-2026 ', estado: 'GANADA' }),   // duplicado
      filaGob({ numero: 'MC-002-2026', estado: 'GANADA' }),
    ])
    const rep = importarLicitaciones([h])
    expect(rep.registros).toHaveLength(2)
    expect(rep.registros[0].estado).toBe('perdida')            // la primera gana
    expect(rep.duplicadas).toHaveLength(1)
    expect(rep.duplicadas[0].numero_proceso).toBe('MC-001-2026')
  })

  it('la deduplicación es GLOBAL entre hojas', () => {
    const a = hojaGob([filaGob({ numero: 'MC-001-2026' })], { hoja: 'A' })
    const b = hojaGob([filaGob({ numero: 'MC-001-2026' })], { hoja: 'B' })
    const rep = importarLicitaciones([a, b])
    expect(rep.registros).toHaveLength(1)
    expect(rep.registros[0].fuente.hoja).toBe('A')
  })
})

describe('guard de calidad', () => {
  const buenas = (n: number, extra?: Parameters<typeof filaGob>[0]) =>
    Array.from({ length: n }, (_, i) => filaGob({
      numero: `MC-${String(i).padStart(3, '0')}-2026`,
      presupuesto: '50.000.000', estado: 'PERDIDA', ...extra,
    }))

  it('sin señales, puede_importar es true', () => {
    const rep = importarLicitaciones([hojaGob(buenas(20))])
    expect(rep.senales).toEqual([])
    expect(rep.puede_importar).toBe(true)
  })

  it('BLOQUEA con >10 % de presupuestos no parseables', () => {
    const filas = [
      ...buenas(8),
      ...Array.from({ length: 2 }, (_, i) => filaGob({
        numero: `X-${i}`, presupuesto: 'POR DEFINIR', estado: 'PERDIDA',
      })),
    ]
    const rep = importarLicitaciones([hojaGob(filas)])
    expect(rep.puede_importar).toBe(false)
    expect(rep.senales.join()).toContain('presupuesto_no_parseable')
  })

  it('el % de presupuesto se mide SOLO sobre hojas que TIENEN la columna', () => {
    // La hoja "leídas y no presentadas" no trae presupuesto oficial: contarla
    // mediría una ausencia estructural, no un fallo de parseo.
    const sinColumna: HojaFuente = {
      archivo: 'F.xlsx', hoja: 'LEIDAS', anio_declarado: 2026,
      filas: [
        ['LINK', 'TIPO PROCESO', 'NUMERO', 'ENTIDAD', 'ESTADO', 'MOTIVO'],
        ...Array.from({ length: 50 }, (_, i) =>
          ['u', 'MENOR', `L-${i}`, 'E', 'NO PRESENTADA', 'SORTEO'] as Celda[]),
      ],
    }
    const rep = importarLicitaciones([hojaGob(buenas(10)), sinColumna])
    expect(rep.registros).toHaveLength(60)
    expect(rep.senales.join()).not.toContain('presupuesto_no_parseable')
    expect(rep.puede_importar).toBe(true)
  })

  it('BLOQUEA con >5 % de estados IMPREVISTOS', () => {
    const filas = [...buenas(10), filaGob({
      numero: 'RARO-1', presupuesto: '1.000.000', estado: 'EN NEGOCIACION',
    })]
    const rep = importarLicitaciones([hojaGob(filas)])
    expect(rep.puede_importar).toBe(false)
    expect(rep.senales.join()).toContain('estado_imprevisto')
  })

  it('TERMINADO no dispara el guard: se mapea en firme y se reporta aparte', () => {
    const filas = [...buenas(5), ...Array.from({ length: 10 }, (_, i) =>
      filaGob({ numero: `T-${i}`, presupuesto: '1.000.000', estado: 'TERMINADO' }))]
    const rep = importarLicitaciones([hojaGob(filas)])
    expect(rep.estados_sin_mapear).toHaveLength(0)
    expect(rep.mapeos_a_confirmar).toHaveLength(10)
    expect(rep.mapeos_a_confirmar[0].mapeado_a).toBe('perdida')
    expect(rep.senales.join()).not.toContain('estado_imprevisto')
    expect(rep.puede_importar).toBe(true)
  })

  it('BLOQUEA si la hoja 2025 no da 164/32/3', () => {
    const h = hojaGob([filaGob({ numero: 'X-1', presupuesto: '1.000.000' })], { hoja: '2025' })
    const rep = importarLicitaciones([h])
    expect(rep.puede_importar).toBe(false)
    expect(rep.senales.join()).toContain('conteo_2025')
  })

  it('los umbrales están nombrados, no dispersos como literales', () => {
    expect(GUARD.MAX_PCT_SIN_PRESUPUESTO).toBe(10)
    expect(GUARD.MAX_PCT_ESTADO_SIN_MAPEAR).toBe(5)
    expect(GUARD.ESPERADO_2025).toEqual({ procesos: 164, presentados: 32, adjudicados: 3 })
  })

  it('cero registros es una señal, no un éxito silencioso', () => {
    const rep = importarLicitaciones([hojaGob([])])
    expect(rep.puede_importar).toBe(false)
    expect(rep.senales.join()).toContain('cero_registros')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Semáforo retroactivo
// ═════════════════════════════════════════════════════════════════════════════

describe('entradaSemaforoDe — honestidad de la medición', () => {
  const l = () => parsearHoja(hojaGob([filaGob({
    numero: 'X-1', tipo: 'MINIMA', mipyme: 45854.5, sorteo: 45772.4,
  })])).registros[0]

  it('modalidad y sorteo SÍ se derivan del origen', () => {
    const e = entradaSemaforoDe(l())
    expect(e.modalidad).toBe('minima_cuantia')
    expect(e.tiene_sorteo).toBe(true)
  })

  it('limitacion_mipyme y requiere_lectura van en false — no se inventan', () => {
    const e = entradaSemaforoDe(l())
    expect(e.limitacion_mipyme).toBe(false)
    expect(e.requiere_lectura).toBe(false)
    expect(e.departamento).toBe('')
  })
})

describe('estamparSemaforo', () => {
  const reg = (extra: Parameters<typeof filaGob>[0]) =>
    parsearHoja(hojaGob([filaGob(extra)])).registros[0]

  it('mínima cuantía sin sorteo → verde', () => {
    const [r] = estamparSemaforo([reg({ numero: 'X-1', tipo: 'MINIMA' })])
    expect(r.semaforo).toBe('verde')
    expect(r.semaforo_version).toBe('v1.0')
  })

  it('mínima cuantía con sorteo → amarillo', () => {
    const [r] = estamparSemaforo([reg({ numero: 'X-1', tipo: 'MINIMA', sorteo: 45772.4 })])
    expect(r.semaforo).toBe('amarillo')
    expect(r.semaforo_motivos).toEqual(['SORTEO'])
  })

  it('menor cuantía → rojo', () => {
    const [r] = estamparSemaforo([reg({ numero: 'X-1', tipo: 'MENOR' })])
    expect(r.semaforo).toBe('rojo')
    expect(r.semaforo_motivos).toEqual(['MODALIDAD_SIN_HISTORIAL'])
  })

  it('el portero deja pasar verde y amarillo, bloquea rojo', () => {
    expect(dejaPasar('verde')).toBe(true)
    expect(dejaPasar('amarillo')).toBe(true)
    expect(dejaPasar('rojo')).toBe(false)
  })
})

describe('evaluarRetroactivo', () => {
  const reg = (extra: Parameters<typeof filaGob>[0], hoja = 'H') =>
    parsearHoja(hojaGob([filaGob(extra)], { hoja })).registros[0]

  it('conserva una adjudicación de mínima cuantía limpia', () => {
    const ev = evaluarRetroactivo([reg({
      numero: 'MC-1-2025', tipo: 'MINIMA', presupuesto: '6.011.508',
      estado: 'GANADA', presentacion: 45817,
    })])
    const a = ev.por_anio[0]
    expect(a.adjudicadas).toBe(1)
    expect(a.adjudicaciones_conservadas).toBe(1)
    expect(a.adjudicaciones_perdidas).toBe(0)
    expect(ev.criterio_aprobado).toBe(true)
  })

  it('CLAVE: activa el criterio de cancelación si el filtro mata una adjudicación', () => {
    // Una menor cuantía ganada: el filtro la habría bloqueado (rojo).
    const ev = evaluarRetroactivo([reg({
      numero: 'SAMC-1-2025', tipo: 'MENOR', presupuesto: '100.000.000',
      estado: 'GANADA', presentacion: 45817,
    })])
    expect(ev.adjudicaciones_perdidas_total).toBe(1)
    expect(ev.criterio_aprobado).toBe(false)
    expect(ev.adjudicaciones_perdidas_detalle[0].numero_proceso).toBe('SAMC-1-2025')
    expect(ev.adjudicaciones_perdidas_detalle[0].motivos).toEqual(['MODALIDAD_SIN_HISTORIAL'])
  })

  it('CLAVE (1.3b): la modalidad externa hace evaluable lo que el origen no registró', () => {
    // 2022: SECOP II publica modalidad_de_contratacion para los contratos
    // ADJUDICADOS. El caller declara ese dato con su cita; el parser lo aplica
    // SOLO a los estados declarados y marca la procedencia en el crudo.
    const conFuente: HojaFuente = {
      archivo: 'PROCESOS.xlsx', hoja: 'PRESENTADAS', anio_declarado: 2022,
      modalidad_externa: {
        estados: ['GANADO', 'GANADA'],
        modalidad: 'minima_cuantia',
        fuente: 'SECOP II · dataset jbjy-vk9h',
      },
      filas: [
        ['NÚMERO', 'PROCESO', 'ENTIDAD', 'PRESUPUESTO OFICIAL', 'FECHA CIERRE', 'ESTADO'],
        [1, 'MC-A-2022', 'E', 20000000, 44714, 'GANADO'],
        [2, 'MC-B-2022', 'E', 30000000, 44715, 'TERMINADO'],
      ],
    }
    const rep = importarLicitaciones([conFuente])
    const [ganado, terminado] = rep.registros

    expect(ganado.modalidad).toBe('minima_cuantia')
    expect(ganado.modalidad_conocida).toBe(true)
    expect(ganado.observacion_cruda).toContain('MODALIDAD POR FUENTE EXTERNA')
    expect(ganado.observacion_cruda).toContain('jbjy-vk9h')

    // La fuente cubre lo adjudicado; sobre el resto no dice nada.
    expect(terminado.estado).toBe('perdida')
    expect(terminado.modalidad_conocida).toBe(false)
    expect(terminado.observacion_cruda).not.toContain('FUENTE EXTERNA')
  })

  it('la columna del archivo GANA sobre la fuente externa', () => {
    // Si la hoja SÍ registra el tipo, el dato del archivo manda: la fuente
    // externa es un relleno de ausencias, no un override.
    const h = hojaGob([filaGob({ numero: 'X-1', tipo: 'MENOR', estado: 'GANADA' })], {
      modalidad_externa: {
        estados: ['GANADA'], modalidad: 'minima_cuantia', fuente: 'externa',
      },
    })
    const l = parsearHoja(h).registros[0]
    expect(l.modalidad).toBe('menor_cuantia')
    expect(l.observacion_cruda).not.toContain('FUENTE EXTERNA')
  })

  it('CLAVE: las presentadas SIN modalidad quedan FUERA del contrafactual', () => {
    // PROCESOS.xlsx (2022) no tiene columna de tipo de proceso. Contarlas
    // como "descartadas por el filtro" diría que el criterio mató 5
    // adjudicaciones que en realidad nunca clasificó — un veredicto falso.
    const sinModalidad: HojaFuente = {
      archivo: 'F.xlsx', hoja: 'PRESENTADAS', anio_declarado: 2022,
      filas: [
        ['NÚMERO', 'PROCESO', 'ENTIDAD', 'PRESUPUESTO OFICIAL', 'FECHA CIERRE', 'ESTADO'],
        [1, 'MC-A-2022', 'E', 20000000, 44714, 'GANADO'],
        [2, 'MC-B-2022', 'E', 30000000, 44715, 'GANADO'],
      ],
    }
    const rep = importarLicitaciones([sinModalidad])
    const ev = evaluarRetroactivo(rep.registros)
    const a = ev.por_anio[0]

    expect(a.adjudicadas).toBe(2)                     // la realidad
    expect(a.evaluables).toBe(0)                      // nada evaluable
    expect(a.presentadas_sin_modalidad).toBe(2)
    expect(a.adjudicadas_sin_modalidad).toBe(2)
    expect(a.adjudicaciones_perdidas).toBe(0)         // NO se cuentan como perdidas
    expect(ev.criterio_aprobado).toBe(true)
    expect(ev.adjudicaciones_no_evaluables).toBe(2)   // pero se reportan
  })

  it('cuenta las propuestas sin retorno que el filtro habría bloqueado', () => {
    const ev = evaluarRetroactivo([
      reg({ numero: 'A-2025', tipo: 'MENOR', estado: 'PERDIDA', presentacion: 45817 }),
      reg({ numero: 'B-2025', tipo: 'MENOR', estado: 'PERDIDA', presentacion: 45818 }),
      reg({ numero: 'C-2025', tipo: 'MINIMA', estado: 'GANADA', presentacion: 45819 }),
    ])
    const a = ev.por_anio[0]
    expect(a.presentadas).toBe(3)
    expect(a.sin_retorno_bloqueadas).toBe(2)
    expect(a.pasan_filtro).toBe(1)
    expect(a.tasa_real_pct).toBeCloseTo(33.33, 1)
    expect(a.tasa_filtrada_pct).toBe(100)
    expect(ev.criterio_aprobado).toBe(true)
  })

  it('las descartadas NO cuentan como presentadas', () => {
    const ev = evaluarRetroactivo([
      reg({ numero: 'A-2025', tipo: 'MENOR', estado: 'NO', presentacion: 45817 }),
      reg({ numero: 'B-2025', tipo: 'MINIMA', estado: 'GANADA', presentacion: 45818 }),
    ])
    expect(ev.por_anio[0].presentadas).toBe(1)
  })

  it('agrupa por año atribuido', () => {
    const ev = evaluarRetroactivo([
      reg({ numero: 'A-2024', tipo: 'MINIMA', estado: 'GANADA', presentacion: 45400 }),
      reg({ numero: 'B-2025', tipo: 'MINIMA', estado: 'GANADA', presentacion: 45800 }),
    ])
    expect(ev.por_anio.map(a => a.anio)).toEqual([2024, 2025])
  })
})

describe('ESTADOS_PRESENTADO / contarPorAnio', () => {
  it('presentado = se entregó la propuesta; en_evaluacion y detectada NO', () => {
    expect([...ESTADOS_PRESENTADO].sort()).toEqual([
      'adjudicada', 'desierta', 'perdida', 'presentada', 'rechazada', 'revocada',
    ])
    expect(ESTADOS_PRESENTADO).not.toContain('en_evaluacion')
    expect(ESTADOS_PRESENTADO).not.toContain('detectada')
    expect(ESTADOS_PRESENTADO).not.toContain('descartada')
    expect(ESTADOS_PRESENTADO).not.toContain('en_preparacion')
  })

  it('contarPorAnio calcula la tasa real', () => {
    const rs = parsearHoja(hojaGob([
      filaGob({ numero: 'A-2025', estado: 'GANADA', presentacion: 45800 }),
      filaGob({ numero: 'B-2025', estado: 'PERDIDA', presentacion: 45801 }),
      filaGob({ numero: 'C-2025', estado: 'NO', presentacion: 45802 }),
    ])).registros
    const [a] = contarPorAnio(rs)
    expect(a.total).toBe(3)
    expect(a.presentadas).toBe(2)
    expect(a.adjudicadas).toBe(1)
    expect(a.tasa_pct).toBe(50)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Pureza
// ═════════════════════════════════════════════════════════════════════════════

describe('pureza del parser', () => {
  it('no muta las filas de entrada', () => {
    const h = hojaGob([filaGob({ numero: 'X-1', presupuesto: '50.000.000' })])
    const copia = JSON.parse(JSON.stringify(h.filas))
    importarLicitaciones([h])
    expect(JSON.parse(JSON.stringify(h.filas))).toEqual(copia)
  })

  it('mismas entradas, mismo reporte', () => {
    const mk = () => hojaGob([
      filaGob({ numero: 'A-2025', estado: 'GANADA', presupuesto: '1.000.000' }),
      filaGob({ numero: 'B-2025', estado: 'NO', presupuesto: '2.000.000' }),
    ])
    expect(importarLicitaciones([mk()])).toEqual(importarLicitaciones([mk()]))
  })

  it('todo registro migrado nace con la forma histórica', () => {
    const rep = importarLicitaciones([hojaGob([
      filaGob({ numero: 'A-1', estado: 'GANADA' }),
      filaGob({ numero: 'B-1', estado: 'NO' }),
    ])])
    for (const r of rep.registros as LicitacionImportada[]) {
      expect(r.migrado).toBe(true)
      expect(r.origen).toBe('manual')
      expect(r.consecutivo).toBe('')
      expect(r.id_secop).toBeNull()
    }
  })
})
