/**
 * sincronizarVerificacionSst — Bloque 3a (ajuste de confidencialidad).
 *
 * SST no tiene acceso a `proyectos` (contiene valor de venta, márgenes,
 * preliquidación — confidencial). Esta función mantiene la proyección
 * DELGADA `verificaciones_sst/{proyectoId}` con SOLO la identidad y el
 * estado del proyecto — NADA financiero — para la cola "Verificación de
 * contratistas" del área SST.
 *
 * Contrato:
 *  - Se materializa cuando el proyecto entra al tramo administrativo
 *    (facturado en adelante) y se mantiene al día en cada write.
 *  - Upsert con merge: JAMÁS toca `sst_gate` ni `historial` — esos campos
 *    los posee SST (regla hasOnly en verificaciones_sst).
 *  - Proyecto borrado → proyección borrada.
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

// Tramo administrativo: desde 'facturado' (ver ESTADO_INICIO_ADMINISTRATIVA
// en types/sigp/proyecto.ts — mantener sincronizado).
const ESTADOS_TRAMO_ADMINISTRATIVO = [
  'facturado',
  'pagado_cliente',
  'liquidado_contratista',
  'cerrado',
];

const sincronizarVerificacionSst = onDocumentWritten(
  {
    document: 'proyectos/{proyectoId}',
    region: 'us-central1',
  },
  async (event) => {
    const proyectoId = event.params.proyectoId;
    const ref = admin.firestore().doc(`verificaciones_sst/${proyectoId}`);
    const despues = event.data?.after?.exists ? event.data.after.data() : null;

    if (!despues) {
      // proyecto borrado → la proyección no debe quedar huérfana
      await ref.delete();
      return;
    }
    if (!ESTADOS_TRAMO_ADMINISTRATIVO.includes(despues.estado)) return;

    const snapshot = despues.snapshot ?? {};
    const asignacion = despues.asignacion ?? {};
    // SOLO identidad + estado. Prohibido agregar aquí valor_venta,
    // preliquidacion, margen o cualquier dato económico.
    await ref.set(
      {
        proyecto_id: proyectoId,
        consecutivo: despues.consecutivo ?? '',
        nombre_sitio: snapshot.nombre_sitio ?? '',
        codigo_sitio_cliente: snapshot.codigo_sitio_cliente ?? '',
        cliente_nombre: snapshot.cliente ?? '',
        contratista_id: asignacion.contratista_id ?? '',
        contratista_nombre: asignacion.contratista_nombre ?? '',
        estado: despues.estado,
        obra_id: `pry_${proyectoId}`,
        fecha_sincronizacion: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  },
);

module.exports = { sincronizarVerificacionSst };
