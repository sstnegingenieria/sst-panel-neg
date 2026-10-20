/**
 * censoConsecutivos — verificación PROGRAMADA de contigüidad de las series
 * (19/20-oct-2026, condición de Giovanny sobre el mapa prefijo→roles: la
 * señal de huecos "no puede ser un script que alguien se acuerde de correr —
 * si no tiene dónde verse, no existe").
 *
 * PRIMER Cloud Scheduler del proyecto. Corre cada lunes 07:00 (Bogotá):
 * por cada serie CON contador compara `consecutivos/{serie}.ultimo` contra
 * los números realmente usados en su colección y persiste el resultado en
 * `configuracion/censo_consecutivos` (lo escribe SOLO esta CF con Admin SDK;
 * el Panel SIGP lo LEE por la regla genérica de configuracion — accesoSIGP —
 * y pinta el chip con LA FECHA del censo: un censo vencido se muestra como
 * "no sé", que es distinto de "todo bien").
 *
 * SI EL SCHEDULER FALLA: no se pierde ningún dato (el censo es derivado);
 * el chip del Panel pasa solo a "censo vencido" cuando la fecha supera el
 * umbral — esa ES la alarma de que el scheduler está caído. RE-CORRIDA A
 * MANO: consola de GCP → Cloud Scheduler → job
 * `firebase-schedule-censoConsecutivos-us-central1` → "Forzar ejecución"
 * (o `gcloud scheduler jobs run firebase-schedule-censoConsecutivos-us-central1
 * --location=us-central1 --project=neg-sst-app`).
 *
 * Costo medido: ~600 lecturas por corrida semanal — despreciable.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

// Nota: admin.initializeApp() ya se llama en index.js — no re-inicializar

// Serie anual → [colección, campo que lleva el consecutivo]. Solo series EN
// USO (espejo del mapa de generarConsecutivo); una serie sin contador en
// `consecutivos` se omite (no existe → no puede tener huecos).
//
// ⚠ AC/AP/MEJ (pendientes, 0 emitidas al 20-oct-2026): las TRES series viven
// en UNA colección compartida (`acciones_mejora`, campo `consecutivo`, dato
// del frente SGI/SST) — sumarlas NO es solo mapear [colección, campo]:
// `numerosUsadosDe` toma todos los consecutivos de la colección sin mirar el
// prefijo, y un AP-2026-001 contaría como "usado 1" también para la serie AC
// (huecos fantasma o huecos tapados). Al agregarlas hay que filtrar por
// prefijo del VALOR leído (startsWith sobre el consecutivo). El frente avisa
// cuando exista la primera emitida.
const SERIES_ANUALES = {
  SOL: ['solicitudes', 'consecutivo'],
  VIS: ['visitas', 'consecutivo'],
  COT: ['cotizaciones', 'consecutivo'],
  PRY: ['proyectos', 'consecutivo'],
  OC: ['ordenes_compra', 'consecutivo'],
  PEA: ['propuestas_actividad', 'consecutivo'],
  LIC: ['licitaciones', 'consecutivo'],
};
// CAT es acumulativo (sin año): catalogo_items.codigo = CAT-NNNN.
const SERIE_CAT = ['catalogo_items', 'codigo'];

// HUECOS DOCUMENTADOS — los únicos aceptados, cada uno con su acta. Un hueco
// nuevo NO se agrega aquí sin bitácora que lo explique.
//  - COT_2026 1–9: limpieza AUTORIZADA del 16-jul-2026 (cotizaciones de
//    prueba del arranque, borradas con respaldo; nota al SGI en bitácora).
const HUECOS_DOCUMENTADOS = {
  COT_2026: [1, 2, 3, 4, 5, 6, 7, 8, 9],
};

/** Número de la serie desde un consecutivo "PREFIJO-YYYY-NNN" o "CAT-NNNN". */
function numeroDeConsecutivo(consecutivo) {
  const m = /-(\d{3,})$/.exec(String(consecutivo ?? ''));
  return m ? Number(m[1]) : null;
}

/** Censo PURO de una serie: huecos = 1..ultimo ∉ usados; sin_documentar =
 *  huecos ∉ whitelist. Exportada para los tests. */
function calcularCensoSerie(ultimo, numerosUsados, documentados = []) {
  const usados = new Set(numerosUsados);
  const doc = new Set(documentados);
  const huecos = [];
  const sinDocumentar = [];
  for (let i = 1; i <= ultimo; i++) {
    if (!usados.has(i)) {
      huecos.push(i);
      if (!doc.has(i)) sinDocumentar.push(i);
    }
  }
  return { huecos, sin_documentar: sinDocumentar };
}

async function numerosUsadosDe(db, coleccion, campo) {
  // select(campo): solo viaja el consecutivo, no el doc completo.
  const snap = await db.collection(coleccion).select(campo).get();
  const numeros = [];
  for (const d of snap.docs) {
    const n = numeroDeConsecutivo(d.get(campo));
    if (n != null) numeros.push(n);
  }
  return numeros;
}

async function correrCenso(db) {
  const año = new Date().getFullYear();
  const series = {};
  let totalSinDocumentar = 0;

  for (const [prefijo, [coleccion, campo]] of Object.entries(SERIES_ANUALES)) {
    const clave = `${prefijo}_${año}`;
    const contSnap = await db.doc(`consecutivos/${clave}`).get();
    if (!contSnap.exists) continue; // serie sin contador — nada que censar
    const ultimo = contSnap.data().ultimo || 0;
    const usados = await numerosUsadosDe(db, coleccion, campo);
    const r = calcularCensoSerie(ultimo, usados, HUECOS_DOCUMENTADOS[clave] || []);
    series[clave] = {
      ultimo,
      usados: new Set(usados).size,
      huecos: r.huecos,
      sin_documentar: r.sin_documentar,
    };
    totalSinDocumentar += r.sin_documentar.length;
  }

  // CAT acumulativo.
  const catSnap = await db.doc('consecutivos/CAT').get();
  if (catSnap.exists) {
    const ultimo = catSnap.data().ultimo || 0;
    const usados = await numerosUsadosDe(db, SERIE_CAT[0], SERIE_CAT[1]);
    const r = calcularCensoSerie(ultimo, usados, HUECOS_DOCUMENTADOS.CAT || []);
    series.CAT = { ultimo, usados: new Set(usados).size, huecos: r.huecos, sin_documentar: r.sin_documentar };
    totalSinDocumentar += r.sin_documentar.length;
  }

  return { series, total_sin_documentar: totalSinDocumentar };
}

const censoConsecutivos = onSchedule(
  {
    schedule: 'every monday 07:00',
    timeZone: 'America/Bogota',
    region: 'us-central1',
  },
  async () => {
    const db = admin.firestore();
    try {
      const resultado = await correrCenso(db);
      await db.doc('configuracion/censo_consecutivos').set({
        fecha: FieldValue.serverTimestamp(),
        series: resultado.series,
        total_sin_documentar: resultado.total_sin_documentar,
        ok: resultado.total_sin_documentar === 0,
      });
      console.log(`censoConsecutivos: ${resultado.total_sin_documentar} hueco(s) sin documentar`,
        JSON.stringify(Object.fromEntries(Object.entries(resultado.series).map(([k, v]) => [k, `${v.usados}/${v.ultimo}`]))));
    } catch (err) {
      // El doc NO se toca ante fallo: el chip envejece hacia "censo vencido"
      // — esa es la alarma honesta. Jamás escribir un "ok" que no se midió.
      console.error('censoConsecutivos: fallo del censo — el doc queda como estaba:', err);
      throw err;
    }
  },
);

module.exports = { censoConsecutivos, calcularCensoSerie, numeroDeConsecutivo, HUECOS_DOCUMENTADOS, SERIES_ANUALES };
