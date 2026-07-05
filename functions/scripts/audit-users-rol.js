/**
 * Auditoría del campo de rol en la colección `users`.
 *
 * Responde para la Iteración 0.5 de F0 (consolidación rol/role → migración SIGP):
 *   - Cuántos docs tienen solo `rol`, solo `role`, ambos, ninguno.
 *   - Qué valores distintos existen en cada campo (detecta roles huérfanos).
 *   - Cuántos docs tienen conflicto (rol y role con valores distintos).
 *   - Total de usuarios.
 *
 * Es SOLO LECTURA. No escribe ni modifica nada en Firestore.
 *
 * ── Cómo ejecutarlo ─────────────────────────────────────────────────────────
 * 1. Descargar la service account key del proyecto `neg-sst-app`:
 *      Firebase Console → ⚙ Configuración del proyecto → Cuentas de servicio
 *      → "Generar nueva clave privada" → guarda el JSON.
 * 2. Exportar la ruta a la key (NO la subas al repo):
 *      Windows PowerShell:  $env:GOOGLE_APPLICATION_CREDENTIALS="C:\ruta\a\key.json"
 *      Git Bash / Linux:    export GOOGLE_APPLICATION_CREDENTIALS="/c/ruta/a/key.json"
 * 3. Desde `sst-panel-web/functions/` (donde ya está instalado firebase-admin):
 *      node scripts/audit-users-rol.js
 *
 * Genera además `audit-users-rol.csv` en el directorio actual.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Usa GOOGLE_APPLICATION_CREDENTIALS automáticamente (applicationDefault).
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'neg-sst-app',
});

const db = admin.firestore();

// Normaliza un valor de rol para conteo: trim + minúsculas; vacío → null.
function norm(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function inc(map, key) {
  map[key] = (map[key] || 0) + 1;
}

async function main() {
  console.log('Leyendo colección `users` del proyecto neg-sst-app...\n');

  const snap = await db.collection('users').get();
  const total = snap.size;

  let soloRol = 0;
  let soloRole = 0;
  let ambos = 0;
  let ninguno = 0;
  let conflicto = 0;

  const valoresRol = {};   // valor -> count
  const valoresRole = {};  // valor -> count
  const conflictos = [];   // {id, rol, role}

  snap.forEach((doc) => {
    const d = doc.data();
    const rol = norm(d.rol);
    const role = norm(d.role);

    if (rol !== null) inc(valoresRol, rol);
    if (role !== null) inc(valoresRole, role);

    const tieneRol = rol !== null;
    const tieneRole = role !== null;

    if (tieneRol && tieneRole) {
      ambos++;
      if (rol !== role) {
        conflicto++;
        conflictos.push({ id: doc.id, rol, role });
      }
    } else if (tieneRol && !tieneRole) {
      soloRol++;
    } else if (!tieneRol && tieneRole) {
      soloRole++;
    } else {
      ninguno++;
    }
  });

  // ── Salida por consola ────────────────────────────────────────────────────
  const line = '─'.repeat(56);
  console.log(line);
  console.log('RESUMEN DE PRESENCIA DE CAMPO');
  console.log(line);
  console.table({
    'Total usuarios':        { cantidad: total },
    'Solo `rol`':            { cantidad: soloRol },
    'Solo `role`':           { cantidad: soloRole },
    'Ambos campos':          { cantidad: ambos },
    '  └ en conflicto':      { cantidad: conflicto },
    'Ningún campo de rol':   { cantidad: ninguno },
  });

  console.log('\n' + line);
  console.log('VALORES DISTINTOS EN `rol`');
  console.log(line);
  console.table(valoresRol);

  console.log('\n' + line);
  console.log('VALORES DISTINTOS EN `role` (legacy)');
  console.log(line);
  console.table(valoresRole);

  if (conflictos.length) {
    console.log('\n' + line);
    console.log(`DOCS EN CONFLICTO (rol !== role): ${conflictos.length}`);
    console.log(line);
    console.table(conflictos);
  } else {
    console.log('\nSin conflictos: ningún doc tiene `rol` y `role` con valores distintos.');
  }

  // ── Export CSV ────────────────────────────────────────────────────────────
  const rows = [];
  rows.push(['seccion', 'clave', 'valor']);
  rows.push(['resumen', 'total_usuarios', total]);
  rows.push(['resumen', 'solo_rol', soloRol]);
  rows.push(['resumen', 'solo_role', soloRole]);
  rows.push(['resumen', 'ambos', ambos]);
  rows.push(['resumen', 'ambos_en_conflicto', conflicto]);
  rows.push(['resumen', 'ninguno', ninguno]);
  for (const [val, count] of Object.entries(valoresRol)) {
    rows.push(['valores_rol', val, count]);
  }
  for (const [val, count] of Object.entries(valoresRole)) {
    rows.push(['valores_role', val, count]);
  }
  for (const c of conflictos) {
    rows.push(['conflicto', c.id, `rol=${c.rol}|role=${c.role}`]);
  }

  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const outPath = path.join(process.cwd(), 'audit-users-rol.csv');
  fs.writeFileSync(outPath, '﻿' + csv, 'utf8'); // BOM para Excel
  console.log(`\nCSV escrito en: ${outPath}`);

  await admin.app().delete();
}

main().catch((err) => {
  console.error('\nError ejecutando la auditoría:', err.message);
  console.error('\n¿Configuraste GOOGLE_APPLICATION_CREDENTIALS con la service account de neg-sst-app?');
  process.exit(1);
});
