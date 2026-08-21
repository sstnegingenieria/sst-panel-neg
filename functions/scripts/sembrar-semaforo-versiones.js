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
const LIMITACIONES_V1_0 = SEMILLA.limitaciones;

// Guarda anti-omisión: el JSON es la fuente y este script su ÚNICO consumidor
// del lado servidor. Cuando el criterio gana un campo (como pasó con
// `limitaciones` en el 1.3b), es fácil actualizar el JSON y olvidar este
// archivo — y el documento se sembraría incompleto SIN que nada avise, con el
// agravante de que la siembra aborta al reintentar. Este chequeo lo impide.
const CAMPOS_ESPERADOS = ['version', 'definicion', 'motivo', 'calibracion', 'limitaciones'];
function camposNoEscritos() {
  return Object.keys(SEMILLA).filter((k) => !CAMPOS_ESPERADOS.includes(k));
}

const REF = 'configuracion/semaforo_versiones';

/**
 * Construye el documento a sembrar. PURA: sin Firestore, sin `process`, sin
 * reloj propio — para que un test pueda compararla contra el JSON campo por
 * campo. El defecto que motivó esta extracción era INVISIBLE: el script
 * omitía `limitaciones` y la pantalla del "rojo informado" habría mostrado
 * vacía justamente la sección contra la que se diseñó.
 */
function construirDocSemilla(autorUid, ahora) {
  return {
    versiones: {
      [VERSION_INICIAL]: {
        vigente_desde: ahora,
        vigente_hasta: null,
        definicion: DEFINICION_V1_0,
        motivo: MOTIVO_V1_0,
        autor_uid: autorUid,
        calibracion: CALIBRACION_V1_0,
        // El texto que la UI del "rojo informado" lee EN VIVO de Firestore.
        // Sin él, la pantalla que explica por qué el criterio frena un proceso
        // —y que en 2023 la menor cuantía produjo tres adjudicaciones— queda
        // vacía. Es el campo más importante del registro.
        limitaciones: LIMITACIONES_V1_0,
      },
    },
    version_actual: VERSION_INICIAL,
  };
}

async function main() {
  const AUTOR_UID = process.env.AUTOR_UID;
  if (!AUTOR_UID) {
    console.error('Falta la variable de entorno AUTOR_UID (uid de quien adopta el criterio).');
    process.exit(1);
  }

  const faltantes = camposNoEscritos();
  if (faltantes.length > 0) {
    console.error(`ABORTA: semaforo-v1.0.json trae campos que este script no escribe: ${faltantes.join(', ')}`);
    console.error('Agrégalos al documento y a CAMPOS_ESPERADOS antes de sembrar.');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'neg-sst-app',
  });
  const db = getFirestore();
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

  const doc = construirDocSemilla(AUTOR_UID, Timestamp.now());

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

// Solo corre al ejecutarse directamente: importarlo desde un test no debe
// tocar Firestore ni leer variables de entorno.
if (require.main === module) {
  main().catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  });
}

module.exports = { construirDocSemilla, camposNoEscritos, SEMILLA, CAMPOS_ESPERADOS, REF };
