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

// ── P2-1 — Cambios de alcance (03-sep) ──────────────────────────────────────

/**
 * Diff del alcance por GRUPO (arrays de {grupo, items, subtotal} del snapshot).
 * ETIQUETAS NEUTRAS (decisión de Giovanny): a nivel de grupo un subtotal sube
 * por cantidad O por precio — indistinguibles; 'aumento'/'disminucion' no
 * afirman lo que no se puede distinguir. 'cancelacion' (grupo removido) y
 * 'adicional' (grupo nuevo) sí son distinguibles.
 */
function diffAlcance(alcanceViejo, alcanceNuevo) {
  const viejos = new Map((alcanceViejo || []).map((g) => [g.grupo, g.subtotal || 0]));
  const nuevos = new Map((alcanceNuevo || []).map((g) => [g.grupo, g.subtotal || 0]));
  const componentes = [];
  for (const [grupo, sub] of viejos) {
    if (!nuevos.has(grupo)) {
      componentes.push({ grupo, tipo: 'cancelacion', delta: -sub });
    } else {
      const subNuevo = nuevos.get(grupo);
      if (subNuevo > sub) componentes.push({ grupo, tipo: 'aumento', delta: subNuevo - sub });
      else if (subNuevo < sub) componentes.push({ grupo, tipo: 'disminucion', delta: subNuevo - sub });
    }
  }
  for (const [grupo, sub] of nuevos) {
    if (!viejos.has(grupo)) componentes.push({ grupo, tipo: 'adicional', delta: sub });
  }
  return componentes;
}

/**
 * Decide qué hace la CF con una cotización aprobada (PURA — testeable).
 *  - 'crear': el proyecto no existe.
 *  - 'cambio': existe y la versión aprobada es MAYOR que la del proyecto.
 *  - 'bloqueado_migracion': sería cambio, pero el proyecto NO tiene
 *    `valor_venta_inicial` — GUARDA DURA (restricción de secuencia de
 *    Giovanny): si el cambio corriera antes de la migración, el backfill
 *    tomaría la venta YA corregida y el número original se perdería.
 *    No se aplica nada; se corrige corriendo la migración y re-tocando.
 *  - 'reparar': todo lo demás (misma versión, versión del proyecto
 *    desconocida, reintentos) — comportamiento histórico de reparar enlaces.
 */
function decidirAccion(proyectoData, versionActiva) {
  if (!proyectoData) return 'crear';
  const verProy = proyectoData.cotizacion_version;
  if (typeof verProy === 'number' && typeof versionActiva === 'number' && versionActiva > verProy) {
    return typeof proyectoData.valor_venta_inicial === 'number' ? 'cambio' : 'bloqueado_migracion';
  }
  return 'reparar';
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

    // ── El proyecto ya existe: reparar, aplicar cambio, o bloquear ──
    if (proyectoSnap.exists) {
      const proyecto = proyectoSnap.data();
      const consecutivo = proyecto.consecutivo;
      const accion = origen === 'cotizacion'
        ? decidirAccion(proyecto, data.version_activa)
        : 'reparar';   // preventivos no tienen versiones — siempre reparación

      if (accion === 'bloqueado_migracion') {
        // GUARDA DURA (secuencia CF → migración → Vercel): sin
        // valor_venta_inicial NO se aplica el cambio — jamás se backfillea
        // aquí (tomaría la venta ya corregida y borraría el número original).
        console.error(`crearProyectoAlAprobar: cotización ${docId} v${data.version_activa} es un CAMBIO DE ALCANCE pero el proyecto no tiene valor_venta_inicial — MIGRACIÓN PENDIENTE, no se aplica (correr la migración y re-tocar el doc)`);
        return;
      }

      if (accion === 'cambio') {
        // ── P2-1: APLICAR CAMBIO DE ALCANCE ──
        // Sanity idéntica a la creación: el staged debe corresponder a la
        // versión aprobada.
        if (!versionSnap || !versionSnap.exists) {
          console.error(`crearProyectoAlAprobar: cambio ${docId} sin versión ${data.version_activa} — no se aplica`);
          return;
        }
        const total = versionSnap.data().totales && versionSnap.data().totales.total;
        if (snapshot.valor_venta !== total) {
          console.error(`crearProyectoAlAprobar: cambio ${docId} — snapshot.valor_venta (${snapshot.valor_venta}) != total de la versión aprobada (${total}) — no se aplica`);
          return;
        }

        const ventaAnterior = proyecto.snapshot && proyecto.snapshot.valor_venta;
        const componentes = diffAlcance(proyecto.snapshot && proyecto.snapshot.alcance, snapshot.alcance);
        const cambio = {
          fecha: ahora,
          version: data.version_activa,
          delta_venta: snapshot.valor_venta - (ventaAnterior || 0),
          componentes,
          motivo: data.motivo_cambio || 'Cambio de alcance aprobado (sin motivo registrado)',
          aprobado_por: data.aprobada_por || 'sistema',
        };
        const patchProyecto = {
          snapshot,
          cotizacion_version: data.version_activa,
          cambios_alcance: FieldValue.arrayUnion(cambio),
          fecha_actualizacion: ahora,
          historial: FieldValue.arrayUnion({
            a: proyecto.estado, por: 'sistema', fecha: ahora,
            motivo: `Cambio de alcance aplicado — ${data.consecutivo} v${data.version_activa}: venta ${ventaAnterior} → ${snapshot.valor_venta}. ${cambio.motivo}`,
          }),
        };
        // Decisión 8 (señalización): con preliquidación definida, el cambio
        // la deja DESACTUALIZADA — la ficha exige revisarla (corregir o
        // confirmar sin cambio); mientras tanto la utilidad no muestra número.
        if (proyecto.preliquidacion) {
          patchProyecto.alcance_desactualizado = {
            version: data.version_activa,
            fecha: ahora,
            grupos_afectados: componentes.map((c) => c.grupo),
          };
        }
        tx.update(proyectoRef, patchProyecto);
        // Limpia la marca de cambio en curso y el motivo del doc disparador
        // (y asegura enlaces, por si el intento venía de una reparación).
        tx.update(origenRef, {
          proyecto_id: docId, proyecto_consecutivo: consecutivo,
          cambio_en_curso: FieldValue.delete(),
          motivo_cambio: FieldValue.delete(),
        });
        return;
      }

      // ── Vía de REPARACIÓN (comportamiento histórico) ──
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
          // P2-1: la venta INICIAL se congela al nacer (los tres números).
          valor_venta_inicial: snapshot.valor_venta,
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
          valor_venta_inicial: snapshot.valor_venta,   // P2-1
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

module.exports = {
  crearProyectoAlAprobarCotizacion, crearProyectoAlAceptarPreventivo,
  // P2-1 — exportados para tests (patrón claims/horario)
  diffAlcance, decidirAccion,
};
