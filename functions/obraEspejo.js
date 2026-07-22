/**
 * Cloud Function: asignarObraAlPrincipal (2ª gen — trigger Firestore)
 *
 * Bloque 3+5 (22-jul-2026): cuando la obra-espejo de un proyecto SIGP se crea
 * o se activa (`obras/{obraId}` con origen:'sigp' y estado:'activa'), agrega
 * la obra a `users.obras_asignadas` del USUARIO TÉCNICO vinculado al
 * contratista PRINCIPAL del proyecto (mismo individuo — vínculo
 * `contratistas.usuario_tecnico_id`).
 *
 * Corre con el Admin SDK (misma línea que generarConsecutivo): los gestores
 * de proyectos NO tienen escritura sobre `users` en las reglas — la
 * asignación del principal es responsabilidad del sistema, y el aval de los
 * demás trabajadores sigue siendo la UI de SST.
 *
 * Idempotente: arrayUnion + id determinístico de la obra (pry_{proyectoId}).
 * Reintentos del sync (el trigger dispara en cada write de la obra) no
 * duplican. Sin vínculo o sin contratista → se omite sin error.
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

const asignarObraAlPrincipal = onDocumentWritten(
  {
    document: 'obras/{obraId}',
    region: 'us-central1',
  },
  async (event) => {
    const despues = event.data?.after?.exists ? event.data.after.data() : null;
    if (!despues) return;                          // borrado — nada que hacer
    if (despues.origen !== 'sigp') return;         // solo obras-espejo del SIGP
    if (despues.estado !== 'activa') return;       // solo mientras hay campo
    const contratistaId = despues.contratista_id;
    if (!contratistaId) return;                    // proyecto sin asignación

    const db = admin.firestore();
    const contratista = await db.doc(`contratistas/${contratistaId}`).get();
    const tecnicoId = contratista.exists ? contratista.data().usuario_tecnico_id : null;
    if (!tecnicoId) return;                        // sin vínculo → omitir sin error

    const userRef = db.doc(`users/${tecnicoId}`);
    const user = await userRef.get();
    if (!user.exists) return;                      // vínculo roto → omitir sin error

    await userRef.update({
      obras_asignadas: FieldValue.arrayUnion(event.params.obraId),
    });
    console.log(`obra ${event.params.obraId} auto-asignada al técnico ${tecnicoId} (contratista ${contratistaId})`);
  },
);

module.exports = { asignarObraAlPrincipal };
