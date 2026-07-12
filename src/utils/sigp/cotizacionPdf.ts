// src/utils/sigp/cotizacionPdf.ts
//
// Generador client-side del PDF de cotización (F1.4-B.e) — formato ISO
// CM-FT-CT-19 v05 modernizado, fiel al manual de marca NEG (verde #628E3A,
// Montserrat, Lato italic solo para el slogan).
//
// EL PDF ES CARA AL CLIENTE: jamás pinta costo_directo, margen, APU ni nada
// del análisis económico interno.

import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type {
  ItemCotizacion, TotalesCotizacion, CondicionesCotizacion,
  EsquemaTributario, ConfigAIU, AgrupadorItems,
} from '../../types/sigp/cotizacion'
import { AGRUPADOR_SINGULAR } from '../../types/sigp/cotizacion'

// ── Control documental ISO (actualizar cuando el SGI re-versione el formato) ──
const ISO = { area: 'COMERCIAL', codigo: 'CM-FT-CT-19', version: '05', modificado: 'JUL-2026' }

// Pie de página institucional
const PIE_IZQUIERDA = 'NEG Ingeniería S.A.S. BIC · NIT 900.975.870-1 · Colombia'
const SLOGAN = 'Ingeniería que cambia el mundo'

// ── Marca ──
const VERDE = rgb(0x62 / 255, 0x8e / 255, 0x3a / 255)        // #628E3A
const VERDE_OSCURO = rgb(0x4f / 255, 0x73 / 255, 0x30 / 255) // #4F7330
const LIMA = rgb(0xd7 / 255, 0xda / 255, 0x33 / 255)         // #D7DA33
const GRIS = rgb(0x45 / 255, 0x45 / 255, 0x45 / 255)         // #454545
const GRIS_MEDIO = rgb(0x6b / 255, 0x72 / 255, 0x80 / 255)
const GRIS_FONDO = rgb(0xef / 255, 0xf1 / 255, 0xf4 / 255)   // #EFF1F4
const GRIS_BORDE = rgb(0xd7 / 255, 0xdb / 255, 0xe0 / 255)
const TINTA = rgb(0x1f / 255, 0x29 / 255, 0x37 / 255)
const BLANCO = rgb(1, 1, 1)

// ── Geometría A4 ──
const ANCHO = 595.28
const ALTO = 841.89
const MARGEN = 46
const MARGEN_INF = 64          // reserva del pie
const CONTENIDO = ANCHO - MARGEN * 2

export interface DatosPdfCotizacion {
  consecutivo: string
  versionNum: number
  asunto: string
  clienteNombre: string          // cliente o prospecto
  clienteNit?: string
  contacto?: string              // "Nombre · correo/teléfono"
  fechaEmision: Date
  validezDias: number
  esquema: EsquemaTributario
  aiu?: ConfigAIU
  ivaPct: number
  items: ItemCotizacion[]
  totales: TotalesCotizacion
  agrupador: AgrupadorItems
  condiciones: CondicionesCotizacion
  observaciones?: string
  firmante: { nombre: string; correo?: string; celular?: string }
}

interface Assets {
  logo: ArrayBuffer              // PNG del logo completo (con sello BIC)
  regular: ArrayBuffer
  semibold: ArrayBuffer
  bold: ArrayBuffer
  slogan: ArrayBuffer            // Lato Italic
}

/** Carga logo y fuentes servidos como estáticos del panel. */
export async function cargarAssetsPdf(): Promise<Assets> {
  const traer = async (ruta: string) => {
    const r = await fetch(ruta)
    if (!r.ok) throw new Error(`asset ${ruta}: ${r.status}`)
    return r.arrayBuffer()
  }
  const [logo, regular, semibold, bold, slogan] = await Promise.all([
    traer('/logo-neg-full.png'),
    traer('/fonts/Montserrat-Regular.ttf'),
    traer('/fonts/Montserrat-SemiBold.ttf'),
    traer('/fonts/Montserrat-Bold.ttf'),
    traer('/fonts/Lato-Italic.ttf'),
  ])
  return { logo, regular, semibold, bold, slogan }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const fMoneda = (n: number) => '$ ' + Math.round(n || 0).toLocaleString('es-CO')
const fFechaLarga = (d: Date) =>
  d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })

/** Parte un texto en líneas que caben en `maxAncho` (medido con la fuente). */
function partir(texto: string, font: PDFFont, size: number, maxAncho: number): string[] {
  const palabras = (texto || '').split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return ['']
  const lineas: string[] = []
  let actual = ''
  for (const p of palabras) {
    const intento = actual ? `${actual} ${p}` : p
    if (font.widthOfTextAtSize(intento, size) <= maxAncho) { actual = intento; continue }
    if (actual) lineas.push(actual)
    // palabra más ancha que la columna: cortar por caracteres
    let resto = p
    while (font.widthOfTextAtSize(resto, size) > maxAncho && resto.length > 1) {
      let corte = resto.length - 1
      while (corte > 1 && font.widthOfTextAtSize(resto.slice(0, corte), size) > maxAncho) corte--
      lineas.push(resto.slice(0, corte))
      resto = resto.slice(corte)
    }
    actual = resto
  }
  if (actual) lineas.push(actual)
  return lineas
}

/**
 * Genera el PDF de la versión. Devuelve los bytes (el hash y la subida a
 * Storage los maneja el caller).
 */
export async function generarPdfCotizacion(datos: DatosPdfCotizacion, assets: Assets): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const [fR, fS, fB, fI] = await Promise.all([
    doc.embedFont(assets.regular, { subset: true }),
    doc.embedFont(assets.semibold, { subset: true }),
    doc.embedFont(assets.bold, { subset: true }),
    doc.embedFont(assets.slogan, { subset: true }),
  ])
  const logo = await doc.embedPng(assets.logo)

  doc.setTitle(`${datos.consecutivo} v${datos.versionNum} — Cotización NEG Ingeniería`)
  doc.setAuthor('NEG Ingeniería S.A.S. BIC')
  doc.setSubject(datos.asunto)

  let page!: PDFPage
  let y = 0

  const texto = (t: string, x: number, size: number, font: PDFFont, color = TINTA) =>
    page.drawText(t, { x, y, size, font, color })
  const textoDer = (t: string, xDerecha: number, size: number, font: PDFFont, color = TINTA) =>
    page.drawText(t, { x: xDerecha - font.widthOfTextAtSize(t, size), y, size, font, color })

  const encabezadoCompacto = () => {
    y = ALTO - 40
    page.drawText(`${datos.consecutivo} · v${datos.versionNum}`, { x: MARGEN, y, size: 10, font: fB, color: VERDE })
    page.drawText('COTIZACIÓN', { x: ANCHO - MARGEN - fS.widthOfTextAtSize('COTIZACIÓN', 8), y: y + 1, size: 8, font: fS, color: GRIS_MEDIO })
    y -= 10
    page.drawRectangle({ x: MARGEN, y, width: CONTENIDO, height: 3, color: VERDE })
    page.drawRectangle({ x: MARGEN + CONTENIDO - 90, y, width: 90, height: 3, color: LIMA })
    y -= 20
  }

  const nuevaPagina = (primera = false) => {
    page = doc.addPage([ANCHO, ALTO])
    if (!primera) encabezadoCompacto()
  }

  const asegurar = (alto: number) => {
    if (y - alto < MARGEN_INF) nuevaPagina()
  }

  // ════ Página 1: encabezado de control documental ISO ════
  nuevaPagina(true)
  {
    const hIso = 58
    const yIso = ALTO - 44 - hIso
    const c1 = 138, c3 = 150
    const c2 = CONTENIDO - c1 - c3
    // marco y separadores
    page.drawRectangle({ x: MARGEN, y: yIso, width: CONTENIDO, height: hIso, borderColor: GRIS_BORDE, borderWidth: 1 })
    page.drawLine({ start: { x: MARGEN + c1, y: yIso }, end: { x: MARGEN + c1, y: yIso + hIso }, color: GRIS_BORDE, thickness: 1 })
    page.drawLine({ start: { x: MARGEN + c1 + c2, y: yIso }, end: { x: MARGEN + c1 + c2, y: yIso + hIso }, color: GRIS_BORDE, thickness: 1 })
    // col 1: control documental
    const filasIzq: [string, string][] = [
      ['COMERCIAL', ''], ['CÓDIGO:', ISO.codigo], ['VERSIÓN:', ISO.version], ['MODIFICADO:', ISO.modificado],
    ]
    let yl = yIso + hIso - 13
    for (const [k, v] of filasIzq) {
      page.drawText(k, { x: MARGEN + 8, y: yl, size: 6.5, font: fB, color: VERDE_OSCURO })
      if (v) page.drawText(v, { x: MARGEN + 8 + fB.widthOfTextAtSize(k, 6.5) + 3, y: yl, size: 6.5, font: fR, color: GRIS })
      yl -= 12
    }
    // col 2: identidad del formato (centrada)
    const cx = MARGEN + c1 + c2 / 2
    const centrado = (t: string, yy: number, size: number, font: PDFFont, color = TINTA) =>
      page.drawText(t, { x: cx - font.widthOfTextAtSize(t, size) / 2, y: yy, size, font, color })
    centrado('NEG INGENIERÍA S.A.S., BIC', yIso + hIso - 14, 9, fB, TINTA)
    centrado('NIT. 900.975.870-1', yIso + hIso - 25, 7.5, fR, GRIS)
    centrado('ÁREA COMERCIAL', yIso + hIso - 35, 6.5, fR, GRIS_MEDIO)
    centrado('FORMATO DE COTIZACIÓN', yIso + hIso - 47, 8, fS, VERDE)
    // col 3: logo (respetando zona de seguridad)
    const maxW = c3 - 20, maxH = hIso - 14
    const esc = Math.min(maxW / logo.width, maxH / logo.height)
    const lw = logo.width * esc, lh = logo.height * esc
    page.drawImage(logo, { x: MARGEN + c1 + c2 + (c3 - lw) / 2, y: yIso + (hIso - lh) / 2, width: lw, height: lh })

    // banda de marca
    y = yIso - 12
    page.drawRectangle({ x: MARGEN, y, width: CONTENIDO, height: 4, color: VERDE })
    page.drawRectangle({ x: MARGEN + CONTENIDO - 110, y, width: 110, height: 4, color: LIMA })
    y -= 24

    // título + consecutivo
    texto('COTIZACIÓN', MARGEN, 14, fB, GRIS)
    const consec = `${datos.consecutivo}`
    const vTag = `  v${datos.versionNum}`
    const wC = fB.widthOfTextAtSize(consec, 17), wV = fS.widthOfTextAtSize(vTag, 10)
    page.drawText(consec, { x: ANCHO - MARGEN - wC - wV, y: y - 2, size: 17, font: fB, color: VERDE })
    page.drawText(vTag, { x: ANCHO - MARGEN - wV, y: y - 2, size: 10, font: fS, color: GRIS_MEDIO })
    y -= 22
  }

  // ════ Bloque de datos ════
  {
    const vence = new Date(datos.fechaEmision.getTime() + datos.validezDias * 86_400_000)
    const pares: [string, string][] = [
      ['CLIENTE', datos.clienteNit ? `${datos.clienteNombre} · NIT ${datos.clienteNit}` : datos.clienteNombre],
      ['FECHA', fFechaLarga(datos.fechaEmision)],
      ...(datos.contacto ? [['CONTACTO', datos.contacto] as [string, string]] : []),
      ['VALIDEZ', `${datos.validezDias} días (hasta el ${fFechaLarga(vence)})`],
    ]
    const colW = CONTENIDO / 2 - 18
    const filas = Math.ceil(pares.length / 2) + 1  // +1 asunto
    const hBloque = filas * 15 + 16
    page.drawRectangle({ x: MARGEN, y: y - hBloque, width: CONTENIDO, height: hBloque, color: GRIS_FONDO })
    let yy = y - 18
    pares.forEach((p, i) => {
      const x = MARGEN + 14 + (i % 2) * (CONTENIDO / 2)
      page.drawText(p[0], { x, y: yy, size: 6.5, font: fB, color: VERDE_OSCURO })
      const val = partir(p[1], fR, 8.5, colW - 60)[0]
      page.drawText(val, { x: x + 58, y: yy, size: 8.5, font: fR, color: TINTA })
      if (i % 2 === 1) yy -= 15
    })
    if (pares.length % 2 === 1) yy -= 15
    page.drawText('ASUNTO', { x: MARGEN + 14, y: yy, size: 6.5, font: fB, color: VERDE_OSCURO })
    page.drawText(partir(datos.asunto, fS, 9, CONTENIDO - 90)[0], { x: MARGEN + 72, y: yy, size: 9, font: fS, color: TINTA })
    y -= hBloque + 16
  }

  // ════ Tabla de ítems ════
  const col = { cod: 58, und: 34, cant: 42, vu: 78, vt: 88 }
  const wDesc = CONTENIDO - col.cod - col.und - col.cant - col.vu - col.vt
  const xCod = MARGEN, xDesc = xCod + col.cod, xUnd = xDesc + wDesc,
    xCant = xUnd + col.und, xVu = xCant + col.cant, xVt = xVu + col.vu

  const encabezadoTabla = () => {
    asegurar(20)
    page.drawRectangle({ x: MARGEN, y: y - 14, width: CONTENIDO, height: 18, color: VERDE })
    const yh = y - 8
    const h = (t: string, x: number) => page.drawText(t, { x, y: yh, size: 7, font: fS, color: BLANCO })
    const hd = (t: string, xd: number) => page.drawText(t, { x: xd - fS.widthOfTextAtSize(t, 7), y: yh, size: 7, font: fS, color: BLANCO })
    h('CÓDIGO', xCod + 6); h('DESCRIPCIÓN', xDesc + 4); h('UND', xUnd + 4)
    hd('CANT', xCant + col.cant - 4); hd('VR. UNITARIO', xVu + col.vu - 4); hd('VR. TOTAL', xVt + col.vt - 4)
    y -= 20
  }

  // agrupar preservando orden de aparición
  const sinGrupo = `Sin ${AGRUPADOR_SINGULAR[datos.agrupador].toLowerCase()}`
  const grupos = new Map<string, ItemCotizacion[]>()
  for (const it of datos.items) {
    const g = it.capitulo?.trim() || sinGrupo
    if (!grupos.has(g)) grupos.set(g, [])
    grupos.get(g)!.push(it)
  }

  encabezadoTabla()
  let alterna = false
  for (const [grupo, itemsG] of grupos) {
    const subtotal = itemsG.reduce((s, it) => s + (it.valor_total || 0), 0)
    // título de grupo (no huérfano: reserva título + una fila)
    asegurar(34)
    if (y - 34 < MARGEN_INF) { nuevaPagina(); encabezadoTabla() }
    y -= 6
    page.drawText(grupo.toUpperCase(), { x: MARGEN + 6, y, size: 8, font: fB, color: VERDE_OSCURO })
    textoDer(fMoneda(subtotal), xVt + col.vt - 4, 8, fS, GRIS_MEDIO)
    y -= 5
    page.drawLine({ start: { x: MARGEN, y }, end: { x: MARGEN + CONTENIDO, y }, color: VERDE, thickness: 1.2 })
    y -= 4
    alterna = false

    for (const it of itemsG) {
      const lineas = partir(it.descripcion, fR, 8, wDesc - 10)
      const hFila = Math.max(lineas.length * 10, 10) + 7
      if (y - hFila < MARGEN_INF) { nuevaPagina(); encabezadoTabla() }
      if (alterna) page.drawRectangle({ x: MARGEN, y: y - hFila + 4, width: CONTENIDO, height: hFila, color: GRIS_FONDO })
      const yTop = y - 8
      page.drawText(it.codigo || '—', { x: xCod + 6, y: yTop, size: 7.5, font: fR, color: GRIS_MEDIO })
      lineas.forEach((l, i) => page.drawText(l, { x: xDesc + 4, y: yTop - i * 10, size: 8, font: fR, color: TINTA }))
      page.drawText(it.unidad || '—', { x: xUnd + 4, y: yTop, size: 8, font: fR, color: TINTA })
      const der = (t: string, xd: number) => page.drawText(t, { x: xd - fR.widthOfTextAtSize(t, 8), y: yTop, size: 8, font: fR, color: TINTA })
      der(String(it.cantidad), xCant + col.cant - 4)
      der(fMoneda(it.valor_unitario), xVu + col.vu - 4)
      der(fMoneda(it.valor_total), xVt + col.vt - 4)
      y -= hFila
      alterna = !alterna
    }
  }

  // ════ Tarjeta de totales ════
  {
    const filas: [string, string][] = datos.esquema === 'aiu'
      ? [
          ['Costo directo', fMoneda(datos.totales.costos_directos)],
          [`Administración (${datos.aiu?.admin ?? 0}%)`, fMoneda(datos.totales.admin ?? 0)],
          [`Imprevistos (${datos.aiu?.imprevistos ?? 0}%)`, fMoneda(datos.totales.imprevistos ?? 0)],
          [`Utilidad (${datos.aiu?.utilidad ?? 0}%)`, fMoneda(datos.totales.utilidad ?? 0)],
          [`IVA ${datos.ivaPct}% sobre la Utilidad`, fMoneda(datos.totales.iva)],
        ]
      : [
          ['Costo directo', fMoneda(datos.totales.costos_directos)],
          [`IVA (${datos.ivaPct}%)`, fMoneda(datos.totales.iva)],
        ]
    const hFila = 17, hTotal = 24
    const hCard = filas.length * hFila + hTotal
    const wCard = 240
    const xCard = ANCHO - MARGEN - wCard
    asegurar(hCard + 18)
    y -= 12
    const yCardTop = y
    page.drawRectangle({ x: xCard, y: yCardTop - hCard, width: wCard, height: hCard, borderColor: VERDE, borderWidth: 1.2 })
    let yf = yCardTop
    filas.forEach(([k, v], i) => {
      if (i % 2 === 1) page.drawRectangle({ x: xCard + 1, y: yf - hFila, width: wCard - 2, height: hFila, color: GRIS_FONDO })
      page.drawText(k, { x: xCard + 12, y: yf - 12, size: 8.5, font: fR, color: GRIS })
      page.drawText(v, { x: xCard + wCard - 12 - fS.widthOfTextAtSize(v, 8.5), y: yf - 12, size: 8.5, font: fS, color: TINTA })
      yf -= hFila
    })
    page.drawRectangle({ x: xCard, y: yf - hTotal, width: wCard, height: hTotal, color: VERDE })
    page.drawText('TOTAL', { x: xCard + 12, y: yf - 16, size: 10.5, font: fB, color: BLANCO })
    page.drawText('COP', { x: xCard + 12 + fB.widthOfTextAtSize('TOTAL', 10.5) + 4, y: yf - 16, size: 7, font: fR, color: BLANCO })
    const tot = fMoneda(datos.totales.total)
    page.drawText(tot, { x: xCard + wCard - 12 - fB.widthOfTextAtSize(tot, 12), y: yf - 16.5, size: 12, font: fB, color: BLANCO })
    y = yCardTop - hCard - 8
  }

  // ════ Condiciones comerciales ════
  const seccion = (titulo: string) => {
    asegurar(30)
    y -= 14
    page.drawText(titulo.toUpperCase(), { x: MARGEN, y, size: 8, font: fB, color: VERDE })
    y -= 8
  }
  {
    const c = datos.condiciones
    const pares: [string, string][] = [
      ['Forma de pago', c.forma_pago], ['Tiempo de ejecución', c.tiempo_ejecucion],
      ['Garantía', c.garantia], ['Moneda', c.moneda === 'COP' ? 'Pesos colombianos (COP)' : c.moneda],
    ].filter(([, v]) => (v || '').trim()) as [string, string][]
    if (pares.length) {
      seccion('Condiciones comerciales')
      const filasN = Math.ceil(pares.length / 2)
      const hBloque = filasN * 24 + 10
      asegurar(hBloque)
      page.drawRectangle({ x: MARGEN, y: y - hBloque, width: CONTENIDO, height: hBloque, color: GRIS_FONDO })
      pares.forEach((p, i) => {
        const x = MARGEN + 14 + (i % 2) * (CONTENIDO / 2)
        const yy = y - 15 - Math.floor(i / 2) * 24
        page.drawText(p[0], { x, y: yy, size: 7.5, font: fS, color: GRIS })
        page.drawText(partir(p[1], fR, 8, CONTENIDO / 2 - 28)[0], { x, y: yy - 10, size: 8, font: fR, color: TINTA })
      })
      y -= hBloque
    }
  }

  // ════ Observaciones ════
  if ((datos.observaciones || '').trim()) {
    seccion('Observaciones y exclusiones')
    for (const linea of partir(datos.observaciones!, fR, 8.5, CONTENIDO)) {
      asegurar(12)
      page.drawText(linea, { x: MARGEN, y: y - 4, size: 8.5, font: fR, color: TINTA })
      y -= 12
    }
  }

  // ════ Firma ════
  {
    asegurar(64)
    y -= 34
    page.drawLine({ start: { x: MARGEN, y }, end: { x: MARGEN + 210, y }, color: GRIS_MEDIO, thickness: 0.8 })
    y -= 11
    page.drawText(datos.firmante.nombre, { x: MARGEN, y, size: 9, font: fB, color: TINTA })
    y -= 10
    const detalle = ['NEG Ingeniería S.A.S. BIC', datos.firmante.correo, datos.firmante.celular ? `Cel. ${datos.firmante.celular}` : '']
      .filter(Boolean).join(' · ')
    page.drawText(detalle, { x: MARGEN, y, size: 7.5, font: fR, color: GRIS_MEDIO })
  }

  // ════ Pie en todas las páginas ════
  const paginas = doc.getPages()
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: MARGEN, y: 42 }, end: { x: ANCHO - MARGEN, y: 42 }, color: GRIS_BORDE, thickness: 0.8 })
    p.drawText(PIE_IZQUIERDA, { x: MARGEN, y: 30, size: 7, font: fR, color: GRIS_MEDIO })
    const wS = fI.widthOfTextAtSize(SLOGAN, 7.5)
    p.drawText(SLOGAN, { x: ANCHO / 2 - wS / 2, y: 30, size: 7.5, font: fI, color: VERDE })
    const pag = `Página ${i + 1} de ${paginas.length}`
    p.drawText(pag, { x: ANCHO - MARGEN - fR.widthOfTextAtSize(pag, 7), y: 30, size: 7, font: fR, color: GRIS_MEDIO })
  })

  return doc.save()
}
