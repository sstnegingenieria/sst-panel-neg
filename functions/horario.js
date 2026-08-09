/**
 * registrarEventoHorario — Validador de horario / asistencia (#3, SB1).
 *
 * Callable v2 que el panel invoca al hacer LOGIN (tipo 'ingreso') y al cerrar
 * sesión (tipo 'salida'). Filosofía: MARCAR, no bloquear — el login jamás
 * depende de esta función (el cliente la llama no-fatal).
 *
 * CERO CONFIANZA EN EL CLIENTE: del request solo se usa `tipo`. Todo lo
 * demás lo determina el servidor:
 *  - IP: request.rawRequest (x-forwarded-for → .ip).
 *  - en_oficina: comparación SOFT contra configuracion/horario.ips_oficina
 *    (IP exacta o CIDR IPv4; lista vacía/doc ausente → null, jamás un falso
 *    "fuera de oficina").
 *  - dispositivo: heurística sobre el user-agent del rawRequest.
 *  - timestamp: FieldValue.serverTimestamp() — inmune a la hora del navegador.
 *  - nombre/rol: denormalizados de users/{uid} (la bandeja no hace lookups).
 *
 * Escribe EVENTOS PLANOS en `registros_horario` con Admin SDK (las reglas no
 * permiten ningún write de cliente — SB2). Sin apareo en escritura: el par
 * ingreso↔salida y los "sin salida" se derivan en la UI (helper puro) — la
 * CF es stateless y los casos raros (doble login, dos pestañas, sesión
 * expirada) no corrompen nada porque no hay estado que corromper.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

// Nota: admin.initializeApp() ya se llama en index.js — no re-inicializar

const TIPOS_VALIDOS = ['ingreso', 'salida'];

/** IPv4 "a.b.c.d" → entero sin signo, o null si no es IPv4 válida. */
function ipv4AEntero(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip).trim());
  if (!m) return null;
  let n = 0;
  for (let i = 1; i <= 4; i++) {
    const oct = Number(m[i]);
    if (oct > 255) return null;
    n = n * 256 + oct;
  }
  return n;
}

/**
 * ¿La IP pertenece a la lista de oficina? Entradas admitidas por elemento:
 * IP exacta (IPv4 o IPv6, match literal) o CIDR IPv4 "a.b.c.d/nn".
 * Entradas malformadas se ignoran (jamás rompen el registro).
 */
function ipEnLista(ip, lista) {
  const ipNum = ipv4AEntero(ip);
  for (const entrada of lista) {
    const e = String(entrada).trim();
    if (!e) continue;
    if (e === ip) return true;                    // match literal (IPv4/IPv6)
    const cidr = /^(.+)\/(\d{1,2})$/.exec(e);     // CIDR solo IPv4
    if (cidr && ipNum != null) {
      const base = ipv4AEntero(cidr[1]);
      const bits = Number(cidr[2]);
      if (base == null || bits > 32) continue;
      // >>> 0 mantiene el resultado sin signo (los /1../7 tocan el bit alto)
      const mascara = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      if (((ipNum & mascara) >>> 0) === ((base & mascara) >>> 0)) return true;
    }
  }
  return false;
}

/** IP real del cliente: primer salto de x-forwarded-for (lo que pone el
 *  frontend de Cloud Functions en prod), con fallback a express `.ip` y al
 *  socket crudo (el emulador local no puebla `.ip` sin proxy). */
function ipDe(rawRequest) {
  const xff = rawRequest?.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  return rawRequest?.ip || rawRequest?.socket?.remoteAddress || '';
}

/** Heurística de dispositivo sobre el user-agent (server-side). */
function dispositivoDe(userAgent) {
  if (!userAgent) return 'desconocido';
  return /Mobi|Android|iPhone|iPad/i.test(userAgent) ? 'movil' : 'escritorio';
}

const registrarEventoHorario = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Se requiere autenticación para registrar el evento.');
    }
    const { tipo } = request.data || {};
    if (!TIPOS_VALIDOS.includes(tipo)) {
      throw new HttpsError('invalid-argument', `Tipo no válido: ${tipo}. Válidos: ${TIPOS_VALIDOS.join(', ')}`);
    }

    const db = admin.firestore();
    const uid = request.auth.uid;

    try {
      // Denormalización de identidad + config de oficina (lecturas tolerantes:
      // un fallo aquí no debe perder el evento).
      const [userSnap, cfgSnap] = await Promise.all([
        db.doc(`users/${uid}`).get().catch(() => null),
        db.doc('configuracion/horario').get().catch(() => null),
      ]);
      const user = userSnap?.exists ? userSnap.data() : {};
      const ipsOficina = cfgSnap?.exists && Array.isArray(cfgSnap.data().ips_oficina)
        ? cfgSnap.data().ips_oficina
        : [];

      const ip = ipDe(request.rawRequest);
      const userAgent = String(request.rawRequest?.headers?.['user-agent'] ?? '').slice(0, 200);

      await db.collection('registros_horario').add({
        uid,
        nombre: user.nombre ?? '',
        rol: user.rol ?? '',
        tipo,
        fecha: FieldValue.serverTimestamp(),
        ip,
        // null = sin configuración de IPs O sin IP determinable — la UI
        // muestra "—"; jamás se juzga "remoto" sin dato. (En prod la IP
        // siempre llega por x-forwarded-for del frontend de Cloud Functions;
        // el emulador local proxya por pipe interno y puede no traerla.)
        en_oficina: ipsOficina.length > 0 && ip ? ipEnLista(ip, ipsOficina) : null,
        dispositivo: dispositivoDe(userAgent),
        user_agent: userAgent,
      });

      return { ok: true };
    } catch (err) {
      console.error(`registrarEventoHorario: fallo registrando ${tipo} de ${uid}:`, err);
      throw new HttpsError('internal', 'No se pudo registrar el evento de horario.');
    }
  },
);

module.exports = { registrarEventoHorario, ipEnLista, ipv4AEntero, dispositivoDe };
