/**
 * ADOPCIÓN de la versión v1.1 del criterio del semáforo.
 *
 * El script de siembra (`sembrar-semaforo-versiones.js`) ABORTA a propósito si
 * el documento ya existe: reescribirlo borraría el historial de versiones, que
 * es justamente lo que ese documento existe para conservar. Este es el «script
 * propio de adopción» que aquel anunciaba.
 *
 * ── QUÉ HACE, Y QUÉ NO ──────────────────────────────────────────────────────
 * HACE tres cosas, y solo tres:
 *   1. agrega la entrada `v1.1` al mapa `versiones`;
 *   2. cierra la vigencia de la versión anterior (`vigente_hasta`);
 *   3. mueve `version_actual` a `v1.1`.
 *
 * NO toca el texto de ninguna versión anterior. v1.0 queda intacta porque los
 * documentos que la llevan sellada tienen que poder seguir explicándose — la
 * historia se cierra, no se reescribe.
 *
 * NO toca `licitaciones`. Cambiar el criterio y recalcular los documentos son
 * dos actos distintos (invariante 5), y el segundo tiene su propio script.
 *
 * ── SEGURIDAD ───────────────────────────────────────────────────────────────
 *   · DRY-RUN por defecto: solo lee e imprime el plan. Con `--apply` escribe.
 *   · ABORTA si `v1.1` ya existe — adoptar dos veces reescribiría su fecha.
 *   · ABORTA si el documento no existe: entonces lo que hace falta es sembrar,
 *     no adoptar.
 *   · El texto NO vive aquí: viene de `semaforo-v1.1.json`, que se genera
 *     desde `src/types/sigp/semaforoVersiones.ts` y está fijado por tests.
 *
 * ── QUÉ LLAVE PARA QUÉ (modelo de tres llaves) ─────────────────────────────
 *   · LEER — el dry-run:   `_credenciales\neg-sst-app-lectura.json`
 *   · ESCRIBIR — `--apply`: la llave de ESCRITURA DE DATOS, entregada para el
 *     acto y RETIRADA al terminar. No queda en el equipo.
 *
 * ── USO ─────────────────────────────────────────────────────────────────────
 *   node functions/scripts/adoptar-semaforo-v1.1.js                 (dry-run)
 *   AUTOR_UID=<uid> node functions/scripts/adoptar-semaforo-v1.1.js --apply
 */
const admin = require('firebase-admin');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

const NUEVA = require('./semaforo-v1.1.json');
const REF = 'configuracion/semaforo_versiones';
const APLICAR = process.argv.includes('--apply');

/** Campos que la entrada nueva DEBE traer. Uno de menos es una pantalla vacía. */
const CAMPOS_ESPERADOS = [
  'definicion', 'motivo', 'calibracion', 'limitaciones',
  'resumen', 'antes_de_descartar',
];

function abortar(mensaje) {
  console.error(`\n  ✗ ${mensaje}\n`);
  process.exit(1);
}

/**
 * Construye el documento nuevo a partir del actual. PURA: sin Firestore, sin
 * reloj propio — el mismo criterio que `construirDocSemilla`, y por la misma
 * razón: para que se pueda comparar campo por campo sin tocar la red.
 */
function planAdopcion(actual, autorUid, ahora) {
  const versiones = { ...actual.versiones };
  const anterior = actual.version_actual;

  if (versiones[NUEVA.version]) {
    return { error: `la versión ${NUEVA.version} YA ESTÁ en el registro` };
  }
  if (!versiones[anterior]) {
    return { error: `\`version_actual\` dice ${anterior} y esa versión no está en el mapa` };
  }

  // 1. La anterior cierra su vigencia. Su TEXTO no se toca.
  versiones[anterior] = { ...versiones[anterior], vigente_hasta: ahora };

  // 2. La nueva entra.
  versiones[NUEVA.version] = {
    vigente_desde: ahora,
    vigente_hasta: null,
    autor_uid: autorUid,
    definicion: NUEVA.definicion,
    motivo: NUEVA.motivo,
    calibracion: NUEVA.calibracion,
    limitaciones: NUEVA.limitaciones,
    resumen: NUEVA.resumen,
    antes_de_descartar: NUEVA.antes_de_descartar,
  };

  return { doc: { versiones, version_actual: NUEVA.version }, anterior };
}

async function main() {
  const faltan = CAMPOS_ESPERADOS.filter(c => !NUEVA[c] || !String(NUEVA[c]).trim());
  if (faltan.length > 0) {
    abortar(`el JSON de ${NUEVA.version} no trae: ${faltan.join(', ')}. `
      + 'Regenerarlo desde src/types/sigp/semaforoVersiones.ts.');
  }

  const AUTOR_UID = process.env.AUTOR_UID;
  if (APLICAR && !AUTOR_UID) abortar('falta AUTOR_UID: toda adopción tiene autor.');

  if (!admin.apps.length) admin.initializeApp();
  const db = getFirestore();

  const snap = await db.doc(REF).get();
  if (!snap.exists) {
    abortar(`${REF} NO EXISTE. Lo que hace falta es SEMBRAR, no adoptar: `
      + 'usa sembrar-semaforo-versiones.js.');
  }
  const actual = snap.data();

  console.log('');
  console.log('  ADOPCIÓN DEL CRITERIO DEL SEMÁFORO');
  console.log('  ' + '─'.repeat(60));
  console.log(`  documento   ${REF}`);
  console.log(`  modo        ${APLICAR ? '*** APPLY (escribe) ***' : 'dry-run (no escribe nada)'}`);
  console.log('');
  console.log('  ANTES');
  console.log(`    version_actual  ${actual.version_actual}`);
  console.log(`    versiones       ${Object.keys(actual.versiones || {}).join(', ')}`);
  console.log('');

  const plan = planAdopcion(actual, AUTOR_UID || '(dry-run)', Timestamp.now());
  if (plan.error) abortar(plan.error);

  console.log('  DESPUÉS');
  console.log(`    version_actual  ${plan.doc.version_actual}`);
  console.log(`    versiones       ${Object.keys(plan.doc.versiones).join(', ')}`);
  console.log(`    ${plan.anterior} cierra su vigencia; su texto NO se toca`);
  console.log('');
  console.log(`  LO QUE ${NUEVA.version} VA A DECIR:`);
  for (const c of CAMPOS_ESPERADOS) {
    const t = String(NUEVA[c]).replace(/\s+/g, ' ');
    console.log(`\n    ── ${c} ──`);
    console.log('    ' + (t.length > 320 ? t.slice(0, 320) + '…' : t));
  }
  console.log('');

  if (!APLICAR) {
    console.log('  ' + '─'.repeat(60));
    console.log('  DRY-RUN: no se escribió nada.');
    console.log('  Si lo de arriba es lo esperado, repetí el comando con --apply');
    console.log('  y AUTOR_UID definido.');
    console.log('');
    return;
  }

  await db.doc(REF).set(plan.doc);

  // Post-verificación: no se declara hecho lo que no se volvió a leer.
  const despues = (await db.doc(REF).get()).data();
  const v = despues.versiones?.[NUEVA.version];
  const ok = despues.version_actual === NUEVA.version
    && !!v && v.resumen === NUEVA.resumen
    && v.antes_de_descartar === NUEVA.antes_de_descartar
    && despues.versiones?.[plan.anterior]?.definicion === actual.versiones[plan.anterior].definicion;

  console.log('  ' + '─'.repeat(60));
  console.log(`  VERIFICACIÓN (releyendo)   version_actual=${despues.version_actual}`);
  console.log(`    ${NUEVA.version} presente con sus dos textos nuevos: ${v ? 'sí' : 'NO'}`);
  console.log(`    ${plan.anterior} con su definición intacta: ${
    despues.versiones?.[plan.anterior]?.definicion === actual.versiones[plan.anterior].definicion ? 'sí' : 'NO'}`);
  console.log('');
  if (!ok) abortar('la relectura NO coincide. NO declares el acto hecho.');
  console.log('  ✓ ADOPCIÓN COMPLETA Y VERIFICADA.');
  console.log('');
  console.log('  AHORA: retirá la llave de escritura del equipo.');
  console.log('');
}

module.exports = { planAdopcion, CAMPOS_ESPERADOS };

if (require.main === module) {
  main().catch(e => abortar(e.message));
}
