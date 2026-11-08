// PDF del CORTE DE AVANCE DE OBRA (07-nov-2026) — generado, no armado a mano.
// Réplica del modelo que Giovanny hacía a mano (CORTE-01-SENA-INTERCENTROS):
// por ítem del alcance → contratado vs ejecutado (%, cantidad, valor),
// agrupado por capítulo/sede, CD global, y el RESUMEN ECONÓMICO del DELTA
// facturable con AIU (IVA sobre la U) o IVA pleno.
// ⚠ El cuadro ISO sale con CÓDIGO PENDIENTE DE RATIFICACIÓN (Ingrid/GI) —
// jamás el CM-FT-CT-19, que es el de cotización (el del modelo a mano).
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { partir, cargarAssetsPdf } from './cotizacionPdf'
import { CORTE_OBRA as ISO } from './isoControl'
import { fmtNum } from './formato'
import type { CorteObra } from '../../types/sigp/corteObra'
import { ESTADO_ITEM_LABEL as ESTADO_LBL } from '../../types/sigp/corteObra'

export { cargarAssetsPdf }

const VERDE = rgb(0x62 / 255, 0x8e / 255, 0x3a / 255)
const TINTA = rgb(0x1c / 255, 0x1c / 255, 0x1c / 255)
const GRIS = rgb(0x45 / 255, 0x45 / 255, 0x45 / 255)
const GRIS_MEDIO = rgb(0x8a / 255, 0x8f / 255, 0x98 / 255)
const AMBAR = rgb(0.72, 0.5, 0.05)
const ZEBRA = rgb(0xf0 / 255, 0xf2 / 255, 0xf0 / 255)
const BORDE = rgb(0xdd / 255, 0xe1 / 255, 0xdd / 255)
const BLANCO = rgb(1, 1, 1)

const ANCHO = 595.28
const ALTO = 841.89
const MARGEN = 40
const MARGEN_INF = 96
const CONTENIDO = ANCHO - MARGEN * 2

const fMoneda = (n: number) => '$ ' + fmtNum(n || 0)
const fFechaLarga = (d: Date) =>
  d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })

export async function generarPdfCorte(
  corte: CorteObra & { fechaJs: Date },
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

  doc.setTitle(`${corte.consecutivo} — Corte de avance de obra`)
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
      page.drawText(corte.consecutivo, { x: MARGEN, y, size: 10, font: fB, color: VERDE })
      textoDer(`CORTE DE AVANCE DE OBRA · ${ISO.codigo} · v${ISO.version}`, ANCHO - MARGEN, y + 1, 7, fR, GRIS_MEDIO)
      reglaMarca(y - 6, 3)
      y -= 28
    }
  }
  const asegurar = (alto: number) => { if (y - alto < MARGEN_INF) nuevaPagina() }

  // ── Cuadro ISO (pág. 1) — código ROTULADO pendiente ──
  nuevaPagina(true)
  {
    const hIso = 58
    const yIso = ALTO - 44 - hIso
    const c1 = 158, c3 = 140
    const c2 = CONTENIDO - c1 - c3
    page.drawRectangle({ x: MARGEN, y: yIso, width: CONTENIDO, height: hIso, borderColor: BORDE, borderWidth: 1 })
    page.drawLine({ start: { x: MARGEN + c1, y: yIso }, end: { x: MARGEN + c1, y: yIso + hIso }, color: BORDE, thickness: 1 })
    page.drawLine({ start: { x: MARGEN + c1 + c2, y: yIso }, end: { x: MARGEN + c1 + c2, y: yIso + hIso }, color: BORDE, thickness: 1 })
    const filas: [string, string][] = [
      [ISO.area, ''], ['CÓDIGO:', ISO.codigo], ['VERSIÓN:', ISO.version], ['MODIFICADO:', ISO.modificado],
    ]
    let yl = yIso + hIso - 13
    for (const [k, v] of filas) {
      page.drawText(k, { x: MARGEN + 8, y: yl, size: 6.5, font: fB, color: TINTA })
      if (v) page.drawText(v, { x: MARGEN + 8 + fB.widthOfTextAtSize(k, 6.5) + 3, y: yl, size: 6.2, font: fR, color: TINTA })
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
    page.drawImage(logo, { x: MARGEN + c1 + c2 + (c3 - logo.width * esc) / 2, y: yIso + (hIso - logo.height * esc) / 2, width: logo.width * esc, height: logo.height * esc })
    y = yIso - 8
  }
  reglaMarca(y)
  y -= 34
  {
    // Forma SENA: el NÚMERO DEL CORTE en grande arriba a la derecha, con la
    // referencia a la cotización y su versión DEBAJO — el corte dice contra
    // qué alcance mide, en la cara del documento.
    const wC = fB.widthOfTextAtSize(corte.consecutivo, 17)
    page.drawText(corte.consecutivo, { x: ANCHO - MARGEN - wC, y, size: 17, font: fB, color: VERDE })
    page.drawText(`Corte de avance de obra N° ${corte.numero_corte}`, { x: MARGEN, y, size: 14, font: fB, color: TINTA })
    if (corte.cotizacion_consecutivo || corte.cotizacion_version_medida != null) {
      const ref = `Ref. ${corte.cotizacion_consecutivo ?? corte.proyecto_consecutivo}${corte.cotizacion_version_medida != null ? ` · v${corte.cotizacion_version_medida}` : ''}`
      textoDer(ref, ANCHO - MARGEN, y - 12, 8, fS, GRIS_MEDIO)
    }
    y -= 14
    page.drawText(`${corte.proyecto_consecutivo}${corte.nombre_sitio ? ' · ' + corte.nombre_sitio : ''}`, { x: MARGEN, y, size: 8.5, font: fS, color: GRIS_MEDIO })
    // Tipo del corte (08-nov): el informativo se ROTULA en la cara del
    // documento — congela y documenta, pero no es base de cobro.
    if (corte.tipo === 'informativo') {
      y -= 13
      page.drawText('CORTE INFORMATIVO — NO FACTURABLE (no mueve la base de cobro; el siguiente corte facturable mide contra el último facturable)',
        { x: MARGEN, y, size: 7.5, font: fB, color: AMBAR })
    }
    y -= 20

    // ── Tarjeta de datos: SEIS campos en fila (2 × 3) ──
    const campos: [string, string][] = [
      ['CLIENTE', corte.cliente],
      ['NIT', corte.cliente_nit ?? '—'],
      ['CONTACTO', corte.contacto ?? '—'],
      ['FECHA DE CORTE', fFechaLarga(corte.fechaJs)],
      ['CONTRATO', (corte.contrato_referencias ?? []).join(' · ') || '—'],
      ['MONEDA', corte.moneda ?? 'COP'],
    ]
    const wCol = CONTENIDO / 3
    let maxLineas = 1
    const valoresPartidos = campos.map(([, v]) => partir(v, fR, 8, wCol - 16))
    campos.forEach((_, i) => { if (i >= 3) maxLineas = Math.max(maxLineas, valoresPartidos[i].length) })
    const hFilaCampos = (lineasMax: number) => 10 + lineasMax * 10
    const h1 = hFilaCampos(Math.max(...valoresPartidos.slice(0, 3).map(l => l.length)))
    const h2 = hFilaCampos(Math.max(...valoresPartidos.slice(3).map(l => l.length)))
    const hCard = h1 + h2 + 14
    page.drawRectangle({ x: MARGEN, y: y - hCard, width: CONTENIDO, height: hCard, borderColor: BORDE, borderWidth: 1 })
    campos.forEach(([k], i) => {
      const col = i % 3, filaIdx = Math.floor(i / 3)
      const x = MARGEN + col * wCol + 10
      const yy = y - 12 - (filaIdx === 0 ? 0 : h1)
      page.drawText(k, { x, y: yy, size: 5.6, font: fS, color: GRIS_MEDIO })
      valoresPartidos[i].forEach((l, j) =>
        page.drawText(l, { x, y: yy - 10 - j * 10, size: 8, font: fR, color: TINTA }))
    })
    y -= hCard + 10

    if (corte.nota_version_cambio) {
      const lineas = partir(corte.nota_version_cambio, fS, 7.5, CONTENIDO - 12)
      lineas.forEach(l => { page.drawText('(!) ' + l, { x: MARGEN, y, size: 7.5, font: fS, color: AMBAR }); y -= 10 })
      y -= 6
    }
  }

  // ── Tabla por ítem: contratado vs ejecutado ──
  // Columnas: COD · DESCRIPCIÓN · UND · CANT · VR.UNIT · VR.CONTRAT · % · CANT.EJ · VR.EJECUT
  const wCod = 32, wUnd = 22, wCant = 30, wVu = 50, wVc = 58, wPct = 26, wCej = 32, wVej = 58
  const xVejDer = ANCHO - MARGEN - 4
  const xCejDer = xVejDer - wVej - 6
  const xPctDer = xCejDer - wCej - 6
  const xVcDer = xPctDer - wPct - 6
  const xVuDer = xVcDer - wVc - 6
  const xCantDer = xVuDer - wVu - 6
  const xUnd = xCantDer - wCant - wUnd - 4
  const xDesc = MARGEN + wCod + 4
  const wDesc = xUnd - xDesc - 6

  const cab = () => {
    page.drawRectangle({ x: MARGEN, y: y - 15, width: CONTENIDO, height: 19, color: VERDE })
    const t = (txt: string, x: number) => page.drawText(txt, { x, y: y - 7.8, size: 5.8, font: fS, color: BLANCO })
    const tDer = (txt: string, xd: number) => textoDer(txt, xd, y - 7.8, 5.8, fS, BLANCO)
    t('COD', MARGEN + 3); t('DESCRIPCIÓN', xDesc); t('UND', xUnd)
    tDer('CANT', xCantDer); tDer('VR. UNIT', xVuDer); tDer('VR. CONTRATADO', xVcDer)
    tDer('% AV', xPctDer); tDer('CANT. EJEC', xCejDer); tDer('VR. EJECUTADO', xVejDer)
    y -= 24
  }
  cab()

  let primero = true
  const grupos = [...new Set(corte.items.map(i => i.grupo))]
  for (const g of grupos) {
    const items = corte.items.filter(i => i.grupo === g)
    asegurar(44)
    y -= primero ? 0 : 12
    primero = false
    // Capítulo = encabezado de ANCHO COMPLETO (forma SENA: «SEDE · CAPÍTULO»
    // — las sedes ya viven en el nombre del grupo). Banda gris clara.
    const gLineas = partir(g.toUpperCase(), fB, 7.4, CONTENIDO - 16)
    page.drawRectangle({ x: MARGEN, y: y - 16, width: CONTENIDO, height: 18, color: ZEBRA })
    page.drawText(gLineas[0] + (gLineas.length > 1 ? '…' : ''), { x: MARGEN + 8, y: y - 9, size: 7.4, font: fB, color: GRIS })
    y -= 22
    let fila = 0
    for (const it of items) {
      // Forma SENA: el ESTADO va como texto bajo la descripción, y el % en
      // una PASTILLA (no suelto).
      const lineas = partir(it.descripcion, fR, 6.8, wDesc)
      const hFila = (Math.max(1, lineas.length) + 1) * 9 + 8   // +1: línea de estado
      asegurar(hFila + 4)
      if (fila % 2 === 1)
        page.drawRectangle({ x: MARGEN, y: y - hFila + 3, width: CONTENIDO, height: hFila, color: ZEBRA })
      const yTop = y - 8
      if (it.codigo) page.drawText(it.codigo.slice(0, 8), { x: MARGEN + 2, y: yTop, size: 6.2, font: fS, color: GRIS_MEDIO })
      lineas.forEach((l, i) => page.drawText(l, { x: xDesc, y: yTop - i * 9, size: 6.8, font: fR, color: TINTA }))
      const colorEstado = it.estado === 'ejecutado' ? VERDE : it.estado === 'en_ejecucion' ? AMBAR : GRIS_MEDIO
      page.drawText(ESTADO_LBL[it.estado], { x: xDesc, y: yTop - lineas.length * 9, size: 5.8, font: fS, color: colorEstado })
      page.drawText(it.unidad || '—', { x: xUnd, y: yTop, size: 6.8, font: fR, color: GRIS })
      textoDer(fmtNum(it.cantidad_contratada), xCantDer, yTop, 6.8, fR, GRIS)
      textoDer(fmtNum(it.valor_unitario), xVuDer, yTop, 6.8, fR, GRIS)
      textoDer(fmtNum(it.valor_contratado), xVcDer, yTop, 6.8, fR, GRIS)
      // Pastilla del %: fondo suave + texto en el color del estado
      {
        const txt = fmtNum(it.pct) + '%'
        const wTxt = fS.widthOfTextAtSize(txt, 6.4)
        const wPill = wTxt + 8, hPill = 10
        const xPill = xPctDer - wPill
        page.drawRectangle({ x: xPill, y: yTop - 2.5, width: wPill, height: hPill, color: it.estado === 'ejecutado' ? rgb(0.90, 0.96, 0.90) : it.estado === 'en_ejecucion' ? rgb(0.99, 0.95, 0.85) : rgb(0.94, 0.94, 0.95) })
        page.drawText(txt, { x: xPill + 4, y: yTop, size: 6.4, font: fS, color: colorEstado })
      }
      textoDer(fmtNum(it.cantidad_acum), xCejDer, yTop, 6.8, fR, TINTA)
      textoDer(fmtNum(it.valor_acum), xVejDer, yTop, 6.8, fS, TINTA)
      y -= hFila
      fila++
    }
    // subtotal del grupo (contratado · ejecutado)
    const stC = items.reduce((s, i) => s + i.valor_contratado, 0)
    const stE = items.reduce((s, i) => s + i.valor_acum, 0)
    asegurar(14)
    page.drawText('Subtotal', { x: xDesc, y: y - 7, size: 6.6, font: fS, color: GRIS })
    textoDer(fmtNum(stC), xVcDer, y - 7, 6.8, fB, GRIS)
    textoDer(fmtNum(stE), xVejDer, y - 7, 6.8, fB, TINTA)
    y -= 13
  }
  page.drawLine({ start: { x: MARGEN, y: y + 2 }, end: { x: MARGEN + CONTENIDO, y: y + 2 }, color: BORDE, thickness: 1.1 })
  y -= 8

  // ── Fila de CIERRE de la tabla (forma SENA): contratado · % global ·
  //    ejecutado, en la MISMA línea, sobre banda propia ──
  asegurar(34)
  page.drawRectangle({ x: MARGEN, y: y - 16, width: CONTENIDO, height: 19, color: ZEBRA })
  page.drawText(`COSTO DIRECTO CONTRATADO  ${fMoneda(corte.cd_contratado)}`, { x: MARGEN + 8, y: y - 9, size: 7.5, font: fB, color: TINTA })
  {
    const centro = `AVANCE GLOBAL  ${fmtNum(corte.pct_global)}%`
    page.drawText(centro, { x: MARGEN + CONTENIDO / 2 - fB.widthOfTextAtSize(centro, 7.5) / 2, y: y - 9, size: 7.5, font: fB, color: VERDE })
  }
  textoDer(`COSTO DIRECTO EJECUTADO  ${fMoneda(corte.cd_acum)}`, ANCHO - MARGEN - 8, y - 9, 7.5, fB, TINTA)
  y -= 26

  if (corte.items_fuera_de_alcance?.length) {
    asegurar(20 + corte.items_fuera_de_alcance.length * 9)
    page.drawText('(!) Avance registrado en ítems que SALIERON del alcance vigente (cambio de alcance posterior) — se listan, no se facturan aquí:', { x: MARGEN, y: y - 7, size: 7, font: fS, color: AMBAR })
    y -= 11
    for (const h of corte.items_fuera_de_alcance) {
      page.drawText(`· ${h.clave} — cantidad registrada ${fmtNum(h.cantidad)}`, { x: MARGEN + 8, y: y - 7, size: 6.8, font: fR, color: GRIS })
      y -= 9
    }
    y -= 8
  }

  // ── Resumen económico del CORTE (el DELTA — contra el último FACTURABLE) ──
  {
    const r = corte.resumen
    const informativo = corte.tipo === 'informativo'
    const filas: [string, string][] = [
      [`Avance del corte (acumulado ${fMoneda(corte.cd_acum)} - base del último corte facturable ${fMoneda(corte.cd_acum_anterior)})`, fMoneda(r.delta_cd)],
      ...(r.esquema === 'aiu' ? [
        [`Administración (${fmtNum(r.aiu_pct?.admin ?? 0)}%)`, fMoneda(r.admin)],
        [`Imprevistos (${fmtNum(r.aiu_pct?.imprevistos ?? 0)}%)`, fMoneda(r.imprevistos)],
        [`Utilidad (${fmtNum(r.aiu_pct?.utilidad ?? 0)}%)`, fMoneda(r.utilidad)],
        [`IVA sobre la utilidad (19%)`, fMoneda(r.iva)],
      ] as [string, string][] : [
        ['IVA (19%)', fMoneda(r.iva)],
      ] as [string, string][]),
    ]
    const hFila = 16.5, hTotal = 26, wCard = CONTENIDO * 0.62
    const xCard = ANCHO - MARGEN - wCard
    const hCard = 14 + filas.length * hFila + hTotal
    asegurar(hCard + 26)
    y -= 10
    page.drawText(informativo ? 'RESUMEN ECONÓMICO DEL CORTE — INFORMATIVO' : 'RESUMEN ECONÓMICO DEL CORTE', { x: xCard + 2, y: y - 8, size: 7, font: fB, color: GRIS })
    let yf = y - 14
    filas.forEach(([k, v], i) => {
      if (i % 2 === 1)
        page.drawRectangle({ x: xCard + 1, y: yf - hFila + 3, width: wCard - 2, height: hFila, color: ZEBRA })
      const kl = partir(k, fR, 7.6, wCard - 110)
      page.drawText(kl[0] + (kl.length > 1 ? '…' : ''), { x: xCard + 12, y: yf - 9, size: 7.6, font: fR, color: GRIS })
      textoDer(v, xCard + wCard - 12, yf - 9, 8.2, fS, GRIS)
      yf -= hFila
    })
    const yBarra = yf - 4
    page.drawSvgPath(
      `M 0 0 H ${wCard} V ${hTotal - 8} Q ${wCard} ${hTotal} ${wCard - 8} ${hTotal} H 8 Q 0 ${hTotal} 0 ${hTotal - 8} Z`,
      { x: xCard, y: yBarra, color: informativo ? GRIS : VERDE },
    )
    page.drawText(informativo ? 'DELTA INFORMATIVO — NO FACTURABLE' : 'FACTURABLE DEL CORTE', { x: xCard + 14, y: yBarra - 17.5, size: informativo ? 8.5 : 10, font: fB, color: BLANCO })
    textoDer(fMoneda(r.total), xCard + wCard - 14, yBarra - 18, 12.5, fB, BLANCO)
    y = yBarra - hTotal - 10
  }

  if (corte.observaciones) {
    // Una viñeta POR LÍNEA (forma SENA): los saltos del texto se respetan;
    // cada línea envuelve con sangría colgante.
    const parrafos = corte.observaciones.split('\n').filter(l => l.trim())
    const bloques = parrafos.map(par => partir(par.trim(), fR, 8, CONTENIDO - 18))
    const altoTotal = bloques.reduce((s3, b) => s3 + b.length * 10.5 + 2, 0)
    asegurar(22 + altoTotal)
    page.drawText('OBSERVACIONES', { x: MARGEN, y: y - 8, size: 7, font: fB, color: GRIS })
    y -= 20
    for (const b of bloques) {
      b.forEach((l, i) => { page.drawText(l, { x: MARGEN + (i === 0 ? 0 : 8), y: y - 2, size: 8, font: fR, color: TINTA }); y -= 10.5 })
      y -= 2
    }
    y -= 4
  }

  // ── Firma del emisor (forma SENA): nombre, área, correo y teléfono ──
  {
    const e = corte.emisor
    // Firma + línea de cierre viajan JUNTAS (sin esto, la línea final podía
    // quedar huérfana en una página casi vacía — visto en el render E2E).
    asegurar(84)
    y -= 6
    page.drawText('EMITIDO POR', { x: MARGEN, y: y - 8, size: 6.5, font: fB, color: GRIS })
    page.drawLine({ start: { x: MARGEN, y: y - 12 }, end: { x: MARGEN + 190, y: y - 12 }, color: BORDE, thickness: 0.8 })
    page.drawText(e?.nombre ?? corte.emitido_por_nombre ?? corte.emitido_por, { x: MARGEN, y: y - 24, size: 9, font: fB, color: TINTA })
    page.drawText(e?.area ?? 'GESTIÓN ADMINISTRATIVA', { x: MARGEN, y: y - 35, size: 7, font: fR, color: GRIS })
    const contacto = [e?.correo, e?.telefono].filter(Boolean).join(' · ')
    if (contacto) page.drawText(contacto, { x: MARGEN, y: y - 45, size: 7, font: fR, color: GRIS })
    y -= 58
  }
  page.drawText('Documento generado por el SIGP y congelado al emitir — un corte entregado es un hecho, no una vista.',
    { x: MARGEN, y: y - 8, size: 6.8, font: fR, color: GRIS_MEDIO })

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
