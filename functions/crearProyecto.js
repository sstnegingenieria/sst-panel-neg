/**
 * crearProyectoAlAprobar — §16 (ii): el nacimiento del proyecto se mueve al
 * servidor. La frontera de comercial es la COTIZACIÓN; `proyectos` es dominio
 * de ejecución y comercial ya no puede escribirlo (ni leerlo) — por eso la
 * creación no puede seguir en el cliente.
 *
 * ENFOQUE STAGING: el cliente construye el snapshot con los builders TS de
 * siempre (`construirSnapshotProyecto` / matriz de preventivos) y lo deja
 * STAGED en el campo `snapshot_proyecto` del doc disparador, en el MISMO
 * updateDoc de la aprobación/aceptación. Esta función lo COPIA tal cual —
 * jamás lo reconstruye (cero duplicación TS→JS del builder).
 *
 * Dos triggers convergen en un solo nacimiento:
 *  A) cotizaciones/{id} → estado 'aprobada'  (origen 'cotizacion')
 *  B) solicitudes/{id} tipo 'preventivo' → estado 'aceptada' (origen 'preventivo')
 *
 * Guardas:
 *  - Exige `snapshot_proyecto` staged (ausente → warn y salir; docs históricos
 *    no fabrican proyectos fantasma. Escotilla: reparar el doc y RE-TOCARLO —
 *    por eso el disparo también admite `aprobada→aprobada` sin proyecto_id).
 *  - Sanity: origen cotización → valor_venta del snapshot == total de la
 *    versión aprobada; origen preventivo → valor_venta > 0 y alcance no vacío
 *    (la matriz IHS vive versionada en TS y no se porta — decisión 07-ago).
 *  - Idempotencia POR CONSTRUCCIÓN: id del proyecto = id del doc disparador
 *    (1:1). Si ya existe, solo se reparan enlaces (sin consumir contador).
 *
 * UNA transacción atómica: contador PRY + proyecto + enlace inverso +
 * solicitud→aceptada (réplica de patchSolicitudAceptada, por:'sistema' —
 * la implementación TS se retiró del cliente; esta es la ÚNICA).
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');

// ── Réplica JS de patchSolicitudAceptada (antes en utils/sigp/pipeline.ts) ──
// Precondiciones idénticas: solo desde 'cotizada' o 'lista_para_cotizar'
// (robustez pre-PR#54); null en el resto → reintentos idempotentes.
function patchSolicitudAceptada(estadoSolicitud, consecutivoCot, consecutivoPry, ahora) {
  if (estadoSolicitud !== 'cotizada' && estadoSolicitud !== 'lista_para_cotizar') return null;
  return {
    estado: 'aceptada',
    entradaHistorial: {
      de: estadoSolicitud, a: 'aceptada', por: 'sistema', fecha: ahora,
      motivo: `Cotización ${consecutivoCot} aprobada — proyecto ${consecutivoPry} creado`,
    },
  };
}

/** PRY-YYYY-NNN con el mismo padding extensible de consecutivos.js. */
function formatearPry(año, siguiente) {
  const padding = Math.max(3, String(siguiente).length);
  return `PRY-${año}-${String(siguiente).padStart(padding, '0')}`;
}

/** Quién aceptó el preventivo: último eslabón a→'aceptada' del historial. */
function quienAcepto(historial) {
  const h = Array.isArray(historial) ? historial : [];
  for (let i = h.length - 1; i >= 0; i--) {
    if (h[i] && h[i].a === 'aceptada' && h[i].por) return h[i].por;
  }
  return 'sistema';
}

/**
 * Nacimiento (o reparación) del proyecto en UNA transacción.
 * origen: 'cotizacion' | 'preventivo'. docId = id del doc disparador.
 */
async function nacerProyecto(origen, docId, data) {
  const db = admin.firestore();
  const snapshot = data.snapshot_proyecto;

  // Guarda 1: exige el snapshot staged (sin él, no hay nacimiento).
  if (!snapshot || typeof snapshot !== 'object') {
    console.warn(`crearProyectoAlAprobar: ${origen} ${docId} sin snapshot_proyecto — no se crea (escotilla: reparar y re-tocar)`);
    return;
  }
  // Guarda 2 (preventivo): sanity mínima — la matriz no se porta a JS.
  if (origen === 'preventivo' &&
      !(snapshot.valor_venta > 0 && Array.isArray(snapshot.alcance) && snapshot.alcance.length > 0)) {
    console.error(`crearProyectoAlAprobar: preventivo ${docId} con snapshot inválido (valor_venta=${snapshot.valor_venta}, alcance=${JSON.stringify(snapshot.alcance)}) — no se crea`);
    return;
  }

  const año = new Date().getFullYear();
  const counterRef = db.doc(`consecutivos/PRY_${año}`);
  const proyectoRef = db.doc(`proyectos/${docId}`);
  const origenRef = db.doc(`${origen === 'cotizacion' ? 'cotizaciones' : 'solicitudes'}/${docId}`);
  const solicitudRef = origen === 'cotizacion' && data.solicitud_id
    ? db.doc(`solicitudes/${data.solicitud_id}`)
    : null;

  await db.runTransaction(async (tx) => {
    // ── Reads (todos antes de cualquier write — regla de Firestore) ──
    const [counterSnap, proyectoSnap] = await Promise.all([
      tx.get(counterRef), tx.get(proyectoRef),
    ]);
    let versionSnap = null;
    if (origen === 'cotizacion') {
      versionSnap = await tx.get(db.doc(`cotizaciones/${docId}/versiones/${String(data.version_activa)}`));
    }
    const solicitudSnap = solicitudRef ? await tx.get(solicitudRef) : null;

    const ahora = Timestamp.now();

    // ── Vía de REPARACIÓN: el proyecto ya existe (re-disparo/carrera) ──
    if (proyectoSnap.exists) {
      const consecutivo = proyectoSnap.data().consecutivo;
      if (data.proyecto_id !== docId || data.proyecto_consecutivo !== consecutivo) {
        tx.update(origenRef, { proyecto_id: docId, proyecto_consecutivo: consecutivo });
      }
      if (solicitudSnap && solicitudSnap.exists) {
        const patch = patchSolicitudAceptada(solicitudSnap.data().estado, data.consecutivo, consecutivo, ahora);
        if (patch) {
          tx.update(solicitudRef, {
            estado: patch.estado, fecha_actualizacion: ahora,
            historial: FieldValue.arrayUnion(patch.entradaHistorial),
          });
        }
      }
      return;
    }

    // Guarda 2 (cotización): sanity — el snapshot debe corresponder a la
    // versión APROBADA (valor_venta == total). Dentro de la tx para leer la
    // versión consistente. Mismatch → no se crea (escotilla: corregir y re-tocar).
    if (origen === 'cotizacion') {
      if (!versionSnap.exists) {
        console.error(`crearProyectoAlAprobar: cotización ${docId} sin versión ${data.version_activa} — no se crea`);
        return;
      }
      const total = versionSnap.data().totales && versionSnap.data().totales.total;
      if (snapshot.valor_venta !== total) {
        console.error(`crearProyectoAlAprobar: cotización ${docId} — snapshot.valor_venta (${snapshot.valor_venta}) != total de la versión aprobada (${total}) — no se crea`);
        return;
      }
    }

    // ── Vía de CREACIÓN ──
    const siguiente = (counterSnap.exists ? (counterSnap.data().ultimo || 0) : 0) + 1;
    const consecutivo = formatearPry(año, siguiente);
    tx.set(counterRef, {
      ultimo: siguiente, prefijo: 'PRY', año,
      actualizado: FieldValue.serverTimestamp(), actualizado_por: 'sistema',
    }, { merge: true });

    const proyecto = origen === 'cotizacion'
      ? {
          consecutivo,
          origen: 'cotizacion',
          cotizacion_id: docId,
          cotizacion_consecutivo: data.consecutivo,
          cotizacion_version: data.version_activa,
          ...(data.cliente_id ? { cliente_id: data.cliente_id } : {}),
          ...(data.prospecto_nombre ? { prospecto_nombre: data.prospecto_nombre } : {}),
          snapshot,
          estado: 'creado',
          historial: [{
            a: 'creado', por: 'sistema', fecha: ahora,
            motivo: `Proyecto creado al aprobar ${data.consecutivo}${data.version_activa >= 2 ? ` v${data.version_activa}` : ''}`,
          }],
          creado_por: data.aprobada_por || 'sistema',
          fecha_creacion: ahora,
        }
      : {
          consecutivo,
          origen: 'preventivo',
          solicitud_id: docId,
          solicitud_consecutivo: data.consecutivo,
          ...(data.cliente_id ? { cliente_id: data.cliente_id } : {}),
          snapshot,
          estado: 'creado',
          historial: [{
            a: 'creado', por: 'sistema', fecha: ahora,
            motivo: `Proyecto creado al aceptar el preventivo ${data.consecutivo}` +
              (data.preventivo
                ? ` — precio de matriz ${data.preventivo.zona}/${data.preventivo.tipo_sitio}/${data.preventivo.intensidad}${data.preventivo.es_jungle ? ' jungle' : ''}${data.preventivo.es_sai ? ' SAI' : ''}`
                : ''),
          }],
          creado_por: quienAcepto(data.historial),
          fecha_creacion: ahora,
        };
    tx.set(proyectoRef, proyecto);

    // Enlace inverso en el doc disparador (cotización o solicitud preventivo).
    tx.update(origenRef, { proyecto_id: docId, proyecto_consecutivo: consecutivo });

    // Transición cruzada: la solicitud comercial enlazada pasa a 'aceptada'.
    if (solicitudSnap && solicitudSnap.exists) {
      const patch = patchSolicitudAceptada(solicitudSnap.data().estado, data.consecutivo, consecutivo, ahora);
      if (patch) {
        tx.update(solicitudRef, {
          estado: patch.estado, fecha_actualizacion: ahora,
          historial: FieldValue.arrayUnion(patch.entradaHistorial),
        });
      }
    }
  });
}

// ── Trigger A: cotización real → aprobada ──────────────────────────────────
const crearProyectoAlAprobarCotizacion = onDocumentWritten(
  { document: 'cotizaciones/{cotizacionId}', region: 'us-central1' },
  async (event) => {
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (!after || after.estado !== 'aprobada') return;
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    // Transición real O escotilla (aprobada sin proyecto re-tocada).
    if (before && before.estado === 'aprobada' && after.proyecto_id) return;
    await nacerProyecto('cotizacion', event.params.cotizacionId, after);
  },
);

// ── Trigger B: solicitud tipo preventivo → aceptada ────────────────────────
// La guarda de tipo evita el doble disparo: cuando el Trigger A pone una
// solicitud COMERCIAL en 'aceptada', este trigger despierta y sale aquí.
const crearProyectoAlAceptarPreventivo = onDocumentWritten(
  { document: 'solicitudes/{solicitudId}', region: 'us-central1' },
  async (event) => {
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (!after || after.tipo !== 'preventivo' || after.estado !== 'aceptada') return;
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    if (before && before.estado === 'aceptada' && after.proyecto_id) return;
    await nacerProyecto('preventivo', event.params.solicitudId, after);
  },
);

module.exports = { crearProyectoAlAprobarCotizacion, crearProyectoAlAceptarPreventivo };
