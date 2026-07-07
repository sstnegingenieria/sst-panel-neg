import { useState } from 'react'
import {
  collection, doc, getDocs, query, where, setDoc, updateDoc, writeBatch, Timestamp,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import type { Cliente } from '../../types/sigp/cliente'
import type { MapeoHoja, MapeoImportacion } from '../../types/sigp/importacion'
import type { ItemParseado } from '../../utils/sigp/lpuMapeo'

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

    // 3. Versionado: buscar LPU vigente del cliente (filtro de estado en cliente).
    setProgreso({ fase: 'Finalizando', pct: 85 })
    const existentes = await getDocs(query(collection(db, 'lpus'), where('cliente_id', '==', p.cliente.id)))
    const vigentes = existentes.docs.filter(d => d.data().estado === 'vigente')
    const anterior = vigentes.sort((a, b) => (b.data().version ?? 0) - (a.data().version ?? 0))[0]
    const version = anterior ? (anterior.data().version ?? 0) + 1 : 1

    // 4. Doc padre AL FINAL (la LPU aparece solo cuando ya tiene ítems + Excel).
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
    await setDoc(lpuRef, lpuData)

    // 5. Supersede: la anterior pasa a histórica.
    if (anterior) {
      await updateDoc(anterior.ref, { estado: 'historica', fecha_actualizacion: Timestamp.now() })
    }

    // 6. Guardar el mapeo en el cliente para reutilizarlo.
    const nuevoMapeo: MapeoImportacion = {
      nombre: `Importación ${p.nombre}`.slice(0, 80),
      hojas: Object.values(p.mapeos),
      fecha_guardado: Timestamp.now(),
    }
    await updateDoc(doc(db, 'clientes', p.cliente.id), {
      mapeos_lpu_guardados: [...p.cliente.mapeos_lpu_guardados, nuevoMapeo],
      fecha_actualizacion: Timestamp.now(),
    })

    setProgreso({ fase: 'Listo', pct: 100 })
    return lpuId
  }

  return { importar, progreso }
}
