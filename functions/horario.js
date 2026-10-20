/**
 * horario.js — HELPERS COMPARTIDOS del horario (IP de oficina y dispositivo).
 *
 * ⚠ HISTORIA (19-oct-2026): este archivo nació con la callable
 * `registrarEventoHorario` (módulo #3, 09-ago). El módulo quedó CONGELADO el
 * 09-oct (#149 — la jornada por presencia lo reemplazó; `registros_horario`
 * conserva sus reglas `create/update/delete: if false`) y la callable quedó
 * VIVA SIN LLAMADORES: auth-only, sin verificación de rol, escribiendo con
 * Admin SDK en la colección declarada inmutable — cualquier autenticado
 * (técnicos de la app incluidos) podía fabricar eventos de marcación. Se
 * RETIRÓ por decisión de Giovanny ("cerrar por inexistencia es más fuerte
 * que gatear") — tercer hallazgo del patrón "callable sensible sin verificar
 * quién llama" (generarConsecutivo · users.rol · esta). Los helpers quedan:
 * `latidoJornada` (jornadas.js) los consume.
 */

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

/** Heurística de dispositivo sobre el user-agent (server-side). */
function dispositivoDe(userAgent) {
  if (!userAgent) return 'desconocido';
  return /Mobi|Android|iPhone|iPad/i.test(userAgent) ? 'movil' : 'escritorio';
}

module.exports = { ipEnLista, ipv4AEntero, dispositivoDe };
