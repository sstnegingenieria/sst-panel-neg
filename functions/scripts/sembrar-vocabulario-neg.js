/**
 * Semilla de `configuracion/vocabulario_neg` — el léxico del trabajo de NEG
 * con el que el radar clasifica un proceso cuyo código UNSPC todavía no está
 * asignado (sub-bloque B.1b).
 *
 * Escribe UN documento con la versión v1.0 del léxico: los términos, de qué
 * corpus salieron, con qué método, qué se midió, qué se excluyó a mano y por
 * qué, y qué NO puede hacer. Es la contraparte auditable de
 * `ReporteIngestaSecop.vocabulario_version`.
 *
 * ── NO ES EL CAMINO PRINCIPAL ───────────────────────────────────────────────
 * El léxico va EMPAQUETADO en el bundle (`vocabulario-neg-v1.0.json`), y el
 * clasificador degrada a él cuando el documento no existe. Este script existe
 * para que el léxico quede además EN FIRESTORE, legible por el panel y
 * editable por quien tiene el rol, sin volver a desplegar. Si el documento no
 * está, el radar NO se apaga: usa el empaquetado y lo dice en el reporte.
 *
 * ── Seguridad ───────────────────────────────────────────────────────────────
 *   - Por defecto corre en modo DRY-RUN: SOLO LEE e imprime el plan.
 *   - Solo con la flag `--apply` escribe.
 *   - IDEMPOTENTE Y NO DESTRUCTIVO: si el documento ya existe, ABORTA sin
 *     tocarlo. Reescribirlo borraría el historial de versiones del criterio —
 *     exactamente lo que este documento existe para conservar. Para adoptar
 *     una versión nueva va un script propio de adopción, no este.
 *   - El texto de la semilla NO vive aquí: se construye con
 *     `construirSemillaVocabularioNeg` de `src/types/sigp/vocabularioNeg.ts`
 *     (fuente única, con tests). Este archivo replica esa construcción en CJS
 *     porque `functions/` no compila TypeScript, y hay un test que compara las
 *     dos campo por campo.
 *
 * ── QUÉ LLAVE PARA QUÉ (modelo de tres llaves, 09-nov-2026) ────────────────
 *
 *   · LEER — el dry-run de este script y cualquier verificación:
 *       `_credenciales\neg-sst-app-lectura.json`
 *       (sigp-lectura@neg-sst-app.iam.gserviceaccount.com)
 *     El dry-run SOLO hace `get`.
 *
 *   · ESCRIBIR DATOS — la bandera `--apply`:
 *       la llave de ESCRITURA DE DATOS (`sigp-escritura-datos`), que entrega
 *       Giovanny POR ACTO y se retira al terminar. Alternativa preferible:
 *       escribirlo desde el panel con la sesión de quien tiene el rol
 *       (gerencia_general o admin), que es lo que autoriza la regla.
 *
 *   · DESPLEGAR — NINGUNA llave de servicio sirve, y no se debe buscar una.
 *     Las reglas salen por `scripts/deploy-reglas.ps1` con la sesión de la
 *     persona; las Cloud Functions, igual.
 *
 *   ⚠ La llave admin `neg-sst-app-adminsdk.json` fue REVOCADA. Si aparece en
 *   algún equipo, se borra: no se vuelve a descargar.
 *
 * ── Reglas Firestore ────────────────────────────────────────────────────────
 * NO hace falta regla nueva: el match genérico `configuracion/{docId}` ya da
 * lectura a `accesoSIGP()` y escritura a `gerencia_general` y `admin`.
 *
 * ── Cómo ejecutarlo ─────────────────────────────────────────────────────────
 *   export GOOGLE_APPLICATION_CREDENTIALS="/c/apps/APLICACION SST/_credenciales/neg-sst-app-lectura.json"
 *   export AUTOR_UID="<uid de quien adopta el léxico>"
 *   node functions/scripts/sembrar-vocabulario-neg.js            # dry-run
 *   node functions/scripts/sembrar-vocabulario-neg.js --apply     # escribe
 */

const admin = require('firebase-admin');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

const SEMILLA = require('./vocabulario-neg-v1.0.json');

const APLICAR = process.argv.includes('--apply');
const MODO = APLICAR ? 'APLICAR (escribe)' : 'DRY-RUN (solo lee)';
const REF = 'configuracion/vocabulario_neg';
const VERSION_INICIAL = SEMILLA.version;

/**
 * Guarda anti-omisión: el JSON es la fuente y este script su único consumidor
 * del lado servidor. Cuando el léxico gana un campo es fácil actualizar el
 * JSON y olvidar este archivo — y el documento se sembraría incompleto SIN que
 * nada avise, con el agravante de que la siembra aborta al reintentar. Es el
 * mismo chequeo que atrapó el `limitaciones` omitido del criterio del semáforo.
 */
const CAMPOS_ESPERADOS = [
  'version', 'definicion', 'derivacion', 'metricas', 'excluidos',
  'limitaciones', 'terminos', 'frecuencias',
];

function camposNoEscritos() {
  return Object.keys(SEMILLA).filter((k) => !CAMPOS_ESPERADOS.includes(k));
}

/**
 * Construye el documento a sembrar. PURA: sin Firestore, sin `process`, sin
 * reloj propio — para que un test pueda compararla contra el JSON y contra la
 * versión TypeScript campo por campo.
 *
 * `frecuencias` NO va al documento: son el respaldo de la derivación, viven en
 * el JSON del repo y pesan más que todo lo demás junto. Lo que el panel
 * necesita leer es la lista y el por qué.
 */
function construirDocSemilla(autorUid, ahora) {
  return {
    versiones: {
      [VERSION_INICIAL]: {
        vigente_desde: ahora,
        vigente_hasta: null,
        definicion: SEMILLA.definicion,
        derivacion: SEMILLA.derivacion,
        metricas: SEMILLA.metricas,
        excluidos: SEMILLA.excluidos,
        limitaciones: SEMILLA.limitaciones,
        autor_uid: autorUid,
        terminos: [...SEMILLA.terminos],
      },
    },
    version_actual: VERSION_INICIAL,
  };
}

async function main() {
  const AUTOR_UID = process.env.AUTOR_UID;
  if (!AUTOR_UID) {
    console.error('Falta la variable de entorno AUTOR_UID (uid de quien adopta el léxico).');
    process.exit(1);
  }

  const faltantes = camposNoEscritos();
  if (faltantes.length > 0) {
    console.error(`ABORTA: vocabulario-neg-v1.0.json trae campos que este script no conoce: ${faltantes.join(', ')}`);
    console.error('Agrégalos a CAMPOS_ESPERADOS (y al documento si deben persistirse) antes de sembrar.');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'neg-sst-app',
  });
  const db = getFirestore();
  console.log(`\n=== Semilla de ${REF} ===`);
  console.log(`Modo: ${MODO}`);
  console.log(`Autor: ${AUTOR_UID}`);
  console.log(`Términos: ${SEMILLA.terminos.length}\n`);

  const ref = db.doc(REF);
  const snap = await ref.get();

  if (snap.exists) {
    console.error(`ABORTA: ${REF} ya existe.`);
    console.error('Este script solo SIEMBRA. Reescribirlo borraría el historial de');
    console.error('versiones del léxico. Versión actual en el documento:',
      snap.data().version_actual);
    process.exit(1);
  }

  const doc = construirDocSemilla(AUTOR_UID, Timestamp.now());

  console.log('Documento a escribir:');
  console.log(JSON.stringify(doc, null, 2));

  if (!APLICAR) {
    console.log('\n⚠️  MODO DRY-RUN: no se escribió NADA.');
    console.log('Para aplicar: node functions/scripts/sembrar-vocabulario-neg.js --apply\n');
    return;
  }

  // `create` (no `set`) — falla si el documento apareció entre el get y aquí.
  await ref.create(doc);
  console.log(`\n✅ ${REF} sembrado con ${VERSION_INICIAL}.`);

  // Post-verificación: releer y CONTAR. «No falló» no es «funcionó».
  const post = await ref.get();
  const v = post.data().versiones[VERSION_INICIAL];
  console.log('Post-verificación:');
  console.log(`  version_actual:  ${post.data().version_actual}`);
  console.log(`  términos:        ${v.terminos.length} (esperados ${SEMILLA.terminos.length})`);
  console.log(`  autor_uid:       ${v.autor_uid}`);
  console.log(`  vigente_hasta:   ${v.vigente_hasta}`);
  console.log(`  definicion OK:   ${v.definicion === SEMILLA.definicion}`);
  console.log(`  derivacion OK:   ${v.derivacion === SEMILLA.derivacion}`);
  console.log(`  limitaciones OK: ${v.limitaciones === SEMILLA.limitaciones}`);
  const iguales = v.terminos.length === SEMILLA.terminos.length
    && v.terminos.every((t, i) => t === SEMILLA.terminos[i]);
  console.log(`  términos OK:     ${iguales}\n`);
  if (!iguales) {
    console.error('⚠️  Los términos escritos NO coinciden con el JSON. Revisar antes de usar.');
    process.exit(1);
  }
}

// Solo corre al ejecutarse directamente: importarlo desde un test no debe
// tocar Firestore ni leer variables de entorno.
if (require.main === module) {
  main().catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  });
}

module.exports = { construirDocSemilla, camposNoEscritos, SEMILLA, CAMPOS_ESPERADOS, REF };
