# ¿Permite SECOP II el acceso automatizado? Lo que dicen los términos

*Lectura del 14-nov-2026. **No** es asesoría jurídica: es la transcripción de lo
que los documentos dicen, con la cita literal de cada cosa, para que la decisión
se tome sobre el texto y no sobre un resumen.*

---

## LA RESPUESTA, EN UNA LÍNEA

**No lo prohíbe con esas palabras, no lo autoriza, y no guarda silencio.** Hay
un párrafo que **califica** el acceso automatizado masivo como conducta que
*«atenta contra el principio de Seguridad de la Información»* y declara que se
bloquea automáticamente. Eso no es ninguna de las tres opciones limpias: es una
cuarta.

Y hay una cláusula aparte —la de derechos de autor— que, **leída literalmente,
sí nos prohíbe lo que queríamos hacer**, por una razón que no tiene que ver con
robots.

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
- **No hay umbral.** No dice cuántas solicitudes son «masivas» ni en qué
  ventana de tiempo. Quien define si nuestro volumen cae ahí es el mecanismo
  perimetral de ellos, no nosotros. Esa indefinición juega en contra de quien
  quiere planear: no existe un número por debajo del cual estemos seguros.

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
  devuelve un archivo de robots: devuelve una página HTML de inicio de sesión
  —verificado hoy—. Es decir, **no hay política de rastreo legible por máquina,
  ni permisiva ni restrictiva**. (El `robots.txt` de
  `www.colombiacompra.gov.co` sí existe, es un WordPress estándar que solo
  excluye `/wp-admin/`, y no cubre el portal transaccional.)
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

## RESUMEN PARA DECIDIR

| pregunta | respuesta |
|---|---|
| ¿Prohíben el acceso automatizado con esas palabras? | **No.** Ninguna de las 38 páginas usa «prohibido» para esto. |
| ¿Lo autorizan? | **No.** Y el capítulo VIII dice que solo se concede lo que el documento concede. |
| ¿No dicen nada? | **Tampoco.** Lo llaman conducta «que atenta contra el principio de Seguridad de la Información» y declaran bloqueo automático de la IP. |
| ¿Hay algo que sí nos prohíba? | **Sí, y es lo más grave:** el capítulo XI prohíbe «estrictamente» el uso con finalidad comercial y la transformación de la información de SECOP II sin autorización escrita. No habla de robots: habla de para qué la usamos. |
| ¿Hay una vía autorizada? | **Sí:** los datos abiertos, «de forma libre y sin restricciones», con cita de fuente y fecha de actualización. Es la que el radar ya usa. |
| ¿Hay canal para pedir permiso? | **No documentado.** No hay a quién pedírselo según el texto. |
| ¿Hay `robots.txt`? | **No** en el portal transaccional. Ninguna señal legible por máquina. |

### LO QUE YO NO PUEDO RESPONDER

- Si la cláusula XI es **oponible** frente a la Ley 1712 de 2014 y al derecho de
  acceso a la información pública que el propio documento invoca. Es una
  pregunta de abogado.
- Si nuestro volumen caería en «masivo». No hay umbral publicado.
- Si el bloqueo por IP tendría consecuencias sobre **nuestra cuenta de
  Proveedor**. El documento no conecta las dos cosas —el bloqueo es perimetral
  por IP, las sanciones de cuenta son por fraude—, pero tampoco las separa, y no
  voy a afirmar que no las conecta.

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
- `robots.txt`: `community.secop.gov.co/robots.txt` (devuelve HTML de login) y
  `www.colombiacompra.gov.co/robots.txt` (WordPress estándar).
