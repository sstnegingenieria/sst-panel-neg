/**
 * Emparejamiento por nómina precargada (PR B del diseño 22-sep).
 *
 * Ingrid precarga la nómina autorizada en contratistas/{id}/privado/nomina
 * (PR A). Cuando un técnico se registra en la app, esta CF lo empareja por
 * CÉDULA NORMALIZADA y lo vincula al contratista de la nómina — el
 * empleador deja de ser una declaración libre. NUNCA bloquea: quien no
 * está precargado queda "declarado_sin_verificar" y decide un humano.
 *
 * Dos triggers CONVERGENTES (patrón comprasProyecto) hacia una resolución
 * pura e idempotente (compare-before-write):
 *  - users/{uid} creado con rol tecnico (el registro nuevo).
 *  - contratistas/{cid}/privado/nomina escrito (el caso real más
 *    frecuente: la nómina se carga DESPUÉS de que alguien se registró —
 *    se re-evalúan los técnicos aún no verificados).
 *
 * La CF JAMÁS toca estado/obras_asignadas: verificar el empleador no es
 * aprobar la cuenta (eso sigue siendo el acto humano de siempre).
 * CORRECCIÓN AUTOMÁTICA (decisión 2 de Giovanny): la nómina es un acto
 * deliberado de GI respaldado por un documento del contratista; la
 * declaración es un desplegable sin verificación — la nómina GANA, y el
 * declarado queda como traza en `contratista_declarado` (el chip del
 * panel lo hace VISIBLE, no solo trazable).
 */
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions/v2');

// ── Normalización de cédula — PARIDAD con utils/contratistasNomina.ts ──────
// Umbral 6–12 dígitos: SUPUESTO VIGENTE, no verdad permanente (confirmado
// por Giovanny 24-sep-2026: hoy no hay trabajadores extranjeros entre el
// personal de los contratistas). ⚠ Si algún día entra personal extranjero,
// el emparejamiento por cédula numérica FALLARÍA EN SILENCIO — un pasaporte
// normalizado podría coincidir con la cédula de otra persona — y este
// normalizador necesita revisión. Mientras tanto, un documento con letras
// (pasaporte "AB123456", PPT) devuelve null: JAMÁS se empareja por los
// dígitos sueltos. Paridad fijada por test cruzado.
const CEDULA_MIN_DIGITOS = 6;
const CEDULA_MAX_DIGITOS = 12;

function normalizarCedula(valor) {
  if (!valor) return null;
  const sinSeparadores = String(valor).replace(/[.\s -]/g, '');
  if (!/^\d+$/.test(sinSeparadores)) return null;
  if (sinSeparadores.length < CEDULA_MIN_DIGITOS || sinSeparadores.length > CEDULA_MAX_DIGITOS) return null;
  return sinSeparadores;
}

/**
 * Resolución PURA (testeable). `nominas` = [{ id, nombre, cedulas: Set }]
 * con SOLO entradas vivas (sin retirados).
 * → { estado, contratista? } donde estado ∈
 *   verificado_nomina | declarado_sin_verificar | conflicto_nomina.
 */
function resolverEmparejamiento(cedulaNorm, contratistaDeclaradoId, nominas) {
  if (!cedulaNorm) return { estado: 'declarado_sin_verificar' };
  const matches = nominas.filter((n) => n.cedulas.has(cedulaNorm));
  if (matches.length === 0) return { estado: 'declarado_sin_verificar' };
  if (matches.length === 1) {
    return { estado: 'verificado_nomina', contratista: { id: matches[0].id, nombre: matches[0].nombre } };
  }
  // En varias nóminas a la vez: si una es la declarada, esa gana; si no,
  // conflicto — decide un humano, la CF no elige a ciegas.
  const declarada = matches.find((n) => n.id === contratistaDeclaradoId);
  if (declarada) {
    return { estado: 'verificado_nomina', contratista: { id: declarada.id, nombre: declarada.nombre } };
  }
  return { estado: 'conflicto_nomina' };
}

/** Lee las nóminas VIVAS de todos los contratistas activos (≤ decenas de
 *  docs; los registros son eventos raros — sin índices nuevos). */
async function leerNominas(db) {
  const contratistas = await db.collection('contratistas').get();
  const activos = contratistas.docs.filter((d) => (d.data().estado ?? '') === 'activo');
  const nominas = [];
  for (const c of activos) {
    const nom = await db.doc(`contratistas/${c.id}/privado/nomina`).get();
    if (!nom.exists) continue;
    const trabajadores = nom.data().trabajadores ?? {};
    const cedulas = new Set(
      Object.entries(trabajadores).filter(([, t]) => !t.retirado).map(([ced]) => ced),
    );
    if (cedulas.size > 0) nominas.push({ id: c.id, nombre: c.data().nombre ?? '', cedulas });
  }
  return nominas;
}

/** Empareja UN técnico contra las nóminas. Idempotente: si la verificación
 *  resultante es igual a la vigente (estado + contratista), no escribe. */
async function emparejarTecnico(db, uid, userData, nominas) {
  const cedulaNorm = normalizarCedula(userData.cedula);
  const r = resolverEmparejamiento(cedulaNorm, userData.contratista_id ?? '', nominas);

  const actual = userData.empleador_verificacion;
  const sinCambio = actual
    && actual.estado === r.estado
    && (r.estado !== 'verificado_nomina' || userData.contratista_id === r.contratista.id);
  if (sinCambio) return false;

  const patch = {
    empleador_verificacion: {
      estado: r.estado,
      fecha: FieldValue.serverTimestamp(),
      fuente: 'cf_nomina',
    },
  };
  if (r.estado === 'verificado_nomina' && userData.contratista_id !== r.contratista.id) {
    // La nómina GANA sobre la declaración — el declarado queda como traza
    // VISIBLE (el chip del panel dice "declaró X → nómina: Y").
    patch.empleador_verificacion.contratista_declarado = {
      id: userData.contratista_id ?? '',
      nombre: userData.contratista_nombre ?? '',
    };
    patch.contratista_id = r.contratista.id;
    patch.contratista_nombre = r.contratista.nombre;
  }
  await db.doc(`users/${uid}`).update(patch);
  logger.info(`nomina: ${uid} → ${r.estado}${patch.contratista_id ? ` (corregido a ${r.contratista.nombre})` : ''}`);
  return true;
}

/** Trigger 1 — registro nuevo de la app. */
const emparejarAlRegistrarse = onDocumentCreated('users/{uid}', async (event) => {
  const data = event.data?.data();
  if (!data || (data.rol ?? data.role ?? '') !== 'tecnico') return;
  const db = admin.firestore();
  const nominas = await leerNominas(db);
  await emparejarTecnico(db, event.params.uid, data, nominas);
});

/** Trigger 2 — la nómina cambió: re-evaluar los técnicos NO verificados
 *  (y los verificados cuya nómina pudo retirarlos NO se degradan solos —
 *  la verificación otorgada es un hecho histórico; retirar de la nómina
 *  solo afecta emparejamientos futuros, como pactó el diseño). */
const emparejarAlCargarNomina = onDocumentWritten('contratistas/{cid}/privado/{docId}', async (event) => {
  if (event.params.docId !== 'nomina') return;
  const db = admin.firestore();
  const nominas = await leerNominas(db);
  const tecnicos = await db.collection('users').where('rol', '==', 'tecnico').get();
  let n = 0;
  for (const t of tecnicos.docs) {
    const data = t.data();
    if (data.empleador_verificacion?.estado === 'verificado_nomina') continue;
    if (await emparejarTecnico(db, t.id, data, nominas)) n++;
  }
  if (n > 0) logger.info(`nomina: re-emparejados ${n} técnicos tras carga de nómina`);
});

module.exports = {
  emparejarAlRegistrarse,
  emparejarAlCargarNomina,
  // exportados para tests (patrón claims.js)
  normalizarCedula,
  resolverEmparejamiento,
};
