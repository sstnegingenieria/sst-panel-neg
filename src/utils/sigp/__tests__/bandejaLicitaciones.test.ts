import { describe, it, expect } from 'vitest'
import type { Timestamp } from 'firebase/firestore'
import {
  SECCIONES_BANDEJA, CAPACIDAD_SEMANAL_DEFAULT,
  seccionDe, compitePorCupo, ordenarPorCierre, repartirPorCapacidad,
  planIntercambioCupo, patchLiberarCupo, coincideBusqueda, contarSecciones,
  ESTADOS_ACTIVOS_BANDEJA, SEMAFORO_CHIP, SENAL_CHIP,
  repartirRadar, porQueNoAlcanza, manifestacionCerrada, sinFechaEnElOrigen,
  nacioVencida, vencioEsperando, capacidadSemanal,
  avisoAlFilo, faltaFechaManifestacion,
} from '../bandejaLicitaciones'
import type { LicitacionConId } from '../bandejaLicitaciones'
import { ESTADOS_LICITACION, SENAL_LABEL } from '../../../types/sigp/licitacion'
import type {
  EstadoLicitacion, Licitacion, OrigenFecha, SenalClasificacion, Semaforo,
} from '../../../types/sigp/licitacion'

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
    radar: null,
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

  it('la PROCEDENCIA decide: una detectada del radar va a su propia sección', () => {
    const delRadar = {
      estado: 'detectada' as EstadoLicitacion,
      radar: {
        senal: 'texto_coincide' as const, terminos: ['redes'],
        vocabulario_version: 'v1.0', corrida: 'corr-1', fase: null, fases_previas: [], portafolio: null, origen_fecha: 'publicacion' as const,
      },
    }
    expect(seccionDe(delRadar)).toBe('radar')
  })

  it('una detectada TECLEADA A MANO se queda en activas: alguien la escribió a propósito', () => {
    expect(seccionDe({ estado: 'detectada', radar: null })).toBe('activas')
  })

  it('un HISTÓRICO sin el campo `radar` NO se va al radar (llega undefined)', () => {
    // Los ~350 del registro de Karen se escribieron antes de que el campo
    // existiera. Con `!== null` en `esDelRadar` darían true y aterrizarían en
    // la sección del radar, que es exactamente al revés.
    expect(seccionDe({ estado: 'detectada' })).toBe('activas')
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
  it('una fila del RADAR ya no empuja fuera del cupo a una licitación real', () => {
    // EL DAÑO MEDIDO, reproducido: `repartirPorCapacidad` recibe las activas, y
    // las filas del radar nacen con `capacidad_manual: null`, así que entraban a
    // `libres`, se ordenaban por cierre y con el cupo lleno desplazaban trabajo
    // real. Aquí la del radar cierra ANTES, que es el caso que hacía daño.
    const real = conCierre(10, { id: 'real' })
    const traida = conCierre(1, {
      id: 'del_radar',
      estado: 'detectada',
      radar: { senal: 'texto_coincide', terminos: ['redes'], vocabulario_version: 'v1.0', corrida: 'c1', fase: null, fases_previas: [], portafolio: null, origen_fecha: 'publicacion' },
    })

    // Lo que hace la página: filtrar por sección y repartir SOLO las activas.
    const todas = [real, traida]
    const activas = todas.filter(l => seccionDe(l) === 'activas')
    const r = repartirPorCapacidad(activas, 1)

    expect(seccionDe(traida)).toBe('radar')
    expect(activas.map(l => l.id)).toEqual(['real'])
    expect(r.dentro.map(l => l.id)).toEqual(['real'])
    expect(r.fuera).toHaveLength(0)

    // Y la prueba de que el cupo era el problema: con la del radar DENTRO de
    // las activas —el comportamiento viejo— la real se habría ido fuera.
    const viejo = repartirPorCapacidad(todas, 1)
    expect(viejo.dentro.map(l => l.id)).toEqual(['del_radar'])
    expect(viejo.fuera.map(l => l.id)).toEqual(['real'])
  })

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

  it('los conteos cubren las CUATRO secciones', () => {
    const c = contarSecciones([
      lic({ estado: 'en_evaluacion' }),
      lic({
        estado: 'detectada',
        radar: { senal: 'texto_coincide', terminos: ['redes'], vocabulario_version: 'v1.0', corrida: 'c1', fase: null, fases_previas: [], portafolio: null, origen_fecha: 'publicacion' },
      }),
      lic({ estado: 'descartada', motivo_descarte: 'SORTEO', activa: false }),
      lic({ estado: 'perdida', activa: false }),
      lic({ estado: 'adjudicada', activa: false }),
    ])
    expect(c).toEqual({ radar: 1, activas: 1, descartadas: 1, cerradas: 2 })
  })
})

describe('SEMAFORO_CHIP — manual de marca', () => {
  it('cubre los tres estados y no usa azul', () => {
    const clases = Object.values(SEMAFORO_CHIP).join(' ')
    expect(Object.keys(SEMAFORO_CHIP).sort()).toEqual(['amarillo', 'rojo', 'verde'])
    expect(clases).not.toMatch(/blue|indigo|sky|cyan/)
  })
})

// ── Sub-bloque 4: la cola del radar ────────────────────────────────────────

const delRadar = (
  origen_fecha: OrigenFecha, dias: number | null, extra?: Partial<Licitacion> & { id?: string },
) => {
  const radar = {
    senal: 'texto_coincide' as const, terminos: ['redes'],
    vocabulario_version: 'v1.0', corrida: 'c1', fase: null, fases_previas: [], portafolio: null, origen_fecha,
  }
  return dias === null
    ? lic({ ...extra, estado: 'detectada', radar })
    : conCierre(dias, { ...extra, estado: 'detectada', radar })
}

const conCierreIso = (iso: string, extra?: Partial<Licitacion> & { id?: string }) => {
  const d = new Date(`${iso}T12:00:00`)
  return lic({
    ...extra,
    estado: 'detectada',
    radar: extra?.radar ?? {
      senal: 'texto_coincide', terminos: ['redes'],
      vocabulario_version: 'v1.0', corrida: 'c1', fase: null, fases_previas: [], portafolio: null, origen_fecha: 'publicacion',
    },
    cronograma: {
      publicacion: null, manifestacion: null, sorteo: null, adjudicacion: null,
      cierre: { toMillis: () => d.getTime(), toDate: () => d } as unknown as Timestamp,
    },
  })
}

describe('sinFechaEnElOrigen', () => {
  it('es true solo cuando el origen no dio ninguna fecha', () => {
    expect(sinFechaEnElOrigen(delRadar('ninguna', null))).toBe(true)
    expect(sinFechaEnElOrigen(delRadar('publicacion', 3))).toBe(false)
    expect(sinFechaEnElOrigen(delRadar('recepcion_de_ofertas', 3))).toBe(false)
  })

  it('lo tecleado a mano no tiene origen de fecha: false, no "sin fecha"', () => {
    expect(sinFechaEnElOrigen(lic({ radar: null }))).toBe(false)
  })

  it('un histórico sin el campo tampoco: la ausencia no es "ninguna"', () => {
    const historico = lic()
    delete (historico as { radar?: unknown }).radar
    expect(sinFechaEnElOrigen(historico)).toBe(false)
  })
})

const HOY = '2026-11-12'
const HU = 4   // horas útiles al día, el valor real de `configuracion/licitaciones`

/** Una del radar con su fase y su historia de fases. */
const conFase = (
  iso: string, mod: 'minima_cuantia' | 'menor_cuantia',
  fase: string | null, previas: string[], extra?: Partial<Licitacion> & { id?: string },
) => conCierreIso(iso, {
  ...extra,
  modalidad: mod,
  radar: {
    senal: 'texto_coincide', terminos: ['redes'], vocabulario_version: 'v1.0',
    corrida: 'c1', fase, fases_previas: previas, portafolio: 'CO1.BDOS.1',
    origen_fecha: 'publicacion',
  },
})

describe('manifestacionCerrada', () => {
  it('menor cuantía en fase de oferta que PASÓ por manifestación: cerró', () => {
    expect(manifestacionCerrada(conFase('2026-11-20', 'menor_cuantia',
      'Presentación de oferta', ['Manifestación de interés (Menor Cuantía)']))).toBe(true)
  })

  it('TODAVÍA en manifestación: la puerta sigue abierta', () => {
    expect(manifestacionCerrada(conFase('2026-11-20', 'menor_cuantia',
      'Manifestación de interés (Menor Cuantía)', []))).toBe(false)
  })

  it('EL CASO QUE EXIGE `fases_previas`: menor cuantía SIN manifestación', () => {
    // `Seleccion Abreviada Menor Cuantia Sin Manifestacion Interes` también
    // mapea a `menor_cuantia` (4.817 procesos). Mirar solo la modalidad
    // marcaría mal a todos esos.
    expect(manifestacionCerrada(conFase('2026-11-20', 'menor_cuantia',
      'Presentación de oferta', []))).toBe(false)
  })

  it('una mínima cuantía está siempre en fase de oferta y nunca tuvo puerta', () => {
    expect(manifestacionCerrada(conFase('2026-11-20', 'minima_cuantia',
      'Presentación de oferta', []))).toBe(false)
  })

  it('un documento viejo sin `fases_previas` no rompe ni marca de más', () => {
    const vieja = conFase('2026-11-20', 'menor_cuantia', 'Presentación de oferta', [])
    delete (vieja.radar as unknown as Record<string, unknown>).fases_previas
    expect(manifestacionCerrada(vieja)).toBe(false)
  })

  it('lo tecleado a mano no tiene fase', () => {
    expect(manifestacionCerrada(lic({ radar: null }))).toBe(false)
  })
})

describe('porQueNoAlcanza', () => {
  it('el plazo pasado gana sobre todo lo demás', () => {
    const l = conFase('2026-11-10', 'menor_cuantia',
      'Presentación de oferta', ['Manifestación de interés (Menor Cuantía)'])
    expect(porQueNoAlcanza(l, HOY, HU)?.motivo).toBe('plazo_vencido')
  })

  it('la manifestación cerrada se dice aunque el plazo siga abierto', () => {
    // Es el caso que motiva todo el bloque: la fecha de cierre muestra días
    // por delante y el proceso ya es inalcanzable.
    const l = conFase('2026-11-30', 'menor_cuantia',
      'Presentación de oferta', ['Manifestación de interés (Menor Cuantía)'])
    const r = porQueNoAlcanza(l, HOY, HU)
    expect(r?.motivo).toBe('manifestacion_cerrada')
    expect(r?.frase).toMatch(/aunque el plazo siga abierto/)
  })

  it('cierra HOY: no está vencida y no da tiempo', () => {
    // Medido sobre la cola real: 5 de 23 estaban así. No son vencidas —la
    // distinción del día civil— y son igual de intrabajables.
    const r = porQueNoAlcanza(conFase(HOY, 'minima_cuantia', 'Presentación de oferta', []), HOY, HU)
    expect(r?.motivo).toBe('ventana_insuficiente')
    expect(r?.frase).toBe('Cierra hoy: no da tiempo de armarla')
  })

  it('con tiempo de sobra devuelve null', () => {
    expect(porQueNoAlcanza(conFase('2026-11-30', 'minima_cuantia', 'Presentación de oferta', []), HOY, HU))
      .toBeNull()
  })

  it('EL UMBRAL NO SE INVENTA: sale de evaluarVentana y de las horas por modalidad', () => {
    // Con 4 horas útiles al día, una mínima (4 h) necesita 1 día hábil y una
    // menor (6 h) necesita 2. Mañana (13-nov, viernes) es 1 día hábil.
    const manana = '2026-11-13'
    expect(porQueNoAlcanza(conFase(manana, 'minima_cuantia', null, []), HOY, HU)).toBeNull()
    expect(porQueNoAlcanza(conFase(manana, 'menor_cuantia', null, []), HOY, HU)?.motivo)
      .toBe('ventana_insuficiente')
  })
})

describe('repartirRadar', () => {
  it('reparte en los tres grupos y en ese orden', () => {
    const sinFecha = delRadar('ninguna', null, { id: 'sin-fecha' })
    const vigente = conFase('2026-11-30', 'minima_cuantia', null, [], { id: 'vigente' })
    const muerta = conFase('2026-11-05', 'minima_cuantia', null, [], { id: 'muerta' })
    const r = repartirRadar([muerta, vigente, sinFecha], HOY, HU)
    expect(r.sinFecha.map(l => l.id)).toEqual(['sin-fecha'])
    expect(r.vigentes.map(l => l.id)).toEqual(['vigente'])
    expect(r.noAlcanza.map(x => x.l.id)).toEqual(['muerta'])
  })

  it('EL REPARTO MEDIDO: 2 vencidas + 5 que cierran hoy = 7 abajo', () => {
    // La forma exacta de la cola real del 12-nov-2026.
    const docs = [
      ...Array.from({ length: 2 }, (_, i) => conFase('2026-11-10', 'minima_cuantia', null, [], { id: `venc-${i}` })),
      ...Array.from({ length: 5 }, (_, i) => conFase(HOY, 'minima_cuantia', null, [], { id: `hoy-${i}` })),
      ...Array.from({ length: 16 }, (_, i) => conFase('2026-11-24', 'minima_cuantia', null, [], { id: `viva-${i}` })),
    ]
    const r = repartirRadar(docs, HOY, HU)
    expect(r.noAlcanza).toHaveLength(7)
    expect(r.vigentes).toHaveLength(16)
    const motivos = r.noAlcanza.map(x => x.porque.motivo)
    expect(motivos.filter(m => m === 'plazo_vencido')).toHaveLength(2)
    expect(motivos.filter(m => m === 'ventana_insuficiente')).toHaveLength(5)
  })

  it('las SIN FECHA van arriba y jamás caen abajo', () => {
    const rara = conCierreIso('2026-01-01', {
      id: 'rara',
      radar: {
        senal: 'texto_coincide' as const, terminos: ['redes'], vocabulario_version: 'v1.0',
        corrida: 'c1', fase: null, fases_previas: [], portafolio: null,
        origen_fecha: 'ninguna' as const,
      },
    })
    const r = repartirRadar([rara], HOY, HU)
    expect(r.sinFecha.map(l => l.id)).toEqual(['rara'])
    expect(r.noAlcanza).toHaveLength(0)
  })

  it('con la lista vacía devuelve los tres grupos vacíos, no undefined', () => {
    expect(repartirRadar([], HOY, HU)).toEqual({ sinFecha: [], vigentes: [], noAlcanza: [] })
  })
})

describe('avisoAlFilo', () => {
  it('EL CASO MEDIDO: cierra mañana, 1 hábil y hace falta 1', () => {
    // Las cuatro mínimas de la cola real. Caben — exactamente. Se quedan
    // arriba, trabajables, y la fila dice en qué se mete quien la tome.
    const a = avisoAlFilo(conFase('2026-11-13', 'minima_cuantia', null, []), HOY, HU)
    expect(a).toMatch(/al filo/i)
    expect(a).toMatch(/habría que armarla hoy/)
  })

  it('con margen de sobra no avisa nada', () => {
    expect(avisoAlFilo(conFase('2026-11-30', 'minima_cuantia', null, []), HOY, HU)).toBeNull()
  })

  it('lo que YA no alcanza no es "al filo": tiene su propio grupo', () => {
    expect(avisoAlFilo(conFase('2026-11-10', 'minima_cuantia', null, []), HOY, HU)).toBeNull()
    expect(avisoAlFilo(conFase(HOY, 'minima_cuantia', null, []), HOY, HU)).toBeNull()
  })

  it('una menor cuantía al filo necesita DOS hábiles, no uno', () => {
    // 6 h de armado contra 4 h útiles al día. El umbral sale de la modalidad.
    expect(avisoAlFilo(conFase('2026-11-16', 'menor_cuantia', null, []), HOY, HU))
      .toMatch(/2 días hábiles y hacen falta 2/)
  })
})

describe('faltaFechaManifestacion', () => {
  it('pasó por manifestación y nadie anotó la fecha', () => {
    expect(faltaFechaManifestacion(conFase('2026-11-30', 'menor_cuantia',
      'Presentación de oferta', ['Manifestación de interés (Menor Cuantía)']))).toBe(true)
  })

  it('está EN manifestación y tampoco la tiene: también falta', () => {
    expect(faltaFechaManifestacion(conFase('2026-11-30', 'menor_cuantia',
      'Manifestación de interés (Menor Cuantía)', []))).toBe(true)
  })

  it('con la fecha anotada ya no falta', () => {
    const l = conFase('2026-11-30', 'menor_cuantia',
      'Manifestación de interés (Menor Cuantía)', [])
    const d = new Date('2026-11-20T12:00:00')
    l.cronograma = {
      ...l.cronograma,
      manifestacion: { toMillis: () => d.getTime(), toDate: () => d } as unknown as Timestamp,
    }
    expect(faltaFechaManifestacion(l)).toBe(false)
  })

  it('un proceso que nunca tuvo manifestación no la echa de menos', () => {
    expect(faltaFechaManifestacion(conFase('2026-11-30', 'minima_cuantia',
      'Presentación de oferta', []))).toBe(false)
    expect(faltaFechaManifestacion(lic({ radar: null }))).toBe(false)
  })
})

describe('la medición de capacidad', () => {
  const nacida = (cierre: string, nacio: string, id: string) => {
    const d = new Date(`${nacio}T12:00:00`)
    return conCierreIso(cierre, {
      id,
      creado_en: { toMillis: () => d.getTime(), toDate: () => d } as unknown as Timestamp,
    })
  }

  it('distingue la que nació muerta de la que murió esperando', () => {
    const ruido = nacida('2026-11-08', '2026-11-10', 'nacio-muerta')
    const perdida = nacida('2026-11-10', '2026-11-05', 'murio-esperando')
    expect(nacioVencida(ruido)).toBe(true)
    expect(vencioEsperando(ruido, HOY)).toBe(false)
    expect(nacioVencida(perdida)).toBe(false)
    expect(vencioEsperando(perdida, HOY)).toBe(true)
  })

  it('una que sigue viva no cuenta de ninguna de las dos formas', () => {
    const viva = nacida('2026-11-30', '2026-11-05', 'viva')
    expect(vencioEsperando(viva, HOY)).toBe(false)
    expect(nacioVencida(viva)).toBe(false)
  })

  it('cuenta las dos cosas por separado en la ventana', () => {
    const r = capacidadSemanal([
      nacida('2026-11-10', '2026-11-05', 'a'),
      nacida('2026-11-11', '2026-11-04', 'b'),
      nacida('2026-11-09', '2026-11-10', 'ruido'),
      nacida('2026-11-30', '2026-11-05', 'viva'),
    ], HOY, 7)
    expect(r.vencidas_esperando).toBe(2)
    expect(r.nacieron_vencidas).toBe(1)
    expect(r.dias).toBe(7)
  })

  it('lo que murió ANTES de la ventana no cuenta', () => {
    const r = capacidadSemanal([nacida('2026-10-01', '2026-09-01', 'vieja')], HOY, 7)
    expect(r.vencidas_esperando).toBe(0)
  })

  it('HOY la cifra es 0, y eso NO prueba nada todavía', () => {
    // La colección tiene un día: nada ha tenido tiempo de esperar. El 0 es la
    // ausencia de historia, no la ausencia del problema. Por eso la cifra se
    // DERIVA — dentro de una semana dice algo, y se puede mirar hacia atrás.
    const recién = [
      nacida('2026-11-10', '2026-11-12', 'x'),
      nacida('2026-11-11', '2026-11-12', 'y'),
    ]
    const r = capacidadSemanal(recién, HOY, 7)
    expect(r.vencidas_esperando).toBe(0)
    expect(r.nacieron_vencidas).toBe(2)
  })
})

describe('SENAL_CHIP — manual de marca', () => {
  it('cubre todas las señales que el tipo admite y no usa azul', () => {
    const senales = Object.keys(SENAL_LABEL) as SenalClasificacion[]
    for (const s of senales) expect(SENAL_CHIP[s], s).toBeTruthy()
    expect(Object.values(SENAL_CHIP).join(' ')).not.toMatch(/blue|indigo|sky|cyan/)
  })

  it('la señal que entró por evidencia con el texto en silencio se distingue', () => {
    // No es un detalle estético: es la fila donde `RUIDO_LEXICO` no aplica.
    expect(SENAL_CHIP.codigo_en_clase_sin_texto)
      .not.toBe(SENAL_CHIP.codigo_en_clase_con_texto)
  })
})
