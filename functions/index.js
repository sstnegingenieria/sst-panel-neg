/**
 * Cloud Functions del proyecto neg-sst-app.
 *
 * Actualmente exporta:
 *   - generarConsecutivo (2ª gen) — SIGP · consecutivos transaccionales.
 *
 * Nota histórica: hasta julio 2026 este archivo contenía 5 funciones legacy
 * (setCustomClaimsOnUserCreate, updateCustomClaimsOnRoleChange,
 *  removeCustomClaimsOnUserDelete, processNewRecord, refreshCustomClaims)
 * que nunca fueron desplegadas en producción. Fueron removidas en la
 * Iteración 0.3.c-bis de F0 tras confirmar con el equipo original que:
 *   1. Cero de esas funciones operaba en prod (verificado vía
 *      `firebase functions:list --project neg-sst-app` → 0 resultados).
 *   2. El sistema de custom claims que describían nunca se activó.
 *   3. Las reglas Firestore leen el rol directo de Firestore
 *      (`userData().get('rol', '')`), no de tokens Auth.
 *   4. processNewRecord era código muerto: apuntaba a la colección obsoleta
 *      `registros` con campos que la app Flutter no escribe.
 *
 * Si en el futuro se decide implementar custom claims para optimizar
 * las reglas Firestore, la implementación debería usar sintaxis v2
 * (firebase-functions/v2) directamente, no revivir las v1 legacy.
 *
 * Ver: HALLAZGOS_AUDITORIA.md · Hallazgo H-003.
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const { generarConsecutivo } = require('./consecutivos');
const { asignarObraAlPrincipal } = require('./obraEspejo');
const { sincronizarVerificacionSst } = require('./verificacionesSst');
const { sincronizarComprasProyectoDesdeOC, sincronizarComprasProyectoDesdeMenores } = require('./comprasProyecto');
const { crearProyectoAlAprobarCotizacion, crearProyectoAlAceptarPreventivo } = require('./crearProyecto');
const { registrarEventoHorario } = require('./horario');
const { sincronizarClaims, resincronizarClaims } = require('./claims');

exports.generarConsecutivo = generarConsecutivo;
exports.asignarObraAlPrincipal = asignarObraAlPrincipal;
exports.sincronizarVerificacionSst = sincronizarVerificacionSst;
exports.sincronizarComprasProyectoDesdeOC = sincronizarComprasProyectoDesdeOC;
exports.sincronizarComprasProyectoDesdeMenores = sincronizarComprasProyectoDesdeMenores;
exports.crearProyectoAlAprobarCotizacion = crearProyectoAlAprobarCotizacion;
exports.crearProyectoAlAceptarPreventivo = crearProyectoAlAceptarPreventivo;
exports.registrarEventoHorario = registrarEventoHorario;
exports.sincronizarClaims = sincronizarClaims;
exports.resincronizarClaims = resincronizarClaims;
