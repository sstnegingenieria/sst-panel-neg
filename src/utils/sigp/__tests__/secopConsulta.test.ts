/**
 * Constructor de la consulta de ingesta a SECOP II.
 *
 * Igual que el mapeo: NINGÚN test toca la red — el módulo es un constructor
 * puro y acá se rompe `fetch` a propósito para que siga siéndolo.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  ENDPOINT_SECOP, DATASET_SECOP, FAMILIAS_RUP_NEG, DEPARTAMENTOS_INGESTA,
  MODALIDADES_INGESTA, LIMITE_PAGINA, LIMITE_IMPLICITO_PELIGROSO,
  DIAS_SOLAPE_DEFECTO, APP_TOKEN_OBLIGATORIO,
  literalSoql, clausulaIn, clausulaFamilias, clausulaFechas, whereIngesta,
  ORDEN_INGESTA, paramsIngesta, urlIngesta, paramsConteo, urlConteo,
  cabecerasConsulta, ventanaIngesta, paginasPara, verificarCosecha,
  EXPR_FECHA_VENTANA, MODO_INGESTA_DEFECTO, DEPARTAMENTOS_OBSERVADOS,
} from '../secopConsulta'

let fetchOriginal: typeof globalThis.fetch
beforeAll(() => {
  fetchOriginal = globalThis.fetch
  globalThis.fetch = (() => {
    throw new Error('este módulo CONSTRUYE la consulta; no la hace')
  }) as unknown as typeof globalThis.fetch
})
afterAll(() => { globalThis.fetch = fetchOriginal })

describe('endpoint y vocabularios', () => {
  it('apunta al dataset p6dx-8zbt de datos.gov.co', () => {
    expect(DATASET_SECOP).toBe('p6dx-8zbt')
    expect(ENDPOINT_SECOP).toBe('https://www.datos.gov.co/resource/p6dx-8zbt.json')
  })

  it('las familias son las tres del RUP de NEG', () => {
    expect(FAMILIAS_RUP_NEG).toEqual(['V1.7210', 'V1.7215', 'V1.8110'])
  })

  it('los departamentos llevan el texto EXACTO de SECOP, con tilde', () => {
    expect(DEPARTAMENTOS_INGESTA).toEqual(['Distrito Capital de Bogotá', 'Cundinamarca'])
  })

  it('las modalidades son las dos del brief más la variante sin tildes', () => {
    expect(MODALIDADES_INGESTA).toContain('Mínima cuantía')
    expect(MODALIDADES_INGESTA).toContain('Selección Abreviada de Menor Cuantía')
    expect(MODALIDADES_INGESTA)
      .toContain('Seleccion Abreviada Menor Cuantia Sin Manifestacion Interes')
    expect(MODALIDADES_INGESTA).toHaveLength(3)
  })
})

describe('literales de SoQL', () => {
  it('encierra en comillas simples', () => {
    expect(literalSoql('Cundinamarca')).toBe("'Cundinamarca'")
  })

  it('DUPLICA la comilla simple — la única inyección posible acá', () => {
    expect(literalSoql("O'Higgins")).toBe("'O''Higgins'")
    expect(literalSoql("x' OR 1=1 --")).toBe("'x'' OR 1=1 --'")
  })

  it('clausulaIn arma la lista con todo escapado', () => {
    expect(clausulaIn('dep', ['a', "b'c"])).toBe("dep in('a','b''c')")
  })
})

describe('cláusulas del filtro', () => {
  it('familias: un starts_with por familia, en OR', () => {
    expect(clausulaFamilias()).toBe(
      "(starts_with(codigo_principal_de_categoria,'V1.7210')"
      + " OR starts_with(codigo_principal_de_categoria,'V1.7215')"
      + " OR starts_with(codigo_principal_de_categoria,'V1.8110'))",
    )
  })

  it('fechas: la ventana va sobre coalesce(publicación, recepción de ofertas)', () => {
    // 3.785 filas del territorio no tienen fecha de publicación; 2.859 sí
    // tienen recepción. Con el coalesce entran UNA vez en su ventana en vez de
    // entrar en todas las corridas por la vía del IS NULL (B.1b).
    expect(EXPR_FECHA_VENTANA).toBe('coalesce(fecha_de_publicacion_del, fecha_de_recepcion_de)')
    expect(clausulaFechas('2026-01-01', '2026-01-31')).toBe(
      `(${EXPR_FECHA_VENTANA} >= '2026-01-01'`
      + ` AND ${EXPR_FECHA_VENTANA} <= '2026-01-31'`
      + ` OR ${EXPR_FECHA_VENTANA} IS NULL)`,
    )
  })

  it('fechas: las 926 sin NINGUNA fecha entran por el IS NULL, y se puede excluirlas', () => {
    expect(clausulaFechas('2026-01-01', null, false))
      .toBe(`(${EXPR_FECHA_VENTANA} >= '2026-01-01')`)
    expect(clausulaFechas(null, null, false)).toBe(`${EXPR_FECHA_VENTANA} IS NOT NULL`)
    expect(clausulaFechas(null, null, true)).toBeNull()
  })

  it('NO usa fecha_de_ultima_publicaci: está vacía en las 3.785 sin publicación', () => {
    expect(EXPR_FECHA_VENTANA).not.toContain('ultima_publicaci')
    expect(whereIngesta({ desde: '2026-01-01' })).not.toContain('ultima_publicaci')
  })
})

describe('whereIngesta', () => {
  it('el DEFECTO es modo RADAR: la familia sale de la consulta (B.1b)', () => {
    expect(MODO_INGESTA_DEFECTO).toBe('radar')
    const w = whereIngesta()
    // En octubre de 2026 el filtro por familia veía 21 procesos de 2.259: la
    // categoría UNSPC se asigna tarde, así que a nivel de API no se filtra.
    expect(w).not.toContain('codigo_principal_de_categoria')
    expect(w).toContain("departamento_entidad in('Distrito Capital de Bogotá','Cundinamarca'")
    expect(w).toContain("modalidad_de_contratacion in('Mínima cuantía'")
  })

  it('trae los departamentos OBSERVADOS para contarlos (B.1c)', () => {
    // No abrirlos es una decisión; sin traerlos no habría nada que contar.
    const w = whereIngesta()
    expect(w).toContain("'Antioquia'")
    expect(w).toContain("'Boyacá'")
    expect(DEPARTAMENTOS_OBSERVADOS).toEqual(['Antioquia', 'Boyacá'])
    // Y se pueden dejar fuera explícitamente.
    const sin = whereIngesta({ incluir_observados: false })
    expect(sin).not.toContain('Antioquia')
    expect(sin).toContain("'Cundinamarca'")
  })

  it('modo histórico: con las familias en la consulta, para reprocesos', () => {
    const w = whereIngesta({ modo: 'historico' })
    expect(w).toContain('starts_with(codigo_principal_de_categoria,')
    expect(w).toContain('departamento_entidad in(')
    expect(w).toContain('modalidad_de_contratacion in(')
  })

  it('la marca incremental entra como rango sobre la expresión de fecha', () => {
    const w = whereIngesta({ desde: '2026-09-01', hasta: '2026-11-09' })
    expect(w).toContain(`${EXPR_FECHA_VENTANA} >= '2026-09-01'`)
    expect(w).toContain(`${EXPR_FECHA_VENTANA} <= '2026-11-09'`)
  })

  it('las cláusulas se unen con AND, nunca con OR suelto', () => {
    const w = whereIngesta({ desde: '2026-01-01', modo: 'historico' })
    expect(w.split(' AND ').length).toBeGreaterThanOrEqual(4)
    // En radar hay una cláusula menos (no va la familia), pero sigue siendo AND.
    expect(whereIngesta({ desde: '2026-01-01' }).split(' AND ').length).toBeGreaterThanOrEqual(3)
  })
})

describe('parámetros de página — las dos trampas de la cosecha', () => {
  it('$limit SIEMPRE presente: sin él la API devuelve 1.000 filas sin avisar', () => {
    expect(LIMITE_IMPLICITO_PELIGROSO).toBe(1000)
    const p = paramsIngesta()
    expect(p.get('$limit')).toBe(String(LIMITE_PAGINA))
    expect(p.has('$offset')).toBe(true)
  })

  it('$order SIEMPRE presente: paginar con $offset sin orden repite y salta filas', () => {
    expect(paramsIngesta().get('$order')).toBe(ORDEN_INGESTA)
    expect(ORDEN_INGESTA).toContain('id_del_proceso')
  })

  it('el límite se topa en 50.000 aunque pidan más', () => {
    expect(paramsIngesta({ limite: 999_999 }).get('$limit')).toBe('50000')
    expect(paramsIngesta({ limite: 500 }).get('$limit')).toBe('500')
  })

  it('el offset viaja tal cual para paginar', () => {
    expect(paramsIngesta({ offset: 100_000 }).get('$offset')).toBe('100000')
  })

  it('el conteo usa EL MISMO where que la cosecha', () => {
    const o = { desde: '2026-01-01', modo: 'radar' as const }
    expect(paramsConteo(o).get('$where')).toBe(paramsIngesta(o).get('$where'))
    expect(paramsConteo(o).get('$select')).toBe('count(1) as total')
  })
})

describe('codificación de la URL — la tilde que devolvía cero filas', () => {
  it('los acentos salen percent-encoded en UTF-8', () => {
    const u = urlIngesta()
    // 'á' = C3 A1 en UTF-8. Si saliera en Latin-1 (E1) el literal no coincide
    // con el dato y la consulta devuelve CERO FILAS SIN ERROR.
    expect(u).toContain('%C3%A1')
    expect(u).not.toMatch(/%E1/)
  })

  it('la URL se vuelve a leer idéntica: el where sobrevive el viaje', () => {
    const esperado = whereIngesta({ desde: '2026-10-01' })
    const u = new URL(urlIngesta({ desde: '2026-10-01' }))
    expect(u.searchParams.get('$where')).toBe(esperado)
    expect(u.origin + u.pathname).toBe(ENDPOINT_SECOP)
  })

  it('urlConteo apunta al mismo recurso', () => {
    expect(urlConteo().startsWith(ENDPOINT_SECOP + '?')).toBe(true)
  })
})

describe('app token', () => {
  it('no es obligatorio para funcionar — las mediciones se hicieron anónimas', () => {
    expect(APP_TOKEN_OBLIGATORIO).toBe(false)
    expect(cabecerasConsulta()).toEqual({ Accept: 'application/json' })
    expect(cabecerasConsulta(null)).not.toHaveProperty('X-App-Token')
    expect(cabecerasConsulta('   ')).not.toHaveProperty('X-App-Token')
  })

  it('cuando hay token va en la CABECERA, no en el query string', () => {
    const h = cabecerasConsulta('tok-abc123')
    expect(h['X-App-Token']).toBe('tok-abc123')
    // Socrata también acepta $$app_token en la URL; las URLs quedan en logs.
    expect(urlIngesta()).not.toContain('app_token')
    expect(urlIngesta()).not.toContain('tok-abc123')
  })
})

describe('ventana incremental con solape', () => {
  const ahora = new Date('2026-11-09T12:00:00.000Z')

  it('primera corrida (sin marca): barrido completo', () => {
    const v = ventanaIngesta(null, ahora)
    expect(v.primera_corrida).toBe(true)
    expect(v.desde).toBeNull()
    expect(v.hasta).toBe('2026-11-09')
  })

  it('CLAVE: no es `> marca` — retrocede el solape porque el dato se COMPLETA después', () => {
    const v = ventanaIngesta('2026-11-01', ahora)
    expect(v.primera_corrida).toBe(false)
    expect(v.solape_dias).toBe(DIAS_SOLAPE_DEFECTO)
    // 45 días antes del 1-nov = 17-sep. Con un `>` pelado, los procesos leídos
    // cuando todavía eran UNSPECIFIED nunca recibirían su categoría.
    expect(v.desde).toBe('2026-09-17')
    expect(v.desde! < '2026-11-01').toBe(true)
  })

  it('el solape es configurable y se reporta', () => {
    expect(ventanaIngesta('2026-11-01', ahora, 1).desde).toBe('2026-10-31')
    expect(ventanaIngesta('2026-11-01', ahora, 0).desde).toBe('2026-11-01')
    expect(ventanaIngesta('2026-11-01', ahora, 7).solape_dias).toBe(7)
  })

  it('marca CORRUPTA: barrido completo, no una ventana inventada', () => {
    for (const m of ['ayer', '2026-13-45', '']) {
      const v = ventanaIngesta(m, ahora)
      expect(v.primera_corrida, m).toBe(true)
      expect(v.desde, m).toBeNull()
    }
  })

  it('la ventana se puede pasar directo al where', () => {
    const v = ventanaIngesta('2026-11-01', ahora)
    const w = whereIngesta({ desde: v.desde, hasta: v.hasta })
    expect(w).toContain(`${EXPR_FECHA_VENTANA} >= '2026-09-17'`)
    expect(w).toContain(`${EXPR_FECHA_VENTANA} <= '2026-11-09'`)
  })
})

describe('paginación y verificación de la cosecha', () => {
  it('calcula las páginas contra el conteo de la API', () => {
    expect(paginasPara(0)).toBe(0)
    expect(paginasPara(1)).toBe(1)
    expect(paginasPara(50_000)).toBe(1)
    expect(paginasPara(50_001)).toBe(2)
    // El filtro completo medido: 29.354 filas → una página.
    expect(paginasPara(29_354)).toBe(1)
    expect(paginasPara(29_354, 1_000)).toBe(30)
  })

  it('«no falló» no es «funcionó»: una cosecha incompleta se detecta contando', () => {
    expect(verificarCosecha(3446, 3446)).toEqual({ completa: true, faltan: 0, senal: null })
    const corta = verificarCosecha(3446, 1000)
    expect(corta.completa).toBe(false)
    expect(corta.faltan).toBe(2446)
    expect(corta.senal).toMatch(/COSECHA INCOMPLETA/)
  })

  it('más filas que el conteo también es señal (paginación sin orden)', () => {
    const r = verificarCosecha(1000, 1200)
    expect(r.completa).toBe(false)
    expect(r.senal).toMatch(/MAYOR QUE EL CONTEO/)
  })
})
