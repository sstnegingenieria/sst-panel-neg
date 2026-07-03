/**
 * Cloud Function: generarConsecutivo
 *
 * Genera consecutivos transaccionales atómicos para el SIGP.
 * Formato: PREFIJO-YYYY-NNN (o NNNN si supera 999 en el año).
 *
 * Prefijos válidos: SOL (solicitudes), OFR (cotizaciones),
 * PRY (proyectos), ACT (actas), LIQ (liquidaciones),
 * FAC (facturas), NC (no conformidades).
 *
 * Cada prefijo tiene su propio contador anual en la colección
 * `consecutivos`, documento con ID `{prefijo}_{año}`.
 *
 * La transacción de Firestore garantiza secuencialidad y evita
 * duplicados bajo concurrencia.
 *
 * Requiere autenticación (request.auth.uid). El rol no se valida
 * aquí — se controla desde el panel qué roles pueden invocar. Las
 * reglas de Firestore también impedirán escritura directa a
 * `consecutivos` (se configuran cuando se creen las reglas del SIGP).
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

// Nota: admin.initializeApp() ya se llama en index.js — no re-inicializar

const PREFIJOS_VALIDOS = ['SOL', 'OFR', 'PRY', 'ACT', 'LIQ', 'FAC', 'NC'];

const generarConsecutivo = onCall(
  {
    region: 'us-central1',
    // Sin maxInstances explícito; usa el default (100) por ahora
  },
  async (request) => {
    // Validación de autenticación
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Se requiere autenticación para generar consecutivos.'
      );
    }

    // Validación del prefijo
    const { prefijo } = request.data || {};
    if (!prefijo || typeof prefijo !== 'string') {
      throw new HttpsError(
        'invalid-argument',
        'Falta el parámetro `prefijo` (string).'
      );
    }
    if (!PREFIJOS_VALIDOS.includes(prefijo)) {
      throw new HttpsError(
        'invalid-argument',
        `Prefijo no válido: ${prefijo}. Válidos: ${PREFIJOS_VALIDOS.join(', ')}`
      );
    }

    // Generación transaccional
    const año = new Date().getFullYear();
    const db = admin.firestore();
    const ref = db.doc(`consecutivos/${prefijo}_${año}`);

    try {
      const consecutivo = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const ultimo = snap.exists ? (snap.data().ultimo || 0) : 0;
        const siguiente = ultimo + 1;

        tx.set(ref, {
          ultimo: siguiente,
          prefijo: prefijo,
          año: año,
          actualizado: admin.firestore.FieldValue.serverTimestamp(),
          actualizado_por: request.auth.uid,
        }, { merge: true });

        // Padding: mínimo 3 dígitos, se extiende naturalmente si crece
        const padding = Math.max(3, String(siguiente).length);
        const numero = String(siguiente).padStart(padding, '0');
        return `${prefijo}-${año}-${numero}`;
      });

      return { consecutivo };
    } catch (err) {
      console.error('Error generando consecutivo:', err);
      throw new HttpsError(
        'internal',
        'Error interno al generar el consecutivo. Reintenta.'
      );
    }
  }
);

module.exports = { generarConsecutivo };
