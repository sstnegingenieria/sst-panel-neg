// Aval SST por formatos FÍSICOS — validación y patch builder puros.
// El contrato: sin registro de custodia (responsable, ubicación, fecha,
// formatos, motivo) Y sin la declaración marcada NO hay aval; el mismo
// predicado habilita el botón y valida el guardado; 'otro' exige nombrar el
// formato propio del cliente; el registro se copia al historial. NO hay
// escaneo: los formatos no se suben.
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  AYUDA_UBICACION, COLUMNAS_AVALES_FISICOS, TEXTOS_DECLARACION, VERSION_DECLARACION_VIGENTE, VERSIONES_DECLARACION, textoDeclaracionDe, LEYENDA_AVAL_FISICO, MAX_TEXTO_AVAL, MAX_TIPOS_FORMATO, MIN_MOTIVO_FISICO,
  MIN_UBICACION, OPCIONES_TIPO_FORMATO, PLACEHOLDER_UBICACION, estaAvaladoEnFisico, filaAvalFisico, filasAvalesFisicos, rastroCustodia,
  TEXTO_DECLARACION, TIPO_FORMATO_OTRO,
  avalFisicoValido, esAvalFisico, etiquetasFormatosAval,
  fechaFormatosATimestampMs, motivoHistorialFisico, patchAvalFisico, resumenCustodiaFisica, validarAvalFisico,
} from '../avalFisico'
import type { EntradaAvalFisico } from '../avalFisico'
import { puedeAvalarFisicoUI, puedeMarcarSstGateUI } from '../permisos'
import { TIPO_LABELS } from '../../formulario'
import type { SstGateProyecto } from '../proyecto'
import type { VerificacionSst } from '../verificacionSst'
import { libroAvalesFisicos } from '../../../utils/sigp/avalesFisicosExcel'
import * as XLSX from 'xlsx'

const HOY = new Date('2026-10-13T15:00:00')

const completa = (extra: Partial<EntradaAvalFisico> = {}): EntradaAvalFisico => ({
  responsable_archivo: 'Marcela Torres',
  ubicacion: 'Archivador 3, carpeta Claro 2026',
  fecha_formatos: '2026-10-10',
  tipos_formato: ['ats', 'permiso_alturas'],
  motivo: 'El cliente exige los formatos SST impresos y firmados',
  declaracion: true,
  ...extra,
})

describe('validarAvalFisico — sin custodia y declaración no hay aval', () => {
  it('una entrada completa valida', () => {
    expect(validarAvalFisico(completa(), HOY)).toEqual({})
    expect(avalFisicoValido(completa(), HOY)).toBe(true)
  })

  it('SIN la declaración marcada NO valida (el botón no se habilita)', () => {
    expect(validarAvalFisico(completa({ declaracion: false }), HOY).declaracion).toBeTruthy()
    expect(avalFisicoValido(completa({ declaracion: false }), HOY)).toBe(false)
  })

  it('cada campo de custodia ausente o vacío bloquea', () => {
    expect(avalFisicoValido(completa({ responsable_archivo: '' }), HOY)).toBe(false)
    expect(avalFisicoValido(completa({ responsable_archivo: 'ab' }), HOY)).toBe(false)
    expect(avalFisicoValido(completa({ responsable_archivo: '     ' }), HOY)).toBe(false)
    expect(avalFisicoValido(completa({ ubicacion: '' }), HOY)).toBe(false)
    expect(avalFisicoValido(completa({ ubicacion: 'ab' }), HOY)).toBe(false)
    expect(avalFisicoValido(completa({ ubicacion: 'oficina' }), HOY)).toBe(false)           // genérico y corto
    expect(avalFisicoValido(completa({ ubicacion: '123456789' }), HOY)).toBe(false)         // 9 < 10
    expect(avalFisicoValido(completa({ ubicacion: '1234567890' }), HOY)).toBe(true)         // 10
    expect(avalFisicoValido(completa({ fecha_formatos: '' }), HOY)).toBe(false)
    expect(avalFisicoValido(completa({ tipos_formato: [] }), HOY)).toBe(false)
    expect(avalFisicoValido(completa({ motivo: '' }), HOY)).toBe(false)
  })

  it('el motivo tiene longitud mínima — un "x" no es evidencia', () => {
    expect(avalFisicoValido(completa({ motivo: 'x'.repeat(MIN_MOTIVO_FISICO - 1) }), HOY)).toBe(false)
    expect(avalFisicoValido(completa({ motivo: 'x'.repeat(MIN_MOTIVO_FISICO) }), HOY)).toBe(true)
    expect(avalFisicoValido(completa({ motivo: ' '.repeat(20) }), HOY)).toBe(false)
  })

  it('los textos tienen tope (espejo de la regla)', () => {
    expect(avalFisicoValido(completa({ motivo: 'x'.repeat(MAX_TEXTO_AVAL) }), HOY)).toBe(true)
    expect(avalFisicoValido(completa({ motivo: 'x'.repeat(MAX_TEXTO_AVAL + 1) }), HOY)).toBe(false)
    expect(avalFisicoValido(completa({ ubicacion: 'x'.repeat(MAX_TEXTO_AVAL + 1) }), HOY)).toBe(false)
  })

  it('máximo de formatos por aval (espejo de la regla)', () => {
    const muchos = Array.from({ length: MAX_TIPOS_FORMATO }, (_, i) => `t${i}`)
    expect(avalFisicoValido(completa({ tipos_formato: muchos }), HOY)).toBe(true)
    expect(avalFisicoValido(completa({ tipos_formato: [...muchos, 'extra'] }), HOY)).toBe(false)
  })

  it('la fecha de los formatos no puede estar en el futuro ni tener más de 2 años', () => {
    expect(avalFisicoValido(completa({ fecha_formatos: '2026-10-14' }), HOY)).toBe(false)
    expect(avalFisicoValido(completa({ fecha_formatos: '2024-10-01' }), HOY)).toBe(false)
    expect(avalFisicoValido(completa({ fecha_formatos: '2025-10-13' }), HOY)).toBe(true)
  })

  it('el día de HOY es válido a cualquier hora (medianoche local, no mediodía)', () => {
    const temprano = new Date('2026-10-13T06:00:00')
    expect(avalFisicoValido(completa({ fecha_formatos: '2026-10-13' }), temprano)).toBe(true)
  })

  it("'otro' exige nombrar el formato del cliente", () => {
    const base = completa({ tipos_formato: ['ats', TIPO_FORMATO_OTRO] })
    expect(validarAvalFisico(base, HOY).formato_otro).toBeTruthy()
    expect(avalFisicoValido({ ...base, formato_otro: 'Permiso de trabajo Claro' }, HOY)).toBe(true)
    expect(avalFisicoValido(completa({ tipos_formato: ['ats'] }), HOY)).toBe(true)
  })
})

describe('opciones de formato y textos', () => {
  it('son los 14 tipos de la app + otro', () => {
    expect(OPCIONES_TIPO_FORMATO).toHaveLength(Object.keys(TIPO_LABELS).length + 1)
    expect(OPCIONES_TIPO_FORMATO[OPCIONES_TIPO_FORMATO.length - 1].valor).toBe(TIPO_FORMATO_OTRO)
    expect(Object.keys(TIPO_LABELS)).toHaveLength(14)
  })

  it('etiquetas legibles; "otro" muestra el texto libre', () => {
    expect(etiquetasFormatosAval({ tipos_formato: ['ats', 'otro'], formato_otro: 'Formato Claro' }))
      .toEqual(['ATS', 'Formato Claro'])
  })

  it('la declaración y la leyenda dicen "disponibles para auditoría" (lo que el aval afirma)', () => {
    expect(TEXTO_DECLARACION).toContain('disponibles para auditoría')
    expect(LEYENDA_AVAL_FISICO).toBe('originales en archivo, disponibles para auditoría')
  })
})

describe('patchAvalFisico — el write exacto', () => {
  const ahoraSrv = Symbol('serverTimestamp')
  const ahoraCli = Timestamp.fromMillis(1760000000000)
  const fechaF = Timestamp.fromMillis(fechaFormatosATimestampMs('2026-10-10'))

  it('null si la entrada no valida, sin declaración, o no hay uid', () => {
    expect(patchAvalFisico(completa({ ubicacion: '' }), 'ingrid', 'ingrid@test.dev', 'pendiente', ahoraSrv, ahoraCli, fechaF, HOY)).toBeNull()
    expect(patchAvalFisico(completa({ declaracion: false }), 'ingrid', 'ingrid@test.dev', 'pendiente', ahoraSrv, ahoraCli, fechaF, HOY)).toBeNull()
    expect(patchAvalFisico(completa(), '', 'ingrid@test.dev', 'pendiente', ahoraSrv, ahoraCli, fechaF, HOY)).toBeNull()
  })

  it('arma sst_gate físico: al_dia + origen + custodia + declaración, fecha del SERVIDOR', () => {
    const p = patchAvalFisico(completa(), 'ingrid', 'ingrid@test.dev', 'pendiente', ahoraSrv, ahoraCli, fechaF, HOY)!
    const g = p.sst_gate as Record<string, any>
    expect(g.estado).toBe('al_dia')
    expect(g.origen).toBe('fisico')
    expect(g.verificado_por).toBe('ingrid')
    expect(g.fecha).toBe(ahoraSrv)
    expect(g.fisico.responsable_archivo).toBe('Marcela Torres')
    expect(g.fisico.ubicacion).toBe('Archivador 3, carpeta Claro 2026')
    expect(g.fisico.declaracion).toBe(true)
    expect(g.fisico.registrado_por).toBe('ingrid')
    expect(g.fisico.fecha_registro).toBe(ahoraSrv)
    expect(g.fisico.fecha_formatos).toBe(fechaF)
    expect(g.fisico.tipos_formato).toEqual(['ats', 'permiso_alturas'])
    // sin 'otro' no se arrastra formato_otro; y NUNCA hay escaneo
    expect('formato_otro' in g.fisico).toBe(false)
    expect('soporte_url' in g.fisico).toBe(false)
    expect('observacion' in g).toBe(false)
  })

  it('la entrada del historial COPIA el registro (con Timestamp real, apta para arrayUnion)', () => {
    const p = patchAvalFisico(completa(), 'ingrid', 'ingrid@test.dev', 'con_novedad', ahoraSrv, ahoraCli, fechaF, HOY)!
    expect(p.entradaHistorial.de).toBe('con_novedad')
    expect(p.entradaHistorial.a).toBe('al_dia')
    expect(p.entradaHistorial.por).toBe('ingrid')
    expect(p.entradaHistorial.fecha).toBe(ahoraCli)
    expect(p.entradaHistorial.fisico?.responsable_archivo).toBe('Marcela Torres')
    expect(p.entradaHistorial.fisico?.declaracion).toBe(true)
    expect(p.entradaHistorial.fisico?.fecha_registro).toBe(ahoraCli)
    expect(p.entradaHistorial.motivo).toContain('FORMATOS FÍSICOS')
    expect(p.entradaHistorial.motivo).toContain('Marcela Torres')
    expect(p.entradaHistorial.motivo).toContain(LEYENDA_AVAL_FISICO)
  })

  it("la copia del historial es IDÉNTICA al gate salvo fecha_registro (lo que exige la regla)", () => {
    const p = patchAvalFisico(completa({ tipos_formato: ['otro'], formato_otro: 'X formato' }), 'ingrid', 'ingrid@test.dev', 'pendiente', ahoraSrv, ahoraCli, fechaF, HOY)!
    const { fecha_registro: _a, ...gate } = (p.sst_gate as any).fisico
    const { fecha_registro: _b, ...copia } = p.entradaHistorial.fisico as any
    expect(copia).toEqual(gate)
  })

  it("'otro' viaja con su texto libre", () => {
    const p = patchAvalFisico(
      completa({ tipos_formato: [TIPO_FORMATO_OTRO], formato_otro: ' Formato Claro ' }),
      'ingrid', 'ingrid@test.dev', 'pendiente', ahoraSrv, ahoraCli, fechaF, HOY)!
    expect((p.sst_gate as any).fisico.formato_otro).toBe('Formato Claro')
  })
})

describe('esAvalFisico y resumen — el badge y el tooltip', () => {
  const g = (extra: Partial<SstGateProyecto>): SstGateProyecto => ({
    estado: 'al_dia', verificado_por: 'u', fecha: Timestamp.fromMillis(1), ...extra,
  })
  it('solo con origen físico Y registro presente', () => {
    expect(esAvalFisico(undefined)).toBe(false)
    expect(esAvalFisico(g({}))).toBe(false)                       // histórico = app
    expect(esAvalFisico(g({ origen: 'app' }))).toBe(false)
    expect(esAvalFisico(g({ origen: 'fisico' }))).toBe(false)     // sin registro no es físico
  })
  it('motivoHistorialFisico y resumen nombran responsable y ubicación', () => {
    const f = { responsable_archivo: ' Ana ', ubicacion: ' Bogotá ', motivo: ' por el cliente ', tipos_formato: ['ats'] }
    expect(motivoHistorialFisico(f)).toContain('Ana')
    expect(motivoHistorialFisico(f)).toContain('Bogotá')
    expect(resumenCustodiaFisica(f)).toContain('Responsable del archivo: ' + ' Ana ')
    expect(resumenCustodiaFisica(f)).toContain('ATS')
  })
})

describe('permisos — la vía física es SOLO de gestion_integral', () => {
  it('únicamente gestion_integral avala físico', () => {
    expect(puedeAvalarFisicoUI('gestion_integral')).toBe(true)
    for (const r of ['sst', 'residente_sst', 'admin', 'gerencia_general', 'gerencia_administrativa',
      'director_proyectos', 'auxiliar_proyectos', 'operacion_comercial', 'residente_obra', 'tecnico', undefined]) {
      expect(puedeAvalarFisicoUI(r), String(r)).toBe(false)
    }
  })

  it('el aval por app conserva su helper (sst/residente_sst/gestion_integral)', () => {
    expect(puedeMarcarSstGateUI('sst')).toBe(true)
    expect(puedeMarcarSstGateUI('residente_sst')).toBe(true)
    expect(puedeMarcarSstGateUI('gestion_integral')).toBe(true)
    expect(puedeMarcarSstGateUI('admin')).toBe(false)
  })
})


describe('ubicación localizable — guía + longitud mínima', () => {
  it('mínimo 10, con placeholder y ayuda orientados a un lugar localizable', () => {
    expect(MIN_UBICACION).toBe(10)
    expect(PLACEHOLDER_UBICACION).toBe('ej. Archivador 3, carpeta Claro 2026')
    expect(AYUDA_UBICACION).toBe('Indica un lugar localizable: mueble, carpeta, año.')
    expect(validarAvalFisico(completa({ ubicacion: 'oficina' }), HOY).ubicacion).toContain('10')
  })
})

// ── Lista de auditoría ───────────────────────────────────────────────────────

const ts = (iso: string) => Timestamp.fromDate(new Date(iso))
const fisicoBase = (extra: Record<string, unknown> = {}) => ({
  responsable_archivo: 'Marcela Torres', ubicacion: 'Archivador 3, carpeta Claro 2026',
  fecha_formatos: ts('2026-10-10T05:00:00Z'), tipos_formato: ['ats', 'otro'], formato_otro: 'Permiso Claro',
  motivo: 'El cliente exige los formatos impresos', declaracion: true as const,
  declaracion_version: 'SST-FIS-v1', declaracion_email: 'ingrid@test.dev', registrado_por: 'ingrid', fecha_registro: ts('2026-10-13T15:00:00Z'), ...extra,
})
const ver = (id: string, extra: Partial<VerificacionSst> = {}): VerificacionSst => ({
  proyecto_id: id, consecutivo: `PRY-2026-${id}`, nombre_sitio: `Sitio ${id}`, codigo_sitio_cliente: 'C',
  cliente_nombre: 'Cliente B', contratista_id: 'c1', contratista_nombre: 'Contratista X',
  estado: 'facturado', obra_id: `pry_${id}`, ...extra,
})
const gateFisico = (extra: Record<string, unknown> = {}): SstGateProyecto => ({
  estado: 'al_dia', verificado_por: 'ingrid', fecha: ts('2026-10-13T15:00:00Z'), origen: 'fisico',
  fisico: fisicoBase(extra),
})

describe('lista de auditoría — avales en físico', () => {
  it('solo los de origen físico vigente: la cola mixta se filtra', () => {
    const vs = [
      ver('040', { sst_gate: gateFisico() }),
      ver('041', { sst_gate: { estado: 'al_dia', verificado_por: 'u', fecha: ts('2026-10-01T00:00:00Z') } }),  // app
      ver('042'),                                                                                              // pendiente
      ver('043', { sst_gate: { ...gateFisico(), origen: 'app' } }),                                          // origen app
    ]
    expect(vs.filter(estaAvaladoEnFisico).map(v => v.proyecto_id)).toEqual(['040'])
    expect(filasAvalesFisicos(vs)).toHaveLength(1)
  })

  it('la fila trae las columnas que pide el auditor, en orden', () => {
    expect(COLUMNAS_AVALES_FISICOS).toEqual([
      'Proyecto', 'Cliente', 'Sitio', 'Contratista', 'Fecha de los formatos',
      'Responsable del archivo', 'Ubicación', 'Formatos', 'Motivo',
    ])
    const f = filaAvalFisico(ver('040', { sst_gate: gateFisico() }))!
    expect(Object.keys(f)).toEqual([...COLUMNAS_AVALES_FISICOS])
    expect(f.Proyecto).toBe('PRY-2026-040')
    expect(f.Cliente).toBe('Cliente B')
    expect(f.Sitio).toBe('Sitio 040')
    expect(f.Contratista).toBe('Contratista X')
    expect(f['Responsable del archivo']).toBe('Marcela Torres')
    expect(f['Ubicación']).toBe('Archivador 3, carpeta Claro 2026')
    expect(f.Formatos).toBe('ATS, Permiso Claro')
    expect(f.Motivo).toBe('El cliente exige los formatos impresos')
    expect(f['Fecha de los formatos']).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
  })

  it('un proyecto que NO es físico no produce fila', () => {
    expect(filaAvalFisico(ver('041'))).toBeNull()
  })

  it('un aval físico de un proyecto que ya salió de la cola SIGUE en la lista (el auditor lo pide)', () => {
    const liquidado = ver('044', { estado: 'liquidado_contratista', sst_gate: gateFisico() })
    expect(filasAvalesFisicos([liquidado])).toHaveLength(1)
  })

  it('orden: por cliente y luego por proyecto', () => {
    const a = ver('050', { cliente_nombre: 'Zeta', sst_gate: gateFisico() })
    const b = ver('041', { cliente_nombre: 'Alfa', sst_gate: gateFisico() })
    const c = ver('040', { cliente_nombre: 'Alfa', sst_gate: gateFisico() })
    expect(filasAvalesFisicos([a, b, c]).map(f => f.Proyecto)).toEqual(['PRY-2026-040', 'PRY-2026-041', 'PRY-2026-050'])
  })

  it('el libro de Excel tiene la hoja, las columnas y las filas', () => {
    const wb = libroAvalesFisicos(filasAvalesFisicos([ver('040', { sst_gate: gateFisico() })]))
    expect(wb.SheetNames).toEqual(['Avales en físico'])
    const filas = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets['Avales en físico'])
    expect(filas).toHaveLength(1)
    expect(Object.keys(filas[0])).toEqual([...COLUMNAS_AVALES_FISICOS])
    expect(filas[0].Proyecto).toBe('PRY-2026-040')
    expect(filas[0].Ubicación).toBe('Archivador 3, carpeta Claro 2026')
  })

  it('un libro sin avales sigue siendo válido (solo encabezados)', () => {
    const wb = libroAvalesFisicos([])
    expect(wb.SheetNames).toEqual(['Avales en físico'])
  })
})

// ── Rastro de custodia ───────────────────────────────────────────────────────

describe('rastro de custodia — declaración vigente + anteriores', () => {
  const h = (por: string, responsable: string, iso: string) => ({
    de: 'pendiente', a: 'al_dia', por, fecha: ts(iso), motivo: 'm',
    fisico: fisicoBase({ responsable_archivo: responsable, registrado_por: por, fecha_registro: ts(iso) }),
  })
  const appEntry = { de: 'al_dia', a: 'con_novedad', por: 'sofia', fecha: ts('2026-10-14T00:00:00Z'), motivo: 'novedad' }

  it('sin declaraciones físicas en el historial → rastro vacío', () => {
    expect(rastroCustodia(ver('040'))).toEqual([])
    expect(rastroCustodia(ver('040', { historial: [appEntry] }))).toEqual([])
  })

  it('una sola declaración, gate físico → vigente', () => {
    const r = rastroCustodia(ver('040', { sst_gate: gateFisico(), historial: [h('ingrid', 'Marcela Torres', '2026-10-13T15:00:00Z')] }))
    expect(r).toHaveLength(1)
    expect(r[0].vigente).toBe(true)
  })

  it('una corrección: la más reciente es la vigente, la anterior queda como anterior (reciente primero)', () => {
    const r = rastroCustodia(ver('040', {
      sst_gate: gateFisico({ responsable_archivo: 'Nuevo Custodio' }),
      historial: [h('ingrid', 'Marcela Torres', '2026-10-13T15:00:00Z'), h('ingrid', 'Nuevo Custodio', '2026-10-20T15:00:00Z')],
    }))
    expect(r.map(x => x.fisico.responsable_archivo)).toEqual(['Nuevo Custodio', 'Marcela Torres'])
    expect(r.map(x => x.vigente)).toEqual([true, false])
  })

  it('si SST sobrescribió el gate por la rama app, NINGUNA es vigente — todas anteriores', () => {
    const r = rastroCustodia(ver('040', {
      sst_gate: { estado: 'con_novedad', verificado_por: 'sofia', fecha: ts('2026-10-14T00:00:00Z'), observacion: 'x' },
      historial: [h('ingrid', 'Marcela Torres', '2026-10-13T15:00:00Z'), appEntry],
    }))
    expect(r).toHaveLength(1)
    expect(r[0].vigente).toBe(false)
  })

  it('un historial ausente no rompe', () => {
    expect(rastroCustodia({ sst_gate: undefined, historial: undefined })).toEqual([])
  })
})


describe('la leyenda del historial se recorta (la regla limita el motivo de la entrada a 5000)', () => {
  it('tres textos de 2000 caracteres caben holgadamente', () => {
    const largo = 'x'.repeat(2000)
    const m = motivoHistorialFisico({ responsable_archivo: largo, ubicacion: largo, motivo: largo })
    expect(m.length).toBeLessThan(1500)
    expect(m).toContain(LEYENDA_AVAL_FISICO)
  })
  it('un texto corto no se altera', () => {
    expect(motivoHistorialFisico({ responsable_archivo: 'Ana', ubicacion: 'Archivador 3', motivo: 'Exigencia del cliente' }))
      .toContain('Ana (Archivador 3); motivo: Exigencia del cliente')
  })
})


describe('declaración versionada + correo auténtico de quien declara', () => {
  const ahoraSrv = Symbol('serverTimestamp')
  const ahoraCli = Timestamp.fromMillis(1760000000000)
  const fechaF = Timestamp.fromMillis(fechaFormatosATimestampMs('2026-10-10'))
  const HOY2 = new Date('2026-10-13T15:00:00')

  it('el builder liga la versión vigente y el correo (recortado) en el gate Y en la copia del historial', () => {
    const p = patchAvalFisico(completa(), 'ingrid', '  ingrid@neg.com  ', 'pendiente', ahoraSrv, ahoraCli, fechaF, HOY2)!
    expect((p.sst_gate as any).fisico.declaracion_version).toBe(VERSION_DECLARACION_VIGENTE)
    expect((p.sst_gate as any).fisico.declaracion_email).toBe('ingrid@neg.com')
    expect(p.entradaHistorial.fisico?.declaracion_version).toBe('SST-FIS-v1')
    expect(p.entradaHistorial.fisico?.declaracion_email).toBe('ingrid@neg.com')
  })

  it('sin correo de sesión NO hay aval (la regla lo exige igual)', () => {
    expect(patchAvalFisico(completa(), 'ingrid', '', 'pendiente', ahoraSrv, ahoraCli, fechaF, HOY2)).toBeNull()
    expect(patchAvalFisico(completa(), 'ingrid', '   ', 'pendiente', ahoraSrv, ahoraCli, fechaF, HOY2)).toBeNull()
  })

  it('el texto de SST-FIS-v1 está FIJADO: cambiar una palabra exige una versión NUEVA, no editar esta', () => {
    expect(VERSION_DECLARACION_VIGENTE).toBe('SST-FIS-v1')
    expect(TEXTOS_DECLARACION['SST-FIS-v1']).toBe(
      'Declaro que los formatos SST originales están archivados en la ubicación indicada y disponibles para auditoría.')
    expect(TEXTO_DECLARACION).toBe(TEXTOS_DECLARACION[VERSION_DECLARACION_VIGENTE])
  })

  it('la versión vigente es una de las publicadas; las versiones conocidas son las que la regla acepta', () => {
    expect(VERSIONES_DECLARACION).toContain(VERSION_DECLARACION_VIGENTE)
    expect(VERSIONES_DECLARACION).toEqual(['SST-FIS-v1'])   // si agregas una, súmala TAMBIÉN a `declaracion_version in [...]` de firestore.rules
  })

  it('el rastro resuelve el texto por versión y no inventa uno para una versión desconocida', () => {
    expect(textoDeclaracionDe('SST-FIS-v1')).toBe(TEXTO_DECLARACION)
    expect(textoDeclaracionDe('SST-FIS-v9')).toContain('SST-FIS-v9')
    expect(textoDeclaracionDe(undefined)).toContain('desconocida')
  })
})
