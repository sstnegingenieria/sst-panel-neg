/**
 * Cloud Function: generarConsecutivo
 *
 * Genera consecutivos transaccionales atómicos para el SIGP.
 * Formato: PREFIJO-YYYY-NNN (o NNNN si supera 999 en el año).
 *
 * Prefijos válidos: SOL (solicitudes), VIS (visitas técnicas),
 * COT (cotizaciones), OFR (cotizaciones legacy), PRY (proyectos),
 * ACT (actas), LIQ (liquidaciones), FAC (facturas), NC (no conformidades),
 * CAT (catálogo NEG de ítems propios), LIC (licitaciones).
 *
 * Cada prefijo tiene su propio contador anual en la colección
 * `consecutivos`, documento con ID `{prefijo}_{año}`.
 *
 * Caso especial CAT: el catálogo es ACUMULATIVO, no anual — formato
 * CAT-NNNN (padding 4, sin año), contador en `consecutivos/CAT`.
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
const { FieldValue } = require('firebase-admin/firestore');

// Nota: admin.initializeApp() ya se llama en index.js — no re-inicializar

const PREFIJOS_VALIDOS = ['SOL', 'VIS', 'COT', 'OFR', 'PRY', 'ACT', 'LIQ', 'FAC', 'NC', 'CAT', 'OC', 'PEA', 'LIC'];

// Padding mínimo por prefijo en la serie ANUAL. El default es 3
// (PRY-2026-001). LIC pide 4 porque el volumen anual de procesos de SECOP se
// cuenta en miles, no en cientos: LIC-2026-0001. CAT no entra aquí — su serie
// es acumulativa y su padding vive en la rama `esCatalogo`.
const PADDING_MINIMO_ANUAL = { LIC: 4 };

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

    // Generación transaccional.
    // CAT es acumulativo (sin año, padding 4, contador `consecutivos/CAT`);
    // el resto usa contador anual `consecutivos/{prefijo}_{año}`.
    const esCatalogo = prefijo === 'CAT';
    const año = new Date().getFullYear();
    const db = admin.firestore();
    const ref = db.doc(esCatalogo ? 'consecutivos/CAT' : `consecutivos/${prefijo}_${año}`);

    try {
      const consecutivo = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const ultimo = snap.exists ? (snap.data().ultimo || 0) : 0;
        const siguiente = ultimo + 1;

        tx.set(ref, {
          ultimo: siguiente,
          prefijo: prefijo,
          ...(esCatalogo ? {} : { año: año }),
          actualizado: FieldValue.serverTimestamp(),
          actualizado_por: request.auth.uid,
        }, { merge: true });

        if (esCatalogo) {
          // Padding: mínimo 4 dígitos, se extiende naturalmente si crece
          const numero = String(siguiente).padStart(Math.max(4, String(siguiente).length), '0');
          return `CAT-${numero}`;
        }
        // Padding: mínimo 3 dígitos (4 para los prefijos de PADDING_MINIMO_ANUAL),
        // se extiende naturalmente si crece
        const padding = Math.max(PADDING_MINIMO_ANUAL[prefijo] || 3, String(siguiente).length);
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

// PREFIJOS_VALIDOS y PADDING_MINIMO_ANUAL se exportan para los tests
// (precedente: functions/horario.js exporta sus helpers puros). index.js solo
// desestructura `generarConsecutivo`.
module.exports = { generarConsecutivo, PREFIJOS_VALIDOS, PADDING_MINIMO_ANUAL };
