/**
 * Semilla de `configuracion/semaforo_versiones` — registro del criterio del
 * semáforo de licitaciones (sub-bloque 1.2).
 *
 * Escribe UN documento con la versión v1.0 del criterio: su vigencia, su
 * definición legible, por qué se adoptó, quién la adoptó y contra qué medición
 * se calibró. Es la contraparte auditable de `licitaciones/{id}.semaforo_version`.
 *
 * ── Seguridad ───────────────────────────────────────────────────────────────
 *   - Por defecto corre en modo DRY-RUN: SOLO LEE e imprime el plan. Cero
 *     escrituras (patrón de functions/scripts/migrar-usuarios-sigp.js).
 *   - Solo con la flag `--apply` escribe.
 *   - IDEMPOTENTE Y NO DESTRUCTIVO: si el documento ya existe, ABORTA sin
 *     tocarlo. Reescribir el registro del criterio borraría el historial de
 *     versiones — exactamente lo que este documento existe para conservar.
 *     Para agregar una versión nueva se usa un script propio de adopción, no
 *     este.
 *   - El texto de la semilla NO vive aquí: se importa de
 *     `src/types/sigp/semaforoVersiones.ts` (fuente única, con tests).
 *
 * ── Cómo ejecutarlo ─────────────────────────────────────────────────────────
 *   1. Exportar la service account y el uid del autor (la persona de dirección
 *      que adopta el criterio — queda en `autor_uid`):
 *        Windows PowerShell:
 *          $env:GOOGLE_APPLICATION_CREDENTIALS="C:\apps\APLICACION SST\_credenciales\neg-sst-app-adminsdk.json"
 *          $env:AUTOR_UID="<uid de quien adopta el criterio>"
 *   2. Desde `sst-panel-web/`:
 *        node functions/scripts/sembrar-semaforo-versiones.js            # dry-run (default)
 *        node functions/scripts/sembrar-semaforo-versiones.js --apply    # escritura real
 *
 * NO EJECUTADO en este sub-bloque (no se despliega ni se escribe nada).
 */

const admin = require('firebase-admin');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

// --apply activa la escritura real. Cualquier otro caso es DRY-RUN.
const APLICAR = process.argv.includes('--apply');
const MODO = APLICAR ? 'APPLY (escritura real)' : 'DRY-RUN (solo lectura)';

const AUTOR_UID = process.env.AUTOR_UID;
if (!AUTOR_UID) {
  console.error('Falta la variable de entorno AUTOR_UID (uid de quien adopta el criterio).');
  process.exit(1);
}

// ── Semilla: el TEXTO vive en semaforo-v1.0.json, no aquí ───────────────────
// Este script corre en Node/CommonJS y no puede importar el módulo TS, así que
// el dato se externaliza a JSON y lo consumen los DOS lados. El test
// `semaforoVersiones.test.ts` compara las constantes de
// `src/types/sigp/semaforoVersiones.ts` contra este mismo JSON carácter por
// carácter — si divergen, la suite falla. Cero texto duplicado a mano.
const SEMILLA = require('./semaforo-v1.0.json');

const VERSION_INICIAL = SEMILLA.version;
const DEFINICION_V1_0 = SEMILLA.definicion;
const MOTIVO_V1_0 = SEMILLA.motivo;
const CALIBRACION_V1_0 = SEMILLA.calibracion;

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'neg-sst-app',
});

const db = getFirestore();
const REF = 'configuracion/semaforo_versiones';

async function main() {
  console.log(`\n=== Semilla de ${REF} ===`);
  console.log(`Modo: ${MODO}`);
  console.log(`Autor: ${AUTOR_UID}\n`);

  const ref = db.doc(REF);
  const snap = await ref.get();

  if (snap.exists) {
    console.error(`ABORTA: ${REF} ya existe.`);
    console.error('Este script solo SIEMBRA. Reescribirlo borraría el historial');
    console.error('de versiones del criterio. Versión actual en el documento:',
      snap.data().version_actual);
    process.exit(1);
  }

  const ahora = Timestamp.now();
  const doc = {
    versiones: {
      [VERSION_INICIAL]: {
        vigente_desde: ahora,
        vigente_hasta: null,
        definicion: DEFINICION_V1_0,
        motivo: MOTIVO_V1_0,
        autor_uid: AUTOR_UID,
        calibracion: CALIBRACION_V1_0,
      },
    },
    version_actual: VERSION_INICIAL,
  };

  console.log('Documento a escribir:');
  console.log(JSON.stringify(doc, null, 2));

  if (!APLICAR) {
    console.log('\n⚠️  MODO DRY-RUN: no se escribió NADA.');
    console.log('Para aplicar: node functions/scripts/sembrar-semaforo-versiones.js --apply\n');
    return;
  }

  // `create` (no `set`) — falla si el documento apareció entre el get y aquí.
  await ref.create(doc);
  console.log(`\n✅ ${REF} sembrado con ${VERSION_INICIAL}.`);

  // Post-verificación: releer y confirmar.
  const post = await ref.get();
  const v = post.data().versiones[VERSION_INICIAL];
  console.log('Post-verificación:');
  console.log(`  version_actual: ${post.data().version_actual}`);
  console.log(`  vigente_hasta:  ${v.vigente_hasta}`);
  console.log(`  autor_uid:      ${v.autor_uid}`);
  console.log(`  definicion OK:  ${v.definicion === DEFINICION_V1_0}`);
  console.log(`  motivo OK:      ${v.motivo === MOTIVO_V1_0}`);
  console.log(`  calibracion OK:  ${v.calibracion === CALIBRACION_V1_0}`);
  console.log(`  limitaciones OK: ${v.limitaciones === LIMITACIONES_V1_0}\n`);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
