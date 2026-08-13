// PDF de PRELIQUIDACIÓN DEL CONTRATISTA (SIGP F2.1.c) — el documento que hoy
// se manda por WhatsApp, con la marca NEG.
//
// CARA AL CONTRATISTA: muestra el alcance (grupos e ítems SIN valores por
// actividad) y SOLO el total pactado con él + anticipo (% y valor) + saldo.
// JAMÁS pinta valor_venta, utilidad, margen ni precios por ítem — esos son
// internos de NEG. Reutiliza los assets de marca del PDF de cotización.
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { partir, partirMax, cargarAssetsPdf } from './cotizacionPdf'
import { PRELIQUIDACION as ISO } from './isoControl'
import { fmtNum } from './formato'
import type { ModalidadContratista } from '../../types/sigp/proyecto'

export { cargarAssetsPdf }

// Paleta mínima de marca (ver cotizacionPdf.ts)
const VERDE = rgb(0x62 / 255, 0x8e / 255, 0x3a / 255)
const TINTA = rgb(0x1c / 255, 0x1c / 255, 0x1c / 255)
const GRIS = rgb(0x45 / 255, 0x45 / 255, 0x45 / 255)
const GRIS_MEDIO = rgb(0x8a / 255, 0x8f / 255, 0x98 / 255)
const ZEBRA = rgb(0xf0 / 255, 0xf2 / 255, 0xf0 / 255)
const BORDE = rgb(0xdd / 255, 0xe1 / 255, 0xdd / 255)
const BLANCO = rgb(1, 1, 1)

const ANCHO = 595.28
const ALTO = 841.89
const MARGEN = 46
const MARGEN_INF = 96
const CONTENIDO = ANCHO - MARGEN * 2

const fMoneda = (n: number) => '$ ' + fmtNum(n || 0)
const fFechaLarga = (d: Date) =>
  d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })

export interface ItemPreliquidacion {
  codigo?: string
  descripcion: string
  cantidad: number
  unidad: string
  /** Precisión de la actividad / dónde ejecutarla — SÍ sale al contratista. */
  observacion?: string
}

export interface DatosPdfPreliquidacion {
  proyectoConsecutivo: string
  contratistaNombre: string
  clienteNombre: string          // cliente/sitio del proyecto (contexto del alcance)
  asunto: string
  fecha: Date
  grupos: { nombre: string; items: ItemPreliquidacion[] }[]
  valorContratista: number
  /** Modalidad (24-jul): en 'solo_mano_obra' la barra se rotula MANO DE OBRA
   *  y se aclara que los materiales los suministra NEG. El presupuesto de
   *  materiales JAMÁS entra a este tipo (garantía por construcción — este
   *  documento es la cara al contratista). */
  modalidad?: ModalidadContratista
  anticipoPct: number
  anticipoValor: number
  saldoValor: number
}

export async function generarPdfPreliquidacion(
  datos: DatosPdfPreliquidacion,
  assets: Awaited<ReturnType<typeof cargarAssetsPdf>>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const [fR, fS, fB] = await Promise.all([
    doc.embedFont(assets.regular, { subset: true }),
    doc.embedFont(assets.semibold, { subset: true }),
    doc.embedFont(assets.bold, { subset: true }),
  ])
  const logoGris = await doc.embedPng(assets.logoGris)
  const logo = await doc.embedPng(assets.logo)   // logo color para el cuadro ISO

  doc.setTitle(`${datos.proyectoConsecutivo} — Preliquidación del contratista`)
  doc.setAuthor('NEG Ingeniería S.A.S. BIC')

  let page!: PDFPage
  let y = 0

  const textoDer = (t: string, xDer: number, yy: number, size: number, font: PDFFont, color = TINTA) =>
    page.drawText(t, { x: xDer - font.widthOfTextAtSize(t, size), y: yy, size, font, color })

  const reglaMarca = (yTop: number, alto = 5) => {
    const pasos = 24
    for (let s = 0; s < pasos; s++) {
      const t = s / (pasos - 1)
      const mez = (a: number, b: number) => a + (b - a) * t
      page.drawRectangle({
        x: MARGEN + (CONTENIDO / pasos) * s, y: yTop - alto, width: CONTENIDO / pasos + 0.5, height: alto,
        color: rgb(mez(0x62 / 255, 0xd7 / 255), mez(0x8e / 255, 0xda / 255), mez(0x3a / 255, 0x33 / 255)),
      })
    }
  }

  const nuevaPagina = (primera = false) => {
    page = doc.addPage([ANCHO, ALTO])
    y = ALTO - 46
    if (!primera) {
      page.drawText(datos.proyectoConsecutivo, { x: MARGEN, y, size: 10, font: fB, color: VERDE })
      // Control documental en el corrido (decisión Giovanny 02-ago: nombre +
      // código, que el lector de la pág. 2 sepa qué documento es y su código).
      textoDer(`PRELIQUIDACIÓN · ${ISO.codigo} · v${ISO.version}`, ANCHO - MARGEN, y + 1, 7, fR, GRIS_MEDIO)
      reglaMarca(y - 6, 3)
      y -= 28
    }
  }

  const asegurar = (alto: number) => { if (y - alto < MARGEN_INF) nuevaPagina() }

  // ── Encabezado ──
  nuevaPagina(true)
  // ════ Cuadro ISO de control documental (réplica exacta del de cotización:
  //      3 columnas, Montserrat, TODO en negro) — solo página 1 ════
  {
    const hIso = 58
    const yIso = ALTO - 44 - hIso
    const c1 = 138, c3 = 150
    const c2 = CONTENIDO - c1 - c3
    page.drawRectangle({ x: MARGEN, y: yIso, width: CONTENIDO, height: hIso, borderColor: BORDE, borderWidth: 1 })
    page.drawLine({ start: { x: MARGEN + c1, y: yIso }, end: { x: MARGEN + c1, y: yIso + hIso }, color: BORDE, thickness: 1 })
    page.drawLine({ start: { x: MARGEN + c1 + c2, y: yIso }, end: { x: MARGEN + c1 + c2, y: yIso + hIso }, color: BORDE, thickness: 1 })
    const filasIzq: [string, string][] = [
      [ISO.area, ''], ['CÓDIGO:', ISO.codigo], ['VERSIÓN:', ISO.version], ['MODIFICADO:', ISO.modificado],
    ]
    let yl = yIso + hIso - 13
    for (const [k, v] of filasIzq) {
      page.drawText(k, { x: MARGEN + 8, y: yl, size: 6.5, font: fB, color: TINTA })
      if (v) page.drawText(v, { x: MARGEN + 8 + fB.widthOfTextAtSize(k, 6.5) + 3, y: yl, size: 6.5, font: fR, color: TINTA })
      yl -= 12
    }
    const cx = MARGEN + c1 + c2 / 2
    const centrado = (t: string, yy: number, size: number, font: PDFFont) =>
      page.drawText(t, { x: cx - font.widthOfTextAtSize(t, size) / 2, y: yy, size, font, color: TINTA })
    centrado('NEG INGENIERÍA S.A.S., BIC', yIso + hIso - 14, 9, fB)
    centrado('NIT. 900.975.870-1', yIso + hIso - 25, 7.5, fR)
    centrado(ISO.area, yIso + hIso - 35, 6.5, fR)
    centrado(ISO.nombre, yIso + hIso - 47, 8, fS)
    const maxW = c3 - 20, maxH = hIso - 14
    const esc = Math.min(maxW / logo.width, maxH / logo.height)
    const lw = logo.width * esc, lh = logo.height * esc
    page.drawImage(logo, { x: MARGEN + c1 + c2 + (c3 - lw) / 2, y: yIso + (hIso - lh) / 2, width: lw, height: lh })
    y = yIso - 8
  }
  reglaMarca(y)
  y -= 34
  {
    const wC = fB.widthOfTextAtSize(datos.proyectoConsecutivo, 17)
    page.drawText(datos.proyectoConsecutivo, { x: ANCHO - MARGEN - wC, y, size: 17, font: fB, color: VERDE })
    page.drawText('Preliquidación del contratista', { x: MARGEN, y, size: 14, font: fB, color: TINTA })
    y -= 14
    page.drawText(datos.asunto || '—', { x: MARGEN, y, size: 8.5, font: fS, color: GRIS_MEDIO })
    y -= 24
  }

  // ── Datos ──
  {
    // 11-ago: nombres largos envuelven hasta 2 líneas ("…" defensivo) y la
    // fila siguiente baja lo que haga falta — antes se truncaban en silencio.
    const par = (etiqueta: string, valor: string, x: number, yy: number): number => {
      page.drawText(etiqueta, { x, y: yy, size: 5.8, font: fS, color: GRIS_MEDIO })
      const lineas = partirMax(valor, fR, 8.5, CONTENIDO / 2 - 24, 2)
      lineas.forEach((l, i) =>
        page.drawText(l, { x, y: yy - 11 - i * 10.5, size: 8.5, font: fR, color: TINTA }))
      return lineas.length
    }
    const nSup = Math.max(
      par('CONTRATISTA', datos.contratistaNombre, MARGEN, y),
      par('CLIENTE / SITIO', datos.clienteNombre, MARGEN + CONTENIDO / 2, y),
    )
    y -= 26 + (nSup - 1) * 10.5
    par('FECHA', fFechaLarga(datos.fecha), MARGEN, y)
    y -= 30
  }

  // ── Alcance (SIN valores) — columnas: CÓDIGO · DESCRIPCIÓN · CANT · UND · OBSERVACIONES ──
  // Anchos equilibrados para lectura vertical: la descripción y la observación
  // envuelven cada una en su columna; la fila mide la más alta de las dos.
  const wCod = 56, wCant = 36, wUnd = 30, wObs = 124
  const xObs = ANCHO - MARGEN - wObs               // texto de OBSERVACIONES
  const xUnd = xObs - wUnd - 8                     // texto de UND
  const xCantDer = xUnd - 10                       // CANT alineada a la derecha
  const xDesc = MARGEN + wCod
  const wDesc = xCantDer - wCant - xDesc - 6

  page.drawRectangle({ x: MARGEN, y: y - 15, width: CONTENIDO, height: 19, color: VERDE })
  page.drawText('ALCANCE DE LOS TRABAJOS', { x: MARGEN + 8, y: y - 7.8, size: 6.5, font: fS, color: BLANCO })
  textoDer('CANT', xCantDer, y - 7.8, 6.5, fS, BLANCO)
  page.drawText('UND', { x: xUnd, y: y - 7.8, size: 6.5, font: fS, color: BLANCO })
  page.drawText('OBSERVACIONES', { x: xObs, y: y - 7.8, size: 6.5, font: fS, color: BLANCO })
  y -= 24

  let trasEncabezado = true
  for (const g of datos.grupos) {
    asegurar(40)
    y -= trasEncabezado ? 0 : 14
    trasEncabezado = false
    page.drawText(g.nombre.toUpperCase(), { x: MARGEN + 2, y: y - 8, size: 7.7, font: fB, color: GRIS })
    page.drawLine({ start: { x: MARGEN, y: y - 14 }, end: { x: MARGEN + CONTENIDO, y: y - 14 }, color: BORDE, thickness: 1.1 })
    y -= 20

    let fila = 0
    for (const it of g.items) {
      const lineas = partir(it.descripcion, fR, 8, wDesc)
      const lineasObs = it.observacion ? partir(it.observacion, fR, 7.5, wObs - 4) : []
      const hFila = Math.max(lineas.length, lineasObs.length) * 11 + 10
      asegurar(hFila)
      if (fila % 2 === 1)
        page.drawRectangle({ x: MARGEN, y: y - hFila + 3, width: CONTENIDO, height: hFila, color: ZEBRA })
      const yTop = y - 10
      if (it.codigo) page.drawText(it.codigo, { x: MARGEN + 6, y: yTop, size: 7.5, font: fS, color: GRIS_MEDIO })
      lineas.forEach((l, i) => page.drawText(l, { x: xDesc, y: yTop - i * 11, size: 8, font: fR, color: TINTA }))
      textoDer(fmtNum(it.cantidad), xCantDer, yTop, 8, fR, GRIS)
      page.drawText(it.unidad || '—', { x: xUnd, y: yTop, size: 8, font: fR, color: GRIS })
      lineasObs.forEach((l, i) => page.drawText(l, { x: xObs, y: yTop - i * 11, size: 7.5, font: fR, color: GRIS }))
      y -= hFila
      fila++
    }
  }
  page.drawLine({ start: { x: MARGEN, y: y + 3 }, end: { x: MARGEN + CONTENIDO, y: y + 3 }, color: BORDE, thickness: 1.1 })
  y -= 4

  // ── Valores pactados con el contratista (lo ÚNICO monetario del documento) ──
  {
    const wCard = CONTENIDO * 0.56
    const xCard = ANCHO - MARGEN - wCard
    const filas: [string, string][] = [
      [`Anticipo (${fmtNum(datos.anticipoPct)}%)`, fMoneda(datos.anticipoValor)],
      ['Saldo contra entrega', fMoneda(datos.saldoValor)],
    ]
    const hFila = 16.5, hTotal = 26, hCab = 10
    const hCard = hCab + filas.length * hFila + hTotal + 6
    asegurar(hCard + 24)
    y -= 18
    let yf = y - hCab
    filas.forEach(([k, v], i) => {
      if (i % 2 === 1)
        page.drawRectangle({ x: xCard + 1, y: yf - hFila + 3, width: wCard - 2, height: hFila, color: ZEBRA })
      page.drawText(k, { x: xCard + 16, y: yf - 9, size: 8.5, font: fR, color: GRIS })
      textoDer(v, xCard + wCard - 16, yf - 9, 8.5, fS, GRIS)
      yf -= hFila
    })
    const yBarra = yf - 4
    page.drawSvgPath(
      `M 0 0 H ${wCard} V ${hTotal - 8} Q ${wCard} ${hTotal} ${wCard - 8} ${hTotal} H 8 Q 0 ${hTotal} 0 ${hTotal - 8} Z`,
      { x: xCard, y: yBarra, color: VERDE },
    )
    page.drawText(datos.modalidad === 'solo_mano_obra' ? 'TOTAL MANO DE OBRA' : 'TOTAL CONTRATISTA',
      { x: xCard + 16, y: yBarra - 17.5, size: 10, font: fB, color: BLANCO })
    textoDer(fMoneda(datos.valorContratista), xCard + wCard - 16, yBarra - 18, 12.5, fB, BLANCO)
    y = yBarra - hTotal - 8

    page.drawText('El saldo se liquida contra entrega a satisfacción de los trabajos.', {
      x: MARGEN, y: y - 6, size: 7.5, font: fR, color: GRIS_MEDIO,
    })
    y -= 20
    if (datos.modalidad === 'solo_mano_obra') {
      page.drawText('Modalidad solo mano de obra: los materiales los suministra NEG y no hacen parte de los valores de este documento.', {
        x: MARGEN, y: y - 6, size: 7.5, font: fR, color: GRIS_MEDIO,
      })
      y -= 14
    }
  }

  // ── Pie institucional (todas las páginas) ──
  const paginas = doc.getPages()
  paginas.forEach((p, idx) => {
    const yPie = 64
    p.drawLine({ start: { x: MARGEN, y: yPie }, end: { x: ANCHO - MARGEN, y: yPie }, color: BORDE, thickness: 0.8 })
    if (paginas.length > 1) {
      const t = `Página ${idx + 1} de ${paginas.length}`
      p.drawText(t, { x: ANCHO - MARGEN - fR.widthOfTextAtSize(t, 6.5), y: yPie + 5, size: 6.5, font: fR, color: GRIS_MEDIO })
    }
    const wLogo = 120
    const hLogo = wLogo * (logoGris.height / logoGris.width)
    p.drawImage(logoGris, { x: MARGEN, y: yPie - 12 - hLogo, width: wLogo, height: hLogo })
    const t2 = 'NEG Ingeniería S.A.S. BIC · www.negingenieria.com'
    p.drawText(t2, { x: ANCHO - MARGEN - fR.widthOfTextAtSize(t2, 7), y: yPie - 26, size: 7, font: fR, color: GRIS })
  })

  return doc.save()
}
