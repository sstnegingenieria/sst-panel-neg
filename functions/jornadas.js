/**
 * latidoJornada — Jornada por PRESENCIA (rebuild oct-2026).
 *
 * Callable v2 que el panel invoca mientras está EN USO: la primera
 * interacción del día late de inmediato y después a ventana (default 10 min,
 * configurable en configuracion/horario.latido_min). `accion: 'salir'` es el
 * cierre MANUAL (botón Salir / pop-up de fin de jornada). El cierre
 * AUTOMÁTICO no se escribe nunca: se deriva en lectura (cierreEfectivo en
 * types/sigp/jornada.ts) — cero schedulers.
 *
 * CERO CONFIANZA EN EL CLIENTE (patrón registrarEventoHorario): del request
 * solo se usa `accion`. Timestamp = serverTimestamp; IP → en_oficina contra
 * configuracion/horario.ips_oficina (reusa ipEnLista de horario.js — un solo
 * matcher en la casa); DÍA LOCAL DE BOGOTÁ calculado AQUÍ (UTC-5 fijo,
 * Colombia no tiene horario de verano) — la clave del doc
 * `jornadas/{uid}_{YYYY-MM-DD}` parte la medianoche por construcción: el
 * latido de las 00:01 cae en el doc del día nuevo y la jornada de ayer
 * termina en su último latido real (caso Paula).
 *
 * 🔒 PRIVACIDAD — LÍNEA DURA: el payload admite SOLO {accion}. No existe
 * parámetro para ruta, pantalla, clic ni tiempo por pantalla — lo que el
 * cliente no puede mandar, el servidor no puede guardar.
 *
 * Un doc por persona/día, UPSERT transaccional:
 *  - crea: identidad + inicio + ultimo_latido + latidos=1 + en_oficina_inicio
 *  - late: ultimo_latido + latidos+1 + en_oficina_ultimo
 *  - salir: además cierre {fecha, tipo:'manual'}
 *  - latido DESPUÉS de un cierre manual del mismo día → retira el cierre
 *    (la persona volvió: la presencia real gana; el derivado volverá a
 *    cerrar cuando el latido pare).
 *
 * Quién late: personal interno del panel. `tecnico` (app móvil) y los
 * residentes de cliente/obra NO (espejo del guard del cliente — defensa en
 * profundidad, el reloj es del personal interno).
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { ipEnLista, dispositivoDe } = require('./horario');

// Marcación por login/logout (rebuild 13-oct, regla de negocio de Giovanny:
// "todos se loguean al llegar — el login es la marcación de entrada; al
// terminar cierran sesión y eso marca la salida"):
//  - 'entrada'    → la escribe el LOGIN explícito (primera del día gana;
//                   una re-entrada tras salida del mismo día RETIRA la
//                   salida — la salida real será la última del día).
//  - 'latido'     → presencia de apoyo (alimenta el aviso de cierre y la
//                   salida derivada de pestañas muertas).
//  - 'salir'      → salida MANUAL (botón Salir).
//  - 'salir_auto' → salida AUTOMÁTICA (el cierre de jornada venció sin
//                   respuesta) — distinguible de la manual.
const ACCIONES_VALIDAS = ['entrada', 'latido', 'salir', 'salir_auto'];
const ROLES_SIN_RELOJ = ['tecnico', 'residente_obra', 'residente_cliente', 'cliente_final'];

// Un LATIDO retira un cierre existente solo si el cierre tiene más de esto
// (13-oct, carrera destapada por el E2E de salida anticipada): el clic de
// "Salir" también es interacción, y con el cold start de la CF un latido
// lanzado en ese mismo gesto puede ATERRIZAR después del cierre manual y
// borrarlo. Un latido a segundos del cierre es ruido del gesto de salida;
// "la persona volvió" de verdad tarda más que esto. La 'entrada' (login,
// acto deliberado) retira SIEMPRE, sin umbral.
const RETIRO_CIERRE_UMBRAL_MS = 60_000;

/** Día local de Bogotá (UTC-5 fijo) para un epoch ms. */
function diaBogota(epochMs) {
  return new Date(epochMs - 5 * 3_600_000).toISOString().slice(0, 10);
}

/** Hora local de Bogotá 'HH:mm' para un epoch ms. */
function horaBogota(epochMs) {
  return new Date(epochMs - 5 * 3_600_000).toISOString().slice(11, 16);
}

// ── Salida anticipada (13-oct, diseño aprobado) ──────────────────────────────
// La hora de cierre EFECTIVA de la persona se resuelve SERVER-SIDE (réplica
// exacta de horaFinDe de types/sigp/horario.ts — paridad fijada por test) y
// la marca `cierre.anticipada` se CONGELA con el hecho: si se derivara en
// lectura contra el horario vigente, bajarle la hora de cierre a alguien
// re-escribiría su pasado (mismo criterio por el que no se editan facturas
// ni se corrige el reloj). El payload del cliente sigue siendo {accion} —
// nada de esto confía en el navegador.
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
function esHoraValidaJs(h) {
  return typeof h === 'string' && RE_HORA.test(h);
}
/** Réplica de horaFinDe(uid, personales, general): personal válida gana,
 *  fallback a la general válida, si no hay nada → null. */
function horaFinDeJs(uid, personales, general) {
  const p = personales && typeof personales === 'object' ? personales[uid] : undefined;
  if (esHoraValidaJs(p)) return p;
  if (esHoraValidaJs(general)) return general;
  return null;
}
/** Salida manual ANTES de la hora de cierre de la persona (mismo día local).
 *  Supuesto nombrado: la hora de cierre pertenece al día que termina — una
 *  hora de cierre de madrugada (p. ej. 00:30 del día siguiente) queda fuera
 *  de este modelo, igual que la hora única del rebuild original. */
function esSalidaAnticipada(epochMs, horaFin) {
  if (!esHoraValidaJs(horaFin)) return false;
  return horaBogota(epochMs) < horaFin;
}

/** IP real del cliente (mismo criterio que registrarEventoHorario). */
function ipDe(rawRequest) {
  const xff = rawRequest?.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  return rawRequest?.ip || rawRequest?.socket?.remoteAddress || '';
}

const latidoJornada = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Se requiere autenticación.');
    }
    const accion = (request.data || {}).accion ?? 'latido';
    if (!ACCIONES_VALIDAS.includes(accion)) {
      throw new HttpsError('invalid-argument', `Acción no válida: ${accion}.`);
    }

    const db = admin.firestore();
    const uid = request.auth.uid;

    try {
      const [userSnap, cfgSnap, horariosSnap] = await Promise.all([
        db.doc(`users/${uid}`).get().catch(() => null),
        db.doc('configuracion/horario').get().catch(() => null),
        // Solo la salida MANUAL necesita la hora de cierre de la persona
        // (marca de anticipada); las demás acciones no pagan la lectura.
        accion === 'salir'
          ? db.doc('configuracion/horarios_personales').get().catch(() => null)
          : Promise.resolve(null),
      ]);
      const user = userSnap?.exists ? userSnap.data() : {};
      if (ROLES_SIN_RELOJ.includes(user.rol ?? '')) {
        return { ok: false, motivo: 'rol sin reloj' };
      }
      const ipsOficina = cfgSnap?.exists && Array.isArray(cfgSnap.data().ips_oficina)
        ? cfgSnap.data().ips_oficina
        : [];

      const ip = ipDe(request.rawRequest);
      const enOficina = ipsOficina.length > 0 && ip ? ipEnLista(ip, ipsOficina) : null;
      const dispositivo = dispositivoDe(String(request.rawRequest?.headers?.['user-agent'] ?? '').slice(0, 200));
      const dia = diaBogota(Date.now());
      const esSalida = accion === 'salir' || accion === 'salir_auto';
      // Salida anticipada: SOLO la manual ('salir') puede serlo — la
      // automática ocurre a/tras la hora por construcción. Resuelta aquí,
      // congelada en el doc.
      const horaFin = accion === 'salir'
        ? horaFinDeJs(
            uid,
            horariosSnap?.exists ? horariosSnap.data().horarios : undefined,
            cfgSnap?.exists ? cfgSnap.data().hora_fin_jornada : undefined,
          )
        : null;
      const anticipadaHoy = accion === 'salir' && esSalidaAnticipada(Date.now(), horaFin);
      const cierreDe = (enDiaDeHoy) => ({
        fecha: FieldValue.serverTimestamp(),
        tipo: accion === 'salir' ? 'manual' : 'automatica',
        // Anclaje nocturno: una salida de madrugada que cierra la jornada de
        // AYER es trabajo que PASÓ la hora de cierre, no salida anticipada.
        ...(anticipadaHoy && enDiaDeHoy ? { anticipada: true } : {}),
      });

      let diaEscrito = dia;
      await db.runTransaction(async (tx) => {
        let ref = db.doc(`jornadas/${uid}_${dia}`);
        let snap = await tx.get(ref);

        // ANCLAJE NOCTURNO (precisión 1 de Giovanny): un latido o una salida
        // pasada la medianoche, cuando el doc de HOY no existe pero el de
        // AYER sigue ABIERTO (sin salida), continúa la jornada de AYER — el
        // trabajo que cruza la medianoche queda EN EL DÍA DE LA ENTRADA, con
        // su salida a la 1 am y duración honesta. Una 'entrada' (login)
        // SIEMPRE abre el día actual: un login nuevo es un día nuevo.
        if (!snap.exists && accion !== 'entrada') {
          const ayer = diaBogota(Date.now() - 86_400_000);
          const refAyer = db.doc(`jornadas/${uid}_${ayer}`);
          const snapAyer = await tx.get(refAyer);
          if (snapAyer.exists && !snapAyer.data().cierre) {
            ref = refAyer;
            snap = snapAyer;
            diaEscrito = ayer;
          }
        }

        if (!snap.exists) {
          tx.set(ref, {
            uid,
            nombre: user.nombre ?? '',
            rol: user.rol ?? '',
            dia: diaEscrito,
            // 'entrada' (login) la fija; un latido/salida sin entrada previa
            // deja el campo AUSENTE — sesión persistida del arranque, el
            // tablero lo muestra honesto ("—"), jamás se inventa.
            ...(accion === 'entrada' ? { entrada: { fecha: FieldValue.serverTimestamp() } } : {}),
            inicio: FieldValue.serverTimestamp(),
            ultimo_latido: FieldValue.serverTimestamp(),
            latidos: 1,
            en_oficina_inicio: enOficina,
            en_oficina_ultimo: enOficina,
            dispositivo,
            ...(esSalida ? { cierre: cierreDe(diaEscrito === dia) } : {}),
          });
          return;
        }
        tx.update(ref, {
          ultimo_latido: FieldValue.serverTimestamp(),
          latidos: FieldValue.increment(1),
          en_oficina_ultimo: enOficina,
          // la PRIMERA entrada del día gana (un re-login no la pisa)
          ...(accion === 'entrada' && !snap.data().entrada
            ? { entrada: { fecha: FieldValue.serverTimestamp() } }
            : {}),
          ...(esSalida
            ? { cierre: cierreDe(diaEscrito === dia) }
            // volvió después de salir (re-login o presencia): la salida
            // previa se retira — la salida real será la última del día.
            // Latido: solo si el cierre no es de hace segundos (umbral — el
            // clic de salir no se borra a sí mismo). Entrada: siempre.
            : snap.data().cierre
                && (accion === 'entrada'
                    || !snap.data().cierre.fecha
                    || Date.now() - snap.data().cierre.fecha.toMillis() > RETIRO_CIERRE_UMBRAL_MS)
              ? { cierre: FieldValue.delete() }
              : {}),
        });
      });

      return { ok: true, dia: diaEscrito };
    } catch (err) {
      console.error(`latidoJornada: fallo en ${accion} de ${uid}:`, err);
      throw new HttpsError('internal', 'No se pudo registrar la presencia.');
    }
  },
);

module.exports = { latidoJornada, diaBogota, horaBogota, horaFinDeJs, esSalidaAnticipada };
