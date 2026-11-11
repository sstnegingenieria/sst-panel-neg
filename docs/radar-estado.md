# Radar SECOP — dónde quedamos

Estado operativo del radar de licitaciones: qué está implementado, qué falta, y
en qué orden. Se escribe acá y no en un mensaje porque **lo que no está en el
repositorio, no existe**.

**Última actualización:** 11-nov-2026 (tras cerrar B.3).

---

## 1. En una línea

El radar **está desplegado y verificado en producción, y todavía no escribe**.
No le falta un arreglo: le faltan actos. Los dos cambios que necesita ya están
en `main` esperando un deploy, y B.3 —la pieza del panel que tiene que estar
**antes** de que el radar escriba, o hace daño— espera el visto de su PR.

---

## 2. Las puertas, todas

Siete cerradas y verificadas contra producción; siete abiertas, de las cuales
dos ya están en `main` esperando deploy y una espera el visto de su PR.

### Cerradas ✅

| # | qué | cómo se verificó |
|---|---|---|
| 1 | El disparo | dos jobs `ENABLED`: `firebase-schedule-lic-ingerirRadarSecop{Manana,Tarde}-us-central1`, `30 6 * * 1-5` y `0 14 * * 1-5`, `America/Bogota` |
| 2 | La invocación | `run.invoker` con `radar-secop@` sobre los dos servicios de Cloud Run. **Lo escribió el CLI solo**, acotado al servicio, derivándolo de la cuenta que declara el código |
| 3 | La escritura en Firestore | `radar-secop@` con **una sola fila** a nivel de proyecto: `roles/datastore.user` |
| 4 | El app token | `SECOP_APP_TOKEN` presente en las funciones desplegadas |
| 5 | La consulta y la paginación | cosecha completa contra la API real: 1.911 de 1.911 filas, `faltan: 0` |
| 6 | La lectura desde el panel | `useLicitaciones` hace `getDocs` de la colección entera, sin query ni índice; **4 usuarios activos** tienen un rol de `gestionaLicitaciones()` |
| 7 | El léxico | `configuracion/vocabulario_neg` **no existe**, y es correcto: `terminosVigentes(null)` cae al empaquetado en el código (v1.0, 48 términos) y lo reporta como `(empaquetada)` |

### Abiertas ⬜

| # | qué | estado |
|---|---|---|
| 8 | **Separar las dos poblaciones** (`incluir_sin_fecha: false`) | en `main`, **`40a98e2`** (PR #252) — *necesita deploy* |
| 9 | **La guarda de ventana aguas arriba** | en `main`, **`a0b24a1`** (PR #251) — *necesita deploy* |
| 10 | **B.3 en producción** (Vercel) | los cuatro sub-bloques hechos, **PR #254** |
| 11 | **Deploy del codebase `radar`** con #251 + #252 | pendiente — acto de Giovanny |
| 12 | **Acto de la marca** — `{ marca, solape_dias: 14 }` | preparado con dry-run; **no se corre hasta que 10 y 11 estén** |
| 13 | **Acto de restitución** — `solape_dias: 45` | después de la primera cosecha |
| 14 | **Barrido del backlog** de las filas sin fecha | diseño pendiente; ver §6 |

---

## 3. El orden, y por qué ese orden

```
  B.3  (#254: visto → merge → Vercel despliega solo)
     ↓
  GIOVANNY, EN UNA SOLA SESIÓN:
      deploy del codebase radar  (#251 + #252)
         ↓
      acto de la marca  { marca: hoy, solape_dias: 14 }
     ↓
  (primera cosecha: 111 documentos)
     ↓
  acto de restitución  { solape_dias: 45 }
```

**Los dos actos de Giovanny van en una sentada, y la razón no es técnica.**
Lleva cuatro actos de IAM, un despliegue, dos sesiones y la llave del token en
un solo día; el deploy y la marca juntos le ahorran volver mañana. El orden
interno no cambia: primero desplegar, después marcar.

**Por qué B.3 va primero.** Sin él, `seccionDe` manda cualquier `detectada` a
`activas`. Si el radar escribe antes de que B.3 esté en Vercel,
los 111 documentos **entran a competir por el cupo semanal de 5** y desplazan
licitaciones reales de Karen. **Escribir antes de B.3 es peor que no escribir.**

**La red de seguridad**, que se mantiene escrita porque es la que permite mover
el orden sin miedo: aunque el deploy del radar saliera antes que B.3, no pasa
nada mientras no se corra el acto de la marca — **sin marca, la guarda de
ventana detiene la corrida sin consultar la API**. El radar no puede hacer daño
por su cuenta.

---

## 4. Las mediciones que sostienen las decisiones

Todas contra la API real del SECOP, filtro del modo `radar`, 11-nov-2026.

### El tamaño de la ventana

| ventana | filas |
|---|---|
| **sin inicio** (`desde: null`) | **319.531** |
| 45 días | 7.245 |
| 120 días (tope de la guarda) | 15.833 |
| 365 días | 47.104 |

De ahí sale la guarda de ventana aguas arriba (#251): 319.531 filas en páginas
de 50.000 contra una función de 512 MiB mueren por memoria **antes** de llegar a
una guarda que vivía aguas abajo.

### El pozo de las filas sin fecha

`whereIngesta` tiene `incluir_sin_fecha = true` por defecto, así que las filas
sin ninguna fecha entran por `IS NULL` **en toda ventana**. Son un conjunto
**fijo**:

| solape | filas totales | sin ninguna fecha | % sobre persistidos | `puede_escribir` |
|---|---|---|---|---|
| 4 | 1.911 | **1.818** | 96,2 % | false |
| 14 | 3.323 | **1.818** | 53,0 % | false |
| 21 | 4.256 | **1.818** | 42,1 % | false |
| 45 | 7.245 | **1.818** | 24,6 % | false |

`MAX_PCT_SIN_FECHA` es 10 %. Un conjunto constante contra uno variable **no
puede** bajar de ahí: harían falta ≥1.250 persistibles, seis veces el tope de
200. El guard medía algo que no podía variar.

### Con las dos poblaciones separadas (#252)

| solape | filas | documentos | `puede_escribir` | tope 200 |
|---|---|---|---|---|
| 4 | 93 | 5 | true | pasa |
| **14** ← aprobado | 1.505 | **111** | true | pasa, 45 % de margen |
| 21 | 2.438 | 172 | true | pasa, 14 % |
| 45 | 5.427 | 384 | true | se pasa |

**Solape 14 para la primera cosecha**: 111 documentos ejercitan el circuito de
verdad (5 no prueban nada) y el margen protege contra que los datos se muevan
entre la medición y la corrida.

**Y `solape_dias` vuelve a 45 después**, porque no es solo la primera ventana:
es el solape permanente, y su valor de diseño es 45 porque el dataset completa
los registros semanas después de publicarlos. Dejar 14 fijo debilitaría eso en
silencio.

---

## 5. Los topes, y cuál aplica

| constante | valor | cuándo aplica |
|---|---|---|
| `MAX_CREADOS_POR_CORRIDA` | 200 | **siempre que haya marca** — o sea, la primera cosecha real |
| `MAX_CREADOS_PRIMERA_CORRIDA` | 50 | **nunca**: ver la nota de la sexta ocurrencia en `HALLAZGOS_AUDITORIA.md` |
| `MAX_DIAS_VENTANA` | 120 | la marca no puede ser anterior a hoy − 75 días |

`primera_corrida` es `true` solo sin marca, y sin marca `desde` es `null`, y con
`desde: null` la guarda de ventana detiene antes del tope. La única salida es
`autorizado_manual`, que retorna sin mirar el tope. **El 50 es letra muerta.**

---

## 6. El backlog de las filas sin fecha — decisión pendiente

Con #252, las filas sin ninguna fecha dejan de entrar por la corrida automática.
No se pierden: entran por un **barrido autorizado** aparte, con el mismo
tratamiento que los demás actos de datos — dry-run, autorización explícita,
pre y post-verificación.

Se reconocen en el documento por **`radar.origen_fecha === 'ninguna'`** (#252
subió ese campo de `MetaIngesta` al bloque `radar`, para que la marca viaje con
la procedencia y los chips de señal de B.3 la muestren).

**Lo que falta decidir cuando llegue su turno**: hoy `autorizado_manual` saltea
el tope por completo, así que "autorizado" significa "sin tope". La propuesta es
que respete uno — y ahí el 50 deja de ser letra muerta y el backlog entra en
pasadas acotadas en vez de un volcado.

---

## 7. Lo que vive en otros documentos

- **El acto de IAM completo** (los seis roles, con el porqué medido de cada uno)
  y la cuenta de servicio dedicada → `docs/radar-cuenta-de-servicio.md`.
- **Los defectos encontrados y sus lecciones** → `HALLAZGOS_AUDITORIA.md`:
  H-010 (escritores no tipados contra el documento) y las tres notas de técnica
  — leer un campo agregado después, `ConvertFrom-Json` + StrictMode, y «existe»
  no significa «se ejecuta».
- **El límite de la guarda del deploy** (qué cubre y qué no, y por qué el CLI
  declara seis permisos y usa cuatro familias más) → `scripts/deploy-funciones.ps1`.
- **La prueba de los chequeos de IAM** sin desplegar → `scripts/pruebas/prueba-chequeos-iam.ps1`.
