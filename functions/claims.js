/**
 * sincronizarClaims + resincronizarClaims — C2.1 paso 1 (16-ago-2026).
 *
 * Custom claims para el futuro rol residente_cliente (segregación real por
 * cliente) y para el hardening de Storage (H-008: las reglas de Storage no
 * pueden leer Firestore — el claim es el único vehículo de rol/perfil ahí).
 *
 * EVIDENCIA TRINORMA (precisión de Giovanny, 16-ago): la fuente AUDITABLE de
 * quién accede a qué es el DOC de `users` — el claim es solo una COPIA
 * DERIVADA que viaja en el token. Ante "¿cómo prueba usted que el residente
 * solo accede a su cliente?": se muestra users/{uid} (rol + cliente_id +
 * estado, con su trazabilidad), y esta CF como el mecanismo determinístico
 * que lo proyecta al token. Nadie escribe claims a mano.
 *
 * Contrato:
 *  - Trigger en users/{uid}: deriva {perfil, rol, cliente_id} del doc y lo
 *    aplica con setCustomUserClaims. INERTE hasta que alguna regla consuma
 *    claims (paso 4 del despliegue C2.1).
 *  - REVOCACIÓN (agregado 1 de Giovanny): si el cambio REDUCE acceso (baja
 *    de rol, estado → inactivo, quita/cambio de cliente_id), la CF llama
 *    además revokeRefreshTokens → la ventana de ~1h del token viejo pasa a
 *    ~0 (el próximo request del SDK renueva y pierde el claim). Al CONCEDER
 *    no se revoca (el usuario nuevo/ascendido espera su refresh normal).
 *  - resincronizarClaims (callable, SOLO admin): herramienta permanente de
 *    reparación (agregado 3): si el trigger falló en silencio, re-deriva y
 *    aplica los claims de TODOS los users. No es un script de una vez.
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

// Espejo de esPersonalPanel() en firestore.rules — los 9 roles INTERNOS.
// `tecnico` queda deliberadamente FUERA (app móvil: no debe ganar acceso a
// las rutas de Storage internas). Mantener sincronizado con las reglas.
const ROLES_INTERNOS = [
  'sst', 'admin',
  'gerencia_general', 'gerencia_administrativa',
  'operacion_comercial', 'auxiliar_proyectos', 'director_proyectos',
  'residente_sst', 'gestion_integral',
];

// Nombre del rol residente (F1 lo materializa; la derivación queda lista).
const ROL_RESIDENTE = 'residente_cliente';

/** Deriva los claims desde el doc de users. PURA (testeable).
 *  null/estado≠activo → {} (claims limpios). */
function derivarClaims(userDoc) {
  if (!userDoc) return {};
  const rol = userDoc.rol ?? userDoc.role ?? '';   // fallback legacy (H-002)
  if ((userDoc.estado ?? '') !== 'activo') return {};
  if (ROLES_INTERNOS.includes(rol)) {
    return { perfil: 'interno', rol };
  }
  if (rol === ROL_RESIDENTE) {
    const claims = { perfil: 'residente_cliente', rol };
    if (userDoc.cliente_id) claims.cliente_id = userDoc.cliente_id;
    return claims;
  }
  return {};   // tecnico / roles desconocidos: sin claims (deny-by-default)
}

/** ¿Los claims nuevos PIERDEN algo respecto de los previos? PURA.
 *  Reducción = existe una clave previa ausente o distinta en los nuevos.
 *  (Concesión pura — previos ⊆ nuevos — NO es reducción.) */
function esReduccion(prev, next) {
  if (!prev || Object.keys(prev).length === 0) return false;
  return Object.keys(prev).some((k) => prev[k] !== (next ?? {})[k]);
}

/** Aplica claims a un uid si difieren de los actuales; revoca si reduce.
 *  Devuelve 'sin_cambio' | 'aplicado' | 'aplicado_y_revocado' | 'sin_auth'. */
async function aplicarClaims(uid, claimsNuevos) {
  let usuario;
  try {
    usuario = await admin.auth().getUser(uid);
  } catch {
    return 'sin_auth';   // doc de users sin cuenta de Auth (dato huérfano)
  }
  const previos = usuario.customClaims ?? {};
  const iguales = Object.keys({ ...previos, ...claimsNuevos })
    .every((k) => previos[k] === claimsNuevos[k]);
  if (iguales) return 'sin_cambio';

  await admin.auth().setCustomUserClaims(uid, claimsNuevos);
  if (esReduccion(previos, claimsNuevos)) {
    // Dirección peligrosa (bancarias/médicos en Storage): ventana 1h → ~0.
    await admin.auth().revokeRefreshTokens(uid);
    return 'aplicado_y_revocado';
  }
  return 'aplicado';
}

const sincronizarClaims = onDocumentWritten(
  {
    document: 'users/{uid}',
    region: 'us-central1',
  },
  async (event) => {
    const uid = event.params.uid;
    const despues = event.data?.after?.exists ? event.data.after.data() : null;
    const claims = derivarClaims(despues);   // doc borrado → {} (limpia)
    const resultado = await aplicarClaims(uid, claims);
    if (resultado !== 'sin_cambio') {
      console.log(`sincronizarClaims: ${uid} → ${resultado}`, JSON.stringify(claims));
    }
  }
);

// Herramienta PERMANENTE de resincronización (agregado 3): si el trigger
// falló en silencio, esto re-deriva todo. Callable SOLO admin.
const resincronizarClaims = onCall(
  { region: 'us-central1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Requiere sesión.');
    const solicitante = await admin.firestore().doc(`users/${uid}`).get();
    const rolSolicitante = solicitante.get('rol') ?? solicitante.get('role') ?? '';
    if (rolSolicitante !== 'admin') {
      throw new HttpsError('permission-denied', 'Solo admin puede resincronizar claims.');
    }

    const users = await admin.firestore().collection('users').get();
    const resumen = { sin_cambio: 0, aplicado: 0, aplicado_y_revocado: 0, sin_auth: 0 };
    for (const doc of users.docs) {
      const r = await aplicarClaims(doc.id, derivarClaims(doc.data()));
      resumen[r] += 1;
    }
    console.log('resincronizarClaims por', uid, JSON.stringify(resumen));
    return { total: users.size, ...resumen };
  }
);

module.exports = { sincronizarClaims, resincronizarClaims, derivarClaims, esReduccion, ROLES_INTERNOS };
