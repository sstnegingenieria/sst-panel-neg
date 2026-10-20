import { useCallback } from 'react'
import {
  addDoc, collection, doc, getDoc, getDocs, orderBy, query, runTransaction, setDoc, Timestamp, updateDoc, where,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import type { NominaContratista } from '../utils/contratistasNomina'
import {
  construirAltaActa, construirAltaCatalogo, patchActivoCatalogo, patchAnularActa, patchEditarActa,
  patchEditarCatalogo, patchFirmarActa, semillaCatalogo,
  type ActaEpp, type ActaEppConId, type ActaFormData, type Actor, type ColaboradorEpp,
  type ItemCatalogoEpp, type ItemCatalogoEppConId, type ItemCatalogoFormData,
} from '../types/sigp/epp'
import { CLAUSULAS_EPP_VERSION, clausulasListas } from '../utils/sigp/eppClausulas'
import { hashContenidoActa } from '../utils/sigp/eppFirma'

const COL_CATALOGO = 'catalogo_epp'
const COL_ACTAS = 'actas_epp'

/** Catálogo de EPP: CRUD de GI/admin (la regla lo restringe; lectura para el panel). */
export function useCatalogoEpp() {
  const cargar = useCallback(async (): Promise<ItemCatalogoEppConId[]> => {
    const snap = await getDocs(query(collection(db, COL_CATALOGO), orderBy('nombre', 'asc')))
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as ItemCatalogoEpp) }))
  }, [])

  /** Devuelve false si el formulario no valida (sin escribir). */
  const crear = useCallback(async (f: ItemCatalogoFormData, uid: string): Promise<boolean> => {
    const alta = construirAltaCatalogo(f, uid, Timestamp.now())
    if (!alta) return false
    await addDoc(collection(db, COL_CATALOGO), alta)
    return true
  }, [])

  const editar = useCallback(async (id: string, f: ItemCatalogoFormData, uid: string): Promise<boolean> => {
    const patch = patchEditarCatalogo(f, uid, Timestamp.now())
    if (!patch) return false
    await updateDoc(doc(db, COL_CATALOGO, id), patch)
    return true
  }, [])

  const setActivo = useCallback(async (id: string, activo: boolean, uid: string) => {
    await updateDoc(doc(db, COL_CATALOGO, id), patchActivoCatalogo(activo, uid, Timestamp.now()))
  }, [])

  /** Carga la semilla del formato. Idempotente: los ids son determinísticos y NO se
   *  sobreescribe un elemento que ya existe (podría estar editado). Devuelve cuántos creó. */
  const cargarSemilla = useCallback(async (uid: string): Promise<number> => {
    let creados = 0
    for (const { id, data } of semillaCatalogo(uid, Timestamp.now())) {
      const ref = doc(db, COL_CATALOGO, id)
      if ((await getDoc(ref)).exists()) continue
      await setDoc(ref, data)
      creados++
    }
    return creados
  }, [])

  return { cargar, crear, editar, setActivo, cargarSemilla }
}

/** Actas de EPP. Todo write sale de los builders puros de types/sigp/epp.ts. */
export function useActasEpp() {
  const cargar = useCallback(async (): Promise<ActaEppConId[]> => {
    const snap = await getDocs(query(collection(db, COL_ACTAS), orderBy('fecha_creacion', 'desc')))
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as ActaEpp) }))
  }, [])

  const cargarUna = useCallback(async (id: string): Promise<ActaEppConId | null> => {
    const snap = await getDoc(doc(db, COL_ACTAS, id))
    return snap.exists() ? { id: snap.id, ...(snap.data() as ActaEpp) } : null
  }, [])

  /** Id nuevo, o null si el formulario no valida (sin escribir). */
  const crear = useCallback(async (f: ActaFormData, actor: Actor): Promise<string | null> => {
    const alta = construirAltaActa(f, CLAUSULAS_EPP_VERSION, actor, Timestamp.now())
    if (!alta) return null
    const ref = await addDoc(collection(db, COL_ACTAS), alta)
    return ref.id
  }, [])

  const editar = useCallback(async (acta: ActaEppConId, f: ActaFormData, actor: Actor): Promise<boolean> => {
    const patch = patchEditarActa(acta, f, actor, Timestamp.now())
    if (!patch) return false
    await updateDoc(doc(db, COL_ACTAS, acta.id), patch as Record<string, unknown>)
    return true
  }, [])

  /**
   * FIRMAR: congela el acta con el hash (contenido + firma). Se hace en una TRANSACCIÓN que
   * relee el documento: si alguien lo editó entre que el colaborador lo vio y firmó (otra pestaña,
   * otro gestor), lanza ACTA_MODIFICADA en vez de firmar un contenido que el colaborador no vio
   * — un hash calculado sobre contenido viejo dejaría un acta inmutable que jamás verifica.
   * false si no es legal (no es borrador, firma inválida o el texto legal está pendiente).
   */
  const firmar = useCallback(async (acta: ActaEppConId, firmaPng: string, actor: Actor): Promise<boolean> => {
    if (!clausulasListas()) return false
    const ref = doc(db, COL_ACTAS, acta.id)
    return runTransaction(db, async tx => {
      const snap = await tx.get(ref)
      if (!snap.exists()) return false
      const actual = { id: snap.id, ...(snap.data() as ActaEpp) } as ActaEppConId
      if (actual.estado !== 'borrador') return false
      if ((actual.historial?.length ?? 0) !== (acta.historial?.length ?? 0)) throw new Error('ACTA_MODIFICADA')
      const hash = await hashContenidoActa(actual, firmaPng)
      const patch = patchFirmarActa(actual, firmaPng, hash, actor, Timestamp.now())
      if (!patch) return false
      tx.update(ref, patch as Record<string, unknown>)
      return true
    })
  }, [])

  const anular = useCallback(async (acta: ActaEppConId, motivo: string, actor: Actor): Promise<boolean> => {
    const patch = patchAnularActa(acta, motivo, actor, Timestamp.now())
    if (!patch) return false
    await updateDoc(doc(db, COL_ACTAS, acta.id), patch as Record<string, unknown>)
    return true
  }, [])

  return { cargar, cargarUna, crear, editar, firmar, anular }
}

// ── Desplegable único de colaborador ─────────────────────────────────────────

export interface OpcionColaboradorEpp extends ColaboradorEpp {
  /** Clave única de la opción. */
  clave: string
  /** Etiqueta con el origen: "Directo NEG" / "Contratista X". */
  origen: string
}

const normNombre = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' })

/**
 * Une en UNA lista los empleados directos ACTIVOS (maestro `empleados_directos`) y los
 * trabajadores VIGENTES (sin `retirado`) de la nómina de los contratistas ACTIVOS
 * (`contratistas/{id}/privado/nomina`). Lectura permitida a GI/admin por las reglas
 * existentes (gestionaEmpleados() y el match privado/{docId}). La nómina no trae cargo:
 * para contratistas queda vacío y se escribe a mano en el acta.
 */
export function useColaboradoresEpp() {
  const cargar = useCallback(async (): Promise<OpcionColaboradorEpp[]> => {
    const out: OpcionColaboradorEpp[] = []

    const emps = await getDocs(query(collection(db, 'empleados_directos'), where('activo', '==', true)))
    for (const d of emps.docs) {
      const e = d.data() as { nombre?: string; cedula?: string; cargo?: string }
      if (!e.nombre) continue
      out.push({
        clave: `directo:${d.id}`, origen: 'Directo NEG',
        fuente: 'directo', ref_id: d.id, nombre: e.nombre, cedula: e.cedula ?? '', cargo: e.cargo ?? '',
      })
    }

    const cs = await getDocs(collection(db, 'contratistas'))
    const activos = cs.docs.filter(c => (c.data() as { estado?: string }).estado === 'activo')
    const nominas = await Promise.all(activos.map(c =>
      getDoc(doc(db, 'contratistas', c.id, 'privado', 'nomina')).catch(() => null)))
    activos.forEach((c, i) => {
      const nombreC = String((c.data() as { nombre?: string }).nombre ?? c.id)
      const nomina = nominas[i]?.exists() ? (nominas[i]!.data() as NominaContratista) : null
      for (const [cedula, t] of Object.entries(nomina?.trabajadores ?? {})) {
        if (t.retirado || !t.nombre) continue
        out.push({
          clave: `contratista:${c.id}:${cedula}`, origen: `Contratista ${nombreC}`,
          fuente: 'contratista', ref_id: cedula, nombre: t.nombre, cedula, cargo: '', contratista_nombre: nombreC,
        })
      }
    })

    return out.sort((a, b) => normNombre(a.nombre, b.nombre))
  }, [])

  return { cargar }
}
