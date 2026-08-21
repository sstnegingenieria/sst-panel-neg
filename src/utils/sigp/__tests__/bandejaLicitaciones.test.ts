import { describe, it, expect } from 'vitest'
import type { Timestamp } from 'firebase/firestore'
import {
  SECCIONES_BANDEJA, CAPACIDAD_SEMANAL_DEFAULT,
  seccionDe, compitePorCupo, ordenarPorCierre, repartirPorCapacidad,
  planIntercambioCupo, patchLiberarCupo, coincideBusqueda, contarSecciones,
  ESTADOS_ACTIVOS_BANDEJA, SEMAFORO_CHIP,
} from '../bandejaLicitaciones'
import type { LicitacionConId } from '../bandejaLicitaciones'
import { ESTADOS_LICITACION } from '../../../types/sigp/licitacion'
import type { EstadoLicitacion, Licitacion, Semaforo } from '../../../types/sigp/licitacion'

const ts = (ms: number) => ({ toMillis: () => ms } as unknown as Timestamp)
const AHORA = ts(1_000_000)
const ACTOR = { uid: 'uid-karen' }

let n = 0
const lic = (extra?: Partial<Licitacion> & { id?: string }): LicitacionConId => {
  n++
  return {
    id: extra?.id ?? `lic_${n}`,
    consecutivo: '', numero_proceso: `MC-${String(n).padStart(3, '0')}-2026`,
    id_secop: null, origen: 'secop_ii', url_proceso: '',
    entidad: { nombre: 'Entidad', nit: '', orden: '', departamento: '', ciudad: 'Bogotá' },
    objeto: 'Mantenimiento', categoria_unspsc: null,
    modalidad: 'minima_cuantia', presupuesto_oficial: 50_000_000, lotes: 1,
    cronograma: { publicacion: null, manifestacion: null, sorteo: null, cierre: null, adjudicacion: null },
    semaforo: 'verde', semaforo_motivos: [], semaforo_version: 'v1.0',
    semaforo_calculado_en: AHORA, override_manual: null,
    estado: 'en_evaluacion', motivo_descarte: null,
    oferta_neg: null, oferta_ganador: null, ganador: null,
    manifestaciones: null, ofertas_recibidas: null,
    migrado: false, capacidad_manual: null,
    responsable_uid: 'u', creado_por: 'u', creado_en: AHORA,
    actualizado_por: 'u', actualizado_en: AHORA, activa: true,
    ...extra,
  } as LicitacionConId
}

const conCierre = (dias: number, extra?: Partial<Licitacion> & { id?: string }) =>
  lic({ ...extra, cronograma: { publicacion: null, manifestacion: null, sorteo: null, cierre: ts(dias * 86_400_000), adjudicacion: null } })

describe('seccionDe', () => {
  it('cada estado cae en exactamente una sección', () => {
    for (const e of ESTADOS_LICITACION) {
      const s = seccionDe({ estado: e })
      expect(SECCIONES_BANDEJA, e).toContain(s)
    }
  })

  it('descartada tiene sección propia — no es "cerrada"', () => {
    // Se reabre, y su motivo es lo que se quiere poder filtrar.
    expect(seccionDe({ estado: 'descartada' })).toBe('descartadas')
  })

  it('los cinco terminales duros son cerradas', () => {
    for (const e of ['adjudicada', 'perdida', 'rechazada', 'revocada', 'desierta'] as EstadoLicitacion[]) {
      expect(seccionDe({ estado: e }), e).toBe('cerradas')
    }
  })

  it('lo que está en juego es activa', () => {
    for (const e of ESTADOS_ACTIVOS_BANDEJA) {
      expect(seccionDe({ estado: e }), e).toBe('activas')
    }
  })
})

describe('compitePorCupo', () => {
  it('verde y amarillo compiten', () => {
    for (const s of ['verde', 'amarillo'] as Semaforo[]) {
      expect(compitePorCupo({ semaforo: s, override_manual: null }), s).toBe(true)
    }
  })

  it('rojo NO compite: el portero no lo deja avanzar', () => {
    expect(compitePorCupo({ semaforo: 'rojo', override_manual: null })).toBe(false)
  })

  it('rojo CON override sí compite — ya nadie lo está frenando', () => {
    expect(compitePorCupo({
      semaforo: 'rojo',
      override_manual: { por: 'u', en: AHORA, motivo: 'vale la pena', semaforo_anterior: 'rojo' },
    })).toBe(true)
  })
})

describe('ordenarPorCierre', () => {
  it('lo que vence primero va primero', () => {
    const a = conCierre(30), b = conCierre(10), c = conCierre(20)
    expect([a, b, c].sort(ordenarPorCierre).map(x => x.id)).toEqual([b.id, c.id, a.id])
  })

  it('sin fecha de cierre va al FINAL — no se prioriza lo que no tiene reloj', () => {
    const sinFecha = lic()
    const con = conCierre(50)
    expect([sinFecha, con].sort(ordenarPorCierre)[0].id).toBe(con.id)
  })

  it('el orden es estable entre iguales (desempata por número de proceso)', () => {
    const a = conCierre(10, { id: 'a' })
    const b = conCierre(10, { id: 'b' })
    const uno = [a, b].sort(ordenarPorCierre).map(x => x.id)
    const dos = [b, a].sort(ordenarPorCierre).map(x => x.id)
    expect(uno).toEqual(dos)
  })
})

describe('repartirPorCapacidad', () => {
  it('el default documentado es 5', () => {
    expect(CAPACIDAD_SEMANAL_DEFAULT).toBe(5)
  })

  it('llena los cupos por fecha de cierre y el resto queda FUERA, no oculto', () => {
    const ls = [conCierre(50), conCierre(10), conCierre(20), conCierre(30)]
    const r = repartirPorCapacidad(ls, 2)
    expect(r.dentro).toHaveLength(2)
    expect(r.fuera).toHaveLength(2)
    // Nada se pierde: dentro + fuera + frenadas = todo lo que entró.
    expect(r.dentro.length + r.fuera.length + r.frenadas.length).toBe(ls.length)
    expect(r.dentro.map(x => x.cronograma.cierre?.toMillis?.()))
      .toEqual([10, 20].map(d => d * 86_400_000))
  })

  it('las rojas sin override no ocupan cupo: van a `frenadas`', () => {
    const roja = conCierre(1, { semaforo: 'rojo', semaforo_motivos: ['MODALIDAD_SIN_HISTORIAL'] })
    const verde = conCierre(40)
    const r = repartirPorCapacidad([roja, verde], 1)
    expect(r.frenadas.map(x => x.id)).toEqual([roja.id])
    expect(r.dentro.map(x => x.id)).toEqual([verde.id])
  })

  it('una fijada a mano ENTRA aunque cierre más tarde', () => {
    const tardia = conCierre(90, {
      capacidad_manual: { en_capacidad: true, por: 'u', en: AHORA, motivo: 'x', intercambio_con: null },
    })
    const temprana = conCierre(5)
    const r = repartirPorCapacidad([temprana, tardia], 1)
    expect(r.dentro.map(x => x.id)).toContain(tardia.id)
    expect(r.fuera.map(x => x.id)).toContain(temprana.id)
  })

  it('una bajada a mano queda FUERA aunque cierre mañana', () => {
    const bajada = conCierre(1, {
      capacidad_manual: { en_capacidad: false, por: 'u', en: AHORA, motivo: 'x', intercambio_con: null },
    })
    const otra = conCierre(40)
    const r = repartirPorCapacidad([bajada, otra], 5)
    expect(r.fuera.map(x => x.id)).toContain(bajada.id)
    expect(r.dentro.map(x => x.id)).toContain(otra.id)
  })

  it('CLAVE: si las fijadas superan el tope, NO se recorta la decisión humana', () => {
    // Se muestra que se pasaron (la UI lo dice); recortar en silencio una
    // decisión explícita sería peor que mostrar el exceso.
    const fijar = (d: number) => conCierre(d, {
      capacidad_manual: { en_capacidad: true, por: 'u', en: AHORA, motivo: 'x', intercambio_con: null },
    })
    const r = repartirPorCapacidad([fijar(1), fijar(2), fijar(3)], 2)
    expect(r.dentro).toHaveLength(3)
    expect(r.capacidad).toBe(2)
  })

  it('capacidad 0 deja todo fuera, sin romperse', () => {
    const r = repartirPorCapacidad([conCierre(1), conCierre(2)], 0)
    expect(r.dentro).toHaveLength(0)
    expect(r.fuera).toHaveLength(2)
  })

  it('capacidad negativa se trata como 0', () => {
    expect(repartirPorCapacidad([conCierre(1)], -3).capacidad).toBe(0)
  })
})

describe('planIntercambioCupo', () => {
  const entra = () => conCierre(5, { id: 'entra' })
  const sale = () => conCierre(1, { id: 'sale' })

  it('arma los DOS patches y se apuntan mutuamente', () => {
    const p = planIntercambioCupo(entra(), sale(), ACTOR, AHORA, 'cierra antes y el pliego ya está leído')
    expect(p).not.toBeNull()
    const cmEntra = p!.entra.patch.capacidad_manual as Record<string, unknown>
    const cmSale = p!.sale.patch.capacidad_manual as Record<string, unknown>
    expect(cmEntra.en_capacidad).toBe(true)
    expect(cmSale.en_capacidad).toBe(false)
    expect(cmEntra.intercambio_con).toBe('sale')
    expect(cmSale.intercambio_con).toBe('entra')
  })

  it('el motivo queda escrito en los dos lados, recortado', () => {
    const p = planIntercambioCupo(entra(), sale(), ACTOR, AHORA, '  urgente  ')
    expect((p!.entra.patch.capacidad_manual as { motivo: string }).motivo).toBe('urgente')
    expect((p!.sale.patch.capacidad_manual as { motivo: string }).motivo).toBe('urgente')
  })

  it('RECHAZO: sin motivo no hay intercambio', () => {
    expect(planIntercambioCupo(entra(), sale(), ACTOR, AHORA, '')).toBeNull()
    expect(planIntercambioCupo(entra(), sale(), ACTOR, AHORA, '   ')).toBeNull()
  })

  it('RECHAZO: sin actor', () => {
    expect(planIntercambioCupo(entra(), sale(), { uid: '' }, AHORA, 'x')).toBeNull()
  })

  it('RECHAZO: intercambiar una consigo misma', () => {
    const a = entra()
    expect(planIntercambioCupo(a, a, ACTOR, AHORA, 'x')).toBeNull()
  })

  it('RECHAZO: alguna de las dos no está activa', () => {
    const cerrada = conCierre(1, { id: 'cerrada', estado: 'adjudicada', activa: false })
    expect(planIntercambioCupo(entra(), cerrada, ACTOR, AHORA, 'x')).toBeNull()
    expect(planIntercambioCupo(cerrada, sale(), ACTOR, AHORA, 'x')).toBeNull()
  })

  it('RECHAZO: sacar una que el semáforo ya frena no libera cupo', () => {
    const roja = conCierre(1, { id: 'roja', semaforo: 'rojo' })
    expect(planIntercambioCupo(entra(), roja, ACTOR, AHORA, 'x')).toBeNull()
  })

  it('el intercambio SE REFLEJA en el reparto siguiente', () => {
    const e = entra(), s = sale()
    const p = planIntercambioCupo(e, s, ACTOR, AHORA, 'motivo')!
    const despues = [
      { ...e, ...p.entra.patch } as LicitacionConId,
      { ...s, ...p.sale.patch } as LicitacionConId,
    ]
    const r = repartirPorCapacidad(despues, 1)
    expect(r.dentro.map(x => x.id)).toEqual(['entra'])
    expect(r.fuera.map(x => x.id)).toEqual(['sale'])
  })
})

describe('patchLiberarCupo', () => {
  it('vuelve al orden por fecha de cierre', () => {
    const p = patchLiberarCupo(ACTOR, AHORA)
    expect(p!.capacidad_manual).toBeNull()
    expect(p!.actualizado_por).toBe('uid-karen')
  })

  it('RECHAZO: sin actor', () => {
    expect(patchLiberarCupo({ uid: '' }, AHORA)).toBeNull()
  })
})

describe('coincideBusqueda / contarSecciones', () => {
  it('busca por número, objeto, entidad y consecutivo', () => {
    const l = lic({
      numero_proceso: 'MC-DNP-004-2026', objeto: 'Mantenimiento locativo',
      consecutivo: 'LIC-2026-0007',
      entidad: { nombre: 'Planeación Nacional', nit: '', orden: '', departamento: '', ciudad: 'Bogotá' },
    })
    for (const q of ['dnp', 'locativo', 'planeación', 'LIC-2026', 'bogotá']) {
      expect(coincideBusqueda(l, q), q).toBe(true)
    }
    expect(coincideBusqueda(l, 'armada')).toBe(false)
  })

  it('la búsqueda vacía no filtra', () => {
    expect(coincideBusqueda(lic(), '   ')).toBe(true)
  })

  it('los conteos cubren las tres secciones', () => {
    const c = contarSecciones([
      lic({ estado: 'en_evaluacion' }),
      lic({ estado: 'descartada', motivo_descarte: 'SORTEO', activa: false }),
      lic({ estado: 'perdida', activa: false }),
      lic({ estado: 'adjudicada', activa: false }),
    ])
    expect(c).toEqual({ activas: 1, descartadas: 1, cerradas: 2 })
  })
})

describe('SEMAFORO_CHIP — manual de marca', () => {
  it('cubre los tres estados y no usa azul', () => {
    const clases = Object.values(SEMAFORO_CHIP).join(' ')
    expect(Object.keys(SEMAFORO_CHIP).sort()).toEqual(['amarillo', 'rojo', 'verde'])
    expect(clases).not.toMatch(/blue|indigo|sky|cyan/)
  })
})
