import { useState } from 'react'
import {
  arrayUnion, collection, doc, getDocs, query, where, updateDoc, writeBatch, Timestamp,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import type { Cliente } from '../../types/sigp/cliente'
import type { MapeoHoja, MapeoImportacion } from '../../types/sigp/importacion'
import type { ItemParseado } from '../../utils/sigp/lpuMapeo'
import { lpuVigente, type AlcanceLpu, type LPU } from '../../types/sigp/lpu'

// Máximo de operaciones por batch de Firestore es 500; dejamos margen.
const TAM_BATCH = 450

export interface ImportarLpuParams {
  cliente: Cliente
  file: File
  nombre: string
  vigencia?: { desde: Timestamp | null; hasta: Timestamp | null }
  moneda: string
  items: ItemParseado[]
  categorias: string[]
  mapeos: Record<string, MapeoHoja>
  uid?: string
  /** C1.1: alcance de la lista (contrato + naturaleza). Vacío = clásica. */
  alcance?: AlcanceLpu
  /** C1.1: si el guard de calidad disparó y el usuario FORZÓ, las señales
   *  quedan registradas en el doc de la LPU (evidencia auditable). */
  forzadoSenales?: string[]
}

export interface ProgresoImportacion {
  fase: string
  pct: number
}

function trocear<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Escribe una LPU completa: ítems en batches ≤500 (subcolección), sube el Excel
 * original a Storage, y crea el doc padre AL FINAL para que la LPU solo aparezca
 * cuando la importación está completa. Aplica versionado: si el cliente ya tiene
 * una LPU vigente, la marca histórica y encadena `version` + `reemplaza_a`.
 * Guarda el mapeo usado en el cliente para reutilizarlo.
 */
export function useImportarLpu() {
  const [progreso, setProgreso] = useState<ProgresoImportacion | null>(null)

  const importar = async (p: ImportarLpuParams): Promise<string> => {
    const lpuRef = doc(collection(db, 'lpus'))
    const lpuId = lpuRef.id

    // 1. Ítems en batches (subcolección lpus/{id}/items).
    const grupos = trocear(p.items, TAM_BATCH)
    setProgreso({ fase: 'Escribiendo ítems', pct: 0 })
    for (let i = 0; i < grupos.length; i++) {
      const batch = writeBatch(db)
      for (const it of grupos[i]) {
        const itemRef = doc(collection(db, 'lpus', lpuId, 'items'))
        const data: Record<string, unknown> = {
          codigo: it.codigo,
          descripcion: it.descripcion,
          unidad: it.unidad,
          valor_unitario: it.valor_unitario,
          categoria: it.categoria,
          orden: it.orden,
        }
        if (it.capitulo) data.capitulo = it.capitulo
        batch.set(itemRef, data)
      }
      await batch.commit()
      setProgreso({ fase: 'Escribiendo ítems', pct: Math.round(((i + 1) / grupos.length) * 70) })
    }

    // 2. Subir Excel original a Storage.
    setProgreso({ fase: 'Subiendo Excel', pct: 75 })
    const nombreArchivo = p.file.name.replace(/[^\w.\-]/g, '_')
    const snap = await uploadBytes(ref(storage, `lpus/${p.cliente.id}/${lpuId}/${nombreArchivo}`), p.file)
    const archivo_original_url = await getDownloadURL(snap.ref)

    // 3. Versionado POR ALCANCE (C1.1): la anterior a historizar es la vigente
    //    del MISMO alcance; si es la primera importación CON alcance y existe
    //    una legacy sin alcance, ESA es la anterior (misma cadena del cliente)
    //    — así la resolución nunca queda ambigua. Vigentes de OTROS alcances
    //    no se tocan.
    setProgreso({ fase: 'Finalizando', pct: 85 })
    const existentes = await getDocs(query(collection(db, 'lpus'), where('cliente_id', '==', p.cliente.id)))
    const lpus = existentes.docs.map(d => ({ id: d.id, ...d.data() })) as LPU[]
    const mismaAlcance = lpuVigente(lpus, p.cliente.id, p.alcance)
    const legacySinAlcance = (p.alcance?.contrato || p.alcance?.naturaleza)
      ? lpus.find(l => l.estado === 'vigente' && !l.contrato && !l.naturaleza) ?? null
      : null
    const anterior = mismaAlcance ?? legacySinAlcance
    const version = anterior ? (anterior.version ?? 0) + 1 : 1

    // 4+5. ATÓMICO (C1.1, diseño aprobado): los ítems ya viven en la
    //    subcolección SIN doc padre (invisible para todo el panel — Firestore
    //    lo permite), así que la PRIMERA aparición de la lista nueva Y la
    //    historización de la anterior van en UN solo writeBatch: ningún modo
    //    de fallo deja dos vigentes ni cero. Si la carga de ítems murió antes,
    //    queda una subcolección huérfana reimportable y la vigente intacta.
    const lpuData: Record<string, unknown> = {
      cliente_id: p.cliente.id,
      nombre: p.nombre,
      moneda: p.moneda,
      estado: 'vigente',
      version,
      archivo_original_url,
      archivo_original_nombre: p.file.name,
      importada_por: p.uid ?? null,
      fecha_importacion: Timestamp.now(),
      total_items: p.items.length,
      categorias: p.categorias,
    }
    if (p.vigencia && (p.vigencia.desde || p.vigencia.hasta)) lpuData.vigencia = p.vigencia
    if (anterior) lpuData.reemplaza_a = anterior.id
    if (p.alcance?.contrato) lpuData.contrato = p.alcance.contrato
    if (p.alcance?.naturaleza) lpuData.naturaleza = p.alcance.naturaleza
    if (p.forzadoSenales && p.forzadoSenales.length > 0) {
      lpuData.forzado_importacion = {
        por: p.uid ?? 'desconocido',
        fecha: Timestamp.now(),
        senales: p.forzadoSenales,
      }
    }
    const swap = writeBatch(db)
    swap.set(lpuRef, lpuData)
    if (anterior) {
      swap.update(doc(db, 'lpus', anterior.id), { estado: 'historica', fecha_actualizacion: Timestamp.now() })
    }
    // Historizar también la legacy si la anterior fue la del mismo alcance
    // pero además quedaba una legacy vigente sin alcance (ambigüedad).
    if (mismaAlcance && legacySinAlcance && legacySinAlcance.id !== mismaAlcance.id) {
      swap.update(doc(db, 'lpus', legacySinAlcance.id), { estado: 'historica', fecha_actualizacion: Timestamp.now() })
    }
    await swap.commit()

    // 6. Guardar el mapeo en el cliente para reutilizarlo.
    const nuevoMapeo: MapeoImportacion = {
      nombre: `Importación ${p.nombre}`.slice(0, 80),
      hojas: Object.values(p.mapeos),
      fecha_guardado: Timestamp.now(),
    }
    // C1.1: arrayUnion — APPEND server-side. Antes se escribía
    // [...prop.mapeos, nuevo] con el PROP del componente: en dos
    // importaciones de la misma sesión (el flujo normal de alcances) la
    // segunda PISABA el mapeo de la primera con la base stale.
    await updateDoc(doc(db, 'clientes', p.cliente.id), {
      mapeos_lpu_guardados: arrayUnion(nuevoMapeo),
      fecha_actualizacion: Timestamp.now(),
    })

    setProgreso({ fase: 'Listo', pct: 100 })
    return lpuId
  }

  return { importar, progreso }
}
