/**
 * Importación del registro histórico de licitaciones (sub-bloque 1.3).
 *
 * Lee los tres archivos del área comercial, los pasa por el parser PURO
 * (`src/utils/sigp/importarLicitaciones.ts`, vía vite-node) y:
 *   · imprime el reporte completo (encabezados detectados, descartes,
 *     duplicados, estados sin mapear, guard de calidad),
 *   · imprime la EVALUACIÓN RETROACTIVA del semáforo por año — el entregable
 *     que decide si el módulo sigue,
 *   · en modo --commit, escribe en `licitaciones` por batches de ≤500.
 *
 * ── Seguridad ───────────────────────────────────────────────────────────────
 *   · Por defecto DRY-RUN: solo lee e imprime. Cero escrituras.
 *   · `--commit` escribe. `--emulador` apunta al emulador local.
 *   · ABORTA si el guard de calidad tiene señales (`puede_importar === false`).
 *   · ABORTA si la evaluación retroactiva descarta alguna adjudicación real
 *     (`criterio_aprobado === false`) — criterio de cancelación acordado.
 *   · IDEMPOTENTE por `numero_proceso`: el doc id es su hash normalizado, así
 *     que re-correr actualiza en vez de duplicar.
 *
 * ── Cómo ejecutarlo ─────────────────────────────────────────────────────────
 *     npx vite-node functions/scripts/importar-licitaciones.js              # dry-run
 *     npx vite-node functions/scripts/importar-licitaciones.js --commit     # escribe
 *
 *   Para --commit contra producción hace falta la service account:
 *     $env:GOOGLE_APPLICATION_CREDENTIALS="…\neg-sst-app-adminsdk.json"
 *     $env:IMPORTA_UID="<uid de quien ejecuta la migración>"
 *
 * Se corre con vite-node (no `node`) porque importa el parser TS directamente:
 * una réplica JS del parser sería una segunda implementación que puede
 * divergir de la testeada.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import {
  importarLicitaciones, evaluarRetroactivo, estamparSemaforo, contarPorAnio,
} from '../../src/utils/sigp/importarLicitaciones.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(__dirname, '../..')

const COMMIT = process.argv.includes('--commit')
const EMULADOR = process.argv.includes('--emulador')
const MODO = COMMIT ? 'COMMIT (escritura real)' : 'DRY-RUN (solo lectura)'

// ── Las seis hojas del registro CM-FT-CPG-26 ────────────────────────────────
// El año declarado es el ÚLTIMO recurso: `atribuirAnio` prefiere la fecha de
// cierre y luego el año dentro del número de proceso.
const FUENTES = [
  { archivo: 'FORMATO DE CONTROL DE PROCESOS DE GOBIERNO (1).xlsx', hoja: 'LICITACIONES EN PROCESO Y PRESE', anio_declarado: 2026 },
  { archivo: 'FORMATO DE CONTROL DE PROCESOS DE GOBIERNO (1).xlsx', hoja: 'LICITACIONES  LEIDAS Y NO PRESE', anio_declarado: 2026 },
  { archivo: 'PROCESOS 2024 2026.xlsx', hoja: '2024', anio_declarado: 2024 },
  { archivo: 'PROCESOS 2024 2026.xlsx', hoja: '2025', anio_declarado: 2025 },
  {
    archivo: 'PROCESOS.xlsx', hoja: 'PRESENTADAS', anio_declarado: 2022,
    // ── Modalidad de 2022 por FUENTE EXTERNA (1.3b) ────────────────────────
    // Esta hoja NO tiene columna de tipo de proceso. Las filas GANADO se
    // resuelven a mínima cuantía con el dato publicado, no por inferencia:
    //
    //   FUENTE: dataset `jbjy-vk9h` ("Contratos SECOP II") de datos.gov.co,
    //   que publica `modalidad_de_contratacion = 'Mínima cuantía'` para los
    //   seis contratos de NEG Ingeniería firmados en 2022.
    //
    // Solo aplica a GANADO/GANADA — las demás filas de la hoja siguen con
    // `modalidad_conocida: false` y quedan fuera del contrafactual. El dato
    // externo cubre lo ADJUDICADO, que es lo que SECOP publica; sobre lo
    // presentado-y-no-ganado no dice nada, y no se inventa.
    // Deliberadamente NO se infiere del prefijo del número de proceso: un
    // "MC-" es una convención de la entidad, no una prueba de modalidad.
    modalidad_externa: {
      estados: ['GANADO', 'GANADA'],
      modalidad: 'minima_cuantia',
      fuente: 'SECOP II · dataset jbjy-vk9h (datos.gov.co) · modalidad_de_contratacion '
        + '= "Mínima cuantía" para los contratos de NEG firmados en 2022',
    },
  },
  // 'DESCARTADAS' de PROCESOS.xlsx queda FUERA a propósito: solo tiene un
  // índice secuencial y el nombre de la entidad — sin número de proceso no hay
  // identidad ni clave de deduplicación. Se reporta abajo como exclusión.
  // 'Hoja 3' de ambos libros es membrete vacío.
]

const fmt = n => n === null || n === undefined ? '—' : n.toLocaleString('es-CO')
const pct = n => n === null || n === undefined ? '—' : `${n.toFixed(1)} %`

/**
 * Lee una hoja. Se pasa el BUFFER a `XLSX.read` en vez de usar
 * `XLSX.readFile`: bajo vite-node el build ESM de SheetJS se queda sin su
 * `fs` interno (el bundler lo shimea) y `readFile` lanza
 * "Cannot access file" aunque el archivo exista y sea legible.
 */
function leerHoja(fuente) {
  const { archivo, hoja } = fuente
  const buf = readFileSync(resolve(RAIZ, '_datos', archivo))
  const wb = XLSX.read(buf, { type: 'buffer' })
  const ws = wb.Sheets[hoja]
  if (!ws) throw new Error(`No existe la hoja "${hoja}" en ${archivo}`)
  const filas = XLSX.utils.sheet_to_json(ws, {
    header: 1, raw: true, defval: null, blankrows: true,
  })
  return { ...fuente, filas }
}

console.log('\n═══════════════════════════════════════════════════════════════')
console.log('  IMPORTACIÓN DEL REGISTRO HISTÓRICO DE LICITACIONES (1.3)')
console.log(`  Modo: ${MODO}`)
console.log('═══════════════════════════════════════════════════════════════')

const hojas = FUENTES.map(leerHoja)
const rep = importarLicitaciones(hojas)

// ── 1. Encabezados detectados ───────────────────────────────────────────────
console.log('\n── 1. ENCABEZADOS DETECTADOS (no se asumió fila fija) ──')
for (const e of rep.encabezados) {
  console.log(`  ${e.hoja.padEnd(34)} fila ${String(e.fila_excel).padStart(2)} del rango leído  ·  ${e.columnas.filter(Boolean).length} columnas`)
}
console.log('  (la fila es relativa al rango de la hoja: PROCESOS.xlsx arranca en C6,')
console.log('   así que su "fila 1" es la 6 del archivo)')

// ── 2. Volumen ──────────────────────────────────────────────────────────────
console.log('\n── 2. VOLUMEN ──')
console.log(`  Registros importables: ${rep.registros.length}`)
console.log(`  Duplicados por número de proceso: ${rep.duplicadas.length}`)
console.log(`  Filas descartadas: ${rep.descartadas.length}`)
const porMotivo = {}
for (const d of rep.descartadas) porMotivo[d.motivo] = (porMotivo[d.motivo] || 0) + 1
for (const [m, n] of Object.entries(porMotivo)) console.log(`      ${m}: ${n}`)
console.log('  EXCLUIDA del alcance: PROCESOS.xlsx :: DESCARTADAS (21 filas)')
console.log('      solo trae índice secuencial + nombre de entidad — sin número de')
console.log('      proceso no hay identidad ni clave de deduplicación.')

// ── 3. Conteo canónico de 2025 ──────────────────────────────────────────────
const de2025 = rep.registros.filter(r => r.fuente.hoja === '2025')
const pres2025 = de2025.filter(r => ['presentada','adjudicada','perdida','rechazada','revocada','desierta'].includes(r.estado)).length
const adj2025 = de2025.filter(r => r.estado === 'adjudicada').length
console.log('\n── 3. CONTEO CANÓNICO DE LA HOJA 2025 ──')
console.log(`  obtenido: ${de2025.length} procesos · ${pres2025} presentados · ${adj2025} adjudicados`)
console.log('  esperado: 164 procesos · 32 presentados · 3 adjudicados')
console.log(`  ${de2025.length === 164 && pres2025 === 32 && adj2025 === 3 ? '✓ COINCIDE' : '✗ NO COINCIDE'}`)

// ── 4. Estados que requieren resolución manual ──────────────────────────────
console.log('\n── 4a. MAPEOS APLICADOS PENDIENTES DE CONFIRMACIÓN (Karen) ──')
if (rep.mapeos_a_confirmar.length === 0) {
  console.log('  ninguno')
} else {
  const porCrudo = {}
  for (const m of rep.mapeos_a_confirmar) {
    porCrudo[m.crudo] = porCrudo[m.crudo] || { just: m.justificacion, a: m.mapeado_a, filas: [] }
    porCrudo[m.crudo].filas.push(`${m.fuente.hoja}!${m.fuente.fila_excel} ${m.numero_proceso}`)
  }
  for (const [crudo, d] of Object.entries(porCrudo)) {
    console.log(`  "${crudo}" × ${d.filas.length} → ${d.a}`)
    console.log(`      motivo: ${d.just}`)
    for (const f of d.filas) console.log(`      · ${f}`)
  }
  console.log('  Aplicados EN FIRME. Se listan para que Karen confirme la lectura;')
  console.log('  si alguno fuera en realidad una adjudicación, el contrafactual cambia.')
}

console.log('\n── 4b. ESTADOS SIN MAPEAR (→ en_evaluacion, resolución manual) ──')
if (rep.estados_sin_mapear.length === 0) {
  console.log('  ninguno')
} else {
  const agr = {}
  for (const e of rep.estados_sin_mapear) {
    const k = `${e.crudo}|${e.imprevisto ? 'IMPREVISTO' : 'ambiguo conocido'}`
    agr[k] = agr[k] || []
    agr[k].push(`${e.fuente.hoja}!${e.fuente.fila_excel} ${e.numero_proceso}`)
  }
  for (const [k, filas] of Object.entries(agr)) {
    const [crudo, clase] = k.split('|')
    console.log(`  "${crudo}" × ${filas.length}  (${clase})`)
    console.log(`      ${filas.slice(0, 4).join(' · ')}${filas.length > 4 ? ` … +${filas.length - 4}` : ''}`)
  }
  console.log('  Los "ambiguo conocido" NO bloquean el guard: la especificación ya')
  console.log('  decidió mapearlos a en_evaluacion y listarlos. Solo los IMPREVISTOS')
  console.log('  cuentan para el umbral del 5 %.')
}

// ── 5. Guard de calidad ─────────────────────────────────────────────────────
console.log('\n── 5. GUARD DE CALIDAD ──')
if (rep.puede_importar) {
  console.log('  ✓ sin señales — la importación puede proceder')
} else {
  console.log('  ✗ BLOQUEADO:')
  for (const s of rep.senales) console.log(`      · ${s}`)
}

// ── 6. SEMÁFORO RETROACTIVO — el entregable que decide ──────────────────────
const ev = evaluarRetroactivo(rep.registros)
console.log('\n═══════════════════════════════════════════════════════════════')
console.log(`  6. SEMÁFORO RETROACTIVO — criterio ${ev.version_criterio}`)
console.log('═══════════════════════════════════════════════════════════════')
console.log('\n  ⚠ ALCANCE REAL DE LA MEDICIÓN: de las 4 señales del criterio,')
console.log('    el histórico solo permite calcular 2 (modalidad + sorteo).')
console.log('    LIMITACIÓN MIPYMES contiene fechas (columna mal rotulada) y')
console.log('    "requiere lectura" es un juicio humano que no se registró.')
console.log('    Ambas se pasan como false = conservador: el filtro deja pasar')
console.log('    MÁS de lo que dejaría con el criterio completo, así que este')
console.log('    contrafactual es una COTA INFERIOR del filtrado.\n')

console.log('  ⚠ Las presentadas SIN modalidad registrada quedan FUERA del')
console.log('    contrafactual: PROCESOS.xlsx (2022) no tiene columna de tipo de')
console.log('    proceso, y pintarlas rojo por una columna que nunca existió daría')
console.log('    un veredicto falso. Se reportan aparte, no se cuentan como')
console.log('    "descartadas por el filtro".\n')

console.log('  REALIDAD                                  CONTRAFACTUAL DEL FILTRO')
const H = ['Año','Total','Presnt','Adjud','Tasa real','│','Eval','Pasan','Adj.cons','ADJ.PERD','Bloq.s/ret','Tasa filtr.']
console.log('  ' + H[0].padEnd(6) + H[1].padStart(6) + H[2].padStart(8) + H[3].padStart(7)
  + H[4].padStart(11) + '   ' + H[5] + H[6].padStart(6) + H[7].padStart(7)
  + H[8].padStart(10) + H[9].padStart(10) + H[10].padStart(12) + H[11].padStart(13))
console.log('  ' + '─'.repeat(103))
for (const a of ev.por_anio) {
  console.log('  '
    + String(a.anio).padEnd(6)
    + String(a.total).padStart(6)
    + String(a.presentadas).padStart(8)
    + String(a.adjudicadas).padStart(7)
    + pct(a.tasa_real_pct).padStart(11)
    + '   │'
    + String(a.evaluables).padStart(6)
    + String(a.pasan_filtro).padStart(7)
    + String(a.adjudicaciones_conservadas).padStart(10)
    + String(a.adjudicaciones_perdidas).padStart(10)
    + String(a.sin_retorno_bloqueadas).padStart(12)
    + pct(a.tasa_filtrada_pct).padStart(13))
}
if (ev.excluidas_sin_modalidad > 0) {
  console.log(`
  Excluidas del contrafactual (sin modalidad en el origen): ${ev.excluidas_sin_modalidad} presentadas,`)
  console.log(`  de las cuales ${ev.adjudicaciones_no_evaluables} fueron adjudicaciones. Sobre esas el criterio NO se puede`)
  console.log('  validar con estos archivos — es un hueco de la medición, no un resultado.')
  for (const a of ev.por_anio.filter(x => x.presentadas_sin_modalidad > 0)) {
    console.log(`      ${a.anio}: ${a.presentadas_sin_modalidad} presentadas sin modalidad (${a.adjudicadas_sin_modalidad} adjudicadas)`)
  }
}

console.log('\n  ── VEREDICTO ──')
if (ev.criterio_aprobado) {
  console.log('  ✓ El filtro NO descarta ninguna adjudicación real en ningún año.')
  console.log('    Criterio de cancelación NO se activa — se puede avanzar al 1.4.')
} else {
  console.log(`  ✗✗✗ ALTO: el filtro habría descartado ${ev.adjudicaciones_perdidas_total} adjudicación(es) REAL(es).`)
  console.log('      CRITERIO DE CANCELACIÓN ACTIVADO — NO avanzar al sub-bloque 1.4.')
  for (const p of ev.adjudicaciones_perdidas_detalle) {
    console.log(`      · ${p.anio} · ${p.numero_proceso} · $${fmt(p.presupuesto_oficial)} · ${p.modalidad} · ${p.semaforo} [${p.motivos.join(', ')}]`)
  }
}

// Distribución del semáforo sobre todo el histórico.
const conSem = estamparSemaforo(rep.registros)
const dist = {}
for (const r of conSem) dist[r.semaforo] = (dist[r.semaforo] || 0) + 1
console.log('\n  Distribución del semáforo sobre los ' + conSem.length + ' migrados:')
for (const s of ['verde','amarillo','rojo']) console.log(`      ${s.padEnd(9)} ${dist[s] || 0}`)

// ── 7. Volcado del reporte a JSON (para revisión offline) ───────────────────
const salida = resolve(RAIZ, '_datos', 'reporte-importacion-licitaciones.json')
writeFileSync(salida, JSON.stringify({
  generado_en_modo: MODO,
  encabezados: rep.encabezados,
  volumen: {
    registros: rep.registros.length,
    duplicadas: rep.duplicadas.length,
    descartadas: rep.descartadas.length,
    por_motivo: porMotivo,
  },
  conteo_2025: { procesos: de2025.length, presentados: pres2025, adjudicados: adj2025 },
  estados_sin_mapear: rep.estados_sin_mapear,
  mapeos_a_confirmar: rep.mapeos_a_confirmar,
  senales: rep.senales,
  evaluacion_retroactiva: ev,
  por_anio_bruto: contarPorAnio(rep.registros),
}, null, 2), 'utf8')
console.log(`\n  Reporte completo → ${salida}`)
console.log('  (vive en _datos/, que está gitignoreado: contiene precios reales)')

// ── 8. Escritura ────────────────────────────────────────────────────────────
if (!COMMIT) {
  console.log('\n⚠️  MODO DRY-RUN: no se escribió NADA.')
  console.log('   Para aplicar: --commit (requiere GOOGLE_APPLICATION_CREDENTIALS + IMPORTA_UID)\n')
  process.exit(0)
}

if (!rep.puede_importar) {
  console.error('\n✗ ABORTA: el guard de calidad tiene señales. No se escribe nada.\n')
  process.exit(1)
}
if (!ev.criterio_aprobado) {
  console.error('\n✗ ABORTA: la evaluación retroactiva descarta adjudicaciones reales.')
  console.error('  Ese es el criterio de cancelación acordado. No se escribe nada.\n')
  process.exit(1)
}

const UID = process.env.IMPORTA_UID
if (!UID) {
  console.error('\n✗ Falta IMPORTA_UID (uid de quien ejecuta la migración).\n')
  process.exit(1)
}

const admin = (await import('firebase-admin')).default
const { getFirestore, Timestamp, FieldValue } = await import('firebase-admin/firestore')

if (EMULADOR) process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
admin.initializeApp(
  EMULADOR ? { projectId: 'demo-neg' }
    : { credential: admin.credential.applicationDefault(), projectId: 'neg-sst-app' },
)
const db = getFirestore()

/** Doc id determinístico → idempotencia por número de proceso. */
const docId = numero => 'hist_' + numero
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120)

const aTs = iso => iso === null ? null : Timestamp.fromDate(new Date(`${iso}T12:00:00Z`))
const ahora = Timestamp.now()

let escritos = 0
const LOTE = 450   // < 500, holgura como en el wizard de LPU
for (let i = 0; i < conSem.length; i += LOTE) {
  const batch = db.batch()
  for (const r of conSem.slice(i, i + LOTE)) {
    batch.set(db.doc(`licitaciones/${docId(r.numero_proceso)}`), {
      consecutivo: '',
      numero_proceso: r.numero_proceso,
      id_secop: null,
      origen: 'manual',
      url_proceso: r.url_proceso,
      entidad: r.entidad,
      objeto: r.objeto,
      categoria_unspsc: null,
      modalidad: r.modalidad,
      presupuesto_oficial: r.presupuesto_oficial ?? 0,
      lotes: r.lotes,
      cronograma: {
        publicacion: null,
        manifestacion: aTs(r.cronograma.manifestacion),
        sorteo: aTs(r.cronograma.sorteo),
        cierre: aTs(r.cronograma.cierre),
        adjudicacion: null,
      },
      semaforo: r.semaforo,
      semaforo_motivos: r.semaforo_motivos,
      semaforo_version: r.semaforo_version,
      semaforo_calculado_en: ahora,
      override_manual: null,
      estado: r.estado,
      motivo_descarte: r.motivo_descarte,
      oferta_neg: r.oferta_neg,
      oferta_ganador: r.oferta_ganador,
      ganador: null,
      manifestaciones: null,
      ofertas_recibidas: null,
      migrado: true,
      anio_historico: r.anio,
      observacion_cruda: r.observacion_cruda,
      fuente_migracion: r.fuente,
      responsable_uid: UID,
      creado_por: UID,
      creado_en: ahora,
      actualizado_por: UID,
      actualizado_en: ahora,
      activa: false,          // histórico: nada en juego
      fecha_actualizacion: FieldValue.serverTimestamp(),
    }, { merge: true })
    escritos++
  }
  await batch.commit()
  console.log(`  lote ${Math.floor(i / LOTE) + 1}: ${Math.min(LOTE, conSem.length - i)} docs`)
}

console.log(`\n✅ ${escritos} registros históricos escritos en \`licitaciones\`.`)
console.log('   Idempotente: re-correr actualiza por número de proceso, no duplica.\n')
