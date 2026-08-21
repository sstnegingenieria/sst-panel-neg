// Registro del criterio del semáforo (`configuracion/semaforo_versiones`):
// semilla, helpers puros y — lo importante — que el texto de la semilla en TS
// y el que escribe el script de siembra sean EL MISMO carácter por carácter.
import { describe, it, expect } from 'vitest'
import type { Timestamp } from 'firebase/firestore'
import {
  construirSemillaSemaforoVersiones, versionVigente, registroCoherente,
  DEFINICION_V1_0, MOTIVO_V1_0, CALIBRACION_V1_0, LIMITACIONES_V1_0, VERSION_INICIAL,
  type RegistroSemaforoVersiones, type VersionCriterioSemaforo,
} from '../semaforoVersiones'
import { SEMAFORO_VERSION } from '../../../utils/sigp/semaforo'
import SEMILLA_JSON from '../../../../functions/scripts/semaforo-v1.0.json'

const ts = (ms: number) => ({ toMillis: () => ms, seconds: ms / 1000 } as unknown as Timestamp)
const AHORA = ts(1_000_000)
const DESPUES = ts(2_000_000)

describe('semilla de v1.0', () => {
  it('construye el documento con la forma esperada', () => {
    const doc = construirSemillaSemaforoVersiones('uid-giovanny', AHORA)
    expect(doc.version_actual).toBe('v1.0')
    expect(Object.keys(doc.versiones)).toEqual(['v1.0'])

    const v = doc.versiones['v1.0']
    expect(v.vigente_desde).toBe(AHORA)
    expect(v.vigente_hasta).toBeNull()
    expect(v.autor_uid).toBe('uid-giovanny')
    expect(v.definicion).toBe(DEFINICION_V1_0)
    expect(v.motivo).toBe(MOTIVO_V1_0)
    expect(v.calibracion).toBe(CALIBRACION_V1_0)
    expect(v.limitaciones).toBe(LIMITACIONES_V1_0)
  })

  it('la semilla nace coherente', () => {
    expect(registroCoherente(construirSemillaSemaforoVersiones('uid-x', AHORA))).toBe(true)
  })

  it('es pura: mismos argumentos, mismo documento', () => {
    expect(construirSemillaSemaforoVersiones('uid-x', AHORA))
      .toEqual(construirSemillaSemaforoVersiones('uid-x', AHORA))
  })

  it('la definición registra explícitamente que NO hay banda de presupuesto', () => {
    expect(DEFINICION_V1_0).toContain('Sin banda de presupuesto')
  })

  it('el motivo cita la calibración de 2025 con sus números', () => {
    expect(MOTIVO_V1_0).toContain('32 licitaciones presentadas en 2025')
    expect(MOTIVO_V1_0).toContain('3 de 3')
    expect(MOTIVO_V1_0).toContain('12 propuestas sin retorno')
  })

  it('la calibración nombra el registro fuente y su fecha', () => {
    expect(CALIBRACION_V1_0).toContain('21-ago-2026')
    expect(CALIBRACION_V1_0).toContain('CM-FT-CPG-26')
    expect(CALIBRACION_V1_0).toContain('PROCESOS 2024 2026.xlsx')
  })

  it('la calibración deja los números de la medición auditables', () => {
    expect(CALIBRACION_V1_0).toContain('164 procesos seguidos')
    expect(CALIBRACION_V1_0).toContain('32 presentados')
    expect(CALIBRACION_V1_0).toContain('3 adjudicados')
    expect(CALIBRACION_V1_0).toContain('20 de 32')
    expect(CALIBRACION_V1_0).toContain('15,0%')
  })

  it('la calibración documenta las tres bandas descartadas con su costo', () => {
    // El punto entero del criterio: la banda no se omitió, se midió y se
    // descartó. Sin este rastro, un revisor futuro la reintroduce de buena fe.
    expect(CALIBRACION_V1_0).toContain('$20–200M')
    expect(CALIBRACION_V1_0).toContain('$25–160M')
    expect(CALIBRACION_V1_0).toContain('$30–160M')
    expect(CALIBRACION_V1_0).toContain('6.011.508')
    expect(CALIBRACION_V1_0).toContain('11,1–13,3%')
  })

  it('la calibración cita el contraste externo y deja el pendiente del SGI a la vista', () => {
    expect(CALIBRACION_V1_0).toContain('SECOP II')
    expect(CALIBRACION_V1_0).toContain('jbjy-vk9h')
    expect(CALIBRACION_V1_0).toContain('p6dx-8zbt')
    expect(CALIBRACION_V1_0).toContain('PENDIENTE')
    expect(CALIBRACION_V1_0).toContain('Listado Maestro del SGI')
  })
})

describe('sincronía TS <-> script de siembra', () => {
  it('la versión coincide', () => {
    expect(VERSION_INICIAL).toBe(SEMILLA_JSON.version)
  })

  it('los cuatro textos son idénticos carácter por carácter', () => {
    expect(DEFINICION_V1_0).toBe(SEMILLA_JSON.definicion)
    expect(MOTIVO_V1_0).toBe(SEMILLA_JSON.motivo)
    expect(CALIBRACION_V1_0).toBe(SEMILLA_JSON.calibracion)
    expect(LIMITACIONES_V1_0).toBe(SEMILLA_JSON.limitaciones)
  })

  it('la versión de la semilla es la que emite el motor hoy', () => {
    // Si alguien sube SEMAFORO_VERSION sin registrar la versión nueva en el
    // registro, este test cae: es el recordatorio de que un criterio nuevo se
    // documenta, no solo se codifica (invariante 5 por el otro extremo).
    expect(VERSION_INICIAL).toBe(SEMAFORO_VERSION)
  })
})

describe('limitaciones — lo que la medición NO cubre', () => {
  it('declara la ventana validada y el año que NO lo está', () => {
    expect(LIMITACIONES_V1_0).toContain('2022, 2024, 2025 y 2026')
    expect(LIMITACIONES_V1_0).toContain('NO está validado sobre 2023')
    expect(LIMITACIONES_V1_0).toContain('año sin registro interno')
  })

  it('nombra las tres adjudicaciones de 2023 que v1.0 habría marcado en rojo', () => {
    // El dato más incómodo del registro, y por eso el que más importa que
    // esté escrito: el criterio vigente habría bloqueado tres contratos reales.
    expect(LIMITACIONES_V1_0).toContain('Selección Abreviada de Menor Cuantía')
    expect(LIMITACIONES_V1_0).toContain('DESAJ Cundinamarca-Amazonas ($315,3M)')
    expect(LIMITACIONES_V1_0).toContain('CNSC ($67,1M)')
    expect(LIMITACIONES_V1_0).toContain('INM ($101,8M)')
    expect(LIMITACIONES_V1_0).toContain('habría marcado en rojo')
  })

  it('registra la evidencia de competencia que sostiene la hipótesis', () => {
    expect(LIMITACIONES_V1_0).toContain('2, 3 y 5 ofertas competidoras')
    expect(LIMITACIONES_V1_0).toContain('4, 7 y 8')
    expect(LIMITACIONES_V1_0).toContain('16 o más menores cuantías con cero adjudicaciones')
  })

  it('deja planteada la v1.1 sin darla por cierta', () => {
    expect(LIMITACIONES_V1_0).toContain('Hipótesis pendiente de medir')
    expect(LIMITACIONES_V1_0).toContain('v1.1')
    expect(LIMITACIONES_V1_0).toContain('nivel de competencia y la presencia de sorteo')
  })

  it('CLAVE: el rojo NO es bloqueo absoluto — la escotilla queda escrita', () => {
    // Coherente con la invariante 3 de licitacion.ts: el portero deja pasar
    // el rojo cuando hay `override_manual` con motivo.
    expect(LIMITACIONES_V1_0).toContain('override_manual con motivo escrito')
    expect(LIMITACIONES_V1_0).toContain('no por bloqueo absoluto')
  })
})

describe('versionVigente', () => {
  const v = (extra?: Partial<VersionCriterioSemaforo>): VersionCriterioSemaforo => ({
    vigente_desde: AHORA, vigente_hasta: null,
    definicion: 'd', motivo: 'm', autor_uid: 'u', calibracion: 'c', limitaciones: 'l',
    ...extra,
  })

  it('devuelve la versión que declara version_actual', () => {
    const r: RegistroSemaforoVersiones = {
      versiones: { 'v1.0': v({ definicion: 'vieja', vigente_hasta: DESPUES }), 'v2.0': v() },
      version_actual: 'v2.0',
    }
    expect(versionVigente(r)!.definicion).toBe('d')
  })

  it('null si version_actual apunta a una versión que no existe', () => {
    const r: RegistroSemaforoVersiones = { versiones: { 'v1.0': v() }, version_actual: 'v9.9' }
    expect(versionVigente(r)).toBeNull()
  })
})

describe('registroCoherente', () => {
  const v = (hasta: Timestamp | null): VersionCriterioSemaforo => ({
    vigente_desde: AHORA, vigente_hasta: hasta,
    definicion: 'd', motivo: 'm', autor_uid: 'u', calibracion: 'c', limitaciones: 'l',
  })

  it('una sola versión abierta y es la actual → coherente', () => {
    expect(registroCoherente({
      versiones: { 'v1.0': v(DESPUES), 'v2.0': v(null) },
      version_actual: 'v2.0',
    })).toBe(true)
  })

  it('RECHAZO: version_actual no existe en el mapa', () => {
    expect(registroCoherente({
      versiones: { 'v1.0': v(null) }, version_actual: 'v2.0',
    })).toBe(false)
  })

  it('RECHAZO: la actual está cerrada — no hay criterio vigente', () => {
    expect(registroCoherente({
      versiones: { 'v1.0': v(DESPUES) }, version_actual: 'v1.0',
    })).toBe(false)
  })

  it('RECHAZO: dos versiones abiertas — no responde con qué criterio se clasifica hoy', () => {
    expect(registroCoherente({
      versiones: { 'v1.0': v(null), 'v2.0': v(null) },
      version_actual: 'v2.0',
    })).toBe(false)
  })

  it('RECHAZO: registro vacío', () => {
    expect(registroCoherente({ versiones: {}, version_actual: 'v1.0' })).toBe(false)
  })
})
