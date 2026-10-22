/**
 * Las CUATRO INVARIANTES de `requisito.ts`, cada una con su caso de rechazo,
 * y el caso de regresión con nombre propio: COPNIA.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Timestamp } from 'firebase/firestore'
import {
  CATEGORIAS_REQUISITO, TIPOS_EVIDENCIA, ESTADOS_REQUISITO, INDICADORES_RUP,
  CATEGORIA_REQUISITO_LABEL, ESTADO_REQUISITO_LABEL, INDICADOR_RUP_LABEL,
  REF_PERSONA_TIPOS, REF_PERSONA_TIPO_LABEL,
  veredictoFirmado, personalAcreditado, indicadorMedido, requisitoConsistente,
  clonarRequisitosComoPlantilla,
  puedeMarcarseRequisito, patchMarcarRequisito,
} from '../requisito'
import type { Requisito, EstadoRequisito } from '../requisito'
import { puedePresentar, resumenCumplimiento } from '../../../utils/sigp/cumplimiento'

const ts = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) } as unknown as Timestamp)
const AHORA = ts(2_000_000)
const ANTES = ts(1_000_000)
const ACTOR = { uid: 'uid-karen' }

const req = (extra?: Partial<Requisito>): Requisito => ({
  categoria: 'juridico',
  descripcion: 'Certificado de existencia y representación legal con vigencia no mayor a 30 días',
  fuente_pliego: '3.2.1',
  tipo_evidencia: 'documento_empresa',
  documento_empresa_id: 'doc-camara',
  persona: null,
  indicador: null,
  operador: null,
  valor_exigido: null,
  valor_neg: null,
  estado: 'pendiente',
  verificado_por: null,
  verificado_en: null,
  observacion: '',
  creado_por: 'uid-karen',
  creado_en: ANTES,
  actualizado_por: 'uid-karen',
  actualizado_en: ANTES,
  ...extra,
})

/** Requisito de personal, la categoría de la pérdida de 2026. */
const reqPersonal = (extra?: Partial<Requisito>): Requisito => req({
  categoria: 'personal',
  descripcion: 'Ingeniero residente con matrícula profesional vigente',
  tipo_evidencia: 'documento_personal',
  documento_empresa_id: null,
  ...extra,
})

const reqIndicador = (extra?: Partial<Requisito>): Requisito => req({
  categoria: 'financiero',
  descripcion: 'Índice de liquidez mayor o igual a 2,0',
  tipo_evidencia: 'indicador',
  documento_empresa_id: null,
  indicador: 'liquidez',
  operador: 'gte',
  valor_exigido: 2,
  ...extra,
})

// ═════════════════════════════════════════════════════════════════════════════
// Vocabularios
// ═════════════════════════════════════════════════════════════════════════════

describe('vocabularios', () => {
  it('cada categoría, estado e indicador tiene label', () => {
    for (const c of CATEGORIAS_REQUISITO) expect(CATEGORIA_REQUISITO_LABEL[c], c).toBeTruthy()
    for (const e of ESTADOS_REQUISITO) expect(ESTADO_REQUISITO_LABEL[e], e).toBeTruthy()
    for (const i of INDICADORES_RUP) expect(INDICADOR_RUP_LABEL[i], i).toBeTruthy()
  })

  it('los seis indicadores del RUP y los cinco tipos de evidencia', () => {
    expect(INDICADORES_RUP).toHaveLength(6)
    expect(TIPOS_EVIDENCIA).toHaveLength(5)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANTE 1 — nunca se hereda estado
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANTE 1 — la plantilla NO hereda estado', () => {
  const origen: Requisito[] = [
    req({
      estado: 'cumple', verificado_por: 'uid-pedro', verificado_en: ANTES,
      observacion: 'Verificado contra el certificado de agosto',
    }),
    reqIndicador({
      estado: 'cumple', valor_neg: 3.4, verificado_por: 'uid-pedro', verificado_en: ANTES,
    }),
    reqPersonal({
      estado: 'cumple', verificado_por: 'uid-pedro', verificado_en: ANTES,
      persona: { nombre: 'Luis Peña', cargo: 'Residente', ref_tipo: 'empleado_directo', ref_id: 'emp-7' },
    }),
  ]

  it('la ESTRUCTURA de la exigencia viaja completa', () => {
    const clon = clonarRequisitosComoPlantilla(origen, ACTOR, AHORA)
    expect(clon).toHaveLength(3)
    expect(clon[0].categoria).toBe('juridico')
    expect(clon[0].descripcion).toBe(origen[0].descripcion)
    expect(clon[1].tipo_evidencia).toBe('indicador')
    expect(clon[1].indicador).toBe('liquidez')
    expect(clon[1].operador).toBe('gte')
    expect(clon[1].valor_exigido).toBe(2)
  })

  it('CLAVE: TODOS los estados quedan en pendiente', () => {
    const clon = clonarRequisitosComoPlantilla(origen, ACTOR, AHORA)
    for (const c of clon) expect(c.estado).toBe('pendiente')
  })

  it('CLAVE: la firma se BORRA — verificado_por y verificado_en en null', () => {
    const clon = clonarRequisitosComoPlantilla(origen, ACTOR, AHORA)
    for (const c of clon) {
      expect(c.verificado_por).toBeNull()
      expect(c.verificado_en).toBeNull()
    }
  })

  it('tampoco viaja la EVIDENCIA: persona, documento, valor medido ni observación', () => {
    const clon = clonarRequisitosComoPlantilla(origen, ACTOR, AHORA)
    for (const c of clon) {
      expect(c.persona).toBeNull()
      expect(c.documento_empresa_id).toBeNull()
      expect(c.valor_neg).toBeNull()
      expect(c.observacion).toBe('')
    }
  })

  it('el numeral del pliego NO viaja: es de OTRO pliego', () => {
    // Conservarlo haría que una trazabilidad apunte al documento equivocado,
    // que es peor que no tener trazabilidad.
    const clon = clonarRequisitosComoPlantilla(origen, ACTOR, AHORA)
    for (const c of clon) expect(c.fuente_pliego).toBeNull()
  })

  it('la auditoría es del clon, no del original', () => {
    const clon = clonarRequisitosComoPlantilla(origen, ACTOR, AHORA)
    for (const c of clon) {
      expect(c.creado_por).toBe('uid-karen')
      expect(c.creado_en).toBe(AHORA)
      expect(c.actualizado_en).toBe(AHORA)
    }
  })

  it('RECHAZO estructural: ningún clon es consistente con un estado heredado', () => {
    // Si alguien "arreglara" el clon copiando el estado sin la firma, la
    // invariante 2 lo atraparía.
    const clon = clonarRequisitosComoPlantilla(origen, ACTOR, AHORA)
    const trucado = { ...clon[0], estado: 'cumple' as EstadoRequisito }
    expect(requisitoConsistente(trucado)).toBe(false)
  })

  it('no muta el origen', () => {
    clonarRequisitosComoPlantilla(origen, ACTOR, AHORA)
    expect(origen[0].estado).toBe('cumple')
    expect(origen[2].persona).not.toBeNull()
  })

  it('clonar una lista vacía da una lista vacía, sin lanzar', () => {
    expect(clonarRequisitosComoPlantilla([], ACTOR, AHORA)).toEqual([])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANTE 2 — un veredicto exige firma
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANTE 2 — estado !== pendiente ⟹ firmado', () => {
  it('pendiente no necesita firma', () => {
    expect(veredictoFirmado(req({ estado: 'pendiente' }))).toBe(true)
  })

  it('los tres veredictos CON firma pasan', () => {
    for (const e of ['cumple', 'no_cumple', 'no_aplica'] as const) {
      expect(veredictoFirmado({ estado: e, verificado_por: 'uid-pedro', verificado_en: AHORA }), e)
        .toBe(true)
    }
  })

  it('RECHAZO: cualquier veredicto sin verificado_por', () => {
    for (const e of ['cumple', 'no_cumple', 'no_aplica'] as const) {
      expect(veredictoFirmado({ estado: e, verificado_por: null, verificado_en: AHORA }), e)
        .toBe(false)
      expect(veredictoFirmado({ estado: e, verificado_por: '  ', verificado_en: AHORA }), e)
        .toBe(false)
    }
  })

  it('RECHAZO: cualquier veredicto sin verificado_en', () => {
    expect(veredictoFirmado({ estado: 'cumple', verificado_por: 'uid-pedro', verificado_en: null }))
      .toBe(false)
  })

  it('CLAVE: `no_aplica` también exige firma — decidir que algo no aplica es decidir', () => {
    expect(veredictoFirmado({ estado: 'no_aplica', verificado_por: null, verificado_en: null }))
      .toBe(false)
  })

  it('el builder la hace cumplir: la firma la pone ÉL, no la UI', () => {
    const patch = patchMarcarRequisito(req(), 'cumple', ACTOR, AHORA)
    expect(patch).not.toBeNull()
    expect(patch!.verificado_por).toBe('uid-karen')
    expect(patch!.verificado_en).toBe(AHORA)
  })

  it('volver a pendiente LIMPIA la firma — un pendiente firmado sería contradicción', () => {
    const firmado = req({ estado: 'cumple', verificado_por: 'uid-pedro', verificado_en: ANTES })
    const patch = patchMarcarRequisito(firmado, 'pendiente', ACTOR, AHORA)
    expect(patch!.verificado_por).toBeNull()
    expect(patch!.verificado_en).toBeNull()
  })

  it('RECHAZO: sin actor no hay firma, así que no hay patch', () => {
    expect(patchMarcarRequisito(req(), 'cumple', { uid: '' }, AHORA)).toBeNull()
    expect(patchMarcarRequisito(req(), 'cumple', { uid: '   ' }, AHORA)).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANTE 3 — el personal no se cumple en abstracto
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANTE 3 — personal: cumple exige persona con nombre y documento', () => {
  const PERSONA = {
    nombre: 'Luis Peña', cargo: 'Residente',
    ref_tipo: 'empleado_directo' as const, ref_id: 'emp-7',
  }

  it('con persona completa, cumple', () => {
    expect(personalAcreditado({ categoria: 'personal', estado: 'cumple', persona: PERSONA }))
      .toBe(true)
    const patch = patchMarcarRequisito(reqPersonal(), 'cumple', ACTOR, AHORA, { persona: PERSONA })
    expect(patch).not.toBeNull()
    expect(patch!.persona).toEqual(PERSONA)
  })

  it('CLAVE RECHAZO: marcar cumple SIN persona', () => {
    expect(personalAcreditado({ categoria: 'personal', estado: 'cumple', persona: null }))
      .toBe(false)
    expect(patchMarcarRequisito(reqPersonal(), 'cumple', ACTOR, AHORA)).toBeNull()
  })

  it('RECHAZO: persona sin nombre o sin REFERENCIA — "alguien" no acredita nada', () => {
    const sinNombre = { ...PERSONA, nombre: '  ' }
    const sinRef = { ...PERSONA, ref_id: '' }
    expect(personalAcreditado({ categoria: 'personal', estado: 'cumple', persona: sinNombre }))
      .toBe(false)
    expect(personalAcreditado({ categoria: 'personal', estado: 'cumple', persona: sinRef }))
      .toBe(false)
    expect(patchMarcarRequisito(reqPersonal(), 'cumple', ACTOR, AHORA, { persona: sinNombre }))
      .toBeNull()
  })

  it('el cargo NO es obligatorio: lo que identifica es nombre + referencia', () => {
    const sinCargo = { ...PERSONA, cargo: '' }
    expect(patchMarcarRequisito(reqPersonal(), 'cumple', ACTOR, AHORA, { persona: sinCargo }))
      .not.toBeNull()
  })

  it('RECHAZO: referencia con ref_tipo inventado', () => {
    const falso = { ...PERSONA, ref_tipo: 'papelito' as unknown as typeof PERSONA.ref_tipo }
    expect(personalAcreditado({ categoria: 'personal', estado: 'cumple', persona: falso }))
      .toBe(false)
    expect(patchMarcarRequisito(reqPersonal(), 'cumple', ACTOR, AHORA, { persona: falso }))
      .toBeNull()
  })

  it('los CINCO registros declarados sirven como referencia', () => {
    for (const t of REF_PERSONA_TIPOS) {
      const p = { ...PERSONA, ref_tipo: t }
      expect(personalAcreditado({ categoria: 'personal', estado: 'cumple', persona: p }), t)
        .toBe(true)
      expect(REF_PERSONA_TIPO_LABEL[t], t).toBeTruthy()
    }
    expect(REF_PERSONA_TIPOS).toHaveLength(5)
  })

  /**
   * A.1b — el profesional que se PROPONE y solo se vincula si NEG gana. No
   * está en ninguna nómina ni tiene cuenta: su hoja de vida se adjunta a la
   * licitación. No crea custodia de datos personales en ningún registro.
   */
  it('adjunto_licitacion con ref_id válido SATISFACE la invariante 3', () => {
    const propuesto = {
      nombre: 'Marta Quiroga',
      cargo: 'Especialista en estructuras',
      ref_tipo: 'adjunto_licitacion' as const,
      ref_id: 'licitaciones/lic-7/propuesta/hv-marta.pdf',
    }
    expect(personalAcreditado({ categoria: 'personal', estado: 'cumple', persona: propuesto }))
      .toBe(true)
    const patch = patchMarcarRequisito(reqPersonal(), 'cumple', ACTOR, AHORA, { persona: propuesto })
    expect(patch).not.toBeNull()
    expect(patch!.persona).toEqual(propuesto)
  })

  it('adjunto_licitacion con ref_id VACÍO no la satisface', () => {
    // Sin el archivo, "Marta Quiroga" vuelve a ser una afirmación sin
    // respaldo: no hay nada que la entidad pueda mirar.
    const sinArchivo = {
      nombre: 'Marta Quiroga',
      cargo: 'Especialista en estructuras',
      ref_tipo: 'adjunto_licitacion' as const,
      ref_id: '',
    }
    expect(personalAcreditado({ categoria: 'personal', estado: 'cumple', persona: sinArchivo }))
      .toBe(false)
    expect(patchMarcarRequisito(reqPersonal(), 'cumple', ACTOR, AHORA, { persona: sinArchivo }))
      .toBeNull()
    expect(personalAcreditado({
      categoria: 'personal', estado: 'cumple', persona: { ...sinArchivo, ref_id: '   ' },
    })).toBe(false)
  })

  it('no_cumple SIN persona es legítimo — suele ser "no tenemos a nadie"', () => {
    expect(personalAcreditado({ categoria: 'personal', estado: 'no_cumple', persona: null }))
      .toBe(true)
    expect(patchMarcarRequisito(reqPersonal(), 'no_cumple', ACTOR, AHORA)).not.toBeNull()
  })

  it('no_aplica SIN persona también', () => {
    expect(patchMarcarRequisito(reqPersonal(), 'no_aplica', ACTOR, AHORA)).not.toBeNull()
  })

  it('las demás categorías no piden persona', () => {
    for (const c of CATEGORIAS_REQUISITO.filter(x => x !== 'personal')) {
      expect(personalAcreditado({ categoria: c, estado: 'cumple', persona: null }), c).toBe(true)
    }
  })

  it('la persona YA guardada en el requisito sirve: no hay que re-teclearla', () => {
    const conPersona = reqPersonal({ persona: PERSONA })
    expect(patchMarcarRequisito(conPersona, 'cumple', ACTOR, AHORA)).not.toBeNull()
  })

  it('RECHAZO: pasar persona null EXPLÍCITO borra la guardada y bloquea', () => {
    const conPersona = reqPersonal({ persona: PERSONA })
    expect(patchMarcarRequisito(conPersona, 'cumple', ACTOR, AHORA, { persona: null })).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANTE 4 — el indicador se evalúa, no se declara
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANTE 4 — indicador: cumple exige valor_neg', () => {
  it('con valor_neg medido, cumple', () => {
    expect(indicadorMedido({ tipo_evidencia: 'indicador', estado: 'cumple', valor_neg: 3.4 }))
      .toBe(true)
    expect(patchMarcarRequisito(reqIndicador(), 'cumple', ACTOR, AHORA, { valor_neg: 3.4 }))
      .not.toBeNull()
  })

  it('CLAVE RECHAZO: marcar cumple A MANO sin el número', () => {
    expect(indicadorMedido({ tipo_evidencia: 'indicador', estado: 'cumple', valor_neg: null }))
      .toBe(false)
    expect(patchMarcarRequisito(reqIndicador(), 'cumple', ACTOR, AHORA)).toBeNull()
  })

  it('RECHAZO: un valor_neg que no es número usable', () => {
    expect(indicadorMedido({ tipo_evidencia: 'indicador', estado: 'cumple', valor_neg: NaN }))
      .toBe(false)
    expect(indicadorMedido({ tipo_evidencia: 'indicador', estado: 'cumple', valor_neg: Infinity }))
      .toBe(false)
  })

  it('el CERO es un valor medido legítimo (endeudamiento 0)', () => {
    expect(indicadorMedido({ tipo_evidencia: 'indicador', estado: 'cumple', valor_neg: 0 }))
      .toBe(true)
  })

  it('no_cumple SIN número es legítimo: "el RUP no lo reporta y la entidad no lo acepta"', () => {
    expect(indicadorMedido({ tipo_evidencia: 'indicador', estado: 'no_cumple', valor_neg: null }))
      .toBe(true)
    expect(patchMarcarRequisito(reqIndicador(), 'no_cumple', ACTOR, AHORA)).not.toBeNull()
  })

  it('los demás tipos de evidencia no piden valor_neg', () => {
    for (const t of TIPOS_EVIDENCIA.filter(x => x !== 'indicador')) {
      expect(indicadorMedido({ tipo_evidencia: t, estado: 'cumple', valor_neg: null }), t).toBe(true)
    }
  })

  it('RECHAZO: pasar valor_neg null EXPLÍCITO borra el medido y bloquea', () => {
    const medido = reqIndicador({ valor_neg: 3.4 })
    expect(patchMarcarRequisito(medido, 'cumple', ACTOR, AHORA, { valor_neg: null })).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// El predicado del botón y el del builder son EL MISMO
// ═════════════════════════════════════════════════════════════════════════════

describe('puedeMarcarseRequisito ⟷ patchMarcarRequisito — no divergen', () => {
  const casos: { nombre: string; r: Requisito; destino: EstadoRequisito; datos?: Parameters<typeof patchMarcarRequisito>[4] }[] = [
    { nombre: 'jurídico a cumple', r: req(), destino: 'cumple' },
    { nombre: 'personal a cumple sin persona', r: reqPersonal(), destino: 'cumple' },
    {
      nombre: 'personal a cumple con persona', r: reqPersonal(), destino: 'cumple',
      datos: {
        persona: {
          nombre: 'Luis', cargo: 'R',
          ref_tipo: 'usuario_panel' as const, ref_id: 'uid-luis',
        },
      },
    },
    { nombre: 'indicador a cumple sin valor', r: reqIndicador(), destino: 'cumple' },
    { nombre: 'indicador a cumple con valor', r: reqIndicador(), destino: 'cumple', datos: { valor_neg: 3 } },
    { nombre: 'indicador a no_cumple', r: reqIndicador(), destino: 'no_cumple' },
    { nombre: 'vuelta a pendiente', r: req({ estado: 'cumple' }), destino: 'pendiente' },
  ]

  it('para cada caso, el predicado y el builder coinciden', () => {
    for (const c of casos) {
      const permite = puedeMarcarseRequisito(c.r, c.destino, c.datos)
      const patch = patchMarcarRequisito(c.r, c.destino, ACTOR, AHORA, c.datos)
      expect(permite, `${c.nombre}: predicado`).toBe(patch !== null)
    }
  })

  it('un estado inventado se rechaza por las dos vías', () => {
    const falso = 'aprobado_casi' as EstadoRequisito
    expect(puedeMarcarseRequisito(req(), falso)).toBe(false)
    expect(patchMarcarRequisito(req(), falso, ACTOR, AHORA)).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// COPNIA — el caso de regresión con nombre propio
// ═════════════════════════════════════════════════════════════════════════════

describe('REGRESIÓN COPNIA — la pérdida real de 2026 no puede repetirse', () => {
  /**
   * Qué pasó: un pliego exigía un ingeniero residente con matrícula
   * profesional vigente del COPNIA. En la licitación ANTERIOR ese requisito
   * estaba verificado y en `cumple`. Al armar la nueva se reusó la lista y
   * nadie volvió a mirar: la matrícula de esa persona ya no servía. Se
   * presentó la propuesta creyendo el requisito cubierto y el proceso se
   * perdió por un papel.
   *
   * Lo que estos tests fijan: clonar NO hereda el `cumple`, y mientras ese
   * requisito siga pendiente NO se puede presentar.
   */
  const anterior: Requisito[] = [
    req({
      descripcion: 'Certificado de existencia y representación legal',
      estado: 'cumple', verificado_por: 'uid-pedro', verificado_en: ANTES,
    }),
    reqPersonal({
      descripcion: 'Ingeniero residente con matrícula profesional vigente (COPNIA)',
      fuente_pliego: '4.1.3',
      estado: 'cumple',
      verificado_por: 'uid-pedro',
      verificado_en: ANTES,
      persona: {
        nombre: 'Luis Peña', cargo: 'Ingeniero residente',
        ref_tipo: 'empleado_directo', ref_id: 'emp-7',
      },
      observacion: 'Matrícula 25202-123456 verificada en el portal del COPNIA',
    }),
  ]

  it('la licitación anterior SÍ estaba lista para presentar', () => {
    expect(puedePresentar(anterior)).toBe(true)
  })

  it('CLAVE: al clonar, el requisito COPNIA queda PENDIENTE — no hereda el cumple', () => {
    const nueva = clonarRequisitosComoPlantilla(anterior, ACTOR, AHORA)
    const copnia = nueva.find(r => r.descripcion.includes('COPNIA'))!
    expect(copnia).toBeDefined()
    expect(copnia.estado).toBe('pendiente')
    expect(copnia.verificado_por).toBeNull()
    expect(copnia.verificado_en).toBeNull()
    // Y la persona tampoco viaja: la gente rota y las matrículas caducan.
    expect(copnia.persona).toBeNull()
    expect(copnia.observacion).toBe('')
  })

  it('CLAVE: con el COPNIA pendiente, puedePresentar devuelve FALSE', () => {
    const nueva = clonarRequisitosComoPlantilla(anterior, ACTOR, AHORA)
    expect(puedePresentar(nueva)).toBe(false)
    expect(resumenCumplimiento(nueva).pendientes).toBe(2)
  })

  it('un override NO salva un pendiente: nadie justifica por escrito lo que no ha mirado', () => {
    const nueva = clonarRequisitosComoPlantilla(anterior, ACTOR, AHORA)
    const override = { por: 'uid-pedro', en: AHORA, motivo: 'Confiamos en que sigue vigente' }
    expect(puedePresentar(nueva, override)).toBe(false)
  })

  it('se desbloquea solo cuando alguien MIRA la matrícula y la firma', () => {
    const nueva = clonarRequisitosComoPlantilla(anterior, ACTOR, AHORA)
    const verificados = nueva.map(r => {
      const datos = r.categoria === 'personal'
        ? {
          persona: {
            nombre: 'Ana Ríos', cargo: 'Ingeniera residente',
            ref_tipo: 'empleado_directo' as const, ref_id: 'emp-11',
          },
        }
        : undefined
      const patch = patchMarcarRequisito(r, 'cumple', { uid: 'uid-pedro' }, AHORA, datos)
      expect(patch, r.descripcion).not.toBeNull()
      return { ...r, ...patch! } as Requisito
    })
    expect(puedePresentar(verificados)).toBe(true)
    for (const v of verificados) expect(requisitoConsistente(v)).toBe(true)
  })

  it('y si la matrícula de verdad NO sirve, se puede presentar solo con motivo escrito', () => {
    const nueva = clonarRequisitosComoPlantilla(anterior, ACTOR, AHORA)
    const resuelto = nueva.map(r => {
      const destino: EstadoRequisito = r.categoria === 'personal' ? 'no_cumple' : 'cumple'
      const patch = patchMarcarRequisito(r, destino, { uid: 'uid-pedro' }, AHORA)!
      return { ...r, ...patch } as Requisito
    })
    expect(puedePresentar(resuelto)).toBe(false)
    expect(puedePresentar(resuelto, { por: 'uid-pedro', en: AHORA, motivo: '' })).toBe(false)
    expect(puedePresentar(resuelto, {
      por: 'uid-pedro', en: AHORA,
      motivo: 'La entidad aceptó subsanar la matrícula dentro del plazo de observaciones',
    })).toBe(true)
  })

  /**
   * GUARDARRAÍL TEXTUAL sobre el archivo fuente — patrón de
   * `rolResidente.test.ts`, que lee roles.ts y storage.rules para que una
   * concesión por descuido tumbe la suite.
   *
   * La invariante 1 dice que NO debe existir ninguna función que copie
   * `estado` entre requisitos. Un test de comportamiento prueba que la que
   * HAY no lo copia; este prueba que no apareció otra.
   */
  /**
   * GUARDARRAÍL LEY 1581 — la cédula no vuelve al checklist.
   *
   * El sistema ya tiene un custodio por dato personal (C2.1 paso 5 sacó la
   * cédula del doc público de contratistas y las reglas prohíben que vuelva).
   * Un campo de identificación en `PersonaRequisito` crearía un SEGUNDO
   * custodio, en una colección con otros lectores — reabriendo por una puerta
   * nueva lo que ese bloque cerró.
   */
  it('GUARDARRAÍL Ley 1581: `persona` NO admite documento de identidad', () => {
    const fuente = readFileSync(resolve(__dirname, '../requisito.ts'), 'utf8')
    const PROHIBIDOS = ['documento', 'cedula', 'nit', 'identificacion', 'numero_documento']

    // (a) Dentro de la interfaz `PersonaRequisito` no aparece NINGUNO.
    const bloque = /export interface PersonaRequisito \{[\s\S]*?\n\}/.exec(fuente)?.[0] ?? ''
    expect(bloque, 'no se encontró la interfaz PersonaRequisito').not.toBe('')
    for (const w of PROHIBIDOS) {
      expect(bloque.toLowerCase(), `"${w}" reapareció en PersonaRequisito`).not.toContain(w)
    }

    // (b) En TODO el archivo, ninguno como DECLARACIÓN de campo. Acotado a
    // `campo:` para no chocar con `documento_empresa_id` ni con el valor
    // 'documento_empresa' de REF_PERSONA_TIPOS, que son otra cosa.
    for (const w of PROHIBIDOS) {
      expect(fuente, `campo "${w}:" declarado en requisito.ts`)
        .not.toMatch(new RegExp(`\\b${w}\\s*:`, 'i'))
    }

    // (c) El tipo en runtime: las claves de una persona válida son exactamente cuatro.
    const p = { nombre: 'X', cargo: 'Y', ref_tipo: 'empleado_directo' as const, ref_id: 'z' }
    expect(Object.keys(p).sort()).toEqual(['cargo', 'nombre', 'ref_id', 'ref_tipo'])
  })

  it('GUARDARRAÍL de frontera: el tipo declara que el módulo NO escribe en registros ajenos', () => {
    // `users`, `contratistas` y `empleados_directos` son de otros frentes.
    // Si alguien borra esa advertencia del tipo, que al menos caiga la suite.
    const fuente = readFileSync(resolve(__dirname, '../requisito.ts'), 'utf8')
    expect(fuente).toContain('SOLO LEE')
    expect(fuente).toContain('NUNCA escribe')
  })

  it('GUARDARRAÍL: el archivo fuente no copia `estado` de un requisito a otro', () => {
    const fuente = readFileSync(resolve(__dirname, '../requisito.ts'), 'utf8')

    // Ninguna forma de propagar el estado del origen.
    for (const patron of [
      'estado: r.estado', 'estado: origen', 'estado: req.estado', 'estado: x.estado',
      '...r,', '...origen',
    ]) {
      expect(fuente, `aparece "${patron}" — ¿alguien está heredando estado?`)
        .not.toContain(patron)
    }

    // Y la lista blanca de lo que viaja no menciona el estado ni la firma.
    const plantilla = /export type PlantillaRequisito = Pick<[\s\S]*?>/.exec(fuente)?.[0] ?? ''
    expect(plantilla).not.toBe('')
    for (const campo of ['estado', 'verificado_por', 'verificado_en', 'valor_neg', 'persona']) {
      expect(plantilla, `"${campo}" no debe viajar en la plantilla`).not.toContain(`'${campo}'`)
    }
  })
})
