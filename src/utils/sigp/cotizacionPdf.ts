// src/utils/sigp/cotizacionPdf.ts
//
// Generador client-side del PDF de cotización — "propuesta económica" de
// firma de ingeniería: elegante, sobria, jerárquica. El CUADRO ISO de control
// documental superior NO se toca. El asunto es el título del documento; verde
// #628E3A como único acento (lima solo en la regla superior), filas alternadas
// en gris muy claro, pie institucional idéntico en todas las páginas y datos
// del cotizador solo al cierre del contenido. Menos es más.
//
// EL PDF ES CARA AL CLIENTE: jamás pinta costo_directo, margen, APU ni nada
// del análisis económico interno. La matemática de totales NO vive aquí
// (llega calculada en el snapshot); esto es solo presentación.

import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type {
  ItemCotizacion, TotalesCotizacion, CondicionesCotizacion,
  EsquemaTributario, ConfigAIU, ModoAgrupacion, Actividad,
} from '../../types/sigp/cotizacion'
import { subtotalesPorGrupo, GRUPO_OTROS_ID } from '../../types/sigp/cotizacion'
import { etiquetaVersion, fmtNum } from './formato'

// ── Control documental ISO (actualizar cuando el SGI re-versione el formato) ──
const ISO = { area: 'COMERCIAL', codigo: 'CM-FT-CT-19', version: '05', modificado: 'JUL-2026' }

// Pie corporativo
const TELEFONOS = 'Tel. 350 545 9018 · 350 545 9017'
const WEB = 'www.negingenieria.com'
// (el eslogan viaja DENTRO del logo gris del pie — no se dibuja como texto)

// ── Paleta sobria (manual de marca; NUNCA azul) ──
const VERDE = rgb(0x62 / 255, 0x8e / 255, 0x3a / 255)        // #628E3A — único acento
const VERDE_OSCURO = rgb(0x4f / 255, 0x73 / 255, 0x30 / 255) // #4F7330
const TINTA = rgb(0x1c / 255, 0x1c / 255, 0x1c / 255)        // casi-negro
const GRIS = rgb(0x45 / 255, 0x45 / 255, 0x45 / 255)
const GRIS_MEDIO = rgb(0x8a / 255, 0x8f / 255, 0x98 / 255)
const ZEBRA = rgb(0xf0 / 255, 0xf2 / 255, 0xf0 / 255)        // filas alternadas
const BORDE = rgb(0xdd / 255, 0xe1 / 255, 0xdd / 255)
const DIVISOR = rgb(0xec / 255, 0xee / 255, 0xec / 255)
const BLANCO = rgb(1, 1, 1)

// ── Geometría A4 ──
const ANCHO = 595.28
const ALTO = 841.89
const MARGEN = 46
const MARGEN_INF = 118         // reserva del pie institucional
const CONTENIDO = ANCHO - MARGEN * 2

// ── Iconografía de línea (paths SVG 24×24, trazo monocromo, legible en B/N) ──
const ICO = {
  edificio: 'M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16 M15 9h3a1 1 0 0 1 1 1v11 M3.5 21h17 M8.5 8h2 M8.5 12h2 M8.5 16h2',
  hash: 'M5 9.5h14 M5 14.5h14 M10 4.5l-2 15 M16 4.5l-2 15',
  usuario: 'M12 4a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7 M5 20c.5-3.5 3.2-5.5 7-5.5s6.5 2 7 5.5',
  calendario: 'M4 6.5h16V21H4z M4 10.5h16 M8 3.5v5 M16 3.5v5',
  reloj: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16 M12 8v4.2l3 1.8',
  moneda: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16 M12 7.2v9.6 M14.6 9.4c-.5-.9-1.4-1.3-2.6-1.3c-1.5 0-2.6.7-2.6 1.7c0 2.4 5.2 1.2 5.2 3.6c0 1-1.1 1.7-2.6 1.7c-1.2 0-2.1-.4-2.6-1.3',
  capas: 'M12 3l9 4.8l-9 4.8l-9-4.8z M3 12.6l9 4.8l9-4.8 M3 17l9 4.8l9-4.8',
  calculadora: 'M6.5 3h11v18h-11z M6.5 8.5h11 M9.6 12.4h.8 M11.6 12.4h.8 M13.6 12.4h.8 M9.6 15.4h.8 M11.6 15.4h.8 M13.6 15.4h.8 M9.6 18.2h.8',
  clipboard: 'M9.5 3.5h5V7h-5z M14.5 5h3.5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3.5',
  escudo: 'M12 3l7 2.6v5.6c0 4.6-3 7.6-7 9.3c-4-1.7-7-4.7-7-9.3V5.6z',
  info: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16 M12 11v5 M11.9 7.8h.7',
  pluma: 'M16.8 3.6l3.6 3.6L8.2 19.4L4 20l.6-4.2z M14.6 5.8l3.6 3.6',
  linkedin: 'M5.2 4.2a1.6 1.6 0 1 0 0 3.2a1.6 1.6 0 0 0 0-3.2 M4.6 10.2V20 M10 10.2V20 M10 13.6c0-2 1.6-3.6 3.6-3.6s3.6 1.6 3.6 3.6V20',
  instagram: 'M7 3.8h10a3.2 3.2 0 0 1 3.2 3.2v10A3.2 3.2 0 0 1 17 20.2H7A3.2 3.2 0 0 1 3.8 17V7A3.2 3.2 0 0 1 7 3.8 M12 8.4a3.6 3.6 0 1 0 0 7.2a3.6 3.6 0 0 0 0-7.2 M16.6 6.9v.7',
  facebook: 'M15.6 3.8h-2.4a3.6 3.6 0 0 0-3.6 3.6v2.4H7v3.6h2.6V21h3.6v-7.6h2.6l.6-3.6h-3.2V7.6a1 1 0 0 1 1-1h2.4z',
}

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
  /** Agrupación real de la versión — títulos/orden/subtotales desde
   *  subtotalesPorGrupo (misma fuente que el constructor y el snapshot). */
  modo: ModoAgrupacion
  actividades?: Actividad[]
  condiciones: CondicionesCotizacion
  observaciones?: string
  firmante: { nombre: string; correo?: string; celular?: string }
}

interface Assets {
  logo: ArrayBuffer              // PNG del logo completo (con sello BIC)
  logoGris: ArrayBuffer          // logo gris con eslogan y sello BIC (pie corporativo)
  qr: ArrayBuffer                // QR estático → https://www.negingenieria.com
  regular: ArrayBuffer
  semibold: ArrayBuffer
  bold: ArrayBuffer
}

/** Carga logo, QR y fuentes servidos como estáticos del panel. */
export async function cargarAssetsPdf(): Promise<Assets> {
  const traer = async (ruta: string) => {
    const r = await fetch(ruta)
    if (!r.ok) throw new Error(`asset ${ruta}: ${r.status}`)
    return r.arrayBuffer()
  }
  const [logo, logoGris, qr, regular, semibold, bold] = await Promise.all([
    traer('/logo-neg-full.png'),
    traer('/logo-neg-gris.png'),
    traer('/qr-web.png'),
    traer('/fonts/Montserrat-Regular.ttf'),
    traer('/fonts/Montserrat-SemiBold.ttf'),
    traer('/fonts/Montserrat-Bold.ttf'),
  ])
  return { logo, logoGris, qr, regular, semibold, bold }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const fMoneda = (n: number) => '$ ' + fmtNum(n || 0)   // es-CO, máx. 2 decimales
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

/** Máximo `max` líneas; la última termina en … si el texto sigue. */
function partirMax(texto: string, font: PDFFont, size: number, maxAncho: number, max: number): string[] {
  const lineas = partir(texto, font, size, maxAncho)
  if (lineas.length <= max) return lineas
  const visibles = lineas.slice(0, max)
  let ultima = visibles[max - 1]
  while (font.widthOfTextAtSize(ultima + '…', size) > maxAncho && ultima.length > 1) ultima = ultima.slice(0, -1)
  visibles[max - 1] = ultima + '…'
  return visibles
}

/** Path de rectángulo redondeado en coordenadas SVG locales (origen arriba-izq). */
function pathRectRedondeado(w: number, h: number, r: number): string {
  return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`
}

export async function generarPdfCotizacion(datos: DatosPdfCotizacion, assets: Assets): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const [fR, fS, fB] = await Promise.all([
    doc.embedFont(assets.regular, { subset: true }),
    doc.embedFont(assets.semibold, { subset: true }),
    doc.embedFont(assets.bold, { subset: true }),
  ])
  const logo = await doc.embedPng(assets.logo)
  const logoGris = await doc.embedPng(assets.logoGris)
  const qr = await doc.embedPng(assets.qr)

  const etiqV = etiquetaVersion(datos.versionNum)
  doc.setTitle(`${datos.consecutivo}${etiqV ? ' ' + etiqV : ''} — Propuesta económica NEG Ingeniería`)
  doc.setAuthor('NEG Ingeniería S.A.S. BIC')
  doc.setSubject(datos.asunto)

  let page!: PDFPage
  let y = 0

  const icono = (d: string, x: number, yTop: number, size: number, color = GRIS_MEDIO, grosor = 1.3) =>
    page.drawSvgPath(d, { x, y: yTop, scale: size / 24, borderColor: color, borderWidth: grosor })

  const rectR = (x: number, yTopPdf: number, w: number, h: number, r: number,
    opts: { color?: ReturnType<typeof rgb>; borderColor?: ReturnType<typeof rgb>; borderWidth?: number }) =>
    page.drawSvgPath(pathRectRedondeado(w, h, r), { x, y: yTopPdf, ...opts })

  const textoDer = (t: string, xDerecha: number, yy: number, size: number, font: PDFFont, color = TINTA) =>
    page.drawText(t, { x: xDerecha - font.widthOfTextAtSize(t, size), y: yy, size, font, color })

  const reglaMarca = (yTop: number, alto = 5) => {
    // regla verde → lima por segmentos (pdf-lib no trae degradados nativos)
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

  const encabezadoCompacto = () => {
    // páginas 2+: consecutivo a la izquierda, control documental a la derecha
    y = ALTO - 40
    page.drawText(`${datos.consecutivo}${etiqV ? ' · Versión ' + datos.versionNum : ''}`, { x: MARGEN, y, size: 10, font: fB, color: VERDE })
    textoDer(`${ISO.codigo} · v${ISO.version}`, ANCHO - MARGEN, y + 1, 7, fR, GRIS_MEDIO)
    reglaMarca(y - 6, 3)
    y -= 26
  }

  const nuevaPagina = (primera = false) => {
    page = doc.addPage([ANCHO, ALTO])
    if (!primera) encabezadoCompacto()
  }

  const asegurar = (alto: number) => {
    if (y - alto < MARGEN_INF) nuevaPagina()
  }

  // ════ CUADRO ISO DE CONTROL DOCUMENTAL — estructura intacta; todo el texto
  //      en negro (pedido de Giovanny 15-jul: sin verde en este cuadro) ════
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
    const centrado = (t: string, yy: number, size: number, font: PDFFont, color = TINTA) =>
      page.drawText(t, { x: cx - font.widthOfTextAtSize(t, size) / 2, y: yy, size, font, color })
    centrado('NEG INGENIERÍA S.A.S., BIC', yIso + hIso - 14, 9, fB, TINTA)
    centrado('NIT. 900.975.870-1', yIso + hIso - 25, 7.5, fR, TINTA)
    centrado('ÁREA COMERCIAL', yIso + hIso - 35, 6.5, fR, TINTA)
    centrado('FORMATO DE COTIZACIÓN', yIso + hIso - 47, 8, fS, TINTA)
    const maxW = c3 - 20, maxH = hIso - 14
    const esc = Math.min(maxW / logo.width, maxH / logo.height)
    const lw = logo.width * esc, lh = logo.height * esc
    page.drawImage(logo, { x: MARGEN + c1 + c2 + (c3 - lw) / 2, y: yIso + (hIso - lh) / 2, width: lw, height: lh })
    y = yIso - 10
  }

  // ════ 1. Regla de marca (degradado verde → lima) ════
  reglaMarca(y)
  y -= 34

  // ════ 2. Encabezado comercial — el asunto ES el título del documento;
  //         debajo, un subtítulo discreto; consecutivo a la derecha ════
  {
    const wC = fB.widthOfTextAtSize(datos.consecutivo, 17)
    page.drawText(datos.consecutivo, { x: ANCHO - MARGEN - wC, y, size: 17, font: fB, color: VERDE })
    // la versión es información documental: discreta, bajo el consecutivo
    if (etiqV) textoDer(`Versión ${datos.versionNum}`, ANCHO - MARGEN, y - 13, 7.5, fS, GRIS_MEDIO)
    const wVer = etiqV ? fS.widthOfTextAtSize(`Versión ${datos.versionNum}`, 7.5) : 0

    // La línea 1 respeta el consecutivo (y la 2 a la versión); el resto usa el
    // ancho completo. Si a 14pt no cabe en 2 líneas, baja a 12pt (hasta 3).
    const titulo = (datos.asunto.trim() || 'Propuesta económica').replace(/\s+/g, ' ')
    const wLinea1 = CONTENIDO - wC - 24
    const acomodar = (size: number, maxLineas: number) => {
      const lineas = [partir(titulo, fB, size, wLinea1)[0]]
      let resto = titulo.slice(lineas[0].length).trim()
      const wLinea2 = wVer ? CONTENIDO - wVer - 24 : CONTENIDO   // solo la 2 respeta la versión
      if (resto && maxLineas === 2) lineas.push(partirMax(resto, fB, size, wLinea2, 1)[0])
      else if (resto) {
        lineas.push(partir(resto, fB, size, wLinea2)[0])
        resto = resto.slice(lineas[1].length).trim()
        if (resto) lineas.push(...partirMax(resto, fB, size, CONTENIDO, maxLineas - 2))
      }
      return { size, lineas }
    }
    let t = acomodar(14, 2)
    if (t.lineas[t.lineas.length - 1].endsWith('…')) t = acomodar(12, 3)
    t.lineas.forEach((l, i) => page.drawText(l, { x: MARGEN, y: y - i * (t.size + 3), size: t.size, font: fB, color: TINTA }))
    y -= (t.lineas.length - 1) * (t.size + 3)
    if (datos.asunto.trim()) {
      y -= 14
      page.drawText('Propuesta económica', { x: MARGEN, y, size: 8.5, font: fS, color: GRIS_MEDIO })
    }
    y -= 24
  }

  // ════ 4. META — caja redondeada, 2 columnas, iconos, sin filas vacías ════
  {
    const vence = new Date(datos.fechaEmision.getTime() + datos.validezDias * 86_400_000)
    type Fila = { ico: string; etiqueta: string; valor: string; destacada?: boolean }
    const izq: Fila[] = [
      { ico: ICO.edificio, etiqueta: 'CLIENTE', valor: datos.clienteNombre, destacada: true },
      ...(datos.clienteNit ? [{ ico: ICO.hash, etiqueta: 'NIT', valor: datos.clienteNit }] : []),
      ...(datos.contacto ? [{ ico: ICO.usuario, etiqueta: 'CONTACTO', valor: datos.contacto }] : []),
    ]
    const der: Fila[] = [
      { ico: ICO.calendario, etiqueta: 'FECHA', valor: fFechaLarga(datos.fechaEmision) },
      { ico: ICO.reloj, etiqueta: 'VALIDEZ', valor: `${datos.validezDias} días · hasta el ${fFechaLarga(vence)}` },
      { ico: ICO.moneda, etiqueta: 'MONEDA', valor: datos.condiciones.moneda === 'COP' ? 'Pesos colombianos (COP)' : datos.condiciones.moneda },
    ]
    const hFila = 25
    const hCaja = Math.max(izq.length, der.length) * hFila + 14
    rectR(MARGEN, y, CONTENIDO, hCaja, 8, { borderColor: BORDE, borderWidth: 1 })
    const colW = CONTENIDO / 2
    const pintar = (filas: Fila[], x0: number) => {
      let yy = y - 21
      for (const f of filas) {
        icono(f.ico, x0 + 14, yy + 11, 10.5, f.destacada ? VERDE : GRIS_MEDIO, 1.2)
        page.drawText(f.etiqueta, { x: x0 + 32, y: yy + 3.5, size: 5.8, font: fS, color: GRIS_MEDIO })
        const linea = partir(f.valor, f.destacada ? fB : fR, f.destacada ? 9.5 : 8.5, colW - 46)[0]
        page.drawText(linea, { x: x0 + 32, y: yy - 7.5, size: f.destacada ? 9.5 : 8.5, font: f.destacada ? fB : fR, color: TINTA })
        yy -= hFila
      }
    }
    pintar(izq, MARGEN)
    pintar(der, MARGEN + colW)
    y -= hCaja + 22
  }

  // ════ 4b. Introducción institucional — saludo breve y genérico ════
  {
    const nombre = (datos.contacto || '').trim()
    const saludo = nombre ? `Apreciado(a) ${nombre}:` : 'Apreciados señores:'
    const cuerpo = `${nombre ? 'Reciba' : 'Reciban'} un cordial saludo. Atendiendo su solicitud, presentamos para su ` +
      'consideración la siguiente propuesta económica. Agradecemos la oportunidad y quedamos atentos a cualquier inquietud.'
    const lineas = partir(cuerpo, fR, 8.5, CONTENIDO)
    asegurar(16 + lineas.length * 12.5)
    page.drawText(saludo, { x: MARGEN, y, size: 8.5, font: fS, color: TINTA })
    y -= 15
    for (const l of lineas) {
      page.drawText(l, { x: MARGEN, y, size: 8.5, font: fR, color: GRIS })
      y -= 12.5
    }
    y -= 12
  }

  // ════ 5. TABLA de ítems ════
  // CANT y VR. UNITARIO angostos a favor de DESCRIPCIÓN (es la columna que respira)
  const col = { cod: 54, und: 40, cant: 36, vu: 70, vt: 92 }
  const wDesc = CONTENIDO - col.cod - col.und - col.cant - col.vu - col.vt
  const xCod = MARGEN, xDesc = xCod + col.cod, xUnd = xDesc + wDesc,
    xCant = xUnd + col.und, xVu = xCant + col.cant, xVt = xVu + col.vu

  const encabezadoTabla = () => {
    asegurar(24)
    page.drawRectangle({ x: MARGEN, y: y - 15, width: CONTENIDO, height: 19, color: VERDE })
    const yh = y - 7.8   // centrado óptico de las versales en la banda de 19pt
    const h = (t: string, x: number) => page.drawText(t, { x, y: yh, size: 6.5, font: fS, color: BLANCO })
    const hc = (t: string, xc: number, wc: number) =>
      page.drawText(t, { x: xc + wc / 2 - fS.widthOfTextAtSize(t, 6.5) / 2, y: yh, size: 6.5, font: fS, color: BLANCO })
    const hd = (t: string, xd: number) => page.drawText(t, { x: xd - fS.widthOfTextAtSize(t, 6.5), y: yh, size: 6.5, font: fS, color: BLANCO })
    h('CÓDIGO', xCod + 13); h('DESCRIPCIÓN', xDesc + 4)
    hc('UND', xUnd, col.und); hc('CANT', xCant, col.cant)
    hd('VR. UNITARIO', xVu + col.vu - 4); hd('VR. TOTAL', xVt + col.vt - 4)
    y -= 22
    trasEncabezadoTabla = true
  }

  const desglose = subtotalesPorGrupo(datos.items, datos.modo, datos.actividades ?? [])
  const buckets = new Map(desglose.map(g => [g.grupo_id, { g, items: [] as ItemCotizacion[] }]))
  for (const it of datos.items) {
    const id = datos.modo === 'actividad'
      ? (it.actividad_id && buckets.has(it.actividad_id) ? it.actividad_id : GRUPO_OTROS_ID)
      : (it.capitulo?.trim() || GRUPO_OTROS_ID)
    buckets.get(id)?.items.push(it)
  }
  const grupos = [...buckets.values()].filter(b => b.items.length > 0)

  // Una fila nunca se parte entre páginas: se mide completa antes de dibujar.
  // La descripción sale COMPLETA (es el alcance pactado con el cliente); el tope
  // de 20 líneas es solo un seguro anti-desborde — una fila jamás supera la página.
  const filaDe = (it: ItemCotizacion) => {
    const lineas = partirMax(it.descripcion, fR, 8, wDesc - 12, 20)
    return { lineas, h: lineas.length * 11 + 10 }
  }
  const H_ENC_GRUPO = 37   // 16 de aire + 21 del renglón con regla

  // encabezado de grupo — fondo blanco, icono + nombre en gris oscuro (sobriedad:
  // el verde queda para los acentos), subtotal en negro; sin acentos verticales.
  // `cont`: reanudación tras salto de página — "(cont.)" y sin repetir subtotal.
  // El aire de 16 es ENTRE grupos; pegado a la banda del encabezado se reduce.
  let trasEncabezadoTabla = false
  const encabezadoGrupo = (g: { grupo_nombre: string; subtotal: number }, cont = false) => {
    y -= trasEncabezadoTabla ? 0 : 16   // pegado a la banda; el aire va ENTRE grupos
    trasEncabezadoTabla = false
    icono(ICO.capas, MARGEN + 6, y - 1, 9, GRIS, 1.3)
    const nombre = g.grupo_nombre.toUpperCase()
    page.drawText(nombre, { x: MARGEN + 20, y: y - 8, size: 7.7, font: fB, color: GRIS })
    if (cont) {
      const wN = fB.widthOfTextAtSize(nombre, 7.7)
      page.drawText('(cont.)', { x: MARGEN + 20 + wN + 5, y: y - 8, size: 6.5, font: fR, color: GRIS_MEDIO })
    } else {
      textoDer(fMoneda(g.subtotal), xVt + col.vt - 4, y - 8, 7.7, fS, TINTA)
    }
    page.drawLine({ start: { x: MARGEN, y: y - 14 }, end: { x: MARGEN + CONTENIDO, y: y - 14 }, color: BORDE, thickness: 1.1 })
    y -= 21
  }

  encabezadoTabla()
  for (const { g, items: itemsG } of grupos) {
    // keep-with: el encabezado del grupo entra con al menos su primera fila
    const hPrimera = itemsG.length ? filaDe(itemsG[0]).h : 0
    if (y - (H_ENC_GRUPO + hPrimera) < MARGEN_INF) { nuevaPagina(); encabezadoTabla() }
    encabezadoGrupo(g)

    let fila = 0
    for (const it of itemsG) {
      const { lineas, h: hFila } = filaDe(it)
      if (y - hFila < MARGEN_INF) { nuevaPagina(); encabezadoTabla(); encabezadoGrupo(g, true) }
      if (fila % 2 === 1)
        page.drawRectangle({ x: MARGEN, y: y - hFila + 3, width: CONTENIDO, height: hFila, color: ZEBRA })
      const yTop = y - 10
      page.drawText(it.codigo || '—', { x: xCod + 13, y: yTop, size: 7.5, font: fS, color: GRIS_MEDIO })
      lineas.forEach((l, i) => page.drawText(l, { x: xDesc + 4, y: yTop - i * 11, size: 8, font: fR, color: TINTA }))
      const centrado = (t: string, xc: number, wc: number) =>
        page.drawText(t, { x: xc + wc / 2 - fR.widthOfTextAtSize(t, 8) / 2, y: yTop, size: 8, font: fR, color: GRIS })
      centrado(it.unidad || '—', xUnd, col.und)
      centrado(fmtNum(it.cantidad), xCant, col.cant)
      textoDer(fMoneda(it.valor_unitario), xVu + col.vu - 4, yTop, 8, fR, TINTA)
      textoDer(fMoneda(it.valor_total), xVt + col.vt - 4, yTop, 8, fS, TINTA)
      y -= hFila
      fila++
    }
  }
  // regla de cierre — marca el final de la tabla
  page.drawLine({ start: { x: MARGEN, y: y + 3 }, end: { x: MARGEN + CONTENIDO, y: y + 3 }, color: BORDE, thickness: 1.1 })
  y -= 4

  // ════ 6. RESUMEN ECONÓMICO — héroe ════
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
    const wCard = CONTENIDO * 0.56
    const xCard = ANCHO - MARGEN - wCard
    const hFila = 16.5, hTotal = 26, hCab = 24
    const hCard = hCab + filas.length * hFila + hTotal + 6
    asegurar(hCard + 24)
    y -= 18
    const yTop = y
    rectR(xCard, yTop, wCard, hCard, 8, { borderColor: BORDE, borderWidth: 1 })
    icono(ICO.calculadora, xCard + 14, yTop - 8, 10, VERDE, 1.3)
    page.drawText('RESUMEN ECONÓMICO', { x: xCard + 30, y: yTop - 16, size: 6.8, font: fS, color: VERDE_OSCURO })
    let yf = yTop - hCab
    filas.forEach(([k, v], i) => {
      const esIva = i === filas.length - 1
      if (i % 2 === 1)
        page.drawRectangle({ x: xCard + 1, y: yf - hFila + 3, width: wCard - 2, height: hFila, color: ZEBRA })
      if (esIva) page.drawLine({ start: { x: xCard + 12, y: yf + 3 }, end: { x: xCard + wCard - 12, y: yf + 3 }, color: DIVISOR, thickness: 0.8 })
      page.drawText(k, { x: xCard + 16, y: yf - 9, size: 8.5, font: fR, color: GRIS })
      textoDer(v, xCard + wCard - 16, yf - 9, 8.5, fS, GRIS)
      yf -= hFila
    })
    // barra TOTAL — protagonista sin estridencia
    const yBarra = yf - 4
    page.drawSvgPath(
      `M 0 0 H ${wCard} V ${hTotal - 8} Q ${wCard} ${hTotal} ${wCard - 8} ${hTotal} H 8 Q 0 ${hTotal} 0 ${hTotal - 8} Z`,
      { x: xCard, y: yBarra, color: VERDE },
    )
    page.drawText('TOTAL', { x: xCard + 16, y: yBarra - 17.5, size: 11, font: fB, color: BLANCO })
    page.drawText('COP', { x: xCard + 16 + fB.widthOfTextAtSize('TOTAL', 11) + 5, y: yBarra - 17, size: 6.5, font: fR, color: BLANCO })
    textoDer(fMoneda(datos.totales.total), xCard + wCard - 16, yBarra - 18.5, 13, fB, BLANCO)
    y = yBarra - hTotal - 8
  }

  // ── encabezado de sección genérico (icono + versal verde-oscuro + regla) ──
  // `reserva`: alto del primer contenido — evita títulos huérfanos al pie de página
  const seccion = (icon: string, titulo: string, reserva = 0) => {
    asegurar(36 + reserva)
    y -= 20
    icono(icon, MARGEN, y + 8.5, 11, VERDE, 1.3)   // centrado óptico con la versal
    page.drawText(titulo, { x: MARGEN + 17, y, size: 8.5, font: fS, color: VERDE_OSCURO })
    const wT = fS.widthOfTextAtSize(titulo, 8.5)
    page.drawLine({ start: { x: MARGEN + 17 + wT + 10, y: y + 3 }, end: { x: ANCHO - MARGEN, y: y + 3 }, color: DIVISOR, thickness: 0.8 })
    y -= 15
  }

  // ════ 7. CONDICIONES COMERCIALES — rejilla 2 col, sin campos vacíos ════
  {
    const c = datos.condiciones
    const campos: { ico: string; etiqueta: string; valor: string }[] = [
      { ico: ICO.moneda, etiqueta: 'FORMA DE PAGO', valor: c.forma_pago },
      { ico: ICO.reloj, etiqueta: 'TIEMPO DE EJECUCIÓN', valor: c.tiempo_ejecucion },
      { ico: ICO.escudo, etiqueta: 'GARANTÍA', valor: c.garantia },
    ].filter(f => (f.valor || '').trim())
    if (campos.length) {
      const colW = CONTENIDO / 2
      const filasN = Math.ceil(campos.length / 2)
      seccion(ICO.clipboard, 'CONDICIONES COMERCIALES', filasN * 31)
      campos.forEach((f, i) => {
        const x0 = MARGEN + (i % 2) * colW
        const yy = y - Math.floor(i / 2) * 31
        icono(f.ico, x0, yy + 6.5, 9.5, GRIS_MEDIO, 1.2)   // centrado con el par etiqueta/valor
        page.drawText(f.etiqueta, { x: x0 + 15, y: yy, size: 5.8, font: fS, color: GRIS_MEDIO })
        page.drawText(partir(f.valor, fR, 8.5, colW - 26)[0], { x: x0 + 15, y: yy - 11.5, size: 8.5, font: fR, color: TINTA })
      })
      y -= filasN * 31 + 4
    }
  }

  // ════ 8. NOTAS IMPORTANTES — cláusulas con viñeta › ════
  if ((datos.observaciones || '').trim()) {
    const clausulas = datos.observaciones!.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    // keep-with: el título entra con al menos la primera cláusula completa
    const hPrimera = clausulas.length
      ? partir(clausulas[0], fR, 8.8, CONTENIDO - 16).length * 12.5 + 6
      : 18
    seccion(ICO.info, 'NOTAS IMPORTANTES', hPrimera)
    for (const cl of clausulas) {
      const lineas = partir(cl, fR, 8.8, CONTENIDO - 16)
      asegurar(lineas.length * 12.5 + 5)
      page.drawText('›', { x: MARGEN + 2, y: y - 4, size: 9.5, font: fB, color: VERDE })
      lineas.forEach((l, i) => page.drawText(l, { x: MARGEN + 14, y: y - 4 - i * 12.5, size: 8.8, font: fR, color: GRIS }))
      y -= lineas.length * 12.5 + 6
    }
  }

  // ════ 9. COTIZADO POR — solo al cierre del contenido (última página) ════
  {
    seccion(ICO.pluma, 'COTIZADO POR', 84)
    y -= 48                       // área generosa para firma digital o manuscrita
    page.drawLine({ start: { x: MARGEN, y }, end: { x: MARGEN + 170, y }, color: GRIS_MEDIO, thickness: 0.8 })
    page.drawText(datos.firmante.nombre, { x: MARGEN, y: y - 11, size: 9.5, font: fB, color: TINTA })
    page.drawText('NEG Ingeniería S.A.S. BIC', { x: MARGEN, y: y - 22, size: 7.5, font: fR, color: GRIS })
    const lineaContacto = [datos.firmante.correo, datos.firmante.celular].filter(Boolean).join(' · ')
    if (lineaContacto) page.drawText(lineaContacto, { x: MARGEN, y: y - 32, size: 7, font: fR, color: GRIS_MEDIO })
  }

  // ════ 10. PIE institucional — idéntico en todas las páginas ════
  const paginas = doc.getPages()
  paginas.forEach((p, idx) => {
    const yPie = 96
    p.drawLine({ start: { x: MARGEN, y: yPie }, end: { x: ANCHO - MARGEN, y: yPie }, color: BORDE, thickness: 0.8 })
    if (paginas.length > 1) {
      const t = `Página ${idx + 1} de ${paginas.length}`
      p.drawText(t, { x: ANCHO - MARGEN - fR.widthOfTextAtSize(t, 6.5), y: yPie + 5, size: 6.5, font: fR, color: GRIS_MEDIO })
    }
    const dib = (d: string, x: number, yTop: number, s: number, c = GRIS_MEDIO, g = 1.2) =>
      p.drawSvgPath(d, { x, y: yTop, scale: s / 24, borderColor: c, borderWidth: g })

    // Izquierda — logo gris (trae eslogan y sello BIC), centrado en la banda
    const wLogo = 140
    const hLogo = wLogo * (logoGris.height / logoGris.width)
    p.drawImage(logoGris, { x: MARGEN, y: yPie - 18 - hLogo, width: wLogo, height: hLogo })

    // Centro — QR → https://www.negingenieria.com
    const qrSize = 48
    p.drawImage(qr, { x: ANCHO / 2 - qrSize / 2, y: yPie - 15 - qrSize, width: qrSize, height: qrSize })
    const cap = 'negingenieria.com'
    p.drawText(cap, { x: ANCHO / 2 - fR.widthOfTextAtSize(cap, 6) / 2, y: yPie - 22 - qrSize, size: 6, font: fR, color: GRIS_MEDIO })

    // Derecha — redes visibles, web y teléfonos institucionales
    const xDer = ANCHO - MARGEN
    const paso = 24, szRed = 16
    const redes = [ICO.linkedin, ICO.instagram, ICO.facebook]
    redes.forEach((d, i) => dib(d, xDer - (redes.length - i) * paso + (paso - szRed), yPie - 17, szRed, GRIS_MEDIO, 1.4))
    p.drawText(WEB, { x: xDer - fR.widthOfTextAtSize(WEB, 7), y: yPie - 46, size: 7, font: fR, color: GRIS })
    p.drawText(TELEFONOS, { x: xDer - fR.widthOfTextAtSize(TELEFONOS, 7), y: yPie - 56, size: 7, font: fR, color: GRIS_MEDIO })
  })

  return doc.save()
}
