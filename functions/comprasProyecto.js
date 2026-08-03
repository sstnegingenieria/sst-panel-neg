/**
 * sincronizarComprasProyecto — Módulo Compras C3 (auto-agregado).
 *
 * Mantiene la proyección `compras_proyecto/{proyectoId}` — el agregado de
 * compras REALES del proyecto que alimenta el indicador presupuestal (#3):
 *   compras_ejecutadas_total = Σ valor_real de OCs 'comprada'
 *                            + Σ valor de proyectos/{id}/compras_menores.
 *
 * Contrato (calca verificaciones_sst, Bloque 3a):
 *  - La escribe SOLO esta CF (Admin SDK). Las reglas no dan ningún write de
 *    cliente sobre compras_proyecto → a prueba de manipulación por
 *    construcción. Lectura: puedeVerOC() (sin sst ni comercial — §16/C2).
 *  - Dos triggers convergen en el mismo recálculo: ordenes_compra/{ocId} y
 *    proyectos/{proyectoId}/compras_menores/{compraId}. JAMÁS escucha
 *    `proyectos` (anti-bucle: escribir la proyección no re-dispara nada
 *    nuestro; el trigger de verificaciones_sst tampoco nos dispara).
 *  - RECÁLCULO-DESDE-CERO: idempotente ante entregas at-least-once y
 *    auto-corrige anulaciones/correcciones sin lógica compensatoria.
 *  - COMPARE-BEFORE-WRITE: si los 4 números no cambiaron, no se escribe
 *    (corta ecos y writes vacíos).
 *  - Query de igualdades puras (proyecto_id + estado) → sin índice compuesto.
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

const recalcular = async (proyectoId) => {
  if (!proyectoId) return;
  const db = admin.firestore();
  const ref = db.doc(`compras_proyecto/${proyectoId}`);

  const [ocsSnap, menoresSnap, actualSnap] = await Promise.all([
    db.collection('ordenes_compra')
      .where('proyecto_id', '==', proyectoId)
      .where('estado', '==', 'comprada')
      .get(),
    db.collection(`proyectos/${proyectoId}/compras_menores`).get(),
    ref.get(),
  ]);

  const ocsTotal = ocsSnap.docs.reduce((s, d) => s + (d.data().valor_real || 0), 0);
  const menoresTotal = menoresSnap.docs.reduce((s, d) => s + (d.data().valor || 0), 0);
  const nuevo = {
    ocs_compradas: ocsSnap.size,
    ocs_compradas_total: ocsTotal,
    compras_menores: menoresSnap.size,
    compras_menores_total: menoresTotal,
    compras_ejecutadas_total: ocsTotal + menoresTotal,
  };

  // compare-before-write sobre los números del agregado
  const actual = actualSnap.exists ? actualSnap.data() : null;
  if (actual && Object.keys(nuevo).every((k) => actual[k] === nuevo[k])) return;

  // proyecto_consecutivo denormalizado: de la primera OC, o un GET puntual a
  // proyectos (leer sí — escuchar jamás) cuando solo hay compras menores.
  let consecutivo = ocsSnap.docs[0]?.data().proyecto_consecutivo || actual?.proyecto_consecutivo || '';
  if (!consecutivo) {
    const p = await db.doc(`proyectos/${proyectoId}`).get();
    consecutivo = p.exists ? (p.data().consecutivo || '') : '';
  }

  await ref.set(
    {
      proyecto_id: proyectoId,
      proyecto_consecutivo: consecutivo,
      ...nuevo,
      fecha_sincronizacion: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
};

const opciones = { region: 'us-central1' };

const sincronizarComprasProyectoDesdeOC = onDocumentWritten(
  { ...opciones, document: 'ordenes_compra/{ocId}' },
  async (event) => {
    const antes = event.data?.before?.exists ? event.data.before.data() : null;
    const despues = event.data?.after?.exists ? event.data.after.data() : null;
    const idAntes = antes?.proyecto_id;
    const idDespues = despues?.proyecto_id;
    await recalcular(idDespues ?? idAntes);
    // Defensivo: si el enlace cambiara de proyecto (no debería), ambos convergen.
    if (idAntes && idDespues && idAntes !== idDespues) await recalcular(idAntes);
  },
);

const sincronizarComprasProyectoDesdeMenores = onDocumentWritten(
  { ...opciones, document: 'proyectos/{proyectoId}/compras_menores/{compraId}' },
  async (event) => recalcular(event.params.proyectoId),
);

module.exports = { sincronizarComprasProyectoDesdeOC, sincronizarComprasProyectoDesdeMenores };
