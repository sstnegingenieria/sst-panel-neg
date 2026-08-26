// PDF de ORDEN DE COMPRA Y/O SERVICIO (OC1) — formato ISO DC-FT-OC-00-19
// generado desde el panel (antes se diligenciaba a mano en Excel).
//
// CARA AL PROVEEDOR. Reglas duras del bloque:
//  - Los datos bancarios del proveedor JAMÁS entran a este documento (el DTO
//    ni siquiera tiene los campos — garantía por tipo, patrón preliquidación).
//  - SIN bloque de aprobación NI salvedad: la salvedad es una debilidad de
//    control interno de NEG y no se le cuenta al proveedor (queda íntegra en
//    el registro/historial). El gate es el botón: solo se descarga desde
//    `aprobada` (incl. comprada).
//  - Firma del CREADOR de la orden (nombre/cargo/correo/celular) + espacio
//    "Firma y/o sello recibido" del proveedor (formato real).
//  - IVA por línea sumado línea a línea (jamás tarifa sobre el subtotal).
//    Órdenes legacy sin IVA discriminado degradan honesto: sin columna IVA
//    ni fila de IVA — solo TOTAL, tal cual quedó aprobada.
//  - El bloque RADICACIÓN sale de configuracion/empresa (editable en panel);
//    sin config el bloque se omite y la UI lo advierte.
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { partir, partirMax, cargarAssetsPdf } from './cotizacionPdf'
import { ORDEN_COMPRA as ISO } from './isoControl'
import { fmtNum } from './formato'
import {
  type LineaOrdenCompra,
  type DespachoOC,
  type CondicionesOC,
  subtotalDe, ivaTotalDe, totalConIvaDe, discriminaIva, tarifaIvaUniforme,
} from '../../types/sigp/ordenCompra'
import type { ConfigEmpresa } from '../../types/sigp/configEmpresa'

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

/** DTO del documento — SOLO lo que el proveedor debe ver. Sin salvedad, sin
 *  aprobador, sin datos bancarios: los campos no existen en este tipo. */
export interface DatosPdfOrdenCompra {
  consecutivo: string                    // OC-YYYY-NNN
  proyectoConsecutivo: string
  fecha: Date
  proveedor: {
    razonSocial: string
    identificacion: string
    contactoNombre?: string
    contactoTelefono?: string
    contactoCorreo?: string
  }
  lineas: LineaOrdenCompra[]
  valorTotal: number                     // total del doc (con IVA en nuevas; tal cual en legacy)
  despacho?: DespachoOC
  condiciones?: CondicionesOC
  cotizacionReferencia?: string
  /** Firmante = CREADOR de la orden. */
  firmante: { nombre: string; cargo?: string; correo?: string; celular?: string }
  /** configuracion/empresa — null/undefined omite RADICACIÓN y usa pie estándar. */
  empresa?: ConfigEmpresa | null
}

export async function generarPdfOrdenCompra(
  datos: DatosPdfOrdenCompra,
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
  const logo = await doc.embedPng(assets.logo)

  doc.setTitle(`${datos.consecutivo} — Orden de compra y/o servicio`)
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
      page.drawText(datos.consecutivo, { x: MARGEN, y, size: 10, font: fB, color: VERDE })
      textoDer(`ORDEN DE COMPRA · ${ISO.codigo} · v${ISO.version}`, ANCHO - MARGEN, y + 1, 7, fR, GRIS_MEDIO)
      reglaMarca(y - 6, 3)
      y -= 28
    }
  }

  const asegurar = (alto: number) => { if (y - alto < MARGEN_INF) nuevaPagina() }

  // ── Página 1: cuadro ISO (réplica del patrón PRL/LIQ) ──
  nuevaPagina(true)
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
    const wC = fB.widthOfTextAtSize(datos.consecutivo, 17)
    page.drawText(datos.consecutivo, { x: ANCHO - MARGEN - wC, y, size: 17, font: fB, color: VERDE })
    page.drawText('Orden de compra y/o servicio', { x: MARGEN, y, size: 14, font: fB, color: TINTA })
    y -= 14
    const sub = [`Proyecto ${datos.proyectoConsecutivo}`, fFechaLarga(datos.fecha)]
    if (datos.cotizacionReferencia) sub.push(`Ref. cotización: ${datos.cotizacionReferencia}`)
    page.drawText(sub.join('  ·  '), { x: MARGEN, y, size: 8.5, font: fS, color: GRIS_MEDIO })
    y -= 24
  }

  // ── PROVEEDOR (izq) + ENTREGAR EN (der) ──
  {
    const wCol = CONTENIDO / 2 - 12
    const bloque = (titulo: string, filas: [string, string][], x: number, yTop: number): number => {
      page.drawText(titulo, { x, y: yTop, size: 6.5, font: fB, color: VERDE })
      let yy = yTop - 12
      for (const [k, v] of filas) {
        if (!v) continue
        page.drawText(k, { x, y: yy, size: 5.8, font: fS, color: GRIS_MEDIO })
        const lineas = partirMax(v, fR, 8.5, wCol - 4, 2)
        lineas.forEach((l, i) =>
          page.drawText(l, { x, y: yy - 10 - i * 10.5, size: 8.5, font: fR, color: TINTA }))
        yy -= 22 + (lineas.length - 1) * 10.5
      }
      return yTop - yy // alto consumido
    }
    const filasProv: [string, string][] = [
      ['RAZÓN SOCIAL', datos.proveedor.razonSocial],
      ['IDENTIFICACIÓN', datos.proveedor.identificacion],
      ['CONTACTO', [datos.proveedor.contactoNombre, datos.proveedor.contactoTelefono].filter(Boolean).join(' · ')],
      ['CORREO', datos.proveedor.contactoCorreo ?? ''],
    ]
    const d = datos.despacho
    const filasDesp: [string, string][] = d ? [
      ['DIRECCIÓN', d.direccion],
      ['CONTACTO', [d.contacto, d.telefono].filter(Boolean).join(' · ')],
      ['FECHA DE DESPACHO', d.fecha_despacho ?? ''],
    ] : []
    const h1 = bloque('PROVEEDOR', filasProv, MARGEN, y)
    const h2 = d ? bloque('ENTREGAR EN', filasDesp, MARGEN + CONTENIDO / 2 + 12, y) : 0
    y -= Math.max(h1, h2) + 10
  }

  // ── Tabla de líneas ──
  const conIva = discriminaIva(datos.lineas)
  // columnas (derecha → izquierda): VR. TOTAL · IVA% (solo si discrimina) ·
  // VR. UNITARIO · CANT · UND · DESCRIPCIÓN · CÓDIGO
  const wTot = 74, wIva = conIva ? 34 : 0, wUnit = 64, wCant = 36, wUnd = 30, wCod = 46
  const xTotDer = ANCHO - MARGEN - 6
  const xIvaDer = xTotDer - wTot
  const xUnitDer = xIvaDer - wIva
  const xCantDer = xUnitDer - wUnit
  const xUnd = xCantDer - wCant - wUnd + 6
  const xDesc = MARGEN + wCod
  const wDesc = xUnd - xDesc - 8

  asegurar(60)
  page.drawRectangle({ x: MARGEN, y: y - 15, width: CONTENIDO, height: 19, color: VERDE })
  page.drawText('CÓDIGO', { x: MARGEN + 6, y: y - 7.8, size: 6.5, font: fS, color: BLANCO })
  page.drawText('DESCRIPCIÓN', { x: xDesc, y: y - 7.8, size: 6.5, font: fS, color: BLANCO })
  page.drawText('UND', { x: xUnd, y: y - 7.8, size: 6.5, font: fS, color: BLANCO })
  textoDer('CANT', xCantDer, y - 7.8, 6.5, fS, BLANCO)
  textoDer('VR. UNITARIO', xUnitDer, y - 7.8, 6.5, fS, BLANCO)
  if (conIva) textoDer('IVA', xIvaDer, y - 7.8, 6.5, fS, BLANCO)
  textoDer('VR. TOTAL', xTotDer, y - 7.8, 6.5, fS, BLANCO)
  y -= 24

  let fila = 0
  for (const l of datos.lineas) {
    const lineas = partir(l.descripcion, fR, 8, wDesc)
    const hFila = lineas.length * 11 + 10
    asegurar(hFila)
    if (fila % 2 === 1)
      page.drawRectangle({ x: MARGEN, y: y - hFila + 3, width: CONTENIDO, height: hFila, color: ZEBRA })
    const yTop = y - 10
    if (l.codigo) page.drawText(l.codigo, { x: MARGEN + 6, y: yTop, size: 7.5, font: fS, color: GRIS_MEDIO })
    lineas.forEach((t, i) => page.drawText(t, { x: xDesc, y: yTop - i * 11, size: 8, font: fR, color: TINTA }))
    page.drawText(l.unidad || '—', { x: xUnd, y: yTop, size: 8, font: fR, color: GRIS })
    textoDer(fmtNum(l.cantidad), xCantDer, yTop, 8, fR, GRIS)
    textoDer(fMoneda(l.valor_unitario), xUnitDer, yTop, 8, fR, GRIS)
    if (conIva) textoDer(`${fmtNum(l.iva_pct ?? 0)}%`, xIvaDer, yTop, 8, fR, GRIS)
    textoDer(fMoneda(l.valor), xTotDer, yTop, 8, fS, TINTA)
    y -= hFila
    fila++
  }
  page.drawLine({ start: { x: MARGEN, y: y + 3 }, end: { x: MARGEN + CONTENIDO, y: y + 3 }, color: BORDE, thickness: 1.1 })
  y -= 4

  // ── Resumen económico ──
  {
    const wCard = CONTENIDO * 0.5
    const xCard = ANCHO - MARGEN - wCard
    const filas: [string, string][] = []
    if (conIva) {
      const tarifa = tarifaIvaUniforme(datos.lineas)
      filas.push(['Subtotal', fMoneda(subtotalDe(datos.lineas))])
      // Rótulo: "IVA 19%" con tarifa uniforme; "IVA" a secas con mixtas
      // (calculado línea a línea — nunca una tarifa sobre el subtotal).
      filas.push([tarifa !== null ? `IVA ${fmtNum(tarifa)}%` : 'IVA', fMoneda(ivaTotalDe(datos.lineas))])
    }
    const total = conIva ? totalConIvaDe(datos.lineas) : datos.valorTotal
    const hFila = 16.5, hTotal = 26, hCab = 10
    const hCard = hCab + filas.length * hFila + hTotal + 6
    asegurar(hCard + 24)
    y -= 14
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
    page.drawText('TOTAL', { x: xCard + 16, y: yBarra - 17.5, size: 10, font: fB, color: BLANCO })
    textoDer(fMoneda(total), xCard + wCard - 16, yBarra - 18, 12.5, fB, BLANCO)
    y = yBarra - hTotal - 8
    if (!conIva) {
      page.drawText('Orden emitida antes de la discriminación de IVA por línea; el total corresponde al valor aprobado.', {
        x: MARGEN, y: y - 6, size: 7, font: fR, color: GRIS_MEDIO,
      })
      y -= 14
    }
  }

  // ── Condiciones de la orden ──
  {
    const c = datos.condiciones
    const filas: [string, string][] = []
    if (c?.forma_pago) filas.push(['Forma de pago', c.forma_pago])
    if (c?.tiempo_entrega) filas.push(['Tiempo de entrega', c.tiempo_entrega])
    if (filas.length) {
      asegurar(18 + filas.length * 13)
      page.drawText('CONDICIONES', { x: MARGEN, y: y - 8, size: 6.5, font: fB, color: VERDE })
      y -= 20
      for (const [k, v] of filas) {
        page.drawText(`${k}:`, { x: MARGEN, y: y - 4, size: 8, font: fS, color: GRIS })
        page.drawText(v, { x: MARGEN + fS.widthOfTextAtSize(`${k}:`, 8) + 5, y: y - 4, size: 8, font: fR, color: TINTA })
        y -= 13
      }
      y -= 6
    }
  }

  // ── RADICACIÓN de la factura (constantes de NEG desde configuracion/empresa) ──
  if (datos.empresa) {
    const e = datos.empresa
    const filas: [string, string][] = [
      ['Facturar a nombre de', e.razon_social],
      ['NIT', e.nit],
      ['Contacto de radicación', [e.contacto_radicacion, e.movil_radicacion].filter(Boolean).join(' · ')],
      ['Entrega de la factura', e.direccion_factura],
      ['Ciudad', e.ciudad],
    ]
    if (datos.condiciones?.fecha_limite_radicacion)
      filas.push(['Fecha límite de radicación', datos.condiciones.fecha_limite_radicacion])
    const visibles = filas.filter(([, v]) => v)
    const hBloque = 20 + visibles.length * 13 + 8
    asegurar(hBloque)
    page.drawRectangle({ x: MARGEN, y: y - hBloque + 6, width: CONTENIDO, height: hBloque - 2, color: ZEBRA })
    page.drawText('RADICACIÓN DE LA FACTURA', { x: MARGEN + 10, y: y - 10, size: 6.5, font: fB, color: VERDE })
    let yy = y - 24
    for (const [k, v] of visibles) {
      page.drawText(`${k}:`, { x: MARGEN + 10, y: yy, size: 8, font: fS, color: GRIS })
      page.drawText(v, { x: MARGEN + 10 + fS.widthOfTextAtSize(`${k}:`, 8) + 5, y: yy, size: 8, font: fR, color: TINTA })
      yy -= 13
    }
    y -= hBloque + 6
  }

  // ── Firmas: creador de la orden + recibido del proveedor ──
  {
    const hFirmas = 86
    asegurar(hFirmas + 10)
    y -= 16
    const wCol = CONTENIDO / 2 - 16
    const firma = (titulo: string, lineas: string[], x: number) => {
      page.drawLine({ start: { x, y: y - 40 }, end: { x: x + wCol, y: y - 40 }, color: GRIS_MEDIO, thickness: 0.8 })
      page.drawText(titulo, { x, y: y - 50, size: 6.5, font: fB, color: GRIS_MEDIO })
      lineas.filter(Boolean).forEach((l, i) =>
        page.drawText(l, { x, y: y - 61 - i * 10, size: 8, font: i === 0 ? fS : fR, color: i === 0 ? TINTA : GRIS }))
    }
    const f = datos.firmante
    firma('ELABORADA POR', [
      f.nombre,
      f.cargo ?? '',
      [f.correo, f.celular].filter(Boolean).join(' · '),
    ], MARGEN)
    firma('FIRMA Y/O SELLO RECIBIDO — PROVEEDOR', [datos.proveedor.razonSocial], MARGEN + CONTENIDO / 2 + 16)
    y -= hFirmas
  }

  // ── Pie institucional (todas las páginas) ──
  const paginas = doc.getPages()
  const pie = datos.empresa
    ? [datos.empresa.pie_direccion, datos.empresa.pie_correo, datos.empresa.pie_web, datos.empresa.pie_ciudad]
        .filter(Boolean).join(' · ')
    : 'NEG Ingeniería S.A.S. BIC · www.negingenieria.com'
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
    p.drawText(pie, { x: ANCHO - MARGEN - fR.widthOfTextAtSize(pie, 7), y: yPie - 26, size: 7, font: fR, color: GRIS })
  })

  return doc.save()
}
