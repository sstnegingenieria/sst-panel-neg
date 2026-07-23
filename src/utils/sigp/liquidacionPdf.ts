// PDF de LIQUIDACIÓN DEL CONTRATISTA (Administrativa · Bloque 3b) — el
// documento de cierre que se entrega al contratista, análogo al de
// preliquidación (misma marca y sobriedad).
//
// CARA AL CONTRATISTA: alcance/mano de obra + compras/reembolsos en línea
// propia + total final + anticipo girado + retenciones + SALDO A PAGAR, con
// el sello "igual a la preliquidación" o el detalle de la diferencia.
// JAMÁS pinta valor_venta, utilidad ni margen — internos de NEG.
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { partir, cargarAssetsPdf } from './cotizacionPdf'
import { fmtNum } from './formato'
import { origenDiferenciaLiquidacion } from '../../types/sigp/proyecto'

export { cargarAssetsPdf }

const VERDE = rgb(0x62 / 255, 0x8e / 255, 0x3a / 255)
const TINTA = rgb(0x1c / 255, 0x1c / 255, 0x1c / 255)
const GRIS = rgb(0x45 / 255, 0x45 / 255, 0x45 / 255)
const GRIS_MEDIO = rgb(0x8a / 255, 0x8f / 255, 0x98 / 255)
const ZEBRA = rgb(0xf0 / 255, 0xf2 / 255, 0xf0 / 255)
const BORDE = rgb(0xdd / 255, 0xe1 / 255, 0xdd / 255)
const BLANCO = rgb(1, 1, 1)
const AMBAR = rgb(0xb4 / 255, 0x69 / 255, 0x00 / 255)
const VERDE_SELLO = rgb(0x3c / 255, 0x8b / 255, 0x2e / 255)

const ANCHO = 595.28
const ALTO = 841.89
const MARGEN = 46
const MARGEN_INF = 96
const CONTENIDO = ANCHO - MARGEN * 2

const fMoneda = (n: number) => '$ ' + fmtNum(n || 0)
const fFechaLarga = (d: Date) =>
  d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })

export interface DatosPdfLiquidacion {
  proyectoConsecutivo: string
  contratistaNombre: string
  clienteNombre: string
  asunto: string
  fecha: Date
  /** Alcance resumido por grupo (mano de obra) — sin valores por actividad. */
  gruposAlcance: { nombre: string; items: number }[]
  manoObra: number
  compras: { concepto: string; valor: number }[]
  retenciones: { concepto: string; valor: number }[]
  totalFinal: number
  anticipoGirado: number
  saldoFinal: number
  esIgual: boolean
  diferencia: number
  /** Motivos de los ajustes en ejecución reconocidos (puede ir vacío). */
  ajustesReconocidos: string[]
  observaciones?: string
}

export async function generarPdfLiquidacion(
  datos: DatosPdfLiquidacion,
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

  doc.setTitle(`${datos.proyectoConsecutivo} — Liquidación del contratista`)
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
      textoDer('LIQUIDACIÓN', ANCHO - MARGEN, y + 1, 8, fS, GRIS_MEDIO)
      reglaMarca(y - 6, 3)
      y -= 28
    }
  }

  const asegurar = (alto: number) => { if (y - alto < MARGEN_INF) nuevaPagina() }

  // ── Encabezado ──
  nuevaPagina(true)
  reglaMarca(y)
  y -= 34
  {
    const wC = fB.widthOfTextAtSize(datos.proyectoConsecutivo, 17)
    page.drawText(datos.proyectoConsecutivo, { x: ANCHO - MARGEN - wC, y, size: 17, font: fB, color: VERDE })
    page.drawText('Liquidación del contratista', { x: MARGEN, y, size: 14, font: fB, color: TINTA })
    y -= 14
    page.drawText(datos.asunto || '—', { x: MARGEN, y, size: 8.5, font: fS, color: GRIS_MEDIO })
    y -= 24
  }

  // ── Datos ──
  {
    const par = (etiqueta: string, valor: string, x: number, yy: number) => {
      page.drawText(etiqueta, { x, y: yy, size: 5.8, font: fS, color: GRIS_MEDIO })
      page.drawText(partir(valor, fR, 8.5, CONTENIDO / 2 - 24)[0], { x, y: yy - 11, size: 8.5, font: fR, color: TINTA })
    }
    par('CONTRATISTA', datos.contratistaNombre, MARGEN, y)
    par('CLIENTE / SITIO', datos.clienteNombre, MARGEN + CONTENIDO / 2, y)
    y -= 26
    par('FECHA DE LIQUIDACIÓN', fFechaLarga(datos.fecha), MARGEN, y)
    y -= 30
  }

  // ── Sello de conciliación (atribuye el ORIGEN: compras, ajustes o ambos) ──
  {
    const origen = origenDiferenciaLiquidacion(datos.diferencia, datos.ajustesReconocidos.length)
    const deltaCompras = `${datos.diferencia >= 0 ? '+' : '-'} ${fMoneda(Math.abs(datos.diferencia))}`
    const texto =
      origen === 'igual' ? 'LIQUIDACIÓN IGUAL A LA PRELIQUIDACIÓN'
      : origen === 'compras' ? `DIFERENCIA VS. LA PRELIQUIDACIÓN: ${deltaCompras} (${datos.diferencia >= 0 ? 'mayor' : 'menor'} valor por compras/reembolsos)`
      : origen === 'ajustes' ? 'MANO DE OBRA AJUSTADA EN EJECUCIÓN — ajuste reconocido en esta liquidación (detalle abajo); sin compras/reembolsos'
      : `DIFERENCIA: ${deltaCompras} por compras/reembolsos · ADEMÁS mano de obra ajustada en ejecución (detalle abajo)`
    const color = datos.esIgual ? VERDE_SELLO : AMBAR
    const lineasSello = partir(texto, fS, 8, CONTENIDO - 20)
    const hSello = lineasSello.length * 11 + 7
    const wSello = Math.min(
      CONTENIDO,
      Math.max(...lineasSello.map(l => fS.widthOfTextAtSize(l, 8))) + 20,
    )
    page.drawRectangle({ x: MARGEN, y: y - hSello + 5, width: wSello, height: hSello, borderColor: color, borderWidth: 1, color: BLANCO })
    lineasSello.forEach((l, i) => page.drawText(l, { x: MARGEN + 10, y: y - 7 - i * 11, size: 8, font: fS, color }))
    y -= hSello + 8
    for (const a of datos.ajustesReconocidos) {
      const lineas = partir(`Ajuste reconocido: ${a}`, fR, 7, CONTENIDO - 8)
      asegurar(lineas.length * 10 + 4)
      lineas.forEach(l => { page.drawText(l, { x: MARGEN + 4, y: y - 6, size: 7, font: fR, color: GRIS }); y -= 10 })
      y -= 2
    }
    if (datos.ajustesReconocidos.length) y -= 6
  }

  // ── Alcance (mano de obra) resumido por grupo ──
  {
    page.drawRectangle({ x: MARGEN, y: y - 15, width: CONTENIDO, height: 19, color: VERDE })
    page.drawText('ALCANCE EJECUTADO (MANO DE OBRA)', { x: MARGEN + 8, y: y - 7.8, size: 6.5, font: fS, color: BLANCO })
    textoDer('ACTIVIDADES', ANCHO - MARGEN - 8, y - 7.8, 6.5, fS, BLANCO)
    y -= 24
    datos.gruposAlcance.forEach((g, i) => {
      asegurar(18)
      if (i % 2 === 1) page.drawRectangle({ x: MARGEN, y: y - 11, width: CONTENIDO, height: 15, color: ZEBRA })
      page.drawText(partir(g.nombre, fR, 8, CONTENIDO - 90)[0], { x: MARGEN + 6, y: y - 7, size: 8, font: fR, color: TINTA })
      textoDer(String(g.items), ANCHO - MARGEN - 8, y - 7, 8, fR, GRIS)
      y -= 15
    })
    page.drawLine({ start: { x: MARGEN, y: y - 1 }, end: { x: MARGEN + CONTENIDO, y: y - 1 }, color: BORDE, thickness: 1.1 })
    y -= 14
  }

  // ── Conciliación económica ──
  {
    const filas: { k: string; v: string; enfasis?: boolean; negativo?: boolean }[] = [
      { k: 'Mano de obra (preliquidación)', v: fMoneda(datos.manoObra) },
      ...datos.compras.map(c => ({ k: `Compra/reembolso — ${c.concepto}`, v: fMoneda(c.valor) })),
      { k: 'TOTAL CONTRATISTA FINAL', v: fMoneda(datos.totalFinal), enfasis: true },
      { k: 'Anticipo girado', v: `- ${fMoneda(datos.anticipoGirado)}`, negativo: true },
      ...datos.retenciones.map(r => ({ k: `Retención — ${r.concepto}`, v: `- ${fMoneda(r.valor)}`, negativo: true })),
    ]
    const hFila = 16.5, hTotal = 26, hCab = 22
    const hCard = hCab + filas.length * hFila + hTotal + 8
    asegurar(hCard + 10)

    page.drawRectangle({ x: MARGEN, y: y - 15, width: CONTENIDO, height: 19, color: VERDE })
    page.drawText('CONCILIACIÓN ECONÓMICA', { x: MARGEN + 8, y: y - 7.8, size: 6.5, font: fS, color: BLANCO })
    y -= 22

    filas.forEach((f, i) => {
      if (i % 2 === 1)
        page.drawRectangle({ x: MARGEN, y: y - hFila + 4, width: CONTENIDO, height: hFila, color: ZEBRA })
      page.drawText(partir(f.k, f.enfasis ? fB : fR, 8.5, CONTENIDO - 130)[0],
        { x: MARGEN + 12, y: y - 8, size: 8.5, font: f.enfasis ? fB : fR, color: f.enfasis ? TINTA : GRIS })
      textoDer(f.v, MARGEN + CONTENIDO - 12, y - 8, 8.5, f.enfasis ? fB : fS, f.enfasis ? TINTA : GRIS)
      y -= hFila
    })

    const yBarra = y - 4
    page.drawSvgPath(
      `M 0 0 H ${CONTENIDO} V ${hTotal - 8} Q ${CONTENIDO} ${hTotal} ${CONTENIDO - 8} ${hTotal} H 8 Q 0 ${hTotal} 0 ${hTotal - 8} Z`,
      { x: MARGEN, y: yBarra, color: VERDE },
    )
    page.drawText('SALDO A PAGAR AL CONTRATISTA', { x: MARGEN + 16, y: yBarra - 17.5, size: 10, font: fB, color: BLANCO })
    textoDer(fMoneda(datos.saldoFinal), MARGEN + CONTENIDO - 16, yBarra - 18, 12.5, fB, BLANCO)
    y = yBarra - hTotal - 10

    if (datos.saldoFinal < 0) {
      page.drawText('ATENCION: saldo negativo — el anticipo girado supera el total final (sobre-giro).', {
        x: MARGEN, y: y - 6, size: 7.5, font: fS, color: AMBAR,
      })
      y -= 14
    }
  }

  // ── Observaciones ──
  if (datos.observaciones?.trim()) {
    const lineas = partir(datos.observaciones.trim(), fR, 8, CONTENIDO - 8)
    asegurar(lineas.length * 11 + 24)
    page.drawText('OBSERVACIONES', { x: MARGEN, y: y - 8, size: 6.5, font: fS, color: GRIS_MEDIO })
    y -= 20
    lineas.forEach(l => { page.drawText(l, { x: MARGEN + 4, y: y - 4, size: 8, font: fR, color: GRIS }); y -= 11 })
    y -= 8
  }

  page.drawText('Con el pago del saldo quedan liquidadas las obligaciones económicas de este proyecto con el contratista.', {
    x: MARGEN, y: y - 6, size: 7.5, font: fR, color: GRIS_MEDIO,
  })

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
