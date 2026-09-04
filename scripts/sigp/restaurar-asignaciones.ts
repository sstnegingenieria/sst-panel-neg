// P2-2 · SB6 — RESTAURACIÓN de la migración de asignaciones (condición 1 de
// Giovanny, 04-sep): "el script de restauración se escribe y se prueba ANTES
// de migrar, no después de que algo falle". Probamos que la protección
// PROTEGE, no que existe (misma disciplina que la guarda de P2-1).
//
// USO (desde la raíz del working tree):
//   RESPALDO=_respaldos/asignaciones-pre-migracion-YYYY-MM-DD.json \
//     npx vite-node scripts/sigp/restaurar-asignaciones.ts
//   (FS_BASE/TOKEN como en migrar-asignaciones.ts; emulador por defecto)
//
// Qué hace por proyecto del respaldo, en UN commit ATÓMICO:
//   - restaura el DOC COMPLETO del padre tal cual estaba (el respaldo guarda
//     los fields crudos ENTEROS — vuelve preliquidacion/compras_reembolsos/
//     fecha_actualizacion y desaparece resumen_asignaciones, que no existía)
//   - borra el sub-doc 'legacy' que la migración creó (SOLO ese — jamás toca
//     sub-docs que no creó la migración; si hay otros, ABORTA ese proyecto)
// Post-verificación: el padre releído debe ser CANÓNICAMENTE IDÉNTICO al
// respaldo (claves ordenadas en profundidad — lección C1.2: jamás comparar
// JSON.stringify crudo entre dos lecturas REST).
import { readFileSync } from 'node:fs'

const FS_BASE = process.env.FS_BASE ?? 'http://127.0.0.1:8080'
const PROJECT = process.env.FS_PROJECT ?? 'neg-sst-app'
const TOKEN = process.env.TOKEN ?? 'owner'
const RESPALDO = process.env.RESPALDO
if (!RESPALDO) { console.error('Falta RESPALDO=<ruta del json>'); process.exit(1) }
const RAIZ = `${FS_BASE}/v1/projects/${PROJECT}/databases/(default)`
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

// Canónico: claves ordenadas en profundidad (los arrays conservan orden).
function canonico(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonico)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v as object).sort()
      .map(k => [k, canonico((v as Record<string, unknown>)[k])]))
  }
  return v
}
const igualCanonico = (a: unknown, b: unknown) =>
  JSON.stringify(canonico(a)) === JSON.stringify(canonico(b))

async function main() {
  const respaldo = JSON.parse(readFileSync(RESPALDO as string, 'utf8')) as {
    fecha: string; base: string; proyecto: string
    docs: { id: string; consecutivo: string; fields: Record<string, unknown> }[]
  }
  console.log(`Respaldo del ${respaldo.fecha} · ${respaldo.docs.length} proyectos · destino: ${FS_BASE}`)

  let ok = 0
  const fallas: string[] = []
  for (const d of respaldo.docs) {
    // Guardia: la migración creó SOLO el sub-doc 'legacy' — si hay otros
    // sub-docs, alguien trabajó encima y restaurar a ciegas PISARÍA trabajo
    // real → se aborta ESE proyecto y se reporta (decisión humana).
    const rSub = await fetch(`${RAIZ}/documents/proyectos/${d.id}/asignaciones?pageSize=10`, { headers: H })
    const sub = (await rSub.json() as { documents?: { name: string }[] }).documents ?? []
    const otros = sub.filter(s => !s.name.endsWith('/legacy'))
    if (otros.length > 0) {
      fallas.push(`${d.consecutivo}: ${otros.length} sub-doc(s) NO creados por la migración — NO se restaura (revisar a mano)`)
      continue
    }
    const writes: unknown[] = [
      {
        update: {
          name: `projects/${PROJECT}/databases/(default)/documents/proyectos/${d.id}`,
          fields: d.fields,
        },
        // SIN updateMask = REEMPLAZO COMPLETO del doc → vuelve todo lo que
        // había y desaparece todo lo que la migración agregó.
      },
    ]
    if (sub.length === 1) {
      writes.push({ delete: `projects/${PROJECT}/databases/(default)/documents/proyectos/${d.id}/asignaciones/legacy` })
    }
    const r = await fetch(`${RAIZ}/documents:commit`, {
      method: 'POST', headers: H, body: JSON.stringify({ writes }),
    })
    if (!r.ok) { fallas.push(`${d.consecutivo}: commit ${r.status} ${await r.text()}`); continue }

    // Post-verificación canónica: el padre releído == respaldo, byte a byte
    // lógico; y la subcolección quedó vacía.
    const rPadre = await fetch(`${RAIZ}/documents/proyectos/${d.id}`, { headers: H })
    const padre = await rPadre.json() as { fields: Record<string, unknown> }
    const rSub2 = await fetch(`${RAIZ}/documents/proyectos/${d.id}/asignaciones?pageSize=5`, { headers: H })
    const sub2 = (await rSub2.json() as { documents?: unknown[] }).documents ?? []
    if (!igualCanonico(padre.fields, d.fields)) fallas.push(`${d.consecutivo}: el padre restaurado NO es idéntico al respaldo`)
    else if (sub2.length !== 0) fallas.push(`${d.consecutivo}: la subcolección no quedó vacía (${sub2.length})`)
    else { ok++; console.log(`  ✓ restaurado IDÉNTICO ${d.consecutivo}`) }
  }

  console.log(`\nRESULTADO: ${ok}/${respaldo.docs.length} restaurados idénticos`)
  if (fallas.length) { console.log('FALLAS:'); for (const f of fallas) console.log('  ✗', f); process.exit(1) }
}

main().catch(e => { console.error(e); process.exit(1) })
