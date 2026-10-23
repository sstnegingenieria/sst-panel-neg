/**
 * Semilla de `configuracion/plantilla_requisitos` — plantilla de requisitos
 * del pliego típico (sub-bloque A.2a).
 *
 * Escribe UN documento con la versión v1.0 de la plantilla: los 22 renglones
 * que el área comercial reportó como los requisitos que aparecen en la
 * mayoría de los procesos, con su vigencia y su autor. Es el punto de partida
 * para no armar el checklist de cada pliego desde cero.
 *
 * ── Seguridad ───────────────────────────────────────────────────────────────
 *   - Por defecto corre en modo DRY-RUN: SOLO LEE e imprime el plan. Cero
 *     escrituras (patrón de sembrar-semaforo-versiones.js).
 *   - Solo con la flag `--apply` escribe.
 *   - IDEMPOTENTE Y NO DESTRUCTIVO: si el documento ya existe, ABORTA sin
 *     tocarlo. Reescribir el registro borraría el historial de versiones de
 *     la plantilla — exactamente lo que este documento existe para conservar.
 *     Para adoptar una versión nueva va un script propio de adopción, no
 *     este.
 *   - El CONTENIDO no vive aquí: se importa de
 *     `plantilla-requisitos-v1.0.json` (fuente única). El test
 *     `plantillaRequisitos.test.ts` compara ese JSON contra las constantes de
 *     `src/types/sigp/plantillaRequisitos.ts` renglón por renglón y valida
 *     los vocabularios en runtime — si divergen, la suite falla.
 *
 * ── Cómo ejecutarlo ─────────────────────────────────────────────────────────
 *   1. Exportar la service account y el uid del autor (la persona de dirección
 *      que adopta la plantilla — queda en `autor_uid`):
 *        Windows PowerShell:
 *          $env:GOOGLE_APPLICATION_CREDENTIALS="C:\apps\APLICACION SST\_credenciales\neg-sst-app-adminsdk.json"
 *          $env:AUTOR_UID="<uid de quien adopta la plantilla>"
 *   2. Desde `sst-panel-web/`:
 *        node functions/scripts/sembrar-plantilla-requisitos.js            # dry-run (default)
 *        node functions/scripts/sembrar-plantilla-requisitos.js --apply    # escritura real
 *
 * NO EJECUTADO en este sub-bloque (no se despliega ni se escribe nada).
 */

const admin = require('firebase-admin');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

// --apply activa la escritura real. Cualquier otro caso es DRY-RUN.
const APLICAR = process.argv.includes('--apply');
const MODO = APLICAR ? 'APPLY (escritura real)' : 'DRY-RUN (solo lectura)';

const SEMILLA = require('./plantilla-requisitos-v1.0.json');

const REF = 'configuracion/plantilla_requisitos';

/**
 * GUARDA ANTI-OMISIÓN — la lección del `limitaciones` olvidado.
 *
 * En el despliegue del Bloque 1 el JSON del criterio había ganado el campo
 * `limitaciones` en el 1.3b y el script de siembra NUNCA se actualizó: el
 * documento se habría sembrado incompleto SIN que nada avisara, y como la
 * siembra aborta al reintentar, no había arreglo sin otro script. Se atrapó
 * leyendo el dry-run, de pura suerte.
 *
 * Esta guarda hace que ese escenario sea imposible: si el JSON trae una clave
 * que este script no escribe, ABORTA nombrándola.
 */
const CAMPOS_ESPERADOS = [
  'version', 'nombre', 'origen',
  // Notas de documentación del JSON: se leen al revisarlo, no viajan al doc.
  'nota_descripcion', 'nota_capitulo',
  'items',
];

/** Claves que este script escribe de cada renglón. */
const CAMPOS_ITEM_ESPERADOS = ['capitulo', 'categoria', 'descripcion', 'tipo_evidencia'];

function camposNoEscritos() {
  return Object.keys(SEMILLA).filter((k) => !CAMPOS_ESPERADOS.includes(k));
}

function camposDeItemNoEscritos() {
  const vistos = new Set();
  for (const item of SEMILLA.items || []) {
    for (const k of Object.keys(item)) {
      if (!CAMPOS_ITEM_ESPERADOS.includes(k)) vistos.add(k);
    }
  }
  return [...vistos];
}

/**
 * Construye el documento a sembrar. PURA: sin Firestore, sin `process`, sin
 * reloj propio — para que un test pueda compararla contra el JSON campo por
 * campo. Réplica de `construirSemillaPlantillaRequisitos` del lado TS; el
 * test de paridad fija que no divergen.
 */
function construirDocPlantilla(autorUid, ahora) {
  return {
    versiones: {
      [SEMILLA.version]: {
        vigente_desde: ahora,
        vigente_hasta: null,
        nombre: SEMILLA.nombre,
        origen: SEMILLA.origen,
        autor_uid: autorUid,
        // Los renglones viajan con EXACTAMENTE sus cuatro campos — nada de
        // estado ni firma: la plantilla es una lista de preguntas.
        items: SEMILLA.items.map((i) => ({
          capitulo: i.capitulo,
          categoria: i.categoria,
          descripcion: i.descripcion,
          tipo_evidencia: i.tipo_evidencia,
        })),
      },
    },
    version_actual: SEMILLA.version,
  };
}

/** Resumen por capítulo, para que el dry-run se pueda leer de un vistazo. */
function conteoPorCapitulo(items) {
  return items.reduce((acc, i) => {
    acc[i.capitulo] = (acc[i.capitulo] || 0) + 1;
    return acc;
  }, {});
}

async function main() {
  const AUTOR_UID = process.env.AUTOR_UID;
  if (!AUTOR_UID) {
    console.error('Falta la variable de entorno AUTOR_UID (uid de quien adopta la plantilla).');
    process.exit(1);
  }

  const faltantes = camposNoEscritos();
  if (faltantes.length > 0) {
    console.error(`ABORTA: plantilla-requisitos-v1.0.json trae campos que este script no escribe: ${faltantes.join(', ')}`);
    console.error('Agrégalos al documento y a CAMPOS_ESPERADOS antes de sembrar.');
    process.exit(1);
  }
  const faltantesItem = camposDeItemNoEscritos();
  if (faltantesItem.length > 0) {
    console.error(`ABORTA: los renglones traen campos que este script no escribe: ${faltantesItem.join(', ')}`);
    console.error('Agrégalos a construirDocPlantilla y a CAMPOS_ITEM_ESPERADOS antes de sembrar.');
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
    console.error('de versiones de la plantilla. Versión actual en el documento:',
      snap.data().version_actual);
    process.exit(1);
  }

  const doc = construirDocPlantilla(AUTOR_UID, Timestamp.now());
  const items = doc.versiones[SEMILLA.version].items;

  console.log(`Versión: ${doc.version_actual}`);
  console.log(`Nombre:  ${SEMILLA.nombre}`);
  console.log(`Renglones: ${items.length}  ${JSON.stringify(conteoPorCapitulo(items))}\n`);
  for (const i of items) {
    console.log(`  [${i.capitulo.padEnd(12)}] ${i.categoria.padEnd(12)} ${i.tipo_evidencia.padEnd(20)} ${i.descripcion}`);
  }
  console.log('\nTodos nacen en `pendiente` al clonarse a una licitación — la');
  console.log('plantilla NO guarda estado (ver el test del renglón sin veredicto).\n');

  if (!APLICAR) {
    console.log('⚠️  MODO DRY-RUN: no se escribió NADA.');
    console.log('Para aplicar: node functions/scripts/sembrar-plantilla-requisitos.js --apply\n');
    return;
  }

  // `create` (no `set`) — falla si el documento apareció entre el get y aquí.
  await ref.create(doc);
  console.log(`\n✅ ${REF} sembrado con ${doc.version_actual}.`);

  // Post-verificación: releer y confirmar contra la fuente.
  const post = await ref.get();
  const v = post.data().versiones[SEMILLA.version];
  console.log('Post-verificación:');
  console.log(`  version_actual:  ${post.data().version_actual}`);
  console.log(`  vigente_hasta:   ${v.vigente_hasta}`);
  console.log(`  autor_uid:       ${v.autor_uid}`);
  console.log(`  nombre OK:       ${v.nombre === SEMILLA.nombre}`);
  console.log(`  origen OK:       ${v.origen === SEMILLA.origen}`);
  console.log(`  renglones OK:    ${v.items.length === SEMILLA.items.length} (${v.items.length})`);
  const iguales = v.items.every((it, idx) => CAMPOS_ITEM_ESPERADOS
    .every((k) => it[k] === SEMILLA.items[idx][k]));
  console.log(`  renglones idénticos a la fuente: ${iguales}\n`);
}

// Solo corre al ejecutarse directamente: importarlo desde un test no debe
// tocar Firestore ni leer variables de entorno.
if (require.main === module) {
  main().catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  });
}

module.exports = {
  construirDocPlantilla,
  camposNoEscritos,
  camposDeItemNoEscritos,
  conteoPorCapitulo,
  SEMILLA,
  CAMPOS_ESPERADOS,
  CAMPOS_ITEM_ESPERADOS,
  REF,
};
