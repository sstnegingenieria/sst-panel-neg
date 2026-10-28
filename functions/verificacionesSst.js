/**
 * sincronizarVerificacionSst — Bloque 3a + Parte A del bloque proyección/saldo
 * (28-oct: PROYECCIÓN POR CONTRATISTA).
 *
 * SST no tiene acceso a `proyectos` (contiene valor de venta, márgenes,
 * preliquidación — confidencial). Esta función mantiene las proyecciones
 * DELGADAS de `verificaciones_sst` con SOLO identidad y estado — NADA
 * financiero — para la cola "Verificación de contratistas" del área SST.
 *
 * DESDE EL 28-oct el doc es POR (proyecto, contratista) con id determinístico
 * `{proyectoId}__{contratistaId}` [R1] — el gate del PR #193 era por proyecto
 * y un proyecto puede tener VARIOS contratistas desde que el átomo bajó al
 * ítem: SST avala al CONTRATISTA en el proyecto (sus N asignaciones), no a la
 * asignación. El doc legacy `{proyectoId}` queda CONGELADO por la migración
 * (marcador `migrada_a`) y esta CF no lo escribe más.
 *
 * Contrato:
 *  - [A1] Se materializa cuando el proyecto entra a `enviado_a_facturacion`
 *    (decidido 23-oct — SST gana una etapa de margen antes del tramo
 *    liquidable) y se mantiene al día en cada write.
 *  - [R2/A7] `contratista_id` CONGELADO: viaja en el doc id y se escribe al
 *    crear; el upsert jamás lo cambia.
 *  - ⚠ HALLAZGO del paso 0 (27-oct): 78 de 79 asignaciones de prod NO traen
 *    campo `tipo` — la AUSENCIA es contratista. El filtro es
 *    `tipo !== 'administracion_directa'`; filtrar por `tipo === 'contratista'`
 *    dejaría la cola vacía. Las DIRECTAS no generan proyección [R5].
 *  - [R6] `activa` = el contratista tiene ≥1 asignación VIVA (ni cancelada ni
 *    liquidada). La huérfana NO se borra (su historial es evidencia de avales
 *    dados): sale de la cola por el flag.
 *  - Upsert con merge: JAMÁS toca `sst_gate`, `historial` ni `migrada_desde`
 *    — el gate lo posee SST (regla hasOnly) y la procedencia la escribe la
 *    migración.
 *  - [R4] El contratista que entra tarde recibe su proyección sola (su doc
 *    id), sin tocar las existentes; nace sin gate (= pendiente, DENIEGA).
 *  - Proyecto borrado → proyecciones del proyecto borradas (nuevas y legacy).
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

// [A1] Tramo que materializa la proyección: desde 'enviado_a_facturacion'
// (antes: 'facturado'). Mantener sincronizado con types/sigp/proyecto.ts.
const ESTADOS_TRAMO_PROYECCION = [
  'enviado_a_facturacion',
  'facturado',
  'pagado_cliente',
  'liquidado_contratista',
  'cerrado',
];

/** Estados de asignación que NO cuentan como vivas para `activa` [R6]. */
const ESTADOS_ASIGNACION_NO_VIVA = ['cancelada', 'liquidada'];

/** PURO (testeado por createRequire): agrupa las asignaciones por contratista.
 *  ⚠ AUSENCIA de `tipo` = contratista (hallazgo 27-oct: 78/79 sin el campo);
 *  las directas no generan proyección [R5]; sin contratista_id se omite. */
function agruparPorContratista(asigs) {
  const porContratista = new Map();
  for (const d of asigs) {
    if ((d.tipo ?? 'contratista') === 'administracion_directa') continue;
    const cid = d.contratista_id ?? '';
    if (!cid) continue;
    const e = porContratista.get(cid) ?? { nombre: '', vivas: 0 };
    e.nombre = d.contratista_nombre ?? e.nombre;
    if (!ESTADOS_ASIGNACION_NO_VIVA.includes(d.estado)) e.vivas += 1;
    porContratista.set(cid, e);
  }
  return porContratista;
}

/** Recalcula TODAS las proyecciones por-contratista de un proyecto
 *  (recálculo-desde-cero idempotente, patrón comprasProyecto). */
async function recalcularProyecto(proyectoId) {
  const db = admin.firestore();
  const proyRef = db.doc(`proyectos/${proyectoId}`);
  const proySnap = await proyRef.get();

  // Docs de este proyecto ya existentes (nuevos, con '__'): para marcar
  // huérfanas y para el borrado en cascada.
  const existentes = await db
    .collection('verificaciones_sst')
    .where('proyecto_id', '==', proyectoId)
    .get();
  const nuevosExistentes = existentes.docs.filter((d) => d.id.includes('__'));

  if (!proySnap.exists) {
    // proyecto borrado → ninguna proyección debe quedar huérfana
    const batch = db.batch();
    for (const d of existentes.docs) batch.delete(d.ref);
    await batch.commit();
    return;
  }

  const proyecto = proySnap.data();
  if (!ESTADOS_TRAMO_PROYECCION.includes(proyecto.estado)) return;

  const asigsSnap = await proyRef.collection('asignaciones').get();
  const porContratista = agruparPorContratista(asigsSnap.docs.map((a) => a.data()));

  const snapshot = proyecto.snapshot ?? {};
  const batch = db.batch();
  for (const [cid, info] of porContratista) {
    // SOLO identidad + estado. Prohibido agregar aquí valor_venta,
    // preliquidacion, margen o cualquier dato económico.
    batch.set(
      db.doc(`verificaciones_sst/${proyectoId}__${cid}`),
      {
        proyecto_id: proyectoId,
        consecutivo: proyecto.consecutivo ?? '',
        nombre_sitio: snapshot.nombre_sitio ?? '',
        codigo_sitio_cliente: snapshot.codigo_sitio_cliente ?? '',
        cliente_nombre: snapshot.cliente ?? '',
        contratista_id: cid,
        contratista_nombre: info.nombre,
        estado: proyecto.estado,
        obra_id: `pry_${proyectoId}`,
        activa: info.vivas > 0,
        fecha_sincronizacion: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  // Huérfanas [R6]: doc nuevo cuyo contratista ya no tiene asignación alguna
  // en el proyecto → activa: false (jamás se borra — historial = evidencia).
  for (const d of nuevosExistentes) {
    const cid = d.id.slice(proyectoId.length + 2);
    if (!porContratista.has(cid)) {
      batch.set(d.ref, { activa: false, fecha_sincronizacion: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  await batch.commit();
}

const sincronizarVerificacionSst = onDocumentWritten(
  {
    document: 'proyectos/{proyectoId}',
    region: 'us-central1',
  },
  async (event) => recalcularProyecto(event.params.proyectoId),
);

// [R4] Trigger sobre las ASIGNACIONES: el contratista que entra tarde, el
// reparto por ítems y las transiciones (cancelada/liquidada → activa) deben
// reflejarse sin esperar un write del padre.
const sincronizarVerificacionSstAsignaciones = onDocumentWritten(
  {
    document: 'proyectos/{proyectoId}/asignaciones/{asignacionId}',
    region: 'us-central1',
  },
  async (event) => recalcularProyecto(event.params.proyectoId),
);

module.exports = {
  sincronizarVerificacionSst,
  sincronizarVerificacionSstAsignaciones,
  // puros, testeados por createRequire (patrón claims/horario)
  agruparPorContratista,
  ESTADOS_TRAMO_PROYECCION,
  ESTADOS_ASIGNACION_NO_VIVA,
};
