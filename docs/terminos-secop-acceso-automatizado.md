# ¿Permite SECOP II el acceso automatizado? Lo que dicen los términos

*Lectura del 14-nov-2026, **corregida la misma tarde**. **No** es asesoría
jurídica: es la transcripción de lo que los documentos dicen, con la cita
literal de cada cosa, para que la decisión se tome sobre el texto y no sobre un
resumen.*

> ### ⚠ ESTE DOCUMENTO SE CORRIGIÓ. Lee esta caja antes del resto.
>
> **Lo que cambió de mi parte:** mi lectura del capítulo XIV era débil y
> Giovanny la corrigió con razón. Leí *«consultas masivas de interacción no
> humana»* poniendo el peso en **«no humana»**, y el calificativo es
> **«masivas»**. Dos consultas al día no afectan el rendimiento ni la
> disponibilidad del servicio, que es lo que ese capítulo protege. Mi argumento
> de que el bloqueo perimetral podía alcanzar la cuenta de Proveedor se apoyaba
> en esa mala lectura y **se cae con ella**. Queda retirado.
>
> **Lo que apareció después, y es lo que decide:** el área pública del portal
> transaccional está protegida por una **validación reCAPTCHA de Google** a la
> entrada. Verificado el 14-nov con 4 peticiones. Eso no es un control de
> volumen —dispara en la petición número uno— sino la declaración, hecha
> cumplir por máquina, de que esa superficie está prevista para consulta
> humana. El capítulo XIV dejó de ser el obstáculo; la valla lo es. Detalle
> completo en la sección 0.
>
> **Consecuencia:** el raspador no se diseña. No porque sea masivo —no lo
> sería— sino porque no hay forma de leer esa superficie sin pasar una
> verificación anti-bot, y eso no lo voy a construir. Los dos resguardos que
> pediste (tope de volumen como invariante e interruptor sin despliegue) quedan
> **especificados en la sección 7**, porque valen para cualquier fuente más
> oportuna que se agregue — incluida la que Colombia Compra pueda autorizar.
>
> **Lo que sigue en pie:** la consulta a la Mesa de Servicio, que ahora vale
> más y pregunta mejor → [`consulta-colombia-compra-acceso.md`](consulta-colombia-compra-acceso.md).

---

## LA RESPUESTA, EN UNA LÍNEA

Sobre los **términos**: no lo prohíben con esas palabras, no lo autorizan, y no
guardan silencio — hay un párrafo que califica el acceso automatizado **masivo**
como conducta que *«atenta contra el principio de Seguridad de la
Información»*. **Con el volumen que necesitábamos —dos consultas al día— ese
párrafo no nos alcanza**, y por eso dejó de ser el punto.

Sobre el **portal**: hay un **reCAPTCHA en la entrada del área pública**, y eso
sí nos alcanza en la primera petición.

Y hay una cláusula aparte —la de derechos de autor, capítulo XI— que, **leída
literalmente, prohíbe el uso comercial de la información de la plataforma** sin
autorización escrita. Esa no depende del volumen ni de la valla, y sigue en pie.

---

## 0 · EL HALLAZGO QUE DECIDE: hay un reCAPTCHA en la entrada

Esto no está en los términos. Está en la plataforma, y lo verifiqué el
14-nov-2026 con **cuatro peticiones en total** (dos a la búsqueda pública con
distintos parámetros, una al detalle de un proceso, una de control).

**Las tres rutas públicas del portal redirigen a un muro de reCAPTCHA:**

```
GET https://community.secop.gov.co/Public/Tendering/ContractNoticeManagement/Index
  → 302 → /Public/Common/GoogleReCaptcha/Index?previousUrl=…

GET https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=…
  → 302 → /Public/Common/GoogleReCaptcha/Index?previousUrl=…
```

La página de destino es un reCAPTCHA v2 de Google, sin ambigüedad: trae
`<script src="…/recaptcha/api.js">`, un `div` con clase `g-recaptcha` y
`data-sitekey="6LcMmakZAAAAAB157Q90…"`, y el mensaje —en portugués, porque el
motor del portal es Vortal— *«Por favor complete a validação para aceder à
página»*.

### POR QUÉ ESTO ES DISTINTO DE TODO LO DEMÁS DE ESTE DOCUMENTO

El resto del documento es **interpretación de texto**: qué querrá decir
«masivas», si el capítulo XI es oponible, si el silencio autoriza. Son preguntas
discutibles, y en una de ellas yo me equivoqué.

El reCAPTCHA no es interpretable. Es el operador **ejecutando** una decisión:
*esta superficie es para personas*. No hay que inferirlo de un párrafo — está
implementado.

Y es inmune al argumento del volumen, que es justamente lo que lo vuelve
decisivo acá. **Un tope duro de dos consultas por corrida no ayuda en nada
contra una verificación anti-bot**: la valla no mide cuántas veces entras, mide
si eres una máquina. El invariante de volumen que pediste es una buena idea por
otras razones —y queda escrito en la sección 7— pero no habría resuelto esto.

### LO QUE ESTO NO DICE

Para no volver a interpretar a favor nuestro en la dirección contraria:

- **No dice que el acceso automatizado esté jurídicamente prohibido.** Un
  reCAPTCHA es una medida técnica, no una norma. Lo que dice es que el
  administrador puso una puerta.
- **No dice nada sobre el conjunto de datos abiertos**, que no tiene valla
  alguna y cuyo uso está expresamente autorizado. Lo que el radar hace hoy no
  se ve afectado.
- **No hace falta un abogado para esta parte.** Hace falta para el capítulo XI.

### Y POR ESO NO LO DISEÑO

Leer esa superficie de forma programada exige pasar la verificación en cada
corrida. No voy a construir eso, y no hay una variante del diseño que lo evite:
la valla está en la entrada del área pública, no en un formulario concreto —lo
confirmé también sobre el detalle de un proceso, no solo sobre el buscador—.

Lo digo como lo que es, un límite mío declarado por adelantado y no un juicio
sobre la decisión de ustedes: **no construyo elusión de verificaciones
anti-bot.** Si el camino que quieren seguir pasa por ahí, va a necesitar a
alguien más, y yo seguiría recomendando no hacerlo por la razón que ya dio
Giovanny sobre el raspado en general — se rompe en silencio.

---

## LOS CUATRO DOCUMENTOS QUE EXISTEN, Y CUÁL RIGE

| documento | código · versión | de qué sirve acá |
|---|---|---|
| **T&C de uso del SECOP II** (PDF del sitio oficial) | `CCE-GTI-IDI-05` · V.01 · 30-sep-2021 | **el único con texto sobre esto** |
| **T&C dentro de la plataforma** (lo que se acepta al crear cuenta) | Versión **7** · publicada **23-jul-2020** | **cero menciones**; es MÁS VIEJO que el PDF |
| **Política de T&C de las Plataformas Electrónicas** | `CCE-GTI-IDI-04` · V.01 · rige desde 10-nov-2021 | **nada**: es una meta-política |
| **T&C de uso del SECOP I** | sin código, en la misma página | **el más restrictivo**, pero es de SECOP **I** |

**Discrepancia que hay que saber:** el texto que un usuario acepta *dentro* de
la plataforma (`community.secop.gov.co`, verificado hoy) sigue siendo la
**Versión 7 de julio de 2020** —todavía pide Java y Flash Player— mientras el
PDF publicado en el sitio institucional es de **septiembre de 2021**. Los dos
están vivos y dicen cosas distintas. El párrafo que nos interesa está **solo en
el de 2021**.

A quién obliga, según el propio documento:

> «Son las reglas de funcionamiento y utilización del SECOP II contenidas en el
> presente documento y que vinculan a los Usuarios a cumplirlos y que son
> aceptados por los mismos **por el simple hecho de crear un usuario y/o cuenta
> en el SECOP II**.»

> «Usuario: Cualquier persona natural que utiliza el SECOP II como agente de una
> Entidad Compradora o **de un Proveedor**.»

Y en la sección II:

> «La ANCP-CCE recomienda a los Usuarios leer cuidadosamente los Términos y
> Condiciones de Uso antes de utilizar el SECOP II, pues **su uso implica la
> aceptación de estos**.»

**Esto nos aplica directamente.** NEG tiene cuenta de Proveedor en SECOP II —se
presenta a procesos—, así que no somos un tercero anónimo que pasa por un sitio
público: somos Usuarios vinculados por aceptación expresa. No se puede argumentar
que los términos no nos obligan.

---

## 1 · EL PÁRRAFO QUE SÍ HABLA DE ESTO

Capítulo **XIV. Ciberseguridad**, páginas 33–34 del PDF de 2021. Cita literal,
los dos párrafos completos:

> «La ANCP – CCE establece las herramientas necesarias para garantizar la
> disponibilidad de las plataformas, por ende, actualmente éstas cuentan con
> mecanismos de seguridad perimetral. A través de dicho mecanismo **se
> identifican desde que IP se generan consultas masivas de interacción no humana
> que atenta contra este principio de Seguridad de la Información**.»

> «Es importante recordar que en los casos que se detecte un **comportamiento
> anormal y de uso masivo de solicitudes, búsquedas, descargas, o a través de
> otras técnicas que puedan afectar el rendimiento y la disponibilidad del
> servicio de las plataformas, automáticamente se bloquea el acceso a las
> mismas**.»

Qué dice exactamente, y qué no:

- **No** aparece la palabra «prohibido». Tampoco «robot», «scraping»,
  «rastreador», «minería», ni «automatizado» en forma de prohibición. Lo
  verifiqué buscando cada una de esas palabras en las 38 páginas.
- **Sí** califica la conducta: *«consultas masivas de interacción no humana
  **que atenta contra** este principio de Seguridad de la Información»*. No es
  una descripción neutra de un mecanismo técnico — es un juicio sobre la
  conducta, escrito por el administrador de la plataforma en su documento
  normativo.
- **Sí** declara la consecuencia, y es automática: **bloqueo del acceso**.
- **No hay umbral numérico.** No dice cuántas solicitudes son «masivas» ni en
  qué ventana.

> **CORRECCIÓN (14-nov, tarde).** Acá yo había escrito que la indefinición
> «juega en contra de quien quiere planear, porque no existe un número por
> debajo del cual estemos seguros». Es un argumento débil y Giovanny lo
> desarmó: **el sujeto de la frase no es la cantidad indefinida, es el bien
> protegido**. El párrafo nombra lo que le importa —«que puedan **afectar el
> rendimiento y la disponibilidad del servicio** de las plataformas»— y eso sí
> es un criterio. **Dos consultas al día hábil no afectan el rendimiento de
> nada**, y sostener lo contrario era leer «no humana» como si fuera el
> calificativo cuando el calificativo es «masivas».
>
> Y de ahí se caía lo demás: también escribí que no afirmaría que el bloqueo
> perimetral «no conecta» con sanciones sobre la cuenta de Proveedor. Esa
> cautela se apoyaba en tratar nuestro volumen como potencialmente masivo. Sin
> esa premisa, **no hay nada que conectar**: el bloqueo es por IP y por carga,
> y las sanciones de cuenta del capítulo VII son por fraude de identidad y de
> ofertas. **Retiro esa reserva.**
>
> Lo que decide ya no es este capítulo, es el reCAPTCHA de la sección 0.

Y lo que viene **inmediatamente después**, en la misma sección, es la salida que
el documento ofrece — con lo cual queda claro que el párrafo anterior está
pensado para este caso:

> «Ahora bien, en ejercicio del derecho fundamental de acceso a la información,
> toda persona puede conocer sobre la existencia y acceder a la información
> pública […] Colombia Compra Eficiente ha implementado una **política de datos
> abiertos** que facilita el acceso de toda persona a la información en materia
> de contratación pública de manera gratuita.»

---

## 2 · LA CLÁUSULA QUE SÍ NOS PROHÍBE ALGO (y no es por robots)

Capítulo **XI. Derechos de Autor**, página 31. Es la que pesa más, y no habla de
automatización en absoluto:

> «Los derechos de autor y la propiedad intelectual sobre **la información**,
> infogramas e imágenes contenidas en la SECOP II, son propiedad exclusiva del
> Estado Colombiano y es operada y administrada por la ANCP-CCE.»

> «**Queda estrictamente prohibido** la utilización de elementos objeto de
> propiedad industrial e intelectual con cualquier tipo de finalidad, **en
> especial comercial**, así como su distribución, comunicación pública,
> modificación, alteración, transformación o descompilación, **salvo
> autorización expresa por escrito** por parte del titular de los mismos.»

Leído como está escrito: *la información contenida en SECOP II* es propiedad del
Estado, y su utilización **con finalidad comercial** —y su transformación— está
**estrictamente prohibida** sin autorización escrita.

El radar es una herramienta comercial: busca procesos a los que presentarnos.
Tomar esa información del portal y transformarla para un uso comercial es
exactamente lo que esta cláusula nombra. **No hay forma de leer esto a nuestro
favor.**

Hay una tensión real entre esta cláusula y (a) la Ley 1712 de 2014 de
transparencia, que el propio documento cita, y (b) la política de datos abiertos
de la sección XIV. **Resolver esa tensión es una pregunta de abogado, no mía**, y
la anoto como tal. Lo que no puedo hacer es usar la tensión como permiso.

---

## 3 · EN CAMBIO, LOS DATOS ABIERTOS SÍ ESTÁN AUTORIZADOS, Y EN ESTOS TÉRMINOS

El mismo capítulo XIV, páginas 34–35. Esto es lo que el radar usa hoy:

> «Los datos y la información publicados en este Portal de datos abiertos son
> públicos, por esta razón, **se podrá hacer uso, aprovechamiento y/o
> transformación de forma libre y sin restricciones**, para hacer aplicaciones
> por parte de terceros y contenidos de su propia creación. Para efectos de las
> presentes condiciones, se entiende por uso, aprovechamiento y/o transformación
> autorizada de los datos, las actividades tales como: **redistribución,
> compilación, extracción, copia, difusión, modificación y adaptación** de los
> datos.»

Con **dos obligaciones** que vale cumplir y que hoy no cumplimos del todo:

> «El usuario que haga uso, aprovechamiento y/o transformación, de los datos y/o
> de la información publicada en este Sitio Web **deberá hacer la cita textual:
> “Fuente: PORTAL DE DATOS ABIERTOS - SECOPII”, y mencionar la fecha de la
> última actualización de los datos** objeto del uso y/o transformación, cuando
> esta se encuentre incluida en el dato original.»

> «En cualquier caso, **está prohibido desnaturalizar el sentido** de los datos
> […] no deben alterarse ni suprimirse los metadatos sobre la fecha de
> actualización y las condiciones de uso.»

**Nota operativa que sale de esta lectura, y es accionable sin decidir nada
más:** el aviso de cobertura que el panel ya muestra —*«la cola llega hasta el
12 de noviembre»*— es justamente «mencionar la fecha de la última actualización
de los datos». Vamos en la dirección correcta. Lo que falta es **la cita
textual de la fuente**, que hoy no aparece en ninguna parte de la pantalla del
radar. Es una línea de texto.

Y añade el reparto de responsabilidad, que conviene saber:

> «La utilización de los conjuntos de datos se realizará por parte de los
> usuarios o agentes del uso y/o transformación, **bajo su propia cuenta y
> riesgo**, correspondiéndoles en exclusiva a ellos responder frente a terceros
> por daños o perjuicios de cualquier índole que pudieran derivarse de dicha
> utilización.»

---

## 4 · LO QUE NO DICE NINGÚN DOCUMENTO

Para que no haya duda de qué busqué y no encontré:

- **No existe un umbral** de solicitudes, ni por minuto ni por día.
- **No existe un canal para pedir autorización** de acceso automatizado. El
  documento no menciona a quién se le pediría, ni un formulario, ni un correo
  para eso. Lo único que ofrece es la Mesa de Servicio para soporte.
- **No existe una lista de usos prohibidos** que incluya la lectura
  automatizada. La única lista de conductas sancionadas del documento —el «uso
  indebido» del capítulo VII— es íntegramente sobre **fraude de identidad y de
  ofertas**, y está acotada expresamente «en el marco de la responsabilidad que
  implica el acceso al SECOP II **con usuario y contraseña**»: suplantación,
  presentar ofertas con documentos de otro, duplicar registros, entrar a una
  cuenta ajena. Nada sobre leer.
- **No hay `robots.txt` en el portal.** `community.secop.gov.co/robots.txt` no
  devuelve un archivo de robots: devuelve una página HTML —verificado hoy—. Es
  decir, **no hay política de rastreo legible por máquina**. (El `robots.txt`
  de `www.colombiacompra.gov.co` sí existe, es un WordPress estándar que solo
  excluye `/wp-admin/`, y no cubre el portal transaccional.)

  **Matiz que agrego tras el hallazgo de la sección 0, y que corrige el peso de
  esta viñeta:** la ausencia de `robots.txt` no significa que no haya señal
  técnica. **Hay una, y es más fuerte que un `robots.txt`**: un `robots.txt` es
  una petición que el cliente decide respetar; un reCAPTCHA es una puerta que
  el servidor cierra. Yo había presentado la ausencia del archivo como «cero
  señal legible por máquina», y era falso — solo había buscado la señal en el
  lugar equivocado.
- **La licencia de uso es acotada**, capítulo VIII: *«Colombia Compra Eficiente
  concede temporalmente a los Usuarios una licencia intransferible y no
  exclusiva de uso del SECOP II, **únicamente bajo los términos y condiciones
  que se indican en el presente documento**.»* Nada se concede por fuera del
  documento, así que el silencio **no** opera como permiso.

---

## 5 · LA POLÍTICA APARTE QUE PREGUNTASTE

Sí existe, es un documento propio y **no agrega nada** sobre esto:

**Política de Términos y Condiciones de las Plataformas Electrónicas de Compra y
Contratación Pública y Portal Web** — `CCE-GTI-IDI-04`, V.01, 30-sep-2021, rige
desde el 10-nov-2021, 17 páginas. Busqué las mismas palabras: **cero
coincidencias** con robots, automatización, scraping, consultas masivas,
rastreo, minería o bloqueo.

Es una **meta-política**: dice que deben existir unos términos y condiciones y
que hay que respetarlos. Su capítulo operativo completo son dos lineamientos:

> «1. Todas las personas que hagan uso de las plataformas de compra y
> contratación pública y del Portal Web, deben conocer y respetar los Términos
> de Condiciones de Uso.»

> «2. La ANCP-CCE revisará, actualizará, publicará y divulgará la política de
> uso términos y condiciones […] en la medida que se generen cambios o mejoras
> en el uso de las herramientas.»

Y en «Cumplimiento y acceso»:

> «La ANCP-CCE **obliga a todos los usuarios** de las plataformas de compra y
> contratación pública y del Portal Web, **a aceptar los términos y condiciones
> de uso** y el cumplimiento de los mismos.»

O sea: la política aparte **remite** a los T&C. No hay una segunda fuente de
reglas; hay una que ordena cumplir la primera.

---

## 6 · UN DATO QUE NO PEDISTE PERO ES DEL MISMO ASUNTO

En la misma página oficial están los **T&C de uso del SECOP I**, un texto
distinto y sin código de documento. Su cláusula de copyright es **la más
restrictiva de todas las que leí**:

> «Los contenidos de este sitio web, incluyendo los textos, gráficos y sonidos
> son de su propiedad o de la Entidad Estatal que los produce según el tipo de
> información, y **no se podrán copiar, distribuir, transmitir –sin importar el
> medio– o citar sin el consentimiento previo y escrito**.»

> «Los usuarios pueden recuperar, exhibir, imprimir, copiar o descargar
> cualquier material de este sitio **para su uso personal únicamente**.»

> «Los usuarios **no pueden reproducir, modificar o explotar comercialmente** el
> material contenido en este sitio.»

> «**Nadie está autorizado a establecer vínculos a este sitio** sin nuestro
> consentimiento previo por escrito.»

Lo traigo por dos razones. Una: **rige SECOP I, no SECOP II** — no se puede
citar como si aplicara a lo nuestro, y eso corta en las dos direcciones. Dos:
muestra que **cuando esta entidad quiere prohibir, sabe escribirlo** («no se
podrán», «únicamente», «no pueden»). La ausencia de ese lenguaje respecto del
acceso automatizado en SECOP II es significativa — pero significa que no lo
prohibieron expresamente, **no** que lo permitieran.

---

## 7 · LOS DOS RESGUARDOS QUE PEDISTE, ESPECIFICADOS

Los pediste «primero en el diseño» del raspador. Ese raspador no se diseña (ver
sección 0), pero **los dos resguardos no se van con él**: valen para cualquier
fuente más oportuna que agreguemos algún día — la que Colombia Compra
autorice, un endpoint OCDS si aparece, o una frecuencia distinta del conjunto
abierto. Quedan escritos acá para que el día que haya una fuente estén listos y
nadie los re-derive.

Los dejo **especificados y sin implementar**. Un tope sobre una fuente que no
existe es código muerto, y un interruptor que no apaga nada es peor que no
tenerlo: parece un control.

### 7.1 · El volumen como INVARIANTE, no como consecuencia

Tu formulación, que es la correcta y es la razón de que esto sea una constante
y no un efecto del código: **«el permiso se apoya en no ser masivo; si esto
crece, el permiso ya no cubre.»**

Hoy el volumen del radar es una *consecuencia*: dos corridas al día, cada una
con un `count(1)` y una o dos páginas, porque así quedó. Nadie lo decidió como
límite. Eso significa que el día que alguien agregue una modalidad, un
departamento o una tercera corrida, el volumen crece **sin que nada se
oponga**, y el argumento que sostiene nuestro permiso se debilita sin que nadie
se entere. Es exactamente el patrón que esta bitácora lleva registrado: un
límite real que no está escrito en ninguna parte.

Forma concreta, en el codebase del radar:

```ts
/**
 * TOPE DURO de peticiones a la fuente por corrida.
 *
 * ── POR QUÉ ES UN INVARIANTE Y NO UN NÚMERO DE CONFIGURACIÓN ────────────────
 *
 * El permiso con que leemos esta fuente se apoya en NO SER MASIVO: el capítulo
 * XIV de los T&C del SECOP II protege «el rendimiento y la disponibilidad del
 * servicio», y nuestro argumento es que dos consultas al día hábil no lo
 * afectan. Ese argumento es una afirmación sobre el VOLUMEN.
 *
 * Si el volumen crece, el argumento deja de ser cierto y EL PERMISO YA NO
 * CUBRE — sin que nada falle, sin que nadie reciba un error, y sin que la
 * persona que agregó una modalidad más sepa que movió esa frontera.
 *
 * Por eso es un tope que ABORTA la corrida, no un objetivo que se degrada: una
 * corrida que no trae nada se ve (el panel declara su cobertura); una que
 * triplicó su huella sin avisar, no.
 *
 * Cambiarlo es una DECISIÓN, no un ajuste: hay que editar esta línea, y el
 * test de abajo obliga a explicar por qué.
 */
const TOPE_PETICIONES_POR_CORRIDA = 12
```

Tres propiedades que lo hacen un invariante de verdad y no un comentario:

1. **Aborta, no recorta.** Al pasarse, la corrida lanza y no escribe. Degradar
   silenciosamente —traer menos y seguir— convertiría el tope en una cuota, y
   una cuota se normaliza.
2. **Cuenta en un solo lugar.** Un contador que envuelve la función de red
   (`traer()` en `functions-radar/src/index.ts`), no uno por cada sitio que
   consulta. Si hay dos contadores, el día que alguien agregue una ruta nueva
   el tope no la ve.
3. **El test fija el NÚMERO, no solo la existencia.** Esto es lo que aprendimos
   hoy con `toMatchObject` (ver `HALLAZGOS_AUDITORIA.md`): un test que
   comprueba «hay un tope» pasa con el tope en 10.000.

```ts
it('CLAVE: el tope de peticiones por corrida es 12, y moverlo es una decisión', () => {
  // No comprueba «que haya un tope»: comprueba el NÚMERO. Si alguien lo sube,
  // este test falla y tiene que venir acá a escribir por qué — que es
  // exactamente el momento en que hay que pensarlo.
  //
  // El permiso se apoya en no ser masivo. 12 por corrida × 2 corridas = 24
  // peticiones por día hábil. Si esto crece, el permiso ya no cubre.
  expect(TOPE_PETICIONES_POR_CORRIDA).toBe(12)
})

it('al pasarse el tope la corrida ABORTA y no escribe nada', () => { /* … */ })
```

**De dónde sale el 12**, porque un número sin origen es un número que alguien
sube sin pensar: la corrida de hoy hace **1** `count(1)` + **1 o 2** páginas por
cada combinación de modalidad que consulta. Con las cuatro modalidades actuales
el peor caso medido está en **6 a 8 peticiones**. 12 deja margen para una
modalidad más sin tocar la línea, y se queda **muy por debajo** de cualquier
cosa que pudiera llamarse masiva. No es un número redondo a propósito: un 10 o
un 20 parecen elegidos por estética.

### 7.2 · El interruptor, sin despliegue

Tu razón: **«si la respuesta de Colombia Compra es que no, se apaga esa
tarde.»** Un apagado que exige un despliegue no sirve para eso — el despliegue
del radar hoy pasa por `scripts/deploy-funciones.ps1`, exige `main` limpio y es
un acto de varios minutos con sesión de persona.

**Medido antes de pedir permiso**, como quedó de criterio la semana pasada:

> `firestore.rules:1649` — `match /configuracion/{docId}` ya da
> `allow read: if accesoSIGP()` y `allow create, update: if isAuthed() &&
> rolActual() in ['gerencia_general', 'admin']`.

Un doc nuevo **`configuracion/radar_portal`** queda cubierto por ese match
genérico. **No hace falta tocar `firestore.rules`**, así que no hay nada que
coordinar con los otros frentes ni OK de despliegue de reglas que pedir. La
Cloud Function lo lee con Admin SDK, que omite las reglas; el panel lo leería
con `accesoSIGP()` si algún día queremos mostrar el estado.

```
configuracion/radar_portal
  activo: boolean          ← false apaga la fuente en la corrida siguiente
  motivo: string           ← por qué se apagó; va al log, no es decorativo
  apagado_por: string      ← uid
  apagado_en: Timestamp
```

Cuatro propiedades, y las cuatro importan:

1. **Se lee en CADA corrida**, antes de la primera petición. No al arrancar la
   función: una instancia caliente puede vivir horas, y «se apaga esa tarde»
   dejaría de ser cierto.
2. **Ausente o ilegible ⇒ APAGADO.** Es la decisión importante y va contra la
   intuición. Si el doc no existe, o la lectura falla, la fuente **no corre**.
   Un interruptor que se queda encendido cuando no puede leerse a sí mismo no
   es un interruptor, es un adorno — y el escenario para el que existe es
   precisamente «Colombia Compra dijo no», donde el costo de no apagar es
   altísimo y el de no correr es cero.
3. **No toca el conjunto de datos abiertos.** El interruptor apaga **la fuente
   nueva**, nunca la autorizada. El radar sigue corriendo con datos abiertos
   como siempre — que es lo que significa «nunca fuente principal».
4. **Lo apaga `gerencia_general` o `admin`** por la regla que ya existe. No
   hace falta que sea quien despliega.

Y una línea en el log de la corrida: `fuente_portal: apagada (motivo: …)`. Un
apagado que no se ve en el log es un apagado que alguien va a confundir con una
falla.

---

## RESUMEN PARA DECIDIR

| pregunta | respuesta |
|---|---|
| ¿Prohíben el acceso automatizado con esas palabras? | **No.** Ninguna de las 38 páginas usa «prohibido» para esto. |
| ¿Lo autorizan? | **No.** Y el capítulo VIII dice que solo se concede lo que el documento concede. |
| ¿No dicen nada? | **Tampoco.** Llaman al acceso automatizado **masivo** conducta «que atenta contra el principio de Seguridad de la Información» y declaran bloqueo automático de la IP. |
| ¿Nos alcanza ese párrafo con dos consultas al día? | **No.** Protege «el rendimiento y la disponibilidad del servicio», y dos consultas no lo afectan. **Corregido**: mi primera lectura decía otra cosa y era débil. |
| ¿Entonces qué lo impide? | **Un reCAPTCHA de Google en la entrada del área pública** del portal. Verificado el 14-nov. No es un control de volumen: dispara en la primera petición. |
| ¿Hay algo que sí nos prohíba? | **Sí, y es lo más grave:** el capítulo XI prohíbe «estrictamente» el uso con finalidad comercial y la transformación de la información de SECOP II sin autorización escrita. No habla de robots: habla de para qué la usamos. |
| ¿Hay una vía autorizada? | **Sí:** los datos abiertos, «de forma libre y sin restricciones», con cita de fuente y fecha de actualización. Es la que el radar ya usa. |
| ¿Hay canal para pedir permiso? | **No documentado.** No hay a quién pedírselo según el texto. |
| ¿Hay `robots.txt`? | **No** en el portal transaccional — pero la señal técnica existe y es más fuerte: la valla. Un `robots.txt` se respeta por cortesía; un reCAPTCHA cierra la puerta. |

### LO QUE YO NO PUEDO RESPONDER

Queda **una** sola, y es la que importa:

- Si la cláusula XI es **oponible** frente a la Ley 1712 de 2014 y al derecho de
  acceso a la información pública que el propio documento invoca. Es una
  pregunta de abogado, y es la pregunta 4 de la consulta a la Mesa de Servicio.

**Las otras dos que había listado quedan retiradas**, y conviene decir por qué
en vez de borrarlas:

- *«Si nuestro volumen caería en masivo»* — ya no es una duda. Dos consultas al
  día hábil no afectan el rendimiento ni la disponibilidad de nada. El umbral no
  está publicado, pero el **bien protegido** sí está nombrado en el párrafo, y
  eso alcanza para responder. Lo tenía como pregunta abierta porque leí mal el
  calificativo.
- *«Si el bloqueo por IP tocaría nuestra cuenta de Proveedor»* — se apoyaba
  enteramente en la duda anterior. Sin ella **no hay nada que conectar**: el
  bloqueo es perimetral y por carga; las sanciones de cuenta del capítulo VII
  son por fraude de identidad y de ofertas, y su propio texto las acota al
  acceso «con usuario y contraseña». Retirada.

### LO ÚNICO QUE SÍ RECOMIENDO, Y NO DEPENDE DE LA DECISIÓN

Agregar la **cita de fuente** del portal de datos abiertos en la pantalla del
radar. Es una obligación expresa del texto que nos autoriza a usar esos datos, y
hoy no la cumplimos. La fecha de actualización ya la mostramos desde el
`avisoDeCobertura`; falta la línea *«Fuente: PORTAL DE DATOS ABIERTOS -
SECOPII»*. Es una línea de texto, y nos pone en regla con el único documento que
nos da permiso para algo.

---

## FUENTES, verificadas el 14-nov-2026

- Página oficial de términos:
  <https://www.colombiacompra.gov.co/terminos-condiciones>
  (última actualización que ella misma declara: 04-ago-2026)
- **T&C SECOP II** (PDF, 38 pp., `CCE-GTI-IDI-05` V.01 30-sep-2021) —
  descargado del enlace que esa página ofrece:
  `…/wp-content/uploads/2024/10/cce-gti-idi-05_terminos_y_condiciones_de_uso_del_sistema_electronico_de_contratacion_publica_-_secop_ii_19-11-2021.pdf`
- **Política de T&C de las Plataformas** (PDF, 17 pp., `CCE-GTI-IDI-04` V.01):
  `…/wp-content/uploads/2024/10/cce-gti-idi-04_politica_de_terminos_y_condiciones_de_las_plataformas_electronicas_de_compra_y_contratacion_publica_portal_web_19-11-2021_1.pdf`
- **T&C dentro de la plataforma** (producción, Versión 7 · 23-jul-2020):
  `https://community.secop.gov.co/Public/Administration/TermsOfUseVersionDisplay/Public?LatestUserTermsOfUse=true&SkinName=CCE&currentLanguage=es-CO`
- `robots.txt`: `community.secop.gov.co/robots.txt` (devuelve HTML, no un
  archivo de robots) y `www.colombiacompra.gov.co/robots.txt` (WordPress
  estándar).
- **El muro de reCAPTCHA** (sección 0), verificado con **4 peticiones en
  total** al portal — dos a `/Public/Tendering/ContractNoticeManagement/Index`
  con distintos parámetros, una a `/Public/Tendering/OpportunityDetail/Index` y
  una de control. Las tres rutas públicas redirigen a
  `/Public/Common/GoogleReCaptcha/Index`. No se intentó pasar la validación.
- **La consulta a la Mesa de Servicio**, lista para enviar:
  [`consulta-colombia-compra-acceso.md`](consulta-colombia-compra-acceso.md).
