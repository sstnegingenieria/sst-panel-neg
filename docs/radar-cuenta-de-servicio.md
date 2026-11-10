# Cuenta de servicio del radar — qué se puede y qué no

Pedido del frente SIGP al revisar el PR #239: que la función del radar **no**
corra con la cuenta de cómputo por defecto (que suele traer `roles/editor`),
sino con una cuenta dedicada con **solo `roles/datastore.user`** y nada más.

La petición se puede cumplir. Pero traía una pregunta que había que medir antes
de prometer nada: **¿puede IAM restringir esa cuenta a escribir solo en
`licitaciones` y en `configuracion/radar_secop`?**

## La respuesta, medida: NO. `datastore.user` es todo-o-nada sobre la base de datos

Lo digo con esas palabras porque es una diferencia importante entre lo que se
pidió y lo que se puede entregar.

**`roles/datastore.user` da escritura sobre TODA la base de datos.** No se puede
acotar a colecciones ni a documentos. Una cuenta con ese rol puede crear,
actualizar y borrar cualquier documento de cualquier colección del proyecto:
`users`, `proyectos`, `cotizaciones`, `registros_horario`, todo.

Lo que sí es cierto —y es una reducción grande— es que pasa de **Editor** a
**solo Firestore**: sin Storage, sin Auth, sin IAM, sin administrar Functions,
sin tocar nada más del proyecto.

### Cómo se midió

**1. El contenido exacto de los roles, consultado a la API de IAM**
(`GET https://iam.googleapis.com/v1/roles/...`, lectura de metadatos, sin tocar
datos del proyecto):

| rol | permisos | los de datos |
|---|---|---|
| `roles/editor` | **12.497** | 39 de datastore/firestore, más todo lo demás del proyecto |
| `roles/datastore.user` | **23** | `datastore.entities.{create,update,delete,get,list,allocateIds}` |
| `roles/datastore.viewer` | 30 | solo lectura (`entities.get`, `entities.list`) |

Los 17 permisos restantes de `datastore.user` son metadatos de solo lectura
(`databases.get`, `namespaces.list`, `statistics.get`, consultas de la consola,
`resourcemanager.projects.get`).

**Ninguno de los permisos de entidades lleva calificador de ruta.** La propia
documentación de Firestore describe `datastore.entities.create` como *"Create a
document."*, sin alcance: el alcance es la base de datos.

**2. ¿Y con IAM Conditions?** Tampoco.

- La página de tipos de recurso que aceptan *conditional role bindings* **no
  incluye Firestore ni Datastore**. Dice: *"some Google Cloud services don't
  allow conditional role bindings in their resources' allow policies."*
  ([resource-types-with-conditional-roles](https://docs.cloud.google.com/iam/docs/resource-types-with-conditional-roles))
- La tabla de atributos de condición sí tiene una fila de Firestore, pero es
  `firestore.googleapis.com/Database`, con formato
  `projects/<project>/databases/<database>`: **el recurso más fino que IAM
  conoce en Firestore es la BASE DE DATOS**. No hay atributo de colección, de
  documento ni de ruta.
- La documentación de Firestore sí menciona IAM Conditions, y el ejemplo que da
  es temporal (`request.time < timestamp(...)`), no de ruta.

**3. ¿Por qué no sirven las Security Rules para acotar la CF?** Porque el
cliente de servidor las omite, textual:

> *"The server client libraries bypass all Cloud Firestore Security Rules and
> instead authenticate through Google Application Default Credentials."*
> — [firestore/security/get-started](https://firebase.google.com/docs/firestore/security/get-started)

(La nota dice "server client libraries"; que el Admin SDK sea una de ellas es
una inferencia razonable, no una cita literal. La misma nota remata: *"If
you're using the server client libraries or the REST or RPC APIs, make sure to
set up Identity and Access Management (IAM) for Cloud Firestore."* — o sea, el
control de acceso de un backend es IAM, no las reglas.)

## Lo que sí se va a hacer: cuenta dedicada con `datastore.user`

De **12.497 permisos a 23**, y de "todo el proyecto" a "solo Firestore". No es
granularidad por colección, pero quita Storage, Auth, IAM y la administración de
Functions de las manos de la función.

Los comandos los ejecuta Giovanny (crear cuentas de servicio y asignar roles es
infraestructura, no código). Con `gcloud`:

```bash
# 1. La cuenta dedicada
gcloud iam service-accounts create radar-secop \
  --display-name="Radar SECOP (CF de ingesta de licitaciones)" \
  --project=neg-sst-app

# 2. Su UNICO rol: Firestore, nada mas
gcloud projects add-iam-policy-binding neg-sst-app \
  --member="serviceAccount:radar-secop@neg-sst-app.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

# 3. Que la CF corra con ella (hay que permitir que el deployer la use)
gcloud iam service-accounts add-iam-policy-binding \
  radar-secop@neg-sst-app.iam.gserviceaccount.com \
  --member="user:TU-CORREO" \
  --role="roles/iam.serviceAccountUser" \
  --project=neg-sst-app
```

Y en el código de la función, una línea en las opciones de `onSchedule`:

```ts
serviceAccount: 'radar-secop@neg-sst-app.iam.gserviceaccount.com',
```

**Verificación después** (que no quede en "quedó asignado"):

```bash
# Que la cuenta tenga EXACTAMENTE un rol
gcloud projects get-iam-policy neg-sst-app \
  --flatten="bindings[].members" \
  --filter="bindings.members:radar-secop@neg-sst-app.iam.gserviceaccount.com" \
  --format="table(bindings.role)"

# Que las dos funciones del radar corran con ella
gcloud functions describe ingerirRadarSecopManana --gen2 --region=us-central1 \
  --project=neg-sst-app --format="value(serviceConfig.serviceAccountEmail)"
```

## ⛔ PREREQUISITO: hoy NADIE puede desplegar funciones

Hallazgo del frente SIGP (09-nov-2026) al revisar el script de despliegue, y
bloquea el primer deploy real **de cualquiera de los dos codebases**:

- la **cuenta compartida está vetada por diseño** (el script aborta con ella, y
  el acuerdo del 09-nov dice sesión de persona);
- y la única cuenta nominal con roles —`giovanny.montes@`— tiene, según el
  censo de SIGP, solo **`roles/firebaserules.admin` + `roles/firebase.viewer`**:
  alcanza para desplegar REGLAS, no funciones.

⚠ **Este dato es de SIGP y no lo pude verificar**: la llave de LECTURA no tiene
`resourcemanager.projects.getIamPolicy` (probado: 403), así que no puedo leer la
política IAM del proyecto. Queda como lo que es — un censo ajeno, creíble y sin
confirmar por mí.

Lo que SÍ hice es que el script lo compruebe solo, antes de pedir nada: un
chequeo previo con `testIamPermissions` sobre la sesión activa, que aborta
diciendo **qué permiso falta** en vez de fallar a mitad del deploy, después de
haber tecleado el PR y la palabra `DESPLEGAR`.

### ⛔ Y el acto de IAM YA SE INTENTÓ Y FALLÓ: NUDO DE IDENTIDAD

Dato de Giovanny (09-nov-2026): el comando para darle el rol a la cuenta
nominal **se ejecutó y Google respondió**:

> `User giovanny.montes@negingenieria.com does not exist`

**El dominio `negingenieria.com` no está en Google Workspace ni en Cloud
Identity.** Esos correos son buzones, no identidades de Google: **no se les
puede conceder ningún rol de IAM.** No es un permiso que falta, es una
identidad que no existe.

Consecuencia, y afecta a los tres frentes: **hoy la única identidad con
permisos de desplegar es la cuenta compartida**, que el script veta por
acuerdo. Por ese camino nadie despliega funciones — ni el radar ni el codebase
`default`.

**Las salidas, en orden de preferencia:**

1. **Cloud Identity (o Workspace) para `negingenieria.com`** — la correcta.
   Convierte los correos del equipo en identidades de Google y todo lo demás de
   este documento funciona como está escrito. Es una decisión de
   infraestructura de la empresa, no del repo.
2. **Una cuenta de Google personal nominal como puente** (por ejemplo el gmail
   de la persona, con su nombre): conserva lo que importa —la bitácora puede
   responder *quién* desplegó— y los comandos de abajo funcionan cambiando el
   `--member`. Es un puente, no una solución: la identidad no es corporativa.
3. **La cuenta compartida, con la excepción FIRMADA Y CON VENCIMIENTO.** El
   veto no se quita: se firma y caduca.
   `-ConCuentaCompartida -AutorizadoPor "<nombre>" -Motivo "<razón>"`, y las dos
   cosas quedan en la fila de la bitácora
   (`cuenta compartida; ejecutó X; motivo: Y; escotilla vence AAAA-MM-DD`).
   Es el patrón de la casa para cuando la regla no se puede cumplir pero el
   trabajo no puede esperar: el override del semáforo, la salvedad del aprobador
   de respaldo, el `autorizado_manual` de la guarda de volumen.

   **Y lleva FECHA DURA EN CÓDIGO** (`$EscotillaVence`, hoy `2026-11-23`): al
   pasarse, `-ConCuentaCompartida` **aborta**. No hay bandera que la extienda —
   renovarla es cambiar la fecha **en un PR**, que alguien tiene que mirar.
   Criterio de Giovanny, y la razón es conocida de la casa: *lo temporal sin
   vencimiento se queda.* Un comentario que diga «quitar esto cuando llegue
   Cloud Identity» es una promesa, no un control.
   La fecha se compara en día **local**, no UTC, porque es un plazo humano.

### El acto de IAM que falta (lo ejecuta alguien con propiedad del proyecto)

⚠ Con el nudo abierto, el `--member="user:giovanny.montes@..."` de abajo
**falla**. Sustitúyelo por la identidad que exista de verdad (salida 1 o 2).


```bash
# 1. Permiso de desplegar funciones, para quien vaya a desplegar
gcloud projects add-iam-policy-binding neg-sst-app   --member="user:giovanny.montes@negingenieria.com"   --role="roles/cloudfunctions.developer"

# 2. Permiso de "actuar como" la cuenta de servicio de runtime de cada codebase.
#    Para el radar, la cuenta dedicada:
gcloud iam service-accounts add-iam-policy-binding   radar-secop@neg-sst-app.iam.gserviceaccount.com   --member="user:giovanny.montes@negingenieria.com"   --role="roles/iam.serviceAccountUser" --project=neg-sst-app

#    Para el codebase `default`, la cuenta de computo por defecto:
gcloud iam service-accounts add-iam-policy-binding   <NUMERO-DE-PROYECTO>-compute@developer.gserviceaccount.com   --member="user:giovanny.montes@negingenieria.com"   --role="roles/iam.serviceAccountUser" --project=neg-sst-app
```

**Verificación**: correr el script en simulacro. Si el chequeo previo pasa, los
permisos comprobables están; si falta alguno, el mensaje lo nombra.

```powershell
npx firebase login
.\scripts\deploy-funciones.ps1 -Codebase radar -Simulacro
npx firebase logout
```

## La alternativa que SÍ daría granularidad — EVALUADA Y DESCARTADA

> **Decisión (09-nov-2026): descartada.** La razón, escrita para quien la
> retome: **la lista de campos refrescables quedaría duplicada en dos lados**
> —`CAMPOS_REFRESCABLES` en TypeScript y el `hasOnly(...)` de las reglas— y eso
> es el defecto de **dos nacimientos del mismo criterio**, el mismo que el
> bloque A.2b vino a eliminar (`nuevoRequisito()` como único nacimiento) y el
> mismo que motivó el bundle en vez del port a CJS. Un test que parsee
> `firestore.rules` lo mitiga, pero mitigar no es evitar: siguen siendo dos
> lugares donde alguien puede agregar un campo y olvidar el otro.
>
> Lo que sigue queda como el registro de la evaluación, no como un pendiente.
> Si alguien la retoma, que vea el costo Y la razón del descarte.

El riesgo residual que deja el descarte está cubierto por otra guarda, barata y
sin duplicación: **un test que afirma que la función solo construye referencias
bajo `licitaciones/` y `configuracion/radar_secop`** (ver la sección final).

Si lo que se quiere es de verdad "solo `licitaciones` y
`configuracion/radar_secop`", el único mecanismo que lo da son las **Security
Rules**, y para eso el radar tiene que **escribir como una identidad de Auth en
vez de con Admin SDK**.

Cómo funcionaría:

1. La función **no lleva ningún rol de Firestore**. Su cuenta de servicio solo
   necesita poder **firmar** un token: `roles/iam.serviceAccountTokenCreator`
   sobre sí misma. Ese permiso no da acceso a datos.
2. `admin.auth().createCustomToken('radar_secop', { radar: true })` →
   intercambio en `identitytoolkit.googleapis.com/.../accounts:signInWithCustomToken`
   → **ID token**.
3. Las escrituras salen por la **API REST de Firestore** con ese ID token
   (`batchGet` para leer, `commit`/`batchWrite` para escribir), así que
   **pasan por las reglas**.
4. Reglas nuevas que autoricen a esa identidad y solo a ella:
   `request.auth.token.radar == true`, sobre `licitaciones` (create/update con
   guardas por campo) y `configuracion/radar_secop`.

### Qué costaría, en concreto

| pieza | costo |
|---|---|
| **Rol nuevo en `users.rol`** | **ninguno.** Se usa un *custom claim* en el token (`radar: true`), no un rol del panel: no se toca `users`, ni `roles.ts`, ni `permisos.ts`, ni el vocabulario de roles que ven los tres frentes. |
| **Identidad de Auth** | 1 usuario (`uid: radar_secop`), creado implícitamente al canjear el primer custom token. |
| **Reglas nuevas** | 2 bloques: `licitaciones` (create + update con `hasOnly` de los 10 campos refrescables) y `configuracion/radar_secop`. **Requiere un deploy de reglas** (el de siempre, por `deploy-reglas.ps1`, con OK de Giovanny) y su batería de tests con tokens reales. |
| **Código** | ~150–200 líneas: canje de custom token → ID token (con caché, el ID token dura 1 h), `batchGet` y `commit` por REST en vez de `db.getAll` y `db.batch()`. Más sus tests. |
| **Configuración** | la Web API key del proyecto en la config del codebase (ya es pública: va en el bundle del panel). |
| **Duplicación nueva** | la lista de campos refrescables quedaría en DOS lados: `CAMPOS_REFRESCABLES` en TypeScript y el `hasOnly` de las reglas. Mitigable con el test que parsea `firestore.rules`, que es el patrón que ya usamos en A.2a/A.2b. |
| **Costo de operación** | cada escritura evalúa reglas (sin cargo en dinero, sí en latencia); `batchWrite` por REST tiene el mismo tope de 500. |

### Lo que gana y lo que pierde

**Gana** lo que SIGP pidió: la función no puede escribir fuera de
`licitaciones` y `configuracion/radar_secop` ni aunque tuviera un bug — el
límite lo pone el servidor, no el código. Y la función deja de tener **cualquier**
permiso de datos.

**Pierde**: un segundo camino de escritura que mantener (REST + reglas) frente
al Admin SDK que usan las otras 16 funciones del proyecto, un bloque de reglas
más que desplegar, y la lista de campos duplicada.

### Por qué se descartó, en una línea

Porque el precio es duplicar la lista de campos entre TypeScript y las reglas,
y ese es exactamente el defecto que este proyecto viene cerrando. La reducción
de superficie que sí se adopta (Editor → `datastore.user`) cuesta tres comandos
y una línea de código; la granularidad real cuesta un camino de escritura nuevo,
dos bloques de reglas y una duplicación permanente.

## El riesgo residual, y la guarda que lo cubre

Con `datastore.user` la función **puede** escribir en cualquier parte de
Firestore. Lo que lo impide es nuestro código — y un límite que vive solo en el
código tiene que tener un test, o es una intención.

La guarda: **`src/utils/sigp/radarRutas.ts` es el único lugar que construye
rutas de escritura del radar**, con una lista blanca de dos entradas
(`licitaciones/{docId}` y `configuracion/radar_secop`), un validador que LANZA
ante cualquier otra ruta, y un test que:

1. prueba la matriz de rutas permitidas y negadas (incluido
   `configuracion/vocabulario_neg`, que el radar **lee** pero no escribe);
2. afirma que la lista blanca tiene exactamente esas dos entradas — ampliarla
   es un diff visible, no un descuido;
3. **lee el código fuente de la Cloud Function** y verifica que no construye
   referencias por fuera de los dos helpers, y que cada escritura pasa por el
   validador.

Si alguien agrega una escritura fuera de esas dos rutas, **cae la suite**. Es el
mismo patrón de los guardarraíles textuales del módulo (el test que parsea
`firestore.rules`, el que compara los dos constructores de la semilla),
aplicado a las rutas de escritura.

---

*Medido el 09-nov-2026 contra la API de IAM y la documentación oficial de Google
Cloud y Firebase. Las citas llevan su URL.*
