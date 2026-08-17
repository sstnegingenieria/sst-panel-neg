// C2.1 paso 5 — cierre PARCIAL de H-001.
//
// La cédula de un contratista persona natural es DATO PERSONAL (Ley 1581/2012)
// y no puede vivir en el doc público de `contratistas` (read: if true — lo
// exige el selector de empleador pre-login de la app Flutter). Vive en el
// sub-doc `contratistas/{id}/privado/datos` (patrón proveedores C1).
//
// El NIT se queda en el padre A PROPÓSITO: es dato de registro mercantil
// público (RUES) y es lo único que la app Flutter lee y escribe del doc —
// moverlo la rompería (línea roja). Riesgo aceptado y documentado en H-001.
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'

export interface ContratistaPrivado {
  cedula?: string
}

/** Único punto de lectura de la cédula. Desde la fase 3 (migración
 *  completada y verificada) lee SOLO el sub-doc privado — el respaldo al
 *  campo legado del padre se retiró: el padre ya no tiene el campo y la
 *  regla restrictiva del padre impide que vuelva. */
export function resolverCedula(
  _padre: { cedula?: string },
  privado: ContratistaPrivado | null | undefined,
): string {
  return privado?.cedula ?? ''
}

/** Lee el sub-doc privado. Sin permiso o inexistente → null (degrada al
 *  respaldo del padre sin romper la vista). */
export async function leerPrivado(contratistaId: string): Promise<ContratistaPrivado | null> {
  try {
    const s = await getDoc(doc(db, 'contratistas', contratistaId, 'privado', 'datos'))
    return s.exists() ? (s.data() as ContratistaPrivado) : null
  } catch {
    return null
  }
}

/** Escribe la cédula en el sub-doc privado (merge — no pisa campos futuros). */
export async function guardarCedulaPrivada(contratistaId: string, cedula: string): Promise<void> {
  await setDoc(doc(db, 'contratistas', contratistaId, 'privado', 'datos'), { cedula }, { merge: true })
}
