// PDF del CRONOGRAMA DE OBRA (08-nov-2026, C3) — generado, no armado a mano.
// Réplica del modelo de Giovanny para la licitación SENA Tunja (APU Y
// CRONOGRAMA.pdf, hojas 12-13), LEÍDO RENDERIZADO — detalles que el texto
// extraído no trae y que son parte de la forma:
//  - LEGAL APAISADO (1008×612 pt), paginación VERTICAL por filas con el
//    calendario completo repetido en cada hoja; si el plazo no cabe legible,
//    paginación HORIZONTAL adicional por bloques de semanas (bloquesDias).
//  - Las BARRAS SE INTERRUMPEN en domingos y festivos con un CONECTOR
//    PUNTEADO (segmentosLaborables) — el sábado trabaja (media jornada).
//  - La FASE es una barra resumen oscura con triángulos en los extremos.
//  - Los HITOS son filas en cursiva con rombo + fecha dd/mm.
//  - La VENTANA DE CORTE es un marco punteado LIMA de altura completa y sus
//    actividades van en lima (único uso del acento).
//  - Columnas no laborables sombreadas con rótulo VERTICAL (DOMINGO /
//    FESTIVO); sábado con rayado diagonal.
//  - Leyenda + nota de jornada BAJO LA REJILLA (festivos NOMBRADOS y hábiles
//    efectivos calculados) en TODAS las hojas, como el modelo.
// ⚠ El cuadro ISO sale con CÓDIGO PENDIENTE DE RATIFICACIÓN (Ingrid/GI).
import { PDFDocument, PDFFont, PDFPage, rgb, degrees } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { partir, cargarAssetsPdf } from './cotizacionPdf'
import { CRONOGRAMA_OBRA as ISO } from './isoControl'
import type { CronogramaObra, FaseCronograma, ActividadCronograma, HitoCronograma } from '../../types/sigp/cronograma'
import {
  festivosSetDe, tipoDia, sumarDias, diaSemanaDe, LETRA_DIA,
  type TipoDia,
} from './calendarioColombia'

export { cargarAssetsPdf }

const VERDE = rgb(0x62 / 255, 0x8e / 255, 0x3a / 255)
const VERDE_OSCURO = rgb(0x4f / 255, 0x73 / 255, 0x30 / 255)
const VERDE_PALIDO = rgb(0xf3 / 255, 0xf7 / 255, 0xee / 255)
const LIMA = rgb(0xd7 / 255, 0xda / 255, 0x33 / 255)
const TINTA = rgb(0x1c / 255, 0x1c / 255, 0x1c / 255)
const GRIS = rgb(0x45 / 255, 0x45 / 255, 0x45 / 255)
const GRIS_MEDIO = rgb(0x8a / 255, 0x8f / 255, 0x98 / 255)
const GRIS_DIA = rgb(0xdc / 255, 0xde / 255, 0xe2 / 255)
const BORDE = rgb(0xdd / 255, 0xe1 / 255, 0xdd / 255)
const BLANCO = rgb(1, 1, 1)

const ANCHO = 1008   // legal apaisado (como el modelo)
const ALTO = 612
const MARGEN = 36
const CONTENIDO = ANCHO - MARGEN * 2
const W_NOM = 236    // columna ACTIVIDAD
const W_COD = 34     // columna ÍTEM APU
const W_DIAS = CONTENIDO - W_NOM - W_COD
/** Ancho mínimo legible de la columna-día: por debajo, se pagina en
 *  horizontal por bloques de semanas completas. */
const DIA_MIN = 9.4

// ── Helpers PUROS (testeados en cronogramaPdf.test.ts) ──────────────────────

export interface DiaRender {
  dia: number
  iso: string
  tipo: TipoDia
  numero: number   // día del mes
  letra: string    // L M X J V S D
}

export function diasRender(fechaInicio: string, plazo: number): DiaRender[] {
  const festivos = festivosSetDe(fechaInicio, plazo)
  return Array.from({ length: plazo }, (_, i) => {
    const iso = sumarDias(fechaInicio, i)
    return {
      dia: i + 1, iso, tipo: tipoDia(iso, festivos),
      numero: Number(iso.slice(8, 10)), letra: LETRA_DIA[diaSemanaDe(iso)],
    }
  })
}

/** Tramos [d1,d2] de días TRABAJABLES dentro de la barra (el sábado trabaja;
 *  domingo y festivo parten la barra — el conector punteado va en el render). */
export function segmentosLaborables(diaInicio: number, diaFin: number, dias: DiaRender[]): [number, number][] {
  const out: [number, number][] = []
  let abierto: [number, number] | null = null
  for (let d = Math.max(1, diaInicio); d <= Math.min(diaFin, dias.length); d++) {
    const t = dias[d - 1].tipo
    if (t === 'domingo' || t === 'festivo') { if (abierto) { out.push(abierto); abierto = null } }
    else if (abierto) abierto[1] = d
    else abierto = [d, d]
  }
  if (abierto) out.push(abierto)
  return out
}

/** Bloques de días por hoja cuando el plazo no cabe legible: semanas
 *  COMPLETAS (el último bloque lleva el resto). Con todo cabiendo, un solo
 *  bloque — el caso del modelo (30 días en una hoja). */
export function bloquesDias(plazo: number, maxDias: number): { desde: number; hasta: number }[] {
  if (plazo <= maxDias) return [{ desde: 1, hasta: plazo }]
  const porBloque = Math.max(7, Math.floor(maxDias / 7) * 7)
  const out: { desde: number; hasta: number }[] = []
  for (let d = 1; d <= plazo; d += porBloque) out.push({ desde: d, hasta: Math.min(plazo, d + porBloque - 1) })
  return out
}

/** Rango [min,max] que cubre la fase (barras e hitos) para la barra resumen. */
export function rangoFase(fase: FaseCronograma): { d1: number; d2: number } | null {
  let d1 = Infinity, d2 = -Infinity
  for (const f of fase.filas) {
    if (f.tipo === 'actividad') { d1 = Math.min(d1, f.dia_inicio); d2 = Math.max(d2, f.dia_fin) }
    else { d1 = Math.min(d1, f.dia); d2 = Math.max(d2, f.dia) }
  }
  return d1 <= d2 ? { d1, d2 } : null
}

// ── Render ───────────────────────────────────────────────────────────────────

const fFecha = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const fDiaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

type Fila =
  | { t: 'fase'; fase: FaseCronograma; h: number; cont?: boolean }
  | { t: 'act'; fila: ActividadCronograma; lineas: string[]; h: number }
  | { t: 'hito'; fila: HitoCronograma; h: number }

export async function generarPdfCronograma(
  cr: CronogramaObra,
  assets: Awaited<ReturnType<typeof cargarAssetsPdf>>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  // Sin itálica: Montserrat italic no viaja en los assets de la casa — los
  // hitos se distinguen por el rombo + semibold verde (la cursiva del modelo
  // era un recurso del Excel, no de la marca).
  const [fR, fS, fB] = await Promise.all([
    doc.embedFont(assets.regular, { subset: true }),
    doc.embedFont(assets.semibold, { subset: true }),
    doc.embedFont(assets.bold, { subset: true }),
  ])
  const logoGris = await doc.embedPng(assets.logoGris)
  const logo = await doc.embedPng(assets.logo)
  doc.setTitle(`${cr.consecutivo} — Cronograma de obra`)
  doc.setAuthor('NEG Ingeniería S.A.S. BIC')

  const dias = diasRender(cr.fecha_inicio, cr.plazo_dias)
  const bloques = bloquesDias(cr.plazo_dias, Math.floor(W_DIAS / DIA_MIN))

  // ── Filas medidas (comunes a todos los bloques) ──
  // Altura de fila GENEROSA (observación de Giovanny, 08-nov): el modelo
  // llena la hoja — una rejilla apretada con media página en blanco se ve
  // menos sólida de lo que es, y esto es un anexo de licitación.
  const filas: Fila[] = []
  for (const fase of cr.fases) {
    filas.push({ t: 'fase', fase, h: 19 })
    for (const f of fase.filas) {
      if (f.tipo === 'hito') filas.push({ t: 'hito', fila: f, h: 17 })
      else {
        const lineas = partir(f.descripcion, fR, 7.2, W_NOM - 14)
        filas.push({ t: 'act', fila: f, lineas: lineas.slice(0, 2), h: Math.max(17, lineas.slice(0, 2).length * 9.4 + 7) })
      }
    }
  }

  // ── Pie común por página: leyenda + notas (altura medida una vez) ──
  const hayVentana = !!cr.ventana_corte
  const notas: { texto: string; font: PDFFont }[] = [
    { texto: cr.nota_jornada, font: fR },
    ...(cr.ventana_corte ? [{ texto: cr.ventana_corte.nota, font: fR }] : []),
    ...(cr.observaciones ? [{ texto: cr.observaciones, font: fR }] : []),
  ]
  const notasLineas = notas.map(n => partir(n.texto, n.font, 6.8, CONTENIDO - 4).map(l => ({ l, font: n.font })))
  const hNotas = notasLineas.reduce((s, b) => s + b.length * 8.6 + 2, 0)
  const Y_PIE = 46
  const H_LEYENDA = 14
  const pisoCuerpo = Y_PIE + 10 + hNotas + H_LEYENDA

  let page!: PDFPage
  const textoDer = (t: string, xDer: number, yy: number, size: number, font: PDFFont, color = TINTA) =>
    page.drawText(t, { x: xDer - font.widthOfTextAtSize(t, size), y: yy, size, font, color })
  const reglaMarca = (yTop: number, alto = 4) => {
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

  /** Cabecera de página: completa (1ª) o corrida (2+). Devuelve el y donde
   *  arranca el cuerpo. */
  const cabeceraPagina = (primera: boolean): number => {
    page = doc.addPage([ANCHO, ALTO])
    if (!primera) {
      const y0 = ALTO - 34
      page.drawText(cr.consecutivo, { x: MARGEN, y: y0, size: 10, font: fB, color: VERDE })
      textoDer(`CRONOGRAMA DE OBRA · ${ISO.codigo} · v${ISO.version}`, ANCHO - MARGEN, y0 + 1, 7, fR, GRIS_MEDIO)
      reglaMarca(y0 - 6, 3)
      return y0 - 18
    }
    // Cuadro ISO (patrón de la casa — código ROTULADO pendiente)
    const hIso = 52
    const yIso = ALTO - 30 - hIso
    const c1 = 180, c3 = 160
    const c2 = CONTENIDO - c1 - c3
    page.drawRectangle({ x: MARGEN, y: yIso, width: CONTENIDO, height: hIso, borderColor: BORDE, borderWidth: 1 })
    page.drawLine({ start: { x: MARGEN + c1, y: yIso }, end: { x: MARGEN + c1, y: yIso + hIso }, color: BORDE, thickness: 1 })
    page.drawLine({ start: { x: MARGEN + c1 + c2, y: yIso }, end: { x: MARGEN + c1 + c2, y: yIso + hIso }, color: BORDE, thickness: 1 })
    const filasIso: [string, string][] = [
      [ISO.area, ''], ['CÓDIGO:', ISO.codigo], ['VERSIÓN:', ISO.version], ['MODIFICADO:', ISO.modificado],
    ]
    let yl = yIso + hIso - 12
    for (const [k, v] of filasIso) {
      page.drawText(k, { x: MARGEN + 8, y: yl, size: 6.2, font: fB, color: TINTA })
      if (v) page.drawText(v, { x: MARGEN + 8 + fB.widthOfTextAtSize(k, 6.2) + 3, y: yl, size: 6, font: fR, color: TINTA })
      yl -= 11
    }
    const cx = MARGEN + c1 + c2 / 2
    const centrado = (t: string, yy: number, size: number, font: PDFFont) =>
      page.drawText(t, { x: cx - font.widthOfTextAtSize(t, size) / 2, y: yy, size, font, color: TINTA })
    centrado('NEG INGENIERÍA S.A.S., BIC', yIso + hIso - 13, 9, fB)
    centrado('NIT. 900.975.870-1', yIso + hIso - 23, 7.5, fR)
    centrado(ISO.area, yIso + hIso - 32, 6.5, fR)
    centrado(ISO.nombre, yIso + hIso - 43, 8, fS)
    const maxW = c3 - 24, maxH = hIso - 12
    const esc = Math.min(maxW / logo.width, maxH / logo.height)
    page.drawImage(logo, { x: MARGEN + c1 + c2 + (c3 - logo.width * esc) / 2, y: yIso + (hIso - logo.height * esc) / 2, width: logo.width * esc, height: logo.height * esc })
    let y = yIso - 6
    reglaMarca(y)
    y -= 22
    // Título (forma del modelo) + consecutivo a la derecha (forma de la casa)
    page.drawText('CRONOGRAMA DE OBRA', { x: MARGEN, y, size: 15, font: fB, color: VERDE })
    textoDer(cr.consecutivo, ANCHO - MARGEN, y, 15, fB, VERDE)
    y -= 12
    const tit = partir(cr.titulo, fS, 8.5, CONTENIDO - 320)
    page.drawText(tit[0] + (tit.length > 1 ? '…' : ''), { x: MARGEN, y, size: 8.5, font: fS, color: TINTA })
    textoDer(`Emisión N° ${cr.numero_cronograma}${cr.cotizacion_consecutivo ? ` · Ref. ${cr.cotizacion_consecutivo}${cr.cotizacion_version_medida != null ? ` v${cr.cotizacion_version_medida}` : ''}` : ''}`,
      ANCHO - MARGEN, y + 1, 7, fS, GRIS_MEDIO)
    y -= 11
    page.drawText(`CLIENTE: ${cr.cliente.toUpperCase()}${cr.cliente_nit ? ` · NIT ${cr.cliente_nit}` : ''}`, { x: MARGEN, y, size: 7.5, font: fB, color: VERDE_OSCURO })
    textoDer(`Plazo: ${cr.plazo_dias} días calendario · del ${fFecha(cr.fecha_inicio)} al ${fFecha(cr.fecha_fin)}`, ANCHO - MARGEN, y, 7.5, fB, TINTA)
    y -= 10
    page.drawText(`${cr.proyecto_consecutivo}`, { x: MARGEN, y, size: 7, font: fS, color: GRIS_MEDIO })
    textoDer(`Contratista: ${cr.contratista}`, ANCHO - MARGEN, y, 7, fR, GRIS)
    return y - 8
  }

  /** Dibuja leyenda + notas INMEDIATAMENTE BAJO la rejilla (como el modelo —
   *  no ancladas al pie de la hoja); `pisoCuerpo` garantiza que siempre
   *  quepan encima del pie institucional. */
  const pieContenido = (yDesde: number) => {
    let yy = yDesde - H_LEYENDA
    // leyenda
    let x = MARGEN
    const item = (dibujo: (xx: number, cy: number) => void, label: string, wGlifo: number) => {
      const cy = yy + 3
      dibujo(x, cy)
      page.drawText(label, { x: x + wGlifo + 4, y: yy + 1, size: 6.4, font: fR, color: GRIS })
      x += wGlifo + 4 + fR.widthOfTextAtSize(label, 6.4) + 16
    }
    item((xx, cy) => page.drawRectangle({ x: xx, y: cy - 2, width: 16, height: 5, color: VERDE }), 'Actividad', 16)
    if (hayVentana) item((xx, cy) => page.drawRectangle({ x: xx, y: cy - 2, width: 16, height: 5, color: LIMA }), 'Actividad en ventana de corte programado', 16)
    item((xx, cy) => {
      page.drawRectangle({ x: xx, y: cy - 1, width: 16, height: 3, color: VERDE_OSCURO })
      page.drawSvgPath('M 0 0 L 5 0 L 2.5 4.5 Z', { x: xx, y: cy + 2.5, color: VERDE_OSCURO })
      page.drawSvgPath('M 0 0 L 5 0 L 2.5 4.5 Z', { x: xx + 11, y: cy + 2.5, color: VERDE_OSCURO })
    }, 'Fase (resumen)', 16)
    item((xx, cy) => page.drawSvgPath('M 3.2 0 L 6.4 3.2 L 3.2 6.4 L 0 3.2 Z', { x: xx, y: cy + 4.5, color: VERDE_OSCURO }), 'Hito', 8)
    item((xx, cy) => page.drawRectangle({ x: xx, y: cy - 2, width: 16, height: 6, color: GRIS_DIA }), 'Domingo / festivo (no laborable)', 16)
    item((xx, cy) => {
      page.drawRectangle({ x: xx, y: cy - 2, width: 16, height: 6, borderColor: GRIS_DIA, borderWidth: 0.7 })
      for (let s = 0; s < 4; s++) page.drawLine({ start: { x: xx + 1 + s * 4, y: cy - 2 }, end: { x: xx + 4 + s * 4, y: cy + 4 }, color: GRIS_DIA, thickness: 0.7 })
    }, 'Sábado: solo jornada de la mañana', 16)
    // notas
    yy -= 4
    for (const bloque of notasLineas) {
      for (const { l, font } of bloque) { yy -= 8.6; page.drawText(l, { x: MARGEN, y: yy, size: 6.8, font, color: GRIS }) }
      yy -= 2
    }
  }

  // ── Paginación: bloques (horizontal) × filas (vertical) ──
  let primera = true
  for (const bloque of bloques) {
    const nDias = bloque.hasta - bloque.desde + 1
    const wDia = W_DIAS / nDias
    const X_DIAS = MARGEN + W_NOM + W_COD

    let idx = 0
    while (idx < filas.length) {
      let yTop = cabeceraPagina(primera)
      primera = false
      if (bloques.length > 1) {
        textoDer(`Días ${bloque.desde}–${bloque.hasta} de ${cr.plazo_dias}`, ANCHO - MARGEN, yTop - 2, 7.5, fB, VERDE_OSCURO)
      }

      // ¿Qué filas caben en esta página?
      const H_CAB_GRID = 30
      let hDisponible = yTop - H_CAB_GRID - pisoCuerpo
      const pagina: Fila[] = []
      // una fase partida por el salto de página reabre con su banda "(cont.)"
      // (patrón del corte) — el lector de la hoja 2 sabe de qué fase viene
      if (idx < filas.length && filas[idx].t !== 'fase') {
        let fasePrev: FaseCronograma | null = null
        for (let j = idx - 1; j >= 0; j--) { const fj = filas[j]; if (fj.t === 'fase') { fasePrev = fj.fase; break } }
        if (fasePrev) { pagina.push({ t: 'fase', fase: fasePrev, h: 19, cont: true }); hDisponible -= 19 }
      }
      while (idx < filas.length) {
        const f = filas[idx]
        // la banda de fase no queda huérfana: entra solo si cabe con su 1ª fila
        const hNecesaria = f.t === 'fase' && idx + 1 < filas.length ? f.h + filas[idx + 1].h : f.h
        if (hNecesaria > hDisponible && pagina.length > 0) {
          // ANTI-VIUDA: si lo que queda del documento cabe comiéndose un
          // pelo del aire del pie (≤ 14 pt), entra aquí — una hoja final
          // con una sola fila se ve peor que un pie 14 pt más apretado.
          const resto = filas.slice(idx).reduce((s, fr) => s + fr.h, 0)
          if (resto <= hDisponible + 14) { for (const fr of filas.slice(idx)) pagina.push(fr); idx = filas.length }
          break
        }
        pagina.push(f); hDisponible -= f.h; idx++
      }
      const hCuerpo = pagina.reduce((s, f) => s + f.h, 0)
      const yGrid = yTop - H_CAB_GRID        // tope del cuerpo (bajo la cabecera de la rejilla)
      const yFin = yGrid - hCuerpo           // piso del cuerpo

      // ── Cabecera de la rejilla: banda de semanas + número + letra ──
      {
        // columna ACTIVIDAD / ÍTEM
        page.drawRectangle({ x: MARGEN, y: yGrid, width: W_NOM + W_COD, height: H_CAB_GRID, color: VERDE })
        page.drawText('ACTIVIDAD', { x: MARGEN + 8, y: yGrid + H_CAB_GRID / 2 - 3, size: 7.5, font: fB, color: BLANCO })
        textoDer('ÍTEM', MARGEN + W_NOM + W_COD - 4, yGrid + H_CAB_GRID / 2 + 2, 5.6, fS, BLANCO)
        textoDer('APU', MARGEN + W_NOM + W_COD - 4, yGrid + H_CAB_GRID / 2 - 5, 5.6, fS, BLANCO)
        // semanas (numeración GLOBAL)
        let d = bloque.desde
        while (d <= bloque.hasta) {
          const sem = Math.ceil(d / 7)
          const hastaSem = Math.min(bloque.hasta, sem * 7)
          const x0 = X_DIAS + (d - bloque.desde) * wDia
          const w = (hastaSem - d + 1) * wDia
          page.drawRectangle({ x: x0, y: yGrid + 17, width: w - 0.6, height: 13, color: VERDE })
          const rot = hastaSem - d + 1 >= 3 ? `SEMANA ${sem}` : `S${sem}`
          page.drawText(rot, { x: x0 + w / 2 - fB.widthOfTextAtSize(rot, 6) / 2, y: yGrid + 21.5, size: 6, font: fB, color: BLANCO })
          d = hastaSem + 1
        }
        // número del mes + letra del día
        for (let dd = bloque.desde; dd <= bloque.hasta; dd++) {
          const info = dias[dd - 1]
          const x0 = X_DIAS + (dd - bloque.desde) * wDia
          const finde = info.tipo !== 'habil'
          if (finde) page.drawRectangle({ x: x0, y: yGrid, width: wDia, height: 17, color: VERDE_PALIDO })
          const n1 = String(info.numero)
          page.drawText(n1, { x: x0 + wDia / 2 - fS.widthOfTextAtSize(n1, 5.8) / 2, y: yGrid + 9.5, size: 5.8, font: fS, color: TINTA })
          page.drawText(info.letra, { x: x0 + wDia / 2 - fR.widthOfTextAtSize(info.letra, 5.2) / 2, y: yGrid + 2.5, size: 5.2, font: fR, color: GRIS_MEDIO })
        }
        page.drawLine({ start: { x: MARGEN, y: yGrid }, end: { x: MARGEN + CONTENIDO, y: yGrid }, color: VERDE, thickness: 1 })
      }

      // ── Fondos de columna del cuerpo (no laborables + sábado + rejilla) ──
      for (let dd = bloque.desde; dd <= bloque.hasta; dd++) {
        const info = dias[dd - 1]
        const x0 = X_DIAS + (dd - bloque.desde) * wDia
        if (info.tipo === 'domingo' || info.tipo === 'festivo') {
          page.drawRectangle({ x: x0, y: yFin, width: wDia, height: hCuerpo, color: GRIS_DIA, opacity: 0.55 })
          if (hCuerpo > 64 && wDia >= 8) {
            const rot = info.tipo === 'domingo' ? 'DOMINGO' : 'FESTIVO'
            page.drawText(rot, { x: x0 + wDia / 2 + 2, y: yFin + hCuerpo / 2 - fR.widthOfTextAtSize(rot, 5) / 2, size: 5, font: fR, color: GRIS_MEDIO, rotate: degrees(90) })
          }
        } else if (info.tipo === 'sabado') {
          const paso = 5
          for (let yy = yFin - wDia; yy < yFin + hCuerpo; yy += paso) {
            const yA = Math.max(yFin, yy), yB = Math.min(yFin + hCuerpo, yy + wDia)
            if (yB > yA) page.drawLine({ start: { x: x0 + (yA - yy), y: yA }, end: { x: x0 + (yB - yy), y: yB }, color: GRIS_DIA, thickness: 0.6 })
          }
        }
        page.drawLine({ start: { x: x0, y: yFin }, end: { x: x0, y: yGrid }, color: BORDE, thickness: 0.3 })
      }
      page.drawLine({ start: { x: X_DIAS + nDias * wDia, y: yFin }, end: { x: X_DIAS + nDias * wDia, y: yGrid }, color: BORDE, thickness: 0.3 })

      // ── Filas ──
      let yFila = yGrid
      for (const f of pagina) {
        const h = f.h
        const yBase = yFila - h
        const cy = yBase + h / 2            // centro vertical de la fila
        if (f.t === 'fase') {
          page.drawRectangle({ x: MARGEN, y: yBase, width: W_NOM + W_COD, height: h, color: VERDE_PALIDO })
          const nom = partir(f.fase.nombre.toUpperCase() + (f.cont ? ' (CONT.)' : ''), fB, 7.4, W_NOM + W_COD - 12)[0]
          page.drawText(nom, { x: MARGEN + 6, y: cy - 2.6, size: 7.4, font: fB, color: VERDE_OSCURO })
          page.drawRectangle({ x: MARGEN + W_NOM + W_COD, y: yBase, width: nDias * wDia, height: h, color: VERDE_PALIDO, opacity: 0.45 })
          const r = rangoFase(f.fase)
          if (r) {
            const a = Math.max(r.d1, bloque.desde), b = Math.min(r.d2, bloque.hasta)
            if (a <= b) {
              const x1 = X_DIAS + (a - bloque.desde) * wDia + 1
              const x2 = X_DIAS + (b - bloque.desde + 1) * wDia - 1
              page.drawRectangle({ x: x1, y: cy - 1.6, width: x2 - x1, height: 3.2, color: VERDE_OSCURO })
              if (r.d1 >= bloque.desde) page.drawSvgPath('M 0 0 L 5.6 0 L 2.8 5 Z', { x: x1, y: cy - 1.2, color: VERDE_OSCURO })
              if (r.d2 <= bloque.hasta) page.drawSvgPath('M 0 0 L 5.6 0 L 2.8 5 Z', { x: x2 - 5.6, y: cy - 1.2, color: VERDE_OSCURO })
              else {
                // la fase continúa en el siguiente bloque: flecha punteada
                page.drawLine({ start: { x: x2, y: cy }, end: { x: x2 + 6, y: cy }, color: VERDE_OSCURO, thickness: 1, dashArray: [1.5, 1.5] })
              }
            }
          }
        } else if (f.t === 'hito') {
          const nom = partir(f.fila.nombre, fS, 7.2, W_NOM - 14)[0]
          page.drawText(nom, { x: MARGEN + 10, y: cy - 2.6, size: 7.2, font: fS, color: VERDE_OSCURO })
          if (f.fila.dia >= bloque.desde && f.fila.dia <= bloque.hasta) {
            const xC = X_DIAS + (f.fila.dia - bloque.desde) * wDia + wDia / 2
            page.drawSvgPath('M 3.8 0 L 7.6 3.8 L 3.8 7.6 L 0 3.8 Z', { x: xC - 3.8, y: cy + 3.8, color: VERDE_OSCURO })
            const et = fDiaMes(dias[f.fila.dia - 1].iso)
            const xEt = xC + 6
            if (xEt + fS.widthOfTextAtSize(et, 6) < X_DIAS + nDias * wDia - 2)
              page.drawText(et, { x: xEt, y: cy - 2.2, size: 6, font: fS, color: VERDE_OSCURO })
            else textoDer(et, xC - 6, cy - 2.2, 6, fS, VERDE_OSCURO)
          }
        } else {
          const a = f.fila
          const yTxt = yBase + h - 10.6
          f.lineas.forEach((l, i) => page.drawText(l, { x: MARGEN + 10, y: yTxt - i * 9.4, size: 7.2, font: fR, color: TINTA }))
          if (a.item_codigo) {
            const cod = a.item_codigo.slice(0, 7)
            page.drawText(cod, { x: MARGEN + W_NOM + (W_COD - fR.widthOfTextAtSize(cod, 6.4)) / 2, y: cy - 2.3, size: 6.4, font: fR, color: GRIS })
          }
          // barra: segmentos laborables + conector punteado en los huecos
          const colorBarra = a.en_ventana ? LIMA : VERDE
          const segs = segmentosLaborables(Math.max(a.dia_inicio, bloque.desde), Math.min(a.dia_fin, bloque.hasta), dias)
          segs.forEach(([s1, s2], i) => {
            const x1 = X_DIAS + (s1 - bloque.desde) * wDia + 0.8
            const x2 = X_DIAS + (s2 - bloque.desde + 1) * wDia - 0.8
            page.drawRectangle({ x: x1, y: cy - 3.2, width: x2 - x1, height: 6.4, color: colorBarra })
            if (i > 0) {
              const [, prevFin] = segs[i - 1]
              const xa = X_DIAS + (prevFin - bloque.desde + 1) * wDia - 0.8
              page.drawLine({ start: { x: xa, y: cy }, end: { x: x1, y: cy }, color: colorBarra, thickness: 1, dashArray: [1.6, 1.6] })
            }
          })
        }
        page.drawLine({ start: { x: MARGEN, y: yBase }, end: { x: MARGEN + CONTENIDO, y: yBase }, color: BORDE, thickness: 0.3 })
        yFila = yBase
      }
      // separador vertical de la columna de nombres
      page.drawLine({ start: { x: MARGEN + W_NOM, y: yFin }, end: { x: MARGEN + W_NOM, y: yGrid }, color: BORDE, thickness: 0.4 })
      page.drawLine({ start: { x: MARGEN + W_NOM + W_COD, y: yFin }, end: { x: MARGEN + W_NOM + W_COD, y: yGrid }, color: BORDE, thickness: 0.6 })
      page.drawLine({ start: { x: MARGEN, y: yFin }, end: { x: MARGEN, y: yGrid }, color: BORDE, thickness: 0.6 })
      page.drawLine({ start: { x: MARGEN + CONTENIDO, y: yFin }, end: { x: MARGEN + CONTENIDO, y: yGrid }, color: BORDE, thickness: 0.6 })

      // ── Ventana de corte programado: marco punteado LIMA de altura completa ──
      if (cr.ventana_corte) {
        const v = cr.ventana_corte
        const a = Math.max(v.dia_inicio, bloque.desde), b = Math.min(v.dia_fin, bloque.hasta)
        if (a <= b) {
          page.drawRectangle({
            x: X_DIAS + (a - bloque.desde) * wDia, y: yFin,
            width: (b - a + 1) * wDia, height: yGrid - yFin,
            borderColor: LIMA, borderWidth: 1.4, borderDashArray: [3, 2],
          })
        }
      }

      pieContenido(yFin)
    }
  }

  // ── Pie institucional + numeración (todas las páginas) ──
  const paginas = doc.getPages()
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: MARGEN, y: Y_PIE }, end: { x: ANCHO - MARGEN, y: Y_PIE }, color: BORDE, thickness: 0.8 })
    const wLogo = 104
    const hLogo = wLogo * (logoGris.height / logoGris.width)
    p.drawImage(logoGris, { x: MARGEN, y: Y_PIE - 10 - hLogo, width: wLogo, height: hLogo })
    const t2 = 'NEG Ingeniería S.A.S. BIC · www.negingenieria.com'
    p.drawText(t2, { x: ANCHO - MARGEN - fR.widthOfTextAtSize(t2, 7), y: Y_PIE - 22, size: 7, font: fR, color: GRIS })
    const t3 = 'Documento generado por el SIGP y congelado al emitir — una modificación del plan se emite como cronograma nuevo.'
    p.drawText(t3, { x: MARGEN + wLogo + 14, y: Y_PIE - 22, size: 6.4, font: fR, color: GRIS_MEDIO })
    const t = `Hoja ${i + 1} de ${paginas.length}`
    p.drawText(t, { x: ANCHO - MARGEN - fR.widthOfTextAtSize(t, 6.8), y: Y_PIE + 6, size: 6.8, font: fR, color: GRIS_MEDIO })
  })

  return doc.save()
}
