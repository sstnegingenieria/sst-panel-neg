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
 * MAPA PREFIJO → ROLES (19-oct-2026, hallazgo del frente SGI/SST + mandato
 * de Giovanny): quemar un número es EMITIR evidencia ISO — la contigüidad
 * de la serie se rompe con cada número quemado sin usar, y un consecutivo
 * de un documento que no te corresponde emitir es un acto fuera de rol.
 * La CF verifica server-side contra el DOC de users (jamás claims — "la
 * fuente auditable de quién accede a qué es el DOC", precisión Trinorma)
 * que el solicitante esté ACTIVO y su rol esté en la lista del prefijo.
 * El mapa ESPEJA los gates de UI existentes (la función hace cumplir la
 * política, no inventa una nueva) y un test espejo en el panel
 * (consecutivosRoles.test.ts) tumba la suite si divergen.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

// Nota: admin.initializeApp() ya se llama en index.js — no re-inicializar

// DENY-BY-DEFAULT: un prefijo fuera de este mapa se RECHAZA.
// Espejos de UI: SOL/VIS/COT/CAT ⟷ ROLES_GESTIONA_CLIENTES · OC ⟷
// ROLES_CREA_OC · PEA ⟷ ROLES_GESTIONA_ACTIVIDADES (los residentes emiten
// sus propuestas) · LIC ⟷ ROLES_VE_LICITACIONES · AC/AP/MEJ = definición
// de Gestión Integral (acciones de mejora / NC — mandato 19-oct).
const ROLES_POR_PREFIJO = {
  SOL: ['admin', 'gerencia_general', 'operacion_comercial', 'auxiliar_proyectos', 'director_proyectos'],
  VIS: ['admin', 'gerencia_general', 'operacion_comercial', 'auxiliar_proyectos', 'director_proyectos'],
  COT: ['admin', 'gerencia_general', 'operacion_comercial', 'auxiliar_proyectos', 'director_proyectos'],
  CAT: ['admin', 'gerencia_general', 'operacion_comercial', 'auxiliar_proyectos', 'director_proyectos'],
  OC: ['auxiliar_proyectos', 'director_proyectos', 'gerencia_general', 'admin'],
  PEA: ['admin', 'gerencia_general', 'auxiliar_proyectos', 'director_proyectos', 'residente_obra'],
  LIC: ['operacion_comercial', 'gerencia_general', 'gerencia_administrativa', 'director_proyectos', 'admin'],
  AC: ['gestion_integral', 'admin'],
  AP: ['gestion_integral', 'admin'],
  MEJ: ['gestion_integral', 'admin'],
};

// RESERVADOS sin llamador — FUERA de la superficie a propósito (un prefijo
// sin consumidor es puro riesgo sin beneficio; censo 19-oct: 0 llamadores,
// 0 contadores en prod). La reserva documental se conserva aquí:
//   OFR (cotizaciones legacy) · ACT (actas de entrega) · LIQ (liquidaciones
//   finales) · FAC (facturas) · NC (no conformidades — hoy AC/AP/MEJ).
//   PRY: lo quema SOLO la CF crearProyectoAlAprobar en su propia
//   transacción — que este callable lo aceptara era un hueco silencioso
//   sobre el MISMO contador.
// Para habilitar uno: agregarlo al mapa con sus roles (y su UI).
const PREFIJOS_VALIDOS = Object.keys(ROLES_POR_PREFIJO);

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

    // VERIFICACIÓN DE ROL server-side contra el DOC de users (patrón
    // resincronizarClaims): rol en la lista del prefijo Y estado activo.
    // Lecturas NO tolerantes: sin doc legible no se quema número.
    const db0 = admin.firestore();
    const userSnap = await db0.doc(`users/${request.auth.uid}`).get();
    const usuario = userSnap.exists ? userSnap.data() : null;
    const rol = usuario ? usuario.rol : undefined;
    const activo = usuario ? usuario.estado === 'activo' : false;
    if (!activo || !ROLES_POR_PREFIJO[prefijo].includes(rol)) {
      throw new HttpsError(
        'permission-denied',
        `El rol no está autorizado para emitir consecutivos ${prefijo}.`
      );
    }

    // Generación transaccional.
    // CAT es acumulativo (sin año, padding 4, contador `consecutivos/CAT`);
    // el resto usa contador anual `consecutivos/{prefijo}_{año}`.
    const esCatalogo = prefijo === 'CAT';
    const año = new Date().getFullYear();
    const db = db0;
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

// PREFIJOS_VALIDOS, PADDING_MINIMO_ANUAL y ROLES_POR_PREFIJO se exportan
// para los tests (el test espejo del panel compara el mapa contra los
// arrays de permisos.ts). index.js solo desestructura `generarConsecutivo`.
module.exports = { generarConsecutivo, PREFIJOS_VALIDOS, PADDING_MINIMO_ANUAL, ROLES_POR_PREFIJO };
