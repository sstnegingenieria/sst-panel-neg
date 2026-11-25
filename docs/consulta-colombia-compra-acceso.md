# Consulta a la Mesa de Servicio de Colombia Compra

*Borrador para que Giovanny envíe. Preparado el 14-nov-2026.*

**Canal:** `soporte@colombiacompra.gov.co` · formulario en
<https://www.colombiacompra.gov.co/soporte> · 018000-52-0808 (L–V 7:00 a.m. a
7:00 p.m.).

**Cómo usarla:** está escrita para describir lo que hacemos y preguntar si es
admisible — no para pedir un permiso vago. Si pide un permiso vago, la respuesta
probable es un «no» genérico o el silencio; si describe el volumen exacto y el
propósito, la respuesta sirve para decidir. Giovanny: revisa el cargo con que
firmas y el NIT antes de enviar.

---

## ASUNTO

Consulta sobre acceso oportuno a la información de procesos publicados en SECOP
II — proveedor registrado

---

## CUERPO

Señores
**Agencia Nacional de Contratación Pública – Colombia Compra Eficiente**
Mesa de Servicio

Cordial saludo.

**NEG INGENIERÍA S.A.S. BIC**, NIT 900.975.870-1, proveedor registrado en SECOP
II, se dirige a ustedes para consultar sobre el acceso oportuno a la información
de procesos de contratación publicados en la plataforma.

### 1. Qué hacemos hoy

Usamos el **portal de datos abiertos** de SECOP II —el conjunto
`p6dx-8zbt` en datos.gov.co— para identificar procesos a los que podemos
presentarnos. Consultamos **dos veces al día hábil** (6:30 a.m. y 2:00 p.m.,
hora de Bogotá), con un filtro acotado a:

- **Modalidades:** mínima cuantía, selección abreviada de menor cuantía y
  contratación de régimen especial (con ofertas).
- **Territorio:** Bogotá D.C. y Cundinamarca.
- **Ventana:** procesos publicados en los últimos días.

Cada consulta es un conteo y una o dos páginas de resultados. El uso es
**estrictamente interno**: la información alimenta una bandeja de trabajo de
nuestro equipo para decidir a qué procesos presentarnos. **No la
redistribuimos, no la revendemos, no la publicamos** ni la ofrecemos a
terceros. Citamos la fuente conforme a las condiciones del portal de datos
abiertos.

### 2. El problema que encontramos

Medimos el conjunto de datos abiertos y encontramos que **la información de un
proceso aparece allí aproximadamente dos días después de su publicación en el
portal**. Por ejemplo, el 14 de noviembre de 2026 el conjunto no tenía ninguna
fila publicada el 13 —un viernes hábil— y tenía 30 del 12, frente a las 108 a
144 que un día hábil normal trae en el territorio y las modalidades que
consultamos.

Ese retraso tiene una consecuencia concreta para nosotros. En una mínima
cuantía el plazo para presentar oferta es de pocos días hábiles: **dos días de
retraso nos dejan por fuera de cerca del 11 % de los procesos** para los que
estaríamos habilitados, porque cuando los vemos ya no alcanzamos a preparar la
propuesta. No es un problema de la plataforma ni de la calidad del dato: es el
tiempo que toma la información en llegar al conjunto abierto.

### 3. Lo que preguntamos

Agradecemos su concepto sobre los siguientes puntos:

1. **¿Existe un canal autorizado para acceder de manera oportuna a la
   información de procesos publicados?** Por ejemplo un API, un servicio de
   notificación o suscripción, un endpoint OCDS, o una frecuencia de
   actualización distinta del conjunto de datos abiertos. Revisamos el manual
   M-MUDA-02 y la sección de datos abiertos del portal y no encontramos uno
   documentado.

2. **¿Es previsible que el retraso de incorporación al conjunto de datos
   abiertos se reduzca?** Si existe un plazo esperado de publicación, conocerlo
   nos permite planear.

3. **¿Es admisible consultar de forma programada el área pública del portal
   transaccional, con el volumen descrito en el punto 1?** Preguntamos porque
   observamos que el área pública de `community.secop.gov.co` está protegida por
   una **validación reCAPTCHA** a la entrada, y entendemos esa validación como
   una indicación de que esa superficie está prevista para consulta humana. **No
   hemos intentado eludirla ni lo haremos.** Si la lectura programada de esa
   área no es admisible, nos basta con que nos lo confirmen y seguiremos
   usando únicamente el portal de datos abiertos.

4. **¿El uso interno que describimos en el punto 1 es compatible con el
   capítulo XI de los Términos y Condiciones de Uso del SECOP II**
   (`CCE-GTI-IDI-05`), que prohíbe la utilización de la información de la
   plataforma «con cualquier tipo de finalidad, en especial comercial» sin
   autorización expresa por escrito? Entendemos que la política de datos
   abiertos del capítulo XIV autoriza el uso y la transformación «de forma
   libre y sin restricciones», y queremos confirmar que un uso interno como el
   nuestro —identificar procesos a los que presentarnos, sin redistribuir la
   información— queda cubierto por esa autorización. Si requiere una
   autorización escrita, les solicitamos indicarnos el trámite.

### 4. Nuestro compromiso

Cualquiera sea su respuesta, **la acataremos**. Si nos indican que alguna de
estas prácticas no es admisible, la suspendemos. Preferimos preguntar antes y
operar con certeza, que asumir que el silencio de un documento equivale a un
permiso.

Quedamos atentos.

Cordialmente,

**Giovanny Montes**
NEG Ingeniería S.A.S. BIC
NIT 900.975.870-1
giovanny.montes@negingenieria.com

---

## NOTAS PARA GIOVANNY (no enviar)

- **Las cuatro preguntas son distintas a propósito.** La 1 y la 2 son las que
  pueden resolver el problema de raíz. La 3 cierra la duda del portal. La 4 es
  la que un abogado querría por escrito, porque el capítulo XI es la cláusula
  que más nos aprieta y hoy la tenemos en contra si se lee literalmente.
- **El punto 4 asume el riesgo de que digan «sí requiere autorización».** Vale
  correrlo: si la respuesta es que el uso interno está cubierto, queda por
  escrito y deja de ser una pregunta abierta sobre la que alguien tenga que
  volver a decidir. Si quieres evitar ese riesgo, el punto 4 es el único que se
  puede quitar sin desarmar la consulta.
- **El punto 3 declara que no eludimos el reCAPTCHA.** Está escrito así a
  propósito: es cierto, y es lo que convierte la consulta en una pregunta de
  buena fe y no en un aviso de lo que vamos a hacer igual.
- **El 11 % está medido**, con tres salvedades anotadas en
  `HALLAZGOS_AUDITORIA.md` (no conté festivos, supuse un retraso parejo de dos
  días, y una modalidad quedó fuera de los scripts por un error de
  transcripción). Si en la respuesta alguien pide la metodología, está ahí.
- **Si responden con un «no» general sin tocar la pregunta 1**, vale repreguntar
  solo eso: lo que de verdad necesitamos no es permiso para raspar, es una
  fuente más oportuna.
