import { describe, it, expect } from 'vitest'
import type { Timestamp } from 'firebase/firestore'
import {
  TIPOS_DOCUMENTO_EMPRESA, TIPO_DOCUMENTO_EMPRESA_LABEL,
  CLASIFICACIONES_TAMANO, DIAS_ALERTA_DEFAULT,
  indicadoresConsistentes, diasAlertaValido, tieneArchivo,
  documentoEmpresaConsistente,
} from '../documentoEmpresa'
import type { DocumentoEmpresa, IndicadoresRup } from '../documentoEmpresa'

const ts = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) } as unknown as Timestamp)
const AHORA = ts(1_000_000)

const INDICADORES: IndicadoresRup = {
  fecha_corte: AHORA,
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

const doc = (extra?: Partial<DocumentoEmpresa>): DocumentoEmpresa => ({
  tipo: 'camara_comercio',
  nombre: 'Certificado de existencia y representación',
  numero: 'S-1234567',
  entidad_emisora: 'Cámara de Comercio de Bogotá',
  fecha_expedicion: AHORA,
  fecha_vigencia_hasta: ts(5_000_000),
  dias_alerta: DIAS_ALERTA_DEFAULT,
  archivo_url: 'https://storage/cc.pdf',
  archivo_hash: 'sha256-abc',
  archivo_nombre: 'camara.pdf',
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

describe('vocabularios', () => {
  it('los once tipos tienen label', () => {
    for (const t of TIPOS_DOCUMENTO_EMPRESA) {
      expect(TIPO_DOCUMENTO_EMPRESA_LABEL[t], t).toBeTruthy()
    }
    expect(TIPOS_DOCUMENTO_EMPRESA).toHaveLength(11)
  })

  it('el default de alerta es un mes, igual que el panel SST', () => {
    expect(DIAS_ALERTA_DEFAULT).toBe(30)
  })

  it('las cuatro clasificaciones de tamaño del RUP', () => {
    expect([...CLASIFICACIONES_TAMANO]).toEqual(['micro', 'pequena', 'mediana', 'grande'])
  })
})

describe('indicadoresConsistentes — implicación en UN solo sentido', () => {
  it('un RUP CON indicadores es consistente', () => {
    expect(indicadoresConsistentes(doc({ tipo: 'rup', indicadores: INDICADORES }))).toBe(true)
  })

  it('un RUP SIN indicadores también: el archivo se sube antes de teclear las cifras', () => {
    expect(indicadoresConsistentes(doc({ tipo: 'rup', indicadores: null }))).toBe(true)
  })

  it('RECHAZO: una póliza con indicadores — leería cifras de un papel que no las acredita', () => {
    expect(indicadoresConsistentes(doc({ tipo: 'poliza', indicadores: INDICADORES }))).toBe(false)
  })

  it('RECHAZO: cualquier tipo que no sea rup con indicadores', () => {
    for (const t of TIPOS_DOCUMENTO_EMPRESA.filter(x => x !== 'rup')) {
      expect(indicadoresConsistentes({ tipo: t, indicadores: INDICADORES }), t).toBe(false)
    }
  })

  it('los demás tipos sin indicadores son consistentes', () => {
    for (const t of TIPOS_DOCUMENTO_EMPRESA) {
      expect(indicadoresConsistentes({ tipo: t, indicadores: null }), t).toBe(true)
    }
  })
})

describe('los indicadores del RUP admiten AUSENCIA', () => {
  it('un indicador no reportado se representa con null, no con 0', () => {
    // Un RUP real puede no reportar la cobertura de intereses (sin gastos
    // financieros queda indeterminada). Un 0 diría que el indicador ES cero,
    // que es una afirmación distinta y normalmente falsa.
    const parcial: IndicadoresRup = { ...INDICADORES, cobertura_intereses: null }
    expect(parcial.cobertura_intereses).toBeNull()
    expect(indicadoresConsistentes(doc({ tipo: 'rup', indicadores: parcial }))).toBe(true)
  })
})

describe('diasAlertaValido', () => {
  it('enteros no negativos, incluido el cero', () => {
    for (const n of [0, 1, 30, 60, 365]) expect(diasAlertaValido(n), `${n}`).toBe(true)
  })

  it('RECHAZO: negativo — la alerta llegaría después del vencimiento', () => {
    expect(diasAlertaValido(-1)).toBe(false)
  })

  it('RECHAZO: decimales, NaN e Infinity', () => {
    for (const n of [1.5, NaN, Infinity, -Infinity]) expect(diasAlertaValido(n), `${n}`).toBe(false)
  })
})

describe('tieneArchivo — un documento sin archivo no es evidencia', () => {
  it('con url y nombre, sí', () => {
    expect(tieneArchivo(doc())).toBe(true)
  })

  it('RECHAZO: sin url o sin nombre, incluso con espacios', () => {
    expect(tieneArchivo(doc({ archivo_url: '' }))).toBe(false)
    expect(tieneArchivo(doc({ archivo_nombre: '   ' }))).toBe(false)
  })
})

describe('documentoEmpresaConsistente', () => {
  it('el documento base cumple las cuatro reglas de forma', () => {
    expect(documentoEmpresaConsistente(doc())).toBe(true)
    expect(documentoEmpresaConsistente(doc({ tipo: 'rup', indicadores: INDICADORES }))).toBe(true)
  })

  it('RECHAZO por cada regla, una a una', () => {
    expect(documentoEmpresaConsistente(doc({ tipo: 'rut', indicadores: INDICADORES }))).toBe(false)
    expect(documentoEmpresaConsistente(doc({ dias_alerta: -3 }))).toBe(false)
    expect(documentoEmpresaConsistente(doc({ archivo_url: '' }))).toBe(false)
    expect(documentoEmpresaConsistente(doc({ nombre: '  ' }))).toBe(false)
  })

  it('un documento ARCHIVADO sigue siendo consistente — soft-delete, no corrupción', () => {
    expect(documentoEmpresaConsistente(doc({ activo: false }))).toBe(true)
  })
})
