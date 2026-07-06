/**
 * Migración de usuarios al modelo de roles SIGP (Iteración 0.5.c de F0).
 *
 * Hace dos cosas sobre el proyecto `neg-sst-app`:
 *   1. ACTUALIZA el rol de 5 usuarios de panel ya existentes (update parcial
 *      del campo `rol`; preserva el resto de campos del documento).
 *   2. CREA 3 usuarios nuevos en Firebase Auth + su documento en `users`.
 *
 * ── Seguridad ───────────────────────────────────────────────────────────────
 *   - Por defecto corre en modo DRY-RUN: SOLO LEE e imprime el plan. Cero
 *     escrituras (ni Auth ni Firestore).
 *   - Solo con la flag `--apply` ejecuta las escrituras reales.
 *   - Manejo de errores por operación: si una falla, se reporta y se continúa
 *     con las demás; no se aborta todo el script.
 *
 * ── Cómo ejecutarlo ─────────────────────────────────────────────────────────
 *   1. Exportar la ruta a la service account de `neg-sst-app` y el password temporal
 *      de los usuarios nuevos (NINGUNO se versiona en el repo):
 *        Windows PowerShell:
 *          $env:GOOGLE_APPLICATION_CREDENTIALS="C:\apps\APLICACION SST\_credenciales\neg-sst-app-adminsdk.json"
 *          $env:PASSWORD_TEMPORAL_NUEVOS="<password temporal>"
 *   2. Desde `sst-panel-web/` (firebase-admin está en `functions/node_modules`):
 *        node functions/scripts/migrar-usuarios-sigp.js            # dry-run (default)
 *        node functions/scripts/migrar-usuarios-sigp.js --dry-run  # dry-run explícito
 *        node functions/scripts/migrar-usuarios-sigp.js --apply    # escritura real
 */

const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// --apply activa la escritura real. Cualquier otro caso (incl. --dry-run o sin
// flags) es DRY-RUN por seguridad.
const APLICAR = process.argv.includes('--apply');
const MODO = APLICAR ? 'APPLY (escritura real)' : 'DRY-RUN (solo lectura)';

// Password temporal de los usuarios nuevos: se lee de una variable de entorno,
// NUNCA se hardcodea (no debe quedar persistido en el historial de git).
const PASSWORD_TEMPORAL = process.env.PASSWORD_TEMPORAL_NUEVOS;
if (!PASSWORD_TEMPORAL) {
  console.error('Falta la variable de entorno PASSWORD_TEMPORAL_NUEVOS.');
  console.error('Ejecuta el script con: PASSWORD_TEMPORAL_NUEVOS=... node functions/scripts/migrar-usuarios-sigp.js ...');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'neg-sst-app',
});

const db = getFirestore();
const auth = admin.auth();

// Plan de migración. Fuente única de verdad de qué se toca.
const PLAN = [
  // ── Actualizaciones (usuarios de panel existentes) ──
  { tipo: 'update', nombre: 'Giovanny Montes',     email: 'giovanny.montes@negingenieria.com',  rol: 'admin' },
  { tipo: 'update', nombre: 'Ingrid Laverde',      email: 'ingridlaverde@negingenieria.com',    rol: 'admin' },
  { tipo: 'update', nombre: 'Paula Moreno',        email: 'auxiliar.proyectos@negingenieria.com', rol: 'director_proyectos' },
  { tipo: 'update', nombre: 'Juan Carlos Quesada', email: 'juan.quesada@negingenieria.com',     rol: 'sst' },
  { tipo: 'update', nombre: 'Mabel Lorena Diaz',   email: 'auxiliar.sst@negingenieria.com',     rol: 'sst' },

  // ── Creaciones (usuarios nuevos) ──
  { tipo: 'create', nombre: 'Pedro Rodríguez', email: 'pedro.rodriguez@negingenieria.com', rol: 'gerencia_general' },
  { tipo: 'create', nombre: 'Marcela Montoya', email: 'marcelamontoya@negingenieria.com',  rol: 'gerencia_administrativa' },
  { tipo: 'create', nombre: 'Karen Cartagena', email: 'licitaciones@negingenieria.com',    rol: 'operacion_comercial' },
];

async function buscarEnAuth(email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (e) {
    if (e.code === 'auth/user-not-found') return null;
    throw e;
  }
}

async function procesarUpdate(op, stats) {
  const userRecord = await buscarEnAuth(op.email);
  if (!userRecord) {
    console.log(`  ✗ [update] ${op.email} — NO existe en Firebase Auth. Saltado.`);
    stats.saltados++;
    return;
  }

  const uid = userRecord.uid;
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();

  if (!snap.exists) {
    console.log(`  ✗ [update] ${op.email} (uid ${uid}) — sin documento en users/. Saltado.`);
    stats.saltados++;
    return;
  }

  const rolActual = snap.data().rol ?? '(sin rol)';
  if (rolActual === op.rol) {
    console.log(`  = [update] ${op.email} (uid ${uid}) — rol ya es '${op.rol}'. Sin cambio necesario.`);
    stats.sinCambio++;
    return;
  }

  console.log(`  → [update] ${op.email} (uid ${uid}) — rol '${rolActual}' → '${op.rol}'`);
  if (APLICAR) {
    await ref.update({ rol: op.rol }); // update parcial: preserva los demás campos
    console.log('    ✓ rol actualizado.');
  } else {
    console.log('    (dry-run: no se escribió)');
  }
  stats.actualizados++;
}

async function procesarCreate(op, stats) {
  const existente = await buscarEnAuth(op.email);
  if (existente) {
    console.log(`  ✗ [create] ${op.email} — YA existe en Auth (uid ${existente.uid}). Saltado (no se sobrescribe).`);
    stats.saltados++;
    return;
  }

  console.log(`  + [create] ${op.email} — SERÍA CREADO con rol '${op.rol}' (password temporal).`);
  if (APLICAR) {
    const userRecord = await auth.createUser({
      email: op.email,
      password: PASSWORD_TEMPORAL,
      displayName: op.nombre,
      emailVerified: false,
    });
    const uid = userRecord.uid;
    await db.collection('users').doc(uid).set({
      email: op.email,
      nombre: op.nombre,
      rol: op.rol,
      estado: 'activo',
      fecha_creacion: FieldValue.serverTimestamp(),
    });
    console.log(`    ✓ creado en Auth (uid ${uid}) + documento users/${uid}.`);
  } else {
    console.log('    (dry-run: no se creó)');
  }
  stats.creados++;
}

async function main() {
  const line = '─'.repeat(60);
  console.log(`\n${line}`);
  console.log(`MIGRACIÓN DE USUARIOS SIGP — modo ${MODO}`);
  console.log(`Proyecto: neg-sst-app · Operaciones en el plan: ${PLAN.length}`);
  console.log(line + '\n');

  const stats = { actualizados: 0, creados: 0, sinCambio: 0, saltados: 0 };

  for (const op of PLAN) {
    try {
      if (op.tipo === 'update') await procesarUpdate(op, stats);
      else if (op.tipo === 'create') await procesarCreate(op, stats);
    } catch (e) {
      console.error(`  ✗ [${op.tipo}] ${op.email} — ERROR: ${e.message}. Saltado, se continúa.`);
      stats.saltados++;
    }
  }

  console.log('\n' + line);
  console.log(`RESUMEN (${MODO})`);
  console.log(line);
  console.table({
    'Actualizados':          { cantidad: stats.actualizados },
    'Creados':               { cantidad: stats.creados },
    'Sin cambio necesario':  { cantidad: stats.sinCambio },
    'Saltados por error':    { cantidad: stats.saltados },
  });

  if (!APLICAR) {
    console.log('\n⚠️  MODO DRY-RUN: no se escribió NADA en Auth ni Firestore.');
    console.log('   Para ejecutar los cambios reales, corre con: --apply');
  }

  await admin.app().delete();
}

main().catch((err) => {
  console.error('\nError fatal ejecutando la migración:', err.message);
  console.error('¿Configuraste GOOGLE_APPLICATION_CREDENTIALS con la service account de neg-sst-app?');
  process.exit(1);
});
