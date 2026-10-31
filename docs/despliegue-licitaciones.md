# Despliegue del módulo Licitaciones — checklist

**Estado: NO EJECUTADO.** Este documento es la secuencia acordada, escrita
para ejecutarse en otra sesión y con OK explícito. Nada de lo que sigue se ha
corrido contra producción.

**El flag `sigp_licitaciones_enabled` arranca APAGADO en producción**, y sigue
apagado hasta el último paso. Todos los pasos anteriores son inertes para el
usuario: se despliega la infraestructura, se siembra el criterio, se importa
el histórico, y nadie ve nada.

---

## Cómo se usa este documento

**Este documento dice QUÉ verificar. Nunca dice que algo YA se verificó.**

No lleva ni un resultado precalculado: ningún conteo de líneas de diff, ningún
id de ruleset, ningún hash de bundle, ninguna línea base. Todos esos números
se **miden en el momento de ejecutar** y se anotan en el reporte de la sesión
que ejecuta, no acá.

La razón es un incidente real (26-oct-2026). Una verificación byte-idéntica se
corrió tres días antes del despliegue; en el intervalo otro frente mergeó y
desplegó su propio bloque de reglas, y el deploy — hecho con un archivo que no
lo contenía — **borró de producción un control de seguridad vivo**. La
verificación había sido correcta y era verdadera cuando se corrió. El problema
no fue la verificación: fue la **distancia entre la verificación y el acto**.

Un número escrito acá es una verificación congelada: parece un chequeo y es un
recuerdo. La primera versión de este documento traía los diffs esperados
anotados; si el código hubiera cambiado, quien ejecutara habría comparado
contra una expectativa vieja y el «coincide» habría sido falso.

### Enmienda al protocolo — obligatoria

1. **La pre-verificación byte-idéntica se corre EN EL MISMO ACTO que el
   comando de despliegue.** Si entre una y otro hay una espera —una
   autorización, un aviso pendiente, un café—, **se repite**. Sin excepción.
2. **Antes de cada pre-verificación, `git fetch` en fresco** y comparar
   contra `origin/main`, no contra la base local ni contra un `HEAD`
   que pueda haber quedado atrás.
3. **Si `origin/main` se movió desde el último rebase, se rebasa y se
   vuelven a correr las baterías antes de desplegar.** Un archivo de reglas que
   no contiene lo que ya está vivo no es un despliegue incompleto: es un
   borrado.

---

## Por qué este orden

El orden no es arbitrario. Cada paso deja lista una precondición del
siguiente:

1. **Las reglas primero** porque son ADITIVAS (colecciones que hoy no existen
   en producción) y porque sin ellas cualquier escritura posterior — la
   siembra, la importación — sería rechazada.
2. **La Cloud Function después** porque el consecutivo `LIC` tiene que existir
   antes de que alguien pueda mover una licitación a *en preparación*. La
   importación no lo necesita (los históricos entran marcados como migrados y
   no queman número), pero el primer proceso nuevo sí.
3. **Las dos siembras antes de la importación** porque el importador estampa
   `semaforo_version` en cada registro: si el registro del criterio no existe,
   queda el histórico entero apuntando a una versión que no se puede leer, y la
   pantalla del *rojo informado* no tendría qué mostrar.
4. **La verificación antes del flag** porque es la última oportunidad de
   detectar que lo desplegado no es lo revisado.
5. **El flag al final, y solo después de la sesión con Karen y Pedro**, porque
   un módulo que aparece sin que nadie lo haya explicado se usa mal una vez y
   no se vuelve a abrir.

---

## Paso 1 — Reglas de Firestore y Storage

**Precondición — se corre PEGADA al comando de despliegue, no antes.** Si
después de esta verificación hay cualquier espera, **se repite completa**.

Para LEER las reglas vivas se usa un endpoint de LECTURA. Nunca un
`deploy --dry-run`: un comando de despliegue con bandera no es una forma
de leer.

```bash
npx firebase firestore:rules:get --project neg-sst-app
```

(o la Rules API: `GET /v1/projects/{p}/releases` para saber qué ruleset
sirve cada release, y `GET /v1/projects/{p}/rulesets/{id}` para su
contenido.)

Comparar **normalizando saltos de línea**: el working tree de Windows produce
CRLF y el ruleset de producción LF, así que comparar en crudo da falsos
negativos. Ver el gotcha del PR #37.

- [ ] `git fetch` en fresco, **en este mismo acto**
- [ ] `origin/main` no se movió desde el último rebase de la rama. Si se
      movió: rebasar, resolver, **volver a correr las baterías** y empezar
      este paso de nuevo
- [ ] `firestore.rules` de producción == `origin/main`,
      byte-idéntico (CRLF/LF normalizado)
- [ ] `storage.rules` de producción == `origin/main`, byte-idéntico
      (ídem)
- [ ] El diff a desplegar revisado **línea a línea**: contiene exactamente los
      bloques de licitaciones y **ninguna línea** de helpers o colecciones
      ajenas. Los conteos se leen del `git diff` del momento y se anotan
      en el reporte — no hay número esperado escrito acá
- [ ] **Toda supresión justificada una por una.** El caso normal de este
      módulo es cero; si hay alguna, cada línea borrada tiene que ser una
      decisión tomada y anunciada, no un hallazgo del diff
- [ ] El archivo que se va a desplegar **contiene todo lo que ya está vivo**:
      los bloques de los otros frentes presentes y completos

> Este chequeo no es ceremonia, y los dos incidentes lo prueban desde los dos
> lados. En el C3 (PR #65) una sesión paralela sobrescribió
> `firestore.rules` en el working tree y el PR mergeado perdió sus
> bloques: lo atrapó esta verificación. El 26-oct-2026 un despliegue nuestro
> borró de producción el gate de otro frente: **no lo atrapó, porque la
> verificación era de tres días antes**. El mismo chequeo, corrido tarde, no
> protege nada.

**Despliegue:**

```bash
npx firebase deploy --only firestore:rules,storage --project neg-sst-app
```

- [ ] Post-verificación: volver a leer ambos rulesets por el endpoint de
      lectura → **byte-idénticos** al archivo desplegado
- [ ] Diff producción-antes → producción-después = solo los bloques de
      licitaciones, con los conteos leídos en el momento
- [ ] **Los bloques de los otros frentes siguen presentes y completos** en el
      ruleset vivo. Presente no es lo mismo que funcionando: para un control
      de otro frente, correr **su** batería contra el archivo que quedó
      desplegado
- [ ] Denegación anónima comprobada: lectura de `licitaciones` y de la
      subcolección de economía → 403

**Rollback:** `git checkout <sha-anterior> -- firestore.rules storage.rules` y
re-desplegar. Las reglas gobiernan acceso, no contenido: no hay pérdida de
datos posible.

---

## Paso 2 — Cloud Function de consecutivos

⚠ **`generarConsecutivo` es COMPARTIDA.** De ella dependen COT, OC, VIS, SOL,
PRY, ACT, LIQ, FAC, NC, CAT y PEA. Un despliegue torpe aquí rompe el flujo
comercial en producción.

- [ ] `git diff` de `functions/consecutivos.js` leído **en el
      momento**. Lo que sigue es **lo que se aprobó en revisión**, no una
      medición: si el diff del momento no coincide con esta lista, **parar** —
      o el código cambió desde la revisión, o se está desplegando otra cosa:
      - `'LIC'` agregado a `PREFIJOS_VALIDOS`
      - el mapa nuevo `PADDING_MINIMO_ANUAL = { LIC: 4 }`
      - **una sola línea de comportamiento**: la del `padding`
      - `PREFIJOS_VALIDOS` y `PADDING_MINIMO_ANUAL` sumados a `module.exports`
        (los consumen los tests; `index.js` solo desestructura
        `generarConsecutivo`)
      - dos comentarios

      Si aparece cualquier otra línea ejecutable, **parar**.
- [ ] Confirmar que la línea del padding es equivalente para todos los demás
      prefijos: `PADDING_MINIMO_ANUAL[prefijo] || 3` da exactamente `3` cuando
      el prefijo no está en el mapa, que es la expresión anterior.
- [ ] Rollback preparado: sha del despliegue actual anotado antes de correr.

```bash
npx firebase deploy --only functions:generarConsecutivo --project neg-sst-app
```

- [ ] `npx firebase functions:list --project neg-sst-app` → las funciones
      existentes siguen vivas y `generarConsecutivo` re-desplegada
- [ ] **Cero consecutivos quemados**: el contador `LIC_2026` **no debe
      existir** después del despliegue. El primer `LIC-2026-0001` lo toma el
      primer proceso real que alguien mueva a *en preparación*. (Mismo chequeo
      que se hizo con `PEA` en el PR #96.)

---

## Paso 3 — Siembra del registro del criterio

Escribe el documento con la versión v1.0 del semáforo: definición, motivo,
calibración y limitaciones. El texto **no vive en el script**: sale de la
fuente única versionada, con test que la compara carácter a carácter.

```bash
# 1) dry-run (default) — solo lee e imprime el plan
node functions/scripts/sembrar-semaforo-versiones.js

# 2) escritura real
node functions/scripts/sembrar-semaforo-versiones.js --apply
```

Requiere `GOOGLE_APPLICATION_CREDENTIALS` y `AUTOR_UID` (el uid de quien en la
dirección adopta el criterio — queda registrado como autor).

- [ ] Dry-run leído **completo** antes del `--apply`
- [ ] El script **aborta solo** si el documento ya existe. Es deliberado:
      reescribirlo borraría el historial de versiones, que es justo lo que ese
      documento existe para conservar. Si aborta, **no forzar** — hay que
      revisar por qué ya existe.
- [ ] Post-verificación: el texto de `limitaciones` en producción coincide con
      el de la fuente versionada (es el que la pantalla del rojo informado lee
      **en vivo**; si se escribe mal, el usuario lee mal)

---

## Paso 4 — Siembra de la configuración del módulo

Documento de **dos campos**, escrito a mano desde la consola de Firebase — no
tiene script propio y no lo necesita:

| Campo | Tipo | Valor inicial |
|---|---|---|
| `capacidad_semanal` | number | a definir con el área (el default en código es 5) |
| `horas_utiles_dia` | number | `4` |

- [ ] Documento creado con **los dos campos**, ambos numéricos
- [ ] Verificado que son `number` y no strings — un string cae al default en
      silencio y nadie se entera de que la configuración no está haciendo nada

> Si el documento no existe, el módulo funciona igual con los defaults. Se
> siembra para que el área pueda ajustarlo **sin desplegar**, que es el punto
> entero de tenerlo aquí. `horas_utiles_dia` es un supuesto no medido: se
> espera ajustarlo con el uso real (ver la guía de onboarding, §4).

---

## Paso 5 — Importación del histórico

Los registros históricos de 2022 a 2026, desde los tres archivos del área
comercial. **El conteo autoritativo es el que imprime el dry-run del momento**,
no una cifra escrita acá: los archivos fuente viven fuera del repo y pueden
haber cambiado.

⚠ Los archivos fuente están **fuera del repo** (contienen precios y datos
comerciales) y su carpeta está en `.gitignore`. Hay que copiarlos antes de
correr.

```bash
# 1) dry-run — imprime reporte completo + evaluación retroactiva por año
npx vite-node functions/scripts/importar-licitaciones.js

# 2) escritura real
npx vite-node functions/scripts/importar-licitaciones.js --commit
```

Requiere `GOOGLE_APPLICATION_CREDENTIALS` y `IMPORTA_UID`.

- [ ] Dry-run corrido y **leído entero** — no solo el veredicto final
- [ ] El **guard de calidad** pasa sin señales. Si tiene señales, el script
      aborta: eso significa que los archivos cambiaron respecto de lo
      validado, y hay que mirarlos antes de tocar producción.
- [ ] La **evaluación retroactiva** confirma el veredicto: cero adjudicaciones
      reales descartadas en cualquier año. Si un año descarta una
      adjudicación, el script aborta — es el criterio de cancelación acordado,
      y no se fuerza.
- [ ] Post-verificación: conteo de documentos por año contra el reporte del
      dry-run
- [ ] Post-verificación: **todos** los importados con `migrado: true`. Sin esa
      marca, cualquier edición futura de un histórico sería rechazada por la
      regla del consecutivo — para siempre.

> La importación es **idempotente**: el id de cada documento es el hash
> normalizado de su número de proceso, así que re-correr actualiza en vez de
> duplicar. Si algo sale a medias, se vuelve a correr.

**Rollback:** los históricos entran en una colección que nadie más usa y con
el flag apagado no son visibles. Si hay que deshacer, se borran por id — pero
mejor revisar el dry-run dos veces que borrar después.

---

## Paso 6 — Verificación de que lo desplegado es lo revisado

Antes de que nadie vea el módulo:

- [ ] `git fetch` en fresco y `firestore.rules` de producción
      **byte-idéntico** a `origin/main` (CRLF/LF normalizado)
- [ ] `storage.rules` de producción **byte-idéntico** a
      `origin/main` (ídem)
- [ ] Los bloques de los otros frentes presentes y completos en el ruleset
      vivo
- [ ] `functions:list` → las funciones existentes intactas, `generarConsecutivo`
      con el prefijo `LIC` vivo
- [ ] Bundle de Vercel servido distinto de la línea base. La línea base se
      **captura antes del merge, en el mismo acto** — el despliegue de Vercel
      puede completar en ~1 min y un «baseline» tomado después ya es el bundle
      nuevo (lección del PR #89). El hash no se escribe acá: se anota en el
      reporte de la sesión que ejecuta
- [ ] Los dos documentos de configuración leíbles con un token de un rol que
      gestiona licitaciones

---

## Paso 7 — Activación del flag

**Solo después de la sesión con Karen y Pedro.** No antes, aunque todo lo
demás esté listo y verificado.

La sesión cubre la guía `docs/onboarding-licitaciones.md`, y en particular las
dos cosas que no son obvias:

- que **el rojo se discute** — y por qué el bloque de limitaciones dice que el
  criterio habría bloqueado tres adjudicaciones de 2023;
- que **los tres datos de la presentación son obligatorios** y para qué se van
  a usar.

Un módulo que aparece sin explicación se usa mal una vez y no se vuelve a
abrir. Es exactamente lo que le pasó a Compras.

**Activación** (Remote Config, patrón del PR #84 — cuidado con la
concurrencia):

- [ ] GET de la plantilla actual y verificación de que es la esperada (los
      parámetros existentes con sus valores)
- [ ] Parámetro `sigp_licitaciones_enabled` agregado **sobre esa plantilla**,
      jamás sobre una armada desde cero
- [ ] PUT con `If-Match` del ETag leído
- [ ] Post-verificación releyendo: versión incrementada, el parámetro nuevo
      con su valor, **los preexistentes intactos**

**Propagación:** cada usuario lo ve en ≤1 h más su próxima recarga (el fetch
de Remote Config está en 1 h desde el PR #86).

**Reversión:** republicar el parámetro en `false`. Tarda lo mismo que la
activación — hasta una hora. Sin despliegue y sin pérdida de datos.

---

## Nota sobre el flag apagado

El flag esconde el ítem del sidebar; **no es la protección**. La ruta
`/licitaciones` responde por URL directa aunque el flag esté apagado — es la
convención de la casa y está documentada. **Lo que protege de verdad son las
reglas de Firestore y Storage del paso 1**, que ya distinguen quién gestiona
licitaciones y quién ve su economía.

Consecuencia práctica: con el flag apagado, quien tenga el rol puede validar
el módulo entrando por URL. Es el mecanismo previsto para que la dirección
revise antes del estreno, igual que se hizo con Actividades.
