import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import type { Timestamp } from 'firebase/firestore'
import {
  CAMPO_RUP_DE, valorNegDesdeRup, evaluarIndicador, patchEvaluarIndicador,
  MOTIVOS_VIGENCIA, MOTIVO_VIGENCIA_LABEL, evaluarVigencia,
  overrideCumplimientoValido, resumenCumplimiento, puedePresentar,
  motivoBloqueoPresentacion, bloqueoPresentacion,
  MOTIVOS_BLOQUEO_PRESENTACION, BLOQUEOS_CON_OVERRIDE,
} from '../cumplimiento'
import { motorVigenciasProvisional } from '../vigencias'
import type { MotorVigencias } from '../../../types/sigp/motorVigencias'
import { INDICADORES_RUP } from '../../../types/sigp/requisito'
import type { Requisito, EstadoRequisito, IndicadorRup } from '../../../types/sigp/requisito'
import type { DocumentoEmpresa, IndicadoresRup } from '../../../types/sigp/documentoEmpresa'

const dia = (y: number, m: number, d: number, h = 12): Timestamp =>
  ({ toDate: () => new Date(y, m - 1, d, h), toMillis: () => new Date(y, m - 1, d, h).getTime() } as unknown as Timestamp)
const AHORA = dia(2026, 9, 1)
const ACTOR = { uid: 'uid-karen' }

/** RUP real de NEG, con los seis indicadores reportados. */
const RUP: IndicadoresRup = {
  fecha_corte: dia(2025, 12, 31),
  liquidez: 3.4,
  endeudamiento: 0.42,
  cobertura_intereses: 8.1,
  rentabilidad_patrimonio: 0.19,
  rentabilidad_activo: 0.11,
  patrimonio: 1_850_000_000,
  activo_total: 3_200_000_000,
  experiencia_total_smmlv: 4_820,
  numero_contratos_acreditados: 37,
  clasificacion_tamano: 'pequena',
}

const req = (extra?: Partial<Requisito>): Requisito => ({
  categoria: 'financiero',
  descripcion: 'Índice de liquidez mayor o igual a 2,0',
  fuente_pliego: '5.1.2',
  tipo_evidencia: 'indicador',
  documento_empresa_id: null,
  persona: null,
  indicador: 'liquidez',
  operador: 'gte',
  valor_exigido: 2,
  valor_neg: null,
  estado: 'pendiente',
  verificado_por: null,
  verificado_en: null,
  observacion: '',
  activo: true,
  creado_por: 'uid-karen',
  creado_en: AHORA,
  actualizado_por: 'uid-karen',
  actualizado_en: AHORA,
  ...extra,
})

const doc = (extra?: Partial<DocumentoEmpresa>): DocumentoEmpresa => ({
  tipo: 'camara_comercio',
  nombre: 'Cámara de comercio',
  numero: null,
  entidad_emisora: null,
  fecha_expedicion: dia(2026, 8, 1),
  fecha_vigencia_hasta: dia(2026, 12, 31),
  dias_alerta: 30,
  archivo_url: 'https://storage/x.pdf',
  archivo_hash: 'h',
  archivo_nombre: 'x.pdf',
  reutilizable: true,
  observaciones: '',
  activo: true,
  indicadores: null,
  creado_por: 'uid-karen',
  creado_en: AHORA,
  actualizado_por: 'uid-karen',
  actualizado_en: AHORA,
  ...extra,
})

/** Lista de requisitos solo con su estado — lo que consume el gate. */
const conEstados = (...estados: EstadoRequisito[]) => estados.map(e => ({ estado: e }))

// ═════════════════════════════════════════════════════════════════════════════
// El mapa de traducción al RUP
// ═════════════════════════════════════════════════════════════════════════════

describe('CAMPO_RUP_DE — la traducción explícita', () => {
  it('cubre los SEIS indicadores', () => {
    for (const i of INDICADORES_RUP) expect(CAMPO_RUP_DE[i], i).toBeTruthy()
    expect(Object.keys(CAMPO_RUP_DE)).toHaveLength(6)
  })

  it('CLAVE: experiencia_smmlv apunta a experiencia_total_smmlv', () => {
    // El nombre parecido es el enemigo: un acceso por el nombre "obvio"
    // devolvería undefined y el requisito quedaría pendiente sin que nada
    // avise. Misma clase que el `col()` por substring del importador.
    expect(CAMPO_RUP_DE.experiencia_smmlv).toBe('experiencia_total_smmlv')
    expect(valorNegDesdeRup({ indicador: 'experiencia_smmlv' }, RUP)).toBe(4_820)
  })

  it('cada campo traducido EXISTE en los indicadores del RUP', () => {
    for (const i of INDICADORES_RUP) {
      expect(RUP, i).toHaveProperty(CAMPO_RUP_DE[i])
      expect(valorNegDesdeRup({ indicador: i }, RUP), i).not.toBeNull()
    }
  })
})

describe('valorNegDesdeRup', () => {
  it('lee el valor de cada uno de los seis', () => {
    const esperado: Record<IndicadorRup, number> = {
      liquidez: 3.4,
      endeudamiento: 0.42,
      cobertura_intereses: 8.1,
      rentabilidad_patrimonio: 0.19,
      rentabilidad_activo: 0.11,
      experiencia_smmlv: 4_820,
    }
    for (const i of INDICADORES_RUP) {
      expect(valorNegDesdeRup({ indicador: i }, RUP), i).toBe(esperado[i])
    }
  })

  it('null sin RUP, sin indicador, o con el indicador no reportado', () => {
    expect(valorNegDesdeRup({ indicador: 'liquidez' }, null)).toBeNull()
    expect(valorNegDesdeRup({ indicador: 'liquidez' }, undefined)).toBeNull()
    expect(valorNegDesdeRup({ indicador: null }, RUP)).toBeNull()
    expect(valorNegDesdeRup({ indicador: 'cobertura_intereses' }, { ...RUP, cobertura_intereses: null }))
      .toBeNull()
  })

  it('null con valores que no son números usables', () => {
    expect(valorNegDesdeRup({ indicador: 'liquidez' }, { ...RUP, liquidez: NaN })).toBeNull()
    expect(valorNegDesdeRup({ indicador: 'liquidez' }, { ...RUP, liquidez: Infinity })).toBeNull()
  })

  it('el CERO se lee como dato, no como ausencia', () => {
    expect(valorNegDesdeRup({ indicador: 'endeudamiento' }, { ...RUP, endeudamiento: 0 })).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// evaluarIndicador — los seis, gte y lte, y el ausente
// ═════════════════════════════════════════════════════════════════════════════

describe('evaluarIndicador — los SEIS indicadores con gte', () => {
  /** Para cada indicador: un umbral que NEG supera y uno que no. */
  const casos: { ind: IndicadorRup; pasa: number; falla: number }[] = [
    { ind: 'liquidez', pasa: 2, falla: 5 },
    { ind: 'endeudamiento', pasa: 0.1, falla: 0.9 },
    { ind: 'cobertura_intereses', pasa: 5, falla: 12 },
    { ind: 'rentabilidad_patrimonio', pasa: 0.1, falla: 0.5 },
    { ind: 'rentabilidad_activo', pasa: 0.05, falla: 0.3 },
    { ind: 'experiencia_smmlv', pasa: 3_000, falla: 9_000 },
  ]

  it('gte: cumple cuando NEG alcanza o supera el exigido', () => {
    for (const c of casos) {
      const r = req({ indicador: c.ind, operador: 'gte', valor_exigido: c.pasa })
      expect(evaluarIndicador(r, RUP), c.ind).toBe('cumple')
    }
  })

  it('gte: no_cumple cuando queda corto', () => {
    for (const c of casos) {
      const r = req({ indicador: c.ind, operador: 'gte', valor_exigido: c.falla })
      expect(evaluarIndicador(r, RUP), c.ind).toBe('no_cumple')
    }
  })

  it('gte: el borde EXACTO cumple (mayor o IGUAL)', () => {
    for (const c of casos) {
      const exacto = valorNegDesdeRup({ indicador: c.ind }, RUP)!
      const r = req({ indicador: c.ind, operador: 'gte', valor_exigido: exacto })
      expect(evaluarIndicador(r, RUP), c.ind).toBe('cumple')
    }
  })
})

describe('evaluarIndicador — lte, el techo', () => {
  it('endeudamiento: el pliego pone un MÁXIMO', () => {
    // El caso real de lte: "índice de endeudamiento no superior a 0,70".
    expect(evaluarIndicador(
      req({ indicador: 'endeudamiento', operador: 'lte', valor_exigido: 0.7 }), RUP,
    )).toBe('cumple')
    expect(evaluarIndicador(
      req({ indicador: 'endeudamiento', operador: 'lte', valor_exigido: 0.3 }), RUP,
    )).toBe('no_cumple')
  })

  it('lte: el borde EXACTO cumple (menor o IGUAL)', () => {
    expect(evaluarIndicador(
      req({ indicador: 'endeudamiento', operador: 'lte', valor_exigido: 0.42 }), RUP,
    )).toBe('cumple')
  })

  it('el MISMO valor da resultados opuestos según el operador — el operador manda', () => {
    const base = { indicador: 'liquidez' as IndicadorRup, valor_exigido: 2 }
    expect(evaluarIndicador(req({ ...base, operador: 'gte' }), RUP)).toBe('cumple')
    expect(evaluarIndicador(req({ ...base, operador: 'lte' }), RUP)).toBe('no_cumple')
  })

  it('los seis indicadores funcionan también con lte', () => {
    for (const i of INDICADORES_RUP) {
      const valor = valorNegDesdeRup({ indicador: i }, RUP)!
      expect(evaluarIndicador(req({ indicador: i, operador: 'lte', valor_exigido: valor }), RUP), i)
        .toBe('cumple')
      expect(evaluarIndicador(req({ indicador: i, operador: 'lte', valor_exigido: valor - 1 }), RUP), i)
        .toBe('no_cumple')
    }
  })
})

describe('evaluarIndicador — el indicador AUSENTE en el RUP', () => {
  it('CLAVE: el RUP no reporta el indicador ⇒ pendiente, JAMÁS cumple', () => {
    // Principio 1: la ausencia de dato nunca es "cumple". Alguien tiene que
    // ir a buscarlo — es el error que costó un proceso en 2026.
    const sinCobertura = { ...RUP, cobertura_intereses: null }
    const r = req({ indicador: 'cobertura_intereses', operador: 'gte', valor_exigido: 5 })
    expect(evaluarIndicador(r, sinCobertura)).toBe('pendiente')
  })

  it('ninguno de los seis se da por cumplido si falta en el RUP', () => {
    for (const i of INDICADORES_RUP) {
      const rupParcial = { ...RUP, [CAMPO_RUP_DE[i]]: null } as IndicadoresRup
      const r = req({ indicador: i, operador: 'gte', valor_exigido: 0 })
      // Con exigido 0 y gte cumpliría trivialmente SI hubiera dato.
      expect(evaluarIndicador(r, rupParcial), i).toBe('pendiente')
    }
  })

  it('sin RUP cargado ⇒ pendiente', () => {
    expect(evaluarIndicador(req(), null)).toBe('pendiente')
    expect(evaluarIndicador(req(), undefined)).toBe('pendiente')
  })

  it('el pliego sin operador o sin valor exigido ⇒ pendiente', () => {
    expect(evaluarIndicador(req({ operador: null }), RUP)).toBe('pendiente')
    expect(evaluarIndicador(req({ valor_exigido: null }), RUP)).toBe('pendiente')
    expect(evaluarIndicador(req({ valor_exigido: NaN }), RUP)).toBe('pendiente')
  })

  it('un requisito que no es de indicador ⇒ pendiente (no es asunto de este motor)', () => {
    expect(evaluarIndicador(req({ tipo_evidencia: 'documento_empresa' }), RUP)).toBe('pendiente')
    expect(evaluarIndicador(req({ tipo_evidencia: 'declaracion' }), RUP)).toBe('pendiente')
  })
})

describe('patchEvaluarIndicador — copia el valor y fija el estado EN EL MISMO patch', () => {
  it('cumple: escribe valor_neg y firma', () => {
    const patch = patchEvaluarIndicador(req(), RUP, ACTOR, AHORA)
    expect(patch).not.toBeNull()
    expect(patch!.valor_neg).toBe(3.4)
    expect(patch!.estado).toBe('cumple')
    expect(patch!.verificado_por).toBe('uid-karen')
    expect(patch!.verificado_en).toBe(AHORA)
  })

  it('CLAVE: el valor y el estado viajan juntos — nunca un cumple sin número', () => {
    // Si se escribieran por separado habría un instante con `cumple` y
    // `valor_neg: null`, que viola la invariante 4 del propio documento.
    const patch = patchEvaluarIndicador(req(), RUP, ACTOR, AHORA)!
    expect(Object.keys(patch)).toContain('valor_neg')
    expect(Object.keys(patch)).toContain('estado')
  })

  it('no_cumple: también escribe el número medido (es el que justifica el rechazo)', () => {
    const r = req({ valor_exigido: 9 })
    const patch = patchEvaluarIndicador(r, RUP, ACTOR, AHORA)!
    expect(patch.estado).toBe('no_cumple')
    expect(patch.valor_neg).toBe(3.4)
  })

  it('pendiente por ausencia: NO firma — no hay veredicto todavía', () => {
    const patch = patchEvaluarIndicador(req(), null, ACTOR, AHORA)!
    expect(patch.estado).toBe('pendiente')
    expect(patch.valor_neg).toBeNull()
    expect(patch.verificado_por).toBeNull()
    expect(patch.verificado_en).toBeNull()
  })

  it('null si el requisito no es de indicador, o sin actor', () => {
    expect(patchEvaluarIndicador(req({ tipo_evidencia: 'declaracion' }), RUP, ACTOR, AHORA))
      .toBeNull()
    expect(patchEvaluarIndicador(req(), RUP, { uid: '' }, AHORA)).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// evaluarVigencia — el chequeo que solo VETA
// ═════════════════════════════════════════════════════════════════════════════

describe('evaluarVigencia — vence antes del cierre', () => {
  const rDoc = req({ tipo_evidencia: 'documento_empresa', documento_empresa_id: 'doc-1' })
  const CIERRE = dia(2026, 9, 15, 17)

  // El motor entra INYECTADO (contrato `MotorVigencias`). Acá se inyecta la
  // implementación provisional, que es la que hoy rige; el caso del seam de
  // más abajo prueba que de verdad se consulta la inyectada y no un import
  // escondido.
  type ArgsEval = Parameters<typeof evaluarVigencia>
  const evalVig = (r: ArgsEval[0], d: ArgsEval[1], cierre: ArgsEval[2]) =>
    evaluarVigencia(r, d, cierre, motorVigenciasProvisional)

  it('CLAVE: el documento vence antes del cierre ⇒ no_cumple con motivo', () => {
    const v = evalVig(rDoc, doc({ fecha_vigencia_hasta: dia(2026, 9, 10) }), CIERRE)
    expect(v.objeta).toBe(true)
    expect(v.estado).toBe('no_cumple')
    expect(v.motivo).toBe('VENCE_ANTES_DEL_CIERRE')
  })

  it('vigencia el MISMO día del cierre ⇒ no objeta', () => {
    const v = evalVig(rDoc, doc({ fecha_vigencia_hasta: dia(2026, 9, 15, 0) }), CIERRE)
    expect(v.objeta).toBe(false)
  })

  it('CLAVE: cuando no objeta, NO dice "cumple" — solo que no tiene nada en contra', () => {
    // Principio 2: los automáticos vetan, no aprueban. Que un papel esté
    // vigente no significa que sea el papel correcto.
    const v = evalVig(rDoc, doc(), CIERRE)
    expect(v.objeta).toBe(false)
    expect(v.estado).toBeNull()
    expect(v.motivo).toBeNull()
  })

  it('documento AUSENTE ⇒ pendiente (se consigue), no no_cumple', () => {
    for (const faltante of [null, undefined]) {
      const v = evalVig(rDoc, faltante, CIERRE)
      expect(v.objeta).toBe(true)
      expect(v.estado).toBe('pendiente')
      expect(v.motivo).toBe('DOCUMENTO_AUSENTE')
    }
  })

  it('documento ARCHIVADO ⇒ pendiente: hay que apuntar al vigente', () => {
    const v = evalVig(rDoc, doc({ activo: false }), CIERRE)
    expect(v.estado).toBe('pendiente')
    expect(v.motivo).toBe('DOCUMENTO_INACTIVO')
  })

  it('un documento que NO vence nunca objeta', () => {
    expect(evalVig(rDoc, doc({ fecha_vigencia_hasta: null }), CIERRE).objeta).toBe(false)
  })

  it('sin fecha de cierre no objeta — no hay contra qué medir', () => {
    const vencido = doc({ fecha_vigencia_hasta: dia(2020, 1, 1) })
    expect(evalVig(rDoc, vencido, null).objeta).toBe(false)
    expect(evalVig(rDoc, vencido, undefined).objeta).toBe(false)
  })

  it('los requisitos que no son de documento_empresa no son asunto de este chequeo', () => {
    for (const t of ['documento_personal', 'indicador', 'declaracion', 'otro'] as const) {
      const v = evalVig(req({ tipo_evidencia: t }), null, CIERRE)
      expect(v.objeta, t).toBe(false)
    }
  })

  it('el orden de los vetos: ausente y archivado pesan antes que la fecha', () => {
    // Un documento archivado Y vencido se reporta como archivado: la acción
    // que desbloquea es apuntar a otro, no renovar este.
    const v = evalVig(rDoc, doc({ activo: false, fecha_vigencia_hasta: dia(2020, 1, 1) }), CIERRE)
    expect(v.motivo).toBe('DOCUMENTO_INACTIVO')
  })

  it('cada motivo declarado tiene label', () => {
    for (const m of MOTIVOS_VIGENCIA) expect(MOTIVO_VIGENCIA_LABEL[m], m).toBeTruthy()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// LA FRONTERA CON SIGP — el motor de vigencias entra por contrato
// ═════════════════════════════════════════════════════════════════════════════
//
// `utils/sigp/vigencias.ts` es PROVISIONAL: SIGP va a consolidarlo con su
// `utils/vencimiento.ts`. Estos casos fijan que la consolidación cueste UN
// archivo — que `cumplimiento.ts` consulte el motor QUE SE LE PASA y no uno
// importado por detrás. Sin ellos, alguien podría volver al import directo y
// la suite seguiría verde con el acoplamiento reconstruido.

describe('inyección del motor de vigencias (contrato MotorVigencias)', () => {
  const rDoc = req({ tipo_evidencia: 'documento_empresa', documento_empresa_id: 'doc-1' })
  const CIERRE = dia(2026, 9, 15, 17)
  /** Un documento que la implementación provisional daría por NO vencido. */
  const VIGENTE = doc({ fecha_vigencia_hasta: dia(2030, 1, 1) })

  it('CLAVE: se consulta el motor INYECTADO, no un import escondido', () => {
    const llamadas: unknown[] = []
    const stub: Pick<MotorVigencias, 'venceAntesDe'> = {
      venceAntesDe: (d, fecha) => { llamadas.push([d, fecha]); return true },
    }
    // El provisional diría "no vence"; el stub dice "vence". Gana el stub.
    expect(evaluarVigencia(rDoc, VIGENTE, CIERRE, motorVigenciasProvisional).objeta).toBe(false)
    const v = evaluarVigencia(rDoc, VIGENTE, CIERRE, stub)
    expect(v.objeta).toBe(true)
    expect(v.motivo).toBe('VENCE_ANTES_DEL_CIERRE')
    expect(llamadas).toHaveLength(1)
  })

  it('los vetos que NO son de fecha se resuelven sin tocar el motor', () => {
    // Ausente y archivado son del checklist, no de vigencias: un motor que
    // explote no puede romperlos.
    const explota: Pick<MotorVigencias, 'venceAntesDe'> = {
      venceAntesDe: () => { throw new Error('el motor no debía ser consultado') },
    }
    expect(evaluarVigencia(rDoc, null, CIERRE, explota).motivo).toBe('DOCUMENTO_AUSENTE')
    expect(evaluarVigencia(rDoc, doc({ activo: false }), CIERRE, explota).motivo)
      .toBe('DOCUMENTO_INACTIVO')
    expect(evaluarVigencia(req({ tipo_evidencia: 'indicador' }), VIGENTE, CIERRE, explota).objeta)
      .toBe(false)
    expect(evaluarVigencia(rDoc, VIGENTE, null, explota).objeta).toBe(false)
  })

  it('GUARDARRAÍL: cumplimiento.ts NO importa la implementación de vigencias', () => {
    // Patrón del guardarraíl de Ley 1581 y de rolResidente.test.ts: se lee el
    // ARCHIVO FUENTE. Un test de comportamiento no atrapa un import de vuelta
    // a `./vigencias` — el resultado sería idéntico mientras la provisional
    // sea la que rige, y la frontera estaría rota en silencio hasta el día de
    // la consolidación con SIGP.
    const fuente = readFileSync(resolve(__dirname, '../cumplimiento.ts'), 'utf8')
    const imports = fuente.match(/^import[sS]*?froms+'[^']+'/gm) ?? []
    const deVigencias = imports.filter(i => /vigencias'$/.test(i))
    expect(deVigencias, 'cumplimiento.ts no debe importar de ./vigencias').toEqual([])
    // Y la dependencia correcta sí está: el CONTRATO, solo como tipo.
    expect(fuente).toContain("import type { MotorVigencias } from '../../types/sigp/motorVigencias'")
  })

  it('la implementación provisional CUMPLE el contrato en runtime', () => {
    // El `: MotorVigencias` del archivo lo fija en compilación; esto lo fija
    // también acá, para que un `as` futuro no lo evada en silencio.
    const motor: MotorVigencias = motorVigenciasProvisional
    expect(typeof motor.estadoVigencia).toBe('function')
    expect(typeof motor.venceAntesDe).toBe('function')
    expect(Object.keys(motorVigenciasProvisional).sort())
      .toEqual(['estadoVigencia', 'venceAntesDe'])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Override
// ═════════════════════════════════════════════════════════════════════════════

describe('overrideCumplimientoValido', () => {
  it('con autor y motivo, válido', () => {
    expect(overrideCumplimientoValido({ por: 'uid-pedro', en: AHORA, motivo: 'La entidad aceptó subsanar' }))
      .toBe(true)
  })

  it('RECHAZO: sin motivo, con motivo en blanco, o sin autor', () => {
    expect(overrideCumplimientoValido({ por: 'uid-pedro', en: AHORA, motivo: '' })).toBe(false)
    expect(overrideCumplimientoValido({ por: 'uid-pedro', en: AHORA, motivo: '   ' })).toBe(false)
    expect(overrideCumplimientoValido({ por: '', en: AHORA, motivo: 'algo' })).toBe(false)
  })

  it('RECHAZO: ausente', () => {
    expect(overrideCumplimientoValido(null)).toBe(false)
    expect(overrideCumplimientoValido(undefined)).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// resumenCumplimiento
// ═════════════════════════════════════════════════════════════════════════════

describe('resumenCumplimiento', () => {
  it('cuenta cada estado', () => {
    const r = resumenCumplimiento(conEstados(
      'cumple', 'cumple', 'cumple', 'no_cumple', 'pendiente', 'pendiente', 'no_aplica',
    ))
    expect(r).toMatchObject({
      total: 7, cumplen: 3, no_cumplen: 1, pendientes: 2, no_aplican: 1,
      sin_requisitos: false, listoParaPresentar: false,
    })
  })

  it('listo cuando todo está cumple o no_aplica', () => {
    const r = resumenCumplimiento(conEstados('cumple', 'no_aplica', 'cumple'))
    expect(r.listoParaPresentar).toBe(true)
  })

  it('un solo pendiente lo tumba', () => {
    expect(resumenCumplimiento(conEstados('cumple', 'pendiente')).listoParaPresentar).toBe(false)
  })

  it('un solo no_cumple lo tumba (sin override, que el resumen no conoce)', () => {
    expect(resumenCumplimiento(conEstados('cumple', 'no_cumple')).listoParaPresentar).toBe(false)
  })

  it('CHECKLIST VACÍO: NO está listo, y `sin_requisitos` lo dice', () => {
    // "No anoté ningún requisito" NO es "revisé todo y está en orden".
    const r = resumenCumplimiento([])
    expect(r.total).toBe(0)
    expect(r.sin_requisitos).toBe(true)
    expect(r.listoParaPresentar).toBe(false)
  })

  it('un solo requisito en cumple SÍ alcanza — el bloqueo es por vacío, no por cantidad', () => {
    const r = resumenCumplimiento(conEstados('cumple'))
    expect(r.sin_requisitos).toBe(false)
    expect(r.listoParaPresentar).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// puedePresentar — EL GATE
// ═════════════════════════════════════════════════════════════════════════════

describe('puedePresentar — con PENDIENTES', () => {
  const OVERRIDE = { por: 'uid-pedro', en: AHORA, motivo: 'Riesgo asumido por la dirección' }

  it('CLAVE: un pendiente bloquea, y el override NO lo salva', () => {
    // Un pendiente es "no sabemos". Nadie puede justificar por escrito algo
    // que no ha mirado — lo que se autoriza con motivo es un riesgo CONOCIDO.
    const lista = conEstados('cumple', 'pendiente')
    expect(puedePresentar(lista)).toBe(false)
    expect(puedePresentar(lista, OVERRIDE)).toBe(false)
  })

  it('varios pendientes, igual', () => {
    expect(puedePresentar(conEstados('pendiente', 'pendiente', 'cumple'), OVERRIDE)).toBe(false)
  })

  it('pendientes Y no_cumple a la vez: el pendiente manda', () => {
    expect(puedePresentar(conEstados('pendiente', 'no_cumple'), OVERRIDE)).toBe(false)
  })
})

describe('puedePresentar — con NO_CUMPLE', () => {
  it('CLAVE: sin override, bloquea', () => {
    expect(puedePresentar(conEstados('cumple', 'no_cumple'))).toBe(false)
    expect(puedePresentar(conEstados('cumple', 'no_cumple'), null)).toBe(false)
  })

  it('CLAVE: con override con motivo escrito, pasa', () => {
    expect(puedePresentar(conEstados('cumple', 'no_cumple'), {
      por: 'uid-pedro', en: AHORA,
      motivo: 'La entidad aceptó subsanar la experiencia en observaciones',
    })).toBe(true)
  })

  it('RECHAZO: un override con motivo vacío no sirve — el motivo ES el override', () => {
    expect(puedePresentar(conEstados('no_cumple'), { por: 'uid-pedro', en: AHORA, motivo: '' }))
      .toBe(false)
    expect(puedePresentar(conEstados('no_cumple'), { por: 'uid-pedro', en: AHORA, motivo: '  ' }))
      .toBe(false)
  })

  it('RECHAZO: un override sin autor tampoco', () => {
    expect(puedePresentar(conEstados('no_cumple'), { por: '', en: AHORA, motivo: 'porque sí' }))
      .toBe(false)
  })

  it('varios no_cumplen se cubren con UN override — es la decisión, no el conteo', () => {
    expect(puedePresentar(conEstados('no_cumple', 'no_cumple', 'cumple'), {
      por: 'uid-pedro', en: AHORA, motivo: 'Dos requisitos subsanables, se presenta',
    })).toBe(true)
  })
})

describe('puedePresentar — el camino limpio', () => {
  it('todo cumple ⇒ pasa, con o sin override', () => {
    expect(puedePresentar(conEstados('cumple', 'cumple'))).toBe(true)
    expect(puedePresentar(conEstados('cumple'), { por: 'x', en: AHORA, motivo: 'm' })).toBe(true)
  })

  it('cumple + no_aplica ⇒ pasa: lo que no aplica no falta', () => {
    expect(puedePresentar(conEstados('cumple', 'no_aplica', 'no_aplica'))).toBe(true)
  })

  it('el gate y el resumen coinciden cuando no hay override', () => {
    const listas: EstadoRequisito[][] = [
      ['cumple'], ['pendiente'], ['no_cumple'], ['cumple', 'no_aplica'],
      ['cumple', 'pendiente', 'no_cumple'], [],
    ]
    for (const l of listas) {
      const lista = conEstados(...l)
      expect(puedePresentar(lista), l.join('+')).toBe(resumenCumplimiento(lista).listoParaPresentar)
    }
  })
})

describe('puedePresentar — el CHECKLIST VACÍO bloquea', () => {
  const OVERRIDE = { por: 'uid-pedro', en: AHORA, motivo: 'La dirección asume el riesgo' }

  it('CLAVE: vacío ⇒ false', () => {
    expect(puedePresentar([])).toBe(false)
  })

  it('CLAVE: vacío CON override ⇒ sigue false', () => {
    // Mismo tratamiento que el pendiente del caso COPNIA: no hay nada que
    // autorizar cuando todavía no se sabe qué pide el pliego. Un override
    // aquí sería una firma en blanco.
    expect(puedePresentar([], OVERRIDE)).toBe(false)
  })

  it('CLAVE: un requisito en cumple ⇒ true', () => {
    expect(puedePresentar(conEstados('cumple'))).toBe(true)
  })

  it('el motivo es SIN_REQUISITOS y NO cede ante override', () => {
    expect(bloqueoPresentacion([])!.codigo).toBe('SIN_REQUISITOS')
    expect(bloqueoPresentacion([], OVERRIDE)!.codigo).toBe('SIN_REQUISITOS')
    expect(BLOQUEOS_CON_OVERRIDE).not.toContain('SIN_REQUISITOS')
  })
})

describe('bloqueoPresentacion — el motivo tipificado', () => {
  const OVERRIDE = { por: 'uid-pedro', en: AHORA, motivo: 'Subsanable en observaciones' }

  it('null cuando se puede presentar', () => {
    expect(bloqueoPresentacion(conEstados('cumple'))).toBeNull()
    expect(bloqueoPresentacion(conEstados('cumple', 'no_cumple'), OVERRIDE)).toBeNull()
  })

  it('los tres códigos son alcanzables', () => {
    const vistos = [
      bloqueoPresentacion([])!.codigo,
      bloqueoPresentacion(conEstados('pendiente'))!.codigo,
      bloqueoPresentacion(conEstados('no_cumple'))!.codigo,
    ]
    expect(vistos).toEqual(['SIN_REQUISITOS', 'PENDIENTES', 'NO_CUMPLEN'])
    expect([...MOTIVOS_BLOQUEO_PRESENTACION].sort()).toEqual([...vistos].sort())
  })

  it('precedencia: el vacío manda sobre todo lo demás (no hay nada más que decir)', () => {
    expect(bloqueoPresentacion([])!.codigo).toBe('SIN_REQUISITOS')
  })

  it('precedencia: el pendiente manda sobre el no_cumple', () => {
    // Es también el que hay que resolver primero.
    expect(bloqueoPresentacion(conEstados('pendiente', 'no_cumple'))!.codigo).toBe('PENDIENTES')
  })

  it('SOLO NO_CUMPLEN cede ante override — los otros dos son ignorancia, no riesgo', () => {
    expect([...BLOQUEOS_CON_OVERRIDE]).toEqual(['NO_CUMPLEN'])
    expect(bloqueoPresentacion(conEstados('pendiente'), OVERRIDE)!.codigo).toBe('PENDIENTES')
    expect(bloqueoPresentacion(conEstados('no_cumple'), OVERRIDE)).toBeNull()
  })

  it('el gate y el motivo salen de la MISMA fuente', () => {
    const listas: EstadoRequisito[][] = [
      [], ['cumple'], ['pendiente'], ['no_cumple'], ['cumple', 'no_aplica'],
      ['pendiente', 'no_cumple'],
    ]
    for (const l of listas) {
      for (const o of [undefined, OVERRIDE]) {
        const lista = conEstados(...l)
        expect(puedePresentar(lista, o), `[${l.join('+')}] override=${!!o}`)
          .toBe(bloqueoPresentacion(lista, o) === null)
      }
    }
  })
})

describe('motivoBloqueoPresentacion — el botón gris dice QUÉ falta', () => {
  it('null cuando se puede presentar', () => {
    expect(motivoBloqueoPresentacion(conEstados('cumple'))).toBeNull()
  })

  it('el vacío lo dice con esas palabras', () => {
    expect(motivoBloqueoPresentacion([])).toContain('vacío')
  })

  it('nombra los pendientes, en singular y plural', () => {
    expect(motivoBloqueoPresentacion(conEstados('pendiente'))).toBe('1 requisito sin verificar')
    expect(motivoBloqueoPresentacion(conEstados('pendiente', 'pendiente')))
      .toBe('2 requisitos sin verificar')
  })

  it('nombra los no_cumple y apunta al motivo escrito', () => {
    const m = motivoBloqueoPresentacion(conEstados('no_cumple'))!
    expect(m).toContain('1 requisito que no cumple')
    expect(m).toContain('motivo escrito')
  })

  it('con pendientes Y no_cumple, reporta lo que bloquea de verdad', () => {
    expect(motivoBloqueoPresentacion(conEstados('pendiente', 'no_cumple')))
      .toContain('sin verificar')
  })
})
