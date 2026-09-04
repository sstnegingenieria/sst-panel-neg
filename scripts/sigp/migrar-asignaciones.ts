// P2-2 · SB6 — MIGRACIÓN MASIVA de la economía singular a asignaciones.
//
// MISMA IMPLEMENTACIÓN que la lectura dual y la migración lazy: importa
// sintetizarAsignacionLegacy / resumenAsignacionesDe del motor real (por eso
// corre con vite-node desde la raíz del árbol — jamás una copia del builder).
//
// USO (desde la raíz del working tree):
//   npx vite-node scripts/sigp/migrar-asignaciones.ts                 → DRY-RUN (emulador)
//   MODO=aplicar npx vite-node scripts/sigp/migrar-asignaciones.ts   → aplica (emulador)
//   FS_BASE=https://firestore.googleapis.com TOKEN=$(...) ...          → prod (con OK explícito)
//
// Qué hace por proyecto:
//   - subcolección `asignaciones` NO vacía → YA MIGRADO (se salta — idempotente)
//   - `asignacion` en el padre → sintetiza el sub-doc 'legacy', siembra
//     `resumen_asignaciones` y RETIRA preliquidacion/compras_reembolsos del
//     padre (`asignacion` SE CONSERVA — espejo de identidad hasta P2-3)
//   - sin `asignacion` → nada que migrar
// Aplicación por proyecto = UN commit ATÓMICO (create sub-doc + update padre).
// ANTES de escribir guarda el RESPALDO (docs crudos completos) — la entrada
// de restaurar-asignaciones.ts.
// Reporta la lista "revisar cobertura" ANTES (síntesis) y, tras aplicar,
// DESPUÉS (sub-docs): deben ser LOS MISMOS consecutivos (chequeo de Giovanny —
// si el conjunto cambia, la síntesis está mal).
import { writeFileSync, mkdirSync } from 'node:fs'
import { Timestamp } from 'firebase/firestore'
import {
  sintetizarAsignacionLegacy, resumenAsignacionesDe, requiereRevisionCobertura,
  margenImplicitoDe, estadoAsignacionLegacyDe,
} from '../../src/types/sigp/asignacion'
import type { AsignacionContratista } from '../../src/types/sigp/asignacion'
import type { Proyecto, AlcanceGrupo } from '../../src/types/sigp/proyecto'

const FS_BASE = process.env.FS_BASE ?? 'http://127.0.0.1:8080'
const PROJECT = process.env.FS_PROJECT ?? 'neg-sst-app'
const TOKEN = process.env.TOKEN ?? 'owner'
const MODO = process.env.MODO === 'aplicar' ? 'aplicar' : 'dry'
const RESPALDO = process.env.RESPALDO
  ?? `_respaldos/asignaciones-pre-migracion-${new Date().toISOString().slice(0, 10)}.json`
const RAIZ = `${FS_BASE}/v1/projects/${PROJECT}/databases/(default)`
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

// ── Firestore REST ⇄ JS (timestamps como Timestamp REALES del SDK) ──────────
type RestValue = Record<string, unknown>
function decodeValue(v: RestValue): unknown {
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('booleanValue' in v) return v.booleanValue
  if ('nullValue' in v) return null
  if ('timestampValue' in v) return Timestamp.fromDate(new Date(v.timestampValue as string))
  if ('mapValue' in v) return decodeFields(((v.mapValue as RestValue).fields ?? {}) as Record<string, RestValue>)
  if ('arrayValue' in v) return (((v.arrayValue as RestValue).values ?? []) as RestValue[]).map(decodeValue)
  throw new Error('valor REST desconocido: ' + JSON.stringify(v).slice(0, 80))
}
const decodeFields = (f: Record<string, RestValue>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(f).map(([k, v]) => [k, decodeValue(v)]))
function encodeValue(v: unknown): RestValue {
  if (v === null || v === undefined) return { nullValue: null }
  if (v instanceof Timestamp) return { timestampValue: v.toDate().toISOString() }
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } }
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v as Record<string, unknown>) } }
  throw new Error('valor JS no codificable: ' + typeof v)
}
const encodeFields = (o: Record<string, unknown>): Record<string, RestValue> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, encodeValue(v)]))

async function listar(path: string): Promise<{ name: string; fields: Record<string, RestValue> }[]> {
  const docs: { name: string; fields: Record<string, RestValue> }[] = []
  let pageToken = ''
  do {
    const r = await fetch(`${RAIZ}/documents/${path}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`, { headers: H })
    if (!r.ok) throw new Error(`list ${path}: ${r.status} ${await r.text()}`)
    const j = await r.json() as { documents?: typeof docs; nextPageToken?: string }
    docs.push(...(j.documents ?? []))
    pageToken = j.nextPageToken ?? ''
  } while (pageToken)
  return docs
}

async function main() {
  const proyectosRaw = await listar('proyectos')
  console.log(`Proyectos: ${proyectosRaw.length} · modo: ${MODO.toUpperCase()} · destino: ${FS_BASE}`)

  type Plan = {
    id: string; consecutivo: string; raw: { name: string; fields: Record<string, RestValue> }
    legacy: Omit<AsignacionContratista, 'id'>; resumen: ReturnType<typeof resumenAsignacionesDe>
    alcance: AlcanceGrupo[]; revisar: boolean; margen: number | null
  }
  const planes: Plan[] = []
  const yaMigrados: string[] = []
  const sinAsignacion: string[] = []

  for (const raw of proyectosRaw) {
    const id = raw.name.split('/').pop() as string
    const p = { id, ...decodeFields(raw.fields) } as unknown as Proyecto
    const subRaw = await listar(`proyectos/${id}/asignaciones`)
    if (subRaw.length > 0) { yaMigrados.push(p.consecutivo ?? id); continue }
    const legacy = sintetizarAsignacionLegacy(p)
    if (!legacy) { sinAsignacion.push(p.consecutivo ?? id); continue }
    const alcance = p.snapshot?.alcance ?? []
    const conId = { ...legacy, id: 'legacy' } as AsignacionContratista
    const resumen = resumenAsignacionesDe([conId], alcance)
    planes.push({
      id, consecutivo: p.consecutivo ?? id, raw, legacy, resumen, alcance,
      revisar: requiereRevisionCobertura(conId, alcance),
      margen: margenImplicitoDe(conId, alcance),
    })
  }

  console.log(`\n— Ya migrados (idempotencia: se saltan): ${yaMigrados.length}${yaMigrados.length ? ' → ' + yaMigrados.join(', ') : ''}`)
  console.log(`— Sin asignación (nada que migrar): ${sinAsignacion.length}${sinAsignacion.length ? ' → ' + sinAsignacion.join(', ') : ''}`)
  console.log(`— A migrar: ${planes.length}`)
  for (const pl of planes) {
    const pre = pl.legacy.preliquidacion
    console.log(`  ${pl.consecutivo} · ${pl.legacy.estado} · contratista ${pre ? pre.valor_contratista : '—'} · átomos ${pl.legacy.atomos.length}` +
      (pl.revisar ? ` · ⚠ REVISAR (margen implícito ${pl.margen?.toFixed(1)}%)` : ''))
  }
  const revisarAntes = planes.filter(pl => pl.revisar).map(pl => pl.consecutivo).sort()
  console.log(`\n★ REVISAR COBERTURA — ANTES (síntesis, ${revisarAntes.length}): ${revisarAntes.join(' · ') || '(ninguno)'}`)

  if (MODO !== 'aplicar') { console.log('\nDRY-RUN: no se escribió nada.'); return }

  // ── RESPALDO ANTES DE ESCRIBIR (la entrada de restaurar-asignaciones.ts) ──
  mkdirSync(RESPALDO.split('/').slice(0, -1).join('/') || '.', { recursive: true })
  writeFileSync(RESPALDO, JSON.stringify({
    fecha: new Date().toISOString(), base: FS_BASE, proyecto: PROJECT,
    docs: planes.map(pl => ({ id: pl.id, consecutivo: pl.consecutivo, fields: pl.raw.fields })),
  }, null, 2))
  console.log(`\nRespaldo escrito: ${RESPALDO} (${planes.length} docs crudos completos)`)

  // ── APLICAR: un commit ATÓMICO por proyecto ──
  const ahora = Timestamp.fromDate(new Date())
  for (const pl of planes) {
    const patchPadre: Record<string, unknown> = {
      resumen_asignaciones: pl.resumen, fecha_actualizacion: ahora,
    }
    const body = {
      writes: [
        {
          update: {
            name: `projects/${PROJECT}/databases/(default)/documents/proyectos/${pl.id}/asignaciones/legacy`,
            fields: encodeFields(pl.legacy as unknown as Record<string, unknown>),
          },
          currentDocument: { exists: false },   // jamás pisa una migración previa
        },
        {
          update: {
            name: `projects/${PROJECT}/databases/(default)/documents/proyectos/${pl.id}`,
            fields: encodeFields(patchPadre),
          },
          // preliquidacion/compras_reembolsos en la máscara SIN valor = DELETE;
          // `asignacion` NO está en la máscara → SE CONSERVA (espejo P2-3).
          updateMask: { fieldPaths: ['resumen_asignaciones', 'fecha_actualizacion', 'preliquidacion', 'compras_reembolsos'] },
          currentDocument: { exists: true },
        },
      ],
    }
    const r = await fetch(`${RAIZ}/documents:commit`, { method: 'POST', headers: H, body: JSON.stringify(body) })
    if (!r.ok) throw new Error(`commit ${pl.consecutivo}: ${r.status} ${await r.text()}`)
    console.log(`  ✓ migrado ${pl.consecutivo}`)
  }

  // ── POST-VERIFICACIÓN: releer TODO y recomputar de los SUB-DOCS ──
  console.log('\nPost-verificación (releyendo de Firestore):')
  const revisarDespues: string[] = []
  let ok = 0
  for (const pl of planes) {
    const rPadre = await fetch(`${RAIZ}/documents/proyectos/${pl.id}`, { headers: H })
    const padre = await rPadre.json() as { fields: Record<string, RestValue> }
    const sub = await listar(`proyectos/${pl.id}/asignaciones`)
    const fallas: string[] = []
    if ('preliquidacion' in padre.fields) fallas.push('preliquidacion sigue en el padre')
    if ('compras_reembolsos' in padre.fields) fallas.push('compras_reembolsos sigue en el padre')
    if (!('asignacion' in padre.fields) && 'asignacion' in pl.raw.fields) fallas.push('asignacion NO se conservó')
    if (!('resumen_asignaciones' in padre.fields)) fallas.push('sin resumen')
    if (sub.length !== 1 || !sub[0].name.endsWith('/legacy')) fallas.push(`subcolección inesperada (${sub.length})`)
    if (fallas.length) { console.log(`  ✗ ${pl.consecutivo}: ${fallas.join(' · ')}`) } else {
      ok++
      const subA = { id: 'legacy', ...decodeFields(sub[0].fields) } as unknown as AsignacionContratista
      const p2 = decodeFields(padre.fields) as unknown as Proyecto
      if (requiereRevisionCobertura(subA, p2.snapshot?.alcance ?? [])) revisarDespues.push(pl.consecutivo)
    }
  }
  revisarDespues.sort()
  console.log(`  ${ok}/${planes.length} verificados`)
  console.log(`\n★ REVISAR COBERTURA — DESPUÉS (sub-docs, ${revisarDespues.length}): ${revisarDespues.join(' · ') || '(ninguno)'}`)
  const iguales = JSON.stringify(revisarAntes) === JSON.stringify(revisarDespues)
  console.log(iguales
    ? '★ CHEQUEO DE GIOVANNY: el conjunto de revisar es EL MISMO antes y después ✓'
    : '★★★ ALERTA: el conjunto de revisar CAMBIÓ — la síntesis está mal, NO continuar ★★★')
  if (!iguales) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
