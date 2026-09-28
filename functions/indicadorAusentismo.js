/**
 * indicadorAusentismo — integración Ausentismo → indicador SG-SST (SST-IND-26).
 *
 * "Un hecho, un lugar": Horario ya registra las ausencias (`ausentismos`) y
 * RRHH ya mantiene el maestro de personal directo (`empleados_directos`).
 * Este indicador NO tiene bitácora propia — se auto-alimenta recalculando
 * desde esas dos colecciones cada vez que cambian.
 *
 * Decisiones de negocio (Gestión Integral / Ingrid, 24-sep-2026):
 *  - Jornada lunes a viernes; no se trabajan festivos.
 *  - El denominador es TODO el equipo, prorrateado por los días que cada
 *    empleado estuvo activo en el año (no conteo de activos × días hábiles
 *    del año completo).
 *
 * Contrato de escritura con `indicador_mediciones` (acordado con la sesión
 * dueña de Indicadores):
 *  - Resuelve indicador_id por query (codigo=='SST-IND-26'), nunca hardcode
 *    del doc-id (los ids del catálogo son autogenerados).
 *  - Toca SOLO numerador, denominador, registrado_por, fuente_auto,
 *    es_referencia. NUNCA mete la mano en meta ni interpretacion — esos los
 *    edita Gestión Integral desde el panel.
 *  - Si el doc del periodo no existe, lo crea con meta:0/interpretacion:''
 *    (el indicador es pendiente_validacion — sin esos valores no pinta
 *    semáforo, así que son defaults inertes, no una afirmación).
 *  - JAMÁS lee `ausentismos/{id}/privado/detalle` (dato de salud, línea dura
 *    del módulo Horario) — el agregado no necesita el diagnóstico, solo
 *    tipo/fecha/estado, todos en el doc padre.
 */
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

const CODIGO_INDICADOR = 'SST-IND-26';

// ── Festivos de Colombia — algoritmo puro, NUNCA una lista fija por año ────
// Pascua por el algoritmo de Gauss/Meeus (calendario gregoriano) + Ley
// Emiliani: los festivos "trasladables" se mueven al lunes siguiente si no
// caen ya en lunes. Validado contra 2026: 18 fechas exactas (no 19 — hay un
// festivo de origen no colombiano que circuló en la verificación previa y
// se descartó a propósito).
function domingoPascua(anio) {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anio, mes - 1, dia);
}

function sumarDias(fecha, n) {
  const r = new Date(fecha);
  r.setDate(r.getDate() + n);
  return r;
}

/** Traslada a lunes siguiente (Ley Emiliani) — si ya cae en lunes, no se mueve. */
function proximoLunes(fecha) {
  const r = new Date(fecha);
  const dow = r.getDay();
  if (dow === 1) return r;
  r.setDate(r.getDate() + ((1 - dow + 7) % 7));
  return r;
}

function claveFecha(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Los 18 festivos oficiales colombianos del año, como claves 'YYYY-MM-DD'. */
function festivosColombia(anio) {
  const pascua = domingoPascua(anio);
  // Fijos — jamás se trasladan.
  const fijos = [[1, 1], [5, 1], [7, 20], [8, 7], [12, 8], [12, 25]]
    .map(([m, d]) => new Date(anio, m - 1, d));
  // Basados en Pascua — jueves y viernes santo NO se trasladan (ya caen
  // entre semana por definición); ascensión/corpus/sagrado corazón sí.
  const basadosEnPascua = [
    sumarDias(pascua, -3),
    sumarDias(pascua, -2),
    proximoLunes(sumarDias(pascua, 39)),
    proximoLunes(sumarDias(pascua, 60)),
    proximoLunes(sumarDias(pascua, 68)),
  ];
  // Emiliani — fecha fija trasladada al lunes siguiente.
  const emiliani = [[1, 6], [3, 19], [6, 29], [8, 15], [10, 12], [11, 1], [11, 11]]
    .map(([m, d]) => proximoLunes(new Date(anio, m - 1, d)));
  return new Set([...fijos, ...basadosEnPascua, ...emiliani].map(claveFecha));
}

/**
 * Días hábiles (lunes a viernes, sin festivos) entre `inicio` y `fin`
 * (Date, ambos inclusive), acotados al año `anio` — la parte del rango que
 * cae fuera de ese año no cuenta. `festivos` es el Set de `festivosColombia`
 * del mismo año (se pasa para no recalcularlo por cada ausentismo/empleado).
 */
function diasHabilesEnRango(inicio, fin, anio, festivos) {
  const desde = new Date(Math.max(inicio.getTime(), new Date(anio, 0, 1).getTime()));
  const hasta = new Date(Math.min(fin.getTime(), new Date(anio, 11, 31).getTime()));
  if (desde > hasta) return 0;
  let dias = 0;
  const cursor = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const limite = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  while (cursor <= limite) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6 && !festivos.has(claveFecha(cursor))) dias++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

function tsADate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  return new Date(ts);
}

/** Años calendario tocados por un doc (según sus fechas de rango). */
function aniosDeRango(fechaInicio, fechaFin) {
  const anios = new Set();
  const desde = tsADate(fechaInicio);
  const hasta = tsADate(fechaFin);
  if (!desde || !hasta) return anios;
  for (let a = desde.getFullYear(); a <= hasta.getFullYear(); a++) anios.add(a);
  return anios;
}

/** Numerador: Σ días hábiles de incapacidades activas, acotado al año. */
async function calcularNumerador(db, anio, festivos) {
  const snap = await db.collection('ausentismos')
    .where('tipo', '==', 'incapacidad')
    .where('estado', '==', 'activo')
    .get();
  let total = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    const inicio = tsADate(d.fecha_inicio);
    const fin = tsADate(d.fecha_fin);
    if (!inicio || !fin) continue;
    total += diasHabilesEnRango(inicio, fin, anio, festivos);
  }
  return total;
}

/**
 * Denominador: Σ, por cada empleado del maestro, de sus días hábiles en la
 * ventana REAL que estuvo activo dentro del año — no conteo×días-del-año.
 * Un empleado que ingresó en julio solo aporta desde julio; uno retirado en
 * marzo solo aporta hasta marzo.
 */
async function calcularDenominador(db, anio, festivos) {
  const snap = await db.collection('empleados_directos').get();
  const inicioAnio = new Date(anio, 0, 1);
  const finAnio = new Date(anio, 11, 31);
  let total = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    const ingreso = tsADate(d.fecha_ingreso);
    if (!ingreso) continue;
    const retiro = tsADate(d.fecha_retiro);
    const ventanaInicio = ingreso > inicioAnio ? ingreso : inicioAnio;
    const ventanaFin = retiro && retiro < finAnio ? retiro : finAnio;
    if (ventanaInicio > ventanaFin) continue; // no estuvo activo ese año
    total += diasHabilesEnRango(ventanaInicio, ventanaFin, anio, festivos);
  }
  return total;
}

async function resolverIndicadorId(db) {
  const snap = await db.collection('indicadores_sst')
    .where('codigo', '==', CODIGO_INDICADOR)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}

async function recalcularPeriodo(db, indicadorId, anio) {
  const festivos = festivosColombia(anio);
  const [numerador, denominador] = await Promise.all([
    calcularNumerador(db, anio, festivos),
    calcularDenominador(db, anio, festivos),
  ]);

  const periodo = String(anio);
  const medSnap = await db.collection('indicador_mediciones')
    .where('indicador_id', '==', indicadorId)
    .where('periodo', '==', periodo)
    .limit(1)
    .get();

  const campos = {
    numerador,
    denominador,
    registrado_por: 'cf:ausentismo',
    fuente_auto: 'ausentismos',
    es_referencia: false,
  };

  if (!medSnap.empty) {
    const ref = medSnap.docs[0].ref;
    const actual = medSnap.docs[0].data();
    // compare-before-write: no tocar el doc si el agregado no cambió.
    if (actual.numerador === numerador && actual.denominador === denominador) return;
    await ref.update(campos);
  } else {
    await db.collection('indicador_mediciones').add({
      indicador_id: indicadorId,
      periodo,
      meta: 0,
      interpretacion: '',
      fecha: FieldValue.serverTimestamp(),
      ...campos,
    });
  }
}

async function recalcularAusentismoIndicador(anios) {
  if (anios.size === 0) return;
  const db = admin.firestore();
  const indicadorId = await resolverIndicadorId(db);
  if (!indicadorId) return; // catálogo sin sembrar todavía — nada que actualizar
  for (const anio of anios) {
    await recalcularPeriodo(db, indicadorId, anio);
  }
}

const recalcularAlEscribirAusentismo = onDocumentWritten(
  { document: 'ausentismos/{ausentismoId}', region: 'us-central1' },
  async (event) => {
    const antes = event.data?.before?.exists ? event.data.before.data() : null;
    const despues = event.data?.after?.exists ? event.data.after.data() : null;
    const anios = new Set([
      ...(antes ? aniosDeRango(antes.fecha_inicio, antes.fecha_fin) : []),
      ...(despues ? aniosDeRango(despues.fecha_inicio, despues.fecha_fin) : []),
    ]);
    await recalcularAusentismoIndicador(anios);
  },
);

const recalcularAlEscribirEmpleado = onDocumentWritten(
  { document: 'empleados_directos/{empleadoId}', region: 'us-central1' },
  async (event) => {
    const antes = event.data?.before?.exists ? event.data.before.data() : null;
    const despues = event.data?.after?.exists ? event.data.after.data() : null;
    const anios = new Set();
    for (const d of [antes, despues]) {
      if (!d) continue;
      const ingreso = tsADate(d.fecha_ingreso);
      if (!ingreso) continue;
      const retiro = tsADate(d.fecha_retiro);
      const hasta = retiro ?? new Date();
      for (let a = ingreso.getFullYear(); a <= hasta.getFullYear(); a++) anios.add(a);
    }
    await recalcularAusentismoIndicador(anios);
  },
);

module.exports = {
  recalcularAlEscribirAusentismo,
  recalcularAlEscribirEmpleado,
  // Exportadas para tests (createRequire, patrón claims.test.ts/horario.test.ts).
  festivosColombia,
  diasHabilesEnRango,
  domingoPascua,
};
