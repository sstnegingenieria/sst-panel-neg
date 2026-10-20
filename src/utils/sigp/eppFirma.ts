// Firma del acta de EPP: helpers PUROS (sin DOM) para el canvas y la integridad.
// El componente FirmaCanvas solo captura los trazos y dibuja; aquí vive la lógica
// que se puede probar sin navegador.
import type { ActaEpp } from '../../types/sigp/epp'

/** Tamaño lógico del lienzo de firma (px). El PNG sale a este tamaño: ~3–10 KB. */
export const FIRMA_ANCHO = 480
export const FIRMA_ALTO = 160

export interface Punto { x: number; y: number }
export type Trazo = Punto[]

const MIN_PUNTOS = 6
const MIN_RECORRIDO_PX = 80
const MIN_ANCHO_O_ALTO_PX = 30

/** ¿Los trazos alcanzan para considerarse una firma? Evita guardar un punto suelto o
 *  un clic accidental: exige puntos suficientes, recorrido y una caja mínima. */
export function trazosSuficientes(trazos: readonly Trazo[]): boolean {
  const puntos = trazos.flat()
  if (puntos.length < MIN_PUNTOS) return false
  let recorrido = 0
  for (const t of trazos) {
    for (let i = 1; i < t.length; i++) {
      recorrido += Math.hypot(t[i].x - t[i - 1].x, t[i].y - t[i - 1].y)
    }
  }
  if (recorrido < MIN_RECORRIDO_PX) return false
  const xs = puntos.map(p => p.x), ys = puntos.map(p => p.y)
  const ancho = Math.max(...xs) - Math.min(...xs)
  const alto = Math.max(...ys) - Math.min(...ys)
  return Math.max(ancho, alto) >= MIN_ANCHO_O_ALTO_PX
}

type ContenidoFirmable = Pick<ActaEpp, 'colaborador' | 'items' | 'firmantes_empresa' | 'fecha' | 'clausulas_version'>

/** JSON canónico (orden de claves fijo) del contenido que respalda la firma. */
export function contenidoCanonico(a: ContenidoFirmable, firma: string): string {
  const c = a.colaborador
  return JSON.stringify({
    colaborador: {
      fuente: c.fuente, ref_id: c.ref_id, nombre: c.nombre, cedula: c.cedula, cargo: c.cargo,
      contratista_nombre: c.contratista_nombre ?? null,
    },
    items: a.items.map(i => ({ nombre: i.nombre, especificacion: i.especificacion, cantidad: i.cantidad, unidad: i.unidad })),
    firmantes_empresa: a.firmantes_empresa.map(f => ({ nombre: f.nombre, cargo: f.cargo })),
    fecha_ms: a.fecha.toMillis(),
    clausulas_version: a.clausulas_version,
    firma,
  })
}

/** SHA-256 hex del contenido + firma (evidencia de integridad, restricción 5.8). */
export async function hashContenidoActa(a: ContenidoFirmable, firma: string): Promise<string> {
  const datos = new TextEncoder().encode(contenidoCanonico(a, firma))
  const digest = await crypto.subtle.digest('SHA-256', datos)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** ¿El acta firmada sigue siendo la que se firmó? Recalcula el hash y lo compara. */
export async function verificarIntegridadActa(
  a: ContenidoFirmable & Pick<ActaEpp, 'firma_colaborador' | 'firma_hash'>,
): Promise<boolean> {
  if (!a.firma_colaborador || !a.firma_hash) return false
  return (await hashContenidoActa(a, a.firma_colaborador)) === a.firma_hash
}
